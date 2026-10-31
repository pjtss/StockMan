import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], sql: "" }));
vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: async (sql: string) => {
      state.sql = sql;
      return { rows: state.rows, rowCount: state.rows.length };
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/public/us-stock-metadata", () => {
  beforeEach(() => {
    state.sql = "";
    state.rows = [{
      market: "NAS",
      code: "GENK",
      realtime_symbol: "NASGENK",
      name: "젠 레스토랑 그룹",
      english_name: "GEN RESTAURANT GROUP INC",
      instrument_type: "COMMON_STOCK",
      security_type: "2",
      etp_type: null,
      currency: "USD",
      country_code: "US",
      industry_code: "5812",
      is_etf: false,
      is_leveraged: false,
      is_inverse: false,
      is_warrant: false,
      is_derivative: false,
      is_dr: false,
      enabled: true,
      source_file: "SEC_EDGAR_SIC:0001891856",
      master_updated_at: "2026-10-25T05:21:15.804Z",
      master_last_seen_at: "2026-10-24T16:30:20.917Z",
      cik: "0001891856",
      sec_name: "GEN Restaurant Group, Inc.",
      sic: "5812",
      sec_identity_source: "SEC_EDGAR_SIC_SOURCE",
      sec_source_updated_at: "2026-10-25T05:21:15.804Z",
      xbrl_payload: {
        entityName: "GEN Restaurant Group, Inc.",
        facts: { "us-gaap": { RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [{ val: 1_000_000, start: "2025-01-01", end: "2025-03-31", filed: "2025-05-01", form: "10-Q", accn: "0001891856-25-000001" }] } } } },
      },
      xbrl_fetched_at: "2026-10-30T08:00:00.000Z",
      price: 1.63,
      change_rate: 0,
      open: null,
      high: null,
      low: null,
      volume: 0,
      trading_value: 0,
      market_cap: 11_897_590,
      listed_shares: 7_299_135,
      snapshot_currency: "USD",
      quote_source: "KIS_OVERSEAS_PRICE",
      observed_at: "2026-10-30T07:09:45.709Z",
      fetched_at: "2026-10-30T07:09:45.709Z",
    }];
  });

  it("uses the verified SEC SIC CIK provenance to connect a saved Company Facts snapshot", async () => {
    const response = await GET(new Request("https://stockman.example/api/public/us-stock-metadata?ticker=GENK"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(state.sql).toContain("substring(u.source_file FROM '^SEC_EDGAR_SIC:([0-9]{10})$')");
    expect(state.sql).toContain("x.cik = COALESCE(sec.cik, sic_source.cik)");
    expect(body.company).toMatchObject({ cik: "0001891856", secName: "GEN Restaurant Group, Inc.", sic: "5812", source: "SEC_EDGAR_SIC_SOURCE" });
    expect(body.financials).toMatchObject({ source: "SEC_COMPANY_FACTS", availableMetricCount: 1 });
    expect(body.financials.metrics.revenue).toMatchObject({ value: "1000000", periodEnd: "2025-03-31", form: "10-Q" });
  });
});
