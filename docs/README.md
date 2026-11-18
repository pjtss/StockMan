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

- LLM 단일 discovery 경로: [문서 카탈로그](../public/document-catalog.json) · [기능 문서 검색 GET](../app/api/public/document-catalog/route.ts) · [Swagger식 API 메뉴얼 GET](../app/api/public/api-manual/route.ts) · [운영 문서 인덱스](../public/manuals/README.md) · [llms.txt](../public/llms.txt)
- 외부 읽기 API 매뉴얼·OpenAPI·AI discovery: [`api/README.md`](./api/README.md) · [배포 매뉴얼](../public/api-reference.md) · [OpenAPI JSON](../public/openapi.json) · [llms.txt](../public/llms.txt)

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
- 설계 문서 관리 기준과 재사용 템플릿: [`architecture/design-management.md`](./architecture/design-management.md) · [`architecture/design-template.md`](./architecture/design-template.md)
- 미국 보통주 OBV 다이버전스 API: [`설계·운영 개선 과제`](./architecture/us-obv-divergence-api-design.md)
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
- 개인 투자 thesis journal 설계 및 합성 acceptance fixture: [`architecture/investment-thesis-journal-design.md`](./architecture/investment-thesis-journal-design.md) · [`fixtures/disclosure/investment-thesis-journal.v0.json`](./fixtures/disclosure/investment-thesis-journal.v0.json)
- 정정·철회 전달·사용자 공시함 revision 및 투자 thesis 영향 전파 합성 fixture: [`fixtures/disclosure/correction-delivery-reconciliation.v0.json`](./fixtures/disclosure/correction-delivery-reconciliation.v0.json)
- 공시 기반 투자 기능의 연속 기획 백로그와 승인 의존 순서: [`architecture/kr-disclosure-event-architecture.md#기획-개선-운영판--2026-11-04`](./architecture/kr-disclosure-event-architecture.md#기획-개선-운영판--2026-11-04)
- 유상증자 계획·이행 follow-up DTO synthetic golden vector v0 (runtime acceptance 아님): [`fixtures/disclosure/follow-up-equity-raise.v0.json`](./fixtures/disclosure/follow-up-equity-raise.v0.json)
- 공시 이벤트 공통 JSON·현재 구현 기반: [`architecture/market-impact-events-design.md`](./architecture/market-impact-events-design.md)
- 데이터베이스·전체 테이블 구조: [`architecture/database-schema.md`](./architecture/database-schema.md)
- 전체 제품·데이터·자동화 구조: [`architecture/project-architecture.md`](./architecture/project-architecture.md)
- 국내·해외 전체 종목 통합 유니버스 동기화 설계: [`architecture/instrument-universe-sync.md`](./architecture/instrument-universe-sync.md)
- 미국 보통주 산업분류 코드(KIS ICOD 전용) 수집·저장 설계: [`architecture/us-industry-classification-data-design.md`](./architecture/us-industry-classification-data-design.md)
- 개발 규칙: [`development/conventions.md`](./development/conventions.md)
- 전체 전달 생명주기: [`development/delivery-lifecycle.md`](./development/delivery-lifecycle.md)
- 운영 런북: [`operations/runbook.md`](./operations/runbook.md)
- 대화 단축어와 운영 API 일봉 JSON 스냅샷 절차: [`operations/shortcuts.md`](./operations/shortcuts.md)
- RSS 번역 상태 공개 검수 API: [`operations/market-rss-translation-debug-api.md`](./operations/market-rss-translation-debug-api.md)
- 공시 기반 일별 주가 영향 이벤트 JSON·DB·API·작성 가이드 API: [`architecture/market-impact-events-design.md`](./architecture/market-impact-events-design.md)
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

## 이벤트 ledger 작업 기록

- 2026-11-06 — SEC·RSS 영구 이벤트 ledger 및 공개 무인증 이벤트 API 구현 결과는 [현황 분석](./stockman-events-current-analysis.md), [아키텍처](./stockman-events-architecture.md), [데이터 모델](./stockman-events-data-model.md), [API](./stockman-events-api.md), [운영 가이드](./stockman-events-operations.md)에 기록했다.
- 검증: build·typecheck·docs/API/migration audit 및 격리 PostgreSQL idempotency 통과. 전체 Vitest는 worker 종료로 미완료. 운영 배포와 migration은 미실행.
