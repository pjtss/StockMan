# 미국 보통주 시가총액별 KIS 업종 코드 커버리지

- 기준일: 2026-10-25 (KST)
- 목적·범위: 운영 활성 `COMMON_STOCK` 전체를 KIS 최신 미국 마스터의 `icod`와 운영 시가총액 읽기 전용 API로 교차 대조해 구간별 업종 코드 수를 집계했다.
- 종목 마스터: KIS 공식 NAS/NYS/AMS 마스터 파일. 서버의 `Last-Modified`는 2026-10-24 09:55:15 UTC이며, 프로젝트 파서로 보통주 후보 5,358개를 구성했다. 파일별 체크섬은 결과 JSON에 기록했다.
- 운영 유니버스 검증: 배포본 관리자 `/api/admin/us-industry-codes?mode=audit`에서 `READ_ONLY_KIS_UNIVERSE_AUDIT`, KIS 후보 및 활성 보통주 각각 5,358개, 차이 0건, `databaseWritePerformed=false`를 확인했다. 운영 DB 직접 조회/수정은 없었다.
- 시총: 운영 `GET /api/public/instrument-fundamentals`를 100종목 단위로 조회했다. 유효 USD 시총은 5,048개이며 관측 시각은 2026-10-24 18:49:41Z~19:11:28Z (2026-10-25 03:49~04:11 KST)이다. 나머지 310개는 스냅샷이 없거나 유효한 USD 시총이 없어 시총 구간 계산에서 제외했다. 시총 미확인 사유로 API에 없던 티커는 DAVI(NAS), IIPR/B(NYS) 두 종목이었다.
- 코드 판정: KIS `icod`가 1~4자리 숫자이고 `000`이 아닐 때 분류 코드 보유로 계산했다. `000`은 KIS 공식 미분류로 별도 기록했다. 이 자료는 서로 다른 ICOD 값의 종류 수가 아니라, 각 시총 구간에서 코드가 존재하는 종목 수다.

## 누적 기준

| 시총 구간 | 시총 확인 종목 | 코드 보유 | 공식 `000` 미분류 | 코드 보유율 |
|---|---:|---:|---:|---:|
| $1T 이상 | 11 | 10 | 1 | 90.91% |
| $100M 이상 | 3,733 | 2,164 | 1,569 | 57.97% |
| $10M 이상 | 4,591 | 2,420 | 2,171 | 52.71% |
| $10M 이하 | 457 | 76 | 381 | 16.63% |

## 서로 겹치지 않는 구간

| 시총 구간 | 시총 확인 종목 | 코드 보유 | 공식 `000` 미분류 | 코드 보유율 |
|---|---:|---:|---:|---:|
| $1T 이상 | 11 | 10 | 1 | 90.91% |
| $100M 이상 ~ $1T 미만 | 3,722 | 2,154 | 1,568 | 57.87% |
| $10M 이상 ~ $100M 미만 | 858 | 256 | 602 | 29.84% |
| $10M 이하 | 457 | 76 | 381 | 16.63% |

## 확인 파일 및 제한

- 집계 원자료·조회시각·시장별 감사 요약: [`../../scratch/us-marketcap-industry-coverage-20261025.json`](../../scratch/us-marketcap-industry-coverage-20261025.json)
- 누적 $1T 이상 종목은 전체 유니버스 재조회 기준 11개다. 10개는 ICOD를 보유하고 1개(SPCX)는 `000`이다.
- 시총 스냅샷이 없어 제외된 2개는 `DAVI`(NAS), `IIPR/B`(NYS)다. 나머지 308개는 API 응답에 유효한 USD 시총이 없었지만, 코드별 추가 원인은 별도 미확인이다.
- KIS 마스터는 5,358개 운영 활성 종목과 완전 일치했다. 마스터의 전체 코드 후보 행 중 보통주가 아닌 상품은 분모에 넣지 않았다.
- 커밋·푸시·배포는 수행하지 않았다.

## 공식 출처

