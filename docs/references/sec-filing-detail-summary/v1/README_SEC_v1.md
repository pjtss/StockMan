# SEC EDGAR 공시 기반 결정적(Deterministic) 매매 분석 규격 v1.0.0

> 목적: 동일 공시·동일 수집 시점·동일 연결 문서 집합이면 항상 **동일한 키 집합과 동일한 계산 규칙**으로 분석 결과를 반환합니다. 미공개 수치는 절대 추측하지 않으며 `null`로 처리합니다. `null`과 0, 미확인과 해당 없음, 신규 발행과 주주 재판매를 엄격히 구분합니다.

## A. 함께 쓰는 파일

| 파일 | 용도 |
|---|---|
| `sec_filing_template_v1.json` | 매 공시 응답의 고정 전체 JSON 구조. 단일 스칼라가 없으면 `null`, 반복되는 증권·계약·첨부는 `[]` |
| `sec_filing_schema_v1.json` | JSON Schema Draft 2020-12. 모든 객체의 모든 키 `required`, 미등록 키 `additionalProperties:false` |
| `array_item_templates_v1.json` | ATM·워런트·전환채·재판매·계약 등 배열에 포함되는 각 항목의 고정 키 템플릿 |
| `sec_filing_extraction_prompt_v1.md` | 재사용 가능한 공시 분석 지시문 |
| `validate_sec_report_v1.py` | JSON Schema + 핵심 매매 오류 차단 검증기 |

## B. 데이터 수집의 범위와 출처

1. **발견:** EDGAR 공식 최신 접수 검색/RSS(Atom)를 입력으로 받되, RSS 제목/요약만으로 분석을 끝내지 않습니다.
2. **접수 시간 검증:** EDGAR filing detail/complete submission header의 accepted timestamp를 원천값으로 사용합니다. `filing_date`, `period_of_report`, `event_date`는 접수 시각과 별개입니다. ET 서머타임(EDT/EST)을 반영해 UTC/KST를 환산합니다.
3. **서류 본문:** SEC filing index에서 기본 본문과 **모든 첨부 문서**를 열거합니다. Exhibit 99.1(보도자료), 10.1(계약서), 4.1(워런트 조건), 3.x(정관·우선주), 5.1 등 유형에 따라 중요한 모든 첨부를 읽습니다. Exhibit 번호는 예시일 뿐이며 문서마다 다릅니다.
4. **연결 공시:** 계약 원문, 선행 8-K, S-1/S-3, 424B3/424B5, EFFECT, 관련 10-K/10-Q/20-F/6-K, 정정신고/A를 연결하여 동일 ATM/워런트/전환채/증권별로 식별합니다. *최신 공시는 이벤트 판정, 구 공시는 약정 및 잔여한도 문맥 확보에만 사용*하며 반드시 근거 날짜를 남깁니다.
5. **재무 수치:** SEC XBRL companyfacts/companyconcept를 보조 소스로 사용하되 회사별 확장(custom) 태그와 본문 비정형 조건은 원문에서 확인합니다.
6. **주가/거래량/차트:** SEC만으로 실시간 현재가·프리마켓·거래량·RVOL·골든크로스를 확인할 수 없습니다. 별도의 거래소/브로커 실제 호가 출처가 없는 경우 `market_snapshot` 필드를 `null`로 유지합니다.
7. **출처 기록:** 모든 주요 숫자와 사실에 `/evidence` 배열을 두고 해당 JSON Pointer, SEC 원문 URL, accession, 조항 또는 페이지, 25단어 미만의 정확한 문구, 기준일을 기록합니다. 계산값은 `derived_from_json_pointers`와 공식으로 연결합니다.
8. **수집 한도:** SEC 공식 가이드라인에 따른 식별 가능한 User-Agent를 사용하고 SEC의 공정 접근 제한(현재 공개 가이드에 10 requests/sec 명시)을 준수합니다. 재시도/백오프/캐시를 사용합니다.

