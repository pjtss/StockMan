import pg from "pg";
import { loadLocalEnv } from "./local-env.mjs";

loadLocalEnv({ required: true });
const connectionString = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("LOCAL_DATABASE_URL or DATABASE_URL is required");
const host = new URL(connectionString).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`Refusing non-local database host: ${host}`);
}

const { Client } = pg;
const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
const tables = [
  { market: "KR", candles: "kr_instrument_universe_candles", summary: "kr_latest_daily_candles", universe: "kr_common_stock_universe" },
  { market: "US", candles: "us_instrument_universe_candles", summary: "us_latest_daily_candles", universe: "us_common_stock_universe" },
];

function invalidPredicate(alias = "c") {
  return `(${alias}.candle_date !~ '^[0-9]{8}$'
    OR CASE WHEN ${alias}.candle_date ~ '^[0-9]{8}$' THEN
      substring(${alias}.candle_date, 1, 4)::integer NOT BETWEEN 1 AND 9999
      OR substring(${alias}.candle_date, 5, 2)::integer NOT BETWEEN 1 AND 12
      OR substring(${alias}.candle_date, 7, 2)::integer NOT BETWEEN 1 AND CASE substring(${alias}.candle_date, 5, 2)::integer
        WHEN 2 THEN CASE WHEN substring(${alias}.candle_date, 1, 4)::integer % 400 = 0 OR (substring(${alias}.candle_date, 1, 4)::integer % 4 = 0 AND substring(${alias}.candle_date, 1, 4)::integer % 100 <> 0) THEN 29 ELSE 28 END
        WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END
      ELSE false END
    OR ${alias}.open IS NULL OR ${alias}.high IS NULL OR ${alias}.low IS NULL OR ${alias}.close IS NULL OR ${alias}.volume IS NULL
    OR ${alias}.open <= 0 OR ${alias}.high <= 0 OR ${alias}.low <= 0 OR ${alias}.close <= 0 OR ${alias}.volume < 0
    OR ${alias}.high < GREATEST(${alias}.open, ${alias}.low, ${alias}.close)
    OR ${alias}.low > LEAST(${alias}.open, ${alias}.high, ${alias}.close)
    OR ${alias}.open::text IN ('NaN','Infinity','-Infinity')
    OR ${alias}.high::text IN ('NaN','Infinity','-Infinity')
    OR ${alias}.low::text IN ('NaN','Infinity','-Infinity')
    OR ${alias}.close::text IN ('NaN','Infinity','-Infinity')
    OR ${alias}.volume::text IN ('NaN','Infinity','-Infinity'))`;
}

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '20000ms'");
  const results = [];
  for (const tablesForMarket of tables) {
    const { market, candles, summary, universe } = tablesForMarket;
    const invalid = invalidPredicate();
    const byMarket = await client.query(`
      SELECT market, COUNT(*)::bigint AS candle_count,
             COUNT(*) FILTER (WHERE ${invalid})::bigint AS invalid_count,
             MIN(candle_date) AS first_date, MAX(candle_date) AS last_date
        FROM ${candles} c
       WHERE c.timeframe = 'D'
       GROUP BY market ORDER BY market`);
    const invalidSummary = await client.query(`
      SELECT s.market, COUNT(*)::bigint AS invalid_summary_count
        FROM ${summary} s
       WHERE ${invalidPredicate("s")}
       GROUP BY s.market ORDER BY s.market`);
    const invalidSummarySample = await client.query(`
      SELECT s.market, s.code, s.candle_date
        FROM ${summary} s
       WHERE ${invalidPredicate("s")}
       ORDER BY s.candle_date DESC, s.market, s.code
       LIMIT 20`);
    const duplicateKeys = await client.query(`
      SELECT market, COUNT(*)::bigint AS duplicate_key_count
        FROM (
          SELECT market, code, timeframe, candle_date
            FROM ${candles}
           WHERE timeframe = 'D'
           GROUP BY market, code, timeframe, candle_date
          HAVING COUNT(*) > 1
        ) duplicates
       GROUP BY market ORDER BY market`);
    const invalidSample = await client.query(`
      SELECT market, code, candle_date
        FROM ${candles} c
       WHERE timeframe = 'D' AND ${invalidPredicate("c")}
       ORDER BY candle_date DESC, market, code
       LIMIT 20`);
    const coverage = await client.query(`
      WITH market_latest AS (
        SELECT s.market, MAX(s.candle_date) AS latest_date FROM ${summary} s WHERE NOT ${invalidPredicate("s")} GROUP BY s.market
      )
      SELECT u.market, COUNT(*)::bigint AS eligible_count,
             COUNT(latest.code)::bigint AS cached_count,
             COUNT(*) FILTER (WHERE latest.candle_date = market_latest.latest_date)::bigint AS latest_date_count,
             COUNT(*) FILTER (WHERE latest.code IS NULL OR latest.candle_date < market_latest.latest_date)::bigint AS gap_count,
             market_latest.latest_date
        FROM ${universe} u
        LEFT JOIN ${summary} latest ON latest.market = u.market AND latest.code = u.code AND NOT ${invalidPredicate("latest")}
        LEFT JOIN market_latest ON market_latest.market = u.market
       WHERE u.enabled = true AND u.instrument_type = 'COMMON_STOCK'
       GROUP BY u.market, market_latest.latest_date ORDER BY u.market`);
    results.push({ market, rows: byMarket.rows, invalidSummary: invalidSummary.rows, invalidSummarySample: invalidSummarySample.rows, duplicateKeys: duplicateKeys.rows, invalidSample: invalidSample.rows, coverage: coverage.rows });
  }
  await client.query("ROLLBACK");
  const invalidCount = results.flatMap((item) => item.rows).reduce((total, row) => total + Number(row.invalid_count), 0);
  const invalidSummaryCount = results.flatMap((item) => item.invalidSummary).reduce((total, row) => total + Number(row.invalid_summary_count), 0);
  const duplicateKeyCount = results.flatMap((item) => item.duplicateKeys).reduce((total, row) => total + Number(row.duplicate_key_count), 0);
  const report = { generatedAt: new Date().toISOString(), readOnly: true, invalidCount, invalidSummaryCount, duplicateKeyCount, integrityOk: invalidCount === 0 && invalidSummaryCount === 0 && duplicateKeyCount === 0, markets: results };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.integrityOk) process.exitCode = 1;
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
