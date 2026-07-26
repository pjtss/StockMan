export type FeatureModuleKey = "dart-realtime" | "sec-realtime" | "us-scanners" | "us-turnover-trend" | "us-turnover-ratio" | "us-short-borrow";

export type FeatureModuleDefinition = {
  key: FeatureModuleKey;
  label: string;
  description: string;
  legacyFlag?: string;
  legacySchedule?: string;
  settingsPath: string;
};

export const FEATURE_MODULES: FeatureModuleDefinition[] = [
  { key: "dart-realtime", label: "DART 공시 자동화", description: "OpenDART 수집·평가·알림", legacyFlag: "dart_realtime", legacySchedule: "dart", settingsPath: "/admin/modules/dart-realtime" },
  { key: "sec-realtime", label: "SEC 공시 자동화", description: "SEC 원문 수집·평가·알림", legacyFlag: "sec_realtime", settingsPath: "/admin/modules/sec-realtime" },
  { key: "us-scanners", label: "미국 스캐너", description: "미국 상승률·체결강도 스캐너", legacyFlag: "us_scanners", settingsPath: "/admin/modules/us-scanners" },
  { key: "us-turnover-trend", label: "해외 거래대금 추이", description: "해외주식 거래대금 추이", legacyFlag: "us_turnover_trend", settingsPath: "/admin/modules/us-turnover-trend" },
  { key: "us-turnover-ratio", label: "시총 대비 거래대금", description: "시총 대비 거래대금 필터·알림", legacyFlag: "us_turnover_ratio", legacySchedule: "us_turnover_ratio", settingsPath: "/admin/modules/us-turnover-ratio" },
  { key: "us-short-borrow", label: "공매도 대차 압박", description: "Alpaca 계정별 대차·Locate 상태", settingsPath: "/admin/modules/us-short-borrow" },
];

export function getFeatureModule(key: string) {
  return FEATURE_MODULES.find((module) => module.key === key);
}
