import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function normalizeRequestId(value: string | null | undefined): string | null {
  const supplied = value?.trim() || "";
  return REQUEST_ID_PATTERN.test(supplied) ? supplied : null;
}

/**
 * Resolve a safe correlation id for an inbound request.
 *
 * A caller-supplied id is preserved only when it is short and header-safe.
 * This lets an operator correlate a cron/API request without allowing
 * arbitrary values to become log/header injection vectors.
 */
export function resolveRequestId(request: Request): string {
  return normalizeRequestId(request.headers.get("x-request-id")) || randomUUID();
}

export function responseTimeMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

export function withRequestTrace<T extends NextResponse>(response: T, requestId: string, startedAt?: number): T {
  response.headers.set("x-request-id", requestId);
  if (startedAt !== undefined) response.headers.set("server-timing", `app;dur=${responseTimeMs(startedAt)}`);
  return response;
}
