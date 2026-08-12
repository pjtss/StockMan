import { getAccessToken } from "@/lib/kis";
import { buildKisAuthorization } from "@/lib/kis-authorization";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { getDb } from "@/lib/db";
import { usNewsTickerExchangeCache } from "@/lib/schema";
import { and, eq, gte } from "drizzle-orm";
import { scoreNewsTitle } from "@/lib/news-title-filter";
import { ensureUsInstrument } from "@/lib/us-instruments";
import { withKisRequestThrottle } from "@/lib/kis-request-throttle";

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const headers = (token: string, trId: string) => ({
  "content-type": "application/json; charset=utf-8",
  Authorization: buildKisAuthorization(token),
  appkey: process.env.KIS_APPKEY || "",
  appsecret: process.env.KIS_APPSECRET || "",
  tr_id: trId,
  custtype: "P",
  tr_cont: "",
});

export type KisBreakingNews = {
  id: string;
  date: string;
  time: string;
  title: string;
  source: string;
  providerCode: string;
  symbols: Array<{ ticker: string; name: string }>;
};

export type KisNewsTitle = { newsKey: string; date: string; time: string; title: string; source: string; ticker: string; name: string };
export type KisNewsPeriod = "today" | "3d" | "7d" | "1m";
export type KisTickerNewsResult = {
  ticker: string;
  period: KisNewsPeriod;
  exchange: string;
  fromDate: string;
  toDate: string;
  items: KisNewsTitle[];
  diagnostics: { requestedDates: number; successfulDates: number; emptyDates: number; failedDates: Array<{ date: string; error: string }> };
};
const US_TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;

function isUsTicker(ticker: string) {
  return US_TICKER_PATTERN.test(ticker) && !/^\d+$/.test(ticker);
}

function responseTicker(output: Record<string, unknown>) {
  const raw = String(output.rsym ?? output.symb ?? output.code ?? "").trim().toUpperCase();
  // KIS may return the market prefix (for example NAS:AAPL) in rsym.
  return raw.includes(":") ? raw.slice(raw.lastIndexOf(":") + 1) : raw;
}

async function cachedMarket(ticker: string) {
  try {
    const db = getDb();
    if (!db) return null;
    const validSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await db.select().from(usNewsTickerExchangeCache)
      .where(and(eq(usNewsTickerExchangeCache.ticker, ticker), gte(usNewsTickerExchangeCache.validatedAt, validSince)))
      .limit(1);
    return rows[0]?.market ?? null;
  } catch { return null; }
}

async function cacheMarket(ticker: string, market: string) {
  try {
    const db = getDb();
    if (!db) return;
    const instrument = await ensureUsInstrument({ market, code: ticker });
    await db.insert(usNewsTickerExchangeCache).values({ ticker, market, instrumentId: instrument ?? undefined, validatedAt: new Date() })
      .onConflictDoUpdate({ target: usNewsTickerExchangeCache.ticker, set: { market, instrumentId: instrument ?? undefined, validatedAt: new Date() } });
  } catch { /* cache is an optimization; KIS validation remains authoritative */ }
}

