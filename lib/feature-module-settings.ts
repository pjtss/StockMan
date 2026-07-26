import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { featureModuleSettings } from "@/lib/schema";
import { getFeatureModule, type FeatureModuleKey } from "@/lib/feature-modules";

export type CommonModuleSettings = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  cooldownSeconds: number;
  updatedAt?: string;
};

const defaultsByModule: Record<FeatureModuleKey, CommonModuleSettings> = {
  "dart-realtime": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60 },
  "sec-realtime": { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60 },
  "us-scanners": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60 },
  "us-turnover-trend": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60 },
  "us-turnover-ratio": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60 },
  "us-short-borrow": { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60 },
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
  const db = getDb();
  const updatedAt = new Date();
  await db.insert(featureModuleSettings).values({ moduleKey: key, settings, updatedAt }).onConflictDoUpdate({ target: featureModuleSettings.moduleKey, set: { settings, updatedAt } });
  return { ...settings, updatedAt: updatedAt.toISOString() };
}
