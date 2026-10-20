import pg from "pg";
import { loadLocalEnv } from "./local-env.mjs";
import { assertInstrumentFundamentalRefreshScopeMatches, fingerprintInstrumentFundamentalRefreshScope } from "../lib/instrument-fundamental-refresh-scope";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput, getKisUsPriceDetailPrice, getKisUsPriceDetailTradingValue } from "../lib/kis-us-price-detail";
import { calculateKisUsMarketCap } from "../lib/kis-us-market-cap";
import { readLocalEnvFile } from "./local-env.mjs";

const args = new Map(process.argv.slice(2).filter((value) => value.startsWith("--")).map((value) => {
  const [key, ...rest] = value.slice(2).split("=");
  return [key, rest.join("=") || "true"];
}));
const CAP_LIMIT_USD = Number(args.get("max-market-cap-usd") ?? 500_000_000);
if (!Number.isSafeInteger(CAP_LIMIT_USD) || CAP_LIMIT_USD < 1) throw new Error("--max-market-cap-usd must be a positive integer");
const apply = args.get("apply") === "true";
const expectedCount = args.has("expect-count") ? Number(args.get("expect-count")) : null;
const expectedFingerprint = args.get("expect-fingerprint") ?? "";
const targetedCodes = (args.get("codes") ?? "").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean);
for (const key of args.keys()) {
  if (!["apply", "expect-count", "expect-fingerprint", "max-market-cap-usd", "codes"].includes(key)) throw new Error(`Unknown option --${key}`);
}
if (!apply && (expectedCount !== null || expectedFingerprint)) throw new Error("--expect-count and --expect-fingerprint require --apply");
if (apply && (!Number.isSafeInteger(expectedCount) || (expectedCount ?? 0) < 1 || !/^[a-f0-9]{64}$/i.test(expectedFingerprint))) {
  throw new Error("Apply requires a positive --expect-count and 64-character --expect-fingerprint from preview");
}

