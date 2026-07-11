import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { featureFlags } from "@/lib/schema";

export type AdminFeatureKey =
  | "dart_realtime"
  | "sec_realtime"
  | "us_scanners"
  | "us_turnover_trend";

export const ADMIN_FEATURES: Array<{ key: AdminFeatureKey; label: string; description: string }> = [
  {
    key: "dart_realtime",
    label: "DART 공시 자동화",
    description: "OpenDART 전체 페이지 수집, Web Push, 전용 Discord 전송",
  },
  { key: "sec_realtime", label: "SEC 공시 자동화", description: "원문 수집, AI 평가, Discord 전송 스케줄러" },
  { key: "us_scanners", label: "미국 스캐너", description: "미국 체결강도/상승률 스캐너" },
  { key: "us_turnover_trend", label: "해외 거래대금 추이", description: "해외주식 거래대금 추이 페이지" },
];

export async function loadAdminFeatureFlags(): Promise<Record<AdminFeatureKey, boolean>> {
  const defaults: Record<AdminFeatureKey, boolean> = {
    dart_realtime: true,
    sec_realtime: false,
    us_scanners: true,
    us_turnover_trend: true,
  };

  const db = getDb();
  if (!db) return defaults;

  const rows = await db.select().from(featureFlags);
  for (const row of rows) {
    if ((row.key as AdminFeatureKey) in defaults) {
      defaults[row.key as AdminFeatureKey] = row.enabled;
    }
  }
  return defaults;
}

export async function setAdminFeatureFlag(key: AdminFeatureKey, enabled: boolean) {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");

  await db.insert(featureFlags)
    .values({ key, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { enabled, updatedAt: new Date() },
    });
}
