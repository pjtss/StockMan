# Stockman SEC·RSS 호재 영구 저장 시스템 — 현황 분석 및 구현 계획

작성일: 2026-11-06  
범위: 실제 코드·DB 스키마 조사와 이벤트 ledger 구현 결과. 빌드와 전체 테스트는 통과했다. 격리 DB에 V166을 적용했으나, HTTP smoke용 앱 기본 테이블이 부족해 health 503을 반환했으므로 저장 API 통합 확인은 미완료다. 운영 DB 접속·migration·배포는 아직 수행하지 않았다.

## 1. 요약

Stockman에는 SEC 제출정보, SEC 공시 원문, RSS 원문/응답 스냅샷, 규칙 기반 호재 분류, Codex 직접 분석 결과를 저장하는 PostgreSQL 테이블과 수집 파이프라인이 있다. 기존 테이블을 원본으로 유지하고 새 공통 event/document/analysis/history/metric ledger를 연결했다.

기존 저장 단위는 개별 RSS 항목 또는 SEC accession이다. V166은 source table을 교체하지 않고 공통 이벤트 ID와 문서 연결, 분석 revision, 변경 이력을 추가한다. 새 API와 cron 단계는 기존 응답·수집 경로를 보존하는 방향으로 연결한다.

## 2. 프로젝트와 저장 구조

| 항목 | 확인 결과 및 코드 근거 |
|---|---|
| 프레임워크·언어 | Next.js 15 App Router, TypeScript, React 19. 진입 및 API 경로는 `app/`, 공유 도메인 로직은 `lib/`에 있다. 의존성과 명령은 `package.json`에 정의된다. |
| DB·ORM | PostgreSQL, `pg`, Drizzle ORM. 런타임 테이블 정의는 `lib/schema.ts`, 순서가 있는 SQL migration은 `db/migration/V*__*.sql`, 운영 구조 안내는 `db/README.md`에 있다. DB 연결은 `lib/db.ts` 경계로 접근한다. |
| SEC 제출정보 | `sec_companies`는 CIK, 회사명, ticker/exchange 배열을 저장한다. `sec_submissions`는 accession을 PK로 사용하고 CIK, form, filing/report date, `acceptance_datetime`(문자열), 공식 URL, JSON 원본 및 규칙 분류를 저장한다. 정의는 `V40__sec_edgar_pipeline.sql`, 저장은 `lib/sec-edgar-repository.ts:syncSecCompany`다. |
| SEC 이벤트 분류 | `sec_filing_events`는 accession을 PK로 하고 category/direction/score/terms, 발췌문, 조달 금액(`DOUBLE PRECISION`), 희석위험, 내부자 행위, Discord 전달 상태를 저장한다. 이는 공시별 분류/처리 상태이며 범용 기업 이벤트나 분석 revision 테이블은 아니다. |
| SEC 원문 보관 | `sec_filing_documents`에 accession별 index HTML, primary HTML/text와 URL을 저장한다. `sec_source_snapshots`에는 제출정보 등 SEC 응답 전문을 content hash로 보관한다. 수집/원문 분석 경로는 `lib/sec-edgar-repository.ts`, 문서 취득은 `lib/sec-primary-document.ts`, `lib/sec-filing-collection.ts`, 파서 계열은 `lib/sec-document-parser.ts` 및 `lib/sec-parser-router.ts`다. |
| RSS 기사 | `market_rss_articles`는 `(source, external_id)` unique로 정규화 제목/요약/본문/원문 payload, snapshot FK성 ID, ticker, 규칙 분류, 금액/희석, URL, 게시시각, 번역/알림 상태를 보관한다. 정의는 `lib/schema.ts`, 시작 migration은 `V13`, 누적 컬럼은 이후 migration에 있다. |
| RSS 원문 snapshot | `market_rss_fetch_snapshots`는 출처별 응답 URL/status/headers/raw body/hash/item count/fetched_at을 저장한다. `(source, content_hash)`로 같은 응답 바이트를 중복 보관하지 않는다. 기사는 `source_snapshot_id`를 통해 수집 응답을 가리킨다. |
| RSS 호재 후보 | `market_rss_bullish_articles`는 기사와 별도 복제된 분류/표시 projection이다. `(source, external_id)`와 `source_article_id`에 unique 제약이 있다. `syncMarketRssBullishArticles`는 분류 부적격으로 바뀐 연결 행을 삭제할 수 있으므로 이 테이블을 법적·영구 이벤트 이력의 유일 원장으로 사용하면 안 된다. `V135`, `lib/market-rss-bullish-repository.ts` 참조. |
| Codex RSS 분석 | `market_rss_llm_analyses`는 `(source, external_id, revision_hash)` unique를 사용해 분석 revision과 기사 snapshot, POSITIVE 등 판정, ticker, 근거 인용, 위험, confidence, 전달 상태를 누적한다. 별도 provider 호출이 아니라 로컬 운영 도구에 Codex 분석 결과를 기록하는 구조다. `V141`, `scripts/local-rss-bullish-report.mjs`, `docs/operations/llm-rss-bullish-report-runbook.md` 참조. |
| SEC Codex 분석 큐 | `sec_codex_analysis_queue`는 accession별 상태/시도/결과 JSON을 보유한다. accession 1건당 현재 결과 슬롯이므로 RSS처럼 revision을 누적하는 모델과 다르다. `V142`, `lib/sec-edgar-repository.ts:completeSecCodexAnalysis` 참조. |
| 거래소 정보 | 원본 수집 경로는 기존 정책을 유지한다. 신규 ledger materializer는 `us_common_stock_universe`에서 enabled, `instrument_type='COMMON_STOCK'`, NASDAQ/NYSE/AMEX market을 확인하며 불일치는 materialize하지 않는다. |
| 수치 정밀도 | 현재 조달금액 컬럼은 `DOUBLE PRECISION`이다. 제안된 정확한 금액/주식 수 계산 요구를 만족하는 원장 수치 타입으로 볼 수 없다. 새 정량 구조에서는 `NUMERIC/DECIMAL` 또는 십진 문자열과 통화·단위·기준일·분할보정 metadata를 써야 한다. 기존 컬럼을 임의 변환하지 않는다. |

