export type FeatureModuleKey = "dart-realtime" | "sec-realtime" | "market-rss" | "us-scanners" | "us-turnover-trend" | "us-turnover-ratio" | "us-vwap" | "us-short-borrow" | "us-news-radar" | "us-breaking-news-forwarder" | "us-daily-indicators" | "us-obv" | "us-daily-cache" | "us-daily-breakout" | "us-trade-intensity" | "short-borrow" | "discord-delivery-retry";

/** Feature-specific settings never share the common ON/OFF/schedule contract. */
export type FeatureSpecificSettings = {
  kisRequest?: Record<string, string | number | boolean>;
  turnoverFilter?: Record<string, string | number | boolean>;
  shortBorrowPolicy?: Record<string, unknown>;
  evaluation?: Record<string, string | number | boolean>;
  discordFormat?: Record<string, string | number | boolean>;
  vwapPolicy?: { minAbovePercent: number; minVolume: number; minTradeValue: number; minPointCount: number; minTurnoverRatio: number; requireComplete: boolean };
};

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
  { key: "market-rss", label: "시장 RSS 통합", description: "SEC·StockTitan·시장 RSS 수집·번역·알림", settingsPath: "/admin/modules/market-rss" },
  { key: "us-scanners", label: "미국 스캐너", description: "미국 상승률·체결강도 스캐너", legacyFlag: "us_scanners", settingsPath: "/admin/modules/us-scanners" },
  { key: "us-turnover-trend", label: "해외 거래대금 추이", description: "해외주식 거래대금 추이", legacyFlag: "us_turnover_trend", settingsPath: "/admin/modules/us-turnover-trend" },
  { key: "us-turnover-ratio", label: "시총 대비 거래대금", description: "시총 대비 거래대금 필터·알림", legacyFlag: "us_turnover_ratio", legacySchedule: "us_turnover_ratio", settingsPath: "/admin/modules/us-turnover-ratio" },
  { key: "us-vwap", label: "당일 VWAP 상회", description: "당일 전체 세션 VWAP 상회 종목 탐지·Discord 알림", settingsPath: "/admin/modules/us-vwap" },
  { key: "us-short-borrow", label: "공매도 대차 압박", description: "Alpaca 계정별 대차·Locate 상태", settingsPath: "/admin/modules/us-short-borrow" },
  { key: "us-news-radar", label: "해외 뉴스 급등주 레이더", description: "KIS 해외속보·뉴스 검증 기반 후보 탐지", settingsPath: "/admin/modules/us-news-radar" },
  { key: "us-breaking-news-forwarder", label: "해외 속보 Discord 전달", description: "KIS 해외 속보 원문을 별도 Discord 채널로 전달", settingsPath: "/admin/modules/us-breaking-news-forwarder" },
  { key: "us-daily-indicators", label: "일봉 지표 알림", description: "MFI·DMI·MACD 일봉 후보 통합 알림", settingsPath: "/admin/modules/us-daily-indicators" },
  { key: "us-obv", label: "OBV 자동화", description: "미국 OBV 후보 탐지·알림", settingsPath: "/admin/modules/us-obv" },
  { key: "us-daily-cache", label: "일봉 캐시 갱신", description: "미국 일봉 데이터 DB 갱신", settingsPath: "/admin/modules/us-daily-cache" },
  { key: "us-daily-breakout", label: "일봉 돌파 자동화", description: "최근 고가 돌파 후보 탐지·알림", settingsPath: "/admin/modules/us-daily-breakout" },
  { key: "us-trade-intensity", label: "체결강도 자동화", description: "해외 체결강도 수집", settingsPath: "/admin/modules/us-trade-intensity" },
  { key: "short-borrow", label: "대차 데이터 수집", description: "공매도 대차 데이터 수집", settingsPath: "/admin/modules/short-borrow" },
  { key: "discord-delivery-retry", label: "Discord 재전송", description: "실패한 Discord 알림 재전송", settingsPath: "/admin/modules/discord-delivery-retry" },
];

export function getFeatureModule(key: string) {
  return FEATURE_MODULES.find((module) => module.key === key);
}
