# RSS 제목 번역 provider·무료량 보호 설계

## 범위

StockTitan RSS의 `title`만 번역한다. `summary`, `content`, 원문 payload 및 다른 source는 번역 provider에 보내지 않는다. Google과 Azure 사용량은 DB 예약 원장으로 앱 전체 인스턴스에서 합산 제한한다.

## Provider 순서와 fail-closed 정책

```text
StockTitan title
  -> provider별 캐시 조회
  -> Azure Translator F0 (primary, 명시적 F0 확인 시만)
       ├─ 성공 -> 검수 후 provider별 캐시 저장
       └─ 오류/앱 quota 도달 -> Google Cloud Translation Basic v2
                                ├─ 성공 -> 검수 후 Google 캐시 저장
                                └─ 오류/quota -> 원문 title 유지
```

Azure는 `AZURE_TRANSLATOR_API_KEY`, `AZURE_TRANSLATOR_ENDPOINT`, `AZURE_TRANSLATOR_FREE_TIER_CONFIRMED=F0`가 모두 있어야 활성화한다. 지역/멀티서비스 리소스에서 요구되는 `AZURE_TRANSLATOR_REGION`도 지원한다. F0 확인값이 없으면 키가 있더라도 Azure를 호출하지 않아 S1 종량제 리소스를 무료로 오인하지 않는다. Provider 설정은 값이 아니라 설정 여부만 debug/health 응답에 노출한다.

Google 예비 provider는 `GOOGLE_TRANSLATION_API_KEY`를 사용한다. API key는 URL이 아닌 `x-goog-api-key` 헤더로 보낸다. 기본 provider 재시도는 매 outbound 요청 직전에 quota를 다시 예약한다. DB 예약 실패 시 외부 API를 호출하지 않는다. 요청 timeout/HTTP 실패는 provider가 입력을 처리했는지 알 수 없으므로 예약량을 반환하지 않고 보수적으로 사용량에 남긴다.

## 상한

| provider | 공식 무료 기준 | 애플리케이션 보호 상한 |
|---|---|---|
| Azure Translator F0 | 월 2,000,000자(표준 번역과 Custom Translator 학습 합산), 시간당 2,000,000자, 요청당 50,000자 | 월 1,800,000자, 이동 60분 1,800,000자, 요청 50,000자 |
| Google Cloud Translation Basic | 월 첫 500,000자 비용에 최대 월 $10 credit 적용(Basic/Advanced 공유, 이월 없음) | 월 300,000자. 이동 60분 상한 100,000자 |

모든 provider 시도는 `translation_usage_monthly(provider, usage_month)` 및 `translation_usage_reservations`에서 원자적으로 예약한다. DB transaction advisory lock으로 월/rolling-hour 합계를 확인한 뒤 예약한다. 실제 provider가 외부에서 공유되면 앱 원장만으로 그 사용량을 알 수 없으므로 전용 프로젝트/resource를 사용해야 한다. Google의 비용 credit은 자동 사용량 차단이 아니며 Cloud Billing budget 알림도 hard cap이 아니다. 따라서 DB 사전 제한을 유일한 앱 호출 경로로 강제한다.

Google 공식 가격표의 500,000자는 별도 API 무료 quota가 아니라 월 최대 $10 credit을 Basic/Advanced가 함께 소비하는 구조다. Basic text translation의 기본 단가는 1M input characters당 $20이므로 $10 credit 기준 500,000자에 해당한다. 본 앱은 공유 프로젝트 사용량 및 금액 변동에 대비해 월 300,000자만 허용한다. Azure F0의 무료 월 2M자와 시간당 2M자는 별도 제한이며, 무료량 비교로는 명목상 Google 월 500,000자의 4배다. 앱 제한은 각각의 공식 무료 한도보다 낮게 잡아도 다른 서비스가 같은 resource/project를 사용한 분량까지 막을 수는 없다.

Azure 과금 보호는 전용 F0 resource 및 배포 환경 SKU 확인이 전제다. 앱은 월/시간 예산을 무료 제공량보다 10% 낮게 설정하며, 관리자 미리보기 역시 cron과 같은 quota-aware client를 사용한다.

