# ㄷㅊㅇ5·ㄷㅊㅇ6 실행 점검 — 2026-11-16

> 2026-11-19 재점검: 2026-11-17 스냅샷 완료 기록은 당시 public universe의 `COMMON_STOCK`/`is_dr=false` 조건만 검증했다. 이후 공식 KIS 영문 상품 설명이 `SPON ADS`/`SPON ADR`인 미국 종목도 이 조건을 통과하는 것을 확인했다. 그러므로 당시 US JSON의 DR 제외 조건은 충분히 입증되지 않았으며, 후속 분류 수정·운영 반영 후 재생성/재검증 전까지 현재 미국 스냅샷을 보통주 전용 완결 산출물로 간주하지 않는다.

## 목적과 범위

운영 공개 API에서 활성 미국·국내 보통주 유니버스와 최근 일봉을 읽는 `ㄷㅊㅇ5`·`ㄷㅊㅇ6` 실행 경로 및 배포 가능성을 확인했다. 운영 DB 직접 조회/쓰기 없이 공개 HTTP GET만 사용했다.

## 확인 결과

- 운영 호스트의 `/api/health`는 HTTP 200, `status=ok`를 반환했다.
- `/api/public/daily-candles?market=NAS&universe=true&offset=0&pageSize=1` 및 KOSPI 동등 요청은 모두 HTTP 400이다.
- `npm run snapshot:daily-candles -- --market=US`와 `--market=KR` 모두 유니버스 API HTTP 400에서 중단했다. 따라서 JSON 스냅샷은 생성/교체되지 않았다.
- `node --check scripts/snapshot-daily-candles-from-remote.mjs`, `npm run typecheck`, `npm run docs:check`, `npm run audit:api-surface`, `npx vitest run app/api/public/daily-candles/route.test.ts`(4 tests) 통과.
- 이 확인 과정에서 코드 수정은 하지 않았다. 로그 자동 생성 스크립트가 문서 카탈로그 파일을 생성했으므로 생성 상태를 보존했다.

## 배포 판정과 다음 단계

해당 API 수정은 현재 미커밋 워킹 트리에만 있고, branch는 `oci`, HEAD는 `998fb369`이다. 저장소 상태에는 1,692개 변경 경로(미추적 1,336 포함)가 있다. OCI workflow는 push된 branch revision 전체를 검증하고 배포하므로 현재 상태로 배포하면 ㄷㅊㅇ 기능과 무관한 변경이 함께 포함될 수 있다. 이에 push/deploy하지 않았다.

기능 변경을 별도 검토 가능한 revision으로 분리하고 전체 deployment gate를 통과한 뒤 `oci`에 반영해야 한다. 배포 성공과 운영 health 확인 후 두 snapshot 명령을 다시 실행하고 종목 수·누락 수·최신 거래일을 기록한다.

## 원격 배포 후속 점검 — 2026-11-16

- 원격 `oci`에는 `5c3cb7e0` (`feat: add active common stock daily snapshots`)이 반영됐다. GitHub Deploy OCI run `43829487560`의 검증·패키징·업로드는 통과했지만, activation의 V168 preflight는 active snapshot 세션 때문에 거부했다. 재시도 attempt 2·3도 같은 이유로 activation 전에 중단됐다.
- 승인된 PID `218746`, `219115`를 함께 재확인한 전용 workflow run `43831673280`은 승인 세트가 현재 상태와 일치하지 않아 세션 종료 없이 실패했다. 이후 PID `219115`만 재확인한 run `43834292650`도 조건이 맞지 않아 아무 세션도 종료하지 않았다.
- Deploy OCI attempt 4의 V168 preflight(2026-11-16 08:51 UTC)는 PID 219115 없이 다음 active snapshot holder를 기록하고 activation을 중단했다: client backend PID `220694`(3,099초), `220331`(2,825초), `220958`(2,528초), `221333`(2,303초), `221753`(1,945초), `222565`(757초), `222632`(655초), `222879`(249초). 함께 관측된 parallel worker는 별도 종료 대상으로 삼지 않았다.
- 운영 `/api/health`는 20초 내 응답하지 않았고, DB 조회 없이 반환되는 잘못된 market 요청은 HTTP 400을 반환했다. 새 유니버스 API 적용 및 운영 health 정상 여부는 확인되지 않았다. 두 snapshot 명령은 아직 성공하지 않았다.
- 이 점검에서 운영 DB 세션 종료는 실행되지 않았다. 남은 PID는 기존 승인 대상에 포함되지 않는다. 자연 종료를 기다렸다가 배포를 재시도하거나 해당 PID 종료를 별도로 승인해야 한다. 운영 DB 직접 접속/수정은 하지 않았다.

