# 운영 API 기반 로컬 일봉 캐시 전체 동기화 설계

## 목적

운영 서버의 일봉 캐시를 원천으로 사용해 로컬 PostgreSQL의 국내·해외 보통주 일봉 캐시를 UPSERT한다. 운영 DB와 로컬 DB를 직접 공유하지 않고, 인증된 운영 API를 통해서만 데이터를 이동한다.

## 구성

### `.env.local` 자동 구성 및 선택적 API 인증

- 동기화 스크립트는 실행 시 프로젝트 `.env.local`을 읽는다. 로컬 PostgreSQL은 `DATABASE_URL`을 사용하고, 운영 URL은 `DAILY_CACHE_API_URL`, `PUBLIC_BASE_URL`, `RSS_BULLISH_REPORT_API_BASE_URL` 순으로 찾는다. 별도 셸 환경변수 설정은 필요하지 않다.
- `DAILY_CACHE_READ_API_KEY`가 `.env.local`에 있으면 Bearer 인증을 보낸다. 값이 없어도 스크립트는 인증 헤더 없이 조회를 시도한다.
- 운영 서버에서 키 없이 읽으려면 배포 환경에서 `DAILY_CACHE_READ_API_KEY`를 설정하지 않아야 한다. 키가 설정된 배포는 기존처럼 인증을 계속 요구한다. 이 API는 일봉 읽기 전용이며 market/codes/limit 검증과 종목별 최대 300봉 제한을 유지한다.

1. 운영 `GET /api/public/daily-candles`
   - `Authorization: Bearer <DAILY_CACHE_READ_API_KEY>`를 요구한다.
   - 시장·종목 목록·기간·봉 개수를 받아 종목별 최근 봉을 반환한다.
   - 다종목 조회는 `unnest(codes) + LATERAL LIMIT`으로 종목별 인덱스를 사용한다. 윈도 함수로 전체 시장 캔들 테이블을 먼저 스캔하지 않는다.
2. 로컬 `scripts/sync-daily-cache-async.mjs`
   - 로컬 universe에서 `enabled=true`, `daily_active=true`, `instrument_type='COMMON_STOCK'`만 읽는다.
   - 시장별로 운영 API를 호출하고, 운영 응답을 로컬 `kr_instrument_universe_candles`·`us_instrument_universe_candles`에 트랜잭션 UPSERT한다.
   - 요청 timeout, bounded queue, fetch/save worker 수 제한, 실패 배치 집계를 사용한다.
   - 국내 운영 public cache가 비어 있는 경우에만 종목별 운영 `/api/stock/chart`를 fallback으로 시도한다.

## 실행 예

```powershell
$cfg = Get-Content .env.local | ConvertFrom-StringData
$env:LOCAL_DATABASE_URL = $cfg.DATABASE_URL.Trim('"')
$env:DAILY_CACHE_API_URL = $cfg.DAILY_CACHE_API_URL.Trim('"')
$env:DAILY_CACHE_READ_API_KEY = $cfg.DAILY_CACHE_READ_API_KEY.Trim('"')
node scripts/sync-daily-cache-async.mjs --market=ALL --timeframe=D --limit=120 --batch=10 --fetch-workers=2 --save-workers=2 --queue=10 --skip-fundamentals=true
```

## 데이터 무결성

- 운영 API 응답은 JSON·HTTP 성공·`ok/items` 구조를 모두 확인한다.
- 각 봉의 `(market, code, timeframe, candle_date)`를 충돌 키로 사용한다.
- 배치 저장은 트랜잭션이며 저장 실패 시 해당 배치만 rollback한다.
- 기존 로컬 캐시는 삭제하지 않는다.
- API 키와 DB 연결 문자열은 로그에 출력하지 않는다.

## 성능 기준

