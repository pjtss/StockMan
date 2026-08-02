import { NextResponse } from "next/server";
import { scanStoredUsDmi } from "@/lib/us-dmi-scan";
export const runtime = "nodejs";
export async function GET() { return NextResponse.json({ ok: true, ...(await scanStoredUsDmi()) }); }
