# StockTitan RSS 제목 번역

## 범위

외부 번역 API에 전달하는 입력은 `source=STOCKTITAN` RSS 기사 한 건의 `title` 문자열로 한정한다. `summary`, `content`, `rawPayload`와 다른 RSS 출처의 제목은 전송하지 않는다. `lib/translate-market-rss-item.ts`가 출처와 필드를 최종 확인하며, 운영 cron도 StockTitan 행만 조회한다.

## 호출 경로

- 운영: `POST /api/cron/market-rss`가 RSS를 저장한 뒤 `translatePendingMarketRssArticles()`를 호출한다. 선택 쿼리는 StockTitan 출처, `PENDING` 또는 재시도 가능한 `FAILED`, 알림 대상, backlog 아님으로 제한한다.
- 관리자 미리보기: `GET /api/admin/market-rss-test?source=STOCKTITAN&translate=true`는 최신 StockTitan feed를 가져와 제목만 번역한다. 저장하거나 Discord로 전송하지 않는다. `translate=true`에서 출처를 생략하면 StockTitan으로 기본 지정하고, 다른 출처를 지정하면 HTTP 400으로 거부한다.
- 공통 번역 함수는 StockTitan이 아닌 항목에 대해 provider를 호출하지 않고 `unsupported_source` fallback을 반환한다.

## 배포 설정

현재 런타임은 Azure Translator F0를 primary로 사용하고, F0 사용량 한도 또는 오류 시 Google Cloud Translation Basic v2를 fallback으로 사용한다. Azure 키·endpoint와 명시적인 `AZURE_TRANSLATOR_FREE_TIER_CONFIRMED=F0`가 없으면 Azure 호출을 fail-closed하며, Google 키가 있을 때만 fallback을 사용한다. Google API key는 `x-goog-api-key` header로 보낸다. 두 경로 모두 cron과 관리자 미리보기가 동일한 provider별 DB quota를 적용한다.

`AZURE_TRANSLATOR_API_KEY`에는 해당 Translator 리소스의 Key 1 또는 Key 2 중 하나를 설정한다. 두 키는 같은 리소스의 회전 가능한 자격증명이며, 어느 쪽이든 같은 리소스의 `AZURE_TRANSLATOR_ENDPOINT` 및 필요 시 `AZURE_TRANSLATOR_REGION`과 짝지어야 한다. 앱은 Text Translation API를 사용하며 Document Translation API URL은 호환되지 않는다. endpoint 설정은 base URL 또는 portal의 Text Translation endpoint(`/translate`까지 포함)를 지원한다. 앱은 `/translate`가 이미 있으면 그대로 사용하고, 없으면 한 번만 덧붙인다. 문서 번역 경로·작업 API는 사용하지 않는다.

실제 번역 및 공급자 오류 확인은 인증된 `/api/admin/market-rss-test?source=STOCKTITAN&mode=PREVIEW&translate=true&diagnostics=true&limit=1` 관리자 미리보기를 사용한다. Azure를 우선 호출하고 실패하면 설정된 경우 Google fallback도 시도하므로 두 provider의 앱 quota가 사용될 수 있다. `diagnostics=true` 응답의 `azureEndpoint`는 host/path와 query 유무만 반환하고 query 값·키는 숨긴다. 이 요청은 DB quota를 사용하므로 운영에서 필요한 횟수만 호출한다. 설정 여부만 확인할 때는 관리자 환경 진단을 우선한다.

## 캐시와 사용량 제한

운영 cron은 제목 원문 해시·대상 언어·provider로 캐시를 조회한다. 캐시 미스 시 DB에서 provider별 월·rolling-hour 한도를 각 outbound 재시도마다 먼저 예약하며 DB 예약이 실패하면 호출하지 않는다. Azure 앱 내부 한도는 월/rolling 60분 각각 1,800,000자, Google은 월 300,000자·rolling 60분 100,000자다. Google 시간당 제한은 공식 provider 무료량이 아닌 앱 보호값이다. 불확실한 timeout/HTTP 실패 예약은 provider가 이미 입력을 처리했을 가능성 때문에 반환하지 않는다. `translation_char_count`는 실제 사용 provider를 기준으로 기록한다.

관리자 미리보기는 운영과 같은 provider별 cache/quota client를 사용하므로 provider usage는 발생할 수 있지만 앱 상한을 우회하지 않는다.

## 저장 및 상태

원문 제목은 `market_rss_articles.title`, 번역 제목은 `translated_title`에 저장한다. `translated_summary`와 `translated_content`는 원문 보존 호환 필드이며 번역 API 결과가 아니다. 성공 상태는 `TRANSLATED`, provider 부재·월 한도 등은 `SKIPPED`, 예외는 `FAILED`, 처리 전은 `PENDING`이다. fallback 여부와 사유도 함께 저장한다. 이 제한 적용 전 행의 `translation_char_count`에는 이전 계산식이 summary/content 길이를 포함했을 수 있으므로 과거 provider 호출량으로 해석하지 않는다.

## 진단

`GET /api/debug/market-rss-translations?hours=24&source=STOCKTITAN&status=ALL`은 저장 상태만 읽으며 번역 호출·재시도·수정을 하지 않는다. 여기서 `translation_char_count`는 제목 입력 기준으로 확인한다. 다른 출처는 진단 API에서 계속 조회할 수 있지만, 이것은 번역 대상으로 허용한다는 뜻이 아니다.
