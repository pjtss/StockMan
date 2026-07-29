import { getAccessToken } from "@/lib/kis";
import { buildKisAuthorization } from "@/lib/kis-authorization";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { getDb } from "@/lib/db";
import { usNewsTickerExchangeCache } from "@/lib/schema";
import { and, eq, gte } from "drizzle-orm";
import { scoreNewsTitle } from "@/lib/news-title-filter";

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const headers = (token: string, trId: string) => ({
  "content-type": "application/json; charset=utf-8",
  authorization: buildKisAuthorization(token),
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
    await db.insert(usNewsTickerExchangeCache).values({ ticker, market, validatedAt: new Date() })
      .onConflictDoUpdate({ target: usNewsTickerExchangeCache.ticker, set: { market, validatedAt: new Date() } });
  } catch { /* cache is an optimization; KIS validation remains authoritative */ }
}

async function kisGet(path: string, params: Record<string, string>, trId: string) {
  const token = await getAccessToken();
  if (!token) throw new Error("KIS_ACCESS_TOKEN_UNAVAILABLE");
  const response = await fetch(`${BASE_URL}${path}?${new URLSearchParams(params)}`, { headers: headers(token, trId), cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.rt_cd !== "0") throw new Error(`KIS_NEWS_API_ERROR:${body.msg_cd || response.status}:${body.msg1 || "request failed"}`);
  return body;
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
