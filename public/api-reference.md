# StockMan 외부 읽기 전용 API 매뉴얼

이 문서는 현재 저장소의 Route Handler 구현을 기준으로 한다. 프로젝트는 Next.js App Router를 사용하며 HTTP 계약은 app/api/**/route.ts에 있다. 공식 표준은 [OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1.html), 프레임워크 동작은 [Next.js 15 Route Handlers 공식 문서](https://nextjs.org/docs/15/app/getting-started/route-handlers-and-middleware)를 따른다.

## 빠른 시작

- 배포 host의 /openapi.json에서 외부 읽기 API 경로와 query parameter를 받는다. 서버 URL은 상대 경로라 host를 하드코딩하지 않는다.
- 이 매뉴얼은 /api-reference.md, AI용 시작 인덱스는 /llms.txt에 배포된다.
- 경로는 현재 /api 아래에 있으며 URL major version prefix는 없다. OpenAPI info.version 1.0.0은 문서 버전이고 /api/v1을 의미하지 않는다. 호환성은 현행 코드·OpenAPI를 기준으로 다시 확인한다.
- HTTPS와 UTF-8 JSON을 사용한다. API base path는 /api다.
- 외부 서버/AI backend에서 호출할 때 브라우저 CORS는 필요하지 않다. 브라우저에서 직접 호출하는 외부 origin은 지원한다고 보장하지 않는다.
- 범용 API key는 발급하지 않는다. 키가 필요한 3개 운영 캐시 API에는 운영자가 전달한 DAILY_CACHE_READ_API_KEY만 사용한다.

예시:

    curl -sS 'https://<배포 호스트>/api/market-news?hours=6&pageSize=20&kind=NEWS'

응답의 x-request-id를 요청 추적에 보존한다. 이 값은 인증 토큰이 아니다.

## 범위와 권한

현재 app/api/**/route.ts에서 165개 route 파일을 확인했다. 전체 경로·메서드·접근 분류·소스 파일은 저장소의 docs/api/route-inventory.json에 기록한다. /openapi.json에는 외부에서 호출할 수 있는 읽기 API만 포함한다.

| 분류 | 외부 AI 사용 | 의미 |
|---|---|---|
| public-read-candidate | 명세에 등재된 GET | 사용자 세션 없이 읽는 API. 빈 결과와 stale 데이터 가능. |
| service-bearer | 운영 키 설정 시 사용 | DAILY_CACHE_READ_API_KEY로 보호되는 캐시 API. |
| read-with-side-effect | 금지 | GET이어도 진단 스냅샷 저장 또는 realtime 승인 키 발급을 수행. |
| signed-link | 금지 | 만료 서명 토큰을 URL에 넣는 HTML 다운로드 경로. |
| user-session-or-user-data | 금지 | 사용자 세션 또는 개인정보에 연결. |
| admin-session, internal-or-operator, internal-secret | 금지 | 관리자·진단·내부 관측 전용. |
| cron-guarded, provider-webhook, write-or-action | 금지 | 예약 실행, callback, 변경/작업 실행 경계. |

HTTP GET만 보고 읽기 전용이라고 판단하지 않는다. 관리자·cron 인증을 외부 AI에 넘겨 실행하지 않는다. 새 route가 추가되면 node scripts/api-surface.mjs write로 인벤토리와 OpenAPI를 갱신하고 접근 등급을 확인한다.

## 인증

### 인증 없는 공개 조회

/openapi.json의 public-read-candidate operation은 별도 인증 없이 요청한다. 호출 전 해당 operation의 description, parameters, x-code-path를 확인한다.

### 공유 캐시 API Bearer

운영자가 별도로 제공한 DAILY_CACHE_READ_API_KEY만 사용한다. 키를 query, URL, 로그, 대화에 넣지 않는다.

    Authorization: Bearer <운영자가 전달한 DAILY_CACHE_READ_API_KEY>

구현에 이미 존재하는 호환 헤더 x-daily-cache-key도 지원하지만 신규 연동은 Authorization Bearer를 사용한다.

/api/public/instrument-fundamentals 및 /api/public/market-intelligence는 서버에 키가 설정된 운영에서 항상 인증을 요구한다. /api/public/daily-candles는 서버에 키가 설정된 경우 인증을 요구한다. 잘못된 인증은 401 {"ok":false,"error":"UNAUTHORIZED"}다.

## HTTP·응답 규칙

- 성공 JSON은 endpoint별 DTO이며 공통 envelope를 강제하지 않는다. ok, items, rows, 배열, null 등을 endpoint 계약대로 처리한다.
- 일반 상태 의미: 400 입력 오류, 401 인증 오류, 429 제한 초과, 502 상위 공급자 오류, 503 서비스·DB·원천 이용 불가. 각 endpoint는 일부 상태만 반환할 수 있다.
- 429의 Retry-After가 있으면 따른다. GET도 병렬 폭주시키지 말고 backoff한다.
- 응답이 제공하는 source, observedAt, fetchedAt, collectedAt, metadata를 보존한다. no-store면 호출자가 임의 캐시를 가정하지 않는다.
- 빈 배열이나 null은 데이터 부재일 수 있다. 오류나 Mock 데이터로 바꾸지 않는다.

## 상세 API 계약

### 미국 RSS/공시 뉴스 — GET /api/market-news

저장된 미국 뉴스와 SEC filing을 조회한다. 시간 기준은 UTC. 첫 응답의 window 범위가 다음 cursor에 고정되므로 페이지 이동 시 필터와 hours를 바꾸지 않는다. 항목은 원문 제목, 조건을 만족한 경우의 한국어 번역 제목, 링크를 반환한다.

| Query | 형식/기본 | 규칙 |
|---|---|---|
| hours | 정수, 1 | 1~24. cursor 요청에선 최초 값 유지. |
| source | 문자열, ALL | ALL, SEC_EDGAR, NASDAQ, NASDAQ_TRADER, STOCKTITAN, GLOBENEWSWIRE. |
| kind | 문자열, ALL | ALL, NEWS, FILING. FILING은 SEC EDGAR 기준. |
| ticker | 문자열, 생략 가능 | 감지 티커 완전 일치. ^[A-Z][A-Z0-9.-]{0,9}$. |
| pageSize | 정수, 50 | 1~100. 권장 필드. |
| limit | 정수 | pageSize 하위 호환 별칭. pageSize가 없을 때 사용. |
| cursor | opaque string | 이전 응답 page.nextCursor. 최대 1024자. 필터 불일치는 CURSOR_SCOPE_MISMATCH. |

성공 응답 예:

    {"ok":true,"schemaVersion":"us-market-rss.v1","scope":{"market":"US","sources":["SEC_EDGAR","NASDAQ","NASDAQ_TRADER","STOCKTITAN","GLOBENEWSWIRE"],"source":"ALL","kind":"NEWS","ticker":null,"window":{"hours":6,"from":"2026-10-28T00:00:00.000Z","to":"2026-10-28T06:00:00.000Z"},"timezone":"UTC"},"items":[{"title":{"original":"Example headline","ko":"예시 제목"},"link":"https://example.com/article"}],"page":{"pageSize":20,"returned":1,"nextCursor":null,"hasMore":false}}

400 오류: INVALID_HOURS, INVALID_SOURCE, INVALID_KIND, INVALID_TICKER, INVALID_PAGE_SIZE, INVALID_CURSOR, CURSOR_SCOPE_MISMATCH. 저장소 오류: 503 MARKET_NEWS_UNAVAILABLE.

### 종목명 — GET /api/stock/lookup

market은 KR(기본) 또는 US, codes는 쉼표 구분 코드 최대 100개. 응답은 {"names":{"코드":"종목명"}}. 결과가 없으면 빈 names object, DB 오류는 503 LOOKUP_UNAVAILABLE이다.

### 차트 — GET /api/stock/chart

code는 종목코드, market은 시장, exchange는 미국 거래소, timeframe은 D/W/M 봉 주기, company는 선택 표시명 힌트다. 상세 제약 및 응답은 OpenAPI parameters와 app/api/stock/chart/route.ts를 기준으로 한다. 응답의 실제 봉 거래일·갱신 시각과 source metadata를 사용한다. 일·주·월봉 기반 분석에서 거래일시, 갱신일시, 종목명·코드 metadata를 함께 보존한다.

### 전체 국내 보통주 데이터 내보내기 — GET /api/domestic-financial-export

전체 국내 보통주 대상이라 응답이 크다. format 생략 시 normalized, format=raw는 원본 payload 중심, format=llm은 재무·일/주/월봉을 technical 아래에 묶는 형식이다. 응답에는 exportedAt, count, items와 다운로드 content-disposition이 포함된다. 페이지네이션은 없으므로 반복 호출하지 말고 필요한 경우에만 요청한다.

### 서비스 상태 — GET /api/health

외부 공개 응답에는 status(ok|degraded), checkedAt, responseTimeMs, requestId만 제공된다. 응답 코드는 상태에 따라 200 또는 503이다. 내부 DB·자격증명 세부정보는 공개하지 않는다.

### 국내 통합 공시 — GET /api/disclosures

hours(1~24) 또는 date(서울 기준 YYYY-MM-DD, 생략 시 오늘 UTC 날짜 문자열)로 시간 범위를 고른다. source는 ALL, RSS, STOCKTITAN, NASDAQ, NASDAQ_TRADER, GLOBENEWSWIRE, SEC_EDGAR, KRX_KIND, NEWSIS, MK, HANKYUNG, ETODAY, DART, SEC 값을 지원한다. page 기본 1, pageSize 또는 limit은 1~500이다. page와 pageSize/limit을 생략하면 전체 결과를 반환할 수 있으므로 큰 응답을 고려한다. publishedAt 내림차순이며 item에는 source, sourceType, title, summary, link, publishedAt, companyNames, tickers, contentStatus 등이 있다. hasMore로 페이지를 판단한다. 오류는 400 또는 503 DISCLOSURES_UNAVAILABLE.

### DART

- GET /api/dart: 현재 피드. 기능 설정·시간 조건으로 503 disabled 응답이 가능하다.
- GET /api/dart/ranking: 제목 점수순 최대 20개. fetchedAt과 items.
- GET /api/dart/contract?rceptNo=<14자리>: 상세 object, 데이터 부재는 null, 잘못된 번호는 400, 공급자 장애는 503.
- GET /api/dart/history?company=<회사명>: 저장된 공시 최대 50개. 빈 결과는 [].

### 저장 일·주·월봉 — GET /api/public/daily-candles

market 필수: KR, US, KOSPI, KOSDAQ, NAS, NYS, AMS. code 단일 값 또는 codes 최대 100개. timeframe은 D/W/M, limit 기본 120·최대 300. 단일 코드 응답의 candles 배열과 metadata.latestCandleDate, dataUpdatedAt, returnedCount를 읽는다. 여러 코드는 각 item에 code와 candles가 있다. source는 OPERATING_DB_CACHE. 인증은 운영 환경의 키 설정에 따른다. 잘못된 query는 400 INVALID_QUERY, 저장소 장애는 503 DAILY_CACHE_UNAVAILABLE.

### 기본정보 스냅샷 — GET /api/public/instrument-fundamentals

Bearer key 필요. market과 쉼표 구분 codes(1~100개)를 지정한다. 성공 DTO는 {ok, source, market, items}; item에는 code, name, price, changeRate, OHLC, volume, tradingValue, marketCap, listedShares, currency, source, observedAt, fetchedAt가 있다. 오류: 401 UNAUTHORIZED, 400 INVALID_QUERY, 503 FUNDAMENTALS_UNAVAILABLE.

### 티커 통합 정보 — GET /api/public/market-intelligence

Bearer key 필요. 선택 query는 ticker, from, to, limit(기본 50, 최대 100). 날짜는 YYYY-MM-DD이며 from 포함·to 미포함. 성공 DTO는 {ok, query, asOf, instrument, fundamental, rssArticles, bullishArticles, secEvents}. asOf를 원천별 fetched_at, observed_at, published_at과 혼동하지 않는다. 오류: 401 UNAUTHORIZED, 400 INVALID_DATE, 503 MARKET_INTELLIGENCE_UNAVAILABLE.

### 미국 소형주 주식 수 — GET /api/public/us-smallcap-shares

IP당 분당 30회, 프로세스 전체 분당 600회 고정 창 제한이 적용되며 운영 인스턴스별 메모리 제한이다. 기본 시총 상한 USD 100,000,000, limit 기본 100·최대 100. query: ticker, market, minMarketCapUsd, maxMarketCapUsd, minShares, maxSharesExclusive, sharesBasis(sec_latest|reviewed), cursor. ticker와 cursor는 함께 쓸 수 없다. reviewed는 1년 이내 VERIFIED 값만 사용하며 유효한 검토가 없으면 주식 수는 null이다. 반환 item은 market, ticker, companyName, marketCapUsd, priceUsd, fundamentalsFetchedAt, sharesOutstanding, facts, reviewedSharesOutstanding, secCompanyFacts를 가진다. SEC fact의 filing date/accession과 reviewed freshness를 종목별로 확인한다. 429면 Retry-After 준수.

주요 400 코드: INVALID_TICKER, INVALID_MARKET, INVALID_LIMIT, INVALID_MARKET_CAP_RANGE, INVALID_SHARES_RANGE, INVALID_SHARES_BASIS, INVALID_CURSOR, CURSOR_NOT_ALLOWED_WITH_TICKER, CURSOR_FILTER_MISMATCH. 저장소 장애는 503 US_SMALLCAP_SHARES_UNAVAILABLE.

## 나머지 공개 GET 경로

다음 GET도 discovery OpenAPI에 포함한다. 각 operation의 query 이름/제약, 응답 유형, 소스 파일은 /openapi.json에서 확인한다. 스캐너별 데이터 최신성·시장 universe·응답 DTO가 다르므로 구조가 같다고 가정하지 않는다.

- DART: /api/dart, /api/dart/ranking, /api/dart/history, /api/dart/contract
- 공시·뉴스: /api/disclosures, /api/market-news, /api/stock/news, /api/stock/us/news, /api/stock/us/news-radar
- 운영 캐시: /api/public/daily-candles, /api/public/instrument-fundamentals, /api/public/market-intelligence, /api/public/us-smallcap-shares
- KIS 수급: /api/kis/investor-flow, /api/kis/intraday-mvp
- 국내 탐지: /api/scan/daytrade, /api/scan/kr-accumulation, /api/scan/kr-bollinger-rebound-ema9-rvol-avg, /api/scan/kr-bollinger-rebound-rvol, /api/scan/kr-ema9-rvol, /api/scan/kr-ema9-touch-rvol
- 미국 탐지: /api/scan/us-accumulation, /api/scan/us-daily-sideways-obv-adl, /api/stock/us/ams-scout, /api/stock/us/dmi, /api/stock/us/macd, /api/stock/us/mfi-oversold
- 종목·시장: /api/stock/chart, /api/stock/kr/top-rising-chart, /api/stock/lookup, /api/stock/us/top-rising, /api/stock/us/top-rising-chart
- 레거시: /api/automation-settings는 Deprecation=true로 표시된다. 새 연동에서 이 endpoint에 의존하지 않는다.

## 외부 AI 호출 절차

1. /openapi.json을 읽고 operation이 GET이며 x-access-classification이 public-read-candidate 또는 service-bearer인지 확인한다.
2. x-code-path와 이 문서에서 query 기본값, enum, 상한, 상태 코드를 확인한다. 생성된 discovery OpenAPI의 응답 schema는 일반 object이므로 모든 route의 response DTO를 완전히 보장한다고 가정하지 않는다.
3. URL encode 후 요청하고 x-request-id, HTTP status, JSON body를 보존한다.
4. 기사·공시 분석은 원문 링크와 실제 반환된 원문 텍스트만 근거로 쓴다. METADATA_ONLY를 본문 근거로 추론하지 않는다.
5. 빈 배열, null, 최신성 metadata, 오류 status를 각각 구분해 전달한다.

## 표준 및 프로젝트 근거

- [OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)
- [Next.js 15 Route Handlers 공식 문서](https://nextjs.org/docs/15/app/getting-started/route-handlers-and-middleware)
- API 권한·검증·응답의 프로젝트 기준은 OpenAPI operation의 x-code-path와 현재 app/api/**/route.ts 코드다.
