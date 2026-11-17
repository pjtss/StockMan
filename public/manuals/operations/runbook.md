# 운영 런북

## 배포 확인

1. GitHub Actions `Deploy OCI`가 성공인지 확인합니다.
2. `GET /api/health`가 `status=ok`인지 확인합니다.
3. `service.commit`, `builtAt`, `database.flywayVersion`, `database.missingTables`를 기록합니다.
4. 운영 schema 누락은 `/health-check`의 `누락 운영 테이블`·`누락 운영 뷰`·`누락 운영 컬럼`에서 상세 확인합니다. API 호출량 및 rate-limit 감사 기능은 `debug_kis_calls`, `kis_rate_limit_events`가 필요합니다.
5. `/admin/observability`에서 최근 자동화 실행 상태를 확인합니다.

## 자동화 장애 확인

- 전체 실행 통계: `GET /api/debug/automation-runs?includeSummary=true`
- 특정 기능: `GET /api/debug/automation-runs?module=<module>&limit=20`
- OCI RSS freshness: `systemctl status stockman-rss.timer`, `journalctl -u stockman-rss.service -n 50 --no-pager`, 인증된 `/api/debug/automation-runs?module=market-rss&limit=20`을 대조합니다. timer의 active만으로 RSS 실행 성공을 판단하지 않습니다. run이 오래됐으면 timer → oneshot journal/HTTP 응답 → 자동화 run → ingestion/번역 단계 순으로 진단합니다.
- 원본 관리자 테스트: `/admin/api-tests`
- 장시간 일봉 볼린저 테스트는 POST로 비동기 job을 시작하고 `statusEndpoint`를 polling합니다. 동기 GET은 호환용으로 유지됩니다.
- 스키마 readiness: `/api/health` 상태만 확인하고, 상세 원인은 관리자 `/api/debug/health` 또는 `/health-check`에서 `missingOperationalTables`·`missingOperationalViews`·`missingOperationalColumns`·`operationalColumnShapeIssues`·`operationalPrimaryKeyIssues`·`operationalIndexIssues`를 확인합니다.
- 로컬 migration history/source drift 점검: `npm run audit:flyway-local` (읽기 전용; 운영 DB 불가)

## RSS 번역 스키마 복구

번역 worker는 `market_rss_articles.translation_attempted_at` (V137)과 `translation_candidate_title` (V140)이 있어야 실패 재시도 시각과 불완전 번역 검수 후보를 저장할 수 있습니다. middleware의 자동 요청 로그는 `request_logs.feature/action/resource/result` (V133)에도 의존합니다. `/api/health`가 503이거나 관리자 RSS 테스트가 DB 오류를 내면 provider/API key 문제로 단정하지 말고 DB readiness부터 확인합니다.

현재 로컬 DB의 알려진 상태(2026-09-26): `audit:flyway-local`은 기록 버전 V84, 저장소 최신 V140, pending 56개를 확인했습니다. V85/V89는 현재 source relation이 이미 view이고 split destination이 이미 존재해 structural precondition이 실패하며, SQL은 candle 행 삭제 및 relation drop/rename을 포함합니다. 요청 로그도 V133 필수 컬럼이 없습니다. 이 판정은 해당 로컬 DB 한 곳의 상태이며 운영 DB 상태로 일반화하지 않습니다.

현재 로컬 DB 점검(2026-11-11): `npm run audit:flyway-local`은 localhost 전용 read-only 검사에서 applied V161/source V172, pending migration 11개, 필수 table 7개와 필수 column 2개 누락을 확인해 exit 1을 반환합니다. `/api/health` readiness가 false이고 rate-limit forward index 세 개는 `table_missing`입니다. 운영 상태로 일반화하지 않으며 migration을 자동 적용하지 않습니다.

