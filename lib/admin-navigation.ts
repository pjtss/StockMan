export type AdminNavId = "dashboard" | "modules" | "api-config" | "api-tests" | "daily-indicators" | "daily-rss" | "blacklist" | "product-classification" | "sec-test" | "observability" | "stocktitan-rss";

export type AdminNavItem = {
  id: AdminNavId;
  group: "운영" | "API" | "종목" | "자동화" | "진단";
  label: string;
  description: string;
  href: string;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: "dashboard",
    group: "운영",
    label: "대시보드",
    description: "관리자 기능 전체 보기",
    href: "/admin",
  },
  {
    id: "modules",
    group: "자동화",
    label: "기능별 관리",
    description: "기능별 공통 운영 설정과 전용 설정",
    href: "/admin/modules",
  },
  {
    id: "observability",
    group: "진단",
    label: "실행 진단",
    description: "기능별 자동화 실행 이력과 오류 확인",
    href: "/admin/observability",
  },
  { id: "stocktitan-rss", group: "진단", label: "RSS 공시", description: "출처·호재 등급별 원문·번역·알림 디버깅", href: "/admin/stocktitan-rss" },
  { id: "daily-rss", group: "진단", label: "일별 RSS·SEC 복사", description: "날짜별 제목·링크·호재 등급 추출 및 복사", href: "/admin/daily-rss" },
  {
    id: "api-config",
    group: "API",
    label: "KIS 설정",
    description: "KIS 요청 헤더와 파라미터 관리",
    href: "/admin/api-config",
  },
  {
    id: "api-tests",
    group: "API",
    label: "API 테스트",
    description: "KIS 및 스캐너 API 응답 확인",
    href: "/admin/api-tests",
  },
  {
    id: "daily-indicators",
    group: "진단",
    label: "일봉 통합 진단",
    description: "돌파·MFI·DMI·MACD·OBV 결과를 한 번에 확인",
    href: "/admin/daily-indicators",
  },
  {
    id: "blacklist",
    group: "종목",
    label: "수동 제외 종목",
    description: "AMS 스캐너 제외 티커 관리",
    href: "/admin/us-turnover-blacklist",
  },
  {
    id: "product-classification",
    group: "종목",
    label: "상품 분류",
    description: "ETF·레버리지·인버스 상품 자동 분류와 예외 관리",
    href: "/admin/us-instrument-products",
  },
  {
    id: "sec-test",
    group: "API",
    label: "SEC 분석 테스트",
    description: "원문 파싱, AI 평가, Discord 전송 검증",
    href: "/admin/sec-test",
  },
];
