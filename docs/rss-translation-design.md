# RSS 번역 다중 공급자·무료 한도 보호 설계

## 1. 목적과 범위

StockTitan RSS 번역에 Google Cloud Translation Basic v2를 주 공급자로 유지하고, Google이 일시 장애이거나 앱 자체 무료 예산을 소진했을 때만 Azure AI Translator F0를 fallback으로 사용한다. 무료 제공량을 넘는 요청은 애플리케이션에서 fail-closed로 차단한다. 이 문서는 설계이며 아직 구현이나 운영 설정 변경을 뜻하지 않는다.

- 대상: StockTitan RSS의 제목만 번역, 번역문은 `translated_title`에 저장.
- 요약·본문·원시 payload: 외부 번역 API에 보내지 않는다.
- 기존 기사 수집·분류·알림·번역 품질 검증 및 원문 fallback 계약은 유지한다.
- Google 환경변수 `GOOGLE_TRANSLATION_API_KEY`를 유지한다.
- Azure는 키가 있고, 운영자가 F0 리소스임을 확인했으며, 무료 예산 가드가 준비된 경우에만 활성화한다.

## 2. 현재 구현에서 확인한 기준선

- Google 단일 provider: `lib/cloud-translation-client.ts`가 Basic v2 REST API를 호출한다.
- `lib/translate-market-rss-item.ts`가 StockTitan 제목 번역, 결과 품질 검사, 원문 fallback을 담당한다.
- `lib/quota-aware-translation-client.ts` 및 `lib/translation-cache.ts`가 DB 번역 캐시와 원자적 월간 예약을 수행한다.
- 현재 앱 월 한도는 `TRANSLATION_LIMIT=300,000`자이며 `translation_usage_monthly`는 월 단위 단일 행이다. Azure fallback을 추가하려면 provider별 원장으로 분리해야 한다.
- 현재 Google HTTP 클라이언트는 요청 자체에서 재시도한다. 월별 예약은 한 번이므로, 여러 번 실제 전송될 수 있는 재시도와 사용량 원장 간의 경계는 구현 시 반드시 중앙화해야 한다.
- **코드와 문서 간 입력 범위 불일치**: 기존 RSS 설계는 제목만 전송한다고 하나, 현재 입력 준비 경로는 제목과 최대 500자 요약 문맥을 같은 번역 요청에 포함한다. 구현 단계에서는 기존 제목 전용 요구를 보존해 요약 문맥도 제거하고, API에 실제 전송하는 제목 문자열만 비용/쿼터에 산입한다. 이를 변경하지 않는다면 전체 요청 문자열을 산입해야 하며 제목 길이만 계산하면 안 된다.
- 관리자 미리보기 `GET /api/admin/market-rss-test?source=STOCKTITAN&translate=true`는 현재 운영 월별 원장과 분리되어 provider 사용량을 발생시킬 수 있다. 구현 시 같은 quota 예약기를 반드시 통과시킨다.

## 3. 공급자 우선순위 및 무료 보호 한도

공식 요금 문서 확인 기준일: 2026-10-21. 무료 한도는 계정·계약·지역·정책 변경에 영향을 받으므로 운영 전 공급자 포털에서 해당 프로젝트와 구독의 실제 tier를 재확인한다.

| 순위 | 공급자 / 현재 공식 제공량 | 앱 하드 캡 초안 | 추가 보호 |
|---|---|---:|---|
| 1 | Google Cloud Translation NMT: 월 첫 500,000자에 최대 $10 월간 크레딧 적용. Basic·Advanced 합산이며 이월되지 않음 | 현재 앱 기준 300,000자/Google 청구월 유지 | Google 프로젝트의 일일 콘텐츠 쿼터를 10,000자로 낮추는 별도 제한을 권고. 앱 단독량과 타 프로젝트 사용량은 구분 불가 |
| 2 | Azure Translator F0: 월 2,000,000자 무료. 별도로 F0 서비스 한도는 시간당 2,000,000자 | 월 1,800,000자/Azure F0 청구월 이하 | 분당 가드가 아닌 rolling 60분 창을 1,800,000자 이하로 제한. 필요하면 관리자 설정에서 더 낮춤 |

