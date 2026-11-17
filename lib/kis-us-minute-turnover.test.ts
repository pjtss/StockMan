import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/kis", () => ({ getAccessToken: vi.fn(async () => "test-token"), refreshAccessToken: vi.fn(async () => "renewed-token") }));
vi.mock("@/lib/kis-api-config", () => ({ loadKisApiConfig: vi.fn(async () => ({ content_type: "application/json", tr_id: "HHDFS76950200", custtype: "P" })) }));
vi.mock("@/lib/kis-authorization", () => ({ buildKisAuthorization: (token: string) => `Bearer ${token}`, isKisTokenExpiredResponse: () => false }));
vi.mock("@/lib/kis-request-throttle", () => ({ withKisRequestThrottle: (request: () => Promise<unknown>) => request() }));

import { buildUsMinuteTurnoverUrl, fetchUsMinuteTurnover, parseUsMinuteTurnoverPoints } from "./kis-us-minute-turnover";

beforeEach(() => {
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

describe("KIS US minute turnover parsing", () => {
  it("uses the official overseas minute-candle query fields and requested exchange", () => {
    const url = new URL(buildUsMinuteTurnoverUrl("BIYA", "NAS", { AUTH: "", KEYB: "", FID_PW_DATA_INCU_YN: "N" } as any));
    expect(url.pathname).toBe("/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice");
    expect(Object.fromEntries(url.searchParams)).toEqual({ AUTH: "", KEYB: "", EXCD: "NAS", SYMB: "BIYA", PINC: "N", NEXT: "", NREC: "120", FILL: "0", NMIN: "1" });
  });

  it("converts paired KIS Korea and exchange wall clocks to a real epoch", () => {
    const [point] = parseUsMinuteTurnoverPoints({ output: [{ kymd: "20261007", khms: "172100", xymd: "20261007", xhms: "042100", last: "2.03", evol: "10" }] });
    expect(point.time).toBe("20261007T172100");
    expect(point.observedAt).toBe(Date.parse("2026-10-07T08:21:00.000Z"));
  });

  it("converts an exchange-only US wall clock with the correct daylight-saving offset", () => {
    const [point] = parseUsMinuteTurnoverPoints({ output: [{ xymd: "20261007", xhms: "042100", last: "2.03", evol: "10" }] });
    expect(point.observedAt).toBe(Date.parse("2026-10-07T08:21:00.000Z"));
  });

  it("does not invent a source timestamp when KIS provides no parseable clock", () => {
    const [point] = parseUsMinuteTurnoverPoints({ output: [{ last: "2.03", evol: "10" }] });
    expect(point.observedAt).toBeNull();
  });

  it("does not treat cumulative volume as minute volume", () => {
    const [point] = parseUsMinuteTurnoverPoints({ output: [{ kymd: "20260913", khms: "101000", last: "10", tvol: "100000", tamnt: "1000000" }] });
    expect(point.volume).toBeUndefined();
  });

  it("keeps incremental evol for MVP turnover", () => {
    const [point] = parseUsMinuteTurnoverPoints({ output: [{ kymd: "20260913", khms: "101000", last: "10", evol: "25", tvol: "100000" }] });
    expect(point.volume).toBe(25);
  });

  it("fails closed and discards points when HTTP 200 contains a KIS business error", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ rt_cd: "1", msg1: "business error", output: [{ kymd: "20261112", khms: "100000", last: "12.34", evol: "10" }] }));
    await expect(fetchUsMinuteTurnover({ code: "AAA", market: "NAS" })).resolves.toMatchObject({ ok: false, status: 200, points: [] });
  });

  it("fails closed when HTTP 200 has minute rows but no KIS success code", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ output: [{ kymd: "20261112", khms: "100000", last: "12.34", evol: "10" }] }));
    await expect(fetchUsMinuteTurnover({ code: "AAA", market: "NAS" })).resolves.toMatchObject({ ok: false, points: [] });
  });

  it("does not append an error continuation page to successful minute data", async () => {
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse({ rt_cd: "0", output1: { next: "cursor-1", more: "1" }, output: [{ kymd: "20261112", khms: "100000", last: "12.34", evol: "10" }] }))
      .mockResolvedValueOnce(jsonResponse({ rt_cd: "1", output: [{ kymd: "20261112", khms: "100100", last: "99.99", evol: "999" }] }));

    await expect(fetchUsMinuteTurnover({ code: "AAA", market: "NAS" })).resolves.toMatchObject({ ok: true, pageCount: 1, complete: false, points: [{ price: 12.34, volume: 10 }] });
  });
});
