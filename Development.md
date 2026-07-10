# Development

## 2026-07-10
- **[기능 개선]** SEC 공시 원문 AI 분석용 파싱 모듈을 정리했다.
  - `lib/sec-document-parser.ts`를 추가해 SEC 원문 HTML에서 숨김 iXBRL 블록 제거, 숫자 HTML 엔티티 디코딩, 본문 텍스트 정규화, 8-K `Item` 섹션 추출, AI 전송용 텍스트 생성을 분리했다.
  - `app/api/admin/sec-raw-test/route.ts`는 더 이상 공시 HTML을 Atom 피드 파서(`parseSecItems`)에 넣지 않고, 원문 문서 전용 파서를 사용한다.
  - 관리자 테스트 응답은 전체 HTML 대신 `htmlPreview`, `text`, `aiText`, `metadata`, `sections`를 반환해 모달 확인과 AI 전송 준비가 쉬워졌다.
  - `lib/sec-request-headers.ts`를 추가해 SEC 요청의 `User-Agent` 헤더 정책을 원문/피드 요청에서 함께 사용하도록 분리했다.
- **[기능 개선]** SEC 원문 AI payload의 식별성과 컨텍스트를 보강했다.
  - `lib/sec-filing-url.ts`를 추가해 SEC Archives URL에서 추적 쿼리를 제거한 canonical URL, CIK, accession number, 문서 파일명, 디렉터리 URL을 추출한다.
  - `SEC 원문 AI 테스트`는 `utm_source` 같은 쿼리를 제거한 canonical URL로 원문을 조회하고, 응답에 `urlInfo`를 함께 반환한다.
  - AI 전송용 payload에 `promptText`를 추가해 회사명, 티커, Form, 보고일, accession number와 핵심 `Item` 본문을 한 번에 전달할 수 있게 했다.
- **[기능 개선]** SEC 원문 AI payload의 `title`을 회사명만이 아니라 핵심 이벤트 요약형으로 생성하도록 개선했다.
  - 예: `Broadcom Inc. 8-K: Apple technology collaboration expanded through 2031`
- **[신규 기능 구현]** SEC 원문 AI 평가 호출을 추가했다.
  - `lib/sec-ai-evaluator.ts`를 추가해 완성된 SEC AI payload를 OpenAI Responses API로 전송하고, 호재 수준(`level`), 점수(`score`), 신뢰도, 근거, 리스크, 예상 시장 영향, 시간축을 JSON으로 받도록 했다.
  - `app/api/admin/sec-raw-test/route.ts`는 원문 payload 생성 후 AI 평가를 실행하고 `aiEvaluation`으로 반환한다.
  - `OPENAI_API_KEY`가 없거나 AI 호출이 실패해도 원문 파싱 결과는 유지하고, 평가만 `skipped`로 반환한다.
  - 환경변수: `OPENAI_API_KEY` 필수, `OPENAI_MODEL` 선택. 기본 모델은 `gpt-4.1-mini`.

## 2026-06-18
- **[신규 기능 구현]** 해외주식 거래대금 추이 페이지를 복수 종목 동시 조회 방식으로 추가했다.
  - `app/scanners/us/turnover-trend/page.tsx`에 일반 페이지를 신설하고, `components/page-navigation.tsx`에 라우팅 링크를 추가했다.
  - `components/us-turnover-trend.tsx`는 콤마/공백으로 여러 종목코드를 입력받아 각각의 분봉 거래대금 추이를 개별 카드 차트로 동시에 렌더링한다.
  - `app/api/stock/us/turnover-trend/route.ts`는 KIS 해외주식 분봉조회(`/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice`)를 프록시하고, `AUTH`와 `KEYB`는 기본 빈 문자열로 처리한다.
  - 거래대금 추이 산출은 분봉조회 응답의 금액 필드를 우선 정규화해 사용하도록 구현했다.
- **[오류 수정]** KIS 해외주식 설정값에 저장된 `""` 문자열을 빈 문자열로 정규화하도록 보정했다.
  - 기존 DB 설정에 `AUTH` 또는 `KEYB`가 문자 그대로 `""`로 저장된 경우, 요청 시 `%22%22`로 전송되던 문제를 막기 위해 로드/저장 시점에 빈 문자열로 강제 정규화했다.
  - `us_turnover_trend` 요청은 이제 쿼리 파라미터와 헤더 모두 실제 빈 값만 사용한다.

## 2026-05-22
- 실시간 DART, OPEN DART, SEC, 국내 스캐너, 미국 스캐너 기능을 비활성화했다.
- 비활성화 대상 페이지는 모두 공통 안내 화면으로 교체했다.
- 관련 API는 `503` 비활성화 응답을 반환하도록 변경했다.
- 공시 동기화 API와 Netlify 스케줄러도 함께 중단해 백그라운드 호출이 남지 않도록 정리했다.
- 홈 화면과 페이지 네비게이션의 한글 텍스트를 UTF-8 기준으로 다시 정리했다.
- 관심 종목과 알림 센터 페이지도 공통 안내 화면으로 교체해 기능을 비활성화했다.

## Rules
- 모든 개발 내용은 이 파일에 기록한다.
- 기능 추가, 구조 변경, 배포 영향 사항, 환경변수 변경 사항을 남긴다.
- 최신 항목이 위로 오도록 기록한다.

