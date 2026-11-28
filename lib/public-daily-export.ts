import { constants as zlibConstants, createGzip } from "node:zlib";
import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db";
import { US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL_WITH_PREFILTER } from "@/lib/us-depositary-receipt-classification";
import { recordCompletedPublicDailyExportTiming, type CompletedPublicDailyExportTiming, type PublicDailyExportMarket } from "@/lib/public-daily-export-timing";
import { getCachedPublicDailyExport, setCachedPublicDailyExport } from "@/lib/public-daily-export-response-cache";
import { getOrLoadPublicDailyExportUniverse, type PublicDailyExportUniverseCacheStatus } from "@/lib/public-daily-export-universe-cache";
import { getOrLoadPublicDailyExportQuery } from "@/lib/public-daily-export-query-flight";

type ExportMarket = PublicDailyExportMarket;
export type PublicDailyExportFormat = "full" | "compact";

const EXPORT_BATCH_SIZE = 500;

type ExportRow = { item_json?: string; items_json?: string };

type ExportKey = { market: string; code: string; name: string };

type ExportPerformanceMetrics = {
  requestId: string;
  market: ExportMarket;
  format: PublicDailyExportFormat;
  requestStartedAt: number;
  requestStartedAtIso: string;
  processCpuUsageStart: { user: number; system: number };
  tickerCount: number;
  universeCacheStatus: PublicDailyExportUniverseCacheStatus;
  batchCount: number;
  universeQueryMs: number;
  batchQueryCount: number;
  batchQueryCoalescedCount: number;
  batchWaveCount: number;
  batchQueryWallMs: number;
  batchQueryDurationMs: number;
  maxBatchQueryMs: number;
};

const EXPORT_CONFIG: Record<ExportMarket, {
  universeTable: string;
  eligibility: string;
  batchSize: number;
  firstBatchSize?: number;
}> = {
  KR: {
    universeTable: "kr_common_stock_universe",
    eligibility: "u.enabled=true AND u.instrument_type='COMMON_STOCK' AND u.is_etp=false AND u.is_warrant=false AND u.is_preferred=false",
    batchSize: EXPORT_BATCH_SIZE,
  },
  US: {
    universeTable: "us_common_stock_universe",
    eligibility: `u.enabled=true AND u.instrument_type='COMMON_STOCK' AND u.is_etf=false AND u.is_warrant=false AND u.is_derivative=false AND u.is_dr=false AND u.is_leveraged=false AND u.is_inverse=false AND ${US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL_WITH_PREFILTER}`,
    // Six batches fit in one query wave and reduced US export latency locally.
    batchSize: 1_000,
    // Keep the first ordered result small so useful ticker JSON can reach the gzip stream sooner.
    firstBatchSize: 250,
  },
};

const backgroundRefreshes = new Map<string, Promise<void>>();

function startBackgroundRefresh(market: ExportMarket, format: PublicDailyExportFormat) {
  const refreshKey = `${market}:${format}`;
  if (backgroundRefreshes.has(refreshKey)) return;

  const refresh = (async () => {
    try {
      const response = await getPublicDailyExport(market, format, { bypassResponseCache: true });
      if (response.status !== 200) {
        await response.body?.cancel();
        console.warn(`[API /public/daily-export/${market.toLowerCase()}] stale refresh returned HTTP ${response.status}`);
        return;
      }
      await response.arrayBuffer();
    } catch (error) {
      console.warn(`[API /public/daily-export/${market.toLowerCase()}] stale refresh failed:`, error instanceof Error ? error.message : "unknown error");
    } finally {
      backgroundRefreshes.delete(refreshKey);
    }
  })();
  backgroundRefreshes.set(refreshKey, refresh);
}

