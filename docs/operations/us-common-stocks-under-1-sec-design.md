# 미국 보통주 $1 이하 리스트 데이터 설계안

- 상태: 설계 단계. 최신 cutoff는 2026-10-23 장 마감 후 (22:42:33~23:03:49 EDT, 2026-10-24 11:42:33~12:03:49 KST) KIS `output.last` 순차 관측이다. 프로젝트 활성 USD COMMON_STOCK master 5,444개 중 quote 5,405개 성공, 39개는 유효 가격 필드가 없었고, $1 이하 가격 후보는 514개였다. SEC상 common/ordinary임을 직접 확인한 474개를 표에 넣었다. unresolved 36개는 SEC상 예탁증서 30개(제외), 주식 종류 미검토 3개, ticker/분류 미확정 3개다. 별도 4개는 SEC상 OTC/상장폐지 상태를 확인해 제외표에 분리했다. 15개 추가 종목의 SEC current ticker/CIK map과 filing class를 재대조해 본표로 이동했다. 별도 39개 quote 응답 누락은 가격 조건을 판정할 수 없어 후보 포함 여부가 미확정이다. 이 프로젝트 master가 미국 전체 거래소 universe를 대표한다고 보장하지 않는다.
- 본표: [2026-10-24 현재 표](./us-common-stocks-under-1-live-20261024-current.md), [CSV](./us-common-stocks-under-1-live-20261024-current.csv). SEC 기업사실은 SEC EDGAR/CompanyFacts만 사용하고, 가격·30일 저고가에 한해 사용자가 거래소/시세 source를 허용했다.
- 현재가: KIS quote API의 `output.last`, 종목별 관측시각 포함. 장 종료 후 순차 수집이므로 같은 순간의 시세가 아니며, quote 값의 의미를 정규장 종가로 단정하지 않는다.
- 30일 범위: 2026-09-24~2026-10-23 완료 일봉. 514 raw 후보 중 505개에서 봉이 확인됐고, 현재 본표 474개 중 완료 30일 범위는 462개, 12개는 22개 미만의 봉 또는 봉 미확보로 범위를 만들지 않았다. raw 후보 일봉 미확인 9개는 저·고가를 임의 보간하지 않는다.
- SEC 기준 dated outstanding common/ordinary shares는 455/474행, SEC non-affiliate/float shares는 80/474행에서 확인됐다. Filing 기준일의 공시값이며 실시간 매도 가능 잔량은 아니다. 이번 후속 원문 대조에서 BRLS, CELU, ORGO, PLUR 및 추가 18개 issuer의 dated SEC shares를 추가했다. VRXA 주식수는 treasury 포함/제외 basis가 불명확해 미확인으로 유지했다. 추가 조사로 CCTG, COOT, FCHL, FLNA, GMEX, HPAI, LSTA, MNDR, SDEV, SRFM, TRUG, WBUY, RPID, GMM, MEGL, NTCL, DDC, SAGT의 filing-date shares를 반영했다. 다른 수치는 filing 기준일 잔액이며 이후 발행·분할을 반영해 roll-forward하지 않았다. 이전에 확인한 NCI(2026-09-26 pre-offering), CJMB(2026-05-26 pre-ELOC), SXTC(2026-05-29 pre-consolidation)의 float 기준일도 유지한다. 후속 발행/병합 뒤 현재 float는 미공개다. SEC current equity market capitalization은 검토된 SEC 자료에서 확인되지 않아 474행 모두 미확인이다.
- SEC lock-up 수량이 구체적으로 기재된 행은 8/474개다. lock-up review CSV는 현재 표와 1:1인 474행이며 targeted SEC 원문 검토 138개, keyword/context screening 311개, 미검토 25개다. 미검토/스크리닝 상태는 lock-up 0주를 뜻하지 않는다. 기존 screened 범위도 모든 계약·waiver·release 잔량의 전수 확인이 아니다. [검토표](./us-common-stocks-under-1-live-lockup-review-20261024.csv).
- Raw quote/range 및 상태별 보류·가격오류 자료는 live 표에서 링크한다. 이전 cutoff의 결과는 날짜가 적힌 역사 snapshot이며 최신 현황의 근거로 섞지 않는다.

> **현재 설계 cutoff**: 위 요약 숫자만 현행 2026-10-24 snapshot 값이다. 아래의 상세 단락 중 459행, 473행, 80/459, 143/459 등 다른 분모가 나오는 수치는 해당 문맥의 과거 조사 시점 값이며 현재 표의 coverage로 사용하지 않는다. 본 설계안 전체에서 최신 기준 행 수는 474이다. 상세 과거 기록을 갱신할 때에는 해당 단락에 역사 기준임을 명시한다.

## 현재 설계 요약과 범위 한계

이 문서는 현재 단계에서 급등주 단타에 필요한 공시 기반 필드와 확인 한계를 정리한다. 최신 작업 우선순위는 (1) SEC dated outstanding 미확인 37행과 SEC non-affiliate/float 미확인 394행의 원문 검토, (2) 현재 lock-up 검토표의 미검토·부분 검색 범위 확대와 잔액 갱신, (3) SEC current market cap 미확인의 filing 범위를 종목별 기록, (4) 보류 6종의 주식 종류/ticker 연결 조사, (5) 유효 가격이 없는 39종 재조회, (6) 프로젝트 master 밖 미국 거래소 보통주 모집단 범위 입증이다. lock-up 현행 수치는 상단 요약과 row-level 검토 CSV를 따른다. 구체적 숫자가 공시에서 확인되지 않으면 미확인으로 둔다.

SEC 최신 제출원문과 SEC CompanyFacts share-tag 후보를 교차 확인해 ALPS, GCL, HKPD, ONEG의 2026-03-31 outstanding 수량을 추가했다. GCL은 issued 130,135,432와 outstanding 128,008,703을 구분했다. 최신 기준일은 SEC 공시 기준이며 실시간 잔액으로 roll-forward하지 않았다. SEC filing scan의 61개 미확인행 중 나머지 자동 후보는 클래스·기준일·역분할 문맥이 불충분하여 숫자를 넣지 않았다.

후속 20-F/40-F 표지 원문과 CompanyFacts 날짜 문맥을 다시 대조해 SYNX, BRNX, EVGN, IMTE, INEO, MNDO, NEXR, NYXH, PRZO, ZTG 10개 dated ordinary-share 값을 추가했다. PRZO는 동일 20-F에서 확인된 더 늦은 2026-03-25 수치 23,426,906을 사용했다. 다른 값은 가장 최근 SEC에 보고된 기준일의 잔액으로만 표시하며 발행주수 전수검증이나 현재 수량 roll-forward로 해석하지 않는다.
## 목적과 기준

아래의 날짜가 있는 조사 기록과 과거 집계는 각 기록일 당시의 상태를 설명한다. 그 안에서 사용한 “최신”·“현재” 표현도 해당 기록 cutoff 기준이다. 현행 cutoff와 숫자의 단일 기준은 위 2026-10-24 live 표 및 연결된 CSV/snapshot이다.

본 문서는 미국 거래소의 보통주/ordinary share 가운데 장 종료 후 조회한 quote가 $1 이하인 후보를 SEC 공시 기반 기업정보와 함께 관리하고, 급등주 단타 분석에 추가할 SEC 공시 필드를 설계한다. 종가 기준 screen과 post-close quote snapshot을 별도 기록한다. 가격과 최근 30일 고저가에 한해 사용자가 거래소/시세 출처를 허용했다.

- 최신 완료 종가 screen은 2026-10-21 기준 snapshot으로 보존하고, post-close quote screen은 최신 2026-10-22 관측으로 별도 관리한다. 후자는 5,444개 활성 프로젝트 master 중 5,405개 quote 성공, raw $1 이하 513개이며 SEC 직접 common/ordinary 확인 465개다. quote가 최신 완료 종가를 대체하지 않으며 두 cutoff를 혼합해 표기하지 않는다. 가격 전수 근거는 [10-21 일봉 재조회](../../scratch/us-under1-price-snapshot-20261021.json) 및 [10-22 quote snapshot](../../scratch/us-under1-live-quote-snapshot-20261024.json)에 있다.
- 2026-10-23 KST에 2026-10-22 요청일로 운영 cache를 재조회했다(요청 완료 2026-10-23 02:47 KST). 5,444개 중 최신 봉은 여전히 2026-10-21 5,252개, 10-22 봉은 0개, 요청 실패 0건이다. 따라서 10-23 현재가/거래가능 후보는 산출할 수 없다. 결과는 [10-22 기준 재조회](../../scratch/us-under1-price-snapshot-20261022.json)에 보존했다. 추가로 SEC `data.sec.gov/submissions/CIK0002058584.json` 최신 응답은 DKI 자료의 cutoff 후 filing을 포함하지 않고 마지막이 10-20 Schedule 13G/A여서, 10-19 split release를 담은 SEC filing은 이번 확인에서 발견하지 못했다. SEC-only 규칙상 효력일·split-adjusted 거래 개시일은 미확인으로 둔다.
- 2026-10-23 요청 거래일로 같은 master를 재조회 완료(UTC 2026-10-22 17:57:49). 응답 실패 0건, latest observed 2026-10-21 (5,252개), 10-23 target-date candle 0개다. 따라서 현재 종가 기준 universe 재선정은 여전히 불가하고 새 snapshot [2026-10-23 요청 결과](../../scratch/us-under1-price-snapshot-20261023.json)에 기록했다. KST 작업 시각상 미국 10-23 regular-session candle은 아직 발생하지 않은 점과 cache 지연을 함께 고려한다.
- 2026-10-23 KST 사용자 확인: 가격 및 30일 고저가에만 거래소/시세 원천 허용. 시총·발행주수·lock-up·float 및 기타 기업 사실은 SEC-only 유지. 현재 표의 종가 cutoff를 live quote로 바꾸지 않고 최신 완료 세션 날짜를 함께 표시한다.
- 2026-10-22 미국장 장중 quote overlay: project active USD COMMON_STOCK master 5,444종목을 KIS price-detail로 전수 조회(18:39:43~19:01:55 UTC / 14:39:43~15:01:55 EDT). 유효 응답 5,405, 가격 미응답 39(1회 재시도 후에도 값 없음), raw price <=$1 512. SEC class 교차검토 후 직접 common/ordinary 431을 별도 live report에 수록; 30 depositary receipts 제외, 추가 51은 보통주/ticker 미확정 또는 미심사라 후보표에서 보류했다. 각 행은 개별 quote fetch timestamp를 포함하며 22분 순차 snapshot이다. [431행 live report](./us-common-stocks-under-1-live-20261022.md), [CSV](./us-common-stocks-under-1-live-20261022.csv), [SEC class/price 보류표](./us-common-stocks-under-1-live-unresolved-20261022.csv), [quote 미확인 39개](./us-common-stocks-under-1-live-price-unavailable-20261022.csv).
- 2026-10-22 post-close 후속 quote 재조회(UTC 20:43:07~21:04:06 / EDT 16:43:07~17:04:06, KST 10-23 05:43~06:04): 5,444개 master에서 fresh quote 5,405, 실패 39, raw $1 이하 513. SEC direct common/ordinary 본표 465개, class 보류 48개(예탁증권 30, 미심사 13, class/ticker 미확정 5). 완료 일봉과 가능한 당일 high/low를 결합한 30일 범위는 본표 455 full·10 partial coverage다. [fresh quote](../../scratch/us-under1-live-quote-snapshot-20261024.json), [range](../../scratch/us-under1-live-pricerange-20261024.json), [live report](./us-common-stocks-under-1-live-20261022.md).
- SEC class 보강(2026-10-23): 직전 보류 후보 14개(AUST, MCRP, TMDE, CBAT, FCHL, GDTC, IRIX, CIGL, BRNX, FNUC, GMEX, PPCB, ZTG, BLNE)는 SEC filing의 Common/Ordinary Share 문구를 직접 확인해 본표로 이동했다. 6개는 filing 당시 Trading Symbol과 SEC current ticker map의 symbol이 달라 동일 CIK를 대조했다. BLNE는 2026-10-07 8-K cover가 Common Stock/BLNE/Nasdaq를 직접 명시해 해소했다. 보류표는 70개(예탁증권 30, 미심사 33, class/ticker 미확정 7), 본표는 468개가 됐다. class filing URL, SEC ticker map URL, 원문 excerpt는 [class additions CSV](./us-common-stocks-under-1-live-sec-class-additions-20261023.csv)에 보존한다. 현재 본표 468개 모두 30일 고저 범위 및 18개 이상 완료 일봉이 있다.
- Live report의 30일 창은 2026-09-23~2026-10-22이며, 완료 일봉 high/low와 KIS quote 응답의 10-22 당일 session high/low를 합산한다. current direct common 431행 모두 18개 이상 완료 봉을 보유하며 각 30-day extreme의 출처·날짜·봉 수를 저장한다. 기업정보 필드에는 KIS 응답의 market cap/listed shares를 복사하지 않고 SEC 사실만 사용한다.
- Lock-up 현행 수량은 SEC 문서 검토로 6개 행(AIIO, AIRE, GYGY, MDXH, SKYX, VTIX)에만 공시/계약상 확인 수량을 기록하고, AIFC·MKDW·PBK는 공시 비율/일정 산술 추정치를 별도 열로 분리했다. 기준일은 2026-10-21이며 waiver·잔량 변동 전수 확인은 아니므로 현재 확정 잔액으로 확대 해석하지 않는다. 각 근거 URL과 계산 basis는 live CSV에 보존한다. 나머지는 미확인/미검토이지 0주가 아니다.
- 기존 434행 역사표와 live 431행 표는 cutoff가 다르다. 425 ticker가 겹치고 기존 후보 9개는 live quote >$1, live-only raw candidate가 87개다. 신규 SEC direct common 6개(STXS, CLPS, MIMI, RCON, TLSA, TVRD)는 SEC cover/CompanyFacts를 대조해 날짜 있는 outstanding count를 기록했지만, 각 신규 행의 non-affiliate float/lock-up은 미검토로 둔다.
- 2026-10-23 02:58 KST 재조회(미 동부 10-22 13:58 EDT, 정규장 중): 219/219 배치, latest candle 10-21 5,252개, 10-23 target 0, 실패 0, candle 부재 43개. 장중 조회이므로 당일 일봉 미생성은 장 마감 후 재확인해야 하며, 이 결과만으로 운영 cache 지연을 판정하지 않는다.
- 2026-10-23 03:05 KST에 활성 로컬 DB와 운영 스냅샷을 재조회했다. fundamental snapshot 12,760행 중 USD 6,266행의 가장 최신 observed/fetched 시각은 2026-10-20 01:54:07 UTC; 일봉 market의 최신일은 10-21이다. 10-21 cutoff의 SEC 직접 common 후보 434행 재생성은 성공했으나 거래소 마스터 마지막 갱신은 2026-09-25다. 가장 최근 세션 종가와 더 오래된 quote snapshot은 서로 다른 값일 수 있어 quote snapshot을 현재가로 대체하지 않는다.
- 2026-10-23 03:25 KST (10-22 14:25 EDT, 정규장 중) 재조회: 219/219 배치, 5,252/5,444 master rows의 최신 candle이 10-21, 요청한 다음 세션 10-23 봉은 아직 0, 요청 오류 0. API는 부분 진행 중인 10-22 정규장 봉을 제공하지 않으므로, 10-22 장 종료 후 다시 확인해야 한다. 현 스냅샷의 10-21 가격은 history로 둔다.
- SEC 최신 filings 후속 조회: 후보 screening pool의 487 issuer를 2026-10-22~23 기간 SEC submissions API로 모두 조회(error 0), 18 filing/17 issuer primary document를 SEC Archives에서 fetch(error 0). TWG 10-22 6-K 및 6-K/A는 1:100 consolidation과 market effective date를 원래 10-23에서 **10-26 개장**으로 정정한 SEC 사실이다. 따라서 기존 $0.0692 (10-21 close)는 historical pre-split 값이며 미래 split을 선반영하거나 현재 eligibility로 표시하지 않는다. [6-K/A](https://www.sec.gov/Archives/edgar/data/1978057/000121390026111580/ea0309392-6ka1_topweal.htm). AIRE 10-22 preliminary S-1은 최대 2,727,272 common shares 또는 같은 수량의 pre-funded warrants 및 각 기초주를 최대 $3,000,000 규모로 제시한다. 이는 미종결 등록/공모 한도이며 발행주식 또는 현재 float에 더하지 않는다. [SEC S-1](https://www.sec.gov/Archives/edgar/data/1859199/000121390026111519/ea0306283-03.htm).
- 가격/30일 범위: 사용자가 가격 필드에 한해 허용한 KIS 운영 일봉 cache. SEC 기업사실(시총·발행/유통주·락업 등): SEC EDGAR/XBRL filing만 사용.
- 유니버스: 프로젝트의 활성 USD COMMON_STOCK master 5,444개. 이는 전체 미국 상장주 coverage를 증명하지 않는다.
- 30일 창: 2026-09-22~2026-10-21. 30일 봉이 없는 종목은 수치를 보간하지 않는다.


### 당일 변경 가능 이벤트 우선 점검 (2026-10-23)

이번 후속 확인에서 SDST의 2026-10-19 Form 8-K는 Nasdaq이 2026-10-23 개장 시 거래정지·상장폐지를 예정했다고 보고했다. 회사는 청문 요청을 검토 중이며, 요청이 있더라도 정지는 자동 유예되지 않는다고 기재했다. 따라서 10-21 가격 후보 본표의 SDST 행은 historical snapshot으로만 유효하며 10-23 현재 거래소 상장 보통주 목록으로 간주할 수 없다. 10-23 실제 거래 정지와 항소 상태는 이 공시만으로 확정되지 않았고 새 EDGAR filing 확인이 필요하다. 상장 여부가 재확인될 때까지 현재 거래가능 후보 수에서는 제외하고 기존 434행 historical snapshot은 보존한다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1831979/000149315226047607/form8-k.htm)

