# 미국 보통주 OBV 강세 다이버전스 API

> 상태: OCI 배포 완료 · 검증/운영 상태는 아래 변경 기록 참조 · 설계 버전: 1.2 · 갱신일: 2026-10-29
>
> Downloads의 README와 Python 엔진/refresh 스크립트를 프로젝트 기준에 맞춰 통합했다. `stockman-readonly-api.env`의 값은 저장하거나 출력하지 않는다. 운영 배포는 성공했으나 최초 cron snapshot과 migration 버전 직접 확인은 남아 있다.

## 목적

미국 활성 보통주의 완료 일봉으로 v4 OBV 강세 다이버전스를 계산하고, 기존 프로젝트의 무인증 공개 GET 경로로 최신 결과를 제공한다. 공개 요청에서 전체 계산을 하지 않으며, cron 갱신과 조회를 분리한다.

## 프로젝트 구조에 맞춘 아키텍처

```text
KIS 공식 마스터의 us_common_stock_universe
        +
us_instrument_universe_candles (완료 일봉)
        ↓
POST /api/cron/us-obv-divergence-snapshot (CRON_SECRET)
        ↓
lib/us-obv-divergence.ts 계산·판정
        ↓ coverage / 모집단 / 동시 실행 검증
us_obv_divergence_snapshot (Flyway V162, JSONB)
        ↓
GET /api/scan/us-obv-divergence (무인증, 읽기만)
```

- 유니버스 기준은 Nasdaq 종목명 정규식이 아니라 프로젝트의 공식 `us_common_stock_universe`다. `enabled=true`, `daily_active=true`, `instrument_type=COMMON_STOCK`, ETF·워런트·파생·DR·레버리지·인버스 플래그 false인 NAS/NYS/AMS만 사용한다. 마스터가 없거나 DB 조회가 실패하면 갱신을 거부한다.
- 시장 데이터는 이미 저장된 StockMan 일봉에서 읽는다. 외부 GET, Bearer 자격증명, Nasdaq directory 다운로드는 갱신 경로에도 사용하지 않는다.
- Worker 결과는 한 행의 DB JSONB 스냅샷이다. Advisory transaction lock으로 중복 실행을 막고, 검사 실패 시 트랜잭션 rollback으로 이전 스냅샷을 보존한다. 공유 파일시스템을 가정하지 않는다.
- 갱신 cron은 기존 OCI 파이프라인의 미국 일봉 캐시 처리 뒤에 ET 평일 18:10 이후 호출한다. 일봉 갱신 소요시간 때문에 특정 분 슬롯을 놓치지 않도록, 5분 주기 cron이 18:10 이후 요청을 재시도하고 API 실행기록의 30분 간격 제한으로 실제 계산 빈도를 제한한다. 저장된 실제 최신 거래일이 현재 스냅샷과 같으면 반복 계산하지 않는다. PARTIAL은 30분 cooldown 이후 재검사한다.
- `V162` migration이 대상 DB에 적용되기 전에는 공개 GET은 snapshot 조회 실패로 503을, cron POST는 내부 오류로 502를 반환한다. 로컬의 read-only 감사는 history에 없는 migration 58개와 V85/V89 구조 preflight 실패를 보고했지만, OCI 배포 runner는 `outOfOrder`를 켜지 않고 `*:ignored`로 이전 버전의 Ignored 상태를 validate에서 제외한 뒤 최신 V162를 migrate한다. Flyway 공식 설명상 이 패턴은 validate/repair의 Ignored 상태를 대상으로 하며 이전 누락 migration을 실행시키지 않는다. 배포 후 운영 `/api/health`에서 적용 버전을 확인한다.

## 계산 계약

첨부 `stockman_obv_divergence_v4.py`의 `Config`와 `evaluate` 규칙을 TypeScript `lib/us-obv-divergence.ts`로 옮긴다. API 응답의 `algoVersion`은 `4.0.0`이며 변경 시 승인된 알고리즘 버전 관리가 필요하다.

- 일봉만 사용한다. 마지막 160봉까지 읽고, 최소 80봉, 최신봉 최대 5일 지연, 최근 20봉의 달력 간격 최대 45일을 요구한다.
- 최근 20봉 가격 하락과 OBV 상승이 모두 있어야 한다. OBV는 상승 종가일 거래량 가산, 하락 종가일 감산, 보합일 유지다.
- TREND: 가격 20봉 변화율 ≤ -2%, 정규화 OBV ≥ +1배, 가격 회귀 기울기 음수, OBV 기울기 양수, OBV 상승일 3일 이상, 양(+) 기여도 중 최대 하루 비중 ≤ 60%.
- PIVOT: 좌우 3봉과 3% prominence로 확정된 가격 저점 중 가장 최근 두 개만 비교한다. 간격 7~45봉, 최신 저점 최근 12봉 이내, 가격 저점 ≥1% 하락, OBV와 국지 OBV 저점 상승 각각 평균 거래량의 0.5배 이상. 조건 실패 때 더 오래된 유리한 쌍으로 대체하지 않는다.
- 유동성: 20봉 평균 거래대금 ≥ $100,000, 5봉 ≥ $50,000, 최근/기준 평균 거래량 ≥0.25. 하루 종가 변동 65% 초과, OHLCV 오류, 날짜 충돌은 제외한다.
- 거래대금 집중, OBV 상승일 부족, 약한 최근 거래량, 최근 OBV 반전은 REVIEW 경고다. 매매 적격성은 WATCH_ONLY 고정이며 기업행위 보정 여부는 검증되지 않음으로 표시한다.

