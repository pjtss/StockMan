import { FeatureDisabled } from "@/components/feature-disabled";
import { UsTurnoverTrend } from "@/components/us-turnover-trend";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";

export const dynamic = "force-dynamic";

export default async function UsTurnoverTrendPage() {
  const flags = await loadAdminFeatureFlags();
  if (!flags.us_turnover_trend) {
    return (
      <FeatureDisabled
        current="scanners-us"
        category="US Scanners"
        title="해외주식 거래대금 추이 기능이 비활성화되었습니다."
        description="관리자가 기능을 다시 켜기 전까지 해외주식 거래대금 추이 페이지는 표시되지 않습니다."
      />
    );
  }

  return <UsTurnoverTrend />;
}
