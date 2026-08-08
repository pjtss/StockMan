import { FeatureDisabled } from "@/components/feature-disabled";
import { TopRisingScanner } from "@/components/top-rising-scanner";
import { isFeatureModuleEnabled } from "@/lib/feature-module-gates";

export const dynamic = "force-dynamic";

export default async function TopRisingPage() {
  if (!(await isFeatureModuleEnabled("us-scanners"))) {
    return (
      <FeatureDisabled
        current="scanners-us"
        category="US Scanners"
        title="실시간 해외주식 상승률 스캐너 기능이 비활성화되었습니다."
        description="관리자가 기능을 다시 켜기 전까지 미국 상승률 TOP 10 스캐너는 표시되지 않습니다."
      />
    );
  }

  return <TopRisingScanner />;
}
