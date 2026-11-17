# 미국·한국 일봉 캐시 적재 진단 (2026-11-11)

## 목적과 범위

사용자 요청에 따라 미국 일봉을 먼저 확인하고, 그 뒤 한국 일봉을 확인했다. 현재 worktree의 `.env.local`은 `localhost:5432/stockman` 로컬 PostgreSQL을 지정한다. 따라서 아래 DB 수치는 이 로컬 DB의 증거이며 운영 DB 현재 상태를 증명하지 않는다. KIS 키 원문은 문서와 출력에 기록하지 않았다. 진단은 읽기 전용이며 적재·재시도·운영 설정을 변경하지 않았다.

## 미국 일봉

- 공식 보통주 적재 대상(현재 universe 필터 적용): AMS 256, NAS 3,233, NYS 1,831.
- 각 시장의 모든 대상 종목이 해당 시장 최신 일봉 `20261027`을 보유한다. 시장별 최신일 기준 누락 0, 지연 0.
- 일봉 캐시의 마지막 `fetched_at`은 2026-10-28 03:19:53 UTC (12:19:53 KST)다. D 행의 기본 필수 필드는 모두 존재하고 `close > 0`, `high >= low`, `volume >= 0`이다.
- OHLC 내부 일관성 보조 검사에서 `high < max(open, close)` 또는 `low > min(open, close)`인 행 602개가 발견됐다. 이는 조정 시세 등의 원인일 수도 있어 오류로 단정하지 않았고, 원본 KIS payload 기준 정밀 대조가 남았다.
- `automation_runs`의 마지막 비-SKIPPED 실행은 2026-09-10 SUCCESS로 보이지만 요약은 `instrumentCount=5316`, `failureCount=10043`, `dailySuccessCount=0`, `savedCandleCount=0`이며 오류 표본은 `fetch failed`다. 즉 SUCCESS 라벨은 수집 성공을 의미하지 않는다. 2026-09-10 이후 실행 기록은 없다.
- 따라서 현재 로컬 캐시의 최신 거래일 커버리지는 양호하지만, 자동 수집 작업이 현재도 정상 주기 실행된다는 증거는 없고 실행 이력의 성공 판정은 실패 카운터를 덮어쓰는 결함이 있다.

## 한국 일봉

- DB 대상 universe: KOSDAQ 1,591, KOSPI 761. 현재 일봉 최신 날짜는 양 시장 모두 `20261021`이며 최종 fetched 시각은 2026-10-21 07:11:32 UTC (16:11:32 KST)다.
- 각 시장 최신일 기준으로 KOSDAQ 1,248/1,591, KOSPI 524/761만 최신이다. 활성 종목 기준으로도 KOSDAQ 309개, KOSPI 224개가 최신일보다 지연됐고 각 시장 1종목은 일봉이 없다. 시장 최신 거래일 이후 캐시가 갱신되지 않은 상태다.
- 마지막 비-SKIPPED `kr-daily-cache` 실행은 2026-08-26 FAILED (의도적 서버 재시작으로 worker 중단)이고 이후 성공 실행 증거가 없다.
- 실패 이력에는 KIS `초당 거래건수를 초과하였습니다` 및 KOSDAQ 일부 `KIS returned no candles`가 있다. 한국 job concurrency는 2이고 KIS request throttle은 프로세스별 최대 10 TPS다. 과거 실패 시점의 전체 트래픽/다중 프로세스 합산은 이 로컬 DB만으로 확정할 수 없다.
- 재시도 테이블은 전체 market 기준 PENDING 7,352개이며, KR KOSPI/KOSDAQ 기준은 앞선 원시 집계에서 7,275개였다. 그중 216개는 `last_error`가 성공 응답 문구 `정상처리 되었습니다`다. 재시도 항목 중 일부는 `Q500xx` 상품 코드로 보이지만, 공식 마스터의 보통주 판정 전에는 수동 재시도하지 않는다. 이 상태로 pending 수를 순수 실패 수로 해석하면 안 된다.
- `syncDailyActivityStatus`는 최신 일봉에서 7일 넘게 지연된 종목을 `daily_active=false`로 바꾸며, KR refresh의 D stale 조회는 `daily_active`가 아니라 `enabled`와 `COMMON_STOCK`를 기준으로 검사한다. 현재 지연 enabled 종목은 KOSDAQ 343개 중 342개가 1시간 freshness를 초과했고, KOSPI 237개 중 236개가 freshness를 초과했다. 따라서 이 로컬 DB 상태만으로 stale 선정 누락을 근본 원인으로 결론 내릴 수 없다. 운영 재가동 전에 scope와 stale set 교집합을 재조회해야 한다.
- 저장된 한국 일봉 333,335행에서 필수 OHLCV 결측, 종가 0 이하, high/low 역전, 음수 거래량은 0건이다.

