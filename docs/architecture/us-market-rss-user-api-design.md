# 미국 RSS 사용자 조회 API 설계안

## 상태 및 범위

- 상태: 사용자 조회 API 1차 구현 반영, 관리자 진단 API·콘텐츠 확충은 후속 작업
- 대상: 사용자 UI에서 사용하는 미국 뉴스·공시 제목 조회 API와 관리자 전용 RSS 진단 API
- 미국 출처: `SEC_EDGAR`, `NASDAQ`, `NASDAQ_TRADER`, `STOCKTITAN`, `GLOBENEWSWIRE`
- 국내 출처(KRX KIND, DART, 국내 언론 RSS)는 이 API 범위에서 제외한다. 국내 공시·RSS 조회는 기존 `/api/disclosures` 경로를 유지한다.
- 구현 상태는 사용자 조회 API의 현재 동작을 기록하며, 이 문서의 관리자 진단·콘텐츠 수집 항목은 별도 후속 범위다.

## 1. 현재 구조와 문제

### 사용자 조회 경로 — 2026-10-26 1차 구현 전 기준선

- 당시 `/api/market-news`는 `market_rss_articles`에서 최신순으로 최대 200건을 읽고 `source`를 임의 문자열로 받았다. 현재 1차 구현은 미국 source allowlist, 시간/출처/종류/티커 필터와 커서 페이지 계약을 적용했다.
- 당시 사용자 응답에는 번역 상태, 회사명, 콘텐츠 상태, 원문 본문, 수집시각, 페이지 메타데이터가 없었다. 현재 항목 응답은 원문/한국어 제목과 링크만 반환하며 페이지 메타데이터는 최상위에 둔다.
- `/api/disclosures`는 국내 RSS, 해외 RSS, DART/SEC filing을 한 경로에서 조회하며 `content`, `fetchedAt` 등 필드를 반환한다. 이는 국내 공시/전체 JSON 내보내기 용도와 미국 RSS 사용자 피드 용도가 섞이지 않도록 경계를 유지해야 한다.
- 당시 `market-news-page.tsx`는 `/api/market-news?limit=200`을 호출하고 현재 응답에서 출처 선택지를 만들었다. 현재 UI는 공유 source registry와 1~24시간(기본 1시간), 종류/티커 필터, URL 조건 보존, 더 보기 UI를 사용한다.

### 관리자 진단 경로

- `/api/admin/market-rss-test`, `/api/admin/market-rss-signal-test`, `/api/admin/stocktitan-rss`, `/api/admin/debug-suite`는 관리자 세션을 확인하는 운영/테스트 경로다.
- `/api/debug/market-rss-translations`는 번역 상태와 오류 정보를 반환하지만 현재 관리자 인증 없이 읽을 수 있다. RSS 디버깅 데이터는 관리자 전용이어야 하므로 구현 단계에서 인증을 추가해야 한다.
- 운영 디버깅 필드와 원문 저장용 payload를 사용자 DTO에 섞지 않는다. 사용자 항목 DTO는 제목과 원문 링크만 포함한다.

## 2. 목표 원칙

1. 사용자 RSS 조회는 위에 명시한 미국 5개 출처만 허용한다. 출처 미지정은 미국 출처 전체로 처리한다.
2. 사용자 항목은 DB에 저장된 원문 제목과 실제 한국어 제목(있을 때), 원문 링크만 돌려준다. 제목으로 본문을 추정하지 않는다.
3. 제목은 원문/한국어 필드를 별도로 제공하며, 한국어 제목이 없으면 UI에서 원문 제목을 보여준다.
4. 관리자 전용 진단 정보(번역 실패 원문 오류, provider/시도 정보, fetch HTTP 정보, raw payload, source snapshots, 분류 내부 점수/용어 등)는 관리자 API에서만 제공한다.
5. 공개 조회는 시간 범위와 페이지 크기를 제한하고, 안정적인 커서 페이지네이션을 사용한다.
6. 내부 조회에서 SEC 접수시각, RSS 게시시각, 앱 수집시각의 의미를 혼동하지 않는다. 사용자 제목 피드 항목에는 이 시각들을 노출하지 않는다.

