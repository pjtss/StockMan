import Link from "next/link";
import { AdminPageShell } from "@/components/admin-page-shell";
import { FeatureModuleOperations } from "@/components/feature-module-operations";

export default function AdminUsVwapModulePage() {
  return <AdminPageShell eyebrow="US VWAP MODULE" title="당일 VWAP 상회" description="AMS·NAS·NYS 통합 티커의 프리·정규·애프터마켓 전체 세션 VWAP을 계산하고 현재가가 VWAP 위인 종목을 탐지합니다.">
    <FeatureModuleOperations moduleKey="us-vwap" />
    <p><Link href="/admin/api-tests">VWAP 테스트·상세 디버깅은 관리자 API 테스트 페이지에서 실행 →</Link></p>
  </AdminPageShell>;
}
