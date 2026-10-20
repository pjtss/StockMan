# 운영 런북

## 배포 확인

1. GitHub Actions `Deploy OCI`가 성공인지 확인합니다.
2. `GET /api/health`가 `status=ok`인지 확인합니다.
3. `service.commit`, `builtAt`, `database.flywayVersion`, `database.missingTables`를 기록합니다.
4. 운영 schema 누락은 `/health-check`의 `누락 운영 테이블`·`누락 운영 컬럼`에서 상세 확인합니다. API 호출량 및 rate-limit 감사 기능은 `debug_kis_calls`, `kis_rate_limit_events`가 필요합니다.
5. `/admin/observability`에서 최근 자동화 실행 상태를 확인합니다.

## 자동화 장애 확인

- 전체 실행 통계: `GET /api/debug/automation-runs?includeSummary=true`
- 특정 기능: `GET /api/debug/automation-runs?module=<module>&limit=20`
- OCI RSS freshness: `systemctl status stockman-rss.timer`, `journalctl -u stockman-rss.service -n 50 --no-pager`, 인증된 `/api/debug/automation-runs?module=market-rss&limit=20`을 대조합니다. timer의 active만으로 RSS 실행 성공을 판단하지 않습니다. run이 오래됐으면 timer → oneshot journal/HTTP 응답 → 자동화 run → ingestion/번역 단계 순으로 진단합니다.
- 원본 관리자 테스트: `/admin/api-tests`
- 장시간 일봉 볼린저 테스트는 POST로 비동기 job을 시작하고 `statusEndpoint`를 polling합니다. 동기 GET은 호환용으로 유지됩니다.
- 스키마 readiness: `/api/health` 상태만 확인하고, 상세 원인은 관리자 `/api/debug/health` 또는 `/health-check`에서 `missingOperationalTables`·`missingOperationalColumns`를 확인합니다.
- 로컬 migration history/source drift 점검: `npm run audit:flyway-local` (읽기 전용; 운영 DB 불가)

## RSS 번역 스키마 복구

번역 worker는 `market_rss_articles.translation_attempted_at` (V137)과 `translation_candidate_title` (V140)이 있어야 실패 재시도 시각과 불완전 번역 검수 후보를 저장할 수 있습니다. middleware의 자동 요청 로그는 `request_logs.feature/action/resource/result` (V133)에도 의존합니다. `/api/health`가 503이거나 관리자 RSS 테스트가 DB 오류를 내면 provider/API key 문제로 단정하지 말고 DB readiness부터 확인합니다.

현재 로컬 DB의 알려진 상태(2026-09-26): `audit:flyway-local`은 기록 버전 V84, 저장소 최신 V140, pending 56개를 확인했습니다. V85/V89는 현재 source relation이 이미 view이고 split destination이 이미 존재해 structural precondition이 실패하며, SQL은 candle 행 삭제 및 relation drop/rename을 포함합니다. 요청 로그도 V133 필수 컬럼이 없습니다. 이 판정은 해당 로컬 DB 한 곳의 상태이며 운영 DB 상태로 일반화하지 않습니다.

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

## 롤백 원칙

- 애플리케이션 배포는 이전 OCI release로 되돌립니다.
- DB migration은 임의 SQL 수정이나 `git revert`로 되돌리지 않습니다. 필요한 보정 migration을 새 버전으로 추가합니다.
- 운영 환경변수는 `/etc/stockman/stockman.env`에서 관리하고 Git에 저장하지 않습니다.
