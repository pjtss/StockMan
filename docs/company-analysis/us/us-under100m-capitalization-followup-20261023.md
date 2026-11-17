# 미국 1억 달러 이하 후보 주식수·시총 후속 대조 (2026-10-23)

## 범위와 판정 기준

이 문서는 2026-10-20 프로젝트 후보 63개 중 최근 공시가 보고주식수·실제 발행·조건부 잠재주식 수를 바꿀 수 있는 사례와 시총 경계 사례를 추가 대조한다. 주가 기준은 운영 서버 일봉 마지막 거래일인 2026-10-21 종가다. 공시 기준일의 주식수와 종가 날짜가 다를 수 있어 현재 시총의 확정값이 아니라 공개정보 기반 근사치로 표시한다. SEC가 직접 보고한 shares outstanding와 ownership percentage에서 산출한 범위를 구별하고, warrants·convertibles·authorized shares·재판매 등록 주식은 실제 발행주식에 자동 합산하지 않는다.

SEC CompanyFacts는 63개 CIK 모두 read-only 조회했다. DEI:EntityCommonStockSharesOutstanding fact는 55개에서 제공됐으나 기준일은 회사별 상이하며 일부는 오래됐다. 이를 기계적으로 현재 주식수로 부르지 않는다. 대상 개별 filing과 13D 수량은 accession 원문을 기준으로 아래를 대조했다.

## 운영 주식수와 SEC fact의 큰 차이

다음 8개는 운영 API `listed_shares`와 SEC CompanyFacts의 가장 최근 `EntityCommonStockSharesOutstanding` 값이 2배 이상 다르다. 값의 기준일·보통주 클래스·ADS/ordinary basis가 같다고 확인되지 않았으므로 운영값이나 CompanyFacts 값을 일괄 현재 발행주식수로 간주하지 않는다. 10/21 종가에 CompanyFacts 수를 단순 적용한 시총도 참고 산술치일 뿐이다.

| 티커 | 운영 API shares (관측 2026-10-18) | SEC fact shares (fact 기준일) | 종가×SEC fact 산술치 (USD) |
|---|---:|---:|---:|
| SHFS | 1,027,746 | 12,332,955 (2026-08-05) | 2,404,926 |
| GMEX | 9,670,000 | 21,020,597 (2025-06-30) | 18,512,840 |
| OMH | 1,911,858 | 22,259,591 (2025-12-31) | 73,901,842; 단, 10/16에 3M주 발행 완료. 본 문서의 보정 추정 $83.86M 참조 |
| KXIN | 42,133,900 | 5,489,162 (2024-12-31) | 9,121,340 |
| RBNE | 1,332,297 | 2,774,865 (2025-12-31) | 664,580 |
| TANH | 667,647 | 6,214,872 (2026-04-30) | 54,753,022 |
| HCAI | 7,629,942 | 30,000,000 (2024-12-31) | 6,030,000 |
| SPHL | 2,261,980 | 11,500,000 (2024-12-31) | 38,641,150 |

WFF는 동일한 불일치 집합에 속하지만, 2026-07-30 424B5의 non-affiliate 41,919,934 ordinary shares와 3,440,664 Class A shares를 직접 대조해 2025 CompanyFacts의 5,038,018주보다 최신 자본근거를 우선했다. 각 class는 보통주 1:1 전환 가능하며 단순 post-offering equivalent와 잠재 warrant 수는 아래 회사별 검토에서 따로 계산했다. 위 8개 차이는 2026-10-21 가격 기준 모두 $100M 미만 산술치지만 현재 cap 검증을 마친 것은 아니다.

## 상한 초과 추정

### SAFX — 1억 달러 초과 추정, 기존 cap 후보에서 제외 권고

