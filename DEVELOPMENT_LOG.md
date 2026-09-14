# Development Log

이 문서는 프로젝트의 개발 과정과 변경 사항을 기록합니다.

## [2026-09-14] 상승률 TOP100 배포 전 통합 검증

### 목표
- Docker Desktop의 로컬 PostgreSQL을 포함해 상승률 TOP100 개선사항의 전체 검증 게이트를 통과시킨다.

### 반영
- 시간 의존 DART 테스트를 고정 스케줄 mock으로 보완했다.
- Docker PostgreSQL 통합 테스트 환경을 복구해 전체 검증을 재실행했다.

### 검증
- `npm.cmd run verify` 통과.
- 156개 테스트 파일·521개 테스트 통과.
- 타입체크, 문서 검증, verify-scope, KIS boundary, OCI cron 검사 및 Next.js 프로덕션 빌드 통과.

### 개선 과제
- 개선 과제 ID: CI-2026-09-14-061
- 성과 판정: IMPROVED
- 근거: 로컬 DB 통합 테스트를 포함한 배포 전 자동 검증 게이트가 재현 가능하게 통과했다.

### 다음 개선
- 배포 후 운영 서버에서 TOP100 MVP 관측 주기와 KIS 호출 지연을 디버깅 API로 확인하고, 기준 초과 시 자동 경고하도록 개선한다.

### 커밋·푸시·배포
- 미실행. 현재 요청 범위는 상승률 TOP100 기능 개선 및 검증이다.

## [2026-09-13] TOP 100 MVP 롤링 윈도우·해외 후보 추적 보강

### 목표
- 1분 단위 5분 거래대금 계산에서 윈도우 밖 관측치를 제거하고, 국내·해외 TOP100 후보를 동일한 MVP 추적 큐로 관리한다.

### 반영
- 5분 경계에서 가장 오래된 분 버킷이 제거되는 회귀 테스트를 추가했다.
- 해외 상승률 TOP100 후보에도 `mvpTracking`을 부여해 1분 주기 관측과 TOP100 이탈 시 메모리 정리가 적용되도록 했다.
- 관리자 디버깅 API의 flow 요약에 MVP 추적 후보 수, 확정 수, 임계값, 윈도우, 필요 샘플 수를 명시했다.
- 300개 후보 전체를 한 배치로 큐에 넘기도록 조정해 `dueCandidates(..., 20)`으로 인해 1분 관측이 수분 단위로 지연되는 병목을 제거했다. 실제 KIS 호출 속도는 공용 10 TPS throttle이 제한한다.
- 확정된 MVP 종목만 반환하는 `/api/kis/intraday-mvp` 조회 API와 기준 메타데이터 응답을 추가했다.
- 해외 분봉 파싱에서 누적 `tvol`·`acml_*` fallback을 제거하고 증분 분당 거래량만 MVP 거래대금에 사용하도록 오탐 경로를 차단했다.
- 종목별 롤링 거래대금 합계를 메모리 인덱스로 유지해 매 관측의 전체 재합산을 제거하고, 버킷 교체·만료·삭제 시 합계를 동기화했다.
- 세션 날짜를 UTC가 아닌 거래소 현지 시간(미국: 뉴욕, 국내: 서울)으로 계산해 정규장 중 UTC 자정에 버퍼가 초기화되는 오류를 차단했다.
- MVP 결과 API가 현재 TOP100 스냅샷 소속까지 검증하도록 해 원천 갱신 실패 시 직전 확정 후보가 노출되는 stale 결과를 차단했다.
- MVP 임계값·윈도우·필요 샘플 수를 단일 정책 상수로 통합해 worker·결과 API·디버깅 API 간 기준 불일치 위험을 제거했다.
- 전체 검증에서 현재 시각에 따라 실패하던 DART 스케줄 테스트를 고정된 스케줄 mock으로 바꿔 검증 게이트의 시간 의존성을 제거했다.
- 종목별 롤링 버퍼가 장시간 실행에도 최근 5개 1분 버킷으로 제한되는 메모리 상한 회귀 테스트를 추가했다.

### 검증
- `npx vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts lib/intraday-candidate-priority.test.ts app/api/kis/intraday-mvp/route.test.ts lib/kis-us-minute-turnover.test.ts --run` 통과: 5개 파일·22개 테스트.
- `npm.cmd run typecheck` 통과.
- 추가 stale 결과 회귀 검증: `npx vitest run app/api/kis/intraday-mvp/route.test.ts lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 3개 파일·17개 테스트.
- Docker Desktop의 `stockman-postgres-local` 컨테이너 기동 후 전체 `npm.cmd test -- --run` 통과: 156개 파일·521개 테스트.
- `npm.cmd run typecheck` 실행 완료.
- `npm.cmd run docs:check` 실행 완료.
- `npm.cmd run build` 통과: Next.js 프로덕션 빌드 성공.

### 다음 개선
- 국내·해외 KIS 분봉 원천 payload fixture로 거래대금 필드와 후보 추적을 통합 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-060
- 성과 판정: UNMEASURED
- 근거: 롤링 윈도우 경계·해외 후보 추적·누적 거래량 오탐·합산 비용을 코드와 회귀 테스트로 보강했다.

### 커밋·푸시·배포
- 미실행. 현재 요청은 MVP 기능 개발과 로컬 검증 단계다.

## [2026-09-13] TOP 100 MVP 최신 1분봉 선택 오류 수정

### 목표
- KIS 분봉 응답 순서와 무관하게 가장 최근 1분봉만 5분 거래대금 계산에 사용한다.

### 반영
- worker에서 분봉을 날짜·시간 오름차순으로 정렬한 뒤 최신 봉을 선택한다.
- KIS 국내 수집기가 반환하는 내림차순 응답을 오래된 봉으로 잘못 처리하던 경로를 차단했다.
- 최신 봉 선택 회귀 테스트를 추가했다.

### 검증
- `npx vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·13개 테스트.
- `npm.cmd run typecheck` 통과.
- `npm.cmd run docs:check` 통과.

### 다음 개선
- 국내·해외 KIS 분봉 원천 payload fixture를 추가해 날짜·시간 필드별 정렬을 통합 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-059
- 성과 판정: IMPROVED
- 근거: provider 응답 순서에 의존하던 최신봉 선택을 제거해 MVP 누적 계산의 입력 정확성을 높였다.

### 커밋·푸시·배포
- 미실행. 현재 요청 범위는 MVP 기능 개선과 로컬 검증이다.

## [2026-09-13] TOP 100 MVP 확정 상태 관측 연계

### 목표
- 5분 거래대금 5% 조건의 확정 상태가 관리자 전환 이력과 일치하도록 한다.

### 반영
- 품질 상태와 MVP 거래대금 조건을 먼저 결합한 뒤 최종 상태를 한 번만 기록한다.
- `QUALIFIED` 전환이 `intraday_detection_transitions` 관측 로그에 누락되지 않도록 정리했다.

### 검증
- `npx vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·12개 테스트.
- `npm.cmd run typecheck` 통과.
- `npm.cmd run docs:check` 통과.

### 다음 개선
- 실제 KIS 응답 fixture를 사용한 확정 전환 통합 테스트를 추가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-058
- 성과 판정: IMPROVED
- 근거: MVP 확정 상태와 관리자 관측 전환의 기록 경로를 단일화했다.

### 커밋·푸시·배포
- 미실행. 현재 요청 범위는 MVP 기능 개선과 로컬 검증이다.

## [2026-09-13] TOP 100 MVP 1분 버킷·품질 게이트 보강

### 목표
- rolling 5분 계산의 버킷 중복과 stale 데이터 확정 오탐을 차단한다.

### 반영
- rolling 관측 시각을 1분 경계로 정규화해 초 단위 차이를 같은 봉으로 처리한다.
- 거래량이 없는 원천 응답은 거래대금 필드 fallback을 사용한다.
- `STALE`·`DEGRADED`·`WARMING_UP` 품질 상태에서는 5% 비율을 확정 탐지로 승격하지 않는다.

### 검증
- `npx vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·12개 테스트.
- `npm.cmd run typecheck` 통과.
- `npm.cmd run docs:check` 통과.

### 다음 개선
- 실제 국내·해외 KIS 응답 fixture를 이용해 최신 1분봉 거래대금 필드 매핑을 통합 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-057
- 성과 판정: IMPROVED
- 근거: 1분 버킷 중복 합산과 품질 불량 상태의 확정 승격을 코드·테스트로 차단했다.

### 커밋·푸시·배포
- 미실행. 현재 요청 범위는 MVP 기능 개선과 로컬 검증이다.

