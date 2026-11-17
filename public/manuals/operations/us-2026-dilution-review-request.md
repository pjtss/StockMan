# 미국 보통주 2026년 자금조달·희석 위험 조사 — 진행 기록

## 조사 범위

- 대상: 사용자가 지정한 미국 티커 목록 전체(원 티커는 아래 별도 목록으로 보존).
- 기간: 2026-01-01부터 조사 기준시각까지(미국 동부시간/한국시간 병기).
- 항목: 보통주 공모·registered direct·PIPE, ATM, shelf, 보통/선불 워런트, 전환사채·전환우선주, equity line, 재매도 등록, reverse split 및 수권주식수 변경.
- 1차 자료: SEC EDGAR 제출 원문과 계약 Exhibit, 후속 8-K/6-K 및 최신 정기보고서. 거래소·회사 IR은 공식 보완자료로만 사용.
- 해석 원칙: 계약·가격책정·종결·발행·등록효력·행사/전환·상환을 분리한다. 후속자료를 확인하지 못하면 잔량은 미확인으로 두며, 등록 수량을 실제 발행/조달로 세지 않는다. 근거 링크를 확인하지 못한 후보는 확정 결과로 승격하지 않는다.

## 현재 진행 상태

SEC 공식 company ticker master 및 submissions API 확인 결과와 직접 연결되는 filing 색인은 [2026년 SEC filing 색인](./us-2026-dilution-sec-filing-index.md)에 생성했다. 388개 티커 중 386개를 현재 CIK/issuer에 매핑했고, `RITR`, `SNYR`는 ticker master에서 매핑하지 못했다. 2026-10-17 조회 기준 8,369개의 선택 Form 제출이 색인에 있고, 294개 ticker에 S-1/S-3/F-1/F-3/424B*/EFFECT/POS AM 제출이 하나 이상 나타난다.

거래 단위 원문 분석은 현재 46개 종목(TCRT, IMCC, EPOW, DCX, MEGL, MTEN, BDRX, ICCM, STKH, EHGO, ACXP, AIXI, AMIX, FFAI, ACON, APRE, AMOD, AGMH, AMSS, AMST, APVO, ABTS, ADGM, AIDX, AIMD, AQB, AQMS, ARBB, ARTL, ATPC, CENN, BRNX, CDT, BIAF, SBFM, ADXN, AIRE, AKAN, ALP, ALZN, ATXG, AUID, AUUD, BANL, BAOS, BBLG)에 대해 [원문 검토 결과](./company-analysis/us/us-2026-dilution-verified-findings.md)에 기록했다. 나머지 342개 종목은 제출 목록 색인만 된 상태다. 관련 공시 원문·계약 Exhibit·후속 정기보고서를 대조해 계약 조건, 종결·발행·실제 조달액, 워런트/전환 잔량과 현재 ATM capacity를 확인해야 한다. 따라서 **388개 전체의 종목별 희석 위험 분석은 아직 미완료다.**

각 종목의 제출 날짜·양식·accession 및 SEC primary document 링크는 filing 색인에 있다. filing 유형만으로 자금조달 성립이나 희석을 단정하지 않는다. 특히 424B3 resale 등록, shelf 한도, EFFECT와 실제 판매/발행을 구분하여 filing별 원문과 후속 기록을 대조한다.

## 종목별 결과표

최종 분석 때 다음 표를 모든 지정 티커에 대해 채운다. 공시가 확인되지 않은 경우에도 SEC submissions 조회 기준일과 확인한 filing 범위를 기록하며, “공시 없음”으로 단정하지 않는다.

