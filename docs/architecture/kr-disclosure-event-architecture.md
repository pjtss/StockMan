# 국내 보통주 공시 이벤트 구조 설계

> 상태: 제안 — 구조 검토 중, 구현·운영 승인 아님 | 담당/갱신일: Codex / 2026-11-04 | 설계 버전: 2.96

## 목적과 완료 기준

국내 상장 보통주와 공식 공시를 검증 가능하게 연결하고, 공시의 사실·분석·향후 일정·문서 변경 이력을 서로 혼동하지 않고 관리하는 구조를 정의한다. 사용자는 공시 근거에서 나온 이벤트와 일정의 현재 상태, 확정성, 마지막 확인 시각, 원문 및 정정 이력을 추적할 수 있어야 한다.

이 문서는 구조 설계만 다룬다. 수집기, 테이블, API, 화면, 스케줄, 운영 데이터는 추가·변경하지 않는다. “결함이 전혀 없음”은 유한한 검토로 증명할 수 없으므로 완료 표현으로 사용하지 않는다. 대신 아래 불변식과 수용 기준을 모두 충족하고, 미결 결정을 명시적으로 승인한 상태를 설계 승인 기준으로 삼는다.

### 검토 queue 보안 계약 — FCR-42–FCR-47

현재 관리자 인증 및 관리자 UI/API는 폐기되었다. 과거 관리자 gate는 공유 password로 서명된 cookie의 유효성만 반환했으며 actor ID나 role을 증명하지 못했다. `/api/dart`는 계속 공개 GET feed다. 따라서 이 설계의 reviewer attribution·권한 논의는 현재 구현을 설명하지 않고 향후 별도 승인 전제의 제안이다.

제안된 review read는 UI 숨김만으로 보호하지 않는다. DAL/store 접근 직전 session과 permission을 검증하고 최소 DTO만 반환한다. mutation은 named actor, server-side permission, schema 검증, `expectedRevision` compare-and-set, append-only decision evidence를 요구하며 client가 보낸 actor 값을 신뢰하지 않는다. 읽기/목록 GET은 상태를 바꾸지 않는다.

Cookie-authenticated mutation은 CSRF 통제가 필요하다. `SameSite=Lax`만으로 보호 완료로 간주하지 않으며, security owner는 synchronizer token 또는 엄격한 Origin/Referer 검증 및 token fallback 중 적용 방식을 승인해야 한다. Origin이 없거나 `null`이면 다른 검증된 defense가 통과하지 않는 한 거부한다. proxy/ingress가 전달 헤더를 보존·정규화하는 방식도 확인 대상이다. 이는 보안 계약 제안이며 구현 또는 현 프로젝트의 승인된 설정이 아니다.

공식 기준은 [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)의 DAL authorization, 최소 DTO, 각 Route Handler/Server Action별 권한 확인과 [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)의 SameSite defense-in-depth, token/origin validation이다. 수용 fixture `mutationSecurityContract`는 현행 checker가 이 경계와 미승인 상태를 고정한다.
## 기획 개선 운영판 — 2026-11-04

이 절은 공시 기반 투자 기능의 연속 기획 백로그다. 아래 순서는 설계 작성자가 정책을 대신 승인한다는 뜻이 아니며, 현재 22개 `OPEN` 결정의 상태도 바꾸지 않는다. 선행 근거가 없는 항목은 수치를 추정하거나 구현으로 우회하지 않고 `BLOCKED_BY_DECISION`으로 유지한다. 매 회차에는 코드·공식 근거·운영 증거를 다시 대조하고, 완료 조건을 충족한 항목만 닫는다.

### 사용자 목표와 제품 결과

| issuer 자본·재무·규제·시장 상태를 구별하기 | 자본 상태와 별도로 공시 신호, 법원 절차, 거래소 조치, 상장 결과 및 현재 거래 상태를 시점별 근거로 추적 | authority별 source coverage·정정·상태전이 fixture와 독립 reviewer acceptance 및 DIDP capital/risk parity |
| 목표 | 사용자에게 제공할 결과 | 완료 증거 |
|---|---|---|
| 공식 공시에서 투자 관련 사건을 놓치지 않고 찾기 | 출처별 조회 범위와 누락·부분 실패 상태를 알 수 있는 공시 탐색 | 원천별 분모·coverage가 있는 재현 실행, receipt 중복/누락 검사 |
| 실제 영향을 받는 종목을 잘못 연결하지 않기 | 제출 회사와 사건 당사자·영향 종목을 분리하고 검증된 보통주만 표시 | 공식 master snapshot 및 다자 귀속 gold fixture 통과 |
| 과거 판단이 왜 바뀌었는지 추적하기 | 정정·철회·첨부 교체, 분석·일정·승인 revision 이력 확인 | immutable source lineage와 정정 재생 fixture |
| 일정의 확정성을 오해하지 않기 | 발표된 사실, 확정 일정, 추정 일정, 완료·취소를 구별 | 날짜 유형별 공식 근거와 assertion-level 상태 전이 검증 |
| 근거를 확인한 뒤 투자 판단하기 | 사실, 해석, 반대 근거, 희석·상장유지 위험, 미확인을 나눠 검토 | claim-evidence trace와 독립 reviewer acceptance |

매매 자동 실행·수익 보장·일정만으로 한 방향 판정은 제품 목표에 포함하지 않는다. 국내 종목 노출은 공식 활성 `COMMON_STOCK` 확인과 300억 원 초과 시가총액 기준을 각각 통과해야 한다. 시총·마스터 최신성 또는 근거가 불분명하면 숨긴다.

### 개선 백로그

| 순서 | 개선 과제 | 상태 / 의존 | 다음 산출물 | 닫힘 기준 및 자동 감지 |
|---|---|---|---|---|
| P0 | 기획 기준과 승인 의존성 고정 | `IN_PROGRESS`; 설계·운영·공식 근거 상호 연결 | 본 백로그, 설계 인덱스, 문서 checker 계약 | 핵심 문서·22개 결정·열린 감사 분모·공시/자본/issuer 위험 dossier 계약이 서로 연결되고 `docs:check` 통과 |
| P1 | 공식 원천 권리와 필드 범위 확정 | `BLOCKED_BY_DECISION: KR-DART-RIGHTS-01` | DART/KIND 제품·endpoint·field·행동별 rights evidence manifest와 관측 시점/locator | 데이터/법무 owner 승인, fetch·분석·파생 저장·표시 권한을 분리 검증; checker는 미승인 evidence를 ALLOW로 바꾸지 않음 |
| P2 | 회사·종목 귀속과 적격성 확정 | `BLOCKED_BY_DECISION: KR-MASTER-SNAPSHOT-01, KR-EVENT-ATTRIBUTION-01, KR-CAP-FRESHNESS-01` | 제출자/당사자/대상 issuer crosswalk 및 시점별 master·cap 표본 | 다자 공시 adversarial set에서 오귀속 0 허용 여부를 owner가 수치 승인하고 모든 결과 재현 |
| P3 | 수집 completeness와 정정 재조정 설계 검증 | `BLOCKED_BY_DECISION: KR-RECONCILIATION-01` | 공식 pagination 표본, quota/error 분류, late-arrival·정정 denominator | source window별 누계·coverage·freshness acceptance를 승인하고 반복 실행 비교 |
| P4 | 날짜·사건 분류·분석 산출물 및 issuer 자본 상태 조정 | `BLOCKED_BY_DECISION: KR-TAXONOMY-01, KR-ANALYSIS-REPRO-01, KR-DOCUMENT-UX-01, KR-CAPITAL-RECONCILIATION-01, KR-ISSUER-RISK-STATUS-01` | 층화 official fixture catalog, fact/interpretation trace, issuer/series capital roll-forward 및 issuer 위험·거래소 상태 timeline | 원문·구조화 필드와 base snapshot·movement 대조, issuer 위험/절차/거래소 상태축 분리 및 reviewer 승인·통합 분모 수용 |
| P5 | 저장·legacy cutover 및 운영 가능성 수용 | `BLOCKED_BY_DECISION: KR-DB-DRIFT-01, KR-LEGACY-CUTOVER-01, KR-IMPORTER-OPS-01, KR-RETENTION-01, KR-OPERATIONAL-SECURITY-01` | 환경별 schema·consumer inventory와 row/hash reconciliation 계획 | destructive migration precondition 해소, immutable snapshot·restore·rollback rehearsal 통과 |
| P6 | 공개 조회와 사용자 화면 수용 | `BLOCKED_BY_DECISION: KR-CURSOR-SECURITY-01, KR-API-UI-CONSISTENCY-01, KR-DOCUMENT-UX-01, KR-EVENT-ATTRIBUTION-01, KR-MASTER-SNAPSHOT-01` | 권리 인지형 UI, issuer/instrument applicability·filter scope, 동일 snapshot API contract 및 legacy consumer 경계 | endpoint/filter replay·만료·철회·동시 갱신, capital/risk revision parity, 적용범위·context 라벨·subject suppression, 무인증 route inventory 및 no-store 검토 통과 |
| P7 | 독립 shadow acceptance 및 운영 전환 판단 | `BLOCKED_BY_DECISION: KR-SHADOW-SLO-01, KR-END-TO-END-ACCEPTANCE-01` | 고정 gold set, 전체 분모 discrepancy report, rollback evidence | 사전 승인한 누락·오귀속·날짜 정확도·지연 기준을 독립 reviewer가 충족 판정 |

순서는 권리·source와 식별 안정성이 불명인 상태에서 데이터 적재나 화면을 먼저 만들지 않도록 정했다. P1~P7의 임계값, 표본 크기, freshness 수치는 소유자가 승인하기 전 비워 둔다. P0 문서 검증은 구현 승인이나 제품 준비 완료의 대체물이 아니다.

### P0 read-only discovery package와 결정 입력물

P0의 다음 실행 산출물은 저장소 근거와 외부 owner 증거를 분리한 read-only discovery package다. 새 runtime feature나 운영 API 접근을 전제하지 않는다. 저장소에서 확인한 항목은 `REPOSITORY_CONFIRMED`와 commit/file/line·검사명으로 기록하고, 운영 DB·배포 artifact·외부 consumer처럼 저장소 밖 분모는 `EXTERNAL_EVIDENCE_REQUIRED`로 유지한다. 추정, 과거 로그, 합성 fixture를 live evidence로 바꾸지 않는다. 다섯 packet은 권리·source surface, identity·eligibility, source-window coverage/query/correction, 분석·사건 정책·수용, 저장·consumer closure를 따로 기록한다. coverage 분모에는 fetched·parsed·persisted·rejected·duplicate count를 두며, 어떤 결과도 future completeness를 보장하지 않고 scope별 reopen trigger를 남긴다.

| 패킷 | 재사용할 authoritative 문서/fixture | P0에서 남길 결과 | 승인 전 금지되는 결론 |
|---|---|---|---|
| 권리·source surface | `disclosure-rights-surface-inventory.v0.json`, `KR-DART-RIGHTS-01` | endpoint/product/field/action/purpose/channel/retention별 직접 source 근거, observed-at, 저장소 caller, owner 미확정 질문 | 이용허용, 원문/파생물 보존·공개 허가 |
| identity·eligibility | `instrument-identity-temporal-crosswalk.v0.json`, DIDP/ITC fixture, `KR-MASTER-SNAPSHOT-01`, `KR-CAP-FRESHNESS-01`, `KR-EVENT-ATTRIBUTION-01` | 법인·party·instrument의 시점별 코드·class·직접영향 근거 및 외부 master/cap evidence 필요 여부 | ticker 자동 귀속, 과거 identity 복원, 시총 freshness 승인 |
| source-window coverage·query·correction | `disclosure-source-coverage.v0.json`, OpenDART query profile, 실제 DART caller, `KR-RECONCILIATION-01` | source×query profile×window별 기대/관측 page·row 분모, fetch/persist run 연결, receipt dedupe, watermark·late/correction gap, manifest persistence와 소비자 binding 상태 | 저장된 0건을 `NOT_FOUND_IN_SCOPE`, run 성공을 완전 수집, predecessor/successor 확정, 임의 lookback/cadence 및 pass 두 번을 future completeness로 승격 |
| 분석·사건 정책·수용 | taxonomy/analysis/capital/risk/event-study/shadow golden fixtures 및 해당 decision IDs | 공식 fixture strata, 분석 재현·분모·독립 review 기준, issuer 자본/위험 상태축, shadow/end-to-end acceptance 질문 | 미승인 taxonomy·threshold·통계 정책 및 합성 fixture를 운영 성과/정책 승인으로 승격 |
| 저장·consumer closure | `databaseDriftEvidencePackage`, DBI-01–10, `KR-DB-DRIFT-01`, `KR-LEGACY-CUTOVER-01` | migration checksum/route/scheduler/importer 정적 inventory와 외부 catalog/writer/consumer 제출 요구목록 | 운영 DB drift 없음, writer/consumer 0건, cutover 안전성 |

identity·eligibility와 source-window coverage는 서로 연결되지만 별도 packet으로 유지한다. 첫 packet은 **무엇/누구에 대한 관측인가**(issuer, instrument, class, effective time, 직접영향 근거)를, 두 번째 packet은 **어느 범위를 얼마나 관측했는가**(source, query, time window, page/row denominator, run, correction watermark)를 다룬다. 어느 한쪽이 unresolved이면 다른 쪽의 통과로 negative evidence나 public eligibility를 만들 수 없다.

각 packet은 `decisionId`, scope fingerprint, source/artifact locator 또는 hash, observedAt, repository revision, 조사자 역할, checked denominator, unknown/external denominator, owner 질문, expiry/reopen trigger를 갖는다. 증거가 없는 값은 null/UNKNOWN으로 보존한다. 민감 credential, 권리 미확정 source bytes, 개인 데이터는 packet에 복사하지 않는다. checker는 합성 contract와 저장소 cross-reference만 검사하며 owner 응답이나 운영 증거는 별도 첨부되어야 한다.

P0 package 종료는 (1) 22개 decision의 packet link 및 현재 상태가 decision register와 일치, (2) 저장소 분모와 외부 미확인 분모 분리, (3) 모든 결정의 owner role과 actionable question을 기록하고, 외부 evidence 요청 전 named owner를 실제 지정, (4) 결정이 필요한 item과 read-only 조사로 진행 가능한 item 구분, (5) docs:check 통과로 판정한다. 2026-11-04 기준 crosswalk와 질문은 작성됐으나 named owner는 `NOT_ASSIGNED`이므로 P0는 `IN_PROGRESS`다. 이 종료는 P1–P7 정책 승인, 구현 착수 승인, 운영 준비 완료를 뜻하지 않는다.

#### P0 조사 실행 순서와 보고 상태

기존 `check-docs.mjs`, OpenDART query/profile 정적 검토, `databaseDriftEvidencePackage`, source coverage 및 DBI-01–10을 재사용한다. 이번 단계에서 별도 validator 프로그램은 만들지 않는다. 조사 결과는 다섯 packet 유형 보고서에 묶고, 각 검사 항목에 `PASS_REPOSITORY_SCOPE`, `EXTERNAL_EVIDENCE_REQUIRED`, `BLOCKED`, `NOT_RUN` 중 하나를 기록한다. `PASS_REPOSITORY_SCOPE`는 저장소에서 선언된 scope만 닫으며 운영환경 전체를 닫지 않는다. 미조회·권한부족·쿼리실패는 0건으로 기록하지 않는다.

| 단계 | 입력 및 실행 | 필수 산출물 | 통과 의미와 중단 경계 |
|---|---|---|---|
| R0 저장소 정적 기준선 | 고정 repository revision에서 migration/checksum, route, scheduler, importer, source caller, 기존 inventory를 재현 가능한 명령으로 조사. 모든 행에 source/action 또는 relation key와 identity 또는 query-window scope를 기록하고 같은 코드를 중복 발견한 경우의 dedupe key를 명시 | 실행 명령·revision·파일/라인 locator·검사 분모·중복제거 기준·미분류 행이 있는 manifest; rights, identity, coverage, analysis/policy/acceptance, storage/consumer 다섯 packet으로의 crosswalk | 저장소에서 관찰한 분모만 확인. 동적 SQL·실행환경 선택·외부 호출 주체는 미분류/외부 증거로 넘김. identity와 coverage 항목은 서로 다른 packet에서 각각 닫아야 함 |
| R1 합성 contract 확인 | `npm run docs:check`로 rights/source coverage 및 DBI-01–10을 검사하고 기존 golden fixture 결과를 기록 | checker 결과와 fixture ID/계약 버전 | 문서 계약의 회귀 여부만 확인. live DART 권리, 실제 DB catalog, consumer closure 승인으로 간주하지 않음 |
| R2 운영 증거 수집 요청 | DB/배포/외부 consumer owner에게 선언 scope, read-only principal, catalog query 결과, writer/consumer entrypoint 목록과 artifact revision을 요청 | owner·관측시각·query/profile·scope 및 privilege fingerprint·예상/관측 분모·digest가 있는 외부 evidence packet | 권한과 scope가 독립 검증될 때만 해당 packet 범위 결과를 판정. 미제출은 `EXTERNAL_EVIDENCE_REQUIRED`, 접근 불가/불일치는 `BLOCKED` |
| R3 결정 입력 갱신 | R0–R2 결과를 해당 decision packet과 register에 연결하고 미해결 질문·만료/재개 trigger를 검토 | 결정별 증거 locator, owner 응답 상태, 다음 조치 및 재개 조건 | 증거만으로 정책 결정을 자동 닫지 않음. named decision owner 승인 전 status는 그대로 유지 |

R2는 이 기획 문서가 운영 DB에 접속하거나 자격증명을 받는 단계가 아니다. owner가 승인된 별도 read-only 경로로 관측하고 결과를 제출한다. packet에는 credential/secret, 권리 확인 전 원문 bytes, 개인 데이터 또는 불필요한 행 수준 자료를 넣지 않는다. 결과 저장·마이그레이션·API 호출·문서 원문 fetch·정정 자동화는 수행 범위가 아니며, 결과가 없거나 조사할 수 없으면 숫자 0 대신 위 상태와 이유를 기록한다. 기존 DBI golden case는 보고 상태 전이의 합성 기대값 참조로만 쓴다.

#### source-window coverage packet 필수 분모와 연결

coverage packet은 전체 원문 행을 복제하는 ingest log가 아니라, 승인된 query profile과 source window의 관측 범위를 요약하는 reconciliation evidence다. 아래 필드가 없으면 `RECONCILED_AS_OF` 또는 `NOT_FOUND_IN_SCOPE`를 확정하지 않고 `UNVERIFIABLE`/`EXTERNAL_EVIDENCE_REQUIRED`로 남긴다.

| 필드 묶음 | 최소 기록 | 확인 실패/미확인 시 |
|---|---|---|
| 범위 식별 | source ID, versioned query profile, subject/instrument scope reference, timezone·window start/end, 해당 범위를 정의한 decision revision | window 전체 또는 subject scope를 추정하지 않고 coverage 미판정 |
| query 관측 | provider request/page cursor(민감값 제외), 페이지 수, 응답 행 수, provider total/count가 있으면 해당 값과 의미, 종료 사유, HTTP/API error class, run ID와 시작/종료시각 | 성공한 개별 요청만 기록하고 source 전체 성공으로 승격하지 않음 |
| 저장 조정 | fetched·parsed·persisted·rejected·duplicate count, stable receipt/document key 기준 dedupe, 페이지 간 overlap, fetch→persist 누락 및 parse rejection 분모 | 저장 row count를 provider 분모로 사용하지 않고 `PARTIAL` 또는 `UNKNOWN` |
| 시간·변경 lineage | source observed/published/receipt time의 각 의미, correction/withdrawal watermark, late-arrival lookback을 정한 승인 decision, prior assertion ID와 invalidation reason | 미래 변경 부재를 주장하지 않고 과거 assertion은 as-of 이력으로만 보존 |
| 계산·소비 결박 | manifest schema/revision 및 digest, source rights decision revision, identity/master snapshot reference, consumer snapshot/reference와 negative-evidence mapping | mismatch/stale이면 해당 소비자 projection을 억제하고 재조정 필요 |
| 책임·재현 | repository commit, 실행 명령/profile revision, 조사/실행 actor role reference, observedAt, denominator definition, unknown/external denominator, reviewer/owner decision reference와 expiry/reopen trigger | 저장소 검사와 external evidence를 분리; owner 미확정이면 결정은 OPEN |

페이지 total이 provider에서 제공되지 않으면 값은 `NOT_PROVIDED`이고, 응답이 빈 배열이어도 이것만으로 누락 없는 검색 증거가 되지 않는다. 다중 source의 row count를 더해 하나의 분모로 만들지 않으며, 같은 receipt/document가 여러 query/page에 보이면 source-native stable key로 dedupe한 수와 raw observation 수를 함께 보존한다. `RECONCILED_AS_OF`는 명시한 window·profile·rights·identity snapshot과 관측 시각에 한정되며 future completeness 의미가 없다.

reopen trigger는 (a) 동일 scope에 late receipt/correction/withdrawal 도착, (b) source query profile/pagination/terms 또는 quota 계약 revision, (c) master/class/alias 또는 subject attribution 변경, (d) manifest schema/dedupe rule/rights decision 변경, (e) consumer mapping·snapshot hash 불일치, (f) run 오류 정정이나 이전 분모의 재현 실패다. 해당 source×window assertion과 그 assertion을 사용하는 negative-evidence projection만 stale 처리하고, 영향 없는 사용자 기록이나 다른 scope 결과를 일괄 삭제하지 않는다. 이 packet은 `disclosure-source-coverage.v0.json`의 DSC contract를 확장하는 운영 입력 규격 제안이며 현재 DB 저장 schema나 runtime manifest를 뜻하지 않는다.

### 다음 검토 단위

1. `KR-DART-RIGHTS-01`에 필요한 공식 약관/상품별 증거와 endpoint-field-action 분모를 만들되, 권리 해석이나 동작 승인은 하지 않는다.
2. 저장소 외부 상태가 필요한 결정은 repository grep으로 닫지 않는다. DB catalog, 배포 artifact, dynamic SQL/trigger/view/grant, 외부 consumer owner 증거를 얻을 경로와 책임자를 기록한다.
3. 각 실행 fixture는 source URL 또는 artifact hash, 수집 기준시각, 전체 분모, 기대 결과, reviewer를 가져야 한다. 재현할 수 없는 과거 수동 관찰은 미검증으로 유지한다.
4. 제품 흐름은 `공시 발견 → 원문/권리 상태 확인 → 회사·종목 귀속 검증 → 주장/근거 검토 → 사건·일정 확인 → 반대 위험 검토 → 사용자 판단`으로 추적하되 각 gate의 미통과 이유를 구분한다.
5. 매 검토 후 이 백로그 상태, 문서 인덱스, `DEVELOPMENT_LOG.md`와 자동 검사 결과를 함께 갱신한다. 새 요구가 없으면 구현 파일·DB·API·운영 데이터는 건드리지 않는다.

### P2 진행 기록 — 사건 당사자와 투자 종목 귀속

이 기획은 filing을 제출한 법인, 문서에서 직접 언급되는 사건 당사자, 사건으로부터 경제적·법률적 영향을 받는 상장 발행사, 화면에 노출할 국내 주식 instrument를 별도 역할로 본다. 관계회사라는 사실은 식별 관계일 뿐 영향의 증거가 아니며, 영향 주장은 사건별 직접 근거와 검토를 요구한다. 기존 `EventRevisionParty`와 `EventSubjectInstrument` 제안 모델을 새로 대체하지 않고 적용 기준으로 구체화한다.

| 관계/근거 등급 | 판단 가능한 사실 | event subject 연결 | 허용 결과 |
|---|---|---|---|
| `FILING_SUBMITTER` | DART `corp_code`/공시 목록 행 또는 SEC filing issuer가 filing을 제출했다 | 사건 영향 증거가 별도 없으면 subject 아님 | filing-party만 기록. 종목은 공식 master crosswalk로 식별할 수 있으나 이 이유로 event 노출 금지 |
| `DIRECT_NAMED_PARTY` | 원문이나 해당 공식 structured field가 계약상대방·합병 당사자·피소/제소 당사자·발행대상 등 역할을 명시한다 | 정확한 법인 identity와 locator를 resolve하고 해당 역할만 event revision에 연결 | 당사자 표시 후보. named party라는 사실만으로 상장 parent/주가 영향 종목으로 승격 금지 |
| `DIRECT_SUBJECT_LINK` | 원문이 대상 상장 issuer/security를 직접 특정하거나, event에 적용되는 공식 structured field가 당사자 역할과 instrument를 명시한다 | 원문/field→party→활성 instrument crosswalk가 연쇄 검증된 경우 subject 후보 | reviewer 승인 전 `PENDING_REVIEW`; 승인 후에만 subject eligible gate 평가 |
| `EXPLICIT_AFFECTED_ISSUER` | 공식 원문이 자회사·모회사 등 다른 상장 issuer를 직접 영향을 받는 주체로 명시하고 사건 관계를 설명한다 | entity link만 저장하지 말고 이 사건의 직접 영향 문장/field를 claim으로 연결 | 다자 attribution reviewer 승인 시에만 subject 후보. 단순 그룹 계열관계는 불충분 |
| `RELATIONSHIP_ONLY` | 회사 간 자회사/관계회사 관계, 공통 주소·이름 유사, 시장 관행 또는 사용자의 추론 | 직접 영향 근거가 없으므로 subject 연결 금지 | `UNVERIFIED`/quarantine; 추론으로 ticker를 만들지 않음 |
| `CONFLICTED_OR_AMBIGUOUS` | 원문·정정 제출 간 subject가 다르거나, 비상장/외국 법인 동명·다중 증권 클래스 등 안정 identity를 확정하지 못함 | 임의 선택/merge 금지 | 관련 subject만 suppression하고 미해결 사유와 후보를 reviewer queue에 유지 |

#### 검토자 적용 순서와 예시

1. DART `corp_code`, `stock_code`, `flr_nm`, `corp_cls`, `rcept_no`는 목록이 식별하는 제출 법인·상장 코드·접수일·접수번호로만 기록한다. OpenDART 공식 공시검색 가이드도 `flr_nm`을 “공시 제출인명”, `corp_code`를 “공시대상회사”, `rcept_no`를 접수번호로 정의하며 사건의 영향 issuer를 나타내는 field라고 규정하지 않는다. `corp_cls` Y/K/N도 시장 법인 구분일 뿐 프로젝트의 활성 `COMMON_STOCK` instrument-type 증명으로 사용하지 않는다.
2. 원문 또는 권리 검토를 통과한 structured API의 정확한 field locator에서 사건과 당사자 역할을 각각 추출한다. 제목, 요약, 검색결과 snippet은 locator가 될 수 없다. structured API가 일부 정보를 제공하거나 정확성·완전성을 보장하지 않는다는 provider 고지는 미기재 당사자/subject가 없다는 증거가 아님을 뜻한다.
3. 당사자 법인을 안정 identity crosswalk로 resolve한다. 같은 법인명·그룹 관계만으로 ticker를 고르지 않는다. 복수 상장 증권, 보통주/우선주, DR/비상장 법인이 후보면 공식 instrument master로 정확히 구분하며 확인 불가 시 `UNRESOLVED`다.
4. 영향을 받는 issuer가 제출자와 다르면 “어떤 권리·의무·현금흐름·자산·영업·지배관계가 어떻게 직접 연결되는가”를 원문 근거 claim으로 적고, 반대 근거/법적 조건/비상장 intermediary도 같이 검토한다. 그룹 관계나 중요성 추측만 있으면 `RELATIONSHIP_ONLY`로 끝내고 공개하지 않는다.
5. 정정·취소·첨부 교체에서 party/subject가 바뀌면 과거 관계를 수정하지 않고 새 filing/event revision에 새 assertion을 붙인다. 충돌이 해결되기 전에는 새 subject를 승인하지 않고 기존의 근거가 무효화된 subject는 별도 suppression한다.
6. attribution reviewer가 filing ID, party role, stable entity ID, source revision/hash, exact locator, claim ID, instrument identity/master snapshot, conflicting candidates와 결정 이유를 확인한다. reviewer 승인 뒤에도 활성 `COMMON_STOCK`와 KRW 30bn 초과 cap/freshness eligibility는 별도 판정한다.

**보류 예시:** 상장 지주사가 자회사 주요경영사항을 제출했지만 본문상 자금보충 약정 당사자는 비상장 서비스 법인인 경우, 지주사 제출자 ticker를 자동으로 붙이지 않는다. 서비스 법인과 상장 자회사의 차입/보증·손익·법적 의무를 원문에서 추적하고, 공시가 어느 상장사의 직접 권리·의무를 명시하는지 확인한다. 관련 연결고리 또는 직접 영향 문구가 확인되지 않으면 제출자와 당사자만 기록하고 상장 종목 event subject는 unresolved로 유지한다.

#### P2 수용 fixture 분모

Gold fixture는 단순 회사 일치 사례만으로 구성하지 않는다. 최소 분류군은 (a) 제출자=영향 issuer, (b) 모회사 제출/자회사 직접 당사자, (c) 비상장 자회사/계열사만 원문에 등장, (d) 계약상대방 또는 피소 당사자와 제출자 분리, (e) 다수 issuer가 서로 다른 권리·의무를 가지는 복수 subject, (f) 정정에서 subject·역할 변경, (g) 동명 법인·복수 증권 클래스·비상장/해외법인 교차, (h) structured field와 본문/첨부가 불일치, (i) 원문/권리 evidence 부족을 포함한다. 각 fixture는 positive 및 negative candidate, 기대 `partyRole`, 기대 subject set 또는 empty/unresolved, 사용 금지되는 단순 관계 근거, 직접 locator, master/cap snapshot, 정정 lineage, 독립 reviewer를 가진다.

오귀속 0건, 미분류 허용률, 후보 수·표본 기간·분모, reviewer 일치도 기준은 정책 소유자가 승인하기 전 미정이다. 이 표는 그 임계값을 정하지 않는다. `KR-EVENT-ATTRIBUTION-01` 및 `KR-MASTER-SNAPSHOT-01`이 `OPEN`인 동안 이 기준을 운영 자동 판정·공개 gate로 사용하지 않는다. P2는 `BLOCKED_BY_DECISION: KR-EVENT-ATTRIBUTION-01, KR-MASTER-SNAPSHOT-01, KR-CAP-FRESHNESS-01` 상태를 유지한다.

### 개인 관심종목 맥락화 제안 — 보유 사실 추론 금지

현재 `user_watchlist`는 인증 사용자별 `(market, code, created_at)`만 저장한다. 수량·평단·계좌·보유 여부·투자 목적이 없으므로 watchlist match를 “보유 종목”, “손익 영향”, “포트폴리오 위험”으로 표현하지 않는다. 이 proposal은 global event publication과 개인별 relevance overlay를 분리하고, user context는 인증된 사용자 자신의 watchlist에서만 계산한다.

현재 코드 대조에서 `app/api/watchlist/route.ts`와 `lib/user-watchlist.ts`는 사용자별 종목 관심 등록·조회·삭제를 처리하며 보유수량이나 사건 구독은 저장하지 않는다. `app/api/push/subscribe/route.ts`와 `lib/push.ts`의 `dartEnabled`는 기기별 일반 DART 알림 선호다. 이 설정을 신규 사건별 opt-in으로 재해석하거나 watchlist 추가만으로 사건 구독을 생성하지 않는다. 일반 DART 피드 알림 선호와 사건 event transition 구독은 별도 scope·revision·철회 상태를 가진다.

#### 사건별 사용자 구독과 관심 overlay 계약 — DUES-01–DUES-10

관심종목은 개인의 탐색·관련성 overlay이고 사건 구독은 사용자가 특정 event와 받고 싶은 transition/channel을 직접 선택한 별도 기록이다. 기존 `dartEnabled=true`는 기존 일반 피드 선호로만 유지하고, 데이터 이전·신규 API·UI에서 특정 사건 구독 동의로 승격하지 않는다. 직접 사건 구독은 watchlist와 독립적으로 존속하며, watchlist 삭제는 관련성 표시만 제거한다. 사건 구독 철회는 해당 사용자·구독 revision의 queued candidate를 막고 다른 사용자의 상태나 전역 event를 바꾸지 않는다.

watchlist 기반 사건 관련 표시/알림 후보는 `EventSubjectInstrument`의 승인된 exact canonical match 및 공식 master의 활성 COMMON_STOCK, 시총 하한, freshness, rights/publication gate를 모두 통과해야 한다. 제출자만 일치하거나 당사자·대상 관계만 확인된 경우 직접 영향 종목으로 올리지 않는다. 보유 사실·손익·수량·비중은 주장하지 않는다. 개인 구독과 상태는 인증 사용자 전용이며 공개 GET·검색·공개 카운트에 섞지 않는다. 구독 생성·전환·철회와 개인 read/dismiss/mute는 global event lifecycle 및 reviewer disposition을 변경하지 않는다.

수용 fixture [`disclosure-user-event-subscription.v0.json`](../fixtures/disclosure/disclosure-user-event-subscription.v0.json)의 `DUES-01`–`DUES-10`은 관심과 구독 분리, legacy 선호의 의미 보존, exact approved subject gate, 사용자 격리, 철회 revision fencing 및 전역 상태 불변을 고정한다. 일정별 opt-in, date assertion fencing, 발송 idempotency는 기존 ESN 계약을 그대로 사용한다. 현재 제품 구현/DB/API 변경이나 구독 schema 승인을 의미하지 않는다.

#### 구독에서 발송 시도·정정 reconciliation으로의 연결 — DUES-11–DUES-18

발송 pipeline은 logical candidate, channel별 recipient target, provider attempt, observed receipt를 서로 다른 identity로 기록한다. candidate idempotency tuple은 `recipientScopeId + subscriptionId + subscriptionRevision + eventId + eventRevisionId + notificationKind + channel + notificationPolicyRevision + publicationEpoch`로 제안한다. 재실행은 같은 tuple의 candidate를 합치되, 하나의 사용자 candidate가 여러 push endpoint에 fan-out되면 endpoint마다 별도 attempt를 만들고 ledger에는 raw endpoint 대신 target identity hash를 쓴다. raw endpoint와 credential은 fixture·audit manifest에 저장하지 않는다.

dispatch 직전에는 current publication epoch/revision, rights 및 subject eligibility, 명시 구독의 현재 revision/scope, account 상태, endpoint 활성 및 현행 source/device preference를 모두 재검증한다. 현재 DART `dartEnabled=false`는 일반 DART push를 막는 현재 device gate이므로 사건별 opt-in을 대체하지 않으며, 제안된 사건별 DART push에도 suppression gate로 적용한다. `true`만으로 event consent가 생기지 않는다. event transition, 확정 일정 reminder, 추정 일정 recheck는 다른 opt-in과 `notificationKind`를 유지한다. dispatch 후 provider accepted는 기기 전달이나 사용자 열람 증거가 아니며, post timeout은 outcome unknown으로 보존하고 같은 논리 attempt를 blind retry하지 않는다.

정정·철회 대상은 활성 구독자 전체로 확장하지 않고 CDR의 완전한 affected recipient×channel exposure set과 correction relation으로 계산한다. 영향 분모가 incomplete/unresolved면 완료·전달 범위 주장을 막는다. 새 correction notice는 새 source/event revision과 publication epoch의 append-only attempt다. 이미 provider가 수락한 과거 push를 수정·삭제했다고 주장하지 않으며, 과거 링크 클릭은 ESN-12처럼 현재 epoch/권리 gate에서 다시 조회한다. 따라서 각 레이어의 연결은 `subscription → candidate → target-specific attempt → exposure manifest → correction target/new-epoch attempt`로 추적하되, CDR의 surface/attempt 기준을 재정의하지 않는다.

`disclosure-user-event-subscription.v0.json`의 `DUES-11`–`DUES-18`은 이 key/state crosswalk를 고정하고 CDR-04/05/07/16/18 및 ESN-06/07/12의 기존 경계를 재사용한다. DUES는 설계 fixture이지 실제 DART 푸시 runtime의 ledger·provider receipt·정정 회수 기능을 증명하지 않는다.

#### target identity hash 및 공통 전송 envelope — DUES-19–DUES-20

공통 contract 이름은 `DELIVERY-TARGET-HASH-v1`이며 `targetIdentityHash`는 단순 SHA-256이 아니라 `HMAC-SHA-256(UTF8(domainSeparator) || 0x00 || UTF8(RFC8785 JCS(target object)))`로 제안한다. domain은 `KR-DISCLOSURE-DELIVERY-TARGET-v1`이다. target object는 provider·surface kind·target kind·provider가 준 opaque target identifier를 포함한다. endpoint/webhook ID는 adapter 경계에서 transient하게 해시하고 raw 값은 delivery attempt·exposure manifest·로그에 저장하지 않는다. 입력 정규화는 provider adapter revision에 고정하며 endpoint URL의 query나 path를 임의로 지우거나 rewrite하지 않는다. hash에는 `targetIdentityKeyId`를 함께 기록한다. 합성 HMAC golden vector의 key는 테스트 전용이며 운영 key로 사용하지 않는다.

DUES, SAP, CDR의 `deliveryAttemptFields`는 동일 순서의 공통 envelope로 맞춘다: `candidateId`, `targetIdentityHash`, `targetIdentityKeyId`, `attemptNumber`, `creditState`, `payloadHash`, `creditManifestHash`, `creditComponents`, `rendererRevision`, `locale`, `notificationRevision`, `rightsDecisionRevision`, `attributionPolicyRevision`, `publicationEpoch`, `providerOutcome`, `deviceDeliveryObservation`. 이 envelope는 후보/attempt/exposure target을 연결하고 credit·payload revision을 각 실제 시도에 pin한다. `payloadHash`와 `creditManifestHash`는 기존 SAP 계약을 그대로 쓰며 target identity hash와 서로 대체하지 않는다.

CDR의 expected/observed exposure set digest는 target row의 `exposureId` 중복을 reject한 뒤 UTF-8 exposureId 순으로 정렬하고 `SHA-256(UTF8("KR-DISCLOSURE-EXPOSURE-SET-v1") || 0x00 || UTF8(JCS(exposures)))`로 계산한다. shared-surface control set은 별도 `KR-DISCLOSURE-SHARED-CONTROL-SET-v1` domain을 써 target recipient row와 합산하지 않는다. CDR fixture의 golden vector가 해당 digest를 재계산해 고정한다.

이 hash의 분류는 `PSEUDONYMOUS_PERSONAL_DELIVERY_METADATA`이며 재연결 가능한 가명 식별자이므로 익명 데이터로 보지 않는다. raw target은 신규 attempt/manifest에 보존하지 않는다고 제안하지만, hash 및 key version의 보유 기간·목적·backup expiry는 owner 정책 revision이 없어서 미정이다. 계정 삭제 후 active subscription과 lookup mapping을 제거하고 delivery exposure hash는 승인된 보존 근거와 만료가 있는 경우에만 제한 보존한다. key rotation 후 이전/현재 key 사이의 mapping이나 승인된 overlap이 없으면 cross-key reconciliation을 성공 또는 “영향 없음”으로 처리하지 않고 blocked로 남긴다. 실제 retention 기간과 key destruction 절차는 데이터/보안 owner 결정 전 미승인이다.

#### 푸시 선호·잠금 화면 privacy 계약 — NPL-01–NPL-13

현재 설정 화면은 endpoint별 DB 선호를 다룬다. `components/push-provider.tsx`의 `enablePush()`는 browser permission을 요청하고 service worker를 등록한 뒤 Push subscription을 생성·조회하고 `/api/push/subscribe`에 `dartEnabled: true`를 전송한다. 전체 master와 카테고리 선택은 독립 상태이며 새 구독은 DART만 opt-in한다. 화면과 API는 현재 브라우저 endpoint의 설정만 노출하고, 전역 구독 개수·다른 endpoint·User-Agent는 반환하지 않는다. GET endpoint-only 상태 조회는 401로 거부한다. POST/PATCH는 browser Push subscription의 p256dh/auth를 함께 받아 저장 row와 대조하고, preference UPDATE도 endpoint와 두 키가 모두 일치할 때만 수행한다. POST의 endpoint conflict upsert도 저장 키가 일치할 때만 갱신하므로 endpoint URL만으로 키 교체/선점할 수 없다. 이는 subscription capability proof이며 계정/사람 identity binding은 아니다. XSS 또는 subscription key가 유출된 브라우저 context는 여전히 device를 가장할 수 있다.

현재 구현은 DART Push에 “공시 알림 / 새 공시를 확인하세요.”만 넣고, service worker도 exact GENERIC projection 외 payload를 표시하지 않는다. 수신 시점에 endpoint별 현재 mode/revision/master/source를 다시 확인해 설정 변경 뒤 늦게 도착한 payload를 억제한다. 현재 사용 가능한 mode는 `GENERIC`뿐이다. 향후 `DETAILED` mode를 제공하려면 해당 기기에서 사용자가 명시적으로 선택하고 preference revision에 묶어야 하며, 이는 event consent나 OS permission과 별도 preference다. 이미 OS에 표시된 알림은 앱 설정 변경으로 회수할 수 없다.

현재 `/api/push/test`는 `PUSH_TEST_UNAVAILABLE`과 HTTP 503을 반환하며 DB 조회·전송을 하지 않고, 설정 UI의 테스트 버튼도 비활성화되어 있다. 과거 `sendTestPush()`는 전체 endpoint 목록에 fan-out했으며 해당 경로는 제거됐다. `middleware.ts`는 request ID/log 처리만 하며 authorization을 제공하지 않는다. push subscription settings route는 endpoint만으로 상태를 읽지 않으며 p256dh/auth proof를 요구하고, preference update/upsert는 endpoint와 key pair가 모두 일치할 때만 허용한다. 이 capability proof는 계정/사람 identity를 제공하지 않으며 XSS나 브라우저 context 침해에 취약할 수 있다. 테스트 발송을 다시 열려면 `OWNER_OR_ADMIN` authorization과 소유 endpoint proof, bounded target, 명백한 테스트 표식, 실제 issuer/투자 signal 미사용이 필요하다. 배포 ingress의 제한은 별도 관측 전 근거로 간주하지 않는다.

현재 `app/notifications/page.tsx`는 production caller가 확인된 DART 공시 알림만 안내한다. `INTENSITY`와 `TOP_RISING`은 production caller가 없고 설정 UI에서도 제거했으며, sender는 DART 외 source를 발송하지 않는다. UI label이나 preference field만으로 scanner delivery를 주장하지 말고, 새 producer는 producer→filter→sender 경로와 source inventory를 함께 검증한다.

수용 fixture [`push-preference-lockscreen.v0.json`](../fixtures/disclosure/push-preference-lockscreen.v0.json)의 `NPL-01`–`NPL-13`은 master/source preference 불변, 최초 단일 source 선택, permission 분리, device scope 표시, generic preview, queued payload 재검증, 테스트 endpoint authorization/격리, 테스트 메시지 비모사와 설정 label/production producer parity를 고정한다. ESN-11의 push preview 최소 공개와 DUES의 event-specific opt-in은 그대로 유지하며 이 fixture는 현재 runtime을 통과한 것으로 판정하지 않는다.

##### 푸시 source producer inventory와 UI parity — PPC-01–PPC-08

현재 `sendPushAlerts()`의 production call site를 `app/components/lib/scripts/netlify/functions`에서 test 파일과 sender 정의를 제외하고 검색한 결과 production caller는 `lib/dart-automation.ts:deliverCandidate` 하나다. 따라서 DART만 `PRODUCTION_DELIVERY_VERIFIED`로 기록한다. `INTENSITY`와 `TOP_RISING`은 설정 field만 남아 있고 production caller가 없어 UI에서 알림 설정을 제거했으며 sender도 DART 외 source를 fail-closed로 건너뛴다.

`NEWS_RADAR`는 notifications UI의 독립 동의 설정 및 production caller가 확인되지 않아 `FORMATTER_ONLY_NO_CONSENT`로 분류한다. sender는 DART 외 source를 발송하지 않으며, 별도 명시 preference·검증된 producer·필터·사용자 설명이 승인/구현되기 전까지 fail-closed 상태를 유지한다.

실제 producer를 추가할 때는 `source → producer → eligibility/filter → sender → endpoint preference → payload → delivery outcome`의 전 경로, source별 동의 키, 중복/idempotency와 실패/미확인 처리, UI label을 함께 등록한다. UI에서 알림을 약속할 수 있는 상태는 producer와 sender, preference gate, 대상 source 테스트까지 모두 확인한 경우뿐이다. source enum/formatter만 추가된 것은 `FORMATTER_ONLY`; preference와 dispatcher gate만 존재하는 것은 `PREFERENCE_AND_FORMATTER_ONLY`; 권한 경로가 빠진 구현은 `FORMATTER_ONLY_NO_CONSENT` 또는 차단 상태다. 매 회차 source-tree static scan 결과와 선언된 production call-site inventory가 다르면 docs checker가 실패한다.

합성 수용 조건은 [`push-producer-catalog.v0.json`](../fixtures/disclosure/push-producer-catalog.v0.json)의 `PPC-01`–`PPC-08`이다. inventory checker는 production caller 및 UI label parity와 비활성 테스트 route를 확인한다. 이는 실제 provider receipt나 배포 ingress evidence를 대신하지 않는다.

##### Push projection에서 service worker·기기 QA까지의 privacy dataflow — PPD-01–PPD-12

현재 DART 경로는 notification settings page → `PushProvider` device-local source/master preference → `dart-automation` → `sendPushAlerts()`의 GENERIC title/body, 임의 UUID tag, 일반 `/disclosures` target → Web Push endpoint → `public/sw.js`의 generic renderer → 공시 목록 열기다. payload에는 `notificationId`, 기기 `preferenceRevision`, `previewMode`, `publicationEpoch:null`, renderer revision을 포함한다. service worker는 payload 형식을 확인한 뒤 Push subscription의 p256dh/auth proof로 현재 preference를 다시 조회하고, master/source가 꺼졌거나 mode/revision이 바뀌었거나 조회에 실패하면 OS 표시를 억제한다. DART payload에서 회사·공시 제목·키워드·등급·원문 URL을 제거했다. 신규 구독은 DART만 켜고 scanner source는 끈다. migration V165는 작성했으나 DB에 적용하지 않았다. `DETAILED` mode, event subscription, server queue 재투영, publication epoch/rights 상세 조회, device preview QA와 계정 owner binding은 아직 없다. 이미 OS에 표시된 notification은 preference revision으로 회수되지 않는다.

현재 projection은 server-side에서 endpoint별 preference revision과 `GENERIC` mode를 읽고 visible title/body/actions/tag/opaqueTarget만 직렬화한다. service worker는 수신 때 현재 preference revision과 master/source opt-in을 재검증하여 오래된 generic projection도 표시 전에 억제한다. `GENERIC` 값은 “공시 알림 / 새 공시를 확인하세요.”이며 회사·정확한 공시 제목·키워드·등급·금액을 노출하지 않는다. 현 DART 목록 알림은 canonical event가 아니므로 `publicationEpoch`은 null이며 알림 클릭은 공시 목록만 연다. server queue 재투영과 `DETAILED` mode, event notice는 미구현이다. 이후 event notice는 별도로 DUES event subscription과 현재 publication/rights gate를 통과해야 하며 상세 미리보기 선택은 구독 동의가 아니다.

향후 `DETAILED` queue가 생기면 dispatch 직전 현재 설정으로 재생성하거나 억제해야 한다. 현 generic-only worker는 전달 중 preference가 바뀐 payload를 수신 후 stale revision으로 억제한다. event link는 opaque in-app target으로 두고 클릭 시 current epoch/rights gate를 다시 조회해야 한다. 사용자가 app preference를 꺼도 이미 OS에 표시된 notification을 앱이 회수했다고 보장하지 않는다. App `previewMode`와 OS의 lock-screen preview setting은 별개 변수로 기록하며 앱이 OS 동작을 보장한다고 표현하지 않는다.

기기 수용 matrix는 owner가 지원할 browser/OS/device 조합을 사전 선택한 뒤 browser·OS 버전, OS preview 설정, permission, app mode, build digest, 실행시각, 실제 visible title/body/actions, 결과와 evidenceRef를 저장한다. 실기기 screenshot/log에는 실제 사용자나 filing data를 쓰지 않고 synthetic content만 사용한다. matrix owner·지원 분모·최소 성공 기준이 비어 있으면 device QA는 `NOT_RUN`이며 지원 완료를 주장하지 않는다. PPD-01–PPD-12는 [`push-privacy-dataflow.v0.json`](../fixtures/disclosure/push-privacy-dataflow.v0.json)의 synthetic acceptance이고 현재 serializer/SW/device behavior에 대한 runtime proof가 아니다.

##### 테스트 발송의 실행 순서와 배포 근거 — PTDS-01–PTDS-10

`POST /api/push/test`는 현재 `PUSH_TEST_UNAVAILABLE`과 HTTP 503을 반환하며 DB 연결·endpoint 조회·전송을 수행하지 않는다. notification UI도 테스트 발송을 비활성화하고 사유를 표시한다. 기존 broadcast helper는 제거했다. 따라서 저장소 코드 경로의 side effect는 fail-closed지만, 외부 도달성 및 ingress policy는 별도 배포 evidence가 없어 `EXTERNAL_REACHABILITY=UNVERIFIED`다.

처리 순서는 `AUTHORIZATION → CSRF_IF_COOKIE_AUTH → ACTOR_RATE_LIMIT → OWNER_TARGET_RESOLUTION → PREFERENCE_CHECK → TEST_PAYLOAD_RENDER → SCOPED_DISPATCH → APPEND_ONLY_AUDIT`로 고정한다. 사용자 테스트 발송을 제공하려면 account authorization과 session mutation에 적용되는 CSRF 검증 뒤에 owner-target binding을 resolve해야 한다. 현재 `push_subscriptions`는 endpoint unique key만 있고 user owner ID가 없으므로 self-service endpoint ownership은 입증할 수 없다. owner mapping migration 및 검증이 승인·완료되기 전 self-service test는 fail-closed로 막고, 운영자 테스트만 사용한다면 사전 승인된 명시 target allowlist와 recipient cap을 둔다. 어느 경로든 global `loadPushSubscriptions()` fan-out은 금지한다. Rate limit은 actor/target 기준, versioned policy, audit outcome을 요구한다.

배포 보호를 PASS 처리하려면 환경 이름·검증시각, route mapping/redirect, Edge/middleware chain, auth 정책, WAF/rate-limit rule, 실제 배포 digest와 negative request evidence를 포함한 무비밀 evidence bundle을 남긴다. bundle에 secret/token/header credential 원문은 포함하지 않는다. 일부 ingress 설정만 확인되거나 evidence 만료/배포 digest mismatch면 `UNVERIFIED`로 유지한다. acceptance는 [`push-test-delivery-safety.v0.json`](../fixtures/disclosure/push-test-delivery-safety.v0.json)의 `PTDS-01`–`PTDS-10`으로 검사하며, 정적 검사는 배포 환경을 증명하지 않는다.

| 관계 유형 후보 | 판정 조건 | 사용자에게 허용되는 맥락 문구/동작 | 금지 추론 |
|---|---|---|---|
| `VERIFIED_WATCHLIST_SUBJECT_MATCH` | 공개 승인된 `EventSubjectInstrument.instrumentId`가 현재 사용자의 같은 market/canonical instrument watchlist 항목과 exact match; 활성 common/master/cap/freshness gate도 통과 | “관심 종목과 직접 연결된 사건” 및 직접 연결 근거/종목 역할을 표시 | 사용자가 실제 주식을 보유함, 보유 수량·손익·비중에 영향이 얼마인지 주장 금지 |
| `FILING_ENTITY_MATCH_ONLY` | watchlist 종목이 filing submitter와 일치하지만 approved direct event subject relation은 없음 | 노출 권리·검토 정책이 허용할 경우 “관심 종목이 공시 제출 회사로 확인됨; 사건 영향 종목은 별도 확인 필요”를 관계 유형과 함께 표시 | 이를 “종목에 직접 영향”으로 승격하거나 기본 event subscription을 자동 생성 금지 |
| `COUNTERPARTY_OR_TARGET_MATCH` | watchlist 종목 issuer가 event의 직접 계약 상대방/대상 법인으로 확인되나 주가 영향 subject 승인이 별도 필요 | 근거가 승인된 수준까지만 상대방/대상 역할로 설명하고, subject 승인 전에는 직접 영향 종목 목록/알림에서 차단 | 단순 계약 상대방/합병 대상이라는 이유만으로 경제적 영향 방향/크기를 단정 금지 |
| `RELATIONSHIP_CONTEXT_ONLY` | 그룹·자회사/모회사·계열·공통 이름 등 관계 정보만 match | 별도 context 링크가 권리·UX 정책을 통과한 경우 “관련 기업 정보”로 구별 | 상장 ticker 귀속·직접 영향·동일 기업으로 합치기 금지 |
| `UNRESOLVED_OR_INELIGIBLE` | identity, source rights, filing-to-subject edge, master/cap/freshness 중 하나라도 unresolved/fail | public gate가 허용하는 일반적인 정보 보류만 표시하거나 row 전체를 숨김 | user watchlist match로 내부 blocker를 우회하거나 비공개 event 존재를 드러내지 않음 |

개인화는 event의 `market + stable instrumentId`를 canonical key로 사용한다. 문자열 ticker/name만 맞는 alias·코드 재사용·시장 간 동명은 후보 탐색에만 쓰며 정확한 identity crosswalk가 없으면 match를 확정하지 않는다. multi-subject event는 subject별로 각기 계산하고 사용자의 watchlist와 일치한 종목의 relation만 강조한다. event-level positive interpretation을 해당 종목에 자동 복사하지 않는다.

인증 server는 request 사용자 ID에서 watchlist를 읽어 공개 승인 event snapshot과 결합한다. 개인 relevance overlay는 별도 private response/field로 계산하며 canonical event revision, global publication list, 다른 사용자의 결과·count에 쓰지 않는다. 공개 무인증 GET은 `isOnMyWatchlist`, 구독자 수, watchlist ID, user preference를 절대 포함하지 않는다. event detail deep link는 request마다 publication rights/epoch를 다시 검사한다. 사용자의 관심 표시 제거·mute/dismiss는 자기 개인화/구독 설정만 바꾸고 global event, subject attribution, reviewer disposition에는 영향을 주지 않는다.

종목을 watchlist에 추가하는 행위와 해당 event type/status 변화 알림을 구독하는 행위는 분리된 opt-in이다. 개인 event alert는 사용자가 대상 market/instrument/event type/transition/channel을 명시한 경우에만 보낸다. 알림 수신을 실제 보유나 주문의 증거로 취급하지 않는다. 현재 watchlist schema를 포트폴리오 기능으로 확장하지 않는다. 보유량/평단/거래계좌 연결이 미래에 필요하면 별도 사용자 명시 입력·동의·민감정보 접근통제·목적 제한·보존/삭제·정확도/기준시각 계약과 신규 privacy/security decision이 먼저 필요하다.

##### 개인 공시 검토 노트 — 사용자 판단의 revision pinning 제안

현재 조사에서 확인된 저장소 근거는 `user_notes` DDL(`V126__create_user_notes.sql`)이 `user_id/title/content/created_at/updated_at`만 가진다는 점이다. 현재 worktree의 `lib/schema.ts`와 파일 탐색에서는 active notes API/UI 사용 경로를 확인하지 못했으므로 기존 notes table이 현재 제품 기능으로 동작한다고 가정하지 않는다. 아래는 신규 공시 기반 review note 기능 제안이며 기존 일반 메모의 동작/데이터를 변경하라는 지시가 아니다.

검토 노트는 사용자가 직접, 명시적으로 생성하는 owner-only 개인 기록이다. 기본 정보는 “내가 이 사건에서 확인한 claim”, “아직 확인하지 못한 질문”, “다음에 다시 볼 조건”, 선택적 개인 분류다. 매매 매수/매도, 보유 수량, 평단, 실제 거래를 요구하거나 뜻한다고 가정하지 않는다. 개인 메모 본문은 공시 사실·canonical claim·reviewer disposition·공개 event summary와 별도 저장/권한/삭제 경계를 가진다. 기존 canonical source text를 복사해 메모에 붙여넣게 유도하지 않으며, evidence reference는 정확한 event/claim/revision ID를 pin하고 permitted public source link/locator를 안전하게 다시 열도록 한다. 권리 미확인 원문이나 private reviewer notes에는 링크하지 않는다.

| 제품 경계 | 요구사항 | 실패 동작 |
|---|---|---|
| 생성·소유 | `ownerUserId + eventId + eventRevisionId + publicationSnapshotId`로 생성시점 공개 revision을 pin; 선택 claim ID와 사용자 입력 note revision은 분리; 작성·수정·삭제는 인증 principal의 owner 검사 필수 | watchlist match만으로 자동 생성 금지; 소유자 불일치 read/update/delete는 존재 여부 누출 없이 404 또는 동일 안전 오류 |
| revision 변화 | event/selected claim이 바뀌면 영향 graph 결과에 따라 `SOURCE_REVISION_CHANGED`, `EVENT_SUPPRESSED`, `SNAPSHOT_EXPIRED`, `INELIGIBLE_OR_UNRESOLVED` 표식; 기존 note 본문은 자동 재작성하지 않음 | 새 event revision으로 조용히 retarget 금지. impact graph 미완성이면 affected 없음으로 가정하지 않고 note review-required |
| 다시 열기 | owner가 이전 pinned snapshot과 현재 승인 snapshot을 나란히 비교하고, 명시적으로 “이전 근거로 계속”, “새 revision에 연결한 복사본 생성”, “보관/삭제” 중 선택 | 이전 note를 현재 사실·현재 approval로 표시 금지; 복사본은 새 note ID/revision, 새 snapshot 및 선택 claim relation을 명시 |
| 공개/검색 경계 | private API는 owner 조건을 SQL/저장소 access layer에서 적용. canonical public event API, 다른 계정 검색, 전체 note count/index, log/analytics에 title/body 미포함 | public projection/cache/search 결과에 개인값 섞이면 전체 response 차단; owner filter 후 처리했다는 사실을 privacy 검증 없이 주장하지 않음 |
| 삭제·계정 종료 | note와 개인 검색 index, attachment/reference-derived cache를 owner scope로 삭제; backup·legal retention은 별도 approved policy에 맞춰 잔여와 기한 기록 | note 삭제로 canonical event/source/evidence를 지우지 않음. account delete 완료를 backup purge까지 추정하지 않음 |
| 운영·유지 | content 최소수집, 저장 암호화/접근 audit, export, retention/삭제 UX와 오류 복구 기준은 `KR-OPERATIONAL-SECURITY-01`, `KR-RETENTION-01`, `KR-API-UI-CONSISTENCY-01` 승인과 연계 | 승인 전 public note route, 운영 공유/협업, AI 학습·자동 분석에 개인 본문 사용 금지 |

논리 관계는 canonical event를 수정하지 않는 `PersonalDisclosureReviewNote → pinned EventRevision/ClaimRevision/Snapshot` 방향의 optional FK/reference다. 개인 note는 event 삭제 cascade로 조용히 사라지는 canonical dependency가 아니며, event suppression 시 owner-only stale record로 남아 현재 event content 접근을 다시 gate 한다. 기존 note가 정확한 event ID/revision link를 갖지 않은 경우 ticker/title 문자열, 날짜 근접성만으로 자동 연결하지 않고 `UNLINKED_LEGACY_NOTE`로 유지해 사용자 확인을 요구한다. 저장소에 `user_notes` migration이 있어도 이 feature approval·기존 row backfill·API/UI 존재를 증명하지 않으므로 schema reuse 결정은 별도 조사 후 내린다.

합성 계약 [`personal-disclosure-review-note.v0.json`](../fixtures/disclosure/personal-disclosure-review-note.v0.json)의 `PDN-01`–`PDN-10`은 계정 경계, watchlist와 별도 opt-in, exact revision pin, event suppression, dependency stale, unresolved impact, 개인 삭제와 canonical event 분리, owner-scoped 검색, legacy auto-link 금지, 계정 삭제와 index/backup 처리 경계를 고정한다. 실제 owner isolation, 암호화/삭제, API/UI 및 backup execution은 `NOT_RUN`이며 개인 메모 기능의 운영 승인을 뜻하지 않는다.

개인 검토 note는 사건을 읽은 기록이다. 사용자가 당시의 투자 가설, 반대 근거, 사전 review 조건까지 추적하려는 기능은 별도 revisioned product contract로 관리한다: [개인 투자 thesis journal 기획](./investment-thesis-journal-design.md), [ITJ-01–ITJ-49 synthetic acceptance](../fixtures/disclosure/investment-thesis-journal.v0.json), [ITHR-01–14 typed review trigger 평가 경계](../fixtures/disclosure/investment-thesis-review-trigger.v0.json). 두 기능은 독립적으로 opt-in·권한·보존 검토가 필요하며 review note 동의가 thesis 성과 평가나 자동 감시 동의로 확대되지 않는다.

수용 fixture에는 (a) watchlist 종목=filing submitter이나 직접 subject 아님, (b) verified subject가 watchlist와 exact instrument match, (c) issuer group/동명 ticker만 유사, (d) 동일 숫자 code의 KR/US 다른 security, (e) multi-subject 중 한 종목만 match, (f) stale/non-common/cap 미달, (g) event rights/publication suppressed, (h) watchlist 추가와 알림 opt-in 별도, (i) 개인 overlay가 무인증 API·다른 user 응답에 누출되지 않음, (j) remove/mute가 global event/다른 구독자에게 영향 없음, (k) account deletion과 queued personalized notification race를 포함한다. 직접 귀속/적격성/권리 gate가 닫힌 상태에서 watchlist match를 곧바로 투자 관련 알림으로 내보내면 실패다.

### P4 진행 기록 — 공시 분석 및 일정 검토 워크플로

이 검토 workflow는 현재 제안된 `FactClaim`, `evidenceRefs`, 일정 assertion, revision approval 모델을 검토자가 적용할 수 있는 순서로 묶는다. 분석 결과의 어조나 model confidence를 결론으로 삼지 않고, 각 결과를 원문 위치·상태·의존 gate와 연결한다. 기본 검토 단위는 `filing/document revision + analysis revision + event/date candidate revision`이며 각 revision은 독립적으로 재현·검토한다.

#### 검토 화면/기록의 논리 섹션

| 순서 | 섹션 | 필수 표시/결정 | 통과하지 못할 때 |
|---|---|---|---|
| 1 | 공시 범위·출처 상태 | source, accession/receipt, 제출/접수 기준일·수집시각, source coverage, metadata/body/attachment availability, rights action status | filing 범위 불명·본문 미취득·권리 미확인이면 본문 claim/event/date 확정 단계로 진행하지 않고 metadata-only 후보로 둠 |
| 2 | 문서 revision 및 변경 비교 | document hash, attachment inventory, 이전 filing/revision 후보, 정정·철회 relation의 근거·상태 | bytes/첨부/관계가 unresolved면 과거 승인을 승계하지 않고 영향받는 claim/date를 review-required로 표시 |
| 3 | 발행사·당사자·subject | submitter, party roles, instrument 후보, attribution evidence와 eligibility 상태 | subject가 unresolved면 분석 claim은 내부 검토 가능하더라도 투자 종목 event로 공개하지 않음 |
| 4 | 사실 claim ledger | 원문 주장, locator, source hash, raw/normalized value, unit/currency, `FACT` 상태와 SUPPORTS/CONTRADICTS/CONTEXT | locator가 재현되지 않거나 상태·evidence 관계가 충돌하면 해당 claim을 unsupported/unresolved로 두고 summary/date 의존 claim을 차단 |
| 5 | 사건 해석 및 방향성 | 사건 메커니즘, 관련 사업/재무·법률 경로, horizon, `impactAssessmentConfidence`, 직접 근거 claim ID | 해석이 사실처럼 쓰였거나 근거 claim이 없으면 interpretation 수정 또는 `UNCERTAIN`; extraction confidence로 대체 금지 |
| 6 | 반대 근거·위험·미확인 | 반대 claim, 상쇄 조건, 희석/자금조달·상장유지·실행·법률·규제 위험, 부족한 자료/검색 범위 | 중요 반대 근거가 미검토면 긍정/부정 단일 방향 승인 차단, `MIXED/UNCERTAIN` 또는 `NEEDS_EVIDENCE` |
| 7 | 일정 assertion | date kind, typed value/precision, source certainty, status, 시간대, certainty basis claim, 정정 lineage | 날짜 precision/timezone/확정성 모호하면 더 낮은 precision 또는 `UNKNOWN/ESTIMATED`; 임의 날짜/시각 금지 |
| 8 | analyst review decision | 검토자, 대상 revision/hash, dependency fingerprint, 승인/거절/보류 이유, 필수 evidence set completeness | dependency 변경 시 승인 무효화·재검토. analysis approval은 event/date 공개 권한을 부여하지 않음 |
| 9 | publication eligibility | rights per action/channel, subject master/common-stock/cap, source/correction freshness, public snapshot target | gate별 차단 이유를 따로 표시하고 모든 필수 gate가 동일 revision/snapshot에 맞지 않으면 공개하지 않음 |

이 섹션들은 제품 UI의 최종 레이아웃을 확정하는 픽셀 사양이 아니다. 사용자에게 노출할 요약 문구와 운영/검토자에게 필요한 상세 provenance를 분리하는 정보 구조 기준이며, `KR-DOCUMENT-UX-01` 승인 전에는 원문 인용량·전문 표시·본문 보관 정책을 정하지 않는다.

#### 기존 DART 제목 후보에서 검토형 투자 dossier로의 전환

현재 코드와 제안 제품의 의미를 분리하는 전환 계약이다. `app/dart/page.tsx`는 “DART 제목 기준 호재 후보”라는 문구와 본문 사실·투자 영향·종목 귀속 미검증 안내를 표시한다. `lib/rss.ts`의 `parseDartItems()`는 RSS 제목으로 `classifyDartTitle()`을 호출한 뒤 KST 당일이며 `최강호재`/`호재가능`인 항목만 `company/title/judgment/keywords/publishedAt/link/rceptNo`로 반환한다. DART 원문 링크는 공식 HTTPS viewer host/path 및 단일 비인코딩 14자리 `rcpNo`를 검증한 뒤 정규 URL로 재구성하며, 불일치·미지원 주소는 링크와 접수번호를 비운다. 이는 `officialSourceLinkPolicy`의 DART allowlist만 반영하고 네트워크 fetch나 redirect 검증을 하지 않는다. `company`는 제목 파싱값이며 공식 제출자·사건 당사자·영향 issuer 확인 결과가 아니다. 화면 표는 `제목 분류`와 `제목상 회사명`으로 이 범위를 표시하고, RSS `pubDate` 및 feed `fetchedAt`은 `Asia/Seoul`로 렌더링한다. 제목상 회사명은 클릭 가능한 issuer 조회나 `/api/dart/history` 검색 입력으로 사용하지 않는다. 브라우저 관심표시는 해당 제목 추출 문자열만 `localStorage`에 저장하며 UI가 공식 종목 확인·사건 구독과 다르다고 설명한다. 이 경로의 제목 분류는 원문 본문 claim 검증, 사건 당사자 귀속 또는 검토자 승인이 아니다. `app/api/dart/route.ts`는 기능/운영시간 gate 뒤 `getTodayDartBullishFeed()`를 한 번 호출한다. 이 함수는 upstream RSS를 읽고 응답 시각과 후보를 반환하며 저장 행이나 자동화 run을 기록하지 않는다. 예약 자동화는 별도 `/api/cron/sync-filings` → `runFilingSync()` → `runDartAutomation()` 경로가 소유한다. `/disclosures`와 `/api/disclosures`는 별도의 저장 행 조회 경로다.

따라서 이 전환은 기존 분류값을 검증 결과로 승격하거나 이름만 바꾸지 않는다. 기존 `/dart` 데이터는 각 항목의 출처와 분석 경계가 확인될 때까지 `TITLE_TRIAGE_ONLY` 성격의 후보로 다루며, 이 상태는 `POSITIVE`, `SUPPORTED_FACT`, `VERIFIED_EVENT`, 투자 방향 또는 사용자 알림 자격을 뜻하지 않는다. 호환을 위해 기존 `judgment`의 역사값을 보존하는 경우에도 신규 dossier의 `analysisStatus`/`reviewStatus`와 별도 namespace·revision으로 유지한다. 기존 항목을 원문 재분석 없이 소급 승인하지 않는다.

| 전환 단계 | 사용자 결과 | 진입 기준 | 금지 경계 |
|---|---|---|---|
| T0 제목 후보 경계 | 현재 제목 일치 후보임을 알리고 원 공시 링크, RSS 공개시각과 KST 수집시각을 제공 | 기존 `/dart` 경로의 명령·필드·KST 날짜 경계 확인, `KR-DOCUMENT-UX-01`에서 용어 승인 | 등급을 투자 판단으로 소개하지 않음. 기존 GET 동작·운영시간을 이 문서만으로 변경하지 않음 |
| T1 근거 검토 queue | 권리 확인 뒤 허용된 문서에서 claim, locator, support/counter-evidence, subject 연결 및 검토 상태를 단계별 확인 | P1 rights, P2 identity/eligibility, P3 source coverage와 correction lineage, reviewer/security 결정 | title-only 결과를 근거로 사용하지 않음. 미확인·권리차단은 `UNKNOWN`/suppressed로 유지 |
| T2 검토형 dossier | facts, 해석, 반대 근거, 일정 확정성, source coverage와 issuer/instrument 적용범위를 하나의 승인 revision에서 확인 | claim-evidence gate, reviewer 승인, 동일 revision의 공개 rights·master/cap·freshness gate, API/UI consistency 승인 | 리뷰 일부 통과를 전체 공개 승인으로 합성하지 않음. 점수·매수/매도·수익 보장을 생성하지 않음 |
| T3 명시적 종목 구독 | 사용자가 검증된 instrument와 사건 알림 범위를 선택하고 정정/철회 상태도 확인 | T2 공개 eligibility, 계정/구독 owner 및 privacy/security·notification/correction acceptance | 회사 문자열 즐겨찾기, 화면 조회 또는 일반 DART 알림 opt-in을 사건별 구독으로 승격하지 않음 |

현재 T0의 후보 경계·원문 링크·KST 시각 표시는 화면에 연결돼 있고 RSS 상태 카드는 초기 수신 실패, 마지막 성공 응답 이후 갱신 실패, 수집시각 미확인을 구분한다. `KR-DOCUMENT-UX-01` 용어/인용 승인과 원천 rights는 OPEN이다. 따라서 이를 T0 전체 통과나 T1 근거 검토 시작으로 판정하지 않는다.

이 전환의 최소 acceptance는 (1) `최강호재`/`호재가능`만 존재하고 body claim/reviewer가 없으면 투자 claim/publication을 만들지 않음, (2) 저장 공시 조회의 빈 결과를 원천 부재로 표시하지 않음, (3) 제출 회사와 직접 영향을 받는 issuer/instrument가 다르거나 unresolved면 ticker 노출을 보류, (4) 제목 분류와 사용자 구독을 서로 독립된 상태로 검사, (5) 과거 제목 등급의 새 의미 부여·소급 재분류를 거부하는 것이다. `DIEG-13`은 기존 `judgment` 이력을 legacy triage로 보존하되 reviewer/근거가 없으면 분석을 만들지 않고 history rewrite를 금지한다. `DIEG-14`는 회사명 watchlist와 검증된 instrument 사건 구독을 분리한다. 합성 fixture 전체 범위는 `DIEG-01`–`DIEG-14`이며 `KR-API-UI-CONSISTENCY-01` 및 attribution/correction fixtures와 함께 전환 검토에 사용한다. 이 단계들은 계획이며 기존 `/dart`, 알림, watchlist 동작의 변경이나 승인 선언이 아니다.

#### Fact, interpretation, counter-evidence 판정표

| claim kind/status | reviewer 질문 | 최소 판정 조건 | event/date 영향 |
|---|---|---|---|
| `FACT / SUPPORTED` | 이 명제가 원문에 직접 있고 지정 위치에서 다시 찾을 수 있는가? | 동일 document hash·revision·locator, source action 권리, 적합한 SUPPORTS evidence, typed value/unit·normalization rule 검증 | 날짜·금액·수량은 해당 supported fact와 정확히 resolve될 때만 assertion basis로 사용 |
| `FACT / CONTESTED` | 어떤 공식 source/정정/첨부가 반대 값을 주장하는가? 효력/적용 범위가 다른가? | SUPPORTS와 CONTRADICTS를 모두 보존하고 충돌을 reviewer가 해소하거나 unresolved로 유지 | 의존 date/subject/event는 자동 승격하지 않고 영향 범위를 suppress/review |
| `FACT / UNRESOLVED` 또는 `UNSUPPORTED` | locator 접근 불가, 원문 미취득, identity 미결, context만 있는가? | 빈 응답이나 검색 실패를 사실 부재로 읽지 않음; 부족한 근거 이유를 명시 | 해당 claim에 기대는 확정 일정/긍정 rationale/publication 차단 |
| `INTERPRETATION` | supported fact에서 결론까지 어떤 인과 연결을 추론했는가? | 근거 claim IDs, 해석 작성자/revision, 반대 경로 및 적용 한계를 표시 | 해석은 사건 발생/완료 사실·확정 일정으로 저장하지 않음 |
| `COUNTER_EVIDENCE` | 재무·법률 조건, 자금 조달, 취소권, 미이행/취소/규제 지연 등 방향을 약화시키는 근거는 무엇인가? | 실제 claim/evidence와 관계를 연결하거나 아직 확인하지 못한 항목은 `UNKNOWN`으로 구분 | 상쇄 위험이 크거나 미검토면 `POSITIVE` 단정 대신 `MIXED/UNCERTAIN/NEEDS_EVIDENCE` 검토 |
| `UNKNOWN` | 분석 범위 안에서 확인 못한 내용인가, 자료가 실제로 없다고 원문이 말하는가? | `NOT_FOUND_IN_REVIEW_SCOPE`, `SOURCE_UNAVAILABLE`, `NOT_DISCLOSED`, `CONFLICT_UNRESOLVED` 등 이유를 구별 | unknown을 0, false, 미발생, 취소 또는 악재 부재로 변환 금지 |

#### Claim별 반대 근거 검토 manifest

위 판정표가 개별 evidence의 관계를 정의한다면, 반대 근거 manifest는 해당 투자 claim에 대해 **어떤 위험 범주를 어디까지 확인했는지**의 분모를 고정한다. dossier에서 “반대 근거 검토 완료”로 표현하려면 `DisclosureCounterevidenceReview`가 claim revision/event group, 검토 revision, 평가 정보 cutoff, 위험 범주별 적용성·상태, source profile revision, 검색 scope/window/query revision, action별 rights decision, coverage assertion, 찾은 counterclaim revision, reviewer decision을 같은 snapshot으로 묶어야 한다. 원문 본문을 복제하는 계약은 아니다.

기본 검토 범주는 정정·대체 공시, 자금조달·희석·유동성, 조건·선행요건·취소, 법률·규제·상장 상태, 거래상대방의 신용·이행, 자산·영업·매출 영향, 특수관계·이해상충이다. 범주 전체가 모든 사건에 기계적으로 필수인 것은 아니지만, 각 범주는 `APPLICABLE` 또는 reviewer 근거가 있는 `NOT_APPLICABLE_WITH_RATIONALE`로 명시되어야 한다. 범주가 빠졌거나 근거 없이 비적용 처리되면 분모가 닫히지 않는다. 적용 범주의 미검색·부분 coverage·권리 차단·원천 장애·stale 결과는 검토 미완료로 유지한다.

검색에서 결과가 없는 적용 범주는 `NO_MATCH_IN_COMPLETE_SCOPE_AS_OF`로만 기록한다. 이 상태는 rights가 허용된 명시 source/window/subject/query 안에서 cutoff까지 대응 근거를 못 찾았다는 뜻이며, 해당 위험이 없거나 미래에도 발생하지 않는다는 주장이 아니다. 검색 중 찾은 counterclaim은 reviewer adjudication 전까지 `EVIDENCE_FOUND_PENDING_REVIEW`로 남고 방향 승인에 사용할 수 없다. 공시 후 주가 하락, 가격 변동, 제목의 부정 키워드는 counterevidence 검색을 대체하지 않는다. source·rights·coverage·query 또는 대상 claim revision이 바뀌면 기존 manifest는 stale되고 새 review revision이 필요하다.

단일 방향 해석은 모든 적용 범주가 적법한 완전 scope에서 검토되고, 발견 evidence가 판정되며, 비적용 범주에 rationale이 있고 manifest가 현재 claim revision과 일치할 때만 reviewer가 별도로 고려할 수 있다. 미완료면 `EVIDENCE_INCOMPLETE` 또는 `SUPPRESSED_RIGHTS_OR_COVERAGE`로 projection을 차단한다. 완결 상태도 매수·매도 추천이나 사건 결과 확률은 만들지 않는다. manifest는 [`investment-effect-projection-bridge.v0.json`](../fixtures/disclosure/investment-effect-projection-bridge.v0.json)의 `INTERPRETATION_REVIEW` 단계에 `counterevidenceReviewId`, `reviewSetRevision`, snapshot hash, claim digest, rights decision set 및 `coverageAssertionSetDigest`로 결박한다. DCR이 `COUNTEREVIDENCE_REVIEWED`여도 interpretation은 별도 승인 대상이며, incomplete/stale/rights-blocked 결과는 bridge를 fail-closed하게 한다. 합성 cross-fixture acceptance는 [`disclosure-counterevidence-review.v0.json`](../fixtures/disclosure/disclosure-counterevidence-review.v0.json)의 DCR-01–18에서 검사한다.

##### 검토 행위자·자격·독립성 경계

manifest는 검색 준비자와 최종 adjudication 행위자를 분리해 opaque `preparedByActorRef`/`adjudicatedByActorRef`, server-side role decision, current reviewer eligibility snapshot, conflict declaration state, independence policy revision 및 decision reference를 기록한다. 화면/요청 본문이 보낸 reviewer ID, shared-password session, UI 표시 이름만으로 reviewer 신원·역할·자격을 증명하지 않는다. 공개 dossier/export에는 내부 행위자 식별자나 capability 세부를 내보내지 않는다.

리뷰어 독립성이 필요한 분석 수준과 예외 범위는 `KR-OPERATIONAL-SECURITY-01` 및 `KR-END-TO-END-ACCEPTANCE-01` 결정 아래 owner가 명시적으로 승인해야 한다. 정책이 없으면 `NOT_READY`이며 review를 닫을 수 없다. 현재 정책이 `REQUIRED`이면 준비자와 adjudicator가 동일한 경우 거부한다. `NOT_REQUIRED_BY_CURRENT_POLICY`도 exact workflow/source/claim scope에 대한 현재 decision revision이 있어야 하며 전역 면제나 과거 review의 소급 변경을 만들지 않는다. 예외 승인은 승인자·범위·사유·효력 기간이 pin된 경우만 사용할 수 있다.

actor identity, role/capability, conflict declaration 또는 independence policy가 미확인·stale·철회 상태면 category의 `NOT_APPLICABLE_WITH_RATIONALE`나 counterclaim disposition을 확정할 수 없고 aggregate review는 `EVIDENCE_INCOMPLETE`, `STALE_REVIEW_REQUIRED` 또는 `CONFLICT_UNRESOLVED`로 남긴다. 현재 admin session 구현은 shared-password boolean으로 이름 있는 행위자를 증명하지 못하므로 이 contract는 구현·운영 완료를 뜻하지 않는다. 행위자 귀속/권한이 준비되기 전에는 내부 review queue에서 완료 판정을 허용하지 않는 설계다. DCR-13–18은 이 경계를 합성 검증한다.

#### 공시 전후 핵심 사실 비교 ledger

비교 목적은 정정이나 후속 공시에서 투자 판단의 입력이 어떻게 달라졌는지 추적하는 것이다. filing이 시간상 뒤에 있다는 사실만으로 앞 filing을 대체하지 않으며, 동일 event/correction relation이 확인된 revision끼리만 “전후”로 묶는다. relation 불명 filing은 병렬 후보/참고자료로 표시하고 자동 병합하지 않는다.

| 비교 상태 후보 | 의미 | UI 동작 |
|---|---|---|
| `ADDED` | 비교 기준 revision에는 없고 현재 revision에서 직접 근거가 확인된 typed fact | 새 주장으로 표시. 기존에 없었다는 것과 사실이 새로 발생했다는 것을 혼동하지 않음 |
| `VALUE_CHANGED` | 같은 fact identity·scope·basis에서 raw/normalized value가 달라짐 | 이전/현재값, 값 단위, 문서 revision, locator, delta 산식 모두 나란히 노출 |
| `STATUS_CHANGED` | 수치 자체가 아니라 계획/확정/취소/완료 등 상태 주장 변경 | 상태별 근거와 lifecycle revision을 비교. 해석/방향성 자동 승계 금지 |
| `BASIS_CHANGED` | 값은 숫자상 유사해도 기간·범위·주식 class·분모·총액/순액 등 비교 기준이 달라짐 | “직접 비교 불가”를 표시하고 동일 기준 재산출 전 delta 생략 |
| `CONTESTED` | 새 근거와 종전 근거가 공존하며 supersedes/효력 관계를 아직 결정 못함 | 둘 다 보존하고 충돌 표시; active value를 임의 선택하지 않음 |
| `NOT_RESTATED` | 후속 filing에서 해당 사실을 언급하지 않음 | 변경 또는 삭제로 처리하지 않음. 새 filing의 범위가 그 field까지 확정 갱신함을 직접 증명할 때만 `REMOVED/NO_LONGER_APPLICABLE` 후보를 만든다 |
| `NOT_COMPARABLE` | identity, unit, currency, precision, period, entity, security class 또는 denominator를 같은 기준에 정렬할 근거가 없음 | 화면에 나열은 가능하나 delta, 증가/감소 문구, 비율 계산 금지 |

비교 key는 안정 `claimConceptId` + entity/party role + instrument/security class + 기간/기준일 + value kind + accounting/share basis를 포함한다. claim label/title/text 유사도만으로 pair하지 않는다. 비교 record는 이전/current claim ID, filing/document revision/hash, exact locator, source relation, reviewer decision, mapping/taxonomy version, raw typed values와 normalized values를 함께 저장한다. 여러 claim이 합쳐지거나 하나가 분할되는 관계는 명시 `DERIVED_FROM/REPLACES/CONTRADICTS` edge와 설명을 요구하고 one-to-one diff를 가장하지 않는다.

금액은 통화·천원/원 단위·총액/순액·부가세/비용 포함 여부·계약 전체/기간분을 정렬한다. 주식 수는 보통주/기타주식, 발행/자기주식 제외/outstanding, 기준시각, 액면분할/병합 조정, 계획/배정/납입/실제 발행 basis를 정렬한다. 비율은 분자·분모와 기준주식을, 재무 값은 회계기간·연결/별도·회계기준·지속/중단사업 scope를 정렬한다. 날짜는 숫자 delta로 계산하지 않고 dateKind·precision·timezone·certainty·lifecycle을 별도로 비교한다. 정렬 기준 하나라도 부족하면 공통 단위로 임의 환산하지 않고 `BASIS_CHANGED` 또는 `NOT_COMPARABLE`로 둔다.

delta는 정렬 완료된 `VALUE_CHANGED`에서만 제공한다. `absoluteDelta = currentNormalizedValue - priorNormalizedValue`; 상대변화율은 prior가 0이 아니고 의미 있는 동일 basis에서만 `(current-prior)/abs(prior)`로 계산한다. prior=0, 음수/부호의 도메인 의미 불명, 반올림 구간 겹침, exact numeric precision 부족 시 상대변화율을 생략한다. 계산 결과는 원 주장이나 주가 영향이 아니며, 표면에는 두 원값·정규화 규칙·분모/기준일·산식·rounding 및 비교 불가 사유를 열어볼 수 있어야 한다.

요약 문구는 최소 두 claim의 직접 근거를 붙이고 “증가/감소/변경 없음/확인 불가” 같은 사실 표현과 투자 해석을 분리한다. AI가 생성한 narrative diff는 근거 링크가 빠지면 숨기며, 이전 승인 요약을 새 값에 맞춰 덮어쓰지 않는다. 새 compare revision은 이전/current input hash에 결박하고 승인 revision이 바뀌면 이전 compare approval을 `STALE_REVIEW`로 낮춘다. 표본 acceptance는 동일 receipt 정정, 부분 field 정정, 단위/주식 class/기간 변경, 후속 미기재, 정정 filing 재정정, correction relation 불명, 수치 오기 정정, API/body conflict, 0 또는 음수 기준값, 소수/반올림, 한 fact가 여러 claim으로 분해되는 경우를 포함한다.

#### 변화의 투자자 주목도와 검토 우선순위 표시

비교 결과와 사건을 나열할 때 **근거 품질**, **투자자 영향 범위**, **시간 긴급성**, **자료 검토 작업 우선순위**, **방향 해석**을 별도 축으로 노출한다. `direction=POSITIVE` 또는 높은 `impactAssessmentConfidence`만으로 상단 노출하지 않고, `HIGH`를 수익 가능성/발생확률처럼 쓰지 않는다. 사용자 목적은 검토 대상을 빨리 찾고 판단 근거를 살피는 것이며 자동 매수·매도/추천 순위를 산출하는 것이 아니다.

| 표시 축 | 답할 질문 | 허용 표시/정렬 | 혼합 금지 |
|---|---|---|---|
| 근거 상태·품질 | 원문/structured field가 재현되고, 정정·반대 근거·권리가 유효한가? | `SUPPORTED`, `CONTESTED`, `UNRESOLVED`, source `CURRENT/STALE/UNKNOWN`, reviewer status와 last checked 시각 | 근거 confidence를 주가 상승/사건 발생 probability로 치환 금지 |
| 영향 dimension | 어느 경제/법률/거래 축이 영향을 받을 수 있는가? | `OWNERSHIP_DILUTION`, `FINANCING/CASH`, `ASSET/OBLIGATION`, `OPERATIONS`, `LEGAL/REGULATORY`, `TRADING/LIQUIDITY`, `CORPORATE_CONTROL` 등 taxonomy 후보 label과 source-supported claim | labels는 검토 제안이며 taxonomy 승인 전 자동분류/공개 enum으로 간주 금지. 여러 축을 가산해 종합점수로 만들거나 사업 영향 규모를 임의 추정 금지 |
| 규모·범위 | 크기를 신뢰 가능한 denominator와 비교할 수 있는가? | 동일 기준일/통화/주식basis/기간을 통과한 numeric ratio 또는 `NOT_ASSESSED`; numerator·denominator·산식·as-of 표시 | absolute amount만으로 중요도 단정, 시총·매출·유통주식의 서로 다른 시점/정의를 섞기 금지 |
| 시간 긴급성 | 확인된 다음 단계/마감이 언제인가? | 승인된 exact `DAY` 일정은 날짜순; 월/분기·추정·미확정은 precision과 certainty를 보여주는 별도 그룹 | 추정 날짜를 exact countdown으로 정렬하거나 날짜 지남을 완료로 취급 금지 |
| 운영 검토 우선순위 | 어떤 데이터 문제를 먼저 사람이 확인해야 하나? | open conflict, rights/master/correction gate, coverage stale, due follow-up 등 기계적으로 설명 가능한 trigger 및 원인 code | 이 큐 순서를 종목의 투자 매력/매매 우선순위로 표시 금지 |
| 방향/해석 | 근거에서 어떤 영향 경로를 해석했는가? | `POSITIVE/NEGATIVE/MIXED/UNCERTAIN`, horizon, 근거·반대 근거·한계, `impactAssessmentConfidence` | 자료 freshness/materiality 또는 review urgency를 direction으로 변환 금지 |

초기 기본 정렬은 사용자가 명시적으로 고른 sort mode에 따라 결정한다. 내부 reviewer queue는 unresolved source/rights/master/correction blocker를 먼저 처리한다. 사용자 공개 목록은 동일 publication snapshot의 gate를 통과한 row만 포함하며 내부 blocker 사유나 가려진 event의 존재를 유출하지 않는다. 사용자 목록의 권장 default는 확정 일정끼리 date precision 동일 그룹 안에서 날짜순, 같은 날짜에는 최근 승인된 revision순이며, 추정/월/분기/미확정은 별도 섹션에 둔다. 전체 종목 간 투자 영향 비교가 필요하면 owner-approved denominator와 event-kind별 comparable metric, threshold, reviewer evidence를 먼저 정한다. 그 전까지 규모 기반 투자 순위는 `NOT_AVAILABLE`이고, 시총/거래대금/발행주식 분모가 없으면 cross-company 비교를 하지 않는다.

화면 예시 정보 순서는 “검토 필요/근거 상태 → 사건·revision 변경 → 영향 dimension과 확인된 수치 → 다음 확정/추정 일정 → 긍정·부정 해석과 반대 근거 → 미확인·권리/coverage 한계”다. 사용자에게 표시하는 label은 `검토 필요`, `확정 일정`, `추정 일정`, `결과 미확인`처럼 상태를 설명한다. `급등 기대`, `강력 매수`, 숫자형 `impact score` 등 가격 방향을 약속하거나 의미가 승인되지 않은 badge는 사용하지 않는다.

Acceptance fixture는 (1) 높은 방향성 confidence이나 원문/권리 unresolved, (2) POSITIVE catalyst와 material financing risk 공존, (3) 큰 절대 거래액이나 유효 denominator 없음, (4) 높은 confirmed impact와 먼 일정, (5) 임박 estimate와 확정일 비교, (6) stale data지만 기존 high direction, (7) trade halt와 희석 event 교차, (8) `UNRESOLVED` event가 공개 목록에 들어오는 경우, (9) sort key 동률/비교 불가 cross-company 값, (10) 사용자 sort preference를 포함한다. 서로 다른 축을 한 값으로 합성하거나 blocker event를 정상 투자 추천 목록으로 노출하면 실패다. 임계값/가중치/투자자 우선순위는 관련 decision owner가 별도 승인하기 전 정의하지 않는다.

#### 다중 영향 review case 워크벤치

dependency graph를 내부 운영자가 검토 가능한 **case bundle**로 제시한다. case 하나는 trigger filing/source/document revision과 동일 trigger/generation/resolver version을 기준으로 만들고, 연결된 claim·analysis·summary/date·party/subject·event revision·publication target·outbound notification을 영향 경로별로 보여준다. 관련 없는 형제 event는 graph 경로가 없으면 분리한다. 다만 graph completeness/reverse-index parity가 증명되지 않으면 case 범위를 좁히지 않고 전체 source scope를 보수적으로 유지한다.

| Case bundle 섹션 | reviewer가 확인하는 내용 | 성공/실패 판정 |
|---|---|---|
| Trigger와 source lineage | 감지 이벤트 종류, source filing/document revision, 원문 접근/권리 상태, observedAt/asOf, trigger hash와 이전 상태 | source identity·rights 범위 불명 또는 revision 미resolve면 본문을 노출하지 않고 metadata-only/blocked case |
| 영향 경로 graph | source → claim/evidence → date/party/subject → event/summary → publication snapshot → queued/sent notification의 exact edge, node revision/hash, market/instrument | row count·edge count·generation/hash/cardinality parity가 맞고 dangling edge/cycle 0이어야 exact scope 가능 |
| 전후 차이 | 공시 비교 ledger의 이전/현재 주장, typed basis, `ADDED/VALUE_CHANGED/BASIS_CHANGED/CONTESTED/NOT_RESTATED` 상태, direct locator | 비교 불가·충돌은 차액/요약에서 분리하고 독립적 사실처럼 자동 채택 금지 |
| 영향 분모 | discovered consumers, 각 disposition(`IMPACTED/VERIFIED_UNAFFECTED/UNRESOLVED/OUT_OF_SCOPE`) 수와 ID set hash, 해당 공개/알림 수신자 수(권리·개인정보상 허용 범위) | distinct 대상 집합과 총 분모 일치; unknown/dangling 하나라도 있으면 narrow resolution 및 suppression 해제 금지 |
| 현재 공개/발송 영향 | 이전 publication snapshot/epoch, active suppression roots, invalidate 예정 cursor/cache/outbox, notification delivery attempts와 provider certainty | 이미 보낸 알림의 삭제를 완료로 표현하지 않고 `DELIVERED_UNRETRACTABLE`/`DELIVERY_UNKNOWN`과 정정 후보를 분리 |
| reviewer decision | 승인 revision fingerprint, 이견/확인 근거, chosen action/reason, 남은 영향 대상과 다음 owner | 작성자 자기승인·미배정 owner·미결 conflicting source는 통과 금지; 새 승인은 이전 revision을 덮지 않음 |

Reviewer 선택지는 제한된 enum/action으로 기록한다: (1) **영향 근거 확인** — graph의 impacted set을 인정하고 대상 revision을 새 분석/검토로 보냄, (2) **독립 근거로 유지 가능성 재검토** — 취소가 아니라 별도 source/claim을 연결해 새 approval candidate 생성, (3) **해석만 수정** — 사실/사건은 유지하고 direction·rationale·counter-evidence를 재검토, (4) **관계/범위 unresolved** — 관련 consumer suppression 유지, (5) **근거 없는 관계 기각** — 제안 edge만 기각하고 원래 filing/event 및 독립 소비자에는 영향 없음의 이유를 기록, (6) **권리/identity block 유지** — 노출·추가 파생을 중지하고 담당 owner/action을 지정. “문제 없음”, “거짓 양성”, “영향 없음” 같은 자유형 종결만으로 graph disposition을 바꾸지 못한다.

내부 queue 정렬은 publication safety blocker·권리 취소·명시 correction/withdrawal·오귀속 위험·출시 전 date conflict 같은 설명 가능한 trigger class를 먼저 보여준다. 종목의 direction, 수익률, 시가총액만으로 reviewer priority를 높이지 않는다. 운영 SLA, due time, 우선순위 가중치 및 자동 assignment는 `KR-OPERATIONAL-SECURITY-01`, `KR-SHADOW-SLO-01`, `KR-END-TO-END-ACCEPTANCE-01` owner 승인 전 미정이며 case 생성 자체가 인력 배정/대응 보장으로 표시되어서는 안 된다.

수용 fixture는 (a) 하나의 정정이 같은 event의 여러 claim/date/summary와 알림에 파급, (b) 여러 event가 한 filing을 공유하지만 일부만 영향, (c) 미등록 edge/reverse-index 누락, (d) generation drift/cycle/duplicate, (e) subject A만 영향받는 multi-subject event, (f) graph complete와 unknown boundary의 범위 차이, (g) 독립 근거가 남아 있으나 충분성 재검토 필요, (h) rights가 금지해 reviewer도 전문을 볼 수 없는 case, (i) 이미 전달된 notification과 미발송 outbox 혼재, (j) case 도중 새 trigger가 들어오는 race를 포함한다. 기대값에는 exact impacted/untouched/unknown ID set과 hash, suppression scope, outbox behavior, 승인 상태 및 reviewer action log를 포함한다.

#### 공시 이벤트 사후 시장반응 평가

사후 가격 반응은 사건·공시가 만든 인과효과나 미래 수익 예측이 아니라, 정해 둔 관측 구간에서 거래 가격이 어떻게 변했는지에 대한 기술통계다. 공시 사실/영향 해석과 가격 관측은 서로 다른 source/revision으로 저장·표시하고 한쪽이 다른 쪽의 정답 라벨이 되지 않게 한다.

현재 checkout의 `GET /api/public/daily-candles`는 활성 COMMON_STOCK 마스터와 비보통주 플래그를 대조한 캐시 봉만 반환한다. 단건 응답은 `instrument`(거래소·코드·종목명), 다건 응답은 각 item의 동일 필드를 제공하고, 각 봉의 `fetchedAt`과 종목별 최신 거래일·최신 데이터 갱신시각·반환 수를 metadata에 포함한다. `market=US` 또는 `market=KR`의 단건 code가 복수 거래소에 존재하면 섞인 봉을 만들지 않고 `409 AMBIGUOUS_INSTRUMENT`와 거래소 목록을 반환한다. 소스는 `OPERATING_DB_CACHE`이며 원래 market-data provider, 조정주가/배당/분할 처리여부, currency, raw/as-traded basis는 response에 포함하지 않는다. 기반 table은 `UNIQUE(market, code, timeframe, candle_date)`를 쓰고 KR/US daily cache upsert는 그 키의 OHLCV/raw_payload/source를 대체하고 `fetched_at`을 현재시각으로 갱신한다. 따라서 현재 해당 저장경로만으로 이전 OHLCV/provider revision을 보존하거나 과거 시점의 “당시 알려진 candle”을 복원한다고 보장할 수 없다. API 응답과 소스 코드에서 관측한 구조이며 운영 DB 과거 snapshot 전체를 감사한 사실은 아니다.

| 증거 구성 | 필수 기록 | 부족할 때 표시/처리 |
|---|---|---|
| 이벤트 시점 | 공시 접수/공개 timestamp 또는 공식 자료가 말한 사건 발생/효력시각을 구분; exact source, timezone, ET/KST 또는 KST, 정밀도, 발표가 정규장 전/중/후인지 판정 근거 | 날짜만 있는 제출은 market reaction start instant로 가장하지 않는다. timestamp 불명 이벤트는 intraday window 산출 금지 |
| 기준가격 | 발표 직전 이용 가능했던 마지막 거래가격과 candle/quote source, observed-at, exchange/session, close/adjusted basis | 사후에 수정된/권리락 조정 차트만 있고 당시 가격 basis가 재현되지 않으면 `NOT_REPRODUCIBLE` |
| 관측 구간 | 이벤트 시각과 시장 session에 맞춘 사전 정의 window, 시작/종료 candle date/time, 표본 봉 수, holiday/비거래일 처리 | 결과 본 뒤 유리한 구간을 선택하지 않는다. event-kind별 window는 decision owner가 사전 승인 전 미정 |
| benchmark | 같은 거래구간의 승인된 broad-market 또는 event-kind별 comparator, index identifier/provider, currency, close/time, total-return/price-return basis | 유효한 동일-window benchmark가 없으면 raw return만 보여주고 비교/초과수익 주장을 생략 |
| 기업행사/가격 조정 | split/reverse split, rights/dividend/ex-date, ticker/class/venue change, trading halt, limit up/down 등 관측 가능한 adjustment/confounder와 source | adjustment basis가 불명/충돌하면 조정수익률 계산 차단. 가격 gap을 시장반응으로 추론하지 않음 |
| 교란 촉매 | 같은 event window의 다른 공시·실적·시장조치·거래중단·macro/sector event 후보 및 조사 scope | 중복/복합 이벤트는 contaminated/confounded로 표시하고 단일 공시의 반응으로 인과 귀속하지 않음 |

##### Point-in-time price observation snapshot 제안

기존 candle cache는 최신 기술지표와 차트에 최적화된 mutable current view다. 이벤트 반응의 재현 입력으로 바로 재사용하지 않고 “현재 최신 수정가격”과 “당시 관측 또는 특정 provider revision”을 다른 data product로 구분한다. event-study 계산은 immutable `PriceObservationSnapshot` manifest를 먼저 고정한다. manifest의 각 candle row는 instrument/venue/timeframe/date, bar 시작·종료 또는 date-only 의미, source/provider, provider revision 또는 허용된 payload hash, provider 관측시각, 우리 시스템 취득시각, raw/as-traded/split-adjusted/total-return basis, 통화, 거래세션 calendar revision, corporate-action adjustment version을 가지며, 모든 constituent row를 정렬한 set hash와 최종 manifest hash를 가진다. market-data source가 과거 revision/as-of 관측을 제공하지 않는다면 snapshot은 당시 가격을 입증하지 않고 `LATEST_REVISED_ONLY`로 표시한다.

공시의 시간은 접수시각, 최초 공개 가용시각, 기업이 말한 사건시각, 법적 효력시각을 구분한다. DART 접수시각이 기록돼도 실제 사용자/시장에 공개된 최초 시각과 같다고 가정하지 않으며, 최초 공개 가용 근거가 없으면 `PUBLICATION_TIME_UNVERIFIED`로 둔다. 각 값은 timestamp source, timezone, precision, source locator/evidenceRef가 있을 때만 세션 배정에 사용한다. `DATE_ONLY` 또는 `UNKNOWN`에서 정규장 선후를 추정하지 않는다. 일봉만 있으면 장중 발표일 종가가 발표 이후만을 반영했다고 가정하지 않으며 `DAILY_ONLY_WINDOW_AMBIGUOUS`로 둔다. 장전 발표는 동일 세션 시가를 기준점으로 삼으려면 시가 candle 정의, auction/price basis 및 정확한 발표 전후 관계가 provider evidence로 확인돼야 한다. 장후 발표는 다음 거래세션 기준을 사용하더라도 holiday/session calendar revision과 실제 bar 경계를 함께 남긴다. intraday 정확도는 bar timestamp precision과 provider의 interval convention을 확인한 경우에만 허용한다.

재계산 및 공개용 결과 manifest는 event source revision hash, event-time assertion/precision, instrument master revision, price snapshot hash, benchmark snapshot hash, session calendar version, corporate-action basis, predeclared window policy revision, formula version, confounder filing set hash, result hash를 결박한다. 가격의 새 provider revision/backfill, corporate action 재조정, 잘못된 ticker/venue 연결, event timestamp correction, benchmark constituent/window 변경은 종전 수치를 삭제하지 않고 current-result view를 expire하고 새 snapshot/review를 요구한다. 투자 성과 요약은 기술통계이며 사용자 개인의 매수가격·수익이나 인과효과로 표시하지 않는다. 표본 모집단은 filing candidate receipt set과 event-date 과거 instrument master revision의 hash·as-of·listing lifecycle coverage가 일치해야 한다. 적격성 미확정 row는 분모에 남기며 historical master/page 분모를 닫지 못하면 `DENOMINATOR_UNVERIFIED`로 두고 headline cohort statistic을 공개하지 않는다. 관측된 수익률은 full cohort statistic과 구분해 `OBSERVED_SUBSET_ONLY`로만 표시할 수 있고, 상장폐지/정지/가격소스 gap을 0이나 forward-fill로 대치하지 않는다. missingness가 outcome과 독립이라는 근거가 없으면 complete outcome 또는 무편향 성과를 주장하지 않고 원인별 누락 수를 유지한다.

합성 관측 fixture [`event-price-observation.v0.json`](../fixtures/disclosure/event-price-observation.v0.json)의 `EPO-01`–`EPO-39`은 장전/장중/날짜만 공시 시각과 일봉의 경계, mutable candle 사후조회 한계, adjustment/currency/benchmark mismatch, 거래정지, vendor correction, 동시 공시 교란 및 다종목 as-of 혼합, 사전 window/cohort/comparator 고정, denominator 유지, 조사되지 않은 confounder scope, 민감도 결과의 탐색적 표시, 접수시각과 최초 공개 가용시각의 구분(`EPO-16`) 및 timezone/precision 불명 시 세션 배정 보류(`EPO-17`), 과거 종목 master/lifecycle 분모가 불완전할 때 모집단 반환 통계 차단(`EPO-18`), 누락 가격의 reason별 보존과 비대치(`EPO-19`), 사전 추세를 별도 context로만 보이고 인과 control로 쓰지 않는 경계(`EPO-20`), 비교지수 선택에 따라 부호가 달라질 때 모든 사전 정의 comparator 결과를 민감도로 병기하고 가장 유리한 값을 confirmatory로 고르지 않는 규칙(`EPO-21`)을 고정한다. Cohort의 event type·규모 band·시장 상태 하위집단과 전체 다중가설 family도 결과 관측 전에 version/hash로 고정한다. 사후에 좋아 보이는 하위집단 선택은 exploratory로만 표시하고 전체 cohort 분모를 보존한다(`EPO-22`). 소표본·미확정 하위집단은 owner 승인 최소 N 정책 없이는 추론결과를 내지 않으며 부모 cohort의 acceptance를 하위집단에 상속하지 않는다(`EPO-23`). 다중 비교의 계획 가설 수, 보정방법, 유의수준은 책임 owner가 사전 승인한다. 미승인 또는 사후 설정이면 confirmatory 유의성 주장과 best p-value headline을 막고, 원자료 기반 탐색결과만 그 상태를 명시해 제공한다(`EPO-24`). 이 fixture는 통계적 검정법·threshold를 대신 선택하지 않는다. 같은 input manifest·policy set·code artifact·algorithm/runtime/canonicalization fingerprint에서 동일한 result digest가 재현되는지 replay한다(`EPO-25`). 실행 ID와 시작/종료시각·worker ID는 provenance로 보존하지만 결과 content digest에서는 제외한다. input/policy revision이 달라지면 prior run은 historical audit로 유지하고 current projection에서는 만료한다(`EPO-26`). 같은 고정 입력 재실행에서 digest가 달라지면 자동으로 어느 결과도 고르지 않고 `REPRODUCIBILITY_MISMATCH`로 공개를 보류하며 독립 검토를 요구한다(`EPO-27`). 이 replay 계약은 action별 rights decision과 retention을 따라야 한다. 권리상 원문 가격 payload를 보존할 수 없어 locator/hash만 남으면 무결성 식별은 가능해도 입력 byte를 재구성한 replay는 아니므로 `HASH_ONLY_INTEGRITY_NOT_REPLAYABLE`로 표시한다(`EPO-28`). 재취득 permission이 없거나 원 source가 더 이상 제공되지 않으면 prior run을 history로만 보존하고 현재 confirmatory projection은 suppress한다(`EPO-29`). terms/effective revision에서 price action 권한이 바뀌면 영향을 받는 snapshot·replay·파생통계 결과만 rights revision으로 expire하고 이전 run은 감사 이력으로 유지한다(`EPO-30`). 가격 권리, 분석정책, shadow 분모와 독립 리뷰가 미승인인 동안에는 긍정 가격 움직임도 confirmatory claim·공개 ranking·추천 근거가 되지 않는다(`EPO-31`). EPO-32–39는 각 분석 run이 price/benchmark/corporate-action 입력 revision set과 의존성 closure를 고정하고, 수정된 candle 또는 기업행사 revision에서는 의존 결과만 current view에서 만료하며, 권한과 입력이 허용될 때만 basis 일치 재실행하도록 요구한다. EPO-34 benchmark revision은 market-adjusted 결과를 무효화하되 benchmark에 의존하지 않은 raw return은 다른 입력도 current일 때만 유지한다. 과거 run은 감사 이력으로 보존하고 dependency closure가 겹치지 않는 결과를 무효화하지 않는다. EPO-35는 replay가 입력·권리·정책·artifact와 독립 재현 검증을 통과해도 재승인 없는 과거 approval 승계 금지 원칙을 적용하고 기존 공개를 자동 복구하지 않으며, 정확한 새 입력 revision set/result digest에 묶인 새 해석 승인을 요구한다. publication 전 현재 rights/eligibility와 epoch를 compare-and-swap으로 다시 확인하고, 한 번의 epoch 증가와 단일 snapshot 교체를 원자 경계로 하며, API/UI/export/cache/cursor는 새 binding을 모두 사용한 뒤에만 열고 알림은 같은 논리결과 key로 중복 방지한다. 실패·경합에서는 새 projection과 알림을 모두 억제하고 이전 stale projection을 현재값으로 fallback하지 않는다. EPO-36은 동일 logical result key·input revision·result digest로 동시에 도착한 동등 publisher 중 하나만 epoch를 전진시키며 나머지는 idempotent no-op으로 수렴하고, outbox에는 논리 알림을 한 건만 남긴다. EPO-37은 더 오래된 fencing token 또는 input revision의 늦은 worker commit을 거부해 현재 projection/epoch를 되감지 않고 시도 이력만 보존한다. 이 동시성 규칙은 기존 writer-domain 원자 집합·CAS와 DB 제약을 설계 전에 재검증해야 하는 제안이며 실제 fencing/transaction 구현 증거가 아니다. EPO-38은 publish commit 이후 알림 발송 전에 rights가 철회되는 race를 별도 delivery protocol로 재구현하지 않는다. 기존 IRAP의 rights suppression/epoch/outbox 원자 전파와 DUES의 dispatch 직전 current epoch·rights·subscription 재검증을 그대로 재사용한다. 이미 provider accepted 또는 device delivered인 항목은 outbox 취소로 회수됐다고 간주하지 않고, 노출 evidence가 있으면 correction/delivery reconciliation을 요구한다. EPO-39는 IRAP-09의 권리 재허용 후 자동 부활 금지 원칙에 따라 stale approval·snapshot·delivery state를 되살리지 않으며, 새 run/review/snapshot과 새 epoch, 현재 구독 opt-in 및 다른 open gate를 각각 다시 확인한다. 재허용은 이전 메시지의 correction/retraction 완료를 의미하지 않는다. 이는 runtime lineage 저장·전파가 구현됐다는 주장이 아니다. price rights/provider availability의 책임 결정인 `KR-MARKET-DATA-RIGHTS-01`은 provider·product·endpoint·field·action·purpose·channel·retention/replay별 직접 권리 근거를, `KR-EVENT-STUDY-POLICY-01`은 사전 분석 family와 해석 경계를 각각 책임진다. 기존 `KR-SHADOW-SLO-01` 및 `KR-END-TO-END-ACCEPTANCE-01`의 승인된 denominator/gold set/독립 reviewer도 별도로 필요하다. KRX 정책 문서는 참고자료이며 상업용/비상업용, 취득, 보존, 재실행, 파생통계 계산·재배포 권한을 이 문서가 해석 또는 부여하지 않는다. 현 공개 API의 `dataUpdatedAt`을 보강하거나 새 history table/API를 구현하자는 승인으로 간주하지 않는다. 이 결정·권리/보존 증거, route inventory/unauthenticated GET audit 전에는 runtime 결과 공개가 계속 차단된다. (`EPO-33`은 기업행사 revision이 영향을 주는 종목의 기존 수익률을 stale 처리하고 raw/조정 basis를 섞지 않는 사례다.)

가격/지수의 같은 basis와 timestamp가 검증됐을 때만 `rawReturn=(P_end/P_start)-1`을 산출한다. 비교지수가 같은 구간으로 정렬되면 별도 보조치 `marketAdjustedReturn=rawReturn-stockMarketComparatorReturn`을 계산할 수 있다. 이는 단순 시장 차감 통계이며 factor model abnormal return이나 사건 인과효과로 부르지 않는다. 비교군 candidate set, 각 지수의 공식 산출방법론 revision, 가격수익/총수익 구분, 통화, 구성종목 membership as-of와 사전 primary comparator를 결과 열람 전에 고정한다. pre-event price trend는 별도 기준구간의 descriptive context로 표시하며 event-window return을 다시 쓰거나 인과 통제 효과로 간주하지 않는다. 시장/업종 comparator가 서로 다른 결과를 보이면 사전 지정된 primary와 모든 sensitivity result를 병기하고 사후에 더 유리한 부호를 primary로 승격하지 않는다. 시작 가격이 0/누락, split/dividend adjustment 미확인, 가격/benchmark 구간 불일치, 비거래/정지 상태, data vendor correction 미대조이면 해당 산식은 `NOT_COMPUTABLE`이다. 퍼센트와 가격, 거래량은 기준 raw values·소수 자리·통화·세션·데이터 freshness와 함께 보존한다.

발표 시각이 정규장 밖/중인지 구분할 증거가 있으면 event-time aligned window를 우선한다. 일봉만 존재해 정규장 중 발표의 선후 분리를 못 하면 “해당 거래일 일봉 변화”로만 기술하고 disclosure 이후 반응이라고 주장하지 않는다. 장전 발표는 같은 거래일, 장후/휴장 발표는 다음 거래일 등 window 시작 규칙을 event-time/session map으로 명시하되 거래소 캘린더와 발표 timestamp를 확인하고, timestamp 없는 날짜에 규칙을 추측 적용하지 않는다.

과거 유사사례 집계는 event taxonomy·결과상태·발표시각 구간·시장·기간/가격자료 기준을 분석 전에 고정하고, 포함·제외·가격 미취득·상장폐지·정지·confounded 표본을 전체 denominator에 기록한다. N, median/분포 및 손실·상승·무변동 표본을 같이 보이고 단일 평균이나 생존한 종목만으로 일반화하지 않는다. event window, 최소 표본수, material move threshold, comparator/index, winsorization/outlier policy, sample lookback, risk adjustment와 통계적 유의성 기준은 `KR-SHADOW-SLO-01`, `KR-END-TO-END-ACCEPTANCE-01` 및 투자분석 owner 승인 전 미정이다.

Acceptance fixture에는 (a) 장전/정규장중/장후/날짜만 공개, (b) 휴장·주말·timezone/DST 경계, (c) KR price limit/trading halt, (d) split/dividend/ex-date, (e) 다른 동시 공시/실적, (f) 지수 market holiday/누락, (g) raw price와 adjusted price 차이, (h) vendor 수정/late candle, (i) 멀티종목 각 봉의 서로 다른 update time, (j) 상장폐지·생존편향, (k) event window를 바꿀 때 결론 변화, (l) 주가 급등인데 공식 사업근거가 약한 경우를 포함한다. 개인 event analysis에는 정확 발표시각·가격 provider·기준가·구간·산식·표본 N·confounder·제한을 표시한다. 기존 공개 daily-candles API에는 이 목적의 provenance/adjustment contract가 없어 현 API를 곧바로 post-event performance feature로 사용하지 않으며, 새 API/계산은 rights·OpenAPI inventory·unauthenticated GET 감사 및 해당 결정 승인 후 별도로 기획한다.

##### Event reaction과 cohort study의 사전등록 경계

개별 종목의 가격 관측과 event-kind별 과거 cohort 집계는 서로 다른 분석 제품으로 취급한다. 개별 관측은 해당 filing/event의 event-time과 가격 구간을 기술한다. cohort 집계는 여러 issuer의 사후 결과를 요약하므로 모집단 정의·포함 규칙·시장 comparator·관측 구간·분석식이 outcome 확인 전에 고정돼야 한다. `policyFrozenAt`이 최초 가격 결과 확인 이후이거나 결과 확인 증거가 없으면 확인적 cohort 결과를 차단하고 `EXPLORATORY_SENSITIVITY_ONLY`로 표시한다. 사전 창을 바꿔 계산한 결과는 전부 함께 노출하며 가장 유리한 창을 대표값으로 고르지 않는다.

| 결정 단위 | 사전 고정할 것 | 보고할 분모/한계 |
|---|---|---|
| Cohort membership | event taxonomy revision, 확정/미확정/정정 상태, issuer/instrument eligibility 기준일, 중복 event 묶음 규칙, lookback 범위와 source coverage | 전체 후보, 포함, 제외 사유별 수, 관계/결과 미확인 수; delisted·halted·missing price도 denominator에서 지우지 않음 |
| Primary window | `eventWindowPolicyId`, 발표시각 precision/session map, 시작·종료 bar convention, 휴장·비거래일 처리, outcome 관측 종료 | `policyFrozenAt`과 price snapshot manifest, 정책 이후 바뀐 분석은 별도 revision으로 보존 |
| Comparator | broad-market/index 또는 사전 정의된 event-kind comparator 우선순위, instrument/benchmark venue·currency·price/total-return basis, 동일 session alignment, 과거 constituent/as-of 요구 | 현재 구성종목만 존재해 과거 constituent set을 재현할 수 없으면 비교수익 `NOT_COMPUTABLE`; comparator를 결과에 맞춰 교체하지 않음 |
| Confounder search | 조사할 공식 공시·실적·시장조치·거래정지 및 사전 승인된 sector/macro source와 검색 window | source별 실제 coverage/run·검색 범위와 발견 수. 검색 범위가 비었거나 확인되지 않으면 `CONFOUNDER_SCOPE_UNASSESSED`; “교란 없음”으로 줄이지 않음 |
| Sensitivity analysis | 사전 정의된 보조 window/comparator/model과 confirmatory/exploratory 구분 | 결과를 나란히 보고 일관성·민감도 표시; 통계적 유의성·인과효과를 주장하지 않음 |

이 계약은 outcome leakage, survivorship, post-hoc window/comparator selection과 “unsearched means unconfounded” 오류를 줄이는 제품 수용 기준이다. `EPO-11`–`EPO-15`는 이 다섯 경계를 synthetic vector로 고정한다. 최소 cohort·최소 N·검정력·materiality threshold는 투자분석/독립 검토 owner가 승인 전 임의로 정하지 않는다.

#### 일정 certainty와 event status 분리

| 문서가 말한 것 | certainty | assertion/event treatment |
|---|---|---|
| 원문 또는 적격 공식 field가 정확한 날짜·시간과 확정 문구를 직접 제시 | `OFFICIAL_CONFIRMED` 후보 | 해당 field의 locator·rights·revision·timezone을 모두 확인한 뒤 일정 assertion 승인. event 완료와 혼동 금지 |
| 발행사가 “예정/목표/계획/약”으로 제시하거나 월/분기만 제시 | `COMPANY_ESTIMATE` 또는 정밀도 보존된 `ESTIMATED` | 원문 precision 그대로. 확정일, 보장 일정, 긍정 촉매로 바꾸지 않음 |
| ClinicalTrials.gov 등 공식 등록부가 `estimated`라고 제공 | `REGISTER_ESTIMATE` | registry 이름/record revision/조회일과 연결하고 회사 확정 일정과 분리 |
| 3자 캘린더/기사 추정 | `THIRD_PARTY_ESTIMATE` | 공식 사건 사실로 승인하지 않으며 원문/공식 확인 전 event/date 공개 근거로 사용 금지 |
| 결과 발표로 일정이 완료되었거나 회사가 연기·취소 명시 | `OFFICIAL_REPORTED_OUTCOME` | 결과 사실 claim과 event lifecycle transition을 분리. `COMPLETED/CANCELLED`는 새 공식 근거·관계 검토 후 전환 |
| 날짜가 없거나 문서끼리 충돌, 지역 시간대만 있고 표준 zone 불명 | `UNKNOWN/CONTESTED` | 미공개/상충/시간대 unresolved 사유 보존; 임의 날짜·offset·instant 생성 금지 |

certainty는 일정 근거의 성격이고 event status는 사건 lifecycle이다. “확정된 일정”은 그 날짜에 사건이 완료됨을 뜻하지 않으며, 일정 존재만으로 방향성을 정하지 않는다. 접수일(`DATE_ONLY`), underlying event date, 법적 효력일, 거래개시일은 각각 다른 assertion kind로 기록한다.

#### 검토자가 완료해야 하는 체크리스트

1. 원문/첨부가 동일 immutable revision이며 source URL·hash·locator를 재현할 수 있는가? 권리 action이 정확한 source component와 분석/저장/표시 목적에 유효한가?
2. claim마다 `FACT`, `INTERPRETATION`, `COUNTER_EVIDENCE`, `UNKNOWN`이 구분되고, 사실의 모든 evidence role/status가 모순되지 않는가?
3. 수치마다 raw value, unit/currency, period, denominator, basis(발행주식/유통주식 등), normalization 식이 있는가? 없으면 숫자 비교를 완료로 표시하지 않았는가?
4. 이벤트 당사자와 상장 subject의 연결에 직접 claim이 있는가? group relationship/제출자 코드만으로 ticker를 정하지 않았는가?
5. 같은 공시의 정정·철회, 다른 official source, attachment 변경에 반대·후속 근거가 있는지 required reconciliation 상태 안에서 확인했는가?
6. 주장되는 catalyst가 실현되는 조건과 조건 불발/지연/취소 시 경로, 희석·현금·법률·규제·상장유지 위험을 실제 자료와 미확인으로 나누었는가?
7. 각 date assertion은 kind, value precision, certainty source, timezone, lifecycle status 및 supporting claim에 일치하는가?
8. 검토 판단이 현재 content hash와 dependency fingerprint에 묶여 있는가? 입력 변경 뒤 과거 승인을 재사용하지 않는가?
9. analysis approval, event/date approval, 권리·subject·freshness publication gate가 분리되었는가? public response는 별도 동일 snapshot gate를 통과했는가?
10. 최종 결과가 `APPROVED`, `NEEDS_EVIDENCE`, `REJECTED`, `UNRESOLVED` 중 하나와 이유, 영향 claim/event/date 목록으로 남는가?

최소 fixture 분모에는 용어별 날짜 정밀도(DAY/MONTH/QUARTER/RANGE/UNKNOWN), 이사회일과 효력일 혼동, local time/timezone, 날짜 정정·철회, 정정 marker만 있고 대상 관계가 불명인 경우, 숫자 단위/주식기준 오류, 긍정 주장과 공식 반대 근거 동시 존재, 조건부 계약/납입 전 발행/거래 미개시, 첨부에만 핵심 조건 존재, 원문 미취득·rights deny, prompt-injection 문구, 같은 input 재실행의 결과 drift를 포함한다. 허용 오류율·fixture 수·reviewer agreement·성능 목표는 `KR-TAXONOMY-01`, `KR-ANALYSIS-REPRO-01`, `KR-DOCUMENT-UX-01` 소유자 승인 전 미정이며 이 workflow는 운영 자동 승인 기준이 아니다.

이 P4 추가는 분석 저장 schema, prompt, UI 또는 공개 정책을 구현하지 않는다. 검토 흐름만 설계하며 P4는 `BLOCKED_BY_DECISION: KR-TAXONOMY-01, KR-ANALYSIS-REPRO-01, KR-DOCUMENT-UX-01` 상태를 유지한다.
### P3 진행 기록 — 수집 coverage와 정정 재조정

P3는 “요청이 성공했는가”, “응답 page를 끝까지 열거했는가”, “응답 item 수가 run의 합계와 일치했는가”, “그 시점의 원천 목록이 이후 조회에서도 안정적으로 재현되는가”, “정정/철회 대상 원문을 재검토했는가”를 서로 다른 주장으로 관리한다. 한 날짜의 페이지를 모두 읽어도 이후 추가·정정 제출이 없다는 의미는 아니다.

#### Coverage 단위와 허용 주장

| 단위 | 필수 기록 | 검증 성공 시 말할 수 있는 것 | 말할 수 없는 것 |
|---|---|---|---|
| `FetchRun` | source/product, 조회 기간과 filter fingerprint, 실행 시작/종료시각, credential 상태(값 미기록), HTTP/API status, request ID, parser version, response hash 또는 비보존 사유 | 해당 실행이 호출에 성공·부분 성공·실패했는지 | 전체 날짜/원천 집합이 완전하다는 것 |
| `PageObservation` | 요청 page/count, 응답 `page_no/page_count/total_count/total_page`, row count, first/last receipt 및 metadata digest | 응답 echo가 맞고 관찰된 페이지 수·합계가 서로 일치하는지 | pagination 중 원천 데이터가 변하지 않았거나 server-side snapshot이 있었다는 것 |
| `WindowEnumeration` | 요청 page range, 실제 page 집합, raw row count, 유효 receipt count, unique receipt count, 중복·무효 row, page totals의 동일성 | 해당 run의 요청 범위가 열거되었는지와 중복/누락 의심 여부 | 원천에 아직 노출되지 않은 late filing/correction이 없다는 것 |
| `ReconciliationPass` | 동일 date/window scope의 receipt set 및 metadata hash digest, 정책 revision, pass 시작·종료, 직전 pass 비교, quota 사용량 | 두 관측 pass에서 동일 scope의 결과가 같거나 달랐는지 | pass 간 같다는 이유만으로 공급자의 보장된 snapshot/completeness가 성립했다는 것 |
| `CorrectionCoverageAssertion` | 승인 lookback/window policy, 마지막 성공 reconciliation 시각, required scope 결과, correction marker 및 lineage 처리 상태, source rights 상태 | 승인 정책 범위 내 마지막 재조정의 관측 시점·성공/부분/미확인 상태 | 정책 window 바깥에 정정이 존재하지 않거나 원문 내용이 참이라는 것 |
| `DocumentCoverageAssertion` | 각 filing receipt/document key별 공식 원문 접근 결과, HTTP/API 오류 분류, ZIP/container 검사 결과, attachment inventory 상태, rights action decision | 대상 목록 metadata와 별도로 원문/첨부 fetch가 성공·실패했는지 | 원문 미취득을 “해당 내용 없음”으로 해석하는 것 |

#### 상태 전이와 노출 허용

| 계산 결과 | 상태 | 일정·event 사용 규칙 |
|---|---|---|
| 조회가 auth/quota/maintenance/invalid request로 실패하거나 필수 page 부재 | `FAILED` 또는 `PARTIAL` | 이 범위에서 새 event/date 후보를 승인하지 않는다. 권한·quota 실패를 빈 결과로 바꾸지 않는다. |
| 모든 응답 `status=000`, echo/page/count validation 통과, 전체 `total_page` 요청 및 row 합계가 일치 | `PAGE_ENUMERATION_COMPLETE` | 해당 run의 metadata enumeration 완료만 표시. source snapshot complete/current라고 표시하지 않는다. |
| 별도 reconciliation pass의 같은 scope receipt set와 metadata hashes가 일치 | `OBSERVED_STABLE` | 관찰 pass 간 변동 없음. 반복 조회 횟수나 안정 기간은 승인 freshness policy가 정하며 그 전에는 운영 current/fresh로 승격하지 않는다. |
| pass 간 receipt 추가·삭제, 제목/metadata hash 변경, correction/withdrawal marker 변화 | `CHANGED_REQUIRES_REVIEW` | 새 filing/revision candidate와 영향 분석 queue를 만들고 이전 승인본을 자동 재사용하지 않는다. |
| marker는 있으나 공식 relation key/원문 locator가 없거나 후보 filing이 복수 | `CORRECTION_RELATION_UNRESOLVED` | 자동 merge/철회 연결 금지. 영향 받는 관련 일정/subject를 검토 상태로 suppress하고 reviewer resolution을 기다린다. |
| 원문 fetch/권리 action/첨부 확인이 미완료 또는 redirect/error body | `DOCUMENT_UNAVAILABLE` / `RIGHTS_UNRESOLVED` | 목록 metadata를 본문 사실 근거로 격상하지 않는다. 본문 근거가 필수인 claim/event/date 공개를 차단한다. |
| 승인된 required window의 모든 scope가 검증되고 권리·문서·정정 relation gate도 통과 | `RECONCILED_AS_OF` | assertion의 `asOf`, policy revision, scope hash까지 함께 표시할 수 있다. “영구 완전성” 또는 원천의 사실 보증을 뜻하지 않는다. |

#### DART 목록 재조정 수용 검사

OpenDART 공시검색 가이드는 `list.json` 요청의 `page_count` 범위를 1~100으로 두고, 응답에 `page_no`, `page_count`, `total_count`, `total_page`, `list`를 명시한다. 현재 `lib/dart-opendart-client.ts`는 KST 당일과 page size 100을 보내 `total_page`까지 순회하고 `rcept_no`로 Map 중복 제거를 하지만 응답 page echo/count, 매 페이지 `total_count/total_page` 안정성, row 합계·유효 receipt 수 및 중복/무효 분모를 검증하지 않는다. 따라서 기존 run의 `pagesFetched`와 unique rows만으로 `PAGE_ENUMERATION_COMPLETE`를 소급 주장하지 않는다.

향후 run 검증은 다음 순서를 사용한다.

1. 요청 window/date, `last_reprt_at`, sort, page size, endpoint version을 canonical scope fingerprint에 고정한다. 인증키는 fingerprint/로그/manifest 어디에도 기록하지 않는다.
2. 첫 정상 page의 `total_page`, `total_count`, `page_count`를 run expectation으로 고정하고 각 응답의 `status`, `page_no`, `page_count`, totals를 요청 및 기존 expectation과 비교한다. total/page가 달라지거나 expected page가 실패하면 해당 run은 inconsistent/partial이다.
3. 각 응답 list가 배열인지 검사하고 raw rows를 먼저 계수한다. row마다 receipt 형식·중복 여부·원천 필수 metadata를 검사한다. invalid receipt를 조용히 버리지 말고 해당 run denominator와 quarantine에 남긴다.
4. `sum(page row_count) = total_count`와 `unique valid receipt count = expected total_count`를 별도 비교한다. 공식 가이드의 empty result status `013`는 그 요청 조건의 조회 결과가 비어 있다는 뜻으로만 보존하며 outage/auth/quota 오류와 동일시하지 않는다.
5. `total_count`와 `total_page` field 의미를 현재 guide revision에 확인해 저장한다. 가이드 문구/응답 실증과 계산이 모호하면 `CONTRACT_AMBIGUOUS`로 분류하고 schema assumption을 고정하지 않는다.
6. metadata digest는 canonicalized row values와 receipt의 정렬된 집합으로 만들고, 같은 scope의 후속 pass와 receipt-set 및 receipt별 metadata hash를 비교한다. pass 사이 변동이 없으면 `OBSERVED_STABLE`일 뿐이다. source-side snapshot token이 없는 pagination은 같은 결과 반복만으로 immutable snapshot을 주장하지 않는다.
7. marker/후속 filing이 발견되면 receipt identity는 유지하고 correction relation 후보를 append한다. 명시된 공식 원관계나 재현 가능한 원문 근거가 없으면 relation을 확정하지 않는다. 정정 전후 값을 최신값으로 덮어쓰지 말고 revision assertion과 영향 consumer를 연결한다.
8. 승인 freshness/lookback policy가 없는 현재는 `RECONCILED_AS_OF`를 만들지 않는다. 기존/새 active·upcoming 일정은 last successful correction reconciliation의 age를 판단할 수 없으면 freshness `UNKNOWN`으로 publication을 suppress한다.

#### 공식 오류와 coverage 분류

공시검색 가이드에서 `010/011/012/901`은 키·접근/IP·계정 관련 오류, `020/021`은 호출량/조회 대상 제한, `013`은 조회 데이터 없음, `014`는 파일 없음, `800`은 점검으로 각각 구분된다. `100/101`은 요청 필드/접근 오류이고 `900`은 정의되지 않은 오류다. 실제 handler는 HTTP status뿐 아니라 JSON `status/message`를 검사해야 한다. quota/auth/maintenance와 정상 빈 결과를 같은 `[]`로 반환하지 않으며, `014`를 빈 문서 성공으로 처리하지 않는다. API 가이드의 일일 호출량은 변경 가능하고 사용자 계정별 허용량 설정도 있을 수 있으므로 고정 숫자를 설계 기본값으로 만들지 않는다.

| failure class | 예시 | run/coverage 처리 | 복구 조건 |
|---|---|---|---|
| `AUTH_OR_ACCOUNT` | `010`, `011`, `012`, `901` | `FAILED`/`SKIPPED_CREDENTIALS`; 빈 정상 결과 아님 | secret을 로그에 노출하지 않고 설정 owner가 키/IP/account 상태 확인 후 새 run |
| `QUOTA_OR_RESULT_LIMIT` | `020`, `021` | `PARTIAL` 또는 `FAILED`; 완료 page 전까지 enumeration 불가 | 계정별 allowance/공식 quota에 맞춰 승인된 window로 재시도 |
| `NO_DATA` | `013` | 요청 scope의 empty observation만 기록. 주변 날짜/기간 누락과 동일시하지 않음 | 해당 scope와 다른 required scope를 각각 reconciliation |
| `SOURCE_FILE_ABSENT` | `014` | metadata run과 document fetch 상태를 분리하고 문서 `UNAVAILABLE` | receipt/endpoint/기간을 확인하고 재시도; 부재 사실을 주장하지 않음 |
| `INVALID_REQUEST` | `100`, `101` | `FAILED`; request fingerprint·필드 검증 | 요청 계약 수정 후 새 run; 원 요청 snapshot 유지 |
| `MAINTENANCE_OR_PROVIDER` | `800`, `900`, HTTP 429/5xx/network timeout | `PARTIAL`/`FAILED`; prior success를 현재 성공으로 취급 금지 | provider 회복 후 동일 scope idempotent replay 및 비교 |
| `CONTRACT_OR_PAYLOAD_DRIFT` | malformed JSON/list, page echo mismatch, total/page 변화 | `INCONSISTENT`; 해당 pass 결과로 새 승인 projection 금지 | guide/응답 contract 검토 및 versioned parser fixture 갱신 |

조회 간격, 겹침 lookback, required historical window, max-age, 재시도 상한, quota budget, `OBSERVED_STABLE` pass 수, freshness grace는 `KR-RECONCILIATION-01` 소유자가 계정 한도·정정 유입 관측·운영 비용을 근거로 승인해야 한다. 그 전에는 임의 수치를 쓰지 않고 coverage/freshness `UNVERIFIED`로 둔다. 이 P3 세부화는 새로운 collector, test, DB/API, schedule을 구현하거나 기존 운영 수집 결과의 상태를 승격하지 않는다.

#### 공통 coverage assertion reconciliation manifest — DSC-11–DSC-16

위 P3 단위들은 공개 dossier, 일정 결과 확인, 추가상장 결과 확인이 별도 coverage 정의를 만들지 않도록 [합성 coverage fixture](../fixtures/disclosure/disclosure-source-coverage.v0.json)의 `coverageAssertionManifestContract`로 연결한다. manifest 한 건은 source product·endpoint·정규화 query scope·issuer/instrument·선언 window·reconciliation run에만 유효하다. page별 요청/응답 번호·total/page echo·status·row count·receipt/metadata digest와 raw/valid/unique/duplicate/invalid row denominator, provider snapshot capability, reconciliation pass, correction policy/window/watermark·disposition digest, official master snapshot·subject crosswalk revision, exact rights decision set/action, coverage policy revision과 최종 manifest digest를 한 세대에 결박한다. credentials나 권리상 보존 불가한 원문 bytes는 manifest에 넣지 않는다.

`PAGE_ENUMERATION_COMPLETE`는 그 run의 page 열거·분모 일치만 말한다. 동일 scope에서 두 pass의 receipt/metadata digest가 같아도 provider immutable snapshot이 없다면 `OBSERVED_STABLE`일 뿐이다. 승인된 lookback/freshness policy, correction watermark, subject master/crosswalk, 필요 action의 current rights가 함께 맞을 때에만 `RECONCILED_AS_OF`로 승격한다. 어느 source 또는 window 하나라도 필수인데 partial이면 종합 coverage는 partial이며 다른 source의 성공을 빌려 채울 수 없다. `RECONCILED_AS_OF` 한정 scope의 결과 0건은 dossier의 `NOT_FOUND_IN_SCOPE`, 확인된 문서 특정 항목 미기재는 `NOT_REPORTED`, incomplete/unknown은 `UNVERIFIABLE`에 매핑한다. ESN-15/18과 FUEV-15/16의 기존 outcome/status 규칙은 이 공통 manifest의 소비자별 출력이며 자동으로 event 완료·취소 사실을 만들지 않는다.

##### Manifest 필드별 저장 책임·갭 감사

같은 합성 fixture의 `storageOwnershipGapMatrix`는 49개 required field를 누락 없이 한 행씩 대조한다. 확인 범위는 체크인된 `db/migration`, `lib/schema.ts`, `lib/dart-opendart-client.ts`, decision register다. coverage assertion 전용 migration/schema는 찾지 못했다. `fetchOpenDartToday()`는 KST 일자와 page size 100을 사용하고 `total_page`를 순회하며 receipt map으로 중복을 덮어쓴다. 그러나 페이지 관측을 저장하지 않고 `total_count`와 수집 row 수를 대조하지 않으므로 이를 manifest·coverage 증거의 저장으로 보지 않는다.

행의 `storageDisposition`은 `DESIGN_ONLY_NO_MIGRATION`, `PARTIAL_RUNTIME_NOT_RECONCILIATION`, policy decision 미승인, rights/action 미승인, 또는 canonical assertion 없는 파생 상태로 나뉜다. `candidateOwnerRole`은 register가 정한 승인 책임 범위를 저장 구현·소스 증거의 제안 책임으로 연결한 것이며 사람을 지정하거나 승인을 표시하지 않는다. 모든 consumer gate는 `UNVERIFIABLE` 또는 `SUPPRESSED_RIGHTS`다. fixture는 저장소 밖 DB catalog를 읽지 않았으므로 그 상태를 `UNKNOWN_NOT_INSPECTED`로 남긴다.

향후 저장 설계 후보는 page observation·분모·scope/policy revision·결과 사유 및 허용된 digest다. credentials, 승인되지 않은 filing body, retention 결정이 없는 source bytes는 manifest에 저장하지 않는다. digest도 원문 파생정보일 수 있으므로 `KR-DART-RIGHTS-01` 및 `KR-RETENTION-01`의 정확한 source/field/action/purpose/channel/retention 승인이 선행돼야 한다. 이 표는 migration 요청이나 운영 적재 승인이 아니다.

##### 저장·reconciliation·공개 단계별 decision gate

fixture의 `decisionGatePlan`은 register와 evidence ledger의 의미를 다음 산출물에 연결한다. 현재 ledger는 비어 있고 lifecycle baseline상 22개 결정은 모두 `OPEN`이다. register의 owner role과 acceptance evidence만으로 승인 상태를 추정하지 않는다.

| 다음 단계 | 필요한 decision | 통과 후에도 별도로 필요한 것 |
|---|---|---|
| 저장 설계 구체화 | `KR-DART-RIGHTS-01`, `KR-RETENTION-01`, `KR-DB-DRIFT-01`, `KR-OPERATIONAL-SECURITY-01` | 권리 범위별 field/action/retention 판정, 환경별 catalog·drift/backup 증거, append/idempotency/access/deletion controls; 원문 bytes는 계속 별도 금지/허용 판정 |
| `RECONCILED_AS_OF` 후보 | 위 결정 중 rights/retention 적용 + `KR-RECONCILIATION-01`, `KR-MASTER-SNAPSHOT-01`, `KR-EVENT-ATTRIBUTION-01` | 승인된 source window·quota·freshness 분모, 공식 snapshot/crosswalk 및 직접 subject 근거, 구현된 denominator 검증과 replay evidence |
| 공개 범위 내 미발견 결과 | 위 reconciliation decision + `KR-API-UI-CONSISTENCY-01`, `KR-DOCUMENT-UX-01` | 공개 API/UI 동일 snapshot, 표현/출처표시/권한/캐시 정책, 해당 consumer end-to-end acceptance |

하나의 decision이 `APPROVED`여도 그 scope만 다룬다. approval은 구현 gate나 consumer 활성화를 자동으로 열지 않는다. 원천 약관·상품·endpoint·field/action·목적·채널·보존 조건, freshness/lookback policy, master/crosswalk revision, DB drift/external writer 또는 manifest lineage가 달라지면 해당 범위를 재개방한다. 상태는 append-only evidence ledger의 검증된 최신 revision에서만 산출하고 ledger integrity가 불명확하면 fail-closed한다.

##### `KR-DB-DRIFT-01` 환경 증거 패키지

`databaseDriftEvidencePackage`는 새 collector나 운영 DB 조회를 수행하지 않고, 결정에 제출되어야 할 환경별 증거 bundle을 정의한다. 현재 저장소 migration source는 V165까지이며 새 migration은 기존 DB에 적용되지 않았다. 2026-11-01 localhost read-only audit의 source V163 관측은 그 날짜의 snapshot으로 보존한다. `scripts/audit-flyway-history.ts`, health 응답의 `flywayVersion/schemaReady/missingTables`, P5의 destructive precondition 기록은 운영 DB가 최신이거나 정합하다는 증거가 아니며, 운영 catalog와 외부 writer inventory는 미수집 상태다.

각 환경 bundle은 instance fingerprint·DB/version/role·schema/Flyway history digest와 repository head·pending/failed/checksum 차이·relations/constraints/indexes·views/functions/triggers·roles/grants/default privileges·writer/importer 목록·배포 artifact/commit·scope별 row count/digest·backup snapshot/시각·restore rehearsal·destructive precondition·additive dry-run·owner review를 하나의 evidence manifest digest로 연결한다. instance fingerprint와 role은 비밀정보를 포함하지 않는 안정 식별 원칙을 별도 정해야 하고, credential/connection string은 artifact에 넣지 않는다.

catalog query는 environment×instance×database role×schema×관측시각×query revision 범위를 함께 기록한다. relation inventory는 public만 보는 현재 감사 query와 달리 시스템 객체를 제외한 모든 사용자 schema와 relation kind를 분모로 정의하고 owner, persistence, partition parent/child 관계를 포함한다. columns/constraints/indexes는 정의 및 valid/ready 상태와 relation별 object count를 기록하고, view/materialized view·function/procedure·trigger는 disabled/internal 상태까지 분류한다. privileges는 role membership·PUBLIC·상속 권한·grant option·default privileges를 포함한다. 각 catalog query는 text digest, 시작/완료시각, 가시 schema, 반환건수, object-kind별 기대/관측 건수, 권한 거부 scope, 결과 digest와 completeness를 가진다.

검사자가 볼 수 없는 relation·role·function이 하나라도 있거나 쿼리 간 object count/digest가 불일치하면 `PARTIAL_PRIVILEGE_OR_QUERY_FAILURE`; 기대 분모를 재현할 수 없으면 `UNKNOWN_NO_RECONCILABLE_DENOMINATOR`로 둔다. zero row는 선언한 schema/object scope, query 성공, catalog 권한 가시성, 독립 summary 대조가 전부 맞을 때에만 그 scope의 부재 증거다. 현재 `audit-flyway-history.ts`는 public relations/columns/constraints를 읽고 migration DDL에서 heuristic으로 예상 객체를 비교한다. 모든 schema, constraint definition/validation, index validity, views/functions/triggers, grants, catalog permission holes를 닫는 감사가 아니므로 이 acceptance를 통과했다고 간주하지 않는다.

writer denominator는 app route/server action, cron/scheduled function, importer/backfill/manual script, DB trigger/function/job, 외부 service/operator console을 포함한다. 각 writer는 환경, 책임 role, principal/entry point, relation/action, 배포·schedule, 관측일, 재현 가능한 증거, 조사 disposition을 가진다. 미분류 principal, 빈 inventory, health만 있는 응답은 완료 증거가 아니며 미분류 writer는 migration/import를 차단한다. 환경별 report가 모두 같은 기준시점·commit을 참조하지 않으면 결합하지 않는다.

재현 가능한 writer mapping은 repository entrypoint·migration side effect·deploy scheduler·DB effective writer principal을 `environment × deployment commit/artifact × principal × target relation × observation window`로 결합한다. 모든 write-capable principal은 writer row 또는 owner가 attested한 `UNUSED/DISABLED` disposition을 가져야 하며, 발견한 모든 write entrypoint는 principal/relation/owner로 역추적 가능해야 한다. dynamic SQL target 미확정, 배포 schedule과 repository task 불일치, 외부 service/operator 범위 미확인은 inventory를 `PARTIAL_REPOSITORY_ONLY` 또는 `UNKNOWN_EXTERNAL_WRITER_COVERAGE`로 남긴다. 정적 grep은 lower bound이며 외부 운영자 확인 없는 “writer 0건” 판정은 금지한다.

합성 회귀 사례 `DBI-01`–`DBI-10`은 scope가 충분히 선언된 실제 empty, 다른 schema 권한 누락인데 결과 0행, relation-kind count mismatch, query failure, duplicate row의 digest 변화, 순서만 다른 동일 집합의 canonical digest, repository-only 빈 writer 결과, 모든 writer join 완료, dynamic SQL 미해결, scope/canonicalization revision 변경을 구분한다. `zeroMeansAbsent=true`는 DBI-01처럼 query·privilege·독립 summary 분모가 맞는 지정 scope에만 허용한다. DBI-06은 catalog 집합이 완전해도 writer 상태가 unknown이므로 migration gate는 계속 닫는다. 사례는 합성 fixture이며 DB query 결과나 실제 migration acceptance 실행으로 해석하지 않는다.

Fixture contract `database-inventory-golden-case.v0`는 [JSON Schema Draft-07](../fixtures/disclosure/schema/database-inventory-golden-case.v0.schema.json)로 case/input/expected의 필드 집합을 strict 허용목록으로 정의한다. category별 required+allowed input, 상태 enum, boolean/string/string-array/nonnegative count-map type을 schema에서 검사한다. checker는 schema draft·category branch·required/allowed key parity와 DBI case 분모를 fixture contract와 자동 대조한다. 개발 환경에서 resolve되는 Ajv 6.15.0으로 10개 vector가 schema validation을 통과했다. Ajv는 앱 직접 dependency가 아니며 프로젝트 자동 검사에 의존성으로 추가하지 않았다. row set은 배열 tuple을 정렬해 JCS 계열 digest를 비교하는 제안이다. JSON Schema validation도 production canonical serializer 구현의 acceptance를 대신하지 않는다. Ajv is pinned as a development dependency and `docs:check` compiles this Draft-07 schema, validates all ten synthetic DBI cases, and rejects extra-property and invalid-type mutations. This is fixture contract validation only; it does not establish live database observations or production serializer acceptance.

제출 순서는 immutable snapshot/hash → repository history/checksum 대조 → drift/destructive prerequisite 해소 → privilege와 writer denominator → backup restore rehearsal → 승인된 additive dry-run 및 row/hash reconcile → 환경과 artifact에 한정된 named DB owner 승인이다. 자동 repair/baseline/migrate는 이 evidence gathering의 일부가 아니다. 로컬 audit 스크립트가 존재해도 실행은 별도 권한/자료 접근이 주어지지 않는 이상 생략하고, 운영 환경은 owner가 읽기 전용 bundle을 제출하기 전까지 `UNKNOWN`으로 둔다. 어떤 필수 자료라도 빠지면 `KR-DB-DRIFT-01`은 `OPEN`이고 storage design gate는 닫힌다.
### P1 진행 기록 — 공식 권리 증거 manifest v1

2026-11-04 재확인한 공식 자료는 권리 decision을 대신하지 않고 evidence inventory에만 반영한다. 현행 OpenDART [이용약관](https://opendart.fss.or.kr/intro/terms.do)은 제3조에서 약관 개정과 게시, 제5조에서 미규정 사항에 대한 관계 법령, 제10조에서 API 호출 허용량과 변경 가능성, 제16조에서 OpenAPI 서비스/관련 프로그램 저작권 및 미규정 저작권 사항의 법령 준용, 제23조에서 제출자 책임 및 정보의 정확성·완전성 비보장을 적고 있다. 이 조항만으로 raw body 장기보존·파생 요약 저장·인용·UI/API 재배포를 일괄 허용하거나 금지한다고 결론내리지 않는다. [공시검색 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001)는 `list.json/list.xml` 요청 및 응답 계약, `last_reprt_at=N`일 때 정정보고서 포함, `[기재정정]`·`[첨부정정]`·`[첨부추가]` 및 `rm`의 `정/철` 의미를 설명한다. [공시서류 원본파일 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003)는 `document.xml` GET이 접수번호 입력으로 ZIP binary를 반환한다고 설명한다. 이는 endpoint/response 계약이지 원문·첨부의 보존·파생·인용·재배포 허가가 아니다. 적용 상품과 정책 버전별 라이선스/약관 evidence가 따로 확보되지 않으면 데이터/법무 owner가 `UNRESOLVED`로 기록한다.

> 공식 자료 관측 메모: 위 OpenDART 약관, `list.json` 및 `document.xml` 개발가이드는 2026-11-04에 열람했다. `list.json` 조회 계약은 GET JSON/XML, `page_no` 1..n, `page_count` 최대 100, `total_page`/`total_count` 및 정정 표지를 명시한다. `document.xml`은 GET ZIP binary 응답이며 필수 요청 식별자는 40자리 인증키와 14자리 접수번호다. 약관은 개정 게시, 호출 허용량 변경, OpenAPI 서비스/관련 프로그램 저작권과 정보 정확성 비보장을 설명한다. 이 endpoint/약관 관찰만으로 데이터 상품별 이용허락·파생물 보존/재배포 범위를 확정할 수 없다. [공식 OpenDART 이용약관](https://opendart.fss.or.kr/intro/terms.do) · [공식 공시검색 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001) · [공식 공시서류 원본파일 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003).

##### 공공데이터포털 라이선스의 적용 범위 검토 메모

공공데이터포털 [금융감독원_공시정보_공시검색 상품(식별자 3075133)](https://www.data.go.kr/data/3075133/openapi.do)은 제공기관을 금융감독원, API 유형을 `LINK`, 형식을 JSON/XML, 이용허락범위를 공공누리 제1유형으로 표시하고 수정일을 2020-06-09로 기재한다. 공공누리 [제1유형 안내](https://www.kogl.or.kr/info/faqList.do?cPage=1&dataGroup=2&mstIdx=KOGL_005)는 출처표시 조건 아래 상업적 이용과 변경 이용이 가능하다고 설명한다. 이는 해당 포털 catalog item에 등록된 조건을 확인한 사실이다. OpenDART 약관은 별도로 OpenAPI 서비스의 저작권 및 관계 법령 준용을 규정하고, 검색 가이드는 API 응답 계약을, 원본파일 가이드는 `document.xml` ZIP 계약을 설명한다. 현재 확인만으로 세 자료의 법적 적용범위가 충돌한다고 단정하거나, 제1유형 표시가 OpenDART direct endpoint의 모든 응답·원문/첨부·파생물·제품 채널에 동일하게 승계된다고 단정하지 않는다.

| 검토 대상 | 확인한 공식 근거 | 권리 evidence로 등록할 관측 | owner가 답할 미결 질문 |
|---|---|---|---|
| `data.go.kr` 상품 `3075133` | catalog item `LINK`, JSON/XML, KOGL 제1유형, 수정일 `2020-06-09` | product identifier, exact product page snapshot/hash, 확인일, license label, catalog API type, 신청/운영 승인 표시 | catalog 등록 조건이 직접 OpenDART `list.json` 호출 및 그 응답 필드에 적용되는가? 적용 주체·version·유효기간은 무엇인가? |
| OpenDART `list.json` metadata | OpenDART 약관 및 공시검색 개발가이드 | terms revision/as-of와 guide ID, endpoint, 반환 metadata field set, attribution/quota statement | DART 회원 이용약관의 서비스 사용과 data.go catalog license가 어떤 범위로 함께 적용되는가? attribution은 어떤 표기/화면에 필요하며 직접 조회·저장·가공·외부 API·Push/Discord별 조건은 무엇인가? |
| OpenDART `document.xml`·ZIP 내부 첨부 | 별도 원본파일 개발가이드 | document endpoint, ZIP payload class, filing receipt locator, applicable terms evidence | `3075133` catalog license의 scope에 원문·첨부가 포함된다는 별도 공식 근거가 있는가? 없으면 별도 결정이 필요한가? |
| DS003/DS005 구조화 API 및 KIND RSS/문서 | 별도 guide/product/surface별 자료 | product/API별 identifier, fields, version, terms/license URL/hash, source update time | DART search product의 조건을 다른 API 제품, 거래소 source 또는 그 파생 claim에 승계할 수 있는가? 근거가 없으면 각 scope 상태는 계속 `UNRESOLVED`인가? |

이 검토는 현재 `DART_LIST_AUTOMATION`의 실제 호출 경로에서 metadata field를 확보해 alert를 구성하는 사실과 함께 심의할 권리 질문을 좁힌다. 데이터/법무 owner가 product-to-endpoint applicability와 action별 attribution·commercial use·retention·derivative·redistribution을 증거 문서로 결정하기 전에는 rights gate를 열지 않는다. 공식 자료가 “말하지 않음”은 `NOT_STATED`; 해당 캡처/버전이 없으면 `UNAVAILABLE`; applicability 해석이 미완료면 `UNRESOLVED`로 각각 유지한다.

#### 증거 manifest 최소 행 계약

| 필드 | 의미 및 검수 규칙 |
|---|---|
| `evidenceId`, `sourceProduct`, `endpointOrSurface`, `fieldOrPayloadClass` | 제품·endpoint/화면·응답 필드 또는 payload 종류를 구분한다. 문서 전체를 한 행의 권리 대상으로 뭉치지 않는다. |
| `action`, `purpose`, `channel` | `DISCOVER`, `FETCH`, `TRANSIENT_PARSE`, `PERSIST_RAW`, `PERSIST_DERIVATIVE`, `QUOTE`, `DISPLAY_METADATA`, `DISPLAY_DERIVATIVE`, `DISTRIBUTE_API`, `BACKUP`, `DELETE`별 사용목적/노출 채널을 분리한다. 행위가 약관에 명시되지 않으면 권한을 추정하지 않고 `UNRESOLVED`로 둔다. |
| `officialSourceUrl`, `sourceVersionOrObservedAt`, `capturedAt`, `contentHash` | 공식 URL과 관측 시각, 재검토 가능한 정책/가이드 버전, 허용되는 경우 증거 캡처의 SHA-256을 남긴다. 원문 캡처 저장 권리가 불명확하면 원문 사본을 저장하지 않고 URL·시각·hash 및 최소 인용 가능한 locator만 기록할 수 있는지 별도 검토한다. |
| `scopeText`, `attributionRequirement`, `quotaOrRateLimitEvidence` | 자료가 직접 허용/제한한다고 말하는 범위와 출처표시 문구, 공식 quota 상태를 원문 근거 위치와 연결한다. 내용이 없으면 `NOT_STATED`, 조회 실패면 `UNAVAILABLE`로 구분한다. |
| `evidenceClass`, `reviewStatus`, `ownerRole`, `reviewer`, `decisionRef`, `effectiveFrom`, `reviewDue` | `TERMS`, `API_GUIDE`, `DATA_PRODUCT_LICENSE`, `DISPLAY_POLICY`, `OBSERVATION` 증거를 구분한다. 법무/데이터 책임자의 선택 전 manifest는 증거목록일 뿐 권리 승인 register가 아니다. |
| `allowedActions`, `prohibitedActions`, `unresolvedQuestions`, `affectedGates` | reviewer가 판정한 뒤에만 권한 결과를 기입한다. 판정 전 action 값은 `UNRESOLVED`; 영향 gate는 fetch, retention, derivative, quote, UI/API, backup 중 해당 범위로 한정한다. |

##### Action-scoped rights decision product contract

증거 manifest는 원천 주장·관측사항이고 rights decision은 실제 제품 행위를 제어하는 별도 불변 record다. 정책 결정 단위는 `sourceProduct × sourceClass × endpointOrSurface × fieldScope × action × purpose × channel × retentionClass`다. 상태는 `UNRESOLVED`, `ALLOW`, `ALLOW_WITH_CONTROLS`, `DENY`, `EXPIRED`, `REVOKED` 중 하나다. 근거 없는 전역 `APPROVED` flag, source class 간 승계, 한 action/channel/retention 승인으로 인접 action을 풀어 주는 동작을 금지한다. 예를 들어 `DISPLAY_METADATA`를 허용해도 `ATTACHMENT`, `PERSIST_RAW`, `DISTRIBUTE_API`는 별도 결정 전 `UNRESOLVED`다.

Authorization point는 요청의 여덟 차원 전체가 정확히 채워지고, 동일한 full-scope tuple의 current decision이 유일할 때만 상태를 평가한다. 일부 차원이 비었거나 wildcard를 포함하면 match가 아니며 `UNRESOLVED`로 차단한다. 동일 scope에 둘 이상의 current decision이 매칭되면 status가 같더라도 자동 우선순위를 추정하지 않고 `DECISION_SCOPE_CONFLICT`를 기록해 차단·review한다. `ALLOW`가 `DENY/REVOKED/EXPIRED/UNRESOLVED`보다 우선하는 implicit precedence는 없으며, 최신 `updated_at`/revision이 이전 결정을 덮는 last-write-wins를 적용하지 않는다. wildcard/부분 scope decision은 authorization match가 아니다. Owner/reviewer가 충돌 범위를 adjudicate한 뒤 canonical lineage에 새 revision을 남기고 scope·근거·consumer 영향 및 재평가 결과를 연결해야 한다. 이 규칙은 `RAD-11`–`RAD-12` synthetic 사례로 고정되며 실제 법적 해석이나 runtime authorization 구현은 아니다.

| 제품 기능 | 동작 계약 | 미결정·예외 상태 |
|---|---|---|
| 정책 증거 registry | 공식 URL, 문서/product 식별자, 관측일 및 정책 revision/hash, evidence class(`TERMS/API_GUIDE/DATA_PRODUCT_LICENSE/DISPLAY_POLICY/OBSERVATION`), 근거 위치, 실제 허용·금지 텍스트, 누락·충돌을 함께 저장 | 공식 페이지 미접근/버전 불명은 `UNAVAILABLE`; 문서가 action을 말하지 않으면 `NOT_STATED`; 어느 쪽도 permission으로 승격하지 않음 |
| Rights decision editor | 정확한 source/product/component/action/purpose/channel/retention scope, 상태, controls, owner/reviewer, decision ref, 적용·만료·재검토 시각, 이전 revision을 입력; 승인자는 역할 이름 외 stable person identity를 가져야 함 | 미지정 reviewer, 만료/미래 effective time, scope wildcard, 증거와 decision 범위 불일치는 저장 가능하더라도 사용 gate는 closed |
| action authorization point | fetch 직전 FETCH, parser 직전 TRANSIENT_PARSE, DB/object write 직전 PERSIST_RAW/PERSIST_DERIVATIVE, response compose 직전 UI/API action, backup/restore/export/delete 경로의 각각 현재 effective decision을 확인 | 상위 단계 허용은 후속 단계 권한으로 상속하지 않음. 모든 결정 lookup은 같은 immutable snapshot/epoch에 결박하고 조회 불가 시 거부 |
| 파생물 lineage | derivative/quote/analysis/alert payload에 source scope, rights decision revision, transformation, output hash, purpose/channel, retention class를 연결 | 파생물이 원문 복제에 해당하는지 또는 source decision상 범위 밖인지 unresolved면 저장·노출 suppress하고 reviewer case 생성 |
| 철회·만료·정책 변경 전파 | 새 REVOKED/EXPIRED revision 또는 evidence/terms 변경 trigger를 받으면 신규 fetch·parse·write·serve를 먼저 막고 derivative, cache, search index, export, notification, backup을 inventory/reconciliation | 삭제 의무와 감사 최소정보 보존은 같다고 가정하지 않음. 보존/삭제 법무 판정이 미완료면 사용은 차단하고 데이터는 격리해 별도 decision 대기 |
| 결정 검토/감사 | 이전 revision을 보존하는 append-only change log, reviewer conflict/독립성, 적용 기간, 승인 evidence bundle hash, 영향을 받은 object/run/publication epoch를 추적 | 승인 이력 변경/근거 교체는 이전 pass/report를 stale 처리하고 새 revision·재평가 요구 |

결정 record 최소 필드는 `decisionId`, `revision`, `sourceProduct`, `sourceClass`, `endpointOrSurface`, `fieldScope`, `action`, `purpose`, `channel`, `retentionClass`, `policyEvidenceRefs`, `status`, `requiredControls/satisfiedControls`, `ownerRole`, stable `namedReviewer`, `decisionRef`, `effectiveFrom/effectiveUntil`, `reviewDue`, `affectedGates`, `previousRevision`, `decisionHash`다. `ALLOW_WITH_CONTROLS`는 요구 control 전부를 런타임 증거로 충족한 경우에만 해당 action을 열고, 누락 하나라도 있으면 닫는다. decision hash 및 서명 방식은 승인 전 설계 변수이며 checker pass는 권리 승인 효력이 없다.

Source rights 변경은 permission 새로고침만이 아니라 descendant 처리 case다. 먼저 신규 action과 public read를 suppress하고 기존 raw/derivative/backup/export/notification을 exact manifest로 열거한다. 후속 동작은 `DELETE`, `RESTRICT_ACCESS`, `TRANSFORM_TO_NONRETAINED`, `RETAIN_MINIMAL_AUDIT`, `LEGAL_HOLD`, `UNRESOLVED_REQUIRES_COUNSEL`처럼 item별 처분 결정으로 남기며, `REVOKED`만으로 즉시 영구 삭제 또는 무기한 보존을 추정하지 않는다. 각 대상의 보유 위치·복제본·retention clock·복구본 전파 가능성·삭제 receipt/예외 reason을 denominator에 포함한다. inventory가 불완전하면 권리 변경 reconciliation은 완료 상태가 될 수 없다.

##### Rights-remediation lifecycle 및 denominator 제안

Rights decision 상태(`REVOKED/EXPIRED/UNRESOLVED`)와 descendant remediation 상태는 분리한다. revision/약관/licence evidence change는 결정 scope fingerprint를 기준으로 영향 gate와 consumer dependency를 찾고, 이전 decision revision의 유효 범위를 재확인할 때까지 affected new action/public read를 suppress한다. stale decision을 최신처럼 재사용하지 않는다. **expected/discovered descendant set digest와 class×storage-location별 denominator**를 대조하며, 단순 row count equality만으로는 누락과 중복이 상쇄될 수 있으므로 canonical artifact identity 집합의 양방향 difference도 0이어야 한다.

| Remediation state | 판정 | 전이/공개 효과 |
|---|---|---|
| `DISCOVERY_INCOMPLETE` | 기대·발견 집합/hash/count가 다르거나 consumer reverse reference, export recipient, backup/restore 경로 중 하나라도 미확인 | source/remediation root `ACTIVE`; affected public read와 신규 use 차단; `unknown/partial`을 0 descendant로 바꾸지 않음 |
| `INVENTORY_COMPLETE` | canonical identity set 및 class×storage-location count/hash가 expected/discovered 양방향 일치 | inventory 범위의 발견 완료만 의미하며 rights decision이나 item disposition은 승인하지 않음 |
| `DISPOSITION_PENDING` | inventory는 완전하지만 한 개 이상 item이 법무/보안/운영 disposition 대기 | gate와 root suppression 유지; `UNRESOLVED_REQUIRES_COUNSEL`는 terminal disposition이 아님 |
| `ACTIONS_PENDING_VERIFICATION` | 승인된 item별 `DELETE/RESTRICT_ACCESS/TRANSFORM_TO_NONRETAINED/RETAIN_MINIMAL_AUDIT/LEGAL_HOLD` 작업을 시도했으나 receipt·replica·restore/serve 검증이 덜 됨 | 완료/삭제 주장을 하지 않으며 재시도와 독립 reconciliation 전 suppression 유지 |
| `RECONCILED` | 전체 descendant에 승인된 disposition과 유효한 evidence가 있고, 수행 결과·복제본·cache/index/export·provider·backup 및 restore 경로를 재검증해 잔여 미해결이 0 | scope 영향 review가 끝난 뒤 새 decision/publication revision에서만 gate 재평가 가능; 과거 epoch/history는 불변 |

따라서 inventory 완료와 remediation 완료를 분리한다. `RECONCILED`는 expected/discovered identity set/hash/count가 일치한다는 조건 외에 item disposition, action receipt 또는 이유가 있는 제한 예외, restore/재색인/재공개 점검까지 필요하다. 하나라도 미해결 descendant가 있으면 `RECONCILED` 금지다. 보존 의무·삭제 권리·제3자 푸시 회수 가능성은 자동 판정하지 않고 해당 item의 owner/legal disposition으로 남긴다.

##### Remediation revision, late descendant, 동시 finalization acceptance

Case state는 기존 row를 수정하지 않는 append-only revision으로 관리한다. 동일 `sourceScopeFingerprint`의 trigger·ingestion·finalizer는 scope watermark row를 먼저 잠그고, 대상 case를 stable ID 순서로 잠근 뒤 동일 transaction snapshot에서 current evidence revision, discovery watermark set, coverage/disposition pointer, 최신 COMPLETE impact proof, rights decision 및 publication epoch를 읽는다. 모든 writer는 이 lock order를 지킨다. 한 transaction이 여러 scope를 갱신하면 `(market, source, scope_key_hash)` 순으로 scope row를 모두 잠근 뒤 각 scope 안에서 stable case ID 순으로 잠근다. 이를 보장할 수 없는 광역 작업은 scope별 작업으로 나누되, 전체 영향 root suppression은 각 scope의 작업이 시작되기 전에 등록한다. scope epoch/finalization fence는 CAS로 단조 증가시키고 서로 다른 scope는 독립 진행 가능하다. 이는 제안된 직렬화 계약이며 구체 lock 구현과 격리수준은 DB adapter acceptance에서 검증한다.

`closureFingerprint`는 `(sourceScopeFingerprint, caseId/caseRevision, scopeEpoch, currentEvidenceRevision, discoveryWatermarkSetDigest, expected/discovered descendant set digest, class×location denominator, per-item disposition/action receipt digest, restoreVerification digest, latest COMPLETE impact run+attempt/projection/coverage/resolver digest, exact current rights decision ID/revision/hash, publication epoch)`의 canonical typed tuple에서 계산한다. `finalizationFence`와 비교되는 동일 fingerprint가 finalizer의 read-time과 commit-time 모두 current여야 한다. Finalizer는 모든 authoritative watermark/pointer를 같은 transaction에서 compare-and-set하고, 새 coverage assertion/consumer roots/case revision/final publication epoch를 일괄 commit한다. 입력 중 하나라도 달라지거나 CAS row count가 기대값과 다르면 전체 closure commit을 거부하고 suppression과 기존 accepted pointer를 보존한다. 같은 case revision/fingerprint의 재전송은 idempotent no-op이며 epoch를 재증가시키지 않는다.

Late descendant는 도착 시점에 따라 서로 다른 immutable case를 만든다. `INVENTORY_COMPLETE` 뒤 finalizer commit 전에 발견되면 source discovery watermark와 scope epoch를 먼저 전진시키고 기존 case closure fingerprint를 stale 처리한다. finalizer의 watermark/fence CAS가 실패해 `DISCOVERY_INCOMPLETE` 상태와 active root를 유지한다. 이미 `RECONCILED` case가 commit된 후 도착하면 과거 case를 다시 쓰지 않고 새 `remediationCaseId`와 `previousCaseId + previousCaseRevision` 연결을 가진 `POST_RECONCILIATION_DESCENDANT` case를 생성한다. 신규 case와 root suppression/epoch/outbox는 descendant ingestion commit과 원자적으로 생성하며, 재inventory 전 모든 영향 public descendant를 숨긴다. terms/evidence revision이 경합 중 바뀌어도 같은 방식으로 finalizer를 거부하고 새 evidence revision의 review를 요구한다.

| Acceptance | 주입 경쟁 | 필수 결과 |
|---|---|---|
| `RAD-19-CONCURRENT-RECONCILIATION-FINALIZERS-USE-CAS` | 동일 case revision/fingerprint를 가진 finalizer 2개가 동시에 commit 시도 | CAS 승자는 최대 1개; 나머지는 stale reject 또는 epoch를 바꾸지 않는 idempotent no-op; root는 winner commit 전까지 `ACTIVE` |
| `RAD-20-LATE-DESCENDANT-BEFORE-CLOSURE-INVALIDATES-INVENTORY` | `INVENTORY_COMPLETE` 뒤 finalizer commit 전에 discovery watermark/descendant set이 변경됨 | closure CAS 실패, `DISCOVERY_INCOMPLETE`, root `ACTIVE`, public read 차단 |
| `RAD-21-LATE-DESCENDANT-AFTER-RECONCILED-OPENS-LINKED-CASE` | 과거 case가 `RECONCILED`된 후 새 descendant가 발견됨 | 과거 case 불변; linked 새 case 및 root suppression/epoch를 ingestion과 원자 생성; 재inventory 전 공개 차단 |
| `RAD-22-TERMS-REVISION-DURING-FINALIZATION-FENCES-CLOSURE` | finalizer snapshot/commit 사이에 권리 근거 revision이 바뀜 | stale evidence CAS로 종료 거부, 기존 승인은 stale, suppression 유지 |

이 시나리오는 같은 scope 안의 event trigger dedup과 서로 다른 trigger root 보존 규칙을 대체하지 않는다. 모호한 적용범위, discovery watermark의 원천 completeness 미증명, case set 누락 또는 lock/fencing 지원 부재는 fail-closed이며, 이 합성 acceptance 통과만으로 실제 저장소에서 concurrency 안전성이 입증되지는 않는다.

합성 contract는 [`rights-action-decision.v0.json`](../fixtures/disclosure/rights-action-decision.v0.json)에 둔다. `RAD-01`–`RAD-22`는 API credential과 권한 분리, class/action/channel 비승계, 만료·철회, 통제 미충족, evidence 부재, 삭제 심의, 전역 승인 flag 금지, duplicate current scope 충돌, wildcard/불완전 scope 차단, terms revision fencing, descendant inventory/disposition/reconciliation 분리, coverage 완료와 rights remediation 완료의 분리, reconciliation 뒤 현재 read right 재검증, concurrent finalizer CAS, late descendant/evidence revision 재개 case를 다룬다. 실제 OpenDART/KIND 재배포 권한, retention 기간, deletion SLA, 허용 인용량은 `KR-DART-RIGHTS-01` 및 `KR-RETENTION-01`의 지정 책임자·법무 review 전부 `OPEN`; fixture는 정책 결론이 아니다.

#### 저장소 기준 endpoint/surface 분모 v2 — code/action inventory

아래는 권리 범위가 승인된 목록이 아니라, 현재 저장소에서 확인된 실제 사용 경로와 다음 조사 단위다. route/API가 존재하거나 provider가 해당 기능을 제공한다는 사실만으로 제품의 권리 범위를 결론 내리지 않는다.

세부 call graph와 action matrix는 [disclosure-rights-surface-inventory.v0.json](../fixtures/disclosure/disclosure-rights-surface-inventory.v0.json)에 machine-readable로 고정한다. 이는 lib/rss.ts, lib/dart-opendart-client.ts, lib/dart-automation.ts, lib/dart-automation-store.ts, lib/discord-dart.ts, lib/push.ts, lib/opendart.ts, lib/domestic-rss-sources.ts의 현재 호출·저장·노출 경로 조사물이다. surface별 권리 승인값은 전부 UNRESOLVED; fixture는 법률/계약 해석, 운영 DB, 배포 설정, 외부 consumer를 증명하지 않는다. 특히 RSS source, OpenDART API 상품, PC viewer link, ZIP 원문, 구조화 contract API, KIND RSS는 서로 권리를 상속하지 않는다.

| Surface ID | 저장소 사용 경로 | 공식 자료에서 확인한 제공 범위 | 다음 권리 검토 단위 / 상태 |
|---|---|---|---|
| `DART_LIST_AUTOMATION` | `lib/dart-opendart-client.ts` → `lib/dart-automation.ts` → 중복 상태·Push/Discord 알림. `list.json`은 접수일 당일을 조회하며 `last_reprt_at=N` 기본 흐름이다. | [공시검색 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001)는 JSON/XML endpoint, 요청 parameter, 최대 page_count 100, page/total fields, 회사·보고서·접수번호·제출인·접수일·`rm` 및 quota/error code를 명시한다. 목록 metadata 계약이며 원문 본문 endpoint가 아니다. | metadata fetch, alert에 필요한 최소 저장, Push/Discord derivative 표시를 각 action으로 분리. 안내 약관/계정 호출량은 정기 재검토 필요. 권리 판정 `UNRESOLVED`. |
| `DART_DOCUMENT_ZIP` | 신규 이벤트 설계가 참조하는 원문 확보 후보. 현재 자동화 client에 ZIP fetch/storage consumer는 발견되지 않았다. | [공시서류 원본파일 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003)는 `document.xml`과 `rcept_no`를 이용한 binary ZIP 응답 계약을 제공한다. 이는 원문 장기보존·압축물 내 첨부 재배포 허가의 증거가 아니다. | ZIP 다운로드, 임시 압축 해제, 본문/첨부 파싱, 원문 bytes 보존, hash/locator 보존, 백업을 각각 심사. 현재 실제 권리·retention 근거 `UNRESOLVED`; 본문 fetch는 별도 승인 전 보류. |
| `DART_CONTRACT_DETAIL` | `lib/opendart.ts`의 contract 상세 조회가 `list.json`과 `snglpnrsctrt.json`을 사용하며 `/api/dart/contract`가 노출한다. | [단일판매·공급계약체결 주요정보 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2020007)는 별도 구조화 API 제품이며 계약 원문/첨부와 같은 payload class로 합칠 수 없다. | 이 endpoint를 실제 호출하는 표면의 분석·cache·UI 응답 action과 공개 API 권한을 조사한다. 현재 route 응답의 최소 보존/공개 승인 `UNRESOLVED`. |
| `DART_DS005_STRUCTURED` | 코드의 현재 DS005 소비 여부는 이번 source scan만으로 확인되지 않았다. 설계의 date/event taxonomy candidate로 36개 API inventory를 관리한다. | [공식 DS005 목록](https://opendart.fss.or.kr/guide/main.do?apiGrpCd=DS005)는 주요사항보고서 주요정보 36종을 열거하고, 회사 제출 공시의 일부정보이며 정확성·완전성을 보장하지 않고 자세한 사항은 해당 보고서를 보도록 명시한다. [유상증자](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020023), [유무상증자](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020025), [합병](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020050)는 각기 다른 endpoint/필드를 정의한다. | 36종 각각 guide ID↔endpoint↔field 소비/미소비↔요청 식별 키↔권리 근거를 checker가 강제하는 현 inventory에 맞춘다. 기능 존재와 권리 승인, 현재 코드 사용 여부를 각각 구분. 각 row의 action 권리 `UNRESOLVED`. |
| `KIND_DISCLOSURE_SURFACES` | `lib/domestic-rss-sources.ts` 및 통합 RSS pipeline은 KIND 공개 RSS를 adapter로 소비한다. 설계가 제안하는 상세검색/상세 원문 fetch는 runtime 구현 여부를 별도 조사해야 한다. | [KIND 오늘의공시](https://kind.krx.co.kr/disclosure/todaydisclosure.do?method=searchTodayDisclosureMain)는 날짜/시장 조회, 전체·유가·코스닥·코넥스 등 필터와 RSS 진입점을 제공하는 웹 surface다. 화면 관찰은 machine API schema나 archive coverage 계약이 아니다. | RSS metadata 저장과 제목/요약/링크 노출, 상세 웹 링크, 세션/API 재사용, 자동화 호출을 분리 조사. 각 source component action별 권리 `UNRESOLVED`. |

이번 저장소 scan에서 OpenDART corpCode ZIP, 기업개황, DS005 36종, KIND 상세 page를 현재 제품 runtime이 호출한다고 입증하지 못한 항목은 “사용 중”이 아니라 `DESIGN_CANDIDATE`로 둔다. `DART_CONTRACT_DETAIL` 및 `DART_LIST_AUTOMATION`처럼 route/consumer가 있는 경우에는 목록 수집, 응답 cache, UI 공개, Push/Discord 전달을 별도 actor와 payload로 추적한다. endpoint 수만 세고 caller·저장·노출·backup action을 누락하는 권리 분모는 불완전하다.

#### P1 조사 순서와 보류 규칙

1. 현행 OpenDART 이용약관 원문과 revision/관측시각을 확보하고 제10조·제16조·정확성 책임 조항의 정확한 위치를 manifest에 등록한다. 이번 확인에서는 제10조 및 제16조와 제23조 요지를 확인했으나, 전체 권리 조항의 법무 판단은 하지 않았다.
2. 실제 사용 중인 OpenDART surface와 설계 후보를 분리한다. `list.json`, `document.xml`, contract detail, DS005 36종, corpCode ZIP/company profile의 caller·저장소·cache·UI/외부 전송·backup을 source scan으로 확인한 뒤 endpoint·요청 범위·반환 필드·오류/빈 응답을 공식 가이드와 대조한다. 구조화 API 값과 원문/첨부의 권리 범위가 동일하다고 가정하지 않는다.
3. KRX KIND 오늘의공시 목록, RSS, 상세검색 및 공시 상세 링크를 별도 surface로 등록한다. 현재 공식 웹 페이지에서 시장·공시·RSS 진입점은 관찰했지만, 그 자체는 안정된 machine API 계약이나 원문/파생물 재배포 승인 증거가 아니다.
4. 공공데이터포털 데이터 상품 설명·이용허락 표시가 있으면 정확한 상품 식별자, 라이선스 버전, 적용 필드/파일 범위를 확인해 별도 증거로 둔다. 해당 표기가 OpenDART 원문 ZIP/첨부 전체까지 적용된다고 추론하지 않는다.
5. 수집 경로별 필요한 action을 행렬에 대조하고, 공식 자료가 불명확하거나 충돌하면 `UNRESOLVED`로 남겨 해당 action을 차단한다. owner/reviewer 승인, 유효기간, 재검토 조건과 수용 evidence가 모두 있어야 `KR-DART-RIGHTS-01`을 `APPROVED`로 전이할 수 있다.

현재 확인한 공식 근거는 권리 승인 결론이 아니다. 이번 회차에서 manifest를 채우기 위해 서비스 호출을 늘리거나 실제 원문을 장기 저장하지 않았고, 운영 권리/계정/배포 설정도 변경하지 않았다. P1은 `BLOCKED_BY_DECISION: KR-DART-RIGHTS-01` 상태를 유지한다.

2026-11-04 공식 페이지 관측은 [`opendart-official-evidence.v0.json`](../fixtures/disclosure/opendart-official-evidence.v0.json)에 고정했다. [OpenDART 이용약관](https://opendart.fss.or.kr/intro/terms.do)의 제10조는 호출 허용량 제한·변경 고지를, 제16조는 OpenAPI 서비스/관련 프로그램 저작권 및 미명시 저작권의 법령 준칙을, 제23조는 제출인 책임과 정확성·완전성 비보장을 적는다. [공시검색 guide](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001)는 `list.json`/`list.xml`, 필드·페이지 크기와 `last_reprt_at=N`의 정정보고서 포함 동작을 설명한다. [OpenAPI 소개](https://opendart.fss.or.kr/intro/main.do)는 XML 원문 활용과 구조화 정보 제공을 안내한다. 이 자료는 interface와 약관 문구의 관측 증거이며 source/product/field/action별 persist·quote·UI·API·Push/Discord·backup 권리 판정이 아니다. Fixture checker는 해당 경계와 `UNRESOLVED` 상태를 고정한다.

## 범위와 비목표

### 포함

- DART/KIND 공식 공시 발견, 원문 보존, 수정·철회·대체 제출 추적
- 공식 활성 국내 `COMMON_STOCK` 마스터와 공시 회사·종목 연결
- 공시 분석과 원문 근거·분석 버전 관리
- 공시에서 유래한 일정의 날짜·시각·상태·확정성 및 변경 이력
- 관리·검토 문서, 운영 저장소, 읽기 API, UI, 배치/재처리 경계
- 오류 격리, 재시도, 감사, 개인정보·비밀정보 및 데이터 보존 정책

### 제외

- 이번 단계의 실제 코드·DB migration·API·UI·cron 구현
- 공시 문구만으로 자동 매매·호재 알림을 확정하는 규칙
- RSS/언론 기사만으로 공식 공시 사실 또는 일정을 확정하는 처리
- 사용자 임의 입력 이벤트를 공식 공시 이벤트처럼 취급하는 처리
- 종목명 추측으로 보통주를 판별하는 fallback

## 변경 영향 경계

이 설계의 변경은 신규 KR 이벤트 원장 제안에 한정한다. 기존 공개 route, legacy importer, JSON 원본과 US consumers는 별도 계약으로 보호한다. repository 작업 전 `git status`와 staged diff를 검사하고 기존 사용자 변경 파일을 수정하지 않는다. 문서 checker나 catalog가 만드는 산출물도 이 작업의 명시 변경 목록과 대조한다. 사용자 요구 없이 기능·데이터·route를 수정하지 않는다.

## 현재 저장소에서 확인된 사실과 구조 충돌

| 확인 대상 | 현재 상태 | 설계 영향 |
|---|---|---|
| DART 자동화 | `lib/dart-opendart-client.ts`는 당일 `total_page`까지 검색한다. `lib/dart-automation-mapper.ts`는 보고서 제목 점수로 호재 후보만 고르고 `lib/dart-automation.ts`가 Push/Discord를 발송한다. `rm`/`stock_code` 기반 보통주 master 판정·원문 XML 저장/분석은 이 경로에 없음 | 알림 후보 결과를 공시 원장 입력으로 재사용 금지. 신규 수집은 모든 원천 row를 webhook 설정과 독립적으로 저장한다. DART key 미설정은 `SKIPPED_CREDENTIALS`로 기록하고 성공/빈 결과로 가장하지 않음 |
| OpenDART pagination consistency | `lib/dart-opendart-client.ts`는 `total_page`까지 순회하고 `rcept_no`가 있는 행만 Map에 넣는다. 응답의 `page_no`/`page_count` 대조, list 배열/각 receipt 유효성, 페이지별 누계 대 `total_count` 확인은 없다. 페이지 간 수집 snapshot/cursor도 없다 | 해당 경로의 “전 페이지 순회”는 원천 snapshot completeness 증거가 아니다. 신규 ledger는 요청/응답 페이지 메타데이터·모든 row·정확한 누계 검증을 갖추고 non-snapshot pagination의 coverage 등급을 별도로 표기한다 |
| 제출자·사건 당사자 분리 | DART 목록의 회사 코드/종목코드는 제출 회사 식별에만 사용한다. 2026-10-30 한진칼 정정 제출(접수 `20261030801389`) 본문은 “자회사인 (주)대한항공의 주요경영사항”과 대한항공씨앤디서비스 차입금 자금보충약정을 설명 | 목록상의 제출자/코드, filing party와 event revision별 party 역할, 직접 영향을 받는 상장 instrument를 분리한다. 단순 제출자 코드 일치만으로 event 대상·영향 종목을 확정하지 않는다 |
| 기존 공시 요약 저장 | `filings`는 source/external_id/company/title/judgment/summary/published_at 중심이며 DART `corp_code`, `stock_code`, `rcept_dt`, 문서 revision, 보통주 FK가 없음. 다만 OpenDART 목록 row는 `corp_code`, 상장사 `stock_code`, `rcept_dt`, `rm`을 제공한다. `lib/dart-automation-mapper.ts`는 `receiptDate`에 `rcept_dt`를 두지만 alert의 `publishedAt`에는 `detectedAt`을 기록함 | `corp_code → stock_code → KIS 공식 universe`는 제출자 entity 확인에만 사용하고 event-party/subject 종목은 별도 근거를 요구한다. 기존 `published_at`은 공식 접수시각으로 재해석하지 않는다 |
| 국내 공시 조회 | `/api/dart`, `/api/dart/history`, `/api/disclosures`, `/disclosures` 존재 | 공시 탐색과 이벤트 캘린더는 별도 사용자 계약으로 정의해야 함 |
| 공시 이벤트 기록 | `data/market-impact-events.json`에 `markets.KR`가 있으며 `scripts/import-market-impact-events.mjs`가 공식 활성 `COMMON_STOCK` universe를 조회 | 현재 import JSON과 DB 간 동시 수정·stale overwrite·삭제 정책이 단일 원본을 보장하지 않음 |
| DB 이벤트 모델 | `V163__market_impact_events.sql`은 event 사실·분석·evidence를 행 하나의 JSON 필드로 저장 | 일정 여러 개, 별도 일정 상태 변경, 문서 버전, 분석 버전 이력을 관계형으로 추적하기 어려움 |
| 배포/동기화 경로 | `.github/workflows/deploy-oci.yml`은 standalone 앱, cron 스크립트, migration SQL을 패키징하지만 `data/market-impact-events.json`과 `scripts/import-market-impact-events.mjs`를 명시적으로 복사·실행하지 않음. Netlify `sync-filings`는 기존 알림용 `runFilingSync()`만 호출 | 앱 배포 성공을 이벤트 projection 적재 성공으로 간주하지 않는다. 설계 승인 전 importer의 배포 방식, 주체, 재시도/재조정 경로를 정해야 하며 수동 적용도 동일 checkpoint 규약을 따라야 함 |
| 공식 원문 조회 표본 | OpenDART `list.json`에서 2026-10-01~31 목록 13,694건/137페이지 응답 및 정정·배당·주총·계약 등 메타데이터를 읽었다. 목록에 존재한 여러 접수번호의 `document.xml` 요청은 HTTP 302로 `error1.html`에 이동해 해당 세션에서 전문을 취득하지 못함 | 목록 응답과 본문 취득 성공을 분리한다. redirect/error HTML을 문서 revision이나 빈 정상 본문으로 저장하지 않고 `UNAVAILABLE` + HTTP status/location/fetchedAt 진단을 남긴다. 정정 전후 값·날짜 의미는 이 표본에서 미검증 |
| DART 공식 뷰어 관찰 메모 | 이전 수동 열람 메모에 위 4건의 값 관찰이 있으나, 이를 재현할 viewer locator·문서 hash·권리 snapshot·정확한 원문 위치가 이 설계 산출물에 없다. OpenDART `document.xml` 요청은 오류 redirect였고 DART `main.do?rcpNo=` HEAD는 302 shell 진입만 확인됨 | 과거 관찰은 분석 가설/금지 추론을 만드는 데만 쓰고 source-backed fixture, parser golden test, 정정 relation, taxonomy 승인 근거로 취급하지 않는다. viewer shell은 document key만 반환한다고 공식 계약이 보장되지 않으므로 metadata API로 전제하지 않는다. 본문 fetch/브라우저 렌더 호출이 필요한 locator 취득은 권리와 범위를 승인하고 명시적 fetch contract를 확인하기 전 중단한다 |
| 일반 투자 캘린더 | `V130`/`V151`의 `investment_calendar_events`는 시장·코드·날짜·source와 raw payload 중심이며 과거 캘린더 런타임은 폐기된 것으로 문서화 | 이 테이블을 새 공시 이벤트의 무검토 재사용 기반으로 삼지 않음 |
| 종목 분류 기준 | 국내 주식 이벤트는 공식 마스터 활성 `COMMON_STOCK` exact match와 KRW 30bn 초과 cap eligibility를 각각 검증. 분류/신선도/통화 미확인은 fail-closed | instrument type와 cap floor를 별도 immutable assertion으로 남기고 source metadata/evidence archive와 event exposure를 분리 |
| 공식 종목 이력 | `V65` sync run은 집계치·source directory만 보존하고, `V85`는 보통주/기타상품 테이블을 분리해 별도 identity sequence를 둔다. `lib/instrument-universe-import.ts`는 upsert 때 현재 `raw_payload`를 갱신한다 | 현재 universe row `id`만으로 장기 instrument identity나 과거 분류 근거를 보장할 수 없다 |
| 로컬 Flyway/운영 스키마 감사 | 2026-11-01 localhost read-only audit: applied V161 (104 applied), source V163 (163 scripts), pending 59, failed 0, drift true. V85/V89 source는 physical table이 아닌 view여서 precondition 실패; candle DELETE 및 universe DROP/RENAME 계획. 운영 필수 객체 2 tables + 1 column 누락. DDL inventory 423 objects 중 263 match/160 mismatch로 나왔고 도구가 checksum/full definition/valid index/data operation은 검증하지 않는다고 명시 | 이벤트 관련 migration/importer/기존 projection 검증은 사전 차단. V163 또는 신규 migration을 정상 적용으로 가정하지 않고, DB 복구 계획·snapshot·row-level 영향 검토·복원 리허설 전 migration/import 금지. 수치는 이 localhost 감사 snapshot에만 적용 |

위 표는 코드·문서에서 확인한 현황이다. 제안 모델은 신규 설계이며 현재 구현 사실로 오인하지 않는다.

### 기존 route/import 경계 및 cutover 분류

| 기존 surface | 코드에서 확인된 동작 | 설계 전환 분류 | 선행 승인/수용 기준 |
|---|---|---|---|
| `GET /api/public/market-impact-events` | public GET이 `market_impact_events` 전체를 query filter/limit로 읽어 `market-impact-events.v1`을 반환한다. SQL에는 KR 공개 gate, `COMMON_STOCK` 검증, 권리/freshness/cursor snapshot 검증이 없다. | `LEGACY_COMPATIBILITY`; 기존 계약을 이번 설계 문서 작업에서 변경하지 않음. KR 새 원장의 publication path로 간주 금지 | `KR-LEGACY-CUTOVER-01`, API inventory 및 US/KR consumer 분리 review. 향후 route 유지/제한/폐기는 명시 decision과 별도 검증 필요 |
| `scripts/import-market-impact-events.mjs` | 하나의 KR/US 혼합 JSON을 읽고 두 universe를 확인한 뒤 transaction에서 전체를 upsert한다. `--dry-run`은 planned row diff가 아니며 삭제/tombstone, SHA ancestry, revision/checkpoint CAS가 없다. | `LEGACY_IMPORTER_BLOCKED_FOR_KR_V2`; 새 KR canonical ledger/projection에 재사용 금지 | immutable input manifest, 전체 denominator, canonicalization/hash parity, US 행 비변경 증거, 승인된 새 단일 writer·rollback rehearsal |
| `data/market-impact-events.json` | 현재 저장소의 v1 입력이며 KR/US 배열을 함께 담는다. | `UNAPPROVED_LEGACY_INPUT`; 변경/재정렬/삭제/승인된 원본으로 간주 금지 | protected mainline source commit/blob hash 및 market별 owner decision 전 source-of-truth로 승격 금지 |
| `investment_calendar_events` | V130/V151에 일반 투자 일정용 별도 legacy table 계약이 있다. 새 KR event API의 source/gate 연결은 코드 inventory에서 확인되지 않았다. | `LEGACY_UNMAPPED`; 신규 KR publication과 혼합 금지 | relation/consumer inventory, row denominator 및 별도 mapping/quarantine decision |

#### Repository-bounded event path audit v1

아래 항목은 현재 checkout에서 지정한 application/runtime·route·migration source를 정적으로 대조한 결과이며, DB catalog·동적 SQL·배포된 artifact·외부 caller까지 닫힌 전수 inventory라고 주장하지 않는다. 경로 동작이 달라지거나 새 surface가 생기면 checker가 의도적으로 실패하도록 한다.

| surfaceId | 확인 경로 및 code fact | writer-domain relation | 현재 disposition |
|---|---|---|---|
| `LEGACY_SHARED_EVENT_WRITER` | `scripts/import-market-impact-events.mjs`는 KR/US 입력 모두 `market_impact_events`에 transaction upsert하고 기존 eventId conflict에서 event/summary/evidence를 덮어쓴다. `V163`은 market enum만 KR/US로 허용하며 revision/checkpoint/approval/epoch를 소유하지 않는다. | 여섯 v2 mutation domain 중 어느 writer로도 승인되지 않음; 레거시 혼합 writer | `LEGACY_IMPORTER_BLOCKED_FOR_KR_V2`; 운영 적용 writer로 연결·재사용 금지 |
| `LEGACY_PUBLIC_EVENT_READ` | `app/api/public/market-impact-events/route.ts`는 같은 legacy table을 조회하고 optional market/ticker filter만 적용한다. 현재 SQL에는 active `COMMON_STOCK`, rights, source freshness, approval/epoch gate가 없다. | 여섯 v2 domain gate를 수행하지 않는 legacy reader | `LEGACY_COMPATIBILITY`; 새 KR 원장 경로로 취급 금지. 별도 승인 없이 route 의미 변경 금지 |
| `DART_ALERT_SCHEDULE` | Netlify 매분 함수와 보호된 `/api/cron/sync-filings`가 `runFilingSync`를 호출하고, 이는 `runDartAutomation`→OpenDART 발견→`dart_automation_events` 중복/재시도 상태→Push/Discord alert 경로다. 이 경로는 canonical disclosure event/date/review/publication projection을 쓰지 않는다. | source discovery/alert 운영; `RIGHTS_SOURCE_DISPOSITION` 또는 event writer 승인으로 간주 금지 | 기존 자동화 소유권 유지; 새 event 수집/분석 coverage 증거로 재사용 금지 |
| `LEGACY_CALENDAR_SCHEMA_ONLY` | V130/V151은 `investment_calendar_events`를 정의한다. 지정 runtime source 경로에서 이 식별자를 참조하는 direct consumer/writer는 발견되지 않았다. 이는 문자열 검색 결과일 뿐 dynamic SQL·DB object·외부 consumer의 부재 증명이 아니다. | v2 writer-domain 연결 없음 | `LEGACY_UNMAPPED`; 전환 전 catalog/owner/row denominator reconciliation 필요 |
| `KR_V2_CANONICAL_SURFACE_ABSENT` | 현재 application route와 migration inventory에 신규 KR canonical event/date/review/publication runtime surface가 없다. 이 문서의 `disclosure_*` schema는 설계 제안이다. | 여섯 domain은 구현 writer가 아니라 향후 요구계약 | 실제 feature 구현은 이번 설계 작업 범위 밖이며 해당 승인 전 비활성 |
| `REPOSITORY_EXTERNAL_SURFACE_UNKNOWN` | DB console/trigger/function, 동적 SQL, deployed package/workflow variation, external OpenAPI consumer는 저장소 grep만으로 판정 불가하다. | 분류 전에는 어떤 domain writer도 인정하지 않음 | `UNKNOWN_EXTERNAL`; owner/catalog evidence와 source-hash/denominator reconciliation이 cutover 선행 조건 |

이 audit는 확인한 checkout의 소스 경계만 좁혀 준다. “새 KR writer 없음”을 운영 DB나 모든 deployment에서의 부재 주장으로 승격하지 않는다. legacy importer의 명시적 차단은 설계 문서상의 migration gate이며 현재 스크립트 자체에 runtime kill switch가 있다는 뜻도 아니다.

`LEGACY_COMPATIBILITY`는 legacy route가 안전하거나 신규 설계 요건을 만족한다는 뜻이 아니다. 반대로 새 KR route를 만들 때 legacy endpoint를 조용히 바꾸어 기존 US/KR consumer 의미를 바꾸지 않는다는 경계 표식이다. API unauthenticated GET 규칙상 기존 공개 endpoint의 인증을 임의 추가하지 않는다. legacy route에서 노출되는 기존 데이터의 별도 보안/권리 검토는 기존 서비스 owner가 독립 수행해야 하고, 결과가 신규 KR 원장 승인 증거로 대체되지 않는다.

### 현재 공개·import surface 매핑의 검증 한계

위 코드는 확인한 route, SQL, importer entry point만 inventory한다. 전체 consumer closure를 증명하지 않는다. 신규 KR writer를 승인하기 전 `scripts/api-surface.mjs`, route inventory, `rg` 기반 SQL/table consumer scan 외에도 package scripts, cron/Netlify functions, deploy workflow, ORM/repository dynamic SQL, admin tools, SQL views/functions/triggers, materialized views, database grants, CDN/cache 설정, 외부 OpenAPI consumer를 대상으로 read-only inventory를 만들고 source revision/hash 및 denominator를 고정해야 한다. 동적 SQL·DB console 작성·외부 client는 저장소 검색으로 증명할 수 없으므로 DB catalog와 owner inventory의 reconciliation이 별도 필요하다.

모든 발견 surface는 `(surface_id, surface_kind, market_scope, read_write, auth_class, data_source, schema_version, owner, deployment_unit, discovered_at, source_hash, disposition, evidence_ref)`로 기록한다. `UNCLASSIFIED`가 0이고, discovered rows와 accepted disposition rows의 수와 canonical set hash가 같아야 inventory complete다. `KR_LEGACY_READ`, `US_LEGACY_READ`, `LEGACY_WRITE`, `NEW_KR_READ`, `NEW_KR_WRITE`, `CROSS_MARKET_SHARED`, `UNKNOWN_EXTERNAL`을 명시 분류한다. dynamic/unknown consumer는 완료로 추정하지 않고 해당 data scope cutover를 막는다.

KR cutover 전에 old writer를 fence하고 한 시점에 승인된 단일 writer만 허용한다. 모든 old revision은 transaction 안에서 수용/격리·revision/hash를 결정하며 unknown/stale source commit은 batch 전체를 거부한다. Read switch는 consumer가 pin한 projection generation과 API schema compatibility 확인 후에만 CAS로 전진한다. rollback은 old writer 재활성이 아니라 승인된 immutable prior snapshot을 read pointer에 돌리는 것이다. 분모/hash, owner, old writer fence, cache purge/outbox, read/write smoke, DB grants 및 rollback 증거가 없으면 switch를 시작할 수 없다. 이 inventory와 proof set은 기능 구현 전 사전 수용물이며 현재 조사만으로 complete를 주장하지 않는다.

## 핵심 개념과 권위 경계

단일 테이블에 공시, 문서, 분석, 일정 모두를 넣지 않는다. 다음 엔터티는 각각 독립 생명주기를 갖는다.

1. **DisclosureEntity**: DART `corp_code`가 식별하는 보고 법인·자회사·계약당사자 등 법적 실체. DART 제출자와 거래 종목을 구분하며, 상장 여부와 관계없이 법인 identity를 기록한다.
2. **FilingParty**: filing 본문에서 제출자 외 계약 당사자·자회사·대상회사·보증/지원 제공자 등으로 명시된 법인 역할. `disclosure_entities` FK로 resolve하거나, 불명확하면 원문 name span과 역할만 `UNRESOLVED`로 저장하고 제출자/종목 identity에 합치지 않는다.
3. **Instrument**: 시장/코드 재사용·재분류에도 유지되는 내부 종목 identity. 거래소/시장/코드와 상품분류는 유효기간을 가진 별도 식별자·분류 assertion이다. 기존 common/special universe의 row `id`를 장기 identity로 가정하지 않는다.
4. **Filing**: DART 접수번호(`rcept_no`) 또는 KIND 공식 공시 식별자로 식별하는 제출 행위. 제출 유효상태는 사건 상태와 분리한다. 정정/철회/첨부 교체 제출은 별도 filing으로 보존하고, 공급자 표식 및 본문 근거를 가진 filing relation으로 연결한다.
5. **Document**: filing에 포함된 원문 문서/첨부. 원문 URL이나 ZIP/XML 문서 식별자를 기록한다.
6. **DocumentRevision**: 취득한 원문 바이트의 불변 스냅샷. 해시, MIME, byte length, 취득 시각, 원천 문서 식별자를 기록한다. parser/extractor 버전과 처리 결과는 여기에 넣지 않는다. 재수집 결과가 달라져도 이전 revision을 덮어쓰지 않는다.
7. **EntityInstrumentLink**: 법인과 내부 instrument identity의 관계 및 유효기간. DART 제출자 목록 코드와 KIS official master crosswalk는 제출자 entity의 종목 식별에만 사용한다. 자회사·관계사 이벤트를 모회사에 자동 귀속하지 않는다.
8. **InstrumentMasterSnapshot/EligibilityAssertion**: KIS import run, 공식 파일명/해시, 해당 행 원문/해시, 분류 규칙 버전, 시장·코드·type·enabled·관측시각을 보존한다. 이벤트 승인 당시 적격 판정은 이후 master 갱신으로 덮지 않는다.
9. **AnalysisRevision**: 특정 filing/document revision set에 대한 Codex 분석 산출물. 모델/프롬프트 식별자, 생성시각, 입력 해시, 스키마 버전, 근거 claim, 한계, 검토 상태를 불변 기록한다.
10. **Event**: 원문이 설명하는 경제적/법적 사건의 지속 ID. 정정으로 날짜·조건이 바뀌어도 같은 사건이면 event identity를 유지하며, 별개 의사결정/촉매면 별도 ID를 부여한다.
11. **EventRevision**: 사건의 최신 해석·상태를 구성하는 버전. 이벤트 자체의 근거 filing과 분석 revision을 참조한다.
12. **EventRevisionParty**: filing party identity를 사건별 역할로 연결하는 event revision scoped 관계. 한 filing의 다수 event가 같은 entity를 서로 다른 역할로 참조할 수 있다. 원문 근거와 검토 상태를 기록한다.
13. **EventSubjectInstrument**: event revision이 실제로 영향을 주는 종목과 역할, 사건별 party/직접 근거, 적격성 assertion을 연결한다. filing submitter/party를 모든 사건의 영향 종목으로 간주하지 않는다.
14. **EventDateAssertion**: 날짜/시각 주장. 날짜 종류, 값 또는 정밀도, 원천, 상태, 관측·확인 시각을 저장한다. 공시일·결의일·예정일·납입일·효력일·거래개시일을 하나의 `eventDate`로 합치지 않는다.
15. **EventRelation**: 정정, 취소, 연기, 완료, 선행조건, 후속 공시, 동일 사건 중복 등 사건 간 관계. 관계 유형과 근거를 필수로 둔다.
16. **ReviewDecision/Audit**: 사람의 보류·승인·반려 및 운영자 변경을 actor·시각·사유와 함께 추가 기록한다.
17. **ParseAttempt**: 특정 `DocumentRevision`에 대해 특정 parser/extractor와 policy로 수행한 불변 처리 시도. 버전, input revision/hash, 시작·종료시각, 상태, 산출물 hash 또는 non-retention 사유, sanitized failure class를 보존한다. 재시도/새 parser는 새 attempt이며 과거 결과를 덮지 않는다.

#### 종목 identity와 시점별 코드·분류 crosswalk — ITC-01–ITC-37

현재 저장소의 공시 설계는 legal entity, 내부 `instrumentId`, market/code alias, `InstrumentMasterSnapshot` 및 `EligibilityAssertion`을 구분한다. 이번 보강은 그 경계에 과거 시점 조회 acceptance를 추가한다. [OpenDART 공시검색 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001)는 `corp_code`를 8자리 고유번호, `stock_code`를 상장회사의 6자리 종목코드로 각각 정의하고 제출인명(`flr_nm`)도 별도 필드로 둔다. [OpenDART 고유번호 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DE001&apiId=AE00004)는 고유번호 파일에 최신 변경일(`modify_date`)을 제공한다. 이 필드는 과거 기간별 종목 master history를 제공한다는 계약이 아니므로, 최신 행/최신 변경일만으로 과거 이벤트일의 코드·security class·active 상태를 역산하지 않는다.

`Instrument`는 거래 가능한 특정 security class의 내부 stable identity다. entity는 발행 법인의 identity고 market/code는 기간이 있는 alias이며 active/common-stock/cap/freshness는 시점별 eligibility assertion이다. alias row는 `validFrom/validUntil`(업무상 효력 구간)과 `observedAt`(우리 시스템이 알게 된 시각), `masterSnapshotId/masterContentHash`, 공식 source evidence, market/code/security class, 관계 유형, reviewer state를 보존한다. 아직 효력이 오지 않은 변경 공지의 `observedAt`과 `validFrom`을 합치지 않는다. 동시 snapshot 기준을 맞출 수 없거나 공식 효력일이 불명확하면 그 event subject의 historical eligibility를 `UNRESOLVED`로 남긴다.

코드 재사용은 alias 변경이지 instrument 연속성이 아니다. 회사명 변경만으로 identity를 합치지 않고, 같은 법인이라도 보통주/우선주/DR 또는 다른 증권 class는 별도 instrument다. 합병·분할·포괄적 주식교환·신주상장 등은 `REPLACED_BY/MERGED_INTO/SPLIT_INTO` 같은 명시 relation과 공식 효력 근거를 요구하며 predecessor의 event·review·eligibility를 successor로 자동 이전하지 않는다. 액면분할/병합의 가격 조정 연속성은 instrument identity 관계를 자동 증명하지 않는다. 동일 시장·코드 alias의 유효기간이 겹치거나 서로 다른 snapshot이 충돌하면 관련 subject만 quarantine/suppress하고 event 내 무관한 subject는 독립 평가한다.

공시 당시 영향 종목 연결은 event effective time에 맞는 alias·security class·공식 master·cap 관측을 같은 eligibility decision에 pin한다. 현재 watchlist의 successor instrument가 predecessor event와 다르면 승인된 successor relation 없이 direct match나 맞춤 알림을 만들지 않는다. historical alias를 증명할 권위 source/version/effective date가 확보되지 않으면 현재 ticker로 대체하지 않고 P2를 미해결로 둔다. [`instrument-identity-temporal-crosswalk.v0.json`](../fixtures/disclosure/instrument-identity-temporal-crosswalk.v0.json)의 ITC-01–ITC-37은 이 조건의 합성 acceptance이며 현재 KIS/DART master의 과거 완전성을 입증하지 않는다. ITC-31–ITC-37은 owner package의 정책 범위 결정과 assertion별 review, evidence readiness, expiry 및 UI action 분리를 확인한다. 후보의 필드별 packet 구성·conflict 검토·assertion 승격 상태·정정 후 dependency 재검토 절차는 [종목 universe 운영 설계](./instrument-universe-sync.md#124-crosswalk-후보-검토와-assertion-승격-절차-제안)의 제안 workflow를 소비하며, 실제 owner/rights/retention approval이나 runtime을 증명하지 않는다. ITC-19–ITC-37은 발견 후보와 승인 eligibility의 분리, 필드별 증거 completeness, 독립 review, alias 충돌의 국소 격리, append-only correction, rights 만료 시 action 차단, self-approval 차단, 권한 폐기·scope 검증, packet 변경 후 재검토, CAS 및 read-only auditor 경계를 검사한다.

공식 source는 필드별 권한을 갖는다. KIS 종목정보 파일은 프로젝트 거래지원 universe의 현재 관측, OpenDART `corp_code`/SEC CIK는 filer/entity identity 후보, 해당 거래소의 종목별 공지/상장 record는 listing effective status, rights-approved market-data source는 가격 venue/시각 근거로 분리한다. KRX Data Marketplace의 [신규상장 현황](https://data.krx.co.kr/contents/MDC/STAT/issue/MDCSTAT200.jsp)은 화면 설명상 최근 10년 자료이며 SPAC 합병 상장과 이전상장이 제외될 수 있다. [상장폐지 현황](https://data.krx.co.kr/contents/MDC/STAT/issue/MDCSTAT238.jsp)은 별도 목록이고 마지막 매매일 기준 설명을 둔다. 따라서 한 화면의 빈 결과는 전체 기간에 listing이 없었다는 증거가 아니다. SEC는 [CIK/ticker/exchange 연결 파일](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data)의 정확성·범위를 보장하지 않는다고 밝히며, [submissions API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)는 current/former name 및 ticker/exchange metadata이지 complete security-level historical listing ledger 계약이 아니다. OpenDART `modify_date` 역시 기업개황 최종 변경일이므로 security alias의 효력일로 대입하지 않는다. 원천별 조회 범위·행 분모·effective/observed 시각·hash·rights 상태가 갖춰지지 않으면 absence/continuity 및 전체 coverage 주장을 금지한다. 이 field 역할은 fixture의 `officialSourceRoles`, evidence envelope은 `requiredEvidenceEnvelopeFields`로 기계 점검하며 ITC-13`–`ITC-18은 해당 원천 경계의 synthetic acceptance다. field별 책임과 제안 evidence envelope은 [종목 universe 공식 원천 비교](./instrument-universe-sync.md#122-공식-원천별-증거-책임과-coverage-경계)에 둔다.

### 권위 데이터 원칙

- 공식 원문은 사실의 권위 출처다. 정규화 값·분석 결과·캘린더 표시는 파생 데이터이며 원문을 대체하지 않는다.
- 기존 공시 이벤트 관리 계약은 Git의 `data/market-impact-events.json`을 KR/US 혼합 입력으로 사용하지만, 해당 파일이 mainline에서 추적·승인되기 전까지 canonical source로 간주하지 않는다. 향후 각 시장의 관리 원본, 승인 workflow, DB projection은 명시적 cutover 결정으로 고정한다. DB event/analysis 행을 수기로 수정하지 않는다.
- Filing/document 메타데이터와 fetch 상태는 ingestion evidence catalog다. 공식 원문 자체의 권위는 DART/KIND에 있고, 허용된 로컬 원문 copy는 immutable hash-addressed cache다. 저장 정책상 본문을 보관하지 못하면 source URL/hash/locator만 남긴다. 문서 캐시에만 있는 분석 결과는 승인 event record로 노출하지 않는다.
- 원본 JSON 변경은 `schemaVersion`, 안정 `eventId`, 단조 증가 `eventRevision`, 이전 revision hash, source filing/document hash, analysis schema/prompt version, change reason, reviewer/review status, content hash를 가져야 한다. 현재 v1 필드는 하위호환 입력으로만 인정하고 신규 revision 전환 전 migration mapping을 정의한다. 각 변경은 파일 diff와 commit SHA로 추적되며 database row는 그 commit을 가리킨다.
- 현재 파일은 단일 `market-impact-events.v1` envelope의 `markets.KR[]` / `markets.US[]` 배열이며 importer는 active common-stock 확인 뒤 `ON CONFLICT(event_id) DO UPDATE`로 1행 projection을 덮어쓴다. 이는 v2 revision ledger가 아니다. 기존 US v1 계약은 현재 별도 호환 경계로 취급한다. 해당 JSON은 현재 worktree에서 untracked이므로 승인된 mainline 원장이 아니다.
- KR/US 혼합 파일·공유 importer·공유 projection은 전환 경계로만 취급한다. 향후 KR canonical source는 별도 버전 경로의 국내 전용 ledger로 분리하고, KR 전용 importer/API projection은 그 ledger만 읽는다. 기존 혼합 v1 파일과 기존 US consumer/import 의미는 US 전용 검토·회귀 검증·별도 배포 승인 전 보존한다. KR cutover가 US row를 재정렬·수정·삭제하거나 US API 응답을 바꾸면 안 된다. 동시 dual-write, 두 원장 간 자동 동기화, 파일 합치기를 허용하지 않는다. 전환 제어는 `PRECHECK → FROZEN_SNAPSHOT → MAPPED → DRY_RUN_PASSED → SHADOW_RECONCILED → CANARY_APPROVED → KR_READ_SWITCHED → ROLLBACK_WINDOW_CLOSED`의 append-only 상태 ledger로 관리하고 단계별 source commit/blob hash, row denominator, manifest hash, validator/resolver version, actor/approval, timestamp 및 rollback pointer를 남긴다. 각 단계는 조건부 원자 CAS로만 전진하며 임의 단계 건너뛰기·기존 결정 덮어쓰기·완료 상태 수동 지정은 금지한다.
- 신규 국내 공개 GET은 별도 KR route/schema로 정의하고 인증 없는 read-only 계약을 따른다. 기존 shared public API는 legacy compatibility route로 남기며 국내 새 ledger를 암묵적으로 읽거나 response schema를 조용히 바꾸지 않는다. public projection은 승인된 KR ledger revision과 동일한 source hash/checkpoint를 표시한다.
- KR legacy mapping은 별도 `legacy_event_mapping_manifest`로 `oldEventId`, source tuple, source commit/blob hash, ticker→stable instrument resolution, submitted-by entity, evidence availability, date decision, analysis trust, target event ID, reviewer/status를 기록한다. 모든 KR ID는 `MAPPED/QUARANTINED/DUPLICATE/REJECTED` 중 정확히 하나다. 중복은 canonical target 및 근거를 기록하며 manifest 없이 drop/merge하지 않는다. manifest는 `KR` 행만 대상으로 하며 input의 `US` 행 수/hash와 target DB의 US row hash를 전·후 대조해 같음을 입증한다. `UNMAPPED` 개수 0, KR input row count = manifest row count, distinct legacy ID completeness, unique source tuple 또는 설명된 duplicate mapping, manifest hash 고정이 아닌 이상 cutover 불가다.
- 기존 KR `eventDate`는 source artifact에서 정확히 입증되는 경우에만 해당 meaning의 date assertion 한 건으로 매핑한다. date kind/certainty/timezone/source field가 미확정이면 `UNVERIFIED_LEGACY_DATE`, 날짜가 `null`이거나 인공 sentinel이면 `NO_DATE_ASSERTION`으로 관리 진단만 남기고 일정으로 노출하지 않는다. `publishedAt`/`updatedAt`은 event date 또는 official receipt time으로 승격하지 않는다.
- 기존 title/summary/rationale/evidence text는 각각 legacy display text 또는 legacy analysis artifact로 보존한다. locator가 원문 hash의 재현 가능한 byte/text offset에 검증된 경우에만 새로운 `FactClaim`으로 재등록한다. URL만 있는 quote는 검증된 claim이 아니다. legacy confidence/direction은 새 extraction/impact confidence나 verified fact로 매핑하지 않는다.
- migration은 (a) immutable source snapshot과 repo commit/blob hash 저장, (b) 전체 event ID/source tuple manifest, (c) DART/KIND 원문 및 허용권리 재확인, (d) stable instrument mapping/eligibility snapshot, (e) independent row-count/hash/date/subject reconciliation, (f) quarantine와 rejection 처리, (g) projection dry-run, (h) same-snapshot rollback/restore rehearsal 순서다. 매핑 누락·중복 오귀속·revision 감소·hash mismatch·무근거 공개가 모두 0일 때만 전환 review를 요청한다. 과거 기록의 영속성/삭제·이전 projection 정리는 별도 승인 전 금지한다.
- 현 `lib/dart-opendart-client.ts`는 KST 당일 하루의 `list.json`을 `total_page`까지 읽고 receipt no를 dedupe하지만 과거 수정 유입을 위한 overlap 조회, durable cursor/checkpoint, `last_reprt_at` 명시 또는 목록 snapshot hash를 저장하지 않는다. 새 ledger collector의 일일 당일 조회와 correction reconciliation은 별도 run으로 둔다. reconciliation은 승인된 lookback window를 반복 조회하고 경계 날짜를 겹치며 receipt ID + metadata hash로 멱등 처리하고, 수정 marker/새 접수번호/내용 해시 변화를 기존 filing에 붙이지 않고 새 submission/document revision candidate로 만든다. `last_reprt_at=Y` 결과를 과거 원제출의 전체 ledger 대체물로 사용하지 않는다. 조회 window/page가 하나라도 실패하거나 total/page boundary가 바뀌어 일관성을 확인할 수 없으면 해당 날짜/window coverage를 `PARTIAL/FAILED`로 두고 run을 재개한다.
- 운영 DB import는 보호된 단일 경로에서 mainline commit SHA를 함께 기록하고, 이전 적용 commit의 fast-forward descendant만 허용한다. 동일 SHA/hash 재실행은 no-op 성공, stale SHA·분기·강제 되감기·event revision 감소는 전체 거부한다. 적용된 source SHA와 JSON hash를 checkpoint로 저장하고 event revision/projection/checkpoint를 한 transaction으로 반영한다. 새로운 국내 source-of-truth는 `KR_READ_SWITCHED` 승인이 확정되기 전에는 legacy importer에 연결하거나 활성 write하지 않으며, switch 시 기존 writer·cron·deploy importer를 같은 운영 change에서 fence/disable하여 단일 writer를 보장한다. 되돌림은 입력 원장 전환이 아니라 이전 read projection/version으로의 명시 snapshot rollback으로만 가능하며 rollback 대상도 최신 revocation/rights suppression을 약화할 수 없다.
- 기존 importer가 동일 event ID를 unconditional upsert하는 동작은 v2 운영 경로로 재사용할 수 없다. v2 importer는 checkpoint와 incoming base SHA를 대조해 Git object graph에서 descendant fast-forward 여부를 확인하고, event별 적용 revision/hash와 incoming `previousContentHash`·`eventRevision` 연속성을 검사한다. 한 건이라도 실패하면 batch 전체와 checkpoint를 rollback한다. 삭제는 tombstone만 허용한다. v1 importer/테이블에 적용해도 안전하다고 간주하지 않는다.
- `scripts/import-market-impact-events.mjs`의 현재 실제 계약은 JSON enum/형식 검사, `enabled=true AND instrument_type='COMMON_STOCK'` ticker 조회, transaction 내 `ON CONFLICT(event_id) DO UPDATE`다. 기존 코드는 fast-forward Git checkpoint, source commit/hash checkpoint, revision monotonicity, missing-row tombstone, advisory lock, rollback pointer, KST master snapshot freshness를 구현하지 않는다. `--dry-run`은 현재 구조상 format/master read만 하고 planned row diff를 출력하는 완전한 migration dry-run이 아니다. 따라서 이 script 또는 현재 deploy artifact를 새 ledger에 연결하거나 운영 전환 경로로 재사용할 수 없으며 `PRECHECK` 상태를 유지한다. 새 importer는 전체 input denominator와 base/output digest를 포함한 write plan을 먼저 저장하고, stale/branch/divergent source를 사전 거부하며, checkpoint와 projection을 같은 serializable/CAS-protected atomic batch로 적용하는 별도 구현 및 fixture가 필요하다.
- JSON에서 이벤트를 제거해 DB 행을 지우지 않는다. 실제 사건의 취소는 공식 근거를 가진 event revision의 `CANCELLED` 상태로 남기고, 원 공시 철회는 filing status/filing relation으로 기록한다. filing 철회만으로 underlying event를 `CANCELLED` 처리하지 않는다. 철회·오기 정정이 기존 fact/party/date 근거를 약화하면 immutable approved revision은 유지하고 publication gate를 `SUPPRESSED_EVIDENCE_REVIEW`로 전환해 재검토한다. DB hard delete와 Git history rewrite는 복구 절차를 별도 승인하지 않는 한 금지한다.
- 단일 JSON 동시 편집은 Git merge 성공만으로 안전하다고 보지 않는다. 변경 branch는 merge 전 최신 mainline에 rebase하고, CI가 base 대비 event ID별 `eventRevision` 단조 증가·`previousContentHash` 일치·중복 ID·누락/tombstone 여부를 semantic diff로 검증한다. 같은 event의 두 변경 branch가 동일 이전 hash에서 파생되면 자동 병합하지 않고 reviewer가 합친 새 revision을 만든다. array reorder는 의미 변경으로 취급하지 않되 자동 재정렬하지 않는다.
- Protected mainline 반영 전 schema/enum, evidence reference, content hash, 공식 common-stock 적격성, source URL/문서 hash 및 event/date 상태 전이를 검증한다. validator가 필요한 master/evidence를 읽지 못하면 pass 대신 `UNVERIFIED`/fail로 끝낸다. DB import는 승인 commit만 fast-forward projection으로 적용한다.
- 공개 API GET은 DB projection만 읽고 수집·수정 부수효과를 갖지 않는다. DB→JSON export는 검수용 diff/check 전용이며 source 원본 갱신 수단이 아니다.

권장 v2 JSON 이벤트 단위는 현재 v1 필드를 파괴적으로 바꾸지 않고 아래 형태의 `revision`, `submitter`, `parties`, `subjects`, `dates`, `analysis`, `sources`, `review`, `change` 객체를 추가한다. `submitter`는 filing 제출 entity이고 `parties`는 원문상 당사자 역할이며 서로 같은 객체로 축약하지 않는다. 아래 값은 계약 설명용 예시이며 실제 이벤트나 일정이 아니다.

```json
{
  "eventId": "DART:20261029000607:STRATEGIC_RESTRUCTURING",
  "schemaVersion": "kr-disclosure-events.v2",
  "eventRevisionId": "event-revision-2",
  "eventRevision": 2,
  "previousContentHash": "sha256:<previous-revision-hash>",
  "market": "KR",
  "submitter": { "corpCode": "00123456", "name": "예시회사" },
  "parties": [
    { "filingPartyId": "party-1", "role": "CONTRACT_PARTY", "evidenceClaimId": "claim-2", "resolutionStatus": "UNRESOLVED" }
  ],
  "subjects": [
    {
      "instrumentId": "<stable-instrument-id>",
      "marketCode": "KOSPI",
      "code": "000000",
      "role": "ISSUER",
      "eligibilityAssertionId": "<master-check-id>",
      "marketCapEligibilityAssertionId": "<cap-check-id>",
      "attributionEvidenceIds": ["claim-1"]
    }
  ],
  "eventType": { "taxonomyVersion": "kr-disclosure-events.v1", "value": "M_AND_A_RESTRUCTURING" },
  "status": "ANNOUNCED",
  "direction": "MIXED",
  "dates": [
    {
      "dateId": "date-1",
      "kind": "LEGAL_EFFECTIVE",
      "kindTaxonomyVersion": "kr-event-dates.v1",
      "valueKind": "DATE",
      "value": "2027-01-05",
      "precision": "DAY",
      "certainty": "OFFICIAL_CONFIRMED",
      "status": "ANNOUNCED",
      "certaintyBasisClaimIds": ["claim-1"],
      "sourceRef": { "filingId": "DART:20261029000607", "documentRevisionId": "docrev-1", "documentHash": "sha256:<document-hash>", "rightsDecisionId": "rights-dart-public-analysis-v1", "locator": "7.(2)" },
      "publicationAuthorization": { "rightsDecisionIds": ["rights-dart-date-output-v1"], "requiredActions": ["STORE_DERIVATIVE", "DISPLAY_EVENT_DATE"], "purpose": "EVENT_DATE", "channel": "PUBLIC_API", "checkedAt": "2026-10-30T00:00:00Z" }
    }
  ],
  "analysis": {
    "analysisRevisionId": "analysis-revision-2",
    "schemaVersion": "kr-filing-analysis.v1",
    "promptVersion": "<version>",
    "inputHash": "sha256:<all-input-revisions-hash>",
    "execution": { "kind": "MODEL", "engine": "<engine-id>", "model": "<model-id>", "executedAt": "2026-10-29T00:00:00Z" },
    "parserVersion": "<parser-version>",
    "rightsDecisionRef": "rights-dart-public-analysis-v1",
    "outputHash": "sha256:61ccd32051a3be107ac11b2cc7e4545eff8be5ed4525ec102af61f9a1bc8426b",
    "summary": [{ "segmentId": "summary-1", "analysisRevisionId": "analysis-revision-2", "kind": "FACTUAL", "locale": "ko-KR", "text": "원문에서 확인된 사실만 간결히 요약", "outputHash": "sha256:0b493b08b2c45c562b1f6c12b29ed6ccf461c6e3c115fd1d7b9fa649f5657b50", "claimIds": ["claim-1"], "reviewDecision": { "decisionId": "decision-summary-1", "approvalKind": "SUMMARY_SEGMENT", "status": "APPROVED", "targetRevisionId": "summary-1", "targetContentHash": "sha256:0b493b08b2c45c562b1f6c12b29ed6ccf461c6e3c115fd1d7b9fa649f5657b50", "dependencyFingerprintHash": "sha256:060ea9e93ad94c101bd13abe14aeecfc598f77912581c081cda893cf629cfac6", "reviewerId": "<reviewer-id>", "decidedAt": "2026-10-30T00:00:00Z" }, "summaryUseAuthorization": { "rightsDecisionIds": ["rights-dart-summary-output-v1"], "requiredActions": ["STORE_DERIVATIVE", "DISPLAY_PUBLIC_API"], "purpose": "SUMMARY", "channel": "PUBLIC_API", "checkedAt": "2026-10-30T00:00:00Z" } }],
    "extractedFacts": ["claim-1"],
    "confirmedDates": ["date-1"],
    "estimatedDates": [],
    "positiveFactors": [],
    "negativeFactors": [],
    "counterEvidence": [],
    "risks": [],
    "unknowns": [],
    "limitations": [],
    "extractionConfidence": "HIGH",
    "impactAssessmentConfidence": "LOW",
    "claims": [
      { "claimId": "claim-1", "claimType": "FACT", "text": "원문에 명시된 주장", "normalizedValue": { "valueKind": "DATE", "value": "2027-01-05" }, "verificationStatus": "SUPPORTED", "extractionConfidence": "HIGH", "evidenceRefs": [{ "evidenceId": "ev-1", "role": "SUPPORTS", "sourceRef": { "filingId": "DART:20261029000607", "documentRevisionId": "docrev-1", "documentHash": "sha256:<document-hash>", "rightsDecisionId": "rights-dart-public-analysis-v1", "locator": "7.(2)" } }] },
    { "claimId": "claim-2", "claimType": "FACT", "text": "원문에서 당사자 역할을 확인할 수 있으나 법인 코드/identity는 unresolved", "verificationStatus": "UNRESOLVED", "extractionConfidence": "MEDIUM", "evidenceRefs": [{ "evidenceId": "ev-2", "role": "CONTEXT", "sourceRef": { "filingId": "KIND:<source-id>", "documentRevisionId": "docrev-2", "documentHash": "sha256:<document-hash>", "rightsDecisionId": "rights-kind-public-analysis-v1", "locator": "본문 2절" } }, { "evidenceId": "ev-3", "role": "SUPPORTS", "sourceRef": { "filingId": "DART:20261029000607", "documentRevisionId": "docrev-1", "documentHash": "sha256:<document-hash>", "rightsDecisionId": "rights-dart-public-analysis-v1", "locator": "3. 계약상대방" } }] }
    ],
    "rationale": "근거와 영향 해석",
    "review": { "decisionId": "decision-analysis-2", "approvalKind": "ANALYSIS", "status": "APPROVED", "targetRevisionId": "analysis-revision-2", "targetContentHash": "sha256:61ccd32051a3be107ac11b2cc7e4545eff8be5ed4525ec102af61f9a1bc8426b", "dependencyFingerprintHash": "sha256:ee460c15f28ca229dc0546ece425e40023dd47a752d0a48967b0ebfec401cd2d", "reviewedBy": "<reviewer-id>", "reviewedAt": "2026-10-30T00:00:00Z" }
  },
  "sources": [
    { "filingId": "DART:20261029000607", "source": "DART", "externalId": "20261029000607", "receivedDate": "2026-10-29", "url": "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261029000607" },
    { "filingId": "KIND:<source-id>", "source": "KIND", "externalId": "<source-id>", "receivedDate": null, "url": "<official-source-url>" }
  ],
  "documentRevisions": [
    { "documentRevisionId": "docrev-1", "filingId": "DART:20261029000607", "documentHash": "sha256:<document-hash>" },
    { "documentRevisionId": "docrev-2", "filingId": "KIND:<source-id>", "documentHash": "sha256:<document-hash>" }
  ],
  "rightsDecisions": [
    { "rightsDecisionId": "rights-dart-public-analysis-v1", "filingId": "DART:20261029000607", "documentRevisionId": "docrev-1", "decisionSnapshotHash": "sha256:<rights-snapshot-hash>", "purpose": "ANALYSIS", "channel": "INTERNAL_ANALYSIS", "status": "APPROVED", "effectiveFrom": "2026-01-01T00:00:00Z", "effectiveUntil": "2027-01-01T00:00:00Z", "reviewerId": "<rights-reviewer-id>", "allowedActions": ["ANALYZE"] },
    { "rightsDecisionId": "rights-kind-public-analysis-v1", "filingId": "KIND:<source-id>", "documentRevisionId": "docrev-2", "decisionSnapshotHash": "sha256:<rights-snapshot-hash>", "purpose": "ANALYSIS", "channel": "INTERNAL_ANALYSIS", "status": "APPROVED", "effectiveFrom": "2026-01-01T00:00:00Z", "effectiveUntil": "2027-01-01T00:00:00Z", "reviewerId": "<rights-reviewer-id>", "allowedActions": ["ANALYZE"] },
    { "rightsDecisionId": "rights-dart-summary-output-v1", "filingId": "DART:20261029000607", "documentRevisionId": "docrev-1", "decisionSnapshotHash": "sha256:<rights-snapshot-hash>", "purpose": "SUMMARY", "channel": "PUBLIC_API", "status": "APPROVED", "effectiveFrom": "2026-01-01T00:00:00Z", "effectiveUntil": "2027-01-01T00:00:00Z", "reviewerId": "<rights-reviewer-id>", "allowedActions": ["STORE_DERIVATIVE", "DISPLAY_PUBLIC_API"] },
    { "rightsDecisionId": "rights-kind-summary-output-v1", "filingId": "KIND:<source-id>", "documentRevisionId": "docrev-2", "decisionSnapshotHash": "sha256:<rights-snapshot-hash>", "purpose": "SUMMARY", "channel": "PUBLIC_API", "status": "APPROVED", "effectiveFrom": "2026-01-01T00:00:00Z", "effectiveUntil": "2027-01-01T00:00:00Z", "reviewerId": "<rights-reviewer-id>", "allowedActions": ["STORE_DERIVATIVE", "DISPLAY_PUBLIC_API"] },
    { "rightsDecisionId": "rights-dart-date-output-v1", "filingId": "DART:20261029000607", "documentRevisionId": "docrev-1", "decisionSnapshotHash": "sha256:<rights-snapshot-hash>", "purpose": "EVENT_DATE", "channel": "PUBLIC_API", "status": "APPROVED", "effectiveFrom": "2026-01-01T00:00:00Z", "effectiveUntil": "2027-01-01T00:00:00Z", "reviewerId": "<rights-reviewer-id>", "allowedActions": ["STORE_DERIVATIVE", "DISPLAY_EVENT_DATE"] }
  ],
  "review": { "decisionId": "decision-event-2", "approvalKind": "EVENT", "status": "APPROVED", "targetRevisionId": "event-revision-2", "targetContentHash": "sha256:5819182fe7a0b47f532cb6a3995d162c70b718b4233d42427f0baa598598f405", "dependencyFingerprintHash": "sha256:063e162283431e1fa8fc9914574e24d96c3bbc5ec5f7009d104393ceba337311", "reviewedBy": "<reviewer-id>", "reviewedAt": "2026-10-30T00:00:00Z" },
  "change": { "reason": "날짜 근거 보완", "previousEventRevision": 1 },
  "contentHash": "sha256:5819182fe7a0b47f532cb6a3995d162c70b718b4233d42427f0baa598598f405"
}
```

`summary.outputHash` 입력은 `{analysisRevisionId, segmentId, kind, locale, text, claimIds}` typed payload다. `analysis.outputHash` 입력은 analysis revision의 `schemaVersion`, `promptVersion`, `inputHash`, `execution`, `parserVersion`, `rightsDecisionRef`, claims/evidence, summary segment의 위 payload와 `outputHash`, 그리고 extracted/confirmed/estimated facts·factor·risk·unknown·limitation·confidence·rationale 필드다. `event.contentHash` 입력은 event JSON 전체에서 `contentHash`와 모든 review/authorization decision envelope를 재귀적으로 뺀 값이다. 이때 summary의 `reviewDecision`/`summaryUseAuthorization`, analysis의 `review`, event의 `review`, 각 `publicationAuthorization`은 제외하지만 권리 근거 ID를 포함하는 원천 참조 및 `rightsDecisions` registry는 남긴다. 각 hash의 입력은 이 문서 JSON 예시의 해당 projection을 기준으로 한다. 각 승인은 immutable target revision/content hash 및 해당 승인의 전체 `dependencyFingerprintHash`를 참조한다.

세 output/content hash의 정확한 계산은 `SHA-256(UTF8(domain) || 0x00 || JCS-UTF8(payload))`다. domain은 각각 `KR-DISCLOSURE-SUMMARY-OUTPUT-v1`, `KR-DISCLOSURE-ANALYSIS-OUTPUT-v1`, `KR-DISCLOSURE-EVENT-CONTENT-v1`이다. 결과 표기는 `sha256:` 접두사 + lowercase 64자리 hex다. JCS는 RFC 8785의 I-JSON 제약을 적용한다: 중복 object key, lone surrogate, IEEE-754 binary64로 표현할 수 없는 숫자, NaN/Infinity를 거부한다. 금융 도메인의 정밀 정수는 JSON number 대신 decimal string schema로 저장한다. JSON으로 표현 가능한 IEEE-754 정수값은 안전 정수 범위를 넘어도 JCS 처리 가능하며, 표현 과정에서 반올림된 입력을 원래 정수라고 추정하지 않는다. Unicode 문자열은 NFC/NFD 정규화 없이 원 code point 그대로 보존한다. 배열 순서는 의미 데이터이므로 임의 재정렬하지 않는다. 이 예시의 hash는 검증용 fixture로 checker가 재계산한다. parser/canonicalizer 변경은 독립 구현으로 대조한 고정 test vector와 golden hash 검증 없이는 배포하지 않는다.

## 주요 데이터 계약

### 공시와 원문

- DART의 `corp_code`, `rcept_no`, `report_nm`, `rcept_dt`, `flr_nm`, `rm` 등 원천 필드를 원형 보존한다. 날짜·시각이 원천에 없는 경우 생성하지 않는다.
- 분석/event payload의 `sources`는 `filingId`를 포함한 source/external-ID catalog이며, `documentRevisions`는 unique `documentRevisionId`별로 parent `filingId`와 immutable `documentHash`를 고정한다. 각 evidence/date `sourceRef.rightsDecisionId`는 `rightsDecisions` registry의 별도 versioned record를 참조한다. 해당 record는 decision snapshot hash, filing/document component, exact `purpose`, `channel`, reviewer, `APPROVED` 상태, `[effectiveFrom,effectiveUntil)` UTC 유효구간 및 허용 action을 명시해야 한다. Authorization은 요청된 purpose/channel/action과 `requestAsOf`가 모두 맞을 때만 유효하며 만료·미승인·범위 불일치는 거부한다. 모든 `FactClaim.evidenceRefs`와 `EventDateAssertion.sourceRef`는 filing/revision/hash/rights record의 source lineage가 서로 맞는지 resolve해야 한다. 한 filing이 여러 원문/첨부를 가지면 revision마다 row를 따로 두며, bytes hash가 달라지면 새 document revision을, 권리결정이 달라지면 새 rights-decision revision을 추가한다. 실제 bytes/권리 artifact에 resolve되지 않는 예시용 placeholder는 설명 문서에서만 허용하고 승인 데이터는 거부한다.
- OpenDART 공식 `list.json` 계약은 `rcept_dt`를 `YYYYMMDD` 접수일자로 정의하고 응답 항목에 시·분·초 접수시각을 제공하지 않는다. 그러므로 목록 row에서 정확한 접수 timestamp를 추정하지 않고 `DATE_ONLY`로 둔다. `last_reprt_at` 기본 `N`은 정정보고서를 포함한 제출 전체를 검색한다. API가 페이지·합계 정보를 제공하더라도 OpenDART 약관상 공시정보의 정확성·완전성은 제출인 책임이며 금감원이 보장하지 않으므로, 페이지 열거 성공은 source snapshot 완전성이나 사실 정확성 증명이 아니다. source payload status와 pagination consistency를 별도로 기록하고 원문/별도 공식 근거 검증을 수행한다.
- 기존 `filings.published_at`은 현재 mapper에서 `detectedAt`으로 채워지는 경로가 있으므로 이벤트 모델의 `received_at`에 직접 매핑하지 않는다. `source_receipt_date`는 원천 날짜, `source_time_precision`은 `DATE_ONLY | MINUTE | SECOND | UNKNOWN`, `fetched_at`은 실제 취득 시각으로 별도 저장한다. 실제 접수 시각을 공식 원천으로 확인한 경우에만 `source_received_at`을 설정한다.
- 공시 식별자는 출처 namespace를 포함한다: `(source, external_id)`. DART는 `DART:<rcept_no>`, KIND는 공급자가 보장하는 식별자 또는 보존된 원문 링크 해시를 사용한다.
- 원천 응답 원문과 정규화 표현은 분리 저장한다. 원문 hash가 같으면 중복 snapshot을 줄일 수 있지만 fetch run/coverage 기록은 유지한다.
- 목록 메타데이터 수집 성공과 원문 취득 성공은 서로 다른 상태로 기록한다. `document.xml` 응답은 ZIP 바이트 여부와 ZIP 내부 엔트리/XML을 검증하고, HTTP 3xx redirect·오류 HTML·JSON 오류 body를 정상 문서로 저장하지 않는다. redirect는 공식 허용 host·hop 수·최종 URL 정책을 확인한 뒤 제한적으로 따라가며, 실패 시 `UNAVAILABLE`과 응답 코드/허용된 진단 메타데이터를 기록한다. 원문 취득 실패는 날짜 coverage 실패 여부에도 반영한다.
- 공시 정정은 새 제출로 보존한다. 원 제출을 삭제하거나 내용을 조용히 덮지 않는다. 정정 대상 연결을 확인하지 못하면 자동 병합하지 않고 검토 큐로 보낸다.
- OpenDART 목록 `last_reprt_at` 기본값 `N`은 정정보고서를 포함한 전체 제출을 뜻한다. correction-aware 수집은 이 전체 제출 흐름을 기준으로 하고, `Y`만 조회하는 최종본 전용 결과로 과거 제출을 대체하지 않는다. 응답 `rm`의 `정`(정정 제출 참조)·`철`(철회 또는 철회 간주) 및 `[기재정정]`, `[첨부정정]`, `[첨부추가]`, `[변경등록]`, `[연장결정]`, `[발행조건확정]` 같은 제목 marker는 후속 재조회/검토 trigger로 사용한다. 이 표식만으로 어떤 원 공시가 정정/철회됐는지 확정하는 key로 쓰지 않는다.
- 정정 연결 우선순위는 (1) 원문이 명시한 대상 접수번호/문서, (2) 공급자가 제공하는 공식 관계 키, (3) `corp_code` + 정규화한 보고서 subject/type + 시간 순서 + 본문 명시를 이용한 검토 후보 순이다. 1~2가 없으면 confidence와 일치 근거를 기록하고 자동 확정하지 않는다. 단순 유사 제목/당일 근접은 자동 merge 금지다.
- filing disposition은 source filing 자체의 효력/유효성 평가인 `ACTIVE`, `WITHDRAWN`, `DEEMED_WITHDRAWN`, `UNRESOLVED`로 관리한다. 정정 존재 여부는 disposition enum에 넣지 않고 filing relation edge(`CORRECTS`)로 계산한다. 정정 제출은 일부 항목만 바꿀 수 있고 그 정정 제출 자체가 후속 정정 대상이 될 수도 있으므로, 원 filing을 `HAS_CORRECTION`으로 상태 전이시키지 않는다. 정정 관계 그래프와 각 filing disposition은 독립적으로 보존한다. `rm=정/철`, title marker만으로 원 filing/첨부를 자동 supersede하지 않는다. 명시적 연결이 불명확하면 수동 확인 전 disposition을 `UNRESOLVED`로 둔다.
- filing relation(`CORRECTS`, `WITHDRAWS`, `REFERENCES`; corrective/withdrawal filing → 대상 filing 방향)과 document revision relation(`REPLACES`, `ADDS_ATTACHMENT`, `REFERENCES`) 및 event relation(`POSTPONES`, `CANCELS_EVENT`, `RESULT_OF` 등)은 서로 다른 그래프다. filing withdrawal이 사건 취소를 뜻하지 않으며 event `CANCELLED`는 사건 자체가 취소됐다는 직접 원문만 허용한다. 관계를 추가해도 과거 filing, event revision, filing party/date assertion은 immutable로 유지한다.
- source filing이 `WITHDRAWN`/`DEEMED_WITHDRAWN`이면 `disclosure_claim_evidence` lineage를 따라 영향받는 claim과 모든 요약/date/party/subject/event/publication consumer를 찾는다. 유일한 근거가 약화되면 claim을 unsupported로 표시하고 별도 `publication_state=SUPPRESSED_EVIDENCE_REVIEW`, `review_status=EVIDENCE_REVIEW_REQUIRED`로 공개를 차단한다. 복수 근거가 남아도 충분성을 자동 판정하지 않고 검토를 요구한다. 사건을 `CANCELLED`로 바꾸거나 승인 revision을 수정·삭제하지 않는다. reviewer가 독립 근거 재검증 후 새 revision 승인, 근거 부족으로 이벤트 미승인/철회, 또는 영향 범위를 제한한 공개 중 하나를 증거와 함께 결정한다.
- 내용 없는 공시, 첨부만 있는 공시, 다운로드 실패는 `METADATA_ONLY`, `ATTACHMENT_ONLY`, `UNAVAILABLE` 등 명확한 가용성으로 보존하며 본문이나 요약을 지어내지 않는다.
- 원문은 가급적 공식 제공 파일을 그대로 저장하고, 텍스트 추출본·HTML 정규화는 재생성 가능한 파생물로 분리한다. 원문 압축파일/첨부는 크기 제한·MIME 검증·악성 콘텐츠 격리 정책이 정해지기 전 자동 실행하지 않는다.

### 보통주 적격성 및 회사 귀속

- 주식 subject의 수집·갱신·저장·분석·공개 eligibility는 공식 master 조회 시점에 `enabled=true`, `instrument_type='COMMON_STOCK'`, 국내 시장임이 exact match로 확인되어야 한다. 비보통주·미확인 instrument의 주식 이벤트 row/analysis/publication은 생성하지 않고 fail-closed 처리한다. 공시 원문은 별도 filing evidence로 관리할 수 있으나 종목 이벤트로 귀속하지 않는다.
- master lookup 실패, 분류 미정, 상장 상태 불명은 `UNVERIFIED` 상태로 격리한다. 이벤트 생성·알림·추천·캘린더 기본 노출로 진행하지 않는다.
- submitter entity-to-instrument 연결은 DART 목록의 `corp_code`·`stock_code`와 KIS 공식 master의 `market`·`code`를 정확히 대조하되, 이 연결은 제출자 회사의 후보 종목만 정한다. 본문상 사건 법인 및 영향 종목은 FilingParty와 별도 `EventSubjectInstrument`로 각각 기록한다. filing submitter와 대상 종목이 다르면 원문이 당사자/자회사 관계와 사건의 직접 노출을 연결하는 claim이 있어야 한다. 자회사/관계사 공시를 상장 모회사에 귀속할 때는 자회사 관계, 계약 당사자, 모회사의 보증·지원·지분·의사결정 등 해당 이벤트의 직접 노출을 확인한다. `stock_code` 공란/미지원, 법인 identity 모호, 종목 다중 후보 또는 연결 근거 부재는 보류한다.
- 국내 종목 event 추출·캘린더 기본 eligibility는 신선하고 통화가 확인된 시가총액이 KRW 30,000,000,000 초과인 경우다. `<= 30,000,000,000`, 미확인 통화/원천, 결측 또는 승인된 freshness window가 없거나 이를 넘은 시총은 `EXCLUDED_BELOW_FLOOR`/`UNVERIFIED`로 fail-closed하고 해당 subject 종목의 분석·추천·공개에서 제외한다. 이 필터는 filing metadata/evidence 보존을 삭제하지 않는다. 원천값·통화·평가기준시각·수집시각·source·floor policy version을 immutable `MarketCapEligibilityAssertion`으로 고정하고, 현재 `instrument_fundamental_snapshots` 최신 행은 `(market,code)` 단위로 갱신되므로 과거 eligibility 증거로 재사용하지 않는다. cap 미달/불명 subject가 이후 기준을 충족하면 승인된 lookback/reconciliation 정책에 따라 보존 filing metadata를 다시 평가한다.
- 회사가 비상장/상장 전이거나 정지·상폐되어도 공시 원문 보존은 가능하다. 단, 현행 보통주 이벤트 화면의 적격 노출과 과거 공시 보존 정책은 분리한다.

### 사실, 해석, 일정

- `FactClaim`은 원문에서 직접 확인되는 주장(짧은 인용/locator/수치/단위/통화)을 보존한다. `Interpretation`은 영향 판단, 긍정·부정 근거, 반대 근거, 한계, confidence를 저장한다. 분석 confidence는 이벤트 발생 확률이나 주가 상승 확률이 아니다.
#### 공시 분석·요약 계약

- 분석 출력은 `source_document_revision`에 고정하고 `analysisSchemaVersion`, 분석기/모델 식별자, prompt/template version, 입력 hash, 실행시각, reviewer/decision을 기록한다. API key나 비밀값은 저장하지 않는다. 분석 엔진이 바뀌어도 기존 분석 revision은 수정하지 않고 새 결과를 만든다.
- 분석 provenance에는 원천 filing/document revision IDs와 byte/normalized text hash, parser+extractor version, source rights decision ID/snapshot hash, analysis schema version, model/provider identifier, prompt/template version/hash, locale, generation timestamp, output canonical hash, reviewer decision을 필수 필드로 둔다. secret value, hidden chain-of-thought, 모델의 비공개 내부 추론은 기록하지 않고, 검토 가능한 rationale/evidence links만 기록한다.
- Derived payload retention은 분석 권리와 별도 검증한다. analysis revision은 `payloadDisposition`(`PERSISTED`, `TRANSIENT_ONLY`, `NOT_RETAINED`) 및 적용 rights decision/snapshot hash, persistence action, retention class를 가진다. `TRANSIENT_ONLY`/`NOT_RETAINED`이면 summary·claim 원문 텍스트·정규화 일정 값을 DB, Git 원장, log, cache, backup에 기록하지 않는다. 저장 허용 없는 계산 결과를 `outputHash`만 남기고 나중에 재구성 가능한 것처럼 보이지 않게 availability를 명시한다. 영속 일정/요약을 제공하려면 해당 source component별로 derivative storage와 정확한 목적/channel의 display/API distribution을 각각 허용하는 유효 권리결정이 필수다. 원문 filing 자체의 공개 사실성이 derived output 저장·재배포 허용을 대신하지 않는다.
- 모든 claim은 analysis revision 안에서 unique한 `claimId`, `claimType`(`FACT/INTERPRETATION/COUNTER_EVIDENCE/UNKNOWN`), 원문에 직접 있는 문장 또는 명시적 해석 텍스트, optional raw value/unit/currency, normalization rule, extraction confidence, verification status를 가진다. 정규화된 날짜/수량이 주장되는 경우 `normalizedValue`는 `valueKind + value` tagged value로 저장하며, `OFFICIAL_CONFIRMED` 일정의 normalized value는 연결된 `SUPPORTED` FACT와 typed exact equality를 만족해야 한다. 근거는 claim당 1..N개의 `evidenceRefs`이며 각 ref는 analysis revision 내 unique `evidenceId`, `SUPPORTS/CONTRADICTS/CONTEXT` 관계, exact `filingId + documentRevisionId + documentHash + rightsDecisionId + locator`를 요구한다. ID와 hash는 실제 같은 immutable document revision 및 action에 적용되는 권리결정으로 resolve되어야 한다. FACT의 status는 `SUPPORTED/CONTESTED/UNSUPPORTED/UNRESOLVED`이며 `SUPPORTED`는 최소 1개 SUPPORTS와 유효한 검증을, CONTRADICTS 존재 시 최소 `CONTESTED`/`UNRESOLVED`를 요구한다. `CONTEXT`만으로 사실을 지지할 수 없다. 검증기는 미resolve evidence, 만료/범위 불일치 rights decision, 상태-관계 모순을 거부한다. 근거 ref는 immutable `disclosure_claim_evidence`와 양방향 대조되어야 한다. interpretation은 근거 claim IDs와 작성자/분석 revision을 필수로 한다.
- `summary`는 `FACTUAL`/`INTERPRETIVE` segment를 구분한다. 공개 factual segment는 하나 이상의 검증된 FACT claim, interpretive segment는 근거 claim 및 승인된 interpretation review를 요구한다. claim IDs는 해당 analysis revision 내부에서 unique하고 모든 reference가 resolve되어야 한다.
- Summary correctness approval과 summary-use authorization은 별도 gate다. 각 segment는 immutable `segmentId`, kind, text/output hash, ordered claim ID set, locale, analysis revision, reviewer decision 및 rights decision set을 가진다. 공개 표시/API 전달 전 segment가 참조하는 모든 claim/evidence의 source component, derived storage, exact channel/action 권리가 요청 기준 시점에 유효해야 한다. 하나라도 권리 불명/만료/범위 불일치면 해당 segment를 저장·응답하지 않는다. 다른 허용 segment는 독립적으로 계산할 수 있으나 summary가 비어도 event/date publication은 독립 gate를 통과해야 한다. 인용 전문은 해당 source별 인용권과 승인된 길이 정책이 모두 명시된 경우만 저장/표시하며, 정책 수치가 미승인인 동안 직접 인용은 제외한다.
- `disclosure_analysis_revisions`가 canonical analysis payload를 소유하고 `disclosure_claim_evidence`, typed date/party/subject, summary segment tables는 revision-pinned query/invalidation projection이다. canonical payload와 정규화 projection 간 exact identity/hash/cardinality parity가 한 transaction에서 성립해야 한다. 한쪽만 쓰기 성공하면 전체 reject한다. 권리상 canonical payload를 영속할 수 없으면 금지된 payload 없는 제한 모드로 정합성을 증명할 별도 canonical source가 승인되지 않는 한 persistent claim/date/summary/event는 생성하지 않는다. 동일 내용을 Git JSON과 DB에서 각각 독립 편집하는 dual source-of-truth는 금지한다.
- JSON 예시의 `analysis.review`는 원문 사실 추출·요약 분석의 승인이고 top-level `review`는 event/subject/date 공개 승인이다. 두 결정은 독립 상태(`PENDING/APPROVED/REJECTED/NEEDS_EVIDENCE`)와 별도 actor/reason/time을 갖는다. analysis 승인만 event/date 공개 pointer를 바꾸지 않는다.
- 한국어 사실 요약은 제출 법인, 당사자 역할, 행위, 규모·단위, 일정·기한, 조건, 원문에 기재된 미확정 항목을 구분한다. 요약의 각 문장/claim은 원문 document revision hash와 section/page/table locator에 연결되어야 한다. 근거 locator가 없거나 원문 취득이 안 된 주장을 사실 요약에 넣지 않는다.
- 분석 결과는 `extractedFacts`, `confirmedDates`, `estimatedDates`, `positiveFactors`, `negativeFactors`, `counterEvidence`, `risks`, `unknowns`, `limitations`, `instrumentAttribution` 필드를 논리적으로 분리한다. 요약은 사실 표현이고 방향성 해석과 합치지 않는다. 약관상 원문 보존이 제한되면 허용된 인용 길이/locator와 해시만 남긴다.
- 추출 확실성(`extractionConfidence`), 해석 확실성(`impactAssessmentConfidence`), 일정 출처 확실성(`OFFICIAL_CONFIRMED` 등)은 별개이며 confidence vocabulary는 `HIGH/MEDIUM/LOW/UNASSESSED`로 고정한다. 어느 confidence도 사건 발생 확률·승인확률·예상 수익률로 표현하지 않는다. 긍정/부정 방향은 공식 근거 및 반대 근거를 함께 기록하고, 일정 존재만으로 긍정 판정하지 않는다.
- 원문이 명시한 일정과 분석기가 해석/추정한 일정을 서로 다른 assertion/source certainty로 저장한다. 문구상 날짜가 모호하거나 조건부이면 범위/정밀도를 낮추고, 임의의 날짜·시각을 생성하지 않는다. 근거 충돌 시 unresolved/contested로 검토 보류하며 가장 최근 문서라고 자동 우선하지 않는다.
- 공시 문서와 첨부는 신뢰할 수 없는 입력 데이터다. 원문 안의 명령형 문구나 프롬프트 유사 텍스트는 분석 지시로 실행하지 않고, 분석기 지침·도구 권한·비밀정보와 격리한다. 원문을 근거로 외부 작업·쓰기·알림을 자동 수행하지 않는다.
- 분석 승인과 이벤트/일정 공개 승인은 별도 review decision이다. 분석 승인만으로 event/date가 공개되지 않는다. 각 summary segment는 하나 이상의 유효 claim ID를 가져야 하고, 모든 claim ID는 동일 analysis revision 내 유일하며 각 FACT claim의 모든 evidenceRef가 filing ID·document revision ID/hash·적용 가능한 rights decision ID·locator까지 resolve되어야 한다. FACT 상태와 evidence 역할의 모순은 거부한다. 정정/철회/첨부 교체는 evidenceRef 그래프를 따라 consumer impact를 계산한다. 자동 분석은 후보만 만들며, 원문 미취득/파싱 오류/근거 누락/종목 귀속 미검증이면 기본 공개를 차단한다.
- 한 공시가 여러 독립 사건을 다루면 별도 event로 분할한다. 동일 사건의 여러 날짜는 한 event의 다중 date assertion으로 연결한다.
- `event_type` 분류는 versioned controlled vocabulary로 관리한다. 1차 상위 유형은 `CAPITAL_RAISE`, `CAPITAL_RETURN`, `CONTRACT`, `M_AND_A_RESTRUCTURING`, `CAPITAL_CHANGE`, `GOVERNANCE`, `LEGAL_REGULATORY`, `FINANCIAL_RESULTS`, `OTHER`로 시작하되, 하위유형과 허용 날짜 종류는 공시 양식별 대조 후 결정한다. 매핑이 없는 공시는 `OTHER/UNMAPPED`로 격리하고 새 enum을 즉시 운영 추가하지 않는다. 유형 사전은 effective date와 version을 가진다.
- 이벤트 날짜는 날짜 종류(`FILING_RECEIVED`, `BOARD_RESOLUTION`, `RECORD_DATE`, `PAYMENT`, `LEGAL_EFFECTIVE`, `TRADING_START`, `COMPLETION`, `DEADLINE`, `OTHER`)로 구분한다. 프로젝트 도메인에 없는 종류는 `OTHER`와 설명을 사용하고 enum에 임의 의미를 끼워 넣지 않는다.
- 일정 값은 단일 문자열/시각 컬럼으로 축약하지 않고 `valueKind` tagged union으로 저장한다: `DATE`, `LOCAL_DATE_TIME`, `OFFSET_DATE_TIME`, `MONTH`, `QUARTER`, `DATE_RANGE`, `UNKNOWN`. `DATE`는 timezone 없는 Gregorian local date로 보존하고 UTC·KST instant로 변환하지 않는다. `MONTH`/`QUARTER`는 원문 정밀도대로 저장하며 기간이 원문에 명시되지 않았다면 임의 start/end date를 만들지 않는다.
- `LOCAL_DATE_TIME`은 원문 local date/time과 source timezone label/zone ID 및 `timezoneResolution`을 보존한다. timezone이 공식 양식/문서 문맥으로 확인되지 않으면 임의로 `Asia/Seoul`을 붙이거나 instant로 정규화하지 않고 raw local value로만 관리한다. `OFFSET_DATE_TIME`은 명시된 numeric offset이 있는 ISO 8601/RFC 3339 instant로 정규화한다. PostgreSQL `timestamptz` 사용 시 세션 timezone 표시는 원문 timezone을 뜻하지 않으므로 original local value, offset, zone ID를 별도 유지한다.
- `DATE_RANGE`는 `startValue`, `endValue`, 각 boundary의 `INCLUSIVE/EXCLUSIVE/UNKNOWN`, 원문 표현을 보존한다. “까지/이전/부터”의 법적·업무상 포함 의미가 공식 서식/문맥으로 확정되지 않으면 `UNKNOWN`을 유지하고 정밀 deadline 알림·마감일 계산을 차단한다. 거래 비영업일이라고 원문 일정을 다음 영업일로 자동 이동하지 않는다.
- 날짜값이 없는 하루 종일 이벤트에 임의 `00:00`/`23:59`를 생성하지 않는다. date assertion에는 `valueKind`, 원문 표현, canonical local value/offset, source timezone label/zone ID, timezone resolution, range boundary semantics, precision, conversion rule/version을 포함한다. 원문 정밀도보다 세밀한 값을 공개하거나 계산 일정으로 승격하지 않는다.
- 일정 상태와 증거 상태는 별도다. 권장 일정 상태: `ANNOUNCED`, `ESTIMATED`, `POSTPONED`, `CANCELLED`, `COMPLETED`, `UNKNOWN`. 권장 출처 확실성: `OFFICIAL_CONFIRMED`, `ISSUER_EXPECTED`, `REGULATORY_ESTIMATE`, `THIRD_PARTY_ESTIMATE`, `UNVERIFIED`. 한 상태만으로 출처 확실성을 유추하지 않는다.
- `dateKind`는 날짜 의미 어휘, `certainty`는 출처/확정 근거, `status`는 일정 lifecycle, `precision`은 값 정밀도다. 이 네 축을 하나의 enum으로 합치지 않는다. `dateKind=OTHER`는 versioned taxonomy에 아직 채택되지 않은 의미에만 쓰고 설명과 검토 상태를 필수로 한다. 알려진 의미를 `OTHER`로 우회하지 않는다.
- 제안하는 국내 date-kind 후보는 `MEETING_START`, `VOTING_RECORD_DATE`, `NOTICE_DEADLINE`, `CONTRACT_SIGNED`, `CONTRACT_START`, `CONTRACT_END`, `DISCLOSURE_DEFERRED_UNTIL`, `ASSESSMENT_AS_OF`, `SUBSCRIPTION`, `ALLOTMENT`, `NEW_SHARE_LISTING`이다. 각 항목은 versioned taxonomy에 등록되고 실제 공식 양식 fixture와 field locator를 확보하기 전까지 `UNMAPPED/NEEDS_EVIDENCE`다. 날짜에 대한 승인된 해석이 없으면 publication gate에서 차단한다.
- 날짜 추출 검증은 원문 text span/표 cell과 parser revision/hash를 입력으로 고정해 실행한다. 필드별 원문값, 정규화값, precision/timezone, conversion rule/version, source claim IDs를 함께 둔다. 자동 변환을 검증할 수 없으면 원문 표현과 locator만 저장하고 날짜 projection은 만들지 않는다.
- 상태 전이는 원문 또는 검토 결정을 요구하며 이전 상태·이전 날짜를 남긴다. 예: `ANNOUNCED→POSTPONED→ANNOUNCED`, `ANNOUNCED→CANCELLED`, `ANNOUNCED→COMPLETED`. 취소/연기는 삭제나 과거 일정 덮어쓰기가 아니다.
- 같은 날짜에 공시 접수와 법적 효력이 발생해도 두 assertion을 각각 저장한다. 일정 미확정은 날짜 null과 근거/다음 확인 조건으로 표현한다.
- 날짜 assertion의 값 이력은 날짜 종류 단위로 보존한다. 예: 체리부로 2026-10-30 분기배당 결정 문서는 배당기준일을 2026-11-13에서 2026-11-16으로 변경했다고 명시하면서 지급 예정일 2026-11-27을 별도로 제시한다. 신규 기준일 assertion과 `SUPERSEDES` date-relation을 append하고 기존 assertion row는 수정하지 않는다. reviewer 승인된 revision과 assertion-level publication decision이 가리키는 값만 현재 일정으로 투영하며, 지급일은 별도 assertion으로 저장한다. 단순히 최신 날짜만 남기거나 두 날짜를 같은 `eventDate`로 덮어쓰지 않는다.
- 한 filing이 여러 독립 행위/일정을 직접 설명하면 event와 date assertion을 분리한다. 샘표 2026-10-30 임시주총 소집결의 표본은 개최 2026-12-17 11:00, 의결권 기준일 2026-11-16, 합병 승인 안건을 포함한다. 주총 개최 event와 기준일은 별도 날짜 종류이며, 합병결정은 관련 공시를 근거로 별도 event로 연결한다. 안건 자체를 합병 완료로 표현하지 않는다.
- 정정공시는 필드별 before/after를 보존한다. 성우테크론에 대한 과거 비재현 메모는 본문 claim이나 fixture가 아니다. DART list metadata는 9/10 원 제목(`20260910900287`), 9/30 `[기재정정]`+`rm=코정`(`20260930900523`), 10/30 `[기재정정]`(`20261030901396`)을 보인다. 따라서 과거 문서에서 9/30을 원 제출로 쓴 서술은 잘못되어 여기서 교정한다. 이 list 순서는 relation candidate일 뿐, 정정별 target·필드 영향은 검증 가능한 본문 근거 확인 전 확정하지 않는다. 모든 정정이 일정 변경은 아니므로 변경 field path와 해당 event/date 영향 여부를 별도로 기록한다.
- 시장 안내 정정은 본문상 “정정”이어도 일정이 아닌 상장유지 조건의 누적 진행정보일 수 있다. 랩지노믹스 2026-10-30 표본은 기준일 시점 경과일수 36일과 연속 충족일수 24일을 보고한다. 이를 확정 상폐일로 변환하지 않고 `REGULATORY_RISK/OBSERVATION` 사실 및 원문이 명시한 조건·평가기준 시점으로 남긴다.
- 주가 방향은 별도 분석 속성이고 일정 상태와 독립이다. 이벤트 일정만 보고 POSITIVE를 추론하지 않는다.

#### 공식 양식 fixture catalog 및 재현성 gate

2026-10-31T15:30:50.222Z OpenDART `list.json` 공식 metadata read-only query에서 2026-10-30 전체 응답 1,062 row/11 page를 읽고 `status=000`, page echo, stable-in-run totals, row sum, unique 14-digit receipt를 검사했다. 성우테크론은 `corp_code=00350482`로 2026-09-01~2026-10-30 구간 6 row/1 page도 조회했다. 이는 한 번의 non-snapshot metadata pass이며 원천 snapshot completeness, body bytes, 정정 관계의 본문상 명시 또는 source rights 승인을 뜻하지 않는다. 공식 `document.xml` 계약은 ZIP 문서 body를 반환하고 `rcept_no`를 요구하지만, 본 조사에서는 오류 redirect였다. 공식 DART `main.do?rcpNo=`는 HEAD 302만 확인했으며 안정된 viewer document key를 반환하는 metadata-only API 계약을 입증하지 못했다. 따라서 viewer shell/JS를 locator 용도로 반복 요청하지 않는다. 아래 각 row는 accession/company/code/report-name metadata가 확보됐으나 viewer `dcmNo`, 정확한 body field locator, document hash/허용 대체 증거, per-source rights snapshot hash는 연결하지 못했다. 과거 수동 열람 메모는 `UNREPRODUCIBLE_OBSERVATION`으로 강등하며 분석 가설·금지 추론에만 참고한다. 네 row 모두 `SOURCE_METADATA_RESOLVED_BODY_FIXTURE_INCOMPLETE`이고 validator/golden test 실행 가능한 fixture가 아니며 taxonomy 승인 근거로 집계하지 않는다.

| fixture ID | 공식 list metadata tuple (회사코드/종목코드/접수번호/보고서명/비고) | 관찰 요약(사실 기대값 / 금지 추론) | 현재 증거 누락 / gate |
|---|---|---|---|
| `KR-FORM-01-DIVIDEND-REVISION` | `00216434/066360/20261030901347/현금ㆍ현물배당결정(분기배당)/코` | 과거 비재현 메모: 기준일 변경 및 지급 예정일 관찰. 오직 금지 추론(결정만으로 지급완료 아님)을 설계 사례로 사용 | 값 주장은 `UNREPRODUCIBLE_OBSERVATION`; viewer `dcmNo`, 기준일 field locator, rights snapshot/hash 누락; `SOURCE_METADATA_RESOLVED_BODY_FIXTURE_INCOMPLETE`, taxonomy approval count 0 |
| `KR-FORM-02-SHAREHOLDER-MEETING` | `00130091/007540/20261030801331/주주총회소집결의/유` | 과거 비재현 메모: 개최·기준일·합병 안건 관찰. 오직 금지 추론(안건은 합병 완료가 아님)을 설계 사례로 사용 | 값 주장은 `UNREPRODUCIBLE_OBSERVATION`; 개최시각/기준일 locator, timezone 근거, rights snapshot/hash 누락; `SOURCE_METADATA_RESOLVED_BODY_FIXTURE_INCOMPLETE`, taxonomy approval count 0 |
| `KR-FORM-03-CONTRACT-CORRECTION` | `00350482/045300/20261030901396/[기재정정]단일판매ㆍ공급계약체결/코`; list candidates: `20260910900287` 원 제목, `20260930900523` `[기재정정]`+`rm=코정`, `20261030901396` `[기재정정]` | 과거 비재현 메모: 유보기한/계약기간 관찰. 오직 금지 추론(계약 종료일은 이행완료 아님)을 설계 사례로 사용 | 9/30이 원 제출이라는 이전 서술은 철회. 정정 target/body chain, before/after locator, rights snapshot/hash 미확정; 값 주장은 `UNREPRODUCIBLE_OBSERVATION`; fixture incomplete, taxonomy approval count 0 |
| `KR-FORM-04-LISTING-RISK-ASSESSMENT` | `00545114/084650/20261030901431/[기재정정]기타시장안내(주가 미달에 따른 상장폐지 우려 관련 안내)/코`; same-day preceding row `20261030901408` has title without `[기재정정]` and `rm=코정` | 과거 비재현 메모: 거래일수 관찰. 오직 금지 추론(자동 확정 상폐일 아님)을 설계 사례로 사용 | exact body relation/locator, condition unit, rights snapshot/hash 누락; 값 주장은 `UNREPRODUCIBLE_OBSERVATION`; fixture incomplete, taxonomy approval count 0 |

Fixture의 증거 mode는 `ORIGINAL_BODY` 또는 `STRUCTURED_API_FIELD`로 명시한다. `ORIGINAL_BODY`가 `VERIFIED`가 되려면 exact source tuple(source, `rcept_no`, viewer document key), official URL, retrieval timestamp, rights decision ID/hash/action, 권리 허용 document hash 또는 검증 가능한 대체 증거, 정확한 page/section/table/cell locator, 기대 normalized facts/date kind/precision/certainty, 금지 추론, reviewer와 taxonomy version이 필요하다. 원문 body/긴 인용은 별도 rights scope가 허용하지 않으면 fixture에 복제하지 않는다. `STRUCTURED_API_FIELD`는 아래 구조화 API 절의 endpoint/guide/field mapping/receipt/correction/권리/reviewer 조건을 모두 만족할 때만 정확한 field-level 값의 fixture로 `VERIFIED` 가능하다. 이 mode는 본문 서술·조건·법적 효과·요약을 검증하지 않는다. correction marker/제목 및 순차 접수번호만으로 relation edge를 확정하지 않는다. 원문 body mode의 rights/locator가 재검증되지 않으면 `BODY_FIXTURE_INCOMPLETE`/`NEEDS_EVIDENCE`로 유지하며 taxonomy release 금지다. metadata API로 안정적인 document key를 보장하지 않을 경우 viewer shell/JS를 locator API처럼 호출·파싱하지 말고, 공식 문서 취득 경로·권리 근거가 확정될 때까지 해당 body fixture를 미검증으로 보류한다. 한 예시 통과는 문서 유형 전체를 대표하지 않으며 승인에는 유형·정정/첨부·모호한 날짜의 층화된 official fixture set이 필요하다.

#### 공식 구조화 주요정보 API와 원문 filing의 역할

OpenDART는 공시검색/list API와 별도로 주요사항보고서 유형별 JSON/XML 주요정보 endpoint를 제공한다. 예를 들어 가이드는 유상증자 `piicDecsn.json` 및 유무상증자 `pifricDecsn.json` 필드에 보통주/기타주식 신주 수를 분리하고, `fric_nstk_asstd`(신주배정기준일), `fric_nstk_dlprd`(신주권교부예정일), `fric_nstk_lstprd`(신주 상장 예정일), `fric_bddd`(이사회결의일)를 서로 다른 값으로 정의한다. 주식교환·이전 `stkExtrDecsn.json`도 주주확정기준일, 주주명부 폐쇄기간, 반대의사 통지기간 등 여러 일정을 개별 field로 제공한다. 합병 `cmpMgDecsn.json`은 유형별 요약 정보를 제공하지만 가이드에서 확인되지 않은 날짜 field를 추정해 추가하지 않는다. API 가이드는 제공값이 제출 공시의 “일부 정보”이며 정확성·완전성을 보장하지 않고 상세는 해당 보고서를 보도록 명시한다. 따라서 schema field가 분명한 값의 discovery/정규화 후보로는 활용하되 누락 없는 원문·정정 history 또는 본문 전체의 대체물로 취급하지 않는다.

`StructuredSourceRevision`은 `(provider, endpoint/API product, exact request window fingerprint, corp_code, rcept_no, HTTP/API status, retrieved_at, response hash 또는 non-retention reason, API guide snapshot/version+hash, exact field path, normalized value/hash, rights decision revision/action, mapping release, correction reconciliation run/assertion)`을 기록한다. API credential, 원문 불필요 payload, secret은 기록하지 않는다. 영속 권한이 없으면 response body는 저장하지 않고 허용된 최소 normalized value/hash/locator만 저장하거나 `TRANSIENT_ONLY`로 평가한다. `rcept_no`는 `list.json` receipt와 연결하고 실제 문서 URL을 따로 둔다. API 응답이 `status=000`이어도 해당 receipt/field가 현재 최종 정정본인지, field가 응답에 없는 것이 실제 미공시인지 증명하지 않는다. `013` 또는 빈 `list`도 일정 부재 증거가 아니다. mapping/reconciliation artifact가 권리상 저장될 수 없으면 그 상태를 `UNVERIFIABLE`로 두고 date publication을 금지한다.

일정값 사용은 field별 mapping release가 필요하다: `endpoint + API guide snapshot + field path → dateKind/valueKind/precision/semantic role/allowed status/forbidden inference`. API candidate와 original filing의 정정·철회 관계, source `rcept_no`, 값 충돌, 현행성 reconciliation을 통과해야 current date assertion을 승인한다. 정정/철회 연결이 불명확하거나 response field와 원문 locator가 충돌하면 `CONTESTED/UNRESOLVED`로 둔다. 공식 structured API에서 명시한 날짜가 있고 (a) 해당 endpoint/field/derivative action의 권리가 승인되고, (b) 정확한 source receipt로 resolve되며, (c) field mapping release와 correction-reconciliation coverage가 `CURRENT`이고, (d) event/subject/date reviewer가 그 제한된 field 의미를 승인한 경우에는 원문 body fetch를 요구하지 않는 date evidence 경로를 허용할 수 있다. 이 제한적 허용은 서술 사실·조건·법적 결과·추론 요약을 지원하지 않으며, body의 맥락이 중요한 field는 원문 locator가 확보될 때까지 공개 불가다. 어느 조건이든 불명확하면 metadata/API 후보는 내부 queue에만 둔다.

taxonomy/form fixture catalog는 각 범주를 `STRUCTURED_API_FIELD`, `ORIGINAL_BODY_FIELD`, `BOTH_REQUIRED`, `NO_APPROVED_SOURCE`, `NOT_APPLICABLE`로 분류한다. 분류값마다 확인된 공식 guide URL/snapshot hash, endpoint·field path, source rights disposition, receipt-to-original resolution, correction tests, typed date mappings, withheld inferences, reviewer/release version을 연결한다. taxonomy approval은 endpoint 이름을 검색한 결과나 field가 존재한다는 것만으로 하지 않고, 대표·경계·정정·빈 응답/필드 누락 표본의 실제 response와 source filing reconciliation 결과를 근거로 한다.

Structured API 경로의 `VERIFIED` fixture 최소 증거는 API product/endpoint, guide snapshot hash/as-of, 정확한 request window와 retrieval timestamp, `corp_code`·`rcept_no`, API status, field path 및 값의 허용된 hash/정규화 결과, response hash 또는 권리상 비보존 사유, action 권리결정 revision, mapping release, coverage denominator와 correction-reconciliation run/hash, filing relation disposition, reviewer 결정이다. API 빈 필드·빈 응답은 해당 날짜/이벤트 부재를 증명하지 않으며, API의 field semantics가 본문 맥락·조건을 필요로 하면 `BOTH_REQUIRED`로 분류한다. 이 증거가 부족하면 fixture는 `STRUCTURED_FIXTURE_INCOMPLETE`이고 일정 공개는 불가하다.

#### OpenDART DS005 주요정보 공식 36종 inventory

OpenDART DS005 가이드 목록은 아래 36개 주요정보 제품을 제공한다. 이는 공시 유형 탐색 범위의 분모이지, 국내 보통주 일정 필드의 승인 목록은 아니다. guide ID는 공식 목록의 각 바로가기에서 확인했다. 해외상장 관련 12–15번은 국내 상장 보통주에 직접 연결된 근거가 있을 때만 조건부로 연결하고, 해외 증권을 국내 common-stock subject로 취급하지 않는다. 채무증권 유형은 발행사 event 분석 후보일 수 있으나 채권·권리증권을 보통주로 취급하거나 갱신하지 않는다. 자회사/비상장 당사자, 해외상장, 채무증권은 filing company가 보통주라는 이유만으로 그 종목의 event subject에 귀속하지 않는다.

2026-11-04 현재 runtime source에 대한 정적 literal scan에서는 아래 36개 JSON endpoint 호출을 찾지 못했다. 따라서 각 행의 `NOT_APPROVED`는 현재 consumer `NOT_FOUND_STATIC_SCAN`과 함께 읽는다. 별도 운영 코드는 DART `list.json` 자동화와 `snglpnrsctrt.json` 계약상세 경로가 확인되지만 이 둘은 DS005 36종과 다른 제품이다. 정적 문자열 검색은 동적 URL 구성, 저장소 밖 caller, 배포 설정·실제 트래픽을 입증하지 않으므로 “사용 안 함”이나 “폐기 가능”으로 승격하지 않는다. 매 source scan은 조회 범위/commit을 재현 가능한 report로 남기고 endpoint별 caller·저장·표시·backup 경로가 발견되면 row 상태를 갱신해야 한다.

| # / guide ID | JSON endpoint | 공식 주요정보 유형 | 사건 범주 | 국내 보통주 원장 처리 | field/mapping 상태 |
|---:|---|---|---|---|
| 1 / [`2020018`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020018) | `/api/astInhtrfEtcPtbkOpt.json` | 자산양수도(기타), 풋백옵션 | `ASSET_TRANSACTION/OPTION` | 직접 당사자·영향 근거 확인 후 후보 | `NOT_APPROVED` |
| 2 / [`2020019`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020019) | `/api/dfOcr.json` | 부도발생 | `INSOLVENCY/DEFAULT` | 발행사 상태 사건 후보 | `NOT_APPROVED` |
| 3 / [`2020020`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020020) | `/api/bsnSp.json` | 영업정지 | `OPERATIONS/SUSPENSION` | 발행사·사업부 구분 후 후보 | `NOT_APPROVED` |
| 4 / [`2020021`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020021) | `/api/ctrcvsBgrq.json` | 회생절차 개시신청 | `INSOLVENCY/REHABILITATION` | 발행사/당사자 귀속 검토 후 후보 | `NOT_APPROVED` |
| 5 / [`2020022`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020022) | `/api/dsRsOcr.json` | 해산사유 발생 | `CORPORATE/DISSOLUTION` | 발행사 직접 귀속 검토 후 후보 | `NOT_APPROVED` |
| 6 / [`2020023`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020023) | `/api/piicDecsn.json` | 유상증자 결정 | `CAPITAL_RAISE/PAID_INCREASE` | 주식·청약·납입 후보 일정 분리 | `NOT_APPROVED` |
| 7 / [`2020024`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020024) | `/api/fricDecsn.json` | 무상증자 결정 | `CAPITAL_RAISE/FREE_ISSUE` | 배정기준·신주상장 등 후보 분리 | `NOT_APPROVED` |
| 8 / [`2020025`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020025) | `/api/pifricDecsn.json` | 유무상증자 결정 | `CAPITAL_RAISE/MIXED_ISSUE` | 유상/무상 각 일정 독립 관리 | `NOT_APPROVED` |
| 9 / [`2020026`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020026) | `/api/crDecsn.json` | 감자 결정 | `CAPITAL_CHANGE/REDUCTION` | 주총·효력·거래 날짜 종류 분리 | `NOT_APPROVED` |
| 10 / [`2020027`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020027) | `/api/bnkMngtPcbg.json` | 채권은행 등의 관리절차 개시 | `CREDIT/WORKOUT` | 발행사 상태·기한 근거별 후보 | `NOT_APPROVED` |
| 11 / [`2020028`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020028) | `/api/lwstLg.json` | 소송 등의 제기 | `LEGAL/PROCEEDING` | 기일/결과는 별도 공식 근거 후보 | `NOT_APPROVED` |
| 12 / [`2020029`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020029) | `/api/ovLstDecsn.json` | 해외 증권시장 주권등 상장 결정 | `FOREIGN_LISTING` | 국내 common 직접 영향 시 조건부 | `NOT_APPROVED` |
| 13 / [`2020030`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020030) | `/api/ovDlstDecsn.json` | 해외 증권시장 주권등 상장폐지 결정 | `FOREIGN_DELISTING` | 국내 common 직접 영향 시 조건부 | `NOT_APPROVED` |
| 14 / [`2020031`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020031) | `/api/ovLst.json` | 해외 증권시장 주권등 상장 | `FOREIGN_LISTING` | 해외 상장; 국내 일정과 혼동 금지 | `NOT_APPROVED` |
| 15 / [`2020032`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020032) | `/api/ovDlst.json` | 해외 증권시장 주권등 상장폐지 | `FOREIGN_DELISTING` | 해외 상장폐지; 국내 일정과 혼동 금지 | `NOT_APPROVED` |
| 16 / [`2020033`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020033) | `/api/cvbdIsDecsn.json` | 전환사채권 발행결정 | `DEBT/CONVERTIBLE_BOND` | 발행사 event; 전환·납입 본문 확인 | `NOT_APPROVED` |
| 17 / [`2020034`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020034) | `/api/bdwtIsDecsn.json` | 신주인수권부사채권 발행결정 | `DEBT/BOND_WITH_WARRANT` | 발행사 event; 채무증권과 common 분리 | `NOT_APPROVED` |
| 18 / [`2020035`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020035) | `/api/exbdIsDecsn.json` | 교환사채권 발행결정 | `DEBT/EXCHANGEABLE_BOND` | 발행사 event; 기초주식·일정 확인 | `NOT_APPROVED` |
| 19 / [`2020036`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020036) | `/api/bnkMngtPcsp.json` | 채권은행 등의 관리절차 중단 | `CREDIT/WORKOUT` | 관리절차 종료 상태 후보 | `NOT_APPROVED` |
| 20 / [`2020037`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020037) | `/api/wdCocobdIsDecsn.json` | 상각형 조건부자본증권 발행결정 | `DEBT/CONTINGENT_CAPITAL` | 발행사 event; 비보통주 증권과 분리 | `NOT_APPROVED` |
| 21 / [`2020038`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020038) | `/api/tsstkAqDecsn.json` | 자기주식 취득 결정 | `TREASURY_STOCK/ACQUISITION` | 취득 기간·완료 보고 분리 후보 | `NOT_APPROVED` |
| 22 / [`2020039`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020039) | `/api/tsstkDpDecsn.json` | 자기주식 처분 결정 | `TREASURY_STOCK/DISPOSAL` | 목적·상대방·기간 근거 후보 | `NOT_APPROVED` |
| 23 / [`2020040`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020040) | `/api/tsstkAqTrctrCnsDecsn.json` | 자기주식취득 신탁계약 체결 결정 | `TREASURY_STOCK/TRUST` | 신탁 기간·취득 실행 분리 후보 | `NOT_APPROVED` |
| 24 / [`2020041`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020041) | `/api/tsstkAqTrctrCcDecsn.json` | 자기주식취득 신탁계약 해지 결정 | `TREASURY_STOCK/TRUST` | 해지와 취득 결과 혼동 금지 | `NOT_APPROVED` |
| 25 / [`2020042`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020042) | `/api/bsnInhDecsn.json` | 영업양수 결정 | `BUSINESS_TRANSFER/ACQUISITION` | 계약·주총·종결 조건 분리 후보 | `NOT_APPROVED` |
| 26 / [`2020043`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020043) | `/api/bsnTrfDecsn.json` | 영업양도 결정 | `BUSINESS_TRANSFER/DISPOSAL` | 계약·주총·종결 조건 분리 후보 | `NOT_APPROVED` |
| 27 / [`2020044`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020044) | `/api/tgastInhDecsn.json` | 유형자산 양수 결정 | `ASSET_TRANSACTION/ACQUISITION` | 계약·대금·인도 필드 검토 | `NOT_APPROVED` |
| 28 / [`2020045`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020045) | `/api/tgastTrfDecsn.json` | 유형자산 양도 결정 | `ASSET_TRANSACTION/DISPOSAL` | 계약·대금·인도 필드 검토 | `NOT_APPROVED` |
| 29 / [`2020046`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020046) | `/api/otcprStkInvscrInhDecsn.json` | 타법인 주식 및 출자증권 양수결정 | `EQUITY_INVESTMENT/ACQUISITION` | 대상회사와 issuer 종목 분리 | `NOT_APPROVED` |
| 30 / [`2020047`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020047) | `/api/otcprStkInvscrTrfDecsn.json` | 타법인 주식 및 출자증권 양도결정 | `EQUITY_INVESTMENT/DISPOSAL` | 대상회사와 issuer 종목 분리 | `NOT_APPROVED` |
| 31 / [`2020048`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020048) | `/api/stkrtbdInhDecsn.json` | 주권 관련 사채권 양수 결정 | `SECURITY_TRANSACTION/ACQUISITION` | 대상 증권을 issuer common과 분리 | `NOT_APPROVED` |
| 32 / [`2020049`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020049) | `/api/stkrtbdTrfDecsn.json` | 주권 관련 사채권 양도 결정 | `SECURITY_TRANSACTION/DISPOSAL` | 대상 증권을 issuer common과 분리 | `NOT_APPROVED` |
| 33 / [`2020050`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020050) | `/api/cmpMgDecsn.json` | 회사합병 결정 | `M_AND_A/MERGER` | 주총·반대의사·채권자·효력 분리 | `NOT_APPROVED` |
| 34 / [`2020051`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020051) | `/api/cmpDvDecsn.json` | 회사분할 결정 | `M_AND_A/DEMERGER` | 방식·신설/존속 법인 귀속 검토 | `NOT_APPROVED` |
| 35 / [`2020052`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020052) | `/api/cmpDvmgDecsn.json` | 회사분할합병 결정 | `M_AND_A/DEMERGER_MERGER` | 합병·분할 단계별 일정 검토 | `NOT_APPROVED` |
| 36 / [`2020053`](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020053) | `/api/stkExtrDecsn.json` | 주식교환·이전 결정 | `M_AND_A/SHARE_EXCHANGE` | 기준일·명부·반대의사·효력 분리 | `NOT_APPROVED` |

`NOT_APPROVED`는 일정이 없다는 뜻이 아니라, date-field mapping·unit/meaning validation·원문 대조·권리·정정 fixture 승인을 아직 완료하지 않았다는 뜻이다. 각 row는 guide snapshot hash/as-of, 실제 endpoint, field 전체 집합과 nullable/placeholder/단위/date semantics, taxonomy mapping 또는 `NO_DATE_FIELD`, filing `rcept_no` 해소 규칙, correction/withdrawal coverage, 권리, 대표·경계·정정 fixture와 reviewer를 가져야 한다. row의 guide ID 집합은 공식 목록 36개와 정확히 같아야 하며 누락·중복·미분류가 있으면 해당 DS005 범주 coverage는 `UNKNOWN`, 그 범주 event/date 공개는 차단한다.

#### DS005 투자자 기능 우선순위 제안

아래 우선순위는 공개 제품에서 어떤 유형을 먼저 검토할지 정하는 기획 제안이다. 공식 DART 분류나 호재·악재 판정, 데이터 사용 권리, 구현 승인과 다르다. 모든 유형은 filing 전체 및 정정·당사자·종목 적격성을 별도로 검증하며, 각 유형의 방향성은 자동으로 `POSITIVE`에 고정하지 않는다.

| 기획 tier | 우선 검토할 guide ID | 사용자 문제와 우선 사유 | 1차 검토 결과물 | 승격 선행조건 |
|---|---|---|---|---|
| `T0_CAPITAL_AND_DILUTION` | 2020023~2020026, 2020033~2020035, 2020037 | 신주·감자·전환/교환/조건부자본증권은 기존 주주 지분, 발행주식 수, 자금조달 조건 및 거래 가능성에 직접 영향을 줄 수 있음 | 증권 종류별 수량·비율·가격/이자·청약/납입·효력·상장 후보 일정을 사실 ledger에 분리하고 희석/조건부 위험 검토 | guide 전체 field semantics, 본문·정정 reconciliation, 희석 계산 단위 검증, common/비보통주 분리, 권리와 독립 review 승인 |
| `T1_CORPORATE_ACTION_AND_ASSET` | 2020042~2020053, 2020038~2020041, 2020018 | 합병·분할·영업/자산/지분 양수도·자기주식은 대상 당사자와 존속/양수/양도 주체가 달라 귀속·조건·일정 혼동 위험이 큼 | filing party와 모든 직접 당사자/상장 subject crosswalk, 주총·기준일·반대의사·거래/효력일의 독립 assertion, 거래조건·선행 조건 및 상쇄 근거 | 안정 entity/instrument ID, 직접 영향 근거, 다중 subject 및 정정 fixture, 공식 field와 원문 일치 검토 |
| `T1_DISTRESS_AND_OPERATING_RISK` | 2020019~2020022, 2020027, 2020036, 2020028 | 부도·영업정지·회생·해산·워크아웃·소송은 투자손실 또는 사업 지속성 위험과 연결될 수 있으나 상태·절차·결과의 법적 의미를 과장할 수 있음 | 절차 단계/신청·결정·개시·중단 구분, 관할/상대방, 원문상 조건·기한·결과와 불확실성을 별도 표시 | 법률 용어 taxonomy, 신청과 인용/확정 결과 구분 fixture, 최신 후속 공시/정정 reconciliation, reviewer sign-off |
| `CONDITIONAL_OR_OUT_OF_SCOPE` | 2020029~2020032 해외상장 계열 | 해외 시장 상장/폐지는 국내 종목의 직접 영향이 확인되지 않으면 국내 투자자에게 연결할 수 없으며, 실제 번호와 표 순서로 해석해야 함 | 국내 상장 common에 대한 직접 권리·현금흐름·자산·의무 영향이 확인된 경우만 subject 후보, 그 외 `NOT_APPLICABLE` 또는 격리 | 국내 instrument와 직접 연결하는 공식 원문 근거, 잘못된 해외 security 귀속을 거부하는 fixture |

`T0/T1`은 개발 착수 순서가 아니라 review fixture와 field inventory 작성 순서다. P1 권리 결정을 통과하지 않은 유형은 API 호출·저장·분석·공개로 승격하지 않는다. 별도 제품 가치 검증에서 우선순위를 바꾸려면 사용자 질문(희석, 일정, 법적 위험, 사업 영향)별 성공 기준과 대표 사용자 검토를 decision revision으로 남긴다.

#### T0 자금조달·지분희석 검토 계약

목표는 “공시가 주가에 미칠 방향” 예측이 아니라, 공시에 기재된 증권·주식 수·조건을 기존 주식 기준과 혼합하지 않고 사용자가 확인할 수 있게 비교하는 것이다. OpenDART 유상증자 가이드는 보통주 신주수(`nstk_ostk_cnt`), 기타주식 신주수(`nstk_estk_cnt`), 증자 전 보통주/기타주식 발행총수(`bfic_tisstk_ostk`, `bfic_tisstk_estk`), 자금사용 목적별 금액, 증자방식 및 접수번호를 각각 정의한다. 이 값들은 filed input의 추출 후보이며, 실제 발행/납입 완료나 최신 발행주식수의 증명이 아니다.

| 분석 표시 | 허용 계산/표현 | 필수 동일 기준 | 계산 중단·보류 조건 |
|---|---|---|---|
| 공시상 보통주 발행 전후 수량 | 원문/structured field의 증자 전 보통주 발행총수 `S0`, 계획 보통주 신주수 `N`을 각기 원문값으로 표시. 계획 후 단순 발행총수 `S0+N`은 동일 class·revision의 기계적 합계로만 별도 표기 | 같은 filing revision, 동일 보통주 종류, 주식 단위, 기준 시점 및 원문 대조 | `S0`는 발행총수이며 유통주식수/자기주식 제외 분모가 아니다. 기준일·정정 lineage 불명, class 불일치, 값 충돌이면 `UNRESOLVED` |
| 비참여 기존 보유자의 단순 지분 비율 변화 | 실제 기준일의 보통주 발행총수 `S0`에서 같은 시점 자기주식 `T0`를 뺀 `O0=S0-T0`를 지분 분모로 쓸 수 있을 때, 계획 발행 전 `H/O0`, 전량 발행 후 `H/(O0+N)`을 조건부 scenario로 비교. 신규 발행 비중은 `N/(O0+N)` | `S0`, `T0`, 계획 신주수 `N` 및 보유수량 `H`가 같은 기준 시점·같은 보통주 class에 맞아야 함 | `T0` 누락/시점 불일치, 권리배정·실권·제3자 배정, 발행 취소/변경, 보유수량 미확인 시 개인 지분 변화 계산 금지. `S0`만 있으면 issuance fact만 제공 |
| 기타주식/우선주 발행 | 공시상 별도 주식 종류와 수량으로 표시 | 해당 class의 권리·의결권·전환성 등 원문 근거 | 보통주 수량에 더하거나 common shares로 환산하지 않음. 전환권/참가권 불명은 `UNRESOLVED` |
| 전환사채·신주인수권부사채·교환사채·조건부자본증권 | principal, coupon/interest, 만기, 청약·납입, 전환/행사 가격·비율, 기간·조정조건 등 확인 가능한 조건을 claim으로 분리. 완전 희석 수량은 조건별 scenario로만 표시 | 발행조건 revision, underlying/security class, 산식에 필요한 가격·비율·기간·조정 조항 및 기준주식 수 | 시장가격이나 미래 전환을 가정한 단일 확정 수치 금지. 상·하한/리픽싱/조기상환/행사 제한·교환 대상 또는 발행가능주식 수 미확인 시 해당 scenario를 계산하지 않음 |
| 조달 금액과 사용 목적 | 공식 필드의 목적별 금액을 통화와 함께 나열하고 목적 미분류/기타 금액을 분리 | 같은 revision, currency KRW 및 목적 분류, 총액과 구성 합계 reconciliation | 총 발행금액·순유입액·수수료·실제 조달/사용 완료를 서로 대체하지 않음. 구성 합계가 총액과 불일치하면 차액을 숨기지 않고 보류 |
| 감자·주식병합/분할 | 주식 수의 기계적 변환/감소와 거래가격 조정 정보를 서로 다른 사실로 표시 | 승인·효력·매매개시 시점, 병합/분할 비율, 기준 share class와 전후 주식 수 | 기계적 주당 가격 조정을 투자수익률·가치 변화로 계산하지 않음. 기준 수량 또는 거래 시점 미확인 시 계산 불가 |

출력은 `AS_FILED_FACT`, `CONDITIONAL_SCENARIO`, `NOT_COMPUTABLE`, `UNRESOLVED`를 구분한다. 계산값마다 input claim ID·source locator/hash·단위·기준일·산식·가정·rounding rule·reviewer를 기록한다. 원문에 값이 없거나 structured API와 원문이 다르면 추정값으로 보충하지 않고 source-level conflict를 노출한다. `N/(O0+N)`은 확인된 자기주식 제외 보통주 기준에서 신주가 모두 발행된다는 가정의 발행 후 비중이며 EPS 감소율·주가 하락률·기존 보유자의 실제 손익 또는 공정가치 평가가 아니다. 발행 조건과 배정에 따라 기존 보유자의 실제 지분 변화는 다를 수 있다.

최소 gold fixture는 보통주+기타주식 동시 발행, 구주 발행수 기준일 불일치, 유상/무상 혼합, 제3자배정과 주주배정, 실권/배정 변경, 발행 취소·정정, 전환가 리픽싱/상하한/조기상환, BW/EB underlying 차이, 자금목적 합계 mismatch, 감자/병합의 기계적 조정, treasury stock 포함 여부 불명, API/body conflict를 포함한다. 전체 기준주식 분모는 filing의 당시 발행총수와 별도 최신 공식 instrument/master snapshot으로 대조하며 두 값의 시점을 동일하다고 가정하지 않는다. 이 계약은 계산 신뢰도·권리·taxonomical/subject 승인이 없으므로 `KR-DART-RIGHTS-01`, `KR-TAXONOMY-01`, `KR-MASTER-SNAPSHOT-01`, `KR-ANALYSIS-REPRO-01`, `KR-END-TO-END-ACCEPTANCE-01` 통과 전 UI 숫자 공개/자동 투자점수화를 허가하지 않는다.

#### 자금조달 lifecycle와 사용자 표시

각 시점의 공시는 한 이벤트의 mutable status field를 덮는 방식이 아니라 immutable `EventRevision`·`FactClaim`·`EventDateAssertion`으로 연결한다. 아래 lifecycle은 제품 표시 후보이며 새 상태 taxonomy 승인은 아니다. 이미 지난 청약/납입/예정일은 완료 evidence로 사용할 수 없고, 종료·철회·조건확정은 해당 사실을 말하는 최신 권한 있는 근거가 필요하다.

| 단계 후보 | 화면에 표시할 수 있는 내용 | 필요한 근거/처리 |
|---|---|---|
| 결정/발행 계획 공시 | 공시 당시 계획 신주수·증권 종류·예정 일정·자금목적을 “공시 기준 계획”으로 표시 | 결정 filing revision 및 해당 field source. 발행 완료/자금 유입으로 표현 금지 |
| 조건 변경·정정 | 이전 값과 새 값을 나란히 보여 주고 현재 유효 주장 후보 및 미해결 충돌을 표시 | 정정 marker만으로 연결 확정 금지. exact receipt/원문 관계 검토 후 새 revision; 이전 계산을 보존하고 새 입력으로 재산출 |
| 청약/배정 결과 보고 | 신청·배정·실권·최종 배정 수량을 종류별로 표시하되 납입 여부와 분리 | 결과를 보고한 filing의 정확한 locator/revision. `계획 신주수`를 결과 수량으로 재사용하지 않음 |
| 납입/발행 완료 보고 | 납입 보고액과 실제 발행/등록 확인 수량을 각각 분리 표시. 완료 근거가 확인된 입력만 실제치 배지 후보 | 해당 후속 결과 보고 또는 권한 있는 공식 확인. 청약 결과만으로 납입/발행 완료를 추정하지 않음 |
| 취소·철회·미실행 | 계획/예정 수치와 일정은 역사값으로 남기고 active forecast에서 제외 또는 취소 상태를 표시 | 철회·취소·미실행의 명시 근거와 정정 관계. 시간이 지났거나 후속 공시가 없다는 사실만으로 `CANCELLED` 금지 |
| 후속 상태 미확인 | 마지막 공시 시점과 “이후 실행 여부 미확인”을 병기 | 마지막 reconciliation 시점, 검색 범위/coverage 상태. 결과 부재를 `COMPLETED`, `CANCELLED` 또는 “미발행”으로 변환 금지 |

공개 카드의 최소 정보 구조는 (1) 최신 승인된 공시 revision과 접수시각, (2) `공시 계획`·`정정/확정 보고`·`완료 보고` 각 값의 출처/시점, (3) planned vs confirmed/actual 숫자 비교와 산식/분모, (4) 주요 일정 종류와 certainty/status, (5) 이행/후속 보고 여부 및 최신 reconciliation 시각, (6) 불일치·권리·identity 등 숨김/보류 이유다. 계획 값만 존재하면 상태를 완료처럼 시각적으로 강조하지 않고 실제값 칸은 `NOT_REPORTED` 또는 `UNKNOWN`으로 둔다.

후속 revision은 의존 계산의 fingerprint를 바꾼다. 계산 결과가 바뀌면 이전 승인·publication은 자동 승계하지 않고 변경된 input/계산 diff를 reviewer queue에 넣는다. 보유주식/발행주식 기준일이 달라진 경우 보유지분 비교를 무효화하며, `S0`, 자기주식 `T0`, 신주 `N` 중 하나라도 새 revision에서 결측/상충이면 기존 수치를 stale 표시하고 최신 계산 결과를 `NOT_COMPUTABLE`로 낮춘다. 과거 계산을 새 사실로 덮지 않으며, 최신 공개 projection은 한 snapshot에서 event revision, claims, dates, publication decision이 일치할 때만 읽는다.

#### 사건 후속 확인 큐와 사용자 구독 제안

현재 `investment_calendar_events`는 source/external ID로 일정을 저장하고 `user_watchlist`는 사용자별 market/code만 저장한다. 두 구조 모두 event revision에 대한 follow-up action, 사용자별 구독, 확인 응답이나 알림 중복 제거 상태를 제공한다고 볼 근거는 없다. 따라서 다음 설계에서는 **내부 검토 큐**(데이터 신뢰도/후속 원문 확인)와 **사용자 구독 알림**(관심 event 상태 변화)을 별도 actor·저장 수명·권한으로 취급한다. 사용자가 큐 항목을 확인/숨김 처리해도 event lifecycle·실제 완료·종목 보유를 의미하지 않는다.

| 트리거 | 내부 검토 큐 action | 사용자에게 제공 가능한 신호 | 자동 완료 금지 |
|---|---|---|---|
| 확인된 일정이 다가옴 | 해당 날짜 assertion/revision과 source coverage를 재확인 | 사용자 opt-in 시 확정 일정 알림. date-only는 날짜만, timezone 없는 local time은 시각 푸시 금지 | 알림 발송이나 열람을 사건 진행/완료로 처리하지 않음 |
| 회사/등록기관 추정 일정이 다가옴 | `ESTIMATE_RECHECK`로 원천 상태·새 공시 확인 | “추정 일정 재확인”으로 표시하고 추정 출처/as-of를 병기 | 추정일을 확정 일정, countdown deadline, positive catalyst로 승격 금지 |
| 확정 일정/납입·청약일 경과 | `OUTCOME_NOT_VERIFIED`로 결과 공시/원천 조회; coverage scope와 마지막 성공시각 기록 | 후속 보고 미확인 또는 source 조회 상태가 사용자에게 중요할 때만 별도 상태 표시 | 날짜 경과·피드에서 결과 미발견만으로 `COMPLETED`/`CANCELLED` 금지 |
| 정정·철회·첨부 교체·조건 변경 감지 | 영향 event/date/claim 계산을 재실행하고 독립 reviewer에게 revision diff 전달 | 기존 구독 event가 바뀌거나 가려진 경우 변경/검토 중 알림 후보 | 이전 일정·수량·분석 승인을 새 revision으로 자동 승계 금지 |
| 자금조달 결정 공시 후 청약/배정/납입/발행 결과가 미확인 | revision에 필요한 후속 stage를 `FINANCING_OUTCOME_CHECK`로 추적 | 계획 값과 결과 미확인을 구분하고 실제 완료로 표시하지 않음 | 계획수량을 결과수량으로 복사하거나 후속 공시 부재를 미실행으로 단정 금지 |
| rights/master/cap/coverage evidence 만료 또는 conflict | 해당 event/subject를 fail-closed하고 `EVIDENCE_REVIEW` 재검토 생성 | 정보 보류 사유/최종 확인시각을 노출하는 UX 검토 | 과거 공개값을 최신값처럼 유지하거나 reviewer 확인 없이 gate 해제 금지 |

##### 일정 알림 candidate·발송 예약의 fail-closed 계약

일정 알림 fixture [`event-schedule-notification.v0.json`](../fixtures/disclosure/event-schedule-notification.v0.json)의 `ESN-01`–`ESN-18`은 구독/발송 eligibility·fencing·idempotency, 잠금 화면 최소 공개·오래된 링크의 현재 권리 재검증과 outcome follow-up의 유한 종료 계약을 다룬다. 실제 provider request/receipt·attempt ledger·메시지 수정/회수는 [`correction-delivery-reconciliation.v0.json`](../fixtures/disclosure/correction-delivery-reconciliation.v0.json)의 책임이다.

알림 candidate는 (a) 권리·identity·coverage·publication gate를 통과한 event revision 및 date assertion, (b) 목적별 사용자 opt-in과 유효 subscription revision, (c) versioned reminder policy, (d) 표시할 수 있는 precision/timezone을 모두 확인한 뒤 만든다. watchlist 등록은 알림 구독이 아니며, 일반 event 구독, 확정 일정 reminder, 추정 일정 recheck, 결과 미확인 상태 변화는 서로 다른 opt-in 및 `notificationKind`로 분리한다. `ACKNOWLEDGED/DISMISSED/SNOOZED`는 해당 사용자 구독/delivery에만 영향 주고 event/date 상태를 바꾸지 않는다.

예약 key의 논리 identity는 `recipientScopeId + subscriptionRevision + eventRevisionId + dateAssertionId + reminderPolicyRevision + notificationKind + channel + scheduledFor + timezone + publicationEpoch`의 canonical tuple로 제안한다. 결과 후속의 key에는 여기에 `outcomeCheckRevisionId + followupSequence`를 추가한다. 각 예약 worker는 dispatch 직전에 현재 epoch, assertion 승인/현재성, rights/channel 결정, opt-in/구독 상태, 사용자 account 상태를 다시 검증한다. 날짜 assertion 또는 epoch가 바뀌면 구 예약은 `STALE_SUPPRESSED`로 종결하고, 새 일정의 재계산/재발송은 동일한 eligibility gate를 다시 통과해야 한다. 같은 scheduler run 반복은 logical candidate 중복을 만들지 않지만 외부 전송 시도 결과 자체는 append-only attempt로 보존한다.

`DATE` precision은 해당 날짜라는 사실만 표현하며 특정 시각 push를 만들지 않는다. `LOCAL_DATE_TIME`은 사용자의 locale이 아니라 source가 말한 local timezone과 사용자 알림 timezone을 각각 보존해야 한다. DST 중복/존재하지 않는 현지 시각, quiet hours, 날짜-only의 기본 전달 시각, missed scheduler의 catch-up/burst 정책은 owner가 versioned policy로 승인하기 전 자동 변환·대량 지연발송을 하지 않는다. 날짜가 지난 뒤 outcome이 확인되지 않은 경우 “완료/취소” 알림을 만들지 않고 `OUTCOME_NOT_VERIFIED` 사실로 분리한다.

결과 미확인 follow-up은 확정 일정 reminder와 별도 opt-in이어야 한다. 승인된 outcome follow-up policy에는 `maxAttempts`, 최소 재확인 간격, cutoff, 요구 source coverage, opt-in scope를 포함하며 하나라도 미정이면 새 candidate 생성은 `HOLD_FOR_POLICY`다. 제품의 재알림 간격·횟수·cutoff를 fixture가 정하지 않는다. logical key에는 outcome check revision과 follow-up sequence를 포함해 scheduler 재실행을 멱등화하고, 외부 provider 시도는 attempt ledger에 append-only로 기록한다.

결과 검색에서 아무 문서도 찾지 못한 사실은 coverage 상태와 결합한다. 요구 source/page/window를 완전 조회했을 때만 `OUTCOME_NOT_REPORTED_IN_COMPLETE_SCOPE`; partial/error/expired coverage면 `UNVERIFIABLE_COVERAGE_INCOMPLETE`, 서로 상충하는 근거가 있으면 `CONFLICT_UNRESOLVED`다. 둘 다 실제 완료/취소의 증명은 아니다. 승인된 결과 evidence가 연결되면 그 follow-up cycle만 종료하고 queued 알림을 억제한다. canonical event lifecycle은 별도 reviewer 결정 없이 자동 변경하지 않는다. ESN-13–ESN-18은 [`event-schedule-notification.v0.json`](../fixtures/disclosure/event-schedule-notification.v0.json)의 합성 조건이며 실제 source 검색/coverage를 증명하지 않는다.

이 fixture는 발송시각·quiet hour·재알림 횟수·catch-up window·일일 발송량의 실제 제품 정책이나 운영 값이 정해졌다는 뜻이 아니다. 해당 값과 개인 데이터 보존, 사용자별 timezone 동의 범위는 `KR-DOCUMENT-UX-01`, `KR-OPERATIONAL-SECURITY-01`, `KR-RETENTION-01`의 owner 결정 전 미정이다.

#### 유형별 후속 확인 case와 완료 증거 제안

후속 작업의 목적은 “일정이 지났는가”를 체크하는 것이 아니라, 투자자가 처음 읽은 공시의 **계획·조건·대상 종목**과 실제로 확인된 후속 사실 사이의 간극을 측정하는 것이다. 하나의 `FollowUpCase`는 단일 date row가 아니라 `event revision + 대상 claim 집합 + 기대되는 후속 증거 종류 + source search scope`를 묶는다. 아래 event kind는 초기 우선 fixture 계열 제안이며, taxonomy 결정 전 자동 event 분류·공개 기능으로 간주하지 않는다.

| event family / 투자자 질문 | 후보 확인 단계·evidence type | 확인 결과를 닫을 수 있는 최소 증거 | 닫지 못하는 흔한 불충분 신호 | 사용자에게 남길 상태 후보 |
|---|---|---|---|---|
| 유상/무상증자: 계획한 주식·자금조달이 어떤 조건으로 얼마나 실행됐나? | `TERMS_CORRECTION`, `SUBSCRIPTION_RESULT`, `ALLOTMENT_RESULT`, `PAYMENT_CONFIRMATION`, `ISSUANCE_OR_LISTING_CONFIRMATION`, `CANCELLATION` | 동일 event/issuer/security class/정정 lineage의 권한 있는 후속 filing에서 배정·실권·납입·발행 단계를 각각 직접 확인. 실제 유통 가능/상장 주장은 해당 거래소의 효력·거래 개시 자료 추가 확인 | 청약 수요, 이사회 계획, 납입 예정일 경과, 총 신주 계획수, 거래소 일정 한 건만으로 발행 완료를 주장 | `PLANNED`, `TERMS_CHANGED`, `SUBSCRIBED_NOT_PAID`, `PAID_ISSUANCE_UNCONFIRMED`, `ISSUED_LISTING_UNCONFIRMED`, `CONFIRMED`, `OUTCOME_NOT_VERIFIED`, `CANCELLED_CONFIRMED` |
| CB/BW/EB 등 전환·교환/조건부 증권: 실제 자금 유입과 잠재 common-share 변화는? | `ISSUANCE_TERMS_FINAL`, `SUBSCRIPTION_ALLOCATION`, `PAYMENT_ISSUANCE`, `CONVERSION_EXERCISE`, `REDEMPTION_REPURCHASE`, `MATURITY_SETTLEMENT`, `LISTING_CONFIRMATION` | 실제 발행 규모는 발행/납입 후속 evidence; 잠재 또는 실현 주식 수는 행사·전환 공시의 security class, 수량/가격, 조정조건, 기준시점 직접 근거; 상장 여부는 별도 확인 | 공시 한도의 전량 발행/전환을 가정, 예정 전환가로 확정 희석량 계산, 만기일 도래를 상환·미전환 증거로 사용 | `TERMS_PENDING`, `ISSUED_CONVERSION_POTENTIAL`, `PARTIALLY_CONVERTED`, `REDEEMED_CONFIRMED`, `MATURITY_OUTCOME_UNVERIFIED`, `DILUTION_BASIS_INCOMPLETE` |
| 합병/주식교환/분할: 승인·반대·효력·거래의 각 문턱이 통과됐나? | `SHAREHOLDER_APPROVAL`, `APPRAISAL_RIGHTS_WINDOW`, `REGULATORY_CONDITION`, `EFFECTIVE_DATE_CONFIRMATION`, `SUCCESSION_OR_LISTING`, `TERMINATION` | 주총 결과 및 비율/대상, 법정·계약 선행조건, 효력 발생, 존속/신설 issuer와 증권 처리·거래개시를 사건별 공식 자료로 분리 확인 | 계약 체결, 예정 효력일, 한 당사자 승인만으로 transaction close 또는 구 ticker 거래 종료·신 ticker 상장을 주장 | `AGREED_CONDITIONAL`, `APPROVALS_PARTIAL`, `CONDITIONS_PENDING`, `EFFECTIVE_UNCONFIRMED`, `CLOSED_CONFIRMED`, `TERMINATION_CONFIRMED`, `IDENTITY_TRANSITION_UNRESOLVED` |
| 대규모 자산/사업/타법인 주식 양수도: 대금·이전·조건 선행절차가 끝났나? | `CONDITIONS_PRECEDENT`, `PAYMENT_SETTLEMENT`, `TRANSFER_REGISTRATION`, `ASSET_CONTROL_TRANSFER`, `TERMINATION` | 계약별 선행조건 완료, 실제 대금 지급/수령 및 소유·지배 이전을 주장하는 권한 있는 공식 자료. 발행사와 자산/대상 법인의 역할 구별 | 계약 금액을 매출/순현금/실제 유입으로 표현, 목표 closing date 경과로 완료 간주, 대상 회사 ticker를 자동 영향 subject로 지정 | `AGREED_NOT_CLOSED`, `CONDITION_UNVERIFIED`, `SETTLEMENT_PARTIAL`, `TRANSFER_UNCONFIRMED`, `CLOSED_CONFIRMED`, `OUTCOME_NOT_VERIFIED` |

CB/BW/EB 후속 case는 세 상품을 하나의 “잠재 희석주식” 산식으로 합치지 않는다. [OpenDART 전환사채 결정 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020033)의 `cv_prc`, `cv_rt`, `cvisstk_knd`, `cvisstk_cnt`, 전환청구기간, 리픽싱 하한·기준 및 잔여한도는 결정 filing에 기재된 조건 claim이다. 이 값만으로 사채의 실제 발행·전환 또는 현재 유효 전환가를 확정하지 않는다. 실제 전환은 해당 tranche의 전환 결과와 전환된 주식 종류·수량 근거를 따로 요구한다.

[OpenDART BW 결정 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020034)의 사채 원금·이자·만기와 `ex_rt`, `ex_prc`, `ex_prc_dmth`, 분리 여부, 신주 종류·수량·행사기간 및 가격조정 조건은 서로 다른 claim이다. 분리형 BW에서는 사채 잔액과 워런트 잔액/행사 결과를 별도 추적한다. 행사 청구는 대금 납입과 실제 신주 발행을 대신하지 않으며, 행사비율·가격만으로 행사가 완료됐다고 표현하지 않는다.

[OpenDART EB 결정 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020035)의 교환 대상 종류 `extg`, 대상 수량과 비율, 교환청구기간은 교환 조건이다. 대상 주식이 발행사의 자기주식·기보유 주식인지, 제3자 보유 주식인지, 새로 발행되는 주식인지 근거가 불충분하면 주식 공급 경로를 미확정으로 둔다. 기존 발행주식의 교환/이전은 신주 발행과 구분하며 자동 희석 수량에 더하지 않는다. 세 가이드의 구조화 응답은 일부 항목 제공이며 원문·정정·후속결과의 완전성을 보증하지 않으므로 결과 부재, valid-empty 또는 검색 미완료는 “미전환/미행사/미상환” 사실이 아니다.

독립 합성 벡터 [`convertible-securities.v0.json`](../fixtures/disclosure/convertible-securities.v0.json)은 CB 일부 전환, BW 분리와 행사/납입, EB 기존주식 대상, 리픽싱·증권종류 미확인, tranche 혼동, 정정관계 미해결, 만기 후 결과 미확인, scope 미완료 및 snapshot 불일치를 나눈다. 현재 OpenDART DS005 caller 또는 이 결과를 위한 runtime collector가 확인된 것은 아니며, 벡터는 runtime acceptance나 투자자 공개 권한이 아니다.

Fixture acceptance 분모는 `FUCS-01-CB-TERMS-ONLY`, `FUCS-02-CB-PARTIAL-CONVERSION`, `FUCS-03-CB-RESET-TERMS-UNRESOLVED`, `FUCS-04-CB-UNDERLYING-CLASS-UNKNOWN`, `FUCS-05-BW-BOND-WARRANT-SEPARATE`, `FUCS-06-BW-EXERCISE-NOT-ISSUANCE`, `FUCS-07-BW-RESET-FLOOR-UNKNOWN`, `FUCS-08-EB-EXISTING-SHARES`, `FUCS-09-EB-TARGET-OWNERSHIP-UNKNOWN`, `FUCS-10-TERMS-CORRECTION-UNRESOLVED`, `FUCS-11-VALID-EMPTY-NO-OUTCOME`, `FUCS-12-PARTIAL-COVERAGE`, `FUCS-13-MATURITY-NOT-SETTLEMENT`, `FUCS-14-SECURITY-TRANCHE-MISMATCH`, `FUCS-15-SNAPSHOT-MISMATCH`로 고정한다.

#### OpenDART CB/BW/EB 결정 조건과 후속결과 분리

| family / OpenDART DS005 endpoint | 조건 filing에서 확인할 필드 예 | 이 값이 직접 증명하지 않는 것 | 후속 수용 기준 |
|---|---|---|---|
| CB `/api/cvbdIsDecsn.json` (2020033) | `bd_fta`, `bd_mtd`, `cv_rt`, `cv_prc`, `cvisstk_knd`, `cvisstk_cnt`, `cvisstk_tisstk_vs`, `cvrqpd_bgd`/`cvrqpd_edd`, `act_mktprcfl_cvprc_lwtrsprc`, `act_mktprcfl_cvprc_lwtrsprc_bs`, `rmislmt_lt70p` | 실제 인수·납입·전환·현재 유효 reset 가격·현재 보통주 class. 잠재 전환주식 수는 실행 결과가 아님 | tranche/revision/원문 근거 일치, 실제 전환 claim의 종류·수량 확인. 전환 전 잠재량은 조건부 scenario로 분리 |
| BW `/api/bdwtIsDecsn.json` (2020034) | `bd_fta`, `bd_intr_ex`, `bd_mtd`, `ex_rt`, `ex_prc`, `ex_prc_dmth`, `bdwt_div_atn`, `nstk_pym_mth`, `nstk_isstk_knd`, `nstk_isstk_cnt`, `nstk_isstk_tisstk_vs`, `expd_bgd`/`expd_edd` 및 가격조정 필드 | 워런트 행사청구만으로 대금 납입 또는 신주 발행. 사채 상환만으로 warrant 취소. 분리형 사채와 워런트가 하나의 balance라는 주장 | bond principal balance와 warrant/exercise balance 분리; 행사청구→납입/결제→주식 발행 단계를 각기 확인 |
| EB `/api/exbdIsDecsn.json` (2020035) | `ex_rt`, `ex_prc`, `ex_prc_dmth`, `extg`, `extg_stkcnt`, `extg_tisstk_vs`, `exrqpd_bgd`/`exrqpd_edd` | 교환 대상이 새 주식이라는 주장, issuer 보유/자기주식이나 제3자 기존주식의 소유관계, 교환 완료 | 대상 종류·소유 경로와 실제 이전/교환 근거 확인; 신규 발행 증거가 없으면 신주희석 합계에서 제외하고 교환 노출은 별도 표시 |
세 API는 `corp_code`와 접수일 구간 기반 구조화 조회이며 접수번호는 source locator일 뿐, 세 API의 결과를 포괄하는 정정 lineage 또는 전체 후속공시 검색을 보증하지 않는다. `cvisstk_cnt`, `nstk_isstk_cnt`, `extg_stkcnt`는 각각 CB 전환대상/BW 신주대상/EB 교환대상이라는 field 의미를 지키고 서로 같은 종류의 발행주식으로 정규화하지 않는다. quantity가 있어도 종류·기준일·단위·revision·tranche 근거가 다르면 합산/비교 금지한다. fixture 판정은 case 단위이며 issuer가 동일하다는 사실만으로 증권 tranche·조건·후속 결과를 연결하지 않는다.

#### CB/BW/EB 후속 evidence source map 제안

OpenDART DS005 3종은 **발행 결정 조건 source**로 두고 실제 행사/교환의 주 source는 거래소 시장공시의 해당 행사 보고로 분리한다. KRX 공식 KIND에 `전환청구권 행사(70109)`, `신주인수권행사(70114)`, `교환청구권 행사(70119)`, 통합 `전환청구권·신주인수권·교환청구권 행사` 양식 사례가 관찰된다. 이는 공식 KIND 공시 양식 및 실제 공개 문서의 field shape 근거이지, KIND의 전체 API·검색 완전성 계약이거나 모든 상장사가 동일 제출형식을 사용한다는 보장은 아니다.

| 주장할 단계 | 우선 source/evidence 후보 | 허용되는 판정 범위 | 추가로 확인해야 할 것 |
|---|---|---|---|
| 권리 조건 | OpenDART DS005 발행 결정과 최신 조건변경/정정 원문 | 회차, security terms, 예정 행사·전환가능 수량 | correction relation, tranche, 조건 변경 chronology; DS005 요약값과 원문 conflict |
| 권리 행사 보고 | KRX 행사 공시의 회차/종류, 청구·행사일, 청구금액·행사가/전환가·교환가, 보고 주식 수, 관련 공시 및 행사 후 잔액 | “이 행사 보고에 이 금액/주식 수가 기재됨” 및 해당 보고 시점의 잔액 주장 | 공시 receipt identity/dedup, daily detail과 공시 집계 합, 이전 notice와 중복 여부, 신고주식총수 분모의 기준시점 |
| 신주 발행·납입 | 행사 보고 + 발행/전자등록·납입 또는 사채말소 증거 및 일치하는 후속 자료 | 해당 class 수량의 발행/자본 반영 사실. BW 현금납입과 사채대용납입을 별도 settlement로 처리 | 발행일/효력, 현금 입금 또는 사채 말소, 주식 class, 발행자, 해당 회차/행사량 일치 |
| 거래소 추가상장 | 별도 KRX 추가상장 notice의 class·수량·거래개시일 | 일치 수량의 상장/거래 가능 단계 확인 | `상장예정일`은 예정값. 변경/정정, actual listing notice 및 행사 보고 수량과 match |
| EB 기초주식 교부 | 행사 보고 + 자기주식 처분/결과 또는 보유자·수탁/예탁 이동의 공식 확인 | 실제 교환수량 및 출처가 확인된 기존 주식의 이전 | issuer treasury인지 third-party holding인지, 기초 issuer와 bond issuer, 신주 발행 여부, treasury release 후 유통가능 물량 |
| 잔액·미행사 상태 | 행사 후 잔액을 명시한 회차별 행사보고 또는 최신 정기보고서 보조 확인 | 그 source의 as-of 시점에 보고된 잔액 | 과거 snapshot과 섞지 않기, 동일 회차·통화·원금/권리수량 단위, 이후 취득·소각·상환 event coverage |

#### 행사 notice와 별도 추가상장 notice의 수량 reconciliation 제안

KRX 추가상장 공시는 행사 notice와 별도 source record로 취급한다. [KRX 추가상장 업무해설서](https://kind.krx.co.kr/external/dst/reference/10827/%EC%9C%A0%EA%B0%80%EC%A6%9D%EA%B6%8C%EC%8B%9C%EC%9E%A5%20%EA%B3%B5%EC%8B%9C_%EC%83%81%EC%9E%A5%20%EC%97%85%EB%AC%B4%ED%95%B4%EC%84%A4%EC%84%9C.pdf)는 추가상장을 새로 발행한 주권을 상장하는 절차로 설명하고, KIND 행사 notice는 일별 행사수량과 변경 가능한 상장예정일을 제공한다. 예정일 동일성이나 발행사/회차/날짜 근접성만으로 두 source record를 자동 연결하지 않는다.

| reconciliation 차원 | 필수 claim/evidence | 통과 가능 결과 | 불일치·누락 처리 |
|---|---|---|---|
| 보안 identity | 정확한 issuer ID, `COMMON_STOCK` master snapshot, security class, series/tranche, corporate action-adjusted basis | same issuer/class/series가 evidence로 확정된 후보 pair | class/series/issuer mismatch 또는 instrument master unresolved면 pair `UNRESOLVED`; date proximity fallback 금지 |
| event relation | exercise line/notice에서 listing notice로 이어지는 source-supported relation과 revision lineage | 단일 또는 1:N/N:1 link graph | relation이 없거나 ambiguous면 수량이 같아도 자동 match 금지 |
| quantity scope | 행사 notice aggregate와 포함관계가 표시된 daily rows, listing notice quantity, unit 및 asOf | 각 source 내 aggregate-row reconciliation 후 cross-source linked quantity 비교 | 같은 notice aggregate와 row를 중복 합산 금지; aggregate listing notice의 per-exercise allocation은 별도 source evidence 없이는 `UNRESOLVED` |
| cardinality | immutable source row IDs, `exercise line ↔ listing item` relation IDs, each source row consumption count | 한 exercise line의 복수 listing row는 각각 한 번만 합산하고, 여러 exercise line을 묶은 listing aggregate는 listing 수량 자체를 한 번만 집계 | 한 row를 2회 소비하는 relation, unresolved fan-in/fan-out, conflicting candidate는 `QUANTITY_CONFLICT/UNRESOLVED_RELATION` |
| coverage·잔여 | listing source/scope의 completeness assertion, snapshot/asOf, known corrections/late arrivals | 관계 완전성과 수량 일치가 승인된 범위 내에서 확인됨 | 일치분이 있어도 검색 scope가 partial이면 unmatched 잔여를 “미상장” 또는 “미발행” 사실로 만들지 않는다; `UNMATCHED_OUTCOME_NOT_ESTABLISHED` |
| 정정 | exact correction relation, changed field paths/claim dependency, prior/current notice revisions | date-only correction은 date assertion만 supersede하고 수량은 동일 ID에서 1회 유지 | 정정 relation 미확정이면 최신 listing 상태 suppress; 새 receipt를 독립 수량으로 더하지 않음 |

Reconciliation 결과는 `MATCHED_FOR_DECLARED_SCOPE`, `PARTIAL_MATCH`, `UNRESOLVED_RELATION`, `QUANTITY_CONFLICT`, `COVERAGE_INCOMPLETE`, `OUTCOME_NOT_ESTABLISHED` 같은 상태 후보와 scope/hash를 제공한다. 이를 통과해도 `LISTED` 또는 거래 개시 claim은 관련 추가상장 근거에 명시되고, issuer/class/series/수량이 match된 범위까지만 확인한다. 1:N으로 나뉜 행사수량은 listing item 각각을 한 번씩 합산할 수 있다. N:1 aggregate listing notice가 여러 행사행을 가리켜도 합계 listing 수량만 확인 가능할 수 있으며, allocation evidence가 없으면 행별 배분은 계산하지 않는다. 전체 검색이 완전하다는 권리·coverage 승인 전에는 미대응 수량을 미상장으로 분류하지 않는다. 이 계약은 KRX 공개 search API의 안정성/완전성, 실제 KIND receipt relation, 발행·전자등록의 자동 확정 또는 runtime 구현을 주장하지 않는다.

추가상장 후속 검색의 coverage record logical schema는 `{sourceSurfaceAndEventCategory, issuerIdentity, securityClassAndSeriesWhenAvailable, declaredDateWindow, paginationAndProviderStatus, correctionAndLateArrivalPass, rightsDecisionScope, asOfAndQueryManifest, resultDigest}`를 가진다. 여기에는 class/series 검색 필터의 제공 여부, pagination의 기대·성공 page와 provider/error 상태, 해당 query에 적용되는 권리 결정 scope/revision, `queryManifestId`와 `asOf`가 포함된다. 실제 검색 surface/API가 안정된 schema·접근권한·검색 history를 증명하지 못하면 page 성공만으로 coverage `COMPLETE`를 선언하지 않는다. `COMPLETE` 의미는 명시한 surface/window 안의 열거 및 정정 pass에 한정하며 시장 전체에 추가상장 notice가 존재하지 않는다는 뜻이 아니다. 검색 기간/lookback, quota threshold, correction pass 횟수 및 freshness max-age는 `KR-RECONCILIATION-01`과 `KR-DART-RIGHTS-01` owner 승인 전 설정하지 않는다.

결과 상태는 기존 후속 lifecycle 어휘를 재사용한다. 승인된 declared scope의 성공적인 빈 결과는 listing stage만 `NOT_FOUND_IN_SCOPE`로 둔다. 원천을 읽었으나 해당 후속 notice에 listing claim이 재기재되지 않은 경우는 `NOT_REPORTED`; page 누락·quota/오류·권리 미승인·scope/identity 불명확은 `UNVERIFIABLE`이다. `NOT_FOUND_IN_SCOPE`와 `NOT_REPORTED` 어느 쪽도 “상장되지 않았다”, “취소됐다” 또는 최종 outcome fact가 아니다. 행사 통지 뒤 실제 listing notice가 확인되지 않으면 overall event outcome은 `OUTCOME_NOT_VERIFIED`로 유지하며, 직접적인 공식 취소/비효력 근거가 있더라도 영향을 받는 stage에 한해 독립 adjudication 전 `CANCELLED`/`NOT_EFFECTIVE`로 승격하지 않는다. `FUEV-15`–`FUEV-16`은 valid-empty와 partial/rights-blocked 검색의 이 경계를 합성 acceptance로 고정하고 `FUER-06`–`FUER-08`의 기존 후속 상태와 정합성을 유지한다.

합성 fixture [`convertible-outcome-evidence.v0.json`](../fixtures/disclosure/convertible-outcome-evidence.v0.json)의 `FUEV-11`–`FUEV-14`는 1:N 부분 합계, N:1 aggregate 및 행별 allocation 불가, partial coverage/수량 불일치의 미확정 잔여, listing correction date supersession/수량 중복 금지를 고정한다. `FUEV-15`–`FUEV-16`은 scope 제한 valid-empty와 partial/rights-unresolved search를 `NOT_FOUND_IN_SCOPE` vs `UNVERIFIABLE`로 구분하고 overall `OUTCOME_NOT_VERIFIED`를 보존한다. 각 사례는 `issuer + instrument master/class + series + source-supported relation + quantity scope + revision` 축으로 평가하며, synthetic contract는 rights-cleared actual sample이 아니다.

행사 공시의 “누계(기 신고 수량 제외)”나 “신고일 현재 행사 후 잔액”을 lifetime cumulative로 오독하지 않는다. 같은 receipt의 daily rows와 aggregate를 동시에 더하지 않고, `rcept_no + series + event role` idempotency key로 한 보고의 재수집 중복만 제거한다. 이전 행사 보고가 참조되거나 집계 기준이 모호하면 `CUMULATIVE_BASIS_UNRESOLVED`로 두고 총 행사량 합산을 차단한다. 보고된 주식 수와 예정 상장일은 행사 보고 자체를 입증할 수 있지만, 별도 상장 완료와 동일하지 않다.

발행주식 총수 분모의 포함 범위도 issuer나 CB/BW notice family 전역 기본값으로 추정하지 않는다. 2026-11-04 확인한 [CB 전환청구 사례](https://kind.krx.co.kr/external/2026/06/19/000691/20260619000912/70109.htm)는 금번 행사 누계 수량을 제외한다고, [BW 신주인수권 행사 사례 A](https://kind.krx.co.kr/external/2026/04/10/000336/20260410000790/70114.htm)는 금번 행사 수량을 포함한다고 명시했다. 추가로 [BW 신주인수권 행사 사례 B](https://kind.krx.co.kr/external/2026/03/20/001157/20260320002400/70114.htm)는 A와 같은 BW notice family임에도 금번 행사 수량을 제외한다고 적는다. 이는 CB와 BW 사이에만 있는 차이가 아니라 같은 family 안에서도 receipt별 qualifier가 다를 수 있음을 보이는 반례다. 세 문서는 행사주식수 누계 field에 “기 신고된 주식수량 제외”를 표시한다. 따라서 (1) source qualifier를 receipt/revision/locator에 귀속한 typed denominator-basis claim으로 보존하고, (2) 누계와 동일 notice의 일별 행을 서로 독립 분자로 중복합산하지 않으며, (3) 이전 notice와의 범위 관계가 확인되지 않으면 lifetime 합계가 아니라 해당 notice scope만 표시하고 total을 `UNRESOLVED`로 둔다. (4) issuer-wide 또는 notice-family-wide field mapping이나 다른 receipt의 qualifier를 전파하지 않는다. (5) 공시 표시 백분율은 `AS_REPORTED` source claim으로 보존할 수 있으나 source numerator/denominator basis와 승인된 percent rounding policy가 확인되지 않으면 재계산치를 공시상 비율처럼 제시하지 않는다. 링크와 최소 qualifier 기록은 관찰 근거일 뿐 권리/저장/재배포 승인이 아니다. 이 문서에 원문 본문이나 캡처/hash는 보존하지 않는다. 합성 경계 `FUEV-09-NOTICE-CUMULATIVE-EXCLUDES-PRIOR-FILINGS`와 `FUEV-10-ISSUED-SHARES-DENOMINATOR-INCLUSION-IS-RECEIPT-SPECIFIC`에서 family-wide assumption도 금지한다.

KRX의 자기주식 대상 EB 지침과 공시 예시는 중요한 사용자 영향 분리를 요구한다. 자기주식을 교환해 교부하면 새 주식이 발행되지 않아 **발행주식수 기준 신주희석은 없을 수 있지만**, 자기주식 감소/외부 보유 이전으로 유통 가능 공급과 의결권 있는 주식 구성이 바뀔 수 있다. `ISSUED_SHARE_DILUTION`, `TREASURY_STOCK_RELEASE`, `FLOAT_OR_SUPPLY_CHANGE`, `VOTING_RIGHTS_CHANGE`를 별도 claim으로 유지하고, “희석 없음”을 “주식수·수급 영향 없음”으로 줄이지 않는다. 제3자 보유 주식을 교환 대상으로 하는 경우에는 bond issuer와 underlying issuer가 달라질 수 있으므로, issuer A의 채무/자금조달 event와 issuer B의 기존주식 공급/ownership exposure를 별도 subject child로 연결한다. underlying issuer의 active `COMMON_STOCK` master 검증이 실패하면 그 종목을 추천·스캔 subject에 추가하지 않는다.

행사·상장·자금 유입/부채 감소는 서로 독립된 stage다. KRX 행사 보고만 읽었으면 행사 보고 수량을 `CONFIRMED_FOR_NOTICE`로 표시하고 발행/납입/상장 완료는 각각 `REPORTED_NOT_INDEPENDENTLY_CONFIRMED` 또는 `NOT_REPORTED`로 남긴다. 수정 상장예정일 공시는 행사 수량 claim을 새로 더하지 않고 date assertion만 supersede한다. 기초 자료와의 tranche/수량/class 불일치, BW 대용납입인데 채권 말소 proof 없음, EB 공급자/기초회사 미확인, actual listing evidence 부재는 투자자-facing 완료/희석 수치의 suppress reason이다.

합성 source-shape fixture [`convertible-outcome-evidence.v0.json`](../fixtures/disclosure/convertible-outcome-evidence.v0.json)은 예정 상장일과 행사보고, CB/BW 중복·잔액, BW 현금/대용납입, EB 자기주식·제3자 기초주식, 정정된 상장일, 별도 추가상장과 공시별 누계/분모 기준 및 수량 reconciliation cardinality를 분리한다. 16개 acceptance ID: `FUEV-01-CB-EXERCISE-VS-LISTING`, `FUEV-02-CB-CURRENT-NOTICE-DEDUP`, `FUEV-03-BW-EXERCISE-RESIDUAL`, `FUEV-04-BW-CASH-VS-BOND-OFFSET`, `FUEV-05-EB-TREASURY-DELIVERY`, `FUEV-06-EB-THIRD-PARTY-UNDERLYING`, `FUEV-07-CORRECTED-LISTING-DATE`, `FUEV-08-ADDITIONAL-LISTING-CONFIRMED`, `FUEV-09-NOTICE-CUMULATIVE-EXCLUDES-PRIOR-FILINGS`, `FUEV-10-ISSUED-SHARES-DENOMINATOR-INCLUSION-IS-RECEIPT-SPECIFIC`, `FUEV-11-PARTIAL-ONE-TO-MANY-LISTING-KEEPS-UNMATCHED-SHARES-UNRESOLVED`, `FUEV-12-AGGREGATE-LISTING-NOTICE-DOES-NOT-INVENT-LINE-ALLOCATION`, `FUEV-13-QUANTITY-MISMATCH-OR-UNRESOLVED-RELATION-DOES-NOT-CREATE-REMAINDER-FACT`, `FUEV-14-CORRECTED-LISTING-NOTICE-SUPERSEDES-DATE-WITHOUT-ADDING-SHARES`, `FUEV-15-VALID-EMPTY-LISTING-SEARCH-IS-SCOPE-LIMITED`, `FUEV-16-PARTIAL-OR-UNAUTHORIZED-LISTING-SEARCH-IS-UNVERIFIABLE`. Fixture 입력은 합성이며 실제 관찰된 qualifier 차이는 링크된 공식 KIND 문서가 별도 근거다. KIND의 보편 schema나 검색 완전성을 증명하지 않는다.

#### 자본 영향 분리 공개 projection 제안

KR 공개 화면/API에서 단일 `희석률` 또는 “조달금액” badge를 만들지 않고, 자금흐름·부채 제거·신규주식·자기주식 교부·거래가능 공급 효과를 별도 measure로 제공한다. 이는 `GET /api/public/market-impact-events`의 `market-impact-events.v1` 변경안이 아니다. 현재 route는 legacy 호환 응답이며 이 claim set/게이트가 구현되어 있지 않으므로 새 버전/전용 KR surface와 모든 관련 decision 승인 전에는 사용자 노출을 허가하지 않는다.

| 논리 필드 | 계약 후보 | 수용/보류 규칙 |
|---|---|---|
| `projectionIdentity` | `{contractVersion, eventRevisionId, subjectInstrumentId, subjectRole, securitySeriesId, snapshotId, asOf, dependencyFingerprint}` | EB의 채권 발행자·기초주식 issuer를 각각 child subject로 유지한다. 한 응답의 모든 measure는 동일 승인 revision/snapshot/as-of를 가리켜야 한다. |
| `measureKind` | `CASH_RECEIVED_GROSS`, `CASH_RECEIVED_NET`, `NON_CASH_DEBT_SETTLEMENT`, `DEBT_DERECOGNIZED`, `NEW_SHARES_ISSUED`, `TREASURY_SHARES_RELEASED`, `SHARES_RESTRICTED_FROM_TRADING`, `PUBLIC_SUPPLY_POTENTIAL` | 서로 다른 kind를 한 숫자로 상계하거나 합산하지 않는다. 본문 내 reported value는 `CASH_RECEIVED` 같은 다른 범주로 이동시키지 않는다. |
| `measureValue` | `{status, exactDecimalString?, unit, currency?, securityClass?, eventPeriod, asOf, claimIds[], evidenceRefs[]}` | 0, not reported, not searched, unverifiable, conflict, conditional scenario를 구별한다. 금액에는 gross/net·통화·event period, 주식에는 발행/자기주식/교부/제한 상태를 붙인다. |
| `calculation` | `{kind, numeratorClaimIds[], denominatorClaimIds[], formulaId?, exactResult?, roundingRule?}` | 계산은 양쪽 원문 claim·단위·기준시점·동일 class가 승인됐을 때만. 단일 “희석률” 대신 예: `신주 수 / 증자 전 발행주식수`처럼 분자와 분모를 이름에 노출한다. |
| `availability` | `CONFIRMED`, `CONFIRMED_FOR_STAGE`, `CONDITIONAL`, `NOT_REPORTED`, `NOT_FOUND_IN_SCOPE`, `UNVERIFIABLE`, `CONFLICTED`, `NOT_COMPUTABLE`, `SUPPRESSED` | `CONFIRMED_FOR_STAGE`는 행사 보고와 일치하는 stage만 말한다. 상장 완료·현금수령·순유입 등 다른 stage는 별도 근거를 요구한다. |
| `interpretation` | `{displayKey, scopeLimitKey, forbiddenClaims[]}` | UI는 승인 message key로만 문구를 조립하고 범위/기준시점/조건을 수치 옆에 표시한다. score·추천 문구를 이 projection에서 계산하지 않는다. |

**현금/부채:** 발행 시점의 청약·납입 현금과 이후 전환/행사 시점의 현금흐름을 서로 다른 event period로 기록한다. CB 전환은 기존 전환사채 부채를 자본으로 바꾸는 처리일 수 있어 전환일 신규 현금유입으로 재계상하지 않는다. BW 권리행사 금액은 현금납입 proof가 있을 때만 gross cash received가 되며 사채대용납입은 현금 0과 증거로 확인된 non-cash debt settlement로 표기한다. EB 교환에서도 교환된 원금/부채 제거는 현금수령과 다른 measure다. `CASH_RECEIVED_NET`은 gross receipt 및 동일 scope 비용/수수료 지출이 모두 확인된 경우에만 산출하고, 발행 결정금액·청약액·행사청구액은 실제 현금 대체값이 아니다.

**신주/기존주식 공급:** CB/BW 행사로 새로 발행된 주식은 `NEW_SHARES_ISSUED`의 후보지만 행사 통지, 발행/효력, class·수량 확인을 단계별로 유지한다. EB 기존 자기주식 교환은 `NEW_SHARES_ISSUED=0`일 수 있으나 실제 교부가 확인되면 `TREASURY_SHARES_RELEASED`에 기록한다. 양도제한/예탁·의무보유가 남아 있으면 `SHARES_RESTRICTED_FROM_TRADING`과 `PUBLIC_SUPPLY_POTENTIAL`을 분리하고, 교환됐다는 사실만으로 즉시 market float/매도량이 증가했다고 표현하지 않는다. 제3자 보유 기초주식은 채권 발행 issuer의 share count·treasury claim에 더하지 않으며 기초 issuer identity/master가 미확인인 동안 그 종목용 추천/scan 공개를 막는다.

**비율 분모:** `신주 수 / 증자 전 발행주식수`는 오직 발행주식수 증가비율이며 기존 주주의 소유지분 감소율·EPS 감소율·주가하락률이 아니다. 보통주 발행총수 `S0`와 자기주식 `T0`를 같은 class·같은 기준일에 확인한 경우에도 `O0=S0-T0`는 별도의 자기주식 제외 분모로 표기한다. 특정 기존 보유자 `H`의 비참여 ownership 변화 `H/O0 → H/(O0+N)`는 보유수량·권리행사/참여·배정 등의 개인별 근거가 있어야 한다. 이 사용자별 추정은 공개 market-wide GET에 포함하지 않는다. 분모 시점·class·분할/병합 조정 또는 자기주식 status가 불일치하면 비율을 숨기고 `NOT_COMPUTABLE`로 둔다.

| 화면 표시 순서 | 예시 label | 오표현 방지 |
|---|---|---|
| 1 | 현금 수령: 확인액 / 미확인 | 발행계획 금액/행사청구액을 현금수령으로 쓰지 않음; gross/net 분리 |
| 2 | 비현금 부채변동: 전환·사채대용납입·교환으로 확인된 금액 | 부채 제거액을 현금유입으로 더하지 않음 |
| 3 | 새로 발행된 주식: 실제 확인량 / 계획·잠재량 | 신규 common, other shares, 미확인 class 구분 |
| 4 | 자기주식 교부 및 거래 제한 | 기존주식 이전을 신주로 계산하지 않으나 float 영향이 전혀 없다고 쓰지 않음 |
| 5 | 유통 가능 공급: 지금 확인 / 제한 종료 후 조건부 / 미확인 | treasury release를 실제 매도량으로 부르지 않음 |
| 6 | 비율 또는 scenario | 분자·분모·기준일·가정과 `CONDITIONAL` label 표시; 한 숫자 종합희석률 금지 |

합성 fixture [`capital-impact-separation.v0.json`](../fixtures/disclosure/capital-impact-separation.v0.json)은 `CIP-01-CB-CONVERSION-NONCASH`, `CIP-02-BW-CASH-EXERCISE`, `CIP-03-BW-BOND-OFFSET`, `CIP-04-EB-TREASURY-EXCHANGE`, `CIP-05-EB-THIRD-PARTY-SHARES`, `CIP-06-EB-TREASURY-LOCKUP`, `CIP-07-CB-POTENTIAL-NOT-ACTUAL`, `CIP-08-RATIO-BASIS-STALE`, `CIP-09-RATIO-TYPED-DENOMINATOR`, `CIP-10-CASH-ZERO-VS-UNKNOWN`, `CIP-11-ORIGINAL-PROCEEDS-NOT-CONVERSION-CASH`, `CIP-12-UNRESOLVED-CORRECTION-SUPPRESSES-METRICS` 12종을 고정한다. expected 결과는 API/UI 구현 실행이 아니라 필드 분리의 정적 수용 분모다.

#### 자금조달 일정과 scenario projection 제안

`CapitalImpactProjection`의 효과 시점은 기초 `EventDateAssertion` ID에 연결한다. 날짜나 기간은 별도 timeline item으로 제시하고, 같은 기업의 여러 날짜를 한 “자금조달 완료일”로 축약하지 않는다. 아래는 일정·시나리오 logical API 후보이지 migration/API 추가 승인 또는 현재 runtime capability가 아니다.

| timeline kind | 의미 | 허용 연결 impact | 확정/종결에 필요한 다음 증거 |
|---|---|---|---|
| `TERMS_APPROVED` / `BOND_ISSUED` | 이사회 조건 결의 및 증권 발행일 | 승인조건 revision; issuance 이후 현금수령은 별도 `CASH_RECEIVED` 날짜 | 발행·배정·실제 납입 evidence. 결의일/발행결정만으로 현금유입 금지 |
| `CASH_RECEIVED` | 실제 납입/입금 날짜 주장 | 해당 날의 `CASH_RECEIVED_GROSS`; 수수료 근거 있을 때만 `CASH_RECEIVED_NET` | 납입 proof와 통화·총액/순액·관련 회차 일치 |
| `EXERCISE_WINDOW` / `EXCHANGE_WINDOW` / `PUT_WINDOW` | 기간형 권리행사 가능 구간 | conditional scenario의 유효 구간; 각 window 원천/정정 revision | 기간 개시·종료는 실제 행사/상환/주식교부를 확정하지 않음 |
| `RIGHT_DETACHED` | BW 채권과 워런트 분리 event/date | warrant potential balance의 소유/시리즈 추적 | 분리 증거; bond principal과 권리 balance 분리 유지 |
| `EXERCISE_REPORTED` / `EXCHANGE_REPORTED` | 회차별 실제 청구/행사/교환 보고 | 보고수량 `CONFIRMED_FOR_NOTICE`, reported price/amount | 행사 효력·납입/대용납입·신주발행·기초주식 교부는 각 다음 stage proof |
| `CASH_SETTLEMENT` / `NON_CASH_OFFSET` | 현금 납입 또는 사채말소·대용납입 결제 | gross cash 또는 debt settlement/derecognition | settlement proof; BW의 cash와 bond-offset branch 동시 적용 금지 |
| `SHARES_ISSUED` / `TREASURY_DELIVERED` | 신규주식 효력 또는 기존 자기주식 교부 날짜 | 새 발행 주식수와 treasury release를 다른 measure로 연결 | 발행/전자등록 또는 교부·계좌이체 근거, issuer·class·수량 일치 |
| `LISTING_PROPOSED` / `LISTING_EFFECTIVE` | 추가상장 예정일 또는 별도 확인된 거래개시일 | effective 날짜가 맞는 실제 listing-stage projection | 예정일은 변경 가능. 별도 실제 거래개시/additional-listing notice가 필요 |
| `RESTRICTION_START/END` / `MATURITY_DATE` | 매도제한·예탁 종료 또는 만기 주장 | 조건부 공급가능 구간, 만기후 settlement check task | 기간 도래는 실제 해제·매도·상환/미상환 결과가 아님 |

날짜 type은 기존 `EventDateAssertion`의 `{dateKind, precision, certainty, lifecycle status, timezone, sourceRef, correction relation, rightsDecision}`를 재사용한다. 날짜 범위의 시작/끝을 별도 assertion으로 두고, body/API 필드 충돌·정정 relation 미해결이면 affected impact scenario를 `SUPPRESSED_REVIEW`한다. date-only 근거에 시각을 덧붙이지 않고, KIND의 `예정` 또는 발행사가 제시한 추가상장 예정일을 `LISTING_EFFECTIVE`로 바꾸지 않는다. 모든 timeline item·impact measure·coverage·subject eligibility·publication decision은 같은 `snapshotId/asOf`여야 한다.

`scenarioSet[]`는 확정 사실과 분리해 다음 필드를 가진다: `{scenarioId, scenarioKind, state: CONDITIONAL, assumptionClaimIds[], eligibleQuantityClaimId?, exerciseWindowAssertionIds[], settlementBranch?, start/end?, projectedMeasures[], formulaRefs[], exclusions[], asOf, expiryCondition}`. project는 실제 값이 아니라 가정에 따른 범위/결과 후보이며 사용자에게 `조건부 시나리오` badge와 핵심 가정을 붙인다. 하나의 base case는 확인된 값만 포함하고, 선택 가능한 scenario branches는 실행분과 미실행 eligible remainder를 분리한다. 추정 행사확률, 자동 trigger price, 주가/수익률/승인 확률은 사용자 제공·승인되지 않은 입력 없이 생성하지 않는다.

| 증권 | 조건부 scenario 후보 | 강제 분리 |
|---|---|---|
| CB | 잔여 전환가능 수량 전량/부분 전환, put/조기상환 요청 및 조건 변경 branch | 전환은 scenario 주식수를 만들 수 있지만 전환일 cash receipt는 만들지 않는다. 현재 전환가/발행한도/floor와 잔액이 stale/unknown이면 해당 branch 계산 금지 |
| BW | 행사 eligible balance의 현금납입 branch와 사채대용납입 branch | 서로 배타적 선택지로 유지. gross cash receipt는 현금 branch에만; offset branch는 debt settlement. 납입/사채말소 증거 없이 어느 branch도 actual로 표기 금지 |
| EB | 자기주식/제3자 기초주식 교환 및 매도제한 종료 후 공급가능 branch | 신주발행 0, treasury release, lockup restricted quantity, potential tradable supply를 각각 산출. 실제 매도나 float는 별도 근거 없으면 산출하지 않음 |

상환/풋 scenario는 납입 의무 총액과 실제 paid/outflow를 분리한다. 조기상환 조건·원금·premium·이자/지급일·행사수량이 source에서 확인되지 않으면 회사의 현금 유출 숫자를 계산하지 않고 `CONDITIONAL/NOT_COMPUTABLE`로 둔다. 만기일 경과 또는 행사기간 종료로 “전량 상환”, “미행사”, “권리 소멸”을 추론하지 않는다. `scenarioSet`의 가정 수정은 새 scenario revision이며 실제 관측 claim을 덮어쓰지 않는다.

표시 순서는 (1) 확인된 과거 일정/행사/결제와 각 as-of, (2) 다음 공식 기간/예정일과 certainty, (3) 현재까지 실제 cash/debt/share measures, (4) 조건부 branch별 미실행 수량/현금/부채 효과, (5) 상장·거래제한·후속 source coverage로 고정한다. 날짜가 앞서도 그 시점에 연결된 effect가 관측되지 않으면 수치 발생으로 표시하지 않는다. 날짜 정정만 도착하면 date assertion만 supersede하고 exercise shares/cash facts는 증거가 바뀌지 않는 한 다시 더하지 않는다.

합성 timeline fixture [`financing-timeline-scenarios.v0.json`](../fixtures/disclosure/financing-timeline-scenarios.v0.json)은 결의/납입 날짜 분리, CB 청구기간/실제 행사, BW 분리/배타적 결제 branch, EB 교부/제한기간, 예정 상장일, 조건부 전량전환, put/maturity 결과 미확인, 날짜만 정정, issuer/underlying issuer, mixed snapshot reject를 포함한다. `FTS-01-ISSUE-DATE-VS-CASH-DATE`, `FTS-02-CB-WINDOW-VS-CONVERSION`, `FTS-03-BW-DETACHED-RIGHT-TIMELINE`, `FTS-04-EB-EXCHANGE-DELIVERY-RESTRICTION`, `FTS-05-PROPOSED-LISTING-NOT-ACTUAL`, `FTS-06-FULL-EXERCISE-CONDITIONAL-SCENARIO`, `FTS-07-BW-CASH-OR-OFFSET-EXCLUSIVE`, `FTS-08-PUT-REDEMPTION-FUTURE-OUTFLOW`, `FTS-09-MATURITY-DATE-NO-SETTLEMENT`, `FTS-10-CORRECTED-DATE-ONLY`, `FTS-11-EVENT-SUBJECT-VS-UNDERLYING-SUBJECT`, `FTS-12-SNAPSHOT-DATE-IMPACT-MISMATCH`를 고정한다. 정적 vector는 scenario calculation correctness, API/UI parity 또는 publication approval을 증명하지 않는다.

#### Issuer 단위 자본상태 roll-forward 제안 — ICSR-01–ICSR-16

현재 설계는 개별 공시의 자본 효과 및 특정 CB/BW/EB series의 후속 stage를 나눈다. 그러나 한 issuer에서 여러 series·tranche가 병행되고, 행사 report·별도 추가상장 notice·정기보고서 share/debt balance가 서로 다른 시점과 범위를 제시할 때 이들을 통합 잔액으로 중복 없이 재구성하는 기능은 없다. legacy `market_impact_events` 한 행/ticker 공개 API도 issuer capital-state 원장을 대체하지 않는다. 새 KR 전용 capital state projection을 별도 계약으로 계획하고 기존 route/v1을 조용히 변경하지 않는다.

공식 근거도 단순 합산을 허용하지 않는다. [OpenDART 정기보고서 주요정보 가이드](https://opendart.fss.or.kr/guide/main.do?apiGrpCd=DS002)는 발행주식 총수, 증자/감자, 미상환 회사채·단기사채 등 항목을 별도 제공하지만, 해당 정보가 제출된 보고서의 일부 추출이며 정확성·완전성을 보장하지 않는다고 명시한다. 따라서 이를 filing 본문·KIND 후속조치·정정 history의 대체물로 취급하지 않는다. [KIND 전환주식 전환 사례](https://kind.krx.co.kr/external/2026/05/28/000970/20260528001517/72112.htm)는 보통주/상환전환우선주의 행사 전후 수량, 잔액, 과거 무상증자·감자와 예정 추가상장일을 구분한다. [별도 지분 보고 사례](https://kind.krx.co.kr/external/2026/02/13/001612/20260213003577/00634.htm)는 발행주식 총수에 아직 추가상장 예정인 stock-option/전환수량을 포함했다고 설명한다. 이 구체 사례는 filed values가 source/as-of 기준을 수반하고 movement와 reported snapshot이 겹칠 수 있음을 보여줄 뿐 전체 기업이나 상품의 보편적 source precedence를 정하지 않는다.

`issuer-capital-state-reconciliation.v0.json`의 logical state는 최소한 issuer/security class/series·tranche identity, `stateAsOf`와 `observedAt`, source filing revision set, declared source-window coverage, reported base snapshot, 그 시점 뒤의 연결 movement, unresolved remainder/reason, reconciliation status, dependency fingerprint를 가진다. issuer와 underlying issuer, 보통주/우선주·기타 증권, 서로 다른 series/tranche, corporate-action-adjusted basis는 각각 분리한다. 날짜가 같은 것만으로 series를 합치거나 종목명·회차 문자열을 fuzzy join하지 않는다.

계산은 기준 시점 `T`에 대해 선택된 정기보고서/공식 기준 snapshot `B(T0)`와, exact linked series·revision이 검토된 유효 movement `M(T0,T]`를 연결한다. 결과를 `B + ΣM`으로 표시하기 전에 base report의 as-of/포함 범위가 새 movement 또는 예정 상장수량을 이미 반영했는지 조정하고, 다음 보고 snapshot과의 difference를 reconcile한다. unexplained difference를 plug adjustment로 지우지 않고 `PARTIAL/CONFLICTED/UNRESOLVED`와 수량/분모로 보존한다. 행사·신주발행·추가상장은 하나의 economic movement에 붙는 서로 다른 stage assertion일 수 있으므로, notice 건수를 shares에 더하지 않는다. 한 report의 누계 잔액과 다른 report의 transaction delta를 합칠 source rule 역시 owner가 acceptance fixture로 승인하기 전 명시하지 않는다.

`outstandingPrincipalByCurrency`, `potentialSharesByScenario`, `sharesIssuedByStage`, `sharesListedByStage`, `treasurySharesReleased`, `restrictedShares`는 서로 다른 projection이다. 승인된 전환조건의 현재 수량 계산은 `CONDITIONAL` scenario에만 둔다. 행사 확률, 주가/수익률, 전체 fully-diluted ownership을 임의로 계산하지 않는다. currency 또는 security class 간 합계는 금지하고, corporate-action ratio/기준일이 맞지 않으면 share ratio `NOT_COMPUTABLE`로 둔다. `stateAsOf`보다 뒤에 관측된 사실은 historical query의 `observedAt/knowledgeCutoff` 조건을 통과하지 않으면 과거 snapshot에 유입하지 않는다.

통합 공개는 정확한 issuer/class/series 관계, 기준 snapshot과 그 이후 movement denominator, 선언된 DART/KIND scope의 pagination 및 correction coverage, rights/master/cap freshness, dependency approval과 하나의 immutable snapshot이 모두 통과할 때만 허용한다. 하나라도 미확정이면 confirmed measure 일부를 쓸 수 있는지 별도 action/right gate로 판정하되 미확정 잔액을 0으로 바꾸거나 전체 issuer aggregate를 완전한 것처럼 표기하지 않는다. 16개 합성 vector는 서로 다른 series 분리, 같은 movement의 report/listing stage 중복 방지, reported total에 포함된 예정상장 수량, 수정된 전환조건, EB underlying issuer, 다통화, 부분 coverage, 역사적 look-ahead 차단 및 권리 억제를 포함한다. 이 제안의 공개 gate·표본 분모·source precedence는 `KR-CAPITAL-RECONCILIATION-01` owner 승인 전 고정되지 않는다.

##### DS005 structured field와 timeline claim 대조 contract 제안

OpenDART DS005 CB(`cvbdIsDecsn.json`), BW(`bdwtIsDecsn.json`), EB(`exbdIsDecsn.json`) 공식 가이드는 각 endpoint가 회사코드와 최초접수일 기간으로 조회되며, 결과에 원 filing `rcept_no`, 사채 조건, 청약일(`sbd`), 납입일(`pymd`), 이사회결의일(`bddd`), 만기(`bd_mtd`) 및 상품별 권리 기간/수량 등 필드를 둘 수 있다고 명시한다. 이 필드 정의는 DS005 response에 그 사실이 포함된 경우의 claim locator다. endpoint가 모든 제출공시를 열거하거나 실제 납입/결제·정정 최종상태를 증명한다는 뜻은 아니다. 아래 표는 공식 field와 사용자 일정 표시를 연결하는 제안이며 runtime parser 또는 endpoint completeness 승인이 아니다.

| DART field | 원천에서 주장하는 의미 | timeline/measure 연결 | 금지하는 자동 승격 |
|---|---|---|---|
| `rcept_no`, `corp_code`, `corp_name`, `bd_tm` | 상세 결과가 가리키는 제출/회사/사채 회차 | `sourceRef`와 issuer+tranche identity의 연결 후보. 반드시 기존 `list.json` receipt의 exact match 및 filing revision으로 묶음 | 회사명·회차 텍스트만으로 receipt·tranche 자동 join, underlying issuer와 bond issuer 혼합 |
| `bddd` | 이사회 결의일 | `TERMS_APPROVED` date assertion; 최초 조건 revision의 기준 | 납입·발행·현금 수령 완료로 표현 |
| `sbd`, `pymd` | 청약일, 계획/기재된 납입일 | 청약/예정 납입 schedule assertion. 실제 입금 claim은 별도 filing/evidence가 뒷받침할 때만 `CASH_RECEIVED` | 예정 납입일을 입금일로 승격하거나 해당 금액을 실제 유입액에 합산 |
| `bd_mtd` | 사채 만기일 | `MATURITY_DATE` assertion와 후속 결과 확인 task | 날짜 경과로 상환·전환·소멸 확정 |
| CB `cvrqpd_bgd/edd`, `cvisstk_cnt`, `cv_prc` | 전환청구 기간, 발행 가능 주식수, 전환가액 | 기간형 `EXERCISE_WINDOW`, revision-bound eligible scenario input | 청구기간 전체를 행사량으로 처리하거나 계획 가능 주식수를 실제 발행량으로 표기 |
| BW `exrqpd_bgd/edd`, `nstk_isstk_cnt`, `nstk_pym_mth`, `bdwt_div_atn` | 행사 기간/가능 주식, 신주대금 납입방법, 사채·권리 분리 여부 | 행사 window·조건, cash/offset branch identity 후보 | 분리/기간 시작을 행사로, 선택 가능한 납입방법을 실제 settlement로 동시 집계 |
| EB `exrqpd_bgd/edd`, `extg`, `extg_stkcnt` | 교환 기간·대상·주식수 | 대상 issuer/class 검증 후 `EXCHANGE_WINDOW` 및 conditional 기존주식 공급 basis | 교환 청구를 주식 교부·매매가능·실제 매도로 승격 |
| 원문 후속/정정 및 거래소 추가상장 증거 | 원문에서 수정·실행·상장 단계에 관한 새 주장 | 기존 `EventRevision`/`EventDateAssertion`과 stage별 추가 claim으로 연결 | DS005 최초 조건 응답 하나로 정정 최종성·실제 결제·실제 상장 완료를 단정 |

조회·normalization acceptance는 각 endpoint마다 같은 `corp_code`/접수일 window와 fixture receipt set에 대해 `list.json` discovery denominator, DS005 response `rcept_no`, 원문 form locator, correction chain을 비교한다. 각 field는 `PRESENT`, `EXPLICIT_EMPTY`, `NOT_IN_RESPONSE_VERSION`, `NOT_RETURNED`, `PARSE_ERROR`, `CONFLICT_WITH_BODY`, `NOT_APPLICABLE` 중 하나로 표현한다. **응답에 field가 없다는 사실은 0, 미발생, 삭제 또는 명시적 미기재가 아니다.** 공식 가이드에 field label이 존재해도 오래된 접수자료·API 응답 버전·실제 응답에서 항상 반환된다는 보장은 없으므로 endpoint/version+field dictionary hash와 observed response shape를 별도 보존한다.

Acceptance pair는 receipt를 기준으로 (a) 목록 discovery와 exact `rcept_no` join, (b) response field와 원문 표/문단 locator, (c) 정정 전후 field/date assertion, (d) stage evidence와 실제 cash/debt/share effect를 대조한다. 충돌은 원문 또는 정정관계 review로 격리하고, DART가 제공하는 structured subset만으로 채울 수 있는 claim과 원문/후속공시가 필요한 claim을 API/UI에서 구분한다. rights decision이 허용하지 않는 source body/파생 인용은 평가·공개 분모에서도 차단한다. 이 fixture 집합은 현재 누락률/field accuracy를 입증하지 않으며 승인된 sample frame과 독립 adjudication 전 공개 자동화 gate로 사용할 수 없다.

| 검증 dimension | acceptance unit | 실패/unknown 처리 |
|---|---|---|
| discovery coverage | 승인된 issuer×접수일 window의 모든 `list.json` receipt/page와 각 DS005 결과 receipt | 열거 불완전·quota·기간 mismatch면 `PARTIAL`; empty success로 추정 금지 |
| identity | exact `rcept_no` + `corp_code` + 회차/상품 관계 | ambiguous/multi-match는 `UNRESOLVED_RELATION`; title/date proximity join 금지 |
| field fidelity | versioned response field path/value + 원문 locator + typed unit/date | 결손과 명시적 빈값 분리; numeric/date conflict는 affected claim suppress |
| revision/stage | original→correction graph, terms→subscription/payment→exercise/settlement/listing stage | 조건 revision을 실행 outcome으로 쓰지 않음; 후속 검색이 미완료면 결과 `NOT_VERIFIED` |
| publication | claim→impact→subject eligibility→rights→single snapshot | 권리/종목/기준일 unresolved는 해당 dependent claim suppress, 확인된 무관 claim은 분리 유지 |

다음 gold denominator는 CB/BW/EB 각각의 positive matched, explicit empty, response-field missing, body conflict, correction, unrelated same issuer, unresolved receipt, source unavailable, rights blocked 사례를 함께 포함한다. 표본 크기·기간·누락률 허용선·독립 검토자 일치율은 `KR-SHADOW-SLO-01` 및 `KR-END-TO-END-ACCEPTANCE-01` 책임자가 자료 권리와 실제 수집 비용을 검토한 뒤 정한다. DS005는 2015년 이후 제공을 안내하지만 이것만으로 해당 기간의 전체 발행/정정 모집단이 완전하다고 해석하지 않는다.

합성 field acceptance fixture [`ds005-financing-field-acceptance.v0.json`](../fixtures/disclosure/ds005-financing-field-acceptance.v0.json)은 `DS5F-01-RECEIPT-EXACT-JOIN`, `DS5F-02-BOARD-DATE-IS-NOT-CASH`, `DS5F-03-PLANNED-PAYMENT-NOT-CASH-PROOF`, `DS5F-04-MATURITY-NOT-SETTLEMENT`, `DS5F-05-EXERCISE-CAPACITY-NOT-ACTUAL-SHARES`, `DS5F-06-BW-SETTLEMENT-METHOD-NOT-OBSERVED-BRANCH`, `DS5F-07-EB-EXCHANGE-NOT-DELIVERY-OR-SALE`, `DS5F-08-ABSENT-FIELD-IS-NOT-ZERO`, `DS5F-09-EXPLICIT-EMPTY-DIFFERS-FROM-OMITTED`, `DS5F-10-STRUCTURED-VS-BODY-CONFLICT`, `DS5F-11-CORRECTION-REVISION-NOT-DOUBLE-COUNT`, `DS5F-12-DETAIL-RECEIPT-NOT-IN-DISCOVERY-DENOMINATOR` 12종을 고정한다. 이는 synthetic contract gate이며 실제 DART response sample의 fidelity/coverage 점수가 아니다.

##### 실제 filing adjudication package 제안

합성 fixture와 실제 공시 adjudication을 서로 다른 artifact family로 관리한다. 실제 표본을 만들기 전에 `KR-DART-RIGHTS-01`의 source/component/action 범위가 해당 lookup·일시 처리·저장·reviewer 접근에 허용되는지 확인하고, 모호하면 body를 복사하거나 hash를 공개 bundle에 넣지 않는다. approval이 없으면 synthetic fixture에 실제 receipt/issuer를 끼워 넣지 않고 actual adjudication 분모를 `NOT_COLLECTED_RIGHTS_PENDING`으로 기록한다.

각 실제 sample은 하나의 immutable `adjudicationCaseId`와 source-specific item을 갖고, 한 filing에 여러 상품/회차/필드가 있으면 `caseItemId`를 분리한다. 기본 package는 `samplingManifest`, `sourceObservation`, `fieldJudgment[]`, `relationJudgment[]`, `reviewRound[]`, `caseDisposition`, `changeHistory`로 나눈다. source 사실과 reviewer 의견을 같은 mutable row에 덮어쓰지 않는다.

| artifact | 필수 최소 필드 | 설명/금지 |
|---|---|---|
| `samplingManifest` | `manifestId/revision`, `queryDefinition`, `source/window`, `strata`, `populationCount`, `selectedCount`, `excludedCount+reason`, `unavailableCount`, `selectionMethod`, `rightsDecisionRef`, `asOf`, `manifestHash` | 선택 전 고정. 접근 실패·권리 차단·미취득 항목을 선택 모집단에서 제거하지 않음 |
| `sourceObservation` | `caseId/itemId`, `sourceProduct/endpoint/guideVersion`, `rceptNo`(허용될 때만), `corpCode`, `trancheKey`, `responseObservedAt`, `responseShapeHash`(허용될 때만), `bodyLocator`, `bodyAvailability`, `correctionEdges`, `sourceRightsRef` | 실제 본문/응답 복제 대신 허용된 locator/hash 및 access path 사용. `rceptNo`만으로 원문 사실 검증 완료라 하지 않음 |
| `fieldJudgment` | `fieldPath`, `expectedSemantic`, `structuredState/value+unit`, `bodyState/value+unit`, `datePrecision`, `locator`, `matchClass`, `missingState`, `reviewerRationale` | 분류는 `MATCH`, `VALUE_CONFLICT`, `SEMANTIC_MISMATCH`, `EXPLICIT_EMPTY`, `NOT_RETURNED`, `NOT_IN_VERSION`, `PARSE_ERROR`, `NOT_APPLICABLE`, `UNVERIFIABLE_RIGHTS`, `UNLOCATABLE` 중 하나. 숫자 zero는 원천의 explicit zero만 허용 |
| `relationJudgment` | `fromReceipt`, `toReceipt`, `relationType`, `candidateEvidence[]`, `locator[]`, `decision`, `rationale` | `CORRECTION_OF`, `WITHDRAWS`, `REPLACES_ATTACHMENT`, `FOLLOW_UP_OUTCOME`, `UNRELATED`, `UNRESOLVED` 중 하나. 제목/날짜 유사도만으로 correction edge 확정 금지 |
| `reviewRound` | `round`, `reviewerRole/opaqueId`, `independence`, `candidateBlind`, `decision`, `disputedItems[]`, `rationale`, `reviewedAt`, `supersedesReviewId` | 작성자와 독립 판정자 구분. 공개 document에는 개인 reviewer ID 대신 내부 opaque reference만 둠 |
| `caseDisposition` | `caseState`, `blockingItems[]`, `resolvedItems[]`, `requiredNextEvidence[]`, `decisionRef`, `validUntil/reviewTrigger`, `finalizedAt` | `RESOLVED_FOR_SCOPE`, `PARTIAL`, `UNRESOLVED`, `RIGHTS_BLOCKED`, `SOURCE_UNAVAILABLE`, `REOPENED`; resolved는 명시 scope/field까지만 유효 |

두 reviewer의 개별 판단을 합치기 전에 reviewer별 original judgment를 immutable로 저장한다. disagreement는 `DISPUTED`로 남기고 지정 adjudicator가 competing evidence/locator를 나란히 비교해 별도 review round를 추가한다. adjudicator도 확정하지 못하면 `UNRESOLVED`다. 다수결·단순 다수 label, candidate 결과를 본 뒤의 reviewer 동조, 작성자 자기승인은 unresolved를 resolved로 바꾸지 않는다. 판단 범위가 한 field/date/relationship에 한정되면 무관한 resolved claim은 유지하되 그 dependent projection만 억제한다.

#### Adjudication sample acceptance matrix

| 층/사례 | 관측 단위·필수 대조 | 통과 가능한 범위 | 실패/미관측 기록 |
|---|---|---|---|
| 상품·회차 | CB/BW/EB × receipt × tranche; exact `rcept_no`/`corp_code`/회차와 DS005 row cardinality 대조 | 모든 선택 항목이 exact linked 또는 사유가 분류된 terminal disposition | orphan, duplicate, multi-match와 미반환 필드를 각각 표시 |
| 날짜·금액·수량 field | fieldPath × typed unit/date precision × structured response vs 허용 body locator | 같은 의미·단위·기간을 비교한 결과만 `MATCH`; explicit empty/zero 구분 | unit/date semantic mismatch, response version absence, parse failure는 mismatch 또는 unverifiable로 분리 |
| 정정/후속 edge | receipt pair × filing label/body relation × correction stage | 명시 근거로 검토된 관계만 resolved; 독립 reviewer round 연결 | unresolved/무관/원문 미취득을 denominator에서 제외하거나 시간 근접 join하지 않음 |
| lifecycle outcome | terms→subscription/payment→exercise/settlement/delivery/listing stage | stage별 claim에 직접 근거가 있는 부분만 확정 | 미래/후속 결과 미취득은 `NOT_VERIFIED`; 예정일 경과로 outcome 만들지 않음 |
| rights/unavailable | endpoint×payload component×action 및 sample item | 결정된 허용범위에서만 observation/review 수행 | 권리 차단·접근 실패는 각각 별도 terminal count, content review PASS로 치환 금지 |

고정 평가 보고서에 `N_selected`, `N_reviewed`, `N_agreed`, `N_disputed`, `N_adjudicated`, `N_unresolved`, `N_unavailable`, `N_rights_blocked`, `N_excluded_by_reason`와 각각의 합계 불변식을 층별로 남긴다. 분모 차이는 숨기지 않고 reconciliation row가 없으면 run=`INCOMPLETE`다. Agreement 수치는 reviewer별 item 단위 exact agreement 분자/실제 이중 검토 분모를 제공하되, 승인 전 통계 threshold나 허용률을 발명하지 않는다. P7의 append-only acceptance report에 `manifestHash`, field/relation label version, opaque reviewer refs, disputed item IDs, adjudication rounds 및 최종 unresolved 수를 연결한다.

fixture 변화, OpenDART guide/response shape change, source rights/terms change, correction relation reopen, taxonomy/normalizer change, reviewer independence 위반, locator 재현 불가, denominator reconciliation 실패는 affected acceptance run을 `EXPIRED` 또는 `INCOMPLETE` 처리하고 기존 approval을 재사용하지 않는 재검토 trigger 후보다. 이 trigger와 분모는 proposed contract이며 `KR-SHADOW-SLO-01`, `KR-END-TO-END-ACCEPTANCE-01`, `KR-DART-RIGHTS-01` 결정이 `OPEN`인 동안 actual sample adjudication/review publication을 활성화하지 않는다.

합성 adjudication package [`financing-adjudication-package.v0.json`](../fixtures/disclosure/financing-adjudication-package.v0.json)은 `FAP-01-SAMPLE-DENOMINATOR-KEEPS-UNAVAILABLE`, `FAP-02-EXPLICIT-ZERO-REQUIRES-LOCATOR`, `FAP-03-REVIEW-DISAGREEMENT-NEEDS-ADJUDICATOR`, `FAP-04-UNRELATED-SAME-ISSUER-NOT-CORRECTION`, `FAP-05-RIGHTS-BLOCKED-IS-NOT-CONTENT-PASS`, `FAP-06-APPROVAL-STALE-AFTER-GUIDE-SHAPE-CHANGE`, `FAP-07-RECEIPT-CARDINALITY-MISMATCH-INCOMPLETE`, `FAP-08-PARTIAL-SCOPE-REVIEW-PRESERVES-UNRELATED-CLAIMS` 8종의 expected boundary를 고정한다. 이 vector들도 실제 권리 승인·reviewer 실행·공시 정확도를 입증하지 않는다.

##### 오류가 확정된 공시 claim의 product remediation 제안

Claim 값 또는 attribution이 나중에 틀린 것으로 판정되면 단순히 최신 숫자를 고치는 것으로 끝내지 않는다. Source observation(원 공시별 불변 관측), normalized fact(단위·기간을 정렬한 값), interpretation(경제적 의미), investment effect(현금/부채/주식/일정 영향 계산), publication/delivery(사용자에게 노출된 snapshot)는 다른 수정 대상이다. 새 정정 relation과 근거가 승인되면 source observation history에 새 revision을 추가하고 영향 claim을 `SUPERSEDED/CONTESTED` 처리한다. 수정된 수치가 실제 입금·상환·발행·교부와 일치하는 별도 증거가 없으면 실제 effect는 확정하지 않는다. relation이 `UNRESOLVED`이면 과거 승인 revision은 freshness상 stale로 내리고 최신값 공개는 막되, 바뀌었다고 단정하지 않는다.

제품은 source change에서 파생된 consumer closure를 만들고 변경된 row마다 `NO_DOWNSTREAM_IMPACT`, `STALE_SUPPRESSED`, `RECALCULATION_REQUIRED`, `REVIEW_REQUIRED`, `CORRECTED`, `UNRESOLVED`를 명시한다. 직접·전이 consumer set, transitive consumer set hash, 이전/새 revision, snapshot epoch, 계산식 버전, reviewer rationale를 ledger로 결박한다. 종속 edge를 완전히 열거할 수 없으면 알려진 일부만 갱신하지 않고 근접 unresolved root 범위로 broad suppression한다. 독립적으로 근거가 유효한 sibling subject/date/claim은 exact closure 밖임을 확인한 때에만 유지한다.

과거 effect와 투자 해석은 불변이다. 바뀐 normalized fact는 새 calculation revision을 요구하며, 계산 결과가 달라지거나 입력 검증이 무효화되면 과거 impact approval을 stale 처리하고 독립 review 전 공개를 막는다. 계산값은 같더라도 근거 자체가 바뀐 경우에는 `REVIEWED_NO_CHANGE` 처분을 남겨 “수정 없음”과 “재검토 누락”을 구분한다. 이전 화면/API snapshot은 감사용 immutable record로 유지하고 새 current projection만 수정한다. 정정이 material이며 이전 알림이 외부 전달됐을 수 있으면 [채널별 delivery reconciliation](./kr-disclosure-event-architecture.md#정정철회-후-외부-노출-reconciliation-수용-계약)과 연결해 가능한 보정 후보/미회수 잔여를 남긴다. 이 과정은 자동 매수·매도 지시나 과거 recommendation을 기계적으로 반전하는 기능이 아니다.

Remediation case는 `trigger source revision/relation`, exact changed claims, transitive consumer denominator/hash, prior/current approval & publication epochs, recalculation plan, recipient/channel delivery manifest 참조, named accountable owner, independent reviewer, unresolved exposure와 terminal disposition을 갖는다. 완료는 manifest 의존 개수와 disposition 행수가 같고, 모든 affected consumer가 보정 또는 이유가 승인된 terminal 상태이며, new calculation/review/publication gate가 정합하고, 사용자 외부 노출이 있으면 delivery ledger가 완전하거나 잔여가 명시되어야 한다. owner/reviewer 미지정, 분모 gap, 새 정정 유입 race, 원 권리/action 검증 실패는 `INCOMPLETE`로 남는다. 공개 정정 문구에는 권리상 허용된 최소 정보만 쓰고, 가격방향이 바뀐 경우에도 종전 판단 오류 자체를 근거 없는 매매 권고로 대체하지 않는다.

합성 수용 경계 [`fact-correction-remediation.v0.json`](../fixtures/disclosure/fact-correction-remediation.v0.json)의 `FCR-01`–`FCR-49`는 원천/정규화/경제효과 층 분리, 관계 미해결 시 suppression, dependency 정확 범위, recalculation/stale approval, reviewer가 승인한 no-change, 기존 사용자 snapshot과 delivery, 자동 매매 권고 금지, 종목 오귀속 수정, completion denominator 및 책임자 요구를 고정한다. `FCR-48`은 다중 이벤트 공시에서 기대 dependency set과 관측 set이 완전히 같고 미연결 수가 0이며 source page coverage가 완전할 때만 개별 claim/security에 reviewer의 `VERIFIED_UNAFFECTED` 연결을 남긴다. `FCR-49`는 누락 consumer 또는 incomplete page가 있으면 해당 claim의 영향 없음 판정을 금지하고 `UNRESOLVED`로 둔다. closure 밖의 sibling을 자동 억제하지 않되 누락 항목을 영향 없음으로 간주하지 않는다. 무영향 판정은 correction revision·대상 consumer 범위에 한정되며 새로운 정정이나 identity conflict는 기존 판정을 stale하게 한다. `FCR-11`–`FCR-14`는 receipt identity/relation, `rm=철`과 사건 취소, attachment correction scope, immutable correction chain을 분리한다. `FCR-15`–`FCR-19`는 각 공시 링크가 자기 `rcept_no`의 문서 viewer를 연다는 것과 predecessor relation을 증명한다는 주장을 별개로 둔다. `[기재정정]`/`[첨부정정]` title 또는 `rm=정`은 관련 보고서가 있다는 marker지만 특정 predecessor receipt ID를 제공하지 않으므로 relation을 자동 확정하거나 이전 filing link로 바꾸지 않는다. 명시적 official relation evidence가 확인되면 두 receipt를 각각 보존하고 viewer도 독립 생성한다. target receipt link가 invalid여도 relation evidence를 덮어쓰지 않으며 target navigation만 억제한다. RSS에서 추출한 link의 receipt와 authoritative row `rcept_no`가 다르면 후보 원 URL을 폐기하고 row receipt로만 canonical viewer를 재구성한다. `FCR-20`–`FCR-36`는 RSS/list join을 14자리 exact `DART:rcept_no` equality로만 수행하고 두 source observation을 각각 immutable로 보존한다. title/company/date similarity와 receipt chronology는 identity fallback이 아니다. 같은 source+receipt의 identity-critical field 충돌은 Map last-write-wins 없이 `QUARANTINED_REVIEW`; exact receipt라도 title/report metadata 차이는 둘 다 보존하고 `REVIEW_REQUIRED`로 남긴다. 부재 match는 list query coverage가 선언 범위에서 완전 검증된 경우 외에는 `UNRESOLVED_COVERAGE`이며 negative fact로 표현하지 않는다. 현재 `fetchOpenDartToday()`의 `rowsByReceiptNo.set()`은 중복 receipt의 이전 값을 덮고, `lib/rss.ts`의 `extractRceptNo()`는 `rcpNo` 숫자 regex만 적용해 URL host/path/query cardinality를 검증하지 않는다. 이는 현재 결함 진술이며 이번 문서 작업에서 코드를 수정하지 않았다. 현재 data path에는 same-time RSS/list source pair를 복구할 immutable sample store가 없다: OpenDART `rows`는 automation run에서 candidate mapping 후 사라지고 `dart_automation_events`는 external ID 및 delivery 상태만 남긴다. `filings` 테이블은 DART RSS-derived filing을 담지만 OpenDART row capture/page evidence와 연결되지 않는다. 그래서 현 회차에 운영 metadata drift 수치를 주장하지 않는다. `receiptJoinEvaluationReport`는 source capture IDs, declared/fetched pages, page echo, count reconciliation, snapshot stability와 aggregate-only match/duplicate/drift counts를 정의하며 raw XML/list row/title/credential/URL을 report에 넣지 않는다. retention은 권리/action 결정 전 `UNRESOLVED`; per-row in-memory compare도 허용 scope 확인 전 실행하지 않는다. OpenDART guide의 pagination metadata는 enumerated response 범위를 확인하는 데 쓰고 RSS와 list가 동일한 complete temporal snapshot이라는 보증으로 간주하지 않는다. `FCR-31`–`FCR-47`는 join 결과를 투자 사용자 검토 흐름에 연결한다. UI는 `UNRESOLVED_COVERAGE`를 불일치가 아닌 “대조 자료 불완전 · 불일치 판정 아님”으로 표시하고, exact receipt match도 종목 귀속 검증으로 승격하지 않는다. `IDENTITY_CONFLICT`/`DUPLICATE_RECEIPT_CONFLICT`는 cross-source claim/score/recommendation/alert를 suppress하지만 source-specific observation은 해당 별도 rights/publication decision 아래 유지할 수 있다. Reviewer는 current/target receipt viewer와 metadata를 비교하고 제출 법인, active `COMMON_STOCK` master 및 직접 영향 근거를 별도 확인한다. `RESOLVE_AS_LINKED`는 relation만 resolve하며 rights/claim approval을 대체하지 않고, `RESOLVE_AS_UNLINKED`는 양 observation을 보존한다. Decision은 reviewer·role·reason·evidence ref·capture IDs·expected revision을 포함한 append-only record이며 stale capture/revision에서는 reject 후 re-review한다. 이 흐름은 제안이며 현재 UI/runtime는 없다. `FCR-37`–`FCR-41`은 public feed와 admin review surface/API 경계를 나눈다. 현재 `/api/dart`는 비인증 공개 feed이며 `/app/admin/layout.tsx`는 `requireAdminSession()`을 사용하지만 그 session은 shared password boolean으로 named reviewer/role을 증명하지 못한다. 그러므로 public DTO에는 review rationale/capture ID/reviewer identity를 포함하지 않고, 새 internal review GET은 DAL/store 경계에서 권한을 검증하고 목적 제한 DTO만 반환한다. source rights unresolved면 admin이라도 raw body/제한 metadata를 표시하지 않는다. mutation은 named actor/role attribution과 CSRF/mutation policy가 승인·구현되기 전 `BLOCKED_POLICY_NOT_READY`; SameSite만으로 CSRF 방어 완료를 선언하지 않으며, server-side permission/schema/expectedRevision 검증 및 append-only audit가 필요하다. Origin/Referer가 없거나 null이고 대체 CSRF proof도 없으면 거부한다. audit의 reviewer 이름을 client 입력으로 허위 대체하지 않는다. 제안 text wireframe은 queue summary/filter, side-by-side RSS/list metadata, field delta, current/target viewer link와 별도 instrument/rights gates를 둔다. 공식 공시검색 가이드는 `rcept_no` 14자리, PC viewer URL, 정정 표지 및 `rm`의 `정/철` 의미를 설명하지만 정정/철회 대상 relation ID나 경제적 결과를 marker만으로 확정하지 않는다. 현재 DART collector는 `rcept_no`별 목록 중복 제거만 확인됐으며 관계 edge persistence는 확인되지 않는다. 실제 원문 body/attachment는 `KR-DART-RIGHTS-01` action decision 전 fetch/persist를 허용하지 않는다. fixture는 실제 correction relation 정답, historical exposure 분모, runtime consumer graph 실행을 증명하지 않는다.

##### Claim-to-review traceability matrix 제안

Package를 저장소에 만들더라도 최종 사용자 claim까지 lineage가 이어지지 않으면 표본 adjudication의 투자 기능 효용을 판단할 수 없다. 다음 trace는 immutable revision key 기준의 proposal이며 신규 DB/API 구현 사실이 아니다. 각 row는 source observation→판정된 claim→decision→계산 effect→publication item의 연결을 끝까지 확인한다.

| 사용자-facing 결과 | source/evidence anchor | adjudication/review anchor | 연결 및 invalidation 규칙 | 공개 수용 조건 |
|---|---|---|---|---|
| 일정 날짜·certainty | `sourceObservationId`, receipt/document revision, exact locator, `EventDateAssertionId`, date precision | field/date `fieldJudgmentId`, correction `relationJudgmentId`, reviewer round + `decisionRef` | correction edge 변경은 연결된 assertion과 후속 일정 consumer만 invalidate; 같은 receipt 다른 claim은 dependency가 없으면 유지 | assertion이 `RESOLVED_FOR_SCOPE`, revision current, rights action 허용, single snapshot 일치 |
| 실제 현금 유입/유출 | 금액·통화·flow 방향 locator, 결제/입금/상환 단계 증거 | 금액 field judgment, stage outcome review | 계획 금액/date만 변경되면 actual cash measure 재사용 금지; settlement 증거 철회·정정이면 dependent measure 재검증 | 실제 flow proof 및 gross/net/통화 basis·asOf를 독립 확인; 미확인 비용은 순액 미계산 |
| 부채 감소/상계 | 채권 원금·회차 및 말소/대용납입 증거 | relation + non-cash settlement field judgments | 같은 증권의 신규 현금조달과 상계/전환을 분리, duplicated stage edge는 중복계상 차단 | actual derecognition/offset stage evidence; 원금 일정만으로 제거액 산출 금지 |
| 신주 발행/기존주식 공급 | class·issuer·quantity, 전자등록/추가상장 또는 기존주식 delivery locator | subject/class/quantity field judgments와 eligibility decision revision | class·subject 변경은 해당 security effect와 해당 종목 child만 invalidate | active COMMON_STOCK master 및 market-cap/freshness gate current; issuer/underlying 분리 |
| 조건부 희석/scenario | 조건·잔액·권리기간·전환/행사가격 및 input claim set | 각 input field judgment, formula/scenario version, reviewer scope decision | input claim 하나라도 stale/contested면 scenario result 전체 새 revision 전까지 숨김; 실제 outcome이 나오면 scenario 잔액 감소를 별도 승인 계산 | 명시 `CONDITIONAL`, typed denominator·scenario asOf, 추정확률/임의 trigger 없음 |
| 요약·영향·분석 claim | 문장 segment의 supporting/contradicting locator와 source roles | claim-level review, analysis revision 및 exact prompt/schema/model/source fingerprint | 문장 편집·source/rights/model 변경은 영향 sentence와 downstream consumer를 역참조해 재검토 | factual/interpretive claim 분리, 근거·반대·unknown 표시, derivative/public action 권리 승인 |

모든 공개 row는 공통 `traceId`에서 다음 tuple을 결박한다: `sourceRevisionHash → field/relation judgment revisions → reviewer decision revision → claim revision → formula/scenario or analysis revision → impact consumer IDs → eligibility/rights decision revisions → publication epoch/snapshot`. Source→claim과 claim→consumer 각 edge는 relation kind와 basis locator를 가진다. edge 하나라도 끊기거나 cardinality/hash가 불일치하면 영향 범위를 좁힐 수 없으므로 가장 가까운 unresolved root의 dependent consumer 전체를 suppress한다. source 원문은 권리 결정이 저장을 허용하지 않으면 영속 보관하지 않고 `SOURCE_REACQUIRE_REQUIRED`를 남긴다.

##### 수치 투자효과의 재현 가능한 계산 trace

기존 claim-to-review lineage에 `CALCULATION_FORMULA_REVISION`을 별도 stage로 둔다. 계산 revision은 formula ID/revision, 명시적 입력 claim ID/revision과 source observation/revision hash/locator, 각 입력의 decimal-string value·unit·currency·security class·period/basis date·stage, 가정 및 `AS_FILED_FACT/CONDITIONAL_SCENARIO` 구분, exact intermediate/output, rounding/display policy revision, calculation status, canonical output hash, reviewer decision revision을 갖는다. denominator/단위/기준일/security class/purpose 하나라도 비교 불가·충돌·미확인이면 `NOT_COMPUTABLE/UNRESOLVED`(예: `BASIS_DATE_MISMATCH`)로 종료하고 output hash를 승인 가능한 계산값으로 만들지 않는다. scenario 입력은 reviewer가 식을 다시 계산할 수 있어야 하며, 분석 model confidence나 narrative가 산식 검증을 대신하지 않는다.

합성 분모 `S0=10,000,000`, `T0=1,000,000`, 계획 신주 `N=1,000,000`이 동일한 COMMON class와 기준일일 때 `O0=S0-T0=9,000,000`, 전량 발행 가정의 `O1=O0+N=10,000,000`, `N/O1=1/10`을 재현한다. 이 값은 “전량 발행 가정의 발행 후 유통 기준 신주 비중”인 `CONDITIONAL_SCENARIO`다. 기존 주주의 지분 변화, EPS 감소, 실제 발행 완료 또는 주가 영향이 아니다. 실제 보유량·배정·납입·발행 증거가 없으면 개인 지분 손익과 완료 효과는 계산하지 않는다. 수학적으로 exact rational인 결과를 우선 보존하고, 일반 소수/금액 표시는 별도 승인된 versioned rounding policy 없이는 공개하지 않는다.

숫자 안정성 계약은 다음과 같다. 금액/주식수 입력은 decimal string 또는 exact rational로만 계산하고 IEEE-754 binary floating point를 금융 산식/합계에 쓰지 않는다. unit와 currency는 개별 claim에 붙이며 currency conversion은 pair, 방향, 유효시각, source locator, current rights/action decision을 가진 명시 FX claim과 승인된 formula revision이 모두 있을 때만 수행한다. 수수료·세금·상계 입력이 absent/blank/`NOT_RETURNED`이면 0으로 채우지 않고 해당 net measure만 `UNVERIFIABLE`; source가 명시한 zero는 zero claim으로 보존한다. 합산·비율 계산은 전체 exact input에 수행한 다음 화면에서만 rounding한다. rounding mode/scale/tie/locale이 들어간 versioned policy가 owner 승인 전 없으면 exact rational은 내부 trace에 보존하되 변환된 numeric display만 보류한다(다른 적격 event 필드 전체를 숨길 필요는 없다).

Denominator 검사는 formula registry의 typed domain에 따른다. 주식수·발행 후 지분 비중처럼 positive share basis를 요구하는 산식은 0 또는 음수 분모를 `NOT_COMPUTABLE`로 차단한다. 다른 signed ratio는 denominator가 0이 아니고 해당 부호/도메인 의미가 formula revision과 reviewer decision에 명시된 경우에만 계산 가능하며 share-count rule을 기계적으로 적용하지 않는다. 값이 engine의 승인된 exact numeric representation 밖으로 나가 overflow/underflow/precision loss가 발생하면 `CALCULATION_OVERFLOW` 또는 `NOT_COMPUTABLE`로 종료하고 partial intermediate나 이전 승인값 fallback을 하지 않는다. engine range/scale threshold는 owner가 별도로 정하기 전 임의 숫자를 사용하지 않는다.

분모는 지표 family별 의미를 함께 고정한다. 단순한 기말 발행주식수나 조건부 발행 비율을 EPS로 재명명하지 않는다. EPS 후보는 해당 기간 손익 numerator의 귀속 범위와 기간가중평균 보통주 denominator를 요구하고, potential ordinary shares·convertibles·options·warrants의 희석 포함/제외 판단과 reconciliation 근거가 없으면 EPS를 `NOT_COMPUTABLE`로 둔다. 합성 경계 `FCT-17`은 상·하반기 주식수만으로 기간가중 수치가 계산 가능해 보이는 상황에서도 numerator 귀속과 잠재희석 판단이 없는 한 EPS 결과 및 기말주식수 대체를 금지한다. 이 제품 계약은 IAS 33의 EPS 계산 원칙을 지표 이름 오용 방지 근거로 참조할 뿐 회계기준 준수 EPS를 직접 산출한다고 주장하지 않는다.

자금조달 수량은 `PLANNED_NOT_ISSUED`, `ISSUED_NOT_LISTED`, `LISTED`, `SETTLED/DELIVERED` 등 사건 stage를 가진 별도 claim으로 보존한다. stage가 다르면 현재 상장/거래 가능 증가량 등 하나의 quantity basis로 합산하지 않는다. 하나의 receipt 내 planned 1,000,000주, issued 600,000주, listed 500,000주라는 합성 사례는 각 수량의 불일치가 오류인지 중간 단계 차이인지 원문·후속증거로 판단해야 하므로 부족분 400,000주/100,000주를 자동 미발행·미상장으로 단정하지 않는다. `FCT-18`은 서로 다른 stage의 양을 합산하거나 계획/발행/상장을 서로 대신 표기하지 않는 acceptance다.

FX claim은 환율 숫자 하나가 아니라 source, pair/direction, rate kind(spot/closing/contractual/other), rate effective/as-of, 거래/측정 기준일, 대상 금액 claim, 통화, 측정 목적과 policy/formula revision을 가져야 한다. 공식 accounting translation 개념은 IAS 21에 따라 transaction initial recognition, reporting-date monetary item, historical-cost non-monetary item 등 목적/측정시점별 기준이 다르므로 이를 투자 이벤트 비교용 현재환율로 일반화하지 않는다. 목적별 환율 basis가 없거나 rate date가 불명확하면 환산을 보류한다. `FCT-19`는 rate claim에 날짜가 없을 때 최신 시세를 대입하지 않고 금액 원통화 claim만 유지한다. 회계 환산액은 그 자체로 현금 유입·수취 실적이 아니며, 현금 effect는 별도의 settlement evidence를 요구한다. IAS 32의 특정 equity transaction cost 분류는 issuer의 재무제표 회계분류 규범이므로 제품의 총액/순현금 공시 claim을 자동 상계하는 규칙으로 전용하지 않는다.

> 공식 기준 근거 및 범위: IFRS Foundation [IAS 33 Earnings per Share](https://www.ifrs.org/issued-standards/list-of-standards/ias-33-earnings-per-share/)는 EPS의 earnings numerator와 기간 가중평균 보통주 denominator, potential ordinary shares의 희석 및 관련 reconciliation을 설명한다. [IAS 21 The Effects of Changes in Foreign Exchange Rates](https://www.ifrs.org/issued-standards/list-of-standards/ias-21-the-effects-of-changes-in-foreign-exchange-rates/)는 transaction recognition의 거래일 spot rate와 보고기간 말 monetary item의 closing rate 등 목적별 환산을 규정한다. [IAS 32 Financial Instruments: Presentation](https://www.ifrs.org/issued-standards/list-of-standards/ias-32-financial-instruments-presentation/)의 transaction-cost 규칙은 재무제표 회계처리에 대한 것이며 실제 공시 금액의 투자효과 의미를 자동 정의하지 않는다. 금융감독원 [기업공시 길라잡이](https://dart.fss.or.kr/info/main.do?menu=230)는 전환가액 조정 관련 공시 조건/조정일/방법과 제도 설명을 제공한다. 이 참조는 2026-11-04 확인한 conceptual guardrail이며 K-IFRS의 적용판·개별 회사 accounting treatment·실제 공시 입력 해석을 독립 승인하지 않는다.

Review decision은 승인된 `formulaRevision + inputClaimSetHash + exactOutputHash + status/assumption` tuple에만 효력이 있다. UI와 API는 독립 산출하지 않고 같은 immutable reviewed output/snapshot을 읽어야 하며, input/reviewer/output/eligibility/rights/publication hash 중 하나라도 다르면 전체 response를 거부하고 이전 승인값으로 fallback하지 않는다. 입력 revision이 바뀌고 exact output이 우연히 같아도 새 계산/검토 fingerprint가 필요하며 owner가 `REVIEWED_NO_CHANGE` 처분을 내릴 때만 별도 새 revision을 승인할 수 있다.

합성 fixture `financing-claim-review-trace.v0.json`의 `FCT-09`–`FCT-11`은 입력 claim revision에서 formula/output/reviewer/publication까지의 수치 재현, 기준일 mismatch에 따른 계산 금지, UI/API output hash mismatch의 응답 거부를 추가로 고정한다. `FCT-12`–`FCT-16`은 exact arithmetic display, FX claim, denominator domain, 누락 비용, overflow 경계다. `FCT-17`–`FCT-19`는 EPS 기간 가중평균 share/dilution basis 누락, planned·issued·listed stage 혼합, FX rate date·purpose 미확인에 따른 계산 보류다. checker가 fixture 구조와 일부 정수 산술을 재계산하지만 실제 공시 수치 검증, decimal arithmetic engine, reviewer 재계산 및 runtime UI/API parity를 입증하지 않는다.

사용자 응답과 internal review ledger는 같은 판정을 다른 serialization으로 보여주되, 독립적으로 재계산하지 않는다. 공개 snapshot에는 권리 승인된 evidence summary, status, date/measure basis, asOf와 안전한 보류 이유만 포함한다. reviewer 이름·비공개 note·candidate 점수·보안/권리 진단은 제외한다. 동일 snapshot의 UI/API parity는 consumer ID 집합, claim revision, withheld disposition, visible aggregate, canonical payload hash가 일치하는 acceptance fixture로 증명해야 한다.

합성 trace fixture [`financing-claim-review-trace.v0.json`](../fixtures/disclosure/financing-claim-review-trace.v0.json)의 `FCT-01-COMPLETE-DATE-TRACE`, `FCT-02-MISSING-EDGE-SUPPRESSES-DEPENDENTS`, `FCT-03-REVOCATION-INVALIDATES-CASH-MEASURE`, `FCT-04-CLASS-CHANGE-INVALIDATES-SHARE-CHILD`, `FCT-05-SCENARIO-INPUT-STALE-RECOMPUTE`, `FCT-06-UI-API-CANONICAL-PARITY`, `FCT-07-BODY-NOT-RETAINABLE-REQUIRES-REACQUIRE`, `FCT-08-MIXED-EPOCH-REJECTS-RESPONSE`는 기존 trace 연결·invalidation 경계, `FCT-09-NUMERIC-EFFECT-REPRODUCES-FROM-CLAIM-REVISIONS`, `FCT-10-BASIS-MISMATCH-BLOCKS-NUMERIC-EFFECT-TRACE`, `FCT-11-REVIEWED-FORMULA-OUTPUT-MUST-MATCH-UI-AND-API-HASH`는 계산 입력/산식/output hash의 재현, basis mismatch 차단, UI/API output parity를 고정한다. `FCT-12-ROUNDED-DISPLAY-REQUIRES-APPROVED-POLICY`, `FCT-13-CURRENCY-MIX-REQUIRES-EXPLICIT-FX-CLAIM`, `FCT-14-NONPOSITIVE-DENOMINATOR-BLOCKS-RATIO`, `FCT-15-MISSING-COST-IS-NOT-ZERO-NET-CASH`, `FCT-16-ARITHMETIC-OVERFLOW-DOES-NOT-PUBLISH-PARTIAL-OR-STALE-RESULT`는 반올림 미승인 표시 억제, 통화 혼합과 FX 근거, share ratio 분모, missing-vs-zero net cash 및 arithmetic overflow를 검증한다. `FCT-17-EPS-REQUIRES-PERIOD-WEIGHTED-AVERAGE-SHARES`, `FCT-18-PLANNED-ISSUED-AND-LISTED-SHARES-ARE-DIFFERENT-STAGES`, `FCT-19-FX-CONVERSION-REQUIRES-METRIC-PURPOSE-AND-RATE-DATE`는 metric별 분모/분자 의미, 사건 stage별 수량 구분, 목적·기준일 기반 환산을 고정한다. 실제 UI/API 동작이나 lineage integrity가 확인됐다는 뜻은 아니다.

합성 consumer identity/revision fixture [`consumer-identity-revision.v0.json`](../fixtures/disclosure/consumer-identity-revision.v0.json)은 `CIR-01-CONTENT-CHANGE-NEW-REVISION-SAME-IDENTITY`, `CIR-02-CLAIM-EDGE-CHANGE-PRESERVES-IDENTITY-REBUILDS-REFS`, `CIR-03-EVENT-CHANGE-NEW-IDENTITY`, `CIR-04-IMMUTABLE-CORRECTED-DATE-NEW-IDENTITY-RELATION`, `CIR-05-NATURAL-KEY-HASH-COLLISION-EXACT-CHECK`, `CIR-06-CANONICAL-AND-INDEX-CARDINALITY-MISMATCH`, `CIR-07-OLD-NEW-TRANSITION-EDGE-MISSING`, `CIR-08-SUMMARY-SEGMENT-IDENTITY-EXCLUDES-ANALYSIS-REVISION` 8종으로 stable identity와 immutable revision key 분리, canonical/reverse index 정합성 및 transition edge 누락 경계를 고정한다. checker는 fixture field consistency만 검사하며 실제 SHA/JCS bytes·DB FK·transition resolver 실행을 검증하지 않는다.

`FollowUpCase` 최소 논리 계약은 아래 필드가 같은 revision/hash graph에 묶이는 것이다. 이것은 새 DB 테이블 승인 사양이 아니며 현재 `investment_calendar_events`가 이를 저장한다고 뜻하지 않는다.

| 필드 | 의미와 제한 |
|---|---|
| `caseId`, `caseRevision`, `eventFamily`, `taxonomyVersion` | 안정 case와 불변 revision; 재분류는 새 revision이며 과거 승인 수정 금지 |
| `subjectInstrumentId`, `partyRole`, `eligibilityFingerprint` | 정확히 검증된 영향 subject와 filing party 역할; 여러 subject는 case를 분리하거나 대상별 child로 나눔. common/master/cap/current gate가 닫히면 해당 subject child suppress |
| `anchorFilingRevision`, `anchorClaimIds`, `anchorDateAssertionIds` | 후속 확인 대상인 최초 계획/조건/일정 및 직접 locator. 비슷한 제목이나 ticker만으로 연결 금지 |
| `expectedEvidenceTypes[]`, `requiredClaimSet`, `forbiddenInference[]` | 어떤 구체 claim을 어떤 official evidence로 확인해야 하는지 및 금지 추론. family template는 taxonomy/owner 승인을 받아 versioned |
| `sourceScope[]`, `coverageRequirement`, `lastReconciledAsOf`, `coverageAssertionIds[]` | 검색한 provider/receipt window, 권리 action, pagination/coverage 제한, 마지막 성공 reconciliation. 조회 범위가 목표를 덮지 않으면 결과 없음은 `NOT_FOUND_IN_SCOPE` |
| `evidenceItems[]` | source revision/hash, correction lineage, locator, exact fact/status, unit/security class/as-of, 권리 판단, supporting/contradicting role 및 reviewer disposition |
| `stageAssertions[]`, `unresolvedRequirements[]` | 단계별 `CONFIRMED/CONTRADICTED/NOT_REPORTED/NOT_FOUND_IN_SCOPE/CONFLICTED/UNVERIFIED` 상태와 의존 증거·다음 확인 이유. 한 stage의 성공은 다음 stage를 자동 완료하지 않음 |
| `terminalDisposition`, `reviewDecision`, `dependencyFingerprint`, `nextAction` | 명시적 종료 종류, owner/reviewer 및 대상 hash, 재검토 trigger. evidence·scope·taxonomy·eligibility 변경 시 stale/reopen |

모든 stage는 **예상 확인일**과 **완료 판정 근거**를 분리한다. 일정이 지나면 자동 `OVERDUE`를 event 상태가 아니라 내부 확인 task의 urgency 후보로만 만들고, 승인된 source scope를 다시 조회한다. 검색 결과에 없다는 것은 오직 `NOT_FOUND_IN_SCOPE`이며, coverage/window/correction lineage가 수용되지 않으면 `OUTCOME_NOT_VERIFIED`다. 후속 문서가 원래 의무를 직접 언급하지 않으면 `NOT_RESTATED`; 명시적인 완료/취소를 주장하는 claim과 해당 claim의 근거가 있어야 terminal state 후보가 된다. 실제 납입·발행·거래 효과처럼 서로 다른 주장은 각각 독립된 stage assertion으로 유지한다.

같은 당사자 및 계약/증권 lifecycle로 연결될 근거가 있는 후속 공시가 여러 개면 단일 “최신 공시”를 고르는 대신 graph relation (`AMENDS`, `REPORTS_STAGE`, `RESULT_OF`, `CANCELS`, `CONTRADICTS`)을 검토한다. relation이 불확실하면 별도 후보로 병치한다. 결과 filing에서 anchor claim의 일부만 다루면 확인된 stage만 resolve하고 나머지는 유지한다. 정정·철회, rights revoke, subject identity 변경, source coverage stale, event revision 교체는 의존 case를 자동 `REOPENED/REVIEW_REQUIRED`하고 이전 완료/알림을 새 버전에 상속하지 않는다.

투자자 화면은 공시 계획과 확인된 결과를 나란히 보여주는 데 그치고, 후속 case 상태를 투자 recommendation, 확률 또는 매수/매도 신호로 환산하지 않는다. 최소 표현은 “마지막 공식 확인 시각”, “이번에 확인된 단계”, “아직 공식 근거가 없는 단계”, “확인에 사용한 source/scope”, “정정·반대 근거”, “다음 재확인 조건”이다. `CONFIRMED`는 특정 stage와 수치/당사자에만 적용하며 전체 event 완료 배지가 되지 않는다. user watchlist는 case 소유·실제 보유·결과 구독을 뜻하지 않고 opt-in 구독만 개인 delivery를 연다.

수용 fixture 분모에는 증자에서 `배정은 됐으나 납입 미확인`, 납입과 발행/상장 시점 차이, CB 일부 전환 및 리픽싱, EB 기초주식 매수/교환 혼동, 합병 한쪽 주총 승인만 확인, 효력 후 신 ticker 거래 개시 미확인, 양수도 대금 지급과 자산 이전 분리, 후속 공시에 anchor fact가 재기재되지 않음, 같은 날짜의 무관 공시, 정정 chain 중간 누락, 부분 pagination/valid-empty, source rights 제한, subject의 master/cap 부적격 전환, reviewer가 stage 완료에 이견인 경우를 포함한다. 기대 조건은 단계 간 자동 승격 0건, scope 밖 검색 결과 기반 완료 0건, 기준일/주식 class mismatch 계산 0건, 미해결 stage를 감춘 전체 완료 표시 0건이다.

##### T0 유상증자 follow-up gold fixture 분모 v0 제안

이 분모는 owner 승인 전 acceptance 실행/통과 기준이 아닌 fixture catalog 제안이다. fixture를 생성할 때 각 케이스에 동일 `corp_code`, issuer 후보, original/correction/related filing의 `rcept_no`, `report_nm`, `rcept_dt`, `rm`, source query parameters와 page/total metadata, exact source guide version/hash, event/subject/claim/date expected graph, 권리상 사용 가능한 artifact locator/hash, 기대 상태 및 금지 추론을 붙인다. 실제 제출 본문을 fixture로 보존할 권리가 확인되지 않으면 허용되는 metadata/locator/hash만 남기고 body 검증 fixture 수와 섞지 않는다.

| 계열 | 최소 fixture 변형 | 통과 판정 핵심 |
|---|---|---|
| F0 원형 계획 | 최초 유상증자 결정, `piicDecsn.json` 같은 접수번호 응답에 `nstk_ostk_cnt`, `nstk_estk_cnt`, `bfic_tisstk_ostk`, `bfic_tisstk_estk`, 자금목적 금액이 존재 | 보통주/기타주식·계획/실제·회사 제출/상장 subject가 분리되고 계획값만 주장 |
| F1 본문-structured 불일치 | DS005 응답과 연결 원문/첨부의 주식 수·방식·금액 중 하나가 다름 | 두 source value를 보존해 `CONTESTED`; 임의 우선순위/평균/후속 계산 공개 없음 |
| F2 동일 제목 다수 filing | 같은 issuer가 여러 번 “유상증자 결정” 제출, 사업목적/대상/조건 일부만 유사 | 제목·인접 접수일·issuer만으로 correction edge를 자동 확정하지 않음; 불명 edge는 별도 candidate |
| F3 `rm=정` | 최초 row의 metadata에서 후속 정정 참조 표식 관찰, 실제 대상 receipt relation 미확정 | 영향 scope suppression/review trigger는 만들 수 있지만 target filing과 value supersession은 reviewer/source evidence 전 미확정 |
| F4 `[기재정정]`/`[첨부정정]` | 목록 `report_nm` marker와 원문 정정 범위가 서로 다르거나 첨부만 바뀜 | listing marker는 candidate discovery일 뿐 field/claim impact 범위를 증명하지 않음; byte/hash·attachment lineage 필요 |
| F5 정정의 정정 | original → correction A → correction B, B가 수량만 재정정하거나 일정만 재정정 | DAG 방향/receipt uniqueness 검증, 영향 claim만 새 revision으로; 미언급 claim은 제거/승계 판정 금지 |
| F6 정정 결과 상태 | 계획 신주 100 단위에서 정정 계획 80, 배정 결과 70, 납입 보고 65 등 각 단계가 일부 제공되는 synthetic case | 수치는 서로 다른 typed stage claim. 65 납입값만으로 65 발행/상장 완료라 하지 않음 |
| F7 배정·납입 gap | 주주/제3자 배정 보고에 배정 수량은 있으나 대금 납입 또는 실권분 결과가 없음 | `ALLOTMENT_RESULT`만 confirm하고 납입/최종 발행 수량은 unresolved 유지 |
| F8 납입-발행 gap | 납입 보고는 있으나 등기/발행 또는 신주 상장 확인이 없음 | 자금 납입과 발행/상장 단계를 독립 유지; 신규 발행주식수·시장 거래 가능 주장을 막음 |
| F9 혼합 주식 종류 | 보통주+기타주식이 함께 발행되고 발행전 총수 기준일도 서로 다름 | 각 class 분리, 기준일 불일치 분모 계산 차단, common-stock eligibility를 issuance 종류에서 추론하지 않음 |
| F10 자금 목적 합계 | 시설/운영/채무상환 등 세부합과 총조달액 불일치, 빈 값/0/제공 전 필드 포함 | unknown/null/zero 의미를 구별, 공식 schema version 전후 필드 차이를 보존, reconciliation 불일치 표시 |
| F11 철회·취소·미실행 | `rm=철` 또는 철회/취소 제목 marker 있으나 정확한 철회신고서/원문 관계가 미해결 | 철회 후보와 사건 자체의 취소 fact를 분리; source scope 억제, 직접 증거 전 `CANCELLED_CONFIRMED` 금지 |
| F12 valid-empty/coverage | `list.json`은 `status=000`이나 해당 날짜 page 결과 없음, DS005는 `013` 또는 API 제한/장애 코드 | 빈 목록/`013`/실패를 후속결과 없음·미실행으로 사용하지 않고 window coverage 상태로만 기록 |
| F13 지연 후속 | anchor 후 승인 reconciliation window 내 또는 밖에 늦은 배정/납입/정정 filing 도착 | 기존 terminal candidate stale/reopen, receipt 집합 및 `asOf`에 따라 case 재평가, 새 근거가 과거 notification revision을 덮지 않음 |
| F14 issuer/subject 부적격 | corp_code와 종목 code 후보가 다르거나 회사명·상장종목 매핑/active common-stock/cap assertion이 stale·부적격 | issuer filing facts 내부 보존 가능 범위와 별개로 해당 instrument subject publication은 fail-closed |
| F15 권리 경계 | list metadata·DS005 응답·제출뷰어/원문·파생 compare·알림별로 action 권한이 다름/미확인 | source마다 허용된 payload class/action으로 분리; 비허용 body 저장·파생·인용 금지, 결과 `UNVERIFIABLE/BLOCKED_RIGHTS` |
| F16 조회 대상/관계 오인 | DS005 endpoint가 corp_code/접수일 검색 결과를 반환하지만 원래 `list.json` receipt와 mapping 충돌/복수 후보 | 결과의 `rcept_no` exact join 필수. 이름·날짜 근접으로 join하지 않고 ambiguous relation은 unresolved |

공식 가이드로 직접 확정 가능한 고정점은 DS001 `list.json`의 `last_reprt_at=N`이 정정보고서를 포함한 제출 보고서 전체를 검색한다는 점, `report_nm`의 정정/첨부/조건확정 marker의 설명, `rm=정/철`의 후보 의미, DS005 유상증자 `piicDecsn.json`의 회사코드·접수일 기간 요청 및 응답 `rcept_no`, 보통주/기타주식 신주수·증자 전 발행총수·목적별 금액 필드다. 이들 공식 명세는 DS005가 특정 field의 일부 정보라는 한계, original filing 연결 전체 그래프, body fidelity, 실제 정정 최종성 또는 후속 모집단의 완전 검색을 보장하지 않는다. 특히 현재 `fetchOpenDartToday()`는 당일 한 날짜와 `total_page`까지만 조회하며 `last_reprt_at`을 명시하지 않는다. 그러므로 그 실행 결과는 이 gold fixture의 역사 lookback/correction denominator를 만족한다고 간주할 수 없다.

Gold set 모집단은 단순 “정정 공시 샘플 수”가 아니라 선택된 issuer × 승인된 기준일/overlap window의 모든 관련 original·candidate correction·allocation/payment/result/withdrawal receipt를 receipt 단위로 고정한다. 최소 positive `RESOLVED_RELATION`, negative `UNRELATED_SAME_ISSUER_OR_TITLE`, `UNRESOLVED_RELATION`, `SOURCE_UNAVAILABLE`, `RIGHTS_BLOCKED` class와 해당 전체 발견 분모를 함께 보고한다. DS005 API의 한 번의 날짜 검색이나 검색 성공 건수는 list 전체 모집단·원문 검증 가능한 분모로 치환하지 않는다. 표본 기간, issuer 선정법, 최소 건수, 허용오류율과 reviewer 일치도는 `KR-SHADOW-SLO-01` 및 `KR-END-TO-END-ACCEPTANCE-01` owner가 실제 수집 비용/권리 범위를 보고 승인하기 전 미정이다.

##### T0 유상증자 계획 대비 이행 공개 DTO/표현 계약 제안

이 계약은 user-facing conclusion과 reviewer evidence를 같은 응답에 뒤섞지 않는다. 공통 `FollowUpCaseRevision`은 승인된 immutable projection의 참조만 제공하고, 각 단계의 `PlanObservationComparison`은 계획값·후속 관측값·비교 판정·근거·분모·as-of를 한 묶음으로 표현한다. API와 UI가 별도로 status를 재계산하거나 단위/보통주 구분을 합치는 것을 막기 위한 논리 DTO이며 현재 API 구현, DB schema 또는 공개 권한 승인 사양이 아니다.

| 논리 필드 | type/필수 | 표시·검증 계약 |
|---|---|---|
| `caseId`, `caseRevisionId`, `caseHash`, `snapshotId`, `asOf` | 안정 ID/hash + UTC 시각 | 모든 child stage가 같은 approved case revision/public snapshot에 결박. app 현재시각이 아니라 증거·coverage snapshot의 기준시각 |
| `subject` | `{market, instrumentId, displayName, commonStockAssertionId, capEligibilityId}` | publication-ready subject만 포함. 미승인/부적격 대상은 ticker 없는 내부 case 또는 공개 억제; filing company name만으로 instrument 생성 금지 |
| `anchor` | `{receiptNo, receiptDate: DATE_ONLY, reportType, revisionId, sourceLink}` | 계획의 anchor가 된 실제 filing revision. 접수일을 발표 시각으로 표시하지 않고 source link/권리 gate 적용 |
| `planClaims[]` | `{claimId, stageKind, securityClass, typedValue, unit, currency?, basisDate?, sourceRef}` | 공시 계획 주장. common/other shares를 분리, 발행 전 총수·계획 신주수·금액·납입 예정값을 서로 다른 concept으로 유지 |
| `stageComparisons[]` | `{stageKind, status, planClaimIds[], observedClaimIds[], plannedValue?, observedValue?, comparison, reasonCode}` | 계획 없음/후속 미기재/조회 안 됨/값 충돌/비교 불가를 구분. `CONFIRMED`는 지정 stage만 확정 |
| `comparisonBasis` | `{sameIssuer, sameEventRelation, sameSecurityClass, sameUnit, samePeriodOrDateBasis, correctionLineageStatus}` | 모든 true/false/unknown의 근거를 제공. 핵심 basis 중 하나라도 false/unknown이면 numeric delta·완료 상태를 숨김 |
| `evidence[]` | `{evidenceId, receiptNo, sourceProduct, sourceRevisionHashOrNonRetentionReason, locator, claimIds[], role, rightsActionId}` | UI label·숫자마다 claim/evidence chain. body non-retention이면 정확 locator/hash/제약 표시하고 body-derived assertion이라고 가장하지 않음 |
| `coverage` | `{scopeId, windowStart, windowEnd, pageStatus, correctionPassId, assertionId, asOf, freshness}` | 검색 범위와 완료성. `VALID_EMPTY`, partial, non-snapshot, `UNKNOWN`을 정상 결과와 구분하고 “조회 결과 없음” 범위를 좁게 설명 |
| `openQuestions[]` | `{questionCode, missingEvidence, blockedStageKinds[], nextCheckTrigger}` | 사용자 안전 문구 후보. 내부 비공개 event/권리 정보 누출 방지 후 공개 가능한 reason만 허용 |
| `review` | `{decisionId, targetFingerprint, disposition, reviewerRole, decidedAt, expiresAt?}` | 화면에 안전한 승인/미확인 요약만 표시; 내부 reviewer ID·메모는 제외. target mismatch/expiry면 공개 snapshot에서 제거 |

단계 상태와 비교 상태는 직교한다. stage status 후보는 `NOT_DUE`, `DUE_CHECK_REQUIRED`, `EVIDENCE_OBSERVED`, `PARTIALLY_CONFIRMED`, `CONFIRMED_FOR_STAGE`, `CONTRADICTED`, `NOT_REPORTED`, `NOT_FOUND_IN_SCOPE`, `CONFLICTED`, `UNVERIFIABLE`; comparison은 `SAME_BASIS`, `VALUE_CHANGED`, `BASIS_CHANGED`, `NOT_COMPARABLE`, `NO_PLAN_VALUE`, `NO_OBSERVED_VALUE`로 둔다. `CONFIRMED_FOR_STAGE`는 issue/payment/listing 등 이웃 단계를 완료시키지 않는다. `NOT_FOUND_IN_SCOPE`는 명시한 성공 search scope 안에서만 결과를 말하고 `NOT_REPORTED`는 읽은 후속 filing이 해당 사실을 다시 언급하지 않음을 말한다. `UNVERIFIABLE`는 coverage/rights/source retrieval 근거가 부족한 상태다. taxonomy owner 승인 전 enum은 proposal이다.

숫자 출력은 (1) filed plan raw value+unit, (2) 최신 후속 filing에서 직접 확인된 actual/observed raw value+unit, (3) 두 값이 같은 issuer/event/security class/unit 및 동일 의미의 stage임을 검증한 경우의 delta 후보를 별도 열로 둔다. 예컨대 “배정 70주, 납입 65주”처럼 stage가 다른 값은 delta로 만들지 않는다. plan quantity 100과 allotment 70을 단순히 나란히 보일 수는 있지만 `70% 완료` 같은 비율은 목적/분모와 미배정·실권 처리 근거가 모두 승인된 경우에만 파생 가능하다. null, blank, `-`, 0, API field absent는 guide/version 및 원문으로 semantics가 입증되기 전 서로 바꾸지 않는다. 민감하거나 권리상 display가 허용되지 않는 source reference는 UI link/locator에서도 숨긴다.

사용자 요약은 다음 고정 순서로 조립한다: **현재 확인 단계 → 공시 계획 대비 확인된 값(있을 때만) → 아직 확인되지 않은 다음 단계 → 확인 범위와 마지막 시각 → 정정/충돌/권리상 보류 표시**. 최신 stage가 incomplete면 헤더에 `발행 완료`, `자금 조달 완료`, `희석 확정`을 쓰지 않는다. 예시(합성): “정정된 계획 신주 80만 주. 배정 결과 70만 주를 확인했습니다. 납입·발행 여부는 현재 확인되지 않았습니다. 확인 범위: 2026-04-01~2026-05-15 공시 검색, 마지막 확인 2026-05-16 02:10 UTC. [공시 계획] [배정 결과 근거]”. 이 문구는 `확인 범위` 전체가 승인되고 사용자 공개가 가능한 경우에만 사용하며 실제 출시 데이터가 아니다.

API/UI acceptance는 동일 snapshot fixture의 각 stage claim ID·value/unit·status·comparison·source link·coverage status 및 suppress disposition이 byte/semantic parity를 이뤄야 한다. 회귀 조건은 다음을 포함한다: 수치가 같지만 security class/basis date가 다른 값을 동일 비교하는 경우, correction relation이 unresolved인데 “정정 계획”으로 표시하는 경우, DART valid-empty/partial window에서 “후속 없음” 문구를 표시하는 경우, 발행 완료 근거 없이 completion headline을 표시하는 경우, UI가 `NOT_REPORTED`와 `NOT_FOUND_IN_SCOPE`를 한 상태로 축약하는 경우, 공개 DTO에서 reviewer note·개인 watchlist·내부 blocker가 새는 경우. `KR-API-UI-CONSISTENCY-01`, `KR-TAXONOMY-01`, `KR-DOCUMENT-UX-01` 승인 및 P7 source-to-publication acceptance 전에는 사용자-facing API/UI 구현·배포를 승인하지 않는다.

##### 합성 DTO golden vector v0 제안

Golden vector는 실공시, 실제 회사·ticker, 접근 비허용 원문 또는 실제 데이터 hash를 담지 않는다. 파일 위치/버전은 `docs/fixtures/disclosure/follow-up-equity-raise.v0.json` 제안이며, vector마다 synthetic stable IDs와 `sha256:` 형식의 비실데이터 hash label을 사용한다. 아래는 필수 case와 핵심 expected result 요약이고, artifact는 case input와 complete expected stage/publication summary를 고정한다.

| Vector ID | synthetic input 요약 | 핵심 expected DTO | 필수 rejection/assertion |
|---|---|---|---|
| `FUER-01-PLAN-ONLY` | 계획 보통주 100만 주, 배정·납입·발행 후속 근거 없음, coverage current가 아닌 test-scope | 계획 stage `EVIDENCE_OBSERVED`; 배정·납입·발행 `NOT_FOUND_IN_SCOPE` 또는 scope에 따라 `UNVERIFIABLE`; completion 없음 | 예정 수량을 발행 완료/희석 확정/조달 완료 headline으로 변환 금지 |
| `FUER-02-ALLOTMENT-PARTIAL` | 계획 100만 주; 정확히 연결된 후속에서 배정 70만 주만 확인; 납입 미보고 | 배정 `CONFIRMED_FOR_STAGE`, 계획 대비 `VALUE_CHANGED`; 납입·발행 미확인; 같은 snapshot/claim/source refs | `70% 완료`, 납입, 발행/상장으로 확대 해석 금지 |
| `FUER-03-PAYMENT-NOT-ISSUANCE` | 정정 계획 80만 주; 배정 70만 주; 납입 보고 65만 주; 발행 확인 없음 | 원/정정 plan lineage 별도, 배정 70만·납입 65만 각각 확인, plan-vs-allotment 비교 가능 시에만; issuance 미확인 | 65만 납입을 65만 주 발행으로 표시 금지; 다른 stage의 수량끼리 delta 금지 |
| `FUER-04-BASIS-MISMATCH` | 계획 보통주 80만 주; 관측 80만 주는 기타주식 또는 기준일/단위가 다름 | 해당 observed claim은 역할/종류 표시, comparison `NOT_COMPARABLE`/`BASIS_CHANGED` | 수치 같음을 근거로 `SAME_BASIS`/`VALUE_UNCHANGED` 금지 |
| `FUER-05-UNRESOLVED-CORRECTION` | 같은 issuer의 `rm=정`/`[기재정정]` 후보가 있으나 원접수 relation이 ambiguous | candidate relation unresolved, 영향 claim review/suppressed, 새 plan 값을 active plan에 올리지 않음 | 제목·근접 날짜·회사만으로 correction relation 또는 current revision 결정 금지 |
| `FUER-06-VALID-EMPTY` | 명시된 성공 query window는 빈 결과이나 required historical/correction scope가 불충분 | 해당 window 상태만 `VALID_EMPTY`; case `OUTCOME_NOT_VERIFIED`/`UNVERIFIABLE` | “후속 공시 없음”, “미실행”, `CANCELLED` 추론 금지 |
| `FUER-07-PARTIAL-COVERAGE` | page/API quota/error 누락으로 source window 일부 실패 | coverage `PARTIAL/FAILED`; 영향 stage `UNVERIFIABLE`; publication suppress | 부분 응답에서 확인된 receipt만으로 case terminal 완료 금지 |
| `FUER-08-ISSUANCE-CONFIRMED-LISTING-UNKNOWN` | 권한 있는 evidence에서 실제 발행은 확인, 거래소 신주 상장/거래개시는 미확인 | 발행 stage만 `CONFIRMED_FOR_STAGE`; listing stage `NOT_REPORTED`/`NOT_FOUND_IN_SCOPE`/`UNVERIFIABLE` | event 전체 `COMPLETE` 또는 자유롭게 거래 가능 표현 금지 |
| `FUER-09-OTHER-STOCK-ONLY` | 기타주식 신주만 관측되며 보통주 issuance 없음 | 기타주식 claim 보존; 보통주 issuance projection 생성 안 함 | 신규 common instrument/share count 또는 watchlist common subject와 혼합 금지 |
| `FUER-10-RIGHTS-BLOCKED` | 목록 metadata는 허용, structured/body field 또는 파생 공개권리는 미승인 | 공개 payload는 허용 scope의 metadata만; 차단 stage reason은 safe public reason code로만 | 미승인 수량·인용·내부 rights note 유출 금지 |
| `FUER-11-MASTER-CAP-STALE` | 동일 issuer facts는 있지만 subject master/cap assertion expired 또는 ineligible | 내부 case/evidence 유지 가능 범위에서 subject publication suppressed | 과거 eligibility 승인으로 신규/current subject 노출 금지 |
| `FUER-12-SNAPSHOT-MISMATCH` | plan은 snapshot S1, allotment/status는 S2 또는 UI가 stage status를 독립 재계산 | 전체 response reject/suppress, public response 없음; 같은 snapshot에서 재요청 | 부분 stage, 서로 다른 `asOf`, stale cursor로 fallback 금지 |

`FUER-08`은 읽은 후속 filing에서 상장 claim이 재기재되지 않았고 별도 listing search는 아직 수행하지 않은 경우를 fixture input으로 명시한다. 이 때 `LISTING=NOT_REPORTED`는 오직 그 filing의 내용상 부재이며, KRX 추가상장 search 결과가 빈 상태(`NOT_FOUND_IN_SCOPE`) 또는 source retrieval 실패(`UNVERIFIABLE`)와 동의어가 아니다. 세 경우 모두 최종 market outcome은 독립 근거가 생기기 전 `OUTCOME_NOT_VERIFIED`로 남는다.

각 vector의 필수 top-level expected envelope는 `contractVersion`, `caseRevisionId`, `snapshotId`, `asOf`, `publicationDisposition`, `stageComparisons[]`, `coverage`, `allowedPublicTextKeys[]`, `forbiddenPublicText[]`, `sourceClaimBindings[]`를 가진다. `allowedPublicTextKeys`는 완성 문구 string이 아니라 UI가 조립할 승인된 message key이며, forbidden list는 test-only assertion이고 public payload로 직렬화하지 않는다. Numeric claim의 golden value는 JSON number 대신 exact decimal string + unit을 사용해 큰 수·소수·정밀도 변환을 피한다. 모든 stage는 source claim ID, receipt ID, locator 또는 non-retention reason, correction lineage, same-basis predicate의 input을 연결한다.

Golden assertions는 (a) 수용된 snapshot row 안 모든 public number/label이 하나 이상의 supported claim 및 allowed display action으로 역추적, (b) 하나의 case 응답 안 stage·coverage·eligibility·publication이 같은 `snapshotId/asOf`, (c) suppression이면 numeric/body/evidence URL/detail deep link를 부분 반환하지 않음, (d) numeric comparison은 same issuer+event relation+security class+unit+period/date basis+correction disposition이 모두 입증될 때만, (e) blank/zero/absent 차이를 유지, (f) unknown/partial/rights/master/cap failure를 completion/negative fact로 정규화하지 않음, (g) caller identity/watchlist/internal reviewer note를 제거, (h) API DTO와 UI render model이 message key·stage/order·reason class에서 동일함을 대상으로 한다. 2026-11-04 제안 후속 작업에서 JSON vector artifact 및 checker의 version/12-ID 분모/필수 봉투 구조/핵심 stage 분리·coverage·snapshot fail-closed assertion만 정적 검사하도록 연결했다. 이 checker 실행은 실제 source claim trace, JSON Schema 적합성, vector expected 결과의 산출, API serialization, UI parity, provider/DB/runtime acceptance를 검증하지 않는다. 나머지 golden assertions를 실제 API/UI 구현과 결합한 실행형 acceptance gate는 P6/P7 후속 승인 항목이다.

#### 후속 item·구독 계약

- 제안되는 내부 `FollowUpTask`는 `taskId`, task kind, event/date/claim revision IDs, triggering evidence/coverage hash, source `asOf`, due semantics, state/history, assignee role, last attempt/result, next retry condition, suppression/publication epoch을 추적한다. task 생성과 재시도는 같은 dependency fingerprint에서 idempotent해야 하며, 새로운 원천/revision은 새 attempt/lineage로 남긴다.
- 사용자 event 구독은 종목 watchlist와 별개의 명시 opt-in으로 둔다. 관심 종목 watchlist가 있다는 이유로 모든 사건 알림을 보내거나 보유 종목이라고 추정하지 않는다. 구독 범위는 market/instrument/event type/status transition을 구체적으로 고정하고 사용자가 조회·수정·해제할 수 있어야 한다.
- 구독 알림 deduplication은 `recipient + eventId + eventRevision/dependencyFingerprint + transition/actionKind + dateAssertionId`로 식별한다. 같은 상태/근거의 반복 reconciliation은 새 알림을 보내지 않고, superseding/correction/rights suppression 같은 의미 변화는 이전 알림과 연결된 새 revision 알림 후보가 된다. delivery 실패와 알림 내용 변경은 분리해 재시도한다.
- task 상태(`OPEN`, `WAITING_FOR_SOURCE`, `REVIEW_REQUIRED`, `RESOLVED`, `CANCELLED`)와 event 상태/date certainty를 다른 enum으로 유지한다. 사용자의 `ACKNOWLEDGED`, `DISMISSED`, `SNOOZED` 응답은 user-subscription delivery state에만 적용하며 `COMPLETED`/`CANCELLED` event transition을 만들지 않는다. 내부 task의 `RESOLVED`는 지정된 증거 및 reviewer 조건이 확인됐을 때만 허용한다.
- 재알림 간격, confirmed/estimated별 사전 알림 시점, 사용자별 채널, quiet hours, 사용자 로컬 timezone, 보존·삭제 기간, 최대 일일 발송량은 `KR-DOCUMENT-UX-01`, `KR-OPERATIONAL-SECURITY-01`, `KR-RETENTION-01` 책임자 승인 전 미정이다. 이벤트 종류·확정성·source freshness별 별도 지표/분모로 shadow 평가한다.
- 모든 사용자별 구독/확인 응답/선호는 사용자 데이터로 취급하고 공개 GET, 시장 전체 API, 공용 Discord에 포함하지 않는다. 사용자 인증·접근제어, 목적 제한, opt-out, 계정 삭제와 audit retention, notification provider 재시도 권한을 별도 결정한다. 기존 DART 제목 후보 Push/Discord automation이나 schema-only 투자 캘린더에 이 기능이 이미 있다고 문서화하지 않는다.

#### 무효화·부정 후속정보와 이미 보낸 알림 처리

새 정보는 **기초 사실/권리 무효화**, **사실은 유지되고 방향 해석만 약화**, **사건 결과 확정**, **후속 정보 미확인**으로 나눈다. 이 분류는 서로 다른 회수·정정 동작을 요구한다.

| 상황 | canonical event/publication 동작 | 알림/사용자 화면 동작 |
|---|---|---|
| correction/withdrawal/document replacement, 원 claim 거짓·불지원·locator 붕괴, rights revoke 또는 subject identity 오류 | 먼저 source/target suppression과 publication epoch를 기록하고 새 claim/event revision 및 독립 review 전 공개 차단 | 대기 중인 이전 revision 발송은 취소 후보; 이미 provider가 수락한 전송은 `DELIVERED_UNRETRACTABLE`로 보존하고 권리 허용 범위의 `CORRECTION/RETRACTION` 후속 메시지를 새 notification ID와 이전 ID 링크로 생성 |
| 새 공식 반대 근거·희석/조건/실행 위험이 추가되지만 핵심 factual event는 유지 | 기존 fact를 삭제하거나 event를 취소하지 않고 영향 해석을 재평가; 필요하면 `MIXED/UNCERTAIN/NEEDS_EVIDENCE` 새 revision 승인 | 구독 조건이 영향/리스크 변경을 포함할 때만 “평가 변경” 알림. 최초의 긍정 표현을 최신 상태처럼 유지하지 않고 해당 event 상세는 최신 승인 revision으로 갱신 |
| 완료·미실행·취소가 공식 결과 근거로 확인 | 해당 lifecycle transition을 새 event revision으로 승인; 계획치·과거 알림 이력은 유지 | 결과/취소 상태 후속 메시지를 별도 delivery로 남기고 기존 일정 알림을 완료로 덮어쓰지 않음 |
| 예정일 경과, 원천 조회 실패/부분 coverage 또는 후속 공시 없음 | event를 `COMPLETED/CANCELLED`로 자동 전이하지 않고 source freshness/coverage 상태에 따라 `OUTCOME_NOT_VERIFIED` 유지 | 결과를 추정하는 메시지는 보내지 않는다. 필요한 경우 “결과 확인 불가/조회 상태”라는 사실만 별도 표시 |

발송 worker는 durable outbox에서 claim한 뒤 dispatch 직전에 recipient opt-in, rights/channel approval, publication decision, exact event revision/dependency fingerprint와 최신 revocation epoch를 다시 확인한다. revision/epoch가 달라졌거나 active suppression이 있으면 이전 message body를 버리고 `STALE_SUPPRESSED`로 terminalize한다. payload에는 승인된 최소 변경 안내와 앱의 검증 가능한 deep link만 넣고, quote/세부 판단/민감한 보유정보를 푸시 미리보기에 복제하지 않는 것을 기본 제안으로 둔다. 링크를 열 때는 현재 publication gate와 epoch를 다시 검증하고 만료/보류된 내용은 반환하지 않는다.

알림 미리보기는 OS 잠금 화면·공유 기기·푸시 provider 로그에 남을 수 있는 외부 노출면으로 취급한다. `ESN-11`은 공시 원문 인용, 투자 결론, 개인 watchlist/보유 정보를 preview와 provider payload에서 제외하고 승인된 최소 안내 및 검증 가능한 앱 링크만 허용하는 경계를 고정한다. `ESN-12`는 이미 도착한 푸시의 과거 링크를 열 때 push에 담긴 캐시 본문으로 fallback하지 않고, 현재 사용자 권한·publication disposition·epoch를 다시 확인해 suppression 또는 epoch mismatch이면 사건 상세를 0건 반환하도록 한다. push 자체의 원격 삭제를 보장하지 않으며, 링크 접근은 인증 및 최신 권리 검증을 통과해야 한다.

DB 상태와 외부 push provider 전송을 하나의 원자 transaction으로 묶을 수 없으므로 exactly-once 전달을 보장한다고 쓰지 않는다. outbox attempt에는 idempotency key, provider request/receipt ID(제공되는 경우), accepted/failed/unknown 결과, 시도시각, content hash 및 epoch를 append-only로 기록한다. provider가 idempotency key를 지원하면 재시도에서 사용한다. 지원하지 않으면 provider가 수락한 뒤 응답 유실/worker crash가 난 attempt는 `DELIVERY_UNKNOWN`으로 두고 자동으로 같은 내용을 재발송하지 않으며, 중복/누락 판정 및 재전송은 재검토한다. provider의 수신 확인은 기기 표시/사용자 열람과 다르다. provider delete/cancel API가 있더라도 best-effort cleanup일 뿐 correctness gate를 대신하지 않는다.

이미 기기에 도착한 push 알림은 원격에서 지울 수 있다고 가정하지 않는다. 따라서 외부 알림에는 긍정 결론·가격 목표·확정 안 된 일정·권리 제한 인용을 싣지 않고, 사용자가 열었을 때 최신 상태를 조회하게 한다. 원문 인용 권리상 정정 알림도 허용되지 않으면 인용 없이 “정보가 변경/보류됨”이라는 최소 문구만 가능한지 별도 권리결정으로 확인하고, 그마저 불허면 해당 채널 후속 전송을 차단한다.

추가 acceptance fixture는 (a) dispatch 직전 epoch revocation과 발송, (b) provider 수락 후 worker crash/receipt 유실, (c) provider duplicate delivery/retry, (d) correction/retraction 후속 메시지와 이전 메시지 연결, (e) 사용자가 이전 push deep link를 뒤늦게 열기, (f) fact는 유지되나 direction이 POSITIVE에서 MIXED/UNCERTAIN으로 변경, (g) event 취소 근거와 filing withdrawal-only 상황, (h) rights상 corrective payload도 제한되는 경우, (i) 사용자의 opt-out/계정 삭제와 대기 outbox race를 포함한다. 이전 push를 실제 회수할 수 없는 상태에서도 stale 상세내용·인용이 앱의 공개 read endpoint에서 0건이어야 하며, delivery ambiguity는 성공이나 실패로 임의 정규화하지 않는다.

최소 acceptance fixture는 (a) 확정 date-only와 timezone 없는 local timestamp, (b) month/quarter estimate 및 정정, (c) 날짜 경과+결과 미확인, (d) 청약→배정→납입→발행 단계 중 일부만 보고, (e) 동일 근거 반복 수집과 동일 알림 dedupe, (f) 이미 전달한 event가 correction/withdrawal로 억제되는 경우, (g) rights revoke/master stale/reconciliation failure, (h) 사용자의 acknowledge/dismiss와 실제 완료의 분리, (i) 같은 종목을 watchlist에 둔 비구독자와 구독자의 수신 차이, (j) 계정 간 조회 차단·opt-out·계정 삭제를 포함한다. 표본/발송 threshold는 P7 decision owner가 승인하기 전 정하지 않는다. 이 proposal은 신규 테이블·notification channel·scheduler 구현 승인이 아니다.

공식 guide field-level spot check(전체 schema inventory나 fixture 승인은 아님): 유무상증자 `/api/pifricDecsn.json`은 유상/무상 신주 종류·수를 각각 제공하고 무상 배정 기준일 `fric_nstk_asstd`, 신주권 교부예정일 `fric_nstk_dlprd`, 신주 상장예정일 `fric_nstk_lstprd`, 이사회결의일 `fric_bddd`를 구분한다. 교환사채 `/api/exbdIsDecsn.json`은 교환청구기간 시작/종료 `exrqpd_bgd`/`exrqpd_edd`, 청약일 `sbd`, 납입일 `pymd`, 만기일 `bd_mtd`, 이사회결의일 `bddd`를 제공한다. 타법인 주식양수 `/api/otcprStkInvscrInhDecsn.json`에는 양수예정일자 `inh_prd`와 이사회결의일 `bddd`가 있다. 주식교환·이전 `/api/stkExtrDecsn.json`은 계약일 `extrsc_extrctrd`, 주주확정기준일 `extrsc_shddstd`, 명부폐쇄 시작/종료 `extrsc_shclspd_bgd`/`extrsc_shclspd_edd`, 반대의사 접수기간 시작/종료 `extrsc_extrop_rcpd_bgd`/`extrsc_extrop_rcpd_edd`를 별도 field로 구분한다. 이들은 서로 다른 `dateKind` 후보를 증명할 뿐 시간대, 실제 이행·거래개시, 최종 정정 여부 또는 공개 권리를 증명하지 않는다. 날짜 의미 매핑은 각 guide 기준 확인값으로만 고정하고, body/API 값 충돌·정정 누락이면 unresolved로 남긴다.

이 문서에서 36개 분모와 guide별 JSON endpoint 및 현재 정적 코드 검색의 consumer 상태를 고정했지만 36종 전체 상세 field inventory, date mapping, response/original reconciliation과 동적/배포 경로 consumer 조사 및 실제 호출 관측은 미완료다.

#### DART/KIND 공시 발견 source와 event taxonomy crosswalk

DS005 structured API는 DART `list.json` 전체 공시를 대체하지 않는다. 이벤트 후보 발견은 DART `list.json`의 공식 `pblntf_ty`/`pblntf_detail_ty` 분류와 receipt를 기본 source scope로 유지하고, 필요한 제품에 한해 DS005 endpoint를 동일 `rcept_no`에 보조 evidence로 연결한다. DART 가이드에서 `last_reprt_at=N`은 정정 제출을 포함한 제출 보고서 전체 검색이라고 정의한다. calendar source sweep은 이를 생략하지 않고 전체 페이지/row/정정 후보를 coverage denominator에 넣어야 한다.

| 원천 분류 | 공식 유형/예시 | 역할 및 event 처리 | identity·중복·미해결 경계 |
|---|---|---|---|
| OpenDART `list.json` A | A001 사업보고서, A002 반기, A003 분기 | 정기보고서에서 미래 일정/실적 확인 claim 후보를 발견; 보고서 게시 자체를 event로 만들지 않음 | `DART:<rcept_no>`; 보고서 본문·정정/첨부 관계와 별도 검증 |
| OpenDART `list.json` B | B001 주요사항보고서 | DS005 36종 및 원문 양식과 연결할 issuer-event 후보 | 목록 group/title만으로 DS005 유형 또는 subject 자동 확정 금지 |
| OpenDART `list.json` C | C001–C005 증권신고, C006–C010 소액공모, C011 소액매출 | 자금조달 진행·효력·청약 등 일정 후보; 증권 종류·발행사/대상자 구분 | 비보통주 issuance object는 issuer event에서 분리, common-stock 마스터 우회 금지 |
| OpenDART `list.json` D | D001 대량보유, D002 임원·주요주주 소유, D003 의결권 대리행사권유, D004 공개매수, D005 특정증권 거래계획 | 지배권·공개매수·의결권 event/기한 후보 | 보유 보고만으로 체결/의결 결과 추정 금지; 보유자와 issuer subject 구분 |
| OpenDART `list.json` E | E001 자기주식, E002 신탁, E003 합병종료보고, E004 주식매수선택권, E006 주총소집보고 | 자기주식/신탁 종료·합병 완료·주식매수선택권·총회 일정 후보 | 결정/보고/실행/완료 상태를 별도 event/date assertion으로 분리 |
| OpenDART `list.json` F/G/H/J | 외부감사·펀드·자산유동화·공정위 공시 | 보조 context 또는 해당 issuer/계열사 직접 노출이 증명된 법적 event 후보 | 투자펀드·유동화증권·비상장/공정위 당사자를 상장 common subject로 승격하지 않음 |
| OpenDART `list.json` I | I001 수시공시, I002 공정공시, I003 거래소공시, I004 지분공시 | report title/form 기반 일정 후보 discovery; 형태별 primary evidence는 원문/해당 official source로 resolve | 코드 I만으로 event kind를 확정하지 않고 detail type/title/template를 보존 |
| KIND issuer disclosure | KIND 상세검색 수시공시 하위분류 예: 배당, 주주총회관련, 증자/감자, 단일판매/공급계약, 영업양수도/분할/합병, 주식교환/이전, 주식분할/병합, 자기주식 | DART 공시의 issuer-side discovery/display 및 KRX 분류 보조 | 같은 기업 공시의 DART alias는 동일 accession이 확인될 때만 canonical filing에 alias 연결; 제목/날짜 유사도만으로 자동 병합 금지 |
| KIND market action | 매매거래정지/재개, 권리락·배당락·기준가격, 투자주의/경고/위험, 관리·실질심사·상장폐지 및 기타 시장안내 | 거래소가 게시한 시장상태/거래일 event 원장. `TRADING_HALT`, `TRADING_RESUME`, `EX_DATE`, `MARKET_STATUS_EFFECTIVE` 등 issuer corporate event와 다른 taxonomy | 거래소 공지 ID/링크/hash·공시시각·유효 거래일을 기록. 거래소 안내를 issuer filing으로 위장하거나 회사의 의도·법적 효력 날짜로 추론하지 않음 |

이 분류들은 서로 다른 namespace다: 공급자 분류(`pblntf_ty/detail_ty` 또는 KIND category), 보고서 양식/문서 type, 내부 `eventKind/dateKind`, 시장조치 type을 한 enum으로 합치지 않는다. typed mapping release가 이 차원 간 관계와 버전을 선언하고, 미매핑 분류는 `UNCLASSIFIED_SOURCE_TYPE`으로 격리한다. DART/KIND 양쪽에서 같은 issuer disclosure가 보여도 exact shared receipt가 확인될 때만 alias 처리하고, KIND 자체 시장조치는 별도 canonical source/event다. 별도 원천별 pagination/기간/누락률을 관리하며 한쪽의 정상/빈 결과는 다른 쪽의 coverage를 대신하지 않는다. KIND UI의 검색/ RSS 진입점은 관찰 가능한 발견 surface이지 stable API schema·전체 historical coverage·장기 보존/재배포 권한의 증거가 아니다. 해당 contract/rights snapshot이 확보되기 전 KRX-originated data coverage는 `UNKNOWN`으로 남긴다.

#### 저장소 KIND RSS 구현 관찰과 identity/coverage gate

현재 코드의 `lib/domestic-rss-sources.ts` 기본 KIND URL은 전체시장 요청 파라미터 `mktTpCd=0`과 `currentPageSize=100`을 사용한다. `lib/market-rss.ts`는 RSS `guid` 또는 Atom `id`를 우선 쓰고, 둘 다 없으면 `${source}:${publishedAt || "unknown"}:${index}`를 만든다. 이 값은 원천이 보장한 filing identity가 아니며 입력 순서·페이지 구성에 따라 바뀔 수 있다. `lib/market-rss-pipeline.ts`는 이를 `(source, externalId)` conflict key로 영속화한다. 따라서 KIND에 대해서는 현재 구현 ID를 canonical filing key로 승인할 수 없다.

2026-11-01 read-only 단일 GET 관찰은 HTTP 200, `text/xml; charset=UTF-8`, 199 byte의 정상 RSS channel과 item 0건을 반환했다. 해당 응답에는 GUID/ID/link/pubDate가 없었다. 이는 그 URL의 그 시점 응답 하나만 증명하며 ID schema, 빈 기간의 무공시, 시장 전체/일자별 completeness, history, pagination 종료를 증명하지 않는다. 100건 요청 파라미터도 page count/cursor/total을 제공한다는 확인이 없으므로 coverage는 최대 `FEED_WINDOW_ONLY`이며 완전성은 `UNKNOWN`이다. 빈 정상 응답은 `OBSERVED_EMPTY_RESPONSE`로 기록하고 “이벤트 없음”이나 기간 complete로 승격하지 않는다. HTTP 오류, 잘못된 XML, timeout, quota, redirect-to-error body는 각각 구분된 failed/partial observation이며 빈 성공 응답으로 정규화하지 않는다.

수용 identity 우선순위는 (1) 원천 계약과 권리 범위에서 안정성이 입증된 공식 receipt/notice ID, (2) 동일 filing에 대해 원천이 보장하고 canonicalization 규칙/권리가 확인된 URL이다. 둘 다 없으면 `IDENTITY_UNRESOLVED`로 격리하며 index, 제목·날짜 조합, mutable content hash를 canonical ID로 쓰지 않는다. Content hash는 특정 수집 byte snapshot 식별자일 뿐 filing identity가 아니다. 동일 receipt의 내용 변경은 correction/revision 후보로 두고 원문 hash·locator·관계 근거와 대조 전 자동 대체하지 않는다. KRX observation마다 endpoint/request fingerprint, fetch timestamp, HTTP/content metadata, raw response hash 또는 미보존 사유, item count, page/total/cursor 증거, parser version, identity outcome, coverage disposition을 기록한다.

구현 승인을 막는 KIND fixture/gate는 rights 승인된 공식 응답으로 구성한다: GUID/ID 누락, 게시시각 누락, 항목 재정렬, 100건 초과·잘림, 정상 빈 channel과 오류 body, malformed XML, redirect, 동일 receipt의 제목/본문 수정·정정, 중복 재수집, 안정 ID 없는 건을 각각 검사한다. 정확한 중복 제거, 수정 lineage, coverage 등급이 원본 snapshot과 독립 대조되기 전 KRX feed는 보조 후보 발견만 허용하고 일정 승인·complete 표시에는 사용하지 않는다.

#### 국내 일정 taxonomy 적용표 (표본 근거 수준 포함)

| 공시/사실 유형 | event / date assertion 분리 | 표본 상태와 금지 추론 |
|---|---|---|
| 현금·현물배당 결정 | `CAPITAL_RETURN/DIVIDEND`; `BOARD_RESOLUTION`, `RECORD_DATE`, `PAYMENT` 각각 독립 | 비재현 과거 관찰 메모는 설계 사례만 제공. 본문 field locator 없는 날짜는 fixture/실제 사실로 인정하지 않음. 배당 결정만으로 실제 지급 완료로 보지 않음 |
| 주주총회 소집결의 | `GOVERNANCE/SHAREHOLDER_MEETING`; `MEETING_START`(taxonomy 추가 검토), `VOTING_RECORD_DATE`, 필요 시 `NOTICE_DEADLINE` 분리 | 비재현 메모는 설계 사례만 제공. 개최시각·기준일 locator와 timezone 증거 확보 전 taxonomy 미승인. 안건은 합병 완료가 아님 |
| 단일판매·공급계약 | `CONTRACT`; `CONTRACT_SIGNED`, `CONTRACT_START`, `CONTRACT_END`, `DISCLOSURE_DEFERRED_UNTIL`은 별도 종류 후보 | 비재현 메모는 설계 사례만 제공. 정정 관계 및 before/after locator 검증 전 본문 claim으로 인정하지 않음. 계약종료일은 이행 완료 증거가 아님 |
| 시장·상장유지 안내 | `LEGAL_REGULATORY/LISTING_STATUS`; `ASSESSMENT_AS_OF`와 공식 공시/심사 마감일을 구분 | 비재현 메모는 설계 사례만 제공. 조건 단위와 assessment locator가 확인되기 전 거래일수/가격 조건을 사실로 확정하지 않고, 자동 상폐일로 전환하지 않음 |
| 합병·유상증자·감자·주식병합/분할 | `M_AND_A_RESTRUCTURING`, `CAPITAL_RAISE`, `CAPITAL_CHANGE`; 승인·기준일·청약·납입·효력·신주상장/거래개시를 각각 기록하도록 초안 | 이번 표본에서 직접 확인되지 않음. 이 유형은 taxonomy/자동 추출 승인 전에 실제 양식 표본 검증이 필요하며 현재는 `UNMAPPED/NEEDS_EVIDENCE` |

#### 일정 값 타입 수용 기준

| 입력 | 저장/표시 계약 | 자동화 금지 조건 |
|---|---|---|
| DART 접수일 `YYYYMMDD`처럼 날짜만 존재 | timezone 없는 `DATE`; API에서 요청/세션 timezone에 따라 날짜가 바뀌지 않음 | midnight UTC/KST instant 변환 금지 |
| 개최일시처럼 날짜+현지 시각만 존재 | `LOCAL_DATE_TIME`과 원문 표현 유지; timezone source가 확인될 때만 instant 파생 | timezone을 추정해 푸시 시각/정렬순서 생성 금지 |
| offset이 원문에 명시된 timestamp | `OFFSET_DATE_TIME` 원문 offset + normalized instant를 모두 보존 | offset이나 원래 zone label을 로그/출력 변환 중 버리는 처리 금지 |
| 월/분기 표현 | `MONTH`/`QUARTER`와 원문 precision 유지 | 첫날/말일로 일정일 생성 금지 |
| 기간/기한 표현 | `DATE_RANGE` endpoint와 inclusive/exclusive semantics를 각각 보존 | 경계 의미 `UNKNOWN`이면 특정 종료일, countdown, 마감 알림 생성 금지 |
| 휴일·비영업일에 놓인 날짜 | 원문에 발표된 날짜를 그대로 유지하고 거래소 calendar는 별도 보조정보로 계산 | 다음 영업일로 자동 이동 또는 공식 날짜처럼 표시 금지 |

Date kind 어휘는 상위 설계의 `BOARD_RESOLUTION`, `RECORD_DATE`, `PAYMENT`, `LEGAL_EFFECTIVE`, `TRADING_START`, `COMPLETION`, `DEADLINE`만으로 한국 공시 필드를 억지 매핑하지 않는다.
| taxonomy token | 1차 허용/사용상태 | 근거·정책 |
|---|---|---|
| `BOARD_RESOLUTION`, `RECORD_DATE`, `PAYMENT`, `LEGAL_EFFECTIVE`, `TRADING_START`, `COMPLETION`, `DEADLINE`, `FILING_RECEIVED` | 상위 계약에 이미 정의 | 각 값은 원문 locator 및 certainty basis를 요구하며 의미 혼용 금지 |
| `MEETING_START`, `VOTING_RECORD_DATE`, `NOTICE_DEADLINE` | 검증 표본에서 사용 후보 | taxonomy v1 승인 후 사용; meeting time precision 확인 전 공개 금지 |
| `CONTRACT_SIGNED`, `CONTRACT_START`, `CONTRACT_END`, `DISCLOSURE_DEFERRED_UNTIL`, `ASSESSMENT_AS_OF`, `SUBSCRIPTION`, `ALLOTMENT`, `NEW_SHARE_LISTING` | 실제 양식 표본 미충족 | `UNMAPPED/NEEDS_EVIDENCE`; exact form field/locator fixture 및 reviewer 승인 전 자동 추출·공개 금지 |
| `OTHER` | 제한 허용 | 기존 taxonomy 밖 의미만 설명+수동 검토로 기록. 위 token의 미검증 상태를 우회하는 용도 금지 |

각 taxonomy release는 `taxonomyVersion`, effective date, token definition, allowed event types, source form/field fixtures, reviewer, backward compatibility decision을 immutable release record로 저장한다. token의 의미를 수정하면 같은 버전을 재사용하지 않고 새 버전을 만든다. 실제 유형별 표본을 대조한 뒤 `MEETING_START`, `CONTRACT_SIGNED/START/END`, `ASSESSMENT_AS_OF`, `DISCLOSURE_DEFERRED_UNTIL`, `SUBSCRIPTION`, `ALLOTMENT/PAYMENT`, `NEW_SHARE_LISTING` 등의 어휘를 versioned enum에 채택할지 결정한다. 위 표의 미검증 후보는 지금 enum 확정이나 자동 공개에 사용하지 않는다.

#### 후보 승인과 이벤트 식별 규칙

- 자동/수동 분석 결과는 우선 `EVENT_CANDIDATE`다. 근거 미비·종목 미검증·중복 의심·정정 관계 불명 후보는 승인 이벤트 projection에 포함하지 않는다.
- `FactClaim`은 원문에서 위치를 재현할 수 있는 증거가 있어야 한다. PDF/첨부처럼 안정적인 문단 번호가 없으면 page/section/table locator와 추출기 버전을 보존한다. locator를 다시 찾을 수 없으면 근거 상태를 낮추고 승인하지 않는다.
- 후보 수용 조건은 (a) 공식 source와 문서 revision, (b) 발행 회사, (c) 보통주 대상 연결 또는 이벤트 대상이 해당 보통주에 미치는 직접 관계, (d) 사건을 뒷받침하는 claim, (e) 날짜 assertion의 종류와 확정성 또는 일정 미확정 사유, (f) 반대 근거/한계가 모두 검토된 것이다.
- 기계적인 안정 ID는 최초 근거 filing과 사건 anchor를 사용하되, 제목/요약 hash는 identity에 사용하지 않는다. 동일 사건이 후속 공시에 다시 언급되면 새 event를 만들기보다 관계 근거를 추가한다. 새 이사회 결의/계약/효력처럼 독립된 법적 행위는 별도 event가 될 수 있으며 검토 결정이 필요하다.
- 서로 다른 공시 출처에서 같은 공시가 중복 유통되는 경우 원천 filing은 하나의 canonical filing에 alias로 연결한다. DART와 KIND의 ID가 서로 다르다는 이유만으로 사건을 중복 생성하지 않는다. 자동 유사도는 검토 순위화 용도만 허용한다.
- 분석 후보 상태와 이벤트 상태를 혼합하지 않는다. 권장 candidate lifecycle은 `PENDING → APPROVED | REJECTED | NEEDS_EVIDENCE`; 보류 해제는 새 결정 이력이다. 승인 이벤트의 lifecycle은 별도 event revision/status로 관리한다.

#### 상태 전이 최소 규칙

| 현재 상태 | 다음 상태 | 필요한 근거/조건 |
|---|---|---|
| `ANNOUNCED` | `POSTPONED` | 발행사/공식기관이 기존 날짜를 변경했다는 새 filing 또는 공지 |
| `ANNOUNCED` / `POSTPONED` | `CANCELLED` | 취소 사실이 원문에 명시됨. 단순 일정 미표시는 취소가 아님 |
| `ANNOUNCED` / `POSTPONED` | `COMPLETED` | 완료 사실을 증명하는 결과 공시/공식 확인 |
| `ESTIMATED` | `ANNOUNCED` | 공식 확정 일정의 직접 근거. 추정일을 그대로 승격할 수 없음 |
| 모든 활성 상태 | `UNKNOWN` | 근거 상충·효력 불명·정정 연결 불가. 기존 assertion/이력은 보존 |

같은 상태에서도 날짜·조건 변경은 새 `EventRevision` 및 `EventDateAssertion`으로 남기고, assertion 간 `SUPERSEDES`/`CONTRADICTS` 관계는 별도 append-only edge로 기록한다. 기존 승인 assertion의 status를 갱신해 과거를 바꾸지 않는다. 현재 공개 상태는 assertion state row로 조회하되, 각 전환의 입력·reviewer·reason은 append-only audit 결정 이력에 남긴다. publication decision에는 대상 event revision ID와 assertion ID를 함께 고정하고, revision pointer 이동 및 해당 event/date publication state는 단일 transaction으로 적용한다. 읽기 projection도 한 consistent snapshot에서 조합해 서로 다른 revision의 날짜와 상태가 섞이지 않게 한다. `CANCELLED`/`COMPLETED` 이후 역전이 또는 재개는 자동 허용하지 않고 새 공식 근거와 수동 review decision을 요구한다. 원문 사이에 모순이 있으면 가장 최근 제출을 무조건 신뢰하지 말고 정정 관계와 효력 문구를 확인한다.

일정·event 상태 수용 fixture [`event-date-lifecycle.v0.json`](../fixtures/disclosure/event-date-lifecycle.v0.json)의 `EDL-01`–`EDL-10`은 확정성 승격 근거, 날짜 경과와 결과 미확인, 계획일과 실제일, filing 철회와 event 취소, 충돌 날짜, timezone 없는 알림, 날짜 종류 분리, event/date revision 혼합 응답을 검사한다. 범용 event lifecycle 경계이며 유상증자/CB/BW/EB의 상세 stage·금액·주식수 검증은 별도 [`financing-timeline-scenarios.v0.json`](../fixtures/disclosure/financing-timeline-scenarios.v0.json)의 대상이다. fixture 통과는 일정의 실제 사실성, 원천 coverage, API/UI 구현 또는 owner 승인 증거가 아니다.

#### 종목 eligibility 재평가 acceptance scenarios

| 변화 | subject publication 상태 | event/date 처리 | 복구 조건 |
|---|---|---|---|
| 최신 cap가 `<= KRW 30bn`, 결측 또는 freshness window 초과 | 해당 subject만 `SUPPRESSED_ELIGIBILITY`; reason과 assertion ID를 append audit | 승인 event/date row와 원문 근거를 수정·삭제하지 않고 다른 적격 subject/date는 유지 | 새 신선 assertion이 정책 기준을 통과해야 gate 해제 가능 |
| cap가 threshold 아래로 내려갔다가 다시 초과, stable instrument identity/subject link 동일 | 최신 assertion에 따라 gate 자동 재평가; 기존 event approval이 유효하면 subject를 재노출하고 auto decision을 기록 | event revision/date values를 새로 만들지 않음 | 새 current cap + active COMMON_STOCK assertion 및 기존 event approval 모두 유효 |
| instrument가 disabled/non-common으로 바뀌거나 code/identity link가 달라짐 | subject `NEEDS_REVIEW` (eligibility 차단 사유도 함께 보존) | 과거 instrument에 연결한 이벤트를 새 instrument ID로 자동 이동 금지 | stable identity/crosswalk를 reviewer가 재검증 후 새 subject link/revision 승인 |
| 한 filing의 대상 stock이 과거 cap 미달이라 event analysis가 생략됐으나 나중에 eligible | filing metadata는 보존; `ELIGIBILITY_RECONCILIATION` run이 승인된 lookback/window 안에서 재평가 | reprocess는 원문 rights decision 및 source coverage를 다시 확인하고 중복 없이 candidate 생성 | window 크기, cadence, completeness denominator는 owner 승인 필요; 미승인 상태면 coverage를 `UNVERIFIED`로 둠 |
| multi-subject event 중 한 종목만 기준 미달 | 해당 subject만 suppression | 다른 eligible instrument와 공통 date assertions는 계속 반환 | event response는 남은 eligible subject/date 조합이 하나 이상일 때만 포함 |
#### 정정·철회 회귀 시나리오 (validator acceptance)

| 입력 시나리오 | Filing/document relation | Event revision/party/date 처리 | 공개 상태 기대값 |
|---|---|---|---|
| 명시적 기재정정, 날짜 변경 | 새 filing `CORRECTS` → 원 filing; 양쪽 filing disposition은 별도 판정 | 새 날짜 assertion은 승인 전 숨김. 이전 날짜는 active 독립 근거가 있으면 유지; 그 근거가 정정으로 약화/대체되면 이전 assertion만 임시 suppression. 승인 후 `SUPERSEDES` edge와 새 revision으로 전환 | stale 날짜와 unapproved 날짜를 노출하지 않음; 다른 무관한 날짜 assertion은 계속 공개 |
| 같은 filing의 첨부 교체 | 새 `DocumentRevision REPLACES` 이전 revision | 기존 파서/분석은 보존; 새 bytes hash/parse/analysis를 연결하고 영향 claim/date assertion만 후보화 | 교체 첨부에만 의존한 date assertion은 검토 중 suppression; 나머지 날짜는 유지 |
| 같은 사건에 부분 정정이 연속 제출되거나 정정 filing 자체가 다시 정정 | 각 제출을 별도 filing으로 저장하고 명시된 `CORRECTS` edge를 각각 추가 | 변경 claim/date assertion만 새 candidate에 반영; 이전 제출과 각 event revision은 immutable | 영향받는 assertion만 suppression; 비영향 날짜/사실은 유지하고 unapproved 변경값은 숨김 |
| 같은 승인 revision에서 서로 다른 날짜 정정이 동시에 제안됨 | 두 candidate filing과 correction edge 모두 별도 보존 | optimistic `expected_revision` 충돌로 자동 승자 금지; 관련 assertion은 근거 상태에 따라 suppression/contested 처리 후 reviewer가 합성 revision을 승인 | 한 정정 후보를 임의 공개하지 않음; 영향 없는 assertion은 유지 |
| 공시 철회, 근거가 해당 filing 하나뿐 | 새 filing `WITHDRAWS` → 원 filing; 원 filing `WITHDRAWN`/`DEEMED_WITHDRAWN` | 기존 승인 revision·party/date rows를 삭제/수정하지 않고 evidence-review decision 및 후보 기록 | `SUPPRESSED_EVIDENCE_REVIEW`; event status를 자동 `CANCELLED`로 변경하지 않음 |
| 철회됐지만 독립된 유효 공시가 같은 사실을 뒷받침 | withdrawal relation + 다른 active filing source | reviewer가 독립 claim과 범위를 새 revision에 명시하고 승인 | 재검토 전 숨김; 승인 뒤 `PUBLISHED` 복구 가능 |
| `rm=정/철` 또는 제목 marker만 있고 대상 불명 | relation candidate만, 확정 FK edge 없음 | 자동 merge/supersede 금지, `UNRESOLVED` queue | 기존 상태 보존, coverage에 relation unresolved 표시 |
| 실제 계약/주총 취소를 원문이 명시 | active filing + event evidence; 필요한 경우 filing relation 별도 | 새 event revision의 `status=CANCELLED` 및 cancel claim | 승인 후 취소 표시. filing withdrawal 자체는 취소 근거로 사용 불가 |

## 수집·분석·저장 파이프라인

```text
SourceRightsDecision lookup (discovery API metadata request/store operation)
  → 공식 DART/KIND 목록 조회 및 허용된 metadata 저장
  → source fetch run / coverage 기록
  → 접수 식별자 중복 제거 및 페이지 경계 검증
  → 각 document/component rights lookup (body fetch/transient parse/source persist/derived persist)
  → 허용된 경우에만 공식 원문/첨부 취득 (실패 분리)
  → 권리 허용된 body bytes만 immutable revision object에 보존; transient-only면 처리 후 즉시 discard
  → filing party / event subject 후보 추출 (근거 locator 포함)
  → 공식 active COMMON_STOCK assertion 및 KRW 30bn floor/freshness assertion 검증 (fail-closed per subject)
  → 적격 subject에 한해 Codex 분석 revision과 event/date 후보 생성
  → 중복/정정/관계 검토
  → review 승인 후 event/date/subject publication projection 갱신
  → 읽기 API/UI 및 audit/coverage 노출
```

#### 원천 coverage freshness publication gate

페이지를 모두 읽은 `PAGE_ENUMERATION_COMPLETE`은 그 run의 열거 결과일 뿐, 현재 공개 일정이 최신 정정까지 반영했다는 뜻은 아니다. `SourceCoverageAssertion`은 source·scope·필요 window별 성공 correction-reconciliation run, 그 run의 `as_of`, immutable freshness policy revision, enumeration/consistency outcome 및 응답/hash-set digest를 보존하는 증거다. 여기에 mutable `CURRENT/STALE/UNKNOWN` 상태를 저장하지 않는다. freshness policy는 source별 correction cadence/lookback/window, 허용 최대 age, API quota 및 영업일/휴일 처리, required window를 포함하며 `KR-RECONCILIATION-01` 책임자 승인 전 수치/기본값을 만들지 않는다. 별도 outage grace로 max-age를 연장하지 않는다.

공개 일정 freshness는 공개 GET의 read-only DB transaction이 시작할 때 읽은 단일 DB clock `requestAsOf`와 transaction snapshot에서 source/scope별 계산한다. 관계형 저장소 계약은 PostgreSQL `REPEATABLE READ`, read-only transaction으로 고정한다. 모든 gate·projection 행은 같은 connection/transaction에서 읽고 transaction 밖 조회 금지; snapshot isolation을 제공하지 않는 adapter는 이 API에 사용할 수 없다. serialization/connection retry가 필요하면 전체 GET transaction을 새 snapshot과 새 `requestAsOf`로 재시작하며 이전 시도의 일부 결과를 재사용하지 않는다. `CURRENT`는 유효한 owner-approved policy가 있고, 동일 정책에서 요구한 correction window를 충족한 가장 최근 성공 coverage assertion이 있으며, `requestAsOf - assertion.as_of <= maxAge`이고 필수 조건이 모두 통과할 때만 준다. max-age 초과·부분 window·inconsistent enumeration은 `STALE`; policy/성공 assertion/평가에 필요한 자료가 없거나 policy가 만료/철회되면 `UNKNOWN`이다. GET에서 assertion/state를 write하지 않는다. 상태는 파생 결과이며 append-only 원천 증거는 policy와 run assertion이다.

각 공개 consumer의 source scope dependency는 deterministic resolver가 `consumer claims → claim evidence → document revision → filing source/scope` lineage에서 만든 `disclosure_source_coverage_consumer_refs`에 projection generation별로 고정한다. 해당 ref는 신규/변경 evidence, source attribution, resolver version이 달라질 때만 새 generation으로 재구성하고, 기존 claim-consumer reverse index처럼 canonical ledger와 양방향 cardinality/hash를 대조한다. 공개 시 각 event/date/summary/subject consumer는 자신의 source scope 집합에 속한 모든 필수 freshness 계산이 통과해야 한다. scope 하나가 stale이면 그 scope에 의존하는 consumer만 억제한다. 다른 source의 독립 claim이 남아도 자동 대체 근거로 보지 않으며 reviewer가 별도 승인해야 한다. dependency 누락/불일치/resolve failure는 영향을 계산할 수 없으므로 해당 projection 전체를 억제한다.

Source scope identity는 요청별 window가 아닌 재사용 가능한 source/product/correction domain을 나타내는 `(source, scope_key)` natural key다. 해당 source scope가 원천 filing/consumer lineage에 최초 등장하면 `disclosure_source_coverage_watermarks` identity row를 만든다. policy/accepted assertion이 아직 없으면 해당 FK는 nullable이고 판정 결과는 `UNKNOWN`이다. root suppression과 consumer reverse-ref는 모두 동일 canonical hash인 `scope_key_hash=SHA256(UTF8("KR-DISCLOSURE-SOURCE-SCOPE-v1") || 0x00 || RFC8785-JCS-UTF8({source,scopeKey}))`를 사용하며 raw natural key와 hash를 함께 보관/대조한다. 자연키 unique 제약, scope hash 재계산, 두 인덱스 간 row set/cardinality/hash가 모두 맞아야 한다. hash mismatch, collision 의심, missing watermark identity는 관련 source consumers의 projection을 fail-closed로 차단한다. 요청의 `window_start/end`는 coverage run/assertion에 따로 기록하며 scope identity나 root key를 바꾸지 않는다.

Coverage run의 metadata row는 반드시 `disclosure_source_scope_filing_dispositions` 한 건의 최신 disposition에 연결한다. 유효한 complete run은 `distinct receipt count = latest disposition count`와 receipt/disposition set digest 일치를 모두 만족해야 한다. disposition status는 `NOT_EVENT_RELEVANT`(approved classifier/taxonomy 기준), `CANDIDATE_QUARANTINED`(미승인 event candidate 공개 금지), `IMPACT_LINKED_SUPPRESSED`(영향 consumer를 특정해 suppression 등록), `IMPACT_RESOLVED`(검토된 새 revision 또는 영향 없음) 중 하나여야 한다. `UNRESOLVED/FAILED`, 미분류 receipt, 해시/cardinality 불일치가 있으면 해당 scope freshness를 `UNKNOWN/PARTIAL`로 둬 기존 source-dependent active/upcoming consumers를 억제한다. correction candidate가 known consumer를 가리키면 해당 consumer만 suppression할 수 있으나 관계 대상이 불명확한 상태를 `NOT_EVENT_RELEVANT`로 낮춰 우회하지 않는다. Candidate quarantine은 새로운 event projection 공개를 허용하지 않지만 무관한 기존 consumer를 자동 억제하지 않는다.

- 현재 또는 미래 일정 publication은 그 consumer가 의존하는 source scope 모두가 `CURRENT`이고 승인된 freshness policy 및 correction-reconciliation window를 충족할 때만 허용한다. 최신 성공 run 나이가 승인된 max age를 넘거나 required window가 부분/불일치이면 `STALE`; policy·run·평가 증거가 없으면 `UNKNOWN`이다. `STALE/UNKNOWN`은 해당 consumer를 active/upcoming calendar에서 fail-closed suppression한다. 이전 승인 projection은 저장하되 현재 일정으로 제공하지 않는다.
- 단기 source outage에서 마지막 성공 reconciliation이 승인된 max age 안에 있고 required window를 충족하면 그 max-age 기간 안에서만 prior projection을 노출할 수 있다. 최신 시도 실패가 있으면 응답에 해당 run의 as-of, source별 `CURRENT` 및 `coverageDegraded=true`를 표시한다. 최신 시도 실패가 max-age limit을 늘리지는 않는다. TTL 미승인 상태는 “무제한 stale 사용”을 뜻하지 않고 `UNKNOWN` suppression을 뜻한다.
- `VALID_EMPTY`는 그 단일 query window의 빈 결과일 뿐, 기존 미래 일정의 변경 없음 증거가 아니다. correction-reconciliation run은 승인된 window 범위와 page enumeration이 검증되어야 한다. API가 snapshot pagination을 제공하지 않으므로 결과는 `OBSERVED_STABLE`까지이며 절대 완전성 주장 금지다.
- 이미 지난/완료 일정은 active calendar와 분리된 이력 조회에서 마지막 source `as_of`/coverage 상태를 명시해 열람할 수 있다. 이를 현행/예정 일정이나 결과 확인으로 재라벨링하지 않는다. source freshness가 rights decision, event/date review, current COMMON_STOCK/cap eligibility gate를 대신하지 않는다.

| Coverage fixture | 입력 | active/upcoming publication 기대값 |
|---|---|---|
| `COV-FRESH-01-NO-POLICY` | freshness policy 없음 또는 owner 승인 만료 | `UNKNOWN`; 일정 공개 억제 |
| `COV-FRESH-02-WITHIN-WINDOW` | 승인된 policy와 required correction window를 충족한 성공 run, 현재 시각이 max age 이내 | `CURRENT`; `as_of` 및 source scope 함께 노출 |
| `COV-FRESH-03-SHORT-OUTAGE` | 신규 호출 실패지만 마지막 accepted run은 max age 이내 | 제한 정책이 허용할 때만 `CURRENT`+`coverageDegraded`; 실패/재시도 진단 공개 |
| `COV-FRESH-04-EXPIRED-OR-PARTIAL` | max age 초과, missing page, partial window 또는 inconsistent totals | `STALE`; 이전 projection을 active/upcoming 일정으로 제공 금지 |
| `COV-FRESH-05-EMPTY-IS-NOT-RECONCILED` | 최근 query가 valid empty지만 기존 event 범위의 correction reconciliation 미완료 | `UNKNOWN/PARTIAL`; 기존 일정의 변경 없음으로 추론 금지 |
| `COV-FRESH-06-RIGHTS-REVOKED` | coverage가 `CURRENT`이나 해당 read/action rights가 만료/차단 | rights gate 우선; 해당 표시를 즉시 억제 |
| `COV-FRESH-07-SOURCE-ISOLATION` | DART·KIND source에 각각 의존하는 서로 다른 consumer 중 한 scope만 stale | stale scope 의존 consumer만 숨기고 무관 scope consumer는 같은 snapshot에서 계속 공개 가능 |
| `COV-FRESH-08-MISSING-LINEAGE` | consumer→claim→evidence→filing source reference 누락 또는 reverse index cardinality/hash 불일치 | source 의존 범위를 알 수 없으므로 해당 projection batch 전체 차단; 이전 상태 fallback 금지 |
| `COV-FRESH-09-ALTERNATE-SOURCE-REVIEW` | 한 claim의 두 독립 source 중 하나 stale, 다른 하나는 fresh | fresh source만으로 사실을 자동 유지하지 않음; reviewer가 새 claim/event revision으로 근거 sufficiency를 승인한 뒤 공개 |
| `COV-FRESH-10-UNPROCESSED-RECEIPT` | correction window 안 distinct receipt 중 filing disposition 누락 | receipt/disposition cardinality mismatch; 해당 scope `UNKNOWN/PARTIAL`, 기존 source-dependent 일정 억제 |
| `COV-FRESH-11-UNRESOLVED-CORRECTION` | correction marker/후보는 있으나 원 대상 filing/event consumer를 resolve하지 못함 | 해당 source scope의 기존 consumers 억제; `NOT_EVENT_RELEVANT`로 자동 분류 금지 |
| `COV-FRESH-12-QUARANTINED-NEW-CANDIDATE` | 신규 event 후보는 있으나 rights/review/COMMON_STOCK 검증 진행 중이고 기존 event로 가는 정정 관계는 없음 | 후보 일정은 공개하지 않음; terminal quarantine disposition이 있으면 무관한 기존 consumer는 유지 |
| `COV-FRESH-13-SET-DIGEST-MISMATCH` | receipt set과 최신 filing disposition set의 count/hash 차이 | coverage assertion 발급 금지; source scope를 `PARTIAL`로 유지 |
| `COV-FRESH-14-FINALIZATION-ATOMICITY` | validation 중 count/hash/FK/CAS 중 하나 실패 | coverage assertion/pointer/generation 변경 전부 rollback; trigger transaction에서 사전 commit된 suppression 및 epoch/outbox는 유지 |
| `COV-FRESH-15-PAGE-CURSOR-ATTEMPT-CHANGE` | 페이지 간 새 ingestion attempt/policy/dependency generation 변경 | cursor의 전체 source scope set을 재검증하고 불일치 시 이후 페이지를 내용 없이 거부; 이전 body/304 미반환 |
| `COV-FRESH-16-POLICY-REVOCATION` | current policy expiry/revoke/replace | policy pointer, scope suppression, revocation epoch, outbox가 한 transaction; 새 유효 policy/run 전 schedule 차단; 이미 발급된 cursor도 다음 요청에서 거부 |
| `COV-FRESH-17-OLD-WORKER-RECOVERY` | prior attempt의 zombie completion이 fresh attempt 뒤 도착 | fencing/CAS로 거부; prior worker는 coverage pointer·epoch·suppression을 바꿀 수 없음 |
| `COV-FRESH-18-COVERAGE-COMPLETE-RIGHTS-REMEDIATION-PENDING` | receipt/disposition set은 완전하여 coverage가 `CURRENT/COMPLETE`; exact-scope current read decision이 `ALLOW`여도 연결 remediation case가 비종료 상태 | coverage는 열거 증거로 유지할 수 있지만 rights gate/root suppression은 `BLOCKED/ACTIVE`; publication, stale artifact 재사용, descendant suppression 해제 금지 |

#### 문서·분석 lifecycle 및 상태 분리 계약

한 `status` 컬럼으로 권리·취득·파싱·분석·사람 검토·공개를 표현하지 않는다. 각 축은 독립 상태/이력을 가지며 상위 단계 성공이 하위 단계 성공이나 승인으로 승격되지 않는다.

| 독립 축 | 상태/전이 | 고정 불변식 |
|---|---|---|
| SourceRightsDecision | `NEEDS_REVIEW → APPROVED/BLOCKED`; 결정 유효기간 만료는 `EXPIRED`, 철회는 새 결정 revision | source/product/component/payload/action/channel별로 평가. 조회권한이 본문 fetch·저장·파생물 보존·인용·공개 권한을 암묵적으로 허용하지 않음. 결정 변경/만료 후 새 작업을 중지하고 영향 있는 기존 파생물도 재평가 |
| Document fetch attempt | `QUEUED → RUNNING → FETCHED/UNAVAILABLE/RETRYABLE_FAILURE/TERMINAL_FAILURE` | 시도별 request fingerprint, 시작/종료, HTTP/API 결과, sanitized diagnostic 보존. 재시도는 새 attempt; 실패 body를 원문으로 취급하거나 3xx 오류 HTML을 정상 문서로 승격 금지 |
| Document revision integrity | `UNVALIDATED → VALID/REJECTED` 검증 결과는 불변 revision hash에 고정 | 권리 허용 후 받은 원본 bytes만 MIME/magic, 크기, archive entry path/size/count/ratio, XML well-formedness와 malware 정책으로 검증. `VALID`만 parse 대상. 저장 금지 권리면 bytes를 즉시 폐기하고 hash/locator 기록 가능 여부도 rights 결정에 따름 |
| Parse/extraction attempt | `NOT_RUN → RUNNING → COMPLETE/PARTIAL/FAILED/UNSUPPORTED` | 입력은 정확한 document revision hash, parser/extractor version, charset/locale. retry는 새 attempt. `PARTIAL`은 coverage에 남기고 누락 필드가 필수면 승인 불가. unsupported/failed를 empty successful parse로 바꾸지 않음 |
| Analysis attempt/revision | attempt `QUEUED → RUNNING → COMPLETE/FAILED`; 성공 revision은 immutable | exact document-revision set + extracted-text hash + parser/model/prompt/schema versions + rights snapshot을 입력 지문으로 고정. 같은 fingerprint 재실행은 idempotent; 산출 차이가 있으면 별도 attempt/output hash를 남기고 기존 결과 덮어쓰기 금지 |
| Human review decision | 대상 hash/generation별 `PENDING → APPROVED/REJECTED/NEEDS_EVIDENCE`; 결정 수정은 새 append-only decision | review는 analysis/event/date/subject scope를 명시하고 reviewer, role, reason, timestamp, evidence set, expected revision을 기록. 어느 입력 hash·권리·instrument/cap assertion·taxonomy version이 바뀌면 연결된 승인은 자동 재사용하지 않고 `STALE/REVIEW_REQUIRED`로 계산 |
| Publication state | event/date/subject별 독립 `UNPUBLISHED/PUBLISHED/SUPPRESSED_*/NEEDS_REVIEW` | 공개는 동일 snapshot에서 모든 선행 결정이 통과할 때만 가능. correction/withdrawal/rights/master/cap 변화는 즉시 epoch를 올리고 영향 분석 완료 전 보수적 suppression; 분석 성공 자체는 publish 동작이 아님 |

상태는 허용된 단방향 전이만 허용한다. 재시도는 새로운 attempt 또는 decision revision을 생성하고 과거 상태/오류/hash를 보존한다. `UNAVAILABLE`, `REJECTED`, `FAILED`, `NEEDS_EVIDENCE`는 valid empty와 구분한다. 연결된 산출물 stale 판정은 원본 row를 덮는 대신 현재 포인터/계산 상태로 나타낸다. 지원되지 않는 외부 상태/문서 형식은 원문 metadata와 failure reason만 보존 가능한 권리 범위에서 기록하고 승인 queue로 보낸다.

문서 보관소의 기본 검색 단위는 filing dossier다: 제출 식별자와 수정 관계, 문서별 원본 revision/hash, 취득·검증·추출 attempts, 연결된 analysis revisions, claim/evidence locator, reviewer decisions, 영향받은 event/date/subject, publication epochs를 accession 중심으로 탐색한다. 원문 bytes, 추출 텍스트, 사용자용 요약, reviewer 내부 메모는 저장/접근/보존 권리가 서로 다르므로 별도 payload class와 ACL로 분리하고, 목록 API에는 대용량 본문을 넣지 않는다.

| Lifecycle acceptance | 입력 시나리오 | 기대 결과 |
|---|---|---|
| `DOC-LC-01` | API metadata rights는 허용, body fetch 권한은 누락 | filing metadata만 허용 범위에서 저장; fetch/parse/analysis 호출 0건 |
| `DOC-LC-02` | fetch가 302 후 오류 HTML 반환 | attempt는 실패/재시도 상태; document revision·분석 성공·valid-empty 생성 금지 |
| `DOC-LC-03` | 유효 MIME 헤더지만 바이트가 ZIP/XML 형식과 불일치 | `REJECTED`; parse/analysis 및 공개 불가, hash/diagnostic은 권리 허용 시 감사 기록 |
| `DOC-LC-04` | ZIP 경로 traversal, 압축 크기/비율 제한 초과, 악성/잘못된 XML | 격리 후 `REJECTED`; 엔트리 실행/추출 금지, 운영 경보 생성 |
| `DOC-LC-05` | 동일 source key 재취득 결과 content hash가 변경 | 새 immutable document revision; 과거 승인 연결 stale, 영향을 받는 분석/날짜 재검토 |
| `DOC-LC-06` | parser/model/prompt/schema만 변경 | 새 extraction/analysis revision 생성; 이전 결과 유지, 자동 승인/공개 승계 금지 |
| `DOC-LC-07` | reviewer 승인 직후 expected revision 또는 rights/master/cap snapshot 변경 | optimistic concurrency 실패 또는 승인 stale; 공개 gate 닫힘 |
| `DOC-LC-08` | `PARTIAL` extraction인데 event에 필수 날짜 field가 누락 | review 후보만 생성; 누락 날짜를 추정하지 않고 event/date 공개 차단 |
| `DOC-LC-09` | source가 transient parse만 허용 | memory bounded 처리 후 원본 bytes 즉시 폐기; 지속 저장 파생물은 별도 rights 허용 없으면 생성 금지 |
| `DOC-LC-10` | retry 도중 새 correction/withdrawal trigger 도착 | 신규 publication epoch와 suppression 원자 반영; 구 attempt의 결과는 최신 generation 공개를 해제하지 못함 |

- 수집기, parser, instrument resolver, 분석기, event projector, repository, API는 독립 책임을 갖는다. `sync-filings`가 기존 DART 수집 책임자이므로 별도 병렬 크론을 만들기 전 해당 job에 연결할지 결정한다.
- 공시 ledger collector의 입력은 제목 점수/푸시 대상 목록이 아니라 OpenDART 전체 검색 결과다. 현재 `runDartAutomation`은 Discord 설정이 없으면 검색 전에 종료하므로 이 함수를 재사용할 경우 원장 수집이 알림 설정에 종속된다. 기존 알림과 원장 수집은 독립 실행·coverage·저장 이력을 가져야 한다. DART key 미설정/인증오류는 coverage failure/skip 사유로 기록하며 성공으로 가장하지 않는다.
- 전체 공시 메타데이터 수집과 이벤트 분석 후보 선별은 별도 단계다. title scorer의 `호재가능`/`최강호재`만 수집하거나 이 점수를 공시 이벤트의 POSITIVE 방향으로 옮겨 쓰지 않는다.
- 현재 `lib/scoring.ts`는 `report_nm`/RSS title 문자열을 keyword rule에 대조하고, `lib/dart-automation-mapper.ts`가 그 판정·키워드를 알림 DTO로 옮긴다. 이 경로는 원문 본문, 수치 분모, 계약 이행/해지 조건, 직접 영향 issuer, 반대 근거를 확인하지 않는다. 따라서 UI는 결과를 `TITLE_SIGNAL_ONLY`로 표현하고 투자 claim·방향·매매 지시를 만들지 않는다. 투자효과 분석은 rights gate 통과 후 본문 revision/locator, claim-level SUPPORTS/CONTRADICTS/CONTEXT, 미확인 항목, 정량 basis와 denominator, 반대 위험, issuer/common-stock eligibility를 각각 통과해야 한다. [`disclosure-investment-evidence-gate.v0.json`](../fixtures/disclosure/disclosure-investment-evidence-gate.v0.json)의 `DIEG-01`–`DIEG-14`는 제목 전용·권리 차단·locator 누락·missing-vs-zero·분모/기간·긍정 사실과 위험 병존·submitter 귀속·정정 stale·가격 인과·희석·전체 gate·legacy 미판단·watchlist 비구독 및 한 receipt 안 다중 사건/기간의 claim group 분리 사례다. 이는 제안 acceptance이며 현재 scorer/API/UI의 동작 개선이나 투자 조언이 아니다.

정정 후 영향 평가는 “관측 coverage”와 “해석 상태”를 별도 축으로 둔다. 원문/페이지/정정 관계/대상 security의 coverage가 불완전하면 `EVIDENCE_INCOMPLETE` 또는 `UNRESOLVED`로 근거 단정을 차단한다. 이 coverage가 완전하더라도 정정 금액의 단위·기간·기준일이 비교 불가능하거나 기존 claim과 의미가 충돌하면 `REVIEW_REQUIRED`로 둔다. 값의 차이만으로 호재/악재 방향을 계산하지 않으며, 계약액 감소율이나 투자점수도 계약 전체 분모·이행조건·취소권 등 정의된 근거와 reviewer policy 없이는 산출하지 않는다. 지지/반대 claim은 각각 revision과 locator를 유지하고 단일 순점수로 합치지 않는다. CDR-22는 이 상태 구분을 전달 remediation에 연결하며 DIEG-03/05/06/08의 evidence gate를 함께 참조한다. 이 분리는 검토 흐름을 결정하는 설계이며 자동 투자판정 정책은 아니다.
- 사용자용 dossier는 [disclosure-investment-dossier-projection.v0.json](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json)의 `DIDP-01`–`DIDP-47` projection 계약을 따른다. 기존 `FactClaim.text/evidenceRefs/verificationStatus`, `EventRevisionParty`, `AnalysisRevision.unknowns`, segment별 summary/analysis review를 새 필드 집합으로 복제하지 않고 DTO에서 교차 매핑한다. dossier는 source metadata → dossier state → 적격 subject → verified facts → basis가 있는 수치 → supporting/contradicting evidence → event/date → risks/unknowns → reviewed interpretation 순서로 표현한다. “검토하지 않음”, “선언된 범위에서 찾지 못함”, “원문이 미공개라 함”, “source unavailable”, “rights blocked”, “unresolved conflict”를 별도 코드와 문구로 보여주고, 부정적 근거가 미검토인 상태에서 “위험 없음”으로 요약하지 않는다. suppressed dossier에서 본문 claim/수치/요약을 부분반환하거나 과거 승인본으로 fallback하지 않는다. issuer 자본 상태와 위험/상장상태는 각각 별도 섹션으로 표시하되 같은 issuer/instrument identity·as-of·projection snapshot을 가리켜야 한다. 각 사실의 적용 범위는 issuer·security class·series/tranche·개별 instrument 중 하나로 명시하고, issuer/그룹 사실이나 한 series의 자본 사실을 다른 instrument에 자동 복사하지 않는다. issuer-level 관측을 instrument dossier에 같이 표시할 때는 `CONTEXT_ONLY`로 분명히 라벨링하고, instrument 필터가 직접 적용 사실과 issuer context를 선택적으로 포함했는지와 생략 분모를 드러낸다. capital movement는 재무 distress나 KRX 조치를 암시하지 않으며, going-concern/audit 신호는 실제 자본 movement를 만들지 않는다. 서로 다른 source coverage 중 일부라도 부분·stale이면 “위험 없음/상태 정상” headline을 억제한다. resolution/거래재개는 과거 자본·위험 assertion을 지우지 않는다. 모든 섹션은 같은 revision·snapshot·epoch·rights decision set을 사용한다. DIDP-13~24은 이 결합 오류와 COMMON_STOCK 경계를 추가한다. 범위 crosswalk가 충돌·미해결이면 해당 대상 instrument 주장은 억제하되, 무관한 instrument와 issuer context 자체를 전역 삭제하지 않는다. 이는 synthetic projection 제안이며 실제 JSON Schema/API/UI/runtime은 없다.
- 사실검토·정량계산·투자해석·사용자 projection의 상태 전이는 [investment-effect-projection-bridge.v0.json](../fixtures/disclosure/investment-effect-projection-bridge.v0.json)의 `IEPB-01`–`IEPB-15`에서 통합 검사한다. 기존 DIEG는 원문 claim 생성/근거 gate, FCT는 계산 재현과 수치 basis, DIDP는 dossier 표시를 각각 다룬다. bridge는 단계를 하나의 approval로 합치지 않고 다음 단계에 필요한 dependency를 명시한다: 원문/locator/analysis rights 없이는 claim을 만들지 않고, supported claim만으로 계산·방향을 승인하지 않으며, 재현 가능한 계산도 별도 interpretation review를 대체하지 않는다. `ANALYZE` 권리는 `DISPLAY_PUBLIC_API` 권리를 포함하지 않는다. 최종 `REVIEWED_INVESTMENT_EFFECT`는 counterevidence review, 영향 instrument eligibility, 동일 publication snapshot/epoch 및 산출 hash parity까지 통과한 표시 상태일 뿐 매수·매도 지시·사건 발생확률·수익 보장이 아니다. 이는 cross-fixture synthetic gate이고 runtime state machine은 아니다. `IEPB-15`는 같은 receipt의 복수 사건·horizon을 별도 group으로 유지하며 receipt 건수로 사건 수나 단일 방향을 만들지 않는지 검사한다.
- 권리 결정 revision이 기존 투자 검토·공개물에 전파되는 범위는 [investment-rights-action-propagation.v0.json](../fixtures/disclosure/investment-rights-action-propagation.v0.json)의 `IRAP-01`–`IRAP-10`으로 연결한다. 권리는 action별로 다시 검사하므로 공개 API 권리만 철회된 경우, 내부 원문 claim·계산·해석 approval은 각자의 `ANALYZE`/`PERSIST_DERIVATIVE` 권리와 dependency가 계속 유효할 때에만 내부 현재값으로 남을 수 있고 `PUBLICATION` approval은 현재 사용에 stale 처리한다. 분석 권리나 파생물 저장 권리가 바뀌면 그 action decision revision에 실제 결박된 의존 claim·계산·해석 approval만 stale로 만들며 무관한 승인을 전역 초기화하지 않는다. **action 범위가 바뀐 approval만 stale**로 처리하고 **과거 approval row는 immutable**하게 감사 이력으로 보존하며 새 revision 검토를 추가한다. 공개 표시 권리가 deny/expire/revoke/unresolved면 새 응답과 API·cache·검색·export 재사용을 억제하고 publication epoch를 먼저 올린다. 저장 descendant는 class·location별 예상/관측 분모와 set digest로 조사하며 불완전 계보를 0건으로 해석하지 않는다. 기존 push는 미발송분을 멈추고 attempted/provider accepted/delivered 상태를 [correction-delivery-reconciliation.v0.json](../fixtures/disclosure/correction-delivery-reconciliation.v0.json)에 따라 대조한다. provider acceptance는 사용자 전달이나 회수의 증거가 아니며, 이미 전달된 push는 수정·삭제 receipt가 확인되지 않는 한 **이미 전달된 push는 회수 증거가 있어야 정정 완료**로 표현한다. `DELETE`는 별도 권리·보존/법무 disposition 없이는 추론하지 않는다(**삭제 권한은 자동으로 생기지 않는다**). remediation 완료 후 권리 재허용이 생겨도 과거 approval·snapshot은 자동 부활하지 않으며 현재 권리·새 dependency approval·snapshot/epoch를 다시 요구한다. 이 10개 벡터는 합성 static gate이고 runtime suppression·approval staleness·알림 회수 실행을 보증하지 않는다.

###### IRAP decision-gate binding

결정 정의의 canonical source는 [`decision-register.v0.json`](../fixtures/disclosure/decision-register.v0.json)이다. 각 결정의 현재 상태는 이 파일에서 직접 바꾸지 않는다. controlled `decision-evidence-ledger.v0.json`의 revision 중 scope·owner·상태 전이·필수 증거·RFC 8785 JCS hash chain 검증을 통과한 최신 기록에서 계산한다. 이 ledger는 실제 owner/reviewer의 승인 증거가 들어갈 수 있으므로 document catalog와 public manuals에서 제외한다. `node scripts/sync-disclosure-decision-register.mjs write`는 두 원천으로 아키텍처 표, 사람이 읽는 evidence ledger 표와 lifecycle status baseline을 생성하고, `check`는 projection drift를 거부한다. `scripts/check-docs.mjs`는 ledger의 각 revision, exact registered scope, 상태별 필수 증거, 연속 hash chain 및 Markdown/lifecycle/IRAP 일치를 함께 검증한다. hash chain은 기존 기록 내용이 바뀌었는지 탐지하지만, 외부에 보존한 tail hash 또는 전자서명 없이는 저장 파일을 통째로 바꾼 공격까지 방지한다고 주장하지 않는다. IRAP vector는 각 사례의 decision ID/action scope/evidence refinement만 참조하고 owner·기본 동작·수용 근거나 current status를 복제하지 않는다. 현재 연결된 다섯 결정은 evidence revision이 없어 모두 `OPEN`이며 각 기본 차단을 유지한다. 정적 도구는 실제 문서의 서명·증거 진실성이나 제품 runtime gate 활성화를 증명하지 않는다.

상태는 자동으로 권한을 확대하지 않는다. 기계 gate effect는 lifecycle vocabulary에 맞춰 `OPEN=BLOCKED`, `EVIDENCE_READY=BLOCKED`, `APPROVED=DECISION_SCOPE_ONLY_DEPENDENT_GATES_CLOSED`, `CLOSED=SCOPED_GATES_ONLY_AFTER_CODE_AND_ROLLBACK_EVIDENCE`, `REJECTED=BLOCKED_UNTIL_REOPEN_CONDITION`, `EXPIRED=BLOCKED_UNTIL_CURRENT_REVIEW`로 고정한다. 특히 **APPROVED는 ledger에 기록된 정확한 결정 scope에만 효력이 있고** 연결된 별도 code/runtime gate가 닫혀 있으면 구현·공개는 차단된다. `CLOSED`도 승인된 scope 밖 권한을 허가하지 않는다. fixture가 `PASS`하거나 일부 결정이 `APPROVED/CLOSED`로 바뀌어도 다른 dependency 결정과 실제 runtime 증거를 대체하지 않는다. 따라서 **IRAP decision-gate binding**은 미결 결정을 우회하는 예외가 아니라 다음 산출물·owner·차단 gate를 추적하는 index다. 결정 정의는 canonical register, 현재 상태는 유효한 최신 evidence revision에서 계산한다.
- Gold-set 실행 준비는 [disclosure-investment-gold-set-protocol.v0.json](../fixtures/disclosure/disclosure-investment-gold-set-protocol.v0.json)의 `DIGSP-01`–`DIGSP-12`를 따른다. 표본 단위는 receipt와 선언된 문서 revision set이며, 한 filing 안에 복수 사건이 있으면 gold label 단위는 filing 하나의 순방향 평가가 아니라 event별 claim/party role/direct-impact locator와 연결된 instrument relation이다. 제출자 회사는 party role로 유지하고, event subject와 instrument는 각각 직접 근거 및 공식 활성 COMMON_STOCK master를 통과해야 한다. 같은 종목에 지지/반대 사건이 공존하면 event별 claim과 horizon을 유지하고 단일 순방향·net score를 만들지 않는다. 공식 metadata의 `pblntf_ty`/`pblntf_detail_ty` 등은 type strata용이지 party/event/instrument 의미를 자동 결정하는 신호가 아니다. OpenDART list의 전체 페이지 순회는 fixed point-in-time population 보장이 아니므로 page·row denominator와 한계를 같이 고정한다. 권리·표본 크기·관찰기간·허용 threshold가 owner 승인되기 전 표본 추출/정답 label/성능 PASS는 시작하지 않는다. 권리 미결·미취득·out-of-scope도 선택 분모에 disposition으로 남기며, 본문 검토 불가를 내용 정답으로 세지 않는다. 두 reviewer가 후보 출력을 보지 않고 독립 판정하고 불일치는 별도 adjudicator가 해결한다. 이는 실행 절차 제안이며 현재 real gold set이나 승인 threshold가 아니다.
- 수집과 분석은 비동기 단계다. 수집 실패는 다른 날짜/출처 및 기존 DB 데이터를 rollback하지 않는다. 원문 저장 전 분석을 완료로 표시하지 않는다.
- fetch run은 요청 구간, 페이지 수, 원천 응답 범위, 마지막 cursor, inserted/duplicate/updated/unresolved 수, status, 시작/종료, 오류 코드를 기록한다. 원문 인증값·개인정보는 기록하지 않는다.
- OpenDART `list.json`은 offset 방식 `page_no`/`page_count` pagination과 `total_count`/`total_page`를 제공하고 sort 옵션은 `date`/`crp`/`rpt`다. 공식 계약에는 snapshot token이나 안정적인 행 cursor/tie-break가 정의되어 있지 않으므로 이 endpoint를 `NON_SNAPSHOT_PAGINATION`으로 모델링한다. 이는 공식 계약에 snapshot cursor가 없다는 점에서 도출한 설계상 한계다. 전 페이지를 읽은 사실만으로 원천의 특정 시점 snapshot 또는 무누락 완전성을 주장하지 않는다.([OpenDART 공시검색 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001))
- 각 pass에서 요청 window/sort/page size와 `page_no`, `page_count`, `total_count`, `total_page`, API `status`를 기록한다. `status=000`은 list가 배열이고 각 row의 `rcept_no`·`rcept_dt`가 유효하며 receipt ID가 누락 없이 유일하고, 페이지 metadata가 요청과 일치하고, 모든 page의 row count 합·distinct receipt 수가 advertised `total_count`와 일치할 때만 `PAGE_ENUMERATION_COMPLETE`다. metadata mismatch, duplicate/missing receipt, malformed row 또는 run 중 total/page boundary 변경은 `INCONSISTENT/PARTIAL`이며, 누락 row를 조용히 버리거나 성공 empty로 처리하지 않는다.
- `status=013`은 공식 “조회된 데이터가 없습니다” 응답일 때만 `enumerationStatus=VALID_EMPTY`다. API의 `status/message`를 HTTP status와 별개로 분류한다. 공식 `status=020`(요청 제한 초과)은 `failureClass=QUOTA_EXCEEDED`로 해당 job/window 재호출을 중지하고 예산/다음 허용시각을 기록한다. `status=010/011/012` 등 키·사용중지·IP 접근 오류는 `AUTH_OR_ACCESS`, `status=100/101` 입력·접근 오류는 `INVALID_REQUEST` terminal failure로 분리하고, `status=800` 점검은 `MAINTENANCE`, network/timeout/5xx는 `TRANSIENT`로 분류한다. `enumerationStatus`는 일부 페이지를 읽었는지에 따라 `FAILED` 또는 `PARTIAL`로 기록한다. 원 status/message code와 정제된 진단을 보존한다. quota/permission failure를 빈 결과나 정상 0건으로 변환하지 않는다.
- 서로 겹치는 interval을 같은 query 계약으로 다시 읽어 receipt ID + normalized metadata hash set을 비교한다. 2개 이상의 연속 pass가 동일하면 `OBSERVED_STABLE`로만 부르고 `SNAPSHOT_PROVEN`/절대 complete로 부르지 않는다. 결과가 달라지거나 quota·page 경계가 불안정하면 `PARTIAL/INCONSISTENT`로 남기고 승인된 retry/reconciliation window에 재조회한다. 실시간 유입과 비안정 정렬 때문에 반복 pass도 API가 반환하지 않은 receipt를 증명할 수 없다는 한계를 coverage에 함께 공개한다.
- daily ingest와 historical correction reconciliation은 서로 다른 `run_kind`·window·checkpoint를 갖는다. coverage 지표는 (a) 요청 날짜/window 대비 성공·부분·실패, (b) 날짜별 fetched/expected page 및 distinct receipt/source total 대조, (c) ingest lag p50/p95, (d) 문서 취득 성공·미취득·정책상 미보존 비율, (e) parser/analysis/review queue age 및 건수, (f) 보통주 귀속 `VERIFIED/UNRESOLVED/REJECTED` 비율, (g) correction link `EXPLICIT/MANUAL/UNRESOLVED` 비율, (h) metadata/document hash 변경 건수다. 분모·window·source 응답시각을 함께 제공하며 분모 0은 100%가 아니라 `N/A`다.
- 중복 방지는 외부 문서 키와 본문 해시를 함께 쓴다. hash 변경은 새 revision을 만들고 re-analysis 후보를 표시한다. 제목 유사도는 자동 병합 키로 사용하지 않는다.
- 분석은 원문 revision hash에 고정한다. 파서/프롬프트/스키마/모델 버전이 달라지면 새 AnalysisRevision을 만든다. 기존 승인 분석은 불변이며 최신 선택 포인터만 이동한다.
- 재처리는 같은 입력과 버전에서 멱등이어야 한다. 실패 항목만 재시도하고, 수동 override도 원문 근거·actor·시각·이전값을 기록한다.
- 재처리 단위는 filing/document fetch, parse, analysis, review, projection을 분리한다. 기존 승인 분석·event revision은 재처리에서 수정하지 않는다. 현재 `script -> upsert current row` import는 v2 checkpoint·CAS·immutable revision 요건을 만족할 때까지 v2에 연결하지 않는다.

### 사용자-facing dossier projection

사용자용 issuer dossier는 공시 사실·정량 효과·반대근거·해석을 기존 [DIDP-01–DIDP-47 합성 projection contract](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json)에 따라 구성한다. 이 계획은 새 DB/API를 승인하지 않는다. DIDP-13~24은 issuer capital 상태와 financial/legal/exchange 상태를 별도 섹션·revision으로 표시하면서 동일 issuer/instrument identity, as-of 및 immutable projection snapshot을 요구한다. 발행·전환·상장 movement만으로 distress나 KRX action을 만들 수 없고, 감사/going-concern 신호만으로 자본 변화도 만들 수 없다. DIDP-25는 source coverage가 충분하지만 SUPPORT/CONTRADICT claim이 충돌하는 경우와 coverage가 불완전해 참/거짓을 평가하지 못하는 경우를 각각 `CONFLICT_UNRESOLVED`와 `EVIDENCE_INCOMPLETE`로 첫 상태 요약에 구분한다. 두 경우 모두 상·하향 방향 summary와 net score는 만들지 않으며, 서로 다른 evidence group과 검토 사유를 보여준다. DIDP-26은 `REVIEW_REQUIRED` claim의 사유코드와 safe status를 노출하되 stale 승인본으로 fallback하지 않고 매수·매도 지시를 표시하지 않는다. DIDP-32~36은 API/UI 동일 snapshot, export 시 withheld/coverage 보존, notification의 epoch·opt-in 재검증, revoked projection의 cache/cursor 거부, v2 dossier와 legacy export/alert 경계 분리를 고정한다. DIDP-37~39는 source coverage를 source/query/window/issuer/instrument 범위의 reconciliation manifest digest 집합으로 고정하고, partial source 누락을 전체 성공으로 축약하지 않으며, 같은 rights·master·applicability snapshot이 아닌 coverage를 negative evidence에 재사용하지 못하게 하고, `DIDP-40`은 공개-safe status/message projection이 범위와 정보노출 규칙을 지키는지 확인한다. `DIDP-41`은 official master의 security class correction이 과거 assertion을 수정하지 않으면서 현재 적격성과 공개 descendant를 무효화하고 영향 종목만 재검토하는지, `DIDP-42`는 국내 300억 원 하한 판정의 cap freshness·통화·FX evidence가 열려 있을 때 금액 크기만으로 적격성을 통과시키지 않는지 검증한다. `DIDP-43`은 EPO의 price/benchmark/corporate-action revision lineage가 dossier의 성과 결과와 API/UI/export/notification/cache/cursor에 같은 snapshot·epoch로 전파되는지, stale run이 현재 가격 결과·방향 요약·투자 점수·알림에 남지 않는지 확인한다. `DIDP-44`는 replay 복구가 기존 run/approval을 변형·승계하지 않고 새 run·새 interpretation review·단일 새 snapshot/epoch로 모든 consumer를 재개하며 동일 논리 결과의 중복 알림을 막는지 확인한다. `DIDP-45`는 동시 동일 replay publisher가 하나의 current snapshot·epoch·logical notification으로 수렴하고 stale publisher의 last-write-wins를 차단하는지 검증한다. `DIDP-46`은 commit 후 dispatch 전 권리 철회 시 current API/UI/export/cache를 억제하고 queued 알림을 막되, 이미 수락된 전송을 자동 회수로 오인하지 않으며 기존 IRAP/DUES 보상·대조 절차를 재사용하는지 확인한다. `DIDP-47`은 rights regrant가 과거 approval·snapshot·delivery record를 부활시키지 않고 새 run/review/epoch와 현재 subscription opt-in을 요구하며 별도 열린 gate를 우회하지 않는지 검사한다. 입력이나 현행 replay rights가 없으면 재계산/공개를 막고 과거 run은 감사 이력으로 보존하며, 가격 dependency와 무관한 raw fact는 dependency가 분리됨을 입증할 때 유지한다. 합성 consumer parity acceptance이며 runtime revision graph 구현이나 권리 승인을 뜻하지 않는다. DIDP-41–47은 각각 synthetic policy cases이며 해당 owner 결정을 대체하지 않는다.

Thesis attribution의 내부 사유 코드는 public dossier DTO에 그대로 복사하지 않는다. [DIDP hold reason projection map](../fixtures/disclosure/disclosure-investment-dossier-projection.v0.json)의 DIDP-27~31은 `FILER_ONLY`를 issuer `CONTEXT_ONLY`로 제한하고, 미확정 party/direct impact는 `UNVERIFIABLE`로 유지하며, 권리 미결은 `RIGHTS_BLOCKED`/본문 판단 미실행으로, 정책·review 대기는 reviewer/decision ID 없이 일반 `EVIDENCE_INCOMPLETE`로 표시하는 경계를 고정한다. 오래된 의존성은 `REVIEW_REQUIRED`로 표시하고 stale 승인본 fallback을 금지한다. impact denominator 미완결은 “영향 없음”이 아니라 `UNVERIFIABLE`이며 완전성 주장과 방향 요약을 억제한다. 정확한 내부 blocker·후보·reviewer 정보는 권한 제한 내부 큐에서만 보며, 사용자는 공개 가능한 claim 범위의 상태와 일반화된 공개용 사유만 본다. 내부 attribution reason code 목록은 그대로 반환하지 않으며, DIDP-26의 공개 사유는 별도의 public-safe vocabulary다. 이는 응답/화면 구현이나 내부 사유의 법적 공개 승인이 아니다.

### 미확인 claim의 다음 검증 조건 — EGA-01–EGA-06

기존 projection은 typed `unknowns`, `declaredReviewScope`, `notAssessedFields`, coverage 상태 및 `DIDP-26`의 공개-safe hold 사유를 제공한다. 그 위에 “무엇을 더 확인해야 이 claim을 재검토할 수 있는가”를 설명하는 **검증 공백 카드**를 제안한다. 이 카드는 unknown 상태 자체나 일정 reminder를 대체하지 않는다. claim이 멈춘 이유, 확인에 필요한 자료 유형과 정확한 scope, 제안된 resolution predicate, 현재 권리/coverage 경계를 사용자에게 설명한다.

| 공개 계획 상태 | 사용자에게 보여줄 의미 | 다음 검토 trigger | 실행 동작 경계 |
|---|---|---|---|
| `ACTIONABLE_SOURCE_KNOWN` | 허용된 공식 자료 경로는 특정됐으나 아직 찾지 않았거나 claim에 연결되지 않음 | 사용자가 직접 다시 확인하거나 별도 승인된 수집/검토 절차가 실행됨 | 후보 source/profile은 coverage 증거가 아니며 자동 fetch·polling 금지 |
| `BLOCKED_COVERAGE` | 일부/불완전 범위라 답을 확정할 수 없음 | source reconciliation이 current exact scope를 충족한 뒤 reviewer 재검토 | “선언 범위에서 찾지 못함”으로 표시하거나 자동 재시도 일정 생성 금지 |
| `BLOCKED_RIGHTS` / `OWNER_DECISION_REQUIRED` | 필요한 action 권리가 확인되지 않아 source 내용을 열거나 분석할 수 없음 | named rights/data owner의 승인된 decision revision | 본문·발췌·비허용 링크는 숨김. 권리 승인 또는 확보를 약속하지 않음 |
| `NO_VERIFIED_PATH` | 현재 확인한 범위에서 신뢰 가능한 공식 확인 경로/trigger를 특정하지 못함 | 사용자 재요청, 새 source profile 또는 owner 결정으로 scope가 바뀔 때 | 미래 날짜·후속 공시·자동 알림을 만들어내지 않음 |
| `RESOLVED` / `SUPERSEDED` | predicate가 해당 claim revision에서 충족됐거나 입력 revision 변경으로 이전 계획이 낡음 | 새 근거는 reviewer가 claim을 재판정; 새 revision은 별도 gap 계획 필요 | 계획/과거 상태를 덮어쓰지 않으며 claim 승인·이벤트 완료로 자동 승격하지 않음 |

카드는 `gapId`, 영향받는 `claimRevisionRef[]`, 고정된 `questionKey`, 누락 dimension code, declared source/query/window/subject scope reference, candidate evidence type/source profile, exact rights disposition, coverage disposition, whitelist `resolutionPredicate`, `planState`, dependency fingerprint, 다음 검토 trigger, 별도 알림 동의 reference를 가진다. 사용자 문구는 승인된 템플릿 key에서만 렌더링한다. 자유 생성 문구로 후보·예상 답·투자 해석을 추가하지 않는다. 내부 reviewer ID, provider error, credential, 권리 제한 문서 내용은 제외한다.

`investment-evidence-gap-followup.v0.json`의 `EGA-01`–`EGA-06`은 denominator 공백의 해소 조건, partial coverage, 권리차단, 공식 확인경로 부재, dependency revision에 따른 계획 무효화, 별도 알림 동의 경계를 검사한다. 이 계획은 수집·예약 실행·알림 발송이나 미확인 문서 접근을 승인하지 않는다. 일정 기반 reminder와 결과 follow-up은 기존 ESN contract를 따르며 이 카드에서 만들지 않는다.

#### Dossier consumer surface parity — 현재 구현 경계와 제안 계약

표시 상태의 원본은 `claimAttributionHoldProjection`이며 surface마다 별도 의미표를 만들지 않는다. 공통적으로 현재 사용 시점의 rights/publication epoch와 projection snapshot을 재검증하고 내부 attribution code를 사용자 payload에 복사하지 않는다. DIDP-32~36은 API/UI snapshot 일치, export의 coverage·withheld 보존, notification opt-in/dispatch fence, revoked cache/cursor 차단과 legacy 경계가 fixture에 연결됐는지 검사한다.

##### Source coverage의 manifest 연결 — DIDP-37–DIDP-39

`sourceCoverage`는 boolean이나 단일 `complete` flag가 아니다. [공통 reconciliation manifest](../fixtures/disclosure/disclosure-source-coverage.v0.json)의 digest 검증된 sourceProduct × endpoint × normalized query × declared window × issuer/instrument scope 참조들의 목록이다. 각 entry는 manifest ID/digest, page·row denominator와 coverage state뿐 아니라 correction watermark, master snapshot, subject applicability revision, rights decision set hash와 coverage policy revision을 보존한다. projection snapshot과 `asOf`, publication epoch, issuer/instrument applicability revision은 같은 dossier snapshot에 결박한다.

사용자 export는 요청한 source별 manifest와 상태를 모두 보존한다. 한 source가 `PARTIAL` 또는 `UNKNOWN`이면 aggregate는 그 누락을 유지하며, 항목 생략/권리 차단/coverage 불완전은 무결과를 뜻하지 않는다. `NOT_FOUND_IN_SCOPE`는 정확한 source/query/window/subject 범위에 대해 current rights/action이 허용되고 master·applicability revision이 일치하며 correction watermark까지 포함한 `RECONCILED_AS_OF` manifest digest가 검증될 때만 허용한다. 단순 성공 0건 또는 반복 실행에서 같은 결과(`OBSERVED_STABLE`)는 provider snapshot/completeness 보장이 아니므로 `UNVERIFIABLE`로 남긴다. Rights, master 또는 applicability revision이 바뀌면 예전 manifest 자체가 진본이어도 현재 coverage 주장의 근거로는 stale이며 새 projection이나 no-result 결론에 재사용하지 않는다.

`DIDP-37`은 source별 partial scope와 export denominator를 보존하고, `DIDP-38`은 observed-stable empty result를 negative evidence로 승격하지 않으며, `DIDP-39`는 rights/identity revision mismatch가 coverage currentness와 dossier fallback을 무효화하는지 확인한다. 이는 합성 acceptance이며 source-run 저장 schema/API DTO를 구현하거나 공개 negative evidence 권한을 승인하지 않는다. P3 reconciliation/rights 결정과 P6 public projection 결정이 닫힌 뒤 별도 runtime acceptance가 필요하다.

##### Query scope 정규화와 공개 coverage 문구 — DSC-17–DSC-19 / DIDP-40

`normalizedQueryHash`는 credential을 제외한 원시 URL hash가 아니다. source profile revision, endpoint/product identity, 의미를 바꾸는 유효 요청 parameter, 날짜 정밀도/timezone을 allowlist로 canonicalize하고 RFC 8785 JCS UTF-8 및 domain-separated SHA-256으로 계산하도록 제안한다. `crtfc_key`, API key, Authorization, Cookie, signed URL query는 canonical input에 들어가지 않는다. `page_no`/retry/request ID는 조회 의미가 아니라 pass traversal이므로 hash에서 제외하고 per-page evidence에 보존한다. `page_count`도 의미 hash에서는 제외하지만 `pageSizeRequested`, expected/observed page set, per-page counts로 manifest에 기록한다. 정렬은 분할 pagination에서 관찰 집합에 영향을 줄 수 있으므로 provider profile이 이를 명시하면 profile/hash 입력에 포함한다. 공식 default는 개발가이드에 근거가 있을 때만 effective value로 확장하며 `ABSENT`, `EXPLICIT`, `DEFAULT_RESOLVED` provenance를 구별한다. 정규화 profile이 없거나 URL credential/query semantics가 미확정이면 raw URL을 해시하지 않고 scope를 `UNRESOLVED`, negative evidence를 `UNVERIFIABLE`로 둔다.

OpenDART `list.json`의 [공식 공시검색 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001)는 `bgn_de/end_de`, `corp_code`, `corp_cls`, `pblntf_ty`, `pblntf_detail_ty`, `last_reprt_at`, `sort`, `sort_mth`, `page_no`, `page_count` 및 page/total 응답 필드를 정의한다. 가이드에 따르면 `last_reprt_at` 기본값 `N`은 정정보고서를 포함한 전체 제출보고서 검색이고, sort 기본은 `date/desc`, page count 기본은 10이며 최대 100이다. 현재 [`fetchOpenDartToday()`](../../lib/dart-opendart-client.ts)는 KST 하루를 `bgn_de=end_de`로 설정하고 `sort=date`, `sort_mth=desc`, `page_count=100`, 반복 `page_no`를 보낸다. `corp_code`, `corp_cls`, `pblntf_ty`, `pblntf_detail_ty`, `last_reprt_at`은 보내지 않으므로 profile은 공식 기본 의미(`last_reprt_at=N`, 기타 미지정 filter는 전체 범위)와 실제 명시값을 각각 기록해야 한다. `page_count=100`은 공식 default가 아니라 현재 caller 선택값이며 페이지 분모 reconciliation setting으로 둔다. 가이드/요청 코드 변경은 profile revision과 scope hash를 바꾼다.

| 내부 manifest condition | 공개 `coverageStatus` | 공개 한국어 문구 | 제한 |
|---|---|---|---|
| current rights와 exact scope에서 `RECONCILED_AS_OF` | `COVERED_AS_OF` | 선언한 조회 범위를 기준 시각까지 대조했습니다. | 해당 원천·query·기간·issuer/instrument 범위만 설명. 시장 전체 완전성 아님 |
| `PAGE_ENUMERATION_COMPLETE`, correction/rights/master reconciliation 미완료 | `ENUMERATED_INCOMPLETE_RECONCILIATION` | 페이지 조회는 끝났지만 정정·권리·대상 대조가 완료되지 않았습니다. | 무결과/부정 사실 주장 금지 |
| `PARTIAL` | `PARTIAL` 또는 `UNVERIFIABLE` | 일부 출처 또는 조회 범위만 확인했습니다. / 조회 범위의 완전성을 확인할 수 없습니다. | covered/missing 범위와 count 표시 권리가 있을 때만 `PARTIAL`; 아니면 `UNVERIFIABLE` |
| `UNKNOWN`, `OBSERVED_STABLE`, `UNVERIFIABLE_COVERAGE_INCOMPLETE` | `UNVERIFIABLE` | 조회 범위의 완전성을 확인할 수 없습니다. | 반복 동일 결과는 provider snapshot 증거가 아님 |
| required action 권리 미허용·미해결 | `SUPPRESSED_RIGHTS` | 자료 이용 권한을 확인할 수 없어 결과를 표시하지 않습니다. | 0건이나 결과 count로 표시 금지 |
| run 없음 | `NOT_SEARCHED` | 아직 조회되지 않았습니다. | no-result와 분리 |
| manifest digest/scope 충돌 | `CONFLICT_UNRESOLVED` | 조회 범위 또는 증거 간 불일치가 해결되지 않았습니다. | 임의 manifest 선택 금지 |

`NOT_FOUND_IN_SCOPE`와 `NOT_REPORTED`는 coverage status가 아니라 결과 의미다. 전자는 digest 검증된 current `RECONCILED_AS_OF` exact-scope manifest에서 일치 row가 0건인 경우에 한하고, 후자는 확인된 특정 문서의 expected assertion 부재다. public response는 고정 `publicMessageKey`와 문구만 사용하며 internal state name, provider raw error, credential, reviewer/policy ID를 노출하지 않는다. count/withheld denominator는 해당 exact public action의 권리가 확인된 경우에만 표시한다. `DIDP-40`과 `DSC-17–19`는 이 경계를 합성 acceptance에 추가하고, 런타임 구현이나 OpenDART/RSS의 이용권한을 승인하지 않는다.

| Surface | 현재 코드에서 확인한 기준선 | 새 dossier projection 제안 | 상태 |
|---|---|---|---|
| Public API | [`GET /api/public/market-impact-events`](../../app/api/public/market-impact-events/route.ts)는 legacy `market-impact-events.v1`, mixed KR/US row, `asOf` 응답시각, `no-store`를 사용하며 rights·master/cap·coverage·publication snapshot gate를 적용하지 않는다. | `disclosure-dossier-public-read.v0`의 별도 versioned GET 계약. same snapshot·rights set·applicability·coverage를 바인딩하고 미승인/미귀속 claim을 억제한다. 기존 route 의미는 조용히 전환하지 않는다. | 새 dossier route 미구현; legacy route는 v2 parity를 증명하지 않음 |
| Dossier UI | 저장소에서 canonical issuer dossier의 API consumer/UI는 확인되지 않는다. 기존 `/disclosures`는 저장 공시 검색 화면이다. | DIDP status/reason mapping을 public API와 같은 snapshot에서 렌더링하고 issuer context와 instrument claim을 구분한다. stale response는 기존 화면 값으로 fallback하지 않는다. | 미구현 |
| User export | `DailyDisclosuresPage`의 JSON 파일 저장은 현재 필터의 저장 항목 payload를 내보내는 기능이며 issuer dossier projection export가 아니다. | API/UI와 같은 projection hash, coverage, withheld/unresolved disposition을 포함한다. 권리가 허용하지 않은 body·내부 hold code·reviewer/policy identity는 제외한다. 불완전 scope를 무결과로 바꾸지 않는다. | dossier export 미구현; 기존 raw-data export와 분리 |
| Notification | 기존 DART 경로는 `runDartAutomation`에서 Push/Discord alert를 만들며 canonical event/claim dossier notification이 아니다. Push 본문은 generic이고 Discord는 alert company/title 기반이다. | opt-in subscription과 event revision에 결박하고 전송 직전에 현재 projection status, rights, subject eligibility, epoch 및 preference를 재검증한다. 미귀속이면 affected ticker/body를 넣지 않고 억제 disposition을 기록한다. | DUES/PPD/CDR 제안 contract를 재사용; dossier event notification 미구현 |
| Cache / cursor | legacy public route는 `no-store`지만 stable snapshot/cursor를 제공하지 않고 `asOf`는 응답 생성 시각이다. 새 dossier cache 계층은 확인되지 않는다. | DPR cursor는 route/filter/snapshot/publication epoch/rights hash에 결박한다. revoked/stale 입력은 cache에서 current로 사용하지 않고 cursor를 reject/restart하며 revoked snapshot에 304/stale-if-error fallback을 허용하지 않는다. | v2 cache/cursor·key lifecycle 미구현 및 미승인 |

현재 공개 GET, daily export 또는 DART alert의 존재는 새 dossier contract 준수를 의미하지 않는다. `claimAttributionHoldProjection`과 이 surface matrix는 제안 DTO/acceptance일 뿐 runtime consumer parity의 증거가 아니다. API·UI·export·notification·cache 각 surface의 route inventory, response hash, currentness/rights race와 rejection 경로를 P6 통합 acceptance에서 따로 닫는다.

UI는 각각의 as-of, coverage, source authority, 마지막 관측시각, unresolved/conflict reason을 노출한다. 축 간 기준시점이 맞지 않거나 한 원천 coverage가 partial/stale이면 issuer-wide “정상/위험 해소” 요약을 만들지 않는다. 거래재개·법원 종료는 과거 event를 지우지 않으며 최신 현재 상태와 사건 이력을 함께 유지한다. 공통 snapshot은 publication epoch, rights decision set, capital revision, risk revision을 한 response fingerprint에 묶고, 어느 한 revision이 stale/suppressed이면 본문 및 파생 dossier 전체를 억제한다. 보통주 master/cap eligibility가 현재 gate를 통과하지 못하면 ticker와 종목 dossier를 노출하지 않는다.

이 계약은 화면에 같은 회사의 위험과 희석 사건이 같이 보일 때 단일 점수/색상으로 축약해 사용자가 서로 다른 종류의 사실을 혼동하지 않도록 하는 proposal이다. 자동 매수·매도나 종목 선호 순위를 산출하지 않는다. 구현 수용은 P6의 route·DTO·cache·pagination 동등성, 권리 gate, currentness/coverage owner 결정 후 진행한다.

## API·사용자 화면 경계

실제 경로는 구현 승인 뒤 route inventory와 API 문서에 추가한다. 아래는 설계 계약이며 현재 존재하는 API가 아니다.

| 제안 API | 접근 | 책임 |
|---|---|---|
| `GET /api/disclosures` 확장 또는 국내 전용 읽기 GET | 공개 무인증, read-only | 기간/출처/종목 기준의 저장 공시 및 coverage 조회 |
| `GET /api/disclosure-events` | 공개 무인증, read-only | 승인된 event와 다중 일정·현재 상태·근거 링크 조회 |
| 관리자 분석/검토 명령 | 인증/권한 필수, POST | 분석 실행, 검토 승인, 재분류, 관계 수정. 공개 GET이나 cron GET 부수효과로 제공하지 않음 |
| 수집 job | 내부 cron 인증/서명 필요 | 공식 원천 수집만 수행, 외부 공개 API 문서에 작업 실행 GET으로 노출하지 않음 |

- Public publication is a fail-closed conjunction: event decision, date assertion decision, subject decision, event revision approval, current instrument eligibility, current cap eligibility, current source-rights decision, and current rights-remediation state must each permit the exact read/publication action at one PostgreSQL read-only `REPEATABLE READ` transaction snapshot. Rights remediation is eligible only when no open case applies to the exact source-scope/dependency closure, or every applicable case is `RECONCILED` against its current evidence revision and publication epoch. `DISCOVERY_INCOMPLETE`, `INVENTORY_COMPLETE`, `DISPOSITION_PENDING`, and `ACTIONS_PENDING_VERIFICATION` block affected descendants even if coverage is `CURRENT/COMPLETE` and a later rights decision says `ALLOW`; `RECONCILED` itself never grants read rights, so the exact current source-rights decision must still permit publication. All gate and projection reads share one connection/transaction. A later permissive state never overrides another gate. Missing, expired, conflicting, stale, or unresolved input suppresses the affected date/subject; no stale fallback is returned. Suppression is scoped to proven affected descendants; incomplete lineage/inventory keeps the source-scope root active.
- 공개 응답은 승인된 활성 `COMMON_STOCK` 이벤트와 공개 승인된 date assertion만 반환한다. 종목 자격은 event discovery 당시 assertion을 영구 보존하고, 현재 API 응답에서는 요청 기준 시점의 최신 신선한 공식 master/cap assertion을 다시 적용한다. 시총은 KRW 30,000,000,000 초과여야 한다. stale/unknown cap이면 해당 subject만 fail-closed suppression한다. effective visibility는 event gate, date assertion gate, subject-instrument gate, 승인 revision, 활성 `COMMON_STOCK` assertion, freshness-approved current cap assertion이 모두 허용해야 한다. 상위 event suppression은 모든 하위 날짜/종목을 차단하고, assertion suppression은 해당 날짜만, subject suppression은 해당 종목만 차단한다. event가 공개 응답에 남으려면 공개 가능한 subject/date 조합이 최소 하나 있어야 한다. `UNPUBLISHED`/`SUPPRESSED_EVIDENCE_REVIEW`/`SUPPRESSED_ELIGIBILITY`가 `PUBLISHED`보다 항상 우선하며, 승인되지 않은 새 날짜나 근거가 철회·교체로 약화된 기존 날짜를 stale fallback으로 노출하지 않는다. 미확인 상태는 관리 진단에 한정하고 공개 event로 누출하지 않는다.
- 응답에는 `eventId`, `eventRevision`, `analysisRevisionId`/`analysisSchemaVersion`, subject별 `instrumentEligibilityAssertionId`·`marketCapEligibilityAssertionId`·판정 기준시각, 일정 assertion 배열, 각 assertion의 `valueKind`·precision·source timezone resolution·range boundary semantics·source document revision/hash/locator, `discoveryCoverage`, source별 `sourceCoverageFreshness`(`CURRENT/STALE/UNKNOWN`)와 `asOf`/`coverageDegraded`, `documentAvailability`, `analysisCoverage`, `instrumentAttributionCoverage`, `correctionReconciliationCoverage`, `displayTimezone`을 포함한다. discovery coverage는 `enumerationStatus`(`NOT_RUN`/`VALID_EMPTY`/`PAGE_ENUMERATION_COMPLETE`/`PARTIAL`/`INCONSISTENT`/`FAILED`), nullable sanitized `failureClass`(`QUOTA_EXCEEDED`/`AUTH_OR_ACCESS`/`INVALID_REQUEST`/`MAINTENANCE`/`TRANSIENT`/`UNKNOWN`), `consistencyModel=NON_SNAPSHOT_PAGINATION`, 별도 `stabilityObservation`(`NOT_RUN`/`OBSERVED_UNSTABLE`/`OBSERVED_STABLE`) 축으로 제공한다. 원 API key/message/raw response는 응답하지 않는다. 반복 receipt set이 동일해도 `SNAPSHOT_PROVEN` 또는 절대 무누락을 표시하지 않는다. `displayTimezone`은 현지시각 표시 전용이며 `DATE`/`MONTH`/`QUARTER`를 변환하지 않는다. summary는 claim ID를 보존하는 segment 배열로 내리고, 각 segment의 claim은 권리 정책이 허용하는 source link/locator로 역추적 가능해야 한다. 원문 bytes와 허용되지 않은 발췌문은 공개 응답에 넣지 않는다.
- 공개 일정 GET은 stale 승인 내용을 철회 후 재노출하지 않도록 성공/오류 포함 `Cache-Control: no-store`를 적용하고 CDN/shared cache에서 제외한다. `ETag`/`304`는 현재 기본 금지한다. `stale-if-error`, 이전 page snapshot 재사용은 금지하며, 향후 조건부 응답을 허용하려면 응답 시점 live gate와 최신 watermark 재검증의 경합·지연 상한을 실행형 acceptance로 증명해야 한다. freshness 정책 만료/상태 전환 직후에는 이전 ETag에 대해 304를 반환하지 않고 재조회 필요 응답을 준다. evidence-impact trigger가 등록되는 transaction에서 영향을 받는 root source를 차단하고 epoch를 단조 증가시킨다. impact resolution 실패·partial·overflow 동안은 해당 root source에 의존하는 모든 consumer를 fail-closed suppression한다. API/cursor snapshot이 이전 epoch면 내용이 아니라 재조회 필요 오류를 반환한다. cache purge는 durable outbox로 재시도하지만 purge 성공 여부는 원본 visibility gate를 대체하지 않는다.
- 페이지네이션은 안정적 cursor 기반 정렬(`event_date`, `event_id`, assertion ID 고유 tie-breaker)이어야 하며 total count/coverage와 결과 행 수를 혼동하지 않는다. 공개 page cursor는 canonical JCS payload를 HMAC-SHA-256으로 서명한 opaque token이다. token payload는 `cursorSchemaVersion`, 고정 endpoint/audience, canonical `queryHash`(정규화된 모든 filters/sort/page size), `snapshotId`, 마지막 sort tuple, 발급/만료시각, key ID를 가진다. 서명 message는 `UTF8("KR-DISCLOSURE-PUBLIC-CURSOR-v1") || 0x00 || JCS-UTF8(payload)`이고 서명 검증은 constant-time compare를 쓴다. token은 접근권한을 부여하지 않으며 매 요청 authorization/publication/freshness gate를 다시 평가한다. invalid signature, cross-endpoint/filter replay, queryHash 불일치, expiry, unknown/revoked key는 row/body/ETag/304 없이 `409 CURSOR_INVALIDATED`를 반환한다. signing secret은 secret manager/environment에서만 읽고 로그·DB·문서·token payload에 넣지 않는다. 정상 key rotation은 `kid`별 active/verify-only windows를 유지하며 모든 token이 만료될 때까지 이전 key를 검증 허용; compromise 대응은 해당 `kid` 즉시 폐기하고 발급 cursor 전체를 무효화한다.
- Cursor는 `projectionCommitSHA`, publication decision watermark, global `publicationRevocationEpoch`, 현재 instrument/cap eligibility snapshot watermark, 완전한 정렬된 `sourceScopeSetHash` 및 그 집합 각 scope의 `(scope_key_hash, accepted assertion watermark, coverage_generation, dependency_generation, freshness policy revision)` 튜플을 묶은 불변 snapshot ID를 포함해 모든 페이지가 같은 event revision/date assertion/subject eligibility/publication/source-scope dependency를 읽도록 한다. payload에는 이 전체 snapshot field를 중복하지 않고 `snapshotId`의 immutable server-side manifest에서만 resolve한다. 각 페이지 요청은 PostgreSQL read-only `REPEATABLE READ` snapshot 및 새 DB `requestAsOf` 하나로 gate를 원자적으로 재평가한다. TTL 경과·정책 만료/교체·scope 집합/세대 변경·누락 scope·`CURRENT` 상실 시 해당 페이지는 row/ETag/304 없이 cursor 무효화를 반환하고 이전 snapshot의 결과와 섞지 않는다. `KR-CURSOR-SECURITY-01`에서 승인된 cursor max age·materialized snapshot retention·key rotation/revocation 및 저장 quota policy가 없으면 paginated public API는 비활성이다. snapshot 유지가 필요한 물리적/adapter 구현은 소유 transaction 수명 밖으로 열린 DB transaction을 유지하지 않고 immutable materialized result snapshot이나 동등하게 검증된 방식으로 구현한다. snapshot을 복원할 수 없거나 만료됐으면 일부 결과를 이어 붙이지 않는다. 큰 본문·첨부는 목록 응답에 포함하지 않는다.
- 빈 결과와 source failure/coverage 불명은 다른 응답 상태로 나타낸다. 부분 실패는 성공 출처와 실패 출처를 각각 표시한다.
- 브라우저 화면에는 날짜, 일정 유형, 확정성, 현재 상태, 기준 시각, 회사·코드, 공시 접수번호, 원문 링크, 정정 관계, 분석 요약, 근거 claim/locator, 반대 근거를 함께 제공한다. 운영 검토 화면은 filing/document revision 목록과 hash, 취득/파싱 상태, 원문 변경 diff, analysis revision 비교, event/date 영향 범위, party/COMMON_STOCK eligibility, reviewer decision을 한 filing workspace에서 확인하게 한다. 원문 열람/다운로드는 권리·역할 정책으로 제한한다. 수정/승인/거절/재분석은 actor·이유·입력 revision·이전/신규 포인터를 append-only audit에 남긴다.
- coverage 성공은 pagination 완료만 뜻하고 원문·분석·보통주 연결 완료를 의미하지 않는다. 응답은 `discoveryCoverage`, `documentAvailability`, `analysisCoverage`, `instrumentAttributionCoverage`, `correctionReconciliationCoverage`를 분리하고 승인 이벤트 수와 각 미처리 큐를 함께 노출한다.
- 새 외부 GET은 프로젝트 규칙대로 인증 없이 읽기만 수행하고 OpenAPI·API reference·route inventory 및 `scripts/api-surface.mjs` 감사에 포함한다.

## 저장·보존·정합성

구현 때 기존 테이블을 재사용할지는 데이터 대조 후 결정한다. 개념적 테이블은 다음과 같다.

| 개념 테이블 | 주요 키/제약 |
|---|---|
| `disclosure_filings` | `(source, external_id)` unique, nullable submitting entity FK, receipt date, filing disposition (`ACTIVE/WITHDRAWN/DEEMED_WITHDRAWN/UNRESOLVED`); correction history is derived from relation edges |
| `disclosure_source_rights_decisions` | source product/component, payload class, use purpose/channel, license/terms snapshot hash+URL, allowed operations/retention/attribution, reviewer/status/effective dates |
| `disclosure_structured_source_observations` | provider endpoint/product, guide snapshot/version+hash, request window fingerprint, corp_code + exact rcept_no, HTTP/API status, retrieved_at, response hash or non-retention reason, typed field path/value hash, rights-decision revision/action, mapping release, correction-reconciliation assertion/run FK; immutable |
| `disclosure_filing_relations` | from/to filing FK, relation type/direction, provider marker, evidence document/locator, certainty/review status |
| `disclosure_filing_parties` | filing FK, party/entity FK 또는 unresolved name, role, relation-to-submitter, evidence claim/locator, resolution status |
| `disclosure_event_revision_parties` | event revision FK, filing party FK, event-scoped role, evidence claim/locator, attribution status, review decision |
| `disclosure_event_subject_instruments` | stable subject-link ID, event revision FK, instrument FK, common-stock and cap eligibility assertion FKs, role, direct exposure evidence and review status |
| `disclosure_event_publication_state` | event FK, event-level visibility state, trigger filing relation, evidence impact review, reviewer/updated_at |
| `disclosure_event_date_publication_state` | date assertion FK, assertion visibility state, trigger relation/review, reviewer/updated_at |
| `disclosure_event_subject_publication_state` | event revision+instrument subject FK, `PUBLISHED/SUPPRESSED_ELIGIBILITY/SUPPRESSED_EVIDENCE_REVIEW/UNPUBLISHED/NEEDS_REVIEW`, subject-link FK, common-stock/cap assertion FK, trigger/review, reviewer/updated_at |
| `disclosure_documents` | filing FK, source document identity, URL/filename/MIME metadata |
| `disclosure_document_fetch_attempts` | document/run FK, idempotency key, attempt no, status, request fingerprint, response diagnostics, start/end; append-only |
| `disclosure_document_revisions` | document FK, revision no, content SHA-256, byte length, source MIME, storage locator or non-retention reason, fetched_at; immutable bytes identity only |
| `disclosure_document_validation_results` | document revision FK, validator/policy version, result, inspected type/size/archive manifest hash, sanitized findings; immutable |
| `disclosure_document_revision_relations` | from/to document revision FK, typed relation, source evidence/locator, reviewer decision FK |
| `disclosure_parse_attempts` | document revision FK+input hash, parser/extractor version, status, output hash/counts, start/end, sanitized failure; append-only |
| `disclosure_entities` | stable entity identity and optional unique DART `corp_code` |
| `disclosure_instruments` | stable internal instrument identity and asset type |
| `disclosure_instrument_identifiers` | instrument FK, namespace/market/code with valid range |
| `disclosure_entity_instrument_links` | entity↔instrument FK, valid range, verification source/as-of; overlap 방지 검토 |
| `disclosure_instrument_master_snapshots` | source snapshot/hash/run identity, observed_at; immutable |
| `disclosure_instrument_eligibility_assertions` | snapshot FK, instrument FK, active/type/market, policy version and verdict |
| `disclosure_market_cap_eligibility_assertions` | instrument FK, raw cap/currency/source/as-of, floor/freshness policy version and verdict; immutable |
| `disclosure_analysis_attempts` | exact input generation/hash, parser/model/prompt/schema versions, idempotency key, status/output hash, times, sanitized failure; append-only |
| `disclosure_analysis_revisions` | analysis attempt FK, immutable normalized input/output hash, claim/summary/date payload, created_at; no mutable review status |
| `disclosure_review_decisions` | target type/ID/revision, input hash/generation, decision, reviewer role, reason, predecessor decision, created_at; append-only |
| `disclosure_claim_evidence` | analysis revision FK, claim ID, evidence ID, `SUPPORTS/CONTRADICTS/CONTEXT`, source filing/document revision FK+hash, locator, source-rights decision FK, verification status; immutable |
| `disclosure_claim_consumer_identities` | stable identity key, event FK, closed consumer kind, exact typed natural key + canonical hash; unique `(event_id, consumer_kind, natural_key_hash)` with exact-object collision check |
| `disclosure_claim_consumers` | identity FK, projection commit FK, event/revision, deterministic consumer revision key, content hash, typed natural key; unique `(projection_commit_sha, consumer_key)` and identity+generation |
| `disclosure_claim_consumer_refs` | consumer composite FK `(projection_commit_sha, consumer_key)`, stable identity FK, analysis revision FK, claim ID; unique `(projection_commit_sha, consumer_key, claim_id)` |
| `disclosure_evidence_impact_runs` | trigger ID/hash, `projection_commit_sha` FK, resolver version, unique logical idempotency key, created_at; immutable work identity; unique `(run_id, projection_commit_sha)` |
| `disclosure_evidence_impact_attempts` | run+projection composite FK, monotone attempt number, `QUEUED/RUNNING/COMPLETE/FAILED/OVERFLOW`, lease/fencing token, counts, times; unique `(run_id, attempt_no)` and `(attempt_id, projection_commit_sha)`; immutable terminal attempts; one active attempt per logical run |
| `disclosure_evidence_impact_items` | attempt + projection generation FK, same-generation consumer FK, causal edge-set hash, prior state, required suppression/review action; immutable per terminal attempt |
| `disclosure_publication_epochs` | append-only epoch ID, trigger/action/scope hash, projection generation, publication decision, created_at |
| `disclosure_publication_suppression_roots` | idempotent root trigger key, closed `scope_kind` incl. `SOURCE_SCOPE`, scope-key hash, trigger hash, projection generation, creation epoch FK |
| `disclosure_publication_suppression_root_states` | root FK, monotone state revision, `ACTIVE/RESOLVED`, epoch FK, impact attempt/coverage assertion FK, decision/reason; append-only |
| `disclosure_publication_watermarks` | singleton current epoch FK, updated_at; points to greatest committed epoch |
| `disclosure_publication_outbox` | publication epoch FK, decision/snapshot, idempotent cache invalidation delivery state, attempts/last error/delivered_at |
| `disclosure_events` | stable event ID, filing/source references, current approved revision pointer |
| `disclosure_event_revisions` | event FK, analysis FK, source filing/revision, immutable content + created_at |
| `disclosure_event_dates` | event revision FK, date kind, `value_kind`, precision, typed local date/time or offset instant or partial period/range, source timezone label/zone ID and resolution, range-boundary semantics, certainty/status, evidence FK |
| `disclosure_event_date_relations` | from/to assertion FK, `SUPERSEDES/CONTRADICTS/REFERENCES`, evidence and review-decision FK; append-only |
| `disclosure_event_relations` | source/target event, relation type, evidence, unique relation key |
| `disclosure_ingestion_runs` | source/window/request fingerprint/page parameters/consistency model/enumeration status/stability observation/API status+message/failure class/error/start/end/counts |
| `disclosure_source_freshness_policies` | `(source, scope_key, policy_revision)` unique; immutable required correction window/cadence/max-age, quota/calendar rule, effective range, owner/reviewer decision FK |
| `disclosure_source_scope_filing_dispositions` | reconciliation run + filing FK, source metadata hash, classifier/taxonomy revision, terminal relevance/impact disposition, target consumer refs, evidence/reviewer; append-only per filing/run |
| `disclosure_source_coverage_assertions` | source/scope + immutable policy/reconciliation run FK, covered window, enumeration/consistency outcome, last successful `as_of`, receipt/metadata/disposition hash-set digests and counts, accepted_at; unique `(source, scope_key, policy_revision, run_id)`; no mutable freshness status |
| `disclosure_source_coverage_watermarks` | `(source, scope_key)` PK + unique canonical `scope_key_hash`, current accepted assertion/policy/latest attempt FKs nullable until first accepted run, monotone coverage/dependency generations, CAS version/updated_at |
| `disclosure_source_coverage_consumer_refs` | projection generation + `disclosure_claim_consumers` composite FK, source/scope natural key + canonical `scope_key_hash`, evidence-lineage hash, resolver version; unique `(projection_commit_sha, consumer_key, source, scope_key_hash)` |
| `disclosure_review_audit` | actor/action/object/old-new reference/reason/time; append-only |

### 최소 필드와 정규화 경계

| 테이블 | 반드시 독립 컬럼으로 둘 값 | JSON/외부 객체로 둘 값 |
|---|---|---|
| `disclosure_filings` | 내부 ID, source, external ID, nullable submitting `entity_id` FK, 보고서명, 접수일, 접수시각(있을 때만), 시각 정밀도, 원문 URL, filing status, fetch 상태/시각 | 공급자 원 응답 metadata, 매핑되지 않은 source 필드 |
| `disclosure_source_rights_decisions` | source product/component, purpose/channel, terms/license URL/hash/as-of, allowed operations/retention/attribution, reviewer/status/effective dates | policy source snapshot, review notes, renewal/expiry evidence |
| `disclosure_structured_source_observations` | provider endpoint/product, guide snapshot/version+hash, request window fingerprint, corp_code + filing FK/rcept_no, HTTP/API status, retrieved_at, response hash or non-retention reason, field path, normalized value/hash, source-rights revision/action FK, mapping release FK, correction-reconciliation assertion/run FK, coverage disposition | 허용 권리 내 response body; 비밀 credential 및 허용되지 않은 원문/응답 bytes 미저장 |
| `disclosure_filing_relations` | from/to filing FK, `CORRECTS/WITHDRAWS/REFERENCES` typed relation/direction, source marker, evidence locator, certainty/review state, observed_at | 공급자 원 응답의 원시 relation fields |
| `disclosure_filing_parties` | filing FK, legal entity FK 또는 unresolved raw name, participant role, submitter relationship, source claim/locator, resolution status | 원문상 자회사/계약당사자/대상회사/보증·지원 제공자와 제출자 간 관계 |
| `disclosure_event_revision_parties` | event revision FK, filing party FK, 사건별 party role, 근거 claim IDs, attribution status/review ID | 해당 filing party가 특정 event에서 수행하는 역할과 직접 관계 |
| `disclosure_entities` | 내부 entity ID, 선택적 unique DART `corp_code`, 유효 이름/상태 및 관측시각 | 상장·비상장 및 제출자·party 역할을 포함한 공식 법인 identity와 원본 metadata |
| `disclosure_instruments` | stable internal ID, asset class, 생성/종료 상태 | 화면 표시용 파생값 |
| `disclosure_instrument_identifiers` | instrument FK, namespace, market, code, valid_from/to, evidence | 원천 별칭 부가정보 |
| `disclosure_documents` | filing FK, source document key, URL, 파일명, source MIME metadata | 전달자 제공 document metadata |
| `disclosure_document_fetch_attempts` | document/run FK, idempotency key, attempt no, `QUEUED/RUNNING/FETCHED/UNAVAILABLE/RETRYABLE_FAILURE/TERMINAL_FAILURE`, request fingerprint, HTTP/API response, started/completed_at, sanitized error | 허용 범위의 응답 진단; credential 및 불필요한 개인정보 제외 |
| `disclosure_document_revisions` | document FK, revision, SHA-256, byte length, source MIME, storage locator 또는 non-retention reason, fetched_at | 원문 byte identity만; parser version·parse state는 별도 attempt에 둠 |
| `disclosure_document_validation_results` | document revision FK, validator/policy version, `VALID/REJECTED`, inspected MIME/size, archive manifest hash, findings hash, validated_at | sanitized finding codes; 악성 입력 원문 복사 금지 |
| `disclosure_document_revision_relations` | from/to document revision FK, `REPLACES/ADDS_ATTACHMENT/REFERENCES`, source evidence, review decision FK | 같은 filing 안의 첨부 교체와 추가 관계 |
| `disclosure_parse_attempts` | document revision FK+input hash, parser/extractor version, `NOT_RUN/RUNNING/COMPLETE/PARTIAL/FAILED/UNSUPPORTED`, output hash/counts, started/completed_at, sanitized failure | 재생성 가능한 추출물 locator; 원문/추출물 권리는 별도 적용 |
| `disclosure_entity_instrument_links` | entity FK, instrument FK, relation type, source/evidence, valid_from/to, reviewer/status | 제출자 또는 event party와 종목의 공식 crosswalk snapshot 요약 |
| `disclosure_instrument_master_snapshots` | sync run FK, source file/hash, row hash, observed_at, raw row/object locator | 공식 master 원본 row 또는 보존 위치 |
| `disclosure_instrument_eligibility_assertions` | snapshot FK, instrument FK, market/code/type/enabled 및 분류 규칙 version, 판정/사유 | 보통주 분류 진단 상세 |
| `disclosure_market_cap_eligibility_assertions` | instrument FK, raw market_cap/currency, source, observed_at/fetched_at, floor KRW/policy version, freshness decision, `ELIGIBLE/EXCLUDED/UNVERIFIED` | 적용 환산식/오류 근거; 기존 fundamentals 최신 행과 별도의 불변 판정 증거 |
| `disclosure_analysis_attempts` | exact input generation/hash, parser/model/prompt/schema version, idempotency key, `QUEUED/RUNNING/COMPLETE/FAILED`, output hash, start/end, sanitized failure | 비밀값 없이 재현에 필요한 버전·입력 참조만 |
| `disclosure_analysis_revisions` | attempt FK, immutable normalized input/output hash, claim/summary/date payload, created_at | Git event record에서 projection된 구조화 claim, 일정 후보, 방향/근거/반대근거/한계; reviewer/status는 저장하지 않음 |
| `disclosure_review_decisions` | target type/ID/revision, exact input hash/generation, `APPROVED/REJECTED/NEEDS_EVIDENCE`, reviewer role, reason, predecessor decision FK, created_at | evidence diff 및 허용된 review memo; append-only |
| `disclosure_claim_evidence` | analysis revision FK, claim ID, evidence ID, 관계 역할, filing FK, document revision FK+hash, source-rights decision FK, locator, verification status; composite FK/unique로 source·document·analysis·rights 일치성 보장 | quote는 권리 허용 범위에서만 저장하고 원문 전문은 저장하지 않음 |
| `disclosure_claim_consumer_identities` | stable `consumer_identity_key`, event FK, closed consumer kind, exact typed natural key + canonical hash; unique `(event_id, consumer_kind, natural_key_hash)` with exact-object collision check | identity row is logical continuity key; immutable canonical key object retained |
| `disclosure_claim_consumers` | identity FK, source `projection_commit_sha` FK, event/revision, closed consumer kind, deterministic consumer revision key, consumer content hash, typed natural key and origin locator; unique `(projection_commit_sha, consumer_key)` | immutable source JSON path for audit; public text is not duplicated |
| `disclosure_claim_consumer_refs` | consumer revision composite FK `(projection_commit_sha, consumer_key)`, stable consumer identity FK, analysis revision FK, claim ID; unique `(projection_commit_sha, consumer_key, claim_id)`; claim resolve must match canonical source JSON | 없음; canonical JSON/reference tables에서 생성되는 reverse edge |
| `disclosure_evidence_impact_runs` | run ID, trigger type/object/hash, `projection_commit_sha` FK, resolver/schema version, unique logical idempotency key, created_at; unique `(run_id, projection_commit_sha)` | 불변 trigger/work identity; 오류/시도 필드는 child attempt에 둠 |
| `disclosure_evidence_impact_attempts` | attempt ID, run ID, same `projection_commit_sha`, composite FK `(run_id, projection_commit_sha)`, monotone attempt_no, `QUEUED/RUNNING/COMPLETE/FAILED/OVERFLOW`, lease expiry/fencing generation, worker token hash, counts, started/completed_at, sanitized failure class; unique `(run_id, attempt_no)` and `(attempt_id, projection_commit_sha)`; partial unique one-active-attempt per run | retry cause/diagnostics without secrets |
| `disclosure_evidence_impact_items` | attempt composite FK `(attempt_id, projection_commit_sha)`, consumer composite FK `(projection_commit_sha, consumer_key)`, causal edge-set hash, prior state, required action, resolution/reviewer FK; unique `(attempt_id, consumer_key)` | 같은 consumer로 이어지는 모든 인과 edge ID 집합; 원문 텍스트 미복제 |
| `disclosure_publication_epochs` | epoch_id PK, trigger/review decision FK+hash, `REVOKE/RESTORE`, scope hash, projection generation, created_at; append-only | scope member IDs or bounded manifest ref; no source body |
| `disclosure_publication_suppression_roots` | root_id PK, idempotency key `(scope_kind, scope_key_hash, trigger_hash, projection_commit_sha)`, scope kind (`SOURCE_SCOPE/FILING/DOCUMENT/CLAIM/EVENT/DATE/SUBJECT`), typed natural scope FK/key plus canonical scope hash, trigger hash, projection FK, creation epoch FK | scope member manifest pointer/hash; no source body |
| `disclosure_publication_suppression_root_states` | root FK, monotone `state_revision`, state (`ACTIVE/RESOLVED`), publication epoch FK, impact attempt/accepted coverage assertion FK, review decision/reason; unique `(root_id, state_revision)` | immutable transition evidence; latest state revision is authoritative |
| `disclosure_publication_watermarks` | singleton key, `current_epoch_id` FK to immutable epoch history, updated_at | 없음 |
| `disclosure_publication_outbox` | `epoch_id` FK, `SOURCE_SCOPE/EVENT/DATE/SUBJECT` typed scope, publication snapshot ID, unique `(epoch_id, scope, snapshot_id)` idempotency key, delivery state/attempt count/next retry/delivered_at | 외부 cache purge 결과 요약; 비밀값 미저장 |
| `disclosure_events` | 안정 event ID, filing/source references, 생성시각, 현재 승인 revision 포인터, source commit SHA | 영향 종목은 event revision별 subject로 관리하며 제출자만으로 영향도를 추정하지 않음 |
| `disclosure_event_revisions` | event FK, 단조 revision 번호, analysis FK, Git commit SHA, 이전/hash, 승인 상태, actor, 결정시각 | Git event record에서 projection된 요약/영향 분석 |
| `disclosure_event_publication_state` | event FK, 현재 event visibility, suppression trigger, evidence-impact review ID, updated_at | 사건 전체의 공개 eligibility만 관리. 사건 자체 상태와 분리 |
| `disclosure_event_subject_instruments` | event revision FK, instrument FK, subject role, instrument eligibility assertion FK, market-cap eligibility assertion FK, 근거 claim/locator, attribution status | 대상 선정 이유 상세 |
| `disclosure_event_dates` | event revision FK, date kind, `value_kind`, precision, timezone-free local date or local date-time or offset instant or partial period/range typed columns, source timezone label/zone ID/resolution, boundary inclusion, certainty/status, source document revision, locator | 원문 날짜 표현(예: “2027년 1분기”), 원문 timezone label, 해석/변환 근거와 version |
| `disclosure_event_date_relations` | from/to assertion FK, `SUPERSEDES/CONTRADICTS/REFERENCES`, evidence/review decision, created_at; immutable | date assertion value 자체를 덮지 않고 변경·충돌 관계를 기록 |
| `disclosure_event_date_publication_state` | assertion FK, `PUBLISHED/SUPPRESSED_EVIDENCE_REVIEW/UNPUBLISHED`, trigger filing/review ID, reviewer, updated_at | assertion 단위 공개결정. event-level `UNPUBLISHED`가 상위 차단으로 우선 |
| `disclosure_event_subject_publication_state` | subject_link_id FK, `PUBLISHED/SUPPRESSED_ELIGIBILITY/SUPPRESSED_EVIDENCE_REVIEW/UNPUBLISHED/NEEDS_REVIEW`, instrument/cap eligibility assertion IDs, suppression reason, reviewer/audit ID, updated_at | 한 종목의 자격 변화가 다종목 event의 다른 eligible subjects를 숨기지 않도록 분리 |
| `disclosure_event_relations` | from/to event FK, relation type, 근거 revision, 검토 상태 | 관계 판단 추가 사유 |
| `disclosure_ingestion_runs` | source/window/request fingerprint/page size+pages/consistency model/enumeration status/stability observation/advertised and observed total+distinct receipts/API status+message code/failure class/error/start/end | 비민감 요청 파라미터 및 축약 오류 맥락 |
| `disclosure_source_freshness_policies` | source/scope key, policy revision, required correction window, cadence, max age, quota and holiday rule, effective range, reviewer decision FK; unique `(source, scope_key, policy_revision)` | immutable policy rationale and official quota/calendar evidence |
| `disclosure_source_scope_filing_dispositions` | reconciliation run FK, filing FK, exact metadata hash, classifier/taxonomy revision, disposition (`NOT_EVENT_RELEVANT/CANDIDATE_QUARANTINED/IMPACT_LINKED_SUPPRESSED/IMPACT_RESOLVED/UNRESOLVED/FAILED`), impacted `(projection_commit_sha, consumer_key)` refs, reviewer; unique `(run_id, filing_id, disposition_revision)`; referenced consumers use same-generation composite FK | classifier output/reason and source relation candidates; append-only revision history |
| `disclosure_source_coverage_assertions` | source/scope, exact policy revision FK, successful reconciliation run FK, covered window, enumeration/consistency result, last-success `as_of`, distinct receipt + disposition count/hash, accepted_at; unique `(source, scope_key, policy_revision, run_id)` | sanitized run diagnostics; mutable `CURRENT/STALE/UNKNOWN` is never stored as source fact |
| `disclosure_source_coverage_watermarks` | `(source, scope_key)` PK, unique canonical `scope_key_hash`, nullable current accepted assertion/policy/latest attempt run FKs until first accepted run, monotone coverage generation + dependency generation, CAS version/updated_at | identity row exists before policy/assertion; current pointers only; assertion rows remain immutable |
| `disclosure_source_coverage_consumer_refs` | projection generation, consumer FK `(projection_commit_sha, consumer_key)`, source/scope natural key + canonical `scope_key_hash`, evidence-lineage hash, resolver version; unique `(projection_commit_sha, consumer_key, source, scope_key_hash)` | derived reverse index reconciled from consumer claims → claim evidence → document revision → filing source; raw key and recomputed hash must both match watermark/root |
| `disclosure_review_audit` | actor/action/object ID/이전·신규 revision/reason/시각 | redacted diff; 원문 전체를 감사 로그에 복제하지 않음 |

`FactClaim` 본문/정규화 값은 immutable `disclosure_analysis_revisions` JSON에 두고 claim 자체의 테이블화는 하지 않는다. 단, 근거 연결은 다대다 의존성·정정 영향 추적·권리 판정·검색이 정확성의 필수 조건이므로 `disclosure_claim_evidence` 행으로 정규화하고 JSON의 `evidenceRefs`와 원자적으로 일치시킨다. 각 evidence는 정확한 filing/document revision, hash, locator를 가리킨다. 한 원 제출을 DART/KIND가 재노출한 alias는 canonical filing 관계로 접고 독립 근거 수로 중복 집계하지 않는다. 일정 날짜는 검색·정렬·상태 전이가 핵심이므로 별도 행과 FK로 둔다. 본문 원문을 DB row에 직접 저장하지 않고 immutable object storage 또는 source 재조회 중 하나를 권리·보존·복구 기준에 따라 선택한다. 저장 위치에는 content hash를 같이 두고 수정 불가 정책을 적용한다.

#### Consumer-kind key contract 및 legacy 경계

`consumer_identity_key`와 `consumer_key`는 서로 다른 역할을 가진다. `consumer_identity_key`는 revision을 넘어 논리적으로 같은 consumer를 찾기 위한 안정 identity이며 `SHA256(UTF8("KR-DISCLOSURE-CONSUMER-IDENTITY-v1") || 0x00 || JCS-UTF8({eventId,consumerKind,naturalKey}))`로 만든다. `consumer_key`는 특정 event revision·projection generation·content hash의 immutable consumer revision key이며 `SHA256(UTF8("KR-DISCLOSURE-CONSUMER-REVISION-v1") || 0x00 || JCS-UTF8({eventId,eventRevision,projectionCommitSHA,consumerIdentityKey,consumerContentHash}))`로 만든다. 여기서 `0x00`은 domain separator 뒤의 NUL byte이며 canonical serializer는 RFC 8785 JCS다. 두 hash 모두 SHA-256 lowercase hex이고 natural key object는 문자열 concat이 아닌 typed JCS object다. `consumerContentHash`는 같은 consumer payload의 JCS UTF-8 byte hash이며 revision metadata/key를 제외하고 ordered claim reference array를 포함한다. ID·content·projection commit이 바뀌면 consumer revision key가 새로 생기지만 identity key는 동일 logical object일 때 유지된다. identity key 충돌 시 hash만으로 병합하지 않고 exact-object collision check로 canonical naturalKey exact equality와 event/kind를 검증한다. 같은 generation 안의 consumer revision identity는 unique하고 consumer-ref edge `(projection_commit_sha, consumer_key, claim_id)`도 unique다. claim refs 내 중복 ID는 거부한다. hash 입력에는 비밀값 대신 stable ID를 사용한다. consumer kind별 natural-key object는 아래 계약을 따른다.

| consumerKind | naturalKey | resolver가 같은 generation에서 검증할 대상 |
|---|---|---|
| `SUMMARY_SEGMENT` | `{segmentId}`; analysis revision은 consumer revision reference | segment identity가 같은 event lineage에서 유지되고, 현재 consumer revision이 가리키는 분석 revision에 claim ID 목록이 포함됨 |
| `DATE_ASSERTION` | `{dateId}` | date row가 event/revision composite FK로 해당 immutable event revision에 속하고 date source evidence/claim refs가 일치함 |
| `EVENT_PARTY` | `{filingPartyId, role}` | filing party와 event-scoped party attribution이 resolve되고 역할/근거 claim이 동일 revision에 존재함; eventRevision+naturalKey 복합키는 unique |
| `EVENT_SUBJECT` | `{stableInstrumentId, subjectRole}` | subject link, active COMMON_STOCK 및 cap assertion, attribution claim이 같은 revision에 resolve됨; eventRevision+naturalKey 복합키는 unique |

논리 schema에는 `disclosure_claim_consumer_identities`(안정 identity와 canonical natural key)와 versioned `disclosure_claim_consumers`(identity FK, event revision, projection commit, consumer revision key/content hash/payload locator)를 구분해 둔다. consumer refs, impact items, source coverage reverse refs는 모두 consumer revision composite FK로 같은 generation을 가리키고 별도의 identity FK로 revision 간 비교를 지원한다. eventRevision은 revision row에 보존하며 identity natural key에 넣지 않는다. 단, 실제 assertion 자체가 새 ID를 받는 immutable object(예: corrected `DATE_ASSERTION`)는 새 consumer identity로 기록하고, 이전/새 assertion 간 `SUPERSEDES/CONTRADICTS` 관계를 별도 edge로 연결한다. 따라서 안정 identity를 변경된 사실의 연속성이나 동일한 내용의 근거로 오해하지 않는다.

#### Byte-level hash와 old/new generation join 수용 제안

[`consumer-identity-executable-acceptance.v0.json`](../fixtures/disclosure/consumer-identity-executable-acceptance.v0.json)은 논리 fixture와 분리된 실행형 acceptance runner 입력 계약이다. RFC 8785에 맞춰 입력은 I-JSON으로 검사하고, 중복 property, invalid Unicode/lone surrogate, 비정확 큰 정수 number를 reject하거나 제품 schema에서 exact decimal string으로 고정한다. Object key는 재귀적으로 UTF-16 code unit 순 정렬, 배열 순서는 보존, 문자열 Unicode normalization은 하지 않으며 canonical JSON 결과는 UTF-8로 encode한다. Hash 대상은 `UTF8(domain) || 0x00 || canonicalBytes` 전체이며 `inputBytesHex`는 이 NUL 구분자가 실제 단일 `00` byte인지 확인한다. 각 positive vector는 canonical JSON text·UTF-8 hex·domain-prefixed byte hex·SHA-256 digest를 함께 제공한다. Property order permutation만 같은 digest가 되고 array 순서 또는 NFC/NFD 차이는 서로 다른 canonical bytes/hash여야 한다.

Acceptance runner는 아래 단계를 별도 보고한다: (1) RFC8785 parser/canonicalizer conformance vector, (2) consumer identity/revision domain separator와 hash digest, (3) canonical identity/revision/ref set 구성, (4) transaction snapshot 단위 DB row/FK reconstruction, (5) old→new identity transition set parity, (6) impact item 및 source coverage ref가 자기 projection generation에만 join되는지 확인, (7) acceptance report와 withheld publication fixture. 단계별 output은 canonical sorted primary-key tuple digest 및 row count를 보유한다. 단순 전체 row count 같음은 충분하지 않으며 identity set, revision set, claim-ref set, transition set, impact-item set, coverage-ref set을 각각 양방향 anti-join으로 비교한다.

| Acceptance layer | 재구성할 canonical tuple | 필수 assertion / 실패 결과 |
|---|---|---|
| identity | `(event_id, consumer_kind, canonical_natural_key_bytes, consumer_identity_key)` | identity key 재계산·exact object 대조·충돌 분리; 한 identity가 복수 event/kind에 cross-link 되지 않음 |
| revision | `(projection_commit_sha, consumer_identity_key, event_revision, consumer_key, consumer_content_hash)` | revision hash 재계산, immutable revision count와 canonical source count 일치, 동일 payload upsert 금지 |
| claim refs | `(projection_commit_sha, consumer_key, analysis_revision_id, claim_id)` | duplicate edge 0, claim/analysis reference exact resolve, old refs immutable |
| transition | `(identity_key, old_projection, old_consumer_key, new_projection, new_consumer_key, transition_kind)` | source diff로 기대 집합 생성; 누락/중복/임의 identity carry 0; 불명확한 re-key는 `UNRESOLVED` |
| impact items | `(attempt_id, projection_commit_sha, consumer_key, causal_edge_set_hash)` | attempt projection과 consumer/revision projection이 exact match; cross-generation FK 위반 0 |
| coverage refs | `(projection_commit_sha, consumer_identity_key, consumer_key, source, scope_key_hash, evidence_lineage_hash)` | source scope resolver input과 accepted generation ref set의 양방향 digest/count 동일 |

모든 layer가 일치할 때만 해당 test snapshot acceptance=`PASS_FOR_FIXTURE`다. digest mismatch, missing parent, orphan edge, cross-generation join, duplicate tuple은 `FAIL_CLOSED`로 처리하고 incomplete source→index lineage는 `INCOMPLETE`; 둘 다 suppression 유지·public acceptance 결과 비공개다. 이전 승인/세대의 rows는 갱신·삭제하지 않는다. 0-row layer는 source fixture 자체가 empty로 선언됐고 그 empty의 coverage가 complete일 때만 PASS하며, 실행 누락/조기 종료와 구분한다. Runner가 실제 격리 DB를 사용하지 않거나 DB catalog/DDL이 승인된 schema와 다른 경우 hash test가 PASS여도 relational acceptance는 `NOT_RUN`이다.

합성 실행형 입력 fixture는 [`consumer-identity-executable-acceptance.v0.json`](../fixtures/disclosure/consumer-identity-executable-acceptance.v0.json)이며 `CIX-01-IDENTITY-ASCII`, `CIX-02-IDENTITY-ARRAY-ORDER-PRESERVED`, `CIX-03-REVISION-DOMAIN-AND-CANONICAL-ORDER`, `CIX-04-OBJECT-PROPERTY-PERMUTATION`, `CIX-05-ARRAY-ORDER-CHANGE-CHANGES-CANONICAL`, `CIX-06-NFC-NFD-ARE-NOT-NORMALIZED`, `CIX-07-UNSAFE-INTEGER-USES-DECIMAL-STRING`, `CIX-08-DUPLICATE-PROPERTY-AND-LONE-SURROGATE-REJECT`, `CIX-09-OLD-NEW-COMPOSITE-FK-RECONSTRUCTION`, `CIX-10-IMPACT-ITEM-CROSSES-COMMIT`, `CIX-11-IDENTITY-REVISION-REF-COUNT-MISMATCH`, `CIX-12-TRANSITION-OMISSION-IS-INCOMPLETE-NOT-UNAFFECTED` 12개 분모를 고정한다. `scripts/check-docs.mjs`는 canonical bytes가 제공된 fixture text와 맞는지, domain+NUL 결합과 digest 재현을 정적으로 확인하지만 RFC8785 canonicalizer implementation의 적합성이나 실제 database join을 실행하지 않는다. 실제 runner가 독립 RFC vector를 통과하고 격리 DB로 reverse index를 재구성해야만 이 계획의 executable acceptance를 완료할 수 있다.

##### Acceptance 실행 manifest·report·격리 경계 제안

[`consumer-identity-acceptance-report.v0.json`](../fixtures/disclosure/consumer-identity-acceptance-report.v0.json)은 실행 결과의 8개 fail-closed boundary를 정한다. 하나의 immutable `acceptanceRunId` 아래에서도 아래 stage는 별도 status/result hash를 갖는다: (a) RFC8785 conformance (`JCS`), (b) domain/UTF-8/SHA vectors (`HASH`), (c) schema/migration fingerprint (`SCHEMA_PREFLIGHT`), (d) canonical-vs-index identity/revision/ref/transition set (`RELATIONAL_RECONSTRUCTION`), (e) impact/coverage composite joins (`DOWNSTREAM_JOIN`), (f) report integrity/privacy (`REPORT_INTEGRITY`). Overall=`PASS`는 필수 stage 전부 PASS 및 manifest/digest/분모 재조정이 통과한 경우만 허용한다. JCS/HASH PASS는 RELATIONAL_RECONSTRUCTION/DOWNSTREAM_JOIN에 승계되지 않고, unavailable stage는 `NOT_RUN`/overall `INCOMPLETE`다.

| Report area | 고정 필드/증거 | 차단 규칙 |
|---|---|---|
| input manifest | `runId`, fixture contract/version/hash, source commit SHA, acceptance query/runner build hash, RFC suite 및 canonicalizer name/version/package hash, start/end UTC | 입력이나 runner 변경 시 새 run lineage; secret/env value는 미포함 |
| target/schema | 격리 target opaque identity, DB engine/version, exact migration range, applied migration checksum, catalog/schema fingerprint, transaction isolation, rollback/cleanup result | target이 production/shared DB이거나 schema fingerprint mismatch면 relational stage 실행 금지 및 `NO_GO` |
| stage output | stage status, start/end, input/output set hash, expected/observed row counts, anti-join counts/digests, first differing synthetic tuple IDs, sanitized error class, `NOT_APPLICABLE` 근거 | 원문 body, 실제 issuer/receipt, credential, connection string, 개인정보를 report/fixture에 넣지 않음 |
| relational snapshot | canonical/index identity·revision·claim-ref·transition·impact·coverage set digest, source row count, DB row count, FK check count, cross-generation join count, transaction rollback status | 서로 다른 stage에서 나온 generation snapshot은 합치지 않고 모든 tuple의 projection commit을 비교 |
| independent review | runner 실행자, artifact reviewer 역할/opaque ID, code/schema/fixture revision 검토, acceptance manifest/report digest와 verdict | 작성자 단독 self-approval 금지; report hash가 재계산 값과 다르면 모든 승인 무효 |
| decision link | `KR-DB-DRIFT-01`, `KR-END-TO-END-ACCEPTANCE-01` 등 적용 decision revision, validity/expiry, scope, `HOLD/NO_GO/GO_CANARY/GO_LIMITED` 결정 ref | green test status만으로 운영 결정 자동 생성 금지; owner signed decision 별도 |

실행은 ephemeral disposable DB 또는 승인된 격리 schema/database에서만 한다. Runner preflight는 connection target allowlist/identity, DB user 권한, 현재 schema fingerprint, migration checksum, transaction setting, fixture row ceiling를 검증한다. 어느 값이 불명확하거나 target이 production/shared로 판정되면 첫 DDL/DML 전에 중단한다. 각 negative vector는 transaction/savepoint 또는 fixture DB를 복원해 실행하고 모든 failure injection 후 expected row inventory/hash 및 cleanup을 재검증한다. 임의 production dump를 복사하지 않으며, 실제 데이터 대신 합성 IDs와 공개 가능한 metadata만 사용한다.

Fixture change, runner/canonicalizer/package change, DB engine/migration change, acceptance query hash change, failure report tamper, 또는 reviewer independence/scope change는 이전 report를 `EXPIRED` 처리하고 새 run ID를 요구한다. Report는 append-only content-addressed artifact; rerun은 prior result를 update하지 않고 `supersedesRunId`를 지정한다. `JCS=PASS, DB=NOT_RUN` 또는 `HASH=PASS, relational diff>0`은 overall PASS로 집계할 수 없다. `consumer-identity-acceptance-report.v0.json`의 `CIRR-01`–`CIRR-08` fixture는 이런 상태 승격, schema drift, row mismatch, complete-empty 분모, report tamper, 재실행 및 secret/body 누출 경계를 고정한다. checker가 확인하는 것은 이 report contract의 정적 fixture 및 SHA input-byte 일관성뿐이며 격리/rollback/report signing 실제 동작은 `NOT_RUN`이다.

현재 저장소를 read-only로 확인한 결과 `market-impact-events.v1`에는 eventId/eventDate와 평문 summary/evidence 배열이 있지만 `eventRevision`, stable segment/date/party/subject IDs, source commit checkpoint는 없다. `scripts/import-market-impact-events.mjs`는 active COMMON_STOCK ticker를 확인한 뒤 `ON CONFLICT(event_id) DO UPDATE`로 `market_impact_events`의 summary/evidence/raw_event를 덮어쓴다. `V163`도 revision/impact linkage 없이 한 행을 저장한다. `investment_calendar_events` (`V130`)의 고유 키는 `(source, external_id)`이며 versioned consumer ref를 제공하지 않는다. 따라서 v1 record에서 consumer edge가 없다는 사실은 “영향 없음”이 아니라 “영향 추적 불가”다. 모든 legacy consumer는 승인된 mapping manifest와 원문/hash/review 검증 전 `QUARANTINED`로 남고 새 impact index, 일정 공개, index-empty pass의 입력이 될 수 없다. v2 resolver는 예시의 stable `segmentId`, `dateId`, `filingPartyId`, `instrumentId/role`에 해당하는 불변 키가 없는 event revision을 거부한다.

근거 영향은 `filing/document revision → disclosure_claim_evidence → claim → disclosure_claim_consumer_refs → summary segment/date assertion/event party or subject attribution → event revision → publication decision` 의존 그래프를 따라 계산한다. 이 reverse index는 검토 승인 전 canonical JSON의 모든 claim reference와 typed event/date/party/subject 관계를 비교해 누락 0건을 보장하고, source commit/generation별 immutable projection으로 고정한다. 입력 JSON을 읽지 못하거나 인덱스 cardinality/hash가 어긋나면 event/analysis revision을 승인·공개할 수 없다. 정정·철회·첨부교체·권리변경 trigger 등록 transaction은 source revocation/root suppression, append-only publication epoch event 삽입, singleton watermark의 current epoch FK 이동, 해당 epoch outbox event, unique logical impact run, attempt 1의 `QUEUED` row를 함께 commit한다. epoch 번호는 singleton row lock/CAS 아래 `current_epoch_id+1`로 산출해 epoch row를 insert하고 pointer를 이동하므로 롤백되지 않은 gap이나 과거 outbox 참조 손상이 없다. worker는 DB에서 queued attempt를 claim하므로 queue publish loss로 suppression만 남거나 작업이 사라지지 않는다. run은 trigger hash+projection generation+resolver version으로 고정하고 worker 실행은 자식 attempt로 저장한다. 동일 attempt 중복 delivery는 같은 attempt에 수렴하며 terminal `FAILED`/`OVERFLOW` attempt는 immutable로 남긴다. 제한된 retry는 동일 logical run 아래 더 높은 `attempt_no`를 생성하고 한 시점에 active attempt는 하나뿐이다. `COMPLETE` terminal attempt만 최종 영향목록이다. `FAILED`/`OVERFLOW`/timeout, edge 누락 또는 재시도 중에는 해당 source에 종속된 모든 consumer를 보수적으로 차단한다. 모든 최종 consumer와 인과 edge를 immutable impact item에 기록한 뒤에만 좁은 범위 suppression으로 전환할 수 있다. 유일한 지지 근거가 무효화되면 claim을 unsupported로 표시하고 이를 사용하는 날짜·요약·귀속 및 공개를 차단한다. 복수 근거 중 일부가 무효화돼도 생존 근거를 자동으로 충분하다고 보지 않고 재검토한다. 반박 근거가 추가되면 claim은 최소 `CONTESTED`로 전환하며, 기존에 저장된 내용이라도 공개 projection에서 제거/보류한다. 새 근거가 충돌하면 stale 승인본으로 fallback하지 않는다. 영향 범위가 입증되지 않은 독립 claim도 root suppression 중에는 함께 차단되며, latest complete attempt 후에만 영향 없음이 확인된 consumer를 복구할 수 있다.

Source coverage는 이 impact/revocation protocol과 독립 pointer로 운영하되 동일 publication epoch 안에서 원자화한다. 수집 중 page/row/filing dispositions와 consumer refs는 immutable staging에 쌓으며, incomplete run은 accepted coverage pointer를 이동하지 않는다. correction/withdrawal marker나 기존 consumer를 바꿀 수 있는 새 filing이 발견되면 `scope_kind=SOURCE_SCOPE`인 suppression root 및 초기 `ACTIVE` state, `publicationRevocationEpoch` 증가, outbox와 impact run/attempt enqueue를 한 transaction에서 먼저 commit한 후 관계·영향 범위를 resolve한다. Root idempotency key는 `(scope_kind, scope_key_hash, trigger_hash, projection_commit_sha)`이고 동시 trigger는 각각 독립 root로 보존한다. root state는 기존 값을 수정하지 않고 같은 root row lock/CAS 아래 `state_revision+1` append하며 각 전이는 자기 publication epoch를 참조한다. coverage finalization은 새 transaction에서 성공 enumeration, policy validity, required window, distinct receipt↔latest disposition count/hash 일치, disposition terminality, same-generation impacted consumer FK, consumer/source reverse-ref cardinality/hash를 모두 재검증한다. coverage assertion은 원천 열거의 complete/current 증거일 뿐 rights remediation 완료나 공개 권한을 뜻하지 않는다. rights-triggered suppression 해제와 해당 root의 `RESOLVED` 전이는 여기에 더해 (a) 동일 projection commit·coverage run/disposition digest·resolver version의 최신 COMPLETE impact attempt, (b) 같은 `sourceScopeFingerprint`와 current evidence revision에 연결된 모든 rights-remediation case의 `RECONCILED`, (c) expected/discovered descendant set 및 class×location denominator 일치, per-item disposition/action receipt 또는 승인된 제한 예외, restore/reindex/republication verification, (d) 정확한 action에 대한 current source-rights decision 허용을 모두 요구한다. 검증 뒤 immutable `disclosure_source_coverage_assertions` insert, scope watermark의 accepted assertion/policy/attempt 및 coverage/dependency generations CAS 이동, consumer suppression/root state, publication epoch/outbox를 같은 transaction으로 반영한다. 어느 검사든 실패하면 coverage assertion은 열거 증거로만 남고 suppression은 유지한다. `INVENTORY_COMPLETE`는 해제 조건이 아니며 적용 case가 비종료 상태면 그 descendants와 dependent consumers는 숨긴다. relation target 미확정 또는 inventory/lineage 불완전이면 source-scope-wide suppression root를 active로 둔다. known consumer가 검토 대기면 해당 consumer suppression을 유지하면서 검증된 무관 consumers만 해제할 수 있다. 해제는 최신 COMPLETE impact attempt가 같은 `projection_commit_sha`, coverage run/disposition digest, resolver version에 대해 완전한 영향목록을 증명할 때만 가능하며 이전 generation/retry worker는 epoch를 낮추거나 suppression을 해제할 수 없다. 동시 trigger가 하나라도 unresolved/active이면 다른 root가 resolved되어도 scope gate는 닫힌다.

공개 GET은 PostgreSQL read-only `REPEATABLE READ` transaction의 단일 DB snapshot에서 `source_coverage_watermarks`, policy, accepted assertion, filing disposition, source-coverage consumer refs, 각 scope의 모든 suppression root/latest state, publication state/epoch를 읽고 transaction 시작 시 고정한 DB `requestAsOf`로 freshness를 계산한다. 모든 조회는 같은 connection/transaction을 사용한다. `CURRENT/STALE/UNKNOWN` 계산 자체는 read-only이며 벽시계가 max-age 경계를 넘는 순간 다음 요청부터 자동으로 `STALE`이 된다. 이미 시작한 페이지 응답도 gate 전체 평가는 snapshot+`requestAsOf` 기준으로 일관되지만 응답은 `Cache-Control: no-store`이며, 페이지 간에는 각 요청의 새로운 transaction·시각으로 cursor를 재검증하고 stale 전이를 발견하면 즉시 그 페이지를 거부한다. 이 시간 경계 자체에는 DB update/epoch increment를 요구하지 않는다. active root가 하나라도 consumer의 source scope와 일치하면 freshness가 `CURRENT`여도 해당 consumer를 숨긴다. 수집 시도 health/policy/assertion pointer가 바뀔 때 `coverage_generation`, source dependency resolver/refs가 바뀔 때 `dependency_generation`을 각각 CAS 증가시킨다. policy revoke/replace, disposition·lineage 변경은 명시 transaction에서 suppression/epoch를 이동하며, 시간이 흐른 것만으로 기존 cursor나 승인 상태가 freshness gate를 우회하지 못한다.

Impact item은 `consumer_key` FK로 `disclosure_claim_consumers`의 닫힌 kind를 resolve해야 하며, event/revision/natural key/content hash와 claim edge가 같은 projection generation 안에서 모두 일치해야 한다. consumer ref의 출처는 canonical JSON/관계형 원본이며 index는 파생 projection이다. DB transaction은 승인 source commit을 검증하고 해당 revision의 모든 consumer node/claim edge를 삽입·대조·고정한다. 이벤트/date/subject suppression, revocation epoch 변경, outbox 생성은 단일 transaction으로 처리한다. cache purge 실패는 재시도하되, API 공개 판정은 항상 현재 epoch와 publication state를 직접 확인하여 purge 상태에 의존하지 않는다.

Impact run은 immutable logical identity이고 status를 별도로 갱신하지 않는다. 각 trigger/generation/resolver tuple은 unique logical idempotency key의 idempotent impact run 하나로 수렴한다. 각 attempt 상태는 `QUEUED→RUNNING→COMPLETE|FAILED|OVERFLOW` 단방향이며 terminal attempt를 다시 열거나 결과를 덮지 않는다. duplicate enqueue는 logical run의 unique idempotency key에 수렴한다. 새 attempt는 이전 attempt가 `FAILED/OVERFLOW`로 끝나고 retry policy/limit가 허용된 경우에만 monotone `attempt_no+1`로 생성하며 run당 only one active attempt를 허용한다. `RUNNING` lease가 만료되면 DB CAS가 fencing generation을 증가시켜 기존 worker의 쓰기 권한을 폐기한 후 재할당한다. 모든 attempt write는 current fencing generation을 같은 transaction에서 확인하므로 늦게 끝난 zombie worker는 state/item/outbox를 변경할 수 없다. COMPLETE 전 discovered counts, distinct target/edge sets, cardinality/hash를 검증하고 impact items insert와 terminal COMPLETE 전이를 한 transaction으로 commit한다. `COMPLETE` 되지 않은 attempt에는 durable impact item을 저장하지 않는다; staging/partial work는 실패 시 폐기되고 공개 impact set은 COMPLETE attempt만 읽는다. 직전까지 실패하면 COMPLETE가 없고 suppression은 유지된다. COMPLETE 이후 run을 다시 실행하지 않으며 새 trigger/resolver/generation은 새 logical run을 만든다.

#### Evidence impact acceptance matrix

이 표는 implementation 전 고정할 synthetic contract fixture다. fixture는 허용되지 않은 원문 body를 포함하지 않고 stable fake IDs/hash, typed relation, 입력 generation, trigger, expected consumer set/state/epoch만 사용한다. 각 fixture는 canonical input와 expected output hash를 version-control하고 resolver/algorithm 변경 시 reviewer가 diff 승인한다.

| fixture | 입력·trigger / 주입 조건 | 기대 결과 및 필수 assertion |
|---|---|---|
| `EI-01-INDEX-CARDINALITY` | summary/date/party/subject에 서로 다른 claim edge가 있는 source revision; index row 누락·중복·잘못된 consumer revision 주입 | revision approval/import fail; index와 canonical distinct edge set의 양방향 difference가 비어 있지 않음을 오류로 표시; 어떤 미검증 공개도 없음 |
| `EI-02-SOLE-SUPPORT` | 단일 SUPPORTS 근거가 날짜 assertion과 summary segment를 함께 지지; source 철회 | 두 consumer 모두 발견되고 suppression; claim `UNSUPPORTED`; event를 `CANCELLED`로 바꾸지 않으며 이전 revision 불변 |
| `EI-03-MULTI-SOURCE-CONFLICT` | 같은 주장에 독립 canonical filing 2개 SUPPORTS, 한 제출 정정이 상충; DART/KIND는 같은 제출 alias | alias는 독립 source로 중복 계산하지 않음; 변경 근거가 연결된 consumer 발견; claim `CONTESTED`; 남은 SUPPORTS만으로 자동 재승인 금지 |
| `EI-04-RETRY-IDEMPOTENCY` | 동일 trigger hash/generation/resolver version, 동일 attempt를 worker가 중복 전달/실행 | 같은 run+attempt identity로 수렴; consumer/edge/outbox 중복 없음; terminal counts/hash 동일 |
| `EI-05-FAILED-OVERFLOW` | traversal 중 timeout, edge resolver 오류, configured bound 초과 중 하나 주입 | attempt `FAILED` 또는 `OVERFLOW`; root suppression 및 revocation epoch 유지; 넓은 영향 scope 유지; API에 stale 결과 없음 |
| `EI-06-OLD-CURSOR-304` | 기존 epoch로 발급된 page cursor, ETag를 보유한 뒤 trigger commit; cache/CDN이 이전 body를 보관한다고 가정 | `Cache-Control: no-store`; old cursor/conditional request는 304나 기존 body 대신 재조회 오류; 이전 epoch body 재사용 0건 |
| `EI-07-CONCURRENT-TRIGGERS` | 서로 다른 correction trigger 두 개와 worker 완료 순서 역전 | epoch 단조 증가; 늦게 끝난 오래된 run은 새 suppression을 해제하지 못함; 최신 trigger watermark까지 영향받은 각 logical run의 성공 attempt COMPLETE 및 reviewer 승인 전 공개 복구 금지 |
| `EI-08-TYPED-REFERENCE-RESOLUTION` | 존재하지 않는 consumer ID, 다른 event revision ID, 맞지 않는 origin hash/claim ID, run·attempt·consumer 간 projection_commit_sha 불일치 주입 | composite FK 또는 consumer kind resolver 실패; index 승인/impact completion 차단; transaction rollback 또는 FAILED; 잘못 연결된 다른 event/generation은 노출하지 않음 |
| `EI-09-COMPLETE-EMPTY-IMPACT` | 권리/정정 trigger는 유효하지만 complete traversal 결과 consumer 없음 | `COMPLETE`, discovered consumer/edge 0을 기록하고 source/change evidence 보존; reviewer/publication policy 검토 전에 영향 미확인 데이터 자동 공개/상태 변경 금지 |
| `EI-10-FAILED-RETRY-ATTEMPT` | attempt 1은 `FAILED`/`OVERFLOW`로 종료되고 동일 trigger/generation/resolver에서 허용된 retry 요청 | logical run/idempotency key 유지; immutable attempt 1 보존; attempt 2만 새로 생성; attempt 1 staging/items는 폐기되어 output query에 없음; attempt 2 COMPLETE까지 root suppression 유지 |
| `EI-11-LEASE-EXPIRY-FENCING` | attempt worker lease 만료 뒤 기존 worker와 재할당 worker가 동시에 write 시도 | CAS가 fencing generation을 올리고 한 writer만 승인; stale worker write 거부; active attempt 최대 1; attempt 완료 전 partial item set이 공개 영향목록으로 보이지 않음 |
| `EI-12-RIGHTS-DESCENDANT-DENOMINATOR` | source rights decision revoke/expire; derivative, cache, search, export, notification, backup/restore 중 한 artifact identity 또는 location 누락 | expected/discovered set/hash/count 불일치로 remediation `DISCOVERY_INCOMPLETE`; publication epoch advance 및 root suppression 유지; missing descendant 0으로 정규화 금지 |
| `EI-13-TERMS-REVISION-REVALIDATES-SCOPED-DESCENDANTS` | 승인 evidence terms revision 변경; 한 source/action scope 영향은 확인됐으나 별도 product/field/channel dependency는 미확정 | 영향 scope 신규 use 차단 및 stale decision 재검토; complete edge traversal로 무관함이 입증된 consumer만 영향 없음 처리; 모호한 scope는 넓은 suppression 유지 |

acceptance 실행 결과는 resolver/algorithm version, input/output hash, 실행자, 표본 fixture commit, 전체 consumer/edge count, first differing IDs를 기록한다. 0건 기대는 실행된 동일 generation 전체에 대한 cardinality assertion을 뜻하며 단순 예시 통과는 complete traversal 증거가 아니다.

### 원문·파생 데이터 보존 계층 및 출처권한

- OpenDART 소개는 DART 공시 원문을 XML로 내려받아 원하는 자료를 추출해 사용할 수 있다고 설명하고, 원문 API 가이드는 `document.xml`의 응답을 UTF-8 ZIP binary로 규정한다. 그러나 현재 이용약관 제16조는 OpenDART 서비스/관련 프로그램의 저작권은 금융감독원에 있고, 기타 권리는 저작권법·공공데이터법에 따른다고 한다. 이 문서들만으로 전체 원문 영구복제·제3자 재배포·원문 포함 public API를 포괄 허용한다고 단정하지 않는다. 공공데이터포털의 [금융감독원_공시정보_공시검색](https://www.data.go.kr/data/3075133/openapi.do) 등록은 이용허락범위를 공공저작물 출처표시 제1유형으로 표시한다. 이는 해당 등록 상품과 실제 호출 endpoint/field가 일치하는지 대조한 뒤 해당 범위에만 적용하며, 별도 OpenDART 원문 `document.xml` ZIP 및 첨부의 장기 보관·재배포 허가로 확대 해석하지 않는다.
- `SourceRightsDecision`은 endpoint product와 payload component별(검색 metadata, 원문 ZIP/XML, 개별 첨부, 파생 claim/요약/인용), purpose/channel별(내부 일시 처리, 장기 cache, UI 표시, public API, backup)로 별도 기록한다. 각 결정에 catalog/API identity, terms/license snapshot URL+hash+확인시각, attributed source, commercial use/derivative/redistribution/storage/retention/quote conditions, data controller/reviewer, effective range, expiry/review date, `APPROVED/BLOCKED/NEEDS_REVIEW/EXPIRED`를 남긴다. `APPROVED`만으로 임의 작업을 허용하지 않고 요청 작업(operation)이 그 결정의 허용 목록에 명시되어야 한다. 공공데이터포털의 검색 API Type 1 표시를 확인하더라도 원문 ZIP·첨부·파생 요약의 이용조건을 별도로 확인한다. 권리 판단 없는 component/action은 자동 영구 저장·공개 재배포하지 않고, 허용이 확인된 검색 metadata 처리와 미승인 원문 body 보존을 구별한다.
- 기본 저장 계층은 (1) 최소 공시 metadata와 공식 source URL/접수번호, fetch status/시각, response status/최종 host 및 SHA-256, (2) 권리 승인 전에는 원문 body 미보존(`NOT_RETAINED_POLICY`) 또는 승인된 짧은 cache, (3) 허용된 경우에만 암호화·접근통제·불변 object의 원문 bytes와 retention expiry, (4) 원문에서 재생성 가능한 정규화 텍스트/표 추출물(파서 버전/hash/locator 포함), (5) 분석 claim·요약·해석 revision으로 분리한다. body가 없거나 만료됐으면 재취득 URL과 시도 기록을 남기고 분석 재현성은 `SOURCE_REACQUIRE_REQUIRED`로 표시한다.
- 사용자 화면의 요약은 출처 링크, 접수번호, 접수일, 수집/검토시각, 정정 상태, 근거 locator와 요약 버전을 보여준다. 인용은 권리 결정이 허용한 짧은 범위로 제한하고 원문 전문·첨부 또는 대체 가능한 장문 재현은 제공하지 않는다. 실제 허용 인용량·보존기간은 사용자/운영 정책 검토 전 미정이며 임의 숫자를 정하지 않는다.
- 삭제/보존 의무 요청은 원문 object, 파생 추출물, cache, backup 만료 처리, audit의 비식별 최소 기록까지 데이터 lineage를 따라 처리한다. 법적/감사 보존으로 즉시 삭제할 수 없는 copy는 접근 차단 및 예정 파기일을 기록한다. 원문 hash만으로 원문 저작권/개인정보 의무가 자동 해소된다고 간주하지 않는다.

| rights disposition | 문서 요청/응답 처리 | 영구 문서 보존 | 파생 분석 저장 | 기대 상태 |
|---|---|---|---|---|
| 허용된 retrieval+metadata storage | list metadata 수집 | metadata only | filing row/coverage 기록 | endpoint/product mapping과 출처표시 조건 기록 |
| transient processing만 허용 | body fetch와 일시 parse 허용 | 금지; bytes 즉시 폐기 | derivative 저장 권리가 별도 허용될 때만 claim/summary 저장, 미허용이면 metadata-only | `SOURCE_REACQUIRE_REQUIRED` 또는 `METADATA_ONLY` |
| `NEEDS_REVIEW/BLOCKED/EXPIRED` 또는 action 미포함 | body fetch 금지 | 금지 | 분석/요약 저장 및 공개 금지 | metadata 권리가 허용된 범위만 기록하고 rights queue로 보냄 |
| source terms/license가 새 버전으로 변경 | 신규 operation 정지 후 새 snapshot 평가 | 기존 bytes는 기존 승인 retention/파기 결정 적용 | 파생물도 해당 decision scope 재평가 | 기존 승인 event 자체를 증거 없이 삭제/유지하지 않고 별도 review audit |
#### Rights gate operation matrix

| 권리 판정 | Metadata 조회·저장 | 본문/첨부 처리 | 파생물 | 허용 동작 |
|---|---|---|---|---|
| metadata 조회·보존이 승인됨 | endpoint identity/attribution과 함께 저장 | body scope 별도 판정 전 취득 금지 | metadata only | 명시된 metadata operation |
| transient 처리만 승인됨 | 허용된 최소 metadata만 저장 | 승인 범위에서 메모리 fetch/parse 후 bytes 즉시 폐기 | derivative 저장 권리가 별도 승인된 경우만 저장 | transient fetch/parse만 |
| `NEEDS_REVIEW`, `BLOCKED`, `EXPIRED` 또는 operation 미포함 | metadata도 해당 권리가 허용할 때만 저장 | fetch 금지 | 분석·요약 저장/공개 금지 | 권리 검토 queue |
| 조건 변경/결정 만료 | metadata는 기존 결정 범위 내 처리 | 새 body 작업 중지; 기존 bytes는 기존 보존/파기 조건 재평가 | 파생 claim/summary도 재검토 | 새 decision 승인 후 재개 |

#### Rights gate acceptance
| scenario | expected enforcement |
|---|---|
| metadata-only right | permit only scoped metadata endpoint/fields and attribution; deny body endpoint |
| transient body processing | permit bounded in-memory fetch/parse; discard bytes; persist derivatives only under separate approved right |
| needs review, blocked, expired, or missing action | deny fetch/storage/analysis/publication for that action; enqueue review; leave permitted metadata path independent |
| license/terms snapshot changes | stop affected new operations; reevaluate stored bytes and derivatives under retention/deletion obligations |

### Cardinality와 중복/정합성 제약

- 한 filing에는 DART 제출자 entity 하나와 0..N 본문상 사건 참여 법인이 있을 수 있다. `submitting_entity_id`는 제출자만 가리키며 본문상 계약당사자/자회사 등은 `disclosure_filing_parties`에 entity FK 또는 unresolved name, 역할·관계 claim과 함께 기록한다. 이름 문자열만으로 entity identity를 합치지 않는다.
- 한 filing은 0..N event를 만들 수 있고 filing party의 역할은 각 event마다 달라질 수 있으므로 event revision별 관계(`disclosure_event_revision_parties`)를 둔다. FilingParty role만으로 `EventSubjectInstrument` 노출을 허용하지 않으며 event-specific claim, 법인-종목 link, eligibility assertion, review decision을 모두 통과해야 한다.
- DART 목록 `stock_code`와 master 일치는 제출자 종목 후보 확인이지 event impact 귀속 증거가 아니다. EventSubjectInstrument를 만들려면 사건 참여 법인↔instrument 연결 및 해당 event의 직접 노출 근거를 별도로 검증한다. 제출자 법인/자회사/모회사 사이의 관계만으로 자동 전파하지 않으며 재무적 중요성 추론도 별도 해석 claim과 reviewer를 요구한다.
- 한 instrument identity에는 기간별 복수 identifier alias가 가능하다. 동일 namespace/market/code의 유효기간 겹침을 금지하고 code 재사용은 시점 분리한다. Universe row ID는 외부 마스터 관측의 surrogate key로만 취급하며 `disclosure_instruments.id`로 복사하지 않는다.
- 각 eligibility assertion은 정확히 하나의 master snapshot과 instrument를 참조한다. 승인 event subject는 이를 통해 “어떤 source file/hash에서 어떤 분류 규칙으로 보통주로 확인했는지”를 역추적한다.
- 공개 주체 역할에는 버전 관리된 vocabulary를 쓴다(예: `ISSUER`, `ACQUIRER`, `TARGET`, `CONTRACT_PARTY`, `DIRECT_PARENT_EXPOSURE`). `DIRECT_PARENT_EXPOSURE`는 공시의 직접적인 연결 근거와 review decision 없이는 부여할 수 없다. 이벤트 하나가 복수 보통주에 연결되면 각 종목의 근거·분류 판정을 독립 검증한다.
- 한 filing은 여러 document, 각 document는 여러 immutable revision을 갖는다. `(source, external_id)`, `(filing_id, source_document_key)`, `(document_id, content_hash)`, `(document_id, revision_no)`를 unique로 둔다.
- 한 document revision에는 여러 analysis revision이 가능하다. `(analysis_schema_version, prompt_version, input_hash)`가 같은 재실행은 idempotent 처리하되 사람의 재검토 결정은 별도 기록한다.
- event lineage의 같은 논리 summary/party/subject consumer는 stable identity `(event_id, consumer_kind, natural_key exact object)` 하나로 식별하고, 각 event revision/projection generation의 실제 payload는 별도 consumer revision row로 저장한다. identity→revision은 1:N이며 `(projection_commit_sha, consumer_identity_key)` 및 `(projection_commit_sha, consumer_key)` cardinality를 각각 검사한다. immutable date assertion은 assertion ID가 달라지면 새 identity와 relation edge를 만든다. 각 consumer revision의 claim edge는 `(projection_commit_sha, consumer_key, claim_id)` unique + same-generation composite FK다. impact run은 unique logical idempotency key, attempt는 `(run_id, attempt_no)`를 unique로 가진다. item은 `(attempt_id, projection_commit_sha)` attempt FK와 같은 generation consumer revision FK를 모두 가져 stale generation cross-link를 막는다. canonical source의 distinct identity set, distinct revision set, claim-edge set 각각과 normalized identity/revision/ref/impact/coverage rows의 양방향 cardinality 및 canonical set hash가 일치해야 승인한다. 전 generation 간 identity transition set도 old/new revision diff와 양방향 비교해 누락·중복·잘못된 identity carry-forward를 0건으로 확인한다. consumer kind resolver가 실제 source revision/claim reference를 resolve하지 못하면 import/approval을 원자 rollback한다.
- accepted Git `source_commit_sha`는 consumer index 및 impact run의 `projection_commit_sha` generation key와 같은 값이다. Run은 immutable projection commit 하나만 참조하고 attempt는 `(run_id, projection_commit_sha)` composite FK로 같은 generation을 상속하며 `(attempt_id, projection_commit_sha)`를 unique로 노출한다. Item은 attempt composite FK와 `(projection_commit_sha, consumer_key)` consumer composite FK를 모두 통과해야 한다. 따라서 projection SHA가 다른 행은 같은 event ID여도 FK join될 수 없다.
- 동일 trigger hash + projection generation + resolver version은 logical idempotency key 하나로 수렴한다. 같은 attempt의 duplicate delivery는 동일 attempt를 반환하고, terminal `FAILED/OVERFLOW` 뒤의 명시적으로 허용된 retry는 같은 logical run에 `attempt_no+1`을 추가한다. 동시에 active attempt는 하나만 허용한다. `COMPLETE` latest attempt일 때만 discovered consumer/edge count와 실제 item/edge count가 같아야 하며, item은 같은 projection generation의 consumer revision에 resolve되어야 한다. 이전 attempt/generation은 최신 trigger watermark의 suppression을 해제할 수 없다.
- Revocation epoch는 모든 공개 suppression/해제 변경보다 먼저 혹은 같은 transaction에서 증가하며 rollback과 함께 원자적으로 적용된다. publication outbox의 unique epoch+scope+snapshot key는 중복 purge를 멱등 처리한다. 전달 실패·중복·순서 역전에도 공개 GET은 live gate/현재 epoch를 재검증하므로 stale body/ETag/304를 반환하지 않는다.
- analysis/event revision을 DB 단독으로 편집할 수 없다. 신규 분석은 Git 원본에 검토 결과로 반영하며, importer는 commit SHA + event revision + content hash가 일치하는지 검사한다. DB의 `source_commit_sha`는 원본 checkout으로 검증 가능해야 한다.
- 한 event는 여러 event revision을, 한 event revision은 여러 date 및 party assertion을 갖는다. 날짜 assertion은 같은 날짜 종류가 여러 개일 수 있으므로 `event_id + date_kind`를 unique로 만들지 않는다. party/date assertion은 하나 이상의 source filing/document revision과 claim locator를 보유해야 한다.
- filing correction/withdrawal relation은 filing DAG와 typed directed edge로 별도 관리한다. relation 중복·self-edge·허용되지 않은 순환을 차단하고, 연결 근거가 불명확한 filing은 event current revision을 자동 교체하지 않는다. 동일 filing의 첨부 교체/추가는 document revision relation으로 관리한다. 이벤트 revision 반영은 새 filing relation 확인, 새 party/date claims, review approval이 한 원자적 변경으로 이어져야 한다.
- event relation은 `(from_event_id, to_event_id, relation_type)` unique로 두고 self-edge를 막는다. 유형별 순환 허용 여부는 관계 사전에서 선언하며, `SUPERSEDES/CANCELS/RESULT_OF`는 DAG 검증을 통과해야 한다.
- 현재 승인 revision pointer는 해당 event의 revision을 가리키는 composite FK/transaction 검증을 사용해 다른 event revision을 잘못 가리키지 못하게 한다.
- entity↔instrument 연결은 KIS universe의 현재 `enabled` 상태만 과거에 소급 적용하지 않는다. `valid_from/to`와 확인 snapshot으로 당시 식별 결정을 재현한다.
- KIS 현재 universe 행은 분류 변경 시 common/special 테이블 사이에서 이동하고 `raw_payload`가 upsert로 교체될 수 있으므로, 이벤트가 참조한 자격 assertion은 별도 immutable row로 고정한다. 원본 파일 보존이 허용되면 content-addressed object로 보관한다. 허용되지 않으면 분류 필드·row hash·run id·source file metadata와 확인시각을 보존해 판정 당시 값을 남긴다.
- 승인된 공개 이벤트에는 최소 하나의 `EventSubjectInstrument`가 `VERIFIED_ACTIVE_COMMON_STOCK`여야 하고, 해당 eligibility assertion은 승인 당시 공식 master에 연결되어야 한다. 이벤트 당사자/대상 구분이 불명확하면 검토 상태로 남긴다.

#### Review 및 공개 dependency fingerprint

각 승인은 특정 입력 세대에 대한 결정이며 상위 상태만으로 승계되지 않는다. `ReviewDependencyFingerprint`는 `kr-disclosure-review-dependency.v1` typed object다. 입력은 `fingerprintSchemaVersion`, 고정 enum `approvalKind`, `market=KR`, `subjectKey`, `projectionCommitSHA`, monotone `projectionGeneration`, `eventRevisionHash`, `dependencyGraphHash`, approval 대상에 대한 `transitiveClosureHash`, 그리고 `{dependencyKind, stableId, revision, contentHash, actionScope?}` dependency tuple 배열을 갖는다. 각 tuple은 승인 대상 종류별 허용 dependency kind schema와 필수/optional 규칙을 통과해야 하며 unknown kind, duplicate tuple, null/empty identity, revision/hash 불일치, 다른 tenant/market/event의 cross-link는 거부한다. 배열은 `(dependencyKind, stableId, revision, contentHash, actionScope)`의 UTF-8 unsigned bytewise lexicographic 순으로 먼저 고정한다. 정렬 후 RFC 8785 JCS로 canonicalize한 UTF-8 bytes에 `SHA256(UTF8("KR-DISCLOSURE-REVIEW-DEPENDENCY-v1") || 0x00 || JCS-UTF-8(object))`를 적용한다. JCS 문자열은 NFC/NFD 정규화를 하지 않으므로 원 code point를 유지한다. object 중복 key, 비정상 Unicode, IEEE-754 binary64 표현 불가 숫자, NaN/Infinity는 거부한다. 정수 semantics를 갖는 counter/revision은 안전 정수 또는 canonical decimal string으로 저장하며 정밀 정수값이 필요하면 decimal string만 허용한다. dependency set은 동일 승인 종류의 canonical list에서만 비교하며 category subset을 섞거나 hash 하나만으로 의미 동일성을 추정하지 않는다. 결정자·시각/서명은 content fingerprint에서 분리된 immutable decision envelope가 그 fingerprint hash를 참조한다.

Fingerprint hash는 `SHA256(UTF8("KR-DISCLOSURE-REVIEW-DEPENDENCY-v1") || 0x00 || JCS-UTF8(fingerprint))`의 lowercase hex다. Dependency tuple contentHash는 해당 dependency kind의 versioned value domain으로 projection payload를 hash한다. Tuple 정렬 key는 위 다섯 field를 NUL로 연결한 UTF-8 bytes이며 bytewise 비교한다. 동일 fingerprint 안에서 `(dependencyKind, stableId, actionScope)`는 하나만 존재하고 dependency kind는 승인 종류별 닫힌 allowlist에 있어야 한다. `dependencyGraphHash`는 승인 입력 세대의 정렬된 전체 typed edge set을, `transitiveClosureHash`는 `{approvalKind, subjectKey, dependencies}`를 각각 고정 domain `KR-DISCLOSURE-DEPENDENCY-GRAPH-v1`, `KR-DISCLOSURE-DEPENDENCY-CLOSURE-v1`으로 hash한다. projection commit hash는 실제 accepted source commit SHA를 사용한다. checker의 JSON 예시는 synthetic projection이며 세 승인(요약·분석·이벤트)의 알려진 typed dependency 투영, 정렬, graph/closure 및 fingerprint hash를 재계산한다. 각 summary segment는 해당 claim과 output authorization에 대한 별도 approval 및 fingerprint로 검사하고, 분석 fingerprint에는 claim/evidence 대상이 모두 들어간다. 이것은 전체 kind별 production schema, 실제 그래프 완전성, 운영 source commit 또는 runtime stale 전파를 증명하지 않는다. 승인 종류별 허용 kind/필수 tuple의 완전한 기계 판정 및 전 consumer graph closure는 별도 실행형 acceptance 대상이다.

Fingerprint는 `event_revision_hash`, 전체 referenced document revision/hash, 권리결정 revision/hash/action, parser+extractor version, analysis schema/model/prompt/input/output hash, claim/evidence graph hash, event/date taxonomy release, filing relation/correction disposition digest, filing-party/entity crosswalk revision, instrument-master snapshot+eligibility assertion, cap assertion/policy, source-coverage assertion/policy 및 consumer/dependency generation을 typed dependency로 담는다. `ANALYSIS` approval은 analysis/document/rights/claim subset, `EVENT` approval은 event/analysis/taxonomy/party/filing relation, `DATE` approval은 event/date/evidence/rights/taxonomy/filing relation, `SUBJECT` approval은 event/party/crosswalk/instrument/master/cap/evidence, `PUBLICATION` approval은 다섯 종류 모두와 current source-coverage/policy/consumer generations를 필수로 요구한다. 모든 kind schema에는 versioned contract가 있으며 빠진 필수 dependency는 승인 불가다. 상태 pointer가 같은 값을 가리켜도 dependency fingerprint가 하나라도 달라지면 기존 approval은 `STALE_REVIEW`이고, 아래 DAG traversal이 확정한 영향 consumer에 같은 transaction에서 suppression/epoch/outbox와 재검토 queue를 반영한다.

##### Approval-kind dependency schema v1
아래 표는 승인 kind ID의 닫힌 집합이다. `required`는 항상 포함해야 하는 dependency kind, `conditional`은 해당 입력/산출물이 실제 존재하거나 승인 경로에 쓰일 때 모두 포함해야 하는 kind, `allowed`는 이외 입력으로는 허용하지 않는 상한이다. conditional kind가 실제로 적용되는지 판단할 수 없으면 승인하지 않고 fail-closed 한다. 각 kind의 tuple은 위 공통 형식, 같은 market/event/generation 내 exact resolver, 고유 identity, 현재 revision/hash 검증을 모두 거친다.
| approvalKind | required | conditional | allowed |
|---|---|---|---|
| `SUMMARY_SEGMENT` | `ANALYSIS_REVISION`; `CLAIM`; `RIGHTS_DECISION` | — | `ANALYSIS_REVISION`; `CLAIM`; `RIGHTS_DECISION` |
| `ANALYSIS` | `ANALYSIS_INPUT`; `DOCUMENT_REVISION`; `CLAIM`; `RIGHTS_DECISION` | `PARSE_REVISION`; `EVIDENCE_SET`; `EVENT_TAXONOMY` | `ANALYSIS_INPUT`; `DOCUMENT_REVISION`; `CLAIM`; `RIGHTS_DECISION`; `PARSE_REVISION`; `EVIDENCE_SET`; `EVENT_TAXONOMY` |
| `EVENT` | `ANALYSIS_REVISION`; `EVENT_TAXONOMY`; `SOURCE_FILING` | `EVENT_DATES`; `EVENT_PARTIES`; `EVENT_SUBJECTS`; `CLAIM`; `EVIDENCE_SET`; `RIGHTS_DECISION`; `SOURCE_DISPOSITION` | `ANALYSIS_REVISION`; `EVENT_TAXONOMY`; `SOURCE_FILING`; `EVENT_DATES`; `EVENT_PARTIES`; `EVENT_SUBJECTS`; `CLAIM`; `EVIDENCE_SET`; `RIGHTS_DECISION`; `SOURCE_DISPOSITION` |
| `DATE` | `EVENT_REVISION`; `DATE_ASSERTION`; `CLAIM`; `EVIDENCE_SET`; `DOCUMENT_REVISION`; `RIGHTS_DECISION`; `EVENT_TAXONOMY`; `SOURCE_FILING` | `SOURCE_DISPOSITION` | `EVENT_REVISION`; `DATE_ASSERTION`; `CLAIM`; `EVIDENCE_SET`; `DOCUMENT_REVISION`; `RIGHTS_DECISION`; `EVENT_TAXONOMY`; `SOURCE_FILING`; `SOURCE_DISPOSITION` |
| `SUBJECT` | `EVENT_REVISION`; `EVENT_SUBJECT`; `EVENT_PARTY`; `CLAIM`; `EVIDENCE_SET`; `ENTITY_CROSSWALK`; `INSTRUMENT_MASTER`; `CAP_ASSERTION`; `DOCUMENT_REVISION`; `RIGHTS_DECISION`; `SOURCE_FILING` | `SOURCE_DISPOSITION` | `EVENT_REVISION`; `EVENT_SUBJECT`; `EVENT_PARTY`; `CLAIM`; `EVIDENCE_SET`; `ENTITY_CROSSWALK`; `INSTRUMENT_MASTER`; `CAP_ASSERTION`; `DOCUMENT_REVISION`; `RIGHTS_DECISION`; `SOURCE_FILING`; `SOURCE_DISPOSITION` |
| `PUBLICATION` | `EVENT_REVISION`; `PUBLICATION_TARGET`; `SOURCE_COVERAGE`; `FRESHNESS_POLICY`; `CONSUMER_PROJECTION`; `PUBLICATION_EPOCH`; `RIGHTS_DECISION` | `EVENT_DATES`; `EVENT_PARTIES`; `EVENT_SUBJECTS`; `DATE_ASSERTION`; `EVENT_SUBJECT`; `CLAIM`; `EVIDENCE_SET`; `ENTITY_CROSSWALK`; `INSTRUMENT_MASTER`; `CAP_ASSERTION`; `SOURCE_FILING`; `SOURCE_DISPOSITION` | `EVENT_REVISION`; `PUBLICATION_TARGET`; `SOURCE_COVERAGE`; `FRESHNESS_POLICY`; `CONSUMER_PROJECTION`; `PUBLICATION_EPOCH`; `RIGHTS_DECISION`; `EVENT_DATES`; `EVENT_PARTIES`; `EVENT_SUBJECTS`; `DATE_ASSERTION`; `EVENT_SUBJECT`; `CLAIM`; `EVIDENCE_SET`; `ENTITY_CROSSWALK`; `INSTRUMENT_MASTER`; `CAP_ASSERTION`; `SOURCE_FILING`; `SOURCE_DISPOSITION` |
#### Conditional dependency activation v1
Conditional tuple은 생략 가능한 장식값이 아니다. 아래 predicate가 참이면 해당 tuple 전부를 fingerprint에 넣고 현재 revision/hash를 resolve해야 하며, predicate 입력 자체를 확인할 수 없으면 승인·공개를 차단한다. 여러 predicate가 한 kind에 해당하면 합집합으로 포함한다.
| approvalKind | dependencyKind | activation predicate |
|---|---|---|
| `ANALYSIS` | `PARSE_REVISION` | source body/attachment를 parser 또는 extractor로 처리한 input이 하나 이상 있음 |
| `ANALYSIS` | `EVIDENCE_SET` | 분석 revision 안에 evidence edge가 하나 이상 있음 |
| `ANALYSIS` | `EVENT_TAXONOMY` | 분석이 event/date taxonomy token을 추출하거나 해석에 사용함 |
| `EVENT` | `EVENT_DATES` | target event revision에 date assertion이 하나 이상 있음 |
| `EVENT` | `EVENT_PARTIES` | target event revision에 party relation이 하나 이상 있음 |
| `EVENT` | `EVENT_SUBJECTS` | target event revision에 instrument subject가 하나 이상 있음 |
| `EVENT` | `CLAIM` | event type/status/방향 또는 서술 본문이 analysis claim에 의존함 |
| `EVENT` | `EVIDENCE_SET` | target event claim 중 evidence edge가 하나 이상 있음 |
| `EVENT` | `RIGHTS_DECISION` | event output이 action-scoped 권리판정 대상 source/derivative에 의존함 |
| `EVENT` | `SOURCE_DISPOSITION` | source filing에 correction/withdrawal marker, disposition 또는 unresolved relation 관측이 있음 |
| `DATE` | `SOURCE_DISPOSITION` | date의 source filing에 correction/withdrawal marker, disposition 또는 reconciliation 판정이 있음 |
| `SUBJECT` | `SOURCE_DISPOSITION` | subject attribution 근거 filing에 correction/withdrawal marker 또는 unresolved relation이 있음 |
| `PUBLICATION` | `EVENT_DATES` | publication target projection에 date consumer가 포함됨 |
| `PUBLICATION` | `EVENT_PARTIES` | publication target projection에 party consumer가 포함됨 |
| `PUBLICATION` | `EVENT_SUBJECTS` | publication target projection에 stock subject consumer가 포함됨 |
| `PUBLICATION` | `DATE_ASSERTION` | publication target이 DATE assertion/달력 row임 |
| `PUBLICATION` | `EVENT_SUBJECT` | publication target이 특정 종목 subject projection임 |
| `PUBLICATION` | `CLAIM` | 노출 summary 또는 표시값이 claim-derived임 |
| `PUBLICATION` | `EVIDENCE_SET` | published claim/date/subject가 evidence edge에 연결됨 |
| `PUBLICATION` | `ENTITY_CROSSWALK` | published subject attribution이 entity-to-instrument crosswalk를 사용함 |
| `PUBLICATION` | `INSTRUMENT_MASTER` | target에 COMMON_STOCK eligibility 판정이 적용됨 |
| `PUBLICATION` | `CAP_ASSERTION` | 국내 시총 eligibility gate가 target subject에 적용됨 |
| `PUBLICATION` | `SOURCE_FILING` | public target provenance에 원천 filing이 표시/참조됨 |
| `PUBLICATION` | `SOURCE_DISPOSITION` | target source scope에 filing disposition/correction 상태가 존재함 |
| `PUBLICATION` | `RIGHTS_REMEDIATION` | exact source scope/dependency closure의 remediation case set, case revision/state, evidence revision 및 closure proof가 현재 epoch와 일치하고 적용 open case가 없음 |
`PUBLICATION_TARGET`은 한 개의 `targetKind + stableId + revision + contentHash`를 가지며 이에 대응하는 최신 승인 fingerprint hash를 pin한다. 이 필드와 함께 단일 immutable `PublicationManifest`를 구성한다: `(target tuple, publication decision ID/fingerprint, projectionCommitSHA, projectionGeneration, requestAsOf, dependencyGraphHash, transitiveClosureHash, sourceScopeSetHash, sourceCoverageAssertion/policy/generation digest, exact source-rights decision set/hash, rights-remediation case set/revision/state/evidence/closure-proof digest, consumerSetHash/refSetHash/count, publicationScopeKeyHash, publicationEpoch)`. 모든 digest는 승인 fingerprint의 typed tuple 집합에서 재계산하고 manifest hash에 포함한다. 각 manifest member는 동일한 tenant/market/event/target/source commit/generation/asOf에 resolve되어야 하며 scope 누락·중복·cross-link는 거부한다. `SOURCE_COVERAGE`와 `FRESHNESS_POLICY`는 target dependency closure가 요구하는 모든 source scope를 빠짐없이 포함하고 같은 시점에 `CURRENT`여야 한다. `RIGHTS_REMEDIATION`은 exact dependency closure의 모든 applicable case를 포함해야 하며 누락 case, 바뀐 revision/epoch, 비`RECONCILED` 상태 또는 closure evidence 불일치는 manifest를 거부한다. `RECONCILED`여도 exact current source-rights decision이 action을 허용하지 않으면 publication은 차단한다. `CONSUMER_PROJECTION`은 해당 generation의 기대 consumer/ref 전체와 양방향 cardinality+set hash가 일치해야 한다. `PUBLICATION_EPOCH`은 동일 publication scope의 manifest-read 시점 epoch와 같아야 한다.

DB의 공개 GET은 단일 `REPEATABLE READ READ ONLY` transaction/connection에서 gate·manifest·projection을 읽고 고정 DB `requestAsOf`로 평가한다. 이 transaction은 read-only이므로 공개 경로에서 CAS UPDATE를 실행하지 않는다. 동시 변경은 쓰기 transaction이 권위 상태와 단조 publication epoch/watermark를 같은 commit으로 전진시키고, 읽기 snapshot은 시작 시점에 commit된 값만 보는 방식으로 선형화한다. serialization/connection 오류는 전체 GET을 새 transaction과 새 `requestAsOf`로 재시작하며 결과 일부를 재사용하지 않는다. 다른 DB adapter가 이 snapshot 보장을 제공하지 않으면 사용 불가다.

HTTP 응답 전송은 DB transaction과 원자 commit할 수 없다. 그러므로 transaction 안에서 body/ETag/304를 확정한 후 최대 응답 생성시간 이내에 전송하며 `Cache-Control: no-store`를 적용한다. 이 최대 지연 상한은 운영 전 owner가 정하고 초과 시 전송하지 않는다. 장기 열린 transaction, 자체 재조회로 최신값인 척하는 방식, 부분 페이지 fallback은 금지한다. ETag/304는 기본 금지하며, 예외적으로 활성화하려면 응답 시점의 별도 authorization/publication/freshness live gate와 최신 watermark를 검증하고 그 경합·전송 경계를 실행형 acceptance로 증명해야 한다. 그 증명이 없으면 조건부 요청에도 본문을 재전송한다. snapshot 생성 이후 commit된 revoke/epoch 변경은 이미 확정된 단일 응답을 소급 취소할 수 없으므로, 이를 허용 불가한 지연으로 보는 요구가 있으면 별도 serialization/lock 프로토콜과 상한을 설계·승인하기 전 public read를 비활성화한다.

`SOURCE_COVERAGE`/`FRESHNESS_POLICY`/`CONSUMER_PROJECTION` 중 하나라도 stale, partial, 누락 또는 다른 snapshot이면 publish decision은 무효다.

##### Publication mutation writer matrix v1
모든 publication-affecting write 경로는 아래 행 중 정확히 하나 이상의 mutation domain에 귀속되어야 한다. 각 write는 원본 사실/결정과 그 domain watermark 또는 publication epoch를 같은 transaction에서 갱신한다. 여러 domain을 건드리면 해당 watermark를 모두 올리고 동일 transaction에서 조정한다. trigger 등록/affected consumer 억제는 traversal/worker보다 먼저 commit한다. 등록되지 않은 writer, generation 역행, watermark 누락, atomic set 누락은 release blocker이며 public projection은 읽기 gate에서 거부한다.

| mutationDomain | 권위 변경과 같은 transaction에서 갱신할 값 | 누락·충돌 시 공개 동작 |
|---|---|---|
| `TARGET_EVENT_DATE_SUBJECT` | immutable event/date/subject revision 및 approval/publication pointer; 해당 target revision/hash와 target-scope publication epoch | 영향 target suppression; 새 승인 fingerprint 전 이전 target 노출 금지 |
| `RIGHTS_SOURCE_DISPOSITION` | rights decision/source disposition/filer relation revision 및 remediation case/epoch; 영향 source-scope root suppression, source watermark/epoch, outbox 및 impact enqueue | 적용 case가 모두 `RECONCILED`이고 exact action right가 current 허용 상태가 아니면 suppression 유지 |
| `COVERAGE_POLICY_ASSERTION` | policy/accepted coverage assertion pointer와 검증 digest; `coverage_generation`, source watermark/epoch | partial/stale/unknown 또는 generation parity 실패면 관련 consumers 억제 |
| `DEPENDENCY_CONSUMER_PROJECTION` | canonical dependency graph와 consumer/ref projection 및 reverse-index parity; `dependency_generation`, consumer generation/hash, scope epoch | 누락 edge/ref나 parity 실패 시 전체 관련 source scope 억제 |
| `MASTER_CAP_ELIGIBILITY` | immutable official master/cap assertion 및 eligibility decision; market/master-cap watermark와 영향 subject epoch/suppression | 해당 subject만 숨기고 identity 또는 scope가 불명확하면 더 넓은 안전 scope 억제 |
| `SUPPRESSION_IMPACT_RESOLUTION` | suppression root/state와 최신 COMPLETE impact proof에 근거한 resolution; monotone epoch/watermark와 idempotent outbox | incomplete/failed/overflow/stale worker면 suppression 유지 |

Dependency graph는 `OfficialSource/rights → Filing/DocumentRevision → ParseRevision → AnalysisRevision/ClaimEvidence → Taxonomy/PartyIdentity/InstrumentEligibility/Cap/SourceCoverage → EventRevision/DateAssertion/SubjectLink → ReviewDecision → PublicationSnapshot`의 typed directed graph다. 각 edge는 `(projection_generation, from_kind, from_id, from_hash, edge_kind, to_kind, to_id, to_hash, resolver_version)`의 immutable row이며 unique/digest 검증한다. node/edge commit 전 모든 입력으로 topological cycle detection을 실행하고 cycle, dangling endpoint, repeated incompatible identity, self edge, illegal edge-kind/path는 거부한다. 승인 이후 edge를 물리 삭제/수정하지 않고 relation invalidation/replacement는 새 typed edge와 source generation으로 append한다. 새 generation의 승인 graph가 전체 source projection과 bidirectional count/hash parity를 통과해야 기존 generation을 supersede한다.

영향 범위는 두 단계로 판정한다. 정본 graph·reverse index·generation·hash가 완전하고 cycle-free이면 변경 node의 downstream transitive closure를 산출해 직접/간접 descendant consumer만 stale/suppress한다. 동일 공통 dependency를 참조하는 다른 event의 sibling consumer는 자신의 edge 경로가 없으면 영향 대상이 아니다. graph completeness, scope resolver, integrity/parity를 하나라도 입증하지 못하면 안전한 영향 범위를 알 수 없으므로 해당 source scope 전체 suppression으로 승격한다(`FAILED/OVERFLOW/UNRESOLVED` 상태). 승인 취소와 suppression은 source state/epoch/outbox를 같은 transaction에서 먼저 고정하며, traversal 결과/queue 실패는 suppression을 rollback하거나 넓은 범위를 좁히지 못한다. 결과가 complete이면 확인된 영향 없는 consumer만 최신 full graph digest를 참조해 별도 atomic resolution으로 해제한다. 새로운 approval은 dependency set을 재고정할 뿐 과거 결정을 덮지 않는다.

| Dependency change | 자동으로 stale 처리하는 승인/산출물 | 재개 조건 |
|---|---|---|
| rights terms/revision/action 변경·철회 | 영향 document access, parse/analysis, claim, summary, date/subject/event publication | 새 action-scoped rights decision + 허용된 재취득/검증 + 재분석/review |
| document bytes/attachment/parser/extractor 변경 | descendant parse, analysis, claim, summary, date/party/subject decisions | 새 immutable document/parse revisions와 전체 dependent review |
| taxonomy release 변경 | mapped event/date claims 및 classification approval | versioned official form fixture에 대한 재분류와 reviewer approval |
| entity crosswalk/instrument master/identifier validity 변경 | filing party identity, subject attribution, instrument eligibility | immutable corrected crosswalk/master snapshot, 영향 subject별 직접 근거 검토 |
| cap source/value/freshness policy 변경 | 해당 subject eligibility 및 current public visibility | 새 시점 cap assertion과 승인 정책 재평가 |
| correction/withdrawal/disposition/source coverage 변경 | 연결된 claim/date/summary/party/subject/event 및 모든 page cursor | coverage/impact completion, 새 evidence fingerprint 및 reviewer decision |
| prompt/model/schema/normalizer 변경 | 생성된 분석 revision/summary candidate 및 그 승인을 자동 승계하지 않음 | 새 analysis revision, deterministic/adversarial fixture, reviewer decision |

#### Approval dependency failure-injection acceptance

아래 cases는 synthetic IDs/hash만 쓰며 운영 데이터를 변경하지 않는다. `publication_epoch`는 suppression과 함께 증가해야 하며, test는 content/body/304 leakage를 0건으로 확인한다. `INVALIDATED` cursor는 문서가 정한 `409 CURSOR_INVALIDATED`로 재조회되며 일부 row를 반환하지 않는다. 승인 전에 change를 발견하면 stale approval은 새 candidate로만 교체하고 과거 approval row/hash는 유지한다.

| Fixture ID | Trigger/failure injection | Required invariant |
|---|---|---|
| `DFP-01-RIGHTS-REVOKE` | pinned source rights decision을 revoke하고 같은 content hash의 새 permissive latest decision을 추가 | 구 approval은 `STALE_REVIEW`; action 차단+descendant suppression+epoch/outbox atomic; 이전 cursor/ETag invalid; 새 rights decision·재취득 가능성·재분석·review 전 공개 0 |
| `DFP-02-DOCUMENT-REPLACE` | exact document key의 byte hash/attachment revision 교체, 일부 claim locator는 더는 resolve 안 됨 | 새 document/parse revision 생성; impacted claim과 summary/date consumers 전파; missing edge면 broad scope suppression; 수정 locator 및 새 analysis review 전 과거 body fallback 0 |
| `DFP-03-TAXONOMY-RELEASE` | date-kind taxonomy release와 field mapping version 증가 | old date/event classification approval stale; 원문 assertion 보존; 재매핑/official fixture review 전 신규 taxonomy output 공개 0 |
| `DFP-04-INSTRUMENT-RECLASSIFY` | 이전 master snapshot에서 COMMON_STOCK였던 stable instrument를 다음 snapshot에서 disabled/non-common 또는 코드 재사용으로 변경 | 과거 eligibility evidence는 immutable 유지; current public subject 차단; event/다른 subject는 영향 DAG와 independent eligibility에 따라 재평가; alias collision·unresolved는 fail-closed |
| `DFP-05-CAP-EXPIRY` | cap source가 stale/통화 미확인/threshold 미만이 되도록 assertion clock/value 주입 | 해당 subject만 숨기고 다른 검증 subject는 독립; stale cap의 이전 `PUBLISHED` 상태·cursor·304 재사용 금지; fresh policy/value 이후 재평가 |
| `DFP-06-CORRECTION-NEW-SCOPE` | 정정 filing은 알려졌으나 target event와 영향 consumer relation은 unresolved 상태로 주입 | source-scope root suppression 및 epoch는 traversal 전에 commit; `FAILED/OVERFLOW` 또는 incomplete traversal이면 유지; source coverage complete만으로 공개 해제 금지 |
| `DFP-07-PROMPT-REPLAY-DIVERGENCE` | 같은 immutable input hash/version을 재실행하되 output hash/claim set이 다른 결과 주입 | 둘 다 immutable attempts; deterministic-equivalence violation은 analysis review 차단; 기존 승인 revision 자동 교체 금지, 새 claim review 및 event/date approval 전 공개 0 |
| `DFP-08-CONCURRENT-APPROVAL-EDIT` | reviewer가 fingerprint X를 승인하는 동시에 writer가 dependency Y를 바꿈 | expected revision/fingerprint CAS 중 하나만 성공; 승인 commit이 새 generation을 놓치면 rollback/`STALE_REVIEW`; last-write-wins 금지; 승인과 suppression/outbox atomic |
| `DFP-09-INDEX-OMISSION` | canonical dependency edge 하나를 reverse index에서 누락하거나 duplicate/wrong generation으로 삽입 | row set/count/digest parity 실패; projection batch 전체 suppression; index/impact completion 및 approval 금지 |
| `DFP-10-CURSOR-TIME-BOUNDARY` | 페이지 요청 직전에 max-age 만료 또는 policy valid-until 경계 통과 | 새 `requestAsOf`로 `CURRENT` 재검증; stale/unresolved 시 `409 CURSOR_INVALIDATED`, row/body/304 없음; 지난 페이지와 결과 결합 금지 |
| `DFP-11-FINGERPRINT-CANONICAL-VECTOR` | 동일 dependency tuple을 무작위 입력 순서로 넣고, 별도 fixture에서 duplicate tuple/key, NFC/NFD string, unsafe number, NaN/Infinity 주입 | tuple permutation만 동일 hash; duplicate/invalid numeric은 reject; NFC/NFD는 서로 다른 hash; 고정 canonical bytes/hash golden vector exact match |
| `DFP-12-APPROVAL-KIND-SCHEMA` | ANALYSIS/DATE/SUBJECT/PUBLICATION 별 필수 dependency 하나씩 제거하거나 다른 event identity tuple을 교차 연결 | 모든 incomplete/cross-event approval reject; PUBLICATION이 current rights/source/cap/master/consumer generation까지 포함; subset hash를 full approval로 승격 금지 |
| `DFP-13-DAG-CYCLE-AND-EDGE-REWRITE` | cycle, self-edge, illegal kind path, 과거 edge UPDATE/DELETE를 각각 시도 | commit 거부; 기존 graph/fingerprint 보존; invalid graph는 approval 금지, 새 edge revision 없이는 cursor/approval에 반영되지 않음 |
| `DFP-14-SHARED-DEPENDENCY-SIBLING-ISOLATION` | verified graph에서 event A/B가 같은 parser node에 의존하고 C는 별도 parser node 사용; A/B/C 외 다른 dependency는 동일, shared parser hash 변경 | exact downstream closure에 따라 A와 B는 stale/suppress, 무관한 C는 유지; resolver 범위가 애매해지면 source-scope suppression으로 승격, 임의의 broad/narrow 허용 금지 |
| `DFP-15-TRAVERSAL-BOUNDARY-ESCALATION` | graph complete/cycle-free, missing reverse edge, generation mismatch 세 모드에서 같은 upstream revoke trigger 실행 | complete일 때만 descendant-only; 나머지는 broad source suppression + FAILED/OVERFLOW/UNRESOLVED; impact COMPLETE 전에 어떤 경로로도 해제 금지 |
| `DFP-16-PUBLICATION-MANIFEST-SNAPSHOT-RACE` | read-only snapshot 개시 전/후에 target revision, dependency/coverage/consumer generation, epoch writer를 각각 commit하고 대상 scope 혼합 manifest, transaction 오류도 주입 | 시작 전에 commit된 상태는 전부 같은 snapshot에서 읽고 이후 commit은 현재 응답 snapshot에 섞이지 않음; 각 writer는 권위 상태와 epoch/watermark를 한 쓰기 transaction으로 원자 증가; read-only GET에는 UPDATE/CAS 없음; 오류 시 전체 GET 재시작 또는 내용 없는 실패; no-store, 기본 ETag/304 금지; 모든 member의 tenant/market/event/target/source commit/generation/asOf 동일성 검증 |

- 모든 FK는 삭제 cascade보다 soft state/보존을 기본으로 한다. 원문·revision·analysis는 일반 사용자 수정으로 hard delete하지 않는다.
- 관계형 체크 제약으로 market/status/date precision/source enum을 검증하고, 서비스 계층에서 cross-row 규칙(동일 event의 유효 기간 겹침, revision 순번 단조 증가, event relation 허용 관계, 시간 구간 역전)을 transaction 안에서 검증한다. 동일 revision 재요청은 unique idempotency key로 한 번만 반영한다.
- 승인 pointer 갱신은 `expected_revision` 낙관적 잠금 또는 DB row lock을 쓴다. 승인과 동시에 다른 편집이 들어오면 마지막 쓰기 승리로 덮지 않고 conflict로 돌려 reviewer가 합친다.
- 정정/철회·권리변경 trigger 등록, root suppression, revocation epoch 증가, cache invalidation outbox insert는 하나의 DB transaction이어야 한다. impact traversal이 별도 worker에서 실패해도 이미 commit된 suppression을 유지한다. 누락 여부를 입증할 수 없는 경우 broad suppression을 해제하는 fail-open 경로는 두지 않는다.
- 일정 변경/정정은 새 이력 insert 후 current pointer를 원자적으로 이동한다. 현재값 갱신과 이력 append 중 하나만 성공하는 상태를 허용하지 않는다.
- 정정 filing이 party/subject를 바꾸면 과거 `EventRevisionParty`/`EventSubjectInstrument`를 수정하지 않고 새로운 event revision에서 검토한다. 철회 filing이 현재 승인 revision의 유일하거나 필수 근거를 무효화하면 기존 내용을 삭제하거나 실제 사건 취소로 간주하지 않고 publication state를 `SUPPRESSED_EVIDENCE_REVIEW`로 원자 전환한다. 기존 approved revision pointer는 보존한다. 독립된 유효 source가 남아 있으면 reviewer가 영향 범위를 명시한 새 승인 revision 및 publication decision을 만든다.
- 이벤트-종목 귀속은 가능한 경우 instrument master의 stable internal ID를 FK로 저장하고, 화면/API에는 현재 종목코드와 당시 코드 alias를 함께 보존한다. 코드 변경·재사용·시장 이동 시 과거 이벤트를 다른 회사에 붙이지 않는다.
- 관계 그래프는 event relation의 허용 타입별 방향을 정의한다. `SUPERSEDES`, `CANCELS`, `RESULT_OF`는 방향성 규칙을 가지며 자기참조·중복 edge·금지 순환을 차단한다. 데이터 제거 대신 정정/대체 관계를 추가한다.
- 구조화 금액은 decimal과 currency/unit을 함께 저장한다. 원화/주식수/비율/기간의 단위 변환은 원문값과 계산값·식·버전·반올림 규칙을 분리한다. 근거 없는 계산치를 원문 사실로 표기하지 않는다.
- 원문 전문 보존 기간, 개인정보·내부자 정보의 표시 제한, 저작권/제공조건, 첨부 최대 크기, 백업/RPO·RTO는 공식 약관 및 운영 환경 확인 전 미결이다. 미결 동안 자동 대량 원문 저장은 승인할 수 없다.
- JSONB는 공급자 고유 raw payload와 유연한 분석 부가 필드에 한정하고, 조인·필터·상태 전이가 필요한 날짜/상태/키는 typed column으로 둔다.
- migration은 기존 `V163` 및 캘린더 테이블을 조용히 재정의하지 않는다. 기존 기록을 읽기 전용으로 대조한 뒤 additive migration, backfill dry-run, 검증, 전환, rollback 순서를 별도로 승인한다.
- migration 적용은 schema-history 일련성, 실제 DDL, 데이터 row, universe/candle 교차 정합성 및 복구 가능성 확인이 선행 조건이다. 현재 작업 환경의 read-only Flyway audit는 V161/V163·59 pending·V85/V89 preflight 실패와 운영 필수 객체 누락을 보고했다. V85/V89에는 candle DELETE와 universe DROP/RENAME가 있으므로 migration을 재생하거나 history를 repair/baseline하는 것으로 해결하지 않는다. 현재 상태를 기준으로 DDL 및 데이터 영향 조사, 물리 백업/snapshot 확인, 복원 리허설, 단계별 복구 설계와 명시적 승인 전에는 어떤 pending migration도 실행하지 않는다. 이 기존 drift 해소는 공시 이벤트 기능 migration과 별도의 차단 항목이며, 신규 구조 migration 또한 drift 해결 뒤 깨끗한 기준선에서 dry-run해야 한다.

#### Migration preflight acceptance (실행 허가 아님)

아래는 drift 해소 및 신규 이벤트 schema를 적용하기 전에 필요한 증거 순서다. 문서 검사·DDL 정적 분석·격리된 복원본 dry-run은 실행 승인이 아니며, 이 turn에서 migration/repair/baseline을 실행하지 않는다. 앞 단계 실패 시 이후 단계는 시작하지 않는다.

| Gate | 통과 증거 | 실패/중단 조건 |
|---|---|---|
| `DB-MIG-01-TARGET-IDENTITY` | 대상 환경, DB host/database/schema, server identity, 감사 role을 비밀값 없이 고정한 실행 manifest; 사전 read-only 접속 확인 | target 불일치/미확인, localhost guard 불일치, 환경을 로그에서 판별 불가면 종료 |
| `DB-MIG-02-HISTORY-CONSISTENCY` | 실제 `flyway_schema_history`와 repo migration의 version/script/checksum/success/order 일대일 대조; 중복·missing·failed·out-of-order 명시 | checksum 미검사, applied migration source 누락, failed row, 불연속/충돌은 history repair/baseline 없이 block |
| `DB-MIG-03-OBJECT-PREFLIGHT` | relation kind(`r` table/`v` view 등), columns, constraints, dependent views/triggers, exact precondition query를 migration별 저장 | migration이 기대하는 물리 table 대신 view 등 객체종류·column·constraint 불일치면 block; 현재 V85/V89는 여기에 실패 |
| `DB-MIG-04-DESTRUCTIVE-DATA-REVIEW` | `DELETE/TRUNCATE/DROP/RENAME/UPDATE`와 dynamic SQL을 migration 전수 분류하고 영향 row를 key/hash 단위로 대조; 데이터 소유자·DB 책임자 결정 기록 | 코드/정적 scan만으로 안전 판정 금지. 영향/복구 미확정 DML/DDL 하나라도 있으면 block |
| `DB-MIG-05-CONSISTENT-SNAPSHOT` | 승인된 일관 snapshot/backup, 생성 시각·DB identity·대상 schema/data scope·manifest hash·저장 위치·접근자 기록 | 백업 파일 존재만으로 통과 금지; snapshot 일관성 또는 restore 가능성 불명확하면 block |
| `DB-MIG-06-RESTORE-REHEARSAL` | snapshot을 격리된 DB로 복원하고 row/object counts 및 checksum sample을 대조; 복원 소요시간·오류·RPO/RTO 결과 기록 | 원 대상 DB에서 rehearsal 금지; 복원 실패/불일치는 이후 migration 검증 금지 |
| `DB-MIG-07-ISOLATED-REPLAY` | 깨끗한 격리본에서 명시적으로 승인한 migration set만 순서대로 실행, before/after schema/data inventory 및 로그 보존 | 전체 pending 일괄 실행 금지; 선행 구조 불일치 또는 비승인 destructive migration이면 중단 |
| `DB-MIG-08-POSTCONDITION` | 예상 schema object/column/constraint/index 정의와 유효성, row count·identity·universe/candle crosswalk, application schema health를 전후 대조 | 객체 이름 존재만으로 통과 금지; 정의/valid 상태/관계/데이터 parity 하나라도 다르면 block |
| `DB-MIG-09-ROLLBACK-REHEARSAL` | 실패 주입 후 승인된 복원 또는 forward-repair 절차를 격리본에서 재현하고, checkpoint/source projection atomicity 및 재실행 결과 확인 | “migration transaction으로 rollback 가능”이라는 추정만으로 승인 금지; 복구 시간/데이터 손실 미검증이면 block |
| `DB-MIG-10-EXECUTION-AUTHORIZATION` | 모든 gate 산출물 hash, residual risk, owner, explicit target, 실행 창, stop condition과 별도 운영 승인 기록 | 문서/validator 통과, backup 완료 또는 dry-run 성공만으로 실환경 실행 허가를 추론하지 않음 |

현재 `scripts/audit-flyway-history.ts`는 localhost만 허용하고 read-only이지만, 실행 출력 자체가 “구조 검사이며 checksum/full definition/index validity/data-operation 결과를 검증하지 않는다”고 고지한다. 따라서 audit green/빨간 결과는 DB 상태 단서일 뿐 `DB-MIG-02..09` 증거를 대체하지 못한다. DDL inventory 정적 heuristic도 실제 영향 row·동적 SQL·운영 DB 정의를 증명하지 않는다.

## 오류·복구·관측

- 출처별 429/5xx/timeout 및 DART maintenance `800`은 재시도 가능한 오류로 구분하고 지수 backoff·jitter와 호출 quota를 둔다. DART 본문 코드 `020`은 quota 중단, `010/011/012`는 auth/access, `100/101`은 invalid request terminal failure로 분류한다. HTTP 200만으로 성공 판정하지 않고 API status/message code를 함께 기록한다.
- `list.json total_page`와 날짜 경계가 완결되지 않으면 해당 날짜 coverage를 `PARTIAL/FAILED`로 표시한다. 빈 목록만으로 성공 판정하지 않는다.
- 원문 fetch 실패, 파싱 실패, 보통주 미검증, 분석 실패, review 보류, projection 실패는 별도 queue/status로 남긴다. 어느 한 단계의 실패도 이전 정상 revision을 삭제·무효화하지 않는다.
- 저장 전 schema/enum/날짜/근거 참조 검증, transaction 내 event revision + date projection 반영, idempotency key, optimistic revision check를 둔다.
- 운영자는 source별 마지막 성공시각·지연·coverage·정정 연결 실패·미분류 종목·원문 hash 변경·대기/재시도/실패 큐를 관찰할 수 있어야 한다. 로그에는 token, API key, webhook URL, 원문 전체를 기록하지 않는다.
- backup restore에서 원문 revision, 승인 분석, event/date 관계의 참조 무결성을 확인한다. DB projector가 재생성 가능하도록 승인 event revision을 입력으로 사용한다.

## 보안·접근·성능

- 외부 수집은 공식 host allowlist, HTTPS, redirect 제한, response size/time limit, MIME 확인, XML external entity 금지, HTML script 실행 금지, 첨부 격리를 적용한다.
- DART API key는 기존 `.env.local`/배포 secret 경로에서만 읽고 URL·로그·원문 snapshot에 저장하지 않는다.
- 공개 GET은 확정된 범위의 데이터만 반환하고 `DATABASE_URL`, 분석 내부 prompt, review actor의 개인식별 정보, raw API response를 노출하지 않는다.
- 민감한 공시 내용이 곧바로 비공개라는 뜻은 아니지만, 이용약관·저작권·개인정보 검토 전 원문 전문의 공개 API 제공은 금지한다. 공식 원문 링크와 최소한의 요약/근거 인용 범위를 결정해야 한다.
- 인덱스는 `(market, instrument_id, event_date, event_id)`, `(source, external_id)`, content hash, pending status 중심으로 설계하고 실제 쿼리계획/보유량 측정 후 확정한다.
- 공개 event list는 승인된 현재 revision projection을 먼저 필터링하고, 본문/첨부 조회와 분리해 payload 크기를 제한한다. 날짜 필터에 index-friendly half-open range를 사용하고, cursor는 정렬키 전체를 포함해 동일 날짜 누락/중복을 막는다.
- 출처 수집은 source별 동시성/요청 예산을 공유 rate limiter로 제어한다. 여러 인스턴스의 중복 cron은 DB advisory lock 또는 job lease로 막고, lease 만료 후 재실행은 idempotency로 안전해야 한다.

### P6 진행 기록 — 권리 인지형 공개 정보 구조와 snapshot 조회 계약

P6는 공시 기반 검토 결과를 사용자가 탐색할 때 무엇이 확인되었고 무엇이 미확인인지 보여주는 정보 계약을 정의한다. 공개 read surface는 내부 review workspace와 목적/권리/필드가 다르며, 내부 검토 승인·원문 접근 가능·event 승인 중 어느 하나도 다른 공개 권한을 자동 부여하지 않는다.

#### 사용자 화면 정보 구조

| 화면/영역 | 표시할 정보 | 공개 전 요구 gate | 미노출/보류 표현 |
|---|---|---|---|
| 목록 | 국내 보통주 종목명·코드, event 제목/종류, event lifecycle status, direction(승인된 경우), 기준 event/date, 날짜 정밀도와 certainty badge, source coverage freshness, updated/as-of | active `COMMON_STOCK`, KRW cap/freshness, approved event+subject, source correction coverage, public rights action, 동일 projection snapshot | event 자체는 승인됐지만 일정만 미확정이면 event를 유지하면서 날짜=`UNKNOWN/ESTIMATED`; 종목 귀속만 미검증이면 목록 subject를 생성하지 않음 |
| 상세 요약 | 사실 기반 요약 segment, 핵심 확인된 수치와 단위, 사건 해석, 반대 근거/위험, 중요 unknown/limitations | segment별 claim/evidence trace·summary-use rights·review decision·해당 event revision 일치 | 원문 미취득/첨부 누락/권리 비허용이면 본문 요약/인용을 감추고 원문 공식 링크와 상태 code만 권리 허용 범위로 제공 |
| 일정 타임라인 | date kind, 값·precision·원문 표현, certainty, status, source/last verified as-of, 이전 값과 정정 관계 | assertion 단위 publication decision, supported date claim, timezone/precision validation, correction coverage | 확정/추정/제3자 추정/결과를 서로 다른 badge로 표시; `MONTH/QUARTER/DATE_RANGE`를 일자로 강제 변환하지 않음 |
| 근거/출처 | 출처명, receipt/accession, 제출일과 source time precision, 공식 원문 link, 접근 가능한 locator/짧은 인용(허용 시), document revision 상태 | source action별 권리, quote/display approval, URL 안전성, revision/hash 및 locator resolve | 권리/접근 불명은 사유별 `UNAVAILABLE/NOT_DISPLAYABLE/RIGHTS_UNRESOLVED`; raw payload·API response·원문 전문은 공개하지 않음 |
| 검토 상태/품질 | 데이터 as-of, coverage 상태, 정정 확인 기준, 미해결 gate 이유의 안전한 사용자용 요약 | 같은 immutable publication snapshot과 응답 내 모든 item 일치 | 내부 reviewer ID, prompt/model, security decision, credential/secret, private diagnostic 및 내부 note는 공개하지 않음 |

#### 공식 원문 열기 및 접근 상태 UX 제안

공시 목록 메타데이터를 찾았다는 사실, 원문 파일 API가 성공했다는 사실, 특정 본문·첨부를 제품에 저장/표시할 권리가 있다는 사실은 별도 증거다. OpenDART 공식 [공시검색 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001)와 [공시서류 원본파일 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003)는 검색과 원문 다운로드를 별도 API로 정의하고, API 응답 코드 `013`은 조회된 데이터가 없는 경우로 설명한다. 이 API 계약은 당사 제품의 캐시·재배포·인용 권한을 포괄 승인하지 않는다.

사용자는 근거 행에서 receipt/accession과 공식 원문 링크를 확인하고, 제품에 표시 가능한 요약·인용은 별도 승인된 항목에서만 본다. 원문 연결 실패 시에도 내부 저장 원문을 자동 대체 표시하지 않는다. 같은 화면은 상태와 사용자가 취할 수 있는 다음 행동을 함께 제공하며, 다음 상태는 서로 합치지 않는다.

| 사용자 상태 | 의미/화면 표현 | 다음 행동 | 금지 해석 |
|---|---|---|---|
| `SOURCE_LINK_AVAILABLE` | 권리 검증을 통과한 공식 외부 링크 사용 가능 | 새 탭에서 공식 원문 열기; receipt/accession 복사 | 외부 페이지 열림을 제품 원문 보존·권리의 증거로 취급 |
| `SOURCE_METADATA_ONLY` | filing identity와 목록 메타데이터만 확인, 원문 내용은 제품에서 확인되지 않음 | 공식 원문으로 이동; 필요 시 사용자가 원문 존재 여부 확인 | 요약/원문 전문이 있다고 표현 |
| `SOURCE_FETCH_FAILED` | 조회가 시도됐으나 네트워크·제공자 오류 등으로 취득 실패 | 오류 종류가 일시적일 때 재시도; 마지막 시도 시각 표시 | 문서가 없거나 제출되지 않았다고 표현 |
| `SOURCE_NO_DATA_IN_RESPONSE` | 제공자 응답이 명시적 빈 결과(예: OpenDART `013`) | receipt·요청 범위 확인; 검색 가능한 공식 목록으로 이동 | 정정/첨부 포함 전 범위에서 문서 부재를 확정 |
| `SOURCE_RIGHTS_UNRESOLVED` | 권리 결정이 해당 action/field/purpose를 판정하지 않음 | 메타데이터와 허용된 공식 링크만 표시; 내부 재검토 큐로 전달 | 권리 불명을 일괄 차단 사유나 허용 사유로 추정 |
| `SOURCE_NOT_DISPLAYABLE` | fetch와 별개로 제품 저장·요약·인용·표시 action이 불허/미승인 | 공식 원문 링크만 권리 허용 시 제공; 미허용이면 상태만 제시 | 원문 전문·첨부·파생 요약을 우회 노출 |
| `SOURCE_REVISION_CHANGED` | 연결된 receipt가 정정·철회·첨부 변경 등 새 revision을 가짐 | 이전 revision의 비교/변경 상태를 보여주고 최신 승인 revision 열기 | 이전 화면·요약·읽음 기록을 새 revision에 승계 |

상태 결정은 source identity와 문서 revision을 먼저 고정하고, fetch outcome, field/action rights, projection publication eligibility 순서로 각각 계산한다. UI는 API의 상태 코드를 그대로 렌더링하며, `013`, HTTP 오류, scope 밖, 권리 차단을 모두 “원문 없음”으로 축약하지 않는다. 공식 링크는 scheme/host allowlist와 receipt 연결성을 검증하고 외부 이동임을 분명히 한다. 링크가 권리 gate를 통과하지 못하면 누르기 불가능한 URL 대신 안전한 사유 code를 보여준다. 로그인 여부나 watchlist 일치로 출처 권리가 달라지지 않는다.

합성 UX acceptance 분모는 `P6-SOURCE-01` metadata-only, `P6-SOURCE-02` fetch transport failure, `P6-SOURCE-03` explicit empty response, `P6-SOURCE-04` rights unresolved, `P6-SOURCE-05` fetch allowed/display denied, `P6-SOURCE-06` correction revision changed, `P6-SOURCE-07` attachment unavailable under otherwise readable filing, `P6-SOURCE-08` unsafe/nonofficial redirect를 포함한다. 각 경우 UI와 API가 source identity, document revision, `fetchStatus`, `displayDisposition`, safe next action에서 일치해야 한다. 합성 예시는 실제 endpoint 권리 결정이나 운영 동작을 입증하지 않으며, `KR-DART-RIGHTS-01`과 `KR-DOCUMENT-UX-01`의 owner 승인 전 공개 API/UI 구현은 차단된다.

목록 필터는 event/date type, ticker, date range, status, source availability 등 공개 가능한 typed field만 대상으로 한다. 기본 정렬은 schema/version으로 고정되고 cursor는 전체 stable sort tuple을 사용해 동률을 빠뜨리거나 중복 반환하지 않는다. free-text search/index는 rights-filter 전 원문 전체를 노출하거나 미승인 filing을 우회 조회하지 않는다. UI의 숨김/비활성 버튼은 API authorization/privacy gate를 대체하지 않는다.

#### 근거별 출처 표시와 attribution projection 제안

기존 DART 공시 피드는 각 항목을 출처별로 읽고 출처 유형을 UI에서 구분하지만, 아래 projection은 공개 이벤트의 여러 claim/evidence를 합성할 때 사용할 별도 제안이다. 이벤트 전체에 하나의 “DART/KIND 출처” badge를 붙여 개별 사실의 원천·revision·표시 조건을 합치지 않는다. 하나의 이벤트 요약이 여러 원천에 의존하면 claim 단위 source lineage와 각 원천의 현재 display/attribution decision을 모두 resolve한다.

논리 `SourceAttributionProjection`은 `claimRevisionId + evidenceRevisionId + sourceProduct + sourceClass + endpointOrSurface + sourceLocator + rightsDecisionId/revision + attributionPolicyEvidenceId/revision + displaySurface + publicationEpoch`에 결박한다. 사용자용 credit text 및 공식 링크는 current decision이 해당 surface/action을 허용할 때만 만든다. attribution obligation을 지켰다는 사실은 source fetch, 보존, 파생, 인용 또는 재배포 권한을 대신하지 않는다. `DATA_PRODUCT_LICENSE`와 `TERMS/API_GUIDE`가 다른 scope를 가리키면 badge나 license를 서로 상속하지 않는다.

전송 attempt에서는 평행 배열 대신 **한 객체가 한 번 렌더링되는 credit block 하나**를 소유하는 creditComponents[]를 쓴다. 각 원소는 연속된 0부터의 deliveryOrder, sourceAttributionProjectionId, claimRevisionId, evidenceRevisionId, rightsDecisionRevision, attributionPolicyRevision, locale 선택 후 channel escape 전 canonical credit 문자열의 UTF-8 bytes에 대한 creditTextHash를 한 객체로 묶는다. 순서는 실제 논리 payload에서 credit이 보이는 순서와 같아야 하며 gap·중복 순번·잘못된 hash·필수 원천 누락은 attempt를 무효로 한다. 문자열 hash 입력은 locale 선택 후 채널 escaping/markup 적용 전의 canonical credit text이며 transport encoding 전에 고정한다. `creditTextHash=SHA256(UTF8("KR-DISCLOSURE-CREDIT-TEXT-v1") || 0x00 || UTF8(exactCanonicalCreditText))`로 계산한다. trim/casefold/NFC/NFD 등 어떤 정규화도 하지 않고 원 code point를 보존한다. 링크 URL은 credit text hash에서 제외하고 typed safe destination field로 분리하되, 최종 논리 payload hash에 포함한다. attempt는 locale와 rendererRevision을 고정하며 둘 중 하나라도 바뀌면 재렌더·권리/credit 재검토 및 새 payload hash를 요구한다. CREDIT_NOT_REQUIRED도 빈 배열로 암묵 표현하지 않고 상태, 사유 및 근거 revision을 보존한다. 채널 serializer는 `contractStatus=PROPOSED_NOT_CURRENT_DISCLOSURE_ATTRIBUTION_RUNTIME`으로 표시한다. 처리 순서는 rights/surface decision → locale 선택 → channel escape 전 canonical credit hash → typed safe link 확정 → channel rendering → 최종 논리 DTO payload hash → transport encoding이다. Discord markdown escape와 Push/JSON encoding은 최종 화면/DTO 및 rendererRevision에 반영하지만 canonical credit text 원문과 creditTextHash 입력을 덮어쓰지 않는다. 줄바꿈은 승인된 형식으로만 보존하고 control-character injection은 거부하거나 새 renderer output으로 sanitize하며 이전 payload를 재사용하지 않는다. URL 교체는 creditTextHash를 유지할 수 있어도 payloadHash를 바꾸므로 새 attempt다. SAP-17–SAP-20은 이 경계를 검증하며 현재 운영 중인 RSS Discord formatter는 공시 attribution serializer의 구현 증거가 아니다. Reference renderer는 `referenceRendererVectors` 4개가 정의한 합성 oracle이며 제품 renderer 재사용을 뜻하지 않는다. Discord의 markdown 및 masked-link 문법은 [공식 formatting reference](https://discord.com/developers/docs/reference#message-formatting)를 기준으로 하되, 입력 escape 알고리즘의 호환성과 실제 표시 결과는 provider acceptance에서 따로 확인한다. checker는 각 vector의 기대 출력/거부 상태와 `KR-DISCLOSURE-CHANNEL-PAYLOAD-v1` domain-separated JCS payload hash를 대조한다. RRV-01 markdown metacharacter, RRV-02 control character reject, RRV-03 Push newline preservation, RRV-04 API safe URL typed field를 포함한다. 이 검사는 실제 provider semantics나 접근성 표시를 증명하지 않는다.

공식 원문 링크는 임의의 입력 URL을 그대로 저장/노출하지 않고 source adapter별 allowlist로 resolve한다. OpenDART 공시검색 가이드는 `rcept_no`를 14자리 receipt로 정의하고 PC viewer 예시를 `https://dart.fss.or.kr/dsaf001/main.do?rcpNo={접수번호}`로 제공한다([공식 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001), 응답 `rcept_no`/viewer 예시). 현재 프로젝트 `buildViewerLink()`도 이 viewer base에 receipt를 결합한다. 제안 gate는 HTTPS·정확한 `dart.fss.or.kr` hostname·`/dsaf001/main.do` path·단일 비인코딩 14자리 `rcpNo`만 받아 canonical URL을 재구성하며 userinfo, suffix/lookalike host, non-default port, extra/duplicate/redirect query, fragment, unexpected path 및 malformed receipt는 reject한다. URL validation은 네트워크 fetch/redirect-follow를 하지 않는다. KIND의 원문 viewer template은 현재 확인한 공식 근거/구현에서 특정되지 않아 `UNRESOLVED_SUPPRESS_LINK`로 남기며 DART allowlist를 확대 적용하지 않는다. [`officialSourceLinkVectors` 12개](../fixtures/disclosure/source-attribution-projection.v0.json)는 위 allow/reject 및 KIND 미결 분기를 정적으로 검사한다.

creditManifestHash는 SHA256(UTF8("KR-DISCLOSURE-CREDIT-MANIFEST-v1" + NUL + RFC 8785 JCS(creditComponents)))로 고정한다. 배열 순서는 의미가 있으므로 재정렬은 hash를 바꾼다. payloadHash는 실제 전송 직전 논리 application DTO를 RFC 8785 canonical JSON으로 직렬화한 값에 별도 domain separator를 적용해 계산한다. Push 암호화나 HTTP transport가 추가하는 nondeterministic wire bytes는 논리 payload hash에 섞지 않는다. provider raw body/secret을 ledger에 복제하지 않는다. 본 계약은 [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785.html) 정렬·숫자·Unicode 규칙을 따르며 fixture의 creditManifestGoldenVector와 creditTextHashGoldenVectors는 정적 checker가 실제 SHA-256을 재계산한다. SAP-14–SAP-20은 canonical credit의 표시 직전 UTF-8 bytes, 링크와 문구 hash 분리, NFC/NFD 구별, locale/renderer revision 변경, channel escaping, 줄바꿈·control injection 및 safe link 변경 경계를 고정한다.

| Surface | 표시 계약 | 억제 조건 |
|---|---|---|
| 이벤트 목록 카드 | public claim을 제공한 source credit의 축약 표기 및 source count; credit과 정확한 source locator 연결 | 복합 이벤트에서 한 source의 credit을 대표 source처럼 표시하거나 승인 전 title/summary를 표시하지 않음 |
| 이벤트 상세 claim/evidence | 각 claim 바로 옆에 source product, document/structured source class, receipt/accession locator, revision/as-of, 허용된 attribution text/link를 표시 | attribution을 낼 권리/정확한 문구가 미확정이면 해당 claim/evidence/파생 summary 노출 보류 |
| Push/Discord notification | 해당 전송 surface에 승인된 최소 credit과 안전한 공식 링크만 포함; payload byte limit은 설계변수 | 긴 source body/문구를 줄여 복제하지 않고, 상세 링크가 credit requirement를 대체한다고 가정하지 않음 |
| API/JSON export | source별 attribution object와 policy/evidence revision을 field-level로 직렬화하는 versioned DTO | attribution이 요구되는 derivative를 제거한 채 data-only payload를 내보내지 않음; response schema 또는 rights gate가 미결이면 공개 차단 |

`CREDIT_REQUIRED`, `CREDIT_NOT_REQUIRED`, `CREDIT_POLICY_UNRESOLVED`, `CREDIT_WITHHELD`는 표시-credit 상태이며 `ALLOW/DENY/UNRESOLVED` rights decision status가 아니다. credit 미정/미표시인 경우 데이터를 그대로 표시하고 출처를 footer로 몰아넣는 graceful fallback을 허용하지 않는다. public surface가 허용된 중립 상태를 안내할 수 있는지 또한 별도 UI action decision을 확인한다. 수용 분모는 [`source-attribution-projection.v0.json`](../fixtures/disclosure/source-attribution-projection.v0.json)의 `SAP-01`–`SAP-20`이다. 합성 fixture의 기대 결과는 실제 license 해석·owner 승인·runtime serializer를 증명하지 않는다.

전송 경로는 content assembly 시점의 credit과 실제 attempt payload를 연결한다. 각 recipient/channel attempt는 `payloadHash`, `creditManifestHash`, `creditComponents[]`, renderer revision, notification revision 및 publication epoch를 기록하는 proposal이다. 이 field set은 [`source-attribution-projection.v0.json`](../fixtures/disclosure/source-attribution-projection.v0.json)과 [`correction-delivery-reconciliation.v0.json`](../fixtures/disclosure/correction-delivery-reconciliation.v0.json)의 공통 delivery attempt 분모로 동일하게 유지한다. 두 fixture 간 source credit reference/hash가 일치하지 않으면 `BLOCKED_ATTRIBUTION_LINEAGE`로 attempt lineage와 correction coverage를 불완전 처리하고 완료 claim을 내지 않는다. 이는 기존 correction-delivery reconciliation의 recipient×channel 분모와 attempt receipt를 재사용해 연결하며 aggregate `delivered`를 credit 노출 완료로 보지 않는다. Provider가 payload를 수락한 것과 기기에서 렌더링·사용자가 읽은 것은 별개의 관측 상태다. Push의 긴 필수 credit은 잘라내지 않는다. surface에 허용된 짧은 credit 또는 credit이 보존되는 상세 페이지 링크를 별도 권리 결정이 허용하지 않으면 해당 claim/alert를 suppress한다. 허용되는 글자수·payload 크기 threshold는 provider 문서와 owner 결정 전 미정이다.

`SAP-09`–`SAP-13`은 필수 credit이 payload byte/문자 제한에서 잘리려 할 때의 suppress, provider accepted와 device delivery unknown 분리, attempt의 credit hash 재현, rights/policy revision 갱신 후 stale retry 차단, correction 영향 recipient×channel 분모에서 credit 변경까지 추적하는 수용 경계다. 이 ledger는 현재 DART Push/Discord runtime에 이미 있다고 가정하지 않으며 [`correction-delivery-reconciliation.v0.json`](../fixtures/disclosure/correction-delivery-reconciliation.v0.json)의 attempt/delivery scope 계약과 함께 후속 구현 acceptance로 남긴다.

#### API snapshot 및 페이지 일관성 수용 계약

| 계약 요소 | 요구사항 | 실패 동작 |
|---|---|---|
| 공개 범위 | 새 KR 전용 GET은 무인증 read-only; 사용자/관리자·내부 진단·쓰기·작업 실행·GET 부수효과 경로는 제외. 기존 `/api/public/market-impact-events`와 OpenAPI `market-impact-events.v1`은 별도 legacy compatibility 계약 | 신규 KR projection 또는 response schema를 legacy route에 암묵적으로 혼합하지 않음 |
| `asOf` 의미 | 응답 생성시각이 아니라 DB transaction이 읽은 단일 `requestAsOf` 및 immutable projection/publication snapshot identity를 명시 | SQL 결과 이후 `new Date()`로 붙인 값은 DB snapshot 시각/coverage 최신성이라고 표시 금지 |
| snapshot binding | 모든 row, total/coverage metadata, sort/filter definition, rights/master/cap/source freshness/publication epoch가 같은 immutable snapshot manifest로 resolve | 세대 mismatch, scope 누락, 만료/철회 시 응답 전체를 거부하고 일부 row만 반환 금지 |
| pagination cursor | endpoint, normalized filters, sort version, snapshot ID, last keyset tuple, issued/expiry, key version/signature를 bind. token은 opaque/signed; client가 tenant/market/source scope를 바꿔 재사용할 수 없음 | tamper, wrong endpoint/filter, expiry, revoked key/snapshot은 empty-page/partial response 대신 명시된 cursor error와 재시작 안내 |
| 재요청/캐시 | 공개된 승인 snapshot을 revision pinning; 기본 `Cache-Control: no-store`. 운영자가 caching 허용을 결정하더라도 rights revocation·publication epoch을 넘는 stale response가 노출되지 않는 invalidation을 입증 | revocation race, cache purge 미확인, `If-None-Match`가 이전 snapshot을 되살리는 경우 304 금지 |
| 철회/수정 경쟁 | 요청은 시작점 하나의 DB read-only REPEATABLE READ snapshot에서 gate와 rows를 계산. concurrent revocation epoch change는 보안/DB 모델에 승인된 불변 manifest 재검증으로 검출 | gate 재검증 실패 시 row·ETag·304 모두 금지; 열린 transaction을 페이지 간 유지하지 않음 |
| 부분 데이터 | source별 coverage/availability를 나타내더라도 승인된 row만 포함하며 incomplete scope와 withheld count/reason이 서로 맞음 | partial source state를 전체 완료로 위장하거나, “0건”과 “미조회/실패/권리 차단”을 같은 응답으로 취급 금지 |
| 오류 body | 공개 오류는 안정된 machine code와 안전한 retry/action 정보를 반환 | SQL, URL query key, 원문 payload, 내부 role/person, stack/host 정보 노출 금지 |

`asOf`를 표시할 때는 `snapshotCapturedAt`, source별 `lastSuccessfulReconciliationAsOf`, document `fetchedAt`, projection committedAt을 의미별로 구분한다. 하나의 timestamp로 source 최신성·DB commit·응답 생성시각을 동시에 표현하지 않는다. 전체 total count가 권리상 안전하지 않거나 미승인 범위를 드러낼 수 있으면 허용된 count 범위만 반환하거나 생략한다. 외부 read GET 신규 추가 시 route inventory/OpenAPI, 무인증 감사와 공개 데이터 범위 검증을 같은 변경으로 수행해야 한다.

#### 신규 공개 issuer dossier read contract 제안 — `DPR-01`–`DPR-25`

[합성 공개 read contract fixture](../fixtures/disclosure/disclosure-dossier-public-read.v0.json)의 `DPR-01`–`DPR-25`는 신규 KR dossier GET을 위한 미승인 API 제안이다. 현재 checkout의 `GET /api/public/market-impact-events` 및 `market-impact-events.v1`은 이 제안으로 변경되지 않으며, 신규 계약은 별도 versioned route 또는 owner가 승인한 명시적 version negotiation으로만 검토한다. 새 공개 read는 무인증·read-only·no-store이며 미승인 권리, 불명확한 issuer/instrument applicability, 보통주 master/cap freshness 또는 coverage가 확인되지 않으면 subject/body를 억제한다.

instrument query에는 직접 적용이 검증된 사실만 기본 포함한다. issuer 공통 사실은 명시적 `includeIssuerContext=true`일 때만 `CONTEXT_ONLY`로 포함하고 직접 건수·context 건수·억제/미해결 분모를 분리한다. 한 subject가 부분 적격일 때 결과를 반환할지 전체 응답을 억제할지는 미승인 owner 결정으로 남기며, 허용되는 경우에도 응답은 `PARTIAL`과 subject별 이유를 제공한다. 같은 응답의 facts, coverage, rights/master/cap gate와 pagination은 단일 immutable snapshot을 가리키고, cursor는 route/query/snapshot/epoch에 묶인다.

fixture vectors는 query conflict/unknown parameter, scope leak·tranche cross-attribution, partial denominator, snapshot drift/revocation, cursor replay/expiry, v1 불변성 및 safe errors를 포함한다. endpoint path, 일부 subject 응답 정책, 공개 count와 cache/ETag 세부값은 승인 전 미정이다. 구현 전 route inventory/OpenAPI 갱신, 외부 consumer 조사, 무인증 GET 감사와 기존 KR/US 응답 호환 fixture가 필요하다.

##### 공개 dossier claim의 출처표시와 권리 경계 — DPR-17–DPR-20

OpenDART 약관은 API 호출 허용량 제한 및 변경 가능성, OpenDART API 서비스·관련 프로그램의 저작권, 공시정보 정확성·완전성 비보장을 명시한다. 공시검색 가이드는 list metadata와 접수번호·정정/철회 표지 및 viewer URL 예시를 설명한다. data.go.kr 상품 `3075133`은 기존 확인 기록상 KOGL 제1유형을 표시하며, KOGL 공식 안내는 출처표시 조건하의 상업적·변경 이용을 설명한다. 그러나 catalog 상품 표시를 직접 OpenDART 응답 전체, `document.xml` ZIP/내부 첨부, KIND, 파생 claim, 저장 또는 사용자 API·Push·Discord 채널까지 포괄하는 허가로 확장하지 않는다. 공개 페이지에 적힌 조건과 endpoint 호출 계약은 owner/legal action-scoped 결정의 대체물이 아니다.

각 dossier item/claim은 source product/class/endpoint/field, rights decision revision, attribution policy revision, `creditState`, canonical `creditText`, safe official `safeSourceUrl`을 각각 연결한다. `CREDIT_POLICY_UNRESOLVED` 또는 채널별 표시 권리가 미확정이면 해당 body-derived claim/derivative/payload를 억제하고 data-only fallback을 금지한다. 필수 credit은 claim revision 및 최종 표면 렌더와 함께 hash/manifest에 결박한다. credit를 붙였다는 사실은 fetch, raw/derivative retention, quote, API redistribution 권리를 부여하지 않는다. 서로 다른 원천이 섞인 응답은 source별 권리와 credit를 독립 평가한다. 부분 항목 공개는 owner가 부분 결과 및 withheld denominator의 노출 범위를 승인한 경우에만 허용하며, 그렇지 않으면 response를 억제한다.

공식 근거 관측값, 미결 질문, source action 및 credit acceptance 분모는 [fixture의 `sourceRightsAttributionBoundary`](../fixtures/disclosure/disclosure-dossier-public-read.v0.json)와 기존 [rights surface inventory](../fixtures/disclosure/disclosure-rights-surface-inventory.v0.json), [source attribution projection](../fixtures/disclosure/source-attribution-projection.v0.json)에 분리했다. OpenDART 약관 제16조/제23조와 검색 가이드 response field는 [공식 약관](https://opendart.fss.or.kr/intro/terms.do), [공식 검색 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001), KOGL 제1유형 의미는 [공식 KOGL 안내](https://www.kogl.or.kr/info/faqList.do?cPage=1&dataGroup=2&mstIdx=KOGL_005)에서 관측했다. data.go.kr 상품 페이지는 이번 직접 browse가 되지 않아 상품 ID/license 표시 세부는 repository의 기존 2026-11-04 관측으로만 유지한다. DPR-17~20은 허가를 승인하지 않고 scope 승계 금지·credit revision binding·혼합 원천 분모를 검사한다.

##### 검색 결과 부재와 투자 사실 부재의 분리 — DPR-21–DPR-25

공개 dossier는 부정 근거를 단순히 “검색 결과 없음”으로 요약하지 않는다. `NOT_FOUND_IN_SCOPE`는 정확한 provider/product/endpoint, 정규화 query, issuer/instrument scope, 기간·시각 정밀도, 완전한 pagination, page metadata 대 응답 수 조정, 오류 없는 실행 및 correction/withdrawal reconciliation이 확인된 한정 검색에서만 허용한다. 이 상태는 그 snapshot의 해당 검색범위에 일치하는 row가 없다는 뜻이며, 검색기간 밖이나 다른 원천의 공시 부재·사건 미발생·위험 부재를 뜻하지 않는다.

`NOT_REPORTED`는 식별된 원문/공식 응답을 실제로 열람했으나 그 문서의 특정 주장·항목이 기재되지 않았음을 나타내는 document-scoped 상태다. 이는 회사/종목 전체의 이벤트 부재가 아니다. `UNVERIFIABLE`은 page gap, total count/page mismatch, API/HTTP/parse/quota 오류, mapping 불명, correction watermark stale, 권리상 검색·저장·노출 제한, 비-snapshot pagination의 수렴 미입증을 포괄한다. `SUPPRESSED_RIGHTS` 및 `NOT_SEARCHED`는 결과가 0건인 것처럼 변환하면 안 된다. `CONFLICT_UNRESOLVED`는 서로 다른 근거가 충돌해 부재 판단도 유보된 상태다.

저장소의 [`fetchOpenDartToday()`](../../lib/dart-opendart-client.ts)는 KST 단일 접수일 `list.json`을 page_count 100으로 순회하고 receipt number 기준 중복/누락을 집계한다. 정상 응답에서 요청한 `page_no`와 `page_count`를 대조하고, 페이지 순회 중 `total_count`/`total_page` 불변 및 `ceil(total_count/100)`와 페이지 수·raw/unique/missing/duplicate row 집계의 일치를 확인한다. API `status=013`은 이 단일 일자 helper에서 예상 page 수 0, 행 수 0으로 매핑하며 실제 요청 응답은 한 번 관측한다. 다만 provider snapshot token/stable cursor가 없고 cross-page 변경을 배제하는 snapshot binding도 없다. 같은 total/page count를 유지한 채 행 집합이 바뀌는 경우는 이 합계 검증만으로 검출되지 않는다. `list`의 JSON runtime shape를 별도 schema로 검증하지 않고, HTTP 200의 provider error는 공통 예외 경로에 전달되어 quota `020` 등을 durable coverage error enum으로 분리하지 않는다. 따라서 `RECONCILED`는 구현된 분모 일치 검사 결과이지 provider의 immutable snapshot, source-wide completeness, issuer dossier coverage 또는 기간 전체 부재의 증명이 아니다. correction overlap/watermark와 저장 분모도 별도 acceptance 대상이며, 충족하지 못하면 `UNVERIFIABLE`로 남긴다. rights가 허용하지 않는 withheld count는 노출하지 않으며 공개 partial 응답 정책도 owner 결정으로 남긴다.

`DPR-21`–`DPR-25`는 OpenDART `013`의 범위 제한, 페이지/건수 불일치, window 밖 부재 추론 금지, 문서 내 `NOT_REPORTED`, 오래된 정정 coverage를 각각 고정한다. 기존 [`event-schedule-notification.v0.json`](../fixtures/disclosure/event-schedule-notification.v0.json)의 ESN-15/18 및 [`convertible-outcome-evidence.v0.json`](../fixtures/disclosure/convertible-outcome-evidence.v0.json)의 FUEV-15/16 상태 의미와 결합하며 이를 대체하지 않는다.

#### 기존 public route와 새 KR 계약의 경계

현재 구현 기준 비교표는 공개 read fixture의 `legacyImplementationBaseline`이다. route는 `date`, `from`, `to`, `market`, `ticker`, `limit`만 읽고 unknown parameter는 무시한다. 날짜는 YYYY-MM-DD 실존일자를 검증하고 `date`는 `from`/`to`와 함께 쓸 수 없다. 시장은 KR/US, ticker는 trim 후 대문자 변환한다. limit 기본값은 100, 안전한 정수는 1..500으로 clamp하며 그 밖의 값은 100으로 대체한다. 응답 query에는 정규화 결과, `asOf`에는 앱 응답 시각, rows에는 `market_impact_events` 현재 projection을 담는다. 정렬은 event_date 내림차순, published_at 내림차순 NULLS LAST, event_id 오름차순이고 cursor는 없다. 오류는 query 검증 400 `INVALID_QUERY`, DB 실패 503 `MARKET_IMPACT_EVENTS_UNAVAILABLE`이다. OpenAPI에는 이 route가 무인증이며 DTO field가 기술되어 있고 route inventory는 path/method/access/source만 기록한다.

그러므로 route/OpenAPI/fixture를 함께 읽으면 v1과 제안 간 차이는 다음과 같다: mixed KR/US 대 KR-only candidate, ticker/date filters 대 opaque issuer/instrument IDs와 context opt-in, 잘못된 limit 보정·unknown parameter 무시 대 strict query rejection, latest-row list/asOf 대 rights/master/cap/coverage gate가 붙은 revisioned snapshot, limit-only 대 cursor pagination, issuer/instrument scope 검증 부재 대 per-subject applicability와 suppression denominator. 기존 route에는 v2 publication rights/freshness/COMMON_STOCK gate, stable snapshot cursor, as-of DB snapshot 또는 subject-level suppression 검증이 없다. 따라서 현재 v1 응답의 `asOf`나 `no-store`만으로 P6 일관성 수용을 증명하지 않는다. 이 비교는 현재 checkout의 코드 사실이며 deployed service와 external clients의 실제 동작 증명은 아니다.

새 KR route/API는 `KR-API-UI-CONSISTENCY-01`, `KR-CURSOR-SECURITY-01`, 공개 무인증 API audit 및 `KR-DOCUMENT-UX-01` 승인이 있을 때만 구현 제안으로 승격한다. 기존 route를 수정·폐기·보호 방식 변경하려면 별도 compatibility impact review, external consumer inventory 및 owner decision이 선행되어야 한다.

#### P6 UX/API 수용 fixture 분모

필수 adversarial fixture는 (a) filter/page 경계에서 동률 sort key, (b) projection 새 revision 도중 다중 페이지 조회, (c) event 승인 유지 중 단일 date/subject rights revocation, (d) cursor endpoint/filter replay/tamper/expiry/key rotation, (e) public cache purge 지연과 concurrent epoch change, (f) source partial/failed vs legitimate zero result, (g) instrument cap/master stale와 다중 subject 일부 suppression, (h) estimate/quarter/unknown date 표시, (i) 원문 unavailable·quote 미승인, (j) ETag/304와 revoked/stale snapshot, (k) safe error sanitization, (l) legacy v1 route response US/KR compatibility를 포함한다. fixture당 expected snapshot ID, rows/withheld disposition, status/error code, cache headers, retry outcome, source commit/hash와 independent reviewer를 고정한다.

cursor TTL, materialized snapshot retention/quota, key lifecycle/rotation, cache policy, disclosed counts, UI copy/명칭, accessibility threshold, public summary/quote 범위는 owner 승인 전 미정이다. 이 기준은 사용자 구현이나 공개 API 승인으로 간주되지 않는다. P6는 `BLOCKED_BY_DECISION: KR-CURSOR-SECURITY-01, KR-API-UI-CONSISTENCY-01, KR-DOCUMENT-UX-01, KR-EVENT-ATTRIBUTION-01, KR-MASTER-SNAPSHOT-01` 상태를 유지한다.

#### P6 legacy v1 공존·소비자 전환 계획

현재 `/api/public/market-impact-events`는 외부 무인증 GET이므로, KR canonical publication 계약 도입은 응답을 조용히 바꾸는 방식으로 진행하지 않는다. v1 응답은 기존 `market-impact-events.v1` schema와 KR/US 혼합 조회 의미를 별도 compatibility contract로 취급한다. v2 후보는 별도 versioned route 또는 owner가 승인한 명시적 version negotiation에서만 제공하며, v1 경로에 v2 필드를 부분 혼합하지 않는다.

| 단계 | 허용 작업 | 진입/완료 증거 | 금지·중단 조건 |
|---|---|---|---|
| `V1_BASELINE` | 현재 route/OpenAPI/query/error/cache/header/US·KR 결과 fixture를 read-only 고정 | 코드 revision, OpenAPI hash, route inventory, 무인증 감사, KR/US 분리된 응답 fixture 및 row denominator | deployed route/외부 consumer가 미확인인 상태에서 호환 완료 선언 금지 |
| `CONSUMER_INVENTORY` | 저장소·배포 설정·관측 로그에서 consumer owner/버전/호출 빈도/market scope를 조사 | 내부 caller별 증거와 external consumer `UNKNOWN` 명시, owner 확인 및 관측 한계 | 검색 결과가 없음을 consumer 없음으로 해석하거나 인증/차단을 추가하지 않음 |
| `V2_PARALLEL_CANARY` | 승인된 KR scope에서 별도 candidate 경로를 내부/명시적 canary로 비교 | P6 snapshot/rights gate, P7 acceptance report, API docs/inventory 및 공개 GET audit, consumer-specific diff | v1 데이터/의미 변경, US diff, rights suppression 누락, cursor/caching 실패 시 중단 |
| `V1_DEPRECATION_NOTICE` | 담당 owner가 공지 기간과 지원 범위를 승인한 뒤 deprecation metadata/문서 공지 | 수신 consumer 확인, 사용량 관측 기간, 이전 경로 지원계획, 회귀/rollback 승인 | owner·기간·관측 증거 부재 시 시작 금지; 경로 폐기 자동 예약 금지 |
| `V1_RETIREMENT_REVIEW` | 기존 호출이 없어졌다는 증거를 바탕으로 별도 폐기 결정 요청 | 관측된 연속 무호출 기간, 배포/외부 consumer signoff, US/KR parity, 복구 가능성 및 API 정책 검토 | 단순 설정상 트래픽 0 또는 문서상 deprecation만으로 삭제 금지 |

v1/v2 동시 제공 기간, 사용량 계측 방식·보존, deprecation 기간, v1 응답의 향후 데이터 갱신 경계, route retirement criteria는 아직 미정이다. `KR-API-UI-CONSISTENCY-01`, `KR-LEGACY-CUTOVER-01`, `KR-OPERATIONAL-SECURITY-01` owner가 외부 consumer 관측 한계와 정책을 승인해야 한다. 해당 결정 전에는 v1 유지·v2 병렬 검토를 기본 계획으로 두고 기존 공개 경로의 인증, 필드, 정렬, cache semantics를 변경하지 않는다.
### P5 진행 기록 — legacy cutover 증거 패키지와 단계별 중단 조건

이 절은 기존 cutover 상태 기계를 대체하지 않고 각 단계가 받아야 하는 증거와 거부 조건을 고정한다. 저장소 현재 상태에는 승인된 mainline v1 input이 없고 DB drift/readiness도 미해결이므로 이 계획은 실운영 적용이나 신규 권위 원본 확정을 뜻하지 않는다.

| 상태 | 진입 전 입력/고정 artifact | 검증 산출물 | 즉시 중단 조건 및 복구 경계 |
|---|---|---|---|
| `PRECHECK` | 승인된 기준 commit SHA와 정확한 Git blob hash/path; KR/US 입력 개수·event ID 및 source tuple 분모; 읽기 전용 DB table/market별 row 수·정렬 canonical digest; route/cron/importer/deployment/DB external-consumer inventory revision; schema history/drift snapshot | 검사 가능한 입력인지, 모든 집합의 소유자·해시·분모가 고정됐는지에 대한 preflight report | source input이 untracked/ambiguous, DB 권한·catalog 불완전, market row denominator 불일치, destructive migration precondition 또는 external consumer 미분류면 `PRECHECK_BLOCKED`. 원본/DB 변경 없이 증거 누락을 해소한다. |
| `FROZEN_SNAPSHOT` | precheck 통과한 동일 revision의 파일 blob, DB backup/snapshot identity, UTC/KST capture timestamp, dump/catalog hashes, secret-free execution manifest | 복원 가능한 immutable source+DB snapshot과 snapshot completeness record | snapshot export 중 변경, export 오류, schema/history/data snapshot hash 재검증 불일치 시 단계 전이 금지. 원본을 고치지 않고 새 snapshot을 새 attempt로 만든다. |
| `MAPPED` | frozen snapshot hash; legacy event ID 전체 KR denominator; code/ticker 당시 identity 및 source evidence | 각 KR old ID가 정확히 하나의 `MAPPED/QUARANTINED/DUPLICATE/REJECTED` 상태인 manifest; target ID 및 reason; KR/US 합계와 ID cardinality; duplicate canonical relation | KR `UNMAPPED>0`, 한 old ID의 다중 terminal disposition, 설명 없는 merge/drop, unresolved rights/identity/date를 MAPPED 처리, US 행 수·digest 변동이면 중단. quarantine/reject는 분모에 그대로 남긴다. |
| `DRY_RUN_PASSED` | reviewer 승인 target schema/version, mapping manifest hash, importer/resolver build SHA, frozen source hash | 계획된 insert/update/quarantine/tombstone 없음 수량, 예상 target row denominator/digest, FK/evidence/date/subject parity report; source·target 실제 diff 0 또는 승인된 명시 mapping만 차이 존재 | validator가 운영 write를 수행, source denominator와 계획 row 불일치, FK/hash/date/subject mismatch, 기존 importer를 writer로 사용, US row/API diff 발생 시 취소. 계획을 격리 snapshot에서 고쳐 새로운 run으로 검증한다. |
| `SHADOW_RECONCILED` | dry-run 검증된 동일 mapping/source/schema version; 읽기 전용 신규 projection; 고정 gold set/분모 | 기간/유형/정정/subject/date별 legacy↔candidate diff, 누락·중복·격리 사유, US source/API before/after parity, discrepancy reviewer | 승인 전에는 신규 projection이 user/API에 노출되면 안 된다. 승인된 모든 차이 기준 또는 US parity를 충족하지 못하면 shadow를 닫고 새 immutable run으로 되돌아간다. 운영 legacy DB/source write는 금지한다. |
| `CANARY_APPROVED` | P0~P5 decision approvals, DB drift resolution, restore test, rollback rehearsal, consumer-owner signoff, shadow report | 대상 KR scope·consumer·revision·기간이 특정된 서명 approval record 및 rollback pointer | owner/decision 만료·scope 차이·restore 실패·US consumer 영향·누락 caller가 확인되면 승인 취소/전이 거부. 전체 cutover로 확대하지 않는다. |
| `KR_READ_SWITCHED` | 승인된 canary artifact hash; 단일 KR writer/read path를 보장하는 fencing 증거; API inventory/schema·cache 변경 승인 및 deployment manifest | route/read switch health, source checkpoint/projection SHA parity, no stale/dual writer evidence, US baseline parity | KR old/new 동시 writer, generation/checkpoint mismatch, 누락/중복 subject, rights/correction freshness gate 누락, US 응답 변화 시 KR 신규 read를 명시 pointer로 이전 snapshot에 rollback하고 audit 보존. |
| `ROLLBACK_WINDOW_CLOSED` | owner가 승인한 관찰기간 종료 기준·모든 consumer acceptance·최신 revocation replay·복구 증적 | rollback 가능 상태, residual risk, legacy 보존/폐기 여부에 대한 별도 결정 | 조건 불충족·열린 incident·unreconciled revision이면 window 유지. legacy 원본/테이블 삭제는 이 상태만으로 허가되지 않으며 별도 폐기 승인 필요. |

#### 공통 재조정 invariant

- source artifact KR 행 수는 `MAPPED + QUARANTINED + DUPLICATE + REJECTED` 행의 distinct `oldEventId` 분모와 일치해야 한다. `MAPPED`만 target projection에 대응하며, 나머지는 사유와 재검토 조건을 가진 상태로 남긴다. zero `UNMAPPED`는 누락 없는 성공이 아니라 모든 old ID가 설명된 상태다.
- KR mapping 계산은 `markets.KR` 행만을 대상으로 한다. source JSON `markets.US`의 ordered event IDs/content hash와 DB US event IDs/content hash, public US response fixture는 cutover 전/후 exact parity를 별도 계산하며 mapping/import transaction이 이를 쓰지 않았음을 증명해야 한다. 같은 혼합 importer를 호출해 KR과 US를 한 transaction에서 upsert하는 방식은 KR 전용 dry-run/전환 근거로 인정하지 않는다.
- duplicate 판정에는 동일 원천 event의 독립 증거와 canonical target, survivor 선정 사유를 적는다. 제목·ticker·날짜 유사성만으로 합치지 않는다. reject/quarantine/duplicate를 input에서 삭제해 분모를 맞추지 않는다.
- 매 상태 전이는 이전 ledger digest와 기대 predecessor state를 CAS 비교하고 append-only record를 쓴다. 같은 attempt 재실행은 동일 input/version에서 같은 output hash일 때만 idempotent no-op다. 다른 output이면 drift로 기록하고 승인 전이를 차단한다.
- projection diff는 stable IDs만 비교하지 않고 source filing/document evidence hash, market/ticker/subject, date kind/value/precision/certainty, event status, rights/eligibility state 및 consumer response를 포함한다. 알려진 손실·변환은 field별 disposition 및 owner approval 없이는 silent normalization이 될 수 없다.

#### 중단·복구 운영 절차

1. 단계 전이 전 현재 state hash, source/target denominator, US parity digest 및 승인 유효성을 기록한다. incomplete manifest나 `UNKNOWN_EXTERNAL` consumer가 있으면 `PRECHECK_BLOCKED`다.
2. 오류가 생기면 해당 attempt를 실패/차단으로 append하고 기존 승인 state나 source를 덮지 않는다. 새 attempt는 같은 frozen hash를 사용하거나 snapshot 자체가 달라지면 처음부터 새 snapshot lineage를 시작한다.
3. 격리 restore rehearsal에서 snapshot을 복원하고 schema/data inventory·row counts·projection/API fixture를 비교한다. DB transaction rollback만으로 migration 전체 복구가 된다고 간주하지 않는다.
4. read switch 이후 rollback은 명시된 직전 승인 projection/source pointer로만 되돌리고, 최신 rights revocation·withdrawal/correction suppression·audit epoch를 보존한다. 이전 데이터로 rollback해 suppression을 되살리거나 신규 event를 legacy importer로 재전송하지 않는다.
5. rollback 뒤 legacy와 candidate 양쪽의 새 수정 write를 잠그고 단일 owner가 drift/consumer 상태를 분류한다. re-entry는 새 canary approval과 parity/restore 증거가 필요하다.

각 단계의 수치 threshold, 허용 discrepancy, canary 범위/기간, backup RPO/RTO, 복구 window는 `KR-LEGACY-CUTOVER-01`, `KR-IMPORTER-OPS-01`, `KR-DB-DRIFT-01`, `KR-RETENTION-01`, `KR-OPERATIONAL-SECURITY-01` 책임자가 증거 기반으로 승인하기 전 미정이다. 현재 이들 결정은 `OPEN`이므로 단계 표는 계획/검토 계약일 뿐 실행 승인이나 완료 판정이 아니다.
## 단계와 전환 게이트

1. **설계 검토**: 현재 `filings`, `market_impact_events`, instrument master/universe의 실제 스키마·인덱스·참조 무결성을 조사해 데이터 매핑표를 확정한다.
2. **계약 확정**: 이벤트 유형 분류표, date kind/precision/timezone, 상태 전이표, submitter/filing-party/entity↔instrument crosswalk, 원문 보존·공개 정책, v1 JSON에서 revisioned Git source로의 호환 정책을 결정 기록에 승인한다.
3. **검증기 우선**: 신규 쓰기 없이 JSON/DB 현재 데이터의 누락·중복·깨진 링크·공시 정정·보통주 미검증 비율을 read-only로 보고한다.
4. **수직 슬라이스 구현**: migration·repository·수동 검토 도구·읽기 API·화면 중 한 흐름씩 구현하고 테스트/문서/OpenAPI를 동시에 연결한다. 자동 이벤트 추론은 제외한 채 근거 연결과 일정 버전부터 검증한다.
5. **Shadow 수집**: 기존 화면/데이터를 바꾸지 않고 수집 coverage, 분류, 정정 연결을 병행 비교한다. diff를 정량 기록하고 누락·오귀속 0건 조건을 정한다.
6. **제한 운영**: 승인된 종목·이벤트 유형만 노출하고 rollback 가능한 feature flag/DB view 전환을 수행한다.
7. **기존 JSON/캘린더 전환**: legacy ID 매핑, 중복·정정·과거 오류 reconciliation과 사용자 확인 이후에만 전환한다. 기존 `market-impact-events.json` 및 `investment_calendar_events` 삭제는 별도 승인과 복구 검증이 필요하다.

각 단계는 직전 단계의 검증 증거, rollback 방법, 남은 위험을 기록하지 않으면 다음으로 넘어가지 않는다. 현재 상태는 설계 근거 및 계약 보강 중이며 구현·운영 승인 전이다.

### Shadow/운영 acceptance 제안

- 요청 날짜/window의 한 pass 모든 페이지, metadata, row 합계가 맞으면 `PAGE_ENUMERATION_COMPLETE`를 둔다. 두 번 연속 receipt+metadata hash set이 같으면 보조 수준 `OBSERVED_STABLE`을 추가할 수 있지만 이 API는 snapshot을 제공하지 않으므로 어떤 pass도 `SNAPSHOT_PROVEN` 또는 절대 무누락으로 승격하지 않는다. run 중 pagination total/boundary 변경, 누락·중복 ID, 합계 불일치는 `INCONSISTENT/PARTIAL`이다.
- 모든 row는 성공/중복/오류/미지원 terminal ingestion 상태를 가져야 한다. 본문 미취득도 source locator·오류 상태·재시도 가능 여부를 남긴다. “에러 없음”만으로 100% coverage를 선언하지 않는다.
- Shadow gate는 시장·공시 유형·정정 여부로 층화한 수동 표본 대조에서 목록 누락/중복 0건, 명시적 정정관계 오연결 0건, 비보통주 공개 노출 0건, 근거 없는 event/date claim 0건, 승인 이벤트 subject attribution 오류 0건을 요구한다. 표본 크기와 기준 기간은 호출량/쿼터 실측 후 정하고 표본 한계를 함께 기록한다.
- 지표는 ingest lag p50/p95, 문서 취득/미취득/정책상 미보존, parse/analysis/review queue age, common-stock attribution, correction link, content hash 변경, quota/error rate를 포함한다. 분모·기간·source as-of를 보이며 분모 0은 `N/A`다. quota 및 권리 승인이 미확정이면 목표치를 `NOT_SET`으로 표시하고 green 처리하지 않는다. 운영 baseline과 owner 승인 목표치가 있어야 한다.

### P7 진행 기록 — shadow acceptance와 운영 go/no-go 증거

P7은 P0~P6의 데이터·권리·귀속·공개 계약이 준비된 뒤에만 실행하는 독립 acceptance gate다. 기존 운영 결과를 정답으로 간주하지 않으며, acceptance 통과는 권리 승인·배포 승인·투자 판단 정확성을 대신하지 않는다. 현재 `KR-SHADOW-SLO-01`, `KR-END-TO-END-ACCEPTANCE-01`이 `OPEN`이므로 아래 계약은 제안 상태이고 운영 전환은 차단된다.

#### 평가 단위와 고정 분모

- 한 acceptance run은 `runId`, source/window, market, filing type, correction/withdrawal class, party/subject class, date precision, eligibility state 및 rights/action scope를 고정한 manifest를 먼저 만든다. 각 층의 모집단 수·포함/제외 수·제외 사유·미관측 수를 공개하고 제외 행을 분모에서 조용히 제거하지 않는다.
- 요청 범위의 source/page/receipt 목록과 수집 시각, provider 응답 metadata, 원문/document revision 식별자 및 가능한 경우 hash를 동결한다. snapshot을 제공하지 않는 source의 수집은 `PAGE_ENUMERATION_COMPLETE` 등 관찰 상태만 보고하며 snapshot 증명으로 표현하지 않는다.
- 실행 전 고정된 기준선은 이전 candidate 또는 legacy 관측치일 수 있지만, legacy 결과를 truth label로 사용하지 않는다. 모든 차이를 `MISSING`, `ADDED`, `REASSIGNED`, `DUPLICATED`, `CORRECTION_LINK_CHANGED`, `DATE_CHANGED`, `RIGHTS_BLOCKED`, `UNRESOLVED` 등 상호 설명 가능한 유형으로 분류하고 원본 row key를 연결한다.
- gold set은 source artifact locator/hash와 기준 시점, 기대 receipt/event/subject/date 관계, 정답 상태(`POSITIVE`, `NEGATIVE`, `UNRESOLVED`), 근거 locator, review history, fixture/schema 버전을 보존한다. 권리상 원문을 보존할 수 없으면 허용된 metadata/hash와 보존 불가 사유만 기록하고, 이를 원문 검증 fixture로 가장하지 않는다.

#### 독립 검토와 지표 판정

- candidate 결과를 만든 담당자와 acceptance 승인 reviewer를 분리한다. reviewer는 가능한 범위에서 candidate 분류/요약을 가린 채 공식 source 근거를 먼저 판정하고, 두 명 검토의 불일치는 지정 adjudicator가 근거와 함께 해결한다. 작성자 자기승인, 미지정 reviewer, 미해결 불일치는 통과로 계산하지 않는다.
- 모든 지표는 numerator, denominator, `N/A` 조건, 시간 구간, source/as-of, 층화 결과, 기준선 대비 변화, 누락·미확정 항목을 함께 기록한다. 0건 오류는 관측 표본에서 0건이라는 뜻으로만 사용하고 모집단 무오류 보증으로 일반화하지 않는다.
- 기존 shadow 제안의 목록 누락/중복, 명시적 정정 오연결, 비보통주 공개 노출, 근거 없는 event/date claim, 승인 subject 귀속 오류 0건은 critical candidate gate로 유지한다. 단, 적용 분모·fixture·운영 판단 책임자가 승인 evidence를 확정하기 전에는 자동 green 판정하지 않는다. 그 밖의 허용률, 표본 크기, 기간, 지연 SLO, 통계적 불확실성 기준은 결정 책임자의 승인 전 `NOT_SET`이다.
- 모집단·gold set·source snapshot 중 필수 항목이 없거나 분모를 재구성할 수 없으면 run 결과는 `INCOMPLETE`다. 결과 상태는 `NOT_RUN`, `INCOMPLETE`, `PASS`, `FAIL`, `EXPIRED`로, 운영 결정은 별도 `NO_GO`, `HOLD`, `GO_CANARY`, `GO_LIMITED`로 기록한다. 상태 명칭만으로 자동 전이하지 않으며 서명된 decision revision과 선행 decision ID가 있어야 한다.

#### Acceptance report와 결정 조건

하나의 append-only report manifest에 최소한 다음 필드를 남긴다.

| 영역 | 필수 증거 |
|---|---|
| 실행 식별 | `runId`, 실행자, 시작/종료 UTC, 코드/build/config hash, 보고서 schema 버전 |
| 입력 snapshot | source/window/pass, 요청·응답 metadata hash, receipt/document revision 집합, snapshot 한계와 권리 decision revision |
| 모집단과 정답 | manifest hash, 층별 대상·포함·제외·미관측 수, gold set 버전/hash, 정답 label 및 근거 locator |
| 비교 결과 | 기준선 ID/hash, 유형별 diff 및 row locator, 분모가 명시된 지표·분포·미해결 불일치 |
| 사람 검토 | reviewer/adjudicator 식별자와 역할, 독립성 확인, 판정·이견·해결 근거·시각 |
| 운영 결정 | 결과 상태, 결정 상태, 승인된 임계값/decision ID revision, 제한 범위·만료·재검토 조건, 서명 참조 |
| 복구 준비 | 직전 승인 pointer/checkpoint, restore rehearsal 결과와 inventory 비교, rights revocation·correction suppression 보존 확인, 중단/rollback 실행 담당과 관측 경보 |

- `GO_CANARY`는 선행 권리·스키마·보안·운영 결정이 유효하게 `CLOSED`이고 필수 critical gate가 PASS이며, 범위·기간·중단 조건·rollback 담당이 서명된 경우에만 제안할 수 있다. `GO_LIMITED`는 canary 결과 및 추가 승인 evidence가 별도로 있어야 한다.
- 필수 증거 누락, 미해결 critical discrepancy, 만료된 권리/결정, 분모 변경, gold set drift, restore 검증 실패, rollback suppression 보존 실패는 `HOLD` 또는 `NO_GO` 사유로 기록하고 결과를 PASS로 덮지 않는다. 변경된 snapshot이나 fixture는 새 run lineage를 시작한다.
- rollback rehearsal는 운영 write를 발생시키지 않는 격리 환경에서 승인 pointer/checkpoint를 복원하고 row inventory·projection/API fixture를 대조한다. 복구 후 최신 철회·정정 suppression 및 audit epoch가 유지되는지 확인한다. 실제 canary 이후 rollback window 종료는 별도 결정과 관측 증거를 요구한다.

#### 정정·철회 후 외부 노출 reconciliation 수용 계약

정정/철회 전파는 내부 publication 차단과 이미 전달된 채널의 사용자 보정이라는 두 결과를 따로 수용한다. `suppression committed`, `outbox accepted`, `provider accepted`, `device delivered`, `user opened`는 서로 다른 증거 상태다. 어느 한 단계 성공을 downstream 완료로 승격하지 않는다. Web Push push-service 응답은 기기의 표시나 사용자의 열람 증거가 아니며, 이미 표시된 알림을 앱이 원격으로 지웠다고 추정하지 않는다. Discord Incoming Webhook은 `wait=true`로 생성 메시지 객체를 받을 수 있고 같은 webhook token의 message endpoint로 편집/삭제 요청을 할 수 있다. 따라서 Discord는 capability 자체가 없는 채널로 일괄 분류하지 않는다. 그러나 message ID 저장, edit/delete 실행 및 성공 receipt가 없거나 토큰/권한/대상 message를 resolve하지 못하면 해당 전송은 `DELIVERED_UNRETRACTABLE` 또는 `DELIVERY_UNKNOWN` 잔여로 둔다. capability 존재는 실제 메시지 회수/사용자 미열람을 보증하지 않는다.

각 correction/disposition root에 대한 reconciliation bundle은 동일 publication epoch에 묶이고 다음 정보를 갖는다.

| 영역 | 필수 항목 |
|---|---|
| 영향 범위 | root filing/document revision, disposition 종류와 근거, 최초·현재 event/analysis/date/subject/publication revision, source scope 및 epoch, 확정된 영향 graph/consumer digest, 차단·유지 row의 수와 ID hash |
| 기존 외부 노출 | recipient/channel, notification ID 및 payload hash/version, event/dependency fingerprint, 발송 시각, provider request/receipt ID, Discord webhook message ID/thread ID(가능할 때), 결과 상태(`NOT_SENT`, `PROVIDER_ACCEPTED`, `DEVICE_DELIVERY_UNOBSERVED`, `DELIVERY_UNKNOWN`, `DELIVERED_UNRETRACTABLE`, `EDIT_CONFIRMED`, `DELETE_CONFIRMED`), provider가 돌려준 실제 edit/delete 확인 증거 |
| 보정 행동 | 취소·정정·방향 약화·근거 철회 등 typed correction reason, 채널 capability snapshot(대상 message 조회/편집/삭제와 권한), 시도 전후 message ID/hash, 새 safe payload revision/hash, 원 알림과의 `CORRECTS`/`SUPERSEDES` link, 대상별 idempotency key 및 시도 결과 |
| 사용자 복구와 잔여 위험 | in-app 상세의 새 snapshot/epoch 확인, 이전 deep link 차단 결과, 채널별 사용자 재안내 결과, 미회수·전달 불명 대상과 이유, 운영자 지정·재시도/종료 결정 및 승인 참조 |
| 무결성·완료 근거 | input/output manifest hash, source/rights/subject/dependency fingerprint, 코드/config/provider capability snapshot, 시각대별 타임스탬프, 독립 reviewer/adjudicator, 실패·미관측 분모 |

처리 순서는 (1) disposition trigger와 publication suppression/epoch/outbox 원자 commit, (2) latest complete impact traversal 전까지 root source에 의존하는 public detail/API와 대기 알림 전송 차단, (3) 이미 enqueue/claim 된 개인 알림을 전송 직전 epoch·구독/opt-out·계정 상태로 fencing, (4) 영향 외부 delivery ledger의 전체 recipient×channel 분모 확정, (5) 원 알림과 같은 의미 상태를 되살리지 않는 최소 correction payload 생성, (6) Discord처럼 생성 message ID 및 token 권한이 있는 경우 기존 message edit/delete를 개별 시도하고, 미지원/권한 불명/외부 관리 대상에서는 correction/thread 후속 전송 후보를 별도 검토, (7) provider·앱 내 read surface별 확인 가능한 결과 수집, (8) 미회수/불명 잔여를 명시한 reconciliation report와 독립 검토다. Discord message ID는 `wait=true`의 response body에서 받아 권리 허용 범위와 보존 정책에 따라 secret 없이 저장할 수 있어야 edit/delete 후보를 resolve할 수 있다. webhook token/URL은 절대 receipt나 운영 로그에 저장하지 않는다. 영향 ledger가 완전하다는 증거가 없으면 대상 없는 것으로 보지 않고 `DELIVERY_SCOPE_UNRESOLVED`로 둔다.

새 correction message는 원 event ID만으로 dedupe하지 않는다. key에는 recipient/channel, correction epoch, source disposition revision, affected notification ID/payload hash, correction action/reason이 포함된다. 반복 reconcile은 같은 message를 중복 발송하지 않으며, 새 정정·후속 공식 근거는 새 epoch와 새 correction candidate가 된다. 발송 직전 fencing 이후 provider call의 결과를 기록하지 못하면 `DELIVERY_UNKNOWN`이며, 같은 correction을 무조건 재전송하지 않는다. provider receipt를 재조정하거나 operator가 duplicate 위험과 채널 capability를 승인하기 전까지 hold한다.

보정 payload는 대상 수신자가 이미 볼 수 있는 범위 안에서 “이전 알림이 어떤 revision/주장을 포함했는지, 무엇이 정정/철회됐는지, 현재 확인 상태와 새 근거 시점, 자세한 최신 내용의 안전한 링크”를 짧게 제공한다. 권리상 새 원문/인용/상대방 공개가 허용되지 않으면 해당 내용을 포함하지 않고 안전한 일반 문구 또는 무발송으로 둔다. 정정 filing의 존재만으로 사건 취소·악재·호재를 단정하지 않는다. 기존 해석이 `POSITIVE`에서 `MIXED/UNCERTAIN`으로 바뀐 경우도 사실 정정과 구별한 typed change로 알리고, 사실이 유지되는 범위를 보존한다. 계정 삭제/opt-out 이후 개인 채널 재전송은 금지하되, 법적·운영 감사상 최소 delivery proof가 보존 가능한지는 별도 retention decision을 따른다.

Reconciliation terminal state는 `COMPLETE_ALL_RETRACTED`, `COMPLETE_CORRECTED_WITH_UNRETRACTABLE`, `PARTIAL_DELIVERY_UNKNOWN`, `BLOCKED_RIGHTS_OR_IDENTITY`, `BLOCKED_IMPACT_SCOPE`, `FAILED_RETRYABLE`, `FAILED_OPERATOR_ACTION` 후보로 둔다. “완료”는 보정 시도 종료만이 아니라 (a) 영향 recipient/channel 분모를 재현, (b) stale 상세·cursor·queued delivery가 최신 gate에서 차단, (c) 보정 조치 또는 불가 사유가 각 delivery row에 존재, (d) provider certainty와 잔여 노출이 명시, (e) 독립 검토 및 책임자 처분이 기록된 경우에만 허용한다. `COMPLETE_CORRECTED_WITH_UNRETRACTABLE`도 초기 메시지 제거가 아니며 잔여 위험 포함 완료다. 계량 기준·통지 deadline은 권리·운영 owner 승인 전 임의로 설정하지 않는다.

Acceptance fixture는 (a) 아직 enqueue 전 suppression, (b) queued/claimed delivery와 epoch 변경 경합, (c) Web Push push-service 성공 뒤 기기 표시/열람을 알 수 없음, (d) push 알림 클릭과 앱 deep link 최신 epoch 검사, (e) Discord `wait=true` response에서 message ID 정상 수신·안전 저장·편집/삭제 성공, (f) Discord 응답 유실·message ID 미저장·token 권한 철회·message 미존재·이미 삭제된 경우, (g) 외부에서 관리/삭제된 webhook message, (h) capability가 있어도 provider receipt/최종 상태 확인 불가, (i) 같은 정정 재실행·worker crash·중복 receipt, (j) 취소와 source withdrawal만 있는 경우의 의미 구별, (k) rights가 correction payload도 제한, (l) 일부 대상 계정 삭제/opt-out, (m) multi-subject 중 한 subject만 영향, (n) impact traversal overflow, (o) correction 뒤 다시 정정되는 chain, (p) ledger 분모 누락/범위 hash 불일치를 포함한다. 기대 결과는 내부 stale read 0, 승인되지 않은 payload 0, ledger 미완전 시 완료 0, `DELIVERY_UNKNOWN`의 무단 자동 재전송 0이며, push service accepted를 기기 표시·열람으로 승격하지 않고 Discord edit/delete도 성공 response 범위만 확인된 것으로 판정한다.

현재 제품의 DART Push/Discord 발송을 위 canonical correction reconciliation 경로로 취급할 수 있다는 구현 증거는 없다. 코드 정적 확인 결과 Discord DART sender는 `wait=true`를 요청하지만 response text를 message ID로 parsing/persist하지 않으며, `dart_automation_events`는 receipt별 전체 delivery ledger를 증명하지 않는다. Web Push sender는 현재 subscription을 순회해 전송하지만 per-subscription 결과를 반환하지 않고 일반 전송 오류를 일부 무시하므로 recipient×channel 분모와 상태를 재구성할 증거가 없다. 따라서 Discord API capability는 설계상 사용할 수 있지만 현재 자동 회수에 사용된다고 말하지 않는다. 이 계약은 신규 전송 구현 승인도 현재 발송물 회수 보증도 아니다. `KR-OPERATIONAL-SECURITY-01`, `KR-DART-RIGHTS-01`, `KR-END-TO-END-ACCEPTANCE-01`의 결정과 provider별 capability/receipt fixture가 열려 있는 동안 운영 승격은 차단한다.

##### 기존 DART 전송과 correction ledger 간격 및 fixture 제안

현재 저장소 구현 확인 범위는 `lib/dart-automation.ts`, `lib/dart-automation-store.ts`, `lib/discord-dart.ts`, `lib/push.ts`다. DART 자동화는 receipt별 `processing/delivered/failed` aggregate를 기록하고 Push와 Discord를 `Promise.allSettled`로 호출한 뒤 Discord 성공이면 aggregate를 delivered로 저장한다. Push는 허용 subscription을 순회하고 endpoint 값을 반환하지 않는 invocation-local count summary를 만든다. 그 summary는 provider-accepted, expired endpoint, explicit failure, outcome unknown, expired-subscription cleanup failure 및 preference skip을 구분하며 `deviceDelivery=UNOBSERVED`를 명시한다. DART 실행 result에는 Discord 채널 outcome과 Push count summary가 포함되지만 recipient-level row는 없고 DB에 저장되지 않는다. Discord는 `wait=true` 요청의 HTTP success/failure/unknown을 반환하나 response body의 message ID를 해석하거나 영속화하지 않는다. 이 구조로는 채널별·수신자별 correction 분모, provider timeout 뒤 중복 방지, 정확한 기존 Discord message edit/delete target을 복원할 수 없다. receipt aggregate `delivered`는 Discord provider acceptance만 반영하며 모든 대상의 실제 전달·표시·열람 증거가 아니다. Retry는 두 channel을 receipt 단위로 재실행하므로 부분 성공에서는 duplicate push 위험이 남아 있다.

구조적으로 보강할 때 delivery ledger는 기존 filing aggregate와 별개로 immutable `filing × recipient × channel × attempt × notification revision × publication epoch` row를 소유한다. 매 전송 전에 현재 구독·opt-out·권리·publication epoch를 fence하고, 호출 전 attempt를 남긴다. provider response receipt/message ID는 credential 없이 허용된 secret-safe field로 저장하며 원 payload 대신 payload hash/version을 보관한다. Push provider acceptance는 `DEVICE_DELIVERY_UNOBSERVED`; timeout/연결 끊김으로 응답을 못 받았지만 provider 수락 가능성이 있으면 `ATTEMPTED_UNKNOWN`으로 기록해 자동 duplicate retry를 금지한다. 실패 전·후의 delivery history는 덮어쓰지 않는다. correction은 prior notification ID별 영향 graph를 대조해 해당 recipient×channel만 처리하고, 각 행은 재현 가능한 manifest 분모를 가져야 한다. 이 기획은 신규 schema/API나 sender 변경을 승인하지 않는다.

외부 delivery attempt만을 잔여 노출 분모로 쓰면 recipient별 in-app card와 공용 read surface가 빠질 수 있다. 이를 위해 reconciliation을 두 partition으로 나눈다. `RECIPIENT_TARGET` exposure는 immutable `exposureId`와 hashed target identity로 inbox card, push subscription endpoint, Discord message 같은 수신 대상별 상태를 나타내고, `filing × recipient × channel × attempt × notification revision × epoch` receipt와 연결한다. 계정/endpoint/message 원 식별자와 payload는 manifest에 복제하지 않는다. expected/observed exposure identity set digest 및 surface별 count가 일치하지 않으면 delivery scope는 미완료다.

`SHARED_SURFACE`는 공개 detail/API page, cursor, shared cache처럼 수신자를 열거할 수 없는 표면을 별도 control assertion으로 증명한다. 매 cursor/token을 recipient delivery로 세거나 사용자 열람 0건으로 추정하지 않는다. surface별 `scopeHash`, 이전/현재 publication epoch, current gate 결과와 통제 evidence를 기록하고 assertion set digest를 대조한다. cursor는 매 요청 current epoch를 재검증해 이전 page body를 거부하고, shared cache는 해당 scope의 `no-store`/purge 통제 결과를 기록한다. 표면 제어 증거가 누락되거나 오래됐으면 노출 여부 `UNKNOWN`, reconciliation completion 차단이다. targeted exposure count와 shared control count는 합산하지 않는다.

Affected in-app card는 내용/claim만 `STALE_SUPPRESSED`로 계산하고 카드의 `saved`, prior `readAt`, 개인 note revision은 그대로 보존한다. old card snapshot은 immutable이며 새 current card revision과 재검토 요구를 링크한다. 이전 deep link는 최신 epoch gate를 통과한 current detail로만 해석하고 stale body fallback을 주지 않는다. correction push의 provider acceptance는 correction 사용자 전달/열람을 증명하지 않으며, old Discord message가 resolve되지 않으면 원 노출은 retractable로 승격할 수 없다. 모든 row/control assertion의 disposition이 해소되기 전 `COMPLETE_*`는 금지하고, opt-out/rights suppression은 “수신 완료”가 아닌 명시적 unsent disposition으로 보존한다.

[`correction-delivery-reconciliation.v0.json`](../fixtures/disclosure/correction-delivery-reconciliation.v0.json)의 `CDR-01`–`CDR-21`은 aggregate delivered 오인, Push 관측 경계, Discord message ID 누락, 불명 provider outcome과 중복 전송 위험, 영향 대상 선별, epoch lineage, opt-out, unresolved relation suppression, 누락 분모 및 secret 배제에 더해 사용자 공시함의 revision pinning·개인 상태 보존·pagination epoch 일관성, recipient-target과 shared-surface 분모 분리, in-app personal state 보존, correction provider receipt의 미관측 한계, exact credit/payload lineage 및 credit-policy만 바뀐 정정의 recipient×channel 재검토를 고정한다. 이전 카드는 immutable revision으로 보존하며, 개인 노트는 새 revision으로 자동 retarget하지 않는다. pagination 중 epoch 변경 시 `RESTART_REQUIRED`를 반환한다. 영향받은 이전 카드는 immutable revision을 유지하고 현재 카드에는 새 revision/재검토 필요 상태를 연결한다. 읽음 시각은 “이전 내용을 읽었다”는 이력으로 보존하며 새 revision을 읽었다고 승계하지 않는다. 영향 없음이 증명된 소비자는 event 상태·saved/read 상태를 변경하지 않고, 개인 노트는 새 revision으로 자동 retarget하지 않는다. 영향 범위가 unresolved이면 최신 카드 노출/알림을 `REVIEW_REQUIRED`로 표시하고 freshness를 `UNKNOWN`으로 둔다. 이 fixture는 현재 구현을 acceptance pass로 판정하지 않고 앞 문단의 차이를 명시한다. runtime ledger·provider receipt·edit/delete·correction 재생은 모두 `NOT_RUN`이다. `CDR-19`는 correction attempt payload와 SAP credit projection ID/hash의 정확한 parity를, `CDR-20`은 사실 claim이 그대로여도 credit policy revision 변경 시 해당 recipient×channel exposure를 stale 처리하고 검토하며, `CDR-21`은 credit block order가 manifest hash의 일부이므로 비연속/재정렬 attempt를 reject하는 경계를 고정한다. `CDR-22`는 정정된 계약 금액·촉매 일정 철회·issuer 관계 미확정이 각각 어떤 주장과 판단을 낡게 하는지 dependency graph로 연결한다. 이전 판단은 immutable하게 두고 thesis-critical claim은 suppress, 철회된 일정은 upcoming에서 제거, identity unresolved면 instrument eligibility를 차단하며 자동 매수/매도 추천은 생성하지 않는다. 보유 수량·watchlist 등 사용자 포트폴리오 context는 보존하고 세 영향 사유별 재검토를 요구한다. 이는 영향 전파 설계 fixture이며 실제 계좌/포트폴리오 데이터나 runtime 동작의 증거가 아니다. `CDR-23`은 correction relation·security·page coverage가 불완전할 때 `EVIDENCE_INCOMPLETE`, 방향 `NOT_ASSESSED`, 점수 `NOT_COMPUTED`를 강제한다. `CDR-24`는 coverage와 relation이 완전해도 기간·계약 범위·이행/해지 조건이 비교되지 않으면 `REVIEW_REQUIRED`로 두며 지지·반대 claim을 분리하고 방향·점수를 만들지 않는다. 두 상태를 하나의 “부정”이나 “점수 하락”으로 축약하지 않는다. 이는 임의의 투자 점수나 방향 예측을 금지하는 proposed acceptance다.

현재 표본 크기·허용 discrepancy·baseline 기간·lag 목표·canary 범위/기간·rollback window는 정하지 않았다. `KR-SHADOW-SLO-01` 및 `KR-END-TO-END-ACCEPTANCE-01`의 책임자가 gold set, 층별 분모, 임계값, 독립 reviewer, report schema 및 승인/만료 조건을 증거로 확정하기 전까지 P7은 실행 불가이며 설계상 `HOLD`다.

## 설계 수용 기준 및 자기검토

아래 질문에 전부 “예”가 되기 전에는 구조 승인으로 표시하지 않는다.

| 검토 | 통과 기준 | 현재 |
|---|---|---|
| 회사와 종목 식별 분리 | submitting entity, 본문상 filing parties, 안정 instrument identity·거래 식별자·분류 assertion이 독립적이며 영향 종목 역할과 공식 활성 COMMON_STOCK 근거가 남음 | DART/KIS 정확일치는 submitting entity 후보로 제한. FilingParty와 이벤트 대상 관계 모델 추가. 현재 KIS master 이력 보존과 party 표본 검증은 미완료 |
| KIS 분류 이력 | 보통주/기타상품 테이블 이동 또는 코드 변경 후에도 승인 당시 적격 여부가 재현됨 | immutable snapshot/assertion 설계 추가. 현재 구현·원본 보존 허용 여부 미결 |
| 시총 기본 제외 기준 | KRW 30,000,000,000 초과, 신선도·통화 검증 및 적용 정책판정이 재현됨 | immutable cap eligibility assertion 설계. 최신 fundamental row는 덮어써지며 freshness window/통화 예외 정책은 미승인 |
| 정정/철회/재제출 | 원제출과 후속 제출을 보존하고 자동 연결 불가 시 격리 | OpenDART `last_reprt_at=N` 및 제목 marker 근거 반영. KIND/실제 정정 원문 fixture 대조 미완료 |
| 문서 수명주기 | 원문 불변 revision, hash, 추출기/분석 버전, 실패 상태 추적 | 설계 정의, 약관·보존 정책 미결 |
| 전체 수집/알림 분리 | 전체 DART row 저장이 호재 제목 scorer 및 webhook 설정과 독립 | 현재 DART automation은 제목 후보·알림 경로이며 신규 ledger collector는 미구현 |
| 날짜 정확도 | event date와 일정 다중 주장, precision, timezone, 확정성, 상태 이력 분리 | 설계 정의, 국내 유형별 날짜 사전 미확정. 기존 mapper의 감지시각 의미 식별 |
| 이벤트 종목 귀속 | submitting entity, filing party, event revision별 당사자 역할, 직접 영향을 받는 국내 보통주 종목이 구별되고 직접 근거가 있음 | EventSubjectInstrument와 EventRevisionParty를 설계. 표본 검토/운영 적격성 기록은 미구현 |
| 분석 재현성 | 사실 claim과 해석 분리, 근거 locator, 입력 hash, 버전, 재검토 이력 | 설계 정의, prompt/schema version 정책 승인 필요 |
| 분석·요약 근거성 | 문장별 claim locator, 사실/해석·확정/추정 날짜 분리, 입력/분석기 버전, 공개 전 review | v2.0 계약 정의. JSON schema validator, prompt injection fixture, review UI 미구현 |
| Schema inventory 일치 | conceptual entity 목록과 normalized minimum-field 목록의 table set 및 관계가 동일 | v2.2에서 목록 차이를 대조해 정렬. 자동 schema parity validator 미구현 |
| 종목별 공개 자격 | 각 event subject가 active COMMON_STOCK와 최신 신선 cap floor assertion을 통과하고 다종목 event의 subject별 게이트가 독립적 | v2.4에서 subject state에 eligibility/evidence suppression과 `NEEDS_REVIEW`를 분리. freshness SLA 및 reconciliation은 미승인 |
| 권위 원본 | Git 관리 JSON이 이벤트/분석 단일 편집 원본, 공식 기관이 원문 권위, DB는 immutable evidence cache + fast-forward/checkpoint 검증된 조회 projection | 기존 설계 계약과 일치. 현재 importer의 commit checkpoint/CAS 및 analysis revision은 미구현 |
| Source rights enforcement | retrieval/storage/derivative/display/publication 작업이 현재 유효한 action-scoped rights decision을 모두 통과하며, 감사 가능한 decision snapshot을 가짐 | 정책/행렬 설계만 존재. DART/KIND product-field mapping과 runtime enforcement 미구현 |
| 중복/멱등 | 출처 식별자+hash, 안정적인 event ID, 재실행/동시 실행 충돌 방지 | legacy inventory가 매 docs check에서 현재 원본을 조사한다. 기존 importer에는 event-ID upsert가 있으나 revision monotonicity/checkpoint 없음. v1 mapping manifest, orphan/duplicate reconcile 및 dry-run 미수행 |
| 접근·부수효과 | 공개 GET read-only/무인증, 관리 쓰기 인증, cron 보호 | 설계 정의, API inventory 반영 전 |
| OpenDART coverage 의미 | 페이지 나열 완료, 반복 수렴 관측, 원천 snapshot 증명 상태가 구분되고 code/page drift가 coverage에 반영 | `NON_SNAPSHOT_PAGINATION`, `PAGE_ENUMERATION_COMPLETE`, `OBSERVED_STABLE`, quota/auth 분류 설계. strict response validation 구현 및 운영 SLO 미결 |
| 실패/coverage | 부분 실패와 정상 빈 결과 구별, API code/page consistency와 snapshot 한계를 분리, 재시도·복구·경보 기준 측정 가능 | DART `status` code와 HTTP 상태를 구분하는 규칙 설계. 운영 SLO/보존/RPO 및 runtime alerting 미결 |
| 원문 권리/보안 | product/component/purpose별 license snapshot과 retention/redistribution decision 승인 | 공공데이터포털 공시검색 등록은 출처표시 제1유형으로 표시됨. 실제 endpoint mapping은 확인 필요; 원문 ZIP/첨부의 장기보관·재배포는 별도 미결이며 해당 행동만 blocking |
| 데이터 migration | 기존 스키마 및 이벤트 건수·ID·정정·정합성 dry-run과 rollback 증거 | 미수행 — 설계 작업 범위 밖 |


#### KR v1 legacy inventory (read-only contract)

`scripts/inventory-kr-market-impact-legacy.mjs` 출력이 현재 worktree의 KR legacy 행 수, ID 중복, evidence locator 상태, source byte SHA-256, Git blob/commit 추적 여부의 실행 시점 기준이다. 이 값은 원본 JSON 변경 시 달라지므로 이 설계 문서에 현재 수치나 hash를 복사해 두지 않는다. `scripts/check-docs.mjs`는 실행 보고서의 source hash 형식, 입력 행과 manifest cardinality, event/source identity 수, 모든 행의 격리 상태, reviewer 미승인 상태를 직접 검증한다.

Inventory는 구조 형식, 중복, 날짜 포맷, evidence locator, Git 추적 상태만 검사한다. 현재 공식 원문과 locator의 byte-level 일치, action-scoped rights, stable instrument identity/cap snapshot, date-kind/certainty, reviewer approval을 증명하지 않으므로 legacy row는 전부 `QUARANTINED`이고 일정/publication/migration 입력으로 승인하지 않는다. Inventory는 재현 가능한 worktree snapshot이지 승인된 Git source snapshot이 아니다. manifest를 mainline cutover evidence로 승격하기 전 source artifact와 전체 fixture를 검토·승인 commit에 포함하고 원문 hash, rights, eligibility 및 관계를 별도로 확인한다. evidence URL이 있다고 원문 hash나 quote 권리가 입증되는 것은 아니다.

### 현재 결함/미결 사항

1. 코드와 migration에서 DART list row의 `corp_code`/`stock_code` 및 KIS `kr_common_stock_universe`의 `market`/`code`/`instrument_type`/`enabled`를 확인했다. KIS universe의 common/special 이동 시 별도 sequence ID가 배정되고 현재 `raw_payload`가 upsert 교체되며 sync run은 집계 위주임을 확인했다. 2026-11-01 localhost read-only Flyway audit는 applied V161/source V163, applied/source scripts 104/163, pending 59, failed 0, drift true, DDL inventory 423 objects 중 160 mismatch, V85/V89 split precondition 실패, operational tables 2개/column 1개 누락을 반환했다. 이는 로컬 DB snapshot이며 운영 DB 상태로 일반화하지 않는다. audit 도구는 checksum/full definition/index validity/data-operation 결과를 검증하지 않는다고 밝힌다. 운영 DB 적용 상태와 원본 master snapshot 보존 경로는 여전히 미확인이다.
2. OpenDART 공식 가이드와 2026-10 목록 표본에서 `last_reprt_at=N`, `rm`, title marker, 날짜 전용 `rcept_dt`를 확인했다. 표본 `document.xml` 9건 요청은 HTTP 302 `error1.html`로 이동했지만 DART 제출 뷰어 표본 4건은 확인했다. 배당 기준일 정정, 계약 유보조건 정정, 주총 복수 날짜, 시장안내의 시점별 조건 사실을 설계 규칙에 반영했다. KIND 원문, 실제 철회/첨부 교체, 공급자 관계키 및 API 원문 취득/재조회 범위는 미검증이다.
3. OpenDART 이용제한/원문 저장 및 공개 인용 범위를 공식 약관·운영 정책으로 확정하지 않았다.
4. Git JSON은 event/analysis 편집 원본, 기관은 공식 사실 원천, DB는 문서 보관 정책이 허용하는 immutable evidence cache 및 event 조회 projection으로 경계를 정했다. `.github/workflows/deploy-oci.yml`은 JSON/importer를 패키징·실행하지 않고 Netlify `sync-filings`는 별도 알림 경로를 호출한다. 기존 importer에는 commit SHA fast-forward checkpoint·revision monotonicity 검증이 없어 end-to-end 운영 동기화는 미구현이다. 따라서 앱 배포 성공은 projection 반영 증거가 아니다.
5. 상위 event taxonomy 초안만 있으며 국내 주요 공시 유형별 날짜 사전과 event 분할 기준을 실제 양식/원문 표본으로 검증하지 않았다.
6. 보존 기간, retention/삭제 요청, backup RPO/RTO, shadow 비교 기간 및 수용 가능한 누락률/오귀속률 기준이 정해지지 않았다. OpenDART terms는 프로그램 저작권 및 미규정 사항의 법령 준용을 말하고, data.go.kr 공시검색 등록은 출처표시 제1유형으로 표시한다. 이 등록의 exact endpoint/field mapping과 원문 ZIP·첨부·파생요약 권리는 추가 확인이 필요하다. 따라서 metadata 수집과 full-document retention/public redistribution은 다른 gate이며, 후자에 대한 권한이 없으면 장기보관/공개를 차단한다.
7. 로컬 DB migration history drift와 split migration의 destructive precondition이 미해결이다. 자동 Flyway 실행/history repair는 위험하며 금지한다. 복구·백업·복원 리허설 후 기존 migration baseline을 정리하고 신규 projection migration을 별도 additive dry-run해야 한다.
8. 기존 `filings.published_at`은 DART mapper에서 감지시각으로 기록될 수 있어 공식 접수 시각과 다른 의미다. 과거 행을 정정하거나 이벤트 날짜로 재사용하면 거짓 정밀도가 생긴다. legacy 호환 view/필드 이름 전환 및 backfill은 별도 데이터 감사·승인 없이는 하지 않는다.
9. filing issuer와 사건 영향을 받는 종목이 다를 수 있다. 현재 `market-impact-events.v1` 한 행/ticker 구조만으로는 다중 당사자, issuer와 affected listed parent, 당사자 역할 및 귀속 근거를 표현하지 못한다. EventSubjectInstrument 연결 없이 운영 노출하면 오귀속 위험이 있다.
10. 기존 DART automation은 Discord 설정 확인 후 당일 전체 목록을 조회하고 제목 점수 후보만 알림한다. 이 결과를 전체 공시 수집 coverage로 간주하거나 webhook 없는 상태에서 신규 collector를 이 경로에 붙이면 누락이 발생한다.
11. 현재 KR v1은 단건 `eventDate`로 다중 일정/정정 이력을 보존하지 않는다. read-only inventory는 데이터 구조와 locator 존재를 확인할 뿐 rights/hash/date-kind/instrument eligibility를 검증하지 못하므로 모든 legacy row를 격리한다. importer는 같은 eventId를 revision history 없이 upsert한다. v1→v2 mapping manifest, legacy evidence 신뢰상태, orphan/duplicate reconcile, dry-run/report/rollback이 정의·검증되기 전 전환/import를 금지한다.
12. 현재 DART client는 KST 당일 window를 수집하고 `rcept_no` 없는 row를 계수한 뒤 `PARTIAL`로 판정한다. 정상 응답에서 response `page_no`/`page_count`, cross-page `total_count`/`total_page` 일치, 예상 페이지 수 및 전체 raw/unique/missing/duplicate row 분모를 검사한다. 단, `list` runtime shape 검사, 200 응답 provider error code의 durable coverage reason mapping, immutable cross-page snapshot binding은 없다. snapshot token/stable cursor가 없어 response totals와 aggregate rows가 맞더라도 페이지 사이의 같은 크기 행 교체를 배제할 수 없고 repeated sweeps도 절대 completeness를 증명하지 못한다. historical correction overlap/checkpoint와 end-to-end ingest/document/analysis/attribution coverage는 미구현이며 operational SLO/threshold도 미승인이다.
13. 2026-10-30 한진칼 정정 제출 본문(접수 `20261030801389`)에서 “자회사인 (주)대한항공의 주요경영사항” 및 대한항공씨앤디서비스의 약 7,100억 원 차입금 자금보충약정을 확인했다. 제출자는 한진칼, 보고 대상은 대한항공, 차주/거래 상대는 대한항공씨앤디서비스, 약정 제공 주체는 대한항공으로 구분되어 한 문서에 여러 법인 역할이 있다. filing party identity/role와 해당 상장사에 대한 직접 노출을 분리하는 구조 및 전용 승인 경로는 미구현이다.
14. 현재 DART 목록 코드↔KIS 코드 exact match는 제출자 종목 후보만 식별한다. 당사자-종목 관계와 지배/지원 관계가 event impact를 만든다는 직접 근거를 별도로 검증하지 않고 제출자 ticker에 자동 귀속하면 오귀속 가능성이 있다. 이를 막는 다자 filing party/subject 표본 검증은 미완료다.
15. filing 단위 party role만으로는 한 공시에 담긴 다수 사건에서 역할을 구분하지 못한다. `disclosure_event_revision_parties`를 제안했으나 event-specific party-role extraction/review UI, JSON schema validator 및 운영 데이터 일관성 검증은 미구현이다.

16. 정정·철회와 사건 취소를 분리하는 관계/공개 모델을 보강했다. 다만 실제 DART 철회·간주철회·첨부 교체 사례, KIND 관계 모델, 동일 사실의 독립 근거가 남는 운영 사례를 확보해 acceptance fixture로 검증하지 않았다. `publication_state` 전환 및 reviewer 결정의 권한/감사 흐름도 미구현이다.

17. `HAS_CORRECTION`을 filing disposition과 혼합하면 부분/연속 정정의 상태 해석이 모호해질 수 있었다. v1.8에서 disposition과 `CORRECTS` relation을 분리하고 연속 정정 acceptance 사례를 추가했으나, 실제 다단계 정정 표본의 자동 추출·검증은 미수행이다.
18. 기존 publication state는 event 단위라 한 날짜만 정정/철회된 경우 영향을 받지 않은 날짜까지 숨기거나, 반대로 근거를 잃은 옛 날짜를 계속 노출할 위험이 있었다. v1.9에서 immutable date relation과 assertion-level publication gate를 추가하고 event/date/subject eligibility 결합 규칙을 명시했으나 projection precedence 및 동시 정정 acceptance fixture와 구현은 아직 미완료다.
19. 분석·요약 필드는 존재했지만 문장/claim별 원문 locator, factual summary와 interpretation 분리, 일정 확실성 분리, untrusted filing text 격리, 공개 전 승인조건이 통합된 분석 계약은 미흡했다. v2.0에서 이를 명문화했으나 schema validator·prompt-injection fixture·review 화면은 미구현이다.
20. 공개 API에 분석 revision ID와 summary claim trace가 없고 다중 페이지 요청이 조회 도중 서로 다른 projection revision을 섞을 수 있었다. v2.1에서 summary 근거 참조 및 `projectionCommitSHA + publicationDecisionWatermark` snapshot cursor를 요구했으나 실제 API 구현은 없다.
21. 기존 종목 분류 assertion은 있으나 시총 floor 판정의 시점별 immutable evidence는 정의되지 않았다. 현재 `instrument_fundamental_snapshots`는 `(market,code)` unique row이며 기존 refresh가 현재 측정치를 갱신하므로 과거 eligibility를 복원하지 못한다. v2.2에 market-cap eligibility assertion을 추가했으나 freshness SLA·통화 변환 및 current-vs-event-time 공개 정책은 확정 전이다.
22. OpenDART 이용약관과 원문 API 문서만으로는 원문 전문의 장기 저장 및 제3자 재배포를 포괄 판단할 수 없었다. 공공데이터포털의 `금융감독원_공시정보_공시검색` 등록에는 출처표시 제1유형이 표시되어 검색 metadata의 권리 상태를 구체화할 증거가 추가됐으나 endpoint/field mapping 및 원문 ZIP/첨부/요약 권리는 별도 검토해야 한다.
23. conceptual schema 목록과 최소 컬럼 표 사이의 entity/instrument 및 event-subject/cap eligibility 누락은 v2.2에서 정렬했고, v2.3 이후 `scripts/check-docs.mjs`가 두 표의 전체 table-name parity·중복을 검사한다. 다만 이 gate는 최소 필드의 의미·모든 컬럼/enum/FK/DDL 전체 동등성을 검증하지 않으며 운영 schema conformance는 미구현이다.

24. v2.2는 시총 floor를 설계했지만 public GET eligibility 식과 다중 종목 event의 per-subject 공개 게이트에 연결하지 않았다. v2.3에서 현재 응답 시점의 최신 신선 assertion, 종목별 suppression 및 다중 페이지 cap snapshot watermark를 추가했다. freshness SLA와 eligibility reconciliation window는 여전히 미승인이다.

25. v2.3 파이프라인은 rights decision 이전에 원문 fetch/store처럼 읽힐 수 있었고 `APPROVED`의 작업별 범위 강제가 불명확했다. v2.4에서 권리 작업 gate를 fetch/storage 앞에 두고 disposition별 acceptance matrix를 추가했으나 enforcement는 미구현이다.
26. subject eligibility가 억제된 뒤 master/cap이 회복될 때 자동 복구와 수동 검토 조건, cap 미달 중 누락될 수 있는 filing 재평가 범위가 결정되지 않았다. v2.4에 상태별 복구 fixture를 추가했으나 freshness SLA와 lookback window는 소유자 승인 전 fail-closed다.
27. 공개 cursor에 snapshot ID와 재검증은 정의했지만 token signature·query/endpoint binding·expiry·key rotation/revocation은 v2.25까지 명시하지 않았다. v2.26에서 HMAC/JCS envelope 계약을 보강했으나 실제 signer/verifier, constant-time compare, key lifecycle/compromise drill 및 materialized snapshot 저장·정리·quota는 미구현이고 `KR-CURSOR-SECURITY-01` 승인 전 public pagination은 차단한다.
28. dependency approval fingerprint는 canonical input/hash와 approval-kind dependency 범위, DAG cycle/reverse edge 검증, 정확한 descendant suppression을 v2.25에서 정의했다. 하지만 실제 canonicalizer/golden vector, typed schema/DB edge, generation CAS, traversal 및 DFP-01..15 executable synthetic/concurrency fixture는 미구현이다.
29. source-scope coverage watermark, consumer refs, suppression roots의 공통 hash 계약과 transaction isolation/cursor consistency는 문서화했으나 실제 migration, database uniqueness/composite FK/CAS, source generation 경합·old worker fencing 검증은 없다. 운영 DB drift 및 DB/rights/reconciliation 승인 전 import·migration·공개는 계속 차단한다.
30. static `docs:check`는 문서 표와 고정 문구/ID/cardinality를 검사한다. RFC/JCS 실제 bytes, HMAC 보안, DAG reachability, DART/KIND 원문 locator·권리 진위, 종목 master/cap snapshot 또는 승인된 shadow denominator를 실행해 입증하지 않는다. 해당 artifact별 실행형 fixture와 운영 evidence가 승인되기 전 구조를 defect-free라고 판정할 수 없다.
31. analysis revision에 summary/claim/date payload가 함께 저장되지만 DB의 normalized consumer projection과 정확한 parity 경계, 저장 불허 derivative의 `TRANSIENT_ONLY/NOT_RETAINED` 표현, summary content approval과 action/channel별 파생물 저장·표시 권한을 구분하는 계약은 충분히 강제되지 않았다. v2.29에 `payloadDisposition`, canonical payload/projection parity, summary-use authorization gate를 추가했으나 rights owner 결정·실행 fixture·저장/응답 enforcement는 미구현이며 증명 전 영속 파생물과 공개 summary는 차단한다.
32. date taxonomy는 official body field fixture에 치중해 OpenDART 유형별 structured major-information API field inventory·guide snapshot·field semantic·rights mapping 및 `rcept_no`/정정 reconciliation을 범주별로 구분하지 않았다. v2.30에서 structured API는 일부 추출값이며 정확성·완전성이 보장되지 않는다는 제한과 제한적 date evidence 경로를 추가했으나 실제 endpoint/field inventory, response/original comparison fixtures, rights/reconciliation reviewer release는 미구현이다.
33. DS005 주요정보 공식 제품 36종의 유형 분모와 국내 COMMON_STOCK event scope가 일관되게 매핑되지 않았고, 해외상장·채무증권·자회사/비상장 거래의 직접 노출 경계가 catalog에 드러나지 않았다. v2.31에서 공식 목록 36종과 후보 사건 범주/범위를 고정했으나 각 guide field 전체 목록, 날짜/단위 의미, 실제 endpoint, receipt 정정 history 대조 및 rights fixture는 아직 미승인이다.
34. DS005 36종 inventory는 guide ID와 이름만 고정해 endpoint/table field 계약이 맞는지 자동 감사할 수 없었다. v2.32는 각 공식 guide의 JSON endpoint 36개를 확인해 연결하고 일부 일정 field의 semantic 예시를 추가했으나 전체 response schema/hash snapshot, nullable/placeholder/unit validation, 나머지 항목 date field inventory 및 실제 source fixture 검증은 미완료다.
35. calendar source taxonomy가 DS005와 DART/KIND 실제 검색 분류, 거래소 자체 시장조치를 같은 레벨에서 연결하지 못했고 동일 DART filing의 KIND 재노출 alias와 독립 KRX market-action record를 구분하지 않았다. v2.33에서 DART A–J/detail type, KIND issuer/market-action crosswalk와 exact-receipt alias 원칙을 추가했지만 KIND 안정 ID/API/역사 coverage·rights 계약, 모든 category mapping/reconciliation은 미검증이다.
36. 기존 KIND RSS parser는 공식 ID 부재 시 순번 기반 fallback을 만들고 이를 DB `(source, externalId)` key로 저장한다. KIND 기본 요청은 `currentPageSize=100`이며 paging/total coverage contract가 확인되지 않았다. 2026-11-01의 단일 HTTP 200 빈 RSS observation은 ID·coverage schema 증거가 아니다. v2.34에서 `IDENTITY_UNRESOLVED`, `OBSERVED_EMPTY_RESPONSE`, `FEED_WINDOW_ONLY/UNKNOWN`, evidence fingerprint 및 오류 분류·fixture acceptance를 정했지만 runtime 격리/coverage 구현, 권리 승인 fixture, KIND identity/history/revision reconciliation은 미구현이다.
37. 분석 JSON 예시의 evidence/date source refs는 filing/document revision/hash/rights ID를 담지만 예시 자체에 완전한 filing 및 `documentRevisions` catalog가 없어 source lineage 참조 무결성을 기계 검증할 수 없었다. v2.35에서 KIND/DART filing, document revision, 별도 rights-decision registry를 명시하고 checker가 각 ref의 filing, revision, hash, rights ID 및 action 권한을 exact lineage로 검증한다. 런타임 JSON schema/DB FK validator 및 실제 document snapshot/권리 revision resolve는 아직 미구현이다.
38. conceptual schema의 `DocumentRevision` 정의가 parser version을 byte revision 속성처럼 포함하지만 최소 저장 스키마는 parser/parse state를 별도 attempt에 둔다고 명시해 개념 경계가 모순됐다. v2.36에서 `DocumentRevision`은 byte identity만 소유하고 parser/extractor 실행은 별도 `ParseAttempt`가 소유하도록 정의했다. 관련 ER/schema/runtime FK 및 parser retry fixture는 아직 실제 구현·검증되지 않았다.
39. 예시 JSON은 top-level 분석/event 승인만 표시하고 summary segment별 승인 및 파생 저장·API 표시 권리를 검사하지 않아, 원문 분석권만 있는 요약/일정이 승인된 것처럼 보일 수 있었다. v2.37에서 segment review decision, source-component별 summary/date output rights ID와 required action을 예시에 추가하고 checker가 FACTUAL/INTERPRETIVE claim type, supported fact, 근거별 권리 scope를 검사한다. 실제 rights artifact의 정확한 channel/purpose와 runtime authorization gate는 미구현이다.
40. rights checker가 action string만 대조하면 잘못된 purpose/channel의 권한, 만료된 권리결정, 미승인 상태를 재사용해도 통과할 수 있었다. v2.38에서 rights decision에 exact purpose/channel/status/reviewer, `effectiveFrom`/`effectiveUntil`과 check 시각을 넣고 `requestAsOf` 시점 유효성까지 검사한다. 실시간 revoke 조회, channel별 권리 artifact reconciliation, runtime gate는 미구현이다.
41. `EventDateAssertion`의 `certaintyBasisClaimIds`가 존재하더라도 checker가 claim의 typed `normalizedValue`, `OFFICIAL_CONFIRMED` 상태 및 source evidence가 날짜 assertion과 실제로 일치하는지 검사하지 않았다. v2.39에서 날짜별 basis claim set, typed value exact match, supported FACT, 같은 filing/document revision/hash의 SUPPORTS edge를 정적 gate에 추가한다. 일반 valueKind 전 범위의 runtime validator 및 rights-approved date fixtures는 미구현이다.
42. Event/analysis/summary approvals는 예시에서 `APPROVED` 상태만 있고 immutable `targetRevisionId`, `targetContentHash`, `dependencyFingerprintHash` 및 dependency fingerprint를 가리키지 않아 내용이 바뀐 뒤 옛 검토 상태가 재사용될 수 있었다. v2.40에서 세 revision 종류별 hash/approval binding과 `outputHash` 계층별 canonical payload를 정의했고, v2.41에서 도메인 구분자·정확한 입력 projection을 고정하고 checker가 예시 hash를 RFC 8785로 재계산했다. v2.42는 공식 RFC number-format, UTF-16 property order, Unicode non-normalization golden vectors를 추가하고 JCS 숫자 입력 조건을 바로잡았다. v2.43에서 요약·분석·이벤트 예시의 known dependency tuple projection과 fingerprint hash를 계산하고 checker가 대상 hash·typed tuple·필수 kind·중복·형식·정렬 결과를 대조한다. v2.44는 모든 summary segment approval을 순회하고 분석 fingerprint에 개별 claim을 포함하며 승인 종류별 dependency allowlist 및 tuple identity uniqueness를 검사한다. v2.45는 SUMMARY_SEGMENT, ANALYSIS, EVENT, DATE, SUBJECT, PUBLICATION 6개 kind의 required/conditional/allowed matrix를 정의하고 checker가 표와 코드 allowlist의 일치를 검사한다. v2.46은 conditional kind마다 activation predicate를 고정하고 predicate 표의 완전성과 문구를 checker 계약에 대조하며 PUBLICATION_TARGET/coverage/consumer/epoch의 동일 target-snapshot binding을 추가했다. v2.47은 manifest digest와 요청시각을 설계했으나 공개 GET 안에서 read-only transaction과 CAS write를 함께 요구해 DB 규칙에 모순됐고 HTTP 응답 전송과 transaction commit의 원자성도 보장할 수 없었다. v2.48은 GET을 단일 read-only snapshot으로 제한하고 epoch/watermark 증가는 별도 writer transaction 소유로 분리했으며 응답 경계의 한계, no-store, ETag/304 기본 금지와 DFP-16 snapshot race 기준을 명시했다. v2.49는 publication에 영향을 주는 6개 writer domain과 domain별 원자 변경 집합/실패 동작을 표로 고정하고 checker가 행 집합과 문구를 대조한다. v2.50은 저장소 범위의 legacy importer/public GET/DART alert scheduler/calendar schema-only/미구현 KR canonical surface/외부 unknown 경로를 표로 구분하고 checker가 실제 코드 경로 및 literal SQL 참조 집합과 대조한다. v2.51은 13개 감사 영역 중 event attribution, API/UI consistency, operational security/privacy, end-to-end shadow acceptance의 독립 결정 owner ID가 없던 것을 확인해 17개 명시 결정으로 확장하고, checker가 모든 감사 영역에 결정 책임 ID가 하나 이상 연결되는지 강제한다. 단, 저장소 밖 DB/deployment consumer closure, 승인·실행 증거, 전체 runtime path inventory는 미확인/미구현이다.
43. 감사표가 event attribution, API/UI snapshot consistency, 장애·보안·개인정보, end-to-end shadow acceptance 각각의 잔여 증거를 기술했지만 전용 결정 ID/책임 역할/미승인 시 선택 가능한 정책 경로가 없었다. v2.51에서 4개 decision ID를 추가해 총 17개로 확장하고 감사 domain마다 한 개 이상의 결정 ID를 checker로 보장한다. 17개 모두 `OPEN`이며 역할 소유자 승인, 실행 fixture 및 production closure는 미완료다.
44. v2.92의 decision ledger는 각 row의 JCS hash와 전역 chain을 검사했지만 저장 파일 전체와 tail을 다시 계산하거나 예전 prefix로 되돌리는 작업을 막는 trust anchor가 없었다. 또한 register 생성 경로의 표준 `JSON.parse`는 중복 property를 자동 수용할 수 있었다. v2.93에서 canonicalization duplicate-key reject와 ledger helper의 RFC JCS golden-vector parity를 checker 계약에 넣고, `KR-OPERATIONAL-SECURITY-01`에 서명된 외부 checkpoint·monotonic sequence·독립 trust domain·signer/writer 분리·key rotation/revocation acceptance를 추가했다. DLCP-01~08은 합성 제안이며 algorithm/KMS·cadence·복제 수·실제 signature/anchor/runtime verification은 미승인·미구현이다. checkpoint가 없거나 tail/sequence/key 검증이 실패하면 비-`OPEN` status projection은 계속 차단한다.
45. 기존 capital projection은 사건별 금액·주식 효과와 CB/BW/EB 회차 후속 단계를 구분했지만, issuer의 여러 tranche·정정·추가상장·정기보고서 share/debt snapshot을 하나의 as-of 상태로 조정하는 결정과 acceptance 분모가 없었다. 공식 KIND에는 행사 notice의 전후 주식수·잔액과 예정 상장일이 함께 나오며, 별도 지분 보고의 발행주식총수가 예정 추가상장 수량을 포함할 수도 있다. v2.94에서 `KR-CAPITAL-RECONCILIATION-01`과 `issuer-capital-state-reconciliation.v0.json`의 ICSR-01~16을 제안해 series identity, base snapshot 대 movement 조정, event-time/observed-time, 통화·class·stage 분리 및 부분 coverage fail-closed를 추가한다. 이 설계는 [OpenDART 정기보고서 주요정보 가이드](https://opendart.fss.or.kr/guide/main.do?apiGrpCd=DS002), [KIND 전환주식 전환청구 사례](https://kind.krx.co.kr/external/2026/05/28/000970/20260528001517/72112.htm), [KIND 지분 보고 사례](https://kind.krx.co.kr/external/2026/02/13/001612/20260213003577/00634.htm)에 한정해 근거화했다. 상품별 원천 completeness, series crosswalk, historical coverage, 산식·공개 승인과 runtime 구현은 미결이다.

46. 재무·감사 신호, 법원/규제 절차, KRX 조치·거래 상태를 하나의 issuer timeline으로 다룰 owner decision과 독립 상태축 fixture가 없었다. 각 신호를 부도·상장폐지로 오인하거나 신청/심사/정지/재개를 최종결과로 합칠 위험이 있다. v2.95의 `KR-ISSUER-RISK-STATUS-01`과 IRST-01~18은 issuer assertion·법원/규제 절차·거래소 조치를 분리하고 source authority/currentness, exact identity, correction, partial coverage fail-closed를 제안한다. OpenDART 추출의 불완전성 고지와 KIND/거래소 분류를 연결했으나 원천별 권리·검색 분모·운영 freshness 및 상태변경 규칙은 미승인이고 runtime은 미구현이다.

이 항목은 추정으로 메우지 않는다. 문서 구조는 실패 모드를 가시화했으나, 현재 설계는 아직 defect-free 또는 구현 승인 상태가 아니다. 다음 구조 개선은 위 1~46번을 공식 문서·코드·운영 증거로 해소하고 설계 결정 기록을 갱신하는 것이다. v2.93에서는 duplicate-key rejection과 checkpoint proposal inventory를 추가했고 v2.94에서는 issuer-wide capital reconciliation decision/fixture를 연결했고 v2.95에서는 issuer risk/listing timeline decision/fixture를 연결했다. 22개 결정은 현재 모두 `OPEN`이며 외부 anchor/signature와 issuer-state runtime reconciliation을 포함한 전체 acceptance는 닫히지 않았다.


### 결정 기록 및 fail-closed defaults

#### Decision register 운영 계약

아래 결정표는 참고 목록이 아니라 설계 승인 전까지 유지되는 운영 register다. 상태 어휘는 `OPEN`, `EVIDENCE_READY`, `APPROVED`, `CLOSED`, `REJECTED`, `EXPIRED`로 고정한다. 현재 문서 시점에서 22개 모두 `OPEN`이다. `APPROVED`는 책임자가 증거에 근거해 선택값을 승인한 상태고, `CLOSED`는 승인 후 수용 fixture·코드 gate·복구 증거까지 확인되어 해당 의존 범위가 충족된 상태다. 설계 작성자나 validator가 업무 소유자를 대신해 정책값을 승인할 수 없다.

각 ID에는 결정 책임자 1명(역할 및 실제 지정자), 범위가 명시된 선택값, 근거 snapshot의 URL+source hash+관측시각, 선택 근거, 승인자/시각/유효기간, 선행 의존 ID, 재검토/만료 조건, 성공·거절 acceptance, 연결된 fixture 및 실행 증거를 결정 변경 이력으로 추가한다. 수정은 이전 상태를 덮지 않고 append-only decision revision으로 기록한다. 사람이 지정되지 않은 책임 역할은 owner assigned로 간주하지 않는다. 상충/부재/만료 근거는 `OPEN`으로 되돌리고 의존 gate를 닫는다. 문서 표의 status만 변경하고 승인 evidence 링크/hash를 빠뜨리는 행위는 checker가 불완전으로 판정해야 한다.

모든 비-`OPEN` 상태는 controlled `decision-evidence-ledger.v0.json`에 동일 ID·상태의 유효 revision을 가져야 한다. 상태는 latest record로부터 계산되므로 register의 수동 `currentStatus` 입력은 없다. ledger record의 scope와 owner role은 canonical decision과 정확히 같아야 하고, named owner/reviewer stable ID, evidence manifest hash/관측시각, reviewer/decision reference, 유효기간·재검토 조건, acceptance artifact/result/fixture 분모, reason/reopen 조건, 이전 revision, dependency decision, 적용할 code gate 및 rollback 증거를 보유한다. 각 record hash는 RFC 8785 JCS와 domain separator로 계산하고 전역 append 순서의 이전 record hash를 연결한다. 깨진 chain, 누락된 revision, 금지 전이, 범위 불일치, 미필수 상태 증거는 상태 projection을 차단한다. `APPROVED/CLOSED`에는 선택값과 signed decision, acceptance fixture/report `PASS`가 필요하다. `EVIDENCE_READY`는 approval이 아니며 `NOT_RUN`만 허용할 수 있고, `REJECTED`에는 이유/재개 조건, `EXPIRED`에는 만료 시각/재검토 조치가 필요하다. 이 ledger는 운영 evidence라 공개 문서 catalog/manual에 싣지 않는다. hash chain은 자체 저장만으로 전자서명이나 외부 백업·불변성을 제공하지 않으며, 정적 checker는 실제 owner 증거 진실성과 downstream runtime gate를 입증하지 않는다.

#### 서명된 외부 checkpoint 제안 — DLCP-01–DLCP-08

현재 hash chain 검사는 파일 안에서 entry 수정·재정렬·누락을 발견하지만, 공격자가 entry·`chainTailHash` 전체를 다시 계산하거나 파일을 이전의 유효 prefix로 교체하면 독립된 기준점이 없어 이를 판별할 수 없다. 승인 status를 운영에서 신뢰하려면 [decision-ledger-checkpoint.v0.json](../fixtures/disclosure/decision-ledger-checkpoint.v0.json)에 정의한 분리 trust-domain checkpoint가 선행되어야 한다. 이 fixture는 합성 수용 계약이며 실제 서명/보관 증거가 아니다.

제안 payload는 `ledgerId`, 단조 증가 `sequence`, checkpoint가 덮는 `tailRecordHash`, 이전 checkpoint hash, 생성시각, signer key ID와 signature algorithm을 포함한다. 해당 payload는 ledger-record와 다른 domain separator를 사용해 RFC 8785 JCS로 직렬화하고 detached signature를 검증한다. ledger writer와 signer 권한은 분리하고, checkpoint는 ledger 파일과 다른 trust domain의 append-only/retention-controlled 저장소와 독립 백업에 보관한다. 검증기는 저장소가 기억하는 가장 큰 sequence 및 이전 checkpoint hash를 대조해 truncate/replay를 차단하며, 새 decision revision은 최신 tail의 checkpoint가 기록되기 전까지 `APPROVED/CLOSED` projection에 반영하지 않는다.

알고리즘, KMS/HSM·보관 사업자, checkpoint cadence, 최소 독립 복제본 수, signer와 writer 분리 수준은 보안·운영 책임자가 공식 제품/환경 근거를 확인해 결정해야 한다. 현재 전부 미승인이다. anchor 저장소를 사용할 수 없거나 checkpoint가 누락·만료·철회·sequence 역행·tail 불일치이면 비-`OPEN` 상태를 fail-closed 한다. key rotation은 구·신 key overlap 검증과 신규 checkpoint를 요구하고, compromise 복구는 이전 chain을 보존한 채 incident review와 명시적 re-anchor를 남긴다. 재계산한 ledger hash 또는 유효한 signature만으로 원 증거의 진실성, 보존 권리, signer의 업무 승인 권한을 입증하지는 않는다.

| ID | 검증 시나리오 | 기대 gate |
|---|---|---|
| `DLCP-01` | signature 유효, 최신 sequence/tail과 일치 | anchored 범위의 status만 수용 |
| `DLCP-02` | 전체 파일 재작성으로 기존 checkpoint tail 불일치 | 비-`OPEN` projection 차단 |
| `DLCP-03` | checkpoint truncation 또는 과거 checkpoint replay | 비-`OPEN` projection 차단 |
| `DLCP-04` | 새 기록이 아직 외부 anchor에 반영되지 않음 | 새 비-`OPEN` status 차단 |
| `DLCP-05` | anchor 저장소 장애/접근 실패 | 비-`OPEN` projection 차단 |
| `DLCP-06` | 알 수 없거나 철회된 signer key | 비-`OPEN` projection 차단 |
| `DLCP-07` | key rotation overlap·검토 증거 누락 | rotation 수용 전 차단 |
| `DLCP-08` | signer compromise 후 re-anchor 시도 | 과거 chain 보존·incident review 요구 |

공식 JCS 기준은 duplicate property name 금지, I-JSON number 제한, property 이름의 UTF-16 code unit 정렬, 배열 순서 보존, Unicode 원문 보존이다. [RFC 8785 §§3.1–3.2 및 Appendix B](https://www.rfc-editor.org/rfc/rfc8785.html)는 부동소수점 경계 예시와 정렬 규칙을 제공한다. 생성 단계도 중복 JSON key를 reject해야 하며, ledger hash 구현은 기존 document JCS golden vector와 직접 대조되어야 한다. revision·fixture counter는 프로젝트에서 비교·증가에 사용하므로 JavaScript safe integer 범위 밖 값을 거부하고, 이후 큰 정밀도가 필요하면 JSON number 대신 명시된 decimal string 계약을 별도 결정한다.

허용 상태 전이는 아래와 같다. 같은 상태의 새 revision은 근거 보강/재검토 이력 용도로 허용한다. `CLOSED`를 되돌릴 때도 새 OPEN revision을 추가하고 영향 범위 및 재개 근거를 기록한다.

| 현재 상태 | 허용 다음 상태 |
|---|---|
| `OPEN` | `OPEN`, `EVIDENCE_READY`, `REJECTED` |
| `EVIDENCE_READY` | `EVIDENCE_READY`, `APPROVED`, `REJECTED`, `EXPIRED`, `OPEN` |
| `APPROVED` | `APPROVED`, `CLOSED`, `REJECTED`, `EXPIRED`, `OPEN` |
| `CLOSED` | `CLOSED`, `EXPIRED`, `OPEN` |
| `REJECTED` | `REJECTED`, `OPEN` |
| `EXPIRED` | `EXPIRED`, `OPEN` |

<!-- decision-evidence-ledger:start -->
| Decision ID | Revision | Status | Named owner | Evidence manifest SHA-256 + source timestamp | Reviewer/decision record | Valid through/review condition | Fixture/acceptance report | Rejection/expiry reason |
|---|---:|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — |
<!-- decision-evidence-ledger:end -->

#### 설계 승인 전 결함 종결 감사표

| 감사 영역 | 승인에 필요한 증거 | 현재 결과 | 미충족 시 차단 범위 |
|---|---|---|---|
| 공식 source와 rights | endpoint·field·payload·action별 terms snapshot 및 권한 결정, metadata/body/derived 범위 분리 | `OPEN`; 검색 metadata의 제한적 근거만 있음 | fetch·retention·derivative·quote·UI/API 각각 차단 |
| 보통주 identity 및 eligibility | versioned official master 원본/hash, code 재사용·분류변경 표본, cap/freshness policy 승인 | `OPEN`; 현재 행 upsert/이력 한계 확인 | 신규 event subject 생성·노출 차단 |
| ingestion coverage | 공식 pagination/error/quota 계약, 경계 변경·반복 수렴·late correction 재생 fixture, source freshness max-age policy 및 운영 분모 | `OPEN`; non-snapshot pagination 한계 문서화, source freshness policy 미승인 | complete coverage 주장·stale active/upcoming 일정·운영 승격 차단 |
| issuer capital state reconciliation | issuer·class·series/tranche crosswalk, 정기보고서 기준 snapshot과 행사/상장/상환 movement의 reconciliation denominator, as-of/observed-at·corporate-action basis 수용 | `OPEN`; 사건별 effects는 설계됐으나 issuer 통합 상태·coverage gate는 미승인 | issuer 통합 잔액·희석/잠재공급 집계 공개 차단 |
| issuer risk and listing status | `KR-ISSUER-RISK-STATUS-01`의 공시·법원/규제·KRX 상태축별 official authority, 시점/정정/currentness 및 partial-coverage 분모 | `OPEN`; source taxonomy는 공식 문서에서 확인, 통합 timeline runtime 없음 | distress score·건강/해소·현재 거래가능 결론 및 상장상태 aggregate 공개 차단 |
| 문서·정정 생명주기 | DART/KIND correction, withdrawal, deemed withdrawal, attachment replacement 층화 fixture와 locator 재현 | `OPEN`; 본문 locator/권리 미확보 | relation 확정·영향 재분석·공개 차단 |
| 분석·요약 재현성 | untrusted text 경계, prompt injection adversarial fixture, versioned schema/model/prompt/normalizer 및 claim-level trace | `OPEN`; 정적 구조만 정의 | 분석 승인·요약 공개 차단 |
| event/date taxonomy | 유형·정정·복수 날짜·모호한 날짜 포함 공식 form fixtures, reviewer release/version 승인 | `OPEN`; sample taxonomy approval count 0 | 미승인 token 자동 추출·공개 차단 |
| event attribution | 제출자/party/subject가 다른 실제 다자 공시, stable entity link와 각 보통주 직접 영향 근거 검토 | `OPEN`; 설계 표본은 있으나 운영 검증 없음 | ticker 귀속/publication 차단 |
| 저장·legacy cutover | schema drift 진단, source snapshot/manifest cardinality, row-level reconciliation, additive migration 및 restore/rollback rehearsal | `OPEN`; local DB drift 및 destructive precondition 존재 | migration/import/legacy 전환 차단 |
| API·UI snapshot consistency | 공개 GET auth/API inventory, HMAC 서명 cursor의 endpoint/query binding·만료·키 회전/폐기 fixture, materialized snapshot quota, rights-aware document UX, projection revision 일관성 acceptance, v1/v2 contract compatibility 및 consumer migration 증거 | `OPEN`; v2.26 token 계약·P6 version coexistence plan 존재, signer/key 운영·snapshot quota·replay/tamper fixture 및 외부 consumer inventory 미실행 | 결정/수용 증거 전 public pagination, 기존 route 변경, UI 구현 및 배포 차단 |
| cursor key/snapshot security | `KR-CURSOR-SECURITY-01` max age/key lifecycle/snapshot quota 승인, tamper·cross-endpoint/filter replay·expiry·revocation pagination fixture | `OPEN`; HMAC token 계약만 문서화, signer/verifier 및 key/snapshot 운영 증거 없음 | 기존 route contract는 별도 판단; 신규 paginated public KR API 차단 |
| 장애·보안·개인정보 | retry/idempotency/fencing, revocation propagation, deletion lineage, backup restore, role access 및 observability rehearsal | `OPEN`; 설계 시나리오 일부만 정적 정의 | shadow/production 운영 차단 |
| 운영 책임·SLO | 지정 owner, quota/budget, reconciliation cadence/lookback, review latency, 누락·오귀속 허용 기준 및 경보 임계값 | `OPEN`; 분모·수치 미승인 | 운영 승격·성능 적합성 주장 차단 |
| end-to-end shadow acceptance | 고정된 층화 표본과 denominator, 독립 human gold set, discrepancy report, 승인된 threshold, rollback 연습 | `OPEN`; 실행자료 없음 | 전체 설계 acceptance와 운영 배포 차단 |

각 행의 성공은 한 시점의 green 문서검사만으로 입증되지 않는다. 관련 원천/권리 snapshot, 전체 분모를 포함한 실행결과, 독립 reviewer 결정, 회귀 감지 gate 및 복구 rehearsal을 함께 연결해야 한다. 변경 영향이 여러 영역에 걸치면 각 영역을 각각 승인한다. 이 감사표에서 `OPEN`이 남아 있으면 이 문서가 상세하더라도 “결함 없음” 판정을 내리지 않는다.

<!-- disclosure-decision-register:start -->
| Decision ID | 소유 역할 | 결정할 값 | 소유자 결정 전 기본 동작 | 승인 증거 | 상태 |
|---|---|---|---|---|---|
| `KR-DART-RIGHTS-01` | 데이터/법무 책임자 | DART/KIND endpoint·field·payload class별 fetch, transient parse, retain, derivative, quote, UI/API, backup 권한과 출처표시 | 권리 snapshot이 정확한 source/product/component/action과 일치하지 않으면 해당 action 금지. 개별 metadata 권리가 확인된 경로만 예외 허용 | 공식 약관/상품 license snapshot hash, endpoint-field mapping, reviewer·effective date | `OPEN` |
| `KR-CAP-FRESHNESS-01` | 투자 데이터 책임자 | cap 원천, KRW 환산 기준시각/환율 원천, 장중 변동·시장 휴일 포함 stale window, event-time/current-time eligibility semantics | freshness/통화 미판정은 `UNVERIFIED`; public subject는 숨김 | 정책 version, 수치 기준, representative cases, signed review record | `OPEN` |
| `KR-RECONCILIATION-01` | 데이터 운영 책임자 | historical overlap lookback, cadence, correction denominator/completeness SLO, source freshness max-age 및 required window, quota budget | 기간/max-age 승인 전 historical completeness를 주장하지 않고 coverage=`UNVERIFIED`; 일정 freshness는 `UNKNOWN`으로 두고 active/upcoming publication 차단 | range/cadence/max-age, 공식 quota evidence, replay/late-arrival/outage fixture, freshness denominator, 운영 승인 | `OPEN` |
| `KR-CAPITAL-RECONCILIATION-01` | 공시 도메인·재무 데이터 책임자 | issuer 단위 증권 series/tranche 식별, 발행·잔액·전환/행사·상장·상환 movement 연결, 정기보고서 기준 stock과 거래 event 조정, coverage/as-of 및 통합 capital-state 공개 정책 | 정확한 issuer·security class·series 관계, 기준 snapshot 및 movement denominator가 확인되지 않거나 coverage가 부분이면 issuer 통합 잔액·희석/공급 합계를 공개하지 않고 unresolved amounts를 보존 | 공식 DART/KIND 층화 fixture, tranche/revision crosswalk, periodic snapshot-to-movement reconciliation denominator, 중복/정정/기준시점/통화/class 경계 acceptance, 독립 reviewer 승인 | `OPEN` |
| `KR-ISSUER-RISK-STATUS-01` | 공시 도메인·상장상태 책임자 | issuer 단위 재무·감사 공시 신호, 법원/행정 절차, KRX 관리·매매 상태·상장적격성 단계의 공식 관측을 시점·revision·대상 instrument별로 연결하고 현재 상태/공개 정책 결정 | 공시 신호, 법원 절차, 거래소 조치, 상장 결과는 서로 자동 전이하지 않는다. authority·issuer/instrument 관계·source coverage·as-of·정정 상태가 미확인/충돌/오래된 경우 `UNKNOWN` 또는 `UNRESOLVED`로 두고 건강/해소/거래가능 결론 및 aggregate score 공개를 차단한다 | OpenDART/KIND 공식 분류·원문 층화 fixture, issuer/security identity와 3개 상태축 전이표, event-time/observed-time·정정·coverage 분모, 권한별 source freshness 및 reviewer 승인 | `OPEN` |
| `KR-RETENTION-01` | 법무·보안·운영 책임자 | 원문/파생물/백업별 retention, deletion SLA, RPO/RTO, restore test cadence 및 접근권한 | 원문 body는 rights retention이 승인되지 않으면 보존하지 않음. 파생물도 rights scope 불명 시 저장·공개 금지 | retention matrix, source body/byte/hash/locator/derived packet lifecycle by action and purpose, deletion/backup restore evidence, access policy approval | `OPEN` |
| `KR-TAXONOMY-01` | 공시 도메인 reviewer | event/date vocabulary, source form/field mapping, allowed transitions | fixture 없는 date token은 `UNMAPPED/NEEDS_EVIDENCE`, 공개 금지 | versioned taxonomy release + official form fixtures + reviewer sign-off | `OPEN` |
| `KR-LEGACY-CUTOVER-01` | 저장소/DB 운영 책임자 | v1 mapping, DB importer/projection ownership, deployment and rollback | 기존 importer·calendar DB를 새 source of truth로 전환하지 않음 | schema drift remediation, immutable snapshot, dry-run reconciliation, restore/rollback rehearsal | `OPEN` |
| `KR-MASTER-SNAPSHOT-01` | 종목 데이터 책임자 | 보통주 판정의 공식 마스터, 원본/version/hash 보존 가능 범위, identifier 유효기간 및 재평가 주기 | 활성 COMMON_STOCK를 공식 snapshot으로 입증하지 못한 종목은 생성·연결·노출 금지 | 공식 원천 명세, snapshot fixture/hash, 코드 재사용·분류변경·효력일 correction 사례, candidate/preparer/reviewer capability matrix, self-approval 분리 및 CAS/reopen/expiry acceptance와 named owner 승인 | `OPEN` |
| `KR-ANALYSIS-REPRO-01` | 공시 도메인 reviewer | prompt/schema/model/normalizer 버전, 입력 정규화, 재실행 동등성, prompt injection 대응 | 버전·입력 hash가 없거나 untrusted 본문 경계가 불명확한 분석은 승인·공개 금지 | golden filing fixtures, deterministic validation report, adversarial prompt fixture, reviewer sign-off | `OPEN` |
| `KR-MARKET-DATA-RIGHTS-01` | 시장 데이터/법무 책임자 | KRX 및 가격·benchmark provider별 product/endpoint/field/action/purpose/channel 권한, transient access, snapshot retention, replay/reacquisition, derived statistic calculation/publication, terms revision과 expiry | provider·상품·action별 직접 근거와 유효 revision이 없거나 scope가 충돌하면 해당 취득·보존·재실행·계산·공개 action은 `UNRESOLVED`로 차단한다. hash/locator는 권한이나 source byte 가용성을 뜻하지 않는다 | 공식 약관/계약 snapshot hash와 effective date, provider-action-retention matrix, endpoint/field mapping, terms change/revocation fixture, named legal/data owner approval | `OPEN` |
| `KR-EVENT-STUDY-POLICY-01` | 시장분석 책임자·독립 통계 reviewer | event-study 목적과 confirmatory/exploratory 구분, event window/primary endpoint, cohort/comparator, subgroup/multiplicity, minimum sample, missingness/confounder policy, result interpretation and publication | 사전 정책 revision과 승인된 분석 family가 없거나 rights/replay gate가 닫혀 있으면 결과는 기술적 미확정·탐색 상태로만 보존하고 confirmatory claim 및 public ranking을 차단한다 | versioned preregistration template, synthetic adversarial cases, independently reviewed gold denominator, approved statistical policy and expiry/reopen triggers | `OPEN` |
| `KR-IMPORTER-OPS-01` | 애플리케이션/DB 운영 책임자 | importer 배포 산출물·호출자, mainline checkpoint CAS, 재시도·재조정·관측·rollback 소유자 | 앱 deploy를 projection 반영으로 간주하지 않으며 명시적 checkpoint가 없는 import는 거부 | 배포 manifest, 승인 commit SHA, idempotent replay 및 장애 rollback rehearsal | `OPEN` |
| `KR-DB-DRIFT-01` | DB 운영 책임자 | 로컬/운영 schema history drift, 선행 migration 손상, projection additive migration 승인 | drift가 미해결이면 migration·import 금지. 자동 repair/baseline 금지 | 환경별 schema inventory, 백업·restore 성공, 승인된 additive migration dry-run | `OPEN` |
| `KR-SHADOW-SLO-01` | 데이터 운영/도메인 책임자 | 표본 기간·층화·크기, 오귀속/누락 수용 기준, quota 및 ingest/review 지표 목표 | baseline·분모·owner-approved threshold가 없으면 shadow 결과는 `NOT_ACCEPTED`, 운영 승격 금지 | 재현 가능한 표본/분모, 층별 결과, SLO 승인 및 rollback rehearsal | `OPEN` |
| `KR-DOCUMENT-UX-01` | 제품/법무 책임자 | 문서 분류·revision·접근권한, 허용 인용량·표시형식·삭제 요청 UX | 권리 범위가 확인된 원문 링크/메타데이터만 표시하고 임의 인용·전문 저장 금지 | 문서 생애주기 matrix, 역할별 접근 시나리오, 사용자 공개 문구 승인 | `OPEN` |
| `KR-PERSONAL-THESIS-UX-01` | 제품 책임자·개인정보 책임자 | 사용자 명시적 opt-in thesis journal의 가설/근거/time horizon/검토기준 UX, 개인 데이터 최소화, event/claim revision link, 개인 기록 export/delete 및 공개·분석 consumer 경계 | watchlist·종목 열람·공시 알림만으로 thesis 또는 보유/거래 정보를 만들지 않는다. 가설은 사용자 소유 기록으로 표시하고, 기준·근거·기간이 미완성되거나 source/rights가 stale이면 성과·정확도 claim을 생성하지 않는다 | versioned user research/UX copy, synthetic privacy/revision/outcome-attribution cases, owner-scoped API/UI contract, retention/export/delete review 및 independent product/privacy approval | `OPEN` |
| `KR-CURSOR-SECURITY-01` | 애플리케이션 보안/제품 책임자 | cursor HMAC key source/rotation/revocation, canonical query binding, max age, materialized snapshot retention/quota, emergency invalidation | 결정 승인 전 public pagination 비활성; offset/page-number 방식으로 snapshot 일관성을 가장하지 않음 | threat model, key lifecycle/compromise drill, tamper/cross-endpoint/filter replay/expiry/concurrent revocation fixtures, quota/retention 승인 | `OPEN` |
| `KR-EVENT-ATTRIBUTION-01` | 공시 도메인·종목 마스터 책임자 | 제출자·당사자·대상 issuer가 다른 filing의 stable entity link, 직접 영향 근거, 다자 event subject cardinality와 attribution reviewer | 제출자/당사자 이름이나 종목코드 문자열만으로 event ticker를 만들지 않으며 attribution 근거가 불충분한 subject는 `UNVERIFIED`로 숨김 | 공식 filing fixture, entity crosswalk snapshot/hash, 직접 영향 claim trace, 다자 오귀속 adversarial set 및 reviewer 승인 | `OPEN` |
| `KR-API-UI-CONSISTENCY-01` | API·제품·DB 운영 책임자 | public API/UI projection revision, as-of 의미, filter/sort/page contract, ETag/cache와 revocation 동작, 권리-aware 문서 UX의 일관성 | 동일 응답의 모든 row·메타데이터가 단일 immutable snapshot을 가리키지 않으면 응답/페이지를 공개하지 않음 | route/UI contract inventory, 동일 snapshot hash fixture, filter/page/revocation race acceptance, no-store/cache 정책 승인 | `OPEN` |
| `KR-OPERATIONAL-SECURITY-01` | 보안·개인정보·운영 책임자 | retry/idempotency/fencing, authorization/audit retention, revocation/deletion propagation, backup/restore and privacy controls, incident response, decision-ledger append authorization, detached checkpoint signing, independent anchor retention and key rotation/revocation | 미분류 데이터는 최소 수집하고 승인 없는 본문·개인정보 보존, 검증되지 않은 결정 근거 projection, 권한/삭제 전파 미확인 shadow·운영 실행을 차단한다. ledger 전체 재작성 또는 stale checkpoint를 배제할 수 없으면 비-OPEN decision status를 적용하지 않는다 | threat/privacy model, server-side actor scope/revocation/self-approval/CAS and read-only audit enforcement, evidence redaction/access/deletion lineage, recovery rehearsal, retry/idempotency/fencing fixtures, signed external ledger checkpoint contract, truncation/rewrite/replay/key-revocation acceptance, named owner approval | `OPEN` |
| `KR-END-TO-END-ACCEPTANCE-01` | 독립 품질 reviewer·업무 owner | 층화 gold set/전체 분모, 누락·오귀속·날짜 오류 기준, 독립 판정, 반복 기간, rollback acceptance | 분모·gold set·사전 승인 기준이 없으면 결과를 `NOT_ACCEPTED`로 남기고 설계 승인·shadow 승격·배포 금지 | versioned gold set/hash, 독립 reviewer 기록, source-to-publication end-to-end 실행 결과, 승인 threshold 및 rollback rehearsal | `OPEN` |
<!-- disclosure-decision-register:end -->

각 승인 record는 결정 ID·값/단위·근거 URL 또는 저장소 증거 hash·결정자 역할·시각·유효기간·재검토 조건을 기록한다. 숫자 기준은 task owner가 승인하기 전 채우지 않는다. 권리/데이터/운영 결정이 상충하면 가장 제한적인 gate를 우선한다. 어떤 결정을 내리지 않았다는 사실을 승인으로 해석하지 않는다. 위 결정 중 하나라도 `OPEN`, 증거 만료, 책임자 미지정이면 설계 승인과 해당 의존 단계의 구현·migration·shadow·공개 gate는 닫힌 상태다. 결정을 내린 뒤에도 관련 acceptance fixture, 코드 gate, rollback 증거가 확인되기 전에는 `CLOSED` 처리하지 않는다.

#### 결정 종료 및 증거 추적 프로토콜 제안

이 절도 위 Decision register의 단일 상태 어휘 `OPEN`, `EVIDENCE_READY`, `APPROVED`, `CLOSED`, `REJECTED`, `EXPIRED`를 그대로 사용한다. 결정 상태, 심의 진행 단계, 실제 consumer gate 상태는 서로 다른 축이다. `OWNER_REVIEW`는 `EVIDENCE_READY` 상태에서 이뤄지는 심의 활동이고, 유보는 사유와 재검토 trigger를 기록한 `OPEN` revision으로 남긴다. `ACTIVE`는 status가 아니라 downstream release/consumer gate 상태이며 별도 gate evidence로 판단한다. `REOPENED`는 status가 아니라 만료·변경 후 새 `OPEN` revision을 추가하는 행위다. 보조 진행 단계를 status처럼 사용해 결정을 승인하거나 닫지 않는다.

결정 표의 `OPEN`을 단순히 승인 회의에서 값 하나를 채우는 방식으로 닫지 않는다. 각 decision은 근거 수집부터 적용된 gate의 검증, 독립 확인, 유효성 만료 후 재검토까지 이어지는 versioned lifecycle을 가진다. 이 절은 그 lifecycle의 문서 기준이며 결정 owner, 정책값, 임계값 또는 기존의 fail-closed 동작을 대신 정하지 않는다.

| Decision status | 진입 조건 | 허용되는 다음 status | 효력 |
|---|---|---|---|
| `OPEN` | owner/결정 범위가 미정이거나 승인 증거가 없음 | `OPEN`, `EVIDENCE_READY`, `REJECTED` | 관련 gate는 기존 fail-closed 그대로 유지 |
| `EVIDENCE_READY` | 필수 source snapshot, 범위/분모, fixture 및 한계가 한 증거 번들에 고정됨 | `EVIDENCE_READY`, `APPROVED`, `REJECTED`, `EXPIRED`, `OPEN` | 증거 검토 가능 상태일 뿐 승인/기능 활성화 효력 없음 |
| `APPROVED` | 범위가 명시된 결정 기록과 요구 acceptance/운영 증거가 동일 fingerprint로 확인됨 | `APPROVED`, `CLOSED`, `REJECTED`, `EXPIRED`, `OPEN` | 승인된 action·source·market·기간 scope에만 결정 효력이 있으며 downstream gate 활성화를 자동 의미하지 않음 |
| `CLOSED` | 승인 결정의 해당 범위에서 수용 fixture·코드 gate·복구 증거까지 확인됨 | `CLOSED`, `EXPIRED`, `OPEN` | 해당 결정 범위의 종결만 의미하며 전체 제품 readiness 의미 아님 |
| `REJECTED` | owner가 근거·위험을 기록하고 요청 범위를 거절 | `REJECTED`, `OPEN` | 거절 범위는 차단 유지 |
| `EXPIRED` | 유효기간 종료 또는 재검토 trigger가 발생했으나 재승인 전 | `EXPIRED`, `OPEN` | 영향 scope를 즉시 suppress 또는 기존 정책의 제한 fallback 적용 |

각 transition은 append-only decision record로 남긴다. 최소 필드는 `decisionId`, `decisionRevision`, `from/to`, `scope`, `ownerRole`, 실제 승인자 식별자/역할, `evidenceBundleId`와 hash, 적용할 acceptance run ID/hash, 승인값 및 단위, effective/expiry 시각, 재검토 trigger, 영향을 받는 gate·consumer, 이전 revision, 사유 및 독립 검토 결과다. 미적용/부분 승인도 동일 record에 범위와 제외 범위를 적고, 미승인 scope에는 이전의 가장 제한적인 동작을 유지한다. 결정 본문에 편집 가능한 최신 링크만 남기지 않고 당시 snapshot hash와 불변 artifact 위치를 함께 보존한다.

Evidence bundle은 승인 전에 고정되며 최소한 다음을 가진다: (1) 결정 질문과 정확한 in-scope/out-of-scope action, (2) primary source URL/product/endpoint/field, 조회일시·유효구간·원문 또는 허용된 증거의 hash 및 권리 상태, (3) 표본 선정 쿼리·층화·분모·누락/제외 사유, (4) versioned fixture와 기대 결과, (5) 실행 코드/설정 및 의존 decision fingerprint, (6) 실패·경계 사례와 알려진 미확인 사항, (7) 결과 report와 독립 reviewer 기록. 권리 미승인 본문을 증거 bundle에 복제하지 않으며 허용된 metadata/locator/hash로 대체한다. 접근 불가능한 source는 “확인되지 않음”으로 남겨야 하며 통과로 간주하지 않는다.

`APPROVED` 또는 `ACTIVE` 승격의 평가 순서는 다음과 같다: **범위 명료성 → source/권리 유효성 → 분모 완전성 → fixture/acceptance 실행 → 독립 검토 및 이견 처리 → owner 기록 → 영향을 받는 각 gate의 적용·복구 확인**. 여러 결정이 같은 기능에 걸리면 모든 upstream fingerprint가 하나의 release evidence manifest에서 맞아야 한다. 예를 들어 사용자 watchlist 직접 매칭은 master/identity와 event attribution, publication rights, snapshot API/UI, 개인정보/운영 security가 각각 유효해야 한다. 한 결정을 승인했다고 다른 decision ID를 닫거나 전체 사용자 기능을 열지 않는다.

자동 만료 또는 재개 trigger 후보는 terms/product license 변경, 공식 API schema/field 의미 변경, source/master identifier 재사용·분류변경, cap/fx/freshness policy 입력·기준시각 변경, pagination/quota·coverage SLO 위반, taxonomy/prompt/normalizer/schema 버전 변경, DB migration/importer/consumer 변경, cursor key compromise/rotation 및 privacy incident, deletion/restore failure, fixture 분모 변경 또는 독립 reviewer의 재현 실패다. trigger 감지 시 영향 mapping에 등록된 gate만 우선 억제하고, 범위를 판별할 수 없으면 부모 결정의 전체 scope를 제한한다. 원인 해소와 새 bundle의 재승인 전에는 기존 approval을 복원하지 않는다.

결정 dashboard/report는 “닫힌 개수”를 성공 지표로 사용하지 않는다. `OPEN/DEFERRED/EXPIRED/REOPENED`와 차단 중인 gate, 증거 age/유효기간, 필수 evidence 누락, owner 부재, downstream 영향을 함께 보여준다. `APPROVED`와 실제 `ACTIVE`를 구분하고, 하나라도 `OPEN`인 채 전체 기능을 설계 승인하거나 배포할 수 없다는 상위 규칙을 유지한다. 수용 fixture에는 오래된 승인, scope가 좁은 부분 승인, upstream decision 변경, source가 bundle 고정 직후 수정됨, 권리상 원문 artifact 미저장, reviewer 불일치, acceptance run과 승인 hash 불일치, 자동 만료, incident 후 재개, 여러 downstream gate 중 하나만 재검증된 경우를 포함한다.

현재 decision register는 기존과 동일하게 전부 `OPEN`이다. 본 lifecycle 제안은 상태 이관, owner 지정, 증거 수집·승인 실행, 신규 API/DB/schema 구현을 수행하지 않았다. 후속 회차는 먼저 owner가 명시된 P1 권리 evidence bundle의 최소 fixture 분모를 구체화하되, 법무/데이터 책임자의 결정 전에는 어떤 action도 승인 상태로 올리지 않는다.

| 운영 실패/이상 | 자동 감지 신호 | fail-closed 행동 | 복구/재개 조건 |
|---|---|---|---|
| source pagination 누락/변동 | page_no/count mismatch, row sum≠`total_count`, 누락/중복 receipt, pass별 receipt+metadata hash set 변경 | `PAGE_ENUMERATION_COMPLETE` 차단. `NON_SNAPSHOT_PAGINATION`을 유지하고 window=`PARTIAL/INCONSISTENT`; repeated pass만으로 snapshot complete를 선언하지 않음 | 겹치는 구간 재조회 후 안정 집합은 `OBSERVED_STABLE`로만 기록. 계속 변하면 승인된 reconciliation window로 이월 |
| DART API quota/권한 코드 | HTTP 상태와 무관하게 payload `status=020/010/011/012/100/101/800` 검사 | failureClass를 quota/auth/request/maintenance로 분리하고 enumerationStatus는 처리한 page 수에 따라 FAILED/PARTIAL. 어떤 코드도 valid empty로 처리하지 않음 | quota 다음 허용 window 또는 자격/요청 수정 후 새 run; 원 status/message를 감사 |
| 문서 hash/attachment 변경 | 같은 source document key에서 새 content hash 또는 공식 replacement marker | 새 immutable revision과 impacted claim/date queue 생성; 기존 승인 revision stale fallback 금지 | 영향 claim/date 재분석 및 reviewer decision |
| instrument master/cap stale 또는 identity 변경 | freshness policy 미충족, disabled/type/code crosswalk 변화 | 해당 subject만 suppression; 다중 subject는 다른 eligible subject 유지 | fresh master+cap assertions. identity change는 수동 crosswalk review |
| rights decision 만료/변경 | action 시점의 terms hash/effective range가 승인 snapshot과 다름 | 영향 action 중지. retention/deletion 의무는 lineage를 따라 처리 | 새 action-scoped rights review 및 기존 데이터 보존/삭제 판정 |
| source/provider outage | auth/status/429/5xx, empty-success와 error response 구분; 마지막 successful correction reconciliation의 scope/as-of와 승인 max-age 대조 | current rights/master/cap gate 외 source coverage freshness도 매 요청 재평가. 승인 freshness window 안일 때만 degraded 상태로 prior projection 노출 가능; 초과·정책 미승인·partial이면 active/upcoming 일정 suppress | source 복구 후 idempotent retry, required correction window 재조정, 새 coverage assertion 및 run audit |
| DB projection/import 실패 | source commit/checkpoint/revision/hash 불일치 또는 transaction failure | atomic rollback; stale/forked batch 거부. 공개 projection은 불완전 snapshot 금지 | reconciler dry-run이 0 mismatch를 보이고 승인 commit으로 재적용 |
| 일정 정정/철회 충돌 | competing correction/withdrawal edges, overlapping date assertions | 영향 assertion `SUPPRESSED_EVIDENCE_REVIEW`; 무관한 date/subject만 계속 노출 | 명시적 relation과 reviewer가 합성한 새 approved revision |

위 runbook 항목은 사용자에게 노출되는 이벤트 화면에 구현 세부사항을 옮기지 않고 운영 상태·감사 로그·관리 검토 queue에 적용한다.## 공식 참고 및 저장소 기준

- [OpenDART 오픈API 소개](https://opendart.fss.or.kr/intro/main.do): DART 공시 원문 XML 및 구조화 API 제공 설명.
- [OpenDART 공시검색 `list.json` 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001): `corp_code`, `stock_code`, 날짜 정밀도(`rcept_dt=YYYYMMDD`), `last_reprt_at`, `rm`, 정정/철회 표식과 페이지 계약.
- [OpenDART 고유번호 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019018): 공식 고유번호 파일의 `corp_code`, 법인명, 종목코드, 최근변경일자. 프로젝트의 active `COMMON_STOCK` universe 판정을 대체하지 않는다.
- [OpenDART 기업개황 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019002): `corp_code` 조회의 회사명·종목코드·법인구분 필드. 제출자/공시대상회사 profile이며 사건별 직접 영향 관계를 증명하지 않는다.
- [OpenDART DS003 단일판매·공급계약체결 주요정보 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2020007): `snglpnrsctrt.json`의 독립 structured API surface. 계약 원문 또는 해당 관계기업이 상장 subject임을 포괄적으로 증명하지 않는다.
- [OpenDART 이용약관](https://opendart.fss.or.kr/intro/terms.do): 제10조 호출 허용량 변경 가능, 제16조 서비스/관련 프로그램 저작권 및 미규정 권리의 법령 준용을 확인. 원문 전문 저장/재배포의 포괄 허용으로 해석하지 않으며, 제23조상 공시정보의 정확성·완전성은 제출인 책임이고 금감원이 보장하지 않음.
- [OpenDART 공시서류 원본파일 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003): 공시 원문 파일 API 계약.
- [OpenDART 유상증자 결정 주요사항보고서 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020023): `piicDecsn.json` 필드의 공식 의미. 구조화 값은 원문 전체·정정 이력의 완전성 증명이 아님.
- [OpenDART 유무상증자 결정 주요사항보고서 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020025): `pifricDecsn.json` 및 기준일·교부예정일·상장예정일 등 분리 field 의미.
- [OpenDART 합병 결정 주요사항보고서 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020050): `cmpMgDecsn.json` 구조화 항목의 범위.
- [OpenDART 주식교환·이전 결정 주요사항보고서 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS005&apiId=2020053): `stkExtrDecsn.json`의 기준일·주주명부 폐쇄·반대의사 통지 기간 field 의미.
- [OpenDART 이용약관](https://opendart.fss.or.kr/intro/terms.do): 제10조 호출 허용량 변경 가능, 제16조 서비스/관련 프로그램 저작권 및 미규정 권리의 저작권법·공공데이터법 준용을 확인. 원문 전문 저장/재배포의 포괄 허용으로 해석하지 않음.
- [공공데이터포털 금융감독원_공시정보_공시검색](https://www.data.go.kr/data/3075133/openapi.do): 등록 데이터 상품의 이용허락범위가 출처표시 제1유형으로 표시됨. OpenDART 원문 ZIP/별도 첨부와의 범위 동일성은 증명하지 않음.
- [KRX KIND 오늘의공시](https://kind.krx.co.kr/disclosure/todaydisclosure.do?method=searchTodayDisclosureMain): 거래소 공시 목록 및 공개 RSS 진입점.
- [KRX KIND 상세검색](https://kind.krx.co.kr/disclosure/details.do?method=searchDetailsMain): 시장별 issuer 공시 분류와 별도 시장조치 필터의 관찰 기준. 검색 UI 분류는 versioned API/schema나 완전한 historical source 계약을 뜻하지 않는다.
- [KRX/코스콤 정보이용정책 (문서 표기 시행일 2024-01-01)](https://data.krx.co.kr/inc/datasale/Market%20Data%20Usage%20Polices_ko.pdf?v=20230121_1): 문서 자체가 정보이용계약 일부라고 설명하고, 정보사업자/최종이용사와 외부 제공 option을 구분하며, 웹 조회 제공의 가공·저장·재분배 수단 제한을 명시한다. 이는 provider/product/action 범위를 확인해야 하는 근거다. 실제 최신 적용본·가격상품·최종 사용자 scope는 체결된 계약과 담당자 확인이 필요하며, 이 문서만으로 특정 서비스의 허용 여부를 단정하지 않는다.
- [KRX 공식 지수 방법론 공개 경로](https://global.krx.co.kr/contents/GLB/02/0205/0205020300/GLB0205020300.jsp): 각 comparator index의 산출방법론을 확인하는 공식 출판 경로. 실제 분석에서는 index별 방법론 문서·revision·구성종목 as-of를 별도 저장/검토해야 하며 페이지 존재만으로 특정 과거 시점 구성 또는 사용권한을 증명하지 않는다.
- [KRX KIND 전환청구권 행사 공시 예시](https://kind.krx.co.kr/external/2026/06/19/000691/20260619000912/70109.htm), [신주인수권 행사 공시 예시 A](https://kind.krx.co.kr/external/2026/04/10/000336/20260410000790/70114.htm), [신주인수권 행사 공시 예시 B](https://kind.krx.co.kr/external/2026/03/20/001157/20260320002400/70114.htm), [교환청구권 행사 공시 예시](https://kind.krx.co.kr/external/2026/03/12/001839/20260312000513/70119.htm): 행사 주식수·회차·가격·일별 내역·잔액·예정 상장일 field shape의 공식 공개 사례. 2026-11-04 열람한 세 CB/BW receipt 모두 누계에서 기 신고수량을 제외하지만, 발행주식 총수의 금번 행사 포함 여부는 receipt마다 달랐고 BW끼리도 서로 다른 qualifier가 관찰됐다. KIND 검색 전수/고정 machine schema나 종목 family 전체의 qualifier 분포가 아니라 개별 filing examples다.
- [KRX 유가증권시장 공시·상장 업무해설서](https://kind.krx.co.kr/external/dst/reference/11635/%EC%9C%A0%EA%B0%80%EC%A6%9D%EA%B6%8C%EC%8B%9C%EC%9E%A5%20%EA%B3%B5%EC%8B%9C_%EC%83%81%EC%9E%A5%20%EC%97%85%EB%AC%B4%ED%95%B4%EC%84%A4%EC%84%9C.pdf): 자기주식 대상 EB 발행/교부와 제3자 주식 대상 EB의 별도 공시 고려사항. [KRX 추가상장 업무 해설서](https://kind.krx.co.kr/external/dst/reference/10827/%EC%9C%A0%EA%B0%80%EC%A6%9D%EA%B6%8C%EC%8B%9C%EC%9E%A5%20%EA%B3%B5%EC%8B%9C_%EC%83%81%EC%9E%A5%20%EC%97%85%EB%AC%B4%ED%95%B4%EC%84%A4%EC%84%9C.pdf): 전환청구·BW 행사 관련 추가상장 신청 및 현금납입/대용납입 증빙의 업무 기준.
- [IFRS IAS 32 Financial Instruments: Presentation](https://www.ifrs.org/issued-standards/list-of-standards/ias-32-financial-instruments-presentation/): 발행자 관점에서 복합 금융상품의 부채·자본 분류와 전환 시 부채요소 제거/자본 인식을 분리하는 국제 기준 설명. 프로젝트의 한국채택기준 적용/구체 장부금액 판단으로 직접 대체하지 않고, 공시된 현금 receipt와 비현금 전환 효과를 제품에서 혼동하지 않게 하는 개념 근거로만 사용.
- [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html): content hash 재현을 위한 deterministic JSON serialization. 이 규격은 문자열 Unicode를 정규화하지 않고 원 값대로 보존한다.
- [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339.html): 인터넷 timestamp의 숫자 UTC offset 표기 규격. local calendar date나 source zone 추정 근거로 사용하지 않는다.
- [PostgreSQL Date/Time Types](https://www.postgresql.org/docs/17/datatype-datetime.html): `timestamp with time zone`은 입력 offset으로 UTC 정규화되고 출력 때 현재 session timezone으로 변환되며 원래 timezone이 보존되지 않으므로 source local value/zone을 별도 기록한다.
- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) 및 [SET TRANSACTION](https://www.postgresql.org/docs/current/sql-set-transaction.html): REPEATABLE READ의 transaction snapshot 및 read-only transaction의 쓰기 금지 규칙을 따른다.
- 저장소: `AGENTS.md`, `docs/architecture/market-impact-events-design.md`, `docs/architecture/market-event-calendar-design.md`, `docs/architecture/unified-disclosure-rss-ingestion-design.md`, `docs/architecture/daily-disclosure-feed-design.md`, `docs/architecture/instrument-universe-sync.md`, `db/migration/V163__market_impact_events.sql`, `db/migration/V130__investment_calendar_events.sql`, `db/migration/V151__ensure_investment_calendar_events.sql`, `scripts/import-market-impact-events.mjs`.






