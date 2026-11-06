import { describe, expect, it } from "vitest";
import { classifyStockmanEventError, eventIdentityForSec, eventRevisionHash, getStockmanEventTimeWindow, isStockmanEventWithinWindow, multiplyExactDecimalStrings, parseSecAcceptanceTimestamp, renderStockmanEventsMarkdown } from "./stockman-events";

describe("Stockman event identity, times, and exact metrics", () => {
  it("converts SEC Eastern acceptance wall time to UTC in standard and daylight time", () => {
    expect(parseSecAcceptanceTimestamp("20261106123456")?.toISOString()).toBe("2026-11-06T17:34:56.000Z");
    expect(parseSecAcceptanceTimestamp("20260706123456")?.toISOString()).toBe("2026-07-06T16:34:56.000Z");
  });

  it.each([null, undefined, "202611061234", "20260230123456", "not-a-date"])(
    "rejects malformed acceptance timestamp %s",
    (value) => expect(parseSecAcceptanceTimestamp(value)).toBeNull(),
  );

  it("normalizes SEC identity to the CIK plus accession natural key", () => {
    expect(eventIdentityForSec("12345", "0001234567-26-000001")).toBe("SEC:0000012345:0001234567-26-000001");
  });

  it.each([
    [{ code: "42P01" }, "SCHEMA_TABLE_MISSING"],
    [{ code: "42703" }, "SCHEMA_COLUMN_MISSING"],
    [{ code: "23505" }, "UNIQUE_CONFLICT"],
    [{ code: "23503" }, "FOREIGN_KEY_CONFLICT"],
    [{ code: "22P02" }, "INVALID_SOURCE_DATA"],
    [{ code: "08006" }, "DATABASE_UNAVAILABLE"],
    [{ message: "secret database connection details" }, "DATABASE_ERROR"],
  ])("maps persistence errors to a safe public code", (error, expected) => {
    expect(classifyStockmanEventError(error)).toBe(expected);
  });

  it("includes both exact 12-hour boundaries and excludes instants outside the window", () => {
    const asOf = new Date("2026-11-06T18:00:00.000Z");
    const window = getStockmanEventTimeWindow(asOf, 12);
    expect(window.from.toISOString()).toBe("2026-11-06T06:00:00.000Z");
    expect(isStockmanEventWithinWindow(window.from, window)).toBe(true);
    expect(isStockmanEventWithinWindow(window.to, window)).toBe(true);
    expect(isStockmanEventWithinWindow(new Date(window.from.getTime() - 1), window)).toBe(false);
    expect(isStockmanEventWithinWindow(new Date(window.to.getTime() + 1), window)).toBe(false);
  });

  it("creates a stable revision hash and changes it when an analysis changes", () => {
    const analysis = { grade: "B", evidence: ["official release"] };
    expect(eventRevisionHash(analysis)).toBe(eventRevisionHash(analysis));
    expect(eventRevisionHash(analysis)).not.toBe(eventRevisionHash({ ...analysis, grade: "A" }));
  });

  it.each([
    ["19.99", "0.0008", "0.015992"],
    ["12345678901234567890", "2", "24691357802469135780"],
    ["10.50", "2.0", "21"],
    ["-1.25", "4", "-5"],
  ])("multiplies exact decimals %s by %s", (left, right, expected) => {
    expect(multiplyExactDecimalStrings(left, right)).toBe(expected);
  });

  it("fails instead of rounding a product beyond the supported decimal scale", () => {
    expect(() => multiplyExactDecimalStrings("0.000000000001", "0.1")).toThrow(/scale/);
  });

  it("renders the provided verified items with KST labels", () => {
    const markdown = renderStockmanEventsMarkdown([{
      ticker: "ACME", title: "FDA approval", acceptedAt: "2026-11-06T17:34:56.000Z", eventType: "FDA",
      bullishGrade: "C", keyMetrics: { patients: null }, dilutionRisk: "UNKNOWN", verificationStatus: "VERIFIED",
      sourceUrl: "https://www.sec.gov/example", unknownFactors: ["Label details pending"],
    }], new Date("2026-11-06T17:35:00.000Z"));
    expect(markdown).toContain("ACME — FDA approval");
    expect(markdown).toContain("KST");
    expect(markdown).toContain("UNKNOWN");
    expect(markdown).toContain("https://www.sec.gov/example");
    expect(markdown).toContain("Label details pending");
  });
});
