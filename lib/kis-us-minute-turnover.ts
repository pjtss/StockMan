import { getAccessToken, refreshAccessToken } from "@/lib/kis";
import { loadKisApiConfig } from "@/lib/kis-api-config";
import { buildKisAuthorization, isKisTokenExpiredResponse } from "@/lib/kis-authorization";
import { withKisRequestThrottle } from "@/lib/kis-request-throttle";

export type UsMinuteTurnoverRequest = {
  code: string;
  market?: string;
};

export type UsMinuteTurnoverPoint = {
  index: number;
  time: string;
  price: number;
  amount: number;
  volume?: number;
  high?: number;
  low?: number;
  bid?: number;
  ask?: number;
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
  pageCount?: number;
  complete?: boolean;
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

function continuation(parsed: any) {
  const output1 = parsed?.output1 ?? {};
  const next = String(output1.next ?? output1.nextkey ?? output1.NEXT ?? "").trim();
  const more = String(output1.more ?? output1.MORE ?? "").trim();
  return { next, more, hasMore: more ? more !== "0" : Boolean(next) };
}

function buildRequest(code: string, market: string, config: Awaited<ReturnType<typeof loadKisApiConfig>>, next = "") {
  const params = new URLSearchParams({
    AUTH: asciiOnly(config.AUTH, ""),
    KEYB: asciiOnly(config.KEYB, ""),
    EXCD: market,
    FID_COND_MRKT_DIV_CODE: asciiOnly(config.FID_COND_MRKT_DIV_CODE, market) || market,
    SYMB: code,
    FID_INPUT_ISCD: code,
    FID_HOUR_CLS_CODE: asciiOnly(config.FID_HOUR_CLS_CODE, "0") || "0",
    PINC: asciiOnly(config.FID_PW_DATA_INCU_YN, "N") || "N",
    NEXT: next,
    NREC: "120",
    FILL: "0",
    NMIN: "1",
  });
  const url = `https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice?${params.toString()}`;
  return { url, params };
}

function parsePoints(parsed: any): UsMinuteTurnoverPoint[] {
  const output = Array.isArray(parsed?.output)
    ? parsed.output
    : Array.isArray(parsed?.output2)
      ? parsed.output2
      : parsed?.output ?? parsed?.output1 ?? {};
  const rows = Array.isArray(output) ? output : Array.isArray(output?.data) ? output.data : [];
  return rows
    .map((row: any, index: number) => ({
      index,
      time: String(row.kymd && row.khms ? `${row.kymd}T${row.khms}` : row.xymd && row.xhms ? `${row.xymd}T${row.xhms}` : row.stck_cntg_hour || row.todt || row.time || row.date || "").trim(),
      price: parseNumber(row.last ?? row.price ?? row.stck_prpr ?? row.close ?? row.cprc),
      amount: parseNumber(
        row.tamnt ?? row.acml_tr_pbmn ?? row.acml_tr_value ?? row.trade_amount ?? row.pbmn ??
        row.amount ?? row.tvol ?? row.cum_amount ?? row.cumTradeAmount ?? row.cntg_pbmn ?? row.value ?? row.eamt ?? row.evol
      ),
      volume: parseNumber(row.evol ?? row.tvol ?? row.volume ?? row.acml_vol ?? row.acml_volume) || undefined,
      high: parseNumber(row.high ?? row.hprc ?? row.high_price ?? row.hts_high) || undefined,
      low: parseNumber(row.low ?? row.lprc ?? row.low_price ?? row.hts_low) || undefined,
      bid: parseNumber(row.pbid ?? row.bid) || undefined,
      ask: parseNumber(row.pask ?? row.ask) || undefined,
      raw: row,
    }))
    .filter((row: UsMinuteTurnoverPoint) => row.price > 0 || row.amount > 0);
}

export async function fetchUsMinuteTurnover({ code: rawCode, market: rawMarket = "AMS" }: UsMinuteTurnoverRequest): Promise<UsMinuteTurnoverResponse | null> {
  const code = rawCode.trim().toUpperCase();
  const config = await loadKisApiConfig("us_turnover_trend");
  const market = rawMarket.trim().toUpperCase();
  const appkey = asciiOnly(process.env.KIS_APPKEY);
  const appsecret = asciiOnly(process.env.KIS_APPSECRET);
  const contentType = asciiOnly(config.content_type, "application/json; charset=utf-8");
  const trId = asciiOnly(config.tr_id, "HHDFS76950200") || "HHDFS76950200";
  const custtype = asciiOnly(config.custtype, "P") || "P";

  async function fetchOnce(token: string, next = "") {
    const { url } = buildRequest(code, market, config, next);
    const response = await withKisRequestThrottle(() => fetch(url, {
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
    }));
    const rawText = await response.text();
    return { response, rawText, parsed: parseJson(rawText), url };
  }

  let token = await getAccessToken();
  if (!token) return null;
  let result = await fetchOnce(token);
  if (isKisTokenExpiredResponse(result.response.status, result.parsed)) {
    token = await refreshAccessToken();
    if (!token) return null;
    result = await fetchOnce(token);
  }

  const allPoints = [...parsePoints(result.parsed)];
  let pageCount = 1;
  let cursor = continuation(result.parsed);
  let next = cursor.hasMore ? cursor.next : "";
  while (next && pageCount < 10) {
    const page = await fetchOnce(token, next);
    const pagePoints = parsePoints(page.parsed);
    if (!page.response.ok || pagePoints.length === 0) break;
    allPoints.push(...pagePoints); pageCount += 1;
    const following = continuation(page.parsed);
    if (!following.hasMore || !following.next || following.next === next) { next = ""; break; }
    next = following.next;
  }
  console.info("[US-TURNOVER] request", { url: result.url, market, code, trId, contentType, pageCount });
  console.info("[US-TURNOVER] response summary", {
    status: result.response.status,
    rawBytes: Buffer.byteLength(result.rawText, "utf8"),
    pointCount: allPoints.length,
  });

  return {
    ok: result.response.ok,
    status: result.response.status,
    request: {
      method: "GET",
      url: result.url,
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
    points: allPoints,
    pageCount,
    complete: !next,
  };
}
