import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  listSecStockRisks: vi.fn(),
  patchSecStockRisks: vi.fn(),
  consumeSecStockRiskLimit: vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: mocks.requireAdminSession }));
vi.mock("@/lib/sec-stock-risk-repository", () => ({
  listSecStockRisks: mocks.listSecStockRisks,
  patchSecStockRisks: mocks.patchSecStockRisks,
}));
vi.mock("@/lib/sec-stock-risk-public-rate-limit", () => ({ consumeSecStockRiskLimit: mocks.consumeSecStockRiskLimit }));

import { GET, PATCH } from "./route";

describe("SEC risk API security boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an admin session before any persistent write", async () => {
    mocks.requireAdminSession.mockResolvedValueOnce(false);
    const response = await PATCH(new Request("http://localhost/api/us/sec-risks?ticker=ABCD", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyName: "Example", risk: { schemaVersion: 2, items: [] } }),
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(mocks.patchSecStockRisks).not.toHaveBeenCalled();
  });

  it("does not return raw database errors from public reads", async () => {
    mocks.listSecStockRisks.mockRejectedValueOnce(new Error("postgres://user:secret@db.internal/stockman"));
    const response = await GET(new Request("http://localhost/api/us/sec-risks?ticker=ABCD"));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error).toBe("INTEGRATION_ERROR");
    expect(JSON.stringify(body)).not.toMatch(/secret|db\.internal|postgres:\/\//);
  });

  it("returns a service error, not a client validation status, for database write failures", async () => {
    mocks.requireAdminSession.mockResolvedValueOnce(true);
    mocks.patchSecStockRisks.mockRejectedValueOnce(new Error("postgres://user:secret@db.internal/stockman"));
    const response = await PATCH(new Request("http://localhost/api/us/sec-risks?ticker=ABCD", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyName: "Example", risk: { schemaVersion: 2, items: [] } }),
    }));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error).toBe("INTEGRATION_ERROR");
    expect(JSON.stringify(body)).not.toMatch(/secret|db\.internal|postgres:\/\//);
  });
});
