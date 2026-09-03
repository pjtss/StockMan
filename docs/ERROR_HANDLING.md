# 오류 상황 및 해결 방법

이 문서는 RSS 프로젝트에서 반복적으로 발생할 수 있는 오류와 확인 순서를 관리한다. 모든 진단은 실제 응답·로그·DB 상태를 기준으로 하며, 추정만으로 토큰이나 캐시를 삭제하지 않는다.

## 공통 진단 원칙

1. 요청 ID, HTTP 상태, 외부 API 응답 코드와 메시지를 먼저 확보한다.
2. 로컬·개발·운영 실행 환경의 환경변수 주입 상태를 분리해 확인한다.
3. 기존 DB 캐시를 변경하기 전에 읽기 전용 상태를 확인한다.
4. 실패한 단일 종목 또는 단일 요청으로 재현한 뒤 전체 작업을 실행한다.
5. 한글 로그와 문서는 UTF-8을 유지한다.

## 2026-09-02 점검 기록

### 브라우저 오류 보고 폭주 및 비정상 payload 차단

- **원인**: 전역 `error`/`unhandledrejection` 이벤트가 짧은 시간에 반복되거나 배열 등 잘못된 JSON이 전송되면 인증 없는 오류 보고 API가 불필요하게 호출될 수 있었다.
- **영향**: 오류 수집 API와 Discord 진단 경로가 폭주해 정상 오류 처리와 운영 진단을 방해할 가능성이 있었다.
- **해결 위치**: `app/api/client-errors/route.ts`에서 객체 payload만 허용하고, 전달자 주소별 분당 30건으로 제한했다. 오래된 메모리 bucket은 정리한다.
- **검증**: `app/api/client-errors/route.test.ts`에 비정상 payload와 반복 요청 제한 테스트를 추가한다.

### 관리자 해외 분봉 갱신 API의 raw 예외 노출 방지

- **원인**: `app/api/admin/us-minute-candles/route.ts`가 갱신 실패 시 외부 공급자·DB 예외 메시지를 그대로 응답했다.
- **영향**: 관리자 화면에 불필요한 내부 구현 정보가 노출되고, 공급자 오류 형식에 따라 UI 처리가 달라질 수 있었다.
- **해결 위치**: JSON 객체와 거래소·티커 형식을 먼저 검증하고, 서버 로그에는 진단 메시지를 남기되 응답은 `US_MINUTE_CANDLES_REFRESH_FAILED`로 표준화했다.
- **검증**: 타입 검사와 전체 회귀 검증에서 해당 라우트의 빌드·컴파일 경로를 확인한다.

### 관리자 기능 모듈 및 공시 동기화 라우트의 예외 전파 방지

- **원인**: 기능 모듈 설정 조회, 최근 실행 이력 조회, Discord 재시도와 DART 동기화의 비동기 호출이 라우트 최상위에서 보호되지 않았다.
- **영향**: DB 또는 외부 연동 장애가 Next.js의 기본 500 응답으로 노출되고, cron 실행 결과가 표준 오류 형식 없이 종료될 수 있었다.
- **해결 위치**: 관련 라우트에 서버 로그와 표준화된 503/502 응답을 추가했다. 인증 및 정상 분기 동작은 유지한다.
- **검증**: 타입 검사·문서 검사 및 프로덕션 빌드로 라우트 컴파일 경로를 확인한다.

### KIS 외부 오류 원문 로그 길이 제한

- **원인**: 토큰 발급 및 해외 순위 조회 실패 시 공급자 응답 원문을 제한 없이 로그와 진단 저장소에 기록할 수 있었다.
- **영향**: 로그 폭주 및 공급자 응답에 포함될 수 있는 불필요한 정보의 장기 보관 위험이 있었다.
- **해결 위치**: `lib/kis-token.ts`는 500자, `lib/kis-us.ts`는 1,000자 preview만 기록하도록 제한했다.
- **검증**: 타입 검사·문서 검사와 전체 프로덕션 빌드에서 연동 모듈 컴파일 경로를 확인한다.

### Discord 오류 알림 동시 중복 전송 방지

