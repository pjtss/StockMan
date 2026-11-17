# 개인 투자 thesis journal 기획

## 상태와 범위

- 상태: 제품 설계 제안. 승인·구현·운영 기능이 아니다.
- 목적: 사용자가 공시 기반으로 세운 가설과 반대 근거, 다음 검토 조건을 자신의 기록으로 남기고, 나중에 어떤 근거 revision을 보고 판단했는지 되짚을 수 있게 한다.
- 범위: 명시적으로 시작한 개인 기록, 정확한 공시 event/claim/snapshot 참조, 사전 review horizon/trigger, 정정 후 stale 표시, owner 전용 export/delete.
- 제외: broker 연동, 보유/거래/손익 추론, 자동 thesis 생성, 시스템 투자점수·매수/매도 추천, 사후에 정한 조건으로 과거 판단의 성공률을 계산하는 기능.

## 사용자 흐름

1. 사용자가 issuer dossier에서 `내 투자 가설 기록`을 직접 선택한다. 관심종목 등록, 종목 열람, 공시 알림만으로 journal row를 만들지 않는다.
2. 사용자는 자신의 가설 문구를 직접 작성하고, 선택적으로 당시 공개된 support claim과 counterclaim revision을 연결한다. 시스템은 공시 사실과 사용자 의견을 시각·저장·API 계약상 구분한다.
3. 사용자가 결과를 나중에 비교하고 싶다면 review horizon/trigger와 평가 기준을 결과를 보기 전에 선택해 revision/hash로 고정한다. 정책 선택지는 제안 UI 단계이며 owner 승인 전 기본값을 확정하지 않는다.
4. 새 공시, 정정, 철회 또는 근거 revision 변경이 생기면 영향 graph로 연결된 부분만 `REVIEW_REQUIRED`로 표시한다. impact 분모가 닫히지 않으면 영향을 받지 않았다고 추정하지 않는다.
5. 사용자가 수정하면 기존 기록을 덮어쓰지 않고 새 revision을 만든다. 과거 시점의 근거와 사용자 판단은 수정 당시의 snapshot에 남긴다.
6. 나중의 outcome review는 사전 고정한 horizon/measure와 rights-compliant price snapshot 및 동일 기준 benchmark가 있을 때만 수행한다. 결과는 그 시점의 특정 가설 기록에 대한 관측 요약이며 인과성, 전략 성과, 미래 수익 또는 일반 투자 추천을 뜻하지 않는다.

## 사용자 검토 trigger의 평가 경계

`reviewTriggerSetHash`는 trigger 내용·revision을 pin하는 식별자이지 자동 감시나 매매 규칙의 승인 표지가 아니다. 사용자가 thesis revision에 연결할 trigger는 조건, subject, 허용된 evidence rule/source scope, rights decision, coverage assertion, 유효 구간 및 평가 cutoff를 함께 참조한다. trigger는 source claim 정정, 공시된 milestone, 자본·유동성 사실, 상장·법적 상태 또는 사용자가 직접 선택한 review date처럼 관측·검토 대상의 종류를 표시한다. 자연어 조건은 사용자가 작성하고 의미 해석을 시스템이 임의로 확정하지 않는다.

자동 평가가 가능한 조건은 제한된 typed predicate로 표현한다: claim revision 변경, 명시된 structured fact 비교, 근거가 있는 event state, 또는 review due다. 수치 비교는 source field locator, 대상, 단위, 기간/as-of, 기준(예: 연결/별도), 비교 연산자, threshold 및 source revision을 모두 pin해야 한다. 단위·대상·기간·기준이 다르거나 필요한 변환 규칙이 승인되지 않았으면 비교하지 않고 `MANUAL_REVIEW_REQUIRED`로 둔다. 여러 조건은 `ALL` 또는 `ANY`를 명시하고 trigger set revision에 함께 pin한다. 일반 문장만 있는 조건은 threshold나 논리 연산자를 시스템이 만들어내지 않는다.

