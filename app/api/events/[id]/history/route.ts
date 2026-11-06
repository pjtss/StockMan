import { NextResponse } from "next/server";
import { getStockmanEventHistory } from "@/lib/stockman-events";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) || Number(rawId) < 1) return NextResponse.json({ ok: false, error: "INVALID_EVENT_ID" }, { status: 400 });
  try {
    const result = await getStockmanEventHistory(Number(rawId));
    if (!result.rowCount) return NextResponse.json({ ok: false, error: "EVENT_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, eventId: rawId, history: result.rows }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "EVENT_HISTORY_UNAVAILABLE" }, { status: 503 });
  }
}
