# 공시 기반 일별 주가 영향 이벤트

> 국내 보통주 공시의 장기 데이터 모델·수정/정정 문서 생명주기·일정 상태 구조 제안은 [국내 보통주 공시 이벤트 구조 설계](./kr-disclosure-event-architecture.md)를 우선 참조한다. 이 문서는 현재 `market-impact-events.v1` JSON/DB/API 구현 계약과 이력을 설명하며, 해당 구조 제안이 구현되었다는 뜻은 아니다.

## 목적과 단일 JSON 원본

SEC/DART 등 공시를 Codex가 직접 분석해 주가에 영향을 줄 가능성이 있는 사건을 날짜별 이벤트로 기록한다. 주가 방향이나 수익을 보장하지 않으며, 공시 원문으로 확인되는 사실과 Codex의 영향 해석을 분리한다.

관리·검토용 JSON은 [`../../data/market-impact-events.json`](../../data/market-impact-events.json) 한 파일만 사용한다. 파일은 `schemaVersion`과 시장별 `markets.KR[]`, `markets.US[]` 배열을 둬 국내·미국 공시를 분리한다. 이벤트 ID 기준 upsert로 운영 DB에 반영한다. DB는 API 조회용 운영 복제본이며 JSON을 대체하는 별도 수기 관리 원본이 아니다. JSON에서 제거된 이벤트를 자동 삭제하지 않는다. 정정은 같은 `eventId`를 수정해 재적재하고, 취소·정정 여부는 status와 근거로 남긴다.

## JSON 계약 v1

## 종목·공시별 검토 원장 운영 규칙

미국 소형주 이벤트 조사에서 세 파일은 서로 다른 책임을 갖는다.

- `data/us-smallcap-event-review-20261031.json`은 종목별 유니버스, 운영 서버 관측 스냅샷, SEC 제출 인벤토리와 종목별 검토 상태를 보관한다.
- `data/us-smallcap-filing-review-ledger-20261031.json`은 SEC accession별 검토 상태와 해당 공시가 만든 `eventId` 관계의 정본이다. 각 종목의 `filings`는 조사 편의를 위한 복제본으로, canonical filing 행과 동일한 상태/이벤트 ID를 유지해야 한다.
- `data/market-impact-events.json`은 실제 이벤트의 단일 편집 원본이며, SEC `sourceId`/`sourceUrl`과 event ID를 보관한다.
- `docs/operations/us-smallcap-event-review-20261031.md`는 사람이 검토하는 요약과 배치 기록이다. 수치 요약은 JSON 원장에서 계산한 값이어야 한다.

공시 1건이 독립 사건을 여러 개 만들 수 있으므로 filing-to-event 관계는 한 accession 행에 여러 event ID를 담는다. 각 이벤트에는 반대로 종목, accession, 원문 URL, 근거 인용, 상태, 위험과 한계를 남긴다. 표결·승인·실제 발행·법적 효력·거래개시처럼 서로 다른 단계는 같은 이벤트 요약에 뭉치지 않고 별도 ID로 둔다. 공시 접수일과 사건일을 혼합하지 않는다.

배치 반영 순서는 canonical 이벤트 → SEC filing ledger → 종목별 filing 사본/검토 메타데이터 → 보고서와 DEVELOPMENT_LOG다. 완료 전에 `npm run validate:us-smallcap-event-data`를 실행한다. 이 읽기 전용 검증은 event ID 중복 및 canonical/review 날짜·상태 parity, SEC event와 accession 관계, ledger/issuer filing 복제본의 status/eventIds parity, accession-event 관계 인덱스의 중복·누락·고아 행, 제출상태 집계와 실제 filing row 수를 확인한다. 관계 인덱스는 ledger filing 행의 accession별 eventIds에서 한 행씩 재생성하며, 여러 eventId를 한 문자열에 결합하거나 수동으로 따로 세지 않는다. 사람이 요약하는 보고서의 이벤트 수·고유 티커 수·상태 수도 이 검증 집계와 일치시킨다. 사람인이 근거 URL을 종목 간 복사하는 오류를 막기 위해 검증기는 canonical `sourceUrl` 및 SEC `evidence[].sourceUrl`의 EDGAR CIK를 해당 티커의 공식 CIK와 대조한다. 다른 발행사의 SEC 문서를 비교 근거로 쓰는 예외는 `relatedSourceUrls`에 명시적으로 연결한 경우만 허용한다.

