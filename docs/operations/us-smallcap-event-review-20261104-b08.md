# 미국 보통주 공시·뉴스 이벤트 검토 — 2026-11-04 배치 8

## 조사 범위와 기준

- 운영 서버 https://stockman.r-e.kr 공개 read-only GET과 localhost DB read-only 조회로 5,216개 활성 US COMMON_STOCK universe와 운영 fundamentals 5,216/5,216을 확인했다. 이전 700개 배치 ticker를 제외한 $100m 이하 USD 후보는 672개였다. metadata 200개와 공식 SEC ticker-exchange CIK를 교차 확인해 100개를 선정했고, 이름/법적 유형 확인으로 royalty trust unit 3개, 등록 투자펀드 1개, preferred certificate 1개를 배제했다.
- 선정 시총 범위 $9,402,493–$29,221,500; 저장 관측일은 2026-11-02로 모두 STALE이다. 이는 저장 시점의 범위만 나타내며 현재 시총 적격성을 뜻하지 않는다. 운영 instrument master active COMMON_STOCK, 6개 비보통주 flag=false 및 SEC CIK 일치 여부를 확인했다.
- 운영 market-intelligence 최신시각 2026-11-04T07:08:11.906Z: RSS 375건, bullish 47건. RSS는 후보 탐색에 사용했고 정규 이벤트는 SEC 원문 및 회사 IR 1차 출처를 확인한 일정만 포함한다.
- SEC submissions 100/100에서 4,432건을 수집했다(2025-11-04 포함~2026-11-05 미포함). 22개 사건 관련 SEC accession을 TARGETED_SECTION_REVIEW로, 회사 IR 발표 9개를 PRIMARY_SOURCE_REVIEWED로 기록했다. 전체 filing 본문을 전수 검토한 것은 아니다.

## 종목별·공시별 관리

- 배치 review/snapshot/news: [review JSON](../../data/us-smallcap-event-review-20261104-b08.json)
- issuer별 SEC submissions/accession 검토상태: [filing ledger](../../data/us-smallcap-filing-review-ledger-20261104-b08.json)
- 판정 재현 입력(SEC 및 회사 IR 1차 출처): [event definitions](../../data/us-smallcap-event-defs-20261104-b08.json)
- UI/API 정규 이벤트 원장: [market-impact-events.json](../../data/market-impact-events.json)
- 관리·검증 규칙: [이벤트 자료 관리 기준](us-smallcap-event-data-contract.md)

SEC 이벤트는 ticker+CIK+accession+eventId로 SEC 제출 원장에 연결하고, 회사 IR 이벤트는 ticker+고유 eventId+공식 URL로 별도 연결한다. 두 출처 유형을 SEC accession으로 가장하지 않는다.

## 확인된 예정 일정과 사건

