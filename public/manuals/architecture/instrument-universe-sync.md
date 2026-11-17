# 국내·해외 전체 종목 통합 유니버스 동기화 설계

상태: 운영 기준 · 국내·해외 유니버스 분리 운영
최종 검토일: 2026-08-18

## 1. 목적

한국투자증권(KIS)이 제공하는 종목 정보 파일을 기준으로 국내 KOSPI·KOSDAQ과 해외 NAS·NYS·AMS의 전체 지원 종목을 수집하고, 국내·해외 유니버스 테이블을 안정적으로 갱신한다.

모든 수집·탐지 기능은 아래 유니버스 테이블만 사용한다.

이 문서는 종목 수집, 정규화, 상품 분류, 비활성화, 검증, 이력 보존의 기준을 정의한다. 일봉·주봉·월봉 캐시와 탐지 모듈은 이 문서에서 확정된 통합 유니버스만 참조한다.

## 2. 범위와 용어

| 구분 | 시장 값 | 대상 |
|---|---|---|
| 국내 | `KOSPI`, `KOSDAQ` | KIS 국내 종목 정보 파일에 존재하는 종목 |
| 해외 | `NAS`, `NYS`, `AMS` | KIS 해외 종목 정보 파일에서 시세·거래가 지원되는 종목 |

`전 종목`은 KIS가 종목 정보 파일로 제공하는 전체 지원 종목을 의미한다. ETF·ETN·레버리지·인버스·워런트·파생상품은 원본 목록에 보존할 수 있지만, 공통 탐지 필터에서 제외한다. KIS가 제공하지 않는 OTC 또는 비지원 거래소 종목은 별도 마스터 출처 없이는 이 범위에 포함하지 않는다.

## 3. 데이터 흐름

```text
KIS 종목 정보 파일
        ↓
instrument_master_staging (원본 보존)
        ↓
형식·중복·건수 검증
        ↓
정규화 및 상품 분류
        ↓
국내 유니버스 / 해외 유니버스 upsert
        ↓
미검출 종목 단계적 비활성화
        ↓
일·주·월봉 캐시 및 탐지 대상 생성
```

KIS 공식 포털은 매매·시세조회 가능한 전체 종목 리스트를 종목 정보 파일로 제공한다. 순위 API의 TOP 100 누적값은 전체 유니버스의 원천으로 사용하지 않는다.

## 4. 저장 구조

### 4.1 staging 원본

```text
instrument_master_staging
- sync_id
- market
- code
- name
- raw_payload
- source
- fetched_at
```

staging에는 파싱 전 원본을 저장하여 파일 형식 변경, 필드 누락, 잘못된 상품 분류를 재현할 수 있게 한다.

### 4.2 국내 유니버스

호환 view: `kr_instrument_universe` (V85 이후)

국내 공통주/특수상품 분리 테이블을 합쳐 제공하는 읽기 호환 view다. 신규 쓰기와 보통주 처리의 기준 테이블은 `kr_common_stock_universe`, `kr_special_instrument_universe`다.

필수 필드:

```text
market                 KOSPI | KOSDAQ
code                   6자리 종목코드
name
english_name
instrument_type
is_etf
is_etn
is_leverage
is_warrant
is_active
source
source_updated_at
last_seen_at
classification_reason
```

고유 키는 `(market, code)`로 한다. 시장을 키에서 제외하면 동일 코드 충돌을 방지할 수 없다.

### 4.3 해외 유니버스

호환 view: `us_instrument_universe` (V89 이후)

미국 공통주/특수상품 분리 테이블을 합쳐 제공하는 읽기 호환 view다. 신규 쓰기와 보통주 처리의 기준 테이블은 `us_common_stock_universe`, `us_special_instrument_universe`다.

필수 필드:

```text
market                 NAS | NYS | AMS
code                   거래소 기준 티커
name
currency
country
instrument_type
is_etf
is_leverage
is_warrant
is_derivative
is_active
source
source_updated_at
last_seen_at
classification_reason
```

고유 키는 `(market, code)`로 한다. 해외 티커는 거래소별로 동일 문자열이 존재할 수 있으므로 `code` 단독 키를 사용하지 않는다.

## 5. 동기화 절차