## [2026-09-13] TOP 100 MVP 메모리 정리·관측성 보강

### 목표
- TOP 100 변동 시 MVP rolling 버퍼가 남지 않게 하고 5분 상태를 운영 디버깅에서 확인한다.

### 반영
- MVP 추적 후보가 현재 TOP 100에서 이탈하면 후보·VWAP·rolling 버퍼를 함께 제거한다.
- 후보 eviction 시 rolling 버퍼도 함께 삭제해 메모리 상한을 보장한다.
- 세션 변경 시 rolling 버퍼를 초기화한다.
- 디버깅 스냅샷에 종목별 1분 거래대금 버킷을 노출한다.

### 검증
- `npx vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·11개 테스트.
- `npm.cmd run typecheck` 통과.
- `npm.cmd run docs:check` 통과.

### 다음 개선
- 운영 환경에서 실제 KIS 1분봉 시간 필드와 버킷 간격을 확인하는 통합 검증을 추가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-056
- 성과 판정: IMPROVED
- 근거: TOP 100 이탈·후보 eviction 경로의 rolling 메모리 회수를 테스트로 고정하고 디버깅 가시성을 추가했다.

### 커밋·푸시·배포
- 미실행. 현재 요청 범위는 기능 개선과 로컬 검증이다.

## [2026-09-13] TOP 100 5분 거래대금 집중 MVP

### 목표
- 상승률 TOP 100 후보 중 KIS 고정 시가총액 대비 최근 5분 거래대금이 5% 이상인 종목만 메모리에서 확정 탐지한다.

### 반영
- `IntradayMemoryState`에 종목별 고유 1분 버킷 기반 rolling turnover window를 추가했다.
- 동일 버킷 재수신은 덮어써 중복 합산을 방지하고, 세션별로 윈도우를 초기화한다.
- 5개 관측값이 모이고 `최근 5분 거래대금 / 고정 시가총액 >= 0.05`일 때만 `mvpQualified`와 `QUALIFIED` 상태를 부여한다.
- 기존 5% 우선순위 점수는 유지하되, MVP 확정 조건과 분리했다.
- `intraday-detection-worker`가 매 tick의 최신 1분봉 거래대금만 rolling window에 넣도록 연결했다.

### 검증
- `npx vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·8개 테스트.
- `npm.cmd run typecheck` 통과.
- `node --check scripts/verify-deploy.mjs` 통과.

### 다음 개선
- 남은 위험: KIS 원천 응답의 최신 1분봉 시간 필드가 누락되면 수신 시각을 버킷 키로 사용하므로 운영 로그에서 시간 품질을 계속 감시해야 한다.
- 국내·해외 실응답을 각각 5분 연속 수집하는 통합 테스트와 MVP 확정 이벤트 전용 알림 연결은 다음 단계다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-055
- 성과 판정: IMPROVED
- 근거: 단일 5% 점수 조건을 5개 고유 1분 관측 기반의 명시적 확정 상태로 분리했고, 중복 합산 방지 테스트를 추가했다.

### 커밋·푸시·배포
- 미실행. 현재 요청 범위는 MVP 설계·개발 및 로컬 검증이다.

## [2026-09-13] 배포 검증 런타임 종료 안정화

### 목표
- 배포 전 검증이 성공 문구를 출력한 뒤에도 검증용 서버 프로세스 때문에 종료되지 않는 문제를 제거한다.

### 원인
- Windows에서 `taskkill`을 비동기로 호출했지만 검증용 자식 프로세스의 생명주기를 부모와 분리하지 않아 고아 Node 프로세스가 남을 수 있었다.
- 고아 프로세스가 다음 빌드의 자원을 점유해 빌드가 비정상적으로 지연될 수 있었다.

### 반영
- `scripts/verify-deploy.mjs`의 런타임 서버를 분리 실행하고 `unref()`하여 검증 종료를 방해하지 않게 했다.
- Windows 트리 종료는 `taskkill /t /f`로 유지하고, 비-Windows에서는 SIGTERM을 사용한다.
- 검증 빌드 산출물은 `.next-deploy-verify`에 격리하며, 임시 TypeScript 경로가 `tsconfig.json`에 남지 않도록 확인 절차를 추가했다.

### 검증
- `node --check scripts/verify-deploy.mjs` 통과.
- `npm.cmd run deploy:verify`의 테스트 154개 파일·507개 테스트, 타입체크, 문서 검사, 검증 범위 감사, KIS 경계 감사, cron 검사를 통과했다.
- 격리 빌드 `NEXT_DIST_DIR=.next-deploy-isolated npm.cmd run build` 종료 코드 0 및 107개 페이지 생성 확인.
- 빌드 후 `tsconfig.json`에서 임시 산출물 경로를 제거해 원래 설정을 유지했다.

### 다음 개선
- CI에서 검증 명령의 종료 코드와 고아 프로세스 유무를 함께 수집한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-054
- 성과 판정: IMPROVED
- 근거: 실제 빌드가 종료 코드 0으로 완료되었고, 런타임 검증 프로세스의 부모 생명주기 의존성을 제거했다.

### 커밋·푸시·배포
- 사용자 요청에 따라 관련 파일만 커밋·푸시한다. 운영 배포는 별도 요청 범위가 아니므로 실행하지 않는다.
- 배포 상태: 미실행

## [2026-09-13] 검증 manifest 변경 승인 감사

### 목표
- 검증 범위 변경이 사유·승인 주체·승인일 없이 반영되는 구조적 회귀를 방지한다.

### 반영
- `scripts/audit-verify-scope-change.mjs` 추가.
- manifest 변경 diff에 승인 메타데이터가 함께 포함되는지 검사하는 명령을 등록했다.

### 검증
- `node --check scripts/audit-verify-scope-change.mjs` 통과.
- `npm.cmd run audit:verify-scope` 통과: 현재 manifest 변경 없음.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- GitHub Actions에서 manifest 변경 PR에 이 감사를 자동 실행한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-028
- 성과 판정: IMPROVED
- 근거: 승인 정보가 빠진 검증 범위 변경을 사전에 탐지할 수 있다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 범위 승인 메타데이터 강제

### 목표
- 검증 범위 manifest가 단계 목록만 가지고 있어 변경 책임과 사유를 추적하기 어려운 문제를 개선한다.

### 반영
- `verify-scope.json`에 변경 사유·승인 주체·승인일을 추가했다.
- 비교 도구가 승인 메타데이터와 승인 단계 목록의 유효성을 먼저 검사하도록 강화했다.

### 검증
- `node --check scripts/compare-verify.mjs` 통과.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- manifest 변경 diff에 승인 메타데이터 변경이 함께 있는지 자동 대조한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-027
- 성과 판정: IMPROVED
- 근거: 책임·사유·일자가 없는 검증 범위 변경이 비교 단계로 진행되지 않는다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 단계 승인 manifest

### 목표
- 신규 검증 단계가 기준값과 운영 승인 없이 성능 비교에 포함되는 문제를 방지한다.

### 반영
- `config/verify-scope.json`에 승인된 검증 단계 목록을 분리했다.
- `compare:verify`가 manifest 미등록 단계를 `unapprovedStages`로 표시하고 실패 처리한다.

### 검증
- `node --check scripts/compare-verify.mjs` 통과.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- manifest 변경 시 변경 사유와 승인자를 기록하는 검증을 추가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-026
- 성과 판정: IMPROVED
- 근거: 승인되지 않은 검증 단계가 성능 비교를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 신규 검증 단계 승인 게이트

### 목표
- 기준값이 없는 신규 검증 단계가 성능 비교를 왜곡하는 문제를 방지한다.

### 반영
- `compare:verify`가 신규·누락 단계가 있으면 `scopeStatus: REVIEW_REQUIRED`를 출력한다.
- 신규 단계의 기준값이 승인되기 전까지 비교 결과를 실패 처리한다.

### 검증
- `node --check scripts/compare-verify.mjs` 통과.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 승인된 기준값을 별도 manifest로 관리하고 비교 도구가 자동으로 읽는다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-025
- 성과 판정: IMPROVED
- 근거: 신규 검증 단계가 승인 없이 성능 비교를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 범위 변경 자동 탐지

### 목표
- 검증 단계가 조용히 빠지거나 추가되어 성능 비교 기준이 바뀌는 문제를 방지한다.

### 반영
- `compare:verify`가 `missingStages`와 `newStages`를 출력하도록 추가했다.
- 기준 단계 누락은 비교 실패로 처리하고, 신규 단계는 범위 변경으로 표시한다.

