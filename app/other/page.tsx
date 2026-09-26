import { PageNavigation } from "@/components/page-navigation";
import { DomesticFinancialExport } from "@/components/domestic-financial-export";
import { SecCompanyFactsLookup } from "@/components/sec-company-facts-lookup";

export default function OtherPage() {
  return <><PageNavigation current="other" /><main className="page-shell otherPage"><section className="hero"><div className="kicker">TOOLS & DATA</div><h1>기타</h1><p>국내 기업 데이터 다운로드와 SEC Company Facts 원본 조회 기능을 제공합니다.</p></section><DomesticFinancialExport /><SecCompanyFactsLookup /></main></>;
}
