import { AdminHealthProbeHistory } from "@/components/admin-health-probe-history";
import { AdminPageShell } from "@/components/admin-page-shell";

export default function AdminHealthProbesPage() {
  return <AdminPageShell eyebrow="HEALTH OBSERVABILITY" title="DB health 추세" description="주기적으로 측정한 DB 연결·자동화 이력·진단 테이블 probe의 지연 및 실패를 확인합니다."><AdminHealthProbeHistory /></AdminPageShell>;
}
