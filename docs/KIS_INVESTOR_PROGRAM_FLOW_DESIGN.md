# KIS 외인·기관·프로그램 수급 설계

## 결론

KIS Open API는 국내 종목별 외국인·기관·개인 수급과 프로그램 매매를 제공한다. 단, 수급 주체의 개인 식별정보가 아니라 시장 집계값이다. 외국인·기관의 장중 값은 추정치이며, 확정값은 장 종료 후 제공된다.

## API 매핑

| 용도 | REST 경로 | TR ID | 기준 |
|---|---|---|---|
| 종목별 투자자 확정 수급 | `/uapi/domestic-stock/v1/quotations/inquire-investor` | `FHKST01010900` | 장 종료 후 |
| 종목별 외인·기관 추정 | `/uapi/domestic-stock/v1/quotations/investor-trend-estimate` | `HHPTJ04160200` | 장중 누계 |
| 종목별 프로그램 체결 | `/uapi/domestic-stock/v1/quotations/program-trade-by-stock` | 공식 문서의 최신 TR ID 확인 | 체결 기준 |
| 종목별 프로그램 일별 | `/uapi/domestic-stock/v1/quotations/program-trade-by-stock-daily` | 공식 문서의 최신 TR ID 확인 | 일별 |
| 시장 전체 프로그램 시간 | `/uapi/domestic-stock/v1/quotations/comp-program-trade-today` | 공식 문서의 최신 TR ID 확인 | 장중 최근 30분 |
| 시장 전체 프로그램 일별 | `/uapi/domestic-stock/v1/quotations/comp-program-trade-daily` | `FHPPG04600001` | 일별 |

`lib/kis-investor-flow.ts`는 종목 단위 REST API의 공통 호출·상태 정규화를 담당한다. 자격증명과 토큰은 기존 `kis-token.ts` 및 `kis-request-framework.ts`를 사용한다.

수집 성공 결과는 `kis_signal_snapshots`에 `market + code + signal_type + observed_at` 기준으로 원본 payload와 상태를 저장한다. `kis_cache`는 화면 복원용 요약 캐시로 유지하고, 분석·감사에는 스냅샷 테이블을 사용한다.

앱 호출 경로는 `GET /api/kis/investor-flow?code=005930&mode=investor`이다. `mode`는 `investor`(장마감 확정), `estimate`(장중 추정), `program`(종목별 프로그램 체결) 중 하나이며, 응답에는 `source`, `market`, `code`, `flowStatus`, `collectedAt`, `rows`, `diagnostics`를 포함한다.

## 판정 규칙

- 순매수 수량 또는 금액이 양수이면 `BUYING`, 음수이면 `SELLING`, 0이면 `NEUTRAL`로 표시한다.
- 숫자 필드가 없거나 파싱할 수 없으면 방향을 판정하지 않고 `UNAVAILABLE`로 표시한다.
- 장중 추정치는 `ESTIMATED`, 장 마감 후 투자자 API는 `CONFIRMED`로 구분한다.
- API 응답의 `rt_cd`, `msg_cd`, `msg1`, HTTP 상태를 보존한다.
- 응답의 `output`, `output1`, `output2` 중 배열인 데이터만 정규화하며, 응답이 객체·빈 값인 경우에도 예외를 발생시키지 않는다.
- 수급 데이터가 없거나 갱신시각이 기준시각보다 오래되면 매수로 추정하지 않고 `UNAVAILABLE`로 표시한다.
- 전체 종목 스캔은 거래량순위 결과를 유니버스로 사용하되, 각 종목에 대해 투자자·프로그램 API를 호출하고 PostgreSQL에 원본과 수집시각을 캐시한다. API 호출 제한 때문에 직렬화·캐시 TTL·장중/장마감 배치를 적용한다.

## 현재 코드와의 차이

기존 `fetchNetBuying()` 및 `fetchProgramTrading()`은 거래량순위 API 결과에 외인·기관·프로그램 수치를 합성하고 있었다. 실제 운영 수급 화면에 연결할 때는 이 합성값을 제거하고 본 모듈의 응답 필드를 매핑해야 한다.

## 공식 근거

- [KIS Developers API 문서](https://apiportal.koreainvestment.com/apiservice?keyword=%ED%95%9C%EA%B5%AD%ED%88%AC%EC%9E%90%EC%A6%9D%EA%B6%8C)
- [공식 주식현재가 투자자 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_investor/inquire_investor.py)
- [공식 외인·기관 추정 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/investor_trend_estimate/investor_trend_estimate.py)
- [공식 프로그램매매 일별 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/comp_program_trade_daily/comp_program_trade_daily.py)
