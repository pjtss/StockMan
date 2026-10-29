import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pg = require("../.next/standalone/node_modules/pg");

const { Pool } = pg;
const args = new Map(process.argv.slice(2).filter((value) => value.startsWith("--")).map((value) => {
  const [key, ...rest] = value.slice(2).split("=");
  return [key, rest.join("=") || "true"];
}));

const apiBase = process.env.DAILY_CACHE_API_URL;
const databaseUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
const limit = Math.min(Math.max(Number(args.get("limit") || 70), 1), 300);
const batchSize = Math.min(Math.max(Number(args.get("batch") || 100), 1), 100);
const concurrency = Math.min(Math.max(Number(args.get("concurrency") || 10), 1), 12);
const requestsPerSecond = 10;
const maxMarketCapUsd = Number(args.get("max-market-cap") || 50_000_000);

if (!apiBase || !databaseUrl) {
  throw new Error("DAILY_CACHE_API_URL, LOCAL_DATABASE_URL 또는 DATABASE_URL이 필요합니다.");
}

const pool = new Pool({ connectionString: databaseUrl });
const requestTimes = [];
let rateQueue = Promise.resolve();

async function waitForRateSlot() {
  let release;
  const previous = rateQueue;
  rateQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  while (true) {
    const now = Date.now();
    while (requestTimes.length && now - requestTimes[0] >= 1000) requestTimes.shift();
    if (requestTimes.length < requestsPerSecond) {
      requestTimes.push(now);
      release();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(25, 1000 - (now - requestTimes[0]))));
  }
}

async function getJson(path, params) {
  const url = new URL(path, apiBase);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 1; attempt <= 4; attempt++) {
    await waitForRateSlot();
    const response = await fetch(url);
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.ok) return payload;
    if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      continue;
    }
    throw new Error(`운영 API 실패: ${response.status} ${path}`);
  }
  throw new Error(`운영 API 재시도 초과: ${path}`);
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

try {
  const runStartedAt = new Date();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS us_daily_open_high_50_results (
      run_started_at timestamptz NOT NULL,
      market text NOT NULL,
      code text NOT NULL,
      name text NOT NULL,
      market_cap_usd numeric NOT NULL,
      market_cap_observed_at timestamptz NULL,
      candle_count integer NOT NULL,
      surge_date text NOT NULL,
      surge_open numeric NOT NULL,
      surge_high numeric NOT NULL,
      surge_open_to_high_rate numeric NOT NULL,
      latest_candle_date text NULL,
      candle_data_updated_at timestamptz NULL,
      criteria jsonb NOT NULL,
      PRIMARY KEY (run_started_at, market, code)
    )
  `);
  const { rows: universe } = await pool.query(`
    SELECT market, code, name
      FROM us_common_stock_universe
     WHERE enabled = true
       AND daily_active = true
       AND instrument_type = 'COMMON_STOCK'
       AND COALESCE(is_etf, false) = false
     ORDER BY market, code
  `);

  const matches = [];
  const excluded = { missingMarketCap: 0, overMarketCap: 0, noCandles: 0, noSurge: 0 };
  const batches = [];
  for (let offset = 0; offset < universe.length; offset += batchSize) batches.push({ offset, rows: universe.slice(offset, offset + batchSize) });
  let cursor = 0;
  async function worker() {
    while (true) {
      const job = batches[cursor++];
      if (!job) return;
      const { offset, rows } = job;
      for (const market of ["NAS", "NYS", "AMS"]) {
      const marketRows = rows.filter((row) => row.market === market);
      if (!marketRows.length) continue;
      const codes = marketRows.map((row) => row.code);
      const [fundamentals, daily] = await Promise.all([
        getJson("/api/public/instrument-fundamentals", { market, codes: codes.join(",") }),
        getJson("/api/public/daily-candles", { market, codes: codes.join(","), timeframe: "D", limit }),
      ]);
      const fundamentalsByCode = new Map((fundamentals.items || []).map((item) => [item.code, item]));
      const candlesByCode = new Map((daily.items || []).map((item) => [item.code, item.candles || []]));
      for (const row of marketRows) {
        const fundamental = fundamentalsByCode.get(row.code);
        const marketCap = number(fundamental?.marketCap);
        if (marketCap == null) { excluded.missingMarketCap++; continue; }
        if (marketCap > maxMarketCapUsd) { excluded.overMarketCap++; continue; }
        const candles = candlesByCode.get(row.code) || [];
        if (!candles.length) { excluded.noCandles++; continue; }
        const surge = candles.find((candle) => number(candle.open) > 0 && number(candle.high) >= number(candle.open) * 1.5);
        if (!surge) { excluded.noSurge++; continue; }
        matches.push({
          market,
          code: row.code,
          name: fundamental?.name || row.name || "",
          marketCapUsd: marketCap,
          marketCapObservedAt: fundamental?.observedAt ?? null,
          candleCount: candles.length,
          surgeDate: surge.date,
          surgeOpen: number(surge.open),
          surgeHigh: number(surge.high),
          surgeOpenToHighRate: number(surge.high) / number(surge.open) - 1,
          latestCandleDate: candles.at(-1)?.date ?? null,
          candleDataUpdatedAt: daily.metadata?.dataUpdatedAt ?? null,
        });
      }
      }
      console.error(`[us-daily-open-high-50] ${Math.min(offset + batchSize, universe.length)}/${universe.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  matches.sort((a, b) => b.surgeOpenToHighRate - a.surgeOpenToHighRate || a.code.localeCompare(b.code));
  const criteria = { maxMarketCapUsd, lookback: "up to 3 months", candleLimit: limit, rule: "high >= open * 1.5", source: "OPERATING_DB_API" };
  for (const item of matches) {
    await pool.query(`INSERT INTO us_daily_open_high_50_results
      (run_started_at, market, code, name, market_cap_usd, market_cap_observed_at, candle_count, surge_date, surge_open, surge_high, surge_open_to_high_rate, latest_candle_date, candle_data_updated_at, criteria)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [runStartedAt, item.market, item.code, item.name, item.marketCapUsd, item.marketCapObservedAt, item.candleCount, item.surgeDate, item.surgeOpen, item.surgeHigh, item.surgeOpenToHighRate, item.latestCandleDate, item.candleDataUpdatedAt, criteria]);
  }
  console.log(JSON.stringify({
    ok: true,
    criteria: {
      market: "US",
      instrumentType: "COMMON_STOCK",
      maxMarketCapUsd,
      lookback: "up to 3 months",
      candleLimit: limit,
      rule: "high >= open * 1.5",
      source: "OPERATING_DB_API",
      concurrency,
    },
    universeCount: universe.length,
    matchedCount: matches.length,
    savedTo: "us_daily_open_high_50_results",
    runStartedAt: runStartedAt.toISOString(),
    excluded,
    matches,
  }, null, 2));
} finally {
  await pool.end();
}
