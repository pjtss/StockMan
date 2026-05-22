import { FeatureDisabled } from "@/components/feature-disabled";

export default function ScannersPage() {
  return (
    <FeatureDisabled
      current="scanners"
      category="국내 스캐너"
      title="국내 스캐너 기능이 비활성화되었습니다."
      description="현재 국내 실시간 스캐너 호출과 화면 렌더링을 모두 중단한 상태입니다."
    />
  );
}
