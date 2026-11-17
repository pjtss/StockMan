# SEC EDGAR 공식 문서 기준

확인일: 2026-08-29

## 공식 출처

- [EDGAR Application Programming Interfaces](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [SEC Developer Resources](https://www.sec.gov/about/developer-resources)
- [SEC EDGAR API Overview](https://www.sec.gov/file/api-overview)

## 공식 데이터 API

```text
https://data.sec.gov/submissions/CIK##########.json
https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
https://data.sec.gov/api/xbrl/companyconcept/CIK##########/{taxonomy}/{concept}.json
https://data.sec.gov/api/xbrl/frames/{taxonomy}/{concept}/{unit}/{frame}.json
```

SEC 공식 문서에 따르면 `data.sec.gov`의 submissions 및 XBRL 데이터 API는 API 키 없이 사용할 수 있다. 자동화 요청은 SEC의 접근 정책과 식별 가능한 User-Agent를 준수해야 한다.

## 프로젝트 적용 범위

- CIK·티커·거래소 식별자 매핑
- `submissions` 기반 신규 제출 감지
- `companyfacts` 기반 XBRL 재무 사실 수집
- 10-K·10-Q·20-F·40-F 등 보고서 유형 저장
- XBRL taxonomy·concept·unit·기간·제출일 보존
