## 국내 골든크로스 후속 캐시의 시총 필터 우회

- **증상**: 일봉 캐시 갱신 직후 골든크로스 후속 작업이 정기 cron 결과와 달리 300억 원 이하 또는 오래된 시총 스냅샷 종목을 캐시에 포함할 수 있었다.
- **근본 원인**: `refreshDailyGoldenCrossCache("KR")`가 저장된 전체 보통주 scope를 바로 캔들 조회 및 판정에 전달했고, 정기 cron에만 최신 KRW 시총 확인이 있었다. 필터 통과 종목이 없는 정상 조회에서도 빈 결과 저장을 거부하면 이전 후보 캐시가 계속 남는다.
- **해결 및 재발 방지**: 후속 작업과 cron 모두 24시간 이내 KRW 시총이 300억 원을 초과하는 scope만 처리한다. 유니버스/시총 조회가 정상 완료됐으나 통과 종목이 없는 경우에는 의도된 빈 결과를 저장해 이전 추천을 제거한다. 유니버스 조회 실패나 snapshot 쿼리 예외는 기존처럼 실패로 처리하며 빈 캐시를 쓰지 않는다. `lib/daily-cache-followup.test.ts`는 정상 통과 필터와 0 eligible 빈 캐시 갱신을 확인한다.
- **검증**: 전용 회귀 테스트 2개 및 `npm.cmd run typecheck` 통과. 운영 DB·KIS API 쓰기, commit/push/deploy 없음.
- **남은 위험**: 기존 캐시는 새 성공 실행 전까지 유지되므로 fundamentals DB 조회 자체가 실패하면 마지막 정상 결과가 남는다. 해당 자동화 실패/재시도 상태를 모니터링하고, 캐시 소비부의 age 표시와 stale 결과 차단은 별도 후속 개선 항목이다.

## 국내 시총 snapshot 조회 시장키 불일치

- **증상**: 국내 시총 하한을 적용한 스캐너와 export가 기본정보 snapshot이 존재해도 값을 찾지 못해 국내 종목을 모두 제외할 수 있다.
- **근본 원인**: 기본정보 refresh는 `kr_common_stock_universe.market`의 `KOSPI`/`KOSDAQ`을 `instrument_fundamental_snapshots.market`에 그대로 저장하지만, 공통 cap reader가 canonical alias `KR`로만 필터하고 있었다. snapshot의 유일키도 `(market, code)`이므로 code만으로 여러 거래소를 합치면 중복 코드에서 cap을 잘못 연결할 수 있다.
- **해결 및 재발 방지**: scope 기반 read는 정확한 `(market, code)`를 사용한다. provider 결과에 code만 있으면 enabled 공식 COMMON_STOCK master에서 market을 찾아 join하고, 거래소가 유일하게 해석되지 않는 코드는 fail-closed한다. scanners는 composite market+code key로 값을 찾는다. export·accumulation도 actual exchange snapshot을 조인하고, currency·cap floor·freshness를 함께 검사한다.
- **추가 소비부**: 다중 시간봉 추천도 `KR` alias 하나만 조회하지 않고 KOSPI/KOSDAQ snapshot을 읽으며, 실제 거래소+코드 키를 cap snapshot과 연결한다. 기본 DB screener의 KRW snapshot freshness는 미래 timestamp도 거부한다.
- **자동 감지**: `lib/kr-market-cap.test.ts`는 두 exchange의 동일 code, exact scope pair, code-only ambiguous lookup 및 KRW/freshness 조건을 검증한다. `lib/accumulation-repository.test.ts`와 export SQL test는 해당 소비부의 거래소 join과 freshness window를 확인하며, `lib/multi-timeframe-recommendations.test.ts`는 KR snapshot exchange filter와 24시간 freshness를 검증한다.
- **검증/한계**: 관련 Vitest 및 typecheck 결과를 DEVELOPMENT_LOG에 기록한다. DB read-only 실제 분포 검사는 별도로 수행할 때만 운영 후보 복구 여부를 알 수 있으며 이 변경에서는 DB에 접속하지 않는다.

## 국내 차트의 거래소·종목 마스터 불일치

