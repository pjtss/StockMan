import { AdminPageShell } from "@/components/admin-page-shell";
import { AdminKisCalls } from "@/components/admin-kis-calls";
export default function AdminKisCallsPage() { return <AdminPageShell eyebrow="KIS OBSERVABILITY" title="KIS 호출량 대시보드" description="KIS Open API 호출량, 지연시간, 성공·실패율을 일별·시간별·기능별로 확인합니다."><AdminKisCalls /></AdminPageShell>; }
