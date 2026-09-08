import { getAccessToken, refreshAccessToken } from "@/lib/kis";
import { buildKisAuthorization, isKisTokenExpiredResponse } from "@/lib/kis-authorization";
import { loadKisApiConfig } from "@/lib/kis-api-config";
import { withKisRequestThrottle } from "@/lib/kis-request-throttle";

export type KisUsTradeMarket = "NAS" | "AMS" | "NYS";
export type KisUsTradeTrendRequest = { code: string; market?: KisUsTradeMarket; day?: "0" | "1" };
export type KisUsTrade = { time: string; price: number | null; changeRate: number | null; volume: number | null; totalVolume: number | null; marketType: string; bid: number | null; ask: number | null; intensity: number | null };
export type KisUsTradeTrendResult = { ok: boolean; status: number; code: string; market: string; day: string; trades: KisUsTrade[]; raw: unknown; rawText: string; diagnostics: { rt_cd: string | null; msg_cd: string | null; msg1: string | null; outputKey: string | null } };
export type KisUsMinuteChartResult = { ok: boolean; status: number; code: string; market: string; rows: Record<string, unknown>[]; raw: unknown; rawText: string; diagnostics: { rt_cd: string | null; msg_cd: string | null; msg1: string | null } };

/** 공식 샘플 [해외주식-012] 해외주식 기간별 일·주·월·년 시세. */
export async function fetchKisUsDailyChart(input: { code: string; market?: KisUsTradeMarket; fromDate: string; toDate: string; period?: "D" | "W" | "M" | "Y" }): Promise<KisUsMinuteChartResult | null> {
  const code = input.code.trim().toUpperCase(); if (!code) return null;
  const config = await loadKisApiConfig("us_trade_trend"); const token = await getAccessToken(); if (!token) return null;
  const market = input.market ?? "NAS";
  const headers = { "content-type": config.content_type, Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY?.trim() || "", appsecret: process.env.KIS_APPSECRET?.trim() || "", tr_id: "FHKST03030100", custtype: config.custtype || "P", tr_cont: "" };
  const params = new URLSearchParams({ FID_COND_MRKT_DIV_CODE: "N", FID_INPUT_ISCD: code, FID_INPUT_DATE_1: input.fromDate, FID_INPUT_DATE_2: input.toDate, FID_PERIOD_DIV_CODE: input.period ?? "D", EXCD: market });
  const response = await withKisRequestThrottle(() => fetch(`https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/inquire-daily-chartprice?${params}`, { headers, signal: AbortSignal.timeout(8_000) }));
  const rawText = await response.text(); let raw: any = null; try { raw = JSON.parse(rawText); } catch {}
  const rows = [raw?.output1, raw?.output2].flatMap((value) => Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []) as Record<string, unknown>[];
  return { ok: response.ok && raw?.rt_cd === "0", status: response.status, code, market, rows, raw, rawText, diagnostics: { rt_cd: raw?.rt_cd ?? null, msg_cd: raw?.msg_cd ?? null, msg1: raw?.msg1 ?? null } };
}

/** 공식 샘플 [해외주식-010] 일반 해외주식 기간별 시세. */
export async function fetchKisUsPeriodPrice(input: { code: string; market?: KisUsTradeMarket; period?: "0" | "1" | "2"; referenceDate?: string; adjusted?: "0" | "1" }): Promise<KisUsMinuteChartResult | null> {
  const code = input.code.trim().toUpperCase(); if (!code) return null;
  const config = await loadKisApiConfig("us_trade_trend"); const token = await getAccessToken(); if (!token) return null;
  const market = input.market ?? "NAS";
  const headers = { "content-type": config.content_type, Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY?.trim() || "", appsecret: process.env.KIS_APPSECRET?.trim() || "", tr_id: "HHDFS76240000", custtype: config.custtype || "P", tr_cont: "" };
  const params = new URLSearchParams({ AUTH: config.AUTH ?? "", EXCD: market, SYMB: code, GUBN: input.period ?? "0", BYMD: input.referenceDate ?? "", MODP: input.adjusted ?? "1" });
  const response = await withKisRequestThrottle(() => fetch(`https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/dailyprice?${params}`, { headers, signal: AbortSignal.timeout(8_000) }));
  const rawText = await response.text(); let raw: any = null; try { raw = JSON.parse(rawText); } catch {}
  const rows = [raw?.output1, raw?.output2].flatMap((value) => Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []) as Record<string, unknown>[];
  return { ok: response.ok && raw?.rt_cd === "0", status: response.status, code, market, rows, raw, rawText, diagnostics: { rt_cd: raw?.rt_cd ?? null, msg_cd: raw?.msg_cd ?? null, msg1: raw?.msg1 ?? null } };
}

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : null; };

