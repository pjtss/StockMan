# 일봉 기반 주봉 캐시 갱신

## 목적

국내·해외 보통주 유니버스의 KIS 일봉 캐시를 원천 데이터로 사용해 주봉을 로컬 DB에 UPSERT한다. 주봉을 종목별로 KIS에서 별도 조회하지 않아 API 호출량과 갱신 시간을 줄인다.

## 기준

- 국내: `kr_common_stock_universe` → `kr_instrument_universe_candles`
- 해외: `us_common_stock_universe` → `us_instrument_universe_candles`
- 원천: `timeframe = 'D'`
- 결과: `timeframe = 'W'`, `source = 'LOCAL_DERIVED'`
- 주차: PostgreSQL `DATE_TRUNC('week')` 기준
- OHLCV: 첫 시가, 최고가, 최저가, 마지막 종가, 일봉 거래량 합계

## 모듈

`lib/daily-to-weekly-upsert.ts`의 `upsertWeeklyFromDaily(market)`를 사용한다. 실행 전 일봉을 저장하고 실행 후 주봉을 갱신한다. 보통주 테이블에 존재하며 활성화된 종목만 결과에 포함한다.

## 검증

주봉의 `period_end_date`는 해당 주에 포함된 가장 최근 거래일이며, `fetched_at`은 로컬 집계 시각이다. 비보통주 또는 비활성 종목의 주봉은 정리 대상이다.
