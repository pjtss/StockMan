import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalRssPoller } from "./local-rss-poller.mjs";
import { validateCodexAnalysis } from "../lib/local-rss-watch/analysis-contract.mjs";
import { enqueueCodexAnalysis } from "../lib/local-rss-watch/analysis-inbox.mjs";

const dirs: string[] = [];
function tempDir() { const path = mkdtempSync(join(tmpdir(), "stockman-rss-watch-")); dirs.push(path); return path; }
afterEach(() => { for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

function rss(title: string, id = "item-1") {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>test</title><item><title>${title}</title><link>https://example.com/${id}</link><guid>${id}</guid><pubDate>Sat, 26 Sep 2026 01:00:00 GMT</pubDate><description>summary, with &amp; characters</description></item></channel></rss>`;
}

describe("local original RSS poller", () => {
  it("baselines the first direct-source poll and only appends later unseen rows to CSV", async () => {
    const outputDir = tempDir();
    let count = 0;
    const fetchImpl = vi.fn(async () => new Response(rss(count++ === 0 ? "existing headline" : "new headline", count < 2 ? "item-1" : "item-2"), { status: 200 }));
    const poller = createLocalRssPoller({ outputDir, fetchImpl, feeds: [{ source: "STOCKTITAN", url: "https://www.stocktitan.net/rss" }] });

    const baseline = await poller.pollOnce();
    expect(baseline.newCount).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith("https://www.stocktitan.net/rss", expect.objectContaining({ cache: "no-store" }));
    const next = await poller.pollOnce();
    expect(next.newCount).toBe(1);
    const csv = readFileSync(poller.csvPath, "utf8");
    expect(csv).toContain("new headline");
    expect(csv).not.toContain("existing headline");
    expect(csv).toContain("PENDING_ANALYSIS");
    expect(poller.pending()).toHaveLength(1);
    const itemId = poller.pending()[0].item_id;
    poller.recordAnalysis(itemId, { decision: "POSITIVE", ticker: "NVDA", catalyst: "계약", analysis_ko: "근거 기반", evidence: "contract signed", risks: "조건 확인", confidence: "MEDIUM" });
    expect(poller.pending()).toHaveLength(0);
    expect(readFileSync(poller.csvPath, "utf8")).toContain("ANALYZED");
    expect((await poller.pollOnce()).newCount).toBe(0);
    expect(readFileSync(poller.csvPath, "utf8").match(/item-2/g)).toHaveLength(1);
  });

  it("explicitly queues current baseline items as labeled backfill and keeps the operation idempotent", async () => {
    const outputDir = tempDir();
    const fetchImpl = vi.fn(async () => new Response(rss("baseline headline", "baseline-item"), { status: 200 }));
    const poller = createLocalRssPoller({ outputDir, fetchImpl, feeds: [{ source: "STOCKTITAN", url: "https://www.stocktitan.net/rss" }] });

    expect((await poller.pollOnce()).newCount).toBe(0);
    const backfill = await poller.backfillCurrent();
    expect(backfill).toMatchObject({ ok: true, backfill: true, newCount: 1, feeds: [{ source: "STOCKTITAN", newItems: 1 }] });
    expect(poller.pending()).toMatchObject([{ title: "baseline headline", collection_mode: "INITIAL_BACKFILL", status: "PENDING_ANALYSIS" }]);
    expect((await poller.backfillCurrent()).newCount).toBe(0);
    expect((await poller.pollOnce()).newCount).toBe(0);
  });

  it("does not mark a failed source initialized and requires SEC_USER_AGENT", async () => {
    const outputDir = tempDir();
    const oldAgent = process.env.SEC_USER_AGENT;
    delete process.env.SEC_USER_AGENT;
    const log = vi.fn();
    try {
      const poller = createLocalRssPoller({ outputDir, log, feeds: [{ source: "SEC_EDGAR", url: "https://www.sec.gov/feed" }] });
      const result = await poller.pollOnce();
      expect(result.ok).toBe(false);
      expect(result.failedSources).toEqual(["SEC_EDGAR"]);
      expect(result.errors).toEqual([{ source: "SEC_EDGAR", message: expect.stringContaining("SEC_USER_AGENT") }]);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("SEC_USER_AGENT"));
      expect(existsSync(poller.statePath)).toBe(false);
    } finally {
      if (oldAgent !== undefined) process.env.SEC_USER_AGENT = oldAgent;
    }
  });

  it("starts all source GETs concurrently and persists their results without overlap", async () => {
    const outputDir = tempDir();
    const oldAgent = process.env.SEC_USER_AGENT;
    process.env.SEC_USER_AGENT = "StockMan local polling test test@example.com";
    const resolvers: Array<(response: Response) => void> = [];
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
      resolvers.push(resolve);
      if (resolvers.length === 2) {
        resolvers.forEach((finish, index) => finish(new Response(rss(`baseline ${index}`, `item-${index}`), { status: 200 })));
      }
    }));
    const poller = createLocalRssPoller({
      outputDir,
      fetchImpl,
      feeds: [
        { source: "STOCKTITAN", url: "https://www.stocktitan.net/rss" },
        { source: "SEC_EDGAR", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=100&output=atom" },
      ],
    });

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        poller.pollOnce(),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("source fetches did not run concurrently")), 2_000); }),
      ]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(resolvers).toHaveLength(2);
      expect(result.failedSources).toEqual([]);
      expect(result.feeds.map((feed) => feed.source)).toEqual(["STOCKTITAN", "SEC_EDGAR"]);
    } finally {
      if (timeout) clearTimeout(timeout);
      if (oldAgent === undefined) delete process.env.SEC_USER_AGENT;
      else process.env.SEC_USER_AGENT = oldAgent;
    }
  });

  it("applies Codex workspace inbox results into the Downloads CSV from the local watcher", async () => {
    const outputDir = tempDir();
    const inboxDir = tempDir();
    let requestCount = 0;
    const fetchImpl = vi.fn(async () => new Response(rss("headline", requestCount++ === 0 ? "item-old" : "item-new"), { status: 200 }));
    const poller = createLocalRssPoller({ outputDir, analysisInboxDir: inboxDir, fetchImpl, feeds: [{ source: "STOCKTITAN", url: "https://www.stocktitan.net/rss" }] });
    await poller.pollOnce();
    await poller.pollOnce();
    const pending = poller.pending()[0];
    expect(pending.status).toBe("PENDING_ANALYSIS");
    enqueueCodexAnalysis({ itemId: pending.item_id, directory: inboxDir, result: { decision: "POSITIVE", ticker: "NVDA", catalyst: "계약 체결", analysis_ko: "원문 근거를 확인함", evidence: "signed contract", risks: "closing conditions", confidence: "MEDIUM" } });

    const result = await poller.pollOnce();
    expect(result.analysisHandoff).toMatchObject({ applied: 1, failed: 0 });
    expect(poller.pending()).toEqual([]);
    expect(readFileSync(poller.csvPath, "utf8")).toContain("ANALYZED");
    expect(readFileSync(poller.csvPath, "utf8")).toContain("원문 근거를 확인함");
  });

  it("backs off only a rate-limited source until Retry-After while continuing the polling loop", async () => {
    const outputDir = tempDir();
    let clock = new Date("2026-09-27T00:00:00Z");
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("limited", { status: 429, headers: { "retry-after": "20" } }))
      .mockResolvedValueOnce(new Response(rss("headline", "item-after-limit"), { status: 200 }));
    const log = vi.fn();
    const poller = createLocalRssPoller({
      outputDir,
      now: () => clock,
      fetchImpl,
      log,
      feeds: [{ source: "STOCKTITAN", url: "https://www.stocktitan.net/rss" }],
    });
    const limited = await poller.pollOnce();
    expect(limited.failedSources).toEqual(["STOCKTITAN"]);
    expect(limited.errors[0].message).toContain("HTTP 429");

    clock = new Date(clock.getTime() + 10_000);
    const deferred = await poller.pollOnce();
    expect(deferred.deferredSources).toEqual([{ source: "STOCKTITAN", retryInMs: 10_000 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    clock = new Date(clock.getTime() + 10_000);
    const recovered = await poller.pollOnce();
    expect(recovered.failedSources).toEqual([]);
    expect(recovered.feeds[0]).toMatchObject({ source: "STOCKTITAN", feedItems: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("해당 출처 요청만 보류"));
  });

});
