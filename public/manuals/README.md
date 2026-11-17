# StockMan 문서 인덱스

이 프로젝트의 운영 기준 문서는 기능 코드와 분리해 `docs/` 아래에서 관리합니다.
문서를 새로 추가할 때는 아래 분류 중 하나를 선택하고, 이 인덱스에 링크를 추가합니다.

## 문서 분류

| 분류 | 목적 | 위치 |
|---|---|---|
| 아키텍처 | 모듈 경계, 데이터 흐름, 저장 구조 | [`architecture/`](./architecture/) |
| 개발 | 코딩·테스트·마이그레이션 규칙 | [`development/`](./development/) |
| 운영 | 배포, 스케줄, 장애 대응, 디버깅 | [`operations/`](./operations/) |
| 보고서 시각화 | 독립형 HTML 데이터 보고서의 구성·스타일·접근성 기준 | [`operations/html-data-report-style-guide.md`](./operations/html-data-report-style-guide.md) |
| 기업 분석 | 대한민국·미국 주식 기업별 분석 결과 | [`company-analysis/`](./company-analysis/README.md) |
| 외부 문서 | KIS·SEC·DART 등 공식 문서 요약 | [`references/`](./references/) |
| 기능 설계 | 특정 기능의 동작·필터·알림 계약 | 루트 `docs/*.md` |
| 변경 기록 | 날짜별 구현·운영 변경 내역 | [`../Development.md`](../Development.md), [`../DEVELOPMENT_LOG.md`](../DEVELOPMENT_LOG.md) |

## 시작점

- SEC·RSS 장기 이벤트 ledger의 코드 현황·확장 계획: [현재 분석](./stockman-events-current-analysis.md) · [아키텍처](./stockman-events-architecture.md) · [데이터 모델](./stockman-events-data-model.md) · [API](./stockman-events-api.md) · [운영](./stockman-events-operations.md).

