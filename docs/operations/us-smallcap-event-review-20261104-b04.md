# 미국 보통주 공시·뉴스 기반 이벤트 검토 — 2026-11-04 배치 4

## 범위와 수집 시각

- 운영 서버 공개 GET으로 직전 300개와 겹치지 않는 후보군을 조회하고 다음 100개를 선정했다. 100/100 ticker는 SEC 공식 company ticker master의 CIK와 일치했고 운영 metadata에서 active `COMMON_STOCK`, USD 시총 $100m 이하, 비보통주 배제 플래그를 확인했다.
- 운영 기준 `https://stockman.r-e.kr`; `/api/public/us-stock-metadata`, `/api/public/market-intelligence` 조회는 모두 read-only이며 운영 API/DB write는 없다. intelligence snapshot 시각은 2026-11-03T18:05:08.459Z.
- 시총 snapshot은 KIS 해외주식 자료의 2026-11-02 관측값이며 STALE이다. 조사일의 현재 시총을 보증하지 않는다. 종목별 관측/수집 시각과 freshness는 review JSON에 보존했다.
- SEC 제출 inventory 기간은 2025-11-04 포함부터 2026-11-05 미포함이며 100개 issuer에 4,334건이다. 운영 RSS/news 449건, bullish 분류 67건, operating SEC event rows 0건.
- 24개 이벤트의 SEC 제출 원문/관련 구간을 확인했다. 해당 accession은 `TARGETED_SECTION_REVIEW`; 나머지 4,310건은 제출 메타데이터만 수집한 `INVENTORY_ONLY`이며 본문 전수검토가 아니다. 원문과 종목 CIK 및 accession 소유자를 대조했다.

## 종목별·공시별 관리

각 종목의 operating snapshot, 분류, 뉴스 및 이벤트는 [review JSON](../../data/us-smallcap-event-review-20261104-b04.json)에 저장했다. 4,334건의 SEC 제출과 accession별 검토상태는 [filing ledger](../../data/us-smallcap-filing-review-ledger-20261104-b04.json)에 있다. 정규 이벤트는 [market-impact-events.json](../../data/market-impact-events.json)에 `eventId`로 연결한다. 배치 간 ticker 중복을 제외하고 각 이벤트의 accession이 해당 issuer 제출원장에 있는지 검사한다.

## 직접 확인 이벤트

