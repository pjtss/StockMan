export type DartJudgment = "최강호재" | "호재가능" | "악재" | "중립";
export type SecSentiment = "호재가능" | "악재가능" | "중요공시" | "일반공시";

export interface AlertItem {
  source: "DART" | "SEC";
  externalId: string;
  level: string;
  company: string;
  title: string;
  link: string;
  publishedAt: string;
  keywords?: string[];
}

export interface ContractDetails {
  contractAmount: string; // 계약금액
  salesRatio: string; // 최근매출액대비 (%)
  partner: string; // 계약상대방
  period: string; // 계약기간
}

export interface DartItem {
  source: "DART";
  company: string;
  title: string;
  judgment: DartJudgment;
  keywords: string[];
  publishedAt: string;
  link: string;
  rceptNo: string;
}

export interface SecItem {
  source: "SEC";
  accession: string;
  company: string;
  formType: string;
  sentiment: SecSentiment;
  publishedAt: string;
  title: string;
  summary: string;
  link: string;
}

export interface FeedPayload<T> {
  source: "DART" | "SEC";
  fetchedAt: string;
  items: T[];
  newAlerts?: AlertItem[];
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  enabled?: boolean;
  dartEnabled?: boolean;
  secEnabled?: boolean;
  onlyValidated?: boolean;
}

export interface PushDebugStatus {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  serviceWorkerRegistered: boolean;
  subscriptionExists: boolean;
  currentDeviceSaved?: boolean;
  endpoint?: string;
  lastSaved?: string;
  savedCount?: number;
  latestUserAgent?: string;
  actionRequired?: boolean;
  enabled?: boolean;
  dartEnabled?: boolean;
  secEnabled?: boolean;
  onlyValidated?: boolean;
  error?: string;
}
