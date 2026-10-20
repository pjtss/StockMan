# 해외 종목 정보 갱신 현황 및 이력 검증

조사일: 2026-10-14 (KST)

## 판정 요약

- 코드상 해외 종목의 기본정보 스냅샷/이력, 종목 마스터, 일·주·월봉은 서로 다른 경로로 갱신된다.
- `instrument-fundamentals` 기본정보는 KIS를 강제 재조회해 24시간 간격으로 저장하도록 구현되어 있다. 크론은 5분마다 라우트를 호출하고, 라우트가 직전 실제 실행 후 24시간 미만이면 건너뛴다.
- 실제 운영/로컬 DB 이력은 이번 조사에서 검증하지 못했다. 따라서 최근 실행 시각, 성공률, 종목별 갱신 여부를 “정상”이라고 판정하지 않는다.
- `instrument-fundamentals`의 해외 기본정보 매핑에는 `open/high/low`가 연결되지 않아 해당 스냅샷 컬럼이 null로 저장되는 코드상 결함이 확인됐다.

## 갱신 경로별 코드 근거

| 정보 | 소스·저장 경로 | 코드상 주기/방식 | 실제 이력 판정 |
|---|---|---|---|
| 해외 종목 마스터(티커·회사명·영문명·분류·거래소·통화·상품/보통주 플래그) | KIS 해외 마스터 파일 `NASMST.COD`, `NYSMST.COD`, `AMSMST.COD` → `us_common_stock_universe` / `us_special_instrument_universe`; 실행 기록 `instrument_universe_sync_runs` | 관리자 종목 마스터 가져오기 API를 통한 파일 import. OCI cron 목록에서 이 importer 호출은 확인되지 않음 | DB의 최근 `completed_at`, 시장별 `last_seen_at` 확인 불가 |
| 현재가·등락률·거래량·거래대금·시가총액·상장주수 | KIS 해외 `price-detail` (`HHDFS76200200`) → `instrument_fundamental_history` + 최신 `instrument_fundamental_snapshots`; 원시 응답도 저장 | `/api/cron/instrument-fundamentals`; 5분마다 호출하되 설정 활성/시간 조건과 24시간 간격 통과 시 실행. 종목당 1회 강제 최신 KIS 조회, 최대 동시성 8 | `automation_runs` 최근 실행/시장별 성공·실패·저장 수, 스냅샷 최신시각 확인 불가 |
| 일봉·주봉·월봉 OHLCV | KIS 캔들 호출 → `us_instrument_universe_candles`, 일봉 최신 요약 `us_latest_daily_candles`; 실패·재시도는 별도 candle cache 이력 | `/api/cron/us-daily-cache`; 크론은 5분마다 호출, 라우트의 설정 간격 기본 1시간. timeframe별 오래된 종목만 선별: D 1시간, W 24시간, M 7일 기준 | 최근 `us-daily-cache` 실행 및 시장·주기별 최신 봉일자/수집시각 확인 불가 |
| 단기 KIS 가격상세 응답 캐시 | `us_price_detail_cache` 및 프로세스 메모리 | 일반 조회 캐시 TTL 10초. 기본정보 자동화는 `forceRefresh=true`, `allowStaleFallback=false`를 사용해 stale 응답을 저장 원천으로 재사용하지 않도록 구현 | DB 캐시의 최근 `fetched_at` 확인 불가 |

### 기본정보 자동화가 저장하는 필드

`instrument_fundamental_snapshots`는 최신 행을 종목별 1건으로 유지하고, `instrument_fundamental_history`는 실행별 행을 누적한다. 해외 KIS 응답에서 코드가 매핑하는 값은 다음과 같다.

- `price`: KIS `last` (대체 필드 `t_prpr`, `price`)
- `change_rate`: `t_xrat` 또는 `prdy_ctrt`
- `volume`: `tvol`, `pvol`, `vol` 중 첫 값
- `trading_value`: `tamt`/`tamnt`, 없거나 0이면 `pamt`
- `market_cap`: KIS `tomv`
- `listed_shares`: KIS `shar`
- `currency`, 거래소 코드, 전체 KIS 원문 JSON
- `name`: 현재 종목 유니버스에서 가져온 종목명

코드에서 해외 응답 객체에 `open`, `high`, `low`를 할당하지 않은 상태로 저장 행 생성 시 `data.open/high/low`를 읽는다. 따라서 이 3개 필드는 이번 실행에서 갱신되지 않고 null로 기록된다. 기존 사용자 데이터가 실제로 null인지 여부는 DB 접근 실패로 검증하지 못했다.

또한 `listed_shares`가 null/0이어도 기본정보 refresh의 실패 카운터에 추가되지 않고, `isInstrumentFundamentalRefreshComplete`의 성공 판정 조건에도 포함되지 않는다. 따라서 다른 필수값이 정상이라면 발행주식수가 빠진 종목이 있어도 실행 자체는 성공으로 분류될 수 있다. `/api/admin/instrument-fundamentals-debug`의 `snapshotCoverage.byMarket`도 상장주수 누락을 집계하지 않는다. 기존 실행 상태·커버리지 요약만으로 상장주수까지 갱신됐다고 증명할 수 없으므로, 실제 DB 연결 후 필드별 집계가 필요하다.