- **원인**: 동일 오류가 전송 완료 전에 동시에 발생하면 마지막 전송 시각만 갱신되어 dedupe 검사가 통과할 수 있었다.
- **영향**: 하나의 장애가 Discord 진단 채널에 중복 게시될 수 있었다.
- **해결 위치**: `lib/production-error-reporter.ts`에 fingerprint별 in-flight 집합을 추가하고 전송 완료·실패 모두 `finally`에서 해제한다.
- **검증**: 타입 검사와 프로덕션 빌드에서 모듈 컴파일 경로를 확인한다.

### 해외 분봉 거래량 raw 응답 console 출력 제거

- **원인**: `lib/kis-us-minute-turnover.ts`가 응답 원문 전체를 운영 console에 출력했다.
- **영향**: 응답 크기에 비례한 로그 폭주와 외부 API 응답의 불필요한 노출 가능성이 있었다.
- **해결 위치**: 상태 코드·원문 byte 수·파싱된 point 수만 요약 출력하도록 변경했다. API 반환 구조의 진단 원문은 기존 계약을 유지한다.
- **검증**: 타입 검사·문서 검사와 전체 빌드로 컴파일 경로를 확인한다.

### 예외 객체 직접 console 출력 제거

- **원인**: 일부 KIS·DART·관리자 라우트가 예외 객체 자체를 console에 전달했다.
- **영향**: 예외의 stack·cause·부가 속성이 로그에 함께 직렬화될 수 있었다.
- **해결 위치**: 제한된 길이의 `Error.message` 또는 고정된 `unknown error`만 기록하도록 정리했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 관리자 KIS 수동 테스트 라우트 입력·예외 경계 보강

- **원인**: 해외 가격 상세·체결 추세 관리자 테스트가 긴/비정상 티커를 그대로 외부 API에 전달하고, 호출 예외를 라우트 밖으로 전파할 수 있었다.
- **영향**: 외부 API 오류가 기본 500으로 처리되거나, 잘못된 입력이 불필요한 외부 호출을 유발할 수 있었다.
- **해결 위치**: 두 라우트에 티커 길이·문자 검증, 예외 표준화 응답(502), 토큰 부재 503 응답을 추가했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 관리자 DB 상태 API 인증 결과 누락 보정

- **원인**: `database-status` 라우트가 `requireAdminSession()`의 반환값을 확인하지 않고 DB 상태 조회를 계속했다.
- **영향**: 관리자 세션이 없는 요청도 DB 메타데이터 조회 로직에 도달할 수 있었다.
- **해결 위치**: 인증 실패 시 즉시 401을 반환하고, DB 장애는 내부 메시지를 숨긴 503으로 표준화했다.
- **검증**: 타입 검사와 문서 검사로 라우트 컴파일·문서 일관성을 확인한다.

### 관리자 캐시·종목 universe 디버그 API 인증 결과 누락 보정

- **원인**: `daily-candle-cache-debug`와 `instrument-universe-debug`도 관리자 인증 함수의 반환값을 확인하지 않았다.
- **영향**: 비인가 요청이 캐시·종목 universe 메타데이터 조회까지 진행할 가능성이 있었다.
- **해결 위치**: 인증 실패 즉시 401을 반환하고, 조회 장애는 제한된 서버 로그와 표준 503 응답으로 처리했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 관리자 universe import API 인증 결과 누락 보정

- **원인**: universe import 라우트가 관리자 인증 함수의 반환값을 확인하지 않았다.
- **영향**: 비인가 요청이 import 관련 DB 처리 경로에 도달할 가능성이 있었다.
- **해결 위치**: 인증 실패 시 즉시 `401 UNAUTHORIZED`를 반환하도록 수정했다.
- **검증**: 인증 호출 패턴 전수 검색과 타입·문서 검사를 통과했다.

### 관리자 DB 상태 항목별 raw 오류 메시지 제거

- **원인**: 개별 테이블 상태 조회 실패 시 예외 메시지를 `tables[].error`로 그대로 반환했다.
- **영향**: SQL/스키마 내부 정보가 관리자 API 응답에 노출되고 오류 형식이 테이블마다 달라질 수 있었다.
- **해결 위치**: 서버 로그에는 500자 이내 메시지만 남기고 응답은 `TABLE_STATUS_UNAVAILABLE`로 표준화했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### BB HTML export 및 골든크로스 cache debug 예외 경계 보강

