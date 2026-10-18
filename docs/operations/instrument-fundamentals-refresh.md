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
  → 같은 트랜잭션에서 종목별 SUCCESS/FAILED 진행 상태 저장
  → 배치별 재시도 및 계측 결과 기록
  → SUCCESS / PARTIAL / FAILED / SKIPPED로 실행상태 반영
```

실행은 공유 `stockman-cron.service`가 아니라 전용 `stockman-fundamentals.timer`/`.service`가 담당한다. timer는 5분마다 모듈의 관리자 설정을 확인하고, 실제 전체 갱신은 전용 oneshot service가 응답을 기다린다. 이로써 긴 시총 갱신이 RSS·캔들 등 다른 cron 요청을 순차 지연시키거나 앞선 300초 curl timeout 뒤 다른 KIS 작업과 겹치는 일을 방지한다. HTTP 대기 제한은 4시간 15분, Nginx의 이 전용 경로는 4시간 25분, systemd 서비스 제한은 4시간 30분이며, route 중복 방지와 stale-run 판정은 5시간을 사용해 서비스 최대 실행시간보다 먼저 살아 있는 작업을 종료 처리하지 않는다.

## 데이터 무결성 규칙

- 빈 문자열·누락·숫자 변환 실패는 `0`이 아니라 `null`이다. 실제 숫자 0은 0으로 보존한다.
- 해외 응답은 HTTP 성공, `rt_cd=0`, stale 아님을 모두 확인한다. 국내 응답도 HTTP 및 KIS 업무 성공 코드와 유효한 양의 가격을 요구한다.
- 시가총액은 양수일 때만 해당 실행의 갱신값으로 인정한다. 누락·0·음수이면 해당 종목을 실패 처리하고 history/snapshot을 기록하지 않아 기존 snapshot을 손상시키지 않는다.
- nullable 필드는 snapshot upsert 시 기존 값을 `COALESCE`로 보존한다. 따라서 부분 응답의 null이 직전 정상값을 지우지 않는다.
- 대상은 DB 질의 조건과 애플리케이션 eligibility 검사 양쪽에서 검증한다. 활성 상태·`COMMON_STOCK`·시장 분류 또는 제외 플래그를 신뢰할 수 없으면 provider 호출 전 제외한다.
- 배치 내 history와 snapshot 저장은 하나의 DB 트랜잭션이다. 각 배치는 최대 3회 재시도하며 DB 오류가 지속되면 이후 배치 처리를 중단한다.
- `instrument_fundamental_refresh_jobs/items`는 활성 보통주 대상 집합의 SHA-256 지문과 종목별 진행 상태를 저장한다. 재개 시 동일한 대상 집합의 `SUCCESS` 종목은 건너뛰고 `PENDING`·재시도 시각이 도래한 `FAILED`만 조회한다. provider 실패 재시도 간격은 해당 종목의 실패 횟수에 따라 1·2·4·8·24시간으로 증가하며 24시간에서 상한을 둔다. 성공 시 재시도 시각과 오류 코드를 지운다. 대상 집합이 바뀌면 기존 미완료 작업을 `ABANDONED` 처리하고 새 전체 작업을 만든다.
- 종목이 `SUCCESS`로 표시되는 것은 해당 종목의 history/snapshot 쓰기가 같은 DB 트랜잭션에서 커밋된 경우뿐이다. DB 쓰기가 모두 실패하면 배치의 진행 표식도 롤백되므로 다음 실행이 안전하게 다시 조회한다. KIS 실패는 종목별 `FAILED`, DB 미시도는 `PENDING`으로 구분한다.
- 상태 요약은 `progress.jobId`, `progress.resumed`, `progress.skippedCompletedCount`, 누적 성공/실패/미완료 건수를 제공한다. 자동화 실행 자체의 `attemptedCount`와 `successCount`는 이번 실행분이며, `progress.cumulativeSuccessCount`는 작업 전체 누적값이다.

## 실행 상태 및 재시도

- `SUCCESS`: 대상 전체 저장 완료. 설정된 실행 간격 전에는 다시 실행하지 않는다.
- `PARTIAL` / `FAILED`: 결과와 실제 저장 성공 건수를 구분해 기록한다. 실행은 최소 1시간 cooldown 뒤 재개될 수 있지만, 종목별 provider 실패는 개별 backoff 시각이 된 뒤에만 다시 KIS를 호출한다. 재시도 대상이 아직 없으면 실행을 `SKIPPED`로 기록하고 `nextRetryAt` 및 대기 종목 수를 요약에 남긴다. DB 미시도(PENDING)는 provider backoff를 적용하지 않아 기존 1시간 실행 재시도에서 회수한다.
- `SKIPPED`: 이미 실행 중인 작업의 advisory lock 획득 실패, 또는 모든 FAILED 종목의 재시도 시각이 아직 오지 않은 경우다. 성공으로 기록하지 않는다.
- 최근 실행 상태 조회 실패 또는 timestamp가 잘못된 경우 안전한 중복방지 기준을 세울 수 없으므로 cron은 503으로 중단한다.
- 이전 RUNNING이 2시간 이내면 일반 cron route에서 중복 호출하지 않고, Fundamentals route는 5시간 이내 실행을 활성 작업으로 취급한다. 실제 refresh 경로에는 PostgreSQL advisory lock도 적용한다. stale 판정 역시 일반 자동화는 2시간, Fundamentals는 5시간으로 분리해 다른 모듈이 장시간 정상 실행을 조기 실패 처리하지 않는다.
- 전용 HTTP 호출 제한은 4시간 15분, Nginx 전용 경로 제한은 4시간 25분, systemd `TimeoutStartSec`은 4시간 30분이다. 5시간 활성/stale 임계값은 시스템 서비스 제한보다 길다. 운영에서 확인된 최장 성공(약 2시간 19분)보다 여유를 둔다. timer가 예약 설정을 5분 단위로 확인하므로 관리자 시간/활성 설정은 계속 적용된다.

## 성능·관측 항목

실행 결과에 `durationMs`, `providerDurationMs`(병렬 worker 요청시간의 합), `databaseDurationMs`(실패 재시도 시간 포함), `batchCount`, `attemptedCount`, `successCount`, `failureCount`, `unattemptedCount`, `databaseFailure`, 시장별 대상/성공/실패 건수를 포함한다. 실패 샘플은 최대 100건이다. KIS 응답 원문이나 자격증명은 오류 메시지에 포함하지 않는다. 외부 오류는 기계 판독 가능한 안전 오류 코드로 축약한다.

## 자동 검증 및 운영 점검

Vitest의 `lib/instrument-fundamentals.test.ts`, `lib/instrument-fundamental-progress.test.ts`, `lib/kis-kr-price-detail.test.ts`, `lib/automation-run.test.ts`, `app/api/cron/instrument-fundamentals/route.test.ts`가 누락 수치, fail-closed 상품 필터, stale/업무오류 응답, 시총 누락, 트랜잭션 배치, DB 재시도, 종목별 재시도 backoff 및 cron cooldown을 검증한다. 변경 시 전체 배포 게이트도 실행한다.

운영에서 관리자 실행 이력의 상태와 요약을 확인한다. `PARTIAL`/`FAILED`이면 `failureCount`, `unattemptedCount`, `databaseFailure`, 시장별 실패 및 실패 샘플을 먼저 확인하고, 성공 건수는 시도 수가 아니라 커밋된 snapshot 배치 행 수로 해석한다.

## 남은 한계

- 전체 활성 보통주 수가 많으면 KIS의 글로벌 TPS 제한과 API 지연으로 한 번의 전체 갱신이 오래 걸릴 수 있다. 현재 구현은 200종목씩 수집·저장하므로 전체 결과를 메모리에 쌓아두지 않는다. 배치 중 서버가 종료되면 커밋된 종목은 건너뛰고, 당시 진행 중이던 최대 200종목 배치부터 다시 조회한다.
- 단일 batch의 DB write가 3회 모두 실패하면 이후 provider 호출을 중단한다. 이미 커밋된 이전 배치는 유지되며, 해당 배치와 이후 종목은 `failureCount`/`unattemptedCount`로 실패 실행에 표시된다.
- KIS 제공 시총의 기준 시각·공식 원천 갱신 주기는 이 작업에서 보장하지 않는다. 값은 수집 시각과 함께 snapshot/history에 보관한다.

## 장시간 실행 운영 관측

2026-10-18 운영 디버깅 API에서 최근 전체 49회 성공의 중앙 실행시간은 856,411ms(14.3분), p95는 5,794,045ms(96.6분), 최장은 8,328,211ms(138.8분)이었다. 같은 module 이력에 `AUTOMATION_RUN_STALE` 11건이 확인됐다. 기존 공유 cron은 해당 POST를 300초 제한으로 순차 호출해 정상적인 장시간 실행과 HTTP 호출 생명주기가 맞지 않았다.

- 성공 후 `systemctl status stockman-fundamentals.timer`로 timer 활성 상태를 확인한다.
- 진행/실패 로그는 `journalctl -u stockman-fundamentals.service`에서 확인한다. API 상세 성공·실패 건수는 관리자 자동화 실행 이력에서 확인한다.
- 공식 systemd 기준: [systemd.service `TimeoutStartSec`](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html#TimeoutStartSec=)는 oneshot 활성화 timeout을 제어하고, [systemd.timer `OnCalendar`와 `Persistent`](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html#Persistent=)는 반복/정지 후 catch-up을 제어한다.
- 공식 Nginx 기준: [ngx_http_proxy_module `proxy_read_timeout`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_read_timeout)의 기본값은 60초이고 연속 upstream read 사이의 제한이다. API의 정확한 location에만 4시간 25분을 지정해 전용 요청만 curl/systemd timeout 사이에서 기다리게 한다.
- 남은 위험: 응답이 전용 4시간 15분 한도도 넘으면 runner가 실패 종료하고 다음 timer 때 관리자 재시도 정책에 따른다. 종료(성공·부분·실패·중단)된 진행 이력은 새 작업 시작 시 14일 이후 정리한다. 같은 대상 지문의 미완료 작업은 그보다 오래됐더라도 재개한다. 대상 유니버스가 변경되면 정합성 우선으로 전체 재시작하며, 이미 저장된 최신 스냅샷은 유지된다.
