import { describe, expect, it, vi } from "vitest";

const snapshot = vi.hoisted(() => ({ value: { status: "ok", checkedAt: "2026-09-03T00:00:00.000Z", responseTimeMs: 4, database: { error: "secret" } } as any }));
vi.mock("@/lib/health-check", () => ({ getHealthSnapshot: vi.fn(async () => snapshot.value) }));
vi.mock("@/lib/request-trace", () => ({ resolveRequestId: vi.fn(() => "req_test"), withRequestTrace: vi.fn((response) => response) }));
import { GET } from "./route";

describe("public health API", () => {
  it("does not expose internal health details", async () => {
    const response = await GET(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", checkedAt: "2026-09-03T00:00:00.000Z", responseTimeMs: 4, requestId: "req_test" });
  });

  it("returns degraded when health calculation fails", async () => {
    const health = await import("@/lib/health-check");
    vi.mocked(health.getHealthSnapshot).mockRejectedValueOnce(new Error("database secret"));
    const response = await GET(new Request("http://localhost/api/health"));
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe("degraded");
  });
});