- **원인**: HTML export와 cache debug 라우트의 병렬 DB/스캐너 호출이 예외 발생 시 기본 500으로 전파될 수 있었다.
- **영향**: 다운로드·진단 기능이 일관되지 않은 오류 응답으로 종료될 수 있었다.
- **해결 위치**: 서버 로그에는 제한된 메시지만 기록하고, export는 `BB_EXPORT_UNAVAILABLE`, debug는 `DAILY_GOLDEN_CROSS_CACHE_UNAVAILABLE` 503으로 표준화했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 공개 관심종목·DART 및 관리자 import 오류 응답 표준화

- **원인**: 일부 장애 경로가 500 또는 내부 오류 문구를 사용해 API별 오류 의미가 달랐다.
- **영향**: 클라이언트가 재시도 가능 장애와 입력 오류를 구분하기 어렵고, 관리자 import 응답에 내부 메시지가 노출될 수 있었다.
- **해결 위치**: 관심종목·DART 상세/계약·관리자 universe import의 외부 오류를 각각 503/502와 고정 오류 코드로 표준화했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### SEC Discord 관리자 테스트 raw 예외 응답 제거

- **원인**: Discord 전송 중 예외가 발생하면 예외 메시지를 응답에 그대로 반환했다.
- **영향**: webhook·네트워크 내부 정보가 관리자 API 응답에 노출될 수 있었다.
- **해결 위치**: 서버 로그에는 제한된 메시지만 기록하고 응답은 `SEC_DISCORD_SEND_FAILED` 502로 표준화했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 관리자 universe import 파일명 경로 이탈 방지

- **원인**: multipart 업로드의 파일명을 임시 디렉터리 경로에 직접 결합하고 모든 수신 파일을 저장했다.
- **영향**: 비정상 파일명이 임시 디렉터리 밖을 가리킬 가능성이 있었다.
- **해결 위치**: basename 검증 후 필수 universe master 파일명만 임시 디렉터리에 저장하도록 제한했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### DART 이력 조회 와일드카드 입력

- 원인: 회사명 입력을 `ILIKE`에 그대로 전달해 `%`·`_`가 검색 패턴으로 해석될 수 있었다.
- 영향: 의도하지 않은 광범위 조회와 DB 부하가 발생할 수 있었다.
- 수정 위치: `app/api/dart/history/route.ts`.
- 조치: 와일드카드를 escape하고 `ESCAPE` 절을 적용해 입력을 리터럴 회사명으로 처리한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 해외 뉴스 거래소 입력 검증

- 원인: 해외 뉴스 API의 `exchange` 파라미터에 지원 여부 검증이 없었다.
- 영향: 잘못된 거래소 코드가 외부 조회 계층까지 전달될 수 있었다.
- 수정 위치: `app/api/stock/us/news/route.ts`, `app/api/stock/us/news/route.test.ts`.
- 조치: `NAS`, `NYS`, `AMS`만 허용하고 나머지는 `400`으로 차단한다.
- 검증: 관련 테스트 3개, `npm run typecheck`, `npm run docs:check` 통과.

### 해외 뉴스 티커 입력 검증

- 원인: 해외 뉴스 API가 비어 있지 않은 모든 티커 문자열을 외부 조회로 전달했다.
- 영향: 비정상적으로 긴 문자열이나 허용되지 않은 문자가 외부 계층까지 전달될 수 있었다.
- 수정 위치: `app/api/stock/us/news/route.ts`.
- 조치: 티커를 대문자 정규화하고 영숫자·`. / _ -`만 허용하며 최대 32자로 제한한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### DART 순위·이력 API 오류 및 입력 크기

