import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { scanUsTurnoverWatchlist } from "@/lib/us-turnover-watchlist-scanner";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const send = new URL(request.url).searchParams.get("send") === "true";
  try { return NextResponse.json(await scanUsTurnoverWatchlist({ send })); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
