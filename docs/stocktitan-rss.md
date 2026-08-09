# StockTitan RSS 구독 모듈

## 목적

StockTitan이 제공하는 RSS 피드를 기존 StockMan 시장 RSS 파이프라인에 연결한다. 웹 페이지를 크롤링하지 않고 공식 RSS 응답만 사용한다.

## 데이터 흐름

```text
StockTitan RSS
  -> fetchStockTitanRss
  -> 공통 RSS 파서
  -> market_rss_articles 중복 저장
  -> 분류/번역
  -> Discord 알림 큐
```

## 피드 및 설정

- 기본 피드: `https://www.stocktitan.net/rss`
- 선택 환경변수: `STOCKTITAN_RSS_URL`
- 기존 `MARKET_RSS_DISCORD_WEBHOOK_URL`, 번역·알림 배치 설정을 그대로 사용한다.

## 관리자 테스트

- 전체 RSS: `GET /api/admin/market-rss-test?source=STOCKTITAN&translate=true`
- API 테스트 화면에서 시장 RSS 번역 테스트를 실행하면 StockTitan 결과도 함께 표시된다.

## 자동화

기존 `/api/cron/market-rss` 실행에 StockTitan이 포함된다. OCI cron은 해당 라우트를 호출하므로 별도 스케줄러가 필요하지 않다.

## 운영 원칙

- `source=STOCKTITAN`으로 원문 출처를 보존한다.
- `source + externalId`로 중복을 방지한다.
- 기존 RSS 분류·번역 fallback·Discord rate limit·알림 상태 저장을 재사용한다.
- Discord `408/425/429/5xx` 또는 네트워크 오류는 `discord_delivery_queue`에 등록하고 OCI의 `discord-delivery-retry` 작업에서 재전송한다. 재전송 성공·실패 결과는 원본 `market_rss_articles` 행에도 반영한다.
- StockTitan 페이지 HTML을 직접 요청하거나 스크래핑하지 않는다.
