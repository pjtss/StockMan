# SEC 리스크 관리 설계

## 1. 목적

현재 스캐너가 추출한 미국 보통주 중 **현재 시가총액 5,000만 달러 이하** 종목을 대상으로 SEC 공시를 근거로 리스크를 정리하고, 로컬 DB에서 필요할 때 수동 갱신·조회·부분 수정할 수 있는 저장소와 API를 제공한다.

이 문서는 설계 기준이며, 문서 작성만으로 운영 API·DB·cron을 변경하지 않는다.

## 2. 범위와 기준

### 대상

- 시장: `NAS`, `NYS`, `AMS`
- 종목: `us_common_stock_universe`에서 `enabled=true`, `daily_active=true`, `instrument_type='COMMON_STOCK'`, `is_etf=false`인 종목
- 시가총액: 최신 `instrument_fundamental_snapshots.market_cap` 기준 `<= 50,000,000` USD
- 시가총액이 없거나 보통주 여부를 확인할 수 없는 종목은 fail-closed로 제외

### SEC 근거

- SEC `company_tickers.json` 또는 `company_tickers_exchange.json`으로 티커·CIK를 매핑하되, 매핑 시각과 원본을 기록한다.
- 회사별 `https://data.sec.gov/submissions/CIK##########.json`에서 제출 이력을 수집한다.
- 제출 인덱스가 실제 본문이 아닐 수 있으므로 accession의 primary document를 해석한 뒤 원문을 분석한다.
- 원문 URL, accession, Form, filing date를 모든 리스크 근거에 연결한다.
- 자동 요청은 식별 가능한 `SEC_USER_AGENT`, 초당 최대 10회, 429/403/5xx backoff를 사용한다.

공식 기준은 [`docs/sec-edgar-official-reference.md`](./sec-edgar-official-reference.md)와 SEC의 [EDGAR API 문서](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)를 따른다.

## 3. 리스크 JSONB 계약

`risk`는 PostgreSQL `jsonb` 컬럼에 저장한다. AI가 각 위험의 성격·근거·시간성·확실성을 구분할 수 있도록 리스크 한 건을 객체로 표현하고, 여러 리스크는 `items` 배열로 관리한다. 기존의 “1행에 줄바꿈” 요구는 JSONB 내부의 각 리스크 객체를 한 행의 `items` 배열에 저장하는 것으로 대체한다.

예:

```json
{
  "schemaVersion": 2,
  "items": [
    {
      "riskId": "nasdaq-bid-price-deficiency",
      "category": "LISTING_COMPLIANCE",
      "severity": "HIGH",
      "direction": "NEGATIVE",
      "status": "ACTIVE",
      "summary": "Nasdaq $1 bid-price 요건 미충족 통지로 상장유지 위험",
      "originalText": "The Staff indicated that ... the closing bid price ... was below the minimum $1.00 per share required for continued listing.",
      "koreanText": "회사는 30거래일 연속 최소 bid price 요건을 충족하지 못했으며 청문 패널 검토 대상이다. 즉시 상장폐지는 아니다.",
      "details": "원문을 바탕으로 한 구조화된 해석. 30거래일 연속 최소 bid price 요건을 충족하지 못했으며 청문 패널 검토 대상이다.",
      "observedAt": "2026-09-25",
      "impactWindow": { "from": "2026-09-25", "to": "2026-10-06", "label": "NEAR_TERM" },
      "evidence": [
        { "source": "SEC", "form": "8-K", "accession": "000117891326004609", "url": "https://www.sec.gov/Archives/...", "filingDate": "2026-09-25", "section": "Item 3.01" }
      ],
      "confidence": "HIGH",
      "limitations": ["SEC 공시만으로 실제 상장폐지 시점을 확정할 수 없음"]
    }
  ]
}
```

규칙:

1. 한 리스크는 한 문단으로 작성한다.
2. 리스크 사이에는 `\n` 하나만 사용한다.
3. 원문에서 확인되지 않은 승인확률, 매출 전망, 주가 방향은 작성하지 않는다.
4. “급등 가능”은 리스크 테이블에 섞지 않는다. 촉매가 있더라도 리스크가 아니면 별도 분석 결과로 관리한다.
5. SEC 원문 근거가 없는 항목은 `SEC 근거 확인 안 됨`으로 명시하고 추정 내용을 저장하지 않는다.
6. PATCH는 `risk.items` 전체 또는 특정 `riskId` 객체를 부분 수정할 수 있으며, 전달하지 않은 객체·필드는 유지한다.
7. `originalText`에는 SEC 원문에서 필요한 문장을 그대로 저장하고, `koreanText`에는 그 문장의 한국어 번역·해석을 저장한다.
8. `evidence`에는 SEC 원문 URL과 accession을 반드시 넣는다. 근거 없는 AI 추정은 저장하지 않는다.

## 4. 로컬 DB 테이블

테이블명: `sec_stock_risks`

