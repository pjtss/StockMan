# 미국주식 공매도 평가 데이터 출처

## 조회 우선순위

| 데이터 | 1순위 | 2순위 | 없을 때 |
|---|---|---|---|
| 공매도 거래량 | FINRA Short Sale Volume | 없음 | null |
| 공매도 잔고 | FINRA Equity Short Interest | Nasdaq 공개 Short Interest | null |
| 현재가·거래량·거래대금·시가총액 | KIS Open API | 없음 | null |
| Free Float | FMP shares-float | 없음 | null |
| Outstanding Shares | FMP | SEC Company Facts | null |

## SEC fallback 원칙

SEC Company Facts의 `EntityCommonStockSharesOutstanding` 또는
`CommonStockSharesOutstanding` 값은 발행주식수로만 저장합니다. SEC가 모든
기업에 표준화된 free-float 필드를 제공하지 않으므로, 이 값을 `floatShares`로
대체하지 않습니다. 결과에는 `dataType: "OUTSTANDING_SHARES"`를 기록합니다.

티커는 SEC 회사-티커 매핑으로 CIK로 변환하며, 공매도 평가에서는 KIS 시장
(`NAS`, `NYS`, `AMS`)과 SEC 거래소를 함께 비교합니다. 파생상품·유닛·워런트
후보는 보통주 후보보다 후순위로 처리하거나 제외합니다.

## 신뢰도와 null 처리

- 공개 출처가 실제 값을 반환한 경우에만 평가에 사용합니다.
- 출처가 없거나 기준일이 확인되지 않으면 임의의 추정값을 만들지 않습니다.
- 개별 숏 포지션 진입가, 숏 원가, 포지션별 손익, 대차 수수료, 실시간 대차
  가능 수량은 공개 무료 데이터만으로 보장할 수 없으므로 `null`입니다.
- API 응답에는 `source`, `dataType`, `asOf`, `fallbackUsed`를 남겨 관리자
  디버깅에서 실제 사용 출처를 확인할 수 있도록 합니다.
