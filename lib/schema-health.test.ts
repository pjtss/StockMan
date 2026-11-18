import { describe, expect, it } from "vitest";
import { buildOperationalIndexIntegrityQuery, CORE_SCHEMA_TABLES, KIS_RATE_LIMIT_EVENT_COLUMN_SHAPES, OPERATIONAL_SCHEMA_TABLES, OPERATIONAL_SCHEMA_VIEWS, RETIRED_SCHEMA_TABLES, REQUIRED_OPERATIONAL_COLUMNS, getMissingSchemaTables, inspectDatabaseSchema } from "./schema-health";

describe("schema-health", () => {
  it("includes descending index key order in operational integrity checks", () => {
    const query = buildOperationalIndexIntegrityQuery();
    expect(query.text).toContain("pg_index_column_has_property(index_relation.oid, indexed_column.ordinal::int, 'desc')");
    expect(query.text).toContain("THEN ' DESC' ELSE '' END");
    expect(query.values[2]).toEqual(expect.arrayContaining([
      "occurred_at DESC",
      "endpoint, occurred_at DESC",
      "incident_id, occurred_at DESC",
    ]));
  });

  it("requires KIS retry/rate-limit telemetry tables for operational readiness", () => {
    expect(OPERATIONAL_SCHEMA_TABLES).toContain("debug_kis_calls");
    expect(OPERATIONAL_SCHEMA_TABLES).toContain("kis_rate_limit_events");
    expect(getMissingSchemaTables([], OPERATIONAL_SCHEMA_TABLES)).toEqual(expect.arrayContaining(["debug_kis_calls", "kis_rate_limit_events"]));
  });

  it("requires market impact event storage for operational readiness", () => {
    expect(OPERATIONAL_SCHEMA_TABLES).toContain("market_impact_events");
    expect(getMissingSchemaTables([], OPERATIONAL_SCHEMA_TABLES)).toContain("market_impact_events");
  });

  it("requires permanent Stockman event ledger tables for operational readiness", () => {
    expect(OPERATIONAL_SCHEMA_TABLES).toEqual(expect.arrayContaining([
      "stockman_events", "stockman_event_documents", "stockman_event_analyses", "stockman_event_history", "stockman_event_metrics",
    ]));
    expect(getMissingSchemaTables([], OPERATIONAL_SCHEMA_TABLES)).toEqual(expect.arrayContaining([
      "stockman_events", "stockman_event_documents", "stockman_event_analyses", "stockman_event_history", "stockman_event_metrics",
    ]));
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
        if (text.includes("FROM information_schema.columns")) {
          const required = REQUIRED_OPERATIONAL_COLUMNS.map(([table_name, column_name]) => ({ table_name, column_name, data_type: "text", is_nullable: "YES", column_default: null }));
          const eventShapes = KIS_RATE_LIMIT_EVENT_COLUMN_SHAPES.map(([column_name, data_type, is_nullable, hasDefault]) => ({
            table_name: "kis_rate_limit_events",
            column_name,
            data_type,
            is_nullable,
            column_default: hasDefault ? "nextval('kis_rate_limit_events_id_seq'::regclass)" : null,
          }));
          return { rows: [...required, ...eventShapes] };
        }
        if (text.startsWith("SELECT table_name FROM information_schema.tables")) {
          if (text.includes("table_type = 'VIEW'")) return { rows: OPERATIONAL_SCHEMA_VIEWS.map((table_name) => ({ table_name })) };
          if (text.includes("table_type = 'BASE TABLE'")) {
            const requiredTables = values?.[0] as string[];
            return { rows: requiredTables.filter((table) => !RETIRED_SCHEMA_TABLES.includes(table as typeof RETIRED_SCHEMA_TABLES[number])).map((table_name) => ({ table_name })) };
          }
          return { rows: [] };
        }
        if (text.includes("SELECT required.table_name, required.column_name")) return { rows: [] };
        if (text.includes("SELECT index_integrity.*")) return { rows: [] };
        if (text.includes("flyway_schema_history")) return { rows: [{ version: "161" }] };
        return { rows: [] };
      },
    };

    const health = await inspectDatabaseSchema(pool as never);
    expect(health).toMatchObject({
      schemaReady: true,
      missingOperationalTables: [],
      missingOperationalViews: [],
      missingOperationalColumns: [],
      operationalColumnShapeIssues: [],
      operationalPrimaryKeyIssues: [],
      operationalIndexIssues: [],
      retiredTablesPresent: [],
      flywayVersion: "161",
    });
    const columnProbe = calls.find(({ text }) => text.includes("FROM information_schema.columns"));
    expect(columnProbe?.text).toContain("available.column_name");
    expect(columnProbe?.values?.[0]).toContain("market_rss_articles");
    expect(REQUIRED_OPERATIONAL_COLUMNS).toContainEqual(["market_rss_articles", "normalized_summary"]);
    expect(health.schemaReady).toBe(true);
    expect(health.missingOperationalColumns).toEqual([]);
  });
});
