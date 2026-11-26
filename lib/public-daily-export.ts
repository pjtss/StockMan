import { constants as zlibConstants, createGzip } from "node:zlib";
import { getPool } from "@/lib/db";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";
import { US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL } from "@/lib/us-depositary-receipt-classification";

type ExportMarket = "KR" | "US";
export type PublicDailyExportFormat = "full" | "compact";

const EXPORT_BATCH_SIZE = 500;

type ExportRow = { item_json: string };

type ExportKey = { market: string; code: string; name: string; has_trading_value: boolean };

type ExportPerformanceMetrics = {
  market: ExportMarket;
  format: PublicDailyExportFormat;
  requestStartedAt: number;
  tickerCount: number;
  batchCount: number;
  universeQueryMs: number;
  batchQueryCount: number;
  batchWaveCount: number;
  batchQueryWallMs: number;
  batchQueryDurationMs: number;
  maxBatchQueryMs: number;
};

const EXPORT_CONFIG: Record<ExportMarket, {
  universeTable: string;
  candleTable: string;
  eligibility: string;
  batchSize: number;
}> = {
  KR: {
    universeTable: "kr_common_stock_universe",
    candleTable: "kr_instrument_universe_candles",
    eligibility: "u.enabled=true AND u.instrument_type='COMMON_STOCK' AND u.is_etp=false AND u.is_warrant=false AND u.is_preferred=false",
    batchSize: EXPORT_BATCH_SIZE,
  },
  US: {
    universeTable: "us_common_stock_universe",
    candleTable: "us_instrument_universe_candles",
    eligibility: `u.enabled=true AND u.instrument_type='COMMON_STOCK' AND u.is_etf=false AND u.is_warrant=false AND u.is_derivative=false AND u.is_dr=false AND u.is_leveraged=false AND u.is_inverse=false AND ${US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL}`,
    // Six batches fit in one query wave and reduced US export latency locally.
    batchSize: 1_000,
  },
};

