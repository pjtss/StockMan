import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: false,
  query: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn(async () => mocks.admin) }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: mocks.query, connect: async () => ({ query: mocks.clientQuery, release: mocks.release }) }) }));

import { GET, POST } from "./route";

describe("admin SEC SIC fallback route", () => {
  beforeEach(() => {
    mocks.admin = false;
    mocks.query.mockReset();
    mocks.clientQuery.mockReset();
    mocks.release.mockReset();
    vi.unstubAllGlobals();
    process.env.SEC_USER_AGENT = "StockMan SIC backfill test tests@example.org";
  });

  it("requires an admin session before database or SEC access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await GET()).status).toBe(401);
    const response = await POST(new Request("http://localhost/api/admin/us-sec-sic-industry", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range batch size", async () => {
    mocks.admin = true;
    const response = await POST(new Request("http://localhost/api/admin/us-sec-sic-industry", { method: "POST", body: JSON.stringify({ limit: 51 }) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_BATCH_SIZE" });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("reports SEC fallback rows through an admin-only read endpoint", async () => {
    mocks.admin = true;
    mocks.query.mockResolvedValueOnce({ rows: [{ market: "NAS", sec_sic_fallback_count: 1, still_unclassified_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ market: "NAS", code: "AAPL", industry_code: "3571", source_file: "SEC_EDGAR_SIC:0000320193" }] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, source: "SEC_EDGAR_SUBMISSIONS_SIC", markets: [{ sec_sic_fallback_count: 1 }], secSicSamples: [{ code: "AAPL", industry_code: "3571" }] });
  });

  it("stores only a valid SEC SIC for a still-unclassified active common stock and verifies the returned row", async () => {
    mocks.admin = true;
    mocks.query.mockResolvedValueOnce({ rows: [{ market: "NAS", code: "AAPL", name: "Apple Inc.", industry_code: "000" }] });
    mocks.clientQuery.mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [{ market: "NAS", code: "AAPL", industry_code: "3571", source_file: "SEC_EDGAR_SIC:0000320193" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://www.sec.gov/files/company_tickers_exchange.json") {
        return Response.json({ fields: ["cik", "name", "ticker", "exchange"], data: [[320193, "Apple Inc.", "AAPL", "Nasdaq"]] });
      }
      if (url === "https://data.sec.gov/submissions/CIK0000320193.json") return Response.json({ sic: "3571", sicDescription: "Electronic Computers" });
      throw new Error(`Unexpected SEC URL: ${url}`);
    }));
    const response = await POST(new Request("http://localhost/api/admin/us-sec-sic-industry", { method: "POST", body: JSON.stringify({ limit: 50 }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, source: "SEC_EDGAR_SUBMISSIONS_SIC", processed: 1, matchedSecSic: 1, persisted: 1, saved: [{ code: "AAPL", industry_code: "3571", source_file: "SEC_EDGAR_SIC:0000320193" }], hasMore: false });
    const updateSql = String(mocks.clientQuery.mock.calls[1][0]);
    expect(updateSql).toContain("SEC_EDGAR_SIC:");
    expect(updateSql).toContain("AND (u.industry_code IS NULL");
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
