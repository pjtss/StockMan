# 장중 KIS 수급 탐지 메모리 우선 설계

> 문서 상태: `DESIGN_IN_PROGRESS`<br>
> 최종 검토: 2026-09-12<br>
> 운영 토폴로지: 단일 모놀리식 OCI 애플리케이션 + PostgreSQL<br>
> 목표: 정규장에 실제 거래대금이 집중되는 종목을 신선한 KIS 관측과 반복 검증으로 탐지<br>
> 현재 코드 연결 상태: 상주 `IntradayDetectionWorker`, 후보 큐, 품질 게이트, 상태 전이, tick/전이 관측 저장, 관리자 디버깅 API까지 연결됨. 실제 운영 SLO 충족 여부는 운영 장중 표본 수집으로 별도 검증한다.
> KIS 안전 호출 한도: 10 TPS (공식 18 TPS 대비 운영 여유 확보)

## 결론

현재 운영 서버는 단일 모놀리식 OCI VM의 Next.js 프로세스와 PostgreSQL을 사용한다. 서버를 수평 분산하지 않는 전제이므로 Redis는 도입하지 않고, TOP 상승률 스냅샷·후보 우선순위·VWAP 누적 상태 같은 휘발성 상태는 동일 프로세스 메모리에서 관리한다. 확정 탐지 이벤트, 호출 로그, 중복 방지 상태는 PostgreSQL에 저장한다.

## 책임 분리

```text
메모리: TOP 100 2개 스냅샷, 후보 상태, VWAP, in-flight 요청, TTL
DB: 탐지 이벤트, 운영 감사 로그, KIS 호출량, 장애·재시도 이력
```

재시작 시 메모리 상태는 폐기하고 TOP 100을 다시 조회한다. 정확한 누적 VWAP 복구가 요구되기 전에는 Redis나 DB checkpoint를 추가하지 않는다.

## 메모리 상한

- 스냅샷 2개, 후보 300개, VWAP 300개
- in-flight 요청 20개, 최근 응답 1,000개
- TTL 만료·TOP 100 이탈·낮은 우선순위 순으로 제거
- 모든 장중 요청은 기존 KIS throttle과 요청 병합 계층을 통과

## 처리 흐름

1. 장외 일봉으로 기본 후보를 구성한다.
2. 정규장에는 거래소별 상승률 TOP 100을 30~60초 TTL로 수집한다.
3. 이전 스냅샷과 비교해 신규·급변 종목만 후보 큐에 넣는다.
4. 후보 우선순위에 따라 거래대금·VWAP·체결강도를 차등 조회한다.
5. 조건을 충족한 확정 이벤트만 DB에 기록한다.

후보 큐는 `dueCandidates()`로 현재 시각에 조회할 대상을 우선순위순으로 꺼내고, `scheduleCandidate()`로 다음 조회시각을 예약한다. 우선순위 100 이상은 10초, 60 이상은 30초, 그 외 TOP 100 후보는 2분 주기를 기본값으로 사용한다.

## 정규장 데이터 품질 게이트

상승률 TOP 100 응답이 정상(`HTTP 200`, `rt_cd=0`)이어도 순위 배열이 비어 있으면 탐지를 성공으로 간주하지 않는다. 단, 이것은 전송 오류가 아니라 `NO_RANKING_DATA` 상태이며, 이전 스냅샷을 최신 데이터처럼 재사용해 알림을 만들지 않는다.

후보를 고빈도 큐에 넣기 위한 최소 조건은 다음과 같다.

```text
정규장 세션 일치
+ TOP 100 스냅샷 신선도 60초 이내
+ ticker·거래소·현재가 유효
+ 거래량 > 0
+ 거래대금과 시가총액이 같은 통화
+ 거래대금/시가총액 비율 계산 가능
```

프리마켓·장후 데이터는 정규장 신호와 별도 세션으로 표시하며, 정규장 탐지 점수와 섞지 않는다. 시장별 응답 시각이 다르면 전체 스냅샷을 하나의 시각으로 덮어쓰지 않고 거래소별 `collectedAt`, `session`, `ageSeconds`를 보존한다.

## 점수와 탐지 확정의 분리

점수는 조회 우선순위를 정할 뿐, 자금 유입 확정이나 투자 추천을 의미하지 않는다.

- `priority`: 다음 KIS 조회 빈도 결정
- `signal`: 거래량·거래대금·VWAP·체결강도·가격 방향의 조건 평가
- `qualified`: 최소 표본·신선도·세션 조건을 통과한 경우만 true
- `alerted`: 중복 방지 상태를 통과해 실제 알림을 보낸 경우

따라서 `priority > 0`인 종목을 곧바로 알림 대상으로 사용하지 않는다. 최소 2회 연속 관측, 직전 관측 대비 거래량 또는 거래대금 증가, 가격 하락 여부, 스프레드 품질을 확인한 뒤 `qualified`로 승격한다.

## 현재 운영 주기와 설계 주기의 차이

OCI cron 스크립트가 5분마다 실행되는 환경에서는 메모리 큐의 10초·30초 주기를 실제로 보장할 수 없다. 모놀리스 전제에서는 별도 서비스가 아니라 동일 애플리케이션 내부의 상주 worker 또는 systemd가 관리하는 단일 프로세스 worker로 해결한다. worker가 동작하지 않는 동안에는 관리자와 사용자 화면에 `observedAt`과 `dataAge`를 표시하고, 60초를 초과한 스냅샷은 실시간 후보가 아닌 `STALE`로 분류한다.

## 단계별 운영 기준

| 단계 | 상태 | 의미 | 허용 동작 |
|---|---|---|---|
| 후보 수집 | `OBSERVED` | TOP 100에 포함 | 메모리 스냅샷 반영 |
| 비율 확인 | `PRIORITIZED` | 거래대금/시총 계산 가능 | 조회 큐 우선순위 부여 |
| 반복 검증 | `CONFIRMED` | 최소 2회 연속 조건 충족 | 상세·분봉 조회 |
| 신호 확정 | `QUALIFIED` | 품질 게이트와 지표 조건 통과 | 알림 후보 |
| 오래됨 | `STALE` | 신선도 제한 초과 | 점수·알림에서 제외 |

## 자금 유입 판정 지표

단일 상승률이나 단일 거래량 순위는 자금 유입의 충분조건이 아니다. 후보별로 동일한 관측 구간을 유지해 아래 지표를 계산한다.

```text
relativeVolume = 최근 5분 거래량 / 최근 20개 동일 길이 구간 중앙값
turnoverRate = 구간 거래대금 / 시가총액
flowAcceleration = 최근 1분 거래대금 / 직전 5분 평균 1분 거래대금
priceConfirmation = 구간 종가 > 구간 시가 AND 종가가 VWAP 이상
```

- 거래량이 없거나 기준 구간이 부족하면 해당 지표는 `null`이며 0으로 간주하지 않는다.
- 통화가 다른 금액을 환산해 합산하지 않는다. 국내는 KRW, 해외는 USD로 시장별 분리한다.
- 시가총액은 DB 고정값을 사용하되 `marketCapAsOf`와 `marketCapAge`를 함께 보존한다.
- 스플릿·거래정지·가격 0·음수 거래대금 응답은 신호 계산에서 제외한다.

기본 `QUALIFIED` 조건은 다음과 같이 정의한다.

```text
TOP 100 유지
+ 최근 2회 이상 연속 관측
+ relativeVolume >= 1.5
+ turnoverRate >= 관리자 기준값
+ priceConfirmation = true
+ 데이터 age <= 60초
```

체결강도·OBV·ADL은 보강 신호로 사용하며, 어느 하나만으로 `QUALIFIED`를 만들지 않는다. 가격은 하락하지만 거래대금만 급증하는 경우는 `ATTENTION`으로 남기고 매수 유입으로 확정하지 않는다.

## 메모리 상태와 DB 이벤트의 경계

메모리에는 계산에 필요한 최근 관측값만 유지한다.

- 종목별 최근 관측 최대 20개
- 종목별 마지막 `observedAt`, `dataAge`, 세션, 가격, 거래량, 거래대금
- 점수 구성요소와 필터 탈락 사유
- 후보별 다음 조회시각과 연속 실패 횟수

DB에는 최종적으로 재현·감사할 가치가 있는 이벤트만 저장한다.

- TOP 100 스냅샷 요약
- `QUALIFIED`, `ATTENTION`, `REJECT`, `STALE` 상태 전이
- KIS 요청의 endpoint, TR ID, 응답코드, 지연시간, 재시도
- 알림 deduplication key와 전송 결과

모든 1분봉 원본을 DB에 쌓지 않는 현재 정책은 유지한다. 장애 분석에 필요한 표본은 호출 로그와 후보 상태 요약으로 보완한다.

## 운영 SLO와 실패 처리

정규장 후보 데이터의 목표는 “항상 결과가 존재”가 아니라 “오래된 결과를 실시간 결과처럼 보이지 않음”이다.

- TOP 100 신선도: 60초 이내
- 후보 상세·분봉 응답: 요청당 8초 timeout
- 동일 종목 연속 3회 실패: 조회 간격을 2배로 늘리고 `DEGRADED`
- 60초 초과 스냅샷: `STALE`, 신규 알림 금지
- KIS HTTP 429/5xx: 지수 backoff, 기존 후보를 `QUALIFIED`로 승격 금지
- 정상 응답의 빈 배열: `NO_DATA`, 전송 장애로 기록하지 않음

이 기준으로 관리자 디버깅 화면에는 시장별 `lastSuccessfulAt`, `ageSeconds`, `session`, `sourceCount`, `qualifiedCount`, `staleCount`를 표시한다.

## 구현 추적 및 다음 개선 순서

| 우선순위 | 작업 | 현재 상태 | 완료 증거 |
|---:|---|---|---|
| 1 | 거래소별 TOP 100 수집·필터·메모리 스냅샷 | 구현됨 | `lib/us-top-rising-universe.ts`, `intraday-flow` |
| 2 | 시총 대비 거래대금 기반 후보 점수 | 구현됨 | `lib/intraday-candidate-priority.ts` 단위 테스트 |
| 3 | 후보별 고빈도 조회 큐 | 구현됨 | `lib/intraday-memory-state.ts` 단위 테스트 |
| 4 | 스냅샷 신선도·세션·반복 관측 품질 게이트 | 구현됨 | `lib/intraday-quality-gate.ts`, 국내·해외 분봉 worker 연결 |
| 5 | 5분 OCI cron의 고빈도 한계 해소 | 구현됨 | `lib/intraday-detection-worker.ts` singleton worker와 `instrumentation.ts` 자동 기동 |
| 6 | `QUALIFIED` 상태 전이·중복 알림 방지 | 구현됨 | 메모리 상태 전이와 PostgreSQL transition/dedupe 연결 |
| 7 | 관리자 운영 지표 | 구현됨 | 호출량·RATE LIMIT·worker 상태·tick/전이 집계 API 및 화면 |

