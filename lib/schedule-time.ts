export type TimeWindow = { startTime: string; endTime: string; activeDays?: number[]; scheduleMode?: "daily-window" | "weekly-range"; startDay?: number; endDay?: number };

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function kstDayAndMinute(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value || "Sun";
  const day = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[weekday] ?? 0;
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  return { day, minute: hour * 60 + minute };
}

export function isWithinSchedule(schedule: TimeWindow, now = new Date()): boolean {
  const { day, minute } = kstDayAndMinute(now);
  const weeklyRange = schedule.scheduleMode === "weekly-range" || (schedule.scheduleMode === undefined && schedule.startDay !== undefined && schedule.endDay !== undefined);
  if (weeklyRange && schedule.startDay !== undefined && schedule.endDay !== undefined) {
    const start = schedule.startDay * MINUTES_PER_DAY + toMinutes(schedule.startTime);
    let end = schedule.endDay * MINUTES_PER_DAY + toMinutes(schedule.endTime);
    let current = day * MINUTES_PER_DAY + minute;
    if (end <= start) end += MINUTES_PER_WEEK;
    if (current < start) current += MINUTES_PER_WEEK;
    return current >= start && current < end;
  }
  const current = minute;
  if (schedule.activeDays && !schedule.activeDays.includes(day)) return false;
  const start = toMinutes(schedule.startTime);
  const end = toMinutes(schedule.endTime);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}