| 티커 | issuer / CIK | 2026 관련 공시(ET 날짜·Form·SEC 원문) | 자금조달·증권 조건 | 완료액·발행량 | 미결 잔량·잠재 희석 | 상태·확인 한계 |
|---|---|---|---|---:|---:|---|
| BBLG | Bone Biologics Corp / CIK 0001419554 | 2026 March ATM, July private placement, S-3 resale/EFFECT, September reverse-split vote | $1.064M ATM cap; July placement ~$2.7M net with 2.113M PF + 2.113M Series F + 2.113M Series G + 126,761 agent warrants | H1 ATM 15,120 shares/$20,180 net; 945,677 PF exercised by Aug 14; 8/14 outstanding 2,756,057 | PF residual 1.167M; F/G/agent issuance subject to shareholder approval; legacy warrants 2,753,827 at 6/30; ATM capacity balance unknown; resale registration covers 6.465M shares, no issuer proceeds | Very high; large potential issuance versus 1.81M June 30 base, continuing financing need, split authorized but unimplemented |
| BAOS | Baosheng Media Group Holdings Ltd / CIK 0001811216 | 2026 6-K, S-8, 424B5, F-3 및 10/16 H1 재무제표 | 6월 $12.536M PIPE 25M주, 5.3M consultant shares, $30M High West equity line 종료, $300M shelf | 6/30 outstanding 31,834,487; High West 종료 전 255,328주 sold/issued (유입액 미공개) | PIPE 25M resale registered/effective; S-8 5.3M plan registration; $300M shelf potential, separate from completed issue; post-June draws unknown | 매우 높음; 6/30 share base 및 H1 losses/cash burn, terminated facility proceeds 미공개 |
| AUUD | Auddia Inc. / CIK 0001554818 | 2026 10-K, 8-K, 10-Q; offering, ATM/ELOC, bridge note 및 merger 후속 | $12M RDO, $2.36 warrants, ATM, 최대 $50M ELOC | 4/27 RDO close; PF warrants 전량 행사; ATM 6/30까지 소진 | 6/30 total warrants 5,138,442; ELOC 2026 draw 및 bridge advances 미확인 | 매우 높음; 10/6 merger vote insufficient, meeting cancelled/reschedule expected |

## 지정 티커 원문 목록

`ABTS`, `ACON`, `ACXP`, `ADGM`, `ADXN`, `AGMH`, `AIDX`, `AIMD`, `AIRE`, `AIXI`, `AKAN`, `ALP`, `ALZN`, `AMIX`, `AMOD`, `AMSS`, `AMST`, `APRE`, `APVO`, `AQB`, `AQMS`, `ARBB`, `ARTL`, `ATPC`, `ATXG`, `AUID`, `AUUD`, `BANL`, `BAOS`, `BBLG`, `BDRX`, `BGL`, `BGLC`, `BGMS`, `BIAF`, `BIYA`, `BJDX`, `BKYI`, `BMGL`, `BOLT`, `BON`, `BOXL`, `BRNX`, `BRTX`, `BTTC`, `BYAH`, `CAPS`, `CCTG`, `CDIO`, `CDT`, `CDTG`, `CELZ`, `CENN`, `CETX`, `CGTL`, `CHAI`, `CHGA`, `CHNR`, `CHR`, `CHSN`, `CIIT`, `CISO`, `CISS`, `CLGN`, `CLIK`, `CMMB`, `CMND`, `CNET`, `CNEY`, `CNSP`, `CODX`, `CPOP`, `CRE`, `CRIS`, `CRMT`, `CSAI`, `CTNT`, `CURX`, `CVKD`, `CWD`, `CXAI`, `CYAB`, `CYCU`, `DAIC`, `DBGI`, `DCOY`, `DCX`, `DFSC`, `DKI`, `DOGZ`, `DPU`, `DRCT`, `DRMA`, `DTSS`, `DTST`, `DXST`, `EBON`, `EDBL`, `EEIQ`, `EHGO`, `EJH`, `ELAB`, `ELOG`, `ELPW`, `ENLV`, `ENSC`, `ENVB`, `EPOW`, `EPSM`, `ERNA`, `EVGN`, `EZGO`, `EZRA`, `FAMI`, `FBLG`, `FCHL`, `FCUV`, `FEBO`, `FEED`, `FFAI`, `FGL`, `FLUX`, `FLYE`, `FMFC`, `FRGT`, `FRSX`, `FRTT`, `GAUZ`, `GCTK`, `GDC`, `GDTC`, `GELS`, `GENK`, `GIPR`, `GITS`, `GLE`, `GLXG`, `GNLN`, `GNPX`, `GOVX`, `GP`, `GRI`, `GSUN`, `GURE`, `GVH`, `GWAV`, `GXAI`, `GYGY`, `HAO`, `HCAI`, `HCWB`, `HIHO`, `HKIT`, `HKPD`, `HTCR`, `HUBC`, `HUDI`, `HXHX`, `HYFM`, `IBG`, `ICCM`, `IFBD`, `ILAG`, `ILLR`, `IMCC`, `IMNN`, `IMRN`, `IMTE`, `INBS`, `INEO`, `INHD`, `INLF`, `INM`, `INTJ`, `IOTR`, `IPDN`, `IPST`, `IPW`, `ISPC`, `IVDA`, `IVF`, `IZM`, `JAGX`, `JCSE`, `JL`, `JTAI`, `JUNS`, `JWEL`, `JYD`, `JZ`, `KALA`, `KIDZ`, `KITT`, `KRKR`, `LABT`, `LBGJ`, `LCFY`, `LESL`, `LEXX`, `LGCL`, `LGHL`, `LGVN`, `LHSW`, `LIMN`, `LNAI`, `LNKS`, `LOBO`, `LRHC`, `LUCY`, `LXEH`, `LZMH`, `MARPS`, `MASK`, `MBIO`, `MDCX`, `MEGL`, `MGN`, `MKZR`, `MLEC`, `MNDR`, `MRM`, `MSS`, `MTEK`, `MTEN`, `MYSE`, `MYSZ`, `NAII`, `NAMI`, `NCI`, `NCNA`, `NCRA`, `NCT`, `NDRA`, `NEXR`, `NHTC`, `NIVF`, `NIXX`, `NMTC`, `NRSN`, `NTCL`, `NUWE`, `NVNO`, `NWTG`, `NXGL`, `NXL`, `NXTS`, `NXTT`, `OCG`, `OFAL`, `OLB`, `OLOX`, `OMH`, `ONCO`, `ONFO`, `ORKT`, `OXBR`, `PARA`, `PAVS`, `PCSA`, `PFSA`, `PMAX`, `PMCB`, `POLA`, `POM`, `PPBT`, `PPCB`, `PRFX`, `PRPL`, `PRSO`, `PSNYW`, `PULM`, `PWCM`, `QCLS`, `QNRX`, `RAIN`, `RAYA`, `RBNE`, `RCON`, `RDGT`, `RDHL`, `RENX`, `RETO`, `REVB`, `RIME`, `RITR`, `RKDA`, `RMCF`, `RMSG`, `RUBI`, `RVSN`, `SBFM`, `SCKT`, `SCNI`, `SCNX`, `SDST`, `SEED`, `SEGG`, `SFHG`, `SGLY`, `SHFS`, `SILO`, `SKYE`, `SLXN`, `SMTK`, `SMX`, `SNAL`, `SNES`, `SNGX`, `SNOA`, `SNTG`, `SNYR`, `SOBR`, `SONM`, `SPHL`, `SPRC`, `SQFT`, `SSM`, `STFS`, `STKH`, `SUGP`, `SURG`, `SVRE`, `SXTC`, `SXTP`, `TANH`, `TAOP`, `TC`, `TCRT`, `TDIC`, `TGL`, `THH`, `TKLF`, `TNMG`, `TNON`, `TRAW`, `TRIB`, `TRNR`, `TRUG`, `TWAV`, `TWG`, `UCAR`, `UCL`, `UFG`, `UK`, `UONE`, `UZX`, `VBIO`, `VCIG`, `VEEA`, `VEEE`, `VIVK`, `VIVS`, `VMAR`, `VRAX`, `VS`, `VSA`, `VSME`, `VVOS`, `WAFU`, `WBUY`, `WETO`, `WHLR`, `WKSP`, `WLDS`, `WOK`, `WVVI`, `XAIR`, `XBIO`, `XCH`, `XCUR`, `XELB`, `XHLD`, `XPON`, `XRTX`, `XTLB`, `XWEL`, `XXII`, `YAAS`, `YDKG`, `YHC`, `YHGJ`, `YJ`, `YMAT`, `YMT`, `YYAI`, `ZCMD`, `ZNB`, `ZTG`

