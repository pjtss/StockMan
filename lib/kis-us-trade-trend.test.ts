import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/kis", () => ({ getAccessToken: vi.fn(async () => "test-token"), refreshAccessToken: vi.fn(async () => "renewed-token") }));
vi.mock("@/lib/kis-api-config", () => ({ loadKisApiConfig: vi.fn(async () => ({ content_type: "application/json", custtype: "P" })) }));
vi.mock("@/lib/kis-authorization", () => ({ buildKisAuthorization: (token: string) => `Bearer ${token}`, isKisTokenExpiredResponse: () => false }));
vi.mock("@/lib/kis-request-throttle", () => ({ withKisRequestThrottle: (request: () => Promise<unknown>) => request() }));

import { fetchKisUsTradeTrend, parseKisUsAskingRows } from "./kis-us-trade-trend";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("KIS US asking-price response", () => {
  it("normalizes object and array output blocks", () => {
    expect(parseKisUsAskingRows({ output1: { symb: "AAPL" }, output2: [{ pbid1: "100" }], output3: null })).toEqual([{ symb: "AAPL" }, { pbid1: "100" }]);
  });

  it("returns an empty list for missing output blocks", () => {
    expect(parseKisUsAskingRows(null)).toEqual([]);
  });

  it("marks a trade response successful only when KIS returns rt_cd 0", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ rt_cd: "0", output2: [{ khms: "093000", last: "10.25", evol: "4" }] }));
    await expect(fetchKisUsTradeTrend({ code: "aapl", market: "NAS" })).resolves.toMatchObject({ ok: true, trades: [{ time: "093000", price: 10.25, volume: 4 }] });
  });

  it("does not treat trade rows as success when rt_cd is missing", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ output2: [{ khms: "093000", last: "10.25", evol: "4" }] }));
    await expect(fetchKisUsTradeTrend({ code: "aapl", market: "NAS" })).resolves.toMatchObject({ ok: false, trades: [{ time: "093000", price: 10.25, volume: 4 }], diagnostics: { rt_cd: null } });
  });
});
