import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { scanUsDailyTrend } from "@/lib/us-daily-trend-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const p = new URL(request.url).searchParams;
  try {
    return NextResponse.json({ mode: "ADMIN_MANUAL_TEST", ...(await scanUsDailyTrend({ policy: { obvSignalPeriod: p.has("obvSignalPeriod") ? Number(p.get("obvSignalPeriod")) : undefined, adlSignalPeriod: p.has("adlSignalPeriod") ? Number(p.get("adlSignalPeriod")) : undefined } })) });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
