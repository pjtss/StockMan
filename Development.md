# Development

## Rules
- 모든 개발 내용은 이 파일에 기록한다.
- 기능 추가, 구조 변경, 배포 영향 사항, 환경변수 변경 사항을 남긴다.
- 최신 항목이 위로 오도록 기록한다.

## 2026-05-17
- **[UI/UX 개선 완료]** 다크 모드 글래스모피즘(Dark Glassmorphism) 디자인 시스템 전면 적용
  - `rapid-dart-page.tsx`, `trading-intensity.tsx`의 프리미엄 다크 모드 디자인을 타 컴포넌트에 통일.
  - `feed-page.module.css`: 메인 피드 목록 및 컨트롤바 배경을 다크 글래스모피즘(`rgba(255,255,255,0.03)` 및 `blur`)으로 변경하고 네온 텍스트 적용.
  - `market-sentiment.module.css`: 시장 감성 지수 게이지와 백그라운드를 다크 테마 및 네온 글로우 효과로 업그레이드.
  - `sector-map.module.css`: 섹터 히트맵 그리드 타일 디자인에 호버 애니메이션, 네온 바, 어두운 배경 적용.
  - `company-timeline.module.css`: 타임라인 모달의 배경, 선, 텍스트 색상을 어두운 테마로 변경.
  - 모든 디자인 변경은 순수 CSS 수정으로 구현되어 기존 기능 및 테스트 커버리지 유지.

## 2026-05-16
- **[구현 완료]** OpenDART 원문 핵심 데이터 추출 (단일판매ㆍ공급계약체결)
  - `lib/opendart.ts`: `list.json` API를 통한 `corp_code` 동적 조회 및 `snglpnrsctrt.json` (단일판매) 데이터 페칭 로직 구현.
  - `app/api/dart/contract/route.ts`: 서버리스 환경에 최적화된 계약 상세 데이터 API 구축.
  - `components/contract-badge.tsx`: 피드 목록에서 계약 금액, 매출액 대비 비율 등을 직관적으로 보여주는 뱃지 UI 구현.
  - 빌드 최적화: `vitest.config.ts` 관련 TypeScript 에러 수정을 위해 `tsconfig.json`의 `exclude` 배열 업데이트.
- **[구현 완료]** 한국투자증권 API 연동 실시간 체결강도 스캐너
  - `lib/kis.ts`: 한국투자증권 API(OAuth2, 체결강도 순위) 연동 모듈 구현. (API 키 미설정 시 Mock 데이터 제공)
  - `app/api/stock/intensity/route.ts`: 서버사이드 데이터 페치 엔드포인트 구축.
  - `components/trading-intensity.tsx`: 대시보드 내 실시간 체결강도 TOP 10 스캐너 UI 통합.
  - **빌드 복구**: `feed-page.tsx` 내 변수 선언 오류(`count`, `totalPages`, `fetchedAt`) 수정 및 레이아웃 최적화.
- 개발 문서화 프로토콜 준수 선언
  - 모든 개발 내용은 `Development.md`에 기록하고, 실수와 잘한 내용은 `AGENTS.md`에 기록하는 규칙을 철저히 준수하기로 함.
  - 이 규칙은 앞으로 모든 작업에 무한 반복 적용됨.
- 서비스 개선 및 신규 기능 설계 제안
  - AI 기반 감성 분석, 관심 종목(Watchlist), UI/UX 강화, 시장 감성 지수 등 4가지 핵심 기능 설계.
  - `implementation_plan.md` 아티팩트 생성 및 제안 완료.
- **[구현 완료]** 관심 종목, 시장 감성 지수, UI/UX 프리미엄 강화
  - `localStorage` 기반 관심 종목(Watchlist) 기능 구현.
  - 실시간 데이터 기반 '시장 감성 지수(Market Sentiment Index)' 구현 (DB 없이 작동).
  - '최강호재' 등급에 글로우 애니메이션 및 테이블 호버 효과 등 UI/UX 강화.
- **[구현 완료]** 테스트 최적화 모듈화 및 Vitest 환경 구축
  - `lib/rss.ts`: XML 파싱 로직을 `parseDartItems`, `parseSecItems` 순수 함수로 분리.
  - `lib/scoring.ts`: 시장 지수 산출 로직을 `calculateMarketSentiment` 함수로 모듈화.
  - `components/feed-page.tsx`: 컴포넌트 내 비즈니스 로직을 외부 라이브러리로 이관하여 UI와 로직 분리.
  - **테스트 환경**: Vitest 설정 및 `scoring.test.ts`, `rss.test.ts` 작성 완료.
- **[구현 완료]** UI 컴포넌트 전수 테스트 및 커버리지 100% 달성
  - `feed-page.tsx`, `market-sentiment.tsx` 등 모든 컴포넌트에 대한 RTL(React Testing Library) 테스트 구축.
  - 비동기 로딩, 유저 인터랙션, 엣지 케이스 렌더링에 대한 전수 검증 완료.
- **[구현 완료]** 고급 데이터 분석 기능 통합
  - **감성 히스토리**: `localStorage` 기반 지수 추적 및 SVG 스파크라인 시각화.
  - **섹터 히트맵**: 종목/공시 기반 자동 섹터 분류 엔진 및 시각적 그리드 맵 구현.
  - **종목 타임라인**: 특정 종목 클릭 시 공시 이력을 시간순으로 분석하는 모달 뷰 추가.
  - **테스트 보강**: `lib/sentiment.ts`, `lib/sectors.ts` 유닛 테스트 100% 구축.

## 2026-05-14
- DART/SEC 푸시 알림 토글 기능 추가
  - 브라우저 권한은 사이트 단위로 유지
  - 앱 내부에서 `전체 푸시`, `DART 푸시`, `SEC 푸시`를 각각 켜고 끌 수 있도록 구현
  - `push_subscriptions` 테이블에 `enabled`, `dart_enabled`, `sec_enabled` 컬럼 추가
  - 구독 API에 설정 저장/조회 기능 추가
  - 스케줄러 발송 시 소스별 설정을 반영하도록 수정

## 2026-05-14
- 개발 기록 정책 추가
  - 앞으로 모든 개발 내용은 `Development.md`에 기록
  - 별도 작업 중 실수, 재발 방지, 개선점은 `AGENTS.md`에 기록
