# 미국 RSS 사용자 조회 API 설계안

## 상태 및 범위

- 상태: 설계 완료, 구현 전
- 대상: 사용자 UI에서 사용하는 미국 뉴스·공시 조회 API와 관리자 전용 RSS 진단 API
- 미국 출처: `SEC_EDGAR`, `NASDAQ`, `NASDAQ_TRADER`, `STOCKTITAN`, `GLOBENEWSWIRE`
- 국내 출처(KRX KIND, DART, 국내 언론 RSS)는 이 API 범위에서 제외한다. 국내 공시·RSS 조회는 기존 `/api/disclosures` 경로를 유지한다.
- 이번 작업은 API 경계와 응답 계약 설계다. 기존 동작과 데이터는 변경하지 않는다.

## 1. 현재 구조와 문제

### 사용자 조회 경로

- `/api/market-news`는 `market_rss_articles`에서 최신순으로 최대 200건을 읽지만 `source`를 임의 문자열로 받아 미국 RSS 외 출처도 조회할 수 있다.
- 사용자 응답에 원문·번역 제목과 요약, 티커, 링크, 발행시각을 제공한다. 다만 번역 상태, 회사명, 콘텐츠 상태, 원문 본문, 수집시각, 페이지 메타데이터가 없다.
- `/api/disclosures`는 국내 RSS, 해외 RSS, DART/SEC filing을 한 경로에서 조회하며 `content`, `fetchedAt` 등 필드를 반환한다. 이는 국내 공시/전체 JSON 내보내기 용도와 미국 RSS 사용자 피드 용도가 섞이지 않도록 경계를 유지해야 한다.
- `market-news-page.tsx`는 `/api/market-news?limit=200`을 호출하고, 출처 선택지는 현재 응답에 들어온 항목으로부터 동적으로 만든다. 따라서 출처 허용 범위가 UI 자체로 보장되지 않는다.

### 관리자 진단 경로

- `/api/admin/market-rss-test`, `/api/admin/market-rss-signal-test`, `/api/admin/stocktitan-rss`, `/api/admin/debug-suite`는 관리자 세션을 확인하는 운영/테스트 경로다.
- `/api/debug/market-rss-translations`는 번역 상태와 오류 정보를 반환하지만 현재 관리자 인증 없이 읽을 수 있다. RSS 디버깅 데이터는 관리자 전용이어야 하므로 구현 단계에서 인증을 추가해야 한다.
- 운영 디버깅 필드와 원문 저장용 payload를 사용자 DTO에 섞지 않는다. 사용자 DTO는 필요한 기사 콘텐츠와 표시 메타데이터만 포함한다.

## 2. 목표 원칙

1. 사용자 RSS 조회는 위에 명시한 미국 5개 출처만 허용한다. 출처 미지정은 미국 출처 전체로 처리한다.
2. 사용자 응답은 DB에 실제 저장된 근거만 돌려준다. 비어 있는 원문을 생성하거나, 제목만으로 본문을 추정하지 않는다.
3. 영어 원문과 한국어 번역을 별도 필드로 제공하고, 번역이 없거나 fallback이면 상태를 명시한다.
4. 관리자 전용 진단 정보(번역 실패 원문 오류, provider/시도 정보, fetch HTTP 정보, raw payload, source snapshots, 분류 내부 점수/용어 등)는 관리자 API에서만 제공한다.
5. 공개 조회는 시간 범위와 페이지 크기를 제한하고, 안정적인 커서 페이지네이션을 사용한다.
6. SEC 접수시각, RSS 게시시각, 앱 수집시각을 구별한다. `publishedAt` 하나를 SEC 접수시각으로 간주하지 않는다.

## 3. 사용자 API 계약

### 엔드포인트

기존 사용자 화면과 호환되게 `/api/market-news`를 미국 RSS 전용 사용자 API로 강화한다. `/api/disclosures`의 국내·통합 데이터 계약은 변경하지 않는다.

```text
GET /api/market-news?hours=24&source=ALL&pageSize=50&cursor=<opaque>
```

| 파라미터 | 규칙 |
|---|---|
| `hours` | 기본 24, 허용 1~168. 서버 현재 시각 기준 `[from, to)` 조회 |
| `source` | `ALL` 또는 허용된 미국 5개 출처만. 국내·미지원 출처는 HTTP 400 |
| `pageSize` | 기본 50, 허용 1~100. 기존 `limit`은 전환 기간 alias로 지원하고 최대 100으로 clamp |
| `cursor` | 선택. 서버 발급 opaque cursor; `published_at DESC, id DESC`의 keyset pagination |