공식 참조:
- https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- https://www.sec.gov/about/developer-resources
- https://www.sec.gov/about/webmaster-frequently-asked-questions
- https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data

## C. JSON 계약(Contract)

- **불변 키:** 모든 최상위 객체/중첩 객체 키 존재 필수. 공시 유형에 맞지 않아도 객체 자체는 존재해야 합니다. 예: 주식분할 공시여도 `financing.atm_programs=[]`, `business.contracts=[]` 유지.
- **숫자 타입:** 가격·금액·주식 수·비율은 JSON `number` 또는 `null`. 퍼센트는 `12.5`가 **12.5%**를 의미합니다. 환율·통화 변환이 없는 경우 서로 다른 통화를 더하지 않습니다. 코드는 Decimal/BigDecimal로 계산합니다.
- **금액 단위:** 명칭에 `gross`, `net`, `cash`, `proceeds`, `value`를 구분. `_pct`는 퍼센트, `_shares`는 주식 수. 금액은 프로그램/거래별 `currency`를 반드시 기록. `financials.amounts_scale`는 원문 표시 단위(예: 1000)를 뜻하며, 수치 필드는 가능하면 원 단위로 정규화합니다.
- **null 의미:** 해당 숫자가 공시에 없거나 신뢰 가능하게 확인할 수 없으면 `null`; `null_reasons[]`에서 `/path`와 아래 이유를 추가합니다. `null`을 0으로 바꾸지 않습니다.
- **null reason enum:** `NOT_DISCLOSED`, `NOT_APPLICABLE`, `DOCUMENT_UNAVAILABLE`, `NOT_YET_VERIFIED`, `CONFLICTING_DISCLOSURES`, `OUTSIDE_SEC_SCOPE`, `NOT_COMPUTABLE`, `STALE_AS_OF`.
- **배열 규칙:** 실제 복수 거래/증권 시 배열 항목을 한 개씩 생성합니다. 탐색이 완료되어 해당 유형이 발견되지 않으면 `[]`. 관련 Exhibit이 미열람이면 `[]`을 확정적 부재로 설명하지 말고 `coverage`와 `quality`를 미완료로 표시합니다.
- **날짜:** UTC 속성은 ISO 8601 `Z` 또는 `+00:00`, ET/KST는 오프셋 포함 ISO 8601을 사용합니다. `YYYY-MM-DD` 날짜 전용 필드는 날짜만 기록. **공시 접수·실제 계약일·효력발생일·상장거래 반영일을 따로 기록**.
- **상태:** `event.transaction_stage`는 발표(ANNOUNCED), 계약(AGREEMENT_SIGNED), 제출(FILED), 효력(EFFECTIVE), 가격확정(PRICED), 일부집행(PARTIALLY_EXECUTED), 완료(CLOSED), 종료(TERMINATED), 철회(WITHDRAWN), 미확인(UNKNOWN) 중 하나.
- **중복 제거:** 공시 identity=`CIK + accession_number`; 거래/증권 identity=`CIK + 프로그램/시리즈 식별값`. 8-K와 424B5에 같은 ATM이 나오면 두 개의 ATM으로 더하지 않습니다.
- **수정/우선순위:** 같은 프로그램에 대한 명시적 후속 수정은 적용 기준일 이후 기존 조건을 대체합니다. 구 공시는 삭제하지 않고 증거/변경이력으로 보존합니다. 적용 대상, 발행주식 종류, 시점이 다르면 금액을 섞지 않습니다.
- **판독 실패:** 첨부 문서 일부를 못 열었다면 `coverage.material_exhibits_checked=false`, `quality.final_quality_gate_passed=false`, `quality.validation_errors[]`에 남깁니다.

## D. 이벤트 유형별 누락 허용 불가 점검

