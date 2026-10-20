import { describe, expect, it } from "vitest";
import { summarizeDailyCandleCoverage } from "./daily-candle-coverage.mjs";

describe("summarizeDailyCandleCoverage", () => {
  it("measures latest-date coverage independently per market", () => {
    const result = summarizeDailyCandleCoverage(
      [
        { market: "NAS", code: "AAA" },
        { market: "NAS", code: "BBB" },
        { market: "NYS", code: "CCC" },
        { market: "AMS", code: "DDD" },
      ],
      [
        { market: "NAS", candles: [
          { code: "AAA", candles: [{ date: "20260924" }, { date: "20260925" }] },
          { code: "BBB", candles: [{ date: "20260924" }] },
        ] },
        { market: "NYS", candles: [{ code: "CCC", candles: [{ date: "20260923" }] }] },
      ],
    );

    expect(result).toEqual([
      { market: "AMS", requestedInstruments: 1, persistedInstruments: 0, missingInstruments: 1, marketLatestCandleDate: null, instrumentsAtMarketLatest: 0, laggingInstruments: 0, laggingSample: [] },
      { market: "NAS", requestedInstruments: 2, persistedInstruments: 2, missingInstruments: 0, marketLatestCandleDate: "20260925", instrumentsAtMarketLatest: 1, laggingInstruments: 1, laggingSample: [{ code: "BBB", latestCandleDate: "20260924" }] },
      { market: "NYS", requestedInstruments: 1, persistedInstruments: 1, missingInstruments: 0, marketLatestCandleDate: "20260923", instrumentsAtMarketLatest: 1, laggingInstruments: 0, laggingSample: [] },
    ]);
  });

  it("deduplicates universe keys and caps the lagging sample", () => {
    const universeRows = Array.from({ length: 12 }, (_, i) => ({ market: "NAS", code: `T${i}` }));
    universeRows.push({ market: "nas", code: "T0" });
    const persistedParts = [{
      market: "NAS",
      candles: universeRows.slice(0, 12).map((row, i) => ({ code: row.code, candles: [{ date: i === 0 ? "20260925" : "20260924" }] })),
    }];
    const [result] = summarizeDailyCandleCoverage(universeRows, persistedParts);

    expect(result.requestedInstruments).toBe(12);
    expect(result.instrumentsAtMarketLatest).toBe(1);
    expect(result.laggingInstruments).toBe(11);
    expect(result.laggingSample).toHaveLength(10);
  });

  it("returns an empty list when the request universe is empty", () => {
    expect(summarizeDailyCandleCoverage([], [])).toEqual([]);
  });
});
