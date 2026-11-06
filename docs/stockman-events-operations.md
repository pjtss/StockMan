# Stockman 이벤트 저장·운영·장애 대응

## 배포 및 운영 상태

V167 운영 migration 및 코드 배포는 OCI workflow run `42219588759`에서 Verify, Package, SSH, Upload, Activate 단계 모두 성공했다. 공개 events/report/status endpoint는 HTTP 200 JSON을 반환한다. V167 전 latest `market-rss` event ledger는 FAILED였고 V167 후에도 collection status 조회 SQL이 timeout되어 후속 query 최적화를 수행했다. 후속 OCI workflow `42225415268`도 성공했다. 최적화 후 status GET은 200/0.55초에 응답한다. 2026-11-06 13:35 UTC 관찰에서 `market-rss` ledger는 SUCCESS fetched=500/stored=500/failed=0, `sec-realtime` ledger는 SUCCESS fetched=0/stored=0이었다. 직전 12시간 이벤트 API는 339건, 종목별 DRK 조회는 3건을 반환했고 표본 이벤트는 UNVERIFIED였다. 최신 보고서는 검증 호재 0건이다. RSS 영구 저장 경로는 확인됐고 SEC 정규화 경로는 계속 진단한다. 정상 조회와 호재 검증 완료를 구분해 운영한다.

후속 운영 재현에서는 기존 V141 `market_rss_llm_analyses` 및 V142 `sec_codex_analysis_queue`가 missing relation으로 확인됐다. V167 repair migration은 기존 원본 정의를 `CREATE TABLE/INDEX IF NOT EXISTS`로 복구한다. 적용 뒤 다음 cron에서 두 materializer의 result를 다시 확인한다.

V167 배포 후 `/api/events`와 `/api/reports/latest`는 응답하지만 `/api/collection-status` 요청이 20초 이상 응답하지 않는 현상을 read-only GET으로 재현했다. 8초 PostgreSQL `statement_timeout` 배포 후 route가 503을 8.4초에 반환해 latest-run `DISTINCT ON` query가 timeout 원인임을 확인했다. status query를 module별 indexed `ORDER BY started_at DESC LIMIT 1` 두 lookup으로 바꿔 각 모듈 최신 행만 읽도록 한다. 운영 성공 여부를 입증하기 전까지 0건 응답을 정상 수집으로 판정하지 않는다.

2026-11-06 14:25 UTC 후속 운영 확인: status API는 200/1초 미만이다. `market-rss` sourceStatus/eventLedgerStatus는 SUCCESS, RSS sources 3개 성공, ingest failure 0, insertedArticleCount 203, event ledger fetched/stored 500/500/failed 0이다. `SEC_EDGAR` RSS source도 SUCCESS로 들어온다. 반면 `sec-realtime`은 configuredCikCount=0, fetchSuccess/failure=0/0, submissionCount/inserted=0/0이며 event ledger fetched/stored=0/0이다. 최근 12시간 목록 217건에는 SEC_EDGAR 이벤트가 0건이다. SEC RSS 행의 posted/updated time은 accepted_at으로 대체하지 않기 때문에 accepted time 미확인인 SEC 행을 시간창에서 제외한다. 보고서는 검증된 호재 0건이다.

SEC acceptance date/time은 공식 제출 메타데이터에서 가져오며, SEC는 filing이 EDGAR system timestamp 이후 보통 1–3분 뒤 sec.gov에 제공될 수 있다고 설명한다. RSS 게시/갱신 시각을 acceptance time으로 대체하지 않는다. [SEC Webmaster FAQ](https://www.sec.gov/about/webmaster-frequently-asked-questions). 운영 SEC universe는 기존 `featureSettings.secEdgar.ciks`, `SEC_SYNC_CIKS`, 또는 `SEC_SYNC_SMALLCAP=true` 중 하나로 결정되며 현재는 유효 CIK가 0이다. small-cap 모드는 기존 프로젝트 기준 시가총액 1억 달러 이하 후보로 범위가 제한되므로 전체 시장 설정과 동일하지 않다. 종목 범위를 확인하지 않은 채 운영 설정을 변경하지 않는다.

## RSS 기반 SEC issuer 보강 변경 (미배포)

코드 변경은 아직 운영에 반영하지 않았다. SEC cron이 공식 SEC RSS의 저장 행 중 미정규화 accession을 탐색해 활성 미국 보통주 마스터와 일치하는 후보 CIK를 기본 10개/실행, 설정 상한 50개/실행으로 기존 Submissions 경로에 추가하는 방식이다. RSS 후보도 기존 SEC ticker/acceptance metadata 검증과 event materializer를 통과해야 한다. 운영 status의 `rssCandidateCikCount`, `rssOnlyCikCount`, `requestedCikCount`로 configured CIK와 RSS 보강 대상을 구별한다. 신규 migration이나 운영 DB 직접 수정은 포함하지 않는다.

배포 전에는 전체 `npm run deploy:verify`를 통과시키고 OCI workflow 계획을 제출한다. 실제 배포/운영 cron 실행은 기존 운영 변경 승인 조건에 따라 별도 승인 후 진행하며, 배포 뒤 candidate/fetch counts, SEC event count, duplicate 여부, 12시간 조회를 확인한다. SEC 요청량은 batch limit에 의해 제한되나 각 issuer Submissions 응답은 최근 제출 metadata를 기존처럼 upsert한다.

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
