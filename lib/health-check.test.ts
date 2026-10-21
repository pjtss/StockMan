import { afterEach, describe, expect, it, vi } from "vitest";
import nextPackage from "next/package.json";
import { OPERATIONAL_SCHEMA_TABLES } from "@/lib/schema-health";

const schemaMock = vi.hoisted(() => ({ inspect: vi.fn() }));
vi.mock("@/lib/schema-health", () => ({ inspectDatabaseSchema: schemaMock.inspect, OPERATIONAL_SCHEMA_TABLES: ["kis_rate_limit_events"] }));

import { getAutomationCoverage, getHealthSnapshot, getRuntimeVersions } from "./health-check";

afterEach(() => vi.unstubAllEnvs());

describe("automation coverage", () => {
  it("identifies registered modules without execution history", () => {
    expect(getAutomationCoverage(["a", "b", "c"], ["b", "unknown"])).toEqual({
      expected: ["a", "b", "c"],
      observed: ["b"],
      neverRun: ["a", "c"],
    });
  });
});

describe("health runtime metadata", () => {
  it("reports the installed Next.js package version rather than a stale hard-coded value", () => {
    expect(getRuntimeVersions().next).toBe(nextPackage.version);
  });

  it("includes missing operational telemetry tables and columns in health diagnostics", async () => {
    expect(OPERATIONAL_SCHEMA_TABLES).toContain("kis_rate_limit_events");
    schemaMock.inspect.mockResolvedValueOnce({
      connectionOk: true,
      schemaReady: false,
      flywayVersion: "84",
      checkedTables: [],
      missingTables: [],
      operationalTables: [],
      missingOperationalTables: ["debug_kis_calls", "kis_rate_limit_events"],
      missingOperationalColumns: ["market_rss_articles.translation_attempted_at", "market_rss_articles.translation_candidate_title"],
      retiredTablesPresent: [],
      latencyMs: 4,
    });

    const health = await getHealthSnapshot();

    expect(health.status).toBe("degraded");
    expect(health.database).toMatchObject({
      missingOperationalTables: ["debug_kis_calls", "kis_rate_limit_events"],
      missingOperationalColumns: ["market_rss_articles.translation_attempted_at", "market_rss_articles.translation_candidate_title"],
    });
  });

  it("reports RSS translation configuration without treating its optional key as a service requirement", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://health-check.test/stockman");
    vi.stubEnv("CRON_SECRET", "health-check-secret");
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "");
    const healthySchema = {
      connectionOk: true,
      schemaReady: true,
      flywayVersion: "140",
      checkedTables: [],
      missingTables: [],
      operationalTables: [],
      missingOperationalTables: [],
      missingOperationalColumns: [],
      retiredTablesPresent: [],
      latencyMs: 1,
    };
    schemaMock.inspect.mockResolvedValueOnce(healthySchema);

    const missingKey = await getHealthSnapshot();

    expect(missingKey.rssTranslation).toMatchObject({ requested: true, configured: false, status: "API_KEY_MISSING", provider: null });
    expect(missingKey.status).toBe("ok");

    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "health-check-translation-secret");
    schemaMock.inspect.mockResolvedValueOnce(healthySchema);
    const configured = await getHealthSnapshot();

    expect(configured.rssTranslation).toMatchObject({ requested: true, configured: true, status: "READY", provider: "Google Cloud Translation Basic v2 (Azure F0 미설정)", primary: "google-cloud-translation" });
    expect(JSON.stringify(configured)).not.toContain("health-check-translation-secret");
  });
});
