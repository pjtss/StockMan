# KIS Open API → PostgreSQL 성능 최적화 설계

## 1. 목표와 원칙

- KIS 호출량·응답시간·실패율을 낮추면서 최신 데이터 완전성을 유지한다.
- DB 조회는 스캐너가 필요한 최신 봉과 최소 컬럼만 읽는다.
- API 호출, 변환, 적재, 조회를 분리해 한 단계의 지연이 전체 파이프라인을 막지 않게 한다.
- 토큰 발급은 기존 단일 모듈·Promise·PostgreSQL advisory lock 정책을 유지한다.
- 일반 이동평균은 프로젝트 규칙에 따라 EMA로 계산하며, DB에 지표 캐시를 만들지 않는 현재 정책을 존중한다.
- 운영 데이터는 Mock으로 대체하지 않는다.

## 2. 현재 예상 병목

### 2.1 KIS 호출

1. 종목 수 × 주기 × 일·주·월·분봉 요청 수가 선형으로 증가한다.
2. 요청별 순차 처리 시 네트워크 대기 시간이 누적된다.
3. 토큰 만료 시 여러 요청이 동시에 재발급 경로에 진입할 수 있다.
4. KIS 응답의 비JSON·HTTP 오류를 재시도하면 실패 요청이 폭증할 수 있다.
5. 같은 종목·같은 주기의 중복 요청이 스캐너와 화면에서 동시에 발생할 수 있다.

### 2.2 변환·적재

1. 행 단위 `INSERT`는 왕복과 파싱 비용이 크다.
2. `ON CONFLICT` 대상 인덱스가 과도하면 쓰기 증폭이 발생한다.
3. 매 실행마다 전체 유니버스를 삭제 후 재삽입하면 잠금과 WAL이 증가한다.
4. 문자열 날짜를 조건절에서 변환하면 인덱스를 못 타는 구간이 생긴다.

### 2.3 DB 조회

1. 최신 봉을 전체 테이블 정렬 후 `LIMIT`하는 쿼리는 데이터가 커질수록 느려진다.
2. 보통주·활성·시장 조건이 인덱스 선두 컬럼과 맞지 않으면 필터 후 스캔이 발생한다.
3. 스캐너가 종목별 최근 120개 봉을 반복 조회하면 같은 테이블을 여러 번 읽는다.
4. `SELECT *`, JSON 원문, 불필요한 과거 봉은 네트워크와 메모리를 낭비한다.

## 3. 목표 아키텍처

```text
KIS 요청 계획
  → 제한된 동시성 워커
  → 응답 정규화·검증
  → bounded batch queue
  → PostgreSQL staging/upsert
  → 최신 봉 인덱스 기반 조회
  → 스캐너 계산·화면 응답
```

각 단계는 `requestId`, market, code, timeframe, fetchedAt, rowCount, status를 공통 메타데이터로 남긴다. 비밀번호·appkey·appsecret·토큰은 절대 로그에 기록하지 않는다.

## 4. KIS 호출 최적화

### 4.1 요청 중복 제거

- 프로세스 내 `inflight` Map 키: `market:code:timeframe:date`.
- 같은 키가 진행 중이면 기존 Promise를 공유한다.
- 성공 응답은 짧은 TTL 메모리 캐시를 사용하고, 장기 데이터는 기존 DB를 사용한다.
- 화면 요청과 cron 요청의 중복은 동일 서비스 함수로 통합한다.

### 4.2 동시성·throttle

- 시장별 독립 큐를 둔다: KR, NAS, NYS, AMS.
- 초기 동시성은 시장당 4~8개로 두고, 429·5xx 비율에 따라 지수 백오프로 낮춘다.
- 요청 timeout은 짧은 연결 timeout과 전체 timeout을 분리한다.
- 401/AUTH만 토큰 무효화·재발급 대상으로 삼고, 데이터 오류·429·5xx는 토큰을 삭제하지 않는다.
- 재시도는 idempotent GET에 한해 최대 2회, `Retry-After`를 우선한다.

### 4.3 요청 계획

- 최신 일봉이 필요한 스캐너는 우선 최신 거래일 존재 여부를 확인한다.
- 이미 최신인 종목은 KIS 호출을 건너뛴다.
- 주봉·월봉은 일봉에서 재집계 가능한 경우 DB 집계를 사용하고, 공식 데이터가 필요한 경우에만 별도 호출한다.
- 분봉은 요청 종목·간격·개수만 조회하고 전체 유니버스 자동 갱신과 분리한다.

## 5. 적재 최적화

### 5.1 배치 적재

