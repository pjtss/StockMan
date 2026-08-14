import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { featureModuleSettings } from "@/lib/schema";
import { getFeatureModule, type FeatureModuleKey, type FeatureSpecificSettings } from "@/lib/feature-modules";
import type { ShortBorrowScorePolicy } from "@/lib/short-borrow-policy";
import { MARKET_RSS_SOURCES } from "@/lib/market-rss-sources";

export type CommonModuleSettings = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  scheduleMode?: "daily-window" | "weekly-range";
  /** Optional weekly-range schedule. Omitted values keep the legacy activeDays behavior. */
  startDay?: number;
  endDay?: number;
  cooldownSeconds: number;
  intervalSeconds?: number;
  activeDays: number[];
  updatedAt?: string;
  featureSettings?: FeatureSpecificSettings & { shortBorrowPolicy?: Partial<ShortBorrowScorePolicy> };
};

const defaultsByModule: Record<FeatureModuleKey, CommonModuleSettings> = {
  "dart-realtime": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "sec-realtime": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "market-rss": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, intervalSeconds: 60, activeDays: [1, 2, 3, 4, 5, 6, 0], featureSettings: { marketRss: { enabledSources: [...MARKET_RSS_SOURCES] } } },
  "us-scanners": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, intervalSeconds: 30, activeDays: [1, 2, 3, 4, 5] },
  "domestic-trade-intensity": { enabled: true, startTime: "08:00", endTime: "15:30", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "us-turnover-trend": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "us-turnover-ratio": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "us-vwap": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5], featureSettings: { vwapPolicy: { minAbovePercent: 0, minVolume: 0, minTradeValue: 0, minPointCount: 1, minTurnoverRatio: 0, requireComplete: true } } },
  "us-bollinger-band": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, intervalSeconds: 600, activeDays: [1, 2, 3, 4, 5], featureSettings: { bollingerPolicy: { period: 20, stdDevMultiplier: 2, minPrice: 0, minVolume: 0, minTurnoverRatio: 0 } } },
  "us-minute-bollinger-band": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 120, intervalSeconds: 60, activeDays: [1, 2, 3, 4, 5], featureSettings: { minuteBollingerPolicy: { topN: 30, period: 20, stdDevMultiplier: 2, minChangeRate: 0 } } },
  "kr-bollinger-band": { enabled: true, startTime: "08:00", endTime: "15:30", cooldownSeconds: 60, intervalSeconds: 600, activeDays: [1, 2, 3, 4, 5], featureSettings: { krBollingerPolicy: { period: 20, stdDevMultiplier: 2, minPrice: 0, minVolume: 0, minTurnoverRatio: 0 } } },
  "kr-daily-cache": { enabled: true, startTime: "08:00", endTime: "15:30", cooldownSeconds: 60, intervalSeconds: 43_200, activeDays: [1, 2, 3, 4, 5] },
  "us-free-float": { enabled: true, startTime: "09:30", endTime: "10:00", cooldownSeconds: 60, intervalSeconds: 86_400, activeDays: [1, 2, 3, 4, 5] },
  "us-product-classification": { enabled: true, startTime: "09:00", endTime: "10:00", cooldownSeconds: 60, intervalSeconds: 86_400, activeDays: [1, 2, 3, 4, 5] },
  "us-short-borrow": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "us-news-radar": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5], featureSettings: { newsLookup: { defaultPeriod: "today" } } },
  "us-breaking-news-forwarder": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "us-daily-indicators": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, intervalSeconds: 600, activeDays: [1, 2, 3, 4, 5, 6], featureSettings: { evaluation: { mfiThreshold: 30, obvSignalPeriod: 9, obvSignalAboveDays: 3, obvSignalCrossLookback: 5, trendMinScore: 70, trendMinRvol: 1.5, trendMinMfi: 50, trendMaxMfi: 85, trendRequirePriceTrend: true, trendRequireDailyBreakout: true } } },
  "us-obv": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, intervalSeconds: 60, activeDays: [1, 2, 3, 4, 5, 6] },
  "us-daily-cache": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, intervalSeconds: 43_200, activeDays: [1, 2, 3, 4, 5] },
  "us-daily-open-cache": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, intervalSeconds: 3_600, activeDays: [1, 2, 3, 4, 5] },
  "us-daily-breakout": { enabled: true, startTime: "09:01", endTime: "09:02", cooldownSeconds: 60, intervalSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "us-trade-intensity": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5, 6] },
  "short-borrow": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "discord-delivery-retry": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5, 6, 0] },
};

