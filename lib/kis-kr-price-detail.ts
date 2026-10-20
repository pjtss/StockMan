import { getAccessToken } from "@/lib/kis";
import { buildKisAuthorization } from "@/lib/kis-authorization";
import { KIS_APPKEY, KIS_APPSECRET } from "@/lib/kis-runtime";
import { withKisRequestThrottle } from "@/lib/kis-request-throttle";
export function parseKisNullableNumber(value: unknown) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchKrPriceDetail(code: string) {
  const token = await getAccessToken();
  if (!token) return null;
  const url = new URL("https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price");
  for (const [key, value] of Object.entries({ FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code })) url.searchParams.set(key, value);
  const { response, rawText, parsed } = await withKisRequestThrottle(async () => {
    const response = await fetch(url, {
      headers: { "content-type": "application/json", Authorization: buildKisAuthorization(token), appkey: KIS_APPKEY ?? "", appsecret: KIS_APPSECRET ?? "", tr_id: "FHKST01010100", custtype: "P" },
      signal: AbortSignal.timeout(8_000),
    });
    const rawText = await response.text();
    let parsed: any = null;
    try { parsed = JSON.parse(rawText); } catch { /* invalid JSON remains an unavailable quote */ }
    return { response, rawText, parsed };
  });
  const output = parsed?.output ?? {};
  const price = parseKisNullableNumber(output.stck_prpr);
  const tradingValue = parseKisNullableNumber(output.acml_tr_pbmn);
  const marketCapRaw = parseKisNullableNumber(output.hts_avls);
  const marketCap = marketCapRaw !== null && marketCapRaw > 0 ? marketCapRaw * 100_000_000 : null;
  const kisOk = response.ok && parsed?.rt_cd === "0";
  return {
    ok: kisOk && price !== null && price > 0,
    status: response.status,
    price,
    volume: parseKisNullableNumber(output.acml_vol),
    tradingValue,
    marketCap,
    listedShares: parseKisNullableNumber(output.lstn_stcn),
    currency: "KRW",
    marketCapUnit: "KRW",
    marketCapRaw,
    turnoverRatio: marketCap !== null && tradingValue !== null ? tradingValue / marketCap * 100 : null,
    changeRate: parseKisNullableNumber(output.prdy_ctrt),
    productMarket: String(output.rprs_mrkt_kor_name ?? ""),
    exchange: String(output.rprs_mrkt_kor_name ?? ""),
    productName: String(output.bstp_kor_isnm ?? ""),
    error: kisOk && (price === null || price <= 0) ? "EMPTY_QUOTE" : "",
    rawText,
    parsed,
  };
}
