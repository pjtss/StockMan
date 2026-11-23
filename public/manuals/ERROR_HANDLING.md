## 전체 공시 조회에서 자동화 coverage run을 반복 조회하지 않기 (2026-11-23)

- **증상**: `GET /api/disclosures?hours=1&source=all`은 0건인데 14~36초, DART 단독 7.7초, SEC 단독 3.5초였고 RSS source 단독은 56~281ms였다.
- **근본 원인 후보**: 하나의 REPEATABLE READ transaction 안에서 `automation_runs`의 market-rss/DART/SEC latest run을 별도 Drizzle 요청으로 조회했다. 단일 Pg client의 쿼리들은 동시 실행이 되지 않으므로 세 왕복이 누적될 수 있다. 서버 로그/DB 실행계획이 없어 latency 귀속은 운영 측정과 함께 확인한다.
- **해결**: 결과 projection이 소비하는 module key만 선택하고 `DISTINCT ON (module_key) ORDER BY module_key, started_at DESC` 한 번으로 latest coverage row를 가져온다. 결과에 쓰이지 않는 source는 run 조회에서 제외한다.
- **재발 자동 감지**: docs checker가 필요한 module 조건과 DISTINCT ON 경계를 확인한다. 동일 `hours=1&source=all` 및 source 분할 조회의 운영 latency와 item count를 함께 기록한다.
- **남은 위험**: production query의 14~36초는 empty result라 원인 귀속을 확정할 수 없다. 이번 변경 뒤 동일 조건 요청과 DART/SEC/RSS 단독을 재측정한다.
## RSS 조회가 비정상적으로 느릴 때 raw payload 재파싱 방지 (2026-11-23)

- **증상**: /api/disclosures 저장 RSS 조회가 느리다.
- **근본 원인**: GET에서 각 raw_payload를 SQL 정규식 및 Node JSON parse로 반복 분류했다.
- **해결**: ingest 시 precision/date를 저장하고 V182에서 기존 RSS row를 backfill한다. 조회는 메타데이터만 읽는다.
- **재발 자동 감지**: classifier 단위 테스트 및 docs checker의 ingest/query 경계 검증, 배포 후 동일 API 성능 측정을 유지한다.
- **남은 위험**: V182 기존 데이터 backfill은 배포 migration에서 DB write 부하를 만들 수 있으며 migration duration을 관측한다.

## 2026-11-19 국내 일봉 거래대금이 종가×거래량으로 대체됨

- **증상**: 국내 `daily-candles` API가 KIS가 제공하는 `acml_tr_pbmn` 대신 종가×거래량을 거래대금으로 반환했다.
- **근본 원인**: 일봉 파서는 원본 JSON은 보존했지만 거래대금을 구조화하지 않았고, KR 캔들 테이블에도 `trading_value` 컬럼이 없었다.
- **영향 범위**: 국내 일·주·월 KIS 캔들 적재 및 공개 `daily-candles` 응답. 기존 raw payload가 유효하고 원본 필드가 있으면 마이그레이션에서 값을 복구한다.
- **해결 위치**: `lib/kis-kr-daily-price.ts`가 `acml_tr_pbmn`을 파싱하고 `lib/kr-daily-price-cache.ts`가 구조화 저장·bulk cache 조회를 제공한다. V180에서 컬럼 추가 및 기존 raw payload 복구, public route에서는 저장값 우선/부재 시 계산 fallback을 적용한다.
- **재발 자동 감지**: parser test가 공식 필드 파싱 및 누락/오류 nullable 동작을 확인하고, public route test가 저장값 우선과 fallback 식을 확인한다. migration/schema audit으로 런타임 스키마와 DDL 일치를 확인한다.
- **검증 결과/상태**: 회귀 테스트 10개, `npm run typecheck`, `npm run docs:check`, `npm run build`가 통과했다. 운영 DB 마이그레이션 및 배포는 아직 하지 않았다.
- **남은 위험 및 다음 개선**: 잘못되었거나 비 JSON인 과거 raw payload는 backfill 대상이 아니다. 기존 행에 `acml_tr_pbmn`이 원래 없던 경우 값은 NULL로 남고 API에서 종가×거래량 fallback을 쓴다.

## 2026-11-19 미국 활성 보통주 유니버스에 ADR/ADS가 포함

- **증상**: `ㄷㅊㅇ5`의 운영 공개 활성 보통주 목록에서 AACG, BABA, ABEV 등 공식 상품명이 `SPON ADS`/`SPON ADR`인 예탁증서가 `instrument_type=COMMON_STOCK`, `is_dr=false`로 반환됐다. 종목 메타데이터 GET에서도 같은 분류가 확인됐다.
- **근본 원인**: 해외 KIS 마스터 파서는 `isdr` 필드만 DR 여부로 옮겼다. 하지만 KIS 마스터의 `isdr=N`이더라도 영문 상품명에는 거래 대상이 ADS/ADR임이 명시될 수 있다. 이 필드를 단독으로 신뢰해 활성 보통주 유니버스가 과대 포함됐다.
- **영향 범위**: 미국 공통 종목 마스터 분류, 해당 마스터로 재조정되는 common/special partition, 공개 daily-candles universe/일봉 응답 및 이를 사용하는 추출·스냅샷. 기존 DB와 스냅샷에 ADR/ADS가 이미 포함됐을 수 있다.
- **해결 위치**: 공통 판별 함수가 공식 마스터의 영문 상품 설명과 표시 종목명에서 ADR/ADS/depositary/depository 표기를 식별한다. `lib/instrument-universe-import.ts`는 이를 `DR`, `isDr=true`로 분류하고 재조정 시 special master에 보존한다. `app/api/public/daily-candles/route.ts`는 두 이름 필드의 표기를 미국 목록 및 봉 조회에서 제외해 기존 DB flag가 낡아도 snapshot에 유입되지 않게 한다. `app/api/public/us-stock-metadata/route.ts`도 두 필드를 확인해 해당 항목을 활성 보통주로 응답하지 않는다.
- **재발 자동 감지**: 분류·daily-candles·US metadata regression tests가 공식 예탁증서 설명을 제외하고 AAPL 같은 보통주는 유지하는지 확인한다. 마스터 적재 기능이 복구되거나 운영 DB가 갱신될 때 `reconcileUsUniversePartitions` 결과도 다시 대조한다.
- **검증 결과/상태**: 분류/API 회귀 검사, 전체 build/runtime/test/typecheck gate, OCI 배포가 통과했다. 운영 health 200, DR 표본 metadata 422/AAPL 200 및 KOSPI/KOSDAQ 일봉 200을 확인했다. ㄷㅊㅇ5·ㄷㅊㅇ6 snapshot을 각각 `daily-candles-us.json`, `daily-candles-kr.json`에 갱신하고 상세 수치·품질 검증을 [`daily-candle-snapshot-20261116-run.md`](operations/daily-candle-snapshot-20261116-run.md)에 기록했다.
- **남은 위험 및 다음 개선**: ㄷㅊㅇ5·ㄷㅊㅇ6 public snapshot 경로는 이름 기반 ADR/ADS 제외와 국내 candle schema fallback까지 검증됐다. 다른 미국 종목 소비 API는 같은 DB classification fields를 활용할 수 있으므로 별도 영향 점검이 필요하다. US snapshot에서 candle cache 누락은 86개이며 향후 캐시가 채워지면 재생성한다.

## 2026-11-19 — KR daily-candles API가 국내 스키마에 없는 `trading_value`를 참조
- **증상/영향**: KOSPI/KOSDAQ universe GET은 성공하지만 국내 종목 일봉 GET이 `503 DAILY_CACHE_UNAVAILABLE`를 반환해 `ㄷㅊㅇ6` snapshot을 만들 수 없다.
- **근본 원인**: 공용 API 쿼리가 `kr_instrument_universe_candles`에도 `trading_value`가 있다고 가정했지만, V67 국내 테이블 정의와 프로젝트 스키마 문서는 해당 컬럼이 없음을 명시한다. PostgreSQL 쿼리 오류가 공통 503으로 변환돼 외부에서 원인이 숨겨졌다.
- **수정/영향 범위**: `app/api/public/daily-candles/route.ts`에서 KR 일봉의 거래대금 표시값을 `close * volume`으로 계산하고, US는 기존의 `trading_value` 우선 및 fallback 동작을 유지한다. 단일/복수 종목 및 단일 종목 쿼리 모두 동일한 거래대금 별칭을 쓴다.
- **재발 자동 감지**: route regression test는 KR SQL에 `c.trading_value` 참조가 없고 `c.close * c.volume AS trading_value`를 포함하는지 검사한다. 관련 API 테스트 및 typecheck/build/deploy verification에 포함한다.
- **남은 위험/다음 조치**: 수정 배포 후 KOSPI/KOSDAQ 각각 daily-candles GET과 전체 `ㄷㅊㅇ6` snapshot을 다시 실행한다. 누락 목록은 API가 반환한 빈 캐시/종목을 분리 기록한다.
- **커밋·푸시·배포**: 원인 수정은 작업 중이며, 전체 검증 통과 후 별도 commit/push 및 OCI 활성화를 확인한다.

## 2026-11-18 차트 종목 추출 정상 응답이 화면 timeout으로 실패

- **증상**: `/api/screener/run`의 해외 첫 스캔이 HTTP 200으로 약 56초 뒤 완료되지만 `/charts` 요청은 45초에 abort되어 사용자에게 timeout으로 표시될 수 있었다.
- **근본 원인**: 클라이언트 deadline이 운영 cold 응답시간보다 짧았고, DB는 종목별 최대 65개 봉을 행 단위로 반환해 약 5,300종목 기준 최대 약 34만 행의 전송 및 Node 객체 구성을 유발했다. 전체 `Server-Timing`만 있어 DB/Node 세부 병목 비율은 미확인이다.
- **영향 범위**: 직접 조건 추출 UI의 KR/US 요청. 운영에서 확인한 두 요청은 HTTP 200과 결과 봉의 거래일시·갱신시각 메타데이터를 반환했다. 세부 변경 및 배포 상태는 [`screener-performance.md`](operations/screener-performance.md)에 연결한다.
- **해결 위치**: `components/ticker-chart-workbench.tsx` deadline을 90초로 조정한다. `lib/db-screener.ts`는 DB가 종목·봉 주기별 JSON 배열로 묶어 반환하고 같은 봉을 기존 계산 경로에 복원한다.
- **재발 자동 감지**: `lib/db-screener-aggregated-rows.test.ts`가 종목 결과와 D/W 거래일·갱신시각 복원을 확인한다. 운영 성능 측정은 매번 신규 조건 fingerprint의 cold 요청을 기록하고 `server-timing`을 비교한다.
- **검증 결과**: 변경 관련 3개 테스트 파일 11개 통과, 변경 모듈 격리 TypeScript 검사는 오류 0건이다. 전체 테스트는 304개 파일·1,700개 테스트 중 5개 파일·13개 테스트 실패(1 skip, 3 test skip)이며 daily-disclosures UI, automation-run, filing-sync, schema-health 및 kis-investor-flow 등 스크리너 외 오류다. 전체 TypeScript 검사는 오래된 `.next-*` 타입 파일과 여러 스크리너 외 소스 오류로 실패했다. production compile은 통과했으나 기존 `app/api/public/instrument-fundamentals/route.ts`의 `MARKET_CONFIGS` 누락에서 빌드가 중단됐다. PostgreSQL plan 및 standalone runtime은 미검증이다.
- **남은 위험 및 다음 개선**: 캔들 행 집계는 DB의 읽기 수를 줄이지 않으며 JSON serialization 오버헤드가 있을 수 있다. 배포 전 필수 게이트가 아직 완료되지 않았다. 운영 cold 시간이 계속 높으면 `EXPLAIN ANALYZE` 및 DB 조회/Node 계산의 단계별 계측으로 다음 최적화를 정한다.

## 2026-11-04 미국 소형주 배치 SEC 날짜 후보와 accession 상태 불일치

- **증상**: b09 validator에서 SEC 미래 날짜 후보의 이벤트/제외 판정 집합과 filing ledger의 SEC event accession 집합 불일치가 감지됐다. SEC 원문 수집기가 실패 건수를 배열로 반환했는데 generator가 숫자 0으로만 처리해 완료된 스캔을 불완전으로 오판했다.
- **근본 원인**: 자동 날짜 추출, SEC keyword scan, 확정 이벤트, accession 상태를 같은 개수로 취급했고 filing 하나에서 다수 날짜 후보가 나올 수 있다는 점 및 legacy 배치에 강화 coverage 필드가 없다는 점을 반영하지 않았다.
- **영향 범위**: 로컬 b09 review/ledger 생성 및 validator. 운영 조회는 read-only GET만 사용했고 운영 데이터 쓰기·refresh·알림 전송은 없다.
- **해결 위치**: scripts/generate-us-smallcap-event-batch.mjs에서 failed 숫자/배열을 정상화하고 요청·성공 건수를 검사한다. 미래 날짜 accession은 원문 검토 후 이벤트 또는 해결된 SEC_EXPLICIT_EXCLUSION으로 연결한다. filing 상태와 event accession 집합을 재정렬한다. scripts/validate-us-smallcap-event-data.mjs는 review/ledger exclusion 사유 parity, event links 및 날짜 후보 coverage를 검증한다. 새 coverage 메타데이터가 없는 legacy batch는 강화 coverage 검사를 건너뛴다.
- **재발 자동 감지**: npm run docs:check가 신규 batch validator를 실행한다. 원문 scan 누락, event/exclusion 미결정, 제외 사유 불일치, SEC accession relation 누락이면 fail-closed한다.
- **검증 결과**: b09 100 issuers, 4,758 submissions, 35 events(SEC filing event 27건/26 accession, IR 8건), 12 excluded filings. SEC primary 362건 전부 HTTP 200, date candidate 73건 전부 결정 입력에 반영. docs:check, API surface, catalog 및 문서/migration 검사가 통과했다. build/test/runtime 및 배포 전.
- **남은 위험 및 다음 개선**: 자동 날짜 추출은 문맥 판정을 대체하지 않는다. 다음 배치도 SEC/issuer primary text에서 일정 성격을 확인한다. 시총은 2026-11-02 STALE snapshot이다.

## 2026-11-04 OCI Activate에서 eventKey 형식 거부

- **증상**: OCI workflow #1260은 로컬 quality/build/runtime, remote verify, 패키징 및 업로드를 통과했으나 `Activate release`의 market-impact-events import에서 `events[375] has invalid eventKey`로 실패했다.
- **근본 원인**: b09 generator가 batch와 event suffix를 콜론으로 연결했지만 운영 importer는 `^[A-Z0-9._-]{1,64}$`만 허용한다. 사전검증에서 거부되어 데이터베이스 transaction 전 중단됐다.
- **영향 범위**: b09 event 원장 import 및 release 활성화. 운영 public GET은 기존 데이터(US event 377건)를 반환했고 신규 batch는 반영되지 않았다. 기존 운영 release와 DB는 유지됐다.
- **해결 위치**: generator eventKey를 대문자 batch-suffix 하이픈 형식으로 변경하고 canonical 35건을 동일 형식으로 수정했다. validator에 importer와 동일한 허용문자/길이 검사를 추가하고 데이터 계약에 규칙을 명문화했다.
- **재발 자동 감지**: `docs:check`의 전체 canonical validator가 모든 US eventKey를 importer regex로 검사한다. `deploy:verify`와 OCI import precheck가 배포 전 동일 데이터 형식을 추가 검증한다.
- **검증 결과**: 원인은 GitHub Actions 로그 #1260에서 확인했다. 수정 후 9개 batch validator·`docs:check`, optimized build, runtime smoke/hydration, Vitest 1,542 passed/3 skipped, typecheck 및 전체 `deploy:verify`가 통과했다. 수정본 운영 재배포 및 GET 확인 대기 중이다. 운영 GET/refresh/DB write는 수행하지 않았다.
- **남은 위험 및 다음 개선**: importer/validator의 필드 계약이 중복 구현되어 있으므로 가능하면 공유 schema 검증 모듈로 일원화한다. 이번 수정에서는 기존 importer를 임의 변경하지 않고 프로젝트 계약을 따랐다.

# 오류 상황 및 해결 방법

## 2026-11-06 운영 SEC/RSS 이벤트 원장 저장 실패 — 누락된 V141/V142 source-analysis tables

- **증상**: OCI workflow는 V166까지 성공했지만 `/api/collection-status`에서 `SCHEMA_TABLE_MISSING_MARKET_RSS_LLM_ANALYSES`와 `SCHEMA_TABLE_MISSING_SEC_CODEX_ANALYSIS_QUEUE`를 관측했다. 공개 SEC 저장 API accession 1건 재현도 같은 누락 queue 테이블에서 HTTP 503이었다. report/events GET은 DB 연결 및 V166 event 테이블 존재만으로 200/0건을 반환하므로 수집 성공을 증명하지 못했다.
- **근본 원인**: 운영 migration 이력에 이후 버전이 적용된 상태에서도, 기존 SEC/RSS analysis migrations V141/V142가 만든 source table이 실제 schema에 없었다. 원장 materializer SQL은 source 분석을 `LEFT JOIN`하지만 PostgreSQL은 없는 relation도 오류로 처리해 이벤트 저장을 중단했다.
- **영향 범위**: 기존 source fetch/import는 별도 경로로 수행될 수 있지만 SEC/RSS source analysis relation과 새 event materializer를 참조하는 동작이 실패한다. source archive와 V166 event data는 삭제되지 않았다. 실패한 수동 materialization은 transaction commit 없이 종료됐다.
- **해결 위치**: `db/migration/V167__restore_missing_source_analysis_tables.sql`은 V141 `market_rss_llm_analyses`, state table, 인덱스 및 V142 `sec_codex_analysis_queue`와 인덱스를 `IF NOT EXISTS`로 복구한다. 기존 정의·unique/check/FK 계약을 재사용하며 존재 데이터는 덮어쓰지 않는다. Error classifier는 공개 진단에 고정 allowlist table code만 기록하고 raw DB message를 노출하지 않는다.
- **재발 자동 감지**: `docs:check` 및 `deploy:verify`는 전체 migration 수와 operational relation contracts를 검사한다. 배포 뒤 `/api/collection-status`는 ledger status/count/error code를 반환하고, API `POST /api/events/collect`는 한정된 source ID에 대해서만 HTTP 503 안전 코드로 실패한다. 오류 코드에 원문 비밀이나 연결 문자열이 포함되지 않는 route test가 있다.
- **검증 결과**: read-only 운영 API에서 두 누락 relation을 확인했다. PostgreSQL 16 임시 DB에서 V167 단독 2회 반복 적용과 기존 V141+V142 적용 뒤 V167 재적용을 모두 통과했다. 로컬 `npm run deploy:verify`도 테스트 1,600 passed/3 skipped와 V167 docs/migration check를 통과했다. V167 운영 배포와 자동 cron 저장 결과는 대기 중이다.
- **남은 위험 및 다음 개선**: 운영 V141/V142 history와 실제 schema가 어긋난 이유는 공개 API만으로 확인되지 않았다. V167 적용 후 `market-rss` 및 `sec-realtime`가 실행 완료된 status와 idempotent source materialization을 확인하고, 다른 누락 relation이 나오면 원인별로 재현한다. 기존 source payload/analysis data가 없는 table은 빈 상태로 복구될 수 있다.

## 2026-11-04 이벤트 배치 재생성 후 OCI import identity 중복

