import { describe, expect, it } from "vitest";
import { interleaveMarketRssSourceQueues } from "./market-rss-source-fairness";

describe("market RSS source fairness", () => {
  it("interleaves source queues without changing within-source oldest-first order", () => {
    const result = interleaveMarketRssSourceQueues([
      [{ source: "GLOBENEWSWIRE", id: 1 }, { source: "GLOBENEWSWIRE", id: 2 }],
      [{ source: "STOCKTITAN", id: 3 }, { source: "STOCKTITAN", id: 4 }],
      [{ source: "SEC_EDGAR", id: 5 }, { source: "SEC_EDGAR", id: 6 }],
    ], 5);

    expect(result.map(({ id }) => id)).toEqual([1, 3, 5, 2, 4]);
  });

  it("returns all available rows when queues are shorter than the requested batch", () => {
    expect(interleaveMarketRssSourceQueues([[{ source: "SEC_EDGAR", id: 1 }], [], [{ source: "STOCKTITAN", id: 2 }]], 10))
      .toEqual([{ source: "SEC_EDGAR", id: 1 }, { source: "STOCKTITAN", id: 2 }]);
  });
});
