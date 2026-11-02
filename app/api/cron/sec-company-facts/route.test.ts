import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ settings: {} as any, latest: null as any, ciks: [] as string[], secRows: [] as any[], eligible: [] as any[], factEligible: [] as any[], synced: [] as string[], lock: "run" as "run" | "busy", runResult: {} as any }));
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings: vi.fn(async () => state.settings) }));
vi.mock("@/lib/automation-run-repository", () => ({ loadLatestExecutedAutomationRun: vi.fn(async () => state.latest), recordSkippedAutomationRun: vi.fn(async () => undefined) }));
vi.mock("@/lib/automation-lock", () => ({ withAutomationLock: vi.fn(async (_key: string, task: () => Promise<unknown>) => state.lock === "busy" ? null : task()) }));
vi.mock("@/lib/sec-edgar-config", () => ({ normalizeSecCiks: (input: unknown) => Array.isArray(input) ? input : String(input || "").split(/[\s,]+/).filter(Boolean).map((value) => value.replace(/\D/g, "").padStart(10, "0")) }));
vi.mock("@/lib/sec-company-ticker", () => ({ loadSecCompanyTickerMaster: vi.fn(async () => state.secRows) }));
vi.mock("@/lib/sec-company-facts-eligibility", () => ({
  filterEnabledSecCommonStocks: vi.fn(async () => state.eligible),
  filterActiveSecCommonStocks: vi.fn(async () => state.factEligible),
}));
vi.mock("@/lib/sec-company-ticker-master-sync", () => ({ syncSecCompanyTickerMaster: vi.fn(async () => ({ issuerCount: state.eligible.length, tickerCount: state.eligible.length, syncedAt: "2026-09-26T08:00:00.000Z" })) }));
vi.mock("@/lib/sec-company-facts-sync", () => ({ syncSecCompanyFacts: vi.fn(async (cik: string) => { state.synced.push(cik); return { ok: true, cik }; }) }));
vi.mock("@/lib/automation-run", () => ({ withAutomationRun: vi.fn(async (_key: string, task: () => Promise<unknown>) => { state.runResult = await task(); return state.runResult; }) }));

import { POST } from "./route";

describe("SEC Company Facts daily cron", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-25T23:01:00.000Z")); process.env.CRON_SECRET = "cron-test";
    process.env.SEC_SYNC_CIKS = "";
    state.settings = { enabled: true, startTime: "08:00", endTime: "08:10", activeDays: [0, 1, 2, 3, 4, 5, 6], featureSettings: { secCompanyFacts: { ciks: ["0000000001", "0000000002"] } } };
    state.latest = null; state.ciks = []; state.secRows = []; state.eligible = []; state.factEligible = []; state.synced = []; state.lock = "run"; state.runResult = {};
  });

  it("refuses unauthenticated cron requests", async () => {
    const response = await POST(new Request("http://localhost/api/cron/sec-company-facts", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("refreshes company identities for active common stocks and fetches only configured CIK facts", async () => {
    state.secRows = [{ cik: "0000000001", ticker: "COM", name: "Common Corp" }, { cik: "0000000002", ticker: "ETF", name: "Example ETF Trust" }];
    state.eligible = [{ cik: "0000000001", ticker: "COM", market: "NAS" }];
    state.factEligible = [{ cik: "0000000001", ticker: "COM", market: "NAS" }];
    const response = await POST(new Request("http://localhost/api/cron/sec-company-facts", { method: "POST", headers: { "x-cron-secret": "cron-test" } }));
    expect(response.status).toBe(200);
    expect(state.synced).toEqual(["0000000001"]);
    expect(state.runResult).toMatchObject({ instrumentCount: 1, excludedNonCommonOrInactiveCikCount: 1, successCount: 1, secCompanyMasterIssuerCount: 1, secCompanyMasterTickerCount: 1 });
  });

  it("refreshes the SEC identity map even when no facts CIKs are configured", async () => {
    state.settings.featureSettings.secCompanyFacts.ciks = [];
    state.secRows = [{ cik: "0000000001", ticker: "COM", name: "Common Corp" }];
    state.eligible = [{ cik: "0000000001", ticker: "COM", name: "Common Corp", exchange: "NASDAQ", market: "NAS", universeCode: "COM", universeName: "Common Corp" }];
    const response = await POST(new Request("http://localhost/api/cron/sec-company-facts", { method: "POST", headers: { "x-cron-secret": "cron-test" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, instrumentCount: 0, secCompanyMasterIssuerCount: 1, secCompanyMasterTickerCount: 1 });
    expect(state.synced).toEqual([]);
  });

  it("records a successful empty identity refresh when the KIS master confirms no SEC-listed common stock", async () => {
    state.secRows = [{ cik: "0000000002", ticker: "ETF", name: "Example ETF Trust" }];
    const response = await POST(new Request("http://localhost/api/cron/sec-company-facts", { method: "POST", headers: { "x-cron-secret": "cron-test" } }));
    expect(await response.json()).toMatchObject({ ok: true, instrumentCount: 0, secCompanyMasterIssuerCount: 0, secCompanyMasterTickerCount: 0 });
    expect(state.synced).toEqual([]);
  });
});
