import { AdminPageShell } from "@/components/admin-page-shell";
import { DatabaseBrowser } from "@/components/database-browser";

export default function DatabasePage() {
  return <AdminPageShell eyebrow="DATABASE" title="DB 데이터 조회" description="관리자 세션에서만 공개되는 테이블·컬럼·최근 데이터 조회 화면입니다."><DatabaseBrowser /></AdminPageShell>;
}
