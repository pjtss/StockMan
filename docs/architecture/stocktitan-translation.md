# RSS Discord 알림 제목 번역

## 범위

GlobeNewswire, StockTitan, SEC EDGAR 기사 알림은 `title`만 한국어로 번역한다. `summary`, `content`, `rawPayload`는 번역 provider에 보내지 않고 원문 그대로 보존한다. 제목 번역이 검증되기 전에는 원문 알림을 보내지 않는다. 이미 한국어인 제목은 번역 불필요 상태로 확인한 뒤 전송한다.

## 호출 경로

- 운영 `POST /api/cron/market-rss`는 세 출처를 고정 수집하고, 같은 실행에서 제목 번역 배치를 처리한 뒤 번역 게이트를 통과한 행을 Discord로 보낸다. 실패 기사는 미번역 원문 알림으로 우회하지 않고 재시도 대상으로 남긴다.
- 공통 함수 `translateMarketRssItem()`은 `prepareMarketRssTranslationInput(item.title)`만 호출한다. 공급자 요청은 해당 제목의 준비된 문자열 하나이며 요약·본문은 전달하지 않는다.
- 관리자 미리보기에서 번역 출처를 생략하면 세 출처를 조회하며, 개별 출처 지정도 GlobeNewswire·StockTitan·SEC만 허용한다. 미리보기는 저장하거나 Discord로 전송하지 않는다.

## 배포 설정

Azure Translator F0의 공식 무료 제공량은 월 2,000,000자다. RSS 앱은 외부 사용량에 대비해 100,000자 여유를 둔 1,900,000자 월 예약 상한을 사용하고, 시간당 상한은 1,800,000자로 별도 제한한다. 공식 기준: [Azure Translator pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/translator/), [service limits](https://learn.microsoft.com/en-us/azure/ai-services/Translator/service-limits).

현재 런타임은 Azure Translator F0를 우선 사용하고, F0 사용량 한도 또는 오류 시 Google Cloud Translation Basic v2를 fallback으로 사용한다. Azure 키·endpoint와 `AZURE_TRANSLATOR_FREE_TIER_CONFIRMED=F0`가 없으면 Azure 호출을 하지 않는다. 필요 시 `AZURE_TRANSLATOR_REGION`도 설정한다. Google API key는 `x-goog-api-key` header로 보낸다. 두 provider가 미설정이거나 실패하면 번역 전 Discord 발송은 보류된다.

`AZURE_TRANSLATOR_API_KEY`에는 Translator resource의 Key 1 또는 Key 2를 설정하고, 같은 resource의 `AZURE_TRANSLATOR_ENDPOINT` 및 필요 시 `AZURE_TRANSLATOR_REGION`과 짝지어야 한다. 앱은 Text Translation API만 사용한다. endpoint는 base URL 또는 `/translate`까지 포함한 Text Translation endpoint를 지원한다.

## 저장 및 상태

원문 제목은 `market_rss_articles.title`, 한국어 제목은 `translated_title`에 저장한다. `translated_summary`와 `translated_content`는 호환성을 위한 원문 보존 필드이며 번역 결과가 아니다. RSS refresh 때 제목이 바뀐 경우에만 번역 결과·시도 상태를 초기화한다. summary/body/raw payload 변경은 제목 번역을 무효화하지 않는다. 번역 성공 상태는 `TRANSLATED`, 이미 한국어인 제목은 `SKIPPED/already_in_target_language`, provider 부재나 한도 초과는 별도 `SKIPPED`, 예외는 `FAILED`, 처리 전은 `PENDING`이다. Discord 전송 query는 `TRANSLATED` 또는 이미 한국어인 제목만 허용한다. `TRANSLATED` 판정 전에는 출력 내 괄호·대괄호·중괄호의 짝이 맞는지 검사해 provider의 잘린 응답을 차단한다. 이 검사는 문장 의미의 정확성을 보증하지 않으므로 품질 표본 점검과 별도로 운영한다.

## 운영 주기 및 진단

OCI의 `stockman-rss.timer`는 1분마다 `/api/cron/market-rss`를 호출한다. 실행은 `stockman-rss.service` journal과 `/api/debug/automation-runs?module=market-rss&limit=20`으로 확인한다. `GET /api/debug/market-rss-translations?hours=24&source=ALL&status=ALL`은 저장 상태만 조회하며 번역이나 수정을 하지 않는다.

공급자 장애, quota 제한, Discord rate limit 또는 네트워크 지연이 발생할 수 있어 외부 서비스의 절대적인 무실패·즉시 완료는 보장할 수 없다. 앱은 번역 게이트를 유지하고, Discord 429의 `Retry-After`를 반영해 재시도한 뒤 남은 항목을 durable queue에 보관한다.
