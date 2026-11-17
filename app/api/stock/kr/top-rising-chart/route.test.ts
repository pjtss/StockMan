import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  getAccessToken: vi.fn(),
  fetchDomesticFluctuation: vi.fn(),
  filterActiveKrCommonStockRows: vi.fn(),
  filterKrRowsByStoredMarketCap: vi.fn(),
}));

vi.mock("@/lib/intraday-memory-state", () => ({ intradayMemoryState: { snapshot: mocks.snapshot } }));
vi.mock("@/lib/kis-token", () => ({ getAccessToken: mocks.getAccessToken }));
vi.mock("@/lib/kis-domestic-api", () => ({ fetchDomesticFluctuation: mocks.fetchDomesticFluctuation }));
vi.mock("@/lib/instrument-eligibility", () => ({ filterActiveKrCommonStockRows: mocks.filterActiveKrCommonStockRows }));
vi.mock("@/lib/kr-market-cap", () => ({ KR_MARKET_CAP_MAX_AGE_HOURS: 24, filterKrRowsByStoredMarketCap: mocks.filterKrRowsByStoredMarketCap }));

import { GET } from "./route";

describe("KR top rising chart official universe filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.snapshot.mockReturnValue({ current: [], previous: [] });
    mocks.getAccessToken.mockResolvedValue("token");
    mocks.filterActiveKrCommonStockRows.mockImplementation(async (rows: Array<{ code?: string; mksc_shrn_iscd?: string; stck_shrn_iscd?: string }>) => rows.filter((row) => ["005930"].includes(String(row.code ?? row.mksc_shrn_iscd ?? row.stck_shrn_iscd))));
    mocks.filterKrRowsByStoredMarketCap.mockImplementation(async (rows: Array<{ code?: string; mksc_shrn_iscd?: string; stck_shrn_iscd?: string }>) => rows.filter((row) => ["005930"].includes(String(row.code ?? row.mksc_shrn_iscd ?? row.stck_shrn_iscd))));
  });

  it("filters the intraday memory snapshot using official product and market-cap data", async () => {
    mocks.snapshot.mockReturnValue({ current: [{ market: "KOSPI", code: "005930" }, { market: "KOSDAQ", code: "000002" }], previous: [] });
    const response = await GET();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.items.map((row: { code: string }) => row.code)).toEqual(["005930"]);
    expect(mocks.fetchDomesticFluctuation).not.toHaveBeenCalled();
  });

  it("filters fallback KIS ranking rows using official product and market-cap data", async () => {
    mocks.getAccessToken.mockResolvedValueOnce("token");
    mocks.fetchDomesticFluctuation.mockResolvedValueOnce([
      { mksc_shrn_iscd: "005930", hts_kor_isnm: "삼성전자", prdy_ctrt: "3" },
      { mksc_shrn_iscd: "000002", hts_kor_isnm: "unverified", prdy_ctrt: "9" },
    ]);
    const response = await GET();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.items.map((row: { code: string }) => row.code)).toEqual(["005930"]);
  });

  it("fails closed when the official universe cannot be read", async () => {
    mocks.fetchDomesticFluctuation.mockResolvedValueOnce([{ mksc_shrn_iscd: "005930" }]);
    mocks.filterActiveKrCommonStockRows.mockRejectedValueOnce(new Error("universe unavailable"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "COMMON_STOCK_UNIVERSE_UNAVAILABLE", eligibility: { failClosed: true }, items: [] });
  });
});
