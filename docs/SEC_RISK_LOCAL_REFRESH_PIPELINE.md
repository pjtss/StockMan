# 로컬 SEC 리스크 갱신 파이프라인 명세

## 1. 목적

CRON이나 예약 실행 없이, 사용자가 로컬에서 명시적으로 실행하는 SEC 리스크 갱신 작업을 안정적으로 수행하기 위한 운영 명세다.

대상은 다음 조건을 모두 만족하는 미국 보통주다.

- 시장: `NAS`, `NYS`, `AMS`
- `enabled=true`, `daily_active=true`
- `instrument_type='COMMON_STOCK'`
- ETF 및 비보통주 제외
- 최신 현재 시가총액 `market_cap_usd <= 50,000,000`

결과는 `sec_stock_risks.risk` JSONB에 저장한다. 리스크 item은 SEC 원문 `originalText`와 한국어 `koreanText`를 모두 가져야 한다.

## 2. 실행 원칙

1. 실행은 로컬 명령으로만 시작한다. CRON, 예약 함수, 운영 서버 쓰기 호출은 사용하지 않는다.
2. 기본 모드는 `DRY_RUN`이다. 검토된 결과를 확인한 뒤에만 `APPLY`를 허용한다.
3. SEC 조회는 읽기 전용이며, 모든 요청에 식별 가능한 `SEC_USER_AGENT`를 포함한다.
4. SEC 요청은 초당 최대 10회로 제한하고, 429·403·5xx는 backoff 후 제한 횟수만 재시도한다.
5. 한 종목의 실패가 다른 종목의 결과를 오염시키지 않도록 종목별 상태를 분리한다.
6. DB 반영은 종목 단위 transaction으로 수행한다. 검증되지 않은 리스크는 기존 DB 값을 덮어쓰지 않는다.
7. 동일 실행을 다시 해도 중복 리스크 item이나 중복 공시가 생기지 않도록 accession과 `riskId`를 기준으로 멱등 처리한다.
8. 자격증명·SEC User-Agent 원문·DB 접속 문자열·전체 SEC 원문을 콘솔에 출력하지 않는다.

## 3. 실행 인터페이스

권장 실행기: `scripts/refresh-sec-risks-local.mjs`

```powershell
# 1단계: 대상·공시·리스크 후보만 수집하고 DB에는 쓰지 않음
node --env-file=.env.local scripts/refresh-sec-risks-local.mjs --mode=DRY_RUN

# 2단계: dry-run 산출물을 확인한 뒤 동일 실행 ID를 적용
node --env-file=.env.local scripts/refresh-sec-risks-local.mjs --mode=APPLY --run-id=<RUN_ID>
```

필수 환경변수:

- `LOCAL_DATABASE_URL` 또는 로컬 `DATABASE_URL`
- `SEC_USER_AGENT`

금지:

- 운영 DB URL로 실행
- `--mode=APPLY` 없이 dry-run 결과를 자동 적용
- `SEC_USER_AGENT`가 없거나 placeholder인 상태의 SEC 요청

## 4. 파이프라인 단계

```text
환경·DB 사전검사
  → 대상 유니버스 스냅샷 생성
  → 현재 시총 검증
  → SEC ticker/CIK 매핑
  → Submissions 수집
  → primary document 수집·정규화
  → 리스크 후보 판정
  → 원문·한국어 JSONB 계약 검증
  → dry-run 보고서 저장
  → 사용자 확인
  → 종목 단위 DB transaction 적용
  → 적용 후 GET·DB 대조 검증
```

### 4.1 사전검사

검사 항목:

- `.env.local`이 UTF-8로 읽히는지
- SEC User-Agent가 회사/서비스 식별자와 연락처를 포함하는지
- DB 호스트가 로컬 허용 목록인지
- `sec_stock_risks` 테이블과 V143 migration이 존재하는지
- 이전 실행이 `RUNNING` 상태로 남아 있지 않은지
- 저장 공간과 네트워크 연결 가능 여부

하나라도 실패하면 SEC 요청과 DB 변경을 시작하지 않는다.

### 4.2 대상 스냅샷

대상 조회 결과를 실행별로 고정한다. 실행 중 시총이나 유니버스가 변해도 대상이 바뀌지 않아야 한다.

저장할 스냅샷 필드:

