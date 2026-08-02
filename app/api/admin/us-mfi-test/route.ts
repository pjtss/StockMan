import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  try {
    return NextResponse.json({ ok: true, ...(await scanStoredUsMfiOversold({
      period: params.has("period") ? Number(params.get("period")) : undefined,
      threshold: params.has("threshold") ? Number(params.get("threshold")) : undefined,
    })) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
