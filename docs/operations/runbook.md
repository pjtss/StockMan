# 운영 런북

## 배포 확인

1. GitHub Actions `Deploy OCI`가 성공인지 확인합니다.
2. `GET /api/health`가 `status=ok`인지 확인합니다.
3. `service.commit`, `builtAt`, `database.flywayVersion`, `database.missingTables`를 기록합니다.
4. `/admin/observability`에서 최근 자동화 실행 상태를 확인합니다.

## 자동화 장애 확인

- 전체 실행 통계: `GET /api/debug/automation-runs?includeSummary=true`
- 특정 기능: `GET /api/debug/automation-runs?module=<module>&limit=20`
- 원본 관리자 테스트: `/admin/api-tests`
- 스키마 상태: `/api/health`의 `database` 블록

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
