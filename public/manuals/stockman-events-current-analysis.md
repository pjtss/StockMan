# Stockman SEC·RSS 호재 영구 저장 시스템 — 현황 분석 및 구현 계획

작성일: 2026-11-06  
범위: 실제 코드·DB 스키마 조사와 이벤트 ledger 구현 결과. 운영 DB 연결·조회, migration 적용, 배포 및 데이터 변경은 수행하지 않았다.

## 1. 요약

Stockman에는 SEC 제출정보, SEC 공시 원문, RSS 원문/응답 스냅샷, 규칙 기반 호재 분류, Codex 직접 분석 결과를 각각 저장하는 PostgreSQL 테이블과 수집 파이프라인이 이미 있다. 따라서 제안된 `Event`, `EventAnalysis`, `EventDocument`, `EventHistory`를 각각 처음부터 그대로 만드는 방식은 기존 데이터와 책임이 겹친다.

현재 저장 단위는 대체로 개별 RSS 항목 또는 SEC accession이다. 여러 원문을 하나의 장기 이벤트에 연결하는 공통 이벤트 엔티티, 변경 이력, 분석 버전 모델은 확인되지 않았다. 먼저 공통 이벤트와 출처 문서 연결을 추가하고 기존 레코드를 안전하게 참조하는 확장 설계가 적합하다. 기존 공개 API와 자동화는 유지하고 새로운 영구 이벤트 API·보고서 경로를 병행하는 방향을 권고한다.

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
| 거래소 정보 | SEC 회사 마스터에는 exchanges 배열이 있지만 제안한 “미국 거래소 상장 확인”을 현재 SEC 이벤트/RSS 저장 시 반드시 검증하는 공통 게이트가 확인되지는 않았다. `sec_companies` 외에 US 공식 유니버스/분류 테이블이 있으나 이벤트 ingest와의 결합은 미확인/별도 설계 필요. OTC fail-closed 정책을 이 기능에 적용할 입력 기준도 정해야 한다. |
| 수치 정밀도 | 현재 조달금액 컬럼은 `DOUBLE PRECISION`이다. 제안된 정확한 금액/주식 수 계산 요구를 만족하는 원장 수치 타입으로 볼 수 없다. 새 정량 구조에서는 `NUMERIC/DECIMAL` 또는 십진 문자열과 통화·단위·기준일·분할보정 metadata를 써야 한다. 기존 컬럼을 임의 변환하지 않는다. |

## 3. 수집·배치·오류 구분

### SEC

- Atom/RSS 8-K 피드는 `lib/sec-edgar-rss.ts`에서 가져와 RSS 공통 파서 및 `lib/market-rss-pipeline.ts:ingestMarketRssArticles`를 통해 `market_rss_articles`에 들어간다.
- 별도 Submissions 경로는 `app/api/cron/sec-edgar/route.ts`에서 CIK별 `syncSecCompany`를 호출한다. 설정된 CIK 또는 소형주 유니버스 대상으로 제출정보 upsert, 원문 수집/분석, 선택적 XBRL/알림을 수행한다.
- SEC accession은 `sec_submissions`와 `sec_filing_events`의 식별자다. Acceptance 시각은 문자열로 저장되며 API가 새 이벤트 창을 그 시각으로 판정하는 공통 timestamp query는 확인되지 않았다.

### 뉴스 RSS

- 출처 어댑터: `lib/stocktitan-rss.ts`, `lib/globenewswire-rss.ts`, `lib/sec-edgar-rss.ts`, registry `lib/market-rss-sources.ts`.
- 수집/분류/원문 보관/upsert: `lib/market-rss-pipeline.ts`. DB conflict key는 `(source, external_id)`이며 재수집 때 내용 및 분류 필드를 갱신한다. 따라서 source 기사 row는 최신 projection이고 변경 전 값 전체의 버전 원장은 아니다. 원문 응답 snapshot과 Codex 분석 revision은 별도 보존된다.
- 각 RSS source 수집·저장 실패를 격리하고 `ingestFailureCount`로 집계한다. `lib/market-rss-cron-status.ts`는 실패를 degraded로 표시한다. RSS 장애는 정상적인 0건과 구별할 기반이 있다.
- 사용자 제공 StockTitan/GlobeNewswire/SEC 문서 API 예시는 실제 운영 소스 검증이 아닌 저장소 코드의 출처 adapter와 일치한다.

