# 일별 공시·RSS 통합 조회 설계안

## 문서 상태

- 상태: 부분 구현, source coverage 및 전체 수집은 미완료
- 범위: 국내·해외 공시와 RSS를 일자·출처 기준으로 조회
- 관련 코드: `market_rss_articles`, `sec_submissions`, `sec_filing_documents`, `filings`

## 현재 코드 상태 대조 — 수집과 조회 coverage 분리

현재 저장소 코드에서는 `/api/disclosures`가 외부 source를 호출하지 않고 `market_rss_articles`와 `filings`에 이미 저장된 행만 조회한다. `source=KRX_KIND|NEWSIS|MK|HANKYUNG|ETODAY` 필터가 있어도 해당 RSS adapter가 주기적으로 DB에 적재된다는 뜻은 아니다. `fetchMarketRssSource()` wrapper는 domestic adapter 분기를 포함하지만 관리자 `/api/admin/market-rss-test`는 별도의 `MARKET_RSS_SOURCES` allowlist만 허용하므로 국내 5 source는 route에서 거부된다. `fetchAllDomesticRss()`의 현재 caller는 테스트 외 경로에서 확인되지 않는다. `lib/market-rss-pipeline.ts`의 `fetchAllMarketRss()`는 `MARKET_RSS_SOURCES`에 정의된 5개 비국내 source만 순회한다. `app/api/cron/market-rss/route.ts`는 그중 `GLOBENEWSWIRE`, `STOCKTITAN`, `SEC_EDGAR`를 고정 전달하므로 현재 repository에서 domestic RSS adapter를 호출하는 production/admin route 및 예약 저장 경로는 확인되지 않는다. 실제 운영 DB에 국내 source 행이 있는지 또는 외부 수집기가 별도로 존재하는지는 이번 코드 검사로 확인하지 않았다.

현재 GET 응답은 sourceCoverage를 제공한다. 요청별 total count, 저장 항목, queryWindow와 겹치는 자동화 run 요약은 하나의 Drizzle `REPEATABLE READ` 읽기 전용 트랜잭션 스냅샷에서 조회한다. 이는 응답 내부 DB 관측 시점을 일치시키지만 sourceCoverage의 `rangeCoverage`를 높이거나 provider 전체 범위·수집 완전성을 증명하지 않는다. 각 row는 source + externalId 또는 SEC accession 기반 안정 id를 사용한다. RSS와 SEC는 source snapshot ID를 연결 가능할 때 반환하고 DART는 source-run 연결이 없어 null이다. SEC submissions는 sec_submissions에서 직접 읽으며 legacy SEC filings 행에 의존하지 않는다. Filing의 filedAt은 published_date_seoul 날짜 정밀도로 제공한다. RSS는 저장 raw item의 `pubDate`/`published`/`updated` 값을 검사해 명시 timezone이 있는 시간값만 published instant로, 정확한 `YYYY-MM-DD`만 date로 내보내고, 그 외는 시간 필드를 UNKNOWN/null로 보존한다. RSS의 rolling-hour 조회는 명시 timezone instant만 포함하며 날짜-only 값은 제외한다. RSS fetchedAt은 연결된 market_rss_fetch_snapshots.fetched_at에서 가져오며 연결이 없으면 null이다. DART fetchedAt은 source-run 연결이 없어 null이다. SEC submission fetchedAt은 accession이 들어 있는 SUBMISSIONS source snapshot을 찾았을 때만 반환한다. SEC historical additional JSON row 등 연결 근거가 없으면 null이다. article/filing updated_at은 수집 시각으로 사용하지 않는다. total은 선택 조건의 저장 row count이지 원천 전체 분모가 아니다. queryStatus는 DB 조회 결과를 표현하고 빈 결과는 원천 공시가 없다는 뜻이 아니다. RSS snapshot만으로 source 시도 실패나 article persist 완료를 판정하지 않는다. `/api/cron/sync-filings`는 `runFilingSync()`를 직접 호출하며, 이 함수가 활성 DART 실행 또는 skip run 기록을 소유한다. HTTP route에서 `dart-realtime`을 다시 감싸 중복 run을 만들거나 skip 결과를 outer SUCCESS로 덮지 않는다. 현재 sourceCoverage는 automation_runs를 요청 queryWindow와 겹치는 실행 구간으로 조회한 뒤 market-rss 3개 source, DART, SEC의 제한된 요약을 투영한다. 이는 선택 source의 원천 조회 window/reconciliation을 입증하지 않으며 rangeCoverage는 근거가 있는 경우 외에는 UNKNOWN이다. DART는 date-only 범위를 하루 조회에서만 pagination/receipt 분모가 reconcile됐을 때 열거 상태로 표시하고 persistState는 NOT_RUN이다. SEC는 `sec-realtime` run이 요청 window에 포함될 때만 aggregate Submissions fetch/upsert/snapshot 요약을 latestAttempt로 표시한다. 개별 CIK 실패와 예외는 분리 집계하며 fetch 시각은 성공 응답 중 가장 최근 값이다. SEC의 요청 범위·대상 모집단 분모가 없어 rangeCoverage는 항상 UNKNOWN이다. rolling-hour DART는 date-only 응답을 열거할 수 없어 rangeCoverage가 UNKNOWN이다. RSS run의 latestAttempt는 queryWindow에 겹치는 run만 표시하며, provider response의 조회 범위가 확인되지 않아 RSS rangeCoverage는 UNKNOWN이다. 모든 lastSuccessfulPersistAt은 현재 null이다. 이 projection은 source-run manifest나 완전성 증거가 아니다.