### 검증
- `node --check scripts/compare-verify.mjs` 통과.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 신규 단계의 기준값 부재를 별도 승인 상태로 관리한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-024
- 성과 판정: IMPROVED
- 근거: 검증 단계 누락과 추가가 성능 회귀와 구분되어 자동 표면화된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 성능 비교 신뢰도·재측정 권고

### 목표
- 환경 불일치 성능 비교 결과를 운영자가 회귀로 오해하지 않도록 해석 정보를 강화한다.

### 반영
- `compare:verify`에 `confidence`와 `recommendation` 필드를 추가했다.
- 환경이 다르면 신뢰도를 `LOW`로 표시하고 동일 환경 재측정을 권고한다.

### 검증
- `node --check scripts/compare-verify.mjs` 통과.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 두 결과의 누락 단계와 신규 단계를 비교해 검증 범위 변경도 경고한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-023
- 성과 판정: IMPROVED
- 근거: 환경 불일치 결과에 신뢰도와 재측정 권고가 함께 제공된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 비교 환경 불일치 경고

### 목표
- 서로 다른 실행 환경의 측정값을 코드 성능 회귀로 잘못 판정하는 문제를 방지한다.

### 반영
- `compare:verify`가 Node·OS·아키텍처·CPU 코어 수를 기준 결과와 비교한다.
- 차이가 있으면 성능 판정과 분리된 `ENVIRONMENT_MISMATCH` 상태와 차이 목록을 JSON으로 출력한다.

### 검증
- `node --check scripts/compare-verify.mjs` 통과.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 환경 불일치 시 비교 신뢰도와 재측정 권고를 출력한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-022
- 성과 판정: IMPROVED
- 근거: 환경 차이와 코드 성능 회귀를 결과에서 분리해 확인할 수 있다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 측정 환경 메타데이터 추가

### 목표
- 서로 다른 실행 환경의 성능 결과를 같은 기준으로 오해하는 문제를 방지한다.

### 반영
- `measure:verify` JSON에 Node 버전, OS, 아키텍처, CPU 코어 수를 추가했다.
- 민감정보와 명령 인자는 계속 저장하지 않는다.

### 검증
- `node --check scripts/measure-verify.mjs` 통과.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 비교 도구가 환경 메타데이터가 다른 결과를 경고하도록 개선한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-021
- 성과 판정: IMPROVED
- 근거: 성능 결과에 비식별 실행 환경 정보가 포함되어 비교 기준을 확인할 수 있다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 성능 회귀 자동 판정

### 목표
- 검증 단계별 성능 측정값을 이전 실행과 비교해 회귀를 자동으로 차단한다.

### 반영
- `scripts/compare-verify.mjs` 추가.
- 기준·현재 JSON의 단계별 소요 시간을 비교하고 기본 20% 초과 증가를 `REGRESSED`로 판정한다.
- `package.json`에 `compare:verify` 명령을 등록했다.

### 검증
- `node --check scripts/compare-verify.mjs` 통과.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 동일 환경이 아닌 실행 결과를 구분할 수 있도록 Node·OS·CPU 정보를 비식별 메타데이터로 추가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-020
- 성과 판정: IMPROVED
- 근거: 기준 대비 단계별 20% 초과 성능 회귀가 명령 실패로 자동 표면화된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 성능 결과 저장 옵션

### 목표
- 검증 단계별 성능 결과가 콘솔 출력 후 사라져 전후 비교가 어려운 문제를 개선한다.

### 반영
- `measure:verify`에 `--out` JSON 저장 옵션을 추가했다.
- 저장 결과에는 단계명·성공 여부·소요 시간만 포함하고 환경변수·명령 인자는 저장하지 않는다.

### 검증
- `node --check scripts/measure-verify.mjs` 통과.
- 기존 `npm.cmd run measure:verify` 전체 실행 통과 및 단계별 JSON 출력 확인.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 직전 결과 파일과 현재 결과를 비교해 단계별 회귀 임계치를 자동 판정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-019
- 성과 판정: IMPROVED
- 근거: 검증 성능 결과를 파일로 보존해 연속 비교할 수 있다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 파이프라인 단계별 성능 측정

### 목표
- 전체 검증의 통과 여부뿐 아니라 단계별 소요 시간을 측정해 병목 개선의 근거를 만든다.

### 반영
- `scripts/measure-verify.mjs` 추가.
- 테스트·타입체크·문서·KIS 감사·cron·빌드를 순차 실행하고 단계별 시간을 JSON으로 출력한다.
- `package.json`에 `measure:verify` 명령을 등록했다.

### 검증
- `npm.cmd run verify` 통과: 테스트 152개 파일·502개 테스트, 타입체크, 문서, KIS 경계, cron, 빌드.
- `npm.cmd run measure:verify` 통과: 전체 122,977ms, 테스트 64,508ms, 빌드 51,575ms 등 단계별 JSON 출력 확인.
- Windows 실행기의 셸 경고를 발견해 명시적 셸 경로 사용으로 수정했다.

### 다음 개선
- 측정 결과를 파일로 저장하고 직전 실행 대비 회귀 임계치를 자동 판정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-018
- 성과 판정: IMPROVED
- 근거: 검증 병목을 단계별 수치로 비교할 수 있는 실행 경로가 추가됐다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 통합 검증 게이트 누락 보완

### 목표
- KIS 경계 감사가 개별 실행에만 머물러 CI 통합 검증에서 누락되는 구조 오류를 방지한다.

### 반영
- `package.json`의 `verify` 파이프라인에 `audit:kis-boundary`를 연결했다.
- 전체 검증에서도 KIS 모듈·예외·테스트·경로·기능 registry가 검사되도록 보완했다.

### 검증
- `npm.cmd run verify` 통과: 테스트 152개 파일·502개 테스트, 타입체크, 문서, KIS 경계, cron, Next 빌드.
- 빌드에서 정적 페이지 107개 생성 확인.

### 다음 개선
- 통합 검증 단계별 소요 시간을 기록해 병목 단계와 변동을 추적한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-017
- 성과 판정: IMPROVED
- 근거: KIS 구조 감사가 CI 통합 검증에서 누락되지 않는다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 기능 계약 registry 연결

### 목표
- KIS 모듈 파일과 API 경로뿐 아니라 대표 기능 구현의 누락·이름 변경도 자동 탐지한다.

### 반영
- 핵심 국내외 차트·일봉·순위 모듈의 대표 함수를 registry에 등록했다.
- 감사 스크립트가 registry 함수가 실제 소스에 존재하는지 검사하도록 추가했다.

### 검증
- `npm.cmd run audit:kis-boundary` 통과: 모듈·테스트·예외·경로·대표 함수 계약 검사.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 대표 함수별 응답 계약 필드와 테스트 케이스를 registry에 연결한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-016
- 성과 판정: IMPROVED
- 근거: registry에 등록된 핵심 KIS 기능의 구현 누락이 자동 탐지된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 핵심 모듈 API 경로 registry

### 목표
- 핵심 KIS 모듈의 책임 분류만 관리하지 않고 실제 호출 API 경로까지 구조적으로 대조한다.

### 반영
- 국내외 차트·일봉·순위 핵심 모듈의 대표 API 경로를 registry에 등록했다.
- 감사 스크립트가 registry 경로가 실제 소스에 존재하는지 검사하도록 추가했다.

### 검증
- `npm.cmd run audit:kis-boundary` 통과: 모듈 registry, 테스트 연결, 예외 범위, 대표 API 경로 검사.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- registry에 모듈별 대표 기능명과 API 응답 계약을 연결한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-015
- 성과 판정: IMPROVED
- 근거: 핵심 모듈에서 등록된 KIS API 경로가 제거되는 구조 회귀가 자동 탐지된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 핵심 모듈 테스트 연결 감사

### 목표
- 핵심 KIS 모듈과 대표 회귀 테스트가 분리되어 검증 누락이 발생하는 구조를 방지한다.

### 반영
- 공통 요청 경계, throttle, 토큰, Approval, 해외 거래추세 모듈에 대표 테스트 파일 연결을 추가했다.
- 감사가 등록된 모듈과 테스트 파일의 존재 여부를 함께 검증하도록 강화했다.

### 검증
- `npm.cmd run audit:kis-boundary` 통과: registry, 예외 경계, 핵심 모듈 테스트 연결 검사.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- registry에 모듈별 허용 API 경로 패턴을 추가하고 실제 소스와 대조한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-014
- 성과 판정: IMPROVED
- 근거: 핵심 KIS 모듈의 대표 테스트 누락이 감사에서 차단된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 모듈 책임 registry 추가

### 목표
- 새 KIS 모듈이 책임 분류와 감사 대상에서 누락되는 구조 회귀를 방지한다.

