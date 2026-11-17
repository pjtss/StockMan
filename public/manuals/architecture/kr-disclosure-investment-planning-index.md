# 공시 기반 투자 기획 인덱스

<!-- catalog-description: 공시 기반 투자 제품 목표, 우선순위, 미결 의사결정과 상세 설계 진입점을 관리하는 요약 인덱스. 상세 설계는 연결된 대형 아키텍처 문서를 기준으로 한다. -->

## 문서 상태

- 상태: 기획 인덱스; 정책 승인·구현 완료 문서가 아님
- R0 저장소 관측 기준: 2026-11-04; 저장소 revision은 `REPOSITORY_REVISION_UNRECORDED`로 유지
- 기준일: 2026-11-04
- 현재 기능별 개요: [공시 기반 기능 기획 현황 및 기능별 요약](./disclosure-feature-planning-current.md)
- 상세 설계: [국내 보통주 공시 이벤트 구조 설계](./kr-disclosure-event-architecture.md)
- 변경 이력: `DEVELOPMENT_LOG.md`의 공시 기반 투자 기능 연속 기획 항목

## 사용자 결과

1. 공식 공시의 발견 범위와 미수집·부분실패를 구별한다.
2. 제출 법인, 공시상 당사자, 직접 영향 issuer, 적격 보통주를 서로 다른 역할로 연결한다.
3. 공시 source/document revision부터 claim, event/date, 분석·승인, 공개 snapshot, 사용자 알림까지 근거 lineage를 재현한다.
4. 정정·철회·첨부 교체 때 영향받은 주장과 과거 노출만 재검토하고, 무관한 근거와 개인 상태는 보존한다.
5. 과거 결과, 확정 일정, 추정 일정, 결과 미확인을 분리해 투자 판단의 불확실성과 반대 근거를 함께 제공한다.
6. 여러 공시에 흩어진 issuer 자본·전환증권 상태를 기준시점과 근거 coverage에 맞춰 연결하고, 합산할 수 없는 잔액과 희석 가능성을 숨기지 않는다.
7. 재무·감사 신호, 법원 절차, 거래소 조치와 상장/매매 결과를 독립 상태축과 공식 근거 시점으로 추적한다.
8. 자본 변동과 재무·법원·거래소 상태를 한 issuer dossier에서 비교하되 서로 추론하지 않고 단일 시점·revision으로 재현한다.

매매 실행·수익 보장·일정만으로 방향을 단정하는 기능은 범위에서 제외한다. 국내 종목 노출은 활성 `COMMON_STOCK` 공식 master 확인과 시가총액 300억 원 초과를 모두 요구한다.

## 우선순위 및 현재 상태

| 순서 | 주제 | 결정 상태 | 다음 산출물 |
|---|---|---|---|
| P0 | 기획 기준·의존 순서·문서 gate | `IN_PROGRESS` | 상세 아키텍처, checker와 개발 로그 상호 연결 |
| P1 | 공시·시장가격 원천 권리와 필드/action scope | `BLOCKED_BY_DECISION: KR-DART-RIGHTS-01, KR-MARKET-DATA-RIGHTS-01` | source/product/endpoint/field/action/purpose/channel/retention/replay 증거 bundle 및 데이터·법무 owner 결정 |
| P2 | issuer/party/instrument 귀속과 master/cap freshness | `BLOCKED_BY_DECISION` | 다자 공시 gold set과 시점별 적격성 근거 |
| P3 | 수집 completeness·late arrival·correction reconciliation | `BLOCKED_BY_DECISION: KR-RECONCILIATION-01` | 승인된 window/quota/denominator acceptance |
| P4 | event/date taxonomy·근거 분석·issuer 자본·상장 위험 상태 조정 | `BLOCKED_BY_DECISION: KR-CAPITAL-RECONCILIATION-01, KR-ISSUER-RISK-STATUS-01, KR-EVENT-STUDY-POLICY-01` | issuer/series capital roll-forward 및 issuer 위험·법원절차·거래소 상태 timeline fixture, event-study preregistration policy, 독립 reviewer acceptance |
| P5 | DB drift·legacy cutover·retention·security | `BLOCKED_BY_DECISION` | 환경/consumer inventory와 rollback 가능한 격리 replay |
| P6 | 사용자 API/UI·pagination·issuer dossier consistency 및 개인 thesis journal | `BLOCKED_BY_DECISION: KR-API-UI-CONSISTENCY-01, KR-CURSOR-SECURITY-01, KR-EVENT-ATTRIBUTION-01, KR-MASTER-SNAPSHOT-01, KR-PERSONAL-THESIS-UX-01` | issuer/instrument applicability, filter scope, capital/risk revision parity, immutable snapshot·cursor·rights-aware UX 및 개인 기록 opt-in/privacy/export/delete acceptance |
| P7 | shadow 및 운영 전환 | `BLOCKED_BY_DECISION: KR-SHADOW-SLO-01, KR-END-TO-END-ACCEPTANCE-01` | 사전 승인 gold set/분모/SLO, independent review, rollback |

## 실행 순서와 단계별 완료 증거

우선순위 P0–P7은 의존성 순서다. 아래 실행표는 그 순서를 산출물과 중단 조건으로 바꿔 추적하며, 순번은 일정이나 owner 승인을 뜻하지 않는다. 다음 단계의 자료를 미리 조사할 수는 있지만 권리·귀속·coverage gate를 넘지 않은 결과는 제품 claim이나 공개 데이터로 사용할 수 없다.

| 실행 구간 | 선행조건 | 검토 가능한 결과물 | 단계 통과 증거 | 보류/실패 시 동작 |
|---|---|---|---|---|
| R0 기획·현행 경로 기준선 | 없음 | route/caller/schema/source/action inventory, 결정 ID 연결, synthetic acceptance gap 목록 | 저장소 근거 경로와 문서 revision이 기록되고 구현·제안·미확인이 구분됨 | 저장소에서 확인 못 한 호출자·권리·운영 범위는 미확인으로 기록; 미확인을 0건·승인으로 승격하지 않음 |
| R1 권리·보존 scope 확정 | R0; `KR-DART-RIGHTS-01`, `KR-MARKET-DATA-RIGHTS-01`, `KR-RETENTION-01`, `KR-DOCUMENT-UX-01` | source/product/endpoint/field/action/purpose/channel/retention/replay와 credit 조건 manifest | 공식 약관·계약 evidence snapshot, 정확한 적용 scope, 유효기간, named owner/reviewer 결정이 ledger에서 검증됨 | 해당 scope의 취득·저장·파생·인용·노출을 차단하고 다른 source나 action으로 권리를 추정하지 않음 |
| R2 identity·coverage·revision truth | R1의 대상 action 권리; `KR-MASTER-SNAPSHOT-01`, `KR-CAP-FRESHNESS-01`, `KR-EVENT-ATTRIBUTION-01`, `KR-RECONCILIATION-01` | identity·eligibility packet과 source-window coverage packet을 별도 제출: 전자는 issuer/instrument/as-of crosswalk와 다자 attribution, 후자는 query profile·window·page/row denominator·run/dedupe·correction watermark | 공식 master snapshot/hash, 층화 attribution gold set, source별 승인 denominator·rights/identity binding 및 late/correction replay rejection | 대상·적격성 또는 negative evidence가 미확정이면 `UNRESOLVED/UNVERIFIABLE`; 자동 ticker 귀속·완전성 claim 차단 |
| R3 분석·반대근거·사건 상태 | R2; `KR-TAXONOMY-01`, `KR-ANALYSIS-REPRO-01`, `KR-CAPITAL-RECONCILIATION-01`, `KR-ISSUER-RISK-STATUS-01`, `KR-EVENT-STUDY-POLICY-01` | revision-pinned claim/evidence, 위험 범주별 DCR manifest, capital/security series 및 재무·법원·거래소 상태 timeline, 사전등록 event study | 공식 원문 fixture·재현 가능한 입력/hash·독립 reviewer eligibility/conflict/independence evidence·정량 분모와 scope별 acceptance | `POLICY_NOT_READY`, 권리/coverage/eligibility 보류, 분석 실패는 단일 방향 투자 해석·aggregate score·확정 일정 projection을 억제 |
| R4 저장·공개 consumer parity | R3; `KR-DB-DRIFT-01`, `KR-LEGACY-CUTOVER-01`, `KR-IMPORTER-OPS-01`, `KR-API-UI-CONSISTENCY-01`, `KR-CURSOR-SECURITY-01`, `KR-OPERATIONAL-SECURITY-01` | additive storage/import dry-run, immutable dossier/API/UI/export/push snapshot 및 correction/revocation 흐름 | 환경 schema/writer denominator, backup-restore·rollback, 권한별 actor/audit·deletion propagation, 동일 snapshot consumer parity와 security acceptance | DB drift나 consumer mismatch면 import·cutover·public page·알림 차단; legacy 데이터는 승인된 rollback 기준 없이 재사용하지 않음 |
| R5 shadow·운영 수용 | R4; `KR-SHADOW-SLO-01`, `KR-END-TO-END-ACCEPTANCE-01` | 승인된 gold denominator에서 source-to-publication shadow run, 누락·오귀속·stale·권리 철회/recovery 결과 | 독립 reviewer 기록, 사전 승인 threshold/SLO, 반복 기간, incident·rollback rehearsal, 유효한 decision-ledger checkpoint | `NOT_ACCEPTED` 유지; threshold 미달·evidence 만료·ledger checkpoint 불일치 시 승격 및 배포 금지 |

