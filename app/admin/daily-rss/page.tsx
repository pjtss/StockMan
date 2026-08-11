import { AdminPageShell } from "@/components/admin-page-shell";
import { AdminDailyRssExport } from "@/components/admin-daily-rss-export";

export default function DailyRssPage() {
  return <AdminPageShell eyebrow="DAILY MARKET RSS" title="일별 해외 RSS · SEC 복사" description="선택한 날짜의 해외 RSS와 SEC 공시에서 제목·링크·호재 등급만 추려 확인하고 복사합니다."><AdminDailyRssExport /></AdminPageShell>;
}
