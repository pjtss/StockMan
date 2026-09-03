import { NextResponse } from "next/server";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawPeriod = Number(params.get("period"));
  const rawThreshold = Number(params.get("threshold"));
  const period = Number.isFinite(rawPeriod) ? Math.min(200, Math.max(2, Math.trunc(rawPeriod))) : undefined;
  const threshold = Number.isFinite(rawThreshold) ? Math.min(100, Math.max(0, rawThreshold)) : undefined;
  try { const result = await scanStoredUsMfiOversold({ period, threshold }); return NextResponse.json({ ok: true, ...result }); }
  catch { return NextResponse.json({ ok: false, error: "US_MFI_UNAVAILABLE" }, { status: 503 }); }
}
