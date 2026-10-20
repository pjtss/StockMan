# 차트 모달 데이터 로딩 장애 조사 — 2026-10-15

## 목적

차트 모달에서 일·주·월봉 데이터가 표시되지 않는 경로를 로컬 및 운영 read-only 요청으로 재현하고, 확인된 원인을 보완한다. 운영 데이터·설정 변경, 커밋, 푸시, 배포는 수행하지 않았다.

## 재현 결과

- 로컬 `scripts/dev-server.mjs` 실행 뒤 `/api/stock/chart`의 국내 `035760`, 해외 `US:AAPL` 요청이 모두 HTTP 502 `chartStatus=UNAVAILABLE`로 재현됐다.
- `.env.local`에는 `DAILY_CACHE_API_URL`, `DAILY_CACHE_READ_API_KEY`, KIS 자격증명 설정이 존재하지만 값은 기록하지 않는다. 로컬 DB `localhost:5433` 연결은 거부됐다. 서버 로그에 KIS 토큰 DB 조회 실패와 국내·해외 로컬 candle DB fallback 조회 실패가 남았다.
- 운영 `GET /api/stock/chart?code=035760&market=KR&timeframe=D`는 한 차례 HTTP 200으로 39개 봉을 반환했으며, 약 21초가 걸렸다. 같은 운영 호스트의 `/api/public/daily-candles` 요청은 55초에 HTTP 200을 반환했으나 해당 코드 봉은 0개였다. 이후 운영 차트 API 반복 호출은 45초 안에 응답하지 않았다. 따라서 운영 응답을 안정적인 복구 경로로 검증하지 못했다.
- 후속 재개 때 3000/5433 포트 listener가 없고 Docker Desktop service가 Stopped/Manual임을 확인했다. `Start-Service com.docker.service`는 현재 계정에서 service를 열 수 없어 실패했고, Docker Desktop을 비표시 실행해도 daemon pipe가 생성되지 않았다. 로컬 `psql`/`postgres` 실행 파일 및 PostgreSQL Windows service도 발견되지 않았다. 데이터 볼륨/환경변수는 수정하지 않았다.

## 확인한 원인과 수정

1. 모달의 market은 `KR`/`US`인데 public candle API는 거래소 코드(`KOSPI`/`KOSDAQ`/`NAS`/`NYS`/`AMS`)만 허용했다. 그 결과 원격 캐시 요청이 조회 불가였다. public API가 `KR`/`US` 별칭을 각각 국내/해외 거래소 집합으로 조회하도록 수정했다.
2. 원격 캐시가 설정되어 있지만 cache miss/응답 오류가 나면 `/api/stock/chart`가 503으로 즉시 종료해 KIS나 다른 chart 데이터 경로를 시도하지 않았다. 즉시 종료를 제거하고 원격 cache miss 이후 가능한 fallback을 시도하도록 수정했다.
3. 해외 모달에서 `exchange`를 전달해도 일봉 차트 요청에는 포함되지 않았다. 모달 요청에 거래소를 전달하고 API는 지정 거래소를 먼저 시도한다.
4. 차트 API fallback은 국내 봉 테이블만 조회했다. 해외도 `us_instrument_universe_candles`에서 조회하고, 거래소 미지정 시 같은 날짜의 최신 수집 봉을 사용하도록 확장했다.
5. 로컬 개발처럼 운영 cache API를 원격으로 쓰는 환경에서 public candle cache가 비거나 실패하면 원격 `/api/stock/chart`를 read-only로 fallback한다. 같은 origin이면 호출하지 않아 운영 인스턴스의 자기 자신 호출/재귀를 방지한다. 원격 chart 응답은 mock 회귀 테스트로만 확인했고, 운영 반복 호출 timeout으로 실제 동작은 아직 미검증이다.

## 변경 파일

- `components/chart-modal.tsx`
- `app/api/stock/chart/route.ts`
- `app/api/stock/chart/route.test.ts`
- `app/api/public/daily-candles/route.ts`
- `app/api/public/daily-candles/route.test.ts`
- `lib/remote-daily-candle-cache.ts`
- `lib/remote-stock-chart.ts` (신규)
- `docs/README.md`, `DEVELOPMENT_LOG.md`

## 검증과 미완료 항목

