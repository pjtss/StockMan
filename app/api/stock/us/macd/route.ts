import { NextResponse } from "next/server";
import { scanStoredUsMacd } from "@/lib/us-macd-scan";
import { isUsDailyScanComplete } from "@/lib/us-daily-scan-failure-reasons";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { const result = await scanStoredUsMacd(); return NextResponse.json({ ...result, ok: isUsDailyScanComplete(result) }); }
  catch { return NextResponse.json({ ok: false, error: "US_MACD_UNAVAILABLE" }, { status: 503 }); }
}
