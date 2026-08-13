import { describe, expect, it, vi } from "vitest";
vi.mock("./feature-module-settings", () => ({ loadFeatureModuleSettings: vi.fn().mockResolvedValue({ featureSettings: { evaluation: {} } }) }));
import { scanUsDailyTrend } from "./us-daily-trend-scan";

describe("us daily trend scan", () => {
  it("uses the shared DB context and returns score policy metadata", async () => {
    const candles = Array.from({ length: 70 }, (_, index) => ({ date: `202608${String(index + 1).padStart(2, "0")}`, open: 10 + index, high: 11 + index, low: 9 + index, close: 10 + index, volume: 1000 + index * 100 }));
    const result = await scanUsDailyTrend({ context: { universe: { scopes: [{ market: "NAS", code: "TEST", name: "Test" }], universe: { ok: true, source: "TEST" } }, candles: new Map([["NAS:TEST", candles]]), candleLimit: 100, timings: { universeMs: 0, candlesMs: 0, totalMs: 0 } } as any });
    expect(result.policy.minScore).toBe(70);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toHaveProperty("scoreParts");
  });

  it("does not qualify a symbol when RVOL cannot be calculated", async () => {
    const candles = Array.from({ length: 70 }, (_, index) => ({ date: `202608${String(index + 1).padStart(2, "0")}`, open: 10 + index, high: 11 + index, low: 9 + index, close: 10 + index, volume: index === 0 ? 1000 : 0 }));
    const result = await scanUsDailyTrend({ context: { universe: { scopes: [{ market: "NAS", code: "NOVOL", name: "No Volume" }], universe: { ok: true, source: "TEST" } }, candles: new Map([["NAS:NOVOL", candles]]), candleLimit: 100, timings: { universeMs: 0, candlesMs: 0, totalMs: 0 } } as any });
    expect(result.qualified).toHaveLength(0);
    expect(result.results[0].rejectionReasons).toContain("rvol_unavailable");
  });
});
