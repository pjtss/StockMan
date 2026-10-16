/** 차트 엔진의 지연 로딩 경계. UI 테스트에서 브라우저 전용 캔버스 구현을 대체할 수 있다. */
export function loadChartLibrary() {
  return import("lightweight-charts");
}
