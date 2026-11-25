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

## 무인증 공개 갱신 API

- 일봉 갱신을 외부에서 직접 요청할 수 있도록 `POST /api/public/daily-cache/kr/refresh`와 `POST /api/public/daily-cache/us/refresh`를 제공한다. HTTP 작업 실행이므로 조회 전용 GET API와 분리했다.
- 두 endpoint는 호출자 인증을 검사하지 않는다. 단, 운영자가 각 기능을 비활성화하면 409, 최근 실행 후 최소 1시간(설정 interval이 더 크면 해당 간격) 내에는 429와 `Retry-After`, 이미 실행 중에는 `accepted:false`인 202를 돌려준다. 새 실행은 Next.js `after()` 백그라운드 작업으로 접수 즉시 202를 반환한다.
- 시장별 DB advisory lock lease와 `automation_runs` 실행 간격 확인을 적용해 동시 요청과 반복 요청으로 인한 전체 시장 작업 중복을 억제한다. cron 경로도 동일한 시장 lock을 사용한다. scheduler 시간창은 무인증 직접 호출에는 적용하지 않는다.
- 공개 action은 읽기 전용 OpenAPI에 포함하지 않고, `public/api-reference.md`의 별도 작업 API 섹션과 전체 route inventory에서만 문서화한다. API surface 감사는 허용된 두 POST만 `public-action`으로 인정하고 인증 검사 회귀 및 cron/action lock 분리를 실패 처리한다.
- 접수 응답은 갱신 결과가 아니다. 응답의 `accepted:true`는 작업이 시작되었음을 뜻하며, 완료 데이터는 공개 `GET /api/public/daily-candles`에서 확인한다. 작업 결과·대상·성공·실패 종목 수는 `automation_runs` 및 서버 로그에서 확인한다. 자동화 연동은 429의 `Retry-After`를 준수한다.
- 2026-11-23 운영 검증에서 동기 응답이 nginx 504로 끝나도 두 번째 무인증 POST가 `already_running` 202를 반환해 백엔드 lock이 유지된 것을 확인했다. 이에 요청자가 끝까지 연결을 유지하지 않아도 되도록 Next.js `after()` 기반 즉시 접수 방식으로 개선했다.

## 재발 감지 및 운영 확인

- `npm run cron:check`에서 국내·미국 endpoint 호출 누락 또는 순서 역전을 감지한다.
- `npm run audit:api-surface`에서 무인증 공개 갱신 API 두 개의 존재, POST 전용 메서드, 호출자 인증 검사 부재 및 공개 action 분류를 확인한다.
- 배포 후 `journalctl -u stockman-cron.service`에서 `[Cron] kr-daily-cache`와 `[Cron] us-daily-cache`의 success/skip/failure 및 duration을 확인한다. HTTP 성공만으로 실제 갱신을 판정하지 말고 응답의 `skipped`와 처리 건수를 확인한다.
- `automation_runs`의 최신 실행과 운영 캐시별 최신 거래일/갱신시각을 대조한다. `outside_schedule`이 반복되면 OCI timer 실행 시각과 DB의 enabled, activeDays, KST 시간창, interval을 대조한다.

## 남은 위험

- 매시 timer가 실제 설정 시간창 안에 실행되지 않으면 endpoint는 계속 skip할 수 있다. 배포 후 timer 시각과 양 시장 run 상태를 확인해야 한다.
- 전체 유니버스 작업이 1시간을 넘으면 systemd service가 다음 timer invocation과 겹치거나 생략될 수 있다. 운영 duration과 missed-run 로그를 확인하고 작업 분할이나 timer 주기는 evidence가 확보된 후 조정한다.
- 이 코드는 cron 경로를 복구하지만 캐시에 저장된 과거 누락 봉을 강제로 backfill하진 않는다. 배포 후 다음 정상 예약 실행의 결과 및 universe coverage를 확인한다.

## 2026-11-25 재진단 및 디버깅 개선

