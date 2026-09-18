# 미국 상승률 TOP 100 집중 갱신 설계

## 목표

미국 NAS·AMS·NYS 상승률 TOP 100에서 ETF·레버리지·파생상품 등을 제외한 활성 보통주를 선별한 뒤, 우선순위가 높은 최대 30개만 분봉·VWAP·거래대금·OBV·ADL 고빈도 탐지 대상으로 사용한다.

## 처리 흐름

1. 거래소별 상승률 TOP 100을 기존 live scope 캐시 주기(30초)로 갱신한다.
2. 상품 필터와 관리자 시총 필터를 적용한다.
3. `scoreIntradayCandidate` 우선순위 내림차순으로 정렬한다.
4. 상위 30개에 `focusTracking=true`와 `focusRank`를 부여한다.
5. worker는 미국 후보 중 `focusTracking=true`인 종목만 분봉을 조회한다.
6. focus 후보는 15초마다 갱신 예약하고, TOP 100 재평가 때마다 승격·강등한다.
7. 분봉 원본은 메모리에서만 유지하고, 탐지 결과·전이·알림 이력만 기존 관측 저장소에 기록한다.

## 불변 규칙

- TOP 100 전체를 삭제하지 않는다. 전체 순위는 메모리에 유지해 신규 진입 종목을 다음 갱신에서 승격할 수 있어야 한다.
- 30개를 영구 고정하지 않는다. 매 live scope 갱신마다 focus pool을 재구성한다.
- KIS 호출은 공통 throttle 경계를 통과한다. focus pool 축소는 호출량 최적화이지 rate-limit 우회가 아니다.
- 활성 보통주·중복 제거·거래정지/비정상 상품 제외 정책은 기존 필터를 그대로 사용한다.
- 다중 인스턴스에서는 프로세스 메모리가 공유되지 않으므로, 현재 단일 인스턴스 운영 전제를 문서화한다.

## 운영 관측

`intradayMemoryState.snapshot()`의 후보 상태에서 `focusTracking`, `focusRank`, `nextCheckAt`를 확인한다. worker 관측값의 `plannedCount`, `executedCount`, `deferredCount`, `queueDepth`로 focus pool 축소 효과를 측정한다.

## 성능 기대치

미국 보통주 20~30개만 분봉 조회하므로 기존 거래소별 최대 300개 전체 조회 대비 provider 호출 후보가 약 90% 감소한다. TOP 100 순위 갱신은 유지하므로 신규 급등 종목 발견 지연은 live scope 캐시 주기와 다음 worker tick 범위로 제한된다.

## 남은 개선

- 실제 운영 관측값으로 focus pool 크기 20·30·40을 비교한다.
- KIS TPS 10 정책과 focus pool별 예상 호출량을 관리자 대시보드에 함께 표시한다.
