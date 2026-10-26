# StockMan 시스템 모듈 카탈로그

상태: 현재 구현 기준 (2026-09-19)

이 문서는 저장소의 현재 구조를 책임 단위로 분해해 설명하는 상세 카탈로그다. 파일을 단순 나열하지 않고, 각 모듈의 변경 이유·입출력 경계·금지 의존성·검증 증거를 기록해 다음 작업의 설계와 리뷰 기준으로 사용한다.

## 1. 권위와 읽는 법

권위 순서는 현재 코드와 테스트, 이 카탈로그의 책임 표, [현재 시스템 기준서](./current-system-reference.md), 기능별 설계서와 운영 문서다. 문서와 코드가 다르면 코드를 우선해 원인을 확인하고, 의도된 동작이면 같은 변경에서 문서를 갱신한다.

새 코드의 책임은 다음 질문으로 판정한다.

| 질문 | 예 | 모듈 경계 |
|---|---|---|
| 무엇을 결정하는가? | EMA, 상품 제외, 권한 | 도메인 정책 |
| 어디에서 가져오는가? | KIS, PostgreSQL, RSS | adapter/repository |
| 어떤 형식으로 바꾸는가? | KIS 행 → Candle DTO | mapper/normalizer |
| 순서를 조율하는가? | 수집→저장→알림 | application service/job |
| 어떻게 보여주는가? | 탭, 모달, 로딩 | component/page |
| 어떻게 전달하는가? | Discord, Push | delivery adapter |

두 개 이상의 질문에 독립적으로 답해야 한다면 하나의 파일에 넣기 전에 분리 근거와 테스트 경계를 기록한다.

## 2. 전체 실행 경계

```text
Browser / scheduler / Discord interaction
        │
        ▼
Next.js App Router
  app pages ─────────────── components
  app/api routes             client state + presentation
        │
        ▼
Application services (lib/*-pipeline, *-job, orchestration)
        │
        ├── Domain policies / indicators / screeners
        ├── Repository / database boundary
        ├── External adapters: KIS, DART, SEC, RSS
        └── Delivery adapters: Discord, Push, Telegram
        │
        ▼
PostgreSQL + Flyway / process memory / external providers
```

단일 모놀리식 Next.js 프로세스 안에서도 위 경계를 유지한다. `lib/`가 한 디렉터리에 있다는 이유로 계산·외부 통신·저장·전송을 한 책임으로 취급하지 않는다.

## 3. 최상위 모듈 지도

| 모듈군 | 대표 경로 | 단일 책임 | 직접 의존하면 안 되는 것 |
|---|---|---|---|
| 앱 진입점 | `app/**`, `middleware.ts` | 페이지·라우트·런타임 진입 | KIS 파싱, 대형 SQL, Discord payload |
| 화면 | `components/**` | 상태 표시·상호작용·표현 | DB 드라이버, 비밀값, 외부 fetch |
| HTTP 경계 | `app/api/**/route.ts` | 입력·인증·상태 코드·DTO | 장시간 배치·복합 판정 |
| 런타임 | `lib/db.ts`, `lib/kis-api-config.ts` | 환경·연결·공통 런타임 | 화면 전용 정책 |
| 외부 API | `lib/kis*`, `lib/sec-*`, `lib/dart-*`, RSS | 요청·원본 해석 | UI 상태·직접 알림 |
| 저장소 | DB 경계·repository/query | 저장·조회·upsert | 도메인 판정·렌더링 |
| 도메인 | `*indicator*`, `*screener*`, `*scan*` | 지표·후보·점수 | HTTP·환경·fetch |
| 캐시 | `*-cache.ts`, `intraday-memory-state.ts` | TTL·in-flight·캐시 | 화면 문구 |
| 전송 | `lib/discord*`, `lib/push.ts` | 전달·재시도·전송 정책 | 수집·지표 계산 |
| 자동화 | `*-job.ts`, `*-pipeline.ts`, cron | 실행 순서·락·관측 | API schema 복제 |
| 운영 | `scripts/`, `deploy/oci/`, `docs/operations/` | 검증·배포·장애 대응 | 런타임 핵심 정책 우회 |

## 4. 상세 모듈 카탈로그

### 4.1 앱·페이지·HTTP 라우트

**책임:** Next.js 진입점과 HTTP 계약을 제공한다.

