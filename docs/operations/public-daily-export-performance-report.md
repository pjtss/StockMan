# 공개 일봉 gzip API 운영 성능 보고서

<!-- catalog-description: KR/US 공개 일봉 gzip API의 동시 DB 조회 조정, OCI 배포별 운영 실측, 응답 계약 및 측정 한계를 기록합니다. -->

## 목적과 범위

사용자 요청에 따라 응답 속도를 우선하여 `GET /api/public/daily-export/kr`와 `GET /api/public/daily-export/us`를 개선하고 운영 서버에서 검증했다. 두 경로는 무인증 공개 GET이며 종목 티커, 시가총액, 일봉 최대 20개를 gzip 파일로 반환한다. 데이터 계약과 활성 보통주 분류 필터, 무캐시 동작은 이번 작업에서 바꾸지 않았다.

이 보고서는 2026-11-26 운영 API 호출에서 얻은 완료 시간과 파일 크기를 보존한다. 호출 표본이 적고 서버 부하를 통제하지 않았으므로 중앙값 차이를 코드 변경의 확정적 인과 효과나 p95로 해석하지 않는다.

API 사용 계약은 [공개 API 매뉴얼](../../public/api-reference.md)을, 구현은 [`lib/public-daily-export.ts`](../../lib/public-daily-export.ts)를 참조한다.

## 배포별 동시성 변경

각 ticker batch는 500개다. 공유 PostgreSQL pool의 기본 최대 연결 수는 10이다.

| 버전 | 커밋 / OCI run | batch 동시성 | 운영 순차 KR 중앙값 | 운영 순차 US 중앙값 |
|---|---|---:|---:|---:|
| 기준 | `87059c21` / `45754074044` | 5 / 5 | 8.558초 | 71.051초 |
| 1차 후보 | `0ffb7903` / `45759426955` | 10 / 10 | 10.922초 | 42.882초 |
| 시장별 후보 | `edeea6ba` / `45761566890` | KR 5 / US 10 | 14.447초 | 36.885초 |

1차 후보는 US 순차 시간이 짧아졌지만 KR+US 동시 호출에서 pool 경합이 관측됐다. 그래서 KR 동시성은 5로 복구하고 US만 10으로 두었다. 시장별 후보의 KR 순차 중앙값은 기준보다 느렸다. 운영 측정 편차가 크므로 KR 속도가 개선됐다고 주장하지 않는다. US 순차 측정은 기준 대비 짧았지만, 서버 부하·DB 상태·시점 차이를 통제하지 않아 단일 요인으로 설명할 수 없다.

## 운영 API 반복 측정

### 1차 후보: 두 시장 동시성 10

OCI run `45759426955` 성공 후 순차 호출을 각 3회 실행했다.

| 시장 | 완료 시간 (초) | 중앙값 | gzip bytes | 티커 수 |
|---|---|---:|---:|---:|
| KR | 14.085 / 10.922 / 8.779 | 10.922 | 약 1,524,715 | 2,337 |
| US | 38.829 / 51.744 / 42.882 | 42.882 | 3,464,301–3,464,955 | 5,011 |

같은 배포본에서 KR+US 병렬 호출 2회는 아래와 같았다.

| 회차 | KR 완료 시간 | US 완료 시간 |
|---|---:|---:|
| 1 | 27.121초 | 57.040초 |
| 2 | 15.860초 | 59.467초 |

### 시장별 동시성: KR 5, US 10

OCI run `45761566890` 성공 후 순차 호출을 각 3회 실행했다.

| 시장 | 완료 시간 (초) | 중앙값 | gzip bytes | 티커 수 |
|---|---|---:|---:|---:|
| KR | 22.335 / 14.447 / 3.557 | 14.447 | 1,524,715–1,524,937 | 2,337 |
| US | 35.118 / 52.114 / 36.885 | 36.885 | 3,464,593–3,464,789 | 5,011 |

두 시장 동시 요청은 2회 실행했다.

| 회차 | KR 완료 시간 | US 완료 시간 |
|---|---:|---:|
| 1 | 20.361초 | 58.854초 |
| 2 | 15.732초 | 61.236초 |

추가 계약 확인은 2026-11-26 `05:41:16Z`부터 `05:43:01Z`까지 실행했다. 순차 KR은 19.441초, US는 39.686초였다. `05:42:15Z`에 시작한 동시 호출은 KR 18.141초, US 45.152초였다. 이 1회 검증은 HTTP 200, ticker 수 KR 2,337/US 5,011, gzip XFL=0, `Content-Type: application/gzip`, `Content-Encoding` 없음, `no-store`, gzip 해제 및 JSON 파싱, top-level `ticker`/`marketCap`/`daily`, `returnedCount` 일치, 일봉 최대 20개를 확인했다.

모든 순차 반복에서도 같은 gzip/JSON/20봉 계약을 검사했다. KR은 모든 적격 종목에서 20봉, US는 데이터가 없는 종목을 포함해 0–20봉이었다. 압축 파일의 크기 편차는 스트림 flush/압축 chunk 분할을 포함하며 payload ticker 수와 봉 수는 반복 간 동일했다.

## 로컬 비교와 회귀 검사

같은 로컬 PostgreSQL과 Next.js dev API에서 warmed 순차 호출을 비교했다.

| 동시성 | KR 중앙값 | US 중앙값 | KR+US 병렬 완료 중앙값 |
|---|---:|---:|---:|
| 5 / 5 | 356ms | 751ms | 979.5ms |
| 10 / 10 | 359.5ms | 689ms | 886ms |

로컬 결과에서 US는 약 8% 짧았고 KR은 거의 차이가 없었다. route 테스트는 US에서 최대 동시 10개, KR에서 최대 동시 5개 batch query를 회귀 검사한다. 전체 `npm run deploy:verify`는 시장별 조정에서 283개 테스트 파일 통과/1개 skip, 1,648개 테스트 통과/3개 skip, production build, typecheck, 문서/API/security/cron 감사, standalone HTTP 및 Chrome desktop/mobile smoke를 통과했다.

## 판단과 다음 개선

- 현재 설정은 KR 5, US 10이다. 운영 관측상 US 순차 완료 시간은 이전 기준보다 짧았지만 측정 시점 부하와 표본 수가 통제되지 않아 개선률을 확정하지 않는다.
- KR 완료 시간은 운영 기준보다 느린 표본이 있어 속도 개선이 입증되지 않았다. 이후 최적화는 DB query 시간, gzip 시간, 마지막 chunk 전송까지의 시간을 분리 계측해 병목을 확인한다.
- pool 공유 때문에 여러 API나 동시 요청이 있을 때 query fanout이 다른 endpoint를 늦출 수 있다. 재측정에서 KR 또는 US 성능이 지속적으로 악화되면 동시성을 낮추거나 시장별 query 스케줄링을 다시 평가한다.
- 운영 데이터는 무인증 GET만 사용했다. 쓰기 API, cron 실행, 운영 DB 갱신은 하지 않았다.

### US batch 1,000 실험 후속

커밋 `662680cb`(OCI run `45767914380`)에서 US batch를 1,000개, 동시성을 6으로 조정했다. US 순차 운영 응답 3회는 38.570/43.290/40.937초(median 40.937초)였다. 이 설정 전 batch500/동시성10의 순차 중앙값 36.885초보다 약 11% 느려졌다. KR+US 동시 요청은 US 58.764초, KR 18.782초였다. 압축 전후 파일 계약은 유지됐고, US 5,011 ticker 및 최대20봉, gzip XFL=0, no-store를 확인했다.

동일 로컬 DB에서는 US median이 약 8% 짧았지만 운영에서 재현되지 않았다. 한 query가 처리하는 row/JSON이 두 배가 되며 늘어난 query별 대기시간이 wave 절감보다 컸을 가능성이 있으나, 운영 query phase를 직접 계측하지 않아 원인은 추정이다. 이 설정은 채택하지 않고 US batch500/동시성10으로 복구했다. 한 grouped 운영 측정은 연결 종료로 완성되지 않아 표본에서 제외했다.

### US batch 500 복구 배포 후 운영 확인

복구 커밋 `1790f95b`의 OCI run `45770981889`은 2026-11-26 06:56:47Z에 성공 완료했다. 이후 공식 운영 호스트 `https://stockman.r-e.kr`의 공개 GET을 순차로 2회씩 호출했다. 각 응답을 전부 받아 gzip 해제·JSON 파싱 후 항목별 `ticker`, `marketCap`, `daily.candles`, `daily.metadata.returnedCount`를 확인했다.

| 시장 | 완료 시간 (초) | 티커 | gzip bytes | 원본 bytes | 봉 범위 |
|---|---|---:|---:|---:|---:|
| KR | 11.540 / 6.999 | 2,337 | 1,524,715 | 8,925,884 | 20–20 |
| US | 34.304 / 42.522 | 5,011 | 3,464,301 / 3,464,587 | 19,004,536 | 0–20 |

검증 시각은 2026-11-26 06:57:47Z, 06:58:50Z–06:59:32Z, 07:00:00Z–07:00:51Z다. 네 응답 모두 HTTP 200, `Content-Type: application/gzip`, `Content-Encoding` 없음, `Cache-Control: no-store`, gzip XFL=0이며 전체 JSON 계약과 일봉 최대20개가 유효했다. 운영 소요시간은 두 번뿐이고 서버 부하를 통제하지 않았으므로 복구 전 후보와의 성능 차이를 원인적으로 판정하지 않는다. 1,000/6 후보가 느려 복구한 설정의 배포·응답 계약은 확인했지만, 이 작은 표본만으로 500/10이 최적이라고 단정하지 않는다.

### US trading_value 컬럼 부재 경로 최적화 후보

V67 기준 US 봉 테이블에는 `trading_value` 열이 없다. 기존 코드는 런타임 `pg_attribute` 검사 결과가 열 부재여도 각 봉마다 `to_jsonb(c)` 변환 후 키를 검사하고, 없을 때 `close * volume`을 사용했다. 후보는 컬럼 부재가 확인된 경우 이와 동일한 fallback 식을 직접 사용하여 JSON 변환을 제거했다. 컬럼이 있는 환경에서의 기존 검증·사용 로직은 유지한다.

scripts/dev-server.mjs 로컬 API에서 변경 전 US warmed 완료 시간은 0.960/0.715/0.706초(중앙값 0.715초; 최초 cold 요청 제외), 후보는 0.704/0.684/0.737/0.691/0.671초(중앙값 0.691초)였다. 후보의 로컬 중앙값은 약 3.4% 짧았고 gzip 크기는 두 설정 모두 3,403,223B였다. 11개 경로 테스트가 통과했고 후보 응답 HTTP200, XFL=0, no-store, 5,012 ticker, 최대20봉, JSON 계약을 확인했다. 표본·차이가 작으므로 이 결과는 로컬 신호이며 운영 효과는 배포 후 같은 운영 GET 계약과 시간 비교가 필요하다.

## 변경 및 배포 기록

- `0ffb7903`: 동시성 5에서 10으로 상향, OCI run `45759426955` 성공.
- `edeea6ba`: KR 5 / US 10으로 시장별 상한 적용, OCI run `45761566890` 성공.
- `662680cb`: US batch1,000/concurrency6 실험 배포. 운영 개선이 재현되지 않아 후속 커밋에서 US batch500/concurrency10으로 복구하고 실측·배포 결과를 기록한다.
- `1790f95b`: US batch500/concurrency10 복구, OCI run `45770981889` 전체 성공. 운영 KR/US gzip GET을 각 2회 검증했다.
- `690607e7`: `trading_value` 컬럼 부재 fallback에서 per-candle `to_jsonb(c)` 변환을 제거하고 동일한 `close * volume` fallback을 직접 사용한다. 전체 검증 및 OCI run `45774860704` 성공.
- gzip level4 후보(commit `9948d0b4`, OCI run `45779156775`)는 배포와 운영 계약 검증에 성공했다. 로컬 레벨3→4로 US 크기는 약 5.95% 줄었지만 gzip CPU는 늘었다. 운영 level4에서 KR 1회는 23.113초/1,433,407B, US 2회는 전송 도중 스트림 오류(첫 시도)와 69.459초/3,244,621B(재시도)였다. US 재시도는 gzip 해제·JSON 파싱 및 5,011 ticker·0–20봉 계약까지 통과했다. 이전 level3의 유효 gzip 크기 KR 1,524,715B, US 3,464,301–3,464,986B보다 각각 약 6.0%/6.3% 작다. 그러나 운영 응답 완료시간은 비교 표본이 적고 부하가 통제되지 않았으며 US 재시도 시간도 이전 level3 범위보다 길어, 속도 향상은 입증되지 않았다. 초기에는 운영 표본이 작아 판단을 보류했으나, 아래 5회 재측정 후 속도 우선 원칙으로 level3 복귀를 결정했다. 다음에는 phase 계측과 반복 표본으로 DB/query/압축/전송 시간을 분리한다.

### 2026-11-26 구형 candle schema fallback 최적화 확인

V67 기준 US 봉 테이블에는 `trading_value` 컬럼이 없다. 컬럼 부재 분기에서 기존 쿼리는 각 봉을 `to_jsonb(c)`로 변환해 키를 검사한 뒤 없는 경우 `close * volume`을 사용했다. commit `690607e7`는 컬럼 존재 여부 조회를 유지하면서 부재가 확인된 경우 같은 계산을 직접 수행한다. 이 변경은 ticker/marketCap/daily 구조와 ticker 수를 바꾸지 않고, 컬럼이 있는 스키마에서 기존 공식 turnover 읽기/검증을 유지한다.

로컬 warmed API 중앙값은 기존 715ms에서 변경 후 691ms였으며 gzip bytes는 양쪽 3,403,223으로 같았다. 배포 run `45774860704` 후 운영 GET은 KR 두 번 12.371/10.566초와 US 다섯 번 45.618/59.056/36.585/45.042/36.746초(median45.042초)였다. 이전 복구 배포 후 측정된 US 표본 34.304/42.522초보다 수치상 높지만 비교군이 2회뿐이고 운영 부하를 제어하지 않았으므로 인과적 회귀로 판정할 수 없다. 모든 운영 응답은 HTTP200, gzip XFL0, no-store, gzip 해제 후 JSON 구조와 최대20봉을 통과했고 payload ticker 수/원본 bytes도 KR 2,337/8,925,884B, US 5,011/19,004,536B였다. 따라서 의미상 동일한 낮은 연산량 경로는 유지하되 운영 완료시간 개선은 아직 입증하지 않은 상태로 둔다.