- **증상**: OCI workflow #1256의 Activate release 단계에서 `Duplicate market impact event identity` 오류가 발생해 운영 release가 활성화되지 않았다.
- **근본 원인**: event definitions 변경으로 새 eventId를 만들 때 generator가 현재 검토 ID를 upsert했지만, 이전 동일 배치의 orphaned canonical eventId는 원장에 남았다. 회사 IR 일정의 sourceType/sourceId/ticker/eventType이 같아 importer identity 중복으로 판정됐다.
- **영향 범위**: `market-impact-events.json` 배치 이벤트 import와 release 활성화. importer의 duplicate precheck는 DB transaction 전에 실행돼 DB 기록을 변경하지 않았으며 이전 운영 release가 유지됐다.
- **해결 위치**: `scripts/generate-us-smallcap-event-batch.mjs`가 이전 동일 배치 review event ID를 제거한 뒤 재구성하고, 새 비-SEC source identity와 같지만 eventId가 다른 stale canonical 항목도 정리한다. `scripts/validate-us-smallcap-event-data.mjs`는 전체 US 원장을 importer와 동일한 identity tuple로 fail-closed 검사한다.
- **재발 자동 감지**: `npm run docs:check`의 batch validator가 canonical 전체 identity 중복을 검사한다. OCI workflow는 `deploy:verify`와 import precheck를 수행한다. 서로 다른 의미의 이벤트가 동일 ticker/sourceId/eventType을 쓰면 고유 eventKey를 지정한다.
- **검증 결과**: OCI #1256은 중복으로 activate에 실패했다. orphan 제거 후 canonical US 이벤트 374개, batch8 이벤트 31개 및 22 accession 연결 validator를 통과했다. 수정 commit `e20c7023` / OCI #1257과 `09f8ba12` / OCI #1258을 배포했다. 공개 events GET에서 31/31 eventId 및 FTCI의 08:30 EST / 22:30 KST `eventDetails`를 확인했고, UTF-8 보고서 HTTP 200 및 문서 catalog 등록도 확인했다. 배포 전 `npm run deploy:verify`가 통과했다.
- **남은 위험 및 다음 개선**: 같은 공식 URL이 둘 이상의 실적 발표/상황을 담을 수 있어 identity 충돌이 가능하다. 같은 source URL·ticker·event type에 별도 event가 정의되면 정의 파일에서 stable eventKey를 지정하고 canonical validator에서 감지한다. 향후 배치에서 일정 필드 변경 시 canonical과 API 응답의 현지/KST 상세를 계속 대조한다.

## 2026-10-28 종목 뉴스 요약에 RSS HTML 태그 노출

- **증상**: 종목 뉴스 요약에 `<b>` 등의 HTML 태그가 문자 그대로 보였다.
- **근본 원인**: V161에서 정규화 요약 컬럼을 도입했지만 `/api/stock/news`는 raw `summary`만 조회해 반환했다. 차트 모달은 반환 요약을 표시하므로 SEC 피드의 HTML 메타데이터가 UI까지 전달됐다.
- **영향 범위**: `/api/stock/news`를 사용하는 종목 뉴스 소비자. 운영 GET으로 10개 티커를 조회해 6건의 SEC 요약에서 태그를 재현했다.
- **해결 위치**: API는 `normalized_summary`를 우선 사용하고, 과거 레코드에는 기존 `extractMarketRssCoreSummary`로 조회 시 정규화한다. 정규화 컬럼이 손상돼도 같은 경로로 안전하게 정리하고 DB 전용 필드는 응답에서 제외한다.
- **재발 자동 감지**: `app/api/stock/news/route.test.ts`에서 정규화 우선, 과거 SEC 메타데이터 fallback, 손상된 정규화 값 제거를 확인한다. 각 사례의 직렬화 응답에 HTML 태그가 없고 `normalizedSummary` 속성이 노출되지 않아야 한다. `npm run deploy:verify`에 테스트/build/runtime smoke를 포함한다.
- **검증 결과**: 운영 재현 6/10개 티커(10개 티커 샘플에서 6건), 수정 API 회귀 테스트 3건 통과. 전체 배포 게이트 및 배포 후 운영 재검증 대기.
- **남은 위험 및 다음 개선**: 사용자 입력/출처별 특수한 태그 없는 메타데이터 변형은 계속 유입될 수 있으므로 운영 GET 표본 및 회귀 테스트로 감지한다. 기존 DB 행은 직접 수정하지 않으며 read-time fallback으로 보호한다.

## 2026-10-27 RSS 정규화 컬럼 추가 후 운영 health 오탐

- **증상**: RSS 정규화 V161 배포 workflow는 성공했지만 공개 `/api/health`가 `degraded`를 반환했다.
- **근본 원인**: `normalized_summary`를 `REQUIRED_OPERATIONAL_COLUMNS`에 추가하면서 `inspectDatabaseSchema()`의 information_schema 조회는 네 개 컬럼 쌍만 하드코딩한 채 남아 있었다. 실제 DB에 새 컬럼이 있어도 검사 결과의 available 목록에 들어오지 않아 schema readiness가 false가 됐다.
- **영향 범위**: readiness/health 보고가 잘못 degraded가 되며 실제 RSS ingest의 저장 컬럼과 Flyway migration에는 문제가 없었다. 사용자는 운영 health 상태를 신뢰할 수 없었다.
- **해결 위치**: `lib/schema-health.ts`에서 필수 컬럼 목록을 `unnest($1::text[], $2::text[])` 입력으로 직접 조회하도록 바꿔 스키마 요구 목록과 조회 조건을 단일 기준으로 연결했다.
- **재발 자동 감지**: `lib/schema-health.test.ts`는 조회 파라미터에 `normalized_summary`가 포함되고 모든 필수 컬럼이 조회되면 readiness가 true가 되는지 확인한다. 배포 검증은 전체 테스트, typecheck, build/runtime smoke를 포함한다.
- **검증 결과**: `npm run deploy:verify` 재실행 후 운영 health 200 및 V161 확인 대기.
- **남은 위험 및 다음 개선**: 수정 배포 완료 뒤 `/api/health`를 재조회한다. 이 공개 API는 상세 migration 번호를 숨기므로, HTTP 200은 전체 schema readiness 확인으로 쓰고 구체 Flyway 버전은 workflow migration 성공 로그 또는 인증된 health 진단으로 별도 확인한다.

## 2026-10-26 미국 산업별 거래대금 관리자 집계 API 조회 오류

- **증상**: 배포된 `GET /api/admin/us-industry-turnover` 첫 운영 조회가 nginx `504 Gateway Time-out`으로 끝났다. 첫 쿼리 최적화 후에는 HTTP 200이었지만 `eligibleWithPeriodCandlesCount=0`으로 빈 표를 잘못 반환했다.
- **근본 원인**: 운영 캔들 테이블의 `candle_date`는 TEXT의 `YYYYMMDD` 형식이다. 최초 쿼리의 `c.candle_date::date` 조건은 `(market, code, timeframe, candle_date)` 복합 인덱스 범위 탐색을 방해했고, 첫 최적화는 실제 `YYYYMMDD` 값에 ISO `YYYY-MM-DD` 경계를 비교해 모든 기간 캔들을 제외했다. 보통주별 최신일 탐색을 반복한 것도 첫 최적화 응답에 31초가 걸린 원인이었다.
- **영향**: 조회 전부 읽기 전용이라 저장 변경은 없다. 첫 HTTP 200 응답은 5,163개 대상 종목 중 기간 캔들 0개 및 산업 그룹 0개를 반환했으며 거래대금 표로 사용하지 않았다.
- **해결 위치**: `app/api/admin/us-industry-turnover/route.ts`에서 최신 날짜는 종목별 최신 일봉 요약 테이블에서 얻고, 전체 대상은 정렬된 200종목 페이지로 나누어 원본 기간 캔들과 조인한다. 첫 페이지에서만 전체 캔들 커버리지를 산출한다. 날짜 경계는 `TO_CHAR(date, 'YYYYMMDD')`로 실제 저장 형식에 맞춘다.
- **재발 자동 감지**: API 회귀 테스트가 `YYYYMMDD` 범위, read-only SQL, 200개 상한과 offset 경계를 확인한다. 운영 페이지별 응답시간, 페이지 간 기준일/eligible 수 일치, 마지막 `nextOffset=null`, 기간 캔들 커버리지 및 원천별 합계를 확인하고, 운영 DB 직접 접속 없이 API 응답으로 진단한다.
- **검증 결과**: 최초 504와 31,273ms 빈 응답은 운영 관리자 API로 관측했다. 전체 일괄 쿼리는 최적화 후에도 운영에서 504였다. 200개 종목 단위 offset 읽기로 다시 개선 중이며 route 회귀 테스트 5개와 전체 `npm run deploy:verify`(1,538 tests, build/runtime/browser smoke 포함)를 통과했다. 분할 버전은 배포 전이므로 운영 API 페이지별 응답 및 합계는 재검증해야 한다.
- **남은 위험 및 다음 개선**: 단일 페이지가 504면 페이지 크기를 더 낮춰 재검증한다. 모든 페이지의 기준일·대상 수가 불일치하면 합산하지 않는다. `close × volume`은 `trading_value`가 없는 행의 대체 추정치로 표시한다.

## 2026-10-25 KIS 미국 업종 동기화의 운영 universe 미정합

- **증상**: KIS 업종 UPDATE 결과의 코드 불일치는 0이지만, KIS 보통주 후보 일부가 저장되지 않고 KIS 원본과 무관한 활성 `COMMON_STOCK` 행이 남아 전체 보통주 업종 저장을 보장할 수 없었다.
- **근본 원인**: 기존 동기화가 양쪽 테이블 교집합에만 `industry_code`를 UPDATE했으며 KIS 후보를 신규 반영하거나 잘못 활성화된 common·특수상품 partition을 함께 정합화하지 않았다.
- **해결 위치**: `lib/us-industry-code-sync.ts`의 KIS full sync에서 NAS/NYS/AMS 전체 후보 및 특수행 upsert, 외부 활성 common 비활성화, 사후검증을 단일 transaction/advisory lock으로 묶는다. `lib/instrument-universe-import.ts`는 KIS 비주식·ETP·알 수 없는 유형을 fail-closed 처리한다.
- **재발 자동 감지**: 업로드 사후에 `missingCount=0`, `mismatchCount=0`, `activeDatabaseOnlyCount=0`, special source missing `0`을 transaction 안에서 강제하고, 운영 `mode=audit` read-only 결과로 다시 대조한다. KIS 원본 코드 `000`은 미분류로 보존한다.
- **운영 검증 결과(2026-10-25)**: 배포 `f84c842f` 후 `.env.local` 관리자 인증으로 공식 마스터를 업로드했다. KIS 후보 common 5,358건 upsert, special 7,533건 upsert, 이전 후보 외 활성 common 1,436건 비활성화 후 독립 read-only audit에서 후보 누락·후보 외 활성 common·업종 코드 불일치가 모두 0이었다.
- **영향 및 남은 위험**: 이전 common 행은 삭제하지 않고 비활성화해 이력을 보존한다. 후보 밖 148행은 KIS 마스터에서 확인할 수 없어 원인 미확정 상태로 비활성 유지한다. KIS 원본 `000` 2,724건은 유효 업종 코드가 아니며 이름이나 외부 공급자로 보정하지 않는다. KIS 마스터의 분류 범위 변경은 다음 full sync 때 동일한 전수 검증 기준으로 감지한다.

## 2026-10-25 RSS 제목 숫자 번역과 backlog 배치 설정

- **증상**: 운영 RSS가 Azure로 제목을 한국어 번역했지만 `Third Quarter`를 `3분기`로 바꾼 숫자를 미번역 숫자로 오인해 `translation_numeric_hallucination`으로 차단했다. 동시에 RSS timer 실행은 회당 세 건만 시도해 과거 대기열이 느리게 진행됐다.
- **근본 원인**: 숫자 무결성 검사는 아라비아 숫자가 원문에 없으면 모두 환각으로 간주했다. 배치 설정은 Next.js 앱 프로세스의 `/etc/stockman/stockman.env` 값에 의존했으며, HTTP를 호출하는 RSS oneshot 서비스에 설정을 추가해도 이미 실행 중인 앱 프로세스에는 전달되지 않았다.
- **해결 위치**: `lib/translate-market-rss-item.ts`는 원문에 있는 영어 기수·서수와 월 이름에 대응하는 숫자 변환만 허용하고, 원문과 무관한 숫자 및 새 금융 부호는 계속 차단한다. `app/api/cron/market-rss/route.ts`는 앱 환경변수와 무관하게 번역·알림 배치 크기를 20건으로 고정한다.
- **재발 자동 감지**: `lib/translate-market-rss-item.test.ts`는 `Third Quarter` → `3분기`를 허용하고 출처에 없는 숫자를 계속 거부한다. `app/api/cron/market-rss/route.test.ts`는 batch 환경변수가 3이어도 20건을 전달하는지 검사하며, `scripts/check-oci-cron.mjs`는 RSS route의 batch 상수를 검사한다. 배포 후 최근 실행에서 `attempted=20`, `translated`·`notified.sent` 증가와 `backlogRemaining` 감소를 확인한다.
- **영향 범위와 남은 위험**: 이번 원인으로 차단된 제목은 한국어 번역 검증 통과 전까지 Discord에 전송되지 않았다. Google 앱 월 한도는 300,000자 중 299,992자가 예약되어 fallback이 사실상 중단됐으며, Azure 사용 가능량은 진단 당시 약 1,518,453자였다. 불완전 번역 등 다른 품질 실패는 여전히 보류된다. 30일 운영 조회에서는 GlobeNewswire 20건, StockTitan 2,174건, SEC 3,028건의 PENDING이 확인됐으며, 30일보다 오래된 항목 수는 별도 집계되지 않았다.
- **다음 개선**: 새 배포 후 세 출처의 실제 제목 번역 및 Discord 수신을 관찰하고, 30일을 넘은 backlog까지 완전히 소진됐는지 운영 상태에서 확인한다. 번역 서비스 한도는 사용자 승인 없이 높이지 않는다.

## 2026-10-20 RSS Discord 알림 출처 허용 목록 적용

- **증상**: Newsis 등 SEC·StockTitan 이외 RSS도 공통 시장 RSS Discord webhook 알림을 받을 수 있었다.
- **근본 원인**: RSS 수집 결과에는 허용 출처 외 국내 매체가 포함되지만, 알림 전송 쿼리와 재시도 워커에 출처 허용 목록이 없었다.
- **영향 범위**: `MARKET_RSS` 신규 전송 및 `discord_delivery_queue` 재시도. RSS 데이터 수집은 계속되며, SEC 및 StockTitan 알림은 유지된다.
- **해결 위치**: `market-rss-pipeline`에서 비허용 출처의 PENDING 행을 `SKIPPED`로 바꾸고 전송 조회를 SEC·StockTitan으로 제한한다. `discord-delivery-retry`는 큐의 원본 기사 출처를 확인해 비허용 또는 원본 미확인 메시지를 전송하지 않고 큐와 기사 상태를 `SKIPPED`로 기록한다.
- **재발 자동 감지**: `market-rss-discord-policy.test.ts`에서 허용·차단 출처를 검증한다. 배포 전 `npm run deploy:verify`를 실행한다.
- **남은 위험**: 이미 발송 완료된 과거 알림은 회수되지 않는다. 큐에 남은 기존 비허용 출처는 재시도 시 폐기 상태로 전환된다.

## 2026-10-20 비 StockTitan RSS Discord 메시지 형식 불일치

- **증상**: RSS Discord 알림에 출처·번역 상태·티커·등락률 등의 불필요한 줄이 표시되거나, 제목 링크의 임베드가 붙을 수 있었다.
- **근본 원인**: 신규 발송 포맷에 메타데이터가 포함됐고, 실패한 과거 발송은 재시도 큐가 저장 payload 그대로 별도 전송했다.
- **영향 범위**: `MARKET_RSS`를 사용하는 StockTitan 이외 RSS 신규 및 재시도 알림. StockTitan 신규 메시지 형식은 범위에서 제외한다.
- **해결 위치**: `market-rss-pipeline`은 비 StockTitan 메시지에 제목·발행 시각만 구성하고 모든 RSS 전송에 임베드 억제를 설정한다. `discord-delivery-retry`는 큐에 남은 비 StockTitan payload도 제목·발행 시각만 추려 보낸다.
- **재발 자동 감지**: `market-rss-discord-message.test.ts`에서 기존 포맷을 축약했을 때 다른 항목이 남지 않는지와 임베드 플래그 값을 확인한다. 배포 전 `npm run deploy:verify`를 실행한다.
- **남은 위험**: 재시도 payload에 기존 포맷 외의 제목 형태가 저장된 경우 제목 줄을 인식하지 못할 수 있다. 현재 파이프라인이 만드는 굵게 표시한 제목 및 링크 제목 형식을 회귀 테스트로 고정한다.

이 문서는 RSS 프로젝트에서 반복적으로 발생할 수 있는 오류와 확인 순서를 관리한다. 모든 진단은 실제 응답·로그·DB 상태를 기준으로 하며, 추정만으로 토큰이나 캐시를 삭제하지 않는다.

## 공통 진단 원칙

1. 요청 ID, HTTP 상태, 외부 API 응답 코드와 메시지를 먼저 확보한다.
2. 로컬·개발·운영 실행 환경의 환경변수 주입 상태를 분리해 확인한다.
3. 기존 DB 캐시를 변경하기 전에 읽기 전용 상태를 확인한다.
4. 실패한 단일 종목 또는 단일 요청으로 재현한 뒤 전체 작업을 실행한다.
5. 한글 로그와 문서는 UTF-8을 유지한다.

원격 일봉 동기화의 `scripts/sync-daily-cache-from-remote.mjs`는 대상 universe가 비거나, 저장 검증 봉이 0건이거나, 요청 종목의 빈/누락 봉이 있을 때 성공으로 보고하지 않는다. 최상위 `ok`와 프로세스 exit code가 실패를 나타내고, 종목 누락은 `missingCount`와 `missingCodeSample`로 확인한다. 이전 batch가 이미 commit된 뒤 뒤쪽 batch에서 중단되면 그 저장은 유지되므로 재실행 전 로컬 최신 거래일과 coverage를 확인한다.

같은 스크립트는 OHLC 가격의 유한성/양수 및 high-low 관계와 거래량의 유한성/비음수 조건을 확인한다. 현재 DB/API가 `double precision`과 JSON number를 사용하므로 안전 정수 범위를 넘는 값도 기존 계약에 따라 허용한다. 공개 API가 JSON 숫자로 내보내기 전 원천 정밀도를 잃을 수 있으며 이 손실은 로컬 동기화 단계에서 복구할 수 없다.

동기화 결과에서 `received`는 원본 봉 응답 행, `saved`는 날짜 중복 정리 후 UPSERT 검증을 통과한 행이다. 같은 종목/거래일에 같은 OHLCV가 반복되면 한 행으로 저장하고 `duplicateCandleCount`에 반영한다. 같은 거래일의 OHLCV 값이 서로 다르면 last-write-wins로 고르지 말고 입력 batch를 거부해 원천 응답을 조사한다.

각 `committed` 진행 로그는 하나의 시장별 batch transaction commit 이후에만 출력된다. 실패 뒤 재실행 전까지 저장 확정으로 볼 수 있는 진행 경계는 마지막 `committed` 로그이며, transaction 실패한 batch의 `saved`는 집계되지 않는다.

universe 또는 batch 오류는 시장별 결과의 `ok=false`와 `failure` 객체(phase, market, offset, codeCount, 요약 오류)를 남긴다. DB 저장 전후 batch 오류에는 `failure.received`, `expectedSaveCount`, `duplicateCandleCount`, `missingCount`가 시도된 batch 기준으로 들어간다. 최종 집계의 counters는 commit 완료분만 포함하므로 이 실패 batch 수치를 합산해 committed totals로 오인하지 않는다. `--market=ALL`은 실패한 시장 결과를 보존하고 다른 요청 시장도 계속 조회한다. 최상위 exit code 1을 확인하고, 다시 실행하기 전에 각 시장의 마지막 committed 진행 로그와 로컬 coverage를 대조한다.

DB save 중 `failure.transactionOutcome=COMMIT_UNKNOWN`이면 COMMIT 응답을 받지 못한 것이므로 write 반영 여부를 로그만으로 판단하지 않는다. 실행 전후 로컬 DB의 대상 market/code/timeframe coverage를 read-only로 재확인한다. ROLLBACK 실패 시 client/backend 연결은 pool에서 제거되어야 하며 오류 메시지에는 원래 write 오류와 rollback 오류가 함께 남아야 한다.

`failure.errorDetails`는 nested `cause`와 AggregateError의 원본 errors를 최대 4단계까지 구조화해 보존한다. 각 AggregateError의 하위 errors는 배열 형식인지 확인한 뒤 최대 20개만 포함하고 나머지는 `errorsOmitted`로 표시한다. 배열 형식이 아니면 `errorsUnavailable`을 표시하며, 요약 중 예상치 못한 getter/형식 오류가 발생해도 `ErrorSummaryFailed`로 안전하게 반환한다. 최상위 `failure.error`만으로 원본 DB/network 오류가 숨겨지지 않게 사용하고 URI userinfo, 민감 query/`key=value` 값, Bearer 자격증명은 출력하지 않는다. Error 이름은 마스킹 후 100자, 오류 message는 500자로 제한한다. Error 객체, 문자열 throw, 실행 최상위 오류, pool 종료 오류도 공통 sanitizer로 요약하며 원문 message를 직접 내보내지 않는다.