| Ticker | 날짜 | 상태 | 이벤트 | accession |
|---|---|---|---|---|
| KUST | 2026-10-01 | COMPLETED | 1:10 역분할, 발행주식 6,506,860→650,686 | 0001493152-26-045762 |
| KUST | 2026-10-22 | COMPLETED | 수권주식 13,333,333→1.2bn 변경; 실제 발행 아님 | 0001493152-26-048183 |
| DLXY | 2026-09-28 | COMPLETED | 1:5 역분할 및 최소호가 회복 통지 | 0001213900-26-101140 |
| GAUZ | 2026-09-11 | COMPLETED | 1:20 역분할 조정거래; 발행·유통 합산 22,862,718→1,143,135 | 0001213900-26-105914 |
| GAUZ | 2026-09-15 | REPORTED | Nasdaq 상장폐지 결정에 대한 항소 계획; 최종 결과 미정 | 0001213900-26-101847 |
| CYN | 2027-04-12 | CONFIRMED_SCHEDULED | $1 최소호가 회복 기한 | 0001213900-26-109853 |
| CYN | 2027-11-03* | CONFIRMED_SCHEDULED | 이사회 독립성 개선 기한 | 0001213900-26-114511 |
| ARAI | 2026-11-02 | REPORTED | redomestication 조건부 1:10~1:65 병합 권한; 실행 미정 | 0001493152-26-049616 |
| ARAI | 2026-11-30 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 회복 기한 | 0001493152-26-027491 |
| ARAI | 2027-01-19 | CONFIRMED_SCHEDULED | $15m MVPS 회복 기한 | 0001493152-26-034582 |
| XCUR | 2026-12-05 | CONFIRMED_SCHEDULED | 주주자본 요건 연장기한 | 0001193125-26-392654 |
| XCUR | 2026-12-02 | CONFIRMED_SCHEDULED | 임시주총, 수권주식 200m→400m 및 20% 초과 발행 관련 안건 | 0001193125-26-443911 |
| WCT | 2026-09-08 | COMPLETED | Class A 1:5 역분할; 발행주식 52,905,328→약 10,581,066 | 0001213900-26-097242 |
| WCT | 2026-03-20 | COMPLETED | Nasdaq $1 최소호가 회복 및 사안 종결 | 0001213900-26-033198 |
| RCT | 2026-10-14 | REPORTED | 상장폐지 결정 항소 및 효력 유예; 최종 결과 미정 | 0001493152-26-047176 |
| RCT | 2026-11-02 | REPORTED | 주주가 병합 권한 최대 1:100 승인; 실제 비율·시행 미정 | 0001493152-26-049426 |
| EVGN | 2027-03-29 | CONFIRMED_SCHEDULED | 최소호가 추가 180일 회복 기간 종료 | 0001178913-26-004654 |
| EVGN | 2026-11-10 | CONFIRMED_SCHEDULED | 주주 특별회의 및 협력계약 관련 안건 | 0001178913-26-004722 |
| INM | 2026-11-02 | REPORTED | 주주자본 $1,075,007 대 기준 $2.5m; 개선계획 수락 미확인 | 0001213900-26-101492 |
| INM | 2026-11-05 | CONFIRMED_SCHEDULED | 합병 조건부 CVR 기준일; 합병 종결일 미확정 | 0001193125-26-436382 |
| PBK | 2026-10-29 | REPORTED | 주주가 1:10~1:30 병합 권한 승인; 실행 미정 | 0001493152-26-049458 |
| TCRT | 2026-10-13 | COMPLETED | Velaris 인수 종결 및 관련 자금조달 | 0001193125-26-427890 |
| TCRT | 2026-09-21 | COMPLETED | 직접공모 종결, 순유입 $915,400.50 | 0001193125-26-397996 |
| MGRX | 2026-10-09 | REPORTED | 657k 보통주+657k warrant, 결합 $0.75, 총액 $492,750; 별도 종결 확인 미발견 | 0001493152-26-046510 |

* CYN 기한은 다음 정기주총일 또는 2027-11-03 중 빠른 날이다. 표의 모든 accession은 각 행의 SEC filing primary source이며 full URLs와 세부 근거는 canonical event record 및 review JSON의 `primarySourceUrls`에 있다.

## 해석과 한계

- 역분할은 주식 수·표시가격의 기계적 조정이며 투자수익률이 아니다. 발행주식과 유통주식을 혼동하지 않고 원문이 제공한 분류·범위만 기록했다.
- Nasdaq 상장폐지/호가/자본 사안은 보고된 deficiency, 연장 또는 항소 상태로 구분했다. 항소·개선계획·주주 승인만으로 최종 결과나 실행을 단정하지 않는다.
- 이벤트 방향은 모두 `UNCERTAIN`; 독립 가격 표본을 측정하지 않아 사후 수익률/주가 영향 수치를 만들지 않았다. 이벤트 결과가 가격 방향을 보장하지 않는다.
- 4,334건 전체 본문 전수검토가 아니며 RSS bullish 분류는 원문 이벤트 확정과 동의어가 아니다. 주식 시총은 stale snapshot이라 배포 시점 분류가 달라질 수 있다.
- IVF의 split은 이 자료세트에서 SEC 1차 증거를 확인하지 못해 제외했다. 향후 회사 원문을 찾으면 별도 근거로 재검토한다.

## 검증과 배포

- 배치 validator, `docs:check`, 배포 검증 결과와 운영 배포/GET 재확인 결과는 `DEVELOPMENT_LOG.md`에 기록한다. 이 보고서와 JSON/ledger는 문서 카탈로그에서 운영자가 도달할 수 있어야 한다.
