# 미국 소형 시가총액 종목 추출 운영 절차

## 목적과 범위

운영 요청에 따라 미국 상장 종목 중 최신 운영 시가총액이 USD 10,000,000 이하인 종목을 조회한다. 이 절차는 운영 서버의 공개 read-only API만 GET으로 호출하며 운영 DB 직접 접속, 갱신·저장 요청, 알림 전송은 하지 않는다.

## 대상 기준

- 시장: `us_common_stock_universe`의 미국 거래시장(`NAS`, `NYS`, `AMS`)
- 종목: 공식 종목 마스터에서 `enabled=true`, `daily_active=true`, `instrument_type='COMMON_STOCK'`이며 ETF·레버리지·인버스·워런트·파생상품·DR 플래그가 모두 false인 활성 보통주
- 시가총액: 운영 `instrument_fundamental_snapshots`의 최신 스냅샷이 양수이며 `currency='USD'`, `market_cap <= 10000000`
- 스냅샷의 `observed_at`과 `fetched_at`을 결과에 표시한다. 값이 없거나 USD가 아니거나 관측시각이 불명확하면 제외하고 사유를 집계한다.
- 이 조건은 저장된 최신값 기준이다. KIS 재조회 없이 실시간 시가총액이라고 표현하지 않는다. 데이터 기준시각과 최신 갱신 시각을 함께 표시한다.

## 조회 절차

1. `.env.local`에서 운영 `DAILY_CACHE_API_URL`을 읽는다. 이 공개 읽기 API에는 인증 키가 필요하지 않다.
2. 로컬 DB에서 미국 활성 보통주 코드 목록만 읽는다. DB URL이 localhost가 아니면 중단한다. 운영 DB URL을 직접 사용하지 않는다.
3. 코드 목록을 최대 100개씩 나누어 `GET /api/public/instrument-fundamentals?market=<시장>&codes=<코드목록>`을 인증 헤더 없이 호출한다.
4. 응답의 성공 여부와 요청 코드 대비 반환 코드 수를 확인한다. 실패한 배치는 결과를 누락 없는 전체 추출로 보고하지 않는다.
5. 시장·통화·양수 시총·시총 상한·관측시각 조건을 적용한다. 결과에는 종목명, 티커, 시장, USD 시총, 시총 관측시각, 스냅샷 수집시각, 출처를 포함한다.
6. 전체 대상 수, 응답 수, 기준 통과 수, 결측·오래된 자료 등 제외 수와 데이터 기준시각을 함께 보고한다. 사용자가 추출을 요청한 경우 결과 파일을 만들 수 있지만, 외부로 공유하거나 전송하는 것은 별도 요청이 있어야 한다.

## 민감정보 및 안전 기준

- `.env.local`은 로컬 환경변수 주입 전용이다. 내용을 출력하거나 문서·로그·보고서에 복사하지 않는다.
- 운영 접근은 공개 읽기 전용 GET으로 한정한다. POST/PATCH/DELETE, 운영 DB 직접 연결, 자동 갱신 실행은 본 절차의 범위가 아니다.
- 운영 API가 제공하는 값은 저장 스냅샷이다. 신선도 요구가 따로 있으면 `observed_at`을 기준으로 오래된 값을 제외하고, 갱신은 별도 작업으로 다룬다.
- 운영 조회 중 인증값이 로그·도구 출력에 노출되면 즉시 해당 출력을 공유하지 않고 자격증명 교체 필요성을 사용자에게 알린다.

## 검증과 기록

조회 후 호출 시장, 요청·반환 건수, 중복 여부, 필터 통과 수, 제외 사유 수, 시총 관측시각 범위를 확인한다. 작업 목적·범위·조회 경로·검증 결과·커밋/푸시/배포 여부는 `DEVELOPMENT_LOG.md`에 남긴다. API 응답에 원시 자격증명이나 인증 헤더가 포함되지 않도록 한다.

## SEC Company Facts 발행주식수

- SEC 공식 `company_tickers_exchange.json`으로 티커를 CIK에 연결한 뒤 `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`을 GET한다. 거래소가 일치하는 고유 티커를 우선 사용한다. 마스터 시장코드와 SEC 거래소 문자열이 달라도 티커가 CIK 하나에만 연결되면 조회할 수 있으며, Excel에 SEC 거래소를 별도로 표시한다. 복수 CIK 또는 매핑 부재는 임의 선택하지 않는다.
- 보통주 주식수 SEC fact는 XBRL `dei:EntityCommonStockSharesOutstanding`와 `us-gaap:CommonStockSharesOutstanding`를 대체 관계로 합치지 않고 각각 별도 조회·저장한다. 각 concept에서 단위가 `shares`이고 양수 정수이며 `end`·`filed`가 유효한 fact 중 가장 최근 접수 fact를 독립적으로 고른다. 기준일(`end`), 접수일(`filed`), 양식(`form`), concept, accession을 concept별 컬럼에 보존한다. 한쪽 fact만 있으면 다른 쪽은 NULL로 저장하며, 양쪽 모두 없을 때만 해당 회사의 SEC fact 행을 저장하지 않는다.
- 두 concept 모두 outstanding 수량을 보고하며 `dei:EntityCommonStockSharesOutstanding`는 free float(일반 투자자가 거래 가능한 유통주식수)를 의미하지 않는다. 이 자동화는 승인주식수나 free float를 계산하지 않는다. SEC CIK 매핑 없음, Company Facts fact 없음, HTTP 오류는 추정값으로 보충하지 않는다.
- 주식수 운영 중단: 2026-10-13부터 종목 주수 기준을 KIS 상세시세로 통일했다. SEC 소형주 발행주식수 수집·공개 API·보고서·관련 테이블은 제거되었으며, 이 추출 절차는 SEC 주식수 조회 경로로 사용할 수 없다. 해외주식 상장주수는 KIS `price-detail`의 `output.shar`를 사용한다.
- SEC 요청은 식별 가능한 `User-Agent`를 사용하고 공식 최대 10회/초 제한 이하로 순차 요청한다. 출처는 [SEC EDGAR API 안내](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [ticker·거래소 매핑 파일](https://www.sec.gov/files/company_tickers_exchange.json), [SEC fair-access 기준](https://www.sec.gov/about/developer-resources)이다.
- 2026-10-01 결과 Excel은 활성 미국 보통주 대상 430행 중 394행에서 표준 shares fact를 찾았다. 30행은 eligible concept 미확인, 4행은 Company Facts HTTP 404, 2행은 ticker/CIK 매핑 부재라 발행주식수를 비워뒀다. 조회한 fact 기준일은 2008-12-16~2026-09-29로 넓게 분포하므로 각 행의 기준일을 현재 발행주식수라고 간주하지 않는다.
