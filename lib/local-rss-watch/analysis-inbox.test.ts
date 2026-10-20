import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { drainCodexAnalysisInbox, enqueueCodexAnalysis, waitForCodexAnalysisConsumption } from "./analysis-inbox.mjs";

const dirs: string[] = [];
function makeDir() { const directory = mkdtempSync(join(tmpdir(), "stockman-rss-inbox-")); dirs.push(directory); return directory; }
afterEach(() => { for (const directory of dirs.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const itemId = "a".repeat(64);
const result = { decision: "POSITIVE", ticker: "NVDA", catalyst: "contract", analysis_ko: "근거 확인", evidence: "signed contract", risks: "terms", confidence: "MEDIUM" };

describe("Codex analysis local handoff inbox", () => {
  it("queues idempotently in the workspace without touching the Downloads CSV", () => {
    const directory = makeDir();
    expect(enqueueCodexAnalysis({ itemId, result, directory })).toMatchObject({ queued: true, itemId });
    expect(enqueueCodexAnalysis({ itemId, result, directory })).toMatchObject({ queued: false, alreadyQueued: true });
    expect(readdirSync(directory)).toEqual([`${itemId}.json`]);
    expect(JSON.parse(readFileSync(join(directory, `${itemId}.json`), "utf8"))).toEqual({ itemId, result });
    expect(() => enqueueCodexAnalysis({ itemId, result: { ...result, ticker: "AMD" }, directory })).toThrow("서로 다른 분석 결과");
  });

  it("removes only successfully recorded requests and leaves failures retryable", () => {
    const directory = makeDir();
    enqueueCodexAnalysis({ itemId, result, directory });
    const secondId = "b".repeat(64);
    enqueueCodexAnalysis({ itemId: secondId, result, directory });
    const recordAnalysis = vi.fn((id: string) => { if (id === secondId) throw new Error("DB/CSV unavailable"); });
    const log = vi.fn();
    expect(drainCodexAnalysisInbox({ recordAnalysis, directory, log })).toMatchObject({ applied: 1, failed: 1 });
    expect(readdirSync(directory)).toEqual([`${secondId}.json`]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("DB/CSV unavailable"));
  });

  it("rejects mismatched payload identity and keeps it for inspection", () => {
    const directory = makeDir();
    writeFileSync(join(directory, `${itemId}.json`), JSON.stringify({ itemId: "b".repeat(64), result }), "utf8");
    const recordAnalysis = vi.fn();
    expect(drainCodexAnalysisInbox({ recordAnalysis, directory }).failed).toBe(1);
    expect(recordAnalysis).not.toHaveBeenCalled();
    expect(readdirSync(directory)).toEqual([`${itemId}.json`]);
  });

  it("confirms the consumer removed a handoff only after applying it", async () => {
    const directory = makeDir();
    enqueueCodexAnalysis({ itemId, result, directory });
    setTimeout(() => drainCodexAnalysisInbox({ recordAnalysis: vi.fn(), directory }), 40);
    await expect(waitForCodexAnalysisConsumption({ itemId, directory, timeoutMs: 500, intervalMs: 25 })).resolves.toBe(true);
    enqueueCodexAnalysis({ itemId, result, directory });
    await expect(waitForCodexAnalysisConsumption({ itemId, directory, timeoutMs: 50, intervalMs: 25 })).resolves.toBe(false);
  });
});