- 운영 public API의 다종목 요청은 한 요청에서 최대 100종목을 받을 수 있지만, 실제 응답 시간을 측정해 `--batch=10`부터 시작한다.
- 운영 API가 30초를 초과하면 해당 배치는 실패로 기록하고 다음 배치를 진행한다.
- 전체 동기화 완료 조건은 국내·해외 각각 `failed=0`, `saved>0`, 시장별 최신일 확인이다.
- 국내 운영 public cache가 비어 있으면 전체 fallback 호출은 장시간 작업이므로, 운영 서버의 국내 일봉 cache 자동화 또는 별도 bulk 원천 API가 먼저 정상화되어야 한다.

## 현재 검증 및 남은 작업

- 2026-10-02 로컬 스크립트 실행: 미국 활성 보통주 유니버스 5,343종목, limit=120, 537 운영 API 요청, 저장 584,334봉, 저장 검증 불일치 0. 성공 배치 495/535, 실패 40배치. 종목별 봉이 없는 경우 배치 전체를 실패 처리하므로 운영 캐시에서 하나 이상의 종목이 누락된 실패 배치의 나머지 종목도 이번 실행에는 적재하지 않았다. 결과 `ok=false`; AMS 203/243, NAS 2,900/3,210, NYS 1,840/1,890 보유. 시장별 최신 날짜 2026-10-01.
- 2026-10-02 키 없는 운영 GET smoke check는 HTTP 401을 반환했다. 소스 변경만으로 기존 운영 인스턴스 동작은 바뀌지 않는다. API 키 없는 접근은 수정사항 배포와 운영 `DAILY_CACHE_READ_API_KEY` 설정 제거 후 가능하다. 미배포 상태.
- `scripts/sync-daily-cache-async.mjs --only-unrefreshed=true`는 미국 보통주 중 최신 일봉 요약의 `fetched_at`이 최근 30분보다 오래됐거나 요약이 없는 종목만 재조회한다. 미국 응답에서 특정 종목의 봉이 비어 있으면 그 종목은 실패로 세되 같은 API 배치의 정상 종목들은 계속 UPSERT한다. 국내 시장의 chart fallback·누락 실패 동작은 그대로 유지한다.
- 2026-10-02 누락 복구 실행에서 401개 잔여 종목을 41 API 요청으로 조회해 358종목의 42,399봉을 추가 저장했다. 비어 있는 43종목은 미수신으로 남았다. 최근 실행 기준 DB 확인: AMS 238종목/28,060봉, NAS 3,177종목/374,225봉, NYS 1,885종목/224,331봉, 최신 거래일 2026-10-01. DB 갱신 검증 불일치 0.

- 2026-09-23 전체 배치를 실제 운영 API와 로컬 PostgreSQL로 완료했다.
- 해외: 활성 보통주 5,303종목, 531개 10종목 요청 배치, 625,322봉 수신·UPSERT, 배치 실패 0.
- 국내: 활성 보통주 2,347종목, 470개 5종목 요청 배치, 98,549봉 수신·UPSERT, 배치 실패 0.
- 로컬 DB 재조회: 코스피 759/759종목, 코스닥 1,588/1,588종목이 최신 `20260923` 봉 보유. AMS 240/240, NAS 3,177/3,177이 최신 `20260922` 봉 보유. NYS 1,886종목 중 1,885종목은 최신 `20260922`, GJT는 운영 API 최신 응답이 `20260921`이었다.
- 동시성 2 이상으로 수행한 국내 전체 시도에서는 운영 API `fetch failed`가 반복되어 저장 0건이었다. 단일 fetch worker·단일 fallback worker의 10종목 실측은 성공했고, 그 안정 설정으로 전체 국내 배치가 완료됐다.
- 봉 단위 SQL 반복 실행을 배열 기반 bulk UPSERT 한 번으로 바꿔 로컬 저장 round-trip을 줄였다. 운영 API 요청과 로컬 DB 저장은 각각 배치마다 트랜잭션 경계를 가진다.
- 운영 public API의 LATERAL 조회 최적화는 코드에 반영했지만 아직 운영 배포 전이다. 전체 적재는 배치 크기를 5~10으로 제한해 기존 운영 API에서도 완료했다. API SQL 최적화의 운영 반영·응답시간 비교는 별도 배포 후 측정 항목이다.