| 이벤트 | 필수 확인 질문(값이 확인되지 않으면 null + reason) |
|---|---|
| ATM | 계약한도, 최신 424B5 한도, 현재 S-3/IB.6 적격한도, 실제 누적 판매금액, 판매주식 수, 최근 기간 판매 순유입, 누적·최근기간 평균매도가, 현재 잔여분, 판매대리인, 수수료, 시장가/고정가, 판매 정지·종료, 정정 및 역분할 |
| S-3/S-1 선반등록 | 총 등록한도, 발효(EFFECT) 여부, 발효일, 실제 매도 가능한지, 발행자 신주 발행 vs 재판매, IB.6 제한, 관련 보충설명서 |
| 직접공모/사모 | 주당 발행가, 단위당 발행가, 발행주식 수, 선납 워런트 포함 여부, 총/순조달액, 실제 클로징, Lock-up, 옵션, 추가발행, 자금사용처 |
| 워런트(시리즈별) | 행사가(기존/현재), 발행 수량, underlying shares, 행사 가능 시각, 만기, cashless, 무현금 행사 조건, variable/reset, floor, anti-dilution, 4.99/9.99% blocker, 19.99% 교환소 제한(있는 경우) |
| 전환사채/노트 | 원금, OID, 금리, 만기, 고정/변동 전환가격, VWAP/최저가 연동식, lookback, floor, 디폴트/상환 프리미엄, 주식 예약, 전환 완료수, 잠재발행 주식수 |
| ELOC/SEPA | 매입 약정 최대액, 풋 통지 조건, 가격 할인식, floor, 선행 수수료/commitment shares, 한도, 최근 인출, 잔여 약정, 실제 발행 여부 |
| Resale | 주주 매도가능 수, 이미 발행된 주식과 미래 기초주식 구분, 효력발생 여부, 판매주체, 발행회사 실제 유입 현금, 워런트 행사로 인한 별도 현금 여부 |
| 역분할 | 1:N, 법적 효력 시각, 분할 반영 거래개시일, 구/신 CUSIP, 발행주식 전후, 단주 처리, 수권주식 수, 워런트/전환가 조정 근거 |
| 계약/수주 | 상대방, 확정계약·비구속 LOI, 보장액과 조건부 최대액, 계약기간, 이행 조건, 매출인식, 위약/해지 조항, 자금 확보 여부 |
| M&A | 인수가치, 현금/주식 지급 구분, 발행주식 수, 거래조건, 주주/규제 승인, 자금조달, 클로징 완료 여부 |
| 실적/재무 | 보고기간, 매출, 매출총이익, 영업/순이익, 영업현금흐름, 현금·부채, 유상증자 이후 현금, 계속기업 경고, 가이던스 |
| 규제/FDA | 승인/심사/시험단계, 적용 적응증·범위, 핵심 결과, 조건, 실제 승인 여부, 상용화 제약, 발표/결정 시간 |
| 상장/규정 | 거래소 통지, 최소 입찰가, 자본/시총 요건, 개선기한, 실제 정지·상장폐지 결정, 이의신청 현황 (`business.listing_compliance`) |
| 대량보유(13D/13G) | 실제 보유주식, 보유비중, 의결권, 보유 목적, 과거 비중 변화, 제출자 구분 (`business.beneficial_ownership[]`) |
| 8-K 일반 | Item 1.01·1.02·1.03·2.02·2.03·3.02·3.03·5.03·8.01 등 해당 섹션, Item 9.01에 기재된 Exhibit를 전부 대조 |

**참고:** SEC 양식 유형은 사건 유형과 같지 않습니다. 8-K 안에 ATM·우선주·전환사채가 동시에 있을 수 있으며 한 개의 424B5가 기존 ATM의 한도 변경만 기록할 수도 있습니다.

## E. ATM 계산: 반드시 구별할 7개 개념

