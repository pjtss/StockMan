# 미국 기업 분석 문서

미국 거래소 상장 기업과 SEC 공시를 중심으로 한 분석 결과를 모은다. 외국 기업이 미국 거래소에 상장되어 있거나 분석 근거가 SEC 제출서류인 경우도 이 범위에 포함한다.

## 누적 기업 분석

- [2026년 미국 보통주 희석·자금조달 위험 원문 검토 결과](./us-2026-dilution-verified-findings.md): SEC 공시 및 후속 자료를 대조한 46개 종목의 진행 분석. 조사 기준일은 문서 본문을 확인한다.

## 운영 시장 데이터 조회

- [미국 보통주 시총 1억 달러 이하 최신 일봉·상장주수 (2026-10-24)](../../operations/us-common-stocks-under-100m-daily-shares-20261024.md): 운영 read-only API 전체 유니버스 조회 결과 1,271종목, 일봉 거래일·시총 계산·주식수 관측시각 및 조회 누락/한계를 기록.

## SEC filing 원문 기록

- [미국 $100M 이하 후보 발행주식·시총 후속 대조 (2026-10-23)](./us-under100m-capitalization-followup-20261023.md): SAFX 상한 이탈 추정, WFF·OMH 완료 발행, VVOS 조건부 전환주를 SEC 원문으로 재대조.

- [미국 소형주 RVOL 후보 63개 최근 1개월 SEC 공시·일봉 분석 (2026-10-23)](../../../reports/sec-edgar-analysis/cohorts/us-under100m-rvol2-2026-09-23-to-10-23/README.md): SEC 제출 196건, 종목별 filing 분석, 일봉 기술요약/마스터 메타데이터와 티커별 별도 90봉 JSON 색인.

- [SEC EDGAR 분석 인덱스](../../../reports/sec-edgar-analysis/README.md): 일별·cohort·CIK별 회사 기록과 accession별 원문 분석. 이 기록소가 filing 단위 상세 분석의 원본이며 이 인덱스에는 복제하지 않는다.
- [SEC 분석 기록 관리 기준](../../operations/sec-edgar-analysis-records.md): CIK/티커 alias, 날짜·시각, accession 링크 및 분석 문서 구조.

## 조사 절차 및 기준

- [미국 보통주 희석 위험 조사 진행 기록](../../operations/us-2026-dilution-review-request.md)
- [미국 보통주 SEC filing accession 색인](../../operations/us-2026-dilution-sec-filing-index.md)
- [미국장 이벤트 분석 표준](../../operations/us-market-event-analysis-standard.md)

새 기업 분석은 이 디렉터리에 저장하고 본 인덱스에 등록한다. SEC filing 하나의 분석은 기존 accession 기록소에 보존한 뒤 회사·일별 인덱스를 갱신한다.
