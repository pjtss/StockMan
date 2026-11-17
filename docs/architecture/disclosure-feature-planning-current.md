# 공시 기반 기능 기획 현황 및 기능별 요약

## 문서 상태

- 기준일: 2026-11-04
- 목적: 현재 저장소에 구현된 공시 기능과 문서상 제안·백로그를 구분해 기능별 목적, 입력, 사용자 결과 및 남은 범위를 빠르게 파악한다.
- 원칙: 코드에 연결된 동작만 구현 완료로 기록한다. 상세 설계·fixture·기획 백로그는 구현이나 운영 승인을 뜻하지 않는다.
- 관련 상세 문서: [공시 기반 투자 기획 인덱스](./kr-disclosure-investment-planning-index.md), [국내 보통주 공시 이벤트 구조 설계](./kr-disclosure-event-architecture.md), [일별 공시·RSS 통합 조회 설계](./daily-disclosure-feed-design.md), [SEC 티커 공시 수집·Codex 분석 설계](./sec-ticker-disclosure-analysis-design.md), [국내 공시·RSS 통합 수집 설계](./unified-disclosure-rss-ingestion-design.md)

## 요약

현재 제품에는 국내 DART 호재 알림, SEC EDGAR 공시 수집·분류·Discord 전달, DART/SEC/RSS 저장 데이터 조회·JSON 내보내기, SEC Company Facts 및 미국 소형주 주식 수 자료 갱신이 연결돼 있다. 이 기능들은 서로 다른 실행·저장 경로를 사용한다.

공시 원문과 정정 이력부터 회사·종목 귀속, 근거 검토, 투자 이벤트·일정, issuer 자본·상장 위험 상태, 사용자 구독·푸시까지 하나의 재현 가능한 제품 흐름으로 묶는 설계는 아직 제안 단계다. 공시 기반 투자 기획 인덱스의 결정 항목과 권리·coverage·귀속·저장·보안·운영 전환 gate가 남아 있다.

## 기능 및 기능별 요약

| 기능 | 현재 상태 | 목적 및 사용자 결과 | 주요 구현 경로 | 주요 한계·다음 경계 |
|---|---|---|---|---|
| 국내 DART 금일 호재 피드 | 구현 | 오늘 접수된 DART 항목 중 호재 후보를 KST 기준으로 피드에 표시한다. | `/dart`, `/api/dart`, `lib/alerts.ts`; 예약 동기화는 `/api/cron/sync-filings` → `lib/filing-sync.ts` → DART 자동화 | 일반 피드/API 흐름이다. 공시 기반 이벤트 dossier나 전체 원문 분석 결과와 동일하지 않다. 기능 설정 및 운영 시간 조건으로 제한된다. |

### 다음 제품 개선 — 제목 후보를 근거 검토 흐름으로 분리

현재 `/dart`는 `lib/rss.ts`에서 DART RSS 제목을 분류해 KST 당일 `최강호재`/`호재가능` 후보만 반환한다. 화면 문구는 “DART 제목 기준 호재 후보”이며 본문 사실·투자 영향·종목 귀속이 검증되지 않았음을 사용자에게 알리고, 표 열도 `제목 분류`와 `제목상 회사명`으로 표시한다. 제목 추출 회사명은 issuer가 확인되지 않아 타임라인 조회에 사용하지 않는다. 별표는 이 제목 추출 문자열을 브라우저 `localStorage`의 관심 목록에 저장하며, 공식 종목 확인이나 사건 구독이 아님을 화면에서 알린다. RSS 공개 시각과 RSS 응답 수집 시각은 브라우저 기본 시간대가 아니라 `Asia/Seoul`로 표시한다. 이 정보만으로 원문 사실·투자 방향·issuer 귀속·사건 구독을 입증하지 않는다. `/api/dart`의 GET은 feature/schedule gate 뒤 `getTodayDartBullishFeed()`를 한 번 호출해 RSS를 가져온다. 별도 예약 경로 `/api/cron/sync-filings`가 `runFilingSync()` → `runDartAutomation()`을 소유한다. GET의 upstream fetch는 DB 공시 저장이나 자동화 run 기록과 다르며, 이 feed는 issuer dossier·전체 원문 분석·수집 completeness를 제공하지 않는다.