1. 시장별 KIS 종목 정보 파일을 다운로드한다.
2. 다운로드 성공 여부와 원본 checksum을 기록한다.
3. staging에 원본 행을 저장한다.
4. 코드 형식, 시장 값, 필수 필드, 중복을 검증한다.
5. 상품 분류 모듈을 실행한다.
6. 검증을 통과한 행만 통합 테이블에 upsert한다.
7. 이번 실행에서 확인된 행의 `last_seen_at`을 갱신한다.
8. 미검출 행은 즉시 삭제하지 않고 단계적으로 `inactive` 처리한다.
9. 동기화 결과와 원본 응답 위치를 이력에 저장한다.

## 6. upsert와 비활성화 정책

upsert 기준:

```text
ON CONFLICT (market, code)
→ 이름·상품분류·출처 시각·last_seen_at 갱신
→ is_active = true
```

미검출 정책:

| 상태 | 조건 | 처리 |
|---|---|---|
| 관찰 | 1회 미검출 | 기존 활성 상태 유지, 경고 기록 |
| 후보 | 2회 연속 미검출 | 비활성화 후보 표시 |
| 비활성 | 3회 연속 미검출 | `is_active = false` |

단, 전체 건수가 평소보다 급감하거나 원본 파일이 비어 있으면 파일 장애로 간주한다. 이 경우 현재 유니버스를 유지하고 자동 비활성화를 수행하지 않는다.

## 7. 상품 분류와 탐지 필터

분류 값은 다음과 같이 표준화한다.

```text
COMMON_STOCK
ETF
ETN
LEVERAGED_ETF
INVERSE_ETF
WARRANT
PREFERRED
SPAC
ADR
REIT
DERIVATIVE
UNKNOWN
```

일봉·주봉·월봉 및 실시간 탐지의 공통 대상 조건:

```text
is_active = true
AND instrument_type IN (COMMON_STOCK, ADR, REIT)
AND is_etf = false
AND is_leverage = false
AND is_warrant = false
AND is_derivative = false
```

분류가 `UNKNOWN`이면 자동 탐지에서는 제외하고 관리자 검토 대상으로 남긴다.

## 8. 동기화 이력

```text
instrument_sync_runs
- id
- scope
- started_at
- completed_at
- status
- source_count
- inserted_count
- updated_count
- deactivated_count
- excluded_count
- error_count
- error_summary
- raw_response_location
```

관리자 화면에는 시장별 건수, 신규·변경·비활성화 건수, 상품 분류 건수, 마지막 성공 시각, 실패 원인, 원본 응답 모달을 제공한다.

## 9. 검증 기준

- 국내 코드는 6자리인지 확인한다.
- 해외 티커와 시장 값이 비어 있지 않은지 확인한다.
- `(market, code)` 중복이 없는지 확인한다.
- 이전 실행 대비 건수가 비정상적으로 급감하지 않는지 확인한다.
- 필수 필드 누락률이 임계치를 넘지 않는지 확인한다.
- 검증 실패 시 통합 테이블을 갱신하지 않고 staging과 실패 이력만 저장한다.

## 10. 자동화와 수동 실행

- 전체 종목 마스터: 하루 1회
- 국내 장 시작 전 보조 동기화: 필요 시 관리자 설정
- 해외 장 시작 전 보조 동기화: 필요 시 관리자 설정
- 상품 분류 재검증: 하루 1회
- 비활성 종목 정리: 주 1회
- 관리자 수동 동기화 및 Discord Slash Command: 동일 application service 호출

자동화와 수동 테스트는 같은 서비스 모듈을 사용하고, HTTP 라우트는 실행 요청과 결과 조회만 담당한다.

## 11. 운영 결정 사항

### 11.1 KIS domestic master parser offsets and partition moves (2026-09-25)

- Read KOSPI/KOSDAQ fixed-width fields by byte offsets. Verified status offsets: KOSPI `trht/sltr/mang=121/122/123`, KOSDAQ `116/117/118`; ETP and preferred offsets are maintained in `lib/instrument-universe-import.ts` and `docs/references/kis-instrument-masters/header-definitions.md`.
- KOSPI security group `EN` is an ETN and is excluded from the common-stock scanner universe.
- If a ticker changes between common and special, disable its row in the opposite partition in the same import. This prevents stale rows from remaining enabled in both tables.
- Validate expected market row counts and known normal common-stock flags before applying a whole-master refresh.

1. KIS 종목 정보 파일을 국내·해외 유니버스의 공식 원본으로 사용한다.
2. KIS 지원 목록 밖의 해외 종목은 별도 출처 검토 없이는 추가하지 않는다.
3. ETF·파생상품은 원본 payload에 보존할 수 있지만 공통 탐지 대상에서는 제외한다.