- 원인: 순위 API가 내부 예외를 일반화하지 않았고, 이력 API의 회사명 입력 길이를 제한하지 않았다.
- 영향: 장애 정보가 일관되지 않게 노출되고 과도한 조회 입력이 처리될 수 있었다.
- 수정 위치: `app/api/dart/ranking/route.ts`, `app/api/dart/history/route.ts`.
- 조치: 회사명을 200자로 제한하고 장애 응답을 `503`으로 표준화한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 다중시간대 BB 반등 스캐너 오류·limit 입력

- 원인: 보호된 반등 스캐너가 예외 원문을 반환하고 `limit`을 제한하지 않았다.
- 영향: 내부 정보가 노출될 수 있고 과도한 스캔 범위가 요청될 수 있었다.
- 수정 위치: `app/api/scan/multi-timeframe-bb-rebound/route.ts`.
- 조치: `limit`을 1~100으로 정규화하고, 장애를 `503 MULTI_TIMEFRAME_BB_REBOUND_UNAVAILABLE`으로 변환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 다중시간대 BB 스캐너 오류 상세 노출

- 원인: 보호된 스캐너 라우트가 예외 원문을 응답에 포함했다.
- 영향: 외부 API·DB 내부 정보가 노출될 수 있었다.
- 수정 위치: `app/api/scan/multi-timeframe-bb-pullback/route.ts`.
- 조치: 서버 로그에만 원인을 기록하고 `503 MULTI_TIMEFRAME_BB_SCAN_UNAVAILABLE`을 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 공개 US OBV·ADL 스캐너 오류 상세 노출

- 원인: 스캐너 예외의 원문 메시지를 공개 API 응답에 포함했다.
- 영향: 외부 API·DB 내부 정보가 노출될 수 있었다.
- 수정 위치: `app/api/scan/us-daily-sideways-obv-adl/route.ts`.
- 조치: 서버 로그에만 원인을 기록하고 `503 US_OBV_ADL_SCAN_UNAVAILABLE`을 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 푸시 API 오류 상세 노출

- 원인: 푸시 상태 조회·테스트 발송 API가 예외 메시지를 응답에 그대로 포함했다.
- 영향: DB 또는 환경 설정의 내부 정보가 공개될 수 있었다.
- 수정 위치: `app/api/push/subscribe/route.ts`, `app/api/push/test/route.ts`.
- 조치: 원인은 서버 로그에만 기록하고 사용자 응답은 일반화된 `503`으로 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 공개 DART·SEC 피드 오류 상세 노출

- 원인: 피드 동기화 예외의 `message`를 공개 API 응답에 그대로 반환했다.
- 영향: 외부 API·DB 내부 정보가 사용자에게 노출될 수 있었다.
- 수정 위치: `app/api/dart/route.ts`, `app/api/sec/route.ts`.
- 조치: 서버 로그에만 진단 정보를 기록하고, 클라이언트에는 일반화된 `503` 응답을 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 차트 API 오류 상세 노출 및 입력 크기

- 원인: 예외 메시지를 그대로 응답하고 `code`·`company` 길이를 제한하지 않았다.
- 영향: 내부 구현 정보가 사용자에게 노출될 수 있고 과도한 입력이 처리 경로에 유입될 수 있었다.
- 수정 위치: `app/api/stock/chart/route.ts`.
- 조치: 코드·회사명 길이를 제한하고 서버 로그만 원인 메시지를 기록하며 클라이언트에는 일반화된 오류를 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 해외 지표·상승종목 API 외부 장애

- 원인: DMI·MACD·상승종목 라우트가 외부 API 또는 저장소 예외를 직접 전파할 수 있었다.
- 영향: 장애 시 표준 JSON 대신 프레임워크 기본 오류 응답이 반환될 수 있었다.
- 수정 위치: `app/api/stock/us/dmi/route.ts`, `app/api/stock/us/macd/route.ts`, `app/api/stock/us/top-rising/route.ts`.
- 조치: 실패를 도메인별 `503` 응답으로 변환하고 내부 오류 상세를 노출하지 않는다.
- 검증: `npm run typecheck`, `npm run docs:check`, `npm run build` 통과.

### 해외 AMS 스카우트 API 외부 장애