## 확인한 수집 코드 흐름과 진단상 결함

- 미국 cron은 시간별 OCI cron이 `/api/cron/us-daily-cache`를 호출하며 `warmUsDailyPriceCache`가 시장 최신 summary 누락/오래된 종목과 underfilled 종목을 수집한다.
- 한국 cron은 `/api/cron/kr-daily-cache`에서 `runKrDailyCacheNow`를 호출한다. KIS 응답이 비어 있거나 실패하면 failure history와 retry queue에 기록한다.
- 두 market의 마지막 성공 실행이 오래됐는데도 로컬 캐시는 최신 거래일을 일부/전부 포함한다. 운영 로그·로컬 DB 동기화 시각 차이가 있어 cron 증거와 캐시 증거를 같은 데이터 소스로 재검증해야 한다.
- KR 외부 fetch는 `FID_COND_MRKT_DIV_CODE=J`를 사용하며 market은 저장 키로만 전달된다. 현재 코드상 KOSPI/KOSDAQ 호출 파라미터는 의도된 통합 시장 값으로 보인다.
- 자동화 완료 분류는 `failureCount`만으로 `PARTIAL`/`FAILED`를 판정하고 `successCount`와 `savedCandleCount`의 전체 대상 coverage를 검사하지 않는다. 미국의 0 성공·0 저장 실행이 `SUCCESS`로 남은 직접 원인이다.
- 실패가 `rt_cd=0`이지만 파싱 봉이 빈 케이스일 때 US 경로는 오류 문자열이 `KIS returned no candles`이고, KR 경로도 parsed count를 기준으로 실패 처리한다. 다만 KR retry 테이블에 `정상처리`가 남은 건은 과거 다른 실행/버전에서 오류 저장 값이 부정확했을 가능성을 시사한다.

## 다음 운영 검증 및 복구 순서

1. 운영 호스트에서 `us-daily-cache`, `kr-daily-cache` 실행 이력과 크론 서비스 마지막 exit/result를 확인한다. KIS 키 존재 여부·길이만 마스킹해 확인하고 값을 로그에 남기지 않는다.
2. 운영 환경에서 공식 활성 보통주 마스터와 `*_latest_daily_candles`를 `(market, code)`로 join해 시장별 대상·최신·누락·지연 종목 수를 기록한다. 로컬 DB 결과를 운영값으로 대체하지 않는다.
3. 운영 KIS 자격증명으로 한 종목씩 동일 application fetch 경로를 시험한다. 미국은 거래소별 보통주, 한국은 KOSPI와 KOSDAQ에서 각각 한 종목을 선택하고 `HTTP`, `rt_cd`, `msg_cd`, `msg1`, 파싱 봉 수·최신일을 기록한다.
4. 한국 단일 종목 호출이 통과한 경우에만 retry 대상과 정식 universe 대상의 교집합을 확인해 점진적으로 수집 재개한다. 비보통주 및 master 분류 미확인 코드는 제외한다. 전체 worker 재실행은 overlap lock과 TPS 결과를 먼저 확인한다.
5. 배치 종료 후 automation run 성공 라벨 대신 대상 수, 성공 수, 저장 종목 수, 시장 최신일 coverage, 실패 수, retry pending의 `last_error`를 검증한다.

## 근본 원인 후보와 재발 감지

- **확정된 운영 가시성 결함**: DB 실행 이력의 성공 라벨이 실제 성공·저장 수와 어긋난다. 재발 감지는 각 실행에서 `instrumentCount > 0`, `dailySuccessCount`, `savedCandleCount`, 실패 수를 같이 비교하고, 대상 대비 최신 봉 coverage gate를 검사한다.
- **확정된 정체 상태**: 이 로컬 DB에서 US cron 실행 이력은 2026-09-10, KR은 2026-08-26 이후 없다. 재발 감지는 최신 비-SKIPPED run age와 로컬 DB 최신 `fetched_at` age를 각각 독립 경보로 둔다.
- **유력한 KR 신선도 문제**: 2026-10-21 이후 저장 갱신이 없고 최신일 coverage가 불완전하다. 원격 운영 상태·스케줄러 활성 여부·재시도 backlog를 확인해야 원인을 분리할 수 있다.
- **retry 큐 오염**: `PENDING`의 성공 문구는 retry용 queue가 실패 이력과 정합적이지 않음을 보여준다. 성공 문구 행은 실패로 재호출하기 전에 공식 instrument master에서 보통주 여부를 확인한다.
- **미확인 위험**: KIS 단일 종목 live 호출, 운영 DB, 운영 cron host, 미국 602개 OHLC 내부 관계 이상 원문 대조는 이번 세션에서 실행/접근하지 못했다.

