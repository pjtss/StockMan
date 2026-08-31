import { AdminPageShell } from "@/components/admin-page-shell";
import { UserActivityDashboard } from "@/components/user-activity-dashboard";

export default function UserActivityPage() {
  return <AdminPageShell eyebrow="USER ACTIVITY" title="유저 행동 트래킹" description="저장된 요청 로그를 기준으로 서비스 이용 흐름과 오류를 확인합니다."><UserActivityDashboard /></AdminPageShell>;
}
