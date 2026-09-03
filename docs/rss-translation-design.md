# RSS 한국어 번역 모듈 설계

## 목표

영문 RSS를 무료 기반으로 한국어 사용자에게 제공하되, 원문·티커·숫자·출처 링크를 보존한다. 번역 장애가 발생해도 RSS 수집과 알림은 중단하지 않는다.

## 선택안

OCI 인스턴스에서 Docker로 자체 운영하는 LibreTranslate를 기본 번역 엔진으로 사용한다. 외부 유료 번역 API에 의존하지 않고, 애플리케이션은 HTTP `TranslationClient` 인터페이스만 사용한다. 따라서 추후 Argos Translate 등 다른 무료 엔진으로 교체할 수 있다.

## 처리 흐름

```text
RSS 수집(영문 원문)
  -> 원문 ID·본문 해시로 번역 캐시 조회
  -> 캐시 미스일 때 제목 우선, 요약 선택 번역
  -> 성공: 한국어 + 영문 원문 보존
  -> 실패/타임아웃: 영문 원문 반환 + translationFallback=true
  -> Discord/UI는 한국어 우선, 원문 링크 제공
```

탐지용 키워드·티커 추출은 반드시 영문 원문으로 수행하고, 번역문은 사용자 표시용으로만 사용한다. 제목의 심볼, 거래소 코드, 금액, 퍼센트, 회사명 고유명사는 보호하거나 원문을 병기한다.

## API 계약

`MarketRssItem`을 변경하지 않고 다음 표시 필드를 추가한다.

- `translatedTitle`
- `translatedSummary`
- `translationFallback`
- `translationProvider`

관리자 RSS 테스트는 기본적으로 원문만 반환하며 `GET /api/admin/market-rss-test?translate=true`일 때 번역 필드를 추가한다. 번역 서비스가 꺼져 있거나 실패해도 HTTP 오류 대신 원문을 반환한다.

## 운영 환경변수

```env
TRANSLATION_ENABLED=true
TRANSLATION_PROVIDER=google-cloud-translation
GOOGLE_TRANSLATION_API_KEY=구글_번역_API_KEY
LIBRETRANSLATE_URL=http://127.0.0.1:5000
LIBRETRANSLATE_API_KEY=
TRANSLATION_SOURCE_LANGUAGE=en
TRANSLATION_TARGET_LANGUAGE=ko
TRANSLATION_TIMEOUT_MS=10000
```

자체 호스팅 LibreTranslate는 API 키 없이 사용할 수 있다. 번역 요청에는 동시성 제한과 타임아웃을 두고, 캐시를 통해 같은 기사의 반복 번역을 방지한다.

## 단계별 적용

1. 현재 구현: `TranslationClient`, LibreTranslate HTTP 클라이언트, RSS 단건/배열 번역, 관리자 테스트 `translate=true`.
2. 다음 구현: `market_rss_translations` 테이블과 원문 해시 기반 캐시.
3. 다음 구현: OCI Docker Compose에 LibreTranslate를 localhost로 추가하고 헬스체크 구성.
4. 최종 적용: Discord/UI 알림에 한국어 제목·요약을 사용하되 영문 원문 링크와 fallback 상태를 유지.

## 공식 참고

- LibreTranslate 문서: https://docs.libretranslate.com/
- API 문서: https://docs.libretranslate.com/api/
- 설치 안내: https://docs.libretranslate.com/guides/installation/
