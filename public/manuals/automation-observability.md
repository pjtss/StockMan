# 자동화 진단

## US 일봉 캐시 운영 진단

US 일봉 캐시의 실행 상태와 시장별 최신 봉 coverage를 확인하는 내부 read-only API다. cron secret 인증이 필요하다.

```bash
curl -sS -H "x-cron-secret: $CRON_SECRET" \
  "https://stockman.r-e.kr/api/debug/us-daily-cache-status"
```

응답에는 현재 `us-daily-cache` enabled/schedule/interval, 공식 활성 COMMON_STOCK 기준 거래소별 대상 수·캐시 수·가장 최신 봉 날짜·최신일 보유 종목 수·마지막 fetched 시각, 최근 10회 automation run 상태와 안전한 count/error code 요약이 포함된다. 원문 오류 메시지와 민감한 설정은 응답하지 않는다. `markets[].missingAtLatestDateCount`는 각 거래소의 최신 봉일을 기준으로 한 coverage 부족 수이며, `latestCandleDate`가 거래일인지 여부는 거래소 공식 캘린더와 함께 판단한다.

이 경로는 `GET`만 제공하고 DB/설정을 변경하지 않으며 `Cache-Control: no-store`를 반환한다. 외부 종목·시장 공개 GET이 아니므로 OpenAPI에는 포함하지 않는다. 요청은 `scripts/api-surface.mjs`에서 `cron-guarded` 내부 API로 분류되며 route inventory에는 포함된다.

## 기존 전체 자동화 집계 API

`GET /api/debug/automation-runs`는 관리자 기능 정리 과정에서 제거되었으므로 호출하지 않는다. 과거 실행 이력 전반의 공통 집계가 다시 필요해질 때는 관리자 접근 정책과 쿼리 성능을 검토한 뒤 별도 설계한다. 현재 US 일봉 장애 확인에는 위 전용 API를 사용한다.
