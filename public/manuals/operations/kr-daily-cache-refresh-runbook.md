# 국내 보통주 일봉 캐시 운영 참고

> 2026-11-17 갱신: 관리자 화면과 관리자 API가 폐기되어 이 문서는 더 이상 수동 실행 절차로 사용할 수 없습니다. 과거 운영 기록과 진단 필드 설명은 이력 참고용입니다.

## 현재 실행 경로

국내 일봉 캐시는 OCI cron의 /api/cron/kr-daily-cache 예약 경로로 갱신됩니다. 수동 관리자 실행 경로는 없습니다. 자동 실행 여부와 실패 사유는 운영 서버의 stockman-cron.service journal 및 automation_runs 기록을 확인합니다. 공개 상태 확인에는 GET /api/health를 사용합니다.

기능 정책·캐시 freshness·retry 설계는 [CANDLE_REFRESH_DESIGN.md](../CANDLE_REFRESH_DESIGN.md), cron 호출 순서와 운영 구성은 [runbook.md](runbook.md)를 참고합니다.

2026-11-22 OCI cron 누락 원인 및 수정 기록은 [daily-candle-cache-refresh-diagnosis.md](daily-candle-cache-refresh-diagnosis.md)를 참고합니다.

## 과거 진단 자료

이 문서의 2026-10-25 기록과 이전 관리자 API 응답 예시들은 당시 실행의 역사 기록입니다. 현재 endpoint로 호출하지 마십시오. 현재 코드의 저장 검증은 kr_common_stock_universe 활성 COMMON_STOCK와 kr_latest_daily_candles를 종목 코드·시장 기준으로 대조하는 read-only 운영 DB 절차를 사용합니다.

실행 또는 검증 후 목적, 대상·성공·실패 건수, 최신 거래일·수집시각, 커버리지, 남은 retry 및 commit/push/deploy 여부를 DEVELOPMENT_LOG.md에 기록합니다. 자격증명 원문은 남기지 않습니다.