```json
{
  "market": "NAS",
  "ticker": "GCTK",
  "companyName": "Glucotrack, Inc.",
  "marketCapUsd": 6800843,
  "marketCapObservedAt": "2026-09-29T18:03:04.102Z",
  "instrumentType": "COMMON_STOCK",
  "isEtf": false
}
```

시총 없음, 보통주 분류 불명, 비활성, ETF이면 `EXCLUDED`로 기록하고 SEC 조회를 하지 않는다.

### 4.3 SEC 수집

종목별로 다음 순서로 수집한다.

1. SEC 공식 ticker·CIK 매핑
2. `data.sec.gov/submissions/CIK##########.json`
3. 필요한 accession의 filing index
4. filing index에서 primary document 확인
5. SEC Archives의 primary document 원문

수집 상태:

- `MAPPED`
- `SUBMISSIONS_FETCHED`
- `DOCUMENT_FETCHED`
- `NO_RECENT_FILING`
- `RETRYABLE_FAILURE`
- `PERMANENT_FAILURE`

제출 인덱스를 원문으로 저장하지 않는다. primary document 확인에 실패하면 해당 공시는 분석 대상에서 제외한다.

### 4.4 후보 판정

후보 판정은 자동 투자판정이 아니라 Codex가 검토할 공시를 줄이는 단계다.

우선 검토 Form:

- `8-K`, `8-K/A`
- `6-K`, `6-K/A`
- `10-Q`, `10-K`, `NT 10-Q`, `NT 10-K`
- `S-1`, `F-1`, `S-3`, `F-3`, `424B3`, `424B4`, `424B5`
- `20-F`, `20-F/A`
- Nasdaq 상장유지·상장폐지 관련 공시

우선 검토 위험 범주:

- 자금조달·공모·전환증권·워런트·희석
- 현금·계속기업·재무보고 지연
- Nasdaq bid-price·상장유지·상장폐지
- 임상 중단·실패·FDA 지연 또는 규제 불확실성
- 계약 해지·채무불이행·소송
- 역분할·발행주식수 증가·등록 유동화

단순히 제목이나 키워드가 일치한다는 이유만으로 리스크를 저장하지 않는다. 원문 문장과 의미가 확인되어야 한다.

### 4.5 JSONB 생성·검증

각 item은 다음 필드를 가진다.

```json
{
  "riskId": "offering-dilution",
  "category": "DILUTION",
  "severity": "HIGH",
  "direction": "NEGATIVE",
  "status": "ACTIVE",
  "summary": "공모 및 워런트에 따른 잠재 희석",
  "originalText": "SEC 원문에서 필요한 최소 문장",
  "koreanText": "원문에 대응하는 한국어 번역·해석",
  "details": "수치와 영향 범위를 구분한 설명",
  "observedAt": "2026-09-29",
  "impactWindow": { "label": "NEAR_TERM", "from": "2026-09-29", "to": "2026-10-06" },
  "evidence": [{ "source": "SEC", "form": "424B5", "accession": "000000000000000", "url": "https://www.sec.gov/Archives/...", "filingDate": "2026-09-24", "section": "Offering" }],
  "confidence": "HIGH",
  "limitations": ["실제 주가 방향은 보장하지 않음"]
}
```

검증 실패 조건:

- `schemaVersion !== 2`
- `riskId` 중복
- `originalText` 또는 `koreanText` 공백
- SEC accession·허용 SEC URL 없음
- 원문에 없는 수치나 일정이 추가됨
- severity·direction·status enum 오류
- JSONB 크기 100,000자 초과

검증 실패 시 해당 종목은 `REJECTED`이며 기존 DB 리스크는 유지한다.

## 5. 멱등성·부분 실패 처리

### 실행 ID

모든 실행은 `runId`를 가진다. 실행 산출물은 로컬 `.tmp/sec-risk-refresh/<runId>/`에 저장한다.

```text
universe.json
submissions.jsonl
documents/<accession>.json
candidate-risks.json
validation.json
apply-result.json
```

### 재실행

- 동일 `runId`의 동일 accession은 다시 저장하지 않는다.
- 동일 `riskId`는 객체 단위로 병합하며, 최신 원문 근거가 있으면 해당 item만 교체한다.
- 다른 risk item은 보존한다.
- 기존 리스크를 비우려면 명시적으로 `status=RESOLVED` 또는 별도 삭제 명령을 사용한다. 자동으로 배열을 비우지 않는다.

