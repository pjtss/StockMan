import { describe, expect, it } from "vitest";
import { isValidCompactCalendarDate, isValidCompactCalendarDateRange, isValidIsoCalendarDate } from "./calendar-date-quality.mjs";

describe("calendar date validation across year boundaries", () => {
  it("accepts valid four-digit years below 0100", () => {
    expect(isValidCompactCalendarDate("00010101")).toBe(true);
    expect(isValidIsoCalendarDate("0001-01-01")).toBe(true);
    expect(isValidCompactCalendarDate("00960229")).toBe(true);
    expect(isValidIsoCalendarDate("0096-02-29")).toBe(true);
  });

  it("rejects impossible dates, invalid leap days, and year zero", () => {
    expect(isValidCompactCalendarDate("00990229")).toBe(false);
    expect(isValidCompactCalendarDate("00000229")).toBe(false);
    expect(isValidIsoCalendarDate("0099-02-29")).toBe(false);
    expect(isValidIsoCalendarDate("2026-02-30")).toBe(false);
    expect(isValidCompactCalendarDate("20261301")).toBe(false);
    expect(isValidIsoCalendarDate("0000-01-01")).toBe(false);
    expect(isValidIsoCalendarDate("2026-2-03")).toBe(false);
    expect(isValidIsoCalendarDate(null)).toBe(false);
    expect(isValidCompactCalendarDate(20260101)).toBe(false);
  });

  it("accepts only ordered ranges whose endpoints are real calendar dates", () => {
    expect(isValidCompactCalendarDateRange("20260228", "20260301")).toBe(true);
    expect(isValidCompactCalendarDateRange("20260301", "20260228")).toBe(false);
    expect(isValidCompactCalendarDateRange("20260230", "20260301")).toBe(false);
    expect(isValidCompactCalendarDateRange("20260228", "20261301")).toBe(false);
  });
});
