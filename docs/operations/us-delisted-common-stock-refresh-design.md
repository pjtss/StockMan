# 미국 상장폐지 보통주 이력 갱신 설계

## 상태

설계/조사 단계. 이 문서는 상장폐지된 미국 보통주의 식별과 과거 시세 갱신 가능 범위를 정리한다. 현재 운영 코드나 DB는 변경하지 않았다.

## 결론

가능하나, KIS와 SEC를 하나의 완전한 상장폐지 시세 소스로 볼 수는 없다.

- KIS는 해외주식 종목 마스터 파일과 기간별 시세 API를 제공한다. 프로젝트는 이미 `fetchUsDailyPrice`로 `dailyprice`를 호출하고 일·주·월 봉을 저장한다. 다만 마스터 파일은 “매매 및 시세조회 가능한 전체 종목 리스트”로 설명되므로, 상장폐지 종목이 포함된 과거 전체 종목 마스터라는 보장은 없다. 상장폐지 심볼별로 기간별 시세 API 응답이 계속 제공되는지 실측해야 한다.
- SEC EDGAR는 CIK별 submissions 및 XBRL 사실 API, 현재 ticker/CIK 회사 매핑 파일을 제공한다. 이 자료는 공시와 회사 식별을 위한 것이며 가격 API가 아니다. SEC의 `company_tickers.json` 및 `company_tickers_exchange.json`은 현행 매핑 확인용으로 취급해야 하며 과거 상장폐지 보통주 전체 목록으로 간주하지 않는다.
- 거래소 상장 종료 시점의 공식 이벤트는 EDGAR에서 Form 25(상장 및/또는 등록 제거 통지) 제출을 추적하는 방식이 가능하다. 다만 Form 25가 제출되기 전의 정지/청문/이의신청 상태와 OTC 이전을 함께 표현하려면 8-K 등 회사 공시와 거래소 공지가 필요하다. EDGAR만으로 모든 종목의 실제 최종 거래일·거래소 상태를 완전하게 판정한다고 가정하지 않는다.

따라서 권장 모델은 **활성 스캔 유니버스**와 **비활성 보통주 이력 유니버스**를 논리적으로 분리하는 것이다. 비활성 이력은 활성 추천·스캔 대상에 절대 합류시키지 않으며, 공식 보통주 분류가 확인된 종목만 보존/갱신한다.

## 현재 프로젝트 근거

- `lib/kis-us-daily-price.ts`: KIS `/uapi/overseas-price/v1/quotations/dailyprice`에서 일·주·월 데이터를 조회한다.
- `lib/us-daily-price-cache-warm.ts`: `us_common_stock_universe`의 `enabled=true` 보통주 대상으로 시세 캐시를 갱신한다. 일봉 stale 조회도 `us_latest_daily_candles`를 기준으로 한다.
- `db/migration/V65__instrument_universe_tables.sql`: 미국 종목 마스터에 거래소, 심볼, 상품분류, `enabled`, 최초/최종 관측일 및 누락 실행 수가 있다.
- `db/migration/V89__split_us_instrument_universe.sql`: 보통주와 특수 종목 테이블을 분리하고, 당시 비보통주 캔들을 삭제했다.
- `db/migration/V67__universe_candle_cache.sql`: KIS 원천 캔들 저장소는 (market, code, timeframe, candle_date) 기준 중복을 방지한다.
- `AGENTS.md` 보통주 전용 정책: 공식 종목 마스터에서 활성 `COMMON_STOCK`임이 확인된 종목만 수집/갱신/추천 대상으로 허용한다. 분류/활성 상태가 확인되지 않으면 fail-closed이며 과거 비보통주 캐시는 명시 요청 없이 갱신하지 않는다.

이 정책 아래 상장폐지된 종목의 이력은 별도 관리 데이터로만 취급해야 한다. 기존 `enabled` 의미를 재활용해 상장폐지 종목을 활성화하면 활성 스캐너와 갱신 정책을 오염시키므로 금지한다.

