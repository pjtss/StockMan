# StockTitan RSS 제목 번역

## 범위

외부 번역 API에 전달하는 입력은 모든 RSS 출처 기사 한 건의 `title` 문자열로 한정한다. `summary`, `content`, `rawPayload`는 전송하지 않는다. Discord는 한국어 번역 검증이 완료된 제목만 전송한다.

## 호출 경로

- 운영: 매분 실행되는 `POST /api/cron/market-rss`가 GlobeNewswire, StockTitan, SEC 기사 전체를 저장한다. 같은 run에서 50건씩 번역하고 각 번역 배치를 Discord에 바로 전송한다. 전체 번역 대기열을 소진할 때까지 반복하며, 실패 번역은 5분 backoff로 지속 재시도한다.
- 기존 source/backlog 필터로 `SKIPPED` 된 세 출처의 기사는 허용된 이유만 `PENDING` 복구한 뒤 한국어 번역 게이트를 다시 통과해야 보낸다. 해당 run의 Discord 미전송은 응답에 `deliveryIncomplete`와 `degraded`로 드러난다.
- Discord 429 응답에서는 `Retry-After` header 또는 JSON `retry_after`를 사용한다. 한 실행에서 최대 3회 재시도한 후 남은 건 durable delivery queue로 넘긴다. Discord는 rate limit이 동적이므로 수치를 고정하지 않는다. [Discord Rate Limits 공식 문서](https://discord.com/developers/docs/topics/rate-limits)
- 관리자 미리보기: `GET /api/admin/market-rss-test?translate=true`는 지정 세 출처 또는 허용된 한 출처를 가져와 제목을 번역한다. 저장하거나 Discord로 전송하지 않는다.

## 배포 설정

현재 런타임은 Azure Translator F0를 primary로 사용하고, F0 사용량 한도 또는 오류 시 Google Cloud Translation Basic v2를 fallback으로 사용한다. Azure 키·endpoint와 명시적인 `AZURE_TRANSLATOR_FREE_TIER_CONFIRMED=F0`가 없으면 Azure 호출을 fail-closed하며, Google 키가 있을 때만 fallback을 사용한다. Google API key는 `x-goog-api-key` header로 보낸다. 두 경로 모두 cron과 관리자 미리보기가 동일한 provider별 DB quota를 적용한다.

## 캐시와 사용량 제한

운영 cron은 제목 원문 해시·대상 언어·provider로 캐시를 조회한다. 캐시 미스 시 DB에서 provider별 월·rolling-hour 한도를 각 outbound 재시도마다 먼저 예약하며 DB 예약이 실패하면 호출하지 않는다. Azure 앱 내부 한도는 월/rolling 60분 각각 1,800,000자, Google은 월/rolling 60분 각각 300,000자다. 불확실한 timeout/HTTP 실패 예약은 provider가 이미 입력을 처리했을 가능성 때문에 반환하지 않는다. `translation_char_count`는 실제 사용 provider를 기준으로 기록한다.

관리자 미리보기는 운영과 같은 provider별 cache/quota client를 사용하므로 provider usage는 발생할 수 있지만 앱 상한을 우회하지 않는다.

## 저장 및 상태

원문 제목은 `market_rss_articles.title`, 번역 제목은 `translated_title`에 저장한다. `translated_summary`와 `translated_content`는 원문 보존 호환 필드이며 번역 API 결과가 아니다. 성공 상태는 `TRANSLATED`, provider 부재·월 한도 등은 `SKIPPED`, 예외는 `FAILED`, 처리 전은 `PENDING`이다. fallback 여부와 사유도 함께 저장한다. 이 제한 적용 전 행의 `translation_char_count`에는 이전 계산식이 summary/content 길이를 포함했을 수 있으므로 과거 provider 호출량으로 해석하지 않는다.

## 진단

`GET /api/debug/market-rss-translations?hours=24&source=ALL&status=ALL`은 저장 상태만 읽으며 번역 호출·재시도·수정을 하지 않는다. 여기서 `translation_char_count`는 제목 입력 기준으로 확인한다.
