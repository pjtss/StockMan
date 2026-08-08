import { loadScannerSchedules } from "./scanner-schedules";
import { isWithinSchedule } from "./schedule-time";
import { loadFeatureModuleSettings } from "./feature-module-settings";

export async function isDomesticScannerOpen(now = new Date()): Promise<boolean> {
  const schedules = await loadScannerSchedules();
  return isWithinSchedule(schedules.domestic_trading_intensity, now);
}

export async function isUsScannerOpen(now = new Date()): Promise<boolean> {
  try { return isWithinSchedule(await loadFeatureModuleSettings("us-scanners"), now); } catch { return isWithinSchedule({ startTime: "17:00", endTime: "02:00" }, now); }
}

export async function isUsTopRisingOpen(now = new Date()): Promise<boolean> {
  try { return isWithinSchedule(await loadFeatureModuleSettings("us-scanners"), now); } catch { return isWithinSchedule({ startTime: "17:00", endTime: "02:00" }, now); }
}

export async function isUsTurnoverRatioOpen(now = new Date()): Promise<boolean> {
  try { return isWithinSchedule(await loadFeatureModuleSettings("us-turnover-ratio"), now); } catch { return isWithinSchedule({ startTime: "17:00", endTime: "02:00" }, now); }
}

export async function isDartOpen(now = new Date()): Promise<boolean> {
  try { return isWithinSchedule(await loadFeatureModuleSettings("dart-realtime"), now); } catch { return isWithinSchedule({ startTime: "00:00", endTime: "23:59" }, now); }
}