`REVIEW_DUE`는 사용자가 정한 검토 시점이 도래했다는 뜻만 가진다. 조건 충족, milestone 지연, thesis의 유효성 또는 매매 행동을 의미하지 않는다. 사용자는 검토 화면에서 원문 근거와 상태를 확인한 뒤 자신의 결론을 별도 review record로 남긴다. typed predicate로 판단할 수 없는 표현, source locator/권리/coverage가 빠진 경우는 자동 평가를 중단하고 수동 검토 상태와 원인을 노출한다.

각 trigger 평가는 조건 관측과 투자 결론을 분리한다. 일치 근거가 있으면 `OBSERVED_CONDITION_MET`는 검토를 열 뿐 thesis 무효·유효를 자동 판정하지 않는다. 근거가 없을 때 `NO_MATCH_IN_COMPLETE_SCOPE_AS_OF`는 rights 승인과 정확히 고정된 source/window/subject coverage 및 cutoff가 갖춰진 범위 안에서만 쓸 수 있으며, 조건이 과거 어느 때도 발생하지 않았다는 보편 명제가 아니다. 부분/unknown coverage, rights 미결, 출처 미제공, 시점 충돌은 각각 검증 불가 상태로 남긴다. milestone 날짜가 지났거나 후속 공시를 못 찾았다는 사실만으로 미실행·실패·취소를 만들지 않는다.

새 근거·claim revision·trigger 조건 변경은 새 evaluation snapshot/review revision을 만든다. 사전 cutoff와 과거 trigger set은 불변이며, 결과를 본 뒤 추가한 조건의 과거 평가는 confirmatory 성과로 소급하지 않는다. 시스템은 trigger 생성만으로 외부 조회·polling·예약 알림을 시작하지 않고, 사용자가 평가 후 기록한 결론도 매수·매도나 포트폴리오 변경 지시로 바꾸지 않는다. 합성 경계는 [`investment-thesis-review-trigger.v0.json`](../fixtures/disclosure/investment-thesis-review-trigger.v0.json)의 ITHR-01–14에서 다룬다.

개인 노트 입력 경계: 권리 미확정 원문은 본문을 붙여넣지 않는다. 본문이나 발췌를 메모에 복사·저장하지 않는다. 사용자가 근거를 연결할 때는 허용된 source link와 정확한 canonical claim/revision reference만 사용하며, 개인 문장은 canonical claim·reviewer 승인·공개 dossier 내용으로 승격되지 않는다. rights 또는 visibility를 확인할 수 없으면 본문이 포함된 note 저장을 거부하고 private owner scope를 유지한다. 이 경계의 수용 사례는 ITJ-49다.

## 논리 계약

`InvestmentThesisRevision`은 owner, issuer/instrument reference, authored statement reference, 작성시각, support/counterclaim revision refs, 생성 당시 publication snapshot, 사전 review policy revision/hash, stale state, visibility, retention state를 가진다. 기록이 수정되면 immutable revision을 append한다. 지원 claim과 반대 claim은 별도 배열/관계로 두고, 한쪽이 제거·정정되면 해당 dependency만 새 revision에 영향 표시한다.

Outcome 검토는 thesis revision과 분리된 append-only `ThesisReviewRecord`다. `scheduledReviewAt`, `reviewedAt`, 사전 고정 `reviewPolicyRevision`, evidence revision refs, 정확한 `outcomeMeasureRef`, 사용자 작성 결론, 한계 및 `supersedesReviewId`를 pin한다. 관측 상태는 `NOT_DUE`, `NOT_OBSERVED`, `OBSERVED_AS_OF`, `RIGHTS_BLOCKED`, `SOURCE_UNAVAILABLE`, `INCOMPLETE_WINDOW`, `NOT_ATTRIBUTABLE`을 구별한다. 미관측/권리차단/불완전 구간은 수익률 0이나 thesis 실패로 변환하지 않는다. 가격 지표는 사용자 가설의 사실 진위, 인과성 또는 시스템 평가 점수와 별도다. 사후 선택한 horizon·benchmark·기준은 confirmatory review가 될 수 없다.

### 가설 proposition 유형