- 무인증 snapshot GET과 운영 공개 일봉 GET은 국내 KOSPI/KOSDAQ 및 미국 NAS/NYS/AMS 모두 최신 일자가 `20261123`임을 보였다. 국내 표본의 `fetchedAt`은 11월 23일 00:44–00:52 UTC, 미국 표본은 11월 24일 03:31–03:49 UTC였다.
- 인증된 운영 `/api/debug/us-daily-cache-status` 조회에서는 US 설정이 enabled, KST 06:00–08:00, 월~토, 1시간 간격이었다. 최근 실제 실행 3건이 모두 `FAILED/AUTOMATION_RUN_STALE`로 2시간 만에 정리됐고, 중간·후속 호출은 `outside_schedule`로 skip됐다. 운영 cache coverage는 NAS 2,926/2,926, NYS 1,671/1,671, AMS 223/223 종목이 모두 같은 11월 23일 봉만 보유했다.
- 코드상 두 worker는 D/W/M 신선도를 별도로 평가하며 일봉 우선 처리를 한다. 운영 `automation_runs` 요약을 통해 stale run에서 실제 선택된 timeframe 및 실패 단계가 공개되지 않아 W/M 요청이 11월 24일 일봉 부재의 원인이라고 확정할 수 없다. 이번 변경은 예약 실행의 W/M 정책을 보존하고 무인증 수동 POST만 명시적으로 D timeframe을 실행하도록 했다.
- 최신 운영 debug 응답에는 2026-11-24 05:04 UTC 이후 약 24시간 동안 새 US 실행 기록이 없었다. 이 시각은 확인된 KST 06:00–08:00 schedule window 밖이다. 운영 `/api/cron/us-daily-cache` endpoint가 해당 window 동안 호출되지 않았거나 호출자 인증이 실패했을 가능성이 있으며, 둘은 host `stockman-cron.service` journal 없이는 구분할 수 없다. cron timer 자체 원인은 미확정이다.
- 무인증 POST 수동 갱신은 이미 존재하는 `/api/public/daily-cache/kr/refresh`, `/api/public/daily-cache/us/refresh`를 유지한다. 두 경로는 D만 처리하고, 시장별 1시간 최소 간격·운영 enabled 설정·cron 공용 advisory lock을 보존한다.
- 새 인증 진단 `GET /api/debug/daily-cache-status?market=KR|US`는 enabled/schedule, 거래소별 유니버스 대비 캐시·최신 거래일 coverage, 최근 14일 거래일별 저장 건수, retry queue, 최근 24시간 오류 분류, 최근 automation 실행과 제한된 요약을 함께 반환한다. `locks.refresh`와 `locks.worker`는 각각 cron/manual 공용 refresh advisory lock 및 worker advisory lock의 보유 여부, holder 세션 상태·대기 이벤트·backend/transaction 경과 초를 read-only로 확인한다. `held=true`인데 run이 장시간 RUNNING이면 lock holder 상태를 추가로 조사한다. 기본 요청은 KIS를 호출하지 않는다. 선택형 `probeSource=true`는 거래소별 최대 3개 종목의 KIS 일봉 GET을 수행해 source/cache 최신일을 대조하며 DB 변경은 하지 않는다. 두 모드 모두 오류 원문·자격증명·webhook URL은 반환하지 않는다.
- 자동화 완료 Discord는 기존 module debug webhook (`featureSettings.discordFormat.debugWebhookUrl`) 또는 `STOCKMAN_DEBUG_DISCORD_WEBHOOK_URL` fallback을 사용한다. 완료·부분 실패·실패 메시지에 거래소별 최신일·coverage·fetchedAt을 포함하고, 후속 실행에서 `AUTOMATION_RUN_STALE`이 정리될 때 일봉 stale 실패를 같은 디버깅 webhook으로 알린다. webhook 주소와 원문 오류는 메시지에 넣지 않는다.
- 운영 실행 이력 근거는 US만 얻었다. KR 상태 진단은 새 endpoint 배포 후 조회해야 한다. OCI systemd journal과 cron 요청 HTTP status를 확인하기 전까지 timer 미실행과 인증 실패를 구분할 수 없다. 실제 운영 POST 실행과 배포는 하지 않았다.
- 운영 공개 US API를 2026-11-25T06:02Z 재조회한 결과 최신 거래일은 세 거래소 모두 2026-11-23, eligible 대비 최신일 coverage는 100%였고, 최신 실행 기록은 2026-11-24T05:04Z `outside_schedule`이었다. 그 앞의 세 run은 `AUTOMATION_RUN_STALE`로 정리됐다. OCI timer/service journal이 없으므로 호출 누락과 인증 실패는 구분하지 않았다. 새 `locks` 진단은 이번 코드 변경 후 배포되어야 사용할 수 있다.
