import { NextResponse } from "next/server";
import { getStockmanEvent } from "@/lib/stockman-events";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) || Number(rawId) < 1) return NextResponse.json({ ok: false, error: "INVALID_EVENT_ID" }, { status: 400 });
  try {
    const event = await getStockmanEvent(Number(rawId));
    return event ? NextResponse.json({ ok: true, event }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ ok: false, error: "EVENT_NOT_FOUND" }, { status: 404 });
  } catch {
    return NextResponse.json({ ok: false, error: "EVENT_UNAVAILABLE" }, { status: 503 });
  }
}
