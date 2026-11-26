import { createGzip } from "node:zlib";
import { getPool } from "@/lib/db";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";
import { US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL } from "@/lib/us-depositary-receipt-classification";

type ExportMarket = "KR" | "US";

type CandleRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradingValue: number;
  fetchedAt: string | Date | null;
};

type ExportRow = {
  market: string;
  code: string;
  name: string | null;
  market_cap: number | string | null;
  market_cap_currency: string | null;
  market_cap_observed_at: string | Date | null;
  market_cap_fetched_at: string | Date | null;
  candles: CandleRow[] | null;
  latest_candle_date: string | null;
  data_updated_at: string | Date | null;
  returned_count: number | string | null;
};

type ExportKey = { market: string; code: string };

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

function toIsoOrNull(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function gzipJsonStream(items: AsyncIterable<unknown>) {
  let compressor: ReturnType<typeof createGzip> | null = null;
  let stopHeartbeat = () => undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const activeCompressor = createGzip({ level: 9 });
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
        for await (const item of items) {
          await write(`${index === 0 ? "" : ","}${JSON.stringify(item)}`);
          index += 1;
          if (index % 50 === 0) await flush();
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

export async function getPublicDailyExport(market: ExportMarket) {
  const { universeTable, candleTable, eligibility } = EXPORT_CONFIG[market];
  try {
    const pool = getPool();
    const eligible = await pool.query<ExportKey>(`
      SELECT u.market, u.code
        FROM ${universeTable} u
       WHERE ${eligibility}
       ORDER BY u.market, u.code
    `);
    if (eligible.rows.length === 0) return errorResponse();

    const chunkSize = 250;
    const chunks: ExportKey[][] = [];
    for (let index = 0; index < eligible.rows.length; index += chunkSize) {
      chunks.push(eligible.rows.slice(index, index + chunkSize));
    }
    const concurrency = 5;
    const items = (async function* (): AsyncGenerator<unknown> {
      for (let offset = 0; offset < chunks.length; offset += concurrency) {
        const chunkResults = await Promise.all(chunks.slice(offset, offset + concurrency).map((keys) => pool.query<ExportRow>(`
      WITH requested AS (
        SELECT market, code
          FROM jsonb_to_recordset($1::jsonb) AS item(market text, code text)
      )
      SELECT u.market, u.code, u.name,
             f.market_cap,
             COALESCE(NULLIF(f.currency, ''), CASE WHEN u.market IN ('KOSPI', 'KOSDAQ') THEN 'KRW' ELSE 'USD' END) AS market_cap_currency,
             f.observed_at AS market_cap_observed_at,
             f.fetched_at AS market_cap_fetched_at,
             COALESCE(d.candles, '[]'::jsonb) AS candles,
             d.latest_candle_date,
             d.data_updated_at,
             COALESCE(d.returned_count, 0)::int AS returned_count
        FROM requested r
        JOIN ${universeTable} u ON u.market = r.market AND u.code = r.code
        LEFT JOIN instrument_fundamental_snapshots f
          ON f.market = u.market AND f.code = u.code
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'date', recent.candle_date,
                     'open', recent.open,
                     'high', recent.high,
                     'low', recent.low,
                     'close', recent.close,
                     'volume', recent.volume,
                     'tradingValue', recent.trading_value,
                     'fetchedAt', recent.fetched_at
                   ) ORDER BY recent.candle_date ASC
                 ) AS candles,
                 MAX(recent.candle_date) AS latest_candle_date,
                 MAX(recent.fetched_at) AS data_updated_at,
                 COUNT(*)::int AS returned_count
            FROM (
              SELECT c.candle_date, c.open, c.high, c.low, c.close, c.volume,
                     CASE WHEN COALESCE(to_jsonb(c)->>'trading_value', '') ~ '^[+-]?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
                          THEN (to_jsonb(c)->>'trading_value')::double precision
                          ELSE c.close * c.volume
                     END AS trading_value,
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
            const rawMarketCap = row.market_cap === null ? null : Number(row.market_cap);
            const marketCapValue = rawMarketCap !== null && Number.isFinite(rawMarketCap) && rawMarketCap > 0
              ? rawMarketCap
              : null;
            const candles = Array.isArray(row.candles) ? row.candles : [];
            const latestDate = row.latest_candle_date ?? candles.at(-1)?.date ?? null;
            const candleUpdatedAt = toIsoOrNull(row.data_updated_at)
              ?? candles.reduce<string | null>((latest, candle) => {
                const fetchedAt = toIsoOrNull(candle.fetchedAt);
                return fetchedAt && (!latest || fetchedAt > latest) ? fetchedAt : latest;
              }, null);

            yield {
              ticker: { market: row.market, code: row.code, name: row.name },
              marketCap: {
                value: marketCapValue,
                currency: row.market_cap_currency,
                observedAt: toIsoOrNull(row.market_cap_observed_at),
                fetchedAt: toIsoOrNull(row.market_cap_fetched_at),
              },
              daily: {
                candles: candles.map((candle) => ({
                  date: candle.date,
                  open: Number(candle.open),
                  high: Number(candle.high),
                  low: Number(candle.low),
                  close: Number(candle.close),
                  volume: Number(candle.volume),
                  tradingValue: Number(candle.tradingValue),
                  fetchedAt: toIsoOrNull(candle.fetchedAt),
                })),
                metadata: {
                  latestCandleDate: latestDate,
                  dataUpdatedAt: candleUpdatedAt,
                  returnedCount: Number(row.returned_count ?? candles.length),
                },
              },
            };
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
