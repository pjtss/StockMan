import { getAccessToken, refreshAccessToken } from "@/lib/kis";
import { loadKisApiConfig } from "@/lib/kis-api-config";
import { buildKisAuthorization, isKisTokenExpiredResponse } from "@/lib/kis-authorization";
import { withKisRequestThrottle } from "@/lib/kis-request-throttle";
import { getDb } from "@/lib/db";
import { usPriceDetailCache } from "@/lib/schema";
import { and, eq, gt } from "drizzle-orm";

const detailCache = new Map<string, { expiresAt: number; result: KisUsPriceDetailResult }>();
const DETAIL_TTL_MS = 10_000;

export type KisUsPriceDetailRequest = {
  code: string;
  market?: string;
  /** Bypass the 10-second process/DB cache when collecting an authoritative snapshot. */
  forceRefresh?: boolean;
  /** UI reads may use last-known data; snapshot jobs must opt out. Defaults to true. */
  allowStaleFallback?: boolean;
};

export type KisUsPriceDetailResult = {
  ok: boolean;
  status: number;
  code: string;
  market: string;
  parsed: unknown;
  stale?: boolean;
};

function parseJson(rawText: string) {
  try { return JSON.parse(rawText); } catch { return null; }
}

export async function fetchKisUsPriceDetail({ code: rawCode, market: rawMarket = "AMS", forceRefresh = false, allowStaleFallback = true }: KisUsPriceDetailRequest): Promise<KisUsPriceDetailResult | null> {
  const code = rawCode.trim().toUpperCase();
  const market = rawMarket.trim().toUpperCase();
  const cacheKey = `${market}:${code}`;
  const cached = detailCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.result;
  const db = getDb();
  const loadStale = async () => {
    if (!allowStaleFallback || !db) return null;
    const row = (await db.select().from(usPriceDetailCache).where(and(eq(usPriceDetailCache.market, market), eq(usPriceDetailCache.code, code))).limit(1).catch(() => []))[0];
    return row && row.status >= 200 && row.status < 300 && getKisUsPriceDetailPrice(row.parsed) !== null
      ? { ok: true, status: row.status, code, market, parsed: row.parsed, stale: true }
      : null;
  };
  if (!forceRefresh && db) {
    const row = (await db.select().from(usPriceDetailCache).where(and(eq(usPriceDetailCache.market, market), eq(usPriceDetailCache.code, code), gt(usPriceDetailCache.fetchedAt, new Date(Date.now() - DETAIL_TTL_MS)))).limit(1).catch(() => []))[0];
    if (row) {
      const result = { ok: row.status >= 200 && row.status < 300, status: row.status, code, market, parsed: row.parsed };
      detailCache.set(cacheKey, { expiresAt: Date.now() + DETAIL_TTL_MS, result });
      return result;
    }
  }
  const config = await loadKisApiConfig("us_price_detail");
  const params = new URLSearchParams({ AUTH: "", EXCD: market, SYMB: code });
  const url = `https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/price-detail?${params.toString()}`;
  const headers = (token: string) => ({
    "content-type": config.content_type || "application/json; charset=utf-8",
    Authorization: buildKisAuthorization(token),
    appkey: process.env.KIS_APPKEY || "",
    appsecret: process.env.KIS_APPSECRET || "",
    tr_id: config.tr_id || "HHDFS76200200",
    custtype: config.custtype || "P",
    tr_cont: "",
  });

  async function fetchOnce(token: string) {
    const response = await withKisRequestThrottle(() => fetch(url, { method: "GET", headers: headers(token), signal: AbortSignal.timeout(8_000) }));
    const rawText = await response.text();
    return { response, parsed: parseJson(rawText) };
  }

  let token = await getAccessToken();
  if (!token) return allowStaleFallback ? loadStale() : null;
  let result = await fetchOnce(token);
  if (isKisTokenExpiredResponse(result.response.status, result.parsed)) {
    token = await refreshAccessToken(token);
    if (!token) return allowStaleFallback ? loadStale() : null;
    result = await fetchOnce(token);
  }
  const value = { ok: result.response.ok, status: result.response.status, code, market, parsed: result.parsed };
  const parsedObject = value.parsed && typeof value.parsed === "object" ? value.parsed as Record<string, unknown> : {};
  const businessSuccess = String(parsedObject.rt_cd ?? parsedObject.rtCd ?? "0") === "0";
  const hasUsablePrice = value.ok && businessSuccess && getKisUsPriceDetailPrice(value.parsed) !== null;
  if (hasUsablePrice) {
    detailCache.set(cacheKey, { expiresAt: Date.now() + DETAIL_TTL_MS, result: value });
    if (db) await db.insert(usPriceDetailCache).values({ market, code, status: value.status, parsed: value.parsed as Record<string, unknown>, fetchedAt: new Date() }).onConflictDoUpdate({ target: [usPriceDetailCache.market, usPriceDetailCache.code], set: { status: value.status, parsed: value.parsed as Record<string, unknown>, fetchedAt: new Date() } }).catch(() => undefined);
  }
  if (value.ok && !hasUsablePrice) {
    return allowStaleFallback ? await loadStale() ?? value : value;
  }
  return value.ok || !allowStaleFallback ? value : await loadStale();
}

export function getKisUsPriceDetailOutput(parsed: unknown): Record<string, unknown> {
  const candidates = [(parsed as any)?.output, (parsed as any)?.output1, (parsed as any)?.output2];
  const isUseful = (candidate: unknown) => candidate && typeof candidate === "object" && !Array.isArray(candidate) && Object.values(candidate).some((item) => item != null && String(item).trim() !== "");
  const hasPositivePrice = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return false;
    return ["last", "t_prpr", "price"].some((key) => { const value = Number(String((candidate as Record<string, unknown>)[key] ?? "").replace(/,/g, "")); return Number.isFinite(value) && value > 0; });
  };
  return (candidates.find((candidate) => isUseful(candidate) && hasPositivePrice(candidate)) as Record<string, unknown> | undefined)
    ?? (candidates.find(isUseful) as Record<string, unknown> | undefined)
    ?? {};
}

export function getKisUsPriceDetailPrice(parsed: unknown): number | null {
  const output = getKisUsPriceDetailOutput(parsed);
  for (const key of ["last", "t_prpr", "price"]) {
    const raw = output[key];
    if (raw == null || String(raw).trim() === "") continue;
    const price = Number(String(raw).replace(/,/g, ""));
    if (Number.isFinite(price) && price > 0) return price;
  }
  return null;
}

/**
 * Return the latest available KIS turnover: today's `tamt` when positive,
 * otherwise the previous completed session's `pamt` (common before today's
 * session has traded). Both fields are passed through unchanged, never derived.
 */
export function getKisUsPriceDetailTradingValue(parsed: unknown): number | null {
  const output = getKisUsPriceDetailOutput(parsed);
  const parseNonNegative = (raw: unknown) => {
    if (raw == null || String(raw).trim() === "") return null;
    const value = Number(String(raw).replace(/,/g, ""));
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const current = parseNonNegative(output.tamt ?? output.tamnt);
  if (current !== null && current > 0) return current;
  return parseNonNegative(output.pamt) ?? current;
}

/** KIS price-detail `output.shar`: listed shares (상장주수). */
export function getKisUsPriceDetailShares(parsed: unknown): number | null {
  const output = getKisUsPriceDetailOutput(parsed);
  const raw = output.shar;
  if (raw == null || String(raw).trim() === "") return null;
  const shares = Number(String(raw).replace(/,/g, "").trim());
  return Number.isSafeInteger(shares) && shares > 0 ? shares : null;
}
