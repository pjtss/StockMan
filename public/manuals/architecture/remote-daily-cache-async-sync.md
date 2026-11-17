# 운영 일봉 API 조회·로컬 DB 저장 분리 설계

## 목적

운영 서버의 일봉 batch API 조회와 로컬 PostgreSQL 저장을 한 루프에서 순차 처리하지 않는다. API 응답을 제한된 큐에 넣고, 별도 저장 워커가 비동기로 upsert한다.

## 처리 흐름

```text
유니버스 분할
  → 조회 워커(2~4개)
  → bounded queue(10~20 batch)
  → 저장 워커(2개)
  → batch 체크포인트/재시도
```

## 운영 규칙

- 조회 동시성과 DB 저장 동시성을 독립적으로 제한한다.
- 큐가 가득 차면 조회 워커를 일시 정지해 backpressure를 적용한다.
- 저장은 batch 단위 트랜잭션으로 처리한다.
- DB commit 성공 후에만 해당 batch를 완료 처리한다.
- 실패 batch만 지수 backoff로 재시도한다.
- `market`, `timeframe`, `offset` 또는 코드 범위를 체크포인트로 기록한다.
- 재시작 시 성공한 batch는 건너뛰고 미완료 batch부터 재개한다.
- 일봉 저장과 기초정보 저장은 별도 작업으로 분리한다. 기초정보 API 404가 일봉 저장을 막아서는 안 된다.

## 권장 기본값

| 항목 | 값 |
|---|---:|
| API 조회 워커 | 2 |
| DB 저장 워커 | 2 |
| 최대 큐 크기 | 10 batch |
| batch 크기 | 100 종목 |
| 실패 재시도 | 3회 |
| 재시도 지연 | 1초, 3초, 10초 |

## 무결성 기준

- `(market, code, timeframe, candle_date)` 복합 키로 upsert한다.
- 운영 API 응답의 봉 개수와 저장 성공 개수를 별도로 기록한다.
- 부분 성공을 전체 성공으로 표시하지 않는다.
- 종료 시 `queued=0`, `inFlight=0`, `failed=0` 또는 재시도 큐가 명시적으로 남아 있어야 한다.

## 현재 상태

기존 `scripts/sync-daily-cache-from-remote.mjs`는 조회와 저장이 같은 루프에 있으며, `--skip-fundamentals` 옵션으로 일봉과 기초정보 API 실패를 분리할 수 있다. 다음 구현 단계에서 동일 저장 로직을 저장 워커로 이동하고, 기존 동기 실행 경로는 장애 시 fallback으로 유지한다.
