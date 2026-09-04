# 국내 공시·RSS 통합 수집 및 분석용 JSON 설계안

## 문서 상태

- 상태: 1차 adapter 구현 완료, 통합 저장·자동화 확장 진행 중
- 대상: KRX KIND, OpenDART, 뉴시스, 매일경제, 한국경제, 이투데이 및 등록된 공식 RSS
- 조회 경로: `/disclosures`
- 최종 소비자: 저장된 원문을 이용한 ChatGPT 호재 분석

## 1. 목표와 범위

각 출처의 원본 응답을 보존하면서, 동일한 표준 스키마로 정규화하여 PostgreSQL에 저장한다.

1. 출처별 수집 범위와 마지막 성공 시각을 추적한다.
2. 동일 항목을 중복 저장하지 않고, 원문 변경은 새 스냅샷으로 보존한다.
3. `/disclosures`는 화면에 공시 본문을 나열하는 대신 조건에 맞는 전체 JSON을 복사할 수 있게 한다.
4. ChatGPT 분석에 필요한 제목·요약·본문·공시 유형·종목·시각·원문 링크·수집 상태를 한 번에 제공한다.
5. 한 출처의 장애가 다른 출처 수집과 기존 저장 데이터 조회를 중단시키지 않게 한다.

“전체”는 인터넷의 모든 뉴스가 아니라, 관리자가 등록하고 해당 제공자가 공개한 공식 RSS/API의 전체 범위를 뜻한다. RSS가 제공하지 않는 과거·본문은 추정하거나 생성하지 않고 상태로 표시한다.

## 2. 출처와 수집 어댑터

| source | 입력 | 수집 책임 | 기본 식별자 |
|---|---|---|---|
| `KRX_KIND` | KIND 오늘의공시 RSS/공식 조회 응답 | 거래소 공시 목록·공시 시각·원문 링크 | 공시번호 또는 원문 URL 해시 |
| `DART` | OpenDART `list.json` | 접수일 기준 전체 페이지, 회사·보고서·접수번호 | `rcept_no` |
| `NEWSIS` | 뉴시스가 공개한 RSS URL | 기사 제목·요약·발행시각·원문 링크 | RSS guid, 없으면 링크 |
| `MK` | 매일경제가 공개한 RSS URL | 동일 | RSS guid, 없으면 링크 |
| `HANKYUNG` | 한국경제가 공개한 RSS URL | 동일 | RSS guid, 없으면 링크 |
| `ETODAY` | 이투데이가 공개한 RSS URL | 동일 | RSS guid, 없으면 링크 |
| `RSS_*` | 관리자 승인 RSS 레지스트리 | 등록된 각 공식 RSS | guid 또는 링크 |

출처별 adapter는 `fetch → parse → normalize`만 담당한다. 호재 판정, 번역, Discord 전송은 수집 adapter에 넣지 않고 후속 파이프라인에서 처리한다.

현재 1차 구현은 `lib/domestic-rss-sources.ts`에서 출처별 환경변수 URL을 읽어 공통 RSS parser로 정규화한다. 설정된 국내 RSS는 기존 `market-rss-pipeline`을 통해 `market_rss_fetch_snapshots`와 `market_rss_articles`에 저장되고, `/api/disclosures?source=KRX_KIND|NEWSIS|MK|HANKYUNG|ETODAY`로 조회한다. URL이 설정되지 않은 출처는 `SKIPPED`로 처리하여 전체 cron을 실패시키지 않는다.

환경변수 이름은 `KRX_KIND_RSS_URL`, `NEWSIS_RSS_URL`, `MK_RSS_URL`, `HANKYUNG_RSS_URL`, `ETODAY_RSS_URL`이다. 실제 값은 각 제공자가 공개한 공식 RSS 주소만 사용하며 문서나 저장소에 URL 인증값을 기록하지 않는다.

### 공식 출처 사용 원칙

