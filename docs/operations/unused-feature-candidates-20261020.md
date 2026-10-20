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

## 결론 및 검증 상태

- 67개 삭제 파일 중 이미 비활성인 화면/API, 내부 참조가 발견되지 않은 정적 후보, 실제 조회 API, 운영 자동화와 관련된 파일을 구분했다.
- 내부 참조가 없다는 결과는 저장소 안에서만 성립하며 외부 소비자·사람이 실행하는 작업까지 증명하지 않는다.
- 전체 빌드/테스트/실행 검증은 수행하지 않았다. `origin/oci`와 branch가 갈라져 있고 이전 전체 검증도 실패했으므로 이 대규모 변경은 배포할 수 없는 상태다.
- 이 조사는 코드 변경, 커밋, 푸시, 배포를 하지 않았다.

## 원격 최신 기준에서 추가 확인한 항목

V156 검토는 원격 snapshot `29d847b6`의 코드 근거를 사용했다. 현재 remote-tracking ref `8d0c0782`이며 로컬 후보 커밋과는 2개 ahead·6개 behind로 갈라져 있다.

- `db/migration/V156__instrument_fundamental_attempt_timestamp.sql`: 미사용이 아니다. 원격 최신 `8d0c0782`에 migration이 있으며 `lib/instrument-fundamental-progress.ts`가 `last_attempt_at`을 갱신하고 진단 모듈이 읽는다. migration만 제외하면 progress update가 실패할 수 있어 V156을 원격에서 복원했다.
- `lib/market-rss-discord-policy.ts`: 필수 운영 정책이다. `lib/discord-delivery-retry.ts`의 재시도 발송이 `SEC_EDGAR`·`STOCKTITAN` 외 출처를 건너뛴다. 신규 발송뿐 아니라 이미 큐에 들어간 과거 payload에도 allowlist를 적용하는 보호 경계다. 이 정책과 테스트 삭제는 미사용 정리가 아니다.
- `app/api/dart/details/route.ts` 및 `lib/opendart-details.ts`: route 내부에서 상세 조회를 직접 호출하고 기능 테스트가 다수 있다. 저장소 외부 호출 여부는 모른다. 내부 client가 없다는 점만으로 API가 미사용이라고 할 수 없다.
- `lib/kis-us.ts`: 현재 소스에서 모듈을 import하는 경로는 찾지 못했다. 다만 파일 내용은 KIS 해외 상승률·체결강도 랭킹과 Yahoo Finance fallback을 포함해 사용자 노출 기능을 직접 구현한다. 현대 `kis-us-api.ts` 등으로 대체된 것으로 보일 수 있지만, `git grep`으로 정확한 import를 확인하고 API/관리자 호출 경로가 서로 다른지 확인한 뒤 제거해야 한다.
- `lib/kis-ipo-listing-schedule.ts`: 현재 runtime import가 없고 `/api/listings`는 KRX KIND를 조회한다. 삭제된 어댑터의 boundary audit 매핑은 정리했으며, 외부 직접 호출자는 미확인이다.
- `/api/dart/opendart-fast`는 기존 410, `/dart/opendart-fast`, `/sec`, `/scanners/us`는 비활성 안내 화면이어서 런타임 기능 자체가 이미 비활성인 후보로 볼 수 있다. `/scanners/us`와 별도 `/us-top-rising`을 혼동하면 안 된다.

`680f2a2d`에는 V148, V149의 중복 migration 번호도 있어 `docs:check`의 migration 검증이 실패한다. 원격 최신 커밋 위에 맞춘 뒤 번호와 migration 적용 여부를 재검토해야 한다.

## 현재 checkout의 미사용 runtime 코드 후보

현재 로컬 checkout `680f2a2d`의 `app/`, `components/`, `lib/`, `scripts/`에서 TypeScript AST로 정적 import·export·dynamic import 경로를 따라갔다. 앱 route/page와 운영 script를 진입점으로 삼고 test 파일은 제품 runtime 도달성에서 제외했다. 검사 대상 955개 source file 중 entry root 291개, root에서 도달 가능한 656개를 확인했다. 이 결과는 정적 분석이므로 string-built dynamic import나 외부 consumer는 별도 확인 대상이다.

아래 5개 runtime 파일은 현재 app/운영 script entrypoint에서 도달하지 않았다. 모두 보존 여부를 사람이 정할 수 있도록 후보로만 제시한다.

- `lib/keywords.ts`: 유닛 테스트에서만 import된다. 과거 `keyword-manager` UI가 현재 제거되어 localStorage helper를 부르는 runtime 경로를 찾지 못했다.
- `lib/stock-alerts.ts`: `rss_stock_alerts` localStorage 설정을 다루지만 UI·API·runtime import가 없다.
- `lib/sentiment.ts`: `market_sentiment_history` localStorage 이력 helper를 호출하는 runtime이 없고 테스트만 남아 있다.
- `lib/sectors.ts`: 섹터/시장 심리 분류 함수의 runtime import가 없고 테스트만 남아 있다.
- `lib/market-rss-discord-message.ts`: runtime import가 없다. 현재 Discord 재시도는 `market-rss-notification-message.ts`의 embed flag를 import하며, 신규 알림 본문도 notification-message 모듈을 사용한다. 이 파일 테스트는 과거 `simplifyMarketRssDiscordMessage` 함수를 검증한다.

`lib/accumulation-test-fixtures.ts`는 제품 runtime 진입점에서 도달하지 않지만, 이름과 주석대로 누적매집 감지 테스트에서 사용하는 합성 데이터 fixture다. 제품 기능 미사용 파일로 분류하지 않고 테스트 지원 코드로 남긴다.

## 자동화 미실행 또는 scheduler 연결이 빠진 기능

- `us-daily-indicators`: `FEATURE_MODULES`에는 `scheduler: "OCI_CRON"`이고 `/api/cron/us-daily-indicators` route도 구현되어 있다. 그러나 `scripts/oci-cron.sh`, 별도 systemd timer, workflow, Netlify 설정 어디에서도 해당 route URL을 호출하지 않는다. 연결된 configured DB의 `automation_runs`에도 최근 90일 run이 없다. 정기 자동화는 호출 설정에서 연결되지 않은 상태로 보이며, 실행 이력도 이를 뒷받침한다. 관리자/수동 호출 가능성은 별도로 남는다.
- 연결 DB read-only 집계(2026-10-20 07:27:48 UTC): 기능 registry 25개 중 `NOT_SCHEDULED` 3개, `OCI_CRON` 22개. 30일 기록이 있는 것은 `dart-realtime` 하나(132회, 마지막 2026-10-16 SUCCESS)이고 다른 21개 scheduled module은 0회다. 90일 기록은 `dart-realtime`, `instrument-fundamentals`, `kr-daily-cache`, `market-rss`, `us-bollinger-band`, `us-daily-cache`, `us-golden-cross` 7개뿐이다. 이는 연결된 DB에 저장된 기록 기준이며, 모듈 미사용·사용자 비활성의 증거와 동일하지 않다.
- `instrument-fundamentals` 설정은 enabled=true지만 최근 기록은 2026-08-25 SKIPPED이며 30일 실행은 0회다. `sec-smallcap-share-facts`도 enabled=true지만 이 DB에서 90일 automation run은 없었다. route는 cron runner에 등록되어 있다. 외부 환경 설정(예: `SEC_USER_AGENT`) 부족으로 automation run 생성 전 종료됐을 수도 있어 “미사용”으로 단정하지 않고 운영 설정/호출 로그 확인 대상으로 둔다.

DB 검사는 `.env.local`을 상위 환경보다 우선 적용하고 `BEGIN READ ONLY` 안에서 `automation_runs`, `feature_module_settings`의 비밀 아닌 key/status/timestamp만 SELECT했다. 자격증명이나 webhook 설정은 출력하지 않았다.
## SEC 소형주 주식수 기능은 미사용으로 판정하지 않음

연결 DB read-only 확인에서 `sec-smallcap-share-facts` 설정은 `enabled=true`였고, `sec_smallcap_common_stock_shares`에 1,057행, `sec_smallcap_share_review`에 1,311행이 있었다. 현재 `scripts/oci-cron.sh`가 cron route를 호출하며 `app/api/cron/sec-smallcap-share-facts/route.ts`, `app/api/public/us-smallcap-shares/route.ts`, `lib/feature-modules.ts`가 기능을 구현한다. 따라서 최근 automation run이 없다는 이유로 이 기능을 삭제하거나 데이터를 폐기하면 안 된다.

로컬 V149 `kis_listed_shares_only` migration은 이 두 테이블과 feature setting을 삭제하도록 되어 있었다. 배포 전 안전성 수정으로 이를 V157로 이동하면서 해당 DROP/DELETE와 free-float column 삭제를 제거해 기존 SEC 데이터·설정을 보존했다. 로컬 V148 cap migration은 원격에서 이미 적용된 V148과 동일한 constraint 변경이어서 중복 파일을 제거했다. 운영 DB에서 V148(SEC cap boundary), V149(automation history indexes) 성공 적용 및 V153까지의 최신 성공 이력을 read-only로 확인했다; V156은 아직 운영 DB에 없었으나 원격 코드 기준 필수라 복원했다.

## 후속 배포 준비 및 검증 상태

- 2026-10-20 현재 local `deploy:verify` 통과: dependency audit 0 vulnerabilities, production build, standalone + Chrome desktop/mobile + API smoke, 293 test files (1,412 passed, 2 skipped), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth (175 API routes), OCI cron (22 shared endpoints + isolated fundamentals timer).
- 검증 과정에서 새 cron routes의 비중앙화 인증을 공통 `cron-auth`로 교체했고, full-refresh backoff skip 처리와 KIS test mock도 바로잡았다. V148 중복은 제거, KIS shares migration은 V157로 번호를 이동하고 SEC tables/settings 및 free-float columns 삭제를 뺐으며 원격 V156 필수 migration을 복구했다.
- `origin/oci`는 local보다 6 commits ahead. `git merge-tree` 기준 `lib/discord-delivery-retry.ts`와 `lib/market-rss-pipeline.ts` 두 파일에 충돌이 있다. 아직 커밋·푸시·배포하지 않았다. 충돌을 해결한 뒤 전체 검증을 다시 해야 한다.