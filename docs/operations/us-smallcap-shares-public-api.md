# 미국 소형 보통주 발행주식수 공개 API

## 목적과 데이터 경계

인증 없이 미국 활성 보통주 중 현재 로컬 시총 스냅샷이 USD 100,000,000 이하인 종목의 SEC 발행주식수 사실을 조회한다. SEC를 매 요청마다 호출하지 않고 일일 자동화가 저장한 `sec_smallcap_common_stock_shares` 및 검토 테이블을 읽는다.

- 범위: NASDAQ/NYSE/NYSE American의 `COMMON_STOCK`, `enabled=true`, `daily_active=true`; ETF·워런트·파생·DR·레버리지·인버스 제외. 유니버스 분류 플래그가 잘못된 경우에 대비해 공식 마스터의 한국어/영어 종목명에 ADR·ADS·American Depositary·Depositary Receipt/Shares가 명시된 항목도 공개 결과에서 보수적으로 제외한다.
- 현재 StockMan USD 시총 스냅샷을 기준으로 1억 달러 이하를 조회하며, 경계값은 포함한다.
- 선택 필터: `minMarketCapUsd`(포함), `maxMarketCapUsd`(포함), `minShares`(포함), `maxSharesExclusive`(미포함). 시총 필터의 최대 허용값은 기존 API 범위인 USD 100,000,000이며, 지정하지 않은 시총 상한은 USD 100,000,000이다.
- 발행주수 조건은 SEC 원천 최신 fact가 아니라 `reviewedSharesOutstanding`의 `VERIFIED` 값 중 기준일이 최근 1년 이내인 수량에 적용한다. 검토되지 않았거나 오래된 수량은 발행주수 필터를 적용하는 요청에서 매칭되지 않는다. 따라서 100만 주 미만 조회는 `maxSharesExclusive=1000000`으로 지정한다.
- `sharesOutstanding`와 `facts.dei`/`facts.usGaap`은 SEC Company Facts의 원천 값과 접수 메타데이터다. 양은 BIGINT 정밀도를 보존하는 문자열이며 `asOfDate`는 fact 기준일, `filedDate`는 SEC 접수일이다. 현행 발행주식수나 유통주식수를 보장하지 않는다.
- `reviewedSharesOutstanding`는 사람이 검토한 별도 값이다. `VERIFIED`이고 기준일이 최근 1년 이내일 때만 숫자를 제공한다. 기준일이 오래되거나 `REVIEW_REQUIRED`/`UNAVAILABLE`이면 수량은 `null`; 내부 검토 메모는 공개하지 않는다. 이 검증값은 SEC 원천 facts를 덮어쓰지 않는다.
- 저장된 SEC facts가 없는 종목은 목록에서 제외한다.

## 호출

```text
GET /api/public/us-smallcap-shares?ticker=ABCD
GET /api/public/us-smallcap-shares?ticker=ABCD&market=NAS
GET /api/public/us-smallcap-shares?market=NAS&limit=100
GET /api/public/us-smallcap-shares?market=NAS&limit=100&cursor=<nextCursor>
GET /api/public/us-smallcap-shares?maxSharesExclusive=1000000
GET /api/public/us-smallcap-shares?minMarketCapUsd=10000000&maxMarketCapUsd=50000000&minShares=100000&maxSharesExclusive=1000000
```

API key와 로그인이 필요 없다. `market`은 NAS/NASDAQ/NYS/NYSE/AMS/AMEX, `limit`은 1~100(기본 100)이다. 시총 구간은 양 끝 포함이고, 발행주수 하한은 포함·상한은 미포함이다. 주식수 범위는 0 이상의 정수로, 시총 범위는 0 초과 USD 값으로 지정한다. 시총 하한이 상한보다 크거나, 발행주수 하한이 exclusive 상한보다 크거나 같으면 HTTP 400이다. 목록은 시총 오름차순 keyset pagination을 사용하며 다음 페이지는 `pagination.nextCursor`를 그대로 전달한다. 커서는 시장·시총·발행주수 필터와 결합되어 있어 필터를 바꾸어 다음 페이지를 요청하면 `CURSOR_FILTER_MISMATCH`를 반환한다. ticker와 cursor는 함께 쓸 수 없다. 응답은 `Cache-Control: no-store`이고 기존 SEC 공개 read 제한(클라이언트 IP당 분당 30회, 프로세스 전체 분당 600회)을 공유한다.

## 응답 형태

응답 최상위에는 `ok`, `source`, `checkedAt`, `criteria`, `filters`, `items`, `pagination`이 있다. 각 item에는 거래소·ticker·회사명, 현재 시총/가격/기초자료 갱신시각, SEC 원천 share facts, 검토 수량 상태, CIK 및 SEC Company Facts 주소/갱신시각이 들어간다. DEI와 US-GAAP 모두 있으면 최신 접수일 값을 최상위 `sharesOutstanding`으로 선택하며 접수일 동률이면 DEI를 선택한다.

오류는 잘못된 입력 `400`(`INVALID_MARKET_CAP_RANGE`, `INVALID_SHARES_RANGE`, `CURSOR_FILTER_MISMATCH` 등), rate limit `429`(Retry-After 제공), 내부 DB 조회 실패 `503 US_SMALLCAP_SHARES_UNAVAILABLE`이다. 내부 DB 연결 정보는 응답하지 않는다.

## 자동화·배포 선행조건

수집 자동화는 `sec-smallcap-share-facts` feature module과 `/api/cron/sec-smallcap-share-facts`이며 OCI cron에서 일 1회 수행된다. SEC_USER_AGENT가 설정되어야 한다. 배포 브랜치에 V144~V148 및 자동화 코드가 포함되어야 하고, 운영에서 사용할 때에는 Flyway 적용과 최초 동기화를 별도로 확인한다.
