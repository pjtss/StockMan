import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { refreshUsDailyOpenCache } from "@/lib/us-daily-open-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, mode: "ADMIN_MANUAL_REFRESH", ...(await refreshUsDailyOpenCache()) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
