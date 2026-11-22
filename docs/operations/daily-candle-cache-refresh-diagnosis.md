# 국내·미국 일봉 캐시 갱신 지연 진단 및 개선

## 진단 범위와 근거

- 확인 대상: `deploy/oci/stockman-cron.timer`, `scripts/oci-cron.sh`, 국내·미국 cron route 및 운영 read-only 점검.
- OCI timer는 매시 실행되며 `Persistent=true`다. 국내·미국 cron route는 DB의 enabled/schedule 설정을 검사하고, 설정 시간 밖에는 정상 skip을 기록한다.
- `scripts/oci-cron.sh`에는 미국 endpoint만 있었고 국내 `/api/cron/kr-daily-cache` 호출은 없었다. 국내 캐시가 OCI cron만으로 갱신될 수 없는 호출 누락이다.
- 미국 호출은 SEC·RSS 등 장시간 작업 뒤였다. 조회된 US 설정은 enabled, KST 06:00–08:00, 월~토, 1시간 간격이었다. 기존 운영 run 점검에서는 최근 10건이 모두 `SKIPPED/outside_schedule`이었고 설정 시간창 내 실행이 확인되지 않았다.
- 2026-11-22 공개 read-only GET으로 확인한 최신 거래일은 KR KOSPI/KOSDAQ 표본에서 `20261118`, US NAS/NYS에서 `20261117`이었다. AMS 표본은 10종 중 9종이 `20261117`, 한 종은 `20261007`이었다. 이는 전수 coverage 증거가 아닌 분산 표본이다.
- 이전 운영 진단에는 KR activeDays에서 화요일이 제외된 기록이 있다. 화요일 누락은 설명하지만 며칠간 전체 지연을 설명하진 않는다. 현재 KR 설정과 OCI host journal은 조회되지 않아 timer/service 자체의 미실행 여부와 지연일별 실패 사유는 미확정이다.

## 개선 내용

- 국내와 미국 일봉 endpoint를 OCI cron 초반, health probe 직후로 이동/추가했다. 장시간 선행 작업 때문에 KST 실행 창을 놓치는 가능성을 줄인다.
- 두 route의 인증, schedule 및 DB 기반 interval gate는 유지한다.
- `scripts/check-oci-cron.mjs`에 두 호출의 존재와 장시간 작업 전 실행 순서를 검사하는 자동 조건을 추가했다.

## 재발 감지 및 운영 확인

- `npm run cron:check`에서 국내·미국 endpoint 호출 누락 또는 순서 역전을 감지한다.
- 배포 후 `journalctl -u stockman-cron.service`에서 `[Cron] kr-daily-cache`와 `[Cron] us-daily-cache`의 success/skip/failure 및 duration을 확인한다. HTTP 성공만으로 실제 갱신을 판정하지 말고 응답의 `skipped`와 처리 건수를 확인한다.
- `automation_runs`의 최신 실행과 운영 캐시별 최신 거래일/갱신시각을 대조한다. `outside_schedule`이 반복되면 OCI timer 실행 시각과 DB의 enabled, activeDays, KST 시간창, interval을 대조한다.

## 남은 위험

- 매시 timer가 실제 설정 시간창 안에 실행되지 않으면 endpoint는 계속 skip할 수 있다. 배포 후 timer 시각과 양 시장 run 상태를 확인해야 한다.
- 전체 유니버스 작업이 1시간을 넘으면 systemd service가 다음 timer invocation과 겹치거나 생략될 수 있다. 운영 duration과 missed-run 로그를 확인하고 작업 분할이나 timer 주기는 evidence가 확보된 후 조정한다.
- 이 코드는 cron 경로를 복구하지만 캐시에 저장된 과거 누락 봉을 강제로 backfill하진 않는다. 배포 후 다음 정상 예약 실행의 결과 및 universe coverage를 확인한다.