- 정규화된 행을 100~500행 단위로 묶는다.
- `INSERT ... VALUES ... ON CONFLICT (...) DO UPDATE`를 사용한다.
- 대량 초기 적재는 임시 staging 테이블에 `COPY`한 뒤 검증된 행만 merge한다.
- 각 배치마다 성공·실패·rowCount를 기록하고, 한 배치 실패가 전체 데이터 삭제로 이어지지 않게 한다.

### 5.2 충돌 업데이트 최소화

- 가격·거래량·갱신시각이 실제로 변경된 경우만 UPDATE한다.
- 불변 컬럼은 `DO UPDATE`에서 제외한다.
- 유니크 키는 `(market, code, candle_date, candle_time)`로 고정한다.
- 원문 payload는 운영 조회 테이블에 저장하지 않고 별도 로그/보존 정책으로 분리한다.

### 5.3 원자성

- 종목별 또는 제한된 배치 단위 트랜잭션을 사용한다.
- 전체 갱신 전 사전 검증을 수행한다: 응답 정상, 최신 거래일, rowCount > 0, 중복 없음.
- 검증 실패 시 기존 캐시는 유지하고 retry queue에 넣는다.

## 6. 인덱스 설계

### 6.1 일·주·월봉

각 캔들 테이블에 다음 패턴을 적용한다.

```sql
CREATE UNIQUE INDEX ..._pk
  ON ... (market, code, candle_date, candle_time);

CREATE INDEX ..._latest_idx
  ON ... (market, code, candle_date DESC, candle_time DESC)
  INCLUDE (open, high, low, close, volume, fetched_at);
```

실제 테이블의 날짜 타입이 `date`인지 `text`인지 먼저 확인하고, text라면 운영 마이그레이션으로 date 타입 전환을 검토한다. 불가피하게 text를 유지할 때는 저장 포맷을 `YYYYMMDD`로 고정하고 조건절에서 컬럼을 캐스팅하지 않는다.

### 6.2 유니버스

```sql
CREATE INDEX ..._scanner_idx
  ON instrument_universe (market, enabled, instrument_type, code)
  WHERE enabled = true;
```

활성 보통주가 대부분인 테이블에서는 partial index를 우선 검토한다. 기존 인덱스와 중복 여부를 `pg_indexes`와 `EXPLAIN (ANALYZE, BUFFERS)`로 확인한 뒤 추가한다.

## 7. 조회 최적화

- 최신 봉은 `(market, code, candle_date DESC)` 인덱스를 타는 correlated `LIMIT` 또는 `DISTINCT ON`으로 조회한다.
- 스캐너는 필요한 9/20/60 EMA 계산에 필요한 최소 봉 수만 가져온다.
- 한 요청에서 종목별 반복 쿼리를 실행하지 않고, 대상 code 배열을 받아 set-based query로 처리한다.
- 시장·활성·보통주 조건을 DB에서 먼저 적용한다.
- 페이지네이션은 offset 대신 `(candle_date, code)` cursor를 사용한다.
- 모든 주요 쿼리는 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 기준으로 회귀 측정한다.

## 8. 운영 관측

### 기록할 지표

- KIS: 요청 수, p50/p95/p99 응답시간, HTTP·KIS 코드별 실패율, 재시도 횟수, throttle 대기시간
- 파이프라인: 큐 길이, 워커 수, 처리량, 배치 크기, 적재 실패율
- DB: 쿼리 p95, shared/local block read, hit ratio, dead tuple, WAL, lock wait
- 데이터: 종목별 최신 거래일, 누락 봉 수, 마지막 성공 갱신시각

### 알림 기준

- 동일 시장의 5분 실패율 20% 초과
- KIS 429 또는 AUTH 오류 급증
- 적재 큐 대기 2분 초과
- 최신 거래일 지연이 운영 기준을 초과
- 주요 스캐너 쿼리 p95가 기준치의 2배 초과

Discord 디버깅 채널에는 요약·requestId·시장·구간·오류 코드만 보내고, 자격증명과 원문 응답 전체는 보내지 않는다.

## 9. 단계별 실행 계획

1. baseline 수집: KIS 호출, 적재, 주요 스캐너 쿼리의 p50/p95 측정
2. 중복 요청 제거와 시장별 bounded concurrency 적용
3. 배치 upsert 및 retry queue 정비
4. 최신 조회 covering index 검증·추가
5. 전체 유니버스 반복 조회를 set-based query로 전환
6. staging/COPY는 초기 대량 적재에 한해 적용
7. 부하 테스트와 운영 API 직접 검증

## 10. 완료 기준