## 분석 완료 조건

- 모든 입력 티커를 공식 SEC issuer/CIK와 대조하고 alias·비상장·조회 실패를 표시한다.
- 2026년 자금조달 관련 8-K/6-K, S-1/S-3/F-1/F-3, 424B*, EFFECT, DEF 14A 및 해당 기간 최신 10-Q/10-K/20-F의 관련 Exhibit를 조사한다.
- 계약별로 최초 조건과 이후 수정·종결·발행·행사/전환/상환을 추적하고, 잔여량은 공식 자료로 확정 가능한 경우만 계산한다.
- 종목별 filing analysis와 날짜별 요약을 프로젝트 `docs/operations/sec-edgar-analysis-records.md`의 저장 규칙에 맞춰 연결한다.
- 결과 문서·색인·DEVELOPMENT_LOG에 조사범위, 확인 결과, 미확인 사유, 검증 및 남은 작업을 함께 기록한다.

## 공식 참고자료

- [SEC EDGAR 검색](https://www.sec.gov/edgar/search/)
- [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- 프로젝트 [미국 상장 종목 희석·자금조달 악재 조사 Harness](./us-equity-dilution-risk-harness.md)
- 프로젝트 [SEC 공시 분석 기록 관리](./sec-edgar-analysis-records.md)



