# KIS Open API 기반 매집 의심 종목 탐지 설계안

## 1. 설계 결론

KIS Open API는 매집 여부를 직접 판정하지 않는다. 따라서 KIS를 원천 데이터·시세 분석 데이터 공급자로 사용하고, 매집 의심 판정은 로컬 PostgreSQL 캐시와 프로젝트 공통 v2 엔진에서 수행한다.

- 인증·토큰: 기존 \`lib/kis-token.ts\` 단일 모듈
- 국내 수집: 기존 \`lib/kis.ts\` 및 국내 기간별 시세 경로
- 해외 수집: 기존 \`lib/kis-us.ts\` 및 해외 기간별 시세 경로
- 저장: 기존 국내·해외 일봉 캐시와 원본 응답 스냅샷
- 판정: \`lib/accumulation-screener-core.ts\`
- 시장별 DB 조회: \`lib/accumulation-repository.ts\`
- 공통 API: \`lib/accumulation-route.ts\`

## 2. KIS API 데이터 구성

### 공통 REST 흐름

1. \`.env.local\`에서 \`KIS_APPKEY\`, \`KIS_APPSECRET\`을 주입한다. 자격증명 원문은 로그에 기록하지 않는다.
2. \`POST /oauth2/tokenP\`로 접근토큰을 발급하거나 기존 DB 토큰을 재사용한다.
3. 모든 요청에 실제 \`Authorization: Bearer {access_token}\`, \`appkey\`, \`appsecret\`, \`tr_id\`, \`custtype\`을 포함한다.
4. HTTP 상태와 KIS \`rt_cd\`, \`msg_cd\`, \`msg1\`을 저장·분류한다.
5. 정상 응답만 정규화하여 일봉 캐시에 upsert한다. 실패하면 기존 정상 캐시는 변경하지 않는다.
6. 토큰 만료는 HTTP 401 또는 KIS가 명시한 만료 코드에서만 토큰 모듈이 갱신한다. 일반 AUTH 문자열만으로 공유 DB 토큰을 삭제하지 않는다.

KIS 공식 문서는 REST 호출에 접근토큰을 사용하고, 토큰 발급 엔드포인트를 \`/oauth2/tokenP\`로 규정한다. 운영 게이트웨이는 \`https://openapi.koreainvestment.com:9443\`이다.

### 국내

주력 데이터는 KIS Developers의 **국내주식기간별시세(일/주/월/년)** 중 일봉이다.

정규화 필드:

- 종목코드·시장·거래일
- 시가·고가·저가·종가·거래량
- 거래대금 가능 시 거래대금
- KIS 원본 payload
- 공급자 응답시각과 로컬 저장시각

국내 후보 유니버스는 종목정보 파일과 프로젝트의 \`kr_common_stock_universe\`를 사용한다. 활성 보통주만 남기고 ETP·워런트·우선주·거래정지 및 시총 300억 원 이하를 제외한다.

### 해외

주력 데이터는 KIS Developers의 **해외주식 종목/지수/환율 기간별시세(일/주/월/년)** 중 미국 일봉이다.

정규화 필드:

- 거래소·티커·종목명
- 거래일
- 시가·고가·저가·종가·거래량
- 통화·거래대금 가능 시 거래대금
- KIS 원본 payload
- 공급자 응답시각과 로컬 저장시각

해외 유니버스는 \`us_common_stock_universe\`를 사용하며 ETF·레버리지·인버스·워런트·파생상품을 제외한다. 해외 시총 하한은 별도 정책으로 두지 않는다.

## 3. 수집·캐시 운영

### 전체 갱신

- 장 마감 후 시장별 유니버스 목록을 읽는다.
- 종목별 일봉을 최소 120봉까지 수집한다.
- KIS 호출 제한을 고려해 요청을 직렬화·배치화하고 재시도 간격을 둔다.
- 한 종목 응답을 먼저 검증한 후 전체 갱신을 시작한다.
- 전체 작업은 임시 staging 또는 트랜잭션 단위로 저장하고, 실패 시 기존 캐시를 보존한다.
- 수집 결과에 \`candle_date\`, \`candle_time\`, \`fetched_at\`, \`source\`, \`raw_payload\`를 남긴다.

### 최신성 판정

- 거래소별 완료된 유효 일봉의 최대 거래일을 기준일로 산출한다.
- 종목의 최신 유효 봉이 시장 기준일과 다르면 후보에서 제외한다.
- 장중 응답·미래 갱신시각·거래량 0 최신 placeholder는 계산에 사용하지 않는다.
- 정규장 종료시각은 국내 15:30 KST, 미국 16:00 ET를 보수적으로 적용한다.
- 휴장일·조기 폐장일은 별도 공식 거래일 캘린더 연동 전까지 경고로 표시한다.
- 모든 사용 봉의 거래일·거래시각·갱신시각을 API 응답에 포함한다.

## 4. 매집 의심 판정 엔진

KIS 원본 수집 코드와 판정 코드를 분리한다. 국내·해외는 시장 정책과 필드 매핑만 다르고 지표·점수는 동일하게 사용한다.

필수 조건:

- RVOL ≥ 2
- OBV 최근 20봉 변화 > 0
- ADL 최근 20봉 변화 > 0
- 최소 41개의 검증된 일봉

지표:

- RVOL = 최신 거래량 / 직전 20봉 거래량 SMA20
- OBV = 종가 상승 시 거래량 가산, 하락 시 차감
- ADL = \`(2×종가−고가−저가)/(고가−저가)×거래량\` 누적
- EMA9·EMA20 정렬 및 최근 5봉 실제 골든크로스
- 최근 5봉 거래량 확장일 수
- 전일 종가 대비 하락일의 상단 종가 회복 거래량 비율
- TR 기반 EMA ATR 수축
- 최근 20봉 가격 범위
- 단발 RVOL 급증 감점

점수는 OBV, ADL, RVOL, EMA 정렬, 골든크로스, EMA9 위 종가, 방향성 거래량, 거래량 지속성, 하락일 회복, 변동성 수축으로 구성한다. 각 결과에 \`scoreBreakdown\`과 판정 근거를 함께 반환한다.

## 5. 선택적 KIS 보강 데이터

OHLCV만으로는 매집 주체를 확인할 수 없으므로, 권한과 호출 한도를 확인한 뒤 다음을 보조 신호로 사용한다.

- 국내: 주식현재가 투자자, 주식현재가 회원사, 프로그램 매매 관련 조회, 거래량순위
- 해외: KIS가 제공하는 해외 기본시세·기간별 시세. 국내 투자자·기관 개념을 해외 종목에 그대로 적용하지 않는다.
- 보조 신호는 필수 조건이 아니라 점수의 별도 영역으로 저장한다.
- 보조 API가 실패하거나 권한이 없으면 OHLCV 판정을 중단하지 않고 \`unavailable\` 상태로 명시한다.
- KIS에 없는 내부자 거래·옵션 플로우·기관 보유 데이터는 다른 공식 공급원 연동 전까지 추정하거나 mock으로 만들지 않는다.

## 6. API 계약

- \`GET /api/scan/kr-accumulation\`
- \`GET /api/scan/us-accumulation\`

입력:

- \`limit\`: 1~1000 정수
- \`minRvol\`: 0 이상 유한 수
- \`minScore\`: 0~100 유한 수

응답에는 다음을 포함한다.

- \`logicVersion\`, \`checkedAt\`, \`source\`
- 시장별 캐시 기준일·저장 기준일·데이터 품질
- 전체 대상·계산·통과·반환 수
- 제외 사유별 건수
- 정책과 사용한 KIS 데이터 출처
- 종목명·코드·거래소
- 기준 일봉 거래일·거래시각·갱신시각
- 계산에 사용한 모든 봉의 메타데이터
- 지표·점수·점수별 근거
- KIS 실패·권한·캐시 지연 경고

## 7. 장애·보안·운영

- KIS 토큰은 프로세스 Promise와 DB advisory lock으로 발급을 직렬화한다.
- 요청마다 토큰을 삭제·재발급하지 않는다.
- KIS 원문 로그는 길이 제한하고 자격증명·토큰을 마스킹한다.
- 단일 종목 수집 검증이 실패하면 전체 캐시 갱신을 시작하지 않는다.
- API 응답에는 KIS 원문 전체나 비밀값을 노출하지 않는다.
- 데이터 공급자 장애 시 mock 결과를 반환하지 않고 기존 캐시 또는 명시적 빈 결과·오류 상태를 반환한다.
- 탐지 결과는 투자 권유가 아닌 OHLCV 기반 휴리스틱 후보이다.

## 8. 검증 계획

1. KIS 응답 정규화: 정상·빈 응답·오류 코드·null·날짜 역순·중복 봉
2. 인증: 유효 토큰 재사용·401 갱신·동시 발급 잠금
3. 캐시: staging 실패 시 기존 데이터 보존·원본 payload와 fetched_at 저장
4. 지표: EMA·RVOL·OBV·ADL·TR 독립 수치 검산
5. 시장: 국내/해외 동일 fixture에서 동일 점수, 통화·시총 정책만 차이
6. 최신성: 장중·장마감 전·기준일 불일치·조기 폐장 경고
7. API: 잘못된 파라미터 400, 공급자/DB 장애 503, 메타데이터 완전성
8. 회귀: KIS 키 없이 로컬 캐시만으로 탐지 가능하며 mock은 사용하지 않음
9. 성능: 120봉 제한, 종목별 계산 시간과 KIS 호출 수 관측

## 9. 공식 문서

- [KIS Developers API 서비스 목록](https://apiportal.koreainvestment.com/apiservice)
- [KIS OAuth·접근토큰 발급](https://apiportal.koreainvestment.com/provider-doc2)
- [KIS API 문서](https://apiportal.koreainvestment.com/docs)
- [Fidelity OBV 설명](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/OBV)
- [Fidelity ADL 설명](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/accumulation-distribution)
