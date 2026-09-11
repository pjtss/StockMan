import { PageNavigation } from "@/components/page-navigation";
import { InvestmentCalendarPage } from "@/components/investment-calendar-page";
export default function Page(){return <><PageNavigation current="investment-calendar"/><main className="page-shell"><section className="hero"><div className="kicker">MARKET EVENTS</div><h1>투자 일정 캘린더</h1><p>신규 상장, 실적 발표, 배당락과 주요 투자 일정을 날짜순으로 제공합니다.</p></section><InvestmentCalendarPage/></main></>}
