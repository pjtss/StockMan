import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ query: vi.fn(), rateLimit: vi.fn() }));

vi.mock("@/lib/db", () => ({ getPool: () => ({ query: state.query }) }));
vi.mock("@/lib/sec-company-facts-public-rate-limit", () => ({ consumeSecCompanyFactsPublicLimit: state.rateLimit }));

import { GET } from "./route";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    market: "NAS", ticker: "ABCD", company_name: "Example Corp.", current_market_cap_usd: "95000000",
    current_price_usd: "4.25", fundamentals_fetched_at: "2026-10-09T20:00:00.000Z", cik: "0001234567",
    facts_market_cap_usd: "93000000", facts_price_usd: "4.10", dei_shares_outstanding: "12000000",
    dei_fact_end_date: "2026-06-30", dei_fact_filed_date: "2026-08-01", dei_fact_form: "10-Q", dei_fact_accession_number: "0001",
    us_gaap_shares_outstanding: "12500000", us_gaap_fact_end_date: "2026-06-30", us_gaap_fact_filed_date: "2026-08-02", us_gaap_fact_form: "10-Q", us_gaap_fact_accession_number: "0002",
    source_url: "https://www.sec.gov/Archives/edgar/data/1234567/companyfacts.json", sec_fetched_at: "2026-10-09T20:00:00.000Z", updated_at: "2026-10-09T20:00:01.000Z",
    review_status: "VERIFIED", reviewed_shares_outstanding: "12500000", reviewed_as_of_date: "2026-06-30",
    reviewed_filing_form: "10-Q", reviewed_filing_date: "2026-08-02", reviewed_accession_number: "0002",
    reviewed_source_url: "https://www.sec.gov/Archives/edgar/data/1234567/0002", reviewed_at: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("GET /api/public/us-smallcap-shares", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
    state.query.mockResolvedValue({ rows: [makeRow()] });
  });

  it("is unauthenticated and returns current active common-stock data with raw and reviewed SEC facts", async () => {
    const response = await GET(new Request("https://stockman.test/api/public/us-smallcap-shares?ticker=abcd"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.criteria).toMatchObject({ securityType: "ACTIVE_COMMON_STOCK", maximumMarketCapUsd: 100_000_000, maximumInclusive: true });
    expect(body.items[0]).toMatchObject({
      ticker: "ABCD", market: "NAS", marketCapUsd: "95000000",
      sharesOutstanding: { taxonomy: "us-gaap:CommonStockSharesOutstanding", sharesOutstanding: "12500000", filedDate: "2026-08-02" },
      facts: { dei: { sharesOutstanding: "12000000" }, usGaap: { sharesOutstanding: "12500000" } },
      reviewedSharesOutstanding: { status: "VERIFIED", sharesOutstanding: "12500000", asOfDate: "2026-06-30", isFresh: true },
      secCompanyFacts: { cik: "0001234567", url: "https://www.sec.gov/Archives/edgar/data/1234567/companyfacts.json" },
    });
    expect(String(state.query.mock.calls[0][0])).toContain("u.instrument_type = 'COMMON_STOCK'");
    expect(String(state.query.mock.calls[0][0])).toContain("u.daily_active = TRUE");
    expect(String(state.query.mock.calls[0][0])).toContain("COALESCE(u.is_dr, FALSE) = FALSE");
    expect(String(state.query.mock.calls[0][0])).toContain("COALESCE(u.name, '') !~*");
    expect(String(state.query.mock.calls[0][0])).toContain("COALESCE(u.english_name, '') !~*");
    expect(String(state.query.mock.calls[0][0])).toContain("AMERICAN DEPOSITARY");
    expect(String(state.query.mock.calls[0][0])).toContain("LEFT JOIN sec_smallcap_share_review r");
    expect(String(state.query.mock.calls[0][0])).toContain("f.currency = 'USD'");
    expect(String(state.query.mock.calls[0][0])).toContain("f.market_cap <= $1");
    expect(state.query.mock.calls[0][1]).toEqual([100_000_000, "ABCD", null, null, null, null, 101]);
    expect(state.rateLimit).toHaveBeenCalledWith("read", "unknown");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("paginates with an opaque keyset cursor", async () => {
    state.query.mockResolvedValueOnce({ rows: [makeRow({ ticker: "ABCD" }), makeRow({ ticker: "EFGH", current_market_cap_usd: "96000000" })] });
    const first = await GET(new Request("https://stockman.test/api/public/us-smallcap-shares?limit=1"));
    const firstBody = await first.json();
    expect(firstBody.items).toHaveLength(1);
    expect(firstBody.pagination.hasMore).toBe(true);
    expect(firstBody.pagination.nextCursor).toEqual(expect.any(String));

    state.query.mockResolvedValueOnce({ rows: [makeRow({ ticker: "EFGH", current_market_cap_usd: "96000000" })] });
    const second = await GET(new Request(`https://stockman.test/api/public/us-smallcap-shares?limit=1&cursor=${encodeURIComponent(firstBody.pagination.nextCursor)}`));
    expect((await second.json()).items[0].ticker).toBe("EFGH");
    expect(state.query.mock.calls[1][1].slice(3, 6)).toEqual([95_000_000, "NAS", "ABCD"]);
  });

  it("does not publish a stale verified count or an unverified count", async () => {
    state.query.mockResolvedValueOnce({ rows: [
      makeRow({ reviewed_as_of_date: "2024-01-01" }),
      makeRow({ ticker: "EFGH", review_status: "REVIEW_REQUIRED", reviewed_shares_outstanding: null, reviewed_as_of_date: null }),
    ] });
    const response = await GET(new Request("https://stockman.test/api/public/us-smallcap-shares?limit=2"));
    const body = await response.json();
    expect(body.items[0].reviewedSharesOutstanding).toMatchObject({ status: "VERIFIED", sharesOutstanding: null, isFresh: false });
    expect(body.items[0].reviewedSharesOutstanding.note).toContain("1년");
    expect(body.items[1].reviewedSharesOutstanding).toMatchObject({ status: "REVIEW_REQUIRED", sharesOutstanding: null, isFresh: false });
  });

  it("rejects invalid filters and cursors before querying the database", async () => {
    expect((await GET(new Request("https://stockman.test/api/public/us-smallcap-shares?market=OTC"))).status).toBe(400);
    expect((await GET(new Request("https://stockman.test/api/public/us-smallcap-shares?limit=101"))).status).toBe(400);
    expect((await GET(new Request("https://stockman.test/api/public/us-smallcap-shares?cursor=not-a-cursor"))).status).toBe(400);
    expect(state.query).not.toHaveBeenCalled();
  });

  it("returns rate-limit and sanitized database failures", async () => {
    state.rateLimit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const limited = await GET(new Request("https://stockman.test/api/public/us-smallcap-shares"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("42");
    expect(state.query).not.toHaveBeenCalled();

    state.query.mockRejectedValueOnce(new Error("postgres://private-user:private-password@host/db"));
    const unavailable = await GET(new Request("https://stockman.test/api/public/us-smallcap-shares"));
    const payload = await unavailable.json();
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(payload)).not.toContain("private-password");
  });
});