## 2026-10-24 실데이터 확인

- `.env.local`의 `DATABASE_URL` host가 `localhost`임을 확인한 뒤 로컬 DB를 read-only SELECT로 조회했다. 미국 마스터는 6,267행(활성 5,444, 비활성 823)이고 거래소별 비활성은 NAS 322, NYS 472, AMS 29행이었다. 이 행 수는 “상장폐지 보통주 수”가 아니다.
- 비활성 823행의 `instrument_type='COMMON_STOCK'`는 보통주 증거가 되지 않았다. 표본에 우선주, 채권, 워런트, 유닛이 여러 개 포함되어 있고 일부 `security_type='2'`로 저장되어 있어 기존 마스터 분류가 충분히 엄격하지 않음을 확인했다. 따라서 `enabled=false` 또는 master 누락만으로 과거 종목을 골라내는 방식은 안전하지 않다.
- SEC 공시에서 상장폐지 예정/결정 사례로 확인했던 SDST와 RCT는 로컬 KIS 마스터에서 모두 `enabled=true`였고 `last_seen_at=2026-09-25`, `missing_runs=0`이었다. RCT는 SEC 공시상 상장폐지 결정에 항소해 청문 및 결정까지 거래가 계속된다고 보고했으므로, “결정/예정”과 실제 효력 발생을 구분해야 한다. SDST 역시 2026-10-19 8-K에 기재된 Nasdaq의 2026-10-23 예정일만으로 실제 Form 25/효력/거래 정지를 확정하면 안 된다.
- KIS 공식 Form 25 안내는 거래소 상장 제거가 Form 25 제출 후 10일 뒤 효력이 발생한다고 설명한다. 이는 Form 25 filing 자체가 즉시 상장폐지 완료를 뜻하지 않으며, 실제 거래 정지와 별도 검증이 필요함을 뒷받침한다.
- 프로젝트 `.env.local`에 운영 read key가 있어도 `/api/public/daily-candles`는 `OPERATING_DB_CACHE`만 읽고 KIS 원천을 호출하지 않는다. 따라서 이 API를 통해 상장폐지 코드의 KIS 지원 여부를 확인할 수 없다.
- KIS 기간별 시세 실호출은 이 조사에서 하지 않았다. 프로젝트 토큰 발급 경로는 필요 시 KIS OAuth token을 발급하고 `kis_tokens` DB 행을 갱신한다. 이는 순수 GET보다 넓은 부수효과이며, 사용자가 상장폐지 종목 시세 재조회/인증 캐시 갱신까지 명시적으로 승인한 상태가 아니므로 호출하지 않았다. 인증된 KIS 시세 실측은 미검증으로 남는다.

### 표본 상태 근거

