# KIS 종목 탐지 API 카탈로그

이 문서는 KIS Developers 공식 API와 공식 GitHub 샘플을 기준으로, 종목 탐지에 사용할 수 있는 API를 데이터 원천·탐지 목적·현재 프로젝트 연결 상태로 관리한다.

## 우선 적용 API

| 목적 | 공식 API | 프로젝트 상태 |
|---|---|---|
| 거래대금·거래량 후보 | 국내주식 거래량순위 | 기존 `kis-domestic-api.ts` |
| 상승·하락 모멘텀 후보 | 국내주식 등락률 순위 | 통합 후보 API 연결 |
| 대량 체결 후보 | 국내주식 대량체결건수 상위 | 통합 후보 API 연결 |
| 상·하한가 이상 후보 | 국내주식 상하한가 포착 | 통합 후보 API 연결 |
| 장외 잔량 후보 | 국내주식 시간외잔량 순위 | 통합 후보 API 연결 |
| 단기 과열·과매도 후보 | 국내주식 이격도 순위 | 통합 후보 API 연결 |
| VI 발동 후보 | 변동성완화장치(VI) 현황 | 통합 후보 API 연결 |
| 예상체결 모멘텀 | 국내주식 예상체결 상승·하락 상위 | 통합 후보 API 연결 |
| 체결강도 후보 | 국내주식 체결강도 상위 | 기존 `kis-domestic-api.ts` |
| 외인·기관 확정 수급 | 주식현재가 투자자 | `kis-investor-flow.ts` 연결 |
| 외인·기관 장중 추정 | 종목별 외인기관 추정가집계 | `kis-investor-flow.ts` 연결 |
| 프로그램 수급 | 종목별 프로그램매매추이(체결/일별) | 체결 API 연결, 일별 모듈 제공 |
| 기관·외국인 후보군 | 국내기관_외국인 매매종목가집계 | `fetchForeignInstitutionTotal` 제공 |
| 외국계 후보군 | 외국계 매매종목 가집계 | `fetchForeignMemberEstimate` 제공 |
| 외국계 틱 동향 | 종목별 회원사 실시간 매매동향(틱) | `/api/kis/market-flow?mode=foreign-member-tick`, TR ID `FHPST04320000` |
| 시장 프로그램 | 프로그램매매 종합현황(시간/일별) | 일별 공식 샘플 기준 |
| 신용 과열 | 국내주식 신용잔고 상위 | 통합 후보 API 연결 |
| 신용 추이 | 국내주식 신용잔고 일별추이 | `kis-investor-flow.ts` 제공 |
| 공매도 압력 | 국내주식 공매도 일별추이 | 종목 상세 API 연결 |
| 신용·공매도 시계열 | 신용잔고·공매도 일별추이 | `kis-investor-flow.ts` 제공 |
| 대차거래 시계열 | 종목별 일별 대차거래추이 | `fetchDailyLoanTransaction` 제공 |
| 신고가·신저가 | 신고·신저가 근접종목 상위 | 통합 후보 API 연결 |
| 재무 필터 | 시가총액·재무비율·시장가치 순위 | 통합 후보 API 연결 |
| 시총 유동성 필터 | 국내주식 시가총액 상위 | 통합 후보 API 연결 |
| 가치·재무 필터 | 국내주식 시장가치 순위(PER/PBR/PSR/EPS 등) | 통합 후보 API 연결 |
| 재무 건전성 검증 | 국내주식 재무비율·성장성·수익성·안정성비율 | 종목별 API 연결 |
| 외국계 증권사 추이 | 종목별 외국계 순매수추이 | 차트 모달 수급 탭 연결 |
| 증권사 의견 보조신호 | 국내주식 종목투자의견 | 종목별 API 연결 |
| 시장 유동성 배경 | 국내 증시자금 종합 | 시장 신호 API 연결 |
| 매수·매도 체결 불균형 | 종목별 일별 매수매도체결량 | 차트 모달 수급 탭 연결 |
| 호가·예상체결 | 종목별 매수·매도 호가 및 예상체결 | 차트 모달 수급 탭 연결, `FHKST01010200` |
| 실시간 체결·호가(WebSocket) | 국내·해외 실시간 체결 및 호가 구독 프레임 | `lib/kis-realtime.ts`; 국내 `H0STCNT0/H0STASP0`, 해외 `HDFSCNT0/HDFSASP0`; 장기 실행 수집기는 별도 워커로 운영 |
| 차트 모달 실시간 승인키 | 클라이언트에 앱 시크릿을 노출하지 않고 WebSocket 승인키·구독 프레임 발급 | `GET /api/kis/realtime/approval?market=KR|US&channel=trade|asking&code=...` |
| 시간외호가 | 시간외 매수·매도 호가 | 차트 모달 수급 탭 연결, `FHPST02300400` |
| 시간외현재가 | 시간외 가격·등락·거래량·거래대금 | 차트 모달 수급 탭 연결, `FHPST02300000` |
| 시간외 일자별 주가 | 최근 30건 시간외 가격 추이 | 차트 모달 수급 탭 연결, `FHPST02320000` |
| 회원사 현재 동향 | 종목별 증권사 회원사 매매 정보 | 차트 모달 수급 탭 연결, `FHKST01010600` |
| 회원사 기간 동향 | 회원사별 종목 매매 추이 | 차트 모달 수급 탭 연결, `FHPST04540000` |
| 당일 시간대별 체결 | 시간대별 체결 내역·누적 체결 정보 | 차트 모달 수급 탭 연결, `FHPST01060000` |
| 현재가 시세2 | 현재가 확장 필드·거래 정보 | 차트 모달 수급 탭 연결, `FHPST01010000` |
| 시장 투자자 시간동향 | 시장 전체 장중 외인·기관 흐름 | `/api/kis/market-investor-flow?mode=time` |
| 시장 투자자 일별동향 | KOSPI/KOSDAQ 시장별 일별 외인·기관 흐름 | `/api/kis/market-investor-flow?mode=daily&date=YYYYMMDD` |
| 해외 거래량·거래대금 순위 | 해외주식 시장별 거래량·거래대금 후보 | `/api/kis/us-ranking?kind=trade-vol|trade-pbmn&market=NAS` |
| 해외 거래량 급증·체결강도 | 해외주식 단기 활동성·체결강도 후보 | `/api/kis/us-ranking?kind=volume-surge|volume-power&market=NAS` |
| 해외 신고·신저가 | 해외주식 52주 고가·저가 근접 후보 | `/api/kis/us-ranking?kind=new-highlow&market=NAS` |
| 해외 시가총액 | 해외주식 규모·유동성 필터 | `/api/kis/us-ranking?kind=market-cap&market=NAS` |
| 해외 조건검색 | 가격·등락률·시가총액·주식수·거래량·거래대금·EPS·PER 복합 필터 | `/api/kis/us-search?market=NAS&CO_YN_RATE=1&CO_ST_RATE=-10&CO_EN_RATE=10` |
| 해외 업종별 시세 | 해외 업종코드별 거래량 조건 종목 후보 | `/api/kis/us-industry?market=NAS&industry=010&volumeRange=0` |
| 해외 상세시세 | 해외 종목 현재가·고가·저가·거래량·거래대금 등 상세 필드 | 차트 모달 수급 탭 `price-detail`, TR ID `HHDFS76200200` |
| 해외 상품기본정보 | 거래소별 상품명·상태·거래가능 여부 등 후보 검증 메타데이터 | `/api/kis/market-flow?market=US&mode=info&code=US:AAPL&productType=512`, TR ID `CTPF1702R` |
| 해외 분봉 | 해외 1분~120분봉 장중 가격·거래량 흐름 | 차트 모달 수급 탭 `mode=minute`, TR ID `HHDFS76950200` |
| 해외 기간봉 | 일반 해외 종목 일·주·월봉 가격·거래량 추세 | 차트 모달 수급 탭 `mode=daily`, TR ID `HHDFS76240000` |
| 시장 프로그램 수급 | 프로그램매매 시간·일별·투자자별 동향 | `/api/kis/program-flow?mode=today|daily|investor-today` |
| 배당률 후보 | 국내주식 배당률 상위 | `/api/kis/detection-candidates?source=dividend-rate` |
| 관심도 후보 | HTS 조회상위 20종목 | `/api/kis/detection-candidates?source=hts-top-view` |
| 관심종목 등록 관심도 | 관심종목등록 상위·등록 고객수 | `/api/kis/detection-candidates?source=top-interest-stock` |
| 호가 불균형 후보 | 국내주식 호가잔량 순위 | `/api/kis/detection-candidates?source=quote-balance&sort=0` |
| 시간외 활동성 후보 | 시간외 거래량·등락률 순위 | `/api/kis/detection-candidates?source=overtime-volume|overtime-fluctuation` |
| 매물대·거래비중 | 종목별 가격대 매물·거래비중 | 차트 모달 수급 탭 `mode=pbar`, TR ID `FHPST01130000` |
| 국내 당일 분봉 | 당일 1분봉 체결·거래량 흐름 | 차트 모달 수급 탭 `mode=minute`, TR ID `FHKST03010200` |
| 국내 과거일 분봉 | 지정 거래일 최대 120건 분봉 | API `mode=daily-minute`, TR ID `FHKST03010230` |
| 국내 시간외 시간대별 체결 | 시간외 체결 시각·체결량 흐름 | 차트 모달 `mode=overtime-conclusion`, TR ID `FHPST02310000` |
| 국내 예상체결가 추이 | 장 시작 전 예상가격·체결량 추이 최대 30건 | 차트 모달 `mode=exp-price-trend`, TR ID `FHPST01810000` |
| 국내 증권사별 투자의견 | 증권사별 매수·중립·매도 의견 및 기간별 변화 | 차트 모달 `mode=opinion-by-broker`, TR ID `FHKST663400C0` |
| 국내 최근 일자별 시세 | 최근 30건 일·주·월별 가격·거래량 요약 | 차트 모달 `mode=daily-price`, TR ID `FHKST01010400` |
| 국내 업종 분봉 | KOSPI·KOSDAQ 등 시장/업종 레짐과 종목 모멘텀 비교 | `/api/kis/market-flow?market=KR&mode=index-minute&indexCode=0001`, TR ID `FHKUP03500200` |
| 국내 업종 현재지수 | 현재 시장·업종 방향과 등락률 보조 신호 | `/api/kis/market-flow?market=KR&mode=index-current&indexCode=0001`, TR ID `FHPUP02100000` |
| 국내 업종 일자별지수 | 시장·업종 추세 및 종목 상대강도 기준선 | `/api/kis/market-flow?market=KR&mode=index-daily&indexCode=0001`, TR ID `FHKUP03500100` |
| 국내 현재 체결 | 종목 현재 체결가·체결량 흐름 | 차트 모달 수급 탭 `mode=ccnl`, TR ID `FHKST01010300` |
| 국내 상세 시세 | 현재가·거래량·거래대금·시가총액·회전율 등 종목 상세 | 차트 모달 수급 탭 `mode=price-detail`, TR ID `FHKST01010100` |
| 국내 대주 가능 종목 | 대주 가능 여부·대주 후보 필터 | 차트 모달 수급 탭 `mode=lendable`, TR ID `CTSC2702R` |
| 국내 상품기본조회 | 상품명·판매상태·위험등급 등 후보 검증 메타데이터 | 차트 모달 수급 탭 `mode=product-info`, TR ID `CTPF1604R` |
| 국내 주식기본조회 | 거래소·상장주수·업종·KOSPI200·NXT 거래정지 여부 | 차트 모달 수급 탭 `mode=stock-info`, TR ID `CTPF1002R` |
| ETF 구성종목 | ETF 편입종목·비중·시세 기반 구성종목 탐지 | 차트 모달 수급 탭 `mode=etf-components`, TR ID `FHKST121600C0` |
| ETF 전용 현재가 | ETF/ETN 전용 현재가·거래량·괴리 보조 필드 | 차트 모달 수급 탭 `mode=etf-price`, TR ID `FHPST02400000` |
| ETF NAV 괴리 | ETF 현재가와 NAV/IIV 비교·괴리 보조 신호 | 차트 모달 수급 탭 `mode=etf-nav`, TR ID `FHPST02440000` |
| ETF NAV 일별 추이 | ETF NAV 괴리의 기간 추세 | 차트 모달 수급 탭 `mode=etf-nav-daily`, TR ID `FHPST02440200` |
| 체결금액별 매매비중 | 가격대가 아닌 체결금액 구간별 매수·매도 비중 | 차트 모달 수급 탭 `mode=trade-participation`, TR ID `FHKST111900C0` |
| 수익성 후보 | 수익자산지표 순위 | `/api/kis/detection-candidates?source=profit-asset-index` |
| 재무비율 후보 | 재무비율 순위 | `/api/kis/detection-candidates?source=finance-ratio-ranking` |
| 신용 가능 종목 필터 | 당사 신용가능종목 | `/api/kis/detection-candidates?source=credit-by-company&selectable=0` |
| 회원사 거래 집중도 | 당사매매종목 상위(매도·매수 체결량) | `/api/kis/detection-candidates?source=traded-by-company&sort=1` |

