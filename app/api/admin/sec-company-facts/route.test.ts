import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ allowed: false, tickerRows: [] as any[], cikRows: [] as any[], eligible: [] as any[], syncResult: {} as any, snapshot: null as any }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn(async () => state.allowed) }));
vi.mock("@/lib/sec-company-ticker", () => ({ resolveSecCikTickers: vi.fn(async () => state.cikRows), resolveSecTickerCandidates: vi.fn(async () => state.tickerRows), selectPreferredSecCompanyTicker: (rows: any[]) => rows[0] || null }));
vi.mock("@/lib/sec-company-facts-eligibility", () => ({ filterActiveSecCommonStocks: vi.fn(async () => state.eligible) }));
vi.mock("@/lib/sec-company-facts-persistence", () => ({ loadSecCompanyFactsSnapshot: vi.fn(async () => state.snapshot) }));
vi.mock("@/lib/sec-company-facts-sync", () => ({ syncSecCompanyFacts: vi.fn(async () => state.syncResult) }));

import { GET, POST } from "./route";

describe("admin SEC Company Facts lookup", () => {
  beforeEach(() => {
    state.allowed = false; state.tickerRows = []; state.cikRows = []; state.eligible = []; state.snapshot = null;
    state.syncResult = { ok: true, cik: "0000000001", entityName: "Example Inc.", factCount: 12, taxonomyCount: 2, fetchedAt: "2026-09-26T00:00:00.000Z", archivedId: 7 };
  });

  it("requires an administrator before external or database work", async () => {
    const response = await POST(new Request("http://localhost/api/admin/sec-company-facts", { method: "POST", body: JSON.stringify({ query: "AAPL" }) }));
    expect(response.status).toBe(401);
  });

  it("refuses a ticker that is not an active common stock", async () => {
    state.allowed = true; state.tickerRows = [{ ticker: "SPY", cik: "0000000001" }];
    const response = await POST(new Request("http://localhost/api/admin/sec-company-facts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "SPY" }) }));
    expect(response.status).toBe(422);
    expect(state.syncResult.ok).toBe(true);
  });

  it("persists facts only after active common-stock verification", async () => {
    state.allowed = true;
    state.tickerRows = [{ cik: "0000000001", ticker: "EXM", name: "Example Inc.", exchange: "NASDAQ" }];
    state.eligible = [{ ...state.tickerRows[0], market: "NAS", universeCode: "EXM", universeName: "Example Inc." }];
    const response = await POST(new Request("http://localhost/api/admin/sec-company-facts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "EXM" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, cik: "0000000001", mapping: { ticker: "EXM", market: "NAS" } });
  });

  it("blocks retrieval of an existing snapshot if the CIK has no active common ticker", async () => {
    state.allowed = true;
    const response = await GET(new Request("http://localhost/api/admin/sec-company-facts?cik=1"));
    expect(response.status).toBe(422);
  });
});
