# 티커별 SEC 기업 공시 분석 문서 기준

## 목적

사용자가 티커를 말하면 회사 식별, 최근 SEC 공시, accession별 분석, 누적 기업 종합을 한 경로에서 찾아 보여준다. 이 구조는 특정 기업에 고정되지 않으며 미국 상장 티커별로 반복 적용한다.

## 저장 구조

```text
reports/sec-edgar-analysis/companies/{10자리 CIK}-{현재티커}/
├─ README.md                         # 티커 인덱스와 분석 진입점
├─ company-analysis.md               # 최신 기준일의 누적 기업 분석
└─ YYYY/MM/DD/{FORM}/{accession}.md  # SEC 제출 1건당 분석
```

- SEC CIK를 기업의 안정적인 키로 사용하고, 현재·과거 티커와 증권 종류를 README에 적는다. 티커가 여러 CIK에 연결되면 임의 선택하지 말고 후보를 분리한다.
- 티커를 SEC의 공식 `company_tickers_exchange.json`에서 CIK로 매핑한 뒤 공식 `data.sec.gov/submissions/CIK{CIK}.json`에서 제출 목록을 가져온다. 목록에 연결된 `filings.files`가 기간에 필요한 이전 이력을 포함하면 함께 읽는다.
- 기본 “최근 3개월” 범위는 요청 기준일에서 달력상 3개월 전부터 기준일까지의 **SEC filingDate**로 정의한다. 기간·기준일·수집시각·원천 응답 상태를 기록한다.
- 회사별 파일 경로 날짜는 SEC `acceptanceDateTime`을 UTC에서 KST로 변환한 날짜다. 문서 본문에는 SEC filingDate, acceptance 시각(ET·UTC·KST), report/event date를 각각 기록하고 서로 혼동하지 않는다.
- Form과 accession이 같은 날 반복되어도 각각 별도 파일을 둔다. Form 이름의 `/`는 경로에서 `-`로 바꾸고, accession은 SEC 표기를 유지한다.

## 공시별 분석

1. 조회 결과의 모든 SEC 제출을 coverage 목록에 넣는다. 정보성·절차성 제출도 빠뜨리지 않고, 해당 공시가 별도 사업 이벤트가 없는 재판매 등록·효력 발생·반복 제출인지 분석한다.
2. SEC filing index, 주 문서, 사건에 필요한 Exhibit와 후속 공시를 확인한다. 8-K 제목·RSS·Submissions 메타데이터만 보고 상세 분석을 완료하지 않는다.
3. 각 accession 문서에 회사/CIK/티커, filingDate, ET·UTC·KST 접수시각, report/event date, Form·Items, SEC 원문 링크, 핵심 사실, 판정, 긍정·부정 근거, 남은 확인 항목을 기록한다.
   - `reportDate`가 없으면 사건일을 원문에서 확인하고, 그것도 특정할 수 없으면 확인 불가로 기록한다.
4. 상태·판정은 `POSITIVE`, `NEGATIVE`, `MIXED`, `NEUTRAL`로 표현한다. 이는 공시 근거를 요약한 정성 판단이며 주가 방향·상승확률·투자 권유가 아니다.
5. 같은 자금조달·임상·상업 사건을 다룬 계약서, 증권신고서, prospectus, closing 8-K, 보도자료는 별도 accession 기록을 보존하되 종합본에서는 사건 하나로 연결한다. 서명·등록·효력·종결·발행·행사를 구분하고 금액이나 주식수를 중복 합산하지 않는다.
6. 승인되지 않은 일정, 목표 등록 수, 전망, 회사가 발표한 운영 지표, SEC 제출로 확정된 결과를 서로 분리한다. 공시에서 확인되지 않은 수치·거래 결과·매출·런웨이는 만들지 않는다.
7. 원문을 읽지 못했거나 SEC 요청이 실패한 공시는 분석 완료로 표시하지 않는다. `분석 보류`와 구체적인 원인을 기록한다.

## 티커 종합 문서

`company-analysis.md`는 기준일마다 갱신하는 단일 진입 문서다. 다음을 포함한다.

- 회사·CIK·티커/증권 종류·검토 기간·SEC 제출 총건수와 Form별 건수
- 핵심 사업·재무·자금조달/희석·상장·임상/규제·상업화 흐름
- 확정된 긍정/부정 사실, 반대 근거, 아직 확인되지 않은 사항
- 기간 내 모든 accession의 날짜·Form·핵심 요약·판정·개별 분석 링크 표
- 중복되는 제출을 하나의 사건으로 연결한 설명과 데이터 한계

회사 종합 문서는 accession별 분석의 링크 가능한 요약본이며, 개별 원문 근거를 대체하지 않는다. 다음 분석 요청에서 티커를 받으면 이 README와 `company-analysis.md`를 먼저 검색하고, 답변의 기준일과 미확인 상태를 함께 제시한다. 오래된 기준일의 보고서를 최신 상태로 가장하지 않는다.

## 품질 확인

- SEC 제출 목록의 조회 범위와 저장한 filing 목록의 건수·Form별 건수를 대조한다.
- 각 accession에 분석 파일 하나가 존재하고, SEC 제출 상세/주 문서 링크가 열리는지 확인한다.
- 날짜 변환, 동일 이벤트 accession 연결, 희석 주식수, 등록 재판매와 신규 발행 구분을 확인한다.
- 한글 UTF-8, 모든 내부 Markdown 링크, 종합 문서에서 개별 분석으로의 왕복 링크를 확인한다.
- 새 문서 구조·커버리지는 `reports/sec-edgar-analysis/README.md`, `docs/company-analysis/us/README.md`, `docs/README.md` 및 `DEVELOPMENT_LOG.md`에서 찾을 수 있게 한다.

## 공식 출처

- SEC [EDGAR Application Programming Interfaces](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- SEC [Accessing EDGAR Data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data)
- 프로젝트의 [SEC 공시 상세 요약 표준](./sec-filing-detail-summary-standard.md) 및 [SEC 제출 기록 관리 기준](./sec-edgar-analysis-records.md)
