import { NextResponse } from "next/server";
import { recommendMultiTimeframe } from "@/lib/multi-timeframe-recommendations";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const market = params.get("market")?.toUpperCase() === "KR" ? "KR" : "US";
  const rawLimit = Number(params.get("limit") ?? 30);
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.trunc(rawLimit))) : 30;
  try {
    return NextResponse.json(await recommendMultiTimeframe(market, "scalp", limit));
  } catch (error) {
    return NextResponse.json({ ok: false, error: "DAYTRADE_SCAN_UNAVAILABLE", detail: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
