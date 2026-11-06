# Stockman SEC·RSS 이벤트 API

모든 이벤트 GET은 인증 없이 호출할 수 있으며 응답 timestamp는 UTC ISO 형식이다. 보고서 timestamp는 KST도 함께 표시한다. 원문 payload, 관리자 데이터, 내부 오류 상세는 반환하지 않는다. 이벤트 저장용 공개 POST도 인증 없이 호출할 수 있으나 Stockman이 이미 보유한 원본 식별자만 허용한다. 분석 결과 검토·수정 저장 경로는 관리자 세션이 필요하다.

## 조회

| Method/경로 | 기능 |
|---|---|
| `GET /api/events` | 이벤트 목록. `hours=1|12|24|168`, `from`, `to`, `ticker`, `eventType`, `grade`, `verificationStatus`, `dilutionRisk`, `sort=latest|importance`, `page`, `pageSize`를 지원. 시각창은 SEC `accepted_at`, 뉴스 `published_at` 기준. |
| `GET /api/events?view=report&hours=12` | 동일 공개 라우트에서 Markdown 호재 보고서를 생성. 보고서 `type`, `date`, `ticker` 필터도 지원하며 `view=report` 생략 시 기존 이벤트 목록 응답을 유지. |
| `GET /api/events/{id}` | 상세와 원문 메타데이터, 분석 revision, metric 목록. 원문 body는 포함하지 않음. |
| `GET /api/events/{id}/history` | append-only 상태 변경 이력. |
| `GET /api/reports?hours=12` | 현재 시각 기준 최근 12시간의 검증된 A/B/C 호재를 DB에서 Markdown으로 재생성. 배포 호환 경로로 `/api/events?view=report&hours=12`도 제공. |
| `GET /api/reports?type=bullish&hours=1|12|24|168` | 기간별 검증 호재 보고서. 기본 type=bullish, hours=12. |
| `GET /api/reports?type=daily&date=YYYY-MM-DD` | KST 달력일 기준 일간 검증 호재 보고서. date 생략 시 현재 KST 날짜. |
| `GET /api/reports?type=ticker&ticker=INO` | 종목별 영구 이벤트 이력 보고서. ticker 필수, hours를 주면 최근 기간으로 제한. |
| `GET /api/reports?type=dilution&hours=168` | 희석 위험이 기록된 이벤트 보고서. hours 생략 시 전체 보존 이력. |
| `GET /api/reports?type=collection` | DB에 저장된 SEC/RSS 수집 및 원장 materialization 상태 보고서. |
| `GET /api/collection-status` | 최신 RSS/SEC automation run의 source/ledger 상태, 실행 시각, fetched/stored/unverified/failed 집계 및 제한된 error code. `sourceStatus`는 원본 수집, `eventLedgerStatus`는 이벤트 정규화/저장 결과로 분리한다. `sourceCoverage`는 RSS source/failure/insert 집계 또는 SEC 요청·성공·실패 CIK 및 제출/신규 저장 집계를 제공해, 성공적인 0건과 수집 실패를 구분한다. 원문 오류 메시지·비밀값은 반환하지 않는다. |
| `POST /api/events/collect` | 이미 저장된 원본 SEC 접수 또는 지원 RSS 레코드 하나를 이벤트 ledger로 멱등 반영. 무인증이며 원본 제목·티커·등급·분석 본문 입력은 받지 않음. |

목록 기본 정렬은 최신순, 중요도순은 등급·priority 후 최신순이다. `pageSize`는 1–100, offset은 최대 1,000,000으로 제한한다. 전체 날짜 범위는 과거 이력 검색에 쓰며 `hours`와 동시에 사용할 수 없다. 정확한 상·하한 시각은 inclusive다.

예시: `/api/events?hours=12&verificationStatus=VERIFIED&grade=A&page=1&pageSize=50&sort=importance`, `/api/reports?type=daily&date=2026-11-06`, `/api/reports?type=ticker&ticker=INO`.

수집 요청 본문 예시: `{"source":"SEC_EDGAR","accession":"0000123456-26-000123"}` 또는 `{"source":"RSS","provider":"STOCKTITAN","externalId":"provider-record-id"}`. RSS 이벤트는 자동 반영 시 `UNVERIFIED`로 저장된다. 허용되지 않은 provider, 존재하지 않는 원본, 잘못된 식별자는 검증/저장하지 않는다. 요청은 기존 공용 write rate limit을 적용하며 분당 클라이언트 10건·전체 120건 상한이다.

## 관리자 분석 등록

`POST /api/admin/events/{id}/analysis`는 관리자 cookie session 필요. `bullishGrade`, 근거/반대근거, 희석위험, 미확인 항목, evidence quote와 `evidenceDocumentIds`를 받는다. A/B/C는 HTTPS source URL, 확인 문서, 활성 미국 보통주 ticker와 evidence quote를 요구한다. 미검증 문서에 VERIFIED를 부여할 때 관리자 검토 설명(`verificationNote`, 최소 10자)을 요구한다. 실제 요청 body는 API 표면의 public OpenAPI/manual에 게시하지 않는다.

핵심 수량은 `metrics` 배열에서 십진 문자열 `amountValue`, `quantityValue`, currency, unit, `asOfDate`, `splitAdjustment`, `calculationFormula`, `calculationInputs`, `sourceDocumentId`로 제출한다. 정확한 발행 전 주식 수가 없으면 희석률을 계산하지 않고 null/unknown을 기록한다. API는 부동소수점 계산을 하지 않는다.

## 응답/오류

성공 응답은 `{ok:true,...}`; 검증 오류는 HTTP 400, 없는 ID는 404, 저장소 장애는 민감한 상세 없이 503 표준 오류 코드를 반환한다. 페이지 필터 및 cursor는 동일 API 버전 범위에서 유지한다. 신규 GET 경로는 API discovery/manual/route inventory와 `scripts/api-surface.mjs` 감사 대상이다.

저장소 오류 코드는 `DATABASE_UNAVAILABLE`, `DATABASE_ERROR`, `SCHEMA_TABLE_MISSING[_<KNOWN_TABLE>]`, `SCHEMA_COLUMN_MISSING`, `UNIQUE_CONFLICT`, `FOREIGN_KEY_CONFLICT`, `INVALID_SOURCE_DATA` 중 하나다. 알려진 relation 이름은 고정 allowlist에서만 반환하고 DB 오류 메시지나 연결 문자열은 공개하지 않는다.