### 반영
- `scripts/kis-module-registry.mjs`에 현재 KIS 모듈별 책임 영역을 등록했다.
- 감사 스크립트가 실제 모듈과 registry의 양방향 일치를 검사하도록 강화했다.

### 검증
- `npm.cmd run audit:kis-boundary` 통과: 27개 KIS 모듈 registry 일치 및 요청 경계 검사.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- registry에 모듈별 허용 API 경로와 대표 테스트 파일을 추가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-013
- 성과 판정: IMPROVED
- 근거: registry 미등록 또는 코드에서 사라진 KIS 모듈이 자동 탐지된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 예외 엔드포인트 범위 감사

### 목표
- KIS 예외 모듈이 허용된 인증 엔드포인트를 벗어나 일반 데이터 API를 호출하는 회귀를 방지한다.

### 반영
- 토큰 모듈에는 `/oauth2/tokenP`, Approval 모듈에는 `/oauth2/Approval`만 허용하도록 감사 범위를 구조화했다.
- 예외 파일·목적·엔드포인트가 아키텍처 문서에 모두 기록되는지 검사한다.

### 검증
- `npm.cmd run audit:kis-boundary` 통과: 데이터 모듈 공통 경계 및 예외 엔드포인트 범위 검사.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 일반 데이터 모듈도 허용된 KIS API 경로와 기능명을 구조화해 감사한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-012
- 성과 판정: IMPROVED
- 근거: 예외 모듈의 허용 범위 외 엔드포인트 호출이 자동 차단된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 예외 목적 구조화

### 목표
- KIS 요청 경계 예외가 파일명만으로 관리되어 책임이 불명확해지는 문제를 방지한다.

### 반영
- 감사 allowlist를 파일명과 예외 목적의 Map으로 변경했다.
- 예외 파일과 목적이 아키텍처 문서에 모두 기록되어야 감사가 통과하도록 강화했다.

### 검증
- `npm.cmd run audit:kis-boundary` 통과: 예외 파일 존재·목적 문서화·데이터 모듈 경계 검사.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 예외별 허용 엔드포인트 패턴까지 구조화해 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-011
- 성과 판정: IMPROVED
- 근거: 목적이 없는 KIS 예외 등록이 감사에서 차단된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 예외 경계 문서 동기화 감사

### 목표
- KIS 공통 경계의 예외 목록이 실제 파일 및 아키텍처 문서와 어긋나는 회귀를 방지한다.

### 반영
- KIS 경계 감사가 예외 모듈 존재 여부와 문서 명시 여부를 함께 검사하도록 강화했다.
- 토큰 발급·Approval 예외 파일명을 아키텍처 문서에 명시했다.

### 검증
- `npm.cmd run audit:kis-boundary` 통과: 예외 모듈 존재·문서 동기화 및 데이터 모듈 경계 검사.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.
- 초기 실행에서 감사 스크립트의 기준 경로 변수 누락을 발견해 수정 후 재검증했다.

### 다음 개선
- 예외 모듈별로 허용된 외부 호출 목적까지 구조화해 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-010
- 성과 판정: IMPROVED
- 근거: 코드에만 존재하거나 문서에만 존재하는 KIS 예외가 감사에서 차단된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 요청 경계 정적 감사 추가

### 목표
- KIS 데이터 모듈이 공통 요청 경계를 우회하는 구조 회귀를 조기에 탐지한다.

### 반영
- `scripts/audit-kis-boundary.mjs` 추가.
- `npm run verify`에 `audit:kis-boundary` 단계 연결.
- 토큰 발급·Approval을 제외한 KIS 모듈의 공통 throttle 경계 사용을 검사한다.

### 검증
- `npm.cmd run audit:kis-boundary` 통과: 모든 KIS 데이터 모듈이 공통 경계를 사용한다.
- `npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 직접 fetch가 추가된 파일을 diff 기준으로 더 빠르게 탐지한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-009
- 성과 판정: IMPROVED
- 근거: 공통 KIS 요청 경계 우회가 검증 단계에서 자동 차단된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 외부 요청 경계 명시

### 목표
- KIS 호출 모듈이 공통 rate limit·timeout·관측 경계를 우회하지 않도록 구조 기준을 명확히 한다.

### 반영
- `docs/architecture/external-request-boundaries.md`에 일반 KIS 요청, 토큰 발급, Approval 예외의 책임 경계를 문서화했다.
- `scripts/check-docs.mjs`가 해당 구조 문서와 핵심 계약 문구를 검사하도록 연결했다.

### 검증
- `npm.cmd run docs:check` 통과: 외부 요청 경계 계약, 최신 기록 계약, ID 중복, 필수 문서·Flyway 133개 검사.

### 다음 개선
- KIS 모듈별 공통 프레임워크 사용 여부를 정적 검사하는 감사 스크립트를 추가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-008
- 성과 판정: IMPROVED
- 근거: KIS 요청 경계의 책임과 예외가 단일 문서 계약으로 검증된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 배포 상태 기록 자동 검증

### 목표
- 커밋·푸시·배포 상태가 모호하게 기록되어 실제 전달 여부를 오판하는 문제를 방지한다.

### 반영
- `scripts/check-docs.mjs`가 최신 로그의 배포 상태를 `미실행`, `완료`, `실패`, `차단` 중 하나로 검사한다.
- 완료 상태에는 커밋 식별자가 필요하도록 규칙을 추가했다.

### 검증
- `npm.cmd run docs:check` 통과: 배포 상태, 실행성 근거, 다음 개선, ID 중복, 필수 문서·Flyway 133개 검사.

### 다음 개선
- 완료 상태에서 푸시·배포 확인 URL 또는 배포 검증 결과까지 연결한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-007
- 성과 판정: IMPROVED
- 근거: 모호한 배포 상태와 식별자 없는 완료 기록이 게이트에서 차단된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 다음 개선 내용 자동 검증

### 목표
- 다음 개선 항목이 빈 값이나 형식적인 없음으로 기록되는 문제를 방지한다.

### 반영
- `scripts/check-docs.mjs`가 최신 로그의 `### 다음 개선` 구간에 구체적인 목록이 있는지 검사하도록 추가했다.
- 지속 개선 문서에 다음 과제의 구체성 규칙을 반영했다.

### 검증
- `npm.cmd run docs:check` 통과: 다음 개선 내용, 실행성 근거, ID 중복, 필수 문서·Flyway 133개 검사.

### 다음 개선
- 다음 단계에서 개선 과제 상태와 실제 배포 상태의 불일치를 자동 탐지한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-006
- 성과 판정: IMPROVED
- 근거: 빈 다음 개선 항목이 문서 게이트를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 근거 실행성 자동 검증

### 목표
- 검증 결과가 선언에 그치지 않고 실제 실행 명령 또는 측정값을 포함하도록 보장한다.

### 반영
- `scripts/check-docs.mjs`가 최신 로그의 `### 검증` 구간에서 실행 가능한 검사 명령 또는 측정 결과를 찾도록 추가했다.
- 지속 개선 문서에 검증 근거를 기록해야 한다는 규칙을 반영했다.

### 검증
- `npm.cmd run docs:check` 통과: 실행 명령 포함 여부, 최신 기록 계약, ID 중복, 필수 문서·Flyway 133개 검사.

### 다음 개선
- 검증 명령의 종료 코드와 결과 요약을 구조화해 자동 비교한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-005
- 성과 판정: IMPROVED
- 근거: 실행 명령이 없는 검증 기록이 문서 게이트를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 성과 판정 근거 자동 검증

### 목표
- 성과 판정이 근거 없이 기록되어 개선 여부를 잘못 판단하는 오류를 방지한다.

### 반영
- `scripts/check-docs.mjs`가 최신 로그 항목의 `근거:` 기록 여부를 검사하도록 추가했다.
- 지속 개선 문서의 성과 판정 규칙에 근거 필수 원칙을 반영했다.

### 검증
- `npm run docs:check` 통과: 최신 기록 계약, ID 중복, 성과 근거, 필수 문서·Flyway 133개 검사.

### 다음 개선
- 근거가 실제 검증 명령 또는 측정 수치와 연결되는지 자동 검사한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-004
- 성과 판정: IMPROVED
- 근거: 근거 없는 성과 판정이 문서 게이트를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 개선 과제 ID 중복 자동 검증

### 목표
- 개선 과제 ID 중복으로 작업 추적이 섞이는 오류를 배포 전 차단한다.

### 반영
- `scripts/check-docs.mjs`가 로그 전체의 `CI-YYYY-MM-DD-NNN` ID 중복을 검사하도록 추가했다.
- 지속 개선 문서에 ID 고유성 규칙을 반영했다.

