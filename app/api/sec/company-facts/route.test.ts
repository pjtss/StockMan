import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tickerRows: [] as any[], cikRows: [] as any[], eligible: [] as any[],
  syncResult: {} as any, snapshot: null as any, syncCalls: 0,
}));
vi.mock("@/lib/sec-company-ticker", () => ({
  resolveSecCikTickers: vi.fn(async () => state.cikRows),
  resolveSecTickerCandidates: vi.fn(async () => state.tickerRows),
  selectPreferredSecCompanyTicker: (rows: any[]) => rows[0] || null,
}));
vi.mock("@/lib/sec-company-facts-eligibility", () => ({ filterActiveSecCommonStocks: vi.fn(async () => state.eligible) }));
vi.mock("@/lib/sec-company-facts-persistence", () => ({ loadSecCompanyFactsSnapshot: vi.fn(async () => state.snapshot) }));
vi.mock("@/lib/sec-company-facts-sync", () => ({ syncSecCompanyFacts: vi.fn(async () => { state.syncCalls += 1; return state.syncResult; }) }));

import { GET, POST } from "./route";
import { resetSecCompanyFactsPublicLimitsForTest } from "@/lib/sec-company-facts-public-rate-limit";

describe("public SEC Company Facts lookup", () => {
  beforeEach(() => {
    resetSecCompanyFactsPublicLimitsForTest();
    state.tickerRows = []; state.cikRows = []; state.eligible = []; state.snapshot = null; state.syncCalls = 0;
    state.syncResult = { ok: true, cik: "0000000001", entityName: "Example Inc.", factCount: 12, taxonomyCount: 2, fetchedAt: "2026-09-26T00:00:00.000Z", archivedId: 7 };
  });

  it("allows an unauthenticated active common-stock lookup and persists the facts", async () => {
    state.tickerRows = [{ cik: "0000000001", ticker: "EXM", name: "Example Inc.", exchange: "NASDAQ" }];
    state.eligible = [{ ...state.tickerRows[0], market: "NAS", universeCode: "EXM", universeName: "Example Inc." }];
    const response = await POST(new Request("http://localhost/api/sec/company-facts", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "192.0.2.1" }, body: JSON.stringify({ query: "EXM" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, cik: "0000000001", mapping: { ticker: "EXM", market: "NAS" } });
    expect(state.syncCalls).toBe(1);
  });

  it("returns saved JSON publicly only after active common-stock verification", async () => {
    state.cikRows = [{ cik: "0000000001", ticker: "EXM" }];
    state.eligible = state.cikRows;
    state.snapshot = { cik: "0000000001", payload: { facts: { usGaap: {} } }, fetchedAt: "2026-09-26T00:00:00.000Z" };
    const response = await GET(new Request("http://localhost/api/sec/company-facts?cik=1", { headers: { "x-real-ip": "192.0.2.2" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, snapshot: { payload: { facts: { usGaap: {} } } } });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed for a non-common-stock mapping without calling SEC", async () => {
    state.tickerRows = [{ cik: "0000000002", ticker: "EXMW", name: "Example Warrant" }];
    const response = await POST(new Request("http://localhost/api/sec/company-facts", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "192.0.2.3" }, body: JSON.stringify({ query: "EXMW" }) }));
    expect(response.status).toBe(422);
    expect(state.syncCalls).toBe(0);
  });

  it("returns 429 and Retry-After after the per-client lookup budget is used", async () => {
    const makeRequest = () => POST(new Request("http://localhost/api/sec/company-facts", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "192.0.2.4" }, body: JSON.stringify({ query: "" }) }));
    for (let i = 0; i < 6; i += 1) expect((await makeRequest()).status).toBe(400);
    const response = await makeRequest();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
  });
});
