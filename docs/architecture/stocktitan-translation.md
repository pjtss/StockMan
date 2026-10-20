# StockTitan RSS 제목 번역

## 범위

외부 번역 API에 전달하는 입력은 `source=STOCKTITAN` RSS 기사 한 건의 `title` 문자열로 한정한다. `summary`, `content`, `rawPayload`와 다른 RSS 출처의 제목은 전송하지 않는다. `lib/translate-market-rss-item.ts`가 출처와 필드를 최종 확인하며, 운영 cron도 StockTitan 행만 조회한다.

## 호출 경로

- 운영: `POST /api/cron/market-rss`가 RSS를 저장한 뒤 `translatePendingMarketRssArticles()`를 호출한다. 선택 쿼리는 StockTitan 출처, `PENDING` 또는 재시도 가능한 `FAILED`, 알림 대상, backlog 아님으로 제한한다.
- 관리자 미리보기: `GET /api/admin/market-rss-test?source=STOCKTITAN&translate=true`는 최신 StockTitan feed를 가져와 제목만 번역한다. 저장하거나 Discord로 전송하지 않는다. `translate=true`에서 출처를 생략하면 StockTitan으로 기본 지정하고, 다른 출처를 지정하면 HTTP 400으로 거부한다.
- 공통 번역 함수는 StockTitan이 아닌 항목에 대해 provider를 호출하지 않고 `unsupported_source` fallback을 반환한다.

## 배포 설정

현재 런타임 구현은 Google Cloud Translation Basic v2 REST API이며 `GOOGLE_TRANSLATION_API_KEY`로 인증한다. 공식 요청 주소는 `POST https://translation.googleapis.com/language/translate/v2`이고, JSON의 `q`에 제목 텍스트를 전달하며 source `en`, target `ko`, format `text`를 지정한다. 키가 설정되지 않으면 운영 번역은 provider 호출 없이 fallback 상태로 기록한다.

## 캐시와 사용량 제한

운영 cron은 제목 원문 해시·대상 언어·provider로 기존 캐시를 조회한다. 캐시 미스일 때만 해당 제목 글자 수를 월별 한도 예약에 반영한 뒤 외부 API를 호출한다. 성공 시 번역문을 저장하고 사용량을 확정한다. 월 한도는 300,000자이며, 실제 API 호출 글자 수와 `translation_char_count` 모두 제목 길이 기준이다.

관리자 미리보기는 저장 번역 캐시나 운영 사용량 예약 경로를 사용하지 않고 현재 feed 제목을 provider에 직접 보낸다. 따라서 실제 번역 사용량이 발생할 수 있다.

## 저장 및 상태

원문 제목은 `market_rss_articles.title`, 번역 제목은 `translated_title`에 저장한다. `translated_summary`와 `translated_content`는 원문 보존 호환 필드이며 번역 API 결과가 아니다. 성공 상태는 `TRANSLATED`, provider 부재·월 한도 등은 `SKIPPED`, 예외는 `FAILED`, 처리 전은 `PENDING`이다. fallback 여부와 사유도 함께 저장한다. 이 제한 적용 전 행의 `translation_char_count`에는 이전 계산식이 summary/content 길이를 포함했을 수 있으므로 과거 provider 호출량으로 해석하지 않는다.

## 진단

`GET /api/debug/market-rss-translations?hours=24&source=STOCKTITAN&status=ALL`은 저장 상태만 읽으며 번역 호출·재시도·수정을 하지 않는다. 여기서 `translation_char_count`는 제목 입력 기준으로 확인한다. 다른 출처는 진단 API에서 계속 조회할 수 있지만, 이것은 번역 대상으로 허용한다는 뜻이 아니다.