초기 릴리스에서 기존 최신 200건 조회를 사용하는 다른 호출자가 있으면 사용처를 먼저 확인한다. `limit` alias는 하위 호환을 위해 유지하되 응답 상한을 넘지 못하게 한다.

### 사용자 응답 예시

```json
{
  "ok": true,
  "schemaVersion": "us-market-rss.v1",
  "scope": {
    "market": "US",
    "sources": ["SEC_EDGAR", "NASDAQ", "NASDAQ_TRADER", "STOCKTITAN", "GLOBENEWSWIRE"],
    "window": {
      "hours": 24,
      "from": "2026-10-07T00:00:00.000Z",
      "to": "2026-10-08T00:00:00.000Z"
    },
    "timezone": "UTC"
  },
  "items": [
    {
      "id": 123,
      "source": "SEC_EDGAR",
      "sourceLabel": "SEC EDGAR",
      "kind": "FILING",
      "documentType": "8-K",
      "title": {
        "original": "8-K - Example, Inc. (0000000000) (Filer)",
        "ko": "예시 기업 8-K 공시",
        "translationStatus": "TRANSLATED"
      },
      "summary": {
        "original": "Item 1.01: Entry into a Material Definitive Agreement",
        "ko": "중요 계약 체결",
        "contentStatus": "EXCERPT"
      },
      "content": {
        "original": null,
        "ko": null,
        "contentStatus": "METADATA_ONLY"
      },
      "entities": {
        "companyName": "Example, Inc.",
        "ticker": "EXMP",
        "tickerStatus": "VERIFIED"
      },
      "times": {
        "publishedAt": null,
        "filedAt": "2026-10-07T20:01:57.000Z",
        "fetchedAt": "2026-10-07T20:22:44.825Z"
      },
      "link": "https://www.sec.gov/Archives/..."
    }
  ],
  "page": { "pageSize": 50, "nextCursor": null, "hasMore": false },
  "total": 1
}
```

### 응답 필드 정의

- 최상위 `schemaVersion`, `scope`, `page`, `total`: 결과 의미와 범위, 페이지를 명확히 한다.
- `title.original`과 `title.ko`: 원문/한국어 제목. 번역 미완료·실패·검수 미통과이면 `ko`는 null 또는 안전한 fallback 제목으로 반환하고 상태를 표시한다. 원문 문자열을 번역 결과인 것처럼 중복 표시하지 않는다.
- `summary.original`과 `summary.ko`: 저장된 실제 요약만 제공한다. 원문 RSS summary가 공시 Item 목록과 같은 메타데이터라면 내용이 짧더라도 `EXCERPT` 또는 실제 길이에 맞는 상태를 설정한다.
- `content.original`과 `content.ko`: DB에 저장한 본문/본문 발췌만 제공한다. 원문 본문이 없는 SEC/NASDAQ 항목은 null과 `METADATA_ONLY`/`UNAVAILABLE`을 명시한다. 유저 GET 요청 중 외부 사이트를 실시간 크롤링하지 않는다.
- `entities.companyName`, `ticker`, `tickerStatus`: 검증된 SEC CIK 매핑 또는 신뢰 가능한 출처 매핑만 VERIFIED로 표시한다. 제목 내 단순 문자열 후보는 VERIFIED로 승격하지 않는다.
- `times`: `publishedAt`(출처 게시시각), `filedAt`(SEC 접수시각; 실제로 확보된 경우만), `fetchedAt`(수집시각)를 독립 표기한다. 원천이 시각 기준을 명시하지 않으면 null/unknown 상태를 보존한다.
- `link`: 제공자 원문 링크. SEC는 accession/index 및 가능하면 제출 문서의 직접 링크를 정규화하되, 인덱스에서 본문 문서를 찾지 못했으면 기존 링크를 유지한다.
- `sourceLabel`, `kind`, `documentType`: 화면에서 별도 추정 없이 출처와 공시/뉴스 유형을 표시한다.

사용자 API에서 제외할 필드: `rawPayload`, source snapshot, HTTP status/headers, fetch error 원문, `translationError`, provider 상세, retry attempts, 내부 classifier의 `matchedTerms`/점수, Discord/notification 상태, DB 내부 연결 정보.

## 4. 관리자 전용 디버깅 API 계약

