import pg from "pg";

const { Pool } = pg;
const args = new Map(process.argv.slice(2).filter((v) => v.startsWith("--")).map((v) => { const [k, ...r] = v.slice(2).split("="); return [k, r.join("=") || "true"]; }));
const marketArg = String(args.get("market") || "ALL").toUpperCase();
const timeframe = String(args.get("timeframe") || "D").toUpperCase();
const limit = Math.min(Math.max(Number(args.get("limit") || 120), 1), 300);
const batchSize = Math.min(Math.max(Number(args.get("batch") || 100), 1), 100);
const fetchConcurrency = Math.min(Math.max(Number(args.get("fetch-workers") || 3), 1), 8);
const saveConcurrency = Math.min(Math.max(Number(args.get("save-workers") || 2), 1), 4);
const queueLimit = Math.min(Math.max(Number(args.get("queue") || 10), 1), 50);
const skipFundamentals = args.get("skip-fundamentals") === "true";

if (!process.env.LOCAL_DATABASE_URL || !process.env.DAILY_CACHE_API_URL || !process.env.DAILY_CACHE_READ_API_KEY) throw new Error("LOCAL_DATABASE_URL, DAILY_CACHE_API_URL, DAILY_CACHE_READ_API_KEY가 모두 필요합니다.");
if (!["D", "W", "M"].includes(timeframe) || !["ALL", "KR", "US"].includes(marketArg)) throw new Error("잘못된 market/timeframe입니다.");

const pool = new Pool({ connectionString: process.env.LOCAL_DATABASE_URL });
const apiBase = new URL("/api/public/daily-candles", process.env.DAILY_CACHE_API_URL);
const auth = { authorization: `Bearer ${process.env.DAILY_CACHE_READ_API_KEY}` };

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
    const response = await fetch(url, { headers: auth });
    if (!response.ok) throw new Error(`운영 일봉 API 실패: ${response.status} ${market}`);
    const payload = await response.json();
    if (!payload.ok || !Array.isArray(payload.items)) throw new Error(`운영 일봉 API 응답 형식 오류: ${market}`);
    let fundamentals = { items: [] };
    if (!skipFundamentals) {
      const fUrl = new URL("/api/public/instrument-fundamentals", process.env.DAILY_CACHE_API_URL); fUrl.searchParams.set("market", market); fUrl.searchParams.set("codes", codes.join(","));
      const fResponse = await fetch(fUrl, { headers: auth });
      if (!fResponse.ok) throw new Error(`운영 기본정보 API 실패: ${fResponse.status} ${market}`);
      fundamentals = await fResponse.json();
      if (!fundamentals.ok || !Array.isArray(fundamentals.items)) throw new Error(`운영 기본정보 API 응답 형식 오류: ${market}`);
    }
    parts.push({ table, market, candles: payload.items, fundamentals: fundamentals.items });
  }
  return parts;
}

async function persistParts(parts) {
  const client = await pool.connect();
  let saved = 0;
  try {
    await client.query("BEGIN");
    for (const part of parts) {
      for (const item of part.candles) for (const candle of item.candles ?? []) {
        await client.query(`INSERT INTO ${part.table} (market,code,timeframe,candle_date,open,high,low,close,volume,source,fetched_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'OPERATING_DB_CACHE',NOW()) ON CONFLICT (market,code,timeframe,candle_date) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume=EXCLUDED.volume,source=EXCLUDED.source,fetched_at=EXCLUDED.fetched_at`, [part.market, item.code, timeframe, candle.date, candle.open, candle.high, candle.low, candle.close, candle.volume]); saved++;
      }
      if (!skipFundamentals) for (const item of part.fundamentals) await client.query(`INSERT INTO instrument_fundamental_snapshots (market,code,name,price,change_rate,open,high,low,volume,trading_value,market_cap,shares_outstanding,free_float_shares,free_float_percent,currency,source,raw_payload,observed_at,fetched_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'OPERATING_DB_API','{}',COALESCE($16,NOW()),COALESCE($17,NOW())) ON CONFLICT (market,code) DO UPDATE SET name=EXCLUDED.name,price=EXCLUDED.price,change_rate=EXCLUDED.change_rate,open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,volume=EXCLUDED.volume,trading_value=EXCLUDED.trading_value,market_cap=EXCLUDED.market_cap,shares_outstanding=EXCLUDED.shares_outstanding,free_float_shares=EXCLUDED.free_float_shares,free_float_percent=EXCLUDED.free_float_percent,currency=EXCLUDED.currency,source=EXCLUDED.source,observed_at=EXCLUDED.observed_at,fetched_at=EXCLUDED.fetched_at`, [item.market,item.code,item.name ?? "",item.price,item.changeRate,item.open,item.high,item.low,item.volume,item.tradingValue,item.marketCap,item.sharesOutstanding,item.freeFloatShares,item.freeFloatPercent,item.currency,item.observedAt,item.fetchedAt]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  return saved;
}

async function syncMarket(kind, universeTable) {
  const universe = (await pool.query(`SELECT market,code FROM ${universeTable} WHERE enabled=true AND daily_active=true AND instrument_type='COMMON_STOCK' ORDER BY market,code`)).rows;
  const queue = makeQueue(queueLimit); let cursor = 0, fetched = 0, saved = 0, failed = 0;
  const producer = async () => { while (true) { const start = cursor; cursor += batchSize; const scopes = universe.slice(start, start + batchSize); if (!scopes.length) return; try { const parts = await fetchBatch(kind, scopes); fetched += parts.reduce((n, p) => n + p.candles.reduce((x, i) => x + (i.candles?.length ?? 0), 0), 0); await queue.push({ parts, index: Math.floor(start / batchSize) + 1 }); } catch (error) { failed++; console.warn(`[async-sync] fetch failed ${kind} batch=${Math.floor(start / batchSize) + 1}: ${error.message}`); } } };
  const consumer = async () => { while (true) { const job = await queue.pop(); if (!job) return; try { saved += await persistParts(job.parts); } catch (error) { failed++; console.warn(`[async-sync] save failed ${kind} batch=${job.index}: ${error.message}`); } } };
  const consumers = Promise.all(Array.from({ length: saveConcurrency }, consumer));
  await Promise.all([ ...Array.from({ length: fetchConcurrency }, producer) ]);
  queue.close();
  await consumers;
  return { universe: universe.length, fetched, saved, failed };
}

try { const result = {}; if (marketArg === "ALL" || marketArg === "KR") result.KR = await syncMarket("KR", "kr_common_stock_universe"); if (marketArg === "ALL" || marketArg === "US") result.US = await syncMarket("US", "us_common_stock_universe"); console.log(JSON.stringify({ ok: Object.values(result).every(x => x.failed === 0), mode: "async-bounded-queue", fetchConcurrency, saveConcurrency, queueLimit, result })); } finally { await pool.end(); }
