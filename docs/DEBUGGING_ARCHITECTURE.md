# 프로젝트 전체 디버깅 구조 설계안

## 문서 상태

- 상태: 기준 설계 문서
- 적용 범위: Next.js 화면·API, KIS Open API, DB 캐시·갱신 작업, 스캐너, 자동화
- 최종 갱신: 2026-08-30

## 목표

기능 실행부터 외부 API 호출, 응답 검증, DB 저장, 후속 계산, 화면 렌더링까지 하나의 실행 흐름으로 추적한다.

## 공통 실행 컨텍스트

모든 작업은 다음 식별자를 공유한다.

```ts
type DebugContext = {
  requestId: string;
  runId?: string;
  feature: string;
  market?: "KR" | "US";
  code?: string;
  timeframe?: "D" | "W" | "M";
  attempt?: number;
  startedAt: string;
};
```

## 로그 표준

로그는 구조화된 JSON으로 기록한다. API 키, 시크릿, 토큰, Authorization 헤더와 DB 비밀번호는 기록하지 않는다.

필수 필드:

- `level`, `event`, `requestId`, `runId`
- `feature`, `market`, `code`, `timeframe`
- `durationMs`, `attempt`, `retryable`
- 오류 시 `category`, `errorCode`, `message`

로그 레벨은 `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`로 통일한다.

## 오류 분류

```text
CONFIGURATION
AUTHENTICATION
AUTHORIZATION
RATE_LIMIT
NETWORK
API_RESPONSE
VALIDATION
DATABASE
CALCULATION
TIMEZONE
UI_RENDER
UNKNOWN
```

오류에는 재시도 가능 여부를 반드시 포함한다.

## KIS API 공통 경계

모든 KIS 호출은 공통 클라이언트를 거친다.

```text
KIS Client
 ├─ 인증 토큰 관리
 ├─ 요청·tr_id 검증
 ├─ TPS 제한
 ├─ timeout
 ├─ 오류별 retry
 ├─ 응답 표준화
 └─ 호출 시간·결과 기록
```

재시도 대상은 네트워크 오류, timeout, HTTP 429, HTTP 5xx, 일시적인 KIS 오류와 빈 응답이다. 잘못된 파라미터·종목 코드·권한 오류·DB 스키마 오류는 자동 재시도하지 않는다.

## DB 실행 이력

운영 진단을 위해 다음 테이블을 추가한다.

### `debug_runs`

기능 실행 단위의 요약을 저장한다.

```text
run_id, feature, market, status,
started_at, completed_at, duration_ms,
total_count, success_count, failure_count, retry_count,
metadata_json, error_summary
```

### `debug_run_items`

종목·타임프레임 단위 결과를 저장한다.

```text
run_id, market, code, timeframe, status,
attempt_count, started_at, completed_at, duration_ms,
error_category, error_code, error_message
```

## 데이터 갱신 진단

일·주·월봉 갱신은 시장과 타임프레임별로 처리 수, 성공·실패 수, 재시도 수, 저장 봉 수, 소요 시간을 기록한다.

- 전역 `MAX(fetched_at)`만으로 최신화를 판정하지 않는다.
- 종목별 최신 거래일을 확인한다.
- `ACTIVE` 보통주만 처리한다.
- retry 성공은 동일 종목·동일 타임프레임의 성공으로만 인정한다.
- 일봉 성공률이 게이트 미달이면 파생 주·월봉 생성을 차단한다.
- 원본 KIS 봉과 일봉 파생 봉을 `source`로 구분한다.

상세 설계는 [CANDLE_REFRESH_DESIGN.md](./CANDLE_REFRESH_DESIGN.md)를 따른다.

## API 응답 표준

```ts
type ApiResponse<T> = {
  ok: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    category: string;
  } | null;
  meta: {
    requestId: string;
    generatedAt: string;
    durationMs: number;
    dataAsOf?: string;
    refreshedAt?: string;
  };
};
```

## 프론트엔드 디버깅

개발 모드에서는 API 요청 ID, 기준일, 갱신 시각, 봉 개수, 지표 계산 가능 여부, 누락 필드를 확인할 수 있도록 한다.

차트 렌더링 전 다음을 검증한다.

- 시간 오름차순
- 중복 timestamp
- 잘못된 OHLCV 값
- 지표 계산에 필요한 최소 봉 수
- 통화·시장 구분

## 운영 진단 API

```text
/api/debug/health
/api/debug/runs
/api/debug/runs/:runId
/api/debug/errors
/api/debug/kis-calls
/api/debug/cache-status
```

## 구현 단계

1. `lib/debug/` 공통 컨텍스트·로거·오류·타이머 추가
2. 모든 KIS 직접 호출을 공통 client로 통합
3. `debug_runs`, `debug_run_items` migration 추가
4. 캔들·API·차트 데이터 validator 추가
5. 관리자 디버깅 현황 화면 추가
6. 정상·실패·재시도·DB 장애·렌더링 오류 테스트 추가

## 현재 적용 현황

V94·V95는 Flyway 배포 migration이다. 애플리케이션은 migration 전에도 기존 자동화 진단을 유지하며, migration 적용 후 종목별·KIS 호출별 상세 이력을 활성화한다.

| 영역 | 상태 |
|---|---|
| 캔들 갱신 설계 문서 | 적용 |
| 캔들 갱신 시간 측정 | 부분 적용 |
| retry queue | 적용 |
| KIS 공통 호출 프레임워크 | 공통 요청 경계에 구조화 오류 추적 적용 |
| 구조화 JSON 로그 | 공통 모듈 적용, 기존 경로 전환 진행 |
| 종목·타임프레임별 debug 실행 이력 DB | migration 및 자동화 공통 저장 적용 |
| `/api/debug/runs` 진단 API | 적용 |
| `/api/debug/health` 진단 API | 적용 |
| `/api/debug/errors` 진단 API | 적용 |
| `/api/debug/kis-calls` 진단 API | migration 및 저장 모듈 적용 |
| 차트 데이터 사전 검증 | 부분 적용 |
| 장애 시나리오 테스트 | 공통 컨텍스트·로그 테스트 적용 |

이 문서를 프로젝트 전체 디버깅 구조의 기준으로 삼고, 구현이 완료될 때마다 적용 현황 표를 갱신한다.