현재 코드는 스냅샷 수집부터 후보 점수·메모리 큐·분봉 관측·품질 판정·상태 전이·tick 관측·관리자 디버깅 API까지 연결한다. 이후 운영에서는 아래 증거를 수집해 SLO를 검증한다.

문서의 “구현됨”은 해당 라이브러리·단위 테스트가 존재한다는 뜻이며, 전체 장중 자동 탐지가 운영 프로세스에서 끝까지 실행된다는 뜻이 아니다. 운영 완료로 판정하려면 실제 프로세스에서 다음 증거를 모두 확보해야 한다.

- 단일 프로세스에서 worker가 중복 기동되지 않고 정상 종료되는 실행 로그
- 거래소별 TOP 100 수집부터 후보 조회·상태 전이까지 연결된 통합 테스트
- KIS 호출량, 지연, 429/5xx, stale, 빈 응답을 포함한 운영 지표
- 재시작 후 `WARMING_UP`에서 신선한 스냅샷과 2회 관측을 거쳐 복귀하는 로그
- 사용자·관리자 API가 동일한 `evaluationVersion`과 데이터 신선도를 표시하는 검증

## 설계 불변 조건

- KIS 정상 빈 배열을 장애나 상승 후보로 위장하지 않는다.
- 오래된 스냅샷을 최신 실시간 데이터로 표시하지 않는다.
- TOP 100 포함만으로 매수·자금 유입을 확정하지 않는다.
- 통화가 다른 시가총액과 거래대금을 합산하지 않는다.
- API 키·토큰·원본 자격증명을 로그·디버깅 응답에 기록하지 않는다.
- 메모리 상태 손실은 허용하되, 손실 후 DB에 없는 데이터를 복원한 것처럼 만들지 않는다.
- KIS 요청은 endpoint·시장 전체 합산 10 TPS를 절대 초과하지 않는다. 공식 18 TPS는 운영 예산으로 사용하지 않는다.
- 10 TPS 초과가 예상되면 낮은 priority 요청을 지연하고, rate limit 발생 후 대기 손실을 피하기 위해 예산을 선점하지 않는다.

## 모놀리스 운영 원칙

서버는 항상 단일 모놀리식 프로세스로 운영한다. 따라서 메모리 상태를 프로세스 간 공유하기 위한 Redis·분산 큐·리더 선출은 사용하지 않는다. cron 호출과 장중 worker는 동일 애플리케이션의 단일 실행 경로를 통과하고, 중복 실행은 PostgreSQL 잠금과 애플리케이션 in-flight 잠금으로 방지한다. 재배포·프로세스 재시작 시 메모리 상태가 사라지는 것은 정상이며, 새 TOP 100 스냅샷을 수집한 뒤 탐지를 재개한다.

## 단일 프로세스 장중 worker 설계

장중 고빈도 탐지는 별도 마이크로서비스가 아니라 모놀리스 내부의 `IntradayDetectionWorker`가 담당한다. 웹 요청은 worker 상태를 직접 변경하지 않고, 메모리 스냅샷과 DB에 저장된 최근 실행 결과만 읽는다.

```text
프로세스 시작
  → worker 단일 실행 잠금 획득
  → 세션 판정
  → 거래소별 TOP 100 갱신
  → 후보 점수·조회 큐 갱신
  → due 후보 상세·분봉 조회
  → 상태 전이·확정 이벤트 저장
  → 다음 tick 예약
```

- worker tick 기본값: 10초
- TOP 100 갱신: 30~60초 TTL이 만료된 거래소만 갱신
- 후보 상세: priority와 `nextCheckAt`에 따라 차등 실행
- KIS 동시 요청: 전역 semaphore로 제한하며, 요청 시작 속도는 전역 10 TPS token bucket을 반드시 통과
- KIS 호출 예산 초과: 낮은 priority 후보부터 다음 tick으로 이월
- 동일 worker 재진입: 이전 tick이 끝나지 않았으면 건너뜀
- SIGTERM/SIGINT: 새 KIS 요청을 받지 않고 in-flight 요청 완료 후 종료

worker는 프로세스 수명주기와 함께 시작·종료하며, 시작 실패가 웹 서버 기동 실패로 전파되지 않도록 한다. 대신 `workerStatus`, `lastTickAt`, `lastSuccessAt`, `lastError`, `queueDepth`를 운영 상태에 남긴다. worker가 중지된 경우 사용자 화면은 결과를 숨기지 않고 마지막 데이터의 `ageSeconds`와 `STALE` 상태를 명확히 표시한다.

## 호출 예산 정책

호출량은 “후보 수 × 고정 주기”로 예약하지 않고, 거래소별 TOP 100 갱신과 후보별 우선순위 큐를 분리해 제한한다.

```text
초당 허용 호출 예산
  = min(관리자 설정값, 10 TPS)
  - 최근 1초 실제 호출량
```

여기서 10 TPS는 KIS 공식 제한 18 TPS보다 낮게 잡은 고정 운영 안전 한도다. 관리자 설정값이 10보다 높아도 실제 throttle은 10 TPS에서 멈추며, endpoint별 bucket과 전역 bucket 모두 이 상한을 적용한다. rate limit 응답이 발생하면 backoff 중인 요청은 호출 예산에서 제외하지 않고, 재시도도 동일한 전역 10 TPS 예산을 다시 소비한다.

예산이 부족하면 다음 순서로 보류한다.

1. `STALE` 또는 데이터 품질이 낮은 후보
2. TOP 100에서 이탈한 후보
3. priority가 낮고 마지막 관측 변화가 없는 후보
4. priority가 높은 후보는 최소 재조회 간격을 보장

실제 호출량은 `debug_kis_calls`에 기록하고, worker tick마다 `plannedCount`, `executedCount`, `deferredCount`, `throttledCount`, `failedCount`를 요약 저장한다. 이 요약이 있어야 10초 worker 도입 후 호출량 증가가 KIS 제한을 초과하지 않았는지 검증할 수 있다.

## 배포·프로세스 수명주기

worker는 웹 요청과 분리된 외부 서버가 아니라 같은 모놀리스 프로세스의 application lifecycle hook에서 시작한다.

```text
next start
  → 앱 초기화
  → worker.start()
  → HTTP 요청 처리와 worker tick 동시 수행
  → SIGTERM 수신
  → worker.stop({ drain: true })
  → next 프로세스 종료
```

- 개발 환경에서는 `NODE_ENV=development`일 때 worker를 자동 시작하지 않고 수동 실행 플래그로만 켠다.
- 운영 환경에서는 기본 시작하며 `INTRADAY_DETECTION_ENABLED=false`를 명시한 경우에만 중지한다. 이 값은 `instrumentation.ts`와 worker의 실제 조건과 동일하게 유지한다.
- 프로세스가 두 번 초기화되는 Next.js 개발 리로드에서는 전역 singleton과 실행 토큰으로 중복 worker를 차단한다.
- 장외 시간에는 tick을 유지하되 KIS 호출은 하지 않고 세션 전환·재개 시각만 갱신한다.
- worker 예외는 웹 서버 예외로 전파하지 않고 `lastError`에 기록한 뒤 backoff 후 재시작한다.
- systemd는 프로세스 전체를 1개만 유지하며 `Restart=on-failure`를 사용한다. 여러 replica나 별도 worker unit은 운영하지 않는다.

## 운영 상태 계약

관리자 디버깅 API는 다음 상태를 반드시 반환한다.

```json
{
  "enabled": true,
  "status": "RUNNING",
  "session": "REGULAR",
  "lastTickAt": "...",
  "lastSuccessfulAt": "...",
  "queueDepth": 12,
  "inflight": 3,
  "staleMarkets": [],
  "lastError": null,
  "budget": { "planned": 18, "executed": 15, "deferred": 3, "throttled": 0 }
}
```

`RUNNING`, `OUTSIDE_SESSION`, `DEGRADED`, `STOPPING`, `DISABLED`를 구분해야 하며, `enabled=true`만으로 실시간 탐지가 동작한다고 표시하지 않는다. `RUNNING`이 아니면 사용자 화면에는 마지막 관측 시각과 데이터 신선도를 함께 표시한다.

## 거래소·종목별 정규화

고정 임계값만 사용하면 대형주와 저가주의 거래량 분포 차이 때문에 특정 유형의 종목만 반복 선택될 수 있다. 다만 정규화 기준을 실시간 데이터 자체에서 매번 다시 계산하면 급등 구간에 기준선이 함께 상승하는 문제가 있으므로, 장중 기준선과 현재 관측값을 분리한다.

- `baselineVolume`: 최근 20개 동일 길이 구간의 중앙값
- `baselineTradeValue`: 최근 20개 동일 길이 구간의 중앙값
- `relativeVolume`: 현재 구간 / `baselineVolume`
- `relativeTradeValue`: 현재 구간 / `baselineTradeValue`
- `turnoverRate`: 현재 누적 거래대금 / 고정 시가총액
- `floatTurnoverRate`: 유통주식수 확인 가능한 국내 종목에서만 거래량 / 유통주식수

기준선이 부족한 신규 상장·거래정지 해제 종목은 `BASELINE_INSUFFICIENT`로 표시하고, TOP 100에 포함되더라도 `QUALIFIED`로 승격하지 않는다. 국내는 OpenDART 유통주식수의 기준일을 확인하며, 유통주식수가 없거나 오래된 경우 발행주식수·상장주식수로 조용히 대체하지 않고 데이터 품질을 낮춘다.

## 검증·튜닝 방법

임계값 변경은 운영 중 임의 조정하지 않고, 동일한 관측 로그로 다음을 비교한다.

1. 후보 진입 후 5분·15분·30분 가격 변화
2. `QUALIFIED` 대비 실제 거래대금 증가 지속 여부
3. 신호별 false positive 비율
4. 거래소·시총 구간별 후보 편중
5. 종목당 KIS 호출 수와 p95 지연시간

튜닝 결과는 `thresholdVersion`으로 식별하고, 이벤트에 사용한 버전·기준선 표본 수·계산 시각을 함께 저장한다. 이를 통해 같은 입력 스냅샷으로 이전 정책과 새 정책을 재현할 수 있다. 백테스트 결과가 없는 새 임계값은 알림 정책에 바로 적용하지 않고 `SHADOW` 모드로만 계산한다.

## 거래대금/시가총액 집중 후보