한 journal에는 여러 개의 atomic `ThesisProposition`을 둘 수 있지만, 각 proposition은 한 가지 평가 가능한 명제만 표현한다. 제안 유형은 다음과 같다.

| 유형 | 명제 형태 | 필요한 시점/조건 | 검토 결과의 경계 |
|---|---|---|---|
| `FACTUAL_CLAIM` | issuer·증권·계약에 대해 이미 참/거짓을 확인할 수 있는 서술 | 명제의 `asOf`, 직접 연결한 source claim revision 및 반대 근거 | 권리 있는 1차 증거를 검토한다. 주가 방향은 사실 검증 근거가 아니다. |
| `FORECAST` | 미래의 관측 가능한 결과에 대한 전망 | 결과 확인 전에 고정된 horizon 및 측정값/단위 | 관측 결과와 사용자 예측을 비교한다. 투자전략의 일반 성과·인과성을 뜻하지 않는다. |
| `CONDITIONAL_SCENARIO` | 명시 조건이 발생했을 때의 조건부 결과 | 분리된 condition set, 충족 판정 근거 및 결과 horizon | 조건 미발생은 `NOT_TRIGGERED`; 결과 미확인은 `NOT_OBSERVED`이며, 둘 다 자동으로 반증 처리하지 않는다. |
| `MIXED_OR_UNCLEAR` | 사실·예측·시나리오가 섞였거나 대상을 특정할 수 없는 문장 | 사용자가 직접 의미를 분해·확인할 때까지 review block | 모델이 원뜻을 재작성·분해하지 않고 confirmatory 평가를 막는다. |

사용자가 문장을 직접 나눌 때 각 proposition은 parent thesis revision을 공유하되 자기 source refs, type 및 검토 정책을 가진다. 조건부 시나리오에서는 condition truth와 consequence observation을 별도 상태로 보관한다. 이전 review에 없던 proposition을 나중에 추가해도 과거 review/성과 분모에 소급 삽입하지 않는다.

### 예측 결과 요약과 분모

예측 review를 여러 건 요약하는 경우 사용자가 선택한 `FORECAST` cohort의 정책 revision, membership rule, `cohortFrozenAt`, 평가 정보 cutoff, 대상 window, 예정 review 시점이 도래한 전체 proposition set과 disposition 분모를 먼저 고정한다. cutoff 의미와 cohort close 시각/조건은 owner 승인 전 제품 기본값으로 정하지 않는다. 관측 완료 항목만 선택한 적중률·수익률 headline을 만들지 않는다. 결과 누락, 권리차단, 원천 미제공, 불완전 window, 사용자 철회는 서로 다른 disposition count로 남기며, 미해결/미승인 분모이면 완전성·정확도 요약은 숨긴다. 조건부 scenario는 condition이 실제 발생한 표본만 분리해 설명하고 `NOT_TRIGGERED`를 일반 forecast miss로 합산하지 않는다. 사실 주장의 evidence adjudication도 예측 적중률과 별도다.

### Cutoff 이후의 원천·결과 자료

각 정보는 최소 세 시각을 분리한다: underlying `sourceOccurrenceAt`, 최초 공개 확인 `sourceFirstAvailableAt`, 시스템 취득 `systemRetrievedAt`. review는 `evaluationInformationCutoffAt`과 `outcomeDataAsOf`도 고정한다. 하나의 날짜나 현재 최신 상태로 이 시각을 합치지 않는다. source가 cutoff 전에 공개됐지만 시스템이 나중에 취득했다면 `LATE_INGEST_ON_TIME_SOURCE`; cutoff 뒤 처음 공개된 결과 근거는 `LATE_OUTCOME_EVIDENCE`; cutoff 뒤에 밝혀진 기존 전제의 정정은 `LATE_PREMISE_CORRECTION`; 늦게 들어온 조정 가격은 `LATE_PRICE_REVISION`으로 분리한다.