## 3. 사용자 API 계약

### 엔드포인트

기존 사용자 화면과 호환되게 `/api/market-news`를 미국 RSS 전용 사용자 API로 제공한다. `/api/disclosures`의 국내·통합 데이터 계약은 변경하지 않는다.

```text
GET /api/market-news?hours=1&source=ALL&kind=ALL&pageSize=50&cursor=<opaque>
```

| 파라미터 | 규칙 |
|---|---|
| `hours` | 기본 1, 허용 1~24. 게시시각이 있으면 게시시각 기준, 없으면 최초 저장시각 기준으로 `[from, to)` 조회 |
| `source` | 기본 `ALL`; `ALL` 또는 허용된 미국 5개 출처만. 국내·미지원 출처는 HTTP 400 |
| `kind` | 선택. `ALL`, `NEWS`, `FILING`; SEC EDGAR를 공시로 분류하고 다른 허용 출처는 뉴스로 표시 |
| `ticker` | 선택. 형식이 유효한 티커의 완전 일치 검색. 표시용이 아니라 제목 목록 필터로 사용 |
| `pageSize` | 기본 50, 허용 1~100. 기존 `limit`은 호환 alias로 지원 |
| `cursor` | 선택. 서버 발급 opaque base64url cursor; `published_at DESC NULLS LAST, id DESC`의 keyset pagination. 최초 요청의 시간 구간과 필터 범위를 보존 |

기존 호출처 전수 검색 결과 `/market-news` 화면만 이 API를 사용했다. `limit` alias는 하위 호환으로 유지하며 1~100 범위로 제한한다. 커서는 base64url JSON이며 쿼리 필터와 시간 범위를 검증하고 30분 이상 지난 커서는 거부한다. 커서 payload는 암호학적으로 서명하지 않으며, 이 엔드포인트는 공개 뉴스 데이터만 제공한다.

### 사용자 응답 예시

```json
{
  "ok": true,
  "schemaVersion": "us-market-rss.v1",
  "scope": {
    "market": "US",
    "sources": ["SEC_EDGAR", "NASDAQ", "NASDAQ_TRADER", "STOCKTITAN", "GLOBENEWSWIRE"],
    "window": {
      "hours": 1,
      "from": "2026-10-07T19:00:00.000Z",
      "to": "2026-10-07T20:00:00.000Z"
    },
    "source": "ALL",
    "kind": "ALL",
    "ticker": null,
    "timezone": "UTC"
  },
  "items": [
    {
      "title": {
        "original": "8-K - Example, Inc. (0000000000) (Filer)",
        "ko": null
      },
      "link": "https://www.sec.gov/Archives/..."
    }
  ],
  "page": { "pageSize": 50, "returned": 1, "nextCursor": null, "hasMore": false }
}
```

### 응답 필드 정의

- 최상위 `schemaVersion`, `scope`, `page`: 결과 의미와 범위, 페이지를 명확히 한다. `total` 전체 건수는 매 요청에서 세지 않는다.
- `title.original`과 `title.ko`: 원문/저장된 한국어 제목. 한국어 제목이 준비되지 않으면 `ko`는 null이고 UI는 원문 제목을 표시한다.
- `link`: 제목을 누르면 해당 제공자 원문으로 이동한다.
- 응답 최상위 `scope`와 `page`에는 시간/필터 범위 및 cursor 정보를 제공한다. 항목은 오직 `title`과 `link`를 포함한다.

사용자 API 항목은 `title`과 `link`만 포함한다. ID, source, kind, summary, content, entities, times, 번역 상태 및 내부 진단 필드를 항목에 포함하지 않는다.

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

## 5. 기존 RSS 수집 구조 참고

현재 제목 전용 사용자 API는 원천 피드를 조회 시점에 크롤링하지 않는다. 이 섹션은 기존 ingestion 저장 구조의 배경이며, 아래 저장 필드를 사용자 피드에 노출하라는 의미가 아니다. 사용자 피드는 제목과 원문 링크만 반환한다.

현재 요청은 기존 ingestion 동작의 변경을 요구하지 않는다. 제목 피드 API는 수집된 데이터를 읽으며, 사용자 조회 시 원문 크롤링이나 제목 외 콘텐츠 처리를 추가하지 않는다.

