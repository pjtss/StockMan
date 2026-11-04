# 미국 보통주 소형주 공시·뉴스 이벤트 검토 — 2026-11-04 배치 9

## 조사 범위와 기준

- 운영 서버 공개 read-only GET과 로컬 DB read-only 조회로 활성 US COMMON_STOCK universe 및 fundamentals 전체 응답 5,216/5,216을 확인했다. 앞선 800개 종목을 제외한 저장 USD 시총 $100m 이하 후보 569개 중 최저 시총부터 운영 metadata 180건과 SEC company ticker-exchange master의 유일 CIK를 대조해 100개를 구성했다. 법적 유형을 확인해 예탁증서·유닛·펀드·우선증권 등을 추가 배제했다.
- 선정 종목의 시총 스냅샷 범위는 $2,467,046–$37,074,489이고 모두 STALE, 관측일은 2026-11-02다. 저장 기준일의 탐색 결과이지 조사일 실시간 시총 적격성 인증은 아니다.
- 운영 market-intelligence는 100/100 응답, 기준 시각 2026-11-04T08:55:18.402Z; RSS 263건, bullish 후보 41건이다. 뉴스는 후보 탐색에 쓰고 정규 이벤트는 SEC 원문·회사 IR 1차 자료를 확인해 수록했다.
- SEC submissions 100/100에서 4,758건을 인벤토리화했다(2025-11-04 포함~2026-11-05 미포함). 2026-08-01 이후 SEC 원문 362건을 HTTP 200으로 읽고, 날짜 후보 73건 모두 이벤트 또는 제외 판정과 연결했다. SEC filing 이벤트 27건이 26개 고유 accession에 연결되며 공식 회사 IR 이벤트 8건을 더해 총 35건이다. 전체 제출 본문 전수 검토는 아니다.

## 종목별·공시별 보존 구조

- 종목 snapshot/RSS 및 SEC 인벤토리: [배치 review](../../data/us-smallcap-event-review-20261104-b09.json)
- issuer별 accession 검토 상태: [filing ledger](../../data/us-smallcap-filing-review-ledger-20261104-b09.json)
- SEC/회사 IR 판정 재현 입력: [event definitions](../../data/us-smallcap-event-defs-20261104-b09.json)
- 공개 정규 이벤트: [market-impact-events.json](../../data/market-impact-events.json)
- 자료 연결·검증 기준: [이벤트 자료 관리 기준](us-smallcap-event-data-contract.md)

SEC 이벤트는 ticker+CIK+accession+eventId로, 회사 IR은 ticker+고유 IR eventId+공식 URL로 연결한다. 이벤트 후보에서 제외된 SEC 제출은 ledger의 EXPLICITLY_EXCLUDED 상태와 이유를 보존한다. 날짜 후보 누락은 generator가 실패 처리한다.

## 확인된 일정과 사건

