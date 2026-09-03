import { NextResponse } from "next/server";
import { scanStoredUsDmi } from "@/lib/us-dmi-scan";
export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json({ ok: true, ...(await scanStoredUsDmi()) }); }
  catch { return NextResponse.json({ ok: false, error: "US_DMI_UNAVAILABLE" }, { status: 503 }); }
}