loadLocalEnv({ required: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const database = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(database.hostname)) throw new Error(`Refusing non-local database host: ${database.hostname}`);
const pool = new pg.Pool({ connectionString: databaseUrl });
const localEnv = readLocalEnvFile();
const operatingApiBase = localEnv.DAILY_CACHE_API_URL || process.env.DAILY_CACHE_API_URL || process.env.PUBLIC_BASE_URL || process.env.RSS_BULLISH_REPORT_API_BASE_URL;
const operatingReadKey = localEnv.DAILY_CACHE_READ_API_KEY || process.env.DAILY_CACHE_READ_API_KEY || "";

async function main() {
  const lockClient = await pool.connect();
  let lockAcquired = false;
  try {
    const lock = await lockClient.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", ["instrument-fundamentals-refresh"]);
    lockAcquired = Boolean(lock.rows[0]?.locked);
    if (!lockAcquired) throw new Error("another instrument fundamentals refresh is already running");
    const result = await pool.query(`
      SELECT u.market,u.code,u.name
      FROM us_common_stock_universe u
      LEFT JOIN instrument_fundamental_snapshots f USING (market,code)
      WHERE u.enabled=true AND u.instrument_type='COMMON_STOCK'
        AND u.daily_active=true
        AND COALESCE(u.is_etf,false)=false AND COALESCE(u.is_warrant,false)=false
        AND COALESCE(u.is_derivative,false)=false AND COALESCE(u.is_dr,false)=false
        AND COALESCE(u.is_leveraged,false)=false AND COALESCE(u.is_inverse,false)=false
        AND (f.market_cap IS NULL OR (f.currency='USD' AND f.market_cap>0 AND f.market_cap<=$1))
        AND (cardinality($2::text[])>0 OR f.fetched_at IS NULL OR f.fetched_at < NOW()-INTERVAL '1 day')
        AND (cardinality($2::text[])=0 OR u.code=ANY($2::text[]))
      ORDER BY u.market,u.code
    `, [CAP_LIMIT_USD,targetedCodes]);
    const instruments = result.rows as Array<{ market: string; code: string; name: string }>;
    const scope = instruments.map(({ market, code }) => ({ market, code, reason: "missing_or_stale_usd_market_cap_at_or_below_limit" }));
    const fingerprint = fingerprintInstrumentFundamentalRefreshScope(scope);
    const marketCounts = instruments.reduce<Record<string, number>>((counts, item) => {
      counts[item.market] = (counts[item.market] ?? 0) + 1;
      return counts;
    }, {});
    console.info(JSON.stringify({ mode: apply ? "apply" : "preview", databaseHost: database.hostname, capLimitUsd: CAP_LIMIT_USD, staleOverDays: 1, targetedCodes: targetedCodes.length ? targetedCodes : null, count: instruments.length, markets: marketCounts, excludedUnknownMarketCap: true, fingerprint }));
    if (!apply || instruments.length === 0) return;

    assertInstrumentFundamentalRefreshScopeMatches(scope, expectedCount!, expectedFingerprint);
    let cursor = 0;
    let processedCount = 0;
    let fetchedCount = 0;
    let savedCount = 0;
    let failureCount = 0;
    const failures: Array<{ market: string; code: string; reason: string }> = [];
    const buffered: Array<{ market: string; code: string; name: string; price: number; changeRate: number | null; volume: number | null; tradingValue: number | null; marketCap: number; currency: string; rawPayload: string }> = [];
    const flush = async () => {
      if (!buffered.length) return;
      const rows = buffered.splice(0, buffered.length);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const row of rows) {
          await client.query(`INSERT INTO instrument_fundamental_snapshots
            (market,code,name,price,change_rate,volume,trading_value,market_cap,currency,source,raw_payload,observed_at,fetched_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'KIS_OVERSEAS_PRICE',$10,NOW(),NOW())
            ON CONFLICT (market,code) DO UPDATE SET name=EXCLUDED.name,price=EXCLUDED.price,
              change_rate=EXCLUDED.change_rate,volume=EXCLUDED.volume,trading_value=EXCLUDED.trading_value,
              market_cap=EXCLUDED.market_cap,currency=EXCLUDED.currency,source=EXCLUDED.source,
              raw_payload=EXCLUDED.raw_payload,observed_at=NOW(),fetched_at=NOW()`,
          [row.market,row.code,row.name,row.price,row.changeRate,row.volume,row.tradingValue,row.marketCap,row.currency,row.rawPayload]);
        }
        await client.query("COMMIT");
        savedCount += rows.length;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        for (const row of rows) {
          failureCount += 1;
          if (failures.length < 100) failures.push({ market: row.market, code: row.code, reason: `DB_WRITE_FAILED: ${error instanceof Error ? error.message : String(error)}` });
        }
      } finally { client.release(); }
    };

    const operatingSnapshots = new Map<string, any>();
    if (targetedCodes.length) {
      if (!operatingApiBase || !operatingReadKey) throw new Error("Targeted refresh requires DAILY_CACHE_API_URL and DAILY_CACHE_READ_API_KEY in .env.local");
      for (const market of [...new Set(instruments.map((item) => item.market))]) {
        const codes = instruments.filter((item) => item.market === market).map((item) => item.code);
        const url = new URL("/api/public/instrument-fundamentals", operatingApiBase);
        url.searchParams.set("market", market);
        url.searchParams.set("codes", codes.join(","));
        const response = await fetch(url, { headers: { authorization: `Bearer ${operatingReadKey}` }, signal: AbortSignal.timeout(20_000) });
        const payload = await response.json() as any;
        if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) throw new Error(`Operating snapshot GET failed: HTTP ${response.status}`);
        for (const item of payload.items) operatingSnapshots.set(`${item.market}:${item.code}`, item);
      }
      for (const instrument of instruments) {
        const item = operatingSnapshots.get(`${instrument.market}:${instrument.code}`);
        if (!item || item.currency !== "USD" || item.source !== "KIS_OVERSEAS_PRICE" || !Number.isFinite(Number(item.price)) || Number(item.price) <= 0 || !Number.isFinite(Number(item.marketCap)) || Number(item.marketCap) <= 0 || Number(item.marketCap) > CAP_LIMIT_USD || !item.observedAt || !item.fetchedAt) {
          throw new Error(`No valid operating KIS USD snapshot within cap for ${instrument.market}:${instrument.code}`);
        }
        buffered.push({ market: instrument.market, code: instrument.code, name: item.name || instrument.name, price: Number(item.price),
          changeRate: Number.isFinite(Number(item.changeRate)) ? Number(item.changeRate) : null,
          volume: Number.isFinite(Number(item.volume)) ? Number(item.volume) : null,
          tradingValue: Number.isFinite(Number(item.tradingValue)) ? Number(item.tradingValue) : null,
          marketCap: Number(item.marketCap), currency: item.currency,
          rawPayload: JSON.stringify({ source: "OPERATING_DB_API_GET", item }) });
        fetchedCount += 1;
      }
      for (let offset = 0; offset < buffered.length; offset += 50) await flush();
      console.info(JSON.stringify({ result: { ok: true, mode: "targeted_operating_snapshot", instrumentCount: instruments.length, fetchedCount, savedCount, failureCount: 0 } }));
      return;
    }
    const worker = async () => {
      while (true) {
        const instrument = instruments[cursor++];
        if (!instrument) return;
        try {
          const response = await fetchKisUsPriceDetail({ code: instrument.code, market: instrument.market, forceRefresh: true, allowStaleFallback: false });
          const output = getKisUsPriceDetailOutput(response?.parsed);
          const price = getKisUsPriceDetailPrice(response?.parsed);
          const marketCap = calculateKisUsMarketCap(output);
          const diagnostics = `http=${response?.status ?? "none"}, rt_cd=${String((response?.parsed as any)?.rt_cd ?? "")}, last=${String(output.last ?? "")}, tomv=${String(output.tomv ?? "")}`;
          if (!response?.ok || response.stale || price == null) throw new Error(`fresh_price_unavailable (${diagnostics})`);
          if (marketCap == null || marketCap <= 0) throw new Error(`positive_market_cap_unavailable (${diagnostics})`);
          buffered.push({ market: instrument.market, code: instrument.code, name: instrument.name, price,
            changeRate: Number.isFinite(Number(output.t_xrat ?? output.prdy_ctrt)) ? Number(output.t_xrat ?? output.prdy_ctrt) : null,
            volume: Number.isFinite(Number(output.tvol ?? output.pvol ?? output.vol)) ? Number(output.tvol ?? output.pvol ?? output.vol) : null,
            tradingValue: getKisUsPriceDetailTradingValue(response?.parsed), marketCap,
            currency: String(output.crcy ?? output.currency ?? "USD"), rawPayload: JSON.stringify(response?.parsed ?? {}) });
          fetchedCount += 1;
          if (buffered.length >= 50) await flush();
        } catch (error) {
          failureCount += 1;
          if (failures.length < 100) failures.push({ market: instrument.market, code: instrument.code, reason: error instanceof Error ? error.message : String(error) });
        } finally {
          processedCount += 1;
          if (processedCount % 100 === 0 || processedCount === instruments.length) {
            console.info(JSON.stringify({ progress: true, processedCount, instrumentCount: instruments.length, fetchedCount, savedCount, failureCount }));
          }
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    await flush();
    console.info(JSON.stringify({ result: { ok: failureCount === 0, instrumentCount: instruments.length, fetchedCount, savedCount, failureCount, failures } }));
    if (failureCount > 0) process.exitCode = 1;
  } finally {
    if (lockAcquired) await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", ["instrument-fundamentals-refresh"]).catch(() => undefined);
    lockClient.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(`[refresh-us-smallcap-fundamentals] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