위 캡은 공식 무료량보다 낮춘 애플리케이션 자체 상한의 제안이다. Google은 기존 300,000자 한도를 올리지 않는다. Azure cap은 F0의 월 무료량보다 10% 낮춰 외부 사용·정산 시점 오차에 여유를 둔다. 운영에서 같은 Google 프로젝트나 Azure 구독을 다른 애플리케이션이 공유하면 앱 원장만으로 전체 계정의 무료 제공량을 보장할 수 없다. 따라서 번역 전용 GCP 프로젝트/API key 및 전용 Azure F0 Translator 리소스/구독 사용을 권고한다.

**무료 초과 방지의 불변조건**

1. API 호출 전에 공급자별 월별·시간별 잔여 한도를 DB에서 원자적으로 예약한다.
2. 예약 성공이 확인되지 않거나 quota DB가 읽기/쓰기 불가하면 provider 호출을 하지 않는다.
3. 관리 UI는 공식 무료량을 넘는 한도를 입력할 수 없고 기본은 더 낮은 앱 hard cap이다. 관리자는 한도를 낮추거나 provider를 끌 수만 있다.
4. Google 예산이 차면 Azure의 잔여 F0 한도 내에서만 fallback한다. Azure 예산도 차면 원문을 보여주며 다음 공급자나 유료 tier로 자동 승격하지 않는다.
5. Provider tier를 코드가 키만으로 확정 판별할 수 있다고 가정하지 않는다. Azure fallback은 운영자가 포털에서 F0임을 확인한 뒤 설정값으로 명시적으로 활성화한다. 미확인/유료 tier 가능성이 있으면 비활성 상태가 기본이다.
6. 공급자 무료량은 계정 전체 기준이다. 다른 앱/사람이 공유 사용하면 실제 남은 무료량은 달라질 수 있으므로 전용 리소스 사용과 공급자 포털 사용량 대조가 필요하다.

## 4. 호출 흐름

```text
StockTitan 원문 기사
  -> 제목 언어/빈 입력 확인
  -> (원문 hash, target=ko, 공급자, 형식, 번역 버전) 캐시 조회
  -> Google provider별 월 예산 원자 예약
      ├─ 통과: Google Cloud Translation Basic v2
      ├─ Google quota 소진 또는 재시도 후 transient 장애
      │    -> Azure F0 활성/자격증명/월·시간 잔여 확인 및 원자 예약
      │         ├─ 통과: Azure Translator v3
      │         └─ 차단/실패: 원문 fallback
      └─ Google 예산 예약 실패: Google 호출 금지, Azure quota 확인
  -> 기존 숫자·티커·한국어·완전성 검증
  -> 검증 통과한 결과만 캐시·translated_title 저장
  -> 상태/공급자별 사용량, fallback 및 오류 집계
```

캐시에서 검증된 동일 제목 번역을 찾으면 provider 호출과 quota 예약 없이 반환한다. 공급자별 결과 캐시를 우선 조회하고, 다른 provider 캐시는 품질 검증된 결과임이 확인될 때만 재사용한다. 원문 또는 정규화 제목·언어쌍·형식·번역 검증 버전을 캐시 key에 반영해 서로 다른 번역 입력이 섞이지 않게 한다.

### Fallback 판정