통합 후보 API는 `GET /api/kis/detection-candidates?source=...`로 호출한다. 지원 원천은 `trade-value`, `volume-power`, `fluctuation`, `foreign-institution`, `foreign-member`, `credit-ranking`, `bulk-transactions`, `upper-capture`, `after-hour`, `disparity`, `vi-status`, `expected-updown`, `near-high`, `near-low`, `market-cap`, `market-value`, `dividend-rate`, `hts-top-view`, `top-interest-stock`, `quote-balance`, `overtime-volume`, `overtime-fluctuation`, `profit-asset-index`, `finance-ratio-ranking`, `credit-by-company`, `traded-by-company`이다. `market-value`는 `fiscalYear`, `quarter`, `metric`, `dividend-rate`는 `fromDate`, `toDate`, `marketGroup`, `sector`, `stockType`, `dividendType`, `dividendClass`, `quote-balance`와 시간외 순위는 `marketCode`, `sort` 파라미터를 선택적으로 받는다. `vi-status`는 `date=YYYYMMDD`, `expected-updown`은 `sort`와 `session=pre|close`를 선택적으로 받는다. 모든 행에는 원본 필드와 함께 `rank`, `code`, `name`, `observedAt` 공통 필드가 포함된다. 해외 조건검색은 `GET /api/kis/us-search`로 호출하며, KIS 명세의 `CO_YN_*`, `CO_ST_*`, `CO_EN_*` 필터를 그대로 전달하고 결과도 `kis_signal_snapshots`에 저장한다.