거래대금/시가총액 비율은 시장별 통화를 고정한다. 국내는 KRW, 해외는 USD이며 환율 변환을 하지 않는다. 시가총액·거래대금이 없거나 통화가 유효하지 않으면 집중 탐지 큐에 넣지 않는다. 5% 이상은 최우선(+40), 1% 이상은 우선(+20)으로 점수화하며 신규 진입·순위 급등·거래량 증가·VWAP 상회 점수와 합산한다. 구현은 `lib/intraday-candidate-priority.ts`가 담당한다.

## 검증 지표

`debug_kis_calls`에서 기능별 호출량, cache hit, 평균·p95 지연시간, 429/5xx, 후보 수, 처리시간을 집계한다. 메모리 상태는 영속 데이터가 아니므로 관리자 화면에는 DB에 기록된 확정 이벤트와 호출 통계를 표시한다.

## 신호 유지·해제와 중복 알림

순간적인 한 번의 거래대금 급증을 실제 자금 이동으로 오인하지 않도록 진입 임계값과 해제 임계값을 다르게 둔다.

```text
진입: 2회 연속 관측에서 QUALIFIED 조건 충족
유지: 최근 3회 중 2회 이상 조건 충족
주의: 1회 조건 이탈 또는 dataAge 경고
해제: 3회 연속 조건 이탈 또는 STALE
재알림: 동일 종목·동일 세션 10분 cooldown 후 재평가
```

상태 키는 `session + market + code + thresholdVersion`으로 만든다. 따라서 NAS 정규장과 AMS 정규장의 신호를 합치지 않으며, 정책 버전이 바뀌면 이전 상태를 새 정책의 확정 신호로 재사용하지 않는다. 프로세스 재시작 후 메모리 상태가 사라진 경우에도 DB의 마지막 `ALERTED` 시각을 조회해 cooldown을 보호한다.

알림 payload에는 관측 시각·세션·TOP 100 순위 변화·현재가·VWAP·가격 방향·구간 거래량·거래대금·기준선·RVOL·시총 대비 거래대금·연속 충족 횟수·데이터 신선도를 포함한다. 근거 필드가 누락된 이벤트는 `QUALIFIED`가 아닌 `INCOMPLETE`로 저장하고 알림을 보내지 않는다.

## 확정 이벤트 표준 스키마

상태 전이와 알림은 동일한 이벤트 객체를 사용한다. 화면·Discord·관리자 디버깅이 서로 다른 계산 결과를 표시하지 않도록, 한 번 계산한 스냅샷을 직렬화해 전달한다.

```json
{
  "eventId": "uuid",
  "session": "REGULAR",
  "market": "NAS",
  "code": "ABC",
  "observedAt": "...",
  "dataAgeSeconds": 8,
  "thresholdVersion": "v1",
  "state": "QUALIFIED",
  "rank": 12,
  "rankChange": 18,
  "price": 10.25,
  "vwap": 10.10,
  "volume": 1200000,
  "baselineVolume": 500000,
  "relativeVolume": 2.4,
  "tradingValue": 12300000,
  "marketCap": 150000000,
  "turnoverRate": 0.082,
  "consecutivePasses": 2,
  "reasons": ["TOP_RISING", "RVOL", "ABOVE_VWAP"],
  "quality": "COMPLETE"
}
```

`eventId`는 상태 전이마다 새로 만들고, 중복 알림 키는 `session + market + code + state + thresholdVersion + 10분 bucket`으로 만든다. 이벤트에 포함되지 않은 지표를 알림 문구에서 임의로 추가하지 않는다.

## 보존 정책과 비용 제어

- 메모리 원시 관측: 종목별 최근 20개, 프로세스 재시작 시 폐기
- 확정 상태 전이: PostgreSQL 30일 보존
- KIS 호출 로그: PostgreSQL 90일 보존
- 시간별 호출·후보 요약: 1년 보존
- 원본 1분봉 대량 저장: 하지 않음

보존 기간이 지나면 원본 이벤트를 삭제하더라도 시간별 집계와 알림 결과는 유지한다. 이를 통해 상세 재현이 필요한 기간과 호출량·오탐률을 장기간 비교하는 비용을 분리한다. DB 보존 작업 자체도 모놀리스의 저부하 장외 작업으로 실행하며 정규장 worker와 동시 실행되지 않도록 한다.

## 실시간성의 정의와 KIS 한계

이 설계에서 실시간은 거래소 체결의 무조건적인 무지연 전달이 아니라, KIS가 제공하는 최신 순위·현재가·분봉을 제한된 지연 안에 반복 관측하는 것을 의미한다. 각 결과에는 다음 세 시각을 구분해 저장한다.

- `sourceObservedAt`: KIS 응답 또는 봉이 시장에서 관측된 시각
- `collectedAt`: 모놀리스가 KIS 응답을 수신한 시각
- `qualifiedAt`: 품질 게이트와 반복 관측을 통과한 시각

`collectedAt - sourceObservedAt`가 60초를 넘으면 `STALE`로 처리한다. KIS가 제공하는 순위가 빈 배열이면 거래가 없다고 단정하지 않고 `NO_RANKING_DATA`로 표시한다. 반대로 현재가·분봉 응답이 정상이고 거래량이 0이면 해당 관측만 유효한 무거래 표본으로 기록하며, 이전 관측값을 복사해 상승 신호를 만들지 않는다.

따라서 사용자에게 표시하는 문구도 다음처럼 구분한다.

```text
실시간 후보 = 최근 KIS 관측 + 신선도 60초 이내 + 품질 게이트 통과
지연 후보 = 응답은 있으나 sourceObservedAt을 확인할 수 없음
오래된 후보 = 수신 후 60초 초과 또는 세션 불일치
데이터 없음 = 정상 응답이나 순위·봉 배열이 비어 있음
```

이 구분은 “결과가 비어 있지 않게 보이는 것”보다 우선한다. 데이터 지연이나 KIS 제공 범위의 한계를 UI와 관리자 디버깅에 그대로 노출해야 실전 탐지 결과를 신뢰할 수 있다.

## 장중 시간대 보정

장 시작·마감 직전에는 구조적으로 거래량과 거래대금이 집중되므로, 하루 전체 구간의 기준선과 동일하게 비교하지 않는다.

- 장 시작 후 첫 5분: `OPENING_AUCTION`으로 표시하고 RVOL 단독 확정 금지
- 장 시작 5~30분: 기준선이 안정화될 때까지 `BASELINE_BUILDING`
- 장중: 일반 `REGULAR` 기준 적용
- 마감 전 10분: `CLOSING_WINDOW`로 표시하고 신규 신호는 2회 연속 조건을 요구
- 장 마감 후: 신규 후보 생성·KIS 실시간 호출 중지

거래소별 세션 캘린더와 서머타임을 기준으로 세션을 판정하며, 단순 서버 로컬 시각이나 평일 여부로 정규장을 추정하지 않는다. 거래소 휴장일·조기 폐장일·서킷브레이커 발생 시 해당 시장만 `MARKET_CLOSED` 또는 `MARKET_PAUSED`로 표시하고 다른 거래소의 탐지는 계속한다.

시간대 보정은 후보의 원본 거래량을 변경하지 않는다. `sessionPhase`와 `baselineEligible`을 별도 필드로 저장해, 나중에 동일 원본으로 보정 전·후 결과를 재현할 수 있게 한다.

## 필수 검증 매트릭스

worker와 탐지 정책을 변경할 때는 다음 시나리오를 모두 검증한다.

| 시나리오 | 기대 결과 |
|---|---|
| 정규장 TOP 100 정상 응답 | 거래소별 스냅샷 교체, 후보 우선순위 계산 |
| 한 거래소 빈 배열 | 해당 시장 `NO_RANKING_DATA`, 다른 시장은 계속 처리 |
| KIS 429 | endpoint backoff, 후보 확정·알림 금지 |
| KIS 5xx·timeout | circuit breaker, 개별 후보 backoff |
| 60초 초과 스냅샷 | `STALE`, 신규 `QUALIFIED` 금지 |
| 장 시작 첫 5분 | `OPENING_AUCTION`, RVOL 단독 확정 금지 |
| 마감 전 10분 | `CLOSING_WINDOW`, 반복 관측 조건 적용 |
| 거래량 0·가격 0 | 관측 기록만 남기고 신호 계산 제외 |
| 시총·거래대금 통화 불일치 | 비율 null, 큐 삽입 금지 |
| 프로세스 재시작 | `WARMING_UP`, 새 스냅샷·기준선부터 재구축 |
| 동일 tick 재진입 | 두 번째 실행 건너뜀, 중복 KIS 호출 없음 |
| 동일 종목 cooldown | 상태는 기록하되 중복 알림 없음 |
| 일부 시장만 성공 | 시장별 freshness와 결과를 독립 표시 |

단위 테스트만으로 충분하지 않다. 위 시나리오 중 KIS 응답·시간·프로세스 상태와 관련된 항목은 mock contract test와 운영 dry-run을 각각 수행하고, 결과에 `requestId`, `thresholdVersion`, `sessionPhase`를 남긴다.

## 점수 안정화와 시장별 최소 조건

시총 대비 거래대금 비율 하나가 점수를 과도하게 지배하지 않도록 각 요소의 기여도를 제한한다. 최종 점수는 0~100으로 clamp하고, 순위·거래량·가격 확인·유동성·데이터 품질을 독립된 구성요소로 저장한다.

| 구성요소 | 기본 최대점 | 의미 |
|---|---:|---|
| TOP 100 유지·순위 상승 | 20 | 시장 내 상대적 관심 |
| RVOL·거래대금 가속 | 25 | 평소 대비 거래 활성화 |
| 시총 대비 거래대금 | 20 | 종목 규모 대비 집중도 |
| VWAP·가격 확인 | 20 | 거래 증가와 가격 방향 일치 |
| 데이터 품질·반복 관측 | 15 | 신선도·표본·연속성 |

최소 유동성 조건을 통과하지 못한 종목은 점수와 무관하게 `LIQUIDITY_INSUFFICIENT`로 제외한다. 해외는 거래량 0·호가 부재·시총 미확인 종목을 제외하고, 국내는 유통주식수와 최근 거래일 거래량을 함께 확인한다. 시장별 통화는 계속 분리하며, 서로 다른 거래소의 점수는 절대값이 아니라 해당 거래소 내 percentile을 함께 표시해 비교한다.

점수는 탐지 우선순위이고 투자 판단 점수가 아니다. 사용자 화면과 Discord에는 점수만 단독으로 표시하지 않고, 점수를 구성한 이유와 제외·품질 상태를 함께 표시한다.

