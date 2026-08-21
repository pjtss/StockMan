/** Runtime keys may include retired compatibility callers; only keys in
 * FEATURE_MODULES are exposed or accepted by the admin registry. */
export type FeatureModuleKey = string;

/** Feature-specific settings never share the common ON/OFF/schedule contract. */
export type FeatureSpecificSettings = {
  kisRequest?: Record<string, string | number | boolean>;
  turnoverFilter?: Record<string, string | number | boolean>;
  evaluation?: Record<string, string | number | boolean>;
  goldenCrossPolicy?: Record<string, string | number | boolean>;
  discordFormat?: Record<string, string | number | boolean>;
  automationCompletion?: { enabled?: boolean; webhookUrl?: string };
  marketRss?: { enabledSources?: string[] };
  secEdgar?: { ciks?: string[]; syncXbrl?: boolean; discordBatch?: number };
  bollingerPolicy?: { timeframe?: "D" | "W" | "M"; period: number; stdDevMultiplier: number; minPrice: number; minVolume: number; minTurnoverRatio: number; zone?: "LOWER_OR_BELOW" | "MIDDLE_TO_LOWER"; requireObvAdlSignal?: boolean; obvSignalPeriod?: number; adlSignalPeriod?: number; reboundAfterBreakout?: boolean; reboundLookback?: number; reboundTolerancePercent?: number };
  krBollingerPolicy?: { timeframe?: "D" | "W" | "M"; period: number; stdDevMultiplier: number; minPrice: number; minVolume: number; minTurnoverRatio: number; zone?: "LOWER_OR_BELOW" | "MIDDLE_TO_LOWER"; requireObvAdlSignal?: boolean; obvSignalPeriod?: number; adlSignalPeriod?: number; reboundAfterBreakout?: boolean; reboundLookback?: number; reboundTolerancePercent?: number };
  newsLookup?: { defaultPeriod: "today" | "3d" | "7d" | "1m" };
  minuteBollingerPolicy?: { topN: number; period: number; stdDevMultiplier: number; minChangeRate: number };
  minuteObvAdlPolicy?: { topN: number; obvSignalPeriod: number; adlSignalPeriod: number; requireRisingSignals: boolean; minChangeRate: number };
};

export type FeatureModuleDefinition = {
  key: FeatureModuleKey;
  label: string;
  description: string;
  settingsPath: string;
  /** Whether the module is invoked by the OCI cron pipeline. */
  scheduler: "OCI_CRON" | "OPTIONAL_CRON" | "NOT_SCHEDULED";
};