| 영역 | 위치 | 입력 | 출력/책임 | 경계 |
|---|---|---|---|---|
| 페이지 | `app/**/page.tsx` | URL·세션 | 페이지 조립 | 직접 장시간 수집 금지 |
| 레이아웃 | `app/layout.tsx`, `app/admin/layout.tsx` | 공통 세션/UI | 공통 셸 | 도메인 쿼리 금지 |
| API | `app/api/**/route.ts` | Request/query/body | 검증된 service 결과 | route는 얇게 유지 |
| cron | `app/api/cron/**` | secret·실행 요청 | automation 결과 | 실제 작업은 lib job |
| 관리자/디버그 | `app/api/admin/**`, `app/api/internal/**` | 관리자 권한 | 진단 DTO | 비밀 원문 금지 |

라우트 순서는 입력 파싱 → 권한/secret → validation → application service → 표준 응답이다. route 안에서 토큰 발급·retry·throttle·종목 전체 순회를 직접 구현하지 않는다.

### 4.2 UI·클라이언트 컴포넌트

대표 파일군은 `components/chart-*`, `components/*dashboard*`, `components/page-navigation.tsx`, `components/admin-*`, `components/*scanner*`다.

| 허용 책임 | 금지 책임 |
|---|---|
| 탭·모달·종목·키보드 이동·로딩 상태 | DB pool·Drizzle·서버 비밀값 |
| 금액·날짜·상태 표시 변환 | KIS 직접 fetch |
| 사용자 동작의 API 호출·접근성 | 지표 계산 중복 |
| 공통 버튼·카드·모달·내비게이션 | 페이지별 업무 정책 하드코딩 |

차트 모달은 모달 상태, 차트 렌더링, 분봉/일봉, 뉴스/재무, 관심종목이 결합되기 쉬운 고위험 영역이다. 다른 화면에서 재사용하거나 테스트를 격리해야 하는 순간 `useChartModalState`, header, chart renderer, tabs, watchlist action으로 변경 이유를 분리한다. 파일 크기만 줄이기 위해 나누지는 않는다.

### 4.3 런타임·환경·DB 경계

| 모듈 | 단일 책임 | 계약 |
|---|---|---|
| `lib/db.ts` | PostgreSQL pool | 앱 코드가 드라이버를 직접 만들지 않음 |
| `lib/schema.ts` | Drizzle schema/type | DDL은 Flyway가 소유 |
| `lib/kis-api-config.ts` | KIS 환경·기능 설정 | 키 원문 로그 금지 |
| `lib/kis-runtime.ts` | gateway/runtime 상태 | 호출자가 gateway를 재구현하지 않음 |
| `scripts/dev-server.mjs` | `.env.local` 우선 주입 | 자격증명 출력 금지 |
| `db/migration/V*.sql` | 재현 가능한 DDL/index | 적용 파일 수정 금지 |

### 4.4 KIS 공통 호출 계층

```text
domain/application service
        ↓
kis-request-framework
        ↓
kis-token + kis-authorization
        ↓
kis-request-throttle (앱 안전 한도 TPS 10)
        ↓
KIS feature adapter
        ↓
raw response → mapper → domain DTO
```

| 책임 | 파일군 | 설명 |
|---|---|---|
| 토큰 수명주기 | `kis-token.ts`, `kis-authorization.ts` | 공유 토큰·advisory lock·공식 만료·AUTH 복구 |
| 요청 공통 | `kis-request-framework.ts` | 헤더·timeout·JSON 판정·실패 형식 |
| 호출 제한 | `kis-request-throttle.ts` | rolling 1초당 최대 10회, in-flight 10건 상한, 적응형 backoff |
| 국내 | `kis-domestic-api.ts`, `kis.ts`, `kis-kr-*` | 국내 endpoint adapter/DTO |
| 해외 | `kis-us-api.ts`, `kis-us-*` | 거래소·해외 endpoint adapter/DTO |
| 관측 | `debug-kis-call.ts`, `kis-rate-limit-event.ts`, `kis-realtime-event.ts` | 호출·rate limit·실패 원인 |

새 KIS API는 route → service/adapter → framework → token/throttle 경로를 지킨다. `fetch`는 공식 adapter 경계에서만 사용하며, 직접 호출을 추가하면 외부 요청 경계 문서와 회귀 테스트를 갱신한다.

