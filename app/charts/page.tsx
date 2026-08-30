import { PageNavigation } from "@/components/page-navigation";
import { TickerChartWorkbench } from "@/components/ticker-chart-workbench";
import { ChartsEntryEffects } from "@/components/charts-entry-effects";

export default function ChartsPage() {
  return <><ChartsEntryEffects /><PageNavigation current="charts" /><main className="page-shell"><section className="hero"><div className="kicker">CHART WORKBENCH</div><h1>티커 차트 조회</h1><p>쉼표로 입력한 종목을 선택해 일봉 차트와 기술적 지표를 확인합니다.</p></section><TickerChartWorkbench /></main></>;
}
