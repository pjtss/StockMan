# 공시 기반 일별 주가 영향 이벤트

## 목적과 단일 JSON 원본

SEC/DART 등 공시를 Codex가 직접 분석해 주가에 영향을 줄 가능성이 있는 사건을 날짜별 이벤트로 기록한다. 주가 방향이나 수익을 보장하지 않으며, 공시 원문으로 확인되는 사실과 Codex의 영향 해석을 분리한다.

관리·검토용 JSON은 [`../../data/market-impact-events.json`](../../data/market-impact-events.json) 한 파일만 사용한다. 파일은 `schemaVersion`과 시장별 `markets.KR[]`, `markets.US[]` 배열을 둬 국내·미국 공시를 분리한다. `eventId`는 레코드 ID이며, 중복 사건 방지는 `(market, sourceType, sourceId, ticker, eventType, eventKey)` 자연 키로 별도 보장한다. `eventKey` 생략 시 `DEFAULT`; 같은 공시·종목·유형에 독립 사건이 여럿일 때만 서로 다른 안정 `eventKey`를 쓴다. JSON importer와 V164 unique index가 중복을 거부하며, 정정은 같은 `eventId`와 자연 키로 재적재한다. DB는 API 조회용 운영 복제본이며 JSON을 대체하는 별도 수기 관리 원본이 아니다. JSON에서 제거된 이벤트를 자동 삭제하지 않는다. 취소·정정 여부는 status와 근거로 남긴다.

## JSON 계약 v1

필수 이벤트 필드: `eventId`, `eventDate`, `ticker`, `companyName`, `eventType`, `status`, `direction`, `impactHorizon`, `title`, `summary`, `rationale`, `confidence`, `sourceType`, `sourceId`, `sourceUrl`. 선택 필드 `eventKey`는 기본 `DEFAULT`이며 다중 독립 이벤트 구분에만 쓴다. 시장은 `markets.KR` 또는 `markets.US` 배열 위치로 결정되며 importer가 DB의 `market` 컬럼에 기록한다.

- `eventDate`는 원문에서 확인된 이벤트/공시 기준 날짜(`YYYY-MM-DD`)다. 공시 접수일, underlying event date, 실제 효력일을 서로 혼합하지 않는다.
- `status`: `REPORTED`, `CONFIRMED_SCHEDULED`, `ESTIMATED`, `COMPLETED`, `CANCELLED`. 확정 일정과 추정 일정을 구분한다.
- `direction`: `POSITIVE`, `NEGATIVE`, `MIXED`, `UNCERTAIN`. 주가 방향의 확정 예측이 아니라 공시 내용의 잠재적 방향성이다.
- `impactHorizon`: `INTRADAY`, `SHORT_TERM`, `LONG_TERM`, `UNKNOWN`.
- `confidence`: `HIGH`, `MEDIUM`, `LOW`는 원문 근거의 충실도를 나타낸다.
- `publishedAt`은 확인 가능한 ISO-8601 시각과 offset을 저장한다. 미국 이벤트 분석은 ET와 KST를 함께 근거에 적고, 날짜만 공개된 일정에는 임의 시각을 부여하지 않는다.
- `evidence`는 `{quote, sourceUrl, locator}` 배열이다. 직접 근거가 불충분하면 이벤트를 억지로 확정하지 않고 `UNCERTAIN` 및 `limitations`로 기록한다.
- `risks`와 `limitations`는 배열이며, 희석·상장유지·임상/규제·사업 실행 등 반대 근거와 확인 불가 사항을 기록한다.
- 모든 주식 이벤트는 공식 종목 마스터의 활성 `COMMON_STOCK` 확인이 선행되어야 한다. 국내 종목 추출이면 시가총액 300억 원 이하를 기본 제외한다.

공시 ID는 SEC accession 또는 DART 접수번호와 이벤트 구분값을 결합해 안정적으로 만든다. 공시 한 건에서 독립 사건이 여러 개 확인되면 eventId를 분리한다.

