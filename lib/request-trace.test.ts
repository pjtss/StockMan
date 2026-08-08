import { describe, expect, it } from "vitest";
import { resolveRequestId, responseTimeMs, withRequestTrace } from "@/lib/request-trace";
import { NextResponse } from "next/server";

describe("request trace", () => {
  it("preserves a safe caller correlation id", () => {
    const request = new Request("http://localhost/api/debug", { headers: { "x-request-id": "codex-debug-123" } });
    expect(resolveRequestId(request)).toBe("codex-debug-123");
  });

  it("generates a safe id when the header is missing or unsafe", () => {
    const missing = resolveRequestId(new Request("http://localhost/api/debug"));
    const unsafe = resolveRequestId(new Request("http://localhost/api/debug", { headers: { "x-request-id": "bad id" } }));
    expect(missing).toMatch(/^[0-9a-f-]{36}$/);
    expect(unsafe).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("adds correlation and server timing headers", () => {
    const response = withRequestTrace(NextResponse.json({ ok: true }), "codex-debug-123", Date.now() - 5);
    expect(response.headers.get("x-request-id")).toBe("codex-debug-123");
    expect(response.headers.get("server-timing")).toMatch(/^app;dur=\d+$/);
    expect(responseTimeMs(Date.now() - 1)).toBeGreaterThanOrEqual(0);
  });
});
