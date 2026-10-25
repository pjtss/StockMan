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
- `lifetimeBySource`는 GlobeNewswire·StockTitan·SEC EDGAR의 전체 저장 행에 대해 번역 및 Discord 전송 상태를 출처별로 집계한다. 이 집계는 `hours`와 무관하여 오래된 backfill을 포함하며 기사 제목·본문·링크는 반환하지 않는다.
- `sent_without_validated_translation`은 전체 발송 완료 중 `TRANSLATED` 또는 `already_in_target_language`로 검증되지 않은 제목 상태 수다. 이를 통해 현행 및 과거 저장 상태에서 번역 게이트 위반 가능성을 확인한다.
- `lifetimeSkippedReasonsBySource`는 전체 저장 행 중 `SKIPPED` 번역의 provider·사유 코드별 건수다. 알려진 안전한 코드만 원형으로 반환하고 나머지는 `other`로 묶으며 provider 오류 문장이나 기사 데이터는 반환하지 않는다.
- 항목에는 기사 식별·제목·링크·번역 시도/완료 시각·provider·fallback·skip/error 사유·번역 제목 등 검수에 필요한 메타데이터를 반환한다. 원문 summary/content 및 `raw_payload`는 반환하지 않는다. 저장된 번역 오류 메시지는 자격증명 마스킹 후 제공한다.
- `translation_char_count`는 현재 로직에서 StockTitan 원문 제목의 입력 길이만 기록한다. 코드 변경 전 행은 예전 계산식을 사용했을 수 있으므로 해당 필드를 과거 provider 사용량의 정밀한 증거로 간주하지 않는다.
- DB 오류는 상세 연결정보를 노출하지 않고 `503 RSS_TRANSLATION_DIAGNOSTICS_UNAVAILABLE`로 반환한다.

## 공개 API 보안 범위

이 API는 공개 접근이므로 RSS 제목·링크 및 번역 상태가 외부에 노출될 수 있다. 응답에서 원문 요약/본문/raw payload와 DB 예외 상세를 제외하고, 페이지당 최대 100건·최대 720시간으로 범위를 제한한다. 이를 더 제한해야 하는 운영 환경에서는 인증을 추가하거나 reverse proxy 접근제어를 적용한다.

## 운영 확인 절차

운영 URL에서 로그인 없이 API를 호출한다. 먼저 기본 전체 요약을 확인하고, `status=FAILED`, `status=SKIPPED`, `status=PENDING`을 각각 조회해 원인과 마지막 시도 시각을 검수한다. 이 API는 현재 앱이 연결된 DB를 조회하므로 로컬에서 호출하면 로컬 `.env.local`의 DB, 운영 도메인에서 호출하면 운영 앱의 DB를 대상으로 한다.

## 재발 방지와 한계

- 테스트는 관리자 인증, 기간·페이지·필터 검증, 집계 및 필터 적용, 오류 마스킹, DB 장애 시 비밀정보 비노출을 보장한다.
- 조회 구간은 기사 생성 시각 기준이다. 오래된 기사의 최근 재번역 시도까지 찾으려면 `hours`를 늘린다.
- 실행 중인 운영서버의 DB 연결이나 응답은 배포 후 운영 URL에서 직접 호출해 확인해야 한다. 로컬 테스트만으로 운영 DB 상태를 증명하지 않는다.

## Azure Translator 운영 진단 API

기존 cron 진단은 Azure 설정 유무와 호출 횟수만 보여주고 공급자 오류 코드를 보존하지 않아, 키·리소스 인증 실패와 네트워크 오류를 구별할 수 없었다. 다음 API는 관리자 세션 또는 `x-cron-secret`/Bearer cron 인증이 필요하며 환경변수 원문은 응답하지 않는다.

```text
GET  /api/admin/azure-translator-debug
POST /api/admin/azure-translator-debug
```

- `GET`은 Azure/Google 설정 여부, endpoint host/path 형태, 현재 UTC 월의 앱 내부 사용량 및 rolling-hour 예약량을 읽기 전용으로 반환한다. endpoint query는 반환하지 않는다. endpoint path가 이미 `/translate`로 끝나는지도 표시한다.
- `POST`는 짧고 매번 달라지는 고정 진단 문구 1건을 Azure에 실제 전송한다. Google fallback은 호출하지 않는다. 운영 DB의 quota ledger를 통해 예약·사용량을 기록하고, 입력 문구는 deferred cache로 인해 번역 캐시에 쓰지 않는다. 공급자 quota 및 앱 제한은 우회하지 않는다.
- 성공은 provider/목표 언어/번역 여부 및 번역 결과를 반환한다. 실패는 단계, HTTP 상태, Azure provider code/message, request ID, retry-after, 재시도 횟수를 반환한다. 키·Authorization·응답 원문 전체는 반환하지 않는다.
- 관리자 페이지 브라우저 세션이 있으면 `GET` 후 `POST`를 호출한다. cron 인증으로 호출할 때는 secret을 URL이나 콘솔 인수에 넣지 말고 `x-cron-secret` 헤더로 전달한다.
- `automation_runs.summary.translated.translationUsage.azure.lastFailure`에는 번역 batch에서 마지막 Azure 실패의 안전한 상태/코드/요청 ID가 포함된다. `/api/admin/debug-suite?checks=rss`로 다음 cron 실행 후 확인한다.
- HTTP 429 `not_sent_due_to_application_quota`는 provider 요청 이전에 앱 quota에서 차단된 것이다. HTTP 502 응답의 `providerFailure`에서 Azure HTTP status/code를 확인한다.

`POST`는 실제 provider 호출이므로 운영 번역 quota를 사용한다. 설정 확인만 필요하면 `GET`만 호출한다. 운영 호출 결과는 배포 후 운영 도메인에서 확인해야 한다.
