# StockMan 현재 시스템 기준서

상태: 현재 구현 기준 (2026-09-19)

이 문서는 기능 설계서가 아니라, 작업을 시작하기 전에 현재 저장소의 실행 경계·책임 경계·데이터 흐름·검증 방법을 확인하기 위한 기준서다. 코드와 충돌하면 코드를 우선하고, 동작이 바뀌면 이 문서와 관련 설계서를 함께 갱신한다.

책임별 파일·호출 방향·금지 의존성·검증 증거의 상세 목록은 [`system-module-catalog.md`](./system-module-catalog.md)를 기준으로 한다. 이 문서는 전체 흐름과 불변식을, 카탈로그는 모듈 단위의 SRP 경계를 담당한다.

## 1. 실행 경계

```text
브라우저
  └─ components/* (클라이언트 상태·표현)
       └─ app/api/**/route.ts (HTTP 입력·인증·응답)
            └─ lib/* (도메인 서비스·외부 클라이언트·저장소·오케스트레이션)
                 ├─ PostgreSQL / Flyway migrations
                 ├─ KIS Open API
                 ├─ DART / SEC / RSS 제공자
                 └─ Discord / Push / Telegram 전달
```

- `app/`은 Next.js App Router 페이지와 API 라우트다.
- `components/`는 DB 드라이버, 비밀 환경변수, 외부 제공자 SDK를 직접 사용하지 않는다.
- `lib/`는 서버 전용 코드다. 외부 호출, 파싱, 판정, 저장, 전달을 한 파일에 새로 섞지 않는다.
- `db/migration/`은 Flyway 순번 migration만 보관한다. 적용된 migration은 수정하지 않고 새 버전을 추가한다.
- `scripts/`는 로컬 실행·문서 검증·성능 측정·OCI 운영 보조 도구다.

## 2. 책임별 모듈 지도

| 책임 | 기준 모듈 | 반드시 지켜야 할 경계 |
|---|---|---|
| 환경변수·DB 기반 | `lib/db.ts`, `lib/schema.ts`, `scripts/dev-server.mjs` | 자격증명 원문을 로그에 남기지 않음 |
| 요청 추적·오류 | `lib/request-trace.ts`, `lib/error-diagnostics.ts`, `lib/debug-context.ts` | 도메인 모듈이 HTTP 응답을 직접 만들지 않음 |
| KIS 인증 | `lib/kis-token.ts`, `lib/kis-authorization.ts` | 토큰 발급과 일반 시세 호출을 분리하고 DB 잠금·throttle 사용 |
| KIS 호출 공통화 | `lib/kis-request-framework.ts`, `lib/kis-request-throttle.ts` | 개별 KIS 모듈이 재시도·인증·throttle을 복제하지 않음 |
| KIS 국내·해외 | `lib/kis.ts`, `lib/kis-us-api.ts`, 관련 `*-client.ts` | 원본 응답 파싱과 화면 DTO를 분리 |
| 시세 캐시 | `lib/kr-daily-price-cache.ts`, `lib/us-daily-price-cache*.ts`, 분봉 캐시 모듈 | 수집·upsert·조회·최신성 판정을 한 책임으로 취급하지 않음 |
| 지표·스캐너 | `lib/*indicator*.ts`, `lib/*scan*.ts`, `lib/screener-engine.ts` | EMA 규칙과 원본 봉 기준일을 명시하고 HTTP를 모름 |
| 유니버스·상품 분류 | `lib/us-top-rising-universe.ts`, `lib/instrument-universe-import.ts`, 상품 분류 모듈 | 활성 보통주 판정과 랭킹 수집을 구분 |
| RSS·공시 | `lib/market-rss*.ts`, `lib/stocktitan*.ts`, `lib/sec-*.ts`, `lib/dart-*.ts` | 수집→정규화→분류→저장→전송을 독립 단계로 유지 |
| 인증·개인화 | `lib/auth*.ts`, `lib/watchlist.ts`, `lib/request-identity.ts` | 사용자별 관심종목과 전역 유니버스를 섞지 않음 |
| 전달 | `lib/discord*.ts`, `lib/discord-delivery-*.ts`, `lib/push.ts` | 전달 실패가 핵심 데이터 처리 실패로 전파되지 않음 |
| 예약 작업 | `lib/*job*.ts`, `lib/*pipeline*.ts`, `app/api/cron/**` | cron 라우트는 application service 호출과 인증만 담당 |

## 3. 주요 데이터 흐름

### 3.1 국내·해외 일봉

1. 예약 작업이 대상 유니버스와 최신성 정책을 읽는다.
2. KIS 클라이언트가 토큰·공통 throttle 경계를 통해 원본을 요청한다.
3. 원본 응답은 정규화된 candle DTO로 변환한다.
4. 저장소가 거래일시와 갱신일시를 보존하며 upsert한다.
5. 스캐너는 KIS를 직접 호출하지 않고 DB 캐시를 조회한다.
6. 결과에는 기준일, 봉 시각, 갱신 시각, 종목명·코드, 캐시/fallback 상태를 포함한다.

### 3.2 해외 상승률 TOP 100

