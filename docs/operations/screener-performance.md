# 종목 추출 응답 병목 개선 (2026-11-18)

## 목표와 범위

`/charts` 직접 조건 종목 추출의 cold 지연과 클라이언트 timeout 경로를 개선한다. 영향 범위는 `POST /api/screener/run`의 응답 처리와 `components/ticker-chart-workbench.tsx` 요청 제한이다.

## 원인과 기준값

- 배포 전 기록된 운영 cold 기준은 KR 10,307ms, US 56,286ms이며 양쪽 모두 10개 결과였다. 즉시 반복은 인메모리 cache hit이므로 비교에서 제외한다.
- UI timeout은 45초여서 정상 완료가 56초 걸리는 US 요청은 사용자에게 오류로 보일 수 있었다.
- 배포 후 첫 측정은 KR 34.8초, US server timing 24.9초(전체 29.29초)로 시장 간 결과가 엇갈렸다. 서로 다른 시점/서버 부하의 단일 샘플만으로 개선을 주장할 수 없다.
- DB 실행계획 도구는 `.env.local`에 지정된 localhost PostgreSQL이 없어 연결에 실패했다.

## 변경과 결정

- `components/ticker-chart-workbench.tsx`: 요청 timeout을 45초에서 90초로 늘려 cold 완료 전에 클라이언트가 취소하는 경로를 완화한다.
- `lib/db-screener.ts`: JSON_AGG 집계 방식은 운영 결과로 개선이 입증되지 않아 원래 행 기반 데이터 shape로 복구한다.
- 기존 regression fixture를 행 기반 응답에 맞추고 candle date/fetched-at 결과 검증을 유지한다.
- 상세 조건 설계는 [`../CHARTS_CUSTOM_SCREENER_DESIGN.md`](../CHARTS_CUSTOM_SCREENER_DESIGN.md), 반복 장애 기록은 [`../ERROR_HANDLING.md`](../ERROR_HANDLING.md)에 연결한다.

## 검증과 배포

- 최초 집계안은 commit `21423216`으로 `oci`에 배포됐다. workflow #1323은 성공했다.
- 해당 배포의 `/charts`와 `/api/health`는 HTTP 200이었다. KR 요청은 10개 결과와 봉 거래일/갱신시각 metadata를 반환했다. US 요청은 HTTP 200, 10개 결과였고 server timing 24.9초였다.
- 후속 행 기반 복원은 전체 사전 build/test/run 검증 뒤 OCI로 다시 배포한다. 두 번째 배포 결과와 재측정은 이 문서 및 `DEVELOPMENT_LOG.md`에 추가한다.

## 재발 감지와 다음 단계

- 성능 비교는 동일 payload, cold fingerprint, 같은 배포 버전에서 각 시장 여러 번 측정하고 median/p95 및 결과/metadata 동등성을 기록한다.
- 성능 회귀가 계속되면 운영 read-only DB 접근이 가능한 환경에서 PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)`와 Node 계산 시간을 분리 계측한다. 현재 로컬 DB 미가용 상태가 남은 제한이다.
- 개선 과제 ID `CI-2026-11-18-001`은 후속 배포 측정 전까지 `PARTIAL`로 둔다.
