# 2026-10-16 로컬 배포 검증 및 범위 감사

## 목적

배포 요청에 따라 현재 워킹트리의 로컬 배포 검증을 실행하고, 운영 배포 전에 변경 범위 및 반복 방지 검증의 공백을 확인한다.

## 확인된 워킹트리 범위

- 기준 HEAD: `c97261dd` (`차트 API 응답 성능 개선 및 IPO 일정 KIS 모듈 등록`).
- 검증 시작 전 변경 항목: 758개(unstaged 수정 147, staged+unstaged 수정 11, staged 삭제 15, untracked 585).
- staged 삭제에는 SEC Company Facts API·cron·UI·수집/저장 모듈이 포함됐다. 이 삭제가 이번 배포 의도인지 현재 대화 증거만으로 판단할 수 없어 운영 배포와 일괄 커밋은 진행하지 않았다.
- `components/chart-modal.tsx`, `DEVELOPMENT_LOG.md`, 배포 운영문서 등도 이미 수정 상태였으므로 기존 변경에 덮어쓰지 않았다.

## 로컬 검증 결과

`npm.cmd run deploy:verify` 성공 (차트 모달 회귀 테스트 추가 후 재실행):

- 문서 검사: 18개 entry point, migration 149개 검사 통과(최신 V149).
- 변경 범위 감사, KIS 요청 경계 감사, OCI cron 구조 및 RSS timer wiring 검사 통과.
- Next.js production build 및 타입 검사 통과.
- Vitest: 267개 파일 통과, 1,286개 테스트 통과, 2개 skip.
- standalone 실행 smoke: `/charts`와 `/manifest.webmanifest` 모두 HTTP 200.

## 운영 차트 API 읽기 전용 확인

- `GET https://stockman.r-e.kr/api/stock/chart?code=005930&company=삼성전자&market=KR&timeframe=D` 응답은 HTTP 200, `application/json`이었다.
- 응답에 `code`, `company`, `candles`, `indicators`, `latestPrice`, `candleDataUpdatedAt`, `fundamentals` 등 차트 표시 필드가 있었고, `005930`/`삼성전자`에 일봉 40개(첫 거래일 2026-08-18, 마지막 거래일 2026-10-16)가 포함됐다.
- 이 결과는 API 데이터 공급을 확인할 뿐 모달의 브라우저 렌더링을 증명하지 않는다. 운영 브라우저 모달 자체 검증은 아직 미실행이다.

## 개선 발견 및 재발 방지

- 기존 `audit:verify-scope`의 실제 책임은 `config/verify-scope.json` 승인 메타데이터 검증이다. 이름과 달리 배포 파일 목록의 사용자 승인 여부를 검사하는 기능은 아니므로, 이 게이트가 통과해도 release diff가 의도된 범위라는 뜻은 아니다. 이번 확인에서는 해당 스크립트를 변경하지 않았다.
- 현재 standalone 배포 smoke는 페이지 응답만 확인한다. 차트 모달 열기, `/api/stock/chart` 응답 확인, 캔들 차트 렌더링, 닫기 동작을 실제 브라우저에서 확인하는 자동 게이트는 저장소에서 확인되지 않았다.
- 다음 변경에서 브라우저 smoke를 추가할 때는 읽기 전용 차트 조회만 검증하고 KIS 실시간 승인·이벤트 쓰기 요청을 차단 또는 모의 처리해 배포 검증 부작용을 방지한다.
- 배포 전 staged/unstaged/untracked 변경을 배포 목록과 대조하고, 사용자 의도가 확인되지 않은 삭제나 연구 산출물을 무차별 stage하지 않는다.

## 추가 오류 수정 및 회귀 테스트