### 4.5 가격·캔들·캐시

| 계층 | 대표 파일군 | 책임 |
|---|---|---|
| 원본 조회 | `kis-kr-daily-price.ts`, `kis-us-daily-price.ts`, `kis-chart.ts`, minute 계열 | 원본을 봉 DTO로 변환 |
| 저장/갱신 | `kr-daily-price-cache.ts`, `us-daily-price-cache.ts`, `*-cache-job.ts`, `*-refresh.ts` | 최신성·upsert·재시도 |
| 조회 | `chart-candles.ts`, timeframe query | 화면/스캐너에 정렬 봉 제공 |
| 파생 | `daily-to-weekly-upsert.ts`, 지표 계열 | timeframe 변환·입력 생성 |
| 관측 | `candle-refresh-observability.ts`, failure/retry | duration·누락·재시도 |

일·주·월봉 결과는 기준 거래일, 봉 갱신시각, 종목명·코드, cache/fallback 상태를 보존한다. 화면용 최신 조회와 배치 원본 수집을 한 함수에 합치지 않는다.

`instrument-fundamentals.ts`는 활성 국내·해외 유니버스의 현재가 기본정보 스냅샷 갱신 application service다. 종목 주수는 KIS 상세시세만 사용한다. 국내 `inquire-price`의 `output.lstn_stcn`과 해외 `/uapi/overseas-price/v1/quotations/price-detail`의 `output.shar`를 `listedShares`로 정규화해 스냅샷·이력의 `listed_shares`에 저장한다. 타 출처 발행/유통주식수와 free-float 값은 종목 주수 필드로 사용하지 않는다. 미국 소형주 SEC 주식수 전용 동기화·공개 API·보고서 기능은 V149에서 테이블을 제거하고 앱 경로를 삭제했다. OCI cron이 `/api/cron/instrument-fundamentals`를 호출하며 자동 갱신 간격은 86,400초(24시간)로 고정한다. 갱신 값은 최대 200행 단위의 bounded queue를 통해 이력과 최신 스냅샷에 같은 DB transaction으로 저장한다. 해외 종목을 최신 스냅샷으로 저장할 때는 `kis-us-price-detail`의 프로세스/DB TTL 캐시와 stale fallback을 우회하고 KIS 재조회를 요구한다. 유효하지 않은(누락·0 이하) 가격은 실패로 계수하고 기존 최신 스냅샷을 덮지 않는다. 전체 갱신 외에 활성 유니버스에서 확인되는 `(market, code)` 범위만 지정하는 targeted retry를 지원하며, 빈 범위나 비활성/미등록 종목이 섞인 요청은 외부 API 호출 전에 거부한다. 진행 이벤트와 최종 결과에는 wall elapsed, 동시 fetch 호출시간 합계, DB transaction 시간 합계, writer 시작 전 queue 대기시간 합계(큐 포화 backpressure 포함) 및 처리율을 노출한다. fetch/DB/queue 시간은 동시 작업 구간이 겹칠 수 있어 서로 더해 총 wall time으로 해석하지 않는다. 시장별 fetch 시간은 합계로 제공한다. 결과에는 시장별 대상·수집·저장·실패 수와 제한된 실패 샘플을 포함한다. 이 동작은 `lib/instrument-fundamentals.test.ts`, `lib/bounded-write-queue.test.ts`와 `lib/kis-us-price-detail.test.ts`의 회귀 테스트로 고정한다.

스케줄러는 `withAutomationRun`을 통해 최종 결과를 `automation_runs.summary`에 저장한다. 관리자 `/admin/observability` 실행 상세는 `instrument-fundamentals` 전용으로 단계별 성능을 사람이 읽는 카드로 표시하고 원본 요약 JSON도 유지한다. summary compaction은 이 성능 객체의 숫자 필드를 보존한다.

`instrument-universe-import.ts`는 해외 보통주/특수상품 간 기존 DB 행을 현재 판별 규칙으로 미리보기 및 원자적 재분류할 수 있다. 운영 스크립트는 localhost DB만 허용하고 dry-run을 기본값으로 하며, 실제 적용 시 양방향 예상 이동 수를 모두 지정해야 한다. 이동 결과는 destination upsert와 source 비활성화를 한 transaction으로 처리하며, 사후 dry-run 0건을 확인한다.

### 4.6 유니버스·상품 적격성

