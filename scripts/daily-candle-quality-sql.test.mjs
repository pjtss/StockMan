import { describe, expect, it } from "vitest";
import { isCalendarDate, validDailyCandleSql } from "./daily-candle-quality-sql.mjs";

describe("daily candle sync input quality", () => {
  it("accepts valid ISO calendar days and leap days only", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2026-12-31")).toBe(true);
    expect(isCalendarDate("2023-02-29")).toBe(false);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("0000-01-01")).toBe(false);
    expect(isCalendarDate("2026-1-01")).toBe(false);
  });

  it("qualifies an SQL source alias and rejects injection strings", () => {
    expect(validDailyCandleSql("c")).toContain("c.high >= GREATEST(c.open, c.low, c.close)");
    expect(() => validDailyCandleSql("c; DROP TABLE x")).toThrow("INVALID_CANDLE_SQL_ALIAS");
  });
});
