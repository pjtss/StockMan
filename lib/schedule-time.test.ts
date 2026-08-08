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

  it("blocks inactive weekdays", () => {
    const sunday = new Date("2026-07-26T00:00:00.000Z");
    expect(isWithinSchedule({ startTime: "00:00", endTime: "23:59", activeDays: [1, 2, 3, 4, 5] }, sunday)).toBe(false);
  });

  it("evaluates an explicit weekly range across days", () => {
    const mondayEvening = new Date("2026-07-13T09:00:00.000Z");
    const tuesdayMorning = new Date("2026-07-13T16:00:00.000Z");
    const tuesdayEnd = new Date("2026-07-14T17:00:00.000Z");
    const schedule = { scheduleMode: "weekly-range" as const, startDay: 1, startTime: "17:00", endDay: 2, endTime: "02:00" };
    expect(isWithinSchedule(schedule, mondayEvening)).toBe(true);
    expect(isWithinSchedule(schedule, tuesdayMorning)).toBe(true);
    expect(isWithinSchedule(schedule, tuesdayEnd)).toBe(false);
  });

  it("evaluates a weekly range that wraps from Friday to Monday", () => {
    const saturday = new Date("2026-07-11T03:00:00.000Z");
    const mondayBeforeEnd = new Date("2026-07-12T16:00:00.000Z");
    const mondayEnd = new Date("2026-07-12T17:00:00.000Z");
    const schedule = { scheduleMode: "weekly-range" as const, startDay: 5, startTime: "17:00", endDay: 1, endTime: "02:00" };
    expect(isWithinSchedule(schedule, saturday)).toBe(true);
    expect(isWithinSchedule(schedule, mondayBeforeEnd)).toBe(true);
    expect(isWithinSchedule(schedule, mondayEnd)).toBe(false);
  });
});