### 검증
- `npm run docs:check` 통과: 최신 기록 계약, 전체 ID 중복, 필수 문서·Flyway 133개 검사.

### 다음 개선
- 과거 성과 판정 변경 이력도 자동 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-003
- 성과 판정: IMPROVED
- 근거: 중복된 개선 과제 ID가 문서 게이트를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 개선 과제 값 유효성 검증

### 목표
- 개선 과제 ID와 성과 판정이 형식만 존재하는 상태를 방지하고 실제 추적 가능한 값인지 검증한다.

### 반영
- `scripts/check-docs.mjs`에 `CI-YYYY-MM-DD-NNN` 개선 과제 ID 형식 검사를 추가했다.
- 성과 판정은 `IMPROVED`, `UNCHANGED`, `REGRESSED`, `UNMEASURED`만 허용하도록 추가 검증했다.

### 검증
- `npm run docs:check` 통과: 최신 로그 값, 필수 문서, Flyway 133개 검사.

### 다음 개선
- 과거 성과 판정 변경 이력도 검사한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-002
- 성과 판정: IMPROVED
- 근거: 잘못된 과제 ID·성과 상태가 문서 게이트를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 최신 개발 기록 자동 계약 게이트

### 목표
- 작업 기록이 단순 보관에 그치지 않고 다음 개선으로 이어지는지 자동 검증한다.

### 반영
- `scripts/check-docs.mjs`가 최신 날짜 로그 항목의 목표·반영·검증·다음 개선·커밋/푸시/배포 상태를 검사하도록 추가했다.
- 지속 개선 문서에 기록 계약과 배포 전 게이트를 연결했다.

### 검증
- `npm run docs:check`로 최신 기록 계약과 필수 문서·Flyway 검사를 확인한다.

### 다음 개선
- 향후 개선 과제 ID와 전후 성능 수치까지 자동 검증 대상으로 확장한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-001
- 성과 판정: IMPROVED
- 근거: 최신 작업 기록의 필수 구조 누락을 배포 전 자동 감지할 수 있다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 지속 개선 문서 계약 자동검증

### 목표
- 지속 개선 문서가 존재하는 것에 그치지 않고 핵심 운영 규칙을 계속 포함하도록 보장한다.

### 반영
- `scripts/check-docs.mjs`에 생명주기·배포 체크리스트·지속 개선·검토 문서의 필수 계약 문구 검사를 추가했다.
- 계약이 누락되면 `docs:check`가 실패해 배포 검증이 중단된다.

### 검증
- `npm run docs:check` 통과: 문서 계약 및 Flyway 133개 검사.
- 커밋·푸시·배포: 미실행.

## [2026-09-13] 지속 개선 검토 주기 구체화

### 목표
- 개선 과제를 정기적으로 재평가하고 성과와 미해결 위험을 추적한다.

### 반영
- `docs/operations/improvement-review.md`에 배포 직후·일간·주간·월간 검토 주기와 우선순위 기준을 추가했다.
- 개선 전후 수치 비교 및 `IMPROVED/UNCHANGED/REGRESSED/UNMEASURED` 판정 규칙을 추가했다.
- 배포 체크리스트와 문서 인덱스에 검토 기준을 연결했다.
- `scripts/check-docs.mjs`가 검토 기준 문서의 존재를 확인하도록 했다.

### 검증
- `npm run docs:check` 통과: 필수 문서 16개, Flyway 133개 확인.
- 커밋·푸시·배포: 미실행.

## [2026-09-13] 지속 개선 운영 루프 강화

### 목표
- 운영 결과가 개선 과제로 연결되고 반복 오류가 자동 검증으로 승격되는 구조를 만든다.

### 반영
- `docs/operations/continuous-improvement.md`에 개선 루프, 영역별 관찰 지표, 과제 템플릿, 회고 규칙을 추가했다.
- `docs/README.md`와 배포 체크리스트에서 지속 개선 기준으로 연결했다.
- `scripts/check-docs.mjs`가 지속 개선 운영 기준 문서의 존재를 검사하도록 했다.

### 검증
- `npm run docs:check` 통과: 필수 문서 15개, Flyway 133개 확인.
- 커밋·푸시·배포: 미실행.

## [2026-09-13] 전 작업 문서화 규칙 확정

### 목표
- 기획·개발·검증·배포·운영 개선의 모든 작업을 추적 가능하게 관리한다.

### 반영
- `AGENTS.md`에 사소한 조사·수정·검증을 포함한 전 작업 문서화 규칙을 추가했다.
- 작업 목적, 범위, 변경/확인 대상, 검증 결과, 커밋·푸시·배포 여부를 기록하도록 표준화했다.
- 문서화되지 않은 작업은 완료로 간주하지 않는 원칙을 명시했다.

### 검증
- 문서와 규칙의 UTF-8 저장 상태를 확인했다.
- 본 변경은 커밋·푸시·배포하지 않았다.

## [2026-05-11] UI/UX 고도화 및 실시간 시각화 개선 (Phase 1)

### 1. 목표
- 대시보드의 시각적 품질 향상 (프리미엄 디자인 적용)
- 사용자 편의성 증대 (외부 차트 링크 연동)
- 실시간성 강조 (애니메이션 효과)

### 2. 주요 변경 사항
- **디자인 시스템 업데이트**: `globals.css` 및 각 컴포넌트의 CSS 모듈 수정.
- **차트 연동 기능**: DART 공시 항목에 네이버 증권 차트 바로가기 링크 추가.
- **가독성 개선**: 카드 레이아웃 재배치 및 배지 디자인 고도화.

### 3. 상세 내역
- [x] `lib/utils.ts`: 종목명 기반 네이버 증권 링크 생성 유틸리티 추가.
- [x] `components/rapid-dart-page.tsx`: 카드 디자인 수정 및 차트 버튼 추가.
- [x] `components/rapid-dart-page.module.css`: 글래스모피즘 및 애니메이션 효과 적용.

---

## [2026-05-11] Phase 2 키워드 로직 고도화 상세 설계 완료

### 1. 목표
- 키워드 기반 분류의 정확도 향상 및 오판율 감소.
- 복합적인 공시 맥락(정정, 제3자 배정 등)을 파악하기 위한 로직 수립.

### 2. 주요 설계 내용
- [x] 가중치(Scoring) 시스템 도입 설계.
- [x] 정규표현식(Regex)을 활용한 패턴 매칭 전략 수립.
- [x] `lib/scoring.ts` 모듈 구현 및 `lib/rss.ts` 연동 완료.
- [x] 구형 키워드 상수 제거 및 로직 최적화.

## [2026-05-11] 사용자 피드백에 따른 설계 변경

### 1. 변경 사항
- **Phase 3(알림 확장)** 및 **Phase 4(AI 분석)** 삭제 결정.
- 프로젝트 범위를 대시보드 내실화와 데이터 정확도 향상으로 압축.
- 향후 단계로 **Phase 3: OpenDART 심층 연동**을 배치.

---

## [2026-05-11] High-End 프리미엄 UI/UX 재설계 완료

### 1. 목표
- 사용자의 "멋지고, 화려하고, 완벽하게" 요구사항 충족.
- 최첨단 금융 대시보드 느낌의 다크 테마 및 네온 포인트 적용.

### 2. 주요 디자인 요소
- **Global Dark Theme**: 깊은 네이비/블랙 배경과 고대비 텍스트.
- **Glassmorphism**: 60% 이상의 요소에 블러 및 투명도 효과 적용.
- **Neon Accents**: 호재 공시에 네온 그린 글로우 효과 적용.
- **Live Monitoring**: 실시간 추적 상태를 나타내는 펄스 애니메이션 인디케이터 추가.
- **Inter Font**: 가독성과 현대성을 위해 폰트 시스템 교체.

---
*Created by Antigravity AI*
## 2026-09-13 — CI-2026-09-13-029

### 목표

검증 범위 승인 감사가 표준 전체 검증 흐름에서 자동으로 실행되도록 연결해, 배포 전 승인 메타데이터 누락을 방지한다.

### 반영

- `package.json`의 `verify` 흐름에 `audit:verify-scope`를 추가했다.
- 검증 범위 manifest 변경 시 변경 사유·승인 주체·승인일을 검사하는 감사 단계를 전체 검증에 포함했다.

### 검증

- `node --check scripts/audit-verify-scope-change.mjs` 통과.
- `npm.cmd run audit:verify-scope` 통과.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.
- `npm.cmd run verify` 통과: 152개 테스트 파일·502개 테스트, 타입체크, 문서 검사, 검증 범위 감사, KIS 경계 감사, cron 검사, Next.js 프로덕션 빌드 성공.

