import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), inspectSchema: vi.fn(), loadSettings: vi.fn() }));

vi.mock("@/lib/db", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("@/lib/schema-health", () => ({ inspectDatabaseSchema: mocks.inspectSchema }));
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings: mocks.loadSettings }));
vi.mock("@/lib/feature-modules", () => ({ FEATURE_MODULES: [] }));
vi.mock("@/lib/market-rss-translation-configuration", () => ({
  getMarketRssTranslationConfiguration: () => ({ requested: false, configured: false, status: "DISABLED", provider: null }),
}));

import { getHealthSnapshot } from "./health-check";

describe("health snapshot database query concurrency", () => {
  it("uses indexed per-module lookups and starts the independent health reads together", async () => {
    const resolveQueries: Array<(value: { rows: never[] }) => void> = [];
    mocks.query.mockImplementationOnce(async () => ({ rows: [] }))
      .mockImplementation(() => new Promise((resolve) => resolveQueries.push(resolve)));
    mocks.inspectSchema.mockResolvedValue({
      connectionOk: true, schemaReady: true, flywayVersion: "149", checkedTables: ["automation_runs"], missingTables: [],
      operationalTables: ["automation_runs"], missingOperationalTables: [], missingOperationalColumns: [], retiredTablesPresent: [], latencyMs: 1,
    });
    mocks.loadSettings.mockResolvedValue({ enabled: true, intervalSeconds: 60 });

    const snapshotPromise = getHealthSnapshot();

    await vi.waitFor(() => {
      expect(mocks.query).toHaveBeenCalledTimes(3);
      expect(mocks.loadSettings).toHaveBeenCalledTimes(3);
    });
    expect(resolveQueries).toHaveLength(2);
    for (const [query] of mocks.query.mock.calls) {
      expect(String(query)).toContain("LEFT JOIN LATERAL");
      expect(String(query)).toContain("LIMIT 1");
      expect(String(query)).not.toContain("DISTINCT ON");
    }
    resolveQueries.forEach((resolve) => resolve({ rows: [] }));
    await expect(snapshotPromise).resolves.toMatchObject({ database: { schemaReady: true } });
  });
});
