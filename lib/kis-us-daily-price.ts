import { getAccessToken, refreshAccessToken } from "@/lib/kis";
import { loadKisApiConfig } from "@/lib/kis-api-config";
import { isKisTokenExpiredResponse } from "@/lib/kis-authorization";
import { kisRequest } from "@/lib/kis-request-framework";
import { isValidCompactCalendarDate } from "./calendar-date-quality.mjs";

export type UsDailyPriceRequest = {
  code: string;
  market: string;
  endDate?: string;
  adjusted?: boolean;
  timeframe?: "D" | "W" | "M";
};

export type UsDailyCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradingValue?: number | null;
  priceSign?: string | null;
  priceDiff?: number | null;
  changeRate?: number | null;
  raw: unknown;
};

export type UsDailyPriceResponse = {
  ok: boolean;
  status: number;
  request: { method: "GET"; url: string; headers: Record<string, string> };
  response: { rawText: string; parsed: unknown };
  candles: UsDailyCandle[];
  diagnostics: { source?: string; httpStatus: number; kisOk: boolean; rtCd: string | null; msgCd: string | null; msg1: string | null; outputKey: string | null; rawOutputCount: number; parsedCandleCount: number; firstDate: string | null; lastDate: string | null; savedCandleCount?: number; discardedOrDuplicateCandleCount?: number; saveError?: string; cacheLookup?: "FAILED"; cacheLookupErrorName?: string };
};

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const REQUEST_TIMEOUT_MS = 30_000;

function ascii(value: unknown, fallback = "") {
  const text = String(value ?? fallback);
  return /^[\x00-\x7F]*$/.test(text) ? text : fallback;
}

function number(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(raw)) return Number.NaN;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function optionalNumber(value: unknown) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function json(raw: string) {
  try { return JSON.parse(raw); } catch { return null; }
}

export function parseUsDailyPriceRows(output: unknown[]): UsDailyCandle[] {
  return output.map((value: any) => ({
    __raw: value,
    date: String(value?.xymd ?? value?.stck_bsop_date ?? value?.bass_dt ?? value?.date ?? "").trim(),
    open: number(value?.xopn ?? value?.open ?? value?.stck_oprc ?? value?.oprc),
    high: number(value?.xhgh ?? value?.high ?? value?.stck_hgpr ?? value?.hgpr),
    low: number(value?.xlow ?? value?.low ?? value?.stck_lwpr ?? value?.lwpr),
    close: number(value?.xclo ?? value?.clos ?? value?.xprc ?? value?.last ?? value?.close ?? value?.stck_clpr ?? value?.clpr),
    volume: number(value?.xvol ?? value?.tvol ?? value?.acml_vol ?? value?.volume),
    tradingValue: optionalNumber(value?.tamt),
    priceSign: value?.sign == null ? null : String(value.sign),
    priceDiff: optionalNumber(value?.diff),
    changeRate: optionalNumber(value?.rate),
    raw: value,
  })).filter((candle: UsDailyCandle) => {
    const date = candle.date;
    return isValidCompactCalendarDate(date)
      && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
      && Math.min(candle.open, candle.high, candle.low, candle.close) > 0
      && candle.volume >= 0
      && candle.high >= Math.max(candle.open, candle.low, candle.close)
      && candle.low <= Math.min(candle.open, candle.high, candle.close);
  });
}

function parseCandles(parsed: any): UsDailyCandle[] {
  const output = Array.isArray(parsed?.output) ? parsed.output : Array.isArray(parsed?.output2) ? parsed.output2 : [];
  return parseUsDailyPriceRows(output);
}

function dailyDiagnostics(parsed: any, status: number, candles: UsDailyCandle[]) {
  const outputKey = Array.isArray(parsed?.output) ? "output" : Array.isArray(parsed?.output2) ? "output2" : null;
  const rawRows = outputKey ? parsed[outputKey] : [];
  return { httpStatus: status, kisOk: parsed?.rt_cd === "0", rtCd: parsed?.rt_cd == null ? null : String(parsed.rt_cd), msgCd: parsed?.msg_cd == null ? null : String(parsed.msg_cd), msg1: parsed?.msg1 == null ? null : String(parsed.msg1), outputKey, rawOutputCount: Array.isArray(rawRows) ? rawRows.length : 0, parsedCandleCount: candles.length, firstDate: candles[0]?.date ?? null, lastDate: candles.at(-1)?.date ?? null };
}

export function buildUsDailyPriceUrl(request: UsDailyPriceRequest, config: Record<string, unknown> = {}) {
  const code = request.code.trim().toUpperCase();
  const market = request.market.trim().toUpperCase();
  // KIS dailyprice requires BYMD. An empty date can return HTTP 200 with an
  // empty output array, which would make every technical indicator look like
  // it has insufficient history. Use the current UTC date when omitted.
  const defaultEndDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const endDate = request.endDate?.replace(/-/g, "") || defaultEndDate;
  const params = new URLSearchParams({
    AUTH: ascii(config.AUTH),
    KEYB: ascii(config.KEYB),
    EXCD: market,
    SYMB: code,
    GUBN: request.timeframe === "W" ? "1" : request.timeframe === "M" ? "2" : "0",
    BYMD: endDate,
    MODP: request.adjusted === false ? "0" : "1",
  });
  return `${BASE_URL}/uapi/overseas-price/v1/quotations/dailyprice?${params.toString()}`;
}

export async function fetchUsDailyPrice(request: UsDailyPriceRequest): Promise<UsDailyPriceResponse | null> {
  const code = request.code.trim().toUpperCase();
  const market = request.market.trim().toUpperCase();
  if (!code || !market) throw new Error("code and market are required");
  const config = await loadKisApiConfig("us_daily_price");
  const url = buildUsDailyPriceUrl({ ...request, code, market }, config);
  const contentType = ascii(config.content_type, "application/json; charset=utf-8");
  const trId = ascii(config.tr_id, "HHDFS76240000") || "HHDFS76240000";
  async function once(token: string) {
    return kisRequest<any>({ url, token, trId, timeoutMs: REQUEST_TIMEOUT_MS, headers: { "content-type": contentType, custtype: ascii(config.custtype, "P") || "P", tr_cont: "" } });
  }
  let token = await getAccessToken();
  if (!token) return null;
  let result = await once(token);
  if (isKisTokenExpiredResponse(result.response.status, result.parsed)) {
    token = await refreshAccessToken(token);
    if (!token) return null;
    result = await once(token);
  }
  const candles = parseCandles(result.parsed);
  return {
    ok: result.response.ok && result.parsed?.rt_cd === "0",
    status: result.response.status,
    request: { method: "GET", url, headers: { authorization: "Bearer <masked>", appkey: "<masked>", appsecret: "<masked>", "content-type": contentType, tr_id: trId, custtype: ascii(config.custtype, "P") || "P", tr_cont: "" } },
    response: { rawText: result.rawText, parsed: result.parsed },
    candles,
    diagnostics: dailyDiagnostics(result.parsed, result.response.status, candles),
  };
}
