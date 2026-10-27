import { describe, expect, it } from "vitest";
import { CORE_SCHEMA_TABLES, OPERATIONAL_SCHEMA_TABLES, RETIRED_SCHEMA_TABLES, REQUIRED_OPERATIONAL_COLUMNS, getMissingSchemaTables, inspectDatabaseSchema } from "./schema-health";

describe("schema-health", () => {
  it("requires KIS retry/rate-limit telemetry tables for operational readiness", () => {
    expect(OPERATIONAL_SCHEMA_TABLES).toContain("debug_kis_calls");
    expect(OPERATIONAL_SCHEMA_TABLES).toContain("kis_rate_limit_events");
    expect(getMissingSchemaTables([], OPERATIONAL_SCHEMA_TABLES)).toEqual(expect.arrayContaining(["debug_kis_calls", "kis_rate_limit_events"]));
  });

  it("reports missing core tables", () => {
    expect(getMissingSchemaTables(["automation_runs"])).toContain("market_rss_articles");
    expect(getMissingSchemaTables([...CORE_SCHEMA_TABLES])).toEqual([]);
  });

  it("treats per-user watchlist storage as an operational dependency", () => {
    expect(OPERATIONAL_SCHEMA_TABLES).toContain("user_watchlist");
    expect(getMissingSchemaTables(["users", "user_sessions"], OPERATIONAL_SCHEMA_TABLES)).toContain("user_watchlist");
  });

  it("treats both debugging observability stores as operational dependencies", () => {
    const missing = getMissingSchemaTables(["automation_runs"], OPERATIONAL_SCHEMA_TABLES);
    expect(missing).toContain("debug_run_items");
    expect(missing).toContain("debug_kis_calls");
  });

  it("probes every required operational column, including the normalized RSS summary", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const pool = {
      async query(text: string, values?: unknown[]) {
        calls.push({ text, values });
        if (text === "SELECT 1") return { rows: [{ "?column?": 1 }] };
        if (text.includes("FROM information_schema.tables")) {
          return { rows: ((values?.[0] as string[]) ?? []).filter((table) => !RETIRED_SCHEMA_TABLES.includes(table as typeof RETIRED_SCHEMA_TABLES[number])).map((table_name) => ({ table_name })) };
        }
        if (text.includes("FROM information_schema.columns")) {
          return { rows: REQUIRED_OPERATIONAL_COLUMNS.map(([table_name, column_name]) => ({ table_name, column_name })) };
        }
        if (text.includes("flyway_schema_history")) return { rows: [{ version: "161" }] };
        return { rows: [] };
      },
    };

    const health = await inspectDatabaseSchema(pool as never);
    const columnProbe = calls.find(({ text }) => text.includes("FROM information_schema.columns"));
    expect(columnProbe?.text).toContain("unnest($1::text[], $2::text[])");
    expect(columnProbe?.values?.[0]).toContain("market_rss_articles");
    expect(columnProbe?.values?.[1]).toContain("normalized_summary");
    expect(health.schemaReady).toBe(true);
    expect(health.missingOperationalColumns).toEqual([]);
  });
});
