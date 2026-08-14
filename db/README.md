# DB 구조

- `schema.ts`: Drizzle 런타임 스키마
- `migration/`: Flyway 적용 순서가 보장되는 SQL

스키마 변경은 반드시 새 migration으로 추가하고, 기존 운영 migration은 수정하지 않습니다. 운영 적용 후 `/api/health`에서 `flywayVersion`, `schemaReady`, `missingTables`를 확인합니다.
