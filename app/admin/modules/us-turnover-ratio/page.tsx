import { AdminPageShell } from "@/components/admin-page-shell";
import { AdminUsTurnoverFilters } from "@/components/admin-us-turnover-filters";
import { FeatureModuleOperations } from "@/components/feature-module-operations";
import Link from "next/link";

export default function AdminUsTurnoverRatioModulePage() {
  return <AdminPageShell eyebrow="US TURNOVER RATIO MODULE" title="시총 대비 거래대금" description="전체 TOP100 스캐너와 등록 관심종목 스캐너를 분리해 운영합니다."><FeatureModuleOperations moduleKey="us-turnover-ratio" /><AdminUsTurnoverFilters /><p><Link href="/admin/api-tests">관심종목 전용 테스트·상세 디버깅은 관리자 API 테스트 페이지에서 실행 →</Link></p></AdminPageShell>;
}