기록 생성 시의 forecast information set은 바뀌지 않는다. late evidence는 적법한 이용권, exact source revision 및 새 review를 통해서만 반영하며, 기존 review/snapshot을 수정하지 않고 `supersedesReviewId`로 잇는다. 정정된 premise의 영향이 미확정이면 해당 결과를 `REVIEW_REQUIRED`로 표시하고 기존 결론을 정상 최신 상태로 노출하지 않는다. 발견된 eligible forecast가 frozen cohort membership 밖에 있었으면 분모를 조용히 보정하지 않는다. `REOPEN_REQUIRED`/`DENOMINATOR_UNVERIFIABLE`로 요약을 억제하고 membership reconciliation 뒤 새 summary revision을 만든다. 분모 변화가 실제 사용자 record를 보존해야만 추적 가능하다면 삭제·보존 정책 승인이 없는 한 숫자 성과 summary를 포기한다.

### 시간대·거래일·시각 충돌

원문 시각 문자열, 시각 정밀도, 원천이 제공한 timezone/offset, 최초 공개 근거, 파싱된 UTC instant 및 해석에 사용한 timezone database release를 함께 보존한다. 로컬 시각만 있고 timezone이 없으면 종목명/시장코드로 추측하지 않는다. DST fold로 두 UTC instant가 가능한 시각은 `AMBIGUOUS_DST`, spring gap에 존재하지 않는 로컬 시각은 `NONEXISTENT_LOCAL_TIME`로 두며 offset/fold 근거가 없으면 confirmatory review와 session 배정을 차단한다. 날짜만 있는 공시는 가능한 시장 세션 중 하나를 골라 대입하지 않는다.

평가시각은 UTC instant와 IANA timezone ID의 local rendering을 함께 기록하고, filing source time와 exchange session/calendar는 별도로 고정한다. KST 날짜가 같다는 이유로 미국·한국 session을 같은 날로 묶지 않는다. exchange calendar snapshot은 거래일, early close, 예외/임시 변경과 venue를 포함한 revision으로 pin한다. 일반 월~금 정규시간을 휴일/조기폐장 기준으로 대체하지 않는다. 공식 거래소 calendar가 바뀌어 세션 할당이 달라지면 새 review revision을 append하고 과거 할당을 보존한다.

접수 timestamp, 공개 availability timestamp, 문서 내부 표기 또는 vendor timestamp가 충돌할 때 우선순위 policy가 승인되지 않았으면 `SOURCE_CONFLICT`/`UNRESOLVED_TIMING`으로 남긴다. filing acceptedAt을 first public availability로 치환하지 않는다. resolution rule이나 source time이 달라지면 original information cutoff 및 review는 유지하고 별도 재평가 결과를 만든다.

### 발행인·증권·상장 venue 귀속

