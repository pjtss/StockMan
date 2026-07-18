import { getDb } from "@/lib/db";
import { scannerSchedules, scannerScheduleHistory } from "@/lib/schema";
export { isWithinSchedule } from "./schedule-time";

export type ScannerScheduleKey = "dart" | "us_trading_intensity" | "domestic_trading_intensity" | "us_top_rising" | "us_turnover_ratio" | "us_turnover_watch";

export type ScannerSchedule = { startTime: string; endTime: string };

export const DEFAULT_SCANNER_SCHEDULES: Record<ScannerScheduleKey, ScannerSchedule> = {
  dart: { startTime: "00:00", endTime: "23:59" },
  us_trading_intensity: { startTime: "17:00", endTime: "02:00" },
  domestic_trading_intensity: { startTime: "08:00", endTime: "15:30" },
  us_top_rising: { startTime: "17:00", endTime: "02:00" },
  us_turnover_ratio: { startTime: "17:00", endTime: "02:00" },
  us_turnover_watch: { startTime: "17:00", endTime: "02:00" },
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
  await db.insert(scannerScheduleHistory).values({
    key,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    updatedAt: new Date(),
  });
}
