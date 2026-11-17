import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchKisUsTopRisingApi: vi.fn() }));
vi.mock("@/lib/kis-us-api", () => ({ fetchKisUsTopRisingApi: mocks.fetchKisUsTopRisingApi }));

import { GET } from "./route";

beforeEach(() => mocks.fetchKisUsTopRisingApi.mockReset());

function result(ok: boolean, status: number, parsed: unknown = { rt_cd: ok ? "0" : "1", output2: [] }) {
  return { ok, status, response: { parsed } };
}

describe("GET /api/stock/us/top-rising upstream status", () => {
  it("returns 502 when HTTP succeeds but KIS reports an application error", async () => {
    mocks.fetchKisUsTopRisingApi.mockResolvedValue(result(false, 200, { rt_cd: "1", msg1: "provider error" }));
    const response = await GET(new Request("http://localhost/api/stock/us/top-rising"));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "KIS_UPSTREAM_ERROR", upstreamStatus: 200 });
  });

  it("returns 200 for a successful KIS response", async () => {
    mocks.fetchKisUsTopRisingApi.mockResolvedValue(result(true, 200, { rt_cd: "0", output2: [{ symb: "AAA" }] }));
    const response = await GET(new Request("http://localhost/api/stock/us/top-rising"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ symb: "AAA" }]);
  });
});
