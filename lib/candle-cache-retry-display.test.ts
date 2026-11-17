import { describe, expect, it } from "vitest";
import { summarizeRetryQueueFailures } from "./candle-cache-retry-display";

describe("summarizeRetryQueueFailures", () => {
  it("reads retry persistence failures from KR and US cache job payloads", () => {
    expect(summarizeRetryQueueFailures({
      results: [{ market: "KOSPI", code: "005930", retryQueueFailures: ["D", "W"] }],
      failures: [{ market: "NAS", code: "AAPL", retryQueued: false, error: "retry DB down" }],
    })).toEqual(["KOSPI:005930 (D,W)", "NAS:AAPL (retry DB down)"]);
  });

  it("does not report ordinary candle failures that were successfully queued", () => {
    expect(summarizeRetryQueueFailures({ failures: [{ market: "NAS", code: "AAPL", retryQueued: true }] })).toEqual([]);
    expect(summarizeRetryQueueFailures(null)).toEqual([]);
  });
});
