import { NextResponse } from "next/server";
import { scanStoredUsMacd } from "@/lib/us-macd-scan";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ ok: true, ...(await scanStoredUsMacd()) }); }
