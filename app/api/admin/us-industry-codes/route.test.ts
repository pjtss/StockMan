import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: false,
  query: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn(async () => mocks.admin) }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("@/lib/us-industry-code-sync", async () => {
  const actual = await vi.importActual<typeof import("@/lib/us-industry-code-sync")>("@/lib/us-industry-code-sync");
  return { ...actual, syncKisUsIndustryCodes: mocks.sync };
});

import { GET, POST } from "./route";

describe("admin KIS U.S. industry code API", () => {
  beforeEach(() => {
    mocks.admin = false;
    mocks.query.mockReset();
    mocks.sync.mockReset();
  });

  it("requires admin session for diagnostic reads and writes", async () => {
    expect((await GET()).status).toBe(401);
    expect((await POST(new Request("http://localhost/api/admin/us-industry-codes", { method: "POST" }))).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("returns bounded per-market DB coverage", async () => {
    mocks.admin = true;
    mocks.query.mockResolvedValueOnce({ rows: [{ market: "NAS", active_common_count: 2, classified_count: 1, unclassified_count: 1 }] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, source: "KIS_US_MASTER_ICOD", markets: [{ market: "NAS", classified_count: 1 }] });
  });

  it("rejects non-multipart sync requests before database writes", async () => {
    mocks.admin = true;
    const response = await POST(new Request("http://localhost/api/admin/us-industry-codes", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "KIS_MASTER_MULTIPART_REQUIRED", requiredFiles: ["NASMST.COD", "NYSMST.COD", "AMSMST.COD"] });
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("passes all three uploaded KIS market masters to the transactional synchronizer", async () => {
    mocks.admin = true;
    mocks.sync.mockResolvedValueOnce({ ok: true, source: "KIS_US_MASTER_ICOD", persistedCounts: { NAS: 1, NYS: 1, AMS: 1 } });
    const entries = ["NASMST.COD", "NYSMST.COD", "AMSMST.COD"].map((name) => [name, { name, size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }]);
    const request = {
      headers: new Headers({ "content-type": "multipart/form-data; boundary=unit-test" }),
      formData: async () => ({ entries: () => entries[Symbol.iterator]() }),
    } as unknown as Request;
    const response = await POST(request);
    const payload = await response.json();
    expect(payload).toMatchObject({ ok: true, source: "KIS_US_MASTER_ICOD" });
    expect(response.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith({ NAS: expect.any(Buffer), NYS: expect.any(Buffer), AMS: expect.any(Buffer) });
  });
});
