# 미국 보통주 공시·뉴스 기반 이벤트 검토 — 2026-11-04 배치 5

## 범위와 수집 시각

- 운영 후보 API와 종목별 operating metadata에서 100개 신규 후보를 선정했다. prior 400개를 제외하고 CMCT는 SEC CIK 대조 실패로 제외한 뒤 BENF로 대체했다. operating metadata와 SEC company_tickers_exchange.json은 100/100 일치했고 모두 active COMMON_STOCK, 비보통주 6개 플래그 false, USD 시총 $100m 이하이다.
- 운영 기준 https://stockman.r-e.kr; 공개 GET만 사용했고 운영 API/DB write는 없다. market intelligence snapshot은 2026-11-04T03:02:55.317Z. SEC company ticker master와 submissions는 SEC 공식 공개자료다.
- 운영 metadata를 2026-11-04T02:59:14.720Z에 100/100 재조회했다. 모두 active COMMON_STOCK, 비보통주 6개 플래그 false, USD 시총 $100m 이하이다. 운영 시세/시총 자료는 2026-11-02 관측으로 모두 STALE이며 현재 실시간 시총으로 간주하지 않는다. 종목별 관측·수집시각은 review JSON에 있다.
- SEC filing inventory는 2025-11-04 포함~2026-11-05 미포함 4620건이다. 최신 운영 intelligence의 RSS 512건, bullish 분류 84건, operating SEC event rows 0건.
- 직접 SEC 원문 구간 검토 이벤트 43건. 타깃 원문 604건은 초기 과속 요청에서 HTTP 429 440건 발생 후 paced retry로 604/604 HTTP 200 복구했다. 해당 사건 accession만 TARGETED_SECTION_REVIEW, 나머지 4577건은 INVENTORY_ONLY이며 전문검토가 아니다.

## 종목별·공시별 관리

종목 snapshot·뉴스·이벤트는 [review JSON](../../data/us-smallcap-event-review-20261104-b05.json), accession별 제출 원장은 [filing ledger](../../data/us-smallcap-filing-review-ledger-20261104-b05.json), 검토 정의 입력은 [event definitions](../../data/us-smallcap-event-defs-20261104-b05.json)에 저장했다. 정규 이벤트는 [market-impact-events.json](../../data/market-impact-events.json)의 eventId로 연결한다. 검토된 SEC archive URL의 CIK가 issuer CIK와 일치해야 validator를 통과한다.


## 직접 확인 일정·이벤트

