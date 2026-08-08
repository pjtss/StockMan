import { AdminPageShell } from "@/components/admin-page-shell";
import { AdminStockTitanRss } from "@/components/admin-stocktitan-rss";

export default function StockTitanRssPage() {
  return <AdminPageShell eyebrow="MARKET RSS DEBUGGER" title="RSS 공시 등급 조회" description="RSS 출처·날짜·호재 등급별로 원문·번역·분류·알림 상태를 확인하고 복사합니다."><AdminStockTitanRss /></AdminPageShell>;
}