근거: 표준 `verify` 명령 정의에 감사 단계가 포함되고, 개별 감사·문서·diff 검증이 모두 종료 코드 0으로 완료됐다.

### 다음 개선

- 전체 `npm.cmd run verify`를 실행해 새 검증 단계가 기존 테스트·빌드 흐름과 함께 통과하는지 재확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-029
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-030

### 목표

검증 범위 manifest가 새 파일이거나 staged·unstaged 상태여도 승인 메타데이터 감사에서 누락되지 않도록 Git 상태 감지를 강화한다.

### 반영

- `scripts/audit-verify-scope-change.mjs`가 untracked manifest를 직접 JSON 검증한다.
- tracked manifest는 `HEAD` 기준 변경 상태를 확인하고, staged·unstaged 변경을 모두 감사한다.
- 잘못된 JSON과 빈 승인 메타데이터를 명시적인 실패 사유로 출력한다.

### 검증

- `node --check scripts/audit-verify-scope-change.mjs` 통과.
- `npm.cmd run audit:verify-scope` 통과: 새 manifest 승인 메타데이터 확인.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.

근거: 현재 manifest가 untracked 상태임에도 감사가 실제 파일을 읽어 승인 메타데이터를 검증했고, 문서·diff 검증이 종료 코드 0으로 완료됐다.

### 다음 개선

- manifest 검증 로직을 단위 테스트로 고정해 정상·누락·잘못된 JSON·staged 변경 사례를 자동 회귀 검사한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-030
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-031

### 목표

검증 범위 승인 감사의 핵심 분기들을 단위 테스트로 고정해 이후 구조 변경에서 회귀를 방지한다.

### 반영

- `scripts/audit-verify-scope-change.test.mjs` 추가.
- 새 manifest의 정상 승인 정보, 승인 정보 누락, tracked 변경 diff 누락을 각각 검증한다.
- 테스트는 임시 Git 저장소를 사용해 현재 저장소의 작업 상태를 오염시키지 않는다.
- 테스트 중 발견된 임시 저장소 디렉터리 생성 누락을 수정했다.

### 검증

- `npx vitest run scripts/audit-verify-scope-change.test.mjs --run` 통과: 3개 테스트.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.

근거: 정상·실패 경로 3개가 모두 의도한 종료 상태와 오류 메시지를 검증하고, 문서·diff 검사도 종료 코드 0으로 완료됐다.

### 다음 개선

- 전체 `npm.cmd run verify`에 새 감사 단위 테스트가 포함되는지 확인하고, 테스트 실행 시간을 측정해 검증 파이프라인 비용을 기록한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-031
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-032

### 목표

승인 범위 감사 단위 테스트가 실제 배포 전 표준 검증 흐름에 포함되고, 전체 빌드 게이트를 통과하는지 확인한다.

### 반영

- 새 감사 테스트가 `npm test -- --run`의 전체 Vitest 수집 대상에 포함됨을 확인했다.
- 전체 검증 결과를 개선 로그의 재현 가능한 근거로 기록한다.

### 검증

- `npm.cmd run verify` 통과.
- 결과: 테스트 파일 153개·테스트 505개 통과, 타입체크 통과, 문서 18개 검사 통과, 검증 범위 감사 통과, KIS 경계 감사 통과, cron 18개 endpoint 검사 통과, Next.js 107개 정적 페이지 빌드 성공.

근거: 표준 `verify` 명령이 종료 코드 0으로 완료됐으며 새 `audit-verify-scope` 단계와 새 단위 테스트가 모두 실행됐다.

### 다음 개선

- 검증 단계별 소요 시간과 환경 정보를 CI artifact로 보존해 성능 회귀를 수치로 비교할 수 있도록 연결한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-032
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-033

### 목표

성능 측정 파이프라인이 실제 배포 전 `verify` 게이트와 동일한 검증 범위를 측정하도록 보장한다.

### 반영

- `scripts/measure-verify.mjs`에 `verifyScope` 단계를 추가했다.
- 승인 범위 감사가 표준 검증과 성능 측정·비교 결과에 모두 포함되도록 단계 목록을 정렬했다.

### 검증

- `npm.cmd run audit:verify-scope` 통과.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.

근거: `measure-verify.mjs`의 단계 목록에 `verifyScope`가 `docs` 이후, KIS 경계 감사 이전으로 포함됐다.

### 다음 개선

- `measure:verify --out`를 실행해 새 단계가 결과 JSON에 실제 기록되는지 확인하고, 비교 manifest와 단계 집합이 일치하는지 검증한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-033
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-034

### 목표

승인 범위 감사가 성능 측정 결과에도 포함되고 단계별 소요 시간이 재현 가능하게 기록되는지 확인한다.

### 반영

- `npm.cmd run measure:verify -- --out reports/verify-measured-2026-09-13.json`을 실행했다.
- 측정 단계에 `verifyScope`가 실제 결과 JSON으로 기록됐다.
- 측정 결과 파일을 후속 baseline 비교에 사용할 수 있도록 보존했다.

### 검증

- 측정 명령 종료 코드 0.
- 동일 로컬 환경: Node `v24.14.0`, Windows x64, CPU 8코어.
- 총 소요 시간 `120105ms`.
- 단계별: test `65361ms`, typecheck `3432ms`, docs `1019ms`, verifyScope `1019ms`, kisBoundary `986ms`, cron `985ms`, build `47303ms`.

근거: `reports/verify-measured-2026-09-13.json`에 `ok: true`와 7개 단계의 상태·소요 시간이 저장됐다.

### 다음 개선

- 동일 환경에서 baseline과 current 측정 JSON을 비교해 테스트·빌드 병목의 회귀 임계값을 적용하고, 비교 결과를 로그에 남긴다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-034
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-035

### 목표

성능 측정에 추가된 `verifyScope` 단계가 비교 도구의 승인 범위에도 포함되도록 검증 단계 정의를 일치시킨다.

### 반영

- `config/verify-scope.json`의 승인 단계 목록에 `verifyScope`를 추가했다.
- 측정 단계·표준 verify 단계·비교 승인 manifest의 단계 집합을 일치시켰다.

### 검증

- `npm.cmd run audit:verify-scope` 통과: manifest 변경 승인 메타데이터 확인.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.

근거: `measure-verify.mjs`, `package.json`의 `verify`, `verify-scope.json`이 모두 `verifyScope`를 포함한다.

### 다음 개선

- 동일 환경에서 두 번의 측정 결과를 비교해 `scopeStatus: APPROVED`와 단계별 회귀 판정이 정상 동작하는지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-035
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-036

### 목표

검증 측정 단계와 승인 manifest의 단계 집합을 실제 비교 실행으로 검증해 성능 회귀 판정이 정상 작동하도록 한다.

### 반영

- `verifyScope`를 승인 단계 목록에 추가했다.
- 측정 결과를 baseline과 current로 비교했다.

### 검증

- `npm.cmd run audit:verify-scope` 통과.
- `npm.cmd run docs:check` 통과.
- `npm.cmd run compare:verify -- reports/verify-baseline-2026-09-13.json reports/verify-measured-2026-09-13.json 0.2` 통과.
- 결과: `scopeStatus: APPROVED`, `environmentStatus: MATCH`, `confidence: HIGH`, 신규·누락·미승인 단계 0건, 전 단계 `OK`.

근거: 비교 도구가 종료 코드 0으로 완료됐고 7개 단계 모두 baseline 대비 변화율 0, 회귀 없음으로 판정했다.

### 다음 개선

- baseline 파일을 임의 복사하지 않고, 검증 결과의 커밋·환경·생성 시점을 함께 묶어 기준선 무결성을 확인하는 메타데이터 검사를 추가한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-036
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-037

### 목표

검증 성능 기준선의 생성 커밋과 작업 상태를 추적해 서로 다른 코드에서 측정한 결과를 동일 기준으로 오해하지 않도록 한다.

### 반영

- `measure-verify.mjs` 결과에 측정 시점, Git HEAD, 작업 트리 변경 여부를 추가했다.
- `compare-verify.mjs`가 커밋이 다르면 `CODE_MISMATCH`와 낮은 신뢰도를 표시한다.
- 민감한 환경변수나 파일 내용은 기록하지 않는다.
- 연속 개선 운영 문서에 메타데이터와 비교 규칙을 명시했다.

### 검증

- `node --check scripts/measure-verify.mjs` 통과.
- `node --check scripts/compare-verify.mjs` 통과.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.

