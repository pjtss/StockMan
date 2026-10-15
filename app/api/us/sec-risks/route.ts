import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { safeErrorMetadata } from "@/lib/error-diagnostics";
import { listSecStockRisks, patchSecStockRisks } from "@/lib/sec-stock-risk-repository";
import { consumeSecStockRiskLimit } from "@/lib/sec-stock-risk-public-rate-limit";

export const dynamic = "force-dynamic";

function parseTickers(params: URLSearchParams) {
  return [...new Set([
    ...(params.get("ticker") ? [params.get("ticker")!] : []),
    ...(params.get("tickers") || "").split(","),
  ].map((value) => value.trim().toUpperCase()).filter(Boolean))];
}

function clientIp(request: Request) {
  return request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
}

function rateLimited(retryAfterSeconds: number) {
  return NextResponse.json({ ok: false, error: "RATE_LIMITED", retryAfterSeconds }, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" },
  });
}

function validationCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (["INVALID_BATCH", "INVALID_INSTRUMENT", "RISK_MUST_BE_OBJECT", "INVALID_RISK_DOCUMENT", "INVALID_RISK_ENUM", "RISK_EVIDENCE_REQUIRED", "DUPLICATE_RISK_ID", "COMPANY_NAME_REQUIRED", "FIELD_TOO_LONG"].includes(message)) return message;
  return /^RISK_[A-Z0-9_]+_REQUIRED$/.test(message) ? message : null;
}

export async function GET(request: Request) {
  const limit = consumeSecStockRiskLimit("read", clientIp(request));
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
  try {
    const params = new URL(request.url).searchParams;
    const market = params.get("market")?.toUpperCase() || "NAS";
    const tickers = parseTickers(params);
    if (!tickers.length || tickers.length > 100) return NextResponse.json({ ok: false, error: "INVALID_TICKERS" }, { status: 400 });
    const items = await listSecStockRisks(market, tickers);
    const found = new Set(items.map((item) => item.ticker));
    return NextResponse.json({ ok: true, items, missing: tickers.filter((ticker) => !found.has(ticker)), metadata: { requestedCount: tickers.length, returnedCount: items.length } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeErrorMetadata(error).errorCode }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const limit = consumeSecStockRiskLimit("write", clientIp(request));
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
  try {
    const params = new URL(request.url).searchParams;
    const body = await request.json();
    const items = Array.isArray(body?.items)
      ? body.items
      : [{ ...(body || {}), market: body?.market ?? params.get("market") ?? "NAS", ticker: body?.ticker ?? params.get("ticker") }];
    const updated = await patchSecStockRisks(items);
    return NextResponse.json({ ok: true, updated, count: updated.length });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
    const invalid = validationCode(error);
    if (invalid) return NextResponse.json({ ok: false, error: invalid }, { status: 400 });
    return NextResponse.json({ ok: false, error: safeErrorMetadata(error).errorCode }, { status: 503 });
  }
}
