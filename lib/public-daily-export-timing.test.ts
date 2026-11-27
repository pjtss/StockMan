import { describe, expect, it } from "vitest";
import { getRecentPublicDailyExportTimings, recordCompletedPublicDailyExportTiming, type CompletedPublicDailyExportTiming } from "./public-daily-export-timing";

const timing = (requestId: string, market: "KR" | "US"): CompletedPublicDailyExportTiming => ({
  requestId,
  market,
  format: "compact",
  startedAt: "2026-11-27T00:00:00.000Z",
  completedAt: "2026-11-27T00:00:01.000Z",
  tickerCount: 1,
  universeCacheStatus: "MISS",
  batchCount: 1,
  batchQueryCount: 1,
  batchQueryCoalescedCount: 0,
  batchWaveCount: 1,
  universeQueryMs: 1,
  batchQueryWallMs: 1,
  batchQueryDurationMs: 1,
  maxBatchQueryMs: 1,
  timeToFirstGzipByteMs: 1,
  timeToFirstTickerWriteMs: 1,
  streamDurationMs: 1,
  totalElapsedMs: 1,
  gzipBytes: 1,
});

describe("public daily export timing buffer", () => {
  it("bounds retained samples and returns newest entries per market first", () => {
    for (let index = 0; index < 35; index += 1) {
      recordCompletedPublicDailyExportTiming(timing(`kr-${index}`, "KR"));
    }
    recordCompletedPublicDailyExportTiming(timing("us-0", "US"));
    recordCompletedPublicDailyExportTiming(timing("us-1", "US"));

    expect(getRecentPublicDailyExportTimings("KR").map((sample) => sample.requestId))
      .toEqual(["kr-34", "kr-33", "kr-32", "kr-31", "kr-30", "kr-29", "kr-28", "kr-27", "kr-26", "kr-25"]);
    expect(getRecentPublicDailyExportTimings("US").map((sample) => sample.requestId)).toEqual(["us-1", "us-0"]);
  });
});