## 3. 수집·배치·오류 구분

### SEC

- Atom/RSS 8-K 피드는 `lib/sec-edgar-rss.ts`에서 가져와 RSS 공통 파서 및 `lib/market-rss-pipeline.ts:ingestMarketRssArticles`를 통해 `market_rss_articles`에 들어간다.
- 별도 Submissions 경로는 `app/api/cron/sec-edgar/route.ts`에서 CIK별 `syncSecCompany`를 호출한다. 설정된 CIK 또는 소형주 유니버스 대상으로 제출정보 upsert, 원문 수집/분석, 선택적 XBRL/알림을 수행한다.
- SEC accession은 `sec_submissions`와 `sec_filing_events`의 식별자다. Acceptance 시각은 문자열로 저장된다. 신규 ledger는 이를 Eastern wall-time으로 검증 후 UTC로 변환하고 event time filter에서 SEC accepted_at 기준으로 사용한다.

### 뉴스 RSS

- 출처 어댑터: `lib/stocktitan-rss.ts`, `lib/globenewswire-rss.ts`, `lib/sec-edgar-rss.ts`, registry `lib/market-rss-sources.ts`.
- 수집/분류/원문 보관/upsert: `lib/market-rss-pipeline.ts`. DB conflict key는 `(source, external_id)`이며 재수집 때 내용 및 분류 필드를 갱신한다. 따라서 source 기사 row는 최신 projection이고 변경 전 값 전체의 버전 원장은 아니다. 원문 응답 snapshot과 Codex 분석 revision은 별도 보존된다.
- 각 RSS source 수집·저장 실패를 격리하고 `ingestFailureCount`로 집계한다. `lib/market-rss-cron-status.ts`는 실패를 degraded로 표시한다. RSS 장애는 정상적인 0건과 구별할 기반이 있다.
- 사용자 제공 StockTitan/GlobeNewswire/SEC 문서 API 예시는 실제 운영 소스 검증이 아닌 저장소 코드의 출처 adapter와 일치한다.

### 스케줄

- OCI 스케줄러 경로는 `scripts/oci-cron.sh`에서 `/api/cron/market-rss`와 `/api/cron/sec-edgar`를 호출한다. RSS 전용 실행 스크립트는 `scripts/oci-rss-cron.sh`다. `lib/cron-auth.ts`는 `CRON_SECRET`을 `x-cron-secret` 또는 Bearer 헤더로 검사한다.
- Netlify의 `netlify/functions/sync-filings.ts`는 별도 DART 예약 작업이다. 주석상 SEC RSS는 market-rss, SEC Submissions는 sec-edgar 작업 소유다.
- RSS cron은 `market-rss` feature 설정 및 schedule/lock/automation run을 거친다. SEC cron은 `sec-realtime` 설정 및 schedule/automation run을 거친다. 두 route는 기존 source pipeline 뒤에 별도 best-effort event materializer를 호출하고 automation run 결과에 ledger 상태를 기록한다.
- 실제 OCI crontab 주기, 배포 인스턴스 수, 운영 DB의 현재 migration 적용 상태는 이번 정적 코드 조사만으로 확인하지 않았다.

