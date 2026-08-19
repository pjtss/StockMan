import { isWithinSchedule } from "./schedule-time";
import { loadFeatureModuleSettings } from "./feature-module-settings";

export async function isDomesticScannerOpen(now = new Date()): Promise<boolean> {
  try { return isWithinSchedule(await loadFeatureModuleSettings("domestic-trade-intensity"), now); } catch { return isWithinSchedule({ startTime: "08:00", endTime: "15:30" }, now); }
}

export async function isUsScannerOpen(now = new Date()): Promise<boolean> {
  try { return isWithinSchedule(await loadFeatureModuleSettings("us-scanners"), now); } catch { return isWithinSchedule({ startTime: "17:00", endTime: "02:00" }, now); }
}

export async function isUsTopRisingOpen(now = new Date()): Promise<boolean> {
  try { return isWithinSchedule(await loadFeatureModuleSettings("us-scanners"), now); } catch { return isWithinSchedule({ startTime: "17:00", endTime: "02:00" }, now); }
}

export async function isDartOpen(now = new Date()): Promise<boolean> {
  try { return isWithinSchedule(await loadFeatureModuleSettings("dart-realtime"), now); } catch { return isWithinSchedule({ startTime: "00:00", endTime: "23:59" }, now); }
}
