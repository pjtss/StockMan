import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalRssWatchStore, csvCell, parseCsvLine } from "./local-store.mjs";

const directories: string[] = [];
function makeStore() {
  const outputDir = mkdtempSync(join(tmpdir(), "stockman-rss-store-"));
  directories.push(outputDir);
  return createLocalRssWatchStore({ outputDir });
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

const item = (id: string, title = id) => ({ id, title, link: `https://example.test/${id}`, publishedAt: "2026-09-27T00:00:00Z", summary: "summary, with comma" });

describe("local RSS dedupe and queue persistence module", () => {
  it("uses first successful source batch as baseline and queues later unseen items once", () => {
    const store = makeStore();
    expect(store.ingestFeed("STOCKTITAN", [item("old")], "2026-09-27T00:00:00Z")).toMatchObject({ baseline: true, newItems: 0 });
    expect(store.pending()).toEqual([]);
    expect(store.ingestFeed("STOCKTITAN", [item("new"), item("old")], "2026-09-27T00:00:10Z")).toMatchObject({ baseline: false, feedItems: 2, newItems: 1 });
    expect(store.pending()).toHaveLength(1);
    expect(store.ingestFeed("STOCKTITAN", [item("new")], "2026-09-27T00:00:20Z").newItems).toBe(0);
    expect(store.pending()).toHaveLength(1);
  });

  it("baselines sources independently and persists restart-safe dedupe state", () => {
    const first = makeStore();
    first.ingestFeed("STOCKTITAN", [item("s1")], "2026-09-27T00:00:00Z");
    first.ingestFeed("SEC_EDGAR", [item("e1")], "2026-09-27T00:00:00Z");
    first.ingestFeed("SEC_EDGAR", [item("e2"), item("e1")], "2026-09-27T00:00:10Z");
    const restarted = createLocalRssWatchStore({ outputDir: dirname(first.csvPath) });
    expect(restarted.pending()).toHaveLength(1);
    expect(restarted.ingestFeed("SEC_EDGAR", [item("e2")], "2026-09-27T00:00:20Z").newItems).toBe(0);
    const state = JSON.parse(readFileSync(first.statePath, "utf8"));
    expect(state.initializedSources).toEqual(expect.arrayContaining(["STOCKTITAN", "SEC_EDGAR"]));
  });

  it("queues an explicit current-feed backfill once and labels it separately from live arrivals", () => {
    const store = makeStore();
    store.ingestFeed("STOCKTITAN", [item("old")], "2026-09-27T00:00:00Z");
    expect(store.queueInitialBackfill("STOCKTITAN", [item("old"), item("older")], "2026-09-27T00:01:00Z")).toMatchObject({
      source: "STOCKTITAN", feedItems: 2, acceptedItems: 2, newItems: 2, backfill: true,
    });
    expect(store.pending()).toHaveLength(2);
    expect(store.pending().map((row) => row.collection_mode)).toEqual(["INITIAL_BACKFILL", "INITIAL_BACKFILL"]);
    expect(store.queueInitialBackfill("STOCKTITAN", [item("old"), item("older")], "2026-09-27T00:02:00Z").newItems).toBe(0);
    expect(store.ingestFeed("STOCKTITAN", [item("older")], "2026-09-27T00:03:00Z").newItems).toBe(0);

    const pending = store.pending()[0];
    const result = { decision: "NEUTRAL", ticker: "", catalyst: "", analysis_ko: "과거 기준선 기사", evidence: "제목 확인", risks: "기준선 이전 게시", confidence: "LOW" };
    store.recordAnalysis(pending.item_id, result);
    const recorded = store.pending().find((row) => row.item_id === pending.item_id);
    expect(recorded).toBeUndefined();
    expect(readFileSync(store.csvPath, "utf8")).toContain("INITIAL_BACKFILL");
    expect(readFileSync(store.csvPath, "utf8")).toContain("과거 기준선 기사");
  });

  it("migrates the previous 15-column CSV header atomically during backfill", () => {
    const store = makeStore();
    const legacyHeader = ["item_id", "source", "published_at", "observed_at", "title", "summary", "link", "decision", "ticker", "catalyst", "analysis_ko", "evidence", "risks", "confidence", "status"];
    writeFileSync(store.csvPath, `\uFEFF${legacyHeader.map((column) => `"${column}"`).join(",")}\r\n`, "utf8");
    store.queueInitialBackfill("SEC_EDGAR", [item("sec-old")], "2026-09-27T00:01:00Z");
    const csv = readFileSync(store.csvPath, "utf8");
    expect(csv.split("\r\n", 1)[0]).toContain('"collection_mode"');
    expect(store.pending()[0]).toMatchObject({ source: "SEC_EDGAR", collection_mode: "INITIAL_BACKFILL", status: "PENDING_ANALYSIS" });
  });

  it("limits pending reads, records completed analysis once, and writes safe UTF-8 CSV", () => {
    const store = makeStore();
    store.ingestFeed("STOCKTITAN", [item("base")], "2026-09-27T00:00:00Z");
    store.ingestFeed("STOCKTITAN", [item("one", "한글, \"제목\""), item("two")], "2026-09-27T00:00:10Z");
    expect(store.pending(1)).toHaveLength(1);
    const queued = store.pending(1)[0];
    const result = { decision: "POSITIVE", ticker: "NVDA", catalyst: "계약", analysis_ko: "근거 분석", evidence: "contract", risks: "조건", confidence: "MEDIUM" };
    expect(store.recordAnalysis(queued.item_id, result).decision).toBe("POSITIVE");
    expect(store.pending()).toHaveLength(1);
    expect(store.recordAnalysis(queued.item_id, result)).toMatchObject({ alreadyRecorded: true });
    expect(() => store.recordAnalysis(queued.item_id, { ...result, ticker: "AMD" })).toThrow("이미 다른 분석 결과");
    const csv = readFileSync(store.csvPath, "utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("한글, \"\"제목\"\"");
    expect(csv).toContain("ANALYZED");
  });

  it("protects spreadsheet formula injection and parses escaped quotes/commas", () => {
    expect(csvCell("=SUM(A1:A2)\nnext")).toBe('"\'=SUM(A1:A2) next"');
    expect(parseCsvLine('"quoted ""title""","a,b"')).toEqual(['quoted "title"', "a,b"]);
  });

  it("fails on invalid dates and corrupted state instead of silently resetting dedupe", () => {
    const store = makeStore();
    expect(() => store.ingestFeed("STOCKTITAN", [], "not-a-date")).toThrow("입력값");
    // A malformed state must not cause the source to be re-baselined and historical rows silently lost.
    writeFileSync(store.statePath, "not-json", "utf8");
    expect(() => store.ingestFeed("STOCKTITAN", [item("x")], "2026-09-27T00:00:00Z")).toThrow("상태 파일");
  });
});