### 스케줄

- OCI 스케줄러 경로는 `scripts/oci-cron.sh`에서 `/api/cron/market-rss`와 `/api/cron/sec-edgar`를 호출한다. RSS 전용 실행 스크립트는 `scripts/oci-rss-cron.sh`다. `lib/cron-auth.ts`는 `CRON_SECRET`을 `x-cron-secret` 또는 Bearer 헤더로 검사한다.
- Netlify의 `netlify/functions/sync-filings.ts`는 별도 DART 예약 작업이다. 주석상 SEC RSS는 market-rss, SEC Submissions는 sec-edgar 작업 소유다.
- RSS cron은 `market-rss` feature 설정 및 schedule/lock/automation run을 거친다. SEC cron은 `sec-realtime` 설정 및 schedule/automation run을 거친다. 새 배치를 만들기 전에 해당 application service/스케줄에 후속 저장·보고서를 연결하는 것이 재사용 경로다.
- 실제 OCI crontab 주기, 배포 인스턴스 수, 운영 DB의 현재 migration 적용 상태는 이번 정적 코드 조사만으로 확인하지 않았다.

## 4. 기존 API와 인증 경계

| 경로 | 역할·현재 동작 |
|---|---|
| `GET /api/disclosures` (`app/api/disclosures/route.ts`) | 저장된 RSS/DART 및 특정 조건의 SEC 제출정보 통합조회. `hours`는 1–24, `asOf`, 날짜, source, 검색, page/pageSize를 지원한다. RSS는 명시적 instant가 확인된 게시 timestamp를 rolling window에 포함하며 날짜 정밀도만 있는 항목은 시각창에서 제외한다. SEC 제출정보는 현재 시간창이 아니라 날짜 조건을 사용한다. SEC `acceptance_datetime`는 이 조회 응답/필터에 사용되지 않는다. |
| `GET /api/market-news` (`app/api/market-news/route.ts`) | `market_rss_articles` 조회. hours 1–24, source, ticker, NEWS/FILING, cursor pagination 지원. 게시시각이 null이면 created_at을 fallback으로 쓴다. ticker 등급/검증 상태/이벤트 history를 조회하는 영구 이벤트 API는 아니다. |
| `GET /api/public/document-catalog` | 정적 `public/document-catalog.json` 카탈로그 검색. DB 문서 원장과는 다른 기능이다. |
| `GET /api/public/market-intelligence` | 저장된 market RSS bullish projection과 SEC 이벤트를 종목 정보와 함께 반환한다. 기존 공개 데이터 계약 재사용 가능성을 살핀다. |
| `GET /api/bullish-rss` | `market_rss_bullish_articles` 목록 API. `POST`는 cron 인증을 검사한다. 세부 권한과 API contract는 route 파일에서 구현을 확인했다. |
| 관리자 SEC 경로 | `app/api/admin/sec-*`는 관리자 UI/debug 성격이다. 외부 공개 조회 API로 복제하지 않는다. |

외부 읽기 경로는 `scripts/api-surface.mjs`, 문서/API discovery 및 Bearer audit 규칙을 따른다. 이벤트 조회는 종목·시장 공용 데이터의 무인증 GET으로 설계하되 관리자 데이터, 원문 payload, 내부 실패 진단, 작업 실행은 노출하지 않아야 한다. 새 route 추가 시 OpenAPI/manual/route inventory 및 `npm run audit:api-surface`, `npm run audit:bearer-auth` 영향 확인이 필요하다.

## 5. 테스트와 검증 기준

