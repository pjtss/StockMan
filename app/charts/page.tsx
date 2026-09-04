import { PageNavigation } from "@/components/page-navigation";
import { TickerChartWorkbench } from "@/components/ticker-chart-workbench";
import { ChartsEntryEffects } from "@/components/charts-entry-effects";

export default function ChartsPage() {
  return <><ChartsEntryEffects /><PageNavigation current="charts" /><main className="page-shell chartsPage"><section className="hero chartsHero"><div className="kicker">CHART WORKBENCH</div><h1>티커 차트 조회</h1><p>국내·해외 티커를 입력하고 캔들, EMA, 볼린저밴드, 거래량과 보조지표를 한 화면에서 확인하세요.</p><div className="chartsHeroMeta"><span>실시간 조회</span><span>일·주·월봉</span><span>기술적 지표</span></div></section><TickerChartWorkbench /></main></>;
}
