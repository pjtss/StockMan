import { getAccessToken } from "@/lib/kis";
import { buildKisAuthorization } from "@/lib/kis-authorization";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";

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
  for (const event of radar) {
    for (const symbol of event.symbols) {
      if (!isUsTicker(symbol.ticker)) continue;
      const verified = await fetchNewsTitles(symbol.ticker, { date: event.date, time: event.time });
      const matched = verified.filter((item) => item.title === event.title || item.ticker === symbol.ticker);
      let quote: Record<string, unknown> = {};
      let resolvedMarket: string | null = null;
      if (matched.length > 0) for (const market of ["NAS", "NYS", "AMS"]) {
          const detail = await fetchKisUsPriceDetail({ code: symbol.ticker, market });
          const output = getKisUsPriceDetailOutput(detail?.parsed);
          if (detail?.ok && responseTicker(output) === symbol.ticker) { quote = output; resolvedMarket = market; break; }
        }
      const rate = Number(quote.t_xrat ?? quote.t_rate ?? NaN);
      const tradingValue = Number(quote.tamt ?? NaN);
      candidates.push({ event, symbol, market: resolvedMarket, verified: matched, valid: matched.length > 0 && resolvedMarket !== null, quote, marketReaction: { rate: Number.isFinite(rate) ? rate : null, tradingValue: Number.isFinite(tradingValue) ? tradingValue : null } });
    }
  }
  return { radar, candidates };
}