async function kisGet(path: string, params: Record<string, string>, trId: string) {
  const token = await getAccessToken();
  if (!token) throw new Error("KIS_ACCESS_TOKEN_UNAVAILABLE");
  // Radar and forwarder share the account-wide KIS request quota with all
  // other features. Keep these calls on the same process-wide queue so two
  // cron endpoints cannot burst concurrently and trigger EGW00201.
  const result = await withKisRequestThrottle(async () => {
    const response = await fetch(`${BASE_URL}${path}?${new URLSearchParams(params)}`, { headers: headers(token, trId), cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  });
  if (!result.response.ok || result.body.rt_cd !== "0") throw new Error(`KIS_NEWS_API_ERROR:${result.body.msg_cd || result.response.status}:${result.body.msg1 || "request failed"}`);
  return result.body;
}

export async function fetchBreakingNews(options: { date?: string; time?: string } = {}): Promise<KisBreakingNews[]> {
  const body = await kisGet("/uapi/overseas-price/v1/quotations/brknews-title", {
    FID_NEWS_OFER_ENTP_CODE: "0", FID_COND_MRKT_CLS_CODE: "00", FID_INPUT_ISCD: "", FID_TITL_CNTT: "",
    FID_INPUT_DATE_1: options.date || "", FID_INPUT_HOUR_1: options.time || "", FID_RANK_SORT_CLS_CODE: "", FID_INPUT_SRNO: "", FID_COND_SCR_DIV_CODE: "11801",
  }, "FHKST01011801");
  return (body.output || []).map((item: Record<string, unknown>) => ({
    id: String(item.cntt_usiq_srno || ""), date: String(item.data_dt || ""), time: String(item.data_tm || ""), title: String(item.hts_pbnt_titl_cntt || ""),
    source: String(item.dorg || ""), providerCode: String(item.news_ofer_entp_code || ""),
    symbols: Array.from({ length: 10 }, (_, index) => ({ ticker: String(item[`iscd${index + 1}`] || "").trim().toUpperCase(), name: String(item[`kor_isnm${index + 1}`] || "").trim() })).filter((item) => item.ticker),
  })).filter((item: KisBreakingNews) => item.id && item.title);
}

export async function fetchNewsTitles(ticker: string, options: { date?: string; time?: string; exchange?: string } = {}): Promise<KisNewsTitle[]> {
  const body = await kisGet("/uapi/overseas-price/v1/quotations/news-title", {
    INFO_GB: "", CLASS_CD: "", NATION_CD: "US", EXCHANGE_CD: options.exchange || "", SYMB: ticker.toUpperCase(), DATA_DT: options.date || "", DATA_TM: options.time || "", CTS: "",
  }, "HHPSTH60100C1");
  return (body.outblock1 || []).map((item: Record<string, unknown>) => ({ newsKey: String(item.news_key || ""), date: String(item.data_dt || ""), time: String(item.data_tm || ""), title: String(item.title || ""), source: String(item.source || ""), ticker: String(item.symb || ticker).toUpperCase(), name: String(item.symb_name || "") })).filter((item: KisNewsTitle) => item.newsKey && item.title);
}

function nyDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return { year: Number(parts.find((part) => part.type === "year")?.value), month: Number(parts.find((part) => part.type === "month")?.value), day: Number(parts.find((part) => part.type === "day")?.value) };
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

/**
 * KIS news-title은 날짜 범위 파라미터가 없으므로 시장일별로 조회하고 결과를 합친다.
 * 기간의 기준일은 서버 시간대가 아니라 미국 동부 시장일이다.
 */
export async function fetchTickerNews(ticker: string, options: { period?: KisNewsPeriod; exchange?: string; now?: Date } = {}): Promise<KisTickerNewsResult> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!isUsTicker(normalizedTicker)) throw new Error("INVALID_US_TICKER");
  const period = options.period || "today";
  const days = period === "today" ? 1 : period === "3d" ? 3 : period === "7d" ? 7 : period === "1m" ? 30 : 0;
  if (!days) throw new Error("INVALID_NEWS_PERIOD");
  const base = nyDateParts(options.now);
  const dates = Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(base.year, base.month - 1, base.day - index));
    return formatDate(date);
  });
  const diagnostics = { requestedDates: dates.length, successfulDates: 0, emptyDates: 0, failedDates: [] as Array<{ date: string; error: string }> };
  const collected: KisNewsTitle[] = [];
  // The shared KIS throttle limits bursts while allowing the 30-day view to finish promptly.
  const results = await Promise.all(dates.map(async (date) => {
    try {
      const items = await fetchNewsTitles(normalizedTicker, { date, exchange: options.exchange });
      return { date, items };
    } catch (error) {
      return { date, items: [] as KisNewsTitle[], error: error instanceof Error ? error.message : String(error) };
    }
  }));
  for (const result of results) {
    if (result.error) diagnostics.failedDates.push({ date: result.date, error: result.error });
    else if (result.items.length === 0) diagnostics.emptyDates += 1;
    else { diagnostics.successfulDates += 1; collected.push(...result.items); }
  }
  const unique = new Map<string, KisNewsTitle>();
  for (const item of collected) unique.set(item.newsKey, item);
  const items = [...unique.values()].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  return { ticker: normalizedTicker, period, exchange: options.exchange || "", fromDate: dates[dates.length - 1], toDate: dates[0], items, diagnostics };
}

export async function detectNewsCandidates(options: { date?: string; time?: string } = {}) {
  const radar = await fetchBreakingNews(options);
  const candidates = [];
  const debug = { radarCount: radar.length, titleEligibleCount: 0, titleRejectedCount: 0, tickerCount: 0, tickerRejectedCount: 0, newsVerificationAttemptCount: 0, newsVerificationMatchedCount: 0, priceDetailAttemptCount: 0, priceDetailSuccessCount: 0, exchangeValidationSuccessCount: 0 };
  for (const event of radar) {
    const titleFilter = scoreNewsTitle(event.title);
    if (!titleFilter.eligible) { debug.titleRejectedCount += 1; continue; }
    debug.titleEligibleCount += 1;
    for (const symbol of event.symbols) {
      debug.tickerCount += 1;
      if (!isUsTicker(symbol.ticker)) { debug.tickerRejectedCount += 1; continue; }
      debug.newsVerificationAttemptCount += 1;
      const verified = await fetchNewsTitles(symbol.ticker, { date: event.date, time: event.time });
      const matched = verified.filter((item) => item.title === event.title || item.ticker === symbol.ticker);
      if (matched.length > 0) debug.newsVerificationMatchedCount += 1;
      let quote: Record<string, unknown> = {};
      let resolvedMarket: string | null = null;
      const markets = matched.length > 0 ? [await cachedMarket(symbol.ticker), "NAS", "NYS", "AMS"] : [];
      for (const market of [...new Set(markets.filter((value): value is string => Boolean(value)))]) {
          debug.priceDetailAttemptCount += 1;
          const detail = await fetchKisUsPriceDetail({ code: symbol.ticker, market });
          const output = getKisUsPriceDetailOutput(detail?.parsed);
          if (detail?.ok && responseTicker(output) === symbol.ticker) { debug.priceDetailSuccessCount += 1; debug.exchangeValidationSuccessCount += 1; quote = output; resolvedMarket = market; await cacheMarket(symbol.ticker, market); break; }
      }
      const rate = Number(quote.t_xrat ?? quote.t_rate ?? NaN);
      const tradingValue = Number(quote.tamt ?? NaN);
      candidates.push({ event, symbol, titleFilter, market: resolvedMarket, verified: matched, valid: matched.length > 0 && resolvedMarket !== null, quote, marketReaction: { rate: Number.isFinite(rate) ? rate : null, tradingValue: Number.isFinite(tradingValue) ? tradingValue : null } });
    }
  }
  return { radar, candidates, debug };
}
