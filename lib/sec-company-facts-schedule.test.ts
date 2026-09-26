import { describe, expect, it } from "vitest";
import { getSecCompanyFactsScheduleDecision, kstDateKey } from "./sec-company-facts-schedule";

const settings = { enabled: true, startTime: "08:00", endTime: "08:10", activeDays: [0, 1, 2, 3, 4, 5, 6] };

describe("SEC Company Facts daily KST schedule", () => {
  it("uses KST date and runs inside the configured 08:00 window", () => {
    expect(kstDateKey(new Date("2026-09-25T23:00:00.000Z"))).toBe("2026-09-26");
    expect(getSecCompanyFactsScheduleDecision(settings, null, new Date("2026-09-25T23:00:00.000Z"))).toMatchObject({ run: true });
    expect(getSecCompanyFactsScheduleDecision(settings, null, new Date("2026-09-25T23:10:00.000Z"))).toMatchObject({ run: false, reason: "outside_schedule" });
  });

  it("runs every calendar day, skips only a successful same-KST-day run, and retries failures", () => {
    const todayRun = { status: "SUCCESS", started_at: "2026-09-25T23:01:00.000Z" };
    const now = new Date("2026-09-25T23:05:00.000Z");
    expect(getSecCompanyFactsScheduleDecision(settings, todayRun, now)).toMatchObject({ run: false, reason: "already_succeeded_today" });
    expect(getSecCompanyFactsScheduleDecision(settings, { ...todayRun, status: "FAILED" }, now)).toMatchObject({ run: true });
    expect(getSecCompanyFactsScheduleDecision(settings, { ...todayRun, started_at: "2026-09-24T23:01:00.000Z" }, now)).toMatchObject({ run: true });
  });

  it("honors the module enable switch", () => {
    expect(getSecCompanyFactsScheduleDecision({ ...settings, enabled: false }, null, new Date("2026-09-25T23:00:00.000Z"))).toMatchObject({ run: false, reason: "disabled" });
  });
});
