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
- Discord 알림 대상은 GlobeNewswire, StockTitan, SEC 세 출처에서 수집한 모든 기사다. 분류, 티커 연결, 발행 시각에 따른 제외 조건은 적용하지 않는다.
- SEC 피드는 `8-K` 유형이나 환경변수 조건을 지정하지 않고 Latest Filings 전체 유형을 읽는다. [SEC RSS 공식 안내](https://www.sec.gov/files/about/secrss.shtml)
- Discord 전송 전에 모든 기사 제목을 한국어로 검증한다. 이미 한국어인 제목은 그대로 통과하며, 번역 provider 오류·미설정·한도 초과 등으로 한국어 번역이 확인되지 않으면 원문 알림을 보내지 않고 번역 재시도 대상으로 남긴다. 외부 번역 입력은 기존 원칙대로 제목만이다.
- StockTitan Discord 알림은 기존 형식으로 유지한다. 다른 시장 RSS Discord 알림은 제목과 발행 시각만 표시하고 출처·번역 상태·티커 등 추가 항목과 링크 미리보기 임베드를 억제한다.
- 대기 중인 재전송 알림에도 같은 형식을 적용해 이전 형식의 티커·출처·등락률 줄과 링크 임베드가 다시 나타나지 않도록 한다.

## 관리자 테스트

- 전체 RSS: `GET /api/admin/market-rss-test?source=STOCKTITAN&translate=true`
- API 테스트 화면에서 시장 RSS 번역 테스트를 실행하면 StockTitan 결과도 함께 표시된다.

## 자동화

기존 `/api/cron/market-rss` 실행에 StockTitan이 포함된다. OCI cron은 해당 라우트를 호출하므로 별도 스케줄러가 필요하지 않다.

## 운영 원칙

- `source=STOCKTITAN`으로 원문 출처를 보존한다.
- RSS cron은 매분 GlobeNewswire, StockTitan, SEC를 수집한다. 같은 실행에서 번역 대기 배치를 끝까지 처리한 뒤 번역 완료된 미전송 PENDING 항목을 발송한다. provider가 일시 실패하면 재시도하며 번역되지 않은 원문은 보내지 않는다.
- 배치 처리에 앱 자체 분당 발송 상한은 두지 않는다. Discord의 동적 rate limit은 HTTP 응답에 따라 durable retry queue로 재시도한다.
- 기존 정책에서 세 출처의 `source_not_allowed_for_discord` 또는 `backlog_or_stale_article` 사유로 `SKIPPED` 된 기사는 자동으로 `PENDING` 복구 후 번역 게이트를 다시 확인한다. 번역 실패나 다른 사유의 SKIPPED 상태는 그대로 둔다.
- cron 응답은 webhook 미설정 또는 직접 발송분 중 미전송이 남으면 `deliveryIncomplete=true` 및 `degraded=true`로 표시한다.
- `source + externalId`로 중복을 방지한다.
- 기존 RSS 분류·번역 fallback·Discord rate limit·알림 상태 저장을 재사용한다.
- StockTitan Discord 알림은 출처·등락률·거래대금 줄을 표시하지 않는다. 기사 제목 링크는 유지하고 Discord webhook의 `SUPPRESS_EMBEDS` message flag를 설정해 링크 미리보기 embed가 본문 아래에 생성되지 않도록 한다. 기존에 대기 중인 StockTitan Discord 재시도 payload도 재전송 직전에 해당 줄을 제거하고 embed 억제 flag를 적용한다. 다른 RSS 출처의 형식은 그대로 유지한다. [Discord Execute Webhook 공식 문서](https://discord.com/developers/docs/resources/webhook#execute-webhook)
- Discord `408/425/429/5xx` 또는 네트워크 오류는 `discord_delivery_queue`에 등록하고 OCI의 `discord-delivery-retry` 작업에서 재전송한다. 재전송 성공·실패 결과는 원본 `market_rss_articles` 행에도 반영한다.
- StockTitan 페이지 HTML을 직접 요청하거나 스크래핑하지 않는다.
