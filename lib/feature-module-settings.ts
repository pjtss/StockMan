import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { featureModuleSettings } from "@/lib/schema";
import { getFeatureModule, type FeatureModuleKey, type FeatureSpecificSettings } from "@/lib/feature-modules";
import type { ShortBorrowScorePolicy } from "@/lib/short-borrow-policy";

export type CommonModuleSettings = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  cooldownSeconds: number;
  activeDays: number[];
  updatedAt?: string;
  featureSettings?: FeatureSpecificSettings & { shortBorrowPolicy?: Partial<ShortBorrowScorePolicy> };
};

const defaultsByModule: Record<FeatureModuleKey, CommonModuleSettings> = {
  "dart-realtime": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "sec-realtime": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "us-scanners": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "us-turnover-trend": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "us-turnover-ratio": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "us-vwap": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5], featureSettings: { vwapPolicy: { minAbovePercent: 0, minVolume: 0, minTradeValue: 0, minPointCount: 1, requireComplete: true } } },
  "us-short-borrow": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "us-news-radar": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
  "us-breaking-news-forwarder": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] },
};

export async function loadFeatureModuleSettings(key: FeatureModuleKey): Promise<CommonModuleSettings> {
  if (!getFeatureModule(key)) throw new Error("FEATURE_MODULE_NOT_FOUND");
  const db = getDb();
  const rows = await db.select().from(featureModuleSettings).where(eq(featureModuleSettings.moduleKey, key)).limit(1);
  return { ...defaultsByModule[key], ...((rows[0]?.settings || {}) as Partial<CommonModuleSettings>), updatedAt: rows[0]?.updatedAt?.toISOString() };
}

export async function saveFeatureModuleSettings(key: FeatureModuleKey, settings: CommonModuleSettings) {
  if (!getFeatureModule(key)) throw new Error("FEATURE_MODULE_NOT_FOUND");
  if (!/^\d{2}:\d{2}$/.test(settings.startTime) || !/^\d{2}:\d{2}$/.test(settings.endTime)) throw new Error("INVALID_SCHEDULE");
  if (!Number.isInteger(settings.cooldownSeconds) || settings.cooldownSeconds < 0) throw new Error("INVALID_COOLDOWN");
  if (!Array.isArray(settings.activeDays) || settings.activeDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("INVALID_ACTIVE_DAYS");
  const db = getDb();
  const updatedAt = new Date();
  const existing = await db.select().from(featureModuleSettings).where(eq(featureModuleSettings.moduleKey, key)).limit(1);
  const merged = { ...(existing[0]?.settings || {}), ...settings };
  await db.insert(featureModuleSettings).values({ moduleKey: key, settings: merged, updatedAt }).onConflictDoUpdate({ target: featureModuleSettings.moduleKey, set: { settings: merged, updatedAt } });
  return { ...settings, updatedAt: updatedAt.toISOString() };
}