### 필수 컬럼

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `ticker` | `text` | PK 일부, 대문자 | 미국 티커 |
| `company_name` | `text` | NOT NULL | 회사명 |
| `risk` | `jsonb` | NOT NULL | `schemaVersion`과 원문·한국어를 포함한 구조화된 `items` 배열 |

### 운영·근거 컬럼

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `market` | `text` | `NAS\|NYS\|AMS` |
| `market_cap_usd` | `numeric` | 갱신 당시 최신 시총 |
| `market_cap_observed_at` | `timestamptz` | 시총 관측시각 |
| `sec_cik` | `text` | 10자리 zero-padded CIK |
| `source_accessions` | `text[]` | 리스크에 사용한 accession 목록 |
| `source_urls` | `text[]` | SEC 원문 URL 목록 |
| `risk_as_of` | `date` | 분석 기준일(KST) |
| `source_updated_at` | `timestamptz` | SEC 원문·시총 확인시각 |
| `updated_at` | `timestamptz` | 마지막 DB 수정시각 |
| `updated_by` | `text` | `LOCAL_API` 또는 요청 주체 식별자 |

키는 `(market, ticker)`로 한다. 티커가 거래소 간 중복될 수 있으므로 ticker 단독 PK는 사용하지 않는다. API에서 ticker만 받은 경우 대상이 하나로 해석될 때만 허용하고, 복수 시장에 걸리면 `AMBIGUOUS_TICKER`를 반환한다.

### 마이그레이션 원칙

- Drizzle schema와 migration을 함께 추가한다.
- 기존 `us_daily_open_high_50_results`는 원시 추출 결과로 보존하고, 리스크 테이블은 분석 결과의 현재 스냅샷으로 분리한다.
- SEC 공시가 없거나 최신 근거가 사라진 경우 기존 리스크를 임의 삭제하지 않고 `SEC 근거 확인 안 됨`으로 교체할지 운영 정책을 명시한 뒤 적용한다. 기본값은 기존 기록 보존이다.

## 5. API 설계

권장 경로: `/api/us/sec-risks`

### 인증

- `GET`과 `PATCH` 모두 관리자 여부를 요구하지 않는다.
- 로컬에서 누구나 호출할 수 있도록 별도 관리자 세션 검사를 두지 않는다.
- 운영에 노출될 경우에도 기존 공개 API와 동일한 rate limit, 요청 크기 제한, 입력 검증을 적용한다.
- `updated_by`는 `LOCAL_API` 또는 선택적 요청 식별자로 기록하며 인증 우회용으로 사용하지 않는다.
- 응답에는 비밀키·SEC User-Agent 원문을 포함하지 않는다.

### GET 단수 조회

```http
GET /api/us/sec-risks?market=NAS&ticker=SLXN
```

응답:

```json
{
  "ok": true,
  "item": {
    "market": "NAS",
    "ticker": "SLXN",
    "companyName": "Silexion Therapeutics Corp",
    "risk": { "schemaVersion": 2, "items": [] },
    "sourceAccessions": ["000117891326004609"],
    "sourceUrls": ["https://www.sec.gov/Archives/..."],
    "riskAsOf": "2026-09-29",
    "updatedAt": "2026-09-29T...Z"
  }
}
```

### GET 복수 조회

```http
GET /api/us/sec-risks?market=NAS&tickers=SLXN,GCTK,JAGX
```

- `tickers`는 쉼표 구분, 최대 100개
- 중복 제거 후 대문자 정규화
- 기본 정렬: `market`, `ticker`
- 존재하지 않는 종목은 전체 요청을 실패시키지 않고 `missing` 배열로 반환

```json
{
  "ok": true,
  "items": [],
  "missing": [],
  "metadata": { "requestedCount": 3, "returnedCount": 3, "riskAsOf": "2026-09-29" }
}
```

### PATCH 단수 부분 수정

```http
PATCH /api/us/sec-risks?market=NAS&ticker=SLXN
Content-Type: application/json
```

```json
{
  "risk": {
    "schemaVersion": 2,
    "items": [
      { "riskId": "offering-dilution", "category": "DILUTION", "severity": "HIGH", "direction": "NEGATIVE", "status": "ACTIVE", "summary": "공모 및 워런트에 따른 잠재 희석", "originalText": "The company is offering ...", "koreanText": "회사는 ... 공모를 진행하고 있어 잠재적인 희석 위험이 있다.", "details": "원문에서 직접 확인한 발행·희석 구조의 해석", "observedAt": "2026-09-29", "impactWindow": { "label": "NEAR_TERM" }, "evidence": [], "confidence": "HIGH", "limitations": [] }
    ]
  }
}
```

허용 필드:

- `companyName`
- `risk` (`schemaVersion`, `items` 및 리스크 객체의 부분 필드)
- `sourceAccessions`
- `sourceUrls`
- `riskAsOf`

`market`, `ticker`, `secCik`, `marketCapUsd`는 PATCH 본문으로 변경하지 않는다. 종목 마스터·시총·SEC 매핑의 소유권이 별도 모듈에 있기 때문이다.

### PATCH 복수 부분 수정

```http
PATCH /api/us/sec-risks
Content-Type: application/json
```