실제 조합 탐지는 `GET /api/kis/detection-scan?sources=trade-value,volume-power,fluctuation,foreign-institution,near-high,market-value`처럼 호출한다. 허용 원천은 거래대금·거래량강도·등락률·기관/외국인·신고가/신저가 근접·시장가치·시가총액이며, 최대 8개 원천을 순차 조회하고 동일 종목이 여러 원천에 나타날수록 높은 점수를 부여한다. 국내 통합 탐지 결과에는 시가총액 300억 원 이하 종목을 제외하는 공통 필터와 필터 통계가 포함된다. 이 API는 투자판단을 대신하지 않으며 후보 우선순위만 반환한다.

종목별 재무 검증은 `GET /api/kis/financial-ratios?code=005930&type=financial&period=annual`로 호출한다. `type`은 `financial`, `growth`, `profit`, `stability`, `balance-sheet`, `income-statement`, `other-major`를 지원하며 연간·분기 데이터는 `period=annual|quarter`로 구분한다.

증권사 의견 이력은 `GET /api/kis/investment-opinion?code=005930&startDate=20260101&endDate=20260908`로 호출한다. 의견·목표가 데이터는 투자자별 수급이나 탐지 점수에 직접 합산하지 않고 별도 보조 신호로 저장한다.

시장 유동성 배경은 `GET /api/kis/market-funds?date=20260908`로 호출한다. 고객예탁금·신용 관련 시장 지표는 특정 종목의 매수 주체로 해석하지 않고 `market=KR`, `code=MARKET`, `market_funds` 신호로 별도 저장한다.

