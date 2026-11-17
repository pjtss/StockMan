# 종목 추출 응답 병목 개선 (2026-11-18)

## 목표와 범위

`/charts` 직접 조건 종목 추출의 cold 지연과 클라이언트 timeout 경로를 개선한다. 영향 범위는 `POST /api/screener/run`의 조회 결과 행 형식과 `components/ticker-chart-workbench.tsx` 요청 제한이다.

## 원인과 기준값

- 운영 공개 API의 국내 일봉 기본 스캔은 첫 요청 `HTTP 200`, 10,307ms(`Server-Timing`), 10개 결과였다.
- 미국 일봉 기본 스캔은 첫 요청 `HTTP 200`, 56,286ms, 10개 결과였다. 즉시 반복은 결과 캐시 적중 약 1ms여서 비교에서 제외한다.
- UI는 45초에 요청을 취소하여 정상적인 미국 cold 응답이 끝나기 전에 오류를 표시할 수 있었다.
- 기존 쿼리는 종목별 최대 65개 봉을 행 단위로 반환한다. 5,300개 활성 미국 공통주 기준 최대 약 34만 행이다. 현재 전체 `Server-Timing`만으로 DB 대 Node 비용은 분리되지 않았다.

## 변경

- `lib/db-screener.ts`: 종목·봉 주기별 캔들을 `JSON_AGG` 배열로 묶어 행 수와 반복 종목 필드를 줄이고 배열을 기존 계산 경로로 복원한다.
- `components/ticker-chart-workbench.tsx`: 요청 제한을 45초에서 90초로 늘린다.
- `lib/db-screener-aggregated-rows.test.ts`: 집계 D/W 봉에서 결과 종목과 candle date/fetched-at 메타데이터를 검증한다.
- 상세 설계는 [`../CHARTS_CUSTOM_SCREENER_DESIGN.md`](../CHARTS_CUSTOM_SCREENER_DESIGN.md), 반복 장애 처리는 [`../ERROR_HANDLING.md`](../ERROR_HANDLING.md)에 연결한다.

## 검증과 배포

- 변경 관련 회귀 테스트: 2개 파일·10개 테스트 통과. 전체 suite는 276개 파일 중 275 passed/1 skipped, 1,484 passed/3 skipped.
- 전체 TypeScript 검사와 `npm run deploy:verify` 통과. 검증에는 production build, standalone `/charts` HTTP 200, 11개 JS chunk, desktop/mobile Chrome hydration 및 API smoke가 포함됐다.
- PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` 및 변경 후 운영 cold 요청은 배포 전 아직 수행하지 않았다.
- 검증 통과 후 커밋과 `oci` push가 OCI 배포 workflow를 시작한다. 실제 배포 및 운영 health 확인은 완료 후 기록한다.

## 재발 감지와 다음 단계

- 신규 fingerprint의 첫 응답만 cold 비교값으로 기록하고 반복 캐시 응답은 제외한다.
- 배포 후 KR/US 응답시간, 결과 종목·조건 값, D/W/M 거래일과 갱신시각 메타데이터를 전후 비교한다.
- JSON 집계는 DB가 읽는 캔들 수를 줄이지 않는다. cold 지연이 지속되면 DB 조회와 Node 계산을 별도 계측하고 해당 쿼리의 실행 계획을 분석한다.
- 개선 과제 ID: `CI-2026-11-18-001`; 성과 판정은 배포 후 실측 전까지 `PARTIAL`이다.