- KIND 오늘의공시는 거래소가 제공하는 공시 목록과 원문 링크를 기준으로 한다.
- OpenDART `list.json`은 `bgn_de`, `end_de`, `page_no`, `page_count`를 사용하고 `total_page`까지 순회한다. 페이지당 최대 100건 제한을 따른다.
- 언론사는 공개 RSS URL과 이용 조건을 출처 레지스트리에 등록한다. RSS가 제공하는 제목·요약·링크만 저장하고, 원문 전문을 별도 크롤링하지 않는다.
- SEC 등 해외 출처는 현재 `market_rss_articles`·`filings` 경계를 유지하고, 이 설계에서는 공통 source adapter 계약에 맞춰 확장한다.

## 3. 저장 모델

기존 `market_rss_articles`, `market_rss_fetch_snapshots`, `filings`를 즉시 폐기하지 않는다. 먼저 통합 테이블을 추가하고, 기존 데이터는 projection으로 연결한다.

### 3.1 `disclosure_sources`

출처 레지스트리와 운영 설정을 저장한다.

| 컬럼 | 설명 |
|---|---|
| `source_key` PK | `KRX_KIND`, `DART`, `NEWSIS` 등 |
| `label` | 사용자 표시명 |
| `source_type` | `EXCHANGE`, `OFFICIAL_API`, `NEWS_RSS`, `MARKET_RSS` |
| `feed_url` | 공식 RSS/API URL |
| `enabled` | 자동 수집 활성화 여부 |
| `poll_interval_seconds` | 최소 수집 간격 |
| `retention_days` | 원문 보존 정책 |
| `config` JSONB | 파서 버전·추가 매개변수 |
| `last_success_at`, `last_failure_at` | 운영 현황 |
| `created_at`, `updated_at` | 감사 시각 |

URL은 코드에 흩어지지 않고 레지스트리에서 관리한다. 신규 RSS 추가는 레코드 추가와 adapter 선택으로 가능해야 한다.

### 3.2 `disclosure_fetch_runs`

한 출처의 한 번의 수집 실행을 기록한다.

| 컬럼 | 설명 |
|---|---|
| `id` PK | 실행 ID |
| `source_key` | 출처 |
| `request_id`, `cron_run_id` | 공통 디버깅 추적값 |
| `status` | `SUCCESS`, `PARTIAL`, `FAILED`, `SKIPPED` |
| `http_status` | HTTP 응답 상태 |
| `item_count`, `inserted_count`, `updated_count`, `duplicate_count` | 결과 통계 |
| `oldest_published_at`, `newest_published_at` | 이번 응답 범위 |
| `error_code`, `error_message` | 외부 노출 금지 내부 오류 |
| `started_at`, `finished_at` | 실행 시각 |

### 3.3 `disclosure_source_snapshots`

피드/API 원본 응답을 보존한다.

| 컬럼 | 설명 |
|---|---|
| `id` PK | 스냅샷 ID |
| `source_key`, `url` | 출처·요청 주소 |
| `request_params` JSONB | 인증값을 제외한 요청 파라미터 |
| `response_headers` JSONB | 민감 헤더 제거 후 저장 |
| `raw_body` | 원본 XML/JSON/HTML 응답 |
| `content_hash` | SHA-256 |
| `parser_version` | 파서 버전 |
| `http_status`, `fetched_at` | 응답 상태·수집 시각 |

같은 `source_key + content_hash`는 중복 스냅샷을 만들지 않는다. 단, 수집 실행 이력은 별도로 남긴다.

### 3.4 `unified_disclosures`

분석과 `/disclosures` JSON의 기준 테이블이다.

| 컬럼 | 설명 |
|---|---|
| `id` PK | 내부 ID |
| `source_key`, `external_id` | 출처별 외부 식별자, 복합 유일 |
| `source_snapshot_id` | 원본 응답 연결 |
| `item_hash` | 정규화 항목 해시 |
| `kind` | `EXCHANGE_DISCLOSURE`, `REGULATORY_FILING`, `NEWS` |
| `title`, `summary`, `content` | 원문 필드, 없는 값은 NULL |
| `content_status` | `FULL`, `EXCERPT`, `METADATA_ONLY`, `UNAVAILABLE` |
| `company_names` JSONB | 추출·검증된 회사명 배열 |
| `tickers` JSONB | 검증된 종목코드 배열 |
| `corp_codes` JSONB | DART 고유번호 배열 |
| `form_type`, `disclosure_type` | 공시 분류 |
| `published_at`, `filed_at`, `fetched_at` | 발행·접수·수집 시각 |
| `published_date_seoul` | KST 날짜 조회용 |
| `link` | 원문 링크 |
| `language`, `translation_status` | 언어·번역 상태 |
| `analysis_status`, `analysis_json` | ChatGPT 분석 결과 저장 영역(선택) |
| `created_at`, `updated_at` | 저장·갱신 시각 |