Thesis 주체는 issuer와 거래 가능한 instrument를 별도 참조한다. 발행인 차원의 사실 claim도 가격 outcome은 사용자가 명시 선택한 instrument에만 귀속한다. outcome snapshot은 최소 `instrumentRef`, `legalIssuerRef`, `instrumentClass`, `venueId`, 해당 시점의 listing epoch 유효 시작/종료, `instrumentMasterRevision`, `marketCalendarId/revision`, IANA timezone 및 identity evidence reference를 함께 pin한다. listing epoch 경계 또는 마스터 상태가 확인되지 않으면 `NOT_ATTRIBUTABLE`로 둔다. identity/alias의 효력 구간과 관측 시각, 공식 snapshot/hash, 관계 근거 및 검토 상태는 기존 [ITC 시점별 crosswalk 계약](./kr-disclosure-event-architecture.md#종목-identity와-시점별-코드분류-crosswalk--itc-01itc-37)을 재사용한다. thesis journal은 해당 승인된 assertion ID/revision과 `KR-MASTER-SNAPSHOT-01`, `KR-EVENT-ATTRIBUTION-01` decision revision을 참조하고 새 issuer/security identity 체계를 중복 정의하지 않는다.

### 공시 subject에서 thesis 가격 outcome까지의 attribution lineage

공시 기반 thesis는 세 연결을 구분해 pin한다. (1) filing party/filer에서 법인 issuer로 가는 entity attribution, (2) event subject/직접 영향 claim에서 해당 issuer의 instrument로 가는 security attribution, (3) 사용자가 선택한 eligible instrument·listing epoch에서 가격 관측으로 가는 outcome attribution이다. 앞 단계의 issuer 일치나 filer의 현재 ticker는 다음 단계의 승인을 대신하지 않는다. 분석자가 issuer 수준 사실을 기록할 수 있어도 직접 영향 claim과 instrument eligibility가 확인되지 않은 가격 outcome은 `NOT_ATTRIBUTABLE`이다.

`InstrumentAttributionSnapshot`에는 `identityAssertionId/revision`, `securityIdentityEvidenceRef`, `eligibilityDecisionRef`, `attributionDecisionRef`, bound policy decision ID/revisions, `eventSubjectRef`, `instrumentRef`, issuer relation, class, venue/listing epoch, master snapshot ID/hash, `validFrom/validUntil`, `observedAt`, rights disposition을 같은 snapshot에 저장한다. `KR-MASTER-SNAPSHOT-01`의 승인만으로 assertion을 `APPROVED_ASSERTION`으로 만들지 않으며, `KR-EVENT-ATTRIBUTION-01`의 승인만으로 보통주 eligibility를 추정하지 않는다. 실제 instrument outcome에는 두 정책 decision의 현재 유효 revision과 각각의 assertion-level review가 필요하다.

검토 생성과 outcome 노출 시점에 pinned identity assertion이 현재 승인 revision과 다르거나 decision이 만료/철회/재개됐으면 기존 thesis/review를 수정하지 않고 영향 review를 `NOT_ATTRIBUTABLE` 또는 `REVIEW_REQUIRED`로 억제한다. successor instrument로 자동 retarget하지 않는다. 영향 graph 분모를 완전하게 열거하지 못하면 전체 영향 없음 판정을 금지하고 summary를 `REOPEN_REQUIRED`로 둔다. 독립된 assertion correction은 해당 dependency review만 stale시키며, 기존 review와 무관한 기록은 불변으로 둔다. acceptance는 ITJ-38–ITJ-43에서 revision pin, filer-only 오귀속 차단, policy/assertion 승인 분리, 만료·정정 전파와 불완전 dependency denominator를 확인한다.

### Claim locator와 attribution 보류 사유

공시 목록의 issuer/filer metadata는 제출 식별·발견에만 사용한다. OpenDART [공시검색 guide](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001)는 응답의 `corp_name/corp_code/stock_code`를 공시대상회사, `flr_nm`을 공시 제출인으로 정의하고, 이 목록 field가 계약 party·영향 종목의 역할까지 증명한다고 규정하지 않는다. SEC [Form 8-K Item 1.01](https://www.sec.gov/divisions/corpfin/forms/8-k.htm)은 특정 material agreement의 parties와 registrant/affiliate와 parties 간 material relationship을 별도로 설명하도록 한다. 따라서 parser가 Item section text를 추출했거나 목록에서 filer ticker를 찾았다는 이유만으로 claim-level party role/direct impact를 승인하지 않는다. source metadata와 문서의 역할·주장 근거는 서로 다른 assertion이다.

각 issuer fact 또는 direct-impact claim은 `filingId`, immutable `documentRevisionId/contentHash`, `claimId/revision`, `claimKind`, `partyRef/partyRole`, `eventSubjectRef`, `exactSourceLocator`, locator type, source rights decision ref, extraction/review status를 고정한다. `exactSourceLocator`는 허용되는 경우 document/section/paragraph 또는 structured endpoint+field+response record를 재현할 수 있어야 한다. 정규화 텍스트 offset만 남는 경우 원문 revision/hash와 normalizer revision에도 결박하고, 재현 불가능하거나 권리상 locator를 보존할 수 없으면 claim evidence를 `UNRESOLVED`로 둔다. filing revision이 바뀌어 locator/hash가 stale되면 해당 claim을 자동 재사용하지 않고 새 claim revision과 review를 요구한다.

Party role은 filing 전체에 한 번만 붙이는 label이 아니라 claim/event subject별 edge로 저장한다. 제안 role set은 `FILER`, `REGISTRANT`, `REPORTING_ISSUER`, `AGREEMENT_PARTY`, `OBLIGOR`, `BENEFICIARY`, `COUNTERPARTY`, `AFFECTED_ISSUER`, `SUBSIDIARY`, `UNDERLYING_ISSUER`, `OTHER_NAMED_PARTY`, `ROLE_UNRESOLVED`다. 한 entity가 여러 역할을 맡으면 각 role과 근거 locator를 별도 edge로 남기며, 여러 entity가 같은 role 후보인 경우 수를 축약·임의 선택하지 않는다. event별 subject cardinality와 후보별 disposition이 닫히지 않으면 instrument outcome은 보류한다.

Review surface는 원문/claim 권리가 허용하는 범위에서 아래 사유를 표시한다. 개인 thesis에는 내부 후보나 다른 사용자의 정보는 보여주지 않고, 선택된 evidence에 대한 공개 가능한 중립 사유만 사용한다.

| 보류 사유 | 의미와 표시 | 동작 |
|---|---|---|
| `FILER_ONLY` | filing metadata의 제출자만 확인 | issuer-level note는 허용 가능; instrument price outcome 차단 |
| `PARTY_ROLE_UNRESOLVED` | 이름은 있으나 claim별 역할/대상 관계가 특정되지 않음 | 역할 검토 필요; ticker 추론 금지 |
| `DIRECT_IMPACT_EVIDENCE_MISSING` | issuer/instrument에 이어지는 권리·의무·현금흐름·자산/영업 영향 locator 없음 | 해당 instrument outcome `NOT_ATTRIBUTABLE` |
| `CLAIM_LOCATOR_UNAVAILABLE` | 문서/field/정정 revision의 evidence 위치를 재현할 수 없음 | evidence 재취득·검토 전 claim 미확정 |
| `ENTITY_CROSSWALK_UNRESOLVED` | party와 법인 issuer 연결이 미승인/충돌 | 영향 issuer를 확정하지 않음 |
| `INSTRUMENT_CROSSWALK_UNRESOLVED` | issuer에서 security identity/class/venue로 이어지는 assertion이 미승인 | instrument 선택·가격 outcome 차단 |
| `POLICY_DECISION_OPEN` | 필요한 master/attribution owner decision이 유효 승인 상태가 아님 | `APPROVED` 추정 금지, 재검토 대기 |
| `ASSERTION_REVIEW_PENDING` | 정책은 승인됐더라도 이 claim/identity assertion의 개별 review가 미완료 | public/price consumer에 전달하지 않음 |
| `CONFLICTING_PARTIES_OR_CLAIMS` | filing, attachment, structured field 또는 correction 간 role/subject conflict | 관련 subject만 quarantine; 원 revision 보존 |
| `SOURCE_RIGHTS_UNRESOLVED` | 해당 locator/field의 열람·파생·표시 범위가 미결 | 제한된 neutral status만 표시하거나 숨김 |
| `ELIGIBILITY_UNRESOLVED` | active `COMMON_STOCK`, cap 또는 event-time eligibility 증거가 미충족 | ticker/outcome 노출 금지 |
| `DEPENDENCY_SNAPSHOT_STALE` | pinned filing, claim, identity, decision, master 또는 rights revision이 바뀜 | review stale 후 재평가; 이전 결과 덮어쓰기 금지 |
| `IMPACT_DENOMINATOR_INCOMPLETE` | 수정/철회/관계 변경에 영향받은 thesis consumer 전체를 열거할 수 없음 | 영향 없음 주장·성과 요약 금지, `REOPEN_REQUIRED` |

사유는 여러 개 동시에 남길 수 있으며 한 가지 대표 사유로 우선순위를 감추지 않는다. 화면은 “발견되지 않음”과 “역할/근거 미해결”, “권리상 숨김”, “아직 검토하지 않음”을 구분한다. 이 분류는 검토 대기 설명이며 사실 부재·비호재 판정이나 매매 지시가 아니다. 현재 SEC parser는 registrant/ticker/form/date metadata 및 Item 구간 text 추출을 제공하고, DART 자동화는 목록 후보 중심이다. 두 입력의 현행 프로젝트 코드가 claim별 party-role graph, stable exact locator 또는 승인된 event subject를 완성한다는 뜻은 아니며 이를 확인하지 못한 것은 구현 gap으로 남긴다.

같은 발행인의 복수 상장·거래 venue, ticker 변경, 상장 이전은 하나의 연속된 가격 시계열로 자동 합치지 않는다. 새 venue/instrument는 공식 마스터 또는 1차 증거로 관계가 확인되어도 별도 epoch로 취급하고, 이전 epoch와 이어 계산하려면 사용자가 선택한 평가 기준과 가격 조정·환산 규칙의 별도 승인 및 rights 확인이 필요하다. 과거 snapshot은 원래의 instrument, venue, calendar 및 master revision을 보존한다. 티커·회사명 일치, 유동성 우위, 거래소의 “primary” 추정만으로 instrument identity나 과거 outcome을 정하지 않는다.

프로젝트의 보통주 전용 종목 원칙에 따라 실제 종목 가격 outcome 대상은 공식 마스터에서 활성 `COMMON_STOCK`으로 확인된 instrument로 제한한다. ADR/ADS 등 depositary receipt는 별도 증권 클래스이며 원주를 나타내는 비율도 있을 수 있으므로, 자동으로 보통주에 포함하거나 원주와 가격을 연결·이어 붙이지 않는다. 공식 master 분류가 depositary receipt/DR이거나 미확인인 경우 해당 instrument의 thesis 가격 outcome은 차단한다. 연결 정보가 연구 맥락상 필요하면 deposit agreement/Form F-6 등 근거 ref와 유효기간을 별도 relation으로 기록할 수 있지만, 이 relation은 종목 자격·가격 연속성·대체 거래대상 승인을 뜻하지 않는다. SEC Investor.gov의 ADR 안내와 Form F-6는 예탁증권 및 예탁 비율을 설명한다([ADR Investor Bulletin](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-88), [SEC Form F-6](https://www.sec.gov/files/formf-6.pdf)).

여러 활성 보통주 instrument가 확인되더라도 저널이 임의로 primary venue를 선택하지 않는다. 사용자가 평가 instrument를 특정하지 않았거나 issuer/instrument crosswalk가 코드 재사용·다중 클래스 때문에 모호하면 결과를 막고 명시적 선택 또는 증거 보강을 요구한다. venue, listing status, instrument class, issuer relation 또는 exchange calendar의 유효기간 수정은 영향을 받는 review만 `REVIEW_REQUIRED`로 만들고 새 review revision을 append한다. 이는 thesis review 자체의 종목 대상·가격 관측 pin을 위한 소비 계약이며, 현행 DB가 이 history를 보유한다고 뜻하지 않는다.

시간 정책의 참고 기준은 [IANA timezone database 설명](https://data.iana.org/time-zones/theory.html) 및 venue 공식 calendar다. IANA는 지역별 시간 규칙과 역사자료 정확성 범위가 다를 수 있음을 설명하고, NYSE/Nasdaq은 연도별 휴장·조기폐장 시간을 공개한다([NYSE Hours & Calendars](https://www.nyse.com/trade/hours-calendars), [Nasdaq Trading Schedule](https://www.nasdaq.com/market-activity/stock-market-holiday-schedule)). 이 링크들은 적용할 데이터/계약 권한을 대신하지 않는다. 운영에서는 원문/공식 calendar snapshot, release/effective date, retrieval time, venue scope와 hash를 고정해야 한다.

owner-only 요약의 표본 기간과 선택 규칙을 결과 관측 전에 고정한다. 사실·예측·조건부 scenario 또는 서로 다른 measure/horizon을 하나의 accuracy 수치로 합치지 않는다. 개인 record 삭제는 우선한다. 승인된 비식별 집계 보존 정책이 없다면 해당 record에 의존한 cached summary를 invalidate하고 완전 cohort 성과를 주장하지 않는다. 별도 동의·보존 결정 없이 deletion tombstone을 개인별 성과 계산을 위해 남기지 않는다.

Thesis는 canonical disclosure event, approved claim 또는 시스템 평가를 수정하지 않는다. 개인 원문은 public dossier/API, 알림, 검색 index, 다른 사용자, 공통 aggregate analytics에서 기본 제외한다. 집계·모델 분석 사용은 별도 목적·동의·권리·보존 승인을 요구하며 기본 동작은 사용하지 않음이다. owner scope는 저장소/DAL 권한 경계에서 확인한다.

## 안전 및 검토 상태

| 조건 | 예상 동작 |
|---|---|
| opt-in 없음, watchlist만 존재 | thesis를 만들지 않음 |
| 근거 수정/철회 | 연결된 revision만 stale; 과거 thesis revision 보존 |
| 영향 분모 미완결 | `REVIEW_REQUIRED`; unaffected로 단정하지 않음 |
| 사전 horizon/criterion 없이 결과를 본 뒤 평가 요청 | confirmatory 평가 차단, 사용자가 작성한 탐색 메모만 허용 |
| price rights 미승인 또는 최신 수정값만 존재 | 가격 성과 귀속·replay·public claim 차단 |
| owner mismatch 또는 public projection 경로 | 존재 누출 없이 거부/제외 |
| 삭제 요청과 미결 backup retention | 활성 개인 record 삭제 절차를 진행하되 backup 완전 삭제를 주장하지 않음 |

## 의사결정 및 수용 계약

제품 문구/opt-in 및 개인기록 의미는 `KR-PERSONAL-THESIS-UX-01`, 개인 정보 접근·삭제·보존은 `KR-OPERATIONAL-SECURITY-01`과 `KR-RETENTION-01`, 화면/API revision 일관성은 `KR-API-UI-CONSISTENCY-01`, 가격 outcome은 `KR-MARKET-DATA-RIGHTS-01`과 `KR-EVENT-STUDY-POLICY-01`, 통합 acceptance는 `KR-END-TO-END-ACCEPTANCE-01`의 독립 승인 범위다. 어느 결정도 다른 결정을 자동 승인하지 않는다.

합성 수용 조건은 [`investment-thesis-journal.v0.json`](../fixtures/disclosure/investment-thesis-journal.v0.json)의 `ITJ-01`–`ITJ-49`다. 이는 개인정보 격리, thesis/proposition/review revision pinning, 사후 기준 금지, 정정 영향, rights-aware outcome/missingness, late evidence와 cutoff, timezone/DST/source-time conflict/calendar revision, issuer/instrument/venue epoch 귀속, ADR 제외 및 가격 시계열 분리, crosswalk/eligibility/event attribution decision revision pinning과 무효화, claim locator/party-role 보류 사유, cohort freeze/reopen, 사실 claim·forecast·conditional scenario 구분, forecast cohort 분모, 가격관측과 사실검증 분리, 추천과 구분, 삭제/export 및 요약 무효화, 권리 미확정 원문을 개인 메모에 복사하지 않고 허용된 claim/revision reference만 연결하는 경계를 문서 검사에 연결한다. 모든 실제 사용자 데이터, runtime 권한 격리, 삭제·backup 처리, usable UX 및 투자 성과 해석은 미검증이다.

## 다음 단계

1. 사용자 인터뷰로 가설/반대 근거/검토 조건 입력이 이해 가능한지 확인한다. 개인 메모 본문을 수집하지 않는 prototype부터 검토한다.
2. UX·privacy owner가 consent, export/delete, 기본 공개 범위와 wording을 승인한다.
3. rights 및 retention 결정 후 저장 구조, route inventory, owner-scoped authorization threat model을 설계한다.
4. source correction, stale dependency, account deletion, rights expiry를 포함한 독립 gold set와 acceptance 기준을 승인한다.
5. 승인 전에는 구현·개인데이터 적재·성과 정확도 주장을 진행하지 않는다.