### Gzip 압축 수준 3과 4 로컬 비교

로컬 US export 응답은 레벨3에서 3,403,223B, 레벨4에서 3,200,714B였다(-5.95%). API warmed 중앙값은 기준 레벨3 0.712초, 레벨4 0.744초였으나 반복 편차가 크고 local network가 운영 전송 환경과 다르므로 끝까지 걸리는 시간은 개선되지 않았다고 단정하거나 개선됐다고 주장할 수 없다. 동일한 19,399,949B payload를 gzipSync로 압축했을 때 레벨3 median CPU 98.555ms, 레벨4 119.695ms였다. 후속 운영 5회 재측정과 속도 우선 판정은 아래 절에 기록했다.
- 문서·회귀 테스트 변경 후 최종 검증 및 문서 커밋/배포 결과는 [`DEVELOPMENT_LOG.md`](../../DEVELOPMENT_LOG.md)에 기록한다.

### gzip level4 운영 배포 및 검증

commit 9948d0b4의 Deploy OCI run 45779156775는 2026-11-26에 CI 검증 및 Activate release를 성공 완료했다. 서비스 health가 200으로 복구된 뒤 운영 공개 GET을 수행했다. 초기 요청 중 한 번은 스트림이 중간 종료돼 재시도했다.

| 시장 | 완료 시간 (초) | gzip bytes | 원본 bytes | 티커 | 봉 범위 |
|---|---:|---:|---:|---:|---:|
| KR | 23.113 / 10.722 | 1,433,407 / 1,433,839 | 8,925,884 | 2,337 | 20–20 |
| US | 69.459 | 3,244,621 | 19,004,536 | 5,011 | 0–20 |

두 응답은 HTTP 200, application/gzip, Content-Encoding 없음, Cache-Control: no-store, XFL=0을 확인했다. US 응답은 gzip 해제 및 JSON 파싱 후 5,011 ticker, 각 항목의 ticker/marketCap/daily 필드, returnedCount 일치, 최대20봉을 확인했다. KR 두 응답도 gzip 해제 및 JSON 검증 후 2,337 ticker, 필드·returnedCount 일치, 20봉을 확인했다. 운영 gzip 크기는 level3 표본 대비 KR 약 6.0%, US 약 6.3% 감소했다. 완료 시간은 서버 부하 통제 및 충분한 반복이 없어 level4의 인과적 속도 효과를 판정할 수 없다. 이번 완료 시간은 KR 23.113/10.722초, US 69.459초였고 level3 대비 속도 개선은 입증되지 않았다. 따라서 결과는 전송 용량 개선으로 기록하고 end-to-end 속도 개선으로 표현하지 않는다.

## 다음 속도 개선의 측정 게이트

### 2026-11-27 운영 전송 대역폭 기반 gzip level9 후보

운영 API를 각 시장 1회 전체 GET해 전송 구간 기준선을 얻었다. KR은 HTTP200/9.929초/first byte0.653초/gzip1,524,637B, US는 HTTP200/28.148초/first byte0.379초/gzip3,542,002B였다. 다운로드 속도는 각각153,548B/s 및125,835B/s였다. 원본 크기는 KR8,907,188B, US18,964,448B이며, 응답은 gzip 해제 및 ticker·marketCap·daily·returnedCount·max20 검증을 통과했다. 이 한 번씩의 표본은 운영 부하를 통제하지 않았다.