| Ticker | 날짜 | 상태 | 일정·근거 및 위험 | 1차 출처 |
|---|---|---|---|---|
| LOCL | 2026-11-04 | CONFIRMED_SCHEDULED | 특별 주주총회: 11월 4일 09:00 MST 특별 주주총회. Nasdaq 상장주식 발행 안건의 승인 여부 미확정. | [0001140361-26-037241](https://www.sec.gov/Archives/edgar/data/1840780/000114036126037241/ny20081219x2_def14a.htm) |
| USEA | 2026-11-04 | CONFIRMED_SCHEDULED | 연례 주주총회: 11월 4일 17:00 그리스 현지시간 연례 주주총회. | [0001140361-26-038404](https://www.sec.gov/Archives/edgar/data/1912847/000114036126038404/ef20083021_6k.htm) |
| CVV | 2026-11-05 | CONFIRMED_SCHEDULED | 연례 주주총회: 11월 5일 10:00 EST 연례 주주총회. | [0001493152-26-044302](https://www.sec.gov/Archives/edgar/data/766792/000149315226044302/formdef14a.htm) |
| NXTC | 2026-11-06 | CONFIRMED_SCHEDULED | 델라웨어 법원 심리: 11월 6일 15:00 EST 법원 심리에서 과거 역분할 정관 변경 유효성 쟁점이 다뤄질 예정. 결과 미확정. | [0001104659-26-110971](https://www.sec.gov/Archives/edgar/data/1661059/000110465926110971/nxtc-20260921x8k.htm) |
| AAME | 2026-11-10 | CONFIRMED_SCHEDULED | 연례 주주총회: 11월 10일 10:00 EST 연례 주주총회. Nasdaq 상장유지 관련 통지 보유 상태를 별도 위험으로 추적. | [0001140361-26-040638](https://www.sec.gov/Archives/edgar/data/8177/000114036126040638/ny20063217x1_def14a.htm) |
| PPSI | 2026-11-12 | CONFIRMED_SCHEDULED | 연례 주주총회: 11월 12일 12:30 EST 연례 주주총회. | [0001493152-26-043622](https://www.sec.gov/Archives/edgar/data/1449792/000149315226043622/formdef14a.htm) |
| FIEE | 2026-11-19 | CONFIRMED_SCHEDULED | 연례 주주총회: 11월 19일 09:00 EST 연례 주주총회. 우선주 정관 조정, 수권주식 6천만주에서 3억주 확대, 1:2~1:15 역분할 권한 안건 포함. | [0001140361-26-039426](https://www.sec.gov/Archives/edgar/data/1467761/000114036126039426/ny20082883x2_def14a.htm) |
| FTFT | 2026-11-19 | CONFIRMED_SCHEDULED | 연례 주주총회: 11월 19일 10:30 홍콩시간 연례 주주총회. 보통주 수권 한도를 937만5천주에서 9억주로 확대하는 안건 포함. | [0001213900-26-110467](https://www.sec.gov/Archives/edgar/data/1066923/000121390026110467/ea0308047-02.htm) |
| DXLG | 2026-12-17 | CONFIRMED_SCHEDULED | 연례 주주총회: 12월 17일 11:30 EST 연례 주주총회. 역분할 및 수권주식 관련 안건을 검토해야 함. | [0001193125-26-443781](https://www.sec.gov/Archives/edgar/data/813298/000119312526443781/dxlg-20261102.htm) |
| GIFT | 2026-12-18 | CONFIRMED_SCHEDULED | 연례 주주총회: 12월 18일 12:00 EST 연례 주주총회. | [0001493152-26-047765](https://www.sec.gov/Archives/edgar/data/1760233/000149315226047765/formdef14a.htm) |
| FTCI | 2026-11-30 | CONFIRMED_SCHEDULED | 연례 주주총회: 11월 30일 11:00 CST 연례 주주총회. | [0001193125-26-425240](https://www.sec.gov/Archives/edgar/data/1828161/000119312526425240/ftci-20261019.htm) |
| BZAI | 2026-12-01 | CONFIRMED_SCHEDULED | 연례 주주총회: 12월 1일 10:00 EST 연례 주주총회. | [0001871638-26-000083](https://www.sec.gov/Archives/edgar/data/1871638/000187163826000083/a2026-defproxy.htm) |
| FKWL | 2026-12-04 | CONFIRMED_SCHEDULED | 연례 주주총회: 12월 4일 14:00 PST 연례 주주총회. | [0001683168-26-007904](https://www.sec.gov/Archives/edgar/data/722572/000168316826007904/franklin_def14a.htm) |
| AYTU | 2026-12-10 | CONFIRMED_SCHEDULED | 연례 주주총회: 12월 10일 10:00 MST 연례 주주총회. 50만주 규모 인센티브 계획 안건 포함. | [0001437749-26-033276](https://www.sec.gov/Archives/edgar/data/1385818/000143774926033276/aytu20260817_def14a.htm) |
| BAER | 2027-04-26 | CONFIRMED_SCHEDULED | Nasdaq 최저호가 규정준수 기한: Nasdaq 최저호가 기준 회복 기한. 연속 10거래일 요건 충족 여부는 후속 확인 필요. | [0001941536-26-000034](https://www.sec.gov/Archives/edgar/data/1941536/000194153626000034/baer-20261028.htm) |
| COOT | 2027-01-04 | CONFIRMED_SCHEDULED | Nasdaq 최저호가 규정준수 기한: Nasdaq 최소호가 회복 기한. 11월 3일 20-F 기준 회복 여부를 계속 확인해야 함. | [0001213900-26-077966](https://www.sec.gov/Archives/edgar/data/1959994/000121390026077966/ea0297931-6k_australian.htm) |
| BYSI | 2027-03-16 | CONFIRMED_SCHEDULED | Nasdaq 최저호가 규정준수 기한: 최저호가 규정준수 기한. | [0001171843-26-006116](https://www.sec.gov/Archives/edgar/data/1677940/000117184326006116/f8k_091826.htm) |
| BYSI | 2027-03-29 | CONFIRMED_SCHEDULED | Nasdaq 시가총액 기준 규정준수 기한: 최소 시가총액 기준 규정준수 기한. | [0001171843-26-006371](https://www.sec.gov/Archives/edgar/data/1677940/000117184326006371/f8k_100226.htm) |
| NSPR | 2027-01-13 | CONFIRMED_SCHEDULED | Nasdaq 최저호가 규정준수 기한: 최저호가 회복 기한. 최근 분기보고서에는 계속기업 관련 중대한 불확실성과 자금조달 위험이 언급됨. | [0001493152-26-038438](https://www.sec.gov/Archives/edgar/data/1433607/000149315226038438/form10-q.htm) |
| JVA | 2026-12-28 | CONFIRMED_SCHEDULED | 사업대출 만기: 사업 대출 만기일. 연장 또는 상환 여부 확인 필요. | [0001493152-26-042313](https://www.sec.gov/Archives/edgar/data/1007019/000149315226042313/form10-q.htm) |
| ABVC | 2027-06-30 | CONFIRMED_SCHEDULED | 전환사채 주주승인 기한: 전환주식 19.99% 제한 관련 주주 승인 기한. 미승인 시 채무불이행 조항 및 전환·희석 조건을 확인해야 함. | [0001213900-26-088348](https://www.sec.gov/Archives/edgar/data/1173313/000121390026088348/ea0300204-10q_abvcbio.htm) |
| RYET | 2027-03-31 | CONFIRMED_SCHEDULED | 인수거래 외부종료일: 인수계약상 외부종료일. 거래 종결이 보장되지 않으며 조건 미충족 시 종료 권리가 발생할 수 있음. | [0001731122-26-001381](https://www.sec.gov/Archives/edgar/data/1873454/000173112226001381/e7992_6-k.htm) |
| FTCI | 2026-11-04 | CONFIRMED_SCHEDULED | 3분기 실적 발표 및 컨퍼런스콜: 11월 4일 08:30 EST 실적 컨퍼런스콜. 실적 결과 미발표. | [회사 IR](https://investor.ftcsolar.com/news-events/events-and-presentations) |
| TEAD | 2026-11-05 | CONFIRMED_SCHEDULED | 3분기 실적 발표 및 컨퍼런스콜: 11월 5일 장전 실적 발표, 08:30 EST 컨퍼런스콜. 결과 미발표. | [회사 IR](https://investors.teads.com/news-releases/news-release-details/teads-release-third-quarter-2026-financial-results-november-5) |
| BRLT | 2026-11-05 | CONFIRMED_SCHEDULED | 3분기 실적 발표 및 컨퍼런스콜: 11월 5일 장전 실적 발표, 08:30 EST 컨퍼런스콜. 결과 미발표. | [회사 IR](https://investors.brilliantearth.com/) |
| QRHC | 2026-11-05 | CONFIRMED_SCHEDULED | 3분기 실적 발표: 회사가 안내한 11월 5일 3분기 실적 발표. 발표 시각 미공개. | [회사 IR](https://investors.qrhc.com/overview/default.aspx?languageid=1) |
| BSEM | 2026-11-12 | CONFIRMED_SCHEDULED | 3분기 실적 발표 및 컨퍼런스콜: 11월 12일 16:30 EST 실적 컨퍼런스콜. 결과 미발표. | [회사 IR](https://ir.biostemtechnologies.com/events/) |
| DAIO | 2026-11-12 | CONFIRMED_SCHEDULED | 3분기 실적 발표 및 컨퍼런스콜: 11월 12일 07:00 EST 실적 발표, 08:00 EST 컨퍼런스콜. | [회사 IR](https://www.dataio.com/investor-relations/news/events/) |
| NSPR | 2026-11-12 | CONFIRMED_SCHEDULED | 3분기 실적 발표 및 컨퍼런스콜: 11월 12일 08:30 EST 컨퍼런스콜. | [회사 IR](https://investors.inspiremd.com/news-releases/news-release-details/inspiremd-announce-third-quarter-2026-financial-results) |
| SPRU | 2026-11-12 | CONFIRMED_SCHEDULED | 3분기 실적 발표 및 컨퍼런스콜: 11월 12일 장후 실적 발표, 16:30 EST 컨퍼런스콜. | [회사 IR](https://investors.sprucepower.com/financials/quarterly-results/default.aspx) |
| INV | 2026-11-12 | CONFIRMED_SCHEDULED | 3분기 실적 발표 및 컨퍼런스콜: 11월 12일 장후 실적 발표, 17:00 EST 컨퍼런스콜. | [회사 IR](https://www.innventure.com/investors) |

## 현지시간과 KST

공시/IR 원문이 제공한 현지 시각과 KST 변환을 분리해 적었다. 원문에 시각이 없으면 임의로 회의 시각을 정하지 않았고 KST 시각도 변환하지 않았다.

| Ticker | 미국/현지 시간 | 한국시간(KST) |
|---|---|---|
| LOCL | 2026-11-04 09:00 MST | 2026-11-05 01:00 KST |
| USEA | 2026-11-04 17:00 EET | 2026-11-05 00:00 KST |
| CVV | 2026-11-05 10:00 EST | 2026-11-06 00:00 KST |
| NXTC | 2026-11-06 15:00 EST | 2026-11-07 05:00 KST |
| AAME | 2026-11-10 10:00 EST | 2026-11-11 00:00 KST |
| PPSI | 2026-11-12 12:30 EST | 2026-11-13 02:30 KST |
| FIEE | 2026-11-19 09:00 EST | 2026-11-19 23:00 KST |
| FTFT | 2026-11-19 10:30 HKT | 2026-11-19 11:30 KST |
| DXLG | 2026-12-17 11:30 EST | 2026-12-18 01:30 KST |
| GIFT | 2026-12-18 12:00 EST | 2026-12-19 02:00 KST |
| FTCI | 2026-11-30 11:00 CST | 2026-12-01 02:00 KST |
| BZAI | 2026-12-01 10:00 EST | 2026-12-02 00:00 KST |
| FKWL | 2026-12-04 14:00 PST | 2026-12-05 07:00 KST |
| AYTU | 2026-12-10 10:00 MST | 2026-12-11 02:00 KST |
| BAER | 2027-04-26 (시각 미공개) | 시각 미공개; 날짜 변환 불가 |
| COOT | 2027-01-04 (시각 미공개) | 시각 미공개; 날짜 변환 불가 |
| BYSI | 2027-03-16 (시각 미공개) | 시각 미공개; 날짜 변환 불가 |
| BYSI | 2027-03-29 (시각 미공개) | 시각 미공개; 날짜 변환 불가 |
| NSPR | 2027-01-13 (시각 미공개) | 시각 미공개; 날짜 변환 불가 |
| JVA | 2026-12-28 (시각 미공개) | 시각 미공개; 날짜 변환 불가 |
| ABVC | 2027-06-30 (시각 미공개) | 시각 미공개; 날짜 변환 불가 |
| RYET | 2027-03-31 (시각 미공개) | 시각 미공개; 날짜 변환 불가 |
| FTCI | 2026-11-04 08:30 EST | 2026-11-04 22:30 KST |
| TEAD | 2026-11-05 08:30 EST | 2026-11-05 22:30 KST |
| BRLT | 2026-11-05 08:30 EST | 2026-11-05 22:30 KST |
| QRHC | 2026-11-05 (시각 미공개) | 시각 미공개; 날짜 변환 불가 |
| BSEM | 2026-11-12 16:30 EST | 2026-11-13 06:30 KST |
| DAIO | 2026-11-12 08:00 EST | 2026-11-12 22:00 KST |
| NSPR | 2026-11-12 08:30 EST | 2026-11-12 22:30 KST |
| SPRU | 2026-11-12 16:30 EST | 2026-11-13 06:30 KST |
| INV | 2026-11-12 17:00 EST | 2026-11-13 07:00 KST |

## 100개 종목 universe

CMCT, AHT, PSHG, LFT, ORIO, AURE, GPMT, TXMD, BSEM, NSPR, AYTU, UTSI, MSGM, ANPA, PLUT, DUO, STEM, ETS, WXM, ATOS, LOCL, AAME, NXPL, COOT, VGAS, SMXT, TGE, LIVE, BLNE, SPPL, TAOX, QRHC, VHUB, MIRA, KTCC, NOMA, GIFT, GRAN, APWC, TREO, CRVO, FIEE, SWAG, USEA, DCGO, BRLS, DAIO, SHPH, KMRK, BAER, SPRU, HOLO, FTCI, DXLG, FTFT, ONMD, PLRZ, PETS, FKWL, EFOI, NNOX, CELU, SEAT, KAZR, RYET, ONEG, ALGS, CRWS, FNUC, PRHI, BCTX, BYSI, BRLT, GROW, ABVC, CVV, AIFA, WSHP, RNAZ, INV, ESLA, BOF, MLGO, PPSI, RAND, BZAI, CLPS, RMTI, NA, TEAD, JVA, MBAI, BHST, BLIV, CREX, HHS, NXTC, GAIA, ELWT, RYOJ

## 해석 및 한계

- CONFIRMED_SCHEDULED는 공시나 회사 IR에 날짜가 명시된 회의·콜·계약상 기한을 뜻하며 결과 확정을 뜻하지 않는다. 제출자료에 적힌 날짜가 추정치인 경우에는 별도 ESTIMATED로 표기한다. 이벤트 자체를 호재/악재로 판정하지 않는다.
- 회의·콜 시간은 원문에 명시된 현지 시간대를 보존하고 가능한 경우 event record의 KST 필드에 병기했다. 현지 시각이 원문에서 확인되지 않으면 시간을 추정하지 않았다.
- 주총 안건 중 수권주식 확대, 전환주식, 역분할 및 인센티브 계획은 승인/집행 전 잠재 위험으로 적었다. Nasdaq 기한은 기한 통과 자체가 준수 회복을 입증하지 않는다. 법원 심리·인수 outside date도 결과/종결을 보장하지 않는다.
- 사건별 발표 전후 가격 표본 분석을 하지 않았으므로 전 이벤트 direction=UNCERTAIN, impactHorizon=UNKNOWN이다. 공식적으로 확인되지 않은 발행주식·유통주식·금액·시장규모는 만들지 않았다.
- 검토한 SEC 제출 excerpt/sections를 넘어 모든 첨부문서나 4,432건 본문을 읽은 것은 아니다. 시총 snapshot stale과 시간대/일정 후속 변경은 남은 데이터 한계다. 운영 write/refresh 및 알림 전송은 수행하지 않았다.