- 운영 일봉 2026-10-21 종가: $0.1779.
- 2026-09-25 주주명부 기준 8-K는 발행 보통주 415,296,896주를 직접 보고한다. [SEC 8-K, 2026-10-06, accession 0001213900-26-107213](https://www.sec.gov/Archives/edgar/data/2019793/000121390026107213/ea0307760-8k_xcfglobal.htm)
- [SEC Schedule 13D/A, 2026-10-16, accession 0002106572-26-000004](https://www.sec.gov/Archives/edgar/data/2019793/000210657226000004/xslSCHEDULE_13D_X02/primary_doc.xml)은 10월 16일 거래 종결로 EEME가 119,397,858주를 취득했다고 적고, 보고자별 228,897,417.60주/38.3%와 270,564,515.60주/45.3%를 보고한다. 38.3%, 45.3%는 소수점 한 자리 반올림 지분율이라 직접 발행주식수는 아니지만, 각 비율의 반올림 구간을 분모로 역산해 교차하면 약 596,864,192~597,932,631주 범위다.
- 위 범위와 10/21 종가를 적용한 시장가치 근사 범위는 약 **$106.18M~$106.37M**이다. 1억 달러 초과 결론은 반올림 오차를 고려해도 유지된다. SEC 제출에서 정확한 10/21 발행주식수를 직접 확인한 것은 아니므로 13D/A로부터 역산한 추정이다.
- XCF의 10/15 S-4MEF는 사업결합 주식수가 늘어난 이유로 기존 제출 뒤 추가 발행과 전환사채 전환을 들며 41,173,012주를 추가 등록했다. 등록 주식수 전체를 발행 완료분으로 취급하지 않았다. [SEC S-4MEF, accession 0001213900-26-109703](https://www.sec.gov/Archives/edgar/data/2019793/000121390026109703/ea0308557-s4mef_xcf.htm)

**판정:** 해당 63개 기업 공시 분석에는 보존하되, 현재 시총 1억 달러 이하 universe에는 포함시키지 않는 편이 근거에 맞다. 프로젝트 기존 후보 파일의 10/20 선정 시점 값과 그 후 10/16 transaction close/10/21 가격을 혼합하지 않는다.

## OPAD — SEC 주식수 × 외부 종가 참고 추정, 운영 거래소 코드 불일치

- SEC 2026 Q2 10-Q cover는 2026-06-30 기준 Class A 보통주 4,832,094주 outstanding을 보고한다. 같은 분기 CompanyFacts에는 2026-07-27 기준 4,832,749주 fact가 별도 등록돼 있어 날짜가 더 최신인 점을 함께 기록한다. 어느 수량도 10/22 현재 확정 발행주식수로 간주하지 않는다. [SEC 10-Q](https://www.sec.gov/Archives/edgar/data/1825024/000119312526330713/opad-20260630.htm)
- ChartExchange의 2026-10-22 종가 $2.59 × 6/30 SEC 수량 4,832,094주는 **$12,513,423.46** 참고 시총이다. SEC shares/date × 외부 종가라 운영 일봉 시총이 아니다. 10월 13일 8-K는 대출 한도 변경이며 주식발행 공시는 아니다.
- 운영 마스터는 OPAD를 NYSE (NYS)로 분류하고, 운영 일봉은 9/8 이후 갱신되지 않는다. NasdaqTrader Data Technical News #2026-18은 Nasdaq 거래 개시일을 2026-08-31로 공지했다. 운영 exchange code가 현재 거래소와 불일치하는 데이터 품질 문제이며, 기존 master 판정을 자동 변경하지 않고 기록한다. [NasdaqTrader 이전 공지](https://www.nasdaqtrader.com/TraderNews.aspx?id=DTN2026-18)
- 기술 분석용으로 ChartExchange 90개 일봉 (2026-06-16~2026-10-22)을 별도 수집했다. 이 보충자료는 운영 서버의 stale candle과 병합하지 않고 candle JSON에서 externalSupplement로 별도 보관한다. [ChartExchange OPAD history](https://chartexchange.com/symbol/nasdaq-opad/historical/)

**판정:** 후보 상한 하회 참고 추정으로 반영하되 SEC 주식수 기준일과 가격일 차이, CompanyFacts의 7/27 수량차이, 운영 거래소 master 불일치를 남긴다. 운영 일봉 수집 경로에 대한 정합성은 해결되지 않았다.
## 실제 발행 후에도 관측 시총은 상한 아래인 사례

### WFF — 발행 12M 유닛 종결, 추가 할당 종료

- 2026-10-15 등록직접발행이 종결됐고 총 12,000,000 유닛, 총액 약 $18M을 발표했다. 각 유닛은 보통주 1주 또는 선불워런트 1개와 보통주 워런트 1개를 포함한다. 7월 30일 non-affiliate Ordinary Shares 41,919,934주에 2026-10-15 prospectus 기준 Class A 3,440,664주(ordinary 1:1 전환 가능)를 더한 공모 전 common-equivalent은 45,360,598주다. 12M 신규 ordinary/PFW 상당을 더하면 약 57.36M주, 10/21 종가 $0.0902 기준 약 $5.17M이다.
- 워런트는 zero-price exercise 조건에 따라 최대 108M 보통주가 발행될 수 있으나 이는 조건부 잠재주식이고 현재 발행주식이 아니다. 발행 후 equivalent에 이를 모두 더한 단순 완전 행사 가정은 약 165.36M주, $14.92M이며 현 발행수 또는 기대값을 뜻하지 않는다. 실제 미발행 여부/선불워런트 개별 배분 수는 이후 발행사 업데이트를 확인해야 한다.
- 추가 할당 최대 12M 유닛 권리는 2026-10-21 종료 합의로 소멸했다.
- [SEC 6-K, offering closed 2026-10-15, accession 0001213900-26-109881](https://www.sec.gov/Archives/edgar/data/1980210/000121390026109881/ea0308720-6k_wfholding.htm), [SEC 6-K, additional allocation termination, accession 0001213900-26-111403](https://www.sec.gov/Archives/edgar/data/1980210/000121390026111403/ea0309289-6k_wfholding.htm)

### OMH — 3M 보통주 사모발행 종결

- SEC CompanyFacts의 shares outstanding는 2025-12-31 기준 22,259,591주다. 2026-10-16 사모발행에서 Class A 보통주 3M주와 보통주 3M주를 매입할 워런트 3M개를 발행하고 $3.9M gross proceeds를 받았다. 단순 주식수 25,259,591 × 10/21 종가 $3.32는 약 **$83.86M**이다. 워런트 3M주 전부 행사 시 단순 값은 약 $93.82M이나 워런트는 미행사 잠재수량이다.
- 이 산출은 2025년 말 SEC fact가 기준점이며 2026년 중 다른 주식수 변화를 모두 설명하지 못한다. 종목 master의 listed_shares 1,911,858은 SEC fact와 크게 달라 class/단위 범위를 대조하지 않고 cap 근거로 쓰지 않는다.
- [SEC 6-K, accession 0001213900-26-110319](https://www.sec.gov/Archives/edgar/data/1944902/000121390026110319/ea0308849-6k_ohmyhome.htm)

## 현재 발행주식과 잠재 희석을 분리해야 할 사례

### VVOS

- 2026-10-19 proxy record date 기준 보통주 33,609,393주가 발행돼 있었다. 10/21 종가 $0.1329를 적용하면 약 $4.47M이다.
- SOD transaction으로 발행한 Series C preferred는 전환 시 최대 80M common shares를 낼 수 있다. 주주승인 전 exchange cap은 기존 주식의 19.99%(약 6,718,517주)다. 80M은 현재 보통주수에 포함하지 않고 잠재 희석으로 표시한다.
- [SEC 8-K, accession 0001493152-26-047601](https://www.sec.gov/Archives/edgar/data/1716166/000149315226047601/form8-k.htm), [SEC preliminary proxy, accession 0001493152-26-047606](https://www.sec.gov/Archives/edgar/data/1716166/000149315226047606/formpre14a.htm)

### TCGX 및 RLYB

- 최근 공시기간 중 merger proxy/registration 또는 shareholder communication이 제출됐다. 효력발생·계약 체결·주주승인은 합병 종결이나 주식발행 자체와 다르다. cutoff 내 종결을 입증하는 후속 SEC filing은 확인되지 않아 target/transaction shares를 현재 cap에 합산하지 않았다.
- [TCGX SEC 8-K, accession 0001193125-26-424754](https://www.sec.gov/Archives/edgar/data/2137965/000119312526424754/d43527d8k.htm), [RLYB SEC 424B3, accession 0001193125-26-422924](https://www.sec.gov/Archives/edgar/data/1739410/000119312526422924/d46731d424b3.htm)

## 종목별 통합 인덱스 반영

통합 JSON의 각 종목은 운영 API 주식수 및 종가 기반 추정, 가능한 경우 SEC CompanyFacts의 최근 공개 common shares fact와 filing accession/date, 최근 자본변동 확인 메모를 각각 보유한다. SAFX는 1억 달러 초과 추정, OPAD는 SEC 주식수×외부 종가 참고 추정으로 표시했고 WFF/OMH 실제 발행과 VVOS 전환가능 주식은 현재 shares와 별도 관리한다. 자세한 종목별 SEC 문서 링크와 일봉·EMA 및 swing/daytrade/surge 판단은 [63개 통합 색인](../../../reports/sec-edgar-analysis/coverage/us-under100m-rvol2-recent-month-20261023.json)과 각 회사 dossier에 있다.

## 남은 확인 범위

- SEC CompanyFacts의 최근 shares fact만으로는 현 시점의 정확한 주식수를 증명할 수 없다. facts가 없는 8개, 오래된 fact, 거래 뒤 발행/전환, 외국기업 ADS/class ratio는 회사별 원문 follow-up이 필요하다.
- 아래 시총은 2026-10-21 close 기반이다. 최신 장중 가격/호가가 아니다.
- 2026-10-23 이후 공시·거래는 이 기준일 분석에 반영하지 않는다.
