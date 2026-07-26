import { AdminPageShell } from "@/components/admin-page-shell";
import { AdminUsTurnoverFilters } from "@/components/admin-us-turnover-filters";
import { FeatureModuleOperations } from "@/components/feature-module-operations";

export default function AdminUsTurnoverRatioModulePage() {
  return <AdminPageShell eyebrow="US TURNOVER RATIO MODULE" title="시총 대비 거래대금" description="공통 운영 설정과 기능 전용 탐지 조건을 함께 관리합니다."><FeatureModuleOperations moduleKey="us-turnover-ratio" /><AdminUsTurnoverFilters /></AdminPageShell>;
}