function gzipJsonStream(items: AsyncIterable<string>, level: 9, metrics: ExportPerformanceMetrics) {
  let compressor: ReturnType<typeof createGzip> | null = null;
  let stopHeartbeat = () => undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const streamStartedAt = performance.now();
      let firstGzipByteAt: number | null = null;
      let gzipBytes = 0;
      const activeCompressor = createGzip({
        level,
        // Repeated API A/B runs were faster for both markets with this smaller window.
        windowBits: 14,
        chunkSize: 64 * 1024,
        strategy: zlibConstants.Z_FILTERED,
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
        controller.enqueue(new Uint8Array(chunk));
      });
      activeCompressor.on("error", (error) => {
        stopHeartbeat();
        controller.error(error);
      });
      activeCompressor.on("end", () => {
        stopHeartbeat();
        const completedAt = performance.now();
        console.info(`[API /public/daily-export/${metrics.market.toLowerCase()}] performance`, {
          market: metrics.market,
          format: metrics.format,
          tickerCount: metrics.tickerCount,
          batchCount: metrics.batchCount,
          universeQueryMs: Math.round(metrics.universeQueryMs),
          batchQueryCount: metrics.batchQueryCount,
          batchWaveCount: metrics.batchWaveCount,
          batchQueryWallMs: Math.round(metrics.batchQueryWallMs),
          batchQueryDurationMs: Math.round(metrics.batchQueryDurationMs),
          maxBatchQueryMs: Math.round(metrics.maxBatchQueryMs),
          timeToFirstGzipByteMs: firstGzipByteAt === null ? null : Math.round(firstGzipByteAt - metrics.requestStartedAt),
          streamDurationMs: Math.round(completedAt - streamStartedAt),
          totalElapsedMs: Math.round(completedAt - metrics.requestStartedAt),
          gzipBytes,
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
        let index = 0;
        const pending: string[] = [];
        const writePending = async () => {
          if (pending.length === 0) return;
          await write(`${index === 0 ? "" : ","}${pending.join(",")}`);
          index += pending.length;
          pending.length = 0;
        };
        for await (const item of items) {
          pending.push(item);
          if (pending.length === EXPORT_BATCH_SIZE) await writePending();
        }
        await writePending();
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

export async function getPublicDailyExport(market: ExportMarket, format: PublicDailyExportFormat = "full") {
  const requestStartedAt = performance.now();
  const { universeTable, candleTable, eligibility, batchSize } = EXPORT_CONFIG[market];
  try {
    const pool = getPool();
    const universeQueryStartedAt = performance.now();
    const eligible = await pool.query<ExportKey>(`
      SELECT u.market, u.code, u.name,
             EXISTS (
                 SELECT 1
                   FROM pg_attribute a
                  WHERE a.attrelid = 'public.${candleTable}'::regclass
                    AND a.attname = 'trading_value'
                    AND NOT a.attisdropped
               ) AS has_trading_value
        FROM ${universeTable} u
       WHERE ${eligibility}
       ORDER BY u.market, u.code
    `);
    const metrics: ExportPerformanceMetrics = {
      market,
      format,
      requestStartedAt,
      tickerCount: eligible.rows.length,
      batchCount: 0,
      universeQueryMs: performance.now() - universeQueryStartedAt,
      batchQueryCount: 0,
      batchWaveCount: 0,
      batchQueryWallMs: 0,
      batchQueryDurationMs: 0,
      maxBatchQueryMs: 0,
    };
    if (eligible.rows.length === 0) return errorResponse();

    const chunks: ExportKey[][] = [];
    for (let index = 0; index < eligible.rows.length; index += batchSize) {
      chunks.push(eligible.rows.slice(index, index + batchSize));
    }
    metrics.batchCount = chunks.length;
    const concurrency = market === "US" ? 10 : 5;
    // The KR migration stores this column as DOUBLE PRECISION. Compare finite bounds directly
    // to avoid formatting every candle as text; keep the NUMERIC US validation unchanged.
    const tradingValueExpression = eligible.rows[0].has_trading_value
      ? market === "KR"
        ? `CASE WHEN c.trading_value > '-Infinity' AND c.trading_value < 'Infinity'
                 THEN c.trading_value::double precision
                 ELSE c.close * c.volume
            END`
        : `CASE WHEN c.trading_value::text ~ '^[+-]?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
                 THEN c.trading_value::double precision
                 ELSE c.close * c.volume
            END`
      : `c.close * c.volume`;
    const candleJsonExpression = format === "compact"
      ? `json_build_array(
                     recent.candle_date,
                     recent.open,
                     recent.high,
                     recent.low,
                     recent.close,
                     recent.volume,
                     recent.trading_value,
                     to_char(recent.fetched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                   )`
      : `json_build_object(
                     'date', recent.candle_date,
                     'open', recent.open,
                     'high', recent.high,
                     'low', recent.low,
                     'close', recent.close,
                     'volume', recent.volume,
                     'tradingValue', recent.trading_value,
                     'fetchedAt', to_char(recent.fetched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                   )`;
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
            return await pool.query<ExportRow>({
              name: format === "full"
                ? `public-daily-export-${market.toLowerCase()}-batch-v1`
                : `public-daily-export-${market.toLowerCase()}-compact-batch-v1`,
              text: `
      WITH requested AS (
        SELECT market, code, name
          FROM jsonb_to_recordset($1::jsonb) AS item(market text, code text, name text)
      )
      SELECT row_to_json(payload)::text AS item_json
        FROM requested r
        LEFT JOIN instrument_fundamental_snapshots f
          ON f.market = r.market AND f.code = r.code
        LEFT JOIN LATERAL (
          SELECT json_agg(${candleJsonExpression} ORDER BY recent.candle_date ASC) AS candles,
                 MAX(recent.candle_date) AS latest_candle_date,
                 MAX(recent.fetched_at) AS data_updated_at,
                 COUNT(*)::int AS returned_count
            FROM (
              SELECT c.candle_date, c.open, c.high, c.low, c.close, c.volume,
                     ${tradingValueExpression} AS trading_value,
                     c.fetched_at
                FROM ${candleTable} c
               WHERE c.market = r.market
                 AND c.code = r.code
                 AND c.timeframe = 'D'
                 AND ${validDailyCandleSql("c")}
               ORDER BY c.candle_date DESC
               LIMIT 20
            ) recent
        ) d ON TRUE
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
                 'candles', COALESCE(d.candles, '[]'::json)${compactCandleSchema},
                 'metadata', json_build_object(
                   'latestCandleDate', d.latest_candle_date,
                   'dataUpdatedAt', CASE WHEN d.data_updated_at IS NULL THEN NULL ELSE to_char(d.data_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
                   'returnedCount', COALESCE(d.returned_count, 0)::int
                 )
                 ) AS daily
        ) payload
       ORDER BY r.market, r.code
              `,
              values: [JSON.stringify(keys)],
            });
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
          for (const row of result.rows) {
            yield row.item_json;
          }
        }
        await waveResults;
      }
    })();

    const filename = `daily-candles-${market.toLowerCase()}${format === "compact" ? "-compact" : ""}.json.gz`;
    const gzipLevel = 9;
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
  return getPublicDailyExport(market, requestedFormat === "compact" ? "compact" : "full");
}
