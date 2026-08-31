# StockTitan RSS 번역 캐시

## 목적

StockTitan RSS의 영어 제목·요약·본문을 수집 시점에 영어(`en`)에서 한국어(`ko`)로 번역하고 PostgreSQL에 저장한다. 조회와 Discord 전송은 저장된 번역을 우선 사용하며, 같은 원문은 해시 기반 캐시로 재번역하지 않는다.

## Provider

Cloud Translation Advanced API v3 `translateText`를 기본 provider로 사용한다. 서비스 계정 JSON 또는 ADC가 없으면 번역 단계만 `SKIPPED` 처리하고 RSS 수집·분류·전송은 계속한다. 기존 `TranslationClient` 인터페이스와 LibreTranslate 구현은 테스트·호환성을 위해 유지한다.

## 사용량 보호

제목·요약·본문의 공백 포함 문자 수를 요청 전에 계산한다. 누적 사용량이 100,000자 단위를 처음 통과할 때마다 디버깅 Discord로 알리고(100,000/200,000/300,000자 및 향후 한도 확대 시 그 이상), 월별 원자적 사용량 예약 결과가 300,000자를 초과하면 요청을 중단하고 월 한도 도달 알림을 최초 1회 보낸다. 임계값 발송 이력은 DB에 저장하며 성공한 요청만 사용량을 확정한다.

## 저장

`market_rss_articles`에는 번역 결과·상태·provider·문자 수를 저장하고, `market_rss_translation_cache`에는 `source_hash + target_language + provider` 유일키로 재사용 가능한 번역을 저장한다. 원문은 기존 `title`, `summary`, `content`에 보존한다.

## 상태

`PENDING`, `TRANSLATED`, `CACHED`, `SKIPPED`, `FAILED`를 사용한다. API 미설정은 오류가 아니라 `SKIPPED`이다.
