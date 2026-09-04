import { PageNavigation } from "@/components/page-navigation";
import { DailyDisclosuresPage } from "@/components/daily-disclosures-page";
export default function Page() { return <><PageNavigation current="disclosures" /><main className="page-shell inquiryPage"><section className="hero inquiryHero"><div className="kicker">DISCLOSURE DESK</div><h1>일별 공시·RSS</h1><p>DART·SEC와 등록된 RSS 출처의 저장 데이터를 날짜와 출처별로 확인합니다.</p></section><DailyDisclosuresPage /></main></>; }