- 원인: AMS 스카우트 외부 호출 예외가 라우트 경계 밖으로 전파될 수 있었다.
- 영향: 일시적인 외부 장애 시 기본 오류 응답이 반환될 수 있었다.
- 수정 위치: `app/api/stock/us/ams-scout/route.ts`.
- 조치: 예외를 `503 US_AMS_SCOUT_UNAVAILABLE`로 변환하고 캐시를 금지한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 자동화 설정 API DB 장애

- 원인: 자동화 주기 설정 조회의 DB 예외 경계가 없었다.
- 영향: 장애 시 Next.js 기본 오류 응답이 반환될 수 있었다.
- 수정 위치: `app/api/automation-settings/route.ts`.
- 조치: DB 조회 실패를 `503 AUTOMATION_SETTINGS_UNAVAILABLE` JSON 응답으로 변환하고 캐시를 금지한다.
- 검증: `app/api/automation-settings/route.test.ts` 2개, `npm run typecheck`, `npm run docs:check` 통과.

### 관심종목 API 입력 검증

- 원인: 잘못된 JSON·배열·비문자 코드가 예외 경로로 흘러가거나 과도하게 긴 코드가 저장 로직까지 전달될 수 있었다.
- 영향: 클라이언트가 일관되지 않은 `500` 응답을 받을 수 있고, 불필요한 입력이 DB 계층까지 도달할 수 있었다.
- 수정 위치: `app/api/watchlist/route.ts`.
- 조치: JSON 객체와 문자열 코드만 허용하고, 시장 코드 및 32자 길이를 검증한다. 잘못된 입력은 `400 INVALID_ITEM`으로 반환한다.
- 검증: `app/api/watchlist/route.test.ts` 4개, `npm run typecheck`, `git diff --check` 통과.

### 클라이언트 오류 보고 payload 및 Discord 재시도

- 원인: 브라우저 오류 보고 API가 요청 형식과 payload 크기를 제한하지 않았고, Discord 전송 전에 중복 억제 상태를 기록했다.
- 영향: 비정상·과대 요청이 처리될 수 있으며, Discord가 일시적으로 실패하면 같은 오류가 60초 동안 재전송되지 않았다.
- 수정 위치: `app/api/client-errors/route.ts`, `lib/production-error-reporter.ts`.
- 조치: JSON Content-Type·64KB 본문·메시지·경로 길이를 검증하고, Discord 전송 성공 시에만 중복 억제 상태를 기록한다. 보고 실패는 원 요청을 실패시키지 않는다.
- 검증: `app/api/client-errors/route.test.ts` 3개, `npm run typecheck`, `npm run docs:check` 통과.

### 문의 API DB 장애 응답

- 원인: 문의 목록 조회와 작성 핸들러가 DB 예외를 프레임워크 기본 오류 응답으로 남길 수 있었다.
- 영향: 클라이언트가 JSON 대신 HTML 오류 응답을 받아 후속 파싱 오류가 발생할 수 있었다.
- 수정 위치: `app/api/inquiries/route.ts`.
- 조치: 목록 조회는 `503 INQUIRIES_UNAVAILABLE`, 작성은 `503 INQUIRY_CREATE_FAILED` JSON으로 변환한다.
- 검증: `app/api/inquiries/route.test.ts` 2개, `npm run typecheck`, `npm run docs:check` 통과.

### React 오류 경계의 서버 모듈 번들 유입

- 원인: `app/error.tsx`에서 서버 전용 오류 보고 모듈을 직접 import해 `pg`의 `fs`·`net`·`dns` 의존성이 브라우저 번들에 포함됐다.
- 영향: Next.js 프로덕션 빌드가 `Module not found` 오류로 실패했다.
- 수정 위치: `app/error.tsx`.
- 조치: 오류 경계는 서버 모듈 대신 `/api/client-errors`를 호출하도록 분리했다. React 렌더링 오류는 복구 버튼으로 재시도할 수 있다.
- 검증: `npm run typecheck`, `npm run build` 통과.

### 문의 상세·상호작용 API 예외 경계