## 운영 흐름

1. OpenDART 공시검색으로 대상 접수번호를 찾고 [공시서류원본파일 공식 API](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003) 또는 [SEC EDGAR 데이터 API](https://www.sec.gov/about/developer-resources)에서 공시 원문을 확인한다. 별도 LLM provider/API key 기반 분석은 사용하지 않는다.
2. POSITIVE/NEGATIVE/MIXED/UNCERTAIN 판단은 원문 근거, 반대 요인, 한계를 포함해 같은 JSON의 해당 시장 배열에 추가한다.
3. Flyway `V163`으로 `market_impact_events` 테이블을, `V164`로 `event_key`와 자연 키 unique index를 배포한다. V164는 기존 데이터의 자연 키 중복이 있으면 적용을 거부한다.
4. OCI release archive는 관리 JSON과 importer를 포함한다. 활성화 스크립트가 migration 성공 후 `DATABASE_URL`로 importer를 실행해 국내·미국 배열, eventId·자연 키 중복, 종목 마스터를 검증하고 eventId 기준 upsert한다. 각 ticker는 시장별 공식 마스터의 활성 `COMMON_STOCK`이어야 하며 조회 실패/미분류는 fail-closed다. 검증 또는 적재가 실패하면 release 전환을 중단하고 기존 앱 release를 유지한다. 파일에서 빠진 과거 행은 삭제하지 않는다.
5. `GET /api/public/market-impact-events`에서 운영 DB를 조회한다. 지원 query는 `date`, `from`, `to`, `market`, `ticker`, `limit`이며 읽기 전용·무인증이다.
6. 분석 담당자나 ChatGPT 웹은 `GET /api/public/market-impact-events/guide`에서 버전이 있는 작성 지침, JSON Schema, 시장별 근거 정책, JSON 갱신 절차를 조회한다. 이 API는 정적 가이드만 반환하고 파일·DB를 쓰지 않는다. 실제 수정은 관리 JSON에 반영한 다음 저장소 배포 절차로 운영 DB에 upsert한다.

## 검증과 한계

- Migration, JSON importer, route는 배포 전에 각각 검증한다. deploy workflow는 V164를 포함한 migration 성공 후 원본 JSON의 upsert 완료를 release 전환 조건으로 삼는다.
- API surface 생성 후 OpenAPI와 route inventory를 동기화해야 한다.
- 가이드 원본은 [`../../data/market-impact-event-guide.json`](../../data/market-impact-event-guide.json)이다. 이벤트 계약·enum 변경 시 importer, 이벤트 조회 API, guide의 `eventContract`·`jsonSchema`, API 매뉴얼과 함께 변경한다. 가이드 구조의 비호환 변경은 새 `schemaVersion`, 호환 가능한 지침 개정은 `guideVersion` 증가로 표시한다.
- 단일 JSON 파일은 동시 편집 충돌이 가능하므로 갱신 때 최신 파일을 pull하고 eventId와 자연 키 중복을 확인한다. 다른 eventId로 같은 자연 키를 만들면 importer가 운영 DB 변경 전에 실패한다. 동시 쓰기 경합은 PostgreSQL unique index가 차단한다.
- 이벤트 발생 사실과 실제 주가 반응의 인과관계는 이 데이터 계약만으로 입증되지 않는다.

## 프로젝트 기준

- DART: [공시검색 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001), [공시서류 원본 파일 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003)
- SEC: [EDGAR developer resources and data APIs](https://www.sec.gov/about/developer-resources)
- OpenAPI: [OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)
- PostgreSQL: [Unique Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS), [INSERT `ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html)
- JSON Schema: [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- Next.js: [Next.js 15 Route Handlers](https://nextjs.org/docs/15/app/getting-started/route-handlers-and-middleware)
- 내부 입력·분석: [`sec-ticker-disclosure-analysis-design.md`](./sec-ticker-disclosure-analysis-design.md), [`../operations/us-market-event-analysis-standard.md`](../operations/us-market-event-analysis-standard.md)