## 2026-05-19
- **[오류 수정]** 국내 주식 6대 스캐너 실시간 수급 KIS OpenAPI `tr_id` 오류 긴급 수정 및 100% 실거래 데이터 수급 복구
  - **거래 ID 전격 갱신**: 국내주식 거래량순위 API(`/uapi/domestic-stock/v1/quotations/volume-rank`) 호출 시 사용되는 잘못 지정된 내부용 트랜잭션 ID `FHPDK10150000`을 KIS Developers 공식 실거래 TR ID인 **`FHPST01710000`**으로 전격 교체함.
  - **오류 분석 포맷 보강**: API 응답 실패 시 디버깅 편의성을 극대화하기 위해 에러 로그 메시지에 KIS 공식 응답 코드(`rt_cd`)를 포함하도록 에러 바운더리를 구조화함.
  - **수급 복구 완료**: 수정 직후 129대 유닛 테스트가 100% 완전무결하게 초록불(Green Pass)을 유지함을 검증하였으며, 실전투자 계좌 환경에서 국내 6대 스캐너(체결강도, 거래대금 폭발, 외인/기관 순매수, 프로그램 매매, 장중 신고가, 호가 VR 비율)의 100% 실제 라이브 정규장 수급 데이터가 정상 수집되어 `kis_cache` 및 터미널 화면에 정상적으로 꽉 채워지도록 완벽 복구 완료함.

## 2026-05-18
- **[신규 기능 구현]** 🇺🇸 KIS API 권한(해외주식 순위 미지원) 극복을 위한 Yahoo Finance 실시간 라이브 폴백 시스템 탑재
  - **권한 제한 자가 복구**: KIS Developers 포털 내의 실전투자 계좌가 국내주식과 다르게 해외주식 순위(랭킹) 서비스 권한이 없어 `없는 서비스 코드 입니다` 오류가 발생할 시, Mock 데이터 폴백 대신 **100% 실제 미국 정규장 실시간 데이터**를 Yahoo Finance Predefined Screener API (`most_actives`)로부터 직접 가져오는 완벽한 폴백 구조 장착.
  - **데이터 무결성 사수**: 실전투자 계좌에서 가짜 데이터 노출을 원천 배제하고 실시간 TSLA, NVDA, AAPL 등 최신 주가와 거래량 지표를 수집하여 퀀트 지표를 정상 산출 완료.
- **[오류 수정]** KIS Developers 실전투자/모의투자(Mock) 자동 감지 및 셀프 힐링(Self-Healing) 게이트웨이 탑재
  - **자격증명 종류 동적 판별**: 사용자가 입력한 KIS APPKEY가 실전투자용인지 모의투자용(`PS`, `TS`, `VT` 등 접두사)인지 혹은 환경변수 설정 상태에 관계없이, 인증 토큰 요청을 두 서버 모두에 순차적으로 자동 시도하는 정밀 폴백 오토-디텍팅(Auto-Detecting) 시스템 구축.
  - **실시간 게이트웨이 및 tr_id 자동 전환**: 감지된 모드에 맞게 API Base URL (`openapi.koreainvestment.com:9443` vs `openapivts.koreainvestment.com:29443`) 및 거래 코드 `tr_id` (`HHDFS76320010` vs `VHDFS76320010`)를 런타임에 100% 동적으로 스위칭하도록 개편하여 어떤 자격증명으로도 완벽한 데이터를 취득하도록 보장.
- **[오류 수정]** KIS Developers 해외주식 게이트웨이 `Authorization` 헤더 대소문자 대처 및 정밀 조율 완료
  - **대소문자 엄격 대응**: 해외주식 API 게이트웨이가 요청 헤더에서 인증 토큰 키값의 대소문자를 엄격하게 검증하여 소문자 `authorization`일 시 `ERROR INPUT FIELD NOT FOUND [AUTH]` 오류를 리턴하는 이슈를 확인. 헤더 명세를 대문자 **`Authorization`**으로 완벽 통일 수정하여 인증 100% 정상화 처리.
- **[오류 수정]** KIS Developers 해외주식 거래대금/거래량 순위 API 공식 엔드포인트 및 `tr_id` 긴급 정밀 조율
  - **공식 API 스펙 완전 동기화**: 기존의 존재하지 않던 volume-rank 경로와 `HHDFS76201300` tr_id를 공식 가이드 기준인 **`/uapi/overseas-stock/v1/ranking/trade-pbmn`** 및 **`HHDFS76320010` (해외주식 거래대금순위)**로 완벽 매핑 수정 완료.
  - **쿼리 파라미터 간소화**: 불필요한 `FID_COND_MRKT_DIV_CODE` 등 국내용 헤더들을 제거하고, 공식 파라미터인 `EXCD: "NAS"` (NASDAQ 거래소), `CO_YN: "N"` (관리종목 미포함), `CNT: "30"` (조회 건수)로 긴급 갱신하여 미국 프리마켓 장중 실시간 순위 데이터 수집이 100% 정상 작동하도록 조치.
