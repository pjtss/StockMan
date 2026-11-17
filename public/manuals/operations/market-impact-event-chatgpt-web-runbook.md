# 공시 주가 영향 이벤트 — ChatGPT 웹 작업 매뉴얼

## 목적과 역할

이 매뉴얼은 ChatGPT 웹에서 DART/SEC 공시를 확인하고, 분석 결과를 프로젝트의 단일 관리 파일 `data/market-impact-events.json`에 반영할 때 따른다. ChatGPT는 근거 기반 분석과 JSON 초안 작성을 맡는다. 운영 DB 접속, 운영 서버 명령 실행, 공개 API 쓰기는 맡지 않는다.

현재 데이터 계약과 필드 의미는 [공시 이벤트 설계](../architecture/market-impact-events-design.md), 국내 구조 개선 제안 및 미승인 항목은 [국내 보통주 공시 이벤트 구조 설계](../architecture/kr-disclosure-event-architecture.md), 미국 일정·임상 분석 세부 규칙은 [미국장 이벤트 분석 표준](./us-market-event-analysis-standard.md)을 함께 따른다. 국내 구조 설계는 아직 구현 계약이 아니므로 이 런북의 기존 절차를 자동으로 바꾸지 않는다.

## 시작 전 준비

1. 저장소 연결 기능을 사용하는 경우 최신 `oci` 브랜치의 `data/market-impact-events.json`을 연다. 연결된 저장소가 없으면 저장소에서 최신 파일을 내려받아 ChatGPT 대화에 첨부한다. 오래된 대화의 JSON이나 DB 조회 결과를 최신 원본으로 간주하지 않는다.
2. 분석할 공시의 공식 원문 URL을 제공하거나 ChatGPT 웹에서 공식 원문을 연다.
   - 국내: DART 접수번호와 공시서류 원문
   - 미국: SEC CIK, ticker, accession, filing index, 주 문서 및 관련 Exhibit
3. 공식 원문을 열 수 없거나 핵심 사실을 확인할 수 없으면 분석 완료로 표시하지 않는다. 근거를 확인할 수 없는 후보는 JSON에 넣지 않고 `보류`로 보고한다.
4. ChatGPT에 `DATABASE_URL`, 운영 환경 파일, SSH 키, API token, 비밀번호를 제공하지 않는다.

## 분석 절차

### 1. 공시와 발행사 식별

- 제목·RSS 요약만으로 이벤트를 만들지 않는다. 원문, SEC filing index와 사건 관련 Exhibit 또는 DART 공시 본문을 확인한다.
- CIK/법인명/티커/거래 시장을 대조한다. 활성 COMMON_STOCK 여부를 프로젝트 공식 종목 마스터에서 확인할 수 없으면 작성 후보로만 남기고 JSON에 확정 기록하지 않는다. importer가 마스터 확인에 실패하면 적재가 거부된다.
- 공시 한 건에 사건이 여럿 있어도 각각 독립된 주가 촉매일 때만 eventId를 분리한다. 같은 SEC accession 또는 DART 접수번호와 같은 사건 종류가 이미 있으면 먼저 기존 항목을 찾아 중복 생성을 막는다.

### 2. 사실과 해석을 분리

- 누가, 무엇을, 언제, 어디서, 왜, 어떻게를 기록한다.
- 원문에서 확인된 사실과 분석자의 주가 영향 해석을 `summary`, `rationale`, `evidence`, `risks`, `limitations`에서 구분한다.
- `direction`은 `POSITIVE`, `NEGATIVE`, `MIXED`, `UNCERTAIN` 중 하나로 작성한다. 방향은 공시 내용의 잠재 영향이지 수익률 예측이나 매매 지시가 아니다.
- 확정 일정, 회사가 예상한 일정, ClinicalTrials.gov의 추정 일정, 제3자 추정치를 서로 다른 `status`와 근거로 구분한다. 예상 일정만으로 호재/악재를 판정하지 않는다.
- 미국 이벤트 시각은 원문이 제공할 때 ET와 KST를 함께 쓴다. 날짜만 공개된 발표에는 시각을 만들지 않는다. 장전·정규장·장후 및 법적 효력·조정 거래 개시 시각도 구별한다.
- FDA/임상은 자산, 적응증, 단계, 시험명/NCT, 주요 평가변수, 등록 수, 결과, FDA 목표일 및 확정 여부를 확인한다. 승인확률, TAM, 가격, 매출, 런웨이를 임의 산출하지 않는다.
- 역분할은 병합비율, 발행주식 수와 유통주식 수, 법적 효력, split-adjusted 거래 개시일을 각각 확인한다. 미확인 수량은 추정하지 않는다.
- 주가 방향과 실제 수익률은 별개다. 가격 반응을 분석할 실제 가격 데이터가 없으면 수익률 수치나 인과 주장을 만들지 않는다.