/** 공식 샘플 [해외주식-030] 해외주식 분봉조회. */
export async function fetchKisUsMinuteChart(input: { code: string; market?: KisUsTradeMarket; minute?: string; includePrevious?: string; count?: string }): Promise<KisUsMinuteChartResult | null> {
  const code = input.code.trim().toUpperCase(); if (!code) return null;
  const config = await loadKisApiConfig("us_trade_trend"); const token = await getAccessToken(); if (!token) return null;
  const market = input.market ?? "NAS";
  const headers = { "content-type": config.content_type, Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY?.trim() || "", appsecret: process.env.KIS_APPSECRET?.trim() || "", tr_id: "HHDFS76950200", custtype: config.custtype || "P", tr_cont: "" };
  const params = new URLSearchParams({ AUTH: config.AUTH ?? "", EXCD: market, SYMB: code, NMIN: input.minute ?? "1", PINC: input.includePrevious ?? "1", NEXT: "", NREC: input.count ?? "120", FILL: "", KEYB: "" });
  const response = await withKisRequestThrottle(() => fetch(`https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice?${params}`, { headers, signal: AbortSignal.timeout(8_000) }));
  const rawText = await response.text(); let raw: any = null; try { raw = JSON.parse(rawText); } catch {}
  const rows = [raw?.output1, raw?.output2].flatMap((value) => Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []) as Record<string, unknown>[];
  return { ok: response.ok && raw?.rt_cd === "0", status: response.status, code, market, rows, raw, rawText, diagnostics: { rt_cd: raw?.rt_cd ?? null, msg_cd: raw?.msg_cd ?? null, msg1: raw?.msg1 ?? null } };
}
function parse(raw: any): { trades: KisUsTrade[]; outputKey: string | null } {
  const key = Array.isArray(raw?.output2) ? "output2" : Array.isArray(raw?.output1) ? "output1" : null;
  const rows = key ? raw[key] : [];
  return { outputKey: key, trades: rows.map((r: any) => ({ time: String(r.khms ?? ""), price: num(r.last), changeRate: num(r.rate), volume: num(r.evol), totalVolume: num(r.tvol), marketType: String(r.mtyp ?? ""), bid: num(r.pbid), ask: num(r.pask), intensity: num(r.vpow) })) };
}

export async function fetchKisUsTradeTrend(input: KisUsTradeTrendRequest): Promise<KisUsTradeTrendResult | null> {
  const code = input.code.trim().toUpperCase(); const market = input.market; const day = input.day ?? "1";
  if (!code) return null;
  const config = await loadKisApiConfig("us_trade_trend");
  const headers = (token: string) => ({ "content-type": config.content_type, Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY?.trim() || "", appsecret: process.env.KIS_APPSECRET?.trim() || "", tr_id: config.tr_id || "HHDFS76200300", custtype: config.custtype || "P", tr_cont: "" });
  async function once(token: string, exchange: KisUsTradeMarket) { const params = new URLSearchParams({ AUTH: config.AUTH ?? "", EXCD: exchange, TDAY: day, SYMB: code, KEYB: config.KEYB ?? "" }); const response = await withKisRequestThrottle(() => fetch(`https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/inquire-ccnl?${params}`, { headers: headers(token), signal: AbortSignal.timeout(8_000) })); const rawText = await response.text(); let raw: any = null; try { raw = JSON.parse(rawText); } catch {} return { response, raw, rawText }; }
  let token = await getAccessToken(); if (!token) return null;
  const exchanges: KisUsTradeMarket[] = market ? [market] : ["NAS", "AMS", "NYS"];
  let last: Awaited<ReturnType<typeof once>> | null = null;
  let resolvedMarket = exchanges[exchanges.length - 1];
  for (const exchange of exchanges) {
    let result = await once(token, exchange);
    if (isKisTokenExpiredResponse(result.response.status, result.raw)) { token = await refreshAccessToken(); if (!token) return null; result = await once(token, exchange); }
    last = result; resolvedMarket = exchange;
    const parsed = parse(result.raw);
    if (result.response.ok && result.raw?.rt_cd !== "1" && parsed.trades.length > 0) {
      return { ok: true, status: result.response.status, code, market: exchange, day, trades: parsed.trades, raw: result.raw, rawText: result.rawText, diagnostics: { rt_cd: result.raw?.rt_cd ?? null, msg_cd: result.raw?.msg_cd ?? null, msg1: result.raw?.msg1 ?? null, outputKey: parsed.outputKey } };
    }
  }
  if (!last) return null;
  const parsed = parse(last.raw);
  return { ok: false, status: last.response.status, code, market: resolvedMarket, day, trades: parsed.trades, raw: last.raw, rawText: last.rawText, diagnostics: { rt_cd: last.raw?.rt_cd ?? null, msg_cd: last.raw?.msg_cd ?? null, msg1: last.raw?.msg1 ?? null, outputKey: parsed.outputKey } };
}

