import { NextResponse } from "next/server";
import { scanUsDailySidewaysObvAdl } from "@/lib/us-daily-sideways-obv-adl";
export async function GET() {
  try { return NextResponse.json(await scanUsDailySidewaysObvAdl()); }
  catch (error) {
    console.error("[API /scan/us-daily-sideways-obv-adl] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "US_OBV_ADL_SCAN_UNAVAILABLE" }, { status: 503 });
  }
}