### 3. JSON 반영

- 단일 JSON 파일의 최상위 `schemaVersion`과 `markets.KR[]`, `markets.US[]` 구조를 유지한다. 시장에 맞는 배열에만 추가한다.
- 필수 필드는 현재 파일과 설계 문서에 맞춘다: `eventId`, `eventDate`, `ticker`, `companyName`, `eventType`, `status`, `direction`, `impactHorizon`, `title`, `summary`, `rationale`, `confidence`, `sourceType`, `sourceId`, `sourceUrl`.
- 허용 enum은 다음과 같다.
  - `status`: `REPORTED`, `CONFIRMED_SCHEDULED`, `ESTIMATED`, `COMPLETED`, `CANCELLED`
  - `direction`: `POSITIVE`, `NEGATIVE`, `MIXED`, `UNCERTAIN`
  - `impactHorizon`: `INTRADAY`, `SHORT_TERM`, `LONG_TERM`, `UNKNOWN`
  - `confidence`: `HIGH`, `MEDIUM`, `LOW` (`confidence`는 영향 예측 확률이 아니라 원문 근거의 충실도)
- `eventDate`는 원문에서 확인되는 해당 이벤트 또는 공시의 기준일을 `YYYY-MM-DD`로 기록한다. 공시 접수일, 예정 이벤트일, 실제 효력일을 혼합하지 않는다. 월 단위 예상처럼 일자가 발표되지 않았으면 정확한 날짜를 꾸며내지 않는다. `eventDate`에는 기준이 되는 실제 공시일을 두고, `keyDates`에는 `2026-11`처럼 원문의 월 단위 예상과 `ESTIMATED` 상태를 적는다.
- `eventId`는 SEC accession 또는 DART 접수번호와 사건 종류를 결합한 안정적인 ID로 만든다. 동일 사건의 정정·취소라면 새 항목을 중복 추가하지 말고 기존 ID의 status·근거를 갱신한다.
- `evidence`에는 짧은 직접 인용, 공식 `sourceUrl`, 문서 위치(locator)를 넣는다. 전체 공시문을 복사하지 않는다.
- 기존 다른 이벤트·시장 배열·메타데이터는 보존한다. 입력되지 않은 항목을 삭제하거나 대량 재정렬하지 않는다.
- ChatGPT 웹은 운영 DB에 직접 저장하지 않는다. 결과물은 동일한 관리 JSON 파일의 전체 갱신본으로만 반환한다. 별도의 이벤트용 JSON 파일을 만들지 않는다.

## ChatGPT 웹에 붙여넣는 요청문

최신 `data/market-impact-events.json`과 분석 대상 공식 공시 원문을 첨부한 뒤 다음 요청을 사용한다.

