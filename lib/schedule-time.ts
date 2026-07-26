export type TimeWindow = { startTime: string; endTime: string; activeDays?: number[] };

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

export function isWithinSchedule(schedule: TimeWindow, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  const current = hour * 60 + minute;
  if (schedule.activeDays && !schedule.activeDays.includes(Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short" }).format(now).replace(/^Sun$/, "0").replace(/^Mon$/, "1").replace(/^Tue$/, "2").replace(/^Wed$/, "3").replace(/^Thu$/, "4").replace(/^Fri$/, "5").replace(/^Sat$/, "6")))) return false;
  const start = toMinutes(schedule.startTime);
  const end = toMinutes(schedule.endTime);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}