## 현재 코드 상태 대조 — 기준일·시각 정밀도·정렬

기본 “오늘” 날짜는 `lib/seoul-date.ts`의 `getSeoulDateKey()`를 사용해 browser/server host timezone과 관계없이 `Asia/Seoul` 기준으로 계산한다. `/api/disclosures`의 default `date`와 화면의 초기 선택 날짜가 같은 함수를 사용한다. 명시한 `date=YYYY-MM-DD`는 실제 달력 날짜(윤년 포함)인지 확인한 뒤 KST `+09:00` 자정부터 다음날 자정 전까지 조회하고, `2026-02-31`처럼 형식은 맞지만 존재하지 않는 날짜는 `INVALID_DATE`로 거부한다. `hours` 모드는 요청시각 기준 rolling interval로 유지한다. 응답 `displayTimezone`/`queryWindow`는 해당 조회 구간을 명시한다. SEC submissions와 DART filing은 date-only precision을 보존하고 rolling-hour query에서 제외하며, SEC fetchedAt은 accession이 포함된 snapshot에만 연결한다. item sortBasis에 따른 precision group ordering도 구현했다. RSS raw item timestamp로 정밀도를 판정하며 과거 저장행의 raw payload 결손·유효하지 않은 JSON은 UNKNOWN으로 남는다.

2026-11-23 조회 성능 개선: ingest 시 `classifyRssTimestamp` 결과를 `rss_timestamp_precision`/`rss_published_date`에 저장하고 V182가 기존 행을 backfill한다. `/api/disclosures`는 이 정규화된 metadata 열로 날짜 및 rolling-hour 필터와 응답을 구성하므로 각 요청에서 `raw_payload`를 다시 읽고 분류하지 않는다. 날짜-only와 명시 timezone instant의 의미 및 UNKNOWN 처리는 그대로 유지한다.

date 조회는 RSS published instant, RSS date-only 값, DART filing 및 SEC submission의 date-only 접수일을 구분한다. date-only RSS/DART/SEC rows는 rolling-hour query에서 제외해 임의의 timestamp를 만들지 않는다. RSS instant는 raw item의 timestamp에 시간과 명시 timezone이 있을 때만 판정한다. 병합 정렬은 PUBLISHED_INSTANT → FILED_DATE → 검증된 fetch instant → unknown 순으로 그룹화하고 그룹 안에서 내림차순, 이후 source + externalId 안정 키를 적용한다. 응답의 sortBasis와 sort: timestamp_precision_group_desc가 이 의미를 표현한다. legacy DB row 대상으로 실제 운영 API 결과와 provider timestamp formats의 acceptance는 아직 미완료다.