## 호출 보호 계층

정규장에 후보가 급증해도 하나의 모놀리스가 KIS 호출을 무제한으로 만들지 않도록 호출 계층을 다음 순서로 통과시킨다.

```text
세션 게이트
 → 중복 요청 병합
 → 전역 동시성 제한
 → 초당·분당 호출 예산
 → endpoint별 circuit breaker
 → KIS 요청
 → 결과·지연시간 기록
```

- 같은 `market + code + endpoint + window` 요청은 하나로 합쳐 응답을 공유한다.
- `429`가 발생하면 해당 endpoint의 신규 요청을 짧게 중지하고 지수 backoff를 적용한다.
- 연속 5회 timeout 또는 5xx이면 endpoint를 `OPEN`으로 전환하고 30초 후 단일 probe만 허용한다.
- probe가 성공하면 `HALF_OPEN`에서 정상 상태로 복귀한다.
- 한 endpoint의 장애가 다른 endpoint와 웹 요청을 막지 않도록 circuit을 endpoint별로 분리한다.
- 후보별 연속 실패는 해당 후보에만 backoff를 적용하며 전체 큐를 중단하지 않는다.
- 실패 중에는 이전 성공 데이터를 `QUALIFIED` 신호로 재사용하지 않는다.

호출 보호 계층의 상태는 `debug_kis_calls`와 worker tick 요약에 함께 기록한다. 운영 화면에서 `budgetRemaining`, `breakerState`, `backoffUntil`, `coalescedCount`를 확인할 수 있어야 호출 감소와 데이터 미수신을 구분할 수 있다.

## 재시작 복구와 시간 기준

단일 모놀리스는 재배포·장애 복구 중 메모리 상태를 잃을 수 있으므로, 재기동 직후의 탐지를 별도 `WARMING_UP` 상태로 둔다.

1. 프로세스 시작 시 서버 시계를 UTC와 확인하고 시장별 세션 캘린더를 로드한다.
2. 이전 DB 이벤트의 마지막 `ALERTED` 시각과 threshold 버전을 읽어 cooldown을 복구한다.
3. 거래소별 TOP 100을 새로 수집하기 전에는 이전 스냅샷을 실시간 후보로 사용하지 않는다.
4. 첫 TOP 100 수집 후 후보 기준선을 만들고, 최소 2회 관측 전까지 `QUALIFIED` 승격을 금지한다.
5. warm-up 중에는 화면에 `재시작 후 기준선 수집 중`과 마지막 정상 관측 시각을 표시한다.

모든 내부 비교는 epoch milliseconds를 사용하고, 표시만 KST 또는 거래소 현지 시간으로 변환한다. KIS 응답에 관측 시각이 없으면 수신 시각을 `collectedAt`으로만 기록하며 `sourceObservedAt`으로 오인하지 않는다. 거래소별 스냅샷은 완전히 검증된 결과만 현재 슬롯으로 원자 교체하고, 일부 거래소만 성공한 결과는 시장별 상태로 보존한다.

## 데이터 계보와 재현성

탐지 결과는 다음 입력의 조합으로 정의하며, 어느 하나라도 변경되면 새 `evaluationVersion`을 만든다.

```text
evaluationVersion
 = rankingSnapshotId
 + marketMetadataVersion
 + thresholdVersion
 + indicatorVersion
 + sessionCalendarVersion
```

확정 이벤트에는 TOP 100 스냅샷 ID, 거래소별 수신 시각, 시가총액·유통주식수 기준일, 사용한 1분봉 관측 구간, 임계값·지표·세션 캘린더 버전을 함께 기록한다. 제외된 필터와 누락된 입력도 계보 정보에 남긴다.

DB에 원본 1분봉 전체를 보존하지 않는 정책에서는 관측 ID만으로 원본 재현이 불가능할 수 있다. 따라서 최소한 계산에 사용한 구간 시작·종료, 거래량 합계, 거래대금 합계, VWAP, 기준선, 표본 수를 이벤트에 저장한다. 값이 재현 불가능한 이벤트는 `AUDIT_INCOMPLETE`로 표시하고 운영 알림 통계에서 별도로 집계한다.

## 화면 표시 계약

사용자 화면은 후보의 존재와 신호의 확정을 혼동시키지 않는다.

- `OBSERVED`: “상승률 TOP 100 관측”으로 표시
- `PRIORITIZED`: “집중 조회 대상”으로 표시
- `CONFIRMED`: “반복 관측 확인”으로 표시
- `QUALIFIED`: “조건 충족 후보”로 표시하며 투자 추천으로 표현하지 않음
- `ATTENTION`: “추가 확인 필요”로 표시
- `STALE`, `NO_RANKING_DATA`, `DEGRADED`: 정상 후보 목록과 별도 상태 영역에 표시

각 카드에는 회사명·티커·거래소·세션·관측 시각·데이터 나이·점수·점수 근거를 표시한다. 숫자만 있는 순위표는 제공하지 않으며, 사용자가 차트를 열면 동일한 `evaluationVersion`의 입력 시각과 현재 차트 데이터 시각을 함께 보여준다.

관리자 화면에는 사용자 화면보다 상세한 원인을 제공한다.

- 시장별 TOP 100 원천 건수와 필터 탈락 건수
- 후보 큐 깊이와 priority 구간별 종목 수
- KIS endpoint별 호출·병합·지연·실패·backoff 상태
- 상태별 후보 수와 마지막 전이 시각
- 현재 임계값 버전과 shadow 정책 결과

이 표시 계약을 통해 “데이터가 들어왔는지”, “조회 우선순위가 올랐는지”, “반복 검증을 통과했는지”, “알림 가능한 상태인지”를 한 화면에서 구분한다.

## 모놀리스 운영 경계

운영 배포 단위는 끝까지 하나의 모놀리식 애플리케이션 프로세스다. 탐지 worker를 별도 컨테이너·서버·큐 소비자로 분리하지 않고, 동일 Next.js 런타임이 제공하는 애플리케이션 내부 singleton으로 실행한다.

- 프로세스 시작 시 명시적 중지값(`INTRADAY_DETECTION_ENABLED=false`)과 시장 캘린더를 확인한 뒤 worker를 한 번만 기동한다.
- 개발 HMR이나 모듈 재평가로 timer가 중복 생성되지 않도록 전역 singleton에 실행 핸들과 `startedAt`을 보관한다.
- HTTP 요청은 worker를 새로 만들거나 tick을 직접 실행하지 않고, 메모리 상태의 읽기 전용 snapshot만 사용한다.
- `SIGTERM`·`SIGINT` 수신 시 신규 KIS 호출을 받지 않고 in-flight 요청의 제한 시간 내 종료를 기다린 뒤 timer와 semaphore를 해제한다.
- worker 장애가 웹 서버 기동 실패로 번지지 않도록 tick 단위로 격리한다. 장애 시 `DEGRADED`를 기록하고 지수 backoff 후 재개한다.
- systemd는 동일 애플리케이션 프로세스의 재시작만 담당한다. 재시작 후에는 `WARMING_UP`으로 시작하고, 신선한 거래소별 TOP 100 수집과 최소 2회 관측을 완료하기 전에는 알림을 만들지 않는다.

이 경계에서 메모리는 단일 프로세스 안에서만 유효하므로 프로세스 재시작·배포·OOM 시 소실될 수 있다. 따라서 메모리에만 있는 후보를 확정 이벤트로 간주하지 않으며, 확정 전이·호출량·장애 이력은 PostgreSQL에 기록해 운영 관찰과 재시작 후 검증에 사용한다. 멀티 프로세스 실행이나 수평 확장이 필요해지는 시점에는 이 설계를 그대로 확장하지 않고 Redis 또는 별도 coordinator 도입을 먼저 재검토한다.

## 운영 기동·헬스 계약

모놀리식 프로세스의 웹 상태와 장중 탐지 상태는 별도로 판정한다. `/api/health`가 `200`이어도 탐지 worker가 멈춰 있을 수 있으므로, 관리자 디버깅 API는 아래 worker 상태를 함께 반환해야 한다.

```json
{
  "worker": "RUNNING",
  "pid": 1234,
  "startedAt": "2026-09-12T00:00:00.000Z",
  "lastTickAt": "2026-09-12T01:00:00.000Z",
  "lastSuccessfulSnapshotAt": "2026-09-12T00:59:45.000Z",
  "snapshotAgeSeconds": 15,
  "queueDepth": 12,
  "inflight": 3,
  "consecutiveFailures": 0
}
```

- `RUNNING`은 worker가 기동됐다는 뜻만이 아니라 최근 tick·스냅샷·큐 처리가 모두 허용된 지연 이내라는 뜻으로 정의한다.
- `snapshotAgeSeconds`가 60초를 넘으면 `STALE`, 최근 tick이 90초를 넘으면 `DEGRADED`로 판정하고 신규 알림을 차단한다.
- `INTRADAY_DETECTION_ENABLED=false` 또는 세션 외 시간에는 `DISABLED`·`OUTSIDE_SESSION`을 정상 상태로 표시한다. 환경변수 미설정은 활성 상태로 간주하며, 이를 장애로 재시작하지 않는다.
- 운영 기동 시 필수 환경변수의 존재 여부만 검증하고 값은 출력하지 않는다. DB 연결과 KIS 설정 검증에 실패하면 웹 서버는 유지하되 worker는 `DEGRADED`로 시작한다.
- 상태 endpoint는 메모리 상태와 PostgreSQL의 마지막 실행 기록을 함께 사용하되, 메모리의 현재 tick 시각을 DB 기록보다 우선한다.

이 계약을 systemd 상태 확인, 관리자 대시보드, 운영 알람이 공통으로 사용해야 “서버 정상”과 “실시간 탐지 정상”을 혼동하지 않는다.

## 돈이 움직이는 종목의 최종 판정식

상승률 TOP 100은 후보군을 만드는 입력일 뿐이다. 최종 판정은 같은 거래소·같은 세션·같은 통화 안에서 아래 순서로 수행한다.

```text
eligible =
  freshRanking
  AND regularSession
  AND commonStock
  AND marketCap > 0
  AND intervalVolume > 0
  AND baselineVolume > 0
  AND baselineTradeValue > 0

metrics:
  relativeVolume    = intervalVolume / median(baselineVolume)
  relativeTradeValue = intervalTradeValue / median(baselineTradeValue)
  turnoverRate      = intervalTradeValue / fixedMarketCap
  flowAcceleration  = relativeTradeValue / max(previousRelativeTradeValue, 1)

qualified = eligible
  AND relativeVolume >= configuredMinRelativeVolume
  AND turnoverRate >= configuredMinTurnoverRate
  AND priceClose >= vwap
  AND priceClose >= priceOpen
  AND consecutivePasses >= 2
```

