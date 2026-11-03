# 미국 소형주 이벤트 자료 관리 기준

## 목적

운영 서버의 미국 종목·뉴스 snapshot과 SEC 공시 자료를 조사 배치별로 보존하고, 확인된 사건만 공통 이벤트 원장에 반영한다. 배치 원본, 공시별 검토 상태, 이벤트 공개 자료는 서로 다른 책임을 가지며 고정 식별자로 연결한다.

## 자료 파일과 책임

| 자료 | 책임 | 기본 식별자 |
| --- | --- | --- |
| `data/us-smallcap-event-review-YYYYMMDD[-bNN].json` | 배치 기준, 운영 종목 snapshot, 뉴스 결과, 종목별 검토 요약 및 직접 확인 이벤트 | `ticker`, `eventId` |
| `data/us-smallcap-filing-review-ledger-YYYYMMDD[-bNN].json` | 배치 대상 issuer별 SEC submissions inventory와 개별 accession의 검토 상태 | `ticker`, `accession` |
| `data/market-impact-events.json` | UI/API에 제공되는 정규 이벤트 원장 | `eventId` |
| `docs/operations/us-smallcap-event-review-YYYYMMDD[-bNN].md` | 수집 범위, 근거 수준, 해석과 한계, 후속 조사 기록 | `ticker`, `accession`, `eventId` |

배치 날짜는 조사 기준일이며 데이터의 최신 시각을 뜻하지 않는다. 각 종목의 운영 시총 관측 시각과 freshness를 그대로 보존한다.

같은 조사일에 여러 100종목 배치를 만들면 날짜 뒤에 `-b02`, `-b03`처럼 2자리 순번을 붙인다. 첫 배치부터 순번을 붙이지 않은 기존 파일명은 호환성을 위해 유지한다. review JSON, accession ledger, 보고서와 validator 명령은 동일한 날짜·순번을 사용하며, 순번은 파일 간 조인이 아니라 파일 식별에만 쓴다. ticker·CIK·accession·eventId는 각 레코드의 관계 식별자로 유지한다.

## 연결 규칙

- issuer는 SEC CIK와 ticker를 보관한다. 공식 종목 마스터에서 active `COMMON_STOCK`임을 확인하고, 시장·통화·시총 기준을 같은 운영 snapshot에서 기록한다. 타입이나 상태를 확인할 수 없으면 제외한다.
- filing은 SEC accession으로 유일하게 식별한다. SEC 공식 submissions에 있는 CIK, form, 접수일 및 accession 경로를 일치시킨다.
- 이벤트는 불변 `eventId`를 사용한다. 검토 이벤트의 `eventId`와 ticker는 정규 원장 및 accession ledger의 연결과 일치해야 한다.
- accession 간 `relatedFilings`는 SEC 원문에서 amendment 관계를 직접 확인한 경우에만 상호 연결한다. 날짜·form 근접성만으로 amendment를 추정하지 않는다.
- 미확인 뉴스나 추정 일정을 정규 이벤트에 올리지 않는다. 일정 상태는 실제 결과, 회사 확정 일정, 공식 추정치, 제3자 추정치가 구별되도록 둔다.

## 검토 상태

- `INVENTORY_ONLY`: 제출 메타데이터만 수집했으며 본문 검토를 뜻하지 않는다.
- `TARGETED_SECTION_REVIEW`: 해당 사건 판단에 필요한 원문 구간을 확인했다. 첨부 exhibit 전체를 읽지 않았다면 보고서에 그 사실을 표시한다.
- 기존 배치에서 쓰는 `FULL_PRIMARY_REVIEW`, `TRIAGE_EXCERPT` 등은 해당 배치 보고서의 정의를 따른다. 상태 이름만으로 다른 수준을 추정하지 않는다.

## 검증과 변경 절차

1. 운영 공개 GET으로 종목 마스터·시총·뉴스를 읽고 수집 시각, 원본 경로, freshness를 저장한다. 운영 API/DB 쓰기를 수행하지 않는다.
2. official SEC ticker/CIK 및 submissions를 대조하고, accession별 본문 확인 여부를 기록한다.
3. 근거를 확인한 이벤트만 canonical 원장에 추가하고 review/ledger 양쪽에서 연결한다.
4. `npm run validate:us-smallcap-event-data:<배치>`로 종목 수, 제출 수, event parity, CIK/accession, 검토 상태 수, 공식 amendment 관계를 확인한다. 동일 날짜 복수 배치는 `YYYYMMDDbNN` 이름의 명령으로 각각 독립 검증한다.
5. `npm run docs:check`가 각 배치 validator를 수행하도록 `package.json`에 등록한다. 새 배치 추가 시 검증 명령도 함께 추가하고 이 문서·보고서·`DEVELOPMENT_LOG.md`를 갱신한다. 날짜 순번 파일도 문서 카탈로그에서 누락되지 않는지 확인한다. 현재 카탈로그는 날짜 형식 파일명을 자동 제외하므로 배치 보고서는 파일명 필터와 본문 기반 탐색 중 어느 경로로 관리되는지 점검하고, 실사용 인덱스에서 도달 가능하게 유지한다.
6. 배포 전에는 project deployment verification이 요구하는 build, full test, runtime smoke 및 audits를 통과시킨다. 커밋과 푸시는 순차 실행하고, 운영 배포 후 public GET으로 배치 이벤트를 재확인한다.

## 정확성·한계

- SEC submissions 전체 수는 filing 본문을 전수 검토했다는 의미가 아니다. inventory와 사건 직접 검토 수를 분리해 보고한다.
- 주식 수는 발행주식 수와 유통주식 수를 구별한다. 공식 수치가 없으면 추정하지 않는다.
- 임상 및 FDA 일정은 확정/추정 상태를 분리한다. 임의의 승인 확률·시장 규모·매출을 만들지 않는다.
- cap snapshot이 stale이거나 조사와 배포 사이에 바뀌었을 수 있다. 이후 배치 선정 때 운영 마스터로 재검증한다.
- 오류가 발견되면 잘못된 자료와 정규 이벤트 양쪽을 수정하고, 원인·영향·감지 방법·검증을 `DEVELOPMENT_LOG.md`에 기록한다.
