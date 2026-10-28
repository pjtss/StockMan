# 오류 상황 및 해결 방법

## 2026-10-28 종목 뉴스 요약에 RSS HTML 태그 노출

- **증상**: 종목 뉴스 요약에 `<b>` 등의 HTML 태그가 문자 그대로 보였다.
- **근본 원인**: V161에서 정규화 요약 컬럼을 도입했지만 `/api/stock/news`는 raw `summary`만 조회해 반환했다. 차트 모달은 반환 요약을 표시하므로 SEC 피드의 HTML 메타데이터가 UI까지 전달됐다.
- **영향 범위**: `/api/stock/news`를 사용하는 종목 뉴스 소비자. 운영 GET으로 10개 티커를 조회해 6건의 SEC 요약에서 태그를 재현했다.
- **해결 위치**: API는 `normalized_summary`를 우선 사용하고, 과거 레코드에는 기존 `extractMarketRssCoreSummary`로 조회 시 정규화한다. 정규화 컬럼이 손상돼도 같은 경로로 안전하게 정리하고 DB 전용 필드는 응답에서 제외한다.
- **재발 자동 감지**: `app/api/stock/news/route.test.ts`에서 정규화 우선, 과거 SEC 메타데이터 fallback, 손상된 정규화 값 제거를 확인한다. 각 사례의 직렬화 응답에 HTML 태그가 없고 `normalizedSummary` 속성이 노출되지 않아야 한다. `npm run deploy:verify`에 테스트/build/runtime smoke를 포함한다.
- **검증 결과**: 운영 재현 6/10개 티커(10개 티커 샘플에서 6건), 수정 API 회귀 테스트 3건 통과. 전체 배포 게이트 및 배포 후 운영 재검증 대기.
- **남은 위험 및 다음 개선**: 사용자 입력/출처별 특수한 태그 없는 메타데이터 변형은 계속 유입될 수 있으므로 운영 GET 표본 및 회귀 테스트로 감지한다. 기존 DB 행은 직접 수정하지 않으며 read-time fallback으로 보호한다.

## 2026-10-27 RSS 정규화 컬럼 추가 후 운영 health 오탐

- **증상**: RSS 정규화 V161 배포 workflow는 성공했지만 공개 `/api/health`가 `degraded`를 반환했다.
- **근본 원인**: `normalized_summary`를 `REQUIRED_OPERATIONAL_COLUMNS`에 추가하면서 `inspectDatabaseSchema()`의 information_schema 조회는 네 개 컬럼 쌍만 하드코딩한 채 남아 있었다. 실제 DB에 새 컬럼이 있어도 검사 결과의 available 목록에 들어오지 않아 schema readiness가 false가 됐다.
- **영향 범위**: readiness/health 보고가 잘못 degraded가 되며 실제 RSS ingest의 저장 컬럼과 Flyway migration에는 문제가 없었다. 사용자는 운영 health 상태를 신뢰할 수 없었다.
- **해결 위치**: `lib/schema-health.ts`에서 필수 컬럼 목록을 `unnest($1::text[], $2::text[])` 입력으로 직접 조회하도록 바꿔 스키마 요구 목록과 조회 조건을 단일 기준으로 연결했다.
- **재발 자동 감지**: `lib/schema-health.test.ts`는 조회 파라미터에 `normalized_summary`가 포함되고 모든 필수 컬럼이 조회되면 readiness가 true가 되는지 확인한다. 배포 검증은 전체 테스트, typecheck, build/runtime smoke를 포함한다.
- **검증 결과**: `npm run deploy:verify` 재실행 후 운영 health 200 및 V161 확인 대기.
- **남은 위험 및 다음 개선**: 수정 배포 완료 뒤 `/api/health`를 재조회한다. 이 공개 API는 상세 migration 번호를 숨기므로, HTTP 200은 전체 schema readiness 확인으로 쓰고 구체 Flyway 버전은 workflow migration 성공 로그 또는 인증된 health 진단으로 별도 확인한다.

## 2026-10-26 미국 산업별 거래대금 관리자 집계 API 조회 오류

