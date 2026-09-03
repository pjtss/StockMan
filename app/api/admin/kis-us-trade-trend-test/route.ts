import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchKisUsTradeTrend } from "@/lib/kis-us-trade-trend";
import { calculateTradeIntensityMetrics, scoreTradeIntensity } from "@/lib/us-trade-intensity-metrics";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = new URL(request.url).searchParams; const code = (p.get("code") || "").trim().toUpperCase(); const marketParam = (p.get("market") || "").trim().toUpperCase(); const day = p.get("day") === "0" ? "0" : "1";
  if (!code) return NextResponse.json({ error: "종목코드를 입력하세요." }, { status: 400 });
  if (marketParam && !["NAS", "AMS", "NYS"].includes(marketParam)) return NextResponse.json({ error: "지원하지 않는 거래소입니다. (NAS, AMS, NYS)" }, { status: 400 });
  if (code.length > 32 || !/^[A-Z0-9./_-]+$/.test(code)) return NextResponse.json({ error: "유효하지 않은 종목코드입니다." }, { status: 400 });
  let result;
  try {
    result = await fetchKisUsTradeTrend({ code, market: marketParam ? marketParam as "NAS" | "AMS" | "NYS" : undefined, day });
  } catch (error) {
    console.error("[API /admin/kis-us-trade-trend-test] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ ok: false, error: "KIS_US_TRADE_TREND_UNAVAILABLE" }, { status: 502 });
  }
  if (!result) return NextResponse.json({ error: "KIS access token is unavailable" }, { status: 503 });
  const metrics = calculateTradeIntensityMetrics(result.trades);
  const option = (name: string) => { const value = Number(p.get(name)); return Number.isFinite(value) ? value : undefined; };
  const scoringOptions = { minSamples: option("minSamples"), minimumAverageIntensity: option("minIntensity"), strongScore: option("strongScore"), watchScore: option("watchScore") };
  const score = scoreTradeIntensity(metrics, scoringOptions);
  const activeScoringOptions = Object.fromEntries(Object.entries(scoringOptions).filter(([, value]) => value !== undefined));
  return NextResponse.json({ ok: result.ok, status: result.status, request: { method: "GET", endpoint: "/uapi/overseas-price/v1/quotations/inquire-ccnl", tr_id: "HHDFS76200300", fallbackOrder: marketParam ? undefined : ["NAS", "AMS", "NYS"], params: { EXCD: result.market, SYMB: code, TDAY: day, AUTH: "", KEYB: "" } }, diagnostics: result.diagnostics, analysis: { metrics, score, scoringOptions: activeScoringOptions }, trades: result.trades, raw: result.raw, rawText: result.rawText });
}