각 행의 통과는 해당 scope에 한정된다. 이후 약관/권리 revision, master correction, late filing, reviewer 권한 철회, schema/writer drift, ledger key/checkpoint 사고가 발견되면 의존 descendant를 stale 처리하고 해당 구간부터 재평가한다. 어떤 fixture/checker도 실제 운영 evidence나 owner 승인 자체를 대신하지 않는다.

R2 coverage packet은 필수 분모와 연결 규칙을 따른다. 필수 분모·저장 조정·negative-evidence 금지·reopen trigger는 [source-window coverage 설계](./kr-disclosure-event-architecture.md#source-window-coverage-packet-필수-분모와-연결)를 따른다. identity packet과 coverage packet의 상태는 각각 판정하고 둘 다 통과해야 `NOT_FOUND_IN_SCOPE`를 dossier에 제공할 수 있다.

P0에서 다음으로 수행할 수 있는 비제품 작업은 [read-only discovery package](./kr-disclosure-event-architecture.md#p0-read-only-discovery-package와-결정-입력물)다. R0 저장소 정적 기준선, R1 합성 contract 확인, R2 owner 제공 외부 증거, R3 결정 입력 갱신 순서로 22개 결정 ID를 5종 discovery packet에 매핑해 조사한다. identity·eligibility와 source-window coverage는 R2에서 별도 packet으로 판정한다. 결과 없음·권한 부족·미실행은 0건과 구분해 기록한다. 패키지 완료는 정책 결정·구현 승인이 아니며 DB/API/runtime을 변경하지 않는다.

결정 ID와 owner, 필요한 증거·종결 기준의 authoritative register는 [상세 아키텍처의 decision table](./kr-disclosure-event-architecture.md#설계-승인-전-결함-종결-감사표)다. 이 요약 인덱스는 해당 table을 복제하지 않는다.

Owner 응답은 아직 요청되지 않은 상태(`NOT_REQUESTED`)로 유지한다.

### P0 22개 결정 ID와 discovery packet crosswalk

아래 crosswalk는 decision register의 분모 22개를 모두 P0 조사 packet 유형에 연결한다. `ownerRole`은 직무 역할이며 실제 담당자 지정과 다르다. 현재 decision evidence ledger는 비어 있고 stable person ID의 named owner가 확인되지 않았으므로 모든 행의 실명 담당 상태는 미할당이며, 질문에 대한 owner 응답도 아직 요청되지 않았다. 각 표 행에는 담당 지정과 owner 응답 상태 코드를 각각 기록한다. 아래 질문은 담당자에게 제출할 결정 입력 질문이며 승인이나 상태 변경 기록이 아니다.

| Decision ID | Packet 유형 | Register owner role | 담당 지정 | 담당자에게 제출할 결정 질문 |
|---|---|---|---|---|
| `KR-DART-RIGHTS-01` | 권리·보존 | 데이터/법무 책임자 | `NOT_ASSIGNED` | 각 DART/KIND endpoint·field·action·목적·채널·보존기간에 허용되는 범위와 출처표시 조건은 무엇인가? |
| `KR-MARKET-DATA-RIGHTS-01` | 권리·보존 | 시장 데이터/법무 책임자 | `NOT_ASSIGNED` | provider·상품별 취득/재실행/파생계산/공개·재배포·보존 action을 어떤 계약 revision이 허용하는가? |
| `KR-RETENTION-01` | 권리·보존 | 법무·보안·운영 책임자 | `NOT_ASSIGNED` | 원문·파생물·백업별 retention/deletion SLA, RPO/RTO와 restore/access 정책은 무엇인가? |
| `KR-DOCUMENT-UX-01` | 권리·보존 | 제품/법무 책임자 | `NOT_ASSIGNED` | 문서 분류/revision별 허용 인용량, 출처 표시, 접근/삭제 UX를 무엇으로 승인할 것인가? |
| `KR-MASTER-SNAPSHOT-01` | identity·eligibility | 종목 데이터 책임자 | `NOT_ASSIGNED` | 보통주 class·identifier effective date를 어떤 공식 master snapshot/version/hash로 증명하고 언제 재평가할 것인가? |
| `KR-CAP-FRESHNESS-01` | identity·eligibility | 투자 데이터 책임자 | `NOT_ASSIGNED` | cap 원천·통화 환산·FX 기준시각 및 장중/휴일 포함 stale 허용시간을 무엇으로 정할 것인가? |
| `KR-EVENT-ATTRIBUTION-01` | identity·eligibility | 공시 도메인·종목 마스터 책임자 | `NOT_ASSIGNED` | 제출자·당사자·영향 issuer가 다른 gold fixture에서 직접영향 근거와 subject cardinality를 어떻게 승인할 것인가? |
| `KR-RECONCILIATION-01` | source-window coverage | 데이터 운영 책임자 | `NOT_ASSIGNED` | source별 query/window denominator, cadence/lookback/quota, correction watermark 및 freshness SLO를 무엇으로 승인할 것인가? |
| `KR-TAXONOMY-01` | 분석·사건 정책·수용 | 공시 도메인 reviewer | `NOT_ASSIGNED` | event/date taxonomy와 공식 form/field 전이 중 공개 가능한 versioned vocabulary는 무엇인가? |
| `KR-ANALYSIS-REPRO-01` | 분석·사건 정책·수용 | 공시 도메인 reviewer | `NOT_ASSIGNED` | prompt/schema/model/input normalization revision과 재현·prompt injection gold acceptance는 무엇인가? |
| `KR-CAPITAL-RECONCILIATION-01` | 분석·사건 정책·수용 | 공시 도메인·재무 데이터 책임자 | `NOT_ASSIGNED` | issuer/security series별 base snapshot과 movement를 조정할 분모·기준시각·unresolved 정책은 무엇인가? |
| `KR-ISSUER-RISK-STATUS-01` | 분석·사건 정책·수용 | 공시 도메인·상장상태 책임자 | `NOT_ASSIGNED` | 재무/감사, 법원·행정, 거래소 상태축의 공식 authority·freshness·상태전이와 공개 경계는 무엇인가? |
| `KR-EVENT-STUDY-POLICY-01` | 분석·사건 정책·수용 | 시장분석 책임자·독립 통계 reviewer | `NOT_ASSIGNED` | 목적·primary endpoint·event window·cohort/comparator·누락·confounder·multiplicity 사전등록 정책은 무엇인가? |
| `KR-DB-DRIFT-01` | 저장·보안·API·consumer | DB 운영 책임자 | `NOT_ASSIGNED` | 환경별 schema/checksum/writer denominator와 backup/restore 증거가 additive migration을 허용하는가? |
| `KR-LEGACY-CUTOVER-01` | 저장·보안·API·consumer | 저장소/DB 운영 책임자 | `NOT_ASSIGNED` | importer·기존 projection의 source-of-truth cutover, immutable snapshot 및 rollback 조건은 무엇인가? |
| `KR-IMPORTER-OPS-01` | 저장·보안·API·consumer | 애플리케이션/DB 운영 책임자 | `NOT_ASSIGNED` | 배포 artifact·호출자·checkpoint CAS·재시도·관측·rollback의 운영 책임자는 누구이며 수용 기준은 무엇인가? |
| `KR-OPERATIONAL-SECURITY-01` | 저장·보안·API·consumer | 보안·개인정보·운영 책임자 | `NOT_ASSIGNED` | actor 권한·감사·삭제전파·복구와 외부 ledger checkpoint/key lifecycle을 어떤 threat/privacy acceptance로 검증할 것인가? |
| `KR-CURSOR-SECURITY-01` | 저장·보안·API·consumer | 애플리케이션 보안/제품 책임자 | `NOT_ASSIGNED` | cursor signing key·rotation/revocation·query binding·expiry·snapshot retention/quota는 무엇인가? |
| `KR-API-UI-CONSISTENCY-01` | 저장·보안·API·consumer | API·제품·DB 운영 책임자 | `NOT_ASSIGNED` | API/UI/export/cache/pagination이 같은 immutable snapshot·권리 철회 상태를 어떻게 보장하는가? |
| `KR-PERSONAL-THESIS-UX-01` | 저장·보안·API·consumer | 제품 책임자·개인정보 책임자 | `NOT_ASSIGNED` | 명시 opt-in thesis의 private scope, 근거 revision, export/delete/retention 및 공개 consumer 제외를 어떻게 승인할 것인가? |
| `KR-SHADOW-SLO-01` | 분석·사건 정책·수용 | 데이터 운영/도메인 책임자 | `NOT_ASSIGNED` | gold denominator·층화·반복기간·누락/오귀속 허용치와 rollback SLO는 무엇인가? |
| `KR-END-TO-END-ACCEPTANCE-01` | 분석·사건 정책·수용 | 독립 품질 reviewer·업무 owner | `NOT_ASSIGNED` | versioned gold set/hash, 독립 reviewer 분리, end-to-end threshold와 rollback rehearsal의 최종 수용자는 누구인가? |

Crosswalk는 권리, identity, source-window coverage, 분석·사건 정책·수용, 저장·보안·API·consumer의 5개 packet 유형에 22개 결정을 모두 매핑한다. 실제 named owner/actionable question 제출 증거가 접수되기 전 P0 packet의 owner assignment 종료조건은 미충족으로 유지한다.
## R0 저장소 현황 요약 — 2026-11-04

아래는 현재 checkout의 코드·schema에서 직접 확인한 저장소 범위 요약이다. workspace는 다수 파일이 수정·미추적된 상태여서 단일 clean commit SHA를 근거로 한 재현 기준선으로 취급하지 않는다. R0는 repository revision을 `REPOSITORY_REVISION_UNRECORDED`로 보존하며, 이 표는 production 배포본·운영 DB·외부 writer/consumer 분모를 증명하지 않는다.

| Packet | 저장소에서 확인한 경로/계약 | 관측 사실 | 미확인/차단 항목 |
|---|---|---|---|
| 조회/read surface | `app/api/disclosures/route.ts` GET, `/disclosures` consumer | `market_rss_articles`, DART `filings`, `sec_submissions`를 query window에 따라 합산 조회하고 automation run 상태를 함께 읽는다. 전체 결과는 500행 batch로 읽으며 페이지 모드도 지원한다. | 저장 행 query는 원천의 미수집 행 또는 provider page 분모를 나타내지 않는다. 배포 route/auth/cache 범위는 별도 runtime evidence 필요. |
| DART discovery/alert | `app/api/cron/sync-filings/route.ts` → `lib/filing-sync.ts` → `lib/dart-automation.ts` | OpenDART 수집 summary에는 `pagesFetched`, `rawRowCount`, `uniqueReceiptCount`, `totalDisclosures`, `reconciliationState`가 projection 입력으로 존재한다. `/api/disclosures` coverage projector에서 DART `persistState`는 `NOT_RUN`이고 저장 writer가 연결되지 않았다는 코드 주석이 있다. | 전체 report/list 분모의 공식적 completeness, 운영 cron 실제 배포·호출 주기, `filings` 테이블 외부 writer, 상세 결과 persistence 미확인. |
| SEC discovery/storage | `app/api/cron/sec-edgar/route.ts`, `lib/disclosure-source-coverage.ts`, SEC submissions schema | `submissionCoverage`는 configured/success/failure/unknown CIK count, raw item, upsert 및 snapshot 저장 count를 projector가 읽는다. SEC 저장 row와 automation run은 별도 query다. | 제출자 universe 자체의 공식 완전성, 구성 CIK의 시점 유효성, provider pagination total, 현재 query window와 submissions fetch 범위 동등성은 증명되지 않으며 `rangeCoverage`는 `UNKNOWN`. |
| RSS discovery/storage | `/api/cron/market-rss`, `market_rss_articles`, `market_rss_fetch_snapshots`, `lib/disclosure-source-coverage.ts` | 현재 projector는 `GLOBENEWSWIRE`, `SEC_EDGAR`, `STOCKTITAN`을 scheduler 추적 대상으로 두고 run의 source result 및 STORED/PERSIST_FAILED/FETCH_FAILED를 표시한다. | `KRX_KIND`, `NEWSIS`, `MK`, `HANKYUNG`, `ETODAY`, `NASDAQ`, `NASDAQ_TRADER`의 이 coverage 경로는 `UNKNOWN`; 뉴스/RSS provider 분모·page completeness 및 운영 source 구성 미확인. |
| schema/dedupe | `lib/schema.ts` `filings`, `marketRssArticles`, `automationRuns`, `secSubmissions`; `db/migration/` | `filings` unique `(source, external_id)`, RSS articles unique `(source, external_id)`, SEC submissions PK `accession`; automation run stores module/status/time/summary. 이 키는 저장 중복 방지 key이지 수집 completeness 분모가 아니다. | migration/checksum은 repo history에 한정. 운영 DB catalog, schema drift, runtime grants/views/triggers 및 external write paths는 미확인. |

R0 판정: route·주요 cron/caller·현재 schema dedupe key는 `PASS_REPOSITORY_SCOPE`; DART 상세 persistence는 이 저장소 checkout 기준 `NOT_RUN`; source-wide completeness·외부 consumer/writer·운영 배포 상태·권리·시점별 master는 `EXTERNAL_EVIDENCE_REQUIRED`다. `PASS_REPOSITORY_SCOPE`를 P1/P2/P3 decision 승인으로 승격하지 않는다.

| 재현 확인 명령 | 범위 |
|---|---|
| `rg --files app/api lib scripts` 후 관련 route/caller에서 `rg -n "withAutomationRun|runFilingSync|submissionCoverage|projectMarketRssSourceCoverage" ...` | 저장소 코드 탐색; 동적/배포 경로는 제외 |
| `rg -n "export const (filings|marketRssArticles|automationRuns|secSubmissions)|uniqueIndex|primaryKey" lib/schema.ts` | schema source 및 declared key 확인; 실제 DB catalog 아님 |
| `npm run docs:check` | 문서/합성 contract gate; runtime/provider completeness 검증 아님 |

### R1 합성 contract checkpoint — 2026-11-04

현 checkout에서 `npm run docs:check`를 실행해 정적 문서 gate의 합성 contract acceptance를 확인했다. 이번 gate 결과는 아래에 표시한 합성 계약 범위의 `PASS_SYNTHETIC_CONTRACT`이며, 권리 승인·공식 master 실측·provider 수집 분모·운영 DB/배포/owner evidence는 아니다.

| Packet 유형 | checker로 확인한 fixture/분모 | 결과 | 해석 한계 |
|---|---|---|---|
| 권리·source surface | `disclosure-rights-surface-inventory.v0.json` 5개 source surface와 action별 gap; `rights-action-decision.v0.json` 및 `investment-rights-action-propagation.v0.json` | `PASS_SYNTHETIC_CONTRACT` | source 목록/합성 decision gate 검증. 실제 약관의 제품·field/action 적용 승인 아님. |
| identity·eligibility | `instrument-identity-temporal-crosswalk.v0.json` ITC-01–37; checker의 공식 source role, 시점별 alias/evidence envelope, reviewer·eligibility contract | `PASS_SYNTHETIC_CONTRACT` | 37개 synthetic vector와 contract 검증. 실제 시점별 종목 master snapshot·cap freshness 데이터 아님. |
| source-window coverage/query/correction | `disclosure-source-coverage.v0.json` DSC-01–27 및 embedded DBI-01–10 database-inventory golden cases | `PASS_SYNTHETIC_CONTRACT` | denominator·권한 가시성·writer inventory·OpenDART response shape/quota/correction requery의 합성 판정. provider 전체 pagination, 운영 catalog 또는 source completeness 증명 아님. |
| 분석·사건 정책·수용 | `issuer-capital-state-reconciliation.v0.json` 16 vectors, `issuer-risk-status-timeline.v0.json` 18, `investment-effect-projection-bridge.v0.json` 15, `disclosure-counterevidence-review.v0.json` DCR-01–18 | `PASS_SYNTHETIC_CONTRACT` | fixture state/transition/lineage gate 검증. official gold filing 표본, 업무 owner taxonomy/statistical threshold approval 아님. |
| 저장·consumer closure | embedded DBI-01–10; `decision-register-lifecycle.v0.json` DRL-01–15; `decision-ledger-checkpoint.v0.json` DLCP vectors 8 | `PASS_SYNTHETIC_CONTRACT` | schema/evidence gate의 합성 경계 검증. 운영 DB drift·external writer/consumer 분모·backup restore·named owner 증거 아님. |

검증 command는 `npm run docs:check`이고 확인 결과는 decision rows 22, catalog 142 documents/7 categories, aligned schema tables 50, documentation entry points 26, migrations 165/latest V165, operational relations 24다. checker는 모든 개별 fixture vector count를 독립 요약 출력하지 않으므로 표의 분모는 해당 JSON의 checked-in vector declaration과 checker 요구 ID를 대조한 값이다. 운영 자료에서 관측한 건수로 해석하지 않는다. 따라서 R1은 synthetic scope에서 통과하지만 R0 named owner 지정, R1 공식 rights evidence, R2 identity/coverage external evidence의 gate는 계속 열려 있다.

## R2 저장소 query profile과 공식 가이드 교차 확인 — 2026-11-04

이 확인은 현재 [`fetchOpenDartToday()`](../../lib/dart-opendart-client.ts)의 요청·응답 처리 코드를 OpenDART [공시검색 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001)와 대조한 정적 crosscheck다. 가이드상 API는 `GET /api/list.json`, 날짜는 `YYYYMMDD`, `page_count`는 최대 100이고 `corp_code` 미지정 시 검색기간 상한은 3개월이다. `last_reprt_at` 기본값 `N`은 정정보고서를 포함한 제출 전체를 검색한다. 이 client는 KST 당일을 `bgn_de=end_de`로 보내므로 날짜 범위는 하루이며, corp filter를 생략하고 `page_count=100`, `sort=date`, `sort_mth=desc`를 명시한다. `last_reprt_at` 생략은 현재 공식 default `N`을 사용하는 계약이다.

| 확인 항목 | 저장소 관측 / 코드 판정 | 상태와 한계 |
|---|---|---|
| 의미 query profile | source-coverage fixture의 `OPENDART_LIST_JSON` profile은 bgn/end, corp_code/class, filing type/detail, last report, sort profile을 의미 필드로 관리하고 `page_no`는 traversal field로 분리한다. 현재 요청의 effective filter는 corp/type 미지정, `last_reprt_at=N`, date descending, `page_count=100`이다. | `REPOSITORY_CONFIRMED` + 공식 가이드 default 대조. fixture는 `SYNTHETIC_SOURCE_PROFILE_PROPOSAL_NOT_RUNTIME_HASH`; durable run에 query hash로 저장되지 않는다. |
| 페이지 응답 조정 | client는 응답 page number/page size, 전체 순회 중 total count/page count 불변, ceil(total_count/100), raw row/unique receipt/missing/duplicate 집계를 비교한다. 영수증 누락·중복 또는 분모 불일치는 `PARTIAL`이 된다. | 구현된 self-consistency 검사는 확인됨. provider의 immutable snapshot/cursor가 없어 같은 분모 내 행 교체는 배제하지 않는다. |
| empty/error 처리 | API `status=013`은 당일 helper에서 no-data 결과로 취급한다. 정상 외 status와 HTTP 오류는 throw 경로로 전달된다. | `020` quota 등 공급자 오류는 현재 별도 stable coverage reason으로 보존되지 않는다. `013` empty는 그 하루 조회에서 matched row가 없다는 뜻으로만 제한한다. |
| 응답 shape/quota acceptance | DSC-25–DSC-26은 `status=000`이어도 `list`가 배열이 아니면 empty success로 받지 않고, HTTP 200의 `status=020`을 quota partial로 분류해 status/message를 보존하도록 요구한다. | 현재 runtime은 `payload.list ?? []`이며 응답 배열을 검증하지 않는다. provider status/message는 예외 문구로만 전달되고 durable coverage reason은 없다. fixture는 합성 설계 기준이다. |
| 누락·정정·저장 | code는 당일 query만 수행한다. `rcept_no` 없는 row를 계수하고 coverage partial에 반영한다. `/api/disclosures` projector의 DART persistence는 `NOT_RUN`이다. | historical correction overlap/watermark, full detail persistence, end-to-end source→document→claim reconciliation은 미구현. 운영 cron 배포·quota·총 페이지 및 외부 writer는 미확인. |

R2 상태는 query parameter 의미의 **저장소/공식 명세 crosscheck 완료**에 한정한다. 이를 production 호출 성공, 인증키 상태, 호출 quota, provider snapshot semantics, 완전성 승인 또는 데이터 사용권으로 승격하지 않는다. OpenDART의 `total_count`가 정확히 페이지 수 계산에 대응하더라도 pagination 중 결과 집합의 불변은 별도 보장으로 확인되지 않았으므로, source-window `NOT_FOUND_IN_SCOPE`의 최종 허용은 `KR-RECONCILIATION-01` owner acceptance와 coverage/rights binding을 기다린다.

DSC-25–DSC-27은 다음 설계 회차의 입력을 고정한다. 성공 status의 `list` 배열 검증, provider quota code/message의 durable failure reason, late/correction 발견 시 동일한 canonical source-query-window 재조정과 과거 as-of 이력 보존이다. 승인된 lookback 정책이 없으면 더 넓은 overlap을 임의로 요청하지 않는다. 이 합성 gate는 runtime 동작을 보증하지 않는다.

## 최근 기획 연결

- dossier의 typed unknown을 실행 약속과 혼동하지 않도록, 누락 dimension·declared scope·rights/coverage·해결 predicate를 설명하는 검증 공백 카드를 제안한다. 권리 미확정/coverage 부족/확인경로 부재/claim revision 변경을 구분하고 자동 fetch·polling·날짜/알림 생성은 하지 않는다: [EGA-01–EGA-06](../fixtures/disclosure/investment-evidence-gap-followup.v0.json), [검증 공백 카드 설계](./kr-disclosure-event-architecture.md#미확인-claim의-다음-검증-조건--ega-01ega-06), [기존 dossier unknown/coverage projection](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json).

- 기존 `/dart` 제목 분류의 `최강호재`/`호재가능`은 본문 사실·issuer 귀속·review 승인이 아니며, 회사 문자열 `localStorage` watchlist는 사건별 구독이 아니다. `TITLE_TRIAGE_ONLY` 경계의 전환안은 제목 후보→근거 검토→issuer dossier→명시적 사건 구독이다: [현 구현과의 대조](./disclosure-feature-planning-current.md#다음-제품-개선--제목-후보를-근거-검토-흐름으로-분리), [T0–T3 상세 계약](./kr-disclosure-event-architecture.md#기존-dart-제목-후보에서-검토형-투자-dossier로의-전환), [DIEG-01/06/07](../fixtures/disclosure/disclosure-investment-evidence-gate.v0.json). 구현 착수 gate는 P1–P3 권리·coverage·귀속과 `KR-DOCUMENT-UX-01`, 공개·알림 단계는 P4–P6 별도 결정을 따른다.

- 사용자 작성 투자 가설을 근거·반대 claim revision과 pin하고, 사실 주장·예측·조건부 시나리오를 구분하고 사전 review horizon·cohort freeze·late evidence 재검토·개인정보 경계 및 issuer/instrument/listing venue epoch 귀속을 갖는 journal: [thesis journal 기획](./investment-thesis-journal-design.md), [ITJ-01–ITJ-49 synthetic acceptance](../fixtures/disclosure/investment-thesis-journal.v0.json), [`KR-PERSONAL-THESIS-UX-01`](../fixtures/disclosure/decision-register.v0.json). review trigger는 typed predicate, user-authored revision/cutoff, rights와 완전한 범위 근거에 결박하고 판정할 수 없는 조건은 수동 검토로 보낸다: [ITHR-01–14](../fixtures/disclosure/investment-thesis-review-trigger.v0.json), [trigger 평가 경계](./investment-thesis-journal-design.md#사용자-검토-trigger의-평가-경계). 보유·거래 추론, 자동 점수/추천, 비보통주 및 DR/ADR 가격 시계열 연결, rights 미승인 가격성과 귀속은 제외한다.
- Thesis 내부 attribution 보류 사유를 public issuer dossier의 안전한 상태로 매핑하고 reviewer/policy 내부 식별자를 숨김: [DIDP-27–DIDP-31](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json), [attribution 상태 projection 설계](./kr-disclosure-event-architecture.md#사용자-facing-dossier-projection).
- API/UI/export/notification/cache-cursor에서 attribution hold를 한 projection snapshot으로 소비하고, 현재 legacy route·raw export·DART alert는 신규 dossier 구현으로 간주하지 않음: [DIDP-32–DIDP-36](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json), [consumer surface parity](./kr-disclosure-event-architecture.md#dossier-consumer-surface-parity--현재-구현-경계와-제안-계약).
- dossier/export의 source coverage를 source별 reconciliation manifest digest·query/window/subject 범위·correction watermark·rights/master/applicability revision으로 결박하고, `OBSERVED_STABLE`이나 저장소 0건을 `NOT_FOUND_IN_SCOPE`로 승격하지 않음: [DIDP-37–DIDP-39](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json), [manifest coverage binding](./kr-disclosure-event-architecture.md#source-coverage의-manifest-연결--didp-37didp-39), [공통 source coverage contract](../fixtures/disclosure/disclosure-source-coverage.v0.json).
- source query는 credential-free, versioned allowlist profile로 정규화한다. OpenDART 현재 조회의 KST receipt-date·all-report default·sort/page traversal을 실제 caller와 공식 guide에 대조하고, profile이 없는 RSS는 canonical scope와 negative evidence를 만들지 않음: [DSC-17–DSC-19 query scope contract](../fixtures/disclosure/disclosure-source-coverage.v0.json), [공식 OpenDART 공시검색 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001), [현재 호출 경로](../../lib/dart-opendart-client.ts).
- coverage의 내부 reconciliation state와 공개 메시지를 분리한다. 결과 상태 `NOT_FOUND_IN_SCOPE`/`NOT_REPORTED`를 완전성 상태로 쓰지 않고, 권리/미조회/부분/충돌 상태에 고정 한국어 문구를 매핑: [DPR 공개-safe coverage vocabulary](../fixtures/disclosure/disclosure-dossier-public-read.v0.json), [DIDP-40](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json), [상세 projection 설계](./kr-disclosure-event-architecture.md#query-scope-정규화와-공개-coverage-문구--dsc-17dsc-19--didp-40).

- 공시 탐색의 source coverage와 저장 query 결과를 분리: [일별 공시·RSS 통합 조회 설계](./daily-disclosure-feed-design.md), [source coverage 합성 fixture](../fixtures/disclosure/disclosure-source-coverage.v0.json).
- 일별 조회 JSON 파일을 queryStatus·정확한 KST/rolling queryWindow·per-source UNKNOWN 포함 coverage와 함께 재현 가능한 응답 snapshot으로 보존하고, 기존 줄바꿈 URL 복사를 JSON export와 구별: [DSC-20–DSC-22](../fixtures/disclosure/disclosure-source-coverage.v0.json), [조회 결과 JSON snapshot 설계](./daily-disclosure-feed-design.md#다음-제품-개선--조회-결과-json-snapshot과-url-복사의-의미-분리). 현행 다운로드는 queryStatus/sourceCoverage를 빠뜨려 아직 acceptance 미충족.
- 공통 coverage assertion은 source/window/subject scope·페이지/행 분모·정정 watermark·master/crosswalk·rights revision을 하나의 reconciliation manifest에 고정하고, dossier/ESN/FUEV 소비자의 `NOT_FOUND_IN_SCOPE`·`NOT_REPORTED`·`UNVERIFIABLE` 매핑을 자동 대조: [DSC-11–DSC-16](../fixtures/disclosure/disclosure-source-coverage.v0.json), [공통 P3 reconciliation manifest 설계](./kr-disclosure-event-architecture.md#공통-coverage-assertion-reconciliation-manifest--dsc-11dsc-16).
- 두 pass의 digest가 같아도 그 이후 late receipt/correction이 관측되면 prior as-of assertion은 역사로 남기고 current coverage/negative evidence만 만료시켜 동일 source-query-window의 재조정을 시작한다: [DSC-23–DSC-24](../fixtures/disclosure/disclosure-source-coverage.v0.json), [`KR-RECONCILIATION-01`](../fixtures/disclosure/decision-register.v0.json). 이 정책은 날짜 기간 전체의 고정 snapshot이나 provider의 미래 변경 부재를 뜻하지 않는다.
- manifest 필드 49개의 schema/runtime evidence·제안 owner·rights/retention boundary·consumer gate를 일대일 대조한다. checked-in migration/schema에 coverage persistence가 없고 운영 DB catalog는 미확인으로 남긴다: [field-to-storage ownership gap matrix](../fixtures/disclosure/disclosure-source-coverage.v0.json), [상세 대조 기준](./kr-disclosure-event-architecture.md#manifest-필드별-저장-책임갭-감사).
- 저장설계 구체화→`RECONCILED_AS_OF`→public negative evidence를 각 decision group·별도 구현 acceptance로 gate한다. register가 OPEN인 동안 승인을 추정하지 않고 source/rights/policy/master/DB/lineage 변경 시 재개방한다: [decisionGatePlan](../fixtures/disclosure/disclosure-source-coverage.v0.json), [단계별 gate](./kr-disclosure-event-architecture.md#저장reconciliation공개-단계별-decision-gate).
- `KR-DB-DRIFT-01` 제출용 환경 bundle은 Flyway/checksum·catalog·privilege·view/function/trigger·외부 writer 분모, deployment commit, row/hash·backup restore와 additive dry-run evidence를 요구한다. 로컬 read-only audit과 health 응답은 운영 drift 완료 증거로 승격하지 않는다: [databaseDriftEvidencePackage](../fixtures/disclosure/disclosure-source-coverage.v0.json), [환경 증거 절차](./kr-disclosure-event-architecture.md#kr-db-drift-01-환경-증거-패키지).
- catalog evidence는 database role별 scope·query revision·visible schema·object-kind 분모·권한 누락·digest를 대조하고, writer inventory는 배포 commit×principal×target relation을 join한다. 정적 repository writer scan은 lower bound이고 environment catalog·effective grants·owner attestation이 없으면 writer 0건 결론을 금지한다: [catalog/writer denominator contract](../fixtures/disclosure/disclosure-source-coverage.v0.json), [분모와 누락감지](./kr-disclosure-event-architecture.md#kr-db-drift-01-환경-증거-패키지).
- `DBI-01`–`DBI-10` 합성 fixture로 권한 가시성 누락, query/count failure, duplicate/order digest, 미분류 writer, dynamic target와 scope drift를 구별한다. 검사자는 합성 판정 규칙만 확인하며 운영 DB 결과로 취급하지 않는다: [database inventory golden cases](../fixtures/disclosure/disclosure-source-coverage.v0.json).
- DBI fixture는 별도 JSON Schema Draft-07 파일과 `database-inventory-golden-case.v0` contract를 갖는다. Ajv 8.17.1을 devDependency로 고정하고 checker는 표준 Draft-07 engine으로 10개 synthetic case 및 추가 속성·잘못된 타입 거부를 검사한다. 이는 fixture 구조 검증이며 live DB 관측이나 serializer acceptance를 대신하지 않는다: [정식 schema](../fixtures/disclosure/schema/database-inventory-golden-case.v0.schema.json).
- 기준일의 KST calendar day와 실제 source timestamp precision을 분리: [시간 의미 설계](./daily-disclosure-feed-design.md#현재-코드-상태-대조--기준일시각-정밀도정렬), [time semantics fixture](../fixtures/disclosure/disclosure-feed-time-semantics.v0.json).
- 사실 정정이 claim/event/publication에 미치는 영향과 delivery/inbox 수정 경계: [정정 영향 remediation fixture](../fixtures/disclosure/fact-correction-remediation.v0.json), [채널별 전달 reconciliation fixture](../fixtures/disclosure/correction-delivery-reconciliation.v0.json).
- 영향 없음 판정은 correction revision별 기대/관측 dependency denominator가 닫힌 경우에만 대상 claim 범위로 기록한다. 누락 consumer/page는 UNRESOLVED로 남기고 형제 이벤트를 자동 억제하지 않으며, 누락분을 영향 없음으로 간주하지 않는다: [FCR-03/FCR-48/FCR-49](../fixtures/disclosure/fact-correction-remediation.v0.json).
- 정정 종료 분모는 recipient-target 카드/Push/Discord exposure와 shared detail/API/cursor/cache control을 분리하고, saved/read/note 상태를 보존한다. credit block을 claim/evidence/rights/policy revision 및 최종 렌더 순서에 묶어 JCS manifest hash로 payload attempt에 고정하고, credit-only revision도 affected recipient×channel exposure로 재검토하고, 정정된 thesis-critical value·철회된 catalyst date·불명확한 issuer/security 관계는 claim freshness, catalyst status, instrument eligibility와 재검토 사유에 각각 전파; source coverage 부족은 `EVIDENCE_INCOMPLETE`, coverage 충족 후 비교 기준/해석 부족은 `REVIEW_REQUIRED`로 분리하며 둘 다 방향·점수 산출을 억제: [CDR-16–CDR-24](../fixtures/disclosure/correction-delivery-reconciliation.v0.json), [SAP-09–SAP-13](../fixtures/disclosure/source-attribution-projection.v0.json), [attribution JCS golden vector](../fixtures/disclosure/source-attribution-projection.v0.json), [정정 외부 노출 reconciliation 설계](./kr-disclosure-event-architecture.md#정정철회-후-외부-노출-reconciliation-수용-계약).
- 공시 후 가격 반응과 cohort 분석에서 사전 window·표본 분모·비교군·confounder 검색 범위를 고정한다. 접수시각과 최초 공개 가용시각, timezone/precision 근거를 분리하며 불명확하면 세션 및 반응 시작시각을 부여하지 않는다. 과거 종목 lifecycle 분모 미완결·결과 연관 누락은 headline 통계를 차단하고 observed subset으로 분리한다. 과거 수익 추세는 별도 context이며 지수 방법론/구성 as-of가 다른 비교군의 부호 충돌은 사전 지정 comparator와 sensitivity를 함께 제시한다. 하위집단과 다중가설 family는 결과 확인 전 고정하고 owner가 최소 표본·보정법·유의수준을 승인하지 않으면 confirmatory claim을 차단한다. 재실행 manifest·결과 digest를 고정하되, 원천 payload 보존/재취득 권한이 없으면 hash만으로 재현 가능하다고 하지 않고 현재 confirmatory 공개를 억제한다. provider terms revision은 영향받은 action/result만 expire하고 가격·기업행사·benchmark revision은 의존 run만 stale 처리해 rights와 재생성 가능성 확인 후 재계산한다. dependency closure가 분리된 결과는 영향 없음을 입증한 때만 유지한다: [시장반응 설계](./kr-disclosure-event-architecture.md#공시-이벤트-사후-시장반응-평가), [EPO-01–EPO-34 가격관측 합성 fixture](../fixtures/disclosure/event-price-observation.v0.json).
- 공시 수치 효과는 input claim revision·basis·formula revision·exact output hash·review decision·publication snapshot에 결박하고, 통화/반올림/overflow·missing-vs-zero와 EPS 가중평균 분모·주식 수 stage·환율 목적/기준일 경계를 분리: [FCT-09–FCT-19](../fixtures/disclosure/financing-claim-review-trace.v0.json), [공식 계산 기준과 수치 효과 trace 계약](./kr-disclosure-event-architecture.md#수치-투자효과의-재현-가능한-계산-trace).
- 사건별 자본 효과를 issuer 단위로 중복 없이 연결하는 별도 계획: periodic report base snapshot + 검토된 series/tranche movement, 행사/발행/상장 stage, `stateAsOf`/`observedAt`, unresolved denominator를 분리하고 합산 coverage를 fail-closed로 제한한다. DART/KIND 원천 완전성이나 운영 capability로 간주하지 않는다: [ICSR-01–ICSR-16](../fixtures/disclosure/issuer-capital-state-reconciliation.v0.json), [issuer capital state 설계](./kr-disclosure-event-architecture.md#issuer-단위-자본상태-roll-forward-제안--icsr-01icsr-16), [KR-CAPITAL-RECONCILIATION-01 결정](../fixtures/disclosure/decision-register.v0.json).
- 재무·감사 신호, 법원/규제 절차, KRX 관리·매매·상장심사 상태를 독립 축으로 연결하고 currentness/coverage/correction/conflict가 미확정이면 현재 상태 주장을 억제하는 timeline: [IRST-01–IRST-18](../fixtures/disclosure/issuer-risk-status-timeline.v0.json), [KR-ISSUER-RISK-STATUS-01 결정](../fixtures/disclosure/decision-register.v0.json).
- 한 issuer dossier에서 capital movement와 재무·법원·거래소 상태를 별도 섹션·revision으로 표시하되 동일 snapshot/as-of 일치와 no-cross-inference를 요구: [DIDP-13–DIDP-26](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json), [사용자 dossier 계약](./kr-disclosure-event-architecture.md#사용자-facing-dossier-projection).
- CB/BW/EB 행사 누계는 이전 신고분·동일 notice 일별행의 이중 합산을 막고, 같은 BW family에서도 달랐던 발행주식 분모의 행사수량 포함 qualifier를 receipt별로 보존해 표시 비율과 재계산치를 구분: [FUEV-09–FUEV-10](../fixtures/disclosure/convertible-outcome-evidence.v0.json), [공식 KIND 사례와 denominator basis 경계](./kr-disclosure-event-architecture.md#cbbw-eb-후속-evidence-source-map-제안).
- 행사와 추가상장 수량을 source-supported relation의 1:N/N:1 cardinality로 대조하고, 부분·집계 상장 notice에서 미대응 잔여나 행별 배분을 추론하지 않음: [FUEV-11–FUEV-14](../fixtures/disclosure/convertible-outcome-evidence.v0.json), [행사/추가상장 reconciliation 계약](./kr-disclosure-event-architecture.md#행사-notice와-별도-추가상장-notice의-수량-reconciliation-제안).
- 추가상장 검색의 valid-empty는 `NOT_FOUND_IN_SCOPE`에 그치고 전체 결과는 `OUTCOME_NOT_VERIFIED`; pagination·권리·정정 coverage 미완료는 `UNVERIFIABLE`로 분리: [FUEV-15–FUEV-16](../fixtures/disclosure/convertible-outcome-evidence.v0.json), [추가상장 search coverage 및 후속 상태 계약](./kr-disclosure-event-architecture.md#행사-notice와-별도-추가상장-notice의-수량-reconciliation-제안).
- 이미 읽은 후속 filing 안에 상장 언급이 없다는 `NOT_REPORTED`와 별도 추가상장 검색의 결과 상태를 분리하고 FUER-08의 입력 근거를 명시: [FUER-08](../fixtures/disclosure/follow-up-equity-raise.v0.json), [후속 상태 어휘 적용](./kr-disclosure-event-architecture.md#합성-dto-golden-vector-v0-제안).
- 공시 목록 존재·원문 취득·제품 내 저장/표시 권리를 분리하고, `013` 빈 결과·fetch 실패·권리 미결·정정 revision을 사용자가 구별할 출처 열기 UX로 정의: [P6 공식 원문 열기 및 접근 상태 UX](./kr-disclosure-event-architecture.md#공식-원문-열기-및-접근-상태-ux-제안), [OpenDART 검색 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001), [원문파일 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003).
- 공공데이터포털 `3075133`의 KOGL 제1유형 표시와 API 유형 `LINK`, OpenDART 약관·검색/원문 API 계약을 서로 다른 rights evidence로 관리하고 product-to-endpoint 적용 범위를 owner 질문으로 고정: [P1 라이선스 적용 범위 검토](./kr-disclosure-event-architecture.md#공공데이터포털-라이선스의-적용-범위-검토-메모), [공공데이터포털 상품](https://www.data.go.kr/data/3075133/openapi.do), [공공누리 제1유형](https://www.kogl.or.kr/info/faqList.do?cPage=1&dataGroup=2&mstIdx=KOGL_005).
- 이벤트의 각 claim을 원천·revision·권리 scope·credit policy에 결박하고, 필수 credit 잘림, provider 수락과 기기 전달 차이, stale retry, correction recipient×channel 분모까지 추적: [SAP-01–SAP-20 source attribution projection fixture](../fixtures/disclosure/source-attribution-projection.v0.json), [P1/P6 출처 표시·전송 계약](./kr-disclosure-event-architecture.md#근거별-출처-표시와-attribution-projection-제안), [official Discord formatting reference](https://discord.com/developers/docs/reference#message-formatting). [URL-01–URL-12 official source link allowlist vectors](../fixtures/disclosure/source-attribution-projection.v0.json).
- 예정일 변경·결과 미확인·완료/취소를 event lifecycle과 별개 date assertion으로 관리: [일정 lifecycle 합성 fixture](../fixtures/disclosure/event-date-lifecycle.v0.json), [범용 상태 전이 설계](./kr-disclosure-event-architecture.md#상태-전이-최소-규칙).
- 일정 reminder와 결과 미확인 follow-up의 별도 opt-in, 유한 policy, coverage별 미확인/UNVERIFIABLE 상태, revision/epoch fencing·멱등 후보를 요구: [ESN-01–ESN-18](../fixtures/disclosure/event-schedule-notification.v0.json), [follow-up notification 설계](./kr-disclosure-event-architecture.md#사건-후속-확인-큐와-사용자-구독-제안).
- 의사결정 상태는 register의 여섯 상태로 단일화하고 owner 심의·유보·consumer 활성화·재개 검토를 별도 진행 축으로 분리: [결정 종료 및 증거 추적 프로토콜](./kr-disclosure-event-architecture.md#결정-종료-및-증거-추적-프로토콜-제안).
- 상태 전이뿐 아니라 revision 연속성, scope 비승계, 승인/거절/만료 증거를 synthetic register contract로 관리: [결정 register lifecycle fixture](../fixtures/disclosure/decision-register-lifecycle.v0.json).
- 권리 허용은 정확한 source·field·action·purpose·channel·retention scope의 유일한 current decision만 적용하고, terms revision 및 descendant remediation을 class/location별 분모로 검증: [rights action/remediation fixture](../fixtures/disclosure/rights-action-decision.v0.json), [P1 evidence manifest/scope contract](./kr-disclosure-event-architecture.md#p1-진행-기록--공식-권리-증거-manifest-v1).
- remediation 재개 경합은 scope epoch·discovery watermark·case revision·finalization fence를 CAS/fingerprint로 묶고, late descendant는 과거 `RECONCILED` case를 수정하지 않고 linked 새 case로 재개: [RAD-19–RAD-22 acceptance](../fixtures/disclosure/rights-action-decision.v0.json), [동시 finalization 설계](./kr-disclosure-event-architecture.md#remediation-revision-late-descendant-동시-finalization-acceptance). 합성 조건이며 실제 DB 동시성 증명은 후속 과제다.
- admin review mutation은 shared cookie의 `SameSite=Lax`만으로 허용하지 않고, named actor·server-side permission·CSRF proof·expected revision·append-only audit를 요구하는 제안 계약을 둔다: [FCR-42–FCR-47](../fixtures/disclosure/fact-correction-remediation.v0.json), [공식 Next.js 인증 가이드](https://nextjs.org/docs/app/guides/authentication), [OWASP CSRF 예방 가이드](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). 정책은 미승인·미구현이다.
- 공시 event v1 overwrite와 revision-capable 전환: [event revision 설계](./market-impact-events-design.md), [legacy transition fixture](../fixtures/disclosure/legacy-event-revision-transition.v0.json).

- P1 권리조사를 제품 주장 없이 현재 코드의 fetch/parse/store/derive/display/distribute 경로로 구체화하고, DART RSS·OpenDART list·viewer link·contract API·KIND RSS를 별도 surface로 유지: [code/action inventory](../fixtures/disclosure/disclosure-rights-surface-inventory.v0.json), [공식 OpenDART 약관](https://opendart.fss.or.kr/intro/terms.do), [공식 검색 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001), [공공데이터 상품 3075133](https://www.data.go.kr/data/3075133/openapi.do). 모든 action은 owner 결정 전 `UNRESOLVED`.

- 기존 DART 제목 scorer를 발견 후보로 한정하고, 원문 근거·claim locator·반대 근거·정량 분모·영향 issuer·rights/common-stock gate가 통과되기 전 투자 주장을 만들지 않는 acceptance 추가. DIEG-13/14는 과거 제목 label의 미승격과 회사 watchlist의 비구독 경계를 검증: [DIEG-01–DIEG-14](../fixtures/disclosure/disclosure-investment-evidence-gate.v0.json), [근거/수치 trace 설계](./kr-disclosure-event-architecture.md#수치-투자효과의-재현-가능한-계산-trace), [OpenDART 공시검색 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001), [원문파일 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003).

- 공시 투자분석 acceptance의 gold-set 절차를 공식 유형 metadata, reproducible strata, 고정 분모, blind independent review/adjudication, rights-aware retention과 owner-set threshold로 구체화. 다중 이벤트 filing은 event별 claim/party role/direct-impact locator 단위로 판정하고 같은 종목의 상충 근거는 netting하지 않음: [DIGSP-01–DIGSP-12 protocol](../fixtures/disclosure/disclosure-investment-gold-set-protocol.v0.json), [공식 공시검색 분류와 response fields](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001), [원문파일 endpoint](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003).
- 법인코드·증권 identity·시점별 코드 alias·security class·event-time 보통주/cap eligibility를 분리하고 latest-only master로 과거 mapping을 역산하지 않음. KIS 현재 지원 master, OpenDART corpCode, KRX 제한 범위 신규/폐지 목록, SEC CIK/ticker/exchange 후보의 필드 책임·coverage 한계를 구분하고 reviewer capability·evidence retention·decision lineage를 분리: [ITC-01–ITC-37](../fixtures/disclosure/instrument-identity-temporal-crosswalk.v0.json), [공식 원천별 evidence 책임과 coverage 경계](./instrument-universe-sync.md#122-공식-원천별-증거-책임과-coverage-경계), [crosswalk 후보 검토·assertion 승격 workflow](./instrument-universe-sync.md#124-crosswalk-후보-검토와-assertion-승격-절차-제안), [reviewer 권한·packet·결정 연결](./instrument-universe-sync.md#125-reviewer-권한evidence-packet결정-연결-제안), [owner package·review-state UI](./instrument-universe-sync.md#126-owner-decision-package와-review-state-ui-제안), [OpenDART corpCode guide](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DE001&apiId=AE00004), [SEC EDGAR data guide](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data), [상세 설계](./kr-disclosure-event-architecture.md#종목-identity와-시점별-코드분류-crosswalk--itc-01itc-37).
- master 분류 정정은 과거 이벤트 snapshot을 수정하지 않고 현재 종목 eligibility/public descendant를 무효화하며 해당 instrument에 연결된 projection·thesis·notification만 재검토한다. 국내 300억 원 하한도 amount 크기만으로 우회하지 않고 cap 시점·통화·FX source scope·freshness policy가 유효할 때만 판정: [DIDP-41–DIDP-42](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json), [`KR-MASTER-SNAPSHOT-01`/`KR-CAP-FRESHNESS-01`](../fixtures/disclosure/decision-register.v0.json), [projection 상세](./kr-disclosure-event-architecture.md#user-facing-dossier-projection). Freshness window와 환율 정책은 owner 승인 전 미정.

- 현행 `kr_common_stock_universe`/`us_common_stock_universe`의 `(market, code)` 현재 행과 first/last seen은 listing effective history가 아니며 과거 issuer/security/venue crosswalk를 복원하지 못함을 operating architecture gap으로 연결: [현행 종목 universe 범위](./instrument-universe-sync.md#121-시점별-issuerinstrumentvenue-이력-범위), [thesis outcome 소비 계약](./investment-thesis-journal-design.md#발행인증권상장-venue-귀속). history storage schema/migration은 미승인.

- 검토된 사실·수치·반대 근거·위험·미확인을 섞지 않는 user dossier projection 계약 추가. 비어 있음/미검토/범위 내 미발견/권리 차단/원문 미취득의 UI 의미와 동일 snapshot gate를 분리: [DIDP-01–DIDP-12](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json), [상세 설계](./kr-disclosure-event-architecture.md). DIDP-25/26은 `CONFLICT_UNRESOLVED`와 `EVIDENCE_INCOMPLETE`를 UI에서 구별하고 사유코드·보류 상태를 노출하며 stale 승인본 fallback 및 순방향 요약/점수/매매 지시를 억제한다.
- official master class correction 및 국내 cap freshness/FX 증거 부족 시 현재 dossier 공개 descendant를 억제하고 영향 instrument만 재검토: [DIDP-41–DIDP-42](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json), [P2 결정 상태와 시점별 master 계약](./kr-disclosure-event-architecture.md#p2-진행-기록--사건-당사자와-투자-종목-귀속).
- EPO의 가격·기업행사·benchmark revision lineage가 stale run 억제, 같은 dossier snapshot·epoch, API/UI/export/notification/cache/cursor parity로 전파되도록 연결한다. price dependency와 무관한 raw fact는 dependency 분리 증거가 있을 때만 유지한다: [EPO-32–EPO-39](../fixtures/disclosure/event-price-observation.v0.json), [DIDP-43–DIDP-47](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json), [revision lineage 설계](./kr-disclosure-event-architecture.md#user-facing-dossier-projection).
- source claim·정량계산·투자 해석·공개 projection을 별도 approval 단계로 연결하고 dependency hash/권리/적격성/동일 snapshot 전이를 통합 검사: [IEPB-01–IEPB-15](../fixtures/disclosure/investment-effect-projection-bridge.v0.json), [통합 설계](./kr-disclosure-event-architecture.md).
- 반대 근거가 claim마다 어느 위험 범주·source·window·rights·coverage까지 검토됐는지 분모를 고정하고, 이름 있는 server-attributed reviewer, capability·conflict·independence policy가 불명확하면 검토 완료를 막는다. 현재 claim/review/rights/coverage hash는 investment-effect bridge에 전달하며 DCR 완료는 해석 승인을 대신하지 않는다: [DCR-01–18](../fixtures/disclosure/disclosure-counterevidence-review.v0.json), [manifest·downstream 결박·reviewer governance 설계](./kr-disclosure-event-architecture.md#claim별-반대-근거-검토-manifest).
- 권리 revision 전파에서 action별 승인 stale 범위, 보존 가능한 내부 산출, 공개 descendant 억제, push 회수 증거와 삭제 분리 및 권리 재허용 후 자동 부활 금지를 통합 검사: [IRAP-01–IRAP-10](../fixtures/disclosure/investment-rights-action-propagation.v0.json), [상세 계약](./kr-disclosure-event-architecture.md).
- 결정의 ID·owner role·scope·기본 동작·acceptance evidence는 [decision-register.v0.json](../fixtures/disclosure/decision-register.v0.json)에 두고, current status는 controlled `decision-evidence-ledger.v0.json`의 검증된 최신 revision에서 계산한다. `scripts/sync-disclosure-decision-register.mjs`가 register/evidence 표와 lifecycle baseline을 함께 생성/검사한다. IRAP은 메타데이터/status를 복제하지 않고 decision ID만 참조한다. 현재 ledger가 비어 있어 22개 모두 `OPEN`; `EVIDENCE_READY`는 권리가 아니며 `APPROVED`도 기록된 scope 밖 또는 별도 runtime gate를 열지 않는다: [decision lifecycle](../fixtures/disclosure/decision-register-lifecycle.v0.json).
- ledger hash chain 자체는 파일 전체 재작성·prefix replay를 막지 못한다. 외부 trust-domain의 detached signature/checkpoint와 monotonic sequence 검증, signer/writer 권한 분리, key rotation·compromise 복구를 `KR-OPERATIONAL-SECURITY-01`의 미결 수용 범위에 추가했다. 합성 조건은 [decision-ledger-checkpoint.v0.json](../fixtures/disclosure/decision-ledger-checkpoint.v0.json)과 [DLCP 설계](./kr-disclosure-event-architecture.md#서명된-외부-checkpoint-제안--dlcp-01dlcp-08)를 참조한다. 알고리즘·저장소·cadence·복제 수는 owner 미승인이다.
- watchlist 관련성, 기존 일반 DART 기기 선호, 사건별 명시 opt-in을 별도 상태로 분리하고 legacy 선호 자동 승격·보유 추론·타 사용자 상태 노출을 차단: [DUES-01–DUES-10](../fixtures/disclosure/disclosure-user-event-subscription.v0.json), [상세 설계](./kr-disclosure-event-architecture.md#사건별-사용자-구독과-관심-overlay-계약--dues-01dues-10).
- 구독→logical candidate→endpoint별 attempt→CDR exposure manifest→새 epoch 정정 attempt의 key·상태 연결 및 ESN/CDR 기존 gate 재사용: [DUES-11–DUES-18](../fixtures/disclosure/disclosure-user-event-subscription.v0.json), [연결 설계](./kr-disclosure-event-architecture.md#구독에서-발송-시도정정-reconciliation으로의-연결--dues-11dues-18).
- SAP/CDR/DUES 공통 attempt envelope, keyed target HMAC, ordered exposure-set digest, key rotation 및 pseudonymous retention 경계를 정합화: [DUES-19–DUES-20](../fixtures/disclosure/disclosure-user-event-subscription.v0.json), [hash·retention 설계](./kr-disclosure-event-architecture.md#target-identity-hash-및-공통-전송-envelope--dues-19dues-20).
- 기기별 master/source preference, OS 권한, event 구독, 잠금 화면 preview를 분리하고 테스트 발송 경계·DART 상세 payload·UI label/producer parity를 acceptance에 연결: [NPL-01–NPL-13](../fixtures/disclosure/push-preference-lockscreen.v0.json), [상세 설계](./kr-disclosure-event-architecture.md#푸시-선호잠금-화면-privacy-계약--npl-01npl-13).
- 테스트 POST의 code-level auth 부재와 배포 reachability 미확인을 구분하고 auth/CSRF→owner binding→rate limit→bounded target→audit 실행 순서 및 무비밀 ingress 증거를 정의: [PTDS-01–PTDS-10](../fixtures/disclosure/push-test-delivery-safety.v0.json), [실행 안전 설계](./kr-disclosure-event-architecture.md#테스트-발송의-실행-순서와-배포-근거--ptds-01ptds-10).
- DART generic projection에 기기별 preference revision, service worker 수신 시 현재 revision/master/source 재검증, subscription-key proof가 없는 상태 조회 차단과 preference UPDATE의 endpoint+p256dh+auth 일치를 반영했다. proof는 계정 identity가 아니라 subscription capability를 뜻한다. V165 migration은 작성만 했고 적용하지 않았다. 상세 미리보기, server queue 재투영, event epoch/rights, device QA, 계정 owner binding은 남음: [PPD-01–PPD-12](../fixtures/disclosure/push-privacy-dataflow.v0.json), [privacy dataflow 설계](./kr-disclosure-event-architecture.md#push-projection에서-service-worker기기-qa까지의-privacy-dataflow--ppd-01ppd-12).
- 푸시 UI source label과 preference/formatter/production sender caller를 구분하고 scanner 알림의 미구현 및 무동의 source 분기를 inventory: [PPC-01–PPC-08](../fixtures/disclosure/push-producer-catalog.v0.json), [producer parity 설계](./kr-disclosure-event-architecture.md#푸시-source-producer-inventory와-ui-parity--ppc-01ppc-08).
- 현재 제품에는 DART-only GENERIC 잠금 화면 payload, opt-in 기본값과 master/source 선호 보존, endpoint 소유 미확인 테스트 발송 차단을 적용했다. DETAILED preview, event 구독, 큐 재투영, epoch/rights gate와 실기기 QA는 미구현이다.

## 진행 원칙

- 공식 1차 자료와 현재 저장소의 caller/schema를 먼저 대조한다.
- source 접근권한은 fetch, transient parse, raw/derivative persist, quote, UI/API, backup, delete별로 분리한다. `API_GUIDE`만으로 data-product license를 추론하지 않는다.
- relation·coverage·timestamp·identity·impact의 증거가 없으면 `UNKNOWN/UNRESOLVED`로 유지하며 heuristic으로 승인 상태를 만들지 않는다.
- 모든 회차는 목적, 확인 범위, 변경 파일, 검증, 남은 위험·다음 과제, commit/push/deploy 여부를 `DEVELOPMENT_LOG.md`에 남긴다.
- 문서 checker 통과는 법무·제품 owner 승인, runtime 정확성, 구현 완료를 뜻하지 않는다.

## 이번 회차의 정정 lineage 보강

OpenDART 공시검색 가이드는 `rcept_no`, `[기재정정]`/`[첨부정정]`/`[첨부추가]`, `rm`의 `정/철` 설명을 제공한다. 저장소의 `fetchOpenDartToday()`는 `rcept_no`별 중복 제거를 수행하고 `filings`는 `(source, external_id)`를 unique key로 사용하지만, 현재 확인 범위에서 명시 predecessor/successor correction relation을 저장하지 않는다. 따라서 제목 표지나 접수번호 순서만으로 사건 relation을 자동 연결하지 않는다.

`FCR-11`–`FCR-47`는 receipt identity/relation, 정정 marker와 predecessor 구분, immutable chain, current-vs-target viewer, RSS/list exact receipt join, 중복 충돌·metadata drift, aggregate-only reconciliation, incomplete snapshot coverage 및 사용자 검토/투자결정 hold gate와 public/admin permissions, actor attribution 경계를 분리한다. 이는 실제 원문 표본 승인·수집이나 runtime correction graph가 아니다. 상세 내용과 모든 수용 조건은 [상세 아키텍처](./kr-disclosure-event-architecture.md) 및 fixture를 기준으로 한다.

### 공식 자료

- [OpenDART 공시검색 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001) — list endpoint/요청·응답/page/정정·철회 표시
- [OpenDART 이용약관](https://opendart.fss.or.kr/intro/terms.do) — 이용 조건 및 서비스/프로그램 권리 관련 조항. 제품 데이터 이용범위는 별도 판정 필요
- 공시 기반 issuer dossier 공개 KR GET 제안은 [DPR-01–DPR-25 fixture](../fixtures/disclosure/disclosure-dossier-public-read.v0.json)와 [공개 read contract 설계](./kr-disclosure-event-architecture.md#사용자-facing-dossier-projection)를 따른다. 현재 v1 baseline 비교와 OpenDART terms·KOGL catalog scope 경계, source별 credit binding, `NOT_FOUND_IN_SCOPE`/`NOT_REPORTED`/`UNVERIFIABLE`의 negative-evidence 분리를 검사한다. legacy `market-impact-events.v1`은 별도 유지하고 endpoint/partial response/attribution 문구와 withheld count 노출은 owner 결정 전 미승인이다.