## 4. 기존 API와 인증 경계

| 경로 | 역할·현재 동작 |
|---|---|
| `GET /api/disclosures` (`app/api/disclosures/route.ts`) | 공개 무인증 조회 API. 저장된 RSS/DART 및 특정 조건의 SEC 제출정보 통합조회. `hours`는 1–24, `asOf`, 날짜, source, 검색, page/pageSize를 지원한다. RSS는 명시적 instant가 확인된 게시 timestamp를 rolling window에 포함하며 날짜 정밀도만 있는 항목은 시각창에서 제외한다. SEC 제출정보는 현재 시간창이 아니라 날짜 조건을 사용한다. SEC `acceptance_datetime`는 이 조회 응답/필터에 사용되지 않는다. |
| `GET /api/market-news` (`app/api/market-news/route.ts`) | `market_rss_articles` 조회. hours 1–24, source, ticker, NEWS/FILING, cursor pagination 지원. 게시시각이 null이면 created_at을 fallback으로 쓴다. ticker 등급/검증 상태/이벤트 history를 조회하는 영구 이벤트 API는 아니다. |
| `GET /api/public/document-catalog` | 정적 `public/document-catalog.json` 카탈로그 검색. DB 문서 원장과는 다른 기능이다. |
| `GET /api/public/market-intelligence` | 저장된 market RSS bullish projection과 SEC 이벤트를 종목 정보와 함께 반환한다. 기존 공개 데이터 계약 재사용 가능성을 살핀다. |
| `GET /api/bullish-rss` | `market_rss_bullish_articles` 목록 API. `POST`는 cron 인증을 검사한다. 세부 권한과 API contract는 route 파일에서 구현을 확인했다. |
| 관리자 SEC 경로 | `app/api/admin/sec-*`는 관리자 UI/debug 성격이다. 외부 공개 조회 API로 복제하지 않는다. |

외부 공시 조회와 공시 저장 경로는 공개 무인증으로 설계한다. `POST /api/events/collect`는 기존 SEC accession 또는 RSS provider+externalId만 받아 기존 원본 자료를 ledger에 멱등 materialize한다. 임의 호재 데이터 저장은 허용하지 않는다. 분석 편집과 내부 collection 상태 진단은 별도 관리자 경계에 둔다. API 표면·OpenAPI 문서·Bearer 감사는 `scripts/api-surface.mjs`에서 확인한다.

## 5. 테스트와 검증 기준

- 테스트: Vitest (`vitest.config.ts`, `npm test`), API route 및 도메인 단위 테스트가 존재한다. RSS parser, dedupe, ingest outcome, timestamp precision, SEC parser/repository 인접 동작을 위한 테스트 파일이 확인됐다.
- migration 정합성: `scripts/operational-schema-migration-audit.mjs` 및 테스트, `scripts/audit-flyway-history.ts`가 있다. DB README는 migration을 새 파일로 추가하고 운영 자동 적용을 금지한다고 명시한다.
- 기존 API 호환성: `app/api/disclosures/route.test.ts`, `app/api/market-news` 관련 테스트와 API surface/doc audits를 확장 검증 대상으로 삼는다.
- validation 상세와 제한은 아래 `8. 구현 및 검증 기록`의 최신 결과를 따른다. 전체 suite는 worker heap OOM을 피해 10개 파일씩 31개 순차 shard로 실행했다.

## 6. V166 적용 전 역할 공백 및 현재 처리