`relativeTradeValue`와 `turnoverRate`는 서로 대체하지 않는다. 거래량은 많지만 저가 체결로 거래대금이 작은 경우, 또는 시총이 작아 비율만 과도하게 커진 경우를 각각 구분하기 위해 둘 다 보존한다. `flowAcceleration`은 조회 우선순위에만 반영하고 단독 확정 조건으로 사용하지 않는다.

다음 입력은 `qualified=false`로 고정한다.

- 순위 응답이 비어 있거나 `STALE`인 경우
- 정규장 외 세션, 거래정지·비정상 상품·보통주 판정 실패
- 시총·거래량·기준선·VWAP 중 하나라도 누락되거나 통화가 불일치하는 경우
- 가격이 하락하면서 거래대금만 급증한 경우 (`ATTENTION`으로 별도 표시)
- 첫 관측이거나 기준선 표본이 부족한 경우 (`WARMING_UP` 또는 `BASELINE_INSUFFICIENT`)

관리자 임계값 변경은 `thresholdVersion`을 증가시키고 후보의 연속 충족 횟수를 초기화한다. 이로써 이전 기준에서 통과한 상태를 새 기준의 확정 신호로 잘못 재사용하지 않는다.

## 후보 큐의 호출 예산과 과부하 제어

후보가 최대 300개라는 메모리 상한은 300개를 매 tick 조회한다는 뜻이 아니다. 각 후보의 `nextCheckAt`과 거래소별 호출 예산을 먼저 적용한다.

```text
due = candidates where nextCheckAt <= now
due = sort(priority DESC, dataAge DESC, lastCheckedAt ASC)
allowed = min(due.length, perTickBudget, globalInflightCapacity - inflight)
execute(due.slice(0, allowed))
defer(rest, reason = "BUDGET_EXCEEDED")
```

기본 운영값은 `globalInflightCapacity=20`, tick=10초로 둔다. 후보별 기본 주기는 priority 100 이상 10초, 60 이상 30초, 그 외 120초이므로 이론상 최대 후보별 호출량은 각각 `6/min`, `2/min`, `0.5/min`으로 계산한다. 실제 예산은 거래소 TOP 100 갱신 호출과 상세·VWAP 호출을 합산해 다음처럼 산정한다.

```text
perMinuteBudget
  = min(KIS_rate_limit_per_minute, 10 * 60) * safetyFactor(0.70)
    - rankingCallsPerMinute
    - reservedRetryBudget
```

예산이 부족하면 낮은 priority부터 다음 tick으로 지연한다. 지연된 후보는 `DEFERRED_BY_BUDGET`를 기록하지만 `QUALIFIED`로 승격하지 않으며, 데이터 나이가 60초를 넘으면 `STALE`로 전환한다. 429·5xx가 발생한 endpoint는 해당 endpoint 예산을 즉시 0으로 낮추고 backoff 후 probe 1건만 허용한다. 다른 endpoint와 거래소의 조회는 계속 진행한다.

관리자 지표에는 tick별 `planned`, `executed`, `deferred`, `coalesced`, `throttled`, `failed`를 저장한다. `deferred/planned`가 5분 이동평균 20%를 넘거나 `snapshotAgeSeconds`가 60초를 넘으면 운영 상태를 `DEGRADED`로 표시한다. 이 수치는 탐지 품질을 보존하기 위한 fail-closed 기준이며, 화면을 채우기 위해 호출 예산을 무시하지 않는다.

## 운영 롤아웃과 자동 중단

상주 worker는 한 번에 전체 거래소·전체 후보에 적용하지 않는다. 모놀리스 프로세스의 CPU·메모리·KIS 호출량을 관찰하면서 다음 단계로 승격한다.

| 단계 | 범위 | 승격 조건 | 자동 중단 조건 |
|---|---|---|---|
| `SHADOW` | TOP 100 수집과 점수 계산만 수행 | 30분 동안 예외·메모리 누수 없음 | 프로세스 오류 또는 메모리 증가 |
| `ONE_MARKET` | 거래소 1곳의 후보 상세 조회 | 30분 동안 429=0, stale 비율 5% 미만 | 429·5xx 급증, queue 지연 |
| `ALL_MARKETS` | 활성 거래소 전체 | 1시간 동안 예산·지연·메모리 기준 통과 | 아래 fail-safe 중 하나 |

자동 중단은 worker만 `STOPPING` 또는 `DEGRADED`로 전환하며 웹 서버와 기존 DB 조회는 계속 제공한다. 다음 조건 중 하나라도 2회 연속 발생하면 신규 후보 상세 조회와 알림을 멈춘다.

- KIS 429 비율이 5분간 5% 초과
- 최근 5분 `deferred/planned`가 50% 초과
- TOP 100 스냅샷 stale 비율이 거래소 1곳이라도 60초 초과
- in-flight 요청이 20개에서 30초 이상 해소되지 않음
- Node.js heap 사용량이 `INTRADAY_MEMORY_MAX_MB`의 85% 초과

자동 중단 후에는 60초 backoff 뒤 TOP 100 1회만 probe한다. probe가 신선하고 호출 오류가 없으면 `WARMING_UP`으로 복귀하며, 최소 2회 연속 관측 전에는 `QUALIFIED`와 알림을 재개하지 않는다. 모든 전환은 `reason`, `observedAt`, `evaluationVersion`과 함께 PostgreSQL에 기록한다.

## 탐지 품질 SLO와 검증 지표

운영 성공은 API 호출 성공률만으로 판단하지 않는다. 정규장 중 거래소별로 다음 SLO를 측정한다.

| 지표 | 목표 | 경고 | 측정 기준 |
|---|---:|---:|---|
| 신선한 TOP 100 비율 | 99% 이상 | 95% 미만 | `snapshotAgeSeconds <= 60`인 tick / 전체 tick |
| 후보 큐 처리율 | 95% 이상 | 80% 미만 | 예산 내 `executed` / `planned` |
| 상세 조회 p95 지연 | 3초 이하 | 6초 초과 | 요청 시작부터 응답 검증 완료까지 |
| 확정 판정 지연 p95 | 60초 이하 | 120초 초과 | 첫 조건 충족 관측부터 `QUALIFIED`까지 |
| 잘못된 stale 확정 | 0건 | 1건 이상 | stale 데이터로 생성된 확정 이벤트 |
| 중복 확정 알림 | 0건 | 1건 이상 | 동일 세션·코드·thresholdVersion의 중복 전송 |

SLO는 거래소·세션별로 분리해 집계한다. 한 거래소의 KIS 장애가 정상 거래소의 품질 수치에 섞이지 않도록 하며, 장외·`DISABLED`·`WARMING_UP` 구간은 분모에서 제외하고 별도 상태 시간으로 기록한다. 경고가 5분 이상 지속되면 `DEGRADED`, stale 확정 또는 중복 알림이 한 건이라도 발생하면 즉시 신규 알림을 차단하고 `AUDIT_INCOMPLETE`로 남긴다.

관리자 화면에는 현재값뿐 아니라 최근 5분·30분·당일 누적값과 목표 대비 편차를 함께 표시한다. 이 지표를 기준으로 SHADOW→ONE_MARKET→ALL_MARKETS 승격을 판단하며, 테스트 환경에서 통과한 값만으로 운영 품질을 추정하지 않는다.

## 관리자·내부 디버깅 API 계약

운영 장애를 재현할 때 화면의 후보 목록만으로는 부족하므로, 인증된 관리자 API와 내부 점검 API는 같은 읽기 전용 snapshot을 반환해야 한다. 권장 경로는 `GET /api/debug/intraday-flow`이며, 요청 시점을 기준으로 한 번 캡처한 `snapshotId`를 응답 전체에 사용한다.

```json
{
  "ok": true,
  "snapshotId": "20260912-010000-0001",
  "worker": { "status": "RUNNING", "lastTickAt": "...", "queueDepth": 12 },
  "markets": [{ "market": "NAS", "session": "REGULAR", "ageSeconds": 8, "sourceCount": 100, "fresh": true }],
  "filters": { "source": 100, "commonStock": 86, "liquidity": 72, "ratioEligible": 31 },
  "queue": { "planned": 20, "executed": 18, "deferred": 2, "inflight": 3 },
  "candidates": [{ "market": "NAS", "code": "ABC", "priority": 112, "state": "PRIORITIZED", "reasons": ["TURNOVER_RATE", "VWAP_ABOVE"] }],
  "quality": { "evaluationVersion": "...", "dataQuality": "FRESH", "slo": { "freshRankingRate": 1, "deferredRate": 0.1 } }
}
```

- 응답에는 API key, access token, webhook URL, 원본 `User-Agent` 등 비밀·개인정보를 포함하지 않는다.
- `snapshotId` 생성 후 각 시장·필터·큐·후보를 같은 시점에서 읽어 서로 다른 tick의 값을 섞지 않는다.
- 후보 상세는 최대 300개, 이유 배열은 사전 정의된 enum만 반환하며 원본 KIS 응답 전문은 별도 권한의 서버 로그에서만 확인한다.
- 데이터가 부분적으로 실패하면 `ok=true`를 유지하되 `complete=false`, 시장별 `dataQuality`, `errorCode`를 반환한다. HTTP 200 정상 빈 응답은 `NO_RANKING_DATA`로 표시한다.
- 이 API는 상태를 변경하지 않으며, 실제 KIS 재조회·worker tick 강제 실행·토큰 초기화는 별도 명시적 관리자 작업으로 분리한다.

## 탐지 결과 스키마 버전 관리

사용자 화면·관리자 화면·운영 로그가 서로 다른 해석을 하지 않도록 디버깅 응답과 확정 이벤트에 `schemaVersion`을 포함한다. 필드 추가는 하위 호환으로 처리하지만, 상태명·점수 의미·시간 단위·통화 의미를 바꾸는 변경은 새 major 버전과 `evaluationVersion` 갱신을 요구한다.

필수 규칙:

- 시간은 내부 epoch milliseconds, API 표시용 ISO-8601을 함께 제공하며 필드명을 혼용하지 않는다.
- 금액은 `currency`를 반드시 동반한다. 국내 `KRW`, 해외 `USD` 외 값은 유효하지 않은 입력으로 처리한다.
- `priority`는 조회 우선순위, `score`는 구성된 탐지 점수, `state`는 품질·반복 관측 상태로 각각 독립 의미를 갖는다.
- 신규 enum을 추가할 때 기존 클라이언트가 알 수 없는 상태를 안전하게 `UNKNOWN_STATE`로 표시하도록 한다.
- `schemaVersion`, `evaluationVersion`, `observedAt`, `receivedAt`, `dataQuality`가 없는 응답은 확정 이벤트로 저장하지 않는다.

