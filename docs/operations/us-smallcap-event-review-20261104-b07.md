# 미국 보통주 공시·뉴스 이벤트 검토 — 2026-11-04 배치 7

## 조사 범위와 기준

- 운영 서버 https://stockman.r-e.kr의 공개 read-only GET과 localhost DB read-only 조회만 사용했다. 운영 DB 직접 연결, refresh/저장 API, 알림 전송은 하지 않았다.
- 로컬 활성 미국 NAS/NYS/AMS COMMON_STOCK universe 5,216개를 읽고 운영 /api/public/instrument-fundamentals를 54회 호출해 5,216/5,216 snapshot을 받았다. 기존 6개 배치 600 ticker를 제외한 양수·USD·시총 $100m 이하 후보는 772개였다. 시총 순으로 운영 종목 metadata와 SEC 공식 ticker-exchange CIK를 검증해 100개를 확정했다. metadata를 160개 후보에서 검사했고 9건은 metadata 실패·CIK 불일치로 제외했다.
- 선정 100개는 운영 official master에서 활성 COMMON_STOCK이며 ETF·워런트·파생·DR·레버리지·인버스 플래그가 모두 false다. SEC 공식 ticker-exchange master CIK가 운영 metadata CIK와 각 1:1 일치한다.
- 시총은 KIS_OVERSEAS_PRICE USD snapshot 기준 $104,143~$19,836,858이며 관측일은 모두 2026-11-02다. 24시간 freshness 기준을 넘겨 모두 STALE이다. 따라서 $100m 이하는 2026-11-02 관측시점 기준이며 현재 시총·현재 적격성을 뜻하지 않는다.
- 운영 market-intelligence는 100/100 성공, 최신 응답 시각 2026-11-04T05:48:27.909Z; RSS 332건, bullish 분류 53건, SEC event row 0건이다. RSS는 후보 탐색에 사용했고, 정규 이벤트에는 해당 사건의 공식 SEC 원문을 확인한 항목만 반영했다.
- SEC submissions는 2025-11-04 포함~2026-11-05 미포함 100개 issuer에서 4,182건을 수집해 accession 원장에 보존했다. 최근 이벤트 관련 제출 528건은 SEC archive GET 528/528건 HTTP 200이었다. 이 중 아래 13개 accession의 사건 관련 구간을 직접 확인했고, 나머지 4,169건은 INVENTORY_ONLY다. 제출 목록 수는 제출 본문 전수검토를 의미하지 않는다.

## 종목별·공시별 관리

- 종목 snapshot·운영 뉴스·직접 확인 이벤트: [review JSON](../../data/us-smallcap-event-review-20261104-b07.json)
- issuer별 제출 목록과 accession별 검토상태·이벤트 연결: [filing ledger](../../data/us-smallcap-filing-review-ledger-20261104-b07.json)
- 이벤트 판정의 재현 입력: [event definitions](../../data/us-smallcap-event-defs-20261104-b07.json)
- UI/API 정규 이벤트 원장: [market-impact-events.json](../../data/market-impact-events.json)

모든 이벤트는 ticker + CIK + accession + eventId로 위 자료 간 조인된다. 검토된 SEC archive URL CIK, 제출 원장 accession, canonical sourceId가 서로 다르면 batch validator가 실패한다.

## 직접 확인 이벤트

