import { describe, expect, it } from "vitest";
import { CORE_SCHEMA_TABLES, OPERATIONAL_SCHEMA_TABLES, getMissingSchemaTables } from "./schema-health";

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

  it("treats the investment calendar table as an operational dependency", () => {
    expect(OPERATIONAL_SCHEMA_TABLES).toContain("investment_calendar_events");
    expect(getMissingSchemaTables(["automation_runs"], OPERATIONAL_SCHEMA_TABLES)).toContain("investment_calendar_events");
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
});
