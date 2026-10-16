import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ admin: true, query: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn(async () => state.admin) }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: state.query }) }));

import { GET } from "./route";

describe("debug runs API", () => {
  beforeEach(() => {
    state.admin = true;
    state.query.mockReset().mockResolvedValue({ rows: [] });
  });

  it("passes an integer limit to SQL for fractional input", async () => {
    const response = await GET(new Request("http://localhost/api/debug/runs?limit=2.8"));
    expect(response.status).toBe(200);
    expect(state.query.mock.calls[0][1]).toEqual([2]);
  });

  it("clamps out-of-range limit input", async () => {
    await GET(new Request("http://localhost/api/debug/runs?limit=999"));
    expect(state.query.mock.calls[0][1]).toEqual([100]);
  });
});
