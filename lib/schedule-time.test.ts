import { describe, expect, it } from "vitest";
import { isWithinSchedule } from "./schedule-time";

describe("isWithinSchedule", () => {
  it("evaluates a same-day KST window", () => {
    const nineAmKst = new Date("2026-07-11T00:00:00.000Z");
    expect(isWithinSchedule({ startTime: "08:00", endTime: "15:30" }, nineAmKst)).toBe(true);
  });

  it("evaluates a KST window that crosses midnight", () => {
    const oneAmKst = new Date("2026-07-10T16:00:00.000Z");
    expect(isWithinSchedule({ startTime: "17:00", endTime: "02:00" }, oneAmKst)).toBe(true);
  });

  it("treats the end time as exclusive", () => {
    const twoAmKst = new Date("2026-07-10T17:00:00.000Z");
    expect(isWithinSchedule({ startTime: "17:00", endTime: "02:00" }, twoAmKst)).toBe(false);
  });
});
