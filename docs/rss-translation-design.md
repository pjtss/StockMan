# RSS 한국어 번역 설계

## 번역 대상

외부 번역 API는 StockTitan RSS 기사의 제목(`source=STOCKTITAN`, field=`title`)만 처리한다. 요약·본문·원시 payload와 다른 RSS 출처는 provider에 전달하지 않는다. 일반 RSS 수집·분류·알림에서는 원문을 계속 사용할 수 있다.

## 처리 흐름

```text
StockTitan RSS 제목
  -> 원문 해시 + 대상 언어 + provider 기준 캐시 조회(운영 cron)
  -> 캐시 미스면 제목 글자 수 예약
  -> Google Cloud Translation Basic v2 (en -> ko)
  -> 성공: 원문 title과 translated_title 저장
  -> 오류/한도/설정 없음: 원문 fallback 및 상태 사유 저장
```

운영 cron은 StockTitan 행만 선택하며 공통 번역 함수도 다른 출처를 거부한다. 관리자 미리보기는 `GET /api/admin/market-rss-test?source=STOCKTITAN&translate=true`를 사용한다. 출처를 생략한 번역 테스트는 StockTitan으로 제한하고, 그 외 출처를 지정한 번역 요청은 HTTP 400으로 거부한다. 관리자 미리보기는 DB 캐시·월별 운영 예약을 통하지 않고 실제 provider를 호출하므로 사용량을 발생시킬 수 있다.

## 운영 API 및 상태

- 읽기 전용 검수: `GET /api/debug/market-rss-translations?hours=24&source=STOCKTITAN&status=ALL`
- 관리자 실제 feed 미리보기: `GET /api/admin/market-rss-test?source=STOCKTITAN&translate=true`
- 운영 수집·번역·알림: cron 전용 `POST /api/cron/market-rss` (디버깅용 수동 API가 아니며 파이프라인 상태를 변경한다.)
- 성공은 `translation_status=TRANSLATED` 및 `translation_fallback=false`로 판정한다. `SKIPPED` 또는 `FAILED`의 `translated_title`은 원문 fallback일 수 있으므로 번역 성공으로 간주하지 않는다.

## 사용량과 저장

운영 cron은 캐시 미스 때 제목 길이만 월별 사용량에 예약한다. 현재 한도는 300,000자다. `translation_char_count`는 제목 입력 길이를 기록한다. 원문은 `title`, 번역문은 `translated_title`에 보존하며, translated summary/content 필드는 번역하지 않고 기존 호환성을 위해 원문을 유지한다.

## 공식 Provider 문서

- Google Cloud Translation Basic v2 `translate`: https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate
