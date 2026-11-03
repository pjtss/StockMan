# 미국 보통주 공시·뉴스 기반 이벤트 검토 — 2026-10-31 기준

## 범위와 원천

- 대상: 운영 공개 API에서 확인한 활성 미국 COMMON_STOCK 100개, USD 시가총액 0 초과·$100,000,000 이하. 운영 기준시각에 저장된 시총 스냅샷 범위는 $60,547~$36,769,125다. 종목별 관측시각·원천은 구조화 JSON을 참조한다.
- SEC 조사 창: 2025-10-31 포함~2026-11-01 미포함(366일). SEC 공식 회사 티커/CIK 맵과 회사별 submissions JSON을 이용해 100개 회사의 제출 이력 **5,662건**을 accession, form, filingDate, reportDate, acceptanceDateTime, items, primaryDocument 및 원문 URL과 함께 수집했다.
- 운영 뉴스 확인: 생산 서버의 읽기 전용 market-intelligence API 결과 **669개**를 출처 ID, 게시시각, 기사·공시 URL과 함께 보존했다. 이 범위의 운영 분류 SEC 이벤트 응답은 0건이었다. 이는 SEC 제출물이 없다는 의미가 아니며, 직접 제출 이력에 별도로 5,662건을 기록했다.
- 복구 주의: 이벤트 JSON 유실 후 SEC accession별 검토 메타데이터와 본 보고서의 이벤트 요약으로 100건을 재구성했다. 이후 Batch 20·21·22에서 직접 검토 이벤트 20건, Batch 27에서 별도 issuer-reported 이벤트 1건을 추가했다. PWCM 및 Batch 20·21·22 이벤트는 SEC 원문을 대조했다. 재구성 97건은 원본 JSON의 기존 방향성·확신도·원문 인용·위험 배열을 보존하지 못해 구조화 JSON에서 `LOW`/`UNCERTAIN` 및 복구 한계를 표시했으며, 복구본을 전면 재검증 완료로 간주하지 않는다.
- 이벤트 판정 원칙: 제목/RSS만으로 확정하지 않고 공식 SEC 제출물 또는 발행사 보도자료 원문으로 대조했다. canonical 이벤트 레코드는 216건이며 각 SEC event accession과 종목별 review metadata를 연결했다. 100개 발행사 모두 최소 한 개의 이벤트 레코드가 있다. 93개 issuer는 primary/full 검토, 나머지 7개는 targeted primary sections 검토로 구분된다. 재검증 대기 0건이다. 이는 각 조사창의 모든 SEC filing 전문을 전수 판독했다는 뜻은 아니다.
- 파일별 역할과 관계 무결성 규칙은 [`미국 소형주 이벤트 데이터 관리 기준`](./us-smallcap-event-data-contract.md)에 정의했다. JSON의 요약 집계는 validator가 원시 event·filing 행과 대조한다.
- 데이터베이스/API에는 쓰지 않았다. 운영 서버에는 공개 GET만 호출했다.

## 원문 확인 이벤트

### 추가 원문 확인 배치 43 — MNDR 이벤트 분리 및 근거 재검증

- 운영 공개 GET `2026-10-31T08:14:47.736Z`: HTTP 200, NAS enabled `COMMON_STOCK`, USD 시총 $835,276(기초 관측 `2026-10-30T07:18:51.843Z`), RSS 4건, SEC 분류 이벤트 0건. DB write 없음.
- SEC 6-K `0001493152-26-044212`: 2026-09-22 이사회가 6명의 이사·임원 FY2027 보상으로 Class A 1,980,000주와 Class C 500,000주의 allotment/issuance를 승인. deed상 이전 제한. 개별 배분, deed 세부조건, 실제 발행 완료는 미공개. 기존 JSON에 붙어 있던 NEXR 역분할 근거와 위험을 제거하고 이 6-K 직접 인용으로 교체.
- SEC 20-F `0001493152-26-049341`: FY2026(2026-06-30 종료) 매출 $7,741,187(+1.2%), 총이익 $1,642,784(+28.3%), 순손실 $3,187,380(전년 순손실 $3,383,806 대비 손실 5.8% 감소). 역사적 실적 이벤트로 분리; SEC 20-F에 출시 일정은 없음.
- 발행사 보도자료 `NEWSFILE:321779`(2026-10-30 12:10Z): MaNaDr Health Operating Ecosystem의 싱가포르 첫 출시일을 2026-11-02로 공지하고, 이후 두 달 단계적 글로벌 롤아웃을 계획. 현지 규제·면허, 통합 준비, 서비스 가용성 조건이 붙으며 시각·고객수·수익 목표는 미공개. `CONFIRMED_SCHEDULED`로 저장하고 운영 완료와 구분.
- 검토 이벤트 원장, SEC 제출 ledger, canonical market events 간 accession/event ID를 일치시켰다. 2개 SEC 제출물을 `FULL_PRIMARY_REVIEW`로, 세 이벤트 레코드를 직접 검토로 표시. 미국 이벤트 124건, 전체 import input 125건(KR 포함), pending 65건/55개 발행사, 직접 검토 발행사 47/100. Filing ledger 상태는 실제 accession 행에서 재계산했다. (이 배치 당시 집계; 최신 누계는 배치 44.)
- 미국 100개 발행사 조사창 내 모든 제출물의 전수 본문 리뷰는 아니다. 출시 후 실제 가용성, regulatory clearance, 상업적 성과와 보상주 발행 완료는 미확인.

### 추가 원문 확인 배치 44 — EDVA 연례·특별주총 및 ELOC

- 운영 공개 GET `2026-10-31T08:21:24.744Z`: HTTP 200, NYSE American active `COMMON_STOCK`, USD 시총 $1,940,142(기초 관측 `2026-10-30T07:19:39.766Z`), RSS 8건, SEC 분류 이벤트 0건. DB write 없음.
- SEC DEF 14A `0001731122-26-001316` 및 DEFA14A `0001731122-26-001326`: 2026-11-20 10:00 a.m. EST(11/21 00:00 KST) 온라인 연례주총. DEFA14A가 notice에 인쇄한 9/28 record-date 오류를 정정해 실제 record date는 10/2. 표결은 이사 4명, 감사인 추인, say-on-pay, 2025 plan reserve/automatic maintenance/option exchange, 임원·이사 RSU, 연기안 등 6건. Proposal 5는 완전희석의 20%(proxy summary 약 4,029,561주) 및 automatic maintenance grants를 제안하며 proxy는 잠재적으로 지속·상당한 희석과 수혜자 이해상충을 명시한다. 8명별 RSU 수량을 합산하면 4,075,561주로 summary보다 46,000주 많아 공시 내부 불일치를 기록했다. 온라인 투표 마감 11/19 11:59 p.m. EST(11/20 13:59 KST). 결과는 미확정.
- SEC PRE 14A `0001731122-26-001369`: 2026-12-07 10:00 a.m. EST(12/8 00:00 KST) 특별주총, record date 10/30. 예비 안건은 Series D/전환어음 연계 12,683,908주 발행, ELOC 최대 20,000,000주 최초 발행, 수권 보통주 800,000,000주로 확대, 이사회 재량 1:2~1:49 역분할, 연기안이다. SEC preliminary proxy가 밝힌 NYSE American 제한에 따라 역분할은 2027-03-28 전 실시 불가. 수권 증가, 발행 승인, 실제 발행 및 reverse split을 각각 구별한다.
- SEC 8-K `0001731122-26-001375` 및 Exhibit 10.1: 10/22 ELOC addendum가 과거 판매액 포함 총 최대 약정을 $35M에서 $135M으로 상향. 이후 sales terms 개정. SEC S-1 `0001731122-26-001378` targeted review에서는 최대 1,013,041 potential resale shares와 계약·effective-registration 조건 충족 후 발행사 재량에 따른 최대 $29,800,324 gross proceeds를 확인했다. S-1은 subject to completion; 실매각·실제 유입·발행은 미확인이다.
- 5개 filing 중 4개는 FULL_PRIMARY_REVIEW, S-1은 일정/판매조건·Use of Proceeds targeted section review로 기록. annual DEF, correction DEFA, special PRE와 ELOC event를 개별 ID로 ledger 연결했다. 배치 후 미국 이벤트 125건, 전체 import input 126건(KR 포함), 복구 대기 63건/54개 발행사, 직접 검토 48/100. Filing status count는 accession별 세부 ledger에서 재집계.
- cutoff 2026-10-31 기준 회의 표결·ELOC 인출·S-1 효력 및 거래·전환/주식 발행·이사회 역분할 비율/시행은 미래 또는 조건부 상태다.

