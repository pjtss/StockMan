import { PageNavigation } from "@/components/page-navigation";
import { DomesticFinancialExport } from "@/components/domestic-financial-export";

export default function OtherPage() {
  return <><PageNavigation current="other" /><main className="page-shell otherPage"><section className="hero"><div className="kicker">TOOLS & DATA</div><h1>기타</h1><p>프로젝트에서 관리하는 국내 기업 데이터를 JSON 파일로 내려받습니다.</p></section><DomesticFinancialExport /></main></>;
}