function gzipJsonStream(items: AsyncIterable<string>, level: 7, metrics: ExportPerformanceMetrics) {
  let compressor: ReturnType<typeof createGzip> | null = null;
  let stopHeartbeat = () => undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const streamStartedAt = performance.now();
      let firstGzipByteAt: number | null = null;
      let firstTickerWriteAt: number | null = null;
      let gzipBytes = 0;
      const compressedChunks: Buffer[] = [];
      const activeCompressor = createGzip({
        level,
        // Production-payload streaming A/B favored windowBits 12 for both markets.
        windowBits: 12,
        memLevel: metrics.market === "US" ? 9 : 8,
        chunkSize: 64 * 1024,
        // Production-payload A/B showed default is faster and smaller than filtered for both markets.
        strategy: zlibConstants.Z_DEFAULT_STRATEGY,
      });
      compressor = activeCompressor;
      let ended = false;
      let flushing = false;
      const heartbeat = setInterval(() => {
        if (ended || flushing) return;
        flushing = true;
        activeCompressor.flush(() => { flushing = false; });
      }, 5_000);
      stopHeartbeat = () => {
        ended = true;
        clearInterval(heartbeat);
      };
      activeCompressor.on("data", (chunk: Buffer) => {
        firstGzipByteAt ??= performance.now();
        gzipBytes += chunk.length;
        // Retain and enqueue the zlib-owned buffer directly; cache assembly happens once at stream end.
        compressedChunks.push(chunk);
        controller.enqueue(chunk);
      });
      activeCompressor.on("error", (error) => {
        stopHeartbeat();
        controller.error(error);
      });
      activeCompressor.on("end", () => {
        stopHeartbeat();
        const completedBytes = Buffer.concat(compressedChunks, gzipBytes);
        setCachedPublicDailyExport(metrics.market, metrics.format, completedBytes, { takeOwnership: true });
        const completedAt = performance.now();
        const processCpuUsage = process.cpuUsage(metrics.processCpuUsageStart);
        const timing: CompletedPublicDailyExportTiming = {
          requestId: metrics.requestId,
          market: metrics.market,
          format: metrics.format,
          startedAt: metrics.requestStartedAtIso,
          completedAt: new Date().toISOString(),
          tickerCount: metrics.tickerCount,
          universeCacheStatus: metrics.universeCacheStatus,
          batchCount: metrics.batchCount,
          batchQueryCount: metrics.batchQueryCount,
          batchQueryCoalescedCount: metrics.batchQueryCoalescedCount,
          batchWaveCount: metrics.batchWaveCount,
          universeQueryMs: Math.round(metrics.universeQueryMs),
          batchQueryWallMs: Math.round(metrics.batchQueryWallMs),
          batchQueryDurationMs: Math.round(metrics.batchQueryDurationMs),
          maxBatchQueryMs: Math.round(metrics.maxBatchQueryMs),
          timeToFirstGzipByteMs: firstGzipByteAt === null ? null : Math.round(firstGzipByteAt - metrics.requestStartedAt),
          timeToFirstTickerWriteMs: firstTickerWriteAt === null ? null : Math.round(firstTickerWriteAt - metrics.requestStartedAt),
          streamDurationMs: Math.round(completedAt - streamStartedAt),
          totalElapsedMs: Math.round(completedAt - metrics.requestStartedAt),
          // These are process-wide deltas; overlapping requests can contribute to the same interval.
          processCpuUserMs: Math.round(processCpuUsage.user / 1_000),
          processCpuSystemMs: Math.round(processCpuUsage.system / 1_000),
          gzipBytes,
        };
        recordCompletedPublicDailyExportTiming(timing);
        console.info(`[API /public/daily-export/${metrics.market.toLowerCase()}] performance`, {
          requestId: timing.requestId,
          market: metrics.market,
          format: metrics.format,
          tickerCount: metrics.tickerCount,
          universeCacheStatus: metrics.universeCacheStatus,
          batchCount: metrics.batchCount,
          universeQueryMs: Math.round(metrics.universeQueryMs),
          batchQueryCount: metrics.batchQueryCount,
          batchQueryCoalescedCount: metrics.batchQueryCoalescedCount,
          batchWaveCount: metrics.batchWaveCount,
          batchQueryWallMs: Math.round(metrics.batchQueryWallMs),
          batchQueryDurationMs: Math.round(metrics.batchQueryDurationMs),
          maxBatchQueryMs: Math.round(metrics.maxBatchQueryMs),
          timeToFirstGzipByteMs: timing.timeToFirstGzipByteMs,
          timeToFirstTickerWriteMs: timing.timeToFirstTickerWriteMs,
          streamDurationMs: timing.streamDurationMs,
          totalElapsedMs: timing.totalElapsedMs,
          processCpuUserMs: timing.processCpuUserMs,
          processCpuSystemMs: timing.processCpuSystemMs,
          gzipBytes: timing.gzipBytes,
        });
        controller.close();
      });

      const write = (chunk: string) => new Promise<void>((resolve, reject) => {
        activeCompressor.write(chunk, (error) => error ? reject(error) : resolve());
      });
      const flush = () => new Promise<void>((resolve) => activeCompressor.flush(resolve));

      void (async () => {
        await write("[");
        await flush();
        let hasWrittenBatch = false;
        for await (const batchJson of items) {
          const batchItems = batchJson.startsWith("[") && batchJson.endsWith("]")
            ? batchJson.slice(1, -1)
            : batchJson;
          if (!batchItems) continue;
          firstTickerWriteAt ??= performance.now();
          await write(`${hasWrittenBatch ? "," : ""}${batchItems}`);
          hasWrittenBatch = true;
        }
        activeCompressor.end("]");
      })().catch((error: unknown) => activeCompressor.destroy(error instanceof Error ? error : new Error("GZIP_STREAM_FAILED")));
    },
    cancel() {
      stopHeartbeat();
      compressor?.destroy();
    },
  });
}