| 티커 | 일정 및 상태 | 원문 식별자 | 정량·시간 정보 |
|---|---|---|---|
| ZNB | 8:1 병합 — 7/27 법적 효력 발생 | SEC 6-K 0001213900-26-099698 | Class A/B 각 8주→1주. Nasdaq 조정 거래 개시시각 및 발행·유통주식 수는 이 원문에서 확인되지 않음. 수권자본 감소를 실제 발행주식 감소로 간주하지 않음. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1747661/000121390026099698/ea0304940-6k_zeta.htm) |
| ZNB | 추가 8:1 병합 권한 — 조건부 승인, 시행일 미정 | SEC 6-K 0001213900-26-099698 | 9/10 주주총회 승인. 선행 자본재편 효력 및 Nasdaq notification·시장 효력일 확인·무이의·공시가 필요. 2027-09-10까지 통지 조건 미충족 시 결의 소멸; 이 날짜는 병합 예정일이 아님. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1747661/000121390026099698/ea0304940-6k_zeta.htm) |
| GNLN | 4개 자회사 채권자 이익 양도 및 Florida 법원 절차 | SEC 8-K 0001493152-26-047256 | 자산양도 9/30, 법원 청원·자산 관할 10/9. 사건번호 2026-020549-CA-01~2026-020552-CA-01. 10/15 기준 통합 미완료·판사 미배정. 절차는 자회사 4곳 대상이며 모회사 파산으로 단정하지 않음. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1743745/000149315226047256/form8-k.htm) |
| CSAI | $63,332.50 약속어음 분할·18,246주 교환 합의 — 최종교환 미확인 | SEC 8-K 0001683168-26-007556, Ex. 10.1 | 9/28 합의; 기존 $1,299,870 어음 잔액을 분할액만큼 감액. 주식 인도는 9/30까지 약정, note 취소·교환효력은 Free Trading Date 조건. 실제 완료 미확인. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1709628/000168316826007556/cloud_8k.htm), [교환계약](https://www.sec.gov/Archives/edgar/data/1709628/000168316826007556/cloud_ex1001.htm) |
| MNDR | 이사·임원 6인 FY2027 보상 주식 배정·발행 승인 — 9/22 이사회 승인 | SEC 6-K 0001493152-26-044212 | Class A 1,980,000주+Class C 500,000주를 6명에게 보상용으로 allot/issue 승인. 이전제한 deed 적용. 개인별 배분·deed 전문·제한기간·실제 발행 완료 여부는 6-K에서 확인되지 않음. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1976695/000149315226044212/form6-k.htm)
| XXII | ATM 공모 보충설명서 — 판매 대리인 추가 | SEC 8-K 0001493152-26-048795 및 424B5 0001493152-26-048792 | 10/28 Clear Street를 기존 sales agreement 판매 대리인으로 추가. 424B5의 최대 $18.8M은 기존 공모 설명이며 이번 변경으로 새로 추가된 한도가 아님. 실제 매각액 미확인. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1347858/000149315226048795/form8-k.htm), [SEC 424B5](https://www.sec.gov/Archives/edgar/data/1347858/000149315226048792/form424b5.htm) |
| KIDZ | $1.9M 선순위 담보 전환사채 추가 종결 — 완료 | SEC 8-K 0001477932-26-005667 | 9/17 발행, 연 7%, 2028-09-17 만기, 최초 전환가 $3.672(조정 가능). 최종 전환주식 수 미확정. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/2022308/000147793226005667/kidz_8k.htm) |
| IMCC | 유럽 중심 운영 자회사 매각 종결 — 관련자 거래 | SEC 6-K 0001178913-26-004699, Ex. 99.1 | 9/29 종결. 대가는 선지급 C$3M 및 매수자의 지분 인수. 잔존부채 C$9.4M 한도는 대상 자회사 직접부채 제외. 매수자는 CEO 소유·지배 관련자. C$3M 자본개선은 회사의 미감사 추정. [SEC 발표자료](https://www.sec.gov/Archives/edgar/data/1792030/000117891326004699/exhibit_99-1.htm) |
| MTNB | 1:15 역분할 — 법적 효력 완료 | SEC 8-K 0001493152-26-044451 | 9/28 00:01 EDT(13:01 KST) 효력. 조정거래는 NYSE American 승인 조건부 예상으로 별도 확인되지 않음. 전후 발행·유통주식 수 공시 미확인. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1582554/000149315226044451/form8-k.htm) |
| YFOR | ATM 희석·의결권 및 후속 이벤트 8건 | 6-K 010827, 424B5 010847, 인수 6-K 010382/6-K/A 010744 및 발행사 GNW 3371329·3373000·3380142·3388177·3390749·3391852 | ATM $20M은 gross 한도·미매각 보장 아님. acquisition 완료 8/3; 10월 IFM 계약은 MONTH 일정; 11월 humanoid 계획은 PART_OF_MONTH EARLY; FY27 매출 $20M은 목표; 11대 로봇 24개월 계약은 운영 개시/검수 완료와 구분; Bizcap 25% loan 2027-04-08 만기, Ault note $1,366,452.50 12/31 상환은 ATM 자금 사용 계획. 실제 ATM 매각·서비스 매출·비용절감·로봇 성과·부채상환은 미확인. [SEC ATM 6-K](https://www.sec.gov/Archives/edgar/data/1985337/000121390026106827/ea0307632-6k_yyforce.htm), [SEC 424B5](https://www.sec.gov/Archives/edgar/data/1985337/000121390026106847/ea0307644-424b5_yyforce.htm), [회사 계약 발표](https://www.globenewswire.com/news-release/2026/09/29/3371329/0/en/yyforce-secures-s-15-96-million-in-new-multi-year-singapore-facility-services-contracts.html), [11대 로봇 발표](https://www.globenewswire.com/news-release/2026/10/29/3391852/0/en/yyforce-deploys-11-commercial-hospitality-robots-at-novotel-mercure-singapore-on-stevens.html) |
| UK | 2026-11-09 임시주총 — 조건부 역분할·수권자본 증가안 표결 (CONFIRMED_SCHEDULED) | SEC 6-K 0001213900-26-107735, Ex. 99.1·99.2 | 10:00 Beijing = 11:00 KST = 2026-11-08 21:00 EST. 표결 전 안건이며, 가격 trigger는 Nasdaq 공식 종가 bid가 3거래일 연속 $1 미만. 충족 시 10:1·8:1·6:1·4:1·3:1·2:1 중 publicly held shares 500,000주 이상을 남길 것으로 예상되는 가장 높은 비율 선택; 2:1도 미달이면 추가 이사회·주주 승인 없이 시행 불가. 수권자본 증가는 발행이 아님. [SEC 발표자료](https://www.sec.gov/Archives/edgar/data/1821424/000121390026107735/ea030805301ex99-1.htm), [SEC 주총 통지](https://www.sec.gov/Archives/edgar/data/1821424/000121390026107735/ea030805301ex99-2.htm) |
| IZM | 5:1 주식병합·Nasdaq 조정 거래 — 완료 | SEC 6-K 0001213900-26-099005, Ex. 99.1 | 9/15 Nasdaq 장 개시 효력; Class A 8,188,610→약 1,637,722주, Class B 3,829,500→약 765,900주(발행·유통주식 수, public float 아님). 단주 처리는 1주 지급으로 공시되어 최종 수량은 조정될 수 있음. [SEC 발표자료](https://www.sec.gov/Archives/edgar/data/1854572/000121390026099005/ea030516701ex99-1.htm) |
| SQFT | Series D 교환청약 결과 — 예정 결제·실제 발행 미확인 | SEC 8-K 0001493152-26-045704, 최종 Schedule TO/A 0001493152-26-045707, 관련 425 0001493152-26-045706 | 10/2 23:59 ET 만료. 우선주 149,773주(973,736주의 15.4%) 수락; 비율 5.5:1, 보통주 823,753주 발행 예상. settlement는 10/6 전후 목표였으나 실제 결제·발행 완료는 확인되지 않음. 운영 GET 11/2 HTTP 200, NAS 활성 COMMON_STOCK, cap $1,204,921(10/30 관측), RSS 1, SEC classified events 0, DB 미기록. [SEC 발표자료](https://www.sec.gov/Archives/edgar/data/1080657/000149315226045704/ex99-1.htm), [최종 Schedule TO/A](https://www.sec.gov/Archives/edgar/data/1080657/000149315226045707/formscto-ia.htm) |
| KAPA | ENV-105 Phase 2 중간 효능 결과 및 프로토콜 변경 — 보고됨 | SEC 8-K 0001493152-26-045844, Ex. 99.1 | 10/6 발표. mCRPC 병용군 중앙 PFS 17.7개월 대 apalutamide 단독 2개월, P=0.0008(발행사 발표). 등록 수·사전 지정 주요 평가변수·신뢰구간은 해당 자료 미공개. 프로토콜 변경 후 시험완료 목표는 2027 Q4 이전 또는 중. [SEC 발표자료](https://www.sec.gov/Archives/edgar/data/1962011/000149315226045844/ex99-1.htm) |
| DXST | 노인돌봄 서비스 수수료 현금 회수 약 $3M — 회사 보고 마일스톤 | SEC 6-K 0001185185-26-004858, Ex. 99.1 | 9월 이후 회수액이라고 10/20 발표. 회사는 내부 재무기록과 은행거래 대조를 근거로 설명. 감사 매출·순이익 또는 반복 현금흐름으로 간주하지 않음. [SEC 발표자료](https://www.sec.gov/Archives/edgar/data/1958133/000118518526004858/dxstex99-1.htm) |
| MLEC | 자발적 청산 특별결의·공동청산인 선임 승인 — 청산절차 진행 | SEC 6-K 0001213900-26-111414 | 10/20 09:00 EDT(22:00 KST), quorum 1,408,171/2,080,437주(67.686%), 청산/선임 안건 약 98.4% 찬성. 표결 완료이지 분배·해산 완료가 아님. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1937737/000121390026111414/ea0309327-6k_moolec.htm) |
| MLEC | PwC 독립감사인 해임 — 10/21 효력 | SEC 6-K 0001213900-26-111414, Ex.99.1 | 청산 승인 후 감사인 계속 선임이 불필요하다는 이유. PwC는 공시 진술에 동의; 회사는 회계 이견 없음, 기존 PPA 내부통제 material weakness 및 FY2025 going-concern explanatory paragraph를 별도로 공시. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1937737/000121390026111414/ea0309327-6k_moolec.htm), [PwC 서한](https://www.sec.gov/Archives/edgar/data/1937737/000121390026111414/ea030932701ex99-1.htm) |
| IPST | Nasdaq 정기보고 적시제출 요건 회복 및 사안 종결 | SEC 8-K 0001788230-26-000091 | 10/26 Nasdaq이 10-Q 적시제출 요건(5250(c)(1)) 회복을 통지하고 해당 건을 종결. 다른 상장요건과 구별. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1788230/000178823026000091/ipst-20261026.htm) |
| GSUN | Class A 주주 특별회의 — Class B 표결권 확대안 | SEC 6-K 0001213900-26-111081, Ex. 99.1 | 11/23 09:00 Beijing = 10:00 KST = 11/22 20:00 EST. Class B 1주당 50표→100표 변경 제안. 결과 미정. [SEC 위임장](https://www.sec.gov/Archives/edgar/data/1826376/000121390026111081/ea030921101ex99-1.htm) |
| GSUN | 연례주총 — 이사·감사인 재선임 및 주식병합 안건 | SEC 6-K 0001213900-26-111081, Ex. 99.3 | 11/23 10:00 Beijing = 11:00 KST = 11/22 21:00 EST. 1대10 주식병합도 표결 예정. [SEC 위임장](https://www.sec.gov/Archives/edgar/data/1826376/000121390026111081/ea030921101ex99-3.htm) |
| GSUN | 제안 1대10 병합 효력 목표일 — 11/23 주총·종류별 동의 조건 | SEC 6-K 0001213900-26-111081, Ex. 99.3 | 12/23 목표 효력. 승인 시 수권 Class A 180M→18M, Class B 20M→2M; 이는 수권주식 수이며 발행·유통주식 수가 아님. [SEC 위임장](https://www.sec.gov/Archives/edgar/data/1826376/000121390026111081/ea030921101ex99-3.htm) |
| SDST | Nasdaq 거래정지·상장폐지 예정 통지 — 실제 이행 미확인 | SEC 8-K 0001493152-26-047607 | 10/23 개장 예정(09:30 EDT = 22:30 KST); 청문요청 마감 10/23 16:00 EDT = 10/24 05:00 KST. 청문 요청은 거래정지를 유예하지 않는다고 공시. 10/31 운영마스터 활성 상태만으로 Nasdaq 거래 여부를 확정하지 않음. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1831979/000149315226047607/form8-k.htm) |
| SDST | CFO 사임 예정일 — 10/23, 효력 후속 확인 미완료 | SEC 8-K 0001493152-26-047607 | 10/14 사임 통지, 효력일은 10/23 예상이라고 공시. 후임 및 실제 사임 효력 미확인. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1831979/000149315226047607/form8-k.htm) |
| LHSW | 1대8 병합·조정 거래 — 완료 | SEC 6-K 0001213900-26-114516, Ex. 99.1 | 10/26 Nasdaq 장 개시부터. Class A 22,878,354→약 2,859,795주, Class B 2,587,500→약 323,438주. 발행주식 수이며 유통주식 수가 아님. [SEC 부속자료](https://www.sec.gov/Archives/edgar/data/2004024/000121390026114516/ea031041101ex99-1.htm) |
| LHSW | 말레이시아 80대 AI 도장로봇·영국 첫 주문 | SEC 6-K 0001213900-26-114516, Ex. 99.2 | 말레이시아 계약 RMB23.84M, 배치별 납품; 영국 1대 계약 금액·납품일 미공개. [SEC 부속자료](https://www.sec.gov/Archives/edgar/data/2004024/000121390026114516/ea031041101ex99-2.htm) |
| RUBI | 1대25 역분할 — 10/30 Nasdaq 개장 효력·조정거래 확정 | SEC 6-K 0001171843-26-006911, Ex. 99.1; Nasdaq ECA #2026-775 | 10/30 개장 split-adjusted 거래, CUSIP Y1250N305. 10/28 발행주식 13,517,355→회사 예상 약 540,694주(단주 현금정산 조정 가능); 유통주식 수 미확인. [SEC 부속자료](https://www.sec.gov/Archives/edgar/data/1943421/000117184326006911/exh_991.htm), [Nasdaq ECA](https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2026-775) |
| OLOX | 미사용 ELOC 해지와 298,604주 종료대가 | SEC 8-K 0001213900-26-113934, Ex. 10.1 | 계약 효력 10/27; 14번째 영업일까지 초기주식 발행. 2027-04-27 전 10일 VWAP<$0.80이면 최소 $258,440 가치 보전용 추가주식 조건. [SEC 계약](https://www.sec.gov/Archives/edgar/data/1023994/000121390026113934/ea031017701ex10-1.htm) |
| WETO | 수권자본 1,000만주→2조주 확대 안건 승인 | SEC 6-K 0001213900-26-112615 | 8/24 총회 승인; 추가 수권주식 1,999,990,000,000주. 실제 발행량 아님. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1941158/000121390026112615/ea0309657-6k_wetour.htm) |
| PAPL | Pentiv mortgage intelligence 플랫폼 출시 — 10/15 | SEC 8-K 0001493152-26-047167, Ex.99.1 | 제품 출시 발표 완료; 초기 agents는 Pineapple+에서 운영. 외부 고객 adoption·매출은 미공개/향후 목표. [SEC 발표](https://www.sec.gov/Archives/edgar/data/1938109/000149315226047167/ex99-1.htm) |
| PAPL | CFO·CSO 선임 및 재무책임자 전환 — 10/15 효력 | SEC 8-K 0001493152-26-047167 | Usman Maher 임명, Syed Habib CAO/Controller 전환. 연봉 $250K(10/1 발생), 보너스 목표 100%(50–150%), equity는 승인 조건. Habib 전환은 회사와 의견차 때문이 아님. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1938109/000149315226047167/form8-k.htm) |
| PAPL | Pentiv 전략 재편 특별위원회 구성 — 검토 진행 중 | SEC 8-K 0001493152-26-047167 | 10/9 독립이사 4인 위원회 구성. 관련자 성격 요소가 있는 비구속 term sheet와 잠재 mortgage brokerage spin-off 등 평가; 계약·승인 전 제안 단계. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1938109/000149315226047167/form8-k.htm) |
| PAPL | PTIV 티커 변경 — on/about 10/26 목표 경과, 미확인 | SEC 8-K 0001493152-26-047167 | 10/15 회사 목표일은 10/26 전후. 10/31 운영 master는 PAPL active, PTIV lookup null. 실제 거래소 효력 확인되지 않아 완료 처리하지 않음. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1938109/000149315226047167/form8-k.htm) |
| PAPL | 법인명 Pentiv Inc 변경 제안 — 주주승인/일정 미정 | SEC 8-K 0001493152-26-047167 | PTIV 티커 변경과 별도 절차. 미래 주주 승인 필요, 회의/효력일 미공개. |
| CIIT | 자회사 Enterprise AI 플랫폼 개발계약 | SEC 8-K 0001683168-26-007903 | 자회사 2곳이 Linknex와 개발 계약. SOW의 범위·마일스톤·검수기준은 추후 보완. 대가 US$146,700+보통주 180,000주이며 Nasdaq 상장 후 20영업일 이내 발행 조건. 납품·지급·발행 완료는 미확인. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1557798/000168316826007903/tianci_8k.htm) |
| LBGJ | Yufengyuan 지분양수도 계약 종료 — 인수는 종결되지 않았고 종결되지 않을 예정 | SEC 6-K 0001493152-26-046533, Ex.10.1 | 10/8 효력 종료. 양측은 definitive understanding에 미도달했고 계약 전체 종료, 상호 추가 책임/의무 면제; breach-liability 조항 비존속. 거래 대가·이미 지급액 공개 안 됨. 운영 GET 11/2 HTTP 200, NAS 활성 COMMON_STOCK, 시총 $975,626(10/30 관측), RSS 2, classified SEC events 0, DB 미기록. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1896425/000149315226046533/form6-k.htm), [해지서](https://www.sec.gov/Archives/edgar/data/1896425/000149315226046533/ex10-1.htm) |
| ELPW | EGM에서 BVI 법인전환 안건 승인 — 완료(법적 효력·동의는 별도) | SEC 6-K 0001493152-26-049441 | 10/30 10:00 Beijing = 10/30 11:00 KST = 10/29 22:00 EDT. 모든 안건 승인; Cayman deregistration 및 BVI continuation은 필요한 정부·규제 동의 조건부이고 효력일 미확인. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2015691/000149315226049441/form6-k.htm) |
| EDBL | Prairie Hills RTD 제조시설 부동산 취득 — 종결 | SEC 8-K 0001477932-26-006550 | 10/30 종결, 총 $6.325M. 우선주 평가액 $2.5M과 5년 담보어음 $3.825M(연 8%, 일복리) 포함. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1809750/000147793226006550/edbl_8k.htm) |
| GOVX | 주주, 1대10~1대25 역분할 권한 승인 — 이사회 비율·실행 미정 | SEC 8-K 0001437749-26-033610, Item 5.07 | 찬성 3,484,374·반대 828,802·기권 12,837. 실제 시행·효력·조정거래일 미정. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/832489/000143774926033610/govx20261027_8k.htm) |
| GOVX | 기존 8월 워런트의 기초 보통주 최대 11,395,256주 발행 승인 — 행사/발행 미확인 | SEC 8-K 0001437749-26-033610, Item 5.07 | 찬성 1,492,403·반대 458,659·기권 44,131; broker non-votes 2,330,820. 8/28 발행주식 9,093,871 대비 상한의 산술비 125.3%이나 실제 희석률/행사 완료가 아니다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/832489/000143774926033610/govx20261027_8k.htm) |
| IPDN | 146,713주 사모 — 11/3 전후 종결 추정 (ESTIMATED) | SEC 8-K 0001437749-26-033122; Form D 0001437749-26-033645 | $1.704/주, 총 gross $249,998.952, 10/14 종가의 60%. 8-K는 기업·규제 승인 및 Nasdaq 심사 등 종결조건이 남았다고 했고, Form D는 total sold $249,999/remaining $0로 표시하면서 clarification에 closing ~11/3을 기재했다. 표현 차이가 있어 완료로 분류하지 않았다. 워런트·옵션·전환증권·계약상 등록권은 없다고 보고. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1546296/000143774926033122/ipdn20261021_8k.htm), [SEC Form D](https://www.sec.gov/Archives/edgar/data/1546296/000143774926033645/xslFormDX01/primary_doc.xml) |
| IPDN | 2026-01-27 — 서비스 일부 대가로 106,753주 발행 (REPORTED) | SEC Form D 0001437749-26-033805 | 2026-01-20 Software Development and Operation Master Service Agreement의 partial consideration으로 1/27 보통주 106,753주를 발행했다고 회사가 10/28 Form D에서 보고. Item 13 offering/sold $120,000, remaining $0. 이는 별도 계약이며 11월 사모발행과 혼합하지 않았다. SEC는 Form D 기재정보를 반드시 검토·확인하지 않는다고 고지. [SEC Form D](https://www.sec.gov/Archives/edgar/data/1546296/000143774926033805/xslFormDX01/primary_doc.xml) |
| CHGA | 특별주총 17개 안건 승인 (COMPLETED; 승인, 실제 발행과 별도) | SEC 8-K 0001213900-26-114381, Items 1.01·5.07 | 10/30 표결, 정족수 406,853주. 승인: ELOC·46,297주 워런트·미래 20% 발행·노트 전환·18,000 forbearance 주식·수권주식 100M→125M·컨설턴트 92,500주·pre-funded warrant 234,000주 기초·MFN 15,000주·인센티브 예비분 100,000→500,000주 등. 승인은 실제 발행/전환 완료를 뜻하지 않는다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1630212/000121390026114381/ea0309957-8k_change.htm) |
| SPRC | 기존 워런트 405,728주 현금행사 유도 — 10/27 전후 종결 추정, 확인 미완료 | SEC 6-K 0001213900-26-112470 | 행사가 $1.00, 회사 예상 총액 약 $405,728. 예정일 경과; 확인된 후속 종결 공시 없음. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1611746/000121390026112470/ea0309686-6k_scisparc.htm) |
| SILO | 소프트웨어·IP 취득 대가 150,000주 발행 — 보고 | SEC 8-K 0001213900-26-109457 | 계약일 10/13, 보통주 150,000주, 양도제한은 12개월 또는 지정 조기종료 사유까지. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1514183/000121390026109457/ea0308562-8k_silo.htm) |
| VRAX | 연구용 면역프로파일 제품 중국 비독점 유통계약 3건 | SEC 6-K 0001193125-26-437018 | 6개 본토 시장 유통; ELISpot·항원특이 펩타이드 제품. 매출·최소구매량 미공개. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1885827/000119312526437018/6-k_10.29.26_china_distr.htm) |
| SXTC | 등록공모 추가 매수권 종료 발표 — 최대 $12M 옵션 종료 | SEC 6-K 0001213900-26-111404, Ex. 99.1 | 10/21 종료 letter 발표. SPA §2.4상 공모 종결 후 30일 동안 매수자에게 부여된 추가 최대 $12M Class A/PFW 매수 선택권을 전면 종료. 기존 발행 증권은 영향 없음. 종료 효력일 및 종료 전 추가 매수/행사분은 발표문에서 미확인. [SEC 부속자료](https://www.sec.gov/Archives/edgar/data/1723980/000121390026111404/ea030919801ex99-1.htm)
| RCON | 연례주주총회 — 확정 예정 | SEC 6-K 0001104659-26-120073, Ex. 99.1 | 12/4 오전 10시 Beijing = 11:00 KST = 12/3 21:00 EST. 이사·감사인, 자본금 조정·주식병합 권한 등 표결. [SEC 부속자료](https://www.sec.gov/Archives/edgar/data/1442620/000110465926120073/tm2628511d1_ex99-1.htm) |
| TRUG | 6/30 주주자본 요건 미달 — 역사적 기준치 | SEC 8-K 0001493152-26-047953, Item 8.01 | 6/30 주주자본 $2,060,281, Nasdaq 기준 $2.5M보다 $439,719 부족. 이후 상태는 별도 회복보고 참조. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1857086/000149315226047953/form8-k.htm) |
| TRUG | Polymath 인수 및 Series B 조달 후 Nasdaq 주주자본 요건 회복 — 회사 판단·Nasdaq 감시 계속 | SEC 8-K 0001493152-26-047953, Item 8.01 | 10/9 인수대가로 Class A 257,494주·Series C 전환우선주 136,956주 발행; 10/8 Series B 3,278주 exercise 대가 $2.95M, 추가 Series B 워런트 3,000주. 회사는 10/21 현재 회복했다고 믿는다고 보고, Nasdaq은 다음 정기보고까지 감시하며 재미달 시 delisting 가능 통지. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1857086/000149315226047953/form8-k.htm) |
| GNPX | Meharry 후원연구 GSA 포스터 발표 예정 (CONFIRMED_SCHEDULED) | SEC 8-K 0001437749-26-033700 | 11/4 18:00–19:15 EST = 11/5 08:00–09:15 KST, Gaylord National Resort & Convention Center Exhibit Hall C-D. Late Breaking Poster Session I, 제목 “TUSC2 Gene Therapy in Humans Induces a Cellular-Resilience Program”, Abstract 2489375. 발표 일정이지 임상 효능 입증/FDA 일정이 아니다. 회사는 추가 연구가 필요하다고 기재. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1595248/000143774926033700/gnpx20261021_8k.htm) |
| FGL | Nasdaq 공개유통주식 최소요건 회복 — 회사 발표 | SEC 6-K 0001213900-26-111870, Ex. 99.1 | Nasdaq 10/19 통지 수령; 해당 공개유통주식 요건 회복. 다른 상장요건까지 보장하지 않음. [SEC 부속자료](https://www.sec.gov/Archives/edgar/data/1989930/000121390026111870/ea030949301ex99-1.htm) |
| SHFS | 1대12 역분할 — 완료 | SEC 8-K 0001493152-26-045183 | 9/29 00:01 ET 효력. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1854963/000149315226045183/form8-k.htm) |
| SHFS | 최소호가 추가 회복기한 — 확정 | SEC 8-K 0001493152-26-047774 | 2027-04-19까지 10거래일 연속 종가 $1 이상 요구. 미달 시 상장폐지 통지 가능. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1854963/000149315226047774/form8-k.htm) |
| SHFS | Opifex 비구속 사업결합 텀시트 — 제안 단계 | SEC 8-K 0001493152-26-048425, Ex. 99.1 | 제안상 Opifex 85%/기존 Safe Harbor 이해관계자 15%(fully diluted, 추가 조달 전); Opifex 가치 최소 $50M. 확정계약·실사·승인 등 미완료. [SEC 부속자료](https://www.sec.gov/Archives/edgar/data/1854963/000149315226048425/ex99-1.htm) |
| SHFS | Series B 전환으로 보통주 60,570,250주 발행 — 완료 보고 | SEC 8-K 0001493152-26-049470 | 10/24~10/30 전환, 전환가 $0.1210, 10/30 발행주식 85,512,985주. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1854963/000149315226049470/form8-k.htm) |
| RBNE | 1,800만 달러 LPG 운반선 인수계약 — 종결 전 | SEC 6-K 0001140361-26-040600, Ex. 99.1 | 2015년 건조 5,000 cbm 선박; 매도자는 CEO 지배회사 AI OKTO. 독립이사 특별위원회 관여; 종결 조건 존재. [SEC 부속자료](https://www.sec.gov/Archives/edgar/data/2039060/000114036126040600/ef20084329_ex99-1.htm) |
| SBFM | 최대 2,040만 달러 공모 종결 — 완료 | SEC 8-K 0001683168-26-007758, Ex. 99.2 | 선행 총조달 약 $6.0M; 워런트 전량 행사 시 추가 최대 약 $14.4M 가능(확정 조달 아님). [SEC 부속자료](https://www.sec.gov/Archives/edgar/data/1402328/000168316826007758/sunshine_ex9902.htm) |
| VIVK | Direct Midstream $40M 비구속 LOI — 거래 미종결 | SEC 8-K 0001829126-26-010995, Ex.99.1 | 대상 100% 지분 제안; $40M gross price는 2027 목표 FCF $10M의 4배(회사 $10M 투자 가정). 종결 시 투자는 seller consideration에서 차감, debt/NWC 조정 전 약 $29M Series B preferred+$1M common 제안; actual FCF에 따라 gross price $30M–$50M 조정. 실사·투자재원·fairness opinion·definitive agreement 등 조건. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1450704/000182912626010995/vivakorinc_8k.htm) |
| VIVK | Second Note 전환 — $350K amount due를 보통주 128,965주로 발행 | SEC 8-K 0001829126-26-010995 | 10/5–10/6 전환 통지 및 주식 발행 완료. amount due를 principal로 단정하지 않음; note 잔액 미산출. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1450704/000182912626010995/vivakorinc_8k.htm) |
| VIVK | Direct Midstream 실사 완료 — 최종계약 협상 중 | Vivakor/GlobeNewswire 2026-10-23 (ID 3387265) | 실사 완료 milestone은 발표됐지만 당사자들이 definitive agreement를 마무리 중이며 서명·인수 종결 모두 미보장. [회사 보도자료](https://www.globenewswire.com/fr/news-release/2026/10/23/3387265/0/en/vivakor-completes-direct-midstream-due-diligence-advancing-proposed-40-million-acquisition-toward-definitive-agreement.html) |
| MYSZ | 전 임원 퇴임 — 10/31 효력 | SEC 8-K 0001493152-26-048519 Item 5.02 | Chief Growth Officer 및 Naiz Executive Director 직위 종료. 회사는 운영·정책 이견에 따른 퇴임이 아니라고 공시. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1211805/000149315226048519/form8-k.htm) |
| MYSZ | 전 임원 합의금 €433,150.68 지급의무 — 일부 현금 일정·잔액 협상 | SEC 8-K 0001493152-26-048519 Item 5.02 | 회사/Naiz 연대의무; €125,000은 2026-11~2027-08 분할, €308,150.68은 계획 협상 중/미합의 시 2027-08-18 만기. 잔액 현물지급 가능, 미지급 이자·가속조항, 청구권 release 없음. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1211805/000149315226048519/form8-k.htm) |
| MYSZ | 최대 $100M shelf S-3 제출 — 효력·판매 미확인 | SEC S-3 0001493152-26-048526 | 보통주·채무증권·워런트·유닛 등록 신청; 효력 발생 후 개별 supplement와 함께 판매 가능. 신청액을 조달액/현금으로 보지 않음. [SEC S-3](https://www.sec.gov/Archives/edgar/data/1211805/000149315226048526/forms-3.htm) |
| FCHL | 2026-11-12 10:00 Singapore — 연례주주총회 예정 (CONFIRMED_SCHEDULED) | SEC 6-K 0001493152-26-049280; 6-K/A 0001493152-26-049350 | 11:00 KST = 2026-11-11 21:00 US Eastern Standard Time(EST). 총회 개최 일정은 공지됐지만 표결 결과는 미확정이다. 6-K/A는 교체 투표카드를 제출했다. [SEC 6-K Exhibit 99.2](https://www.sec.gov/Archives/edgar/data/2023796/000149315226049280/ex99-2.htm), [SEC 6-K/A Exhibit 99.4](https://www.sec.gov/Archives/edgar/data/2023796/000149315226049350/ex99-4.htm) |
| FCHL | 2026-11-12 주총 표결 — 2:1 병합 및 조건부 추가 100:1 병합 제안 (REPORTED) | SEC 6-K 0001493152-26-049280 | 첫 2:1은 주주 승인과 Nasdaq 통지·공시 후 가능한 시점의 시장 효력일 개장부터; 별도 100:1 제안은 첫 병합 효력, 2026-12-15까지 F-1 공모 총액 최소 US$5m 수령, Nasdaq 통지·공시가 필요하며 조건 미충족 시 소멸한다. 주식 수와 조정거래일은 미확인. [SEC Notice/Proxy Exhibit 99.2](https://www.sec.gov/Archives/edgar/data/2023796/000149315226049280/ex99-2.htm) |
| SGRX | 128-GPU 서버 16대 인도 — 회사 계획, 일정 추정 | SEC 6-K accession 0001104659-26-116630, Exhibit 99.1 | 2026-11-03이 포함된 주간 인도 계획. 정확한 날짜·시각 미공개. 검사·설치·시험에 약 1주 추가 예상; 상업운영은 시운전과 계약상 수락 조건에 달림. [SEC Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1735556/000110465926116630/tm2627763d1_ex99-1.htm), [발행사 보도자료](https://www.globenewswire.com/news-release/2026/10/16/3382608/0/en/sangrix-announces-november-2026-delivery-schedule-for-128-gpu-nvidia-blackwell-b300-project-in-malaysia.html) |
| SGRX | 전환사채 $3.3M 원금+$209,807 이자 전환 — 2,153,257주 발행 | SEC 6-K 0001104659-26-120695 | 9/30~10/16 전환, Class A 주당 $1.63. 발행 완료 보고이며 잔존 note 잔액은 미확인. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1735556/000110465926120695/tm2628575d1_6k.htm) |
| SGRX | 회장·CEO에 Class B 75,000주 발행 — 총 의결권 약 35% | SEC 6-K 0001104659-26-118168, Exhibit 10.1 | 10/21 발행 완료; 주당 $0.4390, 합계 $32,925. 매수자는 발행 Class B 전량 및 총 의결권 약 35%를 보유한다고 공시. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1735556/000110465926118168/tm2628072d1_6k.htm) |
| SGRX | 11/3 임시주총 — 8:1 병합 표결, 제안 효력일 11/13 | SEC 6-K/A 0001104659-26-118863, Exhibit 99.1 | 8:00 a.m. EST = 9:00 p.m. Singapore = 22:00 KST. 10/23 원안의 10:1을 10/26 수정 위임장이 8:1로 변경. 11/13은 승인·회사 조치 조건부 목표일이며 결과·법적 효력은 미확정. 기준일 10/22 Class A 3,545,018주와 Class B 96,043주는 발행주식 수이지 유통주식 수가 아니다. [SEC 수정 위임장](https://www.sec.gov/Archives/edgar/data/1735556/000110465926118863/tm2628231d1_ex99-1.htm), [SEC 원안](https://www.sec.gov/Archives/edgar/data/1735556/000110465926118508/tm2628165d1_ex99-1.htm) |
| XAIR | 2026-09-30 종료 분기 실적 발표 및 컨퍼런스콜 — 확정 공지 | GlobeNewswire 발행사 발표 ID GNW:3391208 | 결과 발표일 2026-11-11(시각 미공개), 콜 16:30 EST = 2026-11-12 06:30 KST. 콜 시각과 실적 발표 시각을 구분. [발행사 보도자료](https://rss.globenewswire.com/news-release/2026/10/29/3391208/0/en/beyond-air-schedules-conference-call-to-discuss-financial-results-for-the-quarter-ended-september-30-2026.html) |

## 추가 원문 확인 배치 89 — SGRX 희석·의결권·임시주총 수정안

- 운영 공개 GET `2026-11-01`: HTTP 200, NAS active `COMMON_STOCK`, USD 시총 $752,211(기초 관측 `2026-10-30T07:08:11.495Z`), listed shares 1,881,940, RSS 4건, SEC classified events 0건. DB write 없음.
- SEC 6-K `0001104659-26-120695`: 회사는 2026-09-30~10-16 senior secured convertible note holders가 $3,300,000 principal과 $209,807 accrued interest를 $1.63/share에 2,153,257 Class A 보통주로 전환했다고 보고했다. 전환 완료 사실을 기록했으며 잔존 채무는 산출하지 않았다.
- SEC 6-K `0001104659-26-118168` 및 Exhibit 10.1: 10/21 회장·CEO·COO에게 Class B 75,000주를 $0.4390/share, 합계 $32,925에 발행했다. 발행 후 매수자는 Class B 발행주식 전량과 총 voting power 약 35%를 보유한다고 회사가 밝혔다.
- SEC 6-K `0001104659-26-118508`의 10/23 원안은 10:1 병합을 제안했으나, 6-K/A `0001104659-26-118863`의 10/26 amended proxy는 8:1로 수정했다. EGM은 11/3 8:00 a.m. EST(싱가포르 9:00 p.m.; KST 22:00)에 예정되어 있고, 11/13 효력일은 승인 조건부 목표다. 10/22 기준 A 3,545,018주 및 B 96,043주는 issued and outstanding이며 float으로 간주하지 않았다. 표결·법적 효력은 미확정이다.
- 수정 proxy의 과거 1:60(2026-01-20) 및 1:5(2026-08-21) 병합 기재와 Nasdaq 최저 bid-price 규정 설명을 위험에 기록했다. 제안된 병합만으로 상장유지나 가격·수익을 보장하지 않는다.
- SEC 6-K `0001104659-26-116630`과 Ex.99.1로 기존 GPU 16대 인도 목표 이벤트를 재검토했다. 11/3 포함 주간은 회사의 estimated delivery schedule이며 정확한 날짜·실제 인도·상업가동은 미확인으로 유지했다.
- 이벤트 원장에는 전환, 특수관계자 Class B 발행, EGM/병합 표결을 독립 eventId로 저장하고 5개 filing relation을 연결했다. 신규 SEC 제출 4건을 `FULL_PRIMARY_REVIEW`로 승격했다. 상세 filing/event lineage는 구조화 JSON과 filing ledger에 보존한다.
- 공시 amendment 계보를 `relatedFilings`의 양방향 `AMENDS`/`AMENDED_BY` 관계로 관리하기 시작했다. SGRX의 10/26 6-K/A `0001104659-26-118863`가 10/23 6-K `0001104659-26-118508`을 수정한 관계를 issuer review copy와 중앙 filing ledger에 함께 기록하고 validator에서 대상 accession 존재·상호 참조·원장 간 일치·집계값을 확인한다.
| CDT | 2026-11-12 특별주주총회 — Astor 전환사채·워런트 주식발행 및 최대 누적 1:1,000 역분할 권한 표결 예정 | SEC DEF 14A 0001493152-26-048693 | 10:00 EDT = 2026-11-12 23:00 KST. Proposal 1은 Nasdaq Rule 5635 목적의 Astor notes/warrants 주식발행 승인, Proposal 2는 1:2~1:100 개별·누적 1:1,000 한도 역분할 권한(이사회 비율·시기 결정 및 포기 가능), Proposal 3은 표결 연기안. 실제 승인·발행·병합은 미확인. [SEC DEF 14A](https://www.sec.gov/Archives/edgar/data/1896212/000149315226048693/formdef14a.htm) |
| MDCX | 2026-12-02 특별주주총회 및 우선주 신설·최대 1대50 주식분할 표결 — 확정 예정 | SEC DEF 14A 0001062993-26-005627 | 12/2 10:00 a.m. EST, Toronto 현장 = 12/3 00:00 KST. Record date 10/28, proxy deadline 11/30 10:00 a.m. EST(23:00 KST). 무제한 Class A blank-check 우선주 수권 및 최대 1:50 보통주 병합 권한 표결(각 2/3 votes cast); 우선주는 이사회 현재 발행 의도 없음. 과거 실제 병합은 1:50으로 10/12 효력 및 조정 거래 개시. KIS listed_shares 236,334와 proxy outstanding 1,899,338은 별도 정의/원천. [SEC DEF 14A](https://www.sec.gov/Archives/edgar/data/1997296/000106299326005627/formdef14a.htm), [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1997296/000106299326005382/form8k.htm) |
| WHLR | 2026-12-04 연례주총 — 전환성 어음 주식상환 및 역분할 권한 표결 | SEC DEF 14A 0001213900-26-111872 | 09:30 Atlantic Standard Time, San Juan = 22:30 KST. Record date 10/2, 1,460,799 outstanding. 최대 $25M note 상환용 >19.9% 주식 발행 표결과 2027년 월별 1:2~1:100 역분할 권한 12건은 별도 안건. 실제 note issuance 및 병합 미확정. [SEC DEF 14A](https://www.sec.gov/Archives/edgar/data/1527541/000121390026111872/ea0308315-04.htm) |
| EDVA | 12/7 특별주총 — 예비 위임장, 조건부 발행 및 역분할 표결 | SEC PRE 14A 0001731122-26-001369 | 10:00 EST = 12/8 00:00 KST; record date 10/30. 12,683,908 Series D/전환어음 연계 주식, 최대 20M ELOC shares, authorized common 800M 및 이사회 재량 1:2~1:49 역분할. reverse split은 2027-03-28 전 불가. 승인/발행/효력 미완료. [SEC PRE 14A](https://www.sec.gov/Archives/edgar/data/1553788/000173112226001369/e8017_pre14a.htm) |
| EDVA | ELOC 최대 약정 $35M→$135M 확대 — 실제 인출/발행 미확인 | SEC 8-K 0001731122-26-001375; S-1 0001731122-26-001378 | 10/22 addendum, $135M은 과거 판매 포함. S-1은 최대 1,013,041 potential resale shares와 조건부 최대 $29.8M gross proceeds를 기재하지만 subject to completion. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1553788/000173112226001375/e8027_8k.htm), [SEC S-1](https://www.sec.gov/Archives/edgar/data/1553788/000173112226001378/e8016_s-1.htm) |
| ISPC | 2026-12-30 연례주총 — 네바다 법인 전환 포함 4개 안건; 10/30 별도 역분할 권한 승인 | SEC PRE 14A 0001213900-26-114426 | 15:00 EST = 12/31 05:00 KST, online. Record date 11/2. 같은 원문은 10/30 재개 특별주총에서 1:10~1:100 역분할 권한이 승인됐고 원문 작성 시점에 아직 시행되지 않았다고 보고. 원문 첫 안내문 내부 날짜 11/20은 SEC 10/30 acceptance보다 뒤라 불일치로 표시. [SEC PRE 14A](https://www.sec.gov/Archives/edgar/data/1558569/000121390026114426/ea0309612-01.htm) |
| NEXR | 2026-11-06 1대5 주식병합 — 효력 및 조정 거래 예정 | SEC 6-K 0001213900-26-113293 | 같은 날 Nasdaq 장 개시부터 split-adjusted 거래. 발행주식 수 2,513,147주→약 502,630주(회사 추정, 단주 처리 영향). 유통주식 수는 공시 미확인. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1885408/000121390026113293/ea0309947-6k_nexera.htm) |
| VCIG | 1:18 역분할 — 11/2 효력·새 CUSIP 공지 (CONFIRMED_SCHEDULED) | SEC 6-K 0001213900-26-113645; Nasdaq ECA #2026-779 | 11/2 00:01 Eastern Standard Time(EST) = 14:01 KST. Nasdaq은 11/2 월요일 효력 및 CUSIP G98218137을 별도 공지했다. 발행·유통주식 수 약 9,639,594주→535,533주(회사 추정; free float 아님). split-adjusted 거래 개시 시각은 확인되지 않음. 회사는 Nasdaq minimum bid 가격 요건 및 잠재 institutional transaction 포지셔닝을 언급했으나 거래 확정 사실은 아니다. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1930510/000121390026113645/ea0309953-6k_vciglobal.htm), [Nasdaq Trader ECA #2026-779](https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2026-779) |
| TGL | 2026-11-05 09:00 ET 특별주총 — 1:2~1:50 역분할 권한·연기안 표결 예정 | SEC DEF 14A 0001213900-26-112539 | 23:00 KST. 온라인 참석 등록 마감 11/3 23:59 EST(11/4 13:59 KST); 인터넷·전화투표 11/4 23:59 EST(11/5 13:59 KST). 1:50 가정 시 회사 공시 주식수 12,672,698→253,454주, 수권 보통주 600,000,000주는 유지. 실제 승인·시행 및 비율은 미확정이며 추가 발행은 확정 계획이 아님. [SEC DEF 14A](https://www.sec.gov/Archives/edgar/data/1905956/000121390026112539/ea0309695-def14a_treasure.htm) |
| CRIS | 2026-11-18 특별주총 및 1대5~1대12 역분할 표결 — 예비위임장 일정 | SEC PRE 14A 0001140361-26-040582 | 11:00 ET = 2026-11-19 01:00 KST. 비율 결정과 시행은 이사회 재량이며 예비자료 기준. [SEC PRE 14A](https://www.sec.gov/Archives/edgar/data/1108205/000114036126040582/ef20084269_pre14a.htm) |
| NXL | 2026-12-04 특별주총 및 Alumni Capital 관련 주식발행 승인 표결 — 예비위임장 일정 | SEC PRE 14A 0001829126-26-011511 | 10:00 ET = 2026-12-05 00:00 KST. 계약상 실제 발행량·매입 실행은 미확정. [SEC PRE 14A](https://www.sec.gov/Archives/edgar/data/1527352/000182912626011511/nexalintech_pre14a.htm) |
| NUWE | 1대9 주식병합 — 완료 | SEC 8-K 0001140361-26-040605 | 2026-10-26 17:00 EDT 법적 효력(10/27 06:00 KST), 10/27 미국 장 개장부터 split-adjusted 거래. 의결·이사회 승인·법적 효력·거래 개시를 구분. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1506492/000114036126040605/ef20084194_8k.htm) |
| GCTK | Nasdaq 거래정지 — 10/30 효력 확인 (COMPLETED) | SEC 8-K 0001493152-26-049299; Nasdaq Security Status Updates | SEC 공지상 정지 예정일 10/30 개장. Nasdaq 공식 상태표에서 10/30 `Issue Suspensions` 확인. OTC 전환·후속 상장 여부는 미확인. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1506983/000149315226049299/form8-k.htm), [Nasdaq 상태표](https://www.nasdaqtrader.com/Trader.aspx?id=nasdaq-security-status-updates) |
| LNAI | Nasdaq 거래정지 — 10/30 효력 확인 (COMPLETED) | SEC 8-K 0001731122-26-001362; Nasdaq Security Status Updates | Nasdaq 상태표에서 10/30 `Issue Suspensions` 확인. 운영 마스터 `enabled=true`는 거래 가능 증거가 아니다. OTC 전환 여부 미확인. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1527728/000173112226001362/e8019_8-k.htm), [Nasdaq 상태표](https://www.nasdaqtrader.com/Trader.aspx?id=nasdaq-security-status-updates) |
| LNAI | 이사회 자발적 상장·등록 철회 승인 — 절차 진행 중 (REPORTED) | SEC 8-K 0001731122-26-001362, Item 8.01 | 10/22 이사회 승인. Nasdaq suspension과 별도 사안. Form 25 제출 및 상장·등록 해제 효력은 미확인. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1527728/000173112226001362/e8019_8-k.htm) |
| NCT | 등록 직접공모 종결·1,500만주 발행 — 완료 | SEC 6-K 0001213900-26-114261 | 10/27 종결, 주당 $1.30, 전액 납입 전제 예상 유입액 약 $19.5M. 납입 여부는 투자자별로 조건부이며 잠재 희석이 큼. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2018529/000121390026114261/ea0309761-6k_intercont.htm) |
| BRNX | 2026-11-06 특별주총 — 3:1~6:1 역분할 권한 표결 | SEC 6-K 0001213900-26-111075, Ex. 99.1–99.3 | 12:00 Israel = 05:00 EST = 19:00 KST; 기준일 10/22; 단순 과반. 이사회가 실행·비율·효력일 결정. 최초 정족수 미달 시 13:00 Israel로 연기, 연기회의 정족수 특례. Nasdaq $1 bid 목적이나 가격 유지·요건 회복은 보장되지 않음. [SEC Notice](https://www.sec.gov/Archives/edgar/data/1901215/000121390026111075/ea030906701ex99-1.htm), [SEC Proxy](https://www.sec.gov/Archives/edgar/data/1901215/000121390026111075/ea030906701ex99-2.htm) |
| NXTS | 12/14 연례주총 — 예비 위임장상 4개 안건 | SEC PRE 14A 0001493152-26-047569 | 16:30 Israel(IST)=09:30 EST=23:30 KST, Givatayim. 이사 3명 재선임, 최대 20% 할인 비공개 발행, FY2026 감사인 비준, 단일 투자자 대상 최대 원금 $10M 전환사채·워런트·약정수수료 주식 발행 승인 안건. PRE 14A라 최종 위임장·표결·자금조달 완료는 아님. [SEC PRE 14A](https://www.sec.gov/Archives/edgar/data/1789192/000149315226047569/formpre14a.htm) |
| ONFO | 2026-11-05 특별주총 및 최대 1대250 역분할 권한 표결 — 확정 예정 | SEC DEF 14A 0001213900-26-110606 | 10:00 ET = 11/6 00:00 KST. 사전등록 마감 11/4 10:00 ET. 표결과 시행 결정·효력일은 구분. [SEC DEF 14A](https://www.sec.gov/Archives/edgar/data/1825452/000121390026110606/ea0305891-02.htm) |
| FRGT | 1대10 역분할 및 조정 거래 개시 — 완료 | SEC 6-K 0001493152-26-047162 및 0001493152-26-047518 | 발행주식 수 16,814,200주→1,681,420주, 조정 거래 10/19 개시. Series C/A4 권리에서 추가 최대 6,435,332주가 발행될 수 있어 잠재 희석 위험. 유통주식 수와 실제 권리행사량은 별도. [SEC 6-K (병합 수량)](https://www.sec.gov/Archives/edgar/data/1687542/000149315226047162/form6-k.htm), [SEC 6-K (권리)](https://www.sec.gov/Archives/edgar/data/1687542/000149315226047518/form6-k.htm) |
| HKPD | 1대20 역분할 및 조정거래 — 10/26 시행 | SEC 6-K 0001213900-26-111190, Ex. 99.1; Nasdaq ECA #2026-751 | 10/26 장 개시 효력·같은 날 Nasdaq 조정거래. 액면가 $0.001→$0.02, CUSIP G6365B112, 단주 참가자 단위 올림. 발행·유통주식 수 미확인. 최소호가 회복은 보장되지 않음. [SEC 부속자료](https://www.sec.gov/Archives/edgar/data/2007702/000121390026111190/ea030894801ex99-1.htm), [Nasdaq ECA](https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2026-751) |
| FMFC | 1대40 병합 — 완료 | SEC 6-K 0001213900-26-106390 | 2026-10-13 Nasdaq 개장부터 조정 거래. 발행주식 Class A 16,694,940→417,374주, Class B 3,000,000→75,000주. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2024656/000121390026106390/ea0306977-6k_kandal.htm) |
| VJET | 사명·티커 변경 및 1:10 역분할 — 완료 | SEC 8-K 0001437749-26-032038 | 10/5 00:01 EDT(13:01 KST) 법적 효력; NYSE American 장 개시부터 VJET 조정거래를 사후 확인. 새 CUSIP 74933X 807. 회사 공시 분할 후 발행주식 약 2,101,987주(단주 현금정산 대상); 유통주식 수 미확인. 사명/티커 변경과 병합은 별도 eventId로 관리. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1716621/000143774926032038/vjet20261005_8k.htm)
| FMFC | Nasdaq 시정계획 제출기한 — 확정 공지 | SEC 6-K 0001213900-26-111019 | 2026-11-30까지 최소 500,000 publicly held shares 요건 시정계획 제출. 계획 수락·요건 회복은 미확정. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2024656/000121390026111019/ea0308843-6k_kandal.htm) |
| NXL | Nasdaq 주주자본 요건 회복기한 — 확정 공지 | SEC 8-K 0001829126-26-010495 | 2027-01-04까지 주주자본 최소 $2.5M 입증. 최소호가 조건(종가 $1 이상 20거래일 연속)은 별도이며 10/1 8-K에서 회복 통지됐다고 보고. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1527352/000182912626010495/nexalintec_8k.htm) |
| HUBC | Nasdaq MVLS $35M 준수 마감 — 2027-03-22 | SEC 6-K 0001213900-26-103684 | 9/23 통지 당시 30거래일 연속 요건 미달. 180일 내 $35M 이상을 10거래일 연속 유지해야 함. 운영 KIS 시총은 MVLS와 동일한 값으로 간주하지 않음. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1905660/000121390026103684/ea0306787-6k_hubcyber.htm) |
| HUBC | Richard Paolone·Joseph Tung 독립이사 선임 — 10/13 완료 | SEC 6-K 0001213900-26-109036 | 두 명의 독립이사 선임, 즉시 효력. 보수는 기존 주주승인 조건; indemnification agreement 체결은 예정사항. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1905660/000121390026109036/ea0308497-6k_hubcyber.htm) |
| HUBC | QPoint Sale Israeli Competition Authority 승인 — 10/14 완료 | SEC 6-K 0001213900-26-112826 | 주요 종결조건 중 하나 충족. 승인은 매각 종결을 의미하지 않으며 대금·종결일 미확인. 매각대금은 담보채무 전액 상환에 부족할 것으로 회사 예상. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1905660/000121390026112826/ea0309792-6k_hub.htm) |
| HUBC | QPoint 주식 담보권 실행·receiver 신청 — REPORTED | SEC 6-K 0001213900-26-112826 | 담보채권자가 회사·매수자 동의 아래 pledged shares에 한정한 담보권 실행과 공동 receiver 선임을 신청. 신청일·법원 승인 여부 미확인. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1905660/000121390026112826/ea0309792-6k_hub.htm) |
| HUBC | QPoint 담보권 실행 신청 심리 — 11/1 10:00 Israel / 17:00 KST | SEC 6-K 0001213900-26-112826 | Tel Aviv-Jaffa District Court, case 59179-10-26. 일정 확정 공지이며 심리결과·receiver 선임은 미확인. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1905660/000121390026112826/ea0309792-6k_hub.htm) |
| MSS | Nasdaq 정기보고서 연체·시정계획 기한 10/19 — 제출/수락 미확인 | SEC 8-K 0001213900-26-104637 Item 3.01 | 2026-04-30 FY Form 10-K 및 2026-07-31 분기 Form 10-Q 연체. 통지는 즉시 상장효과 없다고 했으며 시정계획 제출 마감은 10/19. Nasdaq 수락 시에만 180일 예외 또는 2027-02-09까지의 조건부 연장 가능. 10/31 cutoff까지 후속 제출 확인 안 됨. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1892292/000121390026104637/ea0306810-8k_maison.htm) |
| EDVA | 2026-11-20 연례주총 — record date 정정 및 RSU/주식보상 표결 | SEC DEF 14A 0001731122-26-001316; DEFA14A 0001731122-26-001326 | 10:00 EST = 11/21 00:00 KST. DEFA14A가 실제 record date를 10/2로 정정. 6개 안건 중 Proposal 5는 fully diluted 20%(summary 약 4,029,561주)의 RSU와 automatic ownership maintenance를 제안하며 결과 미확정. 8명별 표기 수량 합계는 4,075,561주(산술 계산)로 summary보다 46,000주 차이. [SEC DEF 14A](https://www.sec.gov/Archives/edgar/data/1553788/000173112226001316/e7987_def14a.htm), [정정 DEFA14A](https://www.sec.gov/Archives/edgar/data/1553788/000173112226001326/e7998_defa14a.htm) |
| XAIR | 2026-12-10 정기주총 — 이사·감사인·경영진 보상 안건 | SEC DEF 14A 0001493152-26-049442; DEFA14A 0001493152-26-049445 | 16:30 EST = 2026-12-11 06:30 KST, Garden City 본사 대면; 기준일 10/12. 이사 5명 선임, 감사인 추인, 비구속 say-on-pay, 필요 시 연기 등. DEFA14A 추가자료를 확인했으며 schedule change text는 없음. [SEC DEF 14A](https://www.sec.gov/Archives/edgar/data/1641631/000149315226049442/formdef14a.htm), [SEC DEFA14A](https://www.sec.gov/Archives/edgar/data/1641631/000149315226049445/formdefa14a.htm) |
| INLF | 공모 가격 결정·종결·선불워런트 행사·조건부 리셋 | SEC 6-K 0001213900-26-111362; 424B5 0001213900-26-110849 | 10/19 가격 결정(435,000주 또는 선불워런트 1,908,750주분, 총 $3.75M 비용 전), 10/20 종결, 10/21 제출일 기준 선불워런트 전량 행사 보고(정확한 행사일 미공개). Series C 11/2 및 Series A/B 11/17은 계약상 거래일 규칙에 따른 추정일이며 결과·추가 발행량 미확정. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1991592/000121390026111362/ea0309124-6k_inlif.htm), [424B5](https://www.sec.gov/Archives/edgar/data/1991592/000121390026110849/ea0307139-424b5_inlif.htm)
| LABT | 연례주총 역분할·발행가능주식 확대 — 승인 완료 | SEC 8-K 0001213900-26-104177 | 2026-09-22 주주들이 최대 1:20 역분할 권한과 발행가능주식 12.5M→100M 확대를 승인. 실제 역분할·주식발행은 미확정. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/2079272/000121390026104177/ea0306660-8k_lakewood.htm) |
| KITT | Series A 특정 holder trigger waiver 종료 | SEC 8-K 0001849820-26-000163 | 2027-01-31 종료. 해당 holder의 covered Series A 주식이 남으면 지정 사건 결과가 이후 prospective하게 적용될 수 있다. holder/주식 수 미공개이며 전체 Series A에 적용되지 않는다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1849820/000184982026000163/kitt-20260930.htm) |
| KITT | Series B 특정 holder trigger waiver 종료 | SEC 8-K 0001849820-26-000166 | 2027-03-31 종료. 지정 사건에 대한 18% default dividend 및 125% conversion amount 효과의 해당 기간 waiver; 보통 전환 및 120% conversion amount 등은 유지. covered shares 잔존 시 expiry 후 prospectively 적용 가능. 전체 Series B waiver가 아니다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1849820/000184982026000166/kitt-20260930.htm) |
| KITT | Series C 특정 holder waiver 종료 (9/30 waiver) | SEC 8-K 0001849820-26-000166 | 2027-03-31 종료. 지정 사건에 한정된 해당 holder waiver; holder 및 covered shares 수 미공개, 전체 Series C에 적용되지 않는다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1849820/000184982026000166/kitt-20260930.htm) |
| KITT | Series C 특정 holder waiver 종료 (9/23 waiver) | SEC 8-K 0001849820-26-000155 | 2027-12-31 종료. 별도 holder waiver이며 전체 Series C에 적용되지 않는다. covered shares 잔존 시 expiry 후 prospectively 적용 가능. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1849820/000184982026000155/kitt-20260930.htm) |
| KITT | 전략적 투자 최대 $50M 비구속 LOI — 투자 미확정 | SEC 8-K 0001849820-26-000150 | 투자자 funding 의무 없음; due diligence·최종계약·승인·종결 조건이 남아 있다. 희석/지배권 변경 가능성을 회사가 기재했으며 자금 유입으로 계산하지 않는다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1849820/000184982026000150/kitt-20260925.htm) |
| KITT | Term loan 전환가 $1.488 기간 종료 — 실제 전환 미확인 | SEC 8-K 0001849820-26-000168 | 가격 기간은 2026-10-02 종료. 본문은 실제 행사/전환 주식 수를 밝히지 않는다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1849820/000184982026000168/kitt-20260930.htm) |
| KITT | Senior secured convertible term loan 만기 | SEC 8-K 0001849820-26-000168 | 2028-01-31. 9월 amendment의 만기 연장; 실제 상환·전환은 미확인. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1849820/000184982026000168/kitt-20260930.htm) |
| NXAT | Anson ATM 동의기간 종료 — 2027-03-31, 실행량 미확인 | SEC 6-K 0001829126-26-010775 | 시작은 2026-09-28이 포함된 주; 주당 $2 미만 매도 금지, 실제 ATM 순현금 수령액의 20%를 3영업일 이내 대주에게 상환. 본문은 2027-03-31 종료라고 하지만 Exhibit 99.2에는 종료일 대괄호·“Draft for counsel review” 표기와 Effective Date/서명일 차이가 있어 문서상 한계를 병기했다. 실제 매각·상환 미확인. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2000756/000182912626010775/nexusadvanced_6k.htm), [Exhibit 99.2](https://www.sec.gov/Archives/edgar/data/2000756/000182912626010775/nexusadvanced_ex99-2.htm) |
| NXAT | 기존 Anson 워런트 cashless exchange 권리 — 최대 4.5M주 | SEC 6-K 0001829126-26-010775 | 기존 8,310,250 warrant shares를 0.5415 비율로 교환 가능; cash exercise 대가 없음. 계약상 교환 통지·주식 인도는 미확인. Exhibit의 holder별 schedule 수량은 대괄호로 표시. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2000756/000182912626010775/nexusadvanced_6k.htm), [Exhibit 99.2](https://www.sec.gov/Archives/edgar/data/2000756/000182912626010775/nexusadvanced_ex99-2.htm) |
| NXAT | $2.5M note 지급 시 전환가 고정·price reset 종료 조건 | SEC 6-K 0001829126-26-010775 | 전액 지급 후 지급 직전 3거래일 VWAP 평균으로 전환가 고정, anti-dilution/reset/ratchet 종료 조건. 실제 지급 여부·고정가·전환 주식 수 미확인. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2000756/000182912626010775/nexusadvanced_6k.htm) |
| NXAT | 독립감사인 변경 — Samil PwC 해임, HTL International 선임 | SEC 6-K 0001829126-26-010675 | PwC 해임 효력 9/21, HTL 선임 효력 10/1. 회사는 이견이 없다고 밝혔고 PwC 동의서 제출. 다만 FY2025 going-concern paragraph 및 내부회계 material weakness는 별도 위험으로 공개됨. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2000756/000182912626010675/nexusadvanced_6k.htm), [PwC letter](https://www.sec.gov/Archives/edgar/data/2000756/000182912626010675/nexusadvanced_ex16-1.htm) |
| NXAT | 미공개 방산기술업체와 $500M 역합병 배타적 협상 — 비구속·조건부 | Nasdaq/GlobeNewswire 발행사 발표, 2026-10-06 | 약 $500M은 target의 제안 가치이며 확정 거래가치가 아니다. target 주장 약 $7B 프로젝트 LOI는 비구속·미확정이고 수주/매출 아님. 대상·자금·지배구조·definitive agreement 미확정. [발행사 발표](https://www.nasdaq.com/press-release/nexus-advanced-technologies-signs-confidential-exclusivity-proposed-500-million) |
| PMAX | Blackrod 초기 1.5% 지분취득 — 회사 발표상 완료 | SEC 6-K 0001213900-26-103770, Ex.99.1 | Blackrod 신주 1.5%와 PMAX Class A 발행 전 주식의 19.99% 교환; 9/23 기준 약 261,531주 계산치, 10% PubCo shares 18개월 escrow. [SEC 발표자료](https://www.sec.gov/Archives/edgar/data/2012096/000121390026103770/ea030679301ex99-1.htm) |
| PMAX | Blackrod 잔여 지분 merger 추진 — 별도 definitive agreement 미체결 | SEC 6-K 0001213900-26-103770, Ex.10.1; issuer release 10/29 | 추정 EV $200M–$250M이나 계약상 제안 추정치. 자금 미확보, 필요 동의·승인 미완료. Blackrod 외 defense/security 기회는 탐색 단계. [SEC agreement](https://www.sec.gov/Archives/edgar/data/2012096/000121390026103770/ea030679301ex10-1.htm), [10/29 issuer release](https://www.globenewswire.com/news-release/2026/10/29/3391275/0/en/powell-max-limited-announces-strategy-to-build-a-defense-and-security-group-beginning-with-proposed-remington-firearms-transaction.html) |
| PMAX | Class C private placement — 10/2까지 $2.421M gross closing | SEC 6-K 0001213900-26-106115 | 최대 $4M 한도 중 8/24 $1.700M 및 9/30 $721K 종결. 총 2.421M Class C shares, agent warrants 242,100 Class A shares issuable; 수수료·전환 Floor Price에 따른 잠재 희석. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2012096/000121390026106115/ea0307438-6k_powell.htm) |
| PMAX | Spartan M&A 자문계약 — $500K cash + $700K 조건부 equity fee | SEC 6-K 0001213900-26-106115, Ex.10.3 | 9/30 별도 12개월 계약. $500K 현금 지급일정 서면합의 필요; $700K Class C equity fee는 placement 또는 Blackrod merger 중 먼저 closing될 때 due, 필요한 승인 조건. 실제 지급·주식발행 미확인. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2012096/000121390026106115/ea0307438-6k_powell.htm) |
| PMAX | Defense & security acquisition strategy 발표 — 일정·자금 미확정 | 발행사 GlobeNewswire 10/29 08:30 EDT / 21:30 KST | Blackrod만 LOI/계약 대상. drone·cybersecurity 등은 탐색 후보이며 거래 일정·매출목표 없음. [발행사 release](https://www.globenewswire.com/news-release/2026/10/29/3391275/0/en/powell-max-limited-announces-strategy-to-build-a-defense-and-security-group-beginning-with-proposed-remington-firearms-transaction.html) |
| IPW | 특별주총 역분할 권한 승인 — 시행 미확인 | SEC 8-K 0001683168-26-007276 Item 5.07 | 9/21 찬성 2,271,824·반대 50,639·기권 4, 이사회 재량 최대 1:250 병합 승인. 실제 시행일·비율 미정. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1830072/000168316826007276/ipower_8k.htm) |
| IPW | 최대 $10M 주식발행 권한 승인 — 발행 미확인 | SEC 8-K 0001683168-26-007276 Item 5.07 | 사모/공모에서 Nasdaq 최저가 이상·동일·미만 가격으로 발행할 수 있는 주주 승인. 실제 조달·주식수 미확인. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1830072/000168316826007276/ipower_8k.htm) |
| IPW | 주식보상계획 개정 — 5천만주 reserve·연 5% 증액 | SEC 8-K 0001683168-26-007276 Item 5.07 | 2020 계획의 발행예약 한도 50,000,000주 및 10년간 연 5% 자동증액 조항 승인. 이는 즉시 발행주식 수가 아니며 잔여 reserve·교부량 미확인. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1830072/000168316826007276/ipower_8k.htm) |
| PFSA | 향후 역분할 권한 승인 — 실제 시행 미확인 | SEC 8-K 0001213900-26-101568, Item 5.07 | 9/18 특별주총에서 1:2~1:12 범위, 2년간 누적 최대 1:12 권한 승인(찬성 262,920·반대 17,360·기권 7,610). 승인으로 실제 병합이 발생한 것은 아니며 비율·효력일·조정 거래일 미정. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1859807/000121390026101568/ea0306040-8k_profusa.htm) |
| BBLG | Nasdaq 최소호가 준수기한 — 확정 통지 | SEC 8-K 0001493152-26-042940 | 2027-03-09까지 종가 $1 이상을 10영업일 연속 기록해야 함. 추가 180일은 자동 연장이 아니며 별도 자격·Nasdaq 허용 필요. 통지 자체는 즉시 상장에 영향 없음. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1419554/000149315226042940/form8-k.htm) |

