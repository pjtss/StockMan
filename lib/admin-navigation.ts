export type AdminNavId = "dashboard" | "features" | "schedules" | "modules" | "api-config" | "api-tests" | "blacklist" | "product-classification" | "sec-test" | "observability" | "stocktitan-rss";

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
    id: "features",
    group: "운영",
    label: "기능 ON/OFF",
    description: "수집기와 자동화 기능 활성 상태 제어",
    href: "/admin/features",
  },
  {
    id: "schedules",
    group: "자동화",
    label: "스케줄",
    description: "KST 기준 스캐너 동작 시간 관리",
    href: "/admin/schedules",
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
  { id: "stocktitan-rss", group: "진단", label: "StockTitan RSS", description: "일별 원문·번역·필터·알림 디버깅", href: "/admin/stocktitan-rss" },
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
