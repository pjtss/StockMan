import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { persistAndScanUsVwap } from "@/lib/us-vwap";
export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await persistAndScanUsVwap()); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
