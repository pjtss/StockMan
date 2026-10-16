import { describe, expect, it } from "vitest";
import { CORE_SCHEMA_TABLES, OPERATIONAL_SCHEMA_TABLES, getMissingSchemaTables } from "./schema-health";

describe("schema-health", () => {
  it("reports missing core tables", () => {
    expect(getMissingSchemaTables(["automation_runs"])).toContain("market_rss_articles");
    expect(getMissingSchemaTables([...CORE_SCHEMA_TABLES])).toEqual([]);
  });

  it("treats the investment calendar table as an operational dependency", () => {
    expect(OPERATIONAL_SCHEMA_TABLES).toContain("investment_calendar_events");
    expect(getMissingSchemaTables(["automation_runs"], OPERATIONAL_SCHEMA_TABLES)).toContain("investment_calendar_events");
  });
});
