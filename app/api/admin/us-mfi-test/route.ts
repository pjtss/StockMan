import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const rawPeriod = Number(params.get("period"));
  const rawThreshold = Number(params.get("threshold"));
  const period = Number.isFinite(rawPeriod) ? Math.min(200, Math.max(2, Math.trunc(rawPeriod))) : undefined;
  const threshold = Number.isFinite(rawThreshold) ? Math.min(100, Math.max(0, rawThreshold)) : undefined;
  try {
    return NextResponse.json({ ok: true, ...(await scanStoredUsMfiOversold({
      period,
      threshold,
    })) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