- 동일 키 중복 KIS 호출이 제거된다.
- 최신 데이터 적재가 부분 실패 시 기존 캐시를 보존한다.
- 주요 최신봉·스캐너 쿼리가 인덱스를 사용한다.
- KIS 오류가 토큰 삭제 폭주나 재시도 폭주로 이어지지 않는다.
- baseline 대비 KIS 호출량·DB round trip·조회 p95를 수치로 비교할 수 있다.
- 테스트·타입체크·빌드와 로컬 실행이 모두 통과한 후에만 배포한다.

## 11. 2026-09-10 측정 및 반영 결과

`npm run measure:screener-db`를 로컬 `.env.local`의 DB에 실행했다. 측정 시점의 표본은 국내 활성 보통주 2,363개·일봉 265,448행, 해외 활성 보통주 5,316개·일봉 588,838행이다.

| 조회 | 실행시간 | 비고 |
|---|---:|---|
| KR 기준일 시장별 최신일 | 69.617ms | EXPLAIN ANALYZE 기준 |
| KR 기준일 종목별 최신일 | 74.310ms | EXPLAIN ANALYZE 기준 |
| US 기준일 시장별 최신일 | 180.451ms | EXPLAIN ANALYZE 기준 |
| US 기준일 종목별 최신일 | 242.706ms | EXPLAIN ANALYZE 기준 |
| KR 최신 요약 테이블 | 1.871ms | 대형 봉 테이블 집계 회피 |
| US 최신 요약 테이블 | 3.783ms | 대형 봉 테이블 집계 회피 |

이번 개선에서는 `lib/kr-daily-price-cache.ts`의 bulk 조회를 종목별 `LATERAL` 조회와 `LIMIT`으로 변경했다. 기존의 종목 조건 OR + 전체 결과 정렬 방식보다 `(market, code, timeframe, candle_date)` 복합 인덱스를 직접 활용하며, 종목당 필요한 최근 봉만 반환한다. 해외 bulk 조회는 이미 동일한 `VALUES` 조인·윈도우 제한 패턴을 사용한다.

검증 결과: 전체 Vitest 482개 통과, TypeScript 통과. 위 수치는 단일 실행의 관측값이므로 개선율을 확정할 때는 동일 DB 상태에서 warm/cold 각각 5회 이상 p50/p95로 재측정한다.

## 12. 2026-09-11 추가 측정 및 파이프라인 개선

동일한 로컬 DB에서 `npm run measure:screener-db`를 다시 실행했다. 최신 측정값은 다음과 같다.

| 조회 | 실행시간 | shared read blocks |
|---|---:|---:|
| KR 기준일 시장별 최신일 | 384.975ms | 31,855 |
| KR 기준일 종목별 최신일 | 116.372ms | 32,060 |
| US 기준일 시장별 최신일 | 152.128ms | 28,310 |
| US 기준일 종목별 최신일 | 197.120ms | 28,336 |
| KR 최신 요약 테이블 | 1.273ms | 61 |
| US 최신 요약 테이블 | 3.597ms | 132 |

기준일(`asOf`) 집계에는 이미 `V123__screener_market_latest_indexes.sql`의 부분 커버링 인덱스가 적용되어 있어 동일 목적의 중복 인덱스는 추가하지 않았다. 기준일별 요약 테이블은 과거 기준일 정확성을 보존하기 위한 저장 정책과 함께 별도 검토가 필요하다.

추가로 RSS 파이프라인의 기사별 `INSERT ... ON CONFLICT`를 피드별 bulk upsert로 변경해 적재 DB 왕복을 기사 수에서 피드 수 수준으로 줄였고, 제목 번역은 입력 순서를 유지하는 bounded concurrency(최대 3개)로 변경해 외부 API 대기시간의 직렬 누적을 줄였다. 전체 테스트 147개 파일·484개 테스트와 타입검사·프로덕션 빌드를 통과했다.

`syncDailyActivityStatus()`도 원본 캔들 테이블의 시장별·종목별 `MAX(candle_date)` 이중 집계를 제거하고, 갱신 작업이 유지하는 최신 일봉 요약 테이블을 직접 사용하도록 변경했다. 따라서 활성 상태 갱신은 과거 캔들 전체를 다시 읽지 않으며, 최신 양수 거래량 봉이 없는 종목을 기존과 동일하게 비활성으로 판정한다.

국내와 해외 활성 상태 갱신은 서로 독립된 테이블을 대상으로 하므로 `Promise.all`로 병렬 실행하도록 변경했다. 두 시장의 처리 시간이 합산되지 않으며, 각 쿼리의 판정·트랜잭션 범위는 기존과 동일하다.