| 모듈 | 책임 |
|---|---|
| `instrument-universe-import.ts`, `kr-instruments.ts` | 거래소·종목 마스터 정규화/저장 |
| `us-top-rising-universe.ts` | 거래소별 상승률 후보, 보통주 적격성, 시총, focus pool |
| common-stock universe query | 권위 있는 active/common-stock 확인 |
| 상품 필터 | ETF·ETN·워런트·레버리지·파생·비활성·중복 제외 |
| `intraday-quality-gate.ts` | 탐지 가능한 품질의 최종 gate |

적격성 필터는 탐지보다 먼저 실행한다. 탈락 행은 점수, 집중 탐색 큐, 알림의 입력이 될 수 없다. 공식 유니버스 조회 실패는 fail-closed가 기본이다. 단일 인스턴스 메모리의 양성/음성 적격성 캐시는 1시간 TTL이다. DB는 권위 데이터와 복구 근거이고 메모리는 반복 조회 지연을 줄이는 계층이다.

### 4.7 지표·스크리너·후보 점수

| 책임 | 대표 모듈군 | 규칙 |
|---|---|---|
| 기본 지표 | `*indicator*`, `us-macd-scan.ts`, `us-dmi-scan.ts` | 일반 이동평균은 EMA |
| 수급 | `*obv*`, `*adl*`, investor-flow | 입력 시간순서 고정 |
| 볼린저 | `*bollinger*` | 중단선·표준편차 기존 정의 |
| 스크리너 | `*screener*`, `screener-engine.ts` | 조건 조합·검증·순위 |
| 우선순위 | `intraday-candidate-priority.ts` | 시총 대비 거래대금·신호·신선도 |
| 품질 | `intraday-quality-gate.ts` | 결측·상품·inactive 차단 |

스크리너는 데이터를 어디서 가져오는지와 조건을 어떻게 판정하는지를 분리한다. API와 UI에서 같은 지표를 다시 계산하지 않는다.

### 4.8 실시간 TOP 100·집중 탐지

```text
KIS 상승률 순위
  → 거래소별 snapshot
  → 상품/active common-stock gate
  → 시총·거래대금 정규화
  → priority/focus pool
  → 메모리 상태·1분 tick
  → 5분 누적 조건
  → 관측/Discord
```

| 모듈 | 책임 |
|---|---|
| `intraday-memory-state.ts` | snapshot·후보 상태·TTL·in-flight |
| `intraday-detection-worker.ts` | tick·due 후보·graceful shutdown |
| `intraday-candidate-priority.ts` | 후보 예산 안 우선순위 |
| `intraday-mvp-policy.ts` | threshold/window/persistence 정책 |
| `intraday-detection-observability.ts` | run/tick 시간·큐·실패 |
| `discord-intraday-mvp.ts` | 탐지 DTO의 Discord 변환 |

웹 요청은 worker를 생성하지 않는다. 단일 프로세스 worker가 메모리 상태를 소유하고 DB는 설정·운영 이력·복구 근거를 보관한다. 구현 존재와 관리자 설정에 따른 runtime enabled를 구분한다.

### 4.9 RSS·공시·번역

```text
source client → raw parser → normalized item → classifier/grade
             → dedupe/cache/repository → translation cache
             → UI export / Discord / Push
```

| 책임 | 대표 파일군 |
|---|---|
| RSS 원본 | `market-rss*`, `stocktitan-rss.ts`, `domestic-rss-sources.ts`, `nasdaq-rss.ts` |
| 정규화/등급 | `market-rss-classifier.ts`, `market-rss-grade.ts`, `market-rss-pipeline.ts` |
| SEC | `sec-edgar-rss.ts`, `sec-edgar-client.ts`, `sec-document-parser.ts`, `sec-edgar-repository.ts` |
| DART | `opendart.ts`, `dart-automation.ts` |
| 번역 | `cloud-translation-client.ts`, `translate-market-rss-item.ts`, `translation-cache.ts` |
| 전달 | `discord-sec.ts`, `discord-dart.ts`, `push.ts` |

피드 수집, 호재 판정, 원문 파싱, 저장, 전달은 별도 책임이다. 화면용 RSS 조회가 누락 방지 자동 수집을 대신하지 않는다.

### 4.10 인증·개인화·행동 기록

