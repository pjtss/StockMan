import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { loadUsProductClassifications, setUsProductOverride } from "@/lib/us-instrument-product-admin";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await loadUsProductClassifications();
  return NextResponse.json({ rows, counts: rows.reduce<Record<string, number>>((out, row) => { const key = row.manual_product_action || row.instrument_type || "UNKNOWN"; out[key] = (out[key] || 0) + 1; return out; }, {}) });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (!body.market || !body.code || !["BLOCK", null].includes(body.action)) throw new Error("market, code, action(BLOCK|null)가 필요합니다. ETF·레버리지 예외 허용은 지원하지 않습니다.");
    return NextResponse.json({ success: true, row: await setUsProductOverride({ market: body.market, code: body.code, action: body.action }) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
