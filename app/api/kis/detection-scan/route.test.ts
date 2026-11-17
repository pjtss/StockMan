import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  fetchDomesticTradeValueRanking: vi.fn(),
  fetchDomesticFluctuation: vi.fn(),
  fetchDomesticVolumePower: vi.fn(),
  fetchForeignInstitutionTotal: vi.fn(),
  fetchMarketCapRanking: vi.fn(),
  fetchMarketValueRanking: vi.fn(),
  fetchNearNewHighLow: vi.fn(),
  writeKisSignalSnapshot: vi.fn().mockResolvedValue(undefined),
  queryEligibleUniverse: vi.fn().mockResolvedValue({ rows: [{ code: "005930" }, { code: "000001" }], compatibilityFallback: false }),
}));

vi.mock("@/lib/kis-token", () => ({ getAccessToken: mocks.getAccessToken }));
vi.mock("@/lib/kis-domestic-api", () => ({
  fetchDomesticTradeValueRanking: mocks.fetchDomesticTradeValueRanking,
  fetchDomesticFluctuation: mocks.fetchDomesticFluctuation,
  fetchDomesticVolumePower: mocks.fetchDomesticVolumePower,
}));
vi.mock("@/lib/kis-investor-flow", () => ({
  fetchForeignInstitutionTotal: mocks.fetchForeignInstitutionTotal,
  fetchMarketCapRanking: mocks.fetchMarketCapRanking,
  fetchMarketValueRanking: mocks.fetchMarketValueRanking,
  fetchNearNewHighLow: mocks.fetchNearNewHighLow,
}));
vi.mock("@/lib/kis-signal-snapshot", () => ({ writeKisSignalSnapshot: mocks.writeKisSignalSnapshot }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }));
vi.mock("@/lib/instrument-eligibility", () => ({ queryEligibleUniverse: mocks.queryEligibleUniverse }));

import { GET } from "./route";

describe("KIS detection scan source handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("token");
  });

  it("routes volume-power to the volume-power endpoint", async () => {
    mocks.fetchDomesticVolumePower.mockResolvedValue([{ mksc_shrn_iscd: "005930", hts_kor_isnm: "삼성전자", stck_avls: "500000" }]);
    const response = await GET(new Request("http://localhost/api/kis/detection-scan?sources=volume-power"));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.fetchDomesticVolumePower).toHaveBeenCalledWith("token");
    expect(mocks.fetchMarketValueRanking).not.toHaveBeenCalled();
    expect(json.rows[0].code).toBe("005930");
  });

  it("omits failed source rows and marks the combined snapshot unavailable", async () => {
    mocks.fetchForeignInstitutionTotal.mockResolvedValue({ ok: false, status: 200, rows: [{ mksc_shrn_iscd: "005930", stck_avls: "500000" }] });
    const response = await GET(new Request("http://localhost/api/kis/detection-scan?sources=foreign-institution"));
    const json = await response.json();
    expect(response.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.failedSources).toEqual(["foreign-institution"]);
    expect(json.rows).toEqual([]);
    expect(mocks.writeKisSignalSnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "UNAVAILABLE", payload: expect.objectContaining({ failedSources: ["foreign-institution"], rows: [] }) }));
  });

  it("filters candidates through the official active common-stock universe", async () => {
    mocks.fetchDomesticVolumePower.mockResolvedValue([
      { mksc_shrn_iscd: "005930", hts_kor_isnm: "삼성전자", stck_avls: "500000" },
      { mksc_shrn_iscd: "000002", hts_kor_isnm: "unverified", stck_avls: "600000" },
    ]);
    const response = await GET(new Request("http://localhost/api/kis/detection-scan?sources=volume-power"));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.rows.map((row: { code: string }) => row.code)).toEqual(["005930"]);
    expect(json.filter.officialActiveCommonStockOnly).toBe(true);
  });

  it("fails closed when the official common-stock universe is unavailable", async () => {
    mocks.fetchDomesticVolumePower.mockResolvedValue([{ mksc_shrn_iscd: "005930", stck_avls: "500000" }]);
    mocks.queryEligibleUniverse.mockRejectedValueOnce(new Error("universe unavailable"));
    const response = await GET(new Request("http://localhost/api/kis/detection-scan?sources=volume-power"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "COMMON_STOCK_UNIVERSE_UNAVAILABLE", eligibility: { failClosed: true } });
  });
});
