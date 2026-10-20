# 미사용 기능 후보 조사 (2026-10-20)

## 조사 범위

로컬 후보 커밋 `680f2a2d` 자체의 삭제 파일 67개를 검토했다. 현재 `origin/oci..HEAD` range 전체의 삭제 상태는 70개이며 별도 기준이다. 원격 추적 ref `8d0c0782`는 로컬보다 6개 커밋 앞서고 로컬 전용 커밋은 2개다. 이 조사는 삭제 목록 근거이지 병합·배포 결정이 아니다.

정확한 API 경로, 소스 import, 화면 경로, `scripts/oci-cron.sh`, RSS scheduler, 정적 KIS 경계 검사 참조를 확인했다. `sec`처럼 일반적인 단어의 부분 문자열 검색은 오탐이 많아 판정 근거로 사용하지 않았다.

## 이미 비활성 상태였던 화면/API

- `app/dart/opendart-fast/page.tsx`와 `/api/dart/opendart-fast`: 기존 화면은 비활성 안내였고 API는 410을 반환했다.
- `app/sec/page.tsx`: 기존 화면은 `FeatureDisabled` 안내였다. SEC 자동 수집과는 별개 경로다.
- `app/scanners/us/page.tsx`: 기존 화면은 미국 종합 스캐너 비활성 안내였다. 내비게이션의 해외 상승률 TOP 100은 별도 `/us-top-rising`이며 유지된다.

이 항목은 기능 실행이 이미 중단된 상태에서 남아 있던 안내 화면/라우트의 삭제에 해당한다.

## 내부 참조가 발견되지 않은 후보

다음 파일은 repo의 정확한 import/URL·라우트·cron 참조에서 연결이 확인되지 않았다. 따라서 정적 코드 기준 후보로는 보이나, 외부 호출자와 수동 운영 절차까지 확인된 것은 아니다.

- UI 컴포넌트: `charts-entry-dragon.tsx`, `keyword-manager*`, `market-sentiment*`, `sector-map*`, `score-ranking*`, `stock-alert-manager.tsx`, `theme-toggle*`.
- 라이브러리 모듈/테스트: `alpaca-client.ts`, `candidate-score*`, `data-quality.ts`, `discord-news-radar.ts`, `discord-us-obv.ts`, `kr-accumulation-screener.ts`, `kr-instrument-product*`, `libretranslate-client*`, `notification-history.ts`, `opendart-details*`, `opendart-fast*`, `sec-automation*`, `sec-feed.ts`, `sec-filing-processor*`, `sec-filters.ts`, `sec-mappers.ts`, `sec-xbrl-analysis.ts`, `sec-discord-result.ts`, `us-accumulation-screener.ts`, `us-trade-intensity-alert*`, `us-turnover-snapshot-state*`.

일부 테스트는 운영 코드 참조가 아니라 KIS 경계 감사 스크립트의 파일 목록으로만 등장한다. 정적 검사에 걸리지 않았다고 외부/수동 소비자가 없다는 뜻은 아니다.

## 삭제 전 추가 확인이 필요한 항목

- `/api/dart/details`와 `lib/opendart-details`: 내부 `/api/dart/details` 호출은 발견되지 않았지만, 기존 API는 기업 공시 상세를 실제 조회했다. 외부 소비자가 있는지는 저장소만으로 확인할 수 없다.
- `lib/kis-ipo-listing-schedule.ts`와 테스트: 현재 runtime import가 없고 `/api/listings`는 KRX KIND 저장 데이터를 사용한다. 모듈은 registry와 기능 코드에서 제거됐지만 boundary audit의 테스트 매핑이 남아 있어 이를 정리했다. 외부 직접 호출 여부는 저장소만으로 확인할 수 없다.
- `lib/kis-us.ts`: `kis-us-api.ts`와 다른 모듈이다. 삭제 diff의 정확한 import 문을 별도로 확인해야 하며, 다른 현재 미국 KIS 모듈이 사용 중인 사실과 혼동하면 안 된다.
- `admin-kis-test.tsx`, `admin-us-instrument-products.tsx`: 각각 컴포넌트 직접 연결은 없었지만 관리자에서 같은 사용자 기능을 대체하는 API가 있는지는 기능 단위로 확인해야 한다.

## 운영 경로에서 계속 동작하는 SEC 기능

`/sec` 비활성 안내 화면 삭제를 SEC 전체 비활성화로 해석하면 안 된다. `scripts/oci-cron.sh`는 `/api/cron/sec-edgar`를 호출하고, RSS cron은 `/api/cron/market-rss`를 실행한다. 따라서 SEC 운영 자동화는 별도 모듈 경로로 계속 동작하며 이 동작을 제거하는 변경은 사용자 확인 없이 미사용으로 판정할 수 없다.

## 결론 및 당시 검증 상태 (2026-10-20 초기 조사)

- 67개 삭제 파일 중 이미 비활성인 화면/API, 내부 참조가 발견되지 않은 정적 후보, 실제 조회 API, 운영 자동화와 관련된 파일을 구분했다.
- 내부 참조가 없다는 결과는 저장소 안에서만 성립하며 외부 소비자·사람이 실행하는 작업까지 증명하지 않는다.
- 당시 초기 checkout에서는 전체 빌드/테스트/실행 검증을 수행하지 않았다. 이후 원격 변경 통합 및 배포 검증 결과는 아래 최신 운영 재확인 절을 참조한다.
- 당시 조사 시점에는 코드 변경, 커밋, 푸시, 배포를 하지 않았다. 이후 통합·배포 상태는 아래 최신 운영 재확인 절에 기록했다.

## 원격 통합 전 추가 확인 내역 (2026-10-20 초기 조사)

V156 검토는 원격 snapshot `29d847b6`의 코드 근거를 사용했다. 현재 remote-tracking ref `8d0c0782`이며 로컬 후보 커밋과는 2개 ahead·6개 behind로 갈라져 있다.

- `db/migration/V156__instrument_fundamental_attempt_timestamp.sql`: 미사용이 아니다. 원격 최신 `8d0c0782`에 migration이 있으며 `lib/instrument-fundamental-progress.ts`가 `last_attempt_at`을 갱신하고 진단 모듈이 읽는다. migration만 제외하면 progress update가 실패할 수 있어 V156을 원격에서 복원했다.
- `lib/market-rss-discord-policy.ts`: 필수 운영 정책이다. `lib/discord-delivery-retry.ts`의 재시도 발송이 `SEC_EDGAR`·`STOCKTITAN` 외 출처를 건너뛴다. 신규 발송뿐 아니라 이미 큐에 들어간 과거 payload에도 allowlist를 적용하는 보호 경계다. 이 정책과 테스트 삭제는 미사용 정리가 아니다.
- `app/api/dart/details/route.ts` 및 `lib/opendart-details.ts`: route 내부에서 상세 조회를 직접 호출하고 기능 테스트가 다수 있다. 저장소 외부 호출 여부는 모른다. 내부 client가 없다는 점만으로 API가 미사용이라고 할 수 없다.
- `lib/kis-us.ts`: 현재 소스에서 모듈을 import하는 경로는 찾지 못했다. 다만 파일 내용은 KIS 해외 상승률·체결강도 랭킹과 Yahoo Finance fallback을 포함해 사용자 노출 기능을 직접 구현한다. 현대 `kis-us-api.ts` 등으로 대체된 것으로 보일 수 있지만, `git grep`으로 정확한 import를 확인하고 API/관리자 호출 경로가 서로 다른지 확인한 뒤 제거해야 한다.
- `lib/kis-ipo-listing-schedule.ts`: 현재 runtime import가 없고 `/api/listings`는 KRX KIND를 조회한다. 삭제된 어댑터의 boundary audit 매핑은 정리했으며, 외부 직접 호출자는 미확인이다.
- `/api/dart/opendart-fast`는 기존 410, `/dart/opendart-fast`, `/sec`, `/scanners/us`는 비활성 안내 화면이어서 런타임 기능 자체가 이미 비활성인 후보로 볼 수 있다. `/scanners/us`와 별도 `/us-top-rising`을 혼동하면 안 된다.

`680f2a2d`에는 V148, V149의 중복 migration 번호도 있어 `docs:check`의 migration 검증이 실패한다. 원격 최신 커밋 위에 맞춘 뒤 번호와 migration 적용 여부를 재검토해야 한다.

## 초기 checkout 기준 미사용 runtime 코드 후보

현재 로컬 checkout `680f2a2d`의 `app/`, `components/`, `lib/`, `scripts/`에서 TypeScript AST로 정적 import·export·dynamic import 경로를 따라갔다. 앱 route/page와 운영 script를 진입점으로 삼고 test 파일은 제품 runtime 도달성에서 제외했다. 검사 대상 955개 source file 중 entry root 291개, root에서 도달 가능한 656개를 확인했다. 이 결과는 정적 분석이므로 string-built dynamic import나 외부 consumer는 별도 확인 대상이다.

아래 5개 runtime 파일은 현재 app/운영 script entrypoint에서 도달하지 않았다. 모두 보존 여부를 사람이 정할 수 있도록 후보로만 제시한다.

- `lib/keywords.ts`: 유닛 테스트에서만 import된다. 과거 `keyword-manager` UI가 현재 제거되어 localStorage helper를 부르는 runtime 경로를 찾지 못했다.
- `lib/stock-alerts.ts`: `rss_stock_alerts` localStorage 설정을 다루지만 UI·API·runtime import가 없다.
- `lib/sentiment.ts`: `market_sentiment_history` localStorage 이력 helper를 호출하는 runtime이 없고 테스트만 남아 있다.
- `lib/sectors.ts`: 섹터/시장 심리 분류 함수의 runtime import가 없고 테스트만 남아 있다.
- `lib/market-rss-discord-message.ts`: runtime import가 없다. 현재 Discord 재시도는 `market-rss-notification-message.ts`의 embed flag를 import하며, 신규 알림 본문도 notification-message 모듈을 사용한다. 이 파일 테스트는 과거 `simplifyMarketRssDiscordMessage` 함수를 검증한다.

세 localStorage 키(`rss_custom_keywords`, `rss_stock_alerts`, `market_sentiment_history`)는 현재 `app/`, `components/`, `lib/` runtime에서 writer 파일 외 참조가 확인되지 않았다. 따라서 해당 코드가 과거 브라우저에 저장한 값은 남아 있을 수 있지만 현재 앱에서 읽히지 않는 orphaned client data로 보인다. 사용자 브라우저 데이터는 이 저장소 검사로 확인할 수 없으므로 데이터 정리·마이그레이션은 하지 않았다.


`lib/accumulation-test-fixtures.ts`는 제품 runtime 진입점에서 도달하지 않지만, 이름과 주석대로 누적매집 감지 테스트에서 사용하는 합성 데이터 fixture다. 제품 기능 미사용 파일로 분류하지 않고 테스트 지원 코드로 남긴다.

## 자동화 미실행 또는 scheduler 연결이 빠진 기능

- `us-daily-indicators`: `FEATURE_MODULES`는 `scheduler: "OCI_CRON"`으로 표시하지만 실제 OCI 예약 스크립트에는 `/api/cron/us-daily-indicators` 호출이 없다. 아래 최신 운영 재확인에서 production automation history 2,696건(성공 268, 실패 1, skipped 2,427), 마지막 실행 2026-08-19 `SKIPPED / outside_schedule`을 확인했다. 기능 설정의 코드 기본값은 `enabled: false`다. 현재 자동 실행 경로에서 빠져 있고 비활성으로 보이지만, 과거 사용 이력이 크므로 삭제 후보가 아니라 scheduler/configuration 불일치로 분류한다. 관리자 테스트 UI는 별도 `/api/admin/us-daily-indicators-test`를 호출한다.
- `.env.local` 우선 주입으로 연결한 DB의 read-only 집계(2026-10-20 07:27:48 UTC)는 registry 25개 중 `NOT_SCHEDULED` 3개, `OCI_CRON` 22개를 보였다. 이 DB snapshot은 production debug API가 반환한 `us-daily-indicators` 최근 실행(2026-08-19)과 일치하지 않으므로, 현재 운영 이력의 근거로 섞지 않는다. DB별 기록과 feature 설정은 각각 조회 대상 DB를 밝혀서 해석해야 한다. 어느 쪽도 모듈 미사용의 단독 증거로 삼지 않는다.
- 초기 조사 때 연결한 DB snapshot에서 `instrument-fundamentals`와 `sec-smallcap-share-facts` 설정이 enabled=true였으나, 이는 해당 DB에 한정된 시점 자료다. 최신 production fundamentals 상태는 아래 운영 재확인 절의 별도 조회를 기준으로 한다. `sec-smallcap-share-facts`는 cron runner·route·저장 데이터가 확인되어 미사용으로 분류하지 않는다.

DB 검사는 `.env.local`을 상위 환경보다 우선 적용하고 `BEGIN READ ONLY` 안에서 `automation_runs`, `feature_module_settings`의 비밀 아닌 key/status/timestamp만 SELECT했다. 자격증명이나 webhook 설정은 출력하지 않았다.
## SEC 소형주 주식수 기능은 미사용으로 판정하지 않음

연결 DB read-only 확인에서 `sec-smallcap-share-facts` 설정은 `enabled=true`였고, `sec_smallcap_common_stock_shares`에 1,057행, `sec_smallcap_share_review`에 1,311행이 있었다. 현재 `scripts/oci-cron.sh`가 cron route를 호출하며 `app/api/cron/sec-smallcap-share-facts/route.ts`, `app/api/public/us-smallcap-shares/route.ts`, `lib/feature-modules.ts`가 기능을 구현한다. 따라서 최근 automation run이 없다는 이유로 이 기능을 삭제하거나 데이터를 폐기하면 안 된다.

로컬 V149 `kis_listed_shares_only` migration은 이 두 테이블과 feature setting을 삭제하도록 되어 있었다. 배포 전 안전성 수정으로 이를 V157로 이동하면서 해당 DROP/DELETE와 free-float column 삭제를 제거해 기존 SEC 데이터·설정을 보존했다. 로컬 V148 cap migration은 원격에서 이미 적용된 V148과 동일한 constraint 변경이어서 중복 파일을 제거했다. 운영 DB에서 V148(SEC cap boundary), V149(automation history indexes) 성공 적용 및 V153까지의 최신 성공 이력을 read-only로 확인했다; V156은 아직 운영 DB에 없었으나 원격 코드 기준 필수라 복원했다.

## 후속 배포 준비 및 검증 상태

- 통합 후 `npm.cmd run deploy:verify` 통과: dependency audit 0 vulnerabilities, production build, standalone + Chrome desktop/mobile + API smoke, 294 test files (1,430 passed, 2 skipped), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth (175 API routes), OCI cron (22 shared endpoints + isolated fundamentals timer). 커밋 후 동일 전체 게이트를 다시 통과했다.
- 검증 과정에서 새 cron routes의 비중앙화 인증을 공통 `cron-auth`로 교체했고, full-refresh backoff skip 처리와 KIS test mock도 바로잡았다. V148 중복은 제거, KIS shares migration은 V157로 번호를 이동하고 SEC tables/settings 및 free-float columns 삭제를 뺐으며 원격 V156 필수 migration을 복구했다.
- 원격 6커밋을 병합하고 RSS Discord 출처 allowlist를 신규 및 재시도 경로 모두에 적용했다. 병합 커밋 `7ea1f960`과 배포 기록 커밋 `84481f93`, 보고서 기록 커밋 `23ffe4f4`를 `oci`에 push했으며 해당 Deploy OCI workflow `39405249354`, `39406703102`, `39408070579`가 모두 성공했다. V158 forward migration과 이번 조사 갱신은 `459f74a5`로 push했으며 workflow `39410821362`의 `Verify deployment`, `Activate release` 및 전체 run 성공을 확인했다. 운영 URL은 repository runbook에 기재된 `https://stockman.r-e.kr`이다. `/api/health`는 2026-10-20 10:59:01 UTC에 HTTP 200, `status=ok`를 반환했고, `/`, `/charts`도 HTTP 200이었다. `/api/health`는 상세 Flyway 번호를 공개하지 않으므로 V158은 migration activation 성공과 readiness 회복 근거로 기록한다.
## 2026-10-20 운영 재확인