| Ticker | 미국 현지 날짜 | 현지 시각 | 상태 | 이벤트·근거·위험 | 1차 출처 |
|---|---|---|---|---|---|
| PW | 2026-11-10 | 10:30 EST | CONFIRMED_SCHEDULED | 연기된 연례 주주총회: 2026년 10월 27일 회의는 제안 3의 의결 정족수 미달로 모든 안건에 대해 연기됐다. 재개 회의는 11월 10일 10:30 EST. 제안 3은 Series A 우선주의 권리 변경과 관련돼 결과·희석 효과는 미확정이다. 위험: Series A 우선주 권리 변경 및 의결 결과 미확정 | [SEC 0001493152-26-049063](https://www.sec.gov/Archives/edgar/data/1532619/000149315226049063/form8-k.htm) |
| IHT | 2027-12-24 | 시각 미공개 | CONFIRMED_SCHEDULED | NYSE American 상장유지 계획 기한: NYSE American은 상장 유지 기준 미달 상태인 회사의 compliance plan을 수락하고 2027년 12월 24일까지 시정 기간을 부여했다. 계획 준수와 상장유지는 보장되지 않는다. 위험: NYSE American continued-listing 기준 미달 상태; 기한까지 미시정 시 상장 위험 | [SEC 0001493152-26-042648](https://www.sec.gov/Archives/edgar/data/82473/000149315226042648/form8-k.htm) |
| SRXH | 2027-03-15 | 시각 미공개 | CONFIRMED_SCHEDULED | CERo 인수 go-shop 대안제안 외부기한: go-shop 조항의 대안 인수제안은 제3자 금융조달에 의존하지 않고 2027년 3월 15일 이내 종결을 요구해야 한다. 이는 대안제안 조건이지 기존 거래 종결 확정일이 아니다. 위험: 대안제안·거래 종결 미확정; 부채 상환·담보 해제 및 종료 수수료 조건 | [SEC 0001493152-26-046085](https://www.sec.gov/Archives/edgar/data/1471727/000149315226046085/form8-k.htm) |
| PMI | 2027-02-28 | 시각 미공개 | CONFIRMED_SCHEDULED | 특수관계자 대출 만기: 2026년 2월 차입한 $0.7m 특수관계자 대출(연 6%)의 원금과 이자는 회사의 서면 선택 또는 대주 요구에 따라 2027년 2월 28일 현금 상환 대상이다. 추가 0% 대출도 2026년 10월까지 누적 $0.5m 공시됐다. 위험: 특수관계자 채무의 현금 상환·연장 및 유동성 위험 | [SEC 0001437749-26-034708](https://www.sec.gov/Archives/edgar/data/2030617/000143774926034708/pmi20261030_8k.htm) |
| PMI | 2027-09-30 | 시각 미공개 | CONFIRMED_SCHEDULED | 전환사채 만기: 2026년 9월 발행 전환사채 만기는 2027년 9월 30일이다. 잔액·전환 조건과 실제 상환 여부는 후속 확인이 필요하다. 위험: 전환에 따른 잠재 희석 및 현금상환 위험 | [SEC 0001437749-26-032125](https://www.sec.gov/Archives/edgar/data/2030617/000143774926032125/pmi20260916_8k.htm) |
| ATCH | 2027-02-03 | 시각 미공개 | CONFIRMED_SCHEDULED | $500,000 Debenture 만기: 회사는 $500,000 Debenture 만기를 2027년 2월 3일로 연장했으며 특정 상황에서는 조기 상환될 수 있다. 대주는 이사와 관련된 entity다. 위험: 조기 상환 조항과 특수관계자 거래 위험 | [SEC 0001493152-26-042800](https://www.sec.gov/Archives/edgar/data/1963088/000149315226042800/form8-k.htm) |
| IGC | 2026-12-02 | 11:00 EST | CONFIRMED_SCHEDULED | 연례 주주총회: 연례 주주총회는 메릴랜드 Potomac에서 12월 2일 11:00 현지시간 개최 예정이다. 위험: 별도 사항 미공개 | [SEC 0001185185-26-004896](https://www.sec.gov/Archives/edgar/data/1326205/000118518526004896/igcdef14a102126.htm) |
| RAVE | 2026-12-10 | 15:30 CST | CONFIRMED_SCHEDULED | 연례 주주총회: 연례 주주총회는 텍사스 The Colony에서 12월 10일 15:30 현지시간 개최 예정이다. 위험: 별도 사항 미공개 | [SEC 0001140361-26-040557](https://www.sec.gov/Archives/edgar/data/718332/000114036126040557/ny20083144x1_def14a.htm) |
| GPUS | 2027-12-14 | 시각 미공개 | CONFIRMED_SCHEDULED | 담보대출 만기 및 추가 차입: 담보 대출 만기가 2027년 12월 14일까지 연장됐고 관련 추가 대출 $22,580,645가 공시됐다. 담보·차환·상환 조건을 추적해야 하며 기한은 상환 확정일이 아니다. 위험: 담보 제공, 차환·상환 및 추가 부채 부담 | [SEC 0001214659-26-012236](https://www.sec.gov/Archives/edgar/data/896493/000121465926012236/z9292618k.htm) |
| BOSC | 2026-12-10 | 시각 미공개 | CONFIRMED_SCHEDULED | 연례 주주총회: Form 6-K가 2026년 12월 10일 연례 주주총회 Notice 및 Proxy Statement를 첨부했다. 확인한 제출 표지에는 개최 시각이 없어 시간은 미공개다. 위험: 별도 사항 미공개 | [SEC 0001213900-26-111006](https://www.sec.gov/Archives/edgar/data/1005516/000121390026111006/ea0309029-01.htm) |
| FLNA | 2027-03-16 | 시각 미공개 | CONFIRMED_SCHEDULED | Nasdaq 최소호가 회복 기한: $1.00 최소호가 요건 미달 통지를 받았으며 Nasdaq 규정에 따라 2027년 3월 16일까지 회복해야 한다. 회복에는 $1.00 이상 종가 10거래일 연속이 필요하다. 위험: 주가·상장유지 위험; 역분할 가능성을 포함한 대응 미확정 | [SEC 0001437749-26-030751](https://www.sec.gov/Archives/edgar/data/1069530/000143774926030751/sava20260918_8k.htm) |
| SAIH | 2026-12-31 | 시각 미공개 | CONFIRMED_SCHEDULED | 인수합병 계약상 외부종료일: Merger Agreement는 2026년 12월 31일까지 거래가 종결되지 않으면 해지 가능하며, 특정 조건에서 90일 연장될 수 있다. 종결은 정부 승인·기타 계약 조건에 달려 있다. 위험: 거래 종결 조건·승인·연장 미확정 | [SEC 0001213900-26-087323](https://www.sec.gov/Archives/edgar/data/1847075/000121390026087323/ea0301306-6k_saiheat.htm) |
| HIT | 2026-11-10 | 10:00 EST | CONFIRMED_SCHEDULED | 연례 주주총회: 2026년 연례 주주총회는 11월 10일 10:00 EDT 가상 회의로 예정됐다. 보상안 일부는 주주 승인에 달려 있고 Nasdaq 규정준수 사안도 별도 추적 대상이다. 위험: 임원 보상 주식의 승인·잠재 희석; Nasdaq 거버넌스 및 최소호가 시정기간 | [SEC 0001213900-26-108738](https://www.sec.gov/Archives/edgar/data/2019505/000121390026108738/ea0307288-02.htm) |
| HIT | 2027-04-12 | 시각 미공개 | CONFIRMED_SCHEDULED | Nasdaq 최소호가 회복 기한: Nasdaq 최소호가 요건 회복 최초 기한은 2027년 4월 12일이다. 회사는 Nasdaq 거버넌스 시정기간도 별도로 통보받아 두 위험을 구별해 추적한다. 위험: $1.00 최소호가와 Nasdaq governance 규정 시정 미확정 | [SEC 0001213900-26-110269](https://www.sec.gov/Archives/edgar/data/2019505/000121390026110269/ea0308864-8k_health.htm) |
| CNVS | 2026-12-08 | 시각 미공개 | CONFIRMED_SCHEDULED | 연례 주주총회: DEF 14A에 2026년 12월 8일 연례 주주총회 개최가 명시됐다. 본문에서 시각은 미확인 상태로 기록한다. 위험: 별도 사항 미공개 | [SEC 0001193125-26-436230](https://www.sec.gov/Archives/edgar/data/1173204/000119312526436230/cnvs-20261028.htm) |
| GRDX | 2026-12-31 | 시각 미공개 | CONFIRMED_SCHEDULED | $5m 담보 전환사채 만기: Third A&R Secured Convertible Note 원금 $5m의 만기는 2026년 12월 31일 또는 change-of-control 거래 종결 시점 중 빠른 날이다. 만기 후 연 7% 현금 이자가 공시됐다. 위험: 현금 상환·전환 희석 및 기한 도래 위험 | [SEC 0001104659-26-119672](https://www.sec.gov/Archives/edgar/data/1604191/000110465926119672/tm2628084d2_8k.htm) |
| PTHS | 2027-02-01 | 시각 미공개 | CONFIRMED_SCHEDULED | 합병 계약 외부종료일: 합병이 2027년 2월 1일까지 완료되지 않으면 해지할 수 있다. S-4 효력 시점과 기타 조건에 따라 2027년 3월 31일까지 자동 연장될 수 있다. 위험: 주주 승인·S-4 효력·기타 종결조건 및 거래 실패 위험 | [SEC 0001104659-26-120457](https://www.sec.gov/Archives/edgar/data/1919246/000110465926120457/tm2628523d1_8k.htm) |
| STI | 2026-11-18 | 시각 미공개 | CONFIRMED_SCHEDULED | 연례 주주총회: 주주총회는 11월 18일 개최 예정이며 DEF 14A 확인 원문상 시각은 확인되지 않았다. 주주 승인 대상 안건과 보상 희석은 결과 미확정이다. 위험: 주주 승인 안건 및 보상 희석 결과 미확정 | [SEC 0001213900-26-107695](https://www.sec.gov/Archives/edgar/data/1881551/000121390026107695/ea0306171-03.htm) |
| NXB | 2027-10-22 | 시각 미공개 | CONFIRMED_SCHEDULED | Term loan 만기: 대출 약정의 미상환 원금과 이자는 2027년 10월 22일 만기이며 대주와 서면 합의하면 연장 가능하다. 위험: 차환·연장 합의 여부 및 현금 상환 위험 | [SEC 0001493152-26-049199](https://www.sec.gov/Archives/edgar/data/2067767/000149315226049199/form8-k.htm) |
| ELUT | 2027-02-02 | 시각 미공개 | CONFIRMED_SCHEDULED | Nasdaq 최소호가 회복 기한: Nasdaq 통지상 최소호가 요건 회복 시한은 2027년 2월 2일이다. 공시에 명시된 10거래일 연속 $1.00 회복 요건을 별도 추적한다. 위험: 최소호가 기준 미회복 시 상장유지 위험 | [SEC 0001104659-26-092718](https://www.sec.gov/Archives/edgar/data/1708527/000110465926092718/tm2622521d1_8k.htm) |
| ATHR | 2026-11-27 | 시각 미공개 | CONFIRMED_SCHEDULED | Nasdaq 연례 주주총회 규정 시정계획 제출기한: 연례 주주총회 개최시한을 넘겨 Nasdaq Rule 5620(a) 미준수 통지를 받았다. 시정계획 제출은 11월 27일까지이며, Nasdaq 수락 시 회계연도 종료 후 180일까지 회복 기간이 주어질 수 있다. 위험: 미준수 통지 및 plan 수락·예외 승인 미확정 | [SEC 0001493152-26-047397](https://www.sec.gov/Archives/edgar/data/2026353/000149315226047397/form8-k.htm) |
| ATHR | 2027-03-29 | 시각 미공개 | CONFIRMED_SCHEDULED | Nasdaq 연례 주주총회 규정 시정기한: Nasdaq이 계획을 수락할 경우 2027년 3월 29일까지 연례 주주총회 규정을 회복해야 할 수 있다. 회사 공시는 계획 수락 전제로 제시하므로 조건부 예상 기한이다. 위험: Nasdaq의 compliance-plan 수락 여부 미확정 | [SEC 0001493152-26-047397](https://www.sec.gov/Archives/edgar/data/2026353/000149315226047397/form8-k.htm) |
| CIRC | 2026-12-10 | 10:00 EST | CONFIRMED_SCHEDULED | 연례 주주총회: DEF 14A에 따르면 연례 주주총회는 12월 10일 10:00 EST 가상 개최 예정이다. 회사는 1:5~1:10 범위 역분할 권한을 안건으로 요청했으며 실행 여부·비율은 미확정이다. 위험: 1:5~1:10 역분할 권한 제안; 실제 승인·실행 여부와 시점 미확정 | [SEC 0001213900-26-115574](https://www.sec.gov/Archives/edgar/data/1605888/000121390026115574/ea0309173-03.htm) |
| NEPH | 2026-11-25 | 11:00 EST | CONFIRMED_SCHEDULED | 연례 주주총회: 이사회는 11월 25일 11:00 EST 가상 연례 주주총회를 확정했다. 위험: 별도 사항 미공개 | [SEC 0001493152-26-046814](https://www.sec.gov/Archives/edgar/data/1196298/000149315226046814/form8-k.htm) |
| RDI | 2026-12-03 | 14:00 EST | CONFIRMED_SCHEDULED | 연례 주주총회: Reading International 2026 연례 주주총회는 12월 3일 14:00 EST 온라인으로 시작 예정이다. 위험: 별도 사항 미공개 | [SEC 0000716634-26-000036](https://www.sec.gov/Archives/edgar/data/716634/000071663426000036/rdi-20261203xdef14a.htm) |
| IXHL | 2026-12-17 | 10:00 GST | CONFIRMED_SCHEDULED | 연례 주주총회: 연례 주주총회는 12월 17일 10:00 Gulf Standard Time 온라인으로 열린다. GSΤ(UTC+4)는 EST가 아니므로 KST 15:00로 변환한다. 위험: 별도 사항 미공개 | [SEC 0001213900-26-113003](https://www.sec.gov/Archives/edgar/data/1873875/000121390026113003/ea0309495-def14a_incannex.htm) |
| NNVC | 2026-11-21 | 10:00 EST | CONFIRMED_SCHEDULED | 연례 주주총회: 연례 주주총회는 11월 21일 10:00 EDT Connecticut 현지 대면 개최 예정이다. DST 종료 후 실제 현지 표기는 EST(UTC−5)이며 KST로 변환했다. 위험: 별도 사항 미공개 | [SEC 0001104659-26-114606](https://www.sec.gov/Archives/edgar/data/1379006/000110465926114606/tm2626953d1_def14a.htm) |
| VTSI | 2026-11-12 | 16:30 EST | CONFIRMED_SCHEDULED | 3분기 실적 컨퍼런스콜: 2026-11-12 16:30 EST에 2026년 3분기 실적 발표/컨퍼런스콜이 예정됐다. 결과는 발표 전이며, 상세 안내는 발행사 IR 원문을 따른다. 위험: 별도 사항 미공개 | [회사 IR](https://www.virtra.com/virtra-sets-third-quarter-conference-call-for-nov-12/) |
| NSYS | 2026-11-12 | 16:30 EST | CONFIRMED_SCHEDULED | 3분기 실적 컨퍼런스콜: 2026-11-12 16:30 EST에 2026년 3분기 실적 발표/컨퍼런스콜이 예정됐다. 결과는 발표 전이며, 상세 안내는 발행사 IR 원문을 따른다. 위험: 별도 사항 미공개 | [회사 IR](https://www.nortechsys.com/events-and-presentations/) |
| BCHT | 2026-11-12 | 17:00 EST | CONFIRMED_SCHEDULED | 3분기 실적 컨퍼런스콜: 2026-11-12 17:00 EST에 2026년 3분기 실적 발표/컨퍼런스콜이 예정됐다. 결과는 발표 전이며, 상세 안내는 발행사 IR 원문을 따른다. 위험: 별도 사항 미공개 | [회사 IR](https://ir.birchtech.com/news-events/press-releases/detail/738/birchtech-corp-to-host-third-quarter-2026-earnings-call-on-november-12-at-5-00-p-m-eastern-time) |
| BTMD | 2026-11-04 | 17:00 EST | CONFIRMED_SCHEDULED | 3분기 실적 발표 및 컨퍼런스콜: 2026-11-04 17:00 EST에 2026년 3분기 실적 발표/컨퍼런스콜이 예정됐다. 결과는 발표 전이며, 상세 안내는 발행사 IR 원문을 따른다. 위험: 별도 사항 미공개 | [회사 IR](https://ir.biote.com/news-releases/news-release-details/biote-schedules-third-quarter-2026-financial-results-release-and) |
| WKHS | 2026-11-12 | 16:30 EST | CONFIRMED_SCHEDULED | 3분기 실적 컨퍼런스콜: 2026-11-12 16:30 EST에 2026년 3분기 실적 발표/컨퍼런스콜이 예정됐다. 결과는 발표 전이며, 상세 안내는 발행사 IR 원문을 따른다. 위험: 별도 사항 미공개 | [회사 IR](https://ir.workhorse.com/news-events/press-releases/detail/340/workhorse-group-sets-date-for-third-quarter-earnings) |
| FLL | 2026-11-05 | 16:30 EST | CONFIRMED_SCHEDULED | 3분기 실적 발표 및 컨퍼런스콜: 2026-11-05 16:30 EST에 2026년 3분기 실적 발표/컨퍼런스콜이 예정됐다. 결과는 발표 전이며, 상세 안내는 발행사 IR 원문을 따른다. 위험: 별도 사항 미공개 | [회사 IR](https://investors.fullhouseresorts.com/news-events/press-releases/detail/324/full-house-resorts-announces-third-quarter-earnings-release) |
| QTI | 2026-11-10 | 16:30 EST | CONFIRMED_SCHEDULED | 3분기 실적 컨퍼런스콜: 2026-11-10 16:30 EST에 2026년 3분기 실적 발표/컨퍼런스콜이 예정됐다. 결과는 발표 전이며, 상세 안내는 발행사 IR 원문을 따른다. 위험: 별도 사항 미공개 | [회사 IR](https://ir.qtimaging.com/) |
| AVD | 2026-11-09 | 17:00 EST | CONFIRMED_SCHEDULED | 3분기 실적 발표 및 컨퍼런스콜: 2026-11-09 17:00 EST에 2026년 3분기 실적 발표/컨퍼런스콜이 예정됐다. 결과는 발표 전이며, 상세 안내는 발행사 IR 원문을 따른다. 위험: 별도 사항 미공개 | [회사 IR](https://investors.american-vanguard.com/) |

## 현지 시각과 한국시간

| Ticker | 미국/현지 시간 | KST |
|---|---|---|
| PW | 2026-11-10 10:30 EST | 2026-11-11 00:30 KST |
| IGC | 2026-12-02 11:00 EST | 2026-12-03 01:00 KST |
| RAVE | 2026-12-10 15:30 CST | 2026-12-11 06:30 KST |
| HIT | 2026-11-10 10:00 EST | 2026-11-11 00:00 KST |
| CIRC | 2026-12-10 10:00 EST | 2026-12-11 00:00 KST |
| NEPH | 2026-11-25 11:00 EST | 2026-11-26 01:00 KST |
| RDI | 2026-12-03 14:00 EST | 2026-12-04 04:00 KST |
| IXHL | 2026-12-17 10:00 GST | 2026-12-17 15:00 KST |
| NNVC | 2026-11-21 10:00 EST | 2026-11-22 00:00 KST |
| VTSI | 2026-11-12 16:30 EST | 2026-11-13 06:30 KST |
| NSYS | 2026-11-12 16:30 EST | 2026-11-13 06:30 KST |
| BCHT | 2026-11-12 17:00 EST | 2026-11-13 07:00 KST |
| BTMD | 2026-11-04 17:00 EST | 2026-11-05 07:00 KST |
| WKHS | 2026-11-12 16:30 EST | 2026-11-13 06:30 KST |
| FLL | 2026-11-05 16:30 EST | 2026-11-06 06:30 KST |
| QTI | 2026-11-10 16:30 EST | 2026-11-11 06:30 KST |
| AVD | 2026-11-09 17:00 EST | 2026-11-10 07:00 KST |

원문 시각이 확인되지 않으면 현지 시각·시간대·KST는 비워 둔다. EST/CST는 이벤트 일자의 DST 상태를 적용했으며 IXHL은 Gulf Standard Time(UTC+4)을 원문대로 보존했다.

## 100개 종목 universe

PW, IHT, MXC, SRXH, PMI, ATCH, CKX, JOB, IGC, GNS, SMJF, CVM, CPHI, MLSS, LSF, UAVS, FLD, AIOS, DRIO, MGX, BRAG, VTSI, NSYS, PMN, BCHT, AARD, RAVE, FBGL, ACCL, GPUS, EYPT, BOSC, FLNA, SAIH, FLL, SYPR, AERT, COPR, PXLW, HIT, CABO, COSM, BEAT, ANGH, VAI, QTI, YIBO, BHM, KG, BNAI, IXHL, BTMD, TOON, GMHS, ACET, KOSS, COHN, WKHS, CENN, PRPO, ATHR, AVD, UG, LVLU, GAME, RPID, MI, EHLD, ALDX, NNVC, SJ, LITS, FUFU, CIRC, NEPH, BRIA, RDI, CNVS, EDSA, STKS, RMCO, SLMT, AIFC, CRGO, RYM, NTIP, GRDX, ZDGE, YSXT, KNDI, GOAI, NSRX, PTHS, STI, STRR, SNT, TELA, NXB, MIND, ELUT

## 해석과 제한

- CONFIRMED_SCHEDULED는 공시된 일정/기한이며 거래 종결·규정준수 회복·표결 통과·대출 상환·실적 결과를 확정하지 않는다. ATHR 2027-03-29는 Nasdaq 계획 수락을 전제로 하는 조건부 기한이다.
- 프록시 보상/베스팅 날짜, 사전 투표·자료 신청 마감, 이미 지난 회의 및 회계기간 종료일은 별도 촉매로 올리지 않았다.
- 각 이벤트의 과거 가격반응 표본은 검증하지 않아 direction=UNCERTAIN, impactHorizon=UNKNOWN이다. 임의의 TAM·매출·유통주식수는 추가하지 않았다.
- 운영 API/DB write, refresh, 알림 전송은 하지 않았다. 시총 시차와 후속 일정 변경은 한계로 남는다.