export const FEATURE_MODULES: FeatureModuleDefinition[] = [
  { key: "instrument-fundamentals", label: "종목 기본정보 갱신", description: "국내·해외 유니버스의 현재가·거래량·거래대금·시가총액 기본정보를 하루 1회 저장", settingsPath: "/admin/modules/instrument-fundamentals", scheduler: "OCI_CRON" },
  { key: "dart-realtime", label: "DART 공시 자동화", description: "OpenDART 수집·평가·알림", settingsPath: "/admin/modules/dart-realtime", scheduler: "OCI_CRON" },
  { key: "sec-realtime", label: "SEC Submissions 자동화", description: "CIK 기반 SEC Submissions·Form/Item·XBRL 수집·알림", settingsPath: "/admin/modules/sec-realtime", scheduler: "OCI_CRON" },
  { key: "sec-edgar", label: "SEC EDGAR RSS 자동화", description: "SEC EDGAR RSS 수집·분류·알림", settingsPath: "/admin/modules/sec-edgar", scheduler: "OCI_CRON" },
  { key: "market-rss", label: "시장 RSS 통합", description: "SEC EDGAR·StockTitan·시장 RSS 수집·번역·알림", settingsPath: "/admin/modules/market-rss", scheduler: "OCI_CRON" },
  { key: "us-scanners", label: "미국 스캐너", description: "미국 상승률·체결강도 스캐너", settingsPath: "/admin/modules/us-scanners", scheduler: "NOT_SCHEDULED" },
  { key: "domestic-trade-intensity", label: "국내 체결강도", description: "국내 주식 체결강도 스캐너", settingsPath: "/admin/modules/domestic-trade-intensity", scheduler: "NOT_SCHEDULED" },
  { key: "us-bollinger-band", label: "일봉 볼린저밴드 하단 이탈", description: "해외 유니버스의 최신 저장 일봉(당일 포함) 저가가 볼린저밴드 하단 이하인 종목 탐지", settingsPath: "/admin/modules/us-bollinger-band", scheduler: "OCI_CRON" },
  { key: "us-bollinger-middle-lower", label: "일봉 볼린저밴드 중단선~하단선", description: "해외 유니버스의 최신 저장 일봉 종가가 중단선과 하단선 사이인 종목 탐지", settingsPath: "/admin/modules/us-bollinger-middle-lower", scheduler: "OCI_CRON" },
  { key: "us-golden-cross", label: "해외 일봉 골든크로스", description: "해외 보통주의 일봉 9일 단순이동평균이 20일선을 상향 돌파하는 종목 탐지", settingsPath: "/admin/modules/us-golden-cross", scheduler: "OCI_CRON" },
  { key: "us-minute-bollinger-band", label: "1분봉 볼린저밴드 하단", description: "상승률 TOP 종목의 KIS 1분봉 종가가 볼린저밴드 하단 이하인 종목 탐지", settingsPath: "/admin/modules/us-minute-bollinger-band", scheduler: "OCI_CRON" },
  { key: "us-minute-obv-adl", label: "1분봉 OBV·ADL 상승", description: "해외 상승률 TOP 종목의 1분봉 OBV·ADL이 Signal보다 높은 종목 탐지", settingsPath: "/admin/modules/us-minute-obv-adl", scheduler: "OCI_CRON" },
  { key: "us-daily-indicators", label: "해외 일봉 지표", description: "해외 일봉 MFI·MACD·DMI·OBV·ADL 지표 탐지", settingsPath: "/admin/modules/us-daily-indicators", scheduler: "OCI_CRON" },
  { key: "kr-bollinger-band", label: "국내 일봉 볼린저밴드 하단 이탈", description: "국내 유니버스의 일봉 종가가 볼린저밴드 하단 이하인 종목 탐지", settingsPath: "/admin/modules/kr-bollinger-band", scheduler: "OCI_CRON" },
  { key: "kr-bollinger-middle-lower", label: "국내 일봉 볼린저밴드 중단선~하단선", description: "국내 유니버스의 최신 저장 일봉 종가가 중단선과 하단선 사이인 종목 탐지", settingsPath: "/admin/modules/kr-bollinger-middle-lower", scheduler: "OCI_CRON" },
  { key: "kr-golden-cross", label: "국내 일봉 골든크로스", description: "국내 보통주의 일봉 9일 단순이동평균이 20일선을 상향 돌파하는 종목 탐지", settingsPath: "/admin/modules/kr-golden-cross", scheduler: "OCI_CRON" },
  { key: "kr-daily-cache", label: "국내 일봉 캐시 갱신", description: "KIS 국내 유니버스·일봉·시세 지표 DB 갱신", settingsPath: "/admin/modules/kr-daily-cache", scheduler: "OCI_CRON" },
  { key: "us-breaking-news-forwarder", label: "해외 속보 Discord 전달", description: "KIS 해외 속보 원문을 별도 Discord 채널로 전달", settingsPath: "/admin/modules/us-breaking-news-forwarder", scheduler: "OCI_CRON" },
  { key: "us-daily-cache", label: "일봉 캐시 갱신", description: "미국 일봉 데이터 DB 갱신", settingsPath: "/admin/modules/us-daily-cache", scheduler: "OCI_CRON" },
  { key: "us-daily-open-cache", label: "당일 시가 갱신", description: "미국 현재 세션 시가를 DB에 1시간마다 갱신", settingsPath: "/admin/modules/us-daily-open-cache", scheduler: "OCI_CRON" },
  { key: "us-daily-breakout", label: "일봉 돌파 자동화", description: "최근 고가 돌파 후보 탐지·알림", settingsPath: "/admin/modules/us-daily-breakout", scheduler: "OCI_CRON" },
  { key: "discord-delivery-retry", label: "Discord 재전송", description: "실패한 Discord 알림 재전송", settingsPath: "/admin/modules/discord-delivery-retry", scheduler: "OCI_CRON" },
];

export function getFeatureModule(key: string) {
  return FEATURE_MODULES.find((module) => module.key === key);
}
