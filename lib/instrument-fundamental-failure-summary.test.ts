import { describe, expect, it } from "vitest";
import { createInstrumentFundamentalFailureAggregator, summarizeInstrumentFundamentalFailures } from "./instrument-fundamental-failure-summary";

describe("summarizeInstrumentFundamentalFailures", () => {
  it("groups failures by market and stable error code, not ticker or provider detail", () => {
    const result = summarizeInstrumentFundamentalFailures([
      { market: "NAS", code: "AAA", error: "KIS_EMPTY_OR_INVALID_PRICE (http=200, msg=No quote for AAA)" },
      { market: "NAS", code: "BBB", error: "KIS_EMPTY_OR_INVALID_PRICE (http=200, msg=No quote for BBB)" },
      { market: "NYS", code: "CCC", error: "KIS_EMPTY_OR_INVALID_PRICE (http=200, msg=No quote for CCC)" },
      { market: "NAS", code: "DDD", error: "KIS_STALE_QUOTE_REJECTED" },
    ]);

    expect(result).toEqual([
      { market: "NAS", reason: "KIS_EMPTY_OR_INVALID_PRICE", count: 2 },
      { market: "NAS", reason: "KIS_STALE_QUOTE_REJECTED", count: 1 },
      { market: "NYS", reason: "KIS_EMPTY_OR_INVALID_PRICE", count: 1 },
    ]);
    expect(JSON.stringify(result)).not.toContain("No quote");
    expect(JSON.stringify(result)).not.toContain("AAA");
  });

  it("handles empty and unclassified errors deterministically", () => {
    expect(summarizeInstrumentFundamentalFailures([])).toEqual([]);
    expect(summarizeInstrumentFundamentalFailures([
      { market: "KOSPI", code: "005930", error: "upstream response unavailable" },
      { market: "KOSPI", code: "000660", error: "" },
    ])).toEqual([{ market: "KOSPI", reason: "OTHER", count: 2 }]);
  });

  it("counts every failure even when the detailed sample is capped elsewhere", () => {
    const aggregator = createInstrumentFundamentalFailureAggregator();
    for (let index = 0; index < 150; index += 1) aggregator.record("NAS", "KIS_HTTP_403 (provider detail)");
    aggregator.record("AMS", "KIS_EMPTY_OR_INVALID_PRICE");

    expect(aggregator.snapshot()).toEqual([
      { market: "AMS", reason: "KIS_EMPTY_OR_INVALID_PRICE", count: 1 },
      { market: "NAS", reason: "KIS_HTTP_403", count: 150 },
    ]);
  });
});
