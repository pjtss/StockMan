import "./load-local-env.mjs";
import "./load-local-env.mjs";
import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const tables = [
    ["KR", "D", "kr_instrument_universe_candles"],
    ["US", "D", "us_instrument_universe_candles"],
    ["KR", "1m", "kr_minute_candles"],
    ["US", "1m", "us_minute_candles"],
  ];
  const results = [];
  for (const [market, timeframe, table] of tables) {
    const query = timeframe === "D"
      ? `SELECT COUNT(*)::int AS rows, COUNT(DISTINCT code)::int AS instruments, MIN(candle_date) AS min_date, MAX(candle_date) AS max_date, COUNT(DISTINCT candle_date)::int AS dates FROM ${table} WHERE timeframe='D' AND close > 0 AND volume > 0`
      : `SELECT COUNT(*)::int AS rows, COUNT(DISTINCT code)::int AS instruments, MIN(candle_date) AS min_date, MAX(candle_date) AS max_date, COUNT(DISTINCT candle_date)::int AS dates, COUNT(DISTINCT candle_time)::int AS times FROM ${table} WHERE close > 0`;
    const row = (await client.query(query)).rows[0];
    results.push({ market, timeframe, table, ...row, usableForIntradayValidation: timeframe === "1m" && Number(row.dates ?? 0) >= 20, reason: timeframe === "1m" && Number(row.dates ?? 0) < 20 ? "INSUFFICIENT_INTRADAY_HISTORY" : null });
  }
  const intraday = results.filter((x) => x.timeframe === "1m");
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), policy: { minimumIntradayDates: 20, minimumDailyDates: 60, completedBarsOnly: true, noPromotionWhenInsufficient: true }, results, readyForIntradayPromotion: intraday.every((x) => x.usableForIntradayValidation) }, null, 2));
} finally { await client.end(); }
