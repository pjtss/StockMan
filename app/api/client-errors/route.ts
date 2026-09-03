import { NextResponse } from "next/server";
import { reportProductionError } from "@/lib/production-error-reporter";

const MAX_MESSAGE_LENGTH = 8000;
const MAX_PATH_LENGTH = 512;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_REPORTS_PER_MINUTE = 30;
const reportBuckets = new Map<string, { startedAt: number; count: number }>();

function requestAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function allowReport(key: string, now = Date.now()) {
  const current = reportBuckets.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    reportBuckets.set(key, { startedAt: now, count: 1 });
    if (reportBuckets.size > 2_000) {
      for (const [bucketKey, bucket] of reportBuckets) {
        if (now - bucket.startedAt >= 60_000) reportBuckets.delete(bucketKey);
      }
    }
    return true;
  }
  if (current.count >= MAX_REPORTS_PER_MINUTE) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  if (!allowReport(requestAddress(request))) {
    return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ ok: false, error: "INVALID_CONTENT_TYPE" }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  const body = await request.json().catch(() => null) as { message?: unknown; path?: unknown } | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "INVALID_PAYLOAD" }, { status: 400 });
  }
  const message = typeof body?.message === "string" && body.message.trim()
    ? body.message.slice(0, MAX_MESSAGE_LENGTH)
    : "Unknown client error";
  const path = typeof body?.path === "string" && body.path.trim()
    ? body.path.slice(0, MAX_PATH_LENGTH)
    : "client";

  try {
    await reportProductionError({
      error: new Error(message),
      path,
      requestId: request.headers.get("x-request-id") ?? undefined,
      source: "browser",
    });
  } catch {
    // 오류 보고 실패가 브라우저의 원래 오류 처리까지 악화시키면 안 된다.
  }
  return NextResponse.json({ ok: true });
}