- 차트·public cache API 대상 Vitest: 2개 파일, 6개 테스트 통과.
- 수정 대상 파일에 한정한 TypeScript 검사 통과.
- 전체 `npm.cmd run build`는 Next compile은 통과했으나 기존 dirty `tsconfig.json`이 `.next-deploy-verify/types/.../sec-smallcap-share-facts/route.ts`를 포함하고, 참조 대상 `app/api/cron/sec-smallcap-share-facts/route.ts`가 없어 타입 검사에서 실패했다. 이 무관한 파일/설정은 수정하지 않았다.
- 로컬 실제 API는 여전히 502. 직접 원인은 개발 DB 미기동 및 운영 cache/chart API의 불안정한 응답이며, 수정 후 로컬 runtime end-to-end 성공을 입증하지 못했다.
- 다음 합격 조건: 로컬 PostgreSQL 기동 또는 운영 cache/chart API 안정화 후 국내·해외 각각 `/api/stock/chart`에서 200, 봉 개수>0, 최신 거래일 확인; 이후 `/charts` 모달에서 실제 차트 렌더링 확인.
- 현재 계정 권한으로 Docker service를 시작할 수 없으므로, 로컬 DB 검증을 계속하려면 사용자가 Docker Desktop service를 관리자 권한으로 실행하거나 운영 cache/chart API가 정상 응답해야 한다.

## 재발 방지

- `chart-modal` 변경 시 거래소 정보 전달 여부, 원격 cache alias 계약, cache miss 후 live/DB fallback, 원격 fallback의 same-origin loop 차단을 회귀 테스트에 유지한다.
- HTTP 200만 합격으로 보지 말고 실제 `candles.length > 0` 및 최신 봉 날짜를 확인한다.
- 커밋·배포 전에는 로컬 및 운영 실거래 응답 재검증을 한다. 미응답은 성공으로 판정하지 않는다.

## 전달 상태

- 커밋: 미실행
- 푸시: 미실행
- 배포: 미실행

## 후속 재검증 — Docker Desktop 기동 후

- 사용자가 Docker Desktop을 시작한 뒤 확인: Docker Engine 29.2.1, `stockman-postgres-local` Up, 호스트 5433 연결 성공, 컨테이너 `pg_isready` 정상.
- `npm.cmd run dev`로 실행하고 `.env.local` 로드를 확인했다. 국내 `035760`/KOSDAQ API는 HTTP 200, 39개 일봉, 최신일 `2026-10-15`(약 58초); 해외 `US:AAPL`/NAS API는 HTTP 200, 100개 일봉, 최신일 `2026-10-14`(약 69초).
- 브라우저 `/charts`에서 국내 CJ ENM 모달의 종목명, 현재가 40,000원, +5.40%, 캔들·EMA9/20/60·볼린저밴드·거래량 및 보조차트 표시를 시각 확인했다. 해외 애플 모달도 애플 이름, $342.96, +0.50%, 캔들·EMA·볼린저밴드·거래량 및 RSI/MFI·MACD 보조 차트 렌더까지 확인했다.
- 로컬 DB의 `debug_kis_calls`와 instrument master 일부 테이블이 없어 호출 이력/요청 로그에 unavailable/503이 남았지만 차트 API 데이터 반환에는 영향이 없었다. 마이그레이션/DB 데이터 변경은 하지 않았다.
- 배포 요청 후 `npm.cmd run deploy:verify` 실행: `docs:check`, `audit:verify-scope` 통과 후 `audit:kis-boundary`에서 실패(`kis-ipo-listing-schedule.ts`가 미등록). 이 파일은 미추적이며 차트 변경 범위 밖이라 수정/포함하지 않았고, 자동 게이트 규칙상 빌드·패키징·커밋·푸시·배포를 중단했다.
- 결론 갱신: 국내·해외 모달 모두 end-to-end 렌더링을 확인했다. 차트 표시 자체는 현재 재현되지 않는다. 다만 첫 API 요청 지연(58~69초)은 별도 성능 개선 과제로 남는다.
- 다음 개선: cold 응답 지연을 공급 경로별로 계측하고, 로컬 DB의 보조 로그/master 테이블 구성을 프로젝트 기준 스키마와 대조한다.