export type KisUsAskingPriceResult = { ok: boolean; status: number; code: string; market: string; rows: Record<string, unknown>[]; raw: unknown; rawText: string; diagnostics: { rt_cd: string | null; msg_cd: string | null; msg1: string | null } };

/** 공식 샘플 [해외주식-029] 해외주식 현재가상세. */
export async function fetchKisUsPriceDetail(input: { code: string; market?: KisUsTradeMarket }): Promise<KisUsAskingPriceResult | null> {
  const code = input.code.trim().toUpperCase(); if (!code) return null;
  const config = await loadKisApiConfig("us_trade_trend"); const token = await getAccessToken(); if (!token) return null;
  const market = input.market ?? "NAS";
  const headers = { "content-type": config.content_type, Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY?.trim() || "", appsecret: process.env.KIS_APPSECRET?.trim() || "", tr_id: "HHDFS76200200", custtype: config.custtype || "P", tr_cont: "" };
  const params = new URLSearchParams({ AUTH: config.AUTH ?? "", EXCD: market, SYMB: code });
  const response = await withKisRequestThrottle(() => fetch(`https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/price-detail?${params}`, { headers, signal: AbortSignal.timeout(8_000) }));
  const rawText = await response.text(); let raw: any = null; try { raw = JSON.parse(rawText); } catch {}
  return { ok: response.ok && raw?.rt_cd === "0", status: response.status, code, market, rows: parseKisUsAskingRows(raw), raw, rawText, diagnostics: { rt_cd: raw?.rt_cd ?? null, msg_cd: raw?.msg_cd ?? null, msg1: raw?.msg1 ?? null } };
}

export type KisUsRankingKind = "trade-vol" | "trade-pbmn" | "volume-surge" | "volume-power" | "new-highlow" | "market-cap";
export type KisUsRankingResult = { ok: boolean; status: number; kind: KisUsRankingKind; market: string; rows: Record<string, unknown>[]; raw: unknown; diagnostics: { rt_cd: string | null; msg_cd: string | null; msg1: string | null } };

export type KisUsSearchResult = { ok: boolean; status: number; market: string; rows: Record<string, unknown>[]; raw: unknown; diagnostics: { rt_cd: string | null; msg_cd: string | null; msg1: string | null } };

/** 공식 샘플 [해외주식-034] 해외주식 상품기본정보. */
export async function fetchKisUsSearchInfo(input: { code: string; productType?: string }): Promise<KisUsSearchResult | null> {
  const code = input.code.trim().toUpperCase(); if (!code) return null;
  const config = await loadKisApiConfig("us_trade_trend"); const token = await getAccessToken(); if (!token) return null;
  const headers = { "content-type": config.content_type, Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY?.trim() || "", appsecret: process.env.KIS_APPSECRET?.trim() || "", tr_id: "CTPF1702R", custtype: config.custtype || "P", tr_cont: "" };
  const params = new URLSearchParams({ PRDT_TYPE_CD: input.productType ?? "512", PDNO: code });
  const response = await withKisRequestThrottle(() => fetch(`https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/search-info?${params}`, { headers, signal: AbortSignal.timeout(8_000) }));
  const rawText = await response.text(); let raw: any = null; try { raw = JSON.parse(rawText); } catch {}
  const rows = [raw?.output, raw?.output1, raw?.output2].flatMap((value) => Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []) as Record<string, unknown>[];
  return { ok: response.ok && raw?.rt_cd === "0", status: response.status, market: input.productType ?? "512", rows, raw, diagnostics: { rt_cd: raw?.rt_cd ?? null, msg_cd: raw?.msg_cd ?? null, msg1: raw?.msg1 ?? null } };
}

