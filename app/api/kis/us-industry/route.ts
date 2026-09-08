import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/kis-token";
import { fetchKisUsIndustryTheme, type KisUsTradeMarket } from "@/lib/kis-us-trade-trend";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";
const MARKETS = new Set<KisUsTradeMarket>(["NAS", "NYS", "AMS"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const market = (url.searchParams.get("market") ?? "NAS").toUpperCase() as KisUsTradeMarket;
  const industry = url.searchParams.get("industry")?.trim() ?? "";
  if (!MARKETS.has(market) || !industry) return NextResponse.json({ ok: false, error: !MARKETS.has(market) ? "INVALID_MARKET" : "INDUSTRY_REQUIRED", markets: [...MARKETS] }, { status: 400 });
  if (!(await getAccessToken())) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market }, { status: 503 });
  const result = await fetchKisUsIndustryTheme({ market, industry, volumeRange: url.searchParams.get("volumeRange") ?? "0" });
  if (!result) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market }, { status: 503 });
  const collectedAt = new Date().toISOString();
  const rows = result.rows.map((row, index) => ({ ...row, rank: row.rank ?? row.data_rank ?? index + 1, code: String(row.symb ?? row.rsym ?? row.code ?? "").trim() || null, name: String(row.name ?? row.hts_kor_isnm ?? row.prdt_name ?? "").trim() || null, observedAt: collectedAt }));
  await writeKisSignalSnapshot({ market: "US", code: `INDUSTRY:${industry}`, signalType: "candidate_us_industry_theme", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", observedAt: new Date(collectedAt), payload: rows, rawPayload: JSON.stringify(result.raw) });
  return NextResponse.json({ ...result, source: "KIS", market, industry, signalType: "candidate_us_industry_theme", collectedAt, rows }, { status: result.ok ? 200 : 502 });
}
