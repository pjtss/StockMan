# Discord `/ticker` 단일 종목 종합 조회

## 목적

Discord에서 `/ticker symbol:AAPL`을 입력하면 현재가와 StockMan이 축적한 최근 체결강도 분석을 한 번에 확인한다. Discord 라우트는 요청과 응답 갱신만 담당하고, 데이터 조합은 `lib/discord-ticker-overview.ts`가 담당한다.

## 처리 흐름

1. `discord-ticker-command`가 티커를 정규화하고 KIS NAS/NYS/AMS 거래소를 검증한다.
2. `discord-ticker-overview`가 현재가 결과를 기준으로 KIS 체결추이를 조회한다.
3. DB에 최근 30분 체결 스냅샷이 있으면 저장된 데이터를 우선 사용하고, 없으면 KIS 응답을 사용한다.
4. 체결강도 지표와 `STRONG/WATCH/REJECT` 판정을 계산한다.
5. 응답 포맷터가 Discord content를 생성한다.

## 응답 원칙

- 시세 정보: 현재가, 등락률, 시가·고가·저가, 거래량, 거래대금, 시가총액
- 체결강도: 최근 평균, 직전 구간 대비 변화, 100 이상 비율, 종합 판정
- 체결강도 조회 실패는 전체 티커 조회 실패로 만들지 않고 `데이터 부족`으로 표시한다.
- 공매도·뉴스 데이터는 각각 독립 어댑터를 추가한 뒤 동일한 overview에 선택적으로 결합한다.
- 금액·주식 수 표시에는 공통 `formatKoreanCompact`를 사용해 `만/억` 단위와 소수점 규칙을 통일한다.

## SRP 경계

| 모듈 | 책임 |
| --- | --- |
| `discord-ticker-command.ts` | 티커 검증·KIS 기본 시세 조회 |
| `discord-ticker-overview.ts` | 데이터 소스 조합·체결강도 분석·Discord 표시 문자열 |
| `kis-us-trade-trend.ts` | KIS 체결추이 API 호출·파싱 |
| `us-trade-intensity-repository.ts` | 체결 스냅샷 저장·조회 |
| `us-trade-intensity-metrics.ts` | 순수 지표·점수 계산 |
| `app/api/discord/interactions/route.ts` | Discord 서명 검증·deferred response 갱신 |

## 운영상 한계

KIS 체결추이 API는 당일 전체 체결강도가 아니라 호출 시점에 반환한 최근 체결 묶음이다. 따라서 응답에는 `최근 체결강도`로 표시하며, 데이터 기준 시각과 장 구분이 필요한 경우 후속 필드로 추가한다.