- 테스트: Vitest (`vitest.config.mts`, `npm test`), API route 및 도메인 단위 테스트가 존재한다. RSS parser, dedupe, ingest outcome, timestamp precision, SEC parser/repository 인접 동작을 위한 테스트 파일이 확인됐다.
- migration 정합성: `scripts/operational-schema-migration-audit.mjs` 및 테스트, `scripts/audit-flyway-history.ts`가 있다. DB README는 migration을 새 파일로 추가하고 운영 자동 적용을 금지한다고 명시한다.
- 기존 API 호환성: `app/api/disclosures/route.test.ts`, `app/api/market-news` 관련 테스트와 API surface/doc audits를 확장 검증 대상으로 삼는다.
- 이번 단계에서는 테스트, 빌드, DB 연결을 실행하지 않았다. 코드 구조 조사 문서 작성이 범위다.

## 6. 역할 중복 및 설계상 공백

1. `sec_submissions` + `sec_filing_events`는 SEC accession 단위, `market_rss_articles`는 source article 단위다. 같은 경제적 이벤트를 여러 공시/뉴스 문서로 묶는 안정적인 event ID/연결 테이블은 확인되지 않았다.
2. `market_rss_bullish_articles`는 분류 결과를 투영하는 행이며 부적격 행 삭제가 가능하다. 영구 audit 원장으로 승격하면 기존 UI/알림 의미와 충돌한다.
3. RSS 원문 응답 스냅샷은 fetch-response 단위이고 SEC 제출 snapshot은 SEC JSON 응답 단위다. 개별 Exhibit 원문을 여러 이벤트에 연결하고 URL/hash/문서유형/게시·접수시각/검증상태를 보관하는 공통 `EventDocument` 모델은 없다. SEC filing 문서 한 건은 `sec_filing_documents`에서 확인되지만 exhibit 집합 모델은 미확인이다.
4. SEC 및 RSS 규칙 분류 결과는 기존 row에서 upsert 변경될 수 있다. 분석 기록은 RSS Codex에서 revision hash를 사용하지만, SEC queue 결과는 accession당 한 슬롯이다. A/B/C 분석 등급의 변경 불변 이력은 없다.
5. `sec_filing_events` 금액 및 RSS 금액의 `DOUBLE PRECISION`은 정확 decimal accounting에 적합하지 않다. 단위/통화/주식 split 조정/계산 입력값·산식 모델도 확인되지 않는다.
6. RSS item의 external ID는 공급자 id, SEC RSS의 external ID는 feed parser 기준값일 수 있다. SEC canonical key `(CIK, accession)`를 RSS 기사 dedupe 키와 동일시하면 안 된다. 기업뉴스의 공식 URL canonicalization 및 원문 식별 기준도 별도 정의가 필요하다.
7. 기존 이벤트/RSS API는 응답·기간 범위가 다르고 `/api/disclosures`는 SEC Accepted instant 기반 최근 이벤트 조회가 아니다. 새 `/api/events`는 명확한 timestamp basis와 status/grade 필터를 갖춰야 한다.
8. 원문 보관 기간/용량 정책, SEC/뉴스 외부 재조회 누락 backfill 범위, 공식 exchange membership source 및 검증 시점은 운영 정책 확인 필요다.

## 7. 구현 결과 및 남은 적용 계획

### 7.1 데이터 모델

기존 source tables를 보존하고, source-document 연결 방식으로 공통 이벤트 계층을 추가한다. 기존 RSS/SEC 저장·알림 기능을 새 원장으로 교체하지 않는다.

