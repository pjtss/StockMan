# SEC 공시 상세 요약 표준

## 목적과 적용 범위

SEC EDGAR 공시를 상세 요약할 때마다 이 문서의 절차와 첨부된 v1 산출물 계약을 적용한다. 이 기준은 SEC 원문에 근거한 사실 추출, 거래·희석 구조 확인, 위험과 촉매의 균형 잡힌 해석, 재현 가능한 한국어 요약을 위한 것이다. 공시 제출만으로 거래 완료, 현금 유입, 주가 방향을 단정하지 않는다.

기존 프로젝트 지침이 우선한다. 특히 RSS 호재 보고서는 현재 Codex 대화 모델이 직접 분석하고 API key 기반 OpenAI 호출이나 다른 LLM provider를 쓰지 않는다. 이 표준은 해당 책임을 자동 분류기나 외부 분석기로 넘기지 않는다. 첨부 원본의 기술 지표 용어는 프로젝트의 이동평균 규칙에 맞춰 일반 이동평균은 EMA로 해석한다. 일반 SMA를 사용하거나 보고하지 않는다. 실제 거래 판단에는 검증된 최신 시세가 별도로 필요하며, 미제공 시 시세 기반 필드는 미확인으로 둔다.

## 관리 파일

버전 고정 원본은 [`references/sec-filing-detail-summary/v1/`](../references/sec-filing-detail-summary/v1/)에 보존한다.

| 파일 | 역할 |
|---|---|
| `README_SEC_v1.md` | v1 전체 방법론 및 필드 의미 |
| `sec_filing_extraction_prompt_v1.md` | 공시별 분석 지시문 |
| `sec_filing_template_v1.json` | 공시당 전체 JSON 템플릿 |
| `array_item_templates_v1.json` | 반복 거래·증권·근거 배열의 항목 템플릿 |
| `sec_filing_schema_v1.json` | JSON Schema Draft 2020-12 계약 |
| `validate_sec_report_v1.py` | 구조 및 고위험 일관성 검증기 |

버전 파일은 과거 결과의 재현을 위해 변경하지 않는다. 기준을 바꿀 때는 새 버전을 추가하고 이 문서의 링크와 변경 내역을 갱신한다. 프로젝트별 데이터 수집·Codex 분석 경계와 공식 SEC API 기준은 [`SEC Ticker 공시 수집·Codex 분석 설계`](../architecture/sec-ticker-disclosure-analysis-design.md) 및 [`SEC EDGAR 공식 API 참고 문서`](../sec-edgar-official-reference.md)를 함께 따른다.

## 매번 적용할 절차