## 변경 및 검증 상태

- 변경 파일: 본 진단 문서만 신규 작성 예정.
- 코드·캐시·설정 변경: 없음.
- 검증: 로컬 PostgreSQL 직접 read-only 집계, 소스 경로 확인. TypeScript 단일 fetch 시도는 프로젝트에 설치되지 않은 `tsx` import로 실행되지 않았다. 전체 빌드·테스트는 변경 파일이 없는 조사 작업이므로 수행하지 않았다.
- 커밋·푸시·배포: 없음.

## 2026-11-11 운영 공개 캐시 GET 후속 확인

운영 호스트의 인증 없는 읽기 전용 `GET /api/public/daily-candles`를 사용해 2026-11-11 추가 확인했다. 이 endpoint는 단일 코드 또는 최대 100개 코드를 조회할 뿐 활성 보통주 유니버스 전수 목록을 반환하지 않으므로 아래는 표본 결과다.

- 미국 NAS 표본 10개(AAPL, MSFT, NVDA, AMZN, TSLA 등)는 10/10이 최신일 `20261110`을 반환했다. NYS 표본에서는 WMT가 NYS key에 봉이 없었지만 NAS key에서 `20261110` 봉을 반환했다. AMS 표본 BARK도 AMS key는 비었고 NYS key에서는 `20261110` 봉을 반환했다. ticker와 market key를 정확히 매핑하지 않고 시장별 누락으로 세면 잘못된 누락 판정이 된다. 확인한 두 ticker는 운영 API 결과에서 NYS 기준 봉이 존재한다.
- 한국 KOSPI 표본 7/7과 KOSDAQ 표본 5/5는 모두 최신 `20261109`를 반환했다. 과거 로컬 DB에서 오래됐던 KOSDAQ 062970과 KOSPI 002780도 운영 캐시에서 각각 `20261109`까지 확인됐다.
- 한국 코드 0126Z0·0009K0도 운영 API가 `20261109` 봉을 반환했으나 이 진단에서 공식 마스터의 COMMON_STOCK 여부를 검증하지 않았으므로 보통주 coverage에는 포함하지 않는다.
- 응답은 `source=OPERATING_DB_CACHE`, `returnedCount=3`, `dataUpdatedAt`을 포함했고 대표 종목의 실제 운영 적재가 확인됐다. 단, 표본 결과는 전체 시장 전수 적재 coverage를 증명하지 않는다. US 공개 metadata API는 ticker 중복 시 409 가능성이 있고, 공개 daily candle API는 universe/집계 endpoint가 없으므로 전수 coverage와 automation run 상태는 계속 미확정이다.
- 이 운영 API read-only GET은 DB 상태를 수정하지 않았다. 단일 GET은 200, 복수 표본 GET도 성공했으나 일부 `us-stock-metadata` ticker 조회는 15초 timeout됐다.
- 추가 20종 분산 NAS 표본도 `20261110` 20/20, 직전 거래일 `20261109`로 확인했다. 이어지는 여러 market 호출은 PowerShell HTTP 25초 timeout/세션 종료로 결과가 출력되지 않아 성공·실패 분모에 넣지 않았다.
- 12코드 이내 운영 alias batch를 추가 조회했다. NYSE·NASDAQ·NYSE American 표기를 혼합한 US 표본 3개 그룹(각 10개)은 총 30/30에서 `20261110` 봉이 존재했다. KOSPI·KOSDAQ 혼합 KR 표본 2개 그룹(각 10개)은 총 20/20에서 `20261109` 봉이 존재했다. US 40종 한 요청은 HTTP 25초 timeout으로 표본 분모에서 제외했다. 이 결과는 표본 품질만 확인하며 활성 유니버스 coverage를 증명하지 않는다.
- US 100코드 단일 batch와 100코드를 10개씩 나눈 sequential batch 모두 세션 제한 내 최종 결과를 회수하지 못했다. US/KR 각 10개 표본 재조회는 다시 HTTP 200, US `20261110` 10/10, KR `20261109` 10/10으로 정상 응답했다.
- `GET /api/debug/automation-runs`는 코드상 `x-cron-secret` 허용을 확인했다. 인증 확인용 invalid-module 요청은 HTTP 400, 209ms로 돌아와 네트워크/인증은 정상이다. 반면 해당 snapshot 요청은 module filter 및 30일 `since` 범위를 사용하고 `includeSummary=false`로 호출해도 30초 이내 응답을 얻지 못했다. `includeSummary`는 전체 통계·실패 category·skip reason SQL을 생략하지 않는다. 운영 호스트나 운영 PostgreSQL direct read-only 접속 정보는 현재 `.env.local`에 없으므로 다른 경로의 직접 쿼리는 불가했다.