- `ChartModal` 키보드 핸들러가 `event.target`의 `tagName`이 없는 경우 `toLowerCase()` 예외를 던지는 결함을 재현했다. `target?.tagName?.toLowerCase()`로 바꿔 비-Element 이벤트 타깃도 안전하게 처리한다.
- 설정 복원도 입력 검증 없이 JSON.parse 결과를 object로 단언하고 있어, 저장값이 유효한 JSON `null`일 때 초기 state 생성 중 렌더 예외가 발생했다. `null`·배열·primitive·파싱 오류는 빈 설정으로 복구하고 기본 일봉 설정을 사용하도록 했다.
- 차트 엔진의 `import("lightweight-charts")`를 `lib/chart-library.ts` 지연 로딩 경계로 분리했다. UI 단위 테스트는 이 경계를 mock해 jsdom에 없는 실제 Canvas 렌더러에 의존하지 않으면서 차트 생성·시리즈 데이터 전달을 검증한다.
- `components/chart-modal.test.tsx`에서 API 응답으로부터 캔들 데이터 로드, 날짜 오름차순 정렬, 유효하지 않은 음수 OHLC 제거, candlestick series로 전달, 종목명/EMA 범례/닫기 컨트롤 표시, 닫기 버튼·Escape 동작 및 잘못된 sessionStorage 복구를 검증한다.
- 집중 테스트 결과: 1개 파일, 6개 테스트 통과. sessionStorage `null`, 배열, primitive, 깨진 JSON 입력은 각기 다른 종목 코드로 실행해 차트 캐시의 테스트 간섭을 제거했다. 테스트 작성 중 존재하지 않는 `@testing-library/user-event` 참조와 jsdom의 Canvas 한계를 확인해 새 패키지를 설치하지 않고 `fireEvent`와 로컬 차트 로딩 mock으로 해결했다.
- 테스트 확장 후 전체 `npm.cmd run deploy:verify`를 재실행해 문서/구조 감사, production build, 267개 테스트 파일(1,286 pass/2 skip), TypeScript 검사, standalone `/charts` 및 `/manifest.webmanifest` HTTP 200을 모두 확인했다.
- 전체 테스트는 Windows 환경에서 148초가 걸렸지만 정상 완료했다. 검증 프로세스를 중단하지 않고 완료 상태와 smoke 응답까지 확인했다.
- 커밋·푸시·운영 배포는 변경 범위 불명확으로 계속 미실행이다.

## 배포 상태

- 원래 작업폴더에는 차트 변경 외 다수 수정과 staged 삭제가 있어 이를 포함하지 않았다. 차트 변경을 원격 최신 `oci` 기준 별도 worktree로 옮겨 범위를 격리했다.
- 원격 기준 커밋: `7f992444` (차트 UI 브라우저 상호작용 검증과 운영 배포 결과 기록).
- 원격 기준 격리 검증: `npm.cmd run deploy:verify` 성공. Next production build 통과, Chrome `/charts` hydration 데스크톱·모바일 통과, 관련 API/status smoke 통과, Vitest 216개 파일(752 pass/1 skip), 타입 검사 및 docs·scope·KIS·bearer-auth·cron 검사 통과.
- 격리 검증 기준 마이그레이션은 148개, 최신 V153이며 운영 relation 21개 검사가 통과했다.
- 이 문서는 로컬 기준 트리에서 최초로 확인한 범위와 별도로, 원격 최신 기준의 검증 결과를 함께 보존한다. 커밋·푸시는 격리된 4개 파일만 대상으로 수행하고, 사용자 작업폴더의 staged 삭제 및 기타 변경은 포함하지 않는다.

## 다음 개선 과제

1. 사용자가 승인한 배포 파일 범위를 확정한다.
2. 실제 브라우저 UI 자동화를 이용할 수 있는 검증 러너를 확인해 모달 브라우저 smoke를 보완한다. 이번 Windows Computer Use 호출은 현재 브라우저 URL을 식별하지 못해 UI 단계에서 중단됐다.
3. release diff의 승인 범위를 자동 요약하는 게이트를 별도 설계하고, 사용자 승인 규약이 확정되기 전에는 자동 허용/거부 동작을 추가하지 않는다.
4. 승인된 변경만 격리 stage하고 전체 검증을 다시 실행한 뒤 커밋·푸시·배포한다.