1. 당시 `sec_submissions` + `sec_filing_events`는 SEC accession 단위, `market_rss_articles`는 source article 단위였다. V166은 공통 event identity와 `related_event_id`를 추가하고 여러 source document를 event에 연결한다.
2. `market_rss_bullish_articles`는 분류 결과를 투영하는 행이며 부적격 행 삭제가 가능하다. 영구 audit 원장으로 승격하면 기존 UI/알림 의미와 충돌한다.
3. RSS 원문 응답 스냅샷은 fetch-response 단위이고 SEC 제출 snapshot은 SEC JSON 응답 단위다. V166의 `stockman_event_documents`는 URL/hash/문서유형/게시·접수시각/검증상태를 event와 연결하며 본문은 기존 원문 archive를 참조한다. 개별 exhibit 집합 import는 원문 source가 확인되는 범위에서 추가 연결할 수 있다.
4. SEC 및 RSS 규칙 분류 결과는 기존 row에서 upsert 변경될 수 있다. V166 분석 등급은 revision hash로 append-only 보존하며 source refresh와 관리자 상태/관계 변경은 history에 기록한다.
5. 기존 source 금액의 `DOUBLE PRECISION`은 변경하지 않았다. V166 `stockman_event_metrics`는 `NUMERIC(38,12)`와 단위/통화/split basis/계산식·입력 JSON을 보관한다.
6. RSS item의 external ID는 공급자 id, SEC RSS의 external ID는 feed parser 기준값일 수 있다. SEC canonical key `(CIK, accession)`를 RSS 기사 dedupe 키와 동일시하면 안 된다. 기업뉴스의 공식 URL canonicalization 및 원문 식별 기준도 별도 정의가 필요하다.
7. 기존 이벤트/RSS API는 유지한다. `/api/disclosures` 계약은 바꾸지 않고 신규 `/api/events`가 SEC Accepted와 명시적 RSS 게시 instant를 분리해 status/grade 필터를 제공한다.
8. 원문 보관 기간/용량 정책, SEC/뉴스 외부 재조회 누락 backfill 범위, 공식 exchange membership source 및 검증 시점은 운영 정책 확인 필요다.

## 7. 구현 결과 및 남은 적용 계획

### 7.1 데이터 모델

기존 source tables를 보존하고, source-document 연결 방식으로 공통 이벤트 계층을 추가한다. 기존 RSS/SEC 저장·알림 기능을 새 원장으로 교체하지 않는다.

- `stockman_events`: 내부 ID, `identity_key`, ticker/CIK/accession, `related_event_id`, event type/title, published/accepted/first-seen times, verification/event status, created/updated. SEC identity는 정규화 CIK+accession, RSS identity는 provider+external ID.
- `stockman_event_documents`: event ID와 `market_rss_articles`, `sec_submissions`, `sec_filing_documents`를 연결하는 출처/외부 ID, 원문 URL, 문서 유형, SEC CIK/accession/exhibit, 게시·접수 시각, hash, storage reference, verification status. 원문 body는 source table/archive를 참조한다.
- `stockman_event_analyses`: event ID, version/hash, grade A/B/C/EXCLUDED, bullish/bearish reasons, dilution status, 핵심 수치 JSONB, unknown factors, 분석시각. immutable version rows와 current version 조회 인덱스. 사용자 규칙에 따라 POSITIVE이며 공식 원문과 ticker가 확인된 경우만 호재 보고서로 공개.
- `stockman_event_history`: status/연결/중요 수치의 전후 snapshot, 사유, 근거 문서, 변경시각. append-only로 기록하고 event의 현재 projection과 함께 transaction 저장.
- 정확 수치: 신규 구조는 `NUMERIC` 또는 정밀 십진 문자열을 쓰며 값과 함께 currency, quantity unit, as-of date, split adjustment basis, calculation formula/input provenance를 저장한다. 미공개 값은 null. 기존 double 컬럼은 그대로 둔다.
- 수집 실행 결과는 기존 `automation_runs`의 market-rss/sec-realtime 실행 결과에 `eventLedger` 요약을 추가한다. 공개 collection status는 최근 실행의 제한된 상태 정보만 조회한다.

V166은 forward-only additive migration이다. 원본 source row를 삭제하거나 덮어쓰지 않는다. cron materializer는 저장된 최신 source rows를 작은 제한으로 재조회하고 identity/document unique key와 source update 시각으로 누락·변경을 처리한다.

### 7.2 구현된 기능

1. 문서: architecture/data-model/API/operations 및 API contract를 추가했다. 애매한 RSS 출처는 `UNVERIFIED`다.
2. 저장·조회: `lib/stockman-events.ts`의 `materializeStockmanSecEvents`와 `materializeStockmanRssEvents`, `listStockmanEvents`, `getStockmanEvent`, `getStockmanEventHistory`, `listStockmanCollectionStatus`, `renderStockmanEventsMarkdown`를 기존 SEC/RSS 원본에 연결했다.
3. API: 이벤트 list/detail/history, `/api/reports` (Next.js `/latest` alias 포함), collection-status 공개 GET과 무인증 source-ID materialization POST를 추가했다. 분석 revision 및 이벤트 상태/relatedEventId 편집은 관리자 session API로 보호한다.
4. 배치: `app/api/cron/sec-edgar/route.ts`와 `app/api/cron/market-rss/route.ts`가 source pipeline 이후 ledger materializer를 best-effort로 호출하고 실패·부분 성공을 automation run 결과에 기록한다. 기존 source rows와 알림 흐름은 ledger 실패로 롤백하지 않는다.
5. 문서/API surface: `scripts/api-surface.mjs`가 공개 GET schema·query 및 route access 분류를 생성한다. collect POST의 공개 쓰기 범위는 source-ID materialization뿐이다.
6. 로컬 격리 PostgreSQL에서 V166 DDL과 source fixture 기반 HTTP materialization/idempotency(SEC/RSS 각 2회 호출, events/documents/analyses/history 각 2건)를 확인했다. 운영 migration과 운영 데이터 변경은 승인된 배포 workflow에서만 수행했다.

