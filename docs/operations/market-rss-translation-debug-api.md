# RSS 번역 상태 검수 API

## 목적

운영 애플리케이션에 설정된 PostgreSQL의 `market_rss_articles`에서 저장된 번역 상태를 읽기 전용으로 확인한다. 로그인 없이 호출할 수 있다. 이 API는 번역 재시도·수정·재전송을 수행하지 않는다.

## 호출

```text
GET /api/debug/market-rss-translations?hours=24&source=ALL&status=ALL&limit=50&offset=0
```

- 관리자 로그인 없이 호출할 수 있다. 따라서 이 경로는 공개 API로 취급한다.
- `hours`: 조회 구간(1–720, 기본 24시간), `created_at` 기준.
- `source`: `ALL` 또는 지원 RSS 출처 중 하나.
- `status`: `ALL`, `PENDING`, `TRANSLATED`, `SKIPPED`, `FAILED`.
- `limit`: 1–100, 기본 50. `offset`: 0–1,000,000, 기본 0.
- 요약은 선택 출처 및 시간 범위의 모든 번역 상태별 건수이고, 항목 목록은 출처·상태 조건으로 페이지 처리된다.
- 항목에는 기사 식별·제목·링크·번역 시도/완료 시각·provider·fallback·skip/error 사유·번역 제목 등 검수에 필요한 메타데이터를 반환한다. 원문 summary/content 및 `raw_payload`는 반환하지 않는다. 저장된 번역 오류 메시지는 자격증명 마스킹 후 제공한다.
- DB 오류는 상세 연결정보를 노출하지 않고 `503 RSS_TRANSLATION_DIAGNOSTICS_UNAVAILABLE`로 반환한다.

## 공개 API 보안 범위

이 API는 공개 접근이므로 RSS 제목·링크 및 번역 상태가 외부에 노출될 수 있다. 응답에서 원문 요약/본문/raw payload와 DB 예외 상세를 제외하고, 페이지당 최대 100건·최대 720시간으로 범위를 제한한다. 이를 더 제한해야 하는 운영 환경에서는 인증을 추가하거나 reverse proxy 접근제어를 적용한다.

## 운영 확인 절차

운영 URL에서 로그인 없이 API를 호출한다. 먼저 기본 전체 요약을 확인하고, `status=FAILED`, `status=SKIPPED`, `status=PENDING`을 각각 조회해 원인과 마지막 시도 시각을 검수한다. 이 API는 현재 앱이 연결된 DB를 조회하므로 로컬에서 호출하면 로컬 `.env.local`의 DB, 운영 도메인에서 호출하면 운영 앱의 DB를 대상으로 한다.

## 재발 방지와 한계

- 테스트는 관리자 인증, 기간·페이지·필터 검증, 집계 및 필터 적용, 오류 마스킹, DB 장애 시 비밀정보 비노출을 보장한다.
- 조회 구간은 기사 생성 시각 기준이다. 오래된 기사의 최근 재번역 시도까지 찾으려면 `hours`를 늘린다.
- 실행 중인 운영서버의 DB 연결이나 응답은 배포 후 운영 URL에서 직접 호출해 확인해야 한다. 로컬 테스트만으로 운영 DB 상태를 증명하지 않는다.
