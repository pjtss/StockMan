import { NextResponse } from "next/server";
import { writeKisRealtimeEvent } from "@/lib/kis-realtime-event";
import { consumeKisRealtimeEventLimit } from "@/lib/kis-realtime-event-rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const clientIp = request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || "unknown";
  const limit = consumeKisRealtimeEventLimit(clientIp);
  if (!limit.allowed) return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds), "cache-control": "no-store" } });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 24_576) return NextResponse.json({ ok: false, error: "BODY_TOO_LARGE" }, { status: 413 });
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    reader = request.body?.getReader() ?? null;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > 24_576) {
          await reader.cancel();
          return NextResponse.json({ ok: false, error: "BODY_TOO_LARGE" }, { status: 413 });
        }
        chunks.push(value);
      }
    }
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  } finally {
    try { reader?.releaseLock(); } catch { /* reader may already be released */ }
  }
  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { bodyBytes.set(chunk, offset); offset += chunk.byteLength; }
  let rawBody: string;
  try { rawBody = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes); }
  catch { return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 }); }
  let body: { market?: string; code?: string; channel?: string; trId?: string; payload?: unknown; rawPayload?: string } | null;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 }); }
  const market = body?.market?.toUpperCase();
  const channel = body?.channel === "asking" ? "asking" : body?.channel === "trade" ? "trade" : null;
  const code = body?.code?.replace(/^US:/i, "").trim().toUpperCase() ?? "";
  const trId = body?.trId?.trim() ?? "";
  const expectedTrId = market === "KR"
    ? channel === "trade" ? "H0STCNT0" : "H0STASP0"
    : channel === "trade" ? "HDFSCNT0" : "HDFSASP0";
  const payload = body?.payload;
  const isPayloadObject = payload !== null && typeof payload === "object" && !Array.isArray(payload);
  const payloadRecord = isPayloadObject ? payload as Record<string, unknown> : null;
  if ((market !== "KR" && market !== "US") || !channel || !code || trId !== expectedTrId
    || (market === "KR" ? !/^\d{6}$/.test(code) : !/^[A-Z0-9._-]{1,32}$/.test(code))
    || !payloadRecord || payloadRecord.tr_id !== trId || typeof payloadRecord.values !== "string" || payloadRecord.values.length > 2_048
    || (body?.rawPayload !== undefined && (typeof body.rawPayload !== "string" || body.rawPayload.length > 16_384))) {
    return NextResponse.json({ ok: false, error: "INVALID_REALTIME_EVENT" }, { status: 400 });
  }
  try {
    await writeKisRealtimeEvent({ market, code, channel, trId, payload, rawPayload: body?.rawPayload });
  } catch {
    return NextResponse.json({ ok: false, error: "REALTIME_EVENT_STORAGE_UNAVAILABLE" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
