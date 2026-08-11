import { getAccessToken } from "@/lib/kis";
import { buildKisAuthorization } from "@/lib/kis-authorization";
import { KIS_APPKEY, KIS_APPSECRET } from "@/lib/kis-runtime";
import type { OHLCVCandle } from "@/lib/kis-chart";
import { withKisRequestThrottle } from "@/lib/kis-request-throttle";

export type KrDailyPriceResponse = { ok: boolean; status: number; request: { url: string; headers: Record<string,string> }; response: { rawText: string; parsed: unknown }; candles: Array<OHLCVCandle & { raw: unknown }>; diagnostics: Record<string, unknown> };
function num(value: unknown) { const n = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; }
export async function fetchKrDailyPrice(request: { code: string; startDate?: string; endDate?: string }): Promise<KrDailyPriceResponse | null> {
  const code = request.code.trim(); const end = request.endDate?.replace(/-/g, "") ?? new Date().toISOString().slice(0,10).replace(/-/g, ""); const start = request.startDate?.replace(/-/g, "") ?? new Date(Date.now() - 180 * 86400000).toISOString().slice(0,10).replace(/-/g, "");
  const url = new URL("https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice");
  for (const [key,value] of Object.entries({ FID_COND_MRKT_DIV_CODE:"J", FID_INPUT_ISCD:code, FID_INPUT_DATE_1:start, FID_INPUT_DATE_2:end, FID_PERIOD_DIV_CODE:"D", FID_ORG_ADJ_PRC:"0" })) url.searchParams.set(key,value);
  const token = await getAccessToken(); if (!token) return null;
  const response = await withKisRequestThrottle(() => fetch(url, { headers: { "content-type":"application/json", Authorization: buildKisAuthorization(token), appkey:KIS_APPKEY ?? "", appsecret:KIS_APPSECRET ?? "", tr_id:"FHKST03010100", custtype:"P" } }));
  const rawText = await response.text(); let parsed: any = null; try { parsed = JSON.parse(rawText); } catch {}
  const rows = Array.isArray(parsed?.output2) ? parsed.output2 : [];
  const candles = rows.map((row:any) => ({ date:String(row.stck_bsop_date ?? ""), open:num(row.stck_oprc), high:num(row.stck_hgpr), low:num(row.stck_lwpr), close:num(row.stck_clpr), volume:num(row.acml_vol), raw:row })).filter((row:any) => row.date && row.close > 0);
  return { ok: response.ok && parsed?.rt_cd === "0" && candles.length > 0, status: response.status, request: { url:url.toString(), headers:{ Authorization:"Bearer <masked>", appkey:"<masked>", appsecret:"<masked>", tr_id:"FHKST03010100" } }, response:{ rawText, parsed }, candles, diagnostics:{ httpStatus:response.status, kisOk:parsed?.rt_cd === "0", rtCd:parsed?.rt_cd ?? null, msgCd:parsed?.msg_cd ?? null, msg1:parsed?.msg1 ?? null, outputKey:"output2", rawOutputCount:rows.length, parsedCandleCount:candles.length, firstDate:candles[0]?.date ?? null, lastDate:candles.at(-1)?.date ?? null, error:parsed?.rt_cd === "0" && candles.length === 0 ? "EMPTY_DAILY_CANDLES" : undefined } };
}