```text
첨부한 공시 원문과 최신 data/market-impact-events.json을 기준으로 공시 주가 영향 이벤트를 분석하고, 기존 단일 JSON 파일을 갱신해 주세요.

반드시 첨부한 공시 원문을 직접 확인하고, 회사 자료가 아닌 검색 요약만으로 확정하지 마세요. DART 또는 SEC 등 공식 1차 출처를 우선 사용하세요. 파일의 schemaVersion, 기존 항목, markets.KR/markets.US 분리, 필드 이름과 enum을 그대로 유지하세요.

이벤트는 다음을 지켜 작성하세요.
- 공시 사실과 영향 해석을 분리하고, 주가 방향을 보장하거나 매매 지시를 하지 않기
- eventId 중복을 먼저 검사하고 같은 사건은 기존 ID를 갱신하기
- 확정 일정과 예상 일정을 status로 구분하고, 추정 날짜를 확정 날짜처럼 만들지 않기
- 미국은 원문이 명시한 ET와 KST를 함께 기록하고, 발표 시각이 없으면 임의로 만들지 않기
- SEC accession/DART 접수번호, 공식 원문 URL, 짧은 근거 인용과 위치를 기록하기
- 공식 활성 COMMON_STOCK 여부가 첨부 자료로 확인되지 않으면 JSON에 넣지 말고 확인 보류로 보고하기
- 근거가 불충분하거나 원문에 접근할 수 없으면 이벤트를 추가하지 않기
- 원본의 다른 항목은 삭제·수정하지 않기

마지막에는 JSON 문법과 필수 필드/enum/중복 eventId를 자체 점검하세요.
응답은 (1) 수정된 JSON 파일 전체를 JSON 코드블록 하나로, (2) 변경 요약과 확인 보류 사항을 짧은 문장으로 제공하세요. 새 별도 JSON 파일은 만들지 마세요. 데이터베이스 자격증명이나 운영 서버 명령은 요청하거나 실행하지 마세요.
```

## 검증 및 운영 반영

1. ChatGPT 응답의 JSON 전체를 별도 파일로 저장한 뒤 JSON parser로 문법을 확인한다. 파일 전체가 아닌 일부 조각만 원본에 붙여넣지 않는다.
2. 프로젝트에서 `node scripts/import-market-impact-events.mjs --dry-run`을 실행해 스키마, 중복, 필수 필드, 허용 enum 및 활성 COMMON_STOCK 마스터 검증을 확인한다. `--dry-run`은 DB 행을 쓰지 않는다. 실패하면 해당 이벤트를 운영에 보내지 않는다.
3. 승인한 파일만 `data/market-impact-events.json`의 단일 기준 원본으로 반영한다. 새 eventId는 추가, 기존 사건 수정은 같은 eventId 갱신, 취소는 `CANCELLED` 상태와 원문 근거로 표시한다.
4. ChatGPT 웹의 완료 메시지는 운영 적재 완료를 뜻하지 않는다. 현재 확인된 배포 workflow는 migration 파일은 release에 포함하지만 `data/market-impact-events.json`과 importer를 포함하거나 실행하지 않는다. 따라서 JSON 파일 수정·Git push만으로 운영 DB가 갱신된다고 간주하지 않는다.
5. 운영 DB upsert는 보호된 배포/운영 환경에서 importer 실행이 성공한 뒤에만 완료로 판정한다. 운영 DB 자격증명은 ChatGPT 웹에 입력하지 않는다. 운영 적재 후 무인증 `GET /api/public/market-impact-events`를 시장·티커·날짜 조건으로 조회해 해당 `eventId`, `status`, `sourceId`, `eventDate`를 확인한다.

### 현재 운영 연결의 주의점

현재 체크아웃의 `.github/workflows/deploy-oci.yml`은 JSON/importer를 standalone release에 복사하지 않으며, `deploy/oci/stockman-activate`는 Flyway 후 importer를 실행하지 않는다. 따라서 자동 운영 반영을 시작하려면 먼저 workflow/activation에 JSON 패키징과 importer 실행을 연결해야 한다. 이를 연결하기 전에는 ChatGPT가 만든 JSON을 운영 DB에 이미 반영된 것으로 보고하지 않는다.

JSON에서 항목을 삭제해도 importer는 기존 DB 행을 자동 삭제하지 않는다. 오기록 취소는 기존 ID의 `status: "CANCELLED"`와 정정 근거로 남긴다. DB 정리 작업은 별도 승인된 절차 없이는 수행하지 않는다.
