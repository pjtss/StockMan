import { describe, expect, it, vi } from "vitest";

const { getAccessToken, writeKisSignalSnapshot, fetchMarketCapRanking, fetchTopInterestStock } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  writeKisSignalSnapshot: vi.fn().mockResolvedValue(undefined),
  fetchMarketCapRanking: vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  rtCd: "0",
  msgCd: "MCA00000",
  msg1: "정상처리",
  rows: [{ data_rank: "1", mksc_shrn_iscd: "005930", hts_kor_isnm: "삼성전자", stck_prpr: "70000", stck_avls: "500000" }, { data_rank: "2", mksc_shrn_iscd: "000001", hts_kor_isnm: "소형주", stck_avls: "299" }],
  }),
  fetchTopInterestStock: vi.fn().mockResolvedValue({ ok: true, status: 200, rtCd: "0", msgCd: "0", msg1: "정상", rows: [{ data_rank: "1", mksc_shrn_iscd: "005930", hts_kor_isnm: "삼성전자" }] }),
}));

vi.mock("@/lib/kis-token", () => ({ getAccessToken }));
vi.mock("@/lib/kis-signal-snapshot", () => ({ writeKisSignalSnapshot }));
vi.mock("@/lib/kis-domestic-api", () => ({
  fetchDomesticTradeValueRanking: vi.fn(),
  fetchDomesticVolumePower: vi.fn(),
}));
vi.mock("@/lib/kis-investor-flow", () => ({
  fetchCreditBalanceRanking: vi.fn(),
  fetchForeignInstitutionTotal: vi.fn(),
  fetchForeignMemberEstimate: vi.fn(),
  fetchMarketCapRanking,
  fetchMarketValueRanking: vi.fn(),
  fetchNearNewHighLow: vi.fn(),
  fetchTopInterestStock,
}));

import { GET } from "./route";

describe("KIS detection candidates route", () => {
  it("rejects an unsupported source without requesting a token", async () => {
    const response = await GET(new Request("http://localhost/api/kis/detection-candidates?source=unknown"));
    expect(response.status).toBe(400);
    expect((await response.json()).sources).toContain("market-cap");
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("normalizes ranking rows and persists a candidate snapshot", async () => {
    getAccessToken.mockResolvedValueOnce("token");
    const response = await GET(new Request("http://localhost/api/kis/detection-candidates?source=market-cap"));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.rows[0]).toMatchObject({ rank: "1", code: "005930", name: "삼성전자" });
    expect(json.rows).toHaveLength(1);
    expect(json.filter).toMatchObject({ floorInBillionWon: 300, excluded: 1, totalBefore: 2, totalAfter: 1 });
    expect(json.rows[0].observedAt).toBe(json.collectedAt);
    expect(writeKisSignalSnapshot).toHaveBeenCalledWith(expect.objectContaining({ signalType: "candidate_market-cap", code: "0000" }));
  });

  it("routes interest ranking through the shared candidate normalizer", async () => {
    getAccessToken.mockResolvedValueOnce("token");
    const response = await GET(new Request("http://localhost/api/kis/detection-candidates?source=top-interest-stock"));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.rows[0]).toMatchObject({ code: "005930", name: "삼성전자", rank: "1" });
    expect(fetchTopInterestStock).toHaveBeenCalled();
    expect(writeKisSignalSnapshot).toHaveBeenCalledWith(expect.objectContaining({ signalType: "candidate_top-interest-stock" }));
  });
});