- SDST (Stardust Power Inc., CIK 1831979): SEC 원문 2026-10-19 Form 8-K는 Nasdaq Staff Determination에 따라 Form 25-NSE 제출 예정 및 2026-10-23 개장 시 거래정지/상장폐지 예정이라고 적는다. 회사는 청문요청 가능성을 언급하고, OTC 호가 신청도 검토 중이라고 기재했다. 이 문서만으로 Form 25 실제 제출/효력 또는 10-23 이후 실제 거래 상태는 확정하지 않는다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1831979/000149315226047607/form8-k.htm)
- RCT (RedCloud Holdings plc, CIK 2027360): SEC 원문 2026-10-15 Form 6-K(10-16 제출)가 Nasdaq 상장폐지 결정에 대한 항소 및 항소 절차 중 정상 거래 지속을 보고한다. 따라서 이 시점의 RCT는 완료된 상장폐지 역사 표본이 아니다. [SEC filing](https://www.sec.gov/Archives/edgar/data/2027360/000149315226047471/form424b3.htm)
- SEC Form 25의 일반 효력 시점: 거래소 상장 제거는 Form 25 제출 후 10일, Section 12(b) 등록 철회는 제출 후 90일(SEC가 더 짧게 정할 수 있음)이다. 두 효력은 구분한다. [SEC Form 25](https://www.sec.gov/files/form25.pdf)

**현재 완료된 실증 결론:** 프로젝트 로컬 DB의 활성/비활성 상태만으로 확정 상장폐지 보통주 집합을 만들 수 없다. SEC status evidence와 증권 종류를 CIK 단위로 확인해야 한다. 2026-10-24 KIS 기간별 시세 GET 비교 결과, 활성 AAPL은 2023-10-13 기준 100개 과거 봉을 반환했지만 상장폐지 보통주 ATVI는 같은 endpoint/date에서 정상 빈 응답 또는 `EGW00201` 오류를 반환했다. 따라서 이 프로젝트가 쓰는 KIS endpoint는 검증된 상장폐지 ATVI 봉 갱신 경로가 아니다. SEC EDGAR 자체에는 가격 API가 없어 과거 봉을 대체 제공할 수도 없다. 이 소스 조합만으로 미국 상장폐지 보통주 전체의 과거 가격을 안정적으로 갱신하는 것은 현재 불가하다. KIS 가격 공급 범위가 바뀌거나 별도 계약/공식 시세 소스가 확보되기 전까지 자동 재시도·캐시 적재하지 않는다.

### 2026-10-24 KIS 시세 실측

KIS `HHDFS76240000` 해외주식 기간별 시세 API에 같은 인증 컨텍스트와 `EXCD=NAS`, `GUBN=0`, `MODP=1`로 요청했다. 유효한 기존 토큰만 DB에서 SELECT했으며 신규 토큰 발급과 캐시 적재는 하지 않았다.

| 역할 | 종목 | KIS 응답 | 날짜 범위/건수 | 의미 |
|---|---|---|---|---|
| 활성 대조군 | AAPL | HTTP 200, `rt_cd=0`, `MCA00000` | BYMD 20231013, 100건 (20230523–20231013) | 과거 일봉 조회 기능 자체는 작동 |
| 상장폐지 표본 | ATVI | 반복 요청 중 HTTP 200, `rt_cd=0`, `MCA00000`, 0건; 별도 요청은 HTTP 500, `EGW00201`, 0건 | BYMD 20231013 | 활성 대조군과 달리 과거 상장폐지 ticker 조회가 정상적으로 봉을 반환하지 않음 |
| OTC 이전/상장 종료 상태 점검용 | ZSPC | HTTP 200, `rt_cd=0`, `MCA00000`, 0건 | BYMD 20261005 | 상장폐지 ticker가 OTC에서 계속 거래되는 경우도 이 KIS NAS 코드 요청으로 과거 봉을 받지 못함. Form 25 실제 제출 확인 표본은 아님 |

ATVI는 SEC 8-K에서 2023-10-13 Microsoft 합병 완료와 Form 25 요청을 보고했고, Nasdaq 공식 corporate action은 ATVI Common Stock의 마지막 거래일을 2023-10-12로 명시한다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/718877/000110465923108985/tm2328253d1_8k.htm), [Nasdaq corporate action](https://nasdaqtrader.com/TraderNews.aspx?id=ECA2023-588). 이 KIS 실측 결과는 “상장폐지 후 현재 시점에 KIS에서 ATVI 과거 봉을 가져올 수 없다”는 직접 증거다. 역사 시세를 어느 시점까지 보관하는지는 이 표본 하나로 일반화하지 않는다.

## 제안 절차

1. **대상 확인**: KIS 공식 미국 마스터에서 해당 코드의 시장·보안종류·이름을 확인한다. KIS 마스터에 없으면 이름만으로 보통주를 추정하지 않는다. SEC CIK 및 제출목록으로 issuer/주식 종류를 교차 확인하고 Form 25, 8-K Item 3.01 등 상태 근거를 보존한다.
2. **상태 기록**: 별도 상태 필드/테이블에 `ACTIVE`, `PENDING_DELISTING`, `DELISTED`, `OTC_CONTINUED`, `UNKNOWN`과 근거 출처·문서 URL·효력일·관측시각을 기록한다. Form 25가 없다는 이유만으로 상장 유지라고 판단하지 않는다.
3. **가격 확인**: KIS dailyprice에 최소한 소수의 확정 상장폐지 사례를 요청해 응답 코드, 마지막 유효 거래일, 분할조정(`MODP`) 상태, 거래량 0 구간을 기록한다. KIS가 미지원/빈 응답이면 성공으로 표시하지 않는다.
4. **갱신/저장**: 지원이 확인된 종목만 명시된 종료일(BYMD)까지 과거 캔들을 보충한다. 수집 행에는 소스, fetched_at, 요청 종료일 및 조정 기준을 보존한다. 기존 캔들을 덮기 전 날짜·OHLCV 검증을 통과해야 한다.
5. **격리**: 상장폐지 전 마지막 거래일까지의 데이터는 활성 유니버스/API 응답/추천에서 제외한다. OTC로 이전해 실제 계속 거래되는 경우도 별도의 OTC 상태와 정책 승인 없이는 거래소 상장 보통주 스캔으로 취급하지 않는다.

## 자동 감지 및 운영 게이트

- KIS 공식 마스터 동기화에서 사라진 활성 심볼은 즉시 삭제하지 말고 누락 실행 수와 마지막 관측일을 보존한다.
- EDGAR submissions에서 Form 25 및 상장 관련 Form 8-K를 추적하되 filing 결과만으로 자동 재활성화하지 않는다.
- 각 심볼별로 `last_verified_listing_status_at`, `status_source`, `status_evidence_url`, `last_trade_date`, `price_refresh_status`에 해당하는 정보를 기록한다.
- 상태 분류 불가, SEC/KIS 원천 장애, 심볼 충돌 또는 상품 종류 불명은 `UNKNOWN`으로 두고 상장폐지 이력 적재도 보류한다.
- 상태 전이 및 KIS 가격 API 응답은 로그/운영 리포트에서 건수와 원천 시각을 대조할 수 있어야 한다. 무응답·빈 배열·마스터 누락을 “상장폐지 확인”으로 세지 않는다.

## 확인된 제한과 남은 위험

- SEC 공식 ticker/CIK 매핑은 ticker history나 전체 상장폐지 종목 universe가 아니며, SEC submissions는 공시 기록이지 거래소 공식 마스터가 아니다.
- KIS 기간별 시세의 상장폐지 심볼 지원, 보정 방식, 제공 기간/라이선스 범위는 공식 페이지의 일반 API 설명만으로 보장되지 않는다. 실제 계정/종목으로 확인해야 한다.
- ticker 재사용, 합병/파산/OTC 전환, ADR·우선주 및 합병 대가 처리는 CIK·ticker·거래소·증권종류를 함께 유지하지 않으면 종목 혼동이 생길 수 있다.
- KIS API 이용약관은 거래고객 대상 시세 서비스 사용 목적에 제한을 둔다. 저장·재배포 용도 및 보존기간은 별도로 약관 검토가 필요하다.

## 공식 문서

- [KIS Developers 종목정보파일 및 API 포털](https://apiportal.koreainvestment.com/apiservice-category)
- [KIS Developers 해외주식 기간별 시세 API 규격 참고(공식 GitHub)](https://github.com/koreainvestment/open-trading-api)
- [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [SEC Company Tickers](https://www.sec.gov/file/company-tickers)
- [SEC Developer FAQ: ticker/CIK 파일 범위](https://www.sec.gov/about/webmaster-frequently-asked-questions)
- [SEC Exchange Delistings](https://www.sec.gov/rules-regulations/exchange-delistings)
- [SEC Form 25](https://www.sec.gov/files/form25.pdf)
- [SEC Exchange Delistings EDGAR 조회 안내](https://www.sec.gov/rules-regulations/exchange-delistings)
- [Nasdaq ATVI 마지막 거래일 공지](https://nasdaqtrader.com/TraderNews.aspx?id=ECA2023-588)

