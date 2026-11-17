# 매집 의심 탐지 v2.0.0

## 범위와 계약

국내·해외 로컬/연결 DB의 일봉 OHLCV 캐시를 사용하는 설명 가능한 휴리스틱이다. 실제 기관·외인·특정 주체의 매집을 확인하거나 예측 성공률을 보증하지 않는다. 외부 시세 수집, DB 갱신, 자동 주문, 알림 발송은 수행하지 않는다.

국내·해외 차이는 유니버스 조회·거래시간·통화·시총 정책에만 둔다. 지표 계산, 데이터 검증, 점수, 정렬, 제외 집계와 응답 구조는 공유한다.

- 핵심 계산: lib/accumulation-screener-core.ts
- 마감 시각 검증: lib/accumulation-session.ts
- DB 조회와 입력 정규화: lib/accumulation-repository.ts
- 배치 판정·점수 근거·DTO: lib/accumulation-scan.ts
- 실행 조율: lib/accumulation-screener.ts
- API 공통 처리: lib/accumulation-route.ts
- 기존 runKrAccumulationScreener / runUsAccumulationScreener 호출은 결과 배열 반환 계약을 유지한다.

## 데이터 적격성

두 시장 모두 enabled=true, daily_active=true, instrument_type=COMMON_STOCK을 요구한다. 국내는 ETP·워런트·우선주·거래정지 제외 및 시총 **300억 원 초과** 조건을 SQL과 판정 계층에서 방어한다. 해외는 ETF·레버리지·인버스·워런트·파생상품 플래그를 제외하고 시총 하한을 두지 않는다. ADR을 임의로 추가 제외하지 않으며, DB 분류의 오류 가능성을 응답에 고지한다.

한 번의 SELECT 스냅샷으로 종목별 최신 저장 일봉 최대 120개를 읽고, 적어도 41개를 요구한다. 기준일 뒤 placeholder가 있으면 실제 계산 봉 수는 120개보다 작을 수 있다. 각 EMA의 초기값은 사용 구간 첫 관측값이며, 서로 다른 길이의 시계열이나 다른 시드 정책을 사용하는 차트와 값이 다를 수 있다.

검증 항목:

- 유효한 YYYYMMDD 날짜, 평일, 날짜 오름차순 및 중복 없음
- OHLC 양수·유한값, 고가/저가 범위 일치, 거래량 0 이상·유한값
- null/빈 수치를 0으로 간주하지 않음
- 최신 봉 거래량 양수 및 이전 거래량 EMA20 분모 양수
- 사용한 모든 봉의 갱신시각이 유효하며 검사시각 이하, 해당 일자의 정규장 종료 이후
- 국내 15:30 Asia/Seoul, 미국 16:00 America/New_York를 사용하고 미국 DST를 반영

유효 최신일은 **적격 유니버스의 완료 조건을 충족하는 캐시 봉 중 거래소별 최대 거래일**이다. 종목의 기준 봉은 그 날짜와 반드시 일치해야 한다. 주말·장마감 전 수집본·미래 갱신시각·누락/오래된 종목은 혼합하지 않는다. 동일 기준일에 존재하는 잘못된 최신 봉을 버리고 그 종목의 과거 봉으로 대체하지 않는다. 역사적 거래량 0인 정상 OHLCV 봉은 제거하지 않는다.

유효 기준일보다 새로운 거래량 0 또는 미완성 행이 있으면 storedDateByMarket와 경고로 드러낸다. 전체 캐시가 오래된 경우 7일 초과 경고도 제공한다. **공식 최신 거래일, 휴장일, 조기 폐장 및 특별 거래시간 달력은 연동하지 않았다.** 조기 폐장일에 일찍 수집한 봉은 보수적으로 제외될 수 있다. fetched_at은 저장소 갱신시각이며 공급자가 실제 종가를 확정했다는 증명은 아니다.

## 지표 정의

EMA는 모든 가격·거래량·거래대금·TR 평활에 동일하게 alpha=2/(period+1)를 사용한다. 일반 이동평균에 SMA를 사용하지 않는다. 볼린저밴드 코드는 변경하지 않는다.

- RVOL = 최신 거래량 / **직전 20봉 거래량 SMA20**. 당일 거래량이 분모에 들어가지 않는다.
- OBV 변화 = OBV[t] - OBV[t-20]. 종가가 전일보다 오르면 거래량을 더하고 내리면 뺀다.
- ADL 변화 = ADL[t] - ADL[t-20]. 매 봉 (2×종가−저가−고가)/(고가−저가)×거래량을 누적한다. 고가=저가면 0이다.
- 최근 골든크로스 = 최근 5봉의 인접 EMA9/20 값에서 이전 fast≤slow, 현재 fast>slow인 실제 교차를 탐지하고, 최신 봉에서도 fast>slow일 때만 인정한다. 가장 최근 교차일을 반환한다.
- 거래량 확장 = EMA5(volume)[t] / EMA20(volume)[t-5].
- 거래량 확장일 수 = 최근 5봉 각각의 거래량 / 해당 전일 EMA20(volume)이 1.1 이상인 봉 수.
- 상승/하락일은 시가 대비 양봉/음봉이 아니라 **전일 종가 대비** 판정한다. 동일 종가 봉은 방향성 거래량 비중에서 제외하며 전체 거래량에는 포함한다.
- 흡수 보조지표 = 최근 5봉 하락일 거래량 중 종가 위치가 저가~고가 구간의 상단 40%에 해당하는 거래량 비율. 하락일이 없으면 null이며 보너스를 주지 않는다.
- TR = max(고가−저가, |고가−전일 종가|, |저가−전일 종가|).
- EMA ATR20 비율 = EMA20(TR)[t] / 종가. **Wilder ATR과 다른 EMA 평활 변형**이다.
- ATR 수축 = EMA5(TR)[t] / EMA20(TR)[t-5].
- 20봉 가격범위 = (최고 고가−최저 저가)/최신 종가.
- 거래대금/시총 보조지표 = EMA5(종가×거래량)/시총. 시총 미제공이면 null이며 통화를 섞지 않는다.

