import { FeatureDisabled } from "@/components/feature-disabled";

export default function SecPage() {
  return (
    <FeatureDisabled
      current="sec"
      category="SEC"
      title="실시간 SEC 공시 기능이 비활성화되었습니다."
      description="현재 SEC 공시 수집, 화면 조회, 관련 알림 흐름을 모두 중단한 상태입니다."
    />
  );
}
