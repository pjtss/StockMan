# 공시 기반 일별 주가 영향 이벤트

## 목적과 단일 JSON 원본

SEC/DART 등 공시를 Codex가 직접 분석해 주가에 영향을 줄 가능성이 있는 사건을 날짜별 이벤트로 기록한다. 주가 방향이나 수익을 보장하지 않으며, 공시 원문으로 확인되는 사실과 Codex의 영향 해석을 분리한다.

관리·검토용 JSON은 [`../../data/market-impact-events.json`](../../data/market-impact-events.json) 한 파일만 사용한다. 파일은 `schemaVersion`과 시장별 `markets.KR[]`, `markets.US[]` 배열을 둬 국내·미국 공시를 분리한다. 이벤트 ID 기준 upsert로 운영 DB에 반영한다. DB는 API 조회용 운영 복제본이며 JSON을 대체하는 별도 수기 관리 원본이 아니다. JSON에서 제거된 이벤트를 자동 삭제하지 않는다. 정정은 같은 `eventId`를 수정해 재적재하고, 취소·정정 여부는 status와 근거로 남긴다.

## JSON 계약 v1

필수 이벤트 필드: `eventId`, `eventDate`, `ticker`, `companyName`, `eventType`, `status`, `direction`, `impactHorizon`, `title`, `summary`, `rationale`, `confidence`, `sourceType`, `sourceId`, `sourceUrl`. 시장은 `markets.KR` 또는 `markets.US` 배열 위치로 결정되며 importer가 DB의 `market` 컬럼에 기록한다.

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
3. Flyway `V163`으로 `market_impact_events` 테이블을 배포한다.
4. OCI release archive는 관리 JSON과 importer를 포함한다. 활성화 스크립트가 migration 성공 후 `DATABASE_URL`로 importer를 실행해 국내·미국 배열을 각각 검증하고 ID 기준으로 upsert한다. 각 ticker는 시장별 공식 마스터의 활성 `COMMON_STOCK`이어야 하며 조회 실패/미분류는 fail-closed다. 검증 또는 적재가 실패하면 release 전환을 중단하고 기존 앱 release를 유지한다. 파일에서 빠진 과거 행은 삭제하지 않는다.
5. `GET /api/public/market-impact-events`에서 운영 DB를 조회한다. 지원 query는 `date`, `from`, `to`, `market`, `ticker`, `limit`이며 읽기 전용·무인증이다.

## 검증과 한계

- Migration, JSON importer, route는 배포 전에 각각 검증한다. deploy workflow는 V163 적용 후 원본 JSON의 upsert 완료를 release 전환 조건으로 삼는다.
- API surface 생성 후 OpenAPI와 route inventory를 동기화해야 한다.
- 단일 JSON 파일은 동시 편집 충돌이 가능하므로 갱신 때 최신 파일을 pull하고 eventId 중복을 확인한다.
- 이벤트 발생 사실과 실제 주가 반응의 인과관계는 이 데이터 계약만으로 입증되지 않는다.

## 프로젝트 기준

- DART: [공시검색 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001), [공시서류 원본 파일 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003)
- SEC: [EDGAR developer resources and data APIs](https://www.sec.gov/about/developer-resources)
- OpenAPI: [OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)
- 내부 입력·분석: [`sec-ticker-disclosure-analysis-design.md`](./sec-ticker-disclosure-analysis-design.md), [`../operations/us-market-event-analysis-standard.md`](../operations/us-market-event-analysis-standard.md)