유일키는 `(source_key, external_id)`로 한다. 원문이 수정된 경우 현재 정규화 값은 갱신하되 이전 원본은 스냅샷과 `item_hash`로 남긴다. 삭제 대신 `is_withdrawn` 또는 `is_hidden` 상태를 사용한다.

### 3.5 종목 연결

RSS 제목의 문자열만으로 티커를 확정하지 않는다.

1. DART: `corp_code → 종목코드·회사명` 유니버스 매핑.
2. KIND: 공시 제공 회사명·종목코드가 있으면 공식 값 우선.
3. 언론 RSS: 제목·요약에서 후보를 추출한 후 국내 유니버스와 일치할 때만 검증 티커로 저장.
4. 매핑되지 않은 후보는 `unresolved_entities`로 보존하되 `tickers`에는 넣지 않는다.

## 4. 수집 파이프라인

```text
OCI timer / 수동 관리자 실행
        ↓
disclosure-ingestion-job
        ↓ (출처별 격리)
source registry → collector → parser → normalizer
        ↓
source snapshot + unified disclosure upsert
        ↓
ticker mapping → translation(title 선택) → analysis queue
        ↓
/api/disclosures → 전체 JSON 복사 → ChatGPT 분석
```

- 출처별 작업은 병렬 실행할 수 있지만 DB upsert와 실행 이력은 독립적으로 기록한다.
- 조건부 실패는 `PARTIAL`로 저장하고 이미 성공한 항목을 롤백하지 않는다.
- 네트워크·429·5xx는 지수 백오프와 재시도 큐를 사용한다.
- 동일 항목은 upsert하고, 같은 실행에서 중복된 guid/link는 한 번만 처리한다.
- 수집기는 외부 원문을 직접 화면/API에 전달하지 않고 DB 저장 후 조회 API가 읽는다.

## 5. 자동화 일정

기존 `scripts/oci-cron.sh`에 별도 엔드포인트를 추가한다.

`POST /api/cron/disclosures`

- KRX KIND·DART: 장중/공시 집중 시간 1~5분 주기, 장외에는 완화.
- 뉴스 RSS: 피드별 `poll_interval_seconds`를 레지스트리 설정으로 적용.
- 하루 종료 시 누락 보정 job이 당일 날짜를 다시 조회한다.
- DART는 `list.json`의 날짜·페이지 경계를 끝까지 확인한다.
- RSS는 `ETag`·`Last-Modified`를 저장하고 조건부 요청을 사용한다.

기존 `market-rss`, `sync-filings`와 책임이 겹치지 않도록 다음 중 하나만 선택한다.

1. 1단계: 기존 job은 유지하고 새 통합 job은 `unified_disclosures` projection만 담당한다.
2. 2단계: 출처별 수집을 통합 job으로 이전하고 기존 job은 호환 호출/알림만 담당한다.

운영 전환 전에는 두 job이 같은 Discord 알림을 중복 발송하지 않도록 `alert_events` 또는 공통 delivery key를 사용한다.

## 6. `/disclosures` JSON 계약

### 조회

`GET /api/disclosures?date=YYYY-MM-DD&source=all&page=1&pageSize=500`

응답 예시:

```json
{
  "schemaVersion": "disclosures.v2",
  "date": "2026-09-04",
  "timezone": "Asia/Seoul",
  "source": "all",
  "sort": { "field": "publishedAt", "direction": "desc" },
  "coverage": {
    "requestedSources": ["KRX_KIND", "DART", "NEWSIS", "MK", "HANKYUNG", "ETODAY"],
    "successfulSources": ["DART"],
    "failedSources": ["NEWSIS"],
    "lastFetchedAt": "2026-09-04T06:00:00.000Z"
  },
  "items": [
    {
      "id": "...",
      "source": "DART",
      "kind": "REGULATORY_FILING",
      "externalId": "20260904999999",
      "title": "...",
      "summary": null,
      "content": null,
      "contentStatus": "METADATA_ONLY",
      "companyNames": ["..."],
      "tickers": ["005930"],
      "publishedAt": null,
      "filedAt": "2026-09-04T05:59:00.000Z",
      "fetchedAt": "2026-09-04T06:00:00.000Z",
      "link": "https://...",
      "analysis": { "status": "PENDING" }
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 500
}
```

