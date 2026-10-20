import { describe, expect, it } from "vitest";
import { dedupeSecTickerWatchTargets } from "./sec-ticker-watch";

describe("sec ticker watch", () => {
  it("deduplicates several requested tickers that resolve to one CIK", () => {
    const result = dedupeSecTickerWatchTargets([
      { cik: "0000000001", name: "Example", ticker: "ZZZ", exchange: "NASDAQ", requestedTicker: "ZZZ" },
      { cik: "0000000001", name: "Example", ticker: "AAA", exchange: "NASDAQ", requestedTicker: "AAA" },
      { cik: "0000000002", name: "Other", ticker: "BBB", exchange: "NYSE", requestedTicker: "BBB" },
    ]);
    expect(result.map((row) => row.cik)).toEqual(["0000000001", "0000000002"]);
    expect(result[0].requestedTicker).toBe("AAA");
  });
});
