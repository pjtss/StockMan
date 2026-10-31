# 미국 보통주 티커 메타데이터 설계

## 목적과 경계

티커 하나로 미국 활성 보통주를 식별하고, 운영 DB에 저장된 마스터·최신 시세·SEC 회사 식별·대표 재무 사실을 한 번에 확인하게 한다. `GET /api/public/us-stock-metadata?ticker=...`는 기존 `us_common_stock_universe`, `instrument_fundamental_snapshots`, `sec_companies`, `sec_xbrl_snapshots`만 읽는다. 요청 중 외부 API 호출이나 DB 쓰기는 하지 않는다.

SEC의 티커·CIK·거래소 매핑은 검색 편의 데이터이며 SEC가 정확성이나 범위를 보장하지 않는다. 따라서 입력 티커만으로 종목 적격성을 결정하지 않고, 프로젝트의 공식 활성 종목 마스터에서 `COMMON_STOCK`와 거래소·비보통주 제외 플래그를 확인해야 한다. SEC Company Facts는 XBRL 재무 사실을 제공하지만 모든 회사가 모든 항목을 보고하는 것은 아니다. 누락은 0으로 대체하지 않는다.

## 입력 및 식별 절차

1. `ticker`를 trim/대문자화하고 길이·문자 집합을 검증한다. 점/대시 표기는 임의 변환하지 않는다.
2. 미국 종목 마스터에서 canonical `code` 완전 일치 후보를 찾는다. `realtime_symbol`은 반환 정보로만 제공하고 검색 별칭으로 쓰지 않는다. 0건은 `INSTRUMENT_NOT_FOUND`, 복수 후보는 `AMBIGUOUS_TICKER`로 돌려보낸다.
3. `enabled=true`, `instrument_type=COMMON_STOCK` 및 ETF/ETP·워런트·파생·DR·레버리지·인버스 플래그가 모두 확인되고 false인지 검사한다. 분류나 마스터를 확인할 수 없으면 fail-closed로 결과를 주지 않는다. 활성 보통주 마스터에 없지만 특수종목 마스터에서 확인된 코드는 422로 거부한다.
4. 일치한 종목의 `market`, `code`, 이름을 내부 canonical key로 사용하고 SEC CIK를 연결한다. SEC ticker/exchange 매핑을 우선 사용하며, 매핑이 없으면 공식 SEC SIC 동기화가 기록한 `SEC_EDGAR_SIC:<10자리 CIK>` provenance를 보조 연결키로 사용한다. 이 fallback은 식별정보·기존 Company Facts snapshot 연결에만 쓰며 마스터 적격성을 대체하지 않는다.

## 권장 응답 필드

| 그룹 | 권장 필드 | 출처·정책 |
|---|---|---|
| 식별 | `ticker`, `name`, `englishName`, `market`, `exchangeName`, `currency`, `countryCode` | 활성 종목 마스터. 티커는 입력 별칭이 아닌 canonical `code`를 반환 |
| 보통주 판정 | `instrumentType`, `securityType`, `isCommonStock`, `isEtf`, `isWarrant`, `isDerivative`, `isDr`, `isLeveraged`, `isInverse`, `masterUpdatedAt`, `lastSeenAt` | 마스터 원본 분류. 제외 플래그가 누락되면 응답 중단 |
| 회사 식별 | `cik`, `secName`, `sic`, `sicDescription`, `industryCode` | SEC 회사 맵·회사 마스터. 미연결 값은 null |
| 회사 개요 | `description`, `website`, `headquarters`, `fiscalYearEnd`, `employees` | 회사 IR/공식 제출자료에서만 채우고 개별 출처·기준일 보존. 1차 응답에서 선택 필드 |
| 최신 시장 스냅샷 | `price`, `changeRate`, `open`, `high`, `low`, `volume`, `tradingValue`, `marketCap`, `listedShares` | 기존 `instrument_fundamental_snapshots`; `currency`, `source`, `observedAt`, `fetchedAt`를 반드시 함께 반환 |
| 주식 구조 | `sharesOutstanding`, `publicFloatShares`, `publicFloatPercent` | SEC 제출/Company Facts 및 공식 발행사 공시. 각 수치에 기준일·출처 링크·계산 여부 표기. 기존 `listedShares`와 의미가 다르므로 혼용 금지 |
| 재무 요약 | `revenue`, `operatingIncome`, `netIncome`, `cashAndCashEquivalents`, `operatingCashFlow` | 저장된 SEC Company Facts의 US-GAAP/IFRS 표준 태그에서 제공. 값마다 기간, 제출일, form, accession, taxonomy, concept, unit을 함께 반환 |
| 품질·갱신 | `masterUpdatedAt`, `marketDataObservedAt`, `financialPeriodEnd`, `financialFiledAt`, `dataQuality`, 필드별 `source` | 회사 프로필·시세·재무는 서로 다른 갱신 주기라 전역 단일 `updatedAt`으로 합치지 않음. 시세 관측 나이와 24시간 freshness 기준을 표시 |

