import { describe, expect, it } from "vitest";
import { createRssTimeWindow, parseRssHours } from "./rss-time-window";

describe("RSS hour window", () => {
  it("accepts each supported boundary and rejects invalid values", () => {
    expect(parseRssHours("1")).toBe(1);
    expect(parseRssHours("24")).toBe(24);
    for (const value of ["0", "25", "1.5", "abc", " 2"]) expect(Number.isNaN(parseRssHours(value)!)).toBe(true);
    expect(parseRssHours(null)).toBeNull();
  });

  it("creates a rolling window ending at the supplied instant", () => {
    const now = new Date("2026-10-07T03:00:00.000Z");
    const window = createRssTimeWindow(3, now);
    expect(window.start.toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(window.end.toISOString()).toBe(now.toISOString());
    expect(window.hours).toBe(3);
  });
});