```json
{
  "items": [
    { "market": "NAS", "ticker": "SLXN", "risk": { "items": [{ "riskId": "nasdaq-bid-price-deficiency", "severity": "HIGH", "summary": "상장유지 위험", "originalText": "...", "koreanText": "..." }] } },
    { "market": "NAS", "ticker": "GCTK", "risk": { "items": [{ "riskId": "offering-dilution", "category": "DILUTION", "severity": "HIGH", "direction": "NEGATIVE", "status": "ACTIVE", "summary": "공모·워런트 희석 위험", "originalText": "...", "koreanText": "...", "details": "...", "observedAt": "2026-09-29", "impactWindow": { "label": "NEAR_TERM" }, "evidence": [], "confidence": "HIGH", "limitations": [] }] } }
  ]
}
```

- 최대 100개
- 각 항목을 트랜잭션으로 검증한 뒤 일괄 upsert
- 하나라도 유효하지 않으면 전체 롤백(`all-or-nothing`)
- 응답은 `updated`, `missing`, `rejected`를 반환
- 부분 수정 의미를 보장하기 위해 전달되지 않은 필드는 기존 값을 유지

### 입력 검증

- ticker: `[A-Z0-9.-]{1,16}`
- market: `NAS|NYS|AMS`
- companyName: trim 후 1~300자
- risk: JSON object, `schemaVersion=2`, `items` 배열, 전체 JSON 직렬화 기준 최대 100,000자
- 각 item의 `riskId`, `category`, `severity`, `direction`, `status`, `summary`, `originalText`, `koreanText`, `details`, `evidence`, `confidence`를 검증
- HTML 태그·스크립트는 summary/details에 저장하지 않음
- evidence URL은 `https://www.sec.gov/` 또는 `https://data.sec.gov/`만 허용
- severity: `LOW|MEDIUM|HIGH|CRITICAL`, direction: `NEGATIVE|MIXED`, status: `ACTIVE|RESOLVED|UNKNOWN`
- `originalText`는 SEC 원문 인용(원문 언어)을 저장하고, `koreanText`는 이에 대응하는 한국어 번역·해석을 저장한다.
- 두 필드는 모두 비어 있을 수 없으며, 원문에 없는 내용을 `originalText`에 보충하지 않는다.
- 직접 인용은 필요한 최소 문장만 저장하고, 긴 원문 전체는 `sec_filing_documents`가 소유한다.

## 6. 수동 갱신 흐름

```text
사용자가 로컬 분석 작업을 실행
  → 시총 5,000만 달러 이하 보통주 조회
  → SEC CIK 매핑
  → Submissions·primary document 수동 조회
  → Codex가 SEC 원문 근거 기반 리스크 JSONB 작성
  → PATCH로 sec_stock_risks 부분 수정
  → GET으로 저장 결과 검증
```

CRON·예약 실행만 이 설계 범위에서 제외한다. 수동 로컬 실행과 GET/PATCH API를 통한 즉시 갱신은 지원한다. 수동 수집 실패 시 기존 리스크를 삭제하지 않고 오류를 보고한다. SEC 원문이 없거나 파싱 실패한 종목은 리스크를 새로 확정하지 않는다.

## 7. 재발 방지·검증 게이트

- 테이블 제약: `(market,ticker)` unique, `risk NOT NULL`
- 저장 전 JSON Schema와 각 item의 evidence 존재 여부를 검증
- 각 리스크 item에 accession 또는 SEC URL이 없으면 PATCH를 거부
- GET 단수·복수, PATCH 단수·복수, 부분 필드 보존, all-or-nothing rollback 테스트 추가
- 5,000만 달러 초과 종목을 저장하는지 테스트
- ETF·우선주·워런트 등 비보통주가 저장되는지 테스트
- SEC 429/403/5xx 시 기존 DB가 변경되지 않는지 테스트
- `npm run docs:check`, 타입체크, 관련 Vitest, 빌드 후에만 커밋·푸시

## 8. 구현 순서

1. Drizzle schema와 migration 추가
2. `sec-stock-risk-repository`의 조회·upsert·부분 수정 구현
3. `/api/us/sec-risks` GET/PATCH 라우트 구현
4. SEC 근거 수집·리스크 정규화 application service 구현
5. 단수·복수 API 및 저장 형식 테스트 작성
6. 5,000만 달러 이하 실제 데이터로 로컬 smoke test
7. 수동 로컬 smoke test와 기존 데이터 백업·dry-run·검증 결과 기록

## 9. 구현 상태

- 구현됨: `db/migration/V143__create_sec_stock_risks.sql`, `lib/schema.ts`, `lib/sec-stock-risk-repository.ts`, `app/api/us/sec-risks/route.ts`.
- 로컬 DB에서 `sec_stock_risks` 테이블 생성 확인.
- GET/PATCH는 관리자 세션 없이 동작하도록 구현했으며, CRON·예약 실행은 추가하지 않았다.
- 남은 검증: 손상된 로컬 `node_modules` 복구 후 typecheck·Vitest·production build를 실행해야 한다.
