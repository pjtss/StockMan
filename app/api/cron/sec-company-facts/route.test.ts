import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ settings: {} as any, latest: null as any, ciks: [] as string[], secRows: [] as any[], eligible: [] as any[], synced: [] as string[], lock: "run" as "run" | "busy", runResult: {} as any }));
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings: vi.fn(async () => state.settings) }));
vi.mock("@/lib/automation-run-repository", () => ({ loadLatestExecutedAutomationRun: vi.fn(async () => state.latest), recordSkippedAutomationRun: vi.fn(async () => undefined) }));
vi.mock("@/lib/automation-lock", () => ({ withAutomationLock: vi.fn(async (_key: string, task: () => Promise<unknown>) => state.lock === "busy" ? null : task()) }));
vi.mock("@/lib/sec-edgar-config", () => ({ normalizeSecCiks: (input: unknown) => Array.isArray(input) ? input : String(input || "").split(/[\s,]+/).filter(Boolean).map((value) => value.replace(/\D/g, "").padStart(10, "0")) }));
vi.mock("@/lib/sec-company-ticker", () => ({ resolveSecCompanyTickers: vi.fn(async () => state.secRows) }));
vi.mock("@/lib/sec-company-facts-eligibility", () => ({ filterActiveSecCommonStocks: vi.fn(async () => state.eligible) }));
vi.mock("@/lib/sec-company-facts-sync", () => ({ syncSecCompanyFacts: vi.fn(async (cik: string) => { state.synced.push(cik); return { ok: true, cik }; }) }));
vi.mock("@/lib/automation-run", () => ({ withAutomationRun: vi.fn(async (_key: string, task: () => Promise<unknown>) => { state.runResult = await task(); return state.runResult; }) }));

import { POST } from "./route";

describe("SEC Company Facts daily cron", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-25T23:01:00.000Z")); process.env.CRON_SECRET = "cron-test";
    state.settings = { enabled: true, startTime: "08:00", endTime: "08:10", activeDays: [0, 1, 2, 3, 4, 5, 6], featureSettings: { secCompanyFacts: { ciks: ["0000000001", "0000000002"] } } };
    state.latest = null; state.ciks = []; state.secRows = []; state.eligible = []; state.synced = []; state.lock = "run"; state.runResult = {};
  });

  it("refuses unauthenticated cron requests", async () => {
    const response = await POST(new Request("http://localhost/api/cron/sec-company-facts", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("fetches only CIKs matched to active common-stock universe rows", async () => {
    state.secRows = [{ cik: "0000000001", ticker: "COM", name: "Common Corp" }, { cik: "0000000002", ticker: "ETF", name: "Example ETF Trust" }];
    state.eligible = [{ cik: "0000000001", ticker: "COM", market: "NAS" }];
    const response = await POST(new Request("http://localhost/api/cron/sec-company-facts", { method: "POST", headers: { "x-cron-secret": "cron-test" } }));
    expect(response.status).toBe(200);
    expect(state.synced).toEqual(["0000000001"]);
    expect(state.runResult).toMatchObject({ instrumentCount: 1, excludedNonCommonOrInactiveCikCount: 1, successCount: 1 });
  });

  it("skips when the KIS common-stock universe cannot confirm any target", async () => {
    state.secRows = [{ cik: "0000000002", ticker: "ETF", name: "Example ETF Trust" }];
    const response = await POST(new Request("http://localhost/api/cron/sec-company-facts", { method: "POST", headers: { "x-cron-secret": "cron-test" } }));
    expect(await response.json()).toMatchObject({ skipped: true, reason: "no_active_common_stock_ciks" });
    expect(state.synced).toEqual([]);
  });
});
