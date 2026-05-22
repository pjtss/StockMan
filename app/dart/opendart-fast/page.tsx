import { FeatureDisabled } from "@/components/feature-disabled";

export default function DartOpenDartFastPage() {
  return (
    <FeatureDisabled
      current="dart-opendart-fast"
      category="OPEN DART"
      title="실시간 DART 기능이 비활성화되었습니다."
      description="OPEN DART 빠른 공시 조회도 함께 중단되어 현재는 데이터를 가져오지 않습니다."
    />
  );
}