## 2026-11-11 운영 관리자 인증 후 run 및 schedule 진단

환경변수 관리자 암호로 운영 `/api/admin/login`에 인증하고, HttpOnly session cookie를 메모리에서만 사용해 read-only 관리자 API를 조회했다. 암호·세션 cookie·webhook 설정은 결과 문서에 저장하지 않았다.

### 미국 일봉

- 최근 7일 automation 집계: SUCCESS 10, PARTIAL 0, FAILED 0. 최근 한 시간 안에 RUNNING은 0이다. 7일 집계상 stale RUNNING 2건은 있으나 현재 처리 중인 실행은 아니다.
- 최신 full-universe 성공 run: 시작 `2026-11-10 06:02:05 KST`, 완료 `07:27:55 KST`. 대상 5,142, 성공 5,142, 일봉 성공 5,142, 실패 0, 저장 154,143봉. 세 거래소 대상은 NAS 3,119, AMS 230, NYS 1,793이다.
- 운영 설정은 enabled, 06:00–08:00 KST, 1시간 간격, 월~토(`activeDays=[1,2,3,4,5,6]`)이다. 최근 `outside_schedule` skip은 KST 08:33에 관찰되어 설정 창 종료 뒤의 정상 skip과 일치한다.
- 최신 US public cache 표본 30개는 `20261110`까지 존재한다. 10개 재조회 역시 10/10이 `20261110`이다. 최근 full run은 그보다 전날 아침에 종료됐으므로 최신 개별 cache는 후속 호출/실행에서 갱신됐을 수 있으며, 이 API 표본으로 5,142종 전체의 현재 거래일 parity를 확정할 수는 없다.

### 한국 일봉

- 최근 7일 automation 집계: SUCCESS 8, PARTIAL 0, FAILED 0. 최근 한 시간 안에 RUNNING은 0이다.
- 최신 성공 run: 시작 `2026-11-09 16:43:35 KST`, 완료 `16:44:23 KST`. 당시 eligible 일봉 cache가 `2,350 / 2,350`으로 coverage `1.0`이었다. 이 실행은 stale/retry 요청 3종을 처리했고 3 성공·0 실패, 일봉 성공 3이었다. 즉 당시 전체 cache 기반은 갖춰져 있었고 요청된 갱신도 성공했다.
- 운영 설정은 enabled, 15:40–16:50 KST, 1시간 간격, `activeDays=[1,3,4,5]`다. `lib/schedule-time.ts`는 KST 요일을 `Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6`으로 계산한다. 따라서 설정은 화요일을 제외한다.
- 운영 public cache 표본 20종은 `20261109`까지 봉을 반환했고, 과거 지연 종목 062970·002780도 `20261109`까지 확인됐다. 오늘은 2026-11-11 수요일이며, 현재 확인 시각 KST 08:34에는 화요일 거래분 `20261110`이 sample에서 아직 보이지 않았다. 화요일은 스케줄이 꺼져 있고 마지막 성공이 월요일 16:43 KST였으므로 이 하루 공백은 운영 schedule 설정으로 설명된다. 수요일 다음 예정 창은 15:40–16:50 KST이다.
- `goldenCrossCache.failureCount=2350`은 일봉 후속 골든크로스 캐시 실패 수다. 이 run summary에서 일봉 성공 3/3, 실패 0, cache coverage 2,350/2,350과 분리해 해석한다. 골든크로스 후속 실패 자체는 별도 결함으로 남는다.

## 최종 판정 및 조치 상태

- **미국:** 최근 전수 run은 대상 5,142종목 전부 성공, 실패 0, 154,143봉 저장으로 정상이다. 운영 public 표본은 최신 `20261110`까지지만 현재 전수 날짜 parity와 stale-running 두 이력의 원인은 미확정이다.
- **한국:** 기본 일봉 cache는 월요일 run 당시 2,350/2,350이며 요청된 세 갱신은 성공했다. 다만 운영 activeDays에서 화요일이 빠져 화요일에는 자동 갱신이 실행되지 않는다. 확인 시점 표본은 `20261109`여서 하루 지연 상태다. 따라서 “매 거래일 적재” 요구 기준으로는 정상이라고 할 수 없고, 원인은 스케줄 설정의 요일 누락이다.
- 운영 schedule은 수정하지 않았다. 사용자는 진단을 요청했으며 운영 설정 변경은 요청하지 않았다. 화요일 자동 갱신을 원하면 KR `activeDays`에 `2`를 포함해야 한다.
- 코드·cache DB·운영 module 설정 변경 없음. 인증된 운영 GET, public cache GET만 수행했다. 커밋·푸시·배포 없음. 이 결론은 미국 성공과 한국 schedule 결함의 진단 완료를 기록한다.