- `stockman_events`: 내부 ID, ticker/CIK, event type/title, source-derived occurrence basis, published/accepted/first seen times, verification/event status, created/updated. SEC accession은 회사 CIK와 함께 표준화하고, 기업발표는 canonical official URL/hash를 포함하는 별도 unique identity 규칙으로 멱등 처리.
- `stockman_event_documents`: event ID와 `market_rss_articles`, `sec_submissions`, `sec_filing_documents`를 연결하는 출처/외부 ID, 공식 URL, 문서 유형, SEC CIK/accession/exhibit, 게시·접수 시각, hash, 원문 위치, verification status. 기존 원문을 복제하지 않고 참조하며 신규 원문 보관만 필요할 때 기존 archive module을 확장.
- `stockman_event_analyses`: event ID, version/hash, grade A/B/C/EXCLUDED, bullish/bearish reasons, dilution status, 핵심 수치 JSONB, unknown factors, 분석시각. immutable version rows와 current version 조회 인덱스. 사용자 규칙에 따라 POSITIVE이며 공식 원문과 ticker가 확인된 경우만 호재 보고서로 공개.
- `stockman_event_history`: status/연결/중요 수치의 전후 snapshot, 사유, 근거 문서, 변경시각. append-only로 기록하고 event의 현재 projection과 함께 transaction 저장.
- 정확 수치: 신규 구조는 `NUMERIC` 또는 정밀 십진 문자열을 쓰며 값과 함께 currency, quantity unit, as-of date, split adjustment basis, calculation formula/input provenance를 저장한다. 미공개 값은 null. 기존 double 컬럼은 그대로 둔다.
- 독립 `collection_status`/run 기록은 기존 `automation_runs` 및 source별 결과를 재사용할 수 있는지 확인 후 결정. 일반 pipeline run과 이벤트 materialization/report 생성 결과를 식별할 별도 dimension/로그 필요성은 구현 설계에서 검토.

위 이름은 초안이며 기존 테이블 중복 검사, 인덱스/FK/ON DELETE 동작, migration forward-only 감사 후 확정한다. 데이터 삭제 또는 기존 row overwrite를 하는 backfill은 계획하지 않는다. backfill은 추가 insert/link만 허용하고, 충돌 행은 skip/report하도록 설계한다.

### 7.2 구현된 기능

1. 승인된 설계 문서(architecture/data model/API/operations) 및 API contract 확정. 기존 데이터를 이벤트에 자동 연결하는 정확도와 애매한 연결의 `UNVERIFIED` 처리 기준을 정한다.
2. 새 forward-only migration 및 Drizzle schema 추가. 로컬 전용 DB에서 schema audit/migration 시험. 운영 적용은 별도 승인 전 금지.
3. 순수 domain service와 repository: SEC `(CIK, accession)` 및 canonical company URL/hash 기반 idempotency, 문서 연결, append-only analysis/history, 수집 실패/부분 성공 분리. 원문 확보 실패·feed parse 실패는 verified zero-events로 기록하지 않음.
4. 기존 RSS/SEC pipeline 성공 경로 뒤에 best-effort event materialization을 연결하거나 별도 단계로 격리. 신규 저장 실패가 기존 ingest/notification 데이터의 commit 또는 보존을 깨지 않게 transaction 경계를 설계한다. 기존 APIs의 필드/조건은 바꾸지 않는다.
5. 새로운 공개 `GET /api/events`, detail/history, reports/latest, collection-status를 추가하고 기존 API/auth convention 및 공용 데이터 공개 정책을 적용. paging/filter/date window, explicit timestamp basis, errors, max limits 문서화.
6. DB 기반 deterministic Markdown/JSON generator와 종목별 보고서 경로를 추가. 작업 폴더 파일을 원장으로 삼지 않고 매번 DB에서 재생성 가능하게 한다. 운영 RSS 원문 분석은 기존 규칙처럼 Codex가 직접 수행하고 외부 LLM provider를 연결하지 않는다.
7. 기존 scheduler를 재사용해 이벤트 materialization/보고서 갱신 연결. 실패 시 source별 SUCCESS/PARTIAL_SUCCESS/FAILED/UNVERIFIED를 보존하고 재실행 가능하게 한다. 새 scheduler는 기존 소유권/간격을 확인하기 전 추가하지 않는다.
8. 명시 테스트 작성 후 targeted tests, 기존 API compatibility, migration audit, API/auth/docs audits, typecheck/build/실행 확인. 기존 지시의 commit/push 전 3종 검증은 커밋/푸시를 요청받는 경우에만 적용.
9. 운영 적용 계획 및 rollback은 새 테이블만 비활성화할 수 있도록 별도 작성. 실제 운영 migration/배포는 별도 승인 조건을 유지.

### 7.3 남은 확인 사항 및 운영 승인 경계

