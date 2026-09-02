import { PageNavigation } from "@/components/page-navigation";
import { WatchlistWorkbench } from "@/components/watchlist-workbench";

export default function WatchlistPage() {
  return <><PageNavigation current="watchlist" /><main className="page-shell"><section className="hero"><div className="kicker">WATCHLIST</div><h1>관심종목</h1><p>국내·해외 티커를 저장하고 /charts와 같은 차트 모달에서 확인합니다.</p></section><WatchlistWorkbench /></main></>;
}
