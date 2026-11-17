import { NextResponse } from "next/server";
import { scanStoredUsDmi } from "@/lib/us-dmi-scan";
import { isUsDailyScanComplete } from "@/lib/us-daily-scan-failure-reasons";
export const runtime = "nodejs";
export async function GET() {
  try { const result = await scanStoredUsDmi(); return NextResponse.json({ ...result, ok: isUsDailyScanComplete(result) }); }
  catch { return NextResponse.json({ ok: false, error: "US_DMI_UNAVAILABLE" }, { status: 503 }); }
}
