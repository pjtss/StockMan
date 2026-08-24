import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { scanMultiTimeframeBbRebound } from "@/lib/multi-timeframe-bb-rebound";
import { recommendMultiTimeframe } from "@/lib/multi-timeframe-recommendations";
import { scanMultiTimeframeBbPullback } from "@/lib/multi-timeframe-bb-pullback";
export async function POST(request: Request) { if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 }); const body = await request.json().catch(() => ({})); const market = body.market === "KR" ? "KR" : "US"; const limit = Math.max(1, Math.min(100, Number(body.limit) || 30)); try { const result = body.view === "recommendations" ? await recommendMultiTimeframe(market, "all", limit) : body.view === "pullback" ? await scanMultiTimeframeBbPullback(market, "pullback") : body.view === "all-middle-above" ? await scanMultiTimeframeBbPullback(market, "all-middle-above") : await scanMultiTimeframeBbRebound(market, limit); return NextResponse.json(result); } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); } }