## 유니버스·coverage 게시 가드

- 공식 활성 보통주 1,500개 미만이면 갱신을 거부한다.
- 최소 70%를 실제 평가해야 새 스냅샷을 게시한다. 가격/OBV 조건 미충족, 유동성 미충족, 거래량 정지, 기업행위 의심은 데이터가 있어 평가한 것으로 계산한다. 이력 부족, 오래된/성긴/잘못된 OHLCV, 충돌은 coverage에 포함하지 않는다.
- coverage ≥70%이지만 일부 미평가가 있으면 `scanStatus=PARTIAL`로 제공한다. threshold는 트레이딩 성능 기준이 아니라 운영 게시 가드다.
- 임계값 1,500 및 70%는 첨부 제안 기본값을 계승했으며 장기 운영 통계로 아직 검증되지 않았다. 재검토 과제다.

## 외부 GET 계약

`GET /api/scan/us-obv-divergence`

| Query | 기본값 / 허용값 |
|---|---|
| `page` | 1, 정수 1~100000 |
| `pageSize` | 50, 정수 1~100 |
| `signalType` | ALL, BOTH, PIVOT, TREND |
| `quality` | ALL, HIGH, STANDARD, REVIEW |
| `sort` | priority, liquidity, obv, priceDrop |
| `minDollarVolume20d` | 0 이상 숫자 |

필터와 정렬은 계산 결과 표시만 바꾼다. 성공 응답에는 기준 거래일, 생성 시각, 버전, 시장/유니버스/coverage, 파라미터, 경고, 페이지 정보, 후보가 포함된다. 모든 item은 종목명·티커·거래소, 최신 봉 및 계산 결과를 제공하며, 실제 계산에 사용한 각 봉의 `candleDate`와 `dataUpdatedAtUtc`를 `candleMetadata` 배열에 포함한다.

- 400 `INVALID_QUERY`: 범위 밖 입력 또는 허용되지 않은 enum.
- 503 `SNAPSHOT_NOT_READY`, `STALE_SNAPSHOT`, `INVALID_SNAPSHOT`, `SNAPSHOT_UNAVAILABLE`: 준비되지 않았거나 120시간보다 오래됐거나 손상된 스냅샷/DB.
- 모든 응답 `cache-control: no-store`. 공개 route는 DB snapshot select 한 번만 수행하며 수집·계산·쓰기 부수효과가 없다.

## 구현 파일

- `lib/us-obv-divergence.ts`: 순수 정규화·OBV·TREND/PIVOT 평가.
- `lib/us-obv-divergence-snapshot.ts`: ET schedule guard, official universe/candle query, coverage, advisory lock, atomic DB upsert.
- `app/api/cron/us-obv-divergence-snapshot/route.ts`: cron secret으로 보호된 내부 실행.
- `app/api/scan/us-obv-divergence/route.ts`: 공개 GET.
- `db/migration/V162__us_obv_divergence_snapshot.sql`, `lib/schema.ts`, `lib/schema-health.ts`: 스냅샷 저장 구조와 운영 DB 진단.
- `scripts/oci-cron.sh`: US daily cache 직후 refresh 호출.
- `scripts/api-surface.mjs`, `docs/api/route-inventory.json`, `public/openapi.json`, `public/api-reference.md`: 공개 route 계약.
- 테스트: `lib/us-obv-divergence.test.ts`, `lib/us-obv-divergence-snapshot.test.ts`, `app/api/scan/us-obv-divergence/route.test.ts`.

## 미해결 위험 및 다음 개선

- v4 알고리즘의 테스트 케이스는 첨부 Python 테스트 묶음에 언급됐지만 사용자 파일 목록에는 포함되지 않았다. 현재 TypeScript 회귀 테스트로 핵심 신호·경계값을 직접 검증하고 수식 차이가 없는지 검토해야 한다.
- 1,500 최소 모집단과 70% coverage threshold는 실제 미국 유니버스·캔들 통계를 기준으로 조정할 과제다.
- KIS 일봉의 split/dividend adjustment 보장은 이 작업으로 확인되지 않았다. 결과는 WATCH_ONLY를 유지한다.
- 2026-10-29 OCI 배포 run `40834281299` 성공. 운영 `GET /api/health`는 200 `status=ok`; 공개 OBV GET은 무인증 HTTP 503 `SNAPSHOT_NOT_READY`였다. 첫 미국장 cron 전의 상태라 snapshot 생성 및 최신성은 다음 장후에 확인한다. health 응답에 migration version이 없어 V162 적용 버전은 직접 확인하지 못했다.
- 로컬 DB audit 외에 데이터베이스를 직접 변경하지 않았다. 배포 후 운영 조회는 read-only GET으로 제한했다.

## 공식 근거

- [KIS Developers](https://apiportal.koreainvestment.com/)와 프로젝트의 [`공식 종목 유니버스 설계`](./instrument-universe-sync.md): 유니버스·일봉의 프로젝트 원천 기준.
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers): App Router HTTP 경로 규칙.
- [Flyway ignoreMigrationPatterns](https://documentation.red-gate.com/fd/flyway-ignore-migration-patterns-setting-277579002.html): 배포 runner의 `*:ignored` 검증 범위.
- [Fidelity OBV 정의](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/obv): 가격 상승/하락/보합일 OBV 계산 정의.
- [`외부 API 문서 구조`](../api/README.md), [`OpenAPI 생성·감사`](../../../scripts/api-surface.mjs), [`스키마·일봉 구조`](./database-schema.md).