- 원인: 상세 ID 검증과 DB 예외 변환 없이 문의·댓글·좋아요·조회수 API가 DB를 호출했다.
- 영향: 잘못된 URL이나 DB 장애가 프레임워크 기본 오류 응답 또는 처리되지 않은 예외로 노출될 수 있었다.
- 수정 위치: `app/api/inquiries/[id]/route.ts`, `app/api/inquiries/[id]/comments/route.ts`, `app/api/inquiries/[id]/likes/route.ts`, `app/api/inquiries/[id]/views/route.ts`.
- 조치: ID를 사전 검증하고 DB 장애를 도메인별 `503` JSON 응답으로 변환한다. 기존 상세 조회의 `404` 계약은 유지했다.
- 검증: 관련 API 테스트 6개, `npm run typecheck`, `npm run docs:check` 통과.

### 스캐너·관리자 활동 조회 query 파라미터

- 원인: `limit`, `hours`에 `NaN`, 소수, 음수, 과대값이 들어와 내부 조회 함수까지 전달될 수 있었다. 관리자 활동 조회 DB 예외도 별도 응답 처리가 없었다.
- 영향: 비정상 조회 범위, DB 쿼리 오류, 관리자 화면의 JSON 파싱 실패 가능성이 있었다.
- 수정 위치: `app/api/scan/multi-timeframe-recommendations/route.ts`, `app/api/admin/user-activity/route.ts`.
- 조치: 정수 변환·최소/최대 범위 검증과 기본값을 적용하고, 관리자 활동 DB 장애는 `503 USER_ACTIVITY_UNAVAILABLE`로 변환한다.
- 검증: 관련 테스트 7개, `npm run typecheck` 통과.

### 해외 MFI 스캐너 입력값

- 원인: 공개·관리자 MFI API가 `period`와 `threshold`의 비정상 숫자 입력을 내부 스캐너에 그대로 전달할 수 있었다.
- 영향: `NaN` 또는 비정상 기간으로 캔들 조회와 지표 계산이 실패할 가능성이 있었다.
- 수정 위치: `app/api/stock/us/mfi-oversold/route.ts`, `app/api/admin/us-mfi-test/route.ts`.
- 조치: 기간을 2~200 정수, 임계값을 0~100 범위로 보정하고 공개 API DB 장애를 `503` JSON으로 변환한다.
- 검증: MFI 테스트 2개, `npm run typecheck` 통과.

### 루트 레이아웃 오류 복구

- 원인: 루트 레이아웃에서 예외가 발생하면 일반 세그먼트 오류 경계가 렌더링되지 않을 수 있었다.
- 영향: 사용자가 복구 버튼 없이 기본 오류 화면에 머물 가능성이 있었다.
- 수정 위치: `app/global-error.tsx`.
- 조치: 전역 오류 화면과 다시 시도 버튼을 제공하고, 오류를 `/api/client-errors`로 보고한다.
- 검증: `npm run typecheck`, `npm run build` 통과.

## KIS API 오류

### `EGW00103` / 유효하지 않은 AppKey

- 확인: `KIS_APPKEY`와 `KIS_APPSECRET`의 존재 여부, 앞뒤 공백, 실행 프로세스에 실제 주입된 값의 길이를 마스킹 상태로 확인한다.
- 주의: `scripts/dev-server.mjs`가 KIS 환경변수를 삭제하면 유효한 상위 환경변수 대신 오래된 `.env.local` 값이 사용될 수 있다.
- 해결: 실행 환경변수 삭제 로직을 제거하고, 삼성전자 등 단일 종목의 동일 수집 경로를 먼저 재시험한다. 성공 후 전체 캐시 갱신을 시작한다.
- 금지: `EGW00103`만 보고 DB 토큰을 삭제하거나 임의로 새 토큰을 반복 발급하지 않는다.

### HTTP 401 / `EGW00123` 인증 만료

- 해결: `buildKisAuthorization(DB_TOKEN)`으로 Authorization을 구성했는지 확인한다.
- 인증 실패가 명시된 경우에만 토큰 수명주기 모듈에서 인메모리 캐시와 DB 토큰을 함께 초기화한 뒤 재발급한다.
- 일반 AUTH 문자열이나 일시적 HTTP 오류만으로 유효한 공유 토큰을 삭제하지 않는다.

