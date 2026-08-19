import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { scanDailyMa9 } from "@/lib/daily-ma9";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ mode: "ADMIN_MANUAL_TEST", ...(await scanDailyMa9("KR")) }); }
  catch (error) { return NextResponse.json({ ok: false, mode: "ADMIN_MANUAL_TEST", market: "KR", error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