`observed_at`/`fetched_at`은 애플리케이션이 응답을 저장한 시각이다. KIS 값 자체의 기준일·원천 갱신일과 같다고 볼 근거는 없으며, 특히 `listed_shares` 기준일은 KIS 응답에서 관측되지 않는다.

## 이번 실제 이력 확인 시도와 결과

1. `.env.local`은 DB 주소로 `localhost:5433`을 지정하고 있었으며, 값을 출력하지 않고 연결을 시도했다. PostgreSQL 연결은 `ECONNREFUSED`였다.
2. 프로젝트의 `docker-compose.local.yml`은 `stockman-postgres-local` 컨테이너를 사용하도록 되어 있다. Docker Desktop 프로세스는 시작했지만 `com.docker.service`는 중지 상태였고, 현재 권한으로 서비스를 열거나 시작하지 못했다. Docker 엔진 named pipe도 없어 컨테이너 상태를 조회하지 못했다. 데이터 볼륨을 삭제하거나 초기화하지 않았다.
3. 운영 서버의 읽기 전용 `GET /api/debug/automation-runs?module=instrument-fundamentals`를 `.env.local`의 cron credential로 호출했다. 요청은 30초 제한시간에 응답 없이 timeout됐다. `GET https://stockman.r-e.kr/api/health`도 8초 안에 응답 본문을 주지 않았다. DNS는 해석되고 TCP 443 연결은 성공했지만 애플리케이션 HTTP 응답을 확인하지 못했다.
4. 이에 따라 `automation_runs`, `instrument_fundamental_history`, `instrument_fundamental_snapshots`, `us_instrument_universe_candles`를 통한 최신 운영 데이터 직접 조회는 미완료다. 이전 날짜의 채팅/문서에 남은 스냅샷 수치를 현재 이력으로 재사용하지 않았다.

## 운영 디버깅 API 재확인 (2026-10-14 KST)

이전 시도는 타임아웃이었으나, 사용자의 재요청에 따라 운영 API를 cron 인증 헤더로 재호출했다. secret 값은 출력하거나 문서에 기록하지 않았다.

- `GET /api/debug/automation-runs?module=instrument-fundamentals&limit=10&failureLimit=10&staleAfterSeconds=86400&includeSummary=true` 응답 HTTP 200. 조회 시각 `2026-10-14T06:50:53Z` (15:50:53 KST).
- 전체 기본정보 작업 로그: 7,874회 중 `SUCCESS 46`, `FAILED 10`, `SKIPPED 7,818`; 최신 로그는 `outside_interval` 스킵이다. 이 스킵은 하루 1회 실행 제한과 일치한다.
- 마지막 성공 기본정보 갱신: run `296134`, `2026-10-13 18:30:22Z`~`18:46:08Z` (10월 14일 03:30:22~03:46:08 KST), 946.5초. `instrumentCount=6,704`, `successCount=6,704`, `failureCount=0`으로 기록됐다. 실행 요약에는 시장별 성공/실패 수가 없어 국내/해외 각각의 완료 여부를 이 로그만으로 분리 검증할 수 없다.
- 기본정보 실패 10건은 최근 것이 아니라 9월 4~11일에 발생한 `AUTOMATION_RUN_STALE` (“The worker stopped before finalizing the run”) 기록이다. 현재 실행을 실패로 보지는 않지만 과거 실패 이력은 남아 있다.
- `GET /api/debug/automation-runs?module=us-daily-cache&status=SUCCESS&limit=1&failureLimit=1&staleAfterSeconds=86400&includeSummary=true` 응답 HTTP 200. 조회 시각 `2026-10-14T06:50:46Z` (15:50:46 KST). 성공 로그 364건, 실패 0건으로 집계됐다.
- 마지막 미국 캔들 캐시 성공: run `296601`, `2026-10-13 22:02:24Z`~`22:46:50Z` (10월 14일 07:02:24~07:46:50 KST). `instrumentCount=5,513`, `dailySuccessCount=5,512`, `failureCount=1`, `savedCandleCount=348,220`; 실패 샘플은 NYS `PFSI`, `D: KIS API failed (200)`. NAS/NYS/AMS 활성 보통주 유니버스 표본 수는 각각 3,359 / 1,916 / 238로 기록됐다.
- 따라서 운영 로그 기준으로 미국 일·주·월봉 캐시 작업은 최근 성공 완료됐으나 최소 한 종목(PFSI)의 일봉 수집 실패가 확인된다. 기본정보 갱신도 6,704개를 실패 없이 처리했다고 기록됐지만 시장별 분리 카운터 및 발행주식수 값 커버리지는 확인되지 않았다. 응답 성공/수집 성공 카운터만으로 `listed_shares`가 모든 종목에서 채워졌다고 단정할 수 없다.
- 무인증 `GET /api/health`는 45초 제한시간에도 timeout됐다. 반면 인증된 디버그 API는 16~26초가량 걸려 HTTP 200을 반환했다. 운영 응답 지연은 관측된 사실이며, 이번 조사만으로 지연 원인을 특정하지 않는다.

