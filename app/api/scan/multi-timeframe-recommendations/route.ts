import { NextResponse } from "next/server";
import { recommendMultiTimeframe } from "@/lib/multi-timeframe-recommendations";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim(); const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""); if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const params = new URL(request.url).searchParams; const market = params.get("market")?.toUpperCase() === "KR" ? "KR" : "US"; const mode = ["scalp", "swing", "all"].includes(params.get("mode") ?? "") ? params.get("mode") as "scalp" | "swing" | "all" : "all"; const limit = Number(params.get("limit") ?? 30);
  try { return NextResponse.json(await recommendMultiTimeframe(market, mode, limit)); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
