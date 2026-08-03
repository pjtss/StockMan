import { getAccessToken, refreshAccessToken } from "@/lib/kis";
import { loadKisApiConfig } from "@/lib/kis-api-config";
import { buildKisAuthorization, isKisTokenExpiredResponse } from "@/lib/kis-authorization";
import { withKisRequestThrottle } from "@/lib/kis-request-throttle";

export type UsDailyPriceRequest = {
  code: string;
  market: string;
  endDate?: string;
  adjusted?: boolean;
};

export type UsDailyCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  raw: unknown;
};

export type UsDailyPriceResponse = {
  ok: boolean;
  status: number;
  request: { method: "GET"; url: string; headers: Record<string, string> };
  response: { rawText: string; parsed: unknown };
  candles: UsDailyCandle[];
};

const BASE_URL = "https://openapi.koreainvestment.com:9443";

function ascii(value: unknown, fallback = "") {
  const text = String(value ?? fallback);
  return /^[\x00-\x7F]*$/.test(text) ? text : fallback;
}

function number(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function json(raw: string) {
  try { return JSON.parse(raw); } catch { return null; }
}

function parseCandles(parsed: any): UsDailyCandle[] {
  const output = Array.isArray(parsed?.output) ? parsed.output : Array.isArray(parsed?.output2) ? parsed.output2 : [];
  return output.map((row: any) => ({
    date: String(row.xymd ?? row.stck_bsop_date ?? row.bass_dt ?? row.date ?? "").trim(),
    open: number(row.xopn ?? row.open ?? row.stck_oprc ?? row.oprc),
    high: number(row.xhgh ?? row.high ?? row.stck_hgpr ?? row.hgpr),
    low: number(row.xlow ?? row.low ?? row.stck_lwpr ?? row.lwpr),
    close: number(row.xclo ?? row.clos ?? row.xprc ?? row.last ?? row.close ?? row.stck_clpr ?? row.clpr),
    volume: number(row.xvol ?? row.tvol ?? row.acml_vol ?? row.volume),
    raw: row,
  })).filter((candle: UsDailyCandle) => candle.date && candle.close > 0);
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
    GUBN: "0",
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
  const headers = (token: string) => ({
    "content-type": contentType,
    authorization: buildKisAuthorization(token),
    appkey: ascii(process.env.KIS_APPKEY),
    appsecret: ascii(process.env.KIS_APPSECRET),
    tr_id: trId,
    custtype: ascii(config.custtype, "P") || "P",
    tr_cont: "",
  });
  async function once(token: string) {
    const response = await withKisRequestThrottle(() => fetch(url, { method: "GET", headers: headers(token) }));
    const rawText = await response.text();
    return { response, rawText, parsed: json(rawText) };
  }
  let token = await getAccessToken();
  if (!token) return null;
  let result = await once(token);
  if (isKisTokenExpiredResponse(result.response.status, result.parsed)) {
    token = await refreshAccessToken();
    if (!token) return null;
    result = await once(token);
  }
  return {
    ok: result.response.ok && result.parsed?.rt_cd === "0",
    status: result.response.status,
    request: { method: "GET", url, headers: { ...headers("masked"), authorization: "Bearer <masked>", appkey: "<masked>", appsecret: "<masked>" } },
    response: { rawText: result.rawText, parsed: result.parsed },
    candles: parseCandles(result.parsed),
  };
}
