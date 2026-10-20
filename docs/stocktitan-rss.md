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
- Google Cloud Translation 요청 대상은 `source=STOCKTITAN`인 RSS 기사의 `title` 필드만이다. `summary`·`content` 및 다른 RSS 출처의 제목은 외부 번역 API로 보내지 않는다.
- 운영 cron은 StockTitan 행만 번역 대상으로 고르고, 공통 번역 함수도 다른 출처를 거부한다. 관리자 API에서 `translate=true`이고 `source`를 생략하면 StockTitan으로 한정하며, 다른 출처를 지정하면 HTTP 400으로 거부한다.
- StockTitan Discord 알림은 기존 형식으로 유지한다. 다른 시장 RSS Discord 알림은 제목과 발행 시각만 표시하고 출처·번역 상태·티커 등 추가 항목과 링크 미리보기 임베드를 억제한다.
- 대기 중인 재전송 알림에도 같은 형식을 적용해 이전 형식의 티커·출처·등락률 줄과 링크 임베드가 다시 나타나지 않도록 한다.

## 관리자 테스트

- 전체 RSS: `GET /api/admin/market-rss-test?source=STOCKTITAN&translate=true`
- API 테스트 화면에서 시장 RSS 번역 테스트를 실행하면 StockTitan 결과도 함께 표시된다.

## 자동화

기존 `/api/cron/market-rss` 실행에 StockTitan이 포함된다. OCI cron은 해당 라우트를 호출하므로 별도 스케줄러가 필요하지 않다.

## 운영 원칙

- `source=STOCKTITAN`으로 원문 출처를 보존한다.
- RSS Discord 알림 허용 출처는 `SEC_EDGAR`와 `STOCKTITAN`뿐이다. Newsis를 포함한 국내 RSS 및 그 밖의 RSS는 수집·열람 데이터로 유지하되 Discord 알림은 건너뛴다. 이미 대기 중인 비허용 출처의 Discord 재시도도 전송하지 않는다.
- `source + externalId`로 중복을 방지한다.
- 기존 RSS 분류·번역 fallback·Discord rate limit·알림 상태 저장을 재사용한다.
- Discord `408/425/429/5xx` 또는 네트워크 오류는 `discord_delivery_queue`에 등록하고 OCI의 `discord-delivery-retry` 작업에서 재전송한다. 재전송 성공·실패 결과는 원본 `market_rss_articles` 행에도 반영한다.
- StockTitan 페이지 HTML을 직접 요청하거나 스크래핑하지 않는다.