기획 전환은 `TITLE_TRIAGE_ONLY` 후보 → 권리·coverage가 허용된 사실/반대근거 검토 → 귀속·적격성·review를 통과한 issuer dossier → 사용자가 별도로 선택한 instrument 사건 구독 순이다. 기존 제목 등급을 새 분석상태로 소급 변환하지 않고, `/disclosures` 저장행 조회를 원천 coverage 증명으로 간주하지 않는다. 단계별 선행 결정과 acceptance는 [DART 제목 후보에서 검토형 dossier로의 전환 계약](./kr-disclosure-event-architecture.md#기존-dart-제목-후보에서-검토형-투자-dossier로의-전환)을 따른다. 화면 안내는 1단계의 제한을 설명하며, 이후 근거 검토·귀속·적격성 gate를 구현한 것은 아니다. RSS 상태 카드는 초기 수신 실패, 마지막 성공 응답 이후 갱신 실패, 미확인 수집 시각을 구분한다. GET은 여전히 upstream RSS를 직접 읽으며 dossier나 저장 coverage를 제공하지 않는다.
| DART 자동 수집·알림 | 구현 | OpenDART 목록을 순회해 항목을 정규화·중복 방지하고 자동화 상태 및 알림 경로를 처리한다. | `lib/dart-opendart-client.ts`, `lib/dart-automation.ts`, `lib/dart-automation-store.ts`, `lib/discord-dart.ts` | 기존 DART 자동화의 저장·전송 책임을 통합 공시 저장 모델로 이전한 상태가 아니다. 원천별 권리·coverage 계약은 별도 승인 대상이다. |
| 미국 SEC EDGAR 실시간 수집·이벤트 분류 | 구현 | 설정된 CIK 또는 보통주 소형주 universe의 submissions를 수집하고 filing 문서·이벤트 분석 결과를 관리한다. | `/api/cron/sec-edgar`, `lib/sec-submissions.ts`, `lib/sec-edgar-repository.ts`, `lib/sec-primary-document.ts`, `lib/sec-document-parser.ts` | 자동 분류 결과는 Codex 직접 검토와 구분한다. 수집 성공은 모든 기업·기간의 완전성이나 투자 판단을 보장하지 않는다. |
| SEC Discord 공시 알림 | 구현 | 대기 중인 SEC 이벤트에 대해 원문 문서 분석 결과의 분류·점수·근거 term 및 확인된 자금조달/내부자 항목을 전달한다. | `/api/cron/sec-edgar`, `lib/discord-sec.ts`, SEC event repository | 설정된 webhook·batch·schedule에 종속된다. 별도 Codex 분석 산출물이 제품 자동 판정을 대체하지 않는다. |
| SEC 티커 지정 수집 및 Codex 분석 | 설계/운영 절차 문서화; 전체 흐름 구현 완료로 간주하지 않음 | 선택 종목의 SEC 원문을 수집한 뒤 현재 Codex가 원문 근거를 분석하는 절차를 정의한다. | `docs/architecture/sec-ticker-disclosure-analysis-design.md`, `docs/operations/sec-filing-detail-summary-standard.md` 및 관련 SEC 모듈 | 설계는 수집과 분석 책임을 분리한다. Codex API key/별도 LLM provider 분석으로 바꾸지 않는다. 각 결과는 원문·accession·근거를 연결해야 한다. |
| 일별 DART·SEC·RSS 저장 데이터 조회 | 구현 | 저장된 공시·RSS 항목을 날짜 또는 최근 시간, 출처별로 조회하고 복사·파일 저장한다. | `/disclosures`, `/api/disclosures`, `components/daily-disclosures-page.tsx`, `market_rss_articles`, `filings` | API는 저장 행 조회다. 필터에 출처 이름이 존재한다고 해당 source의 자동 수집·전체 coverage가 보장되지는 않는다. 현재 국내 RSS production 적재 경로는 저장소 코드에서 확인되지 않는다. |
| 국내 RSS 통합 수집 및 공시 coverage | 제안 설계 | KIND·DART·언론 RSS를 출처별 실행·원문 snapshot·정규화 항목·coverage로 조회한다. | `docs/architecture/unified-disclosure-rss-ingestion-design.md`, `docs/architecture/daily-disclosure-feed-design.md` | 국내 RSS 예약 저장 caller/production 경로 미확인. source rights, fetch/persist run 기록, coverage API/UI 및 운영 acceptance가 남아 있다. |
| SEC Company Facts | 구현 | 적격 보통주에 대해 SEC XBRL Company Facts 자료를 예약 갱신한다. | `/api/cron/sec-company-facts`, `lib/sec-company-facts-*` | facts 갱신은 filing 이벤트 분석과 별도 기능이다. 공식 종목 적격성·갱신 일정 gate를 거친다. |
| SEC 소형주 발행주식 수 자료 | 구현 | SEC 근거의 소형주 주식 수 자료를 예약 갱신해 미국 종목 분석 지원 자료로 제공한다. | `/api/cron/sec-smallcap-share-facts`, `lib/sec-smallcap-share-sync.ts` | 해당 자료는 공시 사건·유통주식 수·현재 거래 가능성을 하나로 대체하지 않는다. 자료 범위와 관측 시점을 함께 해석해야 한다. |
| 국내 공시 이벤트·투자 dossier | 제안 설계; 구현/승인 아님 | source 문서 revision, 회사·당사자·영향 issuer·적격 종목, claim/evidence, event/date 및 검토 이력을 추적한다. | `docs/architecture/kr-disclosure-event-architecture.md`, `docs/architecture/kr-disclosure-investment-planning-index.md` | source rights, 귀속/master snapshot, correction/reconciliation, 분류·분석 승인, 저장·보안, 공개 API/UI와 운영 전환 decision이 열려 있다. |
| 공시 기반 투자 기록(thesis journal) | 제안 설계; 구현/승인 아님 | 당시 확인 가능했던 근거·판단·일정·위험과 추후 결과를 revision 및 적격 instrument 기준으로 기록한다. | `docs/architecture/investment-thesis-journal-design.md`, disclosure investment planning index | 사용자 데이터 privacy·권리·outcome 측정·issuer/instrument identity 및 다수 의사결정 gate가 필요하다. |
| Claim별 반대 근거 검토 manifest | 제안 설계; 구현/승인 아님 | 투자 claim의 위험 범주별 확인 상태를 source·query·window·rights·coverage·cutoff 근거와 함께 기록하고, 미검토 범주와 reviewer 권한/독립성 미확정 시 단일 방향 해석을 막는다. | `docs/architecture/kr-disclosure-event-architecture.md#claim별-반대-근거-검토-manifest`, `docs/fixtures/disclosure/disclosure-counterevidence-review.v0.json`, `investment-effect-projection-bridge.v0.json` | reviewer identity/role 증거, independence policy, 범주 적용성 owner 결정, 원천별 query/coverage, bridge dependency의 runtime 전달과 실제 completeness acceptance가 미결이다. |
| 공시 알림 선호·푸시 | 일부 구현, 확장 설계 미완료 | 현재 generic DART push의 수신 선호를 관리하고 지연 도착 시 현재 preference revision을 재검증한다. | `components/push-provider.tsx`, `app/api/push/subscribe/route.ts`, `public/sw.js` | 상세 공시 preview, event 구독, 계정 owner binding, 권리/epoch gate 및 실기기 acceptance는 미구현이다. |

## 현재 사용자가 접하는 대표 경로

1. **국내 호재 공시:** `/dart`에서 당일 DART 호재 후보를 확인한다.
2. **저장 공시·RSS 탐색:** `/disclosures`에서 날짜/최근 시간 및 출처를 선택하고 결과를 JSON으로 복사하거나 저장한다.
3. **미국 공시 자동화:** SEC cron이 submissions·문서·이벤트를 처리하고 설정된 경우 Discord 알림을 전달한다.
4. **관리·운영:** 관리자 기능 설정과 예약 실행 결과를 통해 DART/SEC 자동화 상태를 제어·관찰한다.

## 다음 기획 실행 단위 — identity와 source coverage 조사 packet 분리

R0 저장소 inventory에서는 “어떤 회사/종목인가”를 다루는 identity·eligibility packet과 “어느 source/query/window를 얼마나 확인했는가”를 다루는 source-window coverage packet을 별도 산출물로 기록한다. source caller와 route가 존재한다는 사실은 provider coverage, 종목 귀속, 권리 허가의 증거가 아니다. query 결과 0건도 approved query profile, 기대/관측 page·row 분모, fetch-to-persist reconciliation, correction watermark가 닫히기 전에는 `NOT_FOUND_IN_SCOPE`로 올리지 않는다.

coverage packet의 필수 scope, 분모, run 연결, 저장 조정, stale/reopen trigger와 `KR-RECONCILIATION-01` gate는 [상세 source-window coverage 설계](./kr-disclosure-event-architecture.md#source-window-coverage-packet-필수-분모와-연결)를 따른다. 두 packet의 설계는 제안 상태이며 현재 `/api/disclosures` 또는 cron이 이 계약을 구현했다는 뜻은 아니다.

## 우선 기획 경계

- 상세 우선순위 및 열린 결정은 [기획 인덱스](./kr-disclosure-investment-planning-index.md)의 P0–P7을 기준으로 한다. 이는 승인·일정·구현 완료 선언이 아니다.
- 통합 조회의 우선 제품 문제는 “저장된 결과가 없음”과 “원천 수집 실패/미설정/부분 적재”를 구분하는 coverage 및 시간 provenance다.
- 국내 투자 dossier의 선행 조건은 source rights, 공식 master 기반 issuer/instrument 귀속, correction/reconciliation 및 근거 lineage다.
- 실제 SEC/DART 피드 자동화, Codex 분석, 저장 공시 조회는 각자 현재 계약을 유지하며 통합 설계가 구현될 때 명시적인 cutover 승인 없이 중복 알림이나 데이터 경로를 만들지 않는다.
- 매매 자동 실행·수익 보장·일정만으로 방향을 판정하는 기능은 목표 범위에 포함하지 않는다.

## 미개발 기획 목록

아래 항목은 상세 설계와 acceptance fixture가 존재하더라도 제품 기능으로 구현·승인된 상태가 아니다. fixture 통과나 문서 검사는 런타임 구현, 데이터 권리 승인, 배포 승인을 뜻하지 않는다. 진행 순서는 기획 인덱스의 P0–P7에 맞춘 의존 순서이며 일정 약속이 아니다.

| 단계 | 미개발 기능/기획 | 계획된 결과 | 선행 조건 및 현재 상태 |
|---|---|---|---|
| P1 | 공식 출처 권리·필드 범위 manifest | DART/KIND/SEC 등 source·제품·endpoint·field별로 fetch, parse, 저장, 파생, 인용, 화면/API, push/Discord, 보존·삭제 권한과 출처 표시 조건을 추적한다. | `KR-DART-RIGHTS-01`, `KR-MARKET-DATA-RIGHTS-01` 등 owner 결정이 열려 있다. OpenDART API 가이드나 공개 접근 가능성만으로 제품 이용권을 확정하지 않는다. |
| P2 | 시점 기준 issuer·공시 당사자·종목 귀속 | 제출 회사, 본문상 계약/거래 당사자, 직접 영향을 받는 issuer, 종목/instrument를 서로 다른 역할과 근거로 연결하고 당시 공식 master·보통주 분류·시총 적격성을 재현한다. | 역사적 master snapshot/alias, 다자 공시 attribution, `COMMON_STOCK` 및 시총 신선도 승인 기준이 미확정이다. 불명확한 경우 자동 귀속·노출은 보류하는 설계다. |
| P3 | 수집 coverage·누락 검증·late arrival 및 정정 조정 | source/window별 기대·관측 페이지와 건수, fetch/persist 상태, watermark, 중복·지연·정정 분모를 reconciliation manifest로 기록해 빈 결과와 실패를 구분한다. | 현재 `/api/disclosures`는 저장 행을 조회하지만 source coverage를 증명하지 않는다. `KR-RECONCILIATION-01` 및 source별 기준·분모 승인이 열려 있다. |

R2에서 identity·eligibility packet과 source-window coverage packet은 별도로 제출한다. source-window coverage packet의 필수 scope, page/row 분모, run 연결, fetch-to-persist 조정, correction watermark 및 reopen trigger는 [상세 packet 규격](./kr-disclosure-event-architecture.md#source-window-coverage-packet-필수-분모와-연결)에 연결한다. 이는 현재 제품 API가 해당 evidence를 저장한다는 뜻이 아니다.
| P4 | 공시 사건·일정 및 근거 검토 dossier | immutable source/document revision에서 사실 claim·반대 근거·분석·검토를 연결하고 발생 사실, 회사 확정 일정, 공식 추정일, 제3자 추정 및 취소/완료 상태를 구별한다. | 분류 taxonomy, 문서·권리 lineage, 독립 reviewer 기준과 분석 재현 정책이 승인되지 않았다. 일정 존재만으로 호재 판정이나 방향 점수를 만들지 않는다. |
| P4 | issuer 자본·전환증권 상태 조정 | 발행/유통 주식수, 전환증권·워런트·조달 tranche 및 효력·만기·조건을 기준시점과 공식 근거로 연결해 base state와 변동을 구분한다. | 현재 저장소의 개별 SEC 자료/분석 기능을 통합 roll-forward로 간주할 수 없다. 잔액 기준, 중복 조정, 희석 산식과 coverage는 `KR-CAPITAL-RECONCILIATION-01` 승인 전 미확정이다. |
| P4 | issuer 재무·감사·법원·거래소 위험 타임라인 | 재무/감사 신호, 법원 절차, 거래소 통지·상장 상태·실제 거래 결과를 서로 추론하지 않고 각 권위 source와 유효 시점으로 관리한다. | `KR-ISSUER-RISK-STATUS-01` 및 source별 사건·상태 전이 evidence/acceptance가 열려 있다. 한 위험 신호를 상장폐지나 거래중단의 확정 사실로 바꾸지 않는다. |
| P4 | 촉매와 실제 시장 영향 검증 | 이미 발생한 결과, 확정 공지, primary completion 추정, 제3자 예상 일정을 분리하고 실제 가격 반응은 관측 구간·가격 출처·표본·시간대 기준으로 별도 제시한다. | event-study 사전등록 정책과 공식/비공식 데이터 경계가 미승인이다. 일정만으로 호재를 판정하거나 이벤트가 주가 방향을 보장한다고 표현하지 않는다. |
| P5 | 통합 저장·정정 lineage·legacy 전환 | source snapshot, 문서 revision/hash, claim/event revision, delivery/exposure를 append-only로 보존하고 기존 `filings`·RSS·SEC 테이블 소비자를 확인한 뒤 안전하게 병행·전환한다. | 실제 환경 schema drift, 외부 writer/consumer 분모, retention·권리, backup/restore와 rollback 증거가 선행돼야 한다. destructive migration 및 무승인 cutover는 차단된다. |
| P5 | 운영 보안·review 권한·감사 | 최소 권한의 reviewer/actor, mutation 권한, CSRF, 감사 이력, source 문서·민감 payload 보존/삭제 경계를 정한다. | 현재 관리자 세션은 공유 password 세션이며 reviewer identity/role 증명과 proposed review workflow의 구현은 확인되지 않았다. security owner 결정과 배포 ingress 증거가 필요하다. |
| P6 | 공개 issuer dossier API와 화면 일관성 | 권리·coverage·귀속·보통주/시총 gate를 통과한 단일 revision snapshot을 issuer별로 공개하고 cursor, 날짜 정밀도, 미확인/비공개 이유 및 근거 링크를 UI와 같은 계약으로 제공한다. | 현재 `/api/disclosures`는 dossier API가 아니다. 새 public GET은 결정·권리·cursor 보안, API 문서/route inventory 및 공개 읽기 감사 승인 전에는 설계 제안이다. 기존 API 호환성과 external consumer inventory도 필요하다. |
| P6 | 개인 투자 thesis journal | 사용자가 가설·근거/반대 claim·조건·검토 horizon을 저장하고 당시 snapshot을 고정해 사후 결과 및 늦은 근거를 별도 revision으로 검토한다. | `KR-PERSONAL-THESIS-UX-01` 결정이 열려 있다. 계정/사용자 소유, 개인정보·export/delete, opt-in, outcome 기준, ticker/venue epoch 귀속과 자동 추천 금지 gate가 필요하다. |
| P6 | 사건별 구독·정정 전달 및 push 개인정보 UX | 사용자 관심/명시적 사건 구독을 일반 source 선호와 분리하고, recipient×channel별 발송·노출·정정 상태 및 상세 preview 정책을 관리한다. | 현재 generic DART push 일부만 구현돼 있다. event 구독, owner binding, delivery receipt/retraction, correction reconciliation, DETAILED preview와 실기기 QA는 미구현이다. |
| P7 | shadow 운영·canary·rollback | 승인된 gold set·분모·SLO·독립 리뷰로 기존 경로와 새 경로를 shadow 비교한 뒤 제한 범위 canary와 되돌리기를 수행한다. | `KR-SHADOW-SLO-01`, `KR-END-TO-END-ACCEPTANCE-01`가 열려 있다. 표본·오차 허용치·기간·중단 조건·rollback 담당 승인 전 운영 전환은 HOLD다. |

### 개발 전환 기준

1. 먼저 P1 권리 범위와 P2 종목/issuer 귀속을 승인한다. 이 gate가 닫히기 전에는 파생 분석을 공개할 수 있는 범위를 확정하지 않는다.
2. P3 source별 수집 분모·정정·지연 조정 기준을 운영 증거로 검증한다. 저장된 행만으로 complete coverage를 선언하지 않는다.
3. P4 사건·자본·issuer 위험 및 분석 기능은 독립된 근거와 reviewer acceptance를 갖춘다. 미확인 상태와 반대 증거를 삭제하거나 자동 점수로 축약하지 않는다.
4. P5 실제 DB/consumer/writer inventory, backup/restore 및 보안 계약이 확인된 뒤 별도 migration/cutover 설계를 승인한다.
5. P6 신규 API/UI·개인 journal·사건 구독을 공개/사용자 데이터 기능으로 만들기 전에 각 decision 및 권리/보안 경계를 닫는다.
6. P7은 이전 단계와 사전 승인된 측정·rollback 기준이 모두 준비된 경우에만 별도 운영 승인 대상으로 올린다.

각 단계의 authoritative decision ID와 구체 acceptance는 [기획 인덱스](./kr-disclosure-investment-planning-index.md)와 [국내 공시 이벤트 구조 설계](./kr-disclosure-event-architecture.md)를 따른다. 이 목록은 구현 범위나 일정의 승인이 아니라 미개발 범위의 요약이다.

## 공식 기준

- [OpenDART 공시검색 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001) — DART 목록·페이지네이션·접수번호 및 정정 표지 해석의 기준.
- [OpenDART 이용약관](https://opendart.fss.or.kr/intro/terms.do) — 서비스 이용 조건. 개별 제품의 파생 저장·표시·배포 권리는 별도 범위로 검토한다.
- [SEC EDGAR API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) 및 [SEC EDGAR 데이터 접근 안내](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data) — SEC 제출·기업 데이터의 공식 접근 안내.

## 확인 기록

- 현재 코드 기준 대조: `/dart`, `/api/dart`, `/api/cron/sync-filings`, `/api/cron/sec-edgar`, `/api/cron/sec-company-facts`, `/api/cron/sec-smallcap-share-facts`, `/disclosures`, `/api/disclosures` 및 연결 모듈.
- 국내 통합 RSS 설계의 source caller/저장 경계는 상세 문서의 현행 코드 대조를 따랐다. 운영 DB나 배포 환경의 별도 collector 유무는 이 문서 작업에서 확인하지 않았다.
