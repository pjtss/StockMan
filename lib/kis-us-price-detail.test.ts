import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  persisted: [] as Array<Record<string, unknown>>,
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/kis", () => ({ getAccessToken: vi.fn(async () => "test-token"), refreshAccessToken: vi.fn(async () => "test-token") }));
vi.mock("@/lib/kis-api-config", () => ({ loadKisApiConfig: vi.fn(async () => ({})) }));
vi.mock("@/lib/kis-authorization", () => ({ buildKisAuthorization: (token: string) => `Bearer ${token}`, isKisTokenExpiredResponse: () => false }));
vi.mock("@/lib/kis-request-throttle", () => ({ withKisRequestThrottle: (callback: () => unknown) => callback() }));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: () => ({ values: (row: Record<string, unknown>) => ({ onConflictDoUpdate: async () => { state.persisted.push(row); } }) }),
  }),
}));

import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "./kis-us-price-detail";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  state.persisted = [];
  vi.stubGlobal("fetch", state.fetchMock);
  state.fetchMock.mockReset();
});

describe("KIS overseas price-detail response handling", () => {
  it("skips empty output objects and selects the first populated output", () => {
    expect(getKisUsPriceDetailOutput({ output: {}, output1: { last: "12.3" } })).toEqual({ last: "12.3" });
    expect(getKisUsPriceDetailOutput({ output: { name: "Example" }, output1: { last: "12.3" } })).toEqual({ last: "12.3" });
    expect(getKisUsPriceDetailOutput({ output: { last: "0" }, output1: { last: "12.3" } })).toEqual({ last: "12.3" });
    expect(getKisUsPriceDetailOutput({ output: [], output1: null })).toEqual({});
  });

  it("does not cache a successful HTTP response with a KIS business error", async () => {
    state.fetchMock.mockResolvedValueOnce(jsonResponse({ rt_cd: "1", msg_cd: "EGW00103", output: { last: "12", tomv: "100" } }));

    const result = await fetchKisUsPriceDetail({ code: "BUSINESS-ERROR-TEST", market: "NAS" });

    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(state.persisted).toHaveLength(0);
  });

  it("does not replace cached quote data with an empty successful response", async () => {
    state.fetchMock.mockResolvedValueOnce(jsonResponse({ rt_cd: "0", output: { last: "", tomv: "" } }));

    const result = await fetchKisUsPriceDetail({ code: "EMPTY-OUTPUT-TEST", market: "NAS" });

    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(state.persisted).toHaveLength(0);
  });

  it("persists a successful response containing a positive quote field", async () => {
    state.fetchMock.mockResolvedValueOnce(jsonResponse({ rt_cd: "0", output: { last: "12.34", tomv: "5000000" } }));

    await fetchKisUsPriceDetail({ code: "VALID-OUTPUT-TEST", market: "NAS" });

    expect(state.persisted).toHaveLength(1);
    expect(state.persisted[0]).toMatchObject({ code: "VALID-OUTPUT-TEST", status: 200 });
  });
});
