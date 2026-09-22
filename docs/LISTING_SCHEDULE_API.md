# 신규 종목 상장 일정 API

## 현재 상태

- 국내: `GET /api/listings`가 `investment_calendar_events`의 `event_type=IPO`, `market=KR` 데이터를 조회한다.
- 국내 원천: `KRX_KIND` RSS를 `syncDartCalendarEvents`가 수집한 일정이다. 따라서 저장·동기화 작업이 먼저 실행되어야 한다.
- 미국: 공식 상장 일정 원천을 프로젝트에 연결하지 않았으므로 빈 결과와 `sourceAvailable: false`를 반환한다. 추정·가공 결과를 생성하지 않는다.

## 요청

```text
GET /api/listings?market=KR&from=2026-09-01&to=2026-10-31&limit=200
GET /api/listings?market=US&from=2026-09-01&to=2026-10-31
```

국내 응답에는 `market`, `from`, `to`, `source`, `items`, `count`가 포함된다. `items`는 기존 투자 일정 이벤트의 종목코드·회사명·상장 일정·원문 링크를 그대로 사용한다.

## 재발 방지

- 미국 데이터가 연결되기 전까지 국내 데이터를 미국 결과로 재사용하지 않는다.
- 원천 부재는 HTTP 성공 응답 안에서 `sourceAvailable: false`로 구분한다.
- 운영에서 신규 상장 일정이 비어 있으면 `KRX_KIND` 동기화 실행 여부와 `investment_calendar_events`의 `IPO` 행을 먼저 확인한다.
