import { NextResponse } from "next/server";
import { scanStoredUsMacd } from "@/lib/us-macd-scan";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json({ ok: true, ...(await scanStoredUsMacd()) }); }
  catch { return NextResponse.json({ ok: false, error: "US_MACD_UNAVAILABLE" }, { status: 503 }); }
}
