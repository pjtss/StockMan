# 미국 일봉 캐시 최신성 지연 진단 및 보정 — 2026-11-24

## 목적과 확인 결과

운영 미국 보통주 일봉 캐시가 기대 거래일보다 늦게 남는 원인을 추적하고, 스케줄 창을 놓쳐도 원천 데이터가 앞서 있으면 자동 보정하도록 개선했다.

- 2026-11-23T16:06:53Z에 수집된 전체 유니버스 스냅샷은 NAS/NYS/AMS 모두 최신 거래일 `2026-11-20`이었다. 이 시각은 미국 동부 11월 23일 11:06으로 정규장 종료 전이므로, 이 스냅샷만으로 11월 23일 장 마감 뒤의 상태를 판정할 수 없었다.
- 2026-11-24T01:44Z 운영 공개 GET에서도 AAPL, MSFT, JPM의 최신 거래일은 `2026-11-20`이었고 데이터 갱신 시각은 11월 23일 01:39–02:05Z였다. 미국 동부 11월 23일 장 마감 뒤에도 캐시가 11월 20일에 머문 것은 확인됐다.
- 같은 시각 보호된 `POST /api/cron/us-daily-cache`는 HTTP 200 `skipped=true`, `reason=disabled_or_outside_schedule`를 반환했다. 새 catch-up 배포 후에는 보호된 요청이 약 54초 만에 nginx HTTP 504를 반환했고, 진단 이력 `455198`은 RUNNING으로 남았다. 기존 응답은 disabled와 outside-schedule을 구분하지 않아 원인을 정확히 표시하지 못했다. 이 호출은 캐시 갱신을 수행하지 않았다.
- 비동기 catch-up 개선 배포 `f581164f`는 GitHub Actions run `45314191777` 성공으로 활성화됐다. 2026-11-24T02:49Z freshness probe는 NAS/NYS/AMS의 원천과 시장 최대 캐시일이 모두 `2026-11-23`으로 같다고 판단해 skip했다. 그러나 같은 시각 보통주 universe 상태 조회에서는 해당 날짜 봉이 없는 종목이 NAS 1,107개, NYS 665개, AMS 107개로 총 1,879개였다. 즉 거래소 MAX 날짜만 비교하면 종목별 누락을 놓친다.
- 공개 일봉 GET에서도 AAPL은 `2026-11-23`이었지만 MSFT와 JPM은 각각 `2026-11-20`이었다. 따라서 시장 전체 MAX와 대표 티커 일부만으로는 전 종목 최신성을 주장할 수 없다.
- 2026-11-22 운영 진단은 미국 갱신 모듈의 KST 06:00–08:00 실행창과 최근 `SKIPPED/outside_schedule` 이력을 확인했다. OCI 타이머는 매시 실행되며 일봉 호출은 긴 선행 작업 뒤에 배치되어 실행창을 놓칠 수 있었다. 호출 순서를 cron 초반으로 옮긴 개선은 `ac51bc29`에 이미 반영·배포되어 있었지만, 실제 캐시가 최신화됐다는 운영 증거는 없었다.

## 원인

cron 타이머의 매시 호출과 DB가 설정한 좁은 KST 실행창이 서로 맞지 않으면 라우트가 성공 HTTP 상태와 함께 작업을 건너뛴다. 이전 응답은 skip 사유를 합쳐 보여 주었고, 정규장 종료 뒤 KIS 원천의 최신 일자와 운영 캐시를 비교하는 감시가 없어 `outside_schedule`과 “작업은 성공했지만 데이터가 오래됨”을 구분하지 못했다. 따라서 작업 순서 이동만으로는 마지막 거래일 도달 여부를 보장하지 못했다.

## 개선

- 모듈이 비활성화된 경우 `reason=disabled`, 실행창 밖이면 `reason=outside_schedule`을 응답하고 KST 시간창·활성 요일을 함께 반환한다.
- 설정된 KST 실행창 밖이라도 미국 동부 평일 18:00 이후에는 운영 공식 마스터의 NAS/NYS/AMS 활성 COMMON_STOCK에서 거래소별 최대 3개를 골라 기존 KIS 일봉 조회 경로로 기준 최신일을 확인한다. DB 캐시의 거래소별 최신 일자와 비교한다.
- KIS 기준일이 시장 MAX보다 최신이거나 활성 보통주 중 해당 기준일 봉 누락이 있으면 기존 전체 유니버스 warm 경로를 catch-up 실행한다. 기준일 봉이 모든 활성 보통주에 있는지 coverage를 확인해 MAX 날짜만으로 조기 skip하지 않는다. 정상 모듈 활성 상태와 1시간 실행 간격 제한은 유지하고, 기준 조회·coverage 조회 실패는 fail-closed HTTP 503으로 드러낸다.
- OCI cron 정적 검사는 health probe 다음 세 작업이 health probe → 국내 일봉 → 미국 일봉 순서인지 확인한다. 다른 hourly 작업이 이보다 앞서 오면 검증을 실패시킨다.

- 장후 원천일 또는 종목별 coverage 불일치 시 전체 warm은 Next.js `after()` 백그라운드 작업으로 넘기고 빠르게 HTTP 202 접수 응답을 반환한다. 분산 잠금은 작업 완료 시 해제한다. 실행 이력이 고아 `RUNNING`으로 남아 있어도 새 잠금을 획득했다면 freshness 검사를 진행한다. Route 최대 실행 시간은 5,400초로 선언한다.

## 검증 및 배포 확인

- 테스트는 미국 동부 시간대의 장후 판정, 거래소별 최신일 및 종목별 누락 비교, 원천·coverage 조회 누락 시 fail-closed를 확인한다.
- `npm run cron:check`, 관련 Vitest, typecheck, 전체 배포 검증 및 빌드를 통과한 뒤 `oci` 배포를 수행한다.
- 배포 후 확인은 `/api/health`의 commit/build 정보, cron journal의 `trigger=post_close_stale_cache_catchup` 또는 `outside_schedule_cache_current`, 공개 일봉 GET의 NAS/NYS/AMS 최신 거래일로 한다. HTTP 200만으로 갱신 성공을 판정하지 않는다.

## 잔여 위험

- 장후 기준은 미국 동부 시간대로 계산하며 KIS가 기준 종목의 일봉을 제공하지 않으면 보정은 fail-closed로 503 처리된다. 거래소별 세 기준 종목이 모두 일시 장애·정지 상태인 경우가 드물게 가능하다.
- 전체 유니버스 warm 실행 중 일부 KIS 요청이 실패하면 기존 재시도 큐가 처리한다. 운영 최신일과 automation run 응답을 함께 확인해야 한다.
- 비동기 catch-up 배포 후 운영에서는 시장 MAX가 11/23인 동안 1,879개 종목 누락이 확인됐다. 새 종목별 coverage 코드 배포 후 보호된 cron의 freshnessCheck에서 `missingAtSourceLatestDateCount=0`인지, status API에서 `missingAtLatestDateCount=0`인지 확인한다.