현재 debug/translation route는 공개 상태이므로 관리자 전용으로 전환한다. 401/403은 일반화하고, 세션 비밀·웹훅·API key·authorization header·DB URL은 어떤 경우에도 반환하지 않는다.

권장 단일 읽기 전용 진단 API:

```text
GET /api/admin/debug/market-rss?hours=24&source=ALL&status=ALL&limit=50&offset=0
GET /api/admin/debug/market-rss?articleId=123
```

관리자 응답은 다음을 제공한다.

- 응답 메타: `requestId`, `checkedAt`, 요청 범위, API 처리시간.
- 출처 실행 현황: enabled/configured 여부, 최근 fetch 성공·실패시각, fetch run 식별자, 안전한 HTTP status, 수집/신규/중복/갱신 수, 파서 버전.
- 기사별 수집/저장 진단: 내부 article id, external id, source snapshot id, content hash, 필드 존재 여부와 길이, 게시·접수·수집·DB 갱신 시각.
- 번역 단계: status, provider의 공개 가능한 식별자, source/target language, attempt count, attempted/translated 시각, skip reason, sanitized error, fallback 여부, 원문·번역값 및 candidate 비교.
- 분류·ticker 연결: 분류 버전, category/direction/priority/notify eligibility 및 최종 사유, raw candidate와 verified ticker 분리, CIK/company mapping source.
- 원천 응답 상세는 `includeRaw=true`와 강한 페이지/크기 제한으로만 조회. 기본 응답은 `rawPayload`를 생략하고 길이/hash만 반환한다. 이 옵션에서도 credential/query/header는 항상 제거한다.
- DB 오류는 일반 코드와 requestId만 반환하고 원본 예외는 서버 로그에 보안 마스킹 후 기록한다.

현재 `/api/debug/market-rss-translations` 공개 진단 경로는 호환 기간 후 제거하거나 관리자 인증을 강제하는 경로로 이전한다. 디버깅 목적의 정보가 `/api/market-news` 응답으로 새어 들어오는 구조는 허용하지 않는다.

## 5. 데이터 수집·콘텐츠 충실도

사용자 API가 반환하는 정보의 양은 원천 피드가 제공하는 내용 및 DB에 적재된 내용에 한정된다. “핵심 정보를 최대화”하기 위해 사용자 조회 시 임의 원문 크롤링을 추가하지 않고, ingestion 단계에서 출처별로 본문 충실도를 높인다.

1. **SEC EDGAR**: accession에서 제출 index를 확인하고 Form 8-K 등 주 문서를 찾아 본문 또는 Item 섹션 발췌를 저장한다. index에 문서가 없거나 fetch 실패 시 RSS 요약과 METADATA_ONLY 상태를 그대로 유지한다. Item 번호와 form type은 별도 메타데이터로 저장한다.
2. **NASDAQ / NASDAQ Trader**: 피드가 제공하는 description/content를 손실 없이 정규화해 저장한다. 링크를 통한 추가 페이지 fetch는 공식 endpoint/사용정책과 기존 수집 예산 검토 후 별도 결정한다.
3. **StockTitan / GlobeNewswire**: RSS summary/content가 있으면 저장하고, 없는 경우에는 제목/링크로 제한한다. 페이지 크롤링은 요청 시점의 사용자 조회가 아니라 별도 수집 정책·rate limit·robots/이용조건 검토 아래에서만 고려한다.
4. HTML은 저장 전에 안전한 텍스트 또는 허용된 서식으로 정규화한다. 길이 상한을 두되 원문 해시와 truncate 상태를 기록한다.
5. 번역은 원문과 독립 필드로 저장한다. 제목·요약·본문을 서로 다른 상태로 추적할 수 있게 하되, 기존 스키마에서 본문 번역 상태를 구분할 수 없다면 이행 마이그레이션 단계에서 확장한다. 번역 누락이 원문 손실을 유발하지 않아야 한다.
6. SEC `publishedAt`이 접수시각인지 피드 게시시각인지 모호한 현재 상태를 개선한다. SEC acceptance timestamp는 `filedAt`에 저장하고 RSS pubDate는 `publishedAt`에 보존한다. 기존 값의 의미를 검증 없이 일괄 이동하지 않는다.

## 6. 성능·보안·호환성