일정은 촉매 근거이지 주가 방향 예측이 아니다. FCHL 병합안은 제안·조건부이며 병합 자체의 기계적 가격조정과 실제 수익을 구분해야 한다. SGRX의 장비 인도·설치·상업운영은 서로 다른 마일스톤이다. XAIR 실적의 결과는 발표 전 공개 일정만으로 알 수 없다.

| PWCM | 특별주총 1:2~1:10 역분할 비율 표결 — CONFIRMED_SCHEDULED | SEC DEF 14A 0001193125-26-427798 | 2026-11-17 15:00 현지시간(2026-11-18 05:00 KST). 이사회 재량 비율의 역분할안 및 회의 연기안 표결 예정. [SEC DEF 14A](https://www.sec.gov/Archives/edgar/data/1640384/000119312526427798/lmfa-20261021.htm) |

## Batch 19에서 추가 확인한 이벤트

| 티커 | 이벤트 | 원문 식별자 | 요약·근거 |
|---|---|---|---|
| CISS | Afrapearl II 25일 왕복 항해용선 — 일일 총운임 US$175,000 — REPORTED | CISS:IR:2026-10-12 | 비용 차감 전 gross 일일요율이며 실제 총 매출·순익 아님. 용선자와 실행 일정 미공개. 두 번째 MR선 인도는 2026 Q3 완료 사실(일자 미공개)이며 미래 이벤트로 취급하지 않음. NAV/share US$11.73은 회사 fully diluted 추정치. [회사 IR](https://c3is.pro/c3is-inc-announces-attractive-voyage-charter-contract-for-its-aframax-tanker-delivery-of-the-second-mr-product-tanker-and-robust-nav-share/investor-relations/press-releases/) |
| GIPR | GIPR 계열사 담보어음 만기 1년 연장 — REPORTED | 0001193125-26-414221 | GIP Operating LP와 Brown Family Enterprises는 담보어음 만기를 2026-10-14에서 2027-10-14로 연장했다. 9월 28일 원금 잔액은 US$5.2M이며 9% 단리·월 지급 조건은 유지됐다. 대주는 계약 체결 시 채무불이행이 없다고 확인했다. [원문](https://www.sec.gov/Archives/edgar/data/1651721/000119312526414221/gipr-20261002.htm) |
| ARTL | ARTL Nasdaq $5M 시가총액 상장요건의 적용 시점 불확실 — REPORTED | 0001640334-26-001665 | Nasdaq의 최소 $5M market value of listed securities 규칙은 SEC 승인됐으나 7월 29일 임시 stay가 공지됐다. 10월 5일 제안된 변경은 stay 종료 시 효력 발생을 제안했고 의견 마감은 10월 29일이었다. 회사는 stay 기간과 최종 규칙 형태를 알 수 없다고 밝혔으며, 자금조달 등 구체 조치를 약정하지 않았다. [원문](https://www.sec.gov/Archives/edgar/data/1621221/000164033426001665/artl_8k.htm) |
| XRTX | XRx-026 FDA IND 제출 목표 — Q4 2026(분기 범위, ESTIMATED) | 0001171843-26-006109 | 발표일 9/18, 제출 목표기간 10/1–12/31을 별도 저장했다. 특정 제출일·완료/접수·임상개시 확인 없음. 10/31까지 공개자료 미확인은 비공개 IND가 없다는 뜻이 아님. [원문](https://www.sec.gov/Archives/edgar/data/1729214/000117184326006109/exh_991.htm) |
| XRTX | XRx-026 Health Canada CTA 준비 — 일정 미정(ESTIMATED) | 0001171843-26-006540 | 10/8 발표는 병행 준비 상태만 확인한다. 제출일·접수/수리, 환자 수·주요 평가변수·임상개시일 미공개. 당시 상업화 파트너 계약 없음. [원문](https://www.sec.gov/Archives/edgar/data/1729214/000117184326006540/exh_991.htm) |
| HXHX | 미국 인수 실사·LogiAgent 검토·전기트럭 2건·배터리 교환 협력·입찰 후보 결과 | Nasdaq/Newsfile 발행사 공지 2026-10-01, 10-02, 10-08, 10-15; 10월 SEC 접수원장상 해당 공지와 직접 연결된 filing 미확인 | LogiAgent $7M-$10M 회사 평가; indicative asset report $5M-$12M는 current financials 제외·formal valuation 아님; definitive deal 없음. 200 EV tractor 계약 RMB120.9M/$18.02M, delivery/acceptance 후 단계 배치 예정. 63 truck contract RMB43.155M/$6.43M은 2025년 12월 체결 보고. Battery-swap framework에 개별 프로젝트·투자 미확정. 운송입찰 11위 후보는 award가 아님. 운영 GET 11/2 HTTP 200, active NAS COMMON_STOCK, cap $1,577,280(10/30 관측), RSS 4, classified SEC events 0, DB 미기록. [LogiAgent 검토](https://www.nasdaq.com/press-release/haoxin-holdings-hxhx-evaluates-strategic-acquisition-logiagent-ai-logistics), [후속 플랫폼 설명](https://www.nasdaq.com/press-release/haoxin-holdings-details-12-module-ai-logistics-platform-under-strategic-evaluation), [전기트럭·입찰 발표](https://www.nasdaq.com/press-release/haoxin-holdings-hxhx-accelerates-new-energy-expansion-18-million-purchase-200), [미국 인수 실사](https://www.nasdaq.com/press-release/haoxin-holdings-limited-announces-us-logistics-acquisition-initiative-part-north) |
| SGLY | SGLY 특별주총: 대규모 발행 권한·저가 워런트·역분할 안건 — SCHEDULED | 0001213900-26-112755 | 수정 위임장은 2026-11-09 11:00 a.m. ET 특별주총을 공지했다. 보통주 최대 250,000,000주 발행 권한, 행사가 US$0.001인 수정 워런트 6,897,636개 및 1:5·1:10·1:20 병합 권한 안건이 포함됐다. 병합 비율은 이사회 재량이며 승인·실행 여부는 결과 대기다. [원문](https://www.sec.gov/Archives/edgar/data/1422892/000121390026112755/ea0307929-defr14a_singular.htm) |
| GLXG | GLXG FY2026 매출 HK$28.8M, 순손실 HK$10.6M — REPORTED | 0001213900-26-113297 | 20-F에 따르면 2026-06-30 종료 회계연도 매출은 HK$28.8M(+5%), 순손실 HK$10.6M(전년 HK$27.6M)이다. 네 주요 고객 매출 비중 합계는 65.6%이며 회사와 감사인이 2024~2026년 내부통제 중요 취약점을 기재했다. [원문](https://www.sec.gov/Archives/edgar/data/1905920/000121390026113297/ea0308886-20f_galaxy.htm) |
| MNDR | FY2026 결과 보고 — REPORTED | SEC 20-F 0001493152-26-049341 | 6/30 종료 FY2026 매출 US,741,187(+1.2%), 총이익 US,642,784(+28.3%), 순손실 US,187,380(손실 5.8% 감소). FY2024 대비 매출 회복은 미완료; 결과는 역사적 수치다. [SEC 20-F](https://www.sec.gov/Archives/edgar/data/1976695/000149315226049341/form20-f.htm)

## 100개 대상

FGL, SHFS, XXII, CDT, INLF, RBNE, NEXR, HUBC, VCIG, RKDA, SXTC, RUBI, SMTK, SDST, PFSA, WHLR, ZNB, MDCX, SPRC, SBFM, PMAX, SGRX, LABT, CISS, NXTS, MNDR, CRIS, VIVK, RCON, MYSZ, WETO, GCTK, LBGJ, LNKS, PAPL, MSS, NXAT, IPW, DBGI, BBLG, TRUG, HKPD, GIPR, TGL, SQFT, FCHL, NUWE, UK, IZM, MLEC, ONFO, HAO, NCT, RAYA, GNLN, NTCL, ATPC, ARTL, KIDZ, IMCC, IPST, IPDN, LNAI, GNPX, VJET, BRNX, OLOX, PWCM, IMTE, EDBL, VRAX, MTNB, XRTX, FMFC, YFOR, EZGO, EDVA, GSUN, CIIT, CHGA, FRGT, SILO, OGEN, GLXG, KAPA, HXHX, SMX, CSAI, SSM, KITT, NXL, DXST, LHSW, DFSC, SGLY, XAIR, ISPC, LGCL, GOVX, ELPW

### 추가 원문 확인 배치 20

2026-10-31에 SEC 원문 12건을 표적 검토했다. 반복 인용은 원문 링크를 따라가며 확인한다. 회사 발표 수치와 조건부 안건은 확정 사실과 구분했다.

| 티커 | 이벤트 일자·상태 | SEC accession | 확인 내용 및 원문 |
|---|---|---|---|
| RKDA | 2026-09-10 — 주주총회, 1:2~1:10 역분할 권한 승인 — 시행 여부·비율 미정 (REPORTED) | SEC 0001193125-26-391780 | 2026-09-10 연례주총에서 이사회가 2027-06-30 이전 재량으로 1:2~1:10 역분할을 시행할 수 있는 정관 변경을 승인했다. 별도 안건으로 2026-06-12 사모에서 발행한 Series A-1 옵션 행사에 따른 보통주 발행도 승인했다. 이번 공시는 실제 분할이나 옵션 행사 완료를 의미하지 않는다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1469443/000119312526391780/rkda-20260910.htm) |
| SMTK | 2026-08-20 — 50:1 역분할 시행 — 8/21 split-adjusted 거래 개시 (COMPLETED) | SEC 0001104659-26-098592 | SmartKem은 2026-08-19 이사회 결의에 따라 2026-08-20 17:00 ET에 보통주 1:50 병합을 시행했고, 2026-08-21 정규장 개장부터 Nasdaq에서 조정 거래한다고 공지했다. 기계적 주가 조정은 투자수익률과 구분한다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1817760/000110465926098592/tm2623548d1_ex99-1.htm) |
| SMTK | 2026-09-10 — Nasdaq $1 최소호가 요건 회복 통지 (COMPLETED) | SEC 0001104659-26-107296 | 회사는 Nasdaq staff가 2026-09-10 통지에서 2026-08-21~09-09 종가가 13영업일 연속 $1 이상이어서 Rule 5550(a)(2) 준수 회복을 확인하고 사안을 종결했다고 공시했다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1817760/000110465926107296/tm2625314d1_8k.htm) |
| LNKS | 2026-10-08 — FY2026 연간 실적 공시 — 매출 보합, 순손실 확대 (REPORTED) | SEC 0001213900-26-107960 | FY2026(2026-06-30 종료) 매출 RM22.58m(US$5.53m), 전년 RM22.42m. 순손실 RM7.61m(US$1.86m)로 전년 RM4.93m보다 확대됐다. 영업활동 현금흐름 사용액은 RM30.27m(US$7.42m)로 보고됐다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1972074/000121390026107960/ea0306192-20f_linkers.htm) |
| DBGI | 2026-10-26 — 공개상장 유지 결정 및 월별 재검토 지속; 회사 현금흐름 전망 상향 주장 (REPORTED) | SEC 0001493152-26-049251 | 회사는 전략 검토 후 공개상장 유지를 결정했지만 상장 유지와 비공개 전환 선택지를 매월 계속 평가한다고 발표했다. 2026년 4분기 정부계약 현금흐름 전망을 $3.3m에서 $4.7m로 올렸다고 밝혔으나 이는 회사 전망이며 실현 현금이 아니다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1668010/000149315226049251/form8-k.htm) |
| HAO | 2026-09-30 — FY2026 연간 실적 — 매출 증가에도 순손실 전환 (REPORTED) | SEC 0001213900-26-105242 | FY2026 매출 US$54.83m(전년 $32.80m), 순손실 $9.536m(전년 순이익 $3.877m), 영업현금 사용 $2.57m를 공시했다. 연말 현금은 $10.933m로 20-F에 기재됐다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1954594/000121390026105242/ea0306597-20f_haoxi.htm) |
| HAO | 2026-08-01 — 온라인 광고사 인수 비구속 LOI 및 환급 조건부 $2m 예치금 (REPORTED) | SEC 0001213900-26-105242 | 회사는 2026-08-01 온라인 광고사 인수 비구속 LOI를 체결하고 08-02 $2m를 예치했다. 20-F 작성 시점에 인수는 협상 단계였고, LOI 체결 6개월 안에 거래가 종결되지 않으면 예치금 전액 환급 조건이라고 밝혔다. 확정 계약·종결 일정은 공시되지 않았다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1954594/000121390026105242/ea0306597-20f_haoxi.htm) |
| EZGO | 2026-08-19 — 300만 주 PIPE 종결 — 총 조달액 $1.5m (COMPLETED) | SEC 0001213900-26-092099 | 2026-08-05 체결한 증권매매계약에 따라 08-19 총 3,000,000주를 주당 $0.50에 발행해 총액 $1.5m를 조달했다고 6-K에 공시했다. 발행 주식은 양도 제한 대상이라고 설명했다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1806904/000121390026092099/ea0302783-6k_ezgo.htm) |
| DFSC | 2026-10-20 — 현금 $7.7m·무차입 잠정치 및 BLISS 시연·ARWEN 사업 현황 (REPORTED) | SEC 0001279569-26-000979 | 회사는 2026-09-30 현재 현금·현금성자산 약 $7.7m, 부채 $0의 미감사 잠정치를 발표했다(2026-06-30 현금 $3.5m). BLISS 미국 육군 사전생산 시연은 8월 완료됐다고 공시했다. 발표일 기준 보통주 4,593,998주와 미전환 prefunded warrant 24,575개를 기재했다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1889823/000127956926000979/ex991.htm) |
| LGCL | 2026-10-07 — 1H FY2026 실적 — 매출 36.6% 감소, 순이익 $2.9m (REPORTED) | SEC 0001493152-26-046090 | 2026-06-30 종료 6개월 매출 RMB245.3m(US$35.74m), 전년 동기 RMB386.9m 대비 36.6% 감소. 순이익 RMB19.9m(US$2.895m), 전년 RMB21.5m보다 7.6% 감소했고 매출총이익률은 35.4%로 전년 33.7%보다 높아졌다고 회사가 발표했다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1954694/000149315226046090/ex99-1.htm) |
| LGCL | 2026-10-02 — 주총 승인 후 수권자본 구조 재편 완료; 10/7 조정 반영 예상 (COMPLETED) | SEC 0001493152-26-045877 | 10-02 임시주총에서 자본감소·주식 세분·증자를 포함한 자본재편을 승인했고 회사는 이를 완료했다고 6-K에서 밝혔다. 회사는 10-07 개장부터 Nasdaq 시장에 반영될 것으로 예상했다. 기존 20m 수권주식에서 50bn 주식으로 바뀐 수권자본 구조이며, 이를 발행·유통주식 수 변화나 역분할로 오인하지 않는다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1954694/000149315226045877/form6-k.htm) |
| IMTE | 2026-12-29 — Nasdaq $1 최소호가 회복 추가기간 만료일 — 2026-12-29 (CONFIRMED_SCHEDULED) | SEC 0001668438-26-000012 | 회사는 Nasdaq으로부터 최소호가 요건 회복을 위한 추가 180일 기간을 부여받아 2026-12-29까지 연장됐다고 6-K에서 공시했다. 준수 회복에는 최소 10영업일 연속 종가가 $1 이상이어야 한다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1668438/000166843826000012/imte260702-6k.htm) |

### 추가 원문 확인 배치 21

미검토 6개 발행사의 최신 SEC 제출물 및 관련 1차 자료를 대조해 7개 이벤트 레코드를 추가했다. 경과한 행사 일정은 실제 개최 확인이 없으면 REPORTED로 유지하며, 조건부 안건과 비구속 거래는 확정 완료와 구분했다.

