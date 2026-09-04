# 일별 공시·RSS 통합 조회 설계안

## 문서 상태

- 상태: 구현 전 설계안
- 범위: 국내·해외 공시와 RSS를 일자·출처 기준으로 조회
- 관련 코드: `market_rss_articles`, `sec_submissions`, `sec_filing_documents`, `filings`

## 목표

사용자가 지정한 기준일의 공시·RSS를 발행/접수 시각 내림차순으로 확인한다.

1. 일별 전체 보기: 지원 가능한 모든 출처를 하나의 시간순 목록으로 표시한다.
2. 출처별 보기: `DART`, `SEC_EDGAR`, `STOCKTITAN`, `NASDAQ` 등 출처 하나를 선택해 필터링한다.
3. 각 항목에서 제목, 요약, 내용 또는 본문 발췌, 원문 링크, 티커·회사명을 확인한다.
4. 원문이 없는 항목은 내용을 추정해 만들지 않고 `contentStatus`로 표시한다.
5. 모든 항목은 사용자가 한 번에 복사할 수 있어야 한다.

## 공식 데이터 범위와 한계

### OpenDART

OpenDART `list.json`은 접수일자, 회사명, 보고서명, 접수번호 등 공시 목록 메타데이터를 제공한다. 기간과 페이지를 지정해 일별 목록을 끝까지 순회한다. 목록 응답만으로는 모든 공시 본문이 내려오지 않으므로 `rcept_no`를 기준으로 원문 문서를 별도 조회·저장한다.

### SEC EDGAR

SEC `data.sec.gov/submissions/CIK##########.json`은 회사별 제출 메타데이터를 제공하며, EDGAR 검색 RSS는 검색 조건별 피드다. 따라서 전체 일별 수집은 회사별 RSS만 합치는 방식이 아니라 제출 메타데이터/EDGAR 원문 경로를 기준으로 수집하고, RSS는 별도 출처로 보존한다. SEC 접근 정책에 맞는 식별 가능한 User-Agent와 호출 제한을 적용한다.

### 제3자·시장 RSS

StockTitan, NASDAQ 등 RSS는 해당 피드가 제공하는 범위만 보장한다. “모든 인터넷 뉴스”를 의미하지 않으며, 원문·요약의 존재 여부와 피드 수집 시각을 함께 저장한다.

## 통합 데이터 계약

기존 테이블을 우선 재사용한다. 중복 저장을 피하기 위해 통합 조회 모델은 다음 필드를 제공한다.

```ts
type DailyDisclosureItem = {
  id: string;
  source: string;
  sourceType: "DART" | "SEC_EDGAR" | "RSS";
  externalId: string;
  title: string;
  summary: string | null;
  content: string | null;
  contentStatus: "FULL" | "EXCERPT" | "METADATA_ONLY" | "UNAVAILABLE";
  link: string | null;
  tickers: string[];
  companyNames: string[];
  publishedAt: string | null;
  filedAt: string | null;
  fetchedAt: string;
  sourceSnapshotId: string | null;
};
```

`publishedAt`는 피드 발행 시각, `filedAt`는 DART 접수일 또는 SEC 제출일처럼 출처의 공식 기준일이다. 화면 정렬은 `publishedAt` 우선, 없으면 `filedAt`, 그래도 없으면 `fetchedAt`을 사용하되 어떤 기준을 사용했는지 응답 메타데이터에 표시한다.

## 저장 구조

| 계층 | 저장 위치 | 책임 |
|---|---|---|
| 피드 원문 | `market_rss_fetch_snapshots`, `sec_source_snapshots` | URL·헤더·원본 응답·해시 보존 |
| RSS 정규화 | `market_rss_articles` | 제목·요약·링크·발행일·출처·중복키 |
| SEC 목록 | `sec_submissions` | accession·CIK·form·제출일·원문 문서 식별 |
| SEC 본문 | `sec_filing_documents` | 인덱스 HTML·주 문서 HTML·정규화 텍스트 |
| 통합 공시 | `filings` | 기존 DART·SEC 공통 분석/알림 이력 |
| 종목 연결 | 종목 유니버스 및 뉴스 티커 캐시 | 티커·회사명 정규화와 검증 |