| 책임 | 대표 모듈 | 경계 |
|---|---|---|
| 관리자 인증 | `admin-auth.ts`, admin layout/API | 관리자 세션과 일반 세션 분리 |
| 사용자 인증 | `user-auth.ts`, auth routes | username/password와 cookie session |
| 관심종목 | `watchlist.ts`, `user-watchlist.ts` | 사용자별 데이터 |
| 요청 신원 | `request-identity.ts` | IP/UA/session 추출 |
| 기능 로그 | `request-trace.ts`, request-log config/routes | 사용자가 요청한 기능 중심 |
| 지역 추론 | `ip-geolocation.ts` | 원본 IP와 추론 정책 분리 |
| 문의/공지 | `inquiries.ts`, `notices.ts` | 권한·soft-delete·댓글/좋아요 |

개인화 저장소는 사용자 ID를 필수 키로 삼고 전역 유니버스와 섞지 않는다. 관리자는 권한 경계 뒤에서만 집계한다.

### 4.11 저장소·스키마·성능

| 변경 | 위치 | 기준 |
|---|---|---|
| 테이블/인덱스 | `db/migration/V*.sql` | 새 버전 추가, 기존 파일 수정 금지 |
| 조회 조합 | repository/query 모듈 | 화면에서 SQL 직접 작성 금지 |
| 트랜잭션/락 | service/repository 경계 | 세션·토큰·중복 방지 명시 |
| 실행계획 | `scripts/measure-*.mjs` | explain, 행 수, latency 기록 |
| schema health | `schema-health.ts`, debug API | 운영 적용 버전 확인 |

메모리 캐시는 지연시간·중복 호출을 줄이고 DB는 영속성·재시작 복구·운영 검증을 담당한다. 둘의 책임을 같은 캐시로 취급하지 않는다.

### 4.12 Discord·Push 전달

전송은 payload 작성, 대상 설정, queue/retry, 결과 관측으로 나눈다.

- `discord-config.ts`: 설정 경계
- `discord-delivery-policy.ts`: 전송 여부
- `discord-delivery-queue.ts`, `discord-delivery-retry.ts`: 안정성
- `discord-sec.ts`, `discord-dart.ts`: 출처별 DTO 변환
- `push.ts`: Web Push

원본 API 실패를 Discord 성공으로 포장하지 않으며, 전달 실패가 수집 트랜잭션을 불필요하게 rollback하지 않도록 결과를 분리한다.

### 4.13 자동화·관측·운영

| 영역 | 대표 위치 | 책임 |
|---|---|---|
| 실행 기록 | `automation-run.ts`, `automation-run-repository.ts` | 상태·duration·오류 |
| 잠금 | `automation-lock.ts` | 중복 실행 방지 |
| 설정 | `automation-settings.ts` | enable/time/threshold |
| 디버깅 | `automation-debug.ts`, `debug-context.ts`, `error-diagnostics.ts` | requestId·원인 |
| 운영 주기 | `deploy/oci/*.service`, `*.timer` | systemd |
| 진입점 | `scripts/oci-cron.sh`, `scripts/oci-rss-cron.sh` | 운영 실행 |
| 배포 | `.github/workflows/`, `scripts/verify-deploy.mjs` | artifact·Flyway·health |

자동화 route는 설정 확인·인증·공통 실행만 담당하고 cron script는 business rule을 복제하지 않는다.

## 5. 허용 의존성 방향

```text
UI/page
  → API contract
    → application service / orchestration
      → domain policy
      → repository
      → external adapter
      → delivery adapter
```

금지 규칙:

1. `components/`에서 `pg`, `drizzle`, 서버 비밀값, KIS fetch를 사용하지 않는다.
2. 순수 지표/판정 모듈에서 `NextResponse`, `Request`, `cookies()`를 사용하지 않는다.
3. repository에서 Discord/Push를 전송하지 않는다.
4. external adapter에서 React 상태나 화면 문구를 만들지 않는다.
5. route에서 토큰 발급·retry·throttle을 직접 구현하지 않는다.
6. cron script에서 도메인 조건·SQL·외부 API schema를 복제하지 않는다.
7. 메모리 캐시를 사용자 간 개인화 공유 저장소로 사용하지 않는다.

불가피한 예외는 이유·대체 경계·제거 조건·테스트를 기록한다. 두 번째 기능에서 재사용되면 공통 모듈로 승격한다.

