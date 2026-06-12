import { getDb } from "@/lib/db";
import { scannerSchedules } from "@/lib/schema";

export type ScannerScheduleKey = "dart" | "us_trading_intensity" | "domestic_trading_intensity" | "us_top_rising";

export type ScannerSchedule = { startTime: string; endTime: string };

export const DEFAULT_SCANNER_SCHEDULES: Record<ScannerScheduleKey, ScannerSchedule> = {
  dart: { startTime: "00:00", endTime: "23:59" },
  us_trading_intensity: { startTime: "17:00", endTime: "02:00" },
  domestic_trading_intensity: { startTime: "08:00", endTime: "15:30" },
  us_top_rising: { startTime: "17:00", endTime: "02:00" },
};

export async function loadScannerSchedules(): Promise<Record<ScannerScheduleKey, ScannerSchedule>> {
  const schedules = { ...DEFAULT_SCANNER_SCHEDULES };
  const db = getDb();
  if (!db) return schedules;

  const rows = await db.select().from(scannerSchedules);
  for (const row of rows) {
    if (row.key in schedules) {
      schedules[row.key as ScannerScheduleKey] = {
        startTime: row.startTime,
        endTime: row.endTime,
      };
    }
  }
  return schedules;
}

export async function saveScannerSchedule(key: ScannerScheduleKey, schedule: ScannerSchedule) {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  await db.insert(scannerSchedules)
    .values({ key, startTime: schedule.startTime, endTime: schedule.endTime, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: scannerSchedules.key,
      set: { startTime: schedule.startTime, endTime: schedule.endTime, updatedAt: new Date() },
    });
}

function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function isWithinSchedule(schedule: ScannerSchedule, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  const current = hour * 60 + minute;
  const start = toMinutes(schedule.startTime);
  const end = toMinutes(schedule.endTime);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}