## 선별과 점수

기본 필수 조건은 RVOL≥2, OBV 20봉 변화>0, ADL 20봉 변화>0이다. minScore 기본값은 0으로, 선별 후 점수순 정렬한다. 값이 높은 점수는 검증된 상승확률이 아니다. 아래 가중치는 해석 가능한 기본 정책이며 수익률 기반 최적화·외부 검증을 완료했다는 의미가 아니다.

| 항목 | 조건 | 배점 |
|---|---|---:|
| OBV | 20봉 증가 | 15 |
| ADL | 20봉 증가 | 15 |
| RVOL | 요청 최소값 이상 | 10 |
| EMA 정렬 | EMA9 > EMA20 | 10 |
| 최근 교차 | 최근 5봉 상향 교차 + 최신 정배열 | 10 |
| EMA9 지지 | 종가 > EMA9 | 5 |
| 방향성 거래량 | 상승일 거래량/(상승일+하락일 거래량) ≥ 0.55 | 5 |
| 거래량 지속성 | 확장일 ≥ 3/5 및 거래량 확장 ≥ 1.1 | 15 |
| 하락일 회복 | 거래량 양수 하락일 ≥ 2, 흡수 비율 ≥ 0.55 | 10 |
| 변동성 수축 | ATR 수축 ≤ 0.8 및 가격범위 ≤ 0.35 | 5 |
| 단발 급증 | RVOL≥3인데 확장일 < 2 | −15 |

양의 배점 합계는 100이다. 필수 조건을 통과한 후보의 점수는 모든 scoreBreakdown.points 합계와 정확히 일치한다. 정렬은 점수 내림차순 → RVOL 내림차순 → 거래소/코드 오름차순이다.

## API와 화면

GET /api/scan/kr-accumulation 및 GET /api/scan/us-accumulation이 같은 계약을 사용한다.

- limit: 기본 100, 1 이상 정수, 최대 1000으로 제한.
- minRvol: 기본 2, 유한한 0 이상 수.
- minScore: 기본 0, 유한한 0~100 수.
- 잘못된 명시 입력은 HTTP 400, DB/처리 실패는 비밀값 없는 시장별 HTTP 503 코드.
- 기존 ok/results/count/criteria 유지. logicVersion, checkedAt, policy, cache, summary, warnings, tickers 추가.
- summary.matched는 limit 적용 전 전체 통과 수, returned/count는 반환 수이다. eligible = matched + excluded이며 exclusions는 배타적 첫 제외 사유 집계이다. evaluated는 수치 계산 완료 수이고 조건 미달 종목도 포함한다.
- 각 결과에 종목명·코드·거래소, 최신 봉 날짜·갱신시각, 모든 지표, scoreBreakdown, timeframeMeta.daily 제공.
- timeframeMeta.daily.usedCandles의 모든 항목에 date/tradingAt/updatedAt을 제공한다. 원본 거래시각이 없으면 null이며 정규장 종료시각을 실제 거래시각으로 만들어 넣지 않는다.
- /charts의 매집 버튼은 현재 국내/해외 선택에 맞는 API를 호출한다. 결과 기본 정렬은 매집 점수이며, 거래일·KST 갱신시각·점수 근거와 사용한 봉별 메타데이터를 펼쳐 볼 수 있다.
- 일반 조건 스캐너와 매집 스캔의 동시 실행을 막고, 실패한 새 요청을 이전 결과의 완료로 표시하지 않는다.

## 공식 근거와 한계

[OBV 공식 설명](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/OBV)과 [ADL 공식 설명](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/accumulation-distribution)을 기본 계산 근거로 사용했다. ADL은 당일 범위 내 종가 위치를 보므로 갭 하락에서도 양수가 될 수 있다.

[EMA 공식 설명](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/ema)의 재귀 평활 구조를 사용하되 첫 관측값 시드를 프로젝트 정책으로 명시했다. [ATR 공식 설명](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr)의 TR 정의를 따르며 Wilder 평활과 다른 변형임을 구분했다. [NYSE 거래시간](https://www.nyse.com/trade/hours-calendars)을 미국 정규장 검증의 근거로 사용한다.

OHLCV만으로 매수 주체·체결 방향·실제 매물 흡수를 확정할 수 없다. 가격·거래량의 분할 조정, 공급자 오류, 최신 종목 분류, 시총 스냅샷의 시점 차이는 별도 확인이 필요하다. 현재 유니버스와 현재 캐시를 과거 성과 백테스트 데이터로 간주하지 않는다.

## 검증 범위

전용 테스트는 EMA/RVOL 독립 수치 검산, OBV·ADL 변화, TR 갭, 최근 재교차, 전일 대비 하락일, 증거 없는 흡수 가점 금지, 단발 급증 감점, 실제 ATR 가점, NaN/null/중복/0거래량, 최신일 불일치, 장중·미래·DST, KR 시총 경계, KR/US 동일 계산, 전체/제외/반환 집계, API 오류·메타데이터, UI 시장 선택·정렬·봉별 표시를 다룬다. DB 없는 합성 데이터 테스트와 실제 로컬 캐시의 읽기 전용 실행을 분리하여 확인한다. 수익률·예측 정밀도 향상 검증은 이 테스트가 보증하지 않는다.
