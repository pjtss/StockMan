import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { krMinuteCandles, krMinuteFetchLogs } from "@/lib/schema";
import { getAccessToken } from "@/lib/kis";
import { kisRequest } from "@/lib/kis-request-framework";

const BASE = process.env.KIS_MODE === "mock" ? "https://openapivts.koreainvestment.com:29443" : "https://openapi.koreainvestment.com:9443";
export async function fetchKrMinuteCandles(code: string, minutes = 30, market = "KOSPI") {
  const token = await getAccessToken(); if (!token) throw new Error("KIS token unavailable");
  const limit = Math.min(1200, Math.max(1, minutes));
  const rows: any[] = [];
  let cursor = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(":", "");
  const seen = new Set<string>();
  for (let page = 0; rows.length < limit && page < 40; page++) {
    const url = new URL(`${BASE}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice`);
    url.searchParams.set("FID_ETC_CLS_CODE", ""); url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J"); url.searchParams.set("FID_INPUT_ISCD", code); url.searchParams.set("FID_INPUT_HOUR_1", cursor); url.searchParams.set("FID_PW_DATA_INCU_YN", "Y");
    const result = await kisRequest<any>({ url, token, trId: "FHKST03010200" });
    const json = result.parsed; const output = Array.isArray(json?.output2) ? json.output2 : [];
    const fetchedAt = new Date();
    await getDb().insert(krMinuteFetchLogs).values({ market, code, requestDate: fetchedAt.toISOString().slice(0, 10).replace(/-/g, ""), requestTime: fetchedAt.toISOString().slice(11, 19).replace(/:/g, ""), httpStatus: result.response.status, responseCode: json?.rt_cd ?? null, responseMessage: json?.msg1 ?? null, responseCount: output.length, requestUrl: url.toString(), rawPayload: result.rawText, parsedPayload: JSON.stringify(json ?? null), ok: result.response.ok && json?.rt_cd === "0", error: result.response.ok && json?.rt_cd === "0" ? null : `KIS minute API ${result.response.status}: ${json?.msg1 ?? "unknown"}` });
    if (!result.response.ok || json?.rt_cd !== "0") throw new Error(`KIS minute API ${result.response.status}: ${json?.msg1 ?? "unknown"}`);
    const pageRows = output.map((r: any) => ({ date: String(r.stck_bsop_date ?? ""), time: String(r.stck_cntg_hour ?? ""), open: Number(r.stck_oprc ?? 0), high: Number(r.stck_hgpr ?? 0), low: Number(r.stck_lwpr ?? 0), close: Number(r.stck_prpr ?? 0), volume: Number(r.cntg_vol ?? 0), raw: r })).filter((r: any) => r.date && r.time && r.close > 0);
    const before = rows.length; for (const row of pageRows) { const key = `${row.date}:${row.time}`; if (!seen.has(key)) { seen.add(key); rows.push(row); } }
    if (!pageRows.length || rows.length === before) break;
    const earliest = pageRows.reduce((a: any, b: any) => `${b.date}${b.time}` < `${a.date}${a.time}` ? b : a, pageRows[0]);
    const hhmm = Number(earliest.time) - 1; cursor = String(hhmm).padStart(6, "0");
  }
  return rows.sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).slice(0, limit);
}
export async function saveKrMinuteCandles(market: string, code: string, rows: any[]) { if (!rows.length) return 0; await getDb().insert(krMinuteCandles).values(rows.map((r) => ({ market, code, candleDate: r.date, candleTime: r.time, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, source: "KIS" }))).onConflictDoUpdate({ target: [krMinuteCandles.market, krMinuteCandles.code, krMinuteCandles.candleDate, krMinuteCandles.candleTime], set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, fetchedAt: new Date() } }); return rows.length; }
export async function loadKrMinuteCandles(market: string, code: string, limit = 100) { return getDb().select().from(krMinuteCandles).where(and(eq(krMinuteCandles.market, market), eq(krMinuteCandles.code, code))).orderBy(desc(krMinuteCandles.candleDate), desc(krMinuteCandles.candleTime)).limit(limit); }
