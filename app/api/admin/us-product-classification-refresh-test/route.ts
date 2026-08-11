import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { refreshUsProductClassifications } from "@/lib/us-product-classification-automation";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ mode: "ADMIN_MANUAL_REFRESH", ...(await refreshUsProductClassifications({ concurrency: 4 })) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
