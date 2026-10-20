import pg from "pg";
import { resolve } from "node:path";
import { loadLocalEnv } from "../scripts/local-env.mjs";
import { fillMissingDailyCandleItems } from "../lib/daily-candle-fallback.mjs";
import { selectLatestDailySummaryRows } from "../lib/daily-candle-summary.mjs";
import { summarizeDailyCandleCoverage } from "../lib/daily-candle-coverage.mjs";
import { isDailyCacheSyncSuccessful, isDailyCacheWriteVerified } from "../lib/daily-cache-sync-result.mjs";

const { Pool } = pg;
loadLocalEnv({ filePath: resolve(process.cwd(), ".env.local") });
process.env.LOCAL_DATABASE_URL ||= process.env.DATABASE_URL;
process.env.DAILY_CACHE_API_URL ||= process.env.PUBLIC_BASE_URL || process.env.RSS_BULLISH_REPORT_API_BASE_URL;
if (process.env.LOCAL_DATABASE_URL) {
  const databaseHost = new URL(process.env.LOCAL_DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
    throw new Error(`Refusing non-local database host: ${databaseHost}`);
  }
}
const args = new Map(process.argv.slice(2).filter((v) => v.startsWith("--")).map((v) => { const [k, ...r] = v.slice(2).split("="); return [k, r.join("=") || "true"]; }));
const marketArg = String(args.get("market") || "ALL").toUpperCase();
const timeframe = String(args.get("timeframe") || "D").toUpperCase();
const limit = Math.min(Math.max(Number(args.get("limit") || 120), 1), 300);
const batchSize = Math.min(Math.max(Number(args.get("batch") || 100), 1), 100);
const fetchConcurrency = Math.min(Math.max(Number(args.get("fetch-workers") || 3), 1), 8);
const fallbackConcurrency = Math.min(Math.max(Number(args.get("fallback-workers") || 1), 1), 4);
const saveConcurrency = Math.min(Math.max(Number(args.get("save-workers") || 2), 1), 4);
const queueLimit = Math.min(Math.max(Number(args.get("queue") || 10), 1), 50);
const maxInstruments = Math.max(Number(args.get("max-instruments") || 0), 0);
const marketCapUnder = args.has("market-cap-under") ? Number(args.get("market-cap-under")) : null;
const marketCapOver = args.has("market-cap-over") ? Number(args.get("market-cap-over")) : null;
const marketCapUnderInclusive = args.get("market-cap-under-inclusive") === "true";
const usMarketCapUnder = args.has("us-market-cap-under") ? Number(args.get("us-market-cap-under")) : null;
const usMarketCapUnderInclusive = args.get("us-market-cap-under-inclusive") === "true";
const targetDate = args.get("date") || null;
const onlyUnrefreshed = args.get("only-unrefreshed") === "true";
const skipFundamentals = args.get("skip-fundamentals") === "true";
let fallbackRequested = 0;
let fallbackFailed = 0;
const telemetry = { httpRequests: 0, httpDurationMs: 0, fallbackDurationMs: 0, dbSaveBatches: 0, dbSaveDurationMs: 0, dbRowCountMismatches: 0 };

if (!process.env.LOCAL_DATABASE_URL || !process.env.DAILY_CACHE_API_URL) throw new Error(".env.local의 DATABASE_URL과 운영 서버 URL(PUBLIC_BASE_URL 또는 RSS_BULLISH_REPORT_API_BASE_URL)이 필요합니다.");
if (!["D", "W", "M"].includes(timeframe) || !["ALL", "KR", "US"].includes(marketArg)) throw new Error("잘못된 market/timeframe입니다.");
if (targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || Number.isNaN(Date.parse(`${targetDate}T00:00:00Z`)))) throw new Error("--date는 YYYY-MM-DD 형식이어야 합니다.");
if ((marketCapUnder !== null || marketCapOver !== null) && ([marketCapUnder, marketCapOver].some((value) => value !== null && (!Number.isFinite(value) || value <= 0)) || marketArg !== "KR" || timeframe !== "D")) throw new Error("--market-cap-under/over는 양수이며 --market=KR --timeframe=D와 함께 사용해야 합니다.");
if (marketCapUnder !== null && marketCapOver !== null && marketCapOver >= marketCapUnder) throw new Error("--market-cap-over는 --market-cap-under보다 작아야 합니다.");
if (usMarketCapUnder !== null && (!Number.isFinite(usMarketCapUnder) || usMarketCapUnder <= 0 || marketArg !== "US" || timeframe !== "D")) throw new Error("--us-market-cap-under는 양수이며 --market=US --timeframe=D와 함께 사용해야 합니다.");

