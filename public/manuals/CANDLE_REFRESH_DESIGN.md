# 국내·해외 일·주·월봉 캐시 갱신 설계

## 목적

- 국내·해외 보통주이며 `ACTIVE`인 종목만 갱신 대상이다.
- 일봉은 KIS Open API 원본을 저장한다.
- 주봉·월봉은 저장된 일봉에서 결정적으로 재구성하는 것을 기본 경로로 한다.
- 실패 종목은 종목·시장·타임프레임 단위 retry queue로 관리한다.
- 작업 결과에는 시장·타임프레임별 처리 수, 성공·실패 수, 저장 봉 수, 소요 시간을 남긴다.

## 처리 흐름

1. 유니버스에서 보통주·`ACTIVE` 종목을 조회한다.
2. 종목별 최신 봉과 raw payload 누락 여부를 확인해 D/W/M 대상 및 retry 대상을 결정한다.
3. KIS 요청은 공통 인증·TPS·재시도 모듈을 통과한다.
4. 응답 수신과 DB upsert는 작업 큐의 독립 단계로 처리한다.
5. 일봉 성공률이 운영 게이트를 통과하면 주봉·월봉을 일봉에서 upsert한다.
6. Bollinger/Golden Cross 등 후속 캐시는 성공한 데이터가 있을 때만 갱신한다.

## 관측 기준

각 작업은 다음 키로 분리해 기록한다.

`{market}:{instrument_code}:{timeframe}`

필수 지표:

- 대상 종목 수
- 성공·실패 종목 수
- 저장된 봉 수
- 시작·종료 시각과 소요 시간
- 마지막 처리 종목 및 ETA
- 실패 사유와 재시도 횟수

전체 시장의 `MAX(fetched_at)`만으로 최신화를 판정하지 않는다. 종목별 최신 상태를 기준으로 하며, 한 종목의 성공이 전체 성공으로 승격되지 않도록 한다.

## 현재 구현과 검증 범위

- 국내 작업: `lib/kr-daily-cache-job.ts`
- 해외 작업: `lib/us-daily-price-cache-warm.ts`
- 국내·해외 일봉→주봉 파생: `lib/daily-to-weekly-upsert.ts`
- 갱신 시간 측정: `lib/candle-refresh-observability.ts`
- 관련 테스트: `lib/candle-refresh-observability.test.ts`

### 2026-09-21 일봉 stale 판정 최적화

일봉 freshness 판정은 원본 캔들 테이블을 다시 읽지 않고 `kr_latest_daily_candles`·`us_latest_daily_candles` 요약 캐시를 사용한다. 종목별 `fetched_at`과 요약 캐시의 시장 최신 `candle_date`만 비교하므로, 대형 원본 테이블의 종목별 LATERAL 조회와 전체 `MAX(candle_date)` 집계를 제거한다. 주봉·월봉은 기존 정책대로 해당 timeframe 원본에서 최신 봉을 판정한다.

이 변경은 KIS 호출 수·대상 선정 규칙·freshness 주기를 바꾸지 않는다. 요약 캐시가 없는 종목은 `LEFT JOIN` 결과가 NULL이 되어 정상적으로 갱신 대상에 포함된다. 요약 캐시가 오래된 경우에도 원본을 직접 재집계하지 않고 보수적으로 갱신한다.

운영 검증 시 `durationMs`, `dbWriteDurationMs`, 대상 수를 함께 비교하고, `EXPLAIN (ANALYZE, BUFFERS)`에서 일봉 stale 판정이 `*_latest_daily_candles`를 사용하는지 확인한다. 요약 캐시 누락·시장 최신일 불일치가 발견되면 원본 적재를 중단하지 않고 기존 실패·재시도 정책으로 처리한다.

현재 갱신 결과 객체에는 시장별 전체 작업 시간과 성공·실패·저장 건수가 포함된다. 타임프레임별 영속 운영 리포트는 다음 단계에서 `candle_refresh_runs` 테이블로 분리할 수 있으며, 기존 캔들 데이터와 분리해 재수집 이력과 운영 지표를 보존한다.

## 실패·재시도 원칙

- 빈 응답, HTTP 오류, 인증 오류, 저장 오류를 실패로 기록한다.
- retry 성공은 해당 종목·해당 타임프레임의 실제 성공 응답으로만 처리한다.
- 다른 종목의 성공이나 전역 retry row 존재만으로 성공 처리하지 않는다.
- 부분 실패가 있어도 성공 종목의 후속 파생 캐시는 계속 처리한다.

## 테스트 계획

- 성공 응답의 저장 봉 수·소요 시간 집계
- 예외 발생 시 작업 전체가 중단되지 않고 실패 지표 생성
- 빈 응답과 retry 대상 분리
- 종목별 최신일 기준 ACTIVE/INACTIVE 경계
- 국내·해외 및 D/W/M 타임프레임 독립 집계
