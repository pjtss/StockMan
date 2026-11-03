# 미국 보통주 공시·뉴스 기반 이벤트 검토 — 2026-11-04 배치

## 범위·선정 기준

- 대상 100종목: 미국 상장 활성 COMMON_STOCK, 운영 공개 메타데이터에서 USD 시총 $0 초과~$100,000,000 이하, CIK 확인. SEC 종목 인덱스에서 기존 배치를 제외한 후보를 운영 메타데이터로 교차 확인해 선정했다. Sponsored ADR/ADS 설명 등 분류 충돌 후보는 제외 보류했다.
- 운영 확인: read-only 공개 GET `/api/public/us-stock-metadata` 및 `/api/public/market-intelligence` 사용. DB write 없음. 보통주 분류는 운영 종목 마스터를 기준으로 확인했다.
- 운영 KIS 시총 관측은 2026-11-02T07:44:51Z~08:10:40Z이며 반환 신선도는 STALE이다. 금액은 해당 관측 시점 스냅샷으로 2026-11-04 실시간 시총 인증이 아니다.
- SEC 공식 회사 ticker/CIK 맵 및 submissions JSON에서 2025-11-04 포함~2026-11-05 미포함(366일) 제출 5,111건, 운영 뉴스 555건을 저장했다. 전문을 읽지 않은 제출물은 INVENTORY_ONLY로 표시했다. 18개 접수의 핵심 구간을 확인했으며 첨부 Exhibit 일부는 전문 추가 검토 대상이다.
- 정규 이벤트는 18건이며 14개 발행사에 연결된다. 상태별 집계: REPORTED 9, CONFIRMED_SCHEDULED 3, COMPLETED 4, ESTIMATED 2. 공식 원문 근거가 검증되지 않은 후보는 canonical 이벤트에 올리지 않았다.

## 배치 종목 목록

CMND, LRHC, DRCT, VBIO, NIVF, HCAI, DKI, NXGL, RMSG, OFAL, NCI, BRTX, FEBO, RIME, BOXL, LCFY, CAPS, SLXN, ELAB, CETX, EPSM, EHGO, PRFX, HTCR, ADGM, GP, REVB, POLA, SUGP, APVO, HCWB, AKAN, BJDX, UONE, CHR, TRNR, DCOY, XELB, VIVS, DAIC, BGLC, MBIO, JUNS, WBUY, IVDA, AIDX, ENLV, SCKT, UFG, CHSN, DCX, CTNT, FLYE, CDTG, MKZR, CGTL, JTAI, RDGT, ONCO, PAVS, TNMG, ICCM, UZX, OCG, CXAI, TAOP, CNET, YYAI, KALA, FCUV, ERNA, CODX, PMCB, YHC, WLDS, SXTP, ZTG, GRI, BIYA, HYFM, CNEY, AMSS, EZRA, CVKD, BANL, AMIX, QCLS, RENX, IBG, XPON, ILLR, AMST, FAMI, MTEK, NCRA, CCTG, BIAF, JAGX, NRSN, LIMN

## 원문 확인 이벤트