- 시간창 기본 시각을 SEC `accepted_at`, 뉴스 `published_at`로 분리하고, published/accepted가 없는 source item은 12시간 호재 결과에서 제외할지 결정해야 한다. 코드상 현 `market-news`의 created_at fallback은 신규 이벤트 API에서 그대로 가져오면 “공식 이벤트시각” 기준과 달라진다.
- 어떤 공식 US listing source와 상장 확인 유효기간을 쓸지 확정해야 OTC-only fail-closed를 구현할 수 있다. SEC exchanges만으로 부족/누락되는 사례 처리 정책 필요.
- 기존 RSS 기사/SEC 접수정보의 역사 backfill 기간과 자동 연결 confidence threshold를 정해야 한다. 명확하지 않은 ticker/event 연결은 자동 확정하지 않고 미연결 또는 UNVERIFIED로 둔다.
- 원문 본문을 DB에 계속 복제할지(현재 archive 재사용), content hash/URL metadata만 보관할지 저장용량/원문 접근 정책 확인 필요.
- 기존 `market_rss_bullish_articles`는 양성 projection이고 현재 분류에 따라 삭제될 수 있다. 새 원장과 병행하되 해당 테이블/API를 변경하지 않는 권고안을 제시한다.
- API 조회는 ticker, 공식 URL, 검증된 분석 결과를 공개하고 raw payload, 내부 오류, 수집 상세 진단은 제외한다. 사용자 지시에 따라 `POST /api/events/collect`도 무인증으로 구현했으며 기존 source row의 ID만 받아 재료화하고 임의 이벤트/등급 입력을 차단한다.

## 8. 구현 및 검증 기록

- 기존 source-of-record를 보존하고 `V166`에 신규 event/document/analysis/history/metric ledger를 추가했다. SEC `(CIK, accession)` 및 RSS `(source, external_id)` 멱등 materializer, append-only analysis revision/history, 정확 decimal metric, 조회·보고서 API, 무인증 source-ID 수집 POST, 기존 SEC/RSS cron best-effort 연동을 구현했다. 보고서는 기간별 호재, KST 일간, 종목 이력, 희석 위험, 수집 상태를 지원한다.
- 주요 경로: `lib/stockman-events.ts`, `db/migration/V166__stockman_event_ledger.sql`, `app/api/events/`, `app/api/reports/`, `app/api/collection-status/`, `app/api/admin/events/`, `app/api/events/collect/`, 기존 SEC/RSS cron route.
- API 무인증 정책: 이벤트 GET와 `POST /api/events/collect`는 인증 불필요. 저장 POST는 SEC accession 또는 허용 RSS provider/source ID만 받고 기존 source table에서 재료화한다. analysis revision 직접 등록은 관리자 세션을 유지한다.
- 검증: 전체 Vitest 291개 파일 중 290 pass, 1 skipped; 1,445 tests pass, 3 skipped. 전체 typecheck 및 production build 통과. API surface 감사 179 route/45 공개 GET, `docs:check`, V166 migration/schema audit 통과. standalone runtime을 localhost 폐쇄 DB 주소로 실행해 무인증 GET/POST 진입, 입력 오류 400, 격리 저장소 오류 503, OpenAPI 문서 HTTP 200을 확인했다.
- 배포 범위 보완: Node/tsx 전용 분석 CLI 한 파일은 앱 전체 TS 검사에서 제외했고, 복제 worktree인 `.deploy-worktree/**`는 Vitest 검색에서 제외했다. CLI 실행 로직은 변경하지 않았다. 기존 테스트 실패 7건은 RSS UI 접근성/이벤트 테스트, stale market-news 요약 응답 계약, push 테스트 필드, retry 기준 fixture, KST 자정 표시로 분석해 코드/테스트 계약을 정합화하고 전체 통과를 재확인했다.
- 운영 DB 연결·migration·배포·실제 source 데이터 변경 및 Git commit/push는 수행하지 않았다.
- 적용 전 남은 작업: 실제 migration이 적용된 staging DB에서 저장/중복/조회 경로 검증, 수집 ID 공개/쿼터 운영 검토. 운영 migration 및 배포는 지시서의 별도 사전 승인 대상이다.