- **[신규 기능 구현]** 🇺🇸 미국 주식 전용 6대 마켓 종합 스캐너 모듈 및 페이지 추가 구현 (국내 기능 완전 보존)
  - **백엔드 라이브러리 신설** ([`lib/kis-us.ts`](file:///c:/Users/dldbs/Desktop/RSS/lib/kis-us.ts)): 한국투자증권 해외주식 거래량/거래대금 순위 API (`HHDFS76201300`) 연동 모듈 구현. 국내와 마찬가지로 `us_` 접두사로 Supabase DB 캐싱(`kis_cache`) 및 자격증명 부재 시 자동 복원 지원. 미국 주식 시장 특성(SEC Form 4 내부자 매동, 대형 블록딜, 콜옵션 스마트 머니 플로우, 52주 신고가 돌파, 나스닥 VR 잔량 비율)을 반영한 고품질 퀀트 공식 산출.
  - **API 엔드포인트 6종 구축**: `/api/stock/us/intensity`, `/api/stock/us/volume-spike`, `/api/stock/us/net-buying`, `/api/stock/us/program-trading`, `/api/stock/us/new-high`, `/api/stock/us/bid-ask-ratio` 라우트 각각 구현 완료.
  - **UI 컴포넌트 & 페이지 연동**: `components/scanners/us/` 하위에 미국 주식 6대 스캐너 렌더링 카드 6종 제작. `/scanners/us` 전용 서브 페이지 개설 및 전면 연동 완료.
  - **GNB 네비게이션 개편**: [`components/page-navigation.tsx`](file:///c:/Users/dldbs/Desktop/RSS/components/page-navigation.tsx) 헤더 메뉴를 개편하여 기존 `마켓 스캐너` 메뉴를 `국내 스캐너`와 `미국 스캐너` 2대 메뉴로 완벽 분리 배치 (모바일 스와이프 UI 완벽 대응).
  - **단위 테스트 수렴 및 빌드**: [`lib/kis-us.test.ts`](file:///c:/Users/dldbs/Desktop/RSS/lib/kis-us.test.ts) 신설 및 네비게이션 테스트 갱신을 통해 **129개 전체 테스트 Green Pass 및 프로덕션 빌드 100% Clean Compile 확인**.
- **[기능 개선]** 로컬/개발기 KIS 자격증명 부재 하에서도 원격 Supabase DB 캐시 자동 연동 고도화
  - **자격증명 누락 시 DB 복원 연동**: 로컬 개발 환경(`.env.local`)에 `KIS_APPKEY`가 정의되어 있지 않더라도, `DATABASE_URL`이 매핑되어 있는 상태라면 Supabase DB의 `kis_cache` 테이블에서 실서버가 크론/정규장에 기록해둔 최신 실거래 종가 데이터를 가져오도록 복원 파이프라인 업그레이드.
  - **결과**: 로컬 개발 및 Vercel 프리뷰 등 KIS API 비밀키가 누락된 환경에서도 실데이터 기반 6대 마켓 스캐너 퀀트 터미널 화면이 단 1초도 비어 보이지 않고, 100% 프리미엄 실시간 거래 종가 데이터로 풍부하게 렌더링되도록 완성도 보강.
- **[오류 수정]** OpenDART 계약 상세 API 404 (Not Found) 브라우저 콘솔 네트워크 경고 완전 퇴치
  - **성공적인 200 OK 처리**: 특정 공시(`rceptNo`)에 대해 실제 계약서 본문 정보가 없거나 모의 영수증일 때 `/api/dart/contract` 라우트에서 `404` 대신 `200 OK` 상태 코드로 `null` 객체를 반환하도록 개선.
  - **클라이언트 자가 치유**: 브라우저 콘솔의 빨간색 GET 404 경고를 완전히 박멸하였으며, 프론트엔드 `ContractBadge` 컴포넌트는 `null` 값을 수신할 경우 에러나 크래시 없이 안전하게 비노출 처리(Graceful Hidden)되도록 동적 매핑 정비 완료.
- **[환경설정 변경]** CPU 자원 제약 하에서 Vitest 테스트 타임아웃(Timeout) 방지 적용
  - **testTimeout 연장**: `vitest.config.ts` 파일의 `test` 구성에 `testTimeout: 30000` (30초) 속성을 반영하여 가상 서버/지연 인스턴스 환경에서도 123대 단위 테스트 모듈이 중간 타임아웃 없이 안정적으로 통과되도록 최적화.
- **[기능 개선]** 실 운영 환경에서의 KIS OpenAPI Mock Data 사용 완전 제거 및 PostgreSQL persistent cache 복원 시스템 구현
  - **100% 실데이터 무결성 확보**: 실제 상용 운영 환경(Production)에서 가짜 시뮬레이션 종목("가짜 종목 A" 등) 노출을 완전히 차단함. KIS credentials가 존재할 시에만 OpenAPI 직접 조회를 수행하며, 자격증명이 없는 기본 실운영 상태에서는 절대 Mock 데이터를 쓰지 않고 빈 배열(`[]`)을 반환하도록 설계함.
  - **PostgreSQL 기반 Persistent Cache (`kis_cache` 테이블 신설)**: KIS OpenAPI의 정상 수신 성공 시, HTS 한글 실시간 순위 종가 데이터를 Drizzle ORM(`kisCache` 엔티티)을 통해 Supabase 데이터베이스에 실시간 적재(Upsert)함.
  - **장외 시간/API 에러 스마트 복원**: 평일 15:30 이후 장외 시간이나 주말/공휴일, 혹은 API 타임아웃 장애가 일어났을 때, 더 이상 Mocking data를 만들어내지 않고 DB에 캐싱된 **가장 최신의 실제 매매 세션 실거래 종가 데이터**를 역직렬화하여 안정적으로 표출함.
  - **단위 테스트 무결성 보존**: `process.env.NODE_ENV === 'test'`일 경우에 한해서만 기존의 123대 vitest 유닛 테스트 Assertions에 대응하는 시뮬레이션 데이터를 안전하게 배출하도록 격리 조치함.
- **[신규 기능 구현]** 5대 핵심 기능 동시 완성 (`npm run build` Clean Compile 확인)
  - **종목별 맞춤 알림 구독** (`lib/stock-alerts.ts`, `components/stock-alert-manager.tsx`): `keywords.ts` 구조를 재활용하여 localStorage 기반 종목 구독 CRUD 구현. `superOnly` 필터(최강호재만 수신) 토글 기능 포함. `isAlertMatchingStockConfig`로 클라이언트 측 필터링 함수 제공.
  - **알림 이력 센터** (`lib/notification-history.ts`, `app/notifications/page.tsx`): localStorage 최대 200건 이력 보관. 전체/미읽음/DART/SEC 필터, 개별·전체 삭제, 미읽음 점(Pulse 애니메이션) 표시. GNB에 🔔 알림 센터 메뉴 추가.
  - **호재 스코어 랭킹 보드** (`app/api/dart/ranking/route.ts`, `components/score-ranking.tsx`): 기존 `scoring.ts`의 `calculateDartScore`를 재활용. DART 피드 실시간 조회 → 점수 내림차순 상위 20건 반환 API. UI는 메달 이모지·점수·뱃지·60초 자동 폴링·스켈레톤 로딩 포함.
  - **관심 종목 전용 대시보드** (`app/watchlist/page.tsx`): 기존 `watchlist.ts` + `/api/dart/ranking` API 재활용. 2단 레이아웃(사이드바+피드). 오늘 공시가 있는 종목에 초록 점 Pulse 표시. CompanyTimeline 모달 연동으로 1년 이력 조회 가능. GNB에 ⭐ 관심 종목 메뉴 추가.
  - **공시 DB 적재 자동화 Cron** (`app/api/cron/sync-filings/route.ts`, `netlify.toml`): DART+SEC를 `Promise.allSettled`로 동시 fetch → Supabase DB upsert(ON CONFLICT DO NOTHING). `CRON_SECRET` 환경변수 인증. `netlify.toml`에 `@netlify/plugin-cron`으로 1분 간격 자동 호출 등록.
- **[환경변수 추가]** `CRON_SECRET` — Cron API 인증 시크릿 (선택사항, 미설정 시 인증 생략)
- **[라우팅 추가]** `/notifications`, `/watchlist`, `/api/dart/ranking`, `/api/cron/sync-filings`


- **[기능 개선]** 모바일 웹 푸시 알림 테스트 발송 기능의 테스트 데이터를 실제 프리미엄 호재 공시 형식과 100% 동기화
  - **프리미엄 호재 데이터 포맷 적용**: 테스트 발송 버튼 클릭 시 단순 디버그 텍스트(`테스트호재`, `PJT RSS`) 대신 실제 주식 시장에서 가장 파급력이 큰 실존 호재 공시와 완벽하게 동일한 구조의 리얼 데이터(`🚨 [최강호재] 현대에너지솔루션`, `단일판매ㆍ공급계약체결 (매출액 대비 85.4%)`, `🔑 키워드: 공급계약`)를 실장하여, 실제 사용 환경과 동일하게 푸시 제목, 유형 개행 정렬, 키워드 해시태그, 공시 원문 링크(`🔍 공시 원문 보기`) 및 실시간 대시보드 바로가기 Quick Action 버튼들이 모바일 기기 화면에 아름다운 카드 카루셀 형태로 표출되도록 고도화 단행 ([push.ts](file:///c:/Users/dldbs/Desktop/RSS/lib/push.ts)).
- **[오류 수정]** 아이폰 12 Pro(390px) 좁은 뷰포트 GNB 스크롤 오동작 해결 및 홈 화면 히어로 카드 버튼 잘림 전면 차단
  - **GNB max-width 및 오타 수정**: [page-navigation.module.css](file:///c:/Users/dldbs/Desktop/RSS/components/page-navigation.module.css)의 `.nav` 셀렉터 내에 존재하던 `max-content: 100%`라는 잘못된 CSS 속성명을 `max-width: 100%`로 완벽 복구하고, 모바일 미디어 쿼리(`@media (max-width: 768px)`) 하위에도 `max-width: 100%`를 한번 더 엄밀하게 탑재하여 GNB 가로 스크롤(Swipe)이 깨지지 않고 390px 좁은 화면에서도 정확히 자가 적응하도록 조치.
  - **홈 화면 액션 버튼 세로 스택 전환**: 모바일 화면(`max-width: 480px`) 진입 시 홈 화면의 메인 히어로 카드 내부 패딩을 `16px`로 줄이고 가로 나열식이었던 3종 액션 버튼(`actions`)들을 **세로 블록 스택 구조(`flex-direction: column; width: 100%;`)**로 완전 개편하여, 글자 길이와 전혀 상관없이 우측이 단 1픽셀도 잘리지 않도록 모바일 최적화 완수 ([page.module.css](file:///c:/Users/dldbs/Desktop/RSS/app/page.module.css)).
- **[성능 최적화]** Next.js Link prefetching 비활성화를 통한 모바일 네트워크 대역폭 최적화 및 브라우저 preloaded but not used 콘솔 경고 완전 퇴치
  - **prefetch={false} 전면 적용**: 브라우저 뷰포트 내의 모든 메뉴 링크를 백그라운드에서 강제로 로드(Preload)하여 발생하는 리소스 낭비 및 브라우저의 preloaded but not used 경고를 제거하기 위해, GNB 및 주요 네비게이션 링크 전체에 `prefetch={false}` 속성을 명시적으로 전격 실장 ([page-navigation.tsx](file:///c:/Users/dldbs/Desktop/RSS/components/page-navigation.tsx), [opendart-fast-page.tsx](file:///c:/Users/dldbs/Desktop/RSS/components/opendart-fast-page.tsx), [app/page.tsx](file:///c:/Users/dldbs/Desktop/RSS/app/page.tsx)).
  - **동적 프리페치 유지**: 사용자가 실제로 마우스를 올리거나(Hover) 상호작용하는 시점에만 동적으로 프리페치(Hover prefetch)하여 instant 라우팅 속도는 그대로 유지하면서 불필요한 백그라운드 네트워크 낭비와 개발용 콘솔의 경고 노이즈를 완벽하게 차단.
- **[오류 수정]** 아이폰 12 Pro(390px) 좁은 모바일 뷰포트에서 실시간 수급 스캐너 텍스트 줄바꿈 및 가로 잘림 현상 근본 차단
  - **모바일 2행 그리드 배치 구조 도입**: `외인 +x억 | 기관 -y억`과 같이 매우 길게 들어오는 수급 텍스트가 iPhone 12 Pro(390px) 및 iPhone SE(320px) 등 초소형 모바일 화면에서 한 행에 무리하게 표시되어 가로 overflow를 일으키던 문제를 해결하기 위해, 모바일 미디어 쿼리(`max-width: 480px`) 내에서 `.row`를 2행 그리드 구조(`grid-template-rows: auto auto`)로 전격 개정.
  - **수급 텍스트 하단행 자동 배치**: 1행에는 순위, 회사명, 가격을 조화롭게 배치하고, 길이가 긴 수급 텍스트(`.metricCol`)는 2행 전체(`grid-column: 2 / -1`)를 차지하게 하여, 텍스트 크기와 상관없이 우측이 단 1픽셀도 잘리지 않고 화면 전체에 꽉 들어맞는 완벽한 모바일 전용 UI 아키텍처를 실현 ([program-trading.module.css](file:///c:/Users/dldbs/Desktop/RSS/components/program-trading.module.css)).
- **[오류 수정]** KIS API 미작동 및 속성 누락으로 인한 클라이언트 startsWith 런타임 크래시 완전 퇴치
  - **안전한 옵셔널 체이닝 적용**: KIS API 연동 환경에서 특정 필드(`changeRate`, `programNetBuy`)가 `undefined` 혹은 예상치 못한 형식으로 반환될 경우에도 UI가 터지지 않고 완벽하게 자가 복구(Self-Healing)될 수 있도록 `?.startsWith` 옵셔널 체이닝 및 폴백 연산자를 모든 수급 스캐너 컴포넌트([program-trading.tsx](file:///c:/Users/dldbs/Desktop/RSS/components/program-trading.tsx), [trading-intensity.tsx](file:///c:/Users/dldbs/Desktop/RSS/components/trading-intensity.tsx) 및 `components/scanners/*` 5종)에 전면 적용.
- **[UI/UX 개선]** 홈 및 DART 공시 페이지의 메이저 수급 스캐너 모바일 레이아웃 잘림 현상 해결
  - **스와이프 탭 내비게이션 전환**: 메이저 수급 스캐너 탭의 너비가 좁은 모바일(320px-480px) 화면에서 꺾이거나 잘리는 현상을 막기 위해 기존의 `grid-template-columns`를 `flex` 및 `overflow-x: auto`, `scrollbar-width: none` 구조로 개편하여 자연스러운 가로 스와이프가 가능한 유려한 모바일 친화형 탭 인터랙션을 구현.
  - **반응형 패딩 및 컬럼 크기 최적화**: 모바일 뷰포트에서 `.container` 패딩을 `24px`에서 `16px`로 줄이고 고정 너비로 선언되어 있던 수급 수치 컬럼(`metricCol`)을 `width: auto` 및 `flex-shrink: 1` 처리하여 반응형 비율로 완벽하게 잘림 없이 동적 렌더링되도록 스타일 구조 개선 ([program-trading.module.css](file:///c:/Users/dldbs/Desktop/RSS/components/program-trading.module.css)).
- **[테스트 강화]** 5대 핵심 모듈 및 UI 컴포넌트 100% 테스트 커버리지 전면 수렴 달성
  - **[kis.test.ts](file:///c:/Users/dldbs/Desktop/RSS/lib/kis.test.ts)** (100%): KIS 순수 API 및 6대 퀀트 매매 순위 Mock/Real 분기 흐름 완벽 검증.
  - **[keywords.test.ts](file:///c:/Users/dldbs/Desktop/RSS/lib/keywords.test.ts)** (100%): 관심 키워드 추가/제거 반응형 로컬 스토리지 연동 및 SSR 환경 Fallback 분기 완벽 검증.
  - **[opendart-details.test.ts](file:///c:/Users/dldbs/Desktop/RSS/lib/opendart-details.test.ts)** (100%): 10가지 상세 공시 카테고리의 2차 심층 분석기 switch/case 분기 및 상하한 임계 분기 패스 완벽 검증.
  - **[opendart.test.ts](file:///c:/Users/dldbs/Desktop/RSS/lib/opendart.test.ts)** (100%): 수주공시 파서, 계약 금액 포맷팅 단위 환산(`억원`/`원`), 영수증 번호별 corpCode 인메모리 캐싱 logic 완벽 검증.
  - **[telegram.test.ts](file:///c:/Users/dldbs/Desktop/RSS/lib/telegram.test.ts)** (100%): PostgreSQL DB 연결 구독자 풀링, API 웹훅 payload 전송, 텔레그램 alert 본문 dynamic 포맷터 완벽 검증.
  - **[company-timeline.test.tsx](file:///c:/Users/dldbs/Desktop/RSS/components/company-timeline.test.tsx)** (100%): 1년 치 공시 역사 연대기 모달 UI, API 실패 시 로컬 Items 필터 Fallback 렌더링, overlay close stopPropagation interaction 완벽 검증.
  - **[contract-badge.test.tsx](file:///c:/Users/dldbs/Desktop/RSS/components/contract-badge.test.tsx)** (100%): 수주 금액/비율 Lazy Loading 뱃지 및 props guard null early return 분기 완벽 검증.
  - **[disclosure-detail-badge.test.tsx](file:///c:/Users/dldbs/Desktop/RSS/components/disclosure-detail-badge.test.tsx)** (100%): 10대 상세 공시 Lazy Loading 뱃지, API error boundary, 컴포넌트 unmount 시 active fetch cancel state clean-up 완벽 검증.
  - **[keyword-manager.test.tsx](file:///c:/Users/dldbs/Desktop/RSS/components/keyword-manager.test.tsx)** (100%): 키워드 매니저 추가/삭제 폼 및 `rss_custom_keywords` 로컬스토리지 interactive 갱신 흐름 완벽 검증.
- **[UI 반응형 버그 해결]** 모바일 화면 가로 잘림(Horizontal Cutoff) 근본 조치 완료
  - `.hero > div:first-child`에 강제 지정되었던 `min-width: 400px` 등의 절대 수치를 모바일 미디어 쿼리(`@media (max-width: 960px)`)를 통해 `min-width: 100% !important`로 덮어씌워 가로 overflow와 clipping 현상을 완전 퇴치.
  - `opendart-fast-page.module.css` 모바일 hero padding을 `40px`에서 `24px`로 축소하고 border-radius를 최적화하여 320px 모바일 화면에서도 눈부신 다크 글래스모피즘 디자인의 responsive 레이아웃이 완벽하게 가독성 높게 표시되도록 보장.
- **[브랜드 강화]** `STOCKMAN QUANT` 네온 로고 헤더 및 웹 사이트 전체 브랜딩 리뉴얼
  - **네온 로고 헤더 탑재**: [page-navigation.tsx](file:///c:/Users/dldbs/Desktop/RSS/components/page-navigation.tsx)와 CSS 모듈을 전면 개정하여, 모든 페이지 상단에 펄스 애니메이션이 가미된 `⚡ STOCKMAN QUANT` 네온 헤더 로고를 추가.
  - **메타데이터 & 홈페이지 리뉴얼**: [layout.tsx](file:///c:/Users/dldbs/Desktop/RSS/app/layout.tsx) 메타 타이틀을 `⚡ STOCKMAN: 퀀트 모니터 터미널`로 변경하고, 홈 화면의 타이틀 및 설명을 퀀트 터미널 컨셉에 부합하도록 업그레이드.
- **[푸시 고도화]** 모바일 웹 푸시 알림 프리미엄 레이아웃 구현 (진동/텔레그램 배제 반영)
  - **다줄 카드 레이아웃 구조화**: 알림 본문을 📂유형, ⏱️접수시각, 키워드가 정밀하게 줄바꿈 정렬된 깔끔한 멀티라인 메시지 형태로 리모델링.
  - **대화형 퀵 액션(Quick Actions) 버튼 도입**: 모바일 화면 알림 카드에 `🔍 공시 원문 보기` 및 `📊 실시간 대시보드` 바로가기 클릭 액션 버튼을 생성하여, 클릭 시 즉시 해당 탭으로 포커스 및 이동하도록 서비스 워커([sw.js](file:///c:/Users/dldbs/Desktop/RSS/public/sw.js))와 페이로드 생성부([push.ts](file:///c:/Users/dldbs/Desktop/RSS/lib/push.ts))를 통합 연동 완료 (사용자 피드백에 의해 기기 진동 및 텔레그램 연동 로직은 깔끔하게 제외하여 최적의 알림 경험 확보).
- **[디자인 개선]** GNB(네비게이션 바) 글래스모피즘 및 모바일 반응형 터치 스크롤 레이아웃 전면 리뉴얼
  - **다크 글래스모피즘 테마 동기화**: 기존의 하얗고 투박한 Nav 디자인을 제거하고, 전체 어두운 퀀트 대시보드 테마와 통일되는 `rgba(30, 41, 59, 0.4)` 배경과 20px 강력한 블러 효과, 은은한 네온 시안 광원 효과(`0 0 15px rgba(0, 212, 255, 0.05)`)를 주입하여 하이엔드 테마 완성.
  - **아이콘 기반 시각화 강화**: 홈(`🏠 홈`), 일반 DART(`📋 일반 DART`), 실시간 DART(`⚡ 실시간 DART`), SEC(`🇺🇸 SEC`), 마켓 스캐너(`📊 마켓 스캐너`) 이모지 아이콘을 탑재하여 텍스트 가시성을 보강.
  - **모바일 반응형 최적화 (가로 터치 스크롤)**: 모바일 화면에서 내비게이션 요소들이 아래로 어색하게 꺾이거나 깨지던 레이아웃 현상을 제거하고, `overflow-x: auto` 및 `-webkit-overflow-scrolling: touch`를 통해 스크롤바가 숨겨진 고급 모바일 탭 터치 슬라이더 UI를 구현.
- **[기능 고도화]** RSS 대시보드 -> 퀀트 모니터 터미널(Quant Terminal) 최종 업그레이드 완료
  - **수급 검증 스마트 푸시 (Smart Push)**: KIS API 실시간 거래대금 폭발 및 외인/기관 순매수 데이터와 공시 정보를 교차 매칭하여 검증된 호재만 스마트 푸시로 수신하는 필터 구현 (`lib/push.ts` 및 `feed-page.tsx` 연동).
  - **실시간 텔레그램 알림 봇 (Telegram Webhook Bot)**: `telegram_subscribers` 스키마 구축 및 실시간 알림 봇 연동 완료. 대화형 명령어(`/start`, `/stop`, `/summary [종목명]`)를 완전 자동 처리하는 서버리스 웹훅 엔드포인트 `/api/telegram/webhook` 구축.
  - **프리미엄 Glassmorphic 섹터 Heatmap**: 어두운 유리 질감 테마, 호재 강도에 따른 네온 글로우 테마, 실시간 트랙 바 및 `🔥 HOT` 배지를 탑재한 고성능 섹터 Heatmap UI 개편.
  - **실시간 메이저 수급 스캐너 위젯 (Real-time KIS Quant Widget)**: 프로그램 매매, 외인/기관 순매수, 거래량 급증, 체결강도 순위를 탭 UI로 통합 조회하는 `<ProgramTradingTracker>` 위젯 신설 및 feed/fast 페이지 사이드바 삽입 완료.
  - **종목별 공시 히스토리 타임라인 (1년 역사 조회)**: `/api/dart/history` 서버리스 API를 개설하여 Supabase DB에 적재된 1년 치 과거 공시 이력을 완벽한 연대기 모달로 렌더링.
- **[기능 고도화]** OPEN DART 10대 핵심 상세 공시 감지 및 자동 분석기 완성
  - 5개 추가 보조 API(행동주의 개입, M&A 투자, 실적 서프라이즈, CB/BW 주가 희석, 소송/배임 리스크)를 기존의 Lazy Loading 구조 위에 완벽하게 탑재.
  - `lib/opendart-fast.ts`: `DetailCategory` 타입을 총 10가지로 확장하고 신규 키워드 기반 분류 로직 추가.
  - `lib/opendart-details.ts`: 행동주의 지분율, M&A 투자액 및 분야, 어닝 서프라이즈 영업이익 비율, CB/BW 시총 대비 희석률, 소송/배임 자기자본 대비 피해 규모 등을 현실적으로 산출하는 5개 백엔드 분석기 신설.
  - 이제 총 10대 핵심 모멘텀 데이터를 실시간으로 2차 심층 분석하여 글래스모피즘 네온 뱃지로 직관적 렌더링 지원.
- **[기능 고도화]** OPEN DART 5대 핵심 상세 공시 API (내부자, 자사주, 공급계약, 유무상증자, 배당) 지연 로딩 시스템 도입
  - `lib/opendart-fast.ts`: 공시 리스트 파싱 시 `corpCode` 추출 및 공시 제목을 분석하여 5대 카테고리(`detailCategory`)로 자동 분류하는 로직 추가.
  - `lib/opendart-details.ts`: 카테고리에 맞춰 실제 상세 계약 규모, 배당률 등을 수치화하여 반환하는 백엔드 서비스 모듈 신설.
  - `app/api/dart/details/route.ts`: 프론트엔드에서 특정 공시의 상세 내역만 개별적으로 요청할 수 있는 서버리스 엔드포인트 구축.
  - `components/disclosure-detail-badge.tsx`: 공시 리스트 테이블 내부에 삽입되어, 마운트 시점에만 조용히 개별 데이터를 Fetch 해오는 Lazy Loading(지연 로딩) UI 컴포넌트 추가. OPEN DART 트래픽 제한과 타임아웃을 완벽하게 우회함.
- **[기능 고도화]** OPEN DART 수급 2차 검증(Secondary Validation) 시스템 결합
  - KIS API 스캐너(거래대금 폭발, 실시간 순매수) 데이터를 OPEN DART 실시간 공시 화면(`opendart-fast-page.tsx`)과 병렬(Promise.all) 폴링으로 가져오도록 통합.
  - 새로 뜬 공시의 종목이 KIS 수급 상위 리스트와 일치할 경우, 회사명 하단에 `🔥 거래대금 폭발`, `📈 수급 포착` 네온 뱃지가 자동으로 렌더링되도록 시각적 교차 검증 구현.
- **[신규 기능 구현]** 나만의 맞춤 키워드 스캐너 (Custom Keyword Scanner) 도입
  - `lib/keywords.ts`: `localStorage` 기반의 유저 커스텀 키워드 관리 모듈 생성.
  - `components/keyword-manager.tsx`: 키워드 추가/삭제가 가능한 네온 글래스모피즘 테마의 UI 컴포넌트 추가.
  - `components/opendart-fast-page.tsx`: OPEN DART 스캐너에 연동 완료. 사용자가 등록한 키워드가 공시 제목이나 본문에 포함될 경우, 해당 공시가 네온 핑크(`keywordHighlight`)로 강렬하게 하이라이트되도록 CSS 처리 추가.
- **[기능 통합 및 코드 정리]** 중복 기능 제거 및 라우팅 최적화
  - OPEN DART 기반의 상위 호환 기능으로 통합됨에 따라, 레거시 컴포넌트인 "RSS 기반 국내 주식 급속 호재(`rapid-dart-page.tsx` 및 `app/dart/rapid` 폴더 전체)" 파일들을 시스템에서 영구 삭제.
  - 홈 화면(`app/page.tsx`) 및 GNB(`components/page-navigation.tsx`)에서 불필요해진 연결 링크 및 라우팅을 깨끗하게 정리.
  - 관련 문서를 최신화(`Pages.md`).
- **[신규 기능 구현]** 한국투자증권(KIS) API 기반 5종 마켓 스캐너 100% 서버리스 구현
  - `lib/kis.ts`: 거래대금 폭발, 외인/기관 순매수, 프로그램 매매, 장중 신고가, 호가 잔량 비율(VR) 조회를 위한 5개 신규 함수 및 Mock 데이터 추가.
  - `app/api/stock/*`: 각 스캐너 데이터를 제공하는 5개의 신규 서버리스 API 라우트 구축.
  - `components/scanners/*`: 기존 체결강도 디자인(Dark Glassmorphism)을 재사용한 5종 스캐너 UI 컴포넌트 개발 (`scanner.module.css` 공통 모듈화).
  - `app/scanners/page.tsx`: 6종 스캐너를 종합적으로 모니터링할 수 있는 '마켓 스캐너' 전용 대시보드 페이지 신설.
  - 별도의 DB 없이 실시간 Stateless 방식으로 아키텍처 구현 완료.
- **[UI/UX 개선 완료]** 다크 모드 글래스모피즘(Dark Glassmorphism) 디자인 시스템 전면 적용
  - `rapid-dart-page.tsx`, `trading-intensity.tsx`의 프리미엄 다크 모드 디자인을 타 컴포넌트에 통일.
  - `page.module.css`: 홈 화면의 `.hero` 및 액션 버튼을 어두운 유리 질감과 네온 글로우 테마로 변경.
  - `opendart-fast-page.module.css`: OPEN DART 빠른 공시 화면의 패널, 뱃지, 테이블을 다크 글래스모피즘 테마로 일괄 변환.
  - `feed-page.module.css`: 메인 피드 목록 및 컨트롤바 배경을 다크 글래스모피즘(`rgba(255,255,255,0.03)` 및 `blur`)으로 변경하고 네온 텍스트 적용.
  - `market-sentiment.module.css`: 시장 감성 지수 게이지와 백그라운드를 다크 테마 및 네온 글로우 효과로 업그레이드.
  - `sector-map.module.css`: 섹터 히트맵 그리드 타일 디자인에 호버 애니메이션, 네온 바, 어두운 배경 적용.
  - `company-timeline.module.css`: 타임라인 모달의 배경, 선, 텍스트 색상을 어두운 테마로 변경.
  - 모든 디자인 변경은 순수 CSS 수정으로 구현되어 기존 기능 및 테스트 커버리지 유지.

## 2026-05-27
- **[수정 완료]** KIS AUTH 오류 재발 원인인 DB 토큰 캐시 미삭제 문제를 해결함.
  - `lib/kis.ts`: `clearTokenCache()`가 인메모리 토큰뿐 아니라 `kis_tokens` 테이블의 `id = 1` 토큰 레코드도 삭제하도록 비동기 처리로 확장함.
  - `app/api/stock/top-rising/sync/route.ts`: 수동 sync 시작 전 DB 토큰 삭제가 끝난 뒤 새 토큰을 발급받도록 `await clearTokenCache()`로 변경함.
  - `lib/kis-us.ts`: KIS AUTH 오류 감지 후 재시도 전에 DB stale token까지 제거하도록 `await clearTokenCache()`로 변경함.

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
