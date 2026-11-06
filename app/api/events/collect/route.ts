import { NextResponse } from "next/server";
import { consumeSecStockRiskLimit } from "@/lib/sec-stock-risk-public-rate-limit";
import { materializeStockmanRssEvents, materializeStockmanSecEvents } from "@/lib/stockman-events";

export const dynamic = "force-dynamic";

/** Public idempotent materialization of a source record already stored by Stockman. */
export async function POST(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rate = consumeSecStockRiskLimit("write", forwarded);
  if (!rate.allowed) return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) return NextResponse.json({ ok: false, error: "BODY_TOO_LARGE" }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (input.source === "SEC_EDGAR" && typeof input.accession === "string") {
    if (Object.keys(input).some((key) => !["source", "accession"].includes(key)) || !/^\d{10}-\d{2}-\d{6}$/.test(input.accession)) {
      return NextResponse.json({ ok: false, error: "INVALID_SOURCE_ID" }, { status: 400 });
    }
    try {
      const result = await materializeStockmanSecEvents(1, input.accession);
      return NextResponse.json({ ok: result.failed === 0 && result.unverified === 0, source: "SEC_EDGAR", result }, { status: result.failed ? 503 : result.unverified ? 422 : 200, headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ ok: false, error: "EVENT_STORAGE_UNAVAILABLE" }, { status: 503 });
    }
  }
  if (input.source === "RSS" && Object.keys(input).includes("provider")) {
    if (Object.keys(input).some((key) => !["source", "provider", "externalId"].includes(key)) || !["STOCKTITAN", "GLOBENEWSWIRE"].includes(String(input.provider)) || typeof input.externalId !== "string" || input.externalId.length < 1 || input.externalId.length > 512) {
      return NextResponse.json({ ok: false, error: "INVALID_SOURCE_ID" }, { status: 400 });
    }
    try {
      const result = await materializeStockmanRssEvents(1, String(input.provider), input.externalId);
      return NextResponse.json({ ok: result.failed === 0, source: "RSS", result }, { status: result.failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ ok: false, error: "EVENT_STORAGE_UNAVAILABLE" }, { status: 503 });
    }
  }
  return NextResponse.json({ ok: false, error: "UNSUPPORTED_SOURCE" }, { status: 400 });
}
