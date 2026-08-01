import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { addUsDailyBreakoutWatchlist, listUsDailyBreakoutWatchlist, removeUsDailyBreakoutWatchlist } from "@/lib/us-daily-breakout-watchlist";

export async function GET() { if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); return NextResponse.json({ items: await listUsDailyBreakoutWatchlist() }); }
export async function POST(request: Request) { if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); try { await addUsDailyBreakoutWatchlist(await request.json()); return NextResponse.json({ items: await listUsDailyBreakoutWatchlist() }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); } }
export async function DELETE(request: Request) { if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const body = await request.json(); await removeUsDailyBreakoutWatchlist(String(body.market), String(body.code)); return NextResponse.json({ items: await listUsDailyBreakoutWatchlist() }); }