| 티커 | 이벤트 일자·상태 | SEC accession | 확인 내용 및 원문 |
|---|---|---|---|
| RAYA | 2026-10-14 — 1H 2026 실적 — 매출 증가와 영업·순손실 확대 (REPORTED) | SEC 0001185185-26-004727 | 2026-06-30 종료 6개월 매출은 $12.170m(전년 $8.745m), 매출총이익 $1.902m(전년 $1.737m), 영업손실 $0.978m(전년 $0.637m), 순손실 $0.761m(전년 $0.517m)로 공시됐다. 수익 증가와 손실 확대를 함께 기록한다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1825875/000118518526004727/erayakex99-2.htm) |
| NTCL | 2026-11-09 — 임시주총 예정 — 11/9 21:00 ET (싱가포르 11/10 10:00) (CONFIRMED_SCHEDULED) | SEC 0001104659-26-118522 | 회사는 SEC proxy에서 2026-11-10 10:00 싱가포르 현지시간 임시주주총회를 공지했다(미국 동부시간 11/9 21:00). 10:1 share consolidation 및 정관 개정 안건을 표결할 예정이며, 주총 일정은 공지됐지만 결의 결과는 미확정이다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1927578/000110465926118522/tm2628114d1_ex99-1.htm) |
| NTCL | 2026-11-20 — 10:1 주식병합 제안 — 주총 승인 조건, 11/20 예정 효력일 (REPORTED) | SEC 0001104659-26-118522 | 주주총회에 발행·미발행 Class A/B 각 10주를 1주로 통합하는 안건이 상정됐다. 승인 시 효력일로 2026-11-20을 제시했으며, 11/10 주총 승인 전 조건부 일정이다. 발행·유통주식 수, split-adjusted 거래 개시 시각은 별도 확인 대상이다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1927578/000110465926118522/tm2628114d1_ex99-1.htm) |
| ATPC | 2026-08-14 — 1H 2026 실적 — 매출 $35k, 전년 대비 급감 (REPORTED) | SEC 0001493152-26-037992 | 2026-06-30 종료 6개월 매출은 $35,281로 전년 동기 $243,820보다 감소했다. 계속사업 귀속 순손실은 $224,097(전년 $1,285,819 손실), 총 순손실은 $191,469(전년 $1,336,165 손실)로 공시됐다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1713210/000149315226037992/form10-q.htm) |
| OGEN | 2026-09-17 — CMO의 ONP-002 비강 전달·Phase IIa 발표 공지 — IPAC-RS 9/17 일정 (REPORTED) | SEC 0001493152-26-042843 | 회사는 CMO가 2026-09-17 09:40 ET IPAC-RS 2026 Nasal Innovation Forum 세션에서 ONP-002와 Phase IIa 프로그램을 발표할 예정이라고 9/16 공지했다. 현재 날짜 기준 발표 일정은 경과했지만 실제 발표 완료는 확인되지 않아 REPORTED로 유지한다. 이 발표 공지는 임상 결과 공개가 아니다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1174940/000149315226042843/form8-k.htm) |
| SMX | 2026-09-08 — 플라스틱 4단계 Digital Material Passport 플랫폼 공개 및 무료 체험 제안 (REPORTED) | SEC 0001493152-26-041732 | 회사는 플라스틱에 분자 식별·Digital Material Passport·시장·순환성 크레딧을 연결하는 플랫폼을 공개하고 잠재 고객에 가상 체험 및 자체 소재 무료 trial을 제안했다. 회사 발표 기준 플랫폼·프로그램 공개이며 유료 고객, 매출, 계약 체결은 확인된 사실로 기록하지 않는다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1940674/000149315226041732/ex99-1.htm) |
| SSM | 2026-08-31 — Sports One과 비구속 사업결합 LOI 및 283,500주 등록직접발행 (REPORTED) | SEC 0001171843-26-005808 | Sono와 Sports One이 사업결합 비구속 LOI를 발표했다. 동시에 투자자 그룹은 보통주 283,500주를 매입했으며 회사 발표상 당시 발행 보통주의 19.9%에 해당하고 시장가격·할인 없음·워런트 없음·180일 lock-up 조건이다. 거래는 definitive documentation, due diligence, 규제 검토와 주주 승인이 필요하다. [SEC 원문](https://www.sec.gov/Archives/edgar/data/1840416/000117184326005808/exh_991.htm) |

## 구조화 원본 및 판정 상태

- 전체 종목·운영 종목마스터·시총·운영뉴스 및 SEC 제출 인벤토리: [구조화 조사 JSON](../../data/us-smallcap-event-review-20261031.json)
- 5,662건 개별 제출물의 accession/form/날짜/원문 및 index URL/판독상태 (2026-10-31 공식 submissions 재조회, 신규 3건 포함): [종목별·공시별 검토 원장](../../data/us-smallcap-filing-review-ledger-20261031.json)
- 이벤트 스키마에 정규화한 미국 이벤트 120개(고유 eventId 120개): [시장 영향 이벤트 JSON](../../data/market-impact-events.json)
- 현재 상태: 운영 마스터·시총 기준 검증 100/100, SEC 제출 인벤토리 100/100. 파일링 원장 기준 `FULL_PRIMARY_REVIEW` 39건, `TARGETED_SECTION_REVIEW` 90건, `TRIAGE_EXCERPT` 100건, `INVENTORY_ONLY` 5,433건이다. 이는 문서 수 판독 상태다. 이벤트 레코드 보유 발행사는 100/100, 직접 원문 검토 발행사는 22/100이다. 나머지 78개 발행사의 복구 이벤트 93건은 원문 세부 근거 재검증이 남아 있다. 전체 공시 전수 분석 완료로 표시하지 않는다. 이벤트 미기재는 해당 기간 이벤트가 없다는 판정이 아니다.
- 공시 판독상태 정의: `FULL_PRIMARY_REVIEW`는 전체 공시 본문을 검토, `TARGETED_SECTION_REVIEW`는 SEC 원문에서 이벤트 관련 조항을 확인했으나 전체 문서 검토로 간주하지 않음, `TRIAGE_EXCERPT`는 원문을 가져와 발췌 구간만 검토, `INVENTORY_ONLY`는 제출 메타데이터만 수집한 상태다.
- 관리 구조: 발행사 마스터는 ticker/CIK 및 조사 범위를 소유하고, 파일링 원장은 각 accession과 원문/index URL 및 판독상태를 소유하며, 이벤트 목록은 eventId/sourceId를 통해 원문 공시와 연결한다. 종목 조사 JSON 안의 공시 사본도 canonical accession 원장과 판독상태·검토 배치·eventId를 동기화한다. 검토 시 accession 상태와 이벤트 ID를 함께 갱신하고, 집계 수치는 구조화 JSON에 반영한 뒤 이 보고서와 개발 로그를 동기화한다.
- 운영 서버 재확인(읽기 전용 GET): 2026-10-31 06:06:21~06:06:26Z 기준 market-intelligence API 200. FGL, SHFS, RBNE, SMTK, SDST, SBFM, VIVK, RCON, MYSZ 9개 티커가 운영 마스터에서 활성 COMMON_STOCK임을 재확인했고 USD 시총은 각각 $109,066, $80,164, $214,500, $404,998, $507,212, $14,353,299, $2,410,485, $944,056, $882,747이었다. fundamentals 관측시각은 구조화 JSON에 종목별 저장했다. API의 RSS/SEC 분류 건수는 운영 응답 그대로 보존했으며 SEC 원문 검토를 대체하지 않는다. SEC 원문 확인·구조화 기록은 read-only GET 후 로컬 파일에서 수행했으며 운영 DB 쓰기 없음. 추가 티커 확인(06:16:48~06:16:58Z): PAPL/LHSW/RUBI/MLEC 활성 COMMON_STOCK, 시총 $984,509/$15,748,275/$1,390,969/$994,782; PTIV 조회는 HTTP 200이나 운영 종목마스터 결과 없음. MLEC는 06:20:23Z 조회에서 활성·시총 기준에 들었으나, 청산 승인 후속 절차 위험을 별도 이벤트로 반영했다. 추가 검증(06:28:23~06:28:28Z): UK/IZM/SQFT 모두 HTTP 200, 활성 COMMON_STOCK, 시총 $1,238,782/$1,211,914/$1,204,921; 최신 fundamentals 관측시각은 각각 10/30 07:12:11Z/07:06:35Z/07:12:11Z.



추가 재검증(2026-10-31 06:34~06:38Z): 운영 GET 26개는 모두 적격 COMMON_STOCK·활성·USD 시총 $100M 이하. 운영 응답 전체 47개 check 중 과거 PTIV는 HTTP 200이나 마스터 종목 없음으로 적격 유니버스에 넣지 않았다. SEC 공식 submissions JSON 100/100 성공 및 신규 제출 3건을 구조화 원장에 반영했다.


### 추가 원문 확인 배치 22

FCHL의 SEC 6-K Exhibit 99.2(주총 통지)와 6-K/A Exhibit 99.4(교체 투표카드)를 SEC EDGAR 원문으로 확인했다. 총회 일정을 2026-11-12 10:00 Singapore로 확인하고 KST·미국 동부 표준시(EST) 변환을 별도 기록했다. 2:1 병합과 조건부 100:1 병합은 각기 조건부 안건으로 분리해 eventId를 부여했다. 6-K/A는 투표카드 대체 부분을 검토해 `TARGETED_SECTION_REVIEW`로 기록했다. Batch 22: SEC 문서 2건(전체 본문 1, 관련 섹션 1), 이벤트 레코드 1건 추가; 기존 총회 일정 이벤트도 복구 상태에서 직접 원문 검토 상태로 전환했다. 투표 결과, 실제 병합 여부, F-1 공모 조달액, 조정 거래일 및 병합 후 주식 수는 확인되지 않았다.


### 추가 원문 확인 배치 23

운영 공개 API에서 UK를 재확인했다(2026-10-31 07:22:13.526Z): HTTP 200, NAS 활성 COMMON_STOCK, 시가총액 USD $1,238,782(기초자료 관측시각 2026-10-30 07:12:11.946Z), RSS 3건, 분류 SEC 이벤트 0건. SEC 6-K 0001213900-26-107735의 Exhibit 99.1 발표자료와 99.2 주총 통지를 직접 확인해 기존 복구 이벤트를 원문 검토 상태로 전환했다. 공지된 주총은 Beijing 11월 9일 10:00(11월 9일 11:00 KST, 11월 8일 21:00 EST)이며, 표결 전 조건부 안건이다. Nasdaq 종가 bid 3거래일 연속 $1 미만 시 10:1·8:1·6:1·4:1·3:1·2:1 중 500,000 publicly held shares 이상을 남기는 가장 높은 비율을 선택한다. 2:1도 기준 미달이면 추가 이사회 및 주주 승인 없이는 시행할 수 없다. 수권자본은 A 999.4m, B 0.3m, Series A 우선주 0.3m(총 1bn)로 조정하는 안이나 신규 발행은 아니다. Batch 23은 공시 1건의 관련 섹션을 검토하고 이벤트 1건의 출처 근거를 복구했다. 주총 결과·trigger·최종 비율·효력일·실제 주식수는 미확정이다.


### 추가 원문 확인 배치 24

ONFO의 SEC DEF 14A accession 0001213900-26-110606을 다시 확인했다. 이벤트 날짜가 공시 접수일 2026-10-19로 잘못 기재된 것을 발견해 특별주총 예정일 2026-11-05로 정정했다. 위임장에는 11/5 10:00 a.m. ET 온라인 주총 및 11/4 10:00 a.m. ET 사전등록 마감이 명시되어 있으며 각각 KST로 11/6 00:00, 11/5 00:00이다. 최대 1-for-250 이사회 재량 역분할 권한 표결과 위임장 추가 확보 목적의 별도 연기안이 상정되며, 표결은 실제 시행·비율·효력일이 아니다. 운영 GET(2026-10-31 07:23:56.171Z)은 HTTP 200, NAS 활성 COMMON_STOCK, 시총 $1,234,379 USD(기초값 관측 10/30 07:22:11.933Z)를 재확인했다. 이미 `FULL_PRIMARY_REVIEW`였던 accession을 기준으로 이벤트 원문 상태만 재검증했으며 신규 공시 판독 건수에는 더하지 않았다. 이벤트 총수 120은 유지, 직접 검토 발행사는 19/100, 복구 잔여 이벤트는 96건/81개 발행사다. 결과와 이사회 시행 결정은 미확정이다.


### 추가 원문 확인 배치 25

VCIG의 SEC 6-K accession 0001213900-26-113645 및 Nasdaq Trader Corporate Actions Alert #2026-779를 교차 확인했다. SEC는 1:18 역분할의 효력 시각을 2026-11-02 00:01 Eastern Time으로 공시했고, Nasdaq은 11월 2일 월요일 효력일과 새 CUSIP G98218137을 확인했다. 11월 2일은 미국 표준시 기간이므로 효력 시각은 00:01 EST = 14:01 KST다(기존 13:01 KST 표기를 정정). 회사의 발행·유통주식 수 근사치는 9,639,594주에서 535,533주로 감소하며 공개 유통주식수/free float와 혼동하지 않는다. Nasdaq split-adjusted 거래의 정확한 개장 시각은 해당 공식 자료에서 확인되지 않아 미확인으로 유지했다. 회사가 말한 잠재 institutional transaction은 가능성/포지셔닝 표현이지 확정 투자계약이 아니다. 운영 GET(2026-10-31 07:25:44.123Z): HTTP 200, NAS 활성 COMMON_STOCK, 시총 $248,233 USD(기초값 관측 10/30 07:07:23.504Z). 기존 이벤트 1건을 직접 검증해 source status를 갱신했고 새 event row는 추가하지 않았다. 잔여 복구 이벤트 95건/80개 발행사다.


### 추가 원문 확인 배치 26

TGL SEC DEF 14A accession 0001213900-26-112539를 직접 재검증했다. 2026-11-05 09:00 ET(미국 표준시 EST) 가상 특별주총은 23:00 KST다. 온라인 참석 사전등록 마감은 11/3 23:59 ET(11/4 13:59 KST), 인터넷·전화 투표 수령 마감은 11/4 23:59 ET(11/5 13:59 KST)다. Proposal 1은 이사회에 1:2~1:50 범위 정수비 역분할 권한을 부여하는 안, Proposal 2는 찬성표 부족 시 주총 연기안이다. 회사는 각 제안에 출석·투표권 있는 주식 과반이 필요하다고 기재했다. 1:50 가정은 2026-10-26 발행주식 12,672,698주를 약 253,454주로 감소시키지만, 수권 보통주 600,000,000주는 유지되어 수권 미발행 주식 기반 희석 여력이 커질 수 있다고 공시했다. 이는 향후 실제 발행 확정 사실이 아니다. 운영 GET(2026-10-31 07:27:14.124Z)은 HTTP 200, NAS 활성 COMMON_STOCK, 시총 $1,212,060 USD(기초값 관측 10/30 07:19:39.766Z)를 확인했다. 기존 이벤트 1건을 원문 직접 검증 상태로 바꾸었고 신규 이벤트는 추가하지 않았다. 총 이벤트 120건, 직접 검토 발행사 21/100, 복구 대기 94건/79개 발행사다.


### 추가 원문 확인 배치 27

IPDN의 SEC 8-K accession 0001437749-26-033122과 Form D 0001437749-26-033645·0001437749-26-033805를 대조했다. 10/21 8-K는 146,713주×$1.704, gross $249,998.952(10/14 종가 $2.84의 60%) 사모발행을 보고하고 종결 목표를 11/3 전후로 연기했으며 기업·규제 승인 및 Nasdaq 심사조건이 남았다고 했다. 10/27 Form D 033645는 total sold $249,999/remaining $0라고 표기하면서도 같은 SPA 종결 예상일을 11/3 전후로 명시한다. 종결 신호가 엇갈리므로 확정 완료로 처리하지 않고 ESTIMATED로 보존했다. 해당 Form D first sale date는 10/16, 3 investors다. Form D 033805는 별도의 1월 소프트웨어 서비스 계약에 대해 1/27 발행 보통주 106,753주, offering/sold $120,000 및 remaining $0를 회사 보고했다. 두 Form D 내용을 혼합하지 않고 1/27 서비스 대가 주식발행 이벤트를 별도 레코드로 추가했으며, 양식의 SEC 비검토 고지와 정보 범위를 기록했다. 운영 GET(2026-10-31 07:28:47.614Z): HTTP 200, NAS 활성 COMMON_STOCK, 시총 $1,318,306 USD(기초 fundamental 관측 10/30 07:10:33.550Z). Batch 27에서 SEC 제출물 3건의 관련 항목을 검토, 기존 추정 종결 이벤트 1건 원문 재검증 및 과거 주식발행 이벤트 1건을 추가했다. 총 이벤트 121건, 직접 원문 검토 발행사 22/100, 재구성 잔여 93건/78개 발행사다.


### 추가 원문 확인 배치 28

GNPX SEC 8-K accession 0001437749-26-033700(10/28 제출)을 전체 검토했다. GSA 2026 poster session의 일정은 11/4 18:00–19:15 ET(EST) = 11/5 08:00–09:15 KST이며, Gaylord National Resort & Convention Center Exhibit Hall C-D, Late Breaking Poster Session I, abstract 2489375로 확인된다. 발표 제목은 “TUSC2 Gene Therapy in Humans Induces a Cellular-Resilience Program”이다. 회사는 Meharry 후원연구가 미토콘드리아 생물학·세포 회복력·노화 관련 분자과정을 조사한다고 설명하고, 추가 연구 필요성을 명시한다. 따라서 발표 일정은 확정으로 유지하되 임상 효능 입증, 노화질환 치료 효과 또는 FDA 심사 이벤트로 해석하지 않는다. 10/21 8-K 0001437749-26-033053도 직접 확인했으며 이는 별도의 TUSC2 결손 마우스/인간 뇌 발현 자료 및 논문 관련 발표다. 운영 read-only GET(2026-10-31 07:34:45.313Z)은 HTTP 200, 활성 NAS COMMON_STOCK, 시총 $1,672,206 USD(가격 데이터 관측/수집 10/30 07:10:33.550Z), RSS 5건, SEC 분류 이벤트 0건을 반환했다. 신규 이벤트는 없고 재구성 이벤트 1건을 직접 검증으로 승격했다. 총 이벤트 121건, 직접 검토 발행사 23/100, 재검증 대기 92건/77개 발행사다.


### 추가 원문 확인 배치 29

CHGA SEC 8-K accession 0001213900-26-114381(2026-10-30)을 원문 확인했다. Item 5.07은 특별주총에 보통주 406,853주가 참석/대리 represented되어 정족수를 구성했고 17개 안건의 승인을 보고한다. 관련 안건에는 ELOC 발행 및 ELOC 워런트 기초 46,297주(안건 1·2), Nasdaq 규칙 범위 내 미래 20% 발행(3), 두 노트 전환(4·5), forbearance 18,000주(6), 수권주식 100M에서 125M(7), 컨설턴트 주식 15,000+30,000+37,500+10,000주(8–11), pre-funded warrants 기초주식 50,000+100,000+84,000주(12·14·15), MFN 15,000주(13), 주식보상 예비분 100,000주에서 500,000주(16)가 포함된다. 이는 주주 승인/잠재 발행 권한을 나타내며 각 증권의 실제 발행·행사·전환 수량이나 시점을 뜻하지 않으므로 별도 후속 확인 위험을 남겼다. Proposal 2 결과는 찬성 156,967·반대 1,848·기권 26·broker non-votes 248,012이다. 운영 GET(2026-10-31 07:37:32.622Z)은 HTTP 200, 활성 NAS COMMON_STOCK, USD 시총 $1,635,521(관측·수집 10/30 07:05:44.799Z), RSS 11건과 SEC 분류 이벤트 0건을 반환했다. 신규 이벤트 없이 기존 복구 이벤트 1건을 직접 검증했다. 총 이벤트 121건, 직접 검토 발행사 24/100, 재검증 대기 91건/76개 발행사다.


### 추가 원문 확인 배치 30

EDBL SEC 8-K 0001477932-26-006550, SHFS SEC 8-K 0001493152-26-049470, NCT SEC 6-K 0001213900-26-114261을 확인했다. EDBL은 10/30 Prairie Hills RTD 제조시설 취득을 종결했다. 총 대가 $6.325M 중 $2.5M은 Series B 우선주 평가액, $3.825M은 5년 만기·연 8% 일복리 담보어음이다. 전액 현금인수로 기록하지 않았다. SHFS는 10/24~30 Series B 우선주 7,329주 전환으로 보통주 60,570,250주를 주당 $0.1210에 발행했고 이 전환으로 추가 현금대가를 받지 않았다고 보고했다. 10/30 발행주식은 85,512,985주다. NCT는 10/27 등록 직접공모에서 주당 $1.30에 Class A 보통주 15,000,000주 발행·매각을 완료했으나 약 $19.5M 예상 유입은 투자자별 3개월 내 전액납입 전제다. 미납 시 회사가 법률상 허용 범위에서 해당 주식을 몰수할 수 있어 예상 유입을 확정수령으로 보지 않았다. 운영 read-only GET: EDBL 07:40:09.244Z/$1,482,561, SHFS 07:40:19.609Z/$80,164, NCT 07:39:51.720Z/$1,577,140 (모두 USD, 가격 관측일 10/30); 각 NAS 활성 COMMON_STOCK. 세 이벤트 모두 신규 추가 없이 원문 검증 상태로 승격했다. 누적 미국 이벤트 121건, 직접 검토 발행사 27/100, 복구 이벤트 재검증 대기 88건/73개 발행사.


### 추가 원문 확인 배치 31

GCTK SEC 8-K 0001493152-26-049299 및 LNAI SEC 8-K 0001731122-26-001362와 Nasdaq 공식 Security Status Updates를 대조했다. Nasdaq 상태표는 2026-10-30 양사 COMMON STOCK을 `Issue Suspensions`로 기록해 예정된 거래정지 실행을 확인한다. GCTK 8-K의 정지 예정은 10/30 개장이다. LNAI 8-K는 10/28 청문요청을 하지 않을 의사와 10/30 개장 정지를 명시하고, 별도로 10/22 이사회의 자발적 Nasdaq 상장철회·Exchange Act §12(b) 등록철회 승인도 보고한다. 이에 LNAI suspension(완료)과 voluntary delisting intent(보고·절차 진행)를 별도 이벤트로 관리한다. Form 25 제출·등록해제 효력 및 OTC 거래는 미확인이다. 운영 공개 GET은 두 ticker 모두 활성 NAS COMMON_STOCK 마스터로 반환했으나 이는 Nasdaq 거래 가능 확인으로 사용하지 않았다. GET 시각 07:42:44Z/07:42:53Z, USD 시총 GCTK $3,291,854, LNAI $829,677(관측일 10/30). 총 이벤트 122건, 직접 검토 29/100, 재검증 대기 86건/71개 발행사다.


### 추가 원문 확인 배치 32

ELPW SEC 6-K accession 0001493152-26-049441을 확인했다. EGM은 10/30 10:00 Beijing(10/29 22:00 EDT = 10/30 11:00 KST)에 열렸고 모든 표결 안건이 승인됐다. 기준일 10/9 Class A 929,541주·Class B 2,548주가 있었으며 Class A 13,324주와 Class B 2,548주가 출석/대리되어 기준 의결권의 약 36.336%였다. Proposal 1은 Cayman 회사 deregistration 및 BVI continuation, 각 Class A/B 1:1 no-par-value share redesignation을 승인했으나 필요한 정부·규제 동의를 조건으로 한다. EGM 승인과 법인전환의 법적 완료를 구분했다. RUBI SEC 6-K accession 0001171843-26-006911 Exhibit 99.1은 1:25 병합 및 10/30 Nasdaq 개장 split-adjusted 거래, 10/28 발행주식 13,517,355주에서 약 540,694주로의 회사 추정, 단주 현금정산 조건을 설명한다. Nasdaq ECA #2026-775는 10/30 효력과 CUSIP Y1250N305를 확인했다. 이 수치는 발행주식이며 유통주식 수가 아니고 기계적 가격 조정은 투자수익률과 구별한다. 운영 read-only GET(10/31 07:45:34Z/07:45:39Z)은 양사 모두 활성 NAS COMMON_STOCK, USD 시총 ELPW $2,556,238 및 RUBI $1,390,969(기초가격 관측 10/30)를 반환했다. 신규 이벤트 없이 복구 이벤트 2건을 원문 검토로 승격했다. 누적 122건, 직접 검토 31/100 발행사, 재검증 대기 84건/69개 발행사다.


### 추가 원문 확인 배치 33

GOVX SEC 8-K accession 0001437749-26-033610 Item 5.07을 확인했다. 10/27 주총에서 1:10~1:25 범위 역분할을 이사회 재량으로 승인(찬성 3,484,374·반대 828,802·기권 12,837)했지만 시행일·비율은 미정이다. 또한 8/25 warrant inducement 관련 기발행 워런트 행사 시 최대 11,395,256주 발행 안건이 승인(찬성 1,492,403·반대 458,659·기권 44,131·broker non-votes 2,330,820)됐다. 8/28 발행주식 9,093,871 대비 최대수량 약 125.3%는 산술 비교이며 실제 행사·발행·희석률이 아니다. HKPD SEC 6-K accession 0001213900-26-111190 Exhibit 99.1과 Nasdaq ECA #2026-751을 교차 확인했다. 1:20, 10/26 시장 개시 효력 및 같은 날 split-adjusted 거래, par value $0.001→$0.02, CUSIP G6365B112, 단주 participant-level 올림을 확인했다. 회사는 최소호가 요건 회복을 보장하지 않는다고 명시한다. 운영 read-only GET(07:48:39Z/07:48:43Z): GOVX/HKPD 모두 활성 NAS COMMON_STOCK, 시총 $1,878,129/$24,090,000 USD(기초가격 관측 10/30). 기존 이벤트 3건을 직접 검증으로 승격, 신규 event row 없음. 누적 122건, 직접 검토 33/100, 재검증 대기 81건/67개 발행사.


### 추가 원문 확인 배치 34

TRUG SEC 8-K accession 0001493152-26-047953 Item 8.01과 최신 10/28 8-K/A accession 0001493152-26-048861을 확인했다. 8-K는 6/30 10-Q 기준 주주자본 $2,060,281로 Nasdaq $2.5M 최소기준에 $439,719 부족했다고 재진술한다. 동시에 10/9 종결 Polymath 인수의 대가로 Class A 257,494주와 Series C 전환우선주 136,956주를 발행했고, 10/8 Series B 워런트 행사로 Series B 우선주 3,278주를 $2.95M에 발행(표시가치 $3.278M)하는 조달을 보고했다. 회사는 해당 자산·조달 반영 후 10/21 현재 기준을 회복했다고 믿는다고 밝혔다. Nasdaq은 다음 정기보고까지 계속 모니터링하고, 그때 요건을 입증하지 못하면 delisting 대상이 될 수 있다고 회사에 통지했다. 이에 historical June deficiency와 issuer-reported regain을 서로 다른 event row로 보존하고 Nasdaq 최종 확인/다음 정기보고 위험을 남겼다. 10/28 8-K/A는 이사 committee assignment 변경만 보고하고 equity compliance 상태를 추가 갱신하지 않았다. 운영 read-only GET(10/31 07:51:30.533Z): 활성 NAS COMMON_STOCK, 시총 $956,636 USD(가격 관측 10/30 07:06:35.275Z). 이벤트 총 123건, 직접 검토 34/100, 복구 이벤트 재검증 대기 80건/66개 발행사다.


### 추가 원문 확인 배치 35

IPST SEC 8-K accession 0001788230-26-000091 Item 8.01에서 Nasdaq이 10/23 제출된 6/30 분기 10-Q를 근거로 Rule 5250(c)(1) 적시 정기보고 위반의 회복을 결정하고 해당 사안을 종결했음을 확인했다. 이는 filing timeliness 사안만을 닫으며 재무 건전성이나 다른 상장요건에 대한 인증은 아니다. SPRC SEC 6-K accession 0001213900-26-112470에서 405,728 기존 워런트의 행사가를 $4.929에서 $1.00로 낮춘 현금행사 합의, 예상 총액 약 $405,728, 10/27 전후 종결 예정 및 통상 종결조건을 확인했다. SEC 제출목록에서 cutoff 10/31까지 별도 종결 확인을 찾지 못해 ESTIMATED 상태를 유지했다. 운영 read-only GET(07:53:27.967Z/07:53:31.380Z): IPST/SPRC 모두 활성 NAS COMMON_STOCK, 시총 $2,619,304/$408,321 USD(가격 관측 10/30), 각각 RSS 3/5건, 분류 SEC event 0건. 재검증 복구 이벤트 2건, 이벤트 총 123건, 직접 원문 검토 발행사 36/100, 대기 78건/64개 발행사.


### 추가 원문 확인 배치 36

LHSW SEC 6-K accession 0001213900-26-114516 Exhibit 99.1의 1:8 병합 공시에서 10/26 Nasdaq 개장 조정거래, 액면가 $0.0016→$0.0128, CUSIP G5480C120, 병합 전 Class A/B 발행주식 22,878,354/2,587,500 및 회사 추정 병합 후 2,859,795/323,438주(단주 올림 영향)를 확인했다. Nasdaq Trader ECA #2026-759로 Class A 효력일·액면가·CUSIP를 교차 확인했다. NUWE SEC 8-K accession 0001140361-26-040605 Items 3.03/5.03과 Nasdaq Trader ECA #2026-764에서 1:9 병합의 10/26 17:00 EDT 법적 효력 및 10/27 미국장 개장 조정거래, 새 CUSIP 67113Y884를 확인했다. 해당 8-K에는 전후 주식 수가 없어 미산출로 유지했다. 운영 GET(07:55:17.339Z/07:55:21.731Z): LHSW/NUWE 활성 NAS COMMON_STOCK, USD 시총 $15,748,275/$21,081,163(기초가격 관측 10/30), RSS 5/6건, 분류 SEC 이벤트 각 0건. 이벤트 총 123건, 직접 원문 검토 38/100, 복구 이벤트 대기 76건/62개 발행사.


### 추가 원문 확인 배치 37

NEXR SEC 6-K accession 0001213900-26-113293을 직접 검토했다. 1:5 병합 효력은 2026-11-06, 같은 날 Nasdaq 개장부터 조정거래 예정이며 보통주 CUSIP M61472177로 변경, 공개 워런트 NEXRW CUSIP은 유지된다. 발행주식은 2,513,147주에서 약 502,630주로 회사 추정(단주 DTC participant-level 올림 영향)이며 유통주식 수와 구분했다. 별도 정량 희석 리스크로 Series A 및 2026년 6월·9월 note warrants 행사가가 10/22 $0.609488, 10/28 $0.38148로 조정됐고 warrants/options 수량·행사가도 비례 조정된다고 기록했다. 10/31 cutoff까지 Nasdaq Trader에서 11/6 조치의 corporate action alert를 찾지 못해 거래일 전 재확인 대상으로 남겼다. 운영 GET(07:56:44.876Z): 활성 NAS COMMON_STOCK, 시총 $175,322 USD(가격 관측 10/30), RSS 4건, 분류 SEC 이벤트 0건. 이벤트 123건, 직접 검토 39/100, 재검증 대기 75건/61개 발행사.


### 추가 원문 확인 배치 38

SGLY SEC DEFR14A accession 0001213900-26-112755 Amendment No.1은 8/27 위임장을 수정·대체하고 특별주총을 2026-11-09로 연기했다. 다섯 안건 중 최대 250M주 미래발행(안건 1 표 요약 조건: $30M 한도, 할인 최대 80%, 전략 인수·투자 목적, 2027-02-09까지), $0.001 행사가의 6,897,636 수정 워런트, 회사명 변경, 이사회 재량 1:5/1:10/1:20 역분할, 별도 Nasdaq Rule 5635(d) 미래발행 승인을 구분해 기록했다. Record-date 10/26 보통주 5,403,788주는 발행주식 수이며 public float가 아니다. 중요: 공시 표지/초청문은 11:00 a.m. ET이나 Q&A는 10:00 a.m. ET로 내부 시간 상충이 있어 정확한 회의시각과 KST 변환은 미확정으로 남겼다. SEC acceptance 14:00:07Z는 Q&A 시각과 일치하지만 공시 자체가 모순을 해소하지 않으므로 한쪽을 확정값으로 택하지 않았다. 표결·발행·워런트 행사·병합은 미완료다. 운영 GET(07:58:00.983Z): 활성 NAS COMMON_STOCK, 시총 $2,728,374 USD(가격 관측 10/30), RSS 1건, SEC 분류 이벤트 0건. 이벤트 총 123건, 직접 원문 검토 40/100, 재검증 대기 74건/60개 발행사.


### 추가 원문 확인 배치 39

CRIS SEC PRE 14A accession 0001140361-26-040582은 subject to completion 예비 위임장이며, 2026-11-18 11:00 a.m. EST 온라인 특별주총을 공지한다. KST는 11/19 01:00이다. Proposal 1은 1:5~1:12 역분할 권한으로, 정확한 비율·시행일은 이사회 재량이고 이사회는 안을 포기할 수 있다. Proposal 2는 표가 부족할 때 proxy 추가 모집을 위한 연기안이다. 인터넷/전화 proxy 마감은 11/17 23:59 EST=11/18 13:59 KST다. 10/26 record date의 유권주식 수와 quorum 주식 수는 preliminary draft에서 공란이다. 10/31 cutoff까지 issuer 제출 snapshot에서 definitive proxy를 확인하지 못해 preliminary status를 명시하고 일정·안건 재확인 제한을 남겼다. 운영 GET(2026-10-31 08:00:00Z): 활성 NAS COMMON_STOCK, 시총 $1,146,409 USD(가격 관측 10/30), RSS 2건, SEC 분류 이벤트 0건. 총 123 events, 직접 원문 검토 41/100, 재검증 대기 73건/59개 발행사.

### 추가 원문 확인 배치 40

CDT의 복구 이벤트 SEC DEF 14A accession 0001493152-26-048693을 재검증했다. definitive proxy는 2026-11-12 10:00 a.m. Eastern Time 가상 특별주총을 공지한다(당일 EDT 기준 KST 23:00). Proposal 1은 J.J. Astor & Co.에 발행된 senior secured convertible notes와 common stock purchase warrants에 따른 주식발행 승인(Nasdaq Rule 5635 목적)이다. Proposal 2는 개별 1:2~1:100, 누적 최대 1:1,000 역분할 수정안 권한이며 비율·시기는 이사회 재량이고 amendment를 포기할 수 있다. Proposal 3은 안건 1·2 표결 지속을 위한 연기안이다. 주총 일정은 확정 공지이나 승인·실제 주식 발행/전환·워런트 행사·병합은 완료되지 않은 미래 조건이다. 이벤트 evidence 5건, 잠재 희석/이사회 재량 위험, 결과 미확인 제한을 이벤트 JSON에 기록했다. 운영 GET(2026-10-31 08:02:18Z): HTTP 200, NAS 활성 COMMON_STOCK, 시총 $86,588 USD(기초 관측 2026-10-30T07:08:56.646Z), RSS 10건, SEC 분류 이벤트 0건, DB write 없음. 누적 123 events. 후속 상태 원장에서 `RECOVERED_PENDING_REVALIDATION`을 직접 집계한 결과 70건/58개 발행사로 확인되어 기존 요약 수치 72건을 정정한다.


### 추가 원문 확인 배치 41

XAIR의 복구 이벤트 2건을 원문으로 재검증했다. Beyond Air 발행사 GlobeNewswire 발표 GNW:3391208(2026-10-29 08:00 ET)은 2026-09-30 종료 분기 결과를 11/11에 발표한다고 공지했으나 발표 시각은 미공개이며, conference call/webcast 시작은 같은 날 16:30 ET다. 11/11은 EST 적용일이므로 콜은 KST 11/12 06:30이다. 콜 시각을 실적 발표시각으로 잘못 해석하지 않도록 이벤트 evidence·risk에 분리 기록했다. SEC DEF 14A accession 0001493152-26-049442는 12/10 16:30 EST 대면 정기주총, Garden City 주소, 10/12 record date, 이사 5명, 2026-04-01~12-31 전환기간 감사인 추인, 비구속 임원보상 자문표결, 연기안 등 5개 안건을 확인했다. KST는 12/11 06:30이다. DEFA14A 0001493152-26-049445와 graphic 첨부를 추가 조회했으며 기계판독 본문에 일정 변경 문구는 없었으나 첨부 graphic 이미지는 OCR 판독하지 않아 일정 변경 여부를 완전 확인한 것으로 보지 않는다. SEC DEF 14A ledger 상태를 FULL_PRIMARY_REVIEW로 승격하고 filing/event counts는 accession 및 reviewedEvents 행에서 재계산하도록 원장 요약을 정규화했다. 운영 GET(2026-10-31 08:05:14Z): HTTP 200, NAS enabled COMMON_STOCK, USD cap $3,847,259(기초 관측 10/30), RSS 5, 분류 SEC events 0, DB write 없음. 이벤트 수 123건 유지; 직접 원문 검토 발행사 42/100, 잔여 pending은 상태 상세 원장 집계상 68건/57개 발행사.


### 추가 원문 확인 배치 42

BRNX SEC 6-K accession 0001213900-26-111075 및 Exhibits 99.1 Notice, 99.2 Proxy Statement, 99.3 Proxy Card를 재검증했다. 11/6 12:00 Israel Standard Time 특별주총은 05:00 EST=19:00 KST, record date 10/22. 단일 안건은 보통주 및 option/RSU/restricted share/warrant로 발행될 보통주 포함 3:1~6:1 역분할 승인이다. 단순 과반이 필요하며 주주 승인 후에도 이사회가 실행 여부·정확한 비율·효력일을 정한다. 회사가 밝힌 목적은 Nasdaq Rule 5550(a)(2) $1 minimum bid-price 요건 대응이나, 회사 문서 자체가 병합 후 비율만큼 가격 유지·유동성·상장요건 충족을 보장하지 않는다고 적는다. 최초 회의에서 정족수가 30분 내 충족되지 않으면 같은 날 13:00 Israel로 연기하고, 연기 회의에서는 출석/위임 주주 수에 무관하게 정족수로 간주하는 조항을 확인했다. 10/31 cutoff SEC 제출목록에서 후속 안건 변경은 찾지 못했지만 실제 표결/이사회 결정/효력일은 미확인이다. 운영 GET(2026-10-31 08:10:07Z): HTTP 200, NAS 활성 COMMON_STOCK, USD 시총 $1,129,438(기초 관측 10/30), RSS 5건, 분류 SEC event 0건, DB write 없음. 상세 status를 기준으로 잔여 복구 이벤트 67건/56개 발행사. 직접검토 종목 수는 PRIMARY_SOURCE_REVIEWED와 FULL_PRIMARY_REVIEW_VERIFIED의 고유 티커 합집합으로 정의를 정규화해 46/100으로 갱신했다(이전 보고는 verified 상태 별도 집계).

### 추가 원문 확인 배치 45 — GSUN 주주회의·주식통합 및 이사 변경

운영 공개 GET `2026-10-31T08:23:31.343Z`: HTTP 200, NAS enabled `COMMON_STOCK`, USD 시총 $1,672,014(기초 가격 관측 `2026-10-30T07:19:39.766Z`), RSS 0건, SEC 분류 이벤트 0건. 운영 DB에는 쓰지 않았다.

SEC 6-K accession `0001213900-26-111081`의 Exhibit 99.1~99.4를 각각 회의 통지·위임장·proxy card로 연결했다. 11/23 09:00 Beijing(10:00 KST; 11/22 20:00 EST) Class A 별도 회의는 Class B 1주 의결권을 50표에서 100표로 변경하는 class-rights 특별결의(투표권 2/3 찬성)를 다룬다. Class B 단독 보유자의 서면 동의와 Class A 표결은 별개다. 같은 날 10:00 Beijing(11:00 KST; 11/22 21:00 EST) 연례주총은 앞선 회의 종료/연기 후 개최될 수 있으며 이사 7명 재선임, 감사인 재선임, 1:10 주식통합, 정관 개정 등을 표결한다. 두 자료 모두 record date 10/20을 둔다.

위임장 통지에는 proxy 마감이 전일 23:59 ET로, 각 proxy card에는 회의 48시간 전으로 기재되어 있어 충돌을 해결하지 않고 이벤트의 위험·제한에 보존했다. 연례주총 1:10 통합 제안의 12/23은 주총 ordinary-resolution 승인 조건부 날짜 목표다. 공시는 수권 Class A 180M→18M, Class B 20M→2M을 제시하지만 실제 발행/유통 주식수는 확인되지 않는다. 단주 올림, Nasdaq $1 최소호가 대응 목적과 비보장 문구를 기록했고, 2026 조정거래 개시 시각·CUSIP은 검토 자료에서 미확인으로 남겼다.

별도 SEC 6-K `0001213900-26-111018`은 Liming Xu의 개인 사유 이사 사임 및 Bekazela Matshazi의 후임 선임이 9/23 효력이라고 보고한다. 회사는 사임이 회사와의 이견 때문이 아니라고 진술했다. 과거 지배구조 이벤트로 신규 레코드화했다.

세 이벤트를 직접 검토로 승격하고 이사 변경 이벤트 1건을 추가했다. 검토 원장, canonical 이벤트, SEC filing ledger의 accession/event ID를 연결하고 2개 accession을 `FULL_PRIMARY_REVIEW`로 설정했다. 누계: 미국 이벤트 126건, 전체 import input 127건(KR 포함), 직접 원문 검토 발행사 49/100, 재검증 대기 60건/53개 발행사. 제출 원장 상태는 실제 accession별로 재계산했다. 이는 100개 발행사의 조사창 제출물 전체 본문을 전수 판독했다는 의미가 아니다.
### 추가 원문 확인 배치 46 — OLOX ELOC 해지·종료주식·조건부 true-up

운영 공개 GET `2026-10-31T08:28:50.129Z`: HTTP 200, NAS 활성 `COMMON_STOCK`, USD 시총 $1,325,821(기초 관측 `2026-10-30T07:11:23.106Z`), RSS 8건, 운영 분류 POSITIVE SEC_EDGAR 1건(accession `0001213900-26-111128`), `secEvents` 0건. 111128 분류기록은 이번 이벤트 원문 검토 근거와 구별했다. 운영 DB 쓰기 없음.

SEC 8-K accession `0001213900-26-113934`의 Items 1.01/3.02와 Exhibit 10.1을 직접 검토했다. 해지는 10/27 효력이다. 8-K는 원래 최대 $100M ELOC에서 주식을 매도하지 않았고 회사가 그 약정액을 받지 않았다고 보고한다. 다만 미사용 ELOC·등록권리계약 상호 해지의 대가로 매수인에게 보통주 298,604주를 인도하기로 해, 기존 복구 이벤트 날짜를 실제 해지일로 정정하고 인도 일정을 별도 관리한다.

| 이벤트 ID | 날짜·상태 | 구조화 판단 |
|---|---|---|
| `SEC:0001213900-26-113934:ELOC_TERMINATION_WITH_SHARE_CONSIDERATION` | 2026-10-27, `REPORTED` | 계약 해지 완료. ELOC 주식 매도/약정액 수령 없음과 별도 종료주식 인도 의무를 구분 |
| `SEC:0001213900-26-113934:TERMINATION_SHARES_DELIVERY_DEADLINE` | 2026-11-17, `ESTIMATED` | 계약상 14번째 영업일 계산. 미국 주말과 11/11 연방 공휴일을 제외하면 11/17; 17:00 EST는 11/18 07:00 KST. 계약의 business-day 정의가 확정되지 않아 계산 일정이며 이행은 미확인 |
| `SEC:0001213900-26-113934:TERMINATION_SHARE_TRUE_UP` | 2027-04-27, `ESTIMATED` | 10일 VWAP가 $0.80 미만일 때 추가주식 요구 권리, 3영업일 내 인도 조건. 실제 수량·요구·발행은 미확정 |

계약 §2는 수량을 숫자로 `298,604`라 쓰면서 같은 구절의 영문 표기는 “two hundred and eighty thousand”으로 적었다. 숫자 표기는 8-K와 일치하지만 계약 자체의 수량 불일치는 unresolved risk로 보존했다. 또한 true-up 산식 문구와 $0.79일 때 327,139주가 된다는 예시 간 산술 관계가 명료하지 않아 임의 계산 결과를 생성하지 않았다.

이벤트 3건을 accession 및 원문 URL에 연결하고 8-K accession을 `FULL_PRIMARY_REVIEW`로 승격했다. 누계: 미국 이벤트 128건, 직접 원문 검토 발행사 50/100, 원문 재검증 대기 59건/52개 발행사. filing ledger 5,662건 상태를 accession별로 다시 집계했다. 제출 이행 확인이나 후속 발행 증거는 이번 검토 범위에서 확인되지 않았다.
### 추가 원문 확인 배치 47 — NXL 주주표결·상장요건·LATAM 계약

운영 공개 GET `2026-10-31T15:09:45.479Z`: HTTP 200, NAS 활성 `COMMON_STOCK`, USD 시총 $1,709,099(KIS 기초 관측 `2026-10-30T07:07:23.504Z`), RSS 5건, 호재분류 2건, SEC 분류 이벤트 0건. 운영 DB 쓰기 없음. 가장 최근 feed에는 10/27 논문 발표 뉴스가 있으나 원문 임상 논문을 이번 이벤트 일정으로 검증하지 않아 확정 촉매로 추가하지 않았다.

SEC PRE 14A accession `0001829126-26-011511`은 preliminary/subject-to-completion 위임장이다. 12/4 10:00 a.m. EST 가상 특별주총은 KST 12/5 00:00이며, record date는 10/30이다. Proposal 1은 Alumni Capital Any Market Purchase Agreement(AMPA)에 따른 Nasdaq Exchange Cap 초과 발행을 Rule 5635(d) 목적상 표결하며 과반 찬성이 필요하다. cap은 149,750주(<20% of 748,754주 직전 발행주식). 최대 투자금액은 $15M이며 proxy 시나리오상 매입가 $2/$1.50/$1일 때 각각 7.5M/10M/15M주, 사후주식 중 발행분 86.71%/89.69%/92.88%다. 이는 회사의 가정 시나리오이며 발행 전망이 아니다. 매입가격은 여러 시장가 연동 산식 중 선택하고 최소가격 하한이 없다고 공시했다. 10/20 commitment shares 100,732주 중 투자자는 60,000주를 매도했고 40,732주를 보유. 기준일 현재 AMPA 구매통지에 따른 주식 매입은 없었다. 위임장 의결권 섹션은 기준일 주식수를 `[●]` 공란으로 두지만 후속 시나리오 표는 1,149,259주를 인용해 내부 문서 공란을 표시했다. definitive proxy/표결 결과는 미확인이다.

Nasdaq 9/25 Hearings Panel 결정(8-K `0001829126-26-010495`)의 두 조건을 분리했다. 최소호가 요건은 회사가 Nasdaq의 9/30 회복 통지를 받았다고 8-K `0001829126-26-010686`에서 보고했으며 역사 이벤트로 따로 기록했다. 최소 주주자본 $2.5M 입증은 2027-01-04까지 계속 요구되고, 미충족 시 delisting 대상이라는 회사 공시를 미래 기한 이벤트로 관리한다. 시가총액이나 KIS listed-share snapshot을 GAAP 주주자본으로 대체하지 않았다.

8-K `0001829126-26-010685` Item 1.01 및 Ex.10.1/99.1은 Nexalin Sync의 브라질·아르헨티나·칠레·우루과이·파라과이·에콰도르·베네수엘라 10년 독점 유통 프레임워크와 최초 100대 프로그램을 보고한다. 계약 clause 6.3 및 8-K 설명은 최초 주문 5대라고 하나 동시 발행사 보도자료는 10대라고 기재해 불일치를 남겼다. 실제 purchase order 승인·납품·수익은 확인하지 않았다. 보도자료의 브라질 임상 파일럿 “서명 후 90일 이내 목표”는 계약일 9/22를 기준으로 12/21을 산술 추정 일정으로 분리했으며, 원문에는 구체 일정·시각·timezone이 없어 `ESTIMATED`다. 규제·성능 조건과 미래 매출을 보장하지 않는다는 위험도 기록했다.

세 filing accession(010495, 010685, 010686)을 새로/추가 `FULL_PRIMARY_REVIEW`로 연결했고 기존 PRE14A를 직접 원문 검토로 갱신했다. NXL 이벤트 5건(이번 검토에서 3건 추가·2건 복구 이벤트 검증)과 SEC accession/event ID 관계를 원장에 반영했다. 누계: 미국 이벤트 131건, 직접 원문 검토 발행사 51/100, 재검증 대기 57건/51개 발행사, 제출 원장 5,662건.

주요 원문: [PRE 14A](https://www.sec.gov/Archives/edgar/data/1527352/000182912626011511/nexalintech_pre14a.htm), [Nasdaq Panel 조건 8-K](https://www.sec.gov/Archives/edgar/data/1527352/000182912626010495/nexalintec_8k.htm), [배급계약 8-K](https://www.sec.gov/Archives/edgar/data/1527352/000182912626010685/nexalintec_8k.htm), [서명된 계약 Ex. 10.1](https://www.sec.gov/Archives/edgar/data/1527352/000182912626010685/nexalintec_ex10-1.htm), [회사 보도자료 Ex. 99.1](https://www.sec.gov/Archives/edgar/data/1527352/000182912626010685/nexalintec_ex99-1.htm), [최소호가 회복 8-K](https://www.sec.gov/Archives/edgar/data/1527352/000182912626010686/nexalintec_8k.htm).
### 추가 원문 확인 배치 48 — RCON 연례주총 및 자본구조 표결

운영 공개 GET `2026-10-31T15:13:21.809Z`: HTTP 200, NAS 활성 `COMMON_STOCK`, USD 시총 $944,056(KIS 가격 관측 `2026-10-30T11:58:46.792Z`), RSS 3건, bullish 분류 0건, SEC 분류 이벤트 0건. RCON 운영 스냅샷의 KIS `listed_shares` 963,224는 SEC 위임장 상의 전체 A/B ordinary shares 22,201,597과 측정범위가 달라 구별해서 저장했다. 운영 DB write 없음.

SEC 6-K accession `0001104659-26-120073` Exhibit 99.1의 Notice/Proxy Statement 원문은 2026-12-04 오전 10:00 Beijing Time 본사 대면 주총을 공지한다(12/04 11:00 KST; 12/03 21:00 EST). Record date 10/23, 기준일 발행 ordinary shares 22,201,597주는 발행주식 총량이지 public float가 아니다. Class A 주식당 1표, Class B 주식당 15표. 위임장 제출 마감은 12/03 23:59 New York City time(12/04 13:59 KST). 2명의 Class II 이사 재선임과 FY2027 감사인 Enrome LLP 추인, 자본감소, 수권주 증가, 병합, BVI continuation을 구분해 4개 event ID로 관리한다.

| 이벤트 ID | 표결/일정 | 핵심 조건 및 구분 |
|---|---|---|
| `SEC:0001104659-26-120073:ANNUAL_GENERAL_MEETING` | 12/04 10:00 Beijing, 대면 | 이사 Wong/Hu 재선임, FY2027 Enrome LLP 추인, 8개 결의안; 이사·감사·수권주 증가 simple majority, 특별결의는 2/3 votes cast와 quorum |
| `SEC:0001104659-26-120073:CLASS_A_SHARE_CONSOLIDATION_VOTE` | 12/04 표결, 1:200 또는 1:300 | Class A만 병합. 비율·실행일은 이사회가 1년 내 결정하고 실행하지 않을 수도 있다. 12/04는 표결일이며 split-adjusted 거래일이 아니다. Class B 불포함, 단주 주주별 올림 |
| `SEC:0001104659-26-120073:PAR_VALUE_AND_AUTHORIZED_SHARE_CAPITAL_VOTES` | 12/04 표결 | Class A 액면 $0.02→$0.00001 및 자본감소/분배가능 reserve 전환은 법정요건·2/3 결의 조건; 추가 2,985,000,000 Class A 수권주는 일반결의. 수권한도 변경은 신주발행이 아님 |
| `SEC:0001104659-26-120073:CAYMAN_TO_BVI_CONTINUATION_VOTE` | 12/04 표결 | Cayman 법인 deregistration 및 BVI business company continuation 특별결의(2/3 및 quorum); 후속 당국 등록·법적 효력일은 미확정 |

Proposal 5/5A에서 이사회는 AGM 후 1년 이내 1:200 또는 1:300 비율·시행일을 선택하고 병합하지 않을 수도 있다. 단주 처리는 주주별 합산 후 다음 정수로 올림한다. 1:300 승인·실행 시 제안된 Class A 수권치는 10M주, par $0.003이고, 1:200이면 15M주/$0.002이며 Class B 수권 200M주는 그대로라는 Proposal 6 조건부 구조도 병합 이벤트에 연결했다. 실제 issued shares/float, split-adjusted 거래일·CUSIP은 원문에서 확인되지 않아 미확정으로 남겼다.

이 6-K와 부속 위임장을 primary 전체 검토로 승격하고 event/review/filing 원장을 accession별로 동기화했다. 이번 검토에서 3개 세부 이벤트를 추가하고 기존 주총 이벤트를 직접 원문으로 검증했다. 누계: 미국 이벤트 134건, 직접 원문 검토 발행사 52/100, 복구 이벤트 원문 재검증 대기 56건/50개 발행사. 전체 SEC 제출원장 5,662건은 accession별 상태를 다시 집계했다.

원문: [SEC 6-K accession](https://www.sec.gov/Archives/edgar/data/1442620/000110465926120073/0001104659-26-120073-index.htm), [Exhibit 99.1 Notice/Proxy](https://www.sec.gov/Archives/edgar/data/1442620/000110465926120073/tm2628511d1_ex99-1.htm), [6-K 본문](https://www.sec.gov/Archives/edgar/data/1442620/000110465926120073/tm2628511d1_6k.htm).
### 추가 원문 확인 배치 49 — MDCX 특별주총·완료 병합·Nasdaq 요건 회복

운영 공개 GET `2026-10-31T15:17:37.249Z`: HTTP 200, NAS 활성 `COMMON_STOCK`, USD 시총 $508,118(KIS 가격 관측 `2026-10-30T07:06:35.275Z`), RSS 13건, 호재 분류 3건, SEC 분류 이벤트 0건. 운영 DB write 없음. KIS 운영 스냅샷 `listed_shares=236,334`와 proxy가 보고한 발행·유통(outstanding) 보통주 1,899,338주는 측정 정의와 관측 시점이 다르므로 별도 보존했다. 어느 값도 public float로 간주하지 않았다.

SEC DEF 14A accession `0001062993-26-005627` 원문 직접 검토 결과, 2026-12-02 10:00 a.m. EST Toronto 대면 특별주총(12/03 00:00 KST), record date 10/28, 위임장 마감 11/30 10:00 a.m. EST(11/30 23:00 KST)를 확인했다. (1) 무제한 Class A blank-check 우선주 수권, (2) 최대 1:50 보통주 병합 권한은 각각 특별결의이며 votes cast의 2/3가 필요하다. 이사회는 우선주 발행의 현재 의도가 없다고 밝혔으나, 승인·정관 신고 후에는 추가 주주표결 없이 이사회가 시리즈별 권리를 정해 발행할 수 있다. 우선주는 의결권·배당·청산 우선 및 보통주 전환 등 잠재 희석·반인수 위험이 있다. 병합도 승인만으로 시행되지 않으며 비율·시기는 이사회 재량이고 미시행할 수 있다. 12/2는 표결 일정이지 병합 효력일이 아니다.

SEC 8-K `0001062993-26-005382`는 2026-10-12 실제 완료된 병합이 1:50이고, 같은 날 Nasdaq Capital Market에서 병합조정 거래가 시작됐다고 보고한다. 이전 요약의 1:10 표기는 오류여서 수정했다. 단주 처리는 내림 및 현금 지급이며 주식 수 전후 수치는 미공개다. 8-K `0001062993-26-005528`은 Nasdaq이 10/12~10/23 10연속 영업일 종가 bid ≥$1로 Rule 5550(a)(2) 회복을 통지했다고 보고한다. 10/20 상장폐지 결정은 후속 회복 통지로 무효화됐다. 이는 최소호가 요건에 한정되며 지속 준수는 보장되지 않는다.

기존 주총 이벤트의 eventDate를 잘못된 SEC filing date 10/30에서 실제 회의일 12/02로 수정했다. 별도 event ID 네 개(우선주 표결, 병합 권한 표결, 완료 병합, Nasdaq 회복)를 추가하고 DEF 14A 및 두 8-K를 FULL_PRIMARY_REVIEW로 연결했다. 미국 이벤트 138건, 전체 importer input 139건(KR 포함), 직접 원문 검토 발행사 53/100, 재검증 대기 55건/49개 발행사. SEC 제출 원장 5,662건의 상태는 accession별 재집계했다.

원문: [SEC DEF 14A](https://www.sec.gov/Archives/edgar/data/1997296/000106299326005627/formdef14a.htm), [10/12 병합 8-K](https://www.sec.gov/Archives/edgar/data/1997296/000106299326005382/form8k.htm), [Nasdaq 회복 8-K](https://www.sec.gov/Archives/edgar/data/1997296/000106299326005528/form8k.htm).

### 추가 원문 확인 배치 50 — WHLR 주총 및 전환성 노트·역분할 표결

운영 공개 GET `2026-10-31T15:20:40.525Z`: HTTP 200, NAS 활성 `COMMON_STOCK`, USD 시총 $355,485(KIS 관측 `2026-10-30T07:13:01.839Z`), RSS 4건, bullish 분류 0, SEC 분류 이벤트 0. 운영 DB write 없음. SEC DEF 14A accession `0001213900-26-111872` 직접 검토.

DEF 14A는 2026-12-04 09:30 Atlantic Standard Time San Juan 현장 주총(12/04 22:30 KST), record date 10/02, 1,460,799 common shares issued/outstanding, 인터넷/전화 투표 마감 12/03 23:59 EST를 확인한다. 기존 이벤트의 eventDate 10/23(공시 접수일)을 실제 행사일 12/04로 수정했다. 안건은 이사 7인, 감사인 추인, note 상환용 주식발행, 역분할 권한 표결이다.

별도 이벤트 두 건을 추가했다. Proposal 3은 Nasdaq Rule 5635(d) 목적의 outstanding common 19.9% 초과 가능 상환주 발행 승인이다. 10/13 초기 Purchase Agreement는 $1M note였으며, 총 note principal은 최대 $25M까지 늘 수 있다. 이자는 0%지만 첫 거래일부터 원금의 0.4%(회사가 0.2~0.6%로 조정 가능)에 해당하는 상환을 거래일별로 주식으로 지급하는 구조이며 기준가격은 직전 Nasdaq 종가, $0.25 floor와 resale-registration/listing/DWAC 조건을 둔다. 회사는 최종 주식 수를 미리 산정할 수 없고 승인 시 상당한 희석 및 주가 하락 위험을 명시했다. 주주 승인만으로 노트 발행이 완료된 것은 아니며 resale 등록 효력이 필요하다.

Proposal 4~15는 1:2~1:100 역분할 권한을 2027년 1월부터 12월까지 각 월별 실행창 하나씩 열두 개 개별 결의안으로 제출했다. 각 제안은 별도 표결이며 이사회가 비율·시기를 결정하고 실행하지 않을 수 있다. 병합 권한 표결일은 효력일·split-adjusted 거래 개시일이 아니다. 주식 수 감소와 가격의 기계적 변화를 실제 수익률로 간주하지 않는다.

세 이벤트 ID(기존 주총 + 신규 노트 issuance vote + 신규 월별 reverse-split authorization vote)를 종목 검토 행과 filing ledger accession에 연결했다. 누계: 미국 이벤트 140건/100개 발행사, 직접 원문 검토 54/100, 복구 원문 검증 대기 54건/48개 발행사. SEC 제출 5,662건의 accession별 상태 합계는 기존 75 TARGETED / 5,430 INVENTORY / 62 FULL / 95 TRIAGE 유지.

원문: [SEC DEF 14A](https://www.sec.gov/Archives/edgar/data/1527541/000121390026111872/ea0308315-04.htm).

### 추가 원문 확인 배치 51 — ISPC 역분할 표결 결과 및 12월 연례주총

운영 공개 GET `2026-10-31T15:23:25.623Z`: HTTP 200, NAS 활성 `COMMON_STOCK`, USD 시총 $1,995,479(KIS 관측 `2026-10-30T07:10:33.550Z`), RSS 8건, bullish 분류 4건, SEC 분류 이벤트 0건. 운영 DB write 없음. SEC PRE 14A accession `0001213900-26-114426` 원문을 SEC Archives에서 직접 HTTP 200으로 읽었다.

원문은 10/30 재개 특별주총에서 주주들이 1:10~1:100 범위의 보통주 reverse split 권한을 승인했다고 명시한다. 이사회가 비율·시기를 결정하며, PRE 14A에 적힌 기준 시점에는 병합을 아직 시행하지 않았다. 따라서 승인 결과(10/30, `REPORTED`)와 split effective/adjusted trading(미확정)을 구분하는 새 이벤트를 추가했다. Voting result는 다른 secondary transcript에 의존하지 않고 SEC primary filing 문장으로만 기록했다.

동일 accession은 2026-12-30 15:00 EST 온라인 연례주총(12/31 05:00 KST), record date 11/2 및 Delaware에서 Nevada로의 법인 전환 proposal을 공지한다. 기존 eventDate가 filing date 10/30으로 돼 있던 이벤트를 실제 회의일 12/30으로 수정했다. 그러나 PRE 14A 첫 안내문은 "November 20, 2026"으로 날짜가 찍혀 있고 SEC submission index의 accepted time은 10/30 20:54:33Z여서 시간순 내부 불일치가 있다. 정정 제출/최종 proxy를 계속 확인하기 위해 confidence는 MEDIUM으로 낮추고 limitation을 보존했다.

같은 accession과 두 이벤트 ID를 종목별 검토 메타데이터·filing ledger·canonical accession-event index에 연결했다. 누계: 미국 이벤트 141건/100 발행사, 직접 원문 검토 55/100, 복구 검증 대기 53건/47개 발행사.

원문: [SEC PRE 14A](https://www.sec.gov/Archives/edgar/data/1558569/000121390026114426/ea0309612-01.htm), [SEC accession index](https://www.sec.gov/Archives/edgar/data/1558569/000121390026114426/0001213900-26-114426-index.htm).

## 2026-11-01 보충 검증 Batch 52 — VCIG 11월 2일 역분할

- SEC 6-K accession 0001213900-26-113645와 [Nasdaq Trader ECA #2026-779](https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2026-779)를 다시 대조했다. 1:18 역분할 효력은 2026-11-02 00:01 EST(14:01 KST)이며 CUSIP은 G98218137이다. Nasdaq의 정확한 split-adjusted 거래 개시 시각은 두 자료에서 확인되지 않는다.
- 2026-11-01 SEC submissions 조회에서 최신 제출물은 해당 6-K(2026-10-29 접수)로 확인되어 이후 일정 변경 공시는 발견되지 않았다.
- 운영 서버 GET은 HTTP 200, 운영 응답 asOf 2026-10-31T15:25:06.027Z, 활성 NAS COMMON_STOCK, 시총 $248,233(USD; 기초 관측 2026-10-30T07:07:23.504Z), RSS 4건·bullish 1건·분류 SEC 이벤트 0건이었다. 시총 1억 달러 이하 조건은 충족한다.
- 회사는 역분할 전 발행·유통주식 수를 약 9,639,594주, 후를 약 535,533주로 추정한다. 운영 KIS listed_shares 1,266,496주는 다른 출처·기준의 수치여서 서로 대체하거나 역분할 비율로 임의 조정하지 않았다. 이 숫자들은 free float로 표시하지 않는다.
- 종목별 운영 점검과 SEC 최신 제출 확인을 조사 JSON의 VCIG 레코드에 보충 필드로 구조화했다. 기존 5,662건 제출 인벤토리의 조사 창 및 원본 생성 시각은 덮어쓰지 않았다.


## 2026-11-01 보충 검증 Batch 53 — 임박 일정 갱신 및 ONFO 채무상환 공시

### 운영 서버 / SEC submissions 최신 상태

| 종목 | 운영 GET / 기준시각 | 공식 종목·시총 | RSS / bullish / SEC 분류 이벤트 | SEC submissions 최신 공시 | 일정 영향 |
|---|---|---|---:|---|---|
| GNPX | HTTP 200 / 2026-10-31 15:27:56.937Z | NAS 활성 COMMON_STOCK / $1,672,206 USD, 가격 관측 10/30 07:10:33.550Z | 5 / 0 / 0 | 8-K 0001437749-26-033700, 10/28 접수 | 11/4 포스터 세션 후속 변경 공시 없음 |
| ONFO | HTTP 200 / 2026-10-31 15:27:56.924Z | NAS 활성 COMMON_STOCK / $1,234,379 USD, 가격 관측 10/30 07:22:11.933Z | 5 / 1 / 0 | S-1 0001213900-26-112189, 10/23 접수 | 10/31 지급 후속 확인 없음. 기존 11/5 주총 일정 변경 공시 없음 |
| TGL | HTTP 200 / 2026-10-31 15:27:56.936Z | NAS 활성 COMMON_STOCK / $1,212,060 USD, 가격 관측 10/30 07:19:39.766Z | 13 / 8 / 0 | DEF 14A 0001213900-26-112539, 10/26 접수 | 11/5 주총 최신 위임장. 10/23 8-K는 소프트웨어 개발계약으로 주총 변경 아님 |

운영 응답의 asOf는 10/31이므로 11/1 KST 현재 가격·뉴스 실시간 값으로 취급하지 않는다. 세 종목 모두 미국 NAS 활성 COMMON_STOCK이며 관측 시총은 $100M 이하다. 운영 DB 쓰기는 없었다.

### ONFO — 만료된 초기 지급기한과 조건부 상환 일정

SEC 8-K accession 0001213900-26-110936(10/20 접수, Items 1.01, 2.04, 9.01)와 [Exhibit 10.1 계약](https://www.sec.gov/Archives/edgar/data/1825452/000121390026110936/ea030910201ex10-1.htm)을 직접 검토했다. 계약은 Maker인 자회사 Eastern Standard, LLC가 $850,000 원금 promissory note를 10/1/2026에 만기 상환하지 못했고 9월 이자도 제때 지급하지 못했으며, Onfolio가 guarantor라고 명시한다. $450,000 초기 지급은 Payee에게 실제 수령되어야만 제한적 forbearance가 효력을 얻는다. 2026-10-31은 이미 경과했지만 운영 RSS와 현재 조회한 SEC 제출 목록에서 후속 지급/수령 확인을 찾지 못했다. 공시 부재만으로 미지급, 계약 효력 불발 또는 채권자 집행을 결론 내리지 않는다. 계약은 초기 기한의 주말 자동 연장을 명시하지 않으며 지급 cutoff 시각도 미확인이다.

| 이벤트 ID | 계약상 날짜 (미국 날짜; 시각 미공개) | 금액 | 상태 및 조건 |
|---|---|---:|---|
| INITIAL_FORBEARANCE_PAYMENT_DEADLINE | 2026-10-31 | $450,000 | 기한 경과; 지급 수령 및 forbearance 효력 미확인 |
| CONDITIONAL_FORBEARANCE_PAYMENT_1 | 2026-12-01 | $60,000 | 초기 지급 수령 후 첫 월 지급 |
| CONDITIONAL_FORBEARANCE_PAYMENT_2 | 2027-01-04 | $60,000 | 조건부 Schedule A |
| CONDITIONAL_FORBEARANCE_PAYMENT_3 | 2027-02-01 | $60,000 | 조건부 Schedule A |
| CONDITIONAL_FORBEARANCE_PAYMENT_4 | 2027-03-01 | $60,000 | 조건부 Schedule A |
| CONDITIONAL_FORBEARANCE_PAYMENT_5 | 2027-04-01 | $60,000 | 조건부 Schedule A |
| CONDITIONAL_FORBEARANCE_PAYMENT_6 | 2027-05-03 | $60,000 | 조건부 Schedule A |
| CONDITIONAL_FORBEARANCE_PAYMENT_7 | 2027-06-01 | $60,000 | 조건부 Schedule A |
| CONDITIONAL_FORBEARANCE_PAYMENT_8 | 2027-07-01 | $45,754.29 | 조건부 최종 지급; 계약상 전체 지급예정 합계 $915,754.29 |

월 지급 불이행은 10 calendar days의 cure period 후 forbearance 종료 및 기존 채무문서상 권리행사 가능성이 생긴다. 계약상 날짜는 지급 수령 cutoff 시각을 제공하지 않으므로 KST 날짜·시각은 임의 환산하지 않았다. 계약 일정은 실제 지급 실적이나 현재 잔액을 뜻하지 않는다.

이 9개 일정을 canonical 이벤트 JSON에 각각 별도 eventId로 추가했다. 같은 SEC accession, 원문 및 Exhibit 10.1 URL을 종목 검토 JSON과 accession 원장에 연결하고, filing 상태를 TRIAGE_EXCERPT에서 FULL_PRIMARY_REVIEW로 변경했다. 원래 5,662건 SEC 제출 인벤토리와 조사기간은 그대로 두었다. 현재 누계: 미국 이벤트 150건/100개 발행사, 직접 원문 검토 발행사 55/100, 복구 이벤트 재검증 대기 53건/47개 발행사. SEC 제출 상태 집계: TARGETED 75 / INVENTORY 5,430 / FULL 63 / TRIAGE 94.

공식 원문: [ONFO 8-K](https://www.sec.gov/Archives/edgar/data/1825452/000121390026110936/ea0309102-8k_onfolio.htm), [Exhibit 10.1](https://www.sec.gov/Archives/edgar/data/1825452/000121390026110936/ea030910201ex10-1.htm), [SEC accession index](https://www.sec.gov/Archives/edgar/data/1825452/000121390026110936/0001213900-26-110936-index.htm).

### 원장 정합성 보정 및 자동 점검 추가

이번 accession 관계 점검에서 기존 filing ledger와 조사 JSON의 filing 사본 간에 검토 상태 4건과 eventId 6건의 차이를 발견했다. RCON, IPST, OLOX, NXL의 상태/eventId, NXL 2개 filing 및 LHSW·NUWE의 중복 eventId를 filing ledger를 정본으로 맞췄다. IMTE 검토 행의 사건일도 canonical 이벤트 날짜 2026-12-29와 맞췄다. eventRelevantDocuments에는 중복 링크 1개와 여러 ID를 세미콜론으로 합친 관계값이 있어 ledger filing의 개별 eventId 기준 154개 관계 행으로 재생성했다. 제출상태 요약은 75 TARGETED / 5,430 INVENTORY / 63 FULL / 94 TRIAGE로 두 JSON 및 filing 원장에서 일치한다. 기존 관계를 수기로 여러 파일에 병렬 편집해도 잡아낼 자동 검증기가 없었던 것이 원인이었다.

재발 자동 감지를 위해 읽기 전용 npm run validate:us-smallcap-event-data를 추가했다. canonical 이벤트 수·일자·상태, 제출 원장 및 종목별 filing 사본, eventId별 accession 관계, 중복/고아 관계 행, 제출상태 집계의 parity를 검증한다. 실행 결과: 100 발행사, 5,662 filing, 150 미국 이벤트, 154 accession-event 관계, 상태 OK.

## 2026-11-01 보충 검증 Batch 54 — SDST 거래정지·상장말소 단계 분리

### 현재 운영/SEC 상태

- 운영 공개 GET: HTTP 200, asOf 2026-10-31T15:37:23.828Z, NAS active COMMON_STOCK, USD 시총 $507,212(기초 관측 10/30 11:57:57.893Z), RSS 4건, bullish 0, SEC 분류 이벤트 0. 운영 master의 active 표시는 Nasdaq 거래 가능 상태를 뜻하지 않으며, 아래 거래정지 확인과 병기한다.
- SEC issuer submissions 최신 filing은 8-K accession 0001493152-26-047607(10/19 접수)이며 후속 회사 filing은 확인되지 않았다.
- Nasdaq 공식 Security Status Updates는 10/23 effective date에 SDST common stock 및 SDSTW warrant 각각을 Issue Suspensions로 기록한다. SEC 8-K의 예정 거래정지와 대조해 거래정지 발생은 확인했다. Nasdaq status 표는 실제 intraday 정지 시각을 제공하지 않는다. SEC에 기재된 09:30 EDT(10/23 22:30 KST)는 예정 개장 시각이다.
- 상장말소 Form 25-NSE는 별도로 추적했다. SEC exchange CIK 0001354457의 10/20~10/30 Form 25-NSE/25-NSE/A 17개를 다운로드해 각 원문에서 issuer name/CIK/security text를 대조했으나 SDST/CIK 0001831979에 해당하는 제출은 발견되지 않았다. 이 조회는 10/30까지의 대상 Form 25 filings만 다루며 미제출 또는 향후 제출을 단정하지 않는다.

### 일정 행 분리

| eventId suffix | 미국 현지 일정 | KST | 상태 | 판단 |
|---|---|---|---|---|
| NASDAQ_DELISTING_NOTICE (기존) | 10/23 개장 정지·상장말소 예정 통지 | 예정 정지는 10/23 22:30 KST | REPORTED | 10/19 SEC 공지. 실제 거래정지는 아래 Nasdaq status update로 확인되지만 Form 25에 따른 listing/Section 12(b) 말소는 미확인 |
| NASDAQ_TRADING_SUSPENSION (신규) | 10/23 effective date; actual time 미표시 | 실제 시각 미확인; SEC 예정시각 22:30 KST | COMPLETED | Nasdaq이 SDST와 SDSTW Issue Suspensions를 effective 10/23으로 표시 |
| NASDAQ_HEARING_REQUEST_DEADLINE (신규) | 10/23 16:00 EDT | 10/24 05:00 KST | REPORTED | Panel hearing request 제출 여부 미확인. SEC는 timely request도 suspension을 유예하지 않는다고 명시 |
| CFO_RESIGNATION (기존) | 10/23 효력 예상 | 시각 미공개 | ESTIMATED | 10/14 사임 통지와 예상 효력일은 직접 확인; 실제 효력 및 후임은 미확인 |

SEC 8-K Item 3.01은 10/15 Staff Determination, 10/23 16:00 EDT 청문요청 마감, $20,000 비환급 청문 수수료를 Staff Determination date 이후 7 calendar days 내 납부, timely hearing request도 거래정지를 유예하지 않는다고 공시했다. Item 5.02는 CFO Udaychandra Devasper가 10/14 사임 의사를 통지했고 10/23 효력이 예상된다고 명시한다. 청문요청/수수료 제출과 CFO 사임 완료는 공시로 확인되지 않아 결과 상태를 미확인/추정으로 유지한다.

이 검토에서 기존 복구 이벤트 2건(CFO, delisting notice)의 원문 검증을 완료하고 별도 이벤트 2건(실제 거래정지, 청문요청 마감)을 추가했다. Nasdaq original status source와 exchange CIK Form 25 scan metadata를 issuer 레코드에 구조화하고 accession 0001493152-26-047607에 4개 eventId 관계를 연결했다. 미국 이벤트 152건/100개 발행사, 직접 원문 검토 56/100, 재검증 대기 51건/46개 발행사. Filing 상태는 TARGETED 74 / INVENTORY 5,430 / FULL 64 / TRIAGE 94.

공식 자료: [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1831979/000149315226047607/form8-k.htm), [Nasdaq Security Status Updates](https://www.nasdaqtrader.com/Trader.aspx?from=05%2F21%2F2024&id=nasdaq-security-status-updates&page=310), [Nasdaq SEC EDGAR issuer page](https://www.sec.gov/edgar/browse/?CIK=0001354457&owner=exclude).


## 2026-11-01 보충 검증 Batch 55 — RBNE LPG 운반선 인수 계약

### 검토 범위와 현재 자료

- 종목: Robin Energy Ltd. (RBNE), CIK 0002039060. 조사창은 2025-10-31부터 2026-11-01 미만이며, 종목·공시 accession·원문 URL 및 검토 상태는 종목 검토 JSON과 filing ledger에 연결했다.
- 운영 공개 GET: HTTP 200, asOf 2026-10-31T15:43:02.467Z, NAS enabled COMMON_STOCK, USD 시총 $214,500(기초 가격 관측 2026-10-30T07:20:31.125Z), RSS 3건, bullish 0건, SEC 분류 이벤트 0건. 공개 GET만 사용했고 DB 쓰기는 없다.
- SEC CIK submissions를 새로 조회했다. 10/29 및 10/28 Schedule 13G가 최신 제출이며, 10/21 Form RW(등록신고 철회요청), 10/16 Form F-1도 확인됐다. 이 4개 제출은 이번 배치에서 submissions 메타데이터만 새로 확인했고 filing 본문은 열람하지 않았으므로 INVENTORY_ONLY 상태를 유지했다. 전체 조사창 제출 수는 40건이며 원장 총계는 5,662건이다.
- 직접 본문 검토: SEC 6-K accession 0001140361-26-040600(2026-10-23), Exhibit 99.1 및 SEC filing index.

### 일정·거래 조건 판단

| 항목 | 공시 근거 | 상태 및 한계 |
|---|---|---|
| 계약 발표 | 2026-10-23, 2015년 건조 5,000 cbm LPG carrier 매매계약, 가격 $18M | REPORTED. 서명된 계약 발표이며 인도 완료가 아님 |
| 예상 인도·종결 | 2026년 4분기 인도 예상, 관례적 종결조건 충족 필요 | 회사 추정 일정. 확정 종결일·실제 인도 결과 미확인 |
| 자금조달 | 회사는 보유 현금으로 인수대금을 조달할 것으로 예상 | 실제 현금 잔액, 지급 및 거래 후 유동성 수치는 해당 자료에 없음 |
| 이해관계·승인 | 매도자 AI OKTO CORP.는 RBNE 회장 겸 CEO가 지배. 양사 독립·비이해관계 이사 특별위원회의 협상·권고 후 양사 이사회 승인 | 특별위원회 절차가 공시됐지만 관련자 거래 위험은 남음 |

이전 복구 이벤트는 원문 직접검토 상태로 승격했다. 계약 발표일과 예상 인도 분기를 분리했고, 계약상 거래금액·자금원 예상·이해관계자·종결조건을 이벤트 증거와 위험으로 기록했다. 인수 완료 또는 현금 지급으로 추정하지 않았다. 운영 시가총액은 별도 시점의 데이터이므로 $18M 거래가격과 가치평가 배수로 비교하지 않았다.

SEC 원문: [6-K](https://www.sec.gov/Archives/edgar/data/2039060/000114036126040600/ef20084329_6k.htm), [Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/2039060/000114036126040600/ef20084329_ex99-1.htm), [SEC filing index](https://www.sec.gov/Archives/edgar/data/2039060/000114036126040600/0001140361-26-040600-index.htm), [SEC issuer submissions](https://data.sec.gov/submissions/CIK0002039060.json).

### 원장·문서 구조 및 검증 상태

이벤트 원문 증거·위험·한계·직접검토 시각을 canonical 이벤트에 저장하고, 같은 eventId와 accession을 검토 JSON 및 filing ledger에 연결했다. issuer 단위 최신 운영 조회는 별도 supplemental metadata로 남겼다. SEC 제출 인벤토리의 전체 전문을 읽었다는 의미와 개별 이벤트의 원문 검토를 구분한다. 현재 누계는 미국 이벤트 152건/100개 종목, 직접 원문 검토 발행사 57/100, 복구 이벤트 재검증 대기 50건/45개 발행사다. Filing 상태: TARGETED 73 / INVENTORY 5,430 / FULL 65 / TRIAGE 94.


배치 검증: 이벤트 데이터 parity validator OK(100 issuers, 5,662 filings, 152 events, 156 accession-event relations); JSON strict parse/UTF-8 decode 및 git diff --check 통과. 테스트·빌드·DB 쓰기·배포는 하지 않았다.


## 2026-11-01 보충 검증 Batch 56 — VRAX 중국 RUO 유통계약

### 종목·공시 범위

- Virax Biolabs Group Limited (VRAX), CIK 0001885827. review window: 2025-10-31 이상, 2026-11-01 미만. 39개 SEC submissions를 issuer ledger에 accession별로 보관한다.
- SEC CIK submissions 최신 메타데이터: 10/29 6-K accession 0001193125-26-437018, 10/21 Form 3, 10/9 6-K. 이번 배치에서 직접 검토한 accession은 10/29 6-K와 Exhibit 99.1이며 filing index도 확인했다. 전문 열람하지 않은 제출은 기존 review status를 유지했다.
- 운영 read-only GET: HTTP 200, asOf 2026-10-31T15:45:23.550Z, NAS enabled COMMON_STOCK, USD market cap $1,775,384(기초 가격 관측 10/30 07:22:11.933Z), RSS 2, bullish 0, SEC 분류 이벤트 0. DB 쓰기 없음.

### 이벤트 해석

2026-10-29 공시는 중국 자회사 Shanghai Xitu가 AmyJet Scientific, Jiangsu Real-Gen Biotechnology, Zhixi (Shanghai) Biotechnology와 ImmuneSelect 연구용 제품의 비독점 유통계약을 체결했다고 보고한다. 유통 경로는 지정 고객군에 대해 Beijing, Shanghai, Hubei, Jiangsu, Anhui, Shandong 지역을 대상으로 한다. 제품은 ELISpot assay plates와 항원특이 peptide pools 등 RUO 제품이며, 개발 중인 진단 플랫폼 ViraxImmune과 구분된다.

| 구분 | 확인 내용 | 일정·한계 |
|---|---|---|
| 계약 체결 | 3개 distributor, 비독점, 지정 권역/고객군 재판매 | 10/29 REPORTED. 향후 확정 이벤트 날짜 없음 |
| 초기 판매 | 기존 중국 운영에서 초기 ImmuneSelect 판매가 있었다고 회사가 언급 | 매출액·판매 기간·고객 수 미공개 |
| 미래 매출/주문 | 계약상 distributor가 제품을 구매해 재판매 | 최소 구매량·가격·PO·매출·납기·계약기간 공개되지 않음; 주문이나 반복 매출을 추정하지 않음 |
| 상업화 위험 | 제3자 유통, 고객 평가가 상업 채택으로 이어지지 않을 수 있다고 회사가 명시 | 판매망 계약만으로 사업성과 확정 불가 |

canonical 이벤트에 SEC 원문 인용, 제품·권역·계약 구조, 제3자 유통 위험과 미공개 항목을 기록하고 복구 이벤트 상태를 직접 검토 완료로 승격했다. 공개된 미래 일정이 없어 추정 촉매 일정을 추가하지 않았다.

공식 자료: [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1885827/000119312526437018/6-k_10.29.26_china_distr.htm), [Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1885827/000119312526437018/vrax-ex99_1.htm), [SEC filing index](https://www.sec.gov/Archives/edgar/data/1885827/000119312526437018/0001193125-26-437018-index.htm), [SEC issuer submissions](https://data.sec.gov/submissions/CIK0001885827.json).

현재 누계: 100개 종목, 이벤트 152건, 직접 원문 검토 발행사 58/100, 복구 이벤트 재검증 대기 49건/44개 발행사. Filing 상태: TARGETED 72 / INVENTORY 5,430 / FULL 66 / TRIAGE 94.


## 2026-11-01 보충 검증 Batch 57 — SHFS 역분할·Nasdaq 기한·Opifex 텀시트·전환발행

### 확인 범위와 보통주 적격성

- SHF Holdings, Inc. (SHFS), CIK 0001854963. 조사창은 2025-10-31 이상, 2026-11-01 미만이다. SEC submissions를 새로 확인했으며 이번 직접 원문 범위는 2026-09-29 8-K 및 Exhibit 3.1, 2026-10-20 8-K, 2026-10-26 8-K·Exhibit 99.1, 같은 날 425와 DEFA14A 중복 공시다. 최신 2026-10-30 8-K accession 0001493152-26-049470도 기존 직접 검토분과 교차참조했다.
- 운영 공개 GET HTTP 200: NAS enabled COMMON_STOCK, market cap $80,164 USD, 기초 데이터 2026-10-30T07:08:11.495Z, RSS 14, bullish 0, SEC 이벤트 0. 거래소 적격성 master상 보통주·활성 종목이지만 Nasdaq $1 입찰가 요건은 별도 미충족 위험으로 기록했다. DB 쓰기 없음.
- **시총/주식수 데이터 품질 경고**: 운영 API의 listed_shares 1,027,746은 SEC 10/30 8-K가 보고한 issued and outstanding 85,512,985주와 크게 다르다(약 83.2배). SEC 주식수 × 운영 시세 $0.078의 단순 교차 계산은 약 $6,670,013이지만, 이는 서로 다른 원천의 혼합 산술치이지 공식 시총이나 float가 아니다. 두 관측 모두 $100M 이하지만 운영 시총 $80,164는 검증 없이 확정값으로 쓰지 않도록 불일치를 구조화했다.

### 공시별 이벤트 일정

| 이벤트 | 현지 날짜·시각 | KST | 상태 | 근거·미확인 사항 |
|---|---|---|---|---|
| 1:12 역분할 법적 효력 | 2026-09-30 00:01 EDT | 2026-09-30 13:01 KST | COMPLETED | 9/29 제출/증서일과 실제 효력일을 구분해 이벤트 날짜를 정정. 발행·유통주식수 전후 값 및 Nasdaq 조정거래 개시시각은 미공개 |
| Nasdaq 추가 최소호가 준수기간 통지 | 2026-10-20 | 시간 미공개 | REPORTED | 추가 180 calendar days 부여. 통지 이벤트를 미래 deadline과 분리 |
| Series B 전환 주식 발행 | 2026-07-01~10-23 발행기간, 종료 10/23 | 개별 발행시각 미공개 | COMPLETED | Series B 6,545주 전환, 보통주 23,914,988주 발행, 평균 전환가 $0.2737(범위 $0.1210~$1.4053), 추가 대가 없음. 10/23 issued and outstanding 24,942,735주(공시값; float 아님) |
| Nasdaq $1 bid 준수기한 | 2027-04-19까지 | 마감 시각 미공개 | CONFIRMED_SCHEDULED | $1 이상 종가 10거래일 연속 필요. 실패하면 Nasdaq의 추가 상장폐지 통지 가능; 실제 상장폐지일이 아님 |
| Opifex 거래 목표 종결 | 2027-04-19 이전 의도 | 정확한 목표일/시각 미정 | ESTIMATED | 비구속 텀시트의 target. definitive agreement, 실사, Series B 동의, Opifex 감사재무, 공정성 의견, 주주/Nasdaq 승인 및 필요 자금조달 등이 조건 |

### Opifex 거래·희석 조건

10/26 비구속 텀시트상 Opifex security holders는 거래 종결 후 결합회사 fully diluted 기준 85%, 기존 Safe Harbor 이해관계자는 15%를 보유하는 안이다. 이 비율은 신규 자금조달 및 10% equity incentive reserve 전이며, Safe Harbor 배분은 독립 공정성 의견을 전제로 12.5~17.5% 범위 조정 가능하다. Opifex valuation 최소 $50M은 제안값으로, 독립 가치평가/공정성 의견 전 확정 기업가치가 아니다.

10/26 제출은 7/1~10/23 Series B 전환발행 23,914,988주와 10/23 주식수를 보고한다. 별도 10/30 8-K는 10/24~10/30에 60,570,250주 추가 발행(추가 대가 없음), 10/30 issued and outstanding 85,512,985주를 보고했다. 두 비중복 기간의 전환발행 합계 84,485,238주지만 기간초 분모가 없어 희석률은 계산하지 않았다. 10/30 SEC 보고 발행주식수를 8-K 049470의 기준으로 사용하며, 이를 public float로 표시하지 않는다.

분리 일정 세 건을 추가했다: historical Series B conversion, Nasdaq의 확정된 4/19/2027 최소 bid deadline, 그리고 그 전에 종결하겠다는 회사 의도(ESTIMATED). 기존 역분할과 Nasdaq 통지 이벤트도 원문 확인을 완료하고 역분할 법적 효력일 및 Nasdaq 통지/기한 의미를 보정했다. 425/DEFA14A는 거래 보도자료와 전환발행 내용을 반복하는 중복 공시로 확인해 같은 이벤트에 accession별로 연결했다.

SEC 원문: [역분할 8-K](https://www.sec.gov/Archives/edgar/data/1854963/000149315226045183/form8-k.htm), [Certificate of Amendment](https://www.sec.gov/Archives/edgar/data/1854963/000149315226045183/ex3-1.htm), [Nasdaq 기한 8-K](https://www.sec.gov/Archives/edgar/data/1854963/000149315226047774/form8-k.htm), [결합·전환발행 8-K](https://www.sec.gov/Archives/edgar/data/1854963/000149315226048425/form8-k.htm), [Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1854963/000149315226048425/ex99-1.htm), [Form 425](https://www.sec.gov/Archives/edgar/data/1854963/000149315226048426/form425.htm), [DEFA14A](https://www.sec.gov/Archives/edgar/data/1854963/000149315226048427/formdefa14a.htm), [10/30 전환발행 8-K](https://www.sec.gov/Archives/edgar/data/1854963/000149315226049470/form8-k.htm).

이번 배치 후 100개 종목·155개 이벤트·165개 accession-event 관계. 직접 원문 검토 issuer 58/100, 재검증 대기 46 events/43 issuers. filing 상태: TARGETED 69 / INVENTORY 5,428 / FULL 71 / TRIAGE 94.


## 2026-11-01 보충 검증 Batch 58 — XXII ATM 판매대리인 추가

### 종목·공시 범위

- 22nd Century Group, Inc. (XXII), CIK 0001347858. issuer review window: 2025-10-31 이상, 2026-11-01 미만. 최신 SEC submissions를 재조회했으며 최신 제출은 10/28 8-K 0001493152-26-048795와 424B5 0001493152-26-048792. 직접 원문 범위에는 기존 금액 문맥을 확인하기 위한 10/23 424B5 0001493152-26-048282도 포함한다.
- 운영 공개 GET HTTP 200, asOf 2026-10-31T15:51:25.503Z, NAS enabled COMMON_STOCK, API 시총 $60,547 USD(기초 가격 관측 10/30 07:13:01.839Z), RSS 11, bullish 1, SEC 분류 이벤트 0. DB 쓰기 없음.
- **주식수 차이 경고**: 운영 API listed_shares 713,994와 10/23 SEC prospectus supplement가 보고한 common shares outstanding 19,202,198는 약 26.9배 차이가 있다. SEC 수량은 10/23 기준이고 KIS price $0.0848은 10/30 관측이므로 곱한 약 $1,628,346은 혼합 시점·원천의 교차 산술치일 뿐 현재 공식 시총이나 float가 아니다. 두 수치 기준 모두 $100M 이하로 보이지만 운영 API 시총은 정합성 확인 전 확정값으로 쓰지 않는다.

### 계약 및 공모 범위 판단

| 항목 | 확인 내용 | 상태·한계 |
|---|---|---|
| Amendment No. 2 체결/효력 | 10/27 계약에 Clear Street LLC를 추가 판매대리인으로 편입; Needham & Company LLC는 계속 판매대리인 | 계약 효력 10/27 REPORTED. 8-K와 424B5 접수일은 10/28. 계약 시각은 미공개 |
| 기존 ATM 공모 | 10/23 선행 424B5에 up to $18.8M 보통주 공모가 기재. 10/28 보충설명서는 기존 Sales Agreement의 Clear Street 추가 목적만이라고 명시 | $18.8M은 이번 변경으로 새로 늘어난 금액이 아니며, 미매각 잔여액·기집행 매각액으로도 단정하지 않음 |
| 실제 주식 판매 | 회사가 placement notice에 따라 한 명 또는 두 판매대리인을 이용할 수 있음 | 이번 amendment/424B5에서 실제 매각 수량·금액·매도일·잔여한도 확인되지 않음 |
| 미래 일정 | 특정 Placement Notice 또는 매도 시점 공시 없음 | 추가 확정·추정 매도 일정을 생성하지 않음 |

기존 복구 이벤트의 eventDate를 공모 보충설명서 filing date 10/28에서 Amendment의 계약 발효일 10/27로 정정하고, 10/23 선행 424B5를 관련 accession으로 연결했다. 거래일/계약 효력일과 접수일을 분리했으며 실제 ATM 매각을 발생한 것으로 추정하지 않았다.

공식 SEC 자료: [10/23 선행 424B5](https://www.sec.gov/Archives/edgar/data/1347858/000149315226048282/form424b5.htm), [10/28 424B5](https://www.sec.gov/Archives/edgar/data/1347858/000149315226048792/form424b5.htm), [8-K](https://www.sec.gov/Archives/edgar/data/1347858/000149315226048795/form8-k.htm), [Amendment No. 2 Exhibit 10.1](https://www.sec.gov/Archives/edgar/data/1347858/000149315226048795/ex10-1.htm), [SEC issuer submissions](https://data.sec.gov/submissions/CIK0001347858.json).

이번 배치 후 누계: 100개 종목, 155 이벤트, 166 accession-event 관계. 직접 원문 검토 종목 59/100, 재검증 대기 45 이벤트/42 종목. Filing status: TARGETED 69 / INVENTORY 5,428 / FULL 71 / TRIAGE 94.


## 2026-11-01 보충 검증 Batch 59 — FGL Nasdaq 공개주식수 요건 회복

### 종목·공시 범위 및 운영 확인

- Founder Group Limited (FGL), CIK 0001989930. 검토창: 2025-10-31 이상, 2026-11-01 미만. SEC 최신 submissions는 10/23 6-K accession 0001213900-26-111870이며 후속 제출은 이번 조회에서 확인되지 않았다. 6-K와 Exhibit 99.1 직접 검토, accession index 메타데이터 확인.
- 운영 공개 GET HTTP 200, asOf 2026-10-31T15:54:01.754Z, NAS enabled COMMON_STOCK, USD 시총 $109,066(가격 기초 관측 2026-10-30T07:18:51.843Z), RSS 2, bullish 1, SEC 분류 이벤트 0. DB 쓰기 없음.
- **주식수 기준 차이**: 운영 listed_shares 73,693과 발행사가 Nasdaq에 10/9 기준 확인한 publicly held shares 541,791은 같은 정의의 수치인지 확인되지 않았다. 공개주식수는 회사 전체 발행주식수와 다르며 SEC press release는 total outstanding을 제시하지 않는다. 둘을 서로 대체하거나 공식 시총을 재계산하는 데 사용하지 않았다.

### 규정 이벤트와 날짜 구분

| 항목 | 날짜·수치 | 상태 |
|---|---|---|
| Nasdaq 서한 | 2026-10-19자 서한 | 요건 회복 결정일, COMPLETED |
| 발행사 확인 | 회사는 2026-10-09 Nasdaq에 공개주식수 541,791주를 확인했다고 발표 | 기준수량; 500,000 최소요건보다 41,791주(8.36%) 초과 |
| 회사 발표/SEC 접수 | 2026-10-23 | 결정 발표 및 SEC 6-K filing date. 10/19 결정일과 분리 |
| 해결 범위 | Nasdaq Listing Rule 5550(a)(4), 최소 500,000 publicly held shares | Nasdaq이 compliance를 확인하고 해당 matter를 closed 처리. 다른 Nasdaq 규정/상장요건의 회복을 뜻하지 않음 |

기존 이벤트 eventDate를 보도자료/SEC 제출일 10/23에서 Nasdaq 서한 날짜 10/19로 정정하고, 원장에는 SEC filing date와 회사 확인 기준일(10/9)을 별도 메타데이터로 보존했다. 서한 시각이 공개되지 않아 KST 시각은 만들지 않았다. 이벤트 상태는 확인된 회복 결과에 따라 COMPLETED로 갱신했다.

공식 자료: [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1989930/000121390026111870/ea0309493-6k_founder.htm), [Exhibit 99.1 press release](https://www.sec.gov/Archives/edgar/data/1989930/000121390026111870/ea030949301ex99-1.htm), [SEC issuer submissions](https://data.sec.gov/submissions/CIK0001989930.json).

이번 배치 후 100개 종목, 이벤트 155건, accession-event 관계 166건이다. 직접 원문 검토 종목 60/100, 재검증 대기 이벤트 44건/41개 종목. Filing 상태 TARGETED 68 / INVENTORY 5,428 / FULL 72 / TRIAGE 94.

### 추가 원문 확인 배치 21 — GLXG

2026-11-01 KST에 운영 서버 공개 GET 스냅샷과 SEC EDGAR 원문을 대조했다. 운영 종목 마스터는 GLXG를 NAS 활성 `COMMON_STOCK`으로 분류했고, 관측 시가총액은 US$1,801,826(가격·주식수 스냅샷 기준)이다. 운영 GET은 읽기 전용으로 수행했으며 운영 DB에 쓰지 않았다.

| 티커 | 사건일·상태 | accession | 확인 내용 및 원문 |
|---|---|---|---|
| GLXG | 2026-01-15 — 2026 PIPE 계약 (REPORTED, 종결 미확인) | 0001213900-26-006699 | 비미국 투자자 대상 보통주 3,800,000주, 주당 US$0.66, 예상 총액 약 US$2.5M(비용 전). 종결은 통상 조건과 상호 합의 일정에 달렸다. 계약 발표를 발행 완료로 간주하지 않는다. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1905920/000121390026006699/ea0273755-6k_galaxy.htm) |
| GLXG | 2026-01-21 — 2025 PIPE 의무 종료 합의 (REPORTED) | 0001213900-26-006699 | 2025년 7월·9월 계약의 의무를 종료하는 합의다. 2026 PIPE와 별도 사건이다. 같은 [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1905920/000121390026006699/ea0273755-6k_galaxy.htm) |
| GLXG | 2026-07-15, 19, 29 — 합계 760,000주 보상 부여·즉시 귀속 (REPORTED) | 0001213900-26-113297 | 20-F Note 15는 세 날짜의 총 부여량만 보고하며 날짜별 배분은 공개하지 않는다. 이벤트 원장의 단일 날짜 필드는 첫 승인일을 두고, 요약·제한사항에 집계 날짜 범위를 명시했다. [SEC 20-F](https://www.sec.gov/Archives/edgar/data/1905920/000121390026113297/ea0308886-20f_galaxy.htm) |

같은 20-F는 2026년 10월 중 PIPE 잔여대금 HKD15,631,414(US$1,993,294) 수령으로 청약미수금이 완납됐다고 기재하지만 정확한 일자는 없다. 따라서 허위 날짜를 만들지 않고 월 단위 사실로 연간 이벤트의 한계에 기록했으며, `market-impact-events.v1`의 날짜 필드가 요구하는 일 단위 이벤트 행은 추가하지 않았다. 2026 PIPE 계약의 실제 주식 발행·종결일도 이 근거만으로 확정하지 않았다.

해당 6-K와 20-F는 이벤트 관련 구간을 표적 검토했으며 두 건 모두 `TARGETED_SECTION_REVIEW`다. 운영 종목 사본, accession 원장, 검토 이벤트 색인 및 canonical 이벤트 원장을 함께 갱신했다. 운영 데이터 쓰기, 빌드·테스트, 커밋·푸시·배포는 하지 않았다.

### 추가 원문 확인 배치 22 — KAPA

2026-11-01 KST 운영 공개 GET에서 KAPA는 NYSE American(`AMS`) 활성 `COMMON_STOCK`, 관측 시가총액 US$1,828,445로 확인됐다. SEC 8-K accession `0001493152-26-045844`와 Exhibit 99.1을 직접 읽고 ClinicalTrials.gov `NCT05534646` 등록 정보를 대조했다.

| 티커 | 날짜·상태 | 식별자 | 이벤트와 일정 근거 |
|---|---|---|---|
| KAPA | 2026-10-06 — ENV-105 Phase 2 중간 효능 발표 (REPORTED) | SEC `0001493152-26-045844`, NCT `NCT05534646` | 회사 발표: mCRPC에서 ENV-105(carotuximab)+apalutamide 병용군 중앙 PFS 17.7개월 대 apalutamide 단독 2개월, P=0.0008. 이후 프로토콜 변경: enzalutamide 단독 대 enzalutamide+ENV-105 무작위 비교. [SEC Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1962011/000149315226045844/ex99-1.htm) |

임상·일정 해석: 등록부는 Phase 2, 공개·무작위 시험, 예상 등록 116명, primary endpoint rPFS, 모집 중으로 기재한다. 등록부의 primary completion은 **2028년 1월 추정**(2026년 9월 확인 상태)이다. 회사 보도자료의 시험 완료 목표는 **2027년 4분기**다. 두 일정 모두 추정치이며 서로 다른 기준의 일정으로 보존했다. [ClinicalTrials.gov NCT05534646](https://clinicaltrials.gov/study/NCT05534646)

반대 근거·한계: SEC Exhibit는 중간 분석 환자 수, PFS 신뢰구간·위험비와 사전 지정 분석계획을 공개하지 않는다. 중간 신호 뒤 비교군·환자군을 포함한 프로토콜이 바뀌었으므로 결과를 확증적 임상 성공으로 보지 않는다. 이 자료에 FDA 목표일은 없으며 Phase 2 발표는 FDA 승인이나 매출을 뜻하지 않는다. 과거 주가 반응은 계산하지 않았다. 10월 SEC 8-K 원문 관련 구간은 `TARGETED_SECTION_REVIEW`로 표시했다.

운영 서버 공개 GET은 read-only였고 운영 DB 쓰기는 없었다. canonical event, 검토 색인, issuer filing 사본, accession ledger 및 보고서에 결과를 연결했다.

### 추가 원문 확인 배치 23 — GIPR

2026-11-01 KST 운영 공개 GET에서 GIPR는 Nasdaq(`NAS`) 활성 `COMMON_STOCK`, 관측 시가총액 US$985,876으로 확인됐다. SEC 8-K accession `0001193125-26-414221` 및 첨부 Exhibit 10.1을 대조했다.

| 티커 | 서명일·상태 | 접수일·식별자 | 주요 조건 |
|---|---|---|---|
| GIPR | 2026-10-02 서명, 10-14 효력 (REPORTED) | 2026-10-05 접수, `0001193125-26-414221` | Generation Income Properties, L.P. 운영파트너십의 Brown Family Enterprises LLC 담보 Note 만기를 2026-10-14에서 2027-10-14로 연장했다. 2026-09-28 원금은 US$5.2M, 이자율 연 9% 단리·월 지급이며 나머지 지급조건과 담보는 유지된다. Noteholder는 계약 실행 시점에 default가 없다고 확인했다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1651721/000119312526414221/gipr-20261002.htm), [계약서 Exhibit 10.1](https://www.sec.gov/Archives/edgar/data/1651721/000119312526414221/gipr-ex10_1.htm) |

만기 연장은 상환이나 원금 감축이 아니다. 단기 만기 집중은 늦췄지만 US$5.2M 원금 및 월 이자 부담은 지속된다. default 부재는 Noteholder의 실행일 기준 확인으로 한정하며 향후 지급능력 보증으로 해석하지 않는다. 이벤트 날짜는 서명일, 효력일과 SEC 접수일을 별도 필드 설명과 근거에 보존했다. 원문 관련 부분은 `TARGETED_SECTION_REVIEW`다. 운영 GET은 read-only였고 운영 DB 쓰기는 없었다.

### 추가 원문 확인 배치 24 — IMCC

2026-11-01 KST 운영 공개 GET에서 IMCC는 Nasdaq(`NAS`) 활성 `COMMON_STOCK`, 관측 시가총액 US$1,400,864였다. SEC 6-K accession `0001178913-26-004699`와 Exhibit 99.1 거래 종결 발표자료를 검토했다. SEC submissions recent 목록에는 2026-10-31까지 이 거래의 후속 material change report accession이 보이지 않았다.

| 티커 | 종결일·상태 | 접수일·식별자 | 거래 내용 |
|---|---|---|---|
| IMCC | 2026-09-29 — IMC Holdings 매각 종결 (COMPLETED) | 2026-10-02 접수, `0001178913-26-004699` | 회사는 Slil.com Holding Ltd.에 IMC Holdings의 발행주식 전부를 매각했다. IMC Holdings는 이스라엘 사업을 사전 재편으로 회사에 남긴 뒤 유럽 중심 대상 자회사 지분과 특정 retained liabilities를 보유했다. 대가는 종결 전 지급된 C$3M advance와 매수자의 IMC Holdings 인수이며 종결 때 C$3M 신규 현금이 다시 지급된 것으로 보지 않는다. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1792030/000117891326004699/zk2636170.htm), [Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1792030/000117891326004699/exhibit_99-1.htm) |

조건·위험: retained liabilities 합계는 C$9.4M 이하(당사자 합의로 조정 가능)지만 대상 자회사 직접부채는 cap에서 제외된다. 회사 발표의 약 C$3M 자본 개선은 management의 미감사 pro forma 추정이며 실제 회계 영향은 달라질 수 있다. 매수자 Slil은 CEO·이사 Oren Shuster가 소유·지배하는 related party다. 특별위원회는 독립이사로 구성됐고 CEO는 심의·표결에 참여하지 않았다고 회사는 밝혔다. 회사는 financial-hardship exemption을 근거로 formal valuation 및 minority approval 면제를 이용했다고 기재했다. 대가로 회사·IMC Holdings 증권은 발행·교환되지 않았다. 효과와 재무 곤란·관련자·채무 한도를 함께 고려해 이벤트 방향은 MIXED로 분류했다. 운영 GET은 read-only였고 운영 DB 쓰기는 없었다.

### 추가 원문 확인 배치 25 — DXST

2026-11-01 KST 운영 공개 GET에서 DXST는 Nasdaq(`NAS`) 활성 `COMMON_STOCK`, 관측 시가총액 US$1,857,397이었다. SEC 6-K accession `0001185185-26-004858`, Exhibit 99.1, 2026-10-23 F-3 accession `0001185185-26-004978`을 확인했다.

| 티커 | 발표일·상태 | accession | 확인 내용 |
|---|---|---|---|
| DXST | 2026-10-20 — 시니어 케어 관련 수수료 현금 회수 약 US$3M 발표 (REPORTED) | `0001185185-26-004858` | Suncare 플랫폼이 2026년 9월 이후 서비스 관련 수수료에서 약 US$3M의 현금 회수를 기록했다고 발표했다. 회사는 내부 재무기록과 은행거래 대조를 근거로 들었다. [SEC 6-K Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1958133/000118518526004858/dxstex99-1.htm) |

발행사 발표자료는 해당 금액이 통상 결산절차 및 US GAAP 수익 인식 요건을 따른다고 명시한다. 따라서 회수액을 인식 매출·순이익 또는 반복 현금흐름과 동일시하지 않았다. 정확한 수금 시작일·거래처·원가·마진은 공개되지 않았다. 10월 23일 F-3는 후속 제출로 확인했지만 이 회수액이 재무제표 손익에 인식됐다는 직접 확인은 찾지 못했다. 해당 자료는 별도 등록·매도 공시이므로 후속 공시가 전혀 없다고 단정하지 않는다. 이벤트 방향은 UNCERTAIN으로 유지했다. 운영 GET은 read-only였고 운영 DB 쓰기는 없었다.

### 추가 원문 확인 배치 26 — FMFC

2026-11-01 KST 운영 GET에서 FMFC는 Nasdaq(`NAS`) 활성 `COMMON_STOCK`, 관측 시가총액 US$1,586,021, 가격 US$3.80, `listed_shares` 417,374로 확인됐다. 운영 RSS의 2026-10-15 StockTitan 실적 뉴스와 SEC 6-K 3건을 대조하고, 첨부된 실적발표 Exhibit 99.1을 읽었다.

| 티커 | 이벤트일·상태 | SEC accession | 정리 |
|---|---|---|---|
| FMFC | 2026-10-13 — 1:40 병합 조정 거래 개시 (COMPLETED) | `0001213900-26-106390` | 보드 승인 8/28, 주주 승인 9/22. 회사는 Class A 16,694,940주→417,374주, Class B 3,000,000주→75,000주, 합계 issued and outstanding 19,694,940주→492,374주(추가 변동 없고 분수주 올림 전 가정)를 보고했다. Nasdaq Capital Market에서 10/13 개장부터 조정 거래. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2024656/000121390026106390/ea0306977-6k_kandal.htm) |
| FMFC | 2026-10-15 — FY2027 상반기 미감사 실적 (REPORTED) | `0001213900-26-109625` | 2026-09-30 종료 6개월: 매출 US$9.556M(전년 US$7.904M, +20.9%), 매출총이익 US$2.150M(US$1.480M, +45.3%), gross margin 22.5%(18.7%에서 +3.8%p), 영업이익 US$538K(US$190K). G&A는 US$1.480M으로 25.9% 증가. 순이익 수치는 발표자료에 없다. [SEC Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/2024656/000121390026109625/ea030842801ex99-1.htm) |
| FMFC | 2026-11-30 — Nasdaq 시정계획 제출기한 (CONFIRMED_SCHEDULED) | `0001213900-26-111019` | 회사는 10/15 Nasdaq으로부터 Listing Rule 5550(a)(4)상 최소 500,000 publicly held shares 미충족 통지를 받았고, 11/30까지 구체적 시정계획을 제출해야 한다. 이 날짜는 계획 제출기한이다. 계획 수락, actual 요건 회복 또는 상장유지는 확정되지 않았다. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2024656/000121390026111019/ea0308843-6k_kandal.htm) |

주의·반대근거: 역분할은 기계적 가격·주식수 조정이며 투자수익을 의미하지 않는다. 회사의 합계 issued and outstanding 492,374주와 Class A 417,374주, 운영 KIS `listed_shares` 417,374주는 Nasdaq publicly held shares 수와 동일하다고 확인되지 않았다. 실제 public float 수량은 이번 자료에서 미확인이다. Nasdaq 통지는 정확한 cutoff 시각을 주지 않아 11/30 ET 날짜를 기록하고 KST 시각을 만들어내지 않았다. H1 실적은 미감사이며 결산 후 바뀔 수 있고, 회사가 예상한 interim financial statements의 제출시기는 “2027년 1월 중 또는 그 무렵”으로 월 단위 추정이므로 임의의 1월 날짜를 이벤트 행으로 만들지 않았다.

### 추가 원문 확인 배치 27 — FRGT

2026-11-01 KST 운영 GET에서 FRGT는 Nasdaq(`NAS`) 활성 `COMMON_STOCK`, 관측 시가총액 US$1,583,393이었다. SEC 6-K accession `0001493152-26-047162`(10/15)와 `0001493152-26-047518`(10/19), 10/19 공시의 Exchange Agreement Exhibits 10.1·10.2 및 Exhibit 99.1을 직접 대조했다.

| 티커 | 사건일·상태 | SEC 식별자 | 사건·수치 |
|---|---|---|---|
| FRGT | 2026-10-19 — 1:10 역분할 조정 거래 개시 (COMPLETED) | `0001493152-26-047162`, `0001493152-26-047518` | 이사회 승인 10/8, Nasdaq split-adjusted 거래 10/19 개시. 10/15 공시가 제시한 pre-split 16,814,200주→예상 post-split 1,681,420주(미행사 options/warrants 제외). 10/19 잔여 warrant 전부 행사 사실은 별도 발표됐으나 수량이 없어 실제 행사 후 발행주식 수는 미확인. 분수주 0.5 이상 올림, 0.5 미만 취소. 발행주식 수는 public float가 아니다. [10/15 SEC 6-K](https://www.sec.gov/Archives/edgar/data/1687542/000149315226047162/form6-k.htm), [10/19 SEC 6-K](https://www.sec.gov/Archives/edgar/data/1687542/000149315226047518/form6-k.htm) |
| FRGT | 2026-10-18 — Series A4·Series C exchange rights 체결 (REPORTED) | `0001493152-26-047518` | Series A4 우선주 1,666,837주 전량 및 Series C 우선주 3,190,000주를 보통주 수령권으로 교환. 10/19 병합 후 최대 rights shares는 A4 3,245,332주(주당 US$1.87 기준), C 3,190,000주(주당 US$1.00 기준). 추가 대가 없이 행사 가능, 각 holder·attribution parties 합산 9.99% beneficial ownership 제한. 권리와 실제 발행은 별개다. [Exhibit 10.1](https://www.sec.gov/Archives/edgar/data/1687542/000149315226047518/ex10-1.htm), [Exhibit 10.2](https://www.sec.gov/Archives/edgar/data/1687542/000149315226047518/ex10-2.htm), [Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1687542/000149315226047518/ex99-1.htm) |
| FRGT | 2026-10-19까지 — 2023 전환사채 금융 관련 잔여 워런트 행사 완료 (COMPLETED) | `0001493152-26-047518` | 회사는 해당 금융과 관련해 남은 ordinary share warrants가 모두 행사되어 미행사 잔량이 없다고 발표했다. 행사 수량·행사가·현금 유입은 공개자료에서 확인되지 않아 미기재. [Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1687542/000149315226047518/ex99-1.htm) |

잠재 희석 주의: A4·C 권리 최대 6,435,332주는 10/15 공시의 예상 post-split 1,681,420주(미행사 options/warrants 제외) 대비 약 3.83배 규모라는 단순 비교다. 잔여 2023 warrant의 10/19 행사 수량은 미공개이므로 이 분모는 실제 행사 후 총발행주식 수가 아니다. 비교치는 실제 발행량·확정 희석률·public float가 아니다. 9.99% 제한은 행사 시점의 beneficial ownership 한도이며 누적 rights 전체가 소멸하는 cap으로 해석하지 않는다. 역분할에 따른 가격 조정은 투자수익과 별개다. 운영 GET은 read-only였고 운영 DB 쓰기는 없었다.

### 추가 원문 확인 배치 67 — SEC 근거 발행사 대조 및 GNLN·CSAI·ZNB 재검증

2026-11-01 KST 운영 공개 GET으로 GNLN, CSAI, ZNB의 NAS 활성 COMMON_STOCK 및 시가총액이 각각 US$1,159,888, US$1,986,254, US$2,550,055임을 확인했다. 세 GET 모두 HTTP 200, DB write 없음. 운영 응답 asOf는 각 티커별 원장에 기록했다.

기존 canonical 이벤트 161건의 SEC URL CIK를 유니버스 발행사 CIK와 대조해 GNLN, CSAI, ZNB의 다른 발행사 문서 인용 및 GIPR sourceUrl CIK 오기를 발견했다. SEC 공식 원문 기준으로 GNLN 8-K 0001493152-26-046030/047256, CSAI 8-K 0001683168-26-007556과 Ex.10.1, ZNB 6-K 0001213900-26-099698을 재검토했다. GNLN 9/30 자산양도·비연결과 10/9 법원 관할을 분리 기록했다. ZNB의 완료 병합 및 조건부 추가 병합 승인 근거를 해당 6-K로 교체했다. GIPR 0001193125-26-414221 sourceUrl은 CIK 1651721로 수정했다.

| 티커 | 공시 | 기록 |
|---|---|---|
| GNLN | [10/7 8-K](https://www.sec.gov/Archives/edgar/data/1743745/000149315226046030/form8-k.htm), [10/15 8-K](https://www.sec.gov/Archives/edgar/data/1743745/000149315226047256/form8-k.htm) | 9/30 자회사 4곳의 Assignment·비연결 event 추가, 10/9 법원 절차 이벤트를 별도 COMPLETED로 정정. 예비 $3,159,607 gain은 6/30 pro forma 기준임을 명시. |
| CSAI | [8-K](https://www.sec.gov/Archives/edgar/data/1709628/000168316826007556/cloud_8k.htm), [Ex.10.1](https://www.sec.gov/Archives/edgar/data/1709628/000168316826007556/cloud_ex1001.htm) | $63,332.50 어음 분할·18,246주 교환 약정을 직접 인용. 9/30 인도 기한과 Free Trading Date 조건을 분리하고 완료 여부 미확인 유지. |
| ZNB | [6-K](https://www.sec.gov/Archives/edgar/data/1747661/000121390026099698/ea0304940-6k_zeta.htm), [10/19 20-F](https://www.sec.gov/Archives/edgar/data/1747661/000121390026110666/ea0307933-20f_zeta.htm) | 7/27 8:1 병합 완료와 9/10 추가 8:1 병합 조건부 승인을 바로잡음. 거래개시 시각·발행/유통 수량은 근거 부족으로 미확인. |

새로운 accession-event 관계를 포함해 이벤트 162건, 접수번호 관계 176건, 직접 원문 검토 발행사 63개, 복구 이벤트 원문 재검토 대기 32건/발행사 31개로 집계했다. filing 상태는 FULL 72, INVENTORY 5,426, TRIAGE 92, TARGETED 72 (총 5,662). 검증기는 canonical sourceUrl 및 evidence SEC URL의 CIK가 발행사와 일치하는지 검사하고, cross-filer citation은 relatedSourceUrls에 명시된 경우에만 허용한다. 검증 성공.

### 추가 원문 확인 배치 68 — CIIT Enterprise AI 개발계약

2026-11-01 KST 운영 공개 GET에서 CIIT는 NAS 활성 COMMON_STOCK, 시가총액 US$1,750,978로 확인됐다. 응답은 HTTP 200, asOf `2026-10-31T16:17:59.114Z`, DB write 없음. 운영 피드에는 10/15 8-K와 10/29 NT 10-K가 확인됐다. SEC 제출 인덱스에서 8-K 접수는 2026-10-15 17:00:13 ET (2026-10-16 06:00:13 KST), 보고 기준일은 10/12로 확인했다.

[SEC 8-K 원문](https://www.sec.gov/Archives/edgar/data/1557798/000168316826007903/tianci_8k.htm)은 Tianci 자회사 RQS United Group Limited와 Roshing International Co., Limited가 Linknex Limited에 Enterprise AI 통합 플랫폼 개발을 맡긴 계약을 보고한다. 계약 대가는 US$146,700 현금과 Tianci 보통주 180,000주다. 구체 범위·사양·마일스톤·검수기준은 추후 Statement of Work에서 정하기로 했고, 주식은 Nasdaq 상장 후 20영업일 내 발행 조건이다. 실제 납품·검수·현금지급·주식발행은 원문에서 확인되지 않아 완료로 처리하지 않았다. 수익·절감 효과도 공시되지 않아 잠재 방향은 MIXED로 두었다.

이벤트 원문 근거를 복구해 confidence를 HIGH로 올리고 risks/limitations를 계약의 대가·SOW 미확정·실행상태 한계로 교체했다. CIIT accession 행은 TARGETED_SECTION_REVIEW로 유지하면서 review batch를 갱신했다. 이벤트 수는 162건, accession-event 관계 176건으로 유지된다. 직접 원문 검토 발행사는 64개, 원문 재검토 대기 이벤트는 31건/30개 발행사다. filing 상태는 FULL 72, INVENTORY 5,426, TRIAGE 92, TARGETED 72로 총 5,662건이다.

### 추가 원문 확인 배치 69 — CISS Afrapearl II 항해용선

2026-11-01 KST 운영 GET은 HTTP 200, asOf `2026-10-31T16:19:46.907Z`, NAS 활성 COMMON_STOCK, 시가총액 US$802,313으로 확인됐다. `rssArticles`와 `bullishArticles`에는 동일한 StockTitan 기사(게시 메타데이터 2026-10-12 13:00 UTC)가 있었고 운영 `secEvents`는 0건이었다. 데이터베이스 쓰기는 수행하지 않았다.

[회사 IR 원문](https://c3is.pro/c3is-inc-announces-attractive-voyage-charter-contract-for-its-aframax-tanker-delivery-of-the-second-mr-product-tanker-and-robust-nav-share/investor-relations/press-releases/)은 Afrapearl II가 25일 왕복 항해용선 계약을 체결했으며 일일 gross 운임은 US$175,000이라고 발표했다. 용선자·운항 시작일·비용·순이익은 공개되지 않았다. 같은 보도자료의 두 번째 MR선 Q3 인도는 이미 완료된 분기 내 사실로 분리해 미래 일정으로 취급하지 않았다. fully diluted NAV/share US$11.73은 회사 추정이며, 회사가 현재 또는 향후 주주가 받을 금액이 아니라고 명시했다. 회사 발표시각은 미공개이므로 StockTitan 게시 시각을 발표시각으로 대체하지 않았다.

이벤트에 원문 evidence 4건과 관련 위험·제한을 기록하고 recovered 상태를 직접 원문 검토로 변경했다. 뉴스 출처 식별자는 `CISS:IR:2026-10-12`, 관련 운영 뉴스 URL 및 게시시각은 issuer snapshot과 reviewStatus batch metadata에 기록했다. 이 보도자료에 대응하는 SEC accession을 확인하지 못해 SEC filing relation은 생성하지 않았다. 이번 배치 이후 직접 검토 발행사 65개, recovered pending 30건/29개 발행사다. 전체 이벤트 162건, SEC accession-event 관계 176건, 제출 원장 5,662건이며 filing 상태 분포는 변하지 않았다.

### 추가 원문 확인 배치 70 — HUBC Nasdaq MVLS 및 QPoint 절차

2026-11-01 KST 운영 공개 GET은 HTTP 200, asOf `2026-10-31T16:23:35.722Z`, NAS 활성 COMMON_STOCK, KIS 시가총액 US$242,436을 확인했다. RSS에는 Nasdaq MVLS 통지 관련 9/25 StockTitan 기사와 10/13 이사선임 기사, SEC 6-K 0001213900-26-112826(10/27) 및 6-K 0001213900-26-109036(10/13)가 있었다. 운영 `secEvents`는 0건, DB write 없음. operating snapshot의 KIS market_cap은 Nasdaq MVLS 산식과 같다고 확인되지 않아 $35M 기준과 직접 비교하지 않았다.

[9/28 6-K](https://www.sec.gov/Archives/edgar/data/1905660/000121390026103684/ea0306787-6k_hubcyber.htm)는 9/23 Nasdaq 통지 당시 직전 30거래일 연속 MVLS $35M 미달, 180일 회복기간, 2027-03-22 마감 및 10거래일 연속 준수 조건을 확인한다. 이벤트 날짜를 통지 접수일과 분리해 실제 준수 마감일 2027-03-22로 수정했다. 이후 10/31까지 확인한 운영/제출자료에는 준수 회복 확인이 없었으나, 확인 범위 내 미발견을 미회복의 증거로 취급하지 않는다.

10/13 6-K는 Richard Paolone 및 Joseph Tung 독립이사 선임이 즉시 효력을 발생했다고 보고한다. [10/27 6-K](https://www.sec.gov/Archives/edgar/data/1905660/000121390026112826/ea0309792-6k_hub.htm)는 Israeli Competition Authority가 10/14 QPoint Sale을 승인했으며, 담보채권자가 회사·매수자 동의 아래 pledged shares에 한정한 담보권 실행 및 공동 receiver 선임 신청을 법원에 냈다고 보고한다. 이는 매각종결이나 법원 승인이 아니다. 같은 filing은 11/1 10:00 Israel Standard Time (KST 17:00) Tel Aviv-Jaffa District Court 심리 일정을 확정 공지한다. 사건번호 59179-10-26. 매각대금은 담보채무 전액을 상환하기에 부족할 것으로 회사가 예상했으며, 거래대가·잔존 부채·심리결과는 확인되지 않았다.

기존 MVLS 이벤트 1건을 정정하고 신규 이사선임·경쟁당국 승인·담보권 실행 신청·법원 심리 이벤트 4건을 원문 근거와 상태별로 기록했다. 109036 및 112826 filing 행은 TARGETED_SECTION_REVIEW로 바꾸고 각 이벤트 ID 관계를 ledger·issuer copy·eventRelevantDocuments에 반영했다. 집계는 100 issuers, 5,662 submissions, 166 events, 180 accession-event relations; filing states FULL 72, INVENTORY 5,426, TRIAGE 90, TARGETED 74다. 직접 검토 발행사 66개, recovered pending 29건/28개 발행사다.


## 2026-11-01 Batch 71 — INLF 등록 공모 단계별 일정

- 운영 공개 API read-only GET: HTTP 200, NAS 활성 COMMON_STOCK, KIS market cap US$277,293 (관측 2026-10-30T07:06:35.275Z), API asOf 2026-10-31T16:27:16.850Z; DB write 없음. KIS listed_shares 1,046,390은 6월 30일 기준 SEC 발행주식 수와 일치하나, 10/20 공모 후 주식수와 시점이 달라 현재 SEC 잔액으로 간주하지 않음.
- SEC accession 0001213900-26-111362 (6-K) 및 0001213900-26-110849 (424B5), Ex.99.1 가격결정, Ex.99.2 종결, Ex.4.4 Series C warrant를 대조. 가격 결정, 종결, 행사 보고, C reset, A/B reset을 서로 다른 eventId로 관리하고 두 filing의 eventIds와 relation index를 동기화함. 424B5를 TRIAGE_EXCERPT에서 TARGETED_SECTION_REVIEW로 올림.
- 리셋일 계산: Series C는 계약문구상 발행일 10/20 포함 제10거래일인 11/2. Series A/B는 10/20 종결 후 제20거래일인 11/17. Nasdaq 2026 거래일 달력에 따른 계산 추정이며 공시된 확정 달력 일정이 아님.
- 구조화 원장: 미국 이벤트 170건, accession-event 관계 189건, 접수 5,662건; filing 상태 FULL 72 / INVENTORY 5,426 / TRIAGE 89 / TARGETED 75.
- 검증: npm run validate:us-smallcap-event-data 통과.
- 커밋/푸시/배포: 수행하지 않음.


## 2026-11-01 Batch 72 — LABT 연례주총 결과 원문 재검증

- 운영 공개 API read-only GET: HTTP 200, NAS 활성 COMMON_STOCK, KIS USD market cap $562,327 (관측 2026-10-30T07:06:35.275Z), asOf 2026-10-31T16:33:17.263Z, RSS 8건, classified SEC event 0건, DB write 없음.
- SEC 8-K 0001213900-26-104177, Item 5.07을 확인했다. 2026-09-22 주총에서 authorized common 12.5M→100M, 누적 최대 1:20 reverse split 권한, equity plan 발행 가능량 400,000주를 승인했다. 7/30 기준 의결권 보통주 2,369,688주.
- 표결 승인은 완료됐지만 역분할 실행은 이사회 재량이며 비율·효력일·조정 거래일 미확정으로 분리했다. 발행가능주식 확대는 향후 발행 위험이며 즉시 발행으로 해석하지 않는다.
- 복구 대기 이벤트 27건/26개 발행사로 감소. 프로젝트 validator 통과; 이벤트 170, accession-event relations 189, submissions 5,662.


## 2026-11-01 Batch 73 — MTNB 역분할 법적 효력 검증

- 운영 공개 GET: HTTP 200, 활성 NYSE American COMMON_STOCK, USD market cap $1,889,592 (관측 2026-10-30T11:57:08.529Z), asOf 2026-10-31T16:34:35.504Z, RSS 3건, classified SEC events 0건, DB write 없음. GET의 listed_shares 979,520은 KIS 관측값으로 남기며 SEC가 확인한 병합 후 발행주식 수로 등치하지 않음.
- SEC 8-K 0001493152-26-044451 Item 5.03에서 1:15 split legal effective time을 2026-09-28 00:01 EDT(04:01 UTC; 13:01 KST)로 확인. CUSIP 576810 402로 변경.
- split-adjusted 거래는 NYSE American 승인 조건부로 9/28 장 개시 예상이라 보고된 사실과 실제 개시를 구분했다. 8-K에 전후 issued shares 수는 없어 미확인으로 유지.
- 구조 검증 후 직접 원문 검토 종목 69/100, recovered-pending 26건/25개 issuer.


## 2026-11-01 Batch 74 — VJET 명칭 변경·역분할 이벤트 분리

- 운영 공개 GET: HTTP 200, 활성 NYSE American COMMON_STOCK, USD market cap $1,355,994 (관측 2026-10-30T07:08:11.495Z), asOf 2026-10-31T16:35:32.078Z, listed_shares 2,101,990, RSS 11건, classified SEC events 0건, DB write 없음.
- SEC 8-K 0001437749-26-032038 Item 8.01에서 1:10 병합의 10/5 00:01 EDT 법적 효력, 같은 날 NYSE American 조정 거래 개시, 분할 후 발행주식 약 2,101,987주를 확인했다. 단주 현금정산이 적용될 수 있다. KIS listed_shares 2,101,990은 별도 시점/피드 관측치로 SEC 발행주식 추정치와 동일 수치로 합치지 않았다.
- Catheter Precision에서 Flyte Aviation으로 사명 변경 및 VJET 티커/CUSIP 적용을 역분할과 별도의 eventId로 기록하고, 8-K accession을 두 이벤트에 연결했다.
- 구조 검증 통과: 171 events, 190 accession-event relations, 5,662 submissions. 직접 원문 검토 70/100, recovered-pending 25건/24개 발행사.


## 2026-11-01 Batch 75 — KIDZ 전환사채 추가 종결

- 운영 공개 GET: HTTP 200, 활성 NAS COMMON_STOCK, USD market cap $1,401,482 (관측 2026-10-30T07:10:33.550Z), asOf 2026-10-31T16:36:36.934Z, listed_shares 859,805, RSS 5건, classified SEC events 0건, DB write 없음.
- SEC 8-K 0001477932-26-005667 Items 1.01/2.03/3.02에서 2026-09-17 추가 종결 사실 확인: 원금/aggregate funding $1.9M(수수료·비용 전), 연 7%, 2028-09-17 만기, 최초 전환가 $3.672(조정 가능), 분기 이자 현금·원금 가산·주식 지급 가능, 선순위 담보권.
- 실제 전환주식 수와 이자 결제 방식은 미확정. funding gross를 회사 순수령액으로 보지 않고, 선순위·담보·희석 위험을 별도 기록했다.
- 원문 재검증 후 pending 24건/23개 발행사, 직접 검토 71/100. validator 통과; 총 이벤트 171, 관계 190, SEC submissions 5,662.


## 2026-11-01 Batch 76 — SXTC 추가 매수권 종료 공시

- 운영 공개 GET: HTTP 200, 활성 NAS COMMON_STOCK, USD market cap $36,769,125 (관측 2026-10-30T07:12:11.946Z), asOf 2026-10-31T16:37:39.666Z, listed_shares 10,357,500, RSS 3건, classified SEC events 0건, DB write 없음.
- SEC 6-K 0001213900-26-111404 및 Exhibit 99.1에서 10/21 termination letter 발표, SPA §2.4 추가 매수권 내용과 종료를 확인했다. 권리는 공모 종결 후 30일간 매수자에게 동일 조건으로 최대 $12M의 Class A ordinary shares 및/또는 pre-funded warrants 추가 매입 선택권을 부여한 것이며, 기존 공모 발행 증권은 종료로 영향받지 않는다.
- 발표일과 계약의 실제 종료 효력일, 종료 전 일부 권리행사·추가 매입이 있었는지, 따라서 미사용 권리 한도가 얼마였는지는 공시문에 특정되지 않아 미확인. $12M은 최대 권한이지 실제 추가 조달액이 아니다.
- 직접 검토 72/100, pending 23건/22개 발행사. validator 통과: 이벤트 171, accession-event 관계 190, submissions 5,662.


## 2026-11-01 Batch 77 — XRTX FDA IND 및 Health Canada CTA 일정 정밀도

- 운영 공개 GET: HTTP 200, 활성 NAS COMMON_STOCK, USD market cap $1,814,743 (관측 2026-10-30T11:56:16.220Z), asOf 2026-10-31T16:39:03.831Z, RSS 4건, classified SEC events 0건, DB write 없음. 확인된 최신 관련 운영 뉴스는 10/8 CTA 준비와 9/18 IND Q4 계획이다.
- SEC 6-K 0001171843-26-006109 및 0001171843-26-006540, 각각 Ex.99.1 원문 확인. FDA IND는 issuer target인 Q4 2026 분기 범위만 scheduleWindow로 기록하고 발표일 9/18과 분리했다. Health Canada CTA는 목표일이 없어 UNDATED로 유지했다. 두 건 모두 ESTIMATED, 제출 완료/규제 수리/임상 개시는 확인되지 않았다.
- FDA 발표는 XRx-026(oxypurinol/XORLO), 통풍 적응증 및 XRX-OXY-102 2부 연구 계획을 밝히지만 검토한 자료에서 환자수, 주요 평가변수, 시험 시작일은 미공개다. CTA 발표 당시 상업화 파트너 계약은 없었다.
- 구조 개선: eventDateRole=ANNOUNCEMENT와 datePrecision/scheduleWindow를 분리해 발표일을 실제 제출 예정일로 오인하지 않도록 했다. validator가 QUARTER 범위와 UNDATED/null 창의 parity, 날짜 순서를 검사한다.
- 현재 직접 원문 검토 73/100, 재검증 대기 21건/21개 발행사. validator 통과; 미국 이벤트 171, filing relations 190, submissions 5,662.


## 2026-11-01 Batch 78 — MLEC 청산 결의·감사인 해임 분리

- 운영 공개 GET: HTTP 200, 활성 NAS COMMON_STOCK, USD market cap $994,782 (관측 2026-10-30T07:06:35.275Z), asOf 2026-10-31T16:40:59.848Z, RSS 0건, classified SEC events 0건, DB write 없음.
- SEC 6-K 0001213900-26-111414에서 10/20 09:00 EDT EGM 표결 결과 확인: 출석/대표주 1,408,171 of 2,080,437 (67.686%), 자발적 청산 특별결의와 joint voluntary liquidator 선임 승인, 해당 안건 찬성 약 98.4%. 이는 표결 완료이며 청산 관리·분배·법인 해산 완료가 아니다.
- 같은 6-K는 audit committee가 10/21 PwC를 해임했고 청산 승인 후 계속 선임이 불필요하다고 판단했음을 보고한다. PwC Exhibit 99.1은 회사 설명에 동의. 회사는 관련 기간 회계/감사범위 이견 없음, 기존 PPA 적시완료 관련 material weakness 및 FY2025 audit report의 going-concern explanatory paragraph를 밝혀 해임 이유와 위험 문맥을 분리했다.
- 감사인 해임을 청산 표결과 별도 eventId로 생성하고 양 이벤트를 동일 accession에 연결. 직접 검토 74/100, 재검증 대기 20건/20개 발행사. Validator 통과: 172 events, 191 accession-event relations, 5,662 submissions.


## 2026-11-01 Batch 79 — VIVK Direct Midstream 진행단계·전환 발행 분리

- 운영 공개 GET: HTTP 200, 활성 NAS COMMON_STOCK, USD market cap $2,410,485 (관측 2026-10-30T07:13:01.839Z), asOf 2026-10-31T16:42:29.511Z, listed_shares 1,606,990, RSS 13건, classified SEC event rows 0, DB write 없음.
- SEC 8-K 0001829126-26-010995 원문: Direct Midstream 100% 지분 비구속 LOI 제안과 10/5–6 Second Note 전환 및 128,965주 실제 발행을 각각 분리했다. $350,000은 note amount due이지 문서상 principal이라고 단정하지 않음.
- SEC 8-K/Ex.99.1 기준 LOI는 gross $40M, 대상 targeted 2027 FCF $10M의 4배 가정, 종결 때 $10M 투자로 seller consideration dollar-for-dollar 감소. debt/NWC 조정 전 잔여 대가 약 $29M Series B preferred+$1M common; actual 2027 FCF 기준 gross price 조정 $30M–$50M. 미완료 조건에는 funding, audited financials, fairness opinion, definitive agreement 등이 포함됨.
- 10/23 Vivakor/GlobeNewswire release는 실사 완료 및 definitive agreement 협상 중을 확인하지만 계약 서명/인수 종결은 확인하지 않으며 보장하지 않는다. LOI/조건부 거래와 diligence milestone을 separate event IDs로 관리.
- 검증 통과: 미국 이벤트 174, SEC accession-event 관계 192, 제출 5,662. 직접 검토 75/100, 재검증 대기 19건/19개 발행사.


## 2026-11-01 Batch 80 — PAPL 플랫폼·경영진·재편·티커 단계 분리

- 운영 공개 GET: HTTP 200, 활성 NYSE American COMMON_STOCK PAPL, USD market cap $984,509 (관측 2026-10-30T11:57:08.529Z), asOf 2026-10-31T16:44:48.226Z, RSS 2건, classified SEC event 0건. 별도 PTIV 조회도 HTTP 200이나 ticker/market/instrument null. DB write 없음.
- SEC 8-K 0001493152-26-047167 Items 5.02/8.01 및 Ex.99.1: 10/15 플랫폼 출시, 10/15 CFO·CSO 선임 효력, 10/9 특별위원회 구성, PTIV 목표일 10/26 전후, 법인명 변경 주주승인 조건을 다섯 개 eventId로 분리.
- 현재 operational snapshot에서는 PAPL만 활성 종목으로 확인되어 PTIV 전환 목표일이 지난 뒤에도 변경을 완료로 추정하지 않았다. 법적 사명변경은 주주승인과 효력일이 미확정이며 ticker change와 별도다.
- 정밀 일정 모델 개선: “on or about” 목표를 eventDate 발표일과 approximate-day scheduleWindow로 분리하고 validator에서 ISSUER_TARGET 기반 targetDate를 검증.
- 검증 통과: 178 events, 196 accession-event relations, submissions 5,662; direct primary review 76/100, pending 18건/18개 issuer.

## 추가 원문 확인 배치 90 — NXAT ATM·워런트·감사인·합병 협상

- 운영 공개 GET `2026-11-01`: HTTP 200, NAS active `COMMON_STOCK`, USD 시총 $1,062,419(기초 관측 `2026-10-30T07:11:23.106Z`), listed shares 2,710,253, RSS 2건, classified SEC event 0건. DB write 없음.
- SEC 6-K `0001829126-26-010775` Item 1.01: 회사는 10/2 계약을 공시하며 Anson holder가 9/28 포함 주부터 2027-03-31까지 ATM을 허용했다고 요약했다. 매도 최저가는 $2/share이고 각 결제 순현금 수입의 20%를 3영업일 내 note 이자·late fee, 다음 원금 순서로 적용한다. 실제 ATM 판매·수령·상환은 확인되지 않았다.
- 같은 계약은 8,310,250 warrant shares($1.90 exercise 기준)에 대한 cashless exchange 권리, 0.5415 비율, 최대 4,500,000 Exchange Shares, 현금 대가 없음을 보고한다. 4.5M는 발행 완료가 아닌 최대 권리다. 잔여 Note $2.5M 전액 지급 시 3-day VWAP 고정 전환가 및 anti-dilution/reset/ratchet 종료라는 별도 조건을 기록했다. 지급·교환 실행은 확인되지 않았다.
- 원문 품질 한계: 6-K 본문은 합의 날짜를 Oct 2라고 하지만 부속 Exhibit 99.2 첫 문장은 Effective Date Sep 25, 서명은 Oct 2로 적는다. 부속서의 종료일 “[March 31, 2027]”, Schedule A holder별 주식 수 대괄호, 모든 페이지의 “Draft for counsel review” 표기 및 조문 잔존 편집 흔적을 확인했다. 회사의 6-K 본문 진술로 기간을 저장하되 exhibit discrepancy를 limitation에 보존하고 후속 정정 확인 대상으로 표시했다.
- SEC 6-K `0001829126-26-010675` 및 PwC Exhibit 16.1: Samil PwC 해임 효력 9/21, HTL International의 FY2026 감사인 선임 효력 10/1; 회사는 회계/감사 이견 없음이라고 기재하고 PwC가 동의했다. FY2025 going-concern paragraph 및 내부통제 material weakness를 반대 위험으로 병기했다.
- 운영 RSS ID `https://www.stocktitan.net/news/NXAT/nexus-advanced-technologies-signs-confidential-exclusivity-for-b4yjok68wy0t.html`는 Nasdaq/GlobeNewswire의 10/6 발행사 원문과 대조했다. 미공개 방산기술 target과 역합병 배타적 협상, target의 proposed valuation 약 $500M 및 target 제공 비구속 project LOIs 약 $7B를 기록했으나 LOIs는 confirmed orders/committed revenue가 아니며, target identity·거래구조·자금·승인·definitive agreement·종결은 미확정이다.
- recovered ATM 레코드의 eventDate를 계약 체결일 2026-10-02에서 실제 동의기간 종료일 2027-03-31로 정정했다. ATM period, cashless warrant right, conditional note trigger, auditor change, non-binding merger exclusivity를 구분하고 두 SEC accession에 세 개 filing-event relation을 연결했다.


## 추가 원문 확인 배치 91 — YFOR ATM 원문 재검증 및 운영 적격성 갱신

- 운영 공개 GET (2026-11-01): HTTP 200, `asOf=2026-10-31T17:28:29.912Z`, NAS 활성 `COMMON_STOCK`, USD 시총 $1,183,347(가격 관측시각 2026-10-30T07:13:01.839Z), 상장주식 7,836,734, RSS 16건, 분류 SEC event 0건. DB write 없음.
- SEC 6-K `0001213900-26-106827` 및 424B5 `0001213900-26-106847`를 대조했다. ATM 상한은 최대 $20M gross, 매각 의무 없음, agent fee 3.75%. 424B5의 $1.46(10/2 종가) scenario상 최대 13,698,630 A주는 당시 발행 A주 7,836,734주의 약 175%이나 실제 발행·매각 수량이 아니다. Class B 주당 500표와 CEO 부부 의결권 약 99.69%도 희석·지배구조 위험으로 기록했다.
- YFOR 복구 ATM 이벤트를 `PRIMARY_SOURCE_REVIEWED`로 전환하고 원문 근거, source URL, 운영 스냅샷을 연결했다. 직접 원문 검토 issuer는 88/100, 재검증 대기는 6건/6개 issuer다.
- validator에 MONTH 전체 구간 및 PART_OF_MONTH 월초·중순·하순 일정 검사를 추가하고 중복 분기를 제거했다. 정정 filing 상호관계 검증은 적용되어 있으나 YFOR 6-K/A accession pair는 아직 원장에 연결하지 않았다.
- 조사창: 2025-10-31 포함~2026-11-01 미포함, 제출 인벤토리 5,662건. 이는 모든 제출 원문을 전수 판독했다는 의미가 아니다. YFOR 후속 계약·로봇·매출 목표·부채 이벤트 구조화는 남은 작업이다.


## 추가 원문 확인 배치 92 — YFOR 인수·뉴스·자금일정 구조화

- 6-K `0001213900-26-106382` 및 6-K/A `0001213900-26-106744`를 인수 관련 본문/동의서 추가 범위까지 확인하고 AMENDS/AMENDED_BY 상호 링크를 기록했다. Xtreme Solution 인수 완료일은 2026-08-03; 후속 424B5 기재 인수 관련 3,787,379 Class A주를 별도 근거로 기록했다. 6-K/A는 CT International consent를 추가하며 다른 측면을 갱신하지 않는다고 명시한다.
- YFOR의 원문 뉴스 6건을 별도 eventId로 추가: GNW 3371329 S$15.96M 계약(10월 중 개시 목표), 3373000 Aloft 로봇 1대, 3380142 호텔 파트너십(당시 rollout 전 및 10% 비용절감 사전 추정), 3388177 humanoid 11월 초 목표, 3390749 FY2027 Malaysia 매출 목표, 3391852 11대 fleet/24개월 계약. 실제 매출·성과·완료 검수로 해석하지 않는다. 월중 및 월초 일정은 날짜를 추정하지 않고 MONTH/PART_OF_MONTH에 저장했다.
- 424B5의 Bizcap 25% loan 2027-04-08 만기 및 최대 SGD$816,000 상환 계획과 Ault Lending $1,366,452.50을 2026-12-31까지 갚겠다는 계획을 이벤트로 분리했다. 실제 상환과 잔액은 미확인이다.
- 집계: issuer 100, SEC submissions 5,662, canonical events 208, accession-event relations 220, amendment pairs 2, direct-primary-reviewed issuers 88, recovered-pending issuers 6. Filing status FULL 95 / INVENTORY 5,417 / TRIAGE 85 / TARGETED 65. Validator 통과.


## 추가 원문 확인 배치 93 — SQFT 우선주 교환청약 결과 재검증

- 운영 GET (2026-11-02): HTTP 200, `asOf=2026-10-31T17:31:59.376Z`, NAS 활성 COMMON_STOCK, USD 시총 $1,204,921(가격 관측 2026-10-30T07:12:11.946Z), 상장주식 1,434,430, RSS 1, SEC classified events 0. DB write 없음.
- SEC 8-K 0001493152-26-045704 Item 8.01/Ex.99.1 및 Schedule TO/A 0001493152-26-045707 최종 개정: 10/2 23:59 ET 마감; 973,736 Series D 중 149,773주(15.4%) 유효 tender·철회되지 않아 전량 수락. 1주당 5.5 common, 발행 예상 823,753주, 결제는 10/6 전후 예상. 결제 후 Series D 약 823,963주 잔존은 회사 추정.
- 10/31까지 SEC filing inventory에서 settlement 및 실제 common issuance를 입증하는 후속 제출을 확인하지 못했다. 결과 확정과 결제/발행 완료를 분리하고 fractional rounding에 따라 최종 수량이 달라질 수 있음을 유지했다. 8-K 및 TO/A를 FULL_PRIMARY_REVIEW, 관련 425를 TARGETED_SECTION_REVIEW로 accession-event index에 연결.
- 누계: issuer 100, SEC submissions 5,662, events 208, accession-event links 222, amendment pairs 2, 직접 검토 89/100, recovered pending 5/5. Filing: FULL 97 / INVENTORY 5,415 / TRIAGE 85 / TARGETED 65. Validator 통과.


## 추가 원문 확인 배치 94 — HXHX 인수·차량·입찰 공지 분리

- 운영 공개 GET (2026-11-02): HTTP 200, `asOf=2026-10-31T17:34:02.522Z`, NAS enabled `COMMON_STOCK`, USD 시총 $1,577,280(가격관측 2026-10-30T07:06:35.275Z), listed shares 9,920,000, RSS 4, SEC classified events 0, DB write 없음.
- Nasdaq에 게시된 회사/Newsfile 원문 10/01, 10/02, 10/08, 10/15를 검토했다. SEC accession inventory에는 위 10월 회사 공지에 직접 연결된 SEC filing을 확인하지 못해 source ID를 배포매체/게시일 기준으로 기록했다.
- LogiAgent 잠재 인수(10/08): 회사 평가 범위 $7M-$10M, equity 및 milestone earn-out 가능 구조; due diligence·협상·승인·definitive agreement 조건부. 별도 8월 asset report의 $5M-$12M은 current financial information을 제외한 indicative scenario, formal independent valuation/fairness opinion/forecast가 아니다. 10/15의 3-6개월 deployment 창은 거래 성사 후 통합 추정기간이지 확정 일정이 아니다.
- 별도 미국 trucking acquisition initiative(10/02)는 broker 고용 및 buyer due diligence package 제출 단계, LOI/합의조건/definitive contract 없음.
- 10/01 배포자료에서 세 가지 상업 이벤트를 분리: 200대 battery-swapping tractor 구매(9/12 계약, RMB120.9M/$18.02M; 납품/검수 후 단계배치), 2025년 12월 63대 Geely truck 구매(RMB43.155M/$6.43M; 납품상태 미확인), battery-swap 전략 framework(개별 프로젝트·투자·일정 미합의). 같은 보도자료의 2026-2028 운송입찰은 11위 award candidate이며 최종 계약이 아니다.
- 누계: issuer 100, SEC submissions 5,662, events 213, accession-event links 222, amendment pairs 2, directly reviewed 90/100, pending 4 issuers. Filing status FULL 97 / INVENTORY 5,415 / TRIAGE 85 / TARGETED 65. Validator 통과.


## 추가 원문 확인 배치 95 — LBGJ 인수계약 종료

- 운영 공개 GET (2026-11-02): HTTP 200, `asOf=2026-10-31T17:35:24.928Z`, NAS enabled COMMON_STOCK, USD 시총 $975,626(관측 2026-10-30T11:56:16.220Z), 상장주식 621,418, RSS 2, SEC classified events 0, DB write 없음.
- SEC 6-K `0001493152-26-046533`와 Ex.10.1 해지서를 함께 판독했다. 완전자회사 Purchaser와 Yufengyuan 세 주주는 2026-10-08에 4/17 equity transfer agreement(3/2 원계약을 대체)를 전부 종료했다. 회사는 대상거래가 종결되지 않았고 향후에도 종결되지 않을 것이라고 보고했다. Termination letter는 당사자가 definitive understanding에 이르지 못했고 계약이 final and binding하지 않다고 판단했다고 명시한다.
- 해지일부로 계약상 상호 추가 책임·의무와 이행이 면제되고 breach liability 조항도 존속하지 않는다고 기재. 거래대가·기지급액·정산액은 공개된 문서에서 확인되지 않았다. filing을 FULL_PRIMARY_REVIEW로 올리고 report/ledger event metadata를 동기화했다.
- 누계: submissions 5,662, events 213, accession-event links 222, amendment pairs 2; 직접 검토 91/100, pending recovered 3종목. Filing FULL 98 / INVENTORY 5,415 / TRIAGE 85 / TARGETED 64. Validator 통과.


## 추가 원문 확인 배치 96 — SBFM 공모·역분할·warrant 동의 일정 재검증

- 운영 공개 GET (2026-11-01): HTTP 200, `asOf=2026-10-31T17:38:58.051Z`, NAS 활성 `COMMON_STOCK`, USD 시총 $14,353,299 (가격/주식수 관측 `2026-10-30T07:19:39.766Z`), listed shares 4,310,300, RSS 10건, bullish articles 5건, SEC classified event rows 0, DB write 없음. 종목 분류·활성·시총 기준은 적격이다.
- SEC 8-K `0001683168-26-007758`와 424B4 `0001683168-26-007757`를 공모계약·prospectus 원문으로 재검토했다. 2026-10-09 종결 gross proceeds는 약 $6.0M, placement agent fee와 기타 공모비용 차감 전이다. 공모는 best efforts이며 최소 판매량이 없다. 계약상 10,509,082 common units와 400,000 pre-funded units, 공모 가격은 각 $0.55/$0.54999, pre-funded warrant는 종결 전 전량 행사됐다.
- prospectus의 최대 21,818,164 Series D warrants 및 최대 43,636,328 underlying common shares, 전량 행사 가정 추가 현금 최대 약 $14.4M은 잠재치로 기록했다. 자동분류/RSS의 “up to $20.4M offering” 문구를 실제 $20.4M 조달로 취급하지 않았다. 424B4의 $6M 기본 공모와 잠재 warrant proceeds를 합산한 최대치도 실제 수입과 구분했다. 수수료 차감 후 순수령액은 특정하지 않았다.
- Nasdaq에 배포된 발행사 보도자료는 20:1 역분할의 10/26 시장개장 효력과 발행·유통주(outstanding) 15,219,383주→약 760,969주를 밝혔다. 해당 수치는 float가 아니다. 회사는 Nasdaq 최소호가 요건 회복 목적을 밝혔다. market open은 09:30 EDT / 22:30 KST로 표시했으며 이는 정규장 개장시각 환산이다. SEC DEF 14C `0001683168-26-008100`도 10/26 효력 및 역분할 반영 share amount를 확인한다.
- SEC 8-K `0001683168-26-007845`와 DEF 14C에서 10/13 CEO 서면동의(공모 20% 초과 발행, Series D warrant 조정 권한)를 확인했다. DEF 14C는 안내문을 10/30 전후 발송한다고 하며 효력은 실제 발송일 20일 후다. 11/19는 발송일이 10/30이라는 가정의 계산 목표로 `ESTIMATED`/`APPROXIMATE_DAY`에 저장했으며 확정 효력일로 보지 않는다.
- 복구 offering 레코드의 원문 인용·정량 근거·희석 위험·한계를 복원하고 20:1 역분할 및 동의 효력 예상일을 별도 이벤트로 추가했다. 4개 SEC accession을 `FULL_PRIMARY_REVIEW`로 기록하고 검토본 submissions, canonical event, issuer review 행, accession-event 관계 index를 동기화했다.
- 일정 행은 canonical event ID 기준으로 분리했다.

| event ID | 날짜/일정 상태 | 구분 및 핵심 수치 | 주요 원문 ID |
|---|---|---|---|
| `SEC:0001683168-26-007758:EQUITY_OFFERING` | 2026-10-09 완료 | gross 약 $6.0M; 최대 21,818,164 Series D warrants / 기초주식 최대 43,636,328 | SEC 8-K 007758, 424B4 007757 |
| `SEC:0001683168-26-008100:COMPLETED_REVERSE_SPLIT` | 2026-10-26 완료 | 20:1; outstanding 15,219,383→약 760,969(발행사 근사치) | Nasdaq 배포 발행사 release, DEF 14C 008100 |
| `SEC:0001683168-26-008100:WARRANT_APPROVAL_EFFECTIVE` | 2026-11-19 전후 추정 | 실제 안내문 우편발송일 후 20일; 11/19는 10/30 발송 가정 | SEC 8-K 007845, DEF 14C 008100 |
- 운영 GET의 listed shares 4,310,300은 같은 보고서의 발행사 역분할 보도자료상 약 760,969 outstanding와 크게 다르다. 기준시각/수집원/공시 수량이 서로 달라 원인을 확인하지 못했으며 어느 하나를 대체 수량으로 취급하지 않는다. 운영 API market cap $14.35M은 해당 API snapshot이 제공한 값으로 저장했고, 이 불일치로 독립 검증된 시총이라고 주장하지 않는다.
- 누계: issuer 100, SEC submissions 5,662, events 215, accession-event links 226, amendment pairs 2, 직접 검토 92/100, recovered pending 2종목. Filing FULL 102 / INVENTORY 5,413 / TRIAGE 84 / TARGETED 63. `node scripts/validate-us-smallcap-event-data.mjs` 통과.
- 남은 확인: DEF 14C 실제 우편발송일, consent 효력 발생, Series D warrant 조건의 실제 조정·행사/추가 주식발행, post-split unit 수량의 문서 간 표시 차이를 후속 원문에서 확인한다. 현재 확인은 발행사 설명과 SEC 제출자료 기준이며 수량 차이를 임의로 조정하지 않았다.


## 추가 원문 확인 배치 97 — SILO 소프트웨어·IP 취득 대가 및 계약상 인도일

- 운영 공개 GET (2026-11-01): HTTP 200, `asOf=2026-10-31T17:41:22.625Z`, NAS enabled `COMMON_STOCK`, USD 시총 $1,985,312(관측 `2026-10-30T07:20:31.125Z`), listed shares 1,588,250, RSS 6건, bullish articles 2건, SEC classified event rows 0, DB write 없음.
- SEC 8-K `0001213900-26-109457` Item 1.01/3.02 및 Exhibit 10.1을 검토했다. 회사는 2026-10-13 Larry King과 Reputation Endpoints 소프트웨어 및 관련 IP를 매입하는 계약을 체결하고 대가로 보통주 150,000주를 발행했다고 보고했다. 이는 회사가 공시한 발행이며 transfer-agent 확인을 별도 확보한 것은 아니다.
- 계약은 효력일 후 5영업일 내 share certificate/book-entry confirmation 전달, 대가 수령 후 3 calendar days 내 소프트웨어 인도를 정한다. 10/13 효력일 기준 5영업일 후는 계산상 10/20이나 실제 증서 발행 및 소프트웨어 인도 확인은 원문에서 찾지 못했다. 소프트웨어 인도일은 consideration 수령일에 달려 있어 확정 날짜를 만들지 않았다.
- 150,000주에는 12개월, Change in Control, 회사의 서면 동의 중 가장 이른 시점까지 lock-up이 붙는다. Exhibit A(자산 세부 목록)와 Exhibit B(오픈소스 제외목록)는 `[ * ]`로 가려져 자산 전체 범위, 코드, 독립 가치, 매출·고객·운영 기여는 확인되지 않는다. 해당 공시만으로 거래의 실현가치를 추정하지 않았다.
- 회복 이벤트의 recovery marker를 제거해 직접 인용·위험·한계가 있는 원문 검토 행으로 교체하고, 8-K accession을 `FULL_PRIMARY_REVIEW`로 상향해 issuer 제출 사본과 관계 index를 일치시켰다.
- 누계: issuer 100, SEC submissions 5,662, events 215, accession-event links 226, amendment pairs 2, 직접 검토 93/100, recovered pending 1종목. Filing FULL 103 / INVENTORY 5,413 / TRIAGE 84 / TARGETED 62. Validator 통과.


## 추가 원문 확인 배치 98 — LHSW 주문 분리·1:8 병합 거래일 교차 확인

- 운영 공개 GET (2026-11-01): HTTP 200, `asOf=2026-10-31T17:42:52.242Z`, NAS enabled `COMMON_STOCK`, USD 시총 $15,748,275(관측 `2026-10-30T07:06:35.275Z`), listed shares 3,267,277, RSS 5건, bullish 1건, SEC classified event rows 0, DB write 없음.
- SEC 6-K `0001213900-26-114516` 및 Ex.99.2(10/19 발행사 보도자료) 원문에서 고객·계약별 주문을 분리했다. 말레이시아 NMS Robotics: 80대 Sowell Precision Vision AI Spraying Robots, RMB23.84M, batch delivery와 설치·commissioning·교육·사후지원. 영국 Rowley Spraybooths Midlands: 1대와 자동 spray gun 변경·세척 및 paint-cup 변경 시스템; 계약 금액은 미공개. 양쪽 모두 실제 납품·검수·현금회수·매출인식 일정은 미확인이다.
- 같은 6-K Ex.99.1과 Nasdaq Corporate Actions Alert #2026-759로 1:8 consolidation을 대조했다. Class A/B 각 8주를 1주로; 10/22 기준 pre-split 발행·유통(outstanding) 22,878,354/2,587,500주, issuer approximate post-split 2,859,795/323,438주. fractional shares round up. Nasdaq notice의 10/26 효력, Class A split-adjusted 개장 거래, 새 CUSIP G5480C120을 기록했다. 09:30 EDT / 22:30 KST는 Nasdaq 정규장 개장시각 환산이다. 수량은 float가 아니다.
- recovered commercial-order 요약을 Malaysia/UK 2개 계약 eventId로 분리했다. 동일 SEC accession 1건이 Malaysia 주문, UK 주문, reverse split의 3개 이벤트를 지지하도록 `eventIds` 및 accession-event index를 동기화했다. reverse-split 근거·수량·Nasdaq 일정도 복구 문구에서 직접 원문 근거로 교체했다. SEC 6-K는 기존 `FULL_PRIMARY_REVIEW`; issuer mirror와 canonical event row의 상태 및 URLs를 일치시켰다.
- 누계: issuer 100, SEC submissions 5,662, events 216, accession-event links 227, amendment pairs 2, 직접 검토 93/100, recovered pending 0. Filing FULL 103 / INVENTORY 5,413 / TRIAGE 84 / TARGETED 62. Validator 통과.
- 남은 위험: 원 underlying sales contracts와 제품 단위 원가/마진, 납품시점·수금, UK 계약 대금 및 이행 상태는 미공개/미확인이다. split 후 exact outstanding share count는 issuer approximate와 fractional rounding 조건만 확인했다.


## 추가 원문 확인 배치 99 — issuer별 원문 관계·검토 메모 교차 종목 감사

- SEC accession을 포함한 모든 검토 메모와 issuer event ID/URL을 종목별 filing ledger에 대조했다. BBLG·ARTL 재검토 메모에 CDT의 accession `0001493152-26-048693` 및 CDT 운영 시총 $86,588이 복사돼 있었고, HKPD review row에는 GOVX(832489) SEC 문서 두 URL과 `null` source link가 섞였다. PFSA `reviewedEventIds`에는 다른 issuer NXTS의 annual-meeting event ID가 남아 있었다. CDT/BBLG/ARTL/BRNX/XAIR issuer reviewed IDs에도 검토된 canonical rows와의 누락/불일치가 확인됐다.
- BBLG SEC 8-K `0001493152-26-042940` Item 3.01을 다시 확인: $1 최소호가 미준수 notice는 9/10, 180 calendar-day 준수기한은 2027-03-09, 최소 10연속 영업일 종가 bid $1 충족이 cure 조건이며 통지 자체는 즉시 상장에 영향이 없다. 추가 180일은 자동 연장이 아니다. BBLG 운영 공개 GET 200, active NAS COMMON_STOCK, 시총 $1,315,972, RSS 5, bullish 0.
- ARTL SEC 8-K `0001640334-26-001665` Item 8.01: Nasdaq $5M MVLS rule, 7/29 temporary stay, 10/5 제안된 operative date 변경, 의견 마감 10/29, 최종 적용일·stay 기간 미정, 회사의 구체 대응 약정 없음. ARTL 운영 공개 GET 200, active NAS COMMON_STOCK, 시총 $1,265,358, RSS 7, bullish 1. 두 종목 모두 CDT URL/accession/시총 오염을 제거해 해당 issuer 원문 기반으로 이벤트 evidence와 review notes를 갱신했다.
- HKPD review source URLs를 issuer CIK 0002007702의 6-K/Ex.99.1 및 Nasdaq Alert #2026-751로 교체하고 `null`을 제거했다. PFSA의 잘못 연결된 NXTS event ID를 issuer 자체 reviewed event로 교체했다. BBLG·ARTL·CDT·BRNX·XAIR·PFSA의 `reviewedEventIds`, source URLs 및 eventReviewStatus를 canonical/review rows와 동기화했다.
- 재발 자동 감지: validator가 review-row SEC CIK, validationNotes accession의 동일 issuer 소유권, issuer reviewed ID의 존재·티커 정합성, primary/targeted coverage 집계 parity를 확인하도록 확장했다.
- 누계 유지: issuer 100, SEC submissions 5,662, events 216, accession-event links 227, amendment pairs 2; primary/full 93 issuers + targeted 7 issuers = source-reviewed 100/100, recovered pending 0. Filing FULL 105 / INVENTORY 5,413 / TRIAGE 84 / TARGETED 60. BBLG·ARTL 8-K 전문을 직접 읽어 filing status를 full review로 승격했다. Validator 통과.
