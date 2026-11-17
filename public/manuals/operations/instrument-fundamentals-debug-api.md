# 종목 기본정보·시가총액 자동화 디버깅 API

종목 상장주수의 단일 출처 및 응답 필드는 [상장주수 출처 정책](../architecture/listed-shares-source-policy.md)을 따른다.

## 목적

관리자 세션으로 종목 기본정보(가격·거래량·거래대금·시가총액·상장주수) 자동화의 설정, 실행 이력, 실패 원인, 활성 종목 대비 최신 시총 스냅샷 범위를 한 번에 확인한다. 조회 전용이며 자동화를 실행하거나 데이터를 갱신하지 않는다. 국내 상장주수는 KIS `inquire-price`의 `output.lstn_stcn`, 해외 상장주수는 KIS `price-detail`의 `output.shar`에서 취득해 `instrument_fundamental_history.listed_shares`와 `instrument_fundamental_snapshots.listed_shares`에 저장한다. OCI cron 자동 갱신 간격은 24시간으로 고정되어 있다.

## 호출

```text
GET /api/admin/instrument-fundamentals-debug?limit=20&staleAfterHours=72
```

- 관리자 세션 필수. 인증 실패는 `401 UNAUTHORIZED`.
- `limit`: 최근 실행 이력 및 실패 상세 수, 1~50, 기본 20.
- `staleAfterHours`: 최신 스냅샷 신선도 기준, 1~720시간, 기본 72시간. 시장 휴장·주말 고려가 필요한 지표이므로 자동화 주기인 24시간과 별개로 조정한다.
- DB/스키마 장애는 상세 연결정보를 감춘 `503 INSTRUMENT_FUNDAMENTALS_DEBUG_UNAVAILABLE`.

## 응답에서 확인할 항목

- `feature`: 활성화, 실행 시간대, 요일, 최소 실행 간격, 현재 시각 기준 schedule 진입 여부.
- `execution.latestRun`: 최근 조회 `limit`과 관계없이 DB에서 직접 찾은 마지막 실제 실행(건너뜀 제외)의 저장 상태·summary 기반 진단 상태·시각·소요시간·instrument별 실패 상세. 스케줄 skip 기록이 많아도 실제 실행을 놓치지 않으며, 저장 상태와 결과 카운터가 불일치하면 `statusMismatch=true`로 표시한다. 기존 summary의 실패 표본은 `itemsSource=summary_failure_samples`로 복원해 보여준다. 상세 테이블 조회 실패는 `itemsWarning=DEBUG_RUN_ITEMS_TABLE_UNAVAILABLE`로 확인한다.
- `execution.latestObservedRun`: 마지막 실행 또는 스케줄 skip 기록.
- `execution.totals`, `skipReasons`, `failureCategories`, `failures`: 기간 누적 상태, 비활성/시간대/간격 skip 및 실패 원인. 최근 summary의 실패 카운터로 재판정한 PARTIAL/FAILED 실행도 저장 상태와 달라도 `failures`에 포함한다.
- `execution.intervalStatus`, `overdueSeconds`: 마지막 실제 실행 이후 설정된 최소 간격을 초과했는지, 현재 RUNNING/OVERDUE/정상 간격 상태인지 확인한다. 이는 스케줄러 프로세스 자체의 생존 확인이 아니라, 저장된 마지막 이력과 설정의 비교다.
- `snapshotCoverage.byMarket`: 활성 국내·해외 보통주 수, 스냅샷 존재 수, 누락 수, 시총 NULL/0 이하 수, 기준시간 내 갱신 수, 마지막 갱신시각, KRW/USD 외 통화 수.
- `staleOrMissingCount`는 활성 유니버스 수에서 신선 스냅샷 수를 뺀 값이며 누락과 오래된 스냅샷을 합친 관측치다. 주말·휴장일에는 기준시간을 늘려 확인한다.

## 일반 자동화 디버그와의 관계

일반 실행 로그는 `GET /api/debug/automation-runs?module=instrument-fundamentals`에서도 조회할 수 있다. 이 전용 API는 그 이력에 현재 관리자 설정과 DB 스냅샷 커버리지를 결합한다. 전용 API는 cron secret 단독 접근을 지원하지 않고 관리자 세션만 허용한다.

자동화 summary의 `markets`별 소규모 aggregate는 compaction 시 전체 보존한다. 배열형 상세 실패 표본은 기존 제한을 유지하며 실제 종목별 실패 상세는 `debug_run_items`에서 조회한다. 기존 과거 summary가 compaction 과정에서 잘린 market 배열을 소급 복구할 수는 없다.

## 검증

- 회귀 테스트: 인증 요구, 설정/실행/커버리지 응답, skip 기록이 많은 경우에도 실제 최신 실행 조회, 저장 상태와 실패 카운터 불일치 및 overdue 감지, summary 실패 표본 복원, 조회 범위, DB 오류 비노출, 시장 집계 전체 보존.
- 운영 DB 실행 결과를 증명하려면 배포 후 관리자 세션으로 이 API를 호출한다. 로컬 테스트 결과는 운영 데이터 상태의 증거가 아니다.
- 상세 이력 테이블이 아직 배포 DB에 없을 경우에도 요약 기반으로 응답을 유지하고 `itemsWarning`을 반환한다. 완전한 종목별 이력 복구에는 `debug_run_items` 마이그레이션 적용 여부를 별도로 확인해야 한다.