## Deploy OCI 5차 재확인 — 2026-11-16 09:02 UTC

- 원격 `oci` tip `5c3cb7e09cc68f0f6c6f4177499eb8edf5725d0a`의 Deploy OCI run `43829487560`, attempt 5에서 검증·패키징·업로드 후 V168 preflight가 다시 중단됐다. 사유는 60분 이상 된 활성 DB snapshot holder이며, release activation 전 단계에서 fail-closed로 종료됐다.
- 이번 preflight가 관측한 client backend: PID `220694`(3,722초), `220331`(3,448초), `220958`(3,151초), `221333`(2,926초), `221753`(2,569초), `222632`(1,279초), `222565`(511초), `223360`(468초). parallel worker는 종료 목록이 아니다. 각 PID는 60초 이상의 차이가 있는 스냅샷 보유 상태로 평가됐으며, 종료 신호는 보내지 않았다.
- 운영 `https://stockman.r-e.kr/api/health`는 12초 제한에서 응답하지 않았고, NAS 및 KOSPI universe GET은 각각 HTTP 400을 반환했다. 최신 API 미배포 상태와 부합한다. ㄷㅊㅇ5·ㄷㅊㅇ6 스냅샷 명령은 재실행하지 않았고 기존 JSON을 변경하지 않았다.
- 다음 조치: 사용자가 별도 승인 선택을 제출하기 전까지 세션을 종료하지 않는다. 승인이 오면 지정 PID만, 실행 직전 DB에서 backend type/state/transaction age 및 snapshot 조건을 재검증하고, 기준을 만족하는 PID만 종료한 뒤 preflight를 재실행한다. 승인하지 않으면 세션 자연 종료 후 동일 배포 workflow를 재시도한다.
- 원인/탐지/잔여 위험: 장기 활성 트랜잭션이 snapshot horizon을 유지해 V168 인덱스 정리와 충돌한다. 재발 탐지는 deploy workflow의 `oci-flyway-v168-preflight.mjs` gate가 담당하며 현재는 안전하게 배포를 차단한다. 운영 health timeout도 별도 조사 대상으로 남는다. commit/push/deploy: 없음(OCI feature commit은 이미 원격에 있으나 production activation 미완료).

## 추가 승인 PID 조치 및 재배포 결과 — 2026-11-16 09:29 UTC

- 사용자의 승인 집합에 포함되며 실행 당시 60분 이상 active snapshot holder였던 PID `220331`, `220694`, `220958`, `221333`을 전용 workflow run `43837816253` job `133198736525`에서 재검증 후 종료했다. `pg_stat_activity` 재조회 결과 네 PID 모두 사라졌다.
- 재배포 run `43829487560` attempt 7은 검증·패키징·업로드 후 V168 preflight에서 다시 차단됐다. 확인된 최신 활성 snapshot holder는 승인 PID `222632`(2,897초), `222565`(2,128초), 승인 범위 밖 PID `223771`(1,014초), `224038`(613초), `224555`(222초) 및 parallel worker였다. 사용자 승인 기준(60분 이상)을 충족한 세션은 이 preflight 시점에 없었다. 승인 범위 밖 PID와 60분 미만 세션은 종료하지 않았다.
- `scripts/oci-flyway-v168-preflight.mjs` 기준은 `backend_xmin IS NOT NULL` 및 `xact_start < NOW() - INTERVAL '30 seconds'`인 세션 전부다. 그러므로 기존 60분 종료 허용 범위로는 최근에 새로 만들어지는 snapshot holder를 다 제거할 수 없고 배포가 반복해서 차단될 수 있다. 실행 로그상 해당 시각에 운영 `/api/health`도 12초 제한에서 응답하지 않았다.
- V168 migration, 운영 health 정상, 공개 universe API 및 ㄷㅊㅇ5·ㄷㅊㅇ6 스냅샷 생성은 여전히 미확인/미완료다. 최신 활성 세션 다섯 PID에 대해 별도 조치 범위를 확인 중이며, 기존 승인 범위 밖 신호는 발송하지 않았다.

- 이어진 승인 workflow 재실행(job `133202860068`, 09:22 UTC)은 PID `221753`만 현재 active snapshot holder이며 60분 이상임을 확인해 종료했고, `pg_stat_activity`에서 사라짐을 확인했다. 바로 뒤 배포 run `43829487560` attempt 7도 V168 preflight에서 차단됐다. 신규 holder와 60분 미만 holder는 이전 문단의 목록과 같았으며 종료되지 않았다.
