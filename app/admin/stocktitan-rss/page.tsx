import { AdminPageShell } from "@/components/admin-page-shell";
import { AdminStockTitanRss } from "@/components/admin-stocktitan-rss";

export default function StockTitanRssPage() {
  return <AdminPageShell eyebrow="STOCKTITAN RSS DEBUGGER" title="StockTitan 일별 RSS" description="원문·번역·분류·알림 상태를 기사별로 확인하고 복사합니다."><AdminStockTitanRss /></AdminPageShell>;
}
