import { sql, type SQL } from "drizzle-orm";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";

type Market = "KR" | "US";
type SqlExecutor = (statement: SQL) => Promise<unknown>;

const TABLES: Record<Market, { source: string; cache: string }> = {
  KR: {
    source: "kr_instrument_universe_candles",
    cache: "kr_recent_daily_candles",
  },
  US: {
    source: "us_instrument_universe_candles",
    cache: "us_recent_daily_candles",
  },
};

/** Keep the API's bounded daily read table in the same transaction as a candle upsert. */
export async function refreshRecentDailyCandleCache(
  execute: SqlExecutor,
  region: Market,
  exchange: string,
  code: string,
) {
  const { source, cache } = TABLES[region];
  const sourceTable = sql.raw(source);
  const cacheTable = sql.raw(cache);
  const validCandle = sql.raw(validDailyCandleSql("c"));

  await execute(sql`
    WITH recent AS MATERIALIZED (
      SELECT c.market, c.code, c.timeframe, c.candle_date,
             c.open, c.high, c.low, c.close, c.volume, c.trading_value, c.fetched_at
        FROM ${sourceTable} c
       WHERE c.market = ${exchange}
         AND c.code = ${code}
         AND c.timeframe = 'D'
         AND ${validCandle}
       ORDER BY c.candle_date DESC
       LIMIT 20
    ), upserted AS (
      INSERT INTO ${cacheTable}
        (market, code, timeframe, candle_date, open, high, low, close, volume, trading_value, fetched_at)
      SELECT market, code, timeframe, candle_date, open, high, low, close, volume, trading_value, fetched_at
        FROM recent
      ON CONFLICT (market, code, candle_date) DO UPDATE
        SET timeframe = EXCLUDED.timeframe,
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume,
            trading_value = EXCLUDED.trading_value,
            fetched_at = EXCLUDED.fetched_at
      RETURNING candle_date
    )
    DELETE FROM ${cacheTable} cached
     WHERE cached.market = ${exchange}
       AND cached.code = ${code}
       AND NOT EXISTS (SELECT 1 FROM recent WHERE recent.candle_date = cached.candle_date)
       AND (SELECT COUNT(*) FROM upserted) >= 0
  `);
}