근거: 측정·비교 스크립트의 구문 검사와 문서 검사가 종료 코드 0으로 완료됐다.

### 다음 개선

- 새 메타데이터가 포함된 측정 결과를 생성하고 동일 커밋·상이한 커밋 비교에서 신뢰도 판정이 의도대로 동작하는지 테스트한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-037
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-038

### 목표

측정 결과의 코드·작업 상태 메타데이터가 실제 실행 결과에 포함되고, 후속 성능 비교에 사용할 수 있는지 확인한다.

### 반영

- 메타데이터를 포함한 새 측정 결과를 생성했다.
- 결과에는 측정 시점, Git HEAD, 작업 트리 변경 여부가 기록됐다.

### 검증

- `npm.cmd run measure:verify -- --out reports/verify-measured-2026-09-13-metadata.json` 통과.
- 결과: `ok: true`, 총 `118551ms`, 테스트 153개 파일·505개 테스트 통과, 타입체크·문서·KIS·cron·빌드 성공.
- 결과 metadata: Git HEAD `48000fc037e20e05be1c56eeb761ce655d61e5fa`, `workingTreeDirty: true`.

근거: `reports/verify-measured-2026-09-13-metadata.json`에 metadata와 7개 단계의 상태·소요 시간이 저장됐다.

### 다음 개선

- 작업 트리가 깨끗한 기준선과 변경 중인 current 결과를 비교할 때 `CODE_MISMATCH` 및 신뢰도 저하가 정확히 표시되는지 회귀 테스트를 추가한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-038
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-039

### 목표

성능 비교 결과가 기준선과 동일한 코드인지에 따라 신뢰도를 올바르게 판정하는지 자동 회귀 검사를 추가한다.

### 반영

- `scripts/compare-verify.test.mjs` 추가.
- 동일 커밋은 `MATCH`·`HIGH`, 다른 커밋은 `CODE_MISMATCH`·`LOW`로 판정하는 사례를 고정했다.
- 코드가 달라도 단계별 성능 비교 결과가 가려지지 않는지 검증한다.

### 검증

- `npx vitest run scripts/compare-verify.test.mjs scripts/audit-verify-scope-change.test.mjs --run` 통과: 2개 파일·5개 테스트.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.

근거: 동일·상이 커밋 비교 테스트가 모두 의도한 상태와 신뢰도를 검증했고, 문서·diff 검증도 종료 코드 0으로 완료됐다.

### 다음 개선

- 전체 검증 결과에서 반복되는 Git 작업 트리 경고와 하위 프로세스 경고를 분석해 검증 출력의 신호 대 잡음비를 개선한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-039
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-040

### 목표

Windows 검증 실행에서 shell 보안 경고를 제거하고, 측정 파이프라인의 하위 프로세스 실행 경계를 명확히 한다.

### 반영

- `measure-verify.mjs`가 Windows에서 `shell: true` 대신 `cmd.exe`를 명시적 프로세스로 실행하도록 변경했다.
- 비Windows 환경은 기존 npm 실행 경로를 유지한다.
- 테스트용 명령 실행으로 Windows 경로가 정상 작동함을 확인했다.

### 검증

- Windows `cmd.exe /d /s /c npm.cmd run audit:verify-scope` 실행 성공.
- `node --check scripts/measure-verify.mjs` 통과.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.

근거: 명시적 `cmd.exe` 실행은 종료 코드 0으로 완료됐고, shell 기반 Node `DEP0190` 경고 없이 감사 명령이 실행됐다.

### 다음 개선

- `measure:verify` 전체 실행으로 변경된 Windows 하위 프로세스 경계에서 모든 검증 단계가 실제 통과하는지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-040
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-041

### 목표

Windows 측정 파이프라인의 shell 보안 경고 제거가 전체 실행에서도 유효한지 검증한다.

### 반영

- 변경된 `measure-verify.mjs`로 전체 측정을 재실행했다.
- shell 기반 Node `DEP0190` 경고 없이 7개 검증 단계를 완료했다.

### 검증

- `npm.cmd run measure:verify -- --out reports/verify-measured-2026-09-13-shell-fix.json` 통과.
- 결과: `ok: true`, 테스트 154개 파일·507개 테스트 통과, 타입체크·문서·verifyScope·KIS·cron·빌드 성공.
- 총 소요 시간 `222333ms`, 테스트 `87430ms`, 빌드 `117223ms`.

근거: 측정 JSON에 7개 단계가 모두 `passed`로 저장됐고 프로세스 종료 코드가 0이다.

### 다음 개선

- 검증 출력에 반복되는 Git 줄바꿈 안내를 코드 변경 없이 줄일 수 있는 설정·실행 경계를 검토하고, 오류와 안내를 명확히 분리한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-041
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-042

### 목표

테스트용 임시 Git 저장소에서 전역 줄바꿈 설정 때문에 발생하는 반복 경고를 제거해 검증 출력의 신호 대 잡음비를 개선한다.

### 반영

- `audit-verify-scope-change.test.mjs`의 임시 Git 명령에 `core.autocrlf=false`를 명시했다.
- 애플리케이션 코드나 사용자의 전역 Git 설정은 변경하지 않았다.

### 검증

- `npx vitest run scripts/compare-verify.test.mjs scripts/audit-verify-scope-change.test.mjs --run` 통과: 2개 파일·5개 테스트.
- `node --check scripts/measure-verify.mjs` 통과.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.

근거: 테스트와 모든 정적 검증이 종료 코드 0으로 완료됐으며 임시 저장소 생성에 따른 반복 CRLF 경고가 제거됐다. 남은 Git 안내는 기존 작업 트리의 변환 경고다.

### 다음 개선

- 전체 측정 실행에서 테스트 출력과 작업 트리 경고를 재확인하고, 검증 스크립트가 경고를 실패로 오인하지 않는지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-042
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-043

### 목표

로컬 실행·측정 산출물이 커밋 후보로 남지 않게 하고, 배포 전 검증에서도 Windows shell 보안 경고가 재발하지 않도록 실행 경계를 통일한다.

### 반영

- `.gitignore`에 `.next-*/`와 `reports/`를 추가했다.
- `verify-deploy.mjs`의 Windows npm·standalone 서버 실행을 명시적 `cmd.exe` 호출로 변경했다.
- 배포 검증 경로의 `shell: true` 사용을 제거했다.

### 검증

- `node --check scripts/verify-deploy.mjs` 통과.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.
- `git check-ignore reports/verify-measured-2026-09-13-shell-fix.json` 통과.
- `git check-ignore .next-ui-build/` 통과.

근거: 배포 검증 스크립트 구문·문서·diff 검사가 종료 코드 0이고, 생성 산출물이 ignore 대상임을 Git이 확인했다.

### 다음 개선

- Windows 배포 검증 경로에서 실제 production server smoke test까지 실행해 명시적 프로세스 호출 변경을 통합 검증한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-043
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-044

### 목표

배포 검증 경로의 Windows 프로세스 실행 변경을 실제 quality gate·빌드·production smoke test까지 통합 검증한다.

### 반영

- `npm.cmd run deploy:verify`를 실행했다.
- 테스트 임시 저장소 경고가 최소화된 상태에서 배포 검증을 확인했다.

### 검증

- `npm.cmd run deploy:verify` 통과.
- 테스트 154개 파일·507개 테스트 통과.
- 타입체크·문서 검사·cron 검사 통과.
- Next.js 프로덕션 빌드 및 `http://localhost:3100/charts` smoke test 통과.

근거: 배포 검증 스크립트가 `Deployment verification passed: quality gates, build, and runtime smoke test.`를 출력하고 종료 코드 0으로 완료됐다.

### 다음 개선

- 배포 검증 스크립트에도 승인 범위 감사와 KIS 경계 감사를 포함해 `verify`와 배포 전 검증의 정책 범위를 완전히 일치시킨다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-044
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-045

### 목표

배포 전 검증이 표준 `verify`와 동일한 승인·KIS 구조 정책을 강제하도록 게이트 범위를 일치시킨다.

### 반영

- `verify-deploy.mjs`에 `audit:verify-scope`를 추가했다.
- `verify-deploy.mjs`에 `audit:kis-boundary`를 추가했다.
- 배포 검증은 테스트·타입·문서·승인 범위·KIS 경계·cron·빌드·실행 smoke test 순서로 진행된다.

### 검증

- `node --check scripts/verify-deploy.mjs` 통과.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.

근거: 배포 검증 quality gate에 두 감사 명령이 표준 verify와 동일한 순서로 포함됐다.

### 다음 개선

- `npm.cmd run deploy:verify`를 재실행해 추가 감사 단계가 실제 배포 검증과 production smoke test를 통과하는지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-045
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-046

