# 미국 보통주 공시·뉴스 이벤트 검토 — 2026-11-04 배치 6

## 조사 범위와 기준

- 미국 NAS/NYS/AMS active COMMON_STOCK 100개를 선정했다. 로컬 localhost DB에서 활성코드만 read-only로 조회한 뒤 운영 public GET으로 fundamentals와 종목 마스터를 재검증했다. SEC 공식 company_tickers_exchange.json의 단일 ticker–CIK 및 운영 CIK가 일치한다.
- 운영 KIS_OVERSEAS_PRICE USD 시총 snapshot 양수·1억 달러 이하 후보를 사용했다. 4,720개 운영 응답에서 772개 후보를 얻었고, CIK 일치 및 종목 유형 확인 후 100개를 골랐다. 100개 전부 시총 관측일은 2026-11-02로 조사일 기준 STALE이며 현재 시총을 보장하지 않는다.
- 운영 intelligence 100/100 성공, 최신 snapshot 2026-11-04T03:54:15Z. RSS 516건, bullish 분류 73건, 운영 SEC event row 0건이다.
- 2025-11-04 포함~2026-11-05 미포함 SEC submissions 4,274건을 accession ledger에 수록했다. 10월 20일 이후 이벤트 관련 제출 109건을 순차 GET해 109/109 HTTP 200을 확인했다. 그중 아래 15건만 관련 구간을 직접 읽어 TARGETED_SECTION_REVIEW로 표시하고 나머지 4,259건은 INVENTORY_ONLY다.

## 종목별·공시별 보관

운영 종목 snapshot·뉴스·이벤트는 [review JSON](../../data/us-smallcap-event-review-20261104-b06.json), SEC accession별 filing 상태·원문 URL은 [filing ledger](../../data/us-smallcap-filing-review-ledger-20261104-b06.json), 판정 재현 입력은 [event definitions](../../data/us-smallcap-event-defs-20261104-b06.json)에 저장했다. 정규 이벤트 원장 [market-impact-events.json](../../data/market-impact-events.json)과 ticker·CIK·accession·eventId로 연결한다.

## 직접 확인한 이벤트

| Ticker | 날짜 | 상태 | 이벤트 | SEC filing |
|---|---|---|---|---|
| GIXI | 2026-12-08 | CONFIRMED_SCHEDULED | 특별 주총 17:00 Israel / 12-09 00:00 KST | [6-K 049791](https://www.sec.gov/Archives/edgar/data/1782265/000149315226049791/form6-k.htm) |
| IDAI | 2026-12-15 | CONFIRMED_SCHEDULED | 가상 연례 주총 09:00 EST / 23:00 KST | [DEF 14A 000066](https://www.sec.gov/Archives/edgar/data/1718939/000171893926000066/tstamp-def14axagm2026102926.htm) |
| OPTT | 2026-11-24 | CONFIRMED_SCHEDULED | 특별 주총: 20% 초과 발행·최대 1:6.6 역분할 권한, 09:00 ET / 23:00 KST | [DEF 14A 049264](https://www.sec.gov/Archives/edgar/data/1378140/000149315226049264/formdef14a.htm) |
| ESYN | 2026-12-10 | CONFIRMED_SCHEDULED | 가상 연례 주총 09:00 EST / 23:00 KST | [DEF 14A 048698](https://www.sec.gov/Archives/edgar/data/1897245/000149315226048698/formdef14a.htm) |
| BTLN | 2026-12-17 | CONFIRMED_SCHEDULED | 가상 연례 주총 11:00 EST / 12-18 01:00 KST | [DEF 14A 048521](https://www.sec.gov/Archives/edgar/data/1854445/000149315226048521/formdef14a.htm) |
| AEON | 2026-12-15 | CONFIRMED_SCHEDULED | 특별 주총: 역분할 권한 등 13:00 PT / 12-16 06:00 KST | [DEF 14A 000074](https://www.sec.gov/Archives/edgar/data/1837607/000183760726000074/aeon-20261026xdef14a.htm) |
| TOVX | 2026-11-18 | CONFIRMED_SCHEDULED | 특별 주총 15:30 CET / 23:30 KST | [DEF 14A 117417](https://www.sec.gov/Archives/edgar/data/894158/000110465926117417/tm2627846d1_def14a.htm) |
| DCM | 2026-11-18 | CONFIRMED_SCHEDULED | 가상 연례 주총 12:00 ET / 11-19 02:00 KST | [DEF 14A 117433](https://www.sec.gov/Archives/edgar/data/102109/000110465926117433/tm2627349d1_def14a.htm) |
| REED | 2026-11-06 | ESTIMATED | 17,421,602주 사모발행, $0.574/주, 약 $10m gross; 종결 목표일(on/about) | [8-K 049780](https://www.sec.gov/Archives/edgar/data/1140215/000149315226049780/form8-k.htm) |
| KPTI | 2026-11-02 | REPORTED | 텍사스 남부 파산법원 Chapter 11 자발적 신청 | [8-K 444164](https://www.sec.gov/Archives/edgar/data/1503802/000119312526444164/d141618d8k.htm) |
| OPTT | 2026-11-02 | REPORTED | 12% 어음 액면 $373,750, 매입대금 $325,000; 최대 $2.875m 추가 tranche는 별도합의 조건 | [8-K 049788](https://www.sec.gov/Archives/edgar/data/1378140/000149315226049788/form8-k.htm) |
| ELME | 2026-11-05 | CONFIRMED_SCHEDULED | NYSE Form 25-NSE 이후 10 calendar days에 상장폐지 효력 예정; OTC ELMES 거래 개시 공시 | [8-K 121321](https://www.sec.gov/Archives/edgar/data/104894/000110465926121321/tm2628645d1_8k.htm) |
| MASK | 2026-10-30 | REPORTED | Nasdaq staff 상장폐지 결정 통지, 청문 항소 절차 | [6-K 005106](https://www.sec.gov/Archives/edgar/data/1993097/000118518526005106/mask6k102926.htm) |
| PAVM | 2026-10-22 | COMPLETED | 공모 종결, gross proceeds $15.0m | [8-K 048138](https://www.sec.gov/Archives/edgar/data/1624326/000149315226048138/form8-k.htm) |
| AQB | 2026-10-29 | REPORTED | 최대 $1m bridge loan 약정, 보고일 현재 $500k 인출 | [8-K 000109](https://www.sec.gov/Archives/edgar/data/1603978/000160397826000109/aqb-20261029x8k.htm) |

## 해석과 검증 한계

주총 표결, 역분할 권한 및 20% 초과 발행 안건은 승인·실행을 뜻하지 않는다. REED 종결일은 회사가 제시한 예상일이다. 상장유지·거래소 퇴출·파산, 부채·공모 및 잠재희석 위험을 이벤트별로 분리했다. 모든 이벤트 방향은 UNCERTAIN이며 결과가 주가 방향을 보장하지 않는다.

배치 validator 결과는 100 issuer, 4,274 filings, 15 events, 15 accession-event links, INVENTORY_ONLY 4,259 / TARGETED_SECTION_REVIEW 15다. 4,274건 제출 원문 전수검토는 아니다. 운영 시총 snapshot이 모두 stale해 오늘 시총 기준 적격성을 입증하지 않는다.