## 현재 API 응답 예시

```json
{
  "ok": true,
  "schemaVersion": "us-stock-metadata.v1",
  "asOf": "2026-10-31T00:00:00.000Z",
  "ticker": "ABC",
  "identity": {
    "market": "NAS", "ticker": "ABC", "realtimeSymbol": null,
    "name": "Example Corp.", "englishName": "Example Corporation",
    "exchangeName": "NASDAQ", "currency": "USD", "countryCode": "US",
    "industryCode": null, "instrumentType": "COMMON_STOCK", "securityType": "STOCK",
    "etpType": null, "isCommonStock": true,
    "classification": {
      "isEtf": false, "isWarrant": false, "isDerivative": false,
      "isDr": false, "isLeveraged": false, "isInverse": false,
      "masterUpdatedAt": "2026-10-31T00:00:00Z",
      "lastSeenAt": "2026-10-31T00:00:00Z", "source": "official-master-file"
    }
  },
  "company": {
    "cik": "0000000000", "secName": "Example Corp.", "sic": null,
    "source": "SEC_COMPANY_TICKER_EXCHANGE_MASTER", "sourceUpdatedAt": null
  },
  "financials": {
    "source": "SEC_COMPANY_FACTS",
    "sourceUrl": "https://data.sec.gov/api/xbrl/companyfacts/CIK0000000000.json",
    "fetchedAt": "2026-10-30T08:00:00Z", "entityName": "Example Corp.",
    "availableMetricCount": 1,
    "missingMetrics": ["operatingIncome", "netIncome", "cashAndCashEquivalents", "operatingCashFlow"],
    "metrics": {
      "revenue": {
        "value": "1234000", "unit": "USD", "taxonomy": "us-gaap",
        "concept": "RevenueFromContractWithCustomerExcludingAssessedTax",
        "periodKind": "DURATION", "periodStart": "2026-01-01", "periodEnd": "2026-09-30",
        "filedAt": "2026-10-30", "form": "10-Q", "accessionNumber": "0000000000-26-000001",
        "fiscalYear": 2026, "fiscalPeriod": "Q3", "frame": "CY2026Q3"
      },
      "operatingIncome": null, "netIncome": null,
      "cashAndCashEquivalents": null, "operatingCashFlow": null
    }
  },
  "marketSnapshot": {
    "price": 12.34, "changeRate": 1.2, "open": 12.1, "high": 12.5,
    "low": 12.0, "volume": 100000, "tradingValue": 1234000,
    "marketCap": 50000000, "listedShares": 4051863,
    "currency": "USD", "source": "KIS_OVERSEAS_PRICE",
    "observedAt": "2026-10-30T20:00:00Z", "fetchedAt": "2026-10-30T20:01:00Z"
  },
  "dataQuality": {
    "status": "PARTIAL", "missingGroups": ["financial_metrics"],
    "marketDataFreshness": "FRESH", "marketDataAgeSeconds": 14400,
    "freshnessThresholdSeconds": 86400
  }
}
```

예시의 `ABC`와 값은 구조 설명용이다. 실제 데이터처럼 사용하면 안 된다. 알 수 없는 값은 null로 표현하고 계산·추정값을 공식 관측값처럼 채우지 않는다. 시세 freshness는 원천 관측시각 기준으로 24시간 이내면 `FRESH`, 초과하면 `STALE`이며, 관측시각이 없으면 `UNKNOWN`이다.

## 구현 우선순위

### 1단계: 현재 데이터만으로 기본 프로필 및 저장 재무 사실 (구현)

마스터의 이름·시장·통화·분류와 기존 스냅샷의 quote/시총/주식수 및 시각·출처를 묶는다. SEC CIK/SIC는 ticker-exchange 매핑을 우선 연결하고, SEC SIC 출처에 10자리 CIK가 기록된 경우 그 provenance로 보완한다. 저장된 Company Facts에서 대표 5개 사실을 뽑아 보고기간과 공시 추적 메타데이터를 유지한다. 동일 지표는 가장 늦은 `end` 기간을 선택하고, 기간이 같으면 가장 최근 `filed` 공시를 선택한다. 기간을 합산하거나 독립 분기값으로 변환하지 않는다. DB 테이블을 변경하지 않고 단일 공개 GET으로 조회한다. 티커가 마스터에서 유일하게 검증되지 않거나 활성 COMMON_STOCK이 아니면 데이터를 반환하지 않는다. API는 현재 DB snapshot을 읽으므로 실시간 시세를 새로 조회한다고 표현하지 않는다. 표준 태그가 없거나 SEC 캐시가 없으면 해당 값은 null이다.