### 7.3 남은 확인 사항 및 운영 승인 경계

- RSS rolling-window 시각은 raw source가 explicit time+timezone을 제공할 때만 사용한다. DATE/UNKNOWN precision이면 `published_at`을 ledger에 null로 기록하고 기간 보고서에서 시각이 확인되지 않은 이벤트는 제외한다.
- 종목 eligibility는 `us_common_stock_universe.enabled`, `instrument_type='COMMON_STOCK'`, 지원 NASDAQ/NYSE/AMEX 시장을 fail-closed 확인한다. 마스터 품질/최신성은 운영 관찰 항목이다.
- Materializer는 최대 500개 source row씩 제한한다. 전체 장기 이력 backfill은 별도 검증/운영 계획이며 현재 자동으로 무제한 처리하지 않는다.
- 기존 `market_rss_bullish_articles`는 양성 projection이고 변경 분류에 따라 제거될 수 있으므로 장기 이력 원장으로 대체하지 않았다.
- API 조회는 ticker, 공식 URL, 검증된 분석 결과를 공개하고 raw payload, 내부 오류, 수집 상세 진단은 제외한다. 사용자 지시에 따라 `POST /api/events/collect`도 무인증으로 구현했으며 기존 source row의 ID만 받아 재료화하고 임의 이벤트/등급 입력을 차단한다.

## 8. 구현 및 검증 기록

- 기존 source-of-record를 보존하고 `V166`에 신규 event/document/analysis/history/metric ledger를 추가했다. SEC `(CIK, accession)` 및 RSS `(source, external_id)` 멱등 materializer, append-only analysis revision/history, 정확 decimal metric, 조회·보고서 API, 무인증 source-ID 수집 POST, 기존 SEC/RSS cron best-effort 연동을 구현했다. 보고서는 기간별 호재, KST 일간, 종목 이력, 희석 위험, 수집 상태를 지원한다.
- 주요 경로: `lib/stockman-events.ts`, `db/migration/V166__stockman_event_ledger.sql`, `app/api/events/`, `app/api/reports/`, `app/api/collection-status/`, `app/api/admin/events/`, `app/api/events/collect/`, 기존 SEC/RSS cron route.
- API 무인증 정책: 이벤트 GET와 `POST /api/events/collect`는 인증 불필요. 저장 POST는 SEC accession 또는 허용 RSS provider/source ID만 받고 기존 source table에서 재료화한다. analysis revision 직접 등록은 관리자 세션을 유지한다.
- 검증: Vitest 전체 306 파일을 31 shard로 실행해 전 shard 통과(일부 skip 포함); 신규 이벤트·timestamp/API/schema 6파일 42건 통과. `npm run typecheck`, `npm run build` (Next.js production, 107 static pages), `npm run docs:check` (185 route/47 public GET, catalog 138 documents), API surface audit, operational schema migration audit, `git diff --check` 통과.
- 격리 PostgreSQL HTTP integration은 최소 애플리케이션 원본 테이블 fixture를 갖춘 뒤 성공했고, 실행 컨테이너/서버는 정리했다. 운영 API 관찰에서 `/api/reports`와 `/api/collection-status`가 Next prerendered 404/장시간 응답을 반환하고 `/api/events`는 200인 배포 라우팅 문제가 확인되어, event endpoint에 opt-in report view를 연결하고 standalone deployment smoke에서 400 JSON validation 응답을 확인하도록 보강 중이다.
- 운영 DB 연결·migration·배포·실제 source 데이터 변경은 수행하지 않았다. 사용자 요청의 개발·배포를 이행하기 위해 검증 기록을 포함해 release commit/push를 진행한다. `oci` push는 운영 migration과 서비스 재시작을 자동 실행한다.
