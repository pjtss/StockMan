import { getAccessToken, refreshAccessToken } from "@/lib/kis";
import { buildKisAuthorization, isKisTokenExpiredResponse } from "@/lib/kis-authorization";
import { loadKisApiConfig } from "@/lib/kis-api-config";

export type KisUsTradeTrendRequest = { code: string; market: "NAS" | "NYSE" | "AMS"; day?: "0" | "1" };
export type KisUsTrade = { time: string; price: number | null; changeRate: number | null; volume: number | null; totalVolume: number | null; marketType: string; bid: number | null; ask: number | null; intensity: number | null };
export type KisUsTradeTrendResult = { ok: boolean; status: number; code: string; market: string; day: string; trades: KisUsTrade[]; raw: unknown; rawText: string; diagnostics: { rt_cd: string | null; msg_cd: string | null; msg1: string | null; outputKey: string | null } };

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
function parse(raw: any): { trades: KisUsTrade[]; outputKey: string | null } {
  const key = Array.isArray(raw?.output2) ? "output2" : Array.isArray(raw?.output1) ? "output1" : null;
  const rows = key ? raw[key] : [];
  return { outputKey: key, trades: rows.map((r: any) => ({ time: String(r.khms ?? ""), price: num(r.last), changeRate: num(r.rate), volume: num(r.evol), totalVolume: num(r.tvol), marketType: String(r.mtyp ?? ""), bid: num(r.pbid), ask: num(r.pask), intensity: num(r.vpow) })) };
}

export async function fetchKisUsTradeTrend(input: KisUsTradeTrendRequest): Promise<KisUsTradeTrendResult | null> {
  const code = input.code.trim().toUpperCase(); const market = input.market; const day = input.day ?? "1";
  const config = await loadKisApiConfig("us_trade_trend");
  const params = new URLSearchParams({ AUTH: config.AUTH ?? "", EXCD: market, TDAY: day, SYMB: code, KEYB: config.KEYB ?? "" });
  const url = `https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/inquire-ccnl?${params}`;
  const headers = (token: string) => ({ "content-type": config.content_type, Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY || "", appsecret: process.env.KIS_APPSECRET || "", tr_id: config.tr_id || "HHDFS76200300", custtype: config.custtype || "P", tr_cont: "" });
  async function once(token: string) { const response = await fetch(url, { headers: headers(token) }); const rawText = await response.text(); let raw: any = null; try { raw = JSON.parse(rawText); } catch {} return { response, raw, rawText }; }
  let token = await getAccessToken(); if (!token) return null; let result = await once(token);
  if (isKisTokenExpiredResponse(result.response.status, result.raw)) { token = await refreshAccessToken(); if (!token) return null; result = await once(token); }
  const parsed = parse(result.raw);
  return { ok: result.response.ok && result.raw?.rt_cd !== "1", status: result.response.status, code, market, day, trades: parsed.trades, raw: result.raw, rawText: result.rawText, diagnostics: { rt_cd: result.raw?.rt_cd ?? null, msg_cd: result.raw?.msg_cd ?? null, msg1: result.raw?.msg1 ?? null, outputKey: parsed.outputKey } };
}
