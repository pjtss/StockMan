# 미국 RSS 정규화 핵심 텍스트 실피드 검증

## 검증 범위

- 실행 시각: 2026-10-27 16:35 KST (`2026-10-27T07:35:51Z`)
- 프로젝트 `MARKET_RSS_SOURCES`에 등록된 미국 RSS 5개를 현재 RSS URL에서 직접 가져와 기존 parser와 정규화 함수를 통과시켰다.
- 운영/로컬 DB를 읽거나 쓰지 않았다. 항목 수는 해당 시점 피드가 제공한 전체 항목 수다.
- 정규화 규칙: HTML 태그·스크립트·엔티티·공백을 정리하고 최대 3문장/600자로 발췌한다. 설명이 없거나 SEC 문서 메타데이터·Nasdaq Trader 반복 템플릿뿐이면 RSS 제목을 대체값으로 사용한다.

## 출처별 결과

### 배포 후보 커밋 실피드 재검증 (2026-10-27 21:24 KST)

정확한 실행 시각은 `2026-10-27T12:24:38.554Z`다. 원격 `oci` 기준 작업 트리에 포함할 정규화 코드를 실행해 현재 설정된 미국 출처 전체를 다시 확인했다.

| 출처 | 확인 항목 | summary 사용 | 제목 대체 | 값 생성 | 잔여 태그 | 잔여 엔티티 |
|---|---:|---:|---:|---:|---:|---:|
| GlobeNewswire | 20 | 19 | 1 | 20/20 | 0 | 0 |
| Nasdaq | 15 | 15 | 0 | 15/15 | 0 | 0 |
| Nasdaq Trader | 714 | 96 | 618 | 714/714 | 0 | 0 |
| SEC EDGAR | 100 | 0 | 100 | 100/100 | 0 | 0 |
| StockTitan | 100 | 0 | 100 | 100/100 | 0 | 0 |
| **합계** | **949** | **130** | **819** | **949/949** | **0** | **0** |

다섯 출처 모두 fetch 성공. 100개 미만 제공 출처는 GlobeNewswire 20개와 Nasdaq 15개 전량을 확인했다.

### 최신 재검증 결과 (2026-10-27 17:01 KST)

실행 시각은 `2026-10-27T08:01:18.546Z`이며 현재 설정된 모든 미국 RSS 출처 5개를 `lib/market-rss-live-validation.test.ts`로 다시 조회했다.

| 출처 | 확인 항목 | source summary 사용 | 제목 대체 | 정규화 값 생성 | 잔여 HTML 태그 | 잔여 인코딩 엔티티 |
|---|---:|---:|---:|---:|---:|---:|
| GlobeNewswire | 20 | 16 | 4 | 20/20 | 0 | 0 |
| Nasdaq | 15 | 15 | 0 | 15/15 | 0 | 0 |
| Nasdaq Trader | 714 | 96 | 618 | 714/714 | 0 | 0 |
| SEC EDGAR | 100 | 0 | 100 | 100/100 | 0 | 0 |
| StockTitan | 100 | 0 | 100 | 100/100 | 0 | 0 |
| **합계** | **949** | **127** | **822** | **949/949** | **0** | **0** |

모든 feed fetch가 성공했고, 현재 구성된 미국 RSS 5개가 전부 결과에 포함됐다. GlobeNewswire와 Nasdaq은 100건 미만을 제공해 제공분 전체를 검사했다. 정규화 테스트는 매 출처별 0건보다 많은 항목, 모든 항목의 결과 생성, 태그/엔티티 잔존 0건을 강제했다.

| 출처 | RSS 항목 수 | 요약 문장 채택 | 제목 대체 | 정규화 텍스트 | 잔여 HTML 태그 | 잔여 인코딩 엔티티 |
|---|---:|---:|---:|---:|---:|---:|
| GlobeNewswire | 20 | 15 | 5 | 20/20 | 0 | 0 |
| Nasdaq | 15 | 15 | 0 | 15/15 | 0 | 0 |
| Nasdaq Trader | 714 | 96 | 618 | 714/714 | 0 | 0 |
| SEC EDGAR | 100 | 0 | 100 | 100/100 | 0 | 0 |
| StockTitan | 100 | 0 | 100 | 100/100 | 0 | 0 |
| **합계** | **949** | **126** | **823** | **949/949** | **0** | **0** |

