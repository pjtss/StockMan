# DB 구조

## 비일봉 데이터 보존

V168은 보호된 `/api/cron/db-retention`을 통해 만료된 분봉·운영 로그·임시 관측 데이터를 테이블별 5,000행 단위, 실행당 최대 3회 정리합니다. 실행 상한에 도달한 테이블은 다음 5분 cron에서 이어 처리하고, 일부 테이블 실패 시 나머지 정리를 계속한 뒤 HTTP 503과 실패 목록을 반환합니다. PENDING 재시도·전송 중 상태는 보존하고 일봉 캔들 테이블은 삭제 대상에서 제외합니다. RSS 전체 feed snapshot은 180일 뒤 기사 연결을 분리해 삭제하며 기사별 payload는 보존합니다. SEC 제출 snapshot은 이전 이력을 365일, 기타 원문 snapshot은 180일 보존하고 CIK별 최신 제출 snapshot을 유지합니다. KIS 원본 신호 snapshot은 365일 보존합니다.

대형 테이블의 쓰기 잠금을 피하기 위해 V168은 `CREATE INDEX CONCURRENTLY`를 사용하며 `V168__bounded_non_daily_data_retention.sql.conf`로 Flyway 트랜잭션을 비활성화합니다. 배포 artifact에는 migration `.sql`과 `.sql.conf`가 모두 포함됩니다. Concurrent index build 실패 시 invalid index가 남을 수 있으므로 재시도 전 해당 index를 점검·제거하고 Flyway migration 이력을 repair해야 합니다.

`npm run cron:check`는 보존 테이블·컬럼, 기존 인덱스 중복 여부, 일봉 제외, route와 OCI 공통 5분 timer의 연결 및 migration 배포 포함 여부를 검사합니다. 운영 적용은 다음 OCI 배포에서 Flyway migrate가 완료된 뒤 시작됩니다.

- `schema.ts`: Drizzle 런타임 스키마
- `migration/`: Flyway 적용 순서가 보장되는 SQL
- `V141__local_rss_llm_analyses.sql`: Codex 직접 RSS 분석 revision 이력과 Discord 중복방지 전송 상태. 운영 반영은 배포 체크리스트와 health schema 검증을 거쳐야 합니다.
- `V161__market_rss_normalized_summary.sql`: RSS 원문 요약과 원본 payload를 보존하면서 규칙 기반 정규화 텍스트를 `market_rss_articles.normalized_summary`에 저장합니다.
- `V162__us_obv_divergence_snapshot.sql`: 미국 활성 COMMON_STOCK 일봉 OBV 다이버전스 결과를 검증 후 단일 JSONB 스냅샷으로 저장합니다. 공개 GET은 이 스냅샷만 읽고, 보호된 cron POST가 갱신합니다.
- `V163__market_impact_events.sql`: 단일 관리 JSON에서 가져온 국내·미국 공시 영향 이벤트를 운영 API용 테이블에 저장합니다. OCI 배포는 migration 성공 후 같은 릴리스의 JSON을 활성 COMMON_STOCK 마스터 검증과 eventId 기준 upsert로 반영합니다.
- `V164__market_impact_event_identity.sql`: `event_key` 기본값 `DEFAULT`를 추가하고 `(market, source_type, source_id, ticker, event_type, event_key)` unique index로 동일 공시 이벤트의 다른 eventId 중복 삽입을 막습니다. 기존 행의 중복 identity를 발견하면 migration을 실패시켜 운영자가 명시적으로 정리하게 합니다.
- V161 적용 뒤 로컬 기존 행은 `npm run backfill:market-rss-normalized-summary`로 dry-run 확인 후 `-- --apply`로 채울 수 있습니다. 이 스크립트는 `.env.local`의 localhost DB만 허용합니다.

스키마 변경은 반드시 새 migration으로 추가하고, 기존 운영 migration은 수정하지 않습니다. 운영 적용 후 `/api/health`에서 `flywayVersion`, `schemaReady`, `missingTables`를 확인합니다.

로컬 DB 이력과 저장소 migration 파일 버전 간 누락은 `npm exec --yes --package=tsx -- tsx scripts/audit-flyway-history.ts`로 읽기 전용 비교합니다. 이 스크립트는 `.env.local`에서 DB URL을 읽되 localhost 외의 호스트에서는 실행을 거부하며, schema history를 고치거나 migration을 적용하지 않습니다. pending 항목이 있다고 해서 곧바로 일괄 migrate하지 말고, 각 migration의 선행 스키마·데이터 영향과 적용 이력을 먼저 검토합니다.

DB·메모리 캐시·외부 호출의 책임 경계와 성능 검증 증거는 [`../docs/architecture/system-module-catalog.md`](../docs/architecture/system-module-catalog.md)에 정리되어 있습니다.
- `V166__stockman_event_ledger.sql`: 기존 SEC/RSS source row를 보존하며 공통 이벤트, 문서 연결, 불변 분석 revision, 상태 이력 및 정확 decimal 지표 테이블을 추가한다. 배포 전에 forward-only schema audit 및 롤백 계획 검토가 필요하다.
- `V167__restore_missing_source_analysis_tables.sql`: 운영 collection-status에서 누락을 재현한 `market_rss_llm_analyses`와 `sec_codex_analysis_queue` 및 관련 보조 테이블을 `IF NOT EXISTS`로 복구한다. 이미 존재하는 테이블과 데이터는 변경하지 않는다.