- 다음 provider로 넘김: 공급자별 앱 월/시간 cap 도달, Google quota 응답(일일·분당 제한), 429 또는 5xx/network timeout이 정해진 짧은 재시도 후에도 지속됨.
- 즉시 실패/원문 fallback 및 경보: 인증·권한 오류(401/403 중 quota 원인이 아닌 경우), 잘못된 입력/400, 응답 schema 오류, DB 예약 실패. 인증 오류를 조용히 감추지 않고 관리자에 기록하되, 사용자가 Azure를 명시 활성화한 경우에 한해 fallback을 시도한 뒤 경보를 남긴다.
- 품질 검증 실패는 번역 provider 장애와 분리한다. 의미 오류/숫자·티커 훼손 결과를 다른 provider 결과로 무조건 대체해 저장하지 않으며 기존 원문 fallback과 review 경로를 따른다.
- 재시도는 provider client별 내부 루프에 두지 않고 orchestrator에서 실행한다. **매 HTTP 전송 전에 각각 예약**하고, 요청이 provider에 도달했는지 불명확한 timeout은 사용량 보수 계상한다. 응답이 오지 않았다는 이유만으로 예약을 풀면 이중 재시도/청구 가능성을 낮게 계산할 수 있다.

## 5. 설정과 보안

기존 `GOOGLE_TRANSLATION_API_KEY`를 유지한다. Azure 후보 서버 전용 변수:

- `AZURE_TRANSLATOR_API_KEY` (secret)
- `AZURE_TRANSLATOR_ENDPOINT` (공식 Translator endpoint 또는 해당 resource endpoint)
- `AZURE_TRANSLATOR_REGION` (regional/multi-service resource일 때 필요)
- `AZURE_TRANSLATOR_FREE_TIER_CONFIRMED=F0` (운영자가 tier 확인 후 설정; 누락/다른 값이면 Azure 차단)

신규 secret은 브라우저에 전달하지 않고 API/디버그 응답에도 값·접두·길이·URL query를 노출하지 않는다. Azure key는 공식 인증 헤더를 사용한다. Google REST API key는 현재 URL query 방식 대신 공식 권고 `x-goog-api-key` 헤더로 옮기고, Translation API만 허용하도록 API 제한 및 서버 용도에 맞는 애플리케이션 제한을 적용한다. HTTP 로깅, error message, tracing에서 key와 request body를 제거한다.

## 6. 원장과 관리자 관측 설계

현재 `translation_usage_monthly(usage_month PK, ...)`를 provider별 원장으로 확장한다. Flyway migration으로 기존 행을 `google-cloud-translation` 공급자에 귀속해 보존한 뒤 PK를 `(provider, usage_month)`로 변경한다. 필요 column:

- `provider`, `usage_month`, `reserved_characters`, `translated_characters`, `attempted_characters`, `uncertain_characters`, `limit_characters`, `limit_alerted`, `alerted_thresholds`, `updated_at`.
- Azure 시간 제한은 `provider_usage_reservations` 같은 예약 원장(요청 ID, 공급자, 문자수, dispatch 시각, 상태, 만료)을 두고 `NOW() - 60 minutes` rolling sum을 직렬화/원자 처리한다. 기간 만료 예약이 안전하게 정리되어야 한다.
- 같은 DB를 쓰는 cron/미리보기/운영 인스턴스가 동시에 실행되어도 상한이 깨지지 않도록 단일 SQL 조건부 UPDATE/INSERT 또는 트랜잭션/advisory lock으로 reservation을 직렬화한다. 프로세스 메모리 counter만으로는 안 된다.
- 취소/확실한 미전송에서만 reserve를 되돌린다. 전송 이후 응답 유실은 `uncertain_characters`에 기록하고 free cap 계산에서 소비된 것으로 계산한다.

관리자 UI/기존 read-only debug API에서 공급자별로 보인다:

- 현재 tier 확인 상태 및 설정/키의 configured 여부(값은 절대 표시하지 않음)
- 이번 provider billing month의 limit / reserved / 성공 사용량 / 불확실 사용량 / 남은 값 / 퍼센트 / reset 예상
- Azure rolling 60분 예약·사용량과 남은 값
- cache hit, Google 호출/성공/실패, Azure fallback/성공/실패, quota 차단, 원문 fallback 집계
- 마지막 오류의 안전한 provider code·HTTP status·시각, circuit breaker 상태
- 70%, 85%, 95%에 한 번씩 알림; 100% 차단. 알림 실패는 quota 안전장치를 해제하지 않음.