원문은 `source + externalId` 또는 `accession`을 유일키로 중복 방지한다. 원문이 갱신되면 기존 스냅샷을 삭제하지 않고 새 해시와 수집 시각으로 보존한다.

## API 설계

### 목록

`GET /api/disclosures?date=YYYY-MM-DD&source=all&page=1&pageSize=50`

- `source=all`: DART·SEC·등록된 RSS 통합
- `source=DART|SEC_EDGAR|STOCKTITAN|NASDAQ`: 출처별 조회
- 기본 정렬: 시간 내림차순
- 응답: `items`, `total`, `page`, `pageSize`, `date`, `source`, `sort`, `coverage`
- `coverage`에는 실제 수집된 출처, 마지막 수집 시각, 원문/메타데이터만 있는 건수를 포함한다.

### 상세

`GET /api/disclosures/:id`

- 통합 항목과 출처 원문 식별자를 반환한다.
- 원문이 없으면 링크와 메타데이터를 반환하고 본문을 만들어내지 않는다.

### 복사 기능

- 목록 각 항목에 `복사` 버튼을 제공한다.
- 복사 형식은 `출처`, `회사명/티커`, `제목`, `발행·접수 시각`, `요약`, `내용`, `링크` 순서의 일반 텍스트로 고정한다.
- 상세 화면에는 `전체 복사`와 `링크 복사`를 제공한다.
- `navigator.clipboard.writeText`를 우선 사용하고, 권한이 없거나 비보안 컨텍스트인 경우 선택 영역 기반 fallback을 사용한다.
- 복사 성공·실패를 버튼 상태와 접근성 라이브 영역으로 알린다. 원문 HTML은 복사하지 않고 태그를 제거한 텍스트만 복사한다.
- 화면에서 생략된 본문은 복사 대상에 포함하되, `contentStatus=METADATA_ONLY`인 경우 그 상태를 명시한다.

### 관리자·자동화

- 수집은 출처별 collector가 담당한다.
- 파싱·정규화는 source adapter가 담당한다.
- 저장은 repository가 담당한다.
- 일별 누락 점검과 페이지 순회는 orchestration job이 담당한다.
- 관리자 진단 API는 출처별 마지막 성공 시각, 페이지 수, 항목 수, 실패 원인을 반환한다.

## 티커·회사명 매핑

1. SEC: CIK·SEC 회사 마스터의 ticker/company 매핑을 우선 사용한다.
2. DART: `corp_code`, 종목코드, 회사명을 분리해 저장한다.
3. RSS: 제목·본문에서 추출한 후보는 검증 캐시와 종목 유니버스에서 확인된 경우만 `tickers`에 넣는다.
4. 매핑 실패 항목도 숨기지 않고 회사명 또는 `ticker=null` 상태로 표시한다.

## 누락 방지·운영 규칙

- DART는 `total_page`까지 순회하고 접수일 경계를 확인한다.
- SEC는 날짜 경계까지 제출 메타데이터를 확인하며 accession으로 중복 제거한다.
- RSS는 각 피드의 마지막 성공 cursor/시각을 기록하고, 실패 시 기존 데이터를 삭제하지 않는다.
- 기준일에 데이터가 0건이면 정상 빈 결과와 수집 실패를 구분해 `coverage`와 실행 이력에 표시한다.
- 시간대는 저장 UTC, 화면 표시 KST를 기본으로 한다.
- 조회 API는 캐시된 DB만 읽고 외부 출처를 직접 호출하지 않는다.

## 단계별 구현 순서

1. 기존 저장 테이블의 필드·인덱스와 출처별 중복키를 점검한다.
2. DART·SEC·RSS adapter의 공통 정규화 타입과 repository를 만든다.
3. 통합 일별 조회 서비스와 출처 필터 API를 추가한다.
4. 기준일·출처·시간순 정렬 테스트와 원문 미존재 테스트를 추가한다.
5. 뉴스/공시 페이지 또는 차트 모달 뉴스 탭에 연결한다.
6. 관리자 진단 API와 수집 coverage를 운영 런북에 추가한다.

이 설계안만으로 기능이 구현된 것으로 간주하지 않는다. API·DB·화면·자동화·테스트가 모두 연결된 뒤 기능 인벤토리와 운영 문서를 갱신한다.