배포 전에는 이전 버전과 새 버전의 동일 snapshot을 비교해 후보 수, 상태 전이, 점수, 필터 탈락 사유가 의도대로만 달라지는지 확인한다. 차이가 설명되지 않으면 worker를 `SHADOW`에 유지하고 운영 알림에는 연결하지 않는다.

## 기업행위와 기준선 무결성

액면분할·액면병합·배당락·거래소 종목코드 변경이 발생하면 가격과 거래량의 시계열이 단절될 수 있다. 조정되지 않은 과거 데이터를 기준선에 섞으면 실제 자금 유입이 아닌 수치 변화를 RVOL·거래대금 급증으로 오인한다.

- KIS 또는 로컬 기준정보에 기업행위 조정 여부와 유효일이 있으면 관측·기준선에 `corporateActionVersion`과 `adjustmentDate`를 포함한다.
- 기업행위 유효일 전후의 기준선은 같은 조정 상태의 구간만 사용한다. 조정 상태가 섞이면 `BASELINE_INVALID`로 표시한다.
- 분할·병합 당일과 다음 거래일은 최소 2회 관측을 다시 쌓기 전까지 `QUALIFIED`로 승격하지 않는다.
- 코드 변경·상장 이전은 동일 종목으로 자동 병합하지 않고 기존 코드의 관측을 종료한 뒤 새 코드로 warm-up한다.
- 기업행위 정보가 확인되지 않은 상태에서 가격·거래량 급변이 발생하면 후보 우선순위는 유지하되 확정·알림은 차단한다.

관리자 디버깅 응답과 확정 이벤트에는 `corporateActionState`(`NONE`, `PENDING`, `ADJUSTED`, `UNKNOWN`)와 기준선에 사용된 표본의 조정 상태를 반환한다. 이 필드가 `UNKNOWN`인 이벤트는 성과 평가에서도 별도 분리한다.

## 의사결정 로그

| 결정 | 선택 | 이유 | 재검토 조건 |
|---|---|---|---|
| 상태 저장소 | 프로세스 메모리 + PostgreSQL | 단일 모놀리스에서 가장 낮은 지연과 단순한 운영 | 수평 확장·멀티 프로세스 전환 |
| 후보 입력 | 거래소별 상승률 TOP 100 | 장중 관심 종목을 제한해 KIS 호출량을 통제 | TOP 100 API 품질·커버리지 부족이 반복될 때 |
| 실시간성 | KIS 최신 관측의 신선도 관리 | KIS 순위 API를 틱 데이터로 오인하지 않음 | 실시간 체결 스트림 도입 가능 시 |
| 확정 기준 | 2회 연속 관측 + 거래대금·RVOL·VWAP | 단일 응답 오탐과 빈 응답 오판 방지 | 백테스트·운영 SLO가 기준 변경을 지지할 때 |
| 실패 처리 | fail-closed, 알림 차단 | stale·부분 장애를 자금 유입으로 오인하지 않음 | 데이터 품질을 보장하는 대체 원천 확보 시 |
| 저장 범위 | 확정 이벤트와 요약만 DB 저장 | 1분봉 원본 대량 저장에 따른 비용·쓰기 병목 회피 | 감사 재현성 요구가 원본 보존을 요구할 때 |

새로운 구현이나 임계값 변경은 이 표의 결정과 충돌하는지 먼저 검토하고, 충돌하면 코드보다 먼저 본 문서의 결정과 재검토 조건을 갱신한다.

## 시간 기준과 시계 오차 처리

실시간 판정의 기준 시각은 서버의 `Date.now()` 하나로 단정하지 않는다. 각 관측에는 `sourceObservedAt`, `receivedAt`, `qualifiedAt`을 분리해 기록하고, 모든 내부 비교는 UTC epoch milliseconds로 수행한다.

- 거래소 캘린더가 정의한 세션 경계를 기준으로 `OPENING_AUCTION`, `REGULAR`, `CLOSING_WINDOW`를 판정한다.
- KIS 응답에 원천 관측 시각이 없으면 `receivedAt`만 신뢰하며 `sourceObservedAt`으로 승격하지 않는다.
- 서버 시계가 NTP 기준과 5초 이상 차이나면 `CLOCK_UNCERTAIN`을 기록하고 신선도 기반 확정을 중단한다.
- `receivedAt - sourceObservedAt`가 60초를 초과하면 해당 관측은 stale이며, 이전 관측을 복제해 보정하지 않는다.
- 서로 다른 거래소의 관측은 수신 시각이 다를 수 있으므로 전체 시장을 하나의 timestamp로 표시하지 않고 거래소별 age를 유지한다.
- 세션 경계 ±2분은 `SESSION_BOUNDARY` 완충 구간으로 두고, 이 구간의 단일 관측은 `QUALIFIED`로 승격하지 않는다.

운영 지표에는 `clockOffsetMs`, 원천-수신 지연 p50/p95, 세션별 stale 비율을 추가한다. 시간 정보가 불완전한 이벤트는 값 자체를 버리지는 않되 `INCOMPLETE`로 저장해 운영 알림과 성과 분석에서 분리한다.

## 재현·백테스트와 성과 평가

새 임계값이나 점수 가중치를 운영에 바로 적용하지 않는다. PostgreSQL에 저장된 확정 이벤트 요약과 계보 정보를 이용해 동일 입력에 대한 정책 결과를 재생하고, 기존 정책과 `SHADOW` 정책을 비교한다. 원본 1분봉이 없는 구간은 정밀 재현 대상에서 제외하고 `AUDIT_INCOMPLETE`로 집계한다.

평가 단위는 `market + sessionDate + evaluationVersion`이며, 다음 결과를 함께 기록한다.

- 탐지 수, `QUALIFIED` 수, `ATTENTION` 수, stale·불완전 입력 수
- 첫 관측부터 확정까지의 지연 p50/p95
- 확정 뒤 5·15·30분의 가격 방향과 거래대금 지속 여부
- 동일 종목 중복 탐지율, 후보 큐 지연률, 시장별 누락률
- 임계값별 precision·recall을 산출할 수 있는 표본 수와 표본 부족 여부

여기서 가격 방향은 성과 참고 지표일 뿐 투자 수익률 보장으로 해석하지 않는다. 미래 데이터를 사용하지 않도록 평가 시점 이후의 관측만 결과 계산에 사용하고, 당시 존재하지 않았던 종목 메타데이터·시총·유통주식수를 사후 값으로 대체하지 않는다. 표본이 부족하거나 데이터 계보가 끊긴 기간은 점수에 포함하지 않고 `INSUFFICIENT_SAMPLE`로 표시한다.

운영 승격 기준은 최소 5개 거래일과 시장별 100건 이상의 완전한 관측 표본, stale 확정 0건, 중복 확정 0건, 그리고 기존 정책 대비 호출 예산·신선도 SLO 악화 없음으로 한다. 이 조건을 충족하지 못하면 새 정책은 `SHADOW`에 남긴다.

## PostgreSQL 실행 이력·SLO 저장 구조

휘발성 후보와 큐는 메모리에 두되, 운영 검증에 필요한 최소 요약은 PostgreSQL에 저장한다. 기존 대형 캔들 테이블과 분리된 소형 append-only 테이블을 사용해 탐지 조회가 원천 데이터 적재와 경쟁하지 않게 한다.

```text
intraday_detection_runs
  run_id, process_id, mode, status, started_at, ended_at,
  config_version, error_code, created_at

intraday_detection_ticks
  run_id, tick_id, market, session, planned, executed, deferred,
  coalesced, throttled, failed, snapshot_age_ms, queue_depth,
  inflight, latency_p50_ms, latency_p95_ms, observed_at

intraday_detection_transitions
  run_id, market, code, from_state, to_state, reason,
  evaluation_version, observed_at, created_at
```

- `run_id`는 단일 모놀리스 프로세스의 기동마다 새로 만들고, `process_id`와 함께 저장한다.
- `tick_id`는 run 내부에서 단조 증가하며, 시장별 tick이 누락되거나 중복되는지 검증할 수 있어야 한다.
- `intraday_detection_ticks`는 시장·세션·관측 시각 인덱스를 두고 1년 보관한다. 원본 KIS 응답이나 1분봉 전체는 이 테이블에 저장하지 않는다.
- `intraday_detection_transitions`는 상태 전이와 중복 알림 검증에 사용하며 30일 이상 보관한다.
- 모든 쓰기는 worker tick을 막지 않도록 bounded write queue를 통과한다. DB 쓰기 실패 시 탐지는 계속하되 `AUDIT_INCOMPLETE`와 누락 개수를 메모리에 누적하고 다음 정상 tick에서 요약 기록한다.

관리자 API는 이 요약 테이블과 현재 메모리 snapshot을 합쳐 제공한다. 현재 메모리 값과 DB 마지막 기록의 시각이 다르면 어느 쪽이 최신인지 `source`와 `observedAt`을 명시하고, 오래된 DB 지표를 현재 상태처럼 표시하지 않는다.

### 실행 이력 인덱스와 보관

`intraday_detection_ticks`는 `observed_at` 월별 range partition 또는 동일 효과의 시간 기반 보관 전략을 사용한다. 파티션 도입 전에도 아래 인덱스 계약을 유지한다.

```text
ticks:        (market, session, observed_at DESC)
ticks:        (run_id, tick_id)
transitions:  (market, code, observed_at DESC)
transitions:  (evaluation_version, to_state, observed_at DESC)
runs:         (started_at DESC)
```

관리자 화면의 최근 5분·30분 조회는 시간 조건을 반드시 포함하고, 당일 조회도 상한 행 수를 둔다. 전체 기간을 매 요청마다 재집계하지 않으며, 일별 요약이 필요하면 별도 집계 작업으로 만든다. 보관 기간이 지난 파티션·행은 비동기 삭제하고 worker tick과 동일 트랜잭션으로 수행하지 않는다.
## 구현 로드맵과 완료 게이트

설계와 운영 활성화를 혼동하지 않도록 아래 순서로 구현한다. 각 단계의 게이트가 통과되지 않으면 다음 단계 코드는 배포하더라도 `SHADOW`에서만 동작한다.

