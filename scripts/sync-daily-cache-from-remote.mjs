import pg from "pg";

const { Pool } = pg;
const args = new Map(process.argv.slice(2).filter((value) => value.startsWith("--")).map((value) => {
  const [key, ...rest] = value.slice(2).split("=");
  return [key, rest.join("=") || "true"];
}));
const requestedMarket = String(args.get("market") || "ALL").toUpperCase();
const timeframe = String(args.get("timeframe") || "D").toUpperCase();
const limit = Math.min(Math.max(Number(args.get("limit") || 120), 1), 300);
const batchSize = Math.min(Math.max(Number(args.get("batch") || 100), 1), 100);

if (!process.env.LOCAL_DATABASE_URL || !process.env.DAILY_CACHE_API_URL || !process.env.DAILY_CACHE_READ_API_KEY) {
  throw new Error("LOCAL_DATABASE_URL, DAILY_CACHE_API_URL, DAILY_CACHE_READ_API_KEY가 모두 필요합니다.");
}
if (!["D", "W", "M"].includes(timeframe)) throw new Error("timeframe은 D, W, M 중 하나여야 합니다.");
if (!["ALL", "KR", "US"].includes(requestedMarket)) throw new Error("market은 ALL, KR, US 중 하나여야 합니다.");

const pool = new Pool({ connectionString: process.env.LOCAL_DATABASE_URL });
const api = new URL("/api/public/daily-candles", process.env.DAILY_CACHE_API_URL);

async function syncMarket(kind, universeTable) {
  const universe = await pool.query(`SELECT market, code FROM ${universeTable} WHERE enabled = true AND daily_active = true AND instrument_type = 'COMMON_STOCK' ORDER BY market, code`);
  let received = 0;
  let saved = 0;
  for (let offset = 0; offset < universe.rows.length; offset += batchSize) {
    const scopes = universe.rows.slice(offset, offset + batchSize);
    const byMarket = new Map();
    for (const row of scopes) {
      const codes = byMarket.get(row.market) ?? [];
      codes.push(row.code);
      byMarket.set(row.market, codes);
    }
    for (const [market, codes] of byMarket) {
      const url = new URL(api);
      url.searchParams.set("market", market);
      url.searchParams.set("codes", codes.join(","));
      url.searchParams.set("timeframe", timeframe);
      url.searchParams.set("limit", String(limit));
      const response = await fetch(url, { headers: { authorization: `Bearer ${process.env.DAILY_CACHE_READ_API_KEY}` } });
      if (!response.ok) throw new Error(`운영 API 실패: ${response.status} ${market}`);
      const payload = await response.json();
      if (!payload.ok || !Array.isArray(payload.items)) throw new Error(`운영 API 응답 형식 오류: ${market}`);
      received += payload.items.reduce((sum, item) => sum + (item.candles?.length ?? 0), 0);
      const table = kind === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const item of payload.items) for (const candle of item.candles ?? []) {
          await client.query(`INSERT INTO ${table} (market, code, timeframe, candle_date, open, high, low, close, volume, source, fetched_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'OPERATING_DB_CACHE',NOW())
            ON CONFLICT (market, code, timeframe, candle_date) DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume, source=EXCLUDED.source, fetched_at=EXCLUDED.fetched_at`,
            [market, item.code, timeframe, candle.date, candle.open, candle.high, candle.low, candle.close, candle.volume]);
          saved += 1;
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    }
    console.log(`[daily-cache-sync] ${kind} ${Math.min(offset + batchSize, universe.rows.length)}/${universe.rows.length}`);
  }
  return { universe: universe.rows.length, received, saved };
}

try {
  const result = {};
  if (requestedMarket === "ALL" || requestedMarket === "KR") result.KR = await syncMarket("KR", "kr_common_stock_universe");
  if (requestedMarket === "ALL" || requestedMarket === "US") result.US = await syncMarket("US", "us_common_stock_universe");
  console.log(JSON.stringify({ ok: true, timeframe, limit, result }));
} finally { await pool.end(); }
