# 미국 상승률 TOP 100 집중 갱신 설계

## 목표

미국 NAS·AMS·NYS 상승률 TOP 100에서 ETF·레버리지·파생상품 등을 제외한 활성 보통주를 선별한 뒤, 우선순위가 높은 최대 30개만 분봉·VWAP·거래대금·OBV·ADL 고빈도 탐지 대상으로 사용한다.

## 처리 흐름

1. 거래소별 상승률 TOP 100을 기존 live scope 캐시 주기(30초)로 갱신한다.
2. 상품 필터와 공식 보통주 마스터의 활성 상태 필터를 적용하고, 관리자 시총 필터를 적용한다.
3. 상품 필터·활성 상태·시총 필터를 모두 통과한 최종 보통주 후보를 `scoreIntradayCandidate` 우선순위 내림차순으로 정렬한다.
4. 그 최종 후보 상위 30개에만 `focusTracking=true`와 `focusRank`를 부여한다.
5. worker는 미국 후보 중 `focusTracking=true`인 종목만 분봉을 조회한다.
6. focus 후보는 15초마다 갱신 예약하고, TOP 100 재평가 때마다 승격·강등한다.
7. 분봉 원본은 메모리에서만 유지하고, 탐지 결과·전이·알림 이력만 기존 관측 저장소에 기록한다.

## 불변 규칙

- TOP 100 전체를 삭제하지 않는다. 전체 순위는 메모리에 유지해 신규 진입 종목을 다음 갱신에서 승격할 수 있어야 한다.
- 30개를 영구 고정하지 않는다. 매 live scope 갱신마다 focus pool을 재구성한다.
- KIS 호출은 공통 throttle 경계를 통과한다. focus pool 축소는 호출량 최적화이지 rate-limit 우회가 아니다.
- 활성 보통주·중복 제거·거래정지/비정상 상품 제외 정책은 기존 필터를 그대로 사용한다.
- ETF·ETN·레버리지·파생상품·비활성 종목은 focus pool 계산 전에 제거되며, 원본 KIS 순위 행이 직접 focus pool에 들어갈 수 없다.
- 공식 보통주 마스터 조회가 실패하면 후보를 남기지 않는 fail-closed 정책을 적용한다.
- 공식 보통주 판정은 단일 인스턴스 프로세스 메모리에 종목별 1시간 TTL로 캐시하고, 캐시 미스만 DB에서 일괄 조회한다. 양성·음성 판정 모두 캐시해 ETF·워런트·비활성 종목의 반복 조회를 막는다.

## 운영 검증 기준

- 관리자에서 `intraday-mvp`가 활성화되고 `worker.lastTickAt`이 갱신되어야 시총 대비 거래대금 비율을 동작 상태로 판단한다.
- `trackedCandidateCount`는 최종 활성 보통주 후보 수와 일치해야 하며, `qualifiedCandidateCount`는 최근 1분 샘플 5개와 설정된 누적 비율 조건을 통과한 수다.
- 워커가 비활성인 동안에는 후보 목록이 존재해도 탐지 결과나 Discord 알림이 발생하지 않는 것이 정상이다.
- 다중 인스턴스에서는 프로세스 메모리가 공유되지 않으므로, 현재 단일 인스턴스 운영 전제를 문서화한다.

## 운영 관측

`intradayMemoryState.snapshot()`의 후보 상태에서 `focusTracking`, `focusRank`, `nextCheckAt`를 확인한다. worker 관측값의 `plannedCount`, `executedCount`, `deferredCount`, `queueDepth`로 focus pool 축소 효과를 측정한다.

## 성능 기대치

미국 보통주 20~30개만 분봉 조회하므로 기존 거래소별 최대 300개 전체 조회 대비 provider 호출 후보가 약 90% 감소한다. TOP 100 순위 갱신은 유지하므로 신규 급등 종목 발견 지연은 live scope 캐시 주기와 다음 worker tick 범위로 제한된다.

## 남은 개선

- 실제 운영 관측값으로 focus pool 크기 20·30·40을 비교한다.
- KIS TPS 10 정책과 focus pool별 예상 호출량을 관리자 대시보드에 함께 표시한다.

## 2026-09-19 성능·정확성 점검 결과

- 공식 보통주 조회는 시장 배열과 코드 배열의 독립적인 `ANY` 조건을 사용하지 않고, 동일 순서의 `(market, code)` pair를 `unnest`로 조인한다. 따라서 NAS의 코드와 NYS의 코드가 교차 결합되어 잘못 적격 판정되는 경로를 차단한다.
- 공식 적격성 메모리 캐시는 1시간 TTL을 유지하고, 조회 시작 시 만료 항목을 정리하며 최대 5,000개로 제한한다. 양성·음성 판정 모두 캐시한다.
- TOP 100 재평가에서 후보 상태를 점수 계산 단계와 focus 적용 단계에 각각 쓰던 중복 갱신을 제거했다. 최종 upsert는 후보별 1회이며, 기존 rolling turnover/VWAP 파생 상태는 보존한다.
- 후보 eviction은 매번 전체 Map을 정렬하지 않고 선형 최소 탐색으로 수행한다. 최대 후보 수가 300개인 현재 경계에서 불필요한 배열·정렬 할당을 줄인다.
- 검증: `lib/us-top-rising-universe.test.ts`, `lib/intraday-memory-state.test.ts` 통과(19개), `npm run typecheck` 통과, `npm run docs:check` 통과.
- 아직 운영에서 확인할 값: 거래소별 TOP 100 응답시간, 공식 적격성 cache hit/miss, focus 30개 대비 worker `executedCount`·`deferredCount`·`queueDepth`, process RSS.
