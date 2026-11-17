# 운영 API 기반 로컬 일봉 캐시 전체 동기화 설계

## 목적

운영 서버의 일봉 캐시를 원천으로 사용해 로컬 PostgreSQL의 국내·해외 보통주 일봉 캐시를 UPSERT한다. 운영 DB와 로컬 DB를 직접 공유하지 않고, 인증된 운영 API를 통해서만 데이터를 이동한다.

## 구성

### `.env.local` 자동 구성 및 무인증 읽기 API

- 동기화 스크립트는 실행 시 프로젝트 `.env.local`을 읽는다. 로컬 PostgreSQL은 `DATABASE_URL`을 사용하고, 운영 URL은 `DAILY_CACHE_API_URL`, `PUBLIC_BASE_URL`, `RSS_BULLISH_REPORT_API_BASE_URL` 순으로 찾는다. 별도 셸 환경변수 설정은 필요하지 않다.
- 캔들·기본정보 API는 인증 없이 조회한다. API 주소만 있으면 되며, 운영 환경의 인증 키 설정 여부와 무관하게 같은 공개 읽기 계약을 유지한다.

1. 운영 `GET /api/public/daily-candles`
   - 인증 헤더 없이 시장·종목 목록·기간·봉 개수를 받아 종목별 최근 봉을 반환한다.
   - 다종목 조회는 `unnest(codes) + LATERAL LIMIT`으로 종목별 인덱스를 사용한다. 윈도 함수로 전체 시장 캔들 테이블을 먼저 스캔하지 않는다.
   - 동기화 스크립트는 봉/기본정보 요청 및 본문 읽기에 각각 35초 timeout을 적용하고, timeout·HTTP·본문 읽기·JSON 오류에 stage와 market을 표시한다. 요청 URL과 자격증명은 오류에 포함하지 않는다. Node.js의 `AbortSignal.timeout()` 동작은 [공식 문서](https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay)를 따른다.
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
node scripts/sync-daily-cache-async.mjs --market=ALL --timeframe=D --limit=120 --batch=10 --fetch-workers=2 --save-workers=2 --queue=10 --skip-fundamentals=true
```

## 데이터 무결성

- 운영 API 응답은 JSON·HTTP 성공·`ok/items` 구조를 모두 확인한다.
- 로컬 PostgreSQL pool은 `connectionTimeoutMillis=10000`으로 새 연결 대기 무한화를 방지하고, idle client의 `error` 이벤트를 받아 첫 sanitized 오류와 발생 횟수를 최종 JSON에 포함하며 exit code 1로 처리한다. 근거: [node-postgres Pool API](https://node-postgres.com/apis/pool).
- OHLCV는 현재 API·DB 계약에 맞춰 유한한 double precision 숫자로 저장하며 거래량은 비음수여야 한다. JSON number의 정수부가 JavaScript 안전 정수 범위를 넘을 때 생기는 원문 정밀도 손실은 이 계약만으로 복구할 수 없으므로 정확한 원천 값 보존이 필요한 경우 별도의 문자열/decimal API 계약이 필요하다.
- 각 봉의 `(market, code, timeframe, candle_date)`를 충돌 키로 사용한다.
- 배치 저장은 트랜잭션이며 저장 실패 시 해당 배치만 rollback한다.
- 기존 로컬 캐시는 삭제하지 않는다.
- API 키와 DB 연결 문자열은 로그에 출력하지 않는다.

## 성능 기준

- 운영 public API의 다종목 요청은 한 요청에서 최대 100종목을 받을 수 있지만, 기본 `--batch=10`부터 시작해 실제 응답 시간을 측정한다. 운영에서 batch를 늘릴 때도 timeout 및 504 여부를 먼저 확인한다.
- 운영 API 요청이 35초 안에 끝나지 않으면 현재 실행은 단계·시장·timeout으로 실패한다. 이 동기화 스크립트는 이후 배치를 계속하지 않으며 이미 커밋된 앞선 batch는 유지된다.
- 동기 실행 `sync-daily-cache-from-remote.mjs`는 요청 유니버스가 비었거나, 검증 저장 봉이 0건이거나, 응답에 봉이 없는 종목이 하나라도 있으면 시장별 `ok=false`를 반환하고 프로세스 exit code를 1로 설정한다. 누락 종목 표본은 `missingCodeSample`에서 확인한다.
- 기본정보 snapshot API는 보유된 row만 반환할 수 있으므로 미보유 종목은 `fundamentalsMissingCount`와 전체 시장 결과 기준 최대 20개의 `market:code` 표본 `fundamentalsMissingCodeSample`로 별도 노출하며 봉 적재 성공 여부에는 포함하지 않는다. 실패 batch의 `failure.fundamentalsMissingCodeSample`도 같은 `market:code` 형식으로 해당 batch 내 최대 20개를 제공한다. 반환된 기본정보는 요청 market/code 범위 및 중복 여부를 검증한 뒤에만 snapshot으로 저장한다.
- 최종 집계의 `received`/`saved`와 coverage counters는 commit된 batch만 반영한다. 실패한 현재 batch의 `failure.received`, `expectedSaveCount`, `duplicateCandleCount`, `missingCount`(fundamentals 단계 이후라면 fundamentals counters 포함)는 시도된 응답량을 별도로 보여준다. 동일 날짜·동일 OHLCV 중복은 한 행으로 저장하고 `duplicateCandleCount`에 집계한다. 같은 날짜에 OHLCV가 다르면 값을 임의 선택하지 않고 저장 전에 batch를 실패시킨다.
- async 동기화도 원본 수 `fetched`, 중복 제거 후 commit된 수 `saved`, commit된 `duplicateCandleRows`를 분리한다. 전체 성공은 시장별 `saved + duplicateCandleRows === fetched`일 때만 성립하며 rollback된 batch의 중복은 결과 counter에 포함하지 않는다.
- 진행 로그와 누적 저장/coverage 집계는 시장별 transaction commit이 성공한 뒤에만 갱신한다. 따라서 실패 시 마지막 `committed` 로그까지가 확인 가능한 영속 진행 경계다.
- batch 또는 universe 조회 중 오류가 나면 해당 시장의 부분 집계와 `failure.phase/market/offset/codeCount/error`를 포함해 `ok=false` 결과를 출력한다. `--market=ALL`에서는 한 시장의 오류가 다른 시장 조회를 막지 않으며, 최상위 결과는 실패가 하나라도 있으면 exit code 1이다.
- 최종 JSON은 요청 시장 처리와 DB pool 종료가 모두 끝난 뒤 출력한다. 예기치 않은 실행 오류와 pool 종료 오류도 각각 `fatalFailure`/`poolShutdownFailure`로 표시하고 최상위 `ok=false`, exit code 1에 반영한다.
- `--limit`과 `--batch`는 안전한 정수인지 DB pool 생성 전에 확인한다. 무효 문자열·소수·범위 밖 안전정수 값은 명시 오류로 거부하고, 정수의 정상 범위 밖 값은 기존처럼 허용 구간으로 제한한다.
- CLI는 `market`, `timeframe`, `limit`, `batch`, `skip-fundamentals`만 허용한다. 알 수 없는/중복 옵션, 위치 인자, 값이 비어 있는 옵션, boolean 이외 문자열은 DB pool/API 실행 전에 오류 처리한다.
- 원격 daily-candles/fundamentals 응답은 JSON object, `ok === true`, items 배열 및 item 구조를 수 집계보다 먼저 검증한다. JSON `null`이나 null/malformed row가 일반 TypeError 대신 stage·market이 포함된 응답 형식 오류로 처리되어야 한다. fundamentals의 nullable 숫자 필드는 API 응답에서 실제 `null` 또는 유한 JSON number여야 하며, 필드 누락·문자열·비유한 값은 저장 전에 거부한다. `name`은 문자열, `currency`는 존재하는 문자열 또는 null, `observedAt`/`fetchedAt`은 존재하는 유효 timestamp 문자열 또는 null이어야 한다.
- `failure.phase`는 API request/HTTP/body/JSON, envelope, items 검증, OHLCV 정규화, fundamentals 처리, DB 저장을 각각 구분한다(`daily-candles-request/http/body/json`, `daily-candles-envelope/items/normalize`, `instrument-fundamentals-*`, `database-save`).
- 실패 객체는 최상위 error와 함께 최대 4단계의 `errorDetails.cause` 및 `AggregateError.errors`를 보존한다. 오류 문구 안의 URI userinfo와 query parameter의 password/token/API·app key/secret/authorization/credential/signature 값은 마스킹한다.
- 로컬 트랜잭션 rollback 실패 시 해당 pool client를 파기하고 원본·rollback 오류를 함께 기록한다. COMMIT 요청 오류는 서버 commit 여부를 확인할 수 없으므로 `failure.transactionOutcome=COMMIT_UNKNOWN`으로 표시하고 해당 연결을 pool에서 제거한다. 이때 마지막 committed 진행 로그만을 해당 batch의 commit 증거로 간주하면 안 되며, 재실행 전 DB coverage를 재조회한다.
- 전체 동기화 완료 조건은 국내·해외 각각 `failed=0`, `saved>0`, 시장별 최신일 확인이다.
- 국내 운영 public cache가 비어 있으면 전체 fallback 호출은 장시간 작업이므로, 운영 서버의 국내 일봉 cache 자동화 또는 별도 bulk 원천 API가 먼저 정상화되어야 한다.

## 현재 검증 및 남은 작업

- 2026-10-02 로컬 스크립트 실행: 미국 활성 보통주 유니버스 5,343종목, limit=120, 537 운영 API 요청, 저장 584,334봉, 저장 검증 불일치 0. 성공 배치 495/535, 실패 40배치. 종목별 봉이 없는 경우 배치 전체를 실패 처리하므로 운영 캐시에서 하나 이상의 종목이 누락된 실패 배치의 나머지 종목도 이번 실행에는 적재하지 않았다. 결과 `ok=false`; AMS 203/243, NAS 2,900/3,210, NYS 1,840/1,890 보유. 시장별 최신 날짜 2026-10-01.
- 2026-10-02 당시 키 없는 운영 GET smoke check는 HTTP 401을 반환했다. 2026-10-29 소스에서 public daily-candles 인증 검사를 제거했으나, 소스 변경만으로 기존 운영 인스턴스 동작은 바뀌지 않는다. 새 무인증 동작은 이 변경의 운영 배포 후 확인해야 한다.
- `scripts/sync-daily-cache-async.mjs --only-unrefreshed=true`는 미국 보통주 중 최신 일봉 요약의 `fetched_at`이 최근 30분보다 오래됐거나 요약이 없는 종목만 재조회한다. 미국 응답에서 특정 종목의 봉이 비어 있으면 그 종목은 실패로 세되 같은 API 배치의 정상 종목들은 계속 UPSERT한다. 국내 시장의 chart fallback·누락 실패 동작은 그대로 유지한다.
- 기본 universe는 활성 일봉 종목만 포함하지만 US 일봉의 `--include-inactive-daily=true`가 지정되면 해당 제외 조건을 해제한다. `--us-market-cap-under`를 함께 쓸 때도 시총 snapshot eligibility query는 같은 active filter를 사용해야 한다.
- `--us-market-cap-under`는 USD 양수 시총과 `fetched_at` 최근 24시간 조건을 모두 만족하는 로컬 fundamental snapshot만 사용한다. 없거나 오래된 스냅샷은 fail-closed로 제외하며, 결과 `marketCapFilter`에는 `maxSnapshotAgeHours: 24`와 `unknownOrStaleExcluded: true`가 포함된다.
- US 일봉에서 `--only-missing-date=true`와 `--only-unrefreshed=true`를 함께 주면 지정일의 유효 봉이 없고 latest summary도 30분 이상 갱신되지 않은 종목만 선택한다. 유효성 필터에서 탈락한 summary는 미갱신으로 취급한다.
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
