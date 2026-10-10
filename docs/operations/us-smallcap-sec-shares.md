# 미국 보통주 시가총액 1억 달러 이하 보고서

- 생성 시각: 2026-10-09 12:40:33 KST (UTC 2026-10-09T03:40:33.533Z)
- 최종 검토 보완: 2026-10-10 (현행 Nasdaq Trader 디렉터리 및 200만~1천만 주 구간 SEC 후속 공시 일부 대조; 시총 스냅샷은 기존 갱신 범위 유지)
- 대상: Nasdaq Trader 공식 현재 NASDAQ·NYSE·NYSE American listing directory 등재를 확인한 활성 미국 COMMON_STOCK 중 USD 시가총액 0 초과·1억 달러 이하 (1,178개)
- 공식 디렉터리 대조: 로컬 활성 COMMON_STOCK 시총 후보 1,317개 중 현재 거래소·ticker 조합이 공식 디렉터리에 없는 24개를 제외했다. 기존 제외 ticker: NYS:GETY, AMS:VTAK, NAS:FGNX, NAS:FEED, NAS:WKEY, NAS:HWH, NAS:SNYR, NAS:AIXC, AMS:AMZE, NAS:RITR, NAS:VRME, NAS:FSEA, NAS:LESL, NYS:SBXD, NAS:ILLR, NAS:DRCT, NAS:SOBR, NAS:HVII, NAS:ANY, NAS:NSTS, AMS:HCWC, NYS:GWH. 2026-10-10 재확인에서 NVNI와 HKIT도 현재 디렉터리에서 확인되지 않아 제외했다.
- 비보통주 제외: 공식 거래소 listing name 및 SEC 등록 증권 종류에서 ADS/ADR(미국 ticker가 기초 보통주가 아닌 예탁증서를 나타내는 경우 포함), 우선주, 워런트, unit, 펀드, royalty trust, 채권, 증서, 권리 등으로 확인된 일반 보통주 외 115개를 제외했다. SEC 원문 확인으로 QH는 거래 대상이 아닌 기초 ordinary shares의 ADS, SGLD는 보통주 20주를 대표하는 ADS, CRT·MTR·PRT·PVL·VOC·MARPS는 trust units, IHT는 shares of beneficial interest, CFND·PDCC는 등록 펀드 지분임을 확인해 보통주 목록에서 제외했다.
- 시가총액 원천: 로컬 instrument_fundamental_snapshots USD 스냅샷 (갱신 범위: 2026-10-07T05:54:42.089Z ~ 2026-10-07T05:59:18.775Z)
- 발행주식수: SEC 공시 원문에서 확인한 발행 보통주 전체 수량. 기준일 1년 이내 1,089개, 기준일 1년 초과 1개, 클래스/문맥 확인 필요 87개, SEC 수량 미확보 1개. 기준일 1년 이내라는 표시는 원문 수량의 기준일만 나타내며 그 이후 자본 변동이 없음을 뜻하지 않는다. 각 표시값 옆에 SEC 수량 기준일을 함께 표기한다. 수량은 10,000주 이상부터 만 주, 100,000,000주 이상부터 억 주 단위로 표기하고, 괄호 안에 SEC 원문의 정확한 주식 수를 병기한다. 10,000주 미만은 정확한 주식 수로 표기한다.
- 소량 수량 점검: 현재 기준일 1년 이내로 숫자 표시하는 1,089개 중 최저는 367,120주이며, 100,000주 미만은 0개 (10,000주 미만 0개)다. 이 집계는 현재 표시값만 대상으로 하며, 전체 SEC filing의 taxonomy/class context를 전수 재검토했다는 뜻은 아니다. 12주·100주처럼 한 클래스만 보고된 값은 발행사 전체 보통주 수량으로 채택하지 않고, 복수 클래스 합계를 확정할 수 없으면 숫자를 숨기고 `검토 필요`로 둔다. 발행사 전체 수량으로 검증된 70,000주는 `7만 주 (70,000주)`처럼 표시한다.
- 후속 발행 검토: AMOD의 2026-08-27 8-K는 51,621,560주 및 warrant를 closing 시 발행할 계약을 공시했으나, 확인한 후속 제출에서 closing과 현재 총 발행수량을 확정하지 못해 숫자를 숨겼다. CRIS는 2026-08-13 424B4에서 8/7 기준 2,090,077주 이후 공모(common 335,001주 및 PFW 포함)를 시작했으나, 8/14 10-Q는 공모 후 총 발행주식수를 밝히지 않아 `검토 필요`로 표시했다. [AMOD 8-K](https://www.sec.gov/Archives/edgar/data/1862463/000149315226040333/form8-k.htm) · [CRIS 424B4](https://www.sec.gov/Archives/edgar/data/1108205/000110820526000116/cris-prospectusaugust2026.htm)
- 후속 수량 갱신: CUPR은 9/17 실제 공모 종결 후 Class A 5,243,133 + Class B 1,760,625 = 7,003,758주로 갱신했다. MBAI는 9/21 현재 15,293,584주, NIKI는 10/9 prospectus 현재 common 2,938,625주, YFOR는 10/5 현재 Class A 7,836,734 + Class B 5,000,000 = 12,836,734주로 갱신했다. BESS는 9/23 수량 7,097,573주를 재확인했다. [CUPR SEC 424B4](https://www.sec.gov/Archives/edgar/data/1995704/000149315226042872/form424b4.htm) · [MBAI SEC F-3](https://www.sec.gov/Archives/edgar/data/1610590/000121390026102275/ea0306182-f3_mbody.htm) · [NIKI SEC 424B5](https://www.sec.gov/Archives/edgar/data/1734005/000121390026108567/ea0308224-424b5_nikibio.htm) · [YFOR SEC 424B5](https://www.sec.gov/Archives/edgar/data/1985337/000121390026106847/ea0307644-424b5_yyforce.htm) · [BESS SEC S-3](https://www.sec.gov/Archives/edgar/data/1066764/000149315226044362/forms-3.htm)
- 후속 발행 검토: ESYN의 8/10 PIPE 후 주식수와 2,000,000주 stock awards의 반영 관계, MTEK의 반복 조달 후 최신 총수, BNAI의 추가 tranche, SKYQ의 변동가격 정산, BIAF의 역분할 및 10/9 공모 종결 후 총수, JAGX의 근사치만 기재된 수량은 확정할 수 없어 `검토 필요`로 숨겼다.
- 후속 발행 예외: LGO의 기존 수량 기준일은 2025-12-31이다. SEC 2026-09-29 공시는 10,200,000주 등록 직접공모 종결을 확인하지만 그 후 발행사 전체 발행주식수는 제시하지 않는다. 과거 숫자를 현재 총수로 표시하지 않고 `검토 필요`로 숨겼다. [SEC 2026-09-29 6-K 첨부 공지](https://www.sec.gov/Archives/edgar/data/1400438/000106299326005110/exhibit99-1.htm)
- 후속 발행 예외: LTRN의 기존 표시값 17,135,576주는 2026-09-30 공모 후 선불워런트 2,200,000주를 전량 행사한다고 가정한 수치다. 같은 날 종결 공지는 총 3,669,725주를 보통주 또는 선불워런트로 발행했다고 하지만 실제 발행된 보통주와 아직 행사되지 않은 선불워런트의 구성을 밝히지 않는다. 현재 발행 보통주 총수를 확정할 수 없어 숫자를 `검토 필요`로 숨겼다. [SEC 2026-09-30 Form 8-K](https://www.sec.gov/Archives/edgar/data/1763950/000149315226045100/form8-k.htm) · [SEC 종결 공지](https://www.sec.gov/Archives/edgar/data/1763950/000149315226045100/ex99-2.htm)
- 후속 발행 예외: ARBE의 기존 수량 기준일은 2026-03-01이다. SEC 2026-09-25/28 공시는 833,334 ordinary shares 및 24,166,666주까지의 선불워런트를 포함한 공모를 발표했고, 9월 28일 SEC 공시는 종결 예정일만 기재했다. 후속 제출에서 실제 발행 주식과 선불워런트 구성 및 정확한 후속 총수는 확인되지 않아 기존 수량을 숨겼다. 2026-10-06 Form 25-NSE는 ordinary shares가 아닌 warrant의 Nasdaq 상장 제거를 대상으로 하며, 현행 Nasdaq 디렉터리에는 ARBE ordinary shares가 등재되어 있어 종목은 보고서에 유지한다. [SEC 9/28 6-K](https://www.sec.gov/Archives/edgar/data/1861841/000121390026103791/ea0306796-6k_arbe.htm) · [SEC Form 25-NSE](https://www.sec.gov/Archives/edgar/data/1861841/000135445726000957/xslF25X02/primary_doc.xml)
- 후속 발행 예외: MYSE의 기존 수량 기준일은 2026-08-14이다. SEC 2026-09-21 Form 424B5는 2026-02-06 Sales Agreement 체결 후 누적 750,000주를 매각했다고 밝히지만 기준일 이후 매각분을 구분하거나 공시일 현재 전체 발행주식수를 제시하지 않는다. 정확한 최신 수량을 확정할 수 없어 기존 수량을 `검토 필요`로 숨겼다. [SEC 2026-09-21 424B5](https://www.sec.gov/Archives/edgar/data/1648960/000121390026101810/ea030599102-424b5_myseum.htm)
- 후속 발행 예외: BYSI의 기존 수량 기준일은 2026-06-30이다. SEC 2026-09-29 Form 424B5는 12개월 구간에 800,000주를 별도 SPA로 매각했고, 2019 ATM에서 630,228주를 누적으로 매각했다고 밝힌다. 2019 ATM은 2026-09-09 종료됐으나 해당 판매분 중 6/30 이후 실제 발행된 수량을 나누거나 최신 총 발행주식수를 공시하지 않는다. 따라서 기존 수량을 `검토 필요`로 숨겼다. 새 9/29 ATM 한도 자체는 실제 매각으로 간주하지 않았다. [SEC 2026-09-29 424B5](https://www.sec.gov/Archives/edgar/data/1677940/000114036126037918/ny20082848x1_424b5.htm)
- 후속 발행 갱신: SSM의 SEC 2026-09-02 Form 424B5는 2026-08-31 기준 ordinary shares 1,424,834주 및 공모 후 1,708,334 ordinary shares(283,500주 신주 발행)를 제시하고, 40,000 high-voting shares와 preferred 전환 잠재주는 별도로 구분한다. SEC 2026-09-08 Schedule 13D는 283,500주가 실제 발행되어 보고인에게 취득된 사실을 확인한다. 따라서 ordinary+high-voting common class 합계 1,748,334주를 2026-09-08 기준으로 사용하고, 미발행 preferred 전환 가능분은 제외했다. [SEC 424B5](https://www.sec.gov/Archives/edgar/data/1840416/000117184326005852/f424b5_090126.htm) · [SEC 2026-09-08 Schedule 13D](https://www.sec.gov/Archives/edgar/data/1840416/000121390026098095/xslSCHEDULE_13D_X02/primary_doc.xml)
- 후속 발행 갱신: SLXN의 2026-08-13 기준 기존 5,560,256주는 9월 유도 워런트 행사 이후의 수량이 아니다. SEC 2026-10-05 DEF 14A는 2026-09-30 기준 발행 ordinary shares 14,473,292주를 명시한다. 9월 유도 거래에서 추가로 발행한 6,659,041 Series F/G 및 placement-agent warrants와 그 기초주는 미행사 잠재수량이므로 합산하지 않는다. [SEC 2026-10-05 DEF 14A](https://www.sec.gov/Archives/edgar/data/2022416/000117891326004708/zk2636195.htm)
- 단위 예: 70,000주는 7만 주 (70,000주), 700,000주는 70만 주 (700,000주)로 표기한다. 만·억 단위 수량 뒤 괄호 안에는 반올림 없는 SEC 원주 수량을 병기한다.
- 정렬: 기준일 1년 이내에 검증된 발행주식수 오름차순. 오래된 기준일·검토 필요·미확보는 뒤에 표시했다.
- 상장 상태: [Nasdaq-listed directory](https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt)와 [other-exchange directory](https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt)를 조회해 Nasdaq·NYSE·NYSE American의 현재 등록 common-stock ticker만 포함했다. 디렉터리에서 빠진 종목은 상장 종료 공지 유무와 관계없이 보고서에서 제외한다. 2026-10-10 13:33 KST 대조에서는 보고서 1,178개 ticker가 모두 현행 디렉터리에서 확인됐다. NVNI·HKIT은 두 공식 디렉터리 어디에도 없어 보고서에서 제거했고, ARBE는 common shares가 등재되어 있어 warrant removal 공시에도 종목을 유지했다. 디렉터리 미등재만으로 상장 종료 효력일이나 사유를 단정하지 않는다. 2026-10-09까지 확인된 제외 ticker 가운데 FSEA·NSTS·GETY·AMZE는 SEC Form 25에서 common stock 제거가 확인됐다. GWH Form 25는 warrant 제거를 대상으로 한다.
- SEC Company Facts의 `dei:EntityCommonStockSharesOutstanding`(cover-page fact)와 `us-gaap:CommonStockSharesOutstanding`(balance-sheet fact)는 각각 독립적으로 저장·대조한다. 둘 다 발행 보통주 잔존 수량(outstanding)이며 유통가능주식수(float)나 issued shares와 같지 않다. DEI는 표지의 최신 수량 후보로, GAAP은 재무제표 기준일 교차 확인용으로 사용하며 둘을 더하지 않는다. 두 값이 다르거나 없거나, 12주·100주처럼 전체 보통주 수량으로 의심되는 값이면 SEC 원문에서 클래스별 수량·기준일·split·후속 실제 발행을 확인한다. SEC Company Facts API는 전체 filing entity에 적용되는 표준 taxonomy fact를 모으므로 클래스 차원 facts가 빠질 수 있다. 클래스 합계를 확정할 수 없으면 숫자를 숨기고 `검토 필요`로 둔다. 판정 근거는 `docs/operations/us-smallcap-sec-shares-review-input.md`와 로컬 DB에서 추적한다. 후속 공시 감사는 계속 진행 중.
- 수량은 종목 ticker가 특정 클래스에 한정된 경우에도 발행사 전체 보통주 클래스 합계로 기록한다. UONE/UONEK는 A·B·C·D 전체 4,614,964주를 각 행에 표시한다.
- 이 보고서에서 숫자로 표시한 수량은 SEC 원문 기준으로 검증된 값이며 발행주식수 기준일은 로컬 검토 기록에 남긴다. 기준일 1년 초과 수량은 갱신 전까지 `기준일 오래됨`으로, 전체 보통주 합계가 불명확하면 `검토 필요`, 원문 수량을 확인하지 못하면 `미확보`로 표시한다.
- 복수 클래스 합산 참고 사례(아래는 각 SEC 공시의 기준일 수량이며 현재 표의 검증 상태를 대체하지 않는다): QNTM은 2025-12-31 Class A 42주+Class B 3,887,729주=3,887,771주(388.78만 주)였으나, 후속 2026-08-13 6-K는 A 42+B 8,087,479=8,087,521주로 갱신, RFL 2026-06-09 Class A 787,163주+Class B 51,212,833주=51,999,996주(5200만 주), PAVS 2026-03-31 표지에는 Class A 약 78,732주+Class B 약 321주=약 79,053주로 적혀 있으나, 같은 2026-08-14 Form 20-F의 주주현황은 보고서 작성일 현재 A 856,897주+B 12,741주=869,638주라고 명시한다. 이에 표에는 더 최신인 869,638주를 사용한다. SEC Company Facts의 단일 저수량 fact나 오래된 표지 수량만으로 현재 전체 수량을 판단하지 않는다. [SEC Company Facts 설명](https://www.sec.gov/edgar/sec-api-documentation) · [QNTM 2026년 20-F](https://www.sec.gov/Archives/edgar/data/1771885/000118518526001069/qntm20f123125.htm) · [2026-08-13 6-K](https://www.sec.gov/Archives/edgar/data/1771885/000118518526003497/qntmex99-2.htm) · [RFL 2026년 10-Q](https://www.sec.gov/Archives/edgar/data/1713863/000121390026067560/ea0293312-10q_rafael.htm) · [PAVS 2026년 20-F](https://www.sec.gov/Archives/edgar/data/1751876/000192998026000454/pavs_20f.htm)

| Ticker | 종목명 | 시가총액 (만 달러) | 발행주식수 (만·억 주; 괄호 안 정확한 주식 수) | SEC 수량 기준일 |
|---|---|---:|---:|---|
| PW | 파워 리츠 | 257.35 | 36.71만 주 (367,120주) | 2026-08-06 |
| SPRC | SciSparc Ltd. | 248.21 | 58.1만 주 (580,973주) | 2026-08-19 |
| PFSA | Profusa, Inc. | 100.54 | 60.56만 주 (605,647주) | 2026-08-19 |
| HAO | 하오시 헬스 테크놀로지 | 144.05 | 63.76만 주 (637,634주) | 2026-09-30 |
| GNLN | Greenlane Holdings, Inc. | 216.00 | 69.45만 주 (694,544주) | 2026-06-30 |
| NVNO | enVVeno Medical Corp | 569.76 | 69.48만 주 (694,826주) | 2026-08-20 |
| JEM | 707 Cayman Holdings Ltd. | 8,011.75 | 69.53만 주 (695,341주) | 2026-10-08 |
| LBGJ | Li Bang International Corp Inc. | 118.07 | 71.04만 주 (710,426주) | 2026-08-26 |
| XXII | 22nd Century Group, Inc. | 65.68 | 71.4만 주 (713,994주) | 2026-08-14 |
| IPST | IP STRATEGY HOLDINGS, INC. | 217.92 | 72.16만 주 (721,578주) | 2026-06-01 |
| GNPX | Genprex, Inc. | 213.94 | 81.97만 주 (819,709주) | 2026-08-10 |
| PAVS | Paranovus Entertainment Technology Ltd. | 327.76 | 86.96만 주 (869,638주) | 2026-08-14 |
| CSAI | 클라우드어스트럭처 | 225.51 | 88.57만 주 (885,718주) | 2026-09-28 |
| DBGI | Digital Brands Group, Inc. | 430.35 | 93.35만 주 (933,509주) | 2026-08-19 |
| CVR | 시카고 리벳 앤드 머신 | 1,068.54 | 96.61만 주 (966,132주) | 2026-08-05 |
| DIT | 암콘 디스트리뷰팅 | 6,733.62 | 97.6만 주 (976,028주) | 2026-08-04 |
| FCUV | FOCUS UNIVERSAL INC. | 418.34 | 98.2만 주 (982,012주) | 2026-09-08 |
| ATPC | Agape ATP Corp | 208.13 | 100.06만 주 (1,000,626주) | 2026-06-30 |
| XPON | Expion Energy, Inc. | 414.11 | 101.25만 주 (1,012,498주) | 2026-09-18 |
| SMX | SMX (Security Matters) Public Ltd Co | 412.58 | 108.86만 주 (1,088,608주) | 2026-07-23 |
| GAUZ | Gauzy Ltd. | 532.70 | 114.31만 주 (1,143,135주) | 2026-09-08 |
| ATXG | ADDENTAX GROUP CORP. | 856.04 | 117.8만 주 (1,177,974주) | 2026-08-14 |
| CHNR | CHINA NATURAL RESOURCES INC | 491.90 | 125.64만 주 (1,256,388주) | 2026-05-15 |
| YHC | LQR House Inc. | 165.59 | 130.39만 주 (1,303,857주) | 2026-08-19 |
| JUNS | JUPITER NEUROSCIENCES, INC. | 377.10 | 131.85만 주 (1,318,521주) | 2026-09-21 |
| FCHL | Fitness Champs Holdings Ltd | 118.76 | 131.87만 주 (1,318,742주) | 2026-06-30 |
| CTNT | CHEETAH NET SUPPLY CHAIN SERVICE INC. | 392.95 | 133.34만 주 (1,333,445주) | 2026-09-30 |
| VRAX | Virax Biolabs Group Ltd | 273.03 | 134.5만 주 (1,344,988주) | 2026-09-02 |
| ASBP | Aspire-Lakewood Holdings, Inc. | 1,228.64 | 140.26만 주 (1,402,557주) | 2026-08-07 |
| NXTS | Nexentis Technologies Inc. | 202.01 | 145.33만 주 (1,453,333주) | 2026-08-13 |
| CNSP | CNS Pharmaceuticals, Inc. | 774.83 | 146.14만 주 (1,461,449주) | 2026-08-11 |
| SONM | DNA X, Inc. | 593.82 | 148.83만 주 (1,488,268주) | 2026-08-18 |
| NDRA | ENDRA Life Sciences Inc. | 905.90 | 149.98만 주 (1,499,838주) | 2026-06-30 |
| HTCR | HeartCore Enterprises, Inc. | 265.18 | 151.53만 주 (1,515,328주) | 2026-08-13 |
| APUS | 아피메즈 파머슈티컬스 US | 1,076.00 | 154.26만 주 (1,542,624주) | 2026-09-23 |
| BMGL | Basel Medical Group Ltd | 521.30 | 158.21만 주 (1,582,111주) | 2026-10-08 |
| TRNR | Interactive Strength, Inc. | 363.09 | 161.97만 주 (1,619,702주) | 2026-08-13 |
| MDRR | Medalist Diversified, Inc. | 1,641.53 | 162.85만 주 (1,628,500주) | 2026-08-13 |
| FLYE | Fly-E Group, Inc. | 217.11 | 163.24만 주 (1,632,386주) | 2026-09-01 |
| ERNA | Ernexa Therapeutics Inc. | 364.84 | 163.24만 주 (1,632,411주) | 2026-08-06 |
| NEXR | Nexera Technologies Ltd | 62.44 | 163.6만 주 (1,635,990주) | 2026-09-28 |
| EEIQ | EpicQuest Education Group International Ltd | 821.66 | 164.66만 주 (1,646,623주) | 2026-06-01 |
| OLOX | OLENOX INDUSTRIES INC. | 207.42 | 165.93만 주 (1,659,347주) | 2026-08-18 |
| EZRA | Reliance Global Group, Inc. | 419.99 | 167.99만 주 (1,679,936주) | 2026-08-26 |
| SDOT | Sadot Group Inc. | 1,559.62 | 170.76만 주 (1,707,589주) | 2026-09-30 |
| CPOP | 팝 컬처 그룹 | 465.03 | 170.8만 주 (1,707,953주) | 2026-09-24 |
| CETX | CEMTREX INC | 337.34 | 172.11만 주 (1,721,141주) | 2026-08-12 |
| SSM | Sono Group N.V. | 239.17 | 174.83만 주 (1,748,334주) | 2026-09-08 |
| ARBB | ARB IOT Group Ltd | 790.84 | 176.53만 주 (1,765,256주) | 2025-12-31 |
| LNKS | 링커스 인더스트리스 | 140.00 | 177.14만 주 (1,771,351주) | 2026-06-30 |
| PTN | PALATIN TECHNOLOGIES INC | 1,675.86 | 178.09만 주 (1,780,939주) | 2026-09-25 |
| PRPO | Precipio, Inc. | 4,198.00 | 179.02만 주 (1,790,188주) | 2026-08-10 |
| PWCM | POWERCOMPUTE, INC. | 256.68 | 179.41만 주 (1,794,135주) | 2026-08-11 |
| APVO | Aptevo Therapeutics Inc. | 324.93 | 181.02만 주 (1,810,215주) | 2026-08-21 |
| SAIH | SAIHEAT Ltd | 2,910.43 | 181.04만 주 (1,810,360주) | 2026-07-10 |
| GURE | GULF RESOURCES, INC. | 547.69 | 181.35만 주 (1,813,531주) | 2026-06-30 |
| AMIX | Autonomix Medical, Inc. | 680.10 | 182.85만 주 (1,828,505주) | 2026-08-31 |
| BDL | 플래니건스 엔터프라이지스 | 8,735.66 | 185.86만 주 (1,858,647주) | 2026-08-10 |
| GIPR | GENERATION INCOME PROPERTIES, INC. | 115.63 | 186.13만 주 (1,861,303주) | 2026-08-14 |
| SVRN | OceanPal Inc. | 8,201.28 | 187.58만 주 (1,875,816주) | 2026-05-08 |
| SGRX | SANGRIX INC. | 60.79 | 188.19만 주 (1,881,935주) | 2026-09-23 |
| TRUG | TruGolf Holdings, Inc. | 334.64 | 192.37만 주 (1,923,707주) | 2026-06-30 |
| BOLT | Bolt Biotherapeutics, Inc. | 676.15 | 192.63만 주 (1,926,345주) | 2026-06-30 |
| MTEX | MANNATECH INC | 1,503.21 | 192.97만 주 (1,929,670주) | 2026-06-30 |
| FGI | FGI Industries Ltd. | 1,481.28 | 193.13만 주 (1,931,271주) | 2026-06-30 |
| PFX | PhenixFIN Corp | 8,767.97 | 193.13만 주 (1,931,273주) | 2026-08-05 |
| BRNX | BRENX LTD. | 350.46 | 194.7만 주 (1,946,972주) | 2026-09-24 |
| EDBL | Edible Garden AG Inc | 222.47 | 195.15만 주 (1,951,509주) | 2026-08-06 |
| DETX | 리버티 디펜스 홀딩스 | 1,113.67 | 198.43만 주 (1,984,303주) | 2026-04-20 |
| ASTC | ASTROTECH Corp | 1,441.60 | 200.91만 주 (2,009,050주) | 2026-09-23 |
| MAYS | MAYS J W INC | 8,083.28 | 201.58만 주 (2,015,780주) | 2026-06-11 |
| EHGO | 이샬고 | 309.59 | 202.26만 주 (2,022,609주) | 2026-03-31 |
| MXC | 멕스코 에너지 | 2,170.81 | 204.6만 주 (2,046,000주) | 2026-08-12 |
| CKX | CKX 랜즈 | 2,199.93 | 205.31만 주 (2,053,129주) | 2026-08-06 |
| ILAG | Intelligent Living Application Group Inc. | 602.31 | 207.69만 주 (2,076,948주) | 2025-12-31 |
| LEXX | Lexaria Bioscience Corp. | 682.50 | 210.65만 주 (2,106,528주) | 2026-10-01 |
| INTG | INTERGROUP CORP | 6,186.42 | 214.88만 주 (2,148,812주) | 2026-09-28 |
| RYM | RYTHM, Inc. | 4,366.98 | 217.91만 주 (2,179,128주) | 2026-06-30 |
| GRI | GRI Bio, Inc. | 415.36 | 218.61만 주 (2,186,115주) | 2026-08-13 |
| RVSN | Rail Vision Ltd. | 780.66 | 219.22만 주 (2,192,186주) | 2026-03-25 |
| GYRO | Gyrodyne, LLC | 1,033.68 | 219.93만 주 (2,199,308주) | 2026-06-30 |
| MSAI | MultiSensor AI Holdings, Inc. | 1,003.57 | 220.56만 주 (2,205,648주) | 2026-06-30 |
| HCWB | HCW Biologics Inc. | 351.10 | 223.63만 주 (2,236,324주) | 2026-09-28 |
| HTOO | Fusion Fuel Green PLC | 1,578.41 | 228.83만 주 (2,288,291주) | 2025-12-31 |
| DTST | Data Storage Corp | 801.84 | 233.77만 주 (2,337,738주) | 2026-08-13 |
| DAIC | CID Holdco, Inc. | 586.78 | 233.78만 주 (2,337,767주) | 2026-09-24 |
| PMI | PICARD MEDICAL INC | 2,043.97 | 233.86만 주 (2,338,634주) | 2026-08-17 |
| XBIO | Xenetic Biosciences, Inc. | 496.75 | 234.32만 주 (2,343,181주) | 2026-06-30 |
| DPU | 탑 킹윈 | 406.96 | 235.72만 주 (2,357,226주) | 2025-12-31 |
| LABT | Lakewood-Amedex Biotherapeutics Inc. | 205.45 | 236.97만 주 (2,369,688주) | 2026-08-03 |
| ABTS | Abits Group Inc | 400.20 | 237만 주 (2,369,995주) | 2025-12-31 |
| JWEL | Jowell Global Ltd. | 570.27 | 237.61만 주 (2,376,131주) | 2025-12-31 |
| DCOY | Decoy Therapeutics Inc. | 285.14 | 238.53만 주 (2,385,282주) | 2026-10-06 |
| AKAN | AKANDA CORP. | 451.37 | 238.82만 주 (2,388,212주) | 2026-09-23 |
| RKDA | Arcadia Biosciences, Inc. | 71.79 | 240.92만 주 (2,409,211주) | 2026-08-06 |
| NCRA | NOCERA, INC. | 392.06 | 242.16만 주 (2,421,612주) | 2026-10-02 |
| PLRZ | Polyrizon Ltd. | 2,293.72 | 242.86만 주 (2,428,604주) | 2026-09-28 |
| ONFO | Onfolio Holdings, Inc | 211.57 | 245.27만 주 (2,452,712주) | 2026-08-19 |
| CENN | Cenntro Inc. | 891.69 | 245.65만 주 (2,456,452주) | 2026-08-13 |
| GIXI | GIX 인터넷 | 1,077.94 | 249.24만 주 (2,492,351주) | 2026-06-18 |
| RGS | REGIS CORP | 7,437.98 | 249.88만 주 (2,498,778주) | 2026-06-30 |
| IVF | INVO Fertility, Inc. | 379.37 | 250.7만 주 (2,506,969주) | 2026-08-14 |
| ACFN | ACORN ENERGY, INC. | 4,642.80 | 250.96만 주 (2,509,618주) | 2026-06-30 |
| ISPC | iSpecimen Inc. | 269.49 | 251.86만 주 (2,518,590주) | 2026-08-14 |
| INHD | INNO HOLDINGS INC. | 846.92 | 252.06만 주 (2,520,581주) | 2026-08-18 |
| NCI | Neo-Concept International Group Holdings Ltd | 210.75 | 258.2만 주 (2,581,952주) | 2026-09-27 |
| CLDI | 칼리디 바이오테라퓨틱스 | 263.59 | 258.42만 주 (2,584,184주) | 2026-08-10 |
| YHGJ | YUNHONG GREEN CTI LTD. | 730.59 | 260.92만 주 (2,609,244주) | 2026-08-07 |
| ADIL | ADIAL PHARMACEUTICALS, INC. | 1,045.10 | 262.59만 주 (2,625,890주) | 2026-08-12 |
| CLRO | CLEARONE INC | 1,083.54 | 267.54만 주 (2,675,412주) | 2026-08-14 |
| AIRT | AIR T INC | 8,259.79 | 268.17만 주 (2,681,748주) | 2026-07-31 |
| TNON | Tenon Medical, Inc. | 383.60 | 268.87만 주 (2,688,735주) | 2026-10-01 |
| BTLN | Brightline Interactive, Inc./NV | 1,459.22 | 271.24만 주 (2,712,351주) | 2026-06-30 |
| NXPL | NextPlat Corp | 2,515.15 | 271.32만 주 (2,713,222주) | 2026-06-30 |
| BBLG | Bone Biologics Corp | 132.15 | 275.61만 주 (2,756,057주) | 2026-08-14 |
| IPW | iPower Inc. | 126.26 | 277.34만 주 (2,773,422주) | 2026-10-09 |
| MKZR | MacKenzie Realty Capital, Inc. | 382.91 | 277.47만 주 (2,774,688주) | 2026-09-28 |
| PCSA | Processa Pharmaceuticals, Inc. | 424.60 | 279.34만 주 (2,793,386주) | 2026-06-30 |
| SNTG | Sentage Holdings Inc. | 474.10 | 280.53만 주 (2,805,325주) | 2025-12-31 |
| EHLD | Euroholdings Ltd. | 3,636.25 | 281.66만 주 (2,816,615주) | 2025-12-31 |
| LFWD | Lifeward Ltd. | 1,795.50 | 283.2만 주 (2,832,016주) | 2026-08-12 |
| NSYS | NORTECH SYSTEMS INC | 3,218.94 | 285.38만 주 (2,853,766주) | 2026-08-05 |
| LVLU | Lulu's Fashion Lounge Holdings, Inc. | 3,714.38 | 287.16만 주 (2,871,576주) | 2026-08-07 |
| TCBS | Texas Community Bancshares, Inc. | 4,883.64 | 287.27만 주 (2,872,727주) | 2026-06-30 |
| ACON | Aclarion, Inc. | 660.06 | 288.24만 주 (2,882,371주) | 2026-08-04 |
| KEQU | KEWAUNEE SCIENTIFIC CORP /DE/ | 9,763.12 | 289.53만 주 (2,895,347주) | 2026-09-08 |
| APLM | Apollomics Inc. | 6,442.07 | 291.5만 주 (2,914,965주) | 2026-09-03 |
| WAFU | Wah Fu Education Group Ltd | 643.94 | 292.26만 주 (2,922,559주) | 2026-03-31 |
| BGLC | BioNexus Gene Lab Corp | 363.75 | 293.34만 주 (2,933,442주) | 2026-08-14 |
| NIKI | NIKI 바이오솔루션스 | 1,457.41 | 293.86만 주 (2,938,625주) | 2026-10-09 |
| OBTC | Osprey Bitcoin Trust | 8,065.90 | 294.05만 주 (2,940,535주) | 2026-06-30 |
| CMCT | Creative Media & Community Trust Corp | 1,081.73 | 294.75만 주 (2,947,493주) | 2026-06-30 |
| UPLD | Upland Software, Inc. | 1,105.99 | 295.72만 주 (2,957,191주) | 2026-08-10 |
| CDIO | Cardio Diagnostics Holdings, Inc. | 591.89 | 295.95만 주 (2,959,469주) | 2026-08-07 |
| GWAV | Greenwave Technology Solutions, Inc. | 706.85 | 298.25만 주 (2,982,484주) | 2026-09-18 |
| EUDA | EUDA Health Holdings Ltd | 5,806.00 | 299.43만 주 (2,994,325주) | 2026-07-31 |
| SLE | Super League Enterprise, Inc. | 1,358.58 | 300.85만 주 (3,008,498주) | 2026-09-29 |
| DFNS | T3 Defense Inc. | 1,903.00 | 300.88만 주 (3,008,775주) | 2026-08-28 |
| MBBC | Marathon Bancorp, Inc. /MD/ | 4,484.75 | 300.99만 주 (3,009,903주) | 2026-09-15 |
| UUU | 유니버설 세이프티 프로덕츠 | 1,502.12 | 302.85만 주 (3,028,463주) | 2026-08-14 |
| HFBL | Home Federal Bancorp, Inc. of Louisiana | 7,321.91 | 303.06만 주 (3,030,594주) | 2026-09-21 |
| PRFX | PRF Technologies Ltd. | 267.74 | 304.18만 주 (3,041,830주) | 2026-06-22 |
| MEDS | DataMeds AI, Inc. | 978.38 | 306.19만 주 (3,061,919주) | 2026-08-17 |
| LIVE | LIVE VENTURES Inc | 2,300.67 | 307.17만 주 (3,071,656주) | 2026-08-13 |
| NYC | American Strategic Investment Co. | 1,977.27 | 316.36만 주 (3,163,632주) | 2026-08-07 |
| AFJK | Aimei Health Technology Co., Ltd. | 3,910.42 | 316.63만 주 (3,166,332주) | 2026-08-13 |
| NCEW | New Century Logistics (BVI) Ltd | 5,414.40 | 320만 주 (3,200,000주) | 2026-02-01 |
| PASG | Passage BIO, Inc. | 1,312.87 | 321.78만 주 (3,217,810주) | 2026-06-30 |
| COHN | 코헨 앤드 컴퍼니 | 3,461.46 | 322.9만 주 (3,228,970주) | 2026-07-28 |
| WLDS | Wearable Devices Ltd. | 344.36 | 323.29만 주 (3,232,903주) | 2026-09-30 |
| INTS | INTENSITY THERAPEUTICS, INC. | 1,159.03 | 326.49만 주 (3,264,879주) | 2026-08-07 |
| JYD | 자위다 글로벌 로지스틱스 | 737.16 | 327.39만 주 (3,273,900주) | 2025-12-31 |
| INBS | INTELLIGENT BIO SOLUTIONS INC. | 524.05 | 331.68만 주 (3,316,803주) | 2026-09-14 |
| LRHC | La Rosa Holdings Corp. | 88.29 | 331.78만 주 (3,317,834주) | 2026-08-20 |
| PSQH | PSQ Holdings, Inc. | 1,332.85 | 336.58만 주 (3,365,783주) | 2026-07-31 |
| DUKR | DUKE Robotics Corp. | 1,197.80 | 342.6만 주 (3,425,978주) | 2026-08-13 |
| IMTE | Integrated Media Technology Ltd | 156.81 | 344.64만 주 (3,446,434주) | 2026-01-15 |
| DFSC | DEFSEC Technologies Inc. | 264.29 | 347.13만 주 (3,471,316주) | 2026-08-19 |
| RENX | RenX Enterprises Corp. | 513.36 | 347.25만 주 (3,472,508주) | 2026-10-05 |
| ATCX | ATLAS CRITICAL MINERALS Corp | 1,342.00 | 347.5만 주 (3,474,972주) | 2025-12-31 |
| AUBN | AUBURN NATIONAL BANCORPORATION, INC | 9,386.68 | 348.43만 주 (3,484,292주) | 2026-08-10 |
| SXTP | 60 DEGREES PHARMACEUTICALS, INC. | 390.39 | 351.7만 주 (3,516,988주) | 2026-08-14 |
| JCTC | JEWETT CAMERON TRADING CO LTD | 1,041.95 | 352.01만 주 (3,520,113주) | 2026-07-14 |
| PARA | 반자이 인터내셔널 | 236.67 | 355.1만 주 (3,550,961주) | 2026-06-30 |
| JTAI | Jet.AI Inc. | 526.51 | 355.75만 주 (3,557,521주) | 2026-07-30 |
| AQMS | Aqua Metals, Inc. | 750.12 | 356.35만 주 (3,563,531주) | 2026-07-24 |
| CVKD | Cadrenal Therapeutics, Inc. | 353.19 | 356.76만 주 (3,567,592주) | 2026-08-13 |
| ARKR | ARK RESTAURANTS CORP | 1,658.83 | 360.62만 주 (3,606,157주) | 2026-08-07 |
| NUWE | Nuwellis, Inc. | 255.71 | 364.73만 주 (3,647,264주) | 2026-08-10 |
| PULM | Pulmatrix, Inc. | 522.28 | 365.23만 주 (3,652,285주) | 2026-06-30 |
| CNET | ZW Data Action Technologies Inc. | 568.61 | 366.84만 주 (3,668,429주) | 2026-06-30 |
| STRR | Star Equity Holdings, Inc. | 3,693.09 | 368.94만 주 (3,689,403주) | 2026-06-30 |
| NOEM | CO2 Energy Transition Corp. | 3,950.60 | 371.65만 주 (3,716,465주) | 2026-08-13 |
| PRHI | Presurance Holdings, Inc. | 2,873.25 | 374.61만 주 (3,746,092주) | 2026-06-30 |
| ICON | 아이콘 에너지 | 986.76 | 375.93만 주 (3,759,314주) | 2026-06-30 |
| JL | J-Long Group Ltd | 677.13 | 376.17만 주 (3,761,701주) | 2026-03-31 |
| PBM | PSYENCE BIOMEDICAL LTD. | 1,914.79 | 381.43만 주 (3,814,328주) | 2026-08-25 |
| ACCS | 액세스 뉴스와이어 | 1,856.24 | 382.73만 주 (3,827,304주) | 2026-08-10 |
| PTHS | 펠토스 테라퓨틱스 | 8,223.55 | 382.85만 주 (3,828,469주) | 2026-08-10 |
| POLA | Polar Power, Inc. | 491.26 | 385.17만 주 (3,851,684주) | 2026-08-17 |
| TWAV | TaoWeave, Inc. | 721.16 | 387.72만 주 (3,877,219주) | 2026-08-05 |
| AWX | 아발론 홀딩스 | 821.91 | 389.94만 주 (3,899,431주) | 2026-06-30 |
| CCTG | CCSC Technology International Holdings Ltd | 672.32 | 391.35만 주 (3,913,520주) | 2026-03-31 |
| ONCO | Onconetix, Inc. | 289.60 | 394.91만 주 (3,949,107주) | 2026-08-13 |
| REVB | REVELATION BIOSCIENCES, INC. | 299.63 | 398.34만 주 (3,983,416주) | 2026-08-03 |
| DRMA | Dermata Therapeutics, Inc. | 454.50 | 402.21만 주 (4,022,143주) | 2026-06-30 |
| RMTI | ROCKWELL MEDICAL, INC. | 3,083.31 | 403.05만 주 (4,030,465주) | 2026-08-10 |
| CLST | Catalyst Bancorp, Inc. | 6,918.35 | 403.38만 주 (4,033,791주) | 2026-08-12 |
| ELOX | Eloxx Pharmaceuticals, Inc. | 6,107.16 | 403.64만 주 (4,036,398주) | 2026-06-30 |
| KYNB | KYNTRA BIO, INC. | 2,413.28 | 404.91만 주 (4,049,124주) | 2026-06-30 |
| IOR | 인컴 오퍼튜니티 리얼티 인베스터스 | 7,062.95 | 406.62만 주 (4,066,178주) | 2026-08-06 |
| BHM | 블루록 홈스 트러스트 | 3,345.22 | 410.8만 주 (4,108,028주) | 2026-08-03 |
| IOTR | iOThree Ltd | 603.41 | 412.82만 주 (4,128,241주) | 2026-03-31 |
| GDC | GD Culture Group Ltd | 566.10 | 416.25만 주 (4,162,500주) | 2026-08-14 |
| CPBI | Central Plains Bancshares, Inc. | 8,344.89 | 417.22만 주 (4,172,236주) | 2026-08-12 |
| VHC | VirnetX Holding Corp | 5,040.98 | 419.6만 주 (4,196,009주) | 2026-09-29 |
| GITS | Global Interactive Technologies, Inc. | 731.34 | 420.31만 주 (4,203,104주) | 2026-09-09 |
| GVH | Globavend Holdings Ltd | 482.07 | 430.42만 주 (4,304,176주) | 2026-08-11 |
| SBFM | Sunshine Biopharma Inc. | 171.51 | 431.03만 주 (4,310,301주) | 2026-10-09 |
| PRPL | Purple Innovation, Inc. | 940.27 | 435.96만 주 (4,359,632주) | 2026-08-10 |
| ICU | SeaStar Medical Holding Corp | 1,405.78 | 440.68만 주 (4,406,841주) | 2026-08-05 |
| KPRX | KIORA PHARMACEUTICALS INC | 1,106.10 | 442.44만 주 (4,424,387주) | 2026-06-30 |
| WOK | WORK Medical Technology Group LTD | 662.49 | 446.76만 주 (4,467,578주) | 2026-08-24 |
| BJDX | Bluejay Diagnostics, Inc. | 362.22 | 446.81만 주 (4,468,051주) | 2026-08-07 |
| ENVB | Enveric Biosciences, Inc. | 657.95 | 447.59만 주 (4,475,884주) | 2026-08-12 |
| INLX | 인텔리네틱스 | 2,180.07 | 449.5만 주 (4,494,994주) | 2026-08-10 |
| OGEN | 오라제닉스 | 218.83 | 451.2만 주 (4,511,957주) | 2026-08-12 |
| ZNB | Zeta Network Group | 112.50 | 455.01만 주 (4,550,126주) | 2026-09-09 |
| HBIO | HARVARD BIOSCIENCE INC | 3,896.77 | 455.23만 주 (4,552,305주) | 2026-06-30 |
| UK | 유커뮨 인터내셔널 | 131.87 | 455.59만 주 (4,555,930주) | 2025-12-31 |
| NXTC | NextCure, Inc. | 2,602.23 | 457.74만 주 (4,577,359주) | 2026-07-31 |
| YYAI | AIRWA INC. | 361.88 | 458.19만 주 (4,581,917주) | 2026-09-18 |
| MSGM | 모터스포츠 게임스 | 2,386.18 | 458.88만 주 (4,588,802주) | 2026-08-14 |
| UG | UNITED GUARDIAN INC | 3,298.72 | 459.43만 주 (4,594,319주) | 2026-06-30 |
| ARTL | ARTELO BIOSCIENCES, INC. | 189.53 | 459.51만 주 (4,595,068주) | 2026-08-11 |
| BMRA | BIOMERICA INC | 984.18 | 459.9만 주 (4,598,968주) | 2026-09-28 |
| UONE | 어반 원 | 254.00 | 461.5만 주 (4,614,964주) | 2026-07-30 |
| UONEK | 어반 원 D | 1,228.25 | 461.5만 주 (4,614,964주) | 2026-07-30 |
| HIHO | HIGHWAY HOLDINGS LTD | 409.23 | 462.67만 주 (4,626,676주) | 2026-03-31 |
| PARK | Park Dental Partners, Inc. | 9,762.59 | 475.53만 주 (4,755,282주) | 2026-08-13 |
| SHPH | Shuttle Pharmaceuticals Holdings, Inc. | 1,934.47 | 476.47만 주 (4,764,696주) | 2026-09-14 |
| SNOA | Sonoma Pharmaceuticals, Inc. | 588.98 | 478.84만 주 (4,788,425주) | 2026-08-06 |
| AGMH | AGM 그룹 홀딩스 | 231.06 | 479.64만 주 (4,796,375주) | 2026-08-07 |
| HSCS | HeartSciences Inc. | 1,826.15 | 480.02만 주 (4,800,172주) | 2026-09-11 |
| HYFM | HYDROFARM HOLDINGS GROUP, INC. | 477.11 | 481.93만 주 (4,819,323주) | 2026-08-12 |
| ALZN | Alzamend Neuro, Inc. | 661.12 | 482.57만 주 (4,825,723주) | 2026-09-10 |
| TULP | BLOOMIA HOLDINGS, INC. | 1,309.19 | 483.1만 주 (4,830,965주) | 2026-09-15 |
| OPAD | Offerpad Solutions Inc. | 1,483.65 | 483.27만 주 (4,832,749주) | 2026-07-27 |
| AIRI | 에어 인더스트리스 그룹 | 1,253.90 | 485.07만 주 (4,850,658주) | 2026-08-11 |
| BQ | 보치 홀딩 | 550.21 | 487.96만 주 (4,879,614주) | 2026-03-31 |
| MYSZ | My Size, Inc. | 114.37 | 489.67만 주 (4,896,681주) | 2026-09-28 |
| WVVI | WILLAMETTE VALLEY VINEYARDS INC | 931.17 | 497.95만 주 (4,979,529주) | 2026-08-12 |
| UPC | Universe Pharmaceuticals INC | 2,108.50 | 502.44만 주 (5,024,390주) | 2026-08-31 |
| GP | GREENPOWER MOTOR Co INC. | 379.65 | 502.93만 주 (5,029,291주) | 2026-03-31 |
| WFF | WF Holding Ltd | 8,425.91 | 503.8만 주 (5,038,018주) | 2025-12-31 |
| WFCF | Where Food Comes From, Inc. | 6,732.50 | 503.93만 주 (5,039,276주) | 2026-05-07 |
| INKT | MiNK Therapeutics, Inc. | 5,970.51 | 510.3만 주 (5,103,002주) | 2026-08-11 |
| GBR | 뉴 컨셉 에너지 | 374.63 | 513.19만 주 (5,131,934주) | 2026-08-07 |
| AQB | AQUABOUNTY TECHNOLOGIES INC | 450.17 | 514.72만 주 (5,147,204주) | 2026-06-30 |
| RGNT | 리젠티스 바이오 | 1,158.95 | 517.94만 주 (5,179,378주) | 2025-12-31 |
| CPHC | Canterbury Park Holding Corp | 8,163.84 | 518.34만 주 (5,183,394주) | 2026-06-30 |
| CHR | Cheer Holding, Inc. | 271.28 | 518.62만 주 (5,186,248주) | 2025-12-31 |
| ARTW | ARTS WAY MANUFACTURING CO INC | 1,711.26 | 520.14만 주 (5,201,386주) | 2026-06-22 |
| VRM | Vroom, Inc. | 4,894.12 | 523.44만 주 (5,234,356주) | 2026-08-03 |
| FDSB | Fifth District Bancorp, Inc. | 9,146.69 | 523.57만 주 (5,235,658주) | 2026-06-30 |
| AERT | Aeries Technology, Inc. | 3,794.20 | 524.79만 주 (5,247,853주) | 2026-06-30 |
| JCSE | JE Cleantech Holdings Ltd | 703.44 | 525.27만 주 (5,252,720주) | 2025-12-31 |
| RLYB | Rallybio Corp | 9,070.33 | 531.05만 주 (5,310,499주) | 2026-07-30 |
| TPET | 트리오 페트롤리엄 | 835.85 | 532.39만 주 (5,323,907주) | 2026-09-08 |
| SGLY | Singularity Future Technology Ltd. | 433.65 | 540.38만 주 (5,403,788주) | 2026-09-28 |
| NEUP | Neuphoria Therapeutics Inc. | 1,866.91 | 541.13만 주 (5,411,334주) | 2026-06-30 |
| NWTG | Newton Golf Company, Inc. | 659.57 | 542.23만 주 (5,422,276주) | 2026-08-13 |
| SNES | SenesTech, Inc. | 449.61 | 542.35만 주 (5,423,542주) | 2026-08-04 |
| JDZG | JIADE Ltd | 2,753.59 | 543.15만 주 (5,431,512주) | 2026-07-30 |
| MDBH | MDB Capital Holdings, LLC | 1,136.95 | 543.86만 주 (5,438,632주) | 2026-08-13 |
| WBUY | 위바이 글로벌 | 385.01 | 548.11만 주 (5,481,104주) | 2025-12-31 |
| ACXP | Acurx Pharmaceuticals, Inc. | 728.28 | 548.79만 주 (5,487,878주) | 2026-09-10 |
| INM | InMed Pharmaceuticals Inc. | 730.67 | 549.37만 주 (5,493,735주) | 2026-06-30 |
| FUSB | FIRST US BANCSHARES, INC. | 8,972.68 | 550.47만 주 (5,504,709주) | 2026-07-31 |
| WATT | Energous Corp | 6,980.69 | 552.71만 주 (5,527,071주) | 2026-06-30 |
| YDKG | Yueda Digital Holding | 493.26 | 552.92만 주 (5,529,189주) | 2025-12-31 |
| SMSI | SMITH MICRO SOFTWARE, INC. | 1,458.96 | 558.99만 주 (5,589,880주) | 2026-08-12 |
| IMNN | Imunon, Inc. | 628.48 | 561.14만 주 (5,611,403주) | 2026-08-10 |
| IDAI | T Stamp Inc | 1,866.61 | 563.93만 주 (5,639,291주) | 2026-08-12 |
| BGDE | Big Digital Energy, Inc. | 3,059.16 | 566.43만 주 (5,664,339주) | 2026-08-07 |
| CABO | Cable One, Inc. | 7,359.07 | 567.39만 주 (5,673,925주) | 2026-07-31 |
| JVA | COFFEE HOLDING CO INC | 2,277.73 | 570.86만 주 (5,708,599주) | 2026-09-11 |
| UBCP | UNITED BANCORP INC /OH/ | 8,121.50 | 573.55만 주 (5,735,518주) | 2026-08-07 |
| CJMB | CALLAN JMB INC. | 1,340.30 | 575.24만 주 (5,752,368주) | 2026-08-12 |
| NCEL | NewcelX Ltd. | 1,594.00 | 577.61만 주 (5,776,128주) | 2026-08-19 |
| SPPL | SIMPPLE LTD. | 1,957.24 | 578.62만 주 (5,786,184주) | 2025-12-31 |
| AUUD | AUDDIA INC. | 667.35 | 580.31만 주 (5,803,050주) | 2026-08-13 |
| ORKT | ORANGEKLOUD TECHNOLOGY INC. | 487.15 | 583.98만 주 (5,839,770주) | 2025-12-31 |
| ATTT | Raytech Holding Ltd | 1,533.31 | 587.47만 주 (5,874,743주) | 2026-03-31 |
| AIRE | reAlpha Tech Corp. | 750.83 | 588.43만 주 (5,884,275주) | 2026-08-12 |
| CDLX | Cardlytics, Inc. | 1,531.07 | 588.87만 주 (5,888,716주) | 2026-07-31 |
| IMCC | IM Cannabis Corp. | 319.61 | 589.48만 주 (5,894,812주) | 2025-12-31 |
| NDLS | NOODLES & Co | 8,275.76 | 596.67만 주 (5,966,660주) | 2026-07-21 |
| FFAI | FARADAY FUTURE INTELLIGENT ELECTRIC INC. | 704.60 | 597.16만 주 (5,971,582주) | 2026-09-08 |
| PXLW | PIXELWORKS, INC | 4,022.84 | 604.94만 주 (6,049,393주) | 2026-08-07 |
| BTBD | BT Brands, Inc. | 1,032.85 | 618.47만 주 (6,184,724주) | 2026-06-28 |
| VS | Versus Systems Inc. | 670.97 | 621.26만 주 (6,212,646주) | 2026-06-30 |
| TANH | TANTECH HOLDINGS LTD | 1,126.99 | 621.49만 주 (6,214,872주) | 2025-12-31 |
| ALGS | Aligos Therapeutics, Inc. | 2,929.17 | 624.46만 주 (6,244,558주) | 2026-08-03 |
| CODX | Co-Diagnostics, Inc. | 856.10 | 625.23만 주 (6,252,319주) | 2026-08-11 |
| PBHC | Pathfinder Bancorp, Inc. | 8,273.33 | 627.86만 주 (6,278,643주) | 2026-08-10 |
| SPCB | SuperCom Ltd | 5,809.42 | 628.05만 주 (6,280,452주) | 2026-07-14 |
| SGA | SAGA COMMUNICATIONS INC | 5,321.64 | 635.8만 주 (6,357,988주) | 2026-08-10 |
| EFOI | ENERGY FOCUS, INC/DE | 2,006.30 | 636.92만 주 (6,369,222주) | 2026-06-30 |
| INLF | INLIF Ltd | 359.96 | 640만 주 (6,400,000주) | 2026-02-11 |
| AIFA | All In FutureTech Alliance, Inc. | 4,924.39 | 642.03만 주 (6,420,316주) | 2026-08-04 |
| AHT | ASHFORD HOSPITALITY TRUST INC | 1,436.30 | 646.98만 주 (6,469,814주) | 2026-08-10 |
| PLSM | Pulsenmore Ltd. | 1,404.61 | 650.28만 주 (6,502,844주) | 2026-03-15 |
| KUST | KUSTOM ENTERTAINMENT, INC. | 297.36 | 650.69만 주 (6,506,860주) | 2026-08-14 |
| TVGN | Tevogen Inc. | 4,225.99 | 651.15만 주 (6,511,540주) | 2026-08-10 |
| SUNE | SUNation Energy, Inc. | 1,524.07 | 651.31만 주 (6,513,108주) | 2026-06-30 |
| XCUR | EXICURE, INC. | 706.97 | 654.6만 주 (6,545,995주) | 2026-08-12 |
| AMST | Amesite Inc. | 609.14 | 654.99만 주 (6,549,851주) | 2026-06-30 |
| XELB | XCel Brands, Inc. | 394.27 | 656.03만 주 (6,560,274주) | 2026-08-02 |
| XLO | Xilio Therapeutics, Inc. | 5,922.14 | 658.01만 주 (6,580,149주) | 2026-06-30 |
| MTVA | MetaVia Inc. | 975.04 | 658.81만 주 (6,588,101주) | 2026-08-03 |
| CELZ | CREATIVE MEDICAL TECHNOLOGY HOLDINGS, INC. | 593.59 | 659.26만 주 (6,592,557주) | 2026-08-07 |
| ELWT | Elauwit Connection, Inc. | 4,137.37 | 661.98만 주 (6,619,796주) | 2026-06-30 |
| BGMS | Bio Green Med Solution, Inc. | 566.71 | 662.28만 주 (6,622,794주) | 2026-06-30 |
| SYNX | 사일링스컴 | 597.03 | 663.44만 주 (6,634,400주) | 2026-09-30 |
| AMS | 아메리칸 셰어드 호스피털 서비시스 | 917.70 | 665만 주 (6,650,000주) | 2026-08-11 |
| FBLG | FibroBiologics, Inc. | 752.38 | 665.82만 주 (6,658,193주) | 2026-06-30 |
| SINT | Sintx Technologies, Inc. | 1,452.87 | 666.45만 주 (6,664,534주) | 2026-08-05 |
| ELTK | ELTEK LTD | 5,376.66 | 671.98만 주 (6,719,827주) | 2025-12-31 |
| HTCO | High-Trend International Group | 1,505.79 | 675.53만 주 (6,755,324주) | 2026-04-30 |
| TIL | Instil Bio, Inc. | 4,669.39 | 678.2만 주 (6,781,976주) | 2026-06-30 |
| CLIR | ClearSign Technologies Corp | 2,246.46 | 680.75만 주 (6,807,455주) | 2026-08-08 |
| AXIL | 액실 브랜즈 | 4,209.59 | 682.27만 주 (6,822,681주) | 2026-10-02 |
| BIYA | Baiya International Group Inc. | 368.44 | 682.99만 주 (6,829,864주) | 2026-08-21 |
| CVV | CVD EQUIPMENT CORP | 2,995.97 | 695.12만 주 (6,951,203주) | 2026-08-11 |
| OPXS | Optex Systems Holdings Inc | 7,099.07 | 695.99만 주 (6,959,873주) | 2026-06-28 |
| XRTX | XORTX Therapeutics Inc. | 314.26 | 696.22만 주 (6,962,218주) | 2025-12-31 |
| FABC | Fabric.AI, Inc. | 1,645.85 | 700.36만 주 (7,003,613주) | 2026-08-12 |
| CUPR | Cuprina Holdings (Cayman) LTD | 1,278.46 | 700.38만 주 (7,003,758주) | 2026-09-17 |
| HIND | Vyome Holdings, Inc | 1,445.82 | 701.85만 주 (7,018,528주) | 2026-06-30 |
| BOSC | BOS BETTER ONLINE SOLUTIONS LTD | 3,282.81 | 702.89만 주 (7,028,934주) | 2025-12-31 |
| FOXX | Foxx Development Holdings Inc. | 1,768.73 | 707.49만 주 (7,074,907주) | 2026-09-25 |
| BESS | 비머젠 에너지 | 1,611.15 | 709.76만 주 (7,097,573주) | 2026-09-23 |
| GRDX | GridAI Technologies Corp. | 2,973.68 | 713.11만 주 (7,131,123주) | 2026-08-21 |
| PIII | P3 헬스 파트너스 | 2,198.52 | 726.1만 주 (7,260,982주) | 2026-06-30 |
| BODI | 비치바디 컴퍼니 | 2,250.53 | 728.47만 주 (7,284,736주) | 2026-06-30 |
| GOVX | GeoVax Labs, Inc. | 291.47 | 736.92만 주 (7,369,243주) | 2026-06-30 |
| AIMD | Ainos, Inc. | 952.55 | 738.41만 주 (7,384,073주) | 2026-06-30 |
| AVX | AVAX ONE TECHNOLOGY LTD. | 4,379.25 | 739.74만 주 (7,397,383주) | 2026-08-12 |
| CLWT | EURO TECH HOLDINGS CO LTD | 948.67 | 744.7만 주 (7,447,012주) | 2025-12-31 |
| HHS | HARTE HANKS INC | 3,309.68 | 745.42만 주 (7,454,240주) | 2026-07-31 |
| KITT | Nauticus Robotics, Inc. | 240.18 | 747.2만 주 (7,471,960주) | 2026-08-12 |
| TAOX | TAO Synergies Inc. | 3,412.36 | 748.32만 주 (7,483,242주) | 2026-08-13 |
| BIVI | BIOVIE INC. | 1,228.49 | 754.26만 주 (7,542,638주) | 2026-06-30 |
| FOFO | Hang Feng Technology Innovation Co., Ltd. | 1,529.36 | 757.11만 주 (7,571,078주) | 2025-12-31 |
| MBIO | MUSTANG BIO, INC. | 309.68 | 757.75만 주 (7,577,506주) | 2026-08-03 |
| CNSY | CERENOME, INC. | 1,206.77 | 758.96만 주 (7,589,625주) | 2026-06-30 |
| TOPS | 탑 십스 | 410.06 | 761.35만 주 (7,613,488주) | 2026-06-30 |
| BTTC | Black Titan Corp | 612.21 | 772.36만 주 (7,723,620주) | 2025-11-28 |
| RPT | Rithm Property Trust Inc. | 8,433.23 | 777.26만 주 (7,772,564주) | 2026-07-28 |
| KG | Kestrel Group Ltd | 4,170.21 | 782.4만 주 (7,824,030주) | 2026-08-03 |
| NCPL | Netcapital Inc. | 855.42 | 784.79만 주 (7,847,899주) | 2026-03-19 |
| HNNA | HENNESSY ADVISORS INC | 8,173.16 | 790.44만 주 (7,904,410주) | 2026-08-03 |
| EXYN | Exyn Technologies, Inc. | 2,097.12 | 795.4만 주 (7,953,957주) | 2026-08-05 |
| PAVM | PAVmed Inc. | 2,138.91 | 799.59만 주 (7,995,918주) | 2026-06-30 |
| BNKK | BONK, INC. | 1,248.15 | 800.09만 주 (8,000,940주) | 2026-08-14 |
| ZCMD | 중차오 | 758.34 | 801.35만 주 (8,013,476주) | 2026-08-06 |
| CCEL | 크라이오셀 인터내셔널 | 3,128.31 | 806.27만 주 (8,062,650주) | 2026-07-15 |
| PRTS | CarParts.com, Inc. | 6,944.34 | 806.54만 주 (8,065,432주) | 2026-07-30 |
| KFFB | Kentucky First Federal Bancorp | 4,649.86 | 808.67만 주 (8,086,715주) | 2026-09-25 |
| QNTM | Quantum Biopharma Ltd. | 2,499.03 | 808.75만 주 (8,087,521주) | 2026-08-13 |
| ELAB | PMGC Holdings Inc. | 264.73 | 809.58만 주 (8,095,793주) | 2026-08-14 |
| BON | Bon Natural Life Ltd | 716.86 | 812.88만 주 (8,128,810주) | 2026-01-23 |
| OXBR | OXBRIDGE RE HOLDINGS Ltd | 878.97 | 813.86만 주 (8,138,577주) | 2026-08-13 |
| TOMZ | TOMI Environmental Solutions, Inc. | 1,262.10 | 814.26만 주 (8,142,577주) | 2026-06-30 |
| MODD | Modular Medical, Inc. | 2,225.17 | 815.08만 주 (8,150,823주) | 2026-08-14 |
| VIVK | Vivakor, Inc. | 287.42 | 818.36만 주 (8,183,626주) | 2026-08-18 |
| IFBD | Infobird Co., Ltd | 672.77 | 818.86만 주 (8,188,574주) | 2025-12-31 |
| QCLS | Q/C TECHNOLOGIES, INC. | 565.18 | 818.98만 주 (8,189,838주) | 2026-06-30 |
| TLF | TANDY LEATHER FACTORY INC | 2,074.97 | 819.21만 주 (8,192,075주) | 2026-06-30 |
| LPCN | Lipocine Inc. | 1,731.29 | 824.43만 주 (8,244,253주) | 2026-06-30 |
| AIOS | AIOS Tech Inc. | 3,860.22 | 824.93만 주 (8,249,337주) | 2026-07-17 |
| LEDS | SemiLEDs Corp | 1,960.80 | 827.34만 주 (8,273,403주) | 2026-07-07 |
| SCKT | SOCKET MOBILE, INC. | 688.21 | 829.17만 주 (8,291,681주) | 2026-08-10 |
| CRMT | AMERICAS CARMART INC | 892.22 | 833.85만 주 (8,338,478주) | 2026-07-31 |
| FEMY | FEMASYS INC | 1,742.01 | 837.5만 주 (8,375,027주) | 2026-08-13 |
| ZDAI | DirectBooking Technology Co., Ltd. | 1,193.68 | 838.85만 주 (8,388,473주) | 2026-03-31 |
| SCLX | Scilex Holding Co | 2,785.76 | 849.3만 주 (8,493,000주) | 2026-08-10 |
| STI | Solidion Technology Inc. | 4,869.31 | 851.28만 주 (8,512,771주) | 2026-06-30 |
| EDUC | EDUCATIONAL DEVELOPMENT CORP | 1,108.24 | 852.5만 주 (8,524,964주) | 2026-07-05 |
| FIEE | FiEE, Inc. | 3,070.30 | 852.86만 주 (8,528,598주) | 2026-06-30 |
| CLIK | 클릭 홀딩스 | 810.52 | 856.3만 주 (8,563,033주) | 2026-08-25 |
| NHTC | NATURAL HEALTH TRENDS CORP | 857.79 | 857.78만 주 (8,577,848주) | 2026-07-24 |
| XWEL | XWELL, Inc. | 688.00 | 858.93만 주 (8,589,266주) | 2026-08-10 |
| SNWV | SANUWAVE Health, Inc. | 4,473.20 | 860.23만 주 (8,602,309주) | 2026-06-30 |
| LUCY | Innovative Eyewear Inc | 805.71 | 860.92만 주 (8,609,196주) | 2026-08-11 |
| REBN | Reborn Coffee, Inc. | 1,810.23 | 862.01만 주 (8,620,122주) | 2026-09-14 |
| ORIQ | Origin Investment Corp I | 8,978.63 | 862.5만 주 (8,625,000주) | 2026-08-14 |
| BCTX | BriaCell Therapeutics Corp. | 3,497.32 | 869.98만 주 (8,699,787주) | 2026-06-09 |
| DRK | DarkHorse Technologies Inc. | 2,938.32 | 870.48만 주 (8,704,816주) | 2026-08-11 |
| EVGN | Evogene Ltd. | 669.51 | 871.82만 주 (8,718,193주) | 2025-12-31 |
| SNAL | 스네일 | 737.40 | 895.58만 주 (8,955,811주) | 2026-08-10 |
| PMN | ProMIS Neurosciences Inc. | 8,259.25 | 896.77만 주 (8,967,693주) | 2026-08-13 |
| OPTT | 오션 파워 테크놀로지스 | 963.98 | 900.46만 주 (9,004,628주) | 2026-09-11 |
| LSTA | LISATA THERAPEUTICS, INC. | 1,090.32 | 901.09만 주 (9,010,937주) | 2026-08-06 |
| NSRX | 네이저스 파머 | 4,496.95 | 901.54만 주 (9,015,383주) | 2025-12-31 |
| BARK | Bark, Inc. | 7,380.34 | 903.35만 주 (9,033,457주) | 2026-08-03 |
| IPM | INTELLIGENT PROTECTION MANAGEMENT CORP. | 1,608.36 | 903.57만 주 (9,035,729주) | 2026-06-30 |
| ANGH | Anghami Inc | 3,236.14 | 906.48만 주 (9,064,808주) | 2025-12-31 |
| BRID | BRIDGFORD FOODS CORP | 5,046.72 | 907.68만 주 (9,076,832주) | 2026-08-24 |
| ICCC | IMMUCELL CORP /DE/ | 9,054.95 | 908.22만 주 (9,082,197주) | 2026-07-31 |
| USEA | 유나이티드 마리타임 | 2,546.68 | 908.36만 주 (9,083,645주) | 2025-12-31 |
| MIND | MIND TECHNOLOGY, INC | 4,153.70 | 908.91만 주 (9,089,055주) | 2026-09-08 |
| RACC | 리서치 얼라이언스 III | 8,008.25 | 909.85만 주 (9,098,529주) | 2026-06-30 |
| RACD | 리서치 얼라이언스 IV | 9,096.75 | 909.85만 주 (9,098,529주) | 2026-08-19 |
| SKIL | Skillsoft Corp. | 5,241.85 | 910.04만 주 (9,100,444주) | 2026-09-02 |
| NMTC | NEUROONE MEDICAL TECHNOLOGIES Corp | 1,028.95 | 910.58만 주 (9,105,763주) | 2026-08-11 |
| UTSI | UTSTARCOM HOLDINGS CORP. | 2,164.66 | 918.7만 주 (9,186,976주) | 2025-12-31 |
| NRT | NORTH EUROPEAN OIL ROYALTY TRUST | 7,637.38 | 919.06만 주 (9,190,590주) | 2026-07-31 |
| BYFC | BROADWAY FINANCIAL CORP DE | 7,200.38 | 927.85만 주 (9,278,545주) | 2026-06-30 |
| EXOZ | EXOZYMES INC. | 5,123.31 | 928.14만 주 (9,281,359주) | 2026-06-30 |
| ACET | Adicet Bio, Inc. | 5,850.93 | 936.15만 주 (9,361,490주) | 2026-08-03 |
| FTLF | FITLIFE BRANDS, INC. | 8,470.75 | 939.11만 주 (9,391,072주) | 2026-08-12 |
| LONA | LeonaBio, Inc. | 5,417.45 | 942.17만 주 (9,421,663주) | 2026-06-30 |
| RMCF | Rocky Mountain Chocolate Factory, Inc. | 864.86 | 943.96만 주 (9,439,587주) | 2026-05-31 |
| CLRB | Cellectar Biosciences, Inc. | 1,427.27 | 945.21만 주 (9,452,108주) | 2026-08-11 |
| KOSS | KOSS CORP | 3,635.11 | 946.64만 주 (9,466,438주) | 2026-06-30 |
| NTIC | NORTHERN TECHNOLOGIES INTERNATIONAL CORP | 7,411.97 | 949.64만 주 (9,496,439주) | 2026-05-31 |
| FNWB | First Northwest Bancorp | 9,235.78 | 951.16만 주 (9,511,615주) | 2026-07-30 |
| TAOP | Taoping Inc. | 388.03 | 955.28만 주 (9,552,783주) | 2025-12-31 |
| STEM | STEM, INC. | 4,591.96 | 962.67만 주 (9,626,744주) | 2026-08-05 |
| EDSA | Edesa Biotech, Inc. | 5,026.28 | 964.1만 주 (9,641,031주) | 2026-08-13 |
| CTRM | Castor Maritime Inc. | 1,884.16 | 966.24만 주 (9,662,354주) | 2025-12-31 |
| CIIT | Tianci International, Inc. | 223.47 | 967.39만 주 (9,673,907주) | 2026-04-30 |
| NXGL | NEXGEL, INC. | 168.54 | 974.77만 주 (9,747,663주) | 2026-08-14 |
| GMM | Global Mofy AI Ltd | 1,677.84 | 975.1만 주 (9,751,007주) | 2026-09-01 |
| DRIO | DarioHealth Corp. | 5,899.29 | 979.95만 주 (9,799,481주) | 2026-08-11 |
| ASTI | Ascent Solar Technologies, Inc. | 2,405.03 | 981.64만 주 (9,816,431주) | 2026-08-06 |
| PPCB | Propanc Biopharma, Inc. | 311.05 | 983.11만 주 (9,831,116주) | 2026-10-01 |
| INAB | IN8BIO, INC. | 1,370.31 | 985.84만 주 (9,858,383주) | 2026-08-03 |
| MCRB | Seres Therapeutics, Inc. | 2,882.97 | 994.13만 주 (9,941,261주) | 2026-08-03 |
| SCYX | SCYNEXIS INC | 4,815.61 | 994.96만 주 (9,949,609주) | 2026-08-01 |
| MITQ | 무빙 이미지 테크놀로지스 | 583.20 | 995.22만 주 (9,952,223주) | 2026-09-28 |
| SWVL | 스위블 홀딩스 | 7,493.29 | 996.43만 주 (9,964,344주) | 2025-12-31 |
| ATOS | ATOSSA THERAPEUTICS, INC. | 2,444.93 | 997.93만 주 (9,979,298주) | 2026-06-30 |
| WYY | 와이드포인트 | 7,108.76 | 999.83만 주 (9,998,255주) | 2026-08-10 |
| GSUN | 골든 선 헬스 테크놀로지 그룹 | 202.43 | 1,002.89만 주 (10,028,870주) | 2026-01-27 |
| ATRA | Atara Biotherapeutics, Inc. | 9,786.76 | 1,003.77만 주 (10,037,710주) | 2026-08-10 |
| DSS | DSS | 631.67 | 1,004.25만 주 (10,042,518주) | 2026-08-05 |
| CSPI | CSP INC /MA/ | 7,883.03 | 1,008.06만 주 (10,080,645주) | 2026-08-12 |
| TPCS | TECHPRECISION CORP | 5,474.36 | 1,010.03만 주 (10,100,311주) | 2026-08-06 |
| TZOO | TRAVELZOO | 5,590.86 | 1,020.23만 주 (10,202,337주) | 2026-08-07 |
| APT | 알파 프로 테크 | 6,113.51 | 1,020.62만 주 (10,206,218주) | 2026-08-03 |
| PETZ | TDH Holdings, Inc. | 1,342.03 | 1,032.33만 주 (10,323,268주) | 2025-12-31 |
| TACT | TRANSACT TECHNOLOGIES INC | 4,873.16 | 1,032.45만 주 (10,324,471주) | 2026-07-31 |
| CABR | Caring Brands, Inc. | 1,717.50 | 1,036.82만 주 (10,368,226주) | 2026-08-13 |
| CWD | CaliberCos Inc. | 537.72 | 1,038.47만 주 (10,384,653주) | 2026-08-11 |
| TRT | TRIO-TECH INTERNATIONAL | 6,345.05 | 1,038.47만 주 (10,384,698주) | 2026-09-01 |
| DAIO | DATA I/O CORP | 3,045.91 | 1,039.56만 주 (10,395,627주) | 2026-06-30 |
| PXS | Pyxis Tankers Inc. | 7,889.30 | 1,041.89만 주 (10,418,859주) | 2025-12-31 |
| SST | System1, Inc. | 2,055.31 | 1,048.86만 주 (10,488,649주) | 2026-06-30 |
| GTIM | Good Times Restaurants Inc. | 1,573.13 | 1,055.79만 주 (10,557,896주) | 2026-07-31 |
| RMSG | Real Messenger Corp | 319.31 | 1,064.3만 주 (10,642,957주) | 2026-03-31 |
| BGSF | BGSF, INC. | 5,051.55 | 1,067.4만 주 (10,673,981주) | 2026-08-03 |
| GSIW | Garden Stage Ltd | 1,498.96 | 1,071.24만 주 (10,712,399주) | 2026-03-31 |
| PMCB | PharmaCyte Biotech, Inc. | 453.47 | 1,073.56만 주 (10,735,649주) | 2026-07-31 |
| GXAI | GAXOS.AI INC. | 515.15 | 1,074.46만 주 (10,744,634주) | 2026-08-11 |
| CRWS | CROWN CRAFTS INC | 2,657.79 | 1,076.03만 주 (10,760,287주) | 2026-08-05 |
| RFIL | R F INDUSTRIES LTD | 9,394.19 | 1,084.78만 주 (10,847,761주) | 2026-09-14 |
| NEPH | NEPHROS INC | 3,279.75 | 1,086.01만 주 (10,860,120주) | 2026-08-07 |
| BLIV | BeLive Holdings | 2,498.90 | 1,086.48만 주 (10,864,802주) | 2025-12-31 |
| AYTU | AYTU BIOPHARMA, INC | 2,227.67 | 1,086.67만 주 (10,866,708주) | 2026-09-15 |
| HCAI | Huachen AI Parking Management Technology Holding Co., Ltd | 362.57 | 1,091.33만 주 (10,913,276주) | 2026-09-16 |
| IQST | iQSTEL Inc | 1,102.51 | 1,091.59만 주 (10,915,859주) | 2026-08-18 |
| WKHS | Workhorse Group Inc. | 3,213.01 | 1,092.86만 주 (10,928,585주) | 2026-08-10 |
| WSHP | 위샵 홀딩스 | 5,846.85 | 1,096.38만 주 (10,963,783주) | 2026-03-31 |
| POCI | PRECISION OPTICS CORPORATION, INC. | 4,937.76 | 1,097.28만 주 (10,972,792주) | 2026-06-30 |
| ROLR | 하이 롤러 테크놀로지스 | 5,062.45 | 1,102.93만 주 (11,029,313주) | 2026-08-11 |
| GIGM | GIGAMEDIA Ltd | 1,525.20 | 1,105.22만 주 (11,052,235주) | 2026-03-31 |
| FEBO | Fenbo Holdings Ltd | 230.51 | 1,106.25만 주 (11,062,500주) | 2025-12-31 |
| KTCC | KEY TRONIC CORP | 2,456.63 | 1,106.59만 주 (11,065,887주) | 2026-09-21 |
| PPSI | PIONEER POWER SOLUTIONS, INC. | 3,524.03 | 1,109.93만 주 (11,099,266주) | 2026-08-13 |
| MLCI | Mount Logan Capital Inc. | 3,558.03 | 1,118.88만 주 (11,188,768주) | 2026-06-30 |
| LSF | 레어드 슈퍼푸드 | 3,570.54 | 1,119.29만 주 (11,192,884주) | 2026-08-10 |
| YCBD | CBDMD | 457.16 | 1,120.5만 주 (11,205,045주) | 2026-08-13 |
| SEAT | Vivid Seats Inc. | 3,451.05 | 1,124.12만 주 (11,241,195주) | 2026-07-31 |
| MGIH | Millennium Group International Holdings Ltd | 1,642.50 | 1,125만 주 (11,250,000주) | 2025-12-31 |
| VTSI | VirTra, Inc | 3,124.21 | 1,131.96만 주 (11,319,624주) | 2026-06-30 |
| IMA | ImageneBio, Inc. | 5,221.69 | 1,135.15만 주 (11,351,456주) | 2026-07-31 |
| ASPS | ALTISOURCE PORTFOLIO SOLUTIONS S.A. | 6,897.80 | 1,142.02만 주 (11,420,206주) | 2026-07-17 |
| SELF | Global Self Storage, Inc. | 5,596.49 | 1,142.14만 주 (11,421,420주) | 2026-06-30 |
| LOAN | MANHATTAN BRIDGE CAPITAL, INC | 4,410.24 | 1,142.55만 주 (11,425,509주) | 2026-07-23 |
| RYOJ | rYojbaba Co., Ltd. | 3,176.25 | 1,155만 주 (11,550,000주) | 2025-12-31 |
| TXMD | TherapeuticsMD, Inc. | 2,338.03 | 1,157.44만 주 (11,574,362주) | 2026-08-09 |
| AMSS | AMASS BRANDS | 495.89 | 1,160.51만 주 (11,605,081주) | 2026-06-30 |
| PHIO | Phio Pharmaceuticals Corp. | 1,155.22 | 1,161.73만 주 (11,617,250주) | 2026-06-30 |
| SPHL | SPRINGVIEW HOLDINGS LTD | 540.61 | 1,165.22만 주 (11,652,224주) | 2025-12-31 |
| RAIN | 레인 인핸스먼트 테크놀로지스 | 867.77 | 1,170.41만 주 (11,704,051주) | 2026-06-30 |
| PFAI | 피너클 푸드 그룹 | 952.40 | 1,173.66만 주 (11,736,580주) | 2025-12-31 |
| BNGO | Bionano Genomics, Inc. | 1,707.67 | 1,177.7만 주 (11,777,000주) | 2026-08-06 |
| FKWL | FRANKLIN WIRELESS CORP | 2,733.96 | 1,178.43만 주 (11,784,280주) | 2026-06-30 |
| BTCT | BTC Digital Ltd. | 1,901.31 | 1,180.06만 주 (11,800,567주) | 2026-09-18 |
| BIRD | 올버즈 | 2,953.11 | 1,180.92만 주 (11,809,193주) | 2026-06-30 |
| GDTC | CytoMed Therapeutics Ltd | 1,100.22 | 1,182.84만 주 (11,828,435주) | 2025-12-31 |
| SAMG | 실버크레스트 에셋 매니지먼트 그룹 | 8,181.58 | 1,184.78만 주 (11,847,767주) | 2026-06-30 |
| REED | 리즈 | 809.84 | 1,185.71만 주 (11,857,086주) | 2026-08-07 |
| XBP | XBP Global Holdings, Inc. | 4,501.80 | 1,188.13만 주 (11,881,339주) | 2026-08-14 |
| NTWK | NETSOL TECHNOLOGIES INC | 7,374.75 | 1,195.26만 주 (11,952,568주) | 2026-09-21 |
| HXHX | 하오신 홀딩스 | 314.46 | 1,200만 주 (12,000,000주) | 2025-12-31 |
| MHH | 메스테크 디지털 | 8,240.64 | 1,201.26만 주 (12,012,581주) | 2026-07-31 |
| JXG | JX Luxventure Group Inc. | 9,213.76 | 1,205.99만 주 (12,059,877주) | 2026-05-20 |
| SEED | Origin Agritech LTD | 973.30 | 1,214.35만 주 (12,143,526주) | 2026-07-31 |
| NTRB | NutriBand Inc. | 8,120.01 | 1,215.57만 주 (12,155,683주) | 2026-09-04 |
| CETY | Clean Energy Technologies, Inc. | 1,162.35 | 1,216.61만 주 (12,166,106주) | 2026-08-19 |
| ATHR | Aether Holdings, Inc. | 3,817.30 | 1,223.81만 주 (12,238,059주) | 2026-08-13 |
| CNEY | CN ENERGY GROUP. INC. | 391.03 | 1,225.6만 주 (12,255,990주) | 2026-03-31 |
| LNSR | LENSAR, Inc. | 8,231.55 | 1,228.59만 주 (12,285,865주) | 2026-07-31 |
| GROW | U S GLOBAL INVESTORS INC | 2,987.04 | 1,229.82만 주 (12,298,196주) | 2026-06-30 |
| SHFS | SHF Holdings, Inc. | 71.95 | 1,233.3만 주 (12,332,955주) | 2026-08-05 |
| PSHG | Performance Shipping Inc. | 2,113.47 | 1,243.22만 주 (12,432,158주) | 2025-12-31 |
| MLGO | MicroAlgo Inc. | 3,380.92 | 1,243.75만 주 (12,437,461주) | 2026-03-30 |
| IVDA | Iveda Solutions, Inc. | 341.77 | 1,251.9만 주 (12,519,027주) | 2026-06-30 |
| LFVN | Lifevantage Corp | 7,604.00 | 1,252.73만 주 (12,527,348주) | 2026-08-26 |
| IXHL | Incannex Healthcare Inc. | 3,976.65 | 1,254.46만 주 (12,544,627주) | 2026-09-24 |
| NRXS | 뉴어액시스 | 8,514.16 | 1,255.78만 주 (12,557,765주) | 2026-08-06 |
| BUDA | 부다 주스 | 9,423.74 | 1,256.67만 주 (12,566,666주) | 2026-08-14 |
| LOBO | LOBO TECHNOLOGIES LTD. | 565.57 | 1,256.85만 주 (12,568,514주) | 2025-12-31 |
| AEYE | AUDIOEYE INC | 8,698.23 | 1,256.97만 주 (12,569,674주) | 2026-07-30 |
| APRE | Aprea Therapeutics, Inc. | 800.16 | 1,259.11만 주 (12,591,136주) | 2026-08-12 |
| BLIN | Bridgeline Digital, Inc. | 1,124.54 | 1,259.99만 주 (12,599,879주) | 2026-06-30 |
| PLUR | Pluri Inc. | 1,222.13 | 1,261.13만 주 (12,611,335주) | 2026-10-05 |
| LGL | LGL 그룹 | 8,728.27 | 1,261.31만 주 (12,613,149주) | 2026-07-31 |
| JRSH | Jerash Holdings (US), Inc. | 7,683.44 | 1,269.99만 주 (12,699,940주) | 2026-06-30 |
| CULP | CULP INC | 4,648.38 | 1,273.53만 주 (12,735,324주) | 2026-09-09 |
| AIDX | 20/20 Biolabs, Inc. | 450.15 | 1,277.03만 주 (12,770,303주) | 2026-08-14 |
| FSI | 플렉서블 솔루션스 인터내셔널 | 8,084.99 | 1,277.25만 주 (12,772,498주) | 2026-08-14 |
| CLGN | CollPlant Biotechnologies Ltd | 640.99 | 1,280.3만 주 (12,803,006주) | 2025-12-31 |
| ELOG | Eastern International Ltd. | 730.14 | 1,283.2만 주 (12,832,000주) | 2026-03-31 |
| YFOR | YYForce Inc. | 885.62 | 1,283.67만 주 (12,836,734주) | 2026-10-05 |
| CLNN | Clene Inc. | 5,500.82 | 1,284.85만 주 (12,848,513주) | 2026-08-11 |
| UEIC | UNIVERSAL ELECTRONICS INC | 7,151.23 | 1,288.51만 주 (12,885,062주) | 2026-06-30 |
| KIDZ | KIDZ AI Inc. | 200.33 | 1,290.93만 주 (12,909,276주) | 2026-06-30 |
| GEOS | GEOSPACE TECHNOLOGIES CORP | 6,066.80 | 1,293.56만 주 (12,935,603주) | 2026-06-30 |
| PMA | PMA Graphene Technology Group Inc. | 1,595.93 | 1,297.5만 주 (12,975,000주) | 2026-03-31 |
| DLPN | Dolphin Entertainment, Inc. | 1,394.62 | 1,302.56만 주 (13,025,551주) | 2026-08-10 |
| ZDGE | 제지 | 3,738.08 | 1,306.86만 주 (13,068,631주) | 2026-06-10 |
| LNZA | LanzaTech Global, Inc. | 7,670.25 | 1,308.92만 주 (13,089,163주) | 2026-06-30 |
| AIRG | AIRGAIN INC | 5,515.18 | 1,310.02만 주 (13,100,234주) | 2026-07-29 |
| NUR | 누란 와이어리스 | 1,049.92 | 1,319.47만 주 (13,194,700주) | 2026-09-14 |
| FRMM | FORUM MARKETS Inc | 6,401.47 | 1,319.89만 주 (13,198,948주) | 2026-08-14 |
| STAK | STAK Inc. | 1,271.25 | 1,321.03만 주 (13,210,349주) | 2025-12-31 |
| CVU | CPI 에어로스트럭처스 | 6,863.34 | 1,324.97만 주 (13,249,734주) | 2026-08-10 |
| TVRD | Tvardi Therapeutics, Inc. | 1,440.60 | 1,333.89만 주 (13,338,943주) | 2026-08-11 |
| WETH | Wetouch Technology Inc. | 1,304.70 | 1,338.15만 주 (13,381,534주) | 2026-08-14 |
| EPSM | Epsium Enterprise Ltd | 327.68 | 1,343.8만 주 (13,438,034주) | 2025-12-31 |
| LHSW | Lianhe Sowell International Group Ltd | 184.93 | 1,349.37만 주 (13,493,666주) | 2026-09-03 |
| FBGL | FBS Global Ltd | 4,806.00 | 1,350만 주 (13,500,000주) | 2025-12-31 |
| SUNS | Sunrise Realty Trust, Inc. | 8,028.42 | 1,351.59만 주 (13,515,851주) | 2026-08-03 |
| CDTG | CDT Environmental Technology Investment Holdings Ltd | 332.31 | 1,352.5만 주 (13,525,000주) | 2025-12-31 |
| CREX | CREATIVE REALITIES, INC. | 3,368.10 | 1,352.65만 주 (13,526,506주) | 2026-08-11 |
| TREO | 택티컬 리소시스 | 4,042.17 | 1,361.2만 주 (13,612,034주) | 2026-08-12 |
| AUST | 오스틴 골드 | 1,369.44 | 1,369.3만 주 (13,693,001주) | 2026-03-26 |
| LVO | LiveOne, Inc. | 3,839.30 | 1,371.18만 주 (13,711,789주) | 2026-08-12 |
| ACCL | Acco Group Holdings Ltd | 3,599.07 | 1,390만 주 (13,900,000주) | 2025-11-17 |
| CSBR | CHAMPIONS ONCOLOGY, INC. | 6,973.22 | 1,391.86만 주 (13,918,569주) | 2026-09-09 |
| DTSS | 데이터시 | 662.35 | 1,395.08만 주 (13,950,773주) | 2026-06-30 |
| YMAT | J-Star Holding Co., Ltd. | 379.53 | 1,395.33만 주 (13,953,333주) | 2026-04-30 |
| EQS | EQUUS TOTAL RETURN, INC. | 1,138.15 | 1,396.67만 주 (13,966,696주) | 2026-06-30 |
| SDST | Stardust Power Inc. | 325.02 | 1,404.94만 주 (14,049,388주) | 2026-08-12 |
| FATN | Fatpipe Inc/UT | 7,403.32 | 1,412.85만 주 (14,128,468주) | 2026-07-30 |
| RAVE | RAVE RESTAURANT GROUP, INC. | 3,254.46 | 1,421.16만 주 (14,211,566주) | 2026-09-17 |
| XOS | Xos, Inc. | 4,720.34 | 1,421.79만 주 (14,217,852주) | 2026-08-07 |
| PLAG | 플래닛 그린 홀딩스 | 1,024.75 | 1,423.27만 주 (14,232,714주) | 2026-10-02 |
| HUDI | Huadi International Group Co., Ltd. | 999.80 | 1,429.92만 주 (14,299,182주) | 2026-01-13 |
| GYGY | Game Your Game Inc. | 791.13 | 1,439.2만 주 (14,392,000주) | 2026-08-18 |
| CYN | Cyngn Inc. | 938.85 | 1,442.33만 주 (14,423,281주) | 2026-08-13 |
| ICMB | Investcorp Credit Management BDC, Inc. | 1,043.18 | 1,443.25만 주 (14,432,472주) | 2026-08-14 |
| BRN | 반웰 인더스트리스 | 1,382.08 | 1,443.43만 주 (14,434,310주) | 2026-08-10 |
| IPDN | Professional Diversity Network, Inc. | 306.94 | 1,445.03만 주 (14,450,323주) | 2026-08-14 |
| SLXN | Silexion Therapeutics Corp | 290.04 | 1,447.33만 주 (14,473,292주) | 2026-09-30 |
| DLHC | DLH Holdings Corp. | 6,072.57 | 1,449.3만 주 (14,493,035주) | 2026-07-28 |
| RECT | Rectitude Holdings Ltd. | 1,935.34 | 1,450만 주 (14,500,000주) | 2026-03-31 |
| CING | Cingulate Inc. | 7,110.95 | 1,454.18만 주 (14,541,826주) | 2026-08-12 |
| VAI | Valor Energy Inc | 3,435.57 | 1,455.75만 주 (14,557,489주) | 2026-08-10 |
| DOGZ | Dogness (International) Corp | 752.55 | 1,457.07만 주 (14,570,658주) | 2026-06-30 |
| VIDA | VIDA GLOBAL INC | 1,334.84 | 1,458.29만 주 (14,582,932주) | 2026-08-14 |
| QTI | QT IMAGING HOLDINGS, INC. | 3,776.22 | 1,463.65만 주 (14,636,524주) | 2026-08-12 |
| MTNB | 마티나스 바이오파머 홀딩스 | 294.84 | 1,469.28만 주 (14,692,796주) | 2026-08-10 |
| GGR | Gogoro Inc. | 4,712.75 | 1,477.35만 주 (14,773,488주) | 2025-12-31 |
| VIVS | VivoSim Labs, INC. | 334.88 | 1,485.06만 주 (14,850,612주) | 2026-08-10 |
| BFRI | Biofrontera Inc. | 1,384.24 | 1,485.24만 주 (14,852,359주) | 2026-08-11 |
| HCTI | Healthcare Triangle, Inc. | 832.57 | 1,497.43만 주 (14,974,322주) | 2026-08-12 |
| DFLI | Dragonfly Energy Holdings Corp. | 1,018.71 | 1,497.88만 주 (14,978,803주) | 2026-08-11 |
| FRTT | 포트 테크놀로지 | 734.22 | 1,504.26만 주 (15,042,582주) | 2026-08-26 |
| PRSO | Peraso Inc. | 681.82 | 1,506.45만 주 (15,064,476주) | 2026-08-07 |
| NTRP | NextTrip, Inc. | 2,851.27 | 1,508.61만 주 (15,086,101주) | 2026-08-24 |
| ANPA | Rich Sparkle Holdings Ltd | 2,944.84 | 1,510.18만 주 (15,101,755주) | 2026-03-20 |
| CRVO | CervoMed Inc. | 5,049.78 | 1,511.91만 주 (15,119,096주) | 2026-08-06 |
| BCDA | BioCardia, Inc. | 1,604.71 | 1,513.88만 주 (15,138,782주) | 2026-08-11 |
| RMCO | Royalty Management Holding Corp | 3,793.18 | 1,517.27만 주 (15,172,708주) | 2026-08-12 |
| SCOR | COMSCORE, INC. | 6,422.96 | 1,518.43만 주 (15,184,326주) | 2026-06-30 |
| STFS | Star Fashion Culture Holdings Ltd | 5,113.16 | 1,519.38만 주 (15,193,776주) | 2026-09-28 |
| NOMA | Nomadar Corp. | 2,475.93 | 1,528.35만 주 (15,283,529주) | 2026-08-14 |
| DARE | Dare Bioscience, Inc. | 1,638.63 | 1,528.95만 주 (15,289,502주) | 2026-08-12 |
| MBAI | MBody AI Ltd. | 4,955.13 | 1,529.36만 주 (15,293,584주) | 2026-09-21 |
| BOF | BranchOut Food Inc. | 5,804.72 | 1,531.6만 주 (15,316,030주) | 2026-06-30 |
| PLUT | Plutus Financial Group Ltd | 3,530.50 | 1,535만 주 (15,350,000주) | 2025-12-31 |
| TRAW | Traws Pharma, Inc. | 799.15 | 1,536.83만 주 (15,368,277주) | 2026-08-12 |
| PSIG | PS International Group Ltd. | 7,167.46 | 1,537.66만 주 (15,376,572주) | 2026-04-30 |
| INDO | 인도네시아 에너지 | 4,262.14 | 1,538.68만 주 (15,386,840주) | 2026-04-27 |
| BENF | 베네피선트 | 1,928.23 | 1,545.57만 주 (15,455,722주) | 2026-06-30 |
| BMR | Beamr Imaging Ltd. | 2,407.13 | 1,552.99만 주 (15,529,854주) | 2025-12-31 |
| HYPD | HYPERION DEFI, INC. | 5,936.05 | 1,553.94만 주 (15,539,434주) | 2026-08-10 |
| HVT/A | 하버티 퍼니처 A | 3,398.83 | 1,559.36만 주 (15,593,626주) | 2026-08-03 |
| WNW | Meiwu Technology Co Ltd | 6,187.67 | 1,564.34만 주 (15,643,353주) | 2025-12-31 |
| AIFF | FIREFLY NEUROSCIENCE, INC. | 1,961.29 | 1,569.03만 주 (15,690,316주) | 2026-08-04 |
| LINK | INTERLINK ELECTRONICS INC | 8,861.29 | 1,575.34만 주 (15,753,409주) | 2026-08-13 |
| MKTW | 마켓와이즈 | 5,528.17 | 1,577.45만 주 (15,774,485주) | 2026-06-30 |
| DSWL | DESWELL INDUSTRIES INC | 4,860.87 | 1,588.52만 주 (15,885,239주) | 2026-06-30 |
| ALLR | Allarity Therapeutics, Inc. | 1,567.68 | 1,591.07만 주 (15,910,724주) | 2026-06-30 |
| AEC | 앤필드 에너지 | 6,962.55 | 1,594.28만 주 (15,942,823주) | 2025-12-31 |
| TPST | Tempest Therapeutics, Inc. | 1,330.07 | 1,597.94만 주 (15,979,411주) | 2026-08-10 |
| ONEG | OneConstruction Group Ltd | 1,488.32 | 1,600만 주 (16,000,000주) | 2026-03-31 |
| NMAD | NOMAD POWER SOLUTIONS, INC. | 6,995.93 | 1,610.11만 주 (16,101,068주) | 2026-08-10 |
| CLPR | Clipper Realty Inc. | 5,089.64 | 1,615.76만 주 (16,157,566주) | 2026-08-06 |
| SOS | SOS | 431.04 | 1,617.03만 주 (16,170,320주) | 2025-12-31 |
| AIFU | AIFU Inc. | 6,624.99 | 1,617.57만 주 (16,175,748주) | 2026-09-24 |
| EDTK | Skillful Craftsman Education Technology Ltd | 1,624.81 | 1,619.95만 주 (16,199,451주) | 2026-03-31 |
| MGN | Megan Holdings Ltd. | 384.00 | 1,625만 주 (16,250,000주) | 2025-12-31 |
| FMST | Foremost Clean Energy Ltd. | 858.58 | 1,628.06만 주 (16,280,580주) | 2026-03-31 |
| BRFH | BARFRESH FOOD GROUP INC. | 1,314.44 | 1,630.82만 주 (16,308,172주) | 2026-08-11 |
| LICN | 리천 차이나 | 1,475.73 | 1,632.68만 주 (16,326,825주) | 2025-12-31 |
| HKPD | Cellyan Biotechnology Co., Ltd | 113.19 | 1,635만 주 (16,349,986주) | 2026-03-31 |
| DLXY | Delixy Holdings Ltd | 344.35 | 1,635만 주 (16,350,000주) | 2025-12-31 |
| TRSG | 텅그레이 테크놀로지스 | 1,399.65 | 1,635.35만 주 (16,353,485주) | 2025-12-31 |
| INSG | INSEEGO CORP. | 7,766.94 | 1,642.06만 주 (16,420,592주) | 2026-07-29 |
| IPWR | Ideal Power Inc. | 6,491.71 | 1,643.47만 주 (16,434,655주) | 2026-08-11 |
| FTCI | FTC Solar, Inc. | 3,254.72 | 1,646.13만 주 (16,461,251주) | 2026-07-31 |
| SRTS | Sensus Healthcare, Inc. | 4,889.24 | 1,646.21만 주 (16,462,059주) | 2026-06-30 |
| ATGL | Alpha Technology Group Ltd | 7,326.00 | 1,646.25만 주 (16,462,500주) | 2026-03-31 |
| AZIO | AZIO AI HOLDINGS, INC. | 2,030.52 | 1,646.78만 주 (16,467,848주) | 2026-08-12 |
| INUV | 이누보 | 875.75 | 1,648.31만 주 (16,483,079주) | 2026-08-03 |
| INEO | INNEOVA Holdings Ltd | 706.75 | 1,652.72만 주 (16,527,249주) | 2025-12-31 |
| LHAI | Linkhome Holdings Inc. | 1,834.83 | 1,653만 주 (16,530,000주) | 2026-06-30 |
| MRKR | Marker Therapeutics, Inc. | 1,683.98 | 1,667.31만 주 (16,673,127주) | 2026-06-30 |
| AUID | authID Inc. | 647.41 | 1,672.03만 주 (16,720,339주) | 2026-06-30 |
| NEON | Neonode Inc. | 1,495.02 | 1,678.29만 주 (16,782,922주) | 2026-08-10 |
| ODYS | Odysight.ai Inc. | 5,627.94 | 1,680.69만 주 (16,806,905주) | 2026-08-12 |
| RNAZ | Transcode Therapeutics, Inc. | 3,013.66 | 1,693.07만 주 (16,930,739주) | 2026-08-10 |
| MSGY | Masonglory Ltd | 1,061.93 | 1,695.7만 주 (16,957,000주) | 2026-03-31 |
| MOBX | MOBIX LABS, INC | 2,010.63 | 1,697.49만 주 (16,974,878주) | 2026-08-13 |
| ASRV | AMERISERV FINANCIAL INC /PA/ | 7,470.89 | 1,697.93만 주 (16,979,267주) | 2026-08-10 |
| RIME | Algorhythm Holdings, Inc. | 332.39 | 1,699.01만 주 (16,990,135주) | 2026-08-11 |
| LSE | Leishen Energy Holding Co., Ltd. | 1,980.37 | 1,702.5만 주 (17,025,000주) | 2026-01-30 |
| VERU | VERU INC. | 4,211.42 | 1,705.03만 주 (17,050,320주) | 2026-06-30 |
| BCG | Binah Capital Group, Inc. | 1,791.31 | 1,706.01만 주 (17,060,131주) | 2026-06-30 |
| WBX | 월박스 | 6,307.67 | 1,713.37만 주 (17,133,671주) | 2025-12-31 |
| MB | MASTERBEEF GROUP | 6,621.83 | 1,715.5만 주 (17,155,000주) | 2025-12-31 |
| VRCA | Verrica Pharmaceuticals Inc. | 7,232.27 | 1,717.88만 주 (17,178,786주) | 2026-06-30 |
| WPRT | WESTPORT FUEL SYSTEMS INC. | 3,495.21 | 1,737.52만 주 (17,375,213주) | 2025-12-31 |
| IZEA | IZEA Worldwide, Inc. | 4,266.99 | 1,741.63만 주 (17,416,286주) | 2026-08-06 |
| KAZR | 스카이라인 빌더스 그룹 | 3,667.83 | 1,748.15만 주 (17,481,491주) | 2026-03-31 |
| IRIX | IRIDEX CORP | 1,194.41 | 1,756.49만 주 (17,564,912주) | 2026-08-13 |
| CVM | 셀 사이 | 4,819.39 | 1,758.9만 주 (17,588,987주) | 2026-08-10 |
| CYAB | CYABRA, INC. | 344.73 | 1,759.71만 주 (17,597,071주) | 2026-08-12 |
| SCWO | 374Water Inc. | 4,882.07 | 1,771.82만 주 (17,718,161주) | 2026-06-30 |
| GRNQ | Greenpro Capital Corp. | 1,522.73 | 1,812.77만 주 (18,127,663주) | 2026-06-30 |
| TSQ | Townsquare Media, Inc. | 7,680.00 | 1,823.16만 주 (18,231,639주) | 2026-08-03 |
| FMFC | 칸달 엠 벤처 | 234.40 | 1,830만 주 (18,300,000주) | 2026-03-31 |
| WIMI | 와이마이 홀로그램 클라우드 | 1,268.69 | 1,838.51만 주 (18,385,054주) | 2025-12-31 |
| VIP | 벌컨 인프라스트럭처 & 파워 | 5,189.98 | 1,842.99만 주 (18,429,902주) | 2026-06-30 |
| BFRG | BullFrog AI Holdings, Inc. | 1,277.52 | 1,854.17만 주 (18,541,651주) | 2026-08-13 |
| SLNG | Stabilis Solutions, Inc. | 9,930.42 | 1,859.63만 주 (18,596,301주) | 2026-06-30 |
| SWAG | Stran & Company, Inc. | 2,572.26 | 1,863.96만 주 (18,639,589주) | 2026-08-07 |
| BSEM | BioStem Technologies, Inc. | 4,404.70 | 1,867.21만 주 (18,672,125주) | 2026-10-01 |
| SKK | SKK Holdings Ltd | 1,308.28 | 1,875만 주 (18,750,000주) | 2025-12-31 |
| COPR | 아이다호 코퍼 | 6,309.61 | 1,877.86만 주 (18,778,604주) | 2026-08-31 |
| OM | Outset Medical, Inc. | 7,782.04 | 1,879.72만 주 (18,797,164주) | 2026-08-04 |
| JBDI | JBDI Holdings Ltd | 1,879.81 | 1,902.91만 주 (19,029,064주) | 2026-05-31 |
| ROC | Rank One Computing Corp | 7,116.89 | 1,908.01만 주 (19,080,127주) | 2026-06-30 |
| SPRU | SPRUCE POWER HOLDING CORP | 3,099.60 | 1,925.22만 주 (19,252,186주) | 2026-08-10 |
| COCP | Cocrystal Pharma, Inc. | 2,138.22 | 1,926.32만 주 (19,263,200주) | 2026-08-13 |
| KALA | KALA BIO, Inc. | 703.97 | 1,933.98만 주 (19,339,786주) | 2026-06-30 |
| CPSH | CPS TECHNOLOGIES CORP/DE/ | 7,125.05 | 1,938.79만 주 (19,387,942주) | 2026-07-26 |
| ENSC | Ensysce Biosciences, Inc. | 836.25 | 1,945.68만 주 (19,456,794주) | 2026-08-12 |
| MBRX | Moleculin Biotech, Inc. | 908.19 | 1,947.74만 주 (19,477,380주) | 2026-08-06 |
| DCX | Digital Currency X Technology Inc. | 775.94 | 1,956.08만 주 (19,560,821주) | 2025-12-31 |
| SAGT | SAGTEC GLOBAL Ltd | 1,301.30 | 1,965만 주 (19,650,000주) | 2025-12-31 |
| PRZO | ParaZero Technologies Ltd. | 1,840.15 | 1,966.6만 주 (19,666,030주) | 2025-12-31 |
| CATO | 케이토 | 4,337.44 | 1,991.19만 주 (19,911,949주) | 2026-08-01 |
| CHGA | Change Agents Corporation. | 265.49 | 1,994.68만 주 (19,946,803주) | 2026-08-10 |
| WKSP | Worksport Ltd | 589.60 | 1,999.37만 주 (19,993,672주) | 2026-10-02 |
| SOWG | Sow Good Inc. | 4,723.48 | 2,009.99만 주 (20,099,893주) | 2026-08-19 |
| VVOS | Vivos Therapeutics, Inc. | 516.58 | 2,011.8만 주 (20,118,023주) | 2026-08-13 |
| DKI | 다크아이리스 | 226.81 | 2,012.5만 주 (20,125,000주) | 2026-01-30 |
| JAGU | JAGUAR URANIUM CORPORATION | 2,342.48 | 2,019.38만 주 (20,193,777주) | 2026-08-12 |
| MWYN | Marwynn Holdings, Inc. | 2,968.64 | 2,019.48만 주 (20,194,804주) | 2026-07-29 |
| MTEN | Mingteng International Corp Inc. | 732.39 | 2,025.51만 주 (20,255,054주) | 2025-12-31 |
| SRXH | SRX 헬스 솔루션스 | 2,913.88 | 2,026.54만 주 (20,265,391주) | 2026-08-13 |
| IDN | Intellicheck, Inc. | 4,681.61 | 2,026.67만 주 (20,266,743주) | 2026-08-13 |
| SFHG | SAMFINE CREATION HOLDINGS GROUP Ltd | 479.12 | 2,030만 주 (20,300,000주) | 2025-12-31 |
| RCON | Recon Technology, Ltd | 116.55 | 2,035.32만 주 (20,353,154주) | 2026-06-30 |
| SPAI | Safe Pro Group Inc. | 8,348.77 | 2,036.29만 주 (20,362,862주) | 2026-06-30 |
| MNDO | MIND CTI LTD | 1,996.53 | 2,037.28만 주 (20,372,828주) | 2025-12-31 |
| AAME | ATLANTIC AMERICAN CORP | 2,590.44 | 2,039.72만 주 (20,397,228주) | 2025-10-31 |
| PHUN | Phunware, Inc. | 4,174.39 | 2,046.27만 주 (20,462,675주) | 2026-08-05 |
| CAPS | Capstone Holding Corp. | 388.27 | 2,057.86만 주 (20,578,551주) | 2026-08-10 |
| APWC | ASIA PACIFIC WIRE & CABLE CORP LTD | 2,680.31 | 2,061.62만 주 (20,616,227주) | 2025-12-31 |
| NA | 나노 랩스 | 4,155.06 | 2,063.79만 주 (20,637,924주) | 2025-12-31 |
| GRCE | Grace Therapeutics, Inc. | 4,343.91 | 2,103.59만 주 (21,035,930주) | 2026-08-11 |
| MSN | 에머슨 라디오 | 826.98 | 2,104.27만 주 (21,042,652주) | 2026-08-14 |
| QRHC | Quest Resource Holding Corp | 2,868.63 | 2,109.29만 주 (21,092,856주) | 2026-08-03 |
| KMRK | K-TECH SOLUTIONS CO LTD | 1,859.20 | 2,110만 주 (21,100,000주) | 2026-03-31 |
| BRLS | Borealis Foods Inc. | 2,639.99 | 2,146.33만 주 (21,463,306주) | 2025-12-31 |
| MGRX | MANGOCEUTICALS, INC. | 970.53 | 2,156.74만 주 (21,567,422주) | 2026-08-13 |
| GLBS | GLOBUS MARITIME LTD | 7,014.25 | 2,158.23만 주 (21,582,301주) | 2025-12-31 |
| FLUX | Flux Power Holdings, Inc. | 1,065.73 | 2,162.16만 주 (21,621,642주) | 2026-08-14 |
| PETS | PETMED EXPRESS INC | 2,839.94 | 2,167.89만 주 (21,678,914주) | 2026-08-07 |
| SNGX | SOLIGENIX, INC. | 779.20 | 2,176.55만 주 (21,765,479주) | 2026-07-31 |
| AWRE | AWARE INC /MA/ | 2,333.95 | 2,181.26만 주 (21,812,637주) | 2026-07-27 |
| AGRZ | Agroz Inc. | 358.70 | 2,185.35만 주 (21,853,485주) | 2025-12-31 |
| CCHH | CCH 홀딩스 | 1,823.13 | 2,195만 주 (21,950,000주) | 2025-12-31 |
| MNTS | Momentus Inc. | 7,906.82 | 2,196.34만 주 (21,963,401주) | 2026-08-10 |
| WETO | Wetour Robotics Ltd | 109.94 | 2,200만 주 (22,000,000주) | 2025-12-31 |
| NAII | NATURAL ALTERNATIVES INTERNATIONAL INC | 834.61 | 2,211.3만 주 (22,113,000주) | 2026-09-28 |
| NPT | Texxon Holding Ltd | 5,169.11 | 2,218.5만 주 (22,185,000주) | 2026-04-23 |
| VBIO | Valion Bio, Inc. | 211.25 | 2,218.97만 주 (22,189,739주) | 2026-08-13 |
| ADGM | Adagio Medical Holdings, Inc. | 306.50 | 2,221.05만 주 (22,210,459주) | 2026-06-30 |
| PLCE | Childrens Place, Inc. | 4,247.29 | 2,223.71만 주 (22,237,067주) | 2026-09-08 |
| OMH | Ohmyhome Ltd | 483.70 | 2,225.96만 주 (22,259,591주) | 2025-12-31 |
| HOLO | MicroCloud Hologram Inc. | 3,331.84 | 2,251.24만 주 (22,512,360주) | 2025-12-31 |
| AMCI | AMC Robotics Corp | 6,867.82 | 2,260.04만 주 (22,600,363주) | 2026-06-30 |
| BEEM | Beam Global | 2,512.30 | 2,263.33만 주 (22,633,315주) | 2026-08-17 |
| BHST | BIOHARVEST SCIENCES INC. | 2,564.50 | 2,266.68만 주 (22,666,842주) | 2025-12-31 |
| AFCG | Advanced Flower Capital Inc. | 7,369.77 | 2,267.19만 주 (22,671,919주) | 2026-08-07 |
| KPTI | Karyopharm Therapeutics Inc. | 1,474.07 | 2,268.15만 주 (22,681,460주) | 2026-08-06 |
| LUD | 루다 테크놀로지 그룹 | 9,643.25 | 2,269만 주 (22,690,000주) | 2025-12-31 |
| BYRN | Byrna Technologies Inc. | 8,636.37 | 2,269.34만 주 (22,693,356주) | 2026-05-31 |
| CITR | CitroTech Inc. | 6,497.40 | 2,271.82만 주 (22,718,180주) | 2026-09-24 |
| BOLD | Boundless Bio, Inc. | 5,846.23 | 2,274.8만 주 (22,747,985주) | 2026-08-05 |
| SEGG | Sports Entertainment Gaming Global Corp | 788.80 | 2,281.64만 주 (22,816,406주) | 2026-07-07 |
| NTIP | 네트워크 1 테크놀로지스 | 3,726.70 | 2,286.32만 주 (22,863,181주) | 2026-08-03 |
| RDI | 레딩 인터내셔널 | 3,881.34 | 2,289.01만 주 (22,890,127주) | 2026-06-30 |
| RDIB | 레딩 인터내셔널 B | 2,201.57 | 2,289.01만 주 (22,890,127주) | 2026-06-30 |
| SYPR | SYPRIS SOLUTIONS INC | 4,467.12 | 2,302.64만 주 (23,026,433주) | 2026-08-05 |
| SNT | Senstar Technologies Corp | 3,593.08 | 2,333.17만 주 (23,331,653주) | 2025-12-31 |
| LOCL | Local Bounti Corporation/DE | 2,525.20 | 2,338.01만 주 (23,380,119주) | 2026-08-07 |
| KXIN | Kaixin Holdings | 6,025.15 | 2,344.98만 주 (23,449,793주) | 2025-12-31 |
| TMDE | TMD 에너지 | 1,556.00 | 2,356.5만 주 (23,565,000주) | 2026-08-28 |
| LGPS | 로그프로스타일 | 1,738.23 | 2,361.09만 주 (23,610,870주) | 2026-07-13 |
| KSCP | Knightscope, Inc. | 1,619.68 | 2,361.84만 주 (23,618,357주) | 2026-06-30 |
| KAPA | 카이로스 파머 | 389.32 | 2,369.77만 주 (23,697,683주) | 2026-08-12 |
| CNVS | Cineverse Corp. | 4,587.88 | 2,377.14만 주 (23,771,387주) | 2026-08-07 |
| MVIS | MICROVISION, INC. | 4,833.05 | 2,378.84만 주 (23,788,425주) | 2026-08-03 |
| OFAL | OFA Group | 296.86 | 2,379.37만 주 (23,793,676주) | 2026-06-30 |
| CINT | CI&T Inc | 5,491.52 | 2,380.28만 주 (23,802,836주) | 2025-12-31 |
| KLRS | Kalaris Therapeutics, Inc. | 6,332.13 | 2,380.5만 주 (23,804,981주) | 2026-06-30 |
| ORIO | Orion Digital Corp. | 2,473.22 | 2,394.36만 주 (23,943,550주) | 2025-12-31 |
| ANTA | 앤트알파 플랫폼 홀딩 | 6,089.78 | 2,398.03만 주 (23,980,257주) | 2025-12-31 |
| ACTU | ACTUATE THERAPEUTICS, INC. | 1,948.99 | 2,401.42만 주 (24,014,202주) | 2026-06-30 |
| OLB | OLB GROUP, INC. | 985.35 | 2,402.03만 주 (24,020,313주) | 2026-08-14 |
| ZTG | Zenta Group Co Ltd | 425.95 | 2,408.72만 주 (24,087,179주) | 2026-09-22 |
| CRE | 크리에이트 엔터프라이즈 | 426.14 | 2,416.75만 주 (24,167,500주) | 2025-12-31 |
| INVE | INVE Technologies, Inc. | 5,865.06 | 2,423.58만 주 (24,235,753주) | 2026-08-04 |
| DOMH | Dominari Holdings Inc. | 4,897.21 | 2,424.36만 주 (24,243,646주) | 2026-06-30 |
| GFAI | Guardforce AI Co., Ltd. | 785.46 | 2,435.35만 주 (24,353,539주) | 2025-12-31 |
| INTZ | INTRUSION INC | 1,740.24 | 2,450.7만 주 (24,506,953주) | 2026-06-30 |
| TOPP | 탑포인트 홀딩스 | 275.65 | 2,470만 주 (24,700,000주) | 2026-08-11 |
| SORA | AsiaStrategy | 5,121.98 | 2,486.4만 주 (24,864,000주) | 2025-12-31 |
| RKTO | Rocket One Inc. | 1,746.32 | 2,489.76만 주 (24,897,581주) | 2026-08-14 |
| GRAN | 그란데 그룹 | 2,098.43 | 2,490.63만 주 (24,906,250주) | 2026-03-31 |
| BMHL | Bluemount Holdings Ltd | 6,460.91 | 2,500만 주 (25,000,000주) | 2026-03-31 |
| DDC | DDC 엔터프라이즈 | 1,165.25 | 2,503.16만 주 (25,031,620주) | 2025-12-31 |
| NXB | 넥스트보트 | 4,978.29 | 2,514.29만 주 (25,142,895주) | 2026-08-13 |
| PAPL | 파인애플 파이낸셜 | 92.12 | 2,527.12만 주 (25,271,197주) | 2026-07-20 |
| TGHL | GROWHUB LTD. (THE) | 1,159.58 | 2,529.98만 주 (25,299,810주) | 2025-12-31 |
| SER | 세리나 테라퓨틱스 | 5,181.70 | 2,540.05만 주 (25,400,473주) | 2026-08-10 |
| MIMI | Mint Inc Ltd | 1,196.73 | 2,541.25만 주 (25,412,500주) | 2026-03-31 |
| GAIA | 가이아 | 2,823.64 | 2,542.58만 주 (25,425,793주) | 2026-08-06 |
| BRTX | BioRestorative Therapies, Inc. | 313.52 | 2,547.82만 주 (25,478,170주) | 2026-05-14 |
| TRBG | 터보젠 | 9,098.61 | 2,551.73만 주 (25,517,311주) | 2026-09-24 |
| BRAG | Bragg Gaming Group Inc. | 3,632.24 | 2,555.33만 주 (25,553,293주) | 2025-12-31 |
| CYCU | Cycurion, Inc. | 1,056.22 | 2,584.03만 주 (25,840,335주) | 2026-08-10 |
| CHAI | Core AI Holdings, Inc. | 687.28 | 2,586.68만 주 (25,866,846주) | 2026-08-10 |
| NTHI | NEONC TECHNOLOGIES HOLDINGS, INC. | 8,612.81 | 2,593.64만 주 (25,936,365주) | 2026-08-10 |
| ONEN | ONE NUCLEAR ENERGY INC | 3,957.69 | 2,602.33만 주 (26,023,333주) | 2026-06-30 |
| ELTX | Elicio Therapeutics, Inc. | 4,941.00 | 2,628.19만 주 (26,281,882주) | 2026-08-11 |
| BCHT | BIRCHTECH CORP | 3,919.59 | 2,630.6만 주 (26,305,966주) | 2026-08-13 |
| VCIG | VCI Global Ltd | 178.58 | 2,631.04만 주 (26,310,352주) | 2025-12-31 |
| GTEC | Greenland Technologies Holding Corp. | 1,604.82 | 2,654.42만 주 (26,544,222주) | 2026-06-30 |
| CVRX | CVRx, Inc. | 4,315.94 | 2,664.16만 주 (26,641,597주) | 2026-06-30 |
| ABVC | ABVC BIOPHARMA, INC. | 2,589.37 | 2,665.44만 주 (26,654,365주) | 2026-08-10 |
| HLSQ | 테세라 디펜스 앤드 홈랜드 시큐리티 | 88.83 | 2,672.39만 주 (26,723,870주) | 2026-08-18 |
| CIGL | 콩코드 인터내셔널 그룹 | 7,988.74 | 2,698.55만 주 (26,985,468주) | 2025-12-31 |
| CTXR | Citius Pharmaceuticals, Inc. | 1,319.65 | 2,745.26만 주 (27,452,570주) | 2026-08-13 |
| BANL | CBL International Ltd | 487.39 | 2,750.03만 주 (27,500,327주) | 2025-12-31 |
| SMJF | SMJ 인터내셔널 | 2,584.19 | 2,770.5만 주 (27,705,000주) | 2026-07-28 |
| INMB | Inmune Bio, Inc. | 5,189.96 | 2,775.38만 주 (27,753,789주) | 2026-08-06 |
| YSXT | YSX 테크 | 3,284.47 | 2,788.25만 주 (27,882,500주) | 2026-03-31 |
| EGG | 에니그매틱 | 5,815.09 | 2,800.52만 주 (28,005,200주) | 2026-03-31 |
| EMPD | Empery Digital Inc. | 8,954.92 | 2,811.01만 주 (28,110,111주) | 2026-06-30 |
| CNTY | CENTURY CASINOS INC /CO/ | 2,870.05 | 2,813.77만 주 (28,137,692주) | 2026-08-04 |
| SMTK | SmartKem, Inc. | 120.15 | 2,826.37만 주 (28,263,733주) | 2026-08-12 |
| USIO | Usio, Inc. | 8,064.20 | 2,849.54만 주 (28,495,414주) | 2026-08-10 |
| AVD | AMERICAN VANGUARD CORP | 5,044.60 | 2,853.96만 주 (28,539,562주) | 2026-02-20 |
| SEV | Aptera Motors Corp | 4,740.98 | 2,856.01만 주 (28,560,115주) | 2026-08-06 |
| BIOT | 인스팅트 바이오테크니컬 홀딩스 | 1,074.03 | 2,879.45만 주 (28,794,472주) | 2026-07-23 |
| VWAV | VisionWave Holdings, Inc. | 1,209.60 | 2,884.21만 주 (28,842,069주) | 2026-08-17 |
| NIXX | Nixxy, Inc. | 902.24 | 2,890.88만 주 (28,908,839주) | 2026-06-30 |
| FUSE | Fusemachines Inc. | 1,298.54 | 2,898.53만 주 (28,985,302주) | 2026-06-30 |
| DGNX | Diginex Ltd | 3,757.79 | 2,913.01만 주 (29,130,130주) | 2026-03-31 |
| TLIH | Ten-League International Holdings Ltd | 1,690.75 | 2,940.43만 주 (29,404,342주) | 2025-12-31 |
| PEW | GrabAGun Digital Holdings Inc. | 5,814.15 | 2,951.34만 주 (29,513,438주) | 2026-08-11 |
| AHMA | 앰비션스 엔터프라이즈 매니지먼트 | 1,414.49 | 2,972.5만 주 (29,725,000주) | 2025-12-31 |
| CLPS | CLPS Inc | 2,962.45 | 2,984.18만 주 (29,841,828주) | 2025-12-31 |
| RVP | 리트랙터블 테크놀로지스 | 2,068.36 | 2,993.72만 주 (29,937,159주) | 2026-08-01 |
| CMTL | COMTECH TELECOMMUNICATIONS CORP /DE/ | 3,745.18 | 2,996.14만 주 (29,961,431주) | 2026-06-11 |
| ATLX | Atlas Lithium Corp | 7,494.85 | 3,009.98만 주 (30,099,805주) | 2026-08-10 |
| TGEN | 티코젠 | 8,090.33 | 3,018.78만 주 (30,187,822주) | 2026-08-13 |
| EXOD | 엑소더스 무브먼트 | 7,556.36 | 3,020.33만 주 (30,203,258주) | 2026-08-03 |
| PODC | PodcastOne, Inc. | 6,716.10 | 3,025.27만 주 (30,252,696주) | 2026-08-12 |
| OPAL | OPAL Fuels Inc. | 5,422.09 | 3,035.75만 주 (30,357,544주) | 2026-06-30 |
| LITS | Lite Strategy, Inc. | 4,287.43 | 3,040.73만 주 (30,407,268주) | 2026-09-22 |
| KNRX | 크노렉스 | 598.44 | 3,042.31만 주 (30,423,113주) | 2026-09-15 |
| AIM | 에임 이뮤노테크 | 715.01 | 3,044.21만 주 (30,442,139주) | 2026-08-07 |
| MSS | Maison Solutions Inc. | 140.22 | 3,045.15만 주 (30,451,517주) | 2026-03-17 |
| XBIT | XBiotech Inc. | 6,585.34 | 3,048.77만 주 (30,487,731주) | 2026-06-30 |
| BRIA | 브릴리아 | 3,500.00 | 3,062.5만 주 (30,625,000주) | 2026-03-31 |
| VNTG | 밴티지 | 692.21 | 3,098.31만 주 (30,983,121주) | 2026-03-31 |
| DWSN | DAWSON GEOPHYSICAL CO | 8,229.73 | 3,105.56만 주 (31,055,618주) | 2026-06-30 |
| GEG | Great Elm Group, Inc. | 6,716.50 | 3,109.49만 주 (31,094,890주) | 2026-08-20 |
| SNTI | Senti Biosciences Holdings, Inc. | 1,006.00 | 3,114.48만 주 (31,144,754주) | 2026-06-30 |
| FTEK | FUEL TECH, INC. | 5,213.21 | 3,121.68만 주 (31,216,789주) | 2026-06-30 |
| CURX | Curanex Pharmaceuticals Inc | 782.55 | 3,136.48만 주 (31,364,812주) | 2026-08-14 |
| ATNM | 악티늄 파머슈티컬스 | 3,490.00 | 3,144.14만 주 (31,441,436주) | 2026-08-06 |
| POAS | 파오스 테크놀로지 홀딩스 | 254.60 | 3,157.2만 주 (31,572,001주) | 2026-04-30 |
| FLNT | Fluent, Inc. | 8,439.10 | 3,160.71만 주 (31,607,086주) | 2026-08-10 |
| LPA | 로지스틱 프라퍼티스 오브 아메리카 | 9,668.07 | 3,161.78만 주 (31,617,815주) | 2026-03-17 |
| WATR | 에어 워터 벤처스 | 5,869.12 | 3,163.95만 주 (31,639,454주) | 2026-08-14 |
| STKS | ONE Group Hospitality, Inc. | 4,911.80 | 3,168.9만 주 (31,689,024주) | 2026-07-31 |
| LGVN | 롱에버론 | 715.18 | 3,188.2만 주 (31,881,979주) | 2026-06-30 |
| EHTH | eHealth, Inc. | 2,432.24 | 3,203.27만 주 (32,032,654주) | 2026-07-31 |
| MDAI | Spectral AI, Inc. | 5,342.69 | 3,218.49만 주 (32,184,928주) | 2026-06-30 |
| FTFT | Future FinTech Group Inc. | 2,742.31 | 3,224.64만 주 (32,246,443주) | 2026-06-30 |
| CELU | Celularity Inc | 5,127.07 | 3,244.98만 주 (32,449,767주) | 2026-09-24 |
| UFG | 유니 퓨얼스 홀딩스 | 382.39 | 3,246.5만 주 (32,465,000주) | 2025-12-31 |
| NRSN | NeuroSense Therapeutics Ltd. | 772.04 | 3,255.72만 주 (32,557,174주) | 2025-12-31 |
| BLNE | Beeline Holdings, Inc. | 2,713.10 | 3,292.81만 주 (32,928,148주) | 2026-08-14 |
| LIQT | LIQTECH INTERNATIONAL INC | 1,620.70 | 3,294.78만 주 (32,947,841주) | 2026-06-30 |
| GENK | 젠 레스토랑 그룹 | 1,145.96 | 3,296.46만 주 (32,964,618주) | 2026-06-30 |
| FGL | Founder Group Ltd | 31.61 | 3,303.37만 주 (33,033,700주) | 2025-12-31 |
| THCH | TH International Ltd | 3,908.45 | 3,324.36만 주 (33,243,582주) | 2025-12-31 |
| JSPR | Jasper Therapeutics, Inc. | 1,863.71 | 3,327.46만 주 (33,274,561주) | 2026-08-10 |
| FBIO | Fortress Biotech, Inc. | 6,836.96 | 3,335.1만 주 (33,350,993주) | 2026-08-10 |
| BAOS | Baosheng Media Group Holdings Ltd | 802.88 | 3,336.98만 주 (33,369,815주) | 2026-08-24 |
| KTTA | Pasithea Therapeutics Corp. | 1,493.63 | 3,341.44만 주 (33,414,448주) | 2026-06-30 |
| RSSS | Research Solutions, Inc. | 6,887.59 | 3,376.27만 주 (33,762,669주) | 2026-06-30 |
| RENT | Rent the Runway, Inc. | 5,572.73 | 3,377.41만 주 (33,774,121주) | 2026-09-25 |
| VTIX | 버추익스 홀딩스 | 3,566.59 | 3,397.13만 주 (33,971,349주) | 2026-06-30 |
| DWTX | Dogwood Therapeutics, Inc. | 5,166.88 | 3,399.26만 주 (33,992,553주) | 2026-08-13 |
| CALC | CalciMedica, Inc. | 1,017.42 | 3,414.15만 주 (34,141,460주) | 2026-08-05 |
| FTHM | Fathom Holdings Inc. | 764.19 | 3,420.72만 주 (34,207,238주) | 2026-08-12 |
| QNME | Quanome Technologies, Inc. | 1,797.46 | 3,442.76만 주 (34,427,559주) | 2026-06-30 |
| AISP | Airship AI Holdings, Inc. | 7,266.76 | 3,443.96만 주 (34,439,562주) | 2026-06-30 |
| HGBL | Heritage Global Inc. | 4,468.48 | 3,463.94만 주 (34,639,445주) | 2026-08-01 |
| BGL | 블루 골드 | 824.03 | 3,467.75만 주 (34,677,492주) | 2025-12-31 |
| KELYB | 켈리 서비시스 B | 7,383.13 | 3,473.19만 주 (34,731,943주) | 2026-07-27 |
| REFR | RESEARCH FRONTIERS INC | 2,498.28 | 3,486.78만 주 (34,867,786주) | 2026-08-06 |
| GRSD | GRANDSTAND Ltd | 5,299.68 | 3,509.72만 주 (35,097,190주) | 2025-12-31 |
| HOUR | Hour Loop, Inc | 6,159.97 | 3,519.98만 주 (35,199,820주) | 2026-08-11 |
| DTI | Drilling Tools International Corp | 8,503.02 | 3,528.22만 주 (35,282,224주) | 2026-08-04 |
| SKYE | Skye Bioscience, Inc. | 717.28 | 3,542.14만 주 (35,421,413주) | 2026-08-11 |
| GIFT | GIFTIFY, INC. | 2,196.36 | 3,542.52만 주 (35,425,176주) | 2026-07-31 |
| CHOW | 초우초우 클라우드 인터내셔널 홀딩스 | 2,019.03 | 3,549만 주 (35,490,000주) | 2025-12-31 |
| RYET | Ruanyun Edai Technology Inc. | 3,637.41 | 3,555만 주 (35,550,004주) | 2026-03-31 |
| NEXM | NexMetals Mining Corp. | 6,594.92 | 3,564.82만 주 (35,648,164주) | 2026-08-17 |
| FNUC | Frontier Nuclear & Minerals Inc. | 4,191.27 | 3,589.9만 주 (35,899,046주) | 2026-07-16 |
| BTMD | 바이오티 | 3,269.25 | 3,592.75만 주 (35,927,468주) | 2026-06-30 |
| HUBC | Hub Cyber Security Ltd. | 188.56 | 3,624.14만 주 (36,241,405주) | 2025-12-31 |
| LNAI | Lunai Bioworks Inc. | 512.33 | 3,627.11만 주 (36,271,119주) | 2026-05-15 |
| DYAI | DYADIC INTERNATIONAL INC | 1,816.09 | 3,643.87만 주 (36,438,703주) | 2026-08-11 |
| FLL | FULL HOUSE RESORTS INC | 4,983.65 | 3,664.45만 주 (36,644,480주) | 2026-08-03 |
| TDIC | Dreamland Ltd | 664.09 | 3,700만 주 (37,000,000주) | 2026-03-31 |
| TENX | TENAX THERAPEUTICS, INC. | 7,222.81 | 3,742.39만 주 (37,423,917주) | 2026-07-28 |
| HPAI | 헬포트 AI | 1,135.05 | 3,743.1만 주 (37,430,968주) | 2025-12-31 |
| MGX | Metagenomi Therapeutics, Inc. | 3,891.04 | 3,777.71만 주 (37,777,105주) | 2026-06-30 |
| SNSC | 선스카우트 홀딩 | 2,540.00 | 3,810만 주 (38,100,000주) | 2026-08-13 |
| PMEC | Primech Holdings Ltd | 2,104.92 | 3,841.8만 주 (38,417,987주) | 2026-03-31 |
| XTIA | XTI Aerospace, Inc. | 2,784.64 | 3,847.78만 주 (38,477,789주) | 2026-05-14 |
| DUO | 팡둬둬 네트워크 그룹 | 2,312.14 | 3,854.84만 주 (38,548,413주) | 2026-03-31 |
| EPOW | E-Power Inc. | 745.15 | 3,872.93만 주 (38,729,250주) | 2025-12-31 |
| AEI | Alset Inc. | 2,660.08 | 3,889.58만 주 (38,895,830주) | 2026-08-14 |
| CHSN | 샹송 인터내셔널 홀딩 | 248.42 | 3,897.88만 주 (38,978,780주) | 2025-12-31 |
| SPWH | SPORTSMAN'S WAREHOUSE HOLDINGS, INC. | 4,462.13 | 3,914.15만 주 (39,141,465주) | 2026-09-01 |
| GOAI | Eva Live Inc | 7,198.95 | 3,925.22만 주 (39,252,186주) | 2026-06-30 |
| SERA | SERA PROGNOSTICS, INC. | 7,888.75 | 3,944.95만 주 (39,449,466주) | 2026-06-30 |
| MYO | 마이모 | 6,376.87 | 3,960.79만 주 (39,607,854주) | 2026-07-31 |
| GLIBA | GCI 리버티 A | 8,634.47 | 3,990.5만 주 (39,904,994주) | 2026-06-30 |
| DTCX | Datacentrex, Inc. | 7,306.14 | 4,014.36만 주 (40,143,626주) | 2026-08-12 |
| BDMD | Baird Medical Investment Holdings Ltd | 3,292.71 | 4,097.94만 주 (40,979,382주) | 2025-12-31 |
| SCNX | Scienture Holdings, Inc. | 617.61 | 4,106.41만 주 (41,064,146주) | 2026-06-30 |
| SIEB | SIEBERT FINANCIAL CORP | 9,124.40 | 4,110.09만 주 (41,100,936주) | 2026-06-30 |
| MAMO | Massimo Group | 3,924.66 | 4,164.1만 주 (41,640,950주) | 2026-06-30 |
| MIRA | MIRA PHARMACEUTICALS, INC. | 2,991.13 | 4,202.21만 주 (42,022,087주) | 2026-08-10 |
| FAMI | Farmmi, Inc. | 452.95 | 4,242.62만 주 (42,426,176주) | 2026-08-16 |
| SJ | Scienjoy Holding Corp | 3,932.02 | 4,246.28만 주 (42,462,768주) | 2025-12-31 |
| CCLD | CareCloud, Inc. | 8,796.24 | 4,249.39만 주 (42,493,859주) | 2026-06-30 |
| ANVS | Annovis Bio, Inc. | 5,036.13 | 4,260.62만 주 (42,606,152주) | 2026-08-14 |
| GROV | Grove Collaborative Holdings, Inc. | 4,398.20 | 4,270.1만 주 (42,701,046주) | 2026-07-31 |
| MGLD | 더 메리골드 컴퍼니스 | 8,542.44 | 4,271.23만 주 (42,712,250주) | 2026-06-30 |
| ACRV | Acrivon Therapeutics, Inc. | 7,970.73 | 4,285.34만 주 (42,853,362주) | 2026-08-07 |
| LUNG | Pulmonx Corp | 7,644.80 | 4,294.83만 주 (42,948,269주) | 2026-06-30 |
| SKYA | SkyAI, Inc. | 8,130.53 | 4,298.25만 주 (42,982,506주) | 2026-06-30 |
| SLGB | Smart Logistics Global Ltd | 1,211.74 | 4,300만 주 (43,000,000주) | 2025-12-31 |
| CPHI | 차이나 파머 홀딩스 | 2,758.14 | 4,302.2만 주 (43,022,002주) | 2026-08-11 |
| ESLA | Estrella Immunopharma, Inc. | 1,866.06 | 4,349.79만 주 (43,497,864주) | 2026-08-11 |
| GANX | Gain Therapeutics, Inc. | 7,288.48 | 4,364.36만 주 (43,643,619주) | 2026-07-31 |
| ARQ | Arq, Inc. | 8,952.04 | 4,366.85만 주 (43,668,483주) | 2026-08-06 |
| AVAT | 아발란체 트레저리 | 7,848.36 | 4,372.04만 주 (43,720,444주) | 2026-06-30 |
| MNY | 머니히어로 | 2,049.26 | 4,382.71만 주 (43,827,090주) | 2025-12-31 |
| AGIG | 어번디아 글로벌 임팩트 | 4,199.58 | 4,415.03만 주 (44,150,321주) | 2026-08-05 |
| ELUT | 일루시아 | 3,440.83 | 4,428.92만 주 (44,289,230주) | 2026-08-10 |
| MCHX | 마첵스 B | 5,396.07 | 4,433.79만 주 (44,337,890주) | 2026-08-06 |
| VTGN | Vistagen Therapeutics, Inc. | 1,112.09 | 4,437.69만 주 (44,376,911주) | 2026-08-10 |
| THRY | Thryv Holdings, Inc. | 6,132.60 | 4,443.91만 주 (44,439,111주) | 2026-07-31 |
| VGAS | 버드 클린 퓨얼스 | 2,381.36 | 4,454.96만 주 (44,549,621주) | 2026-06-30 |
| KBSX | FST Corp. | 7,386.39 | 4,476.6만 주 (44,766,003주) | 2025-12-31 |
| TELA | TELA Bio, Inc. | 4,920.63 | 4,489.48만 주 (44,894,757주) | 2026-08-05 |
| GTBP | GT Biopharma, Inc. | 1,149.39 | 4,510.95만 주 (45,109,497주) | 2026-08-10 |
| RNXT | RenovoRx, Inc. | 6,273.00 | 4,512.95만 주 (45,129,508주) | 2026-08-07 |
| BTOC | Armlogi Holding Corp. | 1,004.29 | 4,544.31만 주 (45,443,079주) | 2026-06-30 |
| CISO | CISO Global, Inc. | 960.27 | 4,552.57만 주 (45,525,655주) | 2026-06-30 |
| GNSS | Genasys Inc. | 6,558.05 | 4,554.2만 주 (45,542,009주) | 2026-06-30 |
| TOVX | 시어리바 바이오로직스 | 1,018.82 | 4,589.27만 주 (45,892,668주) | 2026-08-07 |
| OSTX | OS 테라피스 | 6,973.98 | 4,612.58만 주 (46,125,825주) | 2026-08-12 |
| LIDR | AEye, Inc. | 4,993.93 | 4,648.83만 주 (46,488,312주) | 2026-08-04 |
| NSPR | InspireMD, Inc. | 2,441.61 | 4,648.91만 주 (46,489,118주) | 2026-08-14 |
| HYFT | MindWalk Holdings Corp. | 7,302.31 | 4,671.19만 주 (46,711,866주) | 2026-04-30 |
| MATH | Metalpha Technology Holding Ltd | 5,088.23 | 4,711.32만 주 (47,113,236주) | 2026-03-31 |
| ZYBT | Zhengye Biotechnology Holding Ltd | 1,217.12 | 4,739.14만 주 (47,391,376주) | 2025-12-31 |
| PAAI | 파라디움.AI | 4,856.29 | 4,761.07만 주 (47,610,653주) | 2026-08-10 |
| PBK | POWERBANK Corp | 1,534.58 | 4,769.73만 주 (47,697,277주) | 2026-06-30 |
| SACH | 새켐 캐피털 | 4,220.00 | 4,795.46만 주 (47,954,632주) | 2026-08-04 |
| FLNA | FILANA THERAPEUTICS, INC. | 4,226.46 | 4,830.79만 주 (48,307,896주) | 2026-06-30 |
| LOOP | Loop Industries, Inc. | 2,019.88 | 4,838.04만 주 (48,380,371주) | 2026-07-14 |
| TGE | 더 제너레이션 에센셜스 그룹 | 5,301.02 | 4,846.11만 주 (48,461,070주) | 2025-12-31 |
| HOWL | Werewolf Therapeutics, Inc. | 4,472.09 | 4,859.91만 주 (48,599,066주) | 2026-06-30 |
| ETS | Elite Express Holding Inc. | 2,033.10 | 4,871.67만 주 (48,716,672주) | 2026-07-14 |
| TTEC | TTEC Holdings, Inc. | 6,654.95 | 4,929.59만 주 (49,295,940주) | 2026-07-31 |
| ABLV | 에이블 뷰 글로벌 | 8,315.73 | 4,938.99만 주 (49,389,922주) | 2026-06-30 |
| AEON | 이온 바이오파머 | 1,445.10 | 4,988.28만 주 (49,882,790주) | 2026-08-06 |
| THH | TRYHARD HLDGS LTD | 715.66 | 5,004.63만 주 (50,046,250주) | 2026-07-06 |
| RPID | 래피드 마이크로 바이오시스템스 | 4,303.91 | 5,015.96만 주 (50,159,556주) | 2026-06-30 |
| LASE | Laser Photonics Corp | 4,641.28 | 5,017.77만 주 (50,177,716주) | 2026-08-14 |
| CAST | 프리캐스트 | 3,275.73 | 5,078.74만 주 (50,787,414주) | 2026-09-25 |
| SDHC | 스미스 더글러스 홈스 | 8,551.94 | 5,082.84만 주 (50,828,381주) | 2026-06-30 |
| MWG | 멀티 웨이스 홀딩스 | 563.32 | 5,133만 주 (51,330,000주) | 2025-12-31 |
| MDXH | MDxHealth SA | 5,724.09 | 5,136.45만 주 (51,364,520주) | 2025-12-31 |
| CRGO | Freightos Ltd | 4,530.39 | 5,137.69만 주 (51,376,890주) | 2025-12-31 |
| JZXN | Jiuzi Holdings, Inc. | 5,666.41 | 5,151.28만 주 (51,512,759주) | 2026-08-24 |
| ARAI | Arrive AI Inc. | 1,043.23 | 5,187.62만 주 (51,876,209주) | 2026-08-05 |
| TLPH | TALPHERA, INC. | 5,761.54 | 5,190.58만 주 (51,905,796주) | 2026-06-30 |
| RFL | Rafael Holdings, Inc. | 7,630.71 | 5,200만 주 (51,999,996주) | 2026-06-09 |
| BTCS | BTCS Inc. | 7,660.90 | 5,247.19만 주 (52,471,941주) | 2026-08-17 |
| OKYO | OKYO Pharma Ltd | 7,662.01 | 5,247.95만 주 (52,479,527주) | 2026-07-15 |
| LFT | Lument Finance Trust, Inc. | 2,675.51 | 5,248.61만 주 (52,486,129주) | 2026-06-30 |
| BSIN | BIG SKY INDUSTRIAL INC. | 7,611.54 | 5,249.34만 주 (52,493,428주) | 2026-08-04 |
| SURG | SurgePays, Inc. | 793.10 | 5,290.84만 주 (52,908,423주) | 2026-08-19 |
| SOAR | 볼라토 그룹 | 1,497.44 | 5,363.32만 주 (53,633,248주) | 2026-08-03 |
| HFFG | HF Foods Group Inc. | 8,678.04 | 5,390.09만 주 (53,900,945주) | 2026-08-05 |
| NAMM | Namib Minerals | 6,702.29 | 5,408.42만 주 (54,084,183주) | 2025-12-31 |
| SLND | 사우스랜드 홀딩스 | 3,919.34 | 5,443.53만 주 (54,435,257주) | 2026-08-04 |
| INCR | Intercure Ltd. | 6,301.91 | 5,468.13만 주 (54,681,335주) | 2025-12-31 |
| VSME | VS MEDIA Holdings Ltd | 245.31 | 5,501.37만 주 (55,013,689주) | 2025-12-31 |
| FLD | Fold Holdings, Inc. | 3,146.75 | 5,507.72만 주 (55,077,187주) | 2026-08-09 |
| DXLG | DESTINATION XL GROUP, INC. | 2,157.14 | 5,545.36만 주 (55,453,550주) | 2026-09-03 |
| FBDT | First Breach, Inc. | 5,409.18 | 5,577.62만 주 (55,776,201주) | 2026-08-28 |
| EONR | EON 리소시스 | 2,715.88 | 5,582.49만 주 (55,824,861주) | 2026-09-25 |
| PDSB | PDS Biotechnology Corp | 5,849.00 | 5,597.13만 주 (55,971,338주) | 2026-08-06 |
| WRAP | WRAP TECHNOLOGIES, INC. | 9,575.36 | 5,600.36만 주 (56,003,638주) | 2026-08-07 |
| YDDL | 원 앤드 원 그린 테크놀로지스 | 6,085.25 | 5,603.33만 주 (56,033,333주) | 2025-12-31 |
| VENU | 베뉴 홀딩 | 8,038.11 | 5,621.06만 주 (56,210,552주) | 2026-08-13 |
| BEAT | HeartBeam, Inc. | 3,290.79 | 5,634.92만 주 (56,349,171주) | 2026-08-11 |
| GMHS | 게임하우스 홀딩스 | 2,941.11 | 5,680.12만 주 (56,801,150주) | 2026-06-30 |
| SMXT | SolarMax Technology, Inc. | 1,621.84 | 5,690.66만 주 (56,906,572주) | 2026-05-11 |
| BATL | 바탈리언 오일 | 5,900.07 | 5,728.22만 주 (57,282,155주) | 2026-08-10 |
| ISPR | Ispire Technology Inc. | 7,681.34 | 5,775.45만 주 (57,754,471주) | 2026-09-14 |
| SPRO | Spero Therapeutics, Inc. | 6,929.94 | 5,823.48만 주 (58,234,827주) | 2026-08-07 |
| OMEX | ODYSSEY MARINE EXPLORATION INC | 3,965.78 | 5,869.14만 주 (58,691,389주) | 2026-06-30 |
| ZEO | 지어 에너지 | 1,203.15 | 5,878.35만 주 (58,783,489주) | 2026-06-30 |
| BAER | Bridger Aerospace Group Holdings, Inc. | 3,521.92 | 5,882.61만 주 (58,826,140주) | 2026-08-03 |
| GRWG | GrowGeneration Corp. | 9,132.68 | 5,892.04만 주 (58,920,449주) | 2026-08-05 |
| YIBO | 플래닛 이미지 인터내셔널 | 3,624.32 | 5,923.42만 주 (59,234,221주) | 2025-12-31 |
| ONMD | OneMedNet Corp | 2,988.26 | 5,928.65만 주 (59,286,450주) | 2026-08-11 |
| RCT | RedCloud Holdings plc | 876.22 | 5,936.2만 주 (59,362,026주) | 2026-05-15 |
| ALDX | Aldeyra Therapeutics, Inc. | 5,525.30 | 6,032.64만 주 (60,326,421주) | 2026-08-04 |
| AZTR | 아지트라 | 787.85 | 6,060.37만 주 (60,603,742주) | 2026-08-11 |
| MAIA | 마이어 바이오테크놀로지 | 7,347.29 | 6,082.58만 주 (60,825,844주) | 2026-08-10 |
| FNGR | FingerMotion, Inc. | 1,682.43 | 6,131.04만 주 (61,310,361주) | 2026-07-10 |
| PLRX | PLIANT THERAPEUTICS, INC. | 6,377.96 | 6,192.19만 주 (61,921,897주) | 2026-08-07 |
| YTRA | 야트라 온라인 | 5,802.63 | 6,220.3만 주 (62,202,957주) | 2026-08-29 |
| TOON | 카툰 스튜디오스 | 3,539.41 | 6,220.41만 주 (62,204,105주) | 2026-08-13 |
| VEEA | VEEA INC. | 1,536.69 | 6,221.42만 주 (62,214,156주) | 2026-08-10 |
| TWG | Top Wealth Group Holding Ltd | 589.84 | 6,274.66만 주 (62,746,550주) | 2026-09-10 |
| CTSO | Cytosorbents Corp | 1,247.84 | 6,284.27만 주 (62,842,748주) | 2026-06-30 |
| UAVS | 에이지이글 에어리얼 시스템스 | 5,672.84 | 6,290.57만 주 (62,905,706주) | 2026-08-14 |
| MDCX | Medicus Pharma Ltd. | 188.12 | 6,318.06만 주 (63,180,610주) | 2026-08-10 |
| METCB | Ramaco Resources, Inc. | 5,410.24 | 6,338.82만 주 (63,388,239주) | 2026-06-30 |
| BIOX | Bioceres Crop Solutions Corp. | 2,151.66 | 6,381.59만 주 (63,815,891주) | 2025-12-31 |
| FLWS | 1 800 플라워스닷컴 | 9,613.28 | 6,418.51만 주 (64,185,096주) | 2026-06-28 |
| NXAT | Nexus Advanced Technologies Inc. | 202.18 | 6,422.12만 주 (64,221,193주) | 2025-12-31 |
| IBIO | iBio, Inc. | 6,389.63 | 6,430.73만 주 (64,307,256주) | 2026-06-30 |
| XLAB | 엑사스케일 랩스 홀딩스 | 3,084.65 | 6,433.48만 주 (64,334,789주) | 2026-06-30 |
| HIT | 헬스 인 테크 | 4,349.38 | 6,553.47만 주 (65,534,658주) | 2026-06-30 |
| AZI | 오토지 인터넷 테크놀로지 | 6,304.34 | 6,635.01만 주 (66,350,064주) | 2026-08-31 |
| MERC | MERCER INTERNATIONAL INC. | 1,608.43 | 6,701.8만 주 (67,018,033주) | 2026-08-04 |
| LIMN | Liminatus Pharma, Inc. | 496.99 | 6,716.04만 주 (67,160,362주) | 2026-08-14 |
| MBOT | Microbot Medical Inc. | 7,186.63 | 6,716.48만 주 (67,164,801주) | 2026-06-30 |
| MEGL | Magic Empire Global Ltd | 5,205.92 | 6,774.26만 주 (67,742,622주) | 2026-09-30 |
| TCRX | TScan Therapeutics, Inc. | 1,748.86 | 6,777.93만 주 (67,779,255주) | 2026-06-30 |
| MPU | 메가 매트릭스 | 859.27 | 6,786.06만 주 (67,860,588주) | 2025-12-31 |
| TELO | Telomir Pharmaceuticals, Inc. | 8,252.99 | 6,877.5만 주 (68,774,956주) | 2026-08-12 |
| NNOX | Nano-X Imaging Ltd. | 4,836.34 | 6,959.02만 주 (69,590,228주) | 2025-12-31 |
| SLSN | SOLESENCE, INC. | 5,653.17 | 7,064.7만 주 (70,647,045주) | 2026-08-19 |
| HDRN | Hadron Energy, Inc. | 8,937.36 | 7,149.88만 주 (71,498,842주) | 2026-08-10 |
| BMEA | Biomea Fusion, Inc. | 9,060.49 | 7,248.39만 주 (72,483,852주) | 2026-06-30 |
| ICCM | IceCure Medical Ltd. | 435.19 | 7,312.23만 주 (73,122,293주) | 2025-12-31 |
| TYGO | TIGO ENERGY, INC. | 6,642.46 | 7,677.37만 주 (76,773,711주) | 2026-07-30 |
| ACH | ACCENDRA HEALTH INC/VA/ | 3,584.53 | 7,690.47만 주 (76,904,704주) | 2026-06-30 |
| COCH | Envoy Medical, Inc. | 5,039.94 | 7,719.46만 주 (77,194,595주) | 2026-06-30 |
| ZVIA | 제비아 PBC | 8,656.38 | 7,734.54만 주 (77,345,401주) | 2026-06-30 |
| CRDF | Cardiff Oncology, Inc. | 8,324.09 | 7,779.52만 주 (77,795,249주) | 2026-08-06 |
| MRNO | Murano Global Investments Plc | 1,945.14 | 7,971.88만 주 (79,718,832주) | 2025-12-31 |
| SLMT | 브레라 홀딩스 | 4,315.64 | 8,199.48만 주 (81,994,765주) | 2025-12-31 |
| SFWL | 성펑 디벨롭먼트 | 2,437.05 | 8,249.75만 주 (82,497,513주) | 2025-12-31 |
| KNDI | Kandi Technologies Group, Inc. | 7,159.59 | 8,270.54만 주 (82,705,365주) | 2025-12-31 |
| CCG | 처처 그룹 | 981.13 | 8,302.01만 주 (83,020,061주) | 2025-12-31 |
| MDIA | 미디아코 홀딩 | 8,332.31 | 8,401.99만 주 (84,019,858주) | 2026-08-13 |
| INV | Innventure, Inc. | 4,790.77 | 8,461.27만 주 (84,612,657주) | 2026-08-07 |
| HODO | House of Doge Inc. | 1,178.60 | 8,490.3만 주 (84,902,985주) | 2026-08-13 |
| RNTX | Rein Therapeutics, Inc. | 7,117.03 | 8,626.7만 주 (86,267,032주) | 2026-08-12 |
| MLSS | 마일스톤 사이언티픽 | 3,327.56 | 8,873.92만 주 (88,739,185주) | 2026-08-11 |
| HAIN | HAIN CELESTIAL GROUP INC | 4,698.45 | 9,100.23만 주 (91,002,269주) | 2026-09-08 |
| VHUB | VenHub Global, Inc. | 4,043.26 | 9,139.29만 주 (91,392,857주) | 2026-08-11 |
| CNTX | Context Therapeutics Inc. | 2,956.67 | 9,187.92만 주 (91,879,177주) | 2026-06-30 |
| CTOR | CITIUS ONCOLOGY, INC. | 7,903.40 | 9,298.12만 주 (92,981,204주) | 2026-08-13 |
| XPL | 솔리타리오 리소시스 | 5,396.07 | 9,468.45만 주 (94,684,463주) | 2026-08-06 |
| CTM | 카스텔럼 | 6,015.77 | 9,478.13만 주 (94,781,286주) | 2026-08-05 |
| CGTX | COGNITION THERAPEUTICS INC | 8,938.81 | 9,509.37만 주 (95,093,746주) | 2026-08-04 |
| PTLE | PTL Ltd | 4,347.45 | 9,748.75만 주 (97,487,500주) | 2025-12-31 |
| TEAD | Teads Holding Co. | 5,541.66 | 9,806.52만 주 (98,065,162주) | 2026-06-30 |
| ATYR | aTYR PHARMA INC | 2,779.80 | 9,808.74만 주 (98,087,425주) | 2026-06-30 |
| OCG | Oriental Culture Holding LTD | 323.70 | 9,831.39만 주 (98,313,864주) | 2025-12-31 |
| DCGO | DocGo Inc. | 3,581.21 | 9,892.84만 주 (98,928,369주) | 2026-08-14 |
| COSM | Cosmos Health Inc. | 3,215.26 | 1.01억 주 (100,633,773주) | 2026-08-18 |
| BRLT | Brilliant Earth Group, Inc. | 2,417.83 | 1.02억 주 (101,822,795주) | 2026-07-31 |
| FLYX | 플라이익스클루시브 | 6,466.81 | 1.02억 주 (102,081,748주) | 2026-07-31 |
| GTN/A | 그레이 텔레비전 A | 5,161.65 | 1.03억 주 (102,984,383주) | 2026-07-31 |
| IGC | IGC 파머 | 2,894.75 | 1.03억 주 (103,384,008주) | 2026-08-05 |
| ELBM | Electra Battery Materials Corp | 5,421.30 | 1.04억 주 (103,738,330주) | 2025-12-31 |
| GAME | GameSquare Holdings, Inc. | 3,827.85 | 1.04억 주 (103,809,536주) | 2026-06-30 |
| FSP | 프랭클린 스트리트 프라퍼티스 | 3,200.45 | 1.04억 주 (104,011,708주) | 2026-07-23 |
| SDA | 선카 테크놀로지 그룹 | 2,274.05 | 1.06억 주 (105,647,916주) | 2025-12-31 |
| HYPR | 하이퍼파인 | 7,916.43 | 1.06억 주 (106,048,669주) | 2026-06-30 |
| JOB | GEE 그룹 | 2,362.23 | 1.1억 주 (109,870,686주) | 2026-08-11 |
| CHGG | CHEGG, INC | 7,882.92 | 1.11억 주 (111,027,482주) | 2026-08-03 |
| PROP | Prairie Operating Co. | 4,456.65 | 1.13억 주 (112,798,010주) | 2026-06-30 |
| CIRC | CIRCLE8 GROUP INC | 5,674.58 | 1.14억 주 (114,406,923주) | 2026-08-14 |
| STEX | Streamex Corp. | 6,021.24 | 1.16억 주 (116,465,417주) | 2026-08-13 |
| CXAI | CXApp Inc. | 434.76 | 1.17억 주 (116,870,315주) | 2026-08-12 |
| ARAY | ACCURAY INC | 3,123.33 | 1.19억 주 (119,439,307주) | 2026-08-21 |
| MYPS | 플레이스튜디오스 | 4,747.81 | 1.2억 주 (120,121,382주) | 2026-06-30 |
| MIST | Milestone Pharmaceuticals Inc. | 9,514.14 | 1.24억 주 (124,497,980주) | 2026-06-30 |
| ONCY | ONCOLYTICS BIOTECH INC | 6,001.59 | 1.28억 주 (127,510,505주) | 2026-08-10 |
| WWR | 웨스트워터 리소시스 | 6,225.12 | 1.29억 주 (128,564,833주) | 2026-08-10 |
| SKIN | SkinHealth Systems Inc. | 7,626.26 | 1.3억 주 (130,140,763주) | 2026-08-03 |
| RDGT | Ridgetech Inc. | 337.55 | 1.33억 주 (133,090,838주) | 2026-03-31 |
| REKR | Rekor Systems, Inc. | 4,459.41 | 1.38억 주 (137,636,495주) | 2026-06-30 |
| RANI | 라니 테라퓨틱스 홀딩스 | 9,566.42 | 1.39억 주 (139,395,319주) | 2026-06-30 |
| AIFC | AI Financial Corp | 6,282.88 | 1.4억 주 (139,836,511주) | 2026-08-12 |
| XTNT | 엑스턴트 메디컬 홀딩스 | 4,500.44 | 1.4억 주 (140,287,960주) | 2026-08-07 |
| RETO | ReTo Eco-Solutions, Inc. | 8,191.82 | 1.41억 주 (140,898,309주) | 2026-09-25 |
| MKDW | MKDWELL Tech Inc. | 4,265.57 | 1.41억 주 (141,039,933주) | 2025-12-31 |
| BZAI | Blaize Holdings, Inc. | 4,203.03 | 1.45억 주 (144,832,039주) | 2026-08-13 |
| BLNK | Blink Charging Co. | 7,419.43 | 1.45억 주 (144,938,716주) | 2026-08-04 |
| NXTT | Next Technology Holding Inc. | 820.44 | 1.47억 주 (147,296,192주) | 2026-07-24 |
| ATCH | 아틀라스클리어 홀딩스 | 2,768.03 | 1.52억 주 (151,838,744주) | 2026-09-22 |
| LZMH | LZ 테크놀로지 홀딩스 | 785.35 | 1.58억 주 (158,020,000주) | 2025-12-31 |
| GRML | Greenland Mines Ltd | 5,631.71 | 1.59억 주 (158,850,637주) | 2026-06-30 |
| GUTS | FRACTYL HEALTH, INC. | 6,062.10 | 1.59억 주 (159,179,848주) | 2026-08-04 |
| GNS | 지니어스 그룹 | 2,938.72 | 1.6억 주 (159,839,164주) | 2025-12-31 |
| ZOOZ | ZOOZ Strategy Ltd. | 6,005.14 | 1.62억 주 (161,995,282주) | 2025-12-31 |
| ALPS | Alps Group Inc | 6,418.06 | 1.66억 주 (166,400,314주) | 2026-03-31 |
| FUFU | 비트푸푸 | 4,494.81 | 1.67억 주 (166,613,948주) | 2025-12-31 |
| NXXT | NEXTNRG, INC. | 1,099.48 | 1.68억 주 (168,221,739주) | 2026-08-13 |
| SLQT | SelectQuote, Inc. | 6,811.96 | 1.77억 주 (176,573,132주) | 2026-07-31 |
| AXG | Solowin Holdings, Ltd. | 1,811.40 | 1.89억 주 (188,953,827주) | 2026-03-31 |
| HRTX | HERON THERAPEUTICS, INC. /DE/ | 6,297.39 | 1.9억 주 (189,852,307주) | 2026-08-05 |
| NRDY | 너디 | 5,754.58 | 1.92억 주 (191,609,890주) | 2026-07-31 |
| SPWR | SunPower Inc. | 9,612.20 | 2.09억 주 (208,796,937주) | 2026-08-21 |
| ENLV | Enlivex Ltd. | 594.86 | 2.37억 주 (237,381,498주) | 2025-12-31 |
| BXBL | BOXABL Inc. | 3,101.92 | 2.41억 주 (241,493,343주) | 2026-06-30 |
| NFE | New Fortress Energy Inc. | 3,147.69 | 2.86억 주 (285,634,650주) | 2026-06-30 |
| EZGO | EZGO Technologies Ltd. | 206.70 | 3.46억 주 (345,884,745주) | 2026-05-14 |
| SAFX | XCF Global, Inc. | 7,038.37 | 4.11억 주 (410,816,896주) | 2026-08-14 |
| ADBT | Advasa Holdings, Inc. | 6,088.32 | 4.87억 주 (487,065,702주) | 2026-06-30 |
| GOSS | Gossamer Bio, Inc. | 6,587.21 | 4.89억 주 (488,846,722주) | 2026-08-08 |
| ZONE | 클린코어 솔루션스 B | 6,731.82 | 5.09억 주 (508,830,259주) | 2026-09-28 |
| GPUS | 하이퍼스케일 데이터 | 3,030.66 | 6.05억 주 (605,347,124주) | 2026-06-30 |
| ADVB | Advanced Biomed Inc. | 1,054.06 | 검토 필요 |  |
| AEMD | AETHLON MEDICAL INC | 976.90 | 검토 필요 |  |
| ALP | Alpha Compute Corp | 623.04 | 검토 필요 |  |
| AMOD | ALPHA MODUS HOLDINGS, INC. | 1,232.44 | 검토 필요 |  |
| ARBE | Arbe Robotics Ltd. | 7,663.44 | 검토 필요 |  |
| AURE | Aurelion Inc. | 2,032.97 | 검토 필요 |  |
| BBGI | 비슬리 브로드캐스트 그룹 | 1,026.75 | 검토 필요 |  |
| BIAF | bioAffinity Technologies, Inc. | 706.97 | 검토 필요 |  |
| BKYI | BIO KEY INTERNATIONAL INC | 261.41 | 검토 필요 |  |
| BNAI | Brand Engagement Network Inc. | 4,275.68 | 검토 필요 |  |
| BOXL | Boxlight Corp | 304.04 | 검토 필요 |  |
| BYAH | Park Ha Biological Technology Co., Ltd. | 557.24 | 검토 필요 |  |
| BYSI | BeyondSpring Inc. | 2,846.72 | 검토 필요 |  |
| CDT | CDT Equity Inc. | 104.59 | 검토 필요 |  |
| CGTL | Creative Global Technology Holdings Ltd | 421.85 | 검토 필요 |  |
| CISS | C3IS | 132.28 | 검토 필요 |  |
| CMND | Clearmind Medicine Inc. | 1,966.37 | 검토 필요 |  |
| COOT | Australian Oilseeds Holdings Ltd | 2,059.86 | 검토 필요 |  |
| CRIS | CURIS INC | 156.55 | 검토 필요 |  |
| DSY | Big Tree Cloud Holdings Ltd | 1,644.15 | 검토 필요 |  |
| DXST | Decent Holding Inc. | 316.57 | 검토 필요 |  |
| EBON | 이방 인터내셔널 홀딩스 | 945.28 | 검토 필요 |  |
| EDVA | 엔도비아 헬스 사이언시스 | 107.67 | 검토 필요 |  |
| EJH | E-Home Household Service Holdings Ltd | 390.42 | 검토 필요 |  |
| ELPW | Elong Power Holding Ltd. | 253.76 | 검토 필요 |  |
| EOCN | Galmed Pharmaceuticals Ltd. | 349.97 | 검토 필요 |  |
| ESYN | HWH International Inc. | 1,622.54 | 검토 필요 |  |
| FRGT | Freight Technologies, Inc. | 19.80 | 검토 필요 |  |
| GCDT | 그린 서클 디카보나이즈 테크놀로지 | 293.75 | 검토 필요 |  |
| GCTK | Glucotrack, Inc. | 115.04 | 검토 필요 |  |
| GDHG | 골든 헤븐 그룹 홀딩스 | 7,011.48 | 검토 필요 |  |
| GELS | Gelteq Ltd | 620.92 | 검토 필요 |  |
| GLE | Global Engine Group Holding Ltd | 558.83 | 검토 필요 |  |
| GLXG | Galaxy Payroll Group Ltd | 213.79 | 검토 필요 |  |
| GMEX | GMEX Robotics Corp | 2,552.88 | 검토 필요 |  |
| IBG | Innovation Beverage Group Ltd | 375.63 | 검토 필요 |  |
| INTJ | Intelligent Group Ltd | 418.27 | 검토 필요 |  |
| ITP | IT 테크 패키징 | 252.78 | 기준일 오래됨 (2025-06-30) |  |
| IZM | IC줌 그룹 | 162.54 | 검토 필요 |  |
| JAGX | Jaguar Health, Inc. | 1,093.39 | 검토 필요 |  |
| JLHL | Julong Holding Ltd | 4,808.43 | 검토 필요 |  |
| LCFY | Locafy Ltd | 368.81 | 검토 필요 |  |
| LGCL | Lucas GC Ltd | 294.32 | 검토 필요 |  |
| LGO | Largo Inc. | 5,420.08 | 검토 필요 |  |
| LTRN | Lantern Pharma Inc. | 1,219.22 | 검토 필요 |  |
| MASK | 3E 네트워크 테크놀로지 그룹 | 307.13 | 검토 필요 |  |
| MCRP | 마이크로폴리스 홀딩 | 2,135.17 | 검토 필요 |  |
| MF | MindForge Inc. | 1,710.00 | 검토 필요 |  |
| MI | NFT | 75.20 | 검토 필요 |  |
| MLEC | Moolec Science SA | 350.35 | 검토 필요 |  |
| MMA | 믹스드 마셜 아츠 그룹 | 962.15 | 검토 필요 |  |
| MNDR | Mobile-health Network Solutions | 107.52 | 검토 필요 |  |
| MTEK | Maris Tech Ltd. | 654.89 | 검토 필요 |  |
| MYSE | Myseum.AI, Inc. | 852.21 | 검토 필요 |  |
| NCT | Intercont (Cayman) Ltd | 152.63 | 검토 필요 |  |
| NIVF | 뉴젠IVF 그룹 | 22.14 | 검토 필요 |  |
| NNVC | 나노바이리사이드스 | 3,573.50 | 검토 필요 |  |
| NTCL | 넷클래스 테크놀로지 | 415.54 | 검토 필요 |  |
| NXL | Nexalin Technology, Inc. | 373.23 | 검토 필요 |  |
| OPTH | 옵티미 헬스 | 2,364.78 | 검토 필요 |  |
| PASW | Ping An Biomedical Co., Ltd. | 1,575.22 | 검토 필요 |  |
| PMAX | 파월 맥스 | 103.29 | 검토 필요 |  |
| PN | 스카이코프 솔라 그룹 | 2,098.10 | 검토 필요 |  |
| QNCX | Quince Therapeutics, Inc. | 2,726.74 | 검토 필요 |  |
| RAYA | 에라약 파워 솔루션 그룹 | 187.04 | 검토 필요 |  |
| RBNE | Robin Energy Ltd. | 295.80 | 검토 필요 |  |
| RUBI | Rubico Inc. | 117.18 | 검토 필요 |  |
| SILO | Silo Pharma, Inc. | 230.30 | 검토 필요 |  |
| SKYQ | Sky Quarry Inc. | 2,252.51 | 검토 필요 |  |
| SQFT | Presidio Property Trust, Inc. | 134.85 | 검토 필요 |  |
| SRL | Scully Royalty Ltd. | 7,735.01 | 검토 필요 |  |
| SSBI | 서밋 스테이트 뱅크 | 8,518.58 | 미확보 |  |
| STKE | 솔 스트래티지스 | 7,265.59 | 검토 필요 |  |
| SUGP | SU Group Holdings Ltd | 57.93 | 검토 필요 |  |
| SXTC | China SXT Pharmaceuticals, Inc. | 165.16 | 검토 필요 |  |
| TCRT | Alaunos Therapeutics, Inc. | 217.34 | 검토 필요 |  |
| TGL | TREASURE GLOBAL INC | 246.31 | 검토 필요 |  |
| TNMG | TNL Mediagene | 314.88 | 검토 필요 |  |
| UCAR | U Power Ltd | 686.19 | 검토 필요 |  |
| UZX | Linkage Global Inc | 375.95 | 검토 필요 |  |
| VEEE | Twin Vee PowerCats, Co. | 612.37 | 검토 필요 |  |
| VMAR | Vision Marine Technologies Inc. | 417.95 | 검토 필요 |  |
| VNRX | 볼리션RX | 677.77 | 검토 필요 |  |
| WCT | Wellchange Holdings Co Ltd | 964.04 | 검토 필요 |  |
| WHLR | Wheeler Real Estate Investment Trust, Inc. | 51.71 | 검토 필요 |  |
| WXM | WF International Ltd. | 2,877.68 | 검토 필요 |  |
| XAIR | Beyond Air, Inc. | 251.02 | 검토 필요 |  |
| YAAS | Youxin Technology Ltd | 785.24 | 검토 필요 |  |
| ZBAO | 즈바오 테크놀로지 | 3,890.63 | 검토 필요 |  |

- `기준일 오래됨`은 SEC 근거가 있으나 기준일이 1년을 넘어 현재 숫자를 숨긴 상태다. `검토 필요`는 복수 클래스·병합 후 수량이나 후속 발행을 반영한 정확한 전체 수량을 확정하지 못한 상태다. `미확보`는 SEC 원문에서 발행사 전체 수량을 확인하지 못한 상태다. 이 상태들은 숫자를 표시하지 않는다. 검증 수량 열에는 SEC 수량 기준일을 함께 표시한다. 기준일은 해당 공시가 밝힌 수량의 날짜이며 그 뒤 자본 변동이 없음을 보장하지 않는다. 주식수는 10,000주 이상부터 만 주 단위, 100,000,000주 이상부터 억 주 단위로 표시하고 괄호 안에 정확한 주식 수를 병기한다.
- 상장 존속 여부는 보고서 생성 시점의 Nasdaq Trader 공식 NASDAQ·NYSE·NYSE American 종목 디렉터리 등재로 판정한다. 해당 디렉터리에서 빠진 ticker는 SEC 상장폐지 공지 확인 여부와 관계없이 보고서에서 제외한다. 미등재 사실만으로 상장폐지 효력일이나 사유를 단정하지 않는다.
- 검증 수량의 기준일·공시형식·URL은 로컬 `sec_smallcap_share_review` 기록에 보존한다. 시가총액은 SEC 값이 아닌 로컬 fundamental 스냅샷이다.
- 문서 재생성: `node --import tsx scripts/export-sec-smallcap-shares-report.ts`
