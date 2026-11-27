# 국내 보통주 일봉 캐시 운영 참고

> 2026-11-17 갱신: 관리자 화면과 관리자 API가 폐기되어 이 문서는 더 이상 수동 실행 절차로 사용할 수 없습니다. 과거 운영 기록과 진단 필드 설명은 이력 참고용입니다.

## 현재 실행 경로

국내 일봉 캐시는 OCI cron의 `/api/cron/kr-daily-cache` 예약 경로로 갱신됩니다. 관리자 수동 실행 UI는 없으며, 무인증 공개 갱신이 필요하면 `POST /api/public/daily-cache/kr/refresh`를 호출할 수 있습니다. 이 공개 요청은 본문·인증 헤더 없이 호출하고 작업 접수 즉시 HTTP 202를 반환합니다. 완료한 데이터는 `GET /api/public/daily-candles`에서 확인합니다. 시장별 최소 1시간 간격과 cron/action 공용 DB 분산 잠금으로 중복 실행을 막고, 운영자가 기능을 비활성화한 경우 실행하지 않습니다. 수동 POST는 D 봉만 요청하며 예약 cron은 기존 D/W/M freshness 및 국내 주봉 파생 정책을 유지합니다. 인증된 실행 진단은 `GET /api/debug/daily-cache-status?market=KR` 또는 `market=US`로 확인합니다. `&includeServerLogs=true`는 허용된 앱·cron·Nginx journal을 현재 boot의 최근 행에서 읽고 API에서 `logMinutes=1..1440` 시간창을 필터링합니다. 기본은 source당 50행 반환이며 `logLimit=1..100`, 반복 `logUnit`으로 제한할 수 있습니다. cron 인증이 필요하고 로그는 민감정보 패턴을 마스킹합니다. `stockman.service`의 `systemd-journal` 보조 그룹은 호스트 전체 journal을 읽을 수 있으므로 이 권한 범위를 고려해 배포합니다. 기본 응답은 유니버스 coverage, 최신 거래일, retry/failure 집계 및 실행 이력을 읽으며 KIS 호출·DB 변경을 하지 않습니다. `&probeSource=true`를 붙이면 거래소별 최대 3개 종목의 KIS 일봉 GET을 실행해 source/cache 최신일을 대조합니다(요청 한 번당 최대 6회). 인증 헤더는 cron 경로와 같은 `x-cron-secret` 또는 `Authorization: Bearer …`입니다. 자동 실행 여부와 호스트 호출 누락은 운영 서버의 stockman-cron.service journal 및 automation_runs 기록도 함께 확인합니다.

기능 정책·캐시 freshness·retry 설계는 [CANDLE_REFRESH_DESIGN.md](../CANDLE_REFRESH_DESIGN.md), cron 호출 순서와 운영 구성은 [runbook.md](runbook.md)를 참고합니다.

2026-11-22 OCI cron 누락 원인 및 수정 기록은 [daily-candle-cache-refresh-diagnosis.md](daily-candle-cache-refresh-diagnosis.md)를 참고합니다.

## 과거 진단 자료

이 문서의 2026-10-25 기록과 이전 관리자 API 응답 예시들은 당시 실행의 역사 기록입니다. 현재 endpoint로 호출하지 마십시오. 현재 코드의 저장 검증은 kr_common_stock_universe 활성 COMMON_STOCK와 kr_latest_daily_candles를 종목 코드·시장 기준으로 대조하는 read-only 운영 DB 절차를 사용합니다.

실행 또는 검증 후 목적, 대상·성공·실패 건수, 최신 거래일·수집시각, 커버리지, 남은 retry 및 commit/push/deploy 여부를 DEVELOPMENT_LOG.md에 기록합니다. 자격증명 원문은 남기지 않습니다.