화면은 날짜·출처 select-box와 `전체 JSON 복사`만 제공한다. 복사 대상은 화면에 표시하지 않은 원문 필드와 `coverage`까지 포함한 API 응답 전체다. 복사 실패는 브라우저 기본 오류를 노출하지 않고 접근성 상태 메시지로 알린다.

### ChatGPT 분석 입력

분석 요청은 수집 조회와 분리한다.

`POST /api/disclosures/analyze`

- 입력: `date`, `source`, `itemIds[]`, `promptVersion`
- 서버는 DB의 원문·메타데이터를 읽어 분석용 payload를 만든다.
- 분석 결과에는 `evidenceItemIds[]`, `confidence`, `limitations`, `generatedAt`을 반드시 포함한다.
- 제목만 있는 항목은 본문이 있는 것처럼 분석하지 않고 `contentStatus`를 근거 제한으로 전달한다.

## 7. 관리자·디버깅

관리자에서 다음을 확인한다.

- 출처 활성화·공식 URL·수집 주기·파서 버전
- 최근 실행 상태, 응답 코드, 신규/중복/갱신 건수
- 출처별 최신 발행일과 마지막 성공 시각
- 원본 스냅샷 해시와 정규화 결과 비교
- 티커 매핑 미해결 건수
- 분석 큐 대기·성공·실패 건수

민감한 인증키, 쿠키, Authorization, 실제 웹훅 URL은 원본 응답·로그·JSON 복사 결과에서 마스킹한다.

## 8. 품질 게이트와 테스트

1. RSS XML, Atom, JSON, 빈 응답, 잘못된 날짜, 중복 guid, HTML 엔티티를 fixture로 테스트한다.
2. DART `total_page` 순회, KIND 공시번호 중복, 언론사 동일 링크 재수집을 검증한다.
3. 한 출처 500/429/timeout이 다른 출처 결과를 제거하지 않는지 검증한다.
4. KST 날짜 경계와 UTC 저장 시각을 검증한다.
5. JSON 복사 결과가 API 응답과 동일하고 모든 필드를 보존하는지 검증한다.
6. 원문 없는 항목은 `METADATA_ONLY`로 남고 분석 근거에서 과장되지 않는지 검증한다.
7. `npm test -- --run`, `npm run typecheck`, `npm run docs:check`, `npm run cron:check`를 배포 게이트로 사용한다.

## 9. 단계별 구현 순서

1. 출처 레지스트리와 공식 RSS/API URL을 확인·등록한다.
2. 공통 `DisclosureSourceAdapter`·정규화 타입·repository를 추가한다.
3. `KRX_KIND`, `DART`, 뉴시스·매일경제·한국경제·이투데이 adapter를 출처별로 구현한다.
4. 스냅샷·실행 이력·통합 항목 Flyway migration을 추가한다.
5. 출처별 격리 수집 job과 `/api/cron/disclosures`를 연결한다.
6. 기존 `/api/disclosures`를 통합 테이블 projection으로 전환하고 JSON 복사를 유지한다.
7. 관리자 관측 화면과 ChatGPT 분석용 payload/큐를 연결한다.
8. 실제 운영 피드로 누락·중복·날짜 경계·장애 복구를 검증한 후 기존 중복 수집 경로를 정리한다.

이 문서는 설계안이며, migration·adapter·cron·API·테스트가 모두 연결되기 전에는 구현 완료로 간주하지 않는다.

## 공식 참고

- [OpenDART `list.json` 개발가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001)
- [OpenDART API 목록](https://opendart.fss.or.kr/intro/infoApiList.do)
- [KRX KIND 오늘의공시](https://kind.krx.co.kr/disclosure/todaydisclosure.do?marketType=4&method=searchTodayDisclosureMain)
- [뉴시스 RSS](https://www.newsis.com/RSS/)