개선 방향: 현재 세 데이터 파일은 SEC 제출 행을 조사 JSON과 filing ledger에 복제하고 사람이 eventIds 문자열을 동기화한다. accession 정본은 filing ledger에 두고 조사 JSON에는 종목 스냅샷·SEC 제출 참조만 두는 정규화 전환이 바람직하다. 다만 기존 연구 스크립트·운영 API·importer 호환성과 복구 가능성을 보장할 contract migration, 읽기 호환 기간, parity validator, rollback 절차를 설계·검증하기 전에는 파일 구조를 바꾸지 않는다. 이후 정본 accession을 SEC submissions inventory 또는 기존 filing storage에서 확정하고, 연구 보고 JSON의 중복 filing 사본 제거는 별도 버전 전환으로 수행한다.


필수 이벤트 필드: `eventId`, `eventDate`, `ticker`, `companyName`, `eventType`, `status`, `direction`, `impactHorizon`, `title`, `summary`, `rationale`, `confidence`, `sourceType`, `sourceId`, `sourceUrl`. 시장은 `markets.KR` 또는 `markets.US` 배열 위치로 결정되며 importer가 DB의 `market` 컬럼에 기록한다.

- `sourceType`은 출처 계열을 나타내는 안정적인 uppercase 식별자다. 미국 EDGAR 원문은 `SEC_FILING`, 발행사 자료가 IR/Nasdaq/GlobeNewswire/Newsfile 등에 실린 경우 `ISSUER_PRESS_RELEASE`로 정규화한다. 출처 매체는 `sourceUrl`, 원문 식별자는 `sourceId`에 보존한다.

- `eventDate`는 원문에서 확인된 이벤트/공시 기준 날짜(`YYYY-MM-DD`)다. 공시 접수일, underlying event date, 실제 효력일을 서로 혼합하지 않는다.
- 원문이 월·분기·연도 단위만 공개한 사실에는 임의의 일자를 부여하지 않는다. v1의 일 단위 이벤트 행으로 표현할 수 없으면 더 큰 이벤트의 `limitations`/근거에 공개된 정밀도를 보존하고 별도 보고서에 기록한다. 이를 줄이려면 호환 가능한 `eventDatePrecision` 및 날짜 범위 필드(예: `MONTH`, `QUARTER`, `YEAR`, `DAY`)를 버전 계약으로 설계하고 importer·DB·API·정렬/필터·validator parity 및 backfill/rollback을 함께 검토해야 한다. `YYYY-MM-01`을 실제 날짜처럼 쓰는 방식은 금지한다.
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
4. 운영 DB 자격증명이 있는 환경에서 `DATABASE_URL`을 환경에 주입하고 `node scripts/import-market-impact-events.mjs [json-path]`를 실행한다. 국내·미국 배열을 각각 검증하고 ID 기준으로 합친 뒤, 각 ticker가 해당 시장의 공식 마스터에서 활성 `COMMON_STOCK`인지 확인해 트랜잭션 내 upsert한다. 마스터 확인 실패/미분류는 fail-closed다. 파일에서 빠진 과거 행은 삭제하지 않는다.
5. `GET /api/public/market-impact-events`에서 운영 DB를 조회한다. 지원 query는 `date`, `from`, `to`, `market`, `ticker`, `limit`이며 읽기 전용·무인증이다.

## 검증과 한계

- Migration, JSON importer, route는 배포 전에 각각 적용·실행 검증이 필요하다. 운영 데이터는 이 작업에서 생성하거나 적재하지 않았다.
- API surface 생성 후 OpenAPI와 route inventory를 동기화해야 한다.
- 단일 JSON 파일은 동시 편집 충돌이 가능하므로 갱신 때 최신 파일을 pull하고 eventId 중복을 확인한다.
- 이벤트 발생 사실과 실제 주가 반응의 인과관계는 이 데이터 계약만으로 입증되지 않는다.

## 프로젝트 기준

- DART: [공시검색 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001), [공시서류 원본 파일 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003)
- SEC: [EDGAR developer resources and data APIs](https://www.sec.gov/about/developer-resources)
- OpenAPI: [OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)
- 내부 입력·분석: [`sec-ticker-disclosure-analysis-design.md`](./sec-ticker-disclosure-analysis-design.md), [`../operations/us-market-event-analysis-standard.md`](../operations/us-market-event-analysis-standard.md), [`../operations/market-impact-event-chatgpt-web-runbook.md`](../operations/market-impact-event-chatgpt-web-runbook.md)