DKI는 2026-10-09 424B4가 공모 전 Class A 1,667,701주와 Class B 429,886주, 전량 유닛 판매·워런트 미행사 가정의 공모 후 Class A 2,566,666주를 제시한다. 같은 날 6-K에서 실제 10-09 종결과 Class A 898,965주 발행, 3,267,701 pre-funded warrant 발행을 확인하므로 post-close Class A 2,566,666주가 성립한다. Class B 포함 총 ordinary 2,996,552주는 산술 합계다. 공모단위에는 zero-exercise warrant가 포함되어 추가 최대 52,380,944 Class A shares를 낼 수 있고 PFW 3,267,701주도 행사 가능하므로 잠재공급을 분리해 추적한다. 424B4는 임원·이사·10%+ 및 일부 소액주주에게 180일 lock-up을 부과하나 대상자별 현재 제한 수량은 공시하지 않는다. 기준일 10-21 현재 기간 중이므로 잠김 주수는 미확인이지 0이 아니다. [SEC 424B4](https://www.sec.gov/Archives/edgar/data/2058584/000149315226046431/form424b4.htm), [SEC 6-K](https://www.sec.gov/Archives/edgar/data/2058584/000149315226046619/form6-k.htm)

DKI SEC 제출물(2026-10-21 cutoff)은 1:50까지 조건부 shareholder-approved consolidation 권한을 확인하지만 actual effective date를 보고하지 않는다. Nasdaq Trader의 2026-10-20 notice에는 10-22 효력 일정이 있으나 사용자 지정 SEC-only 기업사실 규칙에는 사용할 수 없고, SEC submissions API에서 관련 cutoff 이후 SEC filing도 발견하지 못했다. 10-21 원시 종가 $0.0362는 historical 값으로 유지하며 10-23 현재가·편입 여부는 미확인이다. 효력 공시와 일봉 가격원의 post-split 처리 여부가 확인되면 split 조정 high/low와 share count를 새 SEC filing 기준으로 갱신한다.

### 종목별 단타 필드 구현 스키마

아래 필드는 각 ticker마다 `value`, `unit`, `as_of_date`, `sec_form`, `accession_url`, `status`를 함께 저장한다. SEC 공시에 없는 항목은 숫자 0 대신 `null`과 `NOT_DISCLOSED`/`NOT_FOUND_IN_REVIEWED_FILINGS`/`NOT_CURRENT` 등 원인 코드를 쓴다. 가격 필드만 사용자가 허용한 시세 원천을 사용하며 `price_source`, `price_timestamp`, `session`을 별도로 기록한다.

| 설계 그룹 | 종목별 필드 | SEC에서 기록할 값/계산 | 단타 판단 목적 |
|---|---|---|---|
| 촉매 | `catalyst_type`, `event_date`, `announcement_datetime_et`, `sec_filed_at`, `certainty` | 8-K/6-K와 첨부 원문에서 사건 사실·발표시각·SEC 접수시각, 결과/확정일정/추정일 분류 | 뉴스 갭의 원인과 촉매 지속 시간 확인 |
| 실제 자본 | `shares_outstanding_by_class`, `shares_as_of`, `treasury_shares`, `post_split_shares` | 표지/재무제표/공모종결 원문 주식 수를 class별 보존. 역분할은 공식 비율과 효력시각으로 새 basis 산출하고 rounding 규칙 명시 | 잘못된 low-float·시총 판정 방지 |
| 시장가치 | `sec_public_float_usd`, `market_cap_status` | SEC public-float USD는 별도 사실. SEC의 current equity market cap이 없으면 미공개; 발행주수×가격 계산은 SEC fact와 구분된 산술 참고치로만 설계 | 소형화·유동성 위험 참고 |
| 공급 과잉 | `atm_remaining_usd`, `registered_resale_shares`, `issued_resale_shares`, `warrant_shares`, `prefunded_warrants`, `convertible_shares`, `exercise_price`, `effective_registration` | 등록 상한, 이미 발행된 재판매분, 미발행 기초주식, 실제 행사/매도 완료를 서로 다른 수치/상태로 저장 | 당일·단기 매도 가능 공급량과 잠재희석 구분 |
| 락업 | `locked_shares_by_holder_group`, `lockup_start_trigger`, `unlock_date_or_condition`, `waiver_status` | 계약상 제한된 현재 발행주만 수치화; 당사자·수량·기간·예외·waiver를 accession과 연결. 기관 보유/13F·13G만으로 lock-up으로 간주하지 않음 | 공급 해제 시점 및 미확인 잔량 표시 |
| 유통·보유 | `public_float_shares`, `affiliate_shares`, `beneficial_owner_pct`, `insider_transactions` | SEC 직접 float 주수 우선; 계산 float는 입력 구성요소·산식·근사 여부 표기. Form 4 거래코드/수량/가격 및 13D/G beneficial ownership은 별개 지표 | 실질 매도가능 float와 소유 집중 파악 |
| 생존·재무 | `cash`, `operating_cash_flow`, `going_concern`, `debt_due_12m`, `default_or_waiver` | 최근 SEC period 기준 값, 기준통화, 후속 사건을 각각 기록; 단순 runway는 공시 현금/소진 수치로 산술임을 명시 | 급한 자금조달·파산·default 위험 파악 |
| 임상·규제·계약 | `asset_indication_phase`, `primary_endpoint`, `enrollment`, `company_confirmed_date`, `estimated_date_status` | 임상·FDA·계약 결과, 평가변수와 등록수, 일정 확정성. SEC 자료가 없으면 SEC-only 표에는 미공개 | 이벤트 이진성 및 일정 오인 억제 |
| 상장 위험 | `exchange_notice`, `deficiency_date`, `cure_deadline`, `appeal_stay`, `split_vote_and_effective_status`, `halt_status` | SEC에 보고된 통지·회복기한·항소의 stay 효과·분할 승인/효력 분리 | 거래 가능 여부와 상장 이벤트 위험 파악 |
| 현재 거래 체결성 | `volume`, `dollar_volume`, `spread`, `halt`, `rvol`, `vwap` | 실시간 체결·호가 지표는 SEC 공시만으로 만들 수 없으므로 SEC-only 기업사실 표 밖의 별도 실시간 데이터 계층에서 제공 여부 표시 | 급등 단타의 실제 체결 가능성 판단; SEC 미기재 시 미확인 유지 |

#### lock-up 수량 산정 및 공급해제 상태 규격

Lock-up 수량은 계약상 처분제한이 확인된 **이미 발행된 보통주**만 headline 수치에 포함한다. 각 건은 `holder_group`, `covered_class`, `covered_shares`, `shares_issued_status`, `restriction_start_event`, `restriction_end_date_or_event`, `release_schedule`, `exceptions`, `waiver_or_release_evidence`, `as_of_date`, `source_accessions`로 저장한다. 여러 제한이 중첩되는 경우 holder와 주식 lot 단위로 중복 제거하고, 회사 전체 lock-up 합계로 단순 합산하지 않는다. 발행 전 워런트/전환증권, 재판매 등록주식, beneficial ownership, voting control, ownership cap 및 insider ownership은 별도 열로 유지한다.

상태는 최소 `ACTIVE_EXACT`, `ACTIVE_ESTIMATED`, `EXPIRED`, `CONDITIONAL_NOT_ISSUED`, `RELEASE_UNKNOWN`, `QUANTITY_UNDISCLOSED`, `NOT_FOUND_IN_REVIEWED_FILINGS`로 분리한다. 예정 만료는 계약에 날짜/기간과 발효 trigger가 모두 있을 때만 산술 계산하고 `CALCULATED_DATE`로 표시한다. 규정상 만료일이 지났더라도 waiver·연장·대체제한 확인 전에는 현재 locked balance 0으로 설정하지 않는다. SEC 검색에서 조항을 못 찾은 경우도 “제한 없음”이 아니라 검색 범위와 미확인 상태를 남긴다.

2026-10-24 cutoff 시점의 lock-up 검토표는 표적 원문 검토 138행, keyword/context screening 311행, 미검토 25행이며 구체적 lock-up 수량은 8행이다. 여기서 수량을 보고한 11건으로 언급된 사례는 정확한 활성 잠금잔액 11건이라는 뜻이 아니다. AIRE의 119,903주는 2026-08-19 종결 시 발행되어 6개월 양도제한이 적용된 lot이고 ([2026-08-21 8-K](https://www.sec.gov/Archives/edgar/data/1859199/000121390026093535/ea0303282-8k_realpha.htm)), SKYX의 25,000,000주는 2026-10-13 종결 시 발행된 merger shares로 12/15/18/21개월에 25%씩 단계 해제 예정이다 ([2026-10-13 8-K](https://www.sec.gov/Archives/edgar/data/1598981/000149315226046938/form8-k.htm)). CHSN 37,500,000주는 2025-11-18 사모발행 및 1년 제한으로 보고됐으나 cutoff 시 해제/waiver 후 잔량은 미확인이다. AIFC의 9,502,693주와 PBK의 2,145,379주는 단계해제 산술 추정치라 exact current lock-up으로 취급하지 않는다. AIIO, GYGY, MDXH, MKDW, VTIX, WETH의 숫자 또한 보고된 lot·추정치와 현재 효력/잔량 상태를 별도 보존한다. 모든 건은 표의 cutoff와 연결 accession 기준이며 이후 공시 확인 전까지 현재 잔량으로 무기한 연장하지 않는다. [lock-up 검토 CSV](./us-common-stocks-under-1-live-lockup-review-20261024.csv)

EVTL의 2026-08-10 424B5는 특정 financing supplement에서 투자자/기존 common holder의 lock-up 주수·기간·waiver를 보고하지 않는다. “향후 특정 offering의 lock-up은 해당 prospectus supplement에서 정한다”는 base prospectus 일반 문구는 현재 제한 사실로 세지 않는다. 같은 보충서의 전환우선주 offering으로 발행될 수 있는 ordinary shares 최대 54,446,488주는 잠재 희석 공급이며 이미 발행된 common이나 locked shares에 합산하지 않는다. 현재 총 lock-up 잔량은 이 문서만으로 unknown이다. [EVTL 2026-08-10 Form 424B5](https://www.sec.gov/Archives/edgar/data/1867102/000110465926093116/tm2622436-2_424b5.htm)

#### ticker별 설계 적용 예: IMCC

2026-10-08 SEC F-3는 2026-10-07 현재 1,647,494 common shares outstanding을 명시한다. 이는 30:1 post-consolidation 기준 수량이며 표의 기존 2025-06-30 5,894,812주는 현재 split basis를 반영하지 못해 교체했다. 같은 F-3에서 완전 전환·행사 시 발행주식수가 1,647,494에서 4,408,146으로 증가할 수 있다고 제시하므로, 단타 설계에서는 현재 발행주식수와 잠재 희석 주식수를 분리한다. prospectus에 기재된 up to 2,799,276 resale shares는 이미 발행된 주식과 미발행 note/warrant 기초주식을 함께 포함하므로 전부 신규 발행 또는 lock-up 주수로 계산하지 않는다. 2026-10-07 발행 October settlement notes 기초 최대 1,226,927주는 발행 후 4개월 동안 거래할 수 없다는 제한이 있으나, 이는 아직 발행 전 기초주식이므로 현재 locked outstanding shares와 별도 공급 이벤트로 기록한다. [SEC F-3](https://www.sec.gov/Archives/edgar/data/1792030/000117891326004744/zk2636210.htm)

#### ticker별 설계 적용 예: BDMD

2026-09-30 Form 6-K는 2026-09-24 기관투자자와 체결한 8% OID senior convertible note 원금 $4,347,826을 공시한다. 동시에 추가 할인분 $86,956을 당시 주가 $0.79로 나눈 보통주 110,070주를 실제 발행했다고 명시한다. 전환가는 $0.9842 고정가와 직전 7거래일 최저 VWAP의 92%(default 시 85%) 중 낮은 값이며, floor는 Nasdaq minimum price의 20%로 연동된다. 따라서 전환 가능 주수는 고정 숫자로 가정하지 말고, 잔여 원금·전환 시점 가격·floor와 실제 전환 공시를 각각 추적해야 한다. 같은 공시는 180일 내 추가 $3,680,000 대여 가능 조건 및 360일 이내 상호 동의에 따른 최대 $6,000,000 추가 대여 가능성을 기록한다. 이는 확정 발행량이 아닌 조건부 자금/잠재 공급 이벤트다. 발행주식수 기준일 이후 실제 발행·전환분은 별도로 확인하고, 9.99% beneficial ownership cap을 lock-up으로 잘못 분류하지 않는다. [SEC Form 6-K](https://www.sec.gov/Archives/edgar/data/1982444/000110465926112324/tm2626149d1_6k.htm)

#### ticker별 설계 적용 예: COSM

2026-08-18 SEC 10-Q cover는 common shares outstanding 100,633,773주를 명시한다. 같은 filing은 2026-06-30 기준 전환사채·워런트로 발행 가능하다고 보고한 34,209,667주와 Q2 ATM 실제 발행 4,516,253주를 별도 공시한다. 따라서 현재 발행주수, 이미 발행된 ATM 물량, 미발행 전환/워런트 기초주식을 각각 분리하고, 잠재 공급률은 기준일이 다른 수치를 혼합해 계산하지 않는다. 동일 filing의 6월 30일 balance-sheet note와 MD&A에는 outstanding 수량 500주 차이가 있어 역사 수량을 그대로 사용하지 않고, 그보다 뒤의 명확한 8월 18일 cover 수량을 기준으로 보존한다. [SEC Form 10-Q](https://www.sec.gov/Archives/edgar/data/1474167/000147793226005146/cosm_10q.htm)

### SEC 최신 제출 증분 모니터 (2026-10-22~23)

후보 모집단의 최근 제출물을 자동으로 현재 자본수치로 덮어쓰지 않고, 다음 accession review 대상으로만 관리한다. 전체 primary filing 목록/원문 keyword 발췌는 [증분 SEC JSON](../../scratch/us-under1-sec-new-filings-20261022-23.json), SEC submissions 집계는 [issuer submissions JSON](../../scratch/us-under1-sec-submissions-20261023.json)에 보존한다. 이 기간 487개 issuer 중 17개에서 18건 제출되었고 primary 문서 18건을 모두 가져왔다. 주식 수나 lock-up 수량의 완전한 재검토가 끝난 뜻은 아니다.

| Ticker | 새 SEC 사실 | 기존 cutoff 표 처리 |
|---|---|---|
| TWG | 2026-10-22 6-K의 1:100 share consolidation market effective date 10-23 발표를 같은 날 6-K/A에서 2026-10-26 장 개장으로 수정했다. | 10-21 close $0.0692는 pre-split 역사값. 새 효력일/거래기준을 10-26 이후 가격원 확인 뒤 적용; 현행 주수 재계산 필요. |
| AIRE | 2026-10-22 preliminary S-1: 최대 $3,000,000; 최대 2,727,272 common shares 또는 같은 수량의 pre-funded warrants와 기초주. | 공모 미완료/최대치이므로 현재 발행·유통주에 가산 금지; 등록효력, 실제 closing, issued shares 후속 확인. |
| XXII | 2026-10-22 8-K Exhibit 99.1은 10-22 outstanding 3,416,441 common shares와 warrants 0, quarter-end cash $3.9m을 발표. | dated count를 본표 CSV의 최신 SEC primary outstanding 열로 업데이트; 10-21 close는 historical cutoff, lock-up/float은 미확정. |
| SNES | 10-22 8-K: Nasdaq deficiency letter based on 30 business days below $1; cure deadline 2027-04-19, no immediate listing effect. Exhibit 99.1 gives preliminary Q3 revenue $1.1m (+40% sequential, +55% YoY). | deficiency and preliminary operating result are separate fields; do not claim listing failure or final revenue. |
| XTIA | 10-22 8-K Exhibit 99.1: preliminary unaudited Q3 revenue $35.3m, about +9% sequential, within $125m-$130m company FY outlook. It also notes liquidity needs/acquisition-note restructuring. | preliminary result is not audit-final; pair with previously disclosed cross-default, waiver and going-concern risks. |
| CGTX | 10-22 8-K Exhibit 99.1: company says FDA alignment on planned Phase 3 zervimesine DLB trial elements; 100mg daily vs placebo for nine months; NPI-2 primary, ADCS-ADL key secondary; protocol in preparation. | planned trial, not initiated trial or positive efficacy result; enrollment and start date not disclosed here. |
| MIRA | 10-22 8-K Exhibit 99.1: company-reported 21-day, 72-rat preclinical MIRA-55 study; pain measures p<0.001 vs vehicle, with reported celecoxib-like magnitude. | preclinical evidence only; do not equate to human efficacy or FDA clinical clearance. |
| COSM | 10-22 8-K exhibits: company expectation of Q4 U.S. revenue ~$15m/gross profit ~$10.5m and 8,940 active subscriptions as of 10-19; preliminary 9M revenue ~$54.3m. | company outlook/preliminary numbers remain unverified final actual results; label periods and status. |
| EDBL | 10-22 8-K Exhibit 10.1: two-year produce supply agreement from 10-15 with phased weekly volumes; no general minimum purchase/take-or-pay, but short-notice volume cuts can require payment for committed crops and dedicated packaging inventory. | contract supply/volume and cancellation exposure can affect margins/working capital; retain the 10.1 agreement separately from current shares. |
| UZX | 10-22 6-K Exhibit 99.1은 Nasdaq이 9-21~10-16 20거래일 연속 closing bid가 $1 이상이었다고 판단해 minimum bid 요건 회복을 확인하고 사안을 종결했다고 보고. | 상장유지 deficiency 상태를 회복/종결로 갱신하되 share count나 현재 가격을 이 공시에서 추론하지 않음. [SEC Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1969401/000121390026111484/ea030937301ex99-1.htm) |
| YMT | 10-22 6-K Exhibit 99.1은 Nasdaq이 10-20자로 주주자본 최소 $2.5m 요건 회복을 확인했다고 발표. 2026-10-20부터 1년 mandatory panel monitor가 적용되고, 해당 기간 다시 미준수 시 추가 cure period 없이 delisting determination이 가능하다고 명시. | 회복 상태와 감시기간을 별도 상태로 기록; 확인 공시는 closing bid 또는 주식수 업데이트가 아님. [SEC Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1991605/000121390026111459/ea030937201ex99-1.htm) |
| WETO | 10-22 6-K Exhibit 99.1은 회사가 10-15부터 ATM 주식 매도를 일시 중지했다고 발표. ATM 계약은 유지되고 향후 재개할 수 있음. | paused는 ATM 종료/잔여 capacity 0을 뜻하지 않음. 실제 매도 잔량·재개·발행수는 미확인으로 분리. [SEC Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1941158/000121390026111491/ea030938001ex99-1.htm) |
| IMRN | 10-22 6-K Exhibit 99.1은 CEO의 10-28 Emerging Growth Conference 온라인 발표를 공지. 임상 결과·규제 결정·계약 체결 공시는 아님. | 회사 일정 공지로 분류하고 확정 임상/사업 촉매와 구분. [SEC Exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1660046/000121390026111439/ea030935501ex99-1.htm) |
| IGC | 10-22 DEF 14A의 주주서한은 CALMA 임상등록 100% 완료(회사 발표), 2026년 11월 최종 투약 예상일 및 운영/재무 요약을 설명. CEO/CFO가 2026년 6월 회사 채권 약 $1.15m을 현금 대신 보통주로 받기로 했다는 내용도 포함. | 임상 일정은 회사 예상으로 표시; proxy의 설명 자료를 audited 신규 실적으로 오인하지 않음. 주식 전환의 실제 발행수/발행일은 후속 공시 대조 전까지 미확인. [SEC DEF 14A](https://www.sec.gov/Archives/edgar/data/1326205/000118518526004896/igcdef14a102126.htm) |
| HUBC·TOON·UXIN | SEC filing 제출·원문 확인만 완료; 본 검토에서 주식수/lock-up/확정 촉매의 새 수치를 추출하지 않음. | 사실을 추정하지 않고 후속 원문 검토 대기 상태로 남김. accession은 [증분 제출 원자료](../../scratch/us-under1-sec-new-filings-20261022-23.json) 참조. |

RCT의 2026-10-16 Form 424B3에 첨부된 10-15 Form 6-K는 10-14 Nasdaq 상장폐지 결정에 대해 회사가 항소했고, 청문 및 결정 때까지 거래정지/상장폐지가 유예되어 정상 거래가 이어진다고 보고했다. 또 10-15 종가 $0.089와 최대 19,335,283주 재판매 등록(기발행 5,000,000주 및 warrant 기초 잠재주식 포함)을 기재한다. SEC 공시 숫자는 현재가격·현재 outstanding 또는 현재 유통량으로 확장하지 않는다. [SEC 424B3/6-K](https://www.sec.gov/Archives/edgar/data/2027360/000149315226047471/form424b3.htm)

이 두 사례는 단타 필수 필드 설계에 거래정지·상장유지/항소 상태, 재매각 등록 수량(기발행/잠재발행 분리), 공시 기준일의 종가와 거래가능 상태의 확인 시각을 포함해야 함을 보여준다.
XWELL의 2026-10-07 Form 8-K(10-20 제출)는 8월 25일~10월 6일 30거래일 종가 bid가 $1 미만이어서 Nasdaq 최소호가 규정 미준수 통지를 받았고, 2027-04-05까지 회복 기한을 받았다고 명시한다. 통지는 상장/거래에 즉시 효력이 없으며, 10일 연속 $0.10 이하이면 staff delisting determination이 발생할 수 있다고 적었다. 주식수는 새로 제시하지 않는다. 상장 상태 필드에는 통지 수령일·관측 기간·회복 기한·즉시 효력 여부·후속 split 가능성을 기록한다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1410428/000110465926117180/tm2627894d1_8k.htm)

Knightscope의 2026-10-20 Form 8-K는 3분기 예비 매출 공시이며, 제출 시점에 quarter-end close/review 절차가 끝나지 않았고 실제 결과가 달라질 수 있다고 밝힌다. 급등 촉매 요약에는 실적 수치와 함께 preliminary/unaudited 여부 및 회사가 명시한 검토 상태를 붙인다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1600983/000110465926117218/kscp-20261020x8k.htm)
WFF의 최신 2026-10-14 Form 424B5는 공모 직전 Ordinary 50,869,934주와 Class A 3,440,664주 outstanding을 별도 기재한다(합계 54,310,598주는 산술). 동일 문서는 최대 12,000,000 유닛과 추가 12,000,000 유닛 선택권, 초기 발행 시 108,000,000주 warrant 기초주 및 full Additional Allocation 시 216,000,000주 기초주를 기재한다. 제로가격 행사 시 워런트 1개당 최대 9주를 받을 수 있어 최대 잠재공급은 초기 120m, full allocation 240m이며, 실제 종결/배정/발행과 현재 outstanding은 미확인이다. 2026-07-30 public float 수량 41,919,934 Ordinary shares는 전량 비계열 보유였으나 10월 발행 전의 dated 수치다. 오래된 May 29 base-prospectus figure 5,038,018 outstanding/3,440,664 non-affiliate 수량을 최신 기준으로 대체하지 않는다. KIS 30일 high $50.60(Oct 12)은 SEC 10-14 prospectus의 last sale $0.175와 현저히 불일치하며 검토된 SEC scan에서 해당 기간 reverse split은 찾지 못해 가격 range anomaly로 미해결 표시한다. [2026-10-14 424B5](https://www.sec.gov/Archives/edgar/data/1980210/000121390026109619/ea0308716-424b5_wfholding.htm), [2026-07-31 424B5](https://www.sec.gov/Archives/edgar/data/1980210/000121390026083640/ea0299868-424b5_wfholding.htm)

검토한 ARAI 2026-10-16 8-K는 회계법인 변경, 감사인 사임 사유와 미해결 material weakness를 보고하지만 주식수는 기재하지 않는다. 이런 중요 기업사실도 단타 설계에는 포함하되, outstanding shares 필드에 끌어와 숫자를 대입하지 않고 공시일·회계통제/going concern flag로 분리한다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1818274/000149315226047406/form8-k.htm)
### XTIA: 최신 cover 주수, 채무 cross-default, 잠재 공급·상장 촉매 분리

- 2026-10-20 제출 Form 10-Q cover는 같은 날 기준 common stock 38,477,789주 outstanding을 기재한다. 이는 본표의 SEC dated count다.
- 회사는 2026-09-30 Seller Notes 원금 $1.5m 지급을 놓쳐 10-11 default가 발생했고, 10-11 현재 Seller Notes $4.5m이 남아 있다고 보고했다. 2026-10-16 기준 JPMorgan revolving facility 잔액은 약 $8.4m이며 cross-default가 발생했다. 10-16 waiver는 Seller Notes에만 적용되고 JPMorgan cross-default는 미해결이다. lender는 추가 대출을 거부하거나 전액 가속상환을 요구할 수 있다고 기재됐다. Seller Note waiver는 구조조정 체결, 협상 종료 통지 후 10일, 또는 2026-12-31 중 빠른 시점에 끝날 수 있으며, 종료 시 미지급분·만기금과 9.25% default interest가 due가 될 수 있다. 날짜 확정 촉매와 조건부 채무사건을 따로 추적한다.
- 6-30 기준 현금 $7.2m, 6개월 영업현금유출 $21.0m, 주주자본 결손 $25.6m 및 1년 substantial doubt가 보고됐다. 보고서 제출이 prescribed due date보다 늦었고, 10-Q는 독립이사 위원회의 전 CEO 관련 내부 검토 때문에 지연됐다고 설명한다.
- potential supply는 현재 발행주식에 합산하지 않는다: 6-30 기준 warrants 36,557,744개(그중 pre-funded 15,307,735개, exercise price $0.0001; 전체 exercisable 36,556,987개), XTI Drones Class B Units 6,524,576개(1:1 교환 가능), 2018 equity plan의 최대 award pool 80,105,687주 중 59,965,772주 미부여 잔량(그중 57,209,296주 등록)을 공시했다. 이들 수량의 현재 잔량·행사/교환 여부는 새 공시로 갱신한다.
- 상장 위험도 정량 사건으로 관리한다. filing은 $1 미만 closing bid가 2026-09-23부터 이어졌고 10-16 bid $0.80, 11-03까지 이어지면 30 business-day deficiency 및 delisting determination 가능성을 기재한다. 2025-01-10 1-for-250 reverse split 이력으로 자동 180일 cure 기간 대상이 아니며, 별도 stockholders’ equity 기준도 미달했다고 회사가 보고했다.
- SEC 근거: [2026-10-20 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1529113/000162828026066538/xtia-20260630.htm).

### RMCF: 최신 cover 수량, covenant 위반·going-concern·보상주식 추적

- 2026-10-19 제출 Form 10-Q cover는 2026-10-08 기준 9,601,236 common shares outstanding을 기재한다. 같은 filing의 8-31 재무상태표 count는 9,518,636이므로 본표는 cover의 더 늦은 dated count를 사용하고 10-08 이후 roll-forward는 확인되지 않았다고 표시한다.
- 6개월 ended 2026-08-31 net loss $2.4m, operating cash use $0.5m, 두 debt agreements covenant noncompliance, lender waiver 미수령(10-Q 제출 시점), debt current classification, 1년 substantial doubt를 SEC가 보고한다. 후속 기업 이벤트 설계에는 covenant·waiver 상태와 debt current/noncurrent 표시 변경을 별도 event로 둔다.
- 공급 추적: 2026-08-31 non-vested RSU 225,882주 및 2024 equity plan에서 미부여·미사용 899,785주를 보고했다. RSU는 미가득 보상수량으로 current outstanding에 더하지 않고, 미사용 reserve는 실제 발행/가득 주식이나 lock-up으로 간주하지 않는다. 본 SEC review만으로 holder lock-up 부재를 결론내리지 않는다.
- SEC 근거: [2026-10-19 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1616262/000119312526425389/rmcf-20260831.htm).

### HIT: 최신 발행주수와 Yorkville 잠재 매도 공급 구분

- 2026-10-19 제출 Form 424B3는 2026-10-06 기준 Class A common 53,600,790주 outstanding, 그중 비계열 보유 20,690,341주를 공시한다. 이 날짜 기준 수량을 SEC 원문 수작업 확인 필드에 넣으며, 이후 발행·전환·매입 여부는 별도 미확인으로 둔다.
- Yorkville에 대한 재판매 등록 상한은 34,224,247주다: 전환 가능 최대 9,532,889주와 회사 선택에 따른 SEPA advance 최대 24,691,358주. 전량 발행·매도 완료 수량이 아니므로 현재 발행주수, 즉시 유통주, lock-up으로 합산하지 않는다. prospectus가 설명하는 거래에는 특정 holder lock-up 수량이 확인되지 않았으나, 이는 다른 계약 부재의 증명이 아니다.
- 급등 단타용으로 회사 재량 funding의 사용/잔여량, 전환·advance 발행 공지, 등록 효력 및 resale 실제 실행, 비계열 기준일과 최신 발행주수 간 시차를 별도 추적해야 한다. SEC 자료는 실제 체결 이후 가격·체결 강도나 당일 매도량을 제공하지 않으므로 거래소/시세 입력이 필요하다.
- SEC 근거: [2026-10-19 Form 424B3](https://www.sec.gov/Archives/edgar/data/2019505/000121390026110487/ea0308967-424b3_health.htm).

## 기준일 데이터 현황과 미완료 범위

아래 2026-10-22 보고 CSV 집계는 434행/434 ticker의 역사적 품질 기준선이다. 이전 live 표는 2026-10-23 장전 cutoff 467행이며, 두 표의 모집단/수치를 혼합하지 않는다:

| 항목 | 현재 확인 범위 | 해석 |
|---|---:|---|
| 가격 종가 및 30일 저·고가 | 434/434 | 2026-10-21 종가·2026-09-22~10-21 범위. 장중 현재가가 아님 |
| SEC 현재 시가총액 (역사 snapshot) | 0/434 | 역사표 검토 범위에서 수량 미확인. SEC public-float dollar amount는 시가총액이 아님 |
| live 본표 SEC 검토자료의 현재 시가총액 | 0/468 | `NOT_FOUND_IN_REVIEWED_SEC_SOURCES`; 공시 전수 부재를 뜻하지 않음. 표와 CSV에서 빈 수치 및 상태로 관리 |
| live 본표 SEC primary filing에서 원문 확인한 outstanding shares | 391/468 | 나머지 77행은 원문 수량 대조 미완료 또는 최신 수량 연결 불가. CompanyFacts dated fact는 원문 확인 수량과 구분 |
| live 본표 float/non-affiliate 주수 | 78/468 | 나머지 390행은 최신 연결 filing 검색에서 정확한 수량을 찾지 못함. SEC public float dollar value와 비계열 보유주수는 서로 다른 필드이며, 비계열 주수가 즉시 유통가능 float와 동일하다고 보장되지 않음 |
| live 본표 lock-up 상태 | 165/468 targeted review | 165개 표적 검토, 303개 미검토. 계약 대상·수량·현재 효력/해제·예외 확인이 불완전할 수 있고, 수량 미공개/효력 불명/미검토를 0주로 치환하지 않음 |
| lock-up 심사상태 세부 | 7개 SEC 기재 수량, 3개 산술 추정, 168개 표적검토 | cutoff 이후 waiver/release 잔액과 전체 계약을 전수 재확인하지 않았다. 잠재 발행분이나 기관 보유만으로 lock-up 수량을 추정하지 않는다. |

이 집계는 완성된 전수 lock-up/float 목록이 아니라 후속 작업의 기준선이다. 수작업 share count는 filing cover·share-capital note의 주식수와 재무제표 행의 금액/단위를 교차 대조하고, 주식수로 확인되지 않는 balance-sheet monetary amount를 shares로 사용하지 않는다. 2026-10-24 현재 live 표 기준 outstanding 수량 미확인은 61행, non-affiliate/float 수량 미확인은 382행이며, lock-up review는 targeted 138행, 부분 screening 311행, 미검토 10행이다. 다음 개선은 SEC cover/share-capital의 outstanding 대조, filing의 non-affiliate share count 추가 확인, 미검토 lock-up 10개 원문 검토 순으로 진행한다. SEC 공시가 현재 시총을 직접 제공하지 않는 한 미확인 표기를 유지한다. 최근 filing만 확인하는 것으로 lock-up 부재를 결론 내리지 않으며, “미심사”, “검토했으나 수량 미공개”, “계약상 수량 확인·현재 효력 미확인”, “기준일 현재 활성”을 서로 다른 상태로 유지한다.

2026-08-06 Form 8-K 기준 ENSC는 2026-08-05 closing에 보유한 주식을 certain stockholders 및 certain directors/officers 대상으로 180일 제한한다고 기재한다. 같은 공시는 Series C 우선주 282,122주(각 1,000 common 전환 가능) 발행을 밝히지만, 서명자별 보유량·합계 locked shares를 공개하지 않아 잠김 수량은 미확인이다. [SEC Form 8-K](https://www.sec.gov/Archives/edgar/data/1716947/000149315226036268/form8-k.htm)

#### 2026-10-24 WETH 락업 수량 판정 정정

2026-07-31 Form 8-K의 31,037,830주는 2026-09-22 종결된 거래에서 발행된 수량으로 후속 SEC filing이 확인하며, 2026-07-31 agreement의 1년 lock-up 조항 대상이다. 따라서 표에는 2026-09-22 기준 SEC 보고 발행 tranche로 기록한다. 후속 waiver/release 또는 transfer-agent 잔량은 미확인이므로 이를 검증된 실시간 잠김 잔고라고 해석하지 않는다. SEC 원문: [2026-07-31 Form 8-K](https://www.sec.gov/Archives/edgar/data/1826660/000121390026084117/ea0300098-8k_wetouch.htm), [2026-09-22 closing Form 8-K](https://www.sec.gov/Archives/edgar/data/1826660/000121390026102645/000121390026102645-index.htm).

2026-10-21 종가 기준 가격 후보 485개 가운데 SEC class 검증으로 direct common/ordinary 434개를 본표에 포함했다. Depositary receipts 30개는 제외하고, ticker/class 미확정 21개는 보류했다. 가격 후보 전부가 2026-09-22~10-21 창에서 최소 18개 일봉을 보유한다. 이는 2026-10-22에 확인한 과거 완료일 기준 가격 snapshot이지, 최신 현재가 또는 10-22 당일 종가가 아니다. NCI는 accession 소유자(CIK) 검증 전 1-for-5 split-adjusted 처리됐으나, accession 0001185185-26-004826은 Neo-Concept(NCI) 공시가 아니므로 해당 보정은 철회했다. NCI 현재 행의 30일 OHLC는 원 KIS 봉 기준으로 표시한다.

SKYX 2026-10-13 8-K는 merger shares 25,000,000주를 25%씩 12·15·18·21개월 후 해제하도록 명시한다. tranche당 6,250,000주 및 2027-10-13/2028-01-13/2028-04-13/2028-07-13은 공시 총량·closing date에 따른 산술 일정이다. 주식은 매도계획 중인 senior lenders 및 전 주주를 위해 escrow에 보관된다고 보고돼, lock-up holder 유형과 10b5-1 매도계획을 별도 필드로 저장하되 계획을 실제 매도로 보지 않는다. MGRX의 2026-10-09 424B5/8-K는 공모 종결, 657,000주 신주와 657,000 warrant를 확인한다. 현금없는 행사 최대량은 warrant form·prospectus상 788,400주(1.2 ratio)이지만 8-K 요약문에는 1.08로 다른 숫자가 있어 discrepancy를 보존한다. 공모 후 22,224,422주는 warrant 미행사 가정이고 10-07 비계열 17,467,421주는 공모 전 기준이므로 현재 float로 연장하지 않는다. 검토한 offering supplement와 SPA에서는 특정 lock-up을 확인하지 못했지만 기존 holders 전반의 무제한 거래를 뜻하지 않아 lock-up 주수는 unknown이다. BGMS의 2026-06-04 BCA는 FNRG 주주가 결합회사 common의 99% 초과를 보유할 것으로 예상하는 교환을 제안하고 closing 시 발행주수를 서면 확정하도록 한다. 특정 매도주주가 closing 전후 서명할 180일 lock-up form이 있지만 closing/서명 및 실제 주수는 2026-10-21까지 확인되지 않아 현재 locked shares는 미확인이다. 현재 유효 주수로 확정하지 않고 0주라고도 단정하지 않으며, 발행 가능 지분율과 잠금 수량을 별도 추적한다. WCT의 2026-08-28 424B4는 CEO 보상 grant 5,000,000주에 3년 lock-up을 보고하지만, 동일 공시의 Class B 재지정 및 1-for-50 split 이력과 grant Class A 표기가 서로 대사되지 않는다. 100,000주는 단순 split-equivalent 계산일 뿐 현재 잠김 잔량으로 쓰지 않고, 현재 locked shares는 미확인으로 유지한다. 현재 SEC filing/CompanyFacts에서 현재 전체 보통주 시가총액을 제공하지 않아 미확인이다. CompanyFacts DEI·GAAP 기계 추출값과 원문 share count 수작업 검증 행을 분리하고 각 기준일을 보존한다. lock-up과 유통주는 발행주수에서 추정하지 않는다. 현재 본표 434개 중 SEC lock-up 표적 검토 연결은 79개이며, 217개 키워드 적중 issuer는 추가 원문 검토 대기다 (2026-10-22 coverage JSON 기준). 138개 검색 무히트도 모든 filing/exhibit에 제한이 없다는 증명은 아니다. NIVF의 2026-09-30 424B4는 임원·이사·Class A 보유 직원에 대해 공모 종결 후 60일 제한을 기재하지만 종결일·대상 주수 및 조기 해제 여부는 미확인이다. BDMD의 2026-09-24 424B5는 임원·이사·5% 초과 주주 등에 대해 공모 종결 후 180일 또는 전환사채 전액 상환/전환 중 먼저 발생하는 때까지 처분 제한을 기재하지만 대상별 보유·lock-up 주수, 실제 종결 및 상환/전환 상태는 미확인이다. BMEA의 2026-09-22 예비 424B5는 회사·임원·이사 60일 제한을 기재하나 공모 종결일이 비어 있어 기간 기산 및 현재 효력은 미확인이다. 세 종목 모두 lock-up 주수를 0으로 간주하지 않는다. BTCT의 2026-09-17 424B3는 임원·이사 및 10% 초과 실소유자의 등록신고서 효력발생 후 90일 제한을 기재하지만 효력발생일·대상 주수는 미확인이다. HCAI의 2026-09-15 424B5는 임원·이사의 공모 종결 후 90일 제한을 기재하지만 종결일·대상 수량은 미확인이다. DARE의 2026-08-17 종결 공시와 60일 임원·이사 lock-up을 대조해 해당 조항은 2026-10-21 기준 만료(2026-10-16 산술 계산)로 분류했으나 과거 대상 주수는 미공개다. OTLK는 60일 제한을 확인했지만 underwriting agreement일과 대상자별 수량을 찾지 못해 현재 효력은 미확정이다. 사후 원문 검증에서 NCI split 귀속 오류를 발견해 종전 설명을 철회했다. SEC submissions상 CIK 0001916331은 Neo-Concept International Group Holdings Ltd이며, accession 0001185185-26-004826은 CIK 0001879754 EshallGo Inc.(EHGO)의 6-K다. 따라서 NCI의 1-for-5 병합, 1,173,200 post-split shares 및 OHLC 5배 보정은 모두 적용하지 않는다. NCI는 SEC 2026-10-16까지 제출목록에서 1-for-5 split을 확인하지 못했다. 2026-09-26 기준 NCI Class A 2,441,952 + Class B 140,000 shares 및 2026-10-01 offering에서 새로 발행된 Class A 250,000 shares를 합산하면 2026-10-01 이후 총 ordinary shares 2,831,952주다(SEC 공시 숫자의 계산 합계; pre-funded warrant 기초 1,750,000주는 미발행이라 제외). 2026-09-26 pre-offering 비계열 Class A 2,441,952주는 남아 있으나 post-offering float 수량은 미공개다. 2026-10-01 6-K의 임원·이사 90일 처분제한과 2026-12-30 산술 만료일은 유효한 NCI 공시로 유지한다. SOAR(Volato Group)의 2026-09-11 8-K는 9-11 합병종결 및 Aligned 보유자 전환주식의 종결 후 180일 매도금지, 이사·임원의 보유 증권 처분제한을 기재한다. 산술 종료일은 2027-03-10이다. 전환주는 완전희석 기준 95%를 구성하도록 산정되나 상장·주주·수권주식 승인 조건이 있어 구체적 common share 수는 미공개이며, 두 대상자 집단은 겹칠 수 있어 합산하지 않는다. NCI(Neo-Concept International Group)의 2026-10-01 6-K는 같은 날 공모 종결 및 각 이사·임원이 보유 증권 처분을 종결 후 90일 제한하는 계약을 확인한다. 산술 종료일 2026-12-30, 개인/총 제한 주수는 미공개다. 같은 공모의 보통주 250,000주와 pre-funded warrant 기초주식 최대 1,750,000주는 내부자 lock-up과 별도 잠재공급이다. PARA(법인명 Banzai International)의 2026-09-11 8-K는 2026-09-04 매매계약일부터 임원·이사·10% 이상 주주가 보유한 주식에 90일 처분제한을 기재한다. 달력 산술 종료일은 2026-12-03이며 대상별 주수와 예외/waiver는 확인되지 않았다. DSS의 2026-09-04 424B5도 임원·이사·직원 및 10% 이상 보유자에게 공모 종결 후 60일 제한을 두며 인수인의 조기 해제권이 있으나 실제 종결·대상 수량·해제 상태는 미확인이다. 두 종목 lock-up 주수는 0으로 간주하지 않는다. CRIS의 2026-08-14 10-Q는 공모 종결을 확인하고, 424B4는 임원·이사의 60일 처분제한을 기재한다. 산술 만료일은 2026-10-13이며 10-21 현재 해당 조항은 만료됐지만 제한 대상 주수는 미공개다. CLDI 2026-09-21 공모 종결 후 임원·이사 60일 락업을 추가 확인했으며 대상 주수는 미공개다. OMEX 합병 종결 조건부 lock-up, MI 임원·이사 lock-up, GCTK CEO 관련 조건부 주식 및 lockup 참조, CDT warrant 이전 제한, EONR의 150,000주 계약상 lockup 대가, VERI 임원·이사 공모 후 90일 lock-up, FUSE의 합병대가 19,214,201주 bylaws lock-up을 SEC 원문에서 분류했다. FUSE는 1년·가격/거래 조기 종료 및 이사회 waiver가 있어 2026-10-21 현재 잔량은 미확정이고, EONR도 실제 발행/기간/현재 잔량이 미확정이다. VERI는 대상 주수와 공모 종결 미확정이며, CDT 조항은 기존 보통주 lock-up으로 보지 않는다. 초기 최근 12개월 SEC 선택 filing 4,725건 키워드 검색에서는 제한 관련 문구가 여러 issuer에 발견됐으며, 최신 분류는 하단 coverage 갱신 기록과 coverage JSON을 기준으로 한다.  138개사는 해당 검색에서 키워드가 발견되지 않았으나 제한 부재가 증명된 것은 아니다. 계약 전수 검토는 여전히 미완료다. SEC 비계열 주수는 표적 extraction 결과에 한정되며, float가 434개 전수 확인된 것은 아니다. [종목별 SEC 검색 triage](./us-common-stocks-under-1-lockup-screen-20261021.csv)

비계열 보유주수 추출 재대조에서는 선택된 SEC filing 본문 4,725건(그중 public-float 용어 hit 1,548건)에서 명시적 수량 후보 214건/90개 발행사를 찾았다. 기준일과 원문 맥락을 대조해 선택한 값은 71개사이며, 본표 반영 direct share count는 61개(SEC 직접기재 정확 60개·근사 1개), SEC fact 차감 산술값은 6개다. NCI의 비계열 2,441,952주는 2026-09-26 pre-offering 기준이고, 2026-10-01 후속 발행 이후 float는 미공개다. SXTC의 38,218,077주는 2026-05-29 및 2026-08-10 1-for-80 consolidation 전 수량이며 post-consolidation float는 미공개다. 당시 추출 결과 통계는 2026-10-21 snapshot 기준이며, 현재 보고서의 80/459 dated count와 혼용하지 않는다. 오래된 기준일·후속 발행 가능성이 있는 나머지 후보는 현재 float로 자동 승격하지 않았다. 후보 214건과 선택된 71개사는 [원문 추출 후보](../../scratch/us-under1-float-share-candidates-20261021.json), [기준일 포함 선택 결과](../../scratch/us-under1-float-shares-selected-20261021.json)에 보존한다.

## 급등주 단타 추가 필드 설계 (SEC-only 기업사실)

설계 우선순위는 잠재 공급과 이벤트 시점을 검증하는 것이다. 각 값은 accession, filing date, 기준일, 공시 문구를 연결하고 공시가 없으면 “SEC 공시에서 확인 불가” 또는 “검토 미완료”로 구분한다.

| 우선순위 | 기업별 필드 | SEC에서 수집할 사실 | 단타 분석에서의 용도 | 검증/표시 규칙 |
|---|---|---|---|---|
| P0 | Lock-up·제한주 | 계약상 대상자/주식수, 기간, 예외, waiver, tranche별 해제 일정 | 공급 증가 시점 | 내부자/기관 보유와 lock-up을 분리하고 중복 제거; 만료 후 현재 잔량 미확인은 별도 표기 |
| P0 | 잠재 희석 공급 | ATM, shelf/재매각 등록, PIPE, warrant/pre-funded warrant, 전환증권의 수량·행사가·만기·reset | 잠재 발행/매도 압력 | 등록 상한·계약 한도·실제 발행·실제 매도 완료량을 별도 수치로 기록 |
| P0 | 촉매·공시 시각 | SEC 8-K/6-K와 exhibit의 계약, 실적, 임상, 규제, 상장 사건 및 제출/발표 시각 | 급등 재료와 확인 가능 시점 | 이미 발생한 결과, 회사 확정 일정, 추정 일정을 분리; 시각대 병기 |
| P1 | 현금·자금조달 위험 | 현금, 영업현금흐름, 부채 만기, going-concern 문구, 후속 offering | 조달 필요 및 급락 위험 | 보고 기준일·기간 표시; 계산 runway는 산식과 계산값임을 표시 |
| P1 | 기업행사·티커변경·상장유지 | reverse split, ticker/name change, 법적 효력/조정 거래일, 최소호가 결함 및 회복기한 | 가격·종목식별·주식수 급변 및 상장 위험 | 확정/예정 상태 구분; 주식 수와 가격 기계조정 분리; 현지시간/KST 구별 |
| P1 | 촉매 수치의 확정도 | preliminary/unaudited 실적, 추정치 여부, close/review/audit 완료 상태와 회사의 caveat | 발표 headline과 확정 공시의 차이 | 결과 수치 자체와 회사가 밝힌 잠정 상태를 나란히 기록; 후속 10-Q/10-K로 대조 |
| P1 | 내부자·대주주 변동 | Form 4 및 13D/13G의 보유·거래 수량과 일자 | 소유 집중·공급 신호 | 보유 보고를 매도 의사나 거래가능 주수로 해석하지 않음 |
| P2 | 사업·임상·소송 조건 | SEC에 기재된 자산/단계/평가변수/환자수, 계약 조건, 소송·규제 사건 | 촉매 위험과 무효화 조건 | SEC에 없는 확률·TAM·매출 예측은 만들지 않음 |
| P2 | 공시된 거래 사실 | filing에 포함된 거래량·거래중단·회전율(해당 시) | 공시 기간 거래 맥락 | SEC 보고값만 수록. RVOL, spread, VWAP, 실시간 halt는 SEC 사실 범위 밖 |

## 선정·갱신 절차

1. 활성 프로젝트 USD common-stock universe를 추출하고 거래소·주식 유형 조건을 고정한다.
2. 최신 완료 세션 종가와 최근 30일 OHLC를 허용된 시세 출처에서 수집하고 기준일·데이터 시각을 기록한다.
3. 가격 조건 통과 종목마다 SEC CIK/ticker 매핑 및 cover/prospectus 증권 종류를 대조한다. common/ordinary 확인 종목만 본표에 포함하고 ADS/ADR·미확정 class는 별도 상태로 둔다.
4. CompanyFacts와 최근 filing의 outstanding shares, public float, 후속 발행/전환/분할을 대조한다. 서로 다른 기준일이나 XBRL 개념을 합치지 않는다.
5. 키워드 triage에서 문구가 발견된 종목을 우선순위로 SEC 원문과 Exhibit를 확인한 후, 모든 issuer의 계약·소유권 제출을 전수 조사한다. 제한주수, 예외, 만기, waiver를 추적한다. 기존 주식 처분제한, 증권법상 resale restriction, 회사 신주발행 제한을 구분하고 lock-up은 내부자/기관별 계약 의무·당초 수량·해제된 수량·기준일 현재 잔량으로 분리한다. 전체 검토가 끝나기 전 미확인은 0으로 바꾸지 않는다.
6. 모든 숫자에 SEC accession/기준일 또는 허용된 quote source/가격일을 부착하고, universe·제외·보류 개수를 보고한다.

### 가격 스냅샷 재수집 절차

- `node scratch/refresh-us-under1-price-snapshot.mjs YYYYMMDD`는 로컬 USD common-stock master를 `BEGIN READ ONLY`로 조회하고, 허용된 운영 일봉 cache를 GET으로 읽어 날짜별 JSON `scratch/us-under1-price-snapshot-YYYYMMDD.json`에 저장한다. 오늘 정규장 마감 후 완성 캔들이 제공될 때에만 해당 날짜를 지정한다.
- 스냅샷 metadata의 `asOfTradingDate`, 전체 universe coverage, 요청 실패 수를 확인한다. 기준일 캔들이 없으면 후보에서 빼더라도 전체 latest coverage를 확인하고, 실제 거래중단/자료누락 여부를 분리한다. 후보별 30일 봉 수와 OHLC 범위를 검토하고 중간 오류가 있으면 결과를 완전한 목록으로 배포하지 않는다.
- 이 수집기는 가격·30일 범위 자료를 재현 가능하게 만드는 도구다. SEC class 및 SEC 기업사실 결합·보고서 렌더링은 별도 단계이며 이를 자동 완료한 것으로 간주하지 않는다.
- 검증 기록: 2026-10-22 재수집으로 2026-10-21 완료일 전체 master 5,444/5,444 최신 캔들, $1 이하 485개, 후보 상세 485/485, 요청 실패 0을 얻었다. 기존 전체 master scan과 새 결과의 485개 모두 종가·30일 저점·고점·봉 수가 일치했다. 원시 결과는 `scratch/us-under1-price-snapshot-20261021.json`에 보존한다. 10-22 장전 현재가가 아니라는 점은 유지한다.
- 최신 조회 재확인: 2026-10-22 14:xx KST에 요청한 10-22 세션에서 cache 최신 관측 봉은 10-21이었다(5,252개). 더 오래된 봉 149개, 봉 없음 43개, 10-22 날짜 일치 0개, 요청 오류 0개였다. 따라서 10-22 후보 0개라는 필터 결과는 데이터 미도착에 따른 것이며 “모든 종목이 $1 초과”로 해석하지 않는다. 가격 보고서는 마지막 정상 완료일인 10-21 기준으로 유지한다. 진짜 10-22 거래일 마감 후 캐시 반영을 확인하고 다시 수집한다.

### 2026-10-22 SEC lock-up 추가 원문 검토

- 가격 refresh 결과 `scratch/us-under1-price-refresh-20261022.json`은 2026-10-22 세션이 아니라 2026-10-21을 최신일로 반환했다. 487개 후보 중 486개가 10-21, 1개가 10-20으로, 새 스냅샷 기준일을 만들 수 없어서 기존 10-21 가격 표를 유지했다.
- SXTC 2026-08-28 Form F-3/A는 Smart Mart의 재판매를 위해 최대 157,500,000 Class A ordinary shares를 등록한다. amended floor price $0.20 기준 $31,500,000 pre-paid purchase agreement에서 발행될 수 있는 수량이며, 2026-06-30 기준 매도주주가 이 offering 주식을 보유하지 않았다고 기재한다. 이는 현재 발행주식이나 lock-up 수량이 아니다. 등록 효력 발생과 이후 발행량은 이번 확인에서 미확인. 같은 공시는 2026-08-10 1-for-80 병합 후 Class A 약 1,321,301주 outstanding을 보고하므로 본표 원문 수작업 필드에 approximate dated count로 분리한다. 6월 비계열 38,218,077주는 병합 전이라 현재 float로 쓰지 않는다.
- ZONE 2026-09-28 Form 10-K에서 현재 holder lock-up 수량/기간을 특정하지 못했다. 2026-03-17 restricted stock award 6,860,914주는 50%가 1주년, 잔여분은 2027-06-17부터 8개 분기 가득 조건이다. 보상/vesting 노출이며 계약 lock-up이나 현재 issued/outstanding shares로 세지 않는다.
- LASE 2026-09-10 Form 424B4는 회사·임원·이사·10% 이상 주주에게 공모 종결 후 30일 제한을 기재하고, 2026-09-15 8-K는 9월 14일 종결을 확인한다. 10월 14일은 산술상 종료일이며 대상 주수와 조기 waiver는 미확인. Placement-agent warrants는 공모주 10,500,000주의 7%인 735,000개로 계산되며 해당 warrant/행사주에 별도 180일 FINRA 양도제한이 있다. 정확한 판매 개시일·현재 효력은 미확인이고 기존 보통주 잠김 수량에 넣지 않는다.
- SNTI 2026-09-24 Form 424B3는 Notes 교환으로 최대 25,555,024주 재판매 등록을 기재한다. 2026-06-30 outstanding 31,144,754주 대비 공시상 약 82.0%, 전량 교환 pro forma 56,699,778주다. 이는 잠재발행/재판매이지 locked shares가 아니다. 2022-06-08 Closing 기준 구 Investor Rights Agreement 1년 lock-up은 만료됐고, 현재 보유자별 lock-up 수량은 최근 공시에서 확인되지 않는다.
- QNME 2026-10-01 S-3/A는 향후 offering supplement에 lock-up 조건을 둘 수 있다고만 기재하며 현재 수량은 공개하지 않는다.
- 이번 회차에서 LASE·SNTI·VNTG 세 건을 추가해 현재 표적 검토는 77개 issuer, SEC 키워드 hit 대기는 219개다. SXTC·ZONE은 직전 회차에 이미 집계되어 중복 합산하지 않았다. 이는 434개 전체 계약 전수 검토 완료를 뜻하지 않는다.
### 2026-10-22 SEC 원문 lock-up/기업행사 갱신

- AIIO (Robo.ai) 2026-09-01 F-3는 QC Capital 대가로 발행된 Class B 20,491,805주 중 97%인 19,877,050주에 8년 제한을 두며, 2026-06-15 종결 4주년에 시작하는 5개 연례 tranche 해제 일정이다. Neurovia 대가 주식은 2026-05-18 종결; 총 약정 149,097,957주 중 104,097,957주 발행, 45,000,000주는 미발행. 발행분 전체 104,097,957주가 8년 제한, 최초 4년 해제 없음, 이후 5개 연례 tranche. 두 발행 lock-up 수량 합계 123,975,007주는 산술값이며, 미발행 45m는 제외한다. QC 등록효력 대기 614,755주 및 Loop Capital 6,168,705주 staged release는 trigger/현 효력 미확인이라 해당 합계에서 제외한다. Chinasky 7,388,799주 lock-up은 filing상 거래 미종결로 제외한다. 같은 10-16 supplement는 최대 22,343,750 Class B 재판매 등록 수량을 별도 기재하며, 이는 현재 발행/잠김 주수와 구별한다. Split 후 수권 Class B shares를 70,000,000에서 350,000,000으로 늘리려는 안건도 제안 상태로만 표시한다.
- AIIO의 2026-10-16 424B3/6-K는 Class A 13,817,501주 + Class B 222,116,290주 (2026-10-14 기준; 합계 235,933,791주)를 보고한다. 1-for-25 역분할은 10-26 주주총회 표결 조건부이며 11-06 9:30 a.m. ET 효력·조정거래 예정으로 기재됐으나 10-21 기준 미승인/미발효다. 본표 발행수·잠김 수량은 현재 pre-split 단위로 유지하고, split 후 수량으로 미리 환산하지 않는다.
- ISPC 2026-10-09 8-K에 따르면 Foldlab 자산인수 및 주식대가 안건은 791,600 FOR, 21,269 AGAINST로 승인됐다. 별도 역분할 안건은 표결을 마치지 않고 10-30 10:00 a.m. ET로 연기됐다. $2,500,000 주식대가는 closing 전 10거래일 VWAP로 주식 수를 정하고 closing 때 5년 escrow/no-leakout 제한에 들어간다. 10-21까지 확인한 filing에서 closing/주식발행은 확인되지 않아 현재 locked amount를 산출하지 않는다.
### DYAI: Release Date 정의에 따른 현재 lock-up과 warrant resale 분리 (2026-10-21 기준)

- 2026-08-14 Form 8-K는 공모와 동시 사모 종결 직후 보유 기준으로 이사·임원·직원·10% 이상 주주가 보유하거나 취득하는 증권에 대해 Release Date 후 90일 제한을 둔다고 기재한다. 예외 및 placement agent 동의가 적용된다.
- 동 8-K Exhibit 10.2는 Release Date를 (i) 모든 warrant shares 재판매 등록서의 SEC 효력 발생일 또는 (ii) Rule 144상 제한 없이 매도할 수 있게 된 날 중 빠른 날로 정의한다. SEC EFFECT는 관련 resale registration statement의 효력 발생일을 2026-09-21로 표시한다. 해당 날짜로부터 90일은 2026-12-20경(달력일 계산)이므로, 더 이른 Rule 144 trigger 또는 waiver가 없었다면 본표 cutoff인 10-21에는 계약 기간 중이다.
- SEC 2026-09-18 Form 424B3는 warrant 행사로 발행 가능한 common 3,625,000주를 재판매 등록하며, 9-10 현재 발행주식 40,063,703주와 전량 행사 후 43,688,703주를 제시한다. 3,625,000주는 잠재 resale/dilution supply이며 insider lock-up 주수로 세지 않는다. holder별 제한 주수, 더 빠른 Rule 144 Release Date, waiver/release는 확인되지 않아 잠김 주수는 미공개/미확인이다.
- SEC 근거: [2026-08-14 Form 8-K](https://www.sec.gov/Archives/edgar/data/1213809/000149315226038039/form8-k.htm), [Exhibit 10.2 Securities Purchase Agreement](https://www.sec.gov/Archives/edgar/data/1213809/000149315226038039/ex10-2.htm), [2026-09-21 EFFECT 기록](https://www.sec.gov/Archives/edgar/data/1213809/999999999526003013/0001213809-26-003013-index.htm), [2026-09-18 Form 424B3](https://www.sec.gov/Archives/edgar/data/1213809/000149315226043416/form424b3.htm).

### SGLY: 90일 임원·이사 lock-up, warrant 공급과 발행주식 분리 (2026-10-21 기준)

- 2026-08-24 Form 8-K는 이사·임원이 2026-08-19 lock-up agreements를 체결했고 First Offering 종결 후 90일 동안 현재 및 이후 beneficially owned common stock을 매도·처분하지 않기로 했다고 기재한다. 같은 8-K가 First Offering 종결일을 2026-08-19로 확인한다. 90일 후인 2026-11-17은 달력일 계산이며, 10-21 cutoff 현재 기재된 제한기간 중이다. 다만 대상 임원별 covered share count와 waiver/조기 해제 여부는 검토한 SEC filing에서 확인되지 않아 잠김 주수는 미확인으로 둔다.
- 같은 문서의 Second Offering 종결일은 2026-08-21이다. 각 offering 종결 후 30일의 issuer issuance/registration standstill은 회사 발행 제한이므로 기존 주주의 insider lock-up과 구분하고, 기준일 전 만료 상태로 기록한다.
- 2026-09-29 Form 10-K cover는 2026-09-28 현재 common outstanding 5,403,788주를 보고한다. 8월 공모의 pre-funded warrants는 First Offering 260,000주, Second Offering 최대 1,111,250주로 SEC에 기재돼 잠재 공급으로 추적하되 현재 발행주나 잠김 주식으로 더하지 않는다. 실제 행사 잔량과 holder별 보유량은 미확인이다.
- SEC 근거: [2026-08-24 Form 8-K](https://www.sec.gov/Archives/edgar/data/1422892/000121390026093148/ea0303205-8k_singularity.htm), [2026-09-29 Form 10-K](https://www.sec.gov/Archives/edgar/data/1422892/000121390026104650/ea0305950-10k_singularity.htm), [2026-08-21 Form 424B5](https://www.sec.gov/Archives/edgar/data/1422892/000121390026092429/ea0302988-424b5_singularity.htm).

- coverage 현재값: 123 target reviewed / 173 keyword-hit pending / 138 no-keyword-hit 중 본표 434개. 무히트는 제한 부재 증거가 아니며, 후보별 상세 상태는 [coverage JSON](../../scratch/us-under1-lockup-screen-coverage-20261021.json)과 [SEC filing triage CSV](./us-common-stocks-under-1-lockup-screen-20261021.csv)을 기준으로 한다.
### RCT: 19.3m resale registration, appeal-stayed delisting and pending reverse split (2026-10-21 cutoff)

- 2026-10-16 Form 424B3 supplement registers up to 19,335,283 ordinary shares for resale: 5,000,000 shares issued in the offering, up to 9,041,142 shares issuable on July 8, 2025 warrants, and up to 5,294,141 shares issuable on May 16, 2026 warrants. The 14,335,283 warrant shares are potential issuance; the full registered amount is not current float or confirmed sales. Actual exercise and resale balances are not established in this review.
- The same filing incorporates a Form 6-K reporting a Nasdaq staff delisting determination received October 13 because the company failed the $1 minimum bid and lacked equity to qualify for an additional 180-day period. RCT appealed on October 14, staying suspension/delisting pending a Hearings Panel hearing and decision. The filing states the shares continue normal Nasdaq trading during the stay; appeal outcome is uncertain.
- The issuer planned an October 30 shareholder vote on a reverse share consolidation and said, if approved, it was expected to take effect on/about November 13; timing could vary with the hearing. It remained a proposal at the October 21 cutoff. Track vote, ratio, legal-effective time and adjusted-trading start as separate future SEC events. The row-level SEC lock-up review is now completed for the filings checked: the general equity-plan award language supplies no current award balance or count of restricted RCT shares, and the resale quantity is not a lock-up amount. The current locked share count remains unknown, not zero; this filing review does not prove no other restriction exists.
- The latest explicit issuer-wide count found in the reviewed filings is 59,362,026 ordinary shares as of May 15, 2026. The July 31 Form 20-F/A cover repeats this count and states that the amendment replaces Item 18 financial statements without updating subsequent events. Because 2025/2026 warrant and resale activity follows and no newer issuer-wide count was found in the filings reviewed through Oct. 21, record it as a dated historical count rather than current outstanding shares. [2026 Form 20-F/A](https://www.sec.gov/Archives/edgar/data/2027360/000149315226035511/form20-fa.htm).
- SEC source: [2026-10-16 Form 424B3 and attached 6-K](https://www.sec.gov/Archives/edgar/data/2027360/000149315226047471/form424b3.htm).

## 현재 snapshot 산출물과 근거

- [2026-10-22 live quote 기준 SEC direct common 431행 보고서](./us-common-stocks-under-1-live-20261022.md), [CSV](./us-common-stocks-under-1-live-20261022.csv), 보류표 및 quote 실패 표는 당일 현재가 overlay다. quote timestamps, 30일 low/high source/date, SEC current market cap 미공개 및 dated share/float/lock-up status가 행별로 포함된다.
- [미국 보통주 $1 이하 후보 보고서](./us-common-stocks-under-1-20261021.md) 및 [CSV](./us-common-stocks-under-1-20261021.csv)
- [SEC 증권종류 감사 CSV](./us-common-stocks-under-1-sec-class-review-20261021.csv)
- 2026-10-21 일봉 기준: 전체 5,444개 조회, 485개 가격 후보, 434개 SEC 직접 보통주 확인, 30개 ADR/ADS 제외, 21개 class/ticker 보류.
- 가격 자료값은 최신 완료일 종가 $1 이하이며 intraday quote가 아니다. 현재 SEC 총 시총은 확인 불가다. 발행주수 CompanyFacts 자동 facts와 SEC 원문 수작업 합계가 구별되어야 하며 lock-up/float 값이 없는 행은 계약·소유 자료 검토 미완료 또는 공시 수량 미공개임을 구분한다. 최신 lock-up coverage JSON 기준 123개 targeted review 완료, 173개 keyword hit 원문 검토 대기, 138개 선택 검색 무히트다. 무히트는 무제한 증거로 해석하지 않는다.


















### RYDE: ATM 매도 한도 추적 사례 (2026-10-21 검토)

- 상세 희석 규모: 424B5는 2026-10-06 종가 $0.6810을 적용해 $96,399,000 전액 판매 시 신주 141,555,066주, Class A pro forma 291,604,197주를 예시한다. 실제 발행량은 체결가격·판매량에 따라 다르다. 해당 pro forma에서 제외된 3,149,770 warrant shares와 CEO milestone 달성으로 발행 가능하다고 적은 3,500,000 Class B shares도 별도 잠재공급으로 표시하며 ATM 신주 예시와 더해 확정 발행수로 취급하지 않는다. 표지 기준 Class A 150,049,131주 전부를 비계열 보유로 계산하고 Class B 30,177,175주 outstanding을 별도 보고한다.
- 2026-10-09 Form 424B5에서 회사와 Arc Group Securities 간 At The Market Offering Agreement 체결 및 최대 총 매매대금 $96,399,000의 Class A ordinary shares 판매 권한을 확인했다. 이는 등록/계약상 최대 금액이지 현재까지 발행·매도된 주식 수가 아니다. 실제 매도 주수와 누적 매매대금은 후속 SEC 공시를 통해 갱신해야 한다.
- 해당 보충설명서는 2026-10-07 기준 발행주식 150,049,131주, 모두 비계열 보유로 기재하고, 약 $145,547,657의 public-float 시가를 2026-08-16 종가 $0.97로 계산한다. 이 값은 당시 공시 기준치이며 현재 유통주/시총으로 연장하지 않는다.
- 단타 화면 설계: ATM 권한액, 실제 매도/발행 누계 주수, 최근 보고 기준일, 잔여 권한액, 에이전트 수수료율을 분리한다. 최대 한도를 float shares로 나누는 것은 오해를 부르므로 현재 공급량으로 합산하지 않는다.
- SEC 원문: [2026-10-09 Form 424B5](https://www.sec.gov/Archives/edgar/data/1971115/000149315226046527/form424b5.htm).


### CYAB: 조건부 180일 lock-up과 미확인 trigger (2026-10-21 검토)
- 2026-10-08 Form S-1은 2024-07-22 dated form lock-up을 편입하고, covered Registrable Securities의 양도 제한을 underwritten public offering final prospectus 후 180일로 정한다. 다만 현재 S-1은 resale registration이며, 검토된 자료만으로 해당 조건을 만족하는 후속 underwritten offering, 현재 유효기간, 대상 holder/주식 수를 확인하지 못했다. 따라서 현재 lock-up은 unknown이며 0주로 보지 않는다.
- 같은 S-1은 2026-03-27 business combination 시 세 key employees에게 부여한 fully vested RSUs 400,000개를 언급한다. 이는 settlement 확인 전 issued common이나 잠긴 주식으로 세지 않는다.
- SEC 원문: [2026-10-08 Form S-1](https://www.sec.gov/Archives/edgar/data/2032341/000121390026107694/ea0307932-s1_cyabra.htm).


### PLAG: ATM 희석 한도와 lock-up 분리 (2026-10-21 검토)
- 2026-10-02 Form 424B5는 ATM으로 최대 $22,539,922 gross proceeds까지 신주를 판매할 수 있도록 한다. $0.715 가정가로 환산한 31,524,367주는 prospectus의 예시이며 실제 매도/발행 수가 아니다. 회사는 직전 12개월(본 offering 제외) Form S-3 I.B.6에 따른 매도액을 $0로 공시한다.
- 같은 공시 표지의 public float는 2026-08-11 종가 $5.81을 적용한 비계열 11,638,514주, 약 $67,619,766이다. 이 과거 공시치는 현재 float가 아니다.
- Prospectus는 각 offering의 구체적 lock-up을 해당 supplement에 둘 수 있다고 설명하지만, 검토한 ATM supplement에는 lock-up 수량이 없다. ATM 판매권한과 기존주주 lock-up 수량은 별도 데이터로 유지한다.
- SEC 원문: [2026-10-02 Form 424B5](https://www.sec.gov/Archives/edgar/data/1117057/000121390026106502/ea0307339-424b5_planet.htm).


### DOGZ: 행사 발행분과 조건부 lock-up 기산점을 분리 (2026-10-21 기준)
- 2026-10-01 Form 20-F는 DITC 지분 인수 대가 warrants에서 2026-08-06 현금 행사로 보통주 3,050,000주가 발행됐다고 보고한다(행사가 $0.00001, 현금 $30.50). 이는 이미 발행된 수량으로 기록하되, 기존 outstanding과 기준일을 대조해야 한다.
- 같은 filing에 따르면 수정계약은 DITC 취득 지분을 6.735%로 줄이고 이전 완료 기한을 2026-11-06으로 정했다. 행사로 발행되는 Class A shares의 lock-up은 해당 지분의 transfer and registration 후 9개월에 종료한다. 기준일 10-21 현재 trigger 성립 여부가 filing에서 확인되지 않으므로 3,050,000주를 현재 활성 잠금 수량으로 단정하지 않고 conditional lock-up pool로 추적한다. 만기 날짜도 기산 확인 전 계산하지 않는다.
- 2026-06-30 warrant 잔액 3,240,000주에서 8-06 행사분 3,050,000주를 빼면 잔여 190,000주 산술값이지만 후속 변동 확인 전 current warrants로 표시하지 않는다. 2025년 250,000주 및 2026-04-21 60,000주 기존 행사분은 amended lock-up 대상 확인 없이 합산하지 않는다.
- SEC 원문: [2026 Form 20-F](https://www.sec.gov/Archives/edgar/data/1707303/000149315226045181/form20-f.htm).


### IPW: shelf 등록액과 실제 12개월 발행 여력 분리 (2026-10-21 기준)
- 2026-10-09 Form S-3는 common/preferred/warrants/debt/rights/units를 포함한 $50,000,000 shelf를 등록하고, 2023년 기존 shelf에서 미매각된 $43,184,022.40을 Rule 415(a)(6)로 carry-forward한다. 이 액수는 실제 발행주식이나 즉시 매각 가능 주식수가 아니다.
- 표지 기준 2026-10-08 public float는 비계열 2,767,270주, 약 $10,543,299이며 $3.81 (2026-08-11 종가)로 계산됐다. 직전 12개월 Form S-3 I.B.6 매도 누계는 약 $1,815,976이다. float가 $75m 미만인 동안 primary offering은 해당 규정의 12개월 1/3 public-float 한도를 받는다. 따라서 shelf face amount, carry-forward 미매각 등록액, 규정상 실제 판매 가능액, 실제 매도/발행 주수를 서로 다른 항목으로 기록한다.
- 이 S-3 본문 검토에서 구체적인 lock-up 조항은 확인되지 않았으나, 다른 holder agreement 부재를 뜻하지 않으므로 잠금 수량은 unknown이다.
- SEC 원문: [2026-10-09 Form S-3](https://www.sec.gov/Archives/edgar/data/1830072/000168316826007759/ipower_s3.htm).


### GCDT: 30일 OHLC 역분할 기준 통일 사례 (2026-10-21 가격창)
- SEC 2026-10-15 Form 6-K는 1-for-6 병합이 2026-10-07 효력 발생했다고 보고한다. 2026-09-22~2026-10-21 일봉 창은 병합 전·후 봉이 섞이므로 10-06까지 OHLC를 6배하고 10-07 이후는 그대로 두어 post-split basis로 맞춘다.
- 조정 결과 KIS 원시 봉 기준 30일 고점은 2026-09-23 $5.1066×6 = **$30.6396**, 저점은 2026-10-20 **$0.1610**. split 비율/효력은 SEC 사실이며, 일봉 가격과 계산 고저는 허용된 KIS 시세 및 산술 계산이다. 이는 경제적 수익률이나 병합 자체의 가격변화가 아니다.
- 자동 기준: 가격창 안의 SEC-confirmed reverse split이 있으면 event effective time 및 adjusted-trading start를 확인하고, 모든 OHLC를 동일 주식 단위로 정규화한 뒤 30일 고저를 산출한다. 시각이나 원시 가격이 불충분하면 수치 대신 미확인으로 남긴다.
- SEC 원문: [2026-10-15 Form 6-K](https://www.sec.gov/Archives/edgar/data/1926293/000149315226047165/form6-k.htm).


### SHFS·CDT: 30일 OHLC를 SEC split 기준으로 통일
- SHFS: 2026-10-01 Form 8-K의 1-for-12 split 효력시각은 2026-09-30 00:01 ET. 9-22~9-29 OHLC에 12배를 적용하고 9-30 이후는 유지해 30일 high **$25.5456 (9-22; $2.1288×12)**, low **$0.0728 (10-20)**로 post-split basis를 맞췄다.
- CDT: 2026-10-02 Form 424B3는 1-for-25 split이 2026-09-28 17:00 ET 효력 발생, 9-29 장 시작 split-adjusted trading 예정이라 기재한다. 9-22~9-28 OHLC에 25배, 9-29 이후는 유지해 high **$93.75 (9-22; $3.75×25)**, low **$0.1358 (10-21)**로 계산했다.
- 두 사례의 가격은 KIS 일봉의 산술 조정치이며, SEC는 분할비율·일정의 출처다. 이 조정은 30일 가격범위의 단위를 통일할 뿐 실제 투자수익을 나타내지 않는다.
- SEC 원문: [SHFS 8-K](https://www.sec.gov/Archives/edgar/data/1854963/000149315226045183/form8-k.htm); [CDT 424B3](https://www.sec.gov/Archives/edgar/data/1896212/000149315226045443/form424b3.htm).


### LNKS: voting control, outstanding shares, and lock-up are separate (2026-10-08 20-F)
- Form 20-F reports 1,521,351 Class A and 250,000 Class B ordinary shares issued and outstanding (aggregate 1,771,351). Class B has 20 votes per share. Controlling shareholder Man Tak Lau beneficially owns 273,318 shares (23,318 A + 250,000 B), representing 15.43% of shares and 77.03% of voting power. This ownership is not a lock-up balance.
- The 20-F mentions an IPO underwriter lock-up in general risk/transfer language, but the reviewed filing does not quantify holders, shares, expiry or current effectiveness. Locked shares therefore remain unknown. The design should keep beneficial ownership, voting control, contractual lock-up, and public float in separate fields.
- SEC source: [2026 Form 20-F](https://www.sec.gov/Archives/edgar/data/1972074/000121390026107960/ea0306192-20f_linkers.htm).


### MEGL: 내부자 lock-up과 warrant 잠재공급을 분리 (2026-09-29 424B5)
- Directors, officers, affiliates는 2026-09-28 Securities Purchase Agreement date부터 60일 동안 당시 보유 또는 이후 취득할 Class A 및 전환/행사가능 증권을 양도·처분할 수 없고, placement agent의 사전 동의/예외가 가능하다고 공시한다. 60일 산술 종료일은 2026-11-27이다. 대상자별·총 보유주수는 기재되지 않아 현재 locked shares는 unknown이다.
- 같은 등록직접공모는 Unit 2,678,572개(각각 Class A 1주+Warrant 1개)를 제시한다. Warrant는 zero-exercise option으로 Warrant당 최대 Class A 9주, 전체 최대 24,107,148주를 추가 발행할 수 있고 그 방식으로는 회사 수취금이 없다. 이는 unit에서 이미 발행되는 2,678,572주 및 insider lock-up와 분리한다. 실제 행사 전 잠재공급이며 발행주수에 더하지 않는다.
- SEC 원문: [2026-09-29 Form 424B5](https://www.sec.gov/Archives/edgar/data/1881472/000149315226044883/form424b5.htm).


### QNME: 발행주수·public float와 baby-shelf 발행한도 분리 (2026-10-01 S-3/A)
- S-3/A는 2026-10-01 기준 보통주 34,427,559주 outstanding, 그 전부를 비계열 보유로 기재한다. public-float 시장가치 약 $29,263,425는 2026-09-22 종가 $0.85 적용치다. 이 SEC 기준일을 표시하고 이후 현재 float로 연장하지 않는다.
- 등록 shelf face amount는 최대 $120,000,000이나, 당시 public float가 $75m 미만이라 Form S-3 I.B.6 baby-shelf rule에 따라 12개월 primary sale은 public float의 1/3 이하여야 한다. 기재된 float value의 1/3은 **약 $9,754,475 산술값**이고, 직전 12개월 해당 규정 매도액은 $0이라고 공시한다. 이는 실제 잔여 발행 한도 확정값이 아니라 기준일의 산술상 상한; 후속 발행/가격/적격성 변동 및 구체적 supplement를 확인해야 한다.
- S-3/A는 개별 offering의 구체적 lock-up 조건을 후속 supplement에 둔다고만 말하며 현행 lock-up 수량·만기·효력은 확인되지 않는다.
- SEC 원문: [2026-10-01 Form S-3/A](https://www.sec.gov/Archives/edgar/data/1996192/000121390026105542/ea0306815-s3a3_quanome.htm).


### RETO: warrant zero-price option의 시나리오별 최대 공급 (2026-09-25 424B5)
- Over-Allotment Closing에서 Class A 10,000,000주와 Warrant 10,000,000개를 제공하며 warrant cash strike는 $2.75, 행사 가능 기간은 즉시부터 최초 행사 1주년까지라고 공시한다.
- 각 warrant는 직전 10거래일 Low Price와 $0.50 floor 조건에 연동된 zero-price option을 갖는다. Low Price가 $0.50이고 전 warrant가 zero-price 행사하는 공시 시나리오에서는 기초 Class A 최대 90,000,000주가 발행되며 회사는 해당 행사로 현금을 받지 않는다. 이 Over-Allotment Closing 기준 10m 직접주식+최대 90m 행사주는 잠재공급이지 발행 완료분이 아니다. 초기 Closing이나 다른 financing까지 포함한 회사 전체 잠재주식 총량으로 확대하지 않는다.
- 이 424B5 검토 구간에서 holder lock-up 주수/기간은 확인되지 않아 현재 locked shares는 unknown이다. warrant 잠재 공급과 insider lock-up은 별도 필드로 관리한다.
- SEC 원문: [2026-09-25 Form 424B5](https://www.sec.gov/Archives/edgar/data/1687277/000121390026103264/ea0306662-424b5_retoeco.htm).


### FLD: sponsor founder-share staged restriction과 현재 잔량 분리 (2026-10-21 기준)
- 2025-02-14 Closing 때 sponsor founder shares 총 4,867,641주(3 tranche × 1,622,547주)가 처분제한 대상이었다. SEC 2025-02-14 8-K는 같은 날 가격조건 제한 주식 450,000주를 해제했다고 별도 보고한다. 이는 당초 제한액과 해제액이지 현재 보유·제한 잔량이 아니다.
- 첫 tranche의 고정 6개월 기간은 2025-08-14 끝났으나, $12 초과 20/30 거래일 조기 해제 여부 및 수정계약 반영은 별도 사실이다. 둘째 1,622,547주는 $15 초과 20/30 거래일 조기 해제 또는 Closing 때 $50m 이상 조달이면 1년, 미만이면 2년 조건이다. 셋째 1,622,547주는 $17 초과 20/30 거래일 조기 해제 또는 10년 기한이다. 공시상 $50m 미만 조달이면 2027-02-14까지 최대 1,000,000주 forfeiture 조건도 있다.
- 2026-10-21 현재 잠김 주수는 **미확인**. 가격 threshold별 누적 충족, Closing 조달액 조건, holder별 현재 잔여주식, forfeiture 실행을 SEC 원문만으로 대조하지 못했다. 최대 3,245,094주는 이후 두 tranche의 최초 계약상 기준 수량이며 현행 제한 수량으로 표시하지 않는다.
- SEC 근거: [2025-02-14 8-K](https://www.sec.gov/Archives/edgar/data/1889123/000121390025014354/ea0230109-8k_fold.htm), [2026-04-08 DEF 14A](https://www.sec.gov/Archives/edgar/data/1889123/000119312526147728/fld-20260408.htm), [2026-09-29 424B3](https://www.sec.gov/Archives/edgar/data/1889123/000121390026104294/ea0301910-02.htm).


### RIME: 인수 대가 lock-up과 경영진 보상주식 분리 (2026-10-21 기준)
- 2026-09-15 8-K는 Azure Energy에 보통주 4,076,312주와 Series B 우선주 22,038주를 인수대가로 발행했다고 기재한다. 동일한 8-K는 Seller가 받은 “Securities”에 6개월 lock-up 및 공매도 금지를 부과하되, 해당 증권이 유효한 등록신고서에 등록되면 더 일찍 종료한다고 적는다. 따라서 보통주 계약대상 수량 4,076,312주와 우선주 22,038주는 분리한다.
- 2026년 10월 제출 Schedule 13G는 Azure가 4,076,312주를 beneficially owned로 보고해 거래 후 보유를 확인한다. 하지만 효과적인 재매각 등록이 조기 종료 조건을 충족했는지는 검토한 자료만으로 확정하지 못해 2026-10-21 현재 활성 잠김 주수는 미확인으로 유지한다. 계약 수량은 알려져 있지만 “계약상 대상 주수”와 “현재 lock-up 효력 중인 주수”를 구별한다.
- 같은 8-K는 신임 CEO 및 COO 각각에게 2,119,542주 inducement award를 부여하고, 각각 1,059,771주는 즉시 vest, 나머지 1,059,771주는 2027-09-15 vest 예정이라고 한다. 이 중 2,119,542주는 매도자 lock-up과 다른 보상주식/vesting 상태이며 lock-up 수량에 더하지 않는다. 이는 잠재 매도공급 및 임원 보유 현황 분석 필드에 별도 보존한다.
- SEC 근거: [2026-09-15 8-K](https://www.sec.gov/Archives/edgar/data/923601/000149315226043599/form8-k.htm), [Azure Schedule 13G](https://www.sec.gov/Archives/edgar/data/923601/000215821226000002/xslSCHEDULE_13G_X02/primary_doc.xml).


### DVLT: 계약상 해제된 1,500만주와 추가 변동가격 발행 오버행 분리 (2026-10-21 기준)
- SEC 2026-08-18 8-K는 Streeterville에 Pre-Delivery Shares 15,000,000주를 실제 발행했다고 확인한다. 2026-08-18 424B5는 해당 주식이 원래 Note/Additional Note 상환 전까지 이전 제한(lock-up)이지만, **2026-09-01부터 제한 없이 일부 또는 전부 이전 가능**하다고 명시한다. 따라서 본 계약에 따른 15,000,000주 transfer restriction은 2026-10-21 기준 해제 상태이며, 실제 보유/매도 완료 주수는 미공개다. “현재 locked shares 15m”으로 기재하지 않는다.
- 같은 거래에서 Note 원금 $25,030,000, 추가 투자권 최대 $25,000,000, 추가 Pre-Delivery Shares 최대 45,000,000주가 공시됐다. 고정 전환가 $1.55 외에 원금의 상당 부분은 직전 7거래일 최저 VWAP의 92%인 변동가로 전환 가능하며 공시상 가격 floor가 없다. $4,500,000/Nasdaq Minimum Price 월별 true-up 산식 및 Reinvestment 행사 때 발행주식을 회사 outstanding의 4.99%까지 맞추는 조항도 있다. 이들은 현재 발행/locked shares가 아니라 잠재공급 및 가격연동 희석으로 분리한다. 2026-10-01 true-up 실제 발행수, 누적 전환/매도수량은 검토 SEC 자료에서 확정하지 못했다.
- 최신 SEC 10-Q cover는 2026-08-19 기준 발행주식 949,728,605주를 기재한다. 2026-08-18 424B5는 8월 17일 기준 855,781,237주, 공모 직후 870,781,237주(15m 선발행 포함)를 기재해 두 공시 간 수량 차이가 조정되지 않았다. 두 값을 한 숫자로 합치거나 조용히 하나를 덮어쓰지 않고 기준일·양식·내용을 함께 표시한다. 이후 10월 21일까지의 최신 outstanding 수는 새 cover로 확인되지 않는다.
- 단타 공급 관련 별도 SEC facts: 2026-06-30 기준 warrants outstanding 17,864,830개, 미가득 service-based stock awards 61,645,038주(후속 변동 전 기준). 각각 exercise strike/expiry, vesting 및 이후 변경 확인이 필요하며 contractual lock-up과 합산하지 않는다.
- SEC 근거: [2026-08-18 Form 8-K](https://www.sec.gov/Archives/edgar/data/1682149/000110465926098494/tm2623556d1_8k.htm), [2026-08-18 Form 424B5](https://www.sec.gov/Archives/edgar/data/1682149/000110465926098427/tm2623506-1_424b5.htm), [2026-08-19 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1682149/000162828026058013/dvlt-20260630.htm).

### BGL: 사업결합 주식의 단계별 lock-up (2026-10-21 기준)

- SEC 2026-05-21 Form F-1/A는 2025-06-25 사업결합 직후 Class A ordinary shares 32,818,077주를 구성별로 보고한다: 비상환 PC4 주식 8,750,186주, 우선주 전환 12,185,000주, working-capital agreement 432,891주, BC2 11,450,000주.
- 같은 공시가 Restricted Shares를 사업결합 발행주식 중 비상환 PC4 주식과 이미 해제된 Restricted Shares를 뺀 주식으로 정의한다. 따라서 최초 제한 대상 24,067,891주는 `12,185,000 + 432,891 + 11,450,000`의 SEC 수치 산술합이다.
- 정관은 등록 시 최초 5%를 해제하고, 이후 월별 5%는 해당 월의 지정 거래일 중 20일 이상 VWAP가 $10 초과인 경우 해제한다. 잔여분은 VWAP가 90일 중 60일 $20 초과, 사업결합 2주년(2027-06-25 산술), 또는 이사회 재량 해제 중 먼저 충족될 때 풀릴 수 있다.
- SEC 공시에서 2026-10-21 기준으로 실제 해제된 물량이나 현재 보유자별 잔량을 확인하지 못했다. 따라서 24,067,891주는 최초 계약 대상량일 뿐이며 현재 잠김 주수는 미확인이다. 가격 임계값을 충족했는지 별도 비SEC 시세로 판단해 현재 locked balance를 추정하지 않았다.
- SEC 원문: [2026-05-21 Form F-1/A](https://www.sec.gov/Archives/edgar/data/2019435/000121390026059736/ea0291610-f1a1_bluegold.htm).

### SHFS: 인수대가 earnout 주식은 보유자 lock-up과 분리 (2026-10-21 기준)

- SEC 2026-04-15 Form 10-K는 2025-12-19 420 IT Solutions 자산 인수 종결 시 common stock 125,000주를 earnout 대가로 발행했다고 명시한다. 해당 주식은 수취인 420 IT Solutions를 위해 회사 또는 transfer agent가 보유하고, 2026-01-01~2027-12-31 실적 조건에 따라 vesting한다. 미가득분은 양도제한 및 forfeiture 대상이다.
- 최초 수량 125,000주는 확인되지만 2026-10-21 현재의 vest/unvested 잔량은 공시에서 분리 보고되지 않았다. 이는 내부자/기관의 계약상 lock-up과 다른 제한성 earnout 공급이므로 잠김 주수로 합산하지 않고 별도 노출로 표시한다.
- SEC 원문: [2026-04-15 Form 10-K](https://www.sec.gov/Archives/edgar/data/1854963/000149315226016778/form10-k.htm).

#### SHFS 최신 상장유지 공시 및 단타 리스크 필드

- SHFS의 2026-10-20 Form 8-K는 Nasdaq이 최소 bid price $1.00 미달에 대해 추가 180 calendar days, 즉 2027-04-19까지 시정기간을 부여했다고 보고한다. 10거래일 연속 종가 bid가 $1.00 이상이면 준수 회복으로 처리할 수 있고, 회사는 필요하면 reverse split을 고려한다고 밝혔다.
- 단타 설계에서는 listing_compliance_status, minimum_bid_price, consecutive_business_days_required, cure_deadline, reverse_split_status로 저장한다. “필요하면 시행 가능”은 승인 또는 확정 split 일정이 아니므로 event state는 company_considering_if_needed; 효력/조정 거래 개시일은 아직 미공개로 둔다.
- SEC 원문: [2026-10-20 Form 8-K](https://www.sec.gov/Archives/edgar/data/1854963/000149315226047774/form8-k.htm). 현재 가격 및 30일 OHLC 값은 이 listing notice의 공시내용으로 대체하지 않는다.

### FAMI: 공모 lock-up 만료와 대상 수량 미공개 (2026-10-21 기준)

- SEC 2026-06-29 Form 424B5는 임원·이사·보통주 10% 이상 주주가 공모 종결 후 60일 동안 주식 및 기초증권을 처분하지 않기로 한 lock-up을 기재한다. 예외가 있고 underwriter가 서면 동의로 조기 해제할 수 있다.
- SEC 2026-07-06 Form 6-K는 공모가 2026-06-30 종결됐다고 보고한다. 따라서 계약상 60일 제한은 2026-08-29경 종료(60 calendar days 산술)되어 2026-10-21 cutoff 이전이다. 대상 주주별 수량과 기간 중 waiver 여부는 확인되지 않았다. 이 공모 약정의 만료만 표시하며 다른 제한까지 없다고 판정하지 않는다.
- SEC 근거: [2026-06-29 Form 424B5](https://www.sec.gov/Archives/edgar/data/1701261/000147793226004094/fami_424b5.htm), [2026-07-06 Form 6-K](https://www.sec.gov/Archives/edgar/data/1701261/000147793226004205/fami_6k.htm).

### SURG: 공모 lock-up 만료와 placement-agent warrant 구분 (2026-10-21 기준)

- SEC 2026-01-22 Form 424B5는 회사가 underwriter 동의 없이 일정 자본증권을 처분·등록·발행하지 못하는 180일 issuer lock-up과, 임원·이사·5% 이상 주주의 common stock/등가증권 처분 제한 180일 약정을 기재한다. 예외 및 underwriter consent가 있다.
- SEC 2026-06-30 Form 10-Q는 2,000,000주 공모의 종결일이 2026-01-22라고 확인한다. 180일 기한은 2026-07-21경 종료(달력일 계산), cutoff 전에 만료됐다. 대상 holder 주수와 조기 release는 공시에서 확인되지 않아 unknown으로 둔다.
- Underwriter에 부여된 60,000개 warrant($1.38 exercise price)는 별도이며, warrants/행사주 양도는 commencement of sales부터 FINRA 180일 제한을 받는다. holder common-stock lock-up과 합산하지 않는다.
- SEC 근거: [2026-01-22 Form 424B5](https://www.sec.gov/Archives/edgar/data/1392694/000149315226003210/form424b5.htm), [2026-06-30 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1392694/000149315226039250/form10-q.htm).

### VIVS: 90일 lock-up의 기산점은 최종 tranche 종결일 (2026-10-21 기준)

- SEC 2026-04-02 Form 424B4는 회사·임원·이사·10% 이상 주주가 offering의 마지막 tranche 종결 후 90일 동안 처분/hedge하지 않는 약정을 제시하며 placement agent의 waiver가 가능하다고 한다.
- SEC 2026-04-03 Form 8-K는 initial tranche가 2026-04-01 종결되어 common 286,557주 및 pre-funded warrants 2,345,022개가 발행됐다고 확인한다. 두 번째 tranche는 initial close 30일 후 특정 가격·거래대금 조건을 만족해야 가능했고, prospectus상 offering term은 2026-04-30까지였다. 2026-06-30 10-Q는 initial offering 및 후속 warrant 내역을 기재하지만 second-tranche close 또는 최종 종료일을 특정하지 않는다.
- 그러므로 90일의 최종 기산일·만료일과 대상 holder 주수는 미확인이다. 286,557주는 initial issuance이지 lock-up-covered shares가 아니다. 확정되지 않은 tranche completion이나 가격 조건을 추정하지 않는다.
- SEC 근거: [2026-04-02 Form 424B4](https://www.sec.gov/Archives/edgar/data/1497253/000121390026039307/ea0284536-424b4_vivosim.htm), [2026-04-03 Form 8-K](https://www.sec.gov/Archives/edgar/data/1497253/000119312526142106/vivs-20260331.htm), [2026-08 Form 10-Q for June 30](https://www.sec.gov/Archives/edgar/data/1497253/000119312526346820/vivs-20260630.htm).

### HDRN: merger lock-up, price-release trigger와 resale 등록 분리 (2026-10-21 기준)

- SEC 2026-05-22 사업결합 종결로 Lock-Up Agreement의 기산일이 발생했다. May 22 agreement는 해당 Lock-Up Parties가 closing 직후 보유하는 GigCapital7 securities의 처분을 제한한다. 제한은 (a) closing 6개월 후인 2026-11-22경, (b) closing 90일 이후 시작하는 연속 30거래일 중 20일 이상 보통주 종가 $11.50 이상, 또는 (c) qualifying liquidation/merger/exchange 중 먼저 발생할 때 종료된다.
- 2026-09-15 Form 424B3는 일부 주주가 agreement 대상임과 up to 57,432,395 shares of common stock resale 등록을 공개하지만, resale 등록 총량은 lock-up 대상 주수와 같지 않다. 현재 covered holder별 주수와 조기 가격 trigger 발생은 SEC 자료에서 확정되지 않아 현재 locked shares는 미확인이다.
- 2026-08-14 Form 10-Q cover의 outstanding 71,498,842 shares (2026-08-10)와 balance sheet의 70,220,020 issued and outstanding (2026-06-30)는 기준일·개념이 달라 각각 보존한다.
- SEC 근거: [Lock-Up Agreement, May 22, 2026](https://www.sec.gov/Archives/edgar/data/2023730/000119312526242343/d23892dex102.htm), [2026-09-15 Form 424B3](https://www.sec.gov/Archives/edgar/data/2023730/000119312526352470/hdrn_424b3_q2_2026.htm), [2026-08-14 Form 10-Q](https://www.sec.gov/Archives/edgar/data/2023730/000119312526346814/hdrn-20260630.htm), [2026-05-28 Form 8-K closing disclosure](https://www.sec.gov/Archives/edgar/data/2023730/000119312526249151/d26249d8k.htm).

### ORBS: 디지털자산 lock-up과 common-stock lock-up 구분, warrant 공급 및 charter 안건 (2026-10-21 기준)

- 2026-08-26 Form S-3는 Worldcoin Tower Warrants 9,917,844개와 행사 시 발행 가능한 common 9,917,844주를 등록했다. SEC EFFECT 통지의 효력 시각은 2026-09-11 9:00 a.m.이다. 행사가는 USD 1.752이며, S-3 기준 해당 warrants는 미행사 잔량으로 기재됐지만 10-21 현재 실제 행사·매도 수량은 확인되지 않는다. 이 수량은 잠김 보통주나 현재 발행주가 아니라 잠재 발행·재판매 overhang으로 별도 관리한다.
- 같은 S-3의 5년 lock-up은 Tools for Humanity의 WLD digital token 배포 일정(2023년 7월~2028년 7월)이다. ORBS common shares lock-up으로 집계하지 않는다. 비상장 포트폴리오 회사 지분에 대한 양도제한도 발행사 자기주식의 lock-up과 구분한다. S-3와 2026-10-16 PRE 14A에서 현재 ORBS common lock-up 수량을 확인하지 못해 미확인으로 유지한다.
- 2026-10-16 PRE 14A는 2026-12-11 주주총회에서 발행가능 common stock 총량을 500,000,000,000주로 늘리는 안건을 제안한다. 승인 결과 및 실제 증자/발행은 별도 SEC filing으로 확인해야 한다. 2026-10-08 8-K는 2026-09-24~10-07 10거래일 종가 bid가 모두 최소 USD 1.00여서 Nasdaq 최소 bid 요건을 회복했다고 보고한다. 본 리스트의 10-21 close USD 0.8011은 그 후속 가격이며, 자체로 새 위반 통지를 의미하지 않는다.
- SEC 근거: [2026-08-26 Form S-3](https://www.sec.gov/Archives/edgar/data/1892492/000149315226040277/forms-3.htm), [2026-09-11 EFFECT](https://www.sec.gov/Archives/edgar/data/1892492/999999999526002950/xslEFFECTX01/primary_doc.xml), [2026-10-16 PRE 14A](https://www.sec.gov/Archives/edgar/data/1892492/000149315226047445/formpre14a.htm), [2026-10-08 Form 8-K](https://www.sec.gov/Archives/edgar/data/1892492/000149315226046741/form8-k.htm).

### CPHI: 90일 lock-up 기한이 리스트 기준일과 겹침 (2026-10-21 기준)

- 2026-07-23 Form 424B5는 임원·이사·5% 이상 주주가 offering 최종 종결 후 90일 동안 주식 및 주식연계증권을 처분하지 않는 약정을 공개하며 customary exceptions를 둔다. 대상자별 보유·잠김 수량은 밝히지 않는다.
- 2026-08-14 Form 10-Q는 2026-07-23에 2,500,000주를 발행하고 순 proceeds USD 4,425,000을 받았다고 보고한다. 그러나 final closing date를 별도 기재하지 않는다. 7월 23일로부터 90일은 2026-10-21에 해당해 list cutoff와 날짜 계산상 겹치므로, cutoff 시각의 계약 효력·잔여 locked shares는 미확인이다. 발행된 2,500,000주는 lock-up 대상 수량으로 간주하지 않는다.
- 같은 424B5의 회사 자체 90일 issuance/registration standstill은 기존 주주의 매도제한과 별도 covenant다. holder lock-up, issuer standstill, 실제 발행 수량을 별도 필드로 관리한다.
- SEC 근거: [2026-07-23 Form 424B5](https://www.sec.gov/Archives/edgar/data/1106644/000121390026080581/ea0298951-424b5_china.htm), [2026-08-14 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1106644/000121390026090173/ea0301830-10q_china.htm).

### FMST: offering commencement is the lock-up trigger (2026-10-21 기준)

- 2026-08-14 POS AM은 회사 3개월, directors/officers 6개월(이사 1명은 3개월), 5% 이상 주주 3개월 처분제한을 offering sale commencement부터 적용한다고 한다. 예외 및 대표주관사 동의 조항이 있다. 대상별 보유주수는 공시되지 않는다.
- SEC EFFECT 기록은 등록서가 2026-09-14 효력 발생했다고 밝힌다. 하지만 2026-10-21까지 검토한 SEC 제출물에서 final prospectus나 offering sale commencement/closing 확인은 찾지 못했다. 따라서 약정의 기산일 및 현재 효력은 미확인이고 잠김 수량도 unknown이며 0으로 간주하지 않는다.
- 같은 POS AM은 800,000 unit offering(각 common 또는 pre-funded warrant 1개와 common purchase warrant 1개), regular warrant 행사 가격 USD 6.25, pre-funded warrant USD 0.01 및 45일 동안 최대 120,000 unit 초과배정 옵션을 제시한다. 실제 매각·배정·행사 주수는 확인 전까지 현재 발행주·잠김 수량과 합산하지 않고 잠재 공급으로 별도 관리한다.
- SEC 근거: [2026-08-14 POS AM](https://www.sec.gov/Archives/edgar/data/1935418/000117184326005552/posam_070726.htm), [2026-09-14 EFFECT](https://www.sec.gov/Archives/edgar/data/1935418/999999999526002958/xslEFFECTX01/primary_doc.xml).

### WHLR: 소유제한/전환제한은 lock-up 주수와 분리

- 2026-09-11 Form 424B3는 Joseph Stilwell 계열의 Series B 우선주 최대 710,466주를 재판매 등록한다. 이는 보통주가 아니며, 현재 유통 또는 보통주 lock-up 수량으로 계산하지 않는다.
- 같은 공시는 Stilwell Investors가 전환사채를 보통주로 전환해 의결권 common equity 50% 이상을 보유하게 되는 경우 전환하지 않기로 한 계약 제한을 2028-12-07까지 연장했다고 설명한다. 이는 전환/지배권 임계 제한이지 기존 common 주식의 매도 lock-up이 아니다. 대상 보통주 lock-up 주수는 이 공시에서 산출할 수 없어 unknown으로 유지한다.
- 424B3에서 수차례 역분할 및 추가 월간 역분할 가능성도 설명한다. 현행 주식수·float는 split-aware 최신 보고서 대사가 필요하다.
- SEC 근거: [2026-09-11 Form 424B3](https://www.sec.gov/Archives/edgar/data/1527541/000121390026099192/ea0304993-424b3_wheeler.htm).

### CNEY: 20-F/A의 주식 기준일과 lock-up 검색 결과

- 2026-09-10 20-F/A 표지는 2025-09-30 기준 Class A 4,988,337주와 Class B 635,419주를 보고한다. 이는 2026년 현재 발행주식 수가 아니며, 후속 발행·기업행위 조정 전 현재치로 사용하지 않는다.
- 공시 본문에서 lock-up/escrow 제한은 위험요인 설명으로 일반 언급되지만, 이번 표적 검토에서는 특정 보유자·수량·현재 release schedule 계약을 확인하지 못했다. lock-up 수량은 0이 아니라 미확인으로 유지한다.
- SEC 근거: [2026-09-10 Form 20-F/A](https://www.sec.gov/Archives/edgar/data/1780785/000147793226005520/cney_20fa.htm).












### MTEN: 60일 계약상 lock-up과 warrant/FINRA 제한 구분 (2026-10-21 기준)

- 2026-08-20 Form 424B3는 이사·임원·일부 주주가 60일 lock-up에 동의했다고 설명하지만 holder별 대상 주수는 공개하지 않는다. 공모는 2026-06-18 종결됐으므로 60일은 10-21 기준일 전에 달력상 만료됐을 것으로 계산된다. 연장 여부는 이번 검토에서 확인되지 않아 현재 활성 lock-up 주수는 미확인으로 유지한다.
- 같은 filing의 PIPE ordinary shares 최대 2,280,000주는 이미 발행된 것으로 기재된다. 투자자 warrant underlying 1,480,000주(.00 행사)와 placement-agent warrant underlying 최대 111,000주(.40 행사)는 잠재발행으로 분리한다. placement agent 및 underlying shares의 별도 FINRA 180일 제한은 종결일 기산 시 2026-12-15경 만료되는 산술치이며, 기존 common shares의 holder lock-up 수량으로 합산하지 않는다.
- SEC 근거: [2026-08-20 Form 424B3](https://www.sec.gov/Archives/edgar/data/1948099/000121390026092130/ea0302610-424b3_mingteng.htm).

### 2026-10-23 원문 outstanding share count 추가 대조

- GPUS 2026-06-30 10-Q balance sheet: Class A 581,452,367 + Class B 23,894,757 = 605,347,124주(산술). 같은 filing은 Q2 2026 ATM으로 Class A 약 126.2m주 매도했다고 보고하며, 이후 current count는 미확인으로 날짜를 보존한다.
- TCRX 2026-08-12 10-Q cover: 2026-08-07 voting common 63,502,667 + non-voting common 4,276,588 = 67,779,255주(산술).
- MBIO 2026-08-05 10-Q cover: 2026-08-03 Class A common 845,385 + common 6,732,121 = 7,577,506주(산술). balance sheet의 6/30 common 6,732,120과 cover의 8/3 수량 차이 1주를 기록했다.
- ZEO 2026-10-14 424B3는 9/30 Class A 46,516,341주와 Class V 17,080,000주를 분리 기재한다. Class V는 보통주 클래스로 표기되나 transfer/OpCo exchange 조건이 별도이고 prospectus의 offered securities 수량이 두 클래스와 잠재 전환분을 섞으므로 본표의 단일 발행수 총수로 합산하지 않았다. Class A만 별도 기준일 값으로 사용 여부는 데이터 모델 확장 후 결정하고 현재 합계는 미확인.

SEC sources: [GPUS 10-Q](https://www.sec.gov/Archives/edgar/data/896493/000121465926010549/hd81126810q.htm); [TCRX 10-Q](https://www.sec.gov/Archives/edgar/data/1783328/000119312526345749/tcrx-20260630.htm); [MBIO 10-Q](https://www.sec.gov/Archives/edgar/data/1680048/000110465926091061/tmb-20260630x10q.htm); [ZEO 424B3](https://www.sec.gov/Archives/edgar/data/1865506/000121390026109484/ea0308416-424b3_zeo.htm).

### 2026-10-23 진행 기준 재대조

### SLXN: 기존 제한과 30일 공모 lock-up 만료 확인 (2026-10-21 cutoff)

- 2026-08-11 Form 424B4는 2024년 amended registration rights/lock-up agreement의 기간이 prospectus date까지 모두 만료됐다고 명시한다. 신규 offering에서는 발행사·자회사·임원·이사에게 offering close 후 30일 제한이 별도로 적용되고 placement agent가 waiver할 수 있다.
- 2026-08-14 제출 10-Q는 offering이 2026-08-13 종결됐다고 확인하고, cover는 2026-08-13 기준 5,560,256주 outstanding을 보고한다. 신규 30일 제한은 cutoff 전에 종료됐으므로 확인된 두 계약의 현재 잠김 수량은 0주다. 제한 기간 중 대상자별 주수는 공개되지 않았고 다른 holder 계약을 모두 대조하지 않았으므로, 이를 회사 전체 주주가 전혀 제한받지 않는다는 뜻으로 확대하지 않는다.
- 같은 offering의 3,846,161 ordinary shares, 1,817,542 pre-funded warrant underlyings 및 269,231 placement-agent warrants와 최대 5,932,934 warrant-underlying shares 등록은 잠재 공급·재판매 수량이다. 현재 발행주수나 lock-up 주수에 합산하지 않는다.
- SEC 근거: [2026-08-11 Form 424B4](https://www.sec.gov/Archives/edgar/data/2022416/000117891326004116/zk2635948.htm), [2026-08-14 Form 10-Q](https://www.sec.gov/Archives/edgar/data/2022416/000117891326004138/zk2635847.htm).

이전 live 산출물 [2026-10-23 KST 표](./us-common-stocks-under-1-live-20261023-current.md)는 SEC class 본표 467행이며, SEC primary filing 원문 outstanding count 405행, non-affiliate share count 79행, SEC lock-up 표적검토 139행이다. 가격관측은 2026-10-22 17:33 EDT~10-23 02:39 EDT 사이의 장후/익일 새벽 KIS `output.last`; 30일 범위(2026-09-23~10-22)는 459행 완전, 8행 부분 coverage다. 5,444개 universe 중 fresh price 5,405개, HTTP 200/rt_cd=0이나 유효 가격 필드가 없는 39개(재시도 회수 0), raw under-$1 516개이며 보통주 분류 미확인 48개는 보류했다. 이전 434행/가격 2026-10-21 집계는 역사 snapshot으로만 유효하다.

### INLF: 2026-10-19 발행주수와 10월 공모 공급 분리

- 2026-10-20 제출 Form 424B5의 ordinary shares 설명은 prospectus supplement 일자인 2026-10-19 기준 Class A 1,046,390주와 Class B 43,908주가 발행·유통 중이라고 적는다. 총 1,090,298주는 두 클래스 합산 산술값이다. 본표의 기존 2025 DEI/GAAP 사실을 대체하지 않고, 기준일 있는 최근 원문 수작업 확인 열에 별도로 표시한다.
- 같은 공모에서 제시한 최대 435,000 Class A 주식, 최대 1,908,750 pre-funded warrant 주식 및 기타 Series A/B/C warrant 관련 잠재주식은 실제 발행된 outstanding에 포함하지 않는다. filing의 일부 pro forma 표는 pre-funded warrant 전량 행사 가정치이므로 실제 발행 수와 구분한다.
- 2026-02-08 SPA 투자자에게 약정된 6개월 제한은 2026-08-08경 만료 계산치다. 별도의 2026년 10월 공모는 closing 후 임원·이사 lock-up 90일을 제시하지만, 2026-10-21 cutoff에서 closing 및 대상 주수는 확인되지 않았다. 따라서 새 lock-up 수량은 미확인 상태로 둔다.
- SEC 근거: [2026-10-20 Form 424B5](https://www.sec.gov/Archives/edgar/data/1991592/000121390026110849/ea0307139-424b5_inlif.htm).

### CJMB: ELOC 발행분과 미사용 등록 한도 구분

- 2026-10-20 제출 POS AM은 2026-10-16 기준 common stock 7,005,862주가 issued and outstanding이라고 기재한다.
- 같은 filing의 ELOC resale 등록 한도는 6,000,000주이며 2,343,543주는 filing 시점까지 발행, 3,656,457주는 잔여 facility 한도다. 잔여 한도는 현재 발행주수로 합산하지 않는다. 10,662,319주는 6,000,000주 전부 매도 가정의 post-offering 수치다.
- lock-up 대상 주수와 현재 float는 이 확인만으로 확정하지 않는다. ELOC issuance facility의 잔여 한도와 resale registration은 holder lock-up이 아니다.
- SEC 근거: [2026-10-20 POS AM](https://www.sec.gov/Archives/edgar/data/2032545/000149315226047728/formposam.htm).

### ACTU: outstanding 기준일과 예비 공모 물량 분리

- 2026-10-19 제출 S-1/A는 2026-06-30 기준 common shares outstanding 24,013,577주를 사용한다. 기준일을 보존하며 이후 ATM 또는 기타 발행은 이 값에 자동 반영하지 않는다.
- 같은 preliminary prospectus는 40,000,000 common-share tranche를 제안하고, 그중 일부를 최대 40,000,000주 underlying pre-funded warrant로 대체할 수 있다고 설명한다. 이 둘은 서로 대체 관계다. 별도 purchase warrant underlying 20,000,000주와 underwriter option의 6,000,000주/3,000,000 warrant underlying도 제안·잠재 공급으로 분리한다.
- lock-up은 issuer와 나머지 임원·이사의 120일 제한, Bios/Kairos entities와 managing persons의 2년 제한이 공모 종결 조건으로 기재돼 있다. 집단 보유는 약 50%라고만 기재되어 대상 기존주식의 정확한 주수는 미공개이며, 10-21 기준 공모 종결일도 확인되지 않아 현재 활성 lock-up 주수는 unknown이다. Bios/Kairos에 종결 시 발행하기로 한 3,000,000 및 700,000 warrant 기초주와 underwriter 180일 FINRA 제한은 각각 별도 잠재공급/제한으로 기록한다.
- 이 filing은 preliminary이며 주당 제안 가격과 closing이 확정되지 않았다. 잠재 공급량만으로 실제 발행이나 매도를 단정하지 않는다.
- SEC 근거: [2026-10-19 Form S-1/A](https://www.sec.gov/Archives/edgar/data/1652935/000168316826007941/actuate_s1a.htm).

### MDXH: 실제 공모 발행분과 현재 계약상 lock-up 구분

- 2026-08-13 Form 6-K는 registered direct offering 종결 및 총 95,417,382 ordinary shares post-offering을 보고한다. 새로 발행된 44,052,862주는 총수에 이미 포함된 수량이며 재가산하지 않는다.
- 같은 6-K Exhibit 10.1 SPA/Lock-up form은 구매자가 취득한 Purchased Shares를 계약상 제한하고, lock-up period가 2026-08-11 SPA 날짜로부터 90일 후인 2026-11-09까지(그 날짜 포함)라고 정한다. 따라서 2026-10-21 cutoff의 계약 대상은 44,052,862주이며 명시된 기간 안이다. 현 transfer-agent 잔량과 waiver/release는 별도 확인되지 않아 계약대상 수량과 실제 현 locked balance를 같은 사실로 취급하지 않는다.
- SEC 근거: [2026-08-13 Form 6-K](https://www.sec.gov/Archives/edgar/data/1872529/000121390026089082/ea0301894-6k_mdxhealth.htm), [Exhibit 10.1 SPA 및 lock-up form](https://www.sec.gov/Archives/edgar/data/1872529/000121390026089082/ea030189401ex10-1.htm).

### GCTK: 임원 lock-up 수량과 공모·pre-funded warrant 공급 분리 (2026-10-21 기준)

- 2026-09-24 Form 8-K는 이사·임원이 최종 prospectus 제출 후 90일 동안, 제한적 예외 및 placement agent의 사전 서면동의 조건으로 보유·향후 취득 증권을 처분하지 않기로 했다고 보고한다. 대상자별 현재 보유주수/제한주수는 공시에서 별도 특정하지 않는다. prospectus 날짜를 기준으로 한 산술 종료일은 2026-12-23이며 10-21 기준 기간 중이다.
- 같은 8-K는 발행사가 공모 종결 후 6개월 동안 common/equivalent 발행과 등록신고서 제출을 제한하는 별도 covenant를 둔다고 설명한다. 이는 기존 주식 holder lock-up과 다른 조항이다. 2026-09-28 8-K는 9-25 registered direct offering 종결과 Bridge Notes 전액 상환을 언급한다.
- 2026-09-24 424B5는 9-23 기준 common outstanding 848,629주, non-affiliate 807,325주를 보고한다. 이 발행주수는 공모 종결 전 기준이다. 공모는 169,388주와 1,350,220주까지의 pre-funded warrants를 포함하며, warrant shares는 실제 행사 전 발행주수로 보지 않는다. 최신 post-close outstanding은 검토한 filing에서 확인되지 않았다.
- SEC 근거: [2026-09-24 Form 8-K](https://www.sec.gov/Archives/edgar/data/1506983/000149315226044182/form8-k.htm); [2026-09-28 Form 8-K](https://www.sec.gov/Archives/edgar/data/1506983/000149315226044657/form8-k.htm); [2026-09-24 Form 424B5](https://www.sec.gov/Archives/edgar/data/1506983/000149315226044192/form424b5.htm).

### 2026-10-23 운영 가격 스냅샷 재조회 및 FFAI SEC shares 대조

- 운영 read-only GET 재실행 시각: 2026-10-22 16:54:04 UTC (2026-10-23 01:54:04 KST). 최신 완료 candle date는 여전히 2026-10-21, 5,252/5,444 master rows. Snapshot/detail API errors 0; latest-date candle 없는 192개와 오래된 under- 23개는 따로 표시했다. 가격 후보 485개, SEC direct common/ordinary 확인 본표 434개. 30일 창은 2026-09-22~2026-10-21이며 각 행 18개 이상 candle.
- FFAI 2026-09-18 Form S-3/A는 2026-09-14 기준 Class A 6,126,954주, Class B 45주를 보고한다. 본표 수작업 outstanding은 합계 산술 6,126,999주로 날짜·클래스 표시; 후속 발행이 10-21까지 없었다는 뜻은 아니다.
- SEC 기준 현재 market cap 0/434 확인 가능; quoteSnapshot 관측치는 485개 후보에서 2026-10-18 18:46:30~19:13:17 UTC에 수집된 값으로, 10-22 재검증 시점에는 오래된 값이었다. 본표는 최신 완료 10-21 일봉 종가만 가격으로 사용하며 장중 current quote라고 표시하지 않는다.

SEC source: [FFAI 2026-09-18 Form S-3/A](https://www.sec.gov/Archives/edgar/data/1805521/000121390026101559/ea0305988-s3a1_faraday.htm).

### LOOP: 10-Q 기준 최신 발행주식 및 유동성/계속기업 위험 (2026-10-23 검토)

- 2026-10-15 제출 Form 10-Q 표지에는 2026-10-15 현재 common stock outstanding 48,812,574주가 기재되어 있고, 2026-08-31 재무상태표도 같은 발행·유통주식 수를 보고한다. 본표의 원문 수작업 확인 값으로 기록하며 10-15 이후 변동을 의미하지 않는다.
- 같은 10-Q는 2026-08-31 현금 및 현금성자산 $836,000, 6개월 영업활동 현금유출 $2,394,000, 순손실 $6,372,000을 보고한다. 단위는 별도 표시가 없는 한 $000이다. 이후 사건으로 2026-10-13 현금 $757,000 및 신용한도 가용액 $629,000을 기재하고, 다음 12개월 자금이 충분하지 않으며 substantial doubt를 설명한다. 단타 촉매/위험 설계에는 자금조달 의존도, 계속기업 불확실성, 후속 ATM/주식 발행을 포함한다. 해당 수치는 공시 당시 재무정보이지 오늘의 현금 잔액이나 런웨이 계산치가 아니다.
- float와 holder lock-up 수량은 이 10-Q의 위 주식수만으로 추정하지 않는다. 현재 시총도 SEC 직접 공시 사실로 대체하지 않는다.
- SEC 근거: [2026-10-15 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1504678/000143774926032746/loop20260831_10q.htm).

### RCT: equity-plan award restrictions과 lock-up 주수 분리 (2026-10-21 cutoff)

- 2026-03-26 Form F-1의 2024 equity incentive plan은 restricted shares/RSUs가 vesting, forfeiture, transfer 조건에 따를 수 있다고 설명하지만, 현재 award 잔액이나 제한 대상 RCT 주수는 기재하지 않는다.
- 2026-10-16 Form 424B3의 resale 등록은 offering 때 발행한 5,000,000주와 과거 warrant 기초 최대 14,335,283주를 포함한다. 이는 lock-up 수량 또는 현재 매도 잔량이 아니다.
- 검토한 두 문서에서는 현재 RCT ordinary shares에 대한 보유자별 lock-up 수량/기간을 확인하지 못했다. 수량은 0이 아니라 미확인으로 둔다. 다른 계약이 없다는 결론도 아니다. lock-up 표적 검토 대상 119개에서 120개로 갱신한다.
- SEC 근거: [2026-03-26 Form F-1](https://www.sec.gov/Archives/edgar/data/2027360/000149315226012732/formf-1.htm), [2026-10-16 Form 424B3](https://www.sec.gov/Archives/edgar/data/2027360/000149315226047471/form424b3.htm).

### ICON: 현재 outstanding, 비유통 treasury, 조건부 제한주 배당 분리 (2026-10-21 cutoff)

- 2026-08-14 Form 424B3에 편입된 같은 날 6-K의 Management's Discussion는 discussion 발행일 현재 3,870,396 common shares issued, 그중 treasury 248,563주, outstanding 3,621,833주를 보고한다. 2026-06-30 balance sheet의 outstanding 3,759,314주보다 날짜상 최신인 8-14 수치를 본표에 사용한다. 10월 14일까지 검토된 후속 공시는 commercial updates이며 이 주수를 롤포워드하지 않는다.
- 8-14 424B3 Exhibit 10.2 Limited Waiver는 2026-12-31까지 $1,500,000 상당 common share restricted dividend를 선언·지급하기로 약정한다. share quantity는 선언 직전 5거래일 정규장 VWAP으로 계산되므로 현 시점 exact share 수는 고정되지 않았다. 발행될 경우 그 발행일부터 180일 처분 제한이 시작된다. 2026-10-21 cutoff까지 이 dividend가 실제 선언·발행됐다는 근거를 확인하지 못했으므로 현재 outstanding 또는 현재 locked shares로 포함하지 않는다.
- 단타용 overhang 설계에는 (a) 확정 outstanding shares, (b) treasury shares, (c) 금액 약정의 잠재주식 수 산식, (d) 발행 deadline, (e) lock-up 시작 trigger와 기간, (f) 실제 발행 공시 확인일을 따로 둔다. public float 주수는 위 수치에서 임의 산출하지 않는다.
- SEC 근거: [2026-08-14 Form 424B3 및 Exhibit 10.2](https://www.sec.gov/Archives/edgar/data/1995574/000114036126033201/ef20079086_424b3.htm), [2026-10-14 Form 6-K](https://www.sec.gov/Archives/edgar/data/1995574/000114036126039522/ef20083718_6k.htm), [2026-09-17 Form 6-K](https://www.sec.gov/Archives/edgar/data/1995574/000114036126036998/ef20082403_6k.htm).

### BEAT: ATM 발행 한도, 과거 만료 warrant lock-up, 성과조건부 주식보상 분리 (2026-10-21 cutoff)

- 2026-08-13 Form 10-Q 표지는 2026-08-11 common shares outstanding 56,349,171주를 기재하고 6월 30일 재무상태표와도 일치한다. 이는 최신으로 원문 확인 가능한 dated 수량이다. 회사는 8월 14일 최대 $25,000,000 gross ATM Sales Agreement를 별도 prospectus supplement로 등록했다. 8월 11일 이후 실제 ATM 매도·신주발행 주수는 10월 21일 cutoff까지 검토한 자료에서 확인하지 못했으므로 56,349,171주를 10월 현재 total로 보증하지 않는다.
- 같은 10-Q는 2026-06-30 현재 비가득 RSU 397,039개와 대표이사/창업자/이사 대상 performance-based RSU 2,800,000개를 분리 보고한다. PRSU는 특정 운영·소프트웨어·제품개발·임상 마일스톤 및 계속근무 조건이 충족되어야 가득되며, 회사는 6월 30일 기준 성과조건 달성 가능성이 있다고 평가했다. 이 award 수량은 현재 발행주식 또는 lock-up으로 더하지 않고 잠재공급으로 표기한다.
- 2025년 placement agent warrant 674,638개(기본 588,235 + over-allotment 86,403)는 360일 lock-up 후 행사 가능하다고 공시됐다. 2022 IPO underwriter warrant 192,500개는 180일 lock-up이었다. 두 제한 기간은 2026-10-21 전에 만료됐다. 이 조항은 warrant 제한을 설명하며 현재 common-share holder lock-up 수량을 뜻하지 않는다. 2026-08-14 ATM prospectus는 개별 공모별 lock-up terms는 해당 supplement에서 제시한다고 설명하지만 이 ATM supplement에는 현재 common-share lock-up 주수를 기재하지 않는다. 따라서 current locked shares는 null로 남긴다.
- 급등 단타 설계에는 dated outstanding, post-date ATM 실매도 주수, gross dollar capacity, unvested RSU/PRSU 및 성과·근속 trigger, warrant 수/행사조건/제한 만료일을 별도 필드로 둔다. 등록 한도나 award underlying을 현재 유통주식으로 취급하지 않는다.
- SEC 근거: [2026-08-13 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1779372/000119312526349121/beat-20260630.htm), [2026-08-14 Form 424B5 ATM](https://www.sec.gov/Archives/edgar/data/1779372/000121390026090239/ea0301826-424b5_heartbeam.htm).









### CHSN — reported one-year private-placement lock-up
2025-11-05 SPA에 따라 발행된 37,500,000 Class A 주식은 2025-11-18 발행 완료됐고, 20-F는 투자자들이 회사와 1년 lock-up restrictions에 합의했다고 기재한다. 2026-10-21 cutoff는 1년 만료 전에 해당한다. 따라서 본표는 공시상 계약대상 수량 37,500,000주를 표시하되, 최신 연결 filing 이후 waiver/release 여부와 현 잔량이 확인되지 않아 상태는 SEC_LOCKUP_REPORTED_AMOUNT_CURRENT_RELEASE_UNCONFIRMED로 둔다. 미발행분이나 lock-up 이외의 resale/ATM 잠재주식은 합산하지 않는다. [SEC 20-F](https://www.sec.gov/Archives/edgar/data/1825349/000121390026045625/ea0286626-20f_chansoninter.htm)


### MNDR — expired staged lock-up
SEC 424B3는 Indopacific에 발행한 500,000 Class A Consideration Shares 중 절반은 180일, 절반은 360일 lock-up 대상이며 SPA가 2025-09-17 종결됐다고 기재한다. 2025-09-23의 1-for-5 consolidation 이후 계약대상은 100,000주(각 tranche 50,000주)로 계산된다. 180일·360일 기한은 각각 2026-03-16·2026-09-12로 산술 계산되어 2026-10-21 cutoff 이전에 만료했다. 만료 후 보유/매도 여부는 미공개이므로 본표 현재 lock-up 주수로 가산하지 않고 SEC_LOCKUP_EXPIRED_BY_CUTOFF로 표시한다. [SEC 424B3](https://www.sec.gov/Archives/edgar/data/1976695/000149315226021421/form424b3.htm)


### TOPP — previously restricted 7,500,000 shares waived
2025-12-03 SEC Form 8-K states underwriter representative AGP waived the lock-up restriction on 7,500,000 common shares held by CEO Hok C. Chan, effective immediately, and those shares could be sold from that date. This resolves that identified block as no longer locked by that agreement at the 2026-10-21 cutoff. It does not establish the absence of separate restrictions on other shares. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1960847/000121390025117911/ea0268382-8k_toppoint.htm)


#### 2026-10-23 SEC 미검토 락업 검색 배치 (40개 issuer)

현재 락업 검토 CSV에서 `NOT_REVIEWED`인 항목과 기존 SEC 키워드-hit 대기목록을 ticker로 교차해, 실제 미검토 후보 40개의 최신 hit 공시를 SEC Archives에서 다시 읽었다(요청 오류 0, SEC 원문 40건, lock/transfer 제한 검색문맥 39건). 현재 review CSV 행을 올바르게 읽은 선정 결과이며 앞선 탐색 스크립트가 다른 live universe를 선택한 결과와 분리 보존한다.

- 추가 현행 lock-up 수량은 확정하지 않았다. LHAI 8,070,000주는 별도 2026-01-21 Form 8-K에서 확인한 역사적 수량이며 2026-07-24에 명시 기간 종료; 이전 검토에서 이미 반영됐다.
- DDC 2026-01-26 424B3는 일부 투자자 구독 ordinary shares의 제한이 시가총액 조건에 따라 달라진다고 요약하고, 2025년 $124M 구독 주식 lock-up은 별도 계약서에 기간별 제한을 위임한다. 이 요약 공시만으로 투자자별 실제 발행분, 현재 제한 수량 및 해제된 잔액을 산출할 수 없다. [SEC 424B3](https://www.sec.gov/Archives/edgar/data/1808110/000121390026007463/ea0274060-424b3_ddcenter.htm)
- AGIG 2026-02-23 424B5는 임원·이사·일부 주주가 supplement 날짜부터 75일간 처분 제한에 동의했다고 설명하지만 대상자별 지분 합계 및 후속 waiver/제한은 해당 요약만으로 확정되지 않는다. 과거 발행 lock-up 조건을 현재 잔액으로 표시하지 않는다. [SEC 424B5](https://www.sec.gov/Archives/edgar/data/1156041/000149315226007693/form424b5.htm)
- 나머지 키워드 일치는 위험 문구, 투자자/placement-agent 신규발행 lock-up, 과거 사업결합 제한 또는 첨부 목록을 포함한다. 문맥만으로 기존 보통주 보유자의 현재 제한 수량을 확인할 수 없어 lock-up 수량은 미확인으로 유지한다.

결과 데이터는 `scratch/us-under1-unreviewed-lockup-targets-20261023.json` 및 `scratch/us-under1-unreviewed-lockup-contexts-20261023.json`에 둔다. 이 검색은 107개 미검토 전체 검토가 아니며 이번 배치 40건을 coverage에 반영한 뒤 미검토 67개가 남는다. 기존 SEC screen과 교차되는 추가 keyword-hit 후보는 최대 25개이며, 나머지는 선택된 keyword-hit filing이 없는 행이다.


#### 2026-10-23 미검토 68개 중 최신 SEC 원문 40개 확인

현재 검토표 `NOT_REVIEWED` 행에서 ticker/CIK를 가져와 SEC submissions recent 배열에서 최신 관련 filing을 고른 뒤 40개 원문을 직접 읽었다. 제출목록/원문 조회 오류는 0건. 선택된 40개 중 최신 filing에 lock-up 관련 검색 문맥이 나온 issuer는 BLNK, CLPS, GMEX 세 곳이다. 나머지 37개는 해당 최신 filing 본문에서 관련 키워드가 발견되지 않았다. 이 결과는 SEC 공시 전수에서 lock-up이 없다는 뜻이 아니며 기존 계약의 지속, 별도 exhibit, 다른 최신 filing을 배제하지 않는다.

- **BLNK**: 2026-10-16 8-K의 Blink Conversion Shares lock-up은 향후/조건 충족 후 전환일에 시작하고, 2027-04-01 또는 전환일 이후 6개월 중 더 이른 시점에 끝난다. 발췌된 조항은 전환주 수량 및 현재 발행·잠김 여부를 확정하지 않으므로 기존 보통주 lock-up 수량에 합산하지 않았다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1429764/000149315226047342/form8-k.htm)
- **GMEX**: 2026-10-15 6-K는 Class C Preferred Shares와 전환으로 발행될 수 있는 보통주가 24개월 제한 대상이라고 기재한다. 해당 요약은 주식 수와 전환·종결 상태를 제시하지 않아 현재 잠긴 보통주 수량은 확인되지 않는다. [SEC 6-K](https://www.sec.gov/Archives/edgar/data/1928581/000149315226047148/form6-k.htm)
- **CLPS**: 2026-10-16 20-F는 transfer restriction 만료를 일반 위험요인으로 언급하고 exhibit list에 lock-up agreement 양식을 열거하지만, 현재 적용되는 주주·수량은 확인하지 못했다. [SEC 20-F](https://www.sec.gov/Archives/edgar/data/1724542/000121390026110018/ea0307179-20f_clpsincorp.htm)

이 40건의 키워드 문맥 scan만 검토표에 반영한 뒤 집계는 표적 검토 143, 부분/키워드 문맥 검토 297, 미검토 28이다. 현재 수량이 구체적으로 확인된 lock-up 행 수는 변함없이 8개다.


#### 2026-10-23 마지막 28개 미검토 후보 최신 SEC filing 검색

검토 CSV에서 남아 있던 `NOT_REVIEWED` 28개 issuer를 CIK로 SEC submissions recent와 join해 최신 관련 filing을 28/28 찾고 primary document를 28/28 불러왔다(요청 오류 0). 최신 관련 filing에서 락업 관련 문맥이 발견된 4개는 PPCB, RCON, RUBI, STXS이며, 나머지 24개는 선택된 최신 문서에서 키워드가 발견되지 않았다. 이 검사는 전체 filing history 또는 계약별 해제 통지를 전수 검토한 것이 아니다.

- **PPCB**: 2026-10-05 S-1은 2026-01-23 합의한 발행사 covenant를 기재한다. 2025년 8월 공모 후 360일 동안 대표자 동의 없이 증권을 offer/sell하거나 등록서를 내지 않는다는 issuer-level 제한이며, 기존 내부자/기관 보유주의 lock-up 잔량은 아니다. 해당 기간은 2026-10-21 cutoff 전 만료됐다. [SEC S-1](https://www.sec.gov/Archives/edgar/data/1517681/000149315226045770/forms-1.htm)
- **RCON**: 2026-09-30 20-F는 2018년 발행된 487,057 restricted shares와 발행 후 1~3년의 과거 제한을 서술하며, 후속 보충 합의로 관련 제한을 취소했다고 기재한다. 현재 lock-up으로 산입하지 않는다. [SEC 20-F](https://www.sec.gov/Archives/edgar/data/1442620/000110465926112415/rcon-20260630x20f.htm)
- **STXS**: 2026-08-13 424B3는 2018-03-12부터 18개월간 제한된 과거 SPA warrant exercise shares를 설명하고 35,791,927주 발행 사실을 적는다. 해당 제한은 만료됐으므로 현재 수량과 분리했다. [SEC 424B3](https://www.sec.gov/Archives/edgar/data/1289340/000149315226037775/form424b3.htm)
- **RUBI**: 2026-10-21 424B3의 문맥은 financing covenant의 `Restricted Security Issuance` 정의이며 기존 보유자별 잠김 주식 수를 나타내지 않는다. [SEC 424B3](https://www.sec.gov/Archives/edgar/data/1943421/000117184326006729/f424b3_102026.htm)

이전 2026-10-23 live snapshot에서는 467개 coverage가 targeted 139, screened 321, 미검토 7이었다. 최신 2026-10-24 cutoff 표는 459행으로 재정렬했고, 2026-10-24 SEC submission text에서 10개 잔여 종목의 최근 제출 및 exhibit 문맥을 검토해 coverage를 targeted 142, screened 317, 미검토 0으로 갱신했다. 당시 수량 기록 8개는 해당 filing 기준 수치이며 잔액 전수검증이 아니다. 이후 EVTL 2026-08-10 424B5를 직접 검토해 targeted coverage가 143/459로 증가했고, 구체적 lock-up 수량 기록은 여전히 8개다. 계약 원문·면제·해제 후 잔량 전수 검증은 미완료이며 공시 수량도 현재 잔액 확정과 동일하지 않다.

#### 2026-10-24 남은 10개 issuer의 SEC 락업 검토

CIK별 SEC submissions와 2026-06-01~10-24 제출 complete text를 조회해 최근 10개 미검토 행을 반영했다. 원문/첨부 검색은 보조 선별이며 해당 회사의 모든 과거 계약·waiver·release를 전수 검증하지 않는다.

- **LSTA**: 2026-09-17 종결을 기준으로 특정 Marea 기존 주주 및 Lisata 임원·이사 측의 주식/증권 처분을 180일 제한한다. 보통주·Series C Preferred·보통주 등가증권과 합병 대가를 포함한다. 계산상 종료일은 2027-03-16이나 서명자별 보통주 주수는 공시에 합산되어 있지 않아 미공개다. [SEC 8-K](https://www.sec.gov/Archives/edgar/data/320017/000114036126036866/ef20082158_8k.htm), [합병계약](https://www.sec.gov/Archives/edgar/data/320017/000114036126036866/ef20082158_ex2-1.htm)
- **PFSA**: 2026-08-19 10-Q는 asset-purchase securities에 5년 제한과 발행 1주년부터 매년 1/4 해제를 기재한다. 전환우선주·기초 보통주와 실제 발행/전환 상태, reverse-split 기준을 대조한 잠김 보통주 총량은 확정하지 못해 숫자를 입력하지 않았다. 별도 Ascent warrant의 120일 제한은 2026-08-22 만료로 과거 항목이다. [SEC 10-Q](https://www.sec.gov/Archives/edgar/data/1859807/000121390026091696/ea0300132-10q_profusa.htm)
- **PLUR**: 2026-08-28 424B5는 임원·이사의 45일 처분제한을 설명하지만 유효 기준일, 예외·면제, 보유자별 수량이 검토 자료에서 확인되지 않아 현재 효력은 미확정이다. [SEC 424B5](https://www.sec.gov/Archives/edgar/data/1158780/000121390026094042/ea0303747-424b5_pluri.htm)
- **CELU**: sponsor-member lock-up은 2022년 7월 만료했고, 별도의 25% transfer restriction은 2024-01-12 해제 trigger가 발생했다고 2026 10-K/A가 설명한다. 현재 제한으로 산입하지 않는다. 분배된 Class A 708,750주 중 restricted-holder allocation은 확인되지 않았다. [SEC 10-K/A](https://www.sec.gov/Archives/edgar/data/1752828/000149315226047708/form10-ka.htm)
- **SDEV, BRLS, COCP, FBLG, ORGO, ANVS**: 선택한 최근 SEC 제출 세트의 키워드 문맥 검토에서 특정 현재 common-holder lock-up 주수는 확정되지 않았다. SDEV의 `lockup` 용례는 디지털자산 SKY의 voluntary staking이며 주식 락업으로 세지 않았다. BRLS의 제한은 미등록증권 transfer legend이고, ORGO에는 장래 offering용 일반 boilerplate가 있었다. 이를 무제한·0주 증거로 해석하지 않는다.


## 기업별 급등주 단타 데이터 카드 설계

각 종목의 기본 행은 가격 cutoff별 snapshot으로 두고, 공시 하나가 여러 건의 주식 공급·계약 이벤트를 담을 수 있으므로 아래 이벤트는 ticker 하위의 1:N 자료로 분리한다. 공시 날짜와 기준일을 단순히 최신 날짜 하나로 합치지 않는다.

| 레코드 | 종목별 필수 속성 | 상태/판정 예시 | 사용 원칙 |
|---|---|---|---|
| Snapshot | ticker, CIK, common class, 거래소, quote 관측시각, 최근 30일 low/high 및 기간·coverage | `PRICE_SOURCE_ALLOWED`, `SEC_CLASS_CONFIRMED`, `CLASS_UNRESOLVED` | 가격·30일 범위만 허용 시세 원천; 기업 사실은 SEC 근거와 분리 |
| Capitalization | 주식 종류별 issued, treasury, outstanding, 기준일, 후속 발행/전환/분할 여부, SEC source | `DATED_EXACT`, `DATED_APPROXIMATE`, `CLASS_AMBIGUOUS`, `NOT_FOUND` | share class별 값을 합산할 때 계산식과 각 원문 숫자를 저장; 기준일 이후 수량을 임의 roll-forward하지 않음 |
| Holder restriction | holder group, 대상 security/class, 제한 수량, quantity basis, 시작일/종료조건, 예외·waiver·release, 상태 | `ACTIVE_QUANTITY_CONFIRMED`, `ACTIVE_AMOUNT_UNDISCLOSED`, `CONDITIONAL_NOT_ISSUED`, `EXPIRED`, `RELEASE_UNCONFIRMED`, `ISSUER_ISSUANCE_ONLY`, `NO_HIT_IN_REVIEWED_SOURCE`, `NOT_REVIEWED` | 기존 주주 보유주만 잠김 주수로 표시; 발행사 발행금지, 미발행 전환주, warrant 기초주, Rule 144 제한은 서로 분리 |
| New supply | ATM/shelf/resale/PIPE/public offering, security type, maximum/registered/issued/sold amounts, proceeds, exercise price, reset, term, effectiveness, remaining capacity if explicitly disclosed | `REGISTERED_NOT_EFFECTIVE`, `EFFECTIVE_NOT_SOLD`, `ISSUED`, `EXERCISED`, `EXPIRED`, `CAPACITY_UNDISCLOSED` | offer ceiling, issued shares, resale shares, warrant underlying shares를 별도 기록하고 같은 주식을 중복 합산하지 않음 |
| Catalyst | event, issuer statement vs completed outcome, announced/estimated date and timezone, filing date, condition, result metric and source | `COMPLETED`, `COMPANY_CONFIRMED`, `ESTIMATED`, `CONDITIONAL`, `DATE_NOT_DISCLOSED` | 결과·확정 회사 일정·추정 일정을 구분; 단지 일정이 있다는 이유로 호재 판정하지 않음 |
| Listing/corporate action | exchange deficiency, cure deadline/hearing, split ratio, approval, legal effective time, adjusted trading start, ticker/CUSIP change | `NOTICE_RECEIVED`, `CURE_IN_PROGRESS`, `APPROVED`, `EFFECTIVE`, `TRADING_ADJUSTED`, `UNVERIFIED` | 보통주 수 변화와 가격의 기계적 조정을 구별; 현지시간과 KST를 함께 유지 |
| Financial risk | cash/cash equivalents, debt and maturity, operating cash flow, going-concern language, subsequent financing | `AS_REPORTED`, `GOING_CONCERN_DISCLOSED`, `NOT_FOUND` | 원문 보고기간/기준일과 단위를 유지; 산출 runway는 `cash ÷ observed-period burn × period length` 산식과 입력 filing을 함께 표시하고 전망치처럼 쓰지 않음 |

모든 이벤트 레코드는 SEC form, filing date, accession number, 해당 filing의 period/as-of date, primary source URL, 원문 위치(페이지/Item/exhibit), 발췌 또는 검토 메모를 보존한다. 30일 저점·고점은 완전한 기준창과 OHLC coverage가 검증될 때만 snapshot 표의 값으로 노출하며, partial coverage이면 숫자는 미확인/null로 둔다. 수량 상태는 숫자와 독립 필드로 둔다. 숫자가 없는 상태를 0으로 바꾸지 않고, 공시 검색에서 발견되지 않은 사실은 “검토한 filing 범위 내 미확인”으로 표현한다.

최소 단타 사용 순서는 (1) 활성 보통주·quote 기준시각 확인, (2) 공모/ATM/전환/워런트의 실제 공급과 잠재 공급 분리, (3) lock-up 만료/waiver와 resale 등록 효력 확인, (4) 촉매의 확정상태 및 결과 수치 확인, (5) 상장 유지·역분할 일정 및 현금/going-concern 리스크 점검으로 설계한다. 현재 프로젝트의 SEC-only 범위에서는 RVOL, 호가 스프레드, 실시간 halt/short interest/borrow, 소셜 언급량을 기업별 SEC 사실로 채우지 않는다. 향후 이런 필드를 추가하려면 사용자가 해당 비SEC source를 별도로 허용해야 하고, SEC fact 영역과 분리 저장해야 한다.





