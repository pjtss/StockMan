import { PageNavigation } from "@/components/page-navigation";
import { MarketNewsPage } from "@/components/market-news-page";
export default function Page() { return <><PageNavigation current="market-news" /><main className="page-shell inquiryPage"><section className="hero inquiryHero"><div className="kicker">GLOBAL NEWS DESK</div><h1>해외 뉴스·공시</h1><p>StockTitan, SEC EDGAR, NASDAQ 등 저장된 해외 RSS와 공시를 최신 시각순으로 확인합니다.</p></section><MarketNewsPage /></main></>; }
