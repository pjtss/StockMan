# 국내·해외 상승률 TOP 100 운영 검증 체크리스트

## 목적

국내·해외 상승률 TOP 100이 KIS 원본 응답, 상품 필터, 메모리 스냅샷, 장외 마지막 정상 데이터 경로까지 실제 운영 환경에서 정상 동작하는지 반복 검증한다.

## 검증 순서

| 단계 | 확인 대상 | 성공 기준 | 증거 |
|---|---|---|---|
| 1 | KIS 인증 | 토큰 발급 성공, 자격증명 원문 미노출 | `rt_cd`, `msg_cd`, 상태 코드 |
| 2 | 국내 원본 순위 | `/api/kis/detection-candidates?source=fluctuation`이 JSON 200, `diagnostics.rtCd=0`, rows>0 | 응답의 `rows`, `diagnostics` |
| 3 | 해외 거래소 원본 | NAS·AMS·NYS 각각의 HTTP/KIS 성공 여부와 수신 행 수를 독립 확인. 100행 미만은 부분 응답으로 남고 다른 거래소 결과를 폐기하지 않음 | 거래소별 HTTP status, `rt_cd`, 행 수 |
| 4 | 상품 필터 | ETF·ETN·워런트·파생·비활성·비보통주가 최종 후보와 focus pool에 없음 | `criteria.officialEligibility`, `productExcluded` |
| 5 | 해외 차트 API | `/api/stock/us/top-rising-chart`가 JSON 200. `markets[]`별 `sourceCount/sourceComplete/collectedAt`와 오류·fallback 상태가 UI와 일치. 전체 `complete=true`는 세 거래소가 정상 100행일 때만 허용 | `source`, `complete`, `markets[]`, `collectedAt`, `ageSeconds`, `items` |
| 6 | 국내 차트 API | `/api/stock/kr/top-rising-chart`가 JSON 200, 메모리 또는 장외 KIS 마지막 순위 source, items>0 | `source`, `collectedAt`, `items` |
| 7 | 장외 의미 | 정상 200·0행은 transport error가 아니며, 마지막 정상 응답과 현재 응답을 구분 | `source`, `message`, `collectedAt` |
| 8 | 워커 상태 | 장중에는 `RUNNING` 및 최근 `lastTickAt`; 장외 `STOPPED/DISABLED`는 정상 비활성 상태 | `/api/kis/intraday-mvp` |
| 9 | API 형식 | 모든 경로가 HTML이 아닌 `application/json`을 반환 | HTTP status/content-type |
| 10 | 회귀 검증 | 정규화·부분응답·필터·메모리 상태 테스트와 전체 verify 통과 | Vitest, typecheck, build |

## 주말·장외 테스트 방법

1. 국내 원본 API로 KIS가 반환하는 마지막 거래일의 `observedAt`/필드가 존재하는지 확인한다.
2. 해외 거래소별 원본 API를 `VOL_RANG=0`으로 호출한다. 장외에 0행이면 실패로 단정하지 않고 `rt_cd=0`, `recordCount`, `rawTextPreview`를 함께 기록한다.
3. 워커가 비활성인 상태에서 국내·해외 차트 API를 각각 호출한다. 국내는 `KIS_LAST_RANKING`, 해외는 `KIS_TOP_RISING_HYDRATION` 또는 저장된 메모리 source를 확인한다.
4. 응답 행이 0이면 이전 스냅샷을 최신 데이터로 덮어쓰지 않는지 확인한다. 데이터가 없는데 `ok=true`인 응답은 허용하지 않는다.
5. 다음 정규장에 같은 호출을 반복해 실제 KIS 수집시각과 거래소별 source count를 확인한다. 미국 전체 `complete=true`는 NAS·AMS·NYS가 모두 정상 100행일 때만 허용한다. 수집시각이 없거나 60초보다 오래되면 UI 경고를 확인한다.

## 현재 확인 결과

- 2026-09-19 장외 운영 확인: 해외 NAS 원본 100행, 해외 차트 필터 후 82개가 JSON 200으로 표시됐다.
- 같은 시각 국내 KIS 변동률 원본은 JSON 200·정상 코드·30행으로 반환됐으나, 기존 국내 차트 API는 메모리만 읽어 빈 배열을 반환했다.
- 국내 차트 API에 `KIS_LAST_RANKING` hydration 경로를 추가했고, 워커가 비활성인 주말에도 마지막 KIS 순위를 표시하도록 수정했다.
- 장중 메모리 우선 원칙은 유지한다. 메모리 스냅샷이 있으면 KIS를 중복 호출하지 않는다.
- 해외 공식 보통주 조회가 `daily_active` 누락으로 실패하는 구버전 DB에서는 해당 컬럼만 생략하는 호환 조회를 사용하고, `lookupFallbackUsed`·`lookupError`를 응답 진단에 남긴다.
- focus 후보는 시총/거래대금으로 점수를 계산할 수 있는 행을 우선하고, 빠진 슬롯은 설정 필터와 공식 활성 보통주 검증을 통과한 원천 rank로 최대 30개까지 채운다. 상승률 API가 시총·거래대금을 제공하지 않아도 분봉 조회 큐가 0개로 고정되지 않는지 focus-pool 테스트로 확인한다. 시총 미확인일 때 분봉 금액은 조회할 수 있으나 비율·비율 알림은 null이어야 한다.
- KIS 실분봉 점검(2026-10-07): .env.local 로컬 설정으로 NAS의 BIYA 1분봉 endpoint가 HTTP 200, 28개 row를 반환했다. 공식 해외 분봉 query field만 사용하도록 보정 후에도 HTTP 200을 확인했다. KST와 미국 현지 시각이 동일 UTC 시각으로 변환됐다. 로컬 개발 모드는 production worker 자동 시작을 막으므로 이 검증은 직접 KIS 실호출이며, 30개 전체 워커 연속 관측 검증과는 구분한다.

## 재발 방지

- 국내·해외 차트 API 모두 `source`, `collectedAt`, `items`, `message`를 반환한다.
- 원본 응답의 HTTP 상태·content type·KIS `rt_cd`·행 수를 운영 점검 기록에 남긴다.
- KIS 정상 0행과 네트워크/HTTP 실패를 별도 상태로 처리한다.
- 배포 전 `npm run verify`와 로컬 서버 API 호출을 모두 실행한다.