1. `lib/intraday-memory-state.ts`에 snapshot·후보·큐의 원자 교체, 상한, stale 제거를 고정하고 단위 테스트를 완료한다.
2. `lib/us-top-rising-universe.ts`와 KIS 호출 계층에서 시장별 `sourceObservedAt`, `receivedAt`, `session`, `dataQuality`, `evaluationVersion`을 누락 없이 만든다.
3. 공통 내부 서비스 `lib/intraday-detection-worker.ts`를 추가해 10초 tick, TOP 100 TTL, 후보 예산, semaphore, graceful shutdown을 연결한다. 웹 route에서 worker를 직접 생성하지 않는다.
4. `intraday_detection_runs/ticks/transitions` Flyway migration과 bounded write queue를 연결하고 재시작·DB 쓰기 실패 테스트를 완료한다.
5. 관리자 `GET /api/debug/intraday-flow`에 현재 메모리와 DB 요약을 결합하고, 민감정보 제거·부분 실패·snapshot 일관성 테스트를 완료한다.
6. `SHADOW → ONE_MARKET → ALL_MARKETS` 순서로 운영 활성화하고, SLO·자동 중단 조건을 실제 실행 로그로 검증한다.

최종 완료 게이트는 (a) 단일 모놀리스 프로세스의 중복 worker 0건, (b) 최소 5거래일의 시장별 완전 관측 표본, (c) stale 확정·중복 알림 0건, (d) KIS 호출 예산과 지연 SLO 충족, (e) 재시작 후 warm-up 복귀 증거다. 하나라도 없으면 목표는 `DESIGN_IN_PROGRESS`로 유지한다.

## 관리자 제어와 감사 규칙

관리자는 worker를 재시작하거나 KIS 토큰을 초기화하지 않고도 시장별 탐지를 일시 중지할 수 있어야 한다. 제어값은 PostgreSQL에 저장하고 메모리 worker는 tick 시작 시 읽어 적용한다.

- 전역 `enabled`, 시장별 `enabled`, `mode`(`SHADOW`, `ACTIVE`), `minPriority`, `perMinuteBudget`를 설정할 수 있다.
- 설정 변경은 다음 tick부터 적용하며 진행 중인 요청을 강제 취소하지 않는다. 취소가 필요하면 별도 graceful stop을 사용한다.
- `enabled=false`는 `DISABLED`로 기록하고 기존 메모리 후보를 확정·알림하지 않는다. 재활성화하면 새 TOP 100과 warm-up부터 시작한다.
- 자동 fail-safe가 발동한 뒤 관리자가 강제 재개할 경우 `overrideReason`, 관리자 식별자, 만료 시각을 필수로 입력한다. override는 최대 30분 후 자동 만료된다.
- 모든 변경은 이전 값·새 값·변경자·사유·적용 시각·`configVersion`을 감사 로그에 남긴다.
- 설정 조회 API는 현재값과 마지막 적용 tick을 반환하지만 secret·토큰·원본 KIS 응답은 반환하지 않는다.

자동 중단 상태에서 관리자가 강제 재개해도 `STALE`, `CLOCK_UNCERTAIN`, `NO_RANKING_DATA`, `BASELINE_INVALID` 품질 게이트를 우회할 수 없다. 관리자 override는 실행을 재개할 뿐 데이터 무결성·확정 조건을 낮추지 않는다.

## 운영 전 최종 체크리스트

- [ ] 단일 모놀리스 프로세스에서 worker가 정확히 한 번만 기동되는 로그가 있다.
- [ ] 정규장 캘린더와 거래소별 세션 경계가 현재 운영 시간대와 일치한다.
- [ ] TOP 100의 원천 시각·수신 시각·신선도·빈 응답 상태가 시장별로 반환된다.
- [ ] 보통주·거래정지·비정상 상품·기업행위·통화 검증이 확정 조건보다 먼저 실행된다.
- [ ] 호출 예산·동시성·429/5xx backoff가 실제 KIS 응답에서 동작한다.
- [ ] 최소 2회 연속 관측 전 `QUALIFIED`·알림이 발생하지 않는다.
- [ ] 메모리 snapshot과 DB 실행 이력의 `run_id`, `tick_id`, `evaluationVersion`이 연결된다.
- [ ] stale 확정·중복 알림·warm-up 재시작 시나리오의 통합 테스트가 통과한다.
- [ ] 관리자 디버깅 API가 부분 실패와 민감정보 비노출을 검증한다.
- [ ] 5거래일·시장별 100건 이상의 완전 관측 표본과 SLO 결과가 확보된다.

체크리스트 미충족 상태에서는 운영 알림을 `ACTIVE`로 전환하지 않고 `SHADOW` 또는 `DISABLED`로 유지한다.

## 원천 장애와 fallback 우선순위

정규장 탐지는 원천 데이터의 최신성을 우선한다. fallback은 화면을 채우기 위한 대체 데이터가 아니라 장애 상태를 명확히 표시하기 위한 제한적 복구 경로다.

1. 같은 tick의 KIS 정상 응답과 유효한 시장별 시각을 사용한다.
2. KIS가 HTTP 200·`rt_cd=0`이지만 빈 배열을 반환하면 `NO_RANKING_DATA`로 종료한다.
3. 일시적 429·5xx·timeout은 endpoint backoff와 단일 probe만 수행한다.
4. 마지막 성공 snapshot은 관리자 진단용으로만 보존하며, 현재 `QUALIFIED`·알림·신규 우선순위 계산에는 사용하지 않는다.
5. 대체 원천이 명시적으로 검증되지 않은 경우 Mock·임의 보정·이전 세션 데이터 재사용을 금지한다.

시장별로 원천 상태가 다르면 정상 시장은 계속 처리하고 장애 시장만 `DEGRADED` 또는 `NO_RANKING_DATA`로 표시한다. 전체 응답의 `complete`는 모든 요청 시장이 신선한 snapshot을 확보한 경우에만 true이며, 일부 시장의 성공을 전체 성공으로 포장하지 않는다.

## 자금 이동 방향과 상승 신호의 분리

거래대금이 크게 증가했다는 사실은 매수세와 매도세가 만났다는 뜻이지, 곧바로 상승을 의미하지 않는다. 따라서 `MONEY_FLOW`와 `UPWARD_PRESSURE`를 하나의 상태로 합치지 않는다.

```text
moneyFlow = eligible
  AND relativeTradeValue >= configuredMinRelativeTradeValue
  AND turnoverRate >= configuredMinTurnoverRate
  AND consecutivePasses >= 2

direction:
  UPWARD_PRESSURE   = close > open AND close >= vwap
  DOWNWARD_PRESSURE = close < open AND close < vwap
  MIXED             = moneyFlow AND direction conditions are inconclusive
```

- `UPWARD_PRESSURE`만 사용자에게 상승 자금 유입 후보로 표시하고, `DOWNWARD_PRESSURE`는 매도 압력 후보로 별도 표시한다.
- 양방향 조건이 섞이거나 가격·VWAP 방향이 불명확하면 `MIXED`로 표시하며 매수 추천으로 표현하지 않는다.
- `MONEY_FLOW`는 거래대금·RVOL·신선도·반복 관측을 만족한 공통 상태이고, 방향 분류는 그 위에 붙는 별도 속성이다.
- 관리자와 이벤트에는 `flowDirection`, `flowEvidence`, `priceVsVwap`, `closeVsOpen`을 함께 저장한다.

이 분리로 “거래가 활발한 종목”과 “상승 방향으로 자금이 유입되는 종목”을 구분하고, 가격 하락 중 거래대금 급증을 오탐 상승 신호로 만들지 않는다.

## TOP 100 이탈 유예와 후보 수명

순위 경계에서 한 번 이탈한 종목을 즉시 삭제하지 않는다. 단일 순위 응답의 흔들림과 실제 자금 이동 종료를 구분하기 위해 후보에 `lastTop100At`, `top100Misses`, `lastQualifiedAt`을 유지한다.

- TOP 100에서 1회 이탈한 후보는 60초 동안 `EXIT_GRACE`로 유지하되, priority를 낮추고 신규 후보보다 뒤에 배치한다.
- 유예 기간 중 다시 진입하면 miss 횟수를 0으로 되돌리고 기존 연속 관측을 이어간다.
- 60초 내 재진입하지 않거나 연속 2회 이탈하면 후보 큐에서 제거한다. 단, 확정 이벤트의 사후 관찰이 진행 중이면 최대 5분까지 저빈도 확인만 허용한다.
- 유예 후보는 TOP 100 신규 후보보다 높은 priority를 받을 수 없으며, 호출 예산이 부족하면 먼저 지연한다.
- 다음 세션으로 유예·확정 후보를 이월하지 않고 `MARKET_CLOSED`로 종료한다.

이 정책은 TOP 100의 churn을 흡수하면서도 300개 후보 상한과 호출 예산을 유지한다. 유예로 인해 추가된 호출·재진입·최종 제거 사유는 tick 지표와 상태 전이에 기록한다.

## 후보 starvation 방지와 priority aging

호출 예산이 반복해서 부족하면 낮은 priority 후보가 영구적으로 조회되지 않을 수 있다. priority 자체를 임의로 높여 중요한 후보를 밀어내지 않도록, 대기 시간에 의한 제한적 aging을 별도 적용한다.

```text
effectivePriority = min(
  priority + floor(waitSeconds / 30) * agingStep,
  priority + agingCap
)
```

- `agingStep`과 `agingCap`은 관리자 설정으로 두되, aging만으로 최우선 priority 구간을 초과하지 않게 한다.
- 후보가 최대 120초 연속 지연되면 `STARVATION_RISK`를 기록하고 다음 예산에서 1회 우선 처리한다.
- 데이터 age가 60초에 도달한 후보는 priority와 무관하게 `STALE`로 전환하며 과거 값으로 확정하지 않는다.
- `EXIT_GRACE` 후보와 신규 TOP 100 후보의 aging은 별도 계산해, 이탈 후보가 신규 후보를 무한히 밀어내지 않게 한다.
- 실행·지연·강제 처리 사유를 tick 지표에 남겨 priority 변경이 탐지 결과에 미친 영향을 재현한다.

이 방식은 호출 예산을 초과하지 않으면서 장시간 대기 후보를 주기적으로 관찰하고, 후보 큐의 공정성과 신선도 사이의 균형을 유지한다.

## 정책·코드 버전 롤백

탐지 정책과 worker 코드는 `thresholdVersion`, `indicatorVersion`, `schemaVersion`으로 식별한다. 운영에서 새 버전의 SLO가 악화되거나 stale·중복 확정이 발생하면 메모리 상태만 되돌리지 않고, 동일한 버전 조합을 사용하는 이전 정책으로 원자적으로 복귀한다.

