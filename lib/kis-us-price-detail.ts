import { getAccessToken, refreshAccessToken } from "@/lib/kis";
import { loadKisApiConfig } from "@/lib/kis-api-config";
import { buildKisAuthorization, isKisTokenExpiredResponse } from "@/lib/kis-authorization";
import { withKisRequestThrottle } from "@/lib/kis-request-throttle";
import { getDb } from "@/lib/db";
import { usPriceDetailCache } from "@/lib/schema";
import { and, eq, gt } from "drizzle-orm";

const detailCache = new Map<string, { expiresAt: number; result: KisUsPriceDetailResult }>();
const DETAIL_TTL_MS = 10_000;

export type KisUsPriceDetailRequest = { code: string; market?: string };

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasPositiveValue(output: Record<string, unknown>, fields: readonly string[]) {
  return fields.some((field) => {
    const value = output[field];
    if (value == null || String(value).trim() === "") return false;
    const parsed = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(parsed) && parsed > 0;
  });
}

function isCacheablePriceDetail(parsed: unknown) {
  const root = asRecord(parsed);
  if (!root || (root.rt_cd != null && String(root.rt_cd) !== "0")) return false;
  const output = getKisUsPriceDetailOutput(root);
  return hasPositiveValue(output, ["last", "t_prpr", "price", "tomv", "marketCap", "market_cap"]);
}

export async function fetchKisUsPriceDetail({ code: rawCode, market: rawMarket = "AMS" }: KisUsPriceDetailRequest): Promise<KisUsPriceDetailResult | null> {
  const code = rawCode.trim().toUpperCase();
  const market = rawMarket.trim().toUpperCase();
  const cacheKey = `${market}:${code}`;
  const cached = detailCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const db = getDb();
  const loadStale = async () => {
    if (!db) return null;
    const row = (await db.select().from(usPriceDetailCache).where(and(eq(usPriceDetailCache.market, market), eq(usPriceDetailCache.code, code))).limit(1).catch(() => []))[0];
    return row ? { ok: row.status >= 200 && row.status < 300, status: row.status, code, market, parsed: row.parsed, stale: true } : null;
  };
  if (db) {
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
  if (!token) return loadStale();
  let result = await fetchOnce(token);
  if (isKisTokenExpiredResponse(result.response.status, result.parsed)) {
    token = await refreshAccessToken();
    if (!token) return loadStale();
    result = await fetchOnce(token);
  }
  const value = { ok: result.response.ok, status: result.response.status, code, market, parsed: result.parsed };
  if (value.ok && isCacheablePriceDetail(value.parsed)) {
    detailCache.set(cacheKey, { expiresAt: Date.now() + DETAIL_TTL_MS, result: value });
    if (db) await db.insert(usPriceDetailCache).values({ market, code, status: value.status, parsed: value.parsed as Record<string, unknown>, fetchedAt: new Date() }).onConflictDoUpdate({ target: [usPriceDetailCache.market, usPriceDetailCache.code], set: { status: value.status, parsed: value.parsed as Record<string, unknown>, fetchedAt: new Date() } }).catch(() => undefined);
  }
  return value.ok ? value : await loadStale();
}

export function getKisUsPriceDetailOutput(parsed: unknown): Record<string, unknown> {
  const root = asRecord(parsed);
  if (!root) return {};
  const candidates = (["output", "output1", "output2"] as const)
    .map((key) => asRecord(root[key]))
    .filter((output): output is Record<string, unknown> => output !== null);
  const quoteFields = ["last", "t_prpr", "price", "tomv", "marketCap", "market_cap"] as const;
  const populatedQuote = candidates.find((output) => hasPositiveValue(output, quoteFields));
  if (populatedQuote) return populatedQuote;
  return candidates.find((output) => Object.keys(output).length > 0) ?? {};
}