export async function fetchKisUsIndustryTheme(input: { market?: KisUsTradeMarket; industry: string; volumeRange?: string }): Promise<KisUsSearchResult | null> {
  const config = await loadKisApiConfig("us_trade_trend"); const token = await getAccessToken(); if (!token) return null;
  const market = input.market ?? "NAS";
  const headers = { "content-type": config.content_type, Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY?.trim() || "", appsecret: process.env.KIS_APPSECRET?.trim() || "", tr_id: "HHDFS76370000", custtype: config.custtype || "P", tr_cont: "" };
  const params = new URLSearchParams({ EXCD: market, ICOD: input.industry, VOL_RANG: input.volumeRange ?? "0", AUTH: config.AUTH ?? "", KEYB: "" });
  const response = await withKisRequestThrottle(() => fetch(`https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/industry-theme?${params}`, { headers, signal: AbortSignal.timeout(8_000) }));
  const text = await response.text(); let raw: any = null; try { raw = JSON.parse(text); } catch {}
  const rows = [raw?.output, raw?.output1, raw?.output2].flatMap((value) => Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []) as Record<string, unknown>[];
  return { ok: response.ok && raw?.rt_cd === "0", status: response.status, market, rows, raw, diagnostics: { rt_cd: raw?.rt_cd ?? null, msg_cd: raw?.msg_cd ?? null, msg1: raw?.msg1 ?? null } };
}

/** 공식 해외주식 조건검색 API. 필터 미사용 값은 ""로 전달합니다. */
export async function fetchKisUsSearch(input: { market?: KisUsTradeMarket; filters?: Record<string, string> }): Promise<KisUsSearchResult | null> {
  const config = await loadKisApiConfig("us_trade_trend");
  const token = await getAccessToken(); if (!token) return null;
  const headers = { "content-type": config.content_type, Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY?.trim() || "", appsecret: process.env.KIS_APPSECRET?.trim() || "", tr_id: "HHDFS76410000", custtype: config.custtype || "P", tr_cont: "" };
  const defaults: Record<string, string> = {
    AUTH: config.AUTH ?? "", EXCD: input.market ?? "NAS", CO_YN_PRICECUR: "", CO_ST_PRICECUR: "", CO_EN_PRICECUR: "",
    CO_YN_RATE: "", CO_ST_RATE: "", CO_EN_RATE: "", CO_YN_VALX: "", CO_ST_VALX: "", CO_EN_VALX: "",
    CO_YN_SHAR: "", CO_ST_SHAR: "", CO_EN_SHAR: "", CO_YN_VOLUME: "", CO_ST_VOLUME: "", CO_EN_VOLUME: "",
    CO_YN_AMT: "", CO_ST_AMT: "", CO_EN_AMT: "", CO_YN_EPS: "", CO_ST_EPS: "", CO_EN_EPS: "",
    CO_YN_PER: "", CO_ST_PER: "", CO_EN_PER: "", KEYB: "",
  };
  const params = new URLSearchParams({ ...defaults, ...(input.filters ?? {}) });
  const response = await withKisRequestThrottle(() => fetch(`https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/inquire-search?${params}`, { headers, signal: AbortSignal.timeout(8_000) }));
  const text = await response.text(); let raw: any = null; try { raw = JSON.parse(text); } catch {}
  const rows = [raw?.output, raw?.output1, raw?.output2].flatMap((value) => Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []) as Record<string, unknown>[];
  return { ok: response.ok && raw?.rt_cd === "0", status: response.status, market: input.market ?? "NAS", rows, raw, diagnostics: { rt_cd: raw?.rt_cd ?? null, msg_cd: raw?.msg_cd ?? null, msg1: raw?.msg1 ?? null } };
}