- `contractual_total_cap`: 계약에서 정한 전체 프로그램 한도. **추가 발행 가능한 현시점 한도가 아닙니다**.
- `prospectus_total_cap`: 해당 보충설명서가 다루는 금액 한도. **이전 보충설명서의 금액과 자동 합산 금지**.
- `sold_gross_cumulative`: 해당 ATM으로 이미 판매한 금액의 누적치(공시가 제공할 때만).
- `sold_shares_cumulative`: 실제 판매한 누적 주식 수(동일 기간·동일 프로그램·동일 split basis 필요).
- `registered_remaining_capacity`: 현재 유효한 등록문서/보충설명서에서 아직 발행가능한 금액(확인된 경우).
- `s3_ib6_remaining_capacity`: IB.6 등 적용되는 발행 적격성에 따른 제한 금액(해당되는 경우).
- `effective_current_remaining_cap`: **직접 공시로 확인되거나, 모든 적용 한도 및 변동을 확인했을 때만** 계산할 현재 가용량. 미확인 제한이 하나라도 있으면 `null`.

기본적으로 ATM 주식판매는 그때그때 시장가격으로 집행될 수 있습니다. 이 경우 `fixed_share_price=null`, `share_price_type="MARKET_VARIABLE"`. **워런트 행사가**와 ATM 평균판매가를 섞지 않습니다. "기관이 언제 얼마에 반드시 매수"처럼 주가 방향을 보장하는 문장은 만들지 않습니다.

관계: `remaining`이 공시에 직설적으로 기재되면 그 값을 우선합니다. 단순 `총한도 - 과거 누적판매`는 이후 수정, 취소, 등록적격성 변경, 이전 보충설명서 판매, 한도 중첩 때문에 **기계적으로 계산 금지**합니다.

## F. 주식 수·희석률 계산

계산은 모두 **같은 보통주 클래스**, **동일 split-adjusted 기준일**, **동일 조건 충족 단계**를 전제로 합니다. 하나라도 다르면 null입니다.

1. 신규 발행주식 대 기존 주식 비율(%) = `confirmed_or_potential_new_shares / common_shares_outstanding × 100`.
2. 기존 주주 기준 신주 발행 후 보유비중 희석률(%) = `new_shares / (old_shares + new_shares) × 100`.
3. ATM 가정 최대주식 수 = `현재 가용 ATM 금액 / 신뢰할 수 있는 같은 시각의 시장주가`; **가정값**이며 실제 발행주식수가 아닙니다. 변동 수수료와 매도가격 때문에 부정확할 수 있습니다.
4. 신규 발행 후 주식 수 = `현재 주식 수 + 새로 발행할 주식 수` (정확히 동일 share basis이며 이미 반영된 주식을 중복 더하지 않을 것).
5. 역분할 N:1(구 N주 → 신 1주): 조정후 이론 주식 수 = `구 주식 수 / N`. 단주 반올림 등 때문에 **공시된 실제 신주식 수가 우선**입니다.
6. 공급/전환/워런트/ATM 잠재주식은 중복 합산되지 않도록 **동일 기초주식/이미 발행 여부**를 추적합니다.
7. 시가총액 대비 공모금액 비율(%) = `동일 통화의 공모총액 / 시장시가총액 × 100` (정시 호가가 없으면 null).

*주의:* "최대 희석률"은 청약·전환·워런트 조건이 모두 실제 이행되는 가정의 **상한 시나리오**입니다. 발행 가능성과 실제 발행은 다릅니다.

## G. 금융거래 단계에 따른 사실 구분

| 상태 | 알 수 있는 사실 | 단정해서는 안 되는 내용 |
|---|---|---|
| 계약 체결 | 약정 존재 | 대금 수령 완료 |
| 등록 S-3 제출 | 등록 신청 | SEC 효력 발생, 즉시 매도 가능 |
| EFFECT | 등록효력 발생 확인 | 실제 주식 판매 완료 |
| 424B5 | 보충 조건·판매 가능 문서 | 해당 총액만큼 이미 발행 완료 |
| 424B3 resale | 투자자 재판매 등록 | 발행회사에 재판매대금 유입 |
| 워런트 발행 | 장래 행사 권리 존재 | 당장 보통주 신주 발행 완료 |
| 변동가 전환 | 조건 충족 시 전환 가능 | 확정적인 고정 전환가격 |
| LOI/MOU | 의향 또는 예비합의 | 확정 매출, 대금 지급 완료 |

