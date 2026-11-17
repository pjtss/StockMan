import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  loadKisApiConfig: vi.fn(),
  withKisRequestThrottle: vi.fn((request: () => Promise<unknown>) => request()),
}));

vi.mock("@/lib/kis", () => ({ getAccessToken: mocks.getAccessToken, refreshAccessToken: mocks.refreshAccessToken }));
vi.mock("@/lib/kis-api-config", () => ({ loadKisApiConfig: mocks.loadKisApiConfig }));
vi.mock("@/lib/kis-request-throttle", () => ({ withKisRequestThrottle: mocks.withKisRequestThrottle }));

import { fetchAmsScoutCandidates } from "@/lib/kis-ams-scout";

function providerResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

describe("fetchAmsScoutCandidates KIS response validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("token");
    mocks.loadKisApiConfig.mockImplementation(async () => ({ content_type: "application/json", tr_id: "HHDFS76200200", custtype: "P" }));
    vi.stubEnv("US_AMS_SCOUT_TOP_N", "10");
  });

  it("rejects HTTP 200 ranking business errors and does not use their rows", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(providerResponse({ rt_cd: "1", output2: [{ symb: "BAD" }] }));

    const result = await fetchAmsScoutCandidates();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(502);
    expect(result.candidates).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it.each([
    ["detail", { rt_cd: "1", output: { last: "99" } }, { rt_cd: "0", output2: [{ open: "10", high: "10", low: "10", last: "10", evol: "100" }] }],
    ["minute chart", { rt_cd: "0", output: { last: "10", pamt: "100", pvol: "10" } }, { rt_cd: "1", output2: [{ open: "10", high: "10", low: "10", last: "10", evol: "100000" }] }],
  ])("excludes a candidate when the %s response is a business error", async (_label, detail, chart) => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(providerResponse({ rt_cd: "0", output2: [{ symb: "AAA", tamt: "1000000", rate: "2", rank: "1" }] }))
      .mockResolvedValueOnce(providerResponse(detail))
      .mockResolvedValueOnce(providerResponse(chart));

    const result = await fetchAmsScoutCandidates();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(502);
    expect(result.failedSymbols).toEqual(["AAA"]);
    expect(result.candidates).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockRestore();
  });
});
