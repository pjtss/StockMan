import { isWithinSchedule } from "./schedule-time";
import type { CommonModuleSettings } from "./feature-module-settings";

export function kstDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function getSecCompanyFactsScheduleDecision(
  settings: CommonModuleSettings,
  latest: { status: string; started_at: string } | null,
  now = new Date(),
) {
  if (!settings.enabled) return { run: false, reason: "disabled" } as const;
  if (!isWithinSchedule(settings, now)) return { run: false, reason: "outside_schedule" } as const;
  if (latest?.status === "SUCCESS" && kstDateKey(new Date(latest.started_at)) === kstDateKey(now)) {
    return { run: false, reason: "already_succeeded_today" } as const;
  }
  return { run: true, reason: "due" } as const;
}
