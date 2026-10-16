import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeKisRealtimeApprovalLimit, resetKisRealtimeApprovalLimitsForTest } from "@/lib/kis-realtime-approval-rate-limit";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: mocks.requireAdminSession }));

describe("admin KIS realtime approval metrics API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetKisRealtimeApprovalLimitsForTest();
    mocks.requireAdminSession.mockResolvedValue(true);
  });

  it("requires an administrator session", async () => {
    mocks.requireAdminSession.mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns aggregate-only telemetry without a database dependency or client identifiers", async () => {
    consumeKisRealtimeApprovalLimit("203.0.113.private");
    const response = await GET();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.metrics).toMatchObject({
      retentionMinutes: 60,
      policy: { windowSeconds: 60, perClientLimit: 120, globalLimit: 1_800 },
      totals: { accepted: 1, rejectedClient: 0, rejectedGlobal: 0 },
    });
    expect(JSON.stringify(payload.metrics)).not.toContain("203.0.113.private");
  });
});
