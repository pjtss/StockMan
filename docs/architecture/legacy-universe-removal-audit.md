# 레거시 유니버스·봉 테이블 제거 감사

상태: 전환 진행 중

## 신규 기준

| 영역 | 신규 기준 테이블 | 현재 사용 경로 |
|---|---|---|
| 국내 종목 | `kr_instrument_universe` | 국내 캐시·볼린저 유니버스 |
| 해외 종목 | `us_instrument_universe` | 해외 캐시·일봉 지표·볼린저 유니버스 |
| 국내 일·주·월봉 | `kr_instrument_universe_candles` | `loadCachedKrDailyCandles*` |
| 해외 일·주·월봉 | `us_instrument_universe_candles` | `loadCachedUsDailyCandles*` |

## 레거시 테이블

- `kr_instruments`
- `us_instruments`
- `kr_daily_price_candles`
- `us_daily_price_candles`

## 제거 전 필수 게이트

1. `rg` 감사에서 탐지·캐시·관리자 테스트가 레거시 봉 테이블을 읽지 않아야 한다.
2. 신규 캐시 테이블에서 D/W/M별 최근 `fetched_at`, 종목 수, 실패 이력을 운영 API로 확인한다.
3. 레거시 ID를 참조하는 공매도·유통주·거래대금 등 별도 도메인의 FK를 신규 유니버스 ID로 이관하거나, 해당 도메인 테이블을 함께 폐기할지 결정한다.
4. PostgreSQL 카탈로그에서 레거시 테이블을 참조하는 FK·뷰·트리거가 0건임을 확인한다.
5. 운영 배포 후 최소 한 번의 캐시·탐지·Discord 실행 성공을 확인한 뒤에만 `DROP TABLE` 마이그레이션을 작성한다.

V70에서 위 레거시 테이블과 소비 테이블을 함께 제거한다. 신규 탐지·캐시 경로는 새 유니버스와 새 봉 테이블만 사용한다.

## V70 삭제 목록

V70은 레거시 국내·해외 유니버스/봉/국내 시세 캐시, 해외 거래대금·거래강도·VWAP·1분 OBV, 유통주·상품분류, 뉴스 레이더 이벤트, 공매도·대차, 기존 순위 캐시와 관련 워치리스트를 삭제한다.

삭제 후에도 계산 전용 모듈은 유지한다. 계산 모듈은 DB 테이블을 직접 참조하지 않으며 신규 캐시 입력을 받을 수 있다.