- `market_rss_articles` 조회는 시간구간 + 출처 + `(published_at DESC, id DESC)` keyset pagination을 사용한다. 실제 쿼리계획 확인 후 필요한 부분 인덱스를 migration으로 추가한다.
- 사용자 기본 응답은 최대 50건, 요청 상한 100건. 본문 길이는 서버 상한(초기 제안 20KB/item) 적용하고 `contentStatus=TRUNCATED` 및 원문 길이/hash를 명시한다. 한 응답의 전체 최대 payload도 제한한다.
- DB 쿼리에서는 사용자 DTO에 필요한 컬럼만 select하고 raw payload, 내부 번역 오류는 가져오지 않는다.
- 실패 시 안정적인 JSON error code를 반환하고 DB 오류/stack trace는 숨긴다.
- Cursor는 정렬 키를 서명/opaque 처리하고 최대 유효 기간을 두며, 사용자가 임의 DB offset을 대규모로 탐색하지 못하게 한다.
- API 응답 `Cache-Control: no-store`를 유지한다. 사용자 인증/개인 데이터가 현재 API 범위에 포함되지 않으므로 공개 뉴스 정보로만 응답한다.
- `/api/disclosures` 기존 국내 RSS·DART 전체 JSON 복사 계약은 그대로 유지한다. 필요 시 출처 집합을 명시해 국내/미국 피드 혼합은 해당 API 목적에 맞춰 유지한다.

## 7. 구현 순서 및 검증 게이트

1. 호출처를 전수 검색해 `/api/market-news`의 기존 계약/호환 사용자를 확정한다.
2. 공유 DTO·source allowlist·cursor/time window validator를 정의한다.
3. `/api/market-news`를 미국 출처 allowlist 기반으로 강화하고 안정적인 페이지 계약을 구현한다.
4. `/market-news` UI의 출처 선택지를 정적 미국 source registry로 고정하고, 종목명·티커·시각·번역 상태·content status를 실제 응답에 맞게 표시한다.
5. `/api/debug/market-rss` 관리자 인증 경로를 추가하고 기존 공개 번역 진단 API를 인증/이전한다.
6. SEC 본문 적재와 field별 상태를 별도 ingestion 작업으로 개발한다. 외부 live GET이 DB 응답을 대체하지 않게 한다.
7. DB migration이 필요하면 설계/문서와 롤백 방법을 먼저 작성하고 필요한 컬럼/인덱스만 추가한다.

자동 테스트 최소 요구:

- 미국 5개 source만 허용, 국내/unknown source 거부, default ALL 동작.
- 원문·한국어 번역, translation fallback/status, metadata-only/full/truncated 상태별 DTO 정확성.
- ticker VERIFIED/UNVERIFIED 구분, SEC filedAt과 feed publishedAt 분리.
- keyset cursor 경계에서 중복/누락 없음, 최대 페이지와 잘못된 cursor 거부.
- rawPayload 및 진단키가 사용자 API JSON에 포함되지 않음.
- debug API 무인증 401, 관리자 인증 허용, 오류/자격증명 마스킹.
- DB 장애 시 사용자/관리자 오류 응답에 민감한 세부사항이 노출되지 않음.
- `/disclosures` 기존 날짜/시간 구간·국내 출처 JSON 복사 테스트 회귀 없음.
- `npm.cmd run typecheck`, 전체 관련 Vitest, build, `.env.local` 주입 dev server 실행 및 사용자/관리자 endpoint 실제 JSON 확인.

## 8. 단계별 완료 정의

- 설계 완료: 현행 route/schema/UI의 책임과 공개 진단 노출 문제, 사용자 DTO와 관리자 DTO를 문서로 명시했다.
- API 구현 완료: source 제한, DTO, pagination, 필드/보안 테스트가 모두 통과한다.
- 콘텐츠 개선 완료: ingestion이 SEC 원문을 안정적으로 적재하고 failure/status/limits를 검증 가능한 테스트로 보장한다.
- 운영 완료: 배포 뒤 운영 사용자 API에는 미국 핵심 데이터만, 관리자 API에만 진단 필드가 보이는 실제 응답을 확인한다.

설계 문서 작성만으로 API 구현이나 운영 적용이 완료된 것으로 표시하지 않는다.

## 공식 참고

- [SEC EDGAR submissions/company filing data](https://www.sec.gov/edgar/sec-api-documentation)
- [SEC EDGAR filer manual](https://www.sec.gov/edgar/filer-information/current-edgar-filer-manual)
- RSS 2.0 specification (RSS Advisory Board): https://www.rssboard.org/rss-specification
