import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { syncUsDailyBreakoutWatchlistFromTurnoverSnapshots, listUsDailyBreakoutWatchlist } from "@/lib/us-daily-breakout-watchlist";
export async function POST() { if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); try { const sync = await syncUsDailyBreakoutWatchlistFromTurnoverSnapshots(); return NextResponse.json({ ok: true, sync, items: await listUsDailyBreakoutWatchlist() }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); } }
