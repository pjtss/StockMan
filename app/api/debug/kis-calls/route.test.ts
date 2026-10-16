import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  admin: true,
  query: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn(async () => state.admin) }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: state.query }) }));

import { GET } from "./route";

describe("KIS call diagnostics API", () => {
  beforeEach(() => {
    state.admin = true;
    state.query.mockReset().mockResolvedValue({ rows: [{ calls: 2, success: 2, failures: 0, avg_duration_ms: 5, max_duration_ms: 8 }] });
  });

  it("requires an administrator session before querying", async () => {
    state.admin = false;

    const response = await GET(new Request("http://localhost/api/debug/kis-calls"));

    expect(response.status).toBe(401);
    expect(state.query).not.toHaveBeenCalled();
  });

  it("truncates fractional days and limit to safe integer SQL parameters", async () => {
    const response = await GET(new Request("http://localhost/api/debug/kis-calls?days=3.5&limit=1.9"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.days).toBe(3);
    expect(state.query).toHaveBeenCalledTimes(5);
    expect(state.query.mock.calls.slice(0, 4).map((call) => call[1])).toEqual([[3], [3], [3], [3]]);
    expect(state.query.mock.calls[4][1]).toEqual([1]);
  });

  it("keeps bounds for out-of-range and invalid numeric parameters", async () => {
    const response = await GET(new Request("http://localhost/api/debug/kis-calls?days=999&limit=-2"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.days).toBe(31);
    expect(state.query.mock.calls.slice(0, 4).map((call) => call[1])).toEqual([[31], [31], [31], [31]]);
    expect(state.query.mock.calls[4][1]).toEqual([1]);
  });

  it("uses defaults when query parameters are not numeric", async () => {
    const response = await GET(new Request("http://localhost/api/debug/kis-calls?days=not-a-number&limit=bad"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.days).toBe(7);
    expect(state.query.mock.calls.slice(0, 4).map((call) => call[1])).toEqual([[7], [7], [7], [7]]);
    expect(state.query.mock.calls[4][1]).toEqual([50]);
  });
});