## 사용량 계산과 데이터

- 정확한 외부 입력은 정규화/보호 처리된 제목 문자열이다. 본문·요약은 호출 인자에 포함하지 않는다.
- Google 카운트는 Unicode code point 기반, Azure 카운트는 UTF-16 code unit 기반으로 각 공급자 규칙에 맞춘다.
- retry도 매 시도 직전 별도 예약한다. 원장 reservation 행은 2시간 뒤 정리하며 60분 rolling window와 여유를 둔다.
- 캐시 키는 원문 hash + 대상 언어 + provider로 구분해 Azure/Google 번역 품질 결과를 혼합하지 않는다.
- 기존 월 원장은 `google-cloud-translation`으로 유지한다. V159에서 provider 복합키와 rolling reservation 테이블을 추가한다.

## 운영 번역 검증

관리자 전용 `GET /api/admin/market-rss-test?source=STOCKTITAN&translate=true&mode=PREVIEW`는 실제 RSS 제목 번역을 시험한다. `limit=1`을 지정하면 첫 항목만 처리해 provider 호출과 무료량 사용을 최소화한다. `diagnostics=true`는 이 PREVIEW 경로에서만 허용되며 항목 ID, 실패 단계, provider, 마스킹된 오류 요약을 반환한다. 번역 key·endpoint 값은 응답하지 않는다. `FETCH_ONLY`도 추적용 quota-aware client를 실제 번역 함수에 전달해 provider 호출량 통계가 실제 요청과 일치해야 한다.

## 검증·디버깅

- `GET /api/admin/market-rss-test?source=STOCKTITAN&translate=true`는 실제 provider 요청을 할 수 있지만 운영 quota 원장을 똑같이 적용한다.
- `/health-check` 및 관리자 debug suite는 Azure F0/Google 구성 여부와 선택 순서만 반환하며 key/endpoint 값은 노출하지 않는다.
- 회귀 테스트는 Azure primary, F0 확인 없는 fail-closed, Google fallback, provider별 quota, retry 별도 예약, 제목 외 필드 미전송, API key 헤더를 검증한다.
- quota 예약 SQL은 provider/월/요청 문자 수/상한 매개변수 타입을 각각 `text`/`bigint`로 명시하고 upsert 증가량은 `EXCLUDED.reserved_characters`를 사용한다. PostgreSQL 매개변수 타입 추론 충돌은 provider API를 호출하기 전에 `quota_reservation` 단계에서 실패하므로, 예약 성공 회귀 테스트와 단일 항목 운영 PREVIEW로 확인한다.
- Azure primary 요청 자체가 실패하고 Google fallback도 quota로 차단되면, 관리자 `diagnostics=true` 응답에 `provider_fallback` 단계와 Azure의 마스킹된 오류 원인을 포함한다. 이 내부 진단은 public article DTO/DB에 복사하지 않으며, 영어 `API key`와 구분자 변형도 값 마스킹 테스트에 포함한다.
- DB 원장은 외부에서 같은 Azure/Google 계정을 공유하는 사용량을 추적할 수 없으므로 프로젝트/resource 분리와 provider portal 사용량 확인은 운영 책임이다.

## 공식 문서

- Azure Translator 가격 및 F0 2M free tier: https://azure.microsoft.com/en-us/pricing/details/translator/
- Azure Translator service limits: https://learn.microsoft.com/en-us/azure/ai-services/Translator/service-limits
- Azure Translator authentication: https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/authentication
- Azure Translator response codes (F0 quota `403001`): https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/status-response-codes
- Google Cloud Translation pricing and monthly credit: https://cloud.google.com/products/translate/pricing
- Google Cloud Translation quotas and counting: https://docs.cloud.google.com/translate/quotas
- Google API key security (`x-goog-api-key`): https://docs.cloud.google.com/docs/authentication/api-keys-best-practices
- Cloud Billing budgets are alerts, not automatic caps: https://docs.cloud.google.com/billing/docs/how-to/budgets
- 공식 요금/제한 수치 재확인: 2026-10-21. Google rolling-hour 100,000자는 공식 무료 제공량이 아니라 본 애플리케이션의 보수적 제한이다.
