# KIS 해외 속보 Discord 전달

## 환경변수

```env
KIS_BREAKING_NEWS_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/발급된_웹훅_URL
```

기존 `NEWS_RADAR_DISCORD_WEBHOOK_URL`과 분리된 전용 채널 설정입니다. 기존 해외 뉴스 레이더 알림에는 영향을 주지 않습니다.

## 운영 호출

```text
GET/POST /api/cron/us-breaking-news-forwarder
Authorization: Bearer ${CRON_SECRET}
```

동작 순서:

1. KIS `brknews-title`에서 해외 속보를 조회한다.
2. `cntt_usiq_srno`를 `breaking-news:{id}`로 변환한다.
3. `us_breaking_news_discord_delivery`에서 이미 `SENT`인지 확인한다.
4. 신규 속보만 전용 Discord Webhook으로 보낸다.
5. 전송 결과와 실패 사유를 DB에 기록한다.

## 관리자 디버깅

관리자 로그인 후 기능 모듈에서 `해외 속보 Discord 전달`을 연다.

1. 조회일·조회시각을 비워 현재 KIS 속보를 조회하거나 특정 시각을 입력한다.
2. `1. 미리보기`로 KIS 수집 건수와 중복 건수를 확인한다.
3. `2. 실제 Webhook 전송`으로 신규 속보만 전송한다.
4. 화면 JSON에서 `SENT`, `ALREADY_SENT`, `FAILED`, `PREVIEW` 상태를 확인한다.

테스트 API:

```text
GET /api/admin/us-breaking-news-forwarder-test?send=false
GET /api/admin/us-breaking-news-forwarder-test?send=true
```
