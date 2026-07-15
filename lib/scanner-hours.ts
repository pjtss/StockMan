import { loadScannerSchedules } from "./scanner-schedules";
import { isWithinSchedule } from "./scanner-schedules";

export async function isDomesticScannerOpen(now = new Date()): Promise<boolean> {
  const schedules = await loadScannerSchedules();
  return isWithinSchedule(schedules.domestic_trading_intensity, now);
}

export async function isUsScannerOpen(now = new Date()): Promise<boolean> {
  const schedules = await loadScannerSchedules();
  return isWithinSchedule(schedules.us_trading_intensity, now);
}

export async function isUsTopRisingOpen(now = new Date()): Promise<boolean> {
  const schedules = await loadScannerSchedules();
  return isWithinSchedule(schedules.us_top_rising, now);
}

export async function isUsTurnoverRatioOpen(now = new Date()): Promise<boolean> {
  const schedules = await loadScannerSchedules();
  return isWithinSchedule(schedules.us_turnover_ratio, now);
}

export async function isDartOpen(now = new Date()): Promise<boolean> {
  const schedules = await loadScannerSchedules();
  return isWithinSchedule(schedules.dart, now);
}