## 6. 변경 유형별 작업 경로

| 변경 | 먼저 읽을 문서 | 구현 경계 | 필수 검증 |
|---|---|---|---|
| KIS endpoint | `external-request-boundaries.md` | adapter/framework | mock response·rate limit·typecheck |
| 새 스캐너 | `feature-inventory.md` | repository + evaluator + route | indicator·기준일 메타데이터 |
| 캐시 TTL | 성능 설계/해당 cache owner | 한 곳의 TTL 상수 | hit/miss/expiry·운영 JSON |
| UI/차트 | code-structure/current reference | component/hook/API | mobile/desktop·build |
| DB 인덱스 | database-schema | Flyway migration | docs check·migration·explain |
| 자동화 | delivery-lifecycle/runbook | job/pipeline + cron | lock·duration·failure isolation |
| Discord | delivery policy | DTO + adapter | disabled/no-secret·retry |

## 7. 검증 증거 매트릭스

| 책임 | 단위 증거 | 운영 증거 |
|---|---|---|
| KIS | auth/throttle/kis tests | status·rt_cd·requestId debug API |
| 캔들 | cache/indicator tests | count·duration·latest date |
| 유니버스 | universe/product tests | source/eligible/excluded/cache stats |
| 스캐너 | screener/scan tests | 기준일·갱신일·빈 결과 원인 |
| RSS/공시 | parser/pipeline tests | freshness·dedupe·translation |
| 인증 | auth/watchlist/route tests | 세션·사용자별 권한 조회 |
| 전달 | Discord/Push tests | retry/error/delivery result |
| 자동화 | automation tests | run history·lock·timer journal |

좁은 단위 테스트만 통과했다고 전체 흐름을 검증한 것으로 보지 않는다. 외부 호출·DB·운영 스케줄이 포함되면 경계 통합 증거도 남긴다.

## 8. 현재 혼합 위험과 분리 백로그

| 대상 | 위험 | 분리를 시작할 조건 | 목표 경계 |
|---|---|---|---|
| `lib/kis.ts` | 국내 호출·fallback·매핑 증가 | endpoint 2개 이상 추가 | client/mapper/service |
| chart modal | 모달·차트·뉴스·watchlist 결합 | 재사용/테스트 격리 필요 | state hook/renderer/tabs |
| scanner service | 후보·지표·정렬·응답 결합 | 조건 증가/쿼리 병목 | repository/evaluator/presenter |
| 대형 route | 진단·변환·업무 로직 누적 | 외부 API 2회 이상 호출 | route/use-case/mapper |
| RSS pipeline | 수집·분류·저장·번역 결합 | 공급자별 정책 분화 | adapter/normalizer/processor |

분리는 characterization test와 DTO 계약을 먼저 확보한 뒤, 한 책임씩 이동한다. 기존 응답 비교 없이 대규모 리팩터링하지 않는다.

## 9. 문서 유지 프로토콜

모든 구조 변경은 다음을 기록한다.

```text
변경 ID: CI-YYYY-MM-DD-NNN
목표 / 현재 증거 / 변경 범위
SRP 판정: 책임·호출자·금지 의존성
검증: 명령과 결과
운영 확인: 캐시·호출량·실행시간·오류
남은 위험 / 다음 개선
커밋·푸시·배포 상태
```

새 모듈은 이 카탈로그의 책임 표와 `docs/README.md`, 필요 시 `app/README.md` 또는 `lib/README.md`를 같은 변경에서 갱신한다. 문서만 추가하고 인덱스에 연결하지 않으면 완료로 보지 않는다.

## 10. 이번 카탈로그의 근거와 다음 개선

- 근거: 현재 저장소의 `app/api` 177개, `components` 100개, `lib` 373개 파일과 기존 아키텍처·운영 문서.
- 반영: 실행 경계, 책임별 모듈군, 금지 의존성, 데이터 흐름, 검증 증거, 분리 백로그.
- 범위 원칙: 파일 하나마다 기계적으로 복제하지 않고 변경 이유가 같은 모듈군으로 묶었다. 실제 책임이 바뀌면 대표 파일 표를 갱신한다.
- 다음 개선: CI에서 import graph와 route의 직접 외부 호출을 정적 검사해 이 문서의 금지 규칙을 자동 게이트로 강화한다.