`npm run cron:check`는 error property 보호용 try/catch와 `AggregateError.errors` 배열 검증·폭 제한의 실행 순서도 검사한다.

동기·비동기 동기화 초기화 시 `DAILY_CACHE_API_URL`은 trim 후 HTTP(S) absolute URL이며 userinfo가 없는지 검증한다. URL parser 오류는 설정 원문을 포함하지 않는 고정 메시지로 변환하며, 동기 스크립트는 PostgreSQL pool 생성의 동기 예외도 connection string을 노출하지 않는 고정 메시지로 변환한다. 비동기 스크립트의 daily-candles, fundamentals, chart 및 직접 KIS endpoint는 검증된 동일 base URL만 사용한다.

비동기 일봉 동기화는 `persistParts(kind, parts)`에 시장 kind를 전달해 `refreshDailyCandleSummaries`에 명시한다. 이 인수가 누락되면 DB transaction에서 ReferenceError가 발생해 batch rollback될 수 있으므로 `npm run cron:check`가 저장 함수 시그니처·호출부·summary 갱신 연결을 확인한다.

비동기 동기화 transaction에서 COMMIT 요청이 실패하면 결과를 `LOCAL_TRANSACTION_COMMIT_OUTCOME_UNKNOWN`으로 표시하고 client를 폐기한다. rollback도 실패하면 원래 transaction 오류와 rollback 오류를 함께 `AggregateError`로 보존하고 client를 폐기해 pool에 되돌리지 않는다. node-postgres 공식 문서상 `client.release(true)`는 client를 pool에 반환하는 대신 연결을 제거한다([Pool API](https://node-postgres.com/apis/pool)).

비동기 동기화 PostgreSQL pool은 새 연결 대기를 10초로 제한한다. idle client의 background `error`는 uncaught 종료 대신 listener에서 횟수와 첫 오류의 sanitized name/message/code 및 nested causes를 보존한다. 최종 JSON은 `pool.end()`가 끝난 뒤 출력하며, 실행 fatal error·종료 error·background error 중 하나라도 있으면 `ok=false`, 해당 failure 요약 및 exit code 1로 보고한다. URI userinfo, query/fragment 자격증명, token/secret 계열 path segment, key-value 및 `password is ...` 표현, Bearer/Basic 자격증명을 마스킹하고 message 500자·cause depth 4·AggregateError child 20개로 제한한다. node-postgres 공식 문서는 connection timeout 기본값이 0(무제한)이고 idle client 오류 listener가 없으면 uncaught error가 될 수 있다고 설명한다([Pool API](https://node-postgres.com/apis/pool)).

비동기 저장 batch에서 같은 market/code/date 봉이 여러 번 오면 숫자로 정규화한 OHLCV가 모두 같을 때만 하나로 합친다. 값이 다른 중복은 충돌 field와 종목·날짜를 오류에 표시해 transaction 전체를 rollback한다. 재발은 `npm run cron:check`에서 중복 비교와 실패 조건을 감시한다.

중복 봉이 있는 정상 batch는 `saved`가 원본 `fetched`보다 작으므로, async 성공 판정은 시장별 commit 기준 `saved + duplicateCandleRows === fetched`를 사용한다. duplicate counter는 전체 transaction이 commit된 뒤에만 반영한다.

비동기 fundamentals 응답은 저장 전에 요청 market/code와 대조하고, 미요청·중복 code 및 잘못된 nullable numeric/text/timestamp 필드를 거부한다. 응답 code는 요청 universe의 정규 code로 바꿔 저장한다. 누락 row는 public snapshot endpoint가 보유 row만 반환할 수 있으므로 허용한다.

비동기 일봉 응답 envelope의 `market`과 `timeframe`도 요청값과 일치해야 한다. mismatch는 row 정규화와 DB 저장 전에 batch 오류로 종료한다. 직접 KIS 경로는 응답 원천을 검증한 뒤 동일한 요청 scope metadata를 envelope에 부여한다.

비동기 sync는 허용된 option 목록을 적용하고 위치 인자·알 수 없는/중복 옵션·누락 값을 pool 생성 전에 거부한다. boolean은 문자열 `true`/`false`만 받고 bare boolean flag는 true로 처리한다. 정수 옵션(`limit`, `batch`, worker, queue, `max-instruments`)은 공백·쉼표·지수 표기 없이 정수 십진수 literal만 허용하고 safe integer 여부를 검사한 뒤 기존 bound로 clamp한다. 시총 옵션은 양의 십진수 literal만 허용한다. 특히 typo로 전체 시장 실행이 되는 경우, 0 consumer 또는 NaN queue capacity로 인한 대기를 방지한다.

`--include-inactive-daily=true`는 US universe의 `daily_active` 제약을 제거한다. `--us-market-cap-under`로 추가 필터링할 때도 snapshot eligibility query에 같은 동적 filter를 써야 비활성 일봉 종목을 되살리지 않고, 반대로 명시적으로 포함한 종목을 다시 제외하지 않는다.

US에서 `--only-missing-date=true`와 `--only-unrefreshed=true`를 함께 지정하면 둘 중 하나로 분기하지 않고 조건을 AND로 결합한다. 대상 날짜에 유효 봉이 없고 유효 latest summary가 30분 이상 stale이거나 없는 종목만 조회한다.

`--only-unrefreshed=true` 단독 옵션도 US D봉에서만 유효하며, 다른 market/timeframe 조합은 실행 전에 오류 처리한다.

이 공개 읽기 경로는 API URL userinfo를 허용하지 않는다. `.env.local`에서 주입된 로컬 DB/API URL은 앞뒤 공백을 제거한 동일 값으로 검증·사용하며, fundamentals 요청도 검증된 공개 API base URL을 재사용한다.

로컬 PostgreSQL pool의 새 연결은 10초 후 timeout되며 무기한 기다리지 않는다. pool idle client의 `error` 이벤트 listener는 오류를 sanitized 구조로 보존하고 발생 수를 집계한다. 이런 오류가 한 번이라도 있으면 최종 JSON에 `poolBackgroundFailure`가 포함되고 전체 `ok=false`, exit code 1이어야 한다. node-postgres는 idle client에서 backend/network 오류가 발생할 수 있고 listener가 없으면 uncaught error로 프로세스가 종료될 수 있다고 설명한다([공식 Pool API](https://node-postgres.com/apis/pool)).

동기화 최종 JSON은 pool 종료 뒤 출력한다. 최상위 `fatalFailure` 또는 `poolShutdownFailure`가 있으면 시장별 처리 결과가 전부 성공이어도 최상위 `ok`는 false이고 프로세스 exit code는 1이어야 한다.

동기화 시작 전 `--limit`과 `--batch`는 안전한 정수여야 한다. 무효 CLI 값은 pool/API 실행 전에 명시 오류로 거부되어야 하며, 유효 정수의 경계 초과는 문서화된 범위(각각 1–300, 1–100)로 clamp한다.

지원 인자는 `market`, `timeframe`, `limit`, `batch`, `skip-fundamentals`다. 중복/미지원 옵션, 위치 인자, 필수 값 누락, `skip-fundamentals`의 `true|false` 외 값은 실행 전 거부한다. 환경설정·CLI 오류는 pool 생성 전에 발생하므로 어떤 DB/API 호출도 시작하지 않는다.

원격 응답은 envelope의 JSON object와 엄격한 `ok === true`, `items` 배열부터 확인한 후 row 구조와 집계를 처리한다. null 응답, null row, 비배열 candles는 일반 TypeError가 아니라 stage·market이 식별되는 형식 오류로 반환되어야 한다.

동기화 실패의 `failure.phase`는 `daily-candles-request/http/body/json`, `daily-candles-envelope/items/normalize`, `instrument-fundamentals-request/http/body/json/envelope/items`, `database-save` 경계를 구별한다. body read timeout은 body phase, 응답 파싱 오류는 json phase로 보존되며 `failure.error`와 함께 병목 위치를 판정한다.

같은 동기화 스크립트의 fundamentals snapshot API는 캐시에 존재하는 row만 반환할 수 있어 미보유 종목은 `fundamentalsMissingCount`와 `fundamentalsMissingCodeSample`로 별도 관찰하고 봉 적재 상태를 실패 처리하지 않는다. 누적 표본은 시장 접두사를 포함해 최대 20개이며 실패 batch 표본도 같은 `market:code` 형식을 사용한다. 다만 반환된 row의 market/code가 해당 요청 universe에 포함되는지와 중복 여부는 저장 전에 검증해야 한다.

외부 `GET /api/public/instrument-fundamentals`도 snapshot 존재만으로 종목 자격을 판정하지 않는다. 요청 market alias를 정규 거래소로 해석하고 활성 `COMMON_STOCK` 마스터 및 ETF/ETP·워런트·파생·DR·우선주 플래그를 통과한 code만 snapshot과 조인한다. 미등록·비활성·분류 불가 코드는 fail-closed로 응답에서 제외한다.

fundamentals snapshot의 nullable double precision 필드(`price`, `changeRate`, `open`, `high`, `low`, `volume`, `tradingValue`, `marketCap`, `listedShares`)는 응답에서 `null` 또는 유한 number여야 한다. 필드 자체가 빠지거나 문자열/비유한 숫자가 오면 batch를 저장하지 않고 `instrument-fundamentals-items` 단계의 field 명시 오류로 분류한다.

같은 응답에서 `name`은 문자열, `currency`는 필수 키의 문자열/null, `observedAt`·`fetchedAt`은 필수 키의 유효 timestamp 문자열/null로 검사한다. timestamp null은 저장 SQL의 `COALESCE(..., NOW())` 경로를 유지하며 필드 누락은 `undefined` parameter 오류 전에 items 단계에서 거부한다.

## 2026-10-20 StockTitan 제목 이외 RSS 번역 범위 차단

- **증상**: 번역 API 요구 범위는 StockTitan RSS 제목인데 다른 출처의 RSS 제목도 번역 provider로 전달될 수 있었다.
- **근본 원인**: 운영 `translatePendingMarketRssArticles()` 조회가 RSS 출처를 필터링하지 않았고, 관리자 `market-rss-test?translate=true`가 전체 피드를 대상으로 번역을 실행할 수 있었다. 공통 변환 함수도 출처 제한 없이 제목을 provider에 넘겼다.
- **영향 범위**: 호출 조건을 만족한 비 StockTitan RSS 제목이 외부 번역 사용량과 월간 한도에 포함될 수 있었다. 공통 함수는 제목만 전달했으나 제목의 출처를 제한하지 않았다.
- **해결 위치**: 운영 쿼리에 `source=STOCKTITAN`을 고정하고 공통 번역 함수에도 동일한 방어를 추가한다. 관리자 테스트는 `translate=true`에서 StockTitan만 기본 선택하고 다른 출처를 거부한다. 번역 문자 수 기록도 제목 길이로 맞춘다.
- **재발 자동 감지**: 공통 함수 테스트에서 비 StockTitan 기사로 provider가 호출되지 않는지 검증하고, 관리자 API 테스트에서 기본 StockTitan 제한과 다른 출처 거부를 검증한다. `npm run deploy:verify`로 전체 회귀 검증한다.
- **남은 위험**: 변경 전 이번 달 사용량 집계에는 이전의 비 StockTitan 제목 요청이 반영되어 있을 수 있다. 과거 `translation_char_count` 값도 구 계산식에 따라 summary/content 길이를 더해 실제 provider 입력량보다 클 수 있다. 과거 값을 삭제·수정하지 않으며 월별 한도는 다음 달에 새로 시작하고 이후 운영 호출부터 StockTitan 제목만 예약한다.

## 2026-09-18 운영 메인 페이지 ChunkLoadError

- **증상**: 운영 `/`에서 `ChunkLoadError`가 발생하고 `페이지를 불러오지 못했습니다`가 표시됨. 브라우저가 이전 HTML이 참조하는 해시 청크를 요청했지만 활성화된 릴리스에서 404가 됨.
- **근본 원인**: 릴리스 디렉터리 교체 시 이전 `.next/static` 해시 파일을 제거하면서, 브라우저·프록시가 잠시 보유한 이전 HTML과 새 정적 자산의 호환 경로가 없었다.
- **해결 위치**: `deploy/oci/stockman-activate`가 이전 릴리스의 `.next/static`을 incoming 릴리스에 보존한다. `deploy/oci/nginx-stockman.conf`는 HTML·API를 재검증하고 해시 정적 파일만 장기 캐시한다.
- **클라이언트 복구**: `components/client-error-reporter.tsx`가 청크 로딩 오류를 감지하면 세션당 한 번 캐시 버스터 URL로 재진입해 이미 열린 탭도 새 HTML을 받도록 한다.
- **재발 자동 감지**: `npm run deploy:verify`의 standalone `/charts` smoke와 운영 배포 후 메인 페이지 확인에서 청크 로딩 오류를 확인한다. 배포 체크리스트에 캐시·정적 청크 검사를 추가했다.
- **추가 원인**: standalone 패키지에 `.next/static` 복사가 빠지면 HTML은 200이어도 JavaScript 청크가 404가 된다. workflow에서 정적 파일을 명시적으로 복사하고 tar 내부 청크 존재를 검증한다.
- **검증 강화**: `deploy:verify`가 `/charts` HTML에서 실제 JS 경로를 추출해 해당 청크의 200·JavaScript 응답까지 확인한다.
- **검증**: 수정 후 전체 테스트, 타입체크, 문서·감사·cron 검사, production build 및 runtime smoke를 다시 통과시킨다.

## 2026-09-04 점검 기록

## 2026-09-08 점검 기록

### KIS 기간 조회 모드의 날짜 범위 검증 누락 보완

- **원인**: `startDate`·`endDate` 검증이 회원사 일별 조회에만 적용되고 증권사별 투자의견 조회에는 적용되지 않았다.
- **영향**: 투자의견 조회에 잘못된 날짜나 역전된 기간이 전달되어 외부 API 오류가 늦게 발생할 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 회원사 일별·증권사별 투자의견 조회가 동일한 날짜 형식과 범위 검증을 사용하도록 통합했다.
- **검증**: 타입 검사와 문서·마이그레이션 검사를 통과했다.

### KIS 기본 조회일의 UTC·KST 불일치 보정

- **원인**: 날짜를 UTC `toISOString()`에서 생성해 한국시간 자정 전후에 KIS 기준일과 하루 차이가 날 수 있었다.
- **영향**: 날짜를 생략한 국내 분봉·수급 조회가 실제 한국 날짜가 아닌 전일 데이터를 요청할 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에 `Asia/Seoul` 기준 날짜 생성 함수를 추가하고 기본 조회일에 적용했다.
- **검증**: 타입 검사와 문서·마이그레이션 검사를 통과했다.

### 해외 거래소 코드 대소문자 정규화

- **원인**: 소문자 거래소 코드가 유효성 검사를 통과해도 KIS 호출에는 원문 소문자가 전달될 수 있었다.
- **영향**: `exchange=nas`와 같은 요청이 KIS에서 잘못된 거래소 코드로 처리될 가능성이 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 거래소 코드를 검증 후 대문자로 정규화해 모든 해외 시세 호출에 사용한다.
- **검증**: 타입 검사와 문서·마이그레이션 검사를 통과했다.

### KIS 분봉·조정주가 입력값 검증 보강

- **원인**: 해외 분봉 간격·조회 건수와 국내 조정주가 옵션이 임의 문자열로 외부 API에 전달될 수 있었다.
- **영향**: 잘못된 요청이 KIS 오류로 늦게 실패하고, 차트 모달에서 원인 구분이 어려워질 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 해외 분봉 간격을 `1|5|10|15|30|60`, 조회 건수를 `1..120`, 국내 조정주가를 `0|1`로 제한했다.
- **검증**: 타입 검사와 문서·마이그레이션 검사를 통과했다.

### 국내 KIS 실패 응답이 확정 수급으로 표시되는 문제 보정

- **원인**: 국내 `market-flow` 응답의 `flowStatus`가 KIS 호출 성공 여부와 무관하게 추정 또는 확정 상태로 설정됐다.
- **영향**: API가 502를 반환한 상황에서도 차트 모달이 확정 수급 데이터처럼 표시할 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 `result.ok === false`이면 항상 `UNAVAILABLE`을 반환하도록 보정했다.
- **검증**: 타입 검사와 문서·마이그레이션 검사를 통과했다.

### 해외 KIS 정상 데이터가 장애 상태로 표시되는 문제 보정

- **원인**: 해외 호가·시세·분봉·기간봉·체결 응답이 성공해도 응답 메타데이터의 `flowStatus`를 항상 `UNAVAILABLE`로 고정했다.
- **영향**: 차트 모달에 정상적인 해외 데이터가 장애처럼 표시됐다. 국내식 투자자별 수급이 없다는 사실과 시세 데이터 조회 실패가 구분되지 않았다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 KIS 응답 성공 여부에 따라 `AVAILABLE`/`UNAVAILABLE`을 설정하고, 해외 투자자 수급 미지원 안내는 기존 `note`로 유지했다.
- **검증**: 타입 검사와 프로덕션 빌드에서 라우트 컴파일 경로를 확인한다.

### KIS 차트·수급 라우트의 외부 예외 표준화

- **원인**: KIS 네트워크 타임아웃, 응답 파싱 오류 또는 예기치 않은 공급자 예외가 `market-flow` 라우트 최상위까지 전파될 수 있었다.
- **영향**: 차트 모달이 표준 오류 JSON 대신 Next.js 기본 500 응답을 받아 원인 표시와 재시도 처리가 불안정할 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에 최상위 예외 경계를 추가해 안전한 오류 메시지만 로그에 남기고 `KIS_MARKET_FLOW_FAILED` 502 응답으로 표준화했다.
- **검증**: 타입 검사와 프로덕션 빌드에서 라우트 컴파일 경로를 확인한다.

### KIS 차트 요청의 잘못된 입력이 외부 API까지 전달되는 문제 차단

- **원인**: 국내 과거일 분봉 요청에서 잘못된 `date`를 현재 날짜로 대체했고, 일자별 시세의 `period`와 해외 티커·거래소 값을 충분히 검증하지 않았다.
- **영향**: 차트 모달이 사용자가 선택한 날짜와 다른 데이터를 표시하거나, KIS에 실패가 예정된 요청을 보내 원인 파악이 어려워질 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 `date=YYYYMMDD`의 실제 달력 유효성을 확인하고, `period`는 `D|W|M`, 해외 거래소는 `NAS|NYS|AMS`, 해외 티커는 허용 문자·길이를 검증하도록 보강했다.
- **검증**: 타입 검사, 전체 Vitest(144개 파일·475개 테스트), 문서·마이그레이션 검사, 프로덕션 빌드를 통과했다.

### KIS 시장 구분 및 해외 기간봉 파라미터의 잘못된 분기 방지

- **원인**: `market`이 `KR`·`US` 외 값이어도 국내 분기로 진행했고, 해외 기간봉의 기간·기준일을 라우트에서 검증하지 않았다.
- **영향**: 오타가 난 시장 값이 국내 종목 요청으로 처리되거나, KIS가 이해하지 못하는 해외 기간봉 요청이 외부 API까지 전달될 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 시장을 `KR|US`, 해외 기간을 `0|1|2`, 기준일을 유효한 `YYYYMMDD`로 제한했다.
- **검증**: 타입 검사와 문서·마이그레이션 검사를 통과했다.

### 로컬 실행 시 `.env.local` 우선 주입

- **원인**: Next.js 개발 서버가 상위 셸에 이미 존재하는 환경변수를 유지해 `.env.local`의 KIS 자격증명과 다른 값으로 실행될 수 있었다.
- **영향**: 로컬에서는 유효한 `.env.local` 자격증명이 있어도 KIS가 `EGW00103` 등 인증 오류를 반환할 수 있었다.
- **해결 위치**: `scripts/dev-server.mjs`가 `.env.local`을 UTF-8로 직접 읽어 실행 환경에 주입하며, 파일 값을 상위 셸 값보다 우선 적용한다. 자격증명 원문은 출력하지 않는다.
- **검증**: 스크립트 구문 검사와 Git diff 공백 검사를 통과했다. 로컬 KIS 단일 종목 검증 후 전체 캐시 갱신을 수행하는 운영 절차를 유지한다.

## 2026-09-02 점검 기록

### 브라우저 오류 보고 폭주 및 비정상 payload 차단

- **원인**: 전역 `error`/`unhandledrejection` 이벤트가 짧은 시간에 반복되거나 배열 등 잘못된 JSON이 전송되면 인증 없는 오류 보고 API가 불필요하게 호출될 수 있었다.
- **영향**: 오류 수집 API와 Discord 진단 경로가 폭주해 정상 오류 처리와 운영 진단을 방해할 가능성이 있었다.
- **해결 위치**: `app/api/client-errors/route.ts`에서 객체 payload만 허용하고, 전달자 주소별 분당 30건으로 제한했다. 오래된 메모리 bucket은 정리한다.
- **검증**: `app/api/client-errors/route.test.ts`에 비정상 payload와 반복 요청 제한 테스트를 추가한다.

### 관리자 해외 분봉 갱신 API의 raw 예외 노출 방지

- **원인**: `app/api/admin/us-minute-candles/route.ts`가 갱신 실패 시 외부 공급자·DB 예외 메시지를 그대로 응답했다.
- **영향**: 관리자 화면에 불필요한 내부 구현 정보가 노출되고, 공급자 오류 형식에 따라 UI 처리가 달라질 수 있었다.
- **해결 위치**: JSON 객체와 거래소·티커 형식을 먼저 검증하고, 서버 로그에는 진단 메시지를 남기되 응답은 `US_MINUTE_CANDLES_REFRESH_FAILED`로 표준화했다.
- **검증**: 타입 검사와 전체 회귀 검증에서 해당 라우트의 빌드·컴파일 경로를 확인한다.

### 관리자 기능 모듈 및 공시 동기화 라우트의 예외 전파 방지

- **원인**: 기능 모듈 설정 조회, 최근 실행 이력 조회, Discord 재시도와 DART 동기화의 비동기 호출이 라우트 최상위에서 보호되지 않았다.
- **영향**: DB 또는 외부 연동 장애가 Next.js의 기본 500 응답으로 노출되고, cron 실행 결과가 표준 오류 형식 없이 종료될 수 있었다.
- **해결 위치**: 관련 라우트에 서버 로그와 표준화된 503/502 응답을 추가했다. 인증 및 정상 분기 동작은 유지한다.
- **검증**: 타입 검사·문서 검사 및 프로덕션 빌드로 라우트 컴파일 경로를 확인한다.

### KIS 외부 오류 원문 로그 길이 제한

- **원인**: 토큰 발급 및 해외 순위 조회 실패 시 공급자 응답 원문을 제한 없이 로그와 진단 저장소에 기록할 수 있었다.
- **영향**: 로그 폭주 및 공급자 응답에 포함될 수 있는 불필요한 정보의 장기 보관 위험이 있었다.
- **해결 위치**: `lib/kis-token.ts`는 500자, 해외 순위 조회 모듈은 응답 preview를 1,000자로 제한한다.
- **검증**: 타입 검사·문서 검사와 전체 프로덕션 빌드에서 연동 모듈 컴파일 경로를 확인한다.

### Discord 오류 알림 동시 중복 전송 방지

- **원인**: 동일 오류가 전송 완료 전에 동시에 발생하면 마지막 전송 시각만 갱신되어 dedupe 검사가 통과할 수 있었다.
- **영향**: 하나의 장애가 Discord 진단 채널에 중복 게시될 수 있었다.
- **해결 위치**: `lib/production-error-reporter.ts`에 fingerprint별 in-flight 집합을 추가하고 전송 완료·실패 모두 `finally`에서 해제한다.
- **검증**: 타입 검사와 프로덕션 빌드에서 모듈 컴파일 경로를 확인한다.

### 해외 분봉 거래량 raw 응답 console 출력 제거

- **원인**: `lib/kis-us-minute-turnover.ts`가 응답 원문 전체를 운영 console에 출력했다.
- **영향**: 응답 크기에 비례한 로그 폭주와 외부 API 응답의 불필요한 노출 가능성이 있었다.
- **해결 위치**: 상태 코드·원문 byte 수·파싱된 point 수만 요약 출력하도록 변경했다. API 반환 구조의 진단 원문은 기존 계약을 유지한다.
- **검증**: 타입 검사·문서 검사와 전체 빌드로 컴파일 경로를 확인한다.

### 예외 객체 직접 console 출력 제거

- **원인**: 일부 KIS·DART·관리자 라우트가 예외 객체 자체를 console에 전달했다.
- **영향**: 예외의 stack·cause·부가 속성이 로그에 함께 직렬화될 수 있었다.
- **해결 위치**: 제한된 길이의 `Error.message` 또는 고정된 `unknown error`만 기록하도록 정리했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 관리자 KIS 수동 테스트 라우트 입력·예외 경계 보강

- **원인**: 해외 가격 상세·체결 추세 관리자 테스트가 긴/비정상 티커를 그대로 외부 API에 전달하고, 호출 예외를 라우트 밖으로 전파할 수 있었다.
- **영향**: 외부 API 오류가 기본 500으로 처리되거나, 잘못된 입력이 불필요한 외부 호출을 유발할 수 있었다.
- **해결 위치**: 두 라우트에 티커 길이·문자 검증, 예외 표준화 응답(502), 토큰 부재 503 응답을 추가했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 관리자 DB 상태 API 인증 결과 누락 보정

- **원인**: `database-status` 라우트가 `requireAdminSession()`의 반환값을 확인하지 않고 DB 상태 조회를 계속했다.
- **영향**: 관리자 세션이 없는 요청도 DB 메타데이터 조회 로직에 도달할 수 있었다.
- **해결 위치**: 인증 실패 시 즉시 401을 반환하고, DB 장애는 내부 메시지를 숨긴 503으로 표준화했다.
- **검증**: 타입 검사와 문서 검사로 라우트 컴파일·문서 일관성을 확인한다.

### 관리자 캐시·종목 universe 디버그 API 인증 결과 누락 보정

- **원인**: `daily-candle-cache-debug`와 `instrument-universe-debug`도 관리자 인증 함수의 반환값을 확인하지 않았다.
- **영향**: 비인가 요청이 캐시·종목 universe 메타데이터 조회까지 진행할 가능성이 있었다.
- **해결 위치**: 인증 실패 즉시 401을 반환하고, 조회 장애는 제한된 서버 로그와 표준 503 응답으로 처리했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 관리자 universe import API 인증 결과 누락 보정

- **원인**: universe import 라우트가 관리자 인증 함수의 반환값을 확인하지 않았다.
- **영향**: 비인가 요청이 import 관련 DB 처리 경로에 도달할 가능성이 있었다.
- **해결 위치**: 인증 실패 시 즉시 `401 UNAUTHORIZED`를 반환하도록 수정했다.
- **검증**: 인증 호출 패턴 전수 검색과 타입·문서 검사를 통과했다.

### 관리자 DB 상태 항목별 raw 오류 메시지 제거

- **원인**: 개별 테이블 상태 조회 실패 시 예외 메시지를 `tables[].error`로 그대로 반환했다.
- **영향**: SQL/스키마 내부 정보가 관리자 API 응답에 노출되고 오류 형식이 테이블마다 달라질 수 있었다.
- **해결 위치**: 서버 로그에는 500자 이내 메시지만 남기고 응답은 `TABLE_STATUS_UNAVAILABLE`로 표준화했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### BB HTML export 및 골든크로스 cache debug 예외 경계 보강

- **원인**: HTML export와 cache debug 라우트의 병렬 DB/스캐너 호출이 예외 발생 시 기본 500으로 전파될 수 있었다.
- **영향**: 다운로드·진단 기능이 일관되지 않은 오류 응답으로 종료될 수 있었다.
- **해결 위치**: 서버 로그에는 제한된 메시지만 기록하고, export는 `BB_EXPORT_UNAVAILABLE`, debug는 `DAILY_GOLDEN_CROSS_CACHE_UNAVAILABLE` 503으로 표준화했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 공개 관심종목·DART 및 관리자 import 오류 응답 표준화

- **원인**: 일부 장애 경로가 500 또는 내부 오류 문구를 사용해 API별 오류 의미가 달랐다.
- **영향**: 클라이언트가 재시도 가능 장애와 입력 오류를 구분하기 어렵고, 관리자 import 응답에 내부 메시지가 노출될 수 있었다.
- **해결 위치**: 관심종목·DART 상세/계약·관리자 universe import의 외부 오류를 각각 503/502와 고정 오류 코드로 표준화했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### SEC Discord 관리자 테스트 raw 예외 응답 제거

- **원인**: Discord 전송 중 예외가 발생하면 예외 메시지를 응답에 그대로 반환했다.
- **영향**: webhook·네트워크 내부 정보가 관리자 API 응답에 노출될 수 있었다.
- **해결 위치**: 서버 로그에는 제한된 메시지만 기록하고 응답은 `SEC_DISCORD_SEND_FAILED` 502로 표준화했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 관리자 universe import 파일명 경로 이탈 방지

- **원인**: multipart 업로드의 파일명을 임시 디렉터리 경로에 직접 결합하고 모든 수신 파일을 저장했다.
- **영향**: 비정상 파일명이 임시 디렉터리 밖을 가리킬 가능성이 있었다.
- **해결 위치**: basename 검증 후 필수 universe master 파일명만 임시 디렉터리에 저장하도록 제한했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### DART 이력 조회 와일드카드 입력

- 원인: 회사명 입력을 `ILIKE`에 그대로 전달해 `%`·`_`가 검색 패턴으로 해석될 수 있었다.
- 영향: 의도하지 않은 광범위 조회와 DB 부하가 발생할 수 있었다.
- 수정 위치: `app/api/dart/history/route.ts`.
- 조치: 와일드카드를 escape하고 `ESCAPE` 절을 적용해 입력을 리터럴 회사명으로 처리한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 해외 뉴스 거래소 입력 검증

- 원인: 해외 뉴스 API의 `exchange` 파라미터에 지원 여부 검증이 없었다.
- 영향: 잘못된 거래소 코드가 외부 조회 계층까지 전달될 수 있었다.
- 수정 위치: `app/api/stock/us/news/route.ts`, `app/api/stock/us/news/route.test.ts`.
- 조치: `NAS`, `NYS`, `AMS`만 허용하고 나머지는 `400`으로 차단한다.
- 검증: 관련 테스트 3개, `npm run typecheck`, `npm run docs:check` 통과.

### 해외 뉴스 티커 입력 검증

- 원인: 해외 뉴스 API가 비어 있지 않은 모든 티커 문자열을 외부 조회로 전달했다.
- 영향: 비정상적으로 긴 문자열이나 허용되지 않은 문자가 외부 계층까지 전달될 수 있었다.
- 수정 위치: `app/api/stock/us/news/route.ts`.
- 조치: 티커를 대문자 정규화하고 영숫자·`. / _ -`만 허용하며 최대 32자로 제한한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### DART 순위·이력 API 오류 및 입력 크기

- 원인: 순위 API가 내부 예외를 일반화하지 않았고, 이력 API의 회사명 입력 길이를 제한하지 않았다.
- 영향: 장애 정보가 일관되지 않게 노출되고 과도한 조회 입력이 처리될 수 있었다.
- 수정 위치: `app/api/dart/ranking/route.ts`, `app/api/dart/history/route.ts`.
- 조치: 회사명을 200자로 제한하고 장애 응답을 `503`으로 표준화한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 다중시간대 BB 반등 스캐너 오류·limit 입력

- 원인: 보호된 반등 스캐너가 예외 원문을 반환하고 `limit`을 제한하지 않았다.
- 영향: 내부 정보가 노출될 수 있고 과도한 스캔 범위가 요청될 수 있었다.
- 수정 위치: `app/api/scan/multi-timeframe-bb-rebound/route.ts`.
- 조치: `limit`을 1~100으로 정규화하고, 장애를 `503 MULTI_TIMEFRAME_BB_REBOUND_UNAVAILABLE`으로 변환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 다중시간대 BB 스캐너 오류 상세 노출

- 원인: 보호된 스캐너 라우트가 예외 원문을 응답에 포함했다.
- 영향: 외부 API·DB 내부 정보가 노출될 수 있었다.
- 수정 위치: `app/api/scan/multi-timeframe-bb-pullback/route.ts`.
- 조치: 서버 로그에만 원인을 기록하고 `503 MULTI_TIMEFRAME_BB_SCAN_UNAVAILABLE`을 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 공개 US OBV·ADL 스캐너 오류 상세 노출

- 원인: 스캐너 예외의 원문 메시지를 공개 API 응답에 포함했다.
- 영향: 외부 API·DB 내부 정보가 노출될 수 있었다.
- 수정 위치: `app/api/scan/us-daily-sideways-obv-adl/route.ts`.
- 조치: 서버 로그에만 원인을 기록하고 `503 US_OBV_ADL_SCAN_UNAVAILABLE`을 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 푸시 API 오류 상세 노출

- 원인: 푸시 상태 조회·테스트 발송 API가 예외 메시지를 응답에 그대로 포함했다.
- 영향: DB 또는 환경 설정의 내부 정보가 공개될 수 있었다.
- 수정 위치: `app/api/push/subscribe/route.ts`, `app/api/push/test/route.ts`.
- 조치: 원인은 서버 로그에만 기록하고 사용자 응답은 일반화된 `503`으로 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 공개 DART·SEC 피드 오류 상세 노출

- 원인: 피드 동기화 예외의 `message`를 공개 API 응답에 그대로 반환했다.
- 영향: 외부 API·DB 내부 정보가 사용자에게 노출될 수 있었다.
- 수정 위치: `app/api/dart/route.ts`, `app/api/sec/route.ts`.
- 조치: 서버 로그에만 진단 정보를 기록하고, 클라이언트에는 일반화된 `503` 응답을 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 차트 API 오류 상세 노출 및 입력 크기

- 원인: 예외 메시지를 그대로 응답하고 `code`·`company` 길이를 제한하지 않았다.
- 영향: 내부 구현 정보가 사용자에게 노출될 수 있고 과도한 입력이 처리 경로에 유입될 수 있었다.
- 수정 위치: `app/api/stock/chart/route.ts`.
- 조치: 코드·회사명 길이를 제한하고 서버 로그만 원인 메시지를 기록하며 클라이언트에는 일반화된 오류를 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 해외 지표·상승종목 API 외부 장애

- 원인: DMI·MACD·상승종목 라우트가 외부 API 또는 저장소 예외를 직접 전파할 수 있었다.
- 영향: 장애 시 표준 JSON 대신 프레임워크 기본 오류 응답이 반환될 수 있었다.
- 수정 위치: `app/api/stock/us/dmi/route.ts`, `app/api/stock/us/macd/route.ts`, `app/api/stock/us/top-rising/route.ts`.
- 조치: 실패를 도메인별 `503` 응답으로 변환하고 내부 오류 상세를 노출하지 않는다.
- 검증: `npm run typecheck`, `npm run docs:check`, `npm run build` 통과.

### 해외 AMS 스카우트 API 외부 장애

- 원인: AMS 스카우트 외부 호출 예외가 라우트 경계 밖으로 전파될 수 있었다.
- 영향: 일시적인 외부 장애 시 기본 오류 응답이 반환될 수 있었다.
- 수정 위치: `app/api/stock/us/ams-scout/route.ts`.
- 조치: 예외를 `503 US_AMS_SCOUT_UNAVAILABLE`로 변환하고 캐시를 금지한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 자동화 설정 API DB 장애

- 원인: 자동화 주기 설정 조회의 DB 예외 경계가 없었다.
- 영향: 장애 시 Next.js 기본 오류 응답이 반환될 수 있었다.
- 수정 위치: `app/api/automation-settings/route.ts`.
- 조치: DB 조회 실패를 `503 AUTOMATION_SETTINGS_UNAVAILABLE` JSON 응답으로 변환하고 캐시를 금지한다.
- 검증: `app/api/automation-settings/route.test.ts` 2개, `npm run typecheck`, `npm run docs:check` 통과.

### 관심종목 API 입력 검증

- 원인: 잘못된 JSON·배열·비문자 코드가 예외 경로로 흘러가거나 과도하게 긴 코드가 저장 로직까지 전달될 수 있었다.
- 영향: 클라이언트가 일관되지 않은 `500` 응답을 받을 수 있고, 불필요한 입력이 DB 계층까지 도달할 수 있었다.
- 수정 위치: `app/api/watchlist/route.ts`.
- 조치: JSON 객체와 문자열 코드만 허용하고, 시장 코드 및 32자 길이를 검증한다. 잘못된 입력은 `400 INVALID_ITEM`으로 반환한다.
- 검증: `app/api/watchlist/route.test.ts` 4개, `npm run typecheck`, `git diff --check` 통과.

### 클라이언트 오류 보고 payload 및 Discord 재시도

- 원인: 브라우저 오류 보고 API가 요청 형식과 payload 크기를 제한하지 않았고, Discord 전송 전에 중복 억제 상태를 기록했다.
- 영향: 비정상·과대 요청이 처리될 수 있으며, Discord가 일시적으로 실패하면 같은 오류가 60초 동안 재전송되지 않았다.
- 수정 위치: `app/api/client-errors/route.ts`, `lib/production-error-reporter.ts`.
- 조치: JSON Content-Type·64KB 본문·메시지·경로 길이를 검증하고, Discord 전송 성공 시에만 중복 억제 상태를 기록한다. 보고 실패는 원 요청을 실패시키지 않는다.
- 검증: `app/api/client-errors/route.test.ts` 3개, `npm run typecheck`, `npm run docs:check` 통과.

### 문의 API DB 장애 응답

- 원인: 문의 목록 조회와 작성 핸들러가 DB 예외를 프레임워크 기본 오류 응답으로 남길 수 있었다.
- 영향: 클라이언트가 JSON 대신 HTML 오류 응답을 받아 후속 파싱 오류가 발생할 수 있었다.
- 수정 위치: `app/api/inquiries/route.ts`.
- 조치: 목록 조회는 `503 INQUIRIES_UNAVAILABLE`, 작성은 `503 INQUIRY_CREATE_FAILED` JSON으로 변환한다.
- 검증: `app/api/inquiries/route.test.ts` 2개, `npm run typecheck`, `npm run docs:check` 통과.

### React 오류 경계의 서버 모듈 번들 유입

- 원인: `app/error.tsx`에서 서버 전용 오류 보고 모듈을 직접 import해 `pg`의 `fs`·`net`·`dns` 의존성이 브라우저 번들에 포함됐다.
- 영향: Next.js 프로덕션 빌드가 `Module not found` 오류로 실패했다.
- 수정 위치: `app/error.tsx`.
- 조치: 오류 경계는 서버 모듈 대신 `/api/client-errors`를 호출하도록 분리했다. React 렌더링 오류는 복구 버튼으로 재시도할 수 있다.
- 검증: `npm run typecheck`, `npm run build` 통과.

### 문의 상세·상호작용 API 예외 경계

- 원인: 상세 ID 검증과 DB 예외 변환 없이 문의·댓글·좋아요·조회수 API가 DB를 호출했다.
- 영향: 잘못된 URL이나 DB 장애가 프레임워크 기본 오류 응답 또는 처리되지 않은 예외로 노출될 수 있었다.
- 수정 위치: `app/api/inquiries/[id]/route.ts`, `app/api/inquiries/[id]/comments/route.ts`, `app/api/inquiries/[id]/likes/route.ts`, `app/api/inquiries/[id]/views/route.ts`.
- 조치: ID를 사전 검증하고 DB 장애를 도메인별 `503` JSON 응답으로 변환한다. 기존 상세 조회의 `404` 계약은 유지했다.
- 검증: 관련 API 테스트 6개, `npm run typecheck`, `npm run docs:check` 통과.

### 스캐너 query 파라미터

- 원인: `limit`, `hours`에 `NaN`, 소수, 음수, 과대값이 들어와 내부 조회 함수까지 전달될 수 있었다.
- 영향: 비정상 조회 범위와 DB 쿼리 오류 가능성이 있었다.
- 수정 위치: `app/api/scan/multi-timeframe-recommendations/route.ts`.
- 조치: 정수 변환·최소/최대 범위 검증과 기본값을 적용한다.
- 검증: 관련 스캐너 입력 테스트, `npm run typecheck` 통과.

### 해외 MFI 스캐너 입력값

- 원인: 공개·관리자 MFI API가 `period`와 `threshold`의 비정상 숫자 입력을 내부 스캐너에 그대로 전달할 수 있었다.
- 영향: `NaN` 또는 비정상 기간으로 캔들 조회와 지표 계산이 실패할 가능성이 있었다.
- 수정 위치: `app/api/stock/us/mfi-oversold/route.ts`, `app/api/admin/us-mfi-test/route.ts`.
- 조치: 기간을 2~200 정수, 임계값을 0~100 범위로 보정하고 공개 API DB 장애를 `503` JSON으로 변환한다.
- 검증: MFI 테스트 2개, `npm run typecheck` 통과.

### 루트 레이아웃 오류 복구

- 원인: 루트 레이아웃에서 예외가 발생하면 일반 세그먼트 오류 경계가 렌더링되지 않을 수 있었다.
- 영향: 사용자가 복구 버튼 없이 기본 오류 화면에 머물 가능성이 있었다.
- 수정 위치: `app/global-error.tsx`.
- 조치: 전역 오류 화면과 다시 시도 버튼을 제공하고, 오류를 `/api/client-errors`로 보고한다.
- 검증: `npm run typecheck`, `npm run build` 통과.

## KIS API 오류

### `EGW00103` / 유효하지 않은 AppKey

- 확인: `KIS_APPKEY`와 `KIS_APPSECRET`의 존재 여부, 앞뒤 공백, 실행 프로세스에 실제 주입된 값의 길이를 마스킹 상태로 확인한다.
- 주의: `scripts/dev-server.mjs`가 KIS 환경변수를 삭제하면 유효한 상위 환경변수 대신 오래된 `.env.local` 값이 사용될 수 있다.
- 해결: 실행 환경변수 삭제 로직을 제거하고, 삼성전자 등 단일 종목의 동일 수집 경로를 먼저 재시험한다. 성공 후 전체 캐시 갱신을 시작한다.
- 금지: `EGW00103`만 보고 DB 토큰을 삭제하거나 임의로 새 토큰을 반복 발급하지 않는다.

### HTTP 401 / `EGW00123` 인증 만료

- 해결: `buildKisAuthorization(DB_TOKEN)`으로 Authorization을 구성했는지 확인한다.
- 인증 실패가 명시되면 요청에 사용한 거부 토큰을 `refreshAccessToken(rejectedToken)`에 전달한다. 갱신은 프로세스 Promise와 PostgreSQL advisory lock으로 단일화하고, lock 안에서 DB 토큰을 다시 읽어 다른 worker가 이미 교체했으면 그 토큰을 재사용한다. DB 토큰 삭제는 저장된 토큰이 실제 거부 토큰과 일치할 때만 lock 안에서 조건부 수행한다.
- KIS 토큰 발급이 실패하면 60초 동안 재발급을 보류해 병렬 요청이 KIS의 분당 발급 제한을 연속 위반하지 않게 한다. 일시 HTTP/네트워크 오류만으로는 토큰을 무효화하지 않는다.
- 일반 AUTH 문자열이나 일시적 HTTP 오류만으로 유효한 공유 토큰을 삭제하지 않는다.

### HTTP 500 또는 일시적 네트워크 오류

- 확인: `httpStatus`, `rt_cd`, `msg_cd`, `msg1`, endpoint, `tr_id`, request ID를 기록한다.
- 해결: 공통 재시도 정책을 사용하고, 실패 캔들은 retry queue에 기록한다.
- 전체 작업은 부분 실패를 허용하되, 저장된 캔들만 후속 지표 캐시에 반영한다.

### 빈 `output2` 또는 캔들 부족

- 원인 후보: 종목 코드·시장 코드 불일치, 거래정지, 장외 시간, API 응답 범위 부족.
- 해결: 코드와 시장을 확인하고, 응답의 날짜·캔들 수를 기록한다. Mock 데이터를 운영 결과로 반환하지 않는다.

## 국내 일봉 캐시 갱신 오류

### `outside_schedule` 또는 `disabled`

- cron 라우트의 운영 시간·활성화·간격 설정 결과다.
- KR daily cache의 cron 응답 및 SKIPPED summary에는 `schedule` snapshot과 KST 평가시각이 포함된다. 5분 dedup은 같은 reason 및 같은 schedule 설정에만 적용하며 평가시각은 비교에서 제외한다. 설정이 바뀌면 dedup window 안에서도 새 이력을 기록한다.
- 사용자가 수동 갱신을 요청한 경우 스케줄을 우회하는 인증된 수동 실행 경로를 사용한다.
- 예약 cron이 실행 이력/cooldown 조회를 실패로 끝내면 각 route는 worker 실행 전 503으로 종료해야 한다. KR/US daily-cache 및 Bollinger/Golden Cross, US daily indicators/open-cache/breakout/분봉 scanners, US OBV divergence, SEC small-cap share facts는 `stage: interval-gate`와 route별 `*_INTERVAL_CHECK_UNAVAILABLE` 오류를 반환한다. KR/US Golden Cross의 running lookup 실패는 `stage: running-gate`로 종료한다. Instrument Fundamentals의 backoff skip 조회 실패는 `stage: backoff-gate`, `INSTRUMENT_FUNDAMENTALS_BACKOFF_CHECK_UNAVAILABLE`을 반환한다. 이력 DB 장애를 “이력 없음”으로 취급하면 sequential worker 실행이나 재시도가 cooldown을 우회할 수 있으므로, 조회를 복구한 뒤 다음 cron cycle에서 재시도한다. 관리자 KR 수동 실행은 별도 API 경로이며 해당 예약 gate를 거치지 않는다. SEC Company Facts는 조회 예외를 route 상위 catch에서 503/500으로 전파하며 계속 fail-closed해야 한다.

### KR cron 호출이 KST 시간창 후반에 도달함

- 원인: OCI 공통 cron은 endpoint를 순차 실행한다. KR daily cache가 시장 RSS 이후 여러 SEC/DART enrichment 작업 뒤에 있으면 앞선 호출 지연이 국내 schedule window를 소모할 수 있다.
- 해결: `scripts/oci-cron.sh`에서 우선 SEC Facts, Discord retry, market RSS 및 US breaking-news forwarder를 보존한 뒤 KR daily cache를 실행하고, 나머지 DART/SEC enrichment 및 미국 full-universe cache보다 앞에 둔다. `scripts/check-oci-cron.mjs`가 이 순서를 검사한다.
- 재발 감지: `stockman-cron.service` journal의 앞선 endpoint duration과 KR call start를 대조하고, API 응답의 `schedule.evaluatedAtKst`/`outside_schedule`을 확인한다.

### 전체 갱신이 지나치게 오래 걸림

- 원인: 국내 유니버스 전체에 종목별 KIS 요청을 수행하기 때문이다.
- 해결: 동시성은 KIS 제한을 넘지 않도록 유지하고, 진행률·최근 코드·성공·실패·예상 잔여 시간을 확인한다.
- 중단 시 이미 저장된 성공 캔들은 보존하며, 실패 항목은 retry queue에서 재처리한다.

## DB 오류

### 재시도 큐의 현재 비대상 종목이 계속 PENDING으로 남음

- **원인**: retry consumer는 실행 시점의 공식 종목 master에서 현재 대상인 종목만 claim한다. 비활성·보통주 아님·공식 위험 플래그 또는 master 누락 종목은 `PENDING`으로 남을 수 있다. DB retention도 진행 중 항목 유실 방지를 위해 `PENDING` 행은 기간 만료로 삭제하지 않는다.
- **영향**: 처리할 수 없는 오래된 키가 pending count에 계속 포함될 수 있다. 자동 삭제나 재활성화는 사용자 확인 없이 수행하지 않는다.
- **진단**: 관리자 일봉 캐시 진단 API의 `retries.pendingEligibility`에서 분류·타임프레임별 수, 0회 시도 수, 가장 이른 다음 시도 시각과 가장 오래된 생성 시각을 확인한다. 시각은 UTC 원본과 KST 필드를 함께 제공한다. `US_METADATA_ELIGIBLE_NAME_CHECK`는 별도의 공식명 JS 필터를 반영하지 않은 그룹이다.
- **재발 감지/후속**: 분류별 count와 생성 경과를 정기 점검한다. 정책이 확정되면 별도 변경으로 PENDING 보존/종료 기준을 정하고, 보존 기간에 맞는 지표·감사 로그를 추가한다.

### 재시도 timeframe 간 claim 편중

- **원인/영향**: 여러 D/W/M lane을 선택해도 단일 `ORDER BY next_attempt_at LIMIT 500`은 due 행이 계속 많은 한 timeframe이 claim 상한을 점유해 다른 timeframe의 retry 처리를 지연시킬 수 있다.
- **해결**: `lib/kr-daily-cache-job.ts`는 claim할 retry timeframe만 `dueRetryTimeframes`로 전달한다. `lib/candle-cache-retry.ts`는 실제 due lane별 quota를 전체 상한 안에서 나누고, 각 lane에서 가장 오래된 due 행을 `FOR UPDATE SKIP LOCKED`로 claim한다. stale cache만 존재하고 retry row가 없는 timeframe은 retry quota를 차지하지 않는다. 나머지 quota는 lane 입력 순서에 따라 한 건씩 배분하며 최대 claim 수는 호출 상한을 넘지 않는다.
- **재발 감지/남은 위험**: KR job 결과의 timeframe별 retry 처리량과 `retries.pendingEligibility`의 age를 함께 확인한다. 각 실행의 lane 처리량은 공평해지지만 worker 실행량·시장 API 속도 차이로 backlog 해소 시각까지 같아지는 것은 아니다. 로컬 read-only EXPLAIN에서는 약 19,962 estimated rows/6 MB 테이블에 lane별 sequential scan이 계획됐다. 이 크기에서 별도 인덱스를 추가하지 않았으며 retry table이 커지거나 query latency가 증가하면 `EXPLAIN (ANALYZE, BUFFERS)`로 due index와 timeframe index 후보를 비교한다.

### `DATABASE_URL 환경변수가 설정되지 않았습니다.`

- 직접 실행 시 `.env.local`이 자동 로드되지 않을 수 있다.
- 개발 서버는 Next 환경 로딩을 사용하고, 직접 실행은 프로젝트 표준 환경 로딩 방식을 사용한다.
- DB 연결 호스트·포트·데이터베이스명은 로그에 비밀값 없이 확인한다.

### 테이블 또는 컬럼 없음

- 애플리케이션에서 임의 DDL을 실행하지 않는다.
- `npm run docs:check`와 스키마 상태를 확인하고, Flyway migration을 프로젝트 배포 절차에 따라 적용한다.

## 예약 작업 오류

### HTTP 메서드 불일치

- 예약 함수와 Next API가 같은 메서드와 공용 application service를 사용하는지 확인한다.
- 예약 계층에 비즈니스 로직을 복제하지 않는다.

### 중복 실행

- automation run 상태와 interval을 확인한다.
- 서버리스 인스턴스 간 중복 방지는 DB 잠금·실행 기록을 사용한다.

## 프론트엔드 오류

- 내부 KIS 디버그 로그 API도 관리자 세션을 요구하며, 커서 값은 음수가 아닌 안전한 정수만 허용한다.
- 관리자 디버그 조회와 종목명 조회의 DB 오류는 예외·SQL을 노출하지 않고 기능별 503 오류 코드로 반환한다. 종목명 조회 코드는 최대 100개로 제한한다.
- 관리자 분봉 일괄 갱신의 작업량·동시성은 유한한 정수 범위로 정규화하고, 수집 실패는 `KR_MINUTE_REFRESH_FAILED`로 반환한다.
- 관리자 DB 조회는 `limit`을 1~100의 유한 정수로 정규화하고, 스키마·컬럼·행 조회 오류는 `DATABASE_READ_FAILED`로 반환한다.
- 웹 푸시 구독 API는 endpoint·암호화 키 길이와 boolean 설정값을 검증하고, malformed payload 및 저장 실패를 구분된 오류 코드로 반환한다.
- 공개 RSS·종목 뉴스 조회는 비정상 `limit`을 제한하고 DB 장애 시 내부 예외 대신 503 기능 오류 코드를 반환한다.
- 공개 해외 뉴스·추천 API는 내부 예외 메시지를 외부에 노출하지 않고 기능별 503 오류 코드로 반환한다.
- 공지 작성은 검증 오류만 400으로 반환하고 DB·예상 외 오류는 `NOTICE_CREATE_FAILED` 503으로 분리한다.
- 관리자 헬스체크 실패는 내부 예외 메시지 대신 `HEALTH_CHECK_UNAVAILABLE`로 반환하고 요청 ID만 추적 정보로 유지한다.
- Discord 서명 검증을 통과한 malformed JSON·payload도 파싱 예외로 500이 되지 않도록 `400 INVALID_JSON/INVALID_PAYLOAD`로 종료한다.
- Telegram webhook은 `TELEGRAM_WEBHOOK_SECRET`이 설정된 경우 `x-telegram-bot-api-secret-token`을 검증하고, malformed payload·처리 실패를 구조화된 오류로 반환한다.
- 공개 헬스 API는 상세 DB·환경·자동화 정보를 반환하지 않고 상태·시각·지연·요청 ID만 노출한다. 헬스 계산 자체가 예외가 되면 503 degraded로 응답한다.
- 세션 상태 조회는 DB 장애 시 인증되지 않은 것으로 조용히 오판하지 않고 `503 AUTH_STATUS_UNAVAILABLE`을 반환한다.
- 공개 스크리너와 관리자 기술 분석 API는 비정상 limit을 제한하고 내부 예외 대신 기능별 503 오류 코드를 반환한다.

### `startsWith` 또는 필드 접근 런타임 크래시

- 외부 API 필드는 `undefined`·`null`·예상 외 타입을 허용한다.
- 옵셔널 체이닝과 안전한 기본값을 사용하고, 누락 데이터를 Mock으로 바꾸지 않는다.

### 모바일 화면 우측 잘림

- 고정 폭·nowrap·grid 최소 폭을 확인한다.
- 좁은 화면에서는 flex 가로 스크롤 또는 행 분할 grid를 사용하고 페이지 전체 가로 overflow를 방지한다.

## 문서·인코딩

- 한글이 깨진 파일은 부분 패치보다 UTF-8 기준 전체 교체를 우선 검토한다.
- 오류 해결 후 원인·영향·수정 파일·검증 명령을 이 문서 또는 `AGENTS.md` 개선 로그에 기록한다.

### 관리자·cron 예외 메시지 외부 노출 방지

- **원인**: 일부 수동 테스트 및 캐시 갱신 라우트가 예외의 원문을 JSON 응답에 포함했다.
- **영향**: 내부 DB/API 오류 정보가 관리자 화면 또는 호출자에게 노출될 수 있었다.
- **해결**: 서버 로그에는 길이 제한된 메시지만 남기고, 응답에는 고정 오류 코드(`DAILY_MA9_TEST_FAILED`, `KR_DAILY_CACHE_FAILED`, `US_DAILY_CACHE_FAILED`)만 반환하도록 수정했다.
- **검증**: `npm run typecheck`, `npm run docs:check`, `npm test -- --run`.

같은 정책을 해외 일봉 breakout·indicator·open-cache 및 Bollinger·breaking-news·minute 지표 cron에도 적용했다.

### 국내 캔들 캐시가 0건으로 남는 유니버스 분리 오류

- **원인**: `V85__split_kr_instrument_universe.sql`이 `managed_issue_code <> 'Y'`를 사용해 NULL인 정상 보통주를 `kr_special_instrument_universe`로 분류했다. 이후 공통 유니버스에 없는 종목의 캔들이 정리되어 국내 캐시 작업의 대상 수가 0건이 됐다.
- **영향**: 전체 `kr_instrument_universe` 뷰의 종목 수는 정상처럼 보였지만, 실제 캐시 작업이 참조하는 `kr_common_stock_universe`가 비어 국내 일·주·월봉이 재수집되지 않았다.
- **해결**: `V118__repair_kr_common_stock_split.sql`에서 `COALESCE(managed_issue_code, '') <> 'Y'`를 적용해 정상 보통주를 공통 유니버스로 복구하고, 중복·재실행을 안전하게 처리한다.
- **재발 방지**: 분리·분류 SQL의 NULL 비교를 반드시 `COALESCE` 또는 명시적 NULL 정책으로 작성하고, 배포 후 `kr_common_stock_universe` 대상 수·국내 캔들 수·캐시 작업의 `instrumentCount`와 `dailySuccessCount`를 함께 검증한다.
- **검증**: `V118` 로컬 트랜잭션 롤백 드라이런, `npm run typecheck`, `npm run docs:check`, `npm run build`.

### 국내 캔들 복구 중 주·월봉 요청으로 인한 일봉 복구 지연

- **원인**: 콜드 상태에서 종목별 일·주·월봉을 한 작업에서 순차 호출해, 일봉이 저장되기 전에 주·월봉 요청이 누적됐다.
- **영향**: 국내 스캐너가 사용하는 일봉 캐시가 장시간 0건으로 남고, cron의 중복 실행 방지로 후속 작업도 건너뛰었다.
- **해결**: `lib/kr-daily-cache-job.ts`에서 일봉이 stale이면 일봉만 우선 처리하고, 주·월봉은 다음 실행으로 이연한다.
- **검증**: `npm test -- --run` (141개 파일·464개 테스트), `npm run typecheck`, `npm run build`.

푸시 구독 저장·설정 변경도 입력 오류(400)와 저장소 장애(503)를 분리하고 서버 로그를 추가했다.

## 검증 명령

### 의존성 감사

- 2026-10-16 기준 `npm audit --omit=dev`는 0 vulnerabilities다. PostCSS를 8.5.23 이상으로 override하고 fast-xml-parser를 5.x로 전환해 운영 의존성 이슈를 해결했다. RSS 파서 관련 기존 단위 테스트를 통과시킨 뒤 전체 배포 검증으로 호환성을 확인한다.
- 전체 `npm audit`에는 Drizzle Kit 개발 의존성 체인의 esbuild 중간 위험 4건이 남아 있다. npm이 제시한 자동 수정은 Drizzle Kit 0.18.1로의 하향 메이저 변경이어서 적용하지 않았다. Drizzle Kit 버전 체인을 별도 호환성 테스트와 함께 후속 검토한다.
- Next 15 자체를 16으로 강제 업그레이드하지 않고, 영향받는 PostCSS 하위 의존성만 패치 버전으로 교체한다. 이를 변경할 때는 lockfile 재현 설치, 전체 테스트, standalone 실행 스모크를 필수로 한다.

```powershell
npm run typecheck
npm run docs:check
npm test -- --run
```
# 2026-09-18 운영 메인 페이지의 구버전 청크 참조

- **증상**: 운영 홈 HTML은 200이지만 `/_next/static/chunks/app/page-*.js`가 404여서 브라우저에 `ChunkLoadError`가 발생했다.
- **근본 원인**: standalone 패키지에 정적 자산이 누락된 상태에서, 홈 페이지가 장기 프리렌더 캐시(`x-nextjs-cache: HIT`, `s-maxage`)로 이전 HTML을 계속 제공해 현재 릴리스에 없는 해시 청크를 참조했다.
- **해결**: 배포 패키지에 `.next/static`을 포함하고, 홈 페이지를 `dynamic = "force-dynamic"`으로 전환해 릴리스 이후 현재 청크를 참조하는 HTML을 생성한다. 클라이언트에는 기존 청크 오류 1회 자동 복구를 유지한다.
- **추가 보강**: 운영 standalone 런타임의 정적 경로 차이에 대비해 동일한 해시 자산을 `public/_next/static`에도 패키징하고, 이전 릴리스 자산 보존도 두 경로에 적용한다.
- **검증기 보강**: 배포 전 standalone smoke에서도 정적 대상 디렉터리를 먼저 제거한 뒤 두 경로에 복사해 `static/static` 중첩을 방지한다. 이 단계에서 실제 webpack 청크 HTTP 응답까지 확인한다.
- **재발 방지**: 배포 검증에서 standalone 정적 청크 존재와 런타임 smoke를 확인하고, 운영 검증에서 홈 HTML의 참조 청크를 직접 GET해 200 및 JavaScript 응답을 확인한다.
- **남은 위험**: 외부 CDN이 HTML을 별도 캐시하는 경우 CDN purge 또는 `no-store` 정책이 필요하다.

# 2026-09-18 해외 상승률 TOP100 CPOP 누락

- **증상**: 운영 차트용 TOP100 메모리 목록에 NAS 종목 `CPOP`이 누락됐다.
- **근본 원인**: KIS가 `VOL_RANG=5` 조건에서 HTTP 200/정상 코드와 함께 6개 행만 반환했지만, 수집기는 행이 0개일 때만 `VOL_RANG=0` 재시도했다. 따라서 정상 응답으로 오인한 부분 페이지가 TOP100 전체를 대체했다.
- **확인**: 동일 운영 API에서 `VOL_RANG=0`으로 조회하면 100개 행과 rank 4의 CPOP이 반환됐다. DB 공식 보통주 마스터(`NAS/CPOP`, `COMMON_STOCK`, enabled/daily_active)와 시총 스냅샷도 정상이다.
- **해결**: 거래소 TOP100 수집은 부분 응답(100개 미만)도 불완전 응답으로 판단해 `VOL_RANG=0` 전체 페이지를 비교하고 더 많은 행을 선택한다. 공개 원본 순위 API의 기본값도 전체 페이지 요청으로 고정했다.
- **재발 방지**: 부분 응답 선택 로직에 회귀 테스트를 추가하고, 운영 디버깅 시 거래소별 `sourceCount`, `selectedCount`, `productExcluded`를 함께 확인한다.
- **남은 위험**: KIS가 전체 페이지 자체를 제공하지 않는 장외/장애 상황에서는 해당 시점의 실시간 TOP100을 보장할 수 없으며, 마지막 정상 스냅샷 정책을 별도로 유지한다.
- **집중 탐색 불변조건**: focus pool은 원본 TOP100이 아니라 상품·활성·시총 필터를 모두 통과한 최종 보통주 후보에서만 구성한다. 이 조건은 응답 `criteria.focusPool.eligibleUniverse`로 노출하고 설계 문서와 회귀 검증에서 함께 관리한다.
- **공식 보통주 교차검증**: 라이브 KIS 순위 행은 `us_common_stock_universe`의 `enabled`, `daily_active`, `COMMON_STOCK`, ETF·워런트·파생·DR·레버리지·인버스 제외 조건을 모두 통과해야만 탐지된다. 마스터 조회 실패는 빈 후보로 처리한다.
- **교차검증 성능**: 공식 판정은 프로세스 메모리 1시간 TTL 캐시를 사용하고 캐시 미스만 배치 조회한다. 캐시 상태와 적중·미스 수는 `criteria.officialEligibility.cacheHits/cacheMisses`로 관측한다.
- **운영 탐지 상태 해석**: `/api/kis/intraday-mvp`에서 `worker.status=STOPPED`, `status.reason=DISABLED`이면 계산 오류가 아니라 관리자 기능 설정으로 탐지가 중지된 상태다. 이 경우 TOP100 후보 수는 표시하되 거래대금 비율·알림 결과를 정상 동작으로 간주하지 않는다.
- **시총 대비 거래대금 무자료 상태**: `qualifiedCandidateCount=0`이고 후보의 거래대금·시총 비율이 0이면 최근 1분 샘플이 아직 누적되지 않았거나 워커가 비활성인 상태다. 운영 검증은 `worker.lastTickAt`, `trackedCandidateCount`, `requiredSamples`, `minTurnoverToMarketCapPercent`를 함께 확인한다.
# 2026-10-15 운영 health API 지연 조사

- **증상**: 운영 `/api/health`가 반복해서 클라이언트 제한 시간(20초) 안에 응답하지 않았지만 `/charts`는 HTTP 200이었다.
- **근본 원인**: 공개 health 라우트가 상세 운영 스냅샷 전체를 기다렸다. 스키마 점검과 전체 자동화 이력 조회 외에, 캐시 자동화 최근 실행·마지막 성공 조회 및 세 기능 설정 조회가 이어지는 단계로 실행되어 독립 DB 왕복 지연이 합산될 수 있었다.
- **해결**: 캐시 자동화 최근 실행·마지막 성공 조회와 세 기능 설정 조회를 하나의 `Promise.all` 경계에서 시작한다. 응답 필드와 상세 스키마 판정은 유지한다.
- **재발 자동 감지**: `lib/health-check-query-concurrency.test.ts`는 캐시 자동화 두 DB 조회와 기능 설정 조회가 모두 동시에 시작되는지 검증한다.
- **검증**: 회귀 테스트, 전체 배포 검증, 로컬 `/api/health` 실행 및 배포 후 운영 응답시간을 확인한다. HTTP 503 `degraded`는 빠른 응답과 별개의 readiness 문제로 분류한다.
- **남은 위험**: 이 수정은 상세 스냅샷 내부의 독립 DB 왕복 합산만 제거한다. DB 연결 대기 또는 스키마 확인 자체가 느린 문제까지 해결한다고 보장하지 않는다.

## 2026-10-15 standalone 배포 smoke 프로세스 정리

- **증상**: 배포 검증의 `/charts` smoke 요청이 제한 시간 초과로 실패했지만, 동일 standalone 서버를 직접 기동한 뒤에는 `/charts`가 HTTP 200으로 응답했다.
- **근본 원인**: Windows 검증 경로가 standalone Node 서버를 `cmd.exe` 하위 프로세스로 실행해 timeout cleanup 대상이 실제 서버 프로세스가 아닌 짧게 유지되는 command wrapper가 될 수 있었다. 실패 뒤에도 검증 서버 프로세스가 남는 것을 확인했다.
- **해결**: `scripts/verify-deploy.mjs`에서 standalone 서버를 `process.execPath`로 직접 기동해 실제 Node 프로세스를 정리 대상으로 지정한다. 제한된 로컬 Windows 환경에서 첫 요청이 5초를 넘는 경우가 확인되어 smoke 개별 요청 제한을 기본 15초로 늘리고 환경변수로 조정 가능하게 한다. endpoint와 응답 조건은 유지한다.
- **재발 자동 감지**: 전체 `deploy:verify`가 standalone `/charts` 및 API smoke를 계속 수행한다. 검증 후 `server.js` 프로세스 잔존 여부도 확인한다.
- **검증**: 독립 기동 시 `/charts` HTTP 200을 확인했다. 직접 실행·프로세스 종료 처리와 15초 요청 제한은 전체 배포 검증으로 확인한다.
- **남은 위험**: Windows 프로세스 정리는 운영체제 프로세스 상태에 의존한다. CI smoke가 실패하면 해당 build의 standalone server 프로세스가 남았는지 우선 확인한다.

## 2026-10-15 운영 health 지연 후속 조사

- **관측**: 배포 workflow는 성공했고 `/charts`는 HTTP 200이었다. 운영 `/api/health`는 40초, 관리자 `/api/debug/health`는 45초 제한 안에 응답하지 않았다. 단순 관리자 DB 목록 조회는 HTTP 200/약 0.8초, `automation_runs` 1행 조회는 HTTP 200/약 1초였다.
- **환경 구분**: 로컬 `.env.local`의 DB는 localhost:5433이며 각 health 관련 SQL은 약 80–110ms였다. 이는 운영 DB와 다른 연결이므로 운영 SQL 성능의 근거로 사용하지 않는다.
- **초기 판단**: 운영 DB 연결 자체가 완전히 불가능한 상태는 아니지만, 기존 진단 API는 전체 스냅샷을 기다려 어느 SQL 단계가 지연되는지 분리할 수 없었다. 후속 단계별 진단 결과와 원인 확정은 아래 automation_runs 조사 항목을 기준으로 한다.
- **개선**: 관리자 전용 `/api/admin/health-diagnostics`를 추가한다. 동일 health 관련 SELECT들을 단계별로 실행하고 각 단계의 소요 시간·행 수·오류 코드와 DB pool 점유량만 반환한다. SQL 상세·행 데이터·환경변수 값은 노출하지 않는다. 단일 연결의 read-only transaction과 쿼리별 1.5초 `statement_timeout`을 사용해 느린 쿼리 하나가 전체 진단을 무기한 막지 않게 한다.
- **2026-11-11 현재 응답 계약**: schema probe는 실패 원인 분류 코드와 함께 whitelist된 relation/column 이름을 최대 50개까지 반환하며, 성공한 Flyway probe는 version 문자열을 반환한다. Automation history의 `error_message`와 `summary`, 임의 SQL, 환경변수·credential 값은 응답하지 않는다. `detailsTruncated`는 whitelist 행이 50개를 넘을 때 표시한다.
- **필수 relation 유형 판정**: `OPERATIONAL_SCHEMA_TABLES`는 `BASE TABLE`, `OPERATIONAL_SCHEMA_VIEWS`는 `VIEW`로 검사한다. `kr_instrument_universe`와 `us_instrument_universe`는 V85/V89 이후 legacy read path를 위한 compatibility view다. 핵심 schema health, 관리자 diagnostics, market-debug inventory와 migration audit은 명시한 relation 유형을 확인한다. retired relation 검사는 retired 이름의 객체가 어떤 relation type으로든 남아 있으면 계속 실패한다. [PostgreSQL 16 information_schema.tables 공식 문서](https://www.postgresql.org/docs/16/infoschema-tables.html).
- **필수 컬럼 판정**: `information_schema.columns`도 table columns와 view columns를 모두 포함한다. 필수 컬럼 목록은 같은 schema의 필수 `BASE TABLE`에 있는 컬럼만 인정한다. 핵심 schema health와 관리자 diagnostics 모두 relation type을 확인한다. [PostgreSQL 16 information_schema.columns 공식 문서](https://www.postgresql.org/docs/16/infoschema-columns.html).
- **timeout/savepoint 확인**: route는 read-only transaction 시작 직후 `set_config('statement_timeout', '1500ms', true)`를 실행하고 그 다음 각 probe의 savepoint를 만든다. `is_local=true` 설정은 transaction 종료까지 적용되며, 그보다 나중에 만든 savepoint로 rollback해도 설정은 취소되지 않는다. PostgreSQL은 `statement_timeout`을 각 statement 실행 한도로 정의한다. [PostgreSQL 16 set_config 공식 문서](https://www.postgresql.org/docs/16/functions-admin.html), [SET/savepoint 공식 문서](https://www.postgresql.org/docs/16/sql-set.html), [statement_timeout 공식 문서](https://www.postgresql.org/docs/16/runtime-config-client.html).
- **재발 감지**: API 테스트가 비관리자 요청의 DB 접근 차단, read-only transaction, 쿼리 타임아웃 오류 코드의 안전한 노출, 후속 probe 진행을 확인한다. 운영에서는 `probes[].name`, `durationMs`, `errorCode`, `pool.waiting`으로 병목 구간을 판별한다.
- **남은 위험**: pool 연결 획득 자체가 밀리면 진단은 3초 후 pool 상태와 함께 실패할 수 있다. 본 API 결과가 확인되기 전까지 운영 health 지연의 근본 원인은 미확정으로 유지한다.

## 2026-10-15 automation_runs health 조회 병목 완화

- **운영 근거**: `/api/admin/health-diagnostics`에서 연결·테이블·컬럼·Flyway probe는 1–184ms, 캐시 설정 조회는 21ms였으나 세 개의 `DISTINCT ON (module_key) ... ORDER BY module_key, started_at DESC` 이력 조회는 모두 쿼리 타임아웃 코드 `57014`로 끝났다. 따라서 DB 연결이나 전체 스냅샷의 모든 쿼리가 느린 것이 아니라, 자동화 이력의 모듈별 최신 행 조회 형태가 병목임을 확인했다.
- **개선**: 전체 이력을 정렬·중복 제거하지 않고 등록된 모듈 키 각각에 대해 `LEFT JOIN LATERAL` 내부에서 `ORDER BY started_at DESC LIMIT 1`을 조회한다. 캐시 최신 실행과 마지막 성공도 같은 방식으로 바꾸고, 세 이력 조회 및 설정 로딩을 함께 시작한다. 기존 `(module_key, started_at DESC)` 인덱스를 활용하는 point lookup 형태다.
- **재발 자동 감지**: 회귀 테스트는 health snapshot의 세 이력 SQL이 모두 `LATERAL`과 `LIMIT 1`을 쓰고 이전 `DISTINCT ON` 방식으로 돌아가지 않는지 확인한다. 배포 후 `/api/admin/health-diagnostics`에서 세 probe가 각각 1.5초 안에 끝나는지 확인한다.
- **후속 운영 검증**: commit `29183d6e` / Deploy OCI run `38700748463` 성공 후 전체 automation probe는 51ms로 개선됐으나, cache 최신 실행과 마지막 성공 probe는 다시 1.5초 제한에 걸렸다. 기존 복합 인덱스가 있어도 status 필터를 만족하는 행을 찾기 위해 오래된 인덱스 엔트리를 계속 훑을 수 있음을 확인했다.
- **추가 개선 및 운영 확인**: V149의 `status <> 'SKIPPED'` 및 `status = 'SUCCESS'` 조건별 부분 인덱스를 적용했다. 마지막 성공 조회 인덱스에는 `finished_at`을 INCLUDE했다. 운영 Flyway version 149를 확인했다.
- **재발 자동 감지**: 회귀 테스트는 health snapshot의 세 이력 SQL이 모두 `LATERAL`과 `LIMIT 1`을 쓰고 이전 `DISTINCT ON` 방식으로 돌아가지 않는지 확인한다. 배포 후 `/api/admin/health-diagnostics`에서 세 probe를 각각 확인하고, cache 두 probe의 timeout 재발 여부를 기록한다.
- **운영 성과**: 적용 전 cache 최신 조회 1503ms/57014 및 마지막 성공 1510ms/57014에서 적용 후 각각 22ms와 11ms로 개선됐다. 전체 진단은 355ms, 공개 `/api/health`는 HTTP 200/status `ok`였다.
- **남은 위험과 감지**: 데이터량·상태분포가 변하면 실행시간도 달라질 수 있다. 관리자 health 진단에서 cache probe별 시간과 57014를 지속 확인하고, 정기 관측 경보 개선을 후속 과제로 남긴다.

## 2026-10-15 health 이력 부분 실패 표시

- **문제**: automation 최신 이력·cache 최신 이력·cache 성공 이력을 단일 `Promise.all`과 바깥 `try/catch`로 처리해, 쿼리 하나만 실패해도 이미 성공한 다른 결과를 버렸다. 페이지는 이 상황을 `실행 이력 없음`으로 렌더해 실제 이력이 없는 상황과 DB 조회 실패를 구분하지 못했다.
- **해결**: 각 history query를 독립적으로 안전 실행하고 가용성을 별도 반환한다. 성공한 결과는 보존하고 실패 데이터는 `historyAvailable` 상태로 표시해 UI에서 `이력 조회 실패`로 구분한다.
- **재발 방지**: 실패 주입 회귀 테스트가 automation query 실패와 마지막 성공 query 실패를 각각 재현하고 나머지 결과 보존을 확인한다. `/api/health` 공개 응답 계약은 history 가용성에 좌우되지 않게 유지한다.
- **남은 위험**: DB 장애가 아닌 일시 query 지연도 이력 조회 실패로 표현되지만 SQL/DB 오류 상세는 공개 화면에 노출하지 않는다. 운영 진단 API와 함께 원인을 판별한다.

## 2026-11-04 accession·event 다대일 검증 불일치

- **증상**: 공시 한 건이 주주총회와 후속 이사회 재량 실행기한처럼 서로 다른 이벤트를 근거로 제공하면, 신규 배치 검증기가 `TARGETED_SECTION_REVIEW` 공시 수와 event record 수를 비교해 올바른 batch를 실패 처리했다.
- **근본 원인**: accession과 event의 관계를 일대일로 가정했다. 실제 스키마는 하나의 accession에서 여러 eventId를 허용한다.
- **영향 범위**: `validate-us-smallcap-event-data.mjs`의 신규 배치 사전 검사. 저장 데이터나 운영 서버에는 영향이 없다.
- **해결 위치**: 검토 accession과 이벤트 source accession을 `ticker|accession` 고유 집합으로 각각 만들고 집합 동등성을 비교한다. accession–event 다대일 연결은 ledger의 각 filing eventIds와 coverageSummary가 추가 검증한다.
- **재발 자동 감지**: batch validator는 검토 accession 집합의 일치, filing/eventId 역방향 연결, 제출 수, 검토 상태 수를 검사한다. 같은 공시에서 복수 이벤트를 생성하는 케이스를 배치 regression input으로 보존하고 전체 `npm run deploy:verify`에서 재검증한다.
- **검증 결과**: 2026-11-04-b07 validator가 100 issuer, 4,182 filing, 14 event, 14 accession-event relation, 13 targeted filing으로 통과했다. 전체 docs/deploy 게이트는 진행 중.
- **남은 위험 및 다음 개선**: 현재 fixture는 하나의 accession이 복수 이벤트를 제공하는 사례 하나다. future fixture에서 여러 이벤트 유형을 확장하고도 고유 source ID가 정확히 연결되는지 계속 검사한다.

- **남은 위험 및 다음 개선**: preflight는 V168이 만드는 인덱스명에 한정해 무효 객체를 제거한다. V168에 포함되지 않은 실패 이력이 있으면 자동 repair 없이 실패하므로 별도 수동 조사 대상이다.
- 재발 감지는 OCI activation의 GitHub timeout, Flyway migration 단계 로그 및 배포 후 schema version 확인으로 수행한다.

## 2026-11-10 RSS 기사 7일 자동 보존정책 누락

- **증상**: `/api/cron/db-retention`은 raw RSS fetch snapshot을 180일 뒤 정리하지만 `market_rss_articles` 기사와 `market_rss_bullish_articles` projection은 만료시키지 않았다.
- **근본 원인**: 기존 운영정책은 RSS snapshot만 180일 보존 대상으로 두고, 기사 행은 장기 보존하며 article-level DELETE를 정적 cron gate가 금지했다.
- **영향 범위**: RSS 기사와 bullish RSS projection. `market_rss_fetch_snapshots`의 180일, SEC/DART 공시, 사용자 생성 데이터 정책은 변경하지 않는다. `published_at`이 없으면 `created_at`으로 7일을 계산한다.
- **해결 위치**: 공통 retention job에 두 RSS 테이블의 7일 batch-delete를 추가한다. bullish row는 expired source article 연결도 조건에 포함해 parent보다 먼저 정리하며 FK cascade는 동시성 안전망으로 유지한다. V169는 published-date 및 null-date 만료 경로 인덱스를 concurrent로 추가한다.
- **재발 자동 감지**: `scripts/check-oci-cron.mjs`가 두 table의 정확한 7일 predicate, bullish parent 관계 조건, V169 partial indexes와 migration 배포 포함 여부를 검사한다.
- **검증 및 영향 확인**: 사용자가 지정한 로컬 PostgreSQL 5432에 직접 연결해 데이터베이스명 `stockman`, PostgreSQL 16.15, Flyway 161을 확인했다. `market_rss_articles`에는 만료 published row 552개와 null-date fallback row 0개가 있으며, local schema에는 `market_rss_bullish_articles`가 없다. 쿼리는 read-only로 수행했고 RSS 행은 삭제하지 않았다. 따라서 로컬에서 전체 retention endpoint를 실행하지 않았다.
- **DB 위치 정정**: 운영 DB는 Supabase가 아니라 OCI 운영 서버 내부 PostgreSQL이다. `localhost:5432`는 사용자의 노트북에서 Docker로 실행 중인 별도 개발 DB이므로 운영 상태 확인에 사용하지 않는다. OCI deployment workflow는 SSH로 서버에 접속한 뒤 `/etc/stockman/stockman.env`의 `DATABASE_URL`로 운영 DB를 조회한다.
- **최신 운영 blocker**: 2026-11-11 Deploy OCI #1296은 V168 preflight에서 중단됐다. 사용자 승인 후 OCI recovery workflow가 PID 4178222의 `idle in transaction` 상태와 snapshot 보유를 재확인하고 `pg_terminate_backend` 성공을 받았다. 다른 snapshot holder는 그대로다. 새 Deploy OCI preflight 이후에만 V168/V169 적용 여부를 확정할 수 있다.
- **남은 위험/다음 단계**: 승인된 PID 4178222에는 terminate signal이 전달됐지만 다른 active/snapshot holder가 계속 보일 수 있다. Deploy OCI 재실행에서 V168 preflight가 남은 blocker를 fail-closed하는지 확인한다. V168/V169 적용과 5분 cron의 RSS `deleted`/`failed` 결과가 확인되기 전까지 자동 삭제 활성화로 판정하지 않는다. 추가 세션 종료는 별도 승인 없이 하지 않는다.
## OCI standalone 정적 자산 경로 불일치

- **원인**: CI가 Next `distDir`를 `.next-deploy-verify`로 지정했지만 verifier, package archive, activation 보존 경로는 기본 `.next/`를 가정했다. 이 경우 서버 instrumentation 또는 JS chunk가 누락될 수 있다.
- **수정**: `scripts/verify-deploy.mjs`, `.github/workflows/deploy-oci.yml`, `deploy/oci/stockman-activate`에서 설정된 distDir을 일치시키고 CI archive 검사에서 instrumentation 및 hashed chunk를 요구한다.
- **재발 자동 감지**: `npm run deploy:verify` standalone runtime smoke와 `Deploy OCI` package assertions.
- **검증**: `deploy:verify` 통과, 실제 standalone `/charts`와 JavaScript chunk HTTP 200.
- **남은 위험**: OCI activation health check에서 실제 운영 결과를 확인한다.

## RSS XML 입력 또는 화면 polling 실패

- **원인 후보**: 잘못된 XML, 비정상적인 DART channel/item, 과도한 응답 크기, 잘못된 기사 응답 형식, 겹치는 polling 요청.
- **대응**: `lib/rss.ts`에서 XML/channel/date/URL을 검증하고 중복 receipt를 제거한다. fetch는 시간·크기·content-type 제한을 적용한다. `components/use-feed-data.ts`는 이전 요청을 취소하고 payload shape를 검사한다.
- **재발 감지**: `lib/rss.test.ts`와 전체 Vitest suite에서 malformed/oversized/duplicate 입력과 polling 응답을 검증한다.
- **운영 주의**: 실패한 RSS 항목은 정상 기사로 취급하지 않는다.

## V168 concurrent index migration snapshot timeout

- **증상/근거**: Deploy OCI run `43829487560`, attempt 9 passed the V168 snapshot preflight but Flyway remained at `Migrating schema "public" to version "168 - bounded non daily data retention"` until the 2,400-second migration timeout ended with exit 137. During earlier attempts, application and timer-created active client snapshots repeatedly reappeared.
- **근본 원인**: `CREATE INDEX CONCURRENTLY` must wait for transactions holding older snapshots, while the app, cron, RSS, and fundamentals services continued opening DB work throughout migration. After quiescing them, an `idle in transaction` client still retained an old snapshot.
- **수정**: `deploy/oci/stockman-activate` stops the app and scheduler timers/services before migration, then runs preflight and Flyway. It does not terminate database sessions; any remaining snapshot holder causes preflight to fail closed. If activation fails before successful completion, the error trap restarts the old app and timers. Snapshot termination is handled only by a separately scoped, explicitly approved recovery operation.
- **재발 자동 감지**: `scripts/check-oci-cron.mjs` asserts service quiescence, absence of automatic `pg_terminate_backend`, and rollback on failure. Deploy logs show stop, V168 preflight and Flyway stages. PostgreSQL's official `CREATE INDEX` docs describe the wait for old snapshots: https://www.postgresql.org/docs/current/sql-createindex.html.
- **운영 재확인**: Deploy OCI run `44001959780` stopped the app and timers; preflight then found a separate `idle in transaction` PID `241173` holding a snapshot for 3,848 seconds. Activation failed closed and logs confirmed the app and timers were restarted. Deploy run `44004038768` later terminated PID `241173` and `244461` using a broad predicate. That automatic cleanup behavior is removed after confirming it exceeded the separately approved PID scope.
- **검증/남은 위험**: V168/V169, release activation and runtime checks remain pending until a fresh OCI deployment succeeds. Service downtime may last for the duration of V168/V169; if preflight still finds external client snapshots, failure rollback must restore app and timer services. Do not claim ㄷㅊㅇ5/ㄷㅊㅇ6 complete until the public universe APIs and both snapshot commands are verified.

## V168 인덱스 생성 대상 테이블이 이전 마이그레이션에서 삭제됨

- **증상/근거**: Deploy OCI run `44004038768`은 snapshot preflight를 통과하고 V168 실행을 시작했지만, `us_trade_intensity_ticks`가 없다는 PostgreSQL 오류로 중단됐다. 로그상 V168의 첫 concurrent index 생성은 완료된 뒤 다음 테이블에서 실패했다.
- **근본 원인**: V70이 구형 `us_trade_intensity_ticks` 테이블을 `DROP TABLE ... CASCADE`로 제거했지만 V168이 해당 테이블의 retention 인덱스를 다시 만들려고 했다. 마이그레이션 오류는 장기 snapshot 문제와 별개의 정적 대상 오류였다.
- **수정**: V168에서 삭제된 테이블 인덱스 정의를 제거하고, `scripts/check-oci-cron.mjs`가 V168 직전까지 순서대로 적용되는 마이그레이션에서 삭제된 테이블을 대상으로 하는 인덱스를 추가하면 실패하도록 보강했다.
- **재발 자동 감지**: `npm run deploy:verify`의 OCI cron/migration 구조 검사가 이전 CREATE/DROP TABLE 순서를 반영해 V168 인덱스 대상을 검사한다.
- **영향 범위**: 실패한 V168 시도는 Flyway 실패 상태 및 일부 앞선 concurrent index 생성 결과를 남길 수 있다. 배포 preflight는 V168 failed history와 V168 인덱스만 점검/복구하며, 재배포 전 현재 DB 상태를 다시 확인한다.
- **검증/남은 위험**: 코드 검증 후 OCI 재배포가 필요하다. V168/V169, release 전환, 시간별 retention timer 및 RSS 삭제 결과는 성공 로그와 운영 상태 확인 전까지 미완료로 둔다.

## OCI 배포의 자동 DB 세션 종료 범위

- **증상/근거**: Deploy OCI run `44004038768`의 activation 단계가 명시된 PID 승인 목록 대신 30초 이상 snapshot을 가진 client 세션 전체를 동적으로 종료했다. 로그에는 PID `241173`과 `244461`이 종료됐다고 기록됐다.
- **근본 원인**: 운영 배포 스크립트가 범위형 환경변수 하나를 승인으로 간주하고, 조건을 만족하는 모든 세션을 자동으로 찾고 종료했다. 이는 단일 PID·상태·최소 60분 조건으로 받은 별도 승인의 범위를 넘어설 수 있다.
- **수정**: 배포의 자동 세션 일괄 종료를 제거한다. 현재 후속 승인으로 지정된 정확 PID `246213`, `246722`, `246903`, `247294`, `247463`, `247509`, `248010`, `248077`, `248691`, `248857`, `249223`, `249386`, `249548`, `249564`, `249815`, `249816`, `250094`, `250277`, `250401`, `250475`, `250476`, `250751`, `253038`만 scope 환경변수의 명시적 allowlist에 넣고, 실행 직전 `client backend`·snapshot 보유·30초 초과를 다시 확인한다. PID가 사라졌거나 조건을 충족하지 않으면 해당 PID는 건너뛴다. 서비스 중지 이후에도 다른 오래된 snapshot이 있으면 V168 preflight를 30초 간격 최대 20회 재시도하고, 계속 남으면 fail-closed한다. allowlist 밖 세션 및 parallel worker는 건드리지 않는다.
- **재발 자동 감지**: `scripts/check-oci-cron.mjs`에서 artifact의 전용 runner 포함과 activation의 정확한 PID allowlist를 검사한다. runner는 allowlist 비어 있음/잘못된 PID에서 실패하고 SQL에서도 승인 PID 전체를 재검증한다. 진단에는 application name·DB user·client address를 포함하고 raw query text는 기록하지 않는다.
- **남은 위험/다음 단계**: concurrent index가 다른 오래된 snapshot을 기다리면 배포는 실패하고 기존 서비스/timer 복구 경로가 작동한다. 그 세션은 별도 관측 및 승인 범위 없이 종료하지 않는다.

## 운영 공개 일봉 API가 대량 스냅샷 수집 중 502를 반환함

- **증상/근거**: OCI deploy run `44024922650` 성공 뒤 `/health-check`, NAS universe, 1종목 및 20종목 일봉 조회가 HTTP 200이었다. 전체 US 스냅샷 순차 수집 중 NAS 162배치 완료 후 NYS 50/94배치 시점부터 HTTP 502가 반복됐다. 이어 health와 universe도 nginx 502를 반환했다. 스냅샷 JSON은 완성되지 않아 기존 결과를 덮지 않았다. deploy activation 재실행 후 health는 HTTP 200으로 복구됐다.
- **근본 원인**: 확인되지 않았다. 요청 누적과 장애 발생 시각은 연관됐지만, 운영 애플리케이션/DB 진단 로그 없이 서버 과부하나 특정 조회 코드 경로를 원인으로 확정하지 않는다.
- **대응**: 502 또는 health 실패가 발생하면 전체 수집을 즉시 중지한다. 추가 universe/candle 요청을 하지 말고 health만 확인한다. 배포가 필요하면 승인된 OCI deploy workflow를 실행하고 성공 후 health를 재검증한다. 부분 수집 결과는 최종 JSON으로 승격하지 않는다.
- **재발 자동 감지**: 전체 스냅샷 전 health, universe, 소량 일봉 요청을 확인하며 수집 중 실패도 기록한다. 후속 개선은 서버측 502 로그/DB 진단, checkpoint resume, 호출 부하 제한을 갖춘 수집 방식을 추가하고 운영에서 소량 검증한 후 전체 실행하는 것이다.
- **해결 확인**: V170 snapshot blocker PID `261867` 종료 및 배포 성공 후, 20종목 단위와 최대 4회 재시도를 적용한 전체 수집이 재현 가능한 502 없이 완료됐다. `/api/health`는 수집 후 HTTP 200이었다. `daily-candles-us.json`은 5,268종목·627,078 candles·90 missing, `daily-candles-kr.json`은 2,346종목·270,629 candles·0 missing이며 두 파일 모두 latest date `20261116`. JSON summary, instrument counts, 중복 코드, candle count 및 날짜/갱신시각을 검증했다.
- **남은 위험**: 최초 대량 수집 때의 nginx 502 원인은 서버측 로그/DB 진단 자료가 없어 독립적으로 확정되지 않았다. 20종목 배치와 재시도 설정은 현재 성공했으며 향후 수집도 health·universe·소량 조회 사전 확인을 유지한다.

## V170 SEC materializer 인덱스 생성 timeout

- **증상/근거**: OCI Deploy run `44039396985`는 V168 preflight를 통과하고 Flyway가 schema V169에서 V170 `sec materializer recent index`를 시작했다. 2,400초 뒤 `timeout`에 의해 프로세스가 종료(exit 137)됐다. activation error trap은 구 release app과 scheduler services를 복구했고 이후 `/health-check`는 HTTP 200이었다.
- **관측된 blocker**: 첫 preflight에서 client backend PID `260900`이 active, snapshot 보유, transaction age 929초로 확인됐고 parallel worker PID `260901`, `260902`가 붙어 있었다. 30초 뒤 재검사에서는 snapshot이 사라져 이 PID는 종료되지 않았다. 이후 정확히 무엇이 V170 index build를 40분간 지연했는지는 현재 workflow 로그만으로 확정할 수 없다.
- **복구 원인**: 기존 V168 전용 preflight는 Flyway 실패 이력을 V168만 복구 대상으로 허용했다. V170의 non-transactional concurrent index가 중단되면 failed history와 invalid index가 남을 수 있어 다음 배포도 거부되거나 `IF NOT EXISTS`가 invalid index를 잘못 건너뛸 위험이 있다.
- **수정**: OCI preflight는 V168 및 V170 migration 파일의 정확한 concurrent index 이름만 점검한다. V170 failed history를 허용 목록에 추가하고, 둘 중 migration이 실패해 남긴 invalid index만 snapshot holder 확인 후 `DROP INDEX CONCURRENTLY`로 제거한다. 출력에 `sec_submissions` 추정 행 수·테이블 크기·대상 인덱스 validity를 기록한다. 그 외 failed migration은 계속 fail-closed한다. PID `260900`은 다음 실행 시점에도 client backend, snapshot 보유, 30초 초과일 때만 종료 후보가 되도록 정확 PID allowlist에 추가했다.
- **재발 자동 감지**: `scripts/check-oci-cron.mjs`가 V168/V170 복구 범위, invalid index 정리, 승인 PID allowlist, preflight retry를 검사한다. Deploy 로그에서 V170 migration progress/timeout을 확인하고, health 200과 Flyway V170 성공이 모두 확인되기 전 완료로 처리하지 않는다.
- **남은 위험/다음 단계**: 테이블 크기나 동시 인덱스 대기 원인은 아직 확인되지 않았다. 수정 배포 후 preflight 진단 통계와 V170 migration 결과를 확인한다. V170에서 재차 timeout되면 같은 인덱스 생성만 더 오래 반복하지 말고 OCI `pg_stat_progress_create_index`와 active snapshot holder를 읽기 전용으로 진단한다.
- **후속 증거·정밀 조치**: run `44047418291`에서 V170 invalid index가 확인됐다. `sec_submissions`는 추정 61,549행·38,199,296 bytes였으며, preflight 시 client PID `261867`이 `idle in transaction`, `ClientRead`, snapshot 보유 상태로 4,112→4,143초 유지됐다. preflight는 허용 목록 밖 PID를 종료하지 않고 20회 재시도 후 중단했다. 정확 PID `261867`은 실행 직전 client backend·snapshot 보유·최소 30초를 재검증해 조건이 맞는 경우에만 종료되도록 승인 allowlist에 추가한다. 이후 invalid V170 index만 정리하고 Flyway 실패 이력을 repair한다.
- **해결 확인**: run `44050453172`에서 PID `261867`은 실행 직전 4,739초·snapshot 보유 조건으로 다시 확인되어 종료됐다. 이때 V170 index는 이미 valid/ready였고 Flyway 실패 이력도 없어, `IF NOT EXISTS`가 기존 인덱스를 확인하며 V170 및 release activation을 성공 완료했다. `/api/health`와 NAS universe가 HTTP 200이었다. 이 관측으로 V170 40분 timeout의 blocker는 오래된 snapshot PID `261867`로 확인됐다. 이후 동일 유형이 보이면 검증된 exact PID 범위와 실행 직전 조건 확인을 그대로 적용한다.
# V168 snapshot blocker와 장기 OBV 조회

- **증상/근거**: OCI read-only 진단 run `44020043575`에서 localhost `stockman` client backend가 1,235초 동안 active 상태로 snapshot을 유지하고 두 parallel worker를 보유했다. 당시 `application_name`은 비어 있고 OS client process mapping은 확인되지 않았다.
- **조사/원인 후보**: `lib/us-obv-divergence-scan.ts`는 공식 보통주 universe 전체의 최근 최대 160개 일봉을 한 쿼리로 가져온 뒤 애플리케이션에서 계산한다. `statement_timeout`과 `idle_in_transaction_session_timeout`이 없어 요청/프로세스 정체 시 오래된 snapshot이 concurrent index migration을 막을 수 있다. 현재 증거만으로 해당 PID가 이 경로라고 확정할 수는 없다.
- **수정**: OBV 스캔 transaction에 `application_name=stockman-us-obv-snapshot`, 15분 `statement_timeout`, 60초 `idle_in_transaction_session_timeout`을 설정한다. cron route의 상한은 1,200초로 설정해 DB 쿼리 중단 및 정리 시간보다 짧지 않게 한다. 일반 DB pool 전역에는 적용하지 않는다.
- **재발 자동 감지**: `lib/us-obv-divergence-snapshot.test.ts`에서 application name과 두 timeout 값을 검증한다. `npm run deploy:verify`가 build/runtime/browser/API smoke, 전체 테스트, typecheck, 문서 및 OCI cron gate를 실행한다. 운영 진단의 `pg_stat_activity.application_name`에서 향후 해당 세션을 구분한다.
- **검증/남은 위험**: focused tests 3/3 및 전체 `deploy:verify` 통과(313 files, 1,645 passed/3 skipped). 기존 세션의 client OS process는 알아내지 못했으므로 다른 장기 조회 경로 가능성은 남는다. 신규 timeout은 이후 시작 세션에 적용된다.
- **공식 근거**: PostgreSQL 공식 [`pg_stat_activity`](https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW), [`statement_timeout` 및 `idle_in_transaction_session_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-STATEMENT-TIMEOUT) 문서.
# SEC materializer 후보 조회가 오래된 snapshot 유지

- **증상/근거**: read-only 진단 run `44028486909`에서 672초 active client snapshot PID `256094`를 확인했다. SQL 원문 대신 상수/주석을 마스킹한 shape가 `lib/stockman-events.ts`의 `materializeStockmanSecEvents` 후보 SELECT와 일치했고, client 프로세스는 `stockman.service`의 `next-server`였다. 두 parallel worker도 같은 query age로 대기했다.
- **근본 원인**: full SEC materializer는 `acceptance_datetime` 정렬로 최대 500개 후보를 검색하지만 `sec_submissions.acceptance_datetime` 정렬 인덱스가 없었다. 따라서 제출 데이터와 공시 이벤트가 커지면 병렬 seq scan/sort가 장기화해 V168 concurrent index 작업의 snapshot 대기를 일으킬 수 있다.
- **수정**: V170에 형식이 유효한 acceptance timestamp만 포함하는 partial concurrent index를 추가한다. SEC 후보 SELECT는 별도 `BEGIN READ ONLY` transaction에서 실행하며 `application_name=stockman-sec-event-materializer`, `statement_timeout=300000ms`, `idle_in_transaction_session_timeout=60000ms`를 설정한다. 조회 결과를 받아 즉시 COMMIT하고 후속 materialization/write는 snapshot이 없는 상태로 별도 실행한다.
- **재발 자동 감지**: `lib/stockman-events-materializer.test.ts`는 쿼리 LIMIT/정렬 및 timeout/tag/client release를 확인한다. `scripts/check-oci-cron.mjs` 및 Deploy OCI tar assertion은 V170의 non-transactional concurrent index와 config 포함을 검사한다. 운영 진단은 SQL literal을 지운 query shape와 query id만 남긴다.
- **검증/남은 위험**: OCI 배포 전 full `npm run deploy:verify` 및 V170 concurrent index 적용 필요. 마이그레이션은 다른 오래된 snapshot이 남아 있으면 fail-closed할 수 있다. 열린 세션은 자동 종료하지 않는다.
- **공식 근거**: PostgreSQL 공식 [`CREATE INDEX` concurrent build](https://www.postgresql.org/docs/current/sql-createindex.html) 및 [`statement_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-STATEMENT-TIMEOUT) 문서.

## 2026-11-18 Flyway split preflight 증거 경계

- **목적/범위**: V85/V89 instrument-universe split migration 사전 점검이 관찰한 relation shape와 migration 적용 이력을 혼동하지 않도록 근거 경계를 기록한다.
- **확인 대상**: `lib/flyway-history-audit.ts`의 `auditUniverseSplitPreconditions`, `scripts/audit-flyway-history.ts`의 `splitMigrationPreflight` 결과, 이 문서의 V85/V89 compatibility view 설명.
- **판정**: `postMigrationShapePresent`는 현재 relation kind/presence가 migration 이후 모양과 같은지 관찰한다. `structuralPreconditionsPass`는 source table/view 형태에 대한 구조 조건만 판정한다. shape가 일치해도 history, row 내용, 필터 결과, 제약조건, 손실 위험은 증명되지 않는다. migration 이력·데이터 완전성·적용 여부를 별도 읽기 전용 증거로 확인해야 한다.
- **재발 자동 감지**: `scripts/check-docs.mjs`는 audit helper, CLI 결과 필드 및 한계 문구가 코드·운영 문서에 함께 남아 있는지 검사한다. `npm run audit:flyway-local` 결과는 연결된 데이터베이스의 실제 상태로만 해석한다.
- **커밋·푸시·배포**: 이 문서 갱신을 포함해 현재 작업의 배포는 미완료다.
## PostgreSQL Flyway concurrent index migration 대기

- **증상/근거**: Flyway migration 168의 `CREATE INDEX CONCURRENTLY` 진행 중 Flyway JDBC session이 `idle in transaction` 상태로 남고, index session이 해당 virtual transaction을 기다려 migration이 완료되지 않았다.
- **근본 원인**: Flyway PostgreSQL 기본 transactional advisory lock이 non-transactional concurrent index 실행과 대기 교착을 만들었다. Redgate 공식 설정은 이 경우 session-level lock을 위해 `flyway.postgresql.transactional.lock=false`를 지정하도록 안내한다.
- **수정**: OCI activation의 Flyway migrate 컨테이너에 `FLYWAY_POSTGRESQL_TRANSACTIONAL_LOCK=false` 환경변수를 전달한다. `scripts/check-oci-cron.mjs`가 이 설정의 잔존을 검사한다.
- **재발 자동 감지**: OCI cron/activation 회귀 테스트는 설정 누락 시 실패한다. 새 격리 PostgreSQL 16 DB에서 Flyway 13.3.0을 사용해 전체 177개 migration 적용과 `/api/health` readiness를 확인한다.
- **검증/남은 위험**: 기본 설정으로 migration 168에서 실제 wait chain을 재현했고, 설정 적용 후 새 검증 DB가 V177까지 완료됐다. 사용자 기존 volume은 migration하지 않았다. 로컬 기존 DB는 V161이며 read-only migration audit에서 일부 pending index target이 없어 바로 승격하지 않았으므로 이 DB의 스키마는 여전히 최신 애플리케이션 런타임 기준과 다르다.

## schema-health descending index order 오진

- **증상/근거**: 정상적으로 생성된 3개 `kis_rate_limit_events` 인덱스가 실제 PostgreSQL definition에 `DESC`를 포함했지만 schema-health query가 컬럼 이름만 비교해 모두 `wrong_columns`로 표시하고 health를 503으로 낮췄다.
- **근본 원인/수정**: `pg_get_indexdef(index, column, false)` 결과에 정렬 방향이 포함되지 않았다. 검사 query가 `pg_index.indoption`의 DESC bit를 반영해 내림차순 키를 비교하도록 변경했다.
- **재발 자동 감지**: `lib/schema-health.test.ts`에서 query의 descending order 비교 생성을 검증하며 operational schema integrity 검사에서 실제 인덱스 방향을 확인한다.
- **검증/남은 위험**: 변경 후 격리 DB에서 `schemaReady=true`, index issues 0개, `/api/health` HTTP 200을 확인했다. 사용 중인 기존 DB에서 인덱스 자체가 누락/잘못 생성된 경우에는 이 코드 변경만으로 해결되지 않는다.

### 2026-11-19 OCI 재발 추적

- **증상/근거**: OCI run `44400229361`에서 V178이 성공한 뒤 health는 세 인덱스를 `wrong_columns`로 계속 분류했다. run `44405986778`에서는 V179도 1.195초 만에 성공했지만 동일한 세 이슈가 유지되어 activation이 실패했다.
- **근본 원인**: 기존 오류 기록의 DESC 보정이 현재 `lib/schema-health.ts` 구현에 반영되어 있지 않았다. `pg_get_indexdef(index, column, false)`의 단일 키 결과만 비교해 실제 내림차순 속성을 놓쳤다.
- **수정**: 인덱스 키별 `pg_index_column_has_property(..., 'desc')`를 사용해 실제 내림차순 키에 `DESC`를 정규화해 붙인다. PostgreSQL 공식 문서는 이 속성이 전방 스캔에서 내림차순 정렬 여부를 나타낸다고 명시한다([System Information Functions and Operators](https://www.postgresql.org/docs/current/functions-info.html)). 회귀 테스트와 문서 정적 검사를 추가했다.
- **검증/남은 위험**: 배포 검증 및 OCI 재배포 후 `/api/health` 200과 스케줄 타이머 활성 상태를 확인해야 한다. V178/V179는 운영 DB의 인덱스 재생성에 성공했으나, 이번 수정 전에는 runtime 비교기가 정상 스키마를 오진하고 있었다.
- **커밋·푸시·배포**: 아직 미완료.

## 2026-11-18 — OCI clean-checkout 문서 검증 실패

- **증상**: 커밋 `6d8f8896`의 GitHub Actions `Deploy OCI` run `44289579797`은 배포 전 `npm run deploy:verify`의 `docs:check`에서 실패했다. 패키징·업로드·서버 활성화는 실행되지 않았다.
- **근본 원인**: `scripts/check-docs.mjs`가 JSON Schema 검증을 위해 `ajv`를 import하지만 `package-lock.json`에만 있고 `package.json`의 `devDependencies`에는 선언되지 않았다. 로컬 `node_modules`의 extraneous 설치가 이를 가려 GitHub의 clean `npm ci` 환경에서 module-not-found가 발생했다. 같은 예외 처리에서 schema validation 실패가 database inventory golden fixture 계약 실패로 함께 보고됐다.
- **영향 범위**: CI의 사전 검증만 실패했으며 OCI 서버 배포와 운영 DB migration은 시작되지 않았다.
- **수정**: `ajv`와 이미 lockfile 및 프로젝트 검사 명령에서 사용하는 `tsx`를 `devDependencies`에 선언해 clean install 입력을 package manifest와 일치시킨다. `npm ci` 후 `npm ls ajv tsx`와 전체 `deploy:verify`를 통과시킨다.
- **재발 자동 감지**: 배포 workflow의 clean `npm ci` 및 `npm run deploy:verify`를 유지한다. CI에서만 사라지는 optional/lock-only dependency가 없도록 스크립트가 직접 import하는 패키지는 manifest에 직접 선언한다.
- **남은 위험/다음 단계**: 새 커밋을 push해 Deploy OCI 재실행 후 workflow success와 운영 `/api/health` 응답을 확인한다. 이번 실패 run에서는 DB 상태나 서비스 버전이 바뀌지 않았다.

## 2026-11-18 — OCI clean-checkout 빌드의 Node instrumentation 모듈 누락

- **증상**: dependency manifest 수정 뒤 Deploy OCI run `44292807064`은 docs gate를 통과했지만 production build가 `instrumentation.ts`의 `./instrumentation-node` import를 해석하지 못해 실패했다. 패키징·업로드·서버 활성화는 실행되지 않았다.
- **근본 원인**: `instrumentation-node.ts`가 `instrumentation.ts`에서 정적으로 import되는 필수 lifecycle 모듈인데 Git 추적 대상이 아닌 로컬 untracked 파일이었다. 로컬 build는 해당 파일을 읽어 통과했지만 clean CI checkout에는 파일이 없었다.
- **영향 범위**: OCI 서버 배포, DB migration, 서비스 전환은 수행되지 않았다. 현재 프로덕션 버전은 유지됐다.
- **수정**: lifecycle 모듈을 tracked source로 추가한다. Node production runtime에서만 intraday detection worker를 시작하고 `INTRADAY_DETECTION_ENABLED=false`이면 시작하지 않는 기존 동작을 그대로 보존한다.
- **재발 자동 감지**: CI의 clean checkout production build가 import 누락을 차단한다. tracked source의 상대 import를 대상으로 누락/미추적 모듈 정적 점검도 실행했다. 확인 결과 필수 untracked import는 이 모듈 하나였다.
- **검증/남은 위험**: 변경 후 clean install 기반 전체 `npm run deploy:verify`를 다시 실행하고 다음 Deploy OCI run 및 운영 health를 확인한다. run `44292807064`의 실패는 build에서 중단됐고 운영에 반영된 변화는 없다.

## 2026-11-18 — OCI Flyway V171의 누락된 intraday 관측 테이블 전제

- **증상**: Deploy OCI run `44295118377`은 패키징과 업로드까지 성공했지만 Activate의 Flyway migrate가 V171에서 `relation "intraday_turnover_observations" does not exist`로 실패했다. 스크립트는 새 릴리스 활성화를 중단하고 앱·스케줄러 서비스를 복구했다.
- **근본 원인**: 테이블 생성은 V138에만 있었고 V171은 해당 테이블에 컬럼만 추가했다. Flyway는 기본 `outOfOrder=false`로 현재 DB 버전보다 낮은 미적용 migration을 실행하지 않는다. 따라서 운영 DB의 과거 baseline/이력 순서에서 V138 효과가 누락된 경우 V171만으로는 테이블을 보장하지 못한다.
- **영향 범위**: V171 migration 트랜잭션은 롤백됐고 새 애플리케이션 릴리스는 활성화되지 않았다. Flyway가 V171 전에 성공 적용한 migration이 있다면 그 이력은 유지될 수 있으므로, 운영 DB의 실제 버전은 다음 health/Flyway 확인으로 대조한다. V171 자체는 인덱스 생성과 nullable 컬럼 추가 외 데이터 갱신·삭제를 하지 않는다.
- **수정**: V171이 기존 테이블 정의와 인덱스를 `IF NOT EXISTS`로 보장한 다음 market-cap timestamp 컬럼을 추가하도록 forward repair로 보강한다. `scripts/check-docs.mjs`에 V171의 필수 runtime 컬럼 회귀 게이트를 추가한다.
- **재발 자동 감지**: 배포 전 `npm run docs:check`/`npm run deploy:verify`가 V171에서 테이블 생성과 schema 계약 컬럼이 빠지면 실패한다. 배포 후에는 `/api/health`의 operational schema 결과와 Flyway 버전을 확인한다.
- **검증/남은 위험**: run `44299058136`에서 수정된 V171/V172가 적용을 시작하고 Flyway가 V173까지 진행한 것을 확인했다. V171 최초 실패 run `44295118377`은 rollback으로 끝났다. 운영 Flyway 최신 버전과 서비스 readiness는 V173 timeout을 해결한 뒤 다시 확인한다.

## 2026-11-18 — OCI Flyway V173 RSS 인덱스 migration timeout

- **증상**: Deploy OCI run `44299058136`은 사전 검증·패키징·업로드까지 통과했다. Flyway는 운영 schema version 170에서 V171, V172를 시작한 뒤 V173 `market rss 72h retention indexes`의 `[non-transactional]` 실행에서 40분 timeout에 도달해 종료 코드 137로 중단됐다. 스크립트는 신규 release 활성화를 중단하고 이전 앱·예약 작업 서비스를 복구했다.
- **근본 원인**: V173은 RSS 두 테이블에 `CREATE INDEX CONCURRENTLY`를 순차 실행했다. 이 방식은 여러 테이블 스캔과 기존 transaction/snapshot 대기를 수행할 수 있다. OCI 배포는 이 migration 전에 애플리케이션·예약 작업을 중지하므로 일반 인덱스 빌드로 유지보수 창에서 완료할 수 있지만, migration이 운영 중 데이터베이스 상태와 인덱스 크기를 기록하지 않아 대기 원인을 확인할 단서도 부족했다. PostgreSQL 공식 문서는 concurrent build가 여러 scan과 기존 transaction 종료 대기를 수행하고 일반 build는 쓰기를 잠그지만 읽기는 허용한다고 설명한다.
- **영향 범위**: V171/V172는 Flyway 로그에서 V173보다 먼저 시작됐으며, V173 비트랜잭션 실행은 timeout으로 중단됐다. V173 인덱스가 일부만 valid 상태로 남았거나 Flyway 실패 이력이 남았을 수 있어 다음 실행 전 상태를 확인해야 한다. 새 애플리케이션 release는 활성화되지 않았으며 이전 서비스가 복구됐다.
- **수정**: V173/V176 RSS 인덱스를 OCI quiesced maintenance window 안에서 실행되는 트랜잭션 `CREATE INDEX IF NOT EXISTS`로 바꾸고 비트랜잭션 설정을 제거한다. OCI preflight가 해당 인덱스 상태·RSS 테이블 크기·Flyway 실패 버전을 마스킹 없이 민감정보를 출력하지 않고 기록하며, 허용 목록 V168/V170/V173/V176의 invalid index와 실패 이력만 안전하게 정리한다. 다른 migration 실패는 계속 fail-closed한다.
- **재발 자동 감지**: `scripts/check-oci-cron.mjs`와 `scripts/check-docs.mjs`가 V173/V176의 인덱스 수, 동시성 옵션 부재, transaction 설정 부재, 서비스 quiesce 순서 및 preflight repair 범위를 확인한다. OCI preflight 출력으로 다음 시도에서 대상 테이블 크기와 개별 인덱스 validity를 확인한다.
- **검증/남은 위험**: 수정 후보를 clean worktree에서 전체 `npm run deploy:verify`로 확인했다. 의존성 감사 0건, docs/API/migration 게이트, production build, standalone browser/API smoke, 1,645 tests passed / 3 skipped, typecheck가 통과했다. `npm run cron:check`도 통과했다. 운영 재배포 후 V173/V176 완료, Flyway 최신 버전, `/api/health` HTTP 200을 확인해야 한다. 일반 인덱스 build도 테이블이 매우 크면 migration timeout을 넘을 수 있으므로 이번 preflight의 RSS 테이블 크기·row 추정치와 실행 결과를 검토한다.

## 2026-11-19 — OCI Flyway preflight의 JDBC idle transaction 차단

- **증상/근거**: Deploy OCI run `44310441883`의 재시도에서도 PID `308675`가 `stockman` 사용자, `PostgreSQL JDBC Driver`, `127.0.0.1`, `idle in transaction`으로 보고됐다. 트랜잭션 나이는 약 4시간 41분까지 늘었고 20회 preflight 재시도 내내 유지돼 Flyway가 실행되지 않았다.
- **근본 원인**: 운영 로컬 PostgreSQL의 오래된 JDBC 트랜잭션이 snapshot을 붙든 상태로 남았다. 해당 PID는 당시 명시적 종료 목록에 없어 배포 전 정리가 이뤄지지 않았다.
- **조치**: PID `308675`를 명시적 목록에 추가하고 종료 도구가 `stockman`/loopback JDBC 연결, `idle in transaction`, snapshot 보유, 트랜잭션 나이 1시간 초과 조건을 모두 확인하도록 제한한다. 종료 직전에도 동일 조건을 재검증한다. PID 재사용 또는 상태 변경 시 종료하지 않고 기존 fail-closed 재시도를 유지한다.
- **재발 자동 감지**: 사전 점검은 PID·계정·application·주소·상태·트랜잭션 나이를 기록한다. `scripts/check-oci-cron.mjs`는 명시적 PID 목록과 최소 나이/세션 식별 조건을 검사한다.
- **검증/남은 위험**: 변경 후 `npm run deploy:verify`가 통과했다: dependency audit 0 vulnerabilities, production build, standalone browser/API smoke, 1,645 tests passed / 3 skipped, typecheck, docs/API/migration gates 및 OCI cron 검사. 재배포 로그에서 실제 종료 대상과 Flyway 적용 결과를 확인한다. 종료 시 열려 있던 트랜잭션은 rollback된다. Flyway 최신 버전과 운영 health 200을 확인하기 전까지 배포 완료로 간주하지 않는다.

## 2026-11-19 — OCI activation readiness helper 누락

- **증상/근거**: Deploy OCI run `44353409918`은 승인된 JDBC snapshot 세션 PID `308675`를 특정 조건으로 종료하고 preflight를 통과했다. Flyway는 V173~V177을 적용해 schema를 V177로 올렸지만, service restart 이후 `/api/health` readiness 확인에서 `probe_stockman_health: command not found`가 반복되어 activation이 exit 127로 실패했다.
- **근본 원인**: activation script의 readiness loop와 ERR handler가 각각 `probe_stockman_health` 및 `collect_service_diagnostics`를 호출했으나 두 함수 정의가 파일에 없었다. `scripts/test-oci-activation-preflight.mjs`는 이 계약을 검증하도록 작성되어 있었지만 `npm run deploy:verify`에서 실행되지 않아 clean CI에 누락됐다.
- **영향 범위**: Flyway schema V177과 market-impact-events import는 성공했다. 새 release 경로 교체 뒤 오류 trap은 앱/예약 작업 start 명령을 실행했으나 readiness 함수 누락으로 실제 runtime health 결과는 확인되지 않았다. DB migration은 자동 rollback하지 않으며 이전 릴리스 경로가 `.previous`에 남는다.
- **수정**: activation에 Node fetch 기반 localhost health probe와 실패 시 systemd/journal diagnostics 함수를 추가하고 `scripts/verify-deploy.mjs`의 fast gates에서 activation preflight regression test를 실행한다.
- **재발 자동 감지**: 배포 전 regression test가 health probe inline Node syntax, readiness 성공/실패 동작, failure diagnostics 및 archive safety를 실행한다. `npm run deploy:verify`가 이를 항상 수행하도록 연결한다.
- **검증/남은 위험**: activation regression suite와 `npm run deploy:verify`가 통과했다: 289 test files passed / 1 skipped, 1,645 tests passed / 3 skipped, typecheck, docs/API/migration/OCI cron gates, production build, standalone browser/API smoke. 재배포에서 운영 Flyway V177 유지, 새 app `/api/health` HTTP 200 및 세 scheduler timer active를 확인해야 완료다.
- **후속 배포 결과(2026-11-18)**: commit `c1d178a8`는 CI verification과 Flyway validation을 통과했고 운영 schema는 V177/up-to-date였다. 그러나 `stockman.service`가 active인 동안 60회 readiness 확인에서 HTTP 200을 얻지 못했고, 공개 `/api/health`는 503 degraded를 반환했다. 세 timer는 readiness 전에 시작됐으며 첫 cron/fundamentals 실행도 readiness 통과 전에 시작되어 fundamentals 요청은 connection reset으로 실패했다. timer와 최초 작업이 DB 부하를 일으켜 health를 악화했을 가능성은 있으나 원인은 아직 확정되지 않았다. 후속 수정은 app health 통과 후 scheduler timer와 최초 작업을 시작하도록 순서를 바꾸고 app journal 및 HTTP 상태 코드를 diagnostics에 포함한다. 다음 배포에서도 실패하면 journal의 `[Health]` 오류와 DB readiness 세부 항목을 확인한다. 현재 운영 health 503이므로 배포 완료가 아니다.
- **세 번째 배포 결과 및 DB 오류 원인(2026-11-18)**: commit `52977dfd`에서도 `/api/health`는 60회 모두 HTTP 503이었으므로 scheduler 순서 변경만으로 복구되지 않았다. Flyway는 schema V177 up-to-date였다. app journal은 매분 `[Automation] stale-run reconciliation failed: operator does not exist: text * interval`을 기록했다. `lib/automation-run-repository.ts`에서 PostgreSQL 파라미터를 명시적 숫자 타입으로 바꾸고 단위 회귀 테스트를 추가한다. 이 오류의 발생은 확인됐으나 `/api/health` 503을 직접 유발했는지는 아직 확인되지 않았다. 후속 배포는 이 오류가 사라지는지와 `/api/health` 200을 별도로 확인해야 한다.
- **후속 결과(2026-11-19)**: 진단 로그에서 DB 연결, 필수 환경변수, Flyway V177은 정상이었지만 `database.schemaReady=false`였고 `kis_rate_limit_events_occurred_idx`, `_endpoint_idx`, `_incident_idx` 세 인덱스가 모두 `wrong_columns`로 표시됐다. V172의 `CREATE INDEX IF NOT EXISTS`는 같은 이름으로 이미 존재하는 잘못된 정의를 교체하지 않는다. 최초 V178 수정은 `DROP/CREATE INDEX CONCURRENTLY`를 사용했으나 OCI run `44385856200`에서 migration이 시작된 후 40분 제한으로 종료 코드 137을 받았다. 사전검사에서는 오래된 snapshot이 관측되지 않았고 invalid index도 없었다. 따라서 OCI가 앱과 scheduler를 정지한 유지보수 구간의 이 migration은 일반 `DROP/CREATE INDEX`로 수행하도록 교체한다. `check-docs`와 `check-oci-cron`이 V178의 세 인덱스 정의, transactional 설정, 동시 빌드 부재를 검사한다. 다음 시도에서 V178 성공, schema health 및 서비스 복구를 확인한다. 이번 실패는 Flyway 단계라 공개 health 502가 지속되는 현재 운영상태는 미복구다.
- **후속 배포 결과(2026-11-19)**: 일반 DDL로 바꾼 commit `e96a1560`은 CI 배포 검증을 통과했으나, activation 중 PID `321998`의 PostgreSQL JDBC 세션이 `stockman`/loopback/`idle in transaction`/snapshot 보유/3,378초 조건으로 남아 V178 전에 preflight가 중단됐다. 기존 종료 스크립트의 정확한 조건과 1시간 초과 기준을 그대로 적용해 이 관측 PID를 명시적 allowlist에 추가한다. 다음 재시도에서 동일 조건을 종료 직전에 다시 검사하고, 중복/상태 변경/미일치 시 종료하지 않는다. 성공 기준은 Flyway V178, `/api/health` 200, 세 scheduler timer active이며 현재 운영 상태는 여전히 복구 전이다.
- **후속 배포 결과(2026-11-19)**: commit `c3139382`에서 PID `321998` 종료가 완료됐고 Flyway는 V178을 0.299초에 성공 적용했지만 activation은 readiness 검사에서 실패했다. 새 프로세스는 Flyway V178을 인식했으나 공개 schema의 세 rate-limit 인덱스를 계속 `wrong_columns`로 보고했다. 기존 preflight 출력은 인덱스 validity만 기록하고 실제 컬럼/스키마를 기록하지 않아 원인을 직접 구분할 수 없었다. V179는 index와 table 모두 `public`으로 명시해 search_path 의존을 제거한다. `check-docs`와 `check-oci-cron`이 그 명시적 한정과 세 정의를 검사한다. 재배포 후 V179와 `/api/health` 200, scheduler 활성화를 확인해야 한다. 현재 운영 readiness는 미복구다.
