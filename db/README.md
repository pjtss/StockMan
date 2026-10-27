# DB 구조

- `schema.ts`: Drizzle 런타임 스키마
- `migration/`: Flyway 적용 순서가 보장되는 SQL
- `V141__local_rss_llm_analyses.sql`: Codex 직접 RSS 분석 revision 이력과 Discord 중복방지 전송 상태. 운영 반영은 배포 체크리스트와 health schema 검증을 거쳐야 합니다.
- `V161__market_rss_normalized_summary.sql`: RSS 원문 요약과 원본 payload를 보존하면서 규칙 기반 정규화 텍스트를 `market_rss_articles.normalized_summary`에 저장합니다.
- V161 적용 뒤 로컬 기존 행은 `npm run backfill:market-rss-normalized-summary`로 dry-run 확인 후 `-- --apply`로 채울 수 있습니다. 이 스크립트는 `.env.local`의 localhost DB만 허용합니다.

스키마 변경은 반드시 새 migration으로 추가하고, 기존 운영 migration은 수정하지 않습니다. 운영 적용 후 `/api/health`에서 `flywayVersion`, `schemaReady`, `missingTables`를 확인합니다.

로컬 DB 이력과 저장소 migration 파일 버전 간 누락은 `npm run audit:flyway-local`로 읽기 전용 비교합니다. 이 명령은 `.env.local`에서 DB URL을 읽되 localhost 외의 호스트에서는 실행을 거부하며, schema history를 고치거나 migration을 적용하지 않습니다. pending 항목이 있다고 해서 곧바로 일괄 migrate하지 말고, 각 migration의 선행 스키마·데이터 영향과 적용 이력을 먼저 검토합니다.

DB·메모리 캐시·외부 호출의 책임 경계와 성능 검증 증거는 [`../docs/architecture/system-module-catalog.md`](../docs/architecture/system-module-catalog.md)에 정리되어 있습니다.
