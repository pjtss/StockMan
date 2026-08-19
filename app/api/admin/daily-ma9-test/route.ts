import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { scanDailyMa9, type DailyMa9Market } from "@/lib/daily-ma9";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const value = new URL(request.url).searchParams.get("market")?.toUpperCase();
  const market: DailyMa9Market | "BOTH" = value === "KR" || value === "US" ? value : "BOTH";
  try { return NextResponse.json({ mode: "ADMIN_MANUAL_TEST", ...(await scanDailyMa9(market)) }); }
  catch (error) { return NextResponse.json({ ok: false, mode: "ADMIN_MANUAL_TEST", market, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
