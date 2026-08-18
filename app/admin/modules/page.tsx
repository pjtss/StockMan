import Link from "next/link";
import { AdminPageShell } from "@/components/admin-page-shell";
import { FEATURE_MODULES, type FeatureModuleDefinition } from "@/lib/feature-modules";
import styles from "./modules.module.css";

type ModuleGroup = { key: string; title: string; description: string; keys: FeatureModuleDefinition["key"][] };
const groups: ModuleGroup[] = [
  { key: "market-data", title: "시장 데이터·캐시", description: "KIS 원본, 일·주·월봉 캐시, 시가·유통주·상품 분류", keys: ["kr-daily-cache", "us-daily-cache", "us-daily-open-cache", "us-free-float", "us-product-classification"] },
  { key: "bollinger", title: "볼린저밴드 탐지", description: "국내·해외 저장 캔들의 밴드 구간 탐지", keys: ["us-bollinger-band", "us-bollinger-middle-lower", "kr-bollinger-band", "kr-bollinger-middle-lower", "us-minute-bollinger-band"] },
  { key: "daily-signals", title: "일봉 지표·추세 탐지", description: "OBV·ADL·MACD·DMI·MFI·돌파 및 통합 추세", keys: ["us-daily-indicators", "us-obv", "us-daily-breakout"] },
  { key: "flow", title: "실시간 수급·거래 탐지", description: "VWAP, 거래대금, 체결강도, 국내·해외 스캐너", keys: ["us-vwap", "us-turnover-ratio", "us-turnover-trend", "us-trade-intensity", "domestic-trade-intensity", "us-scanners"] },
  { key: "news-filings", title: "뉴스·공시 수집·알림", description: "RSS·SEC·DART·해외 속보와 알림 전달", keys: ["market-rss", "sec-realtime", "dart-realtime", "us-news-radar", "us-breaking-news-forwarder"] },
  { key: "short-borrow", title: "공매도·대차", description: "대차 가능 수량과 Locate 상태 수집", keys: ["us-short-borrow", "short-borrow"] },
  { key: "delivery", title: "운영·알림 관리", description: "Discord 재전송 및 운영 보조 모듈", keys: ["discord-delivery-retry"] },
];
const moduleMap = new Map(FEATURE_MODULES.map((module) => [module.key, module]));
const schedulerLabel = { OCI_CRON: "자동화", OPTIONAL_CRON: "선택 자동화", NOT_SCHEDULED: "수동" } as const;
const schedulerClass = { OCI_CRON: "ociCron", OPTIONAL_CRON: "optionalCron", NOT_SCHEDULED: "notScheduled" } as const;

export default function AdminModulesPage() {
  return <AdminPageShell eyebrow="FEATURE MODULES" title="기능별 운영 관리" description="기능군을 접거나 펼쳐 필요한 설정만 확인하세요. 모든 기능은 독립적으로 ON/OFF·스케줄·테스트할 수 있습니다.">
    <div className={styles.groups}>{groups.map((group, index) => <details className={styles.group} key={group.key} open={index === 0}>
      <summary className={styles.groupHeader}><div><span className={styles.groupEyebrow}>MODULE GROUP</span><h2>{group.title}</h2><p>{group.description}</p></div><span className={styles.count}>{group.keys.length}개</span></summary>
      <div className={styles.grid}>{group.keys.map((key) => { const module = moduleMap.get(key); if (!module) return null; return <Link className={styles.card} href={module.settingsPath} key={module.key}><div className={styles.cardMeta}><span>{module.key}</span><em className={styles[schedulerClass[module.scheduler]]}>{schedulerLabel[module.scheduler]}</em></div><strong>{module.label}</strong><p>{module.description}</p><b>관리하기 →</b></Link>; })}</div>
    </details>)}</div>
  </AdminPageShell>;
}
