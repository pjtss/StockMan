import { createGzip } from "node:zlib";
import { getPool } from "@/lib/db";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";
import { US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL } from "@/lib/us-depositary-receipt-classification";

type ExportMarket = "KR" | "US";

type ExportRow = { item_json: string };

type ExportKey = { market: string; code: string; has_trading_value: boolean };

const EXPORT_CONFIG: Record<ExportMarket, {
  universeTable: string;
  candleTable: string;
  eligibility: string;
}> = {
  KR: {
    universeTable: "kr_common_stock_universe",
    candleTable: "kr_instrument_universe_candles",
    eligibility: "u.enabled=true AND u.instrument_type='COMMON_STOCK' AND u.is_etp=false AND u.is_warrant=false AND u.is_preferred=false",
  },
  US: {
    universeTable: "us_common_stock_universe",
    candleTable: "us_instrument_universe_candles",
    eligibility: `u.enabled=true AND u.instrument_type='COMMON_STOCK' AND u.is_etf=false AND u.is_warrant=false AND u.is_derivative=false AND u.is_dr=false AND u.is_leveraged=false AND u.is_inverse=false AND ${US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL}`,
  },
};

function gzipJsonStream(items: AsyncIterable<string>) {
  let compressor: ReturnType<typeof createGzip> | null = null;
  let stopHeartbeat = () => undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const activeCompressor = createGzip({ level: 3 });
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
      activeCompressor.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      activeCompressor.on("error", (error) => {
        stopHeartbeat();
        controller.error(error);
      });
      activeCompressor.on("end", () => {
        stopHeartbeat();
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
          if (pending.length === 50) await writePending();
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

export async function getPublicDailyExport(market: ExportMarket) {
  const { universeTable, candleTable, eligibility } = EXPORT_CONFIG[market];
  try {
    const pool = getPool();
    const eligible = await pool.query<ExportKey>(`
      SELECT u.market, u.code,
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
    if (eligible.rows.length === 0) return errorResponse();

    const chunkSize = 500;
    const chunks: ExportKey[][] = [];
    for (let index = 0; index < eligible.rows.length; index += chunkSize) {
      chunks.push(eligible.rows.slice(index, index + chunkSize));
    }
    const concurrency = market === "US" ? 10 : 5;
    const tradingValueExpression = eligible.rows[0].has_trading_value
      ? `CASE WHEN c.trading_value::text ~ '^[+-]?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
               THEN c.trading_value::double precision
               ELSE c.close * c.volume
          END`
      : `c.close * c.volume`;
    const items = (async function* (): AsyncGenerator<string> {
      for (let offset = 0; offset < chunks.length; offset += concurrency) {
        const chunkResults = await Promise.all(chunks.slice(offset, offset + concurrency).map((keys) => pool.query<ExportRow>(`
      WITH requested AS (
        SELECT market, code
          FROM jsonb_to_recordset($1::jsonb) AS item(market text, code text)
      )
      SELECT json_build_object(
               'ticker', json_build_object('market', u.market, 'code', u.code, 'name', u.name),
               'marketCap', json_build_object(
                 'value', CASE
                   WHEN f.market_cap > 0
                    AND f.market_cap < '1.7976931348623157e308'::double precision THEN f.market_cap
                   ELSE NULL
                 END,
                 'currency', COALESCE(NULLIF(f.currency, ''), CASE WHEN u.market IN ('KOSPI', 'KOSDAQ') THEN 'KRW' ELSE 'USD' END),
                 'observedAt', CASE WHEN f.observed_at IS NULL THEN NULL ELSE to_char(f.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
                 'fetchedAt', CASE WHEN f.fetched_at IS NULL THEN NULL ELSE to_char(f.fetched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
               ),
               'daily', json_build_object(
                 'candles', COALESCE(d.candles, '[]'::json),
                 'metadata', json_build_object(
                   'latestCandleDate', d.latest_candle_date,
                   'dataUpdatedAt', CASE WHEN d.data_updated_at IS NULL THEN NULL ELSE to_char(d.data_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
                   'returnedCount', COALESCE(d.returned_count, 0)::int
                 )
               )
             )::text AS item_json
        FROM requested r
        JOIN ${universeTable} u ON u.market = r.market AND u.code = r.code
        LEFT JOIN instrument_fundamental_snapshots f
          ON f.market = u.market AND f.code = u.code
        LEFT JOIN LATERAL (
          SELECT json_agg(
                   json_build_object(
                     'date', recent.candle_date,
                     'open', recent.open,
                     'high', recent.high,
                     'low', recent.low,
                     'close', recent.close,
                     'volume', recent.volume,
                     'tradingValue', recent.trading_value,
                     'fetchedAt', to_char(recent.fetched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                   ) ORDER BY recent.candle_date ASC
                 ) AS candles,
                 MAX(recent.candle_date) AS latest_candle_date,
                 MAX(recent.fetched_at) AS data_updated_at,
                 COUNT(*)::int AS returned_count
            FROM (
              SELECT c.candle_date, c.open, c.high, c.low, c.close, c.volume,
                     ${tradingValueExpression} AS trading_value,
                     c.fetched_at
                FROM ${candleTable} c
               WHERE c.market = u.market
                 AND c.code = u.code
                 AND c.timeframe = 'D'
                 AND ${validDailyCandleSql("c")}
               ORDER BY c.candle_date DESC, c.fetched_at DESC
               LIMIT 20
            ) recent
        ) d ON TRUE
       WHERE ${eligibility}
       ORDER BY u.market, u.code
    `, [JSON.stringify(keys)])));
        for (const result of chunkResults) {
          for (const row of result.rows) {
            yield row.item_json;
          }
        }
      }
    })();

    const filename = `daily-candles-${market.toLowerCase()}.json.gz`;
    return new Response(gzipJsonStream(items), {
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
