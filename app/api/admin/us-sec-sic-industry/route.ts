import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEC_TICKER_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const SEC_DATA_URL = "https://data.sec.gov/submissions/CIK";
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 50;
type Market = "NAS" | "NYS" | "AMS";
type SecTicker = { cik: string; ticker: string; market: Market };
type Target = { market: Market; code: string; name: string; industry_code: string };
type SicRow = { market: Market; code: string; cik: string; sic: string; sic_description: string };

let tickerMapPromise: Promise<Map<string, Set<string>>> | null = null;
let requestQueue = Promise.resolve();
let lastSecRequestAt = 0;
const sicCache = new Map<string, Promise<{ sic: string; description: string } | null>>();

function userAgent() {
  const value = process.env.SEC_USER_AGENT?.trim() || "StockMan/0.1.0 admin@example.com";
  if (/your[_ -]?email|placeholder/i.test(value)) throw new Error("SEC_USER_AGENT_REQUIRED");
  return value;
}

function marketFromExchange(exchange: string): Market | null {
  const value = exchange.trim().toUpperCase();
  if (value === "NASDAQ" || value.startsWith("NASDAQ ")) return "NAS";
  if (value === "NYSE" || value.startsWith("NEW YORK STOCK EXCHANGE")) return "NYS";
  if (/NYSE AMERICAN|NYSE MKT|NYSE AMEX|AMERICAN STOCK EXCHANGE/.test(value)) return "AMS";
  return null;
}

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function fetchSecJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": userAgent() },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`SEC_HTTP_${response.status}`);
  return await response.json() as T;
}

async function loadTickerMap() {
  if (!tickerMapPromise) {
    tickerMapPromise = fetchSecJson<{ fields?: string[]; data?: unknown[][] }>(SEC_TICKER_URL)
      .then((body) => {
        const fields = body.fields ?? [];
        const index = (name: string) => fields.indexOf(name);
        const cikIndex = index("cik");
        const tickerIndex = index("ticker");
        const exchangeIndex = index("exchange");
        if (cikIndex < 0 || tickerIndex < 0 || exchangeIndex < 0 || !Array.isArray(body.data)) throw new Error("SEC_TICKER_MAP_SCHEMA_INVALID");
        const result = new Map<string, Set<string>>();
        for (const row of body.data) {
          const market = marketFromExchange(String(row[exchangeIndex] ?? ""));
          const ticker = normalizeTicker(String(row[tickerIndex] ?? ""));
          const rawCik = String(row[cikIndex] ?? "").replace(/\D/g, "");
          if (!market || !ticker || !/^\d{1,10}$/.test(rawCik)) continue;
          const key = `${market}:${ticker}`;
          const values = result.get(key) ?? new Set<string>();
          values.add(rawCik.padStart(10, "0"));
          result.set(key, values);
          const anyMarketKey = `*:${ticker}`;
          const anyMarketValues = result.get(anyMarketKey) ?? new Set<string>();
          anyMarketValues.add(rawCik.padStart(10, "0"));
          result.set(anyMarketKey, anyMarketValues);
        }
        return result;
      })
      .catch((error) => { tickerMapPromise = null; throw error; });
  }
  return tickerMapPromise;
}