- **증상**: 배포된 `GET /api/admin/us-industry-turnover` 첫 운영 조회가 nginx `504 Gateway Time-out`으로 끝났다. 첫 쿼리 최적화 후에는 HTTP 200이었지만 `eligibleWithPeriodCandlesCount=0`으로 빈 표를 잘못 반환했다.
- **근본 원인**: 운영 캔들 테이블의 `candle_date`는 TEXT의 `YYYYMMDD` 형식이다. 최초 쿼리의 `c.candle_date::date` 조건은 `(market, code, timeframe, candle_date)` 복합 인덱스 범위 탐색을 방해했고, 첫 최적화는 실제 `YYYYMMDD` 값에 ISO `YYYY-MM-DD` 경계를 비교해 모든 기간 캔들을 제외했다. 보통주별 최신일 탐색을 반복한 것도 첫 최적화 응답에 31초가 걸린 원인이었다.
- **영향**: 조회 전부 읽기 전용이라 저장 변경은 없다. 첫 HTTP 200 응답은 5,163개 대상 종목 중 기간 캔들 0개 및 산업 그룹 0개를 반환했으며 거래대금 표로 사용하지 않았다.
- **해결 위치**: `app/api/admin/us-industry-turnover/route.ts`에서 최신 날짜는 종목별 최신 일봉 요약 테이블에서 얻고, 전체 대상은 정렬된 200종목 페이지로 나누어 원본 기간 캔들과 조인한다. 첫 페이지에서만 전체 캔들 커버리지를 산출한다. 날짜 경계는 `TO_CHAR(date, 'YYYYMMDD')`로 실제 저장 형식에 맞춘다.
- **재발 자동 감지**: API 회귀 테스트가 `YYYYMMDD` 범위, read-only SQL, 200개 상한과 offset 경계를 확인한다. 운영 페이지별 응답시간, 페이지 간 기준일/eligible 수 일치, 마지막 `nextOffset=null`, 기간 캔들 커버리지 및 원천별 합계를 확인하고, 운영 DB 직접 접속 없이 API 응답으로 진단한다.
- **검증 결과**: 최초 504와 31,273ms 빈 응답은 운영 관리자 API로 관측했다. 전체 일괄 쿼리는 최적화 후에도 운영에서 504였다. 200개 종목 단위 offset 읽기로 다시 개선 중이며 route 회귀 테스트 5개와 전체 `npm run deploy:verify`(1,538 tests, build/runtime/browser smoke 포함)를 통과했다. 분할 버전은 배포 전이므로 운영 API 페이지별 응답 및 합계는 재검증해야 한다.
- **남은 위험 및 다음 개선**: 단일 페이지가 504면 페이지 크기를 더 낮춰 재검증한다. 모든 페이지의 기준일·대상 수가 불일치하면 합산하지 않는다. `close × volume`은 `trading_value`가 없는 행의 대체 추정치로 표시한다.

## 2026-10-25 KIS 미국 업종 동기화의 운영 universe 미정합

- **증상**: KIS 업종 UPDATE 결과의 코드 불일치는 0이지만, KIS 보통주 후보 일부가 저장되지 않고 KIS 원본과 무관한 활성 `COMMON_STOCK` 행이 남아 전체 보통주 업종 저장을 보장할 수 없었다.
- **근본 원인**: 기존 동기화가 양쪽 테이블 교집합에만 `industry_code`를 UPDATE했으며 KIS 후보를 신규 반영하거나 잘못 활성화된 common·특수상품 partition을 함께 정합화하지 않았다.
- **해결 위치**: `lib/us-industry-code-sync.ts`의 KIS full sync에서 NAS/NYS/AMS 전체 후보 및 특수행 upsert, 외부 활성 common 비활성화, 사후검증을 단일 transaction/advisory lock으로 묶는다. `lib/instrument-universe-import.ts`는 KIS 비주식·ETP·알 수 없는 유형을 fail-closed 처리한다.
- **재발 자동 감지**: 업로드 사후에 `missingCount=0`, `mismatchCount=0`, `activeDatabaseOnlyCount=0`, special source missing `0`을 transaction 안에서 강제하고, 운영 `mode=audit` read-only 결과로 다시 대조한다. KIS 원본 코드 `000`은 미분류로 보존한다.
- **운영 검증 결과(2026-10-25)**: 배포 `f84c842f` 후 `.env.local` 관리자 인증으로 공식 마스터를 업로드했다. KIS 후보 common 5,358건 upsert, special 7,533건 upsert, 이전 후보 외 활성 common 1,436건 비활성화 후 독립 read-only audit에서 후보 누락·후보 외 활성 common·업종 코드 불일치가 모두 0이었다.
- **영향 및 남은 위험**: 이전 common 행은 삭제하지 않고 비활성화해 이력을 보존한다. 후보 밖 148행은 KIS 마스터에서 확인할 수 없어 원인 미확정 상태로 비활성 유지한다. KIS 원본 `000` 2,724건은 유효 업종 코드가 아니며 이름이나 외부 공급자로 보정하지 않는다. KIS 마스터의 분류 범위 변경은 다음 full sync 때 동일한 전수 검증 기준으로 감지한다.

