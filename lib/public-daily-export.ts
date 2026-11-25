import { gzip } from "node:zlib";
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

function gzipLevel9(input: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    gzip(input, { level: 9 }, (error, compressed) => {
      if (error) reject(error);
      else resolve(compressed);
    });
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
    const result = await getPool().query<ExportRow>(`
      SELECT u.market, u.code, u.name,
             f.market_cap,
             COALESCE(NULLIF(f.currency, ''), CASE WHEN u.market IN ('KOSPI', 'KOSDAQ') THEN 'KRW' ELSE 'USD' END) AS market_cap_currency,
             f.observed_at AS market_cap_observed_at,
             f.fetched_at AS market_cap_fetched_at,
             COALESCE(d.candles, '[]'::jsonb) AS candles,
             d.latest_candle_date,
             d.data_updated_at,
             COALESCE(d.returned_count, 0)::int AS returned_count
        FROM ${universeTable} u
        LEFT JOIN LATERAL (
          SELECT snapshot.market_cap, snapshot.currency, snapshot.observed_at, snapshot.fetched_at
            FROM instrument_fundamental_snapshots snapshot
           WHERE snapshot.market = u.market AND snapshot.code = u.code
           ORDER BY snapshot.observed_at DESC NULLS LAST, snapshot.fetched_at DESC NULLS LAST
           LIMIT 1
        ) f ON TRUE
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
    `);

    if (result.rows.length === 0) return errorResponse();

    const items = result.rows.map((row) => {
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

      return {
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
    });

    const compressed = await gzipLevel9(Buffer.from(JSON.stringify(items), "utf8"));
    const filename = `daily-candles-${market.toLowerCase()}.json.gz`;
    return new Response(new Uint8Array(compressed), {
      status: 200,
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-length": String(compressed.byteLength),
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        pragma: "no-cache",
        expires: "0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error(`[API /public/daily-export/${market.toLowerCase()}] Error:`, error instanceof Error ? error.message : "unknown error");
    return errorResponse();
  }
}
