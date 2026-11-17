# 운영 런북

## 배포 확인

1. GitHub Actions `Deploy OCI`가 성공인지 확인합니다.
2. `GET /api/health`가 `status=ok`인지 확인합니다.
3. `service.commit`, `builtAt`, `database.flywayVersion`, `database.missingTables`를 기록합니다.
4. 운영 schema 누락은 `/api/health` 응답의 `database` 정보를 기준으로 확인합니다.

## 자동화 장애 확인

- OCI RSS freshness: `systemctl status stockman-rss.timer`, `journalctl -u stockman-rss.service -n 50 --no-pager`를 대조합니다. timer의 active만으로 RSS 실행 성공을 판단하지 않습니다.
- 로컬 migration history/source drift 점검: `npm run audit:flyway-local` (읽기 전용; 운영 DB 불가)

## RSS 번역 스키마 복구

번역 worker는 `market_rss_articles.translation_attempted_at` (V137)과 `translation_candidate_title` (V140)이 있어야 실패 재시도 시각과 불완전 번역 검수 후보를 저장할 수 있습니다. middleware의 자동 요청 로그는 `request_logs.feature/action/resource/result` (V133)에도 의존합니다. `/api/health`가 503이면 provider/API key 문제로 단정하지 말고 DB readiness부터 확인합니다.
