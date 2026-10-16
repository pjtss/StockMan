import { describe, expect, it } from "vitest";
import { isValidCalendarDate } from "./calendar-date";

describe("isValidCalendarDate", () => {
  it("uses Gregorian leap-year rules and rejects impossible values", () => {
    expect(isValidCalendarDate("2000-02-29")).toBe(true);
    expect(isValidCalendarDate("2024-02-29")).toBe(true);
    expect(isValidCalendarDate("1900-02-29")).toBe(false);
    expect(isValidCalendarDate("2026-02-29")).toBe(false);
    expect(isValidCalendarDate("2026-04-31")).toBe(false);
  });

  it("requires strict ISO syntax and a supported year", () => {
    for (const value of ["2026-1-01", "2026-01-1", "0000-01-01", "2026/01/01", "2026-00-10"]) {
      expect(isValidCalendarDate(value)).toBe(false);
    }
  });
});
