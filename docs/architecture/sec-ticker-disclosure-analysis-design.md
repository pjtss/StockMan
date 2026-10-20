# SEC Ticker 공시 수집·Codex 분석 설계

## 목적

사용자가 지정한 여러 TICKER의 SEC EDGAR 공시를 수집하고, 실제 FORM 본문을 Codex가 직접 분석한다. 수집기는 투자 판단을 하지 않으며, 분석기는 SEC 네트워크 수집을 수행하지 않는다.

## 모듈 경계(SRP)

| 책임 | 모듈 | 입력 | 출력 |
|---|---|---|---|
| 티커 매핑·거래소 검증 | `lib/sec-company-ticker.ts`, `lib/sec-ticker-watch.ts` | TICKER 목록 | CIK·기업명·거래소 대상 |
| 제출 메타데이터 수집 | `lib/sec-submissions.ts` | CIK | 최근 및 `filings.files` 전체 제출 목록 |
| 제출 메타데이터 저장 | `lib/sec-edgar-repository.ts` | 제출 목록 | `sec_companies`, `sec_submissions`, `sec_filing_events` |
| 원문 문서 해석·수집 | `lib/sec-primary-document.ts`, `lib/sec-raw-document.ts` | 제출 URL·FORM | index HTML, primary HTML, primary text |
| 원문 저장 | `lib/source-payload-archive.ts` | 원문 스냅샷 | `sec_filing_documents` |
| Codex 분석 계약 | 별도 분석 큐/결과 저장 모듈 | 저장된 primary text | 구조화된 분석 결과 |

## 수집 단계

1. 사용자가 입력한 TICKER를 대문자 정규화한다.
2. SEC 공식 ticker/exchange 매핑에서 CIK 후보를 찾고 NASDAQ·NYSE·AMEX 계열만 허용한다.
3. 여러 TICKER가 동일 CIK를 가리키면 회사 단위로 한 번만 수집한다.
4. 회사별 Submissions JSON의 `recent`와 `files[].name` 추가 JSON을 모두 읽는다.
5. accession number를 멱등 키로 저장한다.
6. 각 제출의 인덱스에서 실제 primary document를 확인한다.
7. FORM HTML과 정규화 본문을 저장한다. 인덱스 HTML만 저장된 경우는 본문 수집 완료로 간주하지 않는다.

## Codex 분석 단계

분석 입력은 저장된 실제 FORM 본문과 다음 메타데이터로 제한한다.

- TICKER·CIK·기업명·거래소
- FORM 유형·제출일·보고기간·accession number
- primary document URL
- primary text

Codex 분석 결과는 다음을 포함한다.

- `decision`: `POSITIVE`, `NEGATIVE`, `MIXED`, `NEUTRAL`, `INSUFFICIENT`
- `catalysts`: 급등 가능 촉매와 근거
- `risks`: 악재·희석·유동성·소송·규제·상장 유지 위험
- `evidence`: FORM 본문의 짧은 근거 인용과 위치
- `confidence`: `HIGH`, `MEDIUM`, `LOW`
- `limitations`: 본문만으로 확인할 수 없는 사항

Codex는 급등을 보장하거나 수익률을 예측하지 않는다. 근거가 본문에 없으면 `INSUFFICIENT` 또는 `limitations`로 남긴다. 자동 키워드 분류기나 별도 LLM API가 Codex 분석을 대체하지 않는다.

## 완료 조건

- 동일 CIK·accession 중복 없이 제출 목록이 저장된다.
- SEC가 제공한 추가 이력 파일까지 수집된다.
- 수집 완료 공시는 `primary_text`가 비어 있지 않다.
- 수집과 분석 모듈이 서로의 네트워크·판단 책임을 침범하지 않는다.
- 분석 결과마다 FORM, accession, 원문 URL, 본문 근거가 연결된다.

## 운영 실행 순서

1. `.env.local`에 식별 가능한 `SEC_USER_AGENT`를 설정하고 `SEC_SYNC_SMALLCAP=true`를 설정한다.
2. 미국 보통주 유니버스와 USD 시가총액 스냅샷을 먼저 갱신한다. 시총·통화가 없거나 오래된 종목은 fail-closed로 제외한다.
3. SEC cron을 실행한다. 회사별 `submissions`의 최근 배열과 `filings.files`를 모두 순회하고 accession 중복을 제거한다.
4. 저장된 제출 중 `sec_filing_documents.primary_text`가 없는 항목만 primary document를 내려받아 저장한다.
5. 본문 저장 성공 항목을 `sec_codex_analysis_queue`의 `PENDING`으로 등록한다.
6. Codex 실행기는 claim한 본문을 직접 읽고 `sec-codex-analysis-contract` 형식으로 결과를 기록한다. 수집기나 자동 키워드 분류기가 결과를 대신 만들지 않는다.
7. 분석 실패는 `FAILED`로 기록하고 최대 3회까지 재시도한다. `PROCESSING` lease는 15분 후 복구한다.

### 완료 판정

실행 결과의 CIK 수·제출 수·본문 수집 성공/실패 수를 확인하고, 실패 accession이 0인지 확인해야 해당 회차를 완료로 본다. `sec_submissions` 행만 존재하고 `sec_filing_documents.primary_text`가 비어 있으면 공시 수집 완료가 아니다.

## 공식 기준

- [SEC EDGAR Application Programming Interfaces](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [SEC Accessing EDGAR Data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data)

## 상세 공시 보고서 표준

상세 SEC 공시 요약은 [SEC 공시 상세 요약 표준](../operations/sec-filing-detail-summary-standard.md)을 항상 따른다. 이 기준은 원문 및 Exhibit 근거, 거래 상태와 희석 구조, 불확실성, 고정 JSON 계약과 검증기를 사용하며 기존 Codex 직접 분석 책임을 유지한다.