## 소요시간 병목 분석 (2026-09-23)

- 이 흐름은 DB 간 직접 복사가 아니다. 로컬 스크립트가 운영 HTTP API를 호출하고, 운영 서버가 DB에서 조회·JSON 직렬화한 뒤 네트워크로 전달하며, 로컬에서 다시 파싱·UPSERT한다.
- 국내 운영 API의 다종목 캐시가 비어 있어 470개 배치 조회가 빈 데이터로 돌아왔다. 코드가 이를 성공으로 간주하지 않고 `/api/stock/chart` fallback을 탔으며, 해당 경로는 종목당 HTTP 요청 1회다. 따라서 성공한 국내 동기화만으로도 배치 조회 470회 + 개별 fallback 2,347회, 총 약 2,817회의 운영 API 왕복이 발생했다.
- fallback 동시성은 과거 동시성 2 이상에서 `fetch failed`가 반복된 뒤 안정성 우선으로 1로 낮췄다. 결과적으로 최대 한 건씩 2,347개 종목을 순차 처리해 네트워크 지연이 종목 수에 비례해 누적됐다. 앞선 실패한 전체 시도도 재실행 시간을 추가했다.
- 해외는 배치당 10종목으로 531회 요청해 국내처럼 종목당 요청을 하지 않았다. 두 시장 모두 로컬 저장은 캔들별 개별 SQL이 아니라 배치당 배열 UPSERT로 줄였으므로, 이번 지연의 주된 구조적 병목은 국내 fallback HTTP 왕복이다.
- 실행 로그에 fetch 시간, fallback 요청 수/시간, DB 대기·UPSERT 시간의 구간별 duration이 기록되지 않아 53분 안팎으로 걸린 실패 시도에서 각 단계가 차지한 시간을 정확히 분해할 수는 없다. 단일 종목 차트 요청에서 관측했던 약 1.18초는 참고 사례일 뿐 전체 요청의 평균으로 간주하지 않는다.
- 개선 우선순위: (1) 운영 국내 캐시를 채워 기존 bulk API가 바로 데이터를 반환하도록 운영 자동화/캐시 상태를 정상화, 또는 (2) 종목별 chart fallback을 서버 측 market+codes bulk API로 통합, (3) 단계별 duration·요청 수·재시도·처리량을 로그와 결과 JSON에 기록한다. 서버 자원 안정성을 확인하기 전 동시성만 높이는 방식은 반복 실패 위험 때문에 우선하지 않는다.

## 무결성 오류와 회귀 방지

- **발견된 심각한 오류**: 국내 fallback 개별 요청이 실패해도 경고만 남기고 계속 진행했기 때문에 해당 종목이 빠진 채 최종 배치 `failed=0`·`ok=true`로 보일 수 있었다. 또한 bulk 응답에 일부 종목만 있는 경우 fallback은 응답 전체가 비었을 때만 실행되어 부분 누락이 조용히 통과할 수 있었다.
- **완료 판정 결함**: 실패 배치가 있어도 JSON `ok=false`를 출력할 뿐 프로세스 종료 코드는 0일 수 있어, 스케줄러/CI가 실패를 성공으로 오인할 수 있었다. 빈 유니버스·0봉·fetch/save 행 수 불일치도 성공으로 판정될 수 있었다.
- **수정**: fallback을 종목별 누락 기준으로 적용하고 요청 목록 순서로 결과를 정규화한다. 실패·빈 응답 종목은 배치 실패로 올리며 모든 시장에서 요청한 각 종목의 봉 존재를 검증한다. 성공은 비어 있지 않은 유니버스, 실패 0, 수신봉>0, 수신·저장 행 수 일치, fallback 실패 0 조건을 전부 만족할 때만 인정하고 그 외에는 프로세스 종료 코드 1을 반환한다.
- **관측성**: 결과 JSON에 전체 HTTP 요청 수·HTTP 경과시간·fallback 경과시간·DB 저장 batch 수와 저장 경과시간을 포함한다. HTTP 시간은 fallback 포함 총합이고 fallback 시간은 그 하위집합이므로 두 수치를 더하지 않는다.
- **회귀 테스트**: 일부 종목만 bulk 응답된 상황, fallback 오류/빈 응답, 요청 순서 보존, empty/partial/save mismatch/failure 실행의 비성공 판정을 단위 테스트한다.
- **이전 실행에 대한 한계**: 당시 DB의 시장별 최신일·종목별 cache 존재는 검증했으나 fallback 개별 실패 집계를 보존하지 않았다. 따라서 그 run의 최종 batch `failed=0`만으로는 전체 fallback 성공을 증명하지 못한다. 수정 후의 실패 판정과 수신·저장 합계 계측을 기준으로 한다.

