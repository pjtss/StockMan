import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  loadSettings: vi.fn(),
  loadAutomation: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: mocks.requireAdminSession }));
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings: mocks.loadSettings }));
vi.mock("@/lib/automation-debug", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/automation-debug")>(),
  loadAutomationDebugSnapshot: mocks.loadAutomation,
}));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: mocks.query }) }));

import { GET } from "./route";

describe("GET /api/admin/instrument-fundamentals-debug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminSession.mockResolvedValue(true);
    mocks.loadSettings.mockResolvedValue({ enabled: true, startTime: "08:00", endTime: "18:00", activeDays: [1, 2, 3, 4, 5], scheduleMode: "daily-window", intervalSeconds: 86_400, updatedAt: "2026-10-08T00:00:00.000Z" });
    mocks.loadAutomation.mockResolvedValue({ recentRuns: [{ id: 3, status: "SKIPPED", startedAt: new Date().toISOString(), summary: { reason: "outside_interval" } }], totals: { runs: 3, success: 1, failed: 1, skipped: 1 }, skipReasons: [], failureCategories: [], failures: [] });
    mocks.query.mockImplementation(async (text: string) => text.includes("FROM automation_runs")
      ? { rows: [{ id: 2, module_key: "instrument-fundamentals", status: "SUCCESS", started_at: new Date(Date.now() - 3 * 86_400_000), finished_at: new Date(Date.now() - 3 * 86_400_000 + 12_000), duration_ms: 12_000, summary: { ok: false, instrumentCount: 50, successCount: 48, failureCount: 2, failures: { count: 2, sample: [{ code: "000001", market: "KOSPI", error: "KIS request failed" }] } }, error_message: null }] }
      : text.includes("FROM debug_run_items")
        ? Promise.reject(new Error('relation "debug_run_items" does not exist'))
        : { rows: [{ market: "NAS", active_instruments: 100, snapshot_count: 98, missing_snapshot_count: 2, invalid_market_cap_count: 3, fresh_snapshot_count: 95, latest_fetched_at: "2026-10-08T00:00:00.000Z", unsupported_currency_count: 0 }] });
  });

  it("requires an administrator session", async () => {
    mocks.requireAdminSession.mockResolvedValue(false);
    const response = await GET(new Request("http://localhost/api/admin/instrument-fundamentals-debug"));
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns schedule, run history and market-cap coverage diagnostics without secrets", async () => {
    const response = await GET(new Request("http://localhost/api/admin/instrument-fundamentals-debug?limit=15&staleAfterHours=48"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("INSTRUMENT_FUNDAMENTALS_DEBUG");
    expect(body.feature).toMatchObject({ enabled: true, intervalSeconds: 86_400 });
    expect(body.execution.latestRun).toMatchObject({ id: 2, status: "SUCCESS", effectiveStatus: "PARTIAL", derivedStatus: "PARTIAL", statusMismatch: true, itemsSource: "summary_failure_samples", itemsWarning: "DEBUG_RUN_ITEMS_TABLE_UNAVAILABLE" });
    expect(body.execution.latestRun.items).toMatchObject([{ market: "KOSPI", code: "000001", status: "FAILED", errorMessage: "KIS request failed" }]);
    expect(body.execution.latestObservedRun).toMatchObject({ id: 3, status: "SKIPPED" });
    expect(body.execution).toMatchObject({ intervalStatus: "OVERDUE" });
    expect(body.execution.overdueSeconds).toBeGreaterThan(0);
    expect(body.execution.failures).toMatchObject([{ id: 2, effectiveStatus: "PARTIAL", statusMismatch: true }]);
    expect(body.snapshotCoverage).toMatchObject({ staleAfterHours: 48, byMarket: [{ market: "NAS", activeInstruments: 100, missingSnapshotCount: 2, invalidMarketCapCount: 3, staleOrMissingCount: 5 }] });
    expect(mocks.loadAutomation).toHaveBeenCalledWith(expect.objectContaining({ moduleKey: "instrument-fundamentals", limit: 15, failureLimit: 15 }));
    const coverageQuery = mocks.query.mock.calls.find(([text]) => String(text).includes("WITH active_universe"));
    expect(coverageQuery?.[1]).toEqual([48]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects invalid bounds before querying diagnostics", async () => {
    const response = await GET(new Request("http://localhost/api/admin/instrument-fundamentals-debug?limit=51"));
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.loadAutomation).not.toHaveBeenCalled();
  });

  it("does not leak database error details", async () => {
    mocks.query.mockRejectedValue(new Error("postgres://private-user:private-password@host/db"));
    const response = await GET(new Request("http://localhost/api/admin/instrument-fundamentals-debug"));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain("private-password");
  });
});
