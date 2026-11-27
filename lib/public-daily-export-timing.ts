export type PublicDailyExportMarket = "KR" | "US";

export type CompletedPublicDailyExportTiming = {
  requestId: string;
  market: PublicDailyExportMarket;
  format: "full" | "compact";
  startedAt: string;
  completedAt: string;
  tickerCount: number;
  universeCacheStatus: "MISS" | "HIT" | "COALESCED";
  batchCount: number;
  batchQueryCount: number;
  batchQueryCoalescedCount: number;
  batchWaveCount: number;
  universeQueryMs: number;
  batchQueryWallMs: number;
  batchQueryDurationMs: number;
  maxBatchQueryMs: number;
  timeToFirstGzipByteMs: number | null;
  timeToFirstTickerWriteMs: number | null;
  streamDurationMs: number;
  totalElapsedMs: number;
  gzipBytes: number;
};

const MAX_RECENT_EXPORT_TIMINGS = 30;

type TimingBufferGlobal = typeof globalThis & {
  __stockmanPublicDailyExportTimingsV1?: CompletedPublicDailyExportTiming[];
};

function getBuffer() {
  const runtimeGlobal = globalThis as TimingBufferGlobal;
  runtimeGlobal.__stockmanPublicDailyExportTimingsV1 ??= [];
  return runtimeGlobal.__stockmanPublicDailyExportTimingsV1;
}

export function recordCompletedPublicDailyExportTiming(timing: CompletedPublicDailyExportTiming) {
  const recentExportTimings = getBuffer();
  recentExportTimings.push(timing);
  if (recentExportTimings.length > MAX_RECENT_EXPORT_TIMINGS) {
    recentExportTimings.splice(0, recentExportTimings.length - MAX_RECENT_EXPORT_TIMINGS);
  }
}

/** Read a bounded in-process view from the authenticated diagnostics route. */
export function getRecentPublicDailyExportTimings(market: PublicDailyExportMarket) {
  return getBuffer().filter((timing) => timing.market === market).slice(-10).reverse();
}