- **LLM이 기능별 문서를 찾는 단일 진입점**: [문서 카탈로그 JSON](../public/document-catalog.json) · [문서 검색 GET](../app/api/public/document-catalog/route.ts) · [LLM 안내](../public/llms.txt). 카탈로그에서 필요한 문서만 선택해 읽는다. 배포된 문서 원문은 `/manuals/...`에서 제공한다.
- 공시 투자 T0 수치검토의 유상증자 후속 검증 벡터: [`follow-up-equity-raise.v0.json`](./fixtures/disclosure/follow-up-equity-raise.v0.json) · CB/BW/EB 조건 검증: [`convertible-securities.v0.json`](./fixtures/disclosure/convertible-securities.v0.json) · 실제 행사/교환·상장 결과 source-shape 검증: [`convertible-outcome-evidence.v0.json`](./fixtures/disclosure/convertible-outcome-evidence.v0.json) · 현금·부채·신주·유통공급 효과 분리: [`capital-impact-separation.v0.json`](./fixtures/disclosure/capital-impact-separation.v0.json) · 자금조달 일정·조건부 scenario 검증: [`financing-timeline-scenarios.v0.json`](./fixtures/disclosure/financing-timeline-scenarios.v0.json) · OpenDART DS005 CB/BW/EB 공식 field acceptance: [`ds005-financing-field-acceptance.v0.json`](./fixtures/disclosure/ds005-financing-field-acceptance.v0.json) · 실제 공시 reviewer adjudication package 계약: [`financing-adjudication-package.v0.json`](./fixtures/disclosure/financing-adjudication-package.v0.json) · claim→review→effect→publication 추적 경계: [`financing-claim-review-trace.v0.json`](./fixtures/disclosure/financing-claim-review-trace.v0.json) · stable consumer identity와 immutable revision 경계: [`consumer-identity-revision.v0.json`](./fixtures/disclosure/consumer-identity-revision.v0.json) · JCS byte/hash 및 generation FK acceptance runner 계약: [`consumer-identity-executable-acceptance.v0.json`](./fixtures/disclosure/consumer-identity-executable-acceptance.v0.json) · 단계별 acceptance report/격리 실행 경계: [`consumer-identity-acceptance-report.v0.json`](./fixtures/disclosure/consumer-identity-acceptance-report.v0.json)
- 공시 근거 claim→수치 계산→투자 해석→사용자 dossier의 단계별 dependency/hash/state transition 통합 acceptance: [`investment-effect-projection-bridge.v0.json`](./fixtures/disclosure/investment-effect-projection-bridge.v0.json)
- 투자 claim별 반대 근거 분모, reviewer governance, investment-effect bridge dependency 연결 acceptance: [DCR-01–18](./fixtures/disclosure/disclosure-counterevidence-review.v0.json) · [설계](./architecture/kr-disclosure-event-architecture.md#claim별-반대-근거-검토-manifest)
- action 권리 revision이 기존 claim·계산·해석·공개 승인 및 저장/알림 descendant에 전파되는 범위: [`investment-rights-action-propagation.v0.json`](./fixtures/disclosure/investment-rights-action-propagation.v0.json)
- IRAP 시나리오별 owner/evidence/차단 gate를 decision register/lifecycle과 정확히 대조하는 기준: 같은 [`investment-rights-action-propagation.v0.json`](./fixtures/disclosure/investment-rights-action-propagation.v0.json) 및 [`decision-register-lifecycle.v0.json`](./fixtures/disclosure/decision-register-lifecycle.v0.json)
- 사용자 개인 검토를 공시 event/claim revision에 pin하면서 공개 projection과 격리하는 제안: [`personal-disclosure-review-note.v0.json`](./fixtures/disclosure/personal-disclosure-review-note.v0.json)
- 사용자가 직접 기록한 투자 가설·반대 근거·사전 검토 horizon을 공시 revision에 연결하는 별도 journal 기획: [`investment-thesis-journal-design.md`](./architecture/investment-thesis-journal-design.md) · [합성 수용 fixture](./fixtures/disclosure/investment-thesis-journal.v0.json)
- 사용자 thesis의 review trigger를 typed predicate·rights·coverage·cutoff에 결박하고, 관측 상태를 투자 판단·매매 지시와 분리하는 합성 수용 계약: [ITHR-01–14](./fixtures/disclosure/investment-thesis-review-trigger.v0.json) · [설계](./architecture/investment-thesis-journal-design.md#사용자-검토-trigger의-평가-경계)
- OpenDART/KIND 원천 권리 결정을 action·purpose·channel·보존 등급별로 격리하고 scope 충돌·불완전 descendant 분모는 fail-closed하는 정책/remediation contract: [`rights-action-decision.v0.json`](./fixtures/disclosure/rights-action-decision.v0.json) · 정정 후 채널별 알림 reconciliation: [`correction-delivery-reconciliation.v0.json`](./fixtures/disclosure/correction-delivery-reconciliation.v0.json)
- decision register의 합성 status·revision·scope·acceptance 경계: [`decision-register-lifecycle.v0.json`](./fixtures/disclosure/decision-register-lifecycle.v0.json)
- 의사결정의 ID·owner·scope·기본 동작·수용 증거 canonical source와 검색용 catalog 항목: [`decision-register.v0.json`](./fixtures/disclosure/decision-register.v0.json) · 상태는 공개 catalog에서 제외한 controlled evidence ledger의 최신 유효 revision에서 계산
- decision ledger 전체 파일 재작성·prefix replay를 막기 위한 미승인 외부 서명 checkpoint 설계와 DLCP-01~08 수용 분모: [`decision-ledger-checkpoint.v0.json`](./fixtures/disclosure/decision-ledger-checkpoint.v0.json) · 실제 알고리즘, KMS, 저장소, 주기와 key ownership은 `KR-OPERATIONAL-SECURITY-01` 승인 전 미결
- 여러 공시의 CB/BW/EB·증자/감자·전환/상장 movement와 정기보고서 자본 snapshot을 issuer/series/as-of 축으로 조정하는 미승인 설계 및 중복 방지 수용 분모: [`issuer-capital-state-reconciliation.v0.json`](./fixtures/disclosure/issuer-capital-state-reconciliation.v0.json) · `KR-CAPITAL-RECONCILIATION-01` owner 승인 전 공개/운영 차단
- issuer 재무·감사 신호·법원 절차·KRX 매매/상장 상태를 혼동 없이 연결하는 미승인 timeline fixture: [`issuer-risk-status-timeline.v0.json`](./fixtures/disclosure/issuer-risk-status-timeline.v0.json) · `KR-ISSUER-RISK-STATUS-01` 결정 전 현재 상태/해소 결론 공개 차단
- 공시 dossier에 issuer 자본 상태와 위험/상장 상태를 분리 표시하고 issuer/instrument 적용범위·명시적 context 라벨·동일 snapshot을 요구하는 synthetic contract: [`disclosure-investment-dossier-projection.v0.json`](./fixtures/disclosure/disclosure-investment-dossier-projection.v0.json) · DIDP-13~24 보강
- 기존 공시 이벤트 v1의 덮어쓰기·과거 revision 재현 한계와 vNext 전환 기준: [`market-impact-events-design.md`](./architecture/market-impact-events-design.md) · [`legacy-event-revision-transition.v0.json`](./fixtures/disclosure/legacy-event-revision-transition.v0.json)
- 승인된 공시 claim의 정정·철회·첨부 교체·반복 정정 lineage와 영향 consumer를 바로잡는 설계 fixture: [`fact-correction-remediation.v0.json`](./fixtures/disclosure/fact-correction-remediation.v0.json)
- 공시 후 시장반응 기술통계의 event time·봉 가격 관측시각·수정 revision·조정기준과 provider 권리 revision, 재실행·shadow gate를 연결하는 snapshot 기획: [`event-price-observation.v0.json`](./fixtures/disclosure/event-price-observation.v0.json) · `KR-MARKET-DATA-RIGHTS-01` / `KR-EVENT-STUDY-POLICY-01`
- 확정·추정 일정과 event lifecycle을 분리하는 합성 수용 fixture: [`event-date-lifecycle.v0.json`](./fixtures/disclosure/event-date-lifecycle.v0.json)
- 일정 reminder opt-in·revision fencing·정밀도·중복 방지·푸시 미리보기 개인정보 경계 합성 fixture: [`event-schedule-notification.v0.json`](./fixtures/disclosure/event-schedule-notification.v0.json)
- 관심종목 relevance overlay, 사건별 explicit 구독, provider attempt·정정 lineage 및 target hash/retention fixture: [`disclosure-user-event-subscription.v0.json`](./fixtures/disclosure/disclosure-user-event-subscription.v0.json)
- 푸시 카테고리 선호·OS 권한·device privacy mode·테스트 전송 범위 acceptance: [`push-preference-lockscreen.v0.json`](./fixtures/disclosure/push-preference-lockscreen.v0.json)
- 테스트 푸시 authorization·CSRF·owner target·recipient cap·배포 ingress 증거 fixture: [`push-test-delivery-safety.v0.json`](./fixtures/disclosure/push-test-delivery-safety.v0.json)
- 최종 push preview DTO·service worker 렌더링·OS/browser device QA privacy dataflow fixture: [`push-privacy-dataflow.v0.json`](./fixtures/disclosure/push-privacy-dataflow.v0.json)
- 푸시 UI source label·preference·formatter·실제 production producer call-site 정합성 inventory: [`push-producer-catalog.v0.json`](./fixtures/disclosure/push-producer-catalog.v0.json)
- 법인·증권 instrument·시점별 market/code alias·보통주/cap 적격성 crosswalk: [`instrument-identity-temporal-crosswalk.v0.json`](./fixtures/disclosure/instrument-identity-temporal-crosswalk.v0.json)
- 외부 읽기 API 매뉴얼·OpenAPI·AI discovery: [`api/README.md`](./api/README.md) · [배포 매뉴얼](../public/api-reference.md) · [OpenAPI JSON](../public/openapi.json) · [llms.txt](../public/llms.txt)

- 독립형 HTML 데이터 보고서 스타일·구성 기준: [`operations/html-data-report-style-guide.md`](./operations/html-data-report-style-guide.md)

- 기업 분석 전체 인덱스: [`company-analysis/`](./company-analysis/README.md)
- 다국가 뉴스 링크 분석 아카이브: [`company-analysis/rss/`](./company-analysis/rss/README.md) · 날짜별 결과는 사용자 분석 기록이며 공개 API/운영 RSS 보고서와 별도 관리
- 미국 소형주 RVOL 후보 63개 최근 1개월 SEC 공시·일봉 분석 (2026-10-23): [`분석·종목 색인`](../reports/sec-edgar-analysis/cohorts/us-under100m-rvol2-2026-09-23-to-10-23/README.md)
- 대한민국 기업 분석: [`company-analysis/kr/`](./company-analysis/kr/README.md)
- 미국 기업 분석: [`company-analysis/us/`](./company-analysis/us/README.md)
- 미국 후보 주식수·시총 후속 대조 (2026-10-23): [`company-analysis/us/us-under100m-capitalization-followup-20261023.md`](./company-analysis/us/us-under100m-capitalization-followup-20261023.md)
- 미국 보통주 시총 USD 1억 이하·최신 거래일 RVOL≥2 결과 (2026-10-20): [`operations/us-common-stocks-under-100m-rvol2-20261020.md`](./operations/us-common-stocks-under-100m-rvol2-20261020.md)
- 미국 보통주 시총 USD 1억 이하, 20일 평균 거래대금/시총 ≥1% 및 10일 저점 상회 (2026-10-23): [기준·전체 결과](./operations/us-common-stocks-10day-low-turnover1pct-20261024.md) · [CSV](./operations/us-common-stocks-10day-low-turnover1pct-20261024.csv) · [JSON](./operations/us-common-stocks-10day-low-turnover1pct-20261024.json)
- 사용자 제공 미국 티커 648개 시총 대비 20일 평균 거래대금 내림차순 (2026-10-24): [순위 보고서](./operations/us-common-stocks-user-tickers-turnover-rank-20261024.md) · [CSV](./operations/us-common-stocks-user-tickers-turnover-rank-20261024.csv)
- 미국 보통주 $1 이하 현재 quote 및 SEC 기업사실 (2026-10-24 KST): [474개 SEC 확인 현재 표](./operations/us-common-stocks-under-1-live-20261024-current.md) · [CSV](./operations/us-common-stocks-under-1-live-20261024-current.csv) · [설계안·급등주 단타 필드](./operations/us-common-stocks-under-1-sec-design.md) · [보류표](./operations/us-common-stocks-under-1-live-unresolved-20261024-current.csv) · [가격 미확인표](./operations/us-common-stocks-under-1-live-price-unavailable-20261024-current.csv) · [SEC상 OTC/상장폐지 제외표](./operations/us-common-stocks-under-1-live-excluded-sec-status-20261024-current.csv) · [종목별 SEC lock-up 검토표](./operations/us-common-stocks-under-1-live-lockup-review-20261024.csv). 가격·30일 범위만 사용자 허용 시세 원천이며 SEC 기업사실은 SEC 근거만 사용한다.
- 미국 보통주 시총 USD 1,000만 미만 일봉 스냅샷 (2026-10-20): [기준·재사용 안내](./operations/us-common-stocks-under-10m-daily-20261020.md) · [종목별 일봉 JSON](../scratch/us-common-stocks-under-10m-daily-20261020.json)
- 미국 보통주 시총 USD 1,000만 이하, 구간 최저가 대비 20% 이하 반등 목록 (2026-10-20): [기준 및 결과](./operations/us-common-stocks-under-10m-rising-20pct-20261020.md) · [종목별 JSON](../scratch/us-common-stocks-under-10m-rising-20pct-20261020.json)
- 미국 보통주 시총 USD 1,000만 이하, 직전 20거래일 최저가 대비 20% 이하 반등 목록 (2026-10-20): [기준 및 결과](./operations/us-common-stocks-under-10m-prior20-low-rise-20pct-20261020.md) · [종목별 JSON](../scratch/us-common-stocks-under-10m-prior20-low-rise-20pct-20261020.json)
- 국내 보통주 시총 1조 원 이하·최신 RVOL≥2 운영 기준: [추출 runbook](./operations/kr-common-stock-rvol-under-1t-runbook.md) · [2026-10-21 결과 88종목](./operations/kr-rvol-2-marketcap-1t-20261021.md)
- 국내 보통주 업종별 거래대금 및 최신 거래일 상위 5개 업종 (2026-10-23): [전체 표·산출 기준](./operations/kr-common-industry-turnover-kis-20261001-20261023.md)
- 국내 세부산업별 종목 거래대금 TOP 5 (2026-09-22~2026-10-23): [대화형 HTML 보고서](../reports/kr-standard-industry-stock-top5-20260922-20261023.html) · [순위 CSV](../reports/kr-common-standard-industry-stock-top5-kis-20260922-20261023.csv) · [종목별 일별 거래대금·조회시각 CSV](../reports/kr-common-standard-industry-stock-top5-daily-kis-20260922-20261023.csv)

- 미국 보통주 시총 USD 1억 이하 최근 10개 일봉 저점 이후 VWAP ±5% 및 RVOL ≥ 1 후보 (2026-10-19): [`operations/us-common-stocks-recent-low-vwap-20261019.md`](./operations/us-common-stocks-recent-low-vwap-20261019.md) · [CSV](./operations/us-common-stocks-recent-low-vwap-20261019.csv) · [상세 JSON](./operations/us-common-stocks-recent-low-vwap-20261019.json)
- 미국 보통주 시총 USD 5억 이하 중 최근 10거래일 최저 종가 목록 (2026-10-16): [`operations/us-common-stock-10day-close-low-20261016.md`](./operations/us-common-stock-10day-close-low-20261016.md)
- 미국 보통주 시총 USD 5억 이하 중 최근 10거래일 저가 대비 최신 종가 반등 목록 (2026-10-16): [`operations/us-common-stock-10day-low-rebound-20261016.md`](./operations/us-common-stock-10day-low-rebound-20261016.md)

- 시장 전체·업종별 거래대금 흐름 기능 기획안: [`architecture/market-money-flow-feature-plan.md`](./architecture/market-money-flow-feature-plan.md)
- 현재 시스템 기준서: [`architecture/current-system-reference.md`](./architecture/current-system-reference.md)
- 설계 문서 생명주기·갱신 기준과 템플릿: [`architecture/design-management.md`](./architecture/design-management.md) · [`architecture/design-template.md`](./architecture/design-template.md)
- 미국 보통주 OBV 다이버전스 공개 GET API 구현 설계와 운영 개선 과제: [`architecture/us-obv-divergence-api-design.md`](./architecture/us-obv-divergence-api-design.md)
- 미국 상승률 TOP100 UI 데이터 품질·부분 응답·원천 시각·누락 방지 계약: [`US_TOP_RISING_UI_DATA_QUALITY.md`](./US_TOP_RISING_UI_DATA_QUALITY.md)

- 상세 시스템 모듈 카탈로그·SRP 책임 지도: [`architecture/system-module-catalog.md`](./architecture/system-module-catalog.md)
- 노트북 로컬 미국 RSS LLM 호재 분석·Discord 알림 설계안: [`architecture/local-us-rss-llm-alert-design.md`](./architecture/local-us-rss-llm-alert-design.md)

- 코드 구조: [`architecture/code-structure.md`](./architecture/code-structure.md)
- 문서 관리·SRP 기준: [`architecture/documentation-and-srp.md`](./architecture/documentation-and-srp.md)
- 일별 공시·RSS 통합 조회 설계: [`architecture/daily-disclosure-feed-design.md`](./architecture/daily-disclosure-feed-design.md)
- 국내 공시·RSS 통합 수집 및 ChatGPT 분석 JSON 설계: [`architecture/unified-disclosure-rss-ingestion-design.md`](./architecture/unified-disclosure-rss-ingestion-design.md)
- 일별 공시 조회와 source 수집 coverage를 분리하는 합성 fixture: [`fixtures/disclosure/disclosure-source-coverage.v0.json`](./fixtures/disclosure/disclosure-source-coverage.v0.json) · DSC-01~16, manifest 49개 ownership matrix, decision gate, DB drift catalog/writer package, strict-schema DBI-01~10 golden cases
- DB inventory DBI-01~10 golden cases의 표준 구조 정의: [`fixtures/disclosure/schema/database-inventory-golden-case.v0.schema.json`](./fixtures/disclosure/schema/database-inventory-golden-case.v0.schema.json) (JSON Schema Draft-07)
- 일별 공시 KST 기준일·source 시각 정밀도·안정 정렬 합성 fixture: [`fixtures/disclosure/disclosure-feed-time-semantics.v0.json`](./fixtures/disclosure/disclosure-feed-time-semantics.v0.json)
- 국내 보통주 공시 이벤트 구조 설계(검토 중, 구현 승인 아님): [`architecture/kr-disclosure-event-architecture.md`](./architecture/kr-disclosure-event-architecture.md)
- 공시 투자분석 gold-set sampling/adjudication protocol: [ixtures/disclosure/disclosure-investment-gold-set-protocol.v0.json](./fixtures/disclosure/disclosure-investment-gold-set-protocol.v0.json) — filing 단위 sample frame 안에서 event별 party/claim/instrument 분리와 mixed evidence 비합산 사례 DIGSP-01~12
- 공시 기반 투자 기획의 우선순위·의사결정·문서 연결 인덱스: [`architecture/kr-disclosure-investment-planning-index.md`](./architecture/kr-disclosure-investment-planning-index.md)
- 정정·철회 전달·사용자 공시함 revision 및 투자 thesis 영향 전파 합성 fixture: [`fixtures/disclosure/correction-delivery-reconciliation.v0.json`](./fixtures/disclosure/correction-delivery-reconciliation.v0.json)
- 공시 기반 투자 기능의 연속 기획 백로그와 승인 의존 순서: [`architecture/kr-disclosure-event-architecture.md#기획-개선-운영판--2026-11-04`](./architecture/kr-disclosure-event-architecture.md#기획-개선-운영판--2026-11-04)
- 유상증자 계획·이행 follow-up DTO synthetic golden vector v0 (runtime acceptance 아님): [`fixtures/disclosure/follow-up-equity-raise.v0.json`](./fixtures/disclosure/follow-up-equity-raise.v0.json)
- 공시 이벤트 공통 JSON·현재 구현 기반: [`architecture/market-impact-events-design.md`](./architecture/market-impact-events-design.md)
- 데이터베이스·전체 테이블 구조: [`architecture/database-schema.md`](./architecture/database-schema.md)
- 전체 제품·데이터·자동화 구조: [`architecture/project-architecture.md`](./architecture/project-architecture.md)
- 국내·해외 전체 종목 통합 유니버스 동기화 설계: [`architecture/instrument-universe-sync.md`](./architecture/instrument-universe-sync.md)
- 개발 규칙: [`development/conventions.md`](./development/conventions.md)
- 전체 전달 생명주기: [`development/delivery-lifecycle.md`](./development/delivery-lifecycle.md)
- 운영 런북: [`operations/runbook.md`](./operations/runbook.md)
- 공시 이벤트를 ChatGPT 웹에서 분석하고 JSON으로 반영하는 절차: [`operations/market-impact-event-chatgpt-web-runbook.md`](./operations/market-impact-event-chatgpt-web-runbook.md)
- 국내 보통주 일봉 캐시 관리자 로그인·수동 갱신·운영 검증 절차: [`operations/kr-daily-cache-refresh-runbook.md`](./operations/kr-daily-cache-refresh-runbook.md)
- RSS 번역 상태 공개 검수 API: [`operations/market-rss-translation-debug-api.md`](./operations/market-rss-translation-debug-api.md)
- 지속 개선 운영 기준: [`operations/continuous-improvement.md`](./operations/continuous-improvement.md)
- 지속 개선 검토 주기: [`operations/improvement-review.md`](./operations/improvement-review.md)
- 프로젝트 전체 디버깅 구조: [`DEBUGGING_ARCHITECTURE.md`](./DEBUGGING_ARCHITECTURE.md)
- 일·주·월봉 캐시 갱신: [`CANDLE_REFRESH_DESIGN.md`](./CANDLE_REFRESH_DESIGN.md)
- 대화 단축어 조회 기준: [`operations/shortcuts.md`](./operations/shortcuts.md)
- 운영 API 일봉 JSON 스냅샷 단축어(ㄷㅊㅇ5·ㄷㅊㅇ6): [`operations/shortcuts.md`](./operations/shortcuts.md)
- 볼린저밴드 탐지 계약: [`bollinger-band-operations.md`](./bollinger-band-operations.md)
- 관리자 모듈 그룹: [`admin-module-groups.md`](./admin-module-groups.md)
- 외부 공식 문서 인덱스: [`references/README.md`](./references/README.md)
- KIS 종목 마스터 원본 보관소: [`references/kis-instrument-masters/README.md`](./references/kis-instrument-masters/README.md)

## 문서 원칙

1. 현재 동작을 설명하는 문서와 미래 제안 문서를 제목에서 구분합니다.
2. API 경로, 환경변수, DB 테이블명은 코드와 동일한 이름으로 작성합니다.
3. 운영 결과에는 확인 시각과 검증 방법을 함께 기록합니다.
4. 비밀값·토큰·실제 웹훅 URL은 문서에 저장하지 않습니다.
5. 기능 변경 시 관련 문서와 `Development.md`를 같은 변경 세트에서 갱신합니다.
- 운영 서버 기준 미국 시총 USD 1천만 미만 보통주 티커 목록 (2026-10-03): [`operations/us-small-cap-under-10m-20261003.md`](./operations/us-small-cap-under-10m-20261003.md)
- 미국 보통주 $0.10 이하·시가총액 $5억 이하 가격·시총 후보 및 상장주수 결측 기록 (2026-10-15): [`operations/us-common-stocks-under-10c-20261015.md`](./operations/us-common-stocks-under-10c-20261015.md)
- 미국 상장 종목 급등 촉매·리스크 분석용 SEC FORM·ITEM 가이드: [`operations/us-sec-form-item-catalyst-risk-guide.md`](./operations/us-sec-form-item-catalyst-risk-guide.md)
- 미국 상장 종목 워런트·유증·전환증권 희석 위험 조사 Harness: [`operations/us-equity-dilution-risk-harness.md`](./operations/us-equity-dilution-risk-harness.md)
- 티커별 SEC 기업 공시 분석 문서 기준: [`operations/sec-ticker-company-analysis-dossier-standard.md`](./operations/sec-ticker-company-analysis-dossier-standard.md)
- 미국 상승률 TOP100 UI 데이터 품질·부분 응답·원천 시각·누락 방지 계약: [`US_TOP_RISING_UI_DATA_QUALITY.md`](./US_TOP_RISING_UI_DATA_QUALITY.md)
- 미국장 월간 전망 및 이벤트 검토: [`operations/us-market-october-2026-outlook.md`](./operations/us-market-october-2026-outlook.md)
- 2026년 9월 운영 RSS에서 확인된 후속 이벤트: [`../reports/sec-edgar-analysis/daily/2026-09-forward-events.md`](../reports/sec-edgar-analysis/daily/2026-09-forward-events.md)

- 2026-10-15 소형주 급등 후보 262개의 최근 3개월 SEC 공시 요약·coverage: [`reports/sec-edgar-analysis/cohorts/2026-10-15-risers/`](../reports/sec-edgar-analysis/cohorts/2026-10-15-risers/README.md)
- AZTR·AXG·DKI·HODO·SDST·SXTC·TWG 최근 1개월 SEC 공시 핵심 요약 (2026-10-15 기준): [`reports/sec-edgar-analysis/daily/2026-10-15-selected-seven.md`](../reports/sec-edgar-analysis/daily/2026-10-15-selected-seven.md)
- GENK 최근 1개월 SEC 공시 상세 — Roth 주식매입계약·희석 위험 (2026-10-15 기준): [`reports/sec-edgar-analysis/daily/2026-10-15-genk-one-month.md`](../reports/sec-edgar-analysis/daily/2026-10-15-genk-one-month.md)

- 2026-10-15 소형주 급등 후보 262개의 최근 3개월 SEC 공시 요약·coverage: [`reports/sec-edgar-analysis/cohorts/2026-10-15-risers/`](../reports/sec-edgar-analysis/cohorts/2026-10-15-risers/README.md)

- [미사용 기능 후보 조사 (2026-10-20)](operations/unused-feature-candidates-20261020.md)
- [공시 기반 투자 아키텍처 — acceptance 실행 manifest/report 격리 경계 제안](architecture/kr-disclosure-event-architecture.md) · [합성 report fixture](fixtures/disclosure/consumer-identity-acceptance-report.v0.json)
- [공시 정정 이후 채널별 알림 reconciliation 기획 및 합성 수용 fixture](fixtures/disclosure/correction-delivery-reconciliation.v0.json)
- 미국 보통주 $1 이하 현재 quote 및 SEC 기업사실 (2026-10-24 KST): [474개 SEC 확인 현재 표](./operations/us-common-stocks-under-1-live-20261024-current.md) · [CSV](./operations/us-common-stocks-under-1-live-20261024-current.csv) · [SEC-only/단타 필드 설계안](./operations/us-common-stocks-under-1-sec-design.md) · [보류·제외/가격 미확인 및 종목별 lock-up 자료는 현행 표의 참조 링크 확인]. 가격·30일 범위만 사용자 허용 시세 원천이며 SEC 기업사실은 SEC 근거만 사용한다.
- 공시 dossier 공개 조회의 무인증 GET·issuer/instrument 필터·rights/master/cap gate·snapshot/cursor, source별 attribution 및 검색 부재 상태 구분 제안: [`disclosure-dossier-public-read.v0.json`](./fixtures/disclosure/disclosure-dossier-public-read.v0.json) · DPR-01~25, 미승인 synthetic fixture
