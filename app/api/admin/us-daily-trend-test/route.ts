import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { scanUsDailyTrend } from "@/lib/us-daily-trend-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const p = new URL(request.url).searchParams;
  try {
    return NextResponse.json({ mode: "ADMIN_MANUAL_TEST", ...(await scanUsDailyTrend({ policy: { minScore: p.has("minScore") ? Number(p.get("minScore")) : undefined, minRvol: p.has("minRvol") ? Number(p.get("minRvol")) : undefined, minMfi: p.has("minMfi") ? Number(p.get("minMfi")) : undefined, maxMfi: p.has("maxMfi") ? Number(p.get("maxMfi")) : undefined } })) });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