| Ticker | 날짜 | 상태 | 이벤트 | accession |
|---|---|---|---|---|
| GYRO | 2026-11-05 | CONFIRMED_SCHEDULED | 연례 주주총회 (11:00 ET / 11-06 01:00 KST) | 0001437749-26-032011 |
| DLPN | 2026-11-04 | CONFIRMED_SCHEDULED | 연례 주주총회 (10:00 ET / 11-05 00:00 KST) | 0001079973-26-001276 |
| TPST | 2026-11-09 | CONFIRMED_SCHEDULED | 연례 주주총회 (13:00 PT / 11-10 06:00 KST) | 0001213900-26-112476 |
| LSTA | 2026-11-09 | CONFIRMED_SCHEDULED | 연례 주주총회 (11:00 ET / 11-10 01:00 KST) | 0001140361-26-039986 |
| BIVI | 2026-11-10 | CONFIRMED_SCHEDULED | 가상 연례 주주총회 (09:00 PT / 11-11 02:00 KST) | 0001520138-26-000395 |
| DARE | 2026-11-10 | CONFIRMED_SCHEDULED | 특별 주주총회 (시각 미공개) | 0001493152-26-045977 |
| GTBP | 2026-11-11 | CONFIRMED_SCHEDULED | 특별 주주총회 (시각 미공개) | 0001493152-26-046861 |
| XHLD | 2026-11-12 | CONFIRMED_SCHEDULED | 정족수 미달로 연기된 연례 주총 재개 (09:00 ET / 23:00 KST) | 0001493152-26-049279 |
| TPST | 2026-11-12 | CONFIRMED_SCHEDULED | 표결 부족으로 연기된 특별 주총 재개 (14:00 ET / 11-13 04:00 KST) | 0001213900-26-111032 |
| AZIO | 2026-11-13 | CONFIRMED_SCHEDULED | 정족수 미달로 연기된 연례 주총 재개 (09:00 PT / 11-14 02:00 KST) | 0001437749-26-034477 |
| CLWT | 2026-11-19 | CONFIRMED_SCHEDULED | 홍콩 연례 주주총회 (시각 미공개) | 0001654954-26-009144 |
| TCRX | 2026-11-20 | CONFIRMED_SCHEDULED | 특별 주주총회 (08:30 ET / 22:30 KST) | 0001193125-26-431045 |
| TULP | 2026-11-23 | CONFIRMED_SCHEDULED | 연례 주주총회 (13:00 CT / 11-24 04:00 KST) | 0001104659-26-114837 |
| DFNS | 2026-11-30 | CONFIRMED_SCHEDULED | 가상 특별 주주총회 (16:00 ET / 12-01 06:00 KST) | 0001185185-26-005080 |
| LTRN | 2026-12-01 | CONFIRMED_SCHEDULED | 연례 주주총회 및 수권 보통주 증가 안건 (11:00 ET / 23:00 KST) | 0001493152-26-047586 |
| LIQT | 2026-12-03 | CONFIRMED_SCHEDULED | 덴마크 연례 주총 (15:00 현지 CET / 23:00 KST) | 0001437749-26-033433 |
| ASTC | 2026-12-04 | CONFIRMED_SCHEDULED | 연례 주주총회 (09:00 CST / 12-05 00:00 KST) | 0001437749-26-033333 |
| FNGR | 2026-12-04 | CONFIRMED_SCHEDULED | 역분할 권한 안건 특별 주총 (시각 미공개) | 0001493152-26-049465 |
| SINT | 2026-12-09 | CONFIRMED_SCHEDULED | 연례 주주총회 (10:00 MT / 12-10 02:00 KST) | 0001493152-26-049429 |
| RKTO | 2026-12-17 | CONFIRMED_SCHEDULED | 연례 주주총회 및 reverse split·수권주식 안건 (12:00 ET / 12-18 02:00 KST) | 0001213900-26-112099 |
| SEED | 2027-04-26 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 시정기한 | 0001104659-26-120676 |
| SLGB | 2027-04-26 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 시정기한 | 0001213900-26-113895 |
| GDTC | 2027-04-05 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 시정기한 | 0001493152-26-046630 |
| FNGR | 2026-12-28 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 시정기한 | 0001520138-26-000262 |
| NEON | 2027-02-02 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 시정기한 | 0001437749-26-026593 |
| RKTO | 2027-02-02 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 시정기한 | 0001213900-26-087771 |
| PMEC | 2027-02-22 | CONFIRMED_SCHEDULED | Nasdaq 최소호가 시정 기간 종료 | 0001213900-26-093729 |
| TCRX | 2027-02-23 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 시정기한 | 0001193125-26-379343 |
| IRIX | 2027-02-23 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 시정기한 | 0001193125-26-380229 |
| LIQT | 2027-01-19 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 시정기한 | 0001437749-26-024425 |
| FOXX | 2027-01-19 | CONFIRMED_SCHEDULED | Nasdaq $35m MVLS 회복기한 | 0001213900-26-082785 |
| LOOP | 2027-01-20 | CONFIRMED_SCHEDULED | Nasdaq $50m MVLS 회복기한 | 0001437749-26-024892 |
| BIOX | 2027-03-15 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 시정기한 | 0001104659-26-108004 |
| LTRN | 2027-03-24 | CONFIRMED_SCHEDULED | Nasdaq $35m MVLS 회복기한 | 0001493152-26-045344 |
| DARE | 2027-03-29 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 시정기한 | 0001401914-26-000052 |
| GTEC | 2027-03-08 | CONFIRMED_SCHEDULED | Nasdaq $1 최소호가 시정기한 | 0001213900-26-102404 |
| DFNS | 2026-10-27 | REPORTED | KeepZone 인수계약 체결 (종결 미확정) | 0001185185-26-005016 |
| CUPR | 2026-09-29 | COMPLETED | 공모 종결 및 총 조달액 약 $5.716m | 0001493152-26-044861 |
| MEGL | 2026-09-30 | COMPLETED | 등록 직접공모 종결, gross 약 $3m | 0001493152-26-045061 |
| CUPR | 2026-10-01 | REPORTED | SPA 기반 인수계약 관련 보고; 주주 승인·종결 미확정 | 0001493152-26-045444 |
| RKTO | 2026-09-22 | REPORTED | Tracer Drone 인수계약 체결 (종결일 미공개) | 0001213900-26-102217 |
| FNGR | 2026-09-10 | REPORTED | Newbit 인수계약 보고 (종결일 미공개) | 0001493152-26-044880 |
| FNGR | 2026-08-20 | REPORTED | 토지 인수계약 보고 (종결일 미공개) | 0001493152-26-042255 |

정시 일정은 SEC 공시의 현지 시간과 KST를 이벤트 title/summary에 병기했다. 확인한 원문에서 시간이 나오지 않은 건은 미공개로 표시했다. Nasdaq deadline은 공시된 요건·기한을 기록했고, 해결 여부가 확인되지 않은 사례만 포함했다. 해소 통지된 NCPL·BCDA·BTCT·EPOW의 기한은 제외했다. 인수계약은 REPORTED 상태로 기록해 종결 조건·날짜 미확정을 분리했다.
## 해석과 한계

- 주주총회 일정은 투표 결과나 주가 방향을 보장하지 않는다. 주식 발행·수권 증가·reverse split 안건은 승인과 실행 여부를 별도 확인해야 한다.
- Nasdaq 상장 유지기한은 회사 공시의 조건부 일정이다. 정시 기한 도래 자체가 상장폐지를 확정하지 않으며 이후 준수·연장 공시를 추적해야 한다.
- 인수계약은 REPORTED로 기록했고 종결 미확정과 일정 미공개를 명시했다.
- 이벤트 방향은 모두 `UNCERTAIN`; 독립 가격 표본을 측정하지 않아 사후 수익률을 산출하지 않았다. 이벤트 결과가 가격 방향을 보장하지 않는다.
- 4,620건 전체 본문 전수검토가 아니며 RSS bullish 분류는 원문 이벤트 확정과 동의어가 아니다. 시총은 stale snapshot이라 현재 적격성을 보증하지 않는다.

## 검증과 배포

- 배치 원장 validator, 전체 문서/API/catalog 검사와 `npm run deploy:verify` 결과 및 운영 배포 후 GET 확인은 `DEVELOPMENT_LOG.md`에 기록한다. 이 보고서와 JSON/ledger는 문서 카탈로그에서 운영자가 접근할 수 있다.
