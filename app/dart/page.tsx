import { FeatureDisabled } from "@/components/feature-disabled";

export default function DartPage() {
  return (
    <FeatureDisabled
      current="dart"
      category="DART"
      title="실시간 DART 기능이 비활성화되었습니다."
      description="현재 실시간 DART 수집, 화면 조회, 관련 알림 흐름을 모두 중단한 상태입니다."
    />
  );
}