- [KIS Developers 종목 정보 파일](https://apiportal.koreainvestment.com/apiservice-category) — 종목 정보 파일에서 공식 마스터 파일을 내려받는다.
- KIS 마스터의 `icod`를 직접 사용하는 것이 전체 미국 보통주 커버리지 확인에 적합하다. 마스터에서 `stis=2`, DR 여부와 ETP/파생 상품 필드를 확인해 보통주만 남기고 `icod`를 읽는다. 공식 헤더 정의는 [프로젝트 마스터 필드 기준](../references/kis-instrument-masters/header-definitions.md)에 기록돼 있다.
- 대안으로 KIS Developers의 해외주식 **주식기본조회** API를 종목별 호출해 산업 코드와 분류명을 조회할 수 있다. KIS Developers 포털의 [해외주식 API 목록](https://apiportal.koreainvestment.com/apiservice-category)에서 공식 TR ID·입출력 필드 및 호출 한도를 확인해야 하며, 전체 종목에는 종목 마스터와 API 결과를 `(시장, 티커)`로 결합하고 오류·미분류를 분리해 집계한다.
- 운영 반영은 활성 COMMON_STOCK을 대상으로 배포본에 존재하는 `/api/admin/us-industry-codes` 관리자 경로를 사용한다. 먼저 `?mode=audit` 읽기 전용 검증을 수행하고, KIS 코드가 프로젝트의 유효성 기준과 일치할 때만 POST 동기화 경로로 저장한다. 이 경로는 현재 작업 중인 체크아웃에는 없으며 별도 릴리스 워크트리에서 확인했다. 이번 작업에서는 저장 POST를 호출하지 않았다. 읽기 전용 운영 감사는 KIS 후보 5,358개와 운영 활성 유니버스 5,358개가 일치함을 확인했다.
- 2026-10-28 실행에서 KIS 마스터 원본 필드 인덱스가 파서와 어긋난 것을 확인했다. `icod`는 필드 19, `isdr`는 필드 17이며 파서를 정정한 뒤 로컬 DB에 저장했다.
- 프로젝트 마스터 필드 기준: [`../references/kis-instrument-masters/header-definitions.md`](../references/kis-instrument-masters/header-definitions.md)

## 2026-10-28 로컬 저장 및 미국 일봉 동기화

- 공식 KIS NAS/NYS/AMS 마스터(원본 파일 기준 2026-10-27)를 내려받아 보통주 전체를 다시 판정했다. 현재 활성 `COMMON_STOCK`은 AMS 256, NAS 3,235, NYS 1,865로 총 5,356개다. 마스터의 `icod` 코드를 활성 보통주 5,356개 모두 `us_common_stock_universe.industry_code`에 저장했다. `000`은 빈 값이 아니라 KIS 공식 미분류 코드이며 2,724개다.
- 기존 파서가 `industryCode=f[23]`, `isDr=f[20]`을 읽던 오류를 수정해 `icod=f[19]`, `isdr=f[17]`로 맞췄다. 분류 시 `stis=2`인 주식만 보통주 후보로 허용하고 나머지는 fail-closed로 특수 상품 처리한다. 현재 마스터 전체 12,887개 원본 행을 재분류하고 stale·비보통주를 비활성화했으며, 공식 보통주 기대 집합과 로컬 집합이 정확히 일치함을 확인했다.
- 운영 관리자 일봉 갱신 API는 관리자 세션으로 시작했고, 읽기 전용 진행 확인 당시 5,157종목 처리·봉 저장 13,836·실패 0을 반환했다. 앞서 운영 public cache API에서 전체 최신일 2026-10-27, 최종 수집 2026-10-28 07:40 KST를 확인했다. 관리자 세션 만료 뒤 작업 종료 상태는 다시 확인하지 못했다.
- 운영 public API에서 로컬 PostgreSQL(`localhost`)로 활성 공식 보통주 전체 일봉을 동기화했다. 첫 실행은 5,356종목, 577,221개 봉 저장까지 완료했으나 운영 bulk 요청 timeout/캐시 미제공으로 failed 109를 반환했다. 이후 `20261027` 봉이 원본 일봉 테이블에 없는 561종목을 지정일 동기화해 454개를 추가 저장했다. DB의 원본 일봉 테이블에 2026-10-27 봉이 있는 종목은 AMS 249, NAS 3,192, NYS 1,808로 총 5,249/5,356이다. 지정일 chart fallback은 107종목에서 chart 이력 10,806개를 추가 UPSERT했지만 운영 API가 제공한 최신 날짜가 목표일 이전이어서 2026-10-27 커버리지는 변하지 않았다. 현재 종목별 마지막 원본 봉은 5,249종목이 2026-10-27, 4종목이 2026-10-26, 97종목이 그 이전, 6종목은 봉 없음이다. 나머지 107종목의 목표일 봉은 운영 bulk API에서 없었고 chart는 과거 마지막 거래일까지의 이력만 제공(101종목), 6종목은 HTTP 422로 반환했다. `us_latest_daily_candles`는 기존 정책상 무거래 봉을 건너뛰므로 최신 요약행 5,198개와 원본 2026-10-27 행 5,249개가 다르다(해당 일자 거래량 0인 행 51개). 원본 거래가 없거나 운영 API 장애인 종목은 추정값으로 채우지 않았다.
- 운영 fundamentals API 스냅샷을 로컬 `instrument_fundamental_snapshots`에 저장했다. 최종 USD 양수 시총 커버리지는 AMS 254/256, NAS 3,232/3,235, NYS 1,863/1,865로 총 5,349/5,356이다. 미제공 티커는 AMS `GUNN`, `PTIV`, NAS `AETR`, `APXC`, `FCDH`, NYS `MSGK`, `MSGR`다. 누락/null API 응답이 기존 유효 시총을 덮어쓰지 않게 적재 UPSERT를 보강했다.
- `daily_active`를 동기화된 최신 봉에 따라 기존 7일 기준으로 재계산했다. 121개 행의 상태가 변경됐다.
- 재발 감지: 전체 sync 후 활성 공식 보통주 5,356개를 분모로 시장별 `MAX(us_latest_daily_candles.candle_date)`와 동일 날짜 커버리지, 7일 초과 지연/무봉, USD 양수 시총, 분류코드 비어 있음과 `000`을 구분해 점검한다. 운영 502 뒤 재호출을 반복하지 않고 서비스 복구 뒤 `--only-unrefreshed=true --include-inactive-daily=true`로 누락 종목을 재조회한다.
- 남은 위험/다음 개선: 원본 일봉에서 107개 종목의 2026-10-27 행이 확인되지 않았고 7개 티커 시총은 출처에서 제공되지 않았다. 운영 API 정상화 및 관리자 작업 종료 확인 후 해당 코드만 재검증·동기화한다. KIS `000`은 유효하게 저장된 공식 미분류 값이므로 의미를 추정하지 않는다.
- 2026-10-28 후속 재개: 운영 관리자 갱신 작업을 새로 접수했으나 조회 초기에 `PROCESSING`과 진행률 없음만 반환했다. 운영 캐시 최신 수집시각은 12:00:45 KST에서 바뀌지 않았고, 이후 해당 작업 ID는 `404 job not found`를 반환해 완료·종료 상태와 최종 결과를 확인하지 못했다. 그 뒤 지정일 fallback 재시도에서 chart 이력 10,806개를 저장했으며 bulk/chart 응답의 최신 거래일이 목표일보다 이전인 종목 101개와 chart HTTP 422 종목 6개를 확인했다. 저장된 이력은 최신 가능 데이터를 반영했지만, 운영 응답에 2026-10-27 봉이 없는 107종목의 날짜 커버리지는 미완료다.
- 범위 파일: `lib/instrument-universe-import.ts`, `lib/daily-candle-fallback.mjs`, `scripts/sync-daily-cache-async.mjs`, `scripts/README.md`, `docs/references/kis-instrument-masters/header-definitions.md`, 이 문서, `DEVELOPMENT_LOG.md`.
- 검증: 공식 마스터 12,887행 파싱 및 분류 preview, 활성 보통주 집합·시장별 수·산업 코드 저장 커버리지, 로컬 DB 봉/시총 커버리지 SQL, 단일 종목 chart API 200을 확인했다. 전체 sync는 577,221개 저장/109 실패, 지정일 재조회는 454개 추가 저장, chart 이력 재시도는 10,806개 추가 UPSERT 후 목표일 누락 107개를 기록했다(실데이터 없음/미제공 101, chart HTTP 422 6). `node --check`와 `git diff --check`를 통과했다. 빌드·테스트는 실행하지 않았다. 커밋·푸시·배포는 하지 않았다.


## 2026-10-28 후속 검증 및 최종 상태

- KIS 마스터의 약어형 채무증권/우선주(`PRF`, `OBLIG`, `NTS DUE`, `SUBORD DEB` 등)를 추가 분류해 확인된 36개를 보통주 유니버스에서 비활성화하고 특수상품 유니버스로 옮겼다. 거래 데이터는 기존 기록 보존을 위해 삭제하지 않았다.
- 로컬 DB 최종 활성 보통주 분모는 5,320개(AMS 256, NAS 3,233, NYS 1,831)다. 산업 코드는 5,320개 모두 저장됐고, 원본 일봉 테이블의 2026-10-27 행도 5,320개 전부 확인했다.
- 양수 USD 시총은 5,313개이며 7개 티커는 최신 운영 fundamentals 응답에 유효 값이 없다: GUNN, PTIV, AETR, APXC, FCDH, MSGK, MSGR. 해당 값은 추정하지 않았다.
- 운영 직접 KIS 일봉 경로는 market-flow 조회 snapshot을 운영 `kis_signal_snapshots`에 기록할 수 있다. 감사 시점까지 DB에 확인된 성공 결과를 로컬 일봉 테이블에 저장했다.
- 재발 감지: 공식 마스터 import 이후 `scripts/reconcile-us-universe.ts` preview/apply/post-audit를 수행하고 활성 보통주의 미지원 상품명, 목표 거래일 캔들, 비어 있는 industry code, USD 양수 시총 커버리지를 시장별로 재집계한다.
- 검증: guarded reconciliation 통과, 시장별 로컬 PostgreSQL 집계 확인, `node --check scripts/sync-daily-cache-async.mjs` 및 대상 변경 파일 `git diff --check` 통과. 테스트·빌드는 요청이 없어 실행하지 않았으며 커밋·푸시·배포 없음.