1. 현재 run을 `ROLLBACK_REQUESTED`로 기록하고 신규 확정·알림을 중지한다.
2. 진행 중 요청이 끝나면 후보 큐를 비우고 이전 `configVersion`을 로드한다.
3. 새 TOP 100 snapshot을 수집해 이전 버전의 기준선을 다시 만든다. 이전 버전의 후보·VWAP를 그대로 재사용하지 않는다.
4. `WARMING_UP`에서 최소 2회 관측과 품질 게이트를 통과한 뒤에만 탐지를 재개한다.
5. rollback 원인·전후 버전·영향 받은 시장·중지 시간·복귀 시각을 PostgreSQL에 저장한다.

롤백은 데이터 삭제나 Git history 변경이 아니며, 이미 기록된 이벤트를 조작하지 않는다. 이전 버전에서도 SLO가 충족되지 않으면 `DISABLED`로 유지하고 운영자가 원인을 해결할 때까지 신규 알림을 만들지 않는다.

## 시가총액 메타데이터 신선도

장중 매 tick마다 시가총액을 KIS에 재조회하지 않는다. 대신 장외 갱신한 고정 시가총액 snapshot을 메모리에 두고, 그 값의 기준일과 갱신 시각을 후보 계보에 연결한다.

- `marketCapValue`, `marketCapCurrency`, `marketCapAsOf`, `marketCapRefreshedAt`을 하나의 메타데이터 레코드로 취급한다.
- 같은 시장·통화의 시가총액만 거래대금 비율 계산에 사용하며, 누락·통화 불일치·기준일 미상은 `MARKET_CAP_INVALID`로 차단한다.
- 기준일이 운영 설정의 허용 기간을 넘으면 후보 우선순위는 계산할 수 있어도 `QUALIFIED`와 알림에는 사용하지 않는다.
- 기업행위·상장주식수 변경이 확인되면 해당 snapshot을 `PENDING`으로 만들고 장외 메타데이터 갱신 후 다시 warm-up한다.
- 메타데이터 갱신 실패 시 기존 값을 최신값으로 덮어쓰지 않으며, 이전 값은 진단용으로만 보존한다.

이 구조로 장중 KIS 호출량은 늘리지 않으면서도 “시총 대비 거래대금” 계산에 사용된 고정값의 기준일과 품질을 재현할 수 있다.

허용 기간의 기본값은 국내 5거래일, 해외 10거래일로 둔다. 이는 장중 재조회 없이 사용하는 운영 기본값이며, 설정 변경 시 `marketCapFreshnessVersion`을 증가시킨다. 허용 기간을 넘긴 값은 `marketCapAgeExceeded`로 표시하고 거래대금 비율·우선순위 계산에는 보조값으로만 남기며 `QUALIFIED`와 알림에는 사용하지 않는다. 기업행위나 상장주식수 변경이 탐지되면 기간이 남아 있어도 즉시 만료 처리한다.

## 세션 종료와 다음 세션 격리

거래소별 정규장 종료 시 해당 세션의 메모리 후보를 다음 세션으로 이어서 사용하지 않는다. 종료는 시장별로 독립 처리하며, 다른 거래소가 아직 정규장인 동안 전체 worker를 종료하지 않는다.

- `CLOSING_WINDOW` 진입 시 신규 후보 승격과 알림을 제한하고, 진행 중인 요청만 제한 시간 내 마무리한다.
- 세션 종료 시 해당 시장의 후보 큐·연속 충족 횟수·VWAP 누적값을 폐기하고 `MARKET_CLOSED` 전이와 종료 tick을 기록한다.
- 다음 세션 시작 시 새 `sessionId`를 발급하고, 이전 세션의 `TOP 100`, 기준선, score, cooldown을 재사용하지 않는다.
- 장 마감 후 도착한 응답은 `OUT_OF_SESSION`으로 버리고 현재 세션의 상태를 갱신하지 않는다.
- 거래소 휴장·서킷브레이커·거래정지 구간은 `MARKET_PAUSED`로 표시하며 장애나 후보 이탈로 계산하지 않는다.

세션 전환 검증은 `market + sessionId + observedAt`의 순서와 단조 증가를 확인한다. 순서가 뒤섞인 응답은 저장하지 않고 `OUT_OF_ORDER_OBSERVATION`으로 기록한다.
## 확정 이벤트 idempotency와 dedupe

동일한 후보가 여러 tick에서 조건을 충족하거나 worker가 재시도되어도 확정 이벤트와 알림은 한 번만 생성한다. 이벤트 키는 `market + sessionId + code + thresholdVersion + qualifiedBucket`으로 만들고, `qualifiedBucket`은 확정 시각을 10분 단위로 정규화한다.

- PostgreSQL에 이벤트 키 unique constraint를 두고 insert conflict는 성공적인 중복 처리로 간주한다.
- DB insert가 성공한 경우에만 알림 전송 대기 상태를 만들며, 전송 재시도도 별도 delivery key로 멱등 처리한다.
- 메모리 dedupe는 빠른 중복 차단용일 뿐 권위 있는 기준이 아니며, 재시작 후에도 PostgreSQL unique constraint가 중복을 막는다.
- threshold·indicator·schema 버전이 바뀌면 새 이벤트 계보로 취급하되, 동일 snapshot과 동일 버전의 재시도는 기존 이벤트를 재사용한다.
- dedupe 충돌·재시도 횟수·최초 생성 시각·마지막 관측 시각은 운영 지표와 감사 로그에 남긴다.

이 규칙은 중복 알림을 0건으로 유지하면서 KIS timeout·프로세스 재시작·DB 재시도 상황에서도 확정 이벤트의 단일성을 보장한다.

## 디버깅 API 접근 제어

장중 후보·호출량·장애 정보는 운영 내부 정보이므로 디버깅 API를 공개 조회 API로 취급하지 않는다.

- `/api/debug/intraday-flow`와 SLO 조회는 관리자 session 또는 내부 cron secret을 검증한 뒤에만 응답한다.
- 일반 사용자 API에는 후보의 공개 표시 정보와 신선도만 제공하고, KIS endpoint·호출량·필터 탈락 사유·시스템 오류 원문은 노출하지 않는다.
- 디버깅 API는 관리자별 rate limit과 요청 timeout을 적용하며, 상태 변경·KIS 재호출·토큰 조작을 수행하지 않는다.
- 인증 실패는 상세 원인을 반환하지 않고 동일한 일반 오류 응답으로 처리한다. 인증값·cookie·secret은 로그에 남기지 않는다.
- 감사 로그에는 관리자 식별자, endpoint, 결과 상태, requestId, responseTimeMs만 남기고 민감한 요청 헤더와 응답 원문은 제외한다.

이를 통해 운영자가 필요한 진단 정보는 확보하면서, 실시간 후보 구성과 KIS 운영 상태가 일반 사용자나 외부 공격자에게 노출되는 범위를 최소화한다.

## KIS rate limit 전용 감사 로그

rate limit은 일반 `failed` 호출과 분리해 `kis_rate_limit_events`에 기록한다. HTTP 429가 아니더라도 KIS 응답의 rate-limit 관련 `rt_cd`, `msg_cd`, `msg1` 또는 운영 throttle에 의해 차단된 경우를 구분한다.

```text
kis_rate_limit_events
  id, run_id, tick_id, request_id, endpoint, market,
  tr_id, http_status, kis_rt_cd, kis_msg_cd, kis_msg1_code,
  limit_type, limit_scope, observed_tps, configured_tps,
  retry_after_ms, backoff_ms, attempt, breaker_state,
  queued_count, inflight_count, budget_remaining,
  occurred_at, recovered_at, recovery_status
```

- `limit_type`: `KIS_429`, `KIS_BUSINESS_RATE_LIMIT`, `LOCAL_THROTTLE`, `UNKNOWN_RATE_LIMIT`
- `limit_scope`: `ACCOUNT`, `APPKEY`, `ENDPOINT`, `TR_ID`, `GLOBAL`
- `observed_tps`는 발생 직전 1초의 실제 호출 수, `configured_tps`는 당시 적용된 10 TPS 안전 한도다.
- `retry_after_ms`는 응답 헤더에서 읽은 값이며, 없으면 실제 적용한 `backoff_ms`를 별도로 저장한다.
- `recovered_at`은 같은 endpoint가 probe를 성공한 시각으로, 복구 전에는 null이다.
- `kis_msg1` 전문을 저장할 때는 토큰·키·개인정보가 포함되지 않았는지 정규화하고, 원문 대신 제한된 진단 코드와 길이 제한 텍스트를 보존한다.

관리자 대시보드는 rate limit 발생 횟수·최초/최근 발생 시각·endpoint·시장·TR ID·발생 범위·발생 직전 TPS·당시 큐/in-flight·backoff·복구 시간·재시도 횟수를 5분·30분·당일 기준으로 제공한다. 10 TPS 미만에서 발생한 경우도 별도 표시해 KIS가 계정·endpoint별 한도를 적용했을 가능성을 확인할 수 있게 한다.

같은 사건의 연속 429는 request마다 새 장애로만 표시하지 않고 `incidentId`로 묶어 최초 발생·최종 복구·총 횟수·최대 backoff를 함께 집계한다. 로그 기록 실패는 KIS 요청 경로를 막지 않으며, 누락된 rate-limit 감사 건수는 `metricsDropped`로 표시한다.

## 메트릭 집계와 저장 부하 제한

10초 tick과 최대 300개 후보를 모두 개별 DB 행으로 기록하면 관측 자체가 DB 병목이 될 수 있다. 원본 후보 상태는 메모리에서 유지하고, 운영 지표는 tick·시장 단위로 집계해 저장한다.

- 모든 tick의 카운터(`planned`, `executed`, `deferred`, `failed`, `queueDepth`)는 저장하되 후보별 상세는 상태 전이·확정·오류가 발생한 경우만 저장한다.
- latency는 원시 샘플 전체를 저장하지 않고 count·min·max·p50 근사값·p95 근사값을 tick 단위로 기록한다.
- 동일 endpoint·동일 오류의 반복 로그는 1분 bucket으로 합치고 발생 건수와 첫/마지막 시각만 저장한다.
- bounded write queue가 임계치의 80%를 넘으면 비핵심 진단 지표를 합치고, 상태 전이·stale·중복 방지 기록은 우선 보존한다.
- queue가 가득 차도 worker의 KIS 조회를 동기적으로 기다리게 하지 않으며, 누락된 요약 수는 `metricsDropped`로 기록한다.
- 관리자 화면은 DB 집계값과 현재 메모리값을 합산하지 않고 `source`별로 구분해 표시한다.

이 정책으로 탐지 판단 경로의 지연을 DB 관측 기록이 유발하지 않도록 하면서, SLO 계산에 필요한 통계와 핵심 감사 이벤트는 보존한다.
