import { describe, expect, it } from "vitest";
import { kstDayBounds } from "./kst-day-bounds";

describe("kstDayBounds", () => {
  it("maps a KST calendar day to a half-open UTC range", () => {
    const bounds = kstDayBounds("2026-09-25");

    expect(bounds.start.toISOString()).toBe("2026-09-24T15:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-09-25T15:00:00.000Z");
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(24 * 60 * 60 * 1_000);
  });

  it("starts an optional after-time filter at the exact KST minute", () => {
    const bounds = kstDayBounds("2026-09-25", "15:00");

    expect(bounds.start.toISOString()).toBe("2026-09-25T06:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-09-25T15:00:00.000Z");
  });

  it("keeps the final KST minute inside the selected day", () => {
    const bounds = kstDayBounds("2026-09-25", "23:59");

    expect(bounds.start.toISOString()).toBe("2026-09-25T14:59:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-09-25T15:00:00.000Z");
  });

  it.each(["24:00", "12:60", "9:00", "noon"]) ("rejects an invalid optional KST start time %s", (afterTime) => {
    expect(() => kstDayBounds("2026-09-25", afterTime)).toThrow("afterTime must be HH:mm");
  });
});