- **증상**: 국내 차트가 거래소 선택값과 다른 시장의 종목·캔들·기본정보를 반환하거나 공식 활성 보통주 마스터 확인 없이 KIS 데이터를 요청할 수 있었다.
- **근본 원인**: route의 exchange 값은 원격 cache key에만 반영됐고, 국내 마스터 검증은 없었다. 뒤이어 UI 경로를 추적하니 `ChartModal`도 거래소 query를 미국 종목에만 붙였으며 scanner result mapping은 국내 KOSPI/KOSDAQ 거래소 코드를 버리고 있었다. 분봉 chart는 `/api/kis/market-flow`로 분기하면서 exchange query를 버리고, 해당 route도 국내 보통주 master를 확인하지 않았다. DB fallback과 snapshot 조회도 code만 조회해 거래소가 섞일 수 있었다.
- **해결 및 재발 방지**: chart route 시작 시 `kr_common_stock_universe`의 enabled COMMON_STOCK 및 거래정지·청산·관리 상태를 확인하고, exchange 미지정 코드는 유일한 거래소만 허용한다. 지정 거래소 불일치, 모호한 코드, 마스터 조회 장애는 각각 422/503으로 fail-closed한다. 검증된 거래소를 memory, remote/local cache, snapshot 조회까지 전달한다. ChartModal은 양 시장의 exchange를 일봉·분봉 요청에 전달하고, scanner chart list 및 인접 종목 prefetch도 actual market key를 보존한다. 국내 분봉 route도 간격 입력을 먼저 검증한 뒤 동일한 활성 보통주·거래소 검증을 거쳐 KIS를 호출한다. KIS 응답의 실제 봉 날짜·시간, 양수 OHLC, 비음수 거래량, OHLC 포함 관계를 확인한다. 업무 성공 코드만 있고 유효 봉이 없으면 성공 snapshot을 남기지 않고 UNAVAILABLE/502로 반환한다. 큰 간격 봉은 검증된 분봉만으로 OHLCV 집계한다. KIS 분봉 시장 분류(`J/NX/UN`)와 상장 거래소(KOSPI/KOSDAQ)는 다른 값이므로 exchange는 프로젝트 master validation에만 쓰고 KIS 시장 분류 필드에 직접 전달하지 않는다. 일반 ticker 입력과 거래소 정보가 없는 watchlist는 route가 master에서 unique exchange를 확인한다.
- **해결 및 재발 방지**: chart route 시작 시 `kr_common_stock_universe`의 enabled COMMON_STOCK 및 거래정지·청산·관리 상태를 확인하고, exchange 미지정 코드는 유일한 거래소만 허용한다. 지정 거래소 불일치, 모호한 코드, 마스터 조회 장애는 각각 422/503으로 fail-closed한다. 검증된 거래소를 memory, remote/local cache, snapshot 조회까지 전달한다. ChartModal은 양 시장의 exchange를 일봉·분봉 요청에 전달하고, scanner chart list 및 인접 종목 prefetch도 actual market key를 보존한다. 국내 분봉 route도 간격 입력을 먼저 검증한 뒤 동일한 활성 보통주·거래소 검증을 거쳐 KIS를 호출한다. KIS 응답의 실제 달력 날짜·시간, 명시된 숫자 타입의 양수 OHLC, 명시된 숫자 타입의 비음수 거래량, OHLC 포함 관계를 확인한다. 빈 문자열·boolean은 숫자 0/1로 강제 변환하지 않는다. 업무 성공 코드만 있고 유효 봉이 없으면 성공 snapshot을 남기지 않고 UNAVAILABLE/502로 반환한다. 큰 간격 봉은 검증된 분봉만으로 OHLCV 집계한다. KIS 분봉 시장 분류(`J/NX/UN`)와 상장 거래소(KOSPI/KOSDAQ)는 다른 값이므로 exchange는 프로젝트 master validation에만 쓰고 KIS 시장 분류 필드에 직접 전달하지 않는다. 일반 ticker 입력과 거래소 정보가 없는 watchlist는 route가 master에서 unique exchange를 확인한다.
- **재발 자동 감지**: chart route test는 거래소 scope/불일치/모호 코드를, `app/api/kis/market-flow/route.test.ts`는 국내 분봉 master 정상·불일치·모호·장애, invalid interval 선행 차단, 빈 응답, malformed OHLC, 빈 거래량, calendar-invalid date, invalid time 폐기, 5분 OHLCV 집계 및 거래일이 다른 동일 시각 봉의 분리 집계를 검사한다. `components/chart-modal.test.tsx`는 국내·미국 선택 거래소가 일봉·분봉 API 요청에 전달되는지 검사한다.
- **미국 분봉 보통주 자격 및 성공 상태**: KIS를 호출하기 전에 `us_common_stock_universe`에서 거래소+종목 코드의 enabled, daily_active, `COMMON_STOCK` 및 ETP/워런트/파생/DR/레버리지/인버스 제외 조건을 확인한다. 마스터에 없거나 조회 장애면 각각 422/503으로 fail-closed한다. `rt_cd=0`이어도 `output1`/`output2` 행이 모두 비어 있으면 `AVAILABLE` snapshot이나 HTTP 200을 만들지 않고 `KIS_MINUTE_DATA_EMPTY_OR_INVALID`, `UNAVAILABLE`, HTTP 502로 반환한다. `app/api/kis/market-flow/route.test.ts`가 자격 검증과 빈 응답을 회귀 검사한다. 응답 구조는 한국투자증권 [공식 Open API 분봉 설정](https://github.com/koreainvestment/open-trading-api/blob/main/MCP/Kis%20Trading%20MCP/configs/overseas_stock.json)의 해외주식 분봉 `output1`/`output2` 규격을 따른다.
- **차트 클라이언트 분봉 row 검증 및 재시도**: API 응답을 차트 데이터로 바꿀 때도 실재 달력 날짜, 4/6자리 유효 시각, 명시된 숫자 OHLCV 및 OHLC 관계를 재검증한다. 빈 값·boolean·잘못된 봉은 종가로 보정하거나 0으로 바꾸지 않고 폐기한다. 유효 봉이 하나도 없으면 사용자에게 오류를 표시하고 빈 변환 결과를 세션 메모리 캐시에 넣지 않아 다음 조회에서 재요청한다. `components/chart-modal.test.tsx`가 날짜·시각·거래량 타입·가격 범위 폐기, 빈 데이터 오류 표시 및 재시도를 검사한다.
- **분봉 시간대 안정성**: KIS 해외 응답에 exchange-local `xymd`/`xhms`와 Korea-time `kymd`/`khms`가 함께 있으면 날짜·시각을 반드시 같은 pair로 읽는다. 해외 timestamp field가 일부만 존재하면 다른 기준의 날짜·시각으로 대체하지 않고 해당 row를 폐기한다. 차트 라이브러리에 전달하는 분봉 timestamp는 `Date.UTC`로 생성해 브라우저 로컬 시간대에 따라 축의 시각이 달라지지 않게 한다. 회귀 테스트는 날짜 경계 pair, 불완전 pair 배제 및 epoch 값을 확인한다. 필드 구조는 한국투자증권 [해외주식 분봉 공식 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/inquire_time_itemchartprice/inquire_time_itemchartprice.py), timestamp/timezone 처리는 [Lightweight Charts 공식 시간대 문서](https://tradingview.github.io/lightweight-charts/docs/5.2/time-zones)를 기준으로 한다.
- **차트 클라이언트 메모리 캐시**: 차트 데이터 cache entry는 60초 후 만료되고 최대 128개를 LRU 순서로 유지한다. 조회·저장 시 만료 entry를 먼저 정리해 stale entry가 새 데이터보다 먼저 LRU에서 제거되지 않게 한다. TTL·기준 시각·계산된 만료시각은 모두 유한한 양수/시각이어야 하며 유효하지 않은 조회 시각은 캐시 hit를 허용하지 않는다. trim 후 시장 접두사를 판별하고 시장·정규화한 종목코드·거래소·주기를 키로 사용해 같은 티커의 시장/거래소 간 오염을 막는다. 캐시 hit에서도 현재 호출의 코드·종목명을 반환한다. 빈/무효 분봉 응답은 캐시하지 않는다. `lib/chart-data-memory-cache.test.ts`가 TTL 만료·비유한 TTL/시각, 공백 포함 키 정규화, 시장/거래소 분리, 만료 선제 정리 및 최대 용량/LRU 제거를 검사한다.
- **차트 응답 데이터 유효성**: cache entry는 정규화 후 사용할 캔들이 하나 이상이고 최신 가격·변동 문자열·지표 구조가 유효할 때만 저장한다. 일봉 API가 HTTP 200이어도 사용 가능한 캔들이 없거나 응답 계약이 깨졌으면 `INVALID_CHART_DATA` 오류로 표시하고 캐시하지 않아 재시도가 가능하게 한다. 일부 malformed 캔들은 정상 캔들이 남아 있으면 기존 정규화 동작대로 제외한다. API 요청, 모달 내부 종목명 조회·관심종목·수급·실시간 경로의 market 판별은 공백 제거 및 대소문자 무시 `US:` 접두사 규칙을 캐시 키와 공유하고, ticker code 정규화는 trim 후 접두사를 제거해야 한다. 형식이 다른 ticker 입력으로 국내 경로에 잘못 라우팅되거나 lookup/watchlist에 접두사가 남지 않는지 `lib/chart-data-memory-cache.test.ts`, `components/chart-modal.test.tsx`에서 검사한다.
- **분봉 snapshot 저장 장애**: snapshot DB insert 실패가 KIS 차트 응답을 500으로 바꾸지 않도록 국내·미국 분봉 모두 best-effort 저장을 적용한다. HTTP는 KIS 데이터 유효성에 따라 유지하고 `snapshot.stored=false`, `warning=SIGNAL_SNAPSHOT_WRITE_FAILED`를 반환한다. 회귀 테스트는 저장 실패와 데이터 조회 성공을 분리해 확인한다.
- **시총 snapshot 처리**: 차트 정보는 상세 조회이므로 300억 원 하한으로 종목을 숨기지 않는다. 다만 국내 시총 값은 KRW이며 24시간 이내이고 미래 timestamp가 아닌 snapshot만 노출한다. 오래되거나 통화가 다르거나 미래/누락 시각인 snapshot은 시총을 null 처리하고 상태를 STALE로 표시한다. 상세 candle에서 계산된 거래량/거래대금은 그대로 제공한다.
- **자동 감지 및 공식 근거/검증 한계**: `app/api/stock/chart/route.test.ts`는 선택 거래소 scope, 거래소 불일치 차단, 모호한 코드 fail-closed, 오래된·미래·비KRW 국내 snapshot 거부를 검사한다. KIS 공식 [국내 기간별 시세 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py)와 [국내 당일 분봉 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_time_itemchartprice/inquire_time_itemchartprice.py)를 기준으로 종목코드·시장 분류 인자를 확인했다. 활성 분류는 이 프로젝트의 공식 종목 마스터를 기준으로 한다. live API/운영 DB는 이 변경에서 조회하지 않는다.

## 종목 이름 lookup의 비보통주·거래소 모호성

- **증상**: 차트/관심종목 이름 lookup이 국내 호환 전체 종목 view와 code-only `KR` snapshot을 함께 조회해 비보통주 이름 또는 다른 거래소 이름이 섞일 수 있었다. 반환 key가 code 하나라 거래소별 이름을 보존하지 못했다.
- **근본 원인**: 조회 화면 표시용이라는 이유로 종목 유형 확인을 건너뛰고, `(market, code)` identity를 응답 구조에 반영하지 않았다.
- **해결 및 재발 방지**: lookup은 KR/US common-stock universe의 `COMMON_STOCK` 행만 사용한다. 비활성 보통주는 기존 차트 표시 동작을 유지해 이름만 조회할 수 있지만 다른 상품 분류는 제외한다. `exchange` query가 있으면 해당 거래소만 반환한다. 결과는 `EXCHANGE:CODE` 및 시장 alias인 `KR:CODE`/`US:CODE` key로 제공하고, 표시명이 충돌하지 않을 때에만 code-only alias를 추가한다. ChartModal은 전달된 exchange로 lookup을 제한하고 exchange scoped key를 우선 사용한다. lookup effect의 dependency에 exchange를 포함해 종목코드와 회사명이 같아도 거래소 전환 후 이름을 다시 조회한다. Watchlist는 market scoped key를 우선해 동일 코드의 KR/US 이름을 분리한다. 관심종목 mutation 완료는 요청 당시의 market+code scope가 현재 종목과 같을 때만 UI state에 반영해 종목 이동 뒤 이전 요청 결과가 새 종목 표시를 덮지 않게 한다.
- **재발 자동 감지**: `app/api/stock/lookup/route.test.ts`는 common-stock 필터, scoped names, 거래소 제한, 충돌 code alias 억제, provider 오류를 검사한다. `components/chart-modal.test.tsx`는 UI가 exchange-scoped 이름을 사용하고 query를 전달하는지, 같은 코드에서 거래소만 변경했을 때 재조회하는지, 관심종목 요청 도중 다른 종목으로 이동했을 때 이전 응답이 새 UI 상태를 바꾸지 않는지 확인한다.
- **미국 실시간 구독 거래소 전달**: realtime approval route가 `exchange`를 받지 않으면 기본 NAS subscription을 만든다. ChartModal은 US ticker의 실제 거래소를 approval query에 전달하고 거래소 변경 시 재구독해야 한다. `components/chart-modal.test.tsx`는 NYS ticker에 `exchange=NYS`가 전달되는지 검사한다.
- **KIS 실시간 연결 복구**: 복호화 key/IV 누락·AES 복호화 실패·승인 업무 오류·대기열 overflow·예상치 못한 정상/비정상 socket close/error는 현재 연결을 닫고 새 approval 및 subscription으로 재시도한다. 연속 성공 데이터 전 최대 3회 재시도하며 기본 backoff는 500ms, 1,000ms, 2,000ms이다. 승인 API가 HTTP 429와 `Retry-After` 초를 보내면 해당 지연(최대 60초)과 기본 backoff 중 긴 시간을 기다린다. 정상 데이터가 수신되면 실패 횟수를 초기화한다. retry exhaustion 뒤에는 `unavailable`로 멈춰 반복 호출을 제한한다. `components/chart-modal.test.tsx`는 key 누락과 queue overflow 뒤 새 socket approval/frame으로 복구되고, close code 1000도 재시도하며, 총 재시도 상한 뒤 추가 approval이 발생하지 않고 429 retry-after를 따르는지 검사한다.
- **KIS 실시간 관측 POST**: 공개 `/api/kis/realtime/events`는 초당 최대 1건의 정상 클라이언트 저장 경로지만 임의 POST도 가능하므로 IP/전역 분당 제한, 24 KiB 전체 본문 제한, market/channel과 `tr_id` 일치, payload/raw payload 길이를 검증한다. 입력이 비정상일 때 저장하지 않고 400/413을 반환한다. 제한은 429와 `Retry-After`로 응답하며 DB 연결 부재·삽입 실패는 성공 처리하지 않고 안정된 503 오류로 반환한다. `app/api/kis/realtime/events/route.test.ts`, `lib/kis-realtime-event.test.ts`, limiter 테스트는 저장 전 거부·제한·장애 응답을 확인한다.
- **KIS 실시간 이벤트 코드 정규화**: 미국 ticker는 저장 전에 `US:` 접두사 제거·공백 제거·대문자 변환을 하고 최신 이벤트 조회에도 같은 규칙을 적용한다. DB 저장 코드와 조회 key 불일치로 결과가 누락되지 않도록 `lib/kis-realtime-event.test.ts`에서 `us:ibm` 저장/조회가 `IBM` key로 일치하는지 검사한다.
- **KIS 실시간 암호화 payload**: JSON subscription response의 해당 subscription `tr_id`, `header.encrypt === "Y"`, `body.output.key`/`iv`는 이후 해당 `tr_id` pipe-delimited payload의 AES-CBC/Base64 복호화 설정이다. PINGPONG 등 다른 JSON control frame은 이 상태를 덮어쓰지 않으며, 다른 subscription `tr_id`의 데이터 frame은 표시/저장하지 않는다. frame은 도착 순서로 직렬 처리하되 복호화 중 대기하는 동일 subscription 데이터 frame은 최신 1건만 보존해 과부하 시 오래된 시세를 폐기한다. control frame 대기열은 최대 32건이며 control-only overflow는 encryption state를 초기화하고 연결 상태를 `unavailable`로 fail-closed한다. 새 정상 subscription response를 받으면 복호화가 재개된다. 승인 JSON은 시장 데이터 row처럼 노출하지 않고, 복호화 키 또는 IV가 없거나 복호화가 실패하면 payload를 폐기한다. 복호화된 값만 UI와 realtime event payload로 전달한다. 기준은 한국투자증권 [공식 WebSocket 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/kis_auth.py)의 `system_resp`, `aes_cbc_base64_dec`, subscriber 처리 흐름이다. `lib/kis-realtime-payload.test.ts`는 AES-CBC 복호화를, `components/chart-modal.test.tsx`는 승인 metadata 분리·키 없는 암호화 frame 폐기·heartbeat 후 암호화 유지·잘못된 tr_id 폐기·복호화 대기 중 최신 frame 보존·control queue overflow fail-closed와 정상 subscription 재개를 검사한다.
- **API 문서**: optional `exchange` query와 scoped response key 설명을 `scripts/api-surface.mjs`의 source schema에서 관리하며 generated OpenAPI와 route inventory를 검증한다.

## 2026-11-12 전체 Vitest suite 불일치와 RSS 진단 표식 누락

- **증상**: 전체 Vitest 실행에서 10건이 실패했다. 9건은 최근 repository/route SQL과 schema contract 변경을 기존 mock/기대값이 따라가지 못했고, RSS completion 알림은 `counterDataInvalid` 진단 식별자가 길이 제한으로 잘린 결과 JSON 안에만 들어가 사용자에게 보이지 않았다.
- **근본 원인**: 테스트가 advisory unlock 반환 alias, timeframe lane별 claim quota, retry generation fencing 조건, intraday 시총 provenance 컬럼, retry aggregate snapshot 및 persistence schema 검사 전의 mock shape를 사용했다. 별도로 completion content builder는 큰 결과 JSON을 650자로 제한하면서 핵심 invalid-counter flag를 그 뒤에 배치했다.
- **해결 및 재발 방지**: completion 알림에 `counterDataInvalid`를 제한된 결과 JSON과 별개인 우선 요약 줄로 출력한다. 테스트 fixture/기대 SQL을 현재 동작에 맞추고 unlock mock은 잠금과 해제 확인 결과를 각각 반환하며 provenance/schema 진단은 실제 query 순서를 명시적으로 모델링한다. 전체 Vitest suite와 해당 6개 파일 집중 테스트가 이를 자동 감지한다.
- **검증**: 집중 테스트 34/34, UI 경고 재점검 36/36 통과. 전체 `npm.cmd test -- --reporter=dot`: 303개 test file 통과, 1개 skip; 1,553개 테스트 통과, 3개 skip. 테스트에서 복사 완료 상태와 메뉴 인증 조회 완료를 기다린 뒤 전체 실행에서도 React `act(...)` 경고가 사라졌다.
- **원인 및 해결**: Vite native config loader가 `.ts` 설정 파일에서 ESM import를 CommonJS로 해석해 경고했다. 공식 Vite 문서의 ESM file detection과 Vitest의 `.mts` config 지원을 적용해 설정 파일을 `vitest.config.mts`로 옮기고 `__dirname` 대신 `fileURLToPath(import.meta.url)` 경로를 사용했다. `tsconfig.json` exclusion과 현재 개발 문서의 config 경로도 함께 갱신했다 ([Vite config](https://vite.dev/config/), [Vitest config](https://vitest.dev/config/)).
- **검증**: 전체 suite는 Node 24.14와 Node 22.23.4 양쪽에서 303개 test file 통과, 1개 skip; 1,553개 테스트 통과, 3개 skip이었다. Node 22는 `npx.cmd --yes node@22 node_modules/vitest/vitest.mjs run --reporter=dot`로 실행했으며 두 환경 모두 Vite native config 경고 없이 자동 config discovery가 성공했다.
- **남은 위험**: workflow가 지정한 Node 22 전체 suite는 로컬 Node 22.23.4로 확인했지만 GitHub Actions workflow 자체는 실행하지 않았다.

## 2026-11-11 Pending Flyway index migration의 선행 relation 누락

- **증상**: 로컬 pending migration은 table 누락 때문에 index 생성에서 실패할 가능성이 있다.
- **후속 수정**: V70에서 삭제된 `us_trade_intensity_ticks`를 V167 인덱스 초안, DB retention route, OCI schema gate에서 제거했다. 이 테이블은 후속 source migration에서 재생성되지 않으므로 retention 대상에도 복귀시키지 않는다. 다른 older-unapplied creator 대상은 로컬 history만으로 source 결함이라 단정하지 않는다.
- **남은 6개 index target 판정**: `intraday_detection_transitions`와 `intraday_detection_runs`의 source creator는 V132, `market_rss_translation_cache`는 V102, `market_rss_bullish_articles`는 V135다. 현재 source에는 이후 DROP이 없지만 로컬 이력은 이 creator를 `OLDER_UNAPPLIED`로 분류하고 실제 relation도 없다. Flyway `outOfOrder` 기본값은 false이므로 낮은 버전 migration은 기본 migrate에서 건너뛴다. 따라서 현재 로컬 pending V167–V169의 실행 차단은 정확하며, 이 로컬 상태만으로 다른 환경의 적용 여부를 단정할 수 없다 ([Flyway Out Of Order Setting](https://documentation.red-gate.com/fd/flyway-out-of-order-setting-277579015.html), [Flyway versioned migrations](https://documentation.red-gate.com/fd/versioned-migrations-273973333.html)). 과거 migration을 자동 실행하거나 V167–V169의 relation 요구를 추측으로 제거하지 않는다.
- **근본 원인**: V167은 `us_trade_intensity_ticks`를 포함한 예전 telemetry relation들에 `CREATE INDEX CONCURRENTLY`를 실행한다. `us_trade_intensity_ticks`는 applied V70에서 제거됐고, V132의 `intraday_detection_*`, V102의 `market_rss_translation_cache`는 이 DB에서 `OLDER_UNAPPLIED`이며 후속 pending migration에 해당 parent table 재생성이 없다. V168/V169는 `market_rss_bullish_articles`를 참조하지만 해당 V135 relation도 현재 catalog에 없다. PostgreSQL의 `CREATE INDEX` 문법에서 `IF NOT EXISTS`는 기존 index 이름 충돌만 억제하고 `ON table_name` 대상 relation을 대체하지 않는다 ([공식 문서](https://www.postgresql.org/docs/16/sql-createindex.html)).
- **영향 범위**: 현재 로컬의 V167 4개, V168 2개, V169 1개 index target에서 parent relation kind가 없다. 이 중 source에 table recreation이 없는 retired relation도 포함되므로 pending chain을 그대로 적용할 수 있다고 가정하면 안 된다.
- **해결 및 진단**: `audit:flyway-local`은 현재 catalog와 higher-version pending source sequence를 함께 따라간다. 새 pending table, table rename, `ALTER TABLE ADD/DROP/RENAME COLUMN`을 시뮬레이션해 index parent와 간단한 identifier key columns를 점검한다. PostgreSQL 구문 `ON ONLY table`과 생략 가능한 index 이름도 index effect로 추적해 대상 relation 검사에서 빠지지 않게 한다. partitioned table에 `ON ONLY`로 생성한 parent index는 child index attach 전 invalid 상태이므로 `pendingPartitionedIndexOnlyUnverified` / `PENDING_PARTITIONED_INDEX_ONLY_UNVERIFIED`로 실패 처리한다. 현재 preflight는 모든 child attach 완료를 증명하지 않는다. 생략 이름은 PostgreSQL이 생성하므로 이름 충돌 검증은 생략하고 `pendingIndexNameUnverified` / `PENDING_MIGRATION_INDEX_NAME_UNVERIFIED`로 표시한다. table rename은 columns, constraints, index parent ownership 상태를 새 relation 이름으로 옮기며 missing source와 occupied target은 `pendingRelationRenameIssues` 및 `PENDING_MIGRATION_RELATION_RENAME_CONFLICT`로 반환한다. 미지원 expression/syntax는 `pendingIndexColumnUnverified`로 드러낸다. 누락 parent, column, index 이름 충돌은 각각 `PENDING_MIGRATION_INDEX_TARGET_MISSING`, `PENDING_MIGRATION_INDEX_COLUMN_MISSING`, `PENDING_MIGRATION_INDEX_NAME_CONFLICT` failure reason으로 반환한다. 이름 충돌 검사는 기존 비인덱스 relation, 다른 table의 index, 그리고 같은 이름을 이미 차지한 동일 table index에 대한 plain `CREATE INDEX` 재실행을 구분한다. 동일 이름의 기존 index를 의도적으로 재사용하는 `CREATE INDEX IF NOT EXISTS`는 catalog 정의가 source와 일치하는지 비교한다. constraint rename은 backing index 이름과 catalog index lookup도 함께 source-order 갱신한다. 같은 대상 table의 동명 index는 catalog `pg_get_indexdef` 및 `pg_index`의 key 순서, INCLUDE 컬럼, method, unique, `NULLS NOT DISTINCT`, predicate 유무와 단순 안전 정규화가 가능한 predicate expression, valid/ready 상태와 source를 대조한다. source의 `WITH (storage_parameter...)`와 `TABLESPACE`는 아직 catalog shape 비교를 지원하지 않아 동명 existing index가 있으면 `pendingIndexDefinitionUnverified`와 `PENDING_MIGRATION_INDEX_DEFINITION_UNVERIFIED`로 fail-closed한다. predicate가 있는 인덱스도 predicate expression은 source와 `pg_get_expr` 결과를 안전 정규화해 비교하며, dollar-quoted/escape string 또는 다른 decompile 형태는 미검증으로 남긴다. PostgreSQL의 `NULLS [ NOT ] DISTINCT` 옵션은 unique index에서 NULL 동등성 의미를 바꾸므로 동명 index shape 비교에 포함한다 ([공식 CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html)). `CREATE INDEX CONCURRENTLY` 또는 `DROP INDEX CONCURRENTLY`가 있는 pending migration은 parser의 comment/literal 제외 DDL effect를 기준으로 sibling `.sql.conf`에 주석을 제외한 `executeInTransaction=false` 설정이 정확히 하나 있는지 확인하고(중복 또는 다른 값과 혼재하면 fail-closed), migration SQL의 명시적 `BEGIN`/`START TRANSACTION` 안에서 명령이 실행되는 경우 `PENDING_CONCURRENT_INDEX_EXPLICIT_TRANSACTION_BLOCK`로 별도 실패시킨다. 두 PostgreSQL 명령은 transaction block에서 실행할 수 없으며 Flyway script configuration은 파일별 transaction 설정을 제공한다 ([공식 CREATE INDEX](https://www.postgresql.org/docs/18/sql-createindex.html), [DROP INDEX](https://www.postgresql.org/docs/18/sql-dropindex.html), [Flyway executeInTransaction](https://documentation.red-gate.com/fd/flyway-execute-in-transaction-setting-277578997.html)).
- **CREATE TABLE 선행조건 진단**: pending CREATE TABLE이 같은 이름의 view/index/sequence 등 비-table relation과 충돌하는지, 기존 table에 source 선언 column이 빠져 있는지 검사하고, 새 pending table의 REFERENCES local columns와 parent relation/target columns가 생성 순서상 존재하며 target columns가 non-deferrable PK/UNIQUE constraint 또는 non-partial unique index로 보장되는지 검사한다. PostgreSQL은 참조 컬럼 집합을 unique key 컬럼 집합과 순서에 관계없이 매칭하므로 preflight도 순서에 의존하지 않는다. catalog 검사가 public schema 전용이므로 REFERENCES에서 명시한 non-public schema는 public relation으로 오인하지 않고 `pendingForeignKeyTargetUnverified`로 기록한다. 해당 issue는 각각 `PENDING_MIGRATION_CREATE_TABLE_RELATION_KIND_MISMATCH`, `PENDING_MIGRATION_CREATE_TABLE_COLUMNS_MISSING`로 실패 처리하고, catalog columns를 읽을 수 없는 경우 `pendingCreateTableColumnUnverified`로 노출한다. 이번 localhost 결과는 kind mismatch 0, missing column 0, FK local/target/key issue 0, FK target unverified 0이다. 누락 relation/column은 `pendingForeignKeyTargetIssues`, 불확정 참조는 `pendingForeignKeyTargetUnverified`로 노출한다. PostgreSQL 문서에 따르면 `IF NOT EXISTS`는 이름이 같은 relation을 만나면 기존 relation이 새 선언과 유사한지 보장하지 않는다 ([공식 CREATE TABLE](https://www.postgresql.org/docs/16/sql-createtable.html), [PostgreSQL tablecmds.c](https://github.com/postgres/postgres/blob/master/src/backend/commands/tablecmds.c#L13723-L13766)).
- **기존 테이블의 inline FK 대조**: `CREATE TABLE IF NOT EXISTS`가 기존 테이블에 대해 구조를 보정하지 않는 점을 보완하기 위해, source REFERENCES와 기존 `pg_constraint` foreign key의 local/target relation·column, `convalidated`, MATCH, ON DELETE/UPDATE, deferrability, initially-deferred 및 `ON DELETE SET NULL/DEFAULT (column_list)`를 대조한다. 누락·미검증·동작 옵션 불일치는 `pendingCreateTableForeignKeyIssues` 및 `PENDING_MIGRATION_CREATE_TABLE_FOREIGN_KEY_MISSING`로 실패 처리한다. constraint 이름은 테이블 범위로 확인하며 이름만으로 일치 판정하지 않는다. 이번 localhost pending 대상에서 해당 검사는 0건이었다. PostgreSQL의 FK 구문과 catalog 코드는 공식 [CREATE TABLE](https://www.postgresql.org/docs/16/sql-createtable.html) 및 [`pg_constraint`](https://www.postgresql.org/docs/16/catalog-pg-constraint.html)를 따른다.
- **기존 테이블의 PK/UNIQUE/CHECK 대조**: 기존 table이 `CREATE TABLE IF NOT EXISTS`를 통과할 때 source의 inline primary/unique key column order, deferrable/initially-deferred 상태, UNIQUE `NULLS NOT DISTINCT`, INCLUDE column과 CHECK expression/`NO INHERIT`를 catalog constraint와 대조한다. NULL 처리와 include payload는 backing index의 `indnullsnotdistinct`, `indnkeyatts`, `indkey`로 검사한다. CHECK 정의는 PostgreSQL `pg_get_constraintdef` decompile 결과와 비교하며 문자열 literal 대소문자/공백을 보존한다. source `IN (...)`가 catalog `= ANY (ARRAY[...])`로 복원되거나 catalog decompiler가 source에 없는 `::type` cast를 추가한 경우는 동등 여부를 추측하지 않고 unverified로 fail-closed한다. 아직 비교기가 없는 신규·기존 테이블의 EXCLUDE constraint 선언은 `pendingCreateTableConstraintUnverified`로 fail-closed한다. 누락·shape/식 불일치는 `pendingCreateTableConstraintIssues` 및 `PENDING_MIGRATION_CREATE_TABLE_CONSTRAINT_MISMATCH`, 해석 불가는 `pendingCreateTableConstraintUnverified` 및 `PENDING_MIGRATION_CREATE_TABLE_CONSTRAINT_UNVERIFIED`로 감사 종료를 실패시킨다. PostgreSQL 공식 [CREATE TABLE](https://www.postgresql.org/docs/16/sql-createtable.html)는 두 UNIQUE 옵션을 정의하고, [`pg_index`](https://www.postgresql.org/docs/16/catalog-pg-index.html)는 null treatment와 key/include 경계를 정의한다. CHECK definition 복원은 공식 [catalog](https://www.postgresql.org/docs/16/catalog-pg-constraint.html) 및 [system information functions](https://www.postgresql.org/docs/16/functions-info.html)를 따른다. 복잡한 decompile 형태는 unverified로 남는다.
- **CREATE TABLE LIKE preflight 경계**: source가 `LIKE source_table`을 사용하면 table shape에 복사할 컬럼과 `INCLUDING`/`EXCLUDING` 옵션이 영향을 주므로 parser가 이를 빈 column list로 조용히 취급하지 않는다. 해당 statement는 `pendingCreateTableDefinitionUnverified` 및 `PENDING_MIGRATION_CREATE_TABLE_DEFINITION_UNVERIFIED`로 fail-closed한다. PostgreSQL 공식 [CREATE TABLE](https://www.postgresql.org/docs/16/sql-createtable.html)은 LIKE가 columns/not-null을 복사하고 DEFAULTS, CONSTRAINTS, INDEXES 등 옵션으로 추가 속성 복사 범위를 정한다고 설명한다. 현재 저장소의 LIKE 사용은 V85/V89 older-unapplied migration에만 있으며, higher-version pending preflight는 해당 상태를 실행 대상으로 가정하지 않는다.
- **파생/상속 CREATE TABLE preflight 경계**: `CREATE [TEMP] TABLE ... AS`, `CREATE TABLE ... OF`, `PARTITION OF`, `PARTITION BY`, `INHERITS (...)`, `SELECT ... INTO`는 컬럼 형태·부모/파티션 관계·데이터가 query 결과, composite type 또는 parent relation에서 유래하므로 현재 source DDL parser가 완전 비교할 수 없다. pending migration에서는 `pendingCreateTableDefinitionUnverified`와 `PENDING_MIGRATION_CREATE_TABLE_DEFINITION_UNVERIFIED`로 fail-closed하며, inventory에는 SELECT INTO로 생성되는 relation도 포함한다. PostgreSQL 공식 [CREATE TABLE AS](https://www.postgresql.org/docs/16/sql-createtableas.html), [CREATE TABLE](https://www.postgresql.org/docs/16/sql-createtable.html), [SELECT INTO](https://www.postgresql.org/docs/16/sql-selectinto.html) 문법을 기준으로 한다. V57의 TEMP CTAS는 현재 적용 기준보다 오래된 migration이므로 현 pending audit에 추가 항목은 만들지 않는다.
- **SELECT INTO statement 경계**: multi-statement 파일이나 WITH/CTE에서 임의의 첫 SELECT와 이후 INTO를 연결하면 생성 relation을 오인할 수 있다. 탐색은 top-level statement 및 parenthesis depth를 기준으로 하고, string/comment/dollar-quoted body masking 후 최상위 SELECT/INTO 토큰만 짝짓는다. 토큰 앞 경계도 확인해 `valueINTO` 같은 identifier suffix를 INTO로 해석하지 않는다. 세미콜론이 들어간 quoted identifier가 statement를 자르지 않도록 double-quote 경계를 추적하고, identifier name을 파싱할 때도 따옴표 안의 임의 문자를 허용한다. UNION이 있는 query에서도 INTO와 바로 앞 최상위 SELECT를 짝지어 중복 relation effect를 만들지 않는다. CTE 본문 SELECT, dollar-quoted procedural body 안의 세미콜론/키워드, 별도 SQL statement 사이의 잘못된 결합을 막는 회귀 테스트를 유지한다. 기준: PostgreSQL 공식 [Lexical Structure](https://www.postgresql.org/docs/16/sql-syntax-lexical.html).
- **quoted identifier audit 비교**: quoted identifier는 case-sensitive이고 escaped double quote는 이름의 실제 문자이므로 source parser와 catalog map에서 이를 보존한다. 관계·컬럼·key/index term·constraint name 비교에서 일괄 소문자 변환을 하지 않는다. column/key list도 quote-aware로 나눠 `"a,b"`를 두 이름으로 오인하지 않고, ALTER TABLE의 quoted object name을 완전하게 읽는다. 관련 경계는 PostgreSQL 공식 [Lexical Structure](https://www.postgresql.org/docs/16/sql-syntax-lexical.html)에 따른다.
- **ALTER 대상 진단**: pending migration source 순서에서 ALTER TABLE column/constraint effect가 현재 또는 앞선 pending table에 적용될 수 있는지 확인한다. `ADD CONSTRAINT ... FOREIGN KEY`는 local columns, target relation/columns 및 비지연 PK/UNIQUE 보장도 같은 source 순서에서 검사하며 target unique-key 비교는 컬럼 순서에 의존하지 않는다. catalog 검사가 public schema에 한정되므로 명시된 다른 schema 참조는 잘못 public relation으로 간주하지 않고 `pendingForeignKeyTargetUnverified`로 노출한다. PostgreSQL은 schema-qualified table name을 `schema.table`로 해석하므로 schema를 버리고 마지막 이름만 비교하지 않는다 ([공식 Schemas 문서](https://www.postgresql.org/docs/current/ddl-schemas.html), [PostgreSQL tablecmds.c](https://github.com/postgres/postgres/blob/master/src/backend/commands/tablecmds.c#L13723-L13766)). 누락 table은 `pendingAlterTargetIssues` 및 `PENDING_MIGRATION_ALTER_TARGET_MISSING`, FK 전제는 `pendingForeignKeyTargetIssues`/`pendingForeignKeyTargetUnverified`로 표시한다. 이번 localhost audit 결과 ALTER/FK target issue는 0건이며 DB는 변경하지 않았다.
- **ALTER object 상태 진단**: pending ADD COLUMN/ADD CONSTRAINT가 이미 존재하는 이름을 재추가하거나, 일반 DROP COLUMN/DROP CONSTRAINT가 존재하지 않는 항목을 대상으로 하는 경우, RENAME의 이전/새 이름 상태, ALTER COLUMN이 참조하는 대상 컬럼과 ALTER/VALIDATE CONSTRAINT가 참조하는 constraint 존재 여부를 source 순서로 찾는다. pending CREATE TABLE에서 선언된 이름 있는 table constraint도 후속 source action의 상태 집합에 반영한다. `RENAME CONSTRAINT`는 unique/primary key 메타데이터의 constraint명과 backing index명을 함께 옮기므로 rename 후 DROP/REFERENCES가 이전 이름 상태를 잘못 사용하지 않는다. unique/primary constraint를 DROP하면 catalog의 owning index 이름을 통해 constraint key와 backing index key를 함께 가용 키 map에서 제거하므로 후속 FK가 사라진 키를 근거로 통과하지 않는다. DROP CONSTRAINT CASCADE의 추가 종속 객체 효과는 미모델링으로 unverified 처리한다. `IF NOT EXISTS` column 추가와 object/table 수준의 `IF EXISTS`는 해당 작업을 건너뛰는 조건으로 처리한다. ALTER COLUMN 정의값이나 constraint validation 상태 자체는 비교하지 않는다. 문제는 `pendingAlterObjectStateIssues` 및 `PENDING_MIGRATION_ALTER_OBJECT_STATE_CONFLICT`, catalog 확인 불가는 `pendingAlterObjectStateUnverified`로 출력한다. PostgreSQL 공식 `ALTER TABLE` 문서는 constraint rename을 정의하고, PostgreSQL source의 `rename_constraint_internal`은 unique/primary constraint rename 시 backing index도 함께 rename한다 ([공식 ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html), [PostgreSQL tablecmds.c](https://github.com/postgres/postgres/blob/master/src/backend/commands/tablecmds.c#L3949-L3956)).
- **DROP INDEX schema/constraint/CASCADE 진단**: public 전용 catalog snapshot 밖의 schema-qualified DROP INDEX는 `pendingIndexSchemaUnverified` / `PENDING_MIGRATION_INDEX_SCHEMA_UNVERIFIED`로 보고하고 public relation/key map을 변경하지 않는다. catalog가 `pg_constraint.conindid`로 primary/unique/exclusion constraint 소유 index를 식별하면 기본 RESTRICT/drop 또는 CONCURRENTLY 경로는 `pendingIndexConstraintDropIssues` / `PENDING_MIGRATION_INDEX_OWNED_BY_CONSTRAINT`로 보고하고 source-order index/key 상태를 제거하지 않는다. standalone unique index가 FK의 참조 대상인 경우 `pendingIndexReferencedByForeignKeyIssues` / `PENDING_MIGRATION_INDEX_REFERENCED_BY_FOREIGN_KEY`로 DROP INDEX를 보류하고, unique/primary constraint drop이 이를 제거하려는 경우 `pendingUniqueConstraintDropDependencyIssues` / `PENDING_MIGRATION_UNIQUE_CONSTRAINT_REFERENCED_BY_FOREIGN_KEY`로 ALTER TABLE statement 전체를 보류한다. CASCADE는 종속 FK state를 제거하되 dependency 효과 미검증 gate를 유지한다. DROP INDEX의 여러 target은 한 SQL statement group으로 추적해 하나라도 public 범위 밖이거나 RESTRICT 제약으로 실행할 수 없으면 해당 statement의 public 상태를 부분 적용하지 않는다. PostgreSQL은 CONCURRENTLY에서 index name 하나만 허용하고 CASCADE도 지원하지 않으므로 다중 target은 `PENDING_MIGRATION_CONCURRENT_INDEX_DROP_MULTIPLE_TARGETS`, CONCURRENTLY와 CASCADE 조합은 `PENDING_MIGRATION_CONCURRENT_INDEX_DROP_CASCADE_UNSUPPORTED`, partitioned table의 index 대상은 `PENDING_MIGRATION_CONCURRENT_INDEX_DROP_PARTITIONED_TABLE_UNSUPPORTED`로 보고하며 해당 statement 상태 변경을 적용하지 않는다. 일반 DROP INDEX CASCADE는 소유 constraint도 삭제할 수 있으므로 알려진 unique key와 exclusion constraint owner state를 함께 제거하지만, 외부 종속 객체 전체는 목록화하지 않아 `pendingIndexCascadeUnverified` / `PENDING_MIGRATION_INDEX_CASCADE_UNVERIFIED`로 fail-closed한다. 먼저 owning constraint를 제거한 뒤 인덱스를 제거하는 migration 경로는 지원한다. PostgreSQL은 DROP INDEX가 schema-qualified index name을 받고 CASCADE가 의존 객체를 제거한다고 정의하며 CONCURRENTLY에는 CASCADE를 허용하지 않는다 ([공식 DROP INDEX](https://www.postgresql.org/docs/18/sql-dropindex.html), [`pg_constraint`](https://www.postgresql.org/docs/18/catalog-pg-constraint.html)는 exclusion constraint의 supporting index를 `conindid`에 기록하며, [CREATE TABLE](https://www.postgresql.org/docs/18/sql-createtable.html)는 exclusion index가 constraint와 같은 이름이라고 정의한다).
- **검증**: localhost read-only audit에서 parent issue 7개(V167 4, V168 2, V169 1), 단순 key column 누락 0개, unverified 문법 0개, index name conflict 0개, 동명 인덱스 정의 mismatch/unverified 0개, concurrent transaction config 누락 0개를 확인했다. V168의 기존 두 RSS listing index는 key 순서와 DESC/NULLS 옵션, btree, unique, predicate 유무, valid/ready 상태가 source와 일치했다. migration source, Flyway history, DB catalog는 수정하지 않았다.
- **남은 위험**: parser는 일반적인 CREATE TABLE column definitions와 단순 index key만 인식하며 PostgreSQL 전체 문법을 검증하지 않는다. partial-index predicate는 안전 정규화 가능한 식만 비교하며 dollar-quoted/escape string 및 표현이 다른 decompile 결과, source storage parameter/tablespace shape는 아직 비교하지 않아 동명 기존 인덱스에서 `pendingIndexDefinitionUnverified`로 남긴다. 타입 호환성, 권한, lock 부하, concurrent build 중단 및 invalid index cleanup, data preconditions도 검사하지 않는다. 배포된 DB 이력은 별도 확인 대상이다. PostgreSQL은 IF NOT EXISTS에서 같은 이름 relation이 있으면 notice를 내고 기존 index가 새 정의와 같은 것을 보장하지 않는다고 명시한다 ([PostgreSQL CREATE INDEX](https://www.postgresql.org/docs/16/sql-createindex.html)). Flyway의 script config는 migration 파일과 같은 이름에 .conf를 붙이며 executeInTransaction을 설정한다 ([Flyway script configuration](https://documentation.red-gate.com/flyway/reference/script-configuration), [executeInTransaction](https://documentation.red-gate.com/fd/flyway-execute-in-transaction-setting-277578997.html)).
## 2026-11-11 Flyway DDL inventory의 삭제 relation 하위 오탐

- **증상**: 로컬 Flyway audit에서 applied migration이 생성한 오래된 컬럼·인덱스·제약이 catalog에 없다며 대량 mismatch로 나타났다.
- **근본 원인**: 후속 V70 migration이 legacy 부모 테이블을 `DROP TABLE ... CASCADE`로 제거했지만 source inventory는 해당 부모가 최종적으로 없는 상태에서도 자식 컬럼·인덱스·제약의 존재를 요구했다.
- **해결 및 진단**: final source relation effect가 absent인 경우 연결된 column/index/constraint effect는 검사 대상에서 빼고 `skippedParentAbsentObjectCount`와 항목 배열로 별도 노출한다. mismatch는 source migration 상태별로 집계해 applied와 미적용 역사 후보를 구분한다.
- **검증**: read-only audit에서 V148 mismatch와 V85/V89 compatibility view mismatch가 사라졌다. V70 cascade 하위 객체와 view에 붙을 수 없는 인덱스/제약을 skipped로 기록하며 migration-state별 mismatch 집계를 유지한다.
- **남은 위험**: parent table과 별도 소유 sequence, 함수, trigger 등 모든 dependency 종류를 추론하지 않는다. inventory는 heuristic이며 최종 객체 정의와 데이터 정합성은 별도 catalog/runtime 검사 범위다.
## 2026-11-11 Flyway DDL inventory의 action 순서 오탐

- **증상**: applied V148이 재생성한 `sec_smallcap_common_stock_shares_positive_cap` constraint 또는 V85/V89가 drop 후 같은 이름으로 만든 compatibility view가 DDL inventory에서 잘못된 상태로 표시됐다.
- **근본 원인**: DDL 종류별 순회가 source의 전역 statement 순서를 보존하지 않았다. 같은 ALTER의 DROP→ADD와 V85의 DROP TABLE→CREATE VIEW가 반대 순서로 적용되어 최종 상태가 뒤집혔다.
- **해결 및 진단**: DDL effect에 source 위치를 붙여 전역 statement 순으로 최종 상태를 계산한다. 최종 parent가 absent인 하위 컬럼/인덱스/제약과 regular view에 붙을 수 없는 인덱스/제약은 skipped로 별도 집계한다. `docs:check`는 source-order parser 및 view-parent skip 조건을 감시한다.
- **남은 위험**: DDL inventory는 heuristic이며 inline CREATE TABLE constraints의 semantic definition, conditional/dynamic SQL 및 data-operation 결과는 증명하지 않는다. 일반 PostgreSQL lexer 기준은 [공식 lexical structure](https://www.postgresql.org/docs/16/sql-syntax-lexical.html)를 따른다.
## 2026-11-11 rate-limit 이벤트 스키마의 누락·부분 생성 감지

- **증상**: KIS 제한 이벤트가 `[Debug] KIS rate-limit history unavailable` 경고로 저장되지 않거나, 과거 관리자 `/api/admin/kis-rate-limits`가 503을 반환할 수 있었다. V131 파일이 저장소에 있어도 해당 DB의 history/catalog 상태가 일치한다고 볼 수 없다.
- **근본 원인**: V131의 version이 이미 적용된 DB version보다 낮으면 Flyway 기본 `outOfOrder=false` 동작에서 뒤늦게 발견된 migration은 자동 적용되지 않을 수 있다([공식 Flyway 설정](https://documentation.red-gate.com/fd/flyway-out-of-order-setting-277579015.html)). 정확히 어느 bootstrap 경로에서 로컬 V131 이력이 빠졌는지는 미확인이다. 또한 `CREATE TABLE IF NOT EXISTS`는 동일 이름 relation이 이미 있을 때 기존 컬럼 구성을 보정하지 않는다.
- **영향 범위**: KIS rate-limit event write queue, 관리자 요약·최근 이벤트 조회 및 `kis_rate_limit_events.occurred_at` 기준 90일 retention. 일반 KIS 호출 경로는 event insert 실패를 경고하고 계속 진행한다.
- **해결 및 진단**: V172는 table과 세 forward index를 `IF NOT EXISTS`로 보장한다. runtime schema health는 writer/retention이 사용하는 컬럼을 필수 contract로 검사하고, table 누락과 기존 BASE TABLE의 partial-column 상태를 별도 보고한다. `npm run audit:flyway-local`은 source 선언·history·catalog readiness를 read-only 대조한다. `docs:check`는 rate-limit writer INSERT 필드 및 90일 retention 기준 컬럼을 required-column contract와 대조한다. lower-version history gap만으로 객체 누락을 단정하거나 Flyway history만 수동 정렬하지 않는다.
- **재발 자동 감지**: `docs:check`가 V157 이후 forward CREATE/ALTER column 선언과 index 이름·테이블·키 정의를 검사한다. runtime `/api/health`는 필수 relation/column 누락 및 forward index 손상 시 readiness 실패를 반환한다. 관리자 diagnostics API는 2026-11-17 관리자 기능 폐기 시 제거되었다. 배포 후에는 `/api/health`를 확인한다.
- **검사 기준**: PostgreSQL 16 `pg_index`의 `indisvalid`·`indisready`·`indislive`·`indisexclusion` 및 key/INCLUDE 메타데이터를 확인하고, `pg_get_indexdef(index_oid, column_number, false)`로 각 인덱스 컬럼 정의를 비교한다. PK는 `pg_constraint.conkey`의 컬럼 번호와 `pg_attribute.attname`을 조합해 단일 `id` 키인지 검사한다. system catalog 사용은 `information_schema`의 역할 권한 기반 행 노출에 진단이 좌우되지 않게 한다. V172의 `BIGSERIAL`은 PostgreSQL 문서의 bigint 자동 증가 serial 유형으로 shape 게이트에서 bigint와 생성 default 의미로 정규화한다 ([공식 pg_index catalog](https://www.postgresql.org/docs/16/catalog-pg-index.html), [공식 system information functions](https://www.postgresql.org/docs/16/functions-info.html), [pg_constraint](https://www.postgresql.org/docs/16/catalog-pg-constraint.html), [pg_attribute](https://www.postgresql.org/docs/16/catalog-pg-attribute.html), [numeric/serial types](https://www.postgresql.org/docs/16/datatype-numeric.html)).
- **남은 위험**: runtime health는 필수 컬럼 이름과 rate-limit 이벤트의 컬럼 type·NULL 허용 여부·writer 생략 default, 단일 컬럼 `id` primary key, 세 forward index의 대상 테이블·키 정의·btree 방식·unique 여부·valid/ready/live 상태·exclusion/predicate/expression/include 여부와 컬럼별 인덱스 정의를 검사한다. check constraint와 다른 테이블 컬럼 shape는 검사하지 않는다. 대상 테이블 자체가 없으면 primary-key probe는 중복 오류를 만들지 않고 missing table 항목에 맡긴다. 현재 로컬 DB에는 V172를 적용하지 않았으므로 실제 table 복구와 post-deploy 검증은 미완료다. 배포된 대상에서 Flyway version과 `/api/health`를 확인한다. 관리자 diagnostics 경로는 폐기되어 사용할 수 없다.

## 2026-11-04 DART 피드 GET의 중복 RSS 요청

- **증상**: `/api/dart` 한 번의 GET이 동일한 DART RSS feed를 두 번 가져와 불필요한 upstream 요청을 만들 수 있었다.
- **근본 원인**: route가 `syncDartAlerts()`의 반환값을 사용하지 않은 채 호출하고, 이어서 `getTodayDartBullishFeed()`를 호출했다. 두 함수 모두 내부에서 `fetchDartFeed()`를 실행한다. 예약 자동화는 별도의 `runFilingSync()` → `runDartAutomation()` 경로가 소유하므로 GET의 첫 결과는 피드 응답이나 지속 상태에 기여하지 않았다.
- **영향 범위**: `/api/dart`가 feature/schedule gate를 통과한 요청마다 upstream DART RSS 조회 수가 중복됐다. 응답 DTO, DB 저장, 예약 자동화 및 alert 전달은 변경하지 않았다.
- **해결 위치**: `app/api/dart/route.ts`에서 버려지는 `syncDartAlerts()` 호출과 import를 제거하고 `getTodayDartBullishFeed()`만 한 번 호출한다.
- **재발 자동 감지**: `app/api/dart/route.test.ts`가 성공 GET의 feed 함수 호출 횟수를 정확히 1회로 확인한다.
- **남은 위험**: 성공적인 화면 polling마다 upstream RSS를 여전히 조회한다. 캐시나 polling 주기 조정은 freshness·provider 조건을 확인해 별도로 결정해야 한다.

## 2026-11-01 미국 이벤트 검토 집계의 수기 숫자 불일치

- **증상**: 직접 검토 발행사·복구 이벤트 대기 수가 review event row의 실제 상태/티커 고유 집계와 보고서 숫자 사이에서 달라질 수 있다.
- **근본 원인**: `eventReviewStatus`의 여러 과거 enum을 수기로 세고 `reviewedEvents[].sourceReviewStatus` 정본 집계와 대조하지 않았다.
- **영향 범위**: 미국 소형주 원문 검토 coverage와 pending 재검토 현황을 나타내는 요약 메타데이터·보고서. 이벤트 원문 내용이나 SEC accession 관계에는 영향이 없다.
- **해결 위치**: 검토 현황은 `reviewedEvents`에서 직접 검토 상태 및 ticker unique set을 계산한다. 운영 보고서의 batch 67/68 요약 수치를 canonical record 기반 값으로 수정했다.
- **재발 자동 감지**: `scripts/validate-us-smallcap-event-data.mjs`가 `primarySourceReviewedIssuerCount`, `recoveredEventRevalidationPendingCount`, `recoveredEventRevalidationPendingIssuerCount`와 실제 review rows 간 parity를 검사한다.
- **남은 위험**: event row 상태가 실제 원문 검토 행위를 대변하므로 상태 전환 시에는 원문 URL·검토근거도 함께 확인해야 한다.

## 2026-11-01 이벤트 원문에 타 발행사 SEC 근거가 혼입되는 문제

- **증상**: canonical 이벤트의 제목·종목은 맞지만 `evidence`가 다른 발행사 SEC 공시를 인용하거나 `sourceUrl` 경로에 다른 CIK가 들어갈 수 있다.
- **근본 원인**: 종목별 이벤트를 연속 편집하는 과정에서 이전 이벤트의 분석·인용 내용을 복사했고, 검증기는 URL 발행사 정체성을 비교하지 않았다.
- **영향 범위**: 인용문과 사실판정의 신뢰성, 같은 종목의 일정·상태·위험 설명. 운영 공개 GET은 읽기 전용이며 DB 변경은 수행하지 않았다.
- **해결 위치**: 해당 이벤트를 SEC 공식 원문과 대조해 인용과 분석을 교체하고, `scripts/validate-us-smallcap-event-data.mjs`에 source/evidence CIK 대조를 추가했다. 교차 발행사 비교자료는 `relatedSourceUrls`에 명시된 경우만 통과한다.
- **재발 자동 감지**: `npm run validate:us-smallcap-event-data`에서 SEC EDGAR URL CIK가 canonical ticker issuer CIK와 다르면 실패한다.
- **남은 위험**: URL CIK가 맞아도 quote 내용의 문맥 적합성 자체는 자동 검증 불가이므로 정기 원문 직접 대조가 필요하다.

# 오류 상황 및 해결 방법

## 2026-11-11 미국 및 원격 일봉 적재의 중복·비정상 응답 행

- **증상**: 동일 종목·거래일이 중복된 응답은 PostgreSQL 한 UPSERT에서 동일 conflict key를 중복 갱신해 batch를 실패시킬 수 있다. 다른 한편으로 KIS 숫자 파서가 빈 값·문자열을 0으로 대체하면 누락된 거래량을 실제 0 거래량으로 오인할 수 있다. 미국 자동화는 DB 저장이 0건이어도 성공/retry 완료로 세던 경로가 있었다.
- **근본 원인**: KR 저장 경로에만 중복 제거·OHLCV 검증을 적용했고, US KIS 저장 및 원격 일봉 적재 경로는 각각 응답 행을 바로 UPSERT하거나 파싱 수만으로 성공을 판정했다.
- **영향 범위**: KR/US KIS 일봉·주봉·월봉 저장, US cache warm/open refresh 및 backfill, chart cache 보강 저장, `scripts/sync-daily-cache-async.mjs` 및 `scripts/sync-daily-cache-from-remote.mjs` 원격 캐시 적재.
- **해결 위치**: `lib/kis-kr-daily-price.ts`·`lib/kis-us-daily-price.ts`는 누락/비정상 숫자를 NaN으로 보존한다. KR/US cache saver는 활성 공식 `COMMON_STOCK` master와 제외 분류를 확인한 뒤 유효 날짜·OHLCV 및 중복 키를 검증·정규화하고 UPSERT `RETURNING` 날짜 집합을 대조해 불일치 시 롤백한다. `lib/us-daily-price-cache-warm.ts`는 실제 저장 확인 건수만 성공/retry 완료로 반영하며 폐기·중복 수를 집계한다. `lib/us-daily-open-cache.ts` 및 `scripts/us-daily-1200-backfill.ts`도 실제 저장 건수가 0인 경우 성공으로 세지 않는다. 두 원격 동기화 스크립트는 active COMMON_STOCK scope에서 각 시장별 공식 제외 플래그를 거르고, 요청하지 않은 종목·응답 내 중복 종목을 거부하며 미응답/빈 봉 종목 수를 노출한다. invalid row는 저장 전에 거부하고 중복 종목·날짜 행은 한 건으로 정리한다. DB 저장 검증 건수가 기대값과 다르면 트랜잭션을 롤백한다.
- **재발 자동 감지**: KIS diagnostics의 raw/parsed/saved/discarded count를 비교하고, US automation의 `failureCount`, `savedCandleCount`, `discardedOrDuplicateCandleCount`를 확인한다. 원격 async sync 결과의 `telemetry.duplicateCandleRows` 및 양 스크립트의 저장 행 검증 오류를 확인한다.
- **남은 위험**: 캐시 저장 메서드의 단위 회귀 검증은 이번 작업에서 추가하거나 실행하지 않았다. 운영 적재 범위의 end-to-end coverage parity는 로컬 코드 점검만으로 확인되지 않는다.

## 2026-11-11 US EMA/RVOL 분석 입력 품질

- **증상**: `analyze-us-rising-ema-rvol.cjs`의 EMA·RVOL 및 향후 5일 성과 분석 입력에 잘못된 달력 날짜/OHLCV가 포함될 수 있고, 공식 분류상 비보통주 일부가 표본에 섞일 수 있었다.
- **근본 원인**: 원본 candle query가 timeframe과 `volume > 0`만 제한하고 공용 candle quality predicate와 전체 US 비보통주 제외 플래그를 적용하지 않았다.
- **영향 범위**: 해당 연구 스크립트가 산출하는 RVOL 구간·EMA 중첩 점수·승률 표본. 운영 API/캐시 저장은 변경하지 않는다.
- **해결 위치**: `scripts/analyze-us-rising-ema-rvol.cjs`가 `scripts/daily-candle-quality-sql.mjs`를 동적 import해 달력·유한 숫자·OHLC 관계를 필터링하고, ETF·warrant·derivative·DR·leveraged·inverse를 DB master flags로 제외한다. 분석 목적상 기존 `volume > 0` 기준은 유지한다.
- **재발 자동 감지**: 파일 구문은 `node --check scripts/analyze-us-rising-ema-rvol.cjs`로 검사한다. 분석 쿼리에서 공용 predicate 호출 및 각 공식 분류 flag를 코드 리뷰 시 대조한다.
- **남은 위험**: 이번 수정에서는 로컬 DB 연결 및 전체 분석 실행을 하지 않아 표본 수·통계치 변화는 산출하지 않았다.

## 2026-11-11 US 일봉 scanner context 읽기 장애

- **증상**: 공통 US daily scan의 bulk candle read가 실패해도 scanner가 종목별 빈 캔들 결과로 완료될 수 있었다.
- **근본 원인**: 원격 bulk endpoint의 non-2xx/비정상 payload가 `null`로 반환된 뒤 빈 Map으로 바뀌었고, `createUsDailyScanContext()`는 DB read rejection도 catch해 빈 Map으로 대체했다.
- **영향 범위**: DB context를 공유하는 US indicators, breakout, Bollinger, golden-cross 및 daily follow-up. 데이터가 없는 정상 종목의 계산은 유지된다.
- **해결 위치**: `lib/us-daily-price-cache.ts`는 설정된 remote endpoint의 bulk 실패를 요청 시장/timeframe/대상 수가 포함된 오류로 전파한다. `lib/us-daily-scan-context.ts`는 loader 예외를 숨기지 않아 route/automation/follow-up의 기존 error handling이 실패를 기록하도록 한다. 대상이 없는 정상 empty universe는 빈 Map을 유지한다.
- **재발 자동 감지**: 원격 실패는 caller의 502/automation FAILED 또는 daily-followup retry 결과에 드러나야 한다. 운영 scanner 결과에서 다수 종목이 동시에 insufficient history로 전환되면 관리자 API의 context candle row count와 remote cache endpoint 상태를 대조한다.
- **남은 위험**: 이 변경은 typecheck와 static diff 검사만 수행하며 원격 endpoint/DB 장애를 실제 재현하지 않았다.
- **후속 caller 처리**: bulk remote consumer도 빈 데이터와 loader 장애를 구분해야 한다. KR/US bulk API는 대상이 있는 상태에서 remote endpoint가 non-2xx/비정상 응답을 주면 예외를 던진다. Discord `/ticker`는 실시간 quote를 유지하되 일봉 지표 상태를 `UNAVAILABLE`로 출력하고, cache가 정상 조회됐지만 해당 종목 봉이 없을 때만 `NO_DATA`를 표시한다. 일반 KR/US DB bulk query 오류도 전파된다.
- **요청-응답 종목 parity**: remote bulk response가 `ok:true`여도 요청 code 일부 누락, 중복 code, 예상 밖 code, 비배열 `candles`가 있으면 실패로 간주한다. 정상적으로 봉이 없는 종목도 응답에 code와 빈 배열을 포함해야 한다. 회귀 감지 시 요청 market/code 집합과 응답 item 집합을 비교하며, upstream public route는 입력 code마다 item을 반환해야 한다.

## 2026-11-11 국내 일봉 적재 배치 중복 날짜·비정상 OHLCV 방어

- **증상**: KIS 응답에 같은 거래일이 반복되면 단일 `INSERT ... ON CONFLICT`가 같은 키를 두 번 갱신하려다 트랜잭션 전체를 실패시킬 수 있고, 날짜·OHLCV 필드가 비정상이면 유효하지 않은 가격이 캐시에 들어갈 수 있다. 또한 지연된 과거 응답의 zero-volume 행이 그보다 최신인 캐시를 무시하고 종목을 비활성화할 수 있었다.
- **근본 원인**: 저장 경로가 공급자 응답을 날짜 키로 정규화하거나 OHLCV 관계를 검사하지 않고 바로 UPSERT했다.
- **영향 범위**: 국내 일봉·주봉·월봉 KIS 수집 저장. 정상 응답의 저장 결과는 유지하며, 중복 날짜는 마지막 응답 값 하나로 축약하고 검증 실패 행은 적재하지 않는다.
- **해결 위치**: `lib/kr-daily-price-cache.ts`의 `saveKrDailyCandles`에서 실재하는 YYYYMMDD, 유한 숫자, 양수 가격, 비음수 거래량, high/low의 OHLC 포함 관계를 확인한 뒤 날짜별 한 행만 정렬 저장한다. UPSERT의 `RETURNING` 날짜 집합을 입력 날짜 집합과 비교해 빠진 행이 있으면 트랜잭션을 롤백한다. 활성 상태는 적재 후 DB 원본 일봉의 최대 날짜보다 최신이거나 같은 입력에서만 갱신해 과거 봉이 최근 상태를 뒤집지 않게 한다. `refreshKrDailyCandles`는 DB가 반환한 저장 건수와 폐기/중복 건수를 진단에 포함한다. KR automation의 성공·retry 완료·실패 이력·debug 상태는 파싱 건수가 아니라 DB 저장 확인 건수로 판정한다. 실행 후 활성 COMMON_STOCK 기준 시장별 최신일 coverage와 누락·지연 건수를 기록하고 gap이 있으면 automation run을 PARTIAL로 분류한다. 공통 automation wrapper는 반환 객체의 `status=FAILED`도 실패로 보존해 HTTP 작업이 성공 라벨로 기록되는 것을 막는다. latest 요약 및 활성 상태 판정도 정규화된 행을 기준으로 한다.
- **재발 자동 감지**: `npm run audit:daily-candles`는 localhost DB에 read-only transaction으로 접속해 KR/US 일봉 및 latest summary의 비정상 OHLCV·달력상 불가능한 날짜·특수 숫자, 중복 키 및 최신일 coverage를 출력한다. 원본/요약 품질 위반이나 중복 키가 있으면 exit code 1로 종료한다. KIS 응답 진단의 `rawOutputCount`와 `parsedCandleCount`, 실행 후 `dailyCoverage[].gapCount`와 `partialFailureCount`도 함께 확인한다.
- **추가 수집 경계 검증**: KIS 응답 파서가 저장 계층에 도달하기 전 실재하는 YYYYMMDD, 필수 5개 OHLCV 숫자, 양수 가격, 비음수 거래량, OHLC 포함 관계를 검사한다. 최근 감사에서 확인한 US 과거 602행은 별도 legacy cache 이슈이며 이번 파서 수정만으로 복구되지 않는다.
- **조회 경계 보호**: KR/US local candle readers, 공통 원격 cache client, 공개 `/api/public/daily-candles` 응답도 같은 OHLCV·날짜 조건으로 필터링한다. DB 저장값을 0으로 보정해 정상처럼 보이게 하지 않으며, 유효하지 않은 과거 봉은 지표 계산에서 제외한다.
- **직접 SQL 소비 경로**: 공통 `validDailyCandleSql()`은 실제 YYYYMMDD 달력 날짜(윤년 포함), 유한·양수 가격, 비음수 거래량, OHLC 포함 관계를 확인한다. 이를 화면 차트 및 public API, DB screener의 원본/최신 요약, accumulation, KR/US Bollinger 계열, multi-timeframe 추천, US OBV/ADL, 수집 freshness/backfill 조회, weekly projection 생성·coverage, 국내 financial export에 적용한다. 파생/선별 결과는 유효행만 가지고 최신 N개를 채우며, 경로별 회귀 테스트에서 SQL 조건을 검사한다.
- **공개 일봉 API SQL alias**: `app/api/public/daily-candles`는 bulk/single 쿼리의 window ranking 전에 source alias `c`에 품질 필터를 적용한다. subquery 결과 alias를 source 조건으로 잘못 참조하지 않도록 route 회귀 테스트에서 확인한다.
- **latest daily summary 복구**: KR/US 일봉 저장 후 summary를 원본 테이블에서 종목별 최신 유효 거래봉으로 다시 계산한다. 기존 invalid summary는 제거하고, stale 판단·coverage 집계는 summary의 품질 조건을 적용해 invalid 행이 freshness 완료로 취급되지 않도록 한다. 재발은 daily cache job SQL 및 `npm run audit:daily-candles`로 확인한다.
- **원격 캐시 동기화 필터**: `scripts/sync-daily-cache-async.mjs`의 `--only-missing-date`는 같은 날짜의 invalid 원본봉을 결손으로 취급해 다시 수집하고, `--only-unrefreshed`는 invalid summary를 stale로 취급한다. D 봉 저장 후 summary는 영향받은 종목의 DB 원본에서 최신 유효 거래봉을 다시 골라 덮어쓰며 write 결과를 정확히 검증한다.
- **원격 DB 적재의 summary 동기화**: `scripts/sync-daily-cache-from-remote.mjs`와 async sync는 공용 `refreshDailyCandleSummaries()`를 트랜잭션 안에서 실행한다. D 봉 저장 후 해당 종목의 최신 유효 원본 거래봉 기준으로 요약을 재작성하고 invalid summary를 제거하며, 실제 요약 row 날짜와 OHLCV 값을 입력 source와 대조한다. W/M 동기화는 일봉 summary를 갱신하지 않는다.
- **운영 진단/스캔 스크립트**: `report-kr-daily-cache-status.cjs`의 summary coverage와 `scan-us-latest-under-010.cjs`의 가격 후보는 `scripts/daily-candle-quality-sql.mjs` predicate를 거친다. 상세 원본 row를 조사하는 전용 무결성 audit만 invalid row를 의도적으로 그대로 센다.
- **DB 성능 점검 스크립트**: `db-performance-check.mjs`도 raw 일봉에서 summary를 직접 만들지 않고 공용 `refreshDailyCandleSummaries()`를 사용한다. summary 성능 측정은 품질 predicate를 적용해 invalid cache row가 결과·계획 측정을 오염시키지 않게 한다.
- **미국 1,200봉 보정 작업 종료 상태**: `us-daily-1200-backfill.ts`는 숫자가 아닌 목표/동시성 설정, 빈 유니버스, provider 오류, 같은 날짜만 반복되는 pagination, 종목 일부 실패 또는 종목당 요청 상한 도달 시 비정상 종료한다. 반복 페이지는 중복 봉을 재저장하지 않고 중단하며, 앞서 저장한 유효 봉 수는 최종 진단에 포함한다.
- **남은 위험**: 최초 감사에서 US 원본 일봉 602행이 OHLC 관계 위반이었고, 571행은 2023-06-05에 몰려 있었다. 그중 최근 180일의 2행은 2026-10-27이며 NAS latest summary에도 2행이 반영돼 있었다. KR은 0행, 두 시장 모두 중복 키 0건이었다. 해당 저장 행의 `raw_payload`도 동일 OHLC 값을 담았으며 source는 KIS다. 기존 잘못된 cache 행은 이 작업에서 수정/삭제하지 않았고, 일부 raw-table 직접 조회 스캐너가 이를 계속 소비할 수 있다. 과거 데이터 복구 또는 모든 소비 쿼리의 품질 필터 적용이 필요하다. coverage는 latest summary 기준이며 거래량 0 봉은 기존 summary 정의상 포함하지 않는다.

## 2026-10-28 미국 일봉 지정 거래일 fallback 누락

- **증상**: bulk 응답에 과거 봉은 포함되지만 요청한 최신 거래일 봉이 없는 종목은 기존 fallback 검사에서 정상 데이터가 있는 것으로 간주되어 단일 종목 chart 재조회가 생략될 수 있다.
- **근본 원인**: `fillMissingDailyCandleItems`가 빈 배열/종목 미포함만으로 결손을 판정하고, 지정일 모드에서도 요청일 존재 여부를 확인하지 않았다.
- **영향 범위**: `targetDate` 기반 국내·미국 일봉 보완. 지정일 봉이 누락된 bulk 응답은 단일 chart fallback 대상으로 재조회한다.
- **해결 위치**: `lib/daily-candle-fallback.mjs`는 fallback 결과를 기존 bulk 봉 뒤에 합쳐 날짜 이력을 보존하고 각 봉의 출처를 구분한다. fallback 실패는 전체 실행 실패 수에 반영하되, 이미 수신한 유효 과거 봉은 `scripts/sync-daily-cache-async.mjs`가 저장한다. 원래 bulk items는 fallback 전에 요청 코드·중복·배열 구조를 검증해 helper가 malformed 응답을 조용히 숨기지 않게 한다.
- **재발 자동 감지**: 로컬 DB 원본 `us_instrument_universe_candles`에서 활성 공식 COMMON_STOCK별 지정 날짜 행 존재 여부를 확인한다. `us_latest_daily_candles`는 거래량 0인 날을 제외할 수 있으므로 원본 테이블 날짜 집합을 기준으로 한다.
- **남은 위험**: 2026-10-28 운영 API 재조회 당시 chart fallback 일부는 이전 마지막 거래일만 반환했고, 후속 요청은 HTTP 502로 실패했다. 클라이언트 fallback 정확성은 수정됐지만 공급원에 봉이 없거나 API 장애인 경우 해당 종목 데이터는 복구되지 않으므로 운영 정상화 뒤 재실행해야 한다.

## 2026-10-20 RSS Discord 알림 출처 허용 목록 적용

- **증상**: Newsis 등 SEC·StockTitan 이외 RSS도 공통 시장 RSS Discord webhook 알림을 받을 수 있었다.
- **근본 원인**: RSS 수집 결과에는 허용 출처 외 국내 매체가 포함되지만, 알림 전송 쿼리와 재시도 워커에 출처 허용 목록이 없었다.
- **영향 범위**: `MARKET_RSS` 신규 전송 및 `discord_delivery_queue` 재시도. RSS 데이터 수집은 계속되며, SEC 및 StockTitan 알림은 유지된다.
- **해결 위치**: `market-rss-pipeline`에서 비허용 출처의 PENDING 행을 `SKIPPED`로 바꾸고 전송 조회를 SEC·StockTitan으로 제한한다. `discord-delivery-retry`는 큐의 원본 기사 출처를 확인해 비허용 또는 원본 미확인 메시지를 전송하지 않고 큐와 기사 상태를 `SKIPPED`로 기록한다.
- **재발 자동 감지**: `market-rss-discord-policy.test.ts`에서 허용·차단 출처를 검증한다. 배포 전 `npm run deploy:verify`를 실행한다.
- **남은 위험**: 이미 발송 완료된 과거 알림은 회수되지 않는다. 큐에 남은 기존 비허용 출처는 재시도 시 폐기 상태로 전환된다.

## 2026-10-20 비 StockTitan RSS Discord 메시지 형식 불일치

- **증상**: RSS Discord 알림에 출처·번역 상태·티커·등락률 등의 불필요한 줄이 표시되거나, 제목 링크의 임베드가 붙을 수 있었다.
- **근본 원인**: 신규 발송 포맷에 메타데이터가 포함됐고, 실패한 과거 발송은 재시도 큐가 저장 payload 그대로 별도 전송했다.
- **영향 범위**: `MARKET_RSS`를 사용하는 StockTitan 이외 RSS 신규 및 재시도 알림. StockTitan 신규 메시지 형식은 범위에서 제외한다.
- **해결 위치**: `market-rss-pipeline`은 비 StockTitan 메시지에 제목·발행 시각만 구성하고 모든 RSS 전송에 임베드 억제를 설정한다. `discord-delivery-retry`는 큐에 남은 비 StockTitan payload도 제목·발행 시각만 추려 보낸다.
- **재발 자동 감지**: `market-rss-discord-message.test.ts`에서 기존 포맷을 축약했을 때 다른 항목이 남지 않는지와 임베드 플래그 값을 확인한다. 배포 전 `npm run deploy:verify`를 실행한다.
- **남은 위험**: 재시도 payload에 기존 포맷 외의 제목 형태가 저장된 경우 제목 줄을 인식하지 못할 수 있다. 현재 파이프라인이 만드는 굵게 표시한 제목 및 링크 제목 형식을 회귀 테스트로 고정한다.

이 문서는 RSS 프로젝트에서 반복적으로 발생할 수 있는 오류와 확인 순서를 관리한다. 모든 진단은 실제 응답·로그·DB 상태를 기준으로 하며, 추정만으로 토큰이나 캐시를 삭제하지 않는다.

## 공통 진단 원칙

1. 요청 ID, HTTP 상태, 외부 API 응답 코드와 메시지를 먼저 확보한다.
2. 로컬·개발·운영 실행 환경의 환경변수 주입 상태를 분리해 확인한다.
3. 기존 DB 캐시를 변경하기 전에 읽기 전용 상태를 확인한다.
4. 실패한 단일 종목 또는 단일 요청으로 재현한 뒤 전체 작업을 실행한다.
5. 한글 로그와 문서는 UTF-8을 유지한다.

원격 일봉 동기화의 `scripts/sync-daily-cache-from-remote.mjs`는 대상 universe가 비거나, 저장 검증 봉이 0건이거나, 요청 종목의 빈/누락 봉이 있을 때 성공으로 보고하지 않는다. 최상위 `ok`와 프로세스 exit code가 실패를 나타내고, 종목 누락은 `missingCount`와 `missingCodeSample`로 확인한다. 이전 batch가 이미 commit된 뒤 뒤쪽 batch에서 중단되면 그 저장은 유지되므로 재실행 전 로컬 최신 거래일과 coverage를 확인한다.

같은 스크립트는 OHLC 가격의 유한성/양수 및 high-low 관계와 거래량의 유한성/비음수 조건을 확인한다. 현재 DB/API가 `double precision`과 JSON number를 사용하므로 안전 정수 범위를 넘는 값도 기존 계약에 따라 허용한다. 공개 API가 JSON 숫자로 내보내기 전 원천 정밀도를 잃을 수 있으며 이 손실은 로컬 동기화 단계에서 복구할 수 없다.

동기화 결과에서 `received`는 원본 봉 응답 행, `saved`는 날짜 중복 정리 후 UPSERT 검증을 통과한 행이다. 같은 종목/거래일에 같은 OHLCV가 반복되면 한 행으로 저장하고 `duplicateCandleCount`에 반영한다. 같은 거래일의 OHLCV 값이 서로 다르면 last-write-wins로 고르지 말고 입력 batch를 거부해 원천 응답을 조사한다.

각 `committed` 진행 로그는 하나의 시장별 batch transaction commit 이후에만 출력된다. 실패 뒤 재실행 전까지 저장 확정으로 볼 수 있는 진행 경계는 마지막 `committed` 로그이며, transaction 실패한 batch의 `saved`는 집계되지 않는다.

universe 또는 batch 오류는 시장별 결과의 `ok=false`와 `failure` 객체(phase, market, offset, codeCount, 요약 오류)를 남긴다. DB 저장 전후 batch 오류에는 `failure.received`, `expectedSaveCount`, `duplicateCandleCount`, `missingCount`가 시도된 batch 기준으로 들어간다. 최종 집계의 counters는 commit 완료분만 포함하므로 이 실패 batch 수치를 합산해 committed totals로 오인하지 않는다. `--market=ALL`은 실패한 시장 결과를 보존하고 다른 요청 시장도 계속 조회한다. 최상위 exit code 1을 확인하고, 다시 실행하기 전에 각 시장의 마지막 committed 진행 로그와 로컬 coverage를 대조한다.

DB save 중 `failure.transactionOutcome=COMMIT_UNKNOWN`이면 COMMIT 응답을 받지 못한 것이므로 write 반영 여부를 로그만으로 판단하지 않는다. 실행 전후 로컬 DB의 대상 market/code/timeframe coverage를 read-only로 재확인한다. ROLLBACK 실패 시 client/backend 연결은 pool에서 제거되어야 하며 오류 메시지에는 원래 write 오류와 rollback 오류가 함께 남아야 한다.

`failure.errorDetails`는 nested `cause`와 AggregateError의 원본 errors를 최대 4단계까지 구조화해 보존한다. 각 AggregateError의 하위 errors는 배열 형식인지 확인한 뒤 최대 20개만 포함하고 나머지는 `errorsOmitted`로 표시한다. 배열 형식이 아니면 `errorsUnavailable`을 표시하며, 요약 중 예상치 못한 getter/형식 오류가 발생해도 `ErrorSummaryFailed`로 안전하게 반환한다. 최상위 `failure.error`만으로 원본 DB/network 오류가 숨겨지지 않게 사용하고 URI userinfo, 민감 query/`key=value` 값, Bearer 자격증명은 출력하지 않는다. Error 이름은 마스킹 후 100자, 오류 message는 500자로 제한한다. Error 객체, 문자열 throw, 실행 최상위 오류, pool 종료 오류도 공통 sanitizer로 요약하며 원문 message를 직접 내보내지 않는다.

`npm run cron:check`는 error property 보호용 try/catch와 `AggregateError.errors` 배열 검증·폭 제한의 실행 순서도 검사한다.

동기·비동기 동기화 초기화 시 `DAILY_CACHE_API_URL`은 trim 후 HTTP(S) absolute URL이며 userinfo가 없는지 검증한다. URL parser 오류는 설정 원문을 포함하지 않는 고정 메시지로 변환하며, 동기 스크립트는 PostgreSQL pool 생성의 동기 예외도 connection string을 노출하지 않는 고정 메시지로 변환한다. 비동기 스크립트의 daily-candles, fundamentals, chart 및 직접 KIS endpoint는 검증된 동일 base URL만 사용한다.

비동기 일봉 동기화는 `persistParts(kind, parts)`에 시장 kind를 전달해 `refreshDailyCandleSummaries`에 명시한다. 이 인수가 누락되면 DB transaction에서 ReferenceError가 발생해 batch rollback될 수 있으므로 `npm run cron:check`가 저장 함수 시그니처·호출부·summary 갱신 연결을 확인한다.

비동기 동기화 transaction에서 COMMIT 요청이 실패하면 결과를 `LOCAL_TRANSACTION_COMMIT_OUTCOME_UNKNOWN`으로 표시하고 client를 폐기한다. rollback도 실패하면 원래 transaction 오류와 rollback 오류를 함께 `AggregateError`로 보존하고 client를 폐기해 pool에 되돌리지 않는다. node-postgres 공식 문서상 `client.release(true)`는 client를 pool에 반환하는 대신 연결을 제거한다([Pool API](https://node-postgres.com/apis/pool)).

비동기 동기화 PostgreSQL pool은 새 연결 대기를 10초로 제한한다. idle client의 background `error`는 uncaught 종료 대신 listener에서 횟수와 첫 오류의 sanitized name/message/code 및 nested causes를 보존한다. 최종 JSON은 `pool.end()`가 끝난 뒤 출력하며, 실행 fatal error·종료 error·background error 중 하나라도 있으면 `ok=false`, 해당 failure 요약 및 exit code 1로 보고한다. URI userinfo, query/fragment 자격증명, token/secret 계열 path segment, key-value 및 `password is ...` 표현, Bearer/Basic 자격증명을 마스킹하고 message 500자·cause depth 4·AggregateError child 20개로 제한한다. node-postgres 공식 문서는 connection timeout 기본값이 0(무제한)이고 idle client 오류 listener가 없으면 uncaught error가 될 수 있다고 설명한다([Pool API](https://node-postgres.com/apis/pool)).

비동기 저장 batch에서 같은 market/code/date 봉이 여러 번 오면 숫자로 정규화한 OHLCV가 모두 같을 때만 하나로 합친다. 값이 다른 중복은 충돌 field와 종목·날짜를 오류에 표시해 transaction 전체를 rollback한다. 재발은 `npm run cron:check`에서 중복 비교와 실패 조건을 감시한다.

중복 봉이 있는 정상 batch는 `saved`가 원본 `fetched`보다 작으므로, async 성공 판정은 시장별 commit 기준 `saved + duplicateCandleRows === fetched`를 사용한다. duplicate counter는 전체 transaction이 commit된 뒤에만 반영한다.

비동기 fundamentals 응답은 저장 전에 요청 market/code와 대조하고, 미요청·중복 code 및 잘못된 nullable numeric/text/timestamp 필드를 거부한다. 응답 code는 요청 universe의 정규 code로 바꿔 저장한다. 누락 row는 public snapshot endpoint가 보유 row만 반환할 수 있으므로 허용한다.

비동기 일봉 응답 envelope의 `market`과 `timeframe`도 요청값과 일치해야 한다. mismatch는 row 정규화와 DB 저장 전에 batch 오류로 종료한다. 직접 KIS 경로는 응답 원천을 검증한 뒤 동일한 요청 scope metadata를 envelope에 부여한다.

비동기 sync는 허용된 option 목록을 적용하고 위치 인자·알 수 없는/중복 옵션·누락 값을 pool 생성 전에 거부한다. boolean은 문자열 `true`/`false`만 받고 bare boolean flag는 true로 처리한다. 정수 옵션(`limit`, `batch`, worker, queue, `max-instruments`)은 공백·쉼표·지수 표기 없이 정수 십진수 literal만 허용하고 safe integer 여부를 검사한 뒤 기존 bound로 clamp한다. 시총 옵션은 양의 십진수 literal만 허용한다. 특히 typo로 전체 시장 실행이 되는 경우, 0 consumer 또는 NaN queue capacity로 인한 대기를 방지한다.

`--include-inactive-daily=true`는 US universe의 `daily_active` 제약을 제거한다. `--us-market-cap-under`로 추가 필터링할 때도 snapshot eligibility query에 같은 동적 filter를 써야 비활성 일봉 종목을 되살리지 않고, 반대로 명시적으로 포함한 종목을 다시 제외하지 않는다.

US에서 `--only-missing-date=true`와 `--only-unrefreshed=true`를 함께 지정하면 둘 중 하나로 분기하지 않고 조건을 AND로 결합한다. 대상 날짜에 유효 봉이 없고 유효 latest summary가 30분 이상 stale이거나 없는 종목만 조회한다.

`--only-unrefreshed=true` 단독 옵션도 US D봉에서만 유효하며, 다른 market/timeframe 조합은 실행 전에 오류 처리한다.

이 공개 읽기 경로는 API URL userinfo를 허용하지 않는다. `.env.local`에서 주입된 로컬 DB/API URL은 앞뒤 공백을 제거한 동일 값으로 검증·사용하며, fundamentals 요청도 검증된 공개 API base URL을 재사용한다.

로컬 PostgreSQL pool의 새 연결은 10초 후 timeout되며 무기한 기다리지 않는다. pool idle client의 `error` 이벤트 listener는 오류를 sanitized 구조로 보존하고 발생 수를 집계한다. 이런 오류가 한 번이라도 있으면 최종 JSON에 `poolBackgroundFailure`가 포함되고 전체 `ok=false`, exit code 1이어야 한다. node-postgres는 idle client에서 backend/network 오류가 발생할 수 있고 listener가 없으면 uncaught error로 프로세스가 종료될 수 있다고 설명한다([공식 Pool API](https://node-postgres.com/apis/pool)).

동기화 최종 JSON은 pool 종료 뒤 출력한다. 최상위 `fatalFailure` 또는 `poolShutdownFailure`가 있으면 시장별 처리 결과가 전부 성공이어도 최상위 `ok`는 false이고 프로세스 exit code는 1이어야 한다.

동기화 시작 전 `--limit`과 `--batch`는 안전한 정수여야 한다. 무효 CLI 값은 pool/API 실행 전에 명시 오류로 거부되어야 하며, 유효 정수의 경계 초과는 문서화된 범위(각각 1–300, 1–100)로 clamp한다.

지원 인자는 `market`, `timeframe`, `limit`, `batch`, `skip-fundamentals`다. 중복/미지원 옵션, 위치 인자, 필수 값 누락, `skip-fundamentals`의 `true|false` 외 값은 실행 전 거부한다. 환경설정·CLI 오류는 pool 생성 전에 발생하므로 어떤 DB/API 호출도 시작하지 않는다.

원격 응답은 envelope의 JSON object와 엄격한 `ok === true`, `items` 배열부터 확인한 후 row 구조와 집계를 처리한다. null 응답, null row, 비배열 candles는 일반 TypeError가 아니라 stage·market이 식별되는 형식 오류로 반환되어야 한다.

동기화 실패의 `failure.phase`는 `daily-candles-request/http/body/json`, `daily-candles-envelope/items/normalize`, `instrument-fundamentals-request/http/body/json/envelope/items`, `database-save` 경계를 구별한다. body read timeout은 body phase, 응답 파싱 오류는 json phase로 보존되며 `failure.error`와 함께 병목 위치를 판정한다.

같은 동기화 스크립트의 fundamentals snapshot API는 캐시에 존재하는 row만 반환할 수 있어 미보유 종목은 `fundamentalsMissingCount`와 `fundamentalsMissingCodeSample`로 별도 관찰하고 봉 적재 상태를 실패 처리하지 않는다. 누적 표본은 시장 접두사를 포함해 최대 20개이며 실패 batch 표본도 같은 `market:code` 형식을 사용한다. 다만 반환된 row의 market/code가 해당 요청 universe에 포함되는지와 중복 여부는 저장 전에 검증해야 한다.

외부 `GET /api/public/instrument-fundamentals`도 snapshot 존재만으로 종목 자격을 판정하지 않는다. 요청 market alias를 정규 거래소로 해석하고 활성 `COMMON_STOCK` 마스터 및 ETF/ETP·워런트·파생·DR·우선주 플래그를 통과한 code만 snapshot과 조인한다. 미등록·비활성·분류 불가 코드는 fail-closed로 응답에서 제외한다.

fundamentals snapshot의 nullable double precision 필드(`price`, `changeRate`, `open`, `high`, `low`, `volume`, `tradingValue`, `marketCap`, `listedShares`)는 응답에서 `null` 또는 유한 number여야 한다. 필드 자체가 빠지거나 문자열/비유한 숫자가 오면 batch를 저장하지 않고 `instrument-fundamentals-items` 단계의 field 명시 오류로 분류한다.

같은 응답에서 `name`은 문자열, `currency`는 필수 키의 문자열/null, `observedAt`·`fetchedAt`은 필수 키의 유효 timestamp 문자열/null로 검사한다. timestamp null은 저장 SQL의 `COALESCE(..., NOW())` 경로를 유지하며 필드 누락은 `undefined` parameter 오류 전에 items 단계에서 거부한다.

## 2026-10-20 StockTitan 제목 이외 RSS 번역 범위 차단

- **증상**: 번역 API 요구 범위는 StockTitan RSS 제목인데 다른 출처의 RSS 제목도 번역 provider로 전달될 수 있었다.
- **근본 원인**: 운영 `translatePendingMarketRssArticles()` 조회가 RSS 출처를 필터링하지 않았고, 관리자 `market-rss-test?translate=true`가 전체 피드를 대상으로 번역을 실행할 수 있었다. 공통 변환 함수도 출처 제한 없이 제목을 provider에 넘겼다.
- **영향 범위**: 호출 조건을 만족한 비 StockTitan RSS 제목이 외부 번역 사용량과 월간 한도에 포함될 수 있었다. 공통 함수는 제목만 전달했으나 제목의 출처를 제한하지 않았다.
- **해결 위치**: 운영 쿼리에 `source=STOCKTITAN`을 고정하고 공통 번역 함수에도 동일한 방어를 추가한다. 관리자 테스트는 `translate=true`에서 StockTitan만 기본 선택하고 다른 출처를 거부한다. 번역 문자 수 기록도 제목 길이로 맞춘다.
- **재발 자동 감지**: 공통 함수 테스트에서 비 StockTitan 기사로 provider가 호출되지 않는지 검증하고, 관리자 API 테스트에서 기본 StockTitan 제한과 다른 출처 거부를 검증한다. `npm run deploy:verify`로 전체 회귀 검증한다.
- **남은 위험**: 변경 전 이번 달 사용량 집계에는 이전의 비 StockTitan 제목 요청이 반영되어 있을 수 있다. 과거 `translation_char_count` 값도 구 계산식에 따라 summary/content 길이를 더해 실제 provider 입력량보다 클 수 있다. 과거 값을 삭제·수정하지 않으며 월별 한도는 다음 달에 새로 시작하고 이후 운영 호출부터 StockTitan 제목만 예약한다.

## 2026-09-18 운영 메인 페이지 ChunkLoadError

- **증상**: 운영 `/`에서 `ChunkLoadError`가 발생하고 `페이지를 불러오지 못했습니다`가 표시됨. 브라우저가 이전 HTML이 참조하는 해시 청크를 요청했지만 활성화된 릴리스에서 404가 됨.
- **근본 원인**: 릴리스 디렉터리 교체 시 이전 `.next/static` 해시 파일을 제거하면서, 브라우저·프록시가 잠시 보유한 이전 HTML과 새 정적 자산의 호환 경로가 없었다.
- **해결 위치**: `deploy/oci/stockman-activate`가 이전 릴리스의 `.next/static`을 incoming 릴리스에 보존한다. `deploy/oci/nginx-stockman.conf`는 HTML·API를 재검증하고 해시 정적 파일만 장기 캐시한다.
- **클라이언트 복구**: `components/client-error-reporter.tsx`가 청크 로딩 오류를 감지하면 세션당 한 번 캐시 버스터 URL로 재진입해 이미 열린 탭도 새 HTML을 받도록 한다.
- **재발 자동 감지**: `npm run deploy:verify`의 standalone `/charts` smoke와 운영 배포 후 메인 페이지 확인에서 청크 로딩 오류를 확인한다. 배포 체크리스트에 캐시·정적 청크 검사를 추가했다.
- **추가 원인**: standalone 패키지에 `.next/static` 복사가 빠지면 HTML은 200이어도 JavaScript 청크가 404가 된다. workflow에서 정적 파일을 명시적으로 복사하고 tar 내부 청크 존재를 검증한다.
- **검증 강화**: `deploy:verify`가 `/charts` HTML에서 실제 JS 경로를 추출해 해당 청크의 200·JavaScript 응답까지 확인한다.
- **검증**: 수정 후 전체 테스트, 타입체크, 문서·감사·cron 검사, production build 및 runtime smoke를 다시 통과시킨다.

## 2026-09-04 점검 기록

## 2026-09-08 점검 기록

### KIS 기간 조회 모드의 날짜 범위 검증 누락 보완

- **원인**: `startDate`·`endDate` 검증이 회원사 일별 조회에만 적용되고 증권사별 투자의견 조회에는 적용되지 않았다.
- **영향**: 투자의견 조회에 잘못된 날짜나 역전된 기간이 전달되어 외부 API 오류가 늦게 발생할 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 회원사 일별·증권사별 투자의견 조회가 동일한 날짜 형식과 범위 검증을 사용하도록 통합했다.
- **검증**: 타입 검사와 문서·마이그레이션 검사를 통과했다.

### KIS 기본 조회일의 UTC·KST 불일치 보정

- **원인**: 날짜를 UTC `toISOString()`에서 생성해 한국시간 자정 전후에 KIS 기준일과 하루 차이가 날 수 있었다.
- **영향**: 날짜를 생략한 국내 분봉·수급 조회가 실제 한국 날짜가 아닌 전일 데이터를 요청할 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에 `Asia/Seoul` 기준 날짜 생성 함수를 추가하고 기본 조회일에 적용했다.
- **검증**: 타입 검사와 문서·마이그레이션 검사를 통과했다.

### 해외 거래소 코드 대소문자 정규화

- **원인**: 소문자 거래소 코드가 유효성 검사를 통과해도 KIS 호출에는 원문 소문자가 전달될 수 있었다.
- **영향**: `exchange=nas`와 같은 요청이 KIS에서 잘못된 거래소 코드로 처리될 가능성이 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 거래소 코드를 검증 후 대문자로 정규화해 모든 해외 시세 호출에 사용한다.
- **검증**: 타입 검사와 문서·마이그레이션 검사를 통과했다.

### KIS 분봉·조정주가 입력값 검증 보강

- **원인**: 해외 분봉 간격·조회 건수와 국내 조정주가 옵션이 임의 문자열로 외부 API에 전달될 수 있었다.
- **영향**: 잘못된 요청이 KIS 오류로 늦게 실패하고, 차트 모달에서 원인 구분이 어려워질 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 해외 분봉 간격을 `1|5|10|15|30|60`, 조회 건수를 `1..120`, 국내 조정주가를 `0|1`로 제한했다.
- **검증**: 타입 검사와 문서·마이그레이션 검사를 통과했다.

### 국내 KIS 실패 응답이 확정 수급으로 표시되는 문제 보정

- **원인**: 국내 `market-flow` 응답의 `flowStatus`가 KIS 호출 성공 여부와 무관하게 추정 또는 확정 상태로 설정됐다.
- **영향**: API가 502를 반환한 상황에서도 차트 모달이 확정 수급 데이터처럼 표시할 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 `result.ok === false`이면 항상 `UNAVAILABLE`을 반환하도록 보정했다.
- **검증**: 타입 검사와 문서·마이그레이션 검사를 통과했다.

### 해외 KIS 정상 데이터가 장애 상태로 표시되는 문제 보정

- **원인**: 해외 호가·시세·분봉·기간봉·체결 응답이 성공해도 응답 메타데이터의 `flowStatus`를 항상 `UNAVAILABLE`로 고정했다.
- **영향**: 차트 모달에 정상적인 해외 데이터가 장애처럼 표시됐다. 국내식 투자자별 수급이 없다는 사실과 시세 데이터 조회 실패가 구분되지 않았다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 KIS 응답 성공 여부에 따라 `AVAILABLE`/`UNAVAILABLE`을 설정하고, 해외 투자자 수급 미지원 안내는 기존 `note`로 유지했다.
- **검증**: 타입 검사와 프로덕션 빌드에서 라우트 컴파일 경로를 확인한다.

### KIS 차트·수급 라우트의 외부 예외 표준화

- **원인**: KIS 네트워크 타임아웃, 응답 파싱 오류 또는 예기치 않은 공급자 예외가 `market-flow` 라우트 최상위까지 전파될 수 있었다.
- **영향**: 차트 모달이 표준 오류 JSON 대신 Next.js 기본 500 응답을 받아 원인 표시와 재시도 처리가 불안정할 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에 최상위 예외 경계를 추가해 안전한 오류 메시지만 로그에 남기고 `KIS_MARKET_FLOW_FAILED` 502 응답으로 표준화했다.
- **검증**: 타입 검사와 프로덕션 빌드에서 라우트 컴파일 경로를 확인한다.

### KIS 차트 요청의 잘못된 입력이 외부 API까지 전달되는 문제 차단

- **원인**: 국내 과거일 분봉 요청에서 잘못된 `date`를 현재 날짜로 대체했고, 일자별 시세의 `period`와 해외 티커·거래소 값을 충분히 검증하지 않았다.
- **영향**: 차트 모달이 사용자가 선택한 날짜와 다른 데이터를 표시하거나, KIS에 실패가 예정된 요청을 보내 원인 파악이 어려워질 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 `date=YYYYMMDD`의 실제 달력 유효성을 확인하고, `period`는 `D|W|M`, 해외 거래소는 `NAS|NYS|AMS`, 해외 티커는 허용 문자·길이를 검증하도록 보강했다.
- **검증**: 타입 검사, 전체 Vitest(144개 파일·475개 테스트), 문서·마이그레이션 검사, 프로덕션 빌드를 통과했다.

### KIS 시장 구분 및 해외 기간봉 파라미터의 잘못된 분기 방지

- **원인**: `market`이 `KR`·`US` 외 값이어도 국내 분기로 진행했고, 해외 기간봉의 기간·기준일을 라우트에서 검증하지 않았다.
- **영향**: 오타가 난 시장 값이 국내 종목 요청으로 처리되거나, KIS가 이해하지 못하는 해외 기간봉 요청이 외부 API까지 전달될 수 있었다.
- **해결 위치**: `app/api/kis/market-flow/route.ts`에서 시장을 `KR|US`, 해외 기간을 `0|1|2`, 기준일을 유효한 `YYYYMMDD`로 제한했다.
- **검증**: 타입 검사와 문서·마이그레이션 검사를 통과했다.

### 로컬 실행 시 `.env.local` 우선 주입

- **원인**: Next.js 개발 서버가 상위 셸에 이미 존재하는 환경변수를 유지해 `.env.local`의 KIS 자격증명과 다른 값으로 실행될 수 있었다.
- **영향**: 로컬에서는 유효한 `.env.local` 자격증명이 있어도 KIS가 `EGW00103` 등 인증 오류를 반환할 수 있었다.
- **해결 위치**: `scripts/dev-server.mjs`가 `.env.local`을 UTF-8로 직접 읽어 실행 환경에 주입하며, 파일 값을 상위 셸 값보다 우선 적용한다. 자격증명 원문은 출력하지 않는다.
- **검증**: 스크립트 구문 검사와 Git diff 공백 검사를 통과했다. 로컬 KIS 단일 종목 검증 후 전체 캐시 갱신을 수행하는 운영 절차를 유지한다.

## 2026-09-02 점검 기록

### 브라우저 오류 보고 폭주 및 비정상 payload 차단

- **원인**: 전역 `error`/`unhandledrejection` 이벤트가 짧은 시간에 반복되거나 배열 등 잘못된 JSON이 전송되면 인증 없는 오류 보고 API가 불필요하게 호출될 수 있었다.
- **영향**: 오류 수집 API와 Discord 진단 경로가 폭주해 정상 오류 처리와 운영 진단을 방해할 가능성이 있었다.
- **해결 위치**: `app/api/client-errors/route.ts`에서 객체 payload만 허용하고, 전달자 주소별 분당 30건으로 제한했다. 오래된 메모리 bucket은 정리한다.
- **검증**: `app/api/client-errors/route.test.ts`에 비정상 payload와 반복 요청 제한 테스트를 추가한다.

### 관리자 해외 분봉 갱신 API의 raw 예외 노출 방지

- **원인**: `app/api/admin/us-minute-candles/route.ts`가 갱신 실패 시 외부 공급자·DB 예외 메시지를 그대로 응답했다.
- **영향**: 관리자 화면에 불필요한 내부 구현 정보가 노출되고, 공급자 오류 형식에 따라 UI 처리가 달라질 수 있었다.
- **해결 위치**: JSON 객체와 거래소·티커 형식을 먼저 검증하고, 서버 로그에는 진단 메시지를 남기되 응답은 `US_MINUTE_CANDLES_REFRESH_FAILED`로 표준화했다.
- **검증**: 타입 검사와 전체 회귀 검증에서 해당 라우트의 빌드·컴파일 경로를 확인한다.

### 관리자 기능 모듈 및 공시 동기화 라우트의 예외 전파 방지

- **원인**: 기능 모듈 설정 조회, 최근 실행 이력 조회, Discord 재시도와 DART 동기화의 비동기 호출이 라우트 최상위에서 보호되지 않았다.
- **영향**: DB 또는 외부 연동 장애가 Next.js의 기본 500 응답으로 노출되고, cron 실행 결과가 표준 오류 형식 없이 종료될 수 있었다.
- **해결 위치**: 관련 라우트에 서버 로그와 표준화된 503/502 응답을 추가했다. 인증 및 정상 분기 동작은 유지한다.
- **검증**: 타입 검사·문서 검사 및 프로덕션 빌드로 라우트 컴파일 경로를 확인한다.

### KIS 외부 오류 원문 로그 길이 제한

- **원인**: 토큰 발급 및 해외 순위 조회 실패 시 공급자 응답 원문을 제한 없이 로그와 진단 저장소에 기록할 수 있었다.
- **영향**: 로그 폭주 및 공급자 응답에 포함될 수 있는 불필요한 정보의 장기 보관 위험이 있었다.
- **해결 위치**: `lib/kis-token.ts`는 500자, 해외 순위 조회 모듈은 응답 preview를 1,000자로 제한한다.
- **검증**: 타입 검사·문서 검사와 전체 프로덕션 빌드에서 연동 모듈 컴파일 경로를 확인한다.

### Discord 오류 알림 동시 중복 전송 방지

- **원인**: 동일 오류가 전송 완료 전에 동시에 발생하면 마지막 전송 시각만 갱신되어 dedupe 검사가 통과할 수 있었다.
- **영향**: 하나의 장애가 Discord 진단 채널에 중복 게시될 수 있었다.
- **해결 위치**: `lib/production-error-reporter.ts`에 fingerprint별 in-flight 집합을 추가하고 전송 완료·실패 모두 `finally`에서 해제한다.
- **검증**: 타입 검사와 프로덕션 빌드에서 모듈 컴파일 경로를 확인한다.

### 해외 분봉 거래량 raw 응답 console 출력 제거

- **원인**: `lib/kis-us-minute-turnover.ts`가 응답 원문 전체를 운영 console에 출력했다.
- **영향**: 응답 크기에 비례한 로그 폭주와 외부 API 응답의 불필요한 노출 가능성이 있었다.
- **해결 위치**: 상태 코드·원문 byte 수·파싱된 point 수만 요약 출력하도록 변경했다. API 반환 구조의 진단 원문은 기존 계약을 유지한다.
- **검증**: 타입 검사·문서 검사와 전체 빌드로 컴파일 경로를 확인한다.

### 예외 객체 직접 console 출력 제거

- **원인**: 일부 KIS·DART·관리자 라우트가 예외 객체 자체를 console에 전달했다.
- **영향**: 예외의 stack·cause·부가 속성이 로그에 함께 직렬화될 수 있었다.
- **해결 위치**: 제한된 길이의 `Error.message` 또는 고정된 `unknown error`만 기록하도록 정리했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 관리자 KIS 수동 테스트 라우트 입력·예외 경계 보강

- **원인**: 해외 가격 상세·체결 추세 관리자 테스트가 긴/비정상 티커를 그대로 외부 API에 전달하고, 호출 예외를 라우트 밖으로 전파할 수 있었다.
- **영향**: 외부 API 오류가 기본 500으로 처리되거나, 잘못된 입력이 불필요한 외부 호출을 유발할 수 있었다.
- **해결 위치**: 두 라우트에 티커 길이·문자 검증, 예외 표준화 응답(502), 토큰 부재 503 응답을 추가했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 관리자 DB 상태 API 인증 결과 누락 보정

- **원인**: `database-status` 라우트가 `requireAdminSession()`의 반환값을 확인하지 않고 DB 상태 조회를 계속했다.
- **영향**: 관리자 세션이 없는 요청도 DB 메타데이터 조회 로직에 도달할 수 있었다.
- **해결 위치**: 인증 실패 시 즉시 401을 반환하고, DB 장애는 내부 메시지를 숨긴 503으로 표준화했다.
- **검증**: 타입 검사와 문서 검사로 라우트 컴파일·문서 일관성을 확인한다.

### 관리자 캐시·종목 universe 디버그 API 인증 결과 누락 보정

- **원인**: `daily-candle-cache-debug`와 `instrument-universe-debug`도 관리자 인증 함수의 반환값을 확인하지 않았다.
- **영향**: 비인가 요청이 캐시·종목 universe 메타데이터 조회까지 진행할 가능성이 있었다.
- **해결 위치**: 인증 실패 즉시 401을 반환하고, 조회 장애는 제한된 서버 로그와 표준 503 응답으로 처리했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 관리자 universe import API 인증 결과 누락 보정

- **원인**: universe import 라우트가 관리자 인증 함수의 반환값을 확인하지 않았다.
- **영향**: 비인가 요청이 import 관련 DB 처리 경로에 도달할 가능성이 있었다.
- **해결 위치**: 인증 실패 시 즉시 `401 UNAUTHORIZED`를 반환하도록 수정했다.
- **검증**: 인증 호출 패턴 전수 검색과 타입·문서 검사를 통과했다.

### 관리자 DB 상태 항목별 raw 오류 메시지 제거

- **원인**: 개별 테이블 상태 조회 실패 시 예외 메시지를 `tables[].error`로 그대로 반환했다.
- **영향**: SQL/스키마 내부 정보가 관리자 API 응답에 노출되고 오류 형식이 테이블마다 달라질 수 있었다.
- **해결 위치**: 서버 로그에는 500자 이내 메시지만 남기고 응답은 `TABLE_STATUS_UNAVAILABLE`로 표준화했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### BB HTML export 및 골든크로스 cache debug 예외 경계 보강

- **원인**: HTML export와 cache debug 라우트의 병렬 DB/스캐너 호출이 예외 발생 시 기본 500으로 전파될 수 있었다.
- **영향**: 다운로드·진단 기능이 일관되지 않은 오류 응답으로 종료될 수 있었다.
- **해결 위치**: 서버 로그에는 제한된 메시지만 기록하고, export는 `BB_EXPORT_UNAVAILABLE`, debug는 `DAILY_GOLDEN_CROSS_CACHE_UNAVAILABLE` 503으로 표준화했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 공개 관심종목·DART 및 관리자 import 오류 응답 표준화

- **원인**: 일부 장애 경로가 500 또는 내부 오류 문구를 사용해 API별 오류 의미가 달랐다.
- **영향**: 클라이언트가 재시도 가능 장애와 입력 오류를 구분하기 어렵고, 관리자 import 응답에 내부 메시지가 노출될 수 있었다.
- **해결 위치**: 관심종목·DART 상세/계약·관리자 universe import의 외부 오류를 각각 503/502와 고정 오류 코드로 표준화했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### SEC Discord 관리자 테스트 raw 예외 응답 제거

- **원인**: Discord 전송 중 예외가 발생하면 예외 메시지를 응답에 그대로 반환했다.
- **영향**: webhook·네트워크 내부 정보가 관리자 API 응답에 노출될 수 있었다.
- **해결 위치**: 서버 로그에는 제한된 메시지만 기록하고 응답은 `SEC_DISCORD_SEND_FAILED` 502로 표준화했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### 관리자 universe import 파일명 경로 이탈 방지

- **원인**: multipart 업로드의 파일명을 임시 디렉터리 경로에 직접 결합하고 모든 수신 파일을 저장했다.
- **영향**: 비정상 파일명이 임시 디렉터리 밖을 가리킬 가능성이 있었다.
- **해결 위치**: basename 검증 후 필수 universe master 파일명만 임시 디렉터리에 저장하도록 제한했다.
- **검증**: 타입 검사와 문서 검사 통과를 확인한다.

### DART 이력 조회 와일드카드 입력

- 원인: 회사명 입력을 `ILIKE`에 그대로 전달해 `%`·`_`가 검색 패턴으로 해석될 수 있었다.
- 영향: 의도하지 않은 광범위 조회와 DB 부하가 발생할 수 있었다.
- 수정 위치: `app/api/dart/history/route.ts`.
- 조치: 와일드카드를 escape하고 `ESCAPE` 절을 적용해 입력을 리터럴 회사명으로 처리한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 해외 뉴스 거래소 입력 검증

- 원인: 해외 뉴스 API의 `exchange` 파라미터에 지원 여부 검증이 없었다.
- 영향: 잘못된 거래소 코드가 외부 조회 계층까지 전달될 수 있었다.
- 수정 위치: `app/api/stock/us/news/route.ts`, `app/api/stock/us/news/route.test.ts`.
- 조치: `NAS`, `NYS`, `AMS`만 허용하고 나머지는 `400`으로 차단한다.
- 검증: 관련 테스트 3개, `npm run typecheck`, `npm run docs:check` 통과.

### 해외 뉴스 티커 입력 검증

- 원인: 해외 뉴스 API가 비어 있지 않은 모든 티커 문자열을 외부 조회로 전달했다.
- 영향: 비정상적으로 긴 문자열이나 허용되지 않은 문자가 외부 계층까지 전달될 수 있었다.
- 수정 위치: `app/api/stock/us/news/route.ts`.
- 조치: 티커를 대문자 정규화하고 영숫자·`. / _ -`만 허용하며 최대 32자로 제한한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### DART 순위·이력 API 오류 및 입력 크기

- 원인: 순위 API가 내부 예외를 일반화하지 않았고, 이력 API의 회사명 입력 길이를 제한하지 않았다.
- 영향: 장애 정보가 일관되지 않게 노출되고 과도한 조회 입력이 처리될 수 있었다.
- 수정 위치: `app/api/dart/ranking/route.ts`, `app/api/dart/history/route.ts`.
- 조치: 회사명을 200자로 제한하고 장애 응답을 `503`으로 표준화한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 다중시간대 BB 반등 스캐너 오류·limit 입력

- 원인: 보호된 반등 스캐너가 예외 원문을 반환하고 `limit`을 제한하지 않았다.
- 영향: 내부 정보가 노출될 수 있고 과도한 스캔 범위가 요청될 수 있었다.
- 수정 위치: `app/api/scan/multi-timeframe-bb-rebound/route.ts`.
- 조치: `limit`을 1~100으로 정규화하고, 장애를 `503 MULTI_TIMEFRAME_BB_REBOUND_UNAVAILABLE`으로 변환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 다중시간대 BB 스캐너 오류 상세 노출

- 원인: 보호된 스캐너 라우트가 예외 원문을 응답에 포함했다.
- 영향: 외부 API·DB 내부 정보가 노출될 수 있었다.
- 수정 위치: `app/api/scan/multi-timeframe-bb-pullback/route.ts`.
- 조치: 서버 로그에만 원인을 기록하고 `503 MULTI_TIMEFRAME_BB_SCAN_UNAVAILABLE`을 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 공개 US OBV·ADL 스캐너 오류 상세 노출

- 원인: 스캐너 예외의 원문 메시지를 공개 API 응답에 포함했다.
- 영향: 외부 API·DB 내부 정보가 노출될 수 있었다.
- 수정 위치: `app/api/scan/us-daily-sideways-obv-adl/route.ts`.
- 조치: 서버 로그에만 원인을 기록하고 `503 US_OBV_ADL_SCAN_UNAVAILABLE`을 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 푸시 API 오류 상세 노출

- 원인: 푸시 상태 조회·테스트 발송 API가 예외 메시지를 응답에 그대로 포함했다.
- 영향: DB 또는 환경 설정의 내부 정보가 공개될 수 있었다.
- 수정 위치: `app/api/push/subscribe/route.ts`, `app/api/push/test/route.ts`.
- 조치: 원인은 서버 로그에만 기록하고 사용자 응답은 일반화된 `503`으로 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 공개 DART·SEC 피드 오류 상세 노출

- 원인: 피드 동기화 예외의 `message`를 공개 API 응답에 그대로 반환했다.
- 영향: 외부 API·DB 내부 정보가 사용자에게 노출될 수 있었다.
- 수정 위치: `app/api/dart/route.ts`, `app/api/sec/route.ts`.
- 조치: 서버 로그에만 진단 정보를 기록하고, 클라이언트에는 일반화된 `503` 응답을 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 차트 API 오류 상세 노출 및 입력 크기

- 원인: 예외 메시지를 그대로 응답하고 `code`·`company` 길이를 제한하지 않았다.
- 영향: 내부 구현 정보가 사용자에게 노출될 수 있고 과도한 입력이 처리 경로에 유입될 수 있었다.
- 수정 위치: `app/api/stock/chart/route.ts`.
- 조치: 코드·회사명 길이를 제한하고 서버 로그만 원인 메시지를 기록하며 클라이언트에는 일반화된 오류를 반환한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 해외 지표·상승종목 API 외부 장애

- 원인: DMI·MACD·상승종목 라우트가 외부 API 또는 저장소 예외를 직접 전파할 수 있었다.
- 영향: 장애 시 표준 JSON 대신 프레임워크 기본 오류 응답이 반환될 수 있었다.
- 수정 위치: `app/api/stock/us/dmi/route.ts`, `app/api/stock/us/macd/route.ts`, `app/api/stock/us/top-rising/route.ts`.
- 조치: 실패를 도메인별 `503` 응답으로 변환하고 내부 오류 상세를 노출하지 않는다.
- 검증: `npm run typecheck`, `npm run docs:check`, `npm run build` 통과.

### 해외 AMS 스카우트 API 외부 장애

- 원인: AMS 스카우트 외부 호출 예외가 라우트 경계 밖으로 전파될 수 있었다.
- 영향: 일시적인 외부 장애 시 기본 오류 응답이 반환될 수 있었다.
- 수정 위치: `app/api/stock/us/ams-scout/route.ts`.
- 조치: 예외를 `503 US_AMS_SCOUT_UNAVAILABLE`로 변환하고 캐시를 금지한다.
- 검증: `npm run typecheck`, `npm run docs:check` 통과.

### 자동화 설정 API DB 장애

- 원인: 자동화 주기 설정 조회의 DB 예외 경계가 없었다.
- 영향: 장애 시 Next.js 기본 오류 응답이 반환될 수 있었다.
- 수정 위치: `app/api/automation-settings/route.ts`.
- 조치: DB 조회 실패를 `503 AUTOMATION_SETTINGS_UNAVAILABLE` JSON 응답으로 변환하고 캐시를 금지한다.
- 검증: `app/api/automation-settings/route.test.ts` 2개, `npm run typecheck`, `npm run docs:check` 통과.

### 관심종목 API 입력 검증

- 원인: 잘못된 JSON·배열·비문자 코드가 예외 경로로 흘러가거나 과도하게 긴 코드가 저장 로직까지 전달될 수 있었다.
- 영향: 클라이언트가 일관되지 않은 `500` 응답을 받을 수 있고, 불필요한 입력이 DB 계층까지 도달할 수 있었다.
- 수정 위치: `app/api/watchlist/route.ts`.
- 조치: JSON 객체와 문자열 코드만 허용하고, 시장 코드 및 32자 길이를 검증한다. 잘못된 입력은 `400 INVALID_ITEM`으로 반환한다.
- 검증: `app/api/watchlist/route.test.ts` 4개, `npm run typecheck`, `git diff --check` 통과.

### 클라이언트 오류 보고 payload 및 Discord 재시도

- 원인: 브라우저 오류 보고 API가 요청 형식과 payload 크기를 제한하지 않았고, Discord 전송 전에 중복 억제 상태를 기록했다.
- 영향: 비정상·과대 요청이 처리될 수 있으며, Discord가 일시적으로 실패하면 같은 오류가 60초 동안 재전송되지 않았다.
- 수정 위치: `app/api/client-errors/route.ts`, `lib/production-error-reporter.ts`.
- 조치: JSON Content-Type·64KB 본문·메시지·경로 길이를 검증하고, Discord 전송 성공 시에만 중복 억제 상태를 기록한다. 보고 실패는 원 요청을 실패시키지 않는다.
- 검증: `app/api/client-errors/route.test.ts` 3개, `npm run typecheck`, `npm run docs:check` 통과.

### 문의 API DB 장애 응답

- 원인: 문의 목록 조회와 작성 핸들러가 DB 예외를 프레임워크 기본 오류 응답으로 남길 수 있었다.
- 영향: 클라이언트가 JSON 대신 HTML 오류 응답을 받아 후속 파싱 오류가 발생할 수 있었다.
- 수정 위치: `app/api/inquiries/route.ts`.
- 조치: 목록 조회는 `503 INQUIRIES_UNAVAILABLE`, 작성은 `503 INQUIRY_CREATE_FAILED` JSON으로 변환한다.
- 검증: `app/api/inquiries/route.test.ts` 2개, `npm run typecheck`, `npm run docs:check` 통과.

### React 오류 경계의 서버 모듈 번들 유입

- 원인: `app/error.tsx`에서 서버 전용 오류 보고 모듈을 직접 import해 `pg`의 `fs`·`net`·`dns` 의존성이 브라우저 번들에 포함됐다.
- 영향: Next.js 프로덕션 빌드가 `Module not found` 오류로 실패했다.
- 수정 위치: `app/error.tsx`.
- 조치: 오류 경계는 서버 모듈 대신 `/api/client-errors`를 호출하도록 분리했다. React 렌더링 오류는 복구 버튼으로 재시도할 수 있다.
- 검증: `npm run typecheck`, `npm run build` 통과.

### 문의 상세·상호작용 API 예외 경계

- 원인: 상세 ID 검증과 DB 예외 변환 없이 문의·댓글·좋아요·조회수 API가 DB를 호출했다.
- 영향: 잘못된 URL이나 DB 장애가 프레임워크 기본 오류 응답 또는 처리되지 않은 예외로 노출될 수 있었다.
- 수정 위치: `app/api/inquiries/[id]/route.ts`, `app/api/inquiries/[id]/comments/route.ts`, `app/api/inquiries/[id]/likes/route.ts`, `app/api/inquiries/[id]/views/route.ts`.
- 조치: ID를 사전 검증하고 DB 장애를 도메인별 `503` JSON 응답으로 변환한다. 기존 상세 조회의 `404` 계약은 유지했다.
- 검증: 관련 API 테스트 6개, `npm run typecheck`, `npm run docs:check` 통과.

### 스캐너·관리자 활동 조회 query 파라미터

- 원인: `limit`, `hours`에 `NaN`, 소수, 음수, 과대값이 들어와 내부 조회 함수까지 전달될 수 있었다. 관리자 활동 조회 DB 예외도 별도 응답 처리가 없었다.
- 영향: 비정상 조회 범위, DB 쿼리 오류, 관리자 화면의 JSON 파싱 실패 가능성이 있었다.
- 수정 위치: `app/api/scan/multi-timeframe-recommendations/route.ts`, `app/api/admin/user-activity/route.ts`.
- 조치: 정수 변환·최소/최대 범위 검증과 기본값을 적용하고, 관리자 활동 DB 장애는 `503 USER_ACTIVITY_UNAVAILABLE`로 변환한다.
- 검증: 관련 테스트 7개, `npm run typecheck` 통과.

### 해외 MFI 스캐너 입력값

- 원인: 공개·관리자 MFI API가 `period`와 `threshold`의 비정상 숫자 입력을 내부 스캐너에 그대로 전달할 수 있었다.
- 영향: `NaN` 또는 비정상 기간으로 캔들 조회와 지표 계산이 실패할 가능성이 있었다.
- 수정 위치: `app/api/stock/us/mfi-oversold/route.ts`, `app/api/admin/us-mfi-test/route.ts`.
- 조치: 기간을 2~200 정수, 임계값을 0~100 범위로 보정하고 공개 API DB 장애를 `503` JSON으로 변환한다.
- 검증: MFI 테스트 2개, `npm run typecheck` 통과.

### 루트 레이아웃 오류 복구

- 원인: 루트 레이아웃에서 예외가 발생하면 일반 세그먼트 오류 경계가 렌더링되지 않을 수 있었다.
- 영향: 사용자가 복구 버튼 없이 기본 오류 화면에 머물 가능성이 있었다.
- 수정 위치: `app/global-error.tsx`.
- 조치: 전역 오류 화면과 다시 시도 버튼을 제공하고, 오류를 `/api/client-errors`로 보고한다.
- 검증: `npm run typecheck`, `npm run build` 통과.

## KIS API 오류

### `EGW00103` / 유효하지 않은 AppKey

- 확인: `KIS_APPKEY`와 `KIS_APPSECRET`의 존재 여부, 앞뒤 공백, 실행 프로세스에 실제 주입된 값의 길이를 마스킹 상태로 확인한다.
- 주의: `scripts/dev-server.mjs`가 KIS 환경변수를 삭제하면 유효한 상위 환경변수 대신 오래된 `.env.local` 값이 사용될 수 있다.
- 해결: 실행 환경변수 삭제 로직을 제거하고, 삼성전자 등 단일 종목의 동일 수집 경로를 먼저 재시험한다. 성공 후 전체 캐시 갱신을 시작한다.
- 금지: `EGW00103`만 보고 DB 토큰을 삭제하거나 임의로 새 토큰을 반복 발급하지 않는다.

### HTTP 401 / `EGW00123` 인증 만료

- 해결: `buildKisAuthorization(DB_TOKEN)`으로 Authorization을 구성했는지 확인한다.
- 인증 실패가 명시되면 요청에 사용한 거부 토큰을 `refreshAccessToken(rejectedToken)`에 전달한다. 갱신은 프로세스 Promise와 PostgreSQL advisory lock으로 단일화하고, lock 안에서 DB 토큰을 다시 읽어 다른 worker가 이미 교체했으면 그 토큰을 재사용한다. DB 토큰 삭제는 저장된 토큰이 실제 거부 토큰과 일치할 때만 lock 안에서 조건부 수행한다.
- KIS 토큰 발급이 실패하면 60초 동안 재발급을 보류해 병렬 요청이 KIS의 분당 발급 제한을 연속 위반하지 않게 한다. 일시 HTTP/네트워크 오류만으로는 토큰을 무효화하지 않는다.
- 일반 AUTH 문자열이나 일시적 HTTP 오류만으로 유효한 공유 토큰을 삭제하지 않는다.

### HTTP 500 또는 일시적 네트워크 오류

- 확인: `httpStatus`, `rt_cd`, `msg_cd`, `msg1`, endpoint, `tr_id`, request ID를 기록한다.
- 해결: 공통 재시도 정책을 사용하고, 실패 캔들은 retry queue에 기록한다.
- 전체 작업은 부분 실패를 허용하되, 저장된 캔들만 후속 지표 캐시에 반영한다.

### 빈 `output2` 또는 캔들 부족

- 원인 후보: 종목 코드·시장 코드 불일치, 거래정지, 장외 시간, API 응답 범위 부족.
- 해결: 코드와 시장을 확인하고, 응답의 날짜·캔들 수를 기록한다. Mock 데이터를 운영 결과로 반환하지 않는다.

## 국내 일봉 캐시 갱신 오류

### `outside_schedule` 또는 `disabled`

- cron 라우트의 운영 시간·활성화·간격 설정 결과다.
- KR daily cache의 cron 응답 및 SKIPPED summary에는 `schedule` snapshot과 KST 평가시각이 포함된다. 5분 dedup은 같은 reason 및 같은 schedule 설정에만 적용하며 평가시각은 비교에서 제외한다. 설정이 바뀌면 dedup window 안에서도 새 이력을 기록한다.
- 사용자가 수동 갱신을 요청한 경우 스케줄을 우회하는 인증된 수동 실행 경로를 사용한다.
- 예약 cron이 실행 이력/cooldown 조회를 실패로 끝내면 각 route는 worker 실행 전 503으로 종료해야 한다. KR/US daily-cache 및 Bollinger/Golden Cross, US daily indicators/open-cache/breakout/분봉 scanners, US OBV divergence, SEC small-cap share facts는 `stage: interval-gate`와 route별 `*_INTERVAL_CHECK_UNAVAILABLE` 오류를 반환한다. KR/US Golden Cross의 running lookup 실패는 `stage: running-gate`로 종료한다. Instrument Fundamentals의 backoff skip 조회 실패는 `stage: backoff-gate`, `INSTRUMENT_FUNDAMENTALS_BACKOFF_CHECK_UNAVAILABLE`을 반환한다. 이력 DB 장애를 “이력 없음”으로 취급하면 sequential worker 실행이나 재시도가 cooldown을 우회할 수 있으므로, 조회를 복구한 뒤 다음 cron cycle에서 재시도한다. 관리자 KR 수동 실행은 별도 API 경로이며 해당 예약 gate를 거치지 않는다. SEC Company Facts는 조회 예외를 route 상위 catch에서 503/500으로 전파하며 계속 fail-closed해야 한다.

### KR cron 호출이 KST 시간창 후반에 도달함

- 원인: OCI 공통 cron은 endpoint를 순차 실행한다. KR daily cache가 시장 RSS 이후 여러 SEC/DART enrichment 작업 뒤에 있으면 앞선 호출 지연이 국내 schedule window를 소모할 수 있다.
- 해결: `scripts/oci-cron.sh`에서 우선 SEC Facts, Discord retry, market RSS 및 US breaking-news forwarder를 보존한 뒤 KR daily cache를 실행하고, 나머지 DART/SEC enrichment 및 미국 full-universe cache보다 앞에 둔다. `scripts/check-oci-cron.mjs`가 이 순서를 검사한다.
- 재발 감지: `stockman-cron.service` journal의 앞선 endpoint duration과 KR call start를 대조하고, API 응답의 `schedule.evaluatedAtKst`/`outside_schedule`을 확인한다.

### 전체 갱신이 지나치게 오래 걸림

- 원인: 국내 유니버스 전체에 종목별 KIS 요청을 수행하기 때문이다.
- 해결: 동시성은 KIS 제한을 넘지 않도록 유지하고, 진행률·최근 코드·성공·실패·예상 잔여 시간을 확인한다.
- 중단 시 이미 저장된 성공 캔들은 보존하며, 실패 항목은 retry queue에서 재처리한다.

## DB 오류

### 재시도 큐의 현재 비대상 종목이 계속 PENDING으로 남음

- **원인**: retry consumer는 실행 시점의 공식 종목 master에서 현재 대상인 종목만 claim한다. 비활성·보통주 아님·공식 위험 플래그 또는 master 누락 종목은 `PENDING`으로 남을 수 있다. DB retention도 진행 중 항목 유실 방지를 위해 `PENDING` 행은 기간 만료로 삭제하지 않는다.
- **영향**: 처리할 수 없는 오래된 키가 pending count에 계속 포함될 수 있다. 자동 삭제나 재활성화는 사용자 확인 없이 수행하지 않는다.
- **진단**: 관리자 일봉 캐시 진단 API의 `retries.pendingEligibility`에서 분류·타임프레임별 수, 0회 시도 수, 가장 이른 다음 시도 시각과 가장 오래된 생성 시각을 확인한다. 시각은 UTC 원본과 KST 필드를 함께 제공한다. `US_METADATA_ELIGIBLE_NAME_CHECK`는 별도의 공식명 JS 필터를 반영하지 않은 그룹이다.
- **재발 감지/후속**: 분류별 count와 생성 경과를 정기 점검한다. 정책이 확정되면 별도 변경으로 PENDING 보존/종료 기준을 정하고, 보존 기간에 맞는 지표·감사 로그를 추가한다.

### 재시도 timeframe 간 claim 편중

- **원인/영향**: 여러 D/W/M lane을 선택해도 단일 `ORDER BY next_attempt_at LIMIT 500`은 due 행이 계속 많은 한 timeframe이 claim 상한을 점유해 다른 timeframe의 retry 처리를 지연시킬 수 있다.
- **해결**: `lib/kr-daily-cache-job.ts`는 claim할 retry timeframe만 `dueRetryTimeframes`로 전달한다. `lib/candle-cache-retry.ts`는 실제 due lane별 quota를 전체 상한 안에서 나누고, 각 lane에서 가장 오래된 due 행을 `FOR UPDATE SKIP LOCKED`로 claim한다. stale cache만 존재하고 retry row가 없는 timeframe은 retry quota를 차지하지 않는다. 나머지 quota는 lane 입력 순서에 따라 한 건씩 배분하며 최대 claim 수는 호출 상한을 넘지 않는다.
- **재발 감지/남은 위험**: KR job 결과의 timeframe별 retry 처리량과 `retries.pendingEligibility`의 age를 함께 확인한다. 각 실행의 lane 처리량은 공평해지지만 worker 실행량·시장 API 속도 차이로 backlog 해소 시각까지 같아지는 것은 아니다. 로컬 read-only EXPLAIN에서는 약 19,962 estimated rows/6 MB 테이블에 lane별 sequential scan이 계획됐다. 이 크기에서 별도 인덱스를 추가하지 않았으며 retry table이 커지거나 query latency가 증가하면 `EXPLAIN (ANALYZE, BUFFERS)`로 due index와 timeframe index 후보를 비교한다.

### `DATABASE_URL 환경변수가 설정되지 않았습니다.`

- 직접 실행 시 `.env.local`이 자동 로드되지 않을 수 있다.
- 개발 서버는 Next 환경 로딩을 사용하고, 직접 실행은 프로젝트 표준 환경 로딩 방식을 사용한다.
- DB 연결 호스트·포트·데이터베이스명은 로그에 비밀값 없이 확인한다.

### 테이블 또는 컬럼 없음

- 애플리케이션에서 임의 DDL을 실행하지 않는다.
- `npm run docs:check`와 스키마 상태를 확인하고, Flyway migration을 프로젝트 배포 절차에 따라 적용한다.

## 예약 작업 오류

### HTTP 메서드 불일치

- 예약 함수와 Next API가 같은 메서드와 공용 application service를 사용하는지 확인한다.
- 예약 계층에 비즈니스 로직을 복제하지 않는다.

### 중복 실행

- automation run 상태와 interval을 확인한다.
- 서버리스 인스턴스 간 중복 방지는 DB 잠금·실행 기록을 사용한다.

## 프론트엔드 오류

### 내부 요청 로그 수집 실패

- 요청 로그 수집은 관측용 best-effort 기능이므로 지역 추론 실패가 로그 저장을 중단시키지 않도록 한다.
- 요청 ID·경로·User-Agent·IP는 저장 전에 길이를 제한해 비정상적으로 큰 헤더나 본문으로 인한 로그 오염을 방지한다.
- DB 저장 실패는 구조화된 `REQUEST_LOG_UNAVAILABLE` 503으로 반환하고, 인증되지 않은 요청은 DB에 접근하기 전에 401로 종료한다.
- 내부 KIS 디버그 로그 API도 관리자 세션을 요구하며, 커서 값은 음수가 아닌 안전한 정수만 허용한다.
- 관리자 디버그 조회와 종목명 조회의 DB 오류는 예외·SQL을 노출하지 않고 기능별 503 오류 코드로 반환한다. 종목명 조회 코드는 최대 100개로 제한한다.
- 관리자 분봉 일괄 갱신의 작업량·동시성은 유한한 정수 범위로 정규화하고, 수집 실패는 `KR_MINUTE_REFRESH_FAILED`로 반환한다.
- 관리자 DB 조회는 `limit`을 1~100의 유한 정수로 정규화하고, 스키마·컬럼·행 조회 오류는 `DATABASE_READ_FAILED`로 반환한다.
- 웹 푸시 구독 API는 endpoint·암호화 키 길이와 boolean 설정값을 검증하고, malformed payload 및 저장 실패를 구분된 오류 코드로 반환한다.
- 공개 RSS·종목 뉴스 조회는 비정상 `limit`을 제한하고 DB 장애 시 내부 예외 대신 503 기능 오류 코드를 반환한다.
- 공개 해외 뉴스·추천 API는 내부 예외 메시지를 외부에 노출하지 않고 기능별 503 오류 코드로 반환한다.
- 공지 작성은 검증 오류만 400으로 반환하고 DB·예상 외 오류는 `NOTICE_CREATE_FAILED` 503으로 분리한다.
- 관리자 헬스체크 실패는 내부 예외 메시지 대신 `HEALTH_CHECK_UNAVAILABLE`로 반환하고 요청 ID만 추적 정보로 유지한다.
- Discord 서명 검증을 통과한 malformed JSON·payload도 파싱 예외로 500이 되지 않도록 `400 INVALID_JSON/INVALID_PAYLOAD`로 종료한다.
- Telegram webhook은 `TELEGRAM_WEBHOOK_SECRET`이 설정된 경우 `x-telegram-bot-api-secret-token`을 검증하고, malformed payload·처리 실패를 구조화된 오류로 반환한다.
- 공개 헬스 API는 상세 DB·환경·자동화 정보를 반환하지 않고 상태·시각·지연·요청 ID만 노출한다. 헬스 계산 자체가 예외가 되면 503 degraded로 응답한다.
- 세션 상태 조회는 DB 장애 시 인증되지 않은 것으로 조용히 오판하지 않고 `503 AUTH_STATUS_UNAVAILABLE`을 반환한다.
- 공개 스크리너와 관리자 기술 분석 API는 비정상 limit을 제한하고 내부 예외 대신 기능별 503 오류 코드를 반환한다.

### `startsWith` 또는 필드 접근 런타임 크래시

- 외부 API 필드는 `undefined`·`null`·예상 외 타입을 허용한다.
- 옵셔널 체이닝과 안전한 기본값을 사용하고, 누락 데이터를 Mock으로 바꾸지 않는다.

### 모바일 화면 우측 잘림

- 고정 폭·nowrap·grid 최소 폭을 확인한다.
- 좁은 화면에서는 flex 가로 스크롤 또는 행 분할 grid를 사용하고 페이지 전체 가로 overflow를 방지한다.

## 문서·인코딩

- 한글이 깨진 파일은 부분 패치보다 UTF-8 기준 전체 교체를 우선 검토한다.
- 오류 해결 후 원인·영향·수정 파일·검증 명령을 이 문서 또는 `AGENTS.md` 개선 로그에 기록한다.

### 관리자·cron 예외 메시지 외부 노출 방지

- **원인**: 일부 수동 테스트 및 캐시 갱신 라우트가 예외의 원문을 JSON 응답에 포함했다.
- **영향**: 내부 DB/API 오류 정보가 관리자 화면 또는 호출자에게 노출될 수 있었다.
- **해결**: 서버 로그에는 길이 제한된 메시지만 남기고, 응답에는 고정 오류 코드(`DAILY_MA9_TEST_FAILED`, `KR_DAILY_CACHE_FAILED`, `US_DAILY_CACHE_FAILED`)만 반환하도록 수정했다.
- **검증**: `npm run typecheck`, `npm run docs:check`, `npm test -- --run`.

같은 정책을 해외 일봉 breakout·indicator·open-cache 및 Bollinger·breaking-news·minute 지표 cron에도 적용했다.

### 국내 캔들 캐시가 0건으로 남는 유니버스 분리 오류

- **원인**: `V85__split_kr_instrument_universe.sql`이 `managed_issue_code <> 'Y'`를 사용해 NULL인 정상 보통주를 `kr_special_instrument_universe`로 분류했다. 이후 공통 유니버스에 없는 종목의 캔들이 정리되어 국내 캐시 작업의 대상 수가 0건이 됐다.
- **영향**: 전체 `kr_instrument_universe` 뷰의 종목 수는 정상처럼 보였지만, 실제 캐시 작업이 참조하는 `kr_common_stock_universe`가 비어 국내 일·주·월봉이 재수집되지 않았다.
- **해결**: `V118__repair_kr_common_stock_split.sql`에서 `COALESCE(managed_issue_code, '') <> 'Y'`를 적용해 정상 보통주를 공통 유니버스로 복구하고, 중복·재실행을 안전하게 처리한다.
- **재발 방지**: 분리·분류 SQL의 NULL 비교를 반드시 `COALESCE` 또는 명시적 NULL 정책으로 작성하고, 배포 후 `kr_common_stock_universe` 대상 수·국내 캔들 수·캐시 작업의 `instrumentCount`와 `dailySuccessCount`를 함께 검증한다.
- **검증**: `V118` 로컬 트랜잭션 롤백 드라이런, `npm run typecheck`, `npm run docs:check`, `npm run build`.

### 국내 캔들 복구 중 주·월봉 요청으로 인한 일봉 복구 지연

- **원인**: 콜드 상태에서 종목별 일·주·월봉을 한 작업에서 순차 호출해, 일봉이 저장되기 전에 주·월봉 요청이 누적됐다.
- **영향**: 국내 스캐너가 사용하는 일봉 캐시가 장시간 0건으로 남고, cron의 중복 실행 방지로 후속 작업도 건너뛰었다.
- **해결**: `lib/kr-daily-cache-job.ts`에서 일봉이 stale이면 일봉만 우선 처리하고, 주·월봉은 다음 실행으로 이연한다.
- **검증**: `npm test -- --run` (141개 파일·464개 테스트), `npm run typecheck`, `npm run build`.

푸시 구독 저장·설정 변경도 입력 오류(400)와 저장소 장애(503)를 분리하고 서버 로그를 추가했다.

## 검증 명령

### 의존성 감사

- 2026-10-16 기준 `npm audit --omit=dev`는 0 vulnerabilities다. PostCSS를 8.5.23 이상으로 override하고 fast-xml-parser를 5.x로 전환해 운영 의존성 이슈를 해결했다. RSS 파서 관련 기존 단위 테스트를 통과시킨 뒤 전체 배포 검증으로 호환성을 확인한다.
- 전체 `npm audit`에는 Drizzle Kit 개발 의존성 체인의 esbuild 중간 위험 4건이 남아 있다. npm이 제시한 자동 수정은 Drizzle Kit 0.18.1로의 하향 메이저 변경이어서 적용하지 않았다. Drizzle Kit 버전 체인을 별도 호환성 테스트와 함께 후속 검토한다.
- Next 15 자체를 16으로 강제 업그레이드하지 않고, 영향받는 PostCSS 하위 의존성만 패치 버전으로 교체한다. 이를 변경할 때는 lockfile 재현 설치, 전체 테스트, standalone 실행 스모크를 필수로 한다.

```powershell
npm run typecheck
npm run docs:check
npm test -- --run
```
# 2026-09-18 운영 메인 페이지의 구버전 청크 참조

- **증상**: 운영 홈 HTML은 200이지만 `/_next/static/chunks/app/page-*.js`가 404여서 브라우저에 `ChunkLoadError`가 발생했다.
- **근본 원인**: standalone 패키지에 정적 자산이 누락된 상태에서, 홈 페이지가 장기 프리렌더 캐시(`x-nextjs-cache: HIT`, `s-maxage`)로 이전 HTML을 계속 제공해 현재 릴리스에 없는 해시 청크를 참조했다.
- **해결**: 배포 패키지에 `.next/static`을 포함하고, 홈 페이지를 `dynamic = "force-dynamic"`으로 전환해 릴리스 이후 현재 청크를 참조하는 HTML을 생성한다. 클라이언트에는 기존 청크 오류 1회 자동 복구를 유지한다.
- **추가 보강**: 운영 standalone 런타임의 정적 경로 차이에 대비해 동일한 해시 자산을 `public/_next/static`에도 패키징하고, 이전 릴리스 자산 보존도 두 경로에 적용한다.
- **검증기 보강**: 배포 전 standalone smoke에서도 정적 대상 디렉터리를 먼저 제거한 뒤 두 경로에 복사해 `static/static` 중첩을 방지한다. 이 단계에서 실제 webpack 청크 HTTP 응답까지 확인한다.
- **재발 방지**: 배포 검증에서 standalone 정적 청크 존재와 런타임 smoke를 확인하고, 운영 검증에서 홈 HTML의 참조 청크를 직접 GET해 200 및 JavaScript 응답을 확인한다.
- **남은 위험**: 외부 CDN이 HTML을 별도 캐시하는 경우 CDN purge 또는 `no-store` 정책이 필요하다.

# 2026-09-18 해외 상승률 TOP100 CPOP 누락

- **증상**: 운영 차트용 TOP100 메모리 목록에 NAS 종목 `CPOP`이 누락됐다.
- **근본 원인**: KIS가 `VOL_RANG=5` 조건에서 HTTP 200/정상 코드와 함께 6개 행만 반환했지만, 수집기는 행이 0개일 때만 `VOL_RANG=0` 재시도했다. 따라서 정상 응답으로 오인한 부분 페이지가 TOP100 전체를 대체했다.
- **확인**: 동일 운영 API에서 `VOL_RANG=0`으로 조회하면 100개 행과 rank 4의 CPOP이 반환됐다. DB 공식 보통주 마스터(`NAS/CPOP`, `COMMON_STOCK`, enabled/daily_active)와 시총 스냅샷도 정상이다.
- **해결**: 거래소 TOP100 수집은 부분 응답(100개 미만)도 불완전 응답으로 판단해 `VOL_RANG=0` 전체 페이지를 비교하고 더 많은 행을 선택한다. 공개 원본 순위 API의 기본값도 전체 페이지 요청으로 고정했다.
- **재발 방지**: 부분 응답 선택 로직에 회귀 테스트를 추가하고, 운영 디버깅 시 거래소별 `sourceCount`, `selectedCount`, `productExcluded`를 함께 확인한다.
- **남은 위험**: KIS가 전체 페이지 자체를 제공하지 않는 장외/장애 상황에서는 해당 시점의 실시간 TOP100을 보장할 수 없으며, 마지막 정상 스냅샷 정책을 별도로 유지한다.
- **집중 탐색 불변조건**: focus pool은 원본 TOP100이 아니라 상품·활성·시총 필터를 모두 통과한 최종 보통주 후보에서만 구성한다. 이 조건은 응답 `criteria.focusPool.eligibleUniverse`로 노출하고 설계 문서와 회귀 검증에서 함께 관리한다.
- **공식 보통주 교차검증**: 라이브 KIS 순위 행은 `us_common_stock_universe`의 `enabled`, `daily_active`, `COMMON_STOCK`, ETF·워런트·파생·DR·레버리지·인버스 제외 조건을 모두 통과해야만 탐지된다. 마스터 조회 실패는 빈 후보로 처리한다.
- **교차검증 성능**: 공식 판정은 프로세스 메모리 1시간 TTL 캐시를 사용하고 캐시 미스만 배치 조회한다. 캐시 상태와 적중·미스 수는 `criteria.officialEligibility.cacheHits/cacheMisses`로 관측한다.
- **운영 탐지 상태 해석**: `/api/kis/intraday-mvp`에서 `worker.status=STOPPED`, `status.reason=DISABLED`이면 계산 오류가 아니라 관리자 기능 설정으로 탐지가 중지된 상태다. 이 경우 TOP100 후보 수는 표시하되 거래대금 비율·알림 결과를 정상 동작으로 간주하지 않는다.
- **시총 대비 거래대금 무자료 상태**: `qualifiedCandidateCount=0`이고 후보의 거래대금·시총 비율이 0이면 최근 1분 샘플이 아직 누적되지 않았거나 워커가 비활성인 상태다. 운영 검증은 `worker.lastTickAt`, `trackedCandidateCount`, `requiredSamples`, `minTurnoverToMarketCapPercent`를 함께 확인한다.
# 2026-10-15 운영 health API 지연 조사

- **증상**: 운영 `/api/health`가 반복해서 클라이언트 제한 시간(20초) 안에 응답하지 않았지만 `/charts`는 HTTP 200이었다.
- **근본 원인**: 공개 health 라우트가 상세 운영 스냅샷 전체를 기다렸다. 스키마 점검과 전체 자동화 이력 조회 외에, 캐시 자동화 최근 실행·마지막 성공 조회 및 세 기능 설정 조회가 이어지는 단계로 실행되어 독립 DB 왕복 지연이 합산될 수 있었다.
- **해결**: 캐시 자동화 최근 실행·마지막 성공 조회와 세 기능 설정 조회를 하나의 `Promise.all` 경계에서 시작한다. 응답 필드와 상세 스키마 판정은 유지한다.
- **재발 자동 감지**: `lib/health-check-query-concurrency.test.ts`는 캐시 자동화 두 DB 조회와 기능 설정 조회가 모두 동시에 시작되는지 검증한다.
- **검증**: 회귀 테스트, 전체 배포 검증, 로컬 `/api/health` 실행 및 배포 후 운영 응답시간을 확인한다. HTTP 503 `degraded`는 빠른 응답과 별개의 readiness 문제로 분류한다.
- **남은 위험**: 이 수정은 상세 스냅샷 내부의 독립 DB 왕복 합산만 제거한다. DB 연결 대기 또는 스키마 확인 자체가 느린 문제까지 해결한다고 보장하지 않는다.

## 2026-10-15 standalone 배포 smoke 프로세스 정리

- **증상**: 배포 검증의 `/charts` smoke 요청이 제한 시간 초과로 실패했지만, 동일 standalone 서버를 직접 기동한 뒤에는 `/charts`가 HTTP 200으로 응답했다.
- **근본 원인**: Windows 검증 경로가 standalone Node 서버를 `cmd.exe` 하위 프로세스로 실행해 timeout cleanup 대상이 실제 서버 프로세스가 아닌 짧게 유지되는 command wrapper가 될 수 있었다. 실패 뒤에도 검증 서버 프로세스가 남는 것을 확인했다.
- **해결**: `scripts/verify-deploy.mjs`에서 standalone 서버를 `process.execPath`로 직접 기동해 실제 Node 프로세스를 정리 대상으로 지정한다. 제한된 로컬 Windows 환경에서 첫 요청이 5초를 넘는 경우가 확인되어 smoke 개별 요청 제한을 기본 15초로 늘리고 환경변수로 조정 가능하게 한다. endpoint와 응답 조건은 유지한다.
- **재발 자동 감지**: 전체 `deploy:verify`가 standalone `/charts` 및 API smoke를 계속 수행한다. 검증 후 `server.js` 프로세스 잔존 여부도 확인한다.
- **검증**: 독립 기동 시 `/charts` HTTP 200을 확인했다. 직접 실행·프로세스 종료 처리와 15초 요청 제한은 전체 배포 검증으로 확인한다.
- **남은 위험**: Windows 프로세스 정리는 운영체제 프로세스 상태에 의존한다. CI smoke가 실패하면 해당 build의 standalone server 프로세스가 남았는지 우선 확인한다.

## 2026-10-15 운영 health 지연 후속 조사

- **관측**: 배포 workflow는 성공했고 `/charts`는 HTTP 200이었다. 운영 `/api/health`는 40초, 관리자 `/api/debug/health`는 45초 제한 안에 응답하지 않았다. 단순 관리자 DB 목록 조회는 HTTP 200/약 0.8초, `automation_runs` 1행 조회는 HTTP 200/약 1초였다.
- **환경 구분**: 로컬 `.env.local`의 DB는 localhost:5433이며 각 health 관련 SQL은 약 80–110ms였다. 이는 운영 DB와 다른 연결이므로 운영 SQL 성능의 근거로 사용하지 않는다.
- **초기 판단**: 운영 DB 연결 자체가 완전히 불가능한 상태는 아니지만, 기존 진단 API는 전체 스냅샷을 기다려 어느 SQL 단계가 지연되는지 분리할 수 없었다. 후속 단계별 진단 결과와 원인 확정은 아래 automation_runs 조사 항목을 기준으로 한다.
- **개선**: 관리자 전용 `/api/admin/health-diagnostics`를 추가한다. 동일 health 관련 SELECT들을 단계별로 실행하고 각 단계의 소요 시간·행 수·오류 코드와 DB pool 점유량만 반환한다. SQL 상세·행 데이터·환경변수 값은 노출하지 않는다. 단일 연결의 read-only transaction과 쿼리별 1.5초 `statement_timeout`을 사용해 느린 쿼리 하나가 전체 진단을 무기한 막지 않게 한다.
- **2026-11-11 현재 응답 계약**: schema probe는 실패 원인 분류 코드와 함께 whitelist된 relation/column 이름을 최대 50개까지 반환하며, 성공한 Flyway probe는 version 문자열을 반환한다. Automation history의 `error_message`와 `summary`, 임의 SQL, 환경변수·credential 값은 응답하지 않는다. `detailsTruncated`는 whitelist 행이 50개를 넘을 때 표시한다.
- **필수 relation 유형 판정**: `OPERATIONAL_SCHEMA_TABLES`는 `BASE TABLE`, `OPERATIONAL_SCHEMA_VIEWS`는 `VIEW`로 검사한다. `kr_instrument_universe`와 `us_instrument_universe`는 V85/V89 이후 legacy read path를 위한 compatibility view다. 핵심 schema health, 관리자 diagnostics, market-debug inventory와 migration audit은 명시한 relation 유형을 확인한다. retired relation 검사는 retired 이름의 객체가 어떤 relation type으로든 남아 있으면 계속 실패한다. [PostgreSQL 16 information_schema.tables 공식 문서](https://www.postgresql.org/docs/16/infoschema-tables.html).
- **필수 컬럼 판정**: `information_schema.columns`도 table columns와 view columns를 모두 포함한다. 필수 컬럼 목록은 같은 schema의 필수 `BASE TABLE`에 있는 컬럼만 인정한다. 핵심 schema health와 관리자 diagnostics 모두 relation type을 확인한다. [PostgreSQL 16 information_schema.columns 공식 문서](https://www.postgresql.org/docs/16/infoschema-columns.html).
- **timeout/savepoint 확인**: route는 read-only transaction 시작 직후 `set_config('statement_timeout', '1500ms', true)`를 실행하고 그 다음 각 probe의 savepoint를 만든다. `is_local=true` 설정은 transaction 종료까지 적용되며, 그보다 나중에 만든 savepoint로 rollback해도 설정은 취소되지 않는다. PostgreSQL은 `statement_timeout`을 각 statement 실행 한도로 정의한다. [PostgreSQL 16 set_config 공식 문서](https://www.postgresql.org/docs/16/functions-admin.html), [SET/savepoint 공식 문서](https://www.postgresql.org/docs/16/sql-set.html), [statement_timeout 공식 문서](https://www.postgresql.org/docs/16/runtime-config-client.html).
- **재발 감지**: API 테스트가 비관리자 요청의 DB 접근 차단, read-only transaction, 쿼리 타임아웃 오류 코드의 안전한 노출, 후속 probe 진행을 확인한다. 운영에서는 `probes[].name`, `durationMs`, `errorCode`, `pool.waiting`으로 병목 구간을 판별한다.
- **남은 위험**: pool 연결 획득 자체가 밀리면 진단은 3초 후 pool 상태와 함께 실패할 수 있다. 본 API 결과가 확인되기 전까지 운영 health 지연의 근본 원인은 미확정으로 유지한다.

## 2026-10-15 automation_runs health 조회 병목 완화

- **운영 근거**: `/api/admin/health-diagnostics`에서 연결·테이블·컬럼·Flyway probe는 1–184ms, 캐시 설정 조회는 21ms였으나 세 개의 `DISTINCT ON (module_key) ... ORDER BY module_key, started_at DESC` 이력 조회는 모두 쿼리 타임아웃 코드 `57014`로 끝났다. 따라서 DB 연결이나 전체 스냅샷의 모든 쿼리가 느린 것이 아니라, 자동화 이력의 모듈별 최신 행 조회 형태가 병목임을 확인했다.
- **개선**: 전체 이력을 정렬·중복 제거하지 않고 등록된 모듈 키 각각에 대해 `LEFT JOIN LATERAL` 내부에서 `ORDER BY started_at DESC LIMIT 1`을 조회한다. 캐시 최신 실행과 마지막 성공도 같은 방식으로 바꾸고, 세 이력 조회 및 설정 로딩을 함께 시작한다. 기존 `(module_key, started_at DESC)` 인덱스를 활용하는 point lookup 형태다.
- **재발 자동 감지**: 회귀 테스트는 health snapshot의 세 이력 SQL이 모두 `LATERAL`과 `LIMIT 1`을 쓰고 이전 `DISTINCT ON` 방식으로 돌아가지 않는지 확인한다. 배포 후 `/api/admin/health-diagnostics`에서 세 probe가 각각 1.5초 안에 끝나는지 확인한다.
- **후속 운영 검증**: commit `29183d6e` / Deploy OCI run `38700748463` 성공 후 전체 automation probe는 51ms로 개선됐으나, cache 최신 실행과 마지막 성공 probe는 다시 1.5초 제한에 걸렸다. 기존 복합 인덱스가 있어도 status 필터를 만족하는 행을 찾기 위해 오래된 인덱스 엔트리를 계속 훑을 수 있음을 확인했다.
- **추가 개선 및 운영 확인**: V149의 `status <> 'SKIPPED'` 및 `status = 'SUCCESS'` 조건별 부분 인덱스를 적용했다. 마지막 성공 조회 인덱스에는 `finished_at`을 INCLUDE했다. 운영 Flyway version 149를 확인했다.
- **재발 자동 감지**: 회귀 테스트는 health snapshot의 세 이력 SQL이 모두 `LATERAL`과 `LIMIT 1`을 쓰고 이전 `DISTINCT ON` 방식으로 돌아가지 않는지 확인한다. 배포 후 `/api/admin/health-diagnostics`에서 세 probe를 각각 확인하고, cache 두 probe의 timeout 재발 여부를 기록한다.
- **운영 성과**: 적용 전 cache 최신 조회 1503ms/57014 및 마지막 성공 1510ms/57014에서 적용 후 각각 22ms와 11ms로 개선됐다. 전체 진단은 355ms, 공개 `/api/health`는 HTTP 200/status `ok`였다.
- **남은 위험과 감지**: 데이터량·상태분포가 변하면 실행시간도 달라질 수 있다. 관리자 health 진단에서 cache probe별 시간과 57014를 지속 확인하고, 정기 관측 경보 개선을 후속 과제로 남긴다.

## 2026-10-15 health 이력 부분 실패 표시

- **문제**: automation 최신 이력·cache 최신 이력·cache 성공 이력을 단일 `Promise.all`과 바깥 `try/catch`로 처리해, 쿼리 하나만 실패해도 이미 성공한 다른 결과를 버렸다. 페이지는 이 상황을 `실행 이력 없음`으로 렌더해 실제 이력이 없는 상황과 DB 조회 실패를 구분하지 못했다.
- **해결**: 각 history query를 독립적으로 안전 실행하고 가용성을 별도 반환한다. 성공한 결과는 보존하고 실패 데이터는 `historyAvailable` 상태로 표시해 UI에서 `이력 조회 실패`로 구분한다.
- **재발 방지**: 실패 주입 회귀 테스트가 automation query 실패와 마지막 성공 query 실패를 각각 재현하고 나머지 결과 보존을 확인한다. `/api/health` 공개 응답 계약은 history 가용성에 좌우되지 않게 유지한다.
- **남은 위험**: DB 장애가 아닌 일시 query 지연도 이력 조회 실패로 표현되지만 SQL/DB 오류 상세는 공개 화면에 노출하지 않는다. 운영 진단 API와 함께 원인을 판별한다.


## 2026-10-24 운영 미국 차트 API 거래소 파라미터 오진

- **증상**: 누락 미국 종목의 운영 `/api/stock/chart` 표본 조회가 503을 반환해 운영 서버에 차트 데이터가 없다고 판단했다.
- **근본 원인**: 라우트 계약은 `market=US&exchange=AMS|NAS|NYS`인데, 첫 요청에서 거래소 코드를 `market` 파라미터에 넣었다. 라우트는 이를 US로 인식하지 못해 다른 시장 경로로 처리했고, 이 503을 유효한 미국 차트 조회 실패로 해석했다.
- **해결**: 올바른 파라미터로 재조회했다. 목표일 봉 누락 53개 중 31개는 활성 COMMON_STOCK 차트 봉 4,229건을 반환해 로컬에 저장했고, 22개는 세 거래소에서 활성 공통주 마스터를 확인하지 못해 fail-closed로 미저장했다. 운영 마스터와 로컬 마스터의 KHC 거래소 매핑도 NYS/NAS 불일치로 드러났다.
- **재발 감지**: 미국 차트 API smoke는 알려진 US ticker에 `market=US`와 `exchange`를 분리해 보내고, HTTP 상태와 응답의 `eligibility`/`chartStatus`를 확인한다. 파라미터 오류(400/422), 활성 마스터 미확인, 실제 데이터 없음(503)을 구분한다.
- **남은 위험**: 로컬 및 운영 종목 마스터가 거래소·활성 상태에서 어긋날 수 있다. 완전한 전 종목 동기화 전 운영 마스터와 로컬 마스터의 정식 동기화가 필요하다.


# 2026-11-01 공시일·법적 효력일 혼동 및 발행주식수/운영 시총 불일치

- **증상**: SHFS 1:12 역분할의 기존 복구 이벤트가 SEC 보고/증서일 2026-09-29를 법적 효력일처럼 표시하고, 효력시각을 9/29 00:01 EDT로 잘못 기록했다. 같은 종목의 운영 market-intelligence 응답은 listed_shares 1,027,746과 시총 $80,164를 반환했지만 SEC 10/30 8-K는 issued and outstanding 85,512,985주를 보고했다.
- **근본 원인**: 복구 메모가 원문 Exhibit를 직접 대조하지 않고 보고서 날짜와 행사 효력 날짜를 하나의 eventDate로 취급했다. 시장 master의 listed_shares와 SEC가 보고한 발행·유통주식수의 기준·갱신시각을 교차 확인하지 않고 시총 snapshot을 확정값으로 간주할 위험이 있었다.
- **수정**: SEC 8-K와 Certificate of Amendment에 따라 split eventDate를 2026-09-30으로 고치고 효력시각 00:01 EDT/13:01 KST를 기록했다. 발행·유통주식수 전후 절대값과 조정 거래 개시시각은 미공개로 남겼다. 운영 API 값과 SEC issued-and-outstanding 값을 별도 필드로 보존하고 약 83.2배 차이 및 혼합원천 단순 시총 산술치를 데이터 품질 한계로 표시했다.
- **재발 자동 감지**: 역분할/병합 이벤트는 공시 접수일, 주주승인일, 법적 효력일, split-adjusted 거래 시작일을 별도 확인한다. 법적 효력시각이 00:01 현지시간이면 SEC 원문 시각대를 근거로 날짜를 먼저 확정하고 KST 변환을 별도 계산한다. 시총 검토에서는 운영 master의 share count와 최신 SEC issued/outstanding 값을 비교하되 float로 혼동하지 않고, 기준일·가격 원천이 다르면 파생값을 official market cap으로 기록하지 않는다.
- **검증/남은 위험**: SEC 8-K 045183, Exhibit 3.1, 047774, 048425 및 048426/048427 원문을 재대조했다. 데이터 parity validator, UTF-8/JSON strict parse와 diff check 결과를 본 작업 로그에 기록한다. 운영 API의 listed_shares가 왜 SEC 발행주식수와 다른지는 확인되지 않았다. 후속 XXII 검사에서도 운영 713,994주와 SEC 10/23 outstanding 19,202,198주가 26.9배 차이로 관찰됐다. FGL 재검토에서는 Nasdaq 결정서 날짜(10/19), 회사 확인 기준일(10/9), 발표/SEC 접수일(10/23)을 분리해 이벤트 날짜와 제출 날짜를 혼동하지 않도록 했다. 최신 공급자 상장주식수 정의/갱신은 후속 운영 데이터 검토가 필요하다.
## 2026-11-10 RSS 조회 정렬 인덱스 부재와 로컬 실측 범위

- **증상**: `/api/market-news`는 기본 1시간, 최대 24시간의 기사 조회를 매번 수행하며 결과를 발행 시각 내림차순으로 정렬한다. RSS 테이블이 커질수록 해당 GET이 많은 행을 읽고 정렬할 수 있다.
- **근본 원인**: `market_rss_articles`에는 알림 처리용 인덱스와 `(source, external_id)` 유니크 인덱스만 있고 `published_at DESC NULLS LAST, id DESC` 목록 정렬을 지원하는 인덱스가 없었다.
- **영향 범위**: 공개 `/api/market-news`의 최근 목록 조회. 같은 기사 테이블을 조회하는 disclosures 경로도 이 인덱스를 사용할 수 있다. 기사 DTO·기간·페이지 커서 동작은 변경하지 않는다.
- **해결 위치**: V168에서 전체 및 출처별 발행시각 정렬 인덱스를 `CREATE INDEX CONCURRENTLY`로 추가하고 Drizzle schema 정의를 동기화한다. 동일 migration은 `/api/bullish-rss` projection 목록의 정렬 인덱스도 포함한다.
- **재발 자동 감지**: market-news/disclosures 쿼리의 `where/orderBy`와 schema·migration 인덱스 키를 함께 대조한다. 적용 뒤 실제 대표 source/ticker 조건에서 `EXPLAIN (ANALYZE, BUFFERS)` 및 요청 latency를 확인한다.
- **로컬 검증**: 사용자가 지정한 5432 포트에서 `stockman-postgres-local`을 기동했다. 기존 named volume을 보존하고 compose의 host port를 5432로 맞췄다. 로컬 Flyway 이력은 161, source migration은 168이며 64개가 pending이고 schema drift도 확인됐다. 로컬에는 `market_rss_articles` 552행(최신 published_at 2026-09-04), `market_rss_bullish_articles` 테이블은 없다. 전체 migration은 실행하지 않고 `market_rss_articles`의 V168 두 인덱스만 concurrent로 생성했다.
- **측정 결과**: 데이터가 있는 2026-09-03~04 구간의 101건 쿼리는 인덱스 전 0.54ms, 인덱스 생성 뒤 1.08ms였고 두 실행 모두 작은 테이블에 대한 Seq Scan + top-N sort를 선택했다. 현재 24시간 구간에는 일치 행이 없어 `/api/market-news?hours=24&pageSize=100` 로컬 개발 응답 20회가 HTTP 200/0건, p50 206.9ms/p95 367.3ms였다. 첫 compile/cold 요청은 측정치에서 제외했다. 이 작은·오래된 로컬 데이터는 인덱스 이득을 증명하지 못하며 production latency의 근거가 아니다.
- **남은 위험/다음 확인**: V168 Flyway migration 전체와 bullish 인덱스는 로컬 schema drift 때문에 적용하지 않았다. 실제 대량 테이블에서 source별 `EXPLAIN (ANALYZE, BUFFERS)` 및 운영 API p50/p95를 확인해야 인덱스 효과를 확정할 수 있다. 운영 DB에는 연결하지 않았다.

## 2026-11-10 RSS 기사 7일 보존기간 미적용

- **증상**: 운영 자동 정리 API가 RSS fetch snapshot만 180일 뒤 삭제하고 `market_rss_articles` 기사 행은 정리하지 않았다. 기존 정적 게이트도 기사 삭제를 금지했다.
- **근본 원인**: 과거 정책에서 기사별 본문을 장기 보존하도록 정리 route와 회귀 게이트가 설계됐다. 새 요구사항은 RSS 기사와 호재 projection의 7일 보존을 명시한다.
- **영향 범위**: 일반 RSS 기사 및 분리 저장된 bullish RSS projection. RSS 원본 fetch snapshot(180일), SEC/DART 공시, 사용자 생성 데이터의 보존 정책은 변경하지 않는다. 발행시각이 없는 RSS 행은 `created_at`으로 만료를 계산한다. linked bullish projection을 parent보다 먼저 정리하고 FK cascade는 동시성 안전망으로 유지한다.
- **해결 위치**: `/api/cron/db-retention`에서 두 테이블을 5,000행 단위 최대 3회씩 삭제하고 `V169`에 null 발행시각 행 검색용 concurrent partial index를 추가한다. 연결된 bullish projection을 parent RSS보다 먼저 만료 parent 관계까지 포함해 직접 정리하고, 독립 입력 projection도 별도 cleanup 대상으로 둔다. 기존 OCI cron에서 retention API를 매 주기 호출한다. `scripts/check-oci-cron.mjs`가 두 7일 정책과 migration 설정을 점검한다.
- **남은 위험/다음 확인 (2026-11-10 기록 시점)**: 당시 로컬 schema는 Flyway 161이고 `market_rss_bullish_articles`가 누락돼 전체 cleanup 실행을 검증할 수 없었다. 이때 적용한 정책은 이후 2026-11-15 기록에서 72시간으로 단축됐다. RSS fetch snapshot은 계속 별도 180일 정책을 사용한다.

## 2026-11-15 RSS 보존 기간 72시간 단축 및 목록 응답 경량화

- **요구사항/영향 범위**: 자동 정리 대상인 `market_rss_articles`와 `market_rss_bullish_articles`를 7일 대신 72시간 이후 삭제한다. RSS fetch snapshots 및 다른 테이블 보존 기간은 변경하지 않는다.
- **변경 위치**: `/api/cron/db-retention`의 두 RSS expiry predicate를 72시간으로 맞췄다. 조회 API는 목록 요청에서 작은 화면용 컬럼만 선택하고 상세 요청에서만 단일 행의 큰 원문/번역 컬럼을 읽는다.
- **인덱스 점검/개선**: 기존 V168 `published_at` 및 `(source, published_at)` 목록 인덱스는 날짜/source 조회를 지원하고, V169 partial `created_at` 인덱스는 `published_at IS NULL` 정리를 지원한다. V173은 `published_at IS NOT NULL` 영역의 `(published_at, created_at)` partial index 두 개를 concurrent 생성하여 72시간 retention scan의 날짜 조건과 만료 순서를 지원한다. 기존 bullish `source_article_id` unique index는 부모 기사 연결 정리를 지원한다.
- **자동 감지**: OCI cron checker는 RSS 두 테이블의 `published_at`/fallback `created_at` 기준이 72시간인지 검사하고, V173의 concurrent index·Flyway transaction 설정·배포 archive 포함을 확인한다.
- **검증/남은 위험**: `npm.cmd run typecheck`, StockTitan route 13개 회귀, `node scripts/check-oci-cron.mjs`, 전체 `npm.cmd run cron:check`, `npm.cmd run docs:check` 통과. benchmark script는 localhost DB에서 전체 select와 목록 projection의 p50/p95·JSON bytes·EXPLAIN BUFFERS를 비교한다. PostgreSQL 문서상 `EXPLAIN ANALYZE`는 쿼리를 실제 실행하고 버퍼 I/O도 보여 주므로 대표 데이터에서 계획과 버퍼를 비교해야 한다. 벤치마크 실행은 `::1:5432`와 `127.0.0.1:5432` 모두 ECONNREFUSED였고 Docker Desktop 서비스도 OS 권한으로 시작되지 않아 수치 측정과 V173 적용은 미완료다. 운영 DB에는 접속하지 않았다. [PostgreSQL EXPLAIN 문서](https://www.postgresql.org/docs/16/using-explain.html), [B-tree 정렬/인덱스 문서](https://www.postgresql.org/docs/16/indexes-ordering.html). commit/push/deploy 없음.

## 2026-11-11 JS 달력 검증의 연도 0001~0099 처리

- **원인**: `Date.UTC(year, month, day)`는 연도가 0~99이면 1900~1999년으로 보정한다. ISO 연도를 그대로 넣는 왕복 검증은 이 범위의 실제 유효 날짜를 거부할 수 있다.
- **영향**: 일봉 수집 파서, 캐시 저장·조회, 공개 API 및 운영 스크립트의 날짜 판정이 달라질 수 있었다.
- **해결 위치**: `lib/calendar-date-quality.mjs`의 ISO·YYYYMMDD 검증기를 관련 일봉 처리 경로에서 공통 사용한다. 연도 0000은 제외하고 실제 달력 날짜를 검증한다.
- **재발 자동 감지**: `lib/calendar-date-quality.test.mjs`에서 0001년 및 윤년 0096년 허용, 0000년·0099년 비윤일·불가능 날짜 거부를 검증한다. 관련 Vitest suite와 타입 검사를 수행한다.
- **남은 위험**: 관련 일봉·시장 경로만 검색·검증했으며 다른 도메인의 별도 날짜 해석 규칙은 범위 밖이다.

## 2026-11-11 일봉 활성 상태의 손상 요약 데이터 의존

- **원인**: `syncDailyActivityStatus()`가 시장 최신일과 종목별 최근 일자를 latest summary의 `volume > 0` 조건으로만 골랐다.
- **영향**: 잘못된 OHLCV 또는 불가능 날짜가 든 summary가 일봉 유니버스 `daily_active` 상태 계산을 오염시킬 수 있었다.
- **해결 위치**: `lib/daily-activity-status.ts`의 시장 및 종목 데이터 CTE 모두 `validDailyCandleSql()`을 적용한다.
- **재발 자동 감지**: `lib/candle-sql-quality.test.ts`가 predicate의 날짜/OHLCV 조건을 고정한다. 이 작업에서는 추가 활성상태 mock 테스트 없이 기존 SQL predicate suite와 TypeScript 검사를 수행했다.
- **재발 자동 감지**: `lib/daily-activity-status.test.ts`가 시장별 SQL predicate 적용, 요청 시장 범위, DB 오류 전파 및 오류 후 재시도를 확인한다.
- **남은 위험**: 상태 동기화의 데이터베이스 통합 동작은 이번에 실행하지 않았다.
- **추가 캐시 격리**: pool override를 허용하는 테스트/진단 호출도 기존 production TTL 및 in-flight cache를 공유했다. override 사용 시 캐시를 우회하고, 일일 상태 테스트에서 오류 응답 이후의 병렬 query 결과도 명시적으로 검증한다.
- **추가 유니버스 경계 결함**: 시장 최신일은 전체 summary에서 집계됐고 상태 갱신 대상도 enabled/common-stock 및 공식 제외 플래그로 제한되지 않았다. 비대상 상품의 날짜가 시장 기준일에 섞이거나 그 상품의 `daily_active`까지 바뀔 수 있었다. 활성 COMMON_STOCK 유니버스를 먼저 구성해 최신일·봉 판정·UPDATE에 공통 적용하고 `lib/daily-activity-status.test.ts`에 KR/US master 필터 회귀 검사를 추가했다.

## 2026-11-11 관리자 일봉 cache debug freshness 집계

- **원인**: 관리자 진단 route가 US latest summary와 KR 일봉 raw table의 전체 집계를 품질 조건 없이 계산했다.
- **영향**: invalid row의 거래일·갱신일시가 freshness 수치를 앞당기거나 row count에 포함될 수 있었다.
- **해결 위치**: `app/api/admin/daily-candle-cache-debug/route.ts`의 두 집계에 `validDailyCandleSql()`을 적용한다.
- **재발 자동 감지**: `app/api/admin/daily-candle-cache-debug/route.test.ts`가 두 쿼리 모두 달력/OHLC predicate를 포함하는지 확인한다.
- **남은 위험**: route 테스트는 SQL 생성 여부를 확인하며, 운영 DB 결과값은 조회하지 않았다.
- **추가 진단 집계**: `app/api/admin/screener-debug/route.ts`의 일봉 count도 invalid row를 포함하고 zero-volume 정상 row를 제외했다. 공통 candle predicate로 바꾸고 route 테스트가 그 조건과 volume threshold 부재를 확인한다.

## 2026-11-11 정상 거래량 0 봉과 freshness 요약 기준 불일치

- **원인**: daily summary 재구축과 KR 주봉·월봉 stale 판정이 유효 OHLCV 조건에 더해 `volume > 0`까지 요구했다.
- **영향**: 정상적인 거래량 0 봉이 최신일이면 요약 캐시 날짜가 그보다 오래된 거래일에 머물 수 있다. 거래량 0 봉을 보존한다는 기존 데이터 정책과 freshness 판단이 불일치했다.
- **해결 위치**: `scripts/daily-candle-summary-sync.mjs`, `lib/kr-daily-price-cache.ts`, `lib/us-daily-price-cache.ts`, `lib/kr-daily-cache-job.ts`에서 freshness/summary는 유효 OHLCV를 기준으로 최신 봉을 선택한다. 별도의 signal volume threshold는 유지한다.
- **재발 자동 감지**: `scripts/daily-candle-summary-sync.test.mjs`가 0-volume 최신 봉이 summary 날짜와 값으로 저장되는 것을 확인한다.
- **남은 위험**: 로컬 mock 테스트만 수행했으며, 운영 시장의 0-volume 봉 패턴 및 DB 통합 동작은 조회하지 않았다.
- **추가 확인**: `lib/db-screener.ts`의 latest-day CTE도 summary 및 as-of raw 모두 volume 양수만 허용하고 있었다. market 기준일을 정하는 latest CTE에서는 공통 OHLCV 검증만 적용하며, 실제 signal candle 조회의 volume 조건은 그대로 둔다. `lib/db-screener.test.ts`가 두 CTE 생성 경로를 검증한다.

## 2026-11-11 누적 스크리너 날짜 검증 연도 경계

- **원인**: `validTradingDate()`가 문자열 날짜를 JS `Date`로 파싱해 왕복 비교하면서 연도 0001~0099 경계에 동일 보정 문제가 발생할 수 있었다.
- **영향**: 날짜상 유효한 이른 연도의 평일 일봉을 누적 스크리너와 세션 체크가 invalid로 제외할 수 있었다.
- **해결 위치**: `lib/accumulation-screener-core.ts`에서 `isValidCompactCalendarDate()`를 재사용하고 기존 주말 제외 규칙을 유지한다.
- **재발 자동 감지**: accumulation 및 공용 calendar unit tests가 저연도 윤년 허용, 비윤일·연도 0000·주말 거부를 확인한다.
- **검증/위험**: 관련 17개 테스트와 타입 검사를 통과했다. 운영 데이터에서 해당 연도 봉이 존재하는지는 조사하지 않았다.
- **공용 helper 경계 테스트**: compact/ISO 모두 연도 0001 허용, 연도 0000·잘못된 자릿수·비문자열 입력 거부를 검증한다. 관련 validator 호출부 점검에서는 날짜-only `Date.parse` 정규화에 기대는 추가 우회 경로를 발견하지 않았다.

## 2026-11-11 국내 일중 거래대금 분석 CLI 날짜 범위

- **원인**: CLI가 `YYYYMMDD` 자릿수와 lexical 순서만 확인해 2월 30일 같은 존재하지 않는 날짜를 통과시켰다.
- **영향**: 잘못된 날짜 범위로 출력 폴더를 만들고 KIS 조회를 시도할 수 있었다.
- **해결 위치**: `scripts/analyze-kr-industry-turnover-kis.ts`에서 공용 `isValidCompactCalendarDateRange()`를 호출해 시작·종료일 모두 실제 달력 날짜이며 순서가 맞는지 확인한다.
- **재발 자동 감지**: `lib/calendar-date-quality.test.mjs`가 정상·역순·불가능 날짜 range를 검사한다.
- **남은 위험**: 실제 KIS 호출과 결과 파일 생성 경로는 실행하지 않았다.

## 2026-11-11 캔들 retry 큐 read failure 처리

- **원인**: `loadDueCandleCacheRetries()`가 데이터베이스 오류를 catch하고 `[]`를 반환해 실제 empty queue와 구분하지 못했다.
- **영향**: explicit retry가 stale 조건과 일치하지 않으면 갱신이 생략되며 job이 정상처럼 진행할 수 있었다.
- **해결 위치**: `lib/candle-cache-retry.ts`에서 조회 실패를 caller에 전파한다. KR worker는 상위 catch에서 job FAILED로 기록하고, US warm은 rejection을 caller에 전달한다.
- **재발 자동 감지**: `lib/candle-cache-retry.test.ts`가 정상 due row 반환과 DB read error 전파를 확인한다.
- **남은 위험**: 실제 retry table outage 시 운영 배치가 실패 처리되는 end-to-end 동작은 staging에서 실행하지 않았다. success marker 오류는 pending 상태가 남아 재시도되는 보수적 경로다.
- **추가 enqueue 관측**: enqueue 함수가 예외를 숨겨 실패 이력 기록 함수가 `true`를 반환할 수 있었다. enqueue 오류를 상위 함수까지 올려 `false`로 표시하고 KR의 `retryQueueFailures`, US의 `failures[].retryQueued=false`에 나타낸다. `lib/candle-cache-failure-history.test.ts`가 이 결과를 고정한다.
- **운영 표시**: `/api/admin/kr-daily-cache-test` status는 job fields를 그대로 JSON에 포함하고 관리자 API 테스트 화면은 polling 결과를 보존한다. `lib/candle-cache-retry-display.ts`가 KR/US 응답 차이를 정규화하며 retry 기록 실패가 있으면 UI에 alert를 렌더링한다. 관련 component suite 및 summarizer tests 통과.
- **claim/backoff 경쟁 조건 수정**: 단순 retry SELECT는 여러 worker의 중복 처리를 막지 않았고 attempts/last_attempt_at가 갱신되지 않았다. active universe pair 제한, `FOR UPDATE SKIP LOCKED` claim, attempt 횟수별 5/15/60/3600분 지연, 30분 PROCESSING lease, attempts generation 기반 성공 fencing을 적용했다. 실패 enqueue는 현재 처리 lease의 예약 backoff를 유지한다.
- **KR lane 우선순위 처리**: worker가 D/W/M retry를 모두 claim하고 나중에 D 우선 정책으로 W/M 실행을 제외하면, 실제 호출되지 않은 row가 30분 PROCESSING lease를 점유할 수 있다. due timeframe은 제한 없는 `DISTINCT` 조회로 lane 우선순위를 결정하고, 최종 lane의 row만 기본 최대 500개 claim한다. claim limit 이후의 row는 claim되지 않아 다음 job에서 처리한다. 재발 자동 감지는 retry unit test에서 timeframe 조회가 `LIMIT`/UPDATE/lock을 사용하지 않는지와 claim query의 timeframe filter를 검사하고, 관리자 debug API의 PROCESSING count/list로 운영 상태를 확인한다.
- **retry 성공 상태 기록 검증**: 실제 candle 저장에 성공해도 retry row가 현재 `PROCESSING` generation과 다르거나 DB update가 실패하면 queue 상태는 완료되지 않는다. success marker가 affected row 여부를 반환하고 KR/US 결과에 queue marker 실패를 남기도록 한다. KR의 종목 성공 집계에서도 이를 실패로 본다. 회귀 테스트는 `rowCount=0`과 DB exception을 모두 `false`로 확인한다. 남은 위험은 운영 debug API에서 stuck PROCESSING을 관찰하고 lease가 만료된 다음 worker가 재수행해야 한다는 점이다.
- **실패 후속 저장 오류 격리**: KIS/저장 실패 이후 failure-history 또는 retry enqueue가 예외를 던지면 공유 lane/worker가 중단되어 나머지 이미 claim된 row가 lease까지 대기할 수 있다. KR/US는 각 종목의 persistence 예외를 결과에 기록하고 다음 종목 처리를 계속한다. 장애 중 persistence 자체는 보장할 수 없으므로 관리자 결과의 `retryQueueFailures`/`retryQueued=false`를 확인하고 원인 복구 뒤 due/lease retry가 재수행되는지 확인한다.
- **retry timeframe 허용 목록**: retry table에 timeframe CHECK 제약이 없으므로 queue에 `D/W/M` 외 값이 들어갈 수 있다. due timeframe 조회와 claim 모두 지원값을 SQL에서 제한하고 함수 입력도 런타임 필터링한다. 회귀 테스트는 잘못된 값 제거와 유효값 없는 경우 DB 접근 생략을 확인한다. 기존 잘못된 row는 자동 삭제하지 않으며 지원 timeframe에 포함되지 않아 worker가 처리하지 않는다.
- **늦은 이전 attempt 실패의 lease 변경 방지**: 오래 걸린 구 worker가 lease 만료 뒤 새 worker가 claim한 row에 실패 enqueue를 늦게 실행하면, 기존 upsert가 새 PROCESSING claim을 PENDING으로 되돌려 중복 처리를 만들 수 있었다. claimed retry의 `attempts` generation을 failure persistence까지 전달하고, 현재 row가 PROCESSING이며 generation도 같을 때만 upsert한다. stale generation에서 실패 기록은 retry 상태를 바꾸지 않고 worker 결과에 persistence/fencing 실패로 노출한다. 별도 stale refresh도 generation 없이 기존 PROCESSING row를 덮지 않으며, 이 경우 enqueue `rowCount=0`을 caller에 실패로 보고한다. 단위 테스트가 generation 조건과 거부 결과를 고정한다.
- **공식 문법 확인**: PostgreSQL 공식 SELECT 및 UPDATE/RETURNING 문서와 claim CTE 문법을 대조했다. 30분 넘게 남은 PROCESSING 또는 `last_attempt_at IS NULL` row를 회수한다.
- **관리자 관측**: `daily-candle-cache-debug`는 이제 retry status summary 외에 최대 100개의 PROCESSING row key, timeframe, attempts 및 KST last-attempt/next-attempt 시각을 제공해 lease 고착을 운영자가 특정할 수 있다. route test가 응답 형식을 확인한다.
- **남은 위험**: claim CTE의 운영 PostgreSQL runtime은 이번에 실행하지 않았다. 30분 lease보다 오래 걸리는 유효 요청은 중복 실행될 수 있으나 generation fencing으로 늦은 결과가 최신 row를 완료 처리하지 못한다.

# Remote 일봉 bulk 요청 상한

`GET /api/public/daily-candles`는 명시된 market만 받고, 비어 있지 않은 최대 32자 종목 코드와 `codes` query parameter당 최대 100개 코드를 허용한다. 쉼표는 구분자이므로 종목 코드에 포함될 수 없다. Remote bulk 호출부는 요청 전 scope를 검증하고, 큰 유니버스는 100개씩 나누며, 각 배치 응답의 종목 코드가 요청과 일치하는지 확인해야 한다. 큰 scope의 중복 제거에는 Set을 사용한다. 공개 route 계약을 바꾸면 remote loader의 검증과 배치 크기도 함께 조정한다. 요청 실패 또는 누락·중복·미요청 종목 응답은 명시적인 캐시 조회 실패로 남겨야 하며 빈 캔들 Map으로 변환하면 안 된다.

단건 `market=US|KR` 조회는 활성 COMMON_STOCK 마스터와 비보통주 제외 플래그를 통과한 종목만 반환한다. code가 복수 거래소에 일치하면 HTTP 409 `AMBIGUOUS_INSTRUMENT`와 `exchanges`를 반환하므로 호출자는 `NAS`, `NYS`, `AMS`, `KOSPI`, `KOSDAQ` 중 정확한 거래소로 재요청한다. `codes` 응답은 종목명·거래소·봉별 `fetchedAt`과 종목별 coverage metadata를 포함하며, ticker가 거래소마다 중복되어도 `(market, code)`를 키로 보존한다.

재발 점검: `lib/remote-daily-candle-cache.ts`의 배치 크기와 `app/api/public/daily-candles/route.ts`의 `codes.length > 100` 검증을 대조한다. 100개 초과 scope를 대상으로 모든 배치가 병합되고 배치별 종목 코드 parity가 유지되는지 확인한다.

## US 5일 고점 돌파의 캐시 조회 장애

`lib/us-five-day-high-breakout.ts`는 DB 캐시에 실제로 봉이 없을 때와 DB 조회가 실패했을 때를 구분해야 한다. 조회 예외를 빈 배열로 바꾸면 `DB daily candles unavailable (0)` 또는 이력 부족으로 오분류할 수 있다. 예외는 해당 거래소 결과의 `daily.status=503`, `diagnostics.cacheLookup=FAILED`로 남기고, 원문 오류 문자열은 응답에 포함하지 않는다. 다른 거래소의 캐시 fallback 탐색은 이어간다.

재발 점검: cache loader가 정상적으로 빈 배열을 반환하는 경우에는 no-data/이력 부족 상태여야 하며, 예외를 던지는 경우에는 503 cache lookup 실패 상태여야 한다. 두 경우를 구분해 확인한다.

정상적으로 조회된 빈 cache는 `daily.status=200`, `diagnostics.cacheLookup=AVAILABLE`, `error=no cached daily candles`로 표현한다. 봉은 있으나 cutoff 기준 직전 5거래일이 모자라면 `insufficient prior candles (n/5)`로 구분한다. `DB daily candles unavailable` 문구는 사용하지 않는다.

단일 종목 loader `loadCachedUsDailyCandles`도 remote 응답 실패 또는 DB 연결 설정 부재를 빈 배열로 바꾸면 안 된다. 조회 실패는 예외로 전달해 breakout 소비자가 503 장애 진단을 남기게 한다. `fetchUsDailyPriceCached`처럼 실시간 KIS fallback이 있는 경로는 cache 장애 후에도 KIS 조회를 진행할 수 있지만, 성공 응답 diagnostics에 cache lookup 실패 상태를 함께 보존한다.

breakout이 동일 티커의 다른 거래소 cache를 이어 조회할 때 앞 거래소에서 발생한 cache 예외가 뒤 거래소의 무데이터 결과에 의해 사라지지 않도록, 최종 응답의 `daily.diagnostics.cacheLookupFailures`에 실패 market과 오류 클래스명을 모두 보존한다. fallback 성공 결과에도 이 진단을 포함한다.

관리자 요약 응답은 종목별 `results`를 제거하므로 자동화 집계의 `cacheLookupFailureCount`와 `cacheLookupFailuresByMarket`을 확인한다. 이 집계는 fallback으로 최종 종목 판정이 성공한 경우의 cache 장애도 포함한다.

US breakout의 scan `ok`는 종목별 실패와 fallback cache lookup 실패가 없을 때만 true다. cron/admin 실행 응답은 이 scan 상태와 Discord 전송 상태를 함께 반영한다. 전체 종목 실패는 `failureCount`로 FAILED, 일부 종목 실패 또는 보조 거래소 cache 조회 실패는 `partialFailureCount`로 PARTIAL 상태에 반영한다.

통합 US 지표 관리자 진단의 `settle.ok`는 함수 실행 예외 여부이고 scanner 데이터의 성공 여부와 별개다. 최상위/summary `ok`를 계산할 때는 모듈 결과의 명시적 `ok=false`, 양수 `failureCount`, 양수 `partialFailureCount`도 실패/부분 상태로 취급한다.

US MFI/DMI/MACD/OBV scanner의 공통 cache context 조회가 성공한 뒤 특정 종목 봉이 비었거나 최소 이력보다 짧으면 DB/API 장애가 아니다. 행 단위 결과는 `cacheLookup=AVAILABLE`와 HTTP status 200으로 남기고, `no cached daily candles` 또는 필요한 봉 수가 포함된 `insufficient daily candles (n/required)` 사유를 기록한다. 공통 context 자체의 DB/remote 실패는 scan 전체 실패로 전달한다.

통합 관리자 summary는 행 배열을 제거하므로 MFI/DMI/MACD/OBV 결과의 `failureReasons` 카운트를 함께 확인한다. 이 카운트는 `NO_CACHED_DAILY_CANDLES`, `INSUFFICIENT_CANDLE_HISTORY`, `ROW_PROCESSING_ERROR`의 고정 category로 집계한다. 개별 종목의 정확한 오류 문구는 행별 `error` 필드에 남으며 summary map key에는 가변 종목별 숫자가 포함되지 않는다.

OBV에서 `change`가 null이면 결과 `failureCount`에도 포함되는 계산 실패다. 해당 행은 `OBV change could not be calculated`를 기록해 failureReasons 집계에서 빠지지 않게 한다.

각 scanner의 `failureReasons`는 `failureCount`와 같은 metric-null 조건으로 실패 행을 먼저 선택한다. 선택된 행에 error가 비어 있거나 타입이 다르면 기본 `ROW_PROCESSING_ERROR`로 집계해 원인 집계 합계가 행 실패 수보다 작아지지 않게 한다.

MFI, DMI(+DI/-DI/ADX), MACD/Signal/Histogram, OBV change는 모두 finite number일 때만 성공으로 센다. `NaN`/Infinity는 응답 metric을 null 처리하고 행의 구체 오류와 `ROW_PROCESSING_ERROR`에 집계한다.

US 저장 유니버스 조회에서 DB 미구성은 빈 배열로 가장하지 않고 예외로 전달한다. DB 조회가 성공해도 활성 `COMMON_STOCK` scope가 0이면 `universe.ok=false`, `NO_ACTIVE_COMMON_STOCKS`다. `isUsDailyScanComplete`는 유니버스 가용, 양수 종목 수, success/instrument counter parity 및 zero failure/partial failure를 요구하며, standalone indicator APIs와 통합 관리자 요약에 공통 적용한다. 예약 US daily-indicators 작업은 6개 scanner 결과와 indicator/trend Discord 결과를 함께 판정하고 합산 카운터를 automation history에 기록한다.

일봉 followup은 Bollinger/Golden Cross scan 결과가 비었거나 universe unavailable이면 cache persist와 retry-success marker를 실행하지 않는다. Bollinger는 `ok`, `universeAvailable`, 양수 `instrumentCount`를 확인한다. Golden Cross는 KR/US scope가 비어 있지 않은지 확인한다. 거부/예외는 retry queue로 전달되어 기존 유효 캐시를 빈 결과로 덮어쓰지 않는다. ADL 관리자 응답과 `daily-filter-refresh`도 공통 scan completeness 및 webhook 성공 상태를 최종 `ok` 판정에 반영한다.

같은 persist 함수를 직접 부르는 cron 경로도 별도로 확인한다. `persistDailyBollingerResults`와 `persistGoldenCrossResults` 자체가 0개 scan을 거부해 모든 caller에 공통 보호를 제공하며, cron은 입력 universe/scope를 persist 전에 검증한다. KR Bollinger cron 응답은 automation result의 `ok`를 바깥 wrapper가 덮어쓰지 않도록 한다.

Bollinger persist는 양수 scan count만으로 충분하다고 간주하지 않는다. US에는 공통 `isUsDailyScanComplete`를 적용하고, KR은 명시적인 universe success 및 카운터 정합성/실패 0을 요구한다. 거부 시 retry를 enqueue한다. retry success marker는 SUCCESS UPSERT query가 정상 완료돼야 성공이며, DB 오류면 cache API도 성공을 반환하지 않는다. Golden Cross는 빈 결과를 거부한다(정상 `INSUFFICIENT_HISTORY`는 진단 데이터로 유지).

Bollinger retry enqueue 자체가 DB 오류를 숨겨서는 안 된다. enqueue helper의 boolean 결과를 저장 API에서 검사하고, retry를 생성할 수 없는 경우 성공 cache 상태를 보고하지 않는다. Golden Cross는 유효한 종목 단위 `dataQuality` 진단을 보존하므로, 단일 `INVALID_INPUT` 행을 이유로 전체 snapshot 저장을 거부하지 않는다.

`daily_bollinger_cache_retries`에는 현재 due-row consumer가 없다. 재실행은 네 Bollinger cron의 module interval 정책에 따른 정기 실행이 맡고, `next_attempt_at`은 실제 cron 실행을 지연시키지 않는 진단용 backoff metadata다. 이 테이블을 worker queue처럼 취급하거나 due 처리 완료를 전제해선 안 된다. 실제 개별 due retry가 필요하면 claim/lease 및 중복 실행 fencing을 포함한 consumer를 별도 구현해야 한다.

Bollinger cron과 candle followup은 같은 cache key에 겹쳐 쓸 수 있다. scanner는 작업 시작 시각을 `sourceCheckedAt`, 완료 시각을 `checkedAt`으로 분리해 보존한다. `writeKisCacheIfSourceIsNewer`의 단일 PostgreSQL UPSERT는 기존 source 시각보다 엄격히 최신일 때만 교체하므로 늦게 끝난 오래된 scan과 동일 밀리초 tie는 기존 캐시를 보존한다. 거부는 최신 payload가 이미 있다는 정상 no-op으로 반환하며 retry 성공 기록은 계속 수행한다. cache write가 stale no-op으로 판정되면 KR/US Bollinger 네 cron은 해당 scan의 Discord 알림도 보내지 않고 `reason: "stale_scan"`으로 보고한다.

retry 성공 UPSERT도 scan `sourceCheckedAt`을 generation token으로 사용한다. 기존 `last_attempt_at`이 이 scan 시작보다 나중이면 새 실패 상태가 이미 기록된 것이므로 success marker는 `SUPERSEDED`를 반환하고 행을 바꾸지 않는다. 이 상태를 재-enqueue하지 않아 최신 `last_error`와 attempts를 보존하며 해당 scan의 cron 호출은 성공으로 처리하지 않는다.

retry failure enqueue도 generation을 받으면 동일한 fencing을 적용한다. 기존 `last_attempt_at`이 enqueue generation보다 최신일 때는 stale failure가 최신 `last_error`, attempts, next-attempt metadata를 갱신하지 않는다. cron wrapper는 작업 진입 시 DB generation을 확보하고, persist의 scan-originated 오류는 scanner가 반환한 `sourceCheckedAt`을 사용한다. DB generation을 확보하지 못한 scanner 단계 오류는 기존 fallback enqueue가 가능하므로 DB clock 장애 중에는 엄격한 순서 보장이 제한된다.

`enqueueDailyBollingerRetry`의 boolean은 새 row가 실제 insert/update됐다는 뜻이 아니라 DB enqueue statement가 오류 없이 완료됐다는 뜻이다. generation fence가 stale enqueue를 거부해도 더 최신 retry row를 보존한 정상 no-op이므로 true가 반환된다. 호출부는 이 값을 insert count로 집계하지 않는다.

일봉 Bollinger Discord sender 호출자는 cron route 네 곳이다. 모든 route는 persist 결과의 `staleScanSkipped`를 확인한 후에만 전송한다. 관리자 Bollinger test job과 candle followup은 해당 일봉 알림 sender를 호출하지 않는다.

`refreshDailyBollingerCaches`는 zone별 persist 성공을 `ok: true`로, 실패를 `ok: false`로 명시하며 `{ ok, staleScanSkippedCount, zones }`를 반환한다. `staleScanSkippedCount`는 scan 자체 실패가 아니라 이미 더 최신 cache가 존재해 해당 세대 쓰기가 생략된 수다. 전체 zone persist가 끝난 경우 followup retry success를 반영한다.
followup retry enqueue와 SUCCESS marker는 DB 오류를 boolean false로 호출부에 전달한다. 따라서 `retryQueued`는 실제 enqueue query 성공을 의미하고, `retryMarkerOk: false`이면 cache 갱신 성공과 관계없이 followup 전체 `ok`는 false다. Golden Cross도 success marker 실패를 오류로 처리하고 failure enqueue 성공 여부를 반환한다.

`daily_cache_followup_retries`에는 due-row claim/consumer가 없다. 실패는 enabled/schedule 조건을 만족하는 KR/US daily-cache cron의 다음 실행에서 followup이 다시 시도한다. 테이블의 `next_attempt_at`은 현재 그 재실행 시점을 예약하지 않는 관측 metadata이므로 이를 독립 worker의 backoff로 해석하면 안 된다.

KR daily-cache job의 최상위 `status`와 US warm의 최상위 `ok`는 candle refresh/universe 상태를 나타낸다. Bollinger와 Golden Cross followup은 별도 `bollingerCache`/`goldenCrossCache` 필드다. followup 장애는 해당 객체의 `ok: false`, zone 오류, `retryQueued: false` 또는 `retryMarkerOk: false`로 확인하며 최상위 candle 상태만으로 indicator followup 완료를 추론하지 않는다.
Bollinger cache의 `updatedAt`은 cache write 시 PostgreSQL `clock_timestamp()`로 만든 UTC 마이크로초 문자열이고 `sourceCheckedAt`은 scan 시작 때 같은 DB 시계로 읽은 generation이다. 앱 서버 시계 차이로 완료/시작 순서가 뒤집히지 않게 두 값의 clock source를 통일한다. daily cache diagnostic API 및 Discord cache 조회는 두 시각을 함께 노출해 늦게 끝난 scan이 cache에 반영됐는지 운영자가 대조할 수 있어야 한다.
timestamp JSON 생성식은 PostgreSQL 17 공식 [date/time functions](https://www.postgresql.org/docs/17/functions-datetime.html) 및 [formatting functions](https://www.postgresql.org/docs/17/functions-formatting.html)을 기준으로 한다. localhost에서 동일한 timestamp/`jsonb_set` expression을 `BEGIN READ ONLY` transaction으로 확인했다. 조건부 UPSERT 전체의 DB 실행과 동시성 검증은 별도다.
Bollinger cache 네 key의 현 payload shape(object, `qualified` array, timestamp string)를 localhost read-only 조회로 확인했다. 전체 UPSERT 구문은 `EXPLAIN`으로 계획만 검증했으며 실행·동시성은 별도다.
Discord 응답은 `sendDailyCacheResponses`에 넘기기 전에 `splitDailyCacheCommand`로 1,900자 단위 분할한다. source 시각 표시는 slash command의 이름·등록·cache key 계약을 변경하지 않는다.

generation timestamp와 retry attempt timestamp는 모두 PostgreSQL에서 가져온다. scanner 시작 시 `clock_timestamp()`를 UTC 마이크로초 문자열로 직접 조회하고 Node `Date` 변환을 거치지 않아 PostgreSQL의 마이크로초 정밀도를 cache UPSERT와 retry marker까지 보존한다. 공통 persist는 `sourceCheckedAt` 누락·오류 시 `checkedAt`이나 앱 시각으로 대체하지 않고 retry 기록 후 거부한다. retry enqueue/success의 `last_attempt_at`은 DB `NOW()`를 사용하므로 앱 서버 clock skew가 fencing 순서를 바꾸지 않는다. DB 시간 조회 실패는 scan 오류로 처리한다. 이 timestamp 경로의 DB 동시 실행 검증은 아직 수행하지 않았다.
각 cron은 retry wrapper가 한 번 확보한 generation을 scanner에도 전달한다. 같은 시도에서 cache payload, success marker, 실패 enqueue가 서로 다른 시작 세대를 기록하지 않도록 한다. 직접 scanner 호출은 기존처럼 scanner 내부에서 timestamp를 확보한다.
`daily_bollinger_cache_retries.last_attempt_at`은 PostgreSQL `TIMESTAMPTZ(6)` 정밀도를 사용한다. 로컬 read-only 확인에서 1µs 차이 timestamp의 strict ordering을 확인했다.
cache UPSERT와 retry failure enqueue는 strictly newer (`<`) 조건을 사용한다. retry success marker는 더 최신 generation만 상태를 바꾸며, 동일 generation이 이미 SUCCESS면 idempotent 성공으로 허용하고 동일 generation의 PENDING failure는 덮지 않는다. timestamp 동률은 기존 실패 상태를 보존한다.
retry success marker가 성공하면 과거 `last_error`를 비우고 `next_attempt_at`을 DB 현재 시각으로 정리한다. `attempts`는 누적 시도 수라 성공 때 reset하지 않는다.
새 failure enqueue는 상태를 PENDING으로 바꾸면서 기존 `succeeded_at`도 NULL로 초기화한다. SUCCESS의 `succeeded_at`이 다음 실패 이후에도 남지 않게 한다.
이 UPSERT clear-field/fence 조합은 localhost read-only `EXPLAIN`으로 계획만 검증했으며, 실제 row transition은 실행하지 않았다.
운영 점검 시 `bollingerRetries.states`에서 PENDING은 `last_error`/NULL `succeeded_at`, SUCCESS는 NULL `last_error`/`succeeded_at` 및 완료 기준의 `next_attempt_at`을 확인한다. `attempts`는 두 상태 사이에 누적된다.
로컬 상태 점검은 status별 row 수, attempts 합, `last_error` 존재 수, 미래 `next_attempt_at` 수만 집계해 오류 본문을 출력하지 않는다. 0행이면 cleanup DML은 실행하지 않는다.
관리자 `daily-candle-cache-debug`는 허용된 KR/US × 두 Bollinger zone 조합만 조회하고 `LIMIT 4`로 제한해 `bollingerRetries.states`로 반환한다. SUCCESS의 누적 attempts, `succeeded_at`, NULL `last_error`, 정리된 `next_attempt_at`을 PENDING 상세와 함께 확인할 수 있다. retry table에 DB CHECK 제약은 없어 응답 query 자체가 scope를 제한해야 한다.
로컬 read-only `EXPLAIN`에서 detail SELECT가 `(scope, zone)` unique index와 LIMIT 계획을 사용하고 success UPSERT가 fence 및 cleanup assignment를 갖는 것을 확인했다. 이는 SQL 계획 검증이며 실제 row 전이 검증은 아니다.
`byScopeZoneStatus`는 전체 retry table 집계이고 `states`는 유효한 네 조합만 반환한다. 둘의 scope 차이를 감추지 않도록 `invalidScopeZone`에서 허용 조합 밖 행 수와 attempts 합계를 확인한다.
해당 aggregate filter는 로컬 read-only `EXPLAIN`으로 확인했으며, 이 계획 검사는 실제 상태 행 검증을 대체하지 않는다.
scope/zone은 migration 및 현재 localhost schema에서 NOT NULL이라 invalid-key filter의 `NOT (...)` 조건이 NULL UNKNOWN으로 행을 누락하지 않는다.
V170은 retry row의 scope, zone, status 값과 `attempts >= 0`을 DB CHECK로 제한한다. 로컬 read-only 조회에서는 migration 전 retry table이 0행이며 CHECK 제약이 없음을 확인했다. V170 DDL을 로컬 DB의 임시 트랜잭션에 실행해 네 제약이 validated로 생성되고 정상 값은 허용, 각 금지 값은 거부됨을 확인한 뒤 전체 rollback했다. 후속 조회에서 영구 제약이 남지 않았고 데이터도 변경되지 않았다. migration/schema 선언은 정합화했지만 V170은 아직 적용하지 않았으므로 운영 DB 보호는 migration 배포 후부터 유효하다. 배포 전후 admin diagnostic의 `invalidScopeZone`은 잘못된 키 조합을, `invalidState`는 미지원 status와 음수 attempts를 계수한다. synthetic row 3건으로 count 3, invalid status 2, negative attempts 2, 합계 -4를 확인했고, 혼합 3건에서는 합계 4294967294, invalid key 1건, invalid state 1건 집계를 확인했다. 모든 Bollinger retry aggregate의 attempts 합계는 numeric을 문자열로 직렬화해 integer cast overflow를 피한다. `invalidState` 집계 쿼리 실패는 0으로 위장하지 않고 endpoint 실패로 반환한다.
모든 Bollinger retry 상세 및 aggregate 조회는 개별 쿼리 오류를 빈 배열/0건으로 치환하지 않는다. 하나라도 실패하면 `daily-candle-cache-debug`의 공통 503 응답을 반환해 불완전 진단을 정상 결과로 오인하지 않게 한다.
일반 candle retry의 `byStatus`, `pending`, `processing`도 같은 실패 정책을 쓴다. 세 section은 한 SQL statement snapshot에서 읽으며, 전체 건수와 최대 100행의 반환 수를 구분한다. 합계 attempts는 numeric 문자열이다. 이 endpoint의 503은 retry 조회 중 하나 이상을 완료하지 못했다는 뜻이므로 0건으로 해석하지 않는다.
일반 retry 전이의 `transitionIntegrity`는 SUCCESS에 남은 `last_error`, SUCCESS인데 `succeeded_at`이 없는 행, PENDING/PROCESSING인데 `succeeded_at`이 남은 행을 count-only로 집계한다. SQL aggregate는 scalar subquery가 단일 JSON 객체를 반환하도록 `json_build_object`를 사용한다. 성공 marker는 `last_error`를 지우고 `next_attempt_at`을 현재 시각으로 정리하며, 새 실패 enqueue는 이전 `succeeded_at`을 지운다. 과거 상태는 자동 수정하지 않는다.
retry status summary에는 `earliest_next_attempt_at`, `oldest_created_at`, `oldest_updated_at`, `latest_updated_at`과 KST 변환값이 포함된다. 오래된 due와 stale update를 구분해 queue consumer 미실행 여부를 파악한다. KR daily job은 daily-first stale refresh를 유지하되 due retry timeframe 전체를 claim 대상으로 유지해 D retry 반복 실패가 W/M retry를 영구 차단하지 않게 한다.
현재 공식 유니버스 eligibility에서 제외된 종목의 PENDING retry는 KR/US cache consumer의 입력 scope에서 빠져 자동 claim되지 않을 수 있다. 운영자는 먼저 status summary의 오래된 due/update 시각, automation run history, 현재 공식 universe eligibility를 대조한다. 해당 행을 임의로 다시 eligible 처리하거나 cache를 갱신하지 말고, 별도 정책이 승인되기 전까지 DB에서 수동 삭제하지 않는다.
`retries.pendingEligibility`는 PENDING을 timeframe 및 현재 저장 master metadata 기준으로 분류한다: KR master 누락/비활성/non-common/risk flag, KR currently eligible, US master 누락/비활성·daily-inactive/non-common/product flag, unsupported market. US metadata를 통과한 행은 저장된 name/englishName의 JS 정규식 제외 필터까지 SQL로 재판정하지 않아 `US_METADATA_ELIGIBLE_NAME_CHECK`로 별도 표시한다. 이 aggregate는 종목 코드를 반환하지 않으며 행 수와 attempts 0 수만 제공한다.
2026-11-11 로컬 `.env.local` DB read-only 점검에서는 일반 candle retry PENDING 7,352건이 모두 attempts 0이었고, 전체 due 최솟값은 2026-08-24, oldest update 2026-08-26, latest update 2026-09-18이었다. 현재 KR eligible key에 해당하는 PENDING은 D/W/M 각 2,184/2,257/2,257건, 현재 universe에서 제외된 키는 654건이었다. automation 이력상 마지막 실제 worker는 2026-08-26 서버 재시작으로 중단됐고 이후 최신 이력은 2026-09-02 `outside_schedule` skip이다. 이는 조사 시점의 로컬 DB 관측이며 운영 DB 상태로 일반화하지 않는다. KR daily job의 D 우선 필터가 due retry lane에도 적용되어 W/M retry를 굶길 수 있던 코드를 수정했으며, 과거 retry/error 행은 변경하지 않았다. 현재 universe에서 제외된 오래된 PENDING의 정리 정책은 별도 검토가 남아 있다.
Bollinger retry 상세 `pending`은 최대 100행만 반환한다. `pendingCount` 전체 수와 `pendingReturnedCount` 상세 배열 길이는 한 SQL statement snapshot에서 함께 읽어 동시 status 변경으로 두 값이 서로 다른 시점 기준이 되지 않게 한다. 둘을 혼동하지 않는다.
failure enqueue에 scan generation이 없는 경우도 조건을 우회하지 않는다. row의 `last_attempt_at`과 enqueue SQL의 DB `NOW()` fallback을 strict compare해 늦거나 동률인 failure write를 막는다.
localhost read-only `EXPLAIN`에서 retry enqueue/success UPSERT의 unique arbiter와 fence 조건이 계획되는 것을 확인했다. 이는 SQL 계획 검증이며 실제 row 상태 전이나 동시 실행 결과 검증은 아니다.

정상 Bollinger cache 갱신을 retry enqueue로 시작하지 않는다. 정상 실행 때마다 attempts를 올리면 retry 횟수와 PENDING 상태가 실제 실패와 무관하게 오염된다. 정상 scan 후 cache write와 success upsert를 수행하고, scan 불완전 또는 저장/marker 오류에서만 retry를 enqueue한다.

US 1분 OBV/ADL은 상승률 유니버스의 `ok`와 `complete`, 행 실패 0을 확인한 경우만 기존 cache를 갱신한다. 시장 일부 응답 누락이나 종목 처리 실패가 있으면 이전 qualified 결과를 유지하고 Discord 알림을 건너뛴다. 정책 필터 결과가 0개여도 소스 유니버스 전체가 정상 확인되면 유효한 무신호 결과로 저장한다.

US 1분 OBV/ADL cron은 비교 기준 cache 조회 자체가 DB 오류로 실패하면 전체 후보를 신규 자격 종목으로 오인해 Discord 알림을 재전송할 수 있으므로 scan 전에 실패를 전파한다. 실제 cache row가 없는 최초 실행은 기존 동작대로 신규 후보 비교를 수행한다.

`npm run cron:check`는 모든 cron route의 실행 이력/running/backoff 조회가 `.catch(() => null)`로 무시되는지 검사하고, baseline `readKisCache` 실패를 빈 집합으로 대체하는 패턴도 막는다. 이 source audit는 코드 패턴 재발을 탐지하며 실제 DB 장애/Discord 전송을 실행하지 않는다.

interval gate가 있는 cron은 설정 interval이 지났더라도 worker가 아직 `RUNNING`이면 재진입을 건너뛰고 `already_running`을 기록해야 한다. `loadRunningAutomationRun`은 공통 2시간 stale cutoff 이후의 고아 run을 active로 취급하지 않으며, Fundamentals의 5시간 cutoff와 daily cache/SEC 작업별 DB advisory lock은 별도 concurrency 제어 예외다. read-then-start race를 막기 위해 KR/US Bollinger, Golden Cross, breakout, daily indicators/open-cache, minute scans, OBV divergence는 `withExclusiveAutomationRun`의 `automation-run:<moduleKey>` DB session advisory lock으로 실행 구간을 원자적으로 보호한다. lock 경합 시 신규 `RUNNING` 실행은 시작하지 않고 `already_running` skip을 반환/기록한다. `cron:check`는 interval route에 active-run guard 또는 명시된 독립 제어가 있고, 지정 scan route가 exclusive wrapper를 사용하는지 검사한다.

SEC EDGAR 이벤트 알림과 US breaking-news 전달도 `withExclusiveAutomationRun`으로 check/send/persist 전체를 직렬화한다. 두 파이프라인 모두 DB 상태를 검사한 뒤 외부 Discord를 호출하고 상태를 갱신하므로, 단순 row 상태 upsert만으로는 동시 요청 중복 전송을 막지 못한다. 재발 방지 source audit는 두 endpoint의 exclusive wrapper 사용을 요구한다.

`cron:check`는 exclusive wrapper의 존재만 확인하지 않고 각 보호 route의 첫 번째 module key가 해당 automation 이름과 일치하는지도 확인한다. route를 복사해 잘못된 key를 넘기면 서로 다른 route가 같은 lock을 공유하거나 동일 route 경합이 lock을 피해 갈 수 있으므로 검증 실패로 처리한다.

cron 인증은 설정 기반 DB gate보다 먼저 수행한다. global daily automation gate를 인증 전에 호출하면 무인증 요청이 DB 조회를 유발하고, 비활성일 때 응답을 구별해 설정 상태를 추론할 수 있다. `cron:check`는 특정 route 목록에 의존하지 않고, 해당 gate를 호출하는 모든 cron route에서 auth 순서를 검사한다.

`app/api/cron/**/route.ts`의 모든 route는 직접 `isCronRequestAuthorized(request)`를 호출하거나 명시적인 `authorized(request)` 위임 guard를 호출해야 한다. `cron:check`는 재귀 route inventory 전체에서 인증 호출이 빠진 endpoint를 탐지한다.

자동화 run 결과는 최상위 `status: "PARTIAL"` 또는 `degraded: true`도 성공으로 기록하지 않는다. 결과에 `discord.ok === false`가 있으면 자동화 run도 불완전 상태로 기록한다. SEC EDGAR route는 CIK 실패를 표준 `instrumentCount`/`failureCount`로, 이벤트 원장 부분·전체 실패를 `partialFailureCount`와 `degraded`로 노출한다. `cron:check`는 공통 판정기와 SEC EDGAR·Discord 전달 결과 계약을 검사한다.

US breaking-news forwarder는 직송 실패를 재시도 queue에 안전하게 넣어도 해당 실행을 완전한 전송 성공으로 보고하지 않는다. 결과의 `deliveryFailedCount`/`retryQueuedCount`와 `partialFailureCount`/`degraded`를 확인해 직송 실패와 재시도 대기 상태를 구분한다.

관리자 진단의 `effectiveStatus` 산출도 실행 저장과 동일하게 명시적 `FAILED`/`PARTIAL`, `degraded`, `discord.ok === false`, 표준 카운터를 반영해야 한다. 새로운 실패 신호를 공통 run 판정에 추가할 때 `getAutomationRunResultStatus`와 진단 API의 evidence 감지 조건도 함께 갱신한다.

완료 Discord 알림의 상태 설명은 실제 실패 유형을 반영한다. 중첩 Discord 전달 실패를 종목 데이터 미수신으로 표현하지 않으며, 실패 수량을 알 수 없는 전체 실패에서 `undefined개 종목 처리 실패` 같은 메시지를 만들지 않는다. 재시도 대기·저하 카운터도 결과 요약에서 확인할 수 있어야 한다.

완료 Discord 본문은 1,900자 예산 안에서 상태·결과·실패·완료 시각을 우선 보존하고, fallback 등 부가 설명만 남은 길이에 맞춰 줄인다. 최종 문자열을 뒤에서 단순 절단해 진단에 필요한 필드가 사라지지 않게 한다.

automation summary compaction은 Date를 ISO 시각으로, Error를 이름·메시지로 변환한 뒤 객체를 축약한다. JavaScript 내장 객체의 비열거 필드가 빈 객체로 사라지지 않게 유지한다.

공통 automation wrapper는 종목 실패 수가 유효한 양수일 때만 수량 메시지를 전달한다. 실패 코드만 있고 카운터가 없는 전체 실패는 알림 포맷터가 일반 실패 문구를 사용한다. RSS의 수집·번역 카운터 실패와 전달·원장 저하는 별도 상태 문구를 사용한다.

`withAutomationLock`은 session advisory lock을 사용하므로 acquire 응답에 boolean이 없거나 client를 풀에 반환하기 전에 `pg_advisory_unlock` 결과가 `true`인지 확인할 수 없으면 해당 client를 `release(true)`로 폐기한다. 이렇게 lock 상태가 불명확한 backend session이 pool에서 재사용되지 않게 한다. PostgreSQL은 session advisory lock을 명시적으로 해제하거나 session이 종료될 때까지 유지하며, node-postgres의 `release(true)`는 해당 client/backend를 pool에서 제거한다 ([PostgreSQL advisory locks](https://www.postgresql.org/docs/current/functions-admin.html), [node-postgres pool client release](https://node-postgres.com/apis/pool)). `cron:check`는 이 cleanup invariant를 검사한다.

모든 `app/api/cron/**/route.ts`는 요청 handler 본문 첫 구간에서 `request` 인증 guard를 실행하고 DB/worker/외부 호출보다 먼저 반환해야 한다. `npm run cron:check`는 recursive route inventory의 `GET`/`POST`/`handle` handler 본문을 확인해 guard의 존재와 처리 호출 전 순서를 점검한다. handler 구조나 인증 위임 방식을 바꾸면 이 audit 규칙도 함께 갱신한다. 정적 검사는 언어 제어흐름 전체를 증명하지 않으므로 보안 동작 확인은 실제 환경 HTTP 검증이 별도로 필요하다.

US 1분 Bollinger도 원천 유니버스의 `ok`/`complete`, DB 유니버스 동기화 성공, 종목 처리 실패 0을 최종 상태에 포함한다. 미완료 scan은 cron Discord 전송을 하지 않는다. 필터 정책으로 선택 대상이 0개인 경우는 완전한 소스 유니버스와 무오류가 확인되면 유효한 빈 후보 결과로 취급한다.

US 1분 Bollinger 및 OBV/ADL의 결과 상태는 원천 universe 불가용 또는 전체 행 실패 때 `FAILED`, 일부 행 실패 때 `PARTIAL`, 정상 완료(필터 결과 0건 포함) 때 `COMPLETED`다. 결과 캐시·알림은 complete 성공일 때만 수행한다.

일봉 KR/US Bollinger의 process-local TTL 결과 캐시는 완전한 scan(`universeAvailable`, 양수 대상, 전 행 성공)만 저장·재사용한다. 유니버스 unavailable/0종목 또는 전 행 실패는 `FAILED`, 일부 행 실패·이력 부족은 `PARTIAL`, 전 행 처리 성공은 `COMPLETED`다. incomplete scan은 TTL에 보관하지 않는다. 캐시 키에는 정규화 정책과 정렬된 `market:code` 목록을 함께 넣어 universe membership 변경 후 이전 캐시가 재사용되지 않게 한다.

`technical-entry-analysis`는 추천 조건 불충족과 입력 데이터 누락을 구분한다. 필수 봉 이력 부족, 최신 일봉 날짜 coverage 불일치, 최신 거래량 무효 건수를 각각 보고한다. eligible scope가 0이면 FAILED, 일부 입력 coverage 누락이면 PARTIAL이며 기존 캐시를 갱신하지 않는다. 모든 scope 입력이 충분하면 추천 종목 0개도 정상 결과로 캐시할 수 있다.

Flyway DDL audit의 statement boundary를 바꿀 때는 `parseFlywayDdlEffects`가 SQL 주석, 문자열 literal, dollar-quoted body를 먼저 mask한 뒤 quoted-identifier-aware semicolon splitter를 호출하는 순서를 유지한다. Dollar-quote tag는 PostgreSQL unquoted identifier의 Unicode 문자 규칙을 반영하고, 앞선 identifier에 붙은 `$tag$`는 여는 delimiter로 오인하지 않는다. DO body나 nested/block/line comment의 세미콜론과 DDL 유사 텍스트가 바깥 statement 또는 catalog effect로 새지 않는 회귀 테스트를 함께 갱신한다.

PostgreSQL unquoted identifier는 ASCII에 한정되지 않는다. CREATE TABLE shape/effect, SELECT INTO target, LIKE/REFERENCES target, ALTER TABLE column/constraint/rename, CREATE VIEW/DROP TABLE, CREATE/DROP INDEX, CREATE SEQUENCE 및 DML target matcher는 Unicode letter/number/mark 규칙을 공유한다. 키워드 앞뒤 경계도 같은 continuation 문자 집합으로 판정해 `한글CREATE`/`SELECT이름`, column 이름 `한글UNIQUE`/`한글REFERENCES`, FK target column `한글DEFERRABLE`을 SQL keyword나 constraint option으로 잘못 분리하지 않는다. boundary 검사에서는 UTF-16 surrogate pair로 표현되는 supplementary code point도 하나의 identifier 문자로 검사한다. `ALTER TABLE IF EXISTS`, `RENAME [ COLUMN ] old TO new`, `RENAME CONSTRAINT old TO new` 및 `RENAME TO new`를 파싱하고, rename은 이전 object absent 다음 새 object present 순서로 inventory에 기록한다. pending table rename은 column/constraint/index parent 상태를 새 relation name으로 옮기며, 원본 누락과 대상 이름 충돌을 별도 preflight issue로 보고한다. IF EXISTS table rename은 원본 table이 없으면 no-op으로 판정한다. `ALTER [ COLUMN ] name SET/DROP/TYPE/ADD/RESET` 동작은 정의값을 비교하지 않지만 참조한 컬럼의 존재를 inventory 및 pending preflight에서 확인한다. 비라틴 테이블·컬럼·index/sequence 이름 회귀를 유지해 UTF-8 migration DDL/DML이 inventory에서 조용히 누락되지 않게 한다. 기준: [PostgreSQL Lexical Structure](https://www.postgresql.org/docs/current/sql-syntax-lexical.html), [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html).

Qualified name의 schema dot 주위 SQL whitespace는 토큰 공백이므로 parser가 `schema . table`도 `schema.table`과 동일하게 매칭한다. 정규화 시 quoted component 내부 whitespace/dot은 그대로 두고, quote 밖의 schema separator 주변 공백만 제거한다. CREATE/ALTER/INDEX/REFERENCES fixture가 whitespace와 quoted schema/table 이름을 함께 확인한다. 근거: [PostgreSQL Lexical Structure](https://www.postgresql.org/docs/current/sql-syntax-lexical.html).

Unicode-escaped quoted identifier `U&"..."`는 기본 backslash 및 `UESCAPE` 사용자 지정 문자를 해석해 catalog identifier로 decode한다. 일반 quoted identifier 안에 문자 그대로 들어 있는 `U&"` 시퀀스는 escape 문법으로 재해석하지 않는다. masker는 `UESCAPE` literal을 바로 앞에 닫힌 실제 `U&"..."` identifier가 있을 때만 보존하고, 다른 문맥의 같은 단어 뒤 string은 계속 mask한다. CREATE TABLE/column, CHECK constraint name, REFERENCES relation/columns, index key, sequence, ALTER TABLE table/column/constraint rename의 이전·새 이름, 사용자 지정 escape 및 surrogate-pair decode 경계를 parser fixture에서 유지한다. 근거: [PostgreSQL Lexical Structure](https://www.postgresql.org/docs/current/sql-syntax-lexical.html).

US sideways OBV/ADL scanner는 종목별 30개 미만 일봉을 조용히 제외하지 않는다. `insufficientHistoryCount`/`analyzedCount`로 coverage를 반환하며 universe 0건 또는 전체 이력 부족은 FAILED, 부분 부족은 PARTIAL, 전체 입력 분석 완료는 COMPLETED다. 정상 입력에서 qualified 0건은 성공이다.

재발 점검: 후속 cache 저장 경로에서 scan/context를 persist하기 전에는 universe가 사용 가능하고 대상 수가 양수인지 확인한다. `mark*RetrySuccess`는 해당 persist가 정상 완료된 경우에만 호출한다. 관리자/Discord 자동화는 함수가 예외 없이 반환됐다는 사실만으로 scan 성공을 보고하지 않는다.

저장 US universe consumer인 daily cache warm, open-cache, MA9도 빈 universe를 성공 처리하면 안 된다. warm은 종목이 존재하고 갱신 대상 lane이 없는 경우만 정상 no-op이며, empty/unavailable universe는 `ok=false/status=FAILED`다. open-cache도 동일한 universe gate를 적용한다. MA9 `BOTH`는 KR/US 각 선택 universe를 따로 확인하므로 한 market이 비면 전체 scan `ok=false`로 보고한다.

관리자 비동기 US daily cache job은 실행 완료와 데이터 작업 완료를 구분한다. warm 결과가 정상 universe에서 일부 종목 실패를 반환하면 job status는 `PARTIAL`, 모든 대상 실패 또는 universe unavailable이면 `FAILED`, 실패 없이 처리되거나 정상 no-op이면 `COMPLETED`다. Discord 수동 갱신 메시지는 같은 warm 결과 상태를 표시한다.


- **quoted relation matcher 경계**: quoted comma 포함 table 이름도 CREATE/ALTER TABLE matcher가 전체 identifier로 읽는다. schema-qualified 이름은 quoted dot을 보존하고 마지막 component를 canonical catalog name으로 사용한다.
- **quoted constraint clause 경계**: UNIQUE/PRIMARY KEY/FOREIGN KEY와 INHERITS 목록에서 identifier 안의 comma 및 괄호를 list separator/boundary로 오인하지 않도록 quoted identifier 영역을 건너뛰고 괄호 깊이를 추적한다. 미지원 clause는 catalog 일치로 조용히 통과시키지 않고 preflight unverified 경계를 유지한다.
- **escape string 렉싱 경계**: PostgreSQL E 문자열 내부의 escaped quote 및 comma/괄호/세미콜론이 DDL token, list separator 또는 command boundary로 처리되지 않게 `maskSqlCommentsAndLiterals`의 E-string 처리를 테스트한다. string/comment mask 이후 실제 UNIQUE clause와 다음 statement가 정상 인식되어야 한다.
- **ALTER TABLE statement 경계**: 한 파일에서 여러 ALTER가 순서대로 나타나거나 quoted table/column/constraint name에 세미콜론이 포함되어도 action body를 statement별로 분리한다. 마스킹된 SQL에서 double-quote 경계를 따라 terminator를 찾고 source 순서대로 column/constraint effect를 inventory한다.

Pending `CREATE TABLE` source의 inline `REFERENCES`도 FK constraint 이름(있는 경우), 참조 relation, matching unique key의 backing index와 함께 dependency inventory에 연결한다. named source unique/primary key는 선언 이름을 backing index로 보존한다. backing index 이름을 알 수 없는 dependency는 referenced table 기준으로 추적해 해당 table의 index drop을 보수적으로 차단한다. relation rename은 FK의 referencing/referenced table 상태를 함께 옮긴다. PostgreSQL FK는 참조 대상의 고유 constraint/index를 사용하며 `DROP INDEX RESTRICT`는 의존성을 보존하므로, pending source에서도 같은 순서 제약을 유지한다 ([CREATE TABLE](https://www.postgresql.org/docs/18/sql-createtable.html), [DROP INDEX](https://www.postgresql.org/docs/18/sql-dropindex.html), [`pg_constraint`](https://www.postgresql.org/docs/18/catalog-pg-constraint.html)).
`ALTER TABLE DROP CONSTRAINT`의 FK preflight도 backing index 이름이 알려진 key에만 의존하지 않는다. backing index를 모르는 named unique/primary key는 dependency map의 `referencedTable`로 참조 FK를 찾아 같은 statement를 차단한다. 참조 table이 주어진 경우에만 fallback을 적용해 다른 table의 FK를 잘못 차단하지 않도록 한다.
`DROP TABLE`의 기본 `RESTRICT`도 FK dependency inventory와 대조한다. 현재 relation을 참조하는 외부 FK가 있고 해당 referencing table이 같은 DROP 문에 포함되지 않으면 `PENDING_MIGRATION_RELATION_REFERENCED_BY_FOREIGN_KEY`로 보고하고, 해당 DROP 문 전체의 source state 변경을 적용하지 않는다. 같은 문에 함께 나열된 referencing table은 공동 제거 대상으로 제외한다. PostgreSQL 공식 문서는 참조 table을 제거하려면 CASCADE가 필요하고, CASCADE는 referencing table이 아니라 FK constraint만 제거한다고 명시한다 ([DROP TABLE](https://www.postgresql.org/docs/18/sql-droptable.html)).
`ALTER TABLE DROP COLUMN`도 FK dependency map의 local/referenced column 목록을 사용한다. 다른 table의 FK가 삭제 대상 column을 참조하고 같은 관계 제약조건이 먼저 source order에서 제거되지 않았다면 `PENDING_MIGRATION_COLUMN_REFERENCED_BY_FOREIGN_KEY`로 해당 ALTER statement 전체를 차단한다. column이 FK의 referencing 쪽 local column이면 해당 local FK dependency를 제거하고, 외부 참조는 `CASCADE`로 제거될 때 dependency state에서도 제거한다. `CASCADE`는 다른 table의 FK를 자동으로 제거할 수 있지만 그 효과는 별도 cascade-unverified gate로 남긴다. 근거: [PostgreSQL 18 ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html), [Modifying Tables](https://www.postgresql.org/docs/18/ddl-alter.html).
ALTER TABLE의 같은 statement 안에 있는 `DROP COLUMN ... CASCADE`는 해당 컬럼을 참조하던 FK dependency를 제거하므로, 그 자체를 RESTRICT FK blocker로 계산하지 않는다. 여러 DROP action이 있으면 parser의 action 순서에 맞춰 CASCADE의 알려진 FK 제거를 적용한 뒤 뒤따르는 RESTRICT action을 평가한다. public-only audit 범위 밖 schema는 FK blocker로 오판하지 않고 기존 schema-unverified 진단에 맡긴다. PostgreSQL 18 공식 문서는 CASCADE 여부가 dependent object 제거에 영향을 주고 여러 subcommand의 효과가 명령 순서를 따를 수 있음을 설명한다 ([ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html)).
ALTER constraint drop FK preflight는 statement 시작 시의 catalog state만으로 모든 DROP을 독립 평가하지 않는다. FK constraint 제거, unique-key CASCADE 제거를 복제 dependency map에 action 순서대로 투영한 뒤 이후 unique/primary constraint RESTRICT drop을 판정한다. 따라서 self-referencing FK를 먼저 제거한 다음 참조 key를 제거하는 같은 ALTER 문은 통과하고, 역순은 FK dependency 진단으로 차단한다. 이 투영은 source-order simulator만 변경하며 실제 DB에는 쓰지 않는다.

### Next.js instrumentation 빌드가 Node 전용 의존성을 Edge에 포함하는 경우

- **증상**: `next build`가 `pg-connection-string`의 `fs`, 또는 `pgpass`의 `path`/`stream`을 찾지 못한다고 실패한다. import trace가 `instrumentation.ts`에서 DB를 사용하는 worker까지 이어질 수 있다.
- **원인**: Next.js instrumentation은 Node.js와 Edge 양쪽에서 실행될 수 있다. root instrumentation 안에 Node 전용 worker를 동적 import하면 런타임 guard가 있어도 번들러가 두 런타임의 의존성을 따라갈 수 있다.
- **대응**: worker/DB 진입을 별도 `instrumentation-node.ts`에 두고 root `instrumentation.ts`에서 `process.env.NEXT_RUNTIME === "nodejs"`일 때만 그 파일을 동적 import한다. production 및 feature kill-switch 조건은 Node 파일에서 유지한다. 의존성 목록이나 route handler로 worker를 옮겨 공개 GET의 부수효과를 만들지 않는다.
- **검증**: `npm run build`를 실행해 Node builtins compile 오류가 사라지고 production build가 끝나는지 확인한다. 회귀 시 `npm run verify`의 build 단계에서 감지한다. 공식 패턴은 [Next.js Instrumentation guide](https://nextjs.org/docs/app/guides/instrumentation)를 따른다.

## Flyway split migration의 사후 relation 모양과 실행 전제 구분

- `auditUniverseSplitPreconditions`의 `postMigrationShapePresent`는 V85/V89의 현재 실행 전제조건과 관측된 사후 relation 모양을 별도 표시한다. 사후 모양은 compatibility view, candle relation, common/special 물리 테이블, 미국 legacy physical table의 존재/type만 본다. 이것이 있으면 과거 migration이 정상 완료됐다는 뜻이 아니며, history, row 내용, 필터 결과, 제약조건, 손실 위험은 증명되지 않는다.
- 현재 로컬 감사는 두 market 모두 사후 모양 존재로 관측되지만 source는 view이므로 재실행 structural precondition은 false다. migration 이력에는 해당 낮은 version이 적용됐다고 나타나지 않는다. 재실행이나 history 수동 조정 대신 환경별 이력과 데이터 근거를 별도로 대조한다.
- **자동 게이트**: `scripts/check-docs.mjs`는 split preflight에 사후 relation shape, 실행 structural preconditions, 그리고 history/data 검증 한계 설명이 모두 유지되는지 검사한다. relation shape 단위 테스트와 함께 출력 계약 변경을 감지한다.
- CLI 출력 경계도 검사한다. `scripts/audit-flyway-history.ts`가 `splitMigrationPreflight`를 최종 report에 실어야 내부 계산과 사용자가 보는 감사 결과가 분리되지 않는다.

## KIS 해외 체결추이의 `rt_cd` 누락 오판

- **증상**: `fetchKisUsTradeTrend`가 HTTP 200과 체결 행을 받았다는 이유만으로 성공 처리해, 응답의 `rt_cd`가 없는 비정상 envelope도 `ok: true`가 될 수 있었다.
- **근본 원인**: `rt_cd !== "1"`로 실패 코드 한 가지만 제외했다. KIS 공식 샘플의 `APIResp.isOK()`는 `rt_cd == "0"`일 때만 성공을 반환한다 ([한국투자증권 공식 open-trading-api 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/kis_auth.py)).
- **수정/영향**: 체결추이 성공 조건을 HTTP 성공 + `rt_cd === "0"` + 체결 행 존재로 제한했다. 실패 envelope에도 원시 응답과 파싱된 행은 진단용으로 유지하되 성공으로 표시하지 않는다.
- **재발 자동 감지**: `lib/kis-us-trade-trend.test.ts`가 `rt_cd="0"` 성공과 `rt_cd` 누락 시 실패 판정을 함께 검사한다.

## 미국 TOP 상승률의 KIS business error 성공 오판

- **증상**: `/api/stock/us/top-rising` upstream KIS가 HTTP 200으로 `rt_cd="1"`을 보내도 helper가 `ok: true`로 표시하고 route가 종목 배열과 HTTP 200을 돌려줄 수 있었다. `rt_cd`가 없는 오류 envelope도 같은 문제가 있었다.
- **근본 원인**: `fetchKisUsTopRisingApi`가 HTTP 상태만 검사했으며 KIS 응답 코드 확인을 생략했다. 한국투자증권 공식 예제의 `APIResp.isOK()`는 `rt_cd == "0"`만 성공으로 본다 ([공식 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/kis_auth.py)).
- **수정/영향**: helper 성공은 HTTP 2xx와 `parsed.rt_cd === "0"`을 모두 요구한다. 공개 route는 upstream 오류에 데이터 행 대신 `{ ok: false, error: "KIS_UPSTREAM_ERROR", upstreamStatus }`를 502로 반환하며, 토큰 부재 503과 성공 배열 200은 유지한다.
- **재발 자동 감지**: `lib/kis-us-api.test.ts`는 rt_cd 0, rt_cd 1, rt_cd 누락 응답을 검사하고, `app/api/stock/us/top-rising/route.test.ts`는 HTTP 200 provider error의 502 처리와 성공 배열 응답을 검사한다.
## KIS 미국 시세 응답의 업무 성공과 HTTP 성공 혼동

- **증상**: HTTP 200이더라도 KIS rt_cd가 "1"이거나 빠진 응답의 output 행을 분봉 조회기가 유효한 points로 반환할 수 있었다. 가격 상세 조회는 rt_cd가 없으면 기본값 "0"으로 처리해 성공·가격 유효 여부를 잘못 보고할 수 있었다.
- **근본 원인**: 분봉 ok는 HTTP 상태만 확인했고 페이지네이션은 continuation 페이지의 KIS code를 검사하지 않았다. 가격 상세는 rt_cd 누락을 성공으로 대체했다.
- **수정/영향**: 분봉은 첫 응답을 HTTP 2xx + rt_cd === "0"일 때만 points로 파싱하고, continuation도 같은 성공 코드를 확인한 뒤 누적한다. 가격 상세 ok도 HTTP와 명시적 KIS 성공 코드를 모두 요구하며, 오류 raw payload는 진단에 남기되 정상 quote/cache로 쓰지 않는다.
- **재발 자동 감지**: lib/kis-us-minute-turnover.test.ts가 KIS business error, rt_cd 누락, 실패 continuation page의 행 폐기를 확인한다. lib/kis-us-price-detail.test.ts는 HTTP 200 + business error 및 rt_cd 누락에 대해 ok:false와 저장 금지를 확인한다. 성공 코드 기준은 한국투자증권 [공식 APIResp 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/kis_auth.py)를 따른다.

## KIS HTTP 200 업무 성공 코드 누락을 성공으로 기록하는 문제

- **증상**: 공통 KIS 요청 계층이 HTTP 200과 `rt_cd`가 없는 JSON 응답을 성공 호출로 계측하고 정상 응답으로 adaptive throttle의 성공 횟수에 반영할 수 있었다. 빈 본문과 비 JSON 응답도 같은 프로토콜 문제다.
- **근본 원인**: 기존 분류기는 `rt_cd`가 존재하면서 `"0"`이 아닌 경우만 실패로 처리해, 누락된 업무 성공 코드와 JSON 파싱 실패를 통과시켰다.
- **수정/영향**: `lib/kis-request-throttle.ts`는 KIS 요청 결과의 파싱 payload가 존재하고 `rt_cd`를 문자열화한 값이 `"0"`일 때만 성공으로 분류한다. 오류 계측과 throttle 성공 횟수가 응답 계약 누락으로 오염되지 않는다.
- **재발 자동 감지**: `lib/kis-request-throttle.test.ts`가 rt_cd 누락 JSON, 숫자형 0, 빈 본문, 비 JSON 본문 및 업무 오류 코드를 검사한다.

## AMS 스캐너의 KIS 업무 오류 데이터 점수화

- **증상**: AMS 스캐너가 HTTP 200 + KIS 업무 오류 응답의 ranking rows를 후보로 사용하고, 상세·분봉 업무 오류의 필드 누락을 0으로 바꿔 점수화할 수 있었다.
- **근본 원인**: ranking 응답은 HTTP 상태만 보고 rows를 추출했으며, 개별 상세/분봉 응답에서는 HTTP와 `rt_cd` 성공 여부를 검사하지 않았다. 숫자 변환의 기본값 0이 오류 데이터를 정상 지표처럼 보이게 했다.
- **수정/영향**: ranking은 HTTP 성공과 `rt_cd === "0"`일 때만 소비하며 실패 시 빈 candidates와 오류 상태(HTTP 오류 또는 502)를 반환한다. 상세와 분봉 응답 중 하나라도 실패하면 해당 심볼을 후보·점수에서 제외하고 `failedSymbols`와 HTTP 502로 부분 실패를 알린다.
- **재발 자동 감지**: `lib/kis-ams-scout.test.ts`가 HTTP 200 ranking business error 및 detail/chart business error rows가 후보로 들어가지 않는지 검사한다.

## 국내 통합 탐지 스캔의 오류 행 사용 및 volume-power 라우팅

- **증상**: `/api/kis/detection-scan`은 `getRows` 기반 source의 `ok:false`를 무시해 오류 응답 rows를 합산하고 snapshot을 `AVAILABLE`로 저장할 수 있었다. 또한 허용 목록에 있는 `volume-power` source가 전용 API가 아니라 마지막 `market-value` 분기로 잘못 전달됐다. 단일 source route도 실패 응답의 rows를 그대로 내보낼 수 있었고 두 탐지 route 모두 활성 보통주 마스터와 대조하지 않았다.
- **근본 원인**: 통합 스캔이 개별 source의 성공 여부를 추적하지 않았고, `volume-power` 분기 및 endpoint 호출이 빠져 있었다. 단일 route는 결과 상태와 무관하게 `result.rows`를 정규화했다. 거래소 순위 응답을 official common-stock classification으로 오인했다.
- **수정/영향**: `lib/kis-investor-flow.ts` 공통 `getRows`는 HTTP와 KIS 업무코드가 모두 성공일 때만 rows를 내보낸다. 두 route는 활성 `COMMON_STOCK` 공식 종목 마스터 코드에 속한 결과만 반환하며 마스터 조회 실패 시 503 fail-closed한다. 단일 route는 실패 시 rows를 비우고 snapshot을 UNAVAILABLE로 기록한다. 통합 route는 각 flow source 성공 여부를 검사해 실패 rows를 제외하고 `failedSources`, 전체 `ok:false`, HTTP 502와 UNAVAILABLE snapshot을 반환한다. `volume-power`는 전용 KIS API를 호출한다.
- **재발 자동 감지**: `lib/kis-investor-flow.test.ts`는 HTTP 200 업무 오류 rows 폐기를 검사한다. `app/api/kis/detection-candidates/route.test.ts`는 오류 rows 차단, active common-stock 필터 및 마스터 장애 fail-closed를 검사한다. `app/api/kis/detection-scan/route.test.ts`는 실패 source 차단, volume-power 라우팅, 마스터 필터와 장애 fail-closed를 검사한다.

## 국내 상승률·장중·legacy KIS scanner의 보통주 마스터 누락

- **증상**: 국내 top-rising API와 장중 worker가 KIS ranking rows를 공식 활성 `COMMON_STOCK` master와 대조하지 않고 제공/추적할 수 있었다. `kis.ts`의 legacy scanners도 KIS 결과와 오래된 DB 캐시를 그대로 반환해 비보통주가 화면 후보로 남을 수 있었다.
- **근본 원인**: ranking API의 stock-like output을 공통주·활성 분류의 공식 근거로 간주했다. 기존 cache fallback 역시 현재 master 상태를 재검증하지 않았다.
- **수정/영향**: `filterActiveKrCommonStockRows`가 queryEligibleUniverse의 공식 KR active common-stock 코드 집합과 대조한다. `/api/stock/kr/top-rising-chart`는 메모리 snapshot과 KIS fallback 모두를 필터링하고, worker는 국내 후보를 적재하기 전에 필터링한다. 열린 시장의 후보 refresh가 실패하면 그 시장의 이전 snapshot을 비워 오래된 국내 코드가 계속 처리되지 않게 한다. `kis.ts`의 다섯 국내 스캐너는 live ranking 결과를 부가 API 조회·cache write 전에 필터링하며, 캐시 반환 시에도 재확인한다. 마스터 조회 실패는 빈 후보 또는 503 fail-closed로 처리한다.
- **재발 자동 감지**: `lib/instrument-eligibility.test.ts`는 active master filtering과 master 조회 실패를 검사한다. `app/api/stock/kr/top-rising-chart/route.test.ts`는 memory/live 소스 필터 및 503 동작을 검사한다. worker의 domestic candidate loader와 `kis.ts` scanner/cache filtering은 typecheck 및 관련 module regression suite에서 확인한다.
## 2026-11-14 RSS 조회 DB 오류와 원문 fetch 진단 부족

- **증상**: 관리자 RSS 조회의 DB 장애가 HTTP 400 입력 오류로 표시되고, 원문 피드 fetch 실패에서 source/stage 정보가 부족했다.
- **근본 원인**: 날짜 필터 검사와 DB 조회가 같은 예외 경계에 있었고, catch에서 DB/select 실패를 입력 오류와 구분하지 않았다. 원문 단일 source fetch catch도 공통 최상위 오류 경계만 제공했다.
- **해결**: 날짜/시간 검증을 DB 조회 전에 수행해 잘못된 입력은 400으로 유지한다. 실제 기사 SELECT 실패는 안전한 `describeError` 코드와 DB 객체 식별자를 반환하는 HTTP 503/no-store로 분리한다. 원문 source 조회 실패는 `source`, `fetch_or_parse` 단계를 응답에 포함한다.
- **재발 자동 감지**: `app/api/admin/stocktitan-rss/route.test.ts`가 invalid date 400과 SQLSTATE 42P01의 503·구조화 진단을 검증한다. `app/api/admin/market-rss-test/route.test.ts`가 source 단계별 오류 응답을 검증한다.
- **남은 위험/검증**: API level source 조회는 fetch와 XML parse를 단일 `fetch_or_parse` 단계로 보고한다. 외부 응답 본문/헤더 전문과 인증값은 노출하지 않는다. 실제 운영 오류 재현은 하지 않았고, 이번 변경 검증은 mock 테스트로 한정한다.


### 원문 RSS 단계별 실패 코드

- `fetchMarketRss`는 HTTP 요청, timeout, non-2xx, response body read, XML/feed parse를 서로 다른 `stage`/`errorCode`로 분류한다. multi-source 조회와 관리자 signal test는 raw exception 대신 해당 코드와 HTTP upstream status만 제공한다. 관리자 단일-source 응답도 이 구조화 결과를 사용하며 provider/DB 예외 응답은 free-form message를 반환하지 않는다.
- `lib/market-rss.test.ts`의 timeout 기대값과 관리자 조회 응답 검증을 새 진단 계약에 맞춰 갱신했다. 이번 연속 수정 뒤 `npm.cmd run typecheck`는 통과했다. 테스트 실행 및 실제 provider/운영 재현은 이번 연속 수정에서 하지 않았다.

### RSS 호재 진단이 source fetch 실패를 성공으로 표시

- **증상/원인**: `/api/admin/market-rss-signal-test`는 개별 RSS source 실패를 results에만 넣고 최상위 `ok:true`/HTTP 200을 반환해 API 테스트 패널의 실패 경고를 발생시키지 않았다. 보조 ticker/body catch는 비정제 예외 메시지를 반환할 수 있었다.
- **해결/재발 방지**: source 실패 source 목록/count를 최상위에 올리고 HTTP 502와 `RSS_SOURCE_FETCH_FAILED`를 반환한다. 성공한 source 분석 결과는 함께 유지한다. ticker/body 오류는 `safeErrorMetadata`의 단계 및 코드만 노출한다. 테스트 패널은 실패 source 이름을 경고에 표시한다.
- **검증/남은 위험**: typecheck 통과. 외부 RSS/SEC 요청과 UI runtime은 미실행. market reaction resolver 실패는 이번 변경 범위 밖이다.

### 관리자 단일 source RSS FETCH_ONLY 번역 추적 client 누락

- **원인/영향**: 번역 테스트 route가 추적 client를 생성하고도 단일-source FETCH_ONLY 변환 함수에 전달하지 않았다. provider 선택과 usage metrics가 PREVIEW/multi-source 경로와 달라질 수 있었다.
- **해결/재발 방지**: `withTranslation`에서 선택된 client를 `translateMarketRssItems`에 전달한다. 외부 provider 연결은 요청된 테스트 실행에서만 일어나도록 유지한다.
- **검증/한계**: typecheck 통과. route 테스트와 실제 provider 호출은 미실행이므로 사용량 metrics runtime 결과는 미확인이다.

### 관리자 RSS 번역 실패에서 provider 계측 누락

- **원인/영향**: provider 설정과 usage tracker가 try-local 변수여서 번역 실패 catch가 실행되면 오류코드 외 configuration 및 호출량을 반환하지 못했다.
- **해결/재발 방지**: route 상태를 catch에서 사용할 수 있게 두고 생성된 configuration과 `getMetrics()`를 오류 응답에 포함한다. 오류 메시지·비밀 설정 값은 노출하지 않는다.
- **검증/한계**: typecheck 통과. 번역 provider 호출 및 route runtime은 미실행이다.

### 단일 RSS fetch 실패 응답에서 번역 진단 metadata 누락

- **원인/영향**: 번역 test route가 feed fetch 전에 설정하는 provider configuration 및 usage tracker를 fetch 실패 경로에서 반환하지 않아 번역 debug 요청에서 설정/계측 상태를 확인하기 어려웠다.
- **해결**: fetch 오류 응답은 translation 요청 여부와 이미 만들어진 configuration/usage를 유지한다. 단 fetch가 실패하면 provider usage는 해당 시점까지 관측된 값만 나타내며, raw error message는 노출하지 않는다.
- **검증/한계**: typecheck 통과. 실제 provider 및 upstream 요청은 미실행이다.

### RSS parser 오류 계약 변경 뒤 이전 message 기대 테스트

- **증상/원인**: HTTP 200 HTML response 테스트가 parser의 원문 한국어 message를 기대했지만 fetch boundary는 이를 `MarketRssFetchError`의 안정 코드와 단계로 변환했다.
- **해결**: 회귀 기대를 `parse` / `RSS_FEED_FORMAT_INVALID` / upstream 200 구조에 맞췄다. fetch 오류 응답의 안정·비밀 비노출 계약을 유지한다.
- **검증/한계**: 실행 당시 관련 26개 중 25개 통과하고 이 assertion만 불일치했다. 수정 후 재실행하지 않아 최종 green 결과는 아직 없다.

- **후속 검증 (2026-11-14)**: parser 진단 assertion 수정 후 RSS 관련 4개 테스트 파일 26개 모두 통과했다. 이 결과는 mock 기반으로 upstream/외부 provider 동작을 증명하지 않는다.

### RSS 신호 테스트 market-reaction raw 오류 응답

- **원인/영향**: 보조 KIS market reaction resolver가 raw exception을 `error` 문자열로 담아 반환할 수 있었고 관리자 signal test는 이를 그대로 serialize했다.
- **해결**: route response는 raw `error` 필드를 버리고 machine-code 형태 문자열은 유지하며 자유 형식 오류는 `safeErrorMetadata`의 코드로 치환한다.
- **검증/한계**: typecheck 통과. resolver API test와 UI runtime/실제 KIS 호출은 미실행이다.

### RSS signal test 보조 resolver 실패가 성공 상태로 숨겨짐

- **증상/원인**: top-level `ok`가 feed source 상태만 집계해 ticker resolution, SEC body 및 KIS reaction 오류가 있어도 전체 테스트가 성공처럼 보일 수 있었다. 관리 패널은 HTTP status만 확인해 HTTP 200 + `ok:false`를 실패로 취급하지 않았다.
- **해결**: route가 각 resolver 실패를 단계별 집계하고 `ok:false`, 실패 단계/count를 반환한다. source upstream 실패는 502, 보조 분석 단계 실패는 결과 데이터 보존을 위해 HTTP 200과 `ok:false`로 반환한다. API test panel은 application-level `ok:false`도 사용자 경고로 표시한다.
- **검증/한계**: typecheck 통과. 실제 UI 및 외부 resolver 실행은 미검증이다.
## DART RSS 조회 오류

- **증상**: DART RSS 응답이 HTML/잘린 XML/과대 본문이면 빈 결과처럼 표시되거나 파서 예외가 API의 일반 503으로만 묶일 수 있다. 같은 영수증이 중복 노출되거나 클라이언트 polling 요청이 겹칠 수도 있다.
- **진단 순서**: `/api/dart`의 HTTP 상태와 서버 로그의 오류 메시지를 확인한다. 업스트림 상태 코드, Content-Type, XML 구문, 본문 제한 초과를 구분한다. 클라이언트는 응답 `source/items/fetchedAt` 구조와 visibility 기반 polling 상태를 확인한다. 자격증명·RSS 원문을 로그에 기록하지 않는다.
- **재발 방지**: 조회는 10초 timeout, 2 MiB 본문 제한, 허용 Content-Type 검사, XML validator 및 RSS channel 검사로 fail-closed한다. 파서도 날짜 키·본문 크기·유효 XML을 확인하고 영수증 번호를 기준으로 중복을 제거한다. UI는 요청 중복을 막고 unmount 시 취소하며 polling 주기를 10~300초로 제한한다.
- **자동 감지**: `lib/rss.test.ts`는 잘못된 XML/날짜, 크기 제한, 중복 영수증, 비 XML 응답 및 잘못된 성공 응답을 회귀 검사한다. `use-feed-data.ts`의 클라이언트 검증/요청 직렬화는 feed-page 통합 검증 시 확인한다.

## OCI standalone `distDir` 경로 불일치

- **증상**: production build는 성공하지만 배포 검증에서 instrumentation 파일을 찾지 못하거나, 배포 뒤 새 HTML의 JS 청크가 404가 될 수 있다.
- **근본 원인**: 배포 검증은 격리 빌드 디렉터리 `.next-deploy-verify`를 쓰는데 standalone 산출물의 실제 구조는 `standalone/.next-deploy-verify/{server,static}`이다. verifier·GitHub Actions packaging·이전 릴리스 자산 보존이 기본 `.next`를 가정하면 검사와 실제 runtime 경로가 어긋난다.
- **해결/재발 방지**: `scripts/verify-deploy.mjs`, `.github/workflows/deploy-oci.yml`, `deploy/oci/stockman-activate`가 같은 configured `distDir` 아래 instrumentation 및 hashed static 자산을 확인·복사·보존한다. distDir 변경 시 standalone smoke와 OCI archive 경로 검사를 함께 갱신한다.
- **자동 감지**: `npm run deploy:verify`는 standalone instrumentation 존재, 서버 실행, `/charts` 정적 청크 응답과 브라우저 hydration을 확인한다. workflow archive step은 instrumentation과 static chunk 경로를 tar 목록에서 검사한다.