일일 RSS 분석 export의 SEC Submissions 경로는 `filingDate` 날짜-only 값이 `publishedAt` 누락 시 자정 UTC timestamp로 대체되던 동작을 제거했다. `acceptanceDateTime`은 SEC 접수시각이지 공개된 원문 발행시각이 아니므로 `publishedAt`으로 변환하지 않는다. 원문은 보존하고 `publishedAt`은 null, `filedAt`은 원래 날짜 정밀도의 `filingDate`로 반환한다. 동률 정렬도 SEC row `updatedAt`을 발행시각처럼 사용하지 않고 precision group, 날짜, accession 기반 키를 쓴다. SEC 설명은 acceptance date 형식을 YYYYMMDD, acceptance time을 HHMMSS (EST)로 구분하며 filing content first-availability timestamp는 없다고 밝힌다([SEC EDGAR timestamp FAQ](https://www.sec.gov/about/webmaster-frequently-asked-questions)). 따라서 timezone 없는 `acceptanceDateTime`은 애플리케이션에서 임의 timezone instant로 바꾸지 않는다.

### 다음 제품 개선 — 출처 시각 provenance 및 응답·화면 정밀도

기준일 기본값의 KST 통일과 응답 `displayTimezone`/`queryWindow` 구현을 완료했다. 날짜 조회는 KST 반개구간을 `KST_CALENDAR_DAY`, 최근 시간 조회는 요청시점 기준 반개구간을 `ROLLING_HOURS`로 반환하고 `endExclusive: true`를 명시한다. 화면은 응답 시간대 기준으로 구간을 표시하고 JSON 내보내기에 같은 query metadata를 포함한다. 공식 ECMAScript 국제화 명세는 named time zone을 사용하는 날짜/시간 형식화를 정의하며, PostgreSQL은 `date`(하루 정밀도)와 timezone-aware timestamp를 별도 타입으로 구분한다. 날짜만 제공된 source 값에 임의의 자정 시각을 만들어 넣지 않는다.

항목 시각은 출처가 실제 제공한 값과 정밀도를 보존한다.

| 필드 | 의미 | 누락 시 동작 |
|---|---|---|
| `publishedAt` | 원천이 제공한 발행 instant | null 유지 |
| `filedAt` | 공식 접수/제출 일자 또는 시각 | source precision 및 timezone과 함께 유지; 날짜-only를 instant로 변환하지 않음 |
| `fetchedAt` | 특정 source response를 실제 수신한 instant | fetch run 증거가 없으면 null |
| `storedAt` | DB 저장/수정 instant | fetch freshness로 사용하지 않음 |
| `sortBasis` | `PUBLISHED_INSTANT`, `FILED_DATE`, `VERIFIED_FETCH_INSTANT`, `UNKNOWN` | 선택 근거를 응답에 명시 |

정렬은 확인 가능한 정확한 발행 instant, 날짜-only 접수일 bucket, 검증된 fetch instant, unknown 순으로 내림차순 그룹화한다. 날짜-only는 해당 날짜 그룹 안에 놓되 정확한 시각으로 보이게 하지 않는다. 그룹·시간이 같은 항목은 `source + externalId` 안정 키로 순서를 고정한다. UI는 각각 “발표시각 확인”, “접수일만 확인”, “발행시각 미확인”처럼 precision을 드러내며, update/translation 시각으로 재정렬하거나 `fetchedAt`을 대체하지 않는다. 응답 및 UI가 같은 timezone/precision metadata를 사용해야 한다.

설계 acceptance는 [`disclosure-feed-time-semantics.v0.json`](../fixtures/disclosure/disclosure-feed-time-semantics.v0.json)을 따른다. KST 기본 날짜와 query window metadata가 API/UI/API 문서에 연결됐는지는 저장소 정적 gate가 검사한다. 이는 item별 원천 시각 정밀도, fetch provenance, 안정 정렬 및 운영 데이터 결과의 runtime acceptance가 아니다.

Fixture 추적 ID: `DFT-01` KST 자정 기본 날짜, `DFT-02` 자정 직전 instant, `DFT-03` KST 날짜 반개구간, `DFT-04` rolling hours, `DFT-05` 날짜-only 접수일, `DFT-06` 저장시각과 수집시각, `DFT-07` 검증된 fallback만 허용, `DFT-08` 동률 안정 정렬, `DFT-09` 번역/수정시각 분리, `DFT-10` 날짜/시간 모드 메타데이터 구분.

### 다음 제품 개선 — 출처별 수집 상태와 저장 조회 상태 제공

사용자가 빈 화면을 “공시 없음”으로 오해하거나 stale 저장 데이터를 “최신 수집 완료”로 오해하지 않도록, query status와 source coverage를 분리한다. API 계약 제안:

```ts
type DisclosureSourceCoverage = {
  source: string;
  sourceClass: "OFFICIAL_DISCLOSURE" | "EXCHANGE_FEED" | "THIRD_PARTY_RSS";
  configuredState: "ENABLED" | "DISABLED" | "UNKNOWN";
  latestAttempt: {
    runId: string;
    fetchState: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
    persistState: "SUCCESS" | "PARTIAL" | "FAILED" | "NOT_RUN";
    observedAt: string;
    itemCount: number | null;
    rawItemCount: number | null;
    deduplicatedItemCount: number | null;
    upsertAffectedRowCount: number | null;
    snapshotStored: boolean | null;
    pageCount: number | null;
    failureCode: string | null;
  } | null;
  lastSuccessfulPersistAt: string | null;
  rangeCoverage: "ENUMERATED_PROVIDER_RESPONSE" | "PARTIAL" | "UNKNOWN";
};
```

필드 의미는 다음 경계를 지킨다.

- `queryStatus`는 `DB_QUERY_COMPLETE`, `NO_MATCHING_STORED_ROWS`, `DB_QUERY_FAILED`처럼 이번 저장소 조회 성공 여부만 말한다. `NO_MATCHING_STORED_ROWS`는 원천 공시가 없다는 의미가 아니다.
- `sourceCoverage[]`는 선택 기간/출처와 겹치는 마지막 수집 run, fetch와 persist 결과, 설정/미설정 및 source가 보장하는 열거 범위만 나타낸다. run 기록이 없으면 `UNKNOWN`; 빈 RSS 응답은 성공+0건이어도 provider가 제공한 그 feed response에 대해서만 `ENUMERATED_PROVIDER_RESPONSE`다. fetch 자체가 실패하면 관측 가능한 feed 분모가 없으므로 item/raw/deduplicated/upsert count는 null이어야 하며 0으로 해석하지 않는다. fetch 성공 후 persist 실패는 fetch 성공과 persist 실패를 각각 표시한다.
- DART `list.json`은 공식 [`공시검색 개발가이드`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001)의 `page_no/page_count` 요청 및 `total_page` 응답 분모와 `status`를 확인해야 한다. 가이드는 기본 `last_reprt_at=N`이 정정보고서를 포함한 전체 제출 보고서를 검색한다고 설명한다. 날짜 범위·페이지 누계가 맞지 않으면 `COMPLETE`로 승격하지 않는다. 이는 API가 반환하는 모집단의 완전성이지 전체 시장 공시 전부의 무오류 보장이 아니다.
- 현재 `fetchOpenDartToday()`는 페이지 echo, page size 및 모든 page의 `total_count`/`total_page` 일치를 검사하고, raw row·unique receipt·duplicate·missing count를 산출한다. 공식 빈 결과 `013`은 정상 0건으로 구분하고, 분모 불일치는 `reconciliationState: PARTIAL`로 DART automation run status에 반영한다. 이 검증은 해당 조회의 페이지/receipt 분모만 다루며 correction lookback, durable source-run manifest, DART 행의 disclosure API 저장 연결까지 완료한 것은 아니다.
- KRX KIND 오늘의공시 RSS는 확인 가능한 feed 응답 단위로만 coverage를 표시한다. RSS 최대 건수/기간 창이 전체 과거 공시 목록을 보장한다고 가장하지 않는다. 제3자 RSS는 각 provider feed가 반환한 범위만 표시하며 “전체 뉴스” 표현을 쓰지 않는다.
- `fetchedAt`은 성공한 특정 source response의 fetch timestamp에서 가져온다. article `updated_at`이나 translation/update timestamp를 fetch 시각으로 재명명하지 않는다. 운영 시각을 연결할 source run/response가 없으면 `null/UNKNOWN`으로 유지한다.
- RSS automation 요약은 원본 응답 항목 수, provider 내부 중복 제거 후 article 후보 수, upsert가 반환한 영향 행 수, 원문 snapshot 저장 여부를 분리한다. 기존 top-level `inserted`는 호환성 필드이며 실제 의미는 새 행 수가 아니라 upsert 영향 행 수다. 빈 응답도 snapshot 저장이 성공해야 persist 성공으로 보고, snapshot 저장 실패는 persist 실패로 기록한다.
- 공개 응답에는 내부 URL query credential, 원문 payload, 내부 stack/person/role, webhook 및 관리자 오류 전문을 넣지 않는다. 외부 읽기 GET을 추가·변경하면 무인증 공개 범위, OpenAPI, route inventory, API surface audit를 함께 갱신한다.
- `/api/disclosures`는 RSS raw item을 timestamp 정밀도 판정에만 사용하고 public item DTO에서는 제거한다. 데이터베이스 필터도 JSONB cast 대신 raw JSON 텍스트에서 발행일 필드만 추출한다.

#### 구현 전환 단계와 닫힘 조건

| 단계 | 작업 | 완료 증거 | 실패/중단 동작 |
|---|---|---|---|
| F0 현황 기준선 | source별 official/third-party 분류, expected scope, 사용 endpoint, 실제 scheduler/caller, query table, 성공·실패 기록 위치를 고정 | 저장소·배포 경로를 대조한 source inventory 및 unresolved external owner 목록 | 호출 흔적이 없다는 이유만으로 외부 collector 없음 또는 source 미사용으로 확정하지 않음 |
| F1 수집 run 기록 | source fetch, parser/enumeration, persist의 상태를 한 source-run 단위로 기록하고 0건·미설정·건너뜀·부분 실패 구분 | source/run ID, 요청 window, expected/observed pages/items, snapshot hash/ref, fetch/persist 상태, 시작/완료시각, 안전한 error code를 재현 | run이 유실되거나 페이지/receipt 분모 불일치면 `UNKNOWN/PARTIAL`; 저장물만으로 성공 판정 금지 |
| F2 국내 공식 피드 저장 연결 | KIND adapter를 source-run 계약과 기존 cron/write lock에 연결할 설계 검토; 언론 RSS는 각각의 제공조건·목적·인용/보존 권리 승인 후 별도 opt-in | 소스별 rights evidence, single-source dry-run, disabled/configured/failure/recovery fixture, 중복 receipt parity | 관리자 preview는 계속 read-only; 하나의 feed 실패가 다른 source 또는 기존 rows를 지우지 않게 함 |
| F3 coverage API/UI | `/api/disclosures`에 저장 query와 source coverage를 별도 노출하고 UI 문구를 같은 의미로 맞춤 | empty-vs-failure, stale-success, page completion, partial persist, current query 결과 및 API 문서/inventory parity | coverage 신뢰 불가면 저장 rows를 지우지 않고 최신성 `UNKNOWN`; 완료/전체 수집 문구 차단 |
| F4 운영 acceptance | shadow 기간의 source별 누계·중복·late arrival·정정·장애/복구 비교 및 owner 승인 | 고정 기간/분모 report, reviewer, 사전 승인한 source별 SLO 및 rollback | source provider 범위 밖 completeness를 주장하거나 측정 전 임계값을 임의 설정하지 않음 |

수용 fixture는 [`disclosure-source-coverage.v0.json`](../fixtures/disclosure/disclosure-source-coverage.v0.json)에 둔다. `DSC-01`–`DSC-10`은 빈 성공, run 부재, preview, persist 실패, 미설정, RSS window, DART page/정정 분모, fetch timestamp, 다중 출처 부분 실패를 고정한다. `DSC-11`–`DSC-16`은 reconciliation manifest 분모·정정 watermark·master/crosswalk/rights dependency와 반복 관측/다중 source scope를, `DSC-17`–`DSC-19`는 credential-free query scope 정규화와 미등록 provider의 unresolved 경계를 고정한다. `DSC-20`–`DSC-22`는 다운로드 snapshot과 URL 복사 맥락 및 source별 UNKNOWN 보존을, `DSC-23`–`DSC-24`는 late receipt/correction 뒤 as-of assertion 재개방을 고정한다. OpenDART 현재 query profile은 실제 `fetchOpenDartToday()` request와 [공식 list.json 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001)의 parameter/default 설명을 구분해 기록한다. 현재 sourceCoverage는 요청 시간 구간과 겹치는 automation run만 읽어 기존 자동화 요약을 부분 projection한다. RSS는 시작/완료 시각이 queryWindow와 겹치는 실행 중 최신 run만 반환한다. 이는 provider query window, historical RSS feed 범위, correction watermark, rights/master revision을 입증하지 않으므로 rangeCoverage는 UNKNOWN이다. durable source-run manifest와 coverage acceptance는 미완료이며 운영 DB를 갱신하지 않는다.

### 다음 제품 개선 — 조회 결과 JSON snapshot과 URL 복사의 의미 분리

화면의 `JSON 파일 저장`은 조회 결과 snapshot으로 동작한다: `schemaVersion`, snapshot 생성시각(`exportedAt`), 요청 필터(`source` 및 날짜/시간 조건), API가 반환한 `queryStatus`, 정확한 `queryWindow`/`displayTimezone`, 해당 응답의 pagination(`page`, `pageSize`, `hasMore`), per-source `sourceCoverage`, `total`, 실제 반환 건수(`returned`)와 `items`를 저장한다. UI는 API의 `page`/`pageSize`를 사용해 100건 단위로 조회하고 이전/다음 페이지를 제공한다. 출처·기간·날짜 필터를 바꾸면 1페이지부터 다시 조회하며 페이지 정보와 전체 `total`을 함께 표시한다. rolling-hours 페이지는 첫 응답의 `queryWindow.to`를 `asOf`로 전달해 같은 half-open query window를 유지하고, filter가 바뀌면 기준시각을 새로 잡는다. API는 `asOf`를 hours 모드의 현재시각 이하 canonical ISO timestamp로 제한하고, 기준시각보다 미래인 값과 date 조회의 `asOf`는 거부한다. API offset 상한은 1,000,000이며, 다음 페이지 offset이 이를 넘으면 UI는 다음 버튼을 비활성화하고 `API 조회 상한`을 표시한다. `hasMore=true`이면 snapshot은 전체 query 결과가 아닌 현재 페이지 일부이며 화면에도 그 사실을 표시한다. 빈 결과도 query status와 사람이 읽는 설명을 화면에서 제공하고 빈 snapshot으로 다운로드할 수 있다. `sourceCoverage`의 UNKNOWN/null 값은 그대로 둔다. 다른 source의 성공을 선택 source에 빌려주지 않고, `DB_QUERY_COMPLETE`는 저장소 조회 완료만 뜻하며 source 완전성으로 승격하지 않는다.

화면의 “출처별 최근 수집·저장 상태”는 API가 선택한 queryWindow와 겹치는 최근 run을 기준으로 출처명과 fetch/persist/range 상태를 한국어로 표시한다. 일치하는 run이 없으면 최근 시도를 미확인으로 보여주며, 상태 안내는 원천 전체 공시 범위나 마지막 저장 성공 시각을 보증하지 않는다고 명시한다. `ENUMERATED_PROVIDER_RESPONSE`도 provider 응답 단위의 열거만 뜻한다.

기존 복사 버튼은 원문 URL 문자열을 줄바꿈으로 복사하며 화면 이름도 “원문 링크 복사”로 표시한다. 다운로드는 query metadata와 source coverage를 포함하는 `daily-disclosure-query.v1` JSON snapshot을 저장한다. 링크 복사에는 metadata를 붙이지 않는다. JSON snapshot의 `items`가 비어 있어도 `queryStatus`와 coverage가 포함된 파일을 받을 수 있다.

수용 기준은 `DSC-20`–`DSC-24`다. JSON snapshot에 query status/window/source coverage가 보존되고, 빈 결과에서도 다운로드할 수 있다. 링크 복사 버튼은 URL 전용 동작을 표시하며 링크만 복사한다. source-specific fields는 기존 API 권한 경계를 따른다. 구현된 JSON snapshot은 `page`, `pageSize`, `hasMore`, `exportedAt`을 보존하며 `hasMore=true`이면 화면에서 일부 페이지임을 표시한다. 현재 source coverage는 마지막 market-rss summary 기반 부분 projection이고, DART/SEC run 및 source-run manifest는 미완료다. `latestAttempt`는 실제 source result가 summary에 있을 때만 반환하며, 한 source의 성공을 다른 source에 대입하지 않는다. `DSC-23`–`DSC-24`는 이전 pass가 당시 `OBSERVED_STABLE`/`RECONCILED_AS_OF`였다는 사실을 보존하면서, 그 뒤 late receipt/correction 관측 시 current coverage와 해당 negative evidence를 무효화하고 새 reconciliation pass를 요구한다. trigger는 정확한 source/query/window scope에 한정하고 다른 source assertion은 자동 무효화하지 않는다.

## 목표

사용자가 지정한 기준일의 공시·RSS를 발행/접수 시각 내림차순으로 확인한다.

1. 일별 전체 보기: 지원 가능한 모든 출처를 하나의 시간순 목록으로 표시한다.
2. 출처별 보기: `DART`, `SEC_EDGAR`, `STOCKTITAN`, `NASDAQ` 등 출처 하나를 선택해 필터링한다.
3. 각 항목에서 제목, 요약, 내용 또는 본문 발췌, 원문 링크, 티커·회사명을 확인한다.
4. 원문이 없는 항목은 내용을 추정해 만들지 않고 `contentStatus`로 표시한다.
5. 모든 항목은 사용자가 한 번에 복사할 수 있어야 한다.

## 공식 데이터 범위와 한계

### OpenDART

OpenDART `list.json`은 접수일자, 회사명, 보고서명, 접수번호 등 공시 목록 메타데이터를 제공한다. 기간과 페이지를 지정해 일별 목록을 끝까지 순회한다. 목록 응답만으로는 모든 공시 본문이 내려오지 않으므로 `rcept_no`를 기준으로 원문 문서를 별도 조회·저장한다.

### SEC EDGAR

SEC `data.sec.gov/submissions/CIK##########.json`은 회사별 제출 메타데이터를 제공하며, EDGAR 검색 RSS는 검색 조건별 피드다. 따라서 전체 일별 수집은 회사별 RSS만 합치는 방식이 아니라 제출 메타데이터/EDGAR 원문 경로를 기준으로 수집하고, RSS는 별도 출처로 보존한다. SEC 접근 정책에 맞는 식별 가능한 User-Agent와 호출 제한을 적용한다.

### 제3자·시장 RSS

StockTitan, NASDAQ 등 RSS는 해당 피드가 제공하는 범위만 보장한다. “모든 인터넷 뉴스”를 의미하지 않으며, 원문·요약의 존재 여부와 피드 수집 시각을 함께 저장한다.

## 통합 데이터 계약

기존 테이블을 우선 재사용한다. 중복 저장을 피하기 위해 통합 조회 모델은 다음 필드를 제공한다.

```ts
type DailyDisclosureItem = {
  id: string;
  source: string;
  sourceType: "DART" | "SEC_EDGAR" | "RSS";
  externalId: string;
  title: string;
  summary: string | null;
  content: string | null;
  contentStatus: "FULL" | "EXCERPT" | "METADATA_ONLY" | "UNAVAILABLE";
  link: string | null;
  tickers: string[];
  companyNames: string[];
  publishedAt: string | null;
  filedAt: string | null;
  fetchedAt: string | null;
  sortBasis: "PUBLISHED_INSTANT" | "FILED_DATE" | "VERIFIED_FETCH_INSTANT" | "UNKNOWN";
  sourceSnapshotId: string | null;
};
```

`publishedAt`는 피드가 실제 제공한 발행 instant다. `filedAt`은 DART 접수일 또는 SEC 제출일이며 date-only 값은 timestamp로 바꾸지 않는다. 응답 `sortBasis`는 실제 정렬 근거를 표시하고 `fetchedAt`이 연결되지 않으면 null을 유지한다.

## 저장 구조

| 계층 | 저장 위치 | 책임 |
|---|---|---|
| 피드 원문 | `market_rss_fetch_snapshots`, `sec_source_snapshots` | URL·헤더·원본 응답·해시 보존 |
| RSS 정규화 | `market_rss_articles` | 제목·요약·링크·발행일·출처·중복키 |
| SEC 목록 | `sec_submissions` | accession·CIK·form·제출일·원문 문서 식별 |
| SEC 본문 | `sec_filing_documents` | 인덱스 HTML·주 문서 HTML·정규화 텍스트 |
| 통합 공시 | `filings` | 기존 DART·SEC 공통 분석/알림 이력 |
| 종목 연결 | 종목 유니버스 및 뉴스 티커 캐시 | 티커·회사명 정규화와 검증 |

### DART date-only row 저장 차단과 구현 전제

현재 `runDartAutomation()`은 OpenDART의 당일 page/reconciliation 결과를 alert 후보로 변환해 알림만 전달한다. `app/api/disclosures`는 기존 `filings` 행을 읽지만, 코드 저장소에서 활성 DART insert/upsert writer는 확인되지 않았다. 과거 `saveDartItems()` 저장 경로는 `lib/alerts.ts` 안에서 주석 처리돼 있다. 따라서 현재 DART cron 성공은 disclosures 행이 저장됐다는 증거가 아니며 `persistState: NOT_RUN`이 맞다.

`filings.published_at`은 V1 schema에서 `NOT NULL`이고 OpenDART `rcept_dt`는 `YYYYMMDD` 날짜다. 접수일을 자정 timestamp나 fetched/updated 시각으로 위장하지 않으려면 현재 `filings` 계약만으로는 DART date-only row를 정직하게 저장할 수 없다. 코드상 조회 consumer는 `/api/disclosures`, `/api/dart/history`, `lib/alerts.ts`, Telegram webhook에서 확인되며, 마지막 두 경로에는 기존 legacy DART/SEC writer와 reader가 일부 주석으로 남아 있다. nullable 전환 시 이 소비자들의 ordering/nullable DTO를 함께 처리해야 한다.

검토 가능한 권고안은 additive forward migration으로 `filings.published_at`을 nullable로 바꾸고 `fetched_at TIMESTAMPTZ NULL`을 추가하는 것이다. 활성 DART writer는 `external_id=rcept_no`, `published_date_seoul=rcept_dt`, `published_at=NULL`, `fetched_at=해당 OpenDART fetch response 시각`으로 upsert한다. API item은 `filedAt`을 날짜로, `publishedAt`을 null로, `fetchedAt`을 검증된 저장 fetch 시각으로 반환한다. 정렬은 `published_date_seoul`을 사용하고 legacy history endpoint는 nullable ordering을 명시한다. raw response 전체를 `filings`에 복사하지 않는다. 저장 후 source run summary는 실제 upsert 결과를 반영하며 fetch 성공만으로 persist 성공 처리하지 않는다.

이 migration은 현재 생성·적용하지 않는다. 결정 register의 `KR-DB-DRIFT-01`은 환경별 schema inventory, 백업/복구 rehearsal, 승인된 additive migration dry-run과 named DB owner 승인 전 migration/import를 금지한다. 그 evidence bundle이 준비되지 않으면 DART persist는 구현 게이트로 남고, API의 비어 있는 결과를 원천에 공시가 없다는 뜻으로 사용하지 않는다.

원문은 `source + externalId` 또는 `accession`을 유일키로 중복 방지한다. 원문이 갱신되면 기존 스냅샷을 삭제하지 않고 새 해시와 수집 시각으로 보존한다.

## API 설계

### 목록

`GET /api/disclosures?q=acme&date=YYYY-MM-DD&source=all&page=1&pageSize=50` 또는 `GET /api/disclosures?hours=1&asOf=2026-11-04T01:00:00.000Z&page=1&pageSize=100`

- `q` (최대 120자): 저장된 query window 안에서 제목·요약·본문 발췌·회사명·티커·접수번호를 대소문자 구분 없이 부분 검색한다. 검색은 source/date/hour 조건에 적용되고 `total`, page, `hasMore`는 검색 결과 기준이다. 제어문자와 초과 길이는 `INVALID_QUERY`로 거부한다. `position(lower(...))` 검색은 `%`/`_`를 와일드카드가 아닌 문자 그대로 처리한다. 검색된 bodyExcerpt는 기존 API DTO 범위 안에만 포함하고 저장 raw payload는 반환하지 않는다. `q`가 비어 있으면 기존 조회와 동일하다. 검색 결과가 0건이면 화면은 query 안의 저장 데이터 0건이라는 뜻으로만 안내하며 원천 전체에 공시가 없다고 표현하지 않는다.
- `source=all`: 저장된 DART·SEC 제출목록·등록된 RSS 통합
- `source=DART|SEC|SEC_EDGAR|STOCKTITAN|NASDAQ`: 출처별 조회. `SEC`는 `sec_submissions` 접수일 조회, `SEC_EDGAR`는 SEC Atom RSS다.
- 기본 정렬: timestamp precision 그룹(`PUBLISHED_INSTANT`, `FILED_DATE`, verified fetch, unknown) 순서 후 그룹 내림차순
- 선택 query window에 대한 응답: `items`, `total`, `page`, `pageSize`, `date`, `source`, `sort`, item별 `sortBasis`, `queryWindow`, `sourceCoverage`. rolling-hours pagination은 첫 응답의 `queryWindow.to`를 `asOf`로 재사용한다. `q`를 포함한 검색어도 페이지 전환과 JSON snapshot에서 동일하게 유지한다.
- SEC submissions와 date-only DART rows는 기준일 조회에 포함하고 rolling-hour 조회에서는 제외한다. SEC row `fetchedAt`은 accession이 원문 submission snapshot 안에서 확인된 경우에만 제공한다. SEC `sourceCoverage`는 요청 window와 겹치는 `sec-realtime` run summary에서 시도 집계를 읽되 전체 source range는 UNKNOWN이다. DART sourceCoverage는 page reconciliation을 나타낼 수 있지만 현재 cron은 alert-only라 persistState가 NOT_RUN이고 기존 `filings` row의 DART 자동 저장은 미구현이다.
- `/disclosures`에서 조회가 완료됐지만 저장 결과가 0건이면 출처별 fetch/persist 상태 영역을 펼쳐 보여준다. 이 영역은 선택한 조회 window와 겹친 실행 요약만 표시하며 원천 전체가 비어 있거나 수집이 완전하다는 뜻은 아니다.
- `/disclosures` 화면은 저장된 각 item의 출처·회사/티커·요약/발췌·원문 링크를 표시하며, 발행 instant·date-only 접수일·시각 미확인 상태를 구분한다. raw source payload는 목록 DTO에 포함하지 않는다.

### 상세

`GET /api/disclosures/:id`

- 통합 항목과 출처 원문 식별자를 반환한다.
- 원문이 없으면 링크와 메타데이터를 반환하고 본문을 만들어내지 않는다.

### 복사 기능

- 화면에는 목록을 표시하지 않고 선택 조건에 해당하는 원문 URL 문자열만 줄바꿈으로 구분해 복사한다. JSON 구문, RSS DB 저장 시각, 조회 범위, 출처, 제목 등 다른 값은 클립보드에 넣지 않는다.
- `전체 링크 복사` 버튼을 제공한다.
- `미국 RSS 링크 복사` 버튼은 현재 조회 조건에 포함된 항목 중 `SEC_EDGAR`, `NASDAQ`, `NASDAQ_TRADER`, `STOCKTITAN`, `GLOBENEWSWIRE` 출처의 원문 URL 문자열만 복사한다.
- 원문 링크가 없는 항목은 복사 결과에서 제외한다.
- `navigator.clipboard.writeText`를 우선 사용하고, 권한이 없거나 비보안 컨텍스트인 경우 선택 영역 기반 fallback을 사용한다.
- 복사 성공·실패를 버튼 상태와 접근성 라이브 영역으로 알린다. 원문 HTML은 복사하지 않고 태그를 제거한 텍스트만 복사한다.

### 2026-11-03 RSS 링크 필드 수정

- **근본 원인**: `/api/disclosures`는 RSS 항목의 원문 주소를 `link` 필드로 반환하지만 복사 UI가 존재하지 않는 `url` 필드를 읽었다. 출처별 조회에는 항목이 있어도 복사 배열에서는 모든 URL이 걸러져 0건으로 표시됐다.
- **수정/재발 방지**: 전체 링크 및 미국 RSS 링크 복사를 API 계약과 같이 `item.link`를 읽도록 수정하고 항목 타입에 `link`를 명시했다. 회귀 테스트 fixture도 운영 API와 동일한 `link` 형태만 사용한다.
- **영향 범위**: 일별 공시 화면의 전체 링크 복사 및 미국 RSS 링크 복사. 조회·저장 API는 변경하지 않는다.
- **운영 근거**: 운영 `/api/disclosures?hours=24&source=STOCKTITAN` read-only 조회에서 866건을 받았고 첫 항목은 `source=STOCKTITAN`, `link=https://...`를 포함하며 `url` 필드는 없었다.
- **검증 결과**: 화면 회귀 테스트 1파일 4개 통과. `npm run deploy:verify` 통과: 전체 테스트 299파일 통과·1파일 제외, 1,541개 통과·3개 제외; 타입검사, 문서/API/인증/KIS/cron 감사, production build, standalone `/charts`·API smoke, Chrome 데스크톱·모바일 hydration 검증 통과.
- **배포/운영 확인**: 커밋 `3e4ced86a143569a4e7a33a20f836b35ccce9384`를 `oci`에 push했다. GitHub Actions `Deploy OCI` run `41558892724` 성공. 배포 후 `/api/health`는 `ok`, `/disclosures`는 HTTP 200을 반환했다. 운영 StockTitan 조회에서 866건 모두 `link`가 있고 `url`은 0건임을 재확인했으며, 배포된 JavaScript에서도 `link` 매핑과 링크 건수 안내를 확인했다.
- **커밋/푸시/배포**: 코드 수정과 문서화까지 완료했다. 후속 문서 기록 커밋도 배포 전에 전체 검증한다.
- **남은 위험**: API 응답에 빈 `link`가 있는 개별 항목은 복사하지 않는다.

### 2026-11-03 링크만 복사 배포

- **목적/범위**: 일별 공시 화면의 복사 동작을 URL 문자열만 줄바꿈으로 전달하도록 바꾸고, 버튼 이름과 회귀 테스트를 일치시켰다.
- **변경 파일**: `components/daily-disclosures-page.tsx`, `components/daily-disclosures-page.test.tsx`, 본 설계 문서.
- **검증 결과**: `npm run deploy:verify` 통과. 전체 테스트 299파일 통과·1파일 제외, 1,541개 통과·3개 제외; 타입검사, 문서/API/인증/KIS/cron 감사, production build, standalone `/charts`·API smoke 및 Chrome 데스크톱/모바일 hydration 검증 통과.
- **배포 결과**: 커밋 `5a934c233c594c32ec7e6e5211623a92c3aa9b4e`를 `oci`에 push했다. GitHub Actions `Deploy OCI` 실행 `41552370280` 성공, 운영 `/api/health`는 `status=ok`, `/disclosures`는 HTTP 200이며 배포 JavaScript에서 `전체 링크 복사`·`미국 RSS 링크 복사` 문구를 확인했다.
- **커밋/푸시/배포**: 수행 완료. 운영 health 응답은 현재 `status`와 요청 상태만 제공하므로 commit/build/Flyway 상세값은 이 endpoint에서 확인하지 않았다.

### 관리자·자동화

- 수집은 출처별 collector가 담당한다.
- 파싱·정규화는 source adapter가 담당한다.
- 저장은 repository가 담당한다.
- 일별 누락 점검과 페이지 순회는 orchestration job이 담당한다.
- 관리자 진단 API는 출처별 마지막 성공 시각, 페이지 수, 항목 수, 실패 원인을 반환한다.

## 티커·회사명 매핑

1. SEC: CIK·SEC 회사 마스터의 ticker/company 매핑을 우선 사용한다.
2. DART: `corp_code`, 종목코드, 회사명을 분리해 저장한다.
3. RSS: 제목·본문에서 추출한 후보는 검증 캐시와 종목 유니버스에서 확인된 경우만 `tickers`에 넣는다.
4. 매핑 실패 항목도 숨기지 않고 회사명 또는 `ticker=null` 상태로 표시한다.

## 누락 방지·운영 규칙

- DART는 `total_page`까지 순회하고 접수일 경계를 확인한다.
- SEC는 날짜 경계까지 제출 메타데이터를 확인하며 accession으로 중복 제거한다.
- RSS는 각 피드의 마지막 성공 cursor/시각을 기록하고, 실패 시 기존 데이터를 삭제하지 않는다.
- 기준일에 데이터가 0건이면 정상 빈 결과와 수집 실패를 구분해 `coverage`와 실행 이력에 표시한다.
- 시간대는 저장 UTC, 화면 표시 KST를 기본으로 한다.
- 조회 API는 캐시된 DB만 읽고 외부 출처를 직접 호출하지 않는다.

## 단계별 구현 순서

1. 기존 저장 테이블의 필드·인덱스와 출처별 중복키를 점검한다.
2. DART·SEC·RSS adapter의 공통 정규화 타입과 repository를 만든다.
3. 통합 일별 조회 서비스와 출처 필터 API를 추가한다.
4. 기준일·출처·시간순 정렬 테스트와 원문 미존재 테스트를 추가한다.
5. 뉴스/공시 페이지 또는 차트 모달 뉴스 탭에 연결한다.
6. 관리자 진단 API와 수집 coverage를 운영 런북에 추가한다.

이 설계안만으로 기능이 구현된 것으로 간주하지 않는다. API·DB·화면·자동화·테스트가 모두 연결된 뒤 기능 인벤토리와 운영 문서를 갱신한다.
