# SEC EDGAR 공식 API 참고 문서

이 문서는 StockMan에서 SEC EDGAR 연동을 개발할 때 기준으로 삼는 공식 문서와 운영 규칙을 정리한 내부 참고 문서다. SEC 공식 문서의 내용이 코드나 이 문서보다 우선한다.

## 공식 문서

- [EDGAR Application Programming Interfaces](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [Accessing EDGAR Data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data)
- [SEC Webmaster FAQ - Programmatic access](https://www.sec.gov/about/webmaster-frequently-asked-questions)
- [SEC Developer Resources](https://www.sec.gov/about/developer-resources)
- [data.sec.gov](https://data.sec.gov/)

## 공개 데이터 API

`data.sec.gov`의 공개 Submissions/XBRL 데이터 API는 API key나 인증 없이 접근할 수 있다. 단, 자동화 요청은 SEC의 접근 정책과 식별 가능한 User-Agent를 준수해야 한다.

### 회사 제출 이력

```text
GET https://data.sec.gov/submissions/CIK##########.json
```

- CIK는 10자리 zero-padding 형식이다.
- 회사명, 이전 회사명, 거래소, 티커, 최근 제출 이력이 포함된다.
- 기본 응답에는 최소 1년 또는 최근 1,000건의 제출 이력이 포함되며, 오래된 이력은 추가 JSON 파일로 분리될 수 있다.

### 회사 전체 XBRL 사실

```text
GET https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
```

### 단일 XBRL 개념

```text
GET https://data.sec.gov/api/xbrl/companyconcept/CIK##########/{taxonomy}/{tag}.json
```

예: `us-gaap/AccountsPayableCurrent`

### 기간별 집계 프레임

```text
GET https://data.sec.gov/api/xbrl/frames/{taxonomy}/{tag}/{unit}/{frame}.json
```

프레임 예시는 `CY2019Q1I`이며, 회사별 회계연도와 실제 기간이 다를 수 있으므로 프레임 데이터의 기간 의미를 그대로 동일시하지 않는다.

## 티커·CIK 매핑

- [company_tickers.json](https://www.sec.gov/files/company_tickers.json)
- [company_tickers_exchange.json](https://www.sec.gov/files/company_tickers_exchange.json)
- [company_tickers_mf.json](https://www.sec.gov/files/company_tickers_mf.json)

SEC는 이 매핑 파일의 정확성이나 범위를 보증하지 않으므로 StockMan 통합 티커 테이블에 반영할 때 마지막 갱신 시각과 원본을 기록한다.

## 제출 원문·접근 경로

제출의 `accession number`는 고유 식별자다. 원문 경로는 일반적으로 다음 형태를 사용한다.

```text
https://www.sec.gov/Archives/edgar/data/{CIK}/{accession_without_dashes}/{document}
```

제출 인덱스(`*-index.htm`)는 문서 목록일 수 있으므로, 실제 분석 대상 문서와 동일시하지 않는다. StockMan에서 원문 분석 시 인덱스에서 주 문서를 해석한 뒤 원문 파서로 넘긴다.

## 요청 정책 및 운영 제한

모든 자동 요청에는 서비스 식별이 가능한 User-Agent를 포함한다.

```text
User-Agent: StockMan/0.1.0 admin@example.com
Accept-Encoding: gzip, deflate
```

- SEC 공식 FAQ에 안내된 현재 최대 접근률은 초당 10 요청이다.
- 동시 요청은 무제한으로 보내지 않고, 공용 rate limiter와 재시도 backoff를 사용한다.
- `429`, `403`, 연결 오류는 원본 HTTP 상태·응답 일부·재시도 횟수와 함께 기록한다.
- `data.sec.gov`는 CORS를 제공하지 않으므로 브라우저에서 직접 호출하지 않고 Next.js 서버/API 또는 cron에서 호출한다.
- 대량 데이터는 실시간 API를 반복 호출하지 않고 SEC bulk ZIP을 검토한다. bulk 파일은 대체로 매일 밤 갱신된다.

## 실시간성

- Submissions API는 제출 전파 후 일반적으로 1초 미만 지연으로 갱신된다.
- XBRL API는 일반적으로 1분 미만 지연이지만 피크 시간에는 더 늦어질 수 있다.
- SEC 원문 문서는 EDGAR 타임스탬프 이후에도 실제 웹 공개까지 1~3분 지연될 수 있다.
- 실시간에 가까운 신규 제출 탐지는 SEC Latest Filings/RSS를 우선 검토하고, 세부 내용은 Submissions·원문 API로 보강한다.

## StockMan 적용 원칙

### 현재 파이프라인 경계

- SEC EDGAR **RSS**는 `market-rss` 통합 파이프라인에서만 수집한다. `market_rss_articles`에 `source=SEC_EDGAR`로 저장되고 공통 분류·등급·번역·RSS Discord 전송을 따른다.
- SEC EDGAR **Submissions/XBRL**은 `sec-realtime`의 `/api/cron/sec-edgar`에서 CIK 목록을 기준으로 수집한다. 결과는 `sec_companies`, `sec_submissions`, `sec_filing_events`, `sec_xbrl_snapshots`에 저장한다.
- `sync-filings`는 DART 전용이며 SEC RSS 자동화를 호출하지 않는다. 따라서 같은 SEC RSS 공시를 두 자동화가 각각 Discord로 보내지 않도록 한다.
- 관리자 설정은 `/admin/modules/market-rss`와 `/admin/modules/sec-realtime`, 원문·분류 테스트는 `/admin/api-tests`, 저장 결과는 `/admin/stocktitan-rss`, 실행 상태는 `/admin/observability`에서 확인한다.

1. SEC 호출은 `lib/`의 단일 클라이언트 모듈로 통합한다.
2. CIK 정규화, User-Agent 생성, rate limit, timeout, retry를 공통 모듈에서 담당한다.
3. 수집·원문 해석·호재 분류·AI 평가·Discord 전송·처리 상태 저장을 각각 분리한다.
4. 모든 원본 응답은 비밀정보를 제외하고 관리자 디버깅 결과에서 복사 가능하게 제공한다.
5. accession number와 source URL을 중복 방지 키로 사용한다.
6. SEC 원문 HTML/Atom/RSS/JSON 파서는 입력 형식별로 분리한다.
7. SEC 데이터는 투자 판단의 확정 신호가 아니라 공시 원문 기반의 후보 신호로 취급한다.

## 환경변수 후보

현재 기능 구현 시 필요할 때만 추가한다.

```text
SEC_USER_AGENT=StockMan/0.1.0 admin@example.com
SEC_API_BASE_URL=https://data.sec.gov
SEC_WEB_BASE_URL=https://www.sec.gov
SEC_REQUEST_TIMEOUT_MS=15000
SEC_MAX_REQUESTS_PER_SECOND=8
```

공개 데이터 API 자체에는 SEC API key가 필요하지 않다. `SEC_USER_AGENT`는 사실상 운영 필수값으로 취급한다.

문서 확인 기준일: 2026-08-07 (공식 SEC 문서 링크를 기준으로 갱신)
