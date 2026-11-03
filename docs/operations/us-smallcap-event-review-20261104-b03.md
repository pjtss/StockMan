# 미국 보통주 공시·뉴스 기반 이벤트 검토 — 2026-11-04 배치 3

## 범위와 수집 시각

- 대상: 100개 미국 상장 활성 COMMON_STOCK, USD 시총 $0 초과~$100,000,000 이하, 운영 마스터와 SEC ticker/CIK를 대조한 종목. 238개 신규 후보를 운영 조회했고, 225개가 기준을 통과했다. ADR/ADS·depositary 34개는 보류 제외했으며 SEC 마스터 대조 통과 후보에서 100개를 선정했다.
- 운영 서버: https://stockman.r-e.kr 공개 GET /api/public/us-stock-metadata 및 /api/public/market-intelligence. 운영 API 및 DB write 없음.
- 운영 조사 응답 시각: 2026-11-03T17:19:41.113Z. SEC submissions와 ticker/CIK 매핑은 SEC 공식 공개자료에서 직접 취득했다.
- 시총 한계: KIS 시총 snapshot은 2026-11-02 관측이며 STALE이다. 2026-11-04 실시간 시총으로 읽으면 안 된다. 종목별 observedAt, fetchedAt, freshness를 보존했다.
- SEC 제출 inventory: 2025-11-04 포함~2026-11-04 미포함 365일, 4,183건. 운영 뉴스/RSS 453건, bullish 분류 93건, SEC 분류 이벤트 row 31건.
- SEC 제출 전체를 전문 검토한 것은 아니다. 사건 관련 13 accession의 필요한 구간을 직접 확인했고 해당 filing만 TARGETED_SECTION_REVIEW, 나머지는 INVENTORY_ONLY다. 공식 amendment 관계를 직접 확인하지 않아 관계를 만들지 않았다.

## 종목별 제출 원장

100개 종목 각각의 SEC filing/accession과 공시별 상태는 [filing review ledger](../../data/us-smallcap-filing-review-ledger-20261104-b03.json)에 있다. 운영 종목 snapshot·뉴스·issuer별 event 연결은 [review JSON](../../data/us-smallcap-event-review-20261104-b03.json), 앱 제공 정규 원장은 [market-impact-events.json](../../data/market-impact-events.json)에 있으며 ticker, CIK, accession, eventId로 연결한다.

## 직접 확인 이벤트