## 2026-10-25 RSS 제목 숫자 번역과 backlog 배치 설정

- **증상**: 운영 RSS가 Azure로 제목을 한국어 번역했지만 `Third Quarter`를 `3분기`로 바꾼 숫자를 미번역 숫자로 오인해 `translation_numeric_hallucination`으로 차단했다. 동시에 RSS timer 실행은 회당 세 건만 시도해 과거 대기열이 느리게 진행됐다.
- **근본 원인**: 숫자 무결성 검사는 아라비아 숫자가 원문에 없으면 모두 환각으로 간주했다. 배치 설정은 Next.js 앱 프로세스의 `/etc/stockman/stockman.env` 값에 의존했으며, HTTP를 호출하는 RSS oneshot 서비스에 설정을 추가해도 이미 실행 중인 앱 프로세스에는 전달되지 않았다.
- **해결 위치**: `lib/translate-market-rss-item.ts`는 원문에 있는 영어 기수·서수와 월 이름에 대응하는 숫자 변환만 허용하고, 원문과 무관한 숫자 및 새 금융 부호는 계속 차단한다. `app/api/cron/market-rss/route.ts`는 앱 환경변수와 무관하게 번역·알림 배치 크기를 20건으로 고정한다.
- **재발 자동 감지**: `lib/translate-market-rss-item.test.ts`는 `Third Quarter` → `3분기`를 허용하고 출처에 없는 숫자를 계속 거부한다. `app/api/cron/market-rss/route.test.ts`는 batch 환경변수가 3이어도 20건을 전달하는지 검사하며, `scripts/check-oci-cron.mjs`는 RSS route의 batch 상수를 검사한다. 배포 후 최근 실행에서 `attempted=20`, `translated`·`notified.sent` 증가와 `backlogRemaining` 감소를 확인한다.
- **영향 범위와 남은 위험**: 이번 원인으로 차단된 제목은 한국어 번역 검증 통과 전까지 Discord에 전송되지 않았다. Google 앱 월 한도는 300,000자 중 299,992자가 예약되어 fallback이 사실상 중단됐으며, Azure 사용 가능량은 진단 당시 약 1,518,453자였다. 불완전 번역 등 다른 품질 실패는 여전히 보류된다. 30일 운영 조회에서는 GlobeNewswire 20건, StockTitan 2,174건, SEC 3,028건의 PENDING이 확인됐으며, 30일보다 오래된 항목 수는 별도 집계되지 않았다.
- **다음 개선**: 새 배포 후 세 출처의 실제 제목 번역 및 Discord 수신을 관찰하고, 30일을 넘은 backlog까지 완전히 소진됐는지 운영 상태에서 확인한다. 번역 서비스 한도는 사용자 승인 없이 높이지 않는다.

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
- 사용자가 수동 갱신을 요청한 경우 스케줄을 우회하는 인증된 수동 실행 경로를 사용한다.

### 전체 갱신이 지나치게 오래 걸림

- 원인: 국내 유니버스 전체에 종목별 KIS 요청을 수행하기 때문이다.
- 해결: 동시성은 KIS 제한을 넘지 않도록 유지하고, 진행률·최근 코드·성공·실패·예상 잔여 시간을 확인한다.
- 중단 시 이미 저장된 성공 캔들은 보존하며, 실패 항목은 retry queue에서 재처리한다.

## DB 오류

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

