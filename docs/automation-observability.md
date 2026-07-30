# 자동화 공통 실행 진단

운영 도메인에서 모든 기능의 최근 실행 결과를 확인한다.

```bash
curl -sS -H "x-cron-secret: $CRON_SECRET" \
  "https://stockman.r-e.kr/api/debug/automation-runs?limit=10"
```

각 실행에는 시작·종료 시각, 성공/부분성공/실패 상태, 기능별 요약(`summary`), 오류 메시지가 포함된다. 이 API를 기준으로 관리자 화면의 실행 이력과 장애 분석을 통합할 수 있다.
