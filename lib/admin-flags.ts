import { loadFeatureModuleSettings, saveFeatureModuleSettings } from "@/lib/feature-module-settings";
import type { FeatureModuleKey } from "@/lib/feature-modules";

export type AdminFeatureKey =
  | "dart_realtime"
  | "sec_realtime"
  | "us_scanners"
  | "us_turnover_trend"
  | "us_turnover_ratio";

export const ADMIN_FEATURES: Array<{ key: AdminFeatureKey; label: string; description: string }> = [
  {
    key: "dart_realtime",
    label: "DART 공시 자동화",
    description: "OpenDART 전체 페이지 수집, Web Push, 전용 Discord 전송",
  },
  { key: "sec_realtime", label: "SEC 공시 자동화", description: "원문 수집, AI 평가, Discord 전송 스케줄러" },
  { key: "us_scanners", label: "미국 스캐너", description: "미국 체결강도/상승률 스캐너" },
  { key: "us_turnover_trend", label: "해외 거래대금 추이", description: "해외주식 거래대금 추이 페이지" },
  { key: "us_turnover_ratio", label: "시총 대비 거래대금 스캐너", description: "미국 상승률 TOP 100 중 시총 대비 거래대금 1~10% 종목" },
];

export async function loadAdminFeatureFlags(): Promise<Record<AdminFeatureKey, boolean>> {
  const defaults: Record<AdminFeatureKey, boolean> = {
    dart_realtime: true,
    sec_realtime: false,
    us_scanners: true,
    us_turnover_trend: true,
    us_turnover_ratio: true,
  };

  const moduleByLegacyKey: Record<AdminFeatureKey, FeatureModuleKey> = {
    dart_realtime: "dart-realtime",
    sec_realtime: "sec-realtime",
    us_scanners: "us-scanners",
    us_turnover_trend: "us-turnover-trend",
    us_turnover_ratio: "us-turnover-ratio",
  };
  await Promise.all(Object.entries(moduleByLegacyKey).map(async ([legacyKey, moduleKey]) => {
    try { defaults[legacyKey as AdminFeatureKey] = (await loadFeatureModuleSettings(moduleKey)).enabled; } catch { /* keep safe default */ }
  }));
  return defaults;
}

export async function setAdminFeatureFlag(key: AdminFeatureKey, enabled: boolean) {
  const moduleByLegacyKey: Record<AdminFeatureKey, FeatureModuleKey> = {
    dart_realtime: "dart-realtime",
    sec_realtime: "sec-realtime",
    us_scanners: "us-scanners",
    us_turnover_trend: "us-turnover-trend",
    us_turnover_ratio: "us-turnover-ratio",
  };
  const moduleKey = moduleByLegacyKey[key];
  if (!moduleKey) throw new Error("Unknown feature flag");
  const current = await loadFeatureModuleSettings(moduleKey);
  await saveFeatureModuleSettings(moduleKey, { ...current, enabled });
}