1. 공시 식별자(CIK, accession, Form, 제출일, accepted timestamp)를 확인한다. accepted timestamp를 filing date, period of report, underlying event date와 혼동하지 않고 ET/UTC/KST로 일관되게 기록한다.
2. SEC filing index에서 주 문서와 모든 Exhibit를 열거한다. 사건에 관련된 계약·보도자료·워런트·정관·증권신고서 문서를 직접 확인한다. Index 또는 RSS 제목만으로 상세 분석을 완료 처리하지 않는다.
3. 필요한 과거·후속 공시를 연결해 동일 시설/시리즈/거래의 변경과 현재 상태를 확인한다. 최신 공시는 현재 이벤트를, 과거 공시는 조건·잔액의 문맥을 뒷받침하도록 출처 날짜와 accession을 남긴다. 서로 다른 프로그램, 기간, 주식 클래스, split basis의 수치를 합산하지 않는다.
4. 제공된 고정 템플릿을 복제해 공시당 JSON 객체 하나를 작성한다. 객체 키는 추가·삭제·변경하지 않는다. 반복 항목은 지정된 배열 항목 템플릿을 그대로 사용하고, 확인된 항목이 없을 때만 배열을 비운다.
5. 공시에서 확인되지 않은 값은 `null`로 둔다. 0, `false`, 빈 문자열은 실제로 그 값이 확인된 경우에만 쓴다. 중요 `null`에는 지정된 `null_reasons` 코드를 단다. 문서 접근 실패는 부재의 증거가 아니다.
6. 중요 사실과 숫자마다 `evidence`를 연결한다. 원문 URL, accession, Exhibit/section/page, 25단어 미만의 짧은 정확 인용, 기준일을 기록한다. 계산값은 공식 및 입력 JSON Pointer를 기록한다.
7. 발표, 계약, 제출, 효력, 가격확정, 일부 집행, 완료, 종료, 철회를 구분한다. 공모·ATM 한도는 실제 조달이 아니며, 등록 재판매는 발행회사 현금 유입이 아니다. 워런트 발행은 행사 완료가 아니다.
8. ATM, shelf, 공모, resale, warrant, convertible, equity line, 역분할, listing compliance 등 이벤트 유형별 누락 점검은 v1 README와 프롬프트를 따른다. 희석·잔여 한도는 같은 클래스와 기준일의 확인된 값만으로 계산한다. 조건·제한을 완전히 확인할 수 없으면 추정 계산을 만들지 않는다.
9. 시세·거래량·기술 지표는 SEC 출처가 아니다. 신뢰할 수 있는 외부 호가가 제공되고 사용된 경우 출처와 시각을 별도로 밝힌다. 그렇지 않으면 관련 필드를 `null`로 둔다. 프로젝트 이동평균은 EMA이며, 지표가 미확인이면 매매 진입 가능 판정을 하지 않는다.
10. `validate_sec_report_v1.py`로 JSON을 검증한다. 검증을 실행하지 못했으면 통과로 표시하지 않는다. 검증 실패 시 `quality.final_quality_gate_passed=false`와 오류를 기록한다.
11. 결과를 제시할 때는 (A) 표준 JSON 전체, (B) 한국어 핵심 요약 표(접수시각, 이벤트/단계, 금액·가격, 현금 유입, 발행·희석, 긍정·부정 근거, 미확인·한계, 매매 자격), (C) 공식 원문 링크와 근거 순으로 제공한다. 짧은 인용 외의 분석은 자기 말로 요약한다.

## 품질·판정 원칙

- 문서 접근 범위가 불완전하거나 중요 Exhibit가 누락되면 분석을 완전하다고 표시하지 않는다.
- 모든 주요 주장을 원문 또는 명시한 계산 근거에 연결하고, 충돌하는 공시는 충돌과 적용 기준일을 기록한다.
- 확정 사실, 회사가 안내한 향후 일정, 레지스트리 추정일, 제3자 추정일을 구분한다. 일정만으로 호재 판정을 하지 않는다.
- 호재와 악재를 함께 평가하고 상장유지, 유동성, 자금조달, 소송·규제, 희석 위험 및 반대 근거를 누락하지 않는다.
- 원문에 없는 승인확률, TAM, 매출, 현금 런웨이, 주가 수익률을 만들지 않는다. 주가 방향과 거래 결과를 보장하지 않는다.
- JSON Schema 통과는 형식 검증이지 사실의 진실성을 보증하지 않는다. 근거 검토와 문서 커버리지는 별도로 확인한다.

## 공식 기준과 업데이트

SEC 데이터 수집은 [EDGAR API 공식 문서](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [EDGAR 데이터 접근 안내](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data), [SEC Webmaster FAQ](https://www.sec.gov/about/webmaster-frequently-asked-questions)를 따른다. SEC 정책이 바뀌면 이 저장소의 공식 참조 문서와 이 지침을 함께 갱신한다. 템플릿 및 스키마 자체는 사용자 승인 없이 이 운영 문서의 설명과 다르게 임의 수정하지 않는다.

## 변경 이력

- 2026-10-14: 사용자 제공 SEC 상세 분석 v1 문서를 버전 고정 자산으로 등록하고, 매번 적용할 프로젝트 운영 기준으로 연결했다.
