# SEC Company Facts 저장 명세

공식 기준: [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)

## 원본 필드 보존

- `entityName`
- `cik`
- taxonomy
- concept
- unit
- `val`
- `accn`
- `fy`
- `fp`
- `form`
- `filed`
- `frame`
- `start`
- `end`

## 정규화 원칙

- `instant` 데이터와 `duration` 데이터를 구분한다.
- `start`·`end`가 없는 instant 데이터는 `period_end`만 사용한다.
- `frame`은 보조적인 비교 기준으로 저장하고, 실제 기간은 start/end를 우선한다.
- 회사별 custom taxonomy는 표준 비교 데이터와 별도로 보존한다.
- 동일 concept라도 단위가 다르면 별도 행으로 저장한다.

## 중복키

```text
market, code, taxonomy, concept, unit,
period_start, period_end, form, accn, filed
```