재현 가능한 읽기 전용 확인 명령은 아래와 같다. 프로젝트 PowerShell에서 실행하며 API secret은 출력하지 않는다.

```powershell
node --input-type=module -e 'import { loadLocalEnv } from "./scripts/local-env.mjs"; loadLocalEnv({override:true}); const r=await fetch("https://stockman.r-e.kr/api/debug/automation-runs?module=instrument-fundamentals&limit=10&failureLimit=10&staleAfterSeconds=86400&includeSummary=true", {headers:{accept:"application/json","x-cron-secret":process.env.CRON_SECRET?.trim()||""}}); console.log(r.status, await r.text());'
```

미국 캔들 작업은 URL의 `module=instrument-fundamentals`를 `module=us-daily-cache`로 바꾸어 조회한다. 브라우저 주소창 직접 호출은 `x-cron-secret` 헤더를 보낼 수 없으므로 401이 정상이며, 위처럼 헤더를 붙여야 한다.

## 재개 시 합격 판정에 필요한 실제 데이터

로컬 PostgreSQL을 시작할 수 있거나 운영 API가 응답하면 다음 두 read-only 조회로 검증한다.

1. `GET /api/admin/instrument-fundamentals-debug?limit=20&staleAfterHours=72`
   - `execution.latestRun`: 마지막 실제 실행 상태, 종료시각, elapsed, 종목별 실패 샘플
   - `execution.intervalStatus` / `overdueSeconds`: 24시간 실행 간격 초과 여부
   - `snapshotCoverage.byMarket`: NAS/NYS/AMS 활성 보통주 수, 스냅샷 수, 24·72시간 내 최신화 수, 누락·무효값 수, 최근 갱신시각
2. `GET /api/debug/automation-runs?module=instrument-fundamentals&limit=50&includeSummary=true`
   - 각 실행의 `status`, `startedAt`, `finishedAt`, `summary.markets`별 대상·수집·저장·실패 카운터를 최근 최소 7일치 확인
   - 성공 판정은 단순 HTTP 200이 아니라, 최근 실제 실행의 저장 수와 활성 유니버스 수 대조 및 미갱신·실패 종목 0건 여부로 한다.

추가로 DB 이력에서 시장별 최근 7일 `instrument_fundamental_history`의 일자별 고유 종목 수와 최신 `fetched_at`, 스냅샷과 최신 이력의 값 일치 여부를 비교한다. 캔들은 `automation_runs`의 `us-daily-cache`와 `us_instrument_universe_candles`의 timeframe별 최신 `candle_date` 및 `fetched_at`을 별도 검증한다. 이 검증 전에는 전체 해외 종목 정보가 잘 갱신된다고 결론 내리지 않는다.

상장주수 최신값의 실제 누락률은 아래와 같은 read-only 집계로 별도 확인한다.

```sql
SELECT u.market,
       COUNT(*) AS active_common_stocks,
       COUNT(s.code) AS snapshot_rows,
       COUNT(*) FILTER (WHERE s.listed_shares IS NULL OR s.listed_shares <= 0) AS missing_listed_shares,
       MAX(s.fetched_at) AS latest_snapshot_at,
       MAX(s.observed_at) AS latest_observed_at
FROM us_common_stock_universe u
LEFT JOIN instrument_fundamental_snapshots s USING (market, code)
WHERE u.enabled = true
  AND u.instrument_type = 'COMMON_STOCK'
  AND u.market IN ('NAS', 'NYS', 'AMS')
GROUP BY u.market
ORDER BY u.market;
```

## 수정 범위·검증

- 이번에는 기존 대량 미커밋 변경을 보존하고 코드·DB·운영 설정을 수정하지 않았다. 조사와 현재 검증 한계만 이 문서에 기록했다.
- 정적 근거: `lib/instrument-fundamentals.ts`, `app/api/cron/instrument-fundamentals/route.ts`, `lib/instrument-fundamental-refresh-repository.ts`, `lib/us-daily-price-cache-warm.ts`, `app/api/cron/us-daily-cache/route.ts`, `scripts/oci-cron.sh`, `docs/operations/instrument-fundamentals-debug-api.md`.
- 실제 운영 자동화 실행 이력: 읽기 전용 debug API로 확인 완료. 원천 필드별 운영 DB 스냅샷/발행주식수 누락률: 미확인 (로컬 DB 연결 거부, 관리자 상세 API는 admin session 필요).
- 커밋·푸시·배포: 수행하지 않음.
