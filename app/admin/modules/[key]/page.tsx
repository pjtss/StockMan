import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageShell } from "@/components/admin-page-shell";
import { FeatureModuleOperations } from "@/components/feature-module-operations";
import { FeatureModuleRunHistory } from "@/components/feature-module-run-history";
import { ShortBorrowPolicySettings } from "@/components/short-borrow-policy-settings";
import { getFeatureModule, FEATURE_MODULES, type FeatureModuleKey } from "@/lib/feature-modules";
import styles from "./module-detail.module.css";
import { BreakingNewsForwarderTest } from "@/components/breaking-news-forwarder-test";

export function generateStaticParams() { return FEATURE_MODULES.filter((module) => module.key !== "us-turnover-ratio").map((module) => ({ key: module.key })); }

export default async function FeatureModulePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const module = getFeatureModule(key);
  if (!module || key === "us-turnover-ratio") notFound();
  return <AdminPageShell eyebrow="FEATURE MODULE" title={module.label} description={module.description}>
    <FeatureModuleOperations moduleKey={module.key as FeatureModuleKey} />
    {module.key === "us-breaking-news-forwarder" && <BreakingNewsForwarderTest />}
    {module.key === "us-short-borrow" && <ShortBorrowPolicySettings />}
    <FeatureModuleRunHistory moduleKey={module.key as FeatureModuleKey} />
    <section className={styles.links}><h2>기능 전용 설정</h2><p>공통 운영 설정과 분리된 기능별 조건은 각 전용 화면에서 관리합니다.</p>{module.key === "sec-realtime" && <Link href="/admin/sec-test">SEC 분석·평가 설정 →</Link>}{module.key === "us-scanners" && <Link href="/admin/api-config">KIS 요청 파라미터 →</Link>}{module.key === "us-turnover-trend" && <Link href="/scanners/us/turnover-trend">거래대금 추이 조건 →</Link>}{module.key === "us-short-borrow" && <Link href="/short-borrow">공매도 점수·대차 조회 →</Link>}</section>
  </AdminPageShell>;
}