- 조사 기록·운영 경로 확인은 현재 `e74613d885e4eb822f8823330191cccef6ca020c`를 기준으로 한다. `origin/oci`와 동일했고 GitHub Actions run `39412187639`은 배포 성공으로 완료됐다. `GET https://stockman.r-e.kr/api/health`는 2026-10-20 11:12:17Z `status=ok`를 반환했다.
- 미사용 후보의 판정은 그대로다. 정적 참조가 없는 파일은 삭제 후보이지 사용 중단의 확정 증거가 아니며, 외부 API 소비자와 수동 운영자의 사용 여부는 저장소/운영 기록만으로 완전히 판정할 수 없다. 삭제는 하지 않았다.
- 보조 운영 확인으로 `instrument-fundamentals`를 2026-10-20 11:18:52Z에 인증된 read-only debug GET으로 확인했다. 최근 실행은 11:15:00Z `PARTIAL`: 6,704개 대상 중 6,559개 누적 완료, 누적 성공 6,559·실패 145, 이번 실행에서 111건 시도 중 1건 저장·110건 실패, 미시도 0이다. 실패 사유는 주로 KIS 가격 응답 무효(`KIS_PRICE_INVALID`, 101건)와 시가총액 누락/무효(9건)이며 운영 자동화는 실제 실행 중이다. 이 실행은 미사용 기능 후보로 분류하지 않는다. debug 결과는 누적 실행 요약이며 새 수집이나 데이터 변경은 요청하지 않았다.
- 조회 방법: `.env.local` 우선 주입으로 `CRON_SECRET`을 메모리에서 읽고, 비밀값은 출력하지 않은 채 `GET /api/debug/automation-runs?module=instrument-fundamentals&limit=1&includeSummary=true`를 호출했다. 제품 코드나 운영 데이터를 수정하지 않았다.
## 2026-10-20 최신 HEAD·운영 경로 재검증

