import { NextResponse } from "next/server";
import { writeKisRealtimeEvent } from "@/lib/kis-realtime-event";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { market?: string; code?: string; channel?: string; trId?: string; payload?: unknown; rawPayload?: string } | null;
  const market = body?.market?.toUpperCase();
  const channel = body?.channel === "asking" ? "asking" : body?.channel === "trade" ? "trade" : null;
  const code = body?.code?.replace(/^US:/i, "").trim().toUpperCase() ?? "";
  const trId = body?.trId?.trim() ?? "";
  if ((market !== "KR" && market !== "US") || !channel || !code || !trId || code.length > 32) return NextResponse.json({ ok: false, error: "INVALID_REALTIME_EVENT" }, { status: 400 });
  await writeKisRealtimeEvent({ market, code, channel, trId, payload: body?.payload ?? {}, rawPayload: body?.rawPayload });
  return NextResponse.json({ ok: true });
}
