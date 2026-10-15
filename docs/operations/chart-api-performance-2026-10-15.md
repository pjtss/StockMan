# 차트 모달 API 성능 개선 실측 보고서 (2026-10-15)

## 목적과 근본 원인

`GET /api/stock/chart`에서 느린 원격 경로의 대기시간이 KIS/DB 경로보다 먼저 직렬로 소진되어, 첫 화면 응답이 수십 초까지 늘어나는 사례가 있었다. 지표 캐시는 사용하지 않는 원칙을 유지하면서 빠른 fallback과 동일 종목 반복 열기 속도를 개선한다.

## 반영 내용

- 원격 일봉 캐시 요청 timeout은 10초에서 2초로 줄인 뒤, 같은 원격 cache API가 10초 직접 호출에도 응답하지 않아 최종 750ms로 조정했다.
- 원격 차트 API fallback timeout을 45초에서 8초로 줄였고, KIS 및 로컬 DB miss 뒤 마지막으로만 호출한다.
- 프로세스 내 원시 OHLCV 캐시를 추가했다(TTL 60초, 최대 128개 키). 키에는 시장·거래소·종목·봉 주기를 포함한다.
- 이 캐시는 원시 OHLCV 및 거래대금만 저장한다. 지표는 매 요청 `buildChartDataFromCandles`로 재계산한다.
- `Server-Timing` 응답에 전체 차트 시간과 `remote-cache`, `kis`, `db-cache`, `remote-chart-fallback`, `fundamentals` 단계별 소요시간을 추가했다.

## 로컬 실측 결과

2026-10-15, `.env.local`을 주입한 로컬 개발 서버와 Docker DB에서 동일 API를 첫 요청/즉시 재요청 순서로 직접 실행했다. JSON 응답을 파싱하고 HTTP 상태, 봉 개수, 최신 봉 날짜, `Server-Timing`을 확인했다.

| 시장·종목 | 이전 확인값 | 개선 후 첫 요청 | 개선 후 즉시 재요청 | 응답 |
|---|---:|---:|---:|---|
| 미국 AAPL 일봉 | 64,373ms (기존 서버 로그) | 3,946ms | 268ms | HTTP 200, 100봉, 최신 2026-10-14 |
| 국내 035760 일봉 | 56,152ms (이전 API 타이밍) | 2,422ms | 106ms | HTTP 200, 39봉, 최신 2026-10-15 |

- AAPL 첫 호출: `chart=3426ms`, `remote-cache=2020ms`, `kis=940ms`, `fundamentals=465ms`.
- AAPL 반복 호출: `chart=183ms`, `fundamentals=181ms`; 원시 봉 캐시가 적중했고 지표는 응답 경로에서 재구성됐다.
- 035760 첫 호출: `chart=2145ms`, `remote-cache=2007ms`, `kis=91ms`, `fundamentals=47ms`.
- 035760 반복 호출: `chart=13ms`, `fundamentals=12ms`.
- 최종 750ms timeout 및 새 cold 키에서 005930 국내 일봉은 1,117ms(`chart=929`, `remote-cache=768`, `kis=104`, `fundamentals=57`), MSFT 해외 일봉은 1,268ms(`chart=1189`, `remote-cache=757`, `kis=45`, `fundamentals=386`)였다. 즉시 재요청은 각각 240ms(`chart=22`), 328ms(`chart=232`)였다.
- 최종 timeout에서 주·월봉도 확인했다. 국내 005930 주봉 1,296ms/100봉, 월봉 1,424ms/60봉. 해외 MSFT 주봉 2,088ms/100봉, 월봉 1,923ms/100봉. 모두 HTTP 200과 최신 봉 날짜가 확인됐다. 미국 주·월봉 KIS 단계는 약 1.0초였다.
- 최종 timeout 변경 뒤 exchange hint 없이 같은 AAPL/035760 티커도 조회해 각각 458ms/481ms에 HTTP 200을 확인했다. 이 경로는 거래소 hint가 없는 정상 요청이며 exchange가 지정된 실측과 직접 비교하지 않는다.
- 동일 원격 cache endpoint 직접 호출에서 KOSDAQ/NAS 쿼리는 10초 timeout, KR/US alias는 400 `INVALID_QUERY`로 응답했다. 운영 endpoint와 현재 저장소의 alias 지원 코드 버전 차이 또는 원격 DB/네트워크 지연이 남은 원인이다. 비밀 URL/자격증명은 출력하거나 저장하지 않았다.
- 2초 timeout 단계의 기존 비교는 AAPL 약 93.9%, 035760 약 95.7% 개선이었다. 최종 750ms 단계에서는 cold 일봉이 새 종목 키 기준 약 1.1~1.3초였다. 이 단일 표본은 외부망·KIS·호스트 부하를 통제하지 않았으므로 성능 보장치가 아니다.
- 로컬 개발서버 재기동 직후 첫 왕복에는 middleware 요청 로그 route cold compile과 로컬 `request_logs` DB 저장 실패가 추가됐다. handler `Server-Timing`과 외부 fetch 전체 시간을 분리해 기록했다. 차트 API 자체는 HTTP 200으로 정상 응답했다.

## 회귀 검증

실행: `npm.cmd test -- --run app/api/stock/chart/route.test.ts app/api/public/daily-candles/route.test.ts lib/chart-candle-memory-cache.test.ts`

결과: 테스트 파일 3개, 테스트 10개 통과. 캐시 키 격리·TTL·비정상 입력 제외, 원시 봉만 저장, 메모리 적중 후 지표 재계산, 거래소 우선 조회, 로컬 공급자 실패 뒤 원격 폴백을 검증한다.

## 남은 위험과 후속

- 원격 캐시 RTT가 750ms를 넘으면 KIS/DB 경로로 이동한다. 운영 `Server-Timing` 표본에서 cache hit/timeout 비율을 확인한 뒤 조정해야 한다.
- 메모리 캐시는 단일 Node 프로세스 안에서만 공유되며 재시작 시 사라진다. TTL 내 반복 조회의 가속 용도이고, 최종 데이터 공급자는 유지한다.
- fundamentals 조회는 매 요청 실행한다. 후속 최적화는 DB 실행계획과 실측 지연을 확인한 뒤 범위를 정하며, 지표 캐시는 추가하지 않는다.
- 초기 배포 검증은 KIS boundary audit에서 `lib/kis-ipo-listing-schedule.ts` 미등록으로 차단됐다. 배포 범위에 포함하도록 공식 모듈 레지스트리와 boundary test mapping을 등록하고 모듈 테스트를 추가했다.

## 최종 배포 검증 (2026-10-15)

- `npm.cmd run deploy:verify` 성공 종료 코드 0.
- 구조 게이트: `docs:check`, verify-scope audit, KIS boundary audit, OCI cron check 모두 통과.
- 프로덕션 빌드 및 타입 검사 통과.
- 전체 테스트: 265개 파일 통과, 1,279개 테스트 통과, 2개 skip.
- 런타임 스모크: `/charts`와 `/manifest.webmanifest` 모두 HTTP 200.
- 위 검증은 로컬 변경사항 기준이다. 이 기록을 작성하는 시점에는 커밋·푸시·운영 배포가 아직 완료되지 않았다.
