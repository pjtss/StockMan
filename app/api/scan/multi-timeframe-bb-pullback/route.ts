import { NextResponse } from "next/server";
import { scanMultiTimeframeBbPullback } from "@/lib/multi-timeframe-bb-pullback";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim(); const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const market = new URL(request.url).searchParams.get("market")?.toUpperCase() === "KR" ? "KR" : "US";
  try { return NextResponse.json(await scanMultiTimeframeBbPullback(market)); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