export async function loadFeatureModuleSettings(key: FeatureModuleKey): Promise<CommonModuleSettings> {
  if (!getFeatureModule(key)) throw new Error("FEATURE_MODULE_NOT_FOUND");
  const db = getDb();
  const rows = await db.select().from(featureModuleSettings).where(eq(featureModuleSettings.moduleKey, key)).limit(1);
  const settings = { ...defaultsByModule[key], ...((rows[0]?.settings || {}) as Partial<CommonModuleSettings>) };
  return { ...settings, scheduleMode: settings.scheduleMode ?? "daily-window", updatedAt: rows[0]?.updatedAt?.toISOString() };
}

export async function saveFeatureModuleSettings(key: FeatureModuleKey, settings: CommonModuleSettings) {
  if (!getFeatureModule(key)) throw new Error("FEATURE_MODULE_NOT_FOUND");
  const validTime = (value: string) => {
    if (!/^\d{2}:\d{2}$/.test(value)) return false;
    const [hours, minutes] = value.split(":").map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  };
  if (!validTime(settings.startTime) || !validTime(settings.endTime)) throw new Error("INVALID_SCHEDULE");
  if (settings.scheduleMode !== undefined && settings.scheduleMode !== "daily-window" && settings.scheduleMode !== "weekly-range") throw new Error("INVALID_SCHEDULE_MODE");
  const hasStartDay = settings.startDay !== undefined;
  const hasEndDay = settings.endDay !== undefined;
  if (settings.scheduleMode === "weekly-range" && (!hasStartDay || !hasEndDay)) throw new Error("INVALID_SCHEDULE_DAYS");
  if (hasStartDay !== hasEndDay || (hasStartDay && (!Number.isInteger(settings.startDay) || !Number.isInteger(settings.endDay) || (settings.startDay as number) < 0 || (settings.startDay as number) > 6 || (settings.endDay as number) < 0 || (settings.endDay as number) > 6))) throw new Error("INVALID_SCHEDULE_DAYS");
  if (hasStartDay && settings.startDay === settings.endDay && settings.startTime === settings.endTime) throw new Error("INVALID_SCHEDULE_RANGE");
  if (!Number.isInteger(settings.cooldownSeconds) || settings.cooldownSeconds < 0) throw new Error("INVALID_COOLDOWN");
  const minuteScheduledModules: FeatureModuleKey[] = ["us-daily-indicators", "us-obv", "us-daily-cache", "us-daily-open-cache", "us-daily-breakout", "us-bollinger-band", "kr-bollinger-band", "kr-daily-cache"];
  const minimumIntervalSeconds = minuteScheduledModules.includes(key) ? 60 : 5;
  if (settings.intervalSeconds !== undefined && (!Number.isInteger(settings.intervalSeconds) || settings.intervalSeconds < minimumIntervalSeconds)) throw new Error("INVALID_INTERVAL");
  if (key === "us-daily-indicators") {
    const evaluation = settings.featureSettings?.evaluation;
    const validateInteger = (name: string, value: unknown, min: number, max: number) => {
      if (value === undefined) return;
      if (!Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new Error(`INVALID_${name.toUpperCase()}`);
    };
    validateInteger("obv_signal_period", evaluation?.obvSignalPeriod, 2, 100);
    validateInteger("obv_signal_above_days", evaluation?.obvSignalAboveDays, 1, 20);
    validateInteger("obv_signal_cross_lookback", evaluation?.obvSignalCrossLookback, 1, 30);
    const validateTrend = (name: string, value: unknown, min: number, max?: number) => {
      if (value === undefined) return;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < min || (max !== undefined && parsed > max)) throw new Error(`INVALID_${name.toUpperCase()}`);
    };
    validateTrend("trend_min_score", evaluation?.trendMinScore, 0, 100);
    validateTrend("trend_min_rvol", evaluation?.trendMinRvol, 0);
    validateTrend("trend_min_mfi", evaluation?.trendMinMfi, 0, 100);
    validateTrend("trend_max_mfi", evaluation?.trendMaxMfi, 0, 100);
    if (evaluation?.trendMinMfi !== undefined && evaluation?.trendMaxMfi !== undefined && Number(evaluation.trendMinMfi) > Number(evaluation.trendMaxMfi)) throw new Error("INVALID_TREND_MFI_RANGE");
    if (evaluation?.trendRequirePriceTrend !== undefined && typeof evaluation.trendRequirePriceTrend !== "boolean") throw new Error("INVALID_TREND_PRICE_POLICY");
    if (evaluation?.trendRequireDailyBreakout !== undefined && typeof evaluation.trendRequireDailyBreakout !== "boolean") throw new Error("INVALID_TREND_BREAKOUT_POLICY");
  }
  if (key === "us-bollinger-band") {
    const policy = settings.featureSettings?.bollingerPolicy;
    if (policy?.timeframe !== undefined && !["D", "W", "M"].includes(String(policy.timeframe))) throw new Error("INVALID_BOLLINGER_TIMEFRAME");
    const validateNumber = (name: string, value: unknown, min: number, max?: number) => {
      if (value === undefined) return;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < min || (max !== undefined && parsed > max)) throw new Error(`INVALID_${name.toUpperCase()}`);
    };
    validateNumber("bollinger_period", policy?.period, 2, 200);
    validateNumber("bollinger_multiplier", policy?.stdDevMultiplier, 0.1, 10);
    validateNumber("bollinger_min_price", policy?.minPrice, 0);
    validateNumber("bollinger_min_volume", policy?.minVolume, 0);
    validateNumber("bollinger_min_turnover_ratio", policy?.minTurnoverRatio, 0);
  }
  if (key === "kr-bollinger-band") {
    const policy = settings.featureSettings?.krBollingerPolicy;
    if (policy?.timeframe !== undefined && !["D", "W", "M"].includes(String(policy.timeframe))) throw new Error("INVALID_KR_BOLLINGER_TIMEFRAME");
    for (const [name, value, min, max] of [["period", policy?.period, 2, 200], ["multiplier", policy?.stdDevMultiplier, 0.1, 10], ["min_price", policy?.minPrice, 0, undefined], ["min_volume", policy?.minVolume, 0, undefined], ["min_turnover_ratio", policy?.minTurnoverRatio, 0, undefined]] as const) {
      if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < min || (max !== undefined && Number(value) > max))) throw new Error(`INVALID_KR_BOLLINGER_${name.toUpperCase()}`);
    }
  }
  if (key === "us-news-radar") {
    const period = settings.featureSettings?.newsLookup?.defaultPeriod;
    if (period !== undefined && !["today", "3d", "7d", "1m"].includes(period)) throw new Error("INVALID_NEWS_DEFAULT_PERIOD");
  }
  if (key === "us-minute-bollinger-band") {
    const policy = settings.featureSettings?.minuteBollingerPolicy;
    if (policy?.topN !== undefined && (!Number.isInteger(Number(policy.topN)) || Number(policy.topN) < 1 || Number(policy.topN) > 100)) throw new Error("INVALID_MINUTE_BOLLINGER_TOP_N");
    if (policy?.period !== undefined && (!Number.isInteger(Number(policy.period)) || Number(policy.period) < 2 || Number(policy.period) > 120)) throw new Error("INVALID_MINUTE_BOLLINGER_PERIOD");
    if (policy?.stdDevMultiplier !== undefined && (!Number.isFinite(Number(policy.stdDevMultiplier)) || Number(policy.stdDevMultiplier) <= 0)) throw new Error("INVALID_MINUTE_BOLLINGER_MULTIPLIER");
    if (policy?.minChangeRate !== undefined && !Number.isFinite(Number(policy.minChangeRate))) throw new Error("INVALID_MINUTE_BOLLINGER_RATE");
  }
  if (!Array.isArray(settings.activeDays) || settings.activeDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("INVALID_ACTIVE_DAYS");
  const db = getDb();
  const updatedAt = new Date();
  const existing = await db.select().from(featureModuleSettings).where(eq(featureModuleSettings.moduleKey, key)).limit(1);
  const merged = { ...(existing[0]?.settings || {}), ...settings };
  await db.insert(featureModuleSettings).values({ moduleKey: key, settings: merged, updatedAt }).onConflictDoUpdate({ target: featureModuleSettings.moduleKey, set: { settings: merged, updatedAt } });
  return { ...settings, updatedAt: updatedAt.toISOString() };
}