| Ticker | 날짜 | 상태 | 공시 기반 일정·사건 | SEC accession / 원문 |
|---|---|---|---|---|
| ARAY | 2026-11-19 | CONFIRMED_SCHEDULED | 연례 주주총회 11:00 CT / 11-20 03:00 KST | [0001140361-26-039918](https://www.sec.gov/Archives/edgar/data/1138723/000114036126039918/ny20080121x1_def14a.htm) |
| JSPR | 2026-11-13 | CONFIRMED_SCHEDULED | 특별 주주총회 10:00 PT / 11-14 03:00 KST | [0001213900-26-110751](https://www.sec.gov/Archives/edgar/data/1788028/000121390026110751/ea0307636-02.htm) |
| MDRR | 2026-11-23 | CONFIRMED_SCHEDULED | 특별 주주총회 10:00 PT / 11-24 03:00 KST | [0001104659-26-120660](https://www.sec.gov/Archives/edgar/data/1654595/000110465926120660/mdrr-20261123xdef14c.htm) |
| QNRX | 2026-11-12 | CONFIRMED_SCHEDULED | 특별 주주총회 12:00 ET / 11-13 02:00 KST | [0001104659-26-113301](https://www.sec.gov/Archives/edgar/data/1671502/000110465926113301/tm2625822-2_def14a.htm) |
| BGDE | 2026-11-13 | CONFIRMED_SCHEDULED | 가상 연례 주주총회 10:00 EST / 11-14 00:00 KST | [0001213900-26-111954](https://www.sec.gov/Archives/edgar/data/1218683/000121390026111954/ea0306344-05.htm) |
| BGDE | 2026-11-17 | ESTIMATED | 재판매 등록서 효력 목표일 (회사 노력 기준) | [0001213900-26-102866](https://www.sec.gov/Archives/edgar/data/1218683/000121390026102866/ea0306466-8k_bigdigital.htm) |
| MRM | 2026-11-11 | CONFIRMED_SCHEDULED | Nasdaq 규정준수 연장 기한 | [0001193125-26-420488](https://www.sec.gov/Archives/edgar/data/1819704/000119312526420488/mrm-20261013press_releas.htm) |
| TKLF | 2026-11-30 | CONFIRMED_SCHEDULED | 임시 주주총회 (시간 미공개) | [0001213900-26-109421](https://www.sec.gov/Archives/edgar/data/1836242/000121390026109421/ea0308521-6k_tokyo.htm) |
| TKLF | 2026-12-18 | ESTIMATED | 현금배당 지급 개시 예상일 (12-18~12-30) | [0001213900-26-109421](https://www.sec.gov/Archives/edgar/data/1836242/000121390026109421/ea0308521-6k_tokyo.htm) |
| FENG | 2026-11-20 | CONFIRMED_SCHEDULED | 연례 주주총회 | [0001193125-26-425652](https://www.sec.gov/Archives/edgar/data/1509646/000119312526425652/2026_annual_general_meet.htm) |
| BEEM | 2026-12-17 | CONFIRMED_SCHEDULED | 연례 주주총회 09:30 PT / 12-18 02:30 KST | [0001437749-26-032710](https://www.sec.gov/Archives/edgar/data/1398805/000143774926032710/beem20261015_8k.htm) |
| SKYQ | 2026-12-03 | CONFIRMED_SCHEDULED | 연례 주주총회 10:00 MT / 12-04 02:00 KST | [0001096906-26-001622](https://www.sec.gov/Archives/edgar/data/1812447/000109690626001622/skyq_def14a.htm) |
| RDIB | 2026-12-03 | CONFIRMED_SCHEDULED | 가상 연례 주주총회 14:00 ET / 12-04 04:00 KST | [0000716634-26-000036](https://www.sec.gov/Archives/edgar/data/716634/000071663426000036/rdi-20261203xdef14a.htm) |
| JSPR | 2026-12-31 | ESTIMATED | 이사회 재량 1:15~1:35 역분할 실행 기한 | [0001213900-26-106651](https://www.sec.gov/Archives/edgar/data/1788028/000121390026106651/ea0307484-8k_jasper.htm) |

### 일정 상태 해석

- CONFIRMED_SCHEDULED: 회사 또는 Nasdaq 공시에 날짜가 명시된 회의·기한. 의안 승인, 준수 회복 또는 실제 집행 결과를 뜻하지 않는다.
- ESTIMATED: 회사 예상 지급 개시일, 효력 목표일, 또는 이사회 재량으로 선택 가능한 실행기한. 실제 지급·효력·역분할 여부는 별도 확인 대상이다.
- TKLF 배당은 주당 JPY 1.432이며 11월 30일 주총 승인 조건이다. 회사는 12월 18~30일 지급 시작·완료를 예상했지만 총액과 미달러 환산액은 해당 자료에서 확인되지 않는다.
- MRM의 11월 11일 기한은 Form 20-F 지연 관련 Nasdaq 규정준수 연장이다. 기한이 지난 뒤 실제 준수 회복 여부를 이 조사에서 확인하지 못했으므로 결과를 추정하지 않는다.
- JSPR은 1:15~1:35 역분할 권한이 승인됐으나 실행비율·법적 효력·조정 거래 개시시각은 미확인이다. 승인주식 수를 줄이지 않는 조건이므로 희석 여력이 남는다.
- 이벤트 사실은 방향을 보장하지 않는다. 이번 검토에서는 사건별 정량 주가반응 분석을 수행하지 않아 방향과 영향기간은 UNCERTAIN/UNKNOWN이다.

## 검증 한계

시장 시총 snapshot이 모두 stale이며 조사일 현재 적격성을 증명하지 않는다. RSS의 분류·제3자 기사만으로 촉매를 확정하지 않았고, 직접 검토한 SEC 제출 accession만 TARGETED_SECTION_REVIEW로 기록했다. 첨부 exhibit 전체 또는 4,182건 제출 원문 전수검토는 아니다. 이벤트·시각·금액이 근거 원문에서 확인되지 않은 값은 미확인으로 남겼다.
