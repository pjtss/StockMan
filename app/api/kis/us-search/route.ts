import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/kis-token";
import { fetchKisUsSearch, type KisUsTradeMarket } from "@/lib/kis-us-trade-trend";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";

const MARKETS = new Set<KisUsTradeMarket>(["NAS", "NYS", "AMS"]);
const FILTER_KEYS = ["CO_YN_PRICECUR", "CO_ST_PRICECUR", "CO_EN_PRICECUR", "CO_YN_RATE", "CO_ST_RATE", "CO_EN_RATE", "CO_YN_VALX", "CO_ST_VALX", "CO_EN_VALX", "CO_YN_SHAR", "CO_ST_SHAR", "CO_EN_SHAR", "CO_YN_VOLUME", "CO_ST_VOLUME", "CO_EN_VOLUME", "CO_YN_AMT", "CO_ST_AMT", "CO_EN_AMT", "CO_YN_EPS", "CO_ST_EPS", "CO_EN_EPS", "CO_YN_PER", "CO_ST_PER", "CO_EN_PER", "KEYB"] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const market = (url.searchParams.get("market") ?? "NAS").toUpperCase() as KisUsTradeMarket;
  if (!MARKETS.has(market)) return NextResponse.json({ ok: false, error: "INVALID_MARKET", markets: [...MARKETS] }, { status: 400 });
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market }, { status: 503 });
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, url.searchParams.get(key) ?? ""]));
  const result = await fetchKisUsSearch({ market, filters });
  if (!result) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market }, { status: 503 });
  const collectedAt = new Date().toISOString();
  const rows = result.rows.map((row, index) => ({ ...row, rank: row.rank ?? row.data_rank ?? index + 1, code: String(row.symb ?? row.rsym ?? row.code ?? "").trim() || null, name: String(row.name ?? row.hts_kor_isnm ?? row.prdt_name ?? "").trim() || null, observedAt: collectedAt }));
  await writeKisSignalSnapshot({ market: "US", code: "SEARCH", signalType: "candidate_us_condition_search", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", observedAt: new Date(collectedAt), payload: rows, rawPayload: JSON.stringify(result.raw) });
  return NextResponse.json({ ...result, source: "KIS", market, signalType: "candidate_us_condition_search", collectedAt, rows }, { status: result.ok ? 200 : 502 });
}
