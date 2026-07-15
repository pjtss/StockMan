import { getAccessToken, refreshAccessToken } from "@/lib/kis";
import { loadKisApiConfig } from "@/lib/kis-api-config";
import { buildKisAuthorization, isKisTokenExpiredResponse } from "@/lib/kis-authorization";

export type UsMinuteTurnoverRequest = {
  code: string;
  market?: string;
};

export type UsMinuteTurnoverPoint = {
  index: number;
  time: string;
  price: number;
  amount: number;
  raw: unknown;
};

export type UsMinuteTurnoverResponse = {
  ok: boolean;
  status: number;
  request: {
    method: "GET";
    url: string;
    headers: Record<string, string>;
  };
  response: {
    rawText: string;
    parsed: unknown;
  };
  points: UsMinuteTurnoverPoint[];
};

function asciiOnly(value: string | undefined | null, fallback = "") {
  const text = String(value ?? fallback);
  return /^[\x00-\x7F]*$/.test(text) ? text : fallback;
}

function parseNumber(value: unknown) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

function parseJson(rawText: string) {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function buildRequest(code: string, market: string, config: Awaited<ReturnType<typeof loadKisApiConfig>>) {
  const params = new URLSearchParams({
    AUTH: asciiOnly(config.AUTH, ""),
    KEYB: asciiOnly(config.KEYB, ""),
    EXCD: market,
    FID_COND_MRKT_DIV_CODE: asciiOnly(config.FID_COND_MRKT_DIV_CODE, market) || market,
    SYMB: code,
    FID_INPUT_ISCD: code,
    FID_HOUR_CLS_CODE: asciiOnly(config.FID_HOUR_CLS_CODE, "0") || "0",
    FID_PW_DATA_INCU_YN: asciiOnly(config.FID_PW_DATA_INCU_YN, "N") || "N",
    NMIN: "1",
  });
  const url = `https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice?${params.toString()}`;
  return { url, params };
}

function parsePoints(parsed: any): UsMinuteTurnoverPoint[] {
  const output = parsed?.output ?? parsed?.output1 ?? parsed?.output2 ?? {};
  const rows = Array.isArray(output) ? output : Array.isArray(output?.data) ? output.data : [];
  return rows
    .map((row: any, index: number) => ({
      index,
      time: String(row.xymd || row.stck_cntg_hour || row.todt || row.time || row.date || "").trim(),
      price: parseNumber(row.last ?? row.price ?? row.stck_prpr ?? row.close ?? row.cprc),
      amount: parseNumber(
        row.tamnt ?? row.acml_tr_pbmn ?? row.acml_tr_value ?? row.trade_amount ?? row.pbmn ??
        row.amount ?? row.tvol ?? row.cum_amount ?? row.cumTradeAmount ?? row.cntg_pbmn ?? row.value
      ),
      raw: row,
    }))
    .filter((row: UsMinuteTurnoverPoint) => row.price > 0 || row.amount > 0);
}

export async function fetchUsMinuteTurnover({ code: rawCode, market: rawMarket = "AMS" }: UsMinuteTurnoverRequest): Promise<UsMinuteTurnoverResponse | null> {
  const code = rawCode.trim().toUpperCase();
  const config = await loadKisApiConfig("us_turnover_trend");
  const market = rawMarket.trim().toUpperCase();
  const { url } = buildRequest(code, market, config);
  const appkey = asciiOnly(process.env.KIS_APPKEY);
  const appsecret = asciiOnly(process.env.KIS_APPSECRET);
  const contentType = asciiOnly(config.content_type, "application/json; charset=utf-8");
  const trId = asciiOnly(config.tr_id, "HHDFS76950200") || "HHDFS76950200";
  const custtype = asciiOnly(config.custtype, "P") || "P";

  async function fetchOnce(token: string) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "content-type": contentType,
        authorization: buildKisAuthorization(token),
        appkey,
        appsecret,
        tr_id: trId,
        custtype,
        tr_cont: "",
      },
    });
    const rawText = await response.text();
    return { response, rawText, parsed: parseJson(rawText) };
  }

  let token = await getAccessToken();
  if (!token) return null;
  let result = await fetchOnce(token);
  if (isKisTokenExpiredResponse(result.response.status, result.parsed)) {
    token = await refreshAccessToken();
    if (!token) return null;
    result = await fetchOnce(token);
  }

  console.info("[US-TURNOVER] request", { url, market, code, trId, contentType });
  console.info("[US-TURNOVER] raw response", result.rawText);

  return {
    ok: result.response.ok,
    status: result.response.status,
    request: {
      method: "GET",
      url,
      headers: {
        authorization: "Bearer <masked>",
        appkey: "<masked>",
        appsecret: "<masked>",
        "content-type": contentType,
        tr_id: trId,
        custtype,
        tr_cont: "",
      },
    },
    response: { rawText: result.rawText, parsed: result.parsed },
    points: parsePoints(result.parsed),
  };
}