### 실패 정책

| 실패 | 처리 |
|---|---|
| 한 종목 CIK 매핑 실패 | 해당 종목만 제외, 전체 실행 계속 |
| SEC 429/5xx | backoff 후 최대 4회 재시도 |
| SEC 403/User-Agent 오류 | 즉시 실행 중단, DB 미변경 |
| primary document 실패 | 해당 accession 제외, 기존 DB 유지 |
| JSONB 검증 실패 | 해당 종목 reject, 기존 DB 유지 |
| DB transaction 실패 | 해당 종목 rollback, 다른 종목 계속 |
| DB 연결/스키마 실패 | 전체 apply 중단 |

실행 종료 상태:

- `SUCCEEDED`
- `SUCCEEDED_WITH_ERRORS`
- `DRY_RUN_READY`
- `FAILED_PRECHECK`
- `FAILED_SOURCE`
- `FAILED_DATABASE`

## 6. APPLY 게이트

`APPLY` 전에 다음을 모두 확인한다.

- 대상 수와 제외 수
- SEC 수집 성공·실패 수
- 신규·갱신·변경 없음 리스크 수
- reject 종목과 reject 사유
- 모든 risk item의 SEC URL·accession
- 기존 리스크를 삭제하는 작업이 없는지
- 실행 대상이 시총 5,000만 달러 이하인지

dry-run 결과에 `approved=true`가 없으면 APPLY를 거부한다. 승인은 로컬 파일에만 기록하고 운영 API로 전송하지 않는다.

## 7. API 연계

파이프라인은 DB에 직접 SQL을 반복 실행하지 않고 repository와 API의 동일한 JSONB 검증기를 사용한다.

- 단수 조회: `GET /api/us/sec-risks?market=NAS&ticker=GCTK`
- 복수 조회: `GET /api/us/sec-risks?market=NAS&tickers=GCTK,JAGX`
- 단수 적용: `PATCH /api/us/sec-risks?market=NAS&ticker=GCTK`
- 복수 적용: `PATCH /api/us/sec-risks`의 `items[]`

API는 관리자 인증을 요구하지 않지만, 요청 크기 제한·JSONB schema 검증·SEC evidence 검증·bulk transaction은 항상 적용한다.

## 8. 사후 검증

APPLY 후 각 성공 종목에 대해 GET을 다시 호출해 다음을 비교한다.

- market·ticker·companyName
- risk schemaVersion
- riskId 개수와 원문·한국어 존재 여부
- accession·URL 목록
- `updatedAt` 변경 여부

DB 직접 검증 SQL:

```sql
SELECT market, ticker, company_name,
       risk->>'schemaVersion' AS schema_version,
       jsonb_array_length(risk->'items') AS risk_count,
       updated_at
  FROM sec_stock_risks
 WHERE market = 'NAS' AND ticker = 'GCTK';
```

## 9. 테스트·완료 기준

필수 테스트:

- 5,000만 달러 초과 종목이 대상에서 제외됨
- ETF·비보통주·분류불명 종목이 fail-closed 됨
- 원문 또는 한국어가 없는 item이 거부됨
- 잘못된 SEC URL·accession이 거부됨
- 단수 GET/PATCH
- 복수 GET/PATCH
- PATCH에서 전달하지 않은 item이 보존됨
- bulk PATCH 하나 실패 시 전체 rollback
- 429/5xx 재시도 및 403 즉시 중단
- 동일 runId 재실행 시 중복 item이 생성되지 않음
- APPLY 실패 시 기존 DB 리스크가 유지됨

완료 판정은 다음 증거가 모두 있을 때만 한다.

1. precheck 통과 로그
2. dry-run JSON과 승인 기록
3. SEC 수집·검증 결과
4. DB transaction 결과
5. GET 사후 대조 결과
6. 실패·제외 종목 목록

## 10. 현재 구현과의 연결

- 저장소: `lib/sec-stock-risk-repository.ts`
- API: `app/api/us/sec-risks/route.ts`
- 테이블 migration: `db/migration/V143__create_sec_stock_risks.sql`
- JSONB 계약: `docs/SEC_RISK_MANAGEMENT_DESIGN.md`
- CRON·예약 실행: 구현하지 않음