### HTTP 500 또는 일시적 네트워크 오류

- 확인: `httpStatus`, `rt_cd`, `msg_cd`, `msg1`, endpoint, `tr_id`, request ID를 기록한다.
- 해결: 공통 재시도 정책을 사용하고, 실패 캔들은 retry queue에 기록한다.
- 전체 작업은 부분 실패를 허용하되, 저장된 캔들만 후속 지표 캐시에 반영한다.

### 빈 `output2` 또는 캔들 부족

- 원인 후보: 종목 코드·시장 코드 불일치, 거래정지, 장외 시간, API 응답 범위 부족.
- 해결: 코드와 시장을 확인하고, 응답의 날짜·캔들 수를 기록한다. Mock 데이터를 운영 결과로 반환하지 않는다.

## 국내 일봉 캐시 갱신 오류

### `outside_schedule` 또는 `disabled`

- cron 라우트의 운영 시간·활성화·간격 설정 결과다.
- 사용자가 수동 갱신을 요청한 경우 스케줄을 우회하는 인증된 수동 실행 경로를 사용한다.

### 전체 갱신이 지나치게 오래 걸림

- 원인: 국내 유니버스 전체에 종목별 KIS 요청을 수행하기 때문이다.
- 해결: 동시성은 KIS 제한을 넘지 않도록 유지하고, 진행률·최근 코드·성공·실패·예상 잔여 시간을 확인한다.
- 중단 시 이미 저장된 성공 캔들은 보존하며, 실패 항목은 retry queue에서 재처리한다.

## DB 오류

### `DATABASE_URL 환경변수가 설정되지 않았습니다.`

- 직접 실행 시 `.env.local`이 자동 로드되지 않을 수 있다.
- 개발 서버는 Next 환경 로딩을 사용하고, 직접 실행은 프로젝트 표준 환경 로딩 방식을 사용한다.
- DB 연결 호스트·포트·데이터베이스명은 로그에 비밀값 없이 확인한다.

### 테이블 또는 컬럼 없음

- 애플리케이션에서 임의 DDL을 실행하지 않는다.
- `npm run docs:check`와 스키마 상태를 확인하고, Flyway migration을 프로젝트 배포 절차에 따라 적용한다.

## 예약 작업 오류

### HTTP 메서드 불일치

- 예약 함수와 Next API가 같은 메서드와 공용 application service를 사용하는지 확인한다.
- 예약 계층에 비즈니스 로직을 복제하지 않는다.

### 중복 실행

- automation run 상태와 interval을 확인한다.
- 서버리스 인스턴스 간 중복 방지는 DB 잠금·실행 기록을 사용한다.

## 프론트엔드 오류

### 내부 요청 로그 수집 실패