## 12. 현재 테이블 구조

```text
기능            → 국내·해외 유니버스 및 전용 봉 캐시 사용
동기화          → us_instrument_universe / kr_instrument_universe
일·주·월봉      → 유니버스 전용 캔들 테이블만 참조
```

국내·해외 유니버스는 각각 독립적인 primary key와 `(market, code)` unique key를 갖는다. 캐시·탐지 기능은 이 유니버스와 전용 캔들 테이블만 사용한다.

유니버스 테이블의 시장별 건수, 캐시 성공률, 탐지 결과를 진단 API로 검증한다.

### 12.1 시점별 issuer/instrument/venue 이력 범위

현재 KR/US universe 테이블의 key는 `(market, code)`이며 importer는 해당 키의 현재 행을 upsert하고 `first_seen_at`, `last_seen_at`, `missing_runs`로 수집 관측을 관리한다. 이 구조는 해당 코드가 언제부터 법적으로 유효했는지, 같은 issuer의 다른 venue/security class와 동일 instrument인지, rename/transfer/reuse 이전 가격 봉의 identity가 연속되는지를 표현하지 않는다. `first_seen_at`/`last_seen_at`은 수집 관측이지 공식 listing effective interval이 아니다. 코드 행의 현재 `instrument_type`, 이름, venue 변화는 과거 행 snapshot의 증거가 되지 않는다.