/** 공식 해외주식 순위분석 API 묶음: 거래량·거래대금·거래량급증·체결강도·신고/신저가. */
export async function fetchKisUsRanking(kind: KisUsRankingKind, market: KisUsTradeMarket = "NAS"): Promise<KisUsRankingResult | null> {
  const config = await loadKisApiConfig("us_trade_trend");
  const table: Record<KisUsRankingKind, [string, string]> = {
    "trade-vol": ["/uapi/overseas-stock/v1/ranking/trade-vol", "HHDFS76310010"],
    "trade-pbmn": ["/uapi/overseas-stock/v1/ranking/trade-pbmn", "HHDFS76320010"],
    "volume-surge": ["/uapi/overseas-stock/v1/ranking/volume-surge", "HHDFS76270000"],
    "volume-power": ["/uapi/overseas-stock/v1/ranking/volume-power", "HHDFS76280000"],
    "new-highlow": ["/uapi/overseas-stock/v1/ranking/new-highlow", "HHDFS76300000"],
    "market-cap": ["/uapi/overseas-stock/v1/ranking/market-cap", "HHDFS76350100"],
  };
  const [path, trId] = table[kind];
  const token = await getAccessToken(); if (!token) return null;
  const headers = { "content-type": config.content_type, Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY?.trim() || "", appsecret: process.env.KIS_APPSECRET?.trim() || "", tr_id: trId, custtype: config.custtype || "P", tr_cont: "" };
  const params = new URLSearchParams({ AUTH: config.AUTH ?? "", EXCD: market, CO_YN: "N", PRCS: "0", CNTG: "0" });
  const response = await withKisRequestThrottle(() => fetch(`https://openapi.koreainvestment.com:9443${path}?${params}`, { headers, signal: AbortSignal.timeout(8_000) }));
  const text = await response.text(); let raw: any = null; try { raw = JSON.parse(text); } catch {}
  const values = [raw?.output, raw?.output1, raw?.output2].flatMap((v) => Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []) as Record<string, unknown>[];
  return { ok: response.ok && raw?.rt_cd === "0", status: response.status, kind, market, rows: values, raw, diagnostics: { rt_cd: raw?.rt_cd ?? null, msg_cd: raw?.msg_cd ?? null, msg1: raw?.msg1 ?? null } };
}

export function parseKisUsAskingRows(raw: unknown): Record<string, unknown>[] {
  const payload = raw as { output1?: unknown; output2?: unknown; output3?: unknown } | null;
  return [payload?.output1, payload?.output2, payload?.output3].flatMap((value) => Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []) as Record<string, unknown>[];
}

/** 공식 샘플 [해외주식-033] 해외주식 현재가 1호가. */
export async function fetchKisUsAskingPrice(input: { code: string; market?: KisUsTradeMarket }): Promise<KisUsAskingPriceResult | null> {
  const code = input.code.trim().toUpperCase(); if (!code) return null;
  const config = await loadKisApiConfig("us_trade_trend");
  const headers = (token: string) => ({ "content-type": config.content_type, Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY?.trim() || "", appsecret: process.env.KIS_APPSECRET?.trim() || "", tr_id: "HHDFS76200100", custtype: config.custtype || "P", tr_cont: "" });
  async function once(token: string, exchange: KisUsTradeMarket) { const params = new URLSearchParams({ AUTH: config.AUTH ?? "", EXCD: exchange, SYMB: code }); const response = await withKisRequestThrottle(() => fetch(`https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/inquire-asking-price?${params}`, { headers: headers(token), signal: AbortSignal.timeout(8_000) })); const rawText = await response.text(); let raw: any = null; try { raw = JSON.parse(rawText); } catch {} return { response, raw, rawText }; }
  let token = await getAccessToken(); if (!token) return null;
  const exchanges: KisUsTradeMarket[] = input.market ? [input.market] : ["NAS", "NYS", "AMS"];
  let last: Awaited<ReturnType<typeof once>> | null = null; let resolvedMarket = exchanges[exchanges.length - 1];
  for (const exchange of exchanges) { let result = await once(token, exchange); if (isKisTokenExpiredResponse(result.response.status, result.raw)) { token = await refreshAccessToken(); if (!token) return null; result = await once(token, exchange); } last = result; resolvedMarket = exchange; if (result.response.ok && result.raw?.rt_cd === "0") { const rows = parseKisUsAskingRows(result.raw); return { ok: true, status: result.response.status, code, market: exchange, rows, raw: result.raw, rawText: result.rawText, diagnostics: { rt_cd: result.raw.rt_cd ?? null, msg_cd: result.raw.msg_cd ?? null, msg1: result.raw.msg1 ?? null } }; } }
  if (!last) return null; return { ok: false, status: last.response.status, code, market: resolvedMarket, rows: [], raw: last.raw, rawText: last.rawText, diagnostics: { rt_cd: last.raw?.rt_cd ?? null, msg_cd: last.raw?.msg_cd ?? null, msg1: last.raw?.msg1 ?? null } };
}
