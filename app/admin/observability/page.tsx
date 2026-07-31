import { AdminPageShell } from "@/components/admin-page-shell";
import { AdminObservability } from "@/components/admin-observability";

export default function AdminObservabilityPage() {
  return <AdminPageShell eyebrow="OBSERVABILITY" title="공통 자동화 디버깅" description="기능별 최근 실행 결과와 오류를 확인합니다."><AdminObservability /></AdminPageShell>;
}
