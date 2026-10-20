import { describe, expect, it, vi } from "vitest";
import { fillMissingDailyCandleItems } from "./daily-candle-fallback.mjs";

describe("fillMissingDailyCandleItems", () => {
  it("falls back only for missing codes and preserves requested order", async () => {
    const fetchChart = vi.fn(async (code: string) => ({ candles: [{ date: code }] }));
    const result = await fillMissingDailyCandleItems({
      codes: ["A", "B", "C"],
      items: [{ code: "B", candles: [{ date: "bulk" }] }],
      concurrency: 2,
      fetchChart,
    });

    expect(fetchChart).toHaveBeenCalledTimes(2);
    expect(fetchChart).toHaveBeenCalledWith("A");
    expect(fetchChart).toHaveBeenCalledWith("C");
    expect(result.items.map((item) => item.code)).toEqual(["A", "B", "C"]);
    expect(result.requestedFallbackCount).toBe(2);
    expect(result.failedCodes).toEqual([]);
  });

  it("reports empty or failed fallback results instead of silently omitting them", async () => {
    const onFailure = vi.fn();
    const result = await fillMissingDailyCandleItems({
      codes: ["A", "B"],
      items: [],
      concurrency: 1,
      fetchChart: vi.fn(async (code: string) => {
        if (code === "A") throw new Error("network failure");
        return { candles: [] };
      }),
      onFailure,
    });

    expect(result.items).toEqual([]);
    expect(result.failedCodes).toEqual(["A", "B"]);
    expect(result.requestedFallbackCount).toBe(2);
    expect(onFailure).toHaveBeenCalledTimes(2);
  });

  it("falls back for an absent item even when another code has bulk data", async () => {
    const fetchChart = vi.fn(async () => ({ candles: [{ date: "fallback" }] }));
    const result = await fillMissingDailyCandleItems({
      codes: ["A", "B"],
      items: [{ code: "A", candles: [{ date: "bulk" }] }],
      concurrency: 1,
      fetchChart,
    });

    expect(fetchChart).toHaveBeenCalledTimes(1);
    expect(result.items.map((item) => item.code)).toEqual(["A", "B"]);
    expect(result.failedCodes).toEqual([]);
  });
});
