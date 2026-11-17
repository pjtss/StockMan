# 자동화 공통 실행 진단 API

운영 도메인에서 모든 기능의 실행 통계, 실행 커버리지, 최근 실행, 실패 원인과 단계별 `summary`를 한 번에 확인한다. 관리자 세션 쿠키 또는 `x-cron-secret` 중 하나가 필요하다.

```bash
curl -sS -H "x-cron-secret: $CRON_SECRET" \
  "https://stockman.r-e.kr/api/debug/automation-runs?limit=10"
```

## 쿼리

- `module`: 기능 키 하나로 범위를 제한한다. 예: `us-daily-indicators`
- `status`: `RUNNING`, `SUCCESS`, `PARTIAL`, `FAILED`, `SKIPPED`
- `since`, `until`: ISO-8601 시작 시각 범위(`until`은 미포함)
- `limit`: 기능별 최근 실행 수, 1~50, 기본 10
- `includeSummary=false`: 원본 요약을 제외하고 통계만 조회한다.
- `staleAfterSeconds`: `RUNNING` 상태를 오래된 실행으로 판정할 기준, 60~86400초, 기본 900초

예시:

```bash
curl -sS -H "x-cron-secret: $CRON_SECRET" \
  "https://stockman.r-e.kr/api/debug/automation-runs?module=us-daily-indicators&status=FAILED&limit=20"
```

## 응답 계약

```json
{
  "ok": true,
  "queriedAt": "2026-08-08T00:00:00.000Z",
  "filters": { "module": null, "status": null, "limit": 10, "includeSummary": true },
  "totals": {
    "runs": 42,
    "success": 38,
    "partial": 1,
    "failed": 2,
    "running": 1,
    "skipped": 0,
    "successRate": 90.48,
    "averageDurationMs": 1830
  },
  "coverage": {
    "configuredModuleCount": 18,
    "observedModuleCount": 16,
    "noRunModuleKeys": []
  },
  "modules": [],
  "recentRuns": [],
  "failures": []
}
```

각 실행에는 시작·종료 시각, 실행 시간, `stale` 여부, 성공/부분성공/실패 상태, 기능별 요약(`summary`), 오류 메시지와 오류 진단이 포함된다. `RUNNING` 상태가 기준 시간보다 오래되면 `stale=true`로 읽기 전용 표시한다. `modules[].coverage=NO_RUN`은 설정은 존재하지만 아직 실행 이력이 없는 기능을 뜻한다. `summary`의 원본 API 응답은 유지하되 환경변수·토큰·웹훅·DB URL·비밀번호 등 민감한 키는 `[REDACTED]`로 치환한다.

잘못된 필터는 `400`과 `stage=validate_filter`로, DB/스키마 문제는 `503`과 `stage=load_automation_runs`, `errorCode`, `databaseCode`, `table` 등 구조화된 진단으로 반환한다. 따라서 이 API를 자동화 모니터링과 관리자 화면의 공통 데이터 원본으로 사용한다.