## 최신봉 요약 캐시 동기화 (2026-09-25)

- 전체 refresh 경로는 원본 `*_instrument_universe_candles`만 UPSERT하고, 조회·스크리너에 사용되는 `kr_latest_daily_candles` 및 `us_latest_daily_candles` 요약 테이블을 갱신하지 않는 결함이 있었다. 실제 로컬 원본은 국내 `20260923`, 해외 `20260924`까지 있었지만 두 요약 캐시는 `20260921`에서 멈춰 있었다.
- 수정 후 일봉 sync는 원본 캔들과 최신 거래봉 요약을 동일한 DB transaction에서 UPSERT한다. 요약은 종목별 최신 `volume > 0` 및 유효 `close` 봉으로 산출하며, 더 최신인 기존 요약을 과거 데이터로 되돌리지 않는다.
- 저장 후 입력 봉의 키·OHLCV·transaction timestamp를 DB에서 검증한다. 요약봉도 입력 날짜 이상인지 검증하고, 최신일이 같으면 OHLCV 일치를 요구한다. 실패하면 해당 배치 전체를 rollback한다.
- 원본 기반 안전 UPSERT로 기존 요약을 복구하고 종목별 검증했다: KOSDAQ 1,668/1,668, KOSPI 787/787, AMS 247/247, NAS 3,228/3,228, NYS 1,900/1,900 일치, 불일치 0. 최신 날짜는 국내 `20260923`, 해외 `20260924`다.
- 실운영 GET API→localhost DB의 10종목 smoke test가 양 시장 모두 통과했다(KR 420봉, US 1,200봉; failed 0). 전체 동기화는 다음 실행에서 적재 카운터와 종목별 최신일 품질을 다시 검증해야 한다.

## 동기화 결과의 종목별 최신일 커버리지

- 각 시장 결과에 `candleCoverage`를 포함한다. 이 값은 실제 DB 저장 트랜잭션에 성공한 응답만 대상으로 계산하며, 실패한 fetch/save 배치는 persisted로 세지 않는다.
- 시장별로 요청 종목 수, 저장된 종목 수, 봉 누락 종목 수, 해당 시장 내 최신 봉 날짜, 그 날짜까지 도달한 종목 수, 더 오래된 봉만 있는 종목 수와 최대 10개 표본을 제공한다.
- KOSPI/KOSDAQ, NAS/AMS/NYS를 각각 독립 집계한다. 서로 다른 시장의 휴장일·데이터 범위를 하나의 날짜로 섞지 않는다.
- 최신일 커버리지는 관측 지표이며 그 자체만으로 전체 동기화를 실패시키지 않는다. 무거래·거래정지·시장별 달력 차이가 지연처럼 보일 수 있으므로 거래상태 정책이 확정되기 전에는 `failed`와 분리해 운영자가 판단한다.
- helper 회귀 테스트는 시장 분리, 누락 batch, 종목 중복 제거, 최신일 도달/지연 표본 및 빈 universe를 검증한다.