## H. 분석 품질 게이트

**계속 진행해도 되는 경우:** 필수 Exhibit·연결 공시 검토 완료, 시점 정합성 충족, 중복 발행 제거, 중요 수치마다 SEC 원문 증거, 미확인 중요 수치의 null 이유 기록.

**즉시 매매판단 차단 (`assessment.trade_eligibility = "NO_TRADE"` 또는 `REVIEW_REQUIRED`):**
- 중요 원문/Exhibit 접근 실패, 숫자 상충, 발행주식수가 역분할 전후 혼합, ATM 잔여 발행량 불확실.
- SEC 외 주가 데이터 없는데 목표가·손절가 임의 생성.
- 거래소/브로커의 검증된 최신 시세/호가가 없거나, 요구한 EMA 골든크로스 충족이 확인되지 않음.
- 실질 호재/악재 확률을 근거 없이 퍼센트로 생성.

판정 필드: `quality.final_quality_gate_passed=false`면 공시 사실 요약은 가능하지만 **즉시 진입 신호를 금지**. `assessment.entry_price`, `stop_loss_price`, `take_profit_price`는 `null` 유지.

## I. 반복 분석 워크플로

1. 신규 RSS 항목 → SEC accepted timestamp로 최근 3시간/금일 필터. 목록은 `accepted_at_kst` 기준 최신순.
2. CIK+accession으로 SEC index → 모든 Exhibit 스캔 → 문서 본문 스냅샷·SHA256 저장.
3. 거래/시설 ID로 선행 공시 추적 → 기존 ATM·워런트 조건과 변경사항 정규화.
4. `sec_filing_template_v1.json`을 복제하여 모든 스칼라·배열 채움; 배열 원소는 `array_item_templates_v1.json`을 복제.
5. `evidence`와 `null_reasons` 채움. 공시 원문, 전환/분할 이전 기준, 문서 날짜까지 기록.
6. 별도로 신뢰 가능한 실시간 시세 수집(없으면 `market_snapshot` null).
7. 계산은 검증된 값에만 수행. 추출-검증-계산-분석을 한 번에 단정하지 말고 순차 실행.
8. `validate_sec_report_v1.py` 통과 후, 원문 근거가 있는 사실 위주로 한국어 요약을 생성.

## J. 예시: 구조에서 특히 중요한 부분

```json
{
  "financing": {
    "atm_programs": [
      {
        "program_id": "EXAMPLE_ATM_01",
        "status": "AVAILABLE",
        "currency": "USD",
        "contractual_total_cap": 50000000,
        "sold_gross_cumulative": null,
        "effective_current_remaining_cap": null,
        "fixed_share_price": null,
        "share_price_type": "MARKET_VARIABLE"
      }
    ]
  }
}
```

위 JSON은 **일부 필드만 발췌한 설명용**으로 정식 스키마를 통과하지 않습니다. 실제 출력은 배열 항목에도 `array_item_templates_v1.json`의 **모든 필드**가 있어야 합니다. 금액은 가상 예시이며 특정 종목의 공시가 아닙니다.

## K. 재현성의 현실적 한계

"항상 같은 **필드**"는 JSON Schema로 강제할 수 있습니다. 하지만 "항상 같은 **값**"은 입력 공시·연결 문서·공시 수정 여부·스냅샷 시각을 고정해야 합니다. LLM 추출의 의미해석 자체까지 완전 동일하게 만들려면 **원문 해시, 파서/모델 버전, 도출 공식, 결정적 검증기, 중요 항목의 계약서 직접 검토**를 결합해야 합니다. 일부 공시에는 수치가 원천적으로 존재하지 않으므로 그 수치는 null 유지가 올바릅니다.
