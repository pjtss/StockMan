/** Resolve a calendar date in KST to an inclusive-start/exclusive-end UTC range. */
export function kstDayBounds(value: string, afterTime?: string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("date must be YYYY-MM-DD");
  const dayStart = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(dayStart.getTime()) || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(dayStart) !== value) {
    throw new Error("invalid date");
  }
  const end = new Date(dayStart.getTime() + 86_400_000);
  if (afterTime == null || afterTime === "") return { start: dayStart, end };
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(afterTime)) throw new Error("afterTime must be HH:mm");
  const [hours, minutes] = afterTime.split(":").map(Number);
  const start = new Date(dayStart.getTime() + (hours * 60 + minutes) * 60_000);
  return { start, end };
}
