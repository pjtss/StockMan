# Stockman 이벤트 저장·운영·장애 대응

## 배포 및 운영 상태

V166 운영 migration 및 코드 배포는 OCI workflow run `42211364948`에서 Verify, Package, SSH, Upload, Activate 단계 모두 성공했다. 공개 report/events/status endpoint는 HTTP 200 JSON을 반환한다. 2026-11-06 11:45 UTC 관찰에서는 latest `market-rss` event ledger가 FAILED, source가 UNVERIFIED였고 `sec-realtime`도 UNVERIFIED였다. 보고서/최근 이벤트가 0건인 사실만으로 수집 성공으로 판단하지 않는다. `GET /api/collection-status`의 `eventLedger` 집계/error code와 최신 실행 시각을 확인한다.

후속 운영 재현에서는 기존 V141 `market_rss_llm_analyses` 및 V142 `sec_codex_analysis_queue`가 missing relation으로 확인됐다. V167 repair migration은 기존 원본 정의를 `CREATE TABLE/INDEX IF NOT EXISTS`로 복구한다. 적용 뒤 다음 cron에서 두 materializer의 result를 다시 확인한다.

## 배포 전제

1. V166을 새 forward-only migration으로 적용할 계획을 리뷰한다. 애플리케이션은 schema DDL을 실행하지 않는다.
2. 운영 데이터에 대량 backfill은 하지 않는다. 먼저 migration 적용 후 source volume, 유니버스 join, 예상 row 수를 read-only로 추정하고 별도 승인/실행 범위를 정한다.
3. `GET /api/health`에서 운영 Flyway version이 V166 이상이고 모든 `stockman_event_*` 테이블이 준비됐는지 확인한다.
4. OCI의 기존 market-rss/sec-edgar cron을 재사용한다. route는 기존 `CRON_SECRET` 인증을 계속 요구한다. migration이 준비되지 않으면 event ledger 보조 단계는 FAILED/degraded를 남기고 기존 RSS/SEC 원본을 삭제하지 않는다.
5. 이벤트 조회 GET은 무인증 공개이며, `POST /api/events/collect`도 무인증으로 기존 원본 ID만 materialize한다. 이 route는 공유 write rate limit을 적용한다. 분석 등록/수정 POST는 관리자 session 없이는 저장하지 않는다.

운영 migration/배포는 사용자 요청에 따른 OCI release workflow로 적용했다. 후속 운영 직접 DB 변경이나 대량 backfill은 이 배포와 별개이며 사전 승인 없이 수행하지 않는다.

## 정상 처리

- RSS source 저장 후 materializer가 기존 article row를 이벤트로 연결한다. wire/aggregator RSS 문서는 UNVERIFIED다.
- SEC Submissions 저장 후 materializer가 SEC accession과 활성 common-stock ticker를 확인해 event/document를 연결한다. SEC accepted time 14자리 parse 실패 및 마스터 불일치는 신규 검증 이벤트로 승격하지 않는다.
- 관리자는 공식 문서를 직접 확인하고 Codex 원문 분석 결과를 admin analysis endpoint에 revision으로 기록한다. POSITIVE 결과라도 명확한 evidence와 ticker가 없으면 저장/보고서 대상에서 제외한다.
- 보고서는 DB query로 매 요청 생성되므로 재생성 가능한 원장 결과다. Reports/latest는 기본 12시간 창이며 12시간 경과 이벤트도 DB에 보존된다.
- `GET /api/reports`와 `GET /api/events?view=report`는 `type=bullish|daily|ticker|dilution|collection`을 제공한다. daily 날짜 경계는 KST 자정 기준이며, ticker에는 ticker가 필수다. dilution hours 생략 시 전체 보존 이력에서 위험이 입력된 건을 조회한다. 배포 후 report 모드 JSON을 확인해 라우트가 404 HTML로 처리되지 않는지 점검한다.

## 장애 구분·복구

| 상태 | 의미 | 조치 |
|---|---|---|
| `SUCCESS` | source 조회/materialization 실행 완료 | event count와 automation run을 확인 |
| `PARTIAL_SUCCESS` | 일부 source/row 성공, 일부 실패 또는 미검증 | 실패 단계와 공통 stock master를 구분하고 다음 cron 재시도 확인 |
| `FAILED` | source 저장 또는 ledger 단계가 실패 | 공개 상태에는 민감한 오류 메시지 없이 집계 건수와 허용된 error code만 표시한다. 내부 automation run 상세는 운영 진단에서 대조한다. source raw rows는 유지 |
| `UNVERIFIED` | 정보가 부족해 자동 확정하지 않음 | 공식 URL/ticker/accepted/published timestamp 보강 후 관리자 review |

재실행은 unique SEC identity, RSS source key, document key 및 revision hash로 중복을 억제한다. materializer/analysis 실패를 “신규 이벤트 0건”이라고 해석하지 않는다. 기존 DB 내용은 수집/API 장애로 삭제하지 않는다.

## 롤백

애플리케이션 롤백 시 이전 버전은 새 테이블을 참조하지 않도록 먼저 배포를 되돌린다. V166 테이블 DROP/TRUNCATE 또는 source 데이터 삭제는 자동 롤백에 포함하지 않는다. 데이터가 보존된 상태에서 새 코드만 비활성화하고, destructive schema rollback이 필요하면 영향 분석과 별도 사전 승인을 거친다.