function errorResponse() {
  return Response.json({ ok: false, error: "DAILY_EXPORT_UNAVAILABLE" }, {
    status: 503,
    headers: { "cache-control": "no-store" },
  });
}

export async function getPublicDailyExport(
  market: ExportMarket,
  format: PublicDailyExportFormat = "compact",
  options: { bypassResponseCache?: boolean } = {},
) {
  const cached = options.bypassResponseCache ? null : getCachedPublicDailyExport(market, format, { copyBytes: false });
  if (cached) {
    if (cached.state === "STALE") startBackgroundRefresh(market, format);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // This response borrows the cache-owned immutable bytes; avoid copying multi-megabyte gzip bodies.
        controller.enqueue(cached.bytes);
        controller.close();
      },
    });
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="daily-candles-${market.toLowerCase()}${format === "compact" ? "-compact" : ""}.json.gz"`,
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        pragma: "no-cache",
        expires: "0",
        "x-content-type-options": "nosniff",
        "x-accel-buffering": "no",
        "x-public-daily-export-cache": cached.state,
      },
    });
  }
  const requestStartedAt = performance.now();
  const requestId = randomUUID();
  const requestStartedAtIso = new Date().toISOString();
  const processCpuUsageStart = process.cpuUsage();
  const { universeTable, eligibility, batchSize, firstBatchSize } = EXPORT_CONFIG[market];
  try {
    const pool = getPool();
    const universeQueryStartedAt = performance.now();
    const eligible = await getOrLoadPublicDailyExportUniverse(market, async () => {
      const result = await pool.query<ExportKey>(`
        SELECT u.market, u.code, u.name
          FROM ${universeTable} u
         WHERE ${eligibility}
         ORDER BY u.market, u.code
      `);
      return result.rows;
    });
    const metrics: ExportPerformanceMetrics = {
      requestId,
      market,
      format,
      requestStartedAt,
      requestStartedAtIso,
      processCpuUsageStart,
      tickerCount: eligible.rows.length,
      universeCacheStatus: eligible.status,
      batchCount: 0,
      universeQueryMs: performance.now() - universeQueryStartedAt,
      batchQueryCount: 0,
      batchQueryCoalescedCount: 0,
      batchWaveCount: 0,
      batchQueryWallMs: 0,
      batchQueryDurationMs: 0,
      maxBatchQueryMs: 0,
    };
    if (eligible.rows.length === 0) return errorResponse();

    const chunks: ExportKey[][] = [];
    let chunkStart = 0;
    if (firstBatchSize && eligible.rows.length > firstBatchSize) {
      chunks.push(eligible.rows.slice(0, firstBatchSize));
      chunkStart = firstBatchSize;
    }
    for (let index = chunkStart; index < eligible.rows.length; index += batchSize) {
      chunks.push(eligible.rows.slice(index, index + batchSize));
    }
    metrics.batchCount = chunks.length;
    const concurrency = market === "US" ? 10 : 5;
    const compactCandleSchema = format === "compact"
      ? `, 'candleEncoding', 'tuple-v1',
                   'candleFields', json_build_array('date', 'open', 'high', 'low', 'close', 'volume', 'tradingValue', 'fetchedAt')`
      : "";
    const items = (async function* (): AsyncGenerator<string> {
      for (let offset = 0; offset < chunks.length; offset += concurrency) {
        const waveStartedAt = performance.now();
        const chunkPromises = chunks.slice(offset, offset + concurrency).map(async (keys) => {
          const queryStartedAt = performance.now();
          try {
            const queryName = format === "full"
              ? `public-daily-export-${market.toLowerCase()}-batch-v2`
              : `public-daily-export-${market.toLowerCase()}-compact-batch-v2`;
            const serializedKeys = JSON.stringify(keys);
            const queryFlight = getOrLoadPublicDailyExportQuery(`${queryName}:${serializedKeys}`, () => pool.query<ExportRow>({
              name: queryName,
              text: `/* public-daily-export-market: ${market.toLowerCase()} */
      WITH requested AS (
        SELECT market, code, name
          FROM jsonb_to_recordset($1::jsonb) AS item(market text, code text, name text)
      )
      SELECT '[' || COALESCE(string_agg(row_to_json(payload)::text, ',' ORDER BY r.market, r.code), '') || ']' AS items_json
        FROM requested r
        LEFT JOIN instrument_fundamental_snapshots f
          ON f.market = r.market AND f.code = r.code
        LEFT JOIN public_daily_export_candle_summaries d
          ON d.market = r.market AND d.code = r.code
        CROSS JOIN LATERAL (
          SELECT json_build_object('market', r.market, 'code', r.code, 'name', r.name) AS ticker,
                 json_build_object(
                 'value', CASE
                   WHEN f.market_cap > 0
                    AND f.market_cap < '1.7976931348623157e308'::double precision THEN f.market_cap
                   ELSE NULL
                 END,
                 'currency', COALESCE(NULLIF(f.currency, ''), CASE WHEN r.market IN ('KOSPI', 'KOSDAQ') THEN 'KRW' ELSE 'USD' END),
                 'observedAt', CASE WHEN f.observed_at IS NULL THEN NULL ELSE to_char(f.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
                 'fetchedAt', CASE WHEN f.fetched_at IS NULL THEN NULL ELSE to_char(f.fetched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
                 ) AS "marketCap",
                 json_build_object(
                 'candles', COALESCE(d.${format === "compact" ? "compact_candles" : "full_candles"}, '[]'::json)${compactCandleSchema},
                 'metadata', json_build_object(
                   'latestCandleDate', d.latest_candle_date,
                   'dataUpdatedAt', CASE WHEN d.data_updated_at IS NULL THEN NULL ELSE to_char(d.data_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
                   'returnedCount', COALESCE(d.returned_count, 0)::int
                 )
                 ) AS daily
        ) payload
              `,
              values: [serializedKeys],
            }));
            if (queryFlight.coalesced) metrics.batchQueryCoalescedCount += 1;
            return await queryFlight.promise;
          } finally {
            const queryDurationMs = performance.now() - queryStartedAt;
            metrics.batchQueryCount += 1;
            metrics.batchQueryDurationMs += queryDurationMs;
            metrics.maxBatchQueryMs = Math.max(metrics.maxBatchQueryMs, queryDurationMs);
          }
        });
        const waveResults = Promise.all(chunkPromises);
        void waveResults.then(() => {
          metrics.batchQueryWallMs += performance.now() - waveStartedAt;
          metrics.batchWaveCount += 1;
        }, () => undefined);

        // Preserve the public market/code order while emitting each completed
        // batch as soon as all preceding batches are ready. The remaining DB
        // queries in this wave continue concurrently during gzip streaming.
        for (const resultPromise of chunkPromises) {
          const result = await resultPromise;
          const itemsJson = result.rows[0]?.items_json;
          if (result.rows.length === 1 && typeof itemsJson === "string") {
            if (itemsJson.length < 2) throw new Error("EMPTY_PUBLIC_DAILY_EXPORT_BATCH");
            yield itemsJson;
          } else {
            for (const row of result.rows) {
              if (typeof row.item_json !== "string") throw new Error("EMPTY_PUBLIC_DAILY_EXPORT_BATCH");
              yield row.item_json;
            }
          }
        }
        await waveResults;
      }
    })();

    const filename = `daily-candles-${market.toLowerCase()}${format === "compact" ? "-compact" : ""}.json.gz`;
    const gzipLevel = 7;
    return new Response(gzipJsonStream(items, gzipLevel, metrics), {
      status: 200,
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        pragma: "no-cache",
        expires: "0",
        "x-content-type-options": "nosniff",
        "x-accel-buffering": "no",
        "x-public-daily-export-cache": "MISS",
      },
    });
  } catch (error) {
    console.error(`[API /public/daily-export/${market.toLowerCase()}] Error:`, error instanceof Error ? error.message : "unknown error");
    return errorResponse();
  }
}

export function getPublicDailyExportFromRequest(market: ExportMarket, requestedFormat: string | null) {
  if (requestedFormat !== null && requestedFormat !== "full" && requestedFormat !== "compact") {
    return Response.json({ ok: false, error: "INVALID_FORMAT" }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }
  return getPublicDailyExport(market, requestedFormat === "full" ? "full" : "compact");
}
