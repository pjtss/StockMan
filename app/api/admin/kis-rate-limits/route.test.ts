import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ admin: true, query: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn(async () => state.admin) }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: state.query }) }));

import { GET } from "./route";

describe("KIS rate-limit diagnostics API", () => {
  beforeEach(() => {
    state.admin = true;
    state.query.mockReset().mockResolvedValue({ rows: [{}] });
  });

  it("truncates fractional days and limit to integer SQL parameters", async () => {
    const response = await GET(new Request("http://localhost/api/admin/kis-rate-limits?days=3.5&limit=1.9"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.days).toBe(3);
    expect(state.query.mock.calls.map((call) => call[1])).toEqual([[3], [3], [3], [1]]);
  });

  it("clamps out-of-range days and limit", async () => {
    const response = await GET(new Request("http://localhost/api/admin/kis-rate-limits?days=999&limit=999"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.days).toBe(31);
    expect(state.query.mock.calls.map((call) => call[1])).toEqual([[31], [31], [31], [200]]);
  });
});