GlobeNewswire와 Nasdaq은 피드 제공량이 각각 100개보다 적어서 해당 시점의 전체 피드를 검증했다. 나머지 세 출처는 100개 이상을 검증했다.

## 내용 추출 관찰

- GlobeNewswire와 Nasdaq은 서술형 RSS 요약을 정규화했다.
- Nasdaq Trader 714개 중 618개 description은 `News Category / Alert / Markets / What You Need To Know` 반복 템플릿이어서 제목을 저장했다.
- SEC EDGAR 100개 summary는 `Filed / AccNo / Size` 메타데이터여서 공시 제목을 저장했다.
- StockTitan은 100개 모두 서술형 summary가 없어 제목을 저장했다. `| TICKER Stock News` 장식 접미부는 대체값에서 제거한다.
- 949개 모두 정규화 텍스트가 생성됐고 태그/엔티티 잔존은 0건이었다. RSS에 없는 기사 본문이나 사실을 추정해 채우지 않는다.

## 부수 수정 및 한계

- 기존 Nasdaq Trader URL `rss.aspx?feed=news`는 HTML을 반환했다. Nasdaq Trader 공식 [News RSS Feed](https://www.nasdaqtrader.com/Trader.aspx?id=NewsRSS)에서 제공하는 `rss.aspx?categorylist=0&feed=currentheadlines`로 기본 URL을 수정했고, 이 주소에서 714개 항목을 파싱했다.
- `normalized_summary`는 새 RSS ingest/upsert에서 채운다. V161 migration은 추가했지만 이 검증에서는 migration 적용, 기존 행 백필, 운영 DB 쓰기는 수행하지 않았다.
- “핵심”은 규칙 기반 발췌이지 의미를 추론하는 생성 요약이 아니다. 제목 대체 823건에는 RSS 원문에 없는 본문 내용이 들어 있지 않다.

## 로컬 DB 적용 및 백필 결과 (2026-10-27)

- 사용자 승인 후 `.env.local`의 localhost DB에만 적용했다. 접속정보 원문은 기록하지 않았다.
- V158 당시 V102/V103이 생성하는 `translation_usage_monthly`가 없었다. 동일 migration의 컬럼 정의로 빈 테이블을 복구했다. 따라서 과거 번역 사용량 집계는 없으며 복원되지 않았다.
- Flyway 13.3.0으로 Pending V159, V160, V161을 순서대로 적용해 현재 version 161임을 확인했다. Flyway 검증은 schema history에서 V85~V141이 미적용임을 보고했으며 해당 과거 버전은 ignored로 처리하고 이번 요청 범위의 Pending V159~V161만 적용했다.
- 백필 전 SEC summary 99건이 HTML line-break 뒤에 있는 `Filed/AccNo/Size` 메타데이터를 대체하지 못하는 것을 발견했다. 줄바꿈을 공백화한 메타데이터 판정과 회귀 테스트를 추가하고 동일한 정규화 함수로 기존 SEC 행을 다시 계산했다.
- `npm.cmd run backfill:market-rss-normalized-summary -- --apply` 결과: 552행 갱신, source summary 사용 400행, 제목 대체 152행. SEC 메타데이터 중 94행은 제목 대체로 정리됐다.
- 최종 DB 확인: V161, `normalized_summary` 존재, 총 552행 중 552행 populated, HTML 태그/인코딩 엔티티 잔존 0건.
- 이 작업은 로컬 DB에 한정되며 운영 DB 적용, commit, push, deploy는 하지 않았다.

- 최신 실피드 재검증은 DB에 쓰지 않았다. 검사 대상은 실행 순간 출처가 제공한 RSS 항목이며 GlobeNewswire/Nasdaq의 공급량이 100개 미만인 점을 포함해 기록했다.

## 재현 명령

```powershell
$env:RUN_MARKET_RSS_LIVE_VALIDATION = '1'
npm.cmd exec -- vitest run lib/market-rss-live-validation.test.ts --reporter=verbose
Remove-Item Env:RUN_MARKET_RSS_LIVE_VALIDATION

# V161 적용 이후에만 기존 로컬 행 백필 dry-run / 적용
npm.cmd run backfill:market-rss-normalized-summary
npm.cmd run backfill:market-rss-normalized-summary -- --apply
```