- **CRE — 2026-11-03 — COMPLETED — LingXpert 100% 인수 완료 — 현금 대가 $800,000.** Cre8 Enterprise는 2026-11-03 발표에서 자회사 Cre8 Incorporation이 홍콩 번역 서비스 회사 Lingxpert Language Services 발행주식 100% 인수를 완료했다고 밝혔다. 2026-10-19 주식매매계약의 현금 대가는 $800,000. 매출·이익 기여도는 미공개다. [0001213900-26-115177](https://www.sec.gov/Archives/edgar/data/2003977/000121390026115177/ea031046001ex99-1.htm)
- **GLE — 2026-10-08 — COMPLETED — 1대10 주식 병합 및 병합 조정 거래 개시.** Global Engine Group은 Class A/B 보통주 10주를 1주로 병합했으며 2026-10-08 Nasdaq 개장부터 GLE 심볼과 신규 CUSIP로 병합 조정 거래를 시작한다고 공시했다. 병합 전후 발행·유통 주식 수는 확인하지 못했다. [0001213900-26-107002](https://www.sec.gov/Archives/edgar/data/1908705/000121390026107002/ea030721501ex99-1.htm)
- **SCNX — 2026-10-05 — COMPLETED — 1대25 역분할 효력 및 조정 거래 개시.** Scienture Holdings가 1대25 역분할을 결정했다. 회사는 2026-10-05 12:01 a.m. Eastern Time에 효력이 발생했고 같은 날 시장 개장 전 split-adjusted 거래가 시작된다고 공지했다. 발행·유통 주식 수는 확인한 원문에서 확인되지 않았다. 역분할 자체는 기계적 가격 조정이며 투자수익률과 다르다. [0001493152-26-046176](https://www.sec.gov/Archives/edgar/data/1382574/000149315226046176/ex99-1.htm)
- **VVOS — 2026-12-02 — CONFIRMED_SCHEDULED — 연례 주총 — 이사회 재량 1대20~1대40 역분할 안건.** Vivos Therapeutics 연례 주총은 2026-12-02 10:00 Mountain Time 가상회의(2026-12-03 02:00 KST)로 공지됐다. 안건은 보통주 1대20~1대40 역분할 권한이며, 실제 비율·시기는 이사회 재량이고 제안 철회도 가능하다. 주총 승인 전이므로 병합 실행일로 보지 않는다. [0001493152-26-049258](https://www.sec.gov/Archives/edgar/data/1716166/000149315226049258/formdef14a.htm)
- **GWAV — 2026-12-07 — CONFIRMED_SCHEDULED — 연례 주주총회 — 12:30 p.m. Eastern.** Greenwave Technology Solutions 2026 연례 주주총회는 2026-12-07 12:30 p.m. Eastern(2026-12-08 02:30 KST) 가상회의로 PRE 14A에 공지됐다. 최종 안건·의결 결과는 후속 확인 대상이다. [0001493152-26-048536](https://www.sec.gov/Archives/edgar/data/1589149/000149315226048536/formpre14a.htm)
- **INBS — 2026-12-03 — CONFIRMED_SCHEDULED — 연례 주주총회 — 4:00 p.m. Eastern.** Intelligent Bio Solutions 2026 연례 주주총회는 2026-12-03 4:00 p.m. Eastern(2026-12-04 06:00 KST)으로 DEF 14A에 공지됐다. 의안과 결과는 회의 전후 재확인 대상이다. [0001493152-26-049613](https://www.sec.gov/Archives/edgar/data/1725430/000149315226049613/formdef14a.htm)
- **SNES — 2027-04-19 — CONFIRMED_SCHEDULED — Nasdaq 최소 호가 $1 미준수 회복 기한.** SenesTech는 Nasdaq 최소 bid $1 미준수 통지를 받고 180일 회복기간을 부여받았으며 공시 기한은 2027-04-19이다. 기한 전 최소 10연속 영업일 closing bid $1 이상이 필요하며 Nasdaq은 통상 최대 20영업일까지 연장 요구 재량을 가진다. 공시에는 기한 시각이 없다. [0001628280-26-066829](https://www.sec.gov/Archives/edgar/data/1680378/000162828026066829/snes-20261020.htm)
- **DOGZ — 2027-04-19 — CONFIRMED_SCHEDULED — Nasdaq 최소 호가 $1 미준수 회복 기한.** Dogness (International)는 $1 minimum bid 미준수 통지 후 180일 회복기간을 부여받았고 2027-04-19까지 회복해야 한다. 요건은 최소 10연속 영업일 closing bid $1 이상이다. 역분할은 필요 시 가능한 수단일 뿐 당시 확정 일정이 아니다. [0001493152-26-047760](https://www.sec.gov/Archives/edgar/data/1707303/000149315226047760/ex99-1.htm)
- **MGN — 2026-10-29 — COMPLETED — 후속 공모 종결 — 1,500만 주·gross 약 $7.5M.** Megan Holdings는 2026-10-29 후속 공모를 종결해 Class A 보통주 15,000,000주를 주당 $0.50에 발행, 수수료·비용 전 약 $7.5M을 조달했다고 보고했다. 기존 대비 희석률은 발행 직전 주식 수를 이 자료에서 대조하지 않아 산출하지 않았다. [0001213900-26-114419](https://www.sec.gov/Archives/edgar/data/1995075/000121390026114419/ea031029201ex99-2.htm)
- **DPU — 2026-10-14 — REPORTED — 사모 발행 계약 — 최대 4,000만 units·gross 최대 $28M.** Nexpu는 2026-10-14 비미국 투자자와 Regulation S 계약을 체결해 최대 40,000,000 units를 unit당 $0.70에 판매하기로 했다. 각 unit은 Class A ordinary share 1주와 warrant 1개로 구성되고, warrant는 주당 $0.71 현금 행사 가능, 발행일부터 3년 만기다. closing 완료는 확인되지 않아 계약/최대치로 기록한다. [0001213900-26-110756](https://www.sec.gov/Archives/edgar/data/1938865/000121390026110756/ea0309031-6k_nexpu.htm)
- **VNRX — 2026-10-27 — REPORTED — 전환사채 $500,000 일부 현금 상환·전환권 일시 정지.** VolitionRx는 $2.4M senior secured convertible note 중 $500,000을 현금 상환해 잔액 약 $706,667이라고 공지했다. 채권자의 전환권은 종가가 $0.275 이상이 되지 않는 한 2027-01-01 전까지 행사하지 않기로 했고, 2026년 11·12월 상환은 이연됐다. 원금 감소와 조건부 전환·이연 상환을 함께 기록한다. [0001477932-26-006470](https://www.sec.gov/Archives/edgar/data/93314/000147793226006470/vnrx_ex991.htm)
- **LGVN — 2026-10-26 — COMPLETED — ELPIS II Phase 2b — 1차 평가변수 미달, MACE 2차 변수 8대1 (p=0.043).** Longeveron의 laromestrocel ELPIS II는 HLHS 영아 40명 Stage II palliation 보조치료 Phase 2b 무작위 이중맹검 시험(NCT04925024)이다. Month 12 RVEF baseline 대비 변화라는 1차 효능 평가변수는 충족하지 못했다. 회사가 보고한 사전 지정 2차 major adverse cardiac events는 표준치료 8건 대 laromestrocel 1건, p=0.043. FDA와 결과 논의를 요청할 계획만 공개됐고 FDA 목표일은 없다. [0001213900-26-112508](https://www.sec.gov/Archives/edgar/data/1721484/000121390026112508/ea030920801ex99-1.htm)
- **AMZE — 2026-10-26 — REPORTED — 이사회 재량 1대2~1대500 역분할 권한 — 시행일 미정.** Amaze Holdings DEF 14C는 이사회에 1대2~1대500 역분할 비율 선택 권한을 부여하는 주주 서면동의 결과를 확정 공시했다. 권한 승인이지 실제 병합 결정이 아니며 비율·법적 효력일·split-adjusted 거래일은 미정이다. [0001493152-26-048509](https://www.sec.gov/Archives/edgar/data/1880343/000149315226048509/formdef14c.htm)

## 임상·주식수·일정 유의사항

- LGVN / ELPIS II: Phase 2b, laromestrocel, HLHS, N=40, Stage II palliation 보조치료. Month 12 RVEF baseline 대비 변화라는 1차 평가변수는 미달; 사전 지정 2차 MACE는 standard-of-care 8건 vs 치료군 1건, p=0.043로 발행사가 발표했다. ClinicalTrials.gov [NCT04925024](https://clinicaltrials.gov/study/NCT04925024)와 [발행사 IR](https://investors.longeveron.com/news/news-details/2026/Longeveron-Announces-Updated-Results-from-ELPIS-II-Phase-2b-Clinical-Trial-Evaluating-Laromestrocel-as-a-Potential-Treatment-for-Hypoplastic-Left-Heart-Syndrome-HLHS/default.aspx)를 대조했다. 회사는 FDA에 결과 논의를 요청할 계획일 뿐 목표일을 공지하지 않았다. 2차 분석이 1차 실패를 상쇄하거나 FDA 승인·주가 방향을 보장하지 않는다. 공식 TAM·가격·매출 수치도 확인되지 않았다.
- 역분할/병합: GLE 1:10 (효력 10/8, adjusted trading 10/8 개장), SCNX 1:25 (효력 10/5 12:01 a.m. ET, adjusted trading 10/5 개장 전). 확인한 원문에서 전후 발행/유통주식 수를 확인할 수 없어 계산하지 않았다. 역분할의 기계적 단가 조정은 투자수익률과 구분한다. AMZE의 1:2~1:500은 승인된 권한 범위이며 실제 비율·효력·거래 일정이 아니다. VVOS는 1:20~1:40 권한 승인 안건이 있는 예정 주총으로 실제 병합이 아니다.
- 상장유지: SNES 및 DOGZ의 Nasdaq $1 minimum bid 회복 기한은 2027-04-19이며 10영업일 요건과 후속 절차를 각각 기록했다. 원문에 시각이 없어 임의로 보완하지 않았다.
- 자금조달: MGN은 실제 종결 수량 15M주와 약 $7.5M gross를 보고했다. DPU는 최대 40M units/$28M 계약이며 closing 확인 전 상태다. VNRX는 일부 현금상환과 조건부 전환권 정지를 보고했다. 승인·계약·최대 제공량을 완료 발행/실수령과 혼동하지 않았다.

## 재현·검증

- 배치 ID: 20261104-b03. 같은 날짜 복수 배치 순번 규칙 적용.
- 검증 명령: npm run validate:us-smallcap-event-data:20261104b03; 전체 문서 gate: npm run docs:check.
- 배치 구성: issuer 100, SEC submissions 4,183, 직접 확인 이벤트 13건/13개 ticker, accession-event 연결 13건, amendment 관계 0건.
- 운영 조회는 GET만 사용했다. 시총 stale, inventory-only 전문 비검토, 후속 공시 및 일정 변경 위험이 남아 있다.
