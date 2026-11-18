# 종목 추출 응답 병목 개선 (2026-11-18)

## 목표와 범위

`/charts` 직접 조건 종목 추출의 cold 지연과 클라이언트 timeout 경로를 개선한다. 영향 범위는 `POST /api/screener/run`의 응답 처리와 `components/ticker-chart-workbench.tsx` 요청 제한이다.

## 원인과 기준값

- 배포 전 기록된 운영 cold 기준은 KR 10,307ms, US 56,286ms이며 양쪽 모두 10개 결과였다. 즉시 반복은 인메모리 cache hit이므로 비교에서 제외한다.
- UI timeout은 45초여서 정상 완료가 56초 걸리는 US 요청은 사용자에게 오류로 보일 수 있었다.
- 배포 후 첫 측정은 KR 34.8초, US server timing 24.9초(전체 29.29초)로 시장 간 결과가 엇갈렸다. 서로 다른 시점/서버 부하의 단일 샘플만으로 개선을 주장할 수 없다.
- 기존 행 기반 쿼리 재배포 뒤 US broad scan은 두 번 연속 nginx `504`로 약 60.8초에 종료됐다. 시총 하한을 높인 선택 scan은 HTTP 200/10건, server timing 8.1초(클라이언트 전체 35.2초)였다.
- DB 실행계획 도구는 `.env.local`에 지정된 localhost PostgreSQL이 없어 연결에 실패했다.

## 변경과 결정

- `components/ticker-chart-workbench.tsx`: 요청 timeout을 45초에서 90초로 늘려 cold 완료 전에 클라이언트가 취소하는 경로를 완화한다.
- `lib/db-screener.ts`: JSON_AGG 집계 방식은 운영 결과로 개선이 입증되지 않아 원래 행 기반 데이터 shape로 복구한다.
- broad US 요청은 NAS/NYS/AMS별 DB query를 병렬 실행하고 각 결과를 병합해 전역 정렬한다. 각 partition의 local top `limit`만 모아도 전역 top `limit`을 보존한다.
- market-cap 내림차순만 정렬하고 market-cap 조건만 사용하는 경우, exchange마다 시총 상위 `limit` rank를 SQL에서 먼저 고른 뒤 캔들 상세를 가져온다. 경계 동률은 모두 포함한다.
- SQL 사전 필터는 수치형 시총 조건에만 적용한다. `"D.close"` 같은 다른 지표 참조형 값은 기존 전체 후보 엔진에서 평가한다.
- 기존 regression fixture를 행 기반 응답에 맞추고 candle date/fetched-at 결과 검증을 유지한다.
- 상세 조건 설계는 [`../CHARTS_CUSTOM_SCREENER_DESIGN.md`](../CHARTS_CUSTOM_SCREENER_DESIGN.md), 반복 장애 기록은 [`../ERROR_HANDLING.md`](../ERROR_HANDLING.md)에 연결한다.

## 검증과 배포

- 최초 집계안은 commit `21423216`으로 `oci`에 배포됐다. workflow #1323은 성공했다.
- 해당 배포의 `/charts`와 `/api/health`는 HTTP 200이었다. KR 요청은 10개 결과와 봉 거래일/갱신시각 metadata를 반환했다. US 요청은 HTTP 200, 10개 결과였고 server timing 24.9초였다.
- 후속 행 기반 복원은 commit `054b1c60`, OCI workflow #1324로 배포됐다. health와 `/charts`는 HTTP 200이었으나 broad US scan은 HTTP 504로 실패했다.
- exchange 병렬 조회만으로는 broad US 요청의 60초 504가 해결되지 않았다. market-cap 상위 rank 사전 선택 변경은 전체 테스트 1,485개, production build, standalone `/charts`/11개 청크 및 API smoke, typecheck와 API/doc/KIS/auth/cron 게이트를 통과했다. `npm run measure:screener-db`는 `.env.local` localhost PostgreSQL `:5432` 연결 거부로 실행계획을 내지 못했다.
- 배포 audit은 production 의존성에 대해 `npm audit --omit=dev --audit-level=moderate`를 gate로 실행한다. 전체 의존성 감사는 `npm run audit:dependencies:all`로 별도 유지하며, 현재 dev-only `picomatch@4.0.7` advisory 7 high를 보고한다. 수정판이 나오면 전체 트리를 재감사한다. OCI 배포 후 동일 cold US scan을 재측정한다.

## 재발 감지와 다음 단계

- 성능 비교는 동일 payload, cold fingerprint, 같은 배포 버전에서 각 시장 여러 번 측정하고 median/p95 및 결과/metadata 동등성을 기록한다.
- 병렬 exchange scan은 DB에 세 query를 동시에 보낸다. 운영 pool/DB 부하가 올라가거나 응답이 빨라지지 않으면 직렬·단일 query 방식과 실행계획을 비교한다.
- 시총 외 조건 또는 EMA 조건이 있거나 OR 조건인 요청에는 후보 상위 rank 최적화를 적용하지 않는다. 시총 동률 rank를 모두 유지하고 다른 요청은 기존 전체 후보 평가 경로를 쓴다.
- 다른 지표를 참조하는 시장가치 필터는 숫자 SQL 경계로 축약하지 않는다. 회귀 테스트에서 이 요청은 rank CTE 없이 전체 후보 SQL을 사용한다.
- 성능 회귀가 계속되면 운영 read-only DB 접근이 가능한 환경에서 PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)`와 Node 계산 시간을 분리 계측한다. 현재 로컬 DB 미가용 상태가 남은 제한이다.
- 개선 과제 ID `CI-2026-11-18-001`은 후속 배포 측정 전까지 `PARTIAL`로 둔다.
