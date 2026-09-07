import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });
console.log(JSON.stringify({ databaseHost: new URL(process.env.DATABASE_URL).hostname }));
await client.connect();
try {
  await client.query("CREATE INDEX IF NOT EXISTS kr_candles_positive_volume_lookup_idx ON kr_instrument_universe_candles (market, timeframe, code, candle_date DESC) WHERE volume > 0");
  await client.query("CREATE INDEX IF NOT EXISTS us_candles_positive_volume_lookup_idx ON us_instrument_universe_candles (market, timeframe, code, candle_date DESC) WHERE volume > 0");
  await client.query("CREATE INDEX IF NOT EXISTS kr_latest_positive_daily_candle_idx ON kr_instrument_universe_candles (market, code, candle_date DESC) WHERE timeframe = 'D' AND volume > 0");
  await client.query("CREATE INDEX IF NOT EXISTS us_latest_positive_daily_candle_idx ON us_instrument_universe_candles (market, code, candle_date DESC) WHERE timeframe = 'D' AND volume > 0");
  await client.query("CREATE INDEX IF NOT EXISTS kr_common_stock_universe_daily_active_common_idx ON kr_common_stock_universe (market, code) WHERE enabled = TRUE AND daily_active = TRUE AND instrument_type = 'COMMON_STOCK'");
  await client.query("CREATE INDEX IF NOT EXISTS us_common_stock_universe_daily_active_common_idx ON us_common_stock_universe (market, code) WHERE enabled = TRUE AND daily_active = TRUE AND instrument_type = 'COMMON_STOCK'");
  await client.query("CREATE INDEX IF NOT EXISTS instrument_fundamental_screener_cover_idx ON instrument_fundamental_snapshots (market, code) INCLUDE (market_cap, shares_outstanding, currency, observed_at, fetched_at)");
  await client.query("CREATE INDEX IF NOT EXISTS kr_candles_screener_cover_idx ON kr_instrument_universe_candles (market, code, timeframe, candle_date) INCLUDE (open, high, low, close, volume, fetched_at) WHERE volume > 0");
  await client.query("CREATE INDEX IF NOT EXISTS us_candles_screener_cover_idx ON us_instrument_universe_candles (market, code, timeframe, candle_date) INCLUDE (open, high, low, close, volume, fetched_at) WHERE volume > 0");
  await client.query(`CREATE TABLE IF NOT EXISTS kr_latest_daily_candles (market text NOT NULL, code text NOT NULL, candle_date text NOT NULL, open double precision, high double precision, low double precision, close double precision, volume double precision, fetched_at timestamptz NOT NULL DEFAULT NOW(), PRIMARY KEY (market, code))`);
  await client.query(`CREATE TABLE IF NOT EXISTS us_latest_daily_candles (market text NOT NULL, code text NOT NULL, candle_date text NOT NULL, open double precision, high double precision, low double precision, close double precision, volume double precision, fetched_at timestamptz NOT NULL DEFAULT NOW(), PRIMARY KEY (market, code))`);
  await client.query(`INSERT INTO kr_latest_daily_candles (market, code, candle_date, open, high, low, close, volume, fetched_at) SELECT DISTINCT ON (market, code) market, code, candle_date, open, high, low, close, volume, fetched_at FROM kr_instrument_universe_candles WHERE timeframe='D' AND volume > 0 AND close IS NOT NULL ORDER BY market, code, candle_date DESC, fetched_at DESC ON CONFLICT (market, code) DO UPDATE SET candle_date=excluded.candle_date, open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, fetched_at=excluded.fetched_at WHERE kr_latest_daily_candles.candle_date <= excluded.candle_date`);
  await client.query(`INSERT INTO us_latest_daily_candles (market, code, candle_date, open, high, low, close, volume, fetched_at) SELECT DISTINCT ON (market, code) market, code, candle_date, open, high, low, close, volume, fetched_at FROM us_instrument_universe_candles WHERE timeframe='D' AND volume > 0 AND close IS NOT NULL ORDER BY market, code, candle_date DESC, fetched_at DESC ON CONFLICT (market, code) DO UPDATE SET candle_date=excluded.candle_date, open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, fetched_at=excluded.fetched_at WHERE us_latest_daily_candles.candle_date <= excluded.candle_date`);
  await client.query("ANALYZE kr_instrument_universe_candles");
  await client.query("ANALYZE us_instrument_universe_candles");
  console.log(JSON.stringify({ appliedLocalIndexes: true }));
  for (const query of [
    "SELECT 'kr' AS scope, count(*)::int AS rows, count(*) FILTER (WHERE enabled AND instrument_type='COMMON_STOCK')::int AS active_common FROM kr_common_stock_universe",
    "SELECT 'us' AS scope, count(*)::int AS rows, count(*) FILTER (WHERE enabled AND instrument_type='COMMON_STOCK')::int AS active_common FROM us_common_stock_universe",
    "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND indexname LIKE '%common_stock%active%' ORDER BY indexname",
  ]) console.log(JSON.stringify((await client.query(query)).rows));
  const plan = await client.query("EXPLAIN (ANALYZE, BUFFERS, TIMING) SELECT market, code, name FROM kr_common_stock_universe WHERE enabled=true AND instrument_type='COMMON_STOCK' ORDER BY market, code");
  console.log(plan.rows.map((row) => row['QUERY PLAN']).join("\n"));
  const candlePlan = await client.query("EXPLAIN (ANALYZE, BUFFERS, TIMING) SELECT market, code, candle_date, close, volume FROM kr_instrument_universe_candles WHERE market = ANY($1) AND timeframe = 'D' AND volume > 0 ORDER BY market, code, candle_date DESC LIMIT 500", [["KOSPI", "KOSDAQ"]]);
  console.log(candlePlan.rows.map((row) => row['QUERY PLAN']).join("\n"));
  const screenerPlan = await client.query(`EXPLAIN (ANALYZE, BUFFERS, TIMING)
    WITH latest AS (
      SELECT market, code, max(candle_date) AS candle_date
      FROM kr_instrument_universe_candles
      WHERE timeframe = 'D' AND volume > 0 AND market = ANY($1)
      GROUP BY market, code
    )
    SELECT u.market, u.code, u.name, c.candle_date, c.close, c.volume
    FROM kr_common_stock_universe u
    JOIN latest l ON l.market = u.market AND l.code = u.code
    JOIN kr_instrument_universe_candles c
      ON c.market = l.market AND c.code = l.code AND c.timeframe = 'D' AND c.candle_date = l.candle_date
    WHERE u.enabled = true AND u.instrument_type = 'COMMON_STOCK'
    ORDER BY u.market, u.code`, [["KOSPI", "KOSDAQ"]]);
  console.log(screenerPlan.rows.map((row) => row['QUERY PLAN']).join("\n"));
  const usPlan = await client.query(`EXPLAIN (ANALYZE, BUFFERS, TIMING)
    WITH latest AS (
      SELECT market, code, max(candle_date) AS candle_date
      FROM us_instrument_universe_candles
      WHERE timeframe = 'D' AND volume > 0 AND market = ANY($1)
      GROUP BY market, code
    )
    SELECT u.market, u.code, u.name, c.candle_date, c.close, c.volume
    FROM us_common_stock_universe u
    JOIN latest l ON l.market = u.market AND l.code = u.code
    JOIN us_instrument_universe_candles c
      ON c.market = l.market AND c.code = l.code AND c.timeframe = 'D' AND c.candle_date = l.candle_date
    WHERE u.enabled = true AND u.instrument_type = 'COMMON_STOCK'
    ORDER BY u.market, u.code`, [["NAS", "NYS", "AMS"]]);
  console.log(usPlan.rows.map((row) => row['QUERY PLAN']).join("\n"));
  const summaryPlan = await client.query(`EXPLAIN (ANALYZE, BUFFERS, TIMING)
    SELECT u.market, u.code, u.name, l.candle_date, l.close, l.volume
    FROM kr_common_stock_universe u JOIN kr_latest_daily_candles l ON l.market=u.market AND l.code=u.code
    WHERE u.enabled=true AND u.instrument_type='COMMON_STOCK' ORDER BY u.market, u.code`);
  console.log(summaryPlan.rows.map((row) => row['QUERY PLAN']).join("\n"));
} finally {
  await client.end();
}