- 최신 조사 통합 HEAD와 `origin/oci`는 `83c25950b4904029e87d023c84ef0a29d99d00bc`로 일치한다. 원격 동시 커밋 `c884b255`를 merge했다. `app/api/cron` 아래 실제 `route.ts`는 24개다. OCI의 공용·fundamentals·RSS scheduler 세 스크립트를 대조한 결과 실제 구현된 route 중 `us-daily-indicators`만 직접 예약 호출되지 않는다. 이름만 남아 있는 빈 디렉터리는 route로 세지 않았다.
- `us-daily-indicators`는 `lib/feature-modules.ts`에서 `OCI_CRON`으로 표기하지만 호출 스크립트에서 누락됐다. `lib/feature-module-settings.ts`의 기본 설정은 `enabled: false`, `intervalSeconds: 600`이다. 현재 `.env.local`이 주입한 DB의 해당 설정 row에는 `enabled` key가 없었고, 이 값은 production 설정이라고 확인할 수 없다. 별도의 admin test UI는 `/api/admin/us-daily-indicators-test`를 호출한다.
- Production read-only debug API (`GET /api/debug/automation-runs?module=us-daily-indicators&limit=1&includeSummary=true`, 조회 2026-10-20 11:35:05Z)는 총 2,696회(성공 268, 실패 1, skipped 2,427), 최신 실행 2026-08-19 12:28:54Z `SKIPPED`, 사유 `outside_schedule`을 반환했다. 따라서 이 기능은 과거 실제 사용됐으며, 현재는 정기 호출과 실행 기록이 장기간 끊긴 상태다. 삭제 미사용 후보가 아니라 비활성·예약 연결 누락 항목이다.
- `.env.local`로 연결한 DB의 같은 module은 최근 90일 실행 0건을 반환했고 설정 row에도 `enabled` key가 없었다. 이 결과는 production debug API의 2026-08-19 기록과 서로 다르므로 DB endpoint/대상 간 차이가 있다. 현재 production 설정을 이 로컬 DB 결과로 추정하지 않고, 두 결과를 분리 기록한다.
- 기존 5개 runtime 후보(`lib/keywords.ts`, `lib/stock-alerts.ts`, `lib/sentiment.ts`, `lib/sectors.ts`, `lib/market-rss-discord-message.ts`)는 최신 source에서도 app/components/lib/scripts runtime importer가 발견되지 않았다. 세 localStorage 키는 해당 writer 파일 외 runtime consumer가 보이지 않는다. 이는 repo 정적 참조 검사 결과이며 외부 소비자나 기존 브라우저 저장값까지 검증한 것은 아니다.
- 조사로 제품 코드·운영 DB를 변경하지 않았고 실제 사용 여부가 불명확한 기능 삭제나 cron 연결 복구도 하지 않았다. 보고서/개발 로그 변경은 commit `05c9bb72` 및 통합 commit `83c25950`에 포함되어 원격에 push됐고 Deploy OCI run `39417086164`가 성공했다. 운영 `GET https://stockman.r-e.kr/api/health`는 2026-10-20 11:52:13Z `status=ok`를 반환했다. 통합 HEAD에서 `npm.cmd run deploy:verify`도 통과했다.
## 2026-10-21 확정 미사용 코드 정리

- 최신 추적 코드에서 `git grep`으로 직접 import·함수 호출·스토리지 키 consumer를 재검사했다. `680f2a2d`에서 관련 UI (`keyword-manager`, `stock-alert-manager`, `market-sentiment`, `sector-map`)가 제거된 뒤에도 남아 있던 아래 5개 라이브러리는 runtime caller가 없었다. 각 모듈을 참조한 것은 모듈 자체 또는 전용 단위 테스트뿐이었다.
- 이 근거로 다음 소스와 해당 전용 테스트 4개를 제거했다: `lib/keywords.ts`, `lib/stock-alerts.ts`, `lib/sentiment.ts`, `lib/sectors.ts`, `lib/market-rss-discord-message.ts`; `lib/keywords.test.ts`, `lib/sentiment.test.ts`, `lib/sectors.test.ts`, `lib/market-rss-discord-message.test.ts`. `lib/stock-alerts.ts`에는 별도 테스트 파일이 없었다.
- `market-rss-discord-message.ts`의 Discord flag는 현재 `market-rss-notification-message.ts`가 소유하며 retry/runtime caller도 그 모듈을 사용한다. 관련 active notification 동작은 제거하지 않았다.
- 제거된 localStorage key `rss_custom_keywords`, `rss_stock_alerts`, `market_sentiment_history`의 값은 이미 사용자 브라우저에 저장돼 있을 수 있다. 제거된 UI/runtime가 이를 읽지 않으며, 브라우저 저장소를 조회하거나 값을 지우는 변경은 하지 않았다.
- `us-daily-indicators`는 삭제하지 않았다. 관리자 기능·route가 남아 있고, production read-only 조회(2026-10-20 15:46:58Z)에서 누적 2,696회 실행과 마지막 2026-08-19 `SKIPPED / outside_schedule`을 재확인했다. 현재 코드 기본 설정은 disabled이고 OCI 예약 호출은 없으나, 과거 실제 사용과 수동 관리자 경로가 있으므로 비활성/예약 연결 문제로 계속 분류한다.
- 남은 한계: 외부에서 과거 localStorage를 직접 읽는 브라우저 소비자 여부와 운영 DB의 현재 effective `us-daily-indicators` 설정은 확인하지 않았다. 해당 데이터는 건드리지 않았다.
