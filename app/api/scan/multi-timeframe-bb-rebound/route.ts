import { NextResponse } from "next/server";
import { scanMultiTimeframeBbRebound } from "@/lib/multi-timeframe-bb-rebound";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const p = new URL(request.url).searchParams;
  const market = p.get("market")?.toUpperCase() === "KR" ? "KR" : "US";
  const rawLimit = Number(p.get("limit") ?? 30);
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.trunc(rawLimit))) : 30;
  try { return NextResponse.json(await scanMultiTimeframeBbRebound(market, limit)); }
  catch (error) {
    console.error("[API /scan/multi-timeframe-bb-rebound] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "MULTI_TIMEFRAME_BB_REBOUND_UNAVAILABLE" }, { status: 503 });
  }
}
