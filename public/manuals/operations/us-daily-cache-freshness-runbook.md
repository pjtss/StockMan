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
- 장후 catch-up은 거래일 갭 복구가 목적이므로 일봉(`D`) lane만 실행한다. 주봉·월봉 lane은 기존 구성 시간 cron에서 계속 갱신한다. 이를 통해 catch-up이 주봉·월봉 작업에 묶이지 않게 한다.
- 보호된 status API는 시장별 누락 ticker 코드를 `missingAtLatestDateCodes`로 최대 50개 반환한다. 누락 수와 코드 목록을 대조하고, 개별 공개 일봉 GET으로 원천/캐시 날짜를 확인한다.

## 검증 및 배포 확인

- 테스트는 미국 동부 시간대의 장후 판정, 거래소별 최신일 및 종목별 누락 비교, 원천·coverage 조회 누락 시 fail-closed를 확인한다.
- `npm run cron:check`, 관련 Vitest, typecheck, 전체 배포 검증 및 빌드를 통과한 뒤 `oci` 배포를 수행한다.
- 배포 후 확인은 `/api/health`의 commit/build 정보, cron journal의 `trigger=post_close_stale_cache_catchup` 또는 `outside_schedule_cache_current`, 공개 일봉 GET의 NAS/NYS/AMS 최신 거래일로 한다. HTTP 200만으로 갱신 성공을 판정하지 않는다.

## 잔여 위험

- 장후 기준은 미국 동부 시간대로 계산하며 KIS가 기준 종목의 일봉을 제공하지 않으면 보정은 fail-closed로 503 처리된다. 거래소별 세 기준 종목이 모두 일시 장애·정지 상태인 경우가 드물게 가능하다.
- 전체 유니버스 warm 실행 중 일부 KIS 요청이 실패하면 기존 재시도 큐가 처리한다. 운영 최신일과 automation run 응답을 함께 확인해야 한다.
- 비동기 catch-up 배포 후 운영에서는 시장 MAX가 11/23인 동안 1,879개 원시 universe 종목 누락이 확인됐다. 이는 실제 cache warm 대상과 맞지 않을 수 있어 coverage 감지기와 상태 API를 `daily_active` 및 보통주 상품명/유형 제외 기준까지 동일하게 조정했다. 적격 coverage 기준으로 0 누락인지 확인한다.
- 2026-11-24T04:35Z 적격 coverage status는 총 5,122개 중 5개 누락(NAS 1, NYS 4, AMS 0), 시장 MAX 날짜 11/23으로 확인됐다. 대표 종목 AAPL/MSFT/JPM도 11/23이다. deployment run `45325840944`의 검증 및 activation 성공과 health 응답을 확인했다. 자동화 run `455259`는 여전히 RUNNING이며 마지막 캐시 갱신은 03:50Z다. 남은 다섯 종목이 휴장·거래정지인지 공급원 응답 누락인지 식별 전까지 전체 적격 universe 완료로 판정하지 않는다.

- 2026-11-24T05:09Z의 최신 운영 상태에서도 시장별 최신일은 11/23이지만 적격 5,122개 중 NAS `PRFX` 1개, NYS `AKO/B`, `GGB`, `ITUB`, `PYT` 4개가 해당 날짜에 없다. 개별 공개 cache GET에서 `PRFX`, `PYT` 최신 봉은 11/17이었다.
- 사용자의 안내에 따라 Docker Desktop 로컬 PostgreSQL도 `.env.local`의 `DATABASE_URL`로 read-only 조회했다. `stockman-postgres-local` 컨테이너 및 DB `stockman` 연결이 정상이며 PostgreSQL 16.15, 필요한 US universe/candle/automation 테이블이 존재한다. 하지만 로컬 cache market MAX는 세 시장 모두 `2026-10-27`이고, local automation 이력은 2026-09-10까지라 운영의 2026-11-24 상태를 복제하지 않은 별도 DB다. 로컬 적격 기준 coverage는 AMS 240/248, NAS 3137/3164, NYS 1790/1804였으며 해당 로컬 시점 누락은 운영의 다섯 종목과 일치하지 않는다.
- 같은 local DB에서 `pg_stat_activity` 및 advisory lock을 read-only로 확인한 시점에는 다른 활성 DB 세션과 advisory lock이 없었다. 이는 Docker 로컬 DB만의 상태이며 OCI 운영 DB의 고착 session lock 유무를 증명하지 않는다.
- 운영 공개 `POST /api/public/daily-cache/us/refresh`는 계속 `accepted:false`, `reason=already_running`을 반환했고 automation run `455259`, `455350`도 각각 03:15Z, 04:37Z 시작 상태 `RUNNING`으로 유지됐다. 코드상 먼저 획득하는 세션 advisory lock `public-daily-cache-refresh:us-daily-cache`가 거절 원인이다. 동일 세션 lock이 언제 해제될지는 API만으로 확인할 수 없으며, DB session/process inspection은 OCI 운영 접근이 없어 미확인이다.
- 보호 cron POST는 05:09Z에도 KST 06:00–08:00 예약창 밖이라 `outside_schedule`로 skip됐고 freshness probe도 실행하지 않았다. 저장된 2026-11-24 조사환경 시각은 14:09 KST로 운영 상태의 `checkedAt=05:09Z`와 맞지 않아 예약창 도달 판단에는 운영 응답 시간을 사용해야 한다.
- 다음 조치: OCI journal에서 실행 `455259`/`455350`의 작업 로그와 `stockman.service` 상태를 확인하고, PostgreSQL에서 `pg_stat_activity` 및 `pg_locks`를 read-only 조회해 해당 advisory lock 보유 세션과 실행 쿼리를 식별한다. 아직 쿼리 중인 세션을 종료하지 않는다. 세션/작업이 종료됐음이 확인될 때만 자동 stale-run reconciliation과 새 D-only catch-up을 재시도하고, 다섯 종의 종목별 최신일 및 최종 run summary를 검증한다.
- 현재 상태: 배포는 성공했지만 대상 5종 복구, 고착 run 원인 특정, 사후 재발 자동화는 미완료다. 별도 stale lock 회수 기능을 추가할 경우 활성 작업을 오판하지 않도록 heartbeat/lease 소유권과 안전한 만료 조건을 먼저 설계하고 전체 배포 검증 후 배포해야 한다.