- 요청 로그 수집은 관측용 best-effort 기능이므로 지역 추론 실패가 로그 저장을 중단시키지 않도록 한다.
- 요청 ID·경로·User-Agent·IP는 저장 전에 길이를 제한해 비정상적으로 큰 헤더나 본문으로 인한 로그 오염을 방지한다.
- DB 저장 실패는 구조화된 `REQUEST_LOG_UNAVAILABLE` 503으로 반환하고, 인증되지 않은 요청은 DB에 접근하기 전에 401로 종료한다.
- 내부 KIS 디버그 로그 API도 관리자 세션을 요구하며, 커서 값은 음수가 아닌 안전한 정수만 허용한다.
- 관리자 디버그 조회와 종목명 조회의 DB 오류는 예외·SQL을 노출하지 않고 기능별 503 오류 코드로 반환한다. 종목명 조회 코드는 최대 100개로 제한한다.
- 관리자 분봉 일괄 갱신의 작업량·동시성은 유한한 정수 범위로 정규화하고, 수집 실패는 `KR_MINUTE_REFRESH_FAILED`로 반환한다.
- 관리자 DB 조회는 `limit`을 1~100의 유한 정수로 정규화하고, 스키마·컬럼·행 조회 오류는 `DATABASE_READ_FAILED`로 반환한다.
- 웹 푸시 구독 API는 endpoint·암호화 키 길이와 boolean 설정값을 검증하고, malformed payload 및 저장 실패를 구분된 오류 코드로 반환한다.
- 공개 RSS·종목 뉴스 조회는 비정상 `limit`을 제한하고 DB 장애 시 내부 예외 대신 503 기능 오류 코드를 반환한다.
- 공개 해외 뉴스·추천 API는 내부 예외 메시지를 외부에 노출하지 않고 기능별 503 오류 코드로 반환한다.
- 공지 작성은 검증 오류만 400으로 반환하고 DB·예상 외 오류는 `NOTICE_CREATE_FAILED` 503으로 분리한다.
- 관리자 헬스체크 실패는 내부 예외 메시지 대신 `HEALTH_CHECK_UNAVAILABLE`로 반환하고 요청 ID만 추적 정보로 유지한다.
- Discord 서명 검증을 통과한 malformed JSON·payload도 파싱 예외로 500이 되지 않도록 `400 INVALID_JSON/INVALID_PAYLOAD`로 종료한다.
- Telegram webhook은 `TELEGRAM_WEBHOOK_SECRET`이 설정된 경우 `x-telegram-bot-api-secret-token`을 검증하고, malformed payload·처리 실패를 구조화된 오류로 반환한다.
- 공개 헬스 API는 상세 DB·환경·자동화 정보를 반환하지 않고 상태·시각·지연·요청 ID만 노출한다. 헬스 계산 자체가 예외가 되면 503 degraded로 응답한다.
- 세션 상태 조회는 DB 장애 시 인증되지 않은 것으로 조용히 오판하지 않고 `503 AUTH_STATUS_UNAVAILABLE`을 반환한다.
- 공개 스크리너와 관리자 기술 분석 API는 비정상 limit을 제한하고 내부 예외 대신 기능별 503 오류 코드를 반환한다.

### `startsWith` 또는 필드 접근 런타임 크래시

- 외부 API 필드는 `undefined`·`null`·예상 외 타입을 허용한다.
- 옵셔널 체이닝과 안전한 기본값을 사용하고, 누락 데이터를 Mock으로 바꾸지 않는다.

### 모바일 화면 우측 잘림

- 고정 폭·nowrap·grid 최소 폭을 확인한다.
- 좁은 화면에서는 flex 가로 스크롤 또는 행 분할 grid를 사용하고 페이지 전체 가로 overflow를 방지한다.

## 문서·인코딩

- 한글이 깨진 파일은 부분 패치보다 UTF-8 기준 전체 교체를 우선 검토한다.
- 오류 해결 후 원인·영향·수정 파일·검증 명령을 이 문서 또는 `AGENTS.md` 개선 로그에 기록한다.

### 관리자·cron 예외 메시지 외부 노출 방지

- **원인**: 일부 수동 테스트 및 캐시 갱신 라우트가 예외의 원문을 JSON 응답에 포함했다.
- **영향**: 내부 DB/API 오류 정보가 관리자 화면 또는 호출자에게 노출될 수 있었다.
- **해결**: 서버 로그에는 길이 제한된 메시지만 남기고, 응답에는 고정 오류 코드(`DAILY_MA9_TEST_FAILED`, `KR_DAILY_CACHE_FAILED`, `US_DAILY_CACHE_FAILED`)만 반환하도록 수정했다.
- **검증**: `npm run typecheck`, `npm run docs:check`, `npm test -- --run`.

같은 정책을 해외 일봉 breakout·indicator·open-cache 및 Bollinger·breaking-news·minute 지표 cron에도 적용했다.

푸시 구독 저장·설정 변경도 입력 오류(400)와 저장소 장애(503)를 분리하고 서버 로그를 추가했다.

## 검증 명령

### 의존성 감사

- 현재 `npm audit --omit=dev --audit-level=high`에서 `postcss` 고위험 1건과 `fast-xml-parser` 중간 위험 2건이 확인된다.
- 자동 해결은 Next.js 16 및 fast-xml-parser 5.x로의 호환성 변경을 포함하므로, 회귀 검증 없이 `--force` 업그레이드하지 않는다.

```powershell
npm run typecheck
npm run docs:check
npm test -- --run
```