const pool = new Pool({ connectionString: process.env.LOCAL_DATABASE_URL });
const apiBase = new URL("/api/public/daily-candles", process.env.DAILY_CACHE_API_URL);
const auth = process.env.DAILY_CACHE_READ_API_KEY?.trim()
  ? { authorization: `Bearer ${process.env.DAILY_CACHE_READ_API_KEY.trim()}` }
  : {};

async function fetchJson(url) {
  const startedAt = performance.now();
  telemetry.httpRequests++;
  try {
    let response;
    try {
      response = await fetch(url, { headers: auth, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      const cause = error?.cause?.code || error?.cause?.message || error?.message || "unknown";
      throw new Error(`운영 API 네트워크 오류: ${url.pathname} ${cause}`);
    }
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error(`운영 API JSON 형식 오류: ${response.status} ${url.pathname}`); }
    if (!response.ok) throw new Error(`운영 API 실패: ${response.status} ${url.pathname}`);
    return payload;
  } finally {
    telemetry.httpDurationMs += performance.now() - startedAt;
  }
}

function makeQueue(max) {
  const items = [], waitingPush = [], waitingPop = [];
  let closed = false;
  const push = (item) => new Promise((resolve, reject) => {
    if (closed) return reject(new Error("QUEUE_CLOSED"));
    const pop = waitingPop.shift();
    if (pop) { pop(item); return resolve(); }
    if (items.length < max) { items.push(item); return resolve(); }
    waitingPush.push({ item, resolve, reject });
  });
  const pop = () => new Promise((resolve) => {
    const item = items.shift();
    if (item) { const next = waitingPush.shift(); if (next) { items.push(next.item); next.resolve(); } return resolve(item); }
    if (closed) return resolve(null);
    waitingPop.push(resolve);
  });
  const close = () => { closed = true; for (const resolve of waitingPop.splice(0)) resolve(null); for (const job of waitingPush.splice(0)) job.reject(new Error("QUEUE_CLOSED")); };
  return { push, pop, close };
}

async function fetchBatch(kind, scopes) {
  const table = kind === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
  const byMarket = new Map();
  for (const row of scopes) (byMarket.get(row.market) ?? byMarket.set(row.market, []).get(row.market)).push(row.code);
  const parts = [];
  for (const [market, codes] of byMarket) {
    const url = new URL(apiBase); url.searchParams.set("market", market); url.searchParams.set("codes", codes.join(",")); url.searchParams.set("timeframe", timeframe); url.searchParams.set("limit", String(limit));
    const payload = await fetchJson(url);
    if (!payload.ok || !Array.isArray(payload.items)) throw new Error(`운영 일봉 API 응답 형식 오류: ${market}`);
    if (kind === "KR") {
      const fallback = await fillMissingDailyCandleItems({
        codes,
        items: payload.items,
        concurrency: fallbackConcurrency,
        fetchChart: async (code) => {
          const startedAt = performance.now();
          const chartUrl = new URL("/api/stock/chart", process.env.DAILY_CACHE_API_URL);
          chartUrl.searchParams.set("code", code);
          chartUrl.searchParams.set("market", "KR");
          chartUrl.searchParams.set("timeframe", timeframe);
          try {
            return await fetchJson(chartUrl);
          } finally {
            telemetry.fallbackDurationMs += performance.now() - startedAt;
          }
        },
        onFailure: (code, error) => console.warn(`[async-sync] KR chart fallback failed code=${code}: ${error instanceof Error ? error.message : "unknown error"}`),
      });
      fallbackRequested += fallback.requestedFallbackCount;
      fallbackFailed += fallback.failedCodes.length;
      if (fallback.failedCodes.length) {
        const sample = fallback.failedCodes.slice(0, 10).join(",");
        throw new Error(`KR fallback incomplete: failed=${fallback.failedCodes.length}/${fallback.requestedFallbackCount}, codes=${sample}`);
      }
      payload.items = fallback.items;
    }
    const returnedCodes = new Set();
    for (const item of payload.items) {
      if (!codes.includes(item.code) || returnedCodes.has(item.code)) {
        throw new Error(`운영 일봉 API 종목 목록 오류: ${market}`);
      }
      if (!Array.isArray(item.candles)) {
        throw new Error(`운영 일봉 API 봉 데이터 누락: ${market}/${item.code}`);
      }
      returnedCodes.add(item.code);
    }
    const missingCodes = codes.filter((code) => !returnedCodes.has(code) || !payload.items.find((item) => item.code === code)?.candles.length);
    if (missingCodes.length) {
      if (kind === "KR") throw new Error(`운영 일봉 API 종목 누락: ${market} count=${missingCodes.length} sample=${missingCodes.slice(0, 10).join(",")}`);
      console.warn(`[async-sync] US candles unavailable market=${market} count=${missingCodes.length} sample=${missingCodes.slice(0, 10).join(",")}`);
    }
    let fundamentals = { items: [] };
    if (!skipFundamentals) {
      const fUrl = new URL("/api/public/instrument-fundamentals", process.env.DAILY_CACHE_API_URL); fUrl.searchParams.set("market", market); fUrl.searchParams.set("codes", codes.join(","));
      fundamentals = await fetchJson(fUrl);
      if (!fundamentals.ok || !Array.isArray(fundamentals.items)) throw new Error(`운영 기본정보 API 응답 형식 오류: ${market}`);
    }
    const compactTargetDate = targetDate?.replaceAll("-", "");
    const selectedItems = payload.items.map((item) => ({ ...item, candles: compactTargetDate ? item.candles.filter((candle) => String(candle.date).replaceAll("-", "") === compactTargetDate) : item.candles })).filter((item) => item.candles.length > 0);
    parts.push({ table, market, candles: selectedItems, fundamentals: fundamentals.items, missingCodes });
  }
  return parts;
}

async function persistParts(parts) {
  const startedAt = performance.now();
  const client = await pool.connect();
  let saved = 0;
  try {
    await client.query("BEGIN");
    for (const part of parts) {
      const rows = part.candles.flatMap((item) => (item.candles ?? []).map((candle) => ({ code: item.code, ...candle })));
      if (rows.length) {
        const summaryTable = part.table === "kr_instrument_universe_candles"
          ? "kr_latest_daily_candles"
          : "us_latest_daily_candles";
        const codes = rows.map((row) => row.code);
        const dates = rows.map((row) => row.date);
        const opens = rows.map((row) => row.open);
        const highs = rows.map((row) => row.high);
        const lows = rows.map((row) => row.low);
        const closes = rows.map((row) => row.close);
        const volumes = rows.map((row) => row.volume);
        const result = await client.query(`
          INSERT INTO ${part.table} (market,code,timeframe,candle_date,open,high,low,close,volume,source,fetched_at)
          SELECT $1,v.code,$2,v.candle_date,v.open,v.high,v.low,v.close,v.volume,'OPERATING_DB_CACHE',NOW()
            FROM unnest($3::text[],$4::text[],$5::double precision[],$6::double precision[],$7::double precision[],$8::double precision[],$9::double precision[])
              AS v(code,candle_date,open,high,low,close,volume)
          ON CONFLICT (market,code,timeframe,candle_date) DO UPDATE SET
            open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,
            volume=EXCLUDED.volume,source=EXCLUDED.source,fetched_at=EXCLUDED.fetched_at`,
        [part.market, timeframe, codes, dates, opens, highs, lows, closes, volumes]);
        const verifiedResult = await client.query(`
          SELECT COUNT(*)::int AS count
            FROM unnest($3::text[],$4::text[],$5::double precision[],$6::double precision[],$7::double precision[],$8::double precision[],$9::double precision[])
              AS input(code,candle_date,open,high,low,close,volume)
            JOIN ${part.table} stored
              ON stored.market=$1 AND stored.code=input.code AND stored.timeframe=$2 AND stored.candle_date=input.candle_date
             AND stored.fetched_at=transaction_timestamp()
             AND stored.open IS NOT DISTINCT FROM input.open
             AND stored.high IS NOT DISTINCT FROM input.high
             AND stored.low IS NOT DISTINCT FROM input.low
             AND stored.close IS NOT DISTINCT FROM input.close
             AND stored.volume IS NOT DISTINCT FROM input.volume`,
        [part.market, timeframe, codes, dates, opens, highs, lows, closes, volumes]);
        const verified = Number(verifiedResult.rows[0]?.count ?? 0);
        if (!isDailyCacheWriteVerified(rows.length, verified)) {
          throw new Error(`candle UPSERT verification mismatch market=${part.market} expected=${rows.length} verified=${verified}`);
        }
        if (timeframe === "D") {
          const summaryRows = selectLatestDailySummaryRows(rows);
          if (summaryRows.length > 0) {
            await client.query(`
              INSERT INTO ${summaryTable} (market,code,candle_date,open,high,low,close,volume,fetched_at)
              SELECT $1,input.code,input.candle_date,input.open,input.high,input.low,input.close,input.volume,transaction_timestamp()
                FROM unnest($2::text[],$3::text[],$4::double precision[],$5::double precision[],$6::double precision[],$7::double precision[],$8::double precision[])
                  AS input(code,candle_date,open,high,low,close,volume)
               WHERE input.volume > 0 AND input.close IS NOT NULL
               ORDER BY input.code,input.candle_date DESC
              ON CONFLICT (market,code) DO UPDATE SET
                candle_date=EXCLUDED.candle_date,open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,
                close=EXCLUDED.close,volume=EXCLUDED.volume,fetched_at=EXCLUDED.fetched_at
              WHERE ${summaryTable}.candle_date <= EXCLUDED.candle_date`,
            [part.market, summaryRows.map((row) => row.code), summaryRows.map((row) => row.date), summaryRows.map((row) => row.open), summaryRows.map((row) => row.high), summaryRows.map((row) => row.low), summaryRows.map((row) => row.close), summaryRows.map((row) => row.volume)]);

            const latestRows = summaryRows;
            const summaryVerifiedResult = await client.query(`
              WITH incoming AS (
                SELECT DISTINCT ON (input.code) input.code,input.candle_date,input.open,input.high,input.low,input.close,input.volume
                  FROM unnest($2::text[],$3::text[],$4::double precision[],$5::double precision[],$6::double precision[],$7::double precision[],$8::double precision[])
                    AS input(code,candle_date,open,high,low,close,volume)
                 WHERE input.volume > 0 AND input.close IS NOT NULL
                 ORDER BY input.code,input.candle_date DESC
              )
              SELECT COUNT(*)::int AS count
                FROM incoming
                JOIN ${summaryTable} stored ON stored.market=$1 AND stored.code=incoming.code
               WHERE stored.candle_date > incoming.candle_date
                  OR (stored.candle_date = incoming.candle_date
                      AND stored.open IS NOT DISTINCT FROM incoming.open
                      AND stored.high IS NOT DISTINCT FROM incoming.high
                      AND stored.low IS NOT DISTINCT FROM incoming.low
                      AND stored.close IS NOT DISTINCT FROM incoming.close
                      AND stored.volume IS NOT DISTINCT FROM incoming.volume)`,
            [part.market, latestRows.map((row) => row.code), latestRows.map((row) => row.date), latestRows.map((row) => row.open), latestRows.map((row) => row.high), latestRows.map((row) => row.low), latestRows.map((row) => row.close), latestRows.map((row) => row.volume)]);
            const summaryVerified = Number(summaryVerifiedResult.rows[0]?.count ?? 0);
            if (!isDailyCacheWriteVerified(summaryRows.length, summaryVerified)) {
              throw new Error(`daily summary verification mismatch market=${part.market} expected=${summaryRows.length} verified=${summaryVerified}`);
            }
          }
        }
        if (result.rowCount !== verified) {
          telemetry.dbRowCountMismatches++;
          console.warn(`[async-sync] DB rowCount differs from verified writes market=${part.market} commandCount=${result.rowCount} verified=${verified}`);
        }
        saved += verified;
      }
      if (!skipFundamentals) for (const item of part.fundamentals) await client.query(`INSERT INTO instrument_fundamental_snapshots (market,code,name,price,change_rate,open,high,low,volume,trading_value,market_cap,listed_shares,currency,source,raw_payload,observed_at,fetched_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'OPERATING_DB_API','{}',COALESCE($14,NOW()),COALESCE($15,NOW())) ON CONFLICT (market,code) DO UPDATE SET name=EXCLUDED.name,price=EXCLUDED.price,change_rate=EXCLUDED.change_rate,open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,volume=EXCLUDED.volume,trading_value=EXCLUDED.trading_value,market_cap=EXCLUDED.market_cap,listed_shares=EXCLUDED.listed_shares,currency=EXCLUDED.currency,source=EXCLUDED.source,observed_at=EXCLUDED.observed_at,fetched_at=EXCLUDED.fetched_at`, [item.market,item.code,item.name ?? "",item.price,item.changeRate,item.open,item.high,item.low,item.volume,item.tradingValue,item.marketCap,item.listedShares,item.currency,item.observedAt,item.fetchedAt]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); telemetry.dbSaveBatches++; telemetry.dbSaveDurationMs += performance.now() - startedAt; }
  return saved;
}

async function syncMarket(kind, universeTable) {
  let universeRows = (await pool.query(onlyUnrefreshed && kind === "US"
    ? `SELECT u.market,u.code FROM ${universeTable} u
       LEFT JOIN us_latest_daily_candles latest ON latest.market=u.market AND latest.code=u.code
       WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK'
         AND (latest.fetched_at IS NULL OR latest.fetched_at < $1)
       ORDER BY u.market,u.code`
    : `SELECT market,code FROM ${universeTable} WHERE enabled=true AND daily_active=true AND instrument_type='COMMON_STOCK' ORDER BY market,code`,
    onlyUnrefreshed && kind === "US" ? [new Date(Date.now() - 30 * 60 * 1000)] : [],
  )).rows;
  let marketCapFilter = null;
  if (kind === "US" && usMarketCapUnder !== null) {
    const sourceCount = universeRows.length;
    const marketCapRows = await pool.query(`
      SELECT f.market,f.code,f.market_cap,f.currency
        FROM instrument_fundamental_snapshots f
        JOIN ${universeTable} u ON u.market=f.market AND u.code=f.code
       WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK'
         AND u.is_etf=false AND u.is_warrant=false AND u.is_derivative=false AND u.is_dr=false
         AND u.is_leveraged=false AND u.is_inverse=false
         AND f.currency='USD' AND f.market_cap > 0 AND f.market_cap ${usMarketCapUnderInclusive ? '<=' : '<'} $1
    `, [usMarketCapUnder]);
    const eligibleCodes = new Set(marketCapRows.rows.map((row) => `${row.market}:${row.code}`));
    universeRows = universeRows.filter((row) => eligibleCodes.has(`${row.market}:${row.code}`));
    marketCapFilter = { marketCapUnder: usMarketCapUnder, currency: "USD", eligible: universeRows.length, excluded: sourceCount - universeRows.length, source: "LOCAL_INSTRUMENT_FUNDAMENTAL_SNAPSHOT", unknownExcluded: true };
  }
  if (marketCapUnder !== null || marketCapOver !== null) {
    const eligibleCodes = new Set();
    const capSnapshots = new Map();
    for (const market of ["KOSPI", "KOSDAQ"]) {
      const marketRows = universeRows.filter((row) => row.market === market);
      const fundamentalsBase = new URL("/api/public/instrument-fundamentals", process.env.DAILY_CACHE_API_URL);
      fundamentalsBase.searchParams.set("market", market);
      for (let offset = 0; offset < marketRows.length; offset += 100) {
        const url = new URL(fundamentalsBase);
        url.searchParams.set("codes", marketRows.slice(offset, offset + 100).map((row) => row.code).join(","));
        const payload = await fetchJson(url);
        if (!payload.ok || !Array.isArray(payload.items)) throw new Error(`운영 fundamentals API 응답 형식 오류: ${market}`);
        for (const item of payload.items) {
          const cap = Number(item.marketCap);
          if (item.market === market && Number.isFinite(cap) && cap > 0
            && (marketCapUnder === null || (marketCapUnderInclusive ? cap <= marketCapUnder : cap < marketCapUnder))
            && (marketCapOver === null || cap > marketCapOver)) {
            eligibleCodes.add(`${market}:${item.code}`);
            capSnapshots.set(`${market}:${item.code}`, { marketCap: cap, observedAt: item.observedAt ?? null, fetchedAt: item.fetchedAt ?? null });
          }
        }
      }
    }
    const sourceCount = universeRows.length;
    universeRows = universeRows.filter((row) => eligibleCodes.has(`${row.market}:${row.code}`));
    const snapshotItems = universeRows.map((row) => ({ ...row, ...capSnapshots.get(`${row.market}:${row.code}`) }));
    for (let offset = 0; offset < snapshotItems.length; offset += 500) {
      const rows = snapshotItems.slice(offset, offset + 500);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const item of rows) {
          await client.query(`INSERT INTO instrument_fundamental_snapshots (market,code,name,market_cap,currency,source,raw_payload,observed_at,fetched_at)
            VALUES ($1,$2,'',$3,'KRW','OPERATING_DB_API','{}',COALESCE($4,NOW()),COALESCE($5,NOW()))
            ON CONFLICT (market,code) DO UPDATE SET market_cap=EXCLUDED.market_cap,currency='KRW',source='OPERATING_DB_API',observed_at=EXCLUDED.observed_at,fetched_at=EXCLUDED.fetched_at`,
          [item.market,item.code,item.marketCap,item.observedAt,item.fetchedAt]);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    }
    marketCapFilter = { marketCapUnder, marketCapOver, currency: "KRW", eligible: universeRows.length, excluded: sourceCount - universeRows.length, source: "OPERATING_DB_FUNDAMENTAL_SNAPSHOT", markets: ["KOSPI", "KOSDAQ"], unknownExcluded: true };
  }
  const universe = maxInstruments > 0 ? universeRows.slice(0, maxInstruments) : universeRows;
  const queue = makeQueue(queueLimit); let cursor = 0, fetched = 0, saved = 0, failed = 0, completedBatches = 0;
  const persistedParts = [];
  const totalBatches = Math.ceil(universe.length / batchSize);
  const producer = async () => { while (true) { const start = cursor; cursor += batchSize; const scopes = universe.slice(start, start + batchSize); if (!scopes.length) return; const index = Math.floor(start / batchSize) + 1; try { const parts = await fetchBatch(kind, scopes); const count = parts.reduce((n, p) => n + p.candles.reduce((x, i) => x + (i.candles?.length ?? 0), 0), 0); const missing = parts.reduce((n, part) => n + (part.missingCodes?.length ?? 0), 0); if (missing) failed += missing; if (count > 0) { fetched += count; await queue.push({ parts, index }); } else completedBatches++; } catch (error) { failed++; completedBatches++; console.warn(`[async-sync] fetch failed ${kind} batch=${index}/${totalBatches}: ${error.message}`); } } };
  const consumer = async () => { while (true) { const job = await queue.pop(); if (!job) return; try { const batchSaved = await persistParts(job.parts); saved += batchSaved; persistedParts.push(...job.parts); completedBatches++; console.info(`[async-sync] progress ${kind} batch=${completedBatches}/${totalBatches} fetched=${fetched} saved=${saved} failed=${failed}`); } catch (error) { failed++; completedBatches++; console.warn(`[async-sync] save failed ${kind} batch=${job.index}/${totalBatches}: ${error.message}`); } } };
  const consumers = Promise.all(Array.from({ length: saveConcurrency }, consumer));
  await Promise.all([ ...Array.from({ length: fetchConcurrency }, producer) ]);
  queue.close();
  await consumers;
  return {
    universe: universe.length,
    marketCapFilter,
    batches: totalBatches,
    fetched,
    saved,
    failed,
    candleCoverage: summarizeDailyCandleCoverage(universe, persistedParts),
  };
}

try {
  const result = {};
  if (marketArg === "ALL" || marketArg === "KR") result.KR = await syncMarket("KR", "kr_common_stock_universe");
  if (marketArg === "ALL" || marketArg === "US") result.US = await syncMarket("US", "us_common_stock_universe");
  const ok = isDailyCacheSyncSuccessful(result, fallbackFailed);
  console.log(JSON.stringify({ ok, mode: "async-bounded-queue", fetchConcurrency, fallbackConcurrency, saveConcurrency, queueLimit, maxInstruments, marketCapUnder, marketCapUnderInclusive, marketCapOver, usMarketCapUnder, usMarketCapUnderInclusive, targetDate, onlyUnrefreshed, fallbackRequested, fallbackFailed, telemetry, result }));
  if (!ok) process.exitCode = 1;
} finally {
  await pool.end();
}