### 2단계: 추가 재무 항목

현재 대표 5개 항목 외 EPS·부채·자산 등 추가 지표가 필요할 때, SEC taxonomy별 concept 매핑과 기간·단위 보존 규칙을 먼저 확장한다. 회사별 fiscal calendar가 다르므로 `frame`을 회계분기의 확정 근거처럼 사용하지 않는다.

### 3단계: 개요와 희석·유통주식 정보

회사 설명·직원 수·주식 수·float는 제출 문서/공식 IR에서 확인되는 경우만 추가한다. `sharesOutstanding`과 `publicFloatShares`는 기준일이 다를 수 있으며, 전자는 SEC company facts 값이 항상 적시에 최신이라는 보장이 없으므로 기준일 경고를 노출한다. float 계산이 추정치라면 수식·입력 기준일·출처를 함께 저장하고 verified 값과 구분한다.

## API 계약 권고

- 입력은 단건 `ticker`; 여러 티커는 별도 batch 계약으로 분리한다.
- 외부 종목·시장 조회 GET은 프로젝트 규칙에 따라 무인증 공개로 유지한다. 사용자별 관심종목·진단·작업 실행 기능은 이 API에 섞지 않는다.
- 성공 응답은 `identity`, `company`, `marketSnapshot`, `financials`, `dataQuality`로 그룹화한다.
- 현재 API 오류: 400 `INVALID_TICKER`, 404 `INSTRUMENT_NOT_FOUND`, 409 `AMBIGUOUS_TICKER`, 422 `NOT_ACTIVE_COMMON_STOCK`, 503 `US_STOCK_METADATA_UNAVAILABLE`. 분류 확인 불가나 보통주 외 분류는 fail-closed 422다.
- 각 변동성 높은 값에는 적어도 `source`, `observedAt` 또는 `periodEnd`, `fetchedAt`을 포함한다. 재무 사실은 공시 `filedAt`과 accession까지 포함한다.
- 공개 API 추가 시 OpenAPI의 구체 DTO, `docs/api/route-inventory.json`, 공개 API 감사 및 API 매뉴얼을 함께 갱신한다.

## 현재 모델과의 연결

- `us_common_stock_universe`: 종목명, 영어명, 거래소 코드, security 분류, 통화, 국가, industry code, 활성 상태와 비보통주 제외 플래그를 제공한다.
- `instrument_fundamental_snapshots`: 가격·변동률·거래량·거래대금·시총·상장주식수와 통화·원천·관측/수집시각을 제공한다.
- `sec_companies`: CIK, 회사명, 티커/거래소 배열, SIC 및 원본 갱신시각을 제공한다.
- `sec_xbrl_snapshots`: Company Facts 전체 snapshot을 읽어 표준 태그의 최근 관측값을 추출한다. 각 값의 taxonomy/concept/unit/기간/accession을 응답에 보존한다.
- `/api/public/instrument-fundamentals`는 이미 market+codes 일괄 스냅샷을 반환하지만, 회사 프로필 조회와 티커 정규화 계약은 제공하지 않는다. 새 단건 계약을 만들 때 기존 endpoint의 의미를 바꾸지 않는다.
- 단건 API는 `/api/public/us-stock-metadata?ticker=...`다. 오류는 잘못된 티커 400, 미등록 티커 404, 다중 거래소 모호성 409, 활성 보통주가 아닌 경우 422, 저장소 장애 503으로 구분한다.

## 공식 자료

- SEC [Accessing EDGAR Data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data): 티커·CIK·거래소 파일은 검색 편의 데이터이며 정확성·범위 보장 없음; submissions와 XBRL facts API 안내.
- SEC [EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces): Company Facts 범위, 기간/프레임 의미, 갱신 특성 및 fair-access 정책.

## 미결정 항목

- ticker 점/대시 변형을 정규화할지 여부: 현재 권고는 변형하지 않고 exact match 후 모호성 오류 반환.
- 회사 설명·웹사이트를 수집할 공식 소스와 갱신 주기: 현재 구현 범위 밖이며 회사 IR/SEC 제출자료별 허용 필드가 확정돼야 한다.
- 재무 정규화 저장소의 기간별 이력 스키마 및 무료/라이선스 데이터 공급원: 기존 원본 테이블 및 운영 정책을 점검한 뒤 구현 전에 확정한다.
