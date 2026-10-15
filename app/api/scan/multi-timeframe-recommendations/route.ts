import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { recommendMultiTimeframe } from "@/lib/multi-timeframe-recommendations";
export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const params = new URL(request.url).searchParams; const market = params.get("market")?.toUpperCase() === "KR" ? "KR" : "US"; const mode = ["scalp", "swing", "all"].includes(params.get("mode") ?? "") ? params.get("mode") as "scalp" | "swing" | "all" : "all"; const rawLimit = Number(params.get("limit") ?? 30); const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.trunc(rawLimit))) : 30;
  try { return NextResponse.json(await recommendMultiTimeframe(market, mode, limit)); } catch { return NextResponse.json({ ok: false, error: "MULTI_TIMEFRAME_RECOMMENDATIONS_UNAVAILABLE" }, { status: 503 }); }
}