`/api/stock/us/top-rising-chart`는 worker/universe가 최근 수집한 NAS·AMS·NYS 거래소별 KIS 상승률 최대 100행을 재사용하고, 프로세스 cold start 때만 hydration 한다. HTTP/KIS 성공 상태를 확인한 후 상품 제외, 공식 활성 보통주 마스터(fail-closed), 선택적 시총 조건을 적용해 차트 DTO를 만든다. 각 거래소의 원천 응답 수·완전성·실제 수집시각·오류를 별도로 반환하며, 세 거래소 모두 정상 100행을 받은 경우에만 전체 `complete=true`다. 브라우저 15초 재조회는 KIS 호출이 아니며, UI는 원천 시각 누락 또는 60초 초과를 최신성 경고로 표시한다. 분봉 큐는 점수 계산이 가능한 후보를 우선하고, 남은 최대 30개 슬롯은 같은 공식·설정 필터를 통과한 TOP100 원천 rank 순서로 채운다. KIS 해외 분봉 API의 실제 1분봉 조회에서 최근 1~10분 거래대금을 메모리 집계하며, 시총이 없으면 금액만 표시하고 시총 대비 비율·알림은 산출하지 않는다.

### 3.3 RSS·공시

화면용 조회와 누락 방지 자동 수집은 분리한다. 자동화는 원본 경계·중복 키·처리 상태를 저장하고, 분석 및 Discord 전달 실패를 수집 결과와 분리한다.

## 4. 데이터·정책 불변식

- 운영에서 임의 Mock을 반환하지 않는다. 데이터 부재는 빈 결과와 원인 메타데이터로 표현한다.
- EMA가 일반 이동평균의 기준이며, 볼린저밴드 중단선 계산은 기존 정의를 유지한다.
- 국내 스캔의 기본 시총 하한은 300억 원 이하 제외다.
- KIS Authorization은 DB의 실제 access token으로 구성하고 정적 `Bearer` 문자열을 토큰처럼 사용하지 않는다.
- 세션·쿠키·웹훅·API 키 원문은 문서와 로그에 기록하지 않는다.
- 삭제는 도메인 정책에 따라 soft-delete를 우선하며 조회 쿼리에서 삭제 행을 제외한다.
- 비동기 작업은 `automation_runs`에 시작·종료·상태·소요시간·오류 요약을 남긴다.

## 5. SRP 점검 결과

### 확인된 양호한 경계

- 인증, throttle, 토큰, 요청 추적, Discord 전달, RSS/공시 처리, 캐시, 지표 계산이 별도 모듈군으로 존재한다.
- API 라우트는 대부분 서버 모듈을 호출하는 얇은 경계로 유지된다.
- 관리자 공통 셸과 기능별 화면이 분리되어 있다.

### 지속 관찰할 분리 후보

| 후보 | 위험 | 분리 기준 |
|---|---|---|
| `lib/kis.ts`, `lib/kis-us-api.ts` | 인증·원본 호출·fallback·캐시·도메인 매핑이 커지기 쉬움 | 새 API 추가 시 `client`, `mapper`, `repository`, `service` 중 하나로 분리 |
| 대형 차트 클라이언트 | 모달 상태·데이터 fetch·키보드·watchlist가 결합되기 쉬움 | 동일 상태가 두 화면에서 필요해지는 즉시 hook/표현 컴포넌트 분리 |
| 스캐너 application service | 여러 지표와 SQL이 한 함수에 모일 위험 | 후보 universe, candle repository, indicator evaluator, result presenter 분리 |
| API route | 진단·fallback·응답 포맷이 누적될 위험 | route에는 인증·입력·상태 코드만 남김 |

파일 크기만으로 SRP 위반을 판정하지 않는다. 변경 이유가 서로 다르고 독립 테스트가 필요할 때만 분리한다.

## 6. 작업 전후 체크리스트

1. 현재 동작 문서와 제안 문서를 구분했는가?
2. 기존 API 계약·환경변수·DB migration을 확인했는가?
3. 외부 호출과 순수 판정을 분리했는가?
4. 캐시 hit/miss, 기준일, 갱신일, fallback, 빈 결과를 응답에 남겼는가?
5. 실패가 데이터·알림·화면 중 어느 계층에 속하는지 구분했는가?
6. 관련 단위 테스트, `npm run typecheck`, `npm run docs:check`, 필요 시 production build와 실행을 수행했는가?
7. 변경된 파일만 stage했는가?

## 7. 권위 문서 링크

- 전체 제품 구조: [`project-architecture.md`](./project-architecture.md)
- 코드 경계: [`code-structure.md`](./code-structure.md)
- SRP·문서 규칙: [`documentation-and-srp.md`](./documentation-and-srp.md)
- DB 구조: [`database-schema.md`](./database-schema.md)
- KIS 요청: [`../KIS_REQUEST_FRAMEWORK.md`](../KIS_REQUEST_FRAMEWORK.md)
- 운영 런북: [`../operations/runbook.md`](../operations/runbook.md)
- 오류 대응: [`../ERROR_HANDLING.md`](../ERROR_HANDLING.md)
- 상세 모듈 카탈로그: [`./system-module-catalog.md`](./system-module-catalog.md)
