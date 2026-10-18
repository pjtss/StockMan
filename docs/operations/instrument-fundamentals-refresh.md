# 종목 재무·시가총액 스냅샷 갱신 운영 기준

## 목적과 범위

`/api/cron/instrument-fundamentals`는 국내·해외 공식 종목 마스터에서 활성 `COMMON_STOCK`로 확인된 종목의 KIS 가격 상세 응답을 읽고, `instrument_fundamental_history`와 `instrument_fundamental_snapshots`에 반영한다. 본 기준은 대상 필터링, 응답 유효성, 부분 저장, 재시도 및 다음 실행 시각을 규정한다.

## 처리 파이프라인

```text
기능 활성화·예약시각 확인
  → 직전 실행 상태/시각 확인 (조회 실패·잘못된 시각이면 중단)
  → 활성 COMMON_STOCK 및 비정상 상품 제외 (불명확하면 제외)
  → 200종목 단위로 KIS 조회, 최대 8개 worker
  → HTTP + KIS 업무 코드 + 신선도 + 가격 + 시총 검증
  → 유효 행만 history + latest snapshot 트랜잭션 저장
  → 배치별 재시도 및 계측 결과 기록
  → SUCCESS / PARTIAL / FAILED / SKIPPED로 실행상태 반영
```

## 데이터 무결성 규칙

- 빈 문자열·누락·숫자 변환 실패는 `0`이 아니라 `null`이다. 실제 숫자 0은 0으로 보존한다.
- 해외 응답은 HTTP 성공, `rt_cd=0`, stale 아님을 모두 확인한다. 국내 응답도 HTTP 및 KIS 업무 성공 코드와 유효한 양의 가격을 요구한다.
- 시가총액은 양수일 때만 해당 실행의 갱신값으로 인정한다. 누락·0·음수이면 해당 종목을 실패 처리하고 history/snapshot을 기록하지 않아 기존 snapshot을 손상시키지 않는다.
- nullable 필드는 snapshot upsert 시 기존 값을 `COALESCE`로 보존한다. 따라서 부분 응답의 null이 직전 정상값을 지우지 않는다.
- 대상은 DB 질의 조건과 애플리케이션 eligibility 검사 양쪽에서 검증한다. 활성 상태·`COMMON_STOCK`·시장 분류 또는 제외 플래그를 신뢰할 수 없으면 provider 호출 전 제외한다.
- 배치 내 history와 snapshot 저장은 하나의 DB 트랜잭션이다. 각 배치는 최대 3회 재시도하며 DB 오류가 지속되면 이후 배치 처리를 중단한다.

## 실행 상태 및 재시도

- `SUCCESS`: 대상 전체 저장 완료. 설정된 실행 간격 전에는 다시 실행하지 않는다.
- `PARTIAL` / `FAILED`: 결과와 실제 저장 성공 건수를 구분해 기록한다. 최소 1시간 cooldown 뒤 재시도할 수 있다(관리 설정 간격이 더 짧더라도 1시간 최소 간격 적용).
- `SKIPPED`: 이미 실행 중인 작업의 advisory lock 획득 실패 등으로 이번 실행을 건너뛴 상태이며 성공으로 기록하지 않는다.
- 최근 실행 상태 조회 실패 또는 timestamp가 잘못된 경우 안전한 중복방지 기준을 세울 수 없으므로 cron은 503으로 중단한다.
- 이전 RUNNING이 2시간 이내면 중복 실행하지 않는다. 프로세스 잠금은 실제 refresh 경로에서도 별도로 적용한다.

## 성능·관측 항목

실행 결과에 `durationMs`, `providerDurationMs`(병렬 worker 요청시간의 합), `databaseDurationMs`(실패 재시도 시간 포함), `batchCount`, `attemptedCount`, `successCount`, `failureCount`, `unattemptedCount`, `databaseFailure`, 시장별 대상/성공/실패 건수를 포함한다. 실패 샘플은 최대 100건이다. KIS 응답 원문이나 자격증명은 오류 메시지에 포함하지 않는다. 외부 오류는 기계 판독 가능한 안전 오류 코드로 축약한다.

## 자동 검증 및 운영 점검

Vitest의 `lib/instrument-fundamentals.test.ts`, `lib/kis-kr-price-detail.test.ts`, `lib/automation-run.test.ts`, `app/api/cron/instrument-fundamentals/route.test.ts`가 누락 수치, fail-closed 상품 필터, stale/업무오류 응답, 시총 누락, 트랜잭션 배치, DB 재시도, 실행상태 및 cron cooldown을 검증한다. 변경 시 전체 배포 게이트도 실행한다.

운영에서 관리자 실행 이력의 상태와 요약을 확인한다. `PARTIAL`/`FAILED`이면 `failureCount`, `unattemptedCount`, `databaseFailure`, 시장별 실패 및 실패 샘플을 먼저 확인하고, 성공 건수는 시도 수가 아니라 커밋된 snapshot 배치 행 수로 해석한다.

## 남은 한계

- 전체 활성 보통주 수가 많으면 KIS의 글로벌 TPS 제한과 API 지연으로 한 번의 전체 갱신이 오래 걸릴 수 있다. 현재 구현은 200종목씩 수집·저장하므로 전체 결과를 메모리에 쌓아두지 않지만, durable resume cursor는 없다. 서버가 배치 중 종료되면 미완료/미시도 종목은 다음 전체 실행 때 다시 수집한다.
- 단일 batch의 DB write가 3회 모두 실패하면 이후 provider 호출을 중단한다. 이미 커밋된 이전 배치는 유지되며, 해당 배치와 이후 종목은 `failureCount`/`unattemptedCount`로 실패 실행에 표시된다.
- KIS 제공 시총의 기준 시각·공식 원천 갱신 주기는 이 작업에서 보장하지 않는다. 값은 수집 시각과 함께 snapshot/history에 보관한다.
