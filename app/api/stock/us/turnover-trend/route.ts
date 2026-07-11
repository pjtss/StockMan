import { NextResponse } from "next/server";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";
import { getAccessToken, refreshAccessToken } from "@/lib/kis";
import { loadKisApiConfig } from "@/lib/kis-api-config";
import { buildKisAuthorization, isKisTokenExpiredResponse } from "@/lib/kis-authorization";

function asciiOnly(value: string | undefined | null, fallback = "") {
  const text = String(value ?? fallback);
  return /^[\x00-\x7F]*$/.test(text) ? text : fallback;
}

export async function GET(request: Request) {
  const flags = await loadAdminFeatureFlags();
  if (!flags.us_turnover_trend) {
    return NextResponse.json({ error: "해외주식 거래대금 추이 기능이 비활성화되었습니다." }, { status: 503 });
  }

  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim().toUpperCase();
  const config = await loadKisApiConfig("us_turnover_trend");
  const market = (url.searchParams.get("market") || config.EXCD || "AMS").trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const appkey = asciiOnly(process.env.KIS_APPKEY);
  const appsecret = asciiOnly(process.env.KIS_APPSECRET);
  const contentType = asciiOnly(config.content_type, "application/json; charset=utf-8");
  const trId = asciiOnly(config.tr_id, "HHDFS76950200") || "HHDFS76950200";
  const custtype = asciiOnly(config.custtype, "P") || "P";
  const params = new URLSearchParams({
    AUTH: asciiOnly(config.AUTH, "") || "",
    KEYB: asciiOnly(config.KEYB, "") || "",
    EXCD: market,
    FID_COND_MRKT_DIV_CODE: asciiOnly(config.FID_COND_MRKT_DIV_CODE, market) || market,
    SYMB: code,
    FID_INPUT_ISCD: code,
    FID_HOUR_CLS_CODE: asciiOnly(config.FID_HOUR_CLS_CODE, "0") || "0",
    FID_PW_DATA_INCU_YN: asciiOnly(config.FID_PW_DATA_INCU_YN, "N") || "N",
    NMIN: "1",
  });

  const baseUrl = "https://openapi.koreainvestment.com:9443";
  const targetUrl = `${baseUrl}/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice?${params.toString()}`;

  async function fetchOnce(token: string) {
    const response = await fetch(targetUrl, {
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
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
    return { response, rawText, parsed };
  }

  let token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "KIS access token is unavailable" }, { status: 500 });
  }

  let result = await fetchOnce(token);
  if (isKisTokenExpiredResponse(result.response.status, result.parsed)) {
    token = await refreshAccessToken();
    if (!token) {
      return NextResponse.json({ error: "KIS access token is unavailable" }, { status: 500 });
    }
    result = await fetchOnce(token);
  }

  const { response, rawText, parsed } = result;
  console.info("[US-TOURNOVER] request", {
    url: targetUrl,
    market,
    code,
    trId,
    contentType,
  });
  console.info("[US-TOURNOVER] raw response", rawText);

  const output = parsed?.output ?? parsed?.output1 ?? parsed?.output2 ?? {};
  const rows = Array.isArray(output) ? output : Array.isArray(output?.data) ? output.data : [];

  const points = rows
    .map((row: any, index: number) => {
      const time = String(row.xymd || row.stck_cntg_hour || row.todt || row.time || row.date || "").trim();
      const amountRaw =
        row.tamnt ??
        row.acml_tr_pbmn ??
        row.acml_tr_value ??
        row.trade_amount ??
        row.pbmn ??
        row.amount ??
        row.tvol ??
        row.cum_amount ??
        row.cumTradeAmount ??
        row.cntg_pbmn ??
        row.value ??
        0;

      const amount = Number(String(amountRaw).replace(/[^0-9.-]/g, "")) || 0;
      const priceRaw = row.last ?? row.price ?? row.stck_prpr ?? row.close ?? row.cprc ?? 0;
      const price = Number(String(priceRaw).replace(/[^0-9.-]/g, "")) || 0;

      return {
        index,
        time,
        price,
        amount,
        raw: row,
      };
    })
    .filter((row: any) => row.price > 0 || row.amount > 0);

  return NextResponse.json({
    ok: response.ok,
    status: response.status,
    request: {
      method: "GET",
      url: targetUrl,
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
    response: {
      rawText,
      parsed,
    },
    points,
  });
}
