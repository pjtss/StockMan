import { AdminPageShell } from "@/components/admin-page-shell";
import { AdminUsTurnoverFilters } from "@/components/admin-us-turnover-filters";

export default function AdminUsTurnoverFiltersPage() {
  return <AdminPageShell eyebrow="FILTER CONTROL" title="시총 대비 거래대금 필터" description="미국 거래대금 비율 탐지 조건과 거래대금 상승 알림 기준을 관리합니다."><AdminUsTurnoverFilters /></AdminPageShell>;
}
