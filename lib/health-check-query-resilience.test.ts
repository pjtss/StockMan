import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), inspectSchema: vi.fn(), loadSettings: vi.fn() }));

vi.mock("@/lib/db", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("@/lib/schema-health", () => ({ inspectDatabaseSchema: mocks.inspectSchema }));
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings: mocks.loadSettings }));
vi.mock("@/lib/feature-modules", () => ({ FEATURE_MODULES: [{ key: "automation-a", scheduler: "OCI_CRON" }] }));

import { getHealthSnapshot } from "./health-check";

const startedAt = new Date("2099-10-15T00:00:00.000Z");
const finishedAt = new Date("2099-10-15T00:00:01.000Z");
const cacheModules = ["us-daily-cache", "us-daily-open-cache", "kr-daily-cache"];

function cacheRows() {
  return cacheModules.map((module_key) => ({ module_key, status: "SUCCESS", started_at: startedAt, finished_at: finishedAt, error_message: null, summary: {} }));
}

describe("health snapshot history query resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.inspectSchema.mockResolvedValue({
      connectionOk: true,
      schemaReady: true,
      flywayVersion: "149",
      checkedTables: ["automation_runs"],
      missingTables: [],
      operationalTables: ["automation_runs"],
      missingOperationalTables: [],
      missingOperationalColumns: [],
      retiredTablesPresent: [],
      latencyMs: 1,
    });
    mocks.loadSettings.mockResolvedValue({ enabled: true, intervalSeconds: 60 });
  });

  it("preserves latest automation and cache data when the last-success query fails", async () => {
    mocks.query.mockImplementation(async (query: string) => {
      if (query.includes("history.status = 'SUCCESS'")) throw Object.assign(new Error("query timeout"), { code: "57014" });
      if (query.includes("history.status <> 'SKIPPED'")) return { rows: cacheRows() };
      return { rows: [{ module_key: "automation-a", status: "SUCCESS", started_at: startedAt, finished_at: finishedAt, error_message: null, summary: {} }] };
    });

    const health = await getHealthSnapshot();

    expect(health.automationHistoryAvailable).toBe(true);
    expect(health.automation["automation-a"].status).toBe("SUCCESS");
    expect(health.cacheAutomation["us-daily-cache"]).toMatchObject({
      historyAvailable: true,
      lastSuccessAvailable: false,
      status: "SUCCESS",
      stale: false,
    });
  });

  it("distinguishes failed automation history from an empty history without discarding cache results", async () => {
    mocks.query.mockImplementation(async (query: string) => {
      if (query.includes("WHERE history.module_key = requested.module_key ORDER BY")) {
        throw Object.assign(new Error("query timeout"), { code: "57014" });
      }
      if (query.includes("history.status = 'SUCCESS'")) return { rows: cacheModules.map((module_key) => ({ module_key, finished_at: finishedAt })) };
      return { rows: cacheRows() };
    });

    const health = await getHealthSnapshot();

    expect(health.automationHistoryAvailable).toBe(false);
    expect(health.automationCoverage).toEqual({ expected: ["automation-a"], observed: [], neverRun: [] });
    expect(health.automation).toEqual({});
    expect(health.cacheAutomation["us-daily-cache"]).toMatchObject({
      historyAvailable: true,
      lastSuccessAvailable: true,
      status: "SUCCESS",
    });
    expect(console.warn).toHaveBeenCalledWith("[Health] automation history unavailable:", "query timeout");
  });
});