따라서 과거 시점 공시 귀속, ticker/venue successor 관계 또는 thesis outcome 검토는 현재 universe row만으로 완료됐다고 판정하지 않는다. 사용할 수 있는 승인된 time-effective alias/identity/eligibility assertion이 없으면 `UNRESOLVED`/`NOT_ATTRIBUTABLE`로 처리하고 기존 종목 대상/가격 시계열을 retarget하지 않는다. 제안되는 history 저장소와 마이그레이션은 이 운영 문서만으로 승인된 것이 아니다. 상세 데이터 계약은 [ITC 시점별 crosswalk](./kr-disclosure-event-architecture.md#종목-identity와-시점별-코드분류-crosswalk--itc-01itc-12), thesis 소비 조건은 [issuer/instrument/venue 귀속](./investment-thesis-journal-design.md#발행인증권상장-venue-귀속)을 참조한다.

### 12.2 공식 원천별 증거 책임과 coverage 경계

종목 identity, 현재 거래 적격성, 법인, 법적 상장 효력, 가격 venue를 한 원천의 “master” 명칭으로 통합하지 않는다. 아래 표는 현재 확인한 공식 endpoint/프로젝트 입력의 제안 책임이며, 운영 권리·보존 기간·완전성을 승인하지 않는다.

| 증거 질문 | 우선 검토할 공식 원천 | 제공 사실과 한계 | 설계 동작 |
|---|---|---|---|
| 지금 KIS 시세/거래 지원 목록에서 어떤 code/market이 들어오는가 | 프로젝트가 내려받는 KIS 국내/해외 종목정보 파일 및 해당 날짜 raw bytes/hash | `lib/instrument-universe-import.ts`가 국내 market/code/standard code/name/security group 및 해외 market/code/realtime symbol/name/security type/ETP type/currency/country/DR flag 등을 현재 universe로 파싱한다. 이는 지원 universe의 현재 관측이며 법인 식별자, official listing effective interval, 전체 상장 역사를 제공하는 계약은 확인되지 않았다. | 현재 후보 발견 및 프로젝트 적격성 판단에만 사용; 파일 snapshot과 classifier revision을 고정한다. `first_seen_at`은 listing date로 해석하지 않는다. |
| 국내 공시 issuer 법인과 공시상 stock code의 현재 연결은 무엇인가 | [OpenDART 고유번호 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DE001&apiId=AE00004) 및 accession별 공식 filing | `corp_code`는 8자리 법인코드, listed corp의 `stock_code`는 6자리, `modify_date`는 기업개황 최종 변경일이다. 이 가이드만으로 기간별 security identity/venue history 또는 `modify_date` 이전 alias를 확정할 수 없다. | corp identity 후보와 filing-attribution 증거로 분리 저장. 과거 날짜는 해당 당시 공식 filing/거래소 evidence가 없으면 unresolved. |
| 국내 증권/시장별 상장일·폐지일·상장유형은 무엇인가 | [KRX 신규상장종목 현황](https://data.krx.co.kr/contents/MDC/STAT/issue/MDCSTAT200.jsp), [KRX 상장폐지종목 현황](https://data.krx.co.kr/contents/MDC/STAT/issue/MDCSTAT238.jsp), 해당 종목의 공식 KIND/KRX 공지 | KRX 신규상장 현황은 종목코드·증권구분·주식종류·상장일·폐지일·상장유형 등을 제시하지만 최근 10년 범위이며 화면 안내상 SPAC 합병 상장 및 이전상장이 일부 제외된다. 상장폐지 현황은 별도 범위이고 직전 마지막 매매일 기준 안내가 있다. 집계화면 단독은 전 기간 모든 market/상태 변경에 대한 완전 crosswalk로 간주할 수 없다. | 공식 exchange notice/대상별 record가 직접 근거일 때만 listing epoch field를 확정. 조회 기간/시장/증권종류/예외를 coverage manifest로 기록하고 빈 결과를 “상장 이력 없음”으로 바꾸지 않는다. |
| 미국 filer와 현행 ticker/exchange candidate의 연결은 무엇인가 | [SEC EDGAR ticker/exchange files 안내](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data), [SEC submissions API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) 및 accession별 filing | SEC는 CIK가 filer 고유이며 재사용되지 않는다고 설명한다. `company_tickers_exchange.json`은 EDGAR 검색을 위한 name/CIK/ticker/exchange associations이고 SEC는 정확성·범위를 보장하지 않는다고 명시한다. submissions는 current/former name 및 stock exchanges/ticker symbols를 제공하지만 이는 complete security-level effective-dated listing ledger라는 뜻이 아니다. | CIK는 filer/entity identity 축으로 저장하고 ticker/exchange는 시점이 검증될 때만 alias assertion으로 연결한다. EDGAR mapping alone으로 listing status, COMMON_STOCK class, market-data venue 또는 event-time validity를 승인하지 않는다. |

원천 우선순위는 필드별로 정한다: filing entity는 regulator의 고유 filer/legal identifier, exchange listing effective date/status는 해당 venue의 security-specific notice/record, 현재 시세 지원 여부는 KIS master, 가격 관측 venue/time은 권리 확인된 market-data source를 각각 근거로 한다. 원천 간 불일치가 있으면 freshness가 더 최신인 값으로 덮지 말고 필드별 conflict를 기록한다. 원천의 조회 범위·행 분모·기준일·revision/hash·취득시각이 재현되지 않으면 absence/continuity 결론과 aggregate coverage 주장을 금지한다. KRX historical page나 SEC ticker file 존재만으로 과거 이력 completeness를 추정하지 않는다.

### 12.3 제안되는 identity evidence envelope (미승인)

각 alias/listing assertion 후보는 `fieldName`, `assertedValue`, `instrumentId`, issuer relation, `venueId`, `securityClass`, `validFrom/validUntil`, `observedAt`, `sourceAuthority`, exact source record/filing URL 및 document/response hash, 조회 window/filter, row/page denominator, source revision/effective notice time, parser revision, rights/use-purpose status, reviewer state를 함께 담는다. 필드별 source authority가 다를 수 있으므로 assertion별로 1차 근거를 지정한다. 원천이 특정 날짜만 공개하면 정확한 instant처럼 변환하지 않고 해당 precision을 유지한다. 승인된 source/rights/retention 정책과 실제 coverage 검증 전에는 history DB/API를 추가하지 않는다.

### 12.4 Crosswalk 후보 검토와 assertion 승격 절차 (제안)

KIS/SEC/OpenDART/exchange notice에서 들어온 mapping은 모두 **candidate**이며 universe row나 공개 귀속에 바로 반영하지 않는다. 절차는 원문·권리·대상 instrument revision을 함께 재현하는 수동 review workflow를 기준으로 제안한다.

1. **발견 및 분모 고정**: 입력 source snapshot과 조회 scope/window/filter/페이지 또는 파일 행 수를 pin한다. 후보 생성기 revision, 발견 사유, 발견시각, 관련 filer/instrument/code/market 후보를 기록한다. 동일 source run의 빈 응답·부분 실패는 “후보 없음”이 아니라 `EVIDENCE_INCOMPLETE`다.
2. **필드별 증거 packet**: 확인하려는 각각의 사실(법인, security class, market/code alias, listing/delisting effective date, successor relation)에 대해 권위 source 역할, exact source record/filing locator와 hash, 원문 시각 precision, `valid time`/`observed time`, source revision, applicable rights action/purpose/retention을 분리해 묶는다. 다른 사실을 증명하는 같은 issuer의 filing은 관계 증거로 자동 승격하지 않는다.
3. **검토 분류 및 conflict 확인**: 후보를 `READY_FOR_REVIEW`, `EVIDENCE_INCOMPLETE`, `CONFLICT_UNRESOLVED` 중 하나로 분류한다. 기존 승인 assertion과 동일/겹치는 유효구간, 다른 security class, 다른 venue, code reuse, predecessor/successor 후보를 조회하고 각 결과의 분모·snapshot 시점을 보존한다. conflict는 관련 instrument/alias 범위만 quarantine하며 다른 후보를 일괄 거부하지 않는다.
4. **승인 및 revision append**: 종목 데이터 책임자가 source별 증거와 대상 범위를 검토하고, issuer/instrument relation·security class·eligibility 또는 과거 history를 바꾸는 correction은 별도 독립 reviewer 결정도 요구하는 것을 제안한다. reviewer 역할/분리 요건은 `KR-MASTER-SNAPSHOT-01`/`KR-EVENT-ATTRIBUTION-01` owner 승인이 필요하다. 승인 시 새 `aliasAssertionId`/revision을 생성하고 적용 effective interval, 관측시각, 검토 이유, 승인자·시각·선행 revision을 기록한다. prior assertion은 수정/삭제하지 않는다.
5. **영향 전파 및 활성화**: 새 assertion은 명시적으로 그 assertion을 참조하는 downstream eligibility, event subject, watchlist context, thesis outcome만 재평가 대상으로 만든다. 기존 공개·추천·가격 outcome은 새 evidence+master snapshot+rights gate+해당 review를 통과하기 전까지 stale/suppressed 상태로 둔다. relation은 instrument identity를 합치거나 가격 series를 잇는 권한을 자동 부여하지 않는다.
6. **정정·만료·재검토**: 원천 정정/철회, master code/class 변화, issuer filing successor, rights 만료, source coverage 축소, parser/evidence locator 변경은 새 candidate/review run을 연다. 전 assertion·decision·consumer 결과를 보존하고 dependency fingerprint가 달라진 descendant만 `REVIEW_REQUIRED`로 표시한다. 재수집 성공이나 최신 값이 있다는 이유로 과거 검토를 자동 승인하지 않는다.

제안 상태 집합은 `DISCOVERED`, `EVIDENCE_INCOMPLETE`, `READY_FOR_REVIEW`, `IN_REVIEW`, `APPROVED_ASSERTION`, `REJECTED`, `CONFLICT_UNRESOLVED`, `SUPERSEDED`, `EXPIRED`다. `APPROVED_ASSERTION`만 해당 assertion revision을 downstream candidate로 제공할 수 있다. `DISCOVERED`/`READY_FOR_REVIEW`는 사실/적격성 확정이 아니며, `REJECTED`도 다른 source window의 신규 후보를 영구 차단하지 않는다. 상태 전이는 actor, expected prior revision/CAS token, decision ref, evidence packet hash, effective/expiry/reopen condition을 append하고 last-write-wins는 금지한다. `KR-MASTER-SNAPSHOT-01`, `KR-EVENT-ATTRIBUTION-01`, source별 `KR-DART-RIGHTS-01`/`KR-MARKET-DATA-RIGHTS-01`, 원문·파생물 retention은 `KR-RETENTION-01` scope 밖에서 승인될 수 없다.

합성 수용 fixture의 `ITC-19`–`ITC-30`은 후보 eligibility 경계, field-level packet, 독립 review, 국소 conflict quarantine, append-only correction, 권리 만료 차단, self-approval/무권한 변경 차단, 미승인 source 저장 금지, packet revision/CAS 및 auditor read-only 경계를 검사한다. fixture는 이 제안 workflow의 runtime 구현이나 실제 source-history 완전성을 입증하지 않는다.

합성 전이는 ITC-19`–`ITC-30에서 candidate 차단, field-level evidence completeness, 독립 검토, 최소 범위 conflict 격리, correction descendant 재검토, rights expiry 시 공개 억제, self-approval 차단, packet redaction/immutability, scope authorization/CAS 및 auditor read-only 경계를 고정한다. 이는 상태·gate 제안의 정적 확인이며 실제 역할 기반 접근제어, 트랜잭션 CAS, 외부 source 취득 권리를 입증하지 않는다.

### 12.5 Reviewer 권한·evidence packet·결정 연결 (제안)

Crosswalk review는 화면에서 버튼을 감추는 방식이 아니라 서버 측 actor capability와 assertion revision 전이로 집행한다. 권한 경계는 아래 capability로 나누며 실제 role→actor provisioning, MFA/SSO, approver 수 및 SLA는 security/data owner가 승인하기 전 미정이다.

| 역할 capability | 허용 작업 | 금지 경계 |
|---|---|---|
| `CANDIDATE_DISCOVERY` | 승인된 수집 범위 내 source snapshot에서 후보 생성·재시도 | 후보를 assertion으로 승인하거나 public subject로 노출하지 않음 |
| `EVIDENCE_PREPARER` | 허용된 source/action 범위 내 evidence packet 구성, locator·field coverage 표시 | 자신이 작성한 packet/assertion을 단독 승인하지 않음; 원문 보존권한을 추정하지 않음 |
| `INSTRUMENT_REVIEWER` | 배정된 scope의 identity/class/valid-time 필드 검토 및 승인·반려·보류 결정 | source bytes/packet hash를 수정하거나 decision 밖 scope를 승인하지 않음 |
| `INDEPENDENT_REVIEWER` | 정책상 요구된 class/eligibility/history correction, source conflict, 고위험 변경을 독립 검토 | preparer 또는 primary reviewer와 같은 actor이면 separation 충족으로 계산하지 않음 |
| `DECISION_OWNER` | register에 지정된 policy/source/retention scope 선택·승인/만료 | 좁은 policy approval을 개별 security identity 사실의 자동 승격으로 간주하지 않음 |
| `AUDITOR_READ_ONLY` | actor, transition, evidence reference 및 승인 scope 감사 | 후보·evidence·decision 상태를 변경하지 않음 |

모든 mutation은 authenticated actor와 현재 permission/revocation revision, 대상 assertion 및 expected prior revision, 결정 scope, evidence packet digest를 서버에서 재검증한다. 감사 기록은 `actorId`, role snapshot, `action`, `decisionRef`, exact assertion/evidence revision, previous/next status, expected/current revision, reason code, `occurredAt`, `effectiveAt`/expiry, conflict resolution, correlated request ID를 포함한다. reviewer가 evidence를 수정해야 하면 기존 packet은 보존 가능한 범위 내에서 immutable로 남기고 새 packet/review revision을 만든다. 같은 revision에 대한 동시 승인·반려는 CAS로 한 전이만 성공하며 stale request는 `REVISION_CONFLICT`로 재검토한다.

Evidence packet은 일반 API/로그에 원문 body나 bytes를 기본 복제하지 않는다. 기본 packet은 권리가 허용한 최소 metadata, exact locator, source content hash, field-level claim-to-locator map, retrieval/source timing, coverage denominator 및 rights decision ref로 구성한다. hash/locator 자체도 파생정보·권리/보존 검토 대상이며 권리 승인을 뜻하지 않는다. 원문을 transient로 열람하거나 보존할지는 `KR-DART-RIGHTS-01` 등 해당 source/action/purpose와 `KR-RETENTION-01`의 retention 결정을 각각 확인한다. 불허/미확인 시 `BODY_NOT_RETAINED`와 재취득 locator만 허용되는지 정책에 따라 기록하고, 접근 가능한 source가 없으면 field를 미입증으로 두어 승인하지 않는다. credential, 사용자 thesis/보유·거래 정보, 불필요한 개인 식별자는 packet/로그에 넣지 않는다.

각 assertion-level review는 policy decision과 구별된 immutable `CrosswalkReviewDecision`을 둔다. 필수 정보는 `reviewDecisionId/revision`, `assertionId/revision`, `decision`/reason, reviewer actor+role snapshot, independent reviewer ref (required case일 때), evidence packet ID/hash, bound policy decision IDs/revisions, source/rights/retention scope, `validFrom/validUntil`, `effectiveAt`, recordedAt, expiry/reopen condition, expected prior revision, preceding decision ref다. `KR-MASTER-SNAPSHOT-01`은 master snapshot/class/history 정책, `KR-EVENT-ATTRIBUTION-01`은 filing party→issuer/instrument attribution, `KR-OPERATIONAL-SECURITY-01`은 actor authorization/audit/CAS, `KR-RETENTION-01`은 evidence lifecycle, 해당 원천의 `KR-DART-RIGHTS-01`/`KR-MARKET-DATA-RIGHTS-01`은 취득·열람·해시·보존·파생·공개 action을 각각 결정한다. `OPEN`·`EVIDENCE_READY`는 실행 권한이 아니며 policy status가 `APPROVED`여도 assertion-level review와 downstream gate가 별도로 통과해야 한다.

### 12.6 Owner decision package와 review-state UI (제안)

Policy owner evidence는 assertion-level packet을 그대로 decision ledger에 복사하지 않고, 결정 ID와 revision을 기준으로 scope-bound manifest로 제출한다. authoritative status와 필수 record field는 [decision lifecycle contract](../fixtures/disclosure/decision-register-lifecycle.v0.json), decision 의미·현재 상태 산정은 [decision register/evidence ledger 설계](./kr-disclosure-event-architecture.md#결정-종료-및-증거-추적-프로토콜-제안)를 재사용한다.

| package 구간 | 제출할 내용 | 통과 경계 |
|---|---|---|
| owner 및 선택 scope | decision ID/revision, 역할과 named owner/reviewer stable ID, 선택값 또는 아직 미결 사유, 선행 decision IDs, 포함/제외 market·field·source·action·purpose | 역할만 있고 실제 지정자 ID가 없으면 owner assigned/APPROVED로 간주하지 않음 |
| evidence manifest | immutable evidence refs, source/terms/master snapshot hash와 관측시각, exact field/action scope, rights·retention applicability, query window 및 row/page denominator, 민감 payload non-retention 근거 | locator/hash만으로 원문 진위·권리·coverage를 추정하지 않음; scope/분모 누락은 `OPEN` 또는 `EVIDENCE_INCOMPLETE` 유지 |
| acceptance | fixture/report ID와 hash, 실행 artifact, 결과 및 분모, 실제 적용 가능한 runtime/code gate evidence, 별도 승인돼야 하는 consumer gate | `EVIDENCE_READY`는 review queue 진입만 허용; `APPROVED`는 exact decision scope만 승인하고 종목 assertion/API/publication을 자동 활성화하지 않음 |
| reviewer·유효기간 | reviewer decisionRef, 독립 reviewer (요구 case), effectiveAt/validUntil, 재검토 trigger, rejection/reopen 조건, 이전 revision/hash, owner signature/checkpoint 조건 | named decision, passing acceptance, 기간 유효성 또는 독립 검토 요건 누락 시 승인 전이 거부; expired/changed dependency는 신규 revision 요구 |

제품 review 업무함은 외부 종목 GET/API와 분리된 권한 제한 internal surface다. 한 review row/card는 candidate assertion, 검토할 field, issuer/instrument/venue scope, valid/observed time, field evidence coverage 및 결손, source rights/retention disposition, 기존 충돌, dependency/reviewer 요구, 현재 actor capability, policy decision status/revision/expiry, assertion review status, downstream 영향 범위를 같은 immutable snapshot에서 보여준다. 정확한 원문 문구는 해당 source/action 권리가 승인되고 UI 목적까지 허용될 때만 표시하고, 아니면 허용된 locator/hash/최소 metadata와 “원문 미보존/재취득 필요” 상태를 보여준다.

화면은 별도 두 상태축을 표시한다.

- **Policy decision**: register status (`OPEN`, `EVIDENCE_READY`, `APPROVED`, `CLOSED`, `REJECTED`, `EXPIRED`), 승인된 exact scope와 effective/expiry 시각, 필요한 다음 owner action. `EVIDENCE_READY`는 검토 대기다. `APPROVED`는 정책 범위만 승인한다.
- **Assertion review**: `DISCOVERED`, `EVIDENCE_INCOMPLETE`, `READY_FOR_REVIEW`, `IN_REVIEW`, `CONFLICT_UNRESOLVED`, `APPROVED_ASSERTION`, `REJECTED`, `REVIEW_REQUIRED`, `EXPIRED`. `APPROVED_ASSERTION`은 current policy decision, reviewer separation, evidence/rights/retention 및 assertion-specific approval이 모두 현재 유효할 때만 계산한다.

허용 action은 상태에 따라 `ASSIGN_REVIEWER`, `REQUEST_EVIDENCE`, `MARK_EVIDENCE_READY`, `APPROVE_POLICY_SCOPE`, `APPROVE_ASSERTION`, `REJECT_WITH_REASON`, `RESOLVE_CONFLICT`, `REOPEN`, `EXPIRE`로 제한한다. action마다 capability, exact scope, expected revision/CAS, reason code, evidence packet hash, decisionRef, audit record를 서버가 다시 검사한다. 단일 `approve all`, batch scope expansion, review UI 상태만 바꾸는 public activation은 제공하지 않는다. 거절은 이유와 재개 조건을, 미결/불완전은 빠진 field/source/owner를, 만료는 해당 action과 억제된 descendant를 분명히 보여준다.

기획 수용 계약은 ITC-31`–`ITC-37에 owner package completeness, EVIDENCE_READY 비권한, exact-scope approval, policy/assertion 분리, expiry/reopen, queue의 두 status axis·다음 action 표시를 연결한다. 현재 private ledger는 빈 `entries`와 전체 `OPEN` baseline이므로 이 계약은 현 상태를 승인 또는 화면 구현으로 승격하지 않는다. ledger에 실제 named owner evidence를 기록할 수 있는 경우에도 public manuals에 그 증거를 투영하지 않는다.

후보 review 화면과 API는 관리자/internal surface로 취급하고 pending candidate, packet, reviewer identity는 외부 공개 종목·시장 GET, 공용 검색 및 public catalog에서 제외한다. 공개 대상은 최신 승인 assertion을 참조하고 source rights, active common-stock eligibility, event attribution, publication gate를 모두 통과한 최소 projection뿐이다. 공개 응답은 승인 revision 또는 suppress 상태를 사용하며 stale 승인본이나 candidate fallback을 금지한다. 개인 note/watchlist는 crosswalk evidence와 섞지 않는다.

## 13. 현재 구현 범위

현재 운영은 마스터 파일 적재, 상품 분류, 유니버스 검증, 봉 캐시 갱신을 제공한다.

```text
POST /api/admin/instrument-universe-import
Content-Type: multipart/form-data

fields:
  kospi_code.mst
  kosdaq_code.mst
  NASMST.COD
  NYSMST.COD
  AMSMST.COD
```

운영 관리자에서는 5개 파일을 직접 업로드한다. 서버는 임시 디렉터리에 저장한 뒤 파싱·검증·bulk upsert를 실행한다. 서버 디렉터리를 지정하는 JSON 방식은 내부 자동화와 로컬 테스트용 fallback으로만 유지한다.

`sourceDirectory`에는 다음 5개 파일이 있어야 한다.

```text
kospi_code.mst
kosdaq_code.mst
NASMST.COD
NYSMST.COD
AMSMST.COD
```

일·주·월봉 캐시와 탐지 API는 신규 유니버스를 직접 사용한다. 적재 결과는 `instrument_universe_sync_runs`에 기록하고, 진단 API에서 원본·분류·건수를 함께 검증한다.

### 전체 마스터 동기화의 누락 티커 수명주기

- 5개 필수 원본 파일이 모두 읽히고 파싱 결과가 비어 있지 않을 때만 전체 마스터 동기화를 진행한다. 한 파일이라도 누락·빈 파일이면 활성 상태나 `missing_runs`를 변경하지 않는다.
- 마스터에 다시 나타난 티커는 upsert 시 `enabled=true`, `missing_runs=0`으로 복구한다.
- 정상 완료된 전체 마스터에서 처음 빠진 티커는 `missing_runs=1`로 남겨 유예한다. 다음 정상 완료 마스터에서도 빠지면 `missing_runs=2`, `enabled=false`로 전환한다. 가격·캔들·재무 이력은 삭제하지 않는다.
- 처리가 실패한 run은 누락 횟수를 올리지 않는다. run 이력에는 비활성화한 행 수를 `deactivated_count`에 기록한다.
- 단일 프로세스 내 중복 import 실행은 거절한다. 운영 배포가 다중 인스턴스로 바뀌면 이 보호를 DB 분산 잠금으로 대체하기 전까지 마스터 동기화 배포를 허용하지 않는다.
- 현재 importer는 파싱 전체를 먼저 확인하고 모든 upsert가 성공한 뒤에만 누락 횟수를 갱신한다. 중간 DB 오류가 나면 앞서 커밋된 upsert 배치는 남을 수 있으나, run은 실패로 표시되고 누락 티커는 비활성화되지 않는다. 재시도는 멱등 upsert로 수렴한다.

## 12. 공식 참고

- [KIS Developers](https://apiportal.koreainvestment.com/)
- 프로젝트 내 KIS 공식 문서: [`docs/references/README.md`](../references/README.md)