- **CMND — 2026-10-12 — Clearmind 보도자료: 자동 EV 충전 기술 공개**: Clearmind는 2026-10-12 자회사 Charging Robotics가 로보택시·자율주행 fleet용 차세대 자동 EV 충전 기술을 launch했다고 SEC 6-K에서 첨부 보도자료로 공시했다. 상용 고객·계약액·매출·생산 일정은 해당 제출물의 표지에서 확인되지 않아 미확정으로 둔다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1892500/000121390026108644/ea0308337-6k_clearmind.htm), accession 0001213900-26-108644.
- **VBIO — 2026-10-15 — LarmorBio BioScan-NMR 초기 타당성 평가 완료**: Valion Bio는 2026-10-15 자회사 Velocity Bioworks의 LarmorBio BioScan-NMR 플랫폼 초기 타당성 평가 완료를 8-K와 첨부 보도자료로 공시했다. 검토한 filing 표지는 평가 완료 사실만 확인하며 임상시험·FDA 허가·매출을 의미하지 않는다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1787740/000168316826007857/vbio_8k.htm), accession 0001683168-26-007857.
- **VBIO — 2026-11-12 — Valion Bio 특별주총: 1:2~1:12 역분할 승인 안건**: DEF 14A는 2026-11-12 11:00 a.m. Central Time 가상 주총과 이사회 재량 1:2~1:12 역분할 권한 안건을 공지한다. 승인만으로 병합이 집행되는 것은 아니며 실제 비율·효력·split-adjusted 거래일은 미확정이다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1787740/000168316826007932/valion_def14a.htm), accession 0001683168-26-007932.
- **NIVF — 2026-09-30 — NewGenIvf $1.25M 공모 종결**: NewGenIvf는 2026-09-30 공모를 종결하고 보통주 125,000주와 pre-funded warrant 17,732,143개(각 1주 기초)를 발행했다고 공시했다. 총 gross proceeds 약 $1.25M, 수수료 차감 전이며 보통주 발행량과 워런트 기초주식을 분리한다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1981662/000121390026105211/ea0307155-6k_newgeni.htm), accession 0001213900-26-105211.
- **HCAI — 2026-09-16 — Huachen AI $2.75M 공모 종결**: Huachen AI는 Class A ordinary shares 2,750,000주와 동수 ordinary warrants를 주당 $1.00 조건으로 발행하는 best-efforts 공모의 종결 사실을 6-K에서 보고했다. 총 수령액·실제 warrant exercise는 filing 본문/첨부 확인 전 미확정이다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1958399/000121390026100535/ea0306926-6k_huachenai.htm), accession 0001213900-26-100535.
- **DKI — 2026-10-08 — DarkIris 최대 $6M 공모 가격결정·종결**: DarkIris는 2026-10-08 최대 $6M best-efforts 공모를 가격결정하고 898,965 ordinary shares, 3,267,701 pre-funded warrants 및 4,166,666 warrants를 발행했다고 6-K에서 보고했다. 424B4는 모든 56,547,610주(제로행사 선택 포함)가 발행되면 사후 주식의 약 96.42% 상당이라고 명시하지만, 이는 최대 희석 시나리오이지 즉시 outstanding 주식 수가 아니다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/2058584/000149315226046619/form6-k.htm), accession 0001493152-26-046619.
- **RMSG — 2026-10-06 — Real Messenger Nasdaq 주주자본 요건 회복**: Real Messenger는 Nasdaq Rule 5550(b)(1) $2.5M 주주자본 요건을 충족했다는 Nasdaq의 2026-10-06 서한을 수령했다고 공시했다. 이후 2026-09-30 interim statements 제출 시점까지 계속 충족해야 한다는 조건부 경고도 함께 공개했다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1983324/000149315226046089/form6-k.htm), accession 0001493152-26-046089.
- **NCI — 2026-10-01 — Neo-Concept $2M 등록 직접 공모 종결**: Neo-Concept는 단일 기관투자자에게 Class A 250,000주와 주당 $0.01 행사가 pre-funded warrants 1,750,000개를 판매해 2026-10-01 종결했고 gross proceeds 약 $2.0M을 보고했다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1916331/000118518526004504/nci_6k.htm), accession 0001185185-26-004504.
- **BRTX — 2026-09-07 — BioRestorative 1:20 역분할 법적 효력 및 조정 거래**: BioRestorative는 1:20 역분할 certificate가 2026-09-07 4:30 p.m. ET에 효력이 발생하고 2026-09-08 정규장 개장부터 split-adjusted basis로 거래를 시작한다고 공시했다. 주식 수는 기존 각 20주를 1주로 병합하며, 분할 전·후 발행주식 수는 확인된 공식 수치가 없어 계산하지 않는다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1505497/000121390026096810/ea0304389-8k_biore.htm), accession 0001213900-26-096810.
- **SLXN — 2026-09-30 — Silexion SIL204 췌장암 2/3상 첫 환자 투약**: Silexion은 locally advanced pancreatic cancer 환자를 대상으로 하는 SIL204 2/3상에서 첫 환자가 투약됐다고 8-K의 Regulation FD 항목에서 발표했다. 투약 시작은 효능/안전성 결과나 승인 결정이 아니다. 등록 목표·endpoint·환자수는 해당 원문 excerpt에서 확인하지 못해 미공개로 둔다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/2022416/000117891326004666/slxn_8k.htm), accession 0001178913-26-004666.
- **SXTP — 2027-01-01 — 60 Degrees: 입원 babesiosis 데이터 발표 목표 2027년 1월**: 8-K는 January 2027 hospitalized babesiosis data readout 업데이트 보도자료를 첨부했다고 확인한다. 이는 회사 목표 시점이며 정확한 일자와 FDA pre-sNDA 미팅 날짜/결과는 별도 확정 일정으로 간주하지 않는다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1946563/000121390026106979/ea0307761-8k_60degrees.htm), accession 0001213900-26-106979.
- **UFG — 2026-11-03 — Uni-Fuels 1:10 주식병합 효력일**: Uni-Fuels 6-K 첨부 보도자료는 Class A 및 B ordinary shares 1:10 consolidation이 2026-11-03 효력 발생했다고 알린다. SEC 제출물에는 법적 효력 날짜가 있으나 분할 전후 주식 수·split-adjusted 거래 개시 시각은 확인되지 않아 별도 미확인으로 남긴다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/2021688/000149315226049307/form6-k.htm), accession 0001493152-26-049307.
- **NRSN — 2026-10-13 — NeuroSense Nasdaq 청문 및 PrimeC 일정 제목 공시**: NeuroSense는 Nasdaq hearing date 및 PrimeC 규제·자금조달 milestone을 다룬 보도자료를 6-K에 첨부했다. 보고자료 제목만으로 청문 일자·임상 일정·FDA 목표일을 확정하지 않는다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1875091/000121390026108759/ea0308436-6k_neurosense.htm), accession 0001213900-26-108759.
- **DRCT — 2026-10-21 — Direct Digital 자발적 Nasdaq 상장폐지 의사 및 예상 일정**: Direct Digital은 2026-10-21 Nasdaq에 Class A 보통주 상장폐지 의사를 통지했다. 2026-11-02경 Form 25 제출 의향, 제출 10일 후인 11-12경 상장폐지 효력 예상이라고 보고했으나 이는 filing 기준 예상일이며 actual Form 25 제출·효력 확인 전이다. Nasdaq 거래는 10-05부터 이미 정지돼 OTC Pink “Limited Information”에서 거래 중이라고 공시했다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1880613/000188061326000117/drct-20261021.htm), accession 0001880613-26-000117.
- **NIVF — 2026-10-23 — NewGenIvf 1:8 역분할 및 split-adjusted 거래 개시**: NewGenIvf는 각 8주의 Class A ordinary shares를 1주로 병합했고 2026-10-23 Nasdaq 개장부터 split-adjusted basis로 거래가 시작됐다고 8-K에 보고했다. 공시는 2026-10-21 현재 outstanding Class A 약 9,821,197주에서 약 1,227,650주로 감소 예상치를 기재한다. 이는 공시상 발행주식 수(유통주식 수 아님) 계산치다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1981662/000121390026111191/ea0309035-8k_newgen.htm), accession 0001213900-26-111191.
- **NCI — 2026-12-31 — Neo-Concept 주주승인 1:2~1:400 주식통합 권한 및 board 결정 기한**: 2026-10-29 6-K는 주주들이 1:2~1:400 주식통합 범위와 이사회가 2026-12-31까지 구체 비율을 정하는 권한을 승인했다고 보고한다. 실제 consolidation ratio와 효력일은 아직 특정되지 않아 범위/board 기한으로 보존한다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1916331/000118518526005050/nci_6k.htm), accession 0001185185-26-005050.
- **AMSS — 2026-10-09 — AMASS Nasdaq $1 최소 bid 요건 결손 및 180일 회복기간**: AMASS는 2026-10-09 Nasdaq deficiency notice를 받고 2026-08-26~10-08 30영업일 연속 종가 bid가 $1 미만이었다고 공시했다. 2027-04-07까지 180일 회복기간을 받았으며 요건은 최소 10연속 영업일 $1 이상 종가 bid다. Nasdaq 상장에는 notice 자체의 즉각 효과가 없다고 회사가 밝혔다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1851491/000157587226000739/amass_424b5.htm), accession 0001575872-26-000739.
- **AMSS — 2026-12-10 — AMASS 특별주총 1:2~1:20 역분할 승인 안건**: 예비 proxy는 2026-12-10 10:00 a.m. Pacific 가상 특별주총과 1:2~1:20 역분할 권한 안건을 제시한다. 정확한 비율은 이사회 재량이며 시행 여부도 이사회 판단 조건이다. 공시 자료에 placeholder가 포함되어 있어 최종 안내·record date·결의 결과는 재확인 대상이다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1851491/000157587226000751/amass_pre14a.htm), accession 0001575872-26-000751.

## 구조화 자료와 연결

- 정규 이벤트: `data/market-impact-events.json`; eventId로 종목 검토와 accession 원장을 연결한다.
- 종목별 검토: `data/us-smallcap-event-review-20261104.json`; 운영 마스터·시총 관측·운영 뉴스·SEC inventory·검토 이벤트를 ticker 단위로 보관한다.
- 공시별 원장: `data/us-smallcap-filing-review-ledger-20261104.json`; accession별 form/date/원문 URL/reviewStatus/eventIds/관련 접수물을 관리한다.
- 데이터 관리 기준: `docs/operations/us-smallcap-event-data-contract.md`.

## 한계와 후속 개선

- 시총이 stale이므로 다음 배치에서 최신 운영 snapshot과 분류 상태를 재검증한다. 기준 초과·inactive·분류 불명은 fail-closed로 제외한다.
- SEC inventory 수집은 전문 검토와 다르다. 미열람 filing은 INVENTORY_ONLY로 남겼다.
- 후속 개선: 보도자료 exhibit 원문, 주총 결과, 역분할 조정 거래 개시, 후속·정정 공시를 같은 accession ledger에 연결한다.
- 운영 API/DB write 및 배포는 수행하지 않았다.