async function waitForSecSlot() {
  let release!: () => void;
  const previous = requestQueue;
  requestQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const waitMs = Math.max(0, 125 - (Date.now() - lastSecRequestAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastSecRequestAt = Date.now();
  release();
}

async function fetchCompanySic(cik: string) {
  let pending = sicCache.get(cik);
  if (!pending) {
    pending = (async () => {
      await waitForSecSlot();
      const body = await fetchSecJson<{ sic?: unknown; sicDescription?: unknown }>(`${SEC_DATA_URL}${cik}.json`);
      const sic = String(body.sic ?? "").trim();
      if (!/^\d{3,4}$/.test(sic) || /^0+$/.test(sic)) return null;
      return { sic, description: String(body.sicDescription ?? "").trim() };
    })().catch((error) => {
      sicCache.delete(cik);
      throw error;
    });
    sicCache.set(cik, pending);
  }
  return pending;
}

function isMissingIndustryCode(sqlAlias = "u") {
  return `(${sqlAlias}.industry_code IS NULL OR BTRIM(${sqlAlias}.industry_code) !~ '^[0-9]{1,4}$' OR BTRIM(${sqlAlias}.industry_code) ~ '^0+$')`;
}

const activeCommonPredicate = `enabled = TRUE AND instrument_type = 'COMMON_STOCK' AND market IN ('NAS','NYS','AMS') AND security_type = '2' AND country_code = 'US' AND currency = 'USD' AND is_etf = FALSE AND is_leveraged = FALSE AND is_inverse = FALSE AND is_warrant = FALSE AND is_derivative = FALSE AND is_dr = FALSE`;

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const result = await getPool().query(`
      SELECT market,
        COUNT(*)::int AS eligible_active_common_count,
        COUNT(*) FILTER (WHERE ${isMissingIndustryCode()})::int AS still_unclassified_count,
        COUNT(*) FILTER (WHERE source_file LIKE 'SEC_EDGAR_SIC:%' AND NOT ${isMissingIndustryCode()})::int AS sec_sic_fallback_count,
        COUNT(*) FILTER (WHERE NOT ${isMissingIndustryCode()} AND source_file NOT LIKE 'SEC_EDGAR_SIC:%')::int AS other_valid_code_count
      FROM us_common_stock_universe AS u
      WHERE ${activeCommonPredicate}
      GROUP BY market ORDER BY market
    `);
    const samples = await getPool().query(`
      SELECT market, code, name, industry_code, source_file, updated_at
      FROM us_common_stock_universe AS u
      WHERE ${activeCommonPredicate} AND source_file LIKE 'SEC_EDGAR_SIC:%'
      ORDER BY market, code LIMIT 100
    `);
    return NextResponse.json({ ok: true, source: "SEC_EDGAR_SUBMISSIONS_SIC", checkedAt: new Date().toISOString(), markets: result.rows, secSicSamples: samples.rows });
  } catch {
    return NextResponse.json({ ok: false, error: "US_SEC_SIC_DIAGNOSTIC_FAILED" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  let body: { limit?: unknown; afterMarket?: unknown; afterCode?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "JSON_REQUIRED" }, { status: 400 }); }
  const limitValue = body.limit === undefined ? DEFAULT_BATCH_SIZE : Number(body.limit);
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > MAX_BATCH_SIZE) {
    return NextResponse.json({ ok: false, error: "INVALID_BATCH_SIZE", allowed: [1, MAX_BATCH_SIZE] }, { status: 400 });
  }
  const afterMarket = String(body.afterMarket ?? "").trim().toUpperCase();
  const afterCode = String(body.afterCode ?? "").trim().toUpperCase();
  if (Boolean(afterMarket) !== Boolean(afterCode) || afterMarket && !["AMS", "NAS", "NYS"].includes(afterMarket)) {
    return NextResponse.json({ ok: false, error: "INVALID_CURSOR" }, { status: 400 });
  }

  try {
    userAgent();
    const pool = getPool();
    const predicate = activeCommonPredicate.replaceAll("enabled =", "u.enabled =").replaceAll("instrument_type =", "u.instrument_type =").replaceAll("market IN", "u.market IN").replaceAll("security_type =", "u.security_type =").replaceAll("country_code =", "u.country_code =").replaceAll("currency =", "u.currency =").replaceAll("is_etf =", "u.is_etf =").replaceAll("is_leveraged =", "u.is_leveraged =").replaceAll("is_inverse =", "u.is_inverse =").replaceAll("is_warrant =", "u.is_warrant =").replaceAll("is_derivative =", "u.is_derivative =").replaceAll("is_dr =", "u.is_dr =");
    const cursorClause = afterMarket ? "AND (u.market, u.code) > ($1::text, $2::text)" : "";
    const queryParams = afterMarket ? [afterMarket, afterCode, limitValue] : [limitValue];
    const limitPlaceholder = afterMarket ? "$3" : "$1";
    const targetsResult = await pool.query<Target>(`
      SELECT u.market, u.code, u.name, u.industry_code
      FROM us_common_stock_universe AS u
      WHERE ${predicate} AND ${isMissingIndustryCode("u")}
        AND (u.source_file NOT LIKE 'SEC_EDGAR_SIC:%' OR ${isMissingIndustryCode("u")})
        ${cursorClause}
      ORDER BY u.market, u.code LIMIT ${limitPlaceholder}
    `, queryParams);
    const targets = targetsResult.rows;
    const map = await loadTickerMap();
    const lookupRows: Array<{ target: Target; cik: string; sic: string; description: string }> = [];
    const unresolved: Array<{ market: string; code: string; reason: string }> = [];
    const cikForTarget = new Map<string, string>();
    for (const target of targets) {
      const ticker = normalizeTicker(target.code);
      const ciks = map.get(`${target.market}:${ticker}`) ?? map.get(`*:${ticker}`);
      if (!ciks?.size) { unresolved.push({ market: target.market, code: target.code, reason: "SEC_TICKER_NOT_FOUND" }); continue; }
      if (ciks.size !== 1) { unresolved.push({ market: target.market, code: target.code, reason: "SEC_TICKER_AMBIGUOUS" }); continue; }
      cikForTarget.set(`${target.market}:${target.code}`, [...ciks][0]);
    }
    const uniqueCiks = [...new Set(cikForTarget.values())];
    const sicByCik = new Map<string, { sic: string; description: string } | null>();
    const settled = await Promise.allSettled(uniqueCiks.map(async (cik) => [cik, await fetchCompanySic(cik)] as const));
    const failedLookups: Array<{ cik: string; error: string }> = [];
    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      if (result.status === "fulfilled") sicByCik.set(result.value[0], result.value[1]);
      else failedLookups.push({ cik: uniqueCiks[index], error: result.reason instanceof Error ? result.reason.message : "SEC_LOOKUP_FAILED" });
    }
    if (failedLookups.some((row) => row.error.startsWith("SEC_HTTP_5") || row.error === "SEC_HTTP_403" || row.error === "SEC_HTTP_429")) {
      return NextResponse.json({ ok: false, error: "SEC_TEMPORARY_FAILURE", cursor: { afterMarket, afterCode }, failedLookups }, { status: 502 });
    }
    const writes: SicRow[] = [];
    for (const target of targets) {
      const cik = cikForTarget.get(`${target.market}:${target.code}`);
      if (!cik) continue;
      const sic = sicByCik.get(cik);
      if (!sic) { unresolved.push({ market: target.market, code: target.code, reason: failedLookups.some((x) => x.cik === cik) ? "SEC_SUBMISSIONS_FAILED" : "SEC_SIC_MISSING" }); continue; }
      lookupRows.push({ target, cik, sic: sic.sic, description: sic.description });
      writes.push({ market: target.market, code: target.code, cik, sic: sic.sic, sic_description: sic.description });
    }

    const client = await pool.connect();
    let persisted: Array<{ market: string; code: string; industry_code: string; source_file: string }> = [];
    try {
      await client.query("BEGIN");
      if (writes.length) {
        const saved = await client.query(
          `UPDATE us_common_stock_universe AS u
             SET industry_code = src.sic,
                 source_file = 'SEC_EDGAR_SIC:' || src.cik,
                 updated_at = NOW()
            FROM jsonb_to_recordset($1::jsonb) AS src(market text, code text, cik text, sic text, sic_description text)
           WHERE u.market = src.market AND u.code = src.code
             AND ${activeCommonPredicate.replaceAll("enabled =", "u.enabled =").replaceAll("instrument_type =", "u.instrument_type =").replaceAll("market IN", "u.market IN").replaceAll("security_type =", "u.security_type =").replaceAll("country_code =", "u.country_code =").replaceAll("currency =", "u.currency =").replaceAll("is_etf =", "u.is_etf =").replaceAll("is_leveraged =", "u.is_leveraged =").replaceAll("is_inverse =", "u.is_inverse =").replaceAll("is_warrant =", "u.is_warrant =").replaceAll("is_derivative =", "u.is_derivative =").replaceAll("is_dr =", "u.is_dr =")}
             AND ${isMissingIndustryCode("u")}
           RETURNING u.market, u.code, u.industry_code, u.source_file`,
          [JSON.stringify(writes)],
        );
        persisted = saved.rows;
      }
      const persistedMap = new Map(persisted.map((row) => [`${row.market}:${row.code}`, row]));
      const mismatches = writes.filter((row) => {
        const saved = persistedMap.get(`${row.market}:${row.code}`);
        return !saved || saved.industry_code !== row.sic || saved.source_file !== `SEC_EDGAR_SIC:${row.cik}`;
      });
      if (mismatches.length) throw new Error(`SEC_SIC_READ_AFTER_WRITE_MISMATCH:${mismatches.length}`);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    const last = targets.at(-1);
    return NextResponse.json({
      ok: true,
      source: "SEC_EDGAR_SUBMISSIONS_SIC",
      processed: targets.length,
      matchedSecSic: lookupRows.length,
      persisted: persisted.length,
      unresolved,
      failedLookups,
      nextCursor: last ? { afterMarket: last.market, afterCode: last.code } : null,
      hasMore: targets.length === limitValue,
      saved: persisted,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "US_SEC_SIC_SYNC_FAILED";
    const status = message === "SEC_USER_AGENT_REQUIRED" ? 503 : message.startsWith("SEC_HTTP_") || message.startsWith("SEC_TEMPORARY_FAILURE") ? 502 : 500;
    return NextResponse.json({ ok: false, error: message.startsWith("SEC_") ? message : "US_SEC_SIC_SYNC_FAILED" }, { status });
  }
}