일반 사용자는 공급자 이름과 번역 결과/원문 fallback 상태만 보고, key와 raw provider error는 노출하지 않는다.

## 7. 구현 단계 및 검증 게이트

1. **계약 테스트**: Provider 인터페이스/provider code mapping, rate/quota/transient/auth/invalid-input 오류 분류, 응답 파싱, HTML·숫자·티커 보존.
2. **예산 원장**: provider별 기존 300,000 Google usage 마이그레이션, 병렬 요청 atomic reserve 테스트, 예약/전송/불명확 오류/재시도에 대한 상한 불변성 테스트.
3. **Azure F0 client**: endpoint/region/key validation, REST v3 request, timeout·Retry-After·403001 quota 등 공식 오류 처리, key redaction.
4. **Orchestrator**: Google 우선, Azure F0 확인된 경우만 fallback, fallback의 fallback 금지, 모든 경로에서 월/시간 예산 예약, 캐시 key provider/version 분리.
5. **운영 관측**: 관리자 상태 API/UI 및 threshold alerts에 공급자별 usage·fallback·last safe error 추가. debug endpoint는 quota를 소모하지 않는 상태조회와, 명시적으로 요청한 1건 테스트를 구분한다.
6. **검증**: mocked provider tests (무료 사용량 상한·동시 race 포함), integration test는 두 provider 미호출을 기본으로 하고, 별도 명시 실행의 단일 짧은 문장만 실 API smoke에 사용. `npm.cmd run deploy:verify`로 빌드·테스트·standalone runtime·API smoke 통과 후 사용자 지시가 있으면 commit/push/deploy.

## 8. 재발 감지·남은 위험

- 감지 게이트: translation client에 모든 provider call이 quota reservation wrapper를 통하지 않으면 테스트 실패. 관리자 미리보기도 같은 wrapper를 사용하지 않으면 coverage test 실패. max chars 초과 동시 예약 시 성공 수가 0이고 사용량 합계가 limit 초과하지 않는지 검증한다.
- 매월 공급자 콘솔 실제 사용량과 DB 예약/시도량을 대조한다. Google 월 크레딧은 Basic/Advanced 공유이며 다른 프로젝트 사용자가 소비할 수 있다. 공급자 콘솔의 무료량/청구기간을 API에서 실시간 정확히 읽는다고 가정하지 않는다.
- F0가 모든 Azure 환경에서 같은 월/시간 제한 및 청구 경험을 제공한다고 전제하지 않는다. 실제 F0 리소스의 포털·지역·구독 상태 확인은 배포 전 운영 체크리스트로 남긴다.
- Providers may change tiers/pricing. Caps can only be loosened after official pricing review and updated tests/design; do not automatically enlarge caps using API response text.
- 무료량 집계 창과 애플리케이션 DB 월 경계가 어긋나면 경계 부근의 보수 reserve가 필요하다. 운영 전 공급자 청구기간/시간대를 확인하고 불확실하면 해당 월 구간의 예산을 낮춘다.

## 공식 문서

- Google Cloud Translation Basic/Advanced 가격 및 월 첫 500,000자 크레딧: https://cloud.google.com/products/translate/pricing
- Google Translation quota (모든 공백 포함, 기본 일일 문자 제한 무제한, PT 자정 reset, per-minute limit): https://docs.cloud.google.com/translate/quotas
- Google REST API key를 URL 대신 `x-goog-api-key` header로 전달하고 키를 제한하는 권고: https://docs.cloud.google.com/docs/authentication/api-keys-best-practices
- Azure Translator F0 월 2,000,000자 무료 표기: https://azure.microsoft.com/en-us/pricing/details/translator/
- Azure Translator 공식 시간당 F0 및 요청 문자 제한: https://learn.microsoft.com/en-us/azure/ai-services/Translator/service-limits
- Azure Translator REST v3 endpoint: https://learn.microsoft.com/en-us/rest/api/translator/translator/translate?view=rest-translator-v3.0
- Azure Translator key/region header 인증: https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/authentication
