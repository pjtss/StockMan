import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { recommendMultiTimeframe } from "@/lib/multi-timeframe-recommendations";
import { withAutomationRun } from "@/lib/automation-run";

const isMarket = (value: string | null): value is "KR" | "US" => value === "KR" || value === "US";
const isMode = (value: string | null): value is "scalp" | "swing" | "all" => value === "scalp" || value === "swing" || value === "all";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const market = isMarket(params.get("market")?.toUpperCase() ?? null) ? params.get("market")!.toUpperCase() as "KR" | "US" : "KR";
  const mode = isMode(params.get("mode")) ? params.get("mode") as "scalp" | "swing" | "all" : "all";
  const rawLimit = Number(params.get("limit") ?? 30);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.trunc(rawLimit))) : 30;
  try {
    const analysis = await withAutomationRun(`technical-entry-analysis:${market}` as string, () => recommendMultiTimeframe(market, mode, limit), { market, timeframe: "D/W/M" });
    const results = analysis.results.map((result: any, index: number) => ({ rank: index + 1, ...result }));
    return NextResponse.json({
      ...analysis,
      results,
      tickers: results.map((result: any) => result.code).join(","),
      responseMeta: {
        market,
        mode,
        timeframes: ["D", "W", "M"],
        generatedAt: new Date().toISOString(),
        resultCount: results.length,
        dataPolicy: "DB 저장 완료봉만 사용",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "TECHNICAL_ENTRY_ANALYSIS_UNAVAILABLE" }, { status: 503 });
  }
}
