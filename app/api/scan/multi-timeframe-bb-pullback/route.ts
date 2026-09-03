import { NextResponse } from "next/server";
import { scanMultiTimeframeBbPullback } from "@/lib/multi-timeframe-bb-pullback";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim(); const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const market = params.get("market")?.toUpperCase() === "KR" ? "KR" : "US";
  const mode = params.get("mode") === "all-middle-above" ? "all-middle-above" : "pullback";
  try { return NextResponse.json(await scanMultiTimeframeBbPullback(market, mode)); }
  catch (error) {
    console.error("[API /scan/multi-timeframe-bb-pullback] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "MULTI_TIMEFRAME_BB_SCAN_UNAVAILABLE" }, { status: 503 });
  }
}
