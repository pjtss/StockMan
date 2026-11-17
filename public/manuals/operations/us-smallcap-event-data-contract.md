# 미국 소형주 이벤트 검토 데이터 관리 기준

## 목적

미국 보통주 100개 종목의 공시·뉴스 조사 구간, 원문 검토 상태, 이벤트 해석, accession 관계 및 운영 서버 확인값을 추적 가능하게 유지한다. 이 문서는 파일별 역할과 데이터 간 불변조건을 정의하며, 조사 결과를 추가할 때마다 적용한다.

## 관리 파일

| 파일 | 권위 있는 내용 | 갱신 규칙 |
|---|---|---|
| `data/us-smallcap-event-review-20261031.json` | 100개 종목 유니버스, 티커/CIK, 공통 및 종목별 확인 구간, SEC submissions 사본, 운영 공개 GET snapshot, 이벤트 검토 행과 출처 상태 | 개별 종목 이벤트 추가·정정 시 canonical event와 같은 eventId/status/date를 기록한다. 운영 확인값은 GET 시각, instrument 유형/활성 여부, 시총·관측시각, 뉴스 건수, SEC 분류 이벤트 건수와 DB write 여부를 보존한다. |
| `data/us-smallcap-filing-review-ledger-20261031.json` | issuer별 accession, SEC 제출 메타데이터, 원문 검토 상태, eventIds, filing 간 관계, 전체 원장 집계 | 이벤트를 직접 뒷받침하는 SEC accession마다 `eventIds`를 기록한다. 전문을 확인한 accession만 `FULL_PRIMARY_REVIEW`로 올리고, 미검토 제출은 inventory 상태를 유지한다. |
| `data/market-impact-events.json` | 표준 조회용 canonical 이벤트 | SEC 공시·회사 뉴스의 사실, 일정 상태, 방향/확신도, 원문 인용, 위험과 한계를 단일 eventId로 유지한다. 일정 타깃과 발표일은 `eventDateRole`, `datePrecision`, `scheduleWindow`로 분리한다. |
| `docs/operations/us-smallcap-event-review-20261031.md` | 사람이 읽는 범위·배치별 검토 결과와 주요 이벤트 표 | 조사 구간, 누계, 직접 검토 범위, 남은 확인과 데이터 한계를 구조화 JSON과 맞춘다. |
| `DEVELOPMENT_LOG.md` | 작업 단위별 목적, 파일, 검증·미실행 항목, 남은 위험 | 모든 조사/수정 배치마다 원인 또는 발견, 반영, 검증, 커밋·푸시·배포 여부를 기록한다. |

## 관계 및 검토 상태 규칙

1. 같은 SEC 제출물이 여러 이벤트를 뒷받침할 수 있다. 이 경우 filing 행의 `eventIds`에는 각 이벤트 ID를 모두 기록하고 accession-event index는 이벤트마다 관계 행 하나를 둔다.
2. SEC 이벤트의 `sourceId` accession은 동일 issuer의 제출 원장에 있어야 하며 해당 filing의 `eventIds`에 eventId를 포함해야 한다. SEC 원문 URL CIK와 종목 CIK가 달라지는 예외는 `relatedSourceUrls`로 명시하고 그 관계를 설명한다.
3. `reviewedEvents`의 행과 canonical 이벤트는 `eventId`, ticker, event date, status가 같아야 한다. `PRIMARY_SOURCE_REVIEWED`/`FULL_PRIMARY_REVIEW_VERIFIED`는 직접 primary review, `TARGETED_SECTION_REVIEW`는 지정 부분만 확인한 검토다. 전체 발행사 coverage는 이 두 수준을 분리 집계하며, 복구 데이터의 재검증 전에는 `RECOVERED_PENDING_REVALIDATION`을 유지한다.
4. filing ledger와 종목별 `secSubmissions.filings` 사본의 accession 집합, reviewStatus, eventIds 및 filing 관계는 일치해야 한다.
5. 상태별 제출 수, 미국 이벤트 수, 직접 검토 종목 수, 재검증 대기 이벤트/종목 수, accession-event 관계 수는 원시 행에서 재계산해 두 데이터 문서의 요약 집계와 일치시킨다.
6. 발행사 `reviewedEventIds`에는 해당 티커 canonical 이벤트 ID만 둘 수 있다. 직접(primary/full 또는 targeted) 검토 상태인 event row의 accession/source URL은 해당 티커의 CIK·SEC submissions와 일치해야 한다. 발행사 간 문서 링크는 `relatedSourceUrls`로 명시해 검토 source row에 설명 없이 섞지 않는다.
7. 검토 행의 `validationNotes`에 SEC accession을 적으면 같은 issuer submissions, row `sourceIds`, 또는 canonical event의 명시적 related-source 관계 중 하나로 연결돼야 한다. 종목 간 공통 batch 메모 복사로 타 issuer accession/시총을 넣지 않는다.
8. event status는 결과/일정의 진행 상태를 뜻한다. 회사가 공지한 목표일, ClinicalTrials.gov 추정 완료일, 제3자 예상 일정은 서로 출처와 date precision을 분리하고 확정 일정으로 승격하지 않는다.
9. 뉴스/RSS 또는 자동 분류 결과는 후보 발견 근거로만 쓴다. 최종 해석·방향성·수치와 일정은 연결된 SEC 제출 원문, 회사 IR 또는 해당 공식 원문에서 확인한다.

## 반복 검증

이벤트나 filing 원장을 수정할 때 `node scripts/validate-us-smallcap-event-data.mjs`를 실행한다. 이 검증기는 이벤트 필수 필드와 controlled vocabulary, 중복·누락·cross-ticker ID, canonical/review parity, review-row SEC CIK, validation note accession의 issuer ownership, issuer별 filing 사본 parity, eventId별 accession 관계, 양방향 filing amendment 관계 및 모든 요약 집계를 검사한다. 수정한 JSON은 UTF-8로 저장하고 JSON parse를 확인한다. Primary-reviewed coverage와 targeted-section coverage도 분리 집계한다.

운영 데이터 확인은 공개 read-only GET으로 수행하며 DB 변경을 하지 않는다. 조회 결과가 없거나 종목 분류를 확인할 수 없으면 보통주 적격성을 추정하지 않는다. 커밋 또는 푸시는 프로젝트 규칙에 따라 build·test·run을 각각 수행하고 결과가 확인된 뒤에만 진행한다.

## 현재 기준 레코드

- 조사 보고서: [`us-smallcap-event-review-20261031.md`](./us-smallcap-event-review-20261031.md)
- 현재 데이터 검증기: [`../../scripts/validate-us-smallcap-event-data.mjs`](../../scripts/validate-us-smallcap-event-data.mjs)
- 작업 이력: [`../../DEVELOPMENT_LOG.md`](../../DEVELOPMENT_LOG.md)
- 각 종목의 SEC review window는 2025-10-31 포함~2026-11-01 미포함으로 저장되며, operating-server GET snapshot은 별도 시각을 보존한다.

### 운영 수량 불일치 기록

운영 market data의 listed shares와 issuer SEC/IR의 issued-and-outstanding 수량이 다르면 출처와 관측시각을 각각 보존한다. 어느 값도 float 또는 대체 수량으로 간주하지 않고 차이를 해당 이벤트의 limitation 및 배치 보고서에 남긴다. 시장가치가 운영 API에서 제공된 경우 출처·기초 관측시각과 함께 보고하며, 주식수 차이를 reconcile하기 전 독립적으로 검증된 시총이라 표현하지 않는다.
