# 미국 거래소 거래·상장 상태 자동 수집

## 범위와 데이터 의미

미국 종목은 KIS 해외주식 상품 마스터만으로 거래정지·상장폐지를 판정할 수 없다. KIS 해외 마스터는 상품 분류에 사용하고, 거래 상태는 거래소가 제공하는 자료를 별도로 보관한다.

- Nasdaq Trader 거래정지 RSS에서 종목, 거래소, 정지 사유코드, 정지/재개 시각을 읽는다. `POST /api/cron/us-exchange-status`가 매시 확인하며 원문 payload와 관측시각을 `us_exchange_trading_status`에 저장한다.
- RSS 사유코드 D는 Nasdaq Trader 정의의 `Security deletion from NASDAQ/CQS`에 따라 `DELISTING_ACTION`으로 보존한다. 이는 거래소 조치 신호이며 법적 효력 완료일이라고 추정하지 않는다.
- Nasdaq Trader `nasdaqlisted.txt`의 금융상태 D(요건 미달), E(공시 지연), Q(파산), K(세 항목 복합)는 `LISTING_ISSUE` 경고로 저장한다. 경고는 상장폐지나 현재 거래정지와 동일하지 않다. PRFX의 D 상태도 이 범주다.
- Nasdaq Trader `otherlisted.txt`는 NYSE·NYSE American 등 Nasdaq 외부 상장 목록을 제공한다. 목록에 있으면 `LISTED` 관측으로 저장한다. 여기서 종목이 사라졌다는 이유만으로 상장폐지로 판정하지 않는다.
- SEC·거래소의 상장폐지 효력 통지 등 정식 조치가 필요하다. 현재 공개 자동화 피드만으로 모든 거래소의 확정 상장폐지 일정을 완전하게 제공하는 단일 OpenAPI는 확인되지 않았다. 따라서 소스에 없는 종목을 `DELISTED`로 자동 기록하지 않는다.

공식 참고자료: [Nasdaq Trade Halt RSS](https://www.nasdaqtrader.com/Trader.aspx?id=TradeHaltRSS), [Nasdaq Symbol Directory](https://www.nasdaqtrader.com/Trader.aspx?id=SymbolDirDefs), [NYSE Trading Halts](https://www.nyse.com/trade/trading-halts), [NYSE Delistings](https://www.nyse.com/regulation/delistings).

## 유니버스 상품 재분류

상태 갱신 때 저장된 해외 상품명도 다시 검사해 보통주/특수상품 파티션을 조정한다. 상품 설명의 `PRF`와 `TRUST CERTIFICATE`를 인식하여 우선주·신탁증서를 보통주에서 제외한다. 예탁증서 표기가 있으면 공통 종목 유형 플래그에도 반영한다. 분할 이동은 트랜잭션으로 수행하고 기존 종목 이력·봉 데이터는 유지한다.

이번 운영 누락 5개에 대한 판정:

- `PRFX`: Nasdaq의 상장요건 미달(D) 경고. 회사 공시에 따르면 심리 요청으로 거래는 계속되며, 거래소 정지/상장폐지 확정과 구분한다.
- `AKO/B`, `GGB`, `ITUB`: 거래소 목록에 존재한다. 현 저장 상품 설명은 ADR 및/또는 우선주를 나타내므로 보통주 파티션에서 제외한다. 거래정지/상장폐지라고 확인된 것은 아니다.
- `PYT`: SEC 공시상 NYSE 상장 PPlus trust certificate다. 보통주가 아니며 거래소 목록에서 확인되는 증서 상품이다.

거래소 halt feed에 활성 정지가 있으면 `status=HALTED`, 재개 시각이 도래한 항목이면 `RESUMED`, 이전 HALTED row가 유효한 최신 피드에서 사라지면 `CLEARED`로 기록한다. 구조가 올바른 빈 RSS는 현재 halt 없음으로 처리하며, RSS 형식 오류·HTTP 응답 실패·종목 디렉터리 빈/비정상 응답이면 저장 상태를 지우지 않고 cron을 실패 처리한다. `CLEARED`는 이 관측에서 활성 halt 항목이 없다는 뜻이며 종목의 상장/거래 가능성을 보증하지 않는다.

## 재발 감지와 운영 확인

- OCI hourly cron은 거래소 RSS/목록 파싱 실패 시 503 및 실패 summary를 남긴다.
- DB에서 확인할 때 `source`, `status`, `status_type`, `reason_code`, `source_updated_at`, `observed_at`, `source_payload`를 함께 본다. freshness 기준은 `observed_at`이며 최근 관측이 없으면 상태를 최신으로 간주하지 않는다.
- 상장폐지는 공식 effective date가 확인되기 전까지 추론하지 않는다. NYSE pending delisting 목록은 사람/운영 검토 대상이며 본 자동 동기화가 아직 수집하지 않는다.
- 보통주 분류 규칙이 추가되면 `instrument-universe-import.test.ts`와 파티션 reconcile을 확인하고 `npm run deploy:verify`를 통과시킨다.
