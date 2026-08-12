export type FeatureModuleKey = "dart-realtime" | "sec-realtime" | "market-rss" | "us-scanners" | "domestic-trade-intensity" | "us-turnover-trend" | "us-turnover-ratio" | "us-vwap" | "us-bollinger-band" | "us-minute-bollinger-band" | "kr-bollinger-band" | "kr-daily-cache" | "us-free-float" | "us-product-classification" | "us-short-borrow" | "us-news-radar" | "us-breaking-news-forwarder" | "us-daily-indicators" | "us-obv" | "us-daily-cache" | "us-daily-open-cache" | "us-daily-breakout" | "us-trade-intensity" | "short-borrow" | "discord-delivery-retry";

/** Feature-specific settings never share the common ON/OFF/schedule contract. */
export type FeatureSpecificSettings = {
  kisRequest?: Record<string, string | number | boolean>;
  turnoverFilter?: Record<string, string | number | boolean>;
  shortBorrowPolicy?: Record<string, unknown>;
  evaluation?: Record<string, string | number | boolean>;
  discordFormat?: Record<string, string | number | boolean>;
  marketRss?: { enabledSources?: string[] };
  secEdgar?: { ciks?: string[]; syncXbrl?: boolean; discordBatch?: number };
  vwapPolicy?: { minAbovePercent: number; minVolume: number; minTradeValue: number; minPointCount: number; minTurnoverRatio: number; requireComplete: boolean };
  bollingerPolicy?: { period: number; stdDevMultiplier: number; minPrice: number; minVolume: number; minTurnoverRatio: number };
  krBollingerPolicy?: { period: number; stdDevMultiplier: number; minPrice: number; minVolume: number; minTurnoverRatio: number };
  newsLookup?: { defaultPeriod: "today" | "3d" | "7d" | "1m" };
  minuteBollingerPolicy?: { topN: number; period: number; stdDevMultiplier: number; minChangeRate: number };
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
  { key: "dart-realtime", label: "DART 공시 자동화", description: "OpenDART 수집·평가·알림", settingsPath: "/admin/modules/dart-realtime", scheduler: "OCI_CRON" },
  { key: "sec-realtime", label: "SEC Submissions 자동화", description: "CIK 기반 SEC Submissions·Form/Item·XBRL 수집·알림", settingsPath: "/admin/modules/sec-realtime", scheduler: "OCI_CRON" },
  { key: "market-rss", label: "시장 RSS 통합", description: "SEC EDGAR·StockTitan·시장 RSS 수집·번역·알림", settingsPath: "/admin/modules/market-rss", scheduler: "OCI_CRON" },
  { key: "us-scanners", label: "미국 스캐너", description: "미국 상승률·체결강도 스캐너", settingsPath: "/admin/modules/us-scanners", scheduler: "NOT_SCHEDULED" },
  { key: "domestic-trade-intensity", label: "국내 체결강도", description: "국내 주식 체결강도 스캐너", settingsPath: "/admin/modules/domestic-trade-intensity", scheduler: "NOT_SCHEDULED" },
  { key: "us-turnover-trend", label: "해외 거래대금 추이", description: "해외주식 거래대금 추이", settingsPath: "/admin/modules/us-turnover-trend", scheduler: "NOT_SCHEDULED" },
  { key: "us-turnover-ratio", label: "시총 대비 거래대금", description: "시총 대비 거래대금 필터·알림", settingsPath: "/admin/modules/us-turnover-ratio", scheduler: "OCI_CRON" },
  { key: "us-vwap", label: "당일 VWAP 상회", description: "당일 전체 세션 VWAP 상회 종목 탐지·Discord 알림", settingsPath: "/admin/modules/us-vwap", scheduler: "OCI_CRON" },
  { key: "us-bollinger-band", label: "일봉 볼린저밴드 하단 이탈", description: "통합 티커의 최신 저장 일봉(당일 포함) 저가가 볼린저밴드 하단 이하인 종목 탐지", settingsPath: "/admin/modules/us-bollinger-band", scheduler: "OCI_CRON" },
  { key: "us-minute-bollinger-band", label: "1분봉 볼린저밴드 하단", description: "상승률 TOP 종목의 KIS 1분봉 종가가 볼린저밴드 하단 이하인 종목 탐지", settingsPath: "/admin/modules/us-minute-bollinger-band", scheduler: "OCI_CRON" },
  { key: "kr-bollinger-band", label: "국내 일봉 볼린저밴드 하단 이탈", description: "국내 통합 티커의 일봉 종가가 볼린저밴드 하단 이하인 종목 탐지", settingsPath: "/admin/modules/kr-bollinger-band", scheduler: "OCI_CRON" },
  { key: "kr-daily-cache", label: "국내 일봉 캐시 갱신", description: "KIS 국내 통합 티커·일봉·시세 지표 DB 갱신", settingsPath: "/admin/modules/kr-daily-cache", scheduler: "OCI_CRON" },
  { key: "us-free-float", label: "해외 유통주 갱신", description: "해외 통합 티커의 유통주식수와 유통비율을 일일 갱신", settingsPath: "/admin/modules/us-free-float", scheduler: "OCI_CRON" },
  { key: "us-product-classification", label: "해외 상품 유형 검증", description: "KIS 상품 유형으로 ETF·레버리지·파생상품을 비활성화", settingsPath: "/admin/modules/us-product-classification", scheduler: "OCI_CRON" },
  { key: "us-short-borrow", label: "공매도 대차 압박", description: "Alpaca 계정별 대차·Locate 상태", settingsPath: "/admin/modules/us-short-borrow", scheduler: "OPTIONAL_CRON" },
  { key: "us-news-radar", label: "해외 뉴스 급등주 레이더", description: "KIS 해외속보·뉴스 검증 기반 후보 탐지", settingsPath: "/admin/modules/us-news-radar", scheduler: "OCI_CRON" },
  { key: "us-breaking-news-forwarder", label: "해외 속보 Discord 전달", description: "KIS 해외 속보 원문을 별도 Discord 채널로 전달", settingsPath: "/admin/modules/us-breaking-news-forwarder", scheduler: "OCI_CRON" },
  { key: "us-daily-indicators", label: "일봉 지표 알림", description: "MFI·DMI·MACD·OBV 일봉 후보 통합 알림", settingsPath: "/admin/modules/us-daily-indicators", scheduler: "OCI_CRON" },
  { key: "us-obv", label: "OBV 자동화", description: "미국 OBV 후보 탐지·알림", settingsPath: "/admin/modules/us-obv", scheduler: "OCI_CRON" },
  { key: "us-daily-cache", label: "일봉 캐시 갱신", description: "미국 일봉 데이터 DB 갱신", settingsPath: "/admin/modules/us-daily-cache", scheduler: "OCI_CRON" },
  { key: "us-daily-open-cache", label: "당일 시가 갱신", description: "미국 현재 세션 시가를 DB에 1시간마다 갱신", settingsPath: "/admin/modules/us-daily-open-cache", scheduler: "OCI_CRON" },
  { key: "us-daily-breakout", label: "일봉 돌파 자동화", description: "최근 고가 돌파 후보 탐지·알림", settingsPath: "/admin/modules/us-daily-breakout", scheduler: "OCI_CRON" },
  { key: "us-trade-intensity", label: "체결강도 자동화", description: "해외 체결강도 수집", settingsPath: "/admin/modules/us-trade-intensity", scheduler: "OCI_CRON" },
  { key: "short-borrow", label: "대차 데이터 수집", description: "공매도 대차 데이터 수집", settingsPath: "/admin/modules/short-borrow", scheduler: "NOT_SCHEDULED" },
  { key: "discord-delivery-retry", label: "Discord 재전송", description: "실패한 Discord 알림 재전송", settingsPath: "/admin/modules/discord-delivery-retry", scheduler: "OCI_CRON" },
];

export function getFeatureModule(key: string) {
  return FEATURE_MODULES.find((module) => module.key === key);
}