로컬 API payload를 Node.js `gzipSync`로 8회 압축했다. KR level3→9은 median CPU42.53→349.25ms, 크기1,506,858→1,201,811B였다. US level2→9은 CPU78.97→483.06ms, 크기3,491,020→2,828,157B였다. Node.js 공식 문서는 높은 level이 압축률을 높이는 대신 처리시간을 늘린다고 설명한다([Node.js v22 zlib](https://nodejs.org/download/release/latest-v22.x/docs/api/zlib.html)). RFC 1952에서는 XFL=2가 maximum compression을 나타낸다([RFC 1952](https://www.rfc-editor.org/rfc/rfc1952)). 이번 운영 전송 속도에 로컬 크기 차이를 적용하면 추정 전송 절감은 KR 약2.10초/US 약5.67초이고, local compression CPU 증가는 약0.31/0.40초다. 서로 다른 환경에서 얻은 값을 결합한 예상치이므로 실제 운영 개선의 증거는 아니다.

양 시장 level9 후보를 local Next API에서 6회 확인했다. 첫 요청을 제외한 median은 KR629ms, US1,202ms로 현재 level3/2의 기준 300/778ms보다 느렸다. Gzip 크기는1,201,818/2,828,164B(각각 약20.3%/19.0% 감소), raw JSON bytes 및 ticker 수/필드는 동일했다. HTTP200, gunzip/JSON, 최대20봉, returnedCount, XFL=2가 확인됐다. local link에서는 CPU 비용이 더 컸지만 운영 GET 표본은 전송 구간이 대부분이어서 양 시장 level9를 OCI에 배포해 실제 전체 수신시간으로 판정할 후보로 선택했다. 해당 후보의 route 테스트 15/15는 통과했으며 full deploy verification, OCI deployment, post-deploy operating GET은 아직 진행 중이다. 결과가 느리거나 개선이 없으면 기존 KR3/US2 설정으로 복구 배포한다.

### 2026-11-27 현행 API 재측정 및 SQL 계획 조사

현재 배포 코드의 local warmed endpoint를 `scripts/dev-server.mjs`와 `.env.local`의 로컬 DB 경로로 각 시장 6회 호출했다. 첫 cold 호출을 제외한 다섯 요청의 내부 `totalElapsedMs` median은 KR 256ms(218–327ms), US 587ms(531–740ms)였다. KR은 2,352 ticker/1,506,865 gzip bytes, US는 5,012 ticker/3,491,027 gzip bytes였다. 응답은 모두 gzip 해제 및 JSON 파싱 후 `ticker`, `marketCap`, `daily`, `returnedCount` 일치, 최대20봉을 확인했다. 이 로컬 수치는 운영망으로 일반화하지 않는다.

개발 서버 구조화 로그에서 KR 단계 median은 universe 5ms, batch DB wall 149ms, stream 250ms였고 US는 93ms, 323ms, 498ms였다. DB query는 동시 실행되며 stream과 겹치므로 이를 더해 endpoint 시간으로 해석하지 않는다. PostgreSQL 공식 `EXPLAIN` 문서는 `ANALYZE`가 SELECT를 실제 실행하고 node timing 계측 오버헤드가 있을 수 있다고 설명한다([공식 문서](https://www.postgresql.org/docs/current/sql-explain.html)). `.env.local` host가 localhost인지 확인한 다음 실제 API에서 prepared SQL과 500-key 입력을 포착해 로컬 read-only 트랜잭션의 `EXPLAIN ANALYZE`에 전달했다. 한 batch 실행시간은 KR 63.4ms(9,569 shared-hit/990 read blocks), US 83.1ms(6,994 hit/3,134 read)였다. 양쪽 모두 candle lookup index로 `(market,code,timeframe)`를 찾고 ticker당 recent candle 20행을 읽었다. 처음 만든 representative query와 alias scope 오류(42P01)가 난 임시 재현은 endpoint와 일치하지 않아 최적화 근거에서 제외하고 트랜잭션을 롤백했다. exact route plan은 이보다 나중에 별도 실행해 정상 완료했다.

현 최종 상태에서 기능 코드는 기준 구현으로 복구되어 있고 운영 배포는 하지 않았다. 원인은 아직 확정되지 않았고, 이 조사만으로 SQL/index/concurrency 후보를 정당화할 수 없다. 다음 단계는 endpoint의 정확한 SQL과 입력을 재현하는 로컬 진단, 이후 운영 단계 로그를 읽을 권한이 있는 경로를 확인하는 것이다. 잘못된 계획 재현을 최적화 근거로 쓰지 않으며, 후보 변경 시 기존의 전체 응답 계약·속도 반복 측정·`npm run deploy:verify`·운영 배포 후 GET 확인 절차를 적용한다.

### 요청 순번 정렬 후보 기각

batch SQL 최종 `ORDER BY u.market, u.code`를 요청 CTE에 추가한 `WITH ORDINALITY` 순번 정렬로 바꾸어 결과를 같은 순서로 유지하면서 문자열 두 열 비교를 줄이는 후보를 측정했다. SQL text가 바뀌므로 node-postgres prepared statement name도 `v1`에서 `v2`로 변경했다. 첫 문법 표현은 PostgreSQL 42601을 반환했으며, `ROWS FROM(jsonb_to_recordset(...) AS (...)) WITH ORDINALITY` 형태로 수정한 다음 대상 route 테스트 15/15와 실제 로컬 API GET을 통과했다. 이 첫 SQL 오류는 운영 배포 전에 로컬 smoke에서 발견되어 바로 수정했다.

같은 로컬 Next API/DB에서 시장별 요청을 6회 실행하고 첫 요청을 제외해 비교했다. 기존 SQL median은 KR 300ms, US 778ms였고 순번 정렬 후보는 KR 411ms, US 779ms였다. gzip bytes와 압축 해제 payload bytes는 KR 1,506,865/8,966,992B, US 3,491,027/19,359,853B로 동일했다. 양쪽 2,352/5,012 ticker였으며 `ticker`·`marketCap`·`daily`, `returnedCount`, 최대20봉 검증도 통과했다.

후보는 KR 전체 응답에서 약37% 느리고 US도 개선되지 않아 기각하고 코드 및 테스트 파일을 기존 구현으로 복구했다. 운영 배포하지 않았다. 근본 원인은 요청 순번 정렬이 PostgreSQL executor에서 비용을 줄이지 못했고 API 전체 응답에 이득을 만들지 못한 것으로 보인다(단, local sample에 한정한 관찰). 회귀 감지는 양 시장 반복 전체 응답시간과 gzip/payload 비교로 유지한다. 다음 후보는 정확한 route query plan에서 발견한 안정적 비용 기회에 근거해 선정하고 실제 DB API 호출 후 평가한다.

### 날짜 유효성 predicate 후보 기각

현재 일봉 품질 predicate는 문자열 형식 검증 후 연도 substring을 반복해 정수 변환한다. 해당 연도 범위를 ASCII 고정폭 범위 비교로 대체하고 기존 month/day 및 윤년 조건은 유지하는 후보를 실제 route에서 얻은 SQL에 적용했다. PostgreSQL은 text 비교에서 collation을 사용하므로 bytewise 순서를 명시하기 위해 `COLLATE "C"`를 사용했다([공식 collation 문서](https://www.postgresql.org/docs/current/collation.html)). 1~400년 날짜 조합, 9999년, 윤년 세기 경계, 잘못된 포맷·월·일을 포함한 184,815개 입력에서 기존과 후보 predicate 결과가 모두 일치했다. API KR/US 각 500-key batch에서 반환된 `item_json` 500행도 기존과 후보가 같았다.

동일 로컬 DB 연결에서 기존/후보 batch query를 번갈아 8회 수행했다. 첫 회 제외 median은 KR 64.09→66.68ms(+4.0%), US 74.40→72.51ms(-2.5%)였다. 시장별 성능 방향이 달랐고 US 개선폭이 작아 전체 API에서 안정된 속도 향상이라고 판정하지 않았다. 후보 predicate는 코드에 적용하지 않았고 운영 배포도 하지 않았다. 다음 후보의 채택 기준은 계속 양 시장 전체 응답 반복측정과 gzip/payload 계약이다.

### Positive/zero volume 분리 조회 후보 기각

기존 positive-volume partial covering index를 이용하기 위해 `volume > 0` 행과 `volume = 0` 행을 별도 분기로 조회한 뒤 최신 20봉을 합치는 exact route SQL 후보를 조사했다. 현재 API 결과에는 0 거래량 봉이 KR 347/46,996, US 747/99,486개 있어 0 거래량을 제외할 수 없다. 계획 비교는 로컬 read-only 트랜잭션에서 기존 SQL과 split SQL을 각각 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`으로 실행했다.

기존 500-key batch 실행시간은 KR 71.3ms/US 79.4ms였고 split 후보는 KR 1,048ms/US 4,833ms였다. 0 거래량 분기는 전용 index가 없어 ticker마다 candle lookup index를 오래 훑고도 첫 500-key batch에서는 0건을 찾았으며 shared block reads가 KR 13,129, US 52,100으로 늘었다. PostgreSQL 문서가 설명하는 `EXPLAIN ANALYZE` 계측 오버헤드가 있으나 차이는 각각 약14.7배/60.8배였다. 후보는 즉시 기각했고 코드·schema를 변경하거나 배포하지 않았다. 별도 zero-volume index는 크기·갱신 비용과 positive branch의 heap fetch 비용을 실제 API 전체시간에서 상쇄한다는 근거가 확보되기 전에는 추가하지 않는다.

- 현재 쿼리는 ticker universe를 읽은 뒤 500개씩 나누고 US 10개/KR 5개 query를 `Promise.all`로 실행한다. 5,011개 US ticker면 11개 batch를 2개 wave로 처리하고, 마지막 wave는 1개 query다. 속도 후보는 batch 크기나 동시 query 수를 함께 변경하지 말고 한 번에 하나만 바꾼다.
- 후보 비교는 같은 배포 호스트·같은 시장·같은 API 응답 계약으로 기준/후보를 번갈아 최소 5회씩 측정한다. 전체 응답 완료시간, gzip bytes, 첫 body byte 시각, 응답 크기, HTTP 결과를 기록한다. 각 JSON 응답을 gzip 해제해 ticker 수, 최대 20봉, `returnedCount` 일치와 주요 필드를 확인한다. 시간 개선이 측정 편차를 넘어서 재현되지 않으면 채택하지 않는다.
- 쿼리 병목을 고칠 때는 운영 DB의 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 결과를 read-only 트랜잭션에서 얻고, 유효 ticker/candle 행 수와 선택된 인덱스를 함께 기록한다. 운영 DB에 통계 초기화, 설정 변경, 인덱스 생성/삭제, 쓰기 쿼리를 실행하지 않는다. `EXPLAIN ANALYZE`가 부담스럽거나 허가된 read-only 경로가 없으면 로컬 복제 스키마에서만 실험하고 운영 원인으로 확대 해석하지 않는다.
- API 단계별 구분은 instrumented candidate에서 universe query, batch DB query 누적/최대 지연, gzip transform의 CPU 경과, 첫 byte, 마지막 byte를 계측한다. 계측이 배포 응답 계약이나 payload를 바꾸지 않는지 테스트하고, 계측 오버헤드도 report에 명시한다.
- 2026-11-26 작업에서 로컬 psql 실행 경로를 찾지 못했고 공개 US GET이 20초 안에 완료되지 않았다. 운영 level4 결과는 이전 level3 비교보다 충분한 반복을 포함하지 않는다. 그러므로 현재 동시성·batch 설정의 최적성은 미확정이며 추가 변경 근거로 사용하지 않는다.
### gzip level4 재측정 및 속도 우선 판정

level4 운영 설정의 재현 기준선을 만들기 위해 2026-11-26에 같은 호스트에서 KR/US를 각각 순차 5회 요청했다. 전체 gzip 본문을 읽고 gzip 해제, JSON 및 항목별 티커/시가총액/일봉 계약까지 확인했다.

| 시장 | 완료 시간 (초) | gzip bytes 범위 | 원본 bytes | 유효 응답 |
|---|---|---:|---:|---:|
| KR | 28.928 / 7.705 / 8.363 / 10.826 / 25.656 | 1,433,407–1,434,290 | 8,925,884 | 5/5 |
| US | 62.285 / 72.635 / 68.069 / 47.494 / 61.826 | 3,243,685–3,245,798 | 19,004,536 | 5/5 |

중앙값은 KR 10.826초, US 62.285초다. 직전 level3 운영 측정의 US 중앙값 45.042초보다 38.3% 길다. 요청 시점 부하가 통제되지 않았으므로 이를 압축 레벨의 확정 인과 효과로 볼 수는 없다. 동일 로컬 DB/Next API의 직전 level4 3회 warmed 표본(KR median 398ms, US 804ms)과 level3 코드 변경 후 5회 표본(KR median 311ms, US 760ms)에서도 level3가 각각 약 21.9%, 5.5% 짧았다. 로컬 압축 크기는 level3 KR/US 1,506,947/3,403,223B, level4 1,433,407/3,200,714B로 level4가 작지만 CPU 비교에서는 level4가 더 오래 걸렸다.

속도가 최우선인 요구에 따라 level4를 유지하지 않고 level3로 복귀한다. 크기 절감은 확인됐지만 현재 관측에서 전체 처리시간 이득이 증명되지 않았고 압축 CPU 비용은 증가했다. 복귀 배포 run `45787463222` 후 KR/US 각 5회 유효 응답을 확보했다. 상세 중앙값과 속도 판정은 아래 level3 운영 결과에 기록한다. 운영 시간의 변동폭이 커 DB/query 대기 및 네트워크 상태가 주요 혼입 요인일 수 있다는 점은 남은 위험이다.
### gzip level3 복귀 배포 후 운영 재측정

커밋 `586fb91d`(OCI run `45787463222`)에서 gzip level3로 복귀했다. 복귀 배포 후 공개 API를 KR/US 각각 순차 5회 측정했고, 모든 유효 응답에서 gzip 본문 전체를 읽고 해제한 뒤 JSON 항목 계약을 확인했다.

| 시장 | 완료 시간 (초) | 중앙값 | gzip bytes | 원본 bytes | 티커·봉 | 유효 응답 |
|---|---|---:|---:|---:|---|---:|
| KR | 15.748 / 10.934 / 12.358 / 9.994 / 16.840 | 12.358 | 1,524,715–1,525,103 | 8,925,884 | 2,337 · 20–20 | 5/5 |
| US | 56.361 / 62.293 / 61.286 / 53.865 / 50.032* | 56.361 | 3,464,597–3,465,388 | 19,004,536 | 5,011 · 0–20 | 5/5 |

*US 다섯 번째 시도는 본문 전송 중 연결이 종료되어 표본에서 제외하고 한 번 재시도했다. 재시도 전체 gzip 다운로드와 JSON 계약은 유효했다.

기존 level4 다섯 회 중앙값(KR 10.826초, US 62.285초)과 비교하면 level3는 KR이 14.2% 느리고 US가 9.5% 빠르다. 앞선 로컬 DB/Next API 순차 비교에서는 level3가 level4보다 KR 21.9%, US 5.5% 짧았다. 운영 표본은 서버 부하·전송 상태를 통제하지 않았으므로 각 시장의 시간 차이를 gzip 수준만의 인과 효과로 단정하지 않는다. 속도 우선으로 로컬 CPU/응답시간과 US 운영 결과가 더 나은 level3를 현 설정으로 채택하되, KR 운영 시간은 개선되지 않은 것으로 기록한다. gzip은 여전히 단일 스트림이며 payload와 20봉 계약은 유지됐다.
### gzip level1·2·3 로컬 속도 후보 비교

같은 로컬 DB와 Next.js 개발 API에서 각 수준을 바꾼 후 시장별 5회 순차 요청했다. 첫 요청을 제외한 4회 중앙값을 warmed 비교값으로 사용했다.

| gzip level | KR warmed median | US warmed median | KR gzip bytes | US gzip bytes | XFL |
|---:|---:|---:|---:|---:|---:|
| 1 | 323.5ms | 655.5ms | 1,585,372 | 3,584,665 | 4 |
| 2 | 299.5ms | 644ms | 1,552,305 | 3,493,095 | 0 |
| 3 | 303ms | 737.5ms | 1,506,947 | 3,403,223 | 0 |

level2는 level3 대비 KR 약 1.2%, US 약 12.7% 짧았으며, US gzip은 2.64% 커졌다. level1은 level2보다 US가 약간 느리고 gzip이 더 컸으며 XFL=4를 반환한다. 기존 XFL=0, 단일 gzip header 및 API 계약을 보존한 level2 후보를 배포했다. 뒤이은 운영 반복은 US 개선/KR 지연으로 갈려 시장별 level2(US)/level3(KR) 후보를 평가한다.
### gzip level2 단일 설정의 운영 결과와 시장별 후보

커밋 `2f83f798`(OCI run `45790675516`)에서 gzip level2를 KR/US 양쪽에 배포했다. 전체 응답을 순차 5회 다운로드해 gzip 해제·JSON 계약을 검사했다.

| 시장 | 완료 시간 (초) | 중앙값 | gzip bytes | 원본 bytes | 티커·봉 | 유효 |
|---|---|---:|---:|---:|---|---:|
| KR | 21.035 / 21.015 / 13.877 / 10.612 / 9.823 | 13.877 | 1,562,780–1,563,066 | 8,925,884 | 2,337 · 20–20 | 5/5 |
| US | 42.438 / 52.211 / 51.508 / 67.332 / 55.848* | 52.211 | 3,543,075–3,543,643 | 19,004,536 | 5,011 · 0–20 | 5/5 |

*US 한 회는 63.541초에 스트림이 종료되어 제외하고 재시도했다. 재시도 본문 전체와 API 계약이 유효했다.

level3 운영 중앙값(KR12.358초/US56.361초)과 비교하면 level2는 KR 12.3% 느리고 US 7.4% 빠르다. 압축 크기는 두 시장 모두 약 2.5% 커졌다. 총 소요시간의 편차와 네트워크 종료가 관측되어 이 차이를 압축 수준 하나의 인과 효과로 단정하지 않는다.

속도 우선 후보는 KR level3, US level2로 분리한다. 같은 운영 level2/3 결과에서 KR은 level3, US는 level2 중앙값이 짧았고 로컬 per-market API smoke에서도 각각 gzip XFL=0 및 예상 크기(level3 KR 1,506,947B / level2 US 3,493,095B)를 확인했다. 이 설정을 배포 후 각 시장 반복 실측으로 재평가한다.

### gzip 시장별 설정 배포 후 운영 실측

커밋 `4bce6a68`(OCI run `45794000840`, 성공)에서 KR level3/US level2를 배포했다. 배포 후 헬스체크는 HTTP 200이었고, 두 시장 공개 API를 각각 순차 5회 호출해 응답 본문 전체를 받아 gzip 해제 및 JSON 계약을 확인했다.

| 시장 | 완료 시간 (초) | 중앙값 | gzip bytes | 원본 bytes | 티커·봉 | 유효 |
|---|---|---:|---:|---:|---|---:|
| KR (level3) | 10.807 / 5.950 / 8.705 / 3.760 / 3.339 | 5.950 | 1,524,715–1,525,055 | 8,925,884 | 2,337 · 20–20 | 5/5 |
| US (level2) | 45.406 / 60.268 / 63.608 / 36.412 / 50.560 | 50.560 | 3,542,946–3,543,067 | 19,004,536 | 5,011 · 0–20 | 5/5 |

10개 응답 모두 HTTP 200, `application/gzip`, `Content-Encoding` 없음, `Cache-Control: no-store`, gzip XFL=0이었다. 압축 해제 후 최상위 JSON 배열과 ticker·marketCap·daily, `returnedCount`와 candles 수의 일치, 최대20봉을 확인했다. 직전 level2 양시장 설정의 운영 5회 중앙값(KR13.877초/US52.211초)과 단순 비교하면 KR 57.1%, US 3.2% 짧다. 다만 실행 시점 서버 부하·네트워크를 통제하지 않았고 시간 분산도 크므로 시장별 레벨의 인과 효과는 미확정이다. 관측상 KR level3/US level2 조합은 현 후보로 유지하며, 계측된 반복에서 회귀가 확인되면 재조정한다.

### 다음 운영 속도 개선을 위한 단계별 계측

현재 운영 완료시간만으로는 종목 universe 조회, 병렬 candle batch의 DB 대기, gzip 스트림 생성 중 어느 구간이 지연을 만드는지 분리할 수 없다. `lib/public-daily-export.ts`는 전체 gzip 스트림 완료 시 구조화된 한 줄 로그로 시장·ticker/batch 수, universe query 시간, batch query 수·wave 수·누적 wall 시간·개별 query 최대/누적 시간, 첫 gzip byte까지의 시간, 스트림 및 전체 경과시간, gzip bytes를 기록한다. ticker 코드, 이름, 시가총액, 일봉은 기록하지 않으며 HTTP 응답 헤더·body 계약은 변경하지 않는다.

이 계측은 배포 후 서버 로그에서 구간별 시간 분포를 확인하고, 가장 오래 걸리는 구간만 다음 후보로 개선하기 위한 것이다. 전체 요청 완료 시점의 로그이므로 브라우저/네트워크의 마지막 byte 수신시간은 보여주지 않으며, gzip 비동기 스트림 시간은 DB 대기 및 backpressure와 겹칠 수 있어 순수 CPU 시간으로 해석하지 않는다. 완료 전에 연결이 끊긴 요청은 완료 로그가 남지 않는다. 운영 로그 접근이 가능한 환경에서 시장별 유효 표본을 모은 뒤에야 다음 쿼리/동시성 변경을 결정한다.

계측 커밋 `d74c2a8b`(OCI run `45801396076`, 성공) 후 운영 API를 다시 순차 호출했다. KR 유효 5회 완료시간은 17.322/6.491/2.882/3.292/3.358초(중앙값3.358), gzip 1,524,715B, 원본 8,925,884B였다. US 유효 5회는 51.024/57.913/59.936/56.997/53.413초(중앙값56.997), gzip 3,543,082–3,543,666B, 원본 19,004,536B였다. 모두 HTTP 200, gzip XFL=0, 무캐시, 티커·시가총액·일봉 JSON 계약과 20봉 상한이 유효했다. US 한 응답은 전체 본문 수신 중 연결 오류가 나 재시도 응답으로 대체했다.

이 환경에서는 OCI SSH 자격증명 및 journald 읽기 도구가 없어 운영 구조화 로그의 개별 단계 숫자를 직접 회수하지 못했다. 따라서 이번 운영 API 완료시간은 직전 표본과 인과 비교하지 않으며 DB batch 동시성/query 변경도 보류한다. 운영 로그 접근이 확보되면 `market=KR/US` 완료 로그를 회수해 DB batch wall/query 최대시간과 stream elapsed의 분포를 보고 다음 병목 후보를 선정한다.

동일 배포 코드의 로컬 `scripts/dev-server.mjs`/로컬 DB 응답으로 새 계측이 동작하는지 확인했다. KR은 2,352 ticker/5 batch/1 wave, universe query 63ms, batch query wall 1,075ms(개별 query 누적5,108ms·max1,074ms), time-to-first-gzip-byte 70ms, stream 1,203ms, 내부 total 1,268ms, gzip1,506,947B였다. US는 5,012 ticker/11 batch/2 waves, universe149ms, batch wall1,630ms(누적14,692ms·max1,602ms), first byte151ms, stream1,876ms, internal total2,026ms, gzip3,493,095B였다. 클라이언트 경과시간은 KR3.210초/US2.492초였으나 최초 요청 Next dev compile이 포함되어 운영 기준으로 사용하지 않는다. 이 측정은 계측 구현과 로컬 개발 데이터 경로 검증이며 운영 DB 단계별 결과를 대체하지 않는다.

### US ticker batch 500→750 운영 후보

로컬 계측으로 US의 500개 batch 기준을 새로 5회 측정한 뒤 batch 크기만 750으로 바꾸고 같은 API/DB 경로에서 5회 반복했다. 500개 기준의 첫 컴파일 요청을 제외한 client warmed median은 0.752초, 내부 `totalElapsedMs` median 713.5ms, `batchQueryWallMs` median 352ms였다. 750개 후보는 각각 0.673초/640ms/316.5ms로 약 10.5%/10.3%/10.1% 짧았다. 후보는 5,012 ticker를 11개 batch/2 wave에서 7개 batch/1 wave로 바꾸며, DB query concurrency 상한 10과 KR batch500은 유지한다. 로컬 gzip bytes와 raw bytes는 기준과 후보 모두 3,493,095B/19,399,949B다.

후보 커밋 `734eadf4`(OCI run `45809274075`, 성공) 배포 후 KR 공개 API 5/5는 유효했으며 13.316초 중앙값, gzip1,524,715–1,525,115B, raw8,925,884B였다. US는 9회 시도 중 4회만 전체 수신됐고 5회는 전송 중 연결 오류로 끝났다. 네 유효 완료시간 69.692/44.622/67.408/64.490초의 median은 65.949초로, 직전 level2 US 표본 5/5 중앙값56.997초보다 15.7% 길었다. 유효 응답의 gzip bytes는 3,542,720–3,543,416B, raw19,004,536B, 5,011 ticker·0–20봉이며 gzip/JSON contract는 통과했다.

이전 batch1,000/concurrency6 후보와 마찬가지로 로컬 속도 이득이 운영에서 재현되지 않아 750 후보를 기각한다. commit `09a3cf3a`(OCI run `45813113553`, 성공)에서 US batch500으로 복구했다. 복구 후 KR 5/5 유효(3.326/3.746/5.366/7.271/31.529초, median5.366), US 6회 중 5/5 유효(58.130/48.690/56.973/65.449/65.308초, median58.130)였다. 복구 US gzip bytes는 3,543,018–3,543,592B, raw19,004,536B, ticker5,011·0–20봉이다. 두 시장 유효 응답은 HTTP200/application-gzip/Content-Encoding 없음/no-store/XFL0 및 JSON/max20 계약을 통과했다. 복구 후에도 US 한 응답이 전송 중 종료되어 해당 원인과 간헐 연결 종료는 확정되지 않았다. 결과가 근접하므로 500이 750보다 빠르다는 인과 주장은 하지 않으며, 현행 batch500을 유지하고 운영 단계 로그를 확인할 수 있을 때까지 batch/concurrency를 재변경하지 않는다.

### gzip JSON write 묶음 크기 50→250 로컬 후보 기각

`lib/public-daily-export.ts`에서 gzip 스트림에 전달하는 JSON item 묶음을 50에서 250으로 늘려 로컬 API에서 시장별 5회 전체 응답을 비교했다. 기준 50의 warmed median은 KR 0.350초, US 0.706초였다. 250 후보는 KR 0.334초, US 0.753초로 KR 차이는 16ms에 그쳤고 US는 약 6.7% 느렸다. 전체 로컬 payload/gzip 크기는 KR 8,985,808/1,506,947B, US 19,399,949/3,493,095B로 동일했고 ticker 수는 2,352/5,012였다. 응답은 HTTP200이며 gzip 해제와 JSON 파싱이 성공했다.

차이가 작고 시장 간 방향이 달라 속도 개선 근거가 없으므로 후보를 기각하고 묶음 크기 50으로 복구했다. DB query batching, 응답 schema, gzip level, flush heartbeat는 변경하지 않았다. 운영 배포하지 않았다. 로컬 API는 dev compile/cache 영향을 포함하며 운영 성능을 대표하지 않는다. 다음에는 운영 로그 단계 계측을 읽을 수 있는 접근이 마련되기 전 DB 동시성·batch 변경을 하지 않고, 로컬 후보도 충분히 반복되고 양 시장에서 안정된 이득이 보여야 운영 배포한다.
### gzip write 후보 문서 커밋 배포 후 운영 확인

write 묶음 후보를 기각하고 코드 변경 없이 기록한 커밋 `c3ac04f3`는 OCI run `45818683801`에서 전체 검증, standalone 패키징, 활성화까지 성공했다. 활성화 후 `stockman.r-e.kr` 공개 GET으로 전체 응답을 받아 gzip 해제·JSON 필드·최대20봉을 확인했다.

| 시장 | 전체 수신시간 | gzip bytes | 원본 bytes | 종목 수 | 종목당 최대 봉 | 확인 |
|---|---:|---:|---:|---:|---:|---|
| KR | 32.342초 | 1,525,055 | 8,925,884 | 2,337 | 20 | HTTP200, application/gzip, Content-Encoding 없음, no-store, XFL0, 계약 통과 |
| US | 75.861초 | 3,543,788 | 19,004,536 | 5,011 | 20 | HTTP200, application/gzip, Content-Encoding 없음, no-store, XFL0, 계약 통과 |

각 시장 1회 표본으로 네트워크와 서버 부하는 통제하지 않았다. 이 값은 배포 후 동작·데이터 계약 확인용이며 성능 회귀나 개선을 판정하는 반복 표본이 아니다. gzip 입력 묶음은 50개, KR level3/US level2, ticker DB batch500 설정이 기존대로 서비스된다. 운영 health GET도 HTTP200이었다.
### zlib 출력 chunkSize 16 KiB→64 KiB 로컬 후보 기각

Node.js 공식 zlib API에서 스트림 `chunkSize` 기본값은 16 KiB다. 출력 callback/ReadableStream enqueue 호출을 줄일 수 있는지 64 KiB를 임시 적용하고 `scripts/dev-server.mjs`의 로컬 DB/API에서 시장별 5회 전체 응답을 측정했다. 후보 warmed 값은 KR 0.367/0.418/0.347/0.324초(중앙값0.357초), US 0.749/0.753/0.721/0.720초(중앙값0.735초)였다. 기존 16 KiB 기준 warmed 중앙값 KR0.350초/US0.706초보다 약 2.0%/4.1% 느렸다. 압축 전/후 bytes와 데이터 건수는 변하지 않았고 HTTP200, gzip 해제, ticker·marketCap·daily, returnedCount, 최대20봉 계약이 통과했다. XFL은0이었다.

후보는 기각하고 공식 기본 `chunkSize`를 사용하도록 복구했다. 운영 배포하지 않았다. 더 큰 출력 slab이 이벤트 횟수를 줄이더라도 이 환경에선 zlib/stream 처리시간 또는 변동을 상쇄하지 못했다. 실제 운영 전송이 KR32.342초·US75.861초인 동안 로컬 endpoint는 1초 미만이어서 네트워크/운영 실행 환경 차이가 지배할 수 있지만, 운영 phase 로그를 직접 읽지 못해 원인은 아직 inference다. 다음 최적화는 운영 Nginx `$request_time`·`$upstream_response_time`·`$bytes_sent` 또는 앱 구조화 timing 로그를 확보해 server time과 클라이언트 전체 수신시간을 분리하는 것이다. 출처: [Node.js zlib 공식 문서](https://nodejs.org/api/zlib.html).
### zlib memLevel 8→9 로컬 후보 기각

Node.js 공식 zlib 문서는 더 큰 메모리 설정이 한 번의 write에서 더 많은 입력을 처리해 호출 수를 줄이고 속도를 높일 수 있다고 설명하며, 메모리 증가를 비용으로 든다. 현재 gzip stream의 `memLevel` 기본값 8을 9로 임시 변경해 로컬 API에서 시장별 6회 전체 요청을 수행했다. 첫 compile/cold 요청을 제외한 5회 warmed 중앙값은 KR0.344초, US0.862초였다. 같은 로컬 DB/API의 기본 설정 직전 warmed 중앙값(KR0.350초/US0.706초)과 비교하면 KR은 약1.7% 짧고 US는 약22.1% 길었다. gzip bytes는 KR1,506,947→1,504,980(-0.13%), US3,493,095→3,488,107(-0.14%)로 조금 줄었고 raw bytes와 ticker 수/봉 계약은 동일했다.

시장별 결과가 엇갈리고 US 지연 회귀가 커 후보를 기각해 기본 `memLevel: 8`로 복구했으며 운영 배포하지 않았다. Node 공식 문서의 메모리 산식 기준으로 기본 memLevel8의 deflate 메모리는 약256 KiB이고 9는 약384 KiB여서 동시 요청당 약128 KiB가 추가될 수 있다. 근거: [Node.js v22 zlib 메모리 튜닝](https://nodejs.org/download/release/latest-jod/docs/api/zlib.html#memory-usage-tuning). 다음 최적화는 압축 설정의 로컬 차이를 운영 전송 개선으로 간주하지 않고, 단계별 운영 timing 또는 다회 운영 표본을 확보해 판단한다.
### 2026-11-26 SQL compact row serialization candidate

The current endpoint asks PostgreSQL to produce each top-level JSON item with `json_build_object(...)::text`. PostgreSQL's text rendering includes formatting whitespace. The candidate keeps the same nested JSON values, aliases the three top-level fields (`ticker`, `marketCap`, `daily`) in a lateral row, and uses `row_to_json(payload)::text` to serialize that row compactly. The API response contract and single gzip stream are unchanged.

Local baseline from the previous implementation (same dev API/DB, warmed median, first compile request excluded) was KR 0.350s / US 0.706s. Candidate was exercised six sequential times per market, first cold request excluded: KR 0.36s median (range 0.32–0.38s), US 0.75s (range 0.72–0.83s). These timings are within local noise and do not establish a CPU speedup. Candidate gzip size was KR 1,506,865B and US 3,491,027B, versus the measured operating baseline medians 1,524,910B and 3,543,221B (about 1.18% and 1.47% smaller). Raw candidate JSON was 8,966,992B KR and 19,359,853B US. Local payloads parsed to 2,352 KR / 5,012 US tickers, had required ticker/marketCap/daily fields, returnedCount matched candle count, and no ticker exceeded 20 candles. HTTP 200, application/gzip, gzip decompression, XFL=0 and no-store were checked. Target route tests passed (12/12).

The operating baseline for the current SQL (3 valid downloads per market) was KR 14.187/19.509/11.103s (median 14.187s; gzip median 1,524,910B) and US 60.800/60.649/53.494s (median 60.649s; gzip median 3,543,221B). Two additional US attempts ended with a terminated connection and are excluded. These are end-to-end client-path observations and do not isolate server or network time. Since payload transfer dominates observed completion time while local query/serialization changes are small, the smaller SQL text representation is a candidate to verify in production; it is not yet an established speed improvement. Keep or revert after at least three valid post-deploy responses per market and contract checks. Record connection failures separately. No candle, market eligibility, cap, ordering, or output schema rules should change.

Regression detection: route tests assert the compact serializer expression and `marketCap` alias; a gzip API smoke must decompress and validate every record and the 20-candle cap. Remaining risks are that `row_to_json` may have different database CPU characteristics, PostgreSQL numeric textual representations can differ while preserving JSON numeric values, and operating timing is noisy. Next measure server phase logs alongside full client completion when access permits.

### Compact SQL serialization deployment check

Commit `43f000a8` deployed through OCI workflow `45827914492`, with verify, standalone packaging, upload, and activation all successful. Health returned HTTP200. Three full response downloads per market completed and all gzip/JSON checks passed:

| Market | Total seconds (3 runs) | gzip bytes (range) | raw bytes | tickers | max candles | valid | failed attempts |
|---|---|---:|---:|---:|---:|---:|---:|
| KR | 22.36 / 12.51 / 8.10 | 1,524,637–1,525,011 | 8,907,188 | 2,337 | 20 | 3/3 | 0 |
| US | 62.37 / 44.54 / 75.82 | 3,542,002–3,542,764 | 18,964,448 | 5,011 | 20 | 3/3 | 0 |

All six responses were HTTP200, `application/gzip`, no `Content-Encoding`, no-store, XFL0. Full gunzip and JSON parsing confirmed top-level ticker/marketCap/daily fields, returnedCount consistency and a 20-candle maximum. Median completion times are KR12.51s and US62.37s. Compared with the three-response current-SQL baseline (KR14.187s/US60.649s), KR median is 11.8% lower and US 2.8% higher. This small, noisy operating sample does not establish an across-market end-to-end speed improvement; it also does not show a material US regression. The candidate is retained for the confirmed 1.18%/1.47% smaller local gzip output, while speed benefit remains unproven. Continue collecting same-client operating measurements; investigate server-side phase logs when accessible.

## Completed-batch streaming overlap candidate

The exporter previously awaited `Promise.all` for every DB query in a concurrency wave before yielding any of the wave's rows to gzip. A slow query in the wave therefore held back earlier batches that had already completed; gzip encoding and transmission could not overlap the remaining query work. The candidate still starts at most 5 KR / 10 US queries concurrently and preserves the public `(market, code)` order, but awaits batch promises and yields rows in batch order. Faster earlier batches can now be compressed and sent while later promises continue. Wave DB wall timing is captured when all queries settle, independent of how long downstream streaming takes.

Local `scripts/dev-server.mjs` API comparison on the same DB and ticker universe, six sequential calls per market, first cold/compile call excluded:

| Market | Before warmed times (s) | Candidate warmed times (s) | Median before → candidate | Change | gzip bytes |
|---|---|---|---:|---:|---:|
| KR | 0.45 / 0.37 / 0.33 / 0.42 / 0.35 | 0.36 / 0.34 / 0.31 / 0.34 / 0.30 | 0.37 → 0.34 | -8.1% | 1,506,865 (unchanged) |
| US | 0.76 / 0.77 / 0.83 / 0.73 / 0.71 | 0.79 / 0.67 / 0.71 / 0.68 / 0.84 | 0.76 → 0.71 | -6.6% | 3,491,027 (unchanged) |

Completed-response server stream medians were KR 290ms→266ms and US 577ms→528ms, about 8.3%/8.5% lower. The DB wave timings were similar, consistent with better overlap rather than fewer DB operations. Candidate gzip outputs were fully decompressed and parsed: 2,352 KR/5,012 US tickers, required fields present, returnedCount matched candles, max20, XFL0. Route tests pass 13/13, including a delayed later batch proving that an earlier completed batch reaches the stream before that delay finishes, and the sorted output remains intact.

This local dataset is smaller than operating production, and it does not prove an operational speed gain. The change is a viable candidate for deployment and same-client repeat measurement; keep it only if operator results improve without API-contract violations or a meaningful total-time regression. Failed downloads are excluded and recorded separately. No DB schema/index or output contract changes are part of the candidate.

### Completed-batch streaming overlap deployment measurement

Commit `51ba4782` deployed through OCI workflow `45832024763`; verify, standalone packaging, upload, and activation succeeded. After deployment, five valid full-response downloads per market were collected from the same public host. Every successful response returned HTTP200 and `application/gzip`, omitted `Content-Encoding`, decompressed as gzip, parsed as the expected ticker/marketCap/daily array, had matching `returnedCount`, and stayed at or below 20 candles. Ticker counts were KR2,337 and US5,011; raw sizes were 8,907,188B and 18,964,448B.

| Market | Before times (s), 3 valid | Candidate times (s), 5 valid | Median before → candidate | Median change | Candidate gzip range | Failed attempts |
|---|---|---|---:|---:|---:|---:|
| KR | 22.36 / 12.51 / 8.10 | 40.88 / 14.75 / 9.73 / 4.68 / 8.21 | 12.51 → 9.73 | -22.2% | 1,524,637–1,525,025B | 0 |
| US | 62.37 / 44.54 / 75.82 | 41.38 / 44.16 / 55.09 / 54.83 / 43.41 | 62.37 → 44.16 | -29.2% | 3,542,645–3,543,073B | 1: connection terminated after 60.31s; retry succeeded |

This is a strong positive operating signal consistent with the local warmed improvement (KR -8.1%, US -6.6%) and lower server stream timing, while response sizes remained essentially unchanged. The before sample has only three valid calls, operating load is uncontrolled, and one US candidate call failed; therefore the percentages are observed medians, not a controlled causal estimate or availability improvement. Keep the candidate deployed, continue gathering repeated same-client measurements, and treat connection termination as a separate reliability issue. Response schema, ordering, gzip level, concurrency, DB batch size, and candle limit were not changed.

## Sliding DB batch scheduling candidate rejected

The current deployed code emits completed DB batches in market/code order and runs no more than the market concurrency. A candidate used a fixed pool of workers to start the next batch as soon as any query slot freed up, rather than waiting until all queries in a 10-query group completed before starting the final US batch. Output ordering and the 10-query limit were preserved. A targeted delayed-query test passed 14/14 overall and showed the final batch starting before the slower first-group queries finished.

For an apples-to-apples local `scripts/dev-server.mjs` comparison, the same local database was measured in two baseline/candidate blocks, six sequential full API responses per market per block, first compile/cold response excluded:

| Block | KR baseline → candidate median | US baseline → candidate median |
|---|---:|---:|
| A | 0.37s → 0.40s | 0.71s → 0.73s |
| B | 0.37s → 0.41s | 0.71s → 0.73s |

Gzip output sizes were unchanged (KR1,506,865B, US3,491,027B). Because full-response times were consistently not faster in either market, despite the queued batch starting earlier, the candidate was rejected and the implementation was restored to the existing fixed-wave scheduler. The candidate route suite passed 14/14 including its temporary scheduling assertion; that assertion was removed with the rejected candidate. Final route test after rollback passed 13/13. This scheduling candidate was not deployed; the already-deployed completed-batch streaming change remains. The experiment suggests that the small final DB batch is not the dominant client completion bottleneck in the local dataset. The retained regression suite continues to check bounded concurrency and ordered streaming contracts.

## Covering-index split candidate rejected (2026-11-26)

The existing candle covering indexes have a `volume > 0` partial predicate, while the public export's validity predicate also admits zero-volume candles. A candidate split recent-candle lookup into positive and zero-volume branches to let the first branch use that index while preserving zero-volume output. Read-only PostgreSQL `EXPLAIN (ANALYZE,BUFFERS)` confirmed that the baseline US lookup chose the regular lookup index (AAPL execution 0.179ms in one warm-cache sample) and a positive-only lookup could choose the covering index (0.230ms in one sample); the zero-volume branch fell back to the regular index and took 4.570ms for that ticker. These single-ticker plans were only a hypothesis, not evidence of whole-request improvement.

Local full API baseline after excluding the first warmed call used the same database and 2,352 KR / 5,012 US symbols. Seven sequential baseline requests measured KR 0.44/0.34/0.31/0.30/0.34/0.39/0.30s and US 0.72/0.68/0.70/0.69/0.72/0.72/0.69s; medians 0.34s and 0.70s. Gzip output stayed 1,506,865B KR and 3,491,027B US.

The first candidate implementation caused PostgreSQL syntax errors at `UNION` for both routes (HTTP500); this was visible in actual route calls and was corrected with parenthesized limited branches. The next candidate run exposed that the US branch also needed to carry the source `trading_value` field used by the existing serializer (HTTP500); this was corrected without changing the response contract. With both branches executing successfully, seven warmed US candidate calls measured 1.48/1.47/1.15/1.24/1.28/1.22s, median 1.26s (about 80% slower than the 0.70s baseline); first request 3.32s excluded. KR successful candidate calls after syntax correction were 0.45/0.14/0.14/0.23/0.12/0.11s after the first 0.86s compile/cold call, but that speed signal is not accepted because US regressed materially. Both outputs retained the exact baseline gzip sizes. Candidate was reverted before any deployment. Baseline source was restored; no schema or response change deployed.

Cause: the extra per-ticker union and merge/order work outweighed the partial-index benefit at full request scale; local single-ticker plans did not predict the broad batched query workload. Detection: keep an actual full API contract and repeated warmed comparison as the gate for query plan changes; current route tests alone mock database execution and did not catch SQL syntax/column errors. Risk/next: local data/host differs from OCI production; pursue candidates that reduce completed end-to-end latency for both markets and validate PostgreSQL execution on real route traffic before considering deployment. No commit/push/deploy was performed for this rejected candidate.

## Initial gzip flush removal candidate rejected (2026-11-26)

The stream writes `[` then performs `Z_SYNC_FLUSH` before waiting for database rows. I removed only this initial flush temporarily so the opening bracket could share the first item write; gzip compression remained one gzip stream at KR level3 / US level2. Same local Next API and database, six sequential calls per market per version, with first cold/compile request excluded:

| Market | Baseline warmed full API (s), median | No-initial-flush candidate warmed (s), median | Baseline → candidate gzip bytes |
|---|---|---|---|
| KR | 0.40 / 0.33 / 0.31 / 0.30 / 0.34; 0.33 | 0.36 / 0.29 / 0.29 / 0.30 / 0.30; 0.30 | 1,506,865 → 1,506,858 |
| US | 0.65 / 0.69 / 0.65 / 0.70 / 0.75; 0.69 | 0.69 / 0.72 / 0.67 / 0.66 / 1.10; 0.69 | 3,491,027 → 3,491,020 |

The complete candidate gzip responses decompressed and parsed: KR2,352 / US5,012 records; every record had ticker, marketCap and daily fields, daily candles arrays within 20, and `daily.metadata.returnedCount` equal to candle count. Candidate response sizes were seven bytes smaller per market. Server timing showed KR warmed stream median approximately289→261ms, but US 546→562ms; warmed client median US was unchanged. Removing the flush did not materially improve both-market completion speed, and KR's small difference is within local timing noise. Candidate was rejected and the original initial flush restored before deployment. No code/schema change deployed.

The initial flush sends a tiny gzip prefix before DB results arrive; keeping it preserves immediate stream-start behavior. Detection/next: compare median full-response completion and server phase values, not first-byte or byte count alone; avoid reworking this flush unless a repeatable end-to-end gain appears without a market regression. The initial-flush control itself is not currently asserted by the mocked route suite.

## 2026-11-26 operating API baseline refresh

Downloaded the current deployed public endpoints sequentially through `PUBLIC_BASE_URL`, saving the complete gzip bodies. Three full downloads per market completed: KR 11.01/10.43/14.24s (median11.01s), US55.73/48.49/52.94s (median52.94s). Gzip sizes were KR1,524,948/1,524,954/1,524,637B and US3,542,658/3,542,680/3,542,756B. Every saved body decompressed and parsed as the established contract: 2,337 KR / 5,011 US ticker records, raw bytes8,907,188/18,964,448, ticker/marketCap/daily fields, returnedCount matches candle count, and max20 candles. A `-PassThru` confirmation request per market explicitly returned HTTP200 and `application/gzip`; no `Content-Encoding` was present, and cache policy was `no-store` (plus existing no-cache directives).

The first two PowerShell measurements per market initially appeared as failed because `Invoke-WebRequest -OutFile` returns no response object by default; accessing `$response.Headers` then threw after the full body had already been saved. This was a measurement-harness classification error, not an HTTP failure. The saved files were independently gzip-decoded and validated, and a follow-up with `-PassThru` captured status and headers. Future `-OutFile` samples must use `-PassThru` to inspect headers, and classify completion from both request outcome and file/body validation.

Compared with the earlier five-response deployed sample (KR median9.73s, US44.16s), these observed medians are 13.2% and19.9% higher. The sample is small and server load/network path are uncontrolled, so it does not establish a regression or cause. OCI host phase logs remain inaccessible in this environment (`~/.oci/config` absent; SSH directory contains only known-host files and no SSH keys); local PostgreSQL/Next timings cannot explain the operating transfer difference. Current production source is unchanged; this is a measurement refresh only. Next priority is obtaining accessible server timing/logs or a production-side repeat with controlled client/network conditions before selecting a code change from this gap.

## Removed a redundant candle sort key (2026-11-26)

The per-ticker candle query selected the latest rows using `ORDER BY candle_date DESC, fetched_at DESC`, but both daily-candle tables enforce `UNIQUE (market, code, timeframe, candle_date)`. For a given ticker/timeframe there cannot be two rows with the same date, and the response's candle array is separately ordered by date ascending. Thus `fetched_at DESC` could never resolve a tie or affect output. PostgreSQL nevertheless planned an Incremental Sort with this extra key. Removing it lets the existing `(market, code, timeframe, candle_date DESC)` lookup index satisfy the top-20 ordering directly.

Actual read-only local PostgreSQL plans changed from `Incremental Sort -> Index Scan` to `Index Scan` with no sort. One warm AAPL plan reported 0.515ms total with the old order and 0.146ms with date-only order; cache state differed, so this per-ticker figure is illustrative, not causal. Full API comparison used two sequential blocks, six calls per market per version, excluding each first post-change/cold response:

| Block | KR baseline → date-only median | US baseline → date-only median |
|---|---:|---:|
| A | 0.32s → 0.34s | 0.74s → 0.71s |
| B | 0.33s → 0.31s | 0.72s → 0.69s |
| Combined warmed median | 0.325s → 0.315s (-3.1%) | 0.73s → 0.69s (-5.5%) |

The per-block KR difference changed direction, indicating a small/noisy signal. US improved by about4% in both blocks; combined medians improved in both markets. Gzip output bytes were identical (KR1,506,865B; US3,491,027B). Full candidate gzip responses decompressed and parsed and were byte-for-byte identical to their same-data baseline counterparts: 2,352 KR / 5,012 US tickers, matching raw bytes, required ticker/marketCap/daily fields, returnedCount equality, and <=20 candles. Route tests passed 13/13; an assertion now guards the date-only `ORDER BY`. Both tables' live PostgreSQL unique constraints were verified, and migration V67 defines the same constraint.

This is an algebraically safe ordering simplification and a positive local full-response signal, not yet proof of OCI performance. `npm run deploy:verify` passed: production build, standalone/runtime and Chrome smoke, all 283 test files passed with 1 skipped (1,651 tests passed, 3 skipped), typecheck, documentation/API/security/cron audits. Commit `13ed6f97` deployed successfully through OCI workflow `45844724755` on 2026-11-27 KST.

### Post-deployment operating verification

Three sequential full downloads per market all returned HTTP200 and `application/gzip`, with no `Content-Encoding` header and `no-store` cache policy. Every body decompressed and parsed. KR timings were 9.97/7.69/3.20s (median7.69s), gzip1,524,637B per call, raw8,907,188B, 2,337 tickers. US timings were 41.86/59.97/43.70s (median43.70s), gzip3,542,614–3,543,019B, raw18,964,448B, 5,011 tickers. All records had ticker/marketCap/daily fields, `daily.metadata.returnedCount` matched candle count, and maximum candles was20.

Relative to the immediately preceding three-call operating sample (KR median11.01s, US52.94s), observed medians were 30.2% and17.4% lower. The gzip medians decreased only about0.02%/0.001%, so this was not a payload-size reduction. The before/after samples were small and operating load/network conditions uncontrolled; treat the faster observed completion as a positive signal consistent with the local query-plan change, not a causal estimate. Continue measuring and restore the prior order if a material repeatable regression appears.

### 2026-11-27 — 숫자 품질 필터 변환 제거 후보

공개 일봉 SQL은 `NUMERIC` 가격/거래량 5개를 문자열로 변환한 뒤 `NaN`, `Infinity`, `-Infinity`와 비교했다. 기존 양수 가격 및 비음수 거래량 조건은 `-Infinity`를 배제한다. PostgreSQL NUMERIC에서 `NaN`은 일반 숫자보다 큰 값으로 정렬되고 `Infinity`는 최댓값이므로 `< 'Infinity'::numeric`을 추가해 기존에 허용되지 않던 값이 결과에 들어오지 않게 하면서 text 변환을 제거했다. [PostgreSQL NUMERIC 공식 문서](https://www.postgresql.org/docs/16/datatype-numeric.html).

동일한 로컬 API/DB의 기준·후보 gzip 응답을 각 시장 6회 수집했다. 모든 12개 응답은 gunzip 후 원본 JSON 바이트가 기준과 일치했다. KR 2,352 ticker/8,966,992 raw bytes/1,506,865 gzip bytes, US 5,012 ticker/19,359,853 raw bytes/3,491,027 gzip bytes다. 응답 행마다 ticker, marketCap, daily 필드, `returnedCount`와 candle 개수 일치, 최대20봉을 검사했다. 대상 품질 predicate와 공개 KR/US route 테스트 15개가 통과했다. 이 반복 비교에서 candidate 전체 응답 시간 샘플을 보존하지 못해 개선률은 보고하지 않는다. 이전 기준 warmed median은 KR310ms, US720ms였다. 따라서 성능 이득은 미확정이다.

운영 배포 PostgreSQL major 버전과 로컬 `DATABASE_URL`은 확인할 수 없었다. 실제 SQL 연산은 NUMERIC 리터럴 비교이며 배포 후 양쪽 공개 API 호출이 호환 여부를 확인한다. 운영 중 예외 또는 데이터 계약 실패가 발생하면 조건 변경을 복구한다. 다음 단계는 전체 배포 검증 뒤 운영 API를 시장별 반복 호출해 HTTP/gzip/JSON/20봉 계약과 시간을 측정하는 것이다.

### 공개 일봉 numeric 필터 배포 및 운영 확인

커밋 `ccce3836`의 OCI `Deploy OCI` 실행 `45851910904`는 GitHub run 화면에서 `completed successfully`로 확인했다. 로컬 `npm run deploy:verify`는 283개 테스트 파일 통과/1개 skip, 1,651 passed/3 skipped, typecheck, 문서/API/security/cron 감사, production build, standalone HTTP 및 Chrome desktop/mobile smoke를 통과했다. 운영 health GET은 HTTP200이다.

배포 후 동일 공개 host에서 KR 전체 gzip 다운로드를 3회, US를 2회 성공적으로 완료했다. 모두 HTTP200, `application/gzip`, `Content-Encoding` 없음, `no-store`, gunzip/JSON 파싱, ticker/marketCap/daily, `returnedCount` 일치와 최대20봉을 확인했다. KR은 2,337 ticker, raw 8,907,188B, gzip 1,524,873/1,524,637/1,524,956B, 시간 21.57/22.79/6.15초(median21.57초). US는 5,011 ticker, raw 18,964,448B, gzip 3,542,699/3,542,606B, 시간 57.51/59.99초(median58.75초). 연속 US 추가 요청 중 세 건은 HTTP502로 완료되지 않았고, 20초 간격 후 재시도는 성공했다. 오류 호출은 성능 표본에 넣지 않았다.

운영 표본은 작고 API/네트워크 부하가 통제되지 않아 numeric 문자열 변환 제거의 운영 속도 효과는 입증되지 않았다. 502는 성공 측정과 별도 가용성 신호로 남긴다. SQL은 NUMERIC 상한 비교로 유지하고, 후속 운영 반복에서는 간격을 둬 502 발생률과 완료시간을 함께 본다. 테스트는 다섯 숫자 열 각각의 Infinity 상한을 검사하도록 보강했다. 보고서 변경 커밋 전 전체 `deploy:verify`를 다시 수행한다.

### 2026-11-27 — 공개 일봉 batch SQL 준비 문장 재사용

`lib/public-daily-export.ts`에서 반복 batch 쿼리를 `node-postgres`의 이름 있는 query config로 실행하도록 변경했다. 동일한 SQL은 연결별로 준비 문장을 재사용할 수 있다. 근거: [node-postgres 공식 query 문서](https://node-postgres.com/features/queries). 시장별 고정 이름은 `public-daily-export-kr-batch-v1` 및 `public-daily-export-us-batch-v1`이다. API 데이터와 압축 설정은 변경하지 않았다.

동일 로컬 DB/API에서 기존 기준선 8회와 후보 8회를 순차 측정하고 첫 cold 호출을 제외했다. KR 중앙값은 331ms에서 326ms로 1.5% 짧아졌고, US는 740ms에서 662ms로 10.5% 짧아졌다. 각 시장 후보 8개 gzip 응답의 해제 JSON은 기준 파일과 전부 바이트 단위로 동일했다. 후보 gzip 크기는 KR 1,506,865B, US 3,491,027B였으며 각 2,352/5,012 ticker, ticker/marketCap/daily 구조와 일봉 최대20개를 확인했다. 목표 테스트 15개가 통과했다. HTTP 전체 응답 반복 결과는 로컬 환경 한정이며 운영 회귀 여부는 배포 후 별도 측정한다.

`npm run deploy:verify`는 성공했다(283개 테스트 파일 통과/1 skip, 1,651 passed/3 skipped, typecheck, build, runtime/browser smoke 및 문서/API/security/cron 감사). commit `d51023e8`의 OCI run `45864690217`도 성공했고 운영 health GET은 HTTP200이었다.

배포 후 운영 GET을 시장별 3회씩 순차 측정했다. KR 응답은 21.653/11.657/3.154초(median11.657초), US는 40.101/45.557/40.711초(median40.711초)였다. 모든 호출 HTTP200, `application/gzip`, `Content-Encoding` 없음, `no-store`; gunzip/JSON 및 ticker/marketCap/daily, returnedCount, 최대20봉, gzip XFL0 검증을 통과했다. KR 2,337 ticker/raw8,907,188B/gzip1,524,637–1,525,028B, US 5,011 ticker/raw18,964,448B/gzip3,542,337–3,542,761B였다. 이전 운영 표본 중앙값(KR21.57초, US58.75초)보다 낮았지만 부하와 시간대를 통제하지 않았으므로 코드 변경만의 인과효과로 단정하지 않는다.

변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, `DEVELOPMENT_LOG.md`, 본 보고서. 코드는 commit `d51023e8` 및 OCI run `45864690217`로 배포 완료했다. 이번 운영 측정 결과를 반영한 문서는 다음 문서 기록 커밋/배포에서 전체 검증을 거친다.

### 2026-11-27 — gzip stream write 묶음 크기 조정 후보

Node stream의 `write()` callback은 chunk가 처리된 뒤 호출된다. 기존 구현은 ticker JSON을 50개씩 묶어 매번 callback을 기다렸다. Node 공식 [Writable stream 문서](https://nodejs.org/api/stream.html#writablewritechunk-encoding-callback)에 설명된 chunk 처리 동작을 근거로, write 묶음을 DB query batch와 동일한 500개로 맞춰 callback과 join 횟수를 줄였다. API payload, gzip level, DB 동시성은 그대로다. 회귀 보호는 route 테스트의 `streams an earlier completed batch while a later concurrent batch is still pending` 사례가 각 완료 batch의 streaming을 검사한다.

같은 로컬 DB와 dev API로 기준 50개 / 후보 500개를 반복 교차 측정했다. 한 측정 블록의 첫 cold 호출을 제외한 HTTP median은 KR 343→300ms(12.5% 단축), US 730→719ms(1.5% 단축)이었다. 다른 블록에서는 US 기준 696ms, 후보 698ms로 사실상 동률이었고 KR 기준 317ms, 후보 291ms(8.2% 단축)였다. 내부 performance timing에서는 stream duration median이 KR 297.5→251.5ms(15.5% 단축), US 545→518.5ms(4.9% 단축)이었다. 다른 블록에선 US HTTP median이 791→679ms였으나 반복 블록 간 편차가 있어 그 개선률을 일반화하지 않는다. gzip bytes는 KR1,506,865B/US3,491,027B로 그대로였고, 기준 및 후보 각 6개 응답의 gunzip 원문은 완전히 일치했다. 계약은 로컬 KR2,352/US5,012 ticker, 최대20봉을 만족했다.

동일 DB batch 기준 예상 stream write 횟수는 KR 약48→5회, US 약101→11회다. 임시 joined string의 대표 최대 크기는 KR1,656,605B, US1,711,333B로, 요청당 약1.7MB의 추가 peak 문자열 메모리가 예상된다. 1,000개 묶음은 US median 745ms로 500개 후보보다 느렸고, 500개 DB batch를 넘어가면 앞선 batch의 stream 전달을 늦출 수 있어 채택하지 않았다. US gzip level1은 median 688→715ms, gzip 3,491,027→3,581,992B로 느리고 커져 기각했다. concurrency11, SQL `string_agg`, 200개 묶음은 반복 성능 이득이 500개보다 작거나 일관되지 않아 제외했다.

판정은 500개 묶음을 유지하는 것이다. KR 응답과 stream phase가 반복해서 짧아졌고 US stream phase도 짧아졌으며, payload와 gzip bytes는 동일했다. 추가 peak memory가 남은 위험이다.

`npm run deploy:verify` 전체 성공(283 test files pass/1 skip, 1,651 passed/3 skipped, typecheck, build, runtime/browser smoke, 문서/API/security/cron 감사) 뒤 commit `17f63513`, OCI run `45870683076`을 배포했다. 운영 health는 HTTP200이었다. 배포 후 공개 API를 시장별 3회 순차 호출했고 모두 HTTP200, `application/gzip`, Content-Encoding 없음, no-store, XFL0, gunzip/JSON/필드/returnedCount/max20 검증을 통과했으며 502는 없었다.

| 시장 | 운영 응답 시간 | median | gzip bytes | raw bytes | ticker 수 |
|---|---|---:|---:|---:|---:|
| KR | 13.466 / 16.289 / 5.487초 | 13.466초 | 1,524,637–1,524,957 | 8,907,188 | 2,337 |
| US | 52.013 / 40.076 / 38.445초 | 40.076초 | 3,542,655–3,543,009 | 18,964,448 | 5,011 |

직전 운영 실측 median(KR11.657초, US40.711초)과 비교해 KR은 느렸고 US는 약간 짧았다. API/network/DB 부하가 통제되지 않았으므로 이 후보의 운영 end-to-end 속도 효과는 입증하지 않는다. gzip 해제 payload 계약은 동일했고 실패/502도 발생하지 않았다. 다음에는 장시간 누적 요청의 process RSS와 동시 요청을 관찰해 요청당 약1.7MB의 추가 임시 문자열이 운영 메모리에 미치는 영향을 확인한다.
### 2026-11-27 — KR 일봉 turnover 유효성 변환 제거, 티커 선조회 후보 기각
- 목적/범위: 운영 KR gzip 일봉 API 처리 시간을 줄이기 위해 봉별 `trading_value::text` 변환/정규식 대신 기존 숫자 finite bounds를 적용했다. V180 스키마에서 KR `trading_value`는 `DOUBLE PRECISION`; US는 V92 기준 `NUMERIC`이므로 US validation SQL은 유지한다. ticker, 시총, daily JSON, gzip level과 batch 설정은 바꾸지 않았다.
- 후보 기각 근거: batch별 universe/fundamental 조인과 자격 predicate를 제거하고 request 시작 시 티커 metadata를 한 번 읽어 보내는 후보도 비교했다. baseline→candidate warmed full API 중앙값 Block A KR368→367ms, US650→722ms(+11.1%); Block B KR346.5→319ms, US735→750.5ms(+2.1%). Gunzip 원문은 같고 gzip size 불변이었으나 US가 두 블록 모두 느려져 해당 metadata 이동 후보를 기각하고 기준 SQL로 복구했다.
- 수치 조건 후보 측정: 동일 scripts/dev-server.mjs/local DB에서 기준 warmed 호출 11회와 KR 후보 12회 비교. 기준 KR 중앙값354ms, KR finite-bound 후보315.5ms(약10.9% 단축). US는 기준 validation을 그대로 둔 최종 후보 code에서 warmed 중앙값689ms, 기준693ms로 사실상 동일. KR/US 양쪽 gzip 크기는 각각1,506,865B/3,491,027B이고 대표 기준/후보 gunzip JSON 원문은 바이트 단위로 동일했다(8,966,992B/19,359,853B). payload 티커·시총·daily 구조 및 max20/returnedCount 계약을 확인했고 관련 테스트15개 통과.
- 원인/회귀 감지/위험: KR 매 캔들마다 발생하던 text formatting과 regex CPU를 제거했다. NUMERIC/DOUBLE PRECISION의 Infinity/NaN 순서는 PostgreSQL 공식 numeric/type docs에 맞춰 finite bounds를 쓴다. 테스트는 KR에서 두 numeric bounds와 text regex 부재, US에서는 기존 regex 유지, 컬럼 부재 fallback 유지 여부를 확인한다. 운영에서 HTTP 오류·gzip/JSON 차이·계약 위반이 생기면 즉시 이전 KR regex 경로로 복구한다. 로컬 효과는 반복 신호이며 운영 효과와 속도 개선률은 배포 후 반복 호출로 검증한다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 운영 성능 보고서, 본 로그. 커밋 전 전체 `npm run deploy:verify`를 완료한다.

### KR turnover predicate 배포 후 운영 실측

커밋 `cc522c6a`의 OCI Deploy OCI run `45858764226`은 전체 Verify deployment, standalone 패키징, release 업로드, Activate release까지 성공했다. 활성화 뒤 운영 공개 API를 시장별 순차 3회 요청했다. 여섯 응답 모두 HTTP200/application-gzip, Content-Encoding 없음, no-store, gzip 해제/JSON 파싱 및 각 항목 ticker·marketCap·daily, returnedCount 일치, 최대20봉을 통과했다. XFL은 전부0이었다.

| 시장 | 전체 다운로드 시간 | 중앙값 | 티커 / raw bytes | gzip bytes | 유효/실패 |
|---|---|---:|---:|---:|---:|
| KR | 24.40 / 9.24 / 13.18초 | 13.18초 | 2,337 / 8,907,188B | 1,524,637 / 1,524,637 / 1,525,427B | 3/3 |
| US | 35.07 / 54.66 / 63.93초 | 54.66초 | 5,011 / 18,964,448B | 3,542,403 / 3,543,019 / 3,542,756B | 3/3 |

직전 운영 표본(KR 21.57초 중앙값, US 58.75초 중앙값)과 비교하면 관측 중앙값이 각각 약38.9%, 7.0% 짧다. 직전 표본은 KR 3회·US 2회였고 이번 역시 운영 부하와 경로 상태를 제어하지 않았으므로 인과 성능 개선률은 확정하지 않는다. 크기와 raw payload는 유지되었고 502는 이번 6회에서 재현되지 않았다. 로컬 KR warmed 중앙값은 354ms→315.5ms로 약10.9% 줄었다. 변경은 KR의 double precision turnover validation 하나에 한정하고 US regex는 보존한다. 더 많은 운영 반복과 서버 단계 timing을 모아 효과 및 502 재발 여부를 추적한다.

## 2026-11-27 — gzip level9 운영 배포 및 실측

커밋 `09120e9b`의 OCI Deploy OCI run [45879443438](https://github.com/pjtss/StockMan/actions/runs/45879443438)은 Verify deployment, standalone 패키징, 업로드, Activate release를 모두 성공했다. 운영 API를 배포 후 시장별 5회 순차 호출했다. 모든 10개 응답은 HTTP200, `application/gzip`, gzip magic 및 XFL=2를 확인했고, gzip 해제·JSON 파싱 후 top-level 배열의 모든 항목에서 `ticker.code`, `marketCap.value`, `daily.candles` 및 `daily.metadata.returnedCount` 일치를 검사했다. 최대 봉 수는 20이었다. 응답에는 `Content-Encoding`이 없었다.

| 시장 | 전체 다운로드 시간 | 중앙값 | 첫 바이트 중앙값 | gzip bytes | raw bytes | 티커 수 |
|---|---|---:|---:|---:|---:|---:|
| KR | 5.391 / 8.003 / 7.407 / 14.165 / 9.618초 | 8.003초 | 0.434초 | 1,243,447–1,244,017 | 8,907,188 | 2,337 |
| US | 42.658 / 67.703 / 42.947 / 33.761 / 47.168초 | 42.947초 | 0.683초 | 2,844,043–2,845,848 | 18,964,448 | 5,011 |

이전 level3/2 운영 기준은 KR 9.929초, US 28.148초 단일 측정이었다. 새 KR 5회 중앙값은 그 단일 기준보다 19.4% 짧고 US는 52.5% 길다. 표본 수와 운영 경로/부하가 달라 level9가 응답 완료시간을 개선했다고 결론 내릴 수 없다. 반면 gzip bytes는 기존 약 1,524,637B/3,542,002B에서 이번 약 1,244KB/2,844KB로 약 18.4%/19.7% 줄었다. 운영 다운로드 시간은 API 첫 바이트 이후 본문 수신이 지배하며 편차가 크다. 로컬 API 전체 시간은 level9에서 더 느렸으므로 CPU 비용이 낮은 속도를 요구하는 환경에서 위험으로 남는다.

판정: 운영 GET과 데이터 계약은 정상이고 wire payload는 약 18–20% 줄었으나, 속도 효과는 KR/US 일관성이 없고 원인 효과를 입증하지 못했다. 사용자의 속도 최우선 요구에 따라 운영 실측을 계속 추적하며, 반복 측정에서도 처리시간이 악화되는 시장은 더 낮은 gzip level 또는 전송 경로 개선 후보를 다음 배포에서 비교한다. 자동 회귀 감지는 응답 계약 테스트와 배포 후 시장별 반복 GET으로 유지한다. 이번 실측은 클라이언트의 실제 네트워크 경로를 사용했지만 서버/클라이언트 부하를 통제하지 못했다.

## 2026-11-27 — gzip 출력 청크 16→64KB 후보

Node.js v22 공식 zlib 문서에서 `createGzip`의 `chunkSize` 기본값은16KB이며 압축 스트림의 출력 slab 크기를 설정한다. 같은 운영 gzip 본문을 입력해 level3/9와 16/64/128KB를 조합, 시장별 5회 실행했다. level9에서 중앙 처리시간은 KR 341.99→337.24ms, US 578.16→571.89ms(16→64KB)였고 output event 중앙 개수는 KR110→53, US247→117이었다. 압축 크기는 동일했다. 128KB는 KR에서 더 빨랐지만 US level3 처리시간이 112.06→131.71ms로 악화되어 공통값에서 제외했다.

`createGzip({ level: 9, chunkSize: 64 * 1024 })` 후보를 실제 Next API 경로로 6회/시장 검증했다. 첫 compile/cold 호출을 제외한 전체 HTTP 완료시간 중앙값은 KR614ms, US1,008ms였다. 직전 16KB level9 로컬 기준 중앙값 KR629ms, US1,202ms 대비 각각 약2.4%,16.1% 짧았다. gzip 크기는 KR1,201,818B/US2,828,164B로 그대로였고 raw payload KR8,966,992B/US19,359,853B, ticker2,352/5,012, 각 필수 ticker·marketCap·daily 필드, `returnedCount`, 최대20봉 계약도 확인했다. 로컬 DB/API라 운영 속도에 일반화할 수 없고 개선폭은 특히 KR에서 작다. 64KB 출력 slab은 연결별 메모리를 기본보다48KB 늘리므로 높은 동시 요청의 메모리 영향은 운영 관찰 대상이다.

선택: 64KB 설정은 현재 level9 압축률과 gzip 파일 바이트를 유지하면서 로컬 API 속도를 양쪽에서 개선해 배포 후보로 채택한다. 전체 검증 및 OCI 배포 후 운영 GET을 시장별 반복 측정한다. 운영 실측에서 개선이 재현되지 않거나 회귀하면 16KB로 복구한다. 공식 근거: [Node.js v22 zlib Options](https://nodejs.org/download/release/latest-v22.x/docs/api/zlib.html#class-options).

### gzip 64KB 청크 OCI 배포 후 실측

커밋 `b327ab57`의 [OCI run 45884140595](https://github.com/pjtss/StockMan/actions/runs/45884140595)은 성공했고 운영 활성화가 완료됐다. 배포 후 KR·US 공개 API를 각각 5회 순차 호출했다. 10개 모두 HTTP200, `application/gzip`, Content-Encoding 없음, gzip XFL=2, gunzip/JSON 및 ticker·marketCap·daily 필드 존재, returnedCount 일치와 최대20봉을 통과했다.

| 시장 | 전체 완료 시간 | 중앙값 | 첫 바이트 중앙값 | gzip bytes 범위 | raw bytes | 티커 |
|---|---|---:|---:|---:|---:|---:|
| KR | 11.365 / 6.805 / 3.908 / 4.162 / 4.367초 | 4.367초 | 0.209초 | 1,243,447–1,244,017 | 8,907,188 | 2,337 |
| US | 51.713 / 45.181 / 44.797 / 40.143 / 42.547초 | 44.797초 | 0.400초 | 2,844,472–2,845,348 | 18,964,448 | 5,011 |

바로 이전 level9 기본 16KB chunk의 운영 5회 중앙값은 KR8.003초, US42.947초였다. 이번 표본은 KR45.4% 짧고 US4.3% 길었다. Gzip 크기는 사실상 동일하고, 변경 전후 운영 네트워크·서버 부하가 통제되지 않았으므로 KR 개선을 인과 효과로 확정하거나 US 결과로 회귀를 판정할 수 없다. 로컬 실제 API에서는 기본16KB 대비 64KB 전체 응답 median이 KR629→614ms, US1,202→1,008ms였고 gzip bytes는 같았다. 따라서 64KB를 유지하고 더 많은 배포 표본으로 양 시장 결과를 추적한다. US에서 4.08초 첫-byte outlier가 하나 있어 해당 회차의 51.713초 전체시간은 다른 네 표본과 구분해 해석한다. 운영 DB/stream 내부 timing 접근은 현재 불가능하다.

## 2026-11-27 — level9 gzip `Z_FILTERED` 전략 후보

Node.js v22 `createGzip`는 `strategy` 옵션을 지원하고 [zlib 공식 설명](https://www.zlib.net/manual.html#Advanced)은 `Z_FILTERED`가 기본 전략보다 Huffman 코딩 비중을 높이고 문자열 매칭을 줄이도록 조정한다고 정의한다. JSON export payload에 적용해도 gzip 형식과 원본 JSON 바이트는 유지됐다.

운영에서 받은 payload 원문을 대상으로 level9/chunk64KB를 유지하고 strategy만 바꿔 각 시장 7회 압축했다. 기본→`Z_FILTERED`의 CPU 중앙값은 KR342.74→330.16ms, US596.55→546.68ms였고 gzip 크기는 KR1,243,440→1,219,332B(-1.94%), US2,843,591→2,818,702B(-0.88%)였다. `HUFFMAN_ONLY`와 `RLE`는 압축이 약 5.37MB/11.57MB로 커져 제외했고 `FIXED`는 US 3.68MB로 기본보다 불리했다.

같은 로컬 API 서버/DB에서 default와 candidate를 각 6회 실행하고 첫 compile 요청을 제외했다. 기본→candidate 전체 HTTP median KR628.678→622.125ms(-1.0%), US1,022.514→988.358ms(-3.3%)였다. gzip bytes KR1,201,818→1,178,244B(-1.96%), US2,828,164→2,797,603B(-1.08%), raw bytes는 8,966,992/19,359,853B 그대로였다. 양 시장의 gzip 해제 JSON SHA-256이 baseline과 candidate에서 각각 동일했고, ticker·marketCap·daily 필드/returnedCount/max20 계약을 통과했다. 이 local signal은 작으며 운영 부하를 통제한 인과 측정은 아니다.

후보 구현은 `createGzip({ level: 9, chunkSize: 64 * 1024, strategy: Z_FILTERED })`다. 대상 route tests 13/13 통과. 전체 deploy verification 및 OCI 배포 후 동일한 공개 운영 GET을 시장별 반복 측정한다. 운영에서 이득이 재현되지 않거나 회귀하면 기본 strategy로 되돌린다. 공식 근거는 [Node.js v22 zlib options](https://nodejs.org/download/release/latest-v22.x/docs/api/zlib.html#class-options) 및 [zlib manual strategy](https://www.zlib.net/manual.html#Advanced)다.

### `Z_FILTERED` OCI 운영 결과

커밋 `28f245e0`의 [OCI run 45889015154](https://github.com/pjtss/StockMan/actions/runs/45889015154)는 성공했고 운영 활성화가 확인됐다. KR/US 공개 GET을 각각 5회 순차 호출했다. 모든 10개 응답은 HTTP200, `application/gzip`, Content-Encoding 없음, XFL=2였고 gzip 해제 및 전체 JSON의 ticker·marketCap·daily 필드 존재, `returnedCount` 일치, 최대20봉을 통과했다.

| 시장 | 전체 응답시간 | 중앙값 | first-byte 중앙값 | gzip 크기 중앙값 | raw bytes | 티커 |
|---|---|---:|---:|---:|---:|---:|
| KR | 14.950 / 10.408 / 17.750 / 13.904 / 10.114초 | 13.904초 | 0.273초 | 1,219,342B | 8,907,188 | 2,337 |
| US | 46.502 / 52.735 / 48.566 / 47.499 / 48.347초 | 48.347초 | 0.814초 | 2,820,137B | 18,964,448 | 5,011 |

기본 strategy/chunk64KB 직전 5회 운영 median은 KR4.367초/US42.947초였다. 이번 completion median은 더 길었지만 운영부하를 통제하지 않았다. 계산상 first-byte 이후 유효 다운로드 속도는 KR 약299→89KB/s, US 약67→59KB/s로 바뀌어 작은 payload 차이만으로 completion 차이를 설명할 수 없다. `Z_FILTERED`는 로컬 전체 API warmed median을 KR1.0%, US3.3% 낮추고 wire bytes를 줄였으므로 현 구현을 유지하되 운영 속도 이득은 미확정으로 기록한다.

다음 후보 측정: 실제 운영 raw payload로 level8+`Z_FILTERED`는 level9+`Z_FILTERED`보다 compressor CPU median이 KR315.44ms 대352.32ms(10.5% 단축), US546.99ms 대542.09ms(사실상 동률)였고 gzip 크기는 양쪽 약50B 증가했다. 이득이 API 전체에 나타나는지 확인하지 않았고 XFL metadata가 2→0으로 바뀌므로, 자동 계약 테스트 업데이트를 포함한 실제 endpoint 비교 후에만 선택한다.

## 2026-11-27 — gzip level8 + Z_FILTERED 속도 후보 기각

운영 배포본(level9 + `Z_FILTERED` + 64KB chunk)을 기준으로 gzip level만 8로 임시 변경해 로컬 `scripts/dev-server.mjs`/DB의 실제 KR·US 전체 API를 비교했다. 첫 요청과 route recompilation이 일부 샘플에 포함되어 단순 6회 median(KR 539.5ms/US1,006.7ms)은 참고치로만 보고, 같은 서버에서 level9/8을 번갈아 시장별 8회씩 실행한 paired 결과를 판정에 사용했다.

| 시장 | level9 median | level8 median | gzip bytes(level9/8) | raw JSON bytes | 원문 일치 |
|---|---:|---:|---:|---:|---|
| KR | 751.0ms | 776.4ms | 1,178,244 / 1,178,244 | 8,966,992 | SHA-256 동일 |
| US | 1,199.8ms | 1,190.7ms | 2,797,603 / 2,797,603 | 19,359,853 | SHA-256 동일 |

8쌍마다 응답 HTTP200, gzip 해제·JSON parse, 필수 필드·returnedCount·최대20봉을 확인했다. level8은 KR에서 3.4% 느렸고 US의 0.8% 개선은 작은 노이즈 범위라 두 시장 공통 속도 개선으로 판정하지 않는다. gzip 크기도 같아 전송 이득이 없다. RFC1952 XFL은 level9에서2, level8에서0이므로 gzip 형식/압축해제는 유지되지만 기존 XFL2 테스트 단언은 level8 후보에 호환되지 않는다.

판정은 level8 기각, 배포 없음이다. 기능 파일은 배포 HEAD 상태로 되돌렸고 `git diff --check`를 통과했다. 이 로컬 DB 측정은 OCI 운영 속도의 증거가 아니므로 기존 운영 기준(level9 + filtered + chunk64KB)을 유지한다. 더 큰 개선 기회는 API 로그의 DB query·stream timing을 분석해 실제 병목을 식별하는 것이며, 요청당 gzip 코드를 바꾸기 전에 동일 계약으로 대조 검증한다.
## 2026-11-27 — 미국 batch 500→1,000 후보 로컬 실측 및 운영 확인 대기

현재 운영 코드의 batch500은 5,012개 미국 ticker를 11개 query로 분리해 동시성10의 2 wave로 실행한다. 국내 ticker 2,352개는 기존 500 batch로 한 wave다. 미국만 1,000으로 설정하면 6개 query가 한 wave 안에서 끝나며, gzip level9·Z_FILTERED·64KB chunk와 공개 payload 계약은 유지된다.

`npm run dev`가 `.env.local`을 주입하는 같은 로컬 DB에서 전체 GET을 반복했다. Baseline은 KR/US 5회, 후보 KR500/US1000은 각6회이며 첫 compile 호출은 client median에서 제외했다.

| 시장 | 설정 전 median | KR500/US1000 후보 median | gzip bytes | raw JSON bytes | 티커 |
|---|---:|---:|---:|---:|---:|
| KR | 586.0ms | 577.4ms | 1,178,244 | 8,966,992 | 2,352 |
| US | 1,016.6ms | 989.5ms | 2,797,603 | 19,359,853 | 5,012 |

KR 변경은 없으며 1.5% 시간 차이는 노이즈 범위다. US 후보는 2.7% 단축 신호다. 앱 내부 로그 기준 US batch query wall 중앙값은 약379→312ms, query 수 11→6, wave 2→1, totalElapsed 중앙값 약927→876.5ms였다. raw JSON 및 gzip 크기는 그대로다. 모든 비교 응답 HTTP200이었고 gzip 해제, JSON parse, ticker/marketCap/daily 필드, returnedCount, 최대20봉이 확인됐다. 독립적인 이전 1,000 batch 측정에서는 US 5회 median이 949ms였으나 공정한 paired production 비교가 아니므로 방향 참고만 한다.

US 동시 query 수는 10 이하로 유지되며 이 workload에서 6개 chunk가 한 wave다. 큰 요청 parameter가 각 query의 per-query CPU/메모리를 높일 수 있으므로 운영 DB 영향은 아직 확인이 필요하다. 전체 `deploy:verify`를 통과시킨 후 OCI에 후보를 배포하고, 운영 KR/US를 각각 5회 이상 다시 다운로드해 상태 코드·계약·gzip bytes·전체시간·first byte를 기록한다. 운영 US 속도 개선이 재현되지 않거나 DB 부담/응답 지연이 증가하면 batch500으로 되돌려 재검증·재배포한다.

`app/api/public/daily-export/kr/route.test.ts`는 KR500/US1000의 입력 경계를, 미국 5,501 ticker에서 6개 query만 동시에 실행되는 점을 회귀 게이트로 검증한다 (대상 15 tests 통과). 구현과 보고서 변경 파일: `lib/public-daily-export.ts`, 해당 route test, 본 보고서, `DEVELOPMENT_LOG.md`.
### 미국 batch1,000 OCI 운영 배포 후 실측

코드 commit `43145d2e`의 [OCI Deploy run 45895497067](https://github.com/pjtss/StockMan/actions/runs/45895497067)은 Verify deployment, standalone 패키징, release upload 및 Activate release까지 성공했다. 공개 KR/US endpoint를 활성화 뒤 각각 5회 순차 다운로드했다. 전체 10회가 HTTP200, `application/gzip`, `Content-Encoding` 없음, `no-store`, gzip XFL2, gunzip 및 JSON parse를 통과했고 각 항목의 ticker·marketCap·daily, `returnedCount`, 최대20봉 계약을 확인했다.

| 시장 | 전체 완료 시간 | 중앙값 | first-body-byte median | gzip median | raw bytes | ticker |
|---|---|---:|---:|---:|---:|---:|
| KR | 22.651 / 7.363 / 4.229 / 4.193 / 7.739초 | 7.363초 | 0.201초 | 1,219,867B | 8,907,188 | 2,337 |
| US | 49.507 / 53.533 / 57.860 / 42.701 / 47.198초 | 49.507초 | 0.377초 | 2,819,277B | 18,964,448 | 5,011 |

직전 level9+`Z_FILTERED`+64KB 운영 표본 중앙값(KR13.904초/US48.347초, first body byte KR0.273초/US0.814초) 대비 US full download는 약2.4% 길었고 first body byte는 약53.7% 짧았다. 압축 bytes와 raw bytes는 같은 수준이다. 서로 다른 시점의 비통제 서버/네트워크 표본이므로 두 시간 차이를 batch 설정의 인과 효과로 보지 않는다. API 완료시간은 first byte 뒤 수신 시간이 대부분을 차지한다.

판정: 미국 1,000 batch는 DB query를 11개 두 wave에서 6개 한 wave로 줄이고 로컬 내부 DB wall timing 개선을 보였지만, 운영 full-download 이득은 아직 확인되지 않았다. 공개 JSON/gzip 계약 회귀와 오류는 없다. 현 설정을 유지하며 다음 반복 표본에서 US 전체시간과 first byte를 함께 추적한다. 개선 신호가 재현되지 않거나 운영 지연이 반복 상승하면 미국 batch500 복구 변경을 다시 전체 검증·배포한다. KR batch500은 변경하지 않았다.

## 2026-11-27 — 배치 조회의 중복 종목 마스터 조인 제거 후보

배치 조회마다 종목 마스터를 다시 조인하고 보통주/ETF/DR 자격조건을 재평가하는 작업을 제거했다. 첫 universe 조회가 적격 종목의 `market`, `code`, `name`을 이미 확정하므로 이를 각 candle batch의 JSON 입력으로 전달한다. 배치 쿼리는 그 스냅샷과 candle/fundamental 테이블만 조회한다. 국내/미국 자격조건은 첫 쿼리에 그대로 남아 fail-closed 분류 기준을 바꾸지 않으며, 응답 스키마와 gzip(level9 + `Z_FILTERED`, 64KB), batch 크기, 최대20봉은 변경하지 않았다.

동일한 로컬 API/DB에서 워밍된 요청을 비교했다. 기준 버전은 시장별 6회, 후보는 시장별 5회였고 모든 응답을 gunzip/JSON parse 및 ticker·marketCap·daily·최대20봉 계약으로 검증했다.

| 시장 | 기준 전체 GET 시간 | 후보 전체 GET 시간 | 기준/후보 중앙값 | gzip bytes | ticker |
|---|---|---|---:|---:|---:|
| KR | 588 / 591 / 622 / 634 / 649 / 661ms | 568 / 583 / 591 / 640 / 768ms | 634 / 591ms (-6.8%) | 1,178,244 | 2,352 |
| US | 1,069 / 1,100 / 1,111 / 1,162 / 1,183 / 1,248ms | 949 / 983 / 1,101 / 1,109 / 1,158ms | 1,162 / 1,101ms (-5.2%) | 2,797,603 | 5,012 |

측정 중 로컬 DB와 개발 서버 부하를 통제할 수 없고 표본 수도 작아 이 차이는 개선 신호로만 본다. 응답 gzip 크기는 변하지 않았으며 후보 실응답 2회(KR/US)는 HTTP200, 정상 gunzip 및 모든 항목의 ticker/marketCap/daily, 최대20봉을 확인했다. 후보 변경 후 실제 DB 쿼리에서 `u` alias 누락으로 첫 검증 GET이 HTTP500을 반환했다. `r.market`으로 참조를 수정한 뒤 두 시장 실응답과 대상 15개 테스트를 재검증했다. 배포 전에 전체 deploy verification을 수행하고 운영 API를 재측정한다. 운영에서 지연 증가나 잘못된 종목/이름이 발견되면 이 변경을 되돌리고 전체 검증 후 재배포한다.

`app/api/public/daily-export/kr/route.test.ts`는 적격 universe 조회에서 이름을 선택하고 해당 이름을 batch 입력으로 전달하며 batch 쿼리가 universe 테이블에 다시 조인하지 않는 계약을 검사한다. 변경 파일은 `lib/public-daily-export.ts`, 해당 테스트, 본 성능 보고서 및 `DEVELOPMENT_LOG.md`다.


### 중복 universe 조인 제거 배포 후 운영 확인

코드 commit `539361a1`의 [OCI Deploy run 45900026319](https://github.com/pjtss/StockMan/actions/runs/45900026319)는 원격 Verify deployment, standalone 패키징, release 업로드와 Activate release까지 성공했다. 활성화 후 운영 KR/US GET을 각각 5회 순차 호출했다. 10개 응답 모두 HTTP200, `application/gzip`, Content-Encoding 없음, no-store였고 gunzip, JSON parsing, ticker·marketCap·daily, returnedCount 일치, 최대20봉을 통과했다.

| 시장 | 전체 완료 시간 | 중앙값 | first-body-byte 중앙값 | gzip bytes 중앙값 | raw bytes | ticker |
|---|---|---:|---:|---:|---:|---:|
| KR | 18.849 / 12.501 / 6.807 / 4.705 / 3.845초 | 6.807초 | 0.405초 | 1,219,867B | 8,907,188 | 2,337 |
| US | 59.633 / 62.587 / 50.535 / 59.972 / 35.145초 | 59.633초 | 0.377초 | 2,819,256B | 18,964,448 | 5,011 |

직전 운영 표본(동일 batch 설정, 변경 전 코드)은 KR 중앙값7.363초/first byte0.201초, US49.507초/first byte0.377초였다. 이번 완료시간은 KR 약7.6% 짧고 US 약20.5% 길다. raw/gzip 크기는 거의 같고 US first byte 중앙값도 같다. 따라서 US 차이는 전송 구간의 흔들림과 구분되지 않으며, 운영에서 반복 join 제거에 따른 종단간 속도 이득은 확인되지 않았다. 로컬 같은 API/DB A/B는 KR634→591ms, US1,162→1,101ms의 개선 신호였으나 표본이 작고 운영에서 재현되지 않아 인과 효과로 주장하지 않는다. payload 계약 오류는 없었다.

판정: 변경은 활성 상태로 유지하되 운영 속도 효과는 미확정이다. 이후 각 운영 측정에서 TTFB와 전체 다운로드를 분리해서 계속 추적한다. DB 단계 timing이나 여러 배포에 걸친 일관된 개선이 없으면 이 변경을 되돌리는 A/B 배포를 검토한다. 이번 결과의 최종 로그는 `DEVELOPMENT_LOG.md`에 기록했다.


## 2026-11-27 — request key 입력 및 batch 정렬 후보 기각

실제 API/DB의 반복 병목을 줄일 수 있는 두 후보를 jsonb_to_recordset 기반 현재 배포본과 비교했다. 모두 KR2,352/US5,012 ticker의 전체 gzip API 응답을 받아 gunzip·JSON parse·ticker/marketCap/daily 필드·최대20봉을 확인했다. 첫 warm-up 요청은 중앙값에서 제외했고 시장별로 각7개 값을 기록했다.

### JSONB request set을 PostgreSQL 배열 unnest로 대체 — 기각

각 batch에서 JSON.stringify한 object 배열을 보내는 대신 market/code/name 배열 세 개를 파라미터로 전달했다. 대상 route test 15/15가 통과했고 gzip 크기는 기준과 동일(KR1,178,244B/US2,797,603B)이었다. 그러나 실제 local API 중앙값은 KR629→644ms(+2.4%), US1,103→1,533ms(+39.0%)로 느려졌다. SQL parameter 처리나 계획 비용 가운데 원인이 무엇인지는 분리 계측하지 않아 추정하지 않는다. 이 후보는 폐기했고 파일을 배포 HEAD로 복구했으며 운영 배포하지 않았다.

### 문자열 market/code 정렬을 WITH ORDINALITY 순서로 대체 — 기각

이미 정렬된 universe 입력의 batch별 순서를 ordinal로 전달해 텍스트 키 정렬을 줄이는 후보였다. 첫 실제 DB 요청은 WITH ORDINALITY에 column-definition-list를 직접 결합해 SQL 42601, 다음 시도는 CTE에서 ordinal을 전달하지 않아 42703으로 실패했다. ROWS FROM(...) WITH ORDINALITY와 CTE column을 바로잡은 뒤 KR/US API GET이 HTTP200 및 전체 payload 계약 검증을 통과했고 route test 15/15도 통과했다. 오류는 후보 SQL을 실제 DB에 실행하면서 발견·수정했으며 잘못된 시도는 성능 표본에서 제외했다.

| 시장 | 기존 market/code 정렬 7회 | ordinal 후보 7회 | 중앙값 변화 | gzip bytes |
|---|---|---|---:|---:|
| KR | 621 / 692 / 671 / 644 / 618 / 617 / 719ms | 671 / 728 / 624 / 842 / 681 / 843 / 739ms | 644→728ms (+13.0%) | 1,178,244, 불변 |
| US | 1,185 / 1,190 / 1,159 / 1,415 / 1,184 / 1,104 / 1,202ms | 1,334 / 1,155 / 1,223 / 1,230 / 1,267 / 1,195 / 1,173ms | 1,185→1,223ms (+3.2%) | 2,797,603, 불변 |

두 후보 모두 로컬 실제 API에서 이득이 없거나 명확한 회귀를 보여 배포하지 않았다. 현재 코드와 회귀 테스트는 배포된 market/code 정렬 및 JSONB 입력으로 복구했다. 이후 SQL 변경은 mock route test 외에 실제 DB API GET을 먼저 실행해 쿼리 문법·alias·필드 누락을 잡고, 전체 응답 중앙값이 양 시장에서 나아지는 경우에만 운영 후보로 삼는다. 이 실험 결과와 미배포 상태를 DEVELOPMENT_LOG.md에 기록했다.


## 2026-11-27 — gzip windowBits 15→14 속도 후보

Node.js v24.14.0 local API/DB에서 gzip level9, Z_FILTERED, output chunk64KB를 유지하고 deflate windowBits만 기본15에서14로 바꿨다. 공식 [Node.js v24 zlib 문서](https://nodejs.org/download/release/v24.20.0/docs/api/zlib.html#memory-usage-tuning)는 압축 메모리의 windowBits 항이 2의 거듭제곱으로 변하며 작은 window가 일반적으로 압축률을 떨어뜨릴 수 있다고 설명한다. 운영 workflow의 production runtime은 Node22이므로 동일 효과는 OCI 배포 후 검증 전까지 미확정이다.

같은 DB/Next.js API에서 순서를 바꾼 두 비교 block을 실행했다. 각 block/market/version 10회 중 첫 warm-up을 제외해 9개 전체 응답을 측정했다. 모두 HTTP200, gzip XFL2, gunzip/JSON, ticker·marketCap·daily 및 최대20봉을 통과했다. 기준과 후보의 decompress된 raw JSON은 시장별 SHA-256이 같았다.

| 비교 순서 | 시장 | 기준 windowBits15 median | 후보 windowBits14 median | 변화 | gzip bytes 기준→후보 |
|---|---|---:|---:|---:|---:|
| 기준→후보 | KR | 638ms | 450ms | -29.5% | 1,178,244→1,171,044 (-0.61%) |
| 기준→후보 | US | 1,127ms | 910ms | -19.3% | 2,797,603→2,807,759 (+0.36%) |
| 후보→기준 | KR | 609ms | 448ms | -26.4% | 1,178,244→1,171,044 (-0.61%) |
| 후보→기준 | US | 1,081ms | 926ms | -14.3% | 2,797,603→2,807,759 (+0.36%) |

candidate full API median이 양쪽 순서에서 줄고 DB query wall은 비슷했으며 gzip payload 크기 변화는 KR 감소/US +0.36%였다. local signal은 일관되나 개발 서버와 production Node 버전/하드웨어가 다르다. windowBits14를 OCI 운영 후보로 배포하고 동일 public GET을 시장별 최소5회 실행해 전체완료시간·first byte·gzip bytes·gzip 해제 계약을 확인한다. 운영에서 속도 이득이 사라지거나 US 전송 지연이 늘면 기본15로 원복하고 재검증·재배포한다. 현재 candidate 변경은 lib/public-daily-export.ts 한 파일이며 아직 커밋·배포하지 않았다.


### windowBits14 OCI 운영 배포 후 확인

코드 commit 8c220dcd의 [OCI Deploy run 45905604148](https://github.com/pjtss/StockMan/actions/runs/45905604148)은 원격 verify, standalone 패키징, release 업로드와 활성화까지 성공했다. Node22 운영 runtime에서 활성화 후 KR/US 공개 API를 각각 5회 순차 호출했다. 10회 모두 HTTP200, application/gzip, Content-Encoding 없음, no-store, XFL2이며 전체 gzip 해제와 JSON 필드·returnedCount·max20 검사를 통과했다. 원본 bytes와 ticker 수는 기존과 동일했다.

| 시장 | 전체 완료 시간 | 중앙값 | first-body-byte 중앙값 | gzip bytes 중앙값 | raw bytes | ticker |
|---|---|---:|---:|---:|---:|---:|
| KR | 22.570 / 18.050 / 6.085 / 3.847 / 3.559초 | 6.085초 | 0.242초 | 1,212,074B | 8,907,188 | 2,337 |
| US | 49.896 / 45.863 / 57.260 / 43.422 / 52.223초 | 49.896초 | 0.385초 | 2,816,126B | 18,964,448 | 5,011 |

직전 windowBits15 운영 표본 median(KR6.807초/US59.633초, first byte0.405/0.377초, gzip1,219,867/2,819,256B)과 단순 비교하면 완료시간은 KR10.6%, US16.3% 짧았고 gzip bytes는 KR0.64%, US0.11% 감소했다. US first-byte 중앙값은 사실상 동일했다. 각 표본 5회, 운영부하·전송률 비통제이므로 개선율은 관측치이지 통제된 인과 추정은 아니다. 그래도 양 시장 로컬 A/B와 운영 median이 같은 방향이고 계약 회귀가 없어 windowBits14를 유지한다. 향후 운영 표본에서 미국의 반복 지연 또는 payload 팽창이 관측되면 windowBits15 복원 A/B를 실행한다.