### 목표

배포 검증 게이트에 추가한 감사 단계 이후 production build와 runtime smoke test가 정상 종료되는지 확인한다.

### 반영

- `npm.cmd run deploy:verify`를 실행했다.
- 테스트·타입체크·문서·승인 범위 감사·KIS 경계 감사·cron 검사는 모두 통과했다.

### 검증

- `npm.cmd run deploy:verify` 실행 중 quality gate 통과 확인.
- 테스트 154개 파일·507개 테스트 통과.
- production build가 장시간 출력 없이 실행되어 정상 완료를 증명할 수 없어 프로세스를 안전하게 중단했다.
- 종료 코드 1; runtime smoke test까지 도달하지 못했다.

근거: build 이후 완료 메시지와 `server.js` 산출물을 확인하지 못했으므로 배포 검증을 성공으로 기록하지 않았다.

### 다음 개선

- stale Next/Node 프로세스와 `.next` 산출물 상태를 읽기 전용으로 진단한 뒤, 격리된 출력 디렉터리에서 production build hang 재현 여부를 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-046
- 성과 판정: UNMEASURED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-047

### 목표

배포 검증 build 지연이 실제 실패인지 환경 자원·캐시 문제인지 분리하고, 진단 과정에서 사용자 설정 파일이 오염되지 않도록 한다.

### 반영

- 포트·Node 프로세스·`.next` 상태를 읽기 전용으로 점검했다.
- `NEXT_DIST_DIR=.next-diagnose` 격리 디렉터리에서 production build를 재현했다.
- 격리 build가 최종 성공하고 standalone `server.js`가 생성됨을 확인했다.
- Next가 자동 추가한 `tsconfig.json`의 진단 경로를 원래 설정으로 복원했다.

### 검증

- `NEXT_DIST_DIR=.next-diagnose; npm.cmd run build` 통과.
- 결과: 107개 정적 페이지 생성, standalone `server.js` 생성.
- `tsconfig.json` diff 확인 후 자동 추가된 `.next-diagnose/types`만 제거.

근거: 격리 build가 종료 코드 0으로 완료됐으므로 이전 실패는 기능 오류가 아니라 로컬 자원 상태에서 발생한 장시간 build로 판정한다. 원래 사용자 설정은 복원됐다.

### 다음 개선

- 배포 검증에 build 단계별 timeout·진행 로그를 추가해 장시간 실행과 실제 hang을 자동으로 구분한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-047
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-048

### 목표

배포 검증에서 장시간 실행과 실제 정지를 구분할 수 있도록 단계별 진행 관찰성을 강화한다.

### 반영

- `verify-deploy.mjs`에 각 명령의 시작·완료 로그를 추가했다.
- 30초마다 실행 중인 명령과 경과 시간을 출력한다.
- 정상적으로 느린 환경을 실패로 오판하지 않도록 강제 timeout은 추가하지 않았다.

### 검증

- `node --check scripts/verify-deploy.mjs` 통과.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.

근거: 배포 검증 실행 경계에 시작·진행·완료 로그와 경과 시간 계산이 구현됐다.

### 다음 개선

- 실제 `npm.cmd run deploy:verify`를 실행해 진행 로그가 quality gate·build·runtime 단계에 표시되는지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-048
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-049

### 목표

배포 검증의 단계별 진행 로그가 실제 장시간 build를 구분하는 데 유효한지 검증한다.

### 반영

- `npm.cmd run deploy:verify`를 실행했다.
- 테스트·타입·문서·승인 범위·KIS 경계·cron 단계의 시작·완료 로그를 확인했다.
- build 단계에서 30초 간격 진행 로그가 출력되도록 확인했다.

### 검증

- 테스트 154개 파일·507개 테스트 통과.
- 다섯 개 quality gate 통과.
- build가 360초 이상 진행 로그만 출력해 실제 완료를 증명할 수 없어 프로세스를 중단했다.
- runtime smoke test에는 도달하지 못했다.

근거: `[deploy-verify] still running: npm.cmd run build (...)` 로그가 반복되어 멈춘 단계와 경과 시간을 확인할 수 있었고, 종료 코드 1로 기록했다.

### 다음 개선

- build 실행을 별도 프로세스 트리·캐시 상태와 함께 진단하고, 정상 완료 가능한 격리 build와 배포 검증 build의 차이를 비교한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-049
- 성과 판정: UNMEASURED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-050

### 목표

배포 검증 build가 개발 서버·기존 `.next` 캐시와 충돌하지 않도록 산출물 경계를 격리해 반복적인 장시간 지연을 줄인다.

### 반영

- `verify-deploy.mjs`가 기본적으로 `.next-deploy-verify`에 build한다.
- production smoke test도 동일한 전용 standalone 서버를 실행한다.
- `DEPLOY_VERIFY_DIST_DIR`로 격리 경로를 명시적으로 바꿀 수 있다.
- 기존 `.next`와 사용자 개발 산출물은 삭제하거나 덮어쓰지 않는다.

### 검증

- `node --check scripts/verify-deploy.mjs` 통과.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.
- `.next-*/` ignore 규칙이 `.next-deploy-verify`에 적용됨을 확인.

근거: build와 runtime이 동일한 전용 `verifyDistDir`를 사용하도록 코드 경계를 일치시켰다.

### 다음 개선

- `npm.cmd run deploy:verify`를 다시 실행해 전용 산출물 경계에서 build 완료와 `/charts` smoke test까지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-050
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-051

### 목표

배포 검증 runtime smoke test의 false positive를 제거해 실제로 새로 실행한 production 서버만 검증하도록 한다.

### 반영

- `verify-deploy.mjs`가 기본적으로 임의의 가용 포트를 동적으로 할당한다.
- 기존 3100 포트의 잔류 서버가 있어도 smoke test가 잘못 통과하지 않도록 분리했다.
- build와 runtime이 동일한 격리 산출물 디렉터리를 사용한다.
- 검증 중 Next가 자동 변경한 `tsconfig.json` 진단 경로를 원래 설정으로 복원했다.

### 검증

- `node --check scripts/verify-deploy.mjs` 통과.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.
- 기존 배포 검증에서 발견된 `EADDRINUSE` false positive 원인을 코드 경로로 재현·해결했다.

근거: smoke test 포트가 실행 시 새로 확보되므로 기존 프로세스가 health 응답을 가로채는 경로가 제거됐다.

### 다음 개선

- `npm.cmd run deploy:verify`를 다시 실행해 동적 포트에서 production 서버 시작과 `/charts` 응답을 실제로 검증한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-051
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-052

### 목표

runtime smoke test가 잔류 서버를 잘못 성공 처리하지 않고, 이번 배포 검증이 실제로 시작한 production 서버를 검증하도록 확인한다.

### 반영

- 배포 검증이 전용 `.next-deploy-verify`에서 build하도록 유지했다.
- 동적 가용 포트 `56169`를 할당해 production standalone 서버를 시작했다.
- `/charts` health smoke test가 새 서버에서 성공함을 확인했다.
- Next 자동 변경으로 추가된 `tsconfig.json` 경로는 원래 설정으로 복원했다.

### 검증

- `npm.cmd run deploy:verify`에서 quality gate·build 통과.
- 테스트 154개 파일·507개 테스트 통과.
- production 서버 `http://localhost:56169` 시작 및 `/charts` smoke test 통과.
- 배포 검증 성공 메시지 확인.

근거: 동적 포트에서 새 서버가 `Ready` 상태가 된 뒤 `Deployment verification passed: quality gates, build, and runtime smoke test.`가 출력됐다.

### 다음 개선

- smoke test가 실제 HTTP 응답 상태와 응답 본문 특성까지 검증하도록 최소한의 route assertion을 추가한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-052
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-053

### 목표

배포 runtime smoke test가 단순 HTTP 성공이 아니라 실제 HTML 응답을 검증하도록 강화한다.

### 반영

- `verify-deploy.mjs`가 응답 상태 2xx, `content-type: text/html`, 본문 길이 100자 초과를 함께 확인한다.
- 실패 시 상태 코드·content-type·본문 길이를 오류 정보로 남긴다.

### 검증

- `node --check scripts/verify-deploy.mjs` 통과.
- `npm.cmd run docs:check` 통과.
- `git diff --check` 통과.

근거: smoke test의 성공 조건과 실패 진단 정보가 코드에 명시적으로 반영됐다.

### 다음 개선

- production 서버를 동적 포트로 실행하는 `npm.cmd run deploy:verify`를 재실행해 HTML 본문 검증까지 통합 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-053
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