## 탐지 설계 원칙

1. 순위 API로 1차 후보를 만들고 종목별 투자자·프로그램 API는 후보에만 호출한다.
2. 장중 추정과 장마감 확정 데이터를 같은 지표로 합치지 않는다.
3. KIS가 제공하지 않는 해외주식 투자자별 수급은 추정하지 않는다.
4. 모든 원본 응답은 `kis_signal_snapshots`에 저장하고, 화면은 최신 정상 스냅샷을 사용한다.
5. 수급 양수는 매수 신호가 아니라 관측된 순매수 방향이며, 가격·거래량·시총 하한 등 공통 필터와 함께 사용한다.

## 공식 API 범위와 의도적 분리

공식 KIS 저장소에는 국내주식·해외주식 외에도 주문/계좌, 국내선물옵션, 해외선물옵션, ELW, ETF/ETN API가 함께 제공된다. 이 프로젝트의 종목 탐지 범위는 일반 국내주식·해외주식과 ETF/ETN 보조 신호로 한정한다.

- 주문·잔고·기간손익 API: 개인 계좌 상태나 주문 실행 기능이므로 후보 탐지 파이프라인에 연결하지 않는다.
- 선물옵션 API: 기초자산 종목 탐지와 계약 단위·증거금 체계가 달라 별도 파생상품 모듈로 분리한다.
- ELW API: 일반 주식과 상품 식별자·위험 구조가 달라 일반주식 후보 점수에 합산하지 않는다.
- ETF/ETN API: 현재가·구성종목·NAV 괴리처럼 일반 종목 탐지에 유용한 보조 신호만 차트 모달과 스냅샷에 연결한다.

따라서 ‘모든 KIS API’는 모든 상품군의 주문·계좌 기능을 무차별 연결한다는 의미가 아니라, 공식 API 중 종목 탐지에 정보 가치가 있는 범위를 구현하고 상품군이 다른 API는 오탐을 막기 위해 명시적으로 분리한다는 기준으로 관리한다.

## 공식 근거

- [KIS Developers API 서비스 목록](https://apiportal.koreainvestment.com/apiservice)
- [공식 국내주식 샘플 저장소](https://github.com/koreainvestment/open-trading-api/tree/main/examples_llm/domestic_stock)
- [공식 WebSocket 국내·해외 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/websocket/python/ws_domestic_overseas_all.py)
- [기관·외국인 매매종목 가집계 공식 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/foreign_institution_total/foreign_institution_total.py)
- [외국계 매매종목 가집계 공식 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/frgnmem_trade_estimate/frgnmem_trade_estimate.py)