## 6. 성능·보안·호환성

- `market_rss_articles` 조회는 시간구간 + 출처 + `(published_at DESC, id DESC)` keyset pagination을 사용한다. 실제 쿼리계획 확인 후 필요한 부분 인덱스를 migration으로 추가한다.
- 사용자 기본 응답은 최대 50건, 요청 상한 100건으로 페이지를 제한한다. 항목은 제목과 링크로 제한한다.
- DB 쿼리에서는 사용자 DTO에 필요한 컬럼만 select하고 raw payload, 내부 번역 오류는 가져오지 않는다.
- 실패 시 안정적인 JSON error code를 반환하고 DB 오류/stack trace는 숨긴다.
- Cursor는 정렬 키를 서명/opaque 처리하고 최대 유효 기간을 두며, 사용자가 임의 DB offset을 대규모로 탐색하지 못하게 한다.
- API 응답 `Cache-Control: no-store`를 유지한다. 사용자 인증/개인 데이터가 현재 API 범위에 포함되지 않으므로 공개 뉴스 정보로만 응답한다.
- `/api/disclosures` 기존 국내 RSS·DART 전체 JSON 복사 계약은 그대로 유지한다. 필요 시 출처 집합을 명시해 국내/미국 피드 혼합은 해당 API 목적에 맞춰 유지한다.

## 7. 구현 순서 및 검증 게이트

1. 호출처 검색으로 기존 사용자 호출처 `/market-news`를 확인했다.
2. 공유 source registry를 만들고 route와 UI에 적용했다.
3. **1차 구현 반영**: `/api/market-news`는 미국 출처 allowlist, 시간·출처·종류·티커 필터, keyset pagination을 적용한다. 각 항목은 `{ title: { original, ko }, link }`만 반환한다.
4. **1차 구현 반영**: `/market-news`는 1~24시간 필터(기본 1시간), 정적 출처, 종류/티커 필터, URL 조건 보존, 원문/한국어 제목 전환, 오류/빈 결과와 더 보기 UI를 제공한다.
5. 관리자 진단 API 인증 이전은 별도 작업이며 이번 제목 피드 구현에 포함되지 않는다.

자동 테스트 최소 요구:

- 미국 5개 source allowlist 및 잘못된 출처 거부.
- 기간 기본값 1시간과 1~24 범위, 티커 완전일치 필터 확인.
- 항목 응답 키가 `title`과 `link`뿐이고 제목 안의 키가 `original`과 `ko`뿐인지 확인.
- 원문/한국어 제목 전환 및 한국어 제목이 없을 때 원문 fallback 확인.
- keyset cursor 경계 중복/누락 없음, 최대 페이지와 잘못된 cursor 거부.
- 오류 응답에서 DB 예외 세부사항이 노출되지 않음.
- 테스트·build·실제 endpoint 검증은 별도 요청/검증 단계에서 수행하고 결과를 작업 기록에 남긴다.

## 8. 단계별 완료 정의

- 설계 완료: 현행 route/schema/UI의 책임과 공개 진단 노출 문제, 사용자 DTO와 관리자 DTO를 문서로 명시했다.
- API 1차 구현: source 제한, 제목 전용 DTO, 기간/필터, pagination을 적용했다. 관련 검증과 실제 endpoint 확인 전에는 구현 완료로 보지 않는다.
- 운영 완료: 배포 뒤 기간·필터·페이지 동작과 제목 전용 응답을 실제 endpoint에서 확인한다.
- 관리자 진단 API 완료: 인증·오류 마스킹·페이지 제한을 별도 검증한 뒤에만 완료로 표시한다.

설계 문서 작성만으로 API 구현이나 운영 적용이 완료된 것으로 표시하지 않는다.

## 공식 참고

- [SEC EDGAR submissions/company filing data](https://www.sec.gov/edgar/sec-api-documentation)
- [SEC EDGAR filer manual](https://www.sec.gov/edgar/filer-information/current-edgar-filer-manual)
- RSS 2.0 specification (RSS Advisory Board): https://www.rssboard.org/rss-specification