추가 read-only catalog 대조(2026-11-11): 누락 table 7개는 모두 실제 catalog에서 relation kind가 없고, 두 compatibility view는 VIEW로 존재합니다. 로컬 Flyway history는 V142–V161을 적용한 상태입니다. V131 source와 history 사이의 정확한 최초 누락 경로는 확인되지 않았습니다. 공식 Flyway 문서상 `outOfOrder` 기본값이 false라 이미 높은 버전 뒤에 발견된 낮은 version migration은 기본적으로 적용되지 않습니다. `ignoreMigrationPatterns`는 validate/repair 설정이며 migrate의 직접 원인으로 취급하지 않습니다. V172 forward migration이 해당 table/index를 다시 보장합니다. audit JSON은 누락 relation별 source version과 Flyway 이력 row(미기록 시 null)를 표시하고, 미적용 migration은 `appliedLatest`보다 높은 pending과 낮은 older-unapplied 후보로 나눕니다. 낮은 후보의 history 부재만으로 실제 schema effect 누락을 단정하지 않습니다. docs:check는 V157 이후의 보장 table 및 forward index 정의를 감시합니다. migration은 별도 배포 전까지 로컬에 적용하지 않습니다. 참고: [Flyway out-of-order](https://documentation.red-gate.com/fd/flyway-out-of-order-setting-277579015.html), [Flyway ignore migration patterns](https://documentation.red-gate.com/fd/flyway-ignore-migration-patterns-setting-277579002.html).

V172 추가 후 read-only 재점검(2026-11-11): source latest는 V172, local applied latest는 V161이며 schema readiness는 아직 false입니다. `kis_rate_limit_events`는 V172 선언이 보이지만 해당 migration history row와 catalog table이 없으므로 local 상태는 정상화되지 않았습니다. `/api/health`와 admin diagnostics는 해당 테이블의 writer/admin 소비 컬럼도 검사해 table 누락과 partial-column 상태를 구분합니다. docs:check는 V157 이후 CREATE TABLE 및 ALTER TABLE로 forward 보장된 컬럼을 검사합니다. 배포 이후 실제 대상 DB를 별도로 확인합니다.

audit 상태 분리(2026-11-11): 현재 local 결과는 applied V161/source V172, higher-version pending 11개, lower-version `olderUnapplied` 후보 57개입니다. `drift`는 higher-version pending 또는 failed history만 반영하고 olderUnapplied만으로 설정하지 않습니다. 낮은 후보는 Flyway 기본 migrate 대상이 아니며, 해당 항목의 객체 적용 여부는 catalog audit으로 별도 확인합니다. CLI 종료 코드는 actionable history drift뿐 아니라 필수 운영 schema readiness 실패도 1로 처리합니다.

DDL inventory 해석(2026-11-11): catalog mismatch는 source migration 전체의 최종 객체 상태를 비교하므로 applied history가 없는 낮은 버전 및 아직 pending인 migration의 차이도 포함할 수 있습니다. audit JSON의 `ddlInventoryMismatchMigrationStates`와 version 목록을 함께 보고 APPLIED mismatch와 PENDING/OLDER_UNAPPLIED 상태의 차이를 분리합니다. 2026-11-11 localhost 결과에서는 V70 cascade 및 regular view 하위 객체 90건이 skip, 남은 109건 중 APPLIED 0·OLDER_UNAPPLIED 58·PENDING 51이었습니다. 이 상태 집계는 heuristic DDL을 검증된 SQL 의미로 승격하지 않습니다. V148의 다중 clause ALTER 및 V85/V89의 DROP 후 CREATE VIEW 순서 오탐은 전체 DDL source order를 보존하도록 수정했습니다.

CREATE TABLE LIKE 점검(2026-11-11): pending preflight가 `LIKE source_table` 정의와 INCLUDING/EXCLUDING 옵션을 감지하면 `pendingCreateTableDefinitionUnverified` 및 `PENDING_MIGRATION_CREATE_TABLE_DEFINITION_UNVERIFIED`로 fail-closed한다. LIKE는 source의 컬럼·NOT NULL과 선택 옵션에 따라 defaults, constraints, indexes 등의 복사 범위를 바꾸므로 현재 컬럼 파서 결과가 빈 배열이라고 구조 확인을 통과시키지 않는다. 저장소에서 검색된 LIKE statement는 V85/V89 older-unapplied라 현재 higher-version pending audit의 대상에는 없고, 이번 local `pendingCreateTableDefinitionUnverified`는 0건이다. 참고: [PostgreSQL CREATE TABLE LIKE](https://www.postgresql.org/docs/16/sql-createtable.html).

파생/상속 CREATE TABLE 점검(2026-11-11): `CREATE [TEMP] TABLE ... AS`, `CREATE TABLE ... OF`, `CREATE TABLE ... PARTITION OF`, `PARTITION BY`, `INHERITS (...)`, `SELECT ... INTO`는 query 결과, composite type, partition parent, query result에서 형태·데이터·상속이 유래하므로 pending preflight에서 `pendingCreateTableDefinitionUnverified`로 fail-closed한다. LIKE 옵션, query output shape/data, type 정의, partition parent/경계, inheritance column merge는 현재 catalog 비교 대상이 아니다. SELECT INTO relation도 object inventory에 포함한다. 저장소의 TEMP CTAS V57 및 LIKE V85/V89는 현재 적용 기준보다 오래된 migration이라 이번 higher-version pending audit에는 포함되지 않았다. 참고: [PostgreSQL CREATE TABLE AS](https://www.postgresql.org/docs/16/sql-createtableas.html), [CREATE TABLE](https://www.postgresql.org/docs/16/sql-createtable.html), [SELECT INTO](https://www.postgresql.org/docs/16/sql-selectinto.html).

Pending migration 선행조건 점검(2026-11-11): `pendingIndexTargetIssues`가 있고 `PENDING_MIGRATION_INDEX_TARGET_MISSING`가 나오면 해당 `CREATE INDEX` 대상 physical table이 현재 catalog나 앞선 pending source migration에 없다. 이번 로컬 audit은 V167 4개, V168 2개, V169 1개 대상에서 확인했다. `pendingIndexColumnIssues`는 catalog 및 앞선 pending `CREATE TABLE`/`ALTER TABLE ADD/DROP COLUMN` 선언을 반영한 단순 key-column 누락을, `pendingIndexColumnUnverified`는 복합 expression/syntax 또는 추적 불가 컬럼 상태를 표시한다. `pendingIndexNameConflicts`는 동일한 relation 이름이 non-index object나 다른 table의 index로 점유된 경우를 표시한다. index 이름을 생략한 PostgreSQL `CREATE INDEX ON ...`도 target/column preflight에 포함하며 PostgreSQL 생성 이름의 정확한 충돌 검사는 `pendingIndexNameUnverified`로 명시한다. partitioned parent에 대한 `ON ONLY` index는 child attach 이후 valid 상태를 증명하지 못하므로 `pendingPartitionedIndexOnlyUnverified`로 표시하며 pending chain 적용을 진행하지 않는다. `pendingIndexDefinitionUnverified`는 key sort/null ordering, INCLUDE 컬럼 순서, method, uniqueness, NULLS NOT DISTINCT 처리, predicate 유무, valid/ready/live 상태에 따라 같은 table의 기존 동명 index를 source와 대조한다. predicate expression은 정규화 결과를 비교하되 dollar-quoted/escape string 또는 다른 decompile 형태와 source storage parameter/TABLESPACE shape는 미검증으로 남긴다. 기존 table에 대한 `CREATE TABLE IF NOT EXISTS`는 source REFERENCES와 catalog FK의 local/target column, validation 및 MATCH·ON DELETE/UPDATE·deferrability·initially-deferred·선택적 ON DELETE column list를 `pendingCreateTableForeignKeyIssues`로 대조한다. inline PK/UNIQUE key column order·deferrable/initially-deferred·`NULLS NOT DISTINCT`·INCLUDE column·CHECK 식 및 `NO INHERIT`는 `pendingCreateTableConstraintIssues`와 `pendingCreateTableConstraintUnverified`로 보고한다. 기존 테이블의 EXCLUDE 선언은 아직 비교하지 않아 unverified 처리한다. unique backing index의 null treatment와 key/include 경계는 `indnullsnotdistinct`, `indnkeyatts`, `indkey`를 대조하며 CHECK 복원은 PostgreSQL `pg_get_constraintdef`를 사용한다. source `IN (...)`의 catalog `= ANY (ARRAY[...])` 변환 및 catalog decompiler가 추가한 source-absent `::type` cast는 동등성을 추정하지 않고 unverified로 fail-closed한다. 현재 read-only audit 결과는 CREATE TABLE kind conflict 0, declared column missing 0, existing-table FK issue 0, inline key/check issue 0, inline constraint unverified 0, FK local/target/unique-key issue/unverified 0, column comparison unverified 0, ALTER target issue 0, pending ALTER effects 12, object-state conflict/unverified 0, index parent issue 7, index key column issue 0, catalog index invalid/not-ready/not-live 0, unverified syntax 0, name conflict 0, definition mismatch/unverified 0이다. `pendingConcurrentIndexConfigIssues`는 `CREATE INDEX CONCURRENTLY` migration의 `.sql.conf`에 `executeInTransaction=false`가 있는지 검사하며 현재 결과는 0건이다. parent issue가 남으면 pending chain을 실행하지 않는다. `invalidCatalogIndexes`가 나오면 해당 index의 build/drop 상태를 확인한다. 기준: [PostgreSQL CREATE INDEX](https://www.postgresql.org/docs/16/sql-createindex.html), [CREATE TABLE](https://www.postgresql.org/docs/16/sql-createtable.html), [`pg_constraint`](https://www.postgresql.org/docs/16/catalog-pg-constraint.html), [`pg_index`](https://www.postgresql.org/docs/16/catalog-pg-index.html), [`pg_get_constraintdef`](https://www.postgresql.org/docs/16/functions-info.html), [Flyway script configuration](https://documentation.red-gate.com/flyway/reference/script-configuration), [Flyway executeInTransaction](https://documentation.red-gate.com/fd/flyway-execute-in-transaction-setting-277578997.html).

Flyway applied-history validation(2026-11-11): `audit:flyway-local`은 적용된 SQL migration의 source resolution, description, type, CRC32 checksum을 로컬 파일과 read-only로 대조합니다. `BASELINE` marker는 source SQL migration으로 검증하지 않으며, 다른 applied non-SQL type이나 source의 중복 version은 명시적 issue로 처리합니다. DB의 `script` 문자열 자체는 repair 이후의 역사적 파일명이 남을 수 있어 단독 mismatch로 판정하지 않습니다. 이번 local audit은 104개 applied migration 모두 validation metadata 일치로 보고했습니다. V148은 history `script`가 이전 이름이지만 description/type/checksum이 현재 V148 source와 일치하며, 과거 repair 및 subsequent validation 성공 이력이 있습니다. 공식 Flyway 검증은 migration 이름/type/checksum 차이, unresolved applied version, 미적용 resolved version을 오류로 봅니다 ([Flyway validate](https://documentation.red-gate.com/flyway/reference/commands/validate), [baseline](https://documentation.red-gate.com/flyway/reference/commands/baseline), [공식 CRC32 checksum 구현](https://github.com/flyway/flyway/pull/3764/files)).

2026-10-20 운영에서 Flyway V157은 성공했지만 `/api/health`가 `market_rss_articles.translation_attempted_at` 및 `translation_candidate_title` 누락으로 degraded를 반환했다. 두 컬럼은 각각 V137/V140에만 정의되어 있었고 당시 DB version보다 낮아 자동 적용되지 않았다. Flyway 공식 문서상 `outOfOrder` 기본값은 `false`; `ignoreMigrationPatterns`는 `validate`/`repair` 상태 필터이며 migrate의 낮은 version 적용 여부와는 별개다. 따라서 “migration 파일이 저장소에 존재한다”는 사실만으로 기존 운영 스키마에 적용됐다고 가정할 수 없다. V158은 두 컬럼을 `ADD COLUMN IF NOT EXISTS`로 재보장하고 실패/월간 한도 건의 기존 시도 시각을 backfill한다. `scripts/check-docs.mjs`는 운영 floor V157 이후의 forward migration이 `FORWARD_REQUIRED_OPERATIONAL_COLUMNS`를 모두 다시 추가하는지 자동 검사한다. 운영 floor를 높이거나 신규 필수 컬럼을 추가할 때 이 호환성 목록과 검증 게이트도 함께 갱신한다.

이 상태에서는 다음 작업을 하지 않습니다.

- V137/V140 또는 V133을 건너뛰어 수동 DDL로 추가하지 않습니다.
- `flyway repair`나 `baseline`으로 history만 맞추지 않습니다. Flyway 공식 문서상 `repair`는 schema history를 정리·정렬하며 실제 사용자 객체를 복구하지 않고, baseline은 기존 DB를 지정 버전의 시작점으로 기록하므로 현재 객체/data 상태가 일치한다는 증거 없이 적용하면 migration 기록만 감출 수 있습니다.
- 배포 스크립트를 로컬 DB 복구 도구처럼 실행하지 않습니다. OCI `stockman-activate`는 서비스 재시작 전에 릴리스에 포함된 migration 전체에 `migrate`를 실행합니다.

안전한 진행 순서:

1. 로컬 전용 `npm run audit:flyway-local` 결과를 보존하고, URL·자격증명은 출력하지 않습니다. 이 도구는 localhost 외의 DB를 거부하고 history·catalog만 읽습니다.
2. 기존 로컬 데이터가 필요한 경우 PostgreSQL backup/restore 또는 승인된 snapshot으로 격리 복제본을 만들고, 적용 기록·현재 DDL·데이터 영향이 있는 모든 pending migration을 버전 순으로 대조합니다. 특히 V85/V89 선행 구조와 삭제/rename 영향이 해결되지 않으면 중단합니다.
3. 복제본에서 전체 migration 경로를 검증하고 Flyway `validate`, 앱의 `audit:flyway-local`, `/api/health`가 모두 기대 상태임을 확인합니다. Flyway `validate`는 기록과 migration 파일의 이름·종류·checksum 불일치를 검출하지만 현재 데이터의 의미적 정합성을 대신 보증하지 않습니다.
4. 검토된 복구안과 rollback/restore 계획에 대해 DB 소유자 승인을 받은 뒤에만 대상 환경을 지정해 적용합니다. 사용자가 승인하지 않은 이 작업에서는 local/production DB migration, repair, baseline을 실행하지 않습니다.
5. 적용 후 `translation_attempted_at`, `translation_candidate_title`, request-log metadata columns, health readiness를 재확인한 다음 승인된 preview 경로에서만 번역을 시험합니다. semantic 품질은 별도 사람 검수 fixture로 판정합니다.

새 빈 개발 DB는 기존 데이터 복구 대상과 분리해 전체 migration을 처음부터 적용할 수 있습니다. 단, 기존 DB를 백업하지 않고 지우거나 빈 DB URL로 운영 설정을 덮어쓰지 않습니다.

공식 참고: [Flyway validate](https://documentation.red-gate.com/flyway/reference/commands/validate), [Flyway repair](https://documentation.red-gate.com/flyway/reference/commands/repair), [Flyway baseline migrations](https://documentation.red-gate.com/flyway/flyway-concepts/migrations/baseline-migrations).

실패를 판단할 때 HTTP 상태만 보지 말고 JSON의 `ok`, `skipped`, `errorCode`, `stage`, `table`을 함께 확인합니다.

## KIS 장애

1. `kis-token`의 발급 이력과 마지막 발급 시각을 확인합니다.
2. `AUTH_EXPIRED`와 일반 4xx를 구분합니다.
3. 429·500·502·503·504는 공통 throttle 재시도 후 다음 실행에서 재시도됩니다.
4. 일봉 탐지에서 KIS를 직접 재호출하지 말고 캐시 갱신 작업의 실패 원인을 확인합니다.

## 국내 보통주 일봉 수동 갱신

- 운영 관리자 로그인, 수동 갱신, 작업 상태 유실 대응, DB 커버리지 검증 절차는 [국내 일봉 캐시 런북](./kr-daily-cache-refresh-runbook.md)을 따릅니다.
- cron 스케줄 skip 응답은 수동 실행의 성공을 의미하지 않으며, 수동 작업은 완료 상태와 운영 DB 진단을 별도로 확인합니다.

## 롤백 원칙

- 애플리케이션 배포는 이전 OCI release로 되돌립니다.
- DB migration은 임의 SQL 수정이나 `git revert`로 되돌리지 않습니다. 필요한 보정 migration을 새 버전으로 추가합니다.
- 운영 환경변수는 `/etc/stockman/stockman.env`에서 관리하고 Git에 저장하지 않습니다.
