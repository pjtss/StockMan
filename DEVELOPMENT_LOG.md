### 2026-11-27 — 인증 일봉 진단 API에 제한된 systemd 서버 로그 추가
- 목적/범위: 기존 인증된 일봉 진단 API에 앱·cron·Nginx journal을 선택 조회하는 경로와 OCI 배포 구성을 추가한다.
- 근본 원인/영향: 국내 일봉 수동 갱신에서 요청 후 응답 지연과 분산 lock 잔류가 관측됐지만, 기존 API에는 서버·proxy 로그가 없어 작업 시작/실행/완료 경로를 분리해 진단하기 어려웠다. 요청 수락만으로 작업 완료를 추정하지 않는다.
- 구현: `includeServerLogs=true`일 때 allowlist source만 조회하고, 범위(1–1440분), source당 행수(1–100), subprocess timeout(10초), 현재 boot에서 최대 400행 스캔, 출력 buffer(2MiB), 메시지 길이(1,500자)를 제한한다. journalctl은 고정 인자와 execFile로 실행하며 인증 실패 시 DB/journal에 접근하지 않는다. 원격에서 `--since`를 포함한 제한 조회가 unit별 timeout된 것이 확인되어 journalctl 출력의 최근 bounded tail을 가져온 뒤 timestamp로 요청 lookback을 필터링하도록 수정했다. message credential pattern을 마스킹하고 per-source 실패는 code만 반환한다. Nginx error는 journal로 내보내고 access journal에는 query string을 제외한 4xx/5xx 또는 1초 이상 요청의 upstream 시간만 기록한다.
- 권한/남은 위험: `stockman.service`에 `SupplementaryGroups=systemd-journal`을 주어 호스트 전체 journal read 권한이 생긴다. route allowlist는 응답 source를 제한하지만 OS 권한을 격리하지 않는다. 마스킹은 미지의 비밀 형식을 완전 보장하지 않으므로 서버 로그에 credential 원문을 남기지 않는다.
- 변경 파일: `lib/server-journal.ts` 및 unit/parser test, `app/api/debug/daily-cache-status/route.ts`와 인증/옵션 route test, OCI service/nginx/activation/workflow/static checks, API reference, 국내 운영 runbook 및 생성된 public manual/catalog.
- 재발 감지/다음 단계: 진단에서 run 상태·heartbeat·lock과 coverage가 맞지 않으면 `includeServerLogs=true`로 app/cron journal과 Nginx upstream 시간을 대조한다. 배포 후 실제 호출로 각 source 접근권한과 오류 격하 응답을 확인한다.
- 검증: 신규 journal 및 route 테스트 13/13, `npm run deploy:verify` 통과(의존성 감사 0 취약점, OCI activation recovery smoke, 문서/event-data checks, API/security/cron audits, production build, standalone health/API/static-assets/Chrome desktop·mobile smoke, 285 test files passed/1 skipped, 1,668 tests passed/3 skipped, typecheck). 운영에서 기존 결합형 진단은 DB 쿼리 대기 끝에 HTTP 504가 발생해 인증된 `logsOnly=true`를 추가했고, 배포 뒤 journal 전용 API는 200을 반환했다. 다만 서비스 journal 조회가 `JOURNAL_READ_TIMEOUT`을 반환했고 `nginx-access`는 200으로 읽혔다. 공식 `journalctl` 문서의 newest-first 및 최근 이벤트 제한을 적용한 뒤에도 `stockman.service` 1개 행 요청이 timeout되므로 프로세스 읽기 제한을 10초에서 25초로 늘려 후속 운영 검증한다.
- 커밋·푸시·배포: `557cca1f` activation에서 Nginx syslog tag 문자 오류가 확인되어 `183ee242`에서 수정했다. `ee398849`, `f4aa4b9c`, `75b5dd61` workflow 성공 뒤 `f9964a54`에서 logsOnly 분리를 배포했고 workflow `45936209405` 성공 및 health 200을 확인했다. 역순·제한 조회 변경 `ff44f08f`도 workflow `45937811392`에서 성공 및 서버 활성화됐다. 해당 운영 진단에서 service journal timeout이 남아 25초 제한 증가를 추가 검증·배포해야 한다. 국내 캐시 coverage/성공 실행은 2026-11-25 기준 2,339종목, 실패 0건이다.

### 2026-11-27 — gzip 일봉 API compact 기본 응답으로 속도 우선 전환
- 목적/판정: 사용자 요청에 따라 응답 속도를 1순위로 둔다. 기존 운영 paired 실측에서 compact는 full 대비 gzip bytes가 KR 1,212,533→1,060,716B(-12.5%), US 2,816,112→2,450,128B(-13.0%), raw JSON은 각각 -42.3%/-41.8%였다. US 종단간 완료시간은 5쌍 표본에서 개선되지 않아 빨라진다고 단정할 수 없지만, 호출마다 전송·LLM 파싱 부담이 줄어드는 compact를 기본으로 승격한다.
- 변경: 미지정 format과 직접 API helper 기본값을 compact로 변경하고, `format=full`은 기존 객체형 봉을 보존한다. ticker/marketCap/daily, metadata, 데이터 값, 보통주 필터, 단일 gzip 파일, 일봉 최대20은 유지한다. 이전에 format 생략을 full로 사용한 API 소비자는 full 계약을 유지하려면 `?format=full`을 붙여야 한다. API reference와 OpenAPI default, default tuple 회귀검사도 함께 갱신했다.
- 문서/오류 감지: 상세 운영 데이터·호환성 위험·개선 근거는 `docs/operations/public-daily-export-performance-report.md`의 compact 기본값 전환 섹션. route test는 기본 URL에서 tuple-v1과 candleFields를 확인하고, full 모드는 명시적으로 요청해 객체 구조를 검사한다. 운영 배포에서는 KR/US 기본 GET과 `?format=full` 모두 gzip 해제, JSON 구조, ticker·marketCap·daily, returnedCount 및 max20을 검증한다.
- 검증/배포 상태: API 문서 생성 및 surface audit 통과, targeted route test 17/17, 전체 `npm run deploy:verify` 통과(283 test files passed/1 skipped, 1,655 tests passed/3 skipped, production build, typecheck, standalone runtime/Chrome smoke 및 API/docs/security/cron audits). 빌드가 자동 추가한 `next-env.d.ts`·`tsconfig.json` 변경을 원복했다. commit `b07a050e`를 `oci`에 push했고 [OCI run 45916444721](https://github.com/pjtss/StockMan/actions/runs/45916444721)에서 Verify, 패키징, 업로드, release 활성화가 성공했다. 운영 KR/US 기본 URL과 `?format=full` 각1회(총4회)는 모두 HTTP200/application-gzip/no-store/XFL2, gunzip·JSON·필드·returnedCount/max20 계약을 통과했다. compact/full gzip bytes는 KR 1,060,716/1,213,001B(-12.6%), US 2,450,155/2,815,676B(-13.0%)였다. 순차 한 쌍의 완료시간(KR12.258/15.332초, US43.541/48.996초)은 compact가 짧았으나 표본당 1회·통제 조건 부재라 인과 효과로 주장하지 않는다. 운영 성능 보고서에 측정과 한계를 함께 기록했다.

### 2026-11-27 — public daily export gzip windowBits 15→14 후보
- 공식문서/목적: Node.js v24 zlib 문서는 deflate 메모리에서 windowBits가 2의 거듭제곱으로 비용에 반영되고 작은 window가 일반적으로 압축률을 낮출 수 있다고 안내한다. level9/Z_FILTERED/chunk64KB/gzip API 계약은 유지하고 actual API 전체 응답 속도가 빨라지는지 측정했다. local Node는 v24.14.0, deploy workflow production runtime은 Node22라 운영 확인 필요.
- 두 순서 A/B, 각 시장/버전 9 warmed GET: baseline→candidate median KR638→450ms, US1,127→910ms; reversed candidate→baseline KR448→609ms, US926→1,081ms. gzip bytes는 KR1,178,244→1,171,044(-0.61%), US2,797,603→2,807,759(+0.36%). 모든 응답 HTTP200/XFL2, gunzip, JSON schema/max20 통과; raw JSON SHA-256 동일.
- 판정/위험: 양 순서·양 시장에서 local API median이 후보 우세라 운영 후보로 채택한다. US gzip은 약10KB 늘 수 있으며 운영 저속 회선에서 전송 지연이 상쇄할 수 있다. windowBits만 15→14로 변경했다. 압축 크기와 API latency를 함께 운영에서 측정하며, 정확한 효과는 Node22 OCI 운영 측정에 의존한다.
- 파일/검증/배포: lib/public-daily-export.ts. route test15/15 및 전체 npm run deploy:verify 통과(283 test files/1,653 tests, build/typecheck/docs/audit/standalone/Chrome smoke 포함). commit8c220dcd의 OCI run45905604148에서 verify·패키징·업로드·activate 성공. Node22 운영 KR/US 각5 GET은 모두 HTTP200/XFL2/gunzip/schema/20봉 계약 통과. windowBits15→14 운영 median은 KR6.807→6.085초(-10.6%), US59.633→49.896초(-16.3%); gzip median KR1,219,867→1,212,074B(-0.64%), US2,819,256→2,816,126B(-0.11%). first-byte median KR0.405→0.242초, US0.377→0.385초. 부하 미통제 5회 표본이므로 인과 효과는 확정하지 않되 local 양방향 A/B와 운영 양시장 결과가 일치하고 contract 회귀가 없어 windowBits14 유지. 운영 report에 수치 추가 후 문서-only 기록 커밋/OCI 배포 예정.

### 2026-11-27 — 일봉 export 요청 키 인코딩·정렬 성능 후보 기각
- 목적/범위: 실제 PostgreSQL batch path의 직렬화/정렬 비용을 줄이는 두 후보를 배포 HEAD와 같은 local API/DB에서 반복 비교했다. 각 market의 첫 warm-up 요청 제외 후 7회, 전체 gzip 응답 gunzip·JSON·ticker/marketCap/daily/max20 계약 검사.
- jsonb_to_recordset → unnest candidate: 대상 API 테스트 15/15, KR/US output gzip bytes는 각각 1,178,244/2,797,603B로 동일. median은 KR629→644ms(+2.4%), US1,103→1,533ms(+39.0%)로 회귀해 기각. 세 배열 parameter 처리/계획 비용 가운데 원인은 별도 계측하지 않아 미확정. 코드 복원, 운영 배포 없음.
- 문자열 market/code ORDER BY → WITH ORDINALITY candidate: 초기 실제 DB 검증에서 PostgreSQL 42601 (WITH ORDINALITY와 column-definition-list 조합 오류), 이후 CTE ordinal 누락으로 42703. ROWS FROM(...) WITH ORDINALITY 및 ordinal 전달을 수정하고 실제 KR/US HTTP200 gzip API 계약 + route test15/15 통과 후 측정했다. market/code 기준 median KR644→728ms(+13.0%), US1,185→1,223ms(+3.2%); gzip bytes 변화 없음. 양 시장 느려져 기각, 배포 없음.
- 재발 감지/절차: mock SQL assertions는 PostgreSQL 문법/실제 column resolution을 검증하지 못한다. SQL 최적화는 endpoint 전체 A/B 전에 로컬 실제 DB GET으로 syntax·alias·field 검증을 먼저 수행하고, 오류 응답은 timing 표본에서 제외한다. 이후 full-response 양 시장 반복 median을 통과 조건으로 유지한다.
- 문서화 파일: docs/operations/public-daily-export-performance-report.md, DEVELOPMENT_LOG.md. candidate 코드/test 변경은 모두 배포 HEAD로 복구했고 DB/운영 API 데이터 변경 없음. 이 조사에서 코드 개선은 배포되지 않았다.

### 2026-11-27 — 일봉 export 배치 조회의 종목 마스터 재조인 제거 후보
- 목적/원인: 기존 경로는 eligibility 쿼리에서 자격을 확인한 뒤 각 candle batch가 동일 universe 테이블을 다시 조인하고 보통주/ETF/DR 필터를 다시 평가했다. 첫 조회 결과의 market/code/name을 batch 입력에 전달하고 반복 조인을 없애 조회 비용을 줄이는 후보를 구현했다. 첫 조회의 fail-closed 공식 종목 분류 조건은 그대로 두고 응답 데이터 계약, gzip 단일형식, level9+Z_FILTERED+64KB, max20, KR500/US1000은 바꾸지 않았다.
- 로컬 측정: 실제 local API/DB, warmed GET 기준 버전 KR/US 각각 6회, 후보 각각 5회. 중앙값은 KR634→591ms(-6.8%), US1,162→1,101ms(-5.2%); gzip bytes는 KR1,178,244/US2,797,603으로 동일했다. 표본이 작고 로컬 DB 부하를 통제하지 않아 개선 신호로만 판정한다. 후보 응답은 HTTP200, gunzip/JSON 및 ticker·marketCap·daily·20봉 상한을 통과했다.
- 오류/재발감지: 최초 실 DB 실행에서 batch SQL에 남은 u.market 참조가 missing FROM-clause HTTP500을 만들었다. r.market으로 수정했다. 테스트는 15/15 통과; query mock은 첫 eligibility query에서 name을 반환하고 batch JSON에 이름이 전달되며 batch SQL에 universe 재조인이 없는지 검사한다. 실제 KR/US GET에서 동일 오류가 재발하면 즉시 배포를 중단하고 DB alias reference를 검토한다.
- 변경/검증 범위: lib/public-daily-export.ts, app/api/public/daily-export/kr/route.test.ts, docs/operations/public-daily-export-performance-report.md, DEVELOPMENT_LOG.md. 전체 deploy:verify 통과(283 test files/1,653 tests, build/typecheck/docs/audits/standalone/Chrome smoke 포함). commit 539361a1을 oci에 push했고 OCI run 45900026319의 전체 verify·standalone 패키징·release 업로드·activation이 성공했다. 배포 후 KR/US 운영 GET 각5회 모두 HTTP/gzip/JSON/필드/20봉 검증 통과. completion median은 KR6.807초(이전7.363초), US59.633초(이전49.507초)이며 first-byte median KR0.405초/US0.377초, payload 크기는 거의 같다. 서버/네트워크 부하가 통제되지 않아 효과는 미확정이며 보고서에 전체 표본을 보존한다. 배포 후 문서화 변경은 전체 검증을 거쳐 별도 기록 배포한다.

### 미국 batch1,000 OCI 운영 결과
- 코드 commit `43145d2e`, OCI Deploy run `45895497067` 성공 및 release activation 완료.
- 배포 직후 운영 KR/US 공개 GET 각각 5회. 모두 HTTP200, application/gzip, Content-Encoding 없음, no-store, XFL2, gzip 해제·JSON 파싱, ticker·marketCap·daily 필드, returnedCount 일치, 최대20봉 계약 통과.
- KR 완료시간22.651/7.363/4.229/4.193/7.739초(median7.363), first body byte median0.201초, gzip median1,219,867B, raw8,907,188B, 2,337 ticker. US49.507/53.533/57.860/42.701/47.198초(median49.507), first body byte median0.377초, gzip median2,819,277B, raw18,964,448B, 5,011 ticker.
- 직전 Z_FILTERED 운영 5회 median KR13.904초/US48.347초와 비교 시 이번 KR/US 완료시간은 더 짧거나 약간 길지만 운영부하·전송률이 통제되지 않아 인과 결론은 보류한다. US 첫 body byte median은0.814→0.377초로 낮았으나 total 다운로드는49.507초였고 후반 전송이 지배했다. 미국 batch 11 queries/2 waves→6/1 wave 로컬 신호는 유지하되 운영 latency 개선은 아직 입증되지 않았다. 계속 관측하고 회귀가 반복되면 batch500으로 복구한다.
- 배포 후 API 데이터와 gzip 용량은 기존 수준이며 응답 계약 위반/502는 이번 10회에서 없었다. 관련 상세 표는 운영 성능 보고서에 기록했다.
### 2026-11-27 — 미국 일봉 export batch 크기 500→1,000 후보
- 근본 병목/목적: 실제 로컬 API timing에서 미국은 5,012 ticker라 batch500 기준 11개 candle 조회가 2 wave로 실행됐다. gzip stream은 DB 조회와 동시에 내려가지만 두 번째 wave 대기가 남는다. 미국에 한해 batch1,000이면 6개 쿼리를 1 wave로 완료할 수 있어 운영 GET 시간을 줄이는 후보로 평가했다. 국내 2,352 ticker는 500 설정을 그대로 유지한다.
- 로컬 실측: `scripts/dev-server.mjs` + `.env.local`의 로컬 DB에서 baseline KR/US 각 5회, 최종 config KR500/US1000 각 6회 GET. 첫 호출 제외 client median KR586→577.4ms(-1.5%; 국내 설정·데이터는 동일해 노이즈 범위), US1,016.6→989.5ms(-2.7%). US raw JSON 19,359,853B와 gzip 2,797,603B 불변, 5,012 ticker. paired 일부 실행 중 source reload 등 로컬 조건 변동이 있으므로 이를 운영 효과로 간주하지 않는다.
- 서버 timing 비교: US baseline `batchQueryCount=11`, `batchWaveCount=2`, `batchQueryWallMs` 289–405ms 및 `totalElapsedMs` median 약927ms. 후보 `batchQueryCount=6`, `batchWaveCount=1`, `batchQueryWallMs` 259–399ms (median 약312ms), `streamDurationMs` 814–950ms (median 약846ms), `totalElapsedMs` median 약876.5ms. query wall은 줄지만 stream/전체 개선은 작고 운영 검증이 필요하다.
- 회귀 감지: `app/api/public/daily-export/kr/route.test.ts`에서 KR500/US1000의 payload 경계, 모든 항목 ticker·marketCap·daily와 20봉 상한, 미국 6 query 동시성/단일 wave를 자동 확인한다. targeted test 15/15 통과. API gzip 해제 후 원문과 JSON schema·returnedCount·최대20봉 확인도 local GET에서 통과했다.
- 위험/판정: query parameter는 US에서 2배 커져 각 query CPU/메모리 peak가 커질 수 있으나 동시 실행 수는 10에서 최대6으로 감소한다. DB 총 CPU가 증가하거나 운영 GET latency가 회귀하는지 확인한다. US 후보만 코드에 적용하고 전체 deploy:verify 후 OCI 배포한다. 배포 뒤 운영 공개 GET을 시장별 5회 이상 검사하고 KR baseline·US 이전 운영 표본과 속도·bytes를 비교하되 workload/network 편차를 분리한다. 회귀 시 즉시 US batch500 복구를 검증·배포한다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 성능 보고서, 본 로그. gzip level9+Z_FILTERED+64KB, 공개 API schema 및 국내 batch500은 변경하지 않는다.
### 2026-11-27 — gzip level8 + Z_FILTERED 후보 기각
- 목적/범위: gzip 형식·최대20봉·티커/시가총액/일봉 응답을 유지하면서 level9→8로 낮추면 전체 API가 빨라지는지 평가했다. 운영 변경은 하지 않았다.
- 검증: 로컬 `scripts/dev-server.mjs`와 `.env.local` DB를 이용해 KR/US 전체 export를 각 6회 이상 호출했고 모든 응답 HTTP200, gzip 해제/JSON parse, 항목별 ticker·marketCap·daily, returnedCount 일치, 최대20봉을 통과했다. 첫 호출 제외 단순 warmed 중앙값은 KR539.5ms/US1,006.7ms였다. 이어 baseline/candidate를 같은 서버 안에서 교차 8회씩 비교했다. KR level9/8 중앙값751/776.4ms(8은 3.4% 느림), US1,199.8/1,190.7ms(8은 0.8% 빠름; 변동폭 안)으로 공통 속도 개선이 없었다. 두 레벨 모두 gzip 중앙값 KR1,178,244B/US2,797,603B로 같았고 raw JSON SHA-256도 시장별 전 회차 동일했다. level9는 XFL2, level8은 XFL0으로 gzip header metadata가 바뀐다.
- 판정/위험: 사용자의 속도 최우선 기준에 따라 일관된 전체 API 개선이 입증되지 않은 level8은 기각하고 level9+Z_FILTERED+64KB를 보존한다. XFL이 바뀌어 기존 XFL2 assertion도 level8 채택 시 명세 기반으로 조정해야 하지만, 현재 변경하지 않는다. 후보는 임시 적용 뒤 원복했으며 배포하지 않았다. 로컬 수치는 운영 경로의 인과 효과가 아니며 운영 phase timing 접근은 불가하다.
- 변경/검증/배포: 확인 및 문서화 파일 `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 본 보고서와 `DEVELOPMENT_LOG.md`. 기능 코드 및 Next 자동생성 파일은 HEAD로 복구, `git diff --check` 성공. 이 문서 기록은 전체 `npm run deploy:verify` 후 커밋/OCI 배포하며, 다음에는 DB batch/query 병목 등 실제 endpoint 단계 timing에서 큰 구간을 겨냥한다.
### `Z_FILTERED` 운영 배포 검증
- 변경 commit `28f245e0`, OCI Deploy OCI run `45889015154` success. level9 및 chunk64KB를 유지하며 `Z_FILTERED` 전략을 적용했다.
- 운영 GET 각 5회 모두 HTTP200/application-gzip, Content-Encoding 없음, gzip XFL2, full gunzip/JSON/필수 ticker·marketCap·daily 필드/returnedCount/max20 계약을 통과했다. KR times14.950/10.408/17.750/13.904/10.114s median13.904s; first-byte median0.273s; gzip median1,219,342B/raw8,907,188B/ticker2,337. US46.502/52.735/48.566/47.499/48.347s median48.347s; first-byte median0.814s; gzip median2,820,137B/raw18,964,448B/ticker5,011.
- 직전 default strategy+64KB 운영 median(KR4.367s/US42.947s)보다 이번 전체시간은 길다. 그러나 운영경로가 비통제이고 first-byte 이후 계산 throughput이 KR299→89KB/s, US67→59KB/s로 달라서 전략의 인과 회귀로 확정하지 않는다. payload bytes는 약 KR1.94%, US0.87% 감소했고 local paired API median은 KR1.0%/US3.3% 단축됐다. 현 후보를 유지하며 다음 운영 sample을 더 수집한다.
- 다음 후보: level8+filtered direct compressor median KR315.44ms/US546.99ms 대비 level9+filtered KR352.32/542.09ms, gzip bytes는 양쪽 약50B 차이. Full API 효과 미측정, XFL2→0 변동 위험이므로 route-level A/B + XFL test 변경이 필요하기 전에는 production 코드에 적용하지 않는다.
- 운영 성능 보고서에 전체 표본 및 원인 한계 추가. 운영 결과 포함 변경 뒤 full deploy:verify/문서 카탈로그 검사/OCI 배포를 마친다.
### 2026-11-27 — gzip `Z_FILTERED` strategy 속도 후보
- 목적/범위: 공개 일봉 export에서 기본 zlib strategy보다 level9 압축 처리와 wire bytes가 줄어드는지 확인했다. zlib 공식 설명상 `Z_FILTERED`는 기본보다 Huffman 코딩을 늘리고 문자열 매칭을 줄이는 전략이며, gzip 단일 형식·JSON 스키마·max20·level9·64KB chunk는 유지한다.
- 직접 압축 실험: 실제 운영 payload raw를 각 전략 7회 압축. default→`Z_FILTERED` CPU median KR342.74→330.16ms(-3.7%), US596.55→546.68ms(-8.4%). gzip bytes KR1,243,440→1,219,332(-1.94%), US2,843,591→2,818,702(-0.88%). `HUFFMAN_ONLY`/`RLE`는 각각 약5.37/11.57MB로 팽창하고 `FIXED`는 US3.68MB로 불리해 제외했다.
- 동일 로컬 API/DB 비교: strategy 기본과 후보 각 시장 6회, 첫 compile 제외. client total median KR628.678→622.125ms(-1.0%), US1,022.514→988.358ms(-3.3%). gzip KR1,201,818→1,178,244B, US2,828,164→2,797,603B. raw bytes KR8,966,992/US19,359,853은 같고 baseline/candidate decompressed JSON의 시장별 SHA-256이 동일했다. 모든 응답 gzip decode, HTTP 200, ticker/marketCap/daily 필드, returnedCount와 candle 개수, max20 검증. route tests 13/13 통과.
- 위험/감지/다음: 로컬 개선폭은 작고 통제된 operating A/B가 아니며 `Z_FILTERED`는 공식 설명에서 filter/predictor data용으로 정의되어 JSON 효과는 경험적이다. 전체 `npm run deploy:verify` 후 이 strategy를 운영 배포하고 동일 조건 공개 GET 5회/market으로 확인한다. gzip XFL2 및 decompress contract는 유지해야 한다. 운영 완료시간 회귀/이득 부재면 기본 strategy로 복구 배포한다. 공식 출처는 Node.js v22 zlib docs와 zlib manual. 파일은 `lib/public-daily-export.ts`, route test, 성능 보고서, 본 로그.
### gzip 64KB 청크 후보 배포 후 운영 확인
- 커밋 `b327ab57`, OCI Deploy OCI run `45884140595` 성공 및 release 활성화 완료. 코드 변경은 `createGzip` 출력 chunkSize 64KB 하나다.
- 운영 API 결과: KR 5회 11.365/6.805/3.908/4.162/4.367초, median4.367초, first-byte median0.209초, gzip1,243,447–1,244,017B, raw8,907,188B, 2,337 ticker. US 51.713/45.181/44.797/40.143/42.547초, median44.797초, first-byte median0.400초, gzip2,844,472–2,845,348B, raw18,964,448B, 5,011 ticker. 모두 HTTP200/application-gzip, Content-Encoding 없음, XFL2 및 gunzip/JSON/필수 필드/returnedCount/최대20봉을 통과했다.
- 비교: 직전 level9 기본16KB 5회 median KR8.003초/US42.947초 대비 관측 KR45.4% 짧고 US4.3% 길다. 통제되지 않은 운영 부하로 원인 효과 판정 불가. Local full API median은 KR629→614ms, US1,202→1,008ms였고 gzip size 불변. 로컬 zlib direct stream에서는 level9 CPU median KR341.99→337.24ms, US578.16→571.89ms, data event median KR110→53/US247→117이었다.
- 위험/다음: chunkSize 증가로 요청당 output slab 48KB 추가. US 첫 byte 4.079초 outlier를 포함한 이번 sample은 운영 지연이 여전히 네트워크/서버 부하 영향을 받음을 보여준다. 64KB 코드는 두 시장 로컬 반복 개선과 unchanged gzip bytes를 이유로 유지하되, 이후 운영 sample에서 US 회귀가 반복되면 16KB로 복구 또는 시장별 설정을 실험한다. 운영 단계 로그 접근이 가능해지면 DB/query·gzip stream·transfer를 별도로 추적한다. 전체 배포 검증은 통과했고 운영 API는 배포 후 확인 완료.
- 보고서 `docs/operations/public-daily-export-performance-report.md`에 deploy run·전체 표본·비교 한계를 추가했다.
### 2026-11-27 — 공개 gzip API zlib 출력 청크 64KB 후보
- 목적/변경: gzip level9와 출력 형식을 유지하며 기본 zlib output chunkSize 16KB를64KB로 높여 변환과 Web stream enqueue 호출 수를 줄였다. 변경은 `lib/public-daily-export.ts`의 `createGzip` 옵션 한 곳이다. 공식 [Node.js v22 zlib 문서](https://nodejs.org/download/release/latest-v22.x/docs/api/zlib.html#class-options)는 chunkSize 기본값16KB를 명시한다.
- 직접 압축 실험: 운영 gzip 본문 raw 입력, level3/9 × chunkSize16/64/128KB, 조합별 5회. level9 16→64KB 중앙 CPU시간 KR341.99→337.24ms, US578.16→571.89ms; gzip bytes 동일; output chunk event 중앙값 KR110→53, US247→117. 128KB는 KR 개선은 더 컸지만 US level3가112.06→131.71ms로 느려져 시장 공통 후보에서 제외했다.
- API 측정/검증: `scripts/dev-server.mjs`와 실제 로컬 DB 사용. 후보 6회/시장 중 첫 compile/cold 제외 전체 HTTP median KR614ms, US1,008ms, 이전 16KB level9 로컬 baseline KR629ms/US1,202ms 대비 약2.4%/16.1% 짧음. gzip/raw bytes는 KR1,201,818/8,966,992B, US2,828,164/19,359,853B로 기존 level9 계약값과 동일했다. 모든 응답 gunzip/JSON/schema, ticker·marketCap·daily 필드 존재(시총 값은 null 허용), returnedCount 일치, 최대20봉 확인. 대상 API route 테스트13/13 통과.
- 위험/자동 감지: 압축 엔진 output event 감소가 작은 로컬 KR 효과와 더 뚜렷한 US 개선 신호를 냈으나 controlled paired baseline 및 운영 측정은 남아 있다. chunkSize 증가로 compressor output slab당 추가 메모리48KB/request가 생길 수 있다. 고동시성 메모리 효과와 operating full-response median을 추적한다. 배포 후 HTTP/gzip/JSON/20봉 계약과 server first byte/full transfer 시간을 재확인하고 불변 또는 회귀면16KB로 복구한다.
- 작업 범위: 기능 변경 `lib/public-daily-export.ts`; 운영 성능 보고서와 본 로그에 실험·위험·감지 절차를 추가한다. 전체 `npm run deploy:verify` 성공 후 커밋·OCI 배포 및 운영 검증을 마친다.
### 2026-11-27 — gzip level9 운영 배포·검증
- 변경: 티커·시가총액·최대20 일봉 공개 gzip API 양쪽을 level9로 고정해 전송 크기를 줄이는 후보를 배포했다. 커밋 `09120e9b`; OCI Deploy OCI run `45879443438` 성공. 변경 파일은 `lib/public-daily-export.ts`, KR route 테스트, 운영 성능 보고서 및 개발 로그다.
- 검증: 배포 전 `npm run deploy:verify` 성공(283개 테스트 파일 통과/1개 skip, 1,651개 테스트 통과/3개 skip, typecheck, production build, standalone runtime, Chrome desktop/mobile smoke, 문서/API/security/cron 감사). 배포 뒤 공개 API KR·US 각각 5회 순차 호출; 모두 HTTP200, application/gzip, gzip XFL=2, gunzip/JSON, ticker·marketCap·daily 필드, returnedCount 일치, 최대20봉 확인.
- 운영 실측: KR 전체 다운로드 5.391/8.003/7.407/14.165/9.618초(중앙값8.003초), gzip 1,243,447–1,244,017B, raw8,907,188B, 2,337 ticker. US 42.658/67.703/42.947/33.761/47.168초(중앙값42.947초), gzip2,844,043–2,845,848B, raw18,964,448B, 5,011 ticker. Content-Encoding은 없었다. 이전 level3/2의 단일 운영 표본 KR9.929초/US28.148초보다 KR은 19.4% 짧고 US는 52.5% 길어 속도 효과는 미확정이며 시장별 일관 개선은 확인되지 않았다. gzip 전송 크기는 약18.4%/19.7% 감소했다.
- 원인·위험·재발 감지: 더 높은 압축은 CPU를 추가 사용하고 운영 wire bytes를 줄이지만 end-to-end 시간이 개선된다는 보장은 없다. US 운영 시간 편차와 level9 local CPU 비용이 위험이다. 작은 비통제 운영 표본의 중앙값은 인과 근거가 아니다. 보고서에 표본 전체와 한계를 보존한다. 앞으로 배포별 운영 GET의 전체 시간·first byte·gzip bytes·계약을 반복 기록하고, 반복해서 느려지는 시장은 더 낮은 level/전송경로 변경을 비교 후 배포한다.
- 문서: `docs/operations/public-daily-export-performance-report.md`에 workflow와 운영 10회 샘플을 기재. 변경 파일/범위, 검증 및 배포 상태 기록 완료.
### 2026-11-27 — 운영 전송 구간 기반 gzip level9 속도 후보
- 목적/범위: 운영 API의 전체 GET 시간 중 전송에 걸리는 시간이 지배적인지 확인하고, gzip 단일 형식 및 JSON 계약을 유지하면서 네트워크 바이트 감소가 API 호출 완료를 앞당길 수 있는지 평가했다. 현재 level은 KR3/US2이며 후보는 양쪽 level9다. Node.js v22 공식 문서는 gzip level이 압축률과 완료시간을 함께 높이는 trade-off라고 설명한다(https://nodejs.org/download/release/latest-v22.x/docs/api/zlib.html). RFC 1952는 XFL=2를 maximum compression으로 정의한다(https://www.rfc-editor.org/rfc/rfc1952).
- 운영 기준 측정: 무인증 GET KR HTTP200 9.929초, first byte0.653초, gzip1,524,637B/raw8,907,188B, ticker2,337. US HTTP200 28.148초, first byte0.379초, gzip3,542,002B/raw18,964,448B, ticker5,011. 다운로드 속도는 KR153,548B/s, US125,835B/s였다. 완료시간 대부분이 first byte 뒤의 수신 구간이었다. 각 응답은 gunzip/JSON, 필수 ticker/marketCap/daily, returnedCount/max20 계약을 통과했다. 표본 1회씩으로 운영 속도 분포를 대표하지는 않는다.
- 로컬 압축 비교: 현재 payload를 gzipSync로 각 level 8회 비교했다. level3→9 KR median compression CPU 42.53→349.25ms, 크기1,506,858→1,201,811B; US level2→9 78.97→483.06ms, 크기3,491,020→2,828,157B. 현재 운영 GET 크기·전송 속도에 적용하면 약2.10초(KR)/5.67초(US) 절감 예상이며 압축 CPU 차이는 약0.31/0.40초다. 이는 로컬 CPU·payload와 운영망을 결합한 모델이지 실측 인과효과는 아니다.
- 전체 local API 후보: `gzipJsonStream`을 level9로 시험했다. 기존 level3/2 warmed HTTP median KR300/US778ms 대비 level9는 KR629/US1,202ms로 느렸고, gzip 크기는1,201,818/2,828,164B로 각각20.3%/19.0% 감소했다. 원본 payload, ticker 수, 필드, 최대20봉, returnedCount는 동일했고 gzip XFL=2였다. 느린 local link에서는 CPU 비용만 드러나지만 운영 GET은 125–154KB/s 전송으로 지배되므로 level9를 운영에 배포해 실제 완료시간으로 판정하는 후보로 채택한다.
- 위험/회귀 감지: 운영 대역폭과 서버 부하가 이 sample에서 달라지면 level9 CPU 비용이 절감된 wire time보다 커질 수 있다. 배포 후 시장별 동일 GET 반복, 전체 본문 다운로드, HTTP/gzip 해제/JSON 계약을 다시 측정하고 중앙값 및 first-byte/전체 수신 시간을 분리한다. 속도 이득이 없거나 악화하면 level3/2로 복구 배포한다. 배포 전 full `npm run deploy:verify`, 이후 OCI activation 및 운영 GET을 완료하고 이 기록을 갱신한다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 운영 성능 보고서, 본 로그. 배포/운영 검증은 후속 단계다.

### 2026-11-27 — 공개 일봉 gzip API 현행 성능 재측정 및 SQL 계획 조사
- 목적/범위: 공개 gzip 일봉 API에서 다음 속도 병목을 선택하기 위해, 현재 배포 코드의 전체 응답과 내부 단계 타이밍을 `scripts/dev-server.mjs` 경로로 다시 측정했다. API 구현/스키마는 변경하지 않았다.
- 로컬 측정: 첫 cold 요청을 제외한 5회 내부 `totalElapsedMs` 중앙값은 KR 256ms(218–327ms), US 587ms(531–740ms)였다. KR은 2,352 ticker/ gzip 1,506,865B, US는 5,012 ticker/ gzip 3,491,027B. 추가로 각 시장 응답 1개를 gunzip/JSON 파싱해 ticker·marketCap·daily 필드, returnedCount 일치, 최대20봉을 확인했다. 내부 단계 중앙값은 KR universe 5ms, DB batch wall 149ms, stream 250ms; US universe 93ms, batch wall 323ms, stream 498ms였다. 단계값은 상호 중첩할 수 있어 합산 지연으로 해석하지 않는다.
- 운영 측정: 이번 조사에서는 새 운영 요청을 실행하지 않았다. 최신 기존 운영 측정은 앞선 배포 기록에 보존된 값을 유지하며, 로컬 결과를 운영 성능으로 대체하지 않는다.
- 조사 결과: 로컬 DB가 `localhost:5432`임을 `.env.local` 우선 로딩으로 확인했다. 처음 만든 representative 쿼리는 endpoint SQL과 달라 병목 근거로 채택하지 않았고, 이후 실제 route에서 사용하는 prepared batch SQL과 500개 ticker 입력을 포착해 read-only transaction의 `EXPLAIN ANALYZE`에 그대로 재사용했다. 한 batch 실행은 KR 63.4ms(9,569 shared-hit/990 read blocks), US 83.1ms(6,994 hit/3,134 read)였다. 양 시장 모두 `*_instrument_universe_candles_lookup_idx`로 `(market,code,timeframe)`를 찾고 ticker당 20개 recent row를 읽었다. 이 단일 batch 표본은 로컬이며 운영 DB 성능으로 일반화하지 않는다. PostgreSQL 공식 문서는 `ANALYZE`가 SELECT를 실제 실행하고 프로파일링 overhead가 있을 수 있다고 명시한다(https://www.postgresql.org/docs/current/sql-explain.html).
- 판정/근본 원인/남은 위험: 현재 로컬 warmed 경로에선 candle batch DB wall과 gzip stream이 모두 비용이며 US의 단일 병목이라고 확정할 수 없다. 운영 end-to-end 측정은 계속 서버·네트워크 변동 영향을 받으며 운영 단계 로그 접근이 없다. SQL/index/concurrency 변경을 정당화할 정확한 production 단계 근거는 이번 조사에서 얻지 못했으므로 기능 코드를 수정·배포하지 않는다.
- 재발 감지/다음 개선: route 테스트는 SQL quality predicate, ticker batch 경계 및 응답 contract를 유지한다. 다음 SQL candidate는 정확한 route batch plan에서 20행 candle index scan이 아닌 다른 안정적 비용이 보일 때만 선택한다. 운영 로그에서 개인정보 없는 시장별 duration/count를 회수할 경로를 확인한다. 후보 채택 시 전체 응답·gzip 바이트·JSON contract와 `npm run deploy:verify`, OCI activation, 운영 GET 검증을 반복한다.
- 추가 속도 후보 검토: 상위 500행 결과 정렬을 요청 순번(`WITH ORDINALITY`) 정렬로 바꾸는 후보를 적용했으나 전체 응답 속도 이득이 없었다. 기존 기준 6회 중 첫 요청 제외 median은 KR300ms/US778ms, 후보는 KR411ms/US779ms였다. 양쪽 payload/gzip 크기·종목수는 동일했고 HTTP200, gunzip/JSON/최대20봉/returnedCount 검증을 통과했다. SQL text가 바뀌므로 prepared statement 이름을 v2로 시험했다. 후보는 즉시 복구했으며 운영 배포하지 않았다.
- 실험 중 오류와 재발 방지: 첫 임시 SQL은 `WITH ORDINALITY`를 `jsonb_to_recordset` 컬럼 정의와 직접 결합해 PostgreSQL 42601/HTTP500을 냈다. `ROWS FROM(...) WITH ORDINALITY` 구문으로 고친 뒤 관련 route 테스트 15/15 및 실제 route GET을 확인했다. Mock route 테스트만으로는 DB 문법 오류를 잡을 수 없으므로 SQL 변경은 local API 실요청을 반드시 거친 다음 성능 비교한다.
- 추가 속도 후보 검토: 날짜 유효성 조건에서 연도 4자리의 반복 integer 변환을 고정 ASCII 범위 비교(`COLLATE "C" BETWEEN '00010101' AND '99991231'`)로 대체하고 month/day 및 Gregorian leap-year 검사는 그대로 두는 후보를 조사했다. Gregorian 400년 주기와 날짜 경계·비정상값을 포함한 184,815개 입력에서 기존 predicate와 결과가 100% 같았고, 실제 KR/US API에서 포착한 각 500-key batch SQL도 기존과 후보 `item_json` 500행이 각각 완전히 같았다.
- 속도 판정: 같은 연결에서 기존/후보 SQL을 교차 8회 실행하고 첫 회를 제외한 중앙값은 KR 64.09ms→66.68ms(+4.0%), US 74.40ms→72.51ms(-2.5%)였다. 표본 방향이 시장별로 달랐고 작은 US 차이는 반복 편차보다 안정적이라고 볼 수 없어 predicate를 변경하지 않았다. PostgreSQL collation이 비교 연산자 정렬 순서에 영향을 줄 수 있으므로 명시 C collation을 썼으며 공식 근거는 https://www.postgresql.org/docs/current/collation.html 이다. API code는 변경·배포하지 않았다.
- 추가 인덱스 경로 검토: 현재 positive-volume partial covering index를 활용하면서 `volume=0` 봉을 별도 UNION branch로 보존하는 exact 500-key SQL 계획을 read-only `EXPLAIN ANALYZE`로 비교했다. 로컬 API 데이터에는 zero-volume candle이 KR 347/46,996, US 747/99,486개 있어 이 봉을 제거할 수 없다. 기존 plan KR 71.3ms/US 79.4ms였으나 split 후보는 KR 1,048ms(+14.7x), US 4,833ms(+60.8x)였다. zero branch에 쓸 전용 index가 없어 ticker별 전체 lookup index를 훑었고 shared block reads는 KR 13,129, US 52,100까지 증가했다. 후보는 기각했고 schema/index/code를 수정하거나 배포하지 않았다. 새로운 zero-specific index도 추가 크기·유지 비용 대비 positive scan heap fetch가 남아 현 단계에서 검증 근거가 부족하다.
- 변경 확인 대상: `DEVELOPMENT_LOG.md`, `docs/operations/public-daily-export-performance-report.md`. 검증: 로컬 KR/US 각 6회 반복 측정 및 추가 각 1회 gzip/JSON 계약 검증. 커밋/푸시/배포하지 않았다(기능 변경 없음).
### 2026-11-26 — zlib memLevel 성능 후보 기각
- 목적/범위: 공식 Node.js zlib의 메모리 tradeoff를 근거로 기본 `memLevel: 8`에서9로 높이는 속도 후보를 로컬 API에서 비교했다. 구현은 임시 수정 후 `createGzip({ level })` 기본 설정으로 복구했다.
- 측정/검증: 로컬 API 시장별 6회 요청, 첫 cold/compile 제외한 5회 warmed median KR344ms/US862ms였다. 같은 경로 기본값 baseline KR350ms/US706ms 대비 KR1.7% 짧지만 US22.1% 길었다. gzip 크기 KR1,506,947→1,504,980B, US3,493,095→3,488,107B; raw bytes/종목 수(2,352/5,012)/JSON fields/returnedCount/max20/XFL0은 유지됐다.
- 판정/위험/다음: US 회귀와 미미한 크기 이득, 동시 요청당 약128 KiB 추가 메모리 비용 때문에 후보를 기각했고 운영 배포하지 않았다. 코드 기본 설정을 복구했다. 운영 DB/network 구간 시간을 읽을 수 있는 OCI 로그 접근이나 동일 조건 운영 반복을 확보해 compression CPU와 전송 영향을 분리한다. 보고서에 결과를 기록했다. 공식 근거: Node.js v22 zlib memory usage tuning (https://nodejs.org/download/release/latest-jod/docs/api/zlib.html#memory-usage-tuning).
### 2026-11-26 — zlib 출력 버퍼 크기 성능 후보 기각
- 목적/범위: 응답 gzip 형식과 API payload를 유지하면서 zlib 출력 callback을 줄이기 위해 Node 공식 기본 chunkSize 16 KiB와 후보 64 KiB를 비교했다. 구현은 임시 수정 후 즉시 16 KiB 기본값으로 복구했다.
- 측정/검증: 로컬 Next API/DB 전체 응답 각각 5회에서 후보 warmed median은 KR357ms/US735ms, 기준은 KR350ms/US706ms로 약2.0%/4.1% 느렸다. 압축/원본 크기는 KR1,506,947/8,985,808B, US3,493,095/19,399,949B로 동일했다. HTTP200, gunzip/JSON, ticker·marketCap·daily, returnedCount 일치, 최대20봉, XFL0을 검증했다.
- 판정/위험/다음: 후보 기각, 기능 코드는 기본 설정으로 복구했고 운영 배포하지 않는다. 로컬 결과에서 큰 slab의 개선은 나타나지 않았다. 운영 API가 KR32.342초·US75.861초였던 점과 로컬 1초 미만 결과의 차이는 운영 network/server context 병목 가능성을 시사하지만 원인은 미확인이다. OCI Nginx request/upstream/bytes 로그 또는 완료 구조화 timing 로그를 회수해 분리 측정한다. 변경 파일은 성능 보고서와 DEVELOPMENT_LOG.md다. 공식 참조: Node.js zlib API (https://nodejs.org/api/zlib.html).
### 2026-11-26 — gzip write 실험 배포 후 운영 API 확인
- 커밋·배포: 실험/기각 기록 커밋 `c3ac04f3`를 `oci`에 push했다. OCI run `45818683801`의 verify, standalone packaging, upload, activation 모두 success로 확인했다. 기능 코드는 write 묶음 50으로 복구되어 있어 배포 동작은 코드 성능 변경을 포함하지 않는다.
- 운영 확인: 활성화 후 공개 API 전체 응답을 GET해 gzip 해제 및 ticker·marketCap·daily, 최대20봉, HTTP200/application-gzip/Content-Encoding 없음/no-store/XFL0을 검사했다. KR 32.342초/1,525,055B gzip/8,925,884B raw/2,337 ticker, US 75.861초/3,543,788B gzip/19,004,536B raw/5,011 ticker였다. Health API도 HTTP200.
- 해석/남은 위험: 시장별 1회이므로 성능 방향 판단이나 회귀 주장에 사용하지 않는다. 간헐적인 긴 운영 전송시간의 원인은 여전히 분리되지 않았다. 운영 단계 로그가 확보되기 전 DB batch/concurrency 변경은 보류한다. 변경 파일은 운영 성능 보고서와 본 로그이며 후속 문서 반영분은 커밋·푸시·배포 전 검증한다.
### 2026-11-26 — gzip JSON write 묶음 크기 성능 후보 기각
- 목적/범위: 사용자 요청대로 속도 우선을 유지하며 작은 gzip stream write 호출을 줄일 수 있는지 검사했다. `lib/public-daily-export.ts`의 pending item 묶음을 임시로 50→250으로 바꾸고 로컬 API를 각 시장 5회 전체 다운로드했다.
- 측정 결과: 기존 50개 묶음 warmed median KR0.350초/US0.706초, 250개 후보 KR0.334초/US0.753초다. KR 차이는 16ms로 작고 US는 6.7% 느려져 안정적인 개선이 아니다. gzip/raw bytes와 ticker 수는 KR1,506,947/8,985,808B·2,352개, US3,493,095/19,399,949B·5,012개로 동일했고 HTTP200, gzip 해제, JSON 파싱이 성공했다.
- 판정/원인/위험: write 묶음 변경은 속도 우선 기준으로 기각하고 50으로 복구했다. 운영 배포하지 않았다. 로컬 dev server의 compile/DB/환경 변동과 작은 표본으로 수 ms 차이는 이득으로 간주할 수 없다. 운영 완료시간도 네트워크·부하 변동이 커서 단계 로그 접근 없이 DB 동시성 변경은 위험하다.
- 회귀 감지/다음 단계: API smoke에서 전체 gzip 본문 해제, 필수 JSON 및 ticker 수, 최대20봉을 확인한다. 운영 로그의 DB 단계별 타이밍 접근이 가능해지면 병목 phase를 확인하고 한 변수만 후보화한다. 변경 파일은 운영 보고서와 본 개발 로그이며 기능 코드는 원상복구됐다. 커밋·푸시·배포하지 않았다.
### 2026-11-26 — gzip 레벨 3에서 4 운영망 전송 최적화 후보
- 목적/범위: gzip 단일 압축 계약을 유지하면서 압축 수준을 3에서 4로 올려 큰 파일 전송량 감소가 API 완료시간을 줄이는지 비교한다. 공개 API payload/schema와 gzip 형식은 바꾸지 않는다.
- 로컬 재현: scripts/dev-server.mjs/동일 로컬 DB에서 US 5,012 ticker를 호출했다. 레벨3 기준 0.975/0.873/0.685/0.712초(후반 warmed 3개 중앙값 0.712초), 3,403,223B. 레벨4 candidate 0.916/0.811/0.690/0.744/0.672/0.801초(앞 cold/hot 2회 제외한 4회 중앙값 0.744초), 3,200,714B(-5.95%). 압축·전송이 빠른 로컬에서는 완료시간 개선을 보이지 않았고 분산이 후보 효과보다 커 운영 미확정이다.
- 압축 CPU/크기 분리 측정: 원본 19,399,949B로 gzipSync 각 레벨 4회 비교 시 level3 median98.555ms/3,403,217B, level4 median119.695ms/3,200,707B, 즉 추가 약21ms CPU로 약6% 바이트 절감이다. 운영망에서는 전송 절감이 추가 CPU보다 큰지 배포 후 동일 API 반복으로 판단하고, API 순차 중앙값이 명확히 나빠지거나 시간 이득 없이 CPU만 늘면 level3으로 복구한다.
- 변경 파일: `lib/public-daily-export.ts`, 본 로그, 운영 성능 보고서. gzip XFL은 양쪽 모두0. 커밋/OCI 배포 전에 전체 deploy:verify 및 gzip JSON contract를 검증하고, 운영 비교 후 채택/복구 결정을 남긴다.

### 2026-11-26 — 공개 일봉 gzip API 구형 스키마 경로의 봉 계산 최적화 후보
- 목적/범위: gzip 일봉 API 속도 개선 후보로 `lib/public-daily-export.ts`의 `trading_value` 컬럼 부재 fallback을 확인했다. US 봉 테이블 생성 마이그레이션(V67)에는 해당 컬럼이 없고 현재 fallback은 각 봉을 `to_jsonb(c)`로 변환해 컬럼을 검사한 후, 없으면 `close * volume`을 계산한다. 스키마 조회가 컬럼 부재를 반환하면 해당 변환/검사를 건너뛰고 기존과 같은 `close * volume` 식을 직접 사용하도록 변경했다. 컬럼이 존재하는 DB는 기존 값 검증 및 fallback 분기를 그대로 사용한다.
- 로컬 기준/후보 측정: scripts/dev-server.mjs로 띄운 로컬 API에서 같은 5,012 ticker payload를 순차 측정했다. 기존 SQL warmed 0.960/0.715/0.706초(중앙값 0.715초; 최초 4.537초 cold 제외), 수정 SQL 첫/hot 0.938초 제외 후 0.704/0.684/0.737/0.691/0.671초(중앙값 0.691초, 약 3.4% 단축). gzip 크기는 양쪽 모두 3,403,223B, candidate HTTP200/XFL0/no-store, JSON 및 봉 상한20 계약 통과. 차이는 작아 로컬만으로 개선을 확정하지 않았다.
- 회귀 감지 및 배포: `app/api/public/daily-export/kr/route.test.ts`의 구형 스키마 분기 검증이 `close * volume` 직접 식과 JSON 변환 제거를 검사한다. 대상 11개 및 전체 `npm run deploy:verify` 통과(283 test files pass/1 skip, 1,649 tests pass/3 skip, typecheck, docs/API/security/cron audits, build, standalone HTTP/Chrome smoke). commit `690607e7`, OCI run `45774860704` 최종 success.
- 운영 후속 실측: 배포 완료 후 `stockman.r-e.kr`에서 순차 HTTP GET, 전체 응답 gzip 해제 및 JSON 필드/봉-count/20봉 검사했다. KR 12.371/10.566초, 2,337 ticker, gzip1,524,715/1,524,910B, 8,925,884B uncompressed, 모든 종목20봉. US 45.618/59.056/36.585/45.042/36.746초(median45.042초), 5,011 ticker, gzip3,464,650–3,464,986B, 19,004,536B uncompressed, 0–20봉. 모든 응답 HTTP200, `application/gzip`, Content-Encoding 없음, no-store, XFL0 및 JSON contract valid. 직전 배포의 US 표본 34.304/42.522초보다 candidate 표본 중앙값이 높지만 직전 표본은 2개뿐이고 호출시 서버부하를 통제하지 않아 단일 SQL 변경의 인과적 악화/개선을 판단할 수 없다. API 출력과 gzip 크기는 동일하며 SQL 연산량이 감소하므로 후보를 유지하되 운영 속도 이득은 미입증으로 기록한다.
- 근본 원인/위험: 컬럼 부재 상태에서도 매 봉 row를 JSON 변환했던 불필요한 CPU 경로를 제거한다. `close * volume`은 기존 컬럼 부재 시 fallback과 의미상 동일하다. API 응답 계약을 확인했으나 운영 시간 개선은 잡음이 큰 표본만으로 확인되지 않아, 후속 변경에서 query/gzip/download 단계 계측이 필요하다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 본 로그, 운영 성능 보고서. 코드 변경 commit/run 및 운영 GET은 완료했다. 최종 운영 실측을 기록한 문서 커밋/배포 상태는 별도 기록한다.

### 2026-11-26 — US 일봉 export batch 크기와 동시성 재측정 후보
- 목적/범위: 운영 US gzip API 완료시간을 줄이기 위해 US만 ticker batch를 500에서 1,000으로 늘리고 동시 query 상한을 10에서 6으로 낮추는 후보를 로컬 API에서 비교했다. KR은 기존 batch500/concurrency5를 유지한다.
- 근거: US 적격 ticker 5,011개는 기존 batch500에서 query 11개가 필요했고 concurrency10은 2 wave다. batch1,000/concurrency6이면 query 6개가 한 wave로 실행되고 공유 pool max10 중 4개 연결을 남긴다.
- 로컬 반복: 동시성 시장별 코드(기준 US500/10)에서 first/cold 제외 warmed US 5회 663/700/703/720/780ms, median 703ms. US1,000/6 후보 첫 반복 703ms 및 warmed 5회 671/672/696/702/677ms(median677ms); hot reload 이후 재측정은 첫 958ms 제외 warmed 5회 667/678/646/634/647ms(median647ms)다. 마지막 paired local run은 약 8.0% 짧았다. gzip 파일은 3,403,223B로 동일, 5,012 local ticker, 최대20봉, HTTP 200과 gunzip/JSON 검증 성공. KR은 별도 500/5 5회 warmed median412ms 대비 batch1,000/5 median428ms로 약간 느려 KR 설정은 유지한다.
- 자동 회귀 감지: route test가 KR batch500 분할, US batch1,000 분할 `[1000,1000,501]`, US 동시 query peak6, KR peak5를 검증했다. 대상 테스트 11개 통과. 전체 `npm run deploy:verify`도 통과: 283개 테스트 파일 통과/1 skip, 1,649 passed/3 skipped, typecheck, docs/API/security/cron audits, production build, standalone HTTP 및 Chrome desktop/mobile smoke.
- 운영 실측/판정: candidate `662680cb`, OCI run `45767914380` 성공 후 US sequential 3회 38.570/43.290/40.937초(median40.937초), US+KR 동시 호출 US58.764초/KR18.782초였다. 이전 운영 batch500/US concurrency10 median36.885초보다 후보가 약 11% 느렸다. 로컬에서는 약 8% 빨랐지만 운영에 재현되지 않았으므로 이 후보는 기각하고 US batch500/concurrency10으로 복구한다. 연결이 닫힌 한 초기 grouped 실험은 제외했으며 오류를 HTTP 성공 측정으로 세지 않았다. 정상 응답은 HTTP200, XFL0, no-store, gzip/JSON 및 20봉 계약과 US ticker5,011을 통과했다.
- 근본 원인/남은 위험: batch를 두 배로 키우면서 왕복 query 수와 wave 수는 줄었지만 각 query의 payload/DB 작업이 커져 per-query 완료 지연이 더해졌을 가능성이 있다. 운영 DB query phase가 직접 계측되지 않아 원인은 inference이며, 다음 후보는 운영 query latency와 gzip/전송 phase를 분리 측정해야 한다.
- 배포/복구 운영 확인: commit `1790f95b`, OCI run `45770981889`의 verify/package/upload/activation 모두 성공(최종 run success, 2026-11-26 06:56:47Z). 운영 호스트 `stockman.r-e.kr`에서 KR/US 순차 공개 GET을 각 2회 호출해 전체 gzip 해제와 JSON 필수 필드, ticker/marketCap, candles/returnedCount 일치, 최대20봉을 검사했다. KR 11.540/6.999초, 2,337 ticker, gzip1,524,715B; US 34.304/42.522초, 5,011 ticker, gzip3,464,301/3,464,587B. 모두 HTTP200, `application/gzip`, Content-Encoding 없음, `no-store`, XFL=0. 운영 표본 2회이며 부하 미통제라 batch500/10의 최적성이나 개선 인과는 주장하지 않는다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 운영 성능 보고서, 본 로그. 복구 코드 전체 검증·OCI 배포 및 운영 API 확인은 완료했다. 실측 기록을 추가한 문서 커밋의 검증·배포 상태는 별도 기록한다.

### 2026-11-26 — 공개 일봉 gzip API 운영 성능 보고서 제출
- 목적/범위: 두 차례 운영 배포 결과를 통합해 KR/US 순차·동시 운영 API 완료 시간, 응답 크기, JSON/gzip 계약, 비교 한계를 보고서로 작성했다. 문서 관리 규칙에 따라 운영 문서 카탈로그와 `docs/README.md` 인덱스에도 연결했다.
- 보고서: [`docs/operations/public-daily-export-performance-report.md`](docs/operations/public-daily-export-performance-report.md). baseline `87059c21`, 5/5 후보 `0ffb7903`, KR5/US10 후보 `edeea6ba`의 배포 run 및 측정 결과를 표로 정리했다. 최신 timestamped operating check는 2026-11-26 `05:41:16Z–05:43:01Z`; KR 19.441초·US 39.686초, 동시 KR 18.141초·US 45.152초. HTTP 200, gzip XFL=0, no-store, gzip 해제·JSON 계약·20봉 상한·ticker counts를 확인했다.
- 해석: 반복 운영 응답시간이 넓게 흔들려 동시성 변경의 확정적 인과 효과를 단정하지 않는다. US sequential은 이전 기준보다 짧은 표본이 반복됐으나 KR은 느린 표본을 포함한다. 현재 코드 KR5/US10으로 운영 중이며 다음 단계는 DB/query와 gzip/전송 시간을 분리 측정한다.
- 검증: 최신 보고서가 자동 `public/document-catalog.json`·`public/manuals/README.md`에 155번째 문서로 연결됨을 확인했다. `npm run deploy:verify` 전체 통과: 283개 테스트 파일 통과/1 skip, 1,648개 테스트 통과/3 skip, typecheck, 155개 문서 카탈로그 및 docs/API/security/cron 감사, production build, standalone HTTP 및 Chrome desktop/mobile smoke.
- 배포 확인: 문서 commit `27286606`, Deploy OCI run `45764713212` 성공. 운영에서 `/manuals/operations/public-daily-export-performance-report.md`, `/api/public/document-catalog?q=공개%20일봉%20gzip%20API&category=operations&limit=5`, `/document-catalog.json`을 각각 GET해 HTTP 200, UTF-8 markdown 및 보고서 catalog 검색 결과를 확인했다.
- 변경 파일: `docs/operations/public-daily-export-performance-report.md`, `docs/README.md`, `public/document-catalog.json`, 자동 생성 `public/manuals/README.md`, 본 로그. 무인증 운영 GET만 사용했으며 cron·쓰기 API·DB 데이터 갱신은 실행하지 않았다.

### 2026-11-26 — 일봉 gzip API DB batch 동시성 상향 후보
- 목적/범위: 사용자 지시에 따라 단일 gzip API 완료 시간을 줄이기 위해 KR/US export의 DB batch 동시성을 5에서 10으로 조정하는 후보를 실측했다. gzip level, payload 필드, no-store, batch 크기 500, 종목 자격, 20봉 상한은 유지한다.
- 근본 원인/개선: US 활성 종목은 로컬 5,012개로 500개씩 총 11 query다. 동시성 5에서는 3 wave지만 10에서는 2 wave가 된다. 공유 `pg` Pool 기본 max는 10이므로 후보는 한 요청에서 pool보다 많은 query를 동시에 점유하지 않는다.
- 로컬 API 측정: 같은 Next dev API 및 DB에서 동시성 5 warmed 순차 KR은 403/356/328ms(median 356ms), US는 825/751/747ms(median 751ms)였다. 동시성 10 후보는 KR 359/308/360/372ms(median 359.5ms), US 701/690/688/680ms(median 689ms)로 관측됐다. KR 변화는 혼합/거의 없음, US는 약 8% 단축.
- 동시 API 측정: KR+US 병렬 완료시간은 동시성 5에서 955/998/1045/961ms (median 979.5ms; 첫 1,093ms 제외), 동시성 10에서 867/928/886ms (median 886ms; 첫 1,076ms 제외)로 약 9.5% 짧았다. 표본이 작고 단일 로컬 PostgreSQL 환경이라 배포 효과를 보장하지 않는다.
- 자동 회귀 감지: route test에 5,501 ticker/12 lookup batch 입력을 추가해 peak active DB lookups가 10인지를 검증했다. 대상 테스트 9개 통과. `npm run deploy:verify` 전체 통과: 283개 파일 통과/1 skip, 테스트 1,647 passed/3 skipped, typecheck, docs/API/security/cron audits, production build, standalone HTTP 및 Chrome desktop/mobile smoke.
- 1차 운영 배포/측정: commit `0ffb7903`, Deploy OCI run `45759426955` 성공. 순차 KR 14.085/10.922/8.779초(median 10.922초), US 38.829/51.744/42.882초(median 42.882초)였다. 이전 운영 기준 중앙값 KR 8.558초, US 71.051초 대비 KR 약 27.6% 느리고 US 약 39.6% 빨랐다. 2회 KR+US 동시 호출에서 US 57.040/59.467초, KR 27.121/15.860초로 pool 경합 위험을 관측했다. 모든 응답 200, XFL=0, gzip/no-store, gunzip/JSON 계약, 티커수 KR 2,337·US 5,011, daily max20 통과. 시점별 서버 부하가 통제되지 않아 단일 표본 중앙값 비교는 인과 증거가 아니다.
- 후속 최적화: 모든 요청에서 pool 10개를 점유하지 않도록 KR 동시성은 5로 복구하고 US만 10으로 유지한다. API 테스트에서 US peak10 및 KR peak5를 각각 검증한다. 이 수정도 전체 검증·OCI 재배포 후 반복 운영 측정한다.
- 남은 위험: US 단일 호출의 운영 개선폭이 실제로 batch wave 감소에서 비롯된 것인지 환경 변동과 아직 분리하지 못했다. KR+US 동시 호출 및 타 API 동시 부하에서 US 10개 쿼리의 영향도 검증이 필요하다. 운영 측정에서 개선이 재현되지 않으면 US도 5로 복구한다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 본 로그. market-specific 동시성 변경을 검증 후 다음 배포한다.

### 2026-11-26 — gzip JSON compact serializer 실험 및 속도 기준 기각
- 목적/범위: 사용자 요청대로 응답 속도를 최우선으로 두고 SQL `row_to_json`/`array_to_json` 직렬화가 기존 `json_build_object`보다 종단 간 속도를 개선하는지 조사했다. ticker/시가총액/일봉 계약, gzip 단일 응답, 20봉 제한은 변경하지 않는다.
- 실험 결과: 로컬 전체 응답 payload 기준 gzip 크기는 KR 1,506,947B에서 1,465,078B로 2.8% 감소, US 3,403,223B에서 3,306,774B로 2.8% 감소했다. 이는 압축 전 JSON의 불필요한 공백 감소에 따른 크기 이점이다. US는 Node `JSON.stringify` 출력과 값/텍스트가 일치했고 KR은 float8 시가총액의 지수 표기만 달라 JSON 파싱 수치는 동일했다. 압축 전 수치 타입을 바꾸는 추가 변환은 double 정밀도를 손상할 수 있어 배제한다.
- 속도 판단: 직전 SQL 사전 직렬화 구현의 warmed 로컬 median(KR 390ms, US 957ms)보다 후보의 검증 가능한 전체 호출 median 및 운영 개선 근거를 확보하지 못했다. 운영 배포본을 1회씩 read-only GET한 결과 KR 1,524,715B/US 3,464,687B, gzip XFL=0, HTTP 다운로드 성공이었다. 해제 JSON은 각각 2,337/5,011 종목, 봉 0–20개(국내는 20개), gzip 해제 후 파싱 성공. 한 번의 운영 표본만으로 후보의 속도 효과를 비교할 수 없고, 다운로드 크기 절감만으로 속도 우선 목표를 입증하지 못하므로 compact serializer 코드는 기각하고 기존 SQL 직렬화 구현을 유지한다.
- 회귀/검증: `app/api/public/daily-export/kr/route.test.ts`의 기대값을 실제 `json_build_object` 경로로 복구하고 대상 테스트 8개 통과, `git diff --check` 통과. 개발 서버를 종료하고 생성 파일은 HEAD 내용으로 복원했다.
- 남은 위험/다음 개선: 운영 응답 표본이 시장별 1회라 p50/p95와 서버 부하 영향을 분리하지 못한다. 다음 속도 개선은 압축 크기만으로 채택하지 않고, 같은 시점의 반복 종단 간 측정 또는 DB/직렬화/압축 단계별 계측으로 이득을 입증한다. 배포 코드 변경이 없으므로 이번 실험은 커밋·푸시·배포하지 않는다.
- 변경 파일: `app/api/public/daily-export/kr/route.test.ts`, 본 로그. 기능 코드는 배포본과 동일하게 복원됨.

### 2026-11-26 — gzip 일봉 API 속도 우선 최적화와 운영 측정
- 목적/범위: 사용자 지시에 따라 종단 간 응답 속도를 우선 최적화한다. 무캐시·gzip 단일 파일·공개 무인증·ticker/marketCap/daily 필드·종목당 일봉 최대 20개와 활성 COMMON_STOCK 필터는 유지했다.
- 구현: `lib/public-daily-export.ts`에서 gzip 레벨을 9에서 3으로 낮추고, 종목 50개 JSON write 묶음과 500 ticker DB batch를 적용했다. 동시 DB query 5개, 5초 heartbeat flush를 유지했고 50종목마다 수행하던 강제 flush를 제거했다. 레벨 1은 같은 API payload에서 압축을 조금 더 빨리 했으나 파일이 커졌다. level 3는 level 1 대비 압축 시간이 KR 6.32ms, US 23.15ms 늘고 gzip 크기를 KR 75,939B(4.9%), US 157,664B(4.6%) 줄였다. Node.js 공식 zlib 문서는 낮은 압축 레벨일수록 더 빠르지만 압축률이 낮다고 설명한다.
- level 9 → 1 운영 측정: commit `7832ba98`, Deploy OCI run `45738535065` 성공 후 각 시장 3회 순차 호출. KR 완료 40.648/26.113/22.570초(중앙값 26.113초), gzip 중앙 1,551,933B, 2,337 ticker. US 89.328/82.971/53.177초(중앙값 82.971초), gzip 중앙 3,516,037B, 5,011 ticker. 모든 응답 200, gunzip/JSON/필드 계약/20봉 상한 통과. 직전 level9 기준선은 KR 2회 중앙값 22.946초/1,254,829B, US 2회 중앙값 112.265초/2,870,379B. level1은 미국 속도를 개선했지만 국내 개선은 입증하지 못했다. 미국 최대 chunk 무응답 51.396초도 관측됐다.
- 최종 level 3 운영 실측: commit `c4602fa6`, Deploy OCI run `45741408909` 성공 후 각 시장 2회 순차 호출. KR 14.013/24.755초(중앙값 19.384초), gzip 1,484,790B, 2,337 ticker, 모든 종목 20봉. US 90.703/77.501초(중앙값 84.102초), gzip 중앙 3,371,786B, 5,011 ticker, 일봉 0–20봉. 모두 HTTP 200, XFL=0, `Content-Type: application/gzip`, Content-Encoding 없음, no-store, gunzip 및 JSON 계약 통과. 최대 chunk 무응답은 KR 23.424초, US 51.306초.
- 비교/해석: level3 중앙값은 level9 기준선 대비 국내 약 15.5%, 미국 약 25.1% 빨랐다. level1 대비 level3은 국내가 25.8% 빨랐고 미국은 1.4% 느렸으며, 전송량은 각각 약 4.3%/4.1% 줄었다. 운영 호출 표본이 2–3회이고 부하가 통제되지 않아 p95 또는 인과 효과로 단정하지 않는다. DB batch별 쿼리 시간과 서버 CPU는 계측하지 않아 다음 최적화 대상이다. 500 ticker batch에서 미국 최대 응답 chunk 무응답이 51초여서 60초 proxy 한계까지 여유가 작다.
- 자동 감지/검증: API 단위 테스트에서 gzip 해제, XFL=0, 응답 헤더, 필드, 무캐시, 20봉 상한, 500 ticker batch 경계를 확인. `npm run deploy:verify` 통과: 283 test files passed/1 skipped, 1,645 tests passed/3 skipped, production build, standalone·Chrome desktop/mobile smoke 및 문서/API 감사 완료.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, `DEVELOPMENT_LOG.md`. 속도 우선 코드는 commit `7832ba98` 및 `c4602fa6`로 `oci`에 push했고, 두 OCI deployment run 모두 성공했다. 로컬 보관 기록과 전체 운영 표본은 아래 항목에 보존.

### 2026-11-26 — 공개 gzip 일봉 API 속도 우선 개선
- 목적/범위: 사용자 지시에 따라 응답 속도를 최우선으로 두고 무캐시·gzip 단일 파일·ticker/marketCap/daily 필드·종목당 일봉 최대 20개와 활성 COMMON_STOCK 필터는 보존하면서 압축과 batch 처리 비용을 줄인다.
- 근거: 로컬 보관 gzip 일봉 파일에서 해제한 JSON을 재압축해 비교한 중앙값에서 gzip level 1은 level 9 대비 국내 JSON 73,859,836B를 2,955ms에서 135ms, 미국 JSON 158,160,687B를 8,114ms에서 356ms로 압축했다(5회 비교). 산출 gzip 크기는 국내 5,334,933B→7,597,034B(+42.4%), 미국 13,734,405B→18,547,157B(+35.0%)였다. Node.js 공식 zlib 문서도 더 낮은 압축 레벨은 압축률을 낮추는 대신 더 빠르다고 설명한다.
- 구현: `lib/public-daily-export.ts`의 gzip level을 9에서 1로 낮추고, 레코드를 50개씩 묶어 compressor write를 호출해 개별 write callback 수를 줄였다. 기존 5초 heartbeat flush는 느린 batch 대기 중 프록시 연결을 유지하기 위해 보존하고, 매 50개마다 실행하던 강제 flush는 제거했다. DB 조회 batch는 250에서 500 ticker로 늘리고 동시 쿼리 수 5개를 유지했다.
- 로컬 PostgreSQL 검증: 같은 dev-server 실행에서 변경 전 KR 4,091ms/1,215,870B, US 4,407ms/2,853,898B였고 변경 후 KR 624ms/1,541,010B, US 1,078ms/3,464,438B였다(각 1회 순차 실행). 개선 후 gzip 해제·JSON 파싱, ticker 수(2,352/5,012), top-level keys, 종목별 최대 20봉을 확인했다. gzip 크기는 KR +26.7%, US +21.4%였고 로컬 단일 표본은 운영 성능이나 p95를 보증하지 않는다.
- 자동 회귀 감지: gzip 헤더 XFL=4(빠른 압축), 다운로드 이름/필드 계약, 무캐시, gzip 해제 및 20봉 상한을 기존 API 테스트에서 확인하고 500 ticker batch 분할 테스트를 갱신한다.
- 남은 위험/다음 단계: 압축 payload가 커져 네트워크가 느린 소비자에게는 전체 완료시간이 되레 늘 수 있다. level1 로컬 API에서는 빠르지만 운영 완료시간은 DB·네트워크 조건에 따라 편차가 컸다. 운영 측정 결과는 상단 후속 기록에 남겼다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 본 로그. `npm run deploy:verify` 전체 통과, commit `7832ba98` push 및 운영 배포 성공. 후속 level3 조정의 전체 검증·배포는 별도 기록한다.

### 2026-11-26 — 운영 gzip 일봉 API 추가 실측 및 속도 개선안
- 목적/범위: 무인증 운영 KR/US 일봉 gzip API를 다시 각각 1회 호출해 이전 측정과 변동을 비교하고, 현재 구현에 맞춰 다음 성능 개선 순서를 제안한다. 애플리케이션 코드는 변경하지 않았다.
- 측정 방식: 로컬 Node.js `fetch`로 운영 API를 순차 호출하고 응답 헤더/첫 gzip byte/전체 완료, 압축 byte, chunk 간 최대 무응답 구간을 기록했다. gzip을 해제하고 JSON/top-level keys/종목별 봉 수를 검증했다. `no-store` 헤더상 캐시 응답은 사용되지 않았다.
- 추가 운영 실측: KR HTTP 200, 헤더 0.375초, 첫 byte 0.377초, 전체 28.082초, gzip 1,254,861B, 2,337종목, daily 20봉. US HTTP 200, 헤더·첫 byte 0.376초, 전체 129.775초, gzip 2,871,163B, 5,011종목, daily 0–20봉. 두 payload 모두 `daily`, `marketCap`, `ticker` 키와 `application/gzip`, Content-Encoding 없음, no-store 조건을 만족했다. 최대 chunk 무응답은 KR 17.823초, US 27.997초.
- 비교/해석: 선행 1회 측정(KR 17.809초, US 94.754초) 대비 이번 전체 시간은 각각 1.58배, 1.37배였고 gzip byte 차이는 약 0.01%, 0.06%였다. 첫 byte는 양 시장 모두 0.4초 이내로 빨랐지만 전체 완료시간은 크게 변동했다. 따라서 현재 증거는 초기 응답 대기보다 DB batch 생산·JSON 직렬화·gzip/전송 중 어느 구간의 지속 처리량이 병목인지 분리 계측해야 함을 보여준다. 각 2회뿐이라 p50/p95나 원인 단정은 불가하다.
- 개선 제안(아직 미구현): (1) 내부 구조화 로그로 batch별 DB 시간/row 수, 변환·직렬화 시간, gzip 출력량·전체 시간을 분리 계측, (2) 운영 query의 `EXPLAIN (ANALYZE, BUFFERS)` 및 buffer hit/read 근거로 기존 `(market, code, timeframe, candle_date DESC)` 인덱스 효용을 확인한 뒤 인덱스 변경 여부 결정, (3) 50종목 단위 gzip flush와 개별 write를 묶음 단위로 바꾸는 실험을 동일 payload로 비교, (4) 130초에 이르는 US 전체 다운로드가 소비자 timeout에 걸리면 cursor/page API를 별도 계약으로 검토한다. gzip level 9·무캐시·최대 20봉 계약은 유지하는 전제다.
- 근거 문서: PostgreSQL 공식 `EXPLAIN` 문서(https://www.postgresql.org/docs/current/using-explain.html), index-only/covering index 한계(https://www.postgresql.org/docs/current/indexes-index-only-scans.html), Node.js 공식 zlib 문서(https://nodejs.org/api/zlib.html). 인덱스 추가는 heap 접근을 줄일 수도 있으나 visibility map, 변경 빈도, 인덱스 용량을 확인하기 전 효과를 단정하지 않는다.
- 남은 위험/다음 단계: 운영 2회 순차 측정만으로 부하 조건이나 p95를 알 수 없다. 병목 계측을 먼저 추가하고 동일 시간대/동일 응답 계약으로 반복 표본을 모은 뒤, DB와 앱 CPU를 분리해 변경을 선택한다. 운영 DB EXPLAIN/서버 내부 CPU 계측은 이번 요청에서 수행하지 않았다.
- 변경 파일: `DEVELOPMENT_LOG.md`만 수정. 테스트·빌드·실행은 문서 작업 범위상 수행하지 않음. 커밋·푸시·배포 없음.

### 2026-11-26 — 최초 운영 gzip 일봉 API 실측 결과
- 배포: 코드 커밋 `239e7e53`의 GitHub Actions Deploy OCI run `45733164329` 성공. 운영 도메인 `https://stockman.r-e.kr`에서 각 무인증 GET을 1회씩 순차 호출했다. 캐시를 사용하지 않아 호출당 실제 DB 조회와 gzip 생성이 실행됐다.
- KR `GET /api/public/daily-export/kr`: HTTP 200, gzip headers 0.271초, 첫 압축 바이트 0.276초, 전체 완료 17.809초, compressed 1,254,796B, 2,337종목, 종목별 daily 20봉, gzip 해제/JSON/세 필드 계약 통과.
- US `GET /api/public/daily-export/us`: HTTP 200, gzip headers 7.742초, 첫 압축 바이트 7.743초, 전체 완료 94.754초, compressed 2,869,595B, 5,011종목, 종목별 daily 0–20봉(데이터 없는 ticker 포함), gzip 해제/JSON/세 필드 계약 통과. 스트림 최대 무응답 구간 26.610초로 60초 nginx 504를 피했다.
- 운영 한계: 각각 단 한 번의 실측이며 반복 부하·동시 호출 p95/p99를 보증하지 않는다. 미국 전체 다운로드는 약 95초여서 수신 LLM/HTTP 클라이언트의 자체 timeout이 95초보다 짧으면 실패할 수 있다. `.json.gz` 자체를 반환하므로 자동 HTTP content-encoding 해제 대신 일반 gzip 파일로 해제한다.
- 데이터 계약 점검: top-level keys는 `daily`, `marketCap`, `ticker`; HTTP `Content-Type: application/gzip`, `Content-Encoding` 없음, `Cache-Control: no-store`; 일봉 최대 20봉 준수.
- 변경 파일: 본 로그만.
- 검증: 앞선 코드 커밋에서 전체 `npm run deploy:verify` 통과(283 test files passed/1 skipped, 1,645 tests passed/3 skipped); 운영의 두 응답 모두 gunzip 후 JSON 계약 검사 통과.
- 커밋·푸시·배포: feature 배포 성공. 이 운영 실측 기록은 문서 커밋과 뒤이은 CI 배포 후에도 최신 상태 확인 예정.### 2026-11-26 — gzip 스트림에서 미국 일봉 DB 조회 진행
- 목적/범위: 250개 종목 batch로도 운영 US가 60.2초 504여서, batch 조회 결과를 전부 기다린 뒤 응답을 내던 구조를 바꿔 gzip HTTP body를 먼저 열고 최대 5개 DB query batch 결과를 순차적으로 흘려 보낸다.
- 근거/동작: 운영 US 응답 헤더 도착 자체가 60초 후였으나 작은 batch로 분리해도 개선되지 않았다. 이는 압축 전에 DB 결과 전체를 대기하는 구조가 프록시 timeout을 유발할 수 있음을 보인다. 먼저 JSON 배열 gzip 시작 바이트를 flush하고 DB 결과를 받는 동안 5초마다 gzip sync flush heartbeat를 보낸다. 종목 데이터는 batch가 끝날 때마다 순차 전송하며 gzip level 9, 20봉 상한, 세 top-level 필드, no-store는 유지한다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 본 로그.
- 자동 회귀 감지: 테스트가 batch 조회 8초 지연 상황에서도 gzip heartbeat를 7.5초 이내 수신하고, 최종 gzip을 온전히 해제해 ticker를 확인한다.
- 검증: 스트리밍 dev-server + `.env.local` 주입 + localhost PostgreSQL 실측: KR 헤더 2.7초/총 4.5초/2,352종목/1,215,870B/최대 20봉, US 헤더 0.5초/총 4.2초/5,012종목/2,853,898B/최대 20봉. API 테스트 7개, typecheck 및 전체 `npm run deploy:verify` 통과(283 test files passed/1 skipped, 1,645 tests passed/3 skipped; build/docs/audits/standalone·Chrome smoke 포함). 운영 재배포 후 실측은 뒤따른다.
- 남은 위험: Nginx/Next 프로덕션 경로가 중간 heartbeat를 전달하는지와 운영 DB batch 시간이 개선되는지 운영에서 확인한다. streaming 중 DB 오류가 발생하면 HTTP 200 이후 gzip body가 불완전해져 클라이언트 압축해제가 실패할 수 있다.
- 커밋·푸시·배포: 전체 로컬 배포 검증 완료. gzip query streaming 변경 커밋·푸시 및 운영 GET 대기.### 2026-11-26 — 공개 gzip 일봉 운영 조회 병렬 분할
- 목적/범위: gzip 스트리밍 배포 후 운영에서 KR 약 49초 200, US 약 60초 504가 재현돼 시장별 일봉 조회를 종목 250개 단위로 나누고 최대 5개씩 병렬 처리한다. 데이터 계약과 gzip level 9, 20봉 상한, 무캐시, 종목분류 정책은 유지한다.
- 원인 근거: 첫 응답 헤더까지 US 약 60초가 걸려 지연이 응답 본문 gzip 전이 아닌 초기 DB 조회/결과 처리 구간에 있음을 확인했다. DB 서버 내부의 정확한 원인(스토리지, CPU, 실행 계획)은 아직 미확인이다.
- 구현: 활성 COMMON_STOCK universe key를 먼저 읽고, key 집합을 JSON recordset으로 250개씩 최대 5개 DB query에 나눠 병렬 조회한다. 각 쿼리는 기존 복합인덱스 기반 종목별 최신 20봉 조회를 유지한다. 이전 set-based 전체 candle scan 시험은 로컬에서 US 65초로 느려 최종 변경에 채택하지 않았다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 본 로그.
- 재발 자동 감지: API 테스트는 2단계 조회, 대상 ticker 전달, no-store gzip level9, 무인증 경로 및 20봉 한계를 검사한다.
- 검증: 로컬 PostgreSQL 실제 데이터 dev-server smoke에서 KR 2,352종목/1,215,865B/최대 20봉/1.4초, US 5,012종목/2,853,893B/최대 20봉/2.5초. 스트리밍만 적용한 직전 운영 배포에서는 KR 2,337종목/1,254,399B/최대 20봉/49.1초 200, US는 60.4초 504로 실패했다. 1,250개 batch 실측 배포 후 KR은 13.4초 헤더/16.2초 다운로드로 200, US는 60.2초 504였다. 250개 batch 로컬 PostgreSQL dev-server smoke는 KR 2,352종목/1,215,865B/20봉/3.2초, US 5,012종목/2,853,893B/20봉/2.1초였다. 250개 batch API 테스트 6개와 typecheck 통과. 전체 `npm run deploy:verify` 통과(283 test files passed/1 skipped, 1,644 tests passed/3 skipped; production build, standalone·Chrome smoke, docs/audits 포함). 최신 batch의 운영 재배포/GET 검증은 아직 진행 전이다.
- 남은 위험/다음 개선: 수정 배포 후 운영 KR·US 각 응답상태, 헤더 도착, 전체 다운로드 시간, 종목수, gzip 해제, daily bar 상한을 측정한다. 계속 느리면 운영 PostgreSQL 실행계획/IO 및 app CPU 관측이 필요하다.
- 커밋·푸시·배포: 전체 로컬 검증 완료. 250개 batch 변경을 커밋·푸시하고 운영에서 재측정한다.### 2026-11-26 — 공개 gzip 일봉 API 응답 스트리밍 개선
- 목적/범위: 운영 KR/US API에서 관측된 약 60초 nginx 504를 줄이기 위해 gzip level 9 응답을 메모리에 전부 만든 뒤 전송하던 방식을 스트리밍으로 변경했다. JSON 응답 필드, 일봉 20개 상한, 매 호출 DB 재조회는 유지한다.
- 원인 근거: 기존 응답은 전체 DB 결과를 모아 gzip `Buffer` 생성이 끝날 때까지 응답 헤더/본문을 반환하지 않았다. 운영에서 KR 200/약 31초 및 KR·US 504/약 60초가 관측됐다. 프록시가 응답 시작 전 기다리는 시간이 한 원인일 수 있다는 추론이며, DB·CPU별 지연 분해자료는 미확인이다.
- 가설 정정: 시가총액 snapshots 테이블은 migration V72에서 `(market, code)` UNIQUE이므로 과거 스냅샷 중복 조인 가설은 틀렸다. 그 가설로 추가한 lateral join은 되돌렸다. 스키마나 인덱스는 변경하지 않았다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 본 로그. Node gzip stream은 level 9를 유지하고 50종목마다 flush하며 `X-Accel-Buffering: no`를 전달한다. 스트림 응답이므로 `Content-Length`는 생략한다.
- 재발 자동 감지: 회귀 테스트가 매 호출 gzip 해제, XFL level 9, 무캐시, 스트리밍 헤더, 응답 필드 및 최대 20봉을 검사한다.
- 검증: 현재 수정 전 단계에서 전체 `npm run deploy:verify` 성공(283 test files passed/1 skipped, 1,643 tests passed/3 skipped). 스트리밍 변경 후 API 테스트와 typecheck 및 전체 배포 검증을 재실행한다. 로컬 dev-server + `.env.local` 주입 smoke는 KR 2,352종목/1,215,865B/최대 20봉/약 4.0초, US 5,012종목/2,853,893B/최대 20봉/약 3.5초였다. 이 측정은 localhost PostgreSQL과 개발 PC 기준이다.
- 남은 위험/다음 개선: 스트리밍 수정 배포 뒤 두 운영 경로를 연속 검증하고 지연을 기록한다. 여전히 504면 운영 서버 CPU, DB query, Nginx buffering/timeout을 나눠 측정한다.
- 커밋·푸시·배포: 전체 로컬 검증 완료. 스트리밍 수정 커밋·푸시 후 운영 재확인 대기.
### 2026-11-26 — 국내·미국 보통주 gzip 일봉 다운로드 배포 준비
- 목적/범위: 무인증 공개 국내·미국 GET 다운로드를 추가했다. 각 호출은 active COMMON_STOCK master, 저장 시가총액, 최근 최대 20개 일봉을 한 번의 read-only DB query로 읽어 `ticker`, `marketCap`, `daily` 세 가지 항목만 포함한 gzip level 9 `.json.gz`를 생성한다. response/file cache 없이 `no-store`로 전달한다.
- 변경 파일: `app/api/public/daily-export/kr/route.ts`, `app/api/public/daily-export/us/route.ts`, `app/api/public/daily-export/kr/route.test.ts`, `lib/public-daily-export.ts`, `scripts/api-surface.mjs`, `docs/api/route-inventory.json`, `public/openapi.json`, `public/api-reference.md`, `public/document-catalog.json` 및 생성 manuals.
- 분리 배포: 원래 작업 트리에 다수의 무관한 staged/unstaged/untracked 작업이 있고 local `oci` branch는 원격보다 6 commits 뒤여서 이를 배포하지 않도록 최신 `origin/oci` (`322ea9fc`)에서 전용 worktree를 만들었다. 이번 API와 필요한 문서만 복사·재생성했다.
- 근본 원인/보완: 앞선 로컬 smoke에서 국내 개발 DB에 `trading_value` column이 없어 SQL이 실패했다. `to_jsonb(c)->>'trading_value'`로 column이 있는 스키마에서는 저장 공식값을 사용하고, 구형 스키마에서는 `close × volume` fallback을 사용한다. 미국은 활성 보통주 flag 및 ADR/ADS descriptor exclusion을 적용한다. 회귀 테스트는 gzip 해제, level 9, 20봉 상한, 인증 없는 두 시장 경로, no-store, 호출당 재조회, 분류 predicate를 검증한다.
- 검증: `npm ci --no-audit --no-fund` 성공. `npm run deploy:verify` 성공: 의존성 취약점 0, OCI activation preflight, docs/API/migration checks, production build, standalone·Chrome desktop/mobile smoke, typecheck, KIS/Bearer/cron audits, 283 test files 통과·1 skip, 1,643 tests 통과·3 skip. 앞서 dev-server HTTP smoke에서 KR 2,352종목/1,192,036B gzip/7.6초, US 5,012종목/2,799,835B gzip/11.9초로 200 및 압축해제 계약을 확인했다. 해당 실측은 local DB/dev 환경이며 운영 p95를 보증하지 않는다.
- 문서·API 계약: 두 path를 무인증 공개 OpenAPI에 `application/gzip` binary response로 추가하고 route inventory 및 catalog를 생성·검증했다. 콘텐츠는 gzip 파일 자체라 `Content-Encoding` 없이 반환한다.
- 커밋·푸시·배포: 검증 완료. 이번 전용 커밋을 `oci`에 push하면 OCI workflow가 실행된다. push 및 운영 GET 확인은 아직 진행 전이다.
### 2026-11-25 — 국내·미국 일봉 갱신 진단·수동 실행·Discord 알림 보강
- 목적/범위: 2026-11-24 국내·미국 일봉 부재 원인을 조사하고 기존 무인증 수동 POST 경로, 일봉 worker, 운영 진단 및 Discord 디버깅 알림을 개선했다.
- 원인 근거: 운영 read-only US 진단 GET에서 KST 06:00–08:00 실행창, 최근 3회 `AUTOMATION_RUN_STALE` 실패, 뒤이은 `outside_schedule` skip, NAS/NYS/AMS 전 종목 최신 거래일 2026-11-23을 확인했다. 최신 기록 이후 약 24시간 추가 실행이 없었다. 시간창 내 cron 호출 누락 또는 인증 실패 가능성이 있으나 OCI systemd journal/HTTP 응답 로그가 없어 구분할 수 없다. KR의 동일 기간 automation 이력도 확인할 수 없어 해당 원인은 미확정이다.
- 변경 파일: 예약 cron의 기존 D/W/M refresh 정책은 보존했다. 기존 무인증 POST 수동 API 두 경로는 D만 처리하고 `MANUAL` trigger로 기록한다. `GET /api/debug/daily-cache-status?market=KR|US`를 추가해 인증된 읽기 전용 진단으로 schedule/enabled, 거래소별 universe·cache coverage/latest date/fetchedAt, 최근 14일 일자별 건수, retry queue, 24시간 오류 분류, 최근 run 요약, cron/manual 공용 및 worker advisory lock 보유 세션 상태·경과 초를 제공한다. 선택형 `probeSource=true`는 거래소별 최대 3종목의 KIS 일봉 GET으로 원천/캐시 최신일을 비교한다.
- Discord: 기존 feature별 debug webhook 및 `STOCKMAN_DEBUG_DISCORD_WEBHOOK_URL` fallback을 재사용한다. cache completion 알림에 latest date·coverage·fetchedAt을 추가하고, cache 완료 설정이 비활성인 경우에도 debug webhook 알림을 보내며, stale run 정리 및 cron/manual 준비 단계 실패도 오류 코드 중심으로 알린다. URL·자격증명·오류 원문은 알림/진단 응답에 포함하지 않는다.
- 문서/인덱스: 진단·운영 runbook 및 공개 POST API reference를 갱신하고 route inventory를 재생성했다.
- 검증: npm run deploy:verify 통과. 전체 Vitest 282개 파일 중 282 passed·1 skipped, 1,638 passed·3 skipped; typecheck, 문서·API·권한·KIS·cron 게이트, production build, standalone runtime smoke(Chrome desktop/mobile 포함) 모두 성공했다.
- 문서 gate: docs:check 통과(154개 문서, 7개 분류; migration 183개, 최신 V183). route inventory 및 document catalog 생성/검증도 통과했다.
- 운영 확인: 운영 DB 쓰기, 무인증 갱신 POST, Discord webhook 실제 전송은 하지 않았다. 사용자가 배포를 승인해 검증 완료 후 oci 반영 및 GitHub Actions 배포를 진행한다.
- 2026-11-25 06:02 UTC 재조회: 운영 US 진단 GET은 정상(HTTP 200), AMS/NAS/NYS 최신 봉이 모두 `20261123`이고 eligible coverage 누락은 0이었다. schedule은 enabled, global gate enabled, KST 06:00–08:00, 월~토, 1시간 간격이며 조사 시각은 실행창 밖이었다. 마지막 실행 이력은 11-24 05:04Z `outside_schedule`; 직전 세 RUNNING 작업은 약 2시간 뒤 `AUTOMATION_RUN_STALE`로 정리됐다. 이 최신 조회까지 실행 이력이 추가되지 않아 캐시 갱신이 계속 정체된 상태다. 신규 수동 API POST는 운영 캐시를 변경하므로 호출하지 않았다. OCI systemd/HTTP 로그 없이 timer 미호출, 인증 실패, 장기 DB 세션 중 어느 쪽인지 확정하지 않는다.
### 2026-11-25 — 차트 모달 지표 정리 및 모바일 Chrome 회귀 검사
- 목적/범위: 차트 모달에서 RSI·MFI·MACD·DMI·Stochastic 보조 그래프를 제거하고 iPhone 12 Pro 크기(390×844 CSS px)와 Chrome 데스크톱에서 모달 표시를 자동 점검한다.
- 변경: `components/chart-modal.tsx`에서 지정 지표 계산·그래프를 제거하고 OBV·ADL 그래프는 유지했다. `components/chart-modal.module.css`에서 사용되지 않는 지표 상태 스타일을 정리했다. `components/chart-modal.test.tsx`에 제거 지표 비노출 회귀 검사를 추가했다. `scripts/charts-browser-smoke.mjs`가 고정 차트 응답으로 모달을 열어 모바일 뷰포트 넘침, 닫기 버튼 크기, 차트 크기와 닫힘을 검사하도록 확장했다.
- 근본 원인/영향: 모바일 검증은 기존 `/charts` 페이지 hydration만 확인하고 모달을 열지 않아 모달 viewport 레이아웃 회귀를 감지하지 못했다. 기존 Lightweight Charts와 ResizeObserver 동작을 그대로 사용하며 변경 영향은 차트 모달 지표 렌더링·배포 Chrome smoke에 한정된다.
- 공식 기준: [MDN viewport meta](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport), [MDN CSS length/dvh](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length), [MDN safe-area env()](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env), [Chrome responsive design guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/css/responsive-design?hl=en). 기존 `viewport-fit=cover`, `dvh`, safe-area CSS 설정을 확인하고 유지했다.
- 검증: 수정 후 `components/chart-modal.test.tsx` 28개 통과. 분리 worktree에서 `npm run deploy:verify` 전체 통과: Vitest 282개 파일/1,638개 통과·3개 skip, 타입 검사, 문서/API/KIS/cron 감사, production build, standalone HTTP/정적 청크 smoke 및 Chrome 모달 smoke(데스크톱·390×844 모바일). 기존 공유 작업 트리의 미추적 `db/migration/V180__remove_user_action_event_metadata.sql` 때문에 최초 게이트가 migration 중복으로 중단됐으나, 해당 미추적 파일을 배포 내용에 섞지 않은 분리 worktree에서는 migration 검사와 전체 게이트가 정상 통과했다. Windows node_modules junction으로 standalone trace 복사 경고(EPERM)가 있었지만 standalone 서버가 정상 기동하고 모든 runtime smoke가 통과했다.
- 재발 감지/남은 위험: 배포 게이트의 Chrome smoke가 `/charts`에서 실제 차트 모달을 열고 390px 뷰포트 기준을 계속 확인한다. 시뮬레이션은 실기기 iOS Chrome을 대체하지 않으며 노치·주소창 전환의 실제 기기 검증은 남아 있다.
- 커밋·푸시·배포: `74926cf7`을 `origin/oci`에 푸시했다. GitHub Deploy OCI run `45513749204` (#1383) 검증·패키징·업로드·활성화 성공. 운영 `https://stockman.r-e.kr/api/health`와 `/charts` HTTP 200, 운영 Chrome 모달 smoke(데스크톱·390×844 모바일) 통과.

### 2026-11-24 — iPhone 12 Pro Chrome 차트 모달 주기 선택 재설계
- 목적/범위: 앞선 모바일 차트 모달의 주기 선택이 한 줄에 길게 나열되어 화면 폭에서 간격이 가려지고 조작 영역이 작아지는 문제를 재검토했다. 사용 환경을 iPhone 12 Pro 세로 390 CSS px, iOS Chrome(WebKit)으로 구체화했다.
- 근본 원인: 전체 화면 모달 자체보다 일·주·월·분 간격을 동급 버튼으로 한 줄에 배치한 정보 구조가 문제였다. 국내 분봉 8개 버튼을 390px 폭에 배열하면 각 버튼 너비가 약 40px로 좁아지는 레이아웃이다.
- 변경: `components/chart-modal.tsx`에서 일봉·주봉·월봉과 분봉 모드를 분리하고, 분봉 간격은 선택 상태에서만 보이도록 그룹화했다. `components/chart-modal.module.css`에서 분 간격을 4열 2행으로 배치하고 버튼 높이 44px, 범례 줄바꿈을 유지했다. 차트 모달 설계 원칙을 `docs/MOBILE_UI_UX_DESIGN.md`와 공개 매뉴얼 사본에 기록했으며, 분봉 모드 접근성 회귀 테스트를 추가했다.
- 공식 근거: Apple HIG의 모달 가이드상 전체 화면은 집중이 필요한 복합 작업에 적합하고, iOS Chrome은 Chrome 공식 문서 기준 WebKit을 사용한다. WebKit의 동적 뷰포트 단위와 안전 영역 지침을 계속 적용한다. TradingView 공식 Supercharts 문서의 주기·종목 정보·보조 기능 역할 분리도 정보 구조 참고로 삼았다.
- 검증: `npm run deploy:verify` 통과. 전체 282개 테스트 파일 중 282개 통과, 1,638개 테스트 통과·3개 skip; 타입 검사·문서 검사·최적화 빌드와 standalone runtime smoke 통과(`/charts` HTTP 200, Chrome 데스크톱/모바일 hydration). 별도 로컬 화면 확인에서 390×844 CSS px 모달은 390×844, 분봉 버튼은 4열로 줄바꿈했고 44px 높이·88.5px 너비를 유지했다. 이 검증 브라우저는 데스크톱 Chrome의 모바일 에뮬레이션으로 iOS Chrome 실기기는 아니다.
- 재발 감지/남은 위험: `npm run deploy:verify` 및 모바일 화면의 390px 전체 간격 가시성, 가로 overflow, 44px 버튼 높이를 확인한다. 배포 후 iPhone 12 Pro 실기기에서 동적 주소창·노치/홈 인디케이터·가로 모드 확인을 후속 항목으로 둔다.
- Git·배포: 코드·설계 문서 변경을 `7bbc5647`로 커밋하고 `origin/oci`에 푸시했다. OCI Actions run #1381 성공. 운영 `/api/health` HTTP 200, `/charts`에서 신규 주기 그룹 및 4열 분봉 CSS 확인. 실기기 확인은 미수행.

### 2026-11-24 — iPhone 12 Pro iOS Chrome 차트 모달 모바일 최적화
- 목적/범위: iPhone 12 Pro의 세로 390 CSS px 폭과 iOS Chrome(WebKit) 환경을 기준으로 차트 모달 반응형 레이아웃을 조정했다. 기존 viewport device-width/viewport-fit=cover 설정을 확인하고 유지했다.
- 변경: components/chart-modal.module.css, components/chart-modal.tsx에서 모바일 모달을 동적 뷰포트 높이 기반 전체 화면으로 전환하고 노치·홈 인디케이터 및 가로 모드 좌우 안전 영역을 반영했다. 종목명/가격과 조작부를 모바일 헤더에서 정돈하고 키보드 전용 힌트를 숨겼다. 봉 주기 선택은 터치 가능한 가로 스크롤 바로 바꾸고 44px 최소 터치 크기, 뷰포트 높이에 비례하는 차트 영역, 스크롤 가능한 범례를 적용했다. 선택 주기는 버튼 그룹과 aria-pressed로 표현하고 components/chart-modal.test.tsx의 접근성 쿼리를 이에 맞췄다.
- 근본 원인/영향: 기존 95vh 하단 시트와 한 줄에 섞인 다수의 주기 버튼은 iPhone 폭에서 차트 가시 영역을 줄이고 조작을 빽빽하게 만들 수 있었다. 첫 빌드 검사에서는 tsconfig.json이 과거 .next-clean-audit/.next-deploy-verify 타입 산출물까지 포함해 삭제된 임시 라우트를 검사했다. 이 경로를 제거하고 현재 .next/types만 유지했다. 변경 영향은 차트 모달 모바일 표현과 Next.js 타입 검사 입력 범위에 한정된다.
- 검증: `npm test` 통과(282개 파일, 1,637개 테스트 통과, 3개 skip), `npm run build` 통과, `npm run start -- --port 3100` 실행 후 `/charts`와 `/api/public/document-catalog` 모두 HTTP 200, `git diff --check` 통과. 최초 빌드는 위의 오래된 임시 타입 경로 때문에 실패했고 설정 정리 후 재검증에서 통과했다. 로컬 앱 로그에 `intraday_detection_runs` 테이블 부재 경고가 있었으며 화면/API 확인은 통과했다. 실기기 실행은 하지 않았다.
- 재발 감지/남은 위험: 390×844 CSS px 세로 및 가로 화면에서 Chrome iOS 실기기 확인을 후속 체크리스트로 둔다. 구형 iOS/WebKit의 동적 뷰포트 동작은 100vh fallback으로 보완했으나 실기기 확인 전까지 실제 주소창 전환·노치 영역 렌더링은 미검증이다. 타입 검사 입력은 `.next/types/**/*.ts`만 포함하는지 유지 확인한다. 로컬 DB에서 `intraday_detection_runs` 누락 경고가 지속되면 스키마 상태를 별도 점검한다.
- Git·배포: 코드 변경은 `901a2e09`로 커밋했고 `origin/oci` 푸시 성공을 확인했다. 이번 작업에서 OCI 배포 완료 여부는 별도로 확인하지 않았다.

## [2026-11-24] 미국 일봉 캐시 거래소별·종목별 최신성 보정

### 목표
- 운영 미국 보통주 일봉이 최신 거래일 2026-11-23을 누락하지 않도록 원인을 조사하고 감지·복구를 배포한다.

### 반영
- 원인 1: KST 06:00–08:00의 좁은 실행창과 hourly cron이 맞지 않아 장후 갱신이 outside_schedule로 skip됐다. 동기 보정 요청은 nginx 기본 제한 약 54초에서 504를 반환했다.
- 원인 2: 첫 freshness probe는 거래소별 MAX 날짜만 비교했다. 2026-11-24T02:49Z 운영 확인에서 NAS/NYS/AMS MAX는 모두 2026-11-23이었지만, 활성 보통주 중 그 날짜 봉이 없는 종목은 각각 1,107/665/107개(총 1,879개)였다. AAPL은 11/23이지만 MSFT·JPM은 11/20이었다.
- 장후 probe가 원천 MAX와 거래소 캐시 MAX뿐 아니라 활성 COMMON_STOCK별 원천 최신일 coverage도 비교하도록 확장했다. 누락 종목이 하나라도 있으면 기존 전체 유니버스 warm 경로를 비동기 catch-up으로 접수한다. coverage 조회 실패는 fail-closed 처리한다.
- 백그라운드 202 접수, 분산 잠금 유지, 고아 RUNNING 복구 및 회귀 테스트를 추가했다. 상세 운영 근거와 점검 절차는 docs/operations/us-daily-cache-freshness-runbook.md에 기록한다.
- 운영 확인 중 감지기와 실제 cache warm universe가 서로 달라 241개 종목이 오래된 상태로 남을 수 있음을 발견했다. 감지기와 보호된 상태 API를 `daily_active`, 공식 상품 제외 플래그, 동일한 preferred/notes/bonds/units 등 상품명 제외 규칙으로 맞춰 비활성·제외 종목을 반복 백필 대상으로 세지 않도록 수정했다.
- 적격 universe 조정 뒤에도 5개 누락과 장시간 RUNNING이 지속됐다. 확인된 구조적 병목은 catch-up이 주봉·월봉 lane까지 순차 수행하는 전체 warm 경로를 공유한다는 점이다(운영 run 455259/455350이 어느 lane에서 멈췄는지는 run summary가 없어 미확인). post-close catch-up은 D lane만 실행하도록 제한하고, 보호된 status API에 누락 ticker 코드를 포함해 복구 대상·미해결 종목을 직접 확인할 수 있게 한다. 정기 schedule warm은 기존 D/W/M 전체 실행을 유지한다.

### 검증
- 이전 비동기 구현: npm run deploy:verify 통과(빌드·standalone/브라우저 스모크·전체 1,631 tests·타입·문서·보안/cron 감사). GitHub Deploy OCI run 45314191777 성공, commit f581164f.
- 새 종목별 coverage 구현 후 npm run deploy:verify 통과: 빌드·standalone/브라우저 스모크, 전체 281개 파일(1 skip)·1,632 tests(3 skip), typecheck, 문서/API/보안/cron 감사. 적격 universe 일치 수정 후 같은 전체 검증을 재통과했다. 이번 일봉 전용 catch-up 및 누락 코드 응답은 관련 테스트 8개 및 전체 deploy:verify 통과(282 files, 1 skipped; 1,633 tests passed, 3 skipped; build, standalone/browser smoke, typecheck, docs/security/cron audits).
- 운영 GET/POST는 읽기·보정 접수 목적으로 수행했다. 운영 DB 직접 변경은 하지 않았다.

### 다음 개선
- universe 일치 수정 배포 후 2026-11-24T04:45Z 기준 적격 5,122종목 중 5종목이 11/23 일봉을 보유하지 않았다(NAS 1, NYS 4, AMS 0). 시장 최신일은 모두 11/23이고 AAPL/MSFT/JPM 공개 GET도 11/23을 반환한다. 자동화 run 455259 및 455350은 RUNNING, 마지막 데이터 갱신은 03:50Z다. 일봉 전용 catch-up을 배포한 뒤 누락 코드·개별 최신일 및 run 종료를 확인해야 한다.

### 개선 과제
- 개선 과제 ID: CI-2026-11-24-005
- 성과 판정: PARTIAL
- 근거: 장후 자동 감지, 개별 종목 coverage, warm universe와 탐지기 적격 범위 일치를 구현·배포했다. 시장별 최신 거래일 및 대표 종목은 11/23이나, 적격 종목 5개 봉 누락과 두 automation run의 미종료가 남았다. 일봉 전용 catch-up 및 누락 코드 진단 수정은 구현·전체 검증을 마쳤으며, 배포 후 이 누락이 해소되고 실제 run이 완료되는지 확인해야 한다.

### 커밋·푸시·배포
- 이전 universe 수정은 완료(`4ef1635a`, `14ce99d9`); GitHub Actions run `45325840944` 검증·activation 성공, `/api/health` 정상 응답 확인. 현재 일봉 전용 catch-up 및 누락 코드 공개 수정의 커밋·푸시·배포는 미실행(전체 검증 대기); 적격 universe 5개 누락 해소도 미완료.
## [2026-11-24] 미국 일봉 캐시 장후 freshness probe 및 자동 catch-up

### 목표
- 운영 미국 보통주 일봉 캐시가 2026-11-23 거래일로 갱신되지 않은 원인을 확인하고, 장후 최신성 자동 감지·보정 후 배포한다.

### 반영
- 원인: 11/23 16:06Z 스냅샷은 미 동부 11:06, 정규장 마감 전 자료였다. 11/24 01:44Z 운영 GET에서도 AAPL/MSFT/JPM은 11/20 봉이었다. 동시각 protected cron POST는 HTTP 200 skipped=true, reason=disabled_or_outside_schedule을 반환했다. 기존 11/22 운영 진단은 US KST 06:00–08:00 시간창과 outside_schedule 반복 기록을 남겼다. 기존 응답은 disabled/outside-schedule을 구분하지 않고, 시간창 밖 KIS 원천 최신일과 캐시를 비교하지 않았다.
- 장후(미 동부 평일 18:00 이후) 활성 COMMON_STOCK 마스터에서 거래소별 최대 3개 기준 종목의 KIS 최신일과 캐시 MAX 일자를 비교한다. 원천 날짜가 캐시보다 앞서면 기존 전체 유니버스 warm 경로를 catch-up 실행하고, probe 실패는 HTTP 503으로 나타낸다. 비활성 설정 및 1시간 interval gate는 유지한다.
- cron 응답에 명확한 skip 사유·시간창·freshnessCheck·trigger를 포함하고, 정적 cron 검사는 health probe 직후 KR/US 일봉 호출 순서를 강제한다.
- 운영 runbook, 문서 인덱스, 카탈로그와 공개 manuals를 갱신한다.

### 검증
- `npx vitest run lib/us-daily-cache-freshness.test.ts`: 1 file, 3 tests 통과. `npm run cron:check`, `npm run typecheck`, `npm run docs:check` 통과.
- `npm test -- --run`: 280 files 통과, 1 skipped; 1,627 tests 통과, 3 skipped.
- 첫 `npm run deploy:verify`에서 DEVELOPMENT_LOG 최신 항목 계약이 요구하는 섹션/ID/전달 상태가 빠져 문서 gate가 실패했다. 로그 구조를 보완한 뒤 전체 배포 검증을 다시 실행한다.
- `npm ci --no-audit --no-fund` 완료. 운영 DB에 직접 쓰지는 않았다.

### 다음 개선
- 배포 후 OCI cron journal과 운영 일봉 GET을 대조하고, 실제 `post_close_stale_cache_catchup` 결과가 NAS/NYS/AMS 모두 기대 거래일을 반영했는지 확인한다. 3개 기준 종목이 모두 일시적으로 응답하지 않는 경우의 대체 기준 종목 정책을 run 결과에 따라 검토한다.

### 개선 과제
- 개선 과제 ID: CI-2026-11-24-004
- 성과 판정: PARTIAL
- 근거: 운영 캐시 지연과 skip 응답을 재현·확인했고, 최신일 불일치 시 장후 catch-up이 수행되도록 구현했다. 전체 테스트는 통과했으나 production deployment 및 11/23 봉 반영 확인 전이라 운영 결과는 미측정이다.

### 커밋·푸시·배포
- 커밋·푸시·배포: 미실행 (분리 작업 트리에서 검증 중).

## [2026-11-23] RSS 조회 hot path 추가 분리

### 목표
- RSS/공시 조회의 운영 응답시간을 줄이고 느린 query 구성 요소를 제거한다.

### 반영
- 재검사에서 RSS 단일 source 조회가 응답에서 쓰지 않는 DART/SEC run 조회를 실행하고, NASDAQ 등 RSS 결과가 없는 source 필터에서도 market-rss run coverage를 조회하는 구조를 확인했다.
- `/api/disclosures`는 DART/SEC run을 해당 source 요청 때만 포함한다. RSS run은 coverage 소비 source에서만 조회하고, automation_runs 필요한 module rows를 DISTINCT ON 단일 SELECT로 가져온다. NASDAQ 등 run coverage가 없는 source는 제외하며 sourceCoverage 응답은 보존한다.
- 재발 자동 감지: route 회귀 테스트, deploy:verify, 동일 query 및 item count를 함께 기록하는 운영 반복 측정을 수행한다.
- 범위: `app/api/disclosures/route.ts`, 이 로그 및 daily disclosure 설계 문서.

### 검증
- `npm test -- --run app/api/disclosures/route.test.ts lib/disclosure-timestamp-precision.test.ts`: 2 files, 8 tests 통과.
- `npm run typecheck`: 통과.
- `npm run deploy:verify` 통과: production audit(0 vulnerabilities), OCI activation smoke, docs/API/scope/KIS/auth/cron audits, build, standalone HTTP + Chrome desktop/mobile smoke, typecheck, 279 files(1 skipped), 1,624 tests(3 skipped). CI run 45105548471 성공.
- `hours=1&source=all&page=1&pageSize=100`: 배포 전 느린 표본은 14.2초/0행, 36.1초/0행(앞서 약 39초); 배포 후 5회는 1,472/618/497/577/418ms, 모두 HTTP 200/0행/12 coverage rows(중앙값 577ms). 앞서 7행 표본은 최근 window 행 수가 달라 비교에서 제외한다. `hours=1&source=NASDAQ` run query 제거 전 중앙값 106ms/0행(4회), 후 59.5ms/0행(6회)로 약 44% 감소. `hours=24&source=STOCKTITAN`은 제거 전 중앙값 232.5ms/13행(4회), 후 55–60ms/13행(5회).
- `hours=24&source=all&page=1&pageSize=100`: 통합 전 10,668ms/24행(1회), 배포 후 2,081/2,070/2,105/2,200/2,097ms(5회), 전부 HTTP 200/24행/12 coverage rows. 중앙값 2,097ms로 단일 기준 대비 약 80% 감소. `/api/health` HTTP 200/ok.

### 다음 개선
- 운영 read-only DB 계측 권한이 마련되면 `EXPLAIN (ANALYZE, BUFFERS)`로 잔여 2.1초의 쿼리별 비용을 확인하고, 동일 query를 5회 이상으로 p50/p95 재검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-11-23-002
- 성과 판정: IMPROVED
- 근거: ALL 24h 동일 쿼리/24행에서 배포 후 중앙값 2.097초, 배포 전 단일 기준 10.668초. 이전 표본 n=1이므로 개선율 일반화에 한계가 있다.

### 커밋·푸시·배포
- 커밋 `4581b530`은 전체 로컬 `npm run deploy:verify` 및 CI run 45105548471 통과, 배포 완료. 동일 결과 수 운영 성능 측정도 완료.
## [2026-11-23] RSS 조회의 요청별 payload 파싱 제거

### 목표
- 운영 RSS 조회 cold 지연을 줄이고 원문 payload의 요청별 반복 전송·분류를 제거한다.

### 반영
- 근본 원인: /api/disclosures가 raw_payload를 SQL 정규식으로 정밀도 분류하고 같은 payload를 Node에서 JSON parse했다.
- ingest 시 rss_timestamp_precision/rss_published_date를 저장하고 query/response는 요약 필드만 사용한다. V182는 기존 행 backfill과 date-only/instant 부분 인덱스를 추가한다. API 응답 의미는 유지한다.
- 배포 전 production dependency gate가 next@15.5.28 advisory로 실패하여 next@15.5.29로 패치했다. Next.js [공식 지원 정책](https://nextjs.org/support-policy)에 따라 유지보수 15.x 최신 patch를 사용하며 audit 0건을 확인했다.
- 재발 자동 감지: timestamp classifier tests, docs checker의 ingest/query 경계 확인, 운영 GET latency/결과 건수 비교를 유지한다.
- 범위: disclosures route/schema/ingest, V182 migration, docs checker, RSS 오류·설계 기록, Next dependency lock.

### 검증
- 변경 전 운영 GET hours=1/source=all/page=1/pageSize=100: 27s/HTTP 200/7 items 1회. NASDAQ/SEC_EDGAR 분리 GET 482/399ms, 0건. 추가 all-source GET은 61.5s 뒤 JSON parse 실패(상태/본문 미기록). 표본이 적어 cold 기준을 일반화하지 않는다.
- synthetic microbenchmark (25,000행×5회): JSON parse/classify 74.5ms, persisted precision lookup 2.0ms. 행당 815 bytes payload를 DB에서 가져오지 않으며 25,000행의 가상 payload는 20.4 MB다. 운영 API latency 개선율로 해석하지 않는다.
- 최신 `origin/oci` HEAD에 재적용한 전체 검증 통과: OCI activation preflight; docs/API/scope/KIS/Bearer/cron audits; Next.js 15.5.29 production build; standalone HTTP/API smoke와 Chrome desktop/mobile hydration; typecheck; full Vitest 279 files (1 skipped), 1,624 passed (3 skipped). `docs:check`에서 migration 182개 및 운영 schema 30 tables/2 views 확인.

### 다음 개선
- 배포 후 동일 운영 GET을 cold/warm 각각 반복해 p50/p95와 item count를 확인하고 Flyway V182 backfill 시간을 측정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-11-23-001
- 성과 판정: 운영 동일 쿼리 결과 건수를 비교하고 반복 latency 개선으로 확정한다. 합성 microbenchmark는 구조 개선 참고치다.
- 근거: feed timestamp 정밀도는 ingest 시 정해져 있으므로 조회마다 raw payload를 처리할 필요가 없다.

### 커밋·푸시·배포
- 상태: 검증 완료, push 후 OCI workflow 및 운영 성능 GET 확인 대기.

# [2026-11-19] US 일봉 갱신 진단 API 복구

### 목표
- 운영 US 최신 일봉이 거래일 대비 뒤처질 때 캐시 상태만 보지 않고 자동화 실행 결과와 시장별 coverage를 한 번에 확인할 수 있도록 한다.

### 반영
- 11월 17일 정리 커밋에서 전체 자동화 진단 route가 제거된 상태를 확인했다. 무거운 전체 집계 API/UI는 되살리지 않고, cron 인증 read-only `GET /api/debug/us-daily-cache-status`를 추가했다.
- 공식 활성 COMMON_STOCK만 대상으로 거래소별 eligible/cache/최신 봉일 coverage와 fetched 시각, US 일봉 최근 10회 실행 상태/기간/안전한 수치 및 error code 요약, 모듈 enabled/schedule/interval 상태를 제공한다. 원문 오류 메시지·비밀값은 제외하고 `no-store`를 적용한다.
- `docs/automation-observability.md`, 공개 매뉴얼 사본, 문서 카탈로그, `docs/api/route-inventory.json`을 새 내부 endpoint에 맞춰 갱신했다. 외부 OpenAPI에는 넣지 않는다.

### 검증
- 진단 route 회귀 테스트 3/3 통과(미인증 거부/DB 미조회, coverage·민감정보 제거, 안전한 503 응답).
- `node scripts/api-surface.mjs check` 통과: 106 route 파일, 공개 GET 45개. 내부 route는 `cron-guarded`이며 OpenAPI에 추가하지 않았다.
- `node scripts/check-docs.mjs` 통과(문서 entry 28개, migration 179개, 운영 테이블/뷰 30/2).
- 전체 `npm run deploy:verify` 통과: 운영 의존성 감사(취약점 0), activation preflight, API/docs/scope/KIS/auth/cron gates, production build, standalone HTTP/API 및 Chrome desktop/mobile smoke, typecheck, 전체 Vitest 282 files (1 skipped), 1,630 passed (3 skipped).
- `npm run audit:bearer-auth`, `npm run cron:check`, `npm run audit:api-surface`, `node docs/api/document-catalog.mjs check`, `git diff --check` 통과.
- 원격 `oci` 동시 변경 통합 후 재검증도 `npm run deploy:verify` 전체 통과: migration 180, production build/standalone desktop·mobile smoke, typecheck, 282 files (1 skipped), 1,631 passed (3 skipped), docs/API/scope/KIS/auth/cron gates.

### 결과 및 위험
- 운영 진단 API가 제거되어 전체 자동화 이력을 확인하지 못하던 상태를 US 전용 경로로 개선했다. 운영에서 인증 GET 200, 미인증 GET 401, `/api/health` 200을 확인했다.
- 배포 후 설정은 enabled, gate=true, 06:00–08:00 KST, 월~토, 1시간 간격이다. 운영 최신 US 봉은 여전히 `20261117`; 최근 10회 실행은 모두 `SKIPPED/outside_schedule`이며 마지막 기록은 2026-11-18 13:10 UTC (22:10 KST)다. 다음 06:00–08:00 KST 실행 창에 해당하는 기록이 없다.
- 현재 증거로는 예약 창에 cron API 실행 기록이 생성되지 않은 상태까지 확인했다. OCI `stockman-cron` systemd journal을 조회할 수 없어 timer 미실행과 API 도달 전 실패 중 직접 원인은 미확정이다. 운영 캐시 갱신이나 cron 수동 실행은 하지 않았다.

### 커밋·푸시·배포
- 기능 커밋 `7f11a882`, 원격 `oci`의 동시 변경 `66bdab36` 통합 merge commit `7bb7bd74`; `oci` push 완료.
- Deploy OCI workflow run [`44463148126`](https://github.com/pjtss/StockMan/actions/runs/44463148126) 성공, release upload/activate 성공. Workflow가 DB schema 180을 확인했다.

# [2026-11-18] 차트 종목 추출 응답 병목과 timeout 개선

### 목표
- 운영 `/charts` 종목 추출의 cold 지연과 화면 timeout 경로를 개선한다.

### 반영
- `lib/db-screener.ts` JSON 집계는 운영에서 개선이 입증되지 않아 행 기반으로 복원한다. broad US 교환소 병렬화만으로는 60초 gateway timeout이 해결되지 않아, market-cap 조건·정렬만 있는 요청은 교환소별 상위 시총 rank를 캔들 조회 전 선택하고 전역 정렬한다.
- `components/ticker-chart-workbench.tsx` 요청 timeout을 45초에서 90초로 늘린다.
- `lib/db-screener-aggregated-rows.test.ts`와 운영 설계·오류·성능 문서에서 메타데이터 동등성 및 실패 위험을 관리한다.

### 검증
- 변경 전 운영 read-only API: KR 첫 요청 10,307ms, US 첫 요청 56,286ms, HTTP 200. warm 요청은 메모리 캐시 적중으로 비교에서 제외한다.
- 변경 회귀 테스트 2개 파일 10개 통과. 전체 테스트 276개 파일 중 275 passed/1 skipped, 1,484 passed/3 skipped. TypeScript 전체 검사 통과.
- `npm run deploy:verify` 통과: production dependency audit(0 vulnerabilities), docs/API/cron 감사, production build 및 standalone 실행, `/charts` desktop/mobile Chrome hydration, API smoke, 전체 테스트(1,486 passed/3 skipped), typecheck를 확인했다. 전체 개발 의존성 감사는 dev-only `picomatch@4.0.7` advisory 7 high를 계속 보고한다.
- 복원 회귀 테스트는 행 기반 D/W 봉 각각 65건, 7개 assertion을 통과했고 candle date/fetched-at metadata를 확인했다.
- 후속 복원 배포 뒤 broad US scan은 nginx HTTP 504로 약 60.8초에 두 번 종료됐다. 시총 하한을 $1T로 높인 선택 scan은 HTTP 200/10건, `Server-Timing` 8.1초, client elapsed 35.2초였다. `.env.local`의 localhost DB 연결은 거부되어 실행계획을 얻지 못했다.
- exchange 병렬화 회귀 테스트는 세 query와 전역 top-1 ranking을 확인한다. fixture 인자 가정을 바로잡은 뒤 2개 테스트 통과했다.
- exchange 병렬화 배포 `7c3cbb54` workflow #1325 성공, health와 `/charts`는 HTTP 200이지만 broad US cold scan은 60.6초에 HTTP 504였다.

- 최신 변경 검증: 전체 테스트 275 files passed/1 skipped (1,486 passed/3 skipped), TypeScript 검사 및 API/doc/KIS/auth/cron 게이트 통과. production build도 성공했다. standalone smoke는 `/charts` 200, JavaScript 11개 청크 200, 문서 endpoint 200, 검증 API 400, 보호 cron 401, desktop/mobile Chrome hydration을 확인했다. Next build가 자동 편집한 `next-env.d.ts`/`tsconfig.json`은 원복했다.
- `npm run measure:screener-db`는 `.env.local`에서 설정된 localhost PostgreSQL `:5432`가 ECONNREFUSED여서 실행계획을 얻지 못했다.
- 추가 정합성 검토에서 `marketCap` 필터 값이 `D.close` 같은 다른 지표 참조일 때 숫자 SQL prefilter가 참조 의미를 훼손할 수 있음을 확인했다. fast path를 유한 숫자 값으로만 제한하고 참조형 필터의 기존 전체 후보 경로를 회귀 테스트로 고정했다(대상 파일 3 tests 통과).
- 배포 전 `npm run audit:dependencies`는 통과했다. 전체 감사 `npm run audit:dependencies:all`은 dev-only advisory 7 high로 남아 있다. 운영 의존성 gate와 전체 감사 명령을 분리해 각각 추적한다.
- OCI commit `008b98c112bc84a02741fccfe43923bd4bace8bf`, workflow #1326 (run `44219391877`)가 Verify, package, upload, activate 성공으로 완료됐다. 배포 후 `/charts`와 `/api/health` 모두 HTTP 200, health `ok`를 확인했다.
- 동일 broad US payload의 배포 후 첫 요청은 HTTP 200, 10건, end-to-end 33,692ms, server timing 20,298ms였다. 기존 단일 cold 기준 56,286ms보다 약 40% 짧지만 cold 표본은 1회뿐이므로 p95나 지속적 개선으로 일반화하지 않는다. 두 후속 cache MISS 요청은 3,609ms/1,617ms 및 1,509ms/1,000ms (전체/server timing)로, 애플리케이션/DB가 이미 warm된 실행이다. 세 요청 모두 상위 AAPL이었고 candle 거래일 `20261117`, 갱신일시 `2026-11-17T22:20:26.783Z` metadata를 반환했다.

### 다음 개선
- 최초 OCI 배포 후 운영 read-only 측정 결과: KR cold 34.8초, US 24.9초 server timing (29.29초 end-to-end), 양쪽 10개 결과. 기존 기록 baseline KR 10.3초, US 56.3초와 시장별 결과가 엇갈려 집계안의 개선으로 판정하지 않는다.
- EXPLAIN 스크립트는 `.env.local`의 localhost PostgreSQL 연결 거부로 실행계획을 얻지 못했다. 이에 검증되지 않은 JSON_AGG 변경은 제거한다.
- market-cap 상위 rank fast path는 배포됐고 broad US cold 요청 HTTP 200을 확인했다. DB localhost가 연결되지 않아 EXPLAIN은 미확인이다. 동일 조건 여러 cold 표본을 수집해 median/p95를 산출하기 전까지 성능 개선 판정은 제한적으로 유지한다.

### 개선 과제
- 개선 과제 ID: CI-2026-11-18-001
- 성과 판정: PARTIAL
- 근거: 45초 UI 취소 제한을 90초로 늘리고 candle metadata와 ranking 회귀 검증을 보강했다. exchange 병렬화는 504를 해결하지 못했으나, 시총 상위 rank 사전 선택은 배포되어 같은 broad US 요청의 첫 측정이 HTTP 200/33.692초였다. cold 단일 표본과 EXPLAIN 미확인으로 성능 효과를 확정하지 않는다.

### 커밋·푸시·배포
- 상태: 집계안 `21423216` workflow #1323, 행 기반 복원 `054b1c60` workflow #1324, exchange 병렬화 `7c3cbb54` workflow #1325 배포 성공. 시총 상위 rank fast path는 local uncommitted이며 upstream dependency patch 또는 도구체인 변경과 audit 통과 전까지 OCI 배포 보류.

## [2026-11-04] 미국 소형주 공시·뉴스 이벤트 9차 100종목과 문서 관리 자동 검증

### 목표
- 운영 서버 공개 read-only 데이터를 기준으로 앞선 800 ticker와 겹치지 않는 활성 미국 보통주 100개를 조사한다. 공시 및 회사 IR 일정을 accession/event ID로 종목별 관리한다.
- snapshot, 공시 ledger, 재현 정의, canonical API 원장, 보고서와 catalog 간 연결 및 자동 검증을 보강한다.

### 반영
- 활성 US COMMON_STOCK universe/fundamentals 전체 coverage 5,216/5,216 확인. 저장 시총 USD $100m 이하 후보 569개 중 metadata 180건 및 SEC CIK 검증 후 100종목을 선택했다. 범위 $2,467,046–$37,074,489, 전부 2026-11-02 STALE snapshot이다.
- 운영 intelligence 100/100, RSS 263건·bullish 후보 41건. SEC submissions 4,758건 및 최근 SEC primary 문서 362건을 수집·대조했다. date candidates 73건은 사건 또는 해결된 제외 판정에 연결했다. 정규 이벤트 35건(SEC event 27/26 unique accession, official IR 8), 명시 제외 accession 12건이다.
- b09 review, accession ledger, definitions, 운영 보고서 및 canonical events를 업데이트했다. official event source와 accession을 분리하고 filing exclusion state를 두 원장에 연결했다.
- SEC scan failed array/integer 포맷, 전체 성공 coverage, future-date candidate decisions, review-ledger parity, eventKey uniqueness 및 legacy coverage compatibility를 generator/validator/docs contract에 반영했다. API docs와 133-document manual catalog도 갱신했다.

### 변경 파일 및 확인 대상
- scripts/generate-us-smallcap-event-batch.mjs, scripts/validate-us-smallcap-event-data.mjs, package.json
- data/market-impact-events.json 및 b09 review/ledger/definitions JSON
- docs/operations/us-smallcap-event-review-20261104-b09.md, us-smallcap-event-data-contract.md, docs/ERROR_HANDLING.md, DEVELOPMENT_LOG.md, public/document-catalog.json

### 검증
- batch validator: 100 issuers, 4,758 SEC submissions, 35 events, 27 accession-event relations, 12 explicitly excluded filings 통과.
- npm run docs:check 통과: 기존 8개와 신규 batch9 데이터 검증, 178 route/42 public GET API audit, 133개/7 category catalog, 28 entry points 및 migration docs. git diff --check 통과.
- 최초 OCI #1260은 Verify deployment·패키징·업로드를 통과했지만 Activate import 사전검증에서 35개 신규 eventKey 중 콜론이 포함된 값을 거부해 실패했다. import transaction 전에 중단되어 기존 운영 release/DB는 그대로였다. 운영 GET에서는 기존 US 이벤트 377건, 신규 b09 이벤트 0건으로 반영 전 상태를 확인했다.
- generator eventKey를 importer 정규식에 맞는 대문자 하이픈 구분자로 수정하고, validator에 전체 canonical `^[A-Z0-9._-]{1,64}$` 검사, 데이터 계약 및 ERROR_HANDLING에 원인·자동감지를 추가했다. 수정 후 docs:check, optimized build, runtime smoke/hydration, Vitest 1,542 passed/3 skipped, typecheck 및 전체 deploy:verify를 다시 통과했다. 자세한 내용은 [`docs/ERROR_HANDLING.md`](docs/ERROR_HANDLING.md)를 기준으로 유지한다.
- 운영 API/DB 검증은 read-only GET만 사용했고 write/refresh/알림 전송은 없다.

### 개선 과제
- 개선 과제 ID: CI-2026-11-04-009
- 성과 판정: IMPROVED
- 근거: batch9 전용 재현 정의·종목/공시 ledger와 canonical event 원장의 연결, future-date 후보 판정 완전성 및 문서 catalog/API inventory 자동 검증을 추가했다.

### 커밋·푸시·배포
- 상태: 완료. batch 자료 커밋 `17e178e9`, importer eventKey 수정 `6f231e8c`; 최초 OCI #1260은 schema 불일치로 사전검증 실패했고 OCI #1261에서 수정본 배포 성공. 운영 공개 events GET에서 신규 이벤트 35/35, 32 ticker, SEC accession 관계 27, IR 8을 확인했다. 전체 US 이벤트 412건. 보고서·데이터 계약 UTF-8 HTTP 200.
### 다음 개선
- 다음 100종목 batch에서 운영 시총 freshness를 재확인하고 stale 관측치는 현재 시총 인증으로 표현하지 않는다.
- 신규 batch는 공식 primary text 문맥으로 이벤트/조건부 일정을 판단하고 자동 날짜 후보 누락 게이트를 유지한다.
- 수정본은 전체 배포 게이트를 재통과했다. 다음 100종목 batch는 운영 시총 freshness와 동일한 import-schema 검사를 초기 수집 검증에 포함한다.
## [2026-11-04] 미국 소형주 공시·뉴스 이벤트 8차 배치와 자료 관리 개선

### 목표
- 앞선 700개와 ticker 중복 없이 운영 서버 기준 신규 미국 보통주 100개를 조사하고, 공시·회사 IR 일정 및 원문 연결을 종목별·공시별로 저장한다.
- 미국/현지 시각과 KST, 일정 확정 여부, 희석·상장유지·거래 종결 위험을 구분하고 문서 관리 검증을 다음 배치에도 적용한다.

### 반영
- localhost 활성 US COMMON_STOCK universe 5,216개와 운영 fundamentals 5,216/5,216을 대조했다. 앞선 700 ticker 제외 후 USD 시총 1억 달러 이하 후보 672개 중 200개 metadata 및 공식 SEC ticker-exchange CIK를 검사해 100개를 확정했다. royalty trust unit 3개, SEC registered fund 1개, preferred certificate 1개를 후보에서 제외했다.
- 저장 시총은 $9,402,493~$29,221,500이며 2026-11-02 관측으로 모두 STALE이다. 조사일 현재 시총 적격성으로 해석하지 않도록 review와 보고서에 freshness를 보존했다.
- 운영 market-intelligence 100/100 응답(RSS 375, bullish 47), SEC submissions 4,432건을 저장했다. SEC 원문 22 accession은 TARGETED_SECTION_REVIEW, 공식 회사 IR 일정 9건은 PRIMARY_SOURCE_REVIEWED로 분리해 총 31 이벤트를 만들었다. SEC 이벤트는 accession, IR 이벤트는 고유 IR eventId와 공식 URL로 연결한다.
- 일정 status, 정확히 확인된 현지 시각/KST, 주총 안건의 잠재 희석, Nasdaq 기한, 대출 만기, 법원 심리와 거래 outside date를 구조화했다. 시간이나 결과를 확인하지 못한 항목은 추정하지 않았고 direction/impact horizon은 UNCERTAIN/UNKNOWN으로 유지했다.
- `scripts/generate-us-smallcap-event-batch.mjs`에 SEC accession과 공식 IR URL 이벤트의 서로 다른 연결 경로를 추가했다. validator는 targeted SEC와 직접 확인된 다른 공식 1차 출처를 구분 검증한다. 모든 저장 review batch 간 ticker 중복 방지와 legal-type 제외 기준을 운영 문서에 명시했다.
- 첫 OCI 배포 #1256은 Activate release 단계에서 중단됐다. 재생성 과정에서 이전 `SEC:IR:*` 이벤트가 현재 review 목록에서 빠진 뒤에도 canonical 원장에 남아, 같은 `sourceType/sourceId/ticker/eventType`를 가진 새 IR event와 데이터베이스 identity 중복을 일으켰다. importer는 중복 사전검증에서 중단했고 DB transaction 시작 전이라 데이터베이스 변경은 없었으며 기존 운영 release가 유지됐다.
- 재발 방지를 위해 generator가 이전 동일 배치 event ID와 현재 비-SEC 정의와 같은 identity의 obsolete canonical 이벤트를 제거하고 새 이벤트를 upsert하도록 바꿨다. 모든 canonical US 이벤트에 importer와 동일한 identity 중복검사를 추가해 CI가 배포 전 감지하게 했다.
- 후속 public API 확인에서 일정의 현지/KST 시간이 API가 허용하는 `eventDetails` 필드에 실리지 않는 것을 찾아 `localDate/localTime/localTimezone/kstDate/kstTime` 구조를 추가했다. 미확인 시간은 `null`로 보존하고, validator가 canonical eventDate와 상세 날짜 일치 및 미확인 시간 null을 검사한다. 이벤트 데이터 계약에도 공개 필드를 기록했다.

### 변경 파일 및 확인 대상
- `scripts/generate-us-smallcap-event-batch.mjs`, `scripts/validate-us-smallcap-event-data.mjs`, `package.json`
- `data/market-impact-events.json`, `data/us-smallcap-event-review-20261104-b08.json`, `data/us-smallcap-filing-review-ledger-20261104-b08.json`, `data/us-smallcap-event-defs-20261104-b08.json`
- `docs/operations/us-smallcap-event-review-20261104-b08.md`, `docs/operations/us-smallcap-event-data-contract.md`, `public/document-catalog.json`
- `docs/ERROR_HANDLING.md`, `DEVELOPMENT_LOG.md`

### 검증
- b08 validator: 100 issuer, 4,432 SEC filings, 31 events, 22 accession-event relations, 22 TARGETED_SECTION_REVIEW, 9 PRIMARY_SOURCE_REVIEWED를 확인했다.
- `npm run docs:check` 통과: 기존 7개 배치와 b08의 중복·관계 검증, API surface, 132개 문서 catalog 및 문서 계약을 확인했다. 첫 검사에서 요구된 `### 다음 개선` heading 누락을 수정했고 후속 검사에서 통과했다.
- `git diff --check` 통과. `npm run deploy:verify` 통과: dependency audit 0개 취약점, build 107 pages, test 300 files (1,542 passed/3 skipped), typecheck, standalone runtime smoke, desktop/mobile Chrome hydration, API surface, verify-scope, KIS, Bearer, cron audits.
- 첫 운영 workflow #1256은 `events[366]`의 `SEC:IR:ir-2026-11-04`와 `events[369]`의 `IR:FTCI:ir-2026-11-04`가 같은 importer identity를 가져 Activate release에서 실패했다. 오류와 개선 내용을 `docs/ERROR_HANDLING.md`에 추가했다. identity 보강 뒤 canonical US 이벤트 374개, b08 이벤트 31개의 validator 검증은 통과했다.
- 수정 commit `e20c7023` / OCI #1257, eventDetails 후속 commit `09f8ba12` / OCI #1258 모두 성공했다. 최종 `npm run deploy:verify`와 문서 검증을 통과했다. 운영 공개 events GET에서 b08 eventId 31/31 및 FTCI 일정 08:30 EST / 22:30 KST를 `eventDetails`로 확인했다. 보고서 manual GET HTTP 200 UTF-8, 문서 카탈로그 검색 결과 1건도 확인했다.
- 운영 공개 GET과 localhost DB read-only 조회만 사용했다. 운영 DB 직접 접근/write, refresh API, 알림 전송은 수행하지 않았다.

### 남은 위험
- 현재 운영 시총 snapshot이 stale이므로 2026-11-04 현재 적격성은 확인되지 않았다. fresh snapshot 없이는 이를 현재 시총 기준 100개로 해석하지 않는다.
- 4,432건 filing 본문과 모든 exhibit의 전수검토는 하지 않았다. 이번 이벤트 근거 자료로 직접 검토한 SEC accession과 IR URL만 review 완료 처리했다.

### 다음 개선
- 다음 배치에서도 전체 fundamentals coverage, 공식 CIK/active COMMON_STOCK, 법적 보안유형, 전체 저장 배치 간 ticker 중복, 1차 출처 종류별 event link를 자동 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-11-04-008
- 성과 판정: IMPROVED
- 근거: SEC accession과 회사 IR URL의 출처 관계, importer identity 중복 방지, canonical eventDetails의 현지/KST 일정 정보를 구조화하고 문서·validator 계약으로 연결했다. 2회 후속 운영 배포 및 공개 GET 확인을 완료했다.

### 커밋·푸시·배포
- 상태: 완료. `e20c7023` / OCI #1257 identity 수정, `09f8ba12` / OCI #1258 eventDetails 개선 배포 성공. 공개 API 31/31 이벤트, 일정 현지/KST 상세, 보고서 UTF-8 및 문서 catalog GET 확인 완료.

## [2026-11-04] 미국 소형주 공시·뉴스 이벤트 7차 배치 및 자료 구조 개선

### 목표
- 누적 600개 이후 신규 100개 미국 active COMMON_STOCK를 운영 서버 기준으로 선정하고, 공시·뉴스 일정과 accession 검토상태를 종목·공시 단위로 저장한다.
- 7차 사전 점검의 “다음 배치 보류” 기록을 보완한다. 현재 적격성 판단이 아니라 2026-11-02 저장 snapshot 기준으로 조사하며 STALE을 그대로 표시한다.

### 반영
- 초기에 사용한 us-smallcap-shares API는 518개 후보만 반환해 전체 universe가 아니었다. 이를 후보의 완전 목록으로 쓰지 않고, localhost read-only 활성 US COMMON_STOCK universe 5,216개와 운영 공개 fundamentals 54회 GET 결과 5,216/5,216을 기준으로 다시 선정했다.
- 600개 과거 ticker를 제외한 USD 양수·시총 1억 달러 이하 772개 후보 중 시총 순으로 운영 종목 metadata 및 SEC 공식 ticker-exchange master 고유 CIK를 교차 확인했다. 160개까지 확인해 100개를 확정했고 metadata 실패·CIK 불일치 9건을 제외했다. 선정 시총은 $104,143~$19,836,858, 관측일은 전부 2026-11-02이며 STALE이다.
- 운영 market-intelligence 100/100 성공, RSS 332건·bullish 분류 53건. SEC submissions 100/100에서 4,182건을 수집했다. 최근 원문 528건은 SEC archive HTTP 200, 이 중 사건 관련 accession 13건에서 14개 일정/사건을 직접 검토했다. RSS 기사만으로 정규 이벤트를 확정하지 않았다.
- 종목 review JSON, accession filing ledger, 재현 가능한 event definitions, canonical event 원장, 운영 보고서에 ticker·CIK·accession·eventId 링크를 저장했다. 보고서에는 일정 상태, 현지시각/KST, 기한 및 배당·역분할·희석 위험, stale cap 한계를 분리했다.
- 배치 validator를 docs:check 체인에 연결하고, 전체 universe fundamentals 응답 수와 후보 선택 분모를 review에 기록·검증하도록 개선했다. 동일 accession에서 여러 이벤트가 생길 수 있으므로 이벤트 수와 공시 수를 잘못 같은 것으로 보는 체크를 고유 accession set 비교로 수정했다. 기존 issuer 중복도 fail-closed 검사한다.
- event batch generator는 같은 eventId 재생성 때 canonical event를 교체(upsert)하도록 수정해 재실행 후 이벤트 위험·요약이 예전 내용으로 남지 않게 했다. 이벤트별 위험을 definition 입력으로 기록한다.

### 변경 파일
- scripts/generate-us-smallcap-event-batch.mjs
- scripts/validate-us-smallcap-event-data.mjs
- package.json
- data/market-impact-events.json
- data/us-smallcap-event-review-20261104-b07.json
- data/us-smallcap-filing-review-ledger-20261104-b07.json
- data/us-smallcap-event-defs-20261104-b07.json
- docs/operations/us-smallcap-event-review-20261104-b07.md
- docs/operations/us-smallcap-event-data-contract.md
- docs/ERROR_HANDLING.md
- DEVELOPMENT_LOG.md

### 검증
- batch validator는 100 issuer, 4,182 submissions, 14 events, 14 accession-event relations, INVENTORY_ONLY 4,169 / TARGETED_SECTION_REVIEW 13을 확인했다.
- npm run docs:check 통과: 7개 batch validator, API surface audit, 131개 문서 catalog 및 documentation contract.
- git diff --check 통과.
- npm run deploy:verify 통과: dependency audit 취약점 0건, production build 107 pages, Vitest 300 files / 1,542 passed / 3 skipped, typecheck, standalone runtime smoke, Chrome desktop/mobile hydration, verify-scope/KIS/Bearer/cron 감사.
- 커밋·푸시·운영 배포 전이며, 통과한 게이트를 근거로 커밋 후 프로젝트 deploy workflow를 실행한다.

### 다음 개선
- 운영 시총 snapshot이 stale하므로 오늘 현재 시총 적격성은 확인되지 않았다. 현재 기준 universe가 필요하면 운영의 최신 snapshot이 갱신된 뒤 다시 선정해야 한다. 이 조사에서는 운영 쓰기·refresh 실행을 하지 않았다.
- 다음 배치도 전체 fundamentals 반환 수가 local universe와 일치하는지 자동으로 확인하고, CIK 불일치·분류 실패를 이름으로 보충하지 않는다.

### 개선 과제
- 개선 과제 ID: CI-2026-11-04-007
- 성과 판정: PARTIAL
- 근거: 후보 API 부분집합 오용을 전체 universe 수집으로 교정하고, issuer–filing–event 관계의 validator 및 generator 재실행 안정성을 개선했다.

### 커밋·푸시·배포
- 상태: 완료. 초기 커밋 `d36c698b` 운영 배포 및 SHA·문서·API read-only 확인을 마쳤다. 후속 로그 커밋에서 배포 결과를 기록한다.
- OCI GitHub Actions Deploy OCI #1254 (41783651715) 성공, 운영 /health-check SHA=d36c698b25775f4a982d763360d802b3786074cc 및 health HTTP 200 확인.
- 문서 카탈로그 검색에서 보고서가 등록됐으며 /manuals/operations/us-smallcap-event-review-20261104-b07.md는 UTF-8 HTTP 200이다. 운영 market-impact-events read-only GET에서 batch7 11개 ticker·14개 이벤트를 확인했다.
- 운영 DB 직접 접근·쓰기·refresh API 호출은 수행하지 않았다.

## [2026-11-04] 미국 소형주 이벤트 7차 배치 시총 신선도 사전 점검

### 목표
- 운영 서버 기준으로 누적 600개 issuer 이후 다음 100개 US active COMMON_STOCK 후보의 시총 $100m 이하 적격성을 확인한다.

### 반영
- localhost 운영 종목 universe를 read-only 조회해 active COMMON_STOCK 및 6개 비보통주 배제조건 일치 5,216개를 확인했다. 기존 6개 배치의 600 ticker를 제외했다.
- 운영 공개 us-smallcap-shares API 11페이지와 로컬 운영 universe 교집합에서 신규 후보 518개를 확인했다. 후보별 fundamentalsFetchedAt은 조사 시각 대비 44.6~45.1시간 전이었고 24시간 이내 관측은 0개였다.
- 자동 갱신 주기 문서에는 OCI cron 24시간 간격이 명시돼 있다. 공개 관리자 실행 이력 API는 401이라 현재 서버 실행 결과를 읽지 못했고, localhost automation_runs의 최신 실제 실행은 2026-08-25로 확인돼 현재 운영 근거로 사용하지 않았다. cron 실패 원인은 미확인이다.
- 표본 CMCT 운영 metadata는 시총 $9,402,493, 관측시각 2026-11-02T07:49:57Z, marketDataFreshness=STALE, age 161,983초로 반환됐다. 현재 시총 적격성을 입증하는 100개가 없어 batch7 issuer 확정과 SEC 원문 수집을 시작하지 않았다. 운영 API/DB write는 없었다.

### 변경 파일
- DEVELOPMENT_LOG.md

### 검증
- npm run deploy:verify 통과: dependency audit 0 vulnerabilities, production build 107 pages, Vitest 300 files/1,542 passed/3 skipped, typecheck, standalone runtime smoke, Chrome desktop/mobile hydration, docs/API/catalog 및 verify-scope/KIS/Bearer/cron 감사.
- 후보 페이지 조회는 공개 GET, 공식 universe 대조는 localhost DB read-only 경로를 사용했다. 후보 518개 freshness 집계 결과 24시간 이내 0개.
- npm run docs:check 및 git diff --check로 로그 계약과 문서 구조를 확인한다.

### 남은 위험
- 운영 fundamentals market cap snapshot이 2026-11-02 관측에서 갱신되지 않았다. 사용자 기준의 현시점 $100m 이하 universe는 아직 확정되지 않았다.

### 다음 개선
- 운영 서버가 24시간 이내 market snapshot을 공개할 때 재조회하고, 신선한 cap 기준을 통과한 issuer만 batch7 확정 목록에 넣는다. 운영 데이터 새로고침 쓰기는 현재 조사에서 수행하지 않는다.

### 개선 과제
- 개선 과제 ID: CI-2026-11-04-006
- 성과 판정: IMPROVED
- 근거: 518개 신규 후보의 실제 snapshot 시각을 집계해 stale cap을 현재 적격성으로 오인하는 것을 차단했고, 구조화 데이터 생성 전에 freshness 기준을 적용했다.

### 커밋·푸시·배포
- 상태: 미실행. 신선한 operating snapshot을 확인하지 못해 batch7 데이터 생성·배포는 진행하지 않았다.

## [2026-11-04] 미국 소형주 이벤트 원장 6차 배치 및 문서 검증 기준 개선

### 목표와 범위
- 운영 서버 기준으로 기존 500개와 중복되지 않는 다음 100개 미국 COMMON_STOCK의 SEC 공시·뉴스 이벤트를 조사하고 종목·공시별 구조 원장에 추가한다.
- 저장 시총 관측이 stale이면 그 사실을 정량 보고하고 현재 시총처럼 표현하지 않는다. SEC 제출 inventory와 본문 직접 검토 범위를 구분한다.

### 반영
- localhost만 허용하는 프로젝트 운영 추출 절차를 사용해 활성 US COMMON_STOCK 코드 5,216개를 read-only 조회했다. 기존 500개를 제외한 4,720개를 운영 fundamentals 공개 GET 49회로 확인했으며 반환 누락·실패는 0건이다.
- USD 양수·시총 상한 이하 후보 772개 중 운영 metadata와 SEC 공식 company_tickers_exchange.json의 고유 ticker/CIK가 일치하는 100개를 선정했다. 운영 metadata 100/100, active COMMON_STOCK, 6개 비보통주 배제 플래그 false, SEC CIK 교차 확인을 보존했다. 관측값은 모두 2026-11-02라 stale이며 현재 시총 1억 달러 이하를 보장하지 않는다는 한계를 구조화 자료와 보고서에 기록했다. CIK가 없거나 SEC identity가 불명확한 ticker는 제외했다.
- 운영 market-intelligence 100/100을 read-only GET으로 확인했다. RSS 516건, bullish 분류 73건, 운영 SEC event rows 0건이다. SEC submissions는 2025-11-04 포함~2026-11-05 미포함 4,274건을 inventory ledger에 저장했다.
- 10월 20일 이후 event 관련 filing 109건의 SEC 원문 HTTP 200을 확보했다. 주주총회 7건, 증자/부채·파산·상장위험 등 8건의 사건 관련 구간을 직접 확인해 15건을 TARGETED_SECTION_REVIEW로 연결했다. 나머지 4,259건은 INVENTORY_ONLY로 두어 전수 본문검토로 오인되지 않게 했다.
- SEC master 거래소 문자열과 운영 NAS/NYS/AMS 명칭이 달라지는 경우가 있어 거래소 라벨만으로 CIK를 추정하지 않고, 운영 metadata CIK와 공식 SEC row의 단일 동일 CIK를 기준으로 확인했다. metadata CIK 누락·SEC master 모호·운영 조회 실패는 fail-closed 처리했다.
- 검증 자동화에서 b03 legacy 원장에는 batchId가 없는데 `--batch`를 전달해 false failure가 발생했다. 저장 스키마 확인 후 b03은 legacy 호환 검증으로 두고 b04~b06은 batchId/100 issuer 강한 검증을 사용하도록 `docs:check`를 정비했다. 기존 API surface·catalog 검사도 보존했다.
- 배치 보고서, issuer review JSON, accession ledger, 재현용 event definitions, canonical events를 ticker·CIK·accession·eventId로 연결했다. 문서 관리 계약에는 stale 시총 보고 원칙, CIK fail-closed 기준, 배치 validator/catalog 등록 절차를 추가했다.

### 변경 파일
- data/market-impact-events.json, data/us-smallcap-event-review-20261104-b06.json, data/us-smallcap-filing-review-ledger-20261104-b06.json, data/us-smallcap-event-defs-20261104-b06.json
- docs/operations/us-smallcap-event-review-20261104-b06.md, docs/operations/us-smallcap-event-data-contract.md, public/document-catalog.json
- scripts/generate-us-smallcap-event-batch.mjs, package.json, DEVELOPMENT_LOG.md

### 검증
- 배치 6 validator 통과: issuer 100, SEC submissions 4,274, 직접 확인 events 15, accession-event relations 15, INVENTORY_ONLY 4,259 / TARGETED_SECTION_REVIEW 15.
- `npm run deploy:verify` 통과: 의존성 취약점 0건, production build 107 pages, Vitest 300 files/1,542 passed/3 skipped, typecheck, standalone runtime/API smoke, Chrome desktop/mobile hydration, docs/API/catalog, verify-scope/KIS/Bearer/cron 감사 통과. 최초 실행은 문서 계약 누락으로 차단됐고 보완 후 재실행해 통과했다.
- 운영 조회는 public GET과 localhost DB read-only만 사용했다. 배포 후 health=ok, /health-check SHA 일치, events API 페이지 순회에서 batch6 accession 관계 15/15, document catalog 130건 및 보고서 HTTP 200/text/markdown; charset=UTF-8을 확인했다. 운영 DB/API write는 없었다.

### 근본 원인·재발 감지·남은 위험
- 근본 원인: 기존 배치들의 CIK 보강 시점과 legacy schema가 서로 달랐고, 저장 시총 관측도 갱신 지연으로 stale이었다. 일괄 동일한 batchId/exchange-name 규칙을 가정하면 legacy 데이터 오탐 또는 SEC identity 오판 위험이 생긴다.
- 자동 감지: `docs:check`가 배치별 validator를 실행해 issuer 수, active COMMON_STOCK/6 flags, USD cap, CIK, filing/event 관계 및 문서 카탈로그 접근성을 확인한다. stale freshness는 review JSON·보고서의 observedAt과 함께 검토한다.
- 남은 위험: 배치 6의 100개 시총 모두 2026-11-02 관측치라 현재 적격성 미확정. 4,274 filing 중 4,259건은 본문 미검토. 상장·주총·자금조달 사건의 결과와 가격 영향은 미확정이며 주가 방향을 보장하지 않는다.

### 다음 개선
- 다음 100개 배치 시작 전 운영 시총 snapshot 갱신 여부를 확인하고, 최신값을 확보하지 못하면 현재 시총 적격으로 표현하지 않는다.

### 개선 과제
- 개선 과제 ID: CI-2026-11-04-005
- 성과 판정: IMPROVED
- 근거: 종목·공시·이벤트별 구조 원장과 재현 가능한 validator/catalog 연결을 추가했고, 누락된 로그 계약을 보완한 뒤 전체 deploy:verify가 통과했다.

### 커밋·푸시·배포
- 완료: 데이터 커밋 1d3715337de222bc24fb7c0e566b14dc2bf9f663를 origin/oci에 push했다. GitHub Actions Deploy OCI run 41773056609가 verify/package/SSH/upload/activation 모두 성공했고 운영 SHA 및 batch6 API·문서 응답을 확인했다.


## [2026-11-04] 미국 소형주 이벤트 원장 5차 배치 및 문서 관리 자동화

### 목표
- 운영 서버와 SEC 공식 공개자료를 기준으로 중복 없는 다음 100개 미국 active COMMON_STOCK, USD 시총 1억 이하 종목의 공시·뉴스 이벤트를 종목별·공시별로 정리한다.
- 배치 원장 생성·검증 과정을 재사용할 수 있도록 개선하고 100종목 단위 배포를 진행한다.

### 반영
- 운영 후보에서 CMCT는 SEC CIK 대조 불일치로 제외하고 BENF로 대체했다. 공식 SEC ticker master와 operating metadata의 CIK가 100/100 일치했다. 2026-11-04T02:59:14Z에 운영 metadata 100/100 재조회: 모두 active COMMON_STOCK, 6개 비보통주 플래그 false, USD cap $100m 이하. 단, market cap 관측값은 2026-11-02로 모두 STALE이다.
- 2025-11-04 포함~2026-11-05 미포함 SEC 제출 4,620건을 issuer별 filing ledger에 보관했다. 최신 operating intelligence는 100/100 성공, RSS 512건, bullish 분류 84건, operating SEC event rows 0건이다. SEC submissions 최신 메타데이터를 100개 issuer에서 재조회했고 11월 3일 이후 새 제출 10건을 확인했다. 일정 accession과 대조해 AZIO 연기 공시는 기존 event에 반영돼 있고 다른 새 제출은 주총 일정 accession 변경을 나타내지 않았다. 해당 새 filing 전문을 모두 읽었다는 뜻은 아니다.
- 타깃 SEC 원문 604건 중 초기 440건 HTTP 429를 paced retry로 604/604 HTTP 200 복구했다. 주총·Nasdaq 기한·공모·인수 등 직접 원문 구간 확인 43건은 TARGETED_SECTION_REVIEW, 나머지 4,577건은 INVENTORY_ONLY로 기록했다. 미국 동부 시간과 KST를 구분해 DLPN 11월 4일 10:00 ET 주총을 예정 일정으로 유지했다.
- review JSON, accession ledger, 재현 입력 event definitions, canonical event 43건과 운영 보고서를 추가했다. 재사용 배치 생성기와 validator를 연결하고, 6개 비보통주 플래그 및 reviewed filing batch/SEC URL CIK 확인을 강화했다. SEC 429 재수집 절차를 자료 관리 계약에 기록했다.

### 변경 파일
- data/market-impact-events.json, data/us-smallcap-event-review-20261104-b05.json, data/us-smallcap-filing-review-ledger-20261104-b05.json, data/us-smallcap-event-defs-20261104-b05.json
- docs/operations/us-smallcap-event-review-20261104-b05.md, docs/operations/us-smallcap-event-data-contract.md, public/document-catalog.json
- scripts/generate-us-smallcap-event-batch.mjs, scripts/validate-us-smallcap-event-data.mjs, package.json, DEVELOPMENT_LOG.md

### 검증
- 배치 5 validator 통과: 100 issuer, 4,620 SEC filings, 43 events, accession-event links 43, INVENTORY_ONLY 4,577 / TARGETED_SECTION_REVIEW 43. 배치 1~4도 통과.
- docs:check 통과: 문서 카탈로그 129개/7 categories, 178 API routes/42 public GET, 165 migrations 검사. git diff --check 통과.
- deploy:verify exit 0: dependency audit 취약점 0, production build 107 pages, full tests 300 files/1,542 passed/3 skipped, typecheck, standalone runtime/API smoke, Chrome desktop/mobile hydration, verify-scope/KIS/Bearer/cron/docs checks 통과.
- 운영 API/DB write 없음. 현재 시총은 stale; 전체 4,620 filings의 본문 전수 검토도 아니다.

### 다음 개선
- 다음 100개 배치 전에 운영 metadata와 최신 submissions를 다시 확인하고, 회사 후속 일정 변경·상장기한 해소 공시를 추적한다.
- 자동 감지: docs:check에서 배치별 100 issuer, 6개 분류 flags, cap bounds, event parity, accession/CIK 소유권과 filing counts를 검사한다. SEC 429는 paced retry 성공 전에 review 완료로 승격하지 않는다.
- 남은 위험: 시총 값은 11월 2일 stale snapshot이고 filing 전문 4,577건은 미검토다. 이벤트 결과가 주가 방향을 보장하지 않으며 Nasdaq 기한이 상장폐지를 확정하지 않는다.

### 개선 과제
- 개선 과제 ID: CI-2026-11-04-003
- 성과 판정: IMPROVED
- 근거: 재사용 생성기·검토 정의 입력, 6개 분류 flag와 CIK 연결 자동 검증을 추가하고 전체 deployment verification을 통과했다.

### 커밋·푸시·배포
- 완료: 데이터 커밋 `ed52908be8ed9f80308940abdb6b2634b7f1946e`를 `oci`에 push했다. GitHub Actions [Deploy OCI run 41765621215](https://github.com/pjtss/StockMan/actions/runs/41765621215)이 verify/package/SSH/upload/activation 모두 성공했다.
- 배포 후 `/api/health` status=ok, `/health-check` SHA 일치, US events API 317건 중 배치 5 eventId 43/43, document catalog 129건에 b05 report 등록, manual GET HTTP 200 및 `text/markdown; charset=UTF-8`를 확인했다. 운영 API/DB write 없음.

## [2026-10-31] 이벤트 occurrence 조회 API 추가

### 목표
- 대표 이벤트 날짜뿐 아니라 공시 JSON의 개별 `keyDates` 날짜를 직접 필터·페이지 조회할 수 있게 API 기능을 확장한다. UI는 추가하지 않는다.

### 반영
- 원인: 기존 `/api/public/market-impact-events`는 각 이벤트의 대표 `eventDate`로만 필터·정렬했고 `keyDates`는 응답 JSON의 중첩 배열로만 제공했다. 따라서 일정 발생일 캘린더 검색에서 날짜 조건과 페이지 단위를 일치시킬 수 없었다.
- `GET /api/public/market-impact-event-occurrences`를 추가해 JSONB keyDates의 유효한 달력 날짜만 일정별 row로 반환한다. 일정 상태·시장·티커·eventType·날짜 범위 필터와 occurrence 단위 keyset cursor를 제공한다.
- 중복 발생 날짜도 누락되지 않도록 `(occurrence_date DESC, event_id ASC, ordinal ASC)`를 정렬 키로 사용한다. Cursor에 마지막 발생일·eventId·배열 위치 및 전체 query scope를 저장해 안정적인 다음 페이지를 보장하고 scope 변경 커서는 거부한다.
- 변경 파일: occurrence API route/test, `scripts/api-surface.mjs`, OpenAPI·route inventory 생성물, API reference/README, 이벤트 설계 문서, 본 개발 로그.

### 검증
- occurrence route 테스트 3개, 최신 `origin/oci` 위에서 일정 API regression 9개 통과. 첫 전체 테스트 병렬 실행은 1,497개 통과 후 worker startup timeout 4건으로 게이트 실패했으나, 최신 브랜치 재실행 `npm test -- --maxWorkers=2`는 298개 파일/1,536개 테스트 통과, skip 1개 파일/3개였다. timeout이 난 4개 파일도 `--maxWorkers=1`로 36개 테스트 재검증 통과.
- 최신 브랜치 `npm run typecheck` 통과. 격리 PostgreSQL clone의 market_impact_events JSONB를 펼치는 실제 쿼리에서 유효 keyDate 6건 확인, 원본 DB 변경 없음.
- `npm run docs:check` 첫 실행은 개발 로그 계약(개선 과제·판정·근거·다음 개선 항목 누락) 검증에서 실패해 이 구조를 보완했고 최종 검증에서 통과했다.
- 최신 브랜치 API surface 검사 178 route files/42 public GET 통과. verify-scope, KIS boundary, Bearer auth, OCI cron audit, `docs:check` 및 `git diff --check` 통과.
- `npm run deploy:verify`는 rebase 전 커밋에서 통과했고, rebase 후에는 전체 테스트 1,536개·typecheck·docs 및 최신 route 포함 production build가 각각 통과했다. rebase 후 standalone 브라우저 smoke는 OCI GitHub Actions에서 배포 전 재검증한다.

### 남은 위험과 다음 항목
- `keyDates`는 JSONB 배열이므로 일정 날짜 조회는 DB에서 배열을 펼친다. 데이터가 커지면 정규화된 occurrence 테이블과 GIN/일정 날짜 인덱스를 검토하되, 현재 이벤트 규모와 실제 실행계획 측정 없이 migration을 추가하지 않는다.
- 배포 후 운영 endpoint에서 무인증 조회, 일정 날짜 필터, 두 페이지 경계와 health를 확인한다.

### 다음 개선
- [ ] 운영 일정 수가 증가하면 occurrence 쿼리의 운영 분포 실행계획과 p50/p95를 측정하고, JSONB 배열 확장 비용이 유의할 때만 정규화 저장소를 설계한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-31-004
- 성과 판정: IMPROVED
- 근거: 개별 keyDate 발생일을 직접 필터링하는 API를 추가했고 route 단위 테스트 3개 및 격리 PostgreSQL 실제 JSONB 조회에서 일정 6건을 확인했다. 최신 `origin/oci` 위에서 전체 테스트 1,536개와 production build를 통과했다.

### 커밋·푸시·배포
- 완료: 커밋 `d283ede3034200c3920c41d6fe3504bf2a55ddde`를 `oci`에 push했고 GitHub Actions Deploy OCI run `41217945968`이 verify, package, upload, activate 모두 성공했다.
- 배포 후 무인증 `/api/health`에서 `status=ok`, `/api/public/market-impact-event-occurrences?limit=1`에서 schema `market-impact-event-occurrences.v1`과 실제 KR 일정 `2027-01-05`를 확인했다. 동일 query의 cursor 다음 페이지도 서로 다른 occurrence를 반환했고 `/openapi.json`에 새 GET operation이 포함됐다.

## [2026-10-31] 공시 이벤트 일정 조회 API 개선

### 목표
- 관리 JSON의 상세 일정과 분석 정보를 공개 조회 API에서 활용하고, 상태·유형별 탐색과 500건 초과 결과 페이지 처리를 지원한다. 범위는 API 전용이며 UI는 추가하지 않는다.

### 반영
- 원인: `keyDates`와 `eventDetails`는 DB `raw_event`에 보존됐지만 조회 API가 선택하지 않아 소비자가 받을 수 없었다. 목록은 최대 500건에서 끊기고 상태·이벤트 유형을 서버에서 필터링할 수 없었다.
- 기존 `market-impact-events.v1` 응답 item에 `keyDates`와 `eventDetails`를 추가했다. JSON 값의 타입이 예상과 다르면 빈 배열·객체로 응답한다. DB 구조가 기존 `raw_event`를 사용하므로 새 migration은 필요하지 않다.
- `status`와 `eventType` 필터를 추가하고, `(event_date DESC, published_at DESC NULLS LAST, event_id ASC)` keyset 페이지네이션과 `nextCursor`를 추가했다. 커서는 정렬 키의 timestamp 정밀도와 검색 조건·limit을 포함해 필터 변경 재사용을 거부한다.
- OpenAPI query/response schema, API 수동 레퍼런스, API README, 이벤트 설계 문서, route regression 테스트를 함께 갱신했다. 사용자의 범위 지정에 따라 일정 UI·메뉴·홈 링크는 추가하지 않았다.

### 검증
- 이벤트 조회 route 회귀 테스트 6개 통과, `npm run typecheck` 통과.
- 격리 PostgreSQL 복제본에서 실제 SQL로 상세 일정 JSON, `ESTIMATED`+`CLINICAL_TRIAL_READOUT` 필터, 커서 다음 페이지를 확인했다. 두 페이지의 eventId가 겹치지 않았고 상세 keyDates/eventDetails가 반환됐다. 원본 DB 쓰기 없음.
- API surface 검사 통과(176 route files, 40 public GET), 문서 검사 통과(28 entry points, V165까지 165 migrations), `git diff --check` 통과.
- UI 제거 후 API 전용 `npm run build`가 exit 0으로 완료됐다. 격리 worktree의 임시 `node_modules` junction 때문에 Next standalone trace에서 symlink 복사 `EPERM` 경고가 있었으나 빌드는 성공했다. Next가 자동 변경한 `tsconfig.json`, `next-env.d.ts`, `tsconfig.tsbuildinfo`는 원상 복구했다.

### 남은 한계
- `date/from/to`와 정렬은 대표 `eventDate` 기준이며, 각 `keyDates` 날짜를 독립 일정 occurrence로 필터링·정렬하지 않는다. 월·일·시각 표현이 혼재한 keyDates를 별도 캘린더 날짜로 다뤄야 할 때 occurrence 계약을 분리한다.
- API 응답이 상세 JSON을 포함하므로 이벤트별 상세 데이터가 커지면 응답 바이트를 다시 측정한다.

### 다음 개선
- [ ] 월 단위/일 단위/시각 포함 keyDate의 의미를 합의한 뒤 필요 시 일정 occurrence API로 분리한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-31-003
- 성과 판정: IMPROVED
- 근거: 사용자가 필요로 한 API 경로에서 주요 일정 상세, 상태·유형 필터, 이어 읽기 기능을 제공하며 단위 테스트·타입·실제 복제 DB SQL 검증을 통과했다.

### 커밋·푸시·배포
- 미실행.

## [2026-10-31] 공시 이벤트 조회 인덱스 성능 개선

### 목표
- 공시 이벤트 조회 API의 속도·메모리 사용을 실제 로컬 DB 환경으로 확인하고, 응답 계약과 필터 동작을 바꾸지 않으면서 병목을 줄인다.

### 반영
- 로컬 `.env.local`이 가리키는 loopback `stockman` DB를 read-only로 확인했다. DB 크기는 7,814,241,303 bytes, Flyway는 V161(104 success, failed 0)이었고 `market_impact_events` 테이블은 없었다.
- 사용자가 승인한 격리 복제본을 PostgreSQL 16 컨테이너와 별도 볼륨으로 만들었다. 원본은 계속 read-only로 유지했다. 논리 백업을 복원한 복제 DB 크기는 5,058 MB였다. 복원은 물리 페이지를 재구성하므로 원본 DB 크기와 복제본 크기가 같지 않다.
- 원인: 조회의 정렬은 `(event_date DESC, published_at DESC NULLS LAST, event_id)`인데 기존 인덱스는 `(event_date, market, ticker)`와 `(ticker, event_date)`에서 끝나, 전체 조회는 `LIMIT`이 있어도 후보 행을 incremental sort 했다.
- V165는 전체 정렬 키 인덱스 하나를 추가한다. 기존 날짜·티커 인덱스는 선택도 높은 희소 필터 조회에 계속 사용하도록 유지한다. API route, 필터 의미, 결과 DTO와 상한은 변경하지 않는다.
- 변경 파일: `db/migration/V165__market_impact_event_query_order.sql`, `docs/architecture/market-impact-events-design.md`, `docs/operations/runbook.md`, `DEVELOPMENT_LOG.md`.
- 복제본에서 Flyway가 전체 165개 migration을 validate한 뒤 V162–V165를 적용했다. 현재 이벤트 JSON 4건을 기존 공식 보통주 마스터로 검증해 importer로 적재했다.
- 확장 실험은 실제 `market_impact_events` 테이블에 합성 10,000행을 transaction 안에서만 추가해 수행하고 rollback했다. 복제본에는 관리 JSON 4건만 남겼다.

### 검증
- 원본 DB는 마지막까지 read-only였다. 복제본의 V161 history 상태와 복원된 데이터베이스를 기준으로 Flyway CLI 13.3.0이 전체 migration을 validate하고 V162–V165 네 migration을 성공 적용했다.
- 4개 실제 이벤트로 API SQL을 5회 warm-up 후 20회 측정했다. V165 전/후 계획은 네 필터 모두 `Seq Scan + Sort`였으므로 이 소량 데이터에서는 인덱스 이점을 확인할 수 없다. 응답 envelope 크기는 전체 10,314 bytes, US 7,619, KR 2,876, ticker 2,880이었다. 중앙값/p95(ms)는 전체 0.102/0.111→0.070/0.103, US 0.087/0.091→0.072/0.096, KR 0.079/0.136→0.065/0.092, ticker 0.085/0.119→0.066/0.126이었다. 이 작은 차이는 유의한 성능 개선으로 간주하지 않는다.
- 실제 API 테이블에서 총 10,004행(관리 JSON 4 + transaction 내 합성 10,000)으로 동일 SQL을 5회 warm-up 후 20회 측정했다. 모든 필터의 정렬된 event ID가 인덱스 전후 동일했다. 중앙값/p95(ms): 전체 1.476/1.559→0.570/0.632, US 1.725/2.291→0.745/0.822, KR 1.553/3.862→0.785/0.830, ticker 0.558/0.613→0.615/0.725. 전체·US·KR은 V165 index scan으로 정렬 단계를 제거했고, ticker 선택 조회는 기존 `market_impact_events_ticker_date_idx`를 계속 사용했다.
- 10,004행 실험 응답 크기는 최대 LIMIT 500 기준 전체 295,885 bytes, US 293,757, KR 290,145, ticker 60,430이었다. transaction rollback 뒤 event count=4 및 V165 index 존재를 다시 확인했다. 합성 행 결과는 확장 시점 실행계획 검증이며 운영 p95로 간주하지 않는다.
- 이전 임시 relation 기반 10,000행 측정은 반복 가능한 보조 실험으로 보존한다. 실제 clone 테이블 실험 결과를 주된 수치로 사용한다.

### 다음 개선
- [ ] 실제 운영/로컬 누적 이벤트 행 수가 수천 건 이상이 되면 production-like 분포로 계획과 API p50/p95를 재측정한다.
- [ ] 운영 쓰기량이 늘어난 뒤 V165 인덱스의 쓰기 비용 및 실제 buffer read 비율을 확인하고 필요하면 기존 인덱스와 통합한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-31-002
- 성과 판정: PARTIAL
- 근거: 복제본 실제 API 테이블에서 10,000행 규모 쿼리의 전체·US·KR 정렬 단계를 제거했고 응답 순서를 보존했다. 실제 관리 JSON은 4건이라 현재 규모에서는 새 인덱스가 선택되지 않았다. 이 실험은 운영 트래픽 p95나 쓰기 비용을 대변하지 않는다.

### 커밋·푸시·배포
- 미실행.

## [2026-10-31] 공시 이벤트 자연 키 중복 방지

### 목표
- 재분석으로 eventId 문자열만 다른 동일 공시 이벤트가 JSON/운영 DB에 중복 등록되는 경로를 막고, 한 공시의 복수 독립 사건은 명시적으로 구분한다.

### 반영
- 원인: 기존 PK와 importer 중복 검사는 `eventId`만 고유하게 보장해, 같은 공시·종목·이벤트 유형이 다른 eventId로 제출되면 DB에 중복 행이 생길 수 있었다.
- `eventKey` 및 자연 키 `(market, sourceType, sourceId, ticker, eventType, eventKey)`를 추가한다. 기본 eventKey는 `DEFAULT`; 같은 filing에서 같은 유형의 서로 다른 사건에만 개별 eventKey를 준다.
- V164 migration은 기존 `eventKey`를 `DEFAULT`로 채우고 사전 중복 검사 후 unique index를 추가한다. 충돌이 발견되면 migration을 중단해 release 전환을 막는다.
- importer는 JSON 내부 중복 identity 및 운영 DB에 다른 eventId로 저장된 identity를 트랜잭션 쓰기 전에 거부한다. eventId upsert는 유지하며, DB unique index가 동시 importer 경합도 차단한다.
- 공개 이벤트 API가 `eventKey`를 반환하고, 가이드 API를 1.1.0으로 갱신했다. 데이터 계약·API·DB·운영 문서와 식별 규칙 테스트를 함께 반영한다.

### 검증
- 현재 JSON 4건: eventId 및 자연 키 중복 없음.
- 운영 공개 API `GET /api/public/market-impact-events?limit=500` 4건: 자연 키 중복 없음. 조회는 무인증·읽기 전용이었다.
- `node scripts/import-market-impact-events.mjs --dry-run`: 관리 JSON 4건 파싱 및 KR/US 활성 COMMON_STOCK 마스터 검증 통과, DB 쓰기 없음.
- 관련 identity/API 회귀 테스트: importer syntax, JSON duplicate audit와 unit/API regression 확인 통과. 최신 `origin/oci` 변경을 반영한 API surface는 176 route files·40 public GET, docs:check는 28 entry points·164 migrations 통과.
- 첫 `npm.cmd run deploy:verify`는 가이드 버전 상향 뒤 회귀 테스트가 이전 기대값 `1.0.0`을 유지해 실패했고 배포를 차단했다. 테스트 기대값을 `1.1.0`으로 동기화했다.
- 최신 `origin/oci` 위에서 최종 `DEPLOY_VERIFY_SMOKE_REQUEST_TIMEOUT_MS=60000 npm.cmd run deploy:verify`: 통과. dependency audit 0 vulnerabilities, production build, standalone/OpenAPI 40 read operations, Chrome desktop/mobile, 296개 테스트 파일 중 295개 통과·1개 skip, 1,526 passed·3 skipped, typecheck, docs, verify-scope, KIS, Bearer auth 및 OCI cron 감사 통과.
- 첫 검증의 stale guideVersion 기대값은 `1.1.0`으로 수정 후 전체 재실행에서 통과했다.
- V164 migration은 Deploy OCI run `41176748601`에서 운영 PostgreSQL 16.15에 성공 적용되어 schema version이 164가 됐다. activation은 importer 실행 시 package에 `scripts/market-impact-event-identity.mjs`가 빠져 실패했다. `.github/workflows/deploy-oci.yml`에 helper 복사 및 tar 내부 존재 assertion을 추가한 수정(commit `053a90eb`)이 `oci`에 반영되어 Deploy OCI run `41181213216`이 성공했다. 최신 브랜치(run `41182285981`, SHA `c9e95bfe`)도 전체 verify·package·activation까지 성공했다. 로컬 최종 `npm.cmd run deploy:verify`도 통과: dependency audit 취약점 0, production build, standalone·Chrome desktop/mobile·API smoke, 297개 테스트 파일(296 passed·1 skipped), 1,528 passed·3 skipped, typecheck, 177 route·41 public GET·123문서·V164 검사, verify-scope/KIS/auth/OCI cron 감사. 운영 `/api/health` HTTP 200, `/health-check` Flyway V164, guide API 1.1.0을 확인했다. 이벤트 API는 4건 모두 eventKey `DEFAULT`를 반환했고 자연 키 4개가 모두 고유했다. helper 누락 없는 release archive로 importer가 수행되어 운영 기능을 확인했다. 다른 공시 접수번호로 표현된 동일 실질 사건은 자동 연결하지 않으므로 analyst review가 남은 위험이다.

### 다음 개선
- [ ] 같은 실질 사건이 서로 다른 accession/접수번호로 별도 공시될 때 eventId/eventKey를 기존 사건과 연결하는 검토 절차를 후속 운영 지침에 보강한다.
- [x] 배포 후 Flyway V164 및 공개 API의 eventKey 반환, 자연 키 중복 부재를 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-31-001
- 성과 판정: UNMEASURED
- 근거: 저장소와 운영 API에서 현재 중복은 관찰되지 않았다. 새 자연 키 차단 로직은 코드·migration 검증을 통과했으며, 실제 운영 차단은 V164 배포 후 확인해야 성과를 판정할 수 있다.

### 커밋·푸시·배포
- 진행 중: 구현 및 배포 전 검증 단계. 커밋·푸시·운영 배포 미완료.

## [2026-10-30] LLM 단일 매뉴얼의 라이브 문서·API 탐색

### 목표
- 다운로드 매뉴얼 하나만 LLM에 전달하면 매 작업에서 운영 서버의 최신 공개 API 계약 및 문서 카탈로그를 직접 찾아 읽을 수 있게 한다. 비공개·미문서화 내부 구조를 노출한다고 약속하지 않는다.

### 반영
- `GET /api/public/api-manual`: OpenAPI 공개 무인증 GET의 기능, 필수·선택 path/query/header 입력, 응답 schema, 인증 분류와 source 경로를 검색한다.
- `GET /api/public/document-catalog` 및 `/document-catalog.json`: 문서 122개를 7개 범주로 탐색하고 `/manuals/...`에서 선택된 원문을 읽게 한다. 내부 route inventory는 공개 카탈로그에서 제외한다.
- OpenAPI·문서 카탈로그 생성을 `docs:check` 및 `prebuild`에 연결하고 standalone smoke에서 검색 API와 문서 원문 제공을 확인한다.
- `public/llms.txt`, API 레퍼런스와 프로젝트 문서 인덱스가 단일 live discovery 경로를 안내하도록 갱신한다. 다운로드 매뉴얼은 매 대화마다 이 링크를 조회하며, 미배포·비공개·미문서화 동작은 알 수 없다고 설명한다.

### 검증
- `npm.cmd run docs:check`: 통과. 176 route와 공개 GET 40개 OpenAPI, 문서 122개/7개 범주, 28개 entry points, migrations 163개/V163, 운영 관계 25개를 확인했다.
- `npm.cmd run deploy:verify`: 통과. npm audit 취약점 0개, Next production build, standalone 문서/API·차트 및 응답 smoke, Chrome desktop/mobile hydration, 테스트 294 files (1,523 passed, 3 skipped), 격리 TypeScript 검사, API/cron/auth/scope 감사 통과.
- `git diff --check`: 변경 파일 통과. 원격 배포 workflow 실행 및 운영 URL 확인은 push 이후 수행한다.

### 다음 개선
- [ ] 응답이 `generic-schema`로 표시된 API의 DTO를 실제 route 계약과 대조해 OpenAPI에 단계적으로 구체화한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-30-003
- 성과 판정: UNMEASURED
- 근거: 122개 문서와 공개 GET 40개 API를 위한 live discovery 경로를 구성했고 전체 deploy verifier를 통과했다. 운영 workflow와 URL 확인은 푸시 이후 남아 있다.

### 커밋·푸시·배포
- 아직 미실행.
## [2026-10-30] OBV 다이버전스 요청형 Discord Webhook 전달

### 목표
- 미국 USD 시총 1억 달러 이하 공식 보통주를 다이버전스 모듈로 추출하고, 보호된 POST를 통해 티커 목록을 Discord incoming webhook으로 전송한다.

### 반영
- `lib/us-obv-divergence-scan.ts`: 최신 USD 시총 조건과 일봉 기반 공통 스캔을 구현하고, snapshot 경로와 즉석 요청 경로가 같은 계산 모듈을 공유한다.
- `lib/discord-us-obv-divergence.ts`, `app/api/cron/us-obv-divergence-discord/route.ts`: 별도 format/delivery 계층과 CRON_SECRET 보호 POST를 구현했다. 결과 티커를 쉼표로 구분해 전송하며 mention parsing을 비활성화한다.
- `docs/architecture/us-obv-divergence-api-design.md`, OpenAPI/API reference를 요청 경로와 USD $100M 기준에 맞췄다.

### 검증
- `npm.cmd run verify`: 294개 테스트 파일 통과(1,523 passed, 3 skipped), typecheck, docs:check, API surface(174 routes/38 public GET), verify-scope, KIS boundary, Bearer auth, OCI cron, production build 모두 통과.
- `DEPLOY_VERIFY_SMOKE_REQUEST_TIMEOUT_MS=60000 npm.cmd run deploy:verify`: 의존성 취약점 0건, production build, standalone 서버 기동/종료, `/charts`·브라우저 hydration·정적 JS 11개·API/인증 smoke와 전체 quality gate 통과.
- 로컬 DB `BEGIN READ ONLY` 실측: 일봉 기준 2026-10-26, 공식 COMMON_STOCK 5,216개, USD fundamentals 5,216개, $100M 이하 1,365개, 실제 평가 1,316개(96.41%), 후보 29개. 후보 전부 양수·$100M 이하 확인; 티커는 API/Discord 메시지에서 쉼표로 구분한다.
- 로컬 feature/env 설정에는 Discord webhook이 없었다. 실제 Discord 발송은 하지 않았으며 운영 URL 설정과 배포 CI 결과는 아직 미확인이다.
- 운영 Discord webhook으로 메시지를 보내지는 않는다.

### 다음 개선
- [ ] 운영 Webhook URL이 서버 feature 설정 또는 `US_OBV_DIVERGENCE_DISCORD_WEBHOOK_URL`에 등록된 뒤 승인된 실행으로 수신 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-30-004
- 성과 판정: PARTIAL
- 근거: 원격 최신 `oci` 기준으로 이번 스캔·Webhook 변경만 분리했고 full deploy verification 및 read-only DB 결과를 확인했다. CI 운영 배포와 운영 Webhook 수신 확인은 아직 남았다.

### 커밋·푸시·배포
- 미실행.

## [2026-10-30] 공시 이벤트 작성 가이드 무인증 API 추가 및 운영 배포

### 목표
- ChatGPT 웹 등 소비자가 국내·미국 공시 분석 기준과 이벤트 JSON 계약을 API로 조회하고, 기존 이벤트 JSON/운영 DB 흐름에 맞는 변경안을 만들 수 있도록 버전형 가이드 GET을 제공한다.

### 반영
- `data/market-impact-event-guide.json`을 가이드 응답의 단일 원본으로 추가했다. 이벤트 스키마, 시장별 원문·종목 검증 기준, 상태·방향 enum, 분석 절차, 운영 반영 경로, Draft 2020-12 JSON Schema, ChatGPT 프롬프트를 포함한다.
- `GET /api/public/market-impact-events/guide`를 무인증·읽기 전용 정적 route로 추가했다. `guideVersion`과 응답 `schemaVersion`을 분리해 이후 호환 가능한 안내 수정과 구조 변경을 구분한다. 가이드 endpoint는 파일/DB를 변경하지 않는다.
- API surface generator, OpenAPI, route inventory, `/api-reference.md`, `/llms.txt`, API·이벤트 설계 문서 및 본 개선 로그를 갱신했다.
- 관련 회귀 테스트를 추가해 국내·미국 분리, 가이드 버전 및 JSON Schema 응답을 확인한다.

### 검증
- `npm.cmd run docs:api:generate`: route 173개 및 공개 GET 38개 생성.
- `npm.cmd run audit:api-surface`, `npm.cmd run docs:check`, `git diff --check`: 통과.
- `DEPLOY_VERIFY_SMOKE_REQUEST_TIMEOUT_MS=60000 npm.cmd run deploy:verify`: npm audit 0 vulnerabilities, production build, standalone/OpenAPI 38개 공개 GET 및 기존 Chrome desktop/mobile smoke 통과. 신규 route는 build output에서 static route로 생성됐다.
- 전체 Vitest: 295개 파일 중 294개 통과·1개 skip, 1,523개 통과·3개 skip. guide route 회귀 테스트에서 무인증 응답, 가이드·스키마 버전, KR/US 경로, JSON Schema 및 cache policy를 확인했다.
- typecheck, docs:check(24 entry points·163 migrations), verify-scope, KIS boundary, Bearer auth(173 routes), OCI cron(21 shared endpoints), API surface(173 route files·38 public GET) 모두 통과.
- `git diff --check`: 통과.
- 운영 배포 run `41019153797` 성공: Verify, standalone package, SSH configure, release upload, OCI activation 전 단계 통과.
- 배포 후 `https://stockman.r-e.kr/api/public/market-impact-events/guide` 무인증 GET은 HTTP 200, `guideVersion=1.0.0`, `schemaVersion=market-impact-event-guide.v1`, KR/US 경로, Draft 2020-12 schema, prompt 및 public cache 정책을 반환했다. `/openapi.json`에 해당 경로가 있고 operation security는 빈 배열이다.
- 운영 `/api/health`는 `ok`; 기존 `GET /api/public/market-impact-events?market=KR&limit=1`도 인증 없이 `market-impact-events.v1` 응답을 반환했다.

### 다음 개선
- [x] 배포 후 guide endpoint를 인증 헤더 없이 조회하고 응답의 guide/schema 버전, KR/US 경로, JSON Schema 및 프롬프트 필드를 확인한다.
- [ ] 이벤트 계약 필드가 바뀔 때 가이드 JSON, importer, DB/API 응답 계약, 예시 데이터 및 API 문서를 함께 갱신하는 절차를 유지한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-30-002
- 성과 판정: IMPROVED
- 근거: 전체 검증, Deploy OCI run `41019153797`, 운영 health와 무인증 guide/event GET을 확인했다. guide 응답은 두 시장 분리 경로와 JSON Schema·프롬프트를 제공하고 OpenAPI에서 인증 없이 발견된다.

### 커밋·푸시·배포
- 완료: 구현 커밋 `a2d4a8f5`를 `origin/oci`에 push했고 Deploy OCI run `41019153797` 성공과 운영 health·guide/event 무인증 GET을 확인했다. 운영 확인 결과를 기록한 후속 커밋 `8d5e9a27`도 push했으며 동일 코드의 Deploy OCI run `41020731267`이 성공했다.

## [2026-10-30] SEC 기반 미국 이벤트 일정 추가

### 목표
- 실제 SEC 제출 자료에서 향후 미국 상장사 실적 일정과 임상 결과 예상 시기를 확인해 단일 원본 JSON의 `markets.US`에 기록하고 운영 DB/API까지 반영한다.

### 반영
- `data/market-impact-events.json`의 US 배열에 Ero Copper(NYSE: ERO)와 IAMGOLD(NYSE: IAG)의 회사 확정 3분기 실적/콜 일정, Acumen Pharmaceuticals(NASDAQ: ABOS)의 회사 추정 ALTITUDE-AD 2상 결과 월을 추가했다.
- 원문 SEC accession: ERO `0001171843-26-006339` (6-K, 2026-10-01), IAG `0001062993-26-005183` (6-K, 2026-10-05), ABOS `0001628280-26-067129` (8-K, 2026-10-26). 각 이벤트에 SEC 원문 링크, 짧은 직접 근거, 일정 상태, ET/KST, 사업·임상 맥락, 리스크와 미확인 정보를 기록했다.
- ERO 11/3 10:30 ET 컨퍼런스콜은 11/4 00:30 KST이며 정규장 시간 중으로 구분했다. IAG 11/6 08:30 ET는 같은 날 22:30 KST다. 두 실적 발표는 장 마감 후 일정이며 정확한 시각은 미공개다.
- ABOS는 회사가 공개한 “2026년 11월 중” 추정만 기록했다. `eventDate`는 SEC 접수일 2026-10-26이고 추정 창은 `keyDates`의 `2026-11`로 표현해 정확한 발표일을 만들어내지 않았다. 회사 공시의 542명 총 등록 수와 군별 N=180 표기 불일치, 78.6 million USD 현금·시장성 증권(2026-09-30 기준), 2027년 초까지 운영 지원 전망도 원문 한계·회사 전망으로 구분했다.
- 세 티커 모두 `scripts/import-market-impact-events.mjs --dry-run`에서 활성 미국 `COMMON_STOCK` 마스터 확인을 통과했다. importer는 read-only dry-run이었으며 DB 쓰기는 배포 importer가 수행하도록 했다.

### 검증
- SEC 원문에서 ERO/IAG 일정 및 ABOS Phase 2 주요 결과 예상월, 임상 설계·평가지표·등록수·재무 전망을 확인했다.
- `scripts/import-market-impact-events.mjs --dry-run`: KR/US 총 4개 이벤트 JSON 파싱 및 세 미국 티커의 활성 COMMON_STOCK 확인 통과, DB 쓰기 없음.
- `DEPLOY_VERIFY_SMOKE_REQUEST_TIMEOUT_MS=60000 npm.cmd run deploy:verify`: npm audit 취약점 0건, production build, standalone·OpenAPI 37 read operations·Chrome desktop/mobile/API smoke, Vitest 294개 파일(1,522 passed·3 skipped), typecheck 및 각종 문서·보안·cron 검사 통과.
- 최초 원격 run `40993699409`의 1·2차 시도는 빌드·smoke·Vitest·typecheck까지 통과했으나 `docs:check`가 새 최신 로그 항목의 표준 섹션 누락을 검출해 배포를 차단했다. 원인: 요구되는 목표·검증·후속 개선·개선 과제·판정 근거·정규화된 전달 상태 항목을 빠뜨렸다. 영향: 운영 activation은 시작되지 않아 운영 데이터/버전은 변경되지 않았다. 필요한 표준 섹션과 개선 ID를 넣고 문서 계약 및 전체 로컬 배포 게이트가 통과하는 것을 확인했다.
- 로그 형식 수정 후 `npm.cmd run docs:check`: 문서 진입점 24개, migration 163개, 운영 관계 감사 통과.
- 수정 커밋 `6da6d436`에서 전체 `DEPLOY_VERIFY_SMOKE_REQUEST_TIMEOUT_MS=60000 npm.cmd run deploy:verify` 통과: dependency audit 0 vulnerabilities, production build, standalone·OpenAPI·Chrome desktop/mobile/API smoke, 294개 테스트 파일(1,522 passed·3 skipped), typecheck, docs, scope, KIS, Bearer auth 및 OCI cron 검사.
- Deploy OCI run `40995174364` 성공: Verify deployment, Package Next.js standalone, Configure SSH, Upload release, Activate release 모두 성공. OCI migration/import 및 release activation이 완료됐다.
- 배포 후 무인증 GET 검증: `GET /api/health`는 `status=ok`; `/api/public/market-impact-events?market=US&ticker=ERO`는 1건 `2026-11-02` `CONFIRMED_SCHEDULED`, IAG는 1건 `2026-11-05` `CONFIRMED_SCHEDULED`, ABOS는 1건 `2026-10-26` `ESTIMATED`를 반환했다. 응답의 `eventDate`는 모두 `YYYY-MM-DD` 문자열이며 각 항목에 SEC accession과 SEC 원문 URL이 포함됐다.

### 다음 개선
- [ ] 배포 후 무인증 공개 API에서 ERO/IAG 확정 일자와 ABOS 월 단위 추정 상태, ET/KST·eventDate 문자열을 각각 조회해 확인한다. 다음 이벤트 반영 때도 회사 확정 일정과 추정 월을 동일 JSON에서 구분한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-30-001
- 성과 판정: IMPROVED
- 근거: SEC 원문 기반 3개 일정과 공식 활성 COMMON_STOCK 검증을 완료했고, 로그 계약 수정 후 로컬 전체 게이트 및 원격 Deploy OCI 전체 단계가 성공했다. 운영 health 정상과 무인증 API에서 세 이벤트의 날짜·상태·SEC accession이 조회되는 것을 확인했다. 최초 두 run의 자동 차단은 로그 계약 누락이 원인이었으며 수정 후 해소됐다.

### 커밋·푸시·배포
- 완료: 일정 JSON 커밋 `cb297a44`, 로그 계약 보완 커밋 `6da6d436`를 `origin/oci`에 push했다. 수정 release의 Deploy OCI run `40995174364`가 성공했고 운영 health 및 3개 SEC 이벤트 무인증 GET 확인을 완료했다.

## [2026-10-30] 공시 영향 이벤트 JSON·DB·공개 API 운영 배포

### 목적 및 범위
- 국내·미국 공시를 단일 JSON의 별도 배열로 보관하고, 원문 분석 이벤트를 운영 PostgreSQL과 공개 읽기 API에서 조회하게 한다.

### 반영
- `data/market-impact-events.json`: `markets.KR`/`markets.US`로 분리. DART 원문 확인과 공식 종목 마스터 검증을 마친 SK 이벤트 1건을 KR에 보관하고 US는 검증 이벤트가 없어 빈 배열로 둔다.
- `db/migration/V163__market_impact_events.sql`, `app/api/public/market-impact-events/route.ts`: 이벤트 테이블과 날짜·시장·티커 필터 공개 GET을 추가한다.
- `scripts/import-market-impact-events.mjs`: JSON 계약을 검증하고 시장별 활성 COMMON_STOCK 마스터 확인 뒤 eventId 기준 트랜잭션 upsert한다.
- `lib/schema-health.ts` 및 회귀 테스트: `market_impact_events`를 필수 운영 테이블로 등록해 migration 누락을 readiness에서 감지한다.
- `.github/workflows/deploy-oci.yml`, `deploy/oci/stockman-activate`: release에 JSON·importer·환경 로더를 포함한다. Flyway 성공 후 데이터 upsert까지 성공해야 release 전환을 진행한다.
- OpenAPI, API 참조, route inventory, 데이터 사전, DB README 및 설계 문서를 갱신한다.

### 검증 및 운영 결과
- 운영 `/api/health` GET은 200/`status=ok`; 새 API 경로는 기존 운영 릴리스에서 404다.
- 로컬 read-only importer dry-run은 이벤트 1건을 파싱하고 `034730` 활성 KR COMMON_STOCK 마스터를 확인했다. DB 쓰기는 없었다.
- `node scripts/api-surface.mjs write`, `node scripts/api-surface.mjs check`, `node scripts/check-docs.mjs`, importer 문법 검증 통과.
- 첫 `deploy:verify` 실행은 Windows standalone smoke의 요청 시간 제한으로 중단됐다. 수동 standalone에서 OpenAPI·문서·`/charts`·이벤트 API 400 응답을 확인했고, smoke 요청 한도를 60초로 늘린 재실행에서 전체 검증에 성공했다.
- 최종 `DEPLOY_VERIFY_SMOKE_REQUEST_TIMEOUT_MS=60000 npm run deploy:verify` 통과: npm audit 취약점 0건, production build, standalone 및 OpenAPI 37개 공개 GET, API 가이드, `/charts`와 11개 JS chunk, Chrome 데스크톱/모바일 hydration, 새 endpoint 잘못된 query 400 smoke, 전체 Vitest 292 파일(1520 passed·3 skipped), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth, OCI cron 검사.
- Git Bash `bash -n deploy/oci/stockman-activate` 통과. V163은 추가 전용 테이블/인덱스 migration이며 importer 성공 전에는 새 release를 활성화하지 않는다.
- `e496be7c` push 후 GitHub Actions Deploy OCI run `40916565323` 성공. 운영 `/api/health`는 200/`ok`; 무인증 KR 이벤트 GET은 1건, US GET은 0건으로 응답해 V163 및 JSON 적재를 확인했다.
- 실응답 검수에서 PostgreSQL DATE가 Node 직렬화로 `YYYY-MM-DDT00:00:00.000Z` timestamp가 된 계약 불일치를 발견했다. SQL `TO_CHAR`로 API 날짜 문자열을 보존하고 2개 회귀 테스트를 추가했다.
- 날짜 수정 후 전체 `DEPLOY_VERIFY_SMOKE_REQUEST_TIMEOUT_MS=60000 npm run deploy:verify` 재통과: 전체 Vitest 293 파일(1522 passed·3 skipped), dependency audit 취약점 0건, production build, typecheck, standalone·Chrome desktop/mobile smoke, 새 endpoint OpenAPI/query smoke, 전체 docs/security/cron 검사.

### 커밋·푸시·배포
- 구현은 최신 원격 `oci` 기반 별도 관리 worktree에서 진행했다. 기능 배포 `e496be7c` / run `40916565323`과 날짜 수정 `33448165` / run `40918694401` 모두 성공했다.
- 최종 무인증 운영 확인: `/api/health` `ok`; `GET /api/public/market-impact-events?market=KR&date=2026-10-29&ticker=034730` HTTP 200, 이벤트 1건, `eventDate="2026-10-29"`; 같은 날짜 US 필터 HTTP 200, 0건. 조회 응답에 인증 헤더를 보내지 않았다.

## [2026-10-29] 미국 보통주 OBV 다이버전스 공개 API 배포

### 목표
- 프로젝트 공식 활성 COMMON_STOCK·저장 일봉 구조에 맞춰 OBV 다이버전스 API를 구현하고, 최신 원격 `oci` 기준에서 검증·배포한다.

### 반영
- 설계 관리 기준·템플릿과 API 구현·운영 개선 설계서를 추가했다.
- v4 계산, 활성 유니버스/coverage 검증, advisory lock·원자적 DB 스냅샷, CRON_SECRET 보호 갱신 POST, 무인증 read-only GET, V162 migration을 구현했다.
- OCI cron은 미국 일봉 갱신 이후 뉴욕 18:10부터 실행하며 API 실행 간격 제한으로 30분 주기를 적용한다. API inventory/OpenAPI, 상세 매뉴얼, schema health, 기능 모듈 설정도 연결했다.
- 최신 원격 `oci`는 로컬 이전 브랜치와 128 commit 차이가 있어 최신 원격 기준 독립 worktree에 기능 변경만 반영했다. 다른 작업 트리 변경은 release에 포함하지 않는다.

### 검증
- `npm ci --no-audit --no-fund`: 197 packages 설치.
- `npm.cmd run docs:api:generate`, `npm.cmd run audit:api-surface`: route inventory 171개, 외부 공개 GET 36개로 생성·감사 통과.
- `npm.cmd run cron:check`, `npm.cmd run docs:check`: 통과.
- `npm.cmd run deploy:verify`: dependency audit 0 vulnerabilities, production build/typecheck, 전체 1,519개 테스트, standalone HTTP·브라우저 smoke 통과. OBV 공개 GET query 검증 400 및 보호된 cron 무인증 401 smoke 포함.
- Localhost Flyway read-only audit는 history latest V161, V162 스냅샷 미존재 및 오래된 기록 누락을 확인했다. OCI activate는 `outOfOrder` 없이 `*:ignored`를 사용하며 Flyway 문서상 해당 패턴은 Ignored 상태를 validate/repair에서 무시한다. 이전 버전 누락 migration을 수동 실행하거나 schema history를 변경하지 않았다.
- GitHub Actions run [40834281299](https://github.com/pjtss/StockMan/actions/runs/40834281299)은 commit `87a0f21ad8707315f4dd7861b7625062789333dd` 기준 Verify, Package, Upload, Activate 모두 성공했다.
- 배포 후 운영 `GET /api/health`는 HTTP 200 `status=ok`를 반환했다. 공개 `GET /api/scan/us-obv-divergence`는 인증 없이 도달해 HTTP 503 `SNAPSHOT_NOT_READY`를 반환했다. 첫 미국장 cron이 실행되기 전이라 정상 스냅샷 가용성은 아직 미확인이다. health 응답은 migration version을 노출하지 않아 V162 적용 버전을 직접 확인하지 못했다.
- 운영 DB 직접 변경은 없음. 운영 API 검증은 read-only GET만 수행했다.

### 다음 개선
- [ ] health 응답에 Flyway migration 버전이 없어 V162 직접 확인이 불가능하다. 미국장 이후 cron 실행과 공개 GET snapshot 가용성을 확인하고, 다음 개선에서 안전한 migration 상태 확인 경로를 검토한다.
- [ ] 실제 운영 coverage와 주식분할·배당 보정 품질을 관측해 threshold 및 algorithm policy를 재평가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-29-003
- 성과 판정: PARTIAL
- 근거: commit `87a0f21ad8707315f4dd7861b7625062789333dd`의 검증 및 OCI 배포가 성공했고 운영 health가 정상이다. 첫 자동 갱신 전이라 snapshot 미준비 상태이며 V162 버전 직접 관측도 불가하다.

### 커밋·푸시·배포
- 배포 완료: OCI 배포 run `40834281299` 및 운영 health 확인 성공.
- Commit `87a0f21ad8707315f4dd7861b7625062789333dd`; push `origin/oci` 성공.
- OCI 배포 run `40834281299` 성공. 후속 운영 확인은 read-only GET으로 수행.

## [2026-10-28] 주식 뉴스 API 요약 HTML 태그 노출 수정

### 목표
- 운영 종목 뉴스 응답에서 SEC RSS 요약의 HTML 태그가 화면에 노출되는 문제를 수정한다.

### 근본 원인 및 영향
- `/api/stock/news`가 RSS 원문 `summary`만 반환하고 V161의 `normalized_summary`를 읽지 않았다. 차트 모달은 그 값을 HTML escape 없이 표시해 `<b>` 등의 태그가 보였다.
- 운영 GET에서 10개 티커를 확인했고, 그중 6건의 SEC RSS 요약에 HTML 태그가 재현됐다.

### 반영
- API가 저장된 정규화 요약을 우선 사용하고, 과거 행이나 정규화 값이 없거나 손상된 경우 기존 정규화 유틸리티로 안전하게 대체한다.
- 공개 응답에는 안정적인 `summary` 필드만 반환하고 DB 전용 정규화 필드는 노출하지 않는다.
- 운영 API 계약 회귀 테스트 3개를 추가했다. 상세 원인과 재발 감지는 `docs/ERROR_HANDLING.md`에 기록한다.

### 검증
- 운영 API 재현: 10개 티커 조회에서 HTML 포함 6건 확인.
- `npm.cmd exec -- vitest run app/api/stock/news/route.test.ts`: 3개 테스트 통과.
- 전체 배포 게이트 및 배포 후 운영 API 확인은 진행 중이다.

### 남은 위험 및 다음 개선
- 정규화 컬럼을 아직 채우지 않은 기존 행도 read-time fallback으로 보호한다. 잘못 저장된 역사 행은 별도 DB 갱신 없이 조회 시 정리된다.
- 배포 후 동일 운영 종목 API를 재조회해 HTML 없는 제목/요약 응답을 확인한다.

### 다음 개선
- 배포 후 주식 뉴스 API 표본에서 summary HTML 잔존이 없는지 재확인하고, 신규 RSS 파서 변형은 회귀 표본으로 축적한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-28-002
- 성과 판정: UNMEASURED
- 근거: 회귀 테스트는 통과했으며 운영 배포 후 표본 재검증은 미완료다.

### 커밋·푸시·배포
- 미실행 (전체 배포 검증 후 진행).

## [2026-10-28] 외부 AI용 읽기 API 문서와 OpenAPI 배포

### 목표
- 기존 전체 API를 접근 권한별로 정리하고 외부 AI가 안전한 조회 API를 발견·호출할 수 있도록 상세 매뉴얼과 OpenAPI를 제공한다.

### 반영
- `scripts/api-surface.mjs`: 원격 `oci`의 app/api 169개 실제 route 파일에서 method/path/접근 분류/소스 경로를 생성하고 drift를 검사한다. 스냅샷 저장이나 realtime 승인 티켓을 발급하는 일부 GET, signed-link, user/admin/debug/cron/internal/write route는 외부 API 명세에서 차단한다.
- `docs/api/route-inventory.json`: 원격 `oci` 기준 169개 전체 route inventory.
- `public/openapi.json`: OpenAPI 3.1.1, 외부 읽기 GET 35개, 실제 query parameter 이름, 주요 제약·응답 스키마, 서비스 Bearer 보안 정의를 제공한다.
- `public/api-reference.md`, `public/llms.txt`, `docs/api/README.md`: AI discovery, 호출·페이지네이션·인증·오류·데이터 최신성·민감 경로 제외 규칙을 문서화한다. KIS/SEC/DART 데이터를 임의 추정하지 않도록 근거·빈 결과·시각 필드 처리 방법을 포함했다.
- `scripts/verify-deploy.mjs`: standalone에서 OpenAPI·매뉴얼·llms.txt가 HTTP로 제공되고 공개 operation이 유지되는지 smoke 검증한다. Next.js standalone의 public 포함 동작은 공식 문서를 근거로 실제 배포 package 방식에 맞췄다.
- `package.json`, `scripts/check-docs.mjs`, `docs/README.md`, `app/README.md`, `deploy/oci/README.md`, `Development.md`: 생성·감사·검증 명령과 문서 인덱스를 연결했다.

### 검증
- `npm run docs:api:generate`: 169개 route 인벤토리, 35개 외부 GET operation 생성.
- `npm run audit:api-surface`: 169 route inventory와 공개 OpenAPI 경로·method·query metadata 일치 통과.
- `npm run docs:check`: 필수 문서 24개, migration 161개, 운영 schema 검사 통과.
- `node --check scripts/verify-deploy.mjs`, 변경 범위 `git diff --check` 통과.
- `npm run deploy:verify`: 의존성 감사(취약점 0), production build, standalone에서 문서 3개 HTTP smoke, `/charts` 데스크톱·모바일 Chrome hydration, 11개 JS chunk 및 보호 대상 API smoke를 통과했다.
- 전체 테스트: 288개 파일 통과, 1개 skip; 1,510개 테스트 통과, 3개 skip.
- typecheck, 필수 문서·migration·schema 검사, verify 범위·KIS 경계·Bearer 인증·OCI cron 감사 통과.
- 원격 `oci` 배포 후 cache-busting GET으로 `/openapi.json` 200(OpenAPI 3.1.1, 35 paths/35 read-only operations), `/api-reference.md` 200(한글 문서 marker 확인), `/llms.txt` 200(discovery 링크 확인), `/api/health` 200(`status=ok`)을 확인했다.
- 최초 API 커밋의 Deploy OCI 실행은 후속 커밋 push에 따른 concurrency 취소가 발생했다. API 커밋을 포함하는 원격 후속 SHA `4f8af46071a67d253b04082d74631676b0df52ff`의 Deploy OCI workflow run `40623330028`이 전체 검증·패키징·SSH 업로드·활성화를 성공했고 위 운영 URL 응답을 제공한다.

### 다음 개선
- OpenAPI의 generic 응답으로 남은 공개 route를 운영 DTO 예시와 세부 응답 schema로 순차 보강한다.
- 기존 무인증 read endpoint에 공통 외부 rate limit·운영 key 발급 정책이 필요한지 별도 설계하고 적용 전 호환성 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-28-001
- 성과 판정: IMPROVED
- 근거: 원격 최신 route 소스를 기준으로 169개 inventory와 35개 공개 읽기 API 명세를 만들고 전체 배포 검증 및 운영 URL 확인을 마쳤다. route별 응답 DTO 세분화 및 공통 외부 rate limit 설계는 별도 후속 개선이다.

### 커밋·푸시·배포
- 완료: 커밋 `8bbffe5a2f5ca2e10869d2758d8bb6aa52bcd8c2`를 원격 `oci`에 push했다. 후속 SHA `4f8af46071a67d253b04082d74631676b0df52ff`의 Deploy OCI run `40623330028` 성공 및 도메인 공개 응답을 확인했다.

## [2026-10-27] RSS schema readiness 누락 컬럼 조회 회귀 수정

### 목표
- V161 배포 뒤 `/api/health`가 `degraded`를 반환한 원인을 바로잡고, 정규화 필수 컬럼을 실제 readiness 조회가 인식하게 한다.

### 근본 원인 및 영향
- `REQUIRED_OPERATIONAL_COLUMNS`에 새 `normalized_summary` 컬럼을 넣었지만 `inspectDatabaseSchema()` 쿼리의 필수 컬럼 조건은 네 쌍으로 고정돼 있어 새 컬럼이 확인 결과에 나타나지 않았다.
- OCI release 및 Flyway workflow는 성공했지만, 컬럼이 실제 존재해도 schema readiness가 false가 되어 공개 health가 HTTP 503/degraded로 관측됐다.

### 반영
- 필수 테이블/컬럼 목록에서 두 text array를 만들어 `unnest` 조인으로 실제 컬럼 조회에 전달한다.
- 회귀 테스트는 normalized_summary 조회 파라미터와 readiness true를 확인한다. 원인 및 재발 감지는 `docs/ERROR_HANDLING.md`에 기록했다.

### 검증
- 수정 전 운영 health: HTTP 503, `degraded`.
- `npm.cmd exec -- vitest run lib/schema-health.test.ts`: 5개 테스트 통과. `npm.cmd run docs:check`는 문서 검증 계약상 실행명령이 필요해 보완 후 전체 배포 게이트에서 재검증한다.
- 수정 후 배포 게이트 및 운영 health 재확인은 push 뒤 진행한다.

### 다음 개선
- 수정 커밋을 원격 `oci`에 push하고 Deploy OCI workflow 완료 및 운영 health 200을 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-27-009
- 성과 판정: UNMEASURED
- 근거: 원인을 특정하고 검사 로직과 회귀 테스트를 추가했지만 수정본의 운영 반영 및 health 정상화 전이다.

### 커밋·푸시·배포
- 미실행 (배포 전 전체 검증 후 push 예정).

## [2026-10-27] 미국 RSS 정규화 컬럼 운영 배포 준비

### 목표
- 미국 RSS 5개 출처에서 추출한 태그 제거 텍스트를 `market_rss_articles.normalized_summary`에 저장하는 변경을 OCI 배포 브랜치에 안전하게 반영한다.

### 반영
- 원격 `oci` V160 기준의 분리된 작업 트리에 V161 migration, parser 정규화기, ingest/upsert 저장, schema readiness 검사 및 localhost 전용 backfill 도구만 반영했다. 다른 기존 미커밋 사용자 변경은 배포 작업에서 제외했다.
- 정확한 대상별 실피드 검증 결과는 `docs/operations/market-rss-normalized-summary-validation-20261027.md`에 갱신했다.

### 검증
- `npm.cmd run deploy:verify`: 통과. dependency audit 취약점 0건, production build/typecheck, standalone `/charts` HTTP 200, JS 청크 11개, Chrome 데스크톱·모바일 hydration, 관련 API smoke 통과.
- 전체 Vitest: 289개 파일 중 288개 통과·1개 skip, 1,508개 통과·3개 skip.
- docs, verify-scope, KIS boundary, bearer-auth(169 routes), OCI cron 구조 검사 통과.
- 배포 대상 코드 실피드 검증: 미국 출처 5개, 949개 항목, 전 항목 정규화 생성, HTML/엔티티 잔존 0건. GlobeNewswire(20)와 Nasdaq(15)은 제공량 전부 확인.
- 원격 운영 health 확인은 실제 OCI 배포 workflow 성공 후 진행한다.

### 다음 개선
- 원격 `oci`에 이 검증된 변경을 push한 뒤 Deploy OCI workflow 결과와 운영 `/api/health`의 commit 및 Flyway V161 반영을 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-27-008
- 성과 판정: UNMEASURED
- 근거: 배포 전 전체 게이트와 실제 RSS 품질은 확인했으나 운영 release와 schema 적용은 push 후 검증해야 한다.

### 커밋·푸시·배포
- 미실행 (배포 전 검증 완료, 원격 `oci` push 대기).

## [2026-10-26] 미국 산업별 거래대금 운영 API 작업 분할

### 목표
- 최신 운영 API 조회가 계속 504인 원인을 줄이고, 미국 보통주 산업별 월간 데이터를 운영 API만으로 완결 수집할 수 있게 한다.

### 반영
- `/api/admin/us-industry-turnover`에 관리자 세션 전용 `offset` 페이지 조회를 추가했다. 페이지는 최대 200종목이며 요청별로 기간 집계가 독립 실행된다.
- 기준일은 최신 일봉 요약 테이블에서 읽고, 전체 캔들 커버리지는 첫 요청만 계산한다. 후속 페이지는 `coverage=false`로 전체 커버리지 계산을 생략한다.
- 기간 및 eligible 총수가 페이지마다 동일한지, `nextOffset=null`로 끝나는지 확인한 뒤 페이지별 `summary`와 `daily`를 source+industry code 기준으로 합산하도록 운영 runbook을 갱신했다. 운영 DB 직접 조회나 데이터 쓰기는 없다.
- ERROR_HANDLING에 반복 504, 쿼리 수정 이력과 재발 감지 절차를 업데이트했다.

### 검증
- route 테스트 5개, TypeScript 검사, `git diff --check` 통과.
- 전체 `npm.cmd run deploy:verify` 통과: dependency audit 0 vulnerabilities, production build, standalone 및 Chrome desktop/mobile smoke, 303개 테스트 파일 통과·1개 skip(1,538 tests pass·3 skip), typecheck, docs, verify-scope, KIS, bearer-auth 및 OCI cron 검사.
- 200개 종목 페이지 기능은 로컬 검증 완료. 이전 운영 전체 집계 요청은 60초에서 504였다. 최신 `bf3b944f` 배포 workflow `40265409874`는 6분 이상 GitHub 공개 화면에서 running으로 남았고 health-check는 계속 `f6c541ba`를 보고해 운영 페이지 조회는 수행하지 않았다.

### 다음 개선
- workflow `40265409874`의 종료/실패 또는 운영 `bf3b944f` 반영 여부를 확인한다. 반영 후 offset 페이지를 끝까지 읽어 응답시간·기준일 일관성·종목 커버리지와 KIS/SEC 분리 합계를 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-26-007
- 성과 판정: UNMEASURED
- 근거: 전체 검증은 통과했지만 운영 적용 및 수치 재수집 전이라 프록시 timeout 개선 효과는 미측정이다.

### 커밋·푸시·배포
- 미실행
## [2026-10-26] 미국 산업별 거래대금 집계 API 조회 정확도·속도 보완

### 목표
- 운영 API의 첫 조회 504와 후속 최적화의 빈 결과 오류를 함께 바로잡아 월간 산업별 표 생성을 완료한다.

### 근본 원인
- 캔들 날짜 컬럼은 `YYYYMMDD` TEXT다. 초기 `::date` 범위 조건은 복합 인덱스 범위 탐색을 방해해 504를 일으켰고, 첫 최적화의 ISO 문자열 경계는 실제 형식과 달라 5,163개 대상 중 캔들 0개인 빈 결과를 반환했다. 대상별 최신일 탐색을 반복해 31,273ms가 걸린 것도 지연 원인이었다.

### 반영
- 최신일 계산을 US 일봉 테이블 최대값으로 바꾸고, 종목별 캔들 기간 조회는 복합 인덱스를 사용하는 LATERAL 범위 탐색과 `YYYYMMDD` 문자열 경계를 사용하도록 수정했다.
- 회귀 테스트에 인덱스 호환 날짜 조건 확인을 추가하고, 원인·영향·재발 감지 방법을 `docs/ERROR_HANDLING.md`에 기록했다.

### 검증
- `npm test -- --run app/api/admin/us-industry-turnover/route.test.ts`: 4개 통과.
- 최신 코드의 `npm run deploy:verify`: 통과. 304개 테스트 파일 중 303개 통과·1개 skip, 1,537개 테스트 통과·3개 skip, build/typecheck/docs/security/cron 및 standalone·Chrome 데스크톱·모바일 smoke 완료.
- 운영 재조회는 아직이다. 이전 운영 응답은 최초 HTTP 504, 첫 최적화 HTTP 200/31,273ms/기간 캔들 0개였으며 데이터는 저장하지 않았다.

### 다음 개선
- 최종 수정본을 `oci`에 배포하고 운영 API 응답시간, 기간 캔들 커버리지, KIS/SEC 월합계·일별 추이를 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-26-006
- 성과 판정: UNMEASURED
- 근거: 운영 조회가 504로 실패해 실제 표를 만들지 못했고, 인덱스 경로 최적화의 효과는 아직 관측하지 못했다.

### 커밋·푸시·배포
- 미실행

## [2026-10-26] 미국 보통주 산업별 1개월 거래대금 조회 API

### 목표
운영 DB 직접 접속 없이 관리자 인증 운영 API에서 최신 일봉 기준 직전 한 달의 미국 보통주 산업별 거래대금과 일별 추이를 조회한다.

### 반영
- 관리자 인증을 적용한 읽기 전용 `/api/admin/us-industry-turnover`를 추가하고 `KIS_ICOD`와 `SEC_SIC`를 출처별로 구분한다.
- 공식 활성 COMMON_STOCK만 필터링하며 ETF·레버리지·인버스·워런트·파생·DR을 제외한다. 저장 거래대금이 비거나 0이면 종가×거래량을 대체값으로 표시한다.
- 계산 기준과 데이터 커버리지 한계를 `docs/operations/us-industry-turnover-report.md`에 기록하고, 인증·분류 원천 분리·읽기 전용·캔들 공백 응답 검사를 추가한다.

### 검증
- `npm test -- --run app/api/admin/us-industry-turnover/route.test.ts`: 4개 통과.
- 최신 `origin/oci`에서 `npm run deploy:verify`: 통과. 빌드, 1,536개 테스트, 타입·문서·보안·cron 감사, standalone 및 Chrome 데스크톱·모바일 smoke가 완료됐다.
- 배포 `0f45a898` 후 운영 `/api/admin/us-industry-turnover`는 세션 없는 GET에서 401, `/api/health`는 200을 반환해 route 활성 상태를 확인했다. 관리자 세션의 첫 집계 요청은 504였다.
- 실제 운영 집계 결과는 미확인 상태이며 운영 DB에 직접 접속하지 않았다.

### 다음 개선
- 집계 쿼리의 504 원인을 고치고 배포해 운영 API 결과를 받는다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-26-004
- 성과 판정: PARTIAL
- 근거: API를 배포해 관리자 경로까지 도달했으나 집계가 504로 실패해 요청한 실제 통계와 표는 생성하지 못했다.

### 커밋·푸시·배포
- 완료: `0f45a898`를 `oci`에 push했고 GitHub Actions 배포 run `40259948404`가 성공했다.
## [2026-10-26] RSS 번역 provider 월 예약 한도 상향

### 목표
- 사용자가 요청한 앱 내부 월 예약 상한 Azure 1,950,000자, Google 450,000자를 반영한다.

### 원인
- Azure 1,900,000자 및 Google 300,000자 기존 보호 상한이 운영 예약량에 도달해 새 RSS 제목 번역을 차단했다.

### 반영
- `lib/translation-cache.ts`: Azure 월 상한을 1,950,000자, Google 월 상한을 450,000자로 조정하고 Google provider 명시 상수로 사용한다. Azure 시간당 1,800,000자와 Google 시간당 100,000자는 유지한다.
- Provider 선택, 제목만 번역, 한국어 번역 검증 게이트, 미발송 기사 재시도 정책은 유지한다. 관리자 quota 진단과 한도 알림은 공통 상수에서 새 수치를 표시한다.
- `docs/rss-translation-design.md`, `docs/architecture/stocktitan-translation.md`: 새 상한과 여유량을 기록한다. Google의 월 $10 credit은 Basic/Advanced 및 동일 project의 사용량과 공유되어, 다른 앱 사용량이 있으면 비용이 발생할 수 있음을 명시한다.

### 검증
- 관련 테스트 4파일 37개 통과(`translation-cache`, provider routing, quota-aware client, Azure diagnostics). `npm.cmd run docs:check`(18 entry points, migration V160) 및 `git diff --check` 통과.
- 최초 전체 검증 세 차례는 standalone `/charts`가 기본 30초 per-request timeout에 걸렸다. 같은 standalone 서버를 직접 호출했을 때도 HTTP 200 응답이 약 27초 걸리는 느린 Windows 실행 환경으로 확인했다. `DEPLOY_VERIFY_SMOKE_REQUEST_TIMEOUT_MS=60000`로 검증만 재실행해 전체 `npm.cmd run deploy:verify` 통과: dependency audit 0 vulnerabilities, production build 111 pages, standalone `/charts` 200·11 static chunks, Chrome desktop/mobile hydration, 6 API/auth smoke, 최신 `origin/oci` 통합 트리에서 Vitest 303 files passed/1 skipped(1,537 passed/3 skipped), typecheck, docs/migration, verify-scope, KIS boundary, bearer-auth(181 routes), OCI cron 검사. 검증 스크립트는 제품 변경으로 수정하지 않았다.

### 다음 개선
- 배포 후 `/api/admin/azure-translator-debug`에서 Azure 1,950,000 및 Google 450,000 한도를 확인하고, 새 월 예약분과 재개된 미발송 RSS backlog의 번역·Discord 수신 상태를 점검한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-26-005
- 성과 판정: IMPROVED
- 근거: 요청된 앱 코드·문서 상한과 quota 회귀 테스트를 반영했고 전체 빌드·테스트·타입·문서·standalone runtime/browser/API 게이트를 통과했다. 운영 반영은 커밋·배포 단계에서 확인한다.

### 커밋·푸시·배포
- RSS 전용 커밋 `529bb1690ef4abb1dbb50f841f61377521853426`을 `origin/oci`에 push했다. Deploy OCI run `40260973591`은 verify/package/upload에 성공했고 activate 단계도 성공 처리됐으나, 후속 커밋 `e52d36ce` 배포가 시작되며 run 결론은 cancelled로 기록됐다. 운영 `/health-check`는 quota 변경 커밋을 포함하는 후속 SHA `e52d36cef3e907d4a253c987b9e15a9bf2f51ccf`를 표시했고 `/api/health`는 `ok`를 반환했다(2026-10-26 02:59:52Z). 따라서 현재 운영 release가 요청한 상한 코드를 포함함을 확인했다.


## [2026-10-26] 번역 retry worker를 미발송 기사로 제한

### 목표
- 번역 quota 복구 후 제한된 문자를 Discord 발송 대기 기사에 우선 사용한다.

### 원인
- `translatePendingMarketRssArticles`가 retry-status 조건만 사용하고 notification 상태를 확인하지 않았다. 이미 `SENT`인 quota-skip 기사도 월 reset 뒤 번역 retry 대상으로 선택될 수 있었다.
- 작업 로그를 갱신할 때 비고유 문구 치환이 반복된 과거 항목에도 적용되는 문서 손상을 만들었다. 부모 커밋의 원본 전체를 복원한 다음 새 작업 항목만 앞에 보존했다.

### 반영
- `lib/market-rss-pipeline.ts`: translation worker가 `buildMarketRssTranslationCandidateCondition`을 사용하도록 바꿔 notification 상태 `PENDING`, `FAILED`, `SKIPPED`만 재번역 후보로 포함한다. SEC EDGAR, StockTitan, GlobeNewswire source allowlist와 과거 backlog 처리, 등급·키워드 필터 없음은 유지한다.
- `lib/market-rss-translation-retry.test.ts`: candidate SQL regression에서 `SENT`와 `UNCERTAIN` 제외 및 `PENDING`, `FAILED`, `SKIPPED` 포함을 확인한다.
- `app/api/debug/market-rss-translations/route.ts`: 항목별 `notification_status`와 `notified_at`을 진단에 추가해 오역·불완전 번역의 실제 전송 상태를 확인한다. 번역 입력과 진단 응답에는 제목 외 본문·요약을 추가하지 않는다.
- `lib/market-rss-headline-context.ts`: 운영에서 확인된 pharmaceutical false friends(`encouraging`→`권장`, `oral session`→`구강 세션`, `advanced NSCLC`→`후기 NSCLC`)를 원문 제목이 해당 의미를 확인할 때에만 교정한다. 임상 문맥의 Roman numeral phase 오역(`단계 III`, `III 임시 단계`)도 원문상 interim/임상 단계가 확인되면 `중간 3상`으로 표준화한다. 새 번역과 송신 직전 저장 제목 검증에서 같은 규칙을 적용한다.

### 검증
- 관련 RSS 테스트 3파일 125개 통과; 전체 `npm.cmd run deploy:verify` 통과(테스트 302파일 통과, 1,532개 테스트 통과·3개 skip, 타입 검사·문서/감사 검사·빌드·런타임 smoke 포함). `git diff --check` 통과.
- `npm.cmd run deploy:verify` 통과: dependency audit 0, Next.js production build 111개 static pages, standalone HTTP 200 및 Chrome desktop/mobile hydration, API/auth smoke, 전체 테스트 302 파일 중 302 passed/1 skipped (1,526 tests passed/3 skipped), typecheck, docs/migrations, scope/KIS/bearer/OCI cron 검사.
- 운영 read-only (2026-10-25 15:56Z): notification pending GNW 6, SEC 0, StockTitan 2,303; monthly quota skip GNW 6, SEC 238, StockTitan 11,395. provider quota가 초과라 재처리 실측은 남았다.
- 문서 복원 커밋 63ddabe58eb0eff62c24c911eb02308213683f18의 OCI workflow 40211443629도 verify/package/SSH/upload/activate 모두 성공했고, 운영 /health-check가 같은 SHA, /api/health가 ok를 반환했다. 2026-10-25 16:30:46Z read-only 진단: 최근 24시간 기사 34건 중 TRANSLATED 5, SKIPPED 29; GNW notification pending 7, SEC pending 0, StockTitan pending 2,304. 사람 검수 semantic fixture는 여전히 0건이므로 자동 번역 의미 정확성은 검증되지 않았다.
- 진단 API 회귀 1파일 4개 테스트 통과. `npm.cmd run deploy:verify`도 다시 통과(의존성 취약점 0, production build 111개 페이지, 브라우저/API smoke, 테스트 1,526 passed·3 skipped, typecheck/docs/정책 검사). RSS 진단 응답에서 새 기사별 `notification_status`·`notified_at`을 확인했다. 2026-10-25 16:57Z의 24시간 제목 표본 5건은 모두 `SENT`였고, 그중 GNW 4건은 괄호 누락 또는 임상 단계·핵심 의미 오역이 있었다. 이 항목들은 새 송신 검증 배포 전 발송된 legacy 사례이며, 새 quota 대기 기사들의 실제 번역/Discord 수신은 아직 확인되지 않았다.
- 운영 provider 출력 회귀 3파일 122개 테스트 통과: 임상 단계와 `encouraging data`, `oral session`, `advanced NSCLC`의 원문 기반 교정을 새 번역 및 송신 직전 검증 양쪽에 적용한다. 전체 `npm.cmd run deploy:verify`도 통과: production build 111 pages, standalone/Chrome/API smoke, Vitest 302 files(1,529 passed·3 skipped), typecheck, docs/migrations, scope/KIS/bearer/OCI cron 검사.

### 다음 개선
- 코드 workflow `40210193279`가 성공하고 운영 SHA `cd55b5ef`, `/api/health` `ok`를 확인했다. 2026-10-25 16:18:11Z read-only 집계: GNW pending 0, sent 25, skipped 7; SEC pending 0, sent 8,692, skipped 238, uncertain 3; StockTitan pending 2,304, sent 8,788, skipped 11,396, uncertain 2. 모든 신규 skip은 `monthly_character_limit_reached`; 아직 대기한 backlog의 실제 Discord 수신은 확인되지 않았다. 다음 UTC quota reset 후 source별 pending, skipped, sent, uncertain와 제목 번역 표본·실제 Discord 수신을 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-26-003
- 성과 판정: PARTIAL
- 근거: 재시도 후보를 미발송 기사로 제한했고 전체 배포 검증을 통과했다. quota 제한으로 신규 번역 및 Discord 수신은 아직 검증되지 않았다.

### 커밋·푸시·배포
- 완료: RSS 코드 커밋 `cd55b5efe4537f04b5c1e0c1dac89ba83ddc1d91`을 `origin/oci`에 push했다. Deploy OCI workflow `40210193279`의 verify/package/SSH/upload/activate가 성공했고 운영 SHA는 `cd55b5ef`, `/api/health`는 `ok`다. 과거 로그 손상 복원 문서 커밋 `63ddabe58eb0eff62c24c911eb02308213683f18`도 별도 Deploy OCI workflow `40211443629` 성공으로 운영에 반영됐다. 진단 API 커밋 `e00c366d1e9db08322d41b9f9848f9eda3a08ea7`을 push했고 Deploy OCI workflow `40213560079`의 verify/package/SSH/upload/activate가 성공했다. 운영 /health-check는 같은 SHA, /api/health는 ok다.
- 완료: source-confirmed pharmaceutical headline correction 커밋 `767cc9c7c9ea493e853e7f6e2c486c03f3cb87c3`을 push했다. Deploy OCI workflow `40215274420`이 성공했고 운영 /health-check가 같은 SHA, /api/health가 ok를 반환한다.
## [2026-10-26] 임상 단계 정규화 경계 보완

### 목표
- 원문에 임상 단계가 표시된 번역 제목만 안전하게 교정하고, `임상 2b 단계` 같은 정상 문맥이 보정 과정에서 손상되지 않게 한다.

### 원인
- 기존 `상 2` 오역 보정 패턴에 좌측 단어 경계가 없어 `임상 2b 단계`의 `상 2b`를 잘못 매칭할 수 있었다. 또한 `1단계`·`2b 단계`처럼 provider가 임상 단계를 `단계`로 표현한 출력은 표준 `1상`·`2b상`으로 정규화하지 않았다.

### 반영
- `lib/market-rss-headline-context.ts`: `상 N` 교정에 좌측 문자/숫자 경계를 적용해 `임상` 내부 글자를 보존하고, 원문에서 확인된 임상 단계 앞뒤의 `N 단계`·`N단계` 표기를 `N상`으로 정규화한다.
- `lib/market-rss-headline-context.test.ts`: 1상 및 2b상 표기 교정과 `임상` 문맥 보존 회귀를 추가했다. 최초 테스트는 실제 경계 오류를 재현했고 수정 뒤 통과했다.

### 검증
- RSS 제목 번역·저장 번역 검증·전송 게이트 대상 4개 파일 122개 테스트 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.
- 1차 전체 검증은 docs 계약 수정으로 중단됐고, 문구를 수정한 뒤 `npm.cmd run deploy:verify` 최종 통과: dependency audit 0 취약점, Next.js production build 111개 정적 페이지, standalone `/charts` HTTP 200 및 Chrome desktop/mobile hydration, API/auth smoke, 전체 테스트 302개 파일(302 passed/1 skipped; 1,526 passed/3 skipped), typecheck, docs/migration, scope/KIS/bearer/OCI cron 검사 통과. 운영 read-only 사후 확인(2026-10-25 15:50Z): `/health-check` SHA `806064f46e215086566c46505fd8107699b98154`, `/api/health` `ok`; OCI workflow `40208437108` 성공. RSS 집계는 GlobeNewswire pending 6/quota skip 6, SEC pending 0/quota skip 238, StockTitan pending 2,302/quota skip 11,394이며 새 대기 기사도 `monthly_character_limit_reached`로 fallback 발송 없이 대기한다.

### 다음 개선
- 번역 quota가 다시 허용되면 관리자 RSS 검수 CSV를 출처별로 내려받아 원문 제목·provider 결과·원문 요약을 대조하고 승인 사례를 semantic fixture로 가져온다. fixture를 CI gate에 연결한 뒤 다시 전체 검증하고, pending/failed/uncertain이 0이며 Discord에서 세 출처별 수신을 확인할 때까지 운영 aggregate를 추적한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-26-002
- 성과 판정: PARTIAL
- 근거: 실 운영 임상 단계 표기 문제를 보완하는 과정에서 기존 `임상` 경계 손상 가능성을 테스트로 발견해 수정했고 122개 표적 테스트가 통과했다. 보정은 전체 배포 검증과 운영 반영을 완료했지만 quota 초과로 backlog 수신이 진행되지 않고, human-reviewed fixture가 없어 provider 번역의 의미 정확성 coverage가 입증되지 않았다.

### 커밋·푸시·배포
- 완료: RSS 코드 커밋 `806064f46e215086566c46505fd8107699b98154`를 `origin/oci`에 push했다. Deploy OCI workflow `40208437108` 전체 검증·package·upload·activate 성공, 운영 `/health-check` 동일 SHA, `/api/health` `ok`를 확인했다. 사후 read-only 집계는 GlobeNewswire pending 6, SEC pending 0, StockTitan pending 2,302이며 quota 초과 기사는 번역 및 Discord 수신을 기다린다.
## [2026-10-26] 운영 오역 표본 기반 임상 단계 및 송신 전 재검증

### 목표
- 실제 운영 번역에서 제목의 임상 단계가 뒤집히거나 잘린 번역이 확인돼, 새 번역과 오래된 대기 제목 모두 잘못된 상태로 Discord에 나가지 않도록 개선한다.

### 원인
- provider가 임상 단계 보호 토큰을 옮기거나 `2 상기`, `-2상`, `상 1` 형태로 렌더링하면 기존 한국어 비율/완전성 검증만으로 의미 오류를 놓칠 수 있다. 또한 과거 코드로 저장된 `TRANSLATED` 행은 현재 번역 품질 검증을 거치지 않고 상태 메타데이터만으로 송신될 수 있었다.

### 반영
- `lib/market-rss-headline-context.ts`: 원문이 임상 단계를 분명히 나타내는 경우에만 번역 결과의 `상 1`, `2 상기`, `-2상`, `2단계` 아티팩트를 `1상`·`2상` 등으로 교정한다. 원문에 임상 단계 문맥이 없으면 숫자를 변경하지 않는다.
- `lib/translate-market-rss-item.ts`: provider 응답의 하이픈이 보호된 임상 단계 토큰 앞에 붙은 경우 금융 부호 검사 전에 구분자를 정규화하고, 복원된 제목에도 같은 임상 단계 정규화를 적용한다.
- `lib/market-rss-notification-translation-validation.ts`, `lib/market-rss-pipeline.ts`: Discord 송신 직전에 저장된 `TRANSLATED` 제목을 현재 한국어 수준·완전성 검사로 다시 확인한다. 잘린/불충분한 제목은 `FAILED`로 전환해 기존 provider 재시도 큐로 되돌리고, 정상화 가능한 임상 단계 표기는 DB에 교정한 뒤 송신한다.
- `lib/market-rss-notification-translation-gate.ts`: 빈 번역 제목은 SQL 송신 후보에서 제외한다.
- 운영 read-only 표본에서 StockTitan `ZW191` 제목의 `상 1`, GlobeNewswire phase 제목의 `2 상기`·`-2상`, GlobeNewswire Libtayo `(CSCC` 누락을 확인했다. 특히 Libtayo 표본은 새 송신 전 검증에서 `translation_output_incomplete`로 재시도 대상이 된다.
- `scripts/README.md`: title-only provider 경로를 반영하고, 비어 있는 human-reviewed semantic fixture와 실제 검증 명령 연결 상태를 정확히 문서화했다. 현재 fixture `cases`는 0건이며 deploy gate는 의미 번역 정확성을 증명하지 않는다.

### 검증
- `npm.cmd exec vitest run -- lib/market-rss-headline-context.test.ts lib/translate-market-rss-item.test.ts lib/market-rss-notification-translation-validation.test.ts lib/market-rss-notification-translation-gate.test.ts --reporter=dot`: 4개 파일 120개 테스트 통과.
- `npm.cmd run docs:check`: 통과. `git diff --check`: 통과.
- `npm.cmd run check:rss-translation-coverage`: 실패. 사람 검수 semantic fixture가 현재 0건이라 fixture coverage를 입증할 수 없다. 이 별도 검사는 `npm run deploy:verify`에 포함돼 있지 않다.

### 다음 개선
- `npm.cmd run deploy:verify` 통과(2026-10-26): dependency audit 0 취약점, Next.js production build 111개 정적 페이지, standalone `/charts` HTTP 200 및 Chrome desktop/mobile hydration, API/auth smoke, 전체 테스트 302 passed/1 skipped (1,524 passed/3 skipped), typecheck, docs/migration, scope/KIS/bearer/OCI cron 검증 통과. 실제 신규 provider 번역 의미 품질은 quota 복구 뒤 출처별 검수 표본으로 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-26-001
- 성과 판정: PARTIAL
- 근거: 운영 표본에서 반복되는 단계 표기를 고치고, 과거 불완전 번역이 송신을 통과하지 못하도록 재검증을 추가했다. 실제 provider 한도 초과가 지속되고 human-reviewed semantic fixture가 비어 있어 전체 backlog 송신·새 provider 번역 의미 품질은 아직 증명되지 않았다.

### 커밋·푸시·배포
- 완료: `13af42b166f5eae94394ceed2ff7e87111990f05`를 `origin/oci`에 push했다. Deploy OCI workflow `40206173490`가 전체 검증·package·upload·activate에 성공했고 운영 `/health-check`는 SHA `13af42b166f5eae94394ceed2ff7e87111990f05`, `/api/health`는 `ok`를 반환했다. 활성화 중 잠시 502를 관찰했지만 workflow 성공 후 health가 정상화됐다. 배포 후 read-only RSS aggregate는 GlobeNewswire pending 5, SEC pending 0, StockTitan pending 2,299로 유지됐으며 quota skip은 각각 5, 238, 11,391이다. 과거 invalid 번역의 재시도/무발송 전환 및 실제 새 provider 결과는 운영 cron과 quota 제한으로 아직 확인되지 않았다.

## [2026-10-25] RSS provider 입력을 제목 전용 API로 제한

### 목표
- 번역 provider 입력에 RSS 기사 제목만 들어가도록 함수 계약에서 막고, 요약·본문을 번역하지 않는 회귀를 보장한다.

### 원인
- 운영 경로는 이미 `prepareMarketRssTranslationInput(item.title)`만 전달했지만, 입력 준비 함수 자체는 선택적 summary 인자를 받아 provider context를 생성할 수 있었다. 이런 공개 함수 모양은 향후 호출자가 summary/body를 실수로 전달해 번역하게 만들 수 있어 “제목만 번역” 요구를 타입 경계에서 보장하지 못했다.

### 반영
- `lib/market-rss-translation-input.ts`: 입력 준비 함수에서 summary 인자, summary 정리, context 조립을 제거했다. 요약을 넘기는 호출은 TypeScript에서 거부되며 준비된 provider text는 제목만 포함한다.
- `lib/translate-market-rss-item.test.ts`: 긴 summary가 있는 기사도 provider 입력은 제목뿐이고 `translatedSummary`는 원문 그대로인 회귀를 추가했다. 이전 summary-context 입력 전용 테스트를 제거하고 provider가 추가 context 문단을 반환하더라도 headline만 추출되는 동작을 검증한다.
- `lib/market-rss-translation-review-fixtures.test.ts`: 품질 fixture 실행도 원제목만 provider 입력으로 사용하도록 수정했다.

### 검증
- 대상 테스트 `npm.cmd exec vitest run -- lib/translate-market-rss-item.test.ts lib/market-rss-translation-review-fixtures.test.ts --reporter=dot`: 2개 파일 통과, 98개 통과·2개 데이터 fixture skip(승인된 human-review 사례 없음).
- 전체 `npm.cmd run deploy:verify`: 최종 통과. dependency audit 0 vulnerabilities, Next production build, standalone HTTP/Chrome desktop·mobile/API smoke, Vitest 302개 파일(301 passed·1 skipped; 1,514 passed·3 skipped), typecheck, docs/migration, scope, KIS boundary, Bearer auth(180 routes), OCI cron 검증을 모두 통과했다. 첫 검증에서 DEVELOPMENT_LOG 최신 항목의 필수 문서 계약 누락을 발견해 양식을 보완한 뒤 재실행하여 전 게이트 성공을 확인했다.

### 다음 개선
- 다음 Google 월 한도 reset 이후 실제 신규 제목 번역을 세 출처에서 표본 확인하고 backlog가 번역 게이트를 통과해 Discord에서 수신되는지 확인한다. quota 미승인 상태에서는 cap을 바꾸지 않는다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-25-020
- 성과 판정: PARTIAL
- 근거: provider 입력 함수의 요약 인자를 제거했고 제목-only 회귀와 로컬 실행 검증이 통과했다. 실제 quota-blocked 운영 provider 결과 및 전체 backlog 수신 증거는 아직 없다.

### 커밋·푸시·배포
- 완료: 커밋 `252159d91500d9ffd1bc57adafd81ee98b66a4ce`를 `origin/oci`에 push했다. Deploy OCI workflow `40203503857`가 전체 원격 검증, package, upload, activate를 성공 완료했고 운영 `/api/health`는 `ok`, `/health-check`는 같은 SHA를 반환했다.
- 운영 RSS read-only 집계 `2026-10-25 14:49Z`: GlobeNewswire notification pending 5·quota skip 5, SEC pending 491·quota skip 238, StockTitan pending 2,299·quota skip 11,391. SEC validated-title backlog는 계속 Discord로 배출 중이다. provider 실사용 quota에 막힌 상태와 전체 backlog 미완료를 PARTIAL로 유지한다.

## [2026-10-25] RSS Discord 제목 번역 전송 게이트 검증 및 운영 배포

### 목표 및 범위
- SEC EDGAR, StockTitan, GlobeNewswire에서 필터링 없이 수집한 기사는 Discord 전송 전에 제목만 한국어 번역 상태인지 강제한다. summary/body/content는 provider 입력에 포함하지 않는다.
- 번역 실패·quota skip은 미번역 원문 발송으로 우회하지 않고 대기시킨다. 월간 provider 한도는 사용자 승인 없이 변경하지 않는다.

### 변경 및 검증
- `lib/market-rss-notification-translation-gate.ts`: `TRANSLATED` 행은 한국어 대상 언어, 비-fallback, non-empty translated title을 요구한다. 동일 언어 원제목 보존으로 SKIPPED된 행은 `already_in_target_language` 근거와 함께 동등성을 확인한다. 알림 PENDING 외 상태를 임의로 끌어오지 않는다.
- `lib/market-rss-notification-translation-gate.test.ts`: 데이터베이스 eligibility 조건에 대한 회귀 검증을 보강했다. provider 입력은 `item.title`만 사용하며 본문/요약 번역 회귀 검증을 유지한다.
- 최종 `npm.cmd run deploy:verify` 통과: dependency audit 0 취약점, production build 및 HTTP/browser/API smoke, 전체 302개 테스트 파일(301 pass·1 skipped; 1,518 tests pass·3 skipped), typecheck, docs/migrations, scope, KIS, auth, OCI cron 검증 통과.
- 변경 커밋 `faa5a069fbbfa6b35826fe25ac8c3f273bd5997c`을 `origin/oci`에 push했다. GitHub Actions Deploy OCI run `40201501678` 성공, 운영 `/api/health` HTTP 200, `/health-check`가 정확한 SHA `faa5a069fbbfa6b35826fe25ac8c3f273bd5997c`를 반환했다.

### 운영 상태 및 한계
- 운영 read-only RSS 진단 `2026-10-25 14:23:04Z`: notification PENDING은 GlobeNewswire 4, SEC 1,021, StockTitan 2,299건이다. 번역 status SKIPPED는 각각 4, 238, 11,391건이며 모두 `monthly_character_limit_reached`다. 새 provider 번역과 전체 backlog Discord 수신은 월간 한도 때문에 아직 확인할 수 없다. 사용자 승인 없이 quota 또는 provider 예산은 높이지 않는다.
- 현재 SENT지만 검증 번역이 없는 기존 이력은 SEC 313건, StockTitan 9,335건으로 집계된다. 과거 Discord 발송을 소급 취소할 수 없다. 이후 재발은 `/api/debug/market-rss-translations`의 `sentGateViolationsBySource` 및 source별 집계로 감지한다.

## [2026-10-25] 다국어 임상 단계·시험 식별자 제목 보호

### 목표
- 운영 번역 표본에서 확인된 `Phase-2` 파손과 시험 ID가 임상 단계로 합쳐지는 신규 제목 번역 오류를 줄인다.

### 근본 원인
- 임상 단계 정규화는 영어 공백 형식 `Phase 2`만 찾았고 임상 문맥 판정도 영어 키워드에만 의존했다. 따라서 독일어 `Phase-2-Studie ... Lungenkrebs`가 `Phase`와 `2`로 분리될 수 있었다. 보호 token 패턴은 VIKTORIA-1, COMPANION-002 같은 긴 대문자+숫자 ID를 전체 식별자로 인식하지 않아 숫자가 별도 임상 단계처럼 번역될 수 있었다.

### 반영
- `lib/market-rss-headline-context.ts`: 임상 의미가 확인되는 경우 공백/하이픈 Phase 표기와 독일어 종양·치료 문맥을 `2상`, `2/3상`으로 정규화하고 `상-Study/Studie/Trial` 사이에 번역 구분 공백을 둔다. 비임상 Phase-2 market expansion 제목은 원문을 유지한다.
- `lib/market-rss-headline-context.test.ts`: 독일어 `Phase-2-Studie`, 하이픈 임상 단계, 영어 비임상 경계를 검증한다.
- `lib/market-rss-translation-tokens.mjs`, `lib/market-rss-translation-protection.test.ts`: VIKTORIA-1, COMPANION-002, COVID-19, CD-19 식별자 전체를 단일 보호 token으로 처리하는 회귀를 추가한다.
- `lib/translate-market-rss-item.test.ts`: 독일어 clinical title의 provider 입력에서 `2상`과 `VIKTORIA-1`을 보호·복원하고 summary/body를 보내지 않는 통합 회귀를 추가한다.
- `docs/architecture/stocktitan-translation.md`: 현재 보호 규칙은 token을 분리하지 않지만 provider가 token 위치를 옮길 수 있다는 한계를 명시한다.

### 검증
- 운영 read-only 표본(720시간 범위): GlobeNewswire 25개 중 6개에서 임상 단계/괄호 등 legacy 품질 패턴이 보였고, 여기에는 `Phase 2`의 `2 상기`, `Phase 3`와 `VIKTORIA-1`의 혼합, `Phase 2/3`와 `COMPANION-002`의 혼합이 포함됐다. 이 샘플은 새 SHA 배포 전 저장된 번역이다.
- `npm.cmd exec vitest run -- lib/market-rss-headline-context.test.ts lib/market-rss-translation-protection.test.ts lib/translate-market-rss-item.test.ts --reporter=dot`: 3개 파일 161개 테스트 통과.
- 통합 회귀 추가 후 `npm.cmd run deploy:verify` 통과: 302개 test files(301 passed/1 skipped), 1,518 tests passed/3 skipped; build, standalone HTTP/browser smoke, typecheck, docs/migration, scope/KIS/auth/OCI cron gates 성공.
- GitHub Actions run `40193652992` success 및 운영 `/health-check` HTTP 200, 새 SHA `6316c4ff82a15f5260d1ec6bbbad59bf9e56eedb` 확인. 새 provider 출력은 월간 quota에 막혀 검증 불가이며, 실제 provider 출력이 의미상 완벽하다고 주장하지 않는다.
- 운영 최신 집계 2026-10-25 12:53Z: SEC notification pending 2,640, StockTitan 2,298, GlobeNewswire 3; StockTitan translation pending 326 및 quota-skipped 11,064. 운영 SHA `614363b2f660ecf11132364d99ef03e0becb046b`에서 새 provider 번역이 성공한 샘플은 아직 없다.

### 재발 감지·남은 위험
- 입력 정규화와 보호 token 테스트는 언어별 phase 표기를 보장하지 않는다. 인식하지 못하는 새 언어 표기나 provider의 token 재배치는 실제 provider 품질 표본으로 계속 확인해야 한다.
- provider quota로 새 출력 표본을 확인할 수 없으며 저장된 과거의 잘못된 번역은 이번 코드 변경으로 자동 재작성되지 않는다.

### 다음 개선
- 월 quota reset 후 동일 clinical fixture를 실제 provider에 재시도해 title-only Korean 결과를 확인하고, 필요 시 잘못된 unsent legacy 번역을 검증 후 재처리한다.

### 개선 과제
개선 과제 ID: CI-2026-10-25-018
성과 판정: PARTIAL
근거: 운영에서 확인한 Phase syntax 및 ID 혼합 오류에 표적 회귀를 추가하고 전체 검증을 통과했으나, 통합 테스트 변경의 commit 및 provider quota로 인한 실제 신규 번역 확인·과거 backlog 소진은 남았다.

### 커밋·푸시·배포
- RSS 전용 코드 커밋 `6316c4ff` push 및 운영 배포 완료. 추가 provider-input 통합 테스트와 운영 로그 변경은 `614363b2` 기준 전체 검증 완료, 별도 문서·테스트 커밋 예정이며, 실제 provider 번역 품질 검증은 quota reset 뒤에 남아 있다.

## [2026-10-25] RSS 제목 번역 개선 운영 배포 확인

### 목표
- 임상 단계 전체를 번역 순서에서 보호한 RSS 제목 변경을 운영에 반영하고 세 출처의 알림 큐 진행 상태를 read-only로 확인한다.

### 반영
- 앞선 RSS 전용 코드 커밋 `d5e98421`이 `oci`에 푸시되고 운영 SHA `d5e9842110997ca7f1d0daca248489618eefc9b2`로 활성화됐다. GitHub Actions run `40191460423`이 success로 완료됐다.
- 운영 GET `/api/debug/market-rss-translations`를 읽기 전용으로 조회했다. 2026-10-25 12:10Z 기준 SENT는 GlobeNewswire 25, SEC 5,599, StockTitan 18,119이며 notification pending은 각각 2, 3,402, 2,298이다. SEC 큐는 12:08Z 조회의 3,439에서 감소해 자동 배출 중이다.
- 월간 번역 한도에 걸린 StockTitan 10,286건과 PENDING 1,104건은 현재 번역·알림 완료가 아니다. retry 조건은 월 경계 이후 재시도를 허용한다. 과거 sent gate violation aggregate(SEC 313, StockTitan 9,335)는 기존 발송 기록의 진단 수치로, 이미 전송된 Discord 메시지를 되돌릴 수 없다.
- 이번 관찰은 새 운영 기사에 대한 외부 provider 번역 샘플을 입증하지 않는다. 현재 quota skip이 실제 provider 요청을 막고 있어 provider 응답을 검증할 표본이 없다.

### 검증
- GitHub Actions run `40191460423`: Verify deployment, standalone packaging, SSH configuration, release upload, activate release 모두 success.
- 운영 `/health-check` HTTP 200 및 SHA `d5e9842110997ca7f1d0daca248489618eefc9b2` 확인.
- 표적 회귀 154개 통과 및 전체 `npm.cmd run deploy:verify` 통과(302개 test files: 301 passed/1 skipped; 1,511 tests passed/3 skipped).
- 운영 DB aggregate 조회는 GET만 사용했으며 기사 본문/raw payload를 요청하지 않았다.

### 재발 감지·남은 위험
- cron은 기존 translation retry 조건으로 월간 한도 오류 행을 월 경계 뒤 다시 처리한다. 월 경계 이후에도 `translation_pending`, `notification_pending`, `SKIPPED`가 줄지 않는지 확인이 필요하다.
- 집계상 legacy sent gate violation이 존재하나 이미 보낸 메시지의 수정·삭제는 하지 않았다. 신규 전송은 현행 제목 번역 게이트로 제한된다.
- Provider quota와 backlog 처리 속도 때문에 모든 과거 기사의 번역·Discord 전송은 아직 끝나지 않았다.

### 다음 개선
- 월 한도 재설정 후 실제 새 provider 번역에서 한국어 제목의 임상 단계 위치 보존, summary/body 원문 유지, 세 출처 큐 소진을 확인한다.

### 개선 과제
개선 과제 ID: CI-2026-10-25-017
성과 판정: PARTIAL
근거: 새 코드 배포 및 운영 SHA를 확인했고 SEC 알림 대기량이 감소 중이나, 전체 과거 큐와 월간 한도 backlog는 남아 있다. 실 provider 신규 제목 품질 표본은 quota 때문에 확인하지 못했다.

### 커밋·푸시·배포
- RSS 코드 커밋·push·운영 배포 완료: `d5e98421`. 이번 운영 확인과 backlog 상태 기록은 후속 문서 변경으로 반영한다.

## [2026-10-25] RSS 임상 단계 제목 번역 보존

### 목표
- 운영에서 확인한 Phase 2 임상 결과 제목의 어색한 단계 표현을 줄이고, 제목의 임상 단계 숫자·문자를 원문과 일치시킨다.

### 근본 원인
- 번역 provider가 `Phase 2 data`를 자연스러운 한국어 임상 단계로 안정적으로 옮기지 못해 `2 상기 데이터`처럼 단계와 뒤 단어가 붙은 오역이 나왔다. 기존 숫자 검증은 새 숫자 생성을 막지만, 출처에 있는 숫자 2가 임상 단계 의미를 유지하는지는 검사하지 않았다.

### 반영
- `lib/market-rss-headline-context.ts`: 제목 자체에 임상·종양·치료 등 분명한 임상 맥락이 있을 때만 Phase 숫자/문자를 `2상`, `1b상`, `2/3상`으로 정규화한다. 일반 프로젝트 확장 단계나 단순 `Phase 2 study`는 변경하지 않는다.
- `lib/market-rss-headline-context.test.ts`: 숫자·영문 단계·로마 숫자와 비임상 제목 경계를 검증한다.
- `lib/translate-market-rss-item.test.ts`: 실제 제목 번역 입력에서 임상 단계 marker를 보호하고 결과에 `2상`을 복원하는지, summary/body는 공급자에 보내지 않고 원문 그대로 반환하는지 확인한다.
- `lib/market-rss-translation-tokens.mjs`, `lib/market-rss-translation-protection.test.ts`: 정규화된 임상 단계 전체를 하나의 위치 보존 marker로 보호한다. `2상`, `1b상`, `2/3상` 및 조합형 단계의 복원을 검사한다.
- `docs/architecture/stocktitan-translation.md`: 제목 입력의 단계 정규화 경계를 문서화한다.

### 검증
- `npm.cmd exec vitest run -- lib/market-rss-translation-protection.test.ts lib/market-rss-headline-context.test.ts lib/translate-market-rss-item.test.ts --reporter=dot`: 3개 파일 154개 테스트 통과.
- `npm.cmd run docs:check`: 통과. 첫 실행은 중복 improvement task ID `CI-2026-10-25-015` 때문에 실패해 새 ID `016`으로 수정 후 통과했다.
- 단계 marker 보호 포함 `npm.cmd run deploy:verify` 통과: dependency audit 0, build, standalone runtime smoke, desktop/mobile Chrome hydration, 전체 302개 test files(301 passed/1 skipped; 1,511 tests passed/3 skipped), typecheck, docs/migration, scope/KIS/auth/OCI cron gates. standalone 빌드 중 Windows node_modules junction EPERM 경고는 smoke fallback 성공으로 복구됐다.
- production rollout과 실제 provider 결과 검증은 아직 전이다.

### 재발 감지·남은 위험
- 회귀 테스트가 임상 단계 표기 및 비임상 project phase 비변경을 자동 검사한다. 이 규칙은 임상 맥락 키워드를 기반으로 하므로, 새로운 적응증 약어·언어별 phase 표현은 누락될 수 있고 의미 전반의 번역 정확도를 증명하지 않는다.
- 위치 보호는 번역 provider가 marker를 그대로 보존할 때만 작동한다. marker 손실·변조는 기존 품질 게이트에 의해 번역 미완료로 처리되며 Discord 전송을 보류한다.
- 월간 provider 한도 소진으로 backlog와 실 provider 품질 표본 관찰은 계속 제한된다.

### 다음 개선
- 변경을 전체 배포 검증과 운영 배포로 반영한 뒤 신규 임상 단계 제목의 한국어 출력·Discord 게이트·summary/body 원문 유지 상태를 확인하고, 남은 token/numeric 오류 표본을 보완한다.

### 개선 과제
개선 과제 ID: CI-2026-10-25-016
성과 판정: PARTIAL
근거: 실제 운영에서 확인한 임상 단계 오역의 구체적인 입력 경로를 정규화하고 표적 테스트 108개 및 전체 배포 검증을 통과했다. 운영 배포 후 실제 provider 출력의 의미 보존 확인은 아직 남아 있다.

### 커밋·푸시·배포
- 전체 검증 완료. commit/push/production deployment 미실행; RSS 전용 변경만 분리해 진행한다.

## [2026-10-25] RSS 제목 번역 괄호 잘림 차단

### 목표
- 운영 RSS에서 확인한 한국어 제목이 잘린 채 `TRANSLATED`로 저장되는 결함을 줄이고, 제목 번역이 품질 검사를 통과하기 전에는 Discord 게이트에 도달하지 않게 한다.

### 근본 원인
- 현재 완전성 검사는 한국어 음절 최소량만 비교해 provider 출력의 닫히지 않은 괄호를 감지하지 못했다. 운영 GlobeNewswire 표본 `... carcinoma (CSCC)`가 `...(CSCC`로 저장된 사례를 read-only debug API에서 확인했다.

### 반영
- `lib/market-rss-translation-quality.mjs`: ASCII 및 전각 괄호·대괄호·중괄호가 모두 짝을 이루는지 완전성 검사에 추가했다. 불균형 결과는 기존 `translation_output_incomplete` fallback 및 다른 provider 재시도 경로를 따른다.
- `lib/market-rss-translation-quality.test.ts`: 운영 표본 형태의 괄호 잘림 거부와 정상 ASCII/전각 짝 괄호 통과 회귀 사례를 추가했다.
- `lib/translate-market-rss-item.test.ts`: 번역기 응답에서 보호된 `CSCC` 토큰을 복원한 뒤 닫는 괄호가 없으면 원문 제목으로 fallback되고, 요약·본문 원문은 유지되는 end-to-end 회귀 테스트를 추가했다.
- `docs/architecture/stocktitan-translation.md`: 신규 구조 검사의 범위와 의미 정확성은 별도 표본 검토가 필요한 한계를 기록했다.

### 검증
- 배포 `c7278d40` 이후 운영 `/health-check`에서 동일 SHA가 서빙됨을 확인했다. read-only RSS 진단 시점 `2026-10-25 10:55:35Z`: GlobeNewswire 25건 전부 translated/sent, SEC 번역 대기 0·알림 대기 4,736, StockTitan 번역 대기 2,186·알림 대기 2,298이었다. 이는 잔여 backlog가 없어졌다는 증거가 아니다.
- 운영 번역 표본에서는 괄호가 닫히지 않은 잘린 제목이 완전성 검사까지 통과할 수 있음을 확인했다. 이 항목은 기존 구현의 회귀 원인으로 잡아 검사 규칙을 보강했다.
- `npm.cmd exec vitest run -- lib/market-rss-translation-quality.test.ts --reporter=dot`: 1개 파일, 12개 테스트 통과. `git diff --check` 통과.
- end-to-end 테스트의 첫 실행은 모의 provider가 보호 토큰 `ZX0Q`를 돌려주지 않아 `protected_token_mismatch` 결과가 발생했다. mock이 보호 토큰을 보존하도록 고친 뒤 `npm.cmd exec vitest run -- lib/translate-market-rss-item.test.ts lib/market-rss-translation-quality.test.ts --reporter=dot`에서 2개 파일 111개 테스트 통과.
- 첫 `npm.cmd run deploy:verify`는 개선 로그 필수 섹션 누락으로 `docs:check`에서 실패했다. DEVELOPMENT_LOG.md에 요구된 다음 개선·개선 과제 섹션을 보완했다.
- `lib/translate-market-rss-item.test.ts` 추가 후 `npm.cmd run deploy:verify` 재실행 통과: audit 취약점 0, 프로덕션 빌드·standalone runtime smoke·Chrome desktop/mobile hydration 통과, 전체 테스트 301개 통과/1개 skip(1,502 passed/3 skipped), typecheck, docs/migration, scope/KIS/auth/OCI cron 검사 통과. Windows `node_modules` junction trace `EPERM` 경고가 있었지만 fallback smoke는 통과했다.
- 커밋 `4cefb6ed`를 `oci`에 푸시했고 GitHub Actions run `40187578619` 성공을 확인했다. 운영 `/health-check`에서 정확한 SHA `4cefb6edc3dcc93fced0a837258df7f998acfd38`를 read-only 확인했다.
- 후속 end-to-end 회귀 테스트 커밋 `ef9f38cc`도 `oci`에 푸시했다. GitHub Actions run `40189112869` 성공 및 운영 `/health-check`의 정확한 SHA `ef9f38cca34509f25e3f7f32a1ed7d7abcbd5060`을 확인했다.
- 배포 뒤 `2026-10-25 11:14Z` 운영 aggregate snapshot은 StockTitan 번역 대기 2,097건·알림 대기 2,301건이었다. GlobeNewswire는 번역 대기 0건이나 최근 신규 2건은 두 provider의 월간 문자 상한 때문에 SKIPPED라 번역 게이트가 전송을 보류했다. 따라서 새 구조 검사가 실 provider 응답에 발동하는 모습 및 전체 backlog 해소는 아직 확인하지 못했다.

### 재발 감지·남은 위험
- 자동 회귀 테스트가 불균형 괄호/괄호쌍 제목을 검사한다. 이 구조 검사는 번역 의미의 정확성, 임상 단계 표현의 자연스러움, 누락된 괄호 외 텍스트 절단을 증명하지 않으며, 의미 보존 검증 개선과 운영 표본 점검이 계속 필요하다.
- Google 내부 월 300,000자 제한이 운영 backlog 해소를 제한한다. 월 한도 조정에 관한 사용자 답변을 기다리는 동안 비용 영향이 있는 설정 변경은 보류한다.

### 다음 개선
- 운영에서 확보한 실제 오역·누락 제목 표본을 `translation_output_incomplete` 등 원인별로 분류하고, 임상 단계·날짜·기업 행동처럼 중요한 제목 사실을 보존하는 검증을 별도 회귀 테스트와 함께 설계한다.

### 개선 과제
개선 과제 ID: CI-2026-10-25-014
성과 판정: PARTIAL
근거: 운영에서 실제로 발생한 닫히지 않은 괄호의 provider 응답을 품질 함수가 통과시키는 결함을 확인하고 구조 검사를 추가했다. 회귀 테스트 및 전체 배포 검증은 통과했고 운영 SHA도 일치한다. 단, provider 월 한도 소진으로 guard의 새 실패 분기를 운영 번역 응답에서 직접 관찰하지 못했으며 의미 정확성도 아직 증명하지 못했다.

### 커밋·푸시·배포
- 품질 검사 코드 `4cefb6ed` 및 end-to-end 회귀 테스트 `ef9f38cc`를 `oci`에 푸시·배포 완료(GitHub Actions runs `40187578619`, `40189112869`; 운영 SHA 대조). 현재 이 운영 결과 문서 보강만 커밋 전이며, 코드·테스트 트리는 clean 상태다.

## [2026-10-25] RSS batch 설정 실행 프로세스 경계 수정

### 목표
- 새 배포 `84f7dc79` 이후에도 운영 RSS run이 회당 세 건만 처리해, 번역·알림 batch 설정이 실제 앱에 적용되지 않은 점을 수정한다.

### 근본 원인
- `stockman-rss.service`는 `scripts/oci-rss-cron.sh`로 HTTP 요청만 보낸다. batch 환경변수는 이미 떠 있는 `stockman.service` 앱 프로세스가 읽으므로 RSS oneshot service의 `Environment=`는 API route 동작에 영향을 주지 않았다.

### 반영
- `app/api/cron/market-rss/route.ts`: 번역·알림 크기를 앱 route에서 실행당 20건으로 고정한다.
- `app/api/cron/market-rss/route.test.ts`: 앱 환경에 batch 값 `3`이 있어도 두 pipeline 호출이 `20`을 받는지 검증한다.
- `scripts/check-oci-cron.mjs`, `deploy/oci/README.md`, `docs/ERROR_HANDLING.md`: 앱 route가 배치 크기를 소유한다는 설정 경계를 기록하고 검사한다. RSS oneshot unit의 영향 없는 환경 설정은 제거한다.

### 검증
- GitHub Actions run `40108162312` 성공 및 운영 `/health-check`에서 배포 SHA `84f7dc79`를 확인했다. 그 뒤 `15:48:53Z` RSS run은 여전히 `attempted=3`, `translated=0`, `notified.sent=0`이어서 batch 설정 적용 실패를 재현했다.
- `npm.cmd exec vitest run -- app/api/cron/market-rss/route.test.ts lib/translate-market-rss-item.test.ts lib/market-rss-translation-client.test.ts` 재실행에서 3개 파일 84개 테스트 통과했다. `npm.cmd run cron:check`와 `npm.cmd run docs:check`도 통과했다. 첫 실행은 route 테스트 mock 잔여 참조 때문에 실패했으며 수정 후 재실행 통과했다.
- route 테스트는 앱 RSS batch 환경변수를 `3`으로 설정해도 번역·알림 함수에 `20`을 전달하는 것을 확인했다. 최신 `origin/oci` 통합 tree의 `npm.cmd run deploy:verify` 통과(297개 파일 통과, 1개 skip; 1,450 tests 통과, 3개 skip), build, typecheck, standalone runtime smoke, Chrome desktop/mobile hydration, docs/migration 및 cron 검사 통과했다.
- 새 route 고정 batch의 fast-forward push, 재배포 및 실제 attempted 20·backlog 진행은 아직 확인하지 않았다.

### 남은 위험
- 번역 품질 및 Google 월 한도 초과로 일부 제목은 계속 보류될 수 있다. 번역되지 않은 원문은 Discord로 우회 전송하지 않는다.

### 다음 개선
- `deploy:verify`와 회귀 테스트를 통과한 뒤 RSS route 변경을 fast-forward 배포하고, 실제 운영 run에서 attempted 20 및 translated·Discord sent 증가를 확인한다.

### 개선 과제
개선 과제 ID: CI-2026-10-25-013
성과 판정: PARTIAL
근거: 배치 설정이 앱 환경에 적용되지 않는 실행 경계를 운영 로그로 재현했으며 route 수준 변경은 반영했지만, 새 revision 배포와 backlog 처리는 미완료다.

### 커밋·푸시·배포
- 미실행: 최신 route 변경 전체 검증, 한국어 상세 커밋, fast-forward push, 운영 재배포.

## [2026-10-25] RSS 숫자 변환 검증 오탐과 운영 batch override 수정

### 목표
- 2026-10-24 배포 이후 운영 RSS cron이 제목 번역 오류로 계속 발송을 보류하고 매 실행 세 건만 처리하는 문제를 확인했다.

### 근본 원인
- 영어 서수 `Third`를 Azure가 `3`으로 자연스럽게 번역했지만 숫자 검사가 원문에 아라비아 숫자가 없다는 이유만으로 환각으로 판단했다. 실제 운영 제목 `Hawaiian Electric ... Third Quarter 2026 ... November 6`을 제목만 전달해 재현했으며 Azure 결과 `3분기 ...` 자체는 한국어·완전성 검증을 통과했지만 숫자 오탐으로 fallback됐다.
- OCI의 `/etc/stockman/stockman.env` batch 값이 코드 기본값 50을 덮어써 production run `attempted=3`을 유지했다. 세 대상 출처의 30일 운영 조회에서 PENDING 5,222건을 확인했다.

### 반영
- `lib/translate-market-rss-item.ts`: 원문에 포함된 영어 기수·서수 값에 대응하는 번역 숫자는 허용하고, 출처에 없는 숫자 및 새 금융 부호는 계속 거부한다.
- `lib/translate-market-rss-item.test.ts`: `Third Quarter` → `3분기` 회귀 사례를 추가한다. summary는 원문 그대로인지 함께 확인한다.
- `deploy/oci/stockman-rss.service`: 환경파일보다 뒤에 `Environment=`로 번역·알림을 실행당 20건으로 고정해 과거 작은 override를 무효화한다.
- `scripts/check-oci-cron.mjs`, `deploy/oci/README.md`, `docs/ERROR_HANDLING.md`: batch 설정과 원인·탐지·위험을 문서 및 자동 검사에 연결한다.

### 검증
- 이전 배포 `afd7a2bdce83b8f8b86292893c4c5601ea99862c`은 GitHub Actions run `40104609209` 성공 및 운영 `/health-check` 정확한 SHA로 확인했다.
- 운영 run `15:03–15:06Z`는 회당 3건 시도, 번역 성공 0건, Discord 전송 0건, `backlogRemaining=true`였다. Google 월 예약량은 299,992/300,000자, Azure 월 잔여량은 1,518,453자였다.
- 대표 숫자 포함 제목만 provider에 전달해 `3분기`·`11월` 출력에 대한 오탐을 재현하고 회귀 테스트로 수정했다. 대상 3개 테스트 파일 84개 통과, 최신 `origin/oci` 통합 tree의 최종 `npm.cmd run deploy:verify` 통과(297개 파일 통과, 1개 skip; 1,450 tests 통과, 3개 skip), build, typecheck, standalone runtime smoke, desktop/mobile Chrome hydration, `npm.cmd run docs:check`, `npm.cmd run cron:check`, `git diff --check` 통과. 첫 전체 실행의 KIS rate-limit 테스트는 59초가 반환돼 고정 기대값 60과 달랐고, 단독 재실행 및 후속 전체 검증에서 통과했다. Windows `node_modules` junction의 standalone trace EPERM 경고가 있었으나 smoke와 나머지 검증은 통과했다.

### 남은 위험
- 다른 번역 품질 실패는 여전히 전송을 보류한다. Google 사용 한도는 비용 승인 없이 높이지 않는다.

### 다음 개선
- 전체 `npm.cmd run deploy:verify`를 통과시킨 뒤 fast-forward push·자동 배포하고, 세 출처의 제목 번역·Discord `SENT` 증가와 backlog 감소를 확인한다. 30일보다 오래된 대기 건까지 소진됐는지 운영 상태에서 확인한다.

### 개선 과제
개선 과제 ID: CI-2026-10-25-012
성과 판정: PARTIAL
근거: 실제 숫자 변환 오탐을 재현해 수정했고 전체 배포 검증을 통과했으나, 새 revision 배포와 운영 backlog 발송은 아직 완료되지 않았다.

### 커밋·푸시·배포
- 미실행: 변경 검증 후 한국어 상세 커밋, fast-forward push, 운영 자동 배포.

## [2026-10-24] RSS 제목 검증 fallback 및 backlog 처리량 복구

### 목표
- RSS host 수정 배포 후 운영 cron이 세 출처를 정상 수집했으나, Azure 번역 결과가 `translation_output_incomplete` 또는 `translation_numeric_hallucination` 검증에 실패하면서 최근 실행의 제목 번역·Discord 발송이 0건이었다. Google 번역 키도 설정되어 있었지만 provider 선택기는 Azure의 품질 실패를 quota/API 실패와 구분하지 않아 Google 재시도를 수행하지 않았다.
- 과거 대기 기사는 cron당 최대 3건만 시도해 처리 시간이 과도하게 길어질 수 있었다.

### 반영
- `lib/market-rss-translation-client.ts`, `lib/translation-types.ts`: 서로 다른 provider 결과가 제목 검증에 실패하면 Google 번역을 fallback으로 한 번 호출할 수 있게 했다. 정상적인 API/할당량 fallback 동작은 유지한다.
- `lib/translate-market-rss-item.ts`: Azure 결과가 제목 검증을 통과하지 못하는 경우에만 Google fallback을 한 번 시도하고, fallback 결과도 기존 한국어·완전성·숫자 검증을 다시 통과해야 저장·전송한다. provider 입력은 계속 제목으로 한정한다.
- `app/api/cron/market-rss/route.ts`: 번역·Discord 처리 한도를 각각 최대 50건으로 조정하고 남은 backlog를 다음 timer가 이어 처리한다. full-table Bullish mirror scan은 실행 경로에 포함하지 않는다.
- `deploy/oci/README.md` 및 관련 회귀 테스트를 새 fallback과 batch 기준에 맞췄다.

### 검증
- 운영 `85d679e8` 배포 확인 뒤 `/api/debug/automation-runs`에서 세 출처가 GlobeNewswire 20건, StockTitan 100건, SEC 100건 저장된 것을 확인했다. 이어진 실행들에서는 번역 fallback 3건, `notified.sent=0`이 반복되어 backlog 전송 완료로 판단하지 않았다.
- `npm.cmd exec vitest run -- lib/translate-market-rss-item.test.ts lib/market-rss-translation-client.test.ts app/api/cron/market-rss/route.test.ts --reporter=dot`: 3개 파일, 82개 테스트 통과. `npm.cmd run docs:check`: 통과.
- `npm.cmd run deploy:verify`: dependency audit 취약점 0, 프로덕션 빌드, standalone `/charts` HTTP 200, desktop/mobile Chrome hydration, API smoke, 전체 테스트 296개 파일(295 통과·1 skip; 1,437 통과·3 skip), typecheck, docs/migrations, verify-scope, KIS boundary, Bearer auth(178 routes), OCI cron 검사 통과. 첫 검증의 Chrome page navigation timeout은 재실행에서 재현되지 않았다. Windows junction standalone trace EPERM 경고는 있었으나 smoke는 모두 통과했다.
- Google fallback 결과도 기존 제목 한국어·완전성·숫자 검증을 다시 통과해야 알림에 사용된다. summary/content는 provider에 전달하지 않는다.

### 다음 개선
- 커밋·push·배포하고, cron 실행 시간이 180초 미만인지, Google fallback 성공률과 backlog 감소, 세 출처별 Discord `SENT` 결과를 확인한다.
- 번역 provider 출력 또는 할당량이 불안정하면 검증 실패 항목은 전송되지 않고 재시도 대기 상태로 남는다. 50건 batch가 시간 제한에 접근하면 운영 duration에 근거해 batch를 조정한다.

### 개선 과제
개선 과제 ID: CI-2026-10-24-011
성과 판정: PARTIAL
근거: 운영에서 GlobeNewswire 피드 수집을 복구했으나 제목 번역 품질 fallback이 없어 새 기사 발송이 막힌 것을 확인했다. 보조 provider fallback과 backlog batch 상향은 전체 deploy:verify를 통과했지만 새 revision 배포 및 운영 발송은 미확인이다.

### 커밋·푸시·배포
- 미실행: 새 번역 fallback 및 backlog batch 변경의 한국어 상세 커밋·push, 운영 배포 및 실수신 확인.

## [2026-10-24] 미국 보통주 KIS 산업분류 코드 파싱·운영 동기화

### 목표
- KIS 공식 마스터만 산업분류 출처로 사용하고, 미국 보통주 산업분류 코드를 운영 DB까지 안전하게 동기화한다.

### 조사 결과
- KIS 마스터 헤더 순서와 보관 원본을 대조해 `parseOverseas()`의 필드 오프셋 오류를 확인했다. 원본 `icod`는 `f[19]`인데 현재 `industry_code`는 `f[23]`에서 읽는다. 또한 `isdr`는 `f[17]`, `etyp`은 `f[22]`이나 현재 `f[20]`, `f[24]`를 읽는다.
- 2026-08-18 원본의 실제 종목 예시에서 AAPL `730`, MSFT `720`, NVDA `710`, TSLA `310`을 확인했다. 따라서 “KIS 원본에 미국 업종 코드가 전부 없다”는 직전 결론을 정정한다.
- 메인 해외 마스터 재적재의 conflict update에 `industryCode`가 없어 기존 행의 정정값도 갱신되지 않는 문제를 확인했다.
- 산업코드 동기화 API를 추가해 KIS NAS/NYS/AMS 원본 3개가 모두 검증된 후 기존 활성 보통주 행의 산업코드만 하나의 트랜잭션으로 갱신하도록 했다. 관리자 GET은 시장별 coverage를 보여주고 POST는 원본 multipart 업로드를 받는다.
- KIS 필드 오프셋 및 전체 적재 upsert를 교정했다. 산업분류 원천은 KIS만 사용한다.
- 구현·운영 흐름을 [`docs/architecture/us-industry-classification-data-design.md`](docs/architecture/us-industry-classification-data-design.md)에 기록했다.

### 검증
- 보관된 KIS NAS/NYS/AMS 원본 12,725행을 확인했다. 올바른 ICOD 열에서 `000`이 아닌 코드는 NAS 1,405건, NYS 1,309건, AMS 105건이었다.
- KIS 공식 다운로드 원본 NAS/NYS/AMS를 실시간으로 내려받아 파서 회귀 테스트에 제공했다. 파일은 각각 5,272행, 2,839행, 4,780행이며 현재 KIS 원본 형식 및 AAPL/MSFT/NVDA/TSLA 산업코드 샘플 검증을 통과했다.
- 최신 KIS 파일 fixture를 포함한 parser·관리자 API 회귀 14개 통과. 최종 `npm.cmd run deploy:verify` 통과: build, standalone runtime smoke, desktop/mobile Chrome hydration, 전체 292개 test files(1,431 passed, 3 skipped), typecheck, docs/migration, auth/KIS/cron gates.
- `.env.local` 기반 로컬 DB read-only 연결은 `localhost:5433` 연결 거부로 실패했다. 개발 서버 admin login은 `scripts/dev-server.mjs`가 `ADMIN_DASHBOARD_PASSWORD`를 제거하는 설계여서 500으로 확인됐고, 보호된 진단 경로는 401로 fail-closed 동작했다.
- KIS 최신 원본은 내려받아 파싱 검증했으나 운영 DB 적재는 새 API 배포 후 진행해야 한다.

### 남은 개선 및 재발 방지
- KIS 전용 동기화 API를 운영에 배포한 다음 `.env.local` 인증값으로 운영 admin login을 시도하고, 인증 성공 시 KIS 원본 3개를 업로드한다.
- 운영 DB에서 거래소별 활성 보통주 분모·분류/미분류 수와 API의 원본 후보·반영·미매칭 수를 대조한다. 인증 실패/불일치/코드 파싱 오류 시 성공 보고 금지.
- API 전후 운영 집계가 일치하지 않거나 시장별 source count가 0이면 성공으로 간주하지 않고 원본/DB 샘플을 대조한다.

### 반영
- `parseOverseas()`의 KIS 오프셋을 바로잡고 미국 common/special master upsert에서 `industry_code`를 갱신하도록 수정했다.
- KIS 3개 해외 마스터 전용 트랜잭션 sync 모듈과 관리자 진단/업로드 API를 추가했다. 미리 검증되지 않은 입력은 DB에 반영하지 않는다.
- KIS 원본 regression/route tests 및 KIS 전용 설계 문서를 갱신했다.

### 운영 배포 및 DB 검증 상태 (2026-10-24 continuation)
- 최신 공식 KIS 마스터 NAS/NYS/AMS를 다시 다운로드하여 파서의 현재 원본 형식 통과를 로컬에서 확인했다. 다운로드 파일은 임시 경로에 두며 저장소에는 추가하지 않았다.
- 운영 API `GET /api/admin/us-industry-codes`가 404를 반환해 신규 코드가 아직 운영 배포되지 않은 것을 확인했다.
- **초기 차단과 해소**: 처음에는 CLI/Actions 도구를 찾지 못해 멈췄지만, 뒤이어 Git credential manager가 푸시 인증을 제공함을 확인하고 같은 인증을 메모리에서만 사용해 `workflow_dispatch`를 실행했다. 코드 commit `3942ffd3`의 Deploy OCI run `40085691588`은 전체 성공했다. 자격증명 문자열은 출력하지 않았다.
- `.env.local`의 관리자 암호로 운영 관리자 로그인은 성공했다. 로컬 DB 주소 연결은 운영 DB 증거가 아니므로 사용하지 않았다. 전체 로컬 `deploy:verify`도 별도로 수행했으며 이는 운영 DB 반영 증거와 구분한다.
- **완료 기준**: 관리자 인증 GET에서 NAS/NYS/AMS별 활성 `COMMON_STOCK` 분모 및 ICOD coverage를 확인하고, 세 KIS 원본 업로드의 persisted/unmatched/unclassified 수를 저장 후 GET 결과와 대조한다. KIS가 `000`을 제공한 종목은 공식 원천상 미분류로 보고 임의 코드를 채우지 않는다.
- **운영 후속 검증**: Deploy OCI Actions run `40085691588`이 성공했고 새 운영 route가 401(미인증), 200(관리자 인증)으로 응답했다. 운영 DB 기준 활성 COMMON_STOCK은 NAS 3,949, NYS 2,480, AMS 275이며 업로드 전 비미분류 코드는 각 0건이었다. KIS 마스터 3개 실제 업로드는 HTTP 500 `US_INDUSTRY_SYNC_FAILED`로 롤백됐다. 운영 스키마에서 `industry_code`와 `source_file` 컬럼은 확인했고 관리자 health probe는 DB 연결·운영 컬럼 검사를 통과했으나, 실패 SQLSTATE/단계가 응답에 노출되지 않아 원인은 아직 미확정이다.
- **진단 경로 배포**: 관리자 전용 동기화 오류 응답에 단계, PostgreSQL SQLSTATE 및 테이블/컬럼/제약조건 식별자만 포함하고 원문 메시지는 반환하지 않도록 보강했다. 민감 원문 미노출 회귀 테스트를 추가하고 전체 검증 후 commit/push했으며, Deploy OCI run `40086976112` 성공 뒤 운영에서 아래 실제 원인을 확보했다.
- **운영 직접 디버깅 결과**: 진단 코드 배포 후 재시도 응답은 `stage=update_NAS`, SQLSTATE `23502` (`DATABASE_NOT_NULL_VIOLATION`)이었다. 원인은 DB 스키마가 아니라 내부 camelCase `{ industryCode, sourceFile }` 객체를 SQL의 snake_case `jsonb_to_recordset(... industry_code, source_file)`에 그대로 직렬화한 키 불일치다. 이 때문에 두 SQL 값이 NULL이 되어 NOT NULL 위반이 발생했고 트랜잭션 전체가 롤백됐다.
- **수정/재발 방지**: DB payload 직렬화 직전에 `industry_code`/`source_file`로 명시 변환하고, NAS/NYS/AMS 모두에 대해 snake_case payload 키와 BEGIN→UPDATE×3→coverage→COMMIT 순서를 검증하는 회귀 테스트를 추가했다. 이 수정 이후 같은 최신 KIS 원본으로 운영 재적재와 GET coverage 대조를 다시 완료해야 한다.
- **운영 수정 반영**: Deploy OCI run `40088175657` 성공 뒤 같은 KIS 공식 원본 재적재가 HTTP 200으로 완료됐다. 저장 건수는 NAS 3,176 / NYS 1,855 / AMS 237, `000` 외 분류코드는 NAS 1,354 / NYS 1,186 / AMS 94이며, 인증 GET coverage가 동일 값으로 확인됐다. 후보 중 기존 활성 DB COMMON_STOCK에 매칭되지 않은 NAS 64 / NYS 9 / AMS 17건은 자동 신규 등록하지 않았다. 전체 원본 행을 응답에 펼쳐 반환하는 불필요한 응답 크기도 함께 제거하고, write-after-read 값 불일치 시 전체 롤백 및 미매칭 ticker 샘플 제한 반환을 추가 검증한다.

### 다음 개선
- 운영 배포 후 최신 KIS 원본을 업로드하고 전체 보통주 coverage를 실제 DB로 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-24-007
- 성과 판정: PARTIAL
- 근거: KIS 오프셋 파싱, industry_code upsert, KIS 전용 트랜잭션 동기화 API와 KIS 최신 원본 parser 테스트까지 구현했다. 운영 DB 실제 반영과 coverage 증명은 아직 미완료다.
- 다음 개선: 배포 API 인증 후 KIS 최신 원본을 업로드하고 거래소별 DB coverage와 미매칭을 확인한다.

### 커밋·푸시·배포
- 커밋 `0f7ddab5` 생성 완료(작업 브랜치 `codex/kis-industry-20261024`). push 및 운영 API 배포/적재는 아직 완료되지 않았다.
## [2026-10-24] GlobeNewswire RSS 호스트 403 복구

### 목표
- RSS-only fallback을 배포했으나 운영 `/api/debug/automation-runs?module=market-rss`에서 GLOBENEWSWIRE가 계속 `FETCH_FAILED`였다. 실행 중인 `www.globenewswire.com/RssFeed/...` URL은 로컬 네트워크 재현에서도 403이었다.

### 반영
- `lib/globenewswire-rss.ts`: Public Companies feed 기본 호스트를 동일한 공식 RSS 경로를 제공하며 HTTP 200을 반환하는 `rss.globenewswire.com`으로 변경했다. 홈페이지 root fallback과 정상 custom feed override는 유지한다.
- `lib/globenewswire-rss.test.ts`: root fallback이 RSS host의 feed URL을 선택하는지 검증한다.
- `docs/operations/globenewswire-rss-recovery.md`: 403 재현, 새 host의 HTTP 응답, 배포 후 검증 절차를 기록한다.

### 검증
- 공식 GlobeNewswire RSS feed 목록의 Public Companies 경로를 기준으로 host를 비교했다. `www.globenewswire.com` RSS·Atom URL은 HTTP 403, 같은 RSS 경로의 `rss.globenewswire.com`은 HTTP 200, `application/rss+xml`, 47,689 bytes를 반환했다.
- `npm.cmd exec vitest run -- lib/globenewswire-rss.test.ts --reporter=dot`: 1개 파일, 4개 테스트 통과. `npm.cmd run docs:check`: 통과.
- `npm.cmd run deploy:verify`: 의존성 감사 취약점 0, 프로덕션 빌드, standalone `/charts` HTTP 200, desktop/mobile Chrome hydration, API smoke, 전체 296개 테스트 파일(295 통과·1 skip; 1,434 통과·3 skip), typecheck, docs/migrations, verify-scope, KIS boundary, Bearer auth(178 routes), OCI cron 검사 통과. Windows junction standalone trace EPERM 경고는 있었으나 모든 runtime/browser/API smoke가 통과했다.
- 앞선 배포 commit `9d737083`의 OCI workflow는 성공했으며 운영 `/health-check`가 해당 commit을 반환했다. 다만 그 cron의 GlobeNewswire 수집은 계속 실패했고 이 항목은 새 host 변경 후 재배포가 필요하다.
- StockTitan·SEC cron 실행과 Discord 전송은 운영 요약에서 관측됐지만, GlobeNewswire 성공 및 과거 backlog 전체 발송은 아직 확인되지 않았다. 번역 provider 검증이 실패한 제목은 전송 gate에서 보류되어 재시도된다.

### 다음 개선
- `npm.cmd run deploy:verify` 및 `npm.cmd run docs:check` 후 새 RSS 변경을 배포한다. 배포된 run에서 GLOBENEWSWIRE `STORED`와 count>0, translated title 및 Discord `SENT`를 확인한다.
- 번역 오류·provider 응답 품질·공급자 가용성이 backlog 완료를 지연할 수 있으므로 실패 사유와 backlog를 모니터링한다.

### 개선 과제
개선 과제 ID: CI-2026-10-24-008
성과 판정: PARTIAL
근거: 403을 재현하고 RSS host를 수정했으며 전체 deploy:verify가 통과했다. 현재 revision의 배포와 GlobeNewswire 실제 발송은 미완료다.

### 커밋·푸시·배포
- 미실행: 새 RSS host 변경의 한국어 상세 커밋·push 및 OCI 배포. 앞선 RSS-only deployment branch workflow는 새 `oci` 실행과 같은 concurrency group을 공유해 취소됐고, 뒤이어 원격 `oci`의 최신 descendant `9d737083` 배포가 성공했다.

## [2026-10-24] GlobeNewswire 운영 homepage override 자동 복구

### 목표
- 새 bounded alert cron에서 GlobeNewswire fetch가 실패했다. 운영 `/api/admin/debug-suite?checks=rss`에서 `GLOBENEWSWIRE` snapshot URL이 RSS가 아닌 `https://rss.globenewswire.com/` homepage로 확인됐다.

### 반영
- `lib/globenewswire-rss.ts`: 알려진 GlobeNewswire 도메인 homepage root override를 거부하고 공식 Public Companies RSS endpoint로 자동 복구한다. 정상적인 명시 RSS endpoint override는 유지한다.
- `lib/globenewswire-rss.test.ts`: 세 homepage root URL의 fallback과 정상 RSS endpoint override 유지 회귀 테스트를 추가한다.
- `docs/operations/globenewswire-rss-recovery.md`: root override 자동 복구 정책과 배포 후 snapshot 확인을 기록한다.

### 검증
- `npm.cmd exec vitest run -- lib/globenewswire-rss.test.ts app/api/cron/market-rss/route.test.ts --reporter=dot`: 2개 파일, 8개 테스트 통과.
- `npm.cmd run deploy:verify`: 현재 코드 revision에서 통과. dependency audit 취약점 0, 프로덕션 빌드, standalone `/charts` 200 및 desktop/mobile Chrome hydration, API smoke, 전체 296개 테스트 파일(295 통과·1 skip; 1,433 통과·3 skip), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth(178 API routes), OCI cron 구조 검사.
- `npm.cmd run docs:check`: 통과.
- Windows worktree의 `node_modules` junction으로 standalone trace EPERM 경고가 있었으나 standalone runtime/browser/API smoke는 통과했다.
- 운영 API 관측(2026-10-24 12:58 UTC): 새 9e93b225 run은 7.8초에 완료하고 Discord 3건을 전송했다(`notified.sent=3`, `attempted=3`, webhook configured). GlobeNewswire는 source fetch 실패했고 latest snapshot URL이 `https://rss.globenewswire.com/`로 확인됐다. 별도 run 339548은 26.7초에 Discord 1건 전송했으나 GlobeNewswire 역시 fetch 실패였다.
- SEC/StockTitan의 제목만 provider 번역하고 본문·요약은 원문 그대로 유지한다. 검증 실패 제목은 번역 gate에서 발송을 보류한다.

### 다음 개선
- 전체 검증 및 OCI 재배포 후 GlobeNewswire snapshot URL이 공식 feed로 바뀌고 count>0인지, source별 Discord 전송이 발생하는지 확인한다.
- feed가 유효한 빈 결과를 반환하면 발송 기사가 없는 것으로 해석하고, fetch/XML 오류라면 source snapshot의 오류 사유를 운영 진단에 노출해 계속 감시한다.

### 개선 과제
개선 과제 ID: CI-2026-10-24-010
성과 판정: PARTIAL
근거: 운영 snapshot으로 오래된 홈페이지 override를 근본 원인으로 특정하고 자동 fallback을 추가했으며 현재 revision의 전체 deploy:verify가 통과했다. 재배포 후 GlobeNewswire 실제 수신은 미확인이다.

### 커밋·푸시·배포
- 미실행: 검증·push·배포 및 GlobeNewswire fetch/Discord 수신 확인 전.

## [2026-10-24] RSS 알림 cron에서 Bullish RSS 전체 재색인 분리

### 목표
- 제목 번역·Discord 발송을 3건으로 제한했는데도 운영 cron이 240초 이상 끝나지 않았다. 원인은 알림 이후 실행하는 Bullish RSS sync가 매분 전체 `market_rss_articles` 73,115행을 500행씩 keyset 순회하며 각 기사별 DB write를 수행하는 구조였다.

### 반영
- `app/api/cron/market-rss/route.ts`: bounded notification cron에서 full-table Bullish RSS 재색인을 제외하고 응답에는 분리 상태를 표시한다.
- `app/api/cron/market-rss/route.test.ts`: 알림 cron이 별도 Bullish mirror 전체 scan을 호출하지 않는지 검증한다.
- `deploy/oci/README.md`: bounded 알림과 Bullish mirror sync 분리 동작을 운영 설명에 기록한다.

### 검증
- `npm.cmd exec vitest run -- app/api/cron/market-rss/route.test.ts lib/market-rss-pipeline.test.ts --reporter=dot`: route 테스트 4개 통과.
- `npm.cmd run deploy:verify`: 현재 코드 revision에서 통과. dependency audit 취약점 0, 프로덕션 빌드, standalone `/charts` 200 및 desktop/mobile Chrome hydration, API smoke, 전체 295개 테스트 파일(294 통과·1 skip; 1,429 통과·3 skip), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth(178 API routes), OCI cron 구조 검사.
- `npm.cmd run docs:check`: 통과.
- Windows worktree의 `node_modules` junction으로 standalone trace EPERM 경고가 있었으나 standalone runtime/browser/API smoke는 통과했다.
- 운영 API 관측(2026-10-24 12:42 UTC): 3건 상한 cron도 241초 `RUNNING`이었고 두 출처 translation status가 12:39:55 이후 변하지 않았다. 코드 추적으로 cron 뒤의 무제한 `syncMarketRssBullishArticles()` 전체 행 순회를 확인했다.
- RSS 제목 입력만 provider 번역 요청에 넘기며 summary/content의 원문 보존·전송 gate는 유지한다.

### 다음 개선
- 전체 검증 후 `oci`로 배포하고 새 3건 cron이 180초 이내 완료되는지와 `notified.sent`, `backlogRemaining`을 확인한다.
- 별도 Bullish RSS mirror를 위한 무제한 순회는 요청성 실행에 적합하지 않다. 이후 독립적인 지속 cursor/background job을 설계해 누락 없이 재색인하고 이 endpoint를 계속 fresh하게 유지한다.

### 개선 과제
개선 과제 ID: CI-2026-10-24-006
성과 판정: PARTIAL
근거: 운영 duration 측정과 호출 경로 추적으로 alert cron 병목이 별도 Bullish 전체 재색인임을 찾고 알림 경로에서 분리했으며 전체 deploy:verify가 통과했다. 재배포 및 실제 Discord 수신은 미확인이다.

### 커밋·푸시·배포
- 미실행: 검증 통과 후 RSS 변경만 커밋·push하고 OCI 배포를 확인한다.

## [2026-10-24] RSS OCI cron 단위 재조정

### 목표
- 배포한 50건 제한 run이 268초 후에도 `RUNNING`으로 남았다. RSS 수집 timeout, 번역 provider retry, 티커별 KIS 시장 순차 조회 시간을 합하면 한 run 50건은 OCI 제한 안에 끝나지 않을 수 있다.

### 반영
- `app/api/cron/market-rss/route.ts`: 번역 및 Discord 발송 각각 최대 3건으로 제한한다. 원격 환경의 batch 크기 설정도 3을 초과하지 못하게 hard cap을 둔다.
- `app/api/cron/market-rss/route.test.ts`: 요청당 3건 처리 및 남은 backlog 표시를 회귀 검증한다.
- `deploy/oci/README.md`: timer 실행 단위를 3건으로 명시한다.

### 검증
- `npm.cmd exec vitest run -- app/api/cron/market-rss/route.test.ts lib/market-rss-pipeline.test.ts --reporter=dot`: route 테스트 4개 통과.
- `npm.cmd run deploy:verify`: 현재 코드 revision에서 통과. dependency audit 취약점 0, 프로덕션 빌드, standalone `/charts` 200 및 desktop/mobile Chrome hydration, API smoke, 전체 295개 테스트 파일(294 통과·1 skip; 1,429 통과·3 skip), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth(178 API routes), OCI cron 구조 검사.
- `npm.cmd run docs:check`: 통과.
- Windows worktree의 `node_modules` junction으로 standalone trace EPERM 경고가 있었으나 standalone runtime/browser/API smoke는 통과했다.
- 운영 API read-only 관측(2026-10-24 12:22 UTC): 새 버전의 첫 run이 268초 `RUNNING` 상태로 남았으며 Discord 전송 완료 summary를 확인하지 못했다. 이 측정으로 50건 cap이 충분하지 않음을 판단했다.
- 기존 코드와 변경안 모두 provider에 전달하는 값은 제목뿐이며 summary/content는 원문 그대로 보존한다.

### 다음 개선
- `deploy:verify` 통과 후 `oci` 배포 workflow를 확인하고, 새 3건 run의 duration·backlogRemaining·notified.sent를 운영 API에서 검증한다. 3건도 180초에 근접하면 번역과 Discord 발송 단계를 별도 timer 실행으로 분리한다.
- provider quota/오류, 검증 실패 기사, Discord 및 KIS 응답 지연은 backlog 완료 속도에 영향을 준다. 제목 번역이 검증되지 않은 기사는 발송하지 않는다.

### 개선 과제
개선 과제 ID: CI-2026-10-24-005
성과 판정: PARTIAL
근거: 50건 제한이 268초 `RUNNING`으로 남은 운영 측정에 따라 hard cap 3으로 더 낮췄고, 해당 revision의 전체 deploy:verify가 통과했다. 재배포 후 운영 3건 run과 Discord 실수신은 아직 미확인이다.

### 커밋·푸시·배포
- 미실행: 현재 revision의 전체 검증 후 별도 한국어 커밋으로 push하고 운영 결과를 확인한다.

## [2026-10-24] RSS 과거 대기분의 제한 시간 내 연속 처리

### 목표
- 배포 뒤 운영 확인에서 세 출처의 기존 대기 기사가 남아 있었고, cron 단일 실행이 10분 이상 `RUNNING`에 머물렀다. 기존 cron은 번역 및 전송 대상이 고갈될 때까지 요청 한 번 안에서 무한 배치 루프를 돌려 OCI의 180초 HTTP 제한과 충돌할 수 있었다.
- 최신 기사를 먼저 고르는 정렬은 새 기사가 계속 들어오는 동안 과거 backlog 처리를 지연시킬 수 있었다.

### 반영
- `app/api/cron/market-rss/route.ts`: 호출당 번역 최대 50건, Discord 최대 50건으로 제한하고 남은 backlog를 `backlogRemaining`에 표시해 다음 1분 timer가 이어가도록 변경한다.
- `lib/market-rss-pipeline.ts`: 번역·알림 후보를 생성시각 오름차순으로 처리해 오래된 대기분부터 drain한다. Discord 대상은 기존처럼 제목 번역 완료 또는 이미 한국어인 제목만 허용한다.
- `app/api/cron/market-rss/route.test.ts`: 단일 bounded batch 종료 및 backlog 표시 회귀 테스트 추가.
- `deploy/oci/README.md`: timer별 처리 단위와 제목 전용 번역 규칙을 운영 설명에 반영한다.

### 검증
- `npm.cmd exec vitest run -- app/api/cron/market-rss/route.test.ts lib/market-rss-pipeline.test.ts --reporter=dot`: route 테스트 4개 통과.
- `npm.cmd run deploy:verify`: 통과. dependency audit 취약점 0, 프로덕션 빌드, standalone `/charts` 200 및 desktop/mobile Chrome hydration, API smoke, 전체 295개 테스트 파일(294 통과·1 skip; 1,429 통과·3 skip), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth(178 API routes), OCI cron 구조 검사를 확인했다.
- `npm.cmd run docs:check`: 표준 개선 로그 섹션 보완 후 통과.
- Windows worktree의 `node_modules` junction으로 standalone trace EPERM 경고가 있었지만 standalone 실행과 브라우저/API smoke는 통과했다.
- 운영 API read-only 확인(2026-10-24 12:05 UTC): 30일 기사 행 73,115건 중 `PENDING` 61,771건, `SKIPPED` 9,742건, `TRANSLATED` 1,602건. 허용 출처 중 StockTitan과 SEC만 기사 행이 있었고 GlobeNewswire는 0건이었다. 이 상태 집계는 Discord `SENT` 증거가 아니므로 실제 발송으로 간주하지 않는다.
- 원문 기사 제목만 번역 provider에 전달하고 summary/content는 그대로 유지한다. 번역 성공 전 알림 gate를 통과하지 못하게 한다.

### 다음 개선
- cron 회귀 테스트는 요청당 한 번의 제한 배치만 수행하고 배치가 꽉 찼으면 `backlogRemaining=true`를 반환하는지 확인한다. 운영 감시는 분당 run duration, `backlogRemaining`, 출처별 translation status 및 `notified.sent`를 대조한다.
- 번역 공급자 오류·quota, 제목 품질 검증 실패, Discord 장애/제한, 원본 피드의 최대 제공 범위는 외부 의존성이다. 정책상 검증되지 않은 원문 제목은 발송하지 않으며 실패 항목은 재시도 상태로 남을 수 있다.

### 개선 과제
개선 과제 ID: CI-2026-10-24-004
성과 판정: IMPROVED
근거: 제한 시간 충돌과 오래된 backlog 기아 원인을 수정하고 bounded batch 회귀 테스트 및 전체 deploy:verify를 통과시켰다. OCI 재배포와 과거 backlog Discord 실수신은 아직 미확인이다.

### 커밋·푸시·배포
- 미실행: 전체 검증 후 RSS 변경만 커밋·push하고 OCI 배포/운영 전송을 확인한다.
## [2026-10-24] RSS 세 출처 제목만 한국어 번역한 뒤 전체 기사 Discord 알림

### 목표
GlobeNewswire, StockTitan, SEC RSS 기사를 필터링하지 않고 모두 처리하며, Discord 전송 전 제목만 한국어 번역 완료된 기사만 통과시킨다. 요약과 본문은 번역기에 전달하거나 번역하지 않고 원문 그대로 유지한다.

### 반영
- cron 수집 범위를 GLOBENEWSWIRE, STOCKTITAN, SEC_EDGAR로 고정하고, SEC Latest Filings URL에서 특정 제출 유형 필터를 제거했다.
- 기존 호재 분류·매핑·기사 나이 조건을 Discord 대상 선정에서 제거해 세 출처의 전체 기사가 번역 후 알림 대기열에 들어가도록 했다.
- 한국어 제목 또는 검증 완료된 한국어 번역 상태만 알림 게이트를 통과하게 했고, 번역·전송 batch를 계속 비워 전체 처리량 제한에 걸려 기사를 남기지 않게 했다.
- 프로바이더 호출이 원 제목에서 만든 보호 입력만 받는다는 회귀 검증을 추가하고, summary/content 및 translatedSummary/translatedContent가 원문 그대로 반환되는지 확인했다.
- 번역 제공자 실패로 최대 시도 횟수에 도달한 기사도 backoff 후 다시 시도하도록 했고, Discord 429 Retry-After 대응을 보강했다.
- 관리자 번역 미리보기, OCI timer·cron 검사, 운영 문서를 세 출처 및 제목 전용 번역 정책과 일치시켰다.

### 검증
- RSS 타깃 테스트: 7개 파일, 109개 테스트 통과.
- `npm.cmd run deploy:verify`: 최신 origin 기준 의존성 감사(취약점 0), 프로덕션 빌드, standalone `/charts` HTTP 200, desktop/mobile Chrome hydration, API smoke, 전체 테스트(295개 파일 중 294 통과·1 skip; 1,428 통과·3 skip), typecheck, 문서·migration(160), verify-scope, KIS boundary, Bearer auth(178 API routes), OCI cron 구조 검사까지 통과.
- 개선 과제 기록 항목을 보완하기 전 첫 docs:check는 실패했으며, 수정 뒤 전체 deploy:verify가 통과했다.
- Windows worktree의 `node_modules` junction 때문에 Next standalone trace에서 EPERM 경고가 있었으나 standalone server와 browser/API smoke는 모두 성공했다. 운영 배포는 OCI Linux workflow에서 독립 checkout/build한다.
- 이 시점에는 원격 push 및 운영 Discord 실제 수신 확인 전이다. workflow 성공 후 운영 cron 결과와 각 출처의 전송 기록을 확인한다.

### 근본 원인 및 재발 방지
이전 경로는 일부 소스/분류/연령 기준을 유지하고 StockTitan만 전체 전달했으며, 번역 결과 게이트와 retry 고갈 처리도 전체 기사 유입을 보장하지 못했다. 세 출처 고정 목록, 기사별 한국어 번역 게이트, 무필터 알림 대상, 제목 전용 provider 입력 테스트, retry 재선정 테스트 및 OCI cron 구조 게이트로 재발을 감지한다.

### 다음 개선
- RSS 공급자 응답 범위, 번역 제공자 가용성·할당량, 운영 Webhook 및 Discord 제한은 외부 의존성이다. 가능한 모든 기사를 알림 대상으로 삼되 외부 장애 중 전송 성공을 보장하기는 어렵다.
- 배포 뒤 운영에서 SEC·StockTitan·GlobeNewswire 각각의 번역 완료와 Discord 전송 성공 상태를 확인한다. 하나라도 미확인이라면 해당 출처의 수집·번역·전송 단계별 진단을 보강한다.

### 개선 과제
개선 과제 ID: CI-2026-10-24-003
성과 판정: IMPROVED
근거: 세 RSS 출처에 대해 제목만 번역하고 모든 기사를 Discord 알림 대상으로 삼도록 수집·번역 게이트·재시도·배치를 일치시켰으며, 제목 전용 입력 회귀 테스트와 전체 배포 검증으로 변경을 확인했다. 운영 배포 및 실제 Discord 수신은 아직 확인 전이다.

### 커밋·푸시·배포
- 미실행: 최신 `origin/oci` 기반 격리 worktree에서 이번 RSS 관련 파일만 커밋·push하여 OCI 자동 배포를 요청한다. 다른 checkout의 미커밋 변경은 포함하지 않는다.
## [2026-10-24] Azure Text Translation endpoint 경로 정규화

### 목표
Azure 포털의 Text Translation endpoint를 그대로 환경변수에 설정해도 앱이 `/translate` 경로를 중복으로 붙이지 않도록 보완한다.

### 반영
- `AZURE_TRANSLATOR_ENDPOINT`의 마지막 path segment가 이미 `/translate`이면 유지하고, base endpoint이면 `/translate`를 추가하도록 URL을 정규화했다.
- Azure 번역 클라이언트 회귀 테스트와 StockTitan 번역 운영 문서에 Key 1/Key 2, Text Translation endpoint, Document Translation endpoint의 구분을 기록했다.
- 관리자 RSS 미리보기의 bounded `diagnostics=true` 응답에 Azure endpoint의 secret-free host/path shape를 추가해 운영 endpoint가 base URL인지 `/translate` 완성 URL인지 확인할 수 있게 했다.

### 검증
- `npm.cmd exec vitest run -- lib/azure-translation-client.test.ts app/api/admin/market-rss-test/route.test.ts --reporter=dot`: Azure endpoint 회귀 테스트 및 관리자 진단 API 테스트 통과.
- `npm.cmd run docs:check`: 통과.
- 최종 `npm.cmd run deploy:verify`: 통과. dependency audit 0 취약점, production build, standalone `/charts` HTTP 200 및 desktop/mobile Chrome hydration, API smoke, 전체 292개 테스트 파일(1,426 passed·3 skipped), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth(175 routes), OCI cron 게이트 통과.
- Windows 격리 worktree의 임시 dependency junction으로 인해 standalone tracing 시 EPERM 경고가 있었으나 서버 기동, 브라우저 및 API smoke가 통과했다. OCI workflow는 Linux checkout에서 별도 빌드하므로 이 로컬 junction 경고는 운영 환경의 배포 오류로 간주하지 않는다.
- 배포 후 운영 관리자 미리보기 `GET /api/admin/market-rss-test?source=STOCKTITAN&translate=true&mode=PREVIEW&limit=1&diagnostics=true`를 인증해 1회 실호출했다. 응답은 HTTP 200, Azure endpoint host/path는 `api.cognitive.microsofttranslator.com` 및 `/`였고 query 값은 없었다. 따라서 운영 설정은 정상적인 글로벌 Text Translation base endpoint이며 `/translate` 중복은 없었다.
- 해당 요청에서 Azure 호출 1회, 실패 0회, 성공 처리 문자 73자로 기록됐고 Google fallback 호출은 0회였다. 다만 번역 후보에 원문 제목에 없는 숫자가 있어 품질 검증기가 `translation_numeric_hallucination`으로 후보를 거부하고 원문 제목을 유지했다. 이 검증은 번역기가 원문에 없는 가격·연도·비율을 만들어내는 것을 막는 안전장치이므로 이번 작업에서는 우회하지 않았다.
- 이 실호출로 현재 운영 Azure key/endpoint 조합이 최소 한 건에서 인증 및 API 호출에 성공함을 확인했지만, 기존 cron의 과거 3회 실패 원인은 당시 응답 상세가 없어서 소급 확정하지 못했다. 운영에서 실패가 재발하면 `diagnostics=true` preview 및 번역 진단 API의 timestamp/provider/status를 대조한다.
- Deploy OCI workflow `40056164962`는 commit `518db55c`에 대해 완료 및 성공했다. 배포 뒤 preview에서 실제 Azure 호출을 확인했다.

### 다음 개선
- `translation_numeric_hallucination`으로 반복 거부되는 실제 항목이 있으면 원문 숫자 토큰 보호·공급자 후보·요약 문맥을 비밀/개인정보 없이 개별 대조한다. 검증기는 숫자 환각 방지용이므로 실제 오탐을 재현하는 회귀 fixture 없이는 완화하지 않는다.
- 과거 cron의 3회 실패와 동일한 오류가 재발할 때 provider 응답 상태/오류코드가 누락되지 않는지 확인한다. 인증 성공 요청 한 건은 모든 시간대/요청의 안정성을 보장하지 않는다.

### 개선 과제
개선 과제 ID: CI-2026-10-24-002
성과 판정: PARTIAL
근거: 포털 Text Translation endpoint 경로 중복이라는 코드 결함을 예방하도록 보완했지만 운영 실호출 전이라 실제 장애 원인 확정은 남아 있다.

### 커밋·푸시·배포
- 미실행: 커밋·푸시·배포 전이다. 검증은 모두 통과했으며 최신 `origin/oci` 기준 격리 worktree에서 이번 관련 6개 파일만 커밋·push한다. 기존 checkout의 unrelated 사용자 변경은 포함하지 않는다.

## [2026-10-21] RSS 번역 무료량 공식 기준과 실제 앱 상한 문서 정합성

### 목표
- Azure F0와 Google Cloud Translation Basic 무료 제공량을 공급자 공식 가격·제한 문서와 재대조한다.
- 설계 문서의 앱별 제한 수치가 실제 상수와 일치하도록 해 운영자가 무료 범위를 잘못 이해하지 않게 한다.

### 반영
- 2026-10-21 공식 문서 확인: Azure Translator F0는 표준 번역/Custom Translator 학습 합산 월 2,000,000자 무료, 서비스 제한은 시간당 2,000,000자·요청당 50,000자다.
- Google Cloud Translation Basic의 첫 500,000자 무료 표기는 고정 무료 quota가 아니라 월 최대 $10 credit을 Basic/Advanced가 공유하는 구조다. NMT 기본 단가 기준으로 월 500,000자에 해당하며 잔액 이월이 없다.
- 확인 결과 실제 코드는 Google 월 300,000자·rolling 60분 100,000자였으나 설계 표와 아키텍처 문서에 시간당 상한이 300,000자로 잘못 기재되어 이를 100,000자로 수정했다. Azure 상한은 월/rolling 60분 각각 1,800,000자로 유지한다.
- 운영 환경 Azure key/endpoint/F0 설정 여부는 공개 health endpoint가 노출하지 않으며 현재 로컬 `.env.local`에는 Azure 설정이 없고 Google key만 존재한다. 운영 Azure 활성 여부는 비밀을 출력하지 않는 인증된 운영 진단 확인 전에는 미확인으로 둔다.

### 검증
- 공식 출처: Azure 가격표 https://azure.microsoft.com/en-us/pricing/details/translator/ ; Azure 서비스 한도 https://learn.microsoft.com/en-us/azure/ai-services/Translator/service-limits ; Google 가격표 https://cloud.google.com/products/translate/pricing .
- 코드 대조: `lib/translation-cache.ts`의 Azure/Google monthly/hourly 상수와 두 설계 문서의 제한값을 직접 비교했다.
- `npm.cmd run deploy:verify`: 통과. 전체 테스트 292개 파일(1,417 passed, 3 skipped), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth(175 routes), OCI cron, production build 및 standalone/Chrome desktop·mobile/API smoke가 모두 통과했다.

### 다음 개선
- 운영 인증 진단에서 Azure F0 configured 상태를 확인하고, 실제 Azure 설정이 없는 경우 사용자 Azure 리소스의 endpoint/key/F0 확인값을 받아 설정한 뒤 Azure 실호출과 Google fallback을 양쪽 모두 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-21-004
- 성과 판정: PARTIAL
- 근거: 공식 사용량/과금 모델과 앱 내부 상한 차이는 바로잡았다. Azure는 현재 로컬 설정이 없고 운영 구성은 공개 상태로 입증되지 않아 Azure 1순위 실호출은 미검증이다.

### 커밋·푸시·배포
- 대기: 검증 완료. 공식 상한 정정 문서와 이 작업 로그를 커밋·push한 뒤 Deploy OCI workflow를 통해 반영한다.

## [2026-10-21] 삭제된 미국 뉴스 관리자 API 테스트 정리 및 배포 검증

### 목표
삭제된 관리자 API를 계속 호출하는 수동 테스트 항목을 제거하고, 변경을 빌드·테스트·실행 검증 후 배포 가능한 상태로 만든다.

### 반영
- 근거: commit `764c7615`에서 `/api/admin/us-news-radar-test`, `/api/admin/us-news-ticker-test`, `/api/admin/us-news-radar-events`가 제거됐지만 관리자 UI 항목이 남아 있었다.
- `components/admin-api-tests.tsx`에서 stale 테스트 3개와 전용 처리 결과 렌더를 제거했다. 실제 사용자 뉴스 기능 route는 보존했다.
- `components/admin-api-tests.test.tsx`에 세 항목이 UI에 나타나지 않는 검사를 추가했다.
- `docs/operations/unused-feature-candidates-20261020.md`에 추가 조사 및 정리 근거를 적었다.
- Next build가 자동 변경한 `next-env.d.ts`는 기존 `.next-deploy-verify/types/routes.d.ts` 참조로 복구했고, `tsconfig.json`의 빌드 전 사용자 변경 한 줄은 보존했다.

### 검증
- 관리자 컴포넌트 Vitest: 1파일 5개 통과.
- `npx.cmd tsc --noEmit --incremental false`: 통과.
- `npm.cmd run build`: 통과.
- 로컬 실행: `/admin/api-tests` HTTP 200, 삭제한 라벨 미노출, 삭제된 admin route HTTP 404.
- 전체 `npm.cmd run deploy:verify`: dependency audit 0 취약점, production build 통과, standalone `/charts` 및 Chrome desktop/mobile, API smoke 통과, Vitest 290파일 1,412 통과·2 skip, 격리 타입검사 통과. 최초 전체 검증은 최신 로그 계약과 개선 과제 ID 중복으로 문서 게이트에서 실패했다. 항목을 최신-first 계약에 맞춰 보완하고 ID를 고유하게 변경했다.
- `/api/health` 로컬 degraded는 DB 부재에 의한 것이며 변경 기능의 검증과 무관하다.

### 다음 개선
- deploy verifier를 다시 실행해 모든 후속 게이트를 통과시킨 뒤 배포 결과와 commit SHA를 기록한다.

### 개선 과제
개선 과제 ID: CI-2026-10-21-003
성과 판정: IMPROVED
근거: 제거된 route 참조 3개와 결과 렌더를 없애고 회귀 테스트를 추가했다. 테스트·타입·빌드·실행 검증이 통과했다.

### 커밋·푸시·배포
- 미실행: verifier 전체 재실행과 배포 대기 중.

## [2026-10-21] RSS 번역 Azure F0 우선·Google 대체 및 무료 한도 보호

### 목표
- StockTitan RSS 제목 번역에 Azure Translator F0를 우선 사용하고, 설정되지 않았거나 실패하면 Google Cloud Translation으로 대체한다.
- provider별 월간·rolling 1시간 사용량을 실제 외부 요청 전에 예약해 무료 한도 초과 위험을 방지한다.

### 반영
- Azure F0 전용 설정을 확인한 경우에만 Azure 번역을 활성화하고, 월/시간 상한은 공식 quota보다 낮게 적용한다. Google Cloud Translation은 다음 공급자로 유지한다.
- provider별 quota ledger와 rolling-hour reservation을 추가하고 매 재시도마다 요청 전에 예약한다. PostgreSQL advisory transaction lock을 월간 및 시간당 예약 완료까지 유지해 동시 요청 간 시간당 사용량 예약 누락 경쟁조건을 방지한다.
- 번역 요청 입력은 기존 요구대로 RSS 제목만 사용한다. Google API key는 query parameter가 아닌 `x-goog-api-key` 요청 헤더로 전달한다.
- 관리자 설정/디버깅/health 응답과 운영 문서에 공급자별 구성·사용량 상태를 표시하되 자격증명 값은 노출하지 않는다.
- Azure 및 Google 양쪽 무료 quota는 동일 cloud 계정의 다른 시스템 사용량과 격리되지 않는다. Azure F0를 실제로 쓰려면 전용 리소스 및 `AZURE_TRANSLATOR_API_KEY`, `AZURE_TRANSLATOR_ENDPOINT`, `AZURE_TRANSLATOR_FREE_TIER_CONFIRMED=F0` 설정이 필요하다. 현재 로컬 환경은 Google 키만 확인되어 Azure 실호출은 검증하지 않았다.

### 검증
- `npm.cmd run typecheck`: 통과.
- `npx.cmd vitest run lib/translation-cache.test.ts lib/market-rss-translation-retry.test.ts lib/market-rss-translation-reason.test.ts lib/translate-market-rss-item.test.ts lib/azure-translation-client.test.ts lib/market-rss-translation-client.test.ts components/admin-stocktitan-rss.test.tsx`: 7개 파일, 135개 테스트 통과.
- `npm.cmd run deploy:verify`: 통과. Production build 성공(Windows에서 node_modules Junction standalone trace 경고는 있었으나 standalone 서버 실행 확인), `/charts` HTTP 200 및 Chrome desktop/mobile hydration, 정적 청크 11개, 주요 API smoke 통과. 전체 suite 292 파일(1,417 passed, 3 skipped), typecheck, docs/migration(최신 V159), verify-scope, KIS boundary, Bearer auth(175 routes), OCI cron 검증 모두 통과.
- 검증 중 Vitest가 불완전 설치물 `node_modules.install-partial`을 테스트로 인식하는 환경 문제를 발견해 해당 dependency-recovery 디렉터리를 테스트 탐색에서 제외했다. 실제 테스트 소스는 계속 전체 실행 대상으로 유지한다.

### 다음 개선
- 전용 Azure F0 리소스/키/endpoint를 운영 환경에 등록한 뒤 관리자 진단으로 설정 확인 및 실제 번역 요청 성공을 확인한다. 현재 미등록이므로 배포 뒤에도 Google이 유일한 활성 provider다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-21-001
- 성과 판정: PARTIAL
- 근거: provider fallback과 DB quota guard, 자동화 테스트는 구현했다. Azure live credential 미설정으로 운영 Azure 연결과 provider 간 실전 fallback은 아직 검증되지 않았다.

### 커밋·푸시·배포
- 완료: 기능 commit `765fd803`을 `https://github.com/pjtss/StockMan.git`의 `oci` 브랜치에 push했다. GitHub Actions [Deploy OCI #39556583937](https://github.com/pjtss/StockMan/actions/runs/39556583937)가 verify, package, upload, activation 전 단계를 success로 완료했고 운영 `/api/health`는 `status=ok`를 반환했다.
- 부분 완료: Azure F0 자격증명 미설정으로 운영 Azure 실호출은 활성화되지 않았다. 설정 전까지 Google Cloud Translation이 작동하며, Azure 설정 후 별도 실호출 검증이 남아 있다.

## [2026-10-21] $1 이하 후보 SEC 티커 매핑 오류 재대조

- **목적/범위**: 기존 후보표의 SEC 미매핑 68개를 SEC 공식 `company_tickers_exchange.json`과 다시 대조하고 DEI/GAAP/락업/float 상태를 명확히 기록했다.
- **확인 결과**: 68개 모두 SEC 목록에서 티커가 유일하게 검색되고 제출자명이 프로젝트 발행사명과 연결됐다. 자동매칭이 빠진 원인은 프로젝트 코드 `AMS`가 SEC `NYSE` 표기와 다르게 매핑된 점이다. 487개 전체 고유 CIK 식별, 거래소 코드 불일치 68개, 진짜 SEC 티커 미매핑 0개. 추가 CompanyConcept 조회 오류 0개.
- **갱신 수치**: DEI shares 415개, US-GAAP shares 388개, `EntityPublicFloat` USD 가치 298개. DEI/GAAP가 모두 존재하는 후보 중 230개가 불일치한다. `EntityPublicFloat`은 비계열 보유분 시장가치이며 유통주식 수가 아니다. 락업 계약 원문 및 float 주식 수는 아직 전 기업 수작업 검토 전이므로 모두 미검토로 둔다.
- **변경 파일**: `scratch/fetch-under1-sec-facts.mjs`, `scratch/render-under1-report.mjs`, `scratch/us-under1-sec-facts-20261021.json`, `docs/operations/us-common-stocks-under-1-20261020.md`, `.csv`, `docs/operations/us-common-stocks-under-1-sec-design.md`, `DEVELOPMENT_LOG.md`.
- **검증**: SEC 공식 티커 목록의 68개 티커가 각각 유일함을 확인하고, SEC facts fetch에서 오류 0, report generator 출력 요약에서 487 후보/487 CIK·행수 일치 여부를 확인했다. 제품 테스트·빌드·실행은 요청 범위가 문서 및 읽기 전용 조사라 수행하지 않았다. API는 GET-only였고 DB write/refresh는 없었다.
- **남은 위험/다음 개선**: SEC company_tickers_exchange는 현재 거래소 상장·증권 종류의 충분한 검증 자료가 아니다. 68개 거래소 표기 차이를 SEC filing으로 검증하고, DEI/GAAP 230개 차이를 최신 원문에서 대조해야 한다. 이후 후보별 lock-up 계약/waiver/resale 효력 및 명시된 float shares 수량을 SEC 원문에서 검토한다. 미검토는 0주/미공개로 해석하지 않는다.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] SEC 락업 표적 원문 검토와 후보표 반영

- **목적/범위**: 활성 목표에 남은 락업/유통주 항목을 개선하기 위해 후보 487개와 로컬 SEC offering/registration scan을 교차하고, 확인된 SEC 원문 조항을 재검증했다.
- **근본 데이터 구분**: SEC lock-up 약정은 이미 잠긴 주식의 숫자를 자동으로 제공하지 않는다. issuer의 신주 발행 제한과 임원·이사의 기존 주식 처분 제한은 다른 항목이다. `EntityPublicFloat`은 USD 시장가치이므로 float share count로 대체하지 않는다. 내부자 소유·resale registration·warrant 수량도 락업 수량으로 계산하지 않는다.
- **확인 사실**: LTRN의 2026-09-30 8-K는 registered direct offering 종결일을 2026-09-30으로 명시하고, 같은 날 424B5는 임원·이사 90일 처분제한(관례적 예외 포함)과 회사의 60일 신주 발행제한을 설명한다. 90일 약정 대상 주식 수는 해당 검토 공시에서 확인되지 않으며 회사의 신주 발행제한은 기존 주식 락업과 분리했다. LGO의 2026-09-29 424B5에서 issuer·임원·이사의 60일 조항을 찾았지만 종결일과 주수 미확인; 2026-10-08 RW는 등록신고서 철회만 확인하고 락업 종료 근거로 사용하지 않았다. TGE의 2026-05-13 POS AM에는 AMTD Lock-up Obligations 참조가 있으나 실제 제한조건/주수 검토 전 확정하지 않았다.
- **검토 범위 제한**: SEC 원문 전체 487개사가 아니라 로컬 offering/registration scan의 후보 언급을 표적 검토했다. 나머지 484개는 계약 부재가 아니라 계약 여부 미검토다. float shares 수는 회사별 공시 원문 검토 미완료다.
- **변경 파일**: `scratch/us-under1-sec-lockup-review-20261021.json`, `scratch/render-under1-report.mjs`, `docs/operations/us-common-stocks-under-1-20261020.md`, `.csv`, `docs/operations/us-common-stocks-under-1-sec-design.md`, `DEVELOPMENT_LOG.md`.
- **검증**: SEC 원문 HTTP 200 및 핵심 close date / 기간 문구 대조, report generator 재실행(487행), CSV BOM 및 488행(헤더 포함)을 확인했다. SEC 조회는 read-only GET; 제품 빌드/테스트 불필요한 문서·데이터 조사로 실행하지 않았다.
- **재발 감지/다음 개선**: 다음 갱신은 미검토 484개 및 TGE 원계약을 순차 심사하고, 문서별 filing date, lock-up 당사자, 증권 클래스, 정확한 수량, 시작·만료일, 예외·waiver, resale registration 발효를 구조화한다. float 수량은 filing에 명시된 숫자만 기입한다. 숫자 미기재와 검토 미완료 상태를 별도 필드로 유지한다.
- **남은 위험**: 표적 문서 검색은 SEC 공시에서 조항이 없다는 증명이 아니며, LGO 효력 시점과 LTRN 제한 대상 주식 수량도 미확정이다.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] 487개 후보 SEC 제출/원문 스캔 및 float 수량 추출

- **목적/범위**: 기존 표적검색에서 벗어나 487개 SEC CIK의 최근 12개월 제출이력 및 SEC 공시 원문을 읽기 전용으로 조회해 락업/float 수량 근거와 검색 범위를 넓혔다.
- **수집/검색**: SEC submissions API에서 487/487개 발행사 처리, 최근 12개월 filings 24,685건을 확보했고 SEC 요청 오류 0. 최신 연차보고서와 S-1/S-3/F-1/F-3/424B/POS AM 및 증권거래 관련 8-K/6-K primary document 4,725건을 SEC Archives에서 읽었다. 원문 조회 오류 0. lock-up 용어 포함 filing 1,208건/345개사, public-float/비계열 용어 포함 filing 1,548건/447개사. 이 수치는 문자열 검색 hit이며 확정 lock-up 건수가 아니다.
- **정량 결과**: 원문에서 기준일이 확인되는 `shares held by non-affiliates` 값을 65개사에서 추출했다. 이를 행별 SEC 비계열 보유주수로 표시하고 접수일·기준일·양식·직접 링크를 함께 제공한다. 이는 제한 없는 즉시 거래가능 주수와 동일하다고 보장되지 않는다. 나머지 422개는 선택 스캔에서 기준일이 분명한 수량을 찾지 못했으며 공시 부재 판정이 아니다.
- **락업 추가 확인**: 기존 LTRN/LGO/TGE 검토 외에도 검색 후보에서 SKYX(25,000,000주, 12개월 단계별 해제), IFBD(3,471,828주를 증권법/락업 합산 제한으로 보고하나 lock-up만의 수량 아님), RAIN(5,548,625주, 2년 약정 표시), GCDT 등 수치 후보를 발견했다. 다른 사례는 만료일·발효일·waiver·최신 주주상태 검증 전에 확정치로 옮기지 않는다. SKYX 이외의 현재 효력/집계는 개별 후속 원문 확인이 남았다.
- **변경 파일**: `scratch/audit-under1-sec-submissions.mjs`, `scratch/scan-under1-sec-filing-text.mjs`, `scratch/extract-under1-float-share-candidates.mjs`, `scratch/select-under1-float-share-facts.mjs`, 관련 SEC 조회 JSON 중간자료, 후보 보고서/CSV, SEC 설계안, `DEVELOPMENT_LOG.md`.
- **검증**: 487 CIK/24,685 filing의 completeness 및 4,725/4,725 원문 fetch 처리, HTTP 오류 0, 65개 float 추출 후보와 동일 as-of-date 내 충돌 0을 대조했다. 보고서 생성 및 CSV UTF-8 BOM/487행 확인은 후속 재생성 단계에서 수행한다. SEC 요청은 GET-only; 운영 DB write 없음. 제품 빌드/테스트는 문서/SEC 자료 조사 범위라 미실행.
- **재발 감지/다음 개선**: 선택공시 검색에서 누락될 수 있는 Exhibit standalone 문서, 이전 12개월 계약, 422개 float 미발견 및 345개 lock-up 검색 hit를 우선순위화해 개별 계약 당사자·수량·기간·waiver·후속 release를 확인한다. SEC 비계열 보유주수와 계약상 거래제한 수량을 서로 차감하거나 중복합산하지 않는다.
- **남은 위험**: 원문 스캔은 주요 filing 폼/선택문서 범위이며 각 accession의 모든 EX-10/EX-99 attachment를 전부 독립 검사한 것은 아니다. 검색 hit는 boilerplate와 과거 계약이 포함될 수 있고, hit 부재는 lock-up/float 부재를 입증하지 않는다.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] 락업 수량/잔여 트랜치 SEC 원문 검증 보강

- **목적/범위**: 최근 12개월 원문 검색에서 발견한 수치 후보를 대조하여 SEC filing에 명시된 lock-up 수량, 시작일, 해제 스케줄, 현재 잔량 검증수준을 구분했다.
- **확정/조건부 사실**: SKYX는 2026-10-13 merger closing에 25,000,000주를 발행, 12/15/18/21개월에 25%씩 해제하는 SEC 공시가 있어 2026-10-21 기준 25,000,000주가 제한기간 중이다. WCT는 2025-06-23 CEO에게 부여된 fully vested 5,000,000 Class A shares가 3년 lock-up이라고 2026-08-28 Form 424B4에 기재한다. AMSS는 2026-05-20 direct listing 기준 1,245,557주의 staged schedule에서 2026-10-21은 Day 141 후/Day 170 전이며, 남은 30% tranche의 integer share count는 공시가 따로 적지 않는다. RAIN은 2026-05-04 filing에서 5,548,625주가 2024-12-31자 2년 계약 대상이라 보고하지만 현재 waiver/release 잔량은 확인되지 않아 as-reported 수량으로 구분했다. GCDT 600,000주/183일 약정은 2026-01-14 IPO로부터 2026-07-16 만료다. LTRN/LGO는 조항은 있으나 계약 주수가 미공개 또는 현재 효력 불명; TGE는 원계약 참조만 확인.
- **자료 구분**: IFBD 3,471,828주는 SEC 원문상 증권법 또는 lock-up 제한을 합산한 값이라 순수 lock-up 수량으로 취급하지 않는다. RAIN의 2026-09-23 8-K는 새로 제안된 business combination의 장래 lock-up을 기술하며 closing 전이므로 현재 잔량 근거로 계산하지 않았다.
- **변경 파일**: `scratch/us-under1-sec-lockup-review-20261021.json`, `scratch/render-under1-report.mjs`, 후보 보고서/CSV, SEC 설계안, `DEVELOPMENT_LOG.md`.
- **검증**: SKYX closing date/25m schedule, WCT 5m/3-year grant, AMSS May20 listing / staged schedule, RAIN reported amount/dated agreement, GCDT IPO/183 days를 각 SEC 원문과 대조했다. SEC API read-only GET만 사용했다.
- **남은 위험/다음 개선**: WCT 및 RAIN의 계약 waiver/release 여부, AMSS released share integer allocation, 그리고 나머지 479개사의 filing/exhibit review는 완료되지 않았다. 보고서에서 `current`와 `as-reported`를 별도 표시하고 나머지를 미검토로 유지한다.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] 미국 보통주 $1 이하 문서 출력 검증

- **목적/범위**: 종가 후보 보고서와 SEC-only 설계 문서의 생성 결과를 검증하고 오래된 기준시점·검색범위 표현을 보정했다.
- **변경 파일**: `docs/operations/us-common-stocks-under-1-20261020.md`, `docs/operations/us-common-stocks-under-1-sec-design.md`, `DEVELOPMENT_LOG.md`.
- **검증**: Markdown 후보 전체 표와 CSV 모두 487개 데이터 행; CSV UTF-8 BOM 및 Markdown 한글 텍스트 확인. 대표 lock-up 상태는 SKYX/WCT active as disclosed, AMSS staged remainder quantity not stated, RAIN current remainder unconfirmed, GCDT cited clause expired로 확인했다. `git diff --check` 통과(기존 로그 파일의 LF→CRLF 경고만 출력). 제품 코드·DB 변경 없음; 빌드·테스트·실행은 요청되지 않아 하지 않았다.
- **남은 위험/다음 개선**: 487개 전체의 활성 상장·보통주 적격성 검증, 모든 SEC 계약 Exhibit의 lock-up 전수 검토, 422개 비계열 보유주수 미발견 행의 원문 추가 검색, 21개 OHLC 이상치의 split/기업행사 대조가 남아 있어 문서는 완전한 미국시장 전수 목록이나 전수 float/lock-up 검증으로 해석할 수 없다.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] HODO lock-up 후속 기업행사 검토 추가

- **목적/범위**: SEC 원문 scan hit에서 기존 8개 표적 대상 밖의 구체적 lock-up 후보를 추가 확인했다.
- **근거/결과**: HODO 2026-04-22 Form 10-K/A는 Artemis stock consideration 937,500주가 lock-up 대상이었고, 2025-12-31까지 312,500주가 해제됐으며 계약 개정으로 추가 234,375주가 해제됐다고 보고한다. 이후 2026-05-29 1대8 reverse split 및 2026-06-30 merger가 확인되므로 이 과거 수량을 2026-10-21 현재 lock-up 잔량으로 단정하지 않는다. 2026-08-14 10-Q, 2026-09-14 8-K/A 및 2026-09-18 S-3를 읽었으나 현 잔여 lock-up 주수를 SEC 자료에서 재구성하지 못해 `현재 효력/주수 미확인`으로 표기했다.
- **변경 파일**: `scratch/us-under1-sec-lockup-review-20261021.json`, 해당 후보 보고서/CSV, SEC 설계안, `DEVELOPMENT_LOG.md`.
- **검증**: SEC Archives 원문 4건에 read-only GET으로 접근해 lock-up 해제 사실, 후속 split/merger, 현 주수 미확인 경계를 대조했다. 제품 코드/DB 변경 없음. 빌드·테스트 미실행.
- **남은 위험/다음 개선**: HODO merger 후 Artemis/EVEMeta 대상 제한의 주식 교환·계약 승계는 Exhibit 및 SEC ownership/resale filing에서 추가 대조가 필요하다. 전체 487개 중 478개 lock-up 검토는 미완료다.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] IVDA 180일 SEC lock-up 조항 상태 반영

- **목적/범위**: 숫자/기간이 SEC 원문에 잡힌 추가 후보 IVDA의 lock-up 적용 대상, 기간, 수량 공개 여부를 확인했다.
- **근거/결과**: 2026-02-11 Form 424B4는 회사·이사·임원·5% 이상 주주의 보통주 처분을 prospectus date부터 180일 제한한다고 기재하고 Placement Agent의 조기 면제/해제 권한도 명시한다. 해당 기간은 2026-08-10 종료된다. 대상별 수량은 공시에서 확인되지 않으므로 숫자를 추정하지 않고, 이 조항의 만료를 다른 계약의 부재로 확대하지 않았다.
- **변경 파일**: `scratch/us-under1-sec-lockup-review-20261021.json`, `scratch/render-under1-report.mjs`, 후보 보고서/CSV, SEC 설계안, `DEVELOPMENT_LOG.md`.
- **검증**: SEC 원문 read-only GET에서 180일, covered persons, waiver 권한, post-offering shares 구절을 확인하고 renderer를 재실행했다. 기존 후보 행수 487 유지 확인. 제품 코드/DB 변경 없음; 빌드·테스트 미실행.
- **남은 위험/다음 개선**: IVDA의 개별 대상자별 제한 주수 및 다른 lock-up 계약 여부는 미확인이다. 나머지 477개사 lock-up 전수 검토와 422개 float 미발견사 확인은 계속 필요하다.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] GCL 12개월 Sponsor lock-up 만료 검증 추가

- **목적/범위**: 2026년 resale prospectus의 GCL 83,456,793주 Sponsor/Epicsoft 보유 lock-up 후보에 대해 종결일과 만료일을 후속 SEC 공시로 확인했다.
- **근거/결과**: 2026-05-18 Form 424B3는 Sponsor/Epicsoft의 합산 실질보유 83,456,793주가 business combination closing 후 12개월 제한 만료 뒤 재매각 가능하다고 적는다. 2026-07-31 Form 20-F의 사업결합 종결일은 2025-02-13이므로 해당 12개월 조항 만료일은 2026-02-13이다. 83,456,793주는 prospectus 기준 보유량으로, 현재 잠김 주수로 표시하지 않았다.
- **변경 파일**: `scratch/us-under1-sec-lockup-review-20261021.json`, `scratch/render-under1-report.mjs`, 후보 보고서/CSV, SEC 설계안, `DEVELOPMENT_LOG.md`.
- **검증**: 두 SEC 원문 read-only GET에서 수량/lock-up 조건과 closing date를 각각 대조했다. renderer 재실행 결과 후보 487개, SEC CIK 487개, DEI facts 415개, GAAP facts 388개, public-float values 298개, SEC 요청 오류 0개. 문서·CSV 행수 기존 487개 유지, `git diff --check` 통과. 빌드·테스트 없음.
- **남은 위험/다음 개선**: 83,456,793주의 이후 소유량 변화 및 다른 제한 계약은 별도 확인이 필요하다. 남은 476개 후보의 lock-up, 422개 float 수량 미발견 상태, SEC 상장/보통주 적격성 원문검토는 미완료다.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] MLSS 임원 보유주식 lock-up 후속 공시 대조

- **목적/범위**: 2026-06-25 SEC Form 8-K의 Osser 부부 lock-up 약정과 2026-08-13 10-Q의 beneficial ownership을 대조해 현재 제한 수량의 공시 여부를 판정했다.
- **근거/결과**: 8-K는 Osser 및 배우자 주식의 transfer restriction이 2027-04-20까지라고 하며, restrictive legend가 이미 제거된 363,339주는 제외한다고 명시한다. 10-Q는 2026-06-30 현재 Osser beneficial ownership 2,844,028주를 보고한다. 회사는 이 보유량을 전부 잠김으로 명시하지 않고 배우자 보유량/면제 수량과의 정확한 잔액 대사를 제공하지 않아, 2,844,028 또는 차감치로 현재 lock-up 주수를 만들지 않았다.
- **변경 파일**: `scratch/us-under1-sec-lockup-review-20261021.json`, `scratch/render-under1-report.mjs`, 후보 보고서/CSV, SEC 설계안, `DEVELOPMENT_LOG.md`.
- **검증**: 8-K와 10-Q primary document를 SEC Archives read-only GET으로 확인하고 renderer 재실행. 후보 487개, Markdown 표와 CSV 각각 487행, `git diff --check` 통과. 제품 코드·DB 변경 없음.
- **남은 위험/다음 개선**: Form 4/13D 등으로 Osser/배우자 지분 변동과 제한계약의 실제 대상 수량을 맞추는 검토가 남아 있다. 나머지 475개 후보도 lock-up 전수 검토 미완료다.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] 미국 보통주 $1 이하 종가 후보와 SEC 사실 필드 첫 스냅샷

- **목적/범위**: 사용자가 가격·최근 30일 고저가에 한해 quote source를 허용하고, 기업 사실은 SEC-only로 유지하도록 범위를 확정했다. 프로젝트 활성 USD `COMMON_STOCK` 5,444개를 읽기 전용으로 조회해 2026-10-20 종가 기준 $1 이하 후보와 SEC XBRL facts를 문서/CSV로 기록했다.
- **변경 파일**: `docs/operations/us-common-stocks-under-1-20261020.md`, `.csv`, `docs/operations/us-common-stocks-under-1-sec-design.md`, `DEVELOPMENT_LOG.md`. `scratch/`에는 SEC facts 및 API 추출/렌더링 중간 자료를 생성했다. 제품 코드와 DB는 변경하지 않았다.
- **가격 스캔**: 저장된 project common universe 5,444개(마스터 `last_seen_at` 2026-09-25)를 기준으로 운영 read-only GET `instrument-fundamentals` 및 `daily-candles`를 사용했다. 2026-10-20 종가 ≤ USD 1 후보 487개. 2026-09-21~10-20 30 calendar day OHLC의 최소 거래봉 수 조건(18개) 487/487 통과, 30일 데이터 요청 오류 0.
- **SEC 사실**: SEC 공식 ticker/exchange mapping 419개 매칭, 68개 미매칭. SEC CompanyConcept DEI 발행주식수 352개, US-GAAP 336개, DEI `EntityPublicFloat` USD 금액 250개를 concept별로 기록했다. DEI와 GAAP 수량이 다른 후보 204개. SEC HTTP 오류 0. Public float 금액은 총 시가총액으로 오인하지 않도록 분리했다.
- **명시한 미확인 범위**: SEC가 직접 공시한 현재 총 시가총액은 확인되지 않아 전 행에 확인 불가로 기록했다. lock-up 계약/float 수량은 기업별 원문 수작업 검토 전이므로 미검토로 두었고 0주나 미공개로 단정하지 않았다. 21개는 30일 고가/종가 비율이 10배 이상으로 split/기업행사 원문 대조가 필요하다. 마스터가 9/25 기준이어서 최신 신규 상장·활성 상태 완전성은 미확인이다.
- **검증**: API 후보 수와 CSV 행수 일치(487행+header), 30일 봉 개수, SEC CIK 매칭·fact 커버리지 및 report/CSV 출력 요약을 대조했다. SEC API 호출은 프로젝트 `SEC_USER_AGENT`를 사용한 read-only GET, 가격 API는 인증 read-only GET으로 한정했다. 테스트/빌드 실행 없음(문서·데이터 산출 작업).
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] Google 우선·Azure F0 RSS 번역 fallback 및 무료 한도 보호 설계

### 목표
- 개선 과제 ID: CI-2026-10-21-002
- Google Cloud Translation을 1순위로 유지하고 Azure AI Translator 무료 F0를 fallback 후보로 쓰며, 앱이 무료 할당량을 넘는 번역 호출을 차단하는 구조를 설계한다.
- 요청 범위는 설계 문서화다. 제품 코드, DB schema, 환경변수, 클라우드 자원은 변경하지 않는다.

### 반영
- `docs/rss-translation-design.md`를 공식 문서 기반으로 확장했다: 현 구현 기준선, Google/Azure 요금·쿼터를 고려한 낮은 앱 cap, provider 우선순위/fallback, 원자적 DB 예산 원장, rolling-hour 보호, 관리자 관측, 보안, 단계별 구현·검증 게이트를 기록했다.
- 현 코드에서 Google 월 앱 cap 300,000자와 provider별 단일 원장 구조를 확인했다. Azure 도입 시 공급자별 원장 키로 분리하고 기존 사용량은 Google에 귀속하는 migration이 필요하다.
- 코드가 제목 외에 요약 문맥을 요청 payload에 포함하는 반면 기존 설계는 제목만이라고 서술하는 입력 범위 불일치를 발견했다. 구현 시 요약을 provider에 전송하지 않도록 수정하거나 실제 payload 전체를 쿼터 계산에 넣어야 한다고 명시했다.
- Google REST API 키의 query-string 전달 대신 공식 권고 header 사용을 설계에 포함했다.

### 검증
- 프로젝트 구현 `lib/cloud-translation-client.ts`, `lib/translate-market-rss-item.ts`, `lib/quota-aware-translation-client.ts`, `lib/translation-cache.ts`, `db/migration/V102__stocktitan_translation_cache.sql`과 기존 RSS 번역 설계를 대조했다.
- Google 공식 요금/쿼터와 API-key 보안 문서, Microsoft 공식 F0 요금·서비스 한도·REST/API 인증 문서를 확인했다. 확인 시점은 2026-10-21이며 공급자 정책은 배포 전 재확인이 필요하다.
- 문서 변경만 수행했으며 API 실호출·제품 테스트·빌드는 실행하지 않았다. Git 작업 트리에 기존 사용자 변경사항이 다수 있어 수정/정리하지 않았다. 문서 자동 검사 `npm.cmd run docs:check`는 첫 실행에서 task ID/outcome 형식 규약 실패를 감지했다. 필드 형식을 checker가 요구하는 형태로 수정한 뒤 재실행한다.
- 성과 판정: UNMEASURED — 설계 완성; 동작 구현·사용량 실측 전.
- **근거:** 현행 앱 한도 300,000자/월, Google 공식 월 첫 500,000자 크레딧, Azure F0 월 2,000,000자 및 시간당 제한을 문서에 대조 기록했다.

### 다음 개선
- Azure F0 리소스 생성·tier 확인 및 비밀 변수 준비 후 provider별 원자 예약 migration, 호출 orchestrator, mock 기반 quota/fallback 테스트를 구현한다.
- 제목 전용 전송 범위 불일치를 먼저 회귀 테스트로 고정한 뒤 전체 `npm.cmd run deploy:verify` 및 실제 runtime smoke를 성공시키고 배포한다.

### 개선 과제
- Google Cloud/API 소비를 다른 시스템과 공유할 경우 앱 자체 원장만으로 프로젝트 전체 무료 잔여량을 완전 보증할 수 없으므로 전용 리소스와 콘솔 대조가 필요하다.
- Azure 무료 tier 여부는 API key만으로 확인할 수 없으며, F0 미확인·원장 불가 시 자동 호출하지 않는 fail-closed 구현이 필요하다.

### 커밋·푸시·배포
- 미실행 — 요청이 설계 단계이며 제품 코드/실행 artifact 변경 없음. 설계 문서만으로 배포할 수 없고 실제 provider 구현 및 배포 검증은 다음 단계다.

## [2026-10-21] 기존 RVOL·시총 후보 중 국내 익일 단타 관찰 후보 추출

- **목적/범위**: 직전 추출한 국내 RVOL≥2 후보 83개에서 다음 거래일 단타 관찰 후보를 프로젝트의 공식 일봉 단타 신호 기준으로 선별했다.
- **판정**: 완료 일봉 기준 종가>EMA9>EMA20, 양봉, 최신 거래량/직전 20봉 평균≥1, 최근 3봉 OBV·ADL 기울기 상승을 모두 요구했다. 마지막 공통 거래일은 2026-10-20이며 2026-10-21 완성봉은 로컬 DB에 없었다.
- **결과**: 전체 조건 통과 11개: 300080, 065450, 148930, 176750, 011330, 078520, 134380, 012280, 373200, 142280, 016090. RVOL 내림차순 결과를 별도 보고서에 기록했다. 이는 다음 거래일 시가 확인 전 관찰 후보이며 수익을 보장하지 않는다.
- **남은 데이터 한계**: 직전 5,000억 이하 필터에 사용한 운영 시총 스냅샷이 2026-08-28 기준이다. 따라서 선별 결과의 현재 시총 조건은 확인되지 않았다. 2026-10-21 완료 일봉도 부재해 내일 판단에는 하루 지연이 있을 수 있다.
- **변경 파일**: `docs/operations/kr-daytrade-watchlist-20261020.md`, `DEVELOPMENT_LOG.md`.
- **검증**: 로컬 DB에서 기존 후보 83개의 공식 활성 보통주 상태와 최근 140개 일봉을 읽어 프로젝트 `evaluateDayTradeSignal` 계약과 동일한 계산을 적용했다. 통과 11개 전부 기준일 20261020, 실패 조건이 없는지 여섯 신호 조건을 확인했다. 테스트는 실행하지 않았고 DB는 읽기 전용으로 사용했다.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] 국내 최신 거래일 RVOL 2 이상·시총 5,000억 이하 후보 추출

- **목적/범위**: 국내 활성 공식 보통주 중 최신 거래일 RVOL 2 이상 및 시총 5,000억 원 이하 후보를 로컬 일봉·기본정보 스냅샷으로 추출했다.
- **기준**: 최신 거래일 거래량 ÷ 직전 20개 양(+) 거래량 일봉의 평균. 2026-10-20 거래일만 포함하고, 공식 `COMMON_STOCK`·거래정지·청산·관리 종목 필터를 적용했다. 프로젝트 기본 정책에 따라 시총 300억 원 이하는 제외하고, 5,000억 원 상한은 포함했다.
- **결과 및 데이터 한계**: RVOL 조건을 충족한 후보 83개. 시총 스냅샷 `observed_at`은 운영 API 확인 결과 2026-08-28로 최신 거래일보다 오래됐다. 따라서 결과 파일은 이를 명시하며, 시총 상한 조건은 해당 스냅샷 기준 후보이지 2026-10-20 현재 시총 검증 결과가 아니다. 현재 시총 기준 완전성을 확인하려면 최신 KIS 시총 갱신이 필요하다.
- **변경 파일**: `docs/operations/kr-rvol-2-marketcap-5000b-20261020.md`, `DEVELOPMENT_LOG.md`.
- **검증**: 로컬 DB의 KOSPI·KOSDAQ 양 시장 최신 양(+) 거래량 일봉이 20261020인지 확인하고, 공식 eligibility 및 거래량 이력 20개 충족으로 직접 SQL 산출했다. 총 83건을 보고서에 기록했다. 별도 테스트는 실행하지 않았다.
- **커밋·푸시·배포**: 수행하지 않음. DB를 변경하지 않았다.

## [2026-10-21] 운영 국내 보통주 시총 1조 원 이하 일봉 로컬 DB 갱신

- **목적/범위**: 운영 서버의 국내 활성 `COMMON_STOCK` 중 운영 기본정보 API가 확인한 시가총액 1조 원 이하(상한 포함) 종목의 일봉 최대 120개를 로컬 PostgreSQL에 동기화했다. 시총/분류 미확인 종목은 fail-closed로 제외했다.
- **확인 대상**: `scripts/sync-daily-cache-async.mjs`, `.env.local`의 운영 API 및 localhost DB 설정(자격증명은 출력하지 않음), 국내 유니버스·기본정보·일봉 원본/요약 테이블.
- **실행 결과**: 활성 국내 `COMMON_STOCK` 2,307개에서 운영 기본정보 API 확인 후 2,002개를 대상으로 선정하고, 305개는 시총 응답 부재/상한 초과 등으로 제외했다. KOSDAQ 1,476개와 KOSPI 526개에서 401배치, 운영 HTTP 2,428회로 78,078개 일봉을 UPSERT했다. fetch/save 동시성은 각각 1로 제한했다. 배치 실패 0, fallback 실패 0, DB 저장 검증 불일치 0이다. 대상 2,002개 모두 원본 일봉 최신 날짜가 2026-10-20임을 로컬 DB에서 확인했다. 최신 요약 테이블은 거래량 0인 봉을 제외하는 기존 정의 때문에 9개 종목에서 이전 날짜를 가리켰지만, 원본 테이블에는 해당 2026-10-20 봉이 저장되어 있으며 원본-요약 OHLCV 불일치는 0이다.
- **실행 경로 및 이슈**: 단일 종목 사전 점검의 첫 저장은 로컬 `instrument_fundamental_snapshots`에 스크립트가 참조하는 `listed_shares` 컬럼이 없어 트랜잭션 rollback됐다(캔들 변경 없음). 재시도와 전체 갱신은 스크립트 지원 옵션 `--skip-fundamentals=true`를 사용해 기본정보 스냅샷 전체 갱신을 생략하고 캔들 적재를 완료했다. 캡 필터에 필요한 운영 시총 조회는 유지됐다.
- **변경 파일**: `DEVELOPMENT_LOG.md` 작업 기록만 추가. 제품 코드 변경 없음.
- **검증**: 단일 종목 동일 경로 사전 검증 성공(39봉 저장). 전체 결과 `ok=true`, 78,078 수신/저장. 사후 DB 집계에서 KOSDAQ 1,476/1,476, KOSPI 526/526 대상 모두 원본 최신 거래일 `20261020`; 원본과 최신 요약 OHLCV mismatch 0.
- **커밋·푸시·배포**: 수행하지 않음. 운영 서버는 GET 원천으로만 사용했고 로컬 DB만 갱신했다.

## [2026-10-21] StockTitan 최근 3시간 호재 및 시총 재조회

- **목적/범위**: StockTitan 원본 RSS 최근 3시간 항목을 Codex가 직접 검토하고, 근거 있는 호재 티커들의 최신 시가총액을 조회했다.
- **확인 대상**: `https://www.stocktitan.net/rss` 및 활성 `COMMON_STOCK` 종목 마스터; COSM·SAFX KIS 해외주식 현재가상세 (`HHDFS76200200`) 강제 조회.
- **결과**: RSS 46개 항목(기준 2026-10-21 02:42 KST) 검토. COSM 9개월 잠정 매출 $54.3M(+19%), 2026년 매출 $90M 초과 전망 재확인; SAFX Paramount 시설 인수 계약(종결 전) 및 재가동 ~$30M 투자 계획을 선별. KIS HTTP 200/`rt_cd=0`, COSM 시총 $34,567,779, SAFX $84,679,038. SAFX 1.7B주 발행한도 및 향후 희석 위험을 SEC 근거로 함께 보고.
- **변경 파일**: `DEVELOPMENT_LOG.md` 조사 기록만 추가; 제품 코드 및 운영 데이터 수정 없음.
- **검증**: 프로젝트 RSS adapter 원본 GET, 활성 보통주 마스터의 read-only 확인, 프로젝트 KIS price-detail 모듈에서 캐시를 우회한 read-only 강제 시세 조회. SEC EDGAR 공시에서 SAFX 주식 승인·발행주식 수 대조.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-20] V157 이후 운영 필수 RSS 컬럼 forward migration 복구

### 목표
- 배포 후 운영 `/api/health`가 503/degraded를 반환한 원인을 운영 Flyway 이력과 실제 컬럼 상태로 확인하고 readiness를 복구한다.
- 시총 backoff 재시도 예약 실행의 실제 provider 호출과 종목별 시도시각 기록을 검증한다.

### 반영
- 근본 원인: 운영은 Flyway V157까지 성공했지만 번역 readiness 컬럼은 V137/V140에만 존재했다. OCI migration runner는 최신 이력보다 낮은 out-of-order migration을 `*:ignored`로 건너뛰므로, 늦게 추가된 이전 버전 파일은 기존 운영 DB를 보정하지 못했다.
- V158 `restore_required_rss_translation_columns` migration을 추가해 두 컬럼을 `ADD COLUMN IF NOT EXISTS`로 전진 재보장하고 기존 실패/월간 제한 행의 시도시각을 backfill한다.
- `FORWARD_REQUIRED_OPERATIONAL_COLUMNS` 및 `scripts/check-docs.mjs`의 migration floor V157 검사를 추가했다. 단순히 과거 migration 파일에 컬럼 선언이 존재하는 것만으로 readiness가 통과하지 않도록 한다.
- 배포 체크리스트/runbook에 운영 floor 이후 forward migration 규칙을 연결하고, fundamentals 운영 기록에 실제 35건 재시도 결과와 남은 KIS 빈 필드 위험을 기록했다.

### 검증
- `npx.cmd vitest run scripts/operational-schema-migration-audit.test.ts --reporter=verbose`: 8 tests passed. 구버전 V137/V140만 있는 회귀 fixture는 실패하고 V158 forward fixture는 통과한다.
- `npm.cmd run docs:check`: 158개 migration, V158 최신, 운영 관계 및 forward 필수 컬럼 검사 통과.
- 운영 Cron API: 배포 전 V157 운영 DB에서 RSS translation 필수 컬럼 2개 누락과 `/api/health` degraded를 확인했다. 배포 후 Flyway V158, `schemaReady=true`, `missingOperationalColumns=[]`, `missingOperationalTables=[]`, `/api/health=200`, `/` 및 `/charts` HTTP 200을 확인했다.
- 운영 fundamentals 재시도: 10:10 UTC에 35개 호출(성공 0, 실패 35), 11:15 UTC에 legacy 재시도 111개 호출(성공 1, 실패 110)했다. 두 번째 실행은 29.9초였고 1건 저장, 101건 `KIS_PRICE_INVALID`, 9건 `KIS_MARKET_CAP_MISSING_OR_INVALID`로 종료했다. 실패는 KIS HTTP 200/`rt_cd=0`이어도 가격 또는 시총 필드가 비어있는 응답이 주원인이다. 전체 실패는 145건이고, 직전 시도 35건은 다음날 재시도 시각으로 연기됐다. 실제 실행 이력과 `last_attempt_at` 기록을 대조했다.
- 최종 통합 트리에서 `npm.cmd run deploy:verify` 통과: 의존성 audit 취약점 0건, production build, standalone HTTP/Chrome desktop·mobile 및 API smoke, Vitest 293개 파일(1,430 passed, 3 skipped), typecheck, docs/migration·KIS boundary·Bearer auth·OCI cron 검사를 통과했다.

### 다음 개선
- KIS 가격·시총 필드 누락의 공식 API 응답 원인을 별도 확인한다. 유효하지 않은 응답을 성공으로 저장하거나 기존 캐시로 덮지 않는다. 현재 145 실패 및 다음 재시도 연기는 모니터링한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-20-006
- 성과 판정: PARTIAL
- 근거: 운영 스키마 복구와 readiness 확인은 완료했다. 예약 재시도도 실행됐고 legacy 대상 111개 중 1개를 저장했으나, 110개는 KIS 빈 가격·시총 응답으로 실패해 데이터 공급 문제는 미해결이다.

### 커밋·푸시·배포
- 완료: V158 코드 commit `a5604d56`을 포함한 통합 commit `459f74a5` push, `npm.cmd run deploy:verify`, workflow `39410821362` 및 OCI activation 성공을 확인했다. 운영 readiness와 `/api/health`, `/`, `/charts`가 정상이다. Retry run `322895`의 결과는 위 검증 항목에 기록했다.

## [2026-10-20] 미사용 기능 조사 결과와 배포 검증 재개

### 목표
- 기존 미사용 기능 조사 및 사용자가 요청한 완료 작업 배포를 이어서 진행하고 현재 검증 차단 원인을 확인한다.

### 반영
- `scripts/refresh-all-instrument-fundamentals.ts`에서 backoff로 정상 건너뛴 결과에 사후 검증을 실행하지 않도록 하고, 실제 완료 결과에 `startedAt`이 없으면 명시 오류를 내도록 보강했다. 삭제된 IPO 어댑터에 대한 잔여 KIS boundary audit 테스트 매핑도 제거했다.
- `lib/kis-token.test.ts`의 HTTP 실패 응답 mock에 실제 Fetch `Response` 형태에 필요한 `headers`를 추가했다. 테스트 실패는 응답 mock의 `headers` 누락으로 발생한 `TypeError`였으며 제품 응답 처리 오류가 아니었다.
- 미사용 기능 후보 및 DB scheduler 이력은 `docs/operations/unused-feature-candidates-20261020.md`에 기록했다. 후속 함수 단위 재조사에서 5개 후보의 현재 앱·운영 참조가 없음을 재확인하고, 세 localStorage 키(`rss_custom_keywords`, `rss_stock_alerts`, `market_sentiment_history`)의 read/write 참조가 writer 파일 외에 없음을 확인해 과거 브라우저 저장값의 orphan 가능성과 미확인 범위를 보고서에 추가했다.

### 검증
- `npm.cmd run deploy:verify`: 최신 실행 전체 통과. 의존성 audit 0건, production build, standalone·Chrome desktop/mobile·API smoke, Vitest 293개 파일(1,412 passed, 2 skipped), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth(175 API routes), OCI cron(22 shared endpoints + fundamentals timer).
- `npx.cmd vitest run lib/kis-token.test.ts -t 'backs off token issuance' --reporter=verbose` 통과.
- 운영 DB read-only 이력에서 V148·V149는 원격과 같은 설명으로 이미 적용되어 있었고 DB에는 SEC shares 1,057행, review 1,311행 및 enabled 설정이 남아 있었다. 파괴적 V149 부분을 제거하고 KIS shares 전환을 V157로 옮겨 기존 데이터와 기능 설정을 보존했다. 원격 `origin/oci`는 공통 기준보다 6커밋 앞서고 로컬은 2커밋 앞서 있다.
- 로컬 변경을 원격 `oci` 6커밋과 통합해 `7ea1f960`을 생성했다. push 직전 `npm.cmd run deploy:verify` 전체 게이트를 재통과한 뒤 원격 반영 및 운영 배포를 완료했다.

### 다음 개선
- 배포 완료: `7ea1f960`을 `oci`에 push하고 Deploy OCI workflow `39405249354` success를 확인했다. activation 성공 후 `/health-check`, `/`, `/charts` HTTP 200 응답을 확인했다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-20-005
- 성과 판정: PARTIAL
- 근거: V148/V149 중복 및 파괴적 SEC 삭제 migration을 정리했고 원격 6커밋과 RSS/Discord 정책을 통합했다. 통합 트리의 전체 build/test/runtime/audit를 통과하고 push·OCI activation 및 운영 HTTP smoke까지 완료했다.

### 커밋·푸시·배포
- 상태: 완료. `7ea1f960` 커밋 및 push, Deploy OCI workflow 성공, 운영 `/health-check`·`/`·`/charts` HTTP 200 확인.

## [2026-10-20] 미국 최근 저점·VWAP 후보에 RVOL ≥ 1 조건 추가

### 목표
- 기존 미국 보통주 시총 USD 1억 이하·최근 10개 일봉 저점 이후 반등·종가와 VWAP ±5% 후보 718개를 프로젝트 표준 RVOL ≥ 1 조건으로 재추출했다.

### 반영
- RVOL은 기준 거래일 거래량을 기준일을 제외한 직전 20개 이용 가능 일봉 평균 거래량으로 나눴다. 계산 정의는 `lib/daytrade-signal.ts`와 동일하다.
- 718개에 대해 KIS 해외주식 기간별 시세 API를 직접 GET했고, RVOL 계산에 사용한 최신 거래량이 기존 VWAP 원본의 최신 거래량과 일치하는 455개만 판정했다.
- RVOL ≥ 1 통과 87개(AMS 9, NAS 72, NYS 6), RVOL < 1 368개다. 나머지 263개는 HTTP 500 / EGW00201 응답으로 RVOL을 확인할 수 없어 fail-closed 처리하고 상세 JSON `notAssessed`에 기록했다.
- 기존 운영 RVOL 데이터는 같은 VWAP 후보와 최신 거래량이 일치하지 않아 혼합하지 않았다. 결과에 RVOL, 직전 20봉 평균 거래량·기준 구간·별도 조회시각을 포함했다.
- 결과 Markdown·CSV·JSON과 `docs/README.md` 항목을 갱신했다. 조회 스크립트와 응답은 `.codex/` 임시 작업자료에 두었다.

### 검증
- 455개 성공 응답은 모두 기준일 20261019와 직전 20개 봉을 포함했고, 최신 거래량이 VWAP 원본과 전부 일치했다.
- 최종 JSON 87개와 CSV 데이터 행 87개, 중복 0개를 확인했다. 출력 전체에 RVOL ≥ 1, USD 100,000,000 이하, VWAP 편차 ±5% 이내를 검사했다. `git diff --check` 통과.
- KIS 미응답 263개가 있으므로 결과는 해당 455개 판정 가능 범위에서의 통과 목록이며, 미응답 종목의 RVOL 상태는 미확인이다.

### 다음 개선
- KIS가 EGW00201을 반환한 263개를 재조회할 수 있을 때 RVOL 범위를 완결하고, 캔들별 최신성 및 시총 스냅샷 시차를 검토한다.

### 커밋·푸시·배포
- 미실행. 문서·CSV·JSON만 갱신했다.

## [2026-10-20] 미국 RVOL 후보에 최소 거래량 10만 주 조건 추가

### 목표
- 기존 RVOL ≥ 1 결과에 기준일 거래량 100,000주 이상을 추가 적용해 재추출했다.

### 반영
- 기준일 거래량이 100,000주 미만인 56개를 제외하고 31개를 유지했다(AMS 3, NAS 24, NYS 4).
- 기존 RVOL≥1 결과 CSV·JSON·Markdown을 새 최종 결과로 갱신했다. JSON에는 거래량 하한, 제외 건수, 시장별 수를 기록했다.

### 검증
- 31개 전체에서 기준일 거래량 ≥100,000주, RVOL ≥1, USD 100,000,000 이하 시총, VWAP 편차 ±5% 이내를 확인했다. 최소 거래량 102,959주다.
- 263개 KIS EGW00201 미응답은 앞선 판정과 동일하게 포함하지 않았다. CSV 31행과 JSON 31종목 일치를 확인한다.

### 커밋·푸시·배포
- 미실행. 결과 문서와 데이터만 갱신했다.

## [2026-10-20] 현재 미사용 기능 후보 조사

### 목표
- 요청된 미사용 기능 확인을 위해 로컬 후보 커밋 `680f2a2d`의 삭제 67개 경로와 현재 checkout의 정적 runtime 도달성·자동화 실행 기록을 함께 조사했다. remote-tracking ref `012833ad`는 로컬보다 5커밋 앞서고 로컬 전용 커밋은 2개다.

### 반영
- `docs/operations/unused-feature-candidates-20261020.md`에 이미 비활성 안내 UI/API, 정적 runtime 후보, 외부 소비 확인이 필요한 동작 API, 운영 cron 및 실제 실행 이력을 구분해 기록했다. `docs/README.md`에서 연결했다.
- AST import graph에서 955개 source 중 291개 entrypoint와 656개 도달 파일을 확인했다. `lib/keywords.ts`, `lib/stock-alerts.ts`, `lib/sentiment.ts`, `lib/sectors.ts`, `lib/market-rss-discord-message.ts`는 app·운영 script 진입점에서 도달하지 않는 정적 후보이며 삭제 확정은 하지 않았다. 누적매집 fixture는 테스트 지원 코드로 구분했다.
- `us-daily-indicators`는 registry와 route에 있으나 OCI cron 설정에서 호출되지 않고 연결 DB의 90일 실행 이력도 없어 scheduler 누락 후보로 기록했다. 다른 자동화의 무기록만으로 미사용 판정하지 않았다.

### 검증
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다. API·import·navigation·OCI cron 정적 참조를 확인했고, SEC 자동 수집은 `/api/cron/sec-edgar` 및 `/api/cron/market-rss` 경로에 남아 있음을 확인했다.
- 연결 DB는 `.env.local` 우선 환경으로 `BEGIN READ ONLY` 조회했다. 25 registry 항목 중 3개 `NOT_SCHEDULED`, 22개 `OCI_CRON`; 최근 30일 기록은 `dart-realtime` 132회뿐이고 나머지 scheduled 항목은 0회, 90일에는 7개 module만 기록이 있었다. 이는 DB에 기록된 이력이며 기능 미사용의 증거와 동일하지 않다.
- `npm.cmd run docs:check`는 기존 migration 중복 V148 및 V149로 실패했다. V156 `instrument_fundamental_attempt_timestamp` 삭제는 원격 코드가 해당 컬럼을 읽고 쓰므로 배포 전 재검토가 필요하다.
- `origin/oci` 기준 2 ahead·5 behind로 분기되어 있으며 이전 전체 검증의 테스트 실패도 남아 있어 deploy 검증은 통과하지 않았다.

### 다음 개선
- 원격 최신 이력과 migration을 먼저 조정하고 전체 검증을 재실행한다. 외부 DART API 소비자 및 관리자 KIS 대체 여부를 확인한 뒤에만 삭제 범위를 확정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-20-004
- 성과 판정: PARTIAL
- 근거: 저장소 정적 도달성·scheduler·DB 실행 이력을 조사했으나 외부 소비 확인 및 배포 게이트 문제가 남아 미사용 후보 제거와 배포는 확정하지 않았다.

### 커밋·푸시·배포
- 상태: 미실행. 조사 문서만 기록했으며 커밋·푸시·배포는 하지 않았다.

## [2026-10-20] 시총 재시도 원장의 실제 시각 보존

### 목표
- 재시도 대기 중 운영 실패 응답의 시간 근접 진단이 불가능했던 원인을 제거해 다음 실제 KIS 재시도와 기존 cache를 올바르게 대조한다.

### 반영
- 운영 read-only 진단(2026-10-20 04:52 UTC): job 6,704종목, 성공 6,558, 실패 146, retry due 0. 실패 146건 모두 deferred이며 최신 `item.updated_at`은 04:50 UTC, 기존 debug는 실패 시각으로 `updated_at`을 사용해 cache timing을 판정하고 있었다.
- 코드 대조 결과 `beginFundamentalRefresh()` 재개 경로가 이름이 같은 모든 항목에 `updated_at=NOW()`를 기록했다. provider를 재호출하지 않고 대기 항목 이름을 재동기화할 때 실제 실패 시점이 소실되는 결함으로 확인했다.
- V156 `instrument_fundamental_refresh_items.last_attempt_at`을 추가한다. 기존 값은 실패 시각을 복구할 근거가 없으므로 소급 채우지 않는다.
- `markFundamentalBatchInTransaction()`은 성공/실패 상태 반영과 같은 DB 트랜잭션에서 `last_attempt_at=NOW()`를 기록한다. 재개 시 종목명이 실제 달라진 경우에만 업데이트해 쓸데없는 6,704행 쓰기와 시각 변조를 막는다.
- 진단 API는 `last_attempt_at`이 명시된 항목에서만 cache 근접도를 비교하며, 레거시는 `attemptTimeMissingCount`와 `cacheTimingUnknownCount`로 격리한다. mutable `updated_at`으로 추정하지 않는다.

### 검증
- `npm.cmd test -- --run lib/instrument-fundamental-progress.test.ts lib/instrument-fundamental-debug.test.ts`: 2개 파일, 8개 테스트 통과.
- `npm.cmd run docs:check`는 새 항목의 섹션 명칭과 전달 상태 문구를 자동 계약에 맞게 보완한 뒤 통과했다.
- 원격 `oci`가 검증 도중 RSS 변경으로 전진해 해당 커밋을 rebase한 뒤 최종 상태에서 `npm.cmd run deploy:verify` 재통과: production build, standalone `/charts`·API smoke, Chrome desktop/mobile hydration, 815개 테스트 통과·1개 skip, typecheck, 문서·V156 migration 감사, verify-scope, KIS boundary, Bearer auth, OCI cron, npm audit 취약점 0건.
- 문서 충돌 정리 뒤 첫 `deploy:verify`는 standalone 서버 TCP 준비가 3.8초에서 18초로 늘어난 실행에서 `/charts` 요청 timeout으로 실패했다. 응용 코드 오류 신호는 없었고, 동시에 여러 프로젝트의 Node 프로세스가 실행 중인 환경 자원 경합 가능성을 원인 후보로 분류했다. 동일 최종 트리로 재시도해 standalone 준비 3.4초, `/charts`·API smoke, desktop/mobile Chrome, 815개 테스트 통과·1개 skip, typecheck와 모든 audit를 통과했다.
- 원격 `oci`가 다시 전진한 뒤 해당 RSS 커밋을 포함해 최종 재검증: `npm.cmd run deploy:verify` 통과, 818개 테스트 통과·1개 skip, production build 및 standalone/browser/API smoke와 전체 audit 성공.
- 운영 배포 workflow `39376235654`가 커밋 `86ab175e`에서 성공. `/api/health`, `/`, `/charts` HTTP 200 확인. 인증된 read-only 운영 확인에서 Flyway `156` (`instrument fundamental attempt timestamp`) 적용 확인.
- 배포 직후 진단은 최근 원장 6,704건 중 성공 6,558·실패 146, 재시도 대기 146·기한 도래 0을 보였다. 이 146건은 V156 이전 레거시이므로 `last_attempt_at` 146건 모두 미상으로 정확히 표시되고 cache timing도 미상으로 분리됐다. 다음 재시도 예정은 2026-10-20 19:05 KST이므로, 새 시각 기록과 provider 결과 검증은 해당 자동 재시도 이후 남아 있다.

### 다음 개선
- V156 운영 적용 후 다음 예약 재시도 결과에서 `last_attempt_at`, cache fetchedAt, 오류 분포를 확인한다. KIS 요청을 수동으로 유도하거나 전체 종목 갱신하지 않는다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-20-013
- 성과 판정: IMPROVED
- 근거: 운영 데이터가 실패 시각 오염 경로와 일치했고, 전용 시각 보존 및 오판 방지 코드를 추가했다. 마이그레이션·테스트·운영 배포와 다음 실제 재시도 검증은 남아 있다.

### 커밋·푸시·배포
- 상태: 구현 배포 완료. 코드 커밋 `86ab175e`를 `oci`에 push했고 Deploy OCI workflow `39376235654` 성공, health·메인·charts HTTP 200 및 Flyway V156 적용을 확인했다. 레거시 실패 146건의 실제 재시도 검증은 다음 자동 실행 후 진행한다.

## [2026-10-20] 외부 RSS 번역 API 대상을 StockTitan 제목으로 제한

### 목표
- 외부 번역 API 사용을 `STOCKTITAN` RSS 기사 `title` 필드만으로 제한한다.

### 반영
- 근본 원인: cron 조회와 관리자 번역 테스트가 출처를 제한하지 않아 다른 RSS 제목도 외부 provider에 전달될 수 있었다.
- cron 쿼리에 StockTitan 출처 조건을 고정하고 공통 번역 함수에서 다른 출처를 거부한다. 관리자 테스트는 출처 생략 시 StockTitan만 조회하고 다른 출처의 번역 요청은 HTTP 400으로 거부한다.
- 번역 provider 호출은 제목 문자열 하나로 제한되어 있으며 월간 사용량 예약·기사별 `translation_char_count`도 제목 문자 수만 반영한다.
- 테스트 UI 설명, `docs/stocktitan-rss.md`, `docs/architecture/stocktitan-translation.md`, `docs/rss-translation-design.md`, `docs/ERROR_HANDLING.md`를 현재 구현과 일치시킨다.

### 검증
- `lib/translate-market-rss-item.test.ts`: 비 StockTitan 출처는 provider 호출이 없는지, StockTitan 기사에서는 제목만 전달되는지 검증한다.
- `app/api/admin/market-rss-test/route.test.ts`: `translate=true`의 StockTitan 기본 범위와 다른 출처 거부를 검증한다.
- 두 신규 회귀 테스트 포함 전체 테스트 813개 통과·1개 skip. `npm.cmd run deploy:verify` 통과: production build, standalone·Chrome desktop/mobile·API smoke, typecheck, 문서·migration, verify-scope, KIS boundary, Bearer auth, OCI cron, npm audit 취약점 0건.

### 다음 개선
- 다음 월 사용량 경계 이후 진단 API에서 StockTitan 제목 번역이 정상 재개되는지 확인한다. 이번 달 과거 사용량은 보존한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-20-003
- 성과 판정: IMPROVED
- 근거: cron, 관리자 미리보기, 공통 provider 진입점의 세 경계에서 출처와 번역 필드를 제한해 다른 RSS 제목이 외부 API로 전달되지 않게 한다.

### 커밋·푸시·배포
- 상태: 완료. 코드 커밋 `ab3786ca`를 `oci`에 push했고 Deploy OCI run `39371903852` 성공. 배포 후 운영 health `ok`, `/charts` HTTP 200.

## [2026-10-20] StockTitan Discord RSS 알림 형식 정리

### 목표
- StockTitan RSS Discord 알림에서 출처·등락률·거래대금 줄과 링크 미리보기 임베드를 제거한다.

### 반영
- 일반 시장 RSS 알림은 유지하고, 대기 중인 StockTitan 재전송에도 새 형식을 적용한다.
- `lib/market-rss-pipeline.ts`: StockTitan 본문 항목을 정리하고 Discord `SUPPRESS_EMBEDS` 플래그를 설정한다.
- `lib/discord-delivery-retry.ts`: 기존 큐 항목의 StockTitan 본문을 정리하고 임베드 억제 플래그를 적용한다.
- `docs/stocktitan-rss.md`: 운영 형식과 재전송 동작을 기록한다.

### 검증
- 원격 `oci` 갱신 전 `npm.cmd run deploy:verify` 통과: production build, standalone API·페이지 smoke, Chrome desktop/mobile hydration, 테스트 797개 통과·1개 skip, typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth, OCI cron 감사, npm audit 취약점 0건.
- 배포 기준 원격 커밋이 검증 중 두 차례 갱신되어 최신 원격 HEAD 기준으로 전체 게이트를 재실행했다.
- 최종 최신 기준 `npm.cmd run deploy:verify` 통과: production build, standalone 및 Chrome desktop/mobile/API smoke, 테스트 804개 통과·1개 skip, typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth, OCI cron 감사, npm audit 취약점 0건.
- GitHub Deploy OCI workflow run `39359695006` 성공. Verify, standalone 패키징, SSH 업로드와 서버 활성화 단계 모두 성공했다.
- Discord 메시지 실수신은 별도의 관리자 RSS 테스트 또는 예약 알림에서 확인한다.
- 배포 운영 API `GET /api/debug/market-rss-translations?hours=24&source=STOCKTITAN` read-only 조회: StockTitan 654건 중 TRANSLATED 7건, SKIPPED 548건, PENDING 99건, FAILED 0건. 번역 완료 7건은 영문 제목에 대응하는 한국어 제목이 저장되어 있었다.
- SKIPPED 548건은 전부 `monthly_character_limit_reached` 및 `translation_fallback=true`였고 `translated_title`은 원문과 같았다. 미번역 PENDING 99건은 시도 횟수 0이었다.
- 근본 원인: 내부 월간 한도 300,000자가 소진되면 번역 래퍼가 원문을 fallback으로 반환한다. 알림 조회는 번역 상태 완료를 조건으로 확인하지 않고, 본문도 `translatedTitle || title`을 사용하므로 fallback 및 미번역 PENDING 행이 원문 제목으로 전송될 수 있다.

### 다음 개선
- 사용량 한도 상향에 따른 비용과 미번역 시 알림 지연/제외 정책을 확정한 뒤, StockTitan 알림은 한국어 번역 완료 상태만 전송하도록 보호한다. 배포 후 RSS Discord 관리자 테스트에서 세 항목 및 링크 미리보기 부재도 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-20-001
- 성과 판정: IMPROVED
- 근거: 신규 전송 및 재시도 payload에 요구한 본문 필터와 Discord 임베드 억제 플래그를 적용해 OCI 배포했다. 운영 디버그 API 표본에서는 번역 경로가 정상일 때 한국어 결과를 확인했지만, 월간 300,000자 한도 도달로 548건은 원문 fallback이었고 notifier가 미번역 PENDING도 보낼 수 있음을 확인했다. 알림 게이트 정책은 별도 확정이 필요하다.

### 커밋·푸시·배포
- 상태: 완료. 코드 커밋 `bbd4ff14`를 `oci`에 push했고 Deploy OCI run `39359695006` 성공. 서버 활성화까지 완료했다.
# Development Log

## [2026-10-20] StockTitan Discord RSS 알림에서 티커 제거

### 목표
- StockTitan Discord Webhook 알림에서 `티커:` 항목을 제거한다.

### 반영
- 신규 알림 본문에서 StockTitan의 티커 행을 생략한다. 다른 시장 RSS 알림의 티커는 유지한다.
- 재시도 큐도 원본 기사 출처를 확인해 StockTitan 티커 행을 제거하고, 기존 형식의 출처·등락률 행과 임베드 억제 동작을 계속 적용한다.
- `docs/stocktitan-rss.md`와 본 개발 로그에 작업 범위 및 배포 결과를 기록한다.

### 검증
- `npm.cmd run deploy:verify` 통과: production build, standalone·Chrome desktop/mobile·API smoke, 테스트 804개 통과·1개 skip, typecheck, 문서·migration, verify-scope, KIS boundary, Bearer auth, OCI cron, npm audit 취약점 0건.
- 신규 StockTitan 본문은 티커 조건이 false이고, 일반 RSS 본문은 기존 티커 행을 유지하는 조건을 코드에서 확인했다. StockTitan 재시도는 외부 ID로 기사 원본을 확인해 티커를 제거하고 임베드 억제 플래그를 유지한다.

### 다음 개선
- 없음.

### 개선 과제
- 개선 과제 ID: CI-2026-10-20-002
- 성과 판정: IMPROVED
- 근거: 새 StockTitan 알림과 재시도 큐에서 티커 행을 제거하고 일반 RSS 알림 표시는 유지했다. 배포 전 전체 게이트 804개 테스트가 통과했고, 배포 뒤 health와 charts가 HTTP 200을 반환했다.

### 커밋·푸시·배포
- 상태: 코드 커밋 `3ff29bfa`를 `oci`에 push했고 Deploy OCI run `39368775998` 성공. 검증, 패키징, 업로드와 서버 활성화가 모두 완료됐으며 health와 charts도 HTTP 200이다.

## [2026-10-20] 해외 시총 갱신 숫자 alias 및 응답 캐시 무결성 보강

### 목표
- 운영 진단에서 실제 실패 시점 응답이 보존되지 않아 원인을 판별할 수 없음을 확인했다. 빈 우선 필드가 대체 alias를 가리는 파싱 결함과 HTTP 200만으로 잘못된 KIS 데이터를 캐시에 기록하는 위험을 회귀 테스트로 막는다.

### 반영
- `lib/instrument-fundamentals.ts`: 가격·시총 alias는 첫 비-null 값이 아니라 규칙에 맞는 첫 유효값(양수)을 선택한다. 변동률은 첫 유한 숫자, 거래량·거래대금은 첫 0 이상 숫자를 선택한다.
- `lib/kis-us-price-detail.ts`: output 후보 중 실제 가격/시총 필드가 채워진 객체를 선택한다. `rt_cd`가 성공이 아니거나 유효한 양수 가격/시총이 없는 HTTP 2xx는 메모리·DB 캐시에 저장하지 않아 기존 정상 캐시가 빈 응답으로 덮이는 것을 방지한다.
- `lib/instrument-fundamentals.test.ts`, 신규 `lib/kis-us-price-detail.test.ts`: 빈 우선 alias 뒤의 유효값, 빈/오류 HTTP-200 캐시 억제, 정상 응답 저장, output/output1 선택을 검증한다.
- 운영 갱신 문서에 파싱·캐시 규칙 및 관측 한계를 기록했다.
- 운영 진단 재조회: 최근 job PARTIAL, 전체 6,704건 중 성공 6,558·실패 146, retry due 0. 실패 146건 모두 연결 캐시는 있으나 10분 내 근접 캐시는 0건이며 HTTP 200/`rt_cd=0`이고 저장된 `last`는 비어 있다. 이 캐시들은 오래된 값이므로 당시 실패 응답에 대한 증거가 아니며, 운영 원인을 특정할 수 없다. 추가 KIS 호출이나 전체 갱신은 실행하지 않았다.

### 검증
- `npm.cmd test -- --run lib/instrument-fundamentals.test.ts lib/kis-us-price-detail.test.ts`: 2개 파일, 18개 테스트 통과.
- `npm.cmd run deploy:verify`: 최종 코드 기준 통과. dependency audit 0 취약점, production build, standalone `/charts` 200 및 11 JS chunk 확인, Chrome 데스크톱·모바일 hydration, API/auth smoke, 테스트 224개 파일 통과·1 skip(809 passed·1 skipped), typecheck, docs/migration, verify-scope, KIS 경계, Bearer 인증, OCI cron 감사 완료.
- 코드 push 후 Deploy OCI workflow `39370209950`이 성공했다. 운영 `GET /api/health`, `/`, `/charts`가 모두 HTTP 200이고 인증된 read-only 진단 API도 정상 응답했다.
- 배포 직후 최근 원장은 PARTIAL, 대상 6,704·성공 6,558·실패 146·retry due 0이다. 캐시 근접 실패는 여전히 0건이다. 예정된 개별 재시도 전이므로 수정 코드의 운영 데이터 개선은 아직 측정되지 않았으며 전체 갱신이나 KIS 호출은 실행하지 않았다.

### 다음 개선
- 다음 정기 재시도 이후 새로운 실패의 캐시 시각과 안전 필드 상태를 다시 대조한다. 신선한 데이터에서도 값이 비면 KIS 공식 가격상세 응답 규격과 거래소별 종목 지원 범위를 종목 표본으로 확인한다. Retry 시각 전에는 수동 대량 요청을 하지 않는다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-20-012
- 성과 판정: IN_PROGRESS
- 근거: alias fallback 및 오류 응답 캐시 덮어쓰기 회귀를 방지하는 단위 테스트는 통과했다. 운영의 기존 146개 오류 원인은 신선한 실패 응답이 없어 아직 미확정이며 전체 배포 게이트도 남아 있다.

### 커밋·푸시·배포
- 상태: 코드 커밋 `c1db8ac1`을 `oci`에 push했고 Deploy OCI run `39370209950` 성공. 운영 health, 메인, charts 및 인증된 read-only 진단 API를 확인했다. 오류 원인 검증은 신선한 재시도 응답 관측까지 진행 중.

## [2026-10-20] 해외 시총 실패 응답의 안전한 캐시형태 진단

### 목표
- 운영 원장에서 135건으로 확인된 `KIS_PRICE_INVALID`를 필드 누락·공백·비수치·0·output 선택 문제 중 어디에 해당하는지, 전체 KIS 재호출 없이 판별한다.

### 반영
- 원인 가설: 오류 코드는 `output.last ?? output.t_prpr ?? output.price` 후 값이 양수가 아닌 경우를 한데 묶는다. 또한 해외 가격상세 모듈은 HTTP 2xx이면 업무코드·필드 형태와 무관하게 응답 JSON을 `us_price_detail_cache`에 저장한다. 따라서 실패 시각과 가까운 기존 cache JSON을 안전하게 형태만 집계하면 파서 alias 문제와 공급자 응답 문제를 구분할 수 있다.
- `lib/instrument-fundamental-debug.ts`: 최근 job 실패 항목을 기존 `us_price_detail_cache`와 조인하고 최대 500건에서 output 형태, `rt_cd/msg_cd`, 현재 선택 alias 상태, 다른 alias의 양수 여부, 시총 필드 상태를 안전 집계한다. 실패 시각과 cache 시간이 10분 이내인지도 계산한다.
- 상세 표본은 output 후보별 허용 필드 상태만 반환한다. 응답 숫자값, 자유형 KIS 메시지 및 raw payload는 반환하지 않고, provider 요청/DB 쓰기도 하지 않는다. 대량 오류 시에도 조회는 최대 500행으로 상한을 둔다.
- `lib/instrument-fundamental-debug.test.ts`는 `last` 공백인데 `t_prpr` 양수가 있는 응답에서 현재 파서가 실패할 수 있음을 진단값으로 드러내고, cache 시각·응답코드만 노출하는 계약을 검증한다.
- 운영 문서에 진단 집계와 캐시 시각 해석의 한계를 추가했다.

### 검증
- `npm.cmd test -- --run app/api/debug/instrument-fundamentals/route.test.ts lib/instrument-fundamental-debug.test.ts`: 2개 파일, 7개 테스트 통과.
- `npm.cmd run docs:check` 통과: 개발 로그 계약 및 150개 migration/V155/23개 운영 관계 확인.
- `npm.cmd run typecheck` 통과.
- 최신 no-job 응답 shape 보완 후 `npm.cmd run deploy:verify` 최종 통과: production build, standalone 서버 기동과 `/charts` HTTP 200, Chrome 데스크톱·모바일 hydration, API/인증 smoke, 223개 파일 804개 테스트 통과·1개 skip, typecheck, docs·migration·verify-scope·KIS 경계·Bearer 인증·OCI cron 감사, npm audit 0 취약점.
- 신규 쿼리는 provider 요청 없이 최근 실패 최대 500건을 조회하도록 제한했다. 실제 운영 캐시 field-state 집계 확인은 배포 후 진행한다.

### 다음 개선
- 운영 캐시 집계에서 실제 대체 alias 양수 사례가 나오면 해당 alias를 비어 있지 않은 값 우선으로 읽도록 파서를 수정하고, 기존 cache를 이용한 재현 테스트와 다음 예정 retry 실행 결과를 검증한다. 대체 alias가 관측되지 않는 경우에는 KIS 공식 응답의 거래소/종목 매핑과 미지원 종목 상태를 소량 표본으로 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-20-011
- 성과 판정: UNMEASURED
- 근거: 운영 cache 모양을 반환하는 read-only 진단 기능을 추가했지만, 해당 운영 결과와 전체 배포 검증은 아직 확인 중이다.

### 커밋·푸시·배포
- 상태: 미실행. 회귀·전체 검증 성공 후 커밋·푸시·배포한다.

## [2026-10-20] 시총 갱신 원장 조회용 운영 진단 API

### 목표
- 운영 자동화 이력만으로 구분되지 않는 최근 시총 갱신 작업의 종목별 오류코드 전체 분포와 재시도 대기 상태를 read-only 방식으로 확인한다.

### 반영
- 운영 조회에서 최근 PARTIAL job의 실패 146건이 전부 재시도 연기 상태인 것까지 확인했지만, 오래된 실행 요약에는 새 오류코드 집계가 없어 전체 분포를 단정할 수 없었다. 이를 특정 코드 탓으로 추정하지 않고, V154/V155 진행 원장을 직접 읽는 `/api/debug/instrument-fundamentals`를 추가했다.
- `lib/instrument-fundamental-debug.ts`는 최근 job의 전체/상태/재시도 집계, 시장·안전 오류코드별 실패 수, 최대 25개 제한 샘플을 조회한다. 공급자 원문 payload는 읽거나 반환하지 않는다.
- `app/api/debug/instrument-fundamentals/route.ts`는 관리자 세션 또는 cron secret 인증을 요구하며, 실패 시 DB 오류 원문을 감춘다. DB를 변경하거나 KIS를 호출하지 않는다.
- 운영 문서에 endpoint와 read-only 응답 범위를 추가했다.

### 검증
- `npm.cmd test -- --run app/api/debug/instrument-fundamentals/route.test.ts lib/instrument-fundamental-debug.test.ts`: 2개 파일, 7개 테스트 통과. 인증 없이 DB를 호출하지 않음, 관리자/cron 인증, 빈 원장, 오류코드/재시도 표현, DB 오류 비노출을 검증했다.
- `npm.cmd run docs:check` 통과: 150개 마이그레이션, 최신 V155, 운영 관계 23개 확인.
- `npm.cmd run typecheck` 통과.
- 커밋 전 `npm.cmd run deploy:verify` 통과: production build, standalone 서버 기동 및 `/charts` HTTP 200, 데스크톱·모바일 Chrome hydration, API/인증 smoke, 223개 테스트 파일 통과·1개 skip(804 passed·1 skipped), 타입 검사, 문서·migration·verify scope·KIS 경계·Bearer 인증·OCI cron 검사, npm audit 취약점 0건.
- 운영 배포 후 `GET /api/health`, `/`, `/charts` 모두 HTTP 200. 새 진단 API는 cron 인증 GET에서 200, 미인증 GET은 401로 확인.
- 운영 원장 job 1 (2026-10-20 02:16 UTC): 대상 6,704, 저장 성공 6,558, 실패 146, 재시도 대기 146, due 0. 전체 오류 집계는 `KIS_PRICE_INVALID` 135건(NAS 97, NYS 28, AMS 10), `KIS_MARKET_CAP_MISSING_OR_INVALID` 11건(NAS 6, NYS 5)으로 총 실패 수와 일치했다. 모두 최대 5회 시도 상태이며 가장 이른 재시도는 2026-10-20 10:05:10 UTC(19:05:10 KST)이다.
- 같은 job의 최신 automation run은 `SKIPPED/instrument_retry_backoff`, KIS 요청 0건, 누적 실패 146건이었다. 원장 전체분포와 이전 상세 partial 요약은 교차 확인되었으며, 실패 원문은 저장하지 않아 `KIS_PRICE_INVALID` 내부 원인(필드 누락/0/응답 형태)은 아직 구분되지 않는다.

### 다음 개선
- 다음 예정 재시도 뒤 같은 ticker에서 KIS를 대량 호출하지 말고, 우선 1개씩 제한된 공식 price-detail 응답의 필드 존재 여부·양수 파싱 결과만 안전 메타데이터로 계측한다. `KIS_PRICE_INVALID`의 필드누락/0/비숫자 원인을 구분하고, 정상 응답이면 마스터의 거래소 코드/종목 매핑을 공식 자료와 교차 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-20-010
- 성과 판정: IMPROVED
- 근거: 로컬 전체 배포 게이트와 7개 신규 회귀 테스트가 통과해, 배포 가능한 인증 보호 read-only 진단 경로가 빌드·실행됨을 확인했다. 운영 데이터 대조 성과는 배포 후 측정한다.

### 커밋·푸시·배포
- 상태: 완료. 커밋 `2342b779`를 `oci`에 푸시했고 Deploy OCI run `39357563114` 성공. 배포 후 health 및 핵심 페이지 HTTP 200, debug endpoint 인증/응답과 오류 집계를 확인했다.

## [2026-10-19] 시총 갱신 실패 전체 분포 및 해외 토큰 진단

### 목표
- 실패 상세 샘플 100건 제한으로 가려질 수 있는 전체 오류 분포를 보존하고, 해외 토큰 미확보를 KIS 응답 오류와 구분한다.

### 반영
- 원인: 해외 가격 상세 모듈은 토큰과 stale 캐시가 모두 없으면 `null`을 반환했지만, 시총 갱신은 이를 `KIS_RESPONSE_UNAVAILABLE`로 오분류했다. 또 전체 실패 목록을 100건으로 잘라 기록해 샘플 바깥 오류의 유형·시장 분포를 알 수 없었다.
- `lib/instrument-fundamentals.ts`: 토큰 부재 코드를 `KIS_TOKEN_UNAVAILABLE`로 정정하고, 전체·시장별 오류 코드 집계를 추가했다. 종목 상세 샘플은 종전 100건 제한을 유지한다.
- `lib/instrument-fundamentals.test.ts`: 토큰 부재 분류와 120건 실패 시 전체 분포 120건 및 상세 샘플 100건 제한을 회귀 테스트로 검증한다.
- `docs/operations/instrument-fundamentals-refresh.md`: 운영자가 전체 집계 → 시장 분포 → 제한된 상세 샘플 순으로 확인하도록 관측 기준을 갱신했다.

### 검증
- 최종 `npm.cmd run deploy:verify` 통과: production build, standalone `/charts` 및 API smoke, Chrome 데스크톱·모바일 hydration, 222개 test file 중 221개 통과/1개 skip(797개 통과/1개 skip), typecheck, docs/migration audit(V155), verify-scope, KIS boundary, Bearer auth, OCI cron, npm audit 취약점 0건.
- 첫 전체 게이트는 로그 계약 누락으로 docs 단계에서 차단됐고, 수정 후 다음 빌드에서 DB 콜백 제어흐름 타입 오류가 발견됐다. 두 원인을 각각 보완하고 회귀테스트·typecheck 후 최종 전체 게이트 성공까지 확인했다.
- 전용 `lib/instrument-fundamentals.test.ts`: 13개 통과. DB batch 오류 시 항목별 실패 귀속 및 120건 분포/100건 샘플 제한 검증.
- 운영 런타임 확인은 다음 실제 갱신 실행에서 새 `failureCodeCounts`와 `failureCodeCountsByMarket` 필드를 대조해야 한다.
- 코드 배포 workflow run `39237883085` 성공. 운영 `/api/health` status=ok, `/`·`/charts` HTTP 200 확인.

### 다음 개선
- 다음 운영 갱신 후 관리자 실행 이력에서 전체 오류 코드 합계가 `failureCount`와 일치하는지, 시장별 합계가 시장별 실패 건수와 일치하는지 검증한다. 특히 DB 저장 장애·중단 때의 귀속 결과를 확인한 뒤 KIS 업무 오류별 backoff 정책을 실측 근거로 조정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-19-009
- 성과 판정: IMPROVED
- 근거: 최종 전체 배포 검증과 회귀테스트에서 상세 샘플 상한을 유지하면서 120건 전체 실패 분포, DB 쓰기 실패의 항목별 원인 귀속, 해외 토큰 미확보의 고유 안전 코드가 동작함을 확인했다. 운영 오류율은 다음 실제 갱신 후 측정한다.

### 커밋·푸시·배포
- 상태: 완료. 코드 커밋 `4d0545e5`를 `oci`에 푸시했고 Deploy OCI run `39237883085` 성공. 배포 후 운영 health 정상 및 `/`·`/charts` HTTP 200 확인.

## [2026-10-18] Fundamentals 공급자 오류 원인 세분화

### 목표
- 시총 갱신 실패 종목을 재시도할 때 HTTP 장애, KIS 업무 오류, 오래된 fallback, 가격/시총 누락을 안전하게 구분하여 운영자가 원인을 판별할 수 있게 한다.

### 반영
- `lib/instrument-fundamentals.ts`: 공급자 응답을 HTTP 상태 → KIS 업무 코드 → stale 여부 → 가격 → 시총 순으로 검증하고, 원문 메시지 대신 제한된 안전 오류 코드를 진행 원장에 기록한다. 토큰 부재·요청 timeout·네트워크 실패도 별도 코드로 구분한다.
- `lib/instrument-fundamentals.test.ts`: HTTP 503, KIS 업무 코드, 비안전 메시지 코드, stale fallback, 가격/시총 누락의 분류와 실제 refresh 실패 요약을 회귀 테스트로 고정한다.

### 검증
- 전용 Vitest 14개 통과. 전체 `deploy:verify`와 PostgreSQL 런타임 확인은 진행 예정이며, 성공 전에는 커밋·푸시·배포하지 않는다.
- 전체 `npm.cmd run deploy:verify` 통과: production build, standalone `/charts`·API smoke, desktop/mobile hydration, Vitest 795개 통과·1개 skip, typecheck, docs/migration audit(V155), verify-scope, KIS boundary, Bearer auth, OCI cron 구조, npm audit 취약점 0건.

### 다음 개선
- 운영 재시도 이력에서 오류 코드별 발생 비율을 확인하고, 일시 장애와 영구적인 종목 데이터 결함에 대해 같은 backoff가 적절한지 측정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-18-008
- 성과 판정: IMPROVED
- 근거: 테스트에서 동일한 실패 카운터가 원인별 안전 코드로 정확히 분류되고 자유형 응답 문구는 저장되지 않음을 확인했다. 운영 분포는 배포 뒤 계측해야 한다.

### 커밋·푸시·배포
- 상태: 완료. 코드·테스트·문서 커밋 `a38f7c97`을 `oci`에 푸시했고 Deploy OCI run `39111995380` 성공.
- 배포 후 운영 `/api/health` 정상 및 `/charts` HTTP 200 확인. Flyway 변경은 없어 V155 상태를 유지한다.

## [2026-10-18] Fundamentals 실패 종목 재시도 폭주 방지

### 목표
- 기존 시총/기본정보 갱신 재개 과정에서 계속 실패하는 동일 종목을 매시간 다시 KIS에 요청할 수 있던 부분을 제한하되, 실패 종목을 영구 제외하지 않고 지연 재시도한다.

### 반영
- 원인: V154 진행 원장은 실패 횟수를 저장했지만 재시도 가능 시각이 없어 `FAILED` 전체가 매 실행마다 후보가 됐다.
- V155에 `next_attempt_at`과 FAILED 부분 인덱스를 추가했다. 오류 항목별 대기시간을 1·2·4·8·24시간으로 늘리고 24시간 상한을 적용한다. 성공 시 backoff/error 상태를 초기화한다.
- 재개 시 due 상태인 `FAILED`만 provider 요청에 넣고, 대기 건수와 다음 재시도 시각을 요약한다. 전부 대기 중이면 KIS 호출 없이 SKIPPED 기록으로 반환한다. DB 실패 후 미시도된 PENDING은 backoff 없이 기존 1시간 재시도 경로로 복구한다.
- 오래된 미완료 작업을 재개할 때 `created_at`도 갱신해 같은 요청 안의 14일 정리 대상이 작업을 cascade-delete하지 않도록 함께 수정했다.

### 검증
- 전용 Vitest 18개 통과(재시도 대기 시 KIS 0회, 정상 미완료 회수 및 상태 SQL 포함).
- 임시 PostgreSQL 16에서 V154·V155 적용 및 실패 상태/다음 재시각 쿼리 통과.
- `npm.cmd run deploy:verify` 최종 재실행 통과: production build, standalone `/charts` 및 차트 API smoke, desktop/mobile hydration, 전체 Vitest 794개 통과·1개 skip, typecheck, docs/migration audit(V155), verify-scope, KIS boundary, Bearer auth, OCI cron 구조, npm audit 0 취약점.
- 운영 점검 시 `progress.deferredRetryCount`, `progress.nextRetryAt`, 항목별 `attempt_count/next_attempt_at`을 확인한다. 실패 종목 호출이 다음 재시도 시각 전에 발생하면 회귀다.

### 다음 개선
- 전체 게이트 재실행 후 새 마이그레이션이 운영에 적용되면 첫 재개 실행에서 `deferredRetryCount`와 실패 종목의 KIS 호출 간격을 대조한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-18-007
- 성과 판정: IMPROVED
- 근거: 재시도 시각 미도래 항목은 실제 KIS 요청 없이 지연되고, PostgreSQL에서 V155와 interval 계산이 동작함을 확인했다. 운영 호출량 감소는 배포 후 실행 이력으로 추가 측정한다.

### 커밋·푸시·배포
- 상태: 완료. 코드·마이그레이션 커밋 `83462033`을 `oci`에 푸시했고 Deploy OCI run `39109744642` 성공.
- 운영 관리자 디버그 API에서 Flyway V155(`instrument fundamental retry backoff`) 적용 확인. `/api/health` 정상, `/charts` HTTP 200.

## [2026-10-18] 시총 갱신 중단 복구를 위한 종목별 영속 진행 상태

### 목표
- 장시간 국내·해외 보통주 시총/기본정보 갱신이 중단되거나 부분 실패해도 이미 정상 저장된 종목은 재호출하지 않고, 미완료 종목만 다음 실행에서 재개한다.

### 반영
- `db/migration/V154__instrument_fundamental_refresh_progress.sql`: 작업별 대상 지문·상태와 종목별 진행/재시도/안전 오류 코드를 저장하는 테이블 및 부분 인덱스를 추가했다.
- `lib/instrument-fundamental-progress.ts`: 대상 집합 SHA-256, 미완료 작업 재개, 바뀐 유니버스의 이전 작업 격리, 14일 지난 종료 이력 정리, 종목 진행상태 기록·요약을 구현했다.
- `lib/instrument-fundamentals.ts`: `SUCCESS` 종목은 다시 호출하지 않고 `PENDING`/`FAILED`만 KIS에 요청한다. 성공 이력·최신 스냅샷과 종목 완료 표식은 하나의 DB 트랜잭션에서 같이 커밋한다. DB 실패 시 진행 표식도 롤백되어 다음 재시도에서 안전하게 회수된다.
- `lib/automation-run.ts`: 요약의 `ok:false`, 미시도 종목, 음수/비정수/비숫자 카운터가 있는데 실패 건수가 0으로 빠진 결과를 SUCCESS로 기록하지 않도록 분류를 보강했다.
- `lib/instrument-fundamental-progress.test.ts`, `lib/instrument-fundamentals.test.ts`, `lib/automation-run.test.ts`: 해시 안정성, 파라미터화 진행 SQL, 갱신 대상 미일치 방지, 완료 종목 건너뛰기, DB 실패 비성공 처리, 실행 상태 판정 회귀를 고정했다.
- `lib/schema-health.ts`, `docs/architecture/database-schema.md`, `docs/operations/instrument-fundamentals-refresh.md`: 운영 스키마 필수 목록·DB 구조·재개/보존 정책을 동기화했다.

### 근본 원인 및 영향
- 기존 구현은 200종목 단위 커밋으로 저장 데이터는 보존했으나, 어떤 종목이 해당 갱신 작업에서 확정 저장되었는지 durable ledger가 없었다. 다음 실행은 항상 전체 유니버스를 다시 조회해 장시간 KIS 호출을 낭비했다.
- 최신 스냅샷 시각은 다른 경로도 갱신할 수 있어 완료 표식으로 사용할 수 없다. 별도 작업 지문과 종목 상태 원장을 도입하고 snapshot/history와 같은 트랜잭션에서만 성공 상태를 전이한다.
- 자동화 요약이 `ok:false`여도 `failureCount=0`이면 SUCCESS가 될 여지가 있었다. 실패와 미시도 카운터를 함께 판정하도록 변경해 일일 재시도 간격이 실패 작업을 성공으로 오인해 막는 위험을 줄였다.

### 재발 감지 및 운영 기준
- 다음 갱신의 실행 요약 `progress.resumed`, `progress.skippedCompletedCount`, `progress.cumulativeSuccessCount`, `progress.pendingCount`를 확인한다. 동일 지문 재실행에서 완료 종목 호출이 관측되면 회귀로 본다.
- 성공 상태는 가격 history/snapshot 저장과 원자적이어야 한다. 진행 상태 UPDATE의 affected row 수가 예상 종목 수와 다르면 트랜잭션 전체를 실패시킨다.
- 지문이 바뀐 경우(활성 보통주 추가/삭제/시장 변경) 이전 진행 건을 이어 붙이지 않고 전체 새 작업을 시작한다. KIS 미응답은 FAILED로 저장하고 다음 시도에 포함하며, DB 실패 배치는 진행 표식을 커밋하지 않는다.
- 종료 이력은 새 작업 시작 시 14일 뒤 정리한다. 동일 지문의 미완료 작업은 다시 실행될 때 재개한다.

### 검증
- `npm.cmd run deploy:verify` 통과: production build, standalone 서버 기동 및 `/charts` HTTP 200, 11개 Next static chunk, Chrome 데스크톱·모바일 hydration, 국내·해외 차트 API 및 인증 경계 smoke.
- 전체 Vitest: 222개 파일 중 221개 통과·1개 skip, 793 passed·1 skipped. 진행 원장/재개, 자동화 결과 상태, 운영 스키마 migration audit를 포함한 전용 테스트 28개도 통과했다.
- typecheck, docs/migration audit(V154·필수 운영 관계 23개), verify-scope, KIS boundary, Bearer auth, OCI cron 구조 게이트 통과. npm audit 취약점 0건.
- 임시 PostgreSQL 16에 V154 적용 및 SUCCESS/FAILED 상태 변경 쿼리를 확인했다. 작업 상태 SQL은 실제 PostgreSQL에서 정상 실행됐고, 애플리케이션 회귀는 별도 mocked resume 테스트로 검증했다.
- 임시 PostgreSQL 16 컨테이너에 V154를 적용하고 작업/항목 테이블 생성, SUCCESS 및 FAILED 원자 상태 SQL을 실행해 결과를 확인했다.
- `npm.cmd run docs:check` 통과: 마이그레이션 149개, 최신 V154, 필수 운영 관계 23개 확인.
- 전체 게이트 첫 회차에서 운영 스키마 migration audit의 고정 기대치가 신규 테이블 추가에 취약한 점을 확인했다. 총 개수 고정 검증을 제거하고 중복 부재, 신규 테이블의 명시적 포함, 전체 migration 관계 검증으로 바꿔 향후 테이블 추가 때 같은 수정 누락이 재발하지 않게 했다.

### 다음 개선
- 운영에서 다음 예약 갱신 후 `progress.resumed` 및 실제 KIS 호출 감소량을 실행 이력으로 비교하고, 실패 종목의 재시도 간격이 KIS rate-limit 정책과 맞는지 관측한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-18-006
- 성과 판정: IMPROVED
- 근거: 회귀 테스트에서 완료 종목은 KIS 재호출·재저장 없이 건너뛰고 미완료 종목만 재개함을 확인했다. 상태 마커는 데이터 저장과 원자적이며, 유니버스 변경·오류 카운터 이상도 안전한 상태로 분류된다. 운영에서의 실제 호출 감소량은 다음 갱신 기록으로 측정해야 한다.

### 커밋·푸시·배포
- 완료: 코드/마이그레이션 커밋 `ea518b81`을 `oci`에 푸시했고 Deploy OCI run `39107599219` 성공.
- 운영 관리자 디버그 API에서 Flyway V154(`instrument fundamental refresh progress`) 적용을 확인했다. `/api/health`와 `/charts`는 HTTP 200이며, 운영 전체 Fundamentals 갱신은 강제로 실행하지 않았다.
- 배포 후 실제 재개 호출 감소량은 다음 예약 Fundamentals 갱신 실행 이력에서 확인한다.

## [2026-10-18] Fundamentals 장시간 요청 경로 timeout 정렬

### 목표
- 전용 Fundamentals 자동화가 API route, reverse proxy, systemd 수명주기에서 상충하는 timeout·중복 억제 기준 때문에 조기 실패하거나 불필요한 재실행을 시도하지 않게 한다.

### 반영
- `deploy/oci/nginx-stockman.conf`: Fundamentals cron location에만 `proxy_read_timeout`/`proxy_send_timeout` 4시간 25분을 지정했다. 일반 route에는 장시간 proxy 연결 한도를 적용하지 않는다.
- `app/api/cron/instrument-fundamentals/route.ts`: RUNNING guard를 2시간에서 전용 service 한도보다 긴 5시간으로 늘렸다.
- `app/api/cron/instrument-fundamentals/route.test.ts`: 4시간 실행 중인 작업이 새로운 갱신으로 재진입하지 않는 회귀 테스트를 추가했다.
- `scripts/check-oci-cron.mjs`: Nginx의 경로별 timeout과 route 중복 억제 기준이 바뀌면 cron 구조 게이트가 실패하게 했다.
- `docs/operations/instrument-fundamentals-refresh.md`: 네트워크 계층별 timeout 순서와 공식 Nginx 근거를 기록했다.

### 근본 원인 및 영향
- Nginx 공식 기본 `proxy_read_timeout`은 60초이며, 연속 upstream read 사이의 제한이다. 장시간 응답을 내지 않는 전체 갱신이 public proxy 경유 요청이면 client curl 제한과 무관하게 proxy가 먼저 끊을 수 있었다. 시스템 runner 기본 URL은 loopback이지만, 구성 override 또는 직접 API 호출에서도 역방향 프록시 경로가 안전하도록 해당 API location을 명시적으로 정렬했다.
- 새 systemd oneshot은 4시간 30분을 허용하도록 분리됐지만 API route의 RUNNING guard는 2시간으로 남아 있었다. 실제 advisory lock은 중복 갱신을 막지만, 2시간 뒤 들어온 호출은 lock 경쟁과 불필요한 SKIPPED 실행 이력을 만들 수 있었다.

### 재발 감지 및 운영 기준
- timeout 순서는 curl 4시간 15분 < Nginx 전용 location 4시간 25분 < systemd 4시간 30분 < route/stale 실행 보호 5시간이어야 한다.
- `npm run cron:check`는 경로별 Nginx timeout과 service/route/stale 보호가 이 순서를 유지하는지 검사한다.
- 공식 출처: [Nginx proxy_read_timeout](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_read_timeout).

### 검증
- `npm.cmd run deploy:verify` 통과: 빌드/타입검사, 전체 786개 테스트 통과·1 skip, 정적·보안·cron 구조 게이트, standalone HTTP smoke와 Chrome 데스크톱·모바일 hydration.
- `docker run --rm --entrypoint nginx -v <설정파일>:/etc/nginx/conf.d/default.conf:ro nginx:1.24.0-alpine -t` 통과.

### 다음 개선
- 배포 후 실제 Nginx 설정 검사와 전용 route의 client disconnect/error 로그를 확인해 timeout을 넘는 upstream 처리 여부를 측정한다. 종목별 재개 상태 추적은 개선 과제 CI-2026-10-18-006에서 구현한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-18-005
- 성과 판정: UNMEASURED
- 근거: source 설정과 회귀 테스트를 보강했으며 운영 배포 후 동작 검증을 남겨 둔다.

### 커밋·푸시·배포
- 완료: 커밋 `a0cef874`를 `oci`에 push했고 Deploy OCI run `39105080396` 성공.
- 배포 후 `/api/health`와 `/charts` 모두 HTTP 200. 변경은 Nginx route 설정과 cron guard이며, 전체 갱신 실행은 강제로 유발하지 않았다.

## [2026-10-18] 장시간 시총 갱신을 전용 systemd 작업으로 분리

### 목표
- 운영에서 수십 분~수 시간 걸리는 전 종목 Fundamentals 갱신을 공유 5분 cron의 300초 HTTP timeout 및 다른 자동화 지연으로부터 분리한다.

### 반영
- `scripts/oci-cron.sh`: inline `instrument-fundamentals` 호출을 제거해 일반 RSS·캔들 cron이 장시간 API 응답을 기다리거나 다른 KIS 호출과 겹치지 않게 했다.
- `scripts/oci-fundamentals-cron.sh`: 전용 runner를 추가했다. 모듈 route 결과를 최대 4시간 15분 기다리고 HTTP/application 오류를 비정상 종료로 분류한다.
- `deploy/oci/stockman-fundamentals.service`, `stockman-fundamentals.timer`: 4시간 30분 oneshot 제한과 5분 persistent timer를 추가했다. 실제 일일 실행 시각/활성 여부는 기존 관리자 모듈 설정이 결정한다.
- `deploy/oci/stockman-activate`, `.github/workflows/deploy-oci.yml`: unit 설치·활성화·초기 실행 및 standalone release package 포함을 반영했다.
- `lib/automation-run-repository.ts`: 일반 자동화의 2시간 stale-run 기준으로 장시간 활성 Fundamentals 작업이 조기 실패 처리되지 않도록 해당 모듈의 stale/중복 실행 기준을 5시간으로 분리했다(4시간 30분 서비스 상한보다 김).
- `scripts/check-oci-cron.mjs`: 공유 cron에서의 회귀 호출, 전용 runner timeout, systemd unit/timer, 배포 패키징·활성화와 stale 기준 분리를 검사한다.
- `docs/operations/instrument-fundamentals-refresh.md`: 운영에서 얻은 실행 시간 분포와 전용 timer/관측 명령을 기록했다.

### 근본 원인 및 영향
- 운영 `/api/debug/automation-runs?module=instrument-fundamentals` 결과(2026-10-18 06:02 UTC 확인): 최근 성공 49회 평균 1,467,054ms, 중앙값 856,411ms(14.3분), p95 5,794,045ms(96.6분), 최장 8,328,211ms(138.8분). 별도로 `AUTOMATION_RUN_STALE` 실패 11건이 있었다.
- 공유 cron에서 이 작업을 300초 제한으로 호출하고 있었고, 5분마다 나머지 자동화를 순차 실행했다. 따라서 정상 전체 갱신 시간보다 HTTP 요청 제한이 짧았고, 연결 종료 후 다른 시장 데이터 작업이 겹칠 여지가 있었다.
- systemd 공식 문서에 따라 전용 oneshot의 `TimeoutStartSec`와 persistent calendar timer를 사용한다. systemd service timeout은 oneshot 활성화에도 적용되고, persistent timer는 중단 중 놓친 일정을 복구한다.

### 재발 감지 및 운영 기준
- `npm run cron:check`는 전용 호출/시간 제한과 systemd·배포 연결을 자동 검사한다.
- 운영 점검은 `systemctl status stockman-fundamentals.timer`, `journalctl -u stockman-fundamentals.service`, 관리자 실행 이력의 `durationMs`/상태를 사용한다.
- 4h15m runner timeout은 운영 최장 성공 2h19m보다 길고, 4h30m systemd startup timeout보다 짧다. 이는 관측값에 기반한 완충값이며 새로운 max 초과가 관측되면 다시 평가한다.
- 공식 근거: [systemd.service TimeoutStartSec](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html#TimeoutStartSec=), [systemd.timer Persistent](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html#Persistent=).

### 검증
- `npm.cmd run deploy:verify` 통과: 프로덕션 빌드 및 타입검사, 221개 테스트 파일(785 통과·1 skip), 정적/보안 게이트, cron 구조 검증, standalone `/charts` HTTP 200 및 Chrome 데스크톱·모바일 hydration 검증.
- Git Bash `bash -n`으로 공유/전용 cron runner 및 배포 activation 스크립트 문법 검증 통과.

### 다음 개선
- 배포 후 전용 timer/service 활성화 여부와 다음 실제 전체 갱신 duration을 운영 API 및 journal에서 검증한다. 4시간 timeout 초과나 `AUTOMATION_RUN_STALE` 재발 여부를 확인한다.
- 종목별 durable resume cursor는 남은 후속 개선이다. 현재 배치별 원자 저장으로 이미 반영된 배치는 보존되지만 실패 후 전체 종목을 다시 순회한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-18-004
- 성과 판정: IMPROVED
- 근거: 실제 성공시간 분포가 기존 300초 timeout보다 크게 길다는 운영 이력을 확인했고, 이 실행을 독립 timer/service로 옮겨 다른 자동화와 timeout 간섭을 구조적으로 차단한다.

### 커밋·푸시·배포
- 완료: 커밋 `0639d857`를 `oci`에 push했고 GitHub Actions Deploy OCI run `39103505050`이 성공했다.
- 운영 `/api/health`와 `/charts`는 배포 직후 모두 HTTP 200. 배포 activation은 `stockman-fundamentals.timer`의 `systemctl is-active` 검증까지 통과했다.
- 배포 직후 자동 실행 기록은 `outside_interval`로 SKIPPED(24시간 간격 중 41,995초 경과)였고 `RUNNING`/stale 항목은 0건이다. 따라서 이번 확인에서는 전체 갱신을 강제로 유발하지 않았다.

## [2026-10-18] 국내·해외 시가총액/재무 스냅샷 갱신 오류 방지

### 목표
- 종목 재무·시가총액 자동 갱신 중 누락 데이터를 0으로 오인하거나, KIS 오류/오래된 응답 및 부분 DB 실패를 성공으로 기록하는 문제를 차단한다.

### 반영
- `lib/instrument-fundamentals.ts`: 수치 파싱에서 빈 값·잘못된 숫자를 `null`로 보존하고, 활성 `COMMON_STOCK`와 제외 플래그를 DB 질의 및 애플리케이션 경계에서 이중 검증한다. 해외 KIS 응답은 HTTP 성공·`rt_cd=0`·비 stale 조건을 확인하고, 가격·시총 유효성 검사 후 저장한다. 200개 단위 수집/저장과 8개 provider worker로 메모리 상한을 두고, history+snapshot은 원자적 트랜잭션으로 저장하며 DB 배치는 최대 3회 재시도한다. 실행 결과에 provider/DB 시간, batch, 시도·성공·실패·미시도 수 및 시장별 요약을 기록한다.
- `lib/kis-kr-price-detail.ts`: 국내 KIS 수치 변환도 빈 문자열을 0으로 바꾸지 않도록 공통 nullable parser를 적용한다.
- `lib/automation-run.ts`, `app/api/cron/instrument-fundamentals/route.ts`: 실행 결과에 따라 SUCCESS/PARTIAL/FAILED/SKIPPED를 구분하고, 부분 실패는 성공한 갱신으로 오인하지 않도록 재시도 cooldown을 적용한다. 직전 실행 상태 조회 실패·잘못된 시각은 cron을 fail-closed 처리한다.
- `lib/instrument-fundamentals.test.ts`, `lib/kis-kr-price-detail.test.ts`, `lib/automation-run.test.ts`, `app/api/cron/instrument-fundamentals/route.test.ts`: 파서, 자격/상품 필터, KIS stale·업무 오류, 시총 누락, 원자적 배치, DB 재시도, 상태 분류와 cron 재실행 정책에 대한 회귀 테스트를 추가했다. 기존 자동화 요약 압축 테스트도 유지했다.
- `docs/operations/instrument-fundamentals-refresh.md`: 갱신 파이프라인, 데이터 무결성 규칙, 재시도·관측 및 남은 한계를 운영 기준으로 문서화했다.

### 근본 원인 및 영향
- `Number("")`가 0으로 해석되어 제공자가 필드를 누락한 상황과 실제 0을 구분하지 못했다. 특히 누락 시총이 snapshot을 덮어쓸 수 있었다.
- 해외 API 경로가 일부 stale/업무 오류 응답을 성공 데이터처럼 처리할 여지가 있었고, 국내·해외 대상을 `enabled` 외의 보통주/상품 제외 조건으로 충분히 방어하지 않았다.
- 모든 공급자 응답을 메모리에 모은 뒤 한꺼번에 저장해 장시간 실행 중단 시 앞서 받은 정상 데이터도 모두 유실될 수 있었다. history와 snapshot이 별도 쓰기라 한쪽만 반영될 수도 있었다.
- 자동화 wrapper가 개별 종목 실패 또는 lock skip에도 SUCCESS를 남겨 설정된 일일 실행 간격이 실패 후 재시도를 막을 수 있었다.

### 재발 감지 및 운영 기준
- 전용 회귀 테스트와 `npm.cmd run deploy:verify`를 배포 전 게이트로 사용한다. 관측상 `successCount`는 DB 트랜잭션 완료 행만 뜻하고, 전체 실패 수는 provider 실패 및 미시도 행까지 포함한다.
- 운영 실행 이력에서 PARTIAL/FAILED의 `failureCount`, `unattemptedCount`, `databaseFailure`, 시장별 실패 및 제한된 실패 샘플을 확인한다. 시총 누락은 기존 snapshot을 덮어쓰지 않고 오류로 드러나야 한다.
- 공식 KIS 샘플도 HTTP 응답과 `rt_cd` 성공 여부를 함께 검사한다: [한국투자증권 Open Trading API 공식 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/legacy/rest/current_price_samle.py).
- 남은 위험: 장시간 전체 종목 수집에 대한 durable resume cursor는 없다. DB 배치 실패 시 이미 커밋된 배치는 유지되며 실패/미시도 상태로 기록되고, 다음 실행에서 전체 목록을 다시 순회한다. KIS TPS와 실제 전체 실행 소요는 운영 갱신 이력의 provider 시간 및 duration을 관찰해 후속 최적화를 결정한다.
### 개선 과제
- 개선 과제 ID: CI-2026-10-18-002
- 성과 판정: IMPROVED
- 근거: 누락 수치·stale 응답·비보통주 대상·부분 저장/실행 상태를 각각 회귀 테스트로 고정했고, 성공 건수를 실제 커밋된 배치만 집계하도록 변경했다.

### 검증
- 전용 4개 테스트 파일: 24개 테스트 통과.
- `npm.cmd run deploy:verify`: 통과. npm audit 취약점 0건, Next production build, standalone 서버의 `/charts` HTTP 200, JS 청크 확인, desktop/mobile Chrome hydration, 핵심 API smoke 및 품질 게이트 전체 확인.
- 전체 Vitest: 221개 파일 중 220개 통과·1개 skip, 785 passed·1 skipped.
- typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth, OCI cron 구조 검증 통과.
- 배포 검증 과정에서 standalone 서버가 로컬 포트 56210으로 실제 기동되고 smoke 종료 후 정리됐다.
- `git diff --check`: 통과.

### 다음 개선
- 배포 후 운영 실행 이력에서 국내·해외별 실제 갱신 소요시간, 시총 누락률, PARTIAL/FAILED 비율을 확인한다. 전체 갱신이 cron 응답/서비스 제한시간에 접근하면, 재시도 가능한 durable cursor 또는 재개 작업 설계를 별도 검토한다.

### 커밋·푸시·배포
- 아직 미실행: 구현 및 전체 로컬 배포 게이트는 통과했으며, 운영 배포는 커밋·푸시 후 별도 확인한다.

## [2026-10-18] 해외 차트 모달의 거래소 누락 및 불필요한 KIS 대기 수정

### 목표
- 해외 티커 차트 모달이 무한 대기처럼 보이는 흐름을 줄이고, 저장된 일봉을 우선 표시하며 거래소별 KIS 조회를 단일 요청으로 제한한다.

### 반영
- `components/chart-modal.tsx`: 일봉·주봉·월봉 차트 요청에도 모달이 가진 해외 거래소 코드를 전달한다.
- `app/api/stock/chart/route.ts`: 해외 종목의 거래소를 활성 COMMON_STOCK 마스터에서 검증하고, 거래소가 확정된 종목에 한해 해당 거래소의 DB 캔들 캐시를 KIS보다 먼저 조회한다. 재무 요약의 캔들·스냅샷 쿼리도 거래소 조건으로 제한해 `(market, code, timeframe, candle_date)` 인덱스를 활용하도록 한다. 활성 보통주 또는 거래소를 확인할 수 없는 경우 KIS 거래소 순차 probing을 중단하고 명시적인 오류 상태를 반환한다.
- `app/api/stock/chart/route.test.ts`, `components/chart-modal.test.tsx`: 거래소 미지정 시 마스터 기반 단일 KIS 요청, 캐시 우선 반환, 자격 확인 실패의 fail-closed, 클라이언트 거래소 전달 회귀 테스트를 추가했다.

### 근본 원인 및 영향
- 모달이 분봉 요청에는 거래소를 전달했지만 일·주·월봉 `/api/stock/chart` 요청에는 전달하지 않았다. 서버는 거래소가 없는 해외 티커를 NAS/NYS/AMS 순서로 최대 3회 KIS 조회했고, 로컬 DB 캔들도 KIS 요청 뒤에 조회했다. KIS 개별 요청 timeout이 30초이므로 캐시가 있어도 모달이 오래 로딩되거나 여러 요청이 연속 대기할 수 있었다.
- 이제 모달 거래소 정보를 우선 전달하고, 직접 호출 등 거래소가 빠진 요청은 공식 활성 보통주 마스터에서 거래소를 찾는다. 로컬 DB 캐시가 존재하면 외부 KIS 조회를 생략하고, 거래소 정보가 모호하거나 종목을 확인할 수 없으면 무분별한 시장 요청 대신 422/503 JSON으로 종료한다.
- 첫 배포 후 실운영 AAPL 차트 요청이 45초 내 응답하지 않는 것을 확인했다. 운영 admin 진단 API에서는 DB health 약 207ms, 최근 KIS 일봉 호출 79~379ms와 유효 토큰을 확인했으며, 차트의 재무 보조 쿼리가 거래소 필터 없이 대형 캔들 테이블을 읽는 경로를 추가 원인으로 좁혔다. 수정 후 실운영 차트 API를 다시 검증한다.

### 재발 감지 및 운영 기준
- API 회귀 테스트에서 해외 티커의 거래소 미지정 요청이 마스터 조회 후 KIS를 정확히 한 번만 부르는지, DB 캐시 적중 시 KIS를 전혀 호출하지 않는지, 마스터 미확인 시 KIS 호출을 차단하는지 고정 검증한다.
- 모달 테스트는 선택된 NAS/NYS/AMS 거래소가 `/api/stock/chart` URL에 포함되는지 확인한다. `Server-Timing`의 `instrument-master`, `db-cache`, `kis` 구간을 운영 응답에서 비교해 지연 구간을 판별할 수 있다.
- 남은 위험: DB 캐시가 없고 KIS가 느리거나 무응답이면 해당 단일 KIS 호출은 기존 30초 timeout까지 대기할 수 있다. 재무 보조 쿼리 필터 추가 후에도 운영 차트 요청이 느리면 단계별 Server-Timing과 SQL 실행계획을 재확인한다.

### 검증
- `npm.cmd test -- --run app/api/stock/chart/route.test.ts components/chart-modal.test.tsx`: 2개 파일, 15개 테스트 통과.
- `npm.cmd run typecheck`: 통과.
- 첫 구현 커밋 `36debb92`의 `npm.cmd run deploy:verify` 및 Deploy OCI run `39097027526`는 통과했으나, 운영 AAPL 일봉 직접 호출이 45초 timeout되어 추가 원인을 수정 중이다. 해당 배포 중 일시 502가 있었지만 workflow 성공 뒤 health는 200으로 복구됐다.
- 거래소 필터를 재무 요약 쿼리까지 확장한 후 전용 테스트 15개, `npm.cmd run typecheck`, `npm.cmd run docs:check`, `git diff --check` 통과.
- 수정본 `npm.cmd run deploy:verify`: 통과. 의존성 감사 0건, production build, standalone `/charts` HTTP 200·11개 JS 청크·Chrome desktop/mobile hydration, 핵심 API smoke, 전체 Vitest 218개 파일(763 passed·1 skipped), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth, cron 검사 확인.
- 운영 배포: 커밋 `b960d522`의 Deploy OCI run `39098354489`가 성공했고 운영 `/api/health`와 `/charts` 모두 HTTP 200이다.
- 실운영 AAPL 차트 API를 직접 호출해 HTTP 200, 총 1,629ms, `Server-Timing` 차트 911ms를 확인했다. 단계별 시간은 활성 종목 마스터 113ms, 원격 캐시 490ms, DB 캔들 192ms, 재무 요약 114ms다. 45초 timeout에서 정상 응답으로 회복했으며 153개 봉, 마지막 거래일 2026-10-16, 출처 `KIS_OVERSEAS_PRICE`, 재무 상태 `AVAILABLE`을 확인했다.
- `git diff --check`: 통과.

### 다음 개선
- 배포 후 해외 차트 API의 `Server-Timing`과 KIS timeout/빈 응답 비율을 확인하고, DB 캐시 미스 경로의 사용자 대기시간이 반복적으로 길면 관측값에 근거해 별도 응답시간 개선을 설계한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-18-001
- 성과 판정: IMPROVED
- 근거: 해외 거래소 순차 조회를 활성 보통주 마스터 기반 단일 거래소 요청으로 바꾸고 저장 캔들 캐시를 외부 API보다 먼저 조회하도록 회귀 테스트를 추가했다.

### 커밋·푸시·배포
- 완료: 구현 커밋 `b960d522`를 `https://github.com/pjtss/StockMan.git`의 `oci` 브랜치에 푸시했고 Deploy OCI run `39098354489`가 성공했다. 운영 health, `/charts`, AAPL 해외 차트 API의 HTTP 200 및 1.6초 응답을 검증했다.

## [2026-10-17] SEC AI 평가 요청의 시간·응답 크기 제한 추가

### 목표
- SEC AI 평가가 OpenAI 응답 지연 또는 비정상적으로 큰 응답 때문에 cron 작업 시간과 메모리를 과도하게 점유하지 않도록 한다.

### 반영
- `lib/sec-ai-evaluator.ts`: 요청 timeout 기본 45초·최대 120초, API 출력 상한 6,000 토큰, 응답 본문 상한 512 KiB를 설정했다. content-length 선검사와 스트리밍 실제 byte 검사를 모두 적용하며, timeout/network/body-read/초과 크기는 명시적인 skip 결과로 반환한다.
- `.env.example`, `docs/sec-edgar-official-reference.md`: timeout 환경변수와 제한 정책을 문서화했다.
- `lib/sec-ai-pipeline.test.ts`: timeout 설정 전달, timeout 실패, 헤더 길이 초과 및 content-length 없는 스트림 초과 회귀 테스트를 추가했다.

### 근본 원인 및 영향
- 기존 evaluator는 OpenAI Responses API `fetch`와 `response.text()`에 시간·본문 크기 한계가 없었다. 단일 분석 요청이 지연되거나 큰 응답을 반환하면 순차 cron 처리 지연과 메모리 사용량 증가로 이어질 수 있었다.
- 공식 Responses API는 `max_output_tokens`를 제공한다. 이번 변경은 토큰 상한과 별도로 전송된 실제 본문 byte도 제한해 헤더 누락·불일치 상황까지 방어한다.

### 재발 감지 및 운영 기준
- Vitest가 요청의 AbortSignal, timeout 환경변수 상한 전달, 크기 헤더 선검사와 스트리밍 초과를 자동 확인한다.
- 제한 초과는 분석 결과를 성공으로 오인하지 않고 skip 처리한다. 운영 timeout 조정은 `SEC_AI_REQUEST_TIMEOUT_MS`로 하며 값은 최대 120초로 clamp 된다.
- 남은 위험: 외부 API의 45초 timeout이 특정 운영 지연 구간에서 skip을 늘릴 수 있다. 배포 후 skip 비율과 처리 시간을 관찰하고 필요 시 실제 분포에 근거해 설정을 조정한다.

### 검증
- 전용 `npm.cmd test -- --run lib/sec-ai-pipeline.test.ts`: 6/6 통과.
- 전체 `npm.cmd run deploy:verify`: 통과. npm audit 취약점 0건, Next production build, standalone `/charts` HTTP 200 및 desktop/mobile hydration, 국내·해외 chart API 200, 관리자/cron 비인증 API 401, Vitest 217개 파일(759 passed·1 skipped), typecheck, docs/migration, verify-scope, KIS boundary, bearer-auth, cron 검사 통과.
- `git diff --check`: 통과.
- 공식 근거: [OpenAI Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create), [Node.js AbortSignal.timeout](https://nodejs.org/docs/latest/api/globals.html#static-method-abortsignaltimeoutdelay).

### 다음 개선
- SEC AI 평가 요청의 timeout, 응답 크기, skip 원인을 개인정보·비밀키 없이 구조화 지표로 기록해 운영 설정을 관찰 데이터로 조정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-17-003
- 성과 판정: IMPROVED
- 근거: 무제한 요청 대기와 무제한 응답 buffering 경계를 제한하고 실패 유형별 자동 회귀 감지를 추가한다.

### 커밋·푸시·배포
- 완료: 코드 커밋 `5fb60eac`를 `oci` 브랜치에 푸시했고 GitHub Actions Deploy OCI run `39023232871` (#1038)이 성공했다.
- 운영 확인: `https://stockman.r-e.kr/api/health`에서 JSON `status: ok` 및 HTTP 200, `/charts` HTTP 200 확인.

## [2026-10-17] SEC 원문 수집의 무제한 대기·응답 크기 경계 보강

### 목표
- SEC 공시 원문 fetch가 네트워크 지연/비정상 대용량 본문에서 프로세스 시간과 메모리를 무제한 점유하지 않도록 공용 수집 경계를 보강한다.

### 반영
- `lib/sec-raw-document.ts`: SEC HTTPS host 검증, `SEC_REQUEST_TIMEOUT_MS`(기본 15초, 최대 120초) timeout signal, `SEC_DOCUMENT_MAX_BYTES`(기본 32 MiB, 최대 128 MiB) 응답 크기 한도를 적용한다.
- `Content-Length`가 있으면 본문을 읽기 전에 거부하고, 없거나 거짓이어도 스트림을 읽으며 byte 수를 확인해 상한 초과 시 reader를 취소한다.
- `lib/sec-raw-document.test.ts`: 비SEC URL 외부 fetch 차단, timeout signal 사용, 선언 길이 초과, content-length가 없는 streaming 초과를 자동 검증한다.

### 근본 원인 및 영향
- 공용 `fetchSecRawDocument`가 `fetch(url)` 및 `response.text()`를 그대로 사용해 요청 timeout·본문 크기 상한이 없었다. 호출자 일부의 SEC URL 검증만으로는 앞으로 추가될 다른 호출 경로까지 보장되지 않는다.
- SEC 응답이 멈추거나 예상 밖으로 커지면 cron/관리자 공시 분석 처리 지연, 메모리 사용 급증, 주변 요청의 자원 경쟁을 일으킬 수 있다.

### 재발 감지 및 운영 기준
- 새 테스트가 URL, timeout signal, 헤더 기반 및 스트리밍 byte 제한을 보장한다. 모든 SEC 원문 수집은 이 단일 함수 경계를 사용한다.
- timeout은 기존 SEC JSON API와 같은 기본 15초 정책을 사용하며 운영 필요 시 `SEC_REQUEST_TIMEOUT_MS`로 조절한다. 본문 기본 상한은 32 MiB이며 더 큰 공식 제출 자료가 반복적으로 확인되면 원문 크기 분포를 측정한 후 한도를 조정한다.
- SEC 공식 fair-access 기준에 따라 요청 간격 제한 정책을 유지하고 이번 변경은 SEC 호출률을 높이지 않는다.

### 검증
- 전용 `npm.cmd test -- --run lib/sec-raw-document.test.ts`: 4/4 통과. SEC URL 차단, timeout duration 전달, 헤더 길이 초과 및 chunk 스트림 길이 초과를 검증했다.
- 전체 `npm.cmd run deploy:verify`: 통과. npm audit 취약점 0건, Next production build 성공, standalone `/charts` HTTP 200 및 desktop/mobile hydration 성공, 관련 public API 200·관리자/cron 비인증 API 401, Vitest 217개 파일(756 pass/1 skip), typecheck, docs/migration, verify-scope, KIS boundary, bearer-auth 및 cron 체크 통과.
- 참고: [SEC EDGAR fair access](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data), [Node.js AbortSignal.timeout](https://nodejs.org/docs/latest/api/globals.html#static-method-abortsignaltimeoutdelay).

### 다음 개선
- SEC 원문 fetch timeout/byte cap 발생 건수와 body byte 분포를 구조화된 진단 지표로 축적해 기본 제한을 실제 운영 데이터에 기반해 조정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-17-002
- 성과 판정: IMPROVED
- 근거: 공용 SEC 원문 경계에서 비SEC 목적지, 무제한 대기, 무제한 본문 읽기 위험을 각각 제한하고 회귀 테스트로 재발을 감지한다.

### 커밋·푸시·배포
- 운영 배포 완료: 구현 커밋 `bcdfb35c974b725e1292fa1360bca6f54a5bcc65`를 `oci`에 푸시했고 Deploy OCI run `39021208045`가 `Success`로 종료됐다. 운영 `/api/health`는 `ok`, `/charts`는 HTTP 200으로 확인했다.

## [2026-10-17] 미사용 취약 개발 의존성 제거 및 배포 감사 게이트 추가

### 목표
- `npm ci`가 보고한 중간 수준 취약점 4건을 원인 분석하고 실제 도달 가능한 취약 경로를 제거한다.

### 반영
- 저장소 코드·스크립트·문서 검색에서 `drizzle-kit` 사용처를 찾지 못해 미사용 개발 의존성으로 판정하고 `package.json` 및 lockfile에서 제거했다. ORM 런타임 의존성 `drizzle-orm`은 유지한다.
- `package.json`에 `audit:dependencies`를 추가하고 `scripts/verify-deploy.mjs`에서 build 전 첫 검증 게이트로 실행한다. 설치 단계의 `npm ci --no-audit`가 감사를 생략해도 moderate 이상 취약점이면 배포 검증이 실패한다.

### 근본 원인 및 영향
- `drizzle-kit@0.31.11` → 폐기된 `@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → 취약 `esbuild@0.18.20` 경로가 있었다.
- GitHub Advisory `GHSA-67mh-4wv8-2f99`는 esbuild `<=0.24.2`에 해당하고 `0.25.0`부터 수정됐다. npm은 동일 advisory가 연결된 패키지 노드 4개를 moderate 취약점으로 집계했다.
- 영향 경로는 개발 도구 의존성이며 `npm audit --omit=dev`는 변경 전에도 0건이었다. 운영 런타임 취약점으로 과장하지 않고, 미사용 개발 도구 제거로 공급망 경고도 해소했다.

### 검증
- 변경 전 `npm audit`: moderate 4건(동일 GHSA의 종속 패키지별 중복 항목); 변경 후 `npm ci` 및 전체 `npm audit`: 취약점 0건. `npm audit --omit=dev`도 0건이다.
- 새 `audit:dependencies` 게이트는 `npm audit --audit-level=moderate`를 실행하고 현재 lockfile에서 0건으로 통과했다.
- 검증 중 첫 실행은 `docs:check`가 본 로그의 필수 섹션 계약 누락을 찾아 실패했다. 로그 계약을 보완한 뒤 테스트 단독 실행과 최종 `npm.cmd run deploy:verify`를 다시 수행했다.
- 최종 `deploy:verify` 게이트 통과: audit 0 취약점, production build 성공, standalone 서버 시작 5.9초 및 `/charts` HTTP 200, Chrome 데스크톱·모바일 hydration 성공, 국내·해외 차트 API 기대 응답, 관리자 API 401 보호, Vitest 216개 파일(752 pass/1 skip), 타입 검사, 문서·마이그레이션·KIS 경계·인증·cron 검사 통과.
- 참고: [GitHub esbuild advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99), [Drizzle upstream issue](https://github.com/drizzle-team/drizzle-orm/issues/5145).

### 다음 개선
- future dependency 추가에서 audit gate가 인터넷 기반 npm audit metadata에 접근할 수 있어야 한다. 네트워크 장애도 fail-closed로 검증 실패가 되며, 이 동작을 임의로 무시하지 않는다.
- CI 로그가 같은 advisory로 인해 중복 집계되는 건수를 별도 요약하도록 개선할지 검토하되, 현재는 npm 원본 report를 그대로 보존한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-17-001
- 성과 판정: IMPROVED
- 근거: 재현된 moderate 취약점 4건을 0건으로 줄였고, 이후 moderate 이상 취약점 재유입을 `deploy:verify` 시작 단계에서 차단하도록 자동 게이트를 연결했다.

### 커밋·푸시·배포
- 구현 커밋 `60d9c6dc170b26f8774c3d8e19d86f6d84678954`를 `oci`에 푸시했다. Deploy OCI run `39019154471` 성공으로 운영 배포 완료. 운영 `/api/health`, `/health-check`, `/charts` 모두 HTTP 200.

## [2026-10-16] 차트 브라우저 검증에서 실제 클라이언트 상호작용 확인

### 목표
- 개선 과제 ID: CI-2026-10-16-032
- `/charts`의 HTML 요소가 보이는 것만으로 hydration 성공을 간주하지 않고, React 이벤트 처리와 사용자 상태 전환까지 배포 전에 증명한다.

### 반영
- Chrome smoke가 데스크톱·모바일에서 국내/해외 시장 버튼을 클릭하고 티커 입력창 placeholder가 양방향으로 전환되는지 기다리도록 강화했다. 외부 데이터 조회·DB 쓰기 없이 클라이언트 hydration과 state update를 검증한다.
- 배포 체크리스트와 검증 표준 문서에 이 브라우저 상호작용 게이트 및 설치 Chrome 의존성을 반영했다.

### 근본 원인 및 재발 방지
- 근본 원인: 기존 smoke의 visible selector 검사는 SSR HTML만으로도 통과할 수 있어, 실제 클라이언트 이벤트 핸들러가 연결되지 않은 상태를 구별하지 못했다. 또한 운영 문서가 새 브라우저 게이트와 동기화되지 않았다.
- 재발 감지: 시장 전환 버튼 동작 및 입력 안내의 양방향 변화가 실제 브라우저에서 확인되지 않거나 hydration/runtime 오류가 발생하면 `deploy:verify`를 실패시킨다. 운영 문서의 검증 순서도 코드 게이트와 함께 갱신한다.
- 남은 위험: smoke는 `/charts` 첫 화면의 핵심 상태전환까지만 검증하고 차트 모달의 데이터 조회·렌더링 상호작용 전체를 다루지 않는다.

### 검증
- 배포된 `/charts`에 `runChartsBrowserSmoke`를 직접 실행: desktop/mobile 모두 시장 버튼 전환 후 입력 안내 변경 확인.
- `npm.cmd run docs:check`: 통과. 18개 entry point, 148개 migration, 21개 operational relation 확인.
- `git diff --check`: 통과.
- `npm.cmd run deploy:verify`: 통과. production build, standalone `/charts` 및 11개 JavaScript chunk, desktop/mobile Chrome 상호작용 smoke, 핵심 API smoke, 테스트 216개 파일(215 passed·1 skipped; 746 tests passed·1 skipped), 타입·문서·검증 범위·KIS 경계·Bearer 인증·cron 게이트.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 단순 SSR 요소 표시에서 국내↔해외 버튼 이벤트를 통한 실제 client state 변화로 검증 강도를 높였다.

### 다음 개선
- 브라우저 스모크에 차트 모달 열기·닫기 및 읽기 전용 차트 데이터 렌더링을 추가할 필요가 있는지, 테스트 비용과 API 부작용을 확인해 설계한다.

### 커밋·푸시·배포
- 완료: 코드 커밋 `aaa21ed47ccdcf80d1d901164ed4c160e7c8847d`를 `oci`에 푸시했다. Deploy OCI run `38907280342` 성공. 운영 `https://stockman.r-e.kr/api/health`는 `ok`; 운영 `/charts` desktop/mobile Chrome 상호작용 smoke도 통과.

## [2026-10-16] JavaScript 청크 smoke의 MIME 판별 엄격화

### 목표
- 개선 과제 ID: CI-2026-10-16-031
- 정적 청크 smoke가 JavaScript가 아닌 응답을 잘못 정상 처리하지 않도록 MIME 검사를 정확한 미디어 유형 allowlist로 제한한다.

### 반영
- `scripts/next-static-assets.mjs`가 Content-Type의 미디어 유형 부분만 파싱해 IANA에 등록된 JavaScript 및 기존 ECMAScript 유형과 정확히 비교한다. 대소문자 및 `charset` 파라미터는 허용한다.
- `application/notjavascript` 유사 문자열 거부와 등록된 MIME 유형 허용 회귀 테스트를 추가한다.

### 근본 원인 및 재발 방지
- 근본 원인: 이전 검사는 Content-Type 전체에서 `javascript` 또는 `ecmascript` 문자열의 포함 여부만 확인해 `application/notjavascript` 같은 유사 MIME도 통과시킬 수 있었다.
- 재발 감지: media type exact-match 회귀 사례를 helper 테스트에 고정하고 standalone smoke에 동일 검증을 적용한다.
- 남은 위험: Content-Type은 서버 선언만 검증하며 본문 코드의 실행·브라우저 hydration까지 검증하지 않는다.

### 검증
- `npm.cmd test -- --run scripts/next-static-assets.test.ts`: 2개 통과.
- 최초 `npm.cmd run docs:check`: 실패. 최신 로그의 검증란에 실행 가능한 검사 명령이 아직 없어 문서 계약이 이를 차단했다. 현재 이 항목에 명령 결과를 기록했으며 재실행한다.
- 수정 후 `npm.cmd run docs:check`: 통과. 21개 operational relation과 148개 migration 확인.
- 전체 `npm.cmd run deploy:verify`: 통과. production build, standalone 실행과 API smoke, 216개 테스트 파일(746 passed, 1 skipped), 타입·문서·인증·KIS 경계·cron 게이트 통과.
- standalone `/charts`가 참조하는 11개 JavaScript 파일 전체가 HTTP 200·JavaScript content-type·비어 있지 않은 본문으로 응답함을 확인.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: `application/notjavascript`가 거부되고 등록된 미디어 유형 및 charset이 수용되는 회귀 테스트를 통과했다.

### 다음 개선
- 핵심 페이지의 브라우저 hydration 검증을 위해 현재 CI에서 사용할 수 있는 브라우저 런타임 및 라이선스·운영 비용을 평가한다.

### 커밋·푸시·배포
- 완료: 코드 커밋 `7a1d25e7fc69e34a0d5dedd644b3e404c162c63d`를 `oci`에 푸시했다. GitHub Actions run `38871216557` 성공. 운영 `/api/debug/health`에서 동일 커밋, HTTP 200, Flyway 153, 누락 operational relation 없음을 확인했다.

## [2026-10-16] standalone 배포 검증에 실제 Next.js 청크 요청 추가

### 목표
- 개선 과제 ID: CI-2026-10-16-030
- `/charts`의 HTML 성공만으로 배포 검증이 통과하는 허점을 막고, HTML이 참조하는 클라이언트 JavaScript도 standalone 런타임에서 실제 로드 가능한지 검증한다.

### 반영
- `scripts/next-static-assets.mjs`에 HTML에서 Next static JavaScript 경로를 추출하고 응답 상태·content-type·본문 길이를 검사하는 순수 함수를 추가했다.
- `scripts/verify-deploy.mjs`의 standalone smoke가 `/charts` HTML 응답 후 중복 제거된 모든 `/_next/static/*.js` 스크립트를 요청해 HTTP 200, JavaScript 응답 유형, 비어 있지 않은 본문을 확인하게 했다. 시작 직후 HTML을 받을 때까지 기존 재시도 동작도 보존했다.
- 경로 추출 및 404·잘못된 content-type·빈 본문 거부 회귀 테스트를 추가하고 배포 체크리스트·검증 표준을 실제 자동 게이트와 맞췄다.

### 근본 원인 및 재발 방지
- 근본 원인: 체크리스트와 이전 오류 대응 문서는 HTML에서 실제 JS 경로를 검사한다고 설명했지만 실행기는 `/charts`의 HTML만 성공 확인했다. JS 파일 누락·404·HTML fallback이 있어도 배포 전 게이트가 통과할 수 있었다.
- 재발 감지: `deploy:verify` standalone runtime에서 HTML이 실제 선언한 모든 Next static JS 경로를 가져오고, 회귀 테스트로 비정상 응답 유형을 차단한다.
- 남은 위험: 이 smoke는 화면 렌더링/상호작용과 브라우저 내 hydration까지 검증하지 않는다. 향후 핵심 화면 브라우저 E2E를 별도 평가한다.

### 검증
- `npm.cmd test -- --run scripts/next-static-assets.test.ts`: 2개 통과.
- `npm.cmd run docs:check`: 통과. 21개 operational relation, 148개 migration 파일 확인.
- 전체 `npm.cmd run deploy:verify`: 통과. production build, standalone 실행 및 API smoke, 216개 테스트 파일(746 passed, 1 skipped), 타입·문서·인증·KIS 경계·cron 검사를 확인.
- standalone `/charts`: HTTP 200, 실제 HTML 참조 JavaScript 청크 11개 모두 HTTP 200·JavaScript content-type·비어 있지 않은 응답 본문 확인.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 기존에 전혀 요청하지 않던 `/charts`의 11개 JavaScript 청크가 standalone smoke에서 모두 정상 응답함을 실측했다.

### 다음 개선
- `/charts` 주요 상호작용 및 hydration을 브라우저 E2E로 검증할 수 있는 기존 CI 실행 기반을 확인한다.

### 커밋·푸시·배포
- 완료: 커밋 `5baf7028855fb7c7e3be261c668858af84b61d25`를 `oci`에 푸시했다. Actions run `38867577186`의 Verify, 패키징, 업로드가 성공했고 운영 `/api/debug/health`가 동일 커밋(HTTP 200, Flyway 153, 누락 relation 없음)을 실행하는 것을 확인했다. 운영 교체 확인 시점의 Actions 최종 상태는 아직 종료 전이었다.

## [2026-10-16] operational schema spread 상수 누락을 migration 감사에 반영

### 목표
- 개선 과제 ID: CI-2026-10-16-029
- 공통 core 테이블까지 포함한 실제 operational schema 전체를 migration 이력 감사 대상으로 만들고, 빠진 핵심 테이블 생성을 배포 전에 차단한다.

### 반영
- 감사기가 `OPERATIONAL_SCHEMA_TABLES`의 `...CORE_SCHEMA_TABLES` spread를 재귀적으로 해석하도록 수정했다. 미정의·순환 spread 참조도 명확한 오류로 실패시킨다.
- `flyway_schema_history`는 애플리케이션 migration이 아니라 Flyway 자체가 소유하는 외부 관리 relation임을 명시적 예외로 지정했다.
- 감사 개수를 문자열 직접 항목 수에서 해석된 전체 relation 수로 바꿨다. 실제 21개(공통 8 + 추가 13)를 검사한다.
- core migration 누락 fixture를 포함해 회귀 테스트를 보강했다.

### 근본 원인 및 재발 방지
- 근본 원인: CI-027/028 감사기는 배열 본문에서 문자열 리터럴만 읽어 `...CORE_SCHEMA_TABLES` 안의 필수 relation 8개를 빠뜨렸다. 성공 메시지의 13은 전체 operational 목록이 아니라 spread를 제외한 직접 선언만 센 값이었다.
- 재발 감지: 배열 참조 재귀 해석을 감사의 단일 진입점으로 사용하고, core 목록 migration 제거 음성 테스트와 정의되지 않은/순환 참조 테스트를 고정한다.
- 남은 위험: relation DDL 감사는 조건부·동적 SQL과 실제 DB 적용 결과를 대체하지 않는다. 운영 health 및 Flyway 검증을 계속 병행한다.

### 검증
- `npm.cmd run docs:check`: 21개 전체 operational relation을 해석해 migration 상태 검사 통과.
- `npm.cmd test -- --run scripts/operational-schema-migration-audit.test.ts`: 7개 통과, core relation migration 누락을 음성 케이스에서 검출.
- 전체 `npm.cmd run deploy:verify`: 통과. 빌드·standalone 스모크, 215개 테스트 파일(744 passed, 1 skipped), 타입·문서·보안·cron 검사를 확인.
- GitHub Actions Deploy OCI run `38863953972`: Verify deployment, standalone package, upload release, activate release 모두 성공.
- 운영 `/api/debug/health`: HTTP 200, commit `79d1028503963ac361f83ba8f5631e31afa85949`, Flyway 153, 누락 operational relation 없음.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 이전에는 미검사 상태였던 core 스키마 8개도 migration 감사에 포함되고 누락 시 실패한다.

### 다음 개선
- 필수 operational column의 `ADD/DROP/RENAME` 이력도 같은 방식으로 검증할지 검토한다.

### 커밋·푸시·배포
- 코드·테스트 커밋: `79d1028503963ac361f83ba8f5631e31afa85949` (`oci` 푸시 완료).
- OCI 배포: 성공 (GitHub Actions run `38863953972`).
- 운영 health/Flyway 검증: 성공 (commit `79d10285`, Flyway 153, 누락 relation 없음).

## [2026-10-16] operational relation 감사에서 후속 DROP/RENAME 추적

### 목표
- 개선 과제 ID: CI-2026-10-16-028
- 필수 operational relation이 과거 migration에서는 생성됐지만 이후 제거·이름 변경되어 현재 누락되는 경우도 배포 전에 감지한다.

### 반영
- migration 파일을 버전 순서로 정렬하고 CREATE TABLE/VIEW, DROP TABLE/VIEW, ALTER TABLE RENAME 이벤트를 추적하도록 감사 로직을 확장했다.
- 호환성 VIEW는 유효 relation으로 인정하고, 마지막 migration 상태에서 제거된 필수 relation은 `docs:check`를 실패시킨다.
- 이후 DROP 후 VIEW 대체, 마지막에 DROP된 relation, RENAME source/destination을 포함한 회귀 테스트를 추가했다.

### 근본 원인 및 재발 방지
- 근본 원인: 최초 감사는 migration 전체에 생성 구문이 한 번이라도 있으면 통과시켜 후속 DROP/RENAME으로 현재 relation이 사라지는 경우를 놓칠 수 있었다. 국내·해외 universe migration은 물리 테이블을 compatibility view로 대체하므로 TABLE-only 검사도 부정확했다.
- 재발 감지: ordered migration relation state를 docs:check 및 deploy:verify에 연결하고 CREATE/DROP/RENAME 회귀 케이스를 자동 검사한다.
- 남은 위험: SQL 감사는 단순 DDL 패턴 분석이며 조건부 DO 블록, 동적 SQL, 외부 관리 스키마의 실행 결과를 완전히 해석하지 않는다. 운영 schema health 점검을 함께 유지한다.
- 후속 발견: 이 시점의 감사는 `...CORE_SCHEMA_TABLES` spread를 펼치지 않아 직접 표기된 13개만 세었다. 이 누락은 CI-2026-10-16-029에서 바로잡는다.

### 검증
- `npm.cmd run docs:check`: 13개 operational relation이 버전순 migration 적용 후 존재하고 있음을 확인.
- `npm.cmd test -- --run scripts/operational-schema-migration-audit.test.ts`: 5개 통과 (최종 DROP, rename source, drop 후 view 대체 등).
- 전체 `npm.cmd run deploy:verify`: 통과. 빌드·standalone 스모크, 215개 테스트 파일(742 passed, 1 skipped), 타입·문서·보안·cron 검사 통과.
- GitHub Actions Deploy OCI run `38860665063`: Verify deployment, standalone package, upload release, activate release 모두 성공.
- 운영 `/api/debug/health`: HTTP 200, commit `720dc34d29a67154374da5498b53e4cb8e4b911b`, Flyway 153, 누락 operational table 없음.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: CREATE 이력 존재 여부만 검사하던 기존 감사가 후속 DROP/RENAME과 호환 뷰 전환을 순서대로 검증한다.

### 다음 개선
- ALTER TABLE DROP COLUMN과 필수 operational 컬럼 요구 목록 간 같은 시간순 검증을 추가할지 평가한다.

### 커밋·푸시·배포
- 코드 및 회귀 테스트 커밋: `720dc34d29a67154374da5498b53e4cb8e4b911b` (`oci` 푸시 완료).
- OCI 배포: 성공 (GitHub Actions run `38860665063`).
- 운영 health/Flyway 확인: 성공 (commit `720dc34d`, Flyway 153, 누락 테이블 없음).

## [2026-10-16] operational schema 필수 테이블의 migration 커버리지 자동 검사

### 목표
- 개선 과제 ID: CI-2026-10-16-027
- 헬스체크 필수 테이블이 선언만 되고 DB 생성 migration은 누락되는 회귀를 정적 품질 게이트에서 차단한다.

### 반영
- `scripts/check-docs.mjs`가 `lib/schema-health.ts`의 `OPERATIONAL_SCHEMA_TABLES`를 읽고 버전 순서대로 migration DDL을 추적해 최종 relation이 존재하는지 검사하도록 했다.
- 테이블 목록 선언을 찾지 못하거나 migration 생성문이 없는 테이블이 있으면 `docs:check` 및 `deploy:verify`를 실패 처리한다.

### 근본 원인 및 재발 방지
- 근본 원인: 기존 테스트는 필수 테이블이 operational 목록에 포함되었는지는 확인했지만, 해당 테이블을 실제 생성하는 migration이 저장소에 있는지 연결 검증하지 않았다. 따라서 V153 전의 디버그 테이블 누락 유형을 코드 리뷰 실수만으로 막을 수 없었다.
- 재발 감지: migration filename/버전 점검과 같은 `docs:check` 자동 게이트에서 operational table 선언과 DDL을 교차 검사한다.
- 남은 위험: 이 정적 검사만으로 운영 DB의 실제 적용 상태나 테이블 컬럼/제약조건 동등성은 증명하지 않는다. 운영 상태는 Flyway validate/migrate 및 schema health API로 확인한다.
- 후속 발견: 당시 성공 메시지의 13개는 배열의 직접 항목만 센 수였고, spread된 core relation 8개는 검사에서 누락됐다. CI-2026-10-16-029에서 전체 21개를 대상으로 수정한다.

### 검증
- `npm.cmd run docs:check`: 13개 operational relation의 버전순 migration 상태 검사 성공.
- `npm.cmd test -- --run scripts/operational-schema-migration-audit.test.ts`: 5개 통과. 저장소 전수검사, 누락 음성 케이스, schema-qualified/quoted DDL, DROP 후 VIEW 대체, 최종 DROP 및 RENAME 케이스를 확인.
- 전체 `npm.cmd run deploy:verify`: 통과. 빌드, standalone 런타임 스모크, 전체 215개 테스트 파일(740 passed, 1 skipped), 타입 검사 및 기존 문서/보안/cron 게이트 성공.
- GitHub Actions Deploy OCI run `38854348257`: Verify deployment, standalone package, upload release, activate release 모두 성공.
- 운영 `/api/debug/health`: HTTP 200, commit `268a0dbaaa5611ea61ceb9fdcc06f027353dcaff`, Flyway 153, 누락 operational table 없음.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 13개 필수 operational relation 전체를 버전순 migration 결과에 대조하고, missing relation 음성 케이스를 테스트로 차단한다.

### 다음 개선
- 조건부 DO 블록이나 동적 DDL은 정적 relation 감사 대상에서 제외될 수 있으므로, operational relation 수동 예외를 명시할 기준을 검토한다.

### 커밋·푸시·배포
- 코드 및 테스트 커밋: `268a0dbaaa5611ea61ceb9fdcc06f027353dcaff` (`oci` 푸시 완료).
- OCI 배포: 성공 (GitHub Actions run `38854348257`).
- 운영 health/Flyway 확인: 성공 (commit `268a0dba`, Flyway 153, 누락 테이블 없음).

## [2026-10-16] 디버그 관측 테이블 누락 복구 및 로컬 Flyway 이력 정합화

### 목표
- 개선 과제 ID: CI-2026-10-16-026
- 로컬 API health가 degraded인 원인을 DB에서 확인하고, applied migration 누락/설명 충돌 및 필수 debug 테이블 누락을 바로잡는다.

### 반영
- 다른 체크아웃의 추적 가능한 V142 SQL과 원래 V142 적용 스크립트를 확인해 V142 migration 파일을 복원했다. V148의 기존 SQL도 현재 migration과 동일한 cap 조건(`0 < market_cap_usd <= 100,000,000`)을 설정함을 확인했다.
- Redgate Flyway 공식 `repair`를 동일한 migration 위치 및 무시 패턴으로 로컬 DB에 실행해 V142, V145, V148의 checksum/description 충돌을 정렬했다. 운영 DB에는 실행하지 않았다.
- 로컬 Flyway `migrate`가 기존 applied migrations 147개를 검증하고 pending V149-V152를 적용해 스키마를 152까지 올렸다.
- 실제 로컬 `/api/health`가 503인 것을 관측했고, 원인이 `debug_run_items`와 `debug_kis_calls` 누락임을 DB schema 목록과 `OPERATIONAL_SCHEMA_TABLES` 대조로 확인했다. 보정 V153 및 회귀 테스트를 추가해 로컬 DB에 적용했다.

### 근본 원인 및 재발 방지
- 근본 원인: 로컬 DB에 migration SQL을 수동 적용하며 V142/V145/V148 history metadata가 현재 파일과 달라졌고, 이전 migration 무시 정책으로 V94/V95 debug table이 생성되지 않았다. health가 두 테이블을 필수로 요구하는데도 최신 migration이 재보장하지 않았다.
- 재발 감지: Flyway `validate`와 `migrate`를 로컬 DB 실행 절차에 포함하고, operational schema-health test에서 디버그 테이블 누락을 회귀 검증한다.
- 남은 위험: 이번 배포 및 API 검증으로 확인한 범위에서는 없음. 향후 operational table 추가 시 migration과 schema-health 테스트를 함께 갱신해야 한다.

### 검증
- DB history before repair: V142 script/description mismatch, V148 prior script `V148__allow_us_smallcap_cap_at_limit.sql`; V148 실제 constraint 정의는 저장소 migration과 일치.
- Flyway repair는 V142/V145/V148 metadata 정렬 작업을 보고했고, `migrate`는 147개 applied migration 검증 및 V149-V152 네 migration 성공. V153 적용 시 148개 migration validate 후 V153 성공.
- `.env.local`을 주입한 프로젝트 `npm.cmd run dev`에서 `/api/health` HTTP 503을 재현; read-only schema inventory는 `debug_run_items`, `debug_kis_calls`만 누락으로 반환.
- 집중 테스트 `npm.cmd test -- --run lib/schema-health.test.ts`: 4개 통과. `npm.cmd run docs:check`: 통과.
- V153 후 동일한 dev server에서 `/api/health`: HTTP 200, `status=ok`.
- 전체 `npm.cmd run deploy:verify`: 통과. 빌드·standalone 스모크 테스트·전체 214개 테스트 파일(737 passed, 1 skipped)·타입·문서·보안/cron 검사 성공.
- GitHub Actions Deploy OCI run `38852487119`: Verify deployment, standalone package, upload release, activate release 모두 성공.
- 운영 `/api/debug/health`: HTTP 200, commit `ef2315f483dff2219559d50d69cdd8c0fdbd2090`, DB 연결 정상, Flyway 153, 누락 operational table 없음.
- 운영 `/api/admin/database` read-only 확인: `debug_run_items`, `debug_kis_calls` 모두 존재.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 로컬 Flyway 이력이 정렬되고 149-153 migration 적용에 성공했으며, missing operational tables로 발생하던 `/api/health` 503이 200으로 회복됐다.

### 다음 개선
- 적용 migration history와 operational table requirements를 자동 대조해 신규 필수 테이블이 보정 migration 및 health tests에서 누락되지 않도록 검사 자동화한다.

### 커밋·푸시·배포
- 코드·migration·회귀 테스트 커밋: `ef2315f483dff2219559d50d69cdd8c0fdbd2090` (`oci` 푸시 완료).
- OCI 배포: 성공 (GitHub Actions run `38852487119`).
- 운영 API 검증: 성공 (commit `ef2315f4`, Flyway 153, health 정상).

## [2026-10-16] 사용자 관심종목 저장 스키마 누락 복구 및 감지

### 목표
- 개선 과제 ID: CI-2026-10-16-025
- 로컬에서 로그인 사용자별 관심종목 저장 API가 테이블 누락으로 실패할 수 있는 스키마 불일치를 복구하고 운영 health에서 탐지한다.

### 반영
- 로컬 DB에서 `users`, `user_sessions`는 존재하지만 `user_watchlist`가 없음을 확인했다. 운영 DB에는 세 테이블 모두 존재한다.
- `user_watchlist` 테이블과 사용자별 unique key 및 조회 인덱스를 보장하는 idempotent V152 migration을 추가했다.
- `user_watchlist`를 operational schema 필수 목록에 넣고 누락 감지 회귀 테스트를 추가했다.

### 근본 원인 및 재발 방지
- 근본 원인: 관심종목 스키마는 V108 이전 migration으로만 보장되며, 이전 migration 무시 정책이 적용된 환경에서 미적용될 수 있었다. 해당 테이블은 operational health 검사 대상이 아니었다.
- 재발 감지: health schema 단위 테스트와 운영 배포 후 Flyway 152 및 `missingOperationalTables`를 확인한다.
- 남은 위험: 당시 Flyway 이력 충돌로 V152까지 진행되지 않았으나, CI-2026-10-16-026에서 원본 대조 후 로컬 metadata를 정렬하고 V153까지 적용했다.

### 검증
- 로컬 DB 스키마 점검: `user_watchlist` 누락, 운영 `/api/admin/database` read-only 확인: `user_watchlist` 존재.
- V152 SQL을 로컬 PostgreSQL 트랜잭션 안에서 2회 실행해 테이블/인덱스 생성과 재실행 안전성을 확인하고 `ROLLBACK`했다.
- `npm.cmd test -- --run lib/schema-health.test.ts`: 3개 테스트 통과.
- 전체 `npm.cmd run deploy:verify`: 통과. 빌드, standalone 실행 스모크 테스트, 전체 214개 테스트 파일(736 passed, 1 skipped), 타입 검사 및 문서/보안/cron 게이트 통과.
- GitHub Actions Deploy OCI run `38849867658`: Verify deployment, standalone package, upload release, activate release 모두 성공.
- 운영 `/api/debug/health`: HTTP 200, commit `c935d7daf2dd62a424eefcfd0b8c1a80bceb12a9`, DB 연결 정상, Flyway 152, 누락 operational table 없음.
- 운영 `/api/admin/database` read-only 점검에서 `user_watchlist` 존재 확인.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 로컬에서 누락을 확인했고 V152 적용 후 운영 Flyway가 152로 올라갔으며, 운영 health에서 누락 테이블 경보가 사라지고 `user_watchlist`가 존재한다.

### 다음 개선
- resolved operational store 누락 여부를 다른 기능 테이블에도 대조해 migration 보정 및 health 테스트 누락을 확인한다.

### 커밋·푸시·배포
- 상태: 완료.
- 커밋: `c935d7da` (`사용자 관심종목 저장 테이블 누락 복구`).
- 푸시: `origin/oci` 성공.
- 배포: OCI workflow `38849867658` 성공, 운영 health와 테이블 존재 확인.

## [2026-10-16] Flyway 스키마 누락 일정 테이블 복구 및 감지

### 목표
- 개선 과제 ID: CI-2026-10-16-024
- 로컬 DB 상태를 확인하고, 누락된 투자 일정 테이블이 일정 API 장애를 일으키며 health에서 탐지되지 않는 스키마 불일치를 복구한다.

### 반영
- `.env.local`의 localhost PostgreSQL을 읽기 전용으로 조사했다. DB는 Flyway 148이지만 `investment_calendar_events` 및 V130 migration 이력이 없었다.
- OCI 배포는 Flyway `*:ignored` 패턴으로 과거 누락 migration을 건너뛰므로 V130이 자동 적용되지 않을 수 있다. 최신 V151 보정 migration으로 테이블/인덱스를 idempotent하게 보장한다.
- `investment_calendar_events`를 operational schema 필수 테이블에 추가해 같은 누락을 `/api/health`에서 스키마 준비 실패로 표시한다.

### 근본 원인 및 재발 방지
- 근본 원인: 테이블 생성은 V130에만 있었으나 배포 정책이 현재 버전보다 낮은 미적용 migration을 건너뛰며, 해당 테이블은 operational schema health 목록에도 없었다.
- 재발 감지: schema-health 테스트에서 필수 목록 및 누락 결과를 확인하고, 배포 후 Flyway 151과 `missingOperationalTables`를 검증한다.
- 당시 남은 위험: local DB는 V142 파일 누락 및 V148 description 불일치로 Flyway validation이 막혔다. 원본 및 실제 제약을 확인한 뒤 CI-2026-10-16-026에서 V142를 복구하고 로컬 metadata를 정렬했다.

### 검증
- `npm.cmd test -- --run lib/schema-health.test.ts`: 2개 테스트 통과.
- Read-only DB 확인: localhost DB 연결, Flyway 148, `investment_calendar_events` 없음. `SELECT to_regclass('public.investment_calendar_events')`는 NULL이고 해당 테이블 조회는 PostgreSQL `42P01`.
- Flyway `info`: V130은 `Ignored`, V149/V150/V151은 `Pending`; `migrate`는 applied V142 missing 및 V148 description 불일치 검증 오류로 중단되어 persistent DDL은 적용되지 않았다.
- V151 SQL을 PostgreSQL 트랜잭션 안에서 2회 실행해 table/index 생성과 재실행 안전성을 확인하고 `ROLLBACK`으로 DB 상태를 원복했다.
- `npm.cmd run deploy:verify`: 통과. 빌드, standalone 실행, `/charts` 및 주요 API 스모크 테스트, 전체 품질 게이트를 통과했다 (735 tests passed, 1 skipped).
- GitHub Actions Deploy OCI run `38847831266`: Verify deployment, standalone package, upload release, activate release 모두 성공.
- 운영 `/api/debug/health`: HTTP 200, commit `eea34c416cb123c7c4fbeed99980ad4bf4f1ffe6`, DB 연결 정상, Flyway 151, 누락 operational table 없음.
- 운영 `/api/listings?from=2026-10-16&to=2026-10-16`: HTTP 200 JSON, `ok=true`.

### 개선 과제
- 성과 판정: UNMEASURED
- 근거: 누락 테이블을 재현하고 재적용 가능한 migration 및 health 회귀 검사를 추가했지만, local Flyway validation 불일치로 지속 적용을 확인하지 못했다.

### 다음 개선
- 적용 V142/V148 lineage의 원본 근거를 확인해 local migration history를 안전하게 정합화한 뒤 V151, `/api/health`, 상장 일정 API 및 신규 이벤트 upsert를 검증한다.

### 커밋·푸시·배포
- 상태: 완료.
- 커밋: `eea34c41` (`투자 일정 테이블 스키마 누락 복구 및 헬스체크 강화`).
- 푸시: `origin/oci` 성공.
- 배포: OCI 활성화 성공, 운영 커밋/Flyway/API를 위와 같이 확인.

## [2026-10-16] 투자 일정 API 실제 달력 날짜 검증

### 목표
- 개선 과제 ID: CI-2026-10-16-023
- 일정 조회 API가 형식만 맞고 존재하지 않는 날짜를 DB까지 전달해 503으로 반환하거나, 잘못된 요청을 기본 날짜로 조용히 치환하는 문제를 제거한다.

### 반영
- 공통 Gregorian 날짜 검증기에서 strict `YYYY-MM-DD`, 윤년, 월별 일수, 연도 0001..9999를 검증한다.
- `/api/listings`와 `/api/investment-calendar` GET에서 DB 호출 전에 날짜를 검증하고, 잘못된 날짜/역전 범위는 기존 오류 코드 `INVALID_DATE_RANGE`로 HTTP 400을 반환한다.
- 날짜 범위는 과거 일정 조회를 보존하도록 임의 상한을 두지 않았다. 두 경로 모두 결과 limit이 있으며 `event_date` 인덱스를 사용한다.
- 윤년/불가능 날짜와 두 API 경계를 검증하는 회귀 테스트를 추가했다.

### 근본 원인 및 재발 방지
- 근본 원인: 정규식 형식 검사만으로 달력상 유효성을 검증할 수 있다고 가정했고, listings는 형태가 다른 입력을 기본값으로 대체했다.
- 재발 감지: Gregorian 날짜 단위 테스트 및 두 API의 잘못된 날짜 입력 테스트를 CI에 유지한다.
- 남은 위험: 날짜 범위 상한은 설정하지 않았다. 넓은 과거 범위 사용량과 DB query latency를 관찰하고, 인덱스 활용·상한 필요성을 실제 지표에 따라 판단한다.

### 검증
- 집중 테스트: 3개 파일, 14개 테스트 통과.
- 타입 검사: `npm.cmd run typecheck -- --tsBuildInfoFile .next-deploy-verify/tsconfig.tsbuildinfo` 통과.
- 전체 `npm.cmd run deploy:verify`: 성공. production build, standalone `/charts` 200, 차트 API 200, 보호 API/cron 401, 전체 214개 테스트 파일(734 통과·1 skip), typecheck/docs/scope/KIS boundary/Bearer auth/cron 검사 통과.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 불가능 날짜가 두 API에서 모두 DB 접근 전 400으로 거절되고, Gregorian leap day는 유효하게 처리됨을 확인했다.

### 다음 개선
- 운영 투자 일정 테이블의 규모와 `event_date` 인덱스 실행 계획을 조사해 광범위 날짜 조회의 지연·스캔 행 수를 측정한다.

### 커밋·푸시·배포
- 배포 완료: 커밋 `dcf21288527a8707e84340ff9ef73f1c81256c1b`를 `oci`에 푸시했고 OCI workflow `38845648885` 성공.
- 운영 검증: health SHA가 동일 커밋이고 DB 연결/Flyway 150 정상. 두 API 모두 `2026-02-29`를 HTTP 400으로 거절하고, 유효한 `2024-02-29` 일정 조회는 HTTP 200을 반환했다.

## [2026-10-16] 상장 일정 조회 limit SQL 정수화

### 목표
- 개선 과제 ID: CI-2026-10-16-022
- `/api/listings`의 소수 `limit`이 PostgreSQL `LIMIT`으로 전달되어 발생 가능한 503을 제거한다.

### 반영
- route query 경계에서 공통 `boundedIntegerQuery`를 적용해 기본 200, 범위 1..1000의 정수만 service에 전달한다.
- 공용 `listInvestmentCalendarEvents`에서도 직접 호출자가 소수·NaN을 넘기는 경우를 방어하고 SQL bind 값의 정수 계약을 보장한다.
- route 및 service 테스트로 소수, 범위 초과, 잘못된 입력, 직접 service 호출의 경계값을 확인했다.

### 근본 원인 및 재발 방지
- 근본 원인: route가 입력을 단순 `Number()`로 변환했고 repository는 범위 clamp만 수행해 소수점이 SQL LIMIT 파라미터에 남았다.
- 재발 감지: HTTP 경계 테스트와 repository bind 값 테스트를 유지한다.
- 남은 위험: 날짜 문자열 형식 검증은 존재하지만 달력상 불가능한 날짜 검증은 이번 limit 문제 범위에 포함하지 않았다.

### 검증
- 집중 테스트: 3개 파일, 6개 테스트 통과.
- `npm.cmd run typecheck -- --tsBuildInfoFile .next-deploy-verify/tsconfig.tsbuildinfo`: 통과.
- `npm.cmd run deploy:verify`: 성공. production build, standalone `/charts` 200, chart API smoke 200, 인증 보호 API/cron 401, 전체 212개 테스트 파일(722 통과·1 skip), typecheck/docs/scope/KIS boundary/Bearer auth/cron 검사 통과.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: fractional limit이 route와 service 양쪽에서 정수 SQL bind 값으로 제한됨을 6개 테스트로 확인했다.

### 다음 개선
- 상장 일정 `from`/`to` 입력의 불가능한 날짜 및 과도한 조회 기간을 점검해 무효 날짜의 DB 오류와 과도한 결과 조회를 방지한다.

### 커밋·푸시·배포
- 배포 완료: 커밋 `bb2675eaf1dc883501ca1b4c46f1db6a13fa856a`를 `oci`에 푸시했고 OCI workflow `38844086523` 성공.
- 운영 검증: health SHA가 동일 커밋이며 DB 연결 정상. `/api/listings?limit=2.8`은 HTTP 200 JSON(`ok: true`) 응답을 반환했다. 해당 조회 기간 상장 이벤트는 0건이었다.

## [2026-10-16] 진단 API 정수 query 경계 공통화

### 목표
- 개선 과제 ID: CI-2026-10-16-021
- `/api/debug/kis-calls` 외 진단 경로에서 같은 fractional query→PostgreSQL 정수 오류가 재발하지 않도록 실제 SQL `LIMIT` 및 `::int`에 전달되는 파라미터를 점검·정규화한다.

### 반영
- 재사용 `boundedIntegerQuery`를 추가하고 KIS 호출량, 자동화 실행 로그, 오류 로그, KIS rate-limit 로그 API에 적용했다.
- 해당 API들은 소수 입력을 0 방향으로 절삭하고 허용 범위로 clamp하며, 비어 있거나 비수치/0 입력은 기존 기본값을 사용한다.
- 회귀 테스트가 fractional/out-of-range 값을 정수 SQL 인자로 전달하는지 검사한다.

### 근본 원인 및 재발 방지
- 근본 원인: 유사한 숫자 query 검증이 각 route에 중복돼 소수 입력을 걸러내지 못했고, PostgreSQL 정수 계약과 불일치했다.
- 재발 감지: 공통 parser 경계 테스트와 네 API route 통합 테스트를 지속 실행한다.
- 남은 위험: 해당 네 API 외에 범위가 복잡한 관리 도구 route들은 별도 입력 정책이 있으므로 이 변경에 포함하지 않았다. 추가 SQL 숫자 입력 경로는 별도 점검 과제로 남긴다.

### 검증
- 집중 테스트: 공통 parser 및 네 route 테스트 5개 파일, 12개 테스트 통과.
- `npm.cmd run deploy:verify`: 성공. Next.js production build 통과, standalone `/charts` 200, 주요 차트 API 200, 인증 보호 API/cron 401 smoke 통과, 전체 210개 테스트 파일(718 통과·1 skip), typecheck/docs/scope/KIS boundary/Bearer auth/cron 검사 통과.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 네 API에서 fractional 입력이 정수로 정규화되어 SQL에 전달되는 회귀 테스트 10개 및 공통 파서 테스트 2개가 통과했다. 최초 전체 검증은 로그 계약 누락으로 docs:check에서 막혔으며, 계약을 맞춘 뒤 재실행한 전체 검증은 모든 단계가 통과했다.

### 다음 개선
- `app/api/admin/database` 및 기타 숫자 query 입력 API의 SQL 바인딩 계약을 점검하고, 실제 정수 바인딩이 있는 경로만 동일 공통 파서를 적용한다.

### 커밋·푸시·배포
- 배포 완료: 구현 커밋 `e101ebe4931898ea829b18f7dd304fede35d0398`를 `oci`에 푸시했고 OCI 배포 workflow `38841985065`가 성공했다.
- 운영 검증: `/api/debug/health`가 동일 SHA와 DB 연결 정상/Flyway 150을 보고했다. `/api/debug/kis-calls?days=3.5&limit=1.9`는 HTTP 200 JSON, `days=3`, 최근 1건을 반환했다.

## [2026-10-16] KIS 호출량 진단 API 정수 query 안정화

### 목표
- 개선 과제 ID: CI-2026-10-16-020
- `/api/debug/kis-calls`에서 소수 query가 PostgreSQL 정수 바인딩 오류로 503을 내는 문제를 제거한다.

### 반영
- `days=3.5`나 `limit=1.9`가 현재 API의 `Number()` 경계값 검사만 통과해 DB의 `$n::int` / `LIMIT`에 전달될 수 있었다.
- `days`와 `limit`을 유한한 정수 범위로 정규화하고, 잘못된 값은 기존 기본값·최소·최대 경계로 처리한다.
- route 테스트로 관리자 인증, 소수, 범위 초과, 숫자가 아닌 입력이 DB 503 없이 정수 인자로 전달되는 것을 확인한다.

### 근본 원인 및 재발 방지
- 근본 원인: JavaScript의 숫자 검증과 PostgreSQL 정수 매개변수 계약이 서로 다르지만 API 경계에서 정수화를 하지 않았다.
- 재발 감지: `app/api/debug/kis-calls/route.test.ts`에 fractional·invalid·out-of-range query 회귀 테스트를 유지한다.
- 남은 위험: 비정수 문자열을 400으로 거절하지 않고 clamp/default 처리하므로 입력 오류는 응답의 유효 기본값으로 바뀐다. 이 endpoint의 기존 관대한 bounds 동작과 일치한다.

### 검증
- `npm.cmd test -- --run app/api/debug/kis-calls/route.test.ts`: 1개 파일, 4개 통과.
- `npm.cmd run typecheck`, `npm.cmd run docs:check`: 통과.
- 전체 `npm.cmd run deploy:verify`: 통과. 빌드, standalone `/charts` 200, 국내·해외 chart API 200, 관리자·cron 보호 경로 401, 전체 테스트 205개 파일(710 통과, 1 skip), typecheck/docs/scope/KIS boundary/Bearer auth/cron 검사 성공.
- 운영 검증: health의 service SHA `a8063a5a27e929ab47ab05f6cedbd0d05e7127b6`, DB 정상. 관리자 API `?days=3.5&limit=1.9`가 200 JSON으로 반환되고 `days=3`, 최근 1건을 확인했다.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 소수·무효 문자열·범위 초과 query가 DB 정수 cast 실패 대신 확정된 정수 인자로 전달되는 것을 회귀 테스트에서 확인했다.

### 다음 개선
- 동일한 숫자 query 파싱 패턴이 있는 debug API를 추가 검사하고, 공통 정수 query parser 재사용 여부를 판단한다.

### 커밋·푸시·배포
- 상태: 완료.
- 커밋·푸시: `a8063a5a27e929ab47ab05f6cedbd0d05e7127b6`를 `oci` 브랜치에 반영했다.
- 배포: GitHub Actions #38839067989 성공. 운영 health SHA 일치와 fractional query 실응답을 확인했다.

## [2026-10-16] 관리자 KIS 호출 대시보드 보조 데이터 장애 격리

### 목표
- 개선 과제 ID: CI-2026-10-16-019
- `/admin/kis-calls`의 필수 KIS 호출량과 보조 RATE LIMIT/Approval 메트릭 조회가 서로 장애를 전파하지 않도록 한다.

### 반영
- `Promise.all`에 세 API를 그대로 묶어 둔 상태에서는 선택적인 보조 API의 네트워크 오류나 잘못된 JSON이 전체 `load()`를 reject하고, 이미 성공한 필수 호출량 데이터도 화면에 반영되지 않았다.
- `lib/admin-optional-json.ts`로 보조 조회를 독립 격리하고, 실패 시 해당 섹션만 비우며 원인을 설명하는 UI 상태를 표시한다. 필수 호출량 API 실패만 전체 화면 오류로 처리한다.
- `components/admin-kis-calls.test.tsx`에서 실제 React 화면을 렌더링해 두 보조 API가 동시에 network/503 실패해도 필수 호출량과 각 섹션별 경고가 보존되는지 확인한다.
- 성공 JSON, HTTP 503, 네트워크 오류, 잘못된 JSON 응답을 helper 회귀 테스트로 확인한다.

### 근본 원인 및 재발 방지
- 근본 원인: 독립적인 운영 대시보드 데이터 source를 하나의 fail-fast Promise 그룹으로 모델링했다.
- 재발 감지: helper 계약과 mounted component 동작을 각각 테스트로 고정했다. 이 컴포넌트에 새로운 선택 API를 추가할 때도 보조 요청 실패가 필수 데이터 렌더링을 reject하지 않는지 확인한다.
- 남은 위험: 필수 KIS 호출량 API 자체의 실패는 계속 전체 데이터 오류로 나타난다. 이는 대시보드 핵심 데이터이므로 현재 동작을 유지한다.

### 검증
- targeted test: `npm.cmd test -- --run components/admin-kis-calls.test.tsx lib/admin-optional-json.test.ts`, 2개 파일, 4개 통과.
- `npm.cmd run typecheck`, `npm.cmd run docs:check`: 통과.
- 전체 `npm.cmd run deploy:verify`: 통과. 빌드, standalone `/charts` 200, 국내·해외 chart API 200, 관리자·cron 비인증 401, 전체 테스트 203개 파일(705 통과, 1 skip), typecheck/docs/scope/KIS boundary/Bearer auth/cron 검사 성공.
- 운영 적용 후 관리자 로그인, `/admin/kis-calls` 200, health DB 정상과 서비스 SHA 일치를 확인했다. Approval metrics API도 60분·60개 버킷을 반환했다.

### 개선 과제
- 성과 판정: IMPROVED (보조 fetch 오류 격리의 회귀 테스트·typecheck 통과; 전체 게이트와 운영 반영은 다음 단계에서 확인).
- 근거: 필수 요청 렌더링을 보조 실패에서 분리했고, helper 실패 경로와 React UI 렌더링을 포함한 4개 targeted 테스트가 통과했다.

### 다음 개선
- 컴포넌트 단위 검증을 추가해 RATE LIMIT/Approval 중 하나의 fetch가 실패해도 필수 KIS 호출량 섹션은 계속 렌더링되는 것을 UI 상태까지 확인한다.

### 커밋·푸시·배포
- 상태: 완료.
- 커밋·푸시: `2d94c7c7e6e805c19ed085b5873fc4976378fadd`를 `oci` 브랜치에 반영했다.
- 배포: GitHub Actions #38830679867 성공. 운영 `/api/debug/health` SHA가 커밋과 일치하고 관리자 KIS 호출 페이지 및 메트릭 API가 정상 응답했다.

## [2026-10-16] Deployment smoke polling 재시도 여유 보장

### 목표
- 개선 과제 ID: CI-2026-10-16-018
- `/charts` standalone smoke가 간헐적으로 개별 요청 timeout과 전체 polling deadline이 동시에 끝나며 한 번도 재시도하지 못하고 실패하는 검증 결함을 보완한다.

### 반영
- 최초 증거: 서버 TCP listener와 Next readiness는 startup 오류 없이 확인됐으나 `/charts` 요청이 제한시간에 abort됐다. 15초 기본값으로 반복 재현되고 30초 설정에서는 통과해 요청별 timeout과 전체 retry deadline 모두 부하 환경에 맞춰야 함을 확인했다.
- `scripts/smoke-retry-policy.mjs`에서 smoke 총 polling deadline을 `max(configured deadline, per-request timeout × 2 + 1초)`로 계산하고, `/charts` 기본 요청 timeout도 15초에서 30초로 올렸다. 요청 제한을 늘리되 한 번 더 요청할 poll 시간도 확보한다.
- 계산 정책의 정상/사용자 지정/유효하지 않은 값을 회귀 테스트하고, `deploy:verify`를 통한 standalone smoke 실행을 유지한다.

### 근본 원인 및 재발 방지
- 근본 원인: per-request Abort timeout과 전체 retry deadline이 동일해 첫 응답이 늦으면 retry loop가 사실상 실행되지 않았고, 15초 기본 요청 제한은 부하 시 `/charts` 렌더링에 부족했다.
- 재발 감지: `scripts/smoke-retry-policy.test.mjs`가 retry deadline의 최솟값과 override를 검증하고 전체 배포 게이트가 기본 30초 설정으로 실제 standalone `/charts`와 인증된 경로를 실행한다.
- 남은 위험: 한 차례 재시도에서도 `/charts`가 계속 느리면 smoke는 실패해야 한다. 해당 timeout을 무제한 늘려 회귀를 숨기지는 않는다.

### 검증
- `npm.cmd test -- --run scripts/smoke-retry-policy.test.mjs lib/kis-realtime-approval-rate-limit.test.ts app/api/admin/kis-realtime-approval-metrics/route.test.ts app/api/kis/realtime/approval/route.test.ts`: 4개 파일, 13개 테스트 통과.
- 전체 `npm.cmd run deploy:verify`: 통과. 빌드, standalone `/charts` 200, 국내/해외 차트 API 200, protected API 401, 전체 테스트 202개 파일(702 통과, 1 skip), typecheck/docs/scope/KIS boundary/Bearer auth/cron 검사 성공.
- 이 실행에서는 `/charts`와 신규 관리자 metrics endpoint 401 smoke도 통과했다. GitHub Actions [Deploy OCI #38826970184](https://github.com/pjtss/StockMan/actions/runs/38826970184)가 성공했고, 운영 `/api/debug/health`에서 적용 SHA `6abdf02af231962daf409e3efd11abade84b5054`, DB 연결 성공을 확인했다.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 총 deadline을 개별 timeout보다 길게 유지해 일시 지연 후 재시도할 수 있고, 새 standalone smoke와 전체 품질 게이트가 통과했다. 무제한 대기는 허용하지 않는다.

### 다음 개선
- 새 timeout/retry 정책으로 전체 배포 검증을 통과시키고, 반복 timeout이면 `/charts` server render 및 주요 await 구간을 별도 계측한다.

### 커밋·푸시·배포
- 상태: 완료.
- 커밋·푸시: `6abdf02a`를 `oci` 브랜치에 반영했다.
- 배포: GitHub Actions #38826970184 성공. 운영 health의 적용 SHA가 해당 커밋과 일치한다.

## [2026-10-16] 차트 Approval Rate Limit 운영 관측

### 목표
- 개선 과제 ID: CI-2026-10-16-017
- CI-2026-10-16-016에서 추가한 공개 chart WebSocket Approval rate limit이 실제로 몇 번, 어떤 범위(IP별/전역)에서 발생하는지 관리자 UI에서 확인하고 임계값 조정 근거를 만든다.

### 반영
- limiter는 IP·요청 ID 없이 허용 수, IP 제한 수, 전역 제한 수, Retry-After 구간을 1분 버킷 60개로 메모리에 집계한다. 만료된 분 버킷은 제거되어 사용량은 bounded다.
- 관리자 인증이 필요한 `/api/admin/kis-realtime-approval-metrics`를 추가했다. DB 장애와 관계없이 같은 프로세스 메트릭을 조회하고 응답은 `no-store`다.
- `/admin/kis-calls`에 최근 60분 요약, 최근 10분 분별 흐름, Retry-After 구간 및 한도 설정을 표시한다. 배포/재시작 시 메트릭이 초기화된다는 점도 UI에 표시한다.
- 회귀 테스트는 60분 유지 범위, 개인/전역 제한의 구분, 식별정보 미포함, admin 인증, no-store와 DB 의존성 없는 조회를 확인한다.
- `deploy:verify` standalone smoke에 새 관리자 경로의 비인증 401 확인을 등록해 배포에서도 인증 경계를 검사한다.

### 근본 원인 및 재발 방지
- 근본 원인: 제한 동작은 있었지만 카운터가 운영자에게 노출되지 않아 과잉 차단·공격·정상 사용자 NAT 영향 구분이 불가능했다.
- 재발 감지: limiter 집계 계약 테스트와 관리 API 인증/PII 회귀 테스트를 유지하고 KIS module registry에 모듈 테스트 연결을 유지한다.
- 남은 위험: 단일 프로세스 메모리 통계는 프로세스 재시작 때 초기화되며 여러 인스턴스 간 공유하지 않는다. 프로젝트 운영 전제인 단일 OCI 인스턴스에서만 전체 발생률로 해석한다.

### 검증
- `npm.cmd test -- --run lib/kis-realtime-approval-rate-limit.test.ts app/api/kis/realtime/approval/route.test.ts app/api/admin/kis-realtime-approval-metrics/route.test.ts`: 3개 파일, 10개 테스트 통과.
- `npm.cmd run typecheck`, `npm.cmd run docs:check`, `npm.cmd run audit:kis-boundary`, `git diff --check`: 통과. 전체 배포 검증 및 runtime smoke는 CI-2026-10-16-018에서 통과했다. 운영 관리자 세션으로 새 메트릭 API가 60분·60개 버킷을 반환하고 IP 필드가 없음을 추가 확인했다.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 분별 집계·PII 미포함·관리자 인증·DB 독립 API/UI를 회귀 테스트와 전체 배포 검증에서 확인했다. 운영 rate-limit 발생률은 배포 이후 수집해야 한다.

### 다음 개선
- 운영 적용 후 실제 429 비율과 분별 요청량을 확인하고 NAT 영향이 관측되면 IP 한도 및 전역 한도를 조정한다.

### 커밋·푸시·배포
- 상태: 완료.
- 커밋·푸시: `6abdf02a`를 `oci` 브랜치에 반영했다.
- 배포: GitHub Actions #38826970184 성공. 운영 health SHA 일치 및 관리자 메트릭 응답을 확인했다.

## [2026-10-16] 차트 WebSocket Approval API 호출 제한

### 목표 및 원인
- 개선 과제 ID: CI-2026-10-16-016
- 차트 실시간 구독용 `/api/kis/realtime/approval`은 익명 공개 API이며 유효한 구독 요청에 호출 제한이 없었다. Approval 키 캐시로 KIS 발급 자체는 절약되지만, endpoint 응답 생성·전송과 키 노출을 무제한 요청할 수 있었다.
- 운영 Nginx는 `X-Real-IP`를 `$remote_addr`로 덮어쓰는데 해당 route는 클라이언트 IP를 사용하지 않아 별도 남용 방어가 없었다.

### 반영 및 재발 방지
- 단일 인스턴스 전제에 맞춰 process memory fixed-window limiter를 추가했다: IP당 60초 120회, 전체 60초 1,800회. 키 수는 4,096개로 제한하고 만료 항목을 정리한다.
- 초과 시 `429 RATE_LIMITED`와 `Retry-After`를 반환하며 Approval 키 조회/발급은 호출하지 않는다. 잘못된 종목 요청은 limiter quota를 소비하지 않는다.
- 신뢰 경계에 맞게 `X-Real-IP`를 먼저 읽고, 마지막 `X-Forwarded-For` hop을 fallback으로 사용한다. 근거는 `deploy/oci/nginx-stockman.conf`의 프록시 헤더 설정이다.
- 제한 및 IP 우선순위 정책은 `docs/architecture/external-request-boundaries.md`에 연결했다. 반복 호출·IP 격리·전역 cap·window reset·429/Retry-After 및 외부 fetch 미호출을 테스트로 고정했다.
- 첫 전체 검증에서 KIS 모듈 registry에 새 rate-limit 모듈과 테스트 연결이 누락된 것을 audit가 탐지했다. `scripts/kis-module-registry.mjs` 및 `scripts/audit-kis-boundary.mjs`에 책임·대표 함수·테스트를 등록했고 audit 재실행이 통과했다.

### 검증
- targeted tests: 2개 파일, 6개 통과. `npm.cmd run typecheck`, `npm.cmd run docs:check`, `npm.cmd run audit:kis-boundary`, `git diff --check` 통과.
- 전체 `npm.cmd run deploy:verify`: 통과. 빌드 및 standalone `/charts` 200, 국내·해외 차트 API 200, 보호 API 401, 테스트 201개 파일(695개 통과, 1개 skip), 타입·문서·scope·KIS boundary·bearer auth·cron 게이트 성공.
- 전체 검증 중 문서 계약과 KIS registry 누락을 각각 감지해 수정하고 재실행 통과했다.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: rate-limit 테스트에서 client cap, global cap, 요청 제한 시 fetch 미호출, `Retry-After`가 검증됐다. GitHub Actions `Deploy OCI #999` 성공 후 운영 `/api/debug/health`에서 service SHA `5f1440ca6f3d97553adcc3a59bc18b1f76ee28ed`, DB 연결 및 Flyway V150 정상 확인.

### 남은 위험
- 남은 위험: 같은 공인 IP를 공유하는 사용자(회사·통신사 NAT)는 합산 제한에 걸릴 수 있고, 분산 IP 공격은 전역 제한에 영향을 줄 수 있다. 운영 429 비율을 관측해 임계값을 조정해야 한다.

### 다음 개선
- 운영 로그/메트릭에 IP 원문 없이 제한 발생 횟수, client/global scope, retry-after 분포를 집계해 정책을 조정한다.

### 커밋·푸시·배포
- 완료: 커밋 `5f1440ca6f3d97553adcc3a59bc18b1f76ee28ed`를 `oci` 브랜치에 push.
- 완료: GitHub Actions #999 성공 및 운영 `/api/debug/health`에서 service SHA 일치 확인.

## [2026-10-16] 차트 WebSocket Approval 발급 호출 캐시

### 목표
- 실시간 차트 연결 때마다 반복 발급되던 KIS WebSocket Approval 키를 메모리 캐시해 외부 호출을 줄이고, 병렬 연결의 토큰 발급 경합을 제거한다.

### 반영
- 개선 과제 ID: CI-2026-10-16-015
- `/api/kis/realtime/approval`이 차트 모달 연결마다 `issueKisRealtimeApprovalKey()`를 호출하고, 기존 모듈은 모든 요청에서 KIS `/oauth2/Approval`에 POST했다.
- 실전/모의 환경 및 credential fingerprint별 23시간 메모리 캐시를 추가하고, 동시 요청은 같은 in-flight Promise를 공유하도록 했다. KIS 자격증명 교체는 fingerprint가 바뀌어 새 키를 발급하며, 성공하지 않은 응답은 저장하지 않는다.
- 승인 API의 KIS 네트워크 예외는 내부 메시지를 노출하지 않고 `KIS_APPROVAL_KEY_UNAVAILABLE` 503으로 정규화한다.
- 캐시 재사용, 동시 요청 병합, 실전/모의 분리, credential 회전, 23시간 만료, 실패 비캐시와 route 응답을 회귀 테스트로 고정했다.

### 근본 원인 및 재발 방지
- 근본 원인: Approval 키 수명주기/재사용 관리가 없어서 UI 연결 빈도가 그대로 OAuth Approval 호출 빈도가 됐다.
- 재발 감지: KIS realtime module 테스트에서 같은 키 요청 2회 및 동시 요청의 실제 fetch 횟수를 1회로 검사하고, 모의/실전·키 회전·만료 격리를 테스트한다.
- 공식 기준: 한국투자증권 [공식 Open API 인증 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/kis_auth.py)은 `_last_auth_time`으로 인증시각을 관리하고 86,400초 경과 후 WebSocket 키 재인증을 수행한다. 구현 TTL은 23시간이다.
- 남은 위험: 프로세스 메모리 캐시는 사용자가 확정한 단일 인스턴스 배포 구조에 종속된다. 다중 인스턴스로 바뀌면 공유 저장소 또는 단일 발급 서비스로 재설계해야 한다.

### 검증
- `npm.cmd test -- --run lib/kis-realtime.test.ts app/api/kis/realtime/approval/route.test.ts`: 2개 파일, 12개 테스트 통과.
- `npm.cmd run deploy:verify`: 통과. Next.js 빌드, standalone `/charts` 200과 국내/해외 차트 API smoke, 200개 테스트 파일(692개 통과, 1개 skip), typecheck, docs, verify-scope, KIS boundary, bearer-auth 및 cron 구조 게이트 성공.
- `git diff --check`: 통과.
- 기준선 호출량: 모달 WebSocket 연결 N회당 Approval 요청 N회. 변경 후 프로세스/환경/자격증명당 23시간 내 첫 요청 1회, 동시 첫 요청도 1회로 병합한다(정량값은 호출계약 테스트로 확인하며 운영 트래픽 비율은 아직 수집하지 않음).

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 호출계약 테스트에서 같은 키 2회 요청 및 동시 요청이 각각 KIS fetch 1회로 합쳐지고, 만료 전에 키를 갱신하며 실전/모의와 credential 변경을 격리함을 확인했다. 운영 반영 후 실트래픽 절감량은 관측해야 한다.
- 완료 기준: 모듈·route 테스트와 deploy verification 통과, 운영 서비스 SHA 확인.
- 운영 배포 완료: GitHub Actions `Deploy OCI #997` 성공 (run `38817560167`); `/api/debug/health`에서 `2026-10-16T07:37:03Z` 기준 service commit `2808bbafdd24352722ea8110bf947417e7f50713` 일치, DB 연결·스키마·Flyway health 정상.

### 다음 개선
- 차트 realtime Approval 경로 공개 호출량과 client/IP별 WebSocket 연결 남용을 계측하고 제한 정책을 검토한다.

### 커밋·푸시·배포
- 완료: 커밋 `2808bbafdd24352722ea8110bf947417e7f50713`을 `oci` 브랜치에 push.
- 완료: GitHub Actions #997 성공 및 운영 `/api/debug/health`의 service SHA 일치 확인.

## [2026-10-16] 공개 데이터 API 오류 응답 및 SEC 리스크 쓰기 권한 강화

### 목표
- 공개 데이터 API 오류에 내부 예외 원문이 노출되지 않도록 하고, SEC 리스크 DB 쓰기를 관리자 세션으로 제한한다.

### 반영
- 개선 과제 ID: CI-2026-10-16-014
- `bullish-rss`, `listings`, `investment-calendar`, 국내 재무 내보내기, 국내 TOP 상승 차트, daytrade scan 및 SEC 리스크 API에서 예외 원문이 응답될 수 있는 경로를 확인했다.
- 응답은 공통 `safeErrorMetadata(...).errorCode`를 사용하도록 변경했다. JSON 파싱 오류는 `INVALID_JSON`으로 처리하고, DB/서비스 예외는 503 계열로 분류해 클라이언트 오류와 구분한다.
- `/api/us/sec-risks` PATCH는 기존에 rate limit 외 인증이 없어 누구나 지속 저장되는 위험 데이터를 수정할 수 있었다. 저장소 내 호출처가 없는 것을 확인했고, PATCH에 관리자 세션을 요구하도록 변경했다. 검증 실패 코드는 allowlist 형식만 응답하며 DB 원문은 반환하지 않는다.
- SEC risks route 회귀 테스트 3개와 공개 경로 소스 감사 7개를 추가했다.

### 근본 원인 및 재발 방지
- 근본 원인: 공개 API 예외를 그대로 JSON에 넣고, 데이터 변경 API에서 인증 대신 rate limiting만 적용한 책임 경계 누락.
- 재발 감지: 선정된 공개 API의 직접 예외 메시지 반환을 소스 감사 테스트로 검사하고, SEC risk PATCH에 비로그인 401 및 쓰기 미호출 테스트를 유지한다.
- 남은 위험: 이번 변경은 확인한 공개 경로에 한정했다. 공개 API 전수 목록의 인증·오류 응답 계약을 계속 감사한다.

### 검증
- `npm.cmd test -- --run lib/error-diagnostics.test.ts lib/public-api-error-boundary.test.ts app/api/us/sec-risks/route.test.ts app/api/kis/detection-candidates/route.test.ts`: 4개 파일, 21개 테스트 통과.
- `git diff --check`: 통과.
- `npm.cmd run deploy:verify`: 통과. Next.js 빌드와 standalone 실행/API smoke, 198개 테스트 파일(684개 통과, 1개 skip), typecheck, docs, verify-scope, KIS boundary, bearer-auth 및 cron 구조 게이트 통과.
- 최종 문서 상태 반영 후 재실행한 `deploy:verify`는 빌드·typecheck·전체 테스트(684 passed, 1 skipped) 통과 후 `/charts` 스모크 단계에서 30초 타임아웃으로 종료했다. 동일 standalone 산출물을 별도 기동해 `.env.local` 주입 상태에서 `/charts` 응답 200, HTML 8,648자, 850ms를 확인했고 startup error는 없었다. 문서 검사는 수정 후 단독 재통과했다.
- `git diff --check`: 통과.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: targeted 회귀 테스트에서 원문 오류 미노출, 미인증 SEC risk 쓰기 차단, 데이터베이스 장애 시 503 분류를 확인했고 전체 배포 검증도 통과했다. 운영 반영 검증은 남아 있다.
- 완료 기준: 전체 게이트 통과 기록, standalone `/charts` 실행 응답 200, 운영 배포 후 서비스 SHA 일치.

### 다음 개선
- `/api` route 전체 인벤토리에서 공개 쓰기 API·자유형 예외 응답을 자동 탐지하는 CI 감사 규칙을 확대한다.

### 커밋·푸시·배포
- 완료: 코드 커밋 `38805e95df6ded433f8bf45bde4fe47966b4bf82`, `oci` 푸시 완료. Deploy OCI #995 (`38814384496`) 성공. `/api/debug/health`의 운영 `status=ok`, 서비스 SHA 일치, 빌드 시각 `2026-10-16T07:02:46+09:00` 확인.

## [2026-10-16] KIS·국내 스캔 공개 API의 자유형 오류 응답 차단

### 목표
- 공개 KIS 및 국내 스캔 API가 DB 접속 문자열·내부 URL·공급자 원문 오류를 응답에 반사하지 않도록 한다.

### 반영
- 개선 과제 ID: CI-2026-10-16-013
- 코드 검색에서 `financial-ratios`, `market-funds`, `investor-flow`, `investment-opinion`, `detection-scan`, `detection-candidates` 및 EMA/RVOL·볼린저 반등 국내 스캔 API가 예외 message를 응답하는 경로를 확인했다.
- 오류 응답은 `safeErrorMetadata(...).errorCode`로 제한하고, KIS 진단에서는 형식 검증된 `rtCd`·`msgCd`만 남기며 자유형 `msg1`을 제거한다.
- `safeProviderCode`와 비밀 URL/token canary 테스트를 추가해 공급자 코드만 보존되는 계약을 고정했다.

### 근본 원인 및 재발 방지
- 근본 원인: API 라우트에서 예외·공급자 응답의 `message`를 진단 편의 목적으로 그대로 JSON에 싣는 패턴.
- 재발 감지: 공개 API 경로에서 `error.message` 반환 및 `msg1` 응답 사용처를 정기 검색하고, 공통 진단 helper의 허용 목록 단위 테스트를 유지한다.
- 남은 위험: 이번 작업은 확인한 KIS·국내 스캔 경로만 수정했다. `/api`의 다른 공개 기능(뉴스, 캘린더, 상장 일정, 재무 내보내기, SEC 리스크 등)의 오류 메시지 반환은 별도 점검 대상이다.

### 검증
- `npm.cmd test -- --run lib/error-diagnostics.test.ts app/api/kis/detection-candidates/route.test.ts app/api/kis/investor-flow/route.test.ts`: 3개 파일, 12개 테스트 통과.
- `git diff --check`: 통과.
- `npm.cmd run docs:check`: 필수 로그 섹션을 보완한 뒤 통과(문서 entry 18개, 최신 migration V150).
- `npm.cmd run deploy:verify`: 30초 smoke 제한을 적용한 전체 검증 1회는 통과(빌드, standalone `/charts` 및 API smoke, 전체 테스트 196개 파일 통과/1개 skip·674개 통과/1개 skip, typecheck와 정적 게이트)했다. 이후 재실행에서 `/charts` smoke의 간헐적 시간 초과가 발생했다. 분리 worktree에서 원본 `.env.local`을 비밀 출력 없이 주입한 standalone 직접 요청은 200, 1.4초, HTML 8,648 bytes를 반환했고 프로세스 정리도 정상 종료했다. `docs:check`와 단독 typecheck도 마지막 문서 수정 후 통과했다. verifier 재현성은 후속 개선 대상으로 남긴다.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 6개 KIS 및 4개 국내 스캔 라우트의 오류 응답이 안전 진단 코드로 제한되고, 공급자 자유형 메시지와 DB URL/token canary가 응답에 나타나지 않는 단위 테스트가 통과했다. 전체 검증 성공 1회와 독립 standalone 직접 실행에서 빌드·674개 전체 테스트·실행 성공이 확인됐다. 최신 로그 기준 `docs:check`와 typecheck도 통과했다.
- 완료 기준: 오류 응답 secret-canary 회귀 테스트, 빌드·전체 테스트·standalone 실행, docs:check 통과. 배포 검증 `/charts`의 간헐 타임아웃은 다음 개선 항목으로 추적하며, 이번 기능 변경의 직접 standalone 응답은 200으로 검증했다. 커밋/푸시 및 운영 배포 확인은 남아 있다.

### 다음 개선
- 배포 검증 `/charts` smoke의 간헐 30초 이상 지연 원인을 추적하고 계측·재현성을 보강한다. 이어 미점검 공개 경로(`/api/bullish-rss`, 캘린더, 상장 일정, 재무 내보내기, SEC 리스크)의 예외 메시지 반환도 확인한다.

### 커밋·푸시·배포
- 상태: 완료 — 최종 커밋 `54081769a8a8060f3e804be2297c4234a2e48ad2` 반영 및 운영 배포 확인.
- 초기 커밋 생성: `2f9b2d1e4a88c8fce165fbd2a01be2e6066471d7` (이후 amend 및 최종 반영은 아래 정정 기록 참조).
- 최초 푸시 시 `fatal error in commit_refs`가 발생했으나, amend 이후 최종 커밋 `54081769a8a8060f3e804be2297c4234a2e48ad2` 푸시가 성공했다. OCI 배포 workflow `38809918318` 성공 및 운영 관리자 health의 `status=ok`, 서비스 SHA 일치를 확인했다. 빌드 시각 `2026-10-16T06:26:37+09:00`.

## [2026-10-16] 해외 KIS 진단 로그 및 TOP 상승률 공개 오류 응답 정제

### 목표
- 해외 KIS 요청 실패 진단에서 원문 예외·공급자 자유형 메시지가 로그/Rate Limit 테이블 또는 공개 API에 남지 않도록 한다.

### 반영
- 개선 과제 ID: CI-2026-10-16-012
- 공통 `kisRequest` 경계가 네트워크 예외 원문을 KIS debug log에 저장하고, Rate Limit 이벤트의 `msg1` 전체 문자열을 `kis_msg1_code`에 저장하던 경로를 확인했다.
- `safeErrorMetadata` 기반 분류 코드만 debug log에 남기며, Rate Limit 이벤트의 KIS 코드 필드는 영숫자·`_`·`-`로 제한했다. 자유형 `msg1`은 정형 코드인 경우에만 저장한다.
- 미국 TOP 상승률 유니버스의 DB/KIS 예외 문자열을 일반 진단 코드로 치환하고, KIS 응답 메시지는 공개 응답에서 제거했다. 공개 차트 API의 예외·스냅샷 오류도 안정적인 오류 코드만 노출한다.
- 회귀 테스트는 데이터베이스 URL·비밀번호·토큰이 공통 KIS 로그와 공개 API 응답에 포함되지 않는지 검사한다.

### 근본 원인 및 재발 방지
- 근본 원인: 공통 통신 경계와 오류 응답에서 분류 진단 객체 대신 공급자/예외 원문을 보존하는 관행.
- 재발 감지: KIS 공통 경계 및 TOP 상승률 API의 secret-canary 회귀 테스트를 유지하고, 새로운 외부 연동 오류 저장은 `safeErrorMetadata`와 명시적인 허용 필드로만 구성한다.
- 범위 한계: 이번에는 공통 KIS 통신 경계와 US TOP 상승률 경로를 수정했다. 다른 외부 연동의 로그·저장·API 응답은 다음 감사 항목이다.

### 검증
- `npm.cmd test -- --run lib/error-diagnostics.test.ts lib/kis-request-framework.test.ts app/api/stock/us/top-rising-chart/route.test.ts lib/us-top-rising-universe.test.ts`: 4개 파일, 20개 테스트 통과.
- `npm.cmd run docs:check`: 통과(문서 entry 18개, migration 최신 V150).
- `git diff --check`: 통과.
- `npm.cmd run deploy:verify`: 통과. production build 성공, standalone smoke(`/charts` 200, invalid KIS market 400, 국내·해외 top-rising chart API 200, 미인증 관리자·cron API 401), 테스트 196개 파일 통과/1개 skip(672개 통과/1개 skip), typecheck 및 docs/auth/KIS boundary/cron 게이트 통과.
- OCI 배포 workflow `38805231990`: 성공, 대상 커밋 `bbb18273f721334881588bbd808634be3b779c89`.
- 운영 관리자 health API: `status=ok`, 서비스 SHA `bbb18273f721334881588bbd808634be3b779c89`, 빌드 시각 `2026-10-16T05:50:46+09:00` 확인.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 공통 KIS 네트워크 로그와 rate-limit 이벤트에서 자유형 입력 제거 테스트가 통과했고, 공개 TOP 상승률 API의 DB/KIS 예외 메시지 비노출 회귀 테스트도 통과했다. 전체 빌드·테스트·standalone smoke가 성공했으며 운영 health API가 새 SHA와 `ok`를 확인했다.
- 완료 기준: 전체 테스트·빌드·standalone smoke 통과, 커밋/배포 후 서비스 SHA 확인.

### 다음 개선
- RSS·SEC·Discord·기타 외부 공급자 응답에서 자유형 오류 문자열이 저장되거나 API에 반사되는지 조사한다.

### 커밋·푸시·배포
- 완료: 커밋 `bbb18273f721334881588bbd808634be3b779c89`를 `oci`에 푸시했고 workflow `38805231990` 성공 및 운영 health SHA 일치를 확인했다.

## [2026-10-16] 국내 KIS 스캐너 오류 로그의 원문 메시지 제거

### 목표
- KIS 실시간 조회와 DB 캐시 read/write 예외에서 URL, 연결 문자열, 쿼리 또는 공급자 응답의 자유 형식 원문이 로그로 노출되지 않도록 한다.

### 반영
- 개선 과제 ID: CI-2026-10-16-011
- 직전 운영 개선 이후 국내 스캐너 5종(`fetchVolumeSpike`, `fetchNetBuying`, `fetchProgramTrading`, `fetchNewHigh`, `fetchBidAskRatio`)을 재점검했다. 15개 catch 경로가 예외 객체를 `console.warn/error`에 직접 전달하고 있었다.
- `safeErrorMetadata`를 추가해 예외 분류 코드와 형식 검증된 DB 코드만 출력하도록 하고, 15개 로그를 모두 안전 메타데이터로 전환했다. 상세 원문은 반환 payload나 로그에 넣지 않는다.
- 회귀 테스트는 예시 DB URL 및 token 문자열이 안전 메타데이터에 들어가지 않음을 확인한다.

### 검증
- `npm.cmd test -- --run lib/error-diagnostics.test.ts lib/kis.test.ts`: 2개 파일, 11개 테스트 통과.
- `npm.cmd run docs:check`: 통과(문서 entry 18개, migration 최신 V150). 최초 실행에서 로그 필수 계약 누락이 검출되어 성과/근거/검증 필드를 보완한 뒤 통과했다.
- `git diff --check`: 통과.
- KIS 파일의 직접 예외 로깅을 검색해 결과가 `safeErrorMetadata(...)` 호출만 남았음을 확인했다.
- `npm.cmd run deploy:verify`: 통과. production build 성공, standalone runtime smoke(`/charts` 200, invalid KIS market 400, 국내·해외 top-rising chart API 200, 미인증 관리자·cron API 401), 테스트 195개 파일 통과/1개 skip(670개 통과/1개 skip), typecheck 및 문서·auth·KIS 경계·cron 게이트 통과.
- 배포 workflow `38802490718`: 성공적으로 새 릴리스를 활성화했다.
- 운영 관리자 health API: `status=ok`, 서비스 SHA `eaf9592622f56c81015bb705e20a27efd11fae7f`, 빌드 시각 `2026-10-16T05:17:06+09:00` 확인.

### 근본 원인 및 재발 방지
- 근본 원인: 로깅 시 분류된 진단 DTO가 아니라 원본 예외 객체를 직접 전달하는 관행.
- 재발 감지: `lib/kis.ts`에서 catch 변수 또는 예외 객체를 직접 로깅하는 패턴을 정기 감사하고, 안전 메타데이터 helper 테스트에서 URL/토큰 제외 계약을 유지한다.
- 범위 한계: 이번 변경은 국내 KIS 스캐너 공통 모듈만 다룬다. 해외 KIS 및 RSS/SEC/Discord 오류 반환·저장은 다음 점검 범위다.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 대상 스캐너 15개 예외 로그가 안전 메타데이터만 사용하도록 바뀌었고, 회귀 테스트에서 URL/token 제외를 확인했다. 전체 테스트·빌드·standalone smoke가 통과했으며 운영 health API에서 배포 SHA와 `ok`를 확인했다.
- 완료 기준: 안전 로그 테스트, `deploy:verify`, standalone smoke, 배포 후 운영 커밋 확인.

### 다음 개선
- 해외 KIS 및 외부 연동 오류 경로에서 원문 예외가 사용자 API 응답이나 로그에 노출되는지 조사한다.

### 커밋·푸시·배포
- 완료: 코드 커밋 `eaf9592622f56c81015bb705e20a27efd11fae7f`를 `oci`에 푸시했고 workflow `38802490718` 및 운영 health SHA 일치를 확인했다.

## [2026-10-16] KIS 토큰 실패 로그에서 민감 응답·오류 메시지 제거

### 목표
- KIS 토큰 발급 실패 응답 원문과 DB 오류 메시지에 포함될 수 있는 액세스 토큰·앱 시크릿·접속 문자열의 로그 노출을 막고, 운영 진단에 필요한 안전한 메타데이터는 보존한다.

### 반영
- 개선 과제 ID: CI-2026-10-16-010
- `lib/kis-token.ts`가 토큰 API 비성공 응답 본문 500자를 그대로 출력하던 문제와 DB 오류 메시지 원문을 출력하던 문제를 확인했다.
- 공급자 응답 본문은 로그에서 제외하고 HTTP 상태, 정규화된 content-type, 정해진 문자 형식의 `msg_cd`/`rt_cd`/`error_code`만 허용한다. 자유 형식 `msg1`, access token, 앱 키·시크릿은 기록하지 않는다.
- DB 오류는 `describeError`의 분류 코드와 형식 검증된 DB 코드만 로그에 남기고 원본 message/cause는 출력하지 않는다. JSON 파싱 실패도 오류 message 대신 오류 종류만 기록한다.
- 공식 기준: OWASP Logging Cheat Sheet의 access token, 인증 비밀번호, DB connection string, encryption key 등 로그 제외 권고를 반영했다(https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).

### 검증
- `npm.cmd test -- --run lib/kis-token.test.ts`: 8개 테스트 통과.
- 신규 테스트는 응답 본문에 포함된 가짜 앱 시크릿·액세스 토큰이 warning 인자에 나타나지 않는지, DB 오류 원문이 출력되지 않는지 확인한다.
- 전체 배포 검증과 운영 배포 전이다.

### 남은 위험 및 다음 개선
- 애플리케이션의 다른 외부 API 모듈에서도 자유 형식 응답·오류가 직접 로그에 전달되는지 별도 인벤토리화가 필요하다.
- 기존 운영 로그의 보존·접근 정책과 이미 기록된 민감 문자열 여부는 OCI 로그 저장소에서 별도 확인해야 하며, 코드 변경만으로 과거 로그를 지우지는 않는다.

### 개선 과제
- 성과 판정: UNMEASURED
- 근거: 토큰 발급 실패와 DB 오류를 포함하는 단위 테스트에서 로그 허용 목록과 비밀값 제외를 확인했지만, 전체 게이트 및 운영 배포 후 확인은 남아 있다.

### 다음 개선
- 다른 공급자(KIS 시세·SEC·RSS·Discord) 오류 로그에서 원문 payload나 URL query credential을 직접 출력하는 경로를 대조한다.

### 커밋·푸시·배포
- 미실행: 전체 검증 후 진행한다.

## [2026-10-16] CRON_SECRET 인증 검증 경로 공통화

### 목표
- 예약·스캔·관리 진단 API에서 중복 구현된 CRON_SECRET 파싱을 공통 계약으로 통일하고, 인증 회귀가 새 라우트에서 재발하면 배포 전에 자동 차단한다.

### 반영
- 개선 과제 ID: CI-2026-10-16-009
- 기존 인증 라우트 다수에서 `x-cron-secret`/Bearer 파싱과 공백 처리 방식이 달랐음을 확인했다. 일부는 header 값을 trim하지 않고, 일부는 Bearer prefix 처리 방식이 달랐다.
- 예약·스캔·RSS 저장·캘린더·진단 API 30개 라우트를 `isCronRequestAuthorized`로 통합했다. helper는 설정값과 헤더를 trim하고, Bearer 스킴을 대소문자 무관하게 파싱하며, 상수 시간 비교를 수행하고 query secret을 받지 않는다.
- 관리자 디버그 스위트는 기존 관리자 세션 인증을 유지하면서 cron 대체 인증만 공통 helper로 위임한다.
- `audit:bearer-auth`를 확장해 API route에서 직접 CRON_SECRET 인증을 새로 구현하면 실패하도록 했다. CRON_SECRET 설정 여부만 진단 응답으로 제공하는 `admin/market-debug`는 명시적 비인증 예외로 둔다.

### 검증
- 집중 회귀 테스트: 3개 파일, 13개 테스트 통과.
- 최종 `npm.cmd run deploy:verify` 통과: production build, standalone smoke(`/charts` 200, KR/US top-rising API 200, unauthenticated admin/cron 401), 테스트 195개 파일 통과/1개 skip(668개 통과/1개 skip), typecheck, docs, verify-scope, KIS boundary, auth audit, OCI cron(21 endpoints).
- `npm.cmd run audit:bearer-auth`가 API route 170개를 검사했고, CRON_SECRET 인증 구현은 공통 helper 사용으로 통일됐다. 설정 상태만 진단하는 명시 예외는 1개다.
- 최초 문서 검사는 `미실행` 설명에 포함된 단어를 배포 완료 상태로 오인해 실패했다. 상태 문구를 고친 뒤 최종 전체 검증에서 docs gate도 통과했다.

### 남은 위험 및 다음 개선
- 개별 비즈니스 라우트가 Cron 호출 후 수행하는 작업의 권한·중복실행 정책은 이번 인증 파서 변경 범위가 아니다.
- 별도 키(`DAILY_CACHE_API_KEY`, 사용자 세션, webhook 서명 등)를 사용하는 공개·관리 API는 CRON_SECRET 계약과 별도 검토한다.

### 개선 과제
- 성과 판정: UNMEASURED
- 근거: 공통 helper 적용, 집중·전체 테스트 및 local standalone 실행은 통과했지만 운영 배포 후 SHA/인증 확인은 아직 남아 있다.
- 완료 기준: 전체 배포 검증 통과, OCI cron 헤더 호출 유지, 배포 후 commit SHA와 인증 응답 확인.

### 다음 개선
- 관리자·공개 API의 별도 인증 체계와 민감정보 로그 노출을 인벤토리화하고 토큰 노출 회귀 테스트를 추가한다.

### 커밋·푸시·배포
- 미실행: 전체 검증 후 커밋·푸시·배포한다.

## [2026-10-16] Cron 비밀값의 URL 쿼리 전달 제거

### 목표
- 예약 작업 인증 비밀값이 URL에 들어가 프록시·웹서버 접근 로그 등에 남을 수 있는 경로를 제거하고, 저장소에서 사용하는 헤더 방식만 지원한다.

### 반영
- 개선 과제 ID: CI-2026-10-16-008
- OCI cron 호출은 이미 `x-cron-secret` 헤더를 사용함을 `scripts/oci-cron.sh`에서 확인했다.
- `/api/cron/sync-filings`와 `/api/cron/us-breaking-news-forwarder`가 지원하던 `?secret=` fallback을 제거하고, 공통 `isCronRequestAuthorized`를 사용하도록 변경했다.
- 공통 검사기는 `x-cron-secret`과 대소문자 무관 `Bearer` Authorization을 지원하고, 기대값·헤더 공백을 정규화하며 URL query는 절대 인증에 사용하지 않는다.
- 회귀 테스트는 헤더 인증, Bearer 공백, 빈 사용자 정의 헤더 fallback, 미설정/오류 비밀값, query 거부 및 두 API 메서드(GET/POST) 동작을 고정한다.

### 검증
- `npm.cmd run deploy:verify` 최종 재실행 통과: production build, standalone smoke(`/charts` 200, 국내·해외 top-rising API 200, unauthenticated admin/cron 401), 테스트 195개 파일 통과/1개 skip(666개 통과/1개 skip), typecheck, docs, verify-scope, KIS boundary, Bearer audit(170 routes), OCI cron(21 endpoints).
- 최초 전체 검증은 최신 DEVELOPMENT_LOG 계약 누락으로 `docs:check`에서 실패했다. 로그 계약을 충족하도록 수정한 뒤 전체 검증을 처음부터 다시 실행해 통과했다.
- 집중 테스트: 2개 파일, 9개 테스트 통과; `git diff --check` 통과.

### 남은 위험 및 다음 개선
- 다른 API 경로에도 legacy CRON_SECRET 파서가 남아 있어 인증 계약의 전면 통일은 미완료다. 이 변경은 URL query secret을 허용했던 두 엔드포인트만 다루며, 나머지 호출 경로는 별도 호출자 호환성 확인 후 순차 이전한다.
- 배포 후 query credential 요청은 401, 기존 `scripts/oci-cron.sh` 헤더 요청은 정상 동작하는지 운영 스모크로 확인한다.
- 쿼리 파라미터 자체를 애플리케이션 접근 로그에 기록하는 다른 API도 별도 점검한다.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: query parameter만 제공된 요청이 두 cron route에서 401로 거부되고, 내부 OCI의 기존 헤더 인증 방식은 route 테스트와 배포 검증에서 유지됨을 확인했다. 첫 문서 게이트 실패도 로그 계약 수정 후 전체 검증 재실행으로 해소했다. 운영 반영은 아직 미확인이다.
- 완료 기준: 전체 배포 검증 통과, 호출 스크립트 호환성 검증, 운영 SHA 및 인증 스모크 확인.

### 다음 개선
- 나머지 CRON_SECRET 보호 라우트의 인증 방식과 호출자를 인벤토리화하고, 공통 helper 이전을 단계별로 적용한다.

### 커밋·푸시·배포
- 미실행: 전체 검증은 통과했으며, 이 검증 결과 기록 변경의 재검증 후 커밋·푸시·배포한다.

## [2026-10-16] standalone smoke를 테스트 자원 사용 전에 실행

### 목표
- constrained local runner에서 전체 테스트 뒤 standalone `/charts` smoke가 간헐적으로 request timeout되는 검증 순서 문제를 줄인다.

### 반영
- 개선 과제 ID: CI-2026-10-16-007
- 원인 근거: 같은 빌드·코드에서 test suite는 통과하고 Next readiness도 startup 오류 없이 확인됐지만, 테스트 완료 직후 standalone `/charts`만 15초 timeout됐다. 시스템 메모리 여유는 약 2.7GB였다.
- 검증 순서를 `build → standalone runtime smoke → resource-heavy quality suite`로 분리하는 `runDeploymentVerification`을 추가했다.
- 단계 순서를 회귀 테스트로 고정해 runtime smoke가 테스트 suite 뒤로 이동하면 테스트가 실패한다.

### 검증
- 단계 순서 단위 테스트 및 전체 배포 검증은 커밋 전 실행 예정이다.
- 이전 재시도에서도 build·659개 전체 테스트·typecheck·정적 감사는 통과했으나 runtime smoke가 반복 timeout되어 최종 성공으로 처리하지 않았다.
- 수정 후 `npm.cmd run deploy:verify` 통과: production build, 195개 테스트 파일 중 194개 통과/1개 skip(660개 통과/1개 skip), typecheck, docs, verify-scope, KIS boundary, Bearer auth audit(170 routes), OCI cron 21 endpoints.
- Runtime smoke가 테스트 suite 전에 통과: TCP 7,532ms, Next ready 10,968ms, `/charts` 200, KR/US top-rising 200, 예상한 invalid/unauthorized 400·401, 종료 정리 완료.

### 다음 개선
- 이 순서 변경 후 CI와 로컬에서 `/charts`의 cold-start 응답 시간을 누적 기록해 15초 상한이 적정한지 실측한다.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 테스트 자원 압박 전 runtime smoke를 수행한 최종 검증에서 `/charts` 제한시간 초과가 재현되지 않았고 모든 smoke·quality gate가 통과했다.

### 커밋·푸시·배포
- 완료: 커밋 `b3069d2f000f283409eba0e163731127b8d66b4a`을 `oci`에 push했다. 운영 `/api/debug/health`가 동일한 SHA와 `status: ok`를 반환해 배포를 확인했다.

## [2026-10-16] Bearer 인증 정규식 재발 방지 게이트 추가

### 목표
- API route에 Bearer 공백 정규식 이중 이스케이프가 재도입되는 것을 배포 전 자동으로 차단한다.

### 반영
- 개선 과제 ID: CI-2026-10-16-006
- `scripts/audit-bearer-auth.mjs`가 `app/api`의 route 파일을 훑어 잘못된 `Bearer\\s` source 패턴을 찾으면 실패한다.
- 정상 공백 정규식 허용 및 이중 이스케이프 감지 테스트를 추가했다.
- `npm run audit:bearer-auth`를 `deploy:verify` 및 표준 `verify` 흐름에 연결하고 배포 체크리스트에도 추가했다.

### 검증
- 감사 단위 테스트: 2/2 통과.
- 실제 API route 170개 감사 통과; 현재 이중 이스케이프 파서 0건.
- 전체 `npm.cmd run deploy:verify` 통과: production build, 194개 테스트 파일 중 193개 통과/1개 skip(659개 통과/1개 skip), typecheck, docs:check, verify-scope, KIS boundary, Bearer auth audit, OCI cron 21 endpoints.
- Standalone smoke 통과: `/charts` 200, invalid KIS market 400, KR/US top-rising chart 200, 보호된 admin/cron 미인증 401, 프로세스 종료 정리 완료.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.

### 다음 개선
- cron/API 인증 파서가 중앙 공통 함수를 사용하도록 점진적으로 통합하고, header precedence와 whitespace 동작을 동일한 계약 테스트로 검증한다.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 이전에는 발견된 오타를 고치는 회귀 테스트만 있었고 다른 route의 재발은 자동 감지하지 않았다. 이제 배포 검증이 API route 전부를 검사하고 잘못된 source pattern이 있으면 실패한다.

### 커밋·푸시·배포
- 완료: 커밋 `d5bf82b8204397b6ccc650d89149d32e627d0ac3`을 `oci`에 push했다. 운영 `/api/debug/health`가 동일한 commit SHA와 `status: ok`를 반환해 배포 반영을 확인했다.

## [2026-10-16] 헬스 스냅샷 cron Bearer 인증 파서 수정

### 목표
- 지원되는 `Authorization: Bearer <secret>` 호출이 헬스 스냅샷 API에서 정상 인증되도록 수정한다.

### 반영
- 개선 과제 ID: CI-2026-10-16-005
- 원인: route의 정규식이 공백 문자 `\s` 대신 리터럴 `\\s`를 찾도록 이중 이스케이프되어 Bearer 접두사를 제거하지 못했다. `x-cron-secret` 인증에는 영향이 없다.
- 정규식을 바로잡고 접두사 뒤 토큰을 trim했다. 대소문자 혼합·복수 공백을 포함한 Bearer 회귀 테스트를 추가했다.
- 재발 자동 감지: endpoint 테스트가 Bearer 인증으로 실제 POST 성공(200) 및 3개 probe 기록을 검증한다.

### 검증
- 전용 Vitest: 1개 파일, 3개 테스트 통과.
- 전체 `npm.cmd run deploy:verify` 통과: production build, 193개 테스트 파일 중 192개 통과/1개 skip(657개 통과/1개 skip), typecheck, docs:check, verify-scope, KIS boundary, OCI cron 21 endpoints.
- Standalone smoke 통과: `/charts` 200, invalid KIS market 400, KR/US top-rising chart 200, 보호된 admin/cron 미인증 401, 프로세스 종료 정리 완료.
- 운영 API 사전 진단: 9개 probe 모두 성공, 전체 응답 63ms; health-probe-history 최근 기록에도 실패·경보 없음.
- 배포 후 운영 Bearer 인증 검증: `POST /api/cron/health-probe-snapshot` 응답 `ok:true`, `recorded:3`; db_connection 12ms, automation_history_latest 3ms, health_schema 31ms 모두 성공.

### 다음 개선
- 다른 cron endpoint의 Bearer 파서 변형을 정적 검사해 이중 이스케이프가 재발하지 않는지 일괄 점검한다.

### 개선 과제
- 성과 판정: IMPROVED
- 근거: 이전 정규식은 정상 Bearer 헤더를 토큰으로 정규화하지 못했다. 수정 후 대소문자 혼합 및 공백 포함 요청이 인증되어 성공하는 회귀 테스트를 추가했다.

### 커밋·푸시·배포
- 코드 커밋 `58721213f686f28e6308a754509c5c1c7131e5c0`를 `oci`에 push했고, Deploy OCI run `38787242166` 성공으로 운영 배포 완료.

이 문서는 프로젝트의 개발 과정과 변경 사항을 기록합니다.

## [2026-10-16] 검증 명령 timeout 후 프로세스 트리 정리 보장

### 목표
- build/test/typecheck 명령이 제한시간을 넘겨 실패할 때 자식 및 하위 프로세스가 백그라운드에 남거나 다음 검증과 겹치지 않도록 한다.

### 반영
- 추적 ID: CI-2026-10-16-004
- 원인: `run()`의 timeout handler는 Windows `taskkill /t /f`를 시작만 하고 기다리지 않은 채 reject했다. taskkill 실행 오류도 listener가 없어 unhandled error가 날 수 있었다.
- `scripts/child-process-lifecycle.mjs`로 종료 대기와 단계적 정리를 분리했다. Windows는 taskkill tree 종료 후 실패·미종료 시 직접 종료와 재시도를 하고, POSIX는 SIGTERM 후 필요 시 SIGKILL로 승격한다.
- 검증 명령 timeout은 프로세스 정리 완료 후 반환하고, 정리 성공/실패를 구분해 로그에 기록한다.
- Windows taskkill 완료 대기, taskkill 시작 실패 fallback, POSIX 강제 종료 승격에 대한 회귀 테스트를 추가한다.

### 검증
- `npx.cmd vitest run scripts/child-process-lifecycle.test.mjs scripts/runtime-startup-signals.test.mjs` 6/6 통과, `node --check` 및 `git diff --check` 통과.
- 전체 `npm.cmd run deploy:verify` 통과: production build, 193개 테스트 파일/657개 테스트, typecheck, docs, verify-scope, KIS boundary, OCI cron 21 endpoints.
- standalone smoke: TCP 준비 5,456ms, Next ready 신호 관측 7,569ms, `/charts` 200, invalid KIS market 400, KR/US rising chart 200, admin/cron unauthenticated 401, standalone process cleanup 완료.
- timeout 자체를 일부러 발생시키는 통합 smoke는 운영 검증 파이프라인을 지연시키므로 실행하지 않았다. OS별 종료 시나리오는 이식 가능한 fake-process 주입 테스트 4개로 검증했다.

### 다음 개선
- CI에서 실제 명령 timeout이 발생하면 `timed-out process cleanup complete`가 출력되고, 해당 run의 자식 프로세스가 남지 않는지 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-16-004
- 성과 판정: IMPROVED
- 근거: 전체 deploy gate/standalone smoke가 통과했고 테스트가 Windows taskkill 완료 대기, taskkill 시작 실패 및 정체 fallback, POSIX SIGTERM→SIGKILL 승격을 검증했다.
- 성공 기준: `deploy:verify` 전체 통과, lifecycle 회귀 테스트 및 standalone cleanup 확인.

### 커밋·푸시·배포
- 배포 완료: commit `9bb3f3dd5ce4567b642d5a3cff6208959800eb2b`를 `oci`에 push, Deploy OCI run `38783610415` 성공.
- 운영 확인: `/api/health` HTTP 200, `status=ok`, 응답시간 489ms.

## [2026-10-16] 배포 smoke 준비 로그 관측 경쟁 조건 수정

### 목표
- TCP listener 연결 직후 준비 로그를 확인해 실제 준비 신호가 도착하기 전에 `false`로 기록되는 관측 경쟁 조건을 없앤다.

### 반영
- 추적 ID: CI-2026-10-16-003
- 이전 `deploy:verify` 실행에서 TCP 준비와 `/charts` HTTP smoke는 통과했지만 `nextReady=false`로 기록됐다.
- standalone 서버를 별도로 실행해 Next 15 출력 `✓ Ready in 226ms`를 확인했다. TCP 연결 직후 로그를 찍는 순서 때문에 준비 문구가 아직 도착하지 않은 상태를 읽는 경쟁 조건이었다.
- 준비 로그 최초 관측 시각(`nextReadyObservedMs`)을 측정하고, 임의 청크 경계에 걸친 로그 문구도 판별하도록 최근 128자만 안전하게 이어 붙인다. 원시 서버 로그는 기록하거나 노출하지 않는다.
- 준비 상태 요약은 HTTP smoke 전체가 끝난 뒤에 출력해 진단 시점과 의미를 맞춘다. 실제 HTTP 요청 성공을 readiness 신호 대신으로 간주하지 않는다.

### 검증
- 첫 `npm.cmd run deploy:verify`는 새 개발 로그가 필수 템플릿을 따르지 않아 `docs:check`에서 실패했다. 로그를 프로젝트의 개선 과제 형식에 맞춘 뒤 재실행했다.
- `node --check` 및 targeted tracker test 2/2 통과. 최종 `npm.cmd run deploy:verify` 성공: production build, 192 test files/653 tests, typecheck, docs, verify-scope, KIS boundary, OCI cron 21 endpoints.
- standalone runtime: TCP 준비 5,458ms, Next 준비 신호 최초 관측 7,326ms, `/charts` 200, invalid KIS market 400, KR/US rising APIs 200, 무인증 admin/cron 401, 프로세스 cleanup 완료.
- 이전 실행에서 readiness가 false로 찍힌 현상은 TCP 연결 직후 상태를 읽은 경쟁 조건으로 설명된다. 과거 `/charts` AbortError 자체는 재현되지 않아 별도 근본 원인 미확정 상태를 유지한다.

### 다음 개선
- 전체 검증에서 `nextReadyObservedMs`, `/charts` 및 API 응답, 프로세스 cleanup가 모두 확인되는지 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-16-003
- 성과 판정: IMPROVED
- 근거: 최종 deploy gate가 통과했고, Next 준비 신호의 관측 시간이 표시되며 HTTP smoke 및 프로세스 cleanup가 실제 standalone 실행에서 성공했다.
- 성공 기준: `deploy:verify` 전체 통과 및 Next 준비 관측시각, HTTP smoke 상태, 프로세스 cleanup 확인.

### 커밋·푸시·배포
- 배포 완료: 코드 커밋 `95c6f2a1ef3c72ac0ce2301ee1ab55b33af6a5fd`를 `oci`에 push했고 Deploy OCI run `38779494187` 성공.
- 배포 후 운영 `/api/health`: HTTP 200, `status=ok`, 응답시간 475ms.
- 문서 결과 갱신 후에도 커밋 전 전체 `deploy:verify` 및 문서 검사를 다시 수행한다.

## [2026-10-16] DB health probe 추세 수집과 관리자 경보

### 목표
- 진단 API의 일회성 응답시간만으로는 시간대별 지연·연속 오류를 알 수 없으므로, 운영에서 주기적으로 측정하고 관리자 화면에서 추세를 확인한다.

### 반영
- 원인: 기존 `/api/admin/health-diagnostics`는 호출 시점에만 probe별 `durationMs`를 반환하며 결과를 저장하거나 추세/경보를 계산하지 않았다.
- Flyway V150 `health_probe_history` 및 probe별·시간별 조회 인덱스를 추가한다. 스키마는 probe 이름, 소요시간, 성공 여부, 오류 코드, 실행 식별자만 보관하고 14일 보존한다.
- OCI 5분 cron 시작 시 DB 연결·automation history 조회·health schema probe를 실행하고 개별 측정 결과를 기록한다. 자격 증명/SQL 결과 행은 저장하지 않는다.
- 관리자 전용 `/api/admin/health-probe-history`와 `/admin/health-probes`를 추가한다. 최근 24시간 표본/평균/최대/실패 수와 최근 기록을 제공하고, probe 3회 연속 실패 및 최근 성공 probe 1,000ms 이상을 표시한다.
- 검증 대상을 cron 인증/부분 실패 기록, 경보 임계값, 관리자 메뉴 등록 및 OCI cron 등록으로 고정한다.

### 검증
- `npm.cmd run deploy:verify` 성공: Next production build, 191개 테스트 파일에서 651 passed, TypeScript, docs(최신 migration V150), verify-scope, KIS boundary, OCI cron 21 endpoints 및 standalone HTTP smoke.
- Standalone HTTP 결과: `/charts` 200, 유효하지 않은 KIS market 400, 국내/해외 TOP 상승 차트 API 200, 관리자 history API와 cron API는 자격증명 없이 각각 401.
- 첫 smoke 실패를 조사하며 격리 worktree에 `.env.local`이 없음을 확인했다. 주 프로젝트 파일을 수정하지 않고 임시 하드링크로 환경만 연결했으며 SHA-256 일치를 확인했다. 기본 동적 포트에서 timeout이 재현됐으나 고정 포트 `3333`의 최종 전체 검증은 통과했다. 별도 수동 standalone 재현도 `/charts` 200을 반환했다.
- 수동 standalone 프로세스가 `.next-deploy-verify`를 사용하는 동안 후속 빌드가 겹치는 것을 발견하고, 최종 전체 검증 전에 두 프로세스를 종료했다. 이 worktree의 `.env.local` 임시 링크는 검증 후 제거한다.
- 배포 결과: `https://github.com/pjtss/StockMan/actions/runs/38771175760` 성공. 운영 admin 진단 API가 Flyway V150(`health probe history`)을 확인했고, 공개 `/api/health`는 `ok`/21ms였다.
- 운영 검증: cron snapshot POST HTTP 200/`recorded: 3`; 관리자 history GET HTTP 200, 새 probe 행 6개, 경보 0개. 무인증 admin/cron 요청은 로컬 standalone에서 모두 401이었다.
- 배포 결과 기록 후 재실행한 docs-only 게이트도 build·651 tests·typecheck·docs·scope/KIS/cron 검사까지 통과했으나 자동 runtime smoke가 `/charts` timeout으로 종료됐다. 동일 freshly-built standalone을 별도 실행해 `/charts` 200, admin 무인증 401, cron 무인증 401을 직접 확인했다. 자동 smoke timeout 원인은 아직 미확정으로 남긴다.
- 격리 worktree의 `.env.local` 임시 링크와 테스트용 standalone 프로세스는 모두 제거/종료했다. 원본 환경 파일은 남아 있다.

### 다음 개선
- 운영 표본 24시간이 쌓인 뒤 실제 평균/최대/연속 실패를 확인하고, 1초 기준이 유의미한지 재평가한다. 현재는 단일 스냅샷 slow alert이며 p95 및 복구 알림은 후속 과제다.
- 자동 `deploy:verify` smoke의 간헐 timeout 원인을 분리하기 위해 실행기 로그와 포트·프로세스 종료 상태를 추가 관측한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-16-001
- 성과 판정: IMPROVED
- 근거: 운영 Flyway V150 확인, live cron snapshot 3개 probe 저장 성공, history API 6행 반환 성공. 진단 계측은 0개 표본에서 실제 운영 표본을 갖추게 됐다.
- 성공 기준: cron이 probe를 기록하고 실패 일부를 보존, 관리자 전용 trend API/UI가 24시간 데이터와 지정 경보를 제공, 배포 검증 및 운영에서 migration/API 응답을 확인.

### 커밋·푸시·배포
- 완료: commit `aa5d607b8a0fad04b7ae39825e323df170508a0f`를 `oci`에 push. Deploy OCI run `38771175760` 성공, 운영 Flyway/API/실제 probe 기록 검증 완료.

## [2026-10-16] 배포 smoke 실패 원인 관측 강화

### 목표
- standalone smoke timeout이 재발하면 서버 미기동과 HTTP route 지연을 구분하고, 테스트 프로세스가 다음 검증과 겹치지 않게 종료를 확인한다.

### 반영
- 발견: `verify-deploy.mjs`가 standalone stdout/stderr를 버려 기동 상태를 알 수 없고, Windows `taskkill`을 시작만 한 뒤 종료를 기다리지 않았다.
- TCP listener 준비시간, Next `Ready` 신호, 허용된 오류 코드(EADDRINUSE/EACCES 등)만 비민감 요약으로 보존한다. 원시 서버 로그는 출력하지 않는다.
- smoke 전에 TCP listener를 별도 대기해 bind 실패와 HTTP 응답 timeout을 분리하며, Windows tree-kill 종료를 기다리고 미종료 시 직접 종료 후 실패시킨다.

### 검증
- `node --check scripts/verify-deploy.mjs` 통과. `npm.cmd run deploy:verify` 성공: build, 191개 테스트 파일/651 tests 통과, typecheck, docs, verify-scope, KIS boundary, OCI cron 21 endpoints.
- standalone runtime: TCP listener 준비 5,419ms, `/charts` 200, invalid KIS market 400, KR/US rising chart 200, admin/cron unauthenticated 401. 자식 프로세스 종료 확인 후 게이트 성공.
- 이번 실행은 통과했지만 이전 AbortError의 구체적 재현 원인은 확정되지 않았다. 새 TCP 단계 계측은 미기동과 라우트 지연을 다음 재발 때 구분하기 위한 방지책이며, 근본 원인 확정으로 간주하지 않는다.
- 로컬 `.env.local`은 해시 검증된 임시 하드링크만 사용하고 검증 종료 후 제거한다. 환경 파일 값은 출력하지 않는다.

### 다음 개선
- 결과에서 TCP 준비는 성공하지만 `/charts`만 지연되는 것으로 확인되면 route별 SSR/runtime dependency를 다음 단계로 추적한다. listener가 열리지 않으면 포트 충돌·bind·기동 오류 코드부터 조사한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-16-002
- 성과 판정: IMPROVED
- 근거: 새 계측 적용 후 전체 deploy gate가 통과했고 TCP 준비시간 5,419ms, HTTP smoke 상태코드, 자식 프로세스 종료를 실제로 확인했다. 다만 과거 AbortError의 근본 원인은 미확정으로 남아 있다.
- 성공 기준: 배포 검증에 성공하거나, 실패 시 TCP 단계·HTTP 단계·안전한 기동 오류 요약 중 어느 단계인지 명확히 남기고 자식 프로세스 종료 완료를 확인한다.

### 커밋·푸시·배포
- 코드·검증 로그 커밋: `219ad59fabdbd83e4f077c2d0ee0fa96a97e953f` (`배포 smoke 기동 진단과 프로세스 정리 보강`).
- `oci` push 완료. Deploy OCI run `38775143938` 성공(배포 워크플로 전체 완료).
- 운영 확인: `https://stockman.r-e.kr/api/health` HTTP 200, `status=ok`, 응답시간 130ms. 이 CI 검증기 변경은 애플리케이션 런타임/API 동작 변경은 아니다.

## [2026-10-15] health 이력 조회 부분 실패 격리

### 목표
- 자동화 이력 조회 하나가 실패해도 성공한 다른 health 데이터를 유지하고, 조회 실패를 실제 실행 이력 부재로 잘못 표시하지 않는다.

### 반영
- `getHealthSnapshot()`의 세 history SQL을 각각 독립적으로 실패 처리해 한 쿼리 실패가 다른 조회 결과를 초기화하지 않게 한다.
- `automationHistoryAvailable`, cache별 `historyAvailable`/`lastSuccessAvailable` 상태를 반환하고 `/health-check`에 `이력 조회 실패`를 표시한다.
- 자동화 최신 조회와 마지막 성공 조회의 개별 실패를 주입하는 회귀 테스트를 추가해 나머지 데이터 보존을 확인한다.

### 검증
- 발견 근거: 실제 운영에서 캐시 이력 쿼리 timeout을 겪은 구조가 한 바깥 `try/catch`에 묶여 있어, `Promise.all` 한 곳의 rejection이 성공한 automation query 결과까지 버리는 것을 코드로 확인했다.
- 장애 주입 데이터 테스트와 렌더 테스트: `npm.cmd test -- --run app/health-check/page.test.tsx lib/health-check-query-resilience.test.ts lib/health-check-query-concurrency.test.ts lib/health-check.test.ts` 4개 파일, 6개 테스트 통과. 타입 검사와 `git diff --check` 통과.
- `scripts/dev-server.mjs` 실행에서 `/health-check` HTTP 200, 실제 빈 history는 `실행 이력 없음`으로 표시됐다. `/api/health`는 HTTP 503/degraded였으며 로컬 DB가 Flyway 148이고 필수 운영 테이블 `debug_run_items`, `debug_kis_calls`가 없어 발생한 기존 로컬 스키마 차이임을 read-only 조회로 확인했다. 로컬 DB에는 migration을 적용하지 않았다.
- 최종 `npm.cmd run deploy:verify`: production build, 전체 646 tests passed/1 skipped, typecheck, docs, 범위/KIS/cron 감사와 standalone HTTP smoke 통과.
- Deploy OCI workflow `38706334906` 성공 후 운영 `/health-check` HTTP 200, `/api/health` HTTP 200/status `ok`/48ms. 정상 운영 데이터에서 실패 표시 문구는 없고 빈 이력 표시도 노출되지 않았다.

### 다음 개선
- 운영 DB query 지연이 재발할 때 admin diagnostics의 probe 시간과 health 페이지의 `이력 조회 실패` 상태를 대조해 원인을 기록한다. 정기 수집·경보는 별도 개선 과제로 추적한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-15-002
- 성과 판정: IMPROVED
- 근거: 쿼리 실패 주입 테스트에서 automation 조회가 실패해도 cache 결과를 유지하고, 마지막 성공 조회 실패 시 최신 automation/cache 결과를 유지함을 입증했다.
- 성공 기준: 개별 history query 실패 시 다른 query 결과 보존, 사용자 화면에 조회 실패 명시, 공개 `/api/health` 계약 유지.

### 커밋·푸시·배포
- 완료: commit `6bd927c5c8759d0bd7b25f99d70aca6a436b2fcf`를 `oci`에 push하고 Deploy OCI run `38706334906` 성공. 운영 health 페이지와 API를 확인했다.

## [2026-10-15] 운영 health 자동화 이력 조회 병목 해소

### 목표
- 운영 단계별 진단에서 확인한 automation_runs 이력 병목을 줄이고, 캐시 상태 조회의 statement timeout 재발을 운영 데이터로 검증한다.

### 반영
- commit `29183d6e`에서 전체·캐시별 DISTINCT ON 조회를 모듈별 LATERAL LIMIT 1로 변경하고 독립 조회를 병렬화했다. 첫 운영 배포 결과 전체 자동화 조회는 51ms였으나 캐시 최신/마지막 성공은 각각 1.5초 timeout이었다.
- commit `05867f09`에서 상태 조건별 부분 인덱스 V149를 추가했다. non-SKIPPED 실행용 `(module_key, started_at DESC)` 및 SUCCESS 실행용 같은 인덱스에 `finished_at` INCLUDE를 적용했다.
- 범위는 health query, 관리자 단계별 진단, 회귀 테스트, Flyway migration 및 운영/개발 문서다.

### 검증
- 최초 적용 근거는 운영 `/api/admin/health-diagnostics`: automation_latest_by_module 51ms, cache_latest_by_module 1503ms/57014, cache_last_success_by_module 1510ms/57014, 설정 조회 8ms.
- V149 적용 확인은 운영 `/api/admin/market-debug?market=ALL`: Flyway version 149, description `automation cache history partial indexes`.
- 최종 운영 `/api/admin/health-diagnostics`: 전체 응답 355ms, automation_latest_by_module 94ms, cache_latest_by_module 22ms, cache_last_success_by_module 11ms, 나머지 probe 모두 성공. 공개 `/api/health` HTTP 200, status `ok`.
- `npm.cmd run deploy:verify`: production build, 642 tests passed/1 skipped, typecheck, docs(143개 migration/V149), 범위/KIS/cron 검사 및 standalone `/charts`·차트 API smoke 통과. V149 SQL은 로컬 PostgreSQL transaction에서 실제 생성 확인 후 rollback했다.
- Deploy OCI run `38700748463`(1차 query) 및 `38702097741`(V149) 모두 성공했다.

### 다음 개선
- 다음 개선: 운영 진단 API 응답시간과 health probe를 주기적으로 추세화하고, 개별 DB probe가 1초를 넘거나 57014가 재발하면 관리자 관측 화면에서 바로 식별할 수 있도록 경보 임계값을 설계한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-15-001
- 성과 판정: IMPROVED
- 근거: cache_latest_by_module 1503ms/57014 → 22ms, cache_last_success_by_module 1510ms/57014 → 11ms. automation_latest_by_module은 51ms~94ms이며 전체 진단은 355ms, `/api/health`는 200/ok. Flyway 149 적용도 확인했다.
- 성공 기준: 운영 캐시 이력 probe가 각각 1.5초 이내 정상 완료하고, `/api/health`가 정상이며, 마이그레이션 버전이 149 이상일 것. 세 기준을 모두 충족했다.

### 커밋·푸시·배포
- 완료: query 최적화 commit `29183d6e31436419fc968ce6cf4c8d2496a8998d` 및 V149 인덱스 commit `05867f0959a11954cb95fd76955c8fb85451c35f`를 `oci`에 순차 push했다. Deploy OCI run `38700748463`, `38702097741` 모두 성공했고 최종 운영 진단 및 health endpoint까지 확인했다.

## [2026-10-12] KIS 해외주식 조건검색 API 계약·보통주 검증 보강

### 목표
- 보관된 KIS Open API 공식 명세를 기준으로 해외 조건검색의 요청·응답 계약을 명확히 하고, 검색 결과가 프로젝트의 활성 보통주 전용 원칙을 지키도록 한다.

### 반영
- `lib/kis-us-condition-search.ts`: 조건 파라미터·숫자 범위·시장·중복 입력을 검증하고 KIS 응답의 `output2`만 종목 행으로 파싱한다. HTML/잘못된 JSON/객체 배열이 아닌 `output2`를 분리하고 토큰 만료 시 1회 갱신한다. KIS 호출은 기존 공통 제한기(최대 안전 TPS 10)를 사용한다. 종목 행에 거래소 코드가 없거나 요청 시장과 다르면 fail-closed한다.
- `app/api/kis/us-search/route.ts`: 후보 티커를 `us_common_stock_universe`의 `enabled`, `daily_active`, `COMMON_STOCK`, 상품 제외 플래그와 대조한다. 마스터 조회 실패는 fail-closed로 HTTP 503을 반환한다. 제외 종목은 JSON 응답과 `kis_signal_snapshots`의 payload/rawPayload에 쓰지 않는다. 토큰 중복 조회를 제거하고 스냅샷 쓰기 실패는 응답의 warning으로 표시한다.
- `lib/kis-us-trade-trend.ts`: 조건검색 구현을 전용 모듈로 이동해 기존 일반 시세 모듈의 미검증 입력 병합 경로를 제거했다.
- `lib/kis-us-condition-search.test.ts`, `app/api/kis/us-search/route.test.ts`: 입력 검증, 100건·페이지네이션 계약, 토큰 재발급, `output1` 오파싱 방지, DB 보통주 fail-closed, 응답·스냅샷 비보통주 차단 테스트를 추가했다. 실제 PostgreSQL 배열 조건은 프로젝트의 `getPool().query` 바인딩을 사용한다.
- `docs/api/KIS_US_CONDITION_SEARCH.md`, `docs/KIS_DETECTION_API_CATALOG.md`: 공식 명세 시트 `해외주식조건검색` 기반으로 파라미터·단위·응답·오류·페이지 제한·프로젝트 필터를 기록했다.
- `scripts/kis-module-registry.mjs`, `scripts/audit-kis-boundary.mjs`, `docs/architecture/external-request-boundaries.md`: 새 KIS 모듈·endpoint·테스트의 경계 감사 연결을 등록해 다음 유사 API 추가 때도 빠진 등록을 자동 탐지한다.

### 검증
- 공식 문서 `docs/references/한국투자증권_오픈API_전체문서_20260727_030000.xlsx`의 `해외주식조건검색` 시트를 확인했다. 공식 API ID `v1_해외주식-015`, TR ID `HHDFS76410000`, endpoint, 입력 필드, `output2` 스키마, 최대 100건 및 다음 조회 미지원 사항을 대조했다.
- 전용 Vitest: 24개 통과. `npm.cmd run typecheck`: 통과.
- 첫 `npm.cmd run deploy:verify`에서 production build와 전체 Vitest(182개 파일, 628 통과·1 skip), typecheck, docs 및 범위 감사는 통과했다. KIS boundary audit가 신규 모듈 registry 누락을 검출해 등록과 감사 테스트 매핑을 보완했다.
- PostgreSQL 실제 실행에서 Drizzle 템플릿의 배열 파라미터 표현이 `ANY(text[])`와 호환되지 않는 점을 발견했다. 드라이버 네이티브 바인딩으로 수정하고 회귀 테스트를 추가했다.
- 완료 감사에서 `output2`의 잘못된 원소 타입과 거래소 코드 누락 행이 보수적으로 거부되지 않음을 찾아 수정했다. 객체 배열 shape를 엄격 검증하고, KIS가 `excd`를 생략하면 요청 거래소로 간주하지 않는다.
- 추가 fail-closed 수정 후 최종 `npm.cmd run deploy:verify`: production build, 전체 Vitest(182개 파일, 629 통과·1 skip), typecheck, docs, 변경 범위 감사, KIS boundary audit, cron 검사와 standalone HTTP smoke 모두 통과.
- 새 standalone 서버에서 `.env.local`의 로컬 DB 및 KIS 자격증명을 사용해 조건검색을 직접 실행했다. NAS 응답은 HTTP 200, KIS `rt_cd=0`, 원본 100건 중 활성 보통주 80건만 반환하고 20건을 제외했다. 조회 경로의 실제 DB 자격 확인도 통과했다. 스냅샷 저장은 로컬 DB에 기존 `kis_signal_snapshots` 테이블이 없어 실패했으나 검색 응답은 정상이며 `snapshot.stored=false`로 노출됐다. 로컬 DB에 마이그레이션을 임의 적용하지 않았다.

### 다음 개선
- 배포 후 운영 API에서 NAS/NYS/AMS를 각각 호출해 KIS row 수, 보통주 제외 수, snapshot 저장 여부와 응답 시간을 확인한다. 로컬 스냅샷 저장을 확인하려면 운영에 이미 적용된 V119 이후의 DB migration을 로컬 DB에도 별도 승인 절차로 적용해야 한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-12-001
- 성과 판정: UNMEASURED
- 근거: 회귀 테스트와 전체 배포 검증 통과. 로컬 실제 KIS 호출에서 100개 중 활성 보통주 80개만 반환됨을 확인했다. 운영 배포 및 운영 API 검증은 아직이다.
- 성공 기준: 잘못된 조건은 HTTP 400, KIS transport/schema 실패는 구조화된 HTTP 502, 마스터 장애는 fail-closed HTTP 503이어야 한다. 성공 시 응답과 저장 스냅샷에 활성 보통주 외 행이 없어야 하며, KIS 최대 100건/페이지 미지원이 API 문서 및 응답 메타데이터와 일치해야 한다.

### 커밋·푸시·배포
- 기존 기능 배포 완료: 코드 커밋 `ed48439c`와 문서 커밋 `58298d4e`를 `oci`에 푸시했고 [최종 OCI 배포 workflow](https://github.com/pjtss/StockMan/actions/runs/38247656132)가 성공했다. 운영 API에서 잘못된 market 요청이 HTTP 400 JSON으로 처리되는 것을 확인했다. 이번 감사에서 보강한 응답 행 shape·거래소 코드 검증도 전체 빌드·테스트·standalone 실행에서 통과했으며, 별도 커밋·푸시·배포 전이다. 운영 KIS 실조회는 호출 비용·운영 부하를 고려해 별도로 실행하지 않았다.

## [2026-10-11] 미국 소형주 발행주식수 공개 API 검색 조건 확장

### 목표
- 공개 API에서 발행주식수 100만 주 미만과 사용자가 지정하는 USD 시총 구간을 검색할 수 있도록 한다.
- 기존 활성 보통주·ADR 방어·USD 1억 달러 이하라는 데이터 범위는 유지한다. UI·수집·DB 스키마는 변경하지 않는다.

### 반영
- `app/api/public/us-smallcap-shares/route.ts`: `minMarketCapUsd`, `maxMarketCapUsd`, `minShares`, `maxSharesExclusive`, `sharesBasis` 필터를 추가했다. 시총 하한/상한은 포함 경계이며, 주식수 하한은 포함·상한은 미포함이다. 기본 주식수 기준은 공개 필드 `sharesOutstanding`과 같은 SEC 최신 Company Facts이고, `sharesBasis=reviewed`일 때만 최근 1년 내 `VERIFIED` 검토 수량을 사용한다.
- 페이지네이션 커서 버전을 올리고 현재 시장·시총·주식수 조건을 커서에 결합했다. 다른 조건으로 커서를 재사용하면 `CURSOR_FILTER_MISMATCH`로 거부한다.
- `app/api/public/us-smallcap-shares/route.test.ts`: 필터의 SQL 바인딩·exclusive 경계·잘못된 범위·커서 필터 변경을 회귀 테스트에 추가했다.
- `docs/operations/us-smallcap-shares-public-api.md`: 매개변수, 경계 포함 규칙, 데이터 기준과 호출 예시를 기록했다.

### 검증
- 최초 API 버전은 커밋 `3a294c22`, Actions `38105461335`로 운영 배포 성공. 운영에서 reviewed 기준 1M 미만 결과가 0건임을 확인해 기본 주식수 필터 기준을 SEC 최신 원천값으로 바꾸고 reviewed 옵션을 별도 제공했다.
- 최신 코드의 `npm.cmd run deploy:verify` 통과: build 성공, 전체 605 passed·1 skipped, typecheck/docs/scope/KIS/cron 통과, standalone `/charts` 및 국내/해외 차트 API HTTP 200.
- 새 standalone 실행(준비 약 200ms)과 로컬 DB API read-only 검증: `sharesBasis=sec_latest`의 1M 미만 46건(435ms), `sharesBasis=reviewed` 12건(100ms), SEC 최신 수량 1M 미만+시총 USD 1천만~5천만 조합 5건(92ms). 잘못된 basis는 HTTP 400(5ms).
- 후속 커밋 `c9a582e4`의 운영 배포 Actions `38106135640` 성공. 운영 무인증 조회는 `sec_latest` 1M 미만 45건(4,283ms), USD 1천만~5천만 복합 조건 3건(473ms), `reviewed` 기준 0건(590ms), 잘못된 기준은 HTTP 400(322ms)을 확인했다. 특정시점 SEC 수량과 최신 시총은 시장변동·공시 시차로 매 응답마다 결과가 바뀔 수 있다.
- `next start`는 검증 스크립트의 별도 `.next-deploy-verify` 산출물을 찾지 못해 첫 시도에 실패했다. 검증 대상과 동일한 standalone `server.js`를 직접 시작해 API를 조회했고 환경 인증 값은 노출하지 않았다.

### 다음 개선
- 배포 후 운영 API에서 1M 미만·시총 구간 조합을 실제 조회하고 결과 수, 응답시간, DB 실행계획을 확인해 filter index 필요 여부를 결정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-11-001
- 성과 판정: UNMEASURED
- 근거: 전체 게이트와 로컬 DB 및 운영 API에서 SEC 최신·reviewed 기준, 시총 범위 복합 검색, 잘못된 입력을 검증했다. 운영 응답에서 기본 SEC 기준 45건과 복합 조건 3건을 확인했다. 기본 조회 첫 응답 4.283초는 개선 대상이다.
- 성공 기준: `maxSharesExclusive=1000000`이 선택된 `sharesBasis`에 엄격한 `<`로 적용되고, USD 시총 범위가 기존 1억 달러 ceiling 아래에서 동작하며, 필터 변경 커서가 차단된다. 회귀 테스트와 `deploy:verify`를 릴리스 게이트로 유지한다.

### 커밋·푸시·배포
- 완료: 최초 필터 구현 `3a294c22`와 기준 보완 `c9a582e4`만 각각 `oci`에 push했다. 후속 배포 Actions `38106135640` 성공 및 운영 API의 수량·시총 필터 응답을 확인했다. 현재 미커밋 로그 보완도 이 작업 변경만 포함한다.

## [2026-10-10] 미국 소형 보통주 발행주식수 공개 API

### 목표
- 운영에 이미 배포된 SEC 보통주 발행주식수 일일 수집 결과를 누구나 인증 없이 조회할 수 있도록 API로 공개한다.

### 반영
- 공개 GET `/api/public/us-smallcap-shares`를 추가했다. 인증 없이 종목별·시장별 조회, 최대 100건 keyset 페이지네이션을 제공하고 기존 SEC 공개 read rate limiter를 사용한다.
- 활성 COMMON_STOCK, 승인 거래소, USD 시총 1억 달러 이하만 필터한다. SEC DEI/US-GAAP 원천 facts와 검토 테이블의 VERIFIED 값을 분리하고, 검증 기준일이 1년을 넘으면 검증 숫자를 숨긴다. 내부 review note는 응답에 포함하지 않는다.
- 회귀 테스트와 `docs/operations/us-smallcap-shares-public-api.md` 운영 문서를 추가했다. 이번 배포는 최신 `origin/oci` 기반 격리 worktree에서 API·테스트·문서·본 로그만 대상으로 한다. 기존 자동화/테이블 V144~V148은 배포 브랜치에 이미 존재한다.

### 검증
- `npm.cmd run deploy:verify` 1차는 build, 전체 테스트(602 통과·1 skip), typecheck, docs:check, scope/KIS/cron 검사를 통과했으나 테스트 직후 standalone `/charts` smoke가 30초 제한을 초과했다. 잔류 프로세스를 종료한 뒤 같은 standalone 산출물을 직접 실행해 231ms 기동 및 `/charts` HTTP 200을 재현했다.
- 자원 압박 해소 후 공식 `npm.cmd run deploy:verify` 재실행 성공: production build, 전체 테스트 180개 파일(602 통과·1 skip), 타입 검사, 문서·범위·KIS·OCI cron(V148까지), standalone `/charts`와 국내·미국 차트 API HTTP 200.
- 1차 commit `aee52cc74402852cb802d094ceb3374b8d3e77a` 배포 run `38044246277` 성공. 운영 무인증 GET은 HTTP 200·실데이터·pagination을 반환했으나 첫 row의 공식 마스터 이름에 `(ADR)`가 명시됐는데 common-stock 플래그가 true인 분류 충돌을 확인했다.
- 이 충돌을 fail-closed로 막도록 공개 API에 마스터 한글/영문명의 ADR·ADS·American Depositary·Depositary Receipt/Shares 제외 조건과 테스트를 추가했다. 관련 테스트 5개 통과 및 공식 전체 `npm.cmd run deploy:verify` 재통과(602 통과·1 skip, build/typecheck/docs/cron/standalone smoke 포함).
- 후속 commit `49a2ea9e007cc0f85bd7da552e55a7f14ad33413` Deploy OCI run `38045036495` 성공. 운영 공개 목록 100건에서 ADR/ADS 표기 결과 0건, ticker `LGHL`은 빈 결과, 일반 ticker `SXTC`는 HTTP 200·1건·SEC 수량 958,077주를 반환했다.

### 다음 개선
- SEC Company Facts 원시 수량과 검토 수량이 크게 다른 종목 및 시총 대비 발행주식수 불일치 사례를 데이터 감사 과제로 별도 추적한다. 종목 마스터에 depositary 타입 필드가 정식 제공되면 이름 표기 방어를 그 공식 타입 기준으로 대체한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-10-003
- 성과 판정: UNMEASURED
- 근거: 이번 변경은 새 공개 read 기능이며 운영 호출량·실제 사용량은 배포 후 측정 대상이다. raw SEC fact와 별도 검토 수량의 의미를 분리해 과도한 현재성 주장을 방지한다.

### 커밋·푸시·배포
- 완료: 1차 공개 API commit `aee52cc74402852cb802d094ceb3374b8d3e77a`를 `origin/oci`에 push했고 Deploy OCI run `38044246277` 성공 및 운영 GET 200을 확인했다.
- 완료: ADR/ADS fail-closed 후속 commit `49a2ea9e007cc0f85bd7da552e55a7f14ad33413`를 `origin/oci`에 push했고 Deploy OCI run `38045036495` 성공 및 ticker/목록 운영 smoke를 확인했다. 배포 범위는 공개 API·테스트·API 문서·이 작업 로그뿐이다.

## [2026-10-10] SEC 발행주수 자동화 대상 및 시총 경계 보강

### 목표
- 자동 갱신 대상을 미국 보통주이며 USD 시가총액 1억 달러 이하인 종목으로 제한하고, 판정 불가능한 시총 스냅샷은 제외한다.

### 반영
- SEC 동기화 쿼리는 활성 미국 보통주 유니버스 중 NASDAQ·NYSE·NYSE American(AMS), USD, 최근 24시간 이내의 시총 스냅샷과 KIS 마지막 성공 시세 조회만 사용한다. KIS stale fallback이 새 스냅샷 시각으로 기록돼도 오래된 실제 성공 조회시각에서 제외된다. OCI cron 순서를 조정해 같은 회차의 fundamental 갱신 후 SEC 발행주수를 조회한다.
- 상한을 `< 100,000,000`에서 `<= 100,000,000`으로 바로잡고, DB 제약도 V148에서 정확히 1억 달러를 허용하도록 변경한다. 초과값·0 이하·통화 미확인·24시간보다 오래된 스냅샷은 제외한다.
- 기존 대상 판정 테스트를 경계값 포함 기준으로 갱신하고, 운영 문서에 fail-closed 조건을 명시한다.

### 검증
- 첫 docs:check는 최신 로그 필수 계약(개선 과제 ID·성과 판정·배포 상태 등) 누락으로 실패했으며, 계약을 보강해 해결했다.
- 검증 중 KIS stale fallback이 fundamental 시각만 갱신할 수 있음을 확인해 마지막 KIS 성공 캐시 신선도 조건을 추가했다.
- 최종 `npm run deploy:verify` 통과: production build, Vitest 179개 파일(597 통과·1 skip), typecheck, docs:check, verify-scope, KIS boundary, OCI cron(20 endpoints), standalone HTTP smoke 3개 경로 모두 성공.

### 다음 개선
- OCI 첫 자동화 성공 실행에서 대상 수, 24시간 이전 시총으로 제외된 종목 수, 1억 달러 경계 종목을 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-10-002
- 성과 판정: IMPROVED
- 근거: 종목 자격을 유니버스의 COMMON_STOCK 분류·세 거래소·USD·신선 시총·1억 달러 이하로 fail-closed 제한하며 상한 경계값도 일관되게 허용한다.

### 커밋·푸시·배포
- 완료: `94a89205a91348cc795e5eb84103449ac6cc229c`를 `origin/oci`에 push했다. GitHub Actions `Deploy OCI` run `38033736720`의 Verify deployment·Upload release·Activate release 전체 단계가 성공했고, Activate release 성공으로 Flyway V148 적용 및 OCI 서비스 활성화가 완료됐다.
- 운영 smoke: 홈페이지와 manifest HTTP 200, 새 SEC cron의 무인증 POST는 HTTP 401(`Unauthorized`)로 응답해 route와 인증이 활성 상태임을 확인했다. 관리자 인증이 필요한 automation_runs 조회는 하지 않아 최초 SEC 수집 건수와 실제 실행 성공 여부는 미확인으로 남긴다.

## [2026-10-10] SEC 주식수 XBRL fact 분리 및 일일 수집 배포 준비

### 목표
- `dei:EntityCommonStockSharesOutstanding`와 `us-gaap:CommonStockSharesOutstanding`를 혼합하지 않고 별도 값·공시 메타데이터로 저장하고 SEC 자동 수집에 연결한다.

### 반영
- 원격 `oci` 기준에서 누락됐던 기반 테이블 V144/V145와 concept별 열·검토 모듈 V146/V147을 적용 범위에 포함했다.
- SEC Company Facts에서 각 concept의 shares 단위·양수 정수·허용 공시 양식·기준일을 독립 선택하고, 기준일·접수일·공시 양식·accession을 별도 저장한다. 한쪽 fact가 없으면 해당 열만 NULL로 둔다.
- OCI cron에 일일 SEC 주식수 동기화를 추가했다. Flyway 배포 옵션은 이력에 빠졌으나 이미 스키마에 존재하는 과거 migration을 재실행하지 않도록 기본 순서와 `*:ignored` 검증 패턴을 사용한다.
- 운영 설명, SEC 검토 근거 문서와 로컬 전용 동기화·보고서 스크립트를 추가했다.

### 검증
- 로컬 Docker PostgreSQL 16에서 Flyway V146/V147 적용 성공. 기존 1,000행 모두 DEI 열로 보존됐고, US-GAAP 열은 첫 수집 전이라 0행, 두 값 모두 비어 있거나 0 이하인 행은 0건이다.
- 원격 기반 worktree의 `npm run deploy:verify` 통과: production build, typecheck, 문서·배포 구조 검사, standalone smoke 성공. Vitest 179개 파일 중 597개 통과·1개 skip. `/charts`, 미국/국내 상승차트 API smoke는 HTTP 200이었다.
- DB integration 테스트는 원격 기반 worktree에 `.env.local`이 없어 skip됐다. 별도 로컬 DB migration 및 row 보존 확인으로 migration 경로를 검증했다.

### 다음 개선
- OCI 배포 후 첫 SEC 자동 실행 기록에서 성공·실패·미수집 fact 건수를 확인하고 두 concept별 최근 기준일을 점검한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-10-001
- 성과 판정: IMPROVED
- 근거: concept별 저장·자동 실행 경로와 배포 검증은 준비됐으나 OCI push 및 첫 운영 수집은 아직 실행되지 않았다.

### 커밋·푸시·배포
- 검증 시점 배포 상태: 미실행. 이번 SEC 주식수 전용 커밋을 `oci`에 push하면 GitHub Actions `Deploy OCI`가 실행된다.

## [2026-10-07] 공시·RSS API 및 사용자 화면 최근 1~24시간 필터

### 목표
- `/api/disclosures`와 `/disclosures`에서 현재 시각 기준 최근 1~24시간을 1시간 단위로 조회하고 기존 날짜 조회를 보존한다.

### 반영
- `app/api/disclosures/route.ts`: `hours=1..24`를 받아 RSS와 DART/SEC 공시 게시 시각을 같은 rolling 구간 `[from,to)`로 필터링하고, 응답에 `window.hours/from/to`를 반환한다. 잘못된 값은 HTTP 400이다.
- `components/daily-disclosures-page.tsx`: 최근 시간 선택(기본 1시간), 기존 날짜 모드, 출처 선택, JSON 복사·다운로드 기준 정보를 추가했다.
- `lib/rss-time-window.ts`에서 구간 검증·계산을 모듈화했다. 테스트 파일은 route validation, 시간 구간, 화면 동작을 각각 확인한다. RSS 수집/저장 주기는 변경하지 않았다.

### 검증
- 운영 GET 기준선: `/api/disclosures?hours=1`과 `hours=24`가 같은 날짜 조회 결과를 반환하고 `window`가 없어 아직 운영 미반영임을 확인했다.
- `.env.local` 개발서버에서 `hours=1/24` HTTP 200 및 각각 정확한 1/24시간 window, `hours=25` HTTP 400, `/disclosures` HTTP 200을 확인했다. 선택 시간에 저장된 기사가 0건이라 실제 기사행을 통한 경계 비교는 불가했다.
- `npm.cmd run test -- --maxWorkers=1 lib/rss-time-window.test.ts app/api/disclosures/route.test.ts components/daily-disclosures-page.test.tsx`: 3개 파일·5개 테스트 통과. `npm.cmd run typecheck`와 `npm.cmd run build` 통과(111개 정적 페이지).
- 첫 standalone 빌드에서 `node_modules` junction 추적 경고를 확인해 worktree 의존성을 `npm.cmd ci`로 독립 설치했다. `deploy:verify` 최초 실행은 문서 계약 섹션 누락으로 실패해 로그를 보완했고, 재실행은 전체 통과했다: build 성공, 테스트 178파일(591 passed/1 skipped), typecheck/docs:check/verify-scope/KIS boundary/cron(19 endpoints) 통과, standalone runtime smoke 3개 경로 HTTP 200.
- 분리 작업공간에서도 `.env.local` 우선 주입 개발 서버 실행: `/disclosures` HTTP 200, `hours=1/24` JSON HTTP 200이며 응답 window 폭이 각각 정확히 1/24시간, `hours=25` HTTP 400. 해당 구간의 DB 저장 RSS/공시는 0건이었다. 임시 `.env.local` hard link는 검증 후 제거했고 원본 환경 파일을 보존했다.

### 다음 개선
- 운영 반영 후 `hours=1`과 `hours=24`를 운영에서 재조회해 window 길이·응답행 게시시각·기준시각을 함께 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-07-005
- 성과 판정: IMPROVED
- 근거: 날짜 기준 조회만 있던 API와 UI에 최근 1~24시간 모드 및 검증을 추가했고, 기능 전용 테스트 5개와 로컬 응답으로 확인했다. 운영 반영은 아직 증명되지 않았다.
- 자동 감지: 1·24시간 경계, 무효 0·25 및 문자열, 정확한 구간 길이, 날짜 모드 유지, API 400을 테스트한다. 배포 후 운영 응답의 `window` 계약도 확인한다.
- 남은 위험: 선택 시간에 로컬 저장 건수가 0이라 실데이터 행을 통한 게시시각 경계 비교는 미완이며, 운영 push/deploy 승인이 남아 있다.

### 커밋·푸시·배포
- 상태: 미실행 (운영 반영 승인 대기).

## [2026-10-07] 최신 원격 기준 미국 상승률 TOP100 UI 신뢰성 개선

### 목표
- 최신 `origin/oci` 기준으로 TOP100 거래소별 원천 상태와 집중 관측 후보가 정확히 표시되도록 수정하고, 작업 트리의 무관한 사용자 변경을 배포 대상에서 제외한다.

### 반영
- KIS 원천 순위행 감산을 상품 제외·잘못된 ticker·중복·유효 후보로 나눠 진단하고, 공식 활성 보통주 선별과 focus 후보 분배의 기준을 유지했다.
- 점수 입력이 누락되어도 보통주 필터를 통과한 후보로 분봉 큐를 채우되 거래소 round-robin을 적용한다. API에 실제 큐 순번을 제공한다.
- 화면에서 수집시각의 KST와 경과 시간을 명시하고, 오래된 값은 stale로 알린다. 자동 갱신 중 종목 선택은 `market:code`로 유지한다.
- UI/API/유니버스 회귀 테스트와 `docs/US_TOP_RISING_UI_DATA_QUALITY.md`를 추가했다.

### 검증
- 최신 원격 기준 격리 작업 트리에서 `npm.cmd run deploy:verify` 통과: production build 성공, 174개 테스트 파일 586 passed / 1 skipped, typecheck 통과, docs:check(18 entry points, V143) 통과, verify-scope/KIS boundary/cron 19 endpoints 통과.
- standalone runtime smoke에서 `/charts`, `/api/stock/us/top-rising-chart`, `/api/stock/kr/top-rising-chart` 모두 HTTP 200 및 HTML/JSON 응답을 확인했다.
- 첫 실행에서 테스트 통과 후 문서 계약 오류를 발견해 로그를 수정했다. 다음 실행은 불완전한 `node_modules/next` 파일 누락으로 빌드 실패했으며, 격리 작업 트리에서 lockfile 기준 `npm.cmd ci`로 복구한 후 전체 게이트를 다시 실행해 통과했다. 원본 작업 트리 의존성은 건드리지 않았다.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다. LF→CRLF 안내만 확인했다.

### 다음 개선
- KIS 상승률 응답에 시가총액·랭킹 거래대금이 없을 때 공식 USD 시총 스냅샷 연결을 별도 검증하고, 값과 시점이 확인되기 전에는 비율을 미확인으로 표시한다.
- 운영 워커에서 30개 집중 후보의 실제 분봉 coverage와 stale 비율을 관찰한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-07-004
- 성과 판정: IMPROVED
- 근거: TOP100 원천 범위·필터·분봉 후보 표시의 누락 및 혼동 위험을 수정한다. 운영 DB·worker의 실시간 coverage 및 시총 비율 데이터 원천은 이번 로컬 검증 범위에서 확정하지 않는다.
- 자동 감지: focus round-robin/순번, 행 감산 카운터, stale KST, 재정렬 중 ticker 고정, 원문 payload 미노출을 회귀 테스트와 `deploy:verify`로 확인한다.
- 남은 위험: 로컬 환경에 TOP100 스냅샷·요청 로그 테이블이 없으면 부가 저장/사용 로그는 실패할 수 있으며, 이는 읽기 API 검증과 구분한다.

### 커밋·푸시·배포
- 아직 미실행.

이 문서는 프로젝트의 개발 과정과 변경 사항을 기록합니다.

## [2026-10-03] RSS feed bulk upsert 중복 키 방어

### 목표와 범위
- 운영에서 확인된 PostgreSQL `21000` (`ON CONFLICT DO UPDATE command cannot affect row a second time`) 재발을 방지하고, 동일 RSS feed batch 안의 중복 `(source, external_id)`를 저장 전에 제거한다.

### 반영
- `dedupeMarketRssItems`가 DB text conflict key와 같은 `(String(source), String(id))` 기준으로 첫 항목을 유지하고 중복 수를 계산한다.
- `ingestMarketRssArticles`는 dedupe 결과만 bulk upsert에 전달하고 출처별 `duplicateCount`를 결과에 포함해 다음 automation run에서 관측 가능하게 한다.
- 동일 source/id, 다른 source의 동일 id, 서로 다른 id, 숫자/문자열 ID canonicalization 테스트를 추가한다.
- 운영 원본 기준 `82541aee`에서 별도 정리된 `codex/rss-translation-debug` worktree에만 반영했다. 주 작업 디렉터리의 기존 변경사항은 포함하지 않았다.

### 검증
- 전용 중복 제거/ingest 테스트 실행: `npm.cmd exec vitest run -- lib/market-rss-dedupe.test.ts lib/market-rss.test.ts` 통과 (2 files / 5 tests).
- 전체 `npm.cmd run deploy:verify` 통과: production build, 전체 테스트 172개 파일(571 통과·1 skip), typecheck, docs:check(18 entry points, migration V143), audit verify scope, KIS boundary audit, cron check(19 endpoints), standalone runtime smoke.
- 실행 검증에서 `/charts`는 HTTP 200. 국내/해외 TOP 상승률 API는 JSON 응답 파싱을 확인했으나 해외 API가 HTTP 502를 반환했다. 격리된 worktree에는 `.env.local`이 없어 외부 KIS/DB 의존 경로는 정상 데이터 응답까지 검증하지 못했다. 이는 RSS 변경 검증 범위와 별개이며 정상 API 동작으로 간주하지 않는다.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.
- GitHub Actions `Deploy OCI` run 950 (`6d67912d74f7f831cf036cdaadf0f9d174739136`) 전체 단계 성공, 운영 `/api/health` HTTP 200.
- 배포 후 운영 자동화 진단에서 06:35 및 06:40 UTC `market-rss` 두 run 연속 SUCCESS 확인. 각 run은 359건 ingest, translation attempted=3, translated=3, failed=0, fallback=0. 직전 배포 전 run은 SQLSTATE 21000 실패였으며 후속 두 run에서 같은 오류는 재발하지 않았다.
- 운영 번역 진단에는 여전히 `PENDING` 199건이 보인다. 파이프라인 성공과 새 번역 성공은 확인했지만 이 카운트의 backlog/notifyEligible 구성은 확인하지 않았으므로 전체 대기열 해소로 간주하지 않는다.

### 다음 개선 및 재발 자동감지
- 운영 배포 후 automation summary의 source별 `duplicateCount`와 `market-rss` run status를 관찰한다. 같은 SQLSTATE `21000`이 재발하면 `docs/ERROR_HANDLING.md` 절차로 source/feed 입력을 조사한다.
- 성공 run과 번역 상태(PENDING 감소, TRANSLATED 증가)가 확인되기 전까지 장애 해결로 간주하지 않는다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-03-001
- 성과 판정: IMPROVED
- 근거: 배포 후 두 번의 연속 자동화 성공과 각 3건 번역 성공, 실패 0건, SQLSTATE 21000 재발 없음. 다만 운영 진단상 PENDING 199건은 남아 있어 전체 큐 복구는 미확인이다.

### 커밋·푸시·배포
- 코드 커밋 `6d67912d`를 `oci`에 push 완료, GitHub 배포 run 950 성공. 운영 RSS 결과까지 이 로그 항목에서 추적한다.

## [2026-10-02] RSS 번역 상태 공개 검수 API

### 목표
- 운영 DB에 저장된 RSS 번역 상태를 관리자 인증 없이 조회해 검수한다.

### 반영
- 공개 읽기 전용 `GET /api/debug/market-rss-translations`를 추가했다. 기간, 출처, 번역 상태, 페이지 크기를 제한하고 원문 본문과 raw payload는 반환하지 않는다.
- 운영 `oci` 기준 스키마에 존재하는 컬럼만 조회하며 번역 오류 문자열의 자격증명 패턴을 마스킹하고 DB 예외 상세는 숨긴다.
- 익명 조회, 필터, 입력 경계, 오류 마스킹 및 DB 실패 응답을 회귀 테스트로 고정하고 운영 API 런북을 문서 인덱스에 등록했다.

### 검증
- API 단위 테스트 4개 통과. `npm run deploy:verify` 통과: production build, 전체 테스트 568개 통과·1개 skip, 타입 검사, 문서/구조 게이트 및 standalone 실행 smoke 통과.
- 로컬 DB가 실행되지 않아 로컬 API는 DB 연결 단계에서 503을 반환했다. 운영 익명 API 호출은 HTTP 200 JSON, 최근 1시간 13건 모두 `PENDING`, 표본 1건 반환을 확인했다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-02-001
- 성과 판정: IMPROVED
- 근거: 공개 디버깅 API를 제한된 페이지 크기와 기간, 필드 최소화, 비밀정보 마스킹 및 익명 경로 회귀 테스트와 함께 제공한다.

### 남은 위험
- 로그인 없이 RSS 기사 제목·링크와 번역 메타데이터가 공개된다. 본문과 raw payload는 제외했으며 페이지·기간 상한을 적용했지만, 운영 접근 로그에서 과도한 조회가 관찰되면 프록시 rate limit이나 네트워크 접근 제어를 추가해야 한다.

### 다음 개선
- 배포 후 운영 URL을 익명 호출해 운영 DB의 상태별 건수와 항목 표본을 확인하고, 응답시간·조회량을 기준으로 DB 쿼리 비용을 점검한다.

### 커밋·푸시·배포
- 상태: 완료. 구현 커밋 `091c5969`를 `oci`에 push했고 [GitHub Actions Deploy OCI run 36982189795](https://github.com/pjtss/StockMan/actions/runs/36982189795)이 성공했다. 운영 익명 GET도 HTTP 200 JSON으로 확인했다.

## [2026-09-26] SEC Company Facts 일반 사용자 조회 허용

### 목표
- 일반 사용자가 관리자 로그인 없이 SEC Company Facts 원천 JSON을 조회·저장·열람할 수 있도록 한다.

### 반영
- 공개 `/api/sec/company-facts` GET/POST 경로를 추가하고, 기존 `/api/admin/sec-company-facts` 인증·관리자 설정 경로는 그대로 유지한다.
- 기존 활성 보통주 검증을 공개 경로에도 적용해 ETF·워런트·비활성·미확인 대상을 fail-closed로 차단한다.
- SEC 수동 조회 및 저장 JSON 읽기에 클라이언트별·인스턴스 전체 고정창 제한, 429와 `Retry-After`를 추가했다.
- `기타` 페이지에서 새 공개 API를 호출하고 로그인 불필요 및 요청 제한을 안내한다.

### 근본 원인 및 재발 방지
- 기존 UI가 관리자 전용 API에만 연결되어 일반 사용자는 Company Facts 기능을 쓸 수 없었다.
- 일반 경로를 열되 기존 권한 경계를 낮추지 않고 API route 단위 테스트로 익명 접근, 보통주 차단, 스냅샷 응답, rate limit을 자동 검사한다.

### 검증
- `npm run verify` 통과: 170 test files passed, 1 skipped; 564 tests passed, 1 skipped. 타입체크, docs contract, verify-scope, KIS boundary, cron 검사 및 Next.js production build 모두 통과했다.
- 신규 API·rate-limit 및 기존 관리자 API 집중 테스트 통과: 3 files, 11 tests.
- 이후 재검증에서 빌드가 worktree 안에 생긴 부분 `node_modules/next`를 우선 해석해 모듈 누락으로 실패했다. 부분 의존성 폴더는 삭제하지 않고 worktree 안 별도 경로에 보존한 뒤 `npm run build`를 다시 실행해 통과했다.
- production build에 `/api/sec/company-facts`와 `/other`가 포함됨을 확인했다. 로컬 production server 실행 후 `/other` HTTP 200, 공개 API 입력 검증 HTTP 400, 동일 IP의 7번째 조회 HTTP 429 및 `Retry-After: 600`을 확인했다. 생성 client bundle에 공개 안내문과 새 API 경로가 포함됨도 확인했다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-26-115
- 성과 판정: IMPROVED
- 근거: 관리자 전용 경로를 보존하면서 일반 사용자용 제한된 공개 경로를 분리하고, 회귀 검사를 추가했다.

### 남은 위험
- rate limit은 단일 인스턴스 메모리 기반이다. 다중 인스턴스로 바뀌면 공유 저장소로 이전해야 한다.

### 다음 개선
- 배포 후 운영에서 429 비율과 SEC upstream 오류율을 확인하고, 합산 요청량이 한도에 근접하면 제한값을 재조정한다.

### 커밋·푸시·배포
- 상태: 구현 커밋 `f52fca6e54731a864a63b5112a0262aec423e7a2` 완료. 푸시·배포는 별도 SHA 승인과 CI를 대기한다.

## [2026-09-23] 로컬 LLM 호재 분석 POST 저장 경로

### 목표
- 로컬에서 운영 RSS를 조회하고 LLM이 직접 호재 여부를 판단한 결과를 운영 API POST로 저장한다.

### 반영
- `/api/bullish-rss`에 `CRON_SECRET` 인증 POST 저장 경로를 추가했다.
- V136에서 로컬 분석 결과가 운영 원본 RSS 행 ID 없이도 저장되도록 `source_article_id`를 nullable로 변경했다.

### 검증
- `tsc --noEmit` 통과.
- RSS 분류·등급 테스트 13개 통과.
- `npm.cmd run docs:check` 통과: migrations 136개, latest V136.
- production build에서 `/api/bullish-rss` 라우트 생성 확인.
- `scripts/dev-server.mjs` 실행 후 인증 없는 POST가 HTTP 401로 차단됨을 확인했다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-23-004
- 성과 판정: IMPROVED
- 근거: 호재 분석 책임을 저장 API에서 분리하고, 로컬 분석 결과를 인증된 운영 POST로 전달할 수 있는 경계를 추가했다.

### 다음 개선
- V136 배포 후 LLM이 직접 분석한 실제 RSS 후보를 POST하고 운영 GET 결과의 저장 건수와 내용을 확인한다.

### 커밋·푸시·배포
- 커밋·푸시·배포: 미실행.

## [2026-09-23] RSS 호재 저장 운영 배포

### 목표
- LIMIT 없는 RSS 배치 호재 분석, 별도 테이블 저장, 번역 결과 연계 기능을 운영 반영한다.

### 반영
- `market_rss_bullish_articles` 스키마·저장소·API·cron 연계와 V135 마이그레이션을 포함했다.

### 검증
- `npm.cmd run typecheck`, `vitest`, `npm.cmd run docs:check`, `npm.cmd run build`와 standalone 실행 smoke를 수행한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-23-002
- 성과 판정: IMPROVED
- 근거: 기존 작업공간의 unrelated 변경과 분리해 배포 대상만 검증할 수 있도록 별도 worktree를 구성했다.

### 다음 개선
- 배포 후 운영 API 상태 코드와 V135 테이블 조회 결과를 함께 확인한다.

### 커밋·푸시·배포
- 커밋·푸시·배포: 미실행.

## [2026-09-22] KIS 누적 거래대금 차분 기반 장중 탐지

### 목적
- 1분봉 종가×거래량 근사값 대신 KIS 누적 거래대금의 직전 관측값 차분을 우선 사용한다.

### 변경
- `lib/intraday-turnover.ts`: 누적 거래대금 차분 및 검증 불가 시 fallback 계산을 모듈화했다.
- `lib/kis-us-minute-turnover.ts`, `lib/kr-minute-candle-cache.ts`: KIS 누적 거래대금 필드를 보존한다.
- `lib/intraday-detection-worker.ts`: `KIS_CUMULATIVE_DELTA`를 우선 사용하고, 누락·리셋 시 `PRICE_VOLUME_FALLBACK`을 사용한다.
- `lib/intraday-turnover.test.ts`: 정상 차분과 카운터 리셋 fallback을 검증한다.

### 재발 방지 및 남은 위험
- 세션 변경·누적값 감소·필드 누락은 fallback으로 처리하며, 운영 관측에 계산 source를 노출할 후속 작업이 필요하다.
- KIS 시장별 필드 의미가 변경될 수 있으므로 원본 필드와 계산 source를 디버깅 API에 추가해야 한다.

### 검증
- 단위 테스트·타입체크·프로덕션 빌드 후 커밋/배포한다.

## [2026-09-22] 운영 RSS API 조회 및 로컬 호재 재분석

### 목적
- 운영 서버에 저장된 RSS를 공개 조회 API로 가져와 로컬 프로젝트의 호재 분류기로 재분석한다.

### 확인 대상 및 방법
- 운영 API: `GET https://stockman.r-e.kr/api/disclosures?date=2026-09-22&source=ALL&limit=500`
- 운영 API 응답의 `items`를 로컬 `lib/market-rss-classifier.ts`의 `classifyMarketRssItem()`에 전달했다.
- 운영 API의 `source=RSS`는 실제 저장 source명이 `STOCKTITAN`, `NASDAQ`, `SEC_EDGAR`, `NEWSIS` 등으로 분리되어 있어 0건을 반환하므로 `source=ALL`을 사용했다.

### 결과
- 조회 성공: 500건(페이지/limit 상한에 도달)
- source별: STOCKTITAN 369건, NASDAQ 74건, SEC_EDGAR 43건, NEWSIS 5건, HANKYUNG 6건, MK 3건
- 로컬 분류 결과: POSITIVE 91건
- 분류 구성: STOCKTITAN ACTIONABLE 69건·FINANCING 11건, NASDAQ ACTIONABLE 13건·FINANCING 3건, SEC_EDGAR ACTIONABLE 5건, HANKYUNG ACTIONABLE 3건, NEWSIS ACTIONABLE 1건
- 상위 후보 예시: SPCB(전자 모니터링 계약), JAGX(FDA fee waiver), SBH(다년 파트너십), TBLA(신규 제품 출시), AMGN(Phase 3 긍정 결과)

### 해석 및 한계
- 운영 저장 RSS를 로컬 호재 분류기로 재분석하는 경로는 동작한다.
- `classifyMarketRssItem()`은 제목·요약의 키워드 기반 분류이므로 POSITIVE가 곧 투자 판단 또는 실제 주가 상승을 의미하지 않는다.
- `/api/disclosures`는 현재 최대 500건만 반환하므로 전체 일자 분석에는 source별 조회 또는 페이지네이션 확장이 필요하다.
- 운영 API 원문을 별도 파일로 저장하지 않았으며, 이번 결과는 2026-09-22 조회 시점의 분석 결과다.
- 커밋·푸시·배포: 미실행.

### 목표
- 운영 RSS 원본을 제한 없이 내부 배치로 순회하고, 로컬 호재 분류 결과와 번역 상태를 별도 운영 DB 테이블에 저장한다.

### 반영
- `market_rss_bullish_articles` 스키마와 `V135__market_rss_bullish_articles.sql` 마이그레이션을 추가했다.
- `syncMarketRssBullishArticles()`가 원본 RSS를 500건 단위 keyset으로 끝까지 순회해 중복 없이 upsert한다.
- `/api/bullish-rss` 조회 API를 추가하고, market-rss cron에서 수집·번역 후 호재 결과 저장을 실행한다.
- 원본의 번역 상태·번역 제목·fallback·오류를 별도 호재 테이블에 함께 저장한다.

### 검증
- 
pm run typecheck` 통과.
- 
px vitest run lib/market-rss-classifier.test.ts` 통과: 9개 테스트.
- 
pm run docs:check`는 최신 문서 항목 형식 보강 전 1회 실패했으며, 현재 항목에 필수 문서 계약을 반영했다.
- 
pm run build`를 2회 실행했으나 
ext build` 시작 메시지 이후 2분 이상 출력·종료가 없어 중단했다. 배포와 운영 DB 마이그레이션은 실행하지 않았다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-22-005
- 성과 판정: IMPROVED
- 근거: 기존 원본 RSS 테이블과 Discord 전송을 변경하지 않고, 전체 순회·호재 materialization·번역 상태 저장 경계를 추가했다.

### 다음 개선
- 운영 Flyway V135 적용 후 실제 cron 1회 실행으로 저장 건수·중복키·번역 상태를 검증하고, 대량 번역 한도에 따른 batch 운영값을 확정한다.

### 커밋·푸시·배포
- 커밋·푸시·배포: 미실행.

## [2026-09-22] 운영 RSS 호재 분석 HTML 보고서 생성

### 목적
- 운영 RSS 조회·로컬 호재분석 결과를 사용자가 열어볼 수 있는 HTML 파일로 정리한다.

### 변경 파일 및 산출물
- `operating-rss-bullish-analysis-2026-09-22.html` 생성.
- `C:\Users\dldbs\Downloads\operating-rss-bullish-analysis-2026-09-22.html`로 복사 완료.

### 검증
- 보고서에 API 경로, 분석 기준, 조회 건수, source별 집계, 주요 후보, 한계를 포함했다.
- 산출물 크기 6,573 bytes 확인.
- 커밋·푸시·배포: 미실행.

## [2026-09-22] RSS 번역·Discord 전송 동작 검증

### 목적
- LibreTranslate는 사용하지 않는 운영 전제에서 RSS 번역 결과와 Discord 전송 결과의 차이를 확인한다.

### 확인 대상
- 운영 cron의 `ingestMarketRssArticles → translatePendingMarketRssArticles → notifyPendingMarketRssArticles` 순서.
- `lib/translate-market-rss-item.ts`, `lib/market-rss-pipeline.ts`, 관리자 RSS 미리보기 경로.

### 검증 결과
- 운영 cron은 `GOOGLE_TRANSLATION_API_KEY`가 있을 때만 Google Cloud Translation 경로를 사용한다.
- 번역 대상은 
otifyEligible=true`이고 `isBacklog=false`인 항목이며, 현재 제목만 번역하고 요약·본문은 원문을 유지한다.
- 번역 성공 시 Discord 제목은 번역문이고 원문 제목을 함께 표시한다.
- API 키 없음, 월간 문자 한도 초과, 번역 API fallback 또는 실패 시 Discord 전송 자체는 계속되며 제목은 원문으로 표시된다. 이 경우 데이터에 `translationFallback`/상태가 남는다.
- 
otifyEligible=false` 또는 backlog 항목은 번역 단계에서 제외된다.
- 관리자 RSS 미리보기의 `translateMarketRssItems()` 기본 인자는 아직 `LibreTranslateClient`다. LibreTranslate를 사용하지 않는 운영 기준과 불일치하므로 관리자 미리보기 결과는 운영 Discord 결과 검증 근거로 사용할 수 없다.

### 테스트
- 
px vitest run lib/translate-market-rss-item.test.ts lib/cloud-translation-client.test.ts lib/libretranslate-client.test.ts` 통과: 3개 파일, 6개 테스트.

### 결론 및 남은 위험
- Discord에서 어떤 항목은 번역되고 어떤 항목은 원문인 현상은 현재 코드상 정상적인 fallback·대상 제외 결과일 수 있다. 다만 관리자 미리보기의 LibreTranslate 기본 경로는 별도 정리 대상이다.
- 실제 운영 건별 판정에는 관리자 debug suite 또는 DB의 `translationStatus`, `translationFallback`, `translationError`, 
otificationStatus` 값을 함께 확인해야 한다.
- 추가 로컬 DB 확인: `.env.local`에는 `DATABASE_URL`만 존재하고 `GOOGLE_TRANSLATION_API_KEY`는 없었다. `market_rss_articles` 전체 집계는 ETODAY 38, HANKYUNG 50, KRX_KIND 100, MK 50, NASDAQ 15, NEWSIS 100, SEC_EDGAR 99, STOCKTITAN 100건이 모두 `translation_status=PENDING`이었다. 최근 7일 행은 없으므로 이 DB 결과만으로 운영 Discord 이력을 확정할 수는 없지만, 현재 로컬 실행 환경에서는 번역이 시작되지 않는 상태다.
- **수정**: LibreTranslate를 사용하지 않는 운영 정책과 관리자 미리보기의 기본 동작을 일치시키기 위해 `lib/translate-market-rss-item.ts`에서 LibreTranslate import 및 기본 클라이언트를 제거했다. 이제 명시적 클라이언트가 없으면 Cloud Translation 환경 키를 사용하고, 키가 없으면 운영 cron과 동일하게 원문 fallback한다.
- **재발 방지**: 번역 미리보기·운영 cron 모두 번역 공급자를 암묵적으로 LibreTranslate로 선택하지 않으며, 공급자 테스트는 명시적 테스트 클라이언트를 주입한다.
- **검증**: 번역 관련 Vitest 2개 파일·5개 테스트 통과, 
pm run typecheck` 통과.
- 커밋·푸시·배포: 미실행.

### 목표

- RSS 번역 공급자와 Discord 전송 동작의 운영 기준을 문서화하고 미리보기와 운영 경로의 차이를 식별한다.

### 반영

- 제목 번역·fallback·알림 대상과 관리자 미리보기의 공급자 차이를 확인했다.

### 검증

- 번역 관련 테스트와 typecheck 결과를 확인했다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-22-004
- 성과 판정: IMPROVED
- 근거: 운영 기준과 미리보기 경로의 불일치를 식별했고 후속 수정 대상을 명확히 했다.

### 다음 개선

- 관리자 미리보기와 운영 cron의 번역 공급자 선택을 동일하게 유지하는 회귀 테스트를 추가한다.

### 커밋·푸시·배포

- 해당 작업의 커밋·푸시·배포는 미실행.

## [2026-09-22] TOP100 거래대금 알림 워커 지연 기동 보강

### 목표
- 운영 `/api/kis/intraday-mvp`에서 TOP100 후보는 존재하지만 `worker=STOPPED`, `tickCount=0`으로 남아 알림 평가가 시작되지 않는 현상을 해결한다.

### 반영
- **근본 원인**: standalone 운영 프로세스의 instrumentation hook이 
ew Function()`으로 `@/lib/intraday-detection-worker` 별칭을 런타임 import해 `ERR_MODULE_NOT_FOUND`로 실패했고, 워커가 시작되지 않았다.
- `instrumentation.ts`에서 Node 전용 워커 import를 제거하고, `/api/kis/intraday-mvp`의 singleton 지연 기동을 유일한 워커 실행 경로로 사용한다. 이로써 instrumentation 번들에 `pg`/Node core 모듈이 포함되지 않는다.
- `ensureIntradayDetectionWorker()`를 추가하고 상태 API 첫 조회에서 프로세스 singleton 워커를 보장 기동한다.
- 개발 환경과 명시적 `INTRADAY_DETECTION_ENABLED=false` 긴급 중지 조건은 유지한다.
- 운영에서 `mvpQualified=true`인데 `WARMING_UP` 상태 때문에 Discord 알림이 차단되던 상태 불일치를 수정했다. 신선한 관측은 MVP 거래대금 조건을 우선하고 `STALE`·`DEGRADED`만 차단한다.

### 검증
- 
pm.cmd test -- --run app/api/kis/intraday-mvp/route.test.ts lib/intraday-detection-worker.test.ts lib/intraday-memory-state.test.ts`: 3개 파일, 21개 테스트 통과.
- 
pm.cmd run typecheck`: 통과.
- 
pm.cmd run docs:check`: 통과.
- 배포 전 production build와 운영 API에서 `RUNNING`, `tickCount>0`, `lastTickAt` 갱신을 확인한다.

### 개선 과제
- 운영 배포 후 장중 실제 tick·후보 평가·Discord 전송 결과를 직접 확인하고, webhook 미설정·KIS 실패·5샘플 미충족을 각각 구분해 대시보드에 기록한다.

개선 과제 ID: CI-2026-09-22-002
성과 판정: UNMEASURED
근거: 로컬 단위 검증은 통과했으나 수정 반영 전 운영 응답이 `STOPPED/DISABLED`, `tickCount=0`이어서 운영 재검증 전이다.

### 다음 개선
- 배포 후 운영 API를 장중에 재호출하여 워커가 실제로 tick하는지 확인한다. 현재 재검증 응답은 후보 108개·`worker=STOPPED`·`tickCount=0`·`reason=DISABLED`이며, API에 명시적 kill switch 상태를 노출해 다음 조치 대상을 확정한다.

### 커밋·푸시·배포
- 상태: `b68f2a06` 커밋·푸시 완료; 운영 재검증에서 워커가 아직 `STOPPED/DISABLED`이므로 완료 전.

## [2026-09-22] 운영 일봉 캐시 조회 API 1단계

### 목표
- 로컬 개발 환경이 KIS Open API를 직접 호출하지 않고 운영 서버의 일봉 캐시 DB를 조회할 수 있는 경계를 만든다.

### 반영
- `app/api/public/daily-candles/route.ts`를 추가했다.
- `lib/remote-daily-candle-cache.ts`를 추가하고 `app/api/stock/chart/route.ts`에서 운영 캐시 API를 우선 조회하도록 연결했다.
- `DAILY_CACHE_API_URL`과 `DAILY_CACHE_READ_API_KEY`가 없는 환경에서는 기존 KIS/로컬 DB 경로를 유지한다.
- 운영 API 주소가 설정된 환경에서 원격 캐시 조회에 실패하면 KIS 직접 호출로 폴백하지 않고 `REMOTE_CACHE_UNAVAILABLE`을 반환한다.
- 다종목 스캐너 전환을 위해 `codes` 최대 100개 batch 조회를 지원한다.
- 국내·미국 bulk 캐시 조회 모듈이 원격 API 설정 환경에서 batch API를 사용하도록 연결했다.
- 미국 단일 종목 캐시 조회도 같은 원격 API 경계를 사용하도록 연결했다.
- 단타용 기본정보 API를 추가하고 시가총액·현재가·등락률·거래량·거래대금·발행주식수·유통주식수·관찰시각을 로컬 스냅샷에 함께 동기화하도록 확장했다.
- 국내·미국 시장과 일·주·월봉을 허용 목록으로 제한하고, 종목·limit 입력을 검증한다.
- `DAILY_CACHE_READ_API_KEY` 또는 Bearer 인증을 요구하며, DB 캐시만 조회한다.
- 응답에 종목·봉 기준·최신 봉일·DB 갱신 시각·원천(`OPERATING_DB_CACHE`)을 포함한다.

### 검증
- 
pm.cmd run typecheck`: 통과.
- 
pm.cmd test -- --run`: 163개 테스트 파일, 541개 테스트 통과.
- 
pm.cmd run verify`: 문서 계약 형식 오류로 중단됨.

### 개선 과제
- 로컬 캐시 provider를 운영 API 호출 방식으로 전환한다.
- 운영 배포 환경에 `DAILY_CACHE_READ_API_KEY`를 설정하고 인증·빈 캐시·stale 데이터 smoke 테스트를 추가한다.

개선 과제 ID: CI-2026-09-22-001
성과 판정: IMPROVED
근거: 운영 DB 캐시 조회 API와 로컬 원격 캐시 provider를 추가하고 batch 조회 경계를 연결했다.

### 다음 개선
- 운영 배포 후 인증된 단일·batch 일봉 API와 로컬 스캐너의 원격 캐시 사용 여부를 smoke 검증한다.

### 커밋·푸시·배포
- 상태: 미실행.

## [2026-09-18] 운영 메인 ChunkLoadError 자동 복구

### 목표
- 운영 메인 페이지에서 릴리스 간 정적 청크 불일치가 발생해도 기존 세션이 자동 복구되도록 한다.

### 반영
- `components/client-error-reporter.tsx`에서 `ChunkLoadError`를 세션당 한 번 캐시 버스터 URL로 재진입한다.
- 서버 릴리스 정적 청크 보존 및 HTML 재검증 설정은 직전 수정에서 반영했다.

### 검증
- 
pm.cmd test -- --run`: 158개 테스트 파일, 525개 테스트 통과.
- 
pm.cmd run typecheck`: 통과.
- 
pm.cmd run build`: 통과.

### 개선 과제
- 운영 브라우저에서 청크 오류 발생 시 복구 시도 횟수와 성공 여부를 오류 로그에서 분리 집계한다.

개선 과제 ID: CI-2026-09-18-002
성과 판정: IMPROVED
근거: 기존 청크 오류를 감지하고 무한 재시도 없이 최신 HTML을 재요청하는 클라이언트 복구 경로를 추가했다.

### 다음 개선
- 운영 smoke 검증에 메인 페이지의 정적 청크 응답과 자동 복구 신호 확인을 추가한다.

### 커밋·푸시·배포
- 상태: 미실행. 검증 게이트 통과 후 커밋·푸시·배포를 진행한다.

## [2026-09-18] 한솔로지스틱스 장기 배당투자 분석 설계 문서화

### 목표
- 다른 THREAD에서 구현할 수 있도록 KIS Open API 공식 데이터 범위, 저장 모델, 파생지표, 갱신·검증 기준을 문서로 고정한다.

### 반영
- `docs/HANSOL_LOGISTICS_DIVIDEND_INVESTMENT_DESIGN.md`를 추가했다.
- 대상은 한솔로지스틱스(009180)로 시작하되 국내 보통주 공통 모듈로 확장 가능한 구조로 정리했다.
- 재무·배당·기업행사·시세·수급 범위, 원천/파생 데이터 분리, 품질 메타데이터, 단계별 완료 기준을 문서화했다.

### 검증
- 설계 문서와 로그를 UTF-8 기준으로 저장했다.
- 애플리케이션 코드·DB 스키마·배치·API는 변경하지 않았다.
- 커밋·푸시·배포는 수행하지 않았다.

## [2026-09-18] TOP100 장중 거래대금 정책 캐시·관리자 설정 완성

### 목표
- 국내·미국 상승률 TOP100 시총 대비 거래대금 탐지의 구간·임계값을 관리자 페이지에서 변경 가능하게 한다.
- 단일 인스턴스 메모리 캐시로 매 틱 DB 조회를 제거하고, 설정 저장 직후 새 값을 반영한다.

### 반영
- `intraday-mvp` 기능 모듈, 관리자 설정 UI, 1분/5분 구간 및 비율 검증을 추가했다.
- 정책은 10분간 메모리 캐시하고 관리자 저장 성공 시 즉시 무효화한다.
- 워커·MVP API·intraday 디버깅 API가 공통 정책을 사용한다.
- QUALIFIED 신규 전이 시 Discord 알림을 연결했다.

### 검증
- 
pm.cmd test -- --run`: 158개 테스트 파일, 525개 테스트 통과.
- 
pm.cmd run typecheck`: 통과.
- 
pm.cmd run build`: 통과.
- 
pm.cmd run deploy:verify`: 문서 게이트에서 기존 최신 로그 형식 오류로 중단됨. 해당 형식 오류를 본 항목으로 보완 후 재실행한다.

### 개선 과제
- 배포 후 관리자에서 1분·1%와 5분·5%를 각각 저장하고 `/api/kis/intraday-mvp`의 criteria 반영을 확인한다.

개선 과제 ID: CI-2026-09-18-001
성과 판정: IMPROVED
근거: 관리자 정책 경계·메모리 캐시·알림 연결 및 단위/빌드 검증을 추가했다.

### 다음 개선
- 운영 smoke test에 intraday 정책 조회와 단일 인스턴스 캐시 무효화 검증을 추가한다.

### 커밋·푸시·배포
- 상태: 미실행. 검증 게이트 통과 후 커밋·푸시·배포를 진행한다.

## [2026-09-18] 최종 후보 승률의 불확실성 점검

### 확인
- 눌림·거래량 회복·양봉 마감 결합 조건은 72건 중 37승, 관측 승률 51.39%다.
- 근사 95% 신뢰구간은 약 39.8%~62.9%로, 무작위 50%와 통계적으로 구분되지 않는다.

### 결론
- 현재 51.39%는 유망한 탐색 결과일 뿐 고승률 우위의 증거가 아니다.
- 최소 수백 건의 독립 신호와 기간·거래소 외부 검증 없이는 전략 채택을 보류한다.

## [2026-09-18] 눌림·거래량 회복·양봉 마감 결합 검증

### 목표
- EMA 중첩 지지 재테스트와 거래량 회복 조건에 재테스트 봉의 양봉 마감 조건을 추가해 신호 품질을 확인한다.

### 결과
- 조건: NYSE, 상승 EMA 95개 이상, EMA ±1%, RVOL 1.0~1.2, 다음날 저가 재테스트, 재테스트일 거래량이 신호일 이상, 재테스트일 양봉, 다음날 종가 진입, +1%/-1% 선후 판정.
- 72건 판정 중 37승, 승률 51.39%, 평균수익률 +0.0278%.

### 해석 및 위험
- 이전 거래량 회복만 사용한 승률 50.26%보다 개선됐다.
- 그러나 표본이 72건으로 작아 과최적화와 우연 가능성이 크다. 실전 전략 확정 전 기간·거래소·표본 확대 검증이 필요하다.

## [2026-09-18] 눌림 재테스트 거래량 회복 검증

### 목표
- EMA 중첩 지지 재테스트 당일 거래량이 신호일보다 회복되는지 조건을 추가해 기대값 변화를 확인한다.

### 결과
- 공통 조건: NYSE, 상승 EMA 95개 이상, EMA ±1%, RVOL 1.0~1.2, 다음날 저가 재테스트, 다음날 종가 진입, +1%/-1% 선후 판정.
- 전체 눌림: 476건, 승률 49.79%, 평균수익률 -0.0042%.
- 재테스트 당일 거래량 ≥ 신호일 거래량: 193건, 승률 50.26%, 평균수익률 +0.0052%.
- 재테스트 당일 거래량 ≥ 직전 20일 SMA: 241건, 승률 49.38%, 평균수익률 -0.0124%.

### 해석
- 단순히 평균 거래량 이상인 것보다, 신호일 대비 거래량이 실제로 회복되는 조건이 더 유효했다.
- 다만 표본 193건과 기대수익 +0.0052%는 거래비용에 취약하므로, 통계적으로 확정적인 우위로 보지 않는다.

## [2026-09-18] EMA 겹침 허용폭별 눌림 진입 검증

### 목표
- EMA 중첩 지지의 가격 허용폭을 ±0.5%, ±1.0%, ±1.5%로 바꿔 최적의 지지 영역 폭을 확인한다.

### 결과
- 공통 조건: NYSE, 상승 EMA 95개 이상, RVOL 1.0~1.2, 다음날 저가가 신호일 종가 재테스트, 다음날 종가 진입, +1%/-1% 선후 판정.
- ±0.5%: 123건 판정, 승률 45.53%, 평균수익률 -0.0894%.
- ±1.0%: 476건 판정, 승률 49.79%, 평균수익률 -0.0042%.
- ±1.5%: 943건 판정, 승률 47.08%, 평균수익률 -0.0583%.

### 결론
- ±1.0% 허용폭이 표본과 승률·기대값의 균형이 가장 좋았다. 너무 좁으면 표본 부족, 너무 넓으면 지지 신호가 희석된다.

## [2026-09-18] EMA 중첩 지지 재테스트 눌림 진입 검증

### 목표
- EMA 중첩 신호일 다음날 시가 추격 대신, 다음날 저가가 신호일 종가를 재테스트한 경우 다음날 종가에 진입하는 방식이 기대값을 개선하는지 확인한다.

### 결과
- NYSE, 상승 EMA 95개 이상, RVOL 1.0~1.2, +1% 익절/-1% 손절.
- 눌림 재테스트: 476건 판정, 237승, 승률 49.79%, 평균수익률 -0.0042%.
- 재테스트 없음: 116건 판정, 47승, 승률 40.52%, 평균수익률 -0.1897%.

### 결론
- EMA 중첩 영역을 다음날 저가가 재테스트한 뒤 진입하면 추격 진입보다 크게 개선되고 손익분기점에 근접했다.
- 아직 거래비용 전 평균수익률이 소폭 음수라 확정 전략은 아니지만, 현재까지 가장 유망한 진입 구조다.

## [2026-09-18] 다음날 양봉 확인 진입 검증

### 목표
- NYSE의 상승 EMA 95개 이상·RVOL 1.0~1.2 신호에서 다음날 양봉이면서 전일 종가를 웃돌 때만 진입하면 기대값이 개선되는지 확인한다.

### 결과
- 비교 기준: 다음날 시가 진입, +1% 익절/-1% 손절, 5거래일 선후 판정. 592건 판정, 승률 46.79%, 평균수익률 -0.0642%.
- 다음날 양봉·전일 종가 상회 확인 후 다음날 종가 진입: 283건 판정, 승률 45.94%, 평균수익률 -0.0813%.

### 결론
- 단순한 양봉 확인 진입은 승률과 기대값을 개선하지 못했다. 상승 확인 자체보다 진입 지연에 따른 가격 추격 비용이 더 크게 작용한 것으로 해석한다.

## [2026-09-18] NYSE 상승 EMA 중첩 조건의 손익비 검증

### 목표
- `상승 EMA 95개 이상 + RVOL 1.0~1.2` 조건에서 익절·손절 폭을 바꿔 실제 기대수익이 양수인지 확인한다.

### 결과
- NYSE, 최근 301봉, 다음 거래일 시가 진입, 5거래일 내 선후 판정.
- +0.5% 익절/-0.5% 손절: 승률 31.25%, 평균수익률 -0.1875%.
- +0.5% 익절/-1.0% 손절: 승률 51.40%, 평균수익률 -0.2289%.
- +0.75% 익절/-1.0% 손절: 승률 49.67%, 평균수익률 -0.1308%.
- +1.0% 익절/-1.0% 손절: 승률 46.09%, 평균수익률 -0.0782%.
- +1.0% 익절/-1.5% 손절: 승률 58.08%, 평균수익률 -0.0480%.

### 결론
- 승률이 50%를 넘는 조합도 평균 기대수익은 모두 음수였다. 현재 EMA 중첩 신호는 방향성 후보 선별에는 유용하지만 단독 매매전략으로는 부족하다.
- 다음 개선은 신호일 종가 진입이 아닌 돌파 확인 진입, 갭·유동성 제한, 거래비용 차감 후 기대값을 분리해 검증한다.

## [2026-09-18] 상승 EMA·RVOL 조건의 거래소별 검증

### 목표
- `상승 EMA 95개 이상 + RVOL 1.0~1.2` 조건이 특정 거래소에만 유효한지 분리 확인한다.

### 결과
- NYSE: 605건 판정, 311승, 51.40%.
- NASDAQ: 393건 판정, 195승, 49.62%.
- AMEX: 21건 판정, 9승, 42.86%.

### 해석
- 전체 시장 결과의 일부 우위는 NYSE에서 주로 발생했다. NASDAQ은 50%에 미달했고 AMEX는 표본이 너무 작다.
- 따라서 현재 조건은 “미국 전체 전략”이 아니라 NYSE 중심 후보 필터로만 잠정 분류한다. 최근 기간 재현성과 거래비용 반영 후에만 운영 적용을 판단한다.

## [2026-09-18] 상승 EMA 95개·RVOL 1.0~1.2 시간순 검증

### 목표
- 동일 데이터에서 탐색된 유망 조건이 최근 구간에서도 재현되는지 확인해 과최적화 가능성을 점검한다.

### 검증 방법 및 결과
- 조건: 상승 중 EMA 95개 이상, 가격과 EMA ±1%, RVOL(SMA20) 1.0~1.2, 다음 거래일 시가 진입, 5거래일 +0.5% 익절/-1% 손절 선후 판정.
- 종목별 최근 301봉을 과거 60% 학습 구간과 최근 40% 검증 구간으로 분리했다.
- 학습 구간: 249건 판정, 131승, 52.61%.
- 검증 구간: 770건 판정, 384승, 49.87%.

### 결론
- 탐색 구간의 50%대 승률이 최근 검증 구간에서는 50% 아래로 소폭 하락했다. 강한 재현성은 아직 확인되지 않았고, 조건을 고정 전략으로 채택하지 않는다.
- 이 조건은 무작위 수준보다 크게 우월하다고 결론 내리기 어렵다. 다음 연구는 종목별 중복 신호를 줄이고, 시장 국면·유동성·거래비용을 반영한 기대값 검증으로 진행한다.

## [2026-09-18] 상승 EMA 중첩과 RVOL 결합 검증

### 목표
- 상승 중인 EMA 중첩 점수에 RVOL(SMA20 기준) 구간을 결합해 손익 선후 승률이 50%를 넘는 조합이 있는지 확인한다.

### 결과
- 다음 거래일 시가 진입, 5거래일 내 +0.5% 익절/-1% 손절 선후 판정.
- 상승 EMA 95개 이상 + RVOL 1.0~1.2: 1,019건 판정 중 515승, 50.54%.
- 상승 EMA 90개 이상 + RVOL 1.0~1.2: 1,151건 중 577승, 50.13%.
- 상승 EMA 95개 이상 + RVOL 2 이상: 364건 중 183승, 50.27%로 표본이 작다.
- 상승 EMA 95개 이상 + RVOL 1.2~2.0: 1,085건 중 523승, 48.20%.

### 해석 및 위험
- 현재 탐색상 가장 균형적인 조합은 `상승 EMA 95개 이상 + RVOL 1.0~1.2`다. 거래량 급증보다 평소 대비 소폭 증가한 거래량에서 승률이 높았다.
- 50% 초과는 동일 데이터에서 조건을 탐색한 결과이므로 과최적화 가능성이 있다. 기간·시장·종목군 분할 검증 없이는 최종 전략으로 확정하지 않는다.
- 다음 단계는 이 조합을 시간순 학습/검증 구간으로 분리해 재현성을 확인한다.

## [2026-09-18] 상승 기울기 EMA 중첩 점수 검증

### 목표
- 단순 중첩 대신 가격 ±1% 안에 있으면서 최근 3봉 동안 상승한 EMA의 개수를 세어 실제 손익 승률이 개선되는지 확인한다.

### 결과
- 해외 보통주 최근 301봉, EMA2~EMA365, 다음 거래일 시가 진입 후 5거래일 내 +0.5% 익절/-1% 손절 선후 판정.
- 상승 EMA 1개 이상: 선후 승률 37.74%, 표본 755,034건.
- 상승 EMA 10개 이상: 41.78%, 표본 279,786건.
- 상승 EMA 50개 이상: 47.31%, 표본 31,529건.
- 상승 EMA 75개 이상: 48.64%, 표본 13,564건.
- 상승 EMA 95개 이상: 49.74%, 표본 7,360건.
- 상승 EMA 98개 이상: 49.86%, 표본 6,765건. 상승 EMA 99~100개에서도 약 49.84%로 정점 부근이었다.

### 결론 및 주의사항
- 상승 중인 EMA가 많이 겹칠수록 단순 중첩보다 손익 선후 승률이 뚜렷하게 개선됐다. 단순 중첩 개수와 방향성 포함 중첩은 구분해야 한다.
- 현재 최선은 약 98개 이상 상승 EMA 중첩이지만, 아직 50%를 넘지 않았고 해외 전체·기간 통합 백테스트 결과이므로 실전 우위로 확정할 수 없다.
- 다음 단계는 이 점수에 RVOL 구간을 결합하고, 기간 분할 검증으로 특정 시기 편향을 확인한다.

## [2026-09-18] 해외 2~365 EMA 중첩 반등 검증

### 목표
- 365일 이상 데이터가 있는 해외 일봉 캐시에 대해 여러 EMA가 가격 ±1% 구간에 겹칠수록 다음날 반등률이 높아지는지 확인한다.

### 결과
- 대상 5,308종목, 최대 1,200봉, 분석 구간은 각 종목 최근 301봉이며 EMA2~EMA365를 계산했다.
- 다음날 고가가 신호 종가 대비 +0.5% 이상이면 반등으로 판정했다.
- 중첩 EMA 1개 이상: 1,104,186건 중 75.44%.
- 2개 이상: 965,842건 중 75.05%.
- 5개 이상: 739,140건 중 74.39%.
- 10개 이상: 529,429건 중 73.44%.
- 30개 이상: 194,342건 중 70.15%.

### 결론
- 국내와 해외 모두 단순히 겹치는 이평선 개수가 많아질수록 다음날 +0.5% 도달률이 높아진다는 근거는 확인되지 않았다. 오히려 중첩 수가 늘수록 하락했다.
- 다음 단계는 중첩 개수 대신 상승 중인 EMA만 세고, 가격이 다수 EMA를 하향 이탈 후 재돌파한 시점, RVOL, 손익 선후를 결합해 검증한다.
- 검증 실행 성공. 커밋·푸시·배포 없음.

## [2026-09-17] 1~365 EMA 중첩 반등률 기초 검증

### 목표
- 국내 보통주 일봉 캐시에서 종가가 각 EMA의 ±1% 이내인 이평선 개수를 세고, 단순 개수 및 장기선 가중치 점수와 다음 거래일 반등률의 관계를 확인한다.

### 확인 대상 및 결과
- 대상 2,353종목, 종목별 최대 보유 일봉 115개. 따라서 현재 국내 캐시로 EMA 365를 실제 산출할 수 없고, 최대 115일 범위까지만 유효하다.
- 반등 정의: 다음 거래일 고가가 신호 종가 대비 +0.5% 이상 도달.
- 단순 중첩 개수는 2개 이상에서 77.30%, 3개 이상에서 77.04%, 5개 이상에서 76.27%로 오히려 감소했다.
- 장기 EMA에 `log(1+기간)` 가중치를 준 점수도 점수가 높아질수록 반등률이 개선되지 않았다.
- EMA1은 종가와 항상 동일해 78.30%로 집계되는 구조적 기준선이므로 실전 신호에서 제외해야 한다.

### 결론 및 다음 연구
- “여러 이평선이 겹칠수록 반등 확률이 높다”는 가설은 현재 자료와 ±1%·다음날 고가 기준에서는 지지되지 않았다.
- 단순 근접 개수보다 이평선의 방향, 가격이 이평선을 상향 회복했는지, RVOL과 손절 선후를 결합해 검증해야 한다.
- 검증 실행 성공. 커밋·푸시·배포 없음.

## [2026-09-17] 장중 탐지 관측 batch 저장 및 배포 검증 안정화

### 목표
- 장중 탐지의 DB 관측 저장 왕복과 대량 전이 SQL 크기를 줄이고, 배포 검증의 반복 교착·파일 잠금 오류를 예방한다.

### 반영
- 국내·해외 TOP 상승률 수집을 병렬화했다.
- run/tick 관측 저장과 상태 전이 다건 저장을 batch SQL로 통합하고 500건 단위 chunking을 추가했다.
- 검증 순서를 빌드 선행으로 변경하고 typecheck의 tsBuildInfoFile을 검증 전용 경로로 분리했다.
- 관측 저장 및 chunking 회귀 테스트를 추가했다.

### 검증
- 
pm.cmd run deploy:verify` 통과: 빌드, 테스트 157개 파일/523개, 타입체크, 문서·범위·KIS·cron 감사, runtime smoke 모두 성공.
- `/charts` HTTP 200, 국내·해외 TOP 상승률 API JSON smoke 성공.
- 관측 회귀 테스트 3개와 타입체크 통과.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-020
- 성과 판정: IMPROVED
- 근거: 관측 전이 batch/chunking과 검증 전용 상태 파일 분리 후 전체 배포 검증이 완료됐고, 테스트 수가 157개 파일/523개로 증가한 상태에서 모두 통과했다.

### 다음 개선
- 운영 `intraday_detection_ticks`에서 관측 저장 전후의 DB latency와 tick duration p50/p95를 비교해 왕복 감소 효과를 확정한다.

### 커밋·푸시·배포
- 배포 상태: 미실행 (검증 통과 후 커밋·푸시·배포 대기).


## [2026-09-17] EMA10 안착 신호의 RVOL 구간별 검증

### 목표
- 국내 보통주 일봉 캐시에서 EMA10 위 저가 안착 신호에 RVOL(SMA20 기준)을 적용했을 때 신호 품질이 개선되는지 확인한다.

### 확인 대상 및 결과
- `scripts/probe-kr-ema10-rvol-buckets.cjs`를 추가하고 `kr_common_stock_universe`, `kr_instrument_universe_candles`를 조회했다.
- RVOL 3 이상: 다음 거래일 +0.5% 고가 도달률 81.48%, EMA10 유지율 77.73%, +0.5% 목표/-1% 손절 선후 승률 9.79%.
- RVOL 1.2~1.5: 도달률 80.37%, EMA10 유지율 72.15%, 선후 승률 20.12%.
- RVOL <0.7: 선후 승률 23.48%로 상대적으로 높았다.

### 결론 및 남은 위험
- RVOL 급증은 추세 지속과 장중 목표 도달 가능성은 높이지만, 손절도 빠르게 발생해 보수적 손익 승률을 높이지 않았다.
- RVOL은 단독 매수 필터보다 1.2~2.0 구간, EMA10 유지, 손절·익절 순서 판정을 결합해 사용해야 한다.
- 검증 실행 성공. 커밋·푸시·배포 없음.

## [2026-09-17] RVOL 구간과 변동성 압축 조합 검증

### 목표
- RVOL 1.2~2.0 구간에 최근 5봉 변동폭/직전 20봉 변동폭 1 미만 조건을 결합해 손익 기준 승률이 개선되는지 확인한다.

### 결과
- RVOL 1.2~2.0 + 변동성 압축: 2,163건, +0.5% 도달률 78.32%, +0.5%/-1% 선후 승률 21.05%.
- RVOL 1.2~2.0 + 변동성 비압축: 2,599건, 도달률 81.76%, 선후 승률 17.01%.
- RVOL 1.0~2.0 + 변동성 압축: 3,737건, 도달률 78.08%, 선후 승률 21.24%.

### 결론
- 거래량이 적정 범위이고 변동성이 압축된 신호는 손익 승률을 약 21% 수준으로 소폭 개선했지만 절대적으로 높은 승률은 아니다.
- 변동성 압축은 장중 도달률을 높이는 조건이 아니라 손절 선행을 일부 줄이는 필터로 해석해야 한다. 다음 연구는 진입 시점에 전일 RVOL이 아니라 당일 장중 거래량 확장 여부와 손절 폭 최적화를 분리 검증한다.

## [2026-09-17] 장중 국내·해외 TOP 상승률 수집 병렬화

### 목표
- 장중 탐지 worker에서 독립적인 국내·해외 TOP 상승률 수집이 서로를 직렬로 대기하는 병목을 줄인다.

### 원인·영향
- `runIntradayTick`이 해외 수집을 `await`한 뒤 국내 수집을 시작해 한 시장의 응답 지연이 다른 시장 후보 갱신까지 지연시켰다.
- 두 요청은 공통 결과를 필요로 하지 않으므로 병렬화해 tick 준비 시간을 단축할 수 있다.

### 반영
- `lib/intraday-detection-worker.ts`에서 국내·해외 수집을 `Promise.all`로 실행했다.
- 스냅샷 교체, 후보 점수화, KIS throttle, 실패 시 빈 결과 처리 순서는 유지했다.
- `scripts/verify-deploy.mjs`에서 빌드를 전체 테스트보다 먼저 실행해 테스트 worker와 Next build의 자원 경쟁으로 인한 검증 교착을 예방한다.
- 검증 전용 `tsBuildInfoFile`을 사용해 typecheck가 공유 `tsconfig.tsbuildinfo` 파일 잠금에 실패하지 않도록 했다.
- `lib/intraday-detection-observability.ts`에서 run upsert와 tick insert를 FK 순서를 보장하는 단일 CTE 쿼리로 결합해 tick당 DB 왕복을 2회에서 1회로 줄였다.
- `lib/intraday-detection-observability.test.ts`를 추가해 단일 DB 호출과 SQL 파라미터 순서를 고정했다.

### 재발 감지·남은 위험
- worker tick의 `durationMs`와 `plannedCount`를 `intraday_detection_ticks`에서 시장별로 함께 확인한다.
- 두 시장이 동시에 KIS 호출을 시작하므로 공용 TPS 제한과 pool 여유를 계속 관찰해야 한다.
- batch 전이는 현재 TOP 100 통합 후보 상한(최대 300건) 안에서 실행되며, 향후 전이 입력 상한이 늘면 parameter 수 기반 chunking을 추가한다.
- 500건 단위 chunking을 추가해 입력 상한이 증가해도 SQL·파라미터가 무제한으로 커지지 않게 했다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-019
- 성과 판정: IMPROVED
- 근거: 빌드 선행 검증 순서로 변경한 전체 `deploy:verify`가 빌드 118.7초 후 정상 완료했고, 테스트 157개 파일/522개, 타입체크·문서·범위·KIS·cron 감사와 runtime smoke(`/charts` 200, 국내 API 200 JSON, 해외 API JSON 응답)를 모두 통과했다.

### 다음 개선
- 운영 `intraday_detection_ticks`에서 변경 전후 동일 세션의 tick `durationMs` p50/p95와 시장별 응답 지연을 비교해 효과를 확정한다.

### 검증
- 
pm.cmd test -- --run lib/intraday-detection-worker.test.ts` 통과(3 tests).
- 전체 배포 전 검증을 시작해 테스트 156개 파일/520개 테스트와 타입체크·문서·감사 게이트까지 통과했다.
- 관측 CTE 변경 후 worker 단위 테스트 3개와 타입체크를 통과했다.
- 관측 회귀 테스트와 worker 테스트 4개를 통과했다.
- 배치 전환 중 남아 있던 worker 타입 참조 오류를 즉시 수정했고, 최종 관측·worker 테스트 5개와 타입체크를 통과했다.
- chunking 회귀 테스트 3개와 타입체크를 추가 통과했다.
- 최종 전체 검증 중 공유 tsbuildinfo 잠금 오류를 재현했으며, 검증 전용 경로 분리로 수정했다. 수정 후 전체 게이트를 다시 실행한다.
- 검증기의 기존 순서에서 산출물 경로 빌드는 출력 없이 장시간 지속됐지만, 별도 `NEXT_DIST_DIR=.next-build-check` 격리 빌드는 최적화 빌드와 107개 정적 페이지 생성을 성공했다.
- 성공한 standalone 산출물을 `PORT=4173`으로 실행하고 `/charts`(HTTP 200, HTML 8,648 bytes), `/api/stock/kr/top-rising-chart`(HTTP 200, JSON)를 직접 확인했다.

### 커밋·푸시·배포
- 배포 상태: 미실행 (standalone 실행 검증됨, 전체 검증기의 장시간 빌드 교착으로 배포는 보류).


## [2026-09-17] 헬스체크 스키마 점검 병렬화

### 목표
- 헬스체크가 스키마 검증 쿼리를 순차 대기해 응답시간을 늘리는 병목을 줄인다.

### 반영
- `lib/schema-health.ts`에서 연결·테이블·컬럼·폐기 테이블 조회를 병렬 실행하도록 변경했다.
- Flyway 버전 조회는 테이블 목록 확인 이후에만 실행하는 의존성을 유지했다.

### 검증
- 
pm.cmd run typecheck` 통과.
- 
px.cmd vitest run lib/schema-health.test.ts app/api/health/route.test.ts` 통과.
- 전체 
pm.cmd run deploy:verify`에서 테스트·빌드·실행 스모크를 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-018
- 성과 판정: IMPROVED
- 근거: 추가 운영 5회 측정에서 외부 경과시간 p50 920ms, 최댓값 1,117ms, 애플리케이션 보고 지연 558~911ms, 전부 `200/ok`를 확인했다. 직전 p50 1,289ms 대비 약 29% 개선됐다.
- 재발 감지: `/api/health`의 `responseTimeMs`와 외부 경과시간을 동일 조건으로 p50·p95 집계하고, 2초 초과 비율을 추적한다.

### 다음 개선
- 운영 헬스체크의 DB 쿼리별 지연시간을 비밀정보 없이 단계별 계측한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 전체 검증 통과 후 변경 파일만 커밋하고 푸시한다.

## [2026-09-17] 헬스체크 자동화 설정 조회 병렬화

### 목표
- `/api/health`가 상태 확인을 위해 불필요하게 순차 대기하는 시간을 줄인다.

### 반영
- `lib/health-check.ts`에서 캐시 자동화 모듈 3개의 설정 조회를 `Promise.all`로 병렬화했다.
- 기존 결과 필드와 오류 시 best-effort 동작은 유지했다.

### 검증
- 
pm.cmd run deploy:verify`에서 전체 테스트·타입체크·문서·빌드·실행 스모크를 확인한다.
- 운영 전후 `/api/health` 응답시간을 비교 측정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-017
- 성과 판정: UNMEASURED
- 근거: 독립적인 설정 조회의 순차 대기를 제거했으나 운영 응답시간 개선폭은 재측정이 필요하다.
- 재발 감지: `/api/health`의 `responseTimeMs`를 p50·p95로 수집하고 설정 조회 단계별 시간을 기록한다.

### 다음 개선
- health 상태의 독립적인 DB 조회 3개도 병렬화하되, PostgreSQL 풀 포화 여부를 함께 측정한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 전체 검증 통과 후 변경 파일만 커밋하고 푸시한다.

## [2026-09-17] 인트라데이 세션 상태 원인 세분화

### 목표
- 워커 중지 상태를 장외 정상 상태와 설정 비활성화·장중 중지로 구분한다.

### 반영
- `/api/kis/intraday-mvp`가 공통 `scanner-hours` 캘린더를 사용해 `OUTSIDE_SESSION`, `DISABLED`, `STOPPED`를 구분하도록 개선했다.
- 기존 `QUALIFIED`, `NO_TOP100`, `OBSERVING` 상태는 유지했다.

### 검증
- 
px.cmd vitest run app/api/kis/intraday-mvp/route.test.ts`에서 기존 결과 계약 2건을 통과했다.
- 전체 
pm.cmd run deploy:verify`에서 테스트·타입체크·문서·빌드·실행 스모크를 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-016
- 성과 판정: IMPROVED
- 근거: `worker=STOPPED`만으로 장애로 오판하던 상태를 세션·설정·장중 중지로 분리했다.
- 재발 감지: API 계약 테스트와 운영 점검에서 `status.reason`이 허용된 상태 집합인지 확인한다.

### 다음 개선
- 관리자 화면에서 시장별 세션 상태와 워커 상태를 함께 표시한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 전체 검증 통과 후 변경 파일만 커밋하고 푸시한다.

## [2026-09-17] 인트라데이 MVP 상태 원인 구조화

### 목표
- 정상적인 빈 결과와 후보 관측 중·워커 중지 상태를 API 소비자가 구분할 수 있게 한다.

### 반영
- `/api/kis/intraday-mvp` 응답에 `status.reason`을 추가했다: `QUALIFIED`, `NO_TOP100`, `DISABLED_OR_STOPPED`, `OBSERVING`.
- 충족 후보와 TOP100 부재 상태에 대한 회귀 테스트를 추가했다.

### 검증
- `app/api/kis/intraday-mvp/route.test.ts`에서 충족·후보 이탈 상태를 확인한다.
- 전체 
pm.cmd run deploy:verify`로 테스트·타입체크·문서·빌드·실행 스모크를 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-015
- 성과 판정: IMPROVED
- 근거: `items=[]`만으로 실패를 추정하던 소비자가 워커·후보 상태를 구조화된 값으로 판정할 수 있다.
- 재발 감지: API 계약 테스트에서 각 결과 상태에 `status.reason`이 존재하는지 확인한다.

### 다음 개선
- 장중 세션 판정 결과를 `OUTSIDE_SESSION`으로 세분화해 `DISABLED_OR_STOPPED`와 구분한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 전체 검증 통과 후 변경 파일만 커밋하고 푸시한다.

## [2026-09-17] 인트라데이 워커 환경변수 문서 계약 정합성 개선

### 목표
- 실제 워커 기동 코드와 설계 문서의 환경변수 명칭을 일치시켜 운영 설정 오류를 예방한다.

### 반영
- `docs/INTRADAY_KIS_MEMORY_DESIGN.md`의 잘못된 `INTRADAY_WORKER_ENABLED` 표기를 실제 코드 조건인 `INTRADAY_DETECTION_ENABLED`로 수정했다.

### 검증
- `rg -n "INTRADAY_(WORKER|DETECTION)_ENABLED" instrumentation.ts docs/INTRADAY_KIS_MEMORY_DESIGN.md`로 실행 코드와 문서의 명칭을 대조한다.
- 
pm.cmd run docs:check`로 문서 계약과 마이그레이션 검사를 수행한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-014
- 성과 판정: IMPROVED
- 근거: 운영자가 문서만 보고 설정할 때 실제 기동 조건과 다른 환경변수를 사용할 가능성을 제거했다.
- 재발 감지: CI에서 `instrumentation.ts`의 기동 플래그와 인트라데이 설계 문서의 플래그가 동일한지 문자열 감사한다.

### 다음 개선
- 환경변수 계약을 단일 예시 파일과 자동 감사 스크립트로 통합한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 전체 검증 통과 후 변경 파일만 커밋하고 푸시한다.

## [2026-09-17] 운영 상승률 TOP 100 거래대금 비율 API 실데이터 검증

### 목표
- 운영 서버의 상승률 TOP 100 기반 시총 대비 5분 누적 거래대금 탐지 기능이 실제 응답·JSON 계약·후보 추적 상태를 충족하는지 확인한다.

### 반영
- `GET https://stockman.r-e.kr/api/kis/intraday-mvp`를 운영 서버에 직접 호출했다.
- 장외 정상 정지와 전송·파싱 오류를 구분하는 운영 판정 기준을 기록했다.

### 검증
- `HTTP 200`, `Content-Type: application/json`, `ok=true`를 확인했다.
- TOP100_RISING·5분·1분 샘플 5개·시총 대비 거래대금 5%·KIS 고정 시총 기준에서 후보 19개·추적 19개·충족 0개였다.
- 확인 시각은 2026-09-17 22:16 KST이며 `worker=STOPPED`는 장 종료 후 상태와 일치한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-013
- 성과 판정: IMPROVED
- 근거: 운영 API가 HTML 오류가 아닌 JSON 계약으로 응답했고, `items=[]`를 워커 장외 상태와 함께 해석할 수 있게 됐다.
- 재발 감지: 장중 점검 시 HTTP 상태·Content-Type·`ok`·`worker.status`·`lastTickAt`·후보/추적/충족 수를 필수 확인한다. 장중 `STOPPED` 또는 허용 지연 초과를 워커 장애로 분류한다.

### 다음 개선
- 관리자 디버깅 화면에서 장중·장외 세션 판정과 워커 상태를 함께 표시한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 전체 검증 통과 후 문서 변경을 커밋하고 푸시한다.

## [2026-09-17] 런타임 스모크 서버 수명주기 개선

### 목표
- 배포 검증용 standalone 서버가 검증 종료 후 잔류해 다음 빌드·스모크 실행을 방해하지 않도록 한다.

### 반영
- `scripts/verify-deploy.mjs`에서 스모크 서버를 detached/unref하지 않고 검증 프로세스의 자식으로 유지하도록 수정했다.
- 기존 종료 루틴과 함께 부모-자식 수명주기를 일치시켜 잔류 Node 프로세스 가능성을 낮췄다.

### 검증
- 전체 
pm.cmd run deploy:verify`를 실행해 빌드와 런타임 스모크 종료까지 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-012
- 성과 판정: UNMEASURED
- 근거: 반복 검증에서 이전 Node 프로세스가 남은 상태와 빌드 장기 지연을 확인했고, detached 실행을 제거했다.
- 재발 감지: 검증 종료 후 standalone 서버 PID가 남지 않는지 프로세스 수명주기를 확인한다.

### 다음 개선
- 검증 스크립트에 종료 후 포트 해제 확인을 추가한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 검증 통과 후 변경 파일만 커밋하고 푸시·배포한다.

## [2026-09-17] 차트 API 회사명 덮어쓰기 오류 수정

### 목표
- `company` 파라미터가 없는 차트 요청에서 조회된 회사명이 티커로 덮어써지는 기능 오류를 제거한다.

### 반영
- `app/api/stock/chart/route.ts`에서 회사명은 실제 파라미터가 전달된 경우에만 응답 데이터에 덮어쓰도록 수정했다.
- `app/api/stock/chart/route.test.ts`에 파라미터 없이도 원본 회사명이 유지되는 회귀 검증을 추가했다.

### 검증
- 관련 차트 API 테스트와 전체 
pm.cmd run deploy:verify`를 실행해 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·런타임을 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-011
- 성과 판정: UNMEASURED
- 근거: 코드상 기본값 `company=code`가 항상 덮어쓰기를 유발하는 경로를 확인했으며 회귀 테스트로 재발을 차단한다.
- 재발 감지: 차트 응답에서 회사명이 입력 티커와 동일하게 덮어써지는 회귀 테스트를 유지한다.

### 다음 개선
- 국내·해외 차트 모달의 회사명 표시를 실제 브라우저 화면에서 함께 검증하는 UI smoke를 추가한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 검증 통과 후 변경 파일만 커밋하고 푸시·배포한다.

## [2026-09-17] 런타임 JSON 스모크 요청 타임아웃 보강

### 목표
- 외부 KIS 의존 API가 응답하지 않을 때 배포 검증이 장시간 정지하지 않도록 요청별 상한을 둔다.

### 반영
- `scripts/verify-deploy.mjs`의 HTML·JSON 스모크 fetch에 5초 `AbortSignal` 타임아웃을 적용했다.
- 재시도 전체 시간 제한은 유지해 장애 시 빠르게 실패하고 원인을 출력하도록 했다.

### 검증
- 단독 
pm.cmd run build`는 정상 종료했다.
- 수정 후 전체 
pm.cmd run deploy:verify`를 실행해 요청 타임아웃과 런타임 스모크 종료를 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-010
- 성과 판정: UNMEASURED
- 근거: 이전 검증에서 외부 API 대기 때문에 8분 이상 지속된 현상을 재현했고, 요청별 타임아웃을 추가했다.
- 재발 감지: 검증 프로세스별 소요시간과 마지막 오류를 출력한다.

### 다음 개선
- 검증 대상 API별 허용 응답시간과 환경별 외부 의존성을 manifest로 관리한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 검증 통과 후 변경 파일만 커밋하고 푸시·배포한다.

## [2026-09-17] JSON 스모크 게이트의 환경 의존 오탐 수정

### 목표
- 로컬에서 외부 자격증명·메모리 상태가 없어 API가 구조화된 5xx JSON을 반환하는 경우와 HTML 오류 응답을 구분한다.

### 반영
- `scripts/verify-deploy.mjs`의 JSON 스모크를 HTTP 2xx 여부가 아니라 `application/json` content-type과 실제 JSON 파싱으로 판정하도록 수정했다.
- 따라서 구조화된 API 오류는 계약 검증을 통과하고, HTML 404/504 응답은 계속 실패한다.

### 검증
- 전체 
pm.cmd run deploy:verify`를 재실행해 로컬 5xx JSON 오탐 해소와 전체 품질 게이트를 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-009
- 성과 판정: UNMEASURED
- 근거: 수정 전 로컬 smoke에서 HTTP 502·application/json·JSON body를 확인했고, 오류 원인은 검증기의 2xx 강제 조건이었다.
- 재발 감지: 상태 코드와 content-type을 모두 로그로 남기고, HTML 응답은 실패 처리한다.

### 다음 개선
- 별도 환경변수로 로컬 smoke에서 허용할 구조화 오류 상태를 명시해 계약을 더 세분화한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 검증 통과 후 변경 파일만 커밋하고 푸시·배포한다.

## [2026-09-17] 런타임 API JSON 스모크 게이트 추가

### 목표
- `/charts` HTML 렌더링만으로 배포 성공을 판단하는 검증 공백을 제거하고, 핵심 국내·해외 상승률 API의 실제 응답 형식까지 자동 확인한다.

### 반영
- `scripts/verify-deploy.mjs`에 JSON 응답 검증을 추가했다.
- HTTP 성공, `application/json` content-type, 실제 JSON 파싱을 모두 통과해야 런타임 스모크가 성공한다.
- `/api/stock/us/top-rising-chart`, `/api/stock/kr/top-rising-chart`를 검증 대상으로 추가했다.

### 검증
- 전체 
pm.cmd run deploy:verify`로 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·HTML/JSON 런타임 스모크를 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-008
- 성과 판정: UNMEASURED
- 근거: 기존 런타임 검증의 API 형식 공백을 코드 게이트로 보완했으며, 전체 게이트 실행 결과로 확정한다.
- 재발 감지: 핵심 API 목록을 JSON 스모크 대상에 유지하고 새 API 추가 시 함께 등록한다.

### 다음 개선
- 인증이 필요한 관리자 API는 테스트 전용 세션 주입 방식으로 별도 스모크한다.
- API별 최소 응답 계약(`ok`, `items`) 검증을 추가한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 검증 통과 후 변경 파일만 커밋하고 푸시·배포한다.

## [2026-09-17] 운영 API 사후 검증

### 목표
- 최근 배포 후 공개 운영 API가 HTML 오류 페이지가 아닌 예상 content-type과 상태를 반환하는지 확인한다.

### 확인 결과
- `/health-check`: HTTP 200, HTML 정상 응답.
- `/api/stock/us/top-rising-chart`: HTTP 200, JSON 정상 응답, snapshot 61 확인.
- `/api/stock/kr/top-rising-chart`: HTTP 200, JSON 정상 응답. 장외 시점이라 국내 메모리 TOP100 데이터 없음 메시지를 반환했으며 transport 오류는 없었다.
- `/api/kis/intraday-mvp`: HTTP 200, JSON 정상 응답.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-007
- 성과 판정: IMPROVED
- 근거: 운영 주요 API의 HTTP·content-type·본문 형식을 직접 확인했고 504/HTML 오응답은 재현되지 않았다.
- 재발 감지: 운영 검증에서 상태 코드·content-type·JSON 파싱 가능 여부를 함께 검사한다.

### 다음 개선
- 정규장 시간대 국내 TOP100 메모리 적재 상태를 별도 synthetic check로 검증한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 운영 검증 기록만 추가했으며, 코드 변경분과 함께 다음 검증 주기에 커밋·푸시한다.

## [2026-09-17] OCI 패키지 내부 필수 파일 자동 검증 추가

### 목표
- standalone tar가 생성됐다는 사실만으로 배포를 통과시키지 않고, 실제 활성화에 필요한 파일이 패키지 내부에 포함됐는지 자동 검증한다.

### 반영
- `.github/workflows/deploy-oci.yml`에 `server.js`, `build-info.json`, OCI cron 스크립트, Flyway 초기 마이그레이션의 tar 내부 존재 검사를 추가했다.
- 누락 시 패키징 단계에서 즉시 실패해 운영 서버까지 잘못된 릴리스가 전달되지 않도록 했다.

### 검증
- 전체 
pm.cmd run deploy:verify`를 실행해 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·런타임 스모크를 확인한다.
- workflow 패키징 경로와 실제 migration 파일명을 정적 대조했다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-006
- 성과 판정: UNMEASURED
- 근거: tar 검증은 CI Linux 실행에서 최종 확인되며, 로컬 품질 게이트와 런타임 검증을 우선 수행한다.
- 재발 감지: 패키지 생성 단계의 필수 파일 목록 검사를 유지한다.

### 다음 개선
- 배포 후 health endpoint의 build-info 커밋과 배포 커밋을 자동 비교한다.
- 필수 파일 목록을 별도 manifest로 관리해 workflow와 문서의 드리프트를 감지한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 검증 통과 후 변경 파일만 커밋하고 푸시·배포한다.

## [2026-09-17] OCI 배포 산출물 경로 불일치 수정

### 목표
- 배포 전 검증이 성공한 Next standalone 산출물이 실제 OCI 패키징·활성화 단계에도 동일하게 사용되도록 보장한다.

### 반영
- `.github/workflows/deploy-oci.yml`의 패키징 대상을 `.next/standalone`에서 `deploy:verify`가 생성한 `.next-deploy-verify/standalone`으로 통일했다.
- 패키징 전 `server.js` 존재 여부를 검사하고, 정적 파일·스크립트·배포 설정·Flyway 마이그레이션을 검증 산출물에 복사한다.
- tar 생성 경로를 동일 release directory 기준으로 변경해 stale/누락 산출물 배포를 방지한다.

### 검증
- 전체 
pm.cmd run deploy:verify`를 실행해 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·런타임 스모크를 확인한다.
- 배포 workflow의 패키징 경로와 검증 산출물 경로를 정적 대조한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-005
- 성과 판정: UNMEASURED
- 근거: CI 실제 실행 전에는 원격 활성화까지의 성공 여부를 단정할 수 없으며, 패키지 사전조건 검증을 추가했다.
- 재발 감지: workflow에서 release directory의 `server.js` 사전검사와 검증 산출물 경로 대조를 유지한다.

### 다음 개선
- CI에서 tar 내부 필수 파일 목록과 build-info 커밋을 직접 검증하는 패키지 검사 단계를 추가한다.
- 배포 후 `/health-check`와 build-info의 커밋 일치 여부를 자동 확인한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 검증 통과 후 변경 파일만 커밋하고 푸시·배포한다.

## [2026-09-17] 외부 데이터 응답 파싱 경계 보강

### 목표
- KIS 토큰 및 OpenDART 수집 경로가 HTTP 200 이후 HTML·빈 본문·잘못된 JSON을 받아도 원인 불명 예외로 끝나지 않게 한다.

### 반영
- `lib/kis-token.ts`: 토큰 응답 JSON 파싱 실패를 안전한 발급 실패로 처리하고 상태·content-type을 로그에 남긴다.
- `lib/dart-opendart-client.ts`, `lib/opendart-fast.ts`: JSON 파싱 실패를 HTTP 상태·content-type을 포함한 명확한 오류로 변환한다.
- 정상 응답 및 OpenDART 비즈니스 오류 코드 처리는 유지한다.

### 검증
- 관련 KIS 테스트를 실행하고 전체 
pm.cmd run deploy:verify`로 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·런타임 스모크를 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-004
- 성과 판정: UNMEASURED
- 근거: 기존 회귀 테스트와 전체 게이트를 우선 확인하며, 외부 응답 본문별 신규 모킹 테스트는 다음 단계다.
- 재발 감지: 파싱 실패 로그를 상태·content-type별로 집계한다.

### 다음 개선
- KIS 토큰과 OpenDART에 HTML·빈 본문·잘못된 JSON 응답 회귀 테스트를 추가한다.
- 프록시 5xx·타임아웃·비정상 content-type별 재시도 정책을 공통화한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 검증 통과 후 변경 파일만 커밋하고 푸시·배포한다.

## [2026-09-17] 해외 KIS 비정상 JSON 응답 처리 보강

### 목표
- KIS 해외 API가 504·HTML 등 JSON이 아닌 성공 HTTP 응답을 반환해도 스캐너가 원인 불명 파싱 예외로 종료되지 않도록 한다.

### 반영
- `lib/kis-us.ts`의 해외 상승률·수급강도 응답 파싱을 명시적 try/catch로 감쌌다.
- `content-type`, HTTP 상태, 파싱 오류를 `KIS-US-JSON-ERR` 디버그 이벤트로 남기고 구조화된 오류 메시지를 상위 계층에 전달한다.
- 정상 JSON 및 기존 비즈니스 오류 처리 계약은 유지했다.

### 검증
- `lib/kis.test.ts` 5개 테스트 통과.
- 전체 
pm.cmd run deploy:verify`에서 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·런타임 스모크를 확인한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-003
- 성과 판정: UNMEASURED
- 근거: 비정상 응답 회귀 케이스를 포함한 전용 테스트 보강은 다음 단계이며, 현재는 기존 계약과 전체 게이트를 우선 검증한다.
- 재발 감지: `KIS-US-JSON-ERR` 이벤트를 관리자 KIS 호출 대시보드에서 집계한다.

### 다음 개선
- HTML/빈 본문/잘못된 JSON 응답을 직접 모킹하는 해외 KIS 회귀 테스트를 추가한다.
- 운영에서 상태·content-type별 오류율과 재시도 결과를 비교한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 검증 통과 후 변경 파일만 커밋하고 푸시·배포한다.

## [2026-09-17] 전역 성능 감사 2차: 국내 볼린저 스캔 조회 병목 개선

### 목표
- 국내 종목 추출 API에서 최근 밴드와 캔들 매칭 시 반복되는 선형 검색을 제거해 후보 규모 증가에 따른 성능 저하를 줄인다.

### 반영
- `app/api/scan/kr-bollinger-rebound-ema9-rvol-avg/route.ts`에서 캔들 날짜 Map을 요청당 1회 생성하고 밴드별 캔들을 O(1)로 조회하도록 변경했다.
- 결과 필드·필터 조건·EMA/볼린저 정의는 변경하지 않았다.

### 검증
- 관련 테스트 및 전체 
pm.cmd run deploy:verify`를 실행한다.
- 기존 사용자 산출물과 임시 파일은 변경·커밋하지 않는다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-002
- 성과 판정: UNMEASURED
- 근거: 기능 회귀와 배포 게이트를 우선 검증하고, 실제 후보 수별 p95 계측은 후속 과제로 남긴다.
- 재발 감지: 스캔 루프 내부의 배열 `find` 반복을 정적 점검하고 응답시간을 후보 수와 함께 기록한다.

### 다음 개선
- 국내·해외 스캐너 공통으로 데이터 매칭 Map 생성 비용과 스캔 총 시간을 계측한다.
- 운영 샘플에서 후보 수별 p95를 비교해 추가 최적화 우선순위를 결정한다.

### 커밋·푸시·배포
- 배포 상태: 미실행
- 검증 통과 후 변경 파일만 커밋하고 푸시·배포한다.

## [2026-09-17] 전역 성능 감사: 실시간 MVP 후보 조회 병목 개선

### 목표
- 프로젝트 전반의 고영향 오류·병목을 점검하고, 이번 감사에서 재현 가능한 성능 병목을 우선 개선한다.
- 실시간 후보 결과 API가 후보 수 증가에 따라 불필요하게 느려지지 않도록 조회 복잡도를 선형으로 유지한다.

### 반영
- `app/api/kis/intraday-mvp/route.ts`에서 롤링 거래량 버킷을 후보마다 배열 검색하던 O(n²) 경로를 제거했다.
- `snapshot.rollingTurnover`를 요청당 `Map`으로 1회 인덱싱하고 후보별 O(1) 조회로 변경해 전체 매핑을 O(n)으로 개선했다.
- 후보 수가 증가해도 해당 병목이 재발하지 않도록 코드 리뷰 기준에 “반복 후보 매핑 내부 선형 검색 금지” 항목을 추가 대상으로 기록한다.

### 검증
- 관련 Vitest와 전체 `deploy:verify` 게이트를 실행해 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·런타임 검증을 확인한다.
- 기존 사용자 생성 파일과 `tsconfig.tsbuildinfo`는 변경 범위에서 제외한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-17-001
- 성과 판정: UNMEASURED
- 근거: 정량 벤치마크는 전체 게이트 실행 결과에 기록하며, 실제 후보 수별 p95 측정은 후속 과제로 남긴다.
- 재발 감지: 후보 매핑 코드 리뷰와 관련 API 성능 측정에서 배열 `find` 반복 여부를 점검한다.

### 다음 개선
- 운영 로그의 후보 수·응답시간·Map 인덱싱 시간을 분리 계측해 후보 규모별 p95를 수집한다.
- 이번 감사에서 확인되는 추가 재현 오류는 별도 원인·영향·회귀 검증 항목으로 기록한다.

### 커밋·푸시·배포
- 배포 상태: 차단
- 커밋: `82aacb7c` 생성 완료.
- 푸시·배포: 전체 게이트 재검증 후 진행한다.

## [2026-09-17] 국내 일봉 EMA10 터치 후 반등 확률 산출

### 목표 및 범위
- 로컬 PostgreSQL의 국내 일봉 캐시에서 종가가 EMA10 위에 있던 뒤 저가가 EMA10 이하로 내려온 터치 사례를 집계한다.
- 터치 당일 종가가 EMA10 위이고 양봉인 경우를 반등 사례로 정의해 반등 수 / 전체 터치 수를 계산한다.
- 국내 보통주·활성 종목과 시가총액 300억 원 초과 정책을 적용한다.

### 반영
- 재현 가능한 분석 스크립트 `scripts/analyze-kr-ema10-touch-rebound.cjs`를 추가했다.

### 검증 결과
- 분석 대상 기간: 2026-04-15 ~ 2026-09-16
- 터치 발생 종목 수: 2,039개
- 전체 터치 수: 44,405건
- 반등 수: 13,968건
- 반등 확률: 31.4559%

### 커밋·푸시·배포
- 커밋·푸시·배포: 미실행

## [2026-09-17] 해외 EMA10·EMA20 골든크로스 후 2거래일 연속 상승 통계

### 정의 및 검증
- 해외 활성 보통주 일봉 캐시에서 EMA10이 EMA20을 상향 돌파한 이벤트를 집계했다.
- 교차일 다음 두 거래일의 종가가 각각 직전 종가보다 높으면 성공으로 판정했다.
- 전체 31,063건 중 6,568건 성공, 확률 21.1441%.
- 시장별: AMS 229/1,450(15.7931%), NAS 3,543/17,536(20.2042%), NYS 2,796/12,077(23.1514%).
- 동일 이벤트의 다음 거래일 상승: 14,467/31,588건, 확률 45.7990%.

## [2026-09-17] 해외 EMA10 상단 완전 안착 후 다음날 상승 통계

### 정의 및 검증
- 일봉 저가가 EMA10보다 높은 경우를 EMA10 위 완전 안착으로 정의했다.
- 안착일 다음 거래일 종가가 안착일 종가보다 높으면 상승으로 판정했다.
- 전체 451,278건 중 214,192건 성공, 확률 47.4634%.
- 시장별: AMS 6,523/15,499(42.0866%), NAS 111,200/238,157(46.6919%), NYS 96,469/197,622(48.8149%).

## [2026-09-17] 해외 EMA10 상단 안착 후 다음날 EMA10 유지 통계

### 정의 및 검증
- 당일 저가가 EMA10보다 높은 사례 중 다음 거래일 저가도 다음 거래일 EMA10보다 높은 경우를 유지로 판정했다.
- 전체 459,685건 중 329,702건 유지, 확률 71.7235%.
- 시장별: AMS 10,484/15,684(66.8452%), NAS 170,194/242,053(70.3127%), NYS 149,024/201,948(73.7933%).
- 안착일 RVOL(SMA20) 분포: <0.5 63,484건(13.6962%), 0.5~1 224,027건(48.3321%), 1~1.5 108,251건(23.3543%), 1.5~2 33,155건(7.1529%), 2~3 19,624건(4.2337%), 3 이상 14,975건(3.2307%). 구간별 EMA10 유지 확률은 각각 61.6266%, 70.0233%, 76.0085%, 79.0409%, 80.4830%, 81.4223%였다.
- 유지 성공 사례의 다음 거래일 종가 수익률: 평균 +0.7924%, 중앙값 +0.3262%, 최저 -61.8868%, 최고 +3,717.7128%.

## [2026-09-17] 해외 EMA150 ±2.5% 진입 후 EMA75 도달·EMA150 하회 통계

### 정의 및 검증
- 매수 이벤트는 종가가 EMA150의 ±2.5% 범위에 들어온 각 일봉으로 정의했다.
- 이후 남은 캐시 이력에서 고가가 EMA75 이상 도달하면 EMA75 도달, EMA150 아래 종가가 연속 2거래일 이상이면 EMA150 하회로 판정했다.
- 전체 매수 이벤트 169,673건 중 EMA75 도달 168,354건(99.2226%), EMA150 하회 2일 이상 164,993건(97.2418%).
- 시장별 EMA75 도달: AMS 98.9992%, NAS 99.3030%, NYS 99.1647%.
- 시장별 EMA150 하회 2일: AMS 99.0599%, NAS 96.8105%, NYS 97.5037%.

### 10거래일 제한 추가 검증
- 매수 후 완전한 10거래일 이력이 존재하는 사례만 분모에 포함했다.
- 전체 236,882건 중 206,980건이 10거래일 내 EMA75에 도달해 확률은 87.3768%였다.
- 시장별: AMS 88.0381%, NAS 88.3352%, NYS 86.4161%.
- 도달 사례 상승폭: EMA75 최초 도달일까지 종가 기준 평균 +0.9772%, 중앙값 +0.6452%; 10거래일 내 최고가 기준 평균 +7.2530%, 중앙값 +4.8598%였다.
- 매수 후 정확히 10거래일째 종가가 EMA150 아래인 사례는 124,439/254,865건으로 48.8255%였다.
- 매수 후 10거래일 이내 EMA150 아래 종가가 한 번 이상 발생한 사례는 204,547/257,215건으로 79.5237%였다. 중간에 EMA150 위로 회복한 뒤 재하회한 경우도 포함했다.
- 매수 후 10거래일 이내 +5% 도달: 고가 기준 113,271/261,611건(43.2975%), 종가 기준 86,522/261,611건(33.0728%).
- 매수 후 10거래일 이내 +3% 도달: 고가 기준 164,376/264,144건(62.2297%), 종가 기준 129,895/264,144건(49.1758%).

## [2026-09-17] 해외 최신 EMA150 ±2.5% 구간 종목 탐지

### 정의 및 검증
- 활성 보통주 중 일봉 캐시가 150개 이상인 종목을 대상으로 했다.
- 2026-09-16 종가가 EMA150의 ±2.5% 이내인 종목을 추출했다.
- 대상 2,487개, 조건 충족 337개.
- 시총 1,000만 달러 미만을 제외한 대상은 2,327개였고 조건 충족은 337개로 동일했다.
- 시총 1,000억 달러 이상으로 상향한 결과 대상 80개, 조건 충족 17개로 재추출했다.
- 재검증 시 DB 최신 스냅샷 기준 대상 87개, 조건 충족 19개로 변경됐다. 추가 종목은 TXN, ASML이다.

## [2026-09-17] 미국 최신 일봉 0.10달러 미만 보통주 탐지

### 검증 결과
- 시장 최신 캐시일: AMS/NAS/NYS 모두 2026-09-17.
- 종목별 최신 캐시 종가 0.10달러 미만 활성 보통주: 3개.
- 티커: CTNT(2026-09-17), RITR·UZX(각 2026-09-16).

## [2026-09-17] 국내 일봉 캐시 갱신 현황 확인

### 검증 결과
- KOSDAQ: 활성 보통주 1,591개 전부 캐시 보유 및 최신일 2026-09-16 적용.
- KOSPI: 활성 보통주 762개 전부 캐시 보유 및 최신일 2026-09-16 적용.
- 전체 2,353개 중 캐시 누락 0개, 최신 거래일 적용 2,353개.

## [2026-09-17] 국내 종목별 일봉 보유 개수 확인

### 검증 결과
- 활성 보통주 2,353개, 종목별 일봉 평균 113.01개, 최소 24개, 최대 115개.
- 100~149개 보유 종목 2,228개, 60~99개 117개, 60개 미만 8개.
- 150개 이상 보유 종목은 0개이며, 대부분 캐시 시작일은 2026-04-01이다.

### 커밋·푸시·배포
- 커밋·푸시·배포: 미실행

## [2026-09-17] 해외 종목별 일봉 캐시 개수 확인

### 검증 결과
- 활성 보통주 5,308개 중 일봉 150개 초과 종목은 AMS 104/241, NAS 1,460/3,181, NYS 888/1,886이다.
- 전체 150개 초과 종목은 2,452개(46.23%), 150개 이상은 2,454개(46.27%)다. 정확히 150개인 종목은 2개다.
- 시장별 일봉 평균 개수: AMS 464.64개, NAS 521.66개, NYS 579.14개.

### 커밋·푸시·배포
- 커밋·푸시·배포: 미실행

### 커밋·푸시·배포
- 커밋·푸시·배포: 미실행

### 커밋·푸시·배포
- 커밋·푸시·배포: 미실행

### 커밋·푸시·배포
- 커밋·푸시·배포: 미실행

## 2026-09-17 해외 일봉 캐시 최신화

### 작업 목적 및 범위

- 며칠간 중단된 해외 일봉 로컬 DB 캐시를 KIS 해외주식 일봉 API 기준으로 재수집했다.
- DB 통합 해외 공통주식 유니버스(NAS·AMS·NYS)를 대상으로 일봉을 갱신하고, 실행에 포함된 주봉·월봉 보강 큐도 완료했다.

### 확인 대상 및 결과

- 실행 대상: 5,312종목, NAS 3,185·AMS 241·NYS 1,886종목.
- 최종 실행 결과: 일봉 성공 5,312건, 전체 성공 14,465건, 실패 0건, 저장 캔들 1,277,295개.
- DB 최종 일봉: NAS 20260916(3,228종목), AMS 20260916(247종목), NYS 20260916(1,900종목).
- KIS HTTP 500/RATE_LIMITED는 재시도 후 모두 성공했으며, 선택적 디버그 테이블 부재 경고는 캐시 저장 결과에 영향을 주지 않았다.

### 근본 원인 및 재발 감지

- 중단 기간으로 인해 일봉·주봉·월봉 freshness 및 일봉 백필 대상이 동시에 발생했다. 실행기는 freshness 판정과 백필 목록을 기준으로 재수집했다.
- 다음 실행에서 시장별 최신 거래일, 적용 종목 수, 실패 건수를 비교해 미적용 종목을 자동 식별한다. 진행 카운터는 여러 봉 주기를 합산하므로 유니버스 종목 수를 초과할 수 있다.

### 남은 위험 및 다음 개선

- 진행률 로그의 `totalCount`가 종목 수로 고정되어 여러 timeframe 처리 시 직관성이 떨어진다. 봉 주기별 total/progress를 분리 표시하는 개선이 필요하다.
- `kis_rate_limit_events` 및 `debug_kis_calls` 테이블이 없어 선택적 이력 저장은 수행되지 않았다.

### 검증 및 배포 상태

- 실행 반환값 확인 및 로컬 PostgreSQL 시장별 최신 거래일 조회 완료.
- 커밋·푸시·배포: 미실행.

## 2026-09-18 미국 일봉 최신화 실행 점검

- 목적: 현재 미국 로컬 DB 일봉 캐시를 최신 거래일 기준으로 갱신.
- 확인 대상: `scripts/run-us-refresh.mjs`를 통해 `.env.local` 우선 환경으로 기존 미국 일봉 갱신기를 실행하고, `localhost:5433` PostgreSQL 연결을 점검.
- 결과: DB 연결 `ECONNREFUSED`; Docker 데몬도 실행 중이 아니어서 `docker-compose.local.yml`의 PostgreSQL을 시작하지 못했다. 캐시 데이터는 변경되지 않았다.
- 재발 감지: 갱신 전 DB 연결 확인 단계에서 포트 5433 연결 상태를 검사해야 한다.
- 남은 위험/다음 조치: Docker Desktop 및 `stockman-postgres-local`을 먼저 기동한 뒤 동일 실행 명령을 재시도한다.
- 커밋·푸시·배포: 미실행.

## 2026-09-17 일회용 해외 일봉 1,200개 백필 기능

### 작업 목적 및 범위

- 해외 공통주식 종목별 일봉 이력을 최대 1,200개까지 확보할 수 있도록 일회용 백필 스크립트를 추가했다.
- 기존 캐시 저장 함수와 KIS 조회 모듈을 재사용했으며, 정규 갱신 작업이나 스캐너의 기본 이력 길이는 변경하지 않았다.

### 변경 파일 및 동작

- `scripts/us-daily-1200-backfill.ts`: 응답의 가장 오래된 거래일을 다음 `BYMD`로 넘겨 페이지를 반복 조회하고, 중복 제거 후 최대 1,200개를 저장한다. 기본 동시성은 4이며 요청 횟수는 종목당 20회로 제한한다.
- `scripts/run-us-daily-1200-backfill.mjs`: `.env.local` 값을 우선 주입한 뒤 일회용 스크립트를 실행하는 래퍼다. 자격증명 원문은 출력하지 않는다.

### 검증 및 실행 방법

- 
pm.cmd run typecheck` 통과.
- 실행 예: 
ode_modules/tsx/dist/cli.mjs scripts/run-us-daily-1200-backfill.mjs`.
- 실행 전 `US_DAILY_BACKFILL_TARGET`로 목표 개수를 1~1,200 범위에서 조정할 수 있다.
- 커밋·푸시·배포: 미실행.

### 남은 위험 및 다음 개선

- KIS 응답이 시장·종목별로 반환하는 실제 행 수에 따라 종목당 API 요청 수와 소요 시간이 달라진다. 실행 후 DB에서 종목별 보유 개수를 확인해야 한다.
- 일회용 도구이므로 자동화 스케줄에는 연결하지 않았다.

### 추가 검증
- 동일 정의로 EMA20·EMA60을 추가 산출했다.
- EMA20: 터치 26,314건, 반등 7,498건, 반등 확률 28.4943%
- EMA60: 터치 7,040건, 반등 2,143건, 반등 확률 30.4403%

### 시가총액 구간별 추가 검증
- 구간: 300억~1,000억, 1,000억~1조, 1조~10조, 10조 이상.
- 각 구간에 대해 EMA10·EMA20·EMA60 터치와 반등을 재집계했다.
- 종목 단위 교집합: 세 EMA를 모두 터치한 1,338개 중 각 EMA에서 반등 실패가 모두 발생한 종목은 1,298개(97.0105%)였다.
- 시총 구간별 교집합 결과: 300억~1,000억 423/441(95.9184%), 1,000억~1조 639/659(96.9651%), 1조~10조 179/180(99.4444%), 10조 이상 57/58(98.2759%).
- EMA25·75·150·365 추가 집계: EMA25는 22,092건 중 6,383건(28.8928%), EMA75는 4,364건 중 1,353건(31.0037%)이었다. 현재 캐시의 유효 이력 길이가 부족해 EMA150·365는 산출 불가했다.

## [2026-09-17] 해외 일봉 캐시 최신 거래일 현황 확인

### 확인 대상
- `us_common_stock_universe`의 활성 보통주와 `us_instrument_universe_candles`의 일봉 캐시.

### 검증 결과
- AMS: 241/241 캐시 보유, 최신 거래일 2026-09-16 적용 239개.
- NAS: 3,181/3,181 캐시 보유, 최신 거래일 2026-09-16 적용 3,175개.
- NYS: 1,886/1,886 캐시 보유, 최신 거래일 2026-09-16 적용 1,886개.
- 전체: 5,308/5,308 캐시 보유, 최신 거래일 적용 5,300개, 미보유 0개.

### 커밋·푸시·배포
- 커밋·푸시·배포: 미실행

## [2026-09-14] OCI standalone 패키징 경로 오류 수정

### 목표
- standalone 패키징 단계에서 배포가 중단되지 않도록 필수 대상 디렉터리 생성을 보장한다.

### 원인 및 영향
- Next standalone 출력에 `public` 디렉터리가 자동 생성되지 않는 경우 복사 단계가 즉시 실패해 애플리케이션 활성화까지 진행되지 않았다.

### 반영
- 배포 workflow에서 `public`과 `.next` 대상 디렉터리를 복사 전에 생성하도록 수정했다.

### 검증
- 
pm.cmd run deploy:verify`의 테스트 156개 파일·521개 테스트와 타입검사 통과. 문서 계약은 보완 후 재실행한다.

### 다음 개선
- 배포 workflow에 standalone 아카이브 내부 필수 파일 존재 검사를 추가한다.

### 커밋·푸시·배포
- 배포 상태: 미실행 (검증 통과 후 진행)

### 개선 과제
- 개선 과제 ID: CI-2026-09-14-062
- 성과 판정: IMPROVED
- 근거: standalone 복사 대상인 `public` 및 `.next` 디렉터리를 workflow에서 선행 생성해 경로 부재 실패를 제거했다.

## [2026-09-14] 상승률 TOP100 배포 전 통합 검증

### 상태 메시지 UI 보강
- 국내 상승률 화면이 빈 배열만 보여 원인을 알 수 없던 문제를 수정했다.
- MVP API에 워커 상태와 후보·추적·확정 건수 및 상태 메시지를 추가하고, 국내 화면에서 수집 진행·조건 미충족·후보 부재 상태를 표시한다.
- 재발 방지: 빈 결과 렌더링은 원인 메시지를 동반하며, API 상태 필드는 UI 진단에 사용한다.

### 목표
- Docker Desktop의 로컬 PostgreSQL을 포함해 상승률 TOP100 개선사항의 전체 검증 게이트를 통과시킨다.

### 반영
- 시간 의존 DART 테스트를 고정 스케줄 mock으로 보완했다.
- Docker PostgreSQL 통합 테스트 환경을 복구해 전체 검증을 재실행했다.

### 검증
- 
pm.cmd run verify` 통과.
- 156개 테스트 파일·521개 테스트 통과.
- 타입체크, 문서 검증, verify-scope, KIS boundary, OCI cron 검사 및 Next.js 프로덕션 빌드 통과.

### 개선 과제
- 개선 과제 ID: CI-2026-09-14-061
- 성과 판정: IMPROVED
- 근거: 로컬 DB 통합 테스트를 포함한 배포 전 자동 검증 게이트가 재현 가능하게 통과했다.

### 다음 개선
- 배포 후 운영 서버에서 TOP100 MVP 관측 주기와 KIS 호출 지연을 디버깅 API로 확인하고, 기준 초과 시 자동 경고하도록 개선한다.

### 커밋·푸시·배포
- 미실행. 현재 요청 범위는 상승률 TOP100 기능 개선 및 검증이다.

## [2026-09-13] TOP 100 MVP 롤링 윈도우·해외 후보 추적 보강

### 목표
- 1분 단위 5분 거래대금 계산에서 윈도우 밖 관측치를 제거하고, 국내·해외 TOP100 후보를 동일한 MVP 추적 큐로 관리한다.

### 반영
- 5분 경계에서 가장 오래된 분 버킷이 제거되는 회귀 테스트를 추가했다.
- 해외 상승률 TOP100 후보에도 `mvpTracking`을 부여해 1분 주기 관측과 TOP100 이탈 시 메모리 정리가 적용되도록 했다.
- 관리자 디버깅 API의 flow 요약에 MVP 추적 후보 수, 확정 수, 임계값, 윈도우, 필요 샘플 수를 명시했다.
- 300개 후보 전체를 한 배치로 큐에 넘기도록 조정해 `dueCandidates(..., 20)`으로 인해 1분 관측이 수분 단위로 지연되는 병목을 제거했다. 실제 KIS 호출 속도는 공용 10 TPS throttle이 제한한다.
- 확정된 MVP 종목만 반환하는 `/api/kis/intraday-mvp` 조회 API와 기준 메타데이터 응답을 추가했다.
- 해외 분봉 파싱에서 누적 `tvol`·`acml_*` fallback을 제거하고 증분 분당 거래량만 MVP 거래대금에 사용하도록 오탐 경로를 차단했다.
- 종목별 롤링 거래대금 합계를 메모리 인덱스로 유지해 매 관측의 전체 재합산을 제거하고, 버킷 교체·만료·삭제 시 합계를 동기화했다.
- 세션 날짜를 UTC가 아닌 거래소 현지 시간(미국: 뉴욕, 국내: 서울)으로 계산해 정규장 중 UTC 자정에 버퍼가 초기화되는 오류를 차단했다.
- MVP 결과 API가 현재 TOP100 스냅샷 소속까지 검증하도록 해 원천 갱신 실패 시 직전 확정 후보가 노출되는 stale 결과를 차단했다.
- MVP 임계값·윈도우·필요 샘플 수를 단일 정책 상수로 통합해 worker·결과 API·디버깅 API 간 기준 불일치 위험을 제거했다.
- 전체 검증에서 현재 시각에 따라 실패하던 DART 스케줄 테스트를 고정된 스케줄 mock으로 바꿔 검증 게이트의 시간 의존성을 제거했다.
- 종목별 롤링 버퍼가 장시간 실행에도 최근 5개 1분 버킷으로 제한되는 메모리 상한 회귀 테스트를 추가했다.

### 검증
- 
px vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts lib/intraday-candidate-priority.test.ts app/api/kis/intraday-mvp/route.test.ts lib/kis-us-minute-turnover.test.ts --run` 통과: 5개 파일·22개 테스트.
- 
pm.cmd run typecheck` 통과.
- 추가 stale 결과 회귀 검증: 
px vitest run app/api/kis/intraday-mvp/route.test.ts lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 3개 파일·17개 테스트.
- Docker Desktop의 `stockman-postgres-local` 컨테이너 기동 후 전체 
pm.cmd test -- --run` 통과: 156개 파일·521개 테스트.
- 
pm.cmd run typecheck` 실행 완료.
- 
pm.cmd run docs:check` 실행 완료.
- 
pm.cmd run build` 통과: Next.js 프로덕션 빌드 성공.

### 다음 개선
- 국내·해외 KIS 분봉 원천 payload fixture로 거래대금 필드와 후보 추적을 통합 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-060
- 성과 판정: UNMEASURED
- 근거: 롤링 윈도우 경계·해외 후보 추적·누적 거래량 오탐·합산 비용을 코드와 회귀 테스트로 보강했다.

### 커밋·푸시·배포
- 미실행. 현재 요청은 MVP 기능 개발과 로컬 검증 단계다.

## [2026-09-13] TOP 100 MVP 최신 1분봉 선택 오류 수정

### 목표
- KIS 분봉 응답 순서와 무관하게 가장 최근 1분봉만 5분 거래대금 계산에 사용한다.

### 반영
- worker에서 분봉을 날짜·시간 오름차순으로 정렬한 뒤 최신 봉을 선택한다.
- KIS 국내 수집기가 반환하는 내림차순 응답을 오래된 봉으로 잘못 처리하던 경로를 차단했다.
- 최신 봉 선택 회귀 테스트를 추가했다.

### 검증
- 
px vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·13개 테스트.
- 
pm.cmd run typecheck` 통과.
- 
pm.cmd run docs:check` 통과.

### 다음 개선
- 국내·해외 KIS 분봉 원천 payload fixture를 추가해 날짜·시간 필드별 정렬을 통합 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-059
- 성과 판정: IMPROVED
- 근거: provider 응답 순서에 의존하던 최신봉 선택을 제거해 MVP 누적 계산의 입력 정확성을 높였다.

### 커밋·푸시·배포
- 미실행. 현재 요청 범위는 MVP 기능 개선과 로컬 검증이다.

## [2026-09-13] TOP 100 MVP 확정 상태 관측 연계

### 목표
- 5분 거래대금 5% 조건의 확정 상태가 관리자 전환 이력과 일치하도록 한다.

### 반영
- 품질 상태와 MVP 거래대금 조건을 먼저 결합한 뒤 최종 상태를 한 번만 기록한다.
- `QUALIFIED` 전환이 `intraday_detection_transitions` 관측 로그에 누락되지 않도록 정리했다.

### 검증
- 
px vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·12개 테스트.
- 
pm.cmd run typecheck` 통과.
- 
pm.cmd run docs:check` 통과.

### 다음 개선
- 실제 KIS 응답 fixture를 사용한 확정 전환 통합 테스트를 추가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-058
- 성과 판정: IMPROVED
- 근거: MVP 확정 상태와 관리자 관측 전환의 기록 경로를 단일화했다.

### 커밋·푸시·배포
- 미실행. 현재 요청 범위는 MVP 기능 개선과 로컬 검증이다.

## [2026-09-13] TOP 100 MVP 1분 버킷·품질 게이트 보강

### 목표
- rolling 5분 계산의 버킷 중복과 stale 데이터 확정 오탐을 차단한다.

### 반영
- rolling 관측 시각을 1분 경계로 정규화해 초 단위 차이를 같은 봉으로 처리한다.
- 거래량이 없는 원천 응답은 거래대금 필드 fallback을 사용한다.
- `STALE`·`DEGRADED`·`WARMING_UP` 품질 상태에서는 5% 비율을 확정 탐지로 승격하지 않는다.

### 검증
- 
px vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·12개 테스트.
- 
pm.cmd run typecheck` 통과.
- 
pm.cmd run docs:check` 통과.

### 다음 개선
- 실제 국내·해외 KIS 응답 fixture를 이용해 최신 1분봉 거래대금 필드 매핑을 통합 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-057
- 성과 판정: IMPROVED
- 근거: 1분 버킷 중복 합산과 품질 불량 상태의 확정 승격을 코드·테스트로 차단했다.

### 커밋·푸시·배포
- 미실행. 현재 요청 범위는 MVP 기능 개선과 로컬 검증이다.

## [2026-09-13] TOP 100 MVP 메모리 정리·관측성 보강

### 목표
- TOP 100 변동 시 MVP rolling 버퍼가 남지 않게 하고 5분 상태를 운영 디버깅에서 확인한다.

### 반영
- MVP 추적 후보가 현재 TOP 100에서 이탈하면 후보·VWAP·rolling 버퍼를 함께 제거한다.
- 후보 eviction 시 rolling 버퍼도 함께 삭제해 메모리 상한을 보장한다.
- 세션 변경 시 rolling 버퍼를 초기화한다.
- 디버깅 스냅샷에 종목별 1분 거래대금 버킷을 노출한다.

### 검증
- 
px vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·11개 테스트.
- 
pm.cmd run typecheck` 통과.
- 
pm.cmd run docs:check` 통과.

### 다음 개선
- 운영 환경에서 실제 KIS 1분봉 시간 필드와 버킷 간격을 확인하는 통합 검증을 추가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-056
- 성과 판정: IMPROVED
- 근거: TOP 100 이탈·후보 eviction 경로의 rolling 메모리 회수를 테스트로 고정하고 디버깅 가시성을 추가했다.

### 커밋·푸시·배포
- 미실행. 현재 요청 범위는 기능 개선과 로컬 검증이다.

## [2026-09-13] TOP 100 5분 거래대금 집중 MVP

### 목표
- 상승률 TOP 100 후보 중 KIS 고정 시가총액 대비 최근 5분 거래대금이 5% 이상인 종목만 메모리에서 확정 탐지한다.

### 반영
- `IntradayMemoryState`에 종목별 고유 1분 버킷 기반 rolling turnover window를 추가했다.
- 동일 버킷 재수신은 덮어써 중복 합산을 방지하고, 세션별로 윈도우를 초기화한다.
- 5개 관측값이 모이고 `최근 5분 거래대금 / 고정 시가총액 >= 0.05`일 때만 `mvpQualified`와 `QUALIFIED` 상태를 부여한다.
- 기존 5% 우선순위 점수는 유지하되, MVP 확정 조건과 분리했다.
- `intraday-detection-worker`가 매 tick의 최신 1분봉 거래대금만 rolling window에 넣도록 연결했다.

### 검증
- 
px vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·8개 테스트.
- 
pm.cmd run typecheck` 통과.
- 
ode --check scripts/verify-deploy.mjs` 통과.

### 다음 개선
- 남은 위험: KIS 원천 응답의 최신 1분봉 시간 필드가 누락되면 수신 시각을 버킷 키로 사용하므로 운영 로그에서 시간 품질을 계속 감시해야 한다.
- 국내·해외 실응답을 각각 5분 연속 수집하는 통합 테스트와 MVP 확정 이벤트 전용 알림 연결은 다음 단계다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-055
- 성과 판정: IMPROVED
- 근거: 단일 5% 점수 조건을 5개 고유 1분 관측 기반의 명시적 확정 상태로 분리했고, 중복 합산 방지 테스트를 추가했다.

### 커밋·푸시·배포
- 미실행. 현재 요청 범위는 MVP 설계·개발 및 로컬 검증이다.

## [2026-09-13] 배포 검증 런타임 종료 안정화

### 목표
- 배포 전 검증이 성공 문구를 출력한 뒤에도 검증용 서버 프로세스 때문에 종료되지 않는 문제를 제거한다.

### 원인
- Windows에서 `taskkill`을 비동기로 호출했지만 검증용 자식 프로세스의 생명주기를 부모와 분리하지 않아 고아 Node 프로세스가 남을 수 있었다.
- 고아 프로세스가 다음 빌드의 자원을 점유해 빌드가 비정상적으로 지연될 수 있었다.

### 반영
- `scripts/verify-deploy.mjs`의 런타임 서버를 분리 실행하고 `unref()`하여 검증 종료를 방해하지 않게 했다.
- Windows 트리 종료는 `taskkill /t /f`로 유지하고, 비-Windows에서는 SIGTERM을 사용한다.
- 검증 빌드 산출물은 `.next-deploy-verify`에 격리하며, 임시 TypeScript 경로가 `tsconfig.json`에 남지 않도록 확인 절차를 추가했다.

### 검증
- 
ode --check scripts/verify-deploy.mjs` 통과.
- 
pm.cmd run deploy:verify`의 테스트 154개 파일·507개 테스트, 타입체크, 문서 검사, 검증 범위 감사, KIS 경계 감사, cron 검사를 통과했다.
- 격리 빌드 `NEXT_DIST_DIR=.next-deploy-isolated npm.cmd run build` 종료 코드 0 및 107개 페이지 생성 확인.
- 빌드 후 `tsconfig.json`에서 임시 산출물 경로를 제거해 원래 설정을 유지했다.

### 다음 개선
- CI에서 검증 명령의 종료 코드와 고아 프로세스 유무를 함께 수집한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-054
- 성과 판정: IMPROVED
- 근거: 실제 빌드가 종료 코드 0으로 완료되었고, 런타임 검증 프로세스의 부모 생명주기 의존성을 제거했다.

### 커밋·푸시·배포
- 사용자 요청에 따라 관련 파일만 커밋·푸시한다. 운영 배포는 별도 요청 범위가 아니므로 실행하지 않는다.
- 배포 상태: 미실행

## [2026-09-13] 검증 manifest 변경 승인 감사

### 목표
- 검증 범위 변경이 사유·승인 주체·승인일 없이 반영되는 구조적 회귀를 방지한다.

### 반영
- `scripts/audit-verify-scope-change.mjs` 추가.
- manifest 변경 diff에 승인 메타데이터가 함께 포함되는지 검사하는 명령을 등록했다.

### 검증
- 
ode --check scripts/audit-verify-scope-change.mjs` 통과.
- 
pm.cmd run audit:verify-scope` 통과: 현재 manifest 변경 없음.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- GitHub Actions에서 manifest 변경 PR에 이 감사를 자동 실행한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-028
- 성과 판정: IMPROVED
- 근거: 승인 정보가 빠진 검증 범위 변경을 사전에 탐지할 수 있다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 범위 승인 메타데이터 강제

### 목표
- 검증 범위 manifest가 단계 목록만 가지고 있어 변경 책임과 사유를 추적하기 어려운 문제를 개선한다.

### 반영
- `verify-scope.json`에 변경 사유·승인 주체·승인일을 추가했다.
- 비교 도구가 승인 메타데이터와 승인 단계 목록의 유효성을 먼저 검사하도록 강화했다.

### 검증
- 
ode --check scripts/compare-verify.mjs` 통과.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- manifest 변경 diff에 승인 메타데이터 변경이 함께 있는지 자동 대조한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-027
- 성과 판정: IMPROVED
- 근거: 책임·사유·일자가 없는 검증 범위 변경이 비교 단계로 진행되지 않는다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 단계 승인 manifest

### 목표
- 신규 검증 단계가 기준값과 운영 승인 없이 성능 비교에 포함되는 문제를 방지한다.

### 반영
- `config/verify-scope.json`에 승인된 검증 단계 목록을 분리했다.
- `compare:verify`가 manifest 미등록 단계를 `unapprovedStages`로 표시하고 실패 처리한다.

### 검증
- 
ode --check scripts/compare-verify.mjs` 통과.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- manifest 변경 시 변경 사유와 승인자를 기록하는 검증을 추가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-026
- 성과 판정: IMPROVED
- 근거: 승인되지 않은 검증 단계가 성능 비교를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 신규 검증 단계 승인 게이트

### 목표
- 기준값이 없는 신규 검증 단계가 성능 비교를 왜곡하는 문제를 방지한다.

### 반영
- `compare:verify`가 신규·누락 단계가 있으면 `scopeStatus: REVIEW_REQUIRED`를 출력한다.
- 신규 단계의 기준값이 승인되기 전까지 비교 결과를 실패 처리한다.

### 검증
- 
ode --check scripts/compare-verify.mjs` 통과.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 승인된 기준값을 별도 manifest로 관리하고 비교 도구가 자동으로 읽는다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-025
- 성과 판정: IMPROVED
- 근거: 신규 검증 단계가 승인 없이 성능 비교를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 범위 변경 자동 탐지

### 목표
- 검증 단계가 조용히 빠지거나 추가되어 성능 비교 기준이 바뀌는 문제를 방지한다.

### 반영
- `compare:verify`가 `missingStages`와 
ewStages`를 출력하도록 추가했다.
- 기준 단계 누락은 비교 실패로 처리하고, 신규 단계는 범위 변경으로 표시한다.

### 검증
- 
ode --check scripts/compare-verify.mjs` 통과.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 신규 단계의 기준값 부재를 별도 승인 상태로 관리한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-024
- 성과 판정: IMPROVED
- 근거: 검증 단계 누락과 추가가 성능 회귀와 구분되어 자동 표면화된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 성능 비교 신뢰도·재측정 권고

### 목표
- 환경 불일치 성능 비교 결과를 운영자가 회귀로 오해하지 않도록 해석 정보를 강화한다.

### 반영
- `compare:verify`에 `confidence`와 `recommendation` 필드를 추가했다.
- 환경이 다르면 신뢰도를 `LOW`로 표시하고 동일 환경 재측정을 권고한다.

### 검증
- 
ode --check scripts/compare-verify.mjs` 통과.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 두 결과의 누락 단계와 신규 단계를 비교해 검증 범위 변경도 경고한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-023
- 성과 판정: IMPROVED
- 근거: 환경 불일치 결과에 신뢰도와 재측정 권고가 함께 제공된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 비교 환경 불일치 경고

### 목표
- 서로 다른 실행 환경의 측정값을 코드 성능 회귀로 잘못 판정하는 문제를 방지한다.

### 반영
- `compare:verify`가 Node·OS·아키텍처·CPU 코어 수를 기준 결과와 비교한다.
- 차이가 있으면 성능 판정과 분리된 `ENVIRONMENT_MISMATCH` 상태와 차이 목록을 JSON으로 출력한다.

### 검증
- 
ode --check scripts/compare-verify.mjs` 통과.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 환경 불일치 시 비교 신뢰도와 재측정 권고를 출력한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-022
- 성과 판정: IMPROVED
- 근거: 환경 차이와 코드 성능 회귀를 결과에서 분리해 확인할 수 있다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 측정 환경 메타데이터 추가

### 목표
- 서로 다른 실행 환경의 성능 결과를 같은 기준으로 오해하는 문제를 방지한다.

### 반영
- `measure:verify` JSON에 Node 버전, OS, 아키텍처, CPU 코어 수를 추가했다.
- 민감정보와 명령 인자는 계속 저장하지 않는다.

### 검증
- 
ode --check scripts/measure-verify.mjs` 통과.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 비교 도구가 환경 메타데이터가 다른 결과를 경고하도록 개선한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-021
- 성과 판정: IMPROVED
- 근거: 성능 결과에 비식별 실행 환경 정보가 포함되어 비교 기준을 확인할 수 있다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 성능 회귀 자동 판정

### 목표
- 검증 단계별 성능 측정값을 이전 실행과 비교해 회귀를 자동으로 차단한다.

### 반영
- `scripts/compare-verify.mjs` 추가.
- 기준·현재 JSON의 단계별 소요 시간을 비교하고 기본 20% 초과 증가를 `REGRESSED`로 판정한다.
- `package.json`에 `compare:verify` 명령을 등록했다.

### 검증
- 
ode --check scripts/compare-verify.mjs` 통과.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 동일 환경이 아닌 실행 결과를 구분할 수 있도록 Node·OS·CPU 정보를 비식별 메타데이터로 추가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-020
- 성과 판정: IMPROVED
- 근거: 기준 대비 단계별 20% 초과 성능 회귀가 명령 실패로 자동 표면화된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 성능 결과 저장 옵션

### 목표
- 검증 단계별 성능 결과가 콘솔 출력 후 사라져 전후 비교가 어려운 문제를 개선한다.

### 반영
- `measure:verify`에 `--out` JSON 저장 옵션을 추가했다.
- 저장 결과에는 단계명·성공 여부·소요 시간만 포함하고 환경변수·명령 인자는 저장하지 않는다.

### 검증
- 
ode --check scripts/measure-verify.mjs` 통과.
- 기존 
pm.cmd run measure:verify` 전체 실행 통과 및 단계별 JSON 출력 확인.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 직전 결과 파일과 현재 결과를 비교해 단계별 회귀 임계치를 자동 판정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-019
- 성과 판정: IMPROVED
- 근거: 검증 성능 결과를 파일로 보존해 연속 비교할 수 있다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 파이프라인 단계별 성능 측정

### 목표
- 전체 검증의 통과 여부뿐 아니라 단계별 소요 시간을 측정해 병목 개선의 근거를 만든다.

### 반영
- `scripts/measure-verify.mjs` 추가.
- 테스트·타입체크·문서·KIS 감사·cron·빌드를 순차 실행하고 단계별 시간을 JSON으로 출력한다.
- `package.json`에 `measure:verify` 명령을 등록했다.

### 검증
- 
pm.cmd run verify` 통과: 테스트 152개 파일·502개 테스트, 타입체크, 문서, KIS 경계, cron, 빌드.
- 
pm.cmd run measure:verify` 통과: 전체 122,977ms, 테스트 64,508ms, 빌드 51,575ms 등 단계별 JSON 출력 확인.
- Windows 실행기의 셸 경고를 발견해 명시적 셸 경로 사용으로 수정했다.

### 다음 개선
- 측정 결과를 파일로 저장하고 직전 실행 대비 회귀 임계치를 자동 판정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-018
- 성과 판정: IMPROVED
- 근거: 검증 병목을 단계별 수치로 비교할 수 있는 실행 경로가 추가됐다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 통합 검증 게이트 누락 보완

### 목표
- KIS 경계 감사가 개별 실행에만 머물러 CI 통합 검증에서 누락되는 구조 오류를 방지한다.

### 반영
- `package.json`의 `verify` 파이프라인에 `audit:kis-boundary`를 연결했다.
- 전체 검증에서도 KIS 모듈·예외·테스트·경로·기능 registry가 검사되도록 보완했다.

### 검증
- 
pm.cmd run verify` 통과: 테스트 152개 파일·502개 테스트, 타입체크, 문서, KIS 경계, cron, Next 빌드.
- 빌드에서 정적 페이지 107개 생성 확인.

### 다음 개선
- 통합 검증 단계별 소요 시간을 기록해 병목 단계와 변동을 추적한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-017
- 성과 판정: IMPROVED
- 근거: KIS 구조 감사가 CI 통합 검증에서 누락되지 않는다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 기능 계약 registry 연결

### 목표
- KIS 모듈 파일과 API 경로뿐 아니라 대표 기능 구현의 누락·이름 변경도 자동 탐지한다.

### 반영
- 핵심 국내외 차트·일봉·순위 모듈의 대표 함수를 registry에 등록했다.
- 감사 스크립트가 registry 함수가 실제 소스에 존재하는지 검사하도록 추가했다.

### 검증
- 
pm.cmd run audit:kis-boundary` 통과: 모듈·테스트·예외·경로·대표 함수 계약 검사.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 대표 함수별 응답 계약 필드와 테스트 케이스를 registry에 연결한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-016
- 성과 판정: IMPROVED
- 근거: registry에 등록된 핵심 KIS 기능의 구현 누락이 자동 탐지된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 핵심 모듈 API 경로 registry

### 목표
- 핵심 KIS 모듈의 책임 분류만 관리하지 않고 실제 호출 API 경로까지 구조적으로 대조한다.

### 반영
- 국내외 차트·일봉·순위 핵심 모듈의 대표 API 경로를 registry에 등록했다.
- 감사 스크립트가 registry 경로가 실제 소스에 존재하는지 검사하도록 추가했다.

### 검증
- 
pm.cmd run audit:kis-boundary` 통과: 모듈 registry, 테스트 연결, 예외 범위, 대표 API 경로 검사.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- registry에 모듈별 대표 기능명과 API 응답 계약을 연결한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-015
- 성과 판정: IMPROVED
- 근거: 핵심 모듈에서 등록된 KIS API 경로가 제거되는 구조 회귀가 자동 탐지된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 핵심 모듈 테스트 연결 감사

### 목표
- 핵심 KIS 모듈과 대표 회귀 테스트가 분리되어 검증 누락이 발생하는 구조를 방지한다.

### 반영
- 공통 요청 경계, throttle, 토큰, Approval, 해외 거래추세 모듈에 대표 테스트 파일 연결을 추가했다.
- 감사가 등록된 모듈과 테스트 파일의 존재 여부를 함께 검증하도록 강화했다.

### 검증
- 
pm.cmd run audit:kis-boundary` 통과: registry, 예외 경계, 핵심 모듈 테스트 연결 검사.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- registry에 모듈별 허용 API 경로 패턴을 추가하고 실제 소스와 대조한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-014
- 성과 판정: IMPROVED
- 근거: 핵심 KIS 모듈의 대표 테스트 누락이 감사에서 차단된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 모듈 책임 registry 추가

### 목표
- 새 KIS 모듈이 책임 분류와 감사 대상에서 누락되는 구조 회귀를 방지한다.

### 반영
- `scripts/kis-module-registry.mjs`에 현재 KIS 모듈별 책임 영역을 등록했다.
- 감사 스크립트가 실제 모듈과 registry의 양방향 일치를 검사하도록 강화했다.

### 검증
- 
pm.cmd run audit:kis-boundary` 통과: 27개 KIS 모듈 registry 일치 및 요청 경계 검사.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- registry에 모듈별 허용 API 경로와 대표 테스트 파일을 추가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-013
- 성과 판정: IMPROVED
- 근거: registry 미등록 또는 코드에서 사라진 KIS 모듈이 자동 탐지된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 예외 엔드포인트 범위 감사

### 목표
- KIS 예외 모듈이 허용된 인증 엔드포인트를 벗어나 일반 데이터 API를 호출하는 회귀를 방지한다.

### 반영
- 토큰 모듈에는 `/oauth2/tokenP`, Approval 모듈에는 `/oauth2/Approval`만 허용하도록 감사 범위를 구조화했다.
- 예외 파일·목적·엔드포인트가 아키텍처 문서에 모두 기록되는지 검사한다.

### 검증
- 
pm.cmd run audit:kis-boundary` 통과: 데이터 모듈 공통 경계 및 예외 엔드포인트 범위 검사.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 일반 데이터 모듈도 허용된 KIS API 경로와 기능명을 구조화해 감사한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-012
- 성과 판정: IMPROVED
- 근거: 예외 모듈의 허용 범위 외 엔드포인트 호출이 자동 차단된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 예외 목적 구조화

### 목표
- KIS 요청 경계 예외가 파일명만으로 관리되어 책임이 불명확해지는 문제를 방지한다.

### 반영
- 감사 allowlist를 파일명과 예외 목적의 Map으로 변경했다.
- 예외 파일과 목적이 아키텍처 문서에 모두 기록되어야 감사가 통과하도록 강화했다.

### 검증
- 
pm.cmd run audit:kis-boundary` 통과: 예외 파일 존재·목적 문서화·데이터 모듈 경계 검사.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 예외별 허용 엔드포인트 패턴까지 구조화해 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-011
- 성과 판정: IMPROVED
- 근거: 목적이 없는 KIS 예외 등록이 감사에서 차단된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 예외 경계 문서 동기화 감사

### 목표
- KIS 공통 경계의 예외 목록이 실제 파일 및 아키텍처 문서와 어긋나는 회귀를 방지한다.

### 반영
- KIS 경계 감사가 예외 모듈 존재 여부와 문서 명시 여부를 함께 검사하도록 강화했다.
- 토큰 발급·Approval 예외 파일명을 아키텍처 문서에 명시했다.

### 검증
- 
pm.cmd run audit:kis-boundary` 통과: 예외 모듈 존재·문서 동기화 및 데이터 모듈 경계 검사.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.
- 초기 실행에서 감사 스크립트의 기준 경로 변수 누락을 발견해 수정 후 재검증했다.

### 다음 개선
- 예외 모듈별로 허용된 외부 호출 목적까지 구조화해 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-010
- 성과 판정: IMPROVED
- 근거: 코드에만 존재하거나 문서에만 존재하는 KIS 예외가 감사에서 차단된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] KIS 요청 경계 정적 감사 추가

### 목표
- KIS 데이터 모듈이 공통 요청 경계를 우회하는 구조 회귀를 조기에 탐지한다.

### 반영
- `scripts/audit-kis-boundary.mjs` 추가.
- 
pm run verify`에 `audit:kis-boundary` 단계 연결.
- 토큰 발급·Approval을 제외한 KIS 모듈의 공통 throttle 경계 사용을 검사한다.

### 검증
- 
pm.cmd run audit:kis-boundary` 통과: 모든 KIS 데이터 모듈이 공통 경계를 사용한다.
- 
pm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

### 다음 개선
- 직접 fetch가 추가된 파일을 diff 기준으로 더 빠르게 탐지한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-009
- 성과 판정: IMPROVED
- 근거: 공통 KIS 요청 경계 우회가 검증 단계에서 자동 차단된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 외부 요청 경계 명시

### 목표
- KIS 호출 모듈이 공통 rate limit·timeout·관측 경계를 우회하지 않도록 구조 기준을 명확히 한다.

### 반영
- `docs/architecture/external-request-boundaries.md`에 일반 KIS 요청, 토큰 발급, Approval 예외의 책임 경계를 문서화했다.
- `scripts/check-docs.mjs`가 해당 구조 문서와 핵심 계약 문구를 검사하도록 연결했다.

### 검증
- 
pm.cmd run docs:check` 통과: 외부 요청 경계 계약, 최신 기록 계약, ID 중복, 필수 문서·Flyway 133개 검사.

### 다음 개선
- KIS 모듈별 공통 프레임워크 사용 여부를 정적 검사하는 감사 스크립트를 추가한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-008
- 성과 판정: IMPROVED
- 근거: KIS 요청 경계의 책임과 예외가 단일 문서 계약으로 검증된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 배포 상태 기록 자동 검증

### 목표
- 커밋·푸시·배포 상태가 모호하게 기록되어 실제 전달 여부를 오판하는 문제를 방지한다.

### 반영
- `scripts/check-docs.mjs`가 최신 로그의 배포 상태를 `미실행`, `완료`, `실패`, `차단` 중 하나로 검사한다.
- 완료 상태에는 커밋 식별자가 필요하도록 규칙을 추가했다.

### 검증
- 
pm.cmd run docs:check` 통과: 배포 상태, 실행성 근거, 다음 개선, ID 중복, 필수 문서·Flyway 133개 검사.

### 다음 개선
- 완료 상태에서 푸시·배포 확인 URL 또는 배포 검증 결과까지 연결한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-007
- 성과 판정: IMPROVED
- 근거: 모호한 배포 상태와 식별자 없는 완료 기록이 게이트에서 차단된다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 다음 개선 내용 자동 검증

### 목표
- 다음 개선 항목이 빈 값이나 형식적인 없음으로 기록되는 문제를 방지한다.

### 반영
- `scripts/check-docs.mjs`가 최신 로그의 `### 다음 개선` 구간에 구체적인 목록이 있는지 검사하도록 추가했다.
- 지속 개선 문서에 다음 과제의 구체성 규칙을 반영했다.

### 검증
- 
pm.cmd run docs:check` 통과: 다음 개선 내용, 실행성 근거, ID 중복, 필수 문서·Flyway 133개 검사.

### 다음 개선
- 다음 단계에서 개선 과제 상태와 실제 배포 상태의 불일치를 자동 탐지한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-006
- 성과 판정: IMPROVED
- 근거: 빈 다음 개선 항목이 문서 게이트를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 검증 근거 실행성 자동 검증

### 목표
- 검증 결과가 선언에 그치지 않고 실제 실행 명령 또는 측정값을 포함하도록 보장한다.

### 반영
- `scripts/check-docs.mjs`가 최신 로그의 `### 검증` 구간에서 실행 가능한 검사 명령 또는 측정 결과를 찾도록 추가했다.
- 지속 개선 문서에 검증 근거를 기록해야 한다는 규칙을 반영했다.

### 검증
- 
pm.cmd run docs:check` 통과: 실행 명령 포함 여부, 최신 기록 계약, ID 중복, 필수 문서·Flyway 133개 검사.

### 다음 개선
- 검증 명령의 종료 코드와 결과 요약을 구조화해 자동 비교한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-005
- 성과 판정: IMPROVED
- 근거: 실행 명령이 없는 검증 기록이 문서 게이트를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 성과 판정 근거 자동 검증

### 목표
- 성과 판정이 근거 없이 기록되어 개선 여부를 잘못 판단하는 오류를 방지한다.

### 반영
- `scripts/check-docs.mjs`가 최신 로그 항목의 `근거:` 기록 여부를 검사하도록 추가했다.
- 지속 개선 문서의 성과 판정 규칙에 근거 필수 원칙을 반영했다.

### 검증
- 
pm run docs:check` 통과: 최신 기록 계약, ID 중복, 성과 근거, 필수 문서·Flyway 133개 검사.

### 다음 개선
- 근거가 실제 검증 명령 또는 측정 수치와 연결되는지 자동 검사한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-004
- 성과 판정: IMPROVED
- 근거: 근거 없는 성과 판정이 문서 게이트를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 개선 과제 ID 중복 자동 검증

### 목표
- 개선 과제 ID 중복으로 작업 추적이 섞이는 오류를 배포 전 차단한다.

### 반영
- `scripts/check-docs.mjs`가 로그 전체의 `CI-YYYY-MM-DD-NNN` ID 중복을 검사하도록 추가했다.
- 지속 개선 문서에 ID 고유성 규칙을 반영했다.

### 검증
- 
pm run docs:check` 통과: 최신 기록 계약, 전체 ID 중복, 필수 문서·Flyway 133개 검사.

### 다음 개선
- 과거 성과 판정 변경 이력도 자동 검증한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-003
- 성과 판정: IMPROVED
- 근거: 중복된 개선 과제 ID가 문서 게이트를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 개선 과제 값 유효성 검증

### 목표
- 개선 과제 ID와 성과 판정이 형식만 존재하는 상태를 방지하고 실제 추적 가능한 값인지 검증한다.

### 반영
- `scripts/check-docs.mjs`에 `CI-YYYY-MM-DD-NNN` 개선 과제 ID 형식 검사를 추가했다.
- 성과 판정은 `IMPROVED`, `UNCHANGED`, `REGRESSED`, `UNMEASURED`만 허용하도록 추가 검증했다.

### 검증
- 
pm run docs:check` 통과: 최신 로그 값, 필수 문서, Flyway 133개 검사.

### 다음 개선
- 과거 성과 판정 변경 이력도 검사한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-002
- 성과 판정: IMPROVED
- 근거: 잘못된 과제 ID·성과 상태가 문서 게이트를 통과하지 못한다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 최신 개발 기록 자동 계약 게이트

### 목표
- 작업 기록이 단순 보관에 그치지 않고 다음 개선으로 이어지는지 자동 검증한다.

### 반영
- `scripts/check-docs.mjs`가 최신 날짜 로그 항목의 목표·반영·검증·다음 개선·커밋/푸시/배포 상태를 검사하도록 추가했다.
- 지속 개선 문서에 기록 계약과 배포 전 게이트를 연결했다.

### 검증
- 
pm run docs:check`로 최신 기록 계약과 필수 문서·Flyway 검사를 확인한다.

### 다음 개선
- 향후 개선 과제 ID와 전후 성능 수치까지 자동 검증 대상으로 확장한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-13-001
- 성과 판정: IMPROVED
- 근거: 최신 작업 기록의 필수 구조 누락을 배포 전 자동 감지할 수 있다.

### 커밋·푸시·배포
- 미실행. 사용자 요청이 없는 상태에서는 변경을 로컬에만 유지한다.

## [2026-09-13] 지속 개선 문서 계약 자동검증

### 목표
- 지속 개선 문서가 존재하는 것에 그치지 않고 핵심 운영 규칙을 계속 포함하도록 보장한다.

### 반영
- `scripts/check-docs.mjs`에 생명주기·배포 체크리스트·지속 개선·검토 문서의 필수 계약 문구 검사를 추가했다.
- 계약이 누락되면 `docs:check`가 실패해 배포 검증이 중단된다.

### 검증
- 
pm run docs:check` 통과: 문서 계약 및 Flyway 133개 검사.
- 커밋·푸시·배포: 미실행.

## [2026-09-13] 지속 개선 검토 주기 구체화

### 목표
- 개선 과제를 정기적으로 재평가하고 성과와 미해결 위험을 추적한다.

### 반영
- `docs/operations/improvement-review.md`에 배포 직후·일간·주간·월간 검토 주기와 우선순위 기준을 추가했다.
- 개선 전후 수치 비교 및 `IMPROVED/UNCHANGED/REGRESSED/UNMEASURED` 판정 규칙을 추가했다.
- 배포 체크리스트와 문서 인덱스에 검토 기준을 연결했다.
- `scripts/check-docs.mjs`가 검토 기준 문서의 존재를 확인하도록 했다.

### 검증
- 
pm run docs:check` 통과: 필수 문서 16개, Flyway 133개 확인.
- 커밋·푸시·배포: 미실행.

## [2026-09-13] 지속 개선 운영 루프 강화

### 목표
- 운영 결과가 개선 과제로 연결되고 반복 오류가 자동 검증으로 승격되는 구조를 만든다.

### 반영
- `docs/operations/continuous-improvement.md`에 개선 루프, 영역별 관찰 지표, 과제 템플릿, 회고 규칙을 추가했다.
- `docs/README.md`와 배포 체크리스트에서 지속 개선 기준으로 연결했다.
- `scripts/check-docs.mjs`가 지속 개선 운영 기준 문서의 존재를 검사하도록 했다.

### 검증
- 
pm run docs:check` 통과: 필수 문서 15개, Flyway 133개 확인.
- 커밋·푸시·배포: 미실행.

## [2026-09-13] 전 작업 문서화 규칙 확정

### 목표
- 기획·개발·검증·배포·운영 개선의 모든 작업을 추적 가능하게 관리한다.

### 반영
- `AGENTS.md`에 사소한 조사·수정·검증을 포함한 전 작업 문서화 규칙을 추가했다.
- 작업 목적, 범위, 변경/확인 대상, 검증 결과, 커밋·푸시·배포 여부를 기록하도록 표준화했다.
- 문서화되지 않은 작업은 완료로 간주하지 않는 원칙을 명시했다.

### 검증
- 문서와 규칙의 UTF-8 저장 상태를 확인했다.
- 본 변경은 커밋·푸시·배포하지 않았다.

## [2026-05-11] UI/UX 고도화 및 실시간 시각화 개선 (Phase 1)

### 1. 목표
- 대시보드의 시각적 품질 향상 (프리미엄 디자인 적용)
- 사용자 편의성 증대 (외부 차트 링크 연동)
- 실시간성 강조 (애니메이션 효과)

### 2. 주요 변경 사항
- **디자인 시스템 업데이트**: `globals.css` 및 각 컴포넌트의 CSS 모듈 수정.
- **차트 연동 기능**: DART 공시 항목에 네이버 증권 차트 바로가기 링크 추가.
- **가독성 개선**: 카드 레이아웃 재배치 및 배지 디자인 고도화.

### 3. 상세 내역
- [x] `lib/utils.ts`: 종목명 기반 네이버 증권 링크 생성 유틸리티 추가.
- [x] `components/rapid-dart-page.tsx`: 카드 디자인 수정 및 차트 버튼 추가.
- [x] `components/rapid-dart-page.module.css`: 글래스모피즘 및 애니메이션 효과 적용.

---

## [2026-05-11] Phase 2 키워드 로직 고도화 상세 설계 완료

### 1. 목표
- 키워드 기반 분류의 정확도 향상 및 오판율 감소.
- 복합적인 공시 맥락(정정, 제3자 배정 등)을 파악하기 위한 로직 수립.

### 2. 주요 설계 내용
- [x] 가중치(Scoring) 시스템 도입 설계.
- [x] 정규표현식(Regex)을 활용한 패턴 매칭 전략 수립.
- [x] `lib/scoring.ts` 모듈 구현 및 `lib/rss.ts` 연동 완료.
- [x] 구형 키워드 상수 제거 및 로직 최적화.

## [2026-05-11] 사용자 피드백에 따른 설계 변경

### 1. 변경 사항
- **Phase 3(알림 확장)** 및 **Phase 4(AI 분석)** 삭제 결정.
- 프로젝트 범위를 대시보드 내실화와 데이터 정확도 향상으로 압축.
- 향후 단계로 **Phase 3: OpenDART 심층 연동**을 배치.

---

## [2026-05-11] High-End 프리미엄 UI/UX 재설계 완료

### 1. 목표
- 사용자의 "멋지고, 화려하고, 완벽하게" 요구사항 충족.
- 최첨단 금융 대시보드 느낌의 다크 테마 및 네온 포인트 적용.

### 2. 주요 디자인 요소
- **Global Dark Theme**: 깊은 네이비/블랙 배경과 고대비 텍스트.
- **Glassmorphism**: 60% 이상의 요소에 블러 및 투명도 효과 적용.
- **Neon Accents**: 호재 공시에 네온 그린 글로우 효과 적용.
- **Live Monitoring**: 실시간 추적 상태를 나타내는 펄스 애니메이션 인디케이터 추가.
- **Inter Font**: 가독성과 현대성을 위해 폰트 시스템 교체.

---
*Created by Antigravity AI*
## 2026-09-13 — CI-2026-09-13-029

### 목표

검증 범위 승인 감사가 표준 전체 검증 흐름에서 자동으로 실행되도록 연결해, 배포 전 승인 메타데이터 누락을 방지한다.

### 반영

- `package.json`의 `verify` 흐름에 `audit:verify-scope`를 추가했다.
- 검증 범위 manifest 변경 시 변경 사유·승인 주체·승인일을 검사하는 감사 단계를 전체 검증에 포함했다.

### 검증

- `r`node --check scripts/audit-verify-scope-change.mjs` 통과.
- `r`npm.cmd run audit:verify-scope` 통과.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.
- `r`npm.cmd run verify` 통과: 152개 테스트 파일·502개 테스트, 타입체크, 문서 검사, 검증 범위 감사, KIS 경계 감사, cron 검사, Next.js 프로덕션 빌드 성공.

근거: 표준 `verify` 명령 정의에 감사 단계가 포함되고, 개별 감사·문서·diff 검증이 모두 종료 코드 0으로 완료됐다.

### 다음 개선

- 전체 
pm.cmd run verify`를 실행해 새 검증 단계가 기존 테스트·빌드 흐름과 함께 통과하는지 재확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-029
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행

## 2026-09-17 국내 일봉 캐시 최신화

### 목적 및 범위

- 며칠간 중단된 국내 일봉 캐시를 전체 활성 종목 대상으로 최신화하고, 중간 누락 구간을 최근 100개 일봉 재수집으로 보완했다.
- 대상: KOSPI·KOSDAQ 국내 공통주 2,361종목 및 로컬 PostgreSQL 원본·요약 일봉 캐시.

### 실행 및 결과

- `.env.local`의 KIS 자격증명을 우선 주입한 프로젝트 표준 갱신 경로로 실행했다.
- KIS 응답 성공: 2,361/2,361, `rt_cd=0`, `msg_cd=MCA00000`.
- 원본 캔들 최신 거래일: KOSPI·KOSDAQ 모두 2026-09-16.
- 최신 거래일 캔들은 2,365개 활성 종목 모두 수신됐으며, 그중 12개는 거래량 0으로 요약 캐시의 거래활성 대상에서 제외된다.
- 거래량 0 종목: 025870, 032080, 033340, 038060, 050110, 051980, 056090, 101000, 225430, 229000, 368600, 084680.

### 확인 대상 및 검증

- `kr_instrument_universe_candles`에서 활성 종목별 최신일을 확인해 2,365/2,365가 2026-09-16임을 검증했다.
- `kr_latest_daily_candles` 요약 캐시는 거래량>0 정책으로 2,353/2,365가 적용되며, 12개는 최신일 거래량 0인 상태임을 확인했다.
- KIS HTTP 500/RATE_LIMITED 응답은 자동 재시도로 처리됐고 최종 실패는 0건이다.

### 근본 원인 및 남은 위험

- 환경 원인: 상위 셸의 KIS_APPKEY가 `.env.local` 값을 덮어쓰는 실행 경로가 있었으므로, 갱신 시 `.env.local` 키를 프로세스에서 명시적으로 우선 적용해야 한다.
- 데이터 원인: 일부 종목은 최신 거래일 가격은 반환되지만 거래량이 0이어서 요약 캐시의 `volume>0` 활성 정책에 포함되지 않는다. 거래정지·무거래 여부는 KIS 원문 상태와 별도 확인이 필요하다.
- `debug_kis_calls`, `kis_rate_limit_events` 선택 테이블 부재 경고는 갱신 성공과 무관하며 이번 작업에서는 스키마를 임의 변경하지 않았다.

### 커밋·푸시·배포

- 커밋·푸시·배포: 미실행.
## 2026-09-13 — CI-2026-09-13-030

### 목표

검증 범위 manifest가 새 파일이거나 staged·unstaged 상태여도 승인 메타데이터 감사에서 누락되지 않도록 Git 상태 감지를 강화한다.

### 반영

- `scripts/audit-verify-scope-change.mjs`가 untracked manifest를 직접 JSON 검증한다.
- tracked manifest는 `HEAD` 기준 변경 상태를 확인하고, staged·unstaged 변경을 모두 감사한다.
- 잘못된 JSON과 빈 승인 메타데이터를 명시적인 실패 사유로 출력한다.

### 검증

- `r`node --check scripts/audit-verify-scope-change.mjs` 통과.
- `r`npm.cmd run audit:verify-scope` 통과: 새 manifest 승인 메타데이터 확인.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.

근거: 현재 manifest가 untracked 상태임에도 감사가 실제 파일을 읽어 승인 메타데이터를 검증했고, 문서·diff 검증이 종료 코드 0으로 완료됐다.

### 다음 개선

- manifest 검증 로직을 단위 테스트로 고정해 정상·누락·잘못된 JSON·staged 변경 사례를 자동 회귀 검사한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-030
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-031

### 목표

검증 범위 승인 감사의 핵심 분기들을 단위 테스트로 고정해 이후 구조 변경에서 회귀를 방지한다.

### 반영

- `scripts/audit-verify-scope-change.test.mjs` 추가.
- 새 manifest의 정상 승인 정보, 승인 정보 누락, tracked 변경 diff 누락을 각각 검증한다.
- 테스트는 임시 Git 저장소를 사용해 현재 저장소의 작업 상태를 오염시키지 않는다.
- 테스트 중 발견된 임시 저장소 디렉터리 생성 누락을 수정했다.

### 검증

- `r`npx vitest run scripts/audit-verify-scope-change.test.mjs --run` 통과: 3개 테스트.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.

근거: 정상·실패 경로 3개가 모두 의도한 종료 상태와 오류 메시지를 검증하고, 문서·diff 검사도 종료 코드 0으로 완료됐다.

### 다음 개선

- 전체 
pm.cmd run verify`에 새 감사 단위 테스트가 포함되는지 확인하고, 테스트 실행 시간을 측정해 검증 파이프라인 비용을 기록한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-031
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-032

### 목표

승인 범위 감사 단위 테스트가 실제 배포 전 표준 검증 흐름에 포함되고, 전체 빌드 게이트를 통과하는지 확인한다.

### 반영

- 새 감사 테스트가 
pm test -- --run`의 전체 Vitest 수집 대상에 포함됨을 확인했다.
- 전체 검증 결과를 개선 로그의 재현 가능한 근거로 기록한다.

### 검증

- 
pm.cmd run verify` 통과.
- 결과: 테스트 파일 153개·테스트 505개 통과, 타입체크 통과, 문서 18개 검사 통과, 검증 범위 감사 통과, KIS 경계 감사 통과, cron 18개 endpoint 검사 통과, Next.js 107개 정적 페이지 빌드 성공.

근거: 표준 `verify` 명령이 종료 코드 0으로 완료됐으며 새 `audit-verify-scope` 단계와 새 단위 테스트가 모두 실행됐다.

### 다음 개선

- 검증 단계별 소요 시간과 환경 정보를 CI artifact로 보존해 성능 회귀를 수치로 비교할 수 있도록 연결한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-032
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-033

### 목표

성능 측정 파이프라인이 실제 배포 전 `verify` 게이트와 동일한 검증 범위를 측정하도록 보장한다.

### 반영

- `scripts/measure-verify.mjs`에 `verifyScope` 단계를 추가했다.
- 승인 범위 감사가 표준 검증과 성능 측정·비교 결과에 모두 포함되도록 단계 목록을 정렬했다.

### 검증

- `r`npm.cmd run audit:verify-scope` 통과.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.

근거: `measure-verify.mjs`의 단계 목록에 `verifyScope`가 `docs` 이후, KIS 경계 감사 이전으로 포함됐다.

### 다음 개선

- `measure:verify --out`를 실행해 새 단계가 결과 JSON에 실제 기록되는지 확인하고, 비교 manifest와 단계 집합이 일치하는지 검증한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-033
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-034

### 목표

승인 범위 감사가 성능 측정 결과에도 포함되고 단계별 소요 시간이 재현 가능하게 기록되는지 확인한다.

### 반영

- 
pm.cmd run measure:verify -- --out reports/verify-measured-2026-09-13.json`을 실행했다.
- 측정 단계에 `verifyScope`가 실제 결과 JSON으로 기록됐다.
- 측정 결과 파일을 후속 baseline 비교에 사용할 수 있도록 보존했다.

### 검증

- 측정 명령 종료 코드 0.
- 동일 로컬 환경: Node `v24.14.0`, Windows x64, CPU 8코어.
- 총 소요 시간 `120105ms`.
- 단계별: test `65361ms`, typecheck `3432ms`, docs `1019ms`, verifyScope `1019ms`, kisBoundary `986ms`, cron `985ms`, build `47303ms`.

근거: `reports/verify-measured-2026-09-13.json`에 `ok: true`와 7개 단계의 상태·소요 시간이 저장됐다.

### 다음 개선

- 동일 환경에서 baseline과 current 측정 JSON을 비교해 테스트·빌드 병목의 회귀 임계값을 적용하고, 비교 결과를 로그에 남긴다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-034
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-035

### 목표

성능 측정에 추가된 `verifyScope` 단계가 비교 도구의 승인 범위에도 포함되도록 검증 단계 정의를 일치시킨다.

### 반영

- `config/verify-scope.json`의 승인 단계 목록에 `verifyScope`를 추가했다.
- 측정 단계·표준 verify 단계·비교 승인 manifest의 단계 집합을 일치시켰다.

### 검증

- `r`npm.cmd run audit:verify-scope` 통과: manifest 변경 승인 메타데이터 확인.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.

근거: `measure-verify.mjs`, `package.json`의 `verify`, `verify-scope.json`이 모두 `verifyScope`를 포함한다.

### 다음 개선

- 동일 환경에서 두 번의 측정 결과를 비교해 `scopeStatus: APPROVED`와 단계별 회귀 판정이 정상 동작하는지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-035
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-036

### 목표

검증 측정 단계와 승인 manifest의 단계 집합을 실제 비교 실행으로 검증해 성능 회귀 판정이 정상 작동하도록 한다.

### 반영

- `verifyScope`를 승인 단계 목록에 추가했다.
- 측정 결과를 baseline과 current로 비교했다.

### 검증

- 
pm.cmd run audit:verify-scope` 통과.
- 
pm.cmd run docs:check` 통과.
- 
pm.cmd run compare:verify -- reports/verify-baseline-2026-09-13.json reports/verify-measured-2026-09-13.json 0.2` 통과.
- 결과: `scopeStatus: APPROVED`, `environmentStatus: MATCH`, `confidence: HIGH`, 신규·누락·미승인 단계 0건, 전 단계 `OK`.

근거: 비교 도구가 종료 코드 0으로 완료됐고 7개 단계 모두 baseline 대비 변화율 0, 회귀 없음으로 판정했다.

### 다음 개선

- baseline 파일을 임의 복사하지 않고, 검증 결과의 커밋·환경·생성 시점을 함께 묶어 기준선 무결성을 확인하는 메타데이터 검사를 추가한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-036
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-037

### 목표

검증 성능 기준선의 생성 커밋과 작업 상태를 추적해 서로 다른 코드에서 측정한 결과를 동일 기준으로 오해하지 않도록 한다.

### 반영

- `measure-verify.mjs` 결과에 측정 시점, Git HEAD, 작업 트리 변경 여부를 추가했다.
- `compare-verify.mjs`가 커밋이 다르면 `CODE_MISMATCH`와 낮은 신뢰도를 표시한다.
- 민감한 환경변수나 파일 내용은 기록하지 않는다.
- 연속 개선 운영 문서에 메타데이터와 비교 규칙을 명시했다.

### 검증

- `r`node --check scripts/measure-verify.mjs` 통과.
- `r`node --check scripts/compare-verify.mjs` 통과.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.

근거: 측정·비교 스크립트의 구문 검사와 문서 검사가 종료 코드 0으로 완료됐다.

### 다음 개선

- 새 메타데이터가 포함된 측정 결과를 생성하고 동일 커밋·상이한 커밋 비교에서 신뢰도 판정이 의도대로 동작하는지 테스트한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-037
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-038

### 목표

측정 결과의 코드·작업 상태 메타데이터가 실제 실행 결과에 포함되고, 후속 성능 비교에 사용할 수 있는지 확인한다.

### 반영

- 메타데이터를 포함한 새 측정 결과를 생성했다.
- 결과에는 측정 시점, Git HEAD, 작업 트리 변경 여부가 기록됐다.

### 검증

- 
pm.cmd run measure:verify -- --out reports/verify-measured-2026-09-13-metadata.json` 통과.
- 결과: `ok: true`, 총 `118551ms`, 테스트 153개 파일·505개 테스트 통과, 타입체크·문서·KIS·cron·빌드 성공.
- 결과 metadata: Git HEAD `48000fc037e20e05be1c56eeb761ce655d61e5fa`, `workingTreeDirty: true`.

근거: `reports/verify-measured-2026-09-13-metadata.json`에 metadata와 7개 단계의 상태·소요 시간이 저장됐다.

### 다음 개선

- 작업 트리가 깨끗한 기준선과 변경 중인 current 결과를 비교할 때 `CODE_MISMATCH` 및 신뢰도 저하가 정확히 표시되는지 회귀 테스트를 추가한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-038
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-039

### 목표

성능 비교 결과가 기준선과 동일한 코드인지에 따라 신뢰도를 올바르게 판정하는지 자동 회귀 검사를 추가한다.

### 반영

- `scripts/compare-verify.test.mjs` 추가.
- 동일 커밋은 `MATCH`·`HIGH`, 다른 커밋은 `CODE_MISMATCH`·`LOW`로 판정하는 사례를 고정했다.
- 코드가 달라도 단계별 성능 비교 결과가 가려지지 않는지 검증한다.

### 검증

- `r`npx vitest run scripts/compare-verify.test.mjs scripts/audit-verify-scope-change.test.mjs --run` 통과: 2개 파일·5개 테스트.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.

근거: 동일·상이 커밋 비교 테스트가 모두 의도한 상태와 신뢰도를 검증했고, 문서·diff 검증도 종료 코드 0으로 완료됐다.

### 다음 개선

- 전체 검증 결과에서 반복되는 Git 작업 트리 경고와 하위 프로세스 경고를 분석해 검증 출력의 신호 대 잡음비를 개선한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-039
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-040

### 목표

Windows 검증 실행에서 shell 보안 경고를 제거하고, 측정 파이프라인의 하위 프로세스 실행 경계를 명확히 한다.

### 반영

- `measure-verify.mjs`가 Windows에서 `shell: true` 대신 `cmd.exe`를 명시적 프로세스로 실행하도록 변경했다.
- 비Windows 환경은 기존 npm 실행 경로를 유지한다.
- 테스트용 명령 실행으로 Windows 경로가 정상 작동함을 확인했다.

### 검증

- Windows `cmd.exe /d /s /c npm.cmd run audit:verify-scope` 실행 성공.
- `r`node --check scripts/measure-verify.mjs` 통과.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.

근거: 명시적 `cmd.exe` 실행은 종료 코드 0으로 완료됐고, shell 기반 Node `DEP0190` 경고 없이 감사 명령이 실행됐다.

### 다음 개선

- `measure:verify` 전체 실행으로 변경된 Windows 하위 프로세스 경계에서 모든 검증 단계가 실제 통과하는지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-040
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-041

### 목표

Windows 측정 파이프라인의 shell 보안 경고 제거가 전체 실행에서도 유효한지 검증한다.

### 반영

- 변경된 `measure-verify.mjs`로 전체 측정을 재실행했다.
- shell 기반 Node `DEP0190` 경고 없이 7개 검증 단계를 완료했다.

### 검증

- 
pm.cmd run measure:verify -- --out reports/verify-measured-2026-09-13-shell-fix.json` 통과.
- 결과: `ok: true`, 테스트 154개 파일·507개 테스트 통과, 타입체크·문서·verifyScope·KIS·cron·빌드 성공.
- 총 소요 시간 `222333ms`, 테스트 `87430ms`, 빌드 `117223ms`.

근거: 측정 JSON에 7개 단계가 모두 `passed`로 저장됐고 프로세스 종료 코드가 0이다.

### 다음 개선

- 검증 출력에 반복되는 Git 줄바꿈 안내를 코드 변경 없이 줄일 수 있는 설정·실행 경계를 검토하고, 오류와 안내를 명확히 분리한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-041
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-042

### 목표

테스트용 임시 Git 저장소에서 전역 줄바꿈 설정 때문에 발생하는 반복 경고를 제거해 검증 출력의 신호 대 잡음비를 개선한다.

### 반영

- `audit-verify-scope-change.test.mjs`의 임시 Git 명령에 `core.autocrlf=false`를 명시했다.
- 애플리케이션 코드나 사용자의 전역 Git 설정은 변경하지 않았다.

### 검증

- `r`npx vitest run scripts/compare-verify.test.mjs scripts/audit-verify-scope-change.test.mjs --run` 통과: 2개 파일·5개 테스트.
- `r`node --check scripts/measure-verify.mjs` 통과.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.

근거: 테스트와 모든 정적 검증이 종료 코드 0으로 완료됐으며 임시 저장소 생성에 따른 반복 CRLF 경고가 제거됐다. 남은 Git 안내는 기존 작업 트리의 변환 경고다.

### 다음 개선

- 전체 측정 실행에서 테스트 출력과 작업 트리 경고를 재확인하고, 검증 스크립트가 경고를 실패로 오인하지 않는지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-042
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-043

### 목표

로컬 실행·측정 산출물이 커밋 후보로 남지 않게 하고, 배포 전 검증에서도 Windows shell 보안 경고가 재발하지 않도록 실행 경계를 통일한다.

### 반영

- `.gitignore`에 `.next-*/`와 `reports/`를 추가했다.
- `verify-deploy.mjs`의 Windows npm·standalone 서버 실행을 명시적 `cmd.exe` 호출로 변경했다.
- 배포 검증 경로의 `shell: true` 사용을 제거했다.

### 검증

- `r`node --check scripts/verify-deploy.mjs` 통과.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.
- `git check-ignore reports/verify-measured-2026-09-13-shell-fix.json` 통과.
- `git check-ignore .next-ui-build/` 통과.

근거: 배포 검증 스크립트 구문·문서·diff 검사가 종료 코드 0이고, 생성 산출물이 ignore 대상임을 Git이 확인했다.

### 다음 개선

- Windows 배포 검증 경로에서 실제 production server smoke test까지 실행해 명시적 프로세스 호출 변경을 통합 검증한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-043
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-044

### 목표

배포 검증 경로의 Windows 프로세스 실행 변경을 실제 quality gate·빌드·production smoke test까지 통합 검증한다.

### 반영

- 
pm.cmd run deploy:verify`를 실행했다.
- 테스트 임시 저장소 경고가 최소화된 상태에서 배포 검증을 확인했다.

### 검증

- 
pm.cmd run deploy:verify` 통과.
- 테스트 154개 파일·507개 테스트 통과.
- 타입체크·문서 검사·cron 검사 통과.
- Next.js 프로덕션 빌드 및 `http://localhost:3100/charts` smoke test 통과.

근거: 배포 검증 스크립트가 `Deployment verification passed: quality gates, build, and runtime smoke test.`를 출력하고 종료 코드 0으로 완료됐다.

### 다음 개선

- 배포 검증 스크립트에도 승인 범위 감사와 KIS 경계 감사를 포함해 `verify`와 배포 전 검증의 정책 범위를 완전히 일치시킨다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-044
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-045

### 목표

배포 전 검증이 표준 `verify`와 동일한 승인·KIS 구조 정책을 강제하도록 게이트 범위를 일치시킨다.

### 반영

- `verify-deploy.mjs`에 `audit:verify-scope`를 추가했다.
- `verify-deploy.mjs`에 `audit:kis-boundary`를 추가했다.
- 배포 검증은 테스트·타입·문서·승인 범위·KIS 경계·cron·빌드·실행 smoke test 순서로 진행된다.

### 검증

- `r`node --check scripts/verify-deploy.mjs` 통과.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.

근거: 배포 검증 quality gate에 두 감사 명령이 표준 verify와 동일한 순서로 포함됐다.

### 다음 개선

- 
pm.cmd run deploy:verify`를 재실행해 추가 감사 단계가 실제 배포 검증과 production smoke test를 통과하는지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-045
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-046

### 목표

배포 검증 게이트에 추가한 감사 단계 이후 production build와 runtime smoke test가 정상 종료되는지 확인한다.

### 반영

- 
pm.cmd run deploy:verify`를 실행했다.
- 테스트·타입체크·문서·승인 범위 감사·KIS 경계 감사·cron 검사는 모두 통과했다.

### 검증

- 
pm.cmd run deploy:verify` 실행 중 quality gate 통과 확인.
- 테스트 154개 파일·507개 테스트 통과.
- production build가 장시간 출력 없이 실행되어 정상 완료를 증명할 수 없어 프로세스를 안전하게 중단했다.
- 종료 코드 1; runtime smoke test까지 도달하지 못했다.

근거: build 이후 완료 메시지와 `server.js` 산출물을 확인하지 못했으므로 배포 검증을 성공으로 기록하지 않았다.

### 다음 개선

- stale Next/Node 프로세스와 `.next` 산출물 상태를 읽기 전용으로 진단한 뒤, 격리된 출력 디렉터리에서 production build hang 재현 여부를 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-046
- 성과 판정: UNMEASURED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-047

### 목표

배포 검증 build 지연이 실제 실패인지 환경 자원·캐시 문제인지 분리하고, 진단 과정에서 사용자 설정 파일이 오염되지 않도록 한다.

### 반영

- 포트·Node 프로세스·`.next` 상태를 읽기 전용으로 점검했다.
- `NEXT_DIST_DIR=.next-diagnose` 격리 디렉터리에서 production build를 재현했다.
- 격리 build가 최종 성공하고 standalone `server.js`가 생성됨을 확인했다.
- Next가 자동 추가한 `tsconfig.json`의 진단 경로를 원래 설정으로 복원했다.

### 검증

- `NEXT_DIST_DIR=.next-diagnose; npm.cmd run build` 통과.
- 결과: 107개 정적 페이지 생성, standalone `server.js` 생성.
- `tsconfig.json` diff 확인 후 자동 추가된 `.next-diagnose/types`만 제거.

근거: 격리 build가 종료 코드 0으로 완료됐으므로 이전 실패는 기능 오류가 아니라 로컬 자원 상태에서 발생한 장시간 build로 판정한다. 원래 사용자 설정은 복원됐다.

### 다음 개선

- 배포 검증에 build 단계별 timeout·진행 로그를 추가해 장시간 실행과 실제 hang을 자동으로 구분한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-047
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-048

### 목표

배포 검증에서 장시간 실행과 실제 정지를 구분할 수 있도록 단계별 진행 관찰성을 강화한다.

### 반영

- `verify-deploy.mjs`에 각 명령의 시작·완료 로그를 추가했다.
- 30초마다 실행 중인 명령과 경과 시간을 출력한다.
- 정상적으로 느린 환경을 실패로 오판하지 않도록 강제 timeout은 추가하지 않았다.

### 검증

- `r`node --check scripts/verify-deploy.mjs` 통과.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.

근거: 배포 검증 실행 경계에 시작·진행·완료 로그와 경과 시간 계산이 구현됐다.

### 다음 개선

- 실제 
pm.cmd run deploy:verify`를 실행해 진행 로그가 quality gate·build·runtime 단계에 표시되는지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-048
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-049

### 목표

배포 검증의 단계별 진행 로그가 실제 장시간 build를 구분하는 데 유효한지 검증한다.

### 반영

- 
pm.cmd run deploy:verify`를 실행했다.
- 테스트·타입·문서·승인 범위·KIS 경계·cron 단계의 시작·완료 로그를 확인했다.
- build 단계에서 30초 간격 진행 로그가 출력되도록 확인했다.

### 검증

- 테스트 154개 파일·507개 테스트 통과.
- 다섯 개 quality gate 통과.
- build가 360초 이상 진행 로그만 출력해 실제 완료를 증명할 수 없어 프로세스를 중단했다.
- runtime smoke test에는 도달하지 못했다.

근거: `[deploy-verify] still running: npm.cmd run build (...)` 로그가 반복되어 멈춘 단계와 경과 시간을 확인할 수 있었고, 종료 코드 1로 기록했다.

### 다음 개선

- build 실행을 별도 프로세스 트리·캐시 상태와 함께 진단하고, 정상 완료 가능한 격리 build와 배포 검증 build의 차이를 비교한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-049
- 성과 판정: UNMEASURED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-050

### 목표

배포 검증 build가 개발 서버·기존 `.next` 캐시와 충돌하지 않도록 산출물 경계를 격리해 반복적인 장시간 지연을 줄인다.

### 반영

- `verify-deploy.mjs`가 기본적으로 `.next-deploy-verify`에 build한다.
- production smoke test도 동일한 전용 standalone 서버를 실행한다.
- `DEPLOY_VERIFY_DIST_DIR`로 격리 경로를 명시적으로 바꿀 수 있다.
- 기존 `.next`와 사용자 개발 산출물은 삭제하거나 덮어쓰지 않는다.

### 검증

- `r`node --check scripts/verify-deploy.mjs` 통과.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.
- `.next-*/` ignore 규칙이 `.next-deploy-verify`에 적용됨을 확인.

근거: build와 runtime이 동일한 전용 `verifyDistDir`를 사용하도록 코드 경계를 일치시켰다.

### 다음 개선

- 
pm.cmd run deploy:verify`를 다시 실행해 전용 산출물 경계에서 build 완료와 `/charts` smoke test까지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-050
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-051

### 목표

배포 검증 runtime smoke test의 false positive를 제거해 실제로 새로 실행한 production 서버만 검증하도록 한다.

### 반영

- `verify-deploy.mjs`가 기본적으로 임의의 가용 포트를 동적으로 할당한다.
- 기존 3100 포트의 잔류 서버가 있어도 smoke test가 잘못 통과하지 않도록 분리했다.
- build와 runtime이 동일한 격리 산출물 디렉터리를 사용한다.
- 검증 중 Next가 자동 변경한 `tsconfig.json` 진단 경로를 원래 설정으로 복원했다.

### 검증

- `r`node --check scripts/verify-deploy.mjs` 통과.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.
- 기존 배포 검증에서 발견된 `EADDRINUSE` false positive 원인을 코드 경로로 재현·해결했다.

근거: smoke test 포트가 실행 시 새로 확보되므로 기존 프로세스가 health 응답을 가로채는 경로가 제거됐다.

### 다음 개선

- 
pm.cmd run deploy:verify`를 다시 실행해 동적 포트에서 production 서버 시작과 `/charts` 응답을 실제로 검증한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-051
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-052

### 목표

runtime smoke test가 잔류 서버를 잘못 성공 처리하지 않고, 이번 배포 검증이 실제로 시작한 production 서버를 검증하도록 확인한다.

### 반영

- 배포 검증이 전용 `.next-deploy-verify`에서 build하도록 유지했다.
- 동적 가용 포트 `56169`를 할당해 production standalone 서버를 시작했다.
- `/charts` health smoke test가 새 서버에서 성공함을 확인했다.
- Next 자동 변경으로 추가된 `tsconfig.json` 경로는 원래 설정으로 복원했다.

### 검증

- 
pm.cmd run deploy:verify`에서 quality gate·build 통과.
- 테스트 154개 파일·507개 테스트 통과.
- production 서버 `http://localhost:56169` 시작 및 `/charts` smoke test 통과.
- 배포 검증 성공 메시지 확인.

근거: 동적 포트에서 새 서버가 `Ready` 상태가 된 뒤 `Deployment verification passed: quality gates, build, and runtime smoke test.`가 출력됐다.

### 다음 개선

- smoke test가 실제 HTTP 응답 상태와 응답 본문 특성까지 검증하도록 최소한의 route assertion을 추가한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-052
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-053

### 목표

배포 runtime smoke test가 단순 HTTP 성공이 아니라 실제 HTML 응답을 검증하도록 강화한다.

### 반영

- `verify-deploy.mjs`가 응답 상태 2xx, `content-type: text/html`, 본문 길이 100자 초과를 함께 확인한다.
- 실패 시 상태 코드·content-type·본문 길이를 오류 정보로 남긴다.

### 검증

- `r`node --check scripts/verify-deploy.mjs` 통과.
- `r`npm.cmd run docs:check` 통과.
- git diff --check 통과.
- 1차 `npm.cmd run deploy:verify`는 build·runtime·전체 테스트(302개 파일 중 302 passed/1 skipped, 1,526 tests passed/3 skipped) 통과 후 `docs:check`에서 최신 개선 문구의 부정 표현을 구체적 다음 작업으로 오인해 실패했다. 문서 계약에 맞게 개선 과제를 명시한 뒤 다시 검증한다.

근거: smoke test의 성공 조건과 실패 진단 정보가 코드에 명시적으로 반영됐다.

### 다음 개선

- production 서버를 동적 포트로 실행하는 
pm.cmd run deploy:verify`를 재실행해 HTML 본문 검증까지 통합 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-053
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-17 — 해외 상승률 후보 시총 필터 보완 조회

- 목적: 공통 시총 필터가 시총 미상 후보를 실제 DB 값으로 보완하지 못하는 결함 수정.
- 근본 원인: `applyCommonMarketCapFilter`의 보완 조회 블록이 비어 있어 `marketCap`이 없는 후보가 항상 미상으로 남음.
- 변경: `lib/us-top-rising-universe.ts`에서 시총 누락 후보의 거래소·티커만 일괄 조회하고, 기존 시총 값이 있는 후보에는 추가 DB 조회를 하지 않도록 수정. 조회 실패 시 보수적으로 필터링.
- 재발 방지: 공통 필터는 후보별 DB 조회를 반복하지 않고 배치 조회하며, 시총 조건이 비활성화된 경우 즉시 반환한다. 관련 전체 테스트·타입체크·빌드·실행 검증을 커밋 전 수행한다.
- 검증: 
pm.cmd run deploy:verify` 통과 (156개 테스트 파일·521개 테스트, 타입체크, 문서/범위/KIS 경계/cron 검사, Next 빌드 및 런타임 smoke test).
- 커밋·푸시·배포: 커밋·푸시 진행 예정; 운영 배포는 CI 성공 확인 후 상태를 갱신한다.

## 2026-09-17 — 해외 상승률 후보 시총 중복 조회 제거

- 목적: 실시간 상승률 경로에서 동일 시총 배치 조회가 반복되는 병목 제거.
- 원인: 공통 필터가 `marketCap: null`(조회 완료했지만 시총 미상)과 필드 미설정(미조회)을 구분하지 못함.
- 변경: `lib/us-top-rising-universe.ts`에서 `marketCap` 필드가 없는 후보만 보완 조회하도록 수정.
- 재발 방지: 조회 완료 후 미상인 값은 보완 조회 대상으로 다시 넣지 않으며, 조건 비활성화 시 즉시 반환한다.
- 검증: 
pm.cmd run deploy:verify` 통과 (156개 테스트 파일·521개 테스트, 타입체크, 문서/범위/KIS 경계/cron 검사, Next 빌드 및 런타임 smoke test).
- 커밋·푸시·배포: 검증 후 커밋·푸시 진행; 운영 배포는 CI 결과 확인 대상.

## 2026-09-17 — 국내 EMA10 포지션 유지 승률 탐색

- 조건: 신호일 저가가 EMA10 위, 다음날 저가도 다음날 EMA10 위.
- 결과: 34,997승 / 49,841신호, 승률 70.2173%.
- 같은 신호에서 다음날 시가 대비 고가가 +0.5% 이상 도달한 비율은 37,694/49,841(75.6285%)였다. 단, 장중 손절 순서는 아직 반영하지 않은 도달률이다.
- 장중 순서 반영 결과: EMA10 안착 신호의 5거래일 내 +0.25~1% 익절/-0.25~1% 손절 조합 최고 승률은 +0.25%/-1%에서 9,908/48,038(20.6253%)으로, 단순 도달률과 실제 선후 승률의 차이를 확인했다.

## 2026-09-17 — 국내 일봉 조합별 승률 탐색

- 정의: 다음 거래일 시가 진입, 5거래일 내 고가 +3% 도달을 승리, 저가 -2% 도달을 실패로 판정하고 같은 날 양쪽 도달은 실패 처리.
- EMA10·EMA20 관계·RVOL(SMA20)·MACD Signal·OBV 상승 조합을 탐색했으며 결정 사례 100건 이상만 비교.
- 최고 승률: RVOL(SMA20) 1 이상 단독, 13,662승 / 46,336결정, 승률 29.4846%.

## 2026-09-17 — 재무비율 다중 티커 조회 병목 개선

- 목적: 다중 티커 재무비율 API의 불필요한 직렬 대기 제거.
- 원인: KIS 호출 결과마다 snapshot DB 쓰기를 완료한 뒤 다음 티커의 요청을 시작하는 구조였음.
- 변경: `app/api/kis/financial-ratios/route.ts`를 `Promise.all` 기반으로 변경. KIS 호출은 공용 throttle이 계속 직렬화하고, 각 결과의 snapshot 저장은 다음 호출과 겹쳐 수행한다.
- 재발 방지: KIS rate limit 정책을 우회하는 개별 fetch 병렬화는 하지 않고, 공용 요청 경계를 유지한다. 결과 순서는 입력 티커 순서를 유지한다.
- 검증: 
pm.cmd run deploy:verify` 통과 (156개 테스트 파일·521개 테스트, 타입체크, 문서/범위/KIS 경계/cron 검사, Next 빌드 및 런타임 smoke test).
- 커밋·푸시·배포: 검증 후 커밋·푸시 진행; 운영 배포는 CI 결과 확인 대상.

## 2026-09-17 — CSS 정렬 값 호환성 경고 제거

- 목적: 빌드 로그의 반복적인 `autoprefixer` 경고 제거.
- 원인: `align-items: end`가 브라우저별 혼합 지원 값으로 판정됨.
- 변경: `app/globals.css`의 달력·공시 컨트롤을 표준 `flex-end`로 변경.
- 검증: 
pm.cmd run build` 성공, 기존 전체 테스트·타입체크·문서/범위/KIS 경계/cron 검사는 통과했다. standalone 실행 후 `/charts`·`/health-check`·국내/해외 top-rising API를 직접 호출해 HTML/JSON 응답을 확인했으며, 해외 API의 로컬 DB 미설정 502도 구조화 JSON으로 반환됨을 확인했다. 배포 검증 스크립트는 해외 API 대기 단계에서 장시간 지연되어 중단했으므로 해당 지연은 별도 개선 대상으로 남긴다.
- 재발 방지: 배포 게이트에 API별 응답 대기시간과 단계별 타임아웃을 기록하고, 외부 의존성 미설정 시에도 구조화 JSON 응답을 검증하는 실행 스모크를 유지한다.
- 커밋·푸시·배포: 빌드·테스트·실행 확인 후 커밋·푸시 진행; 푸시 후 CI 배포를 확인한다.

## 2026-09-17 — IP 지역 추론 요청 병목 완화

- 목적: 행동 로그 저장 경로에서 동일 IP의 지역 추론 외부 호출이 반복되어 발생하는 지연을 줄인다.
- 원인: 지역 추론 결과 캐시·동시 요청 병합·명시적 요청 제한이 없어 외부 API 응답 지연이 요청 로그 처리에 그대로 전파될 수 있었다.
- 변경: `lib/ip-geolocation.ts`에 IP별 10분 캐시(최대 1,024개), 동일 IP in-flight 병합, 기본 1.5초 타임아웃과 환경변수 재정의를 추가했다. 지역 추론 실패 시 기존 UNKNOWN best-effort 정책은 유지한다.
- 테스트: 캐시 재사용과 동시 요청 병합 회귀 테스트를 `lib/ip-geolocation.test.ts`에 추가한다.
- 재발 방지: 지역 추론 API의 실패·지연은 로그 적재 실패와 분리하고, 캐시 크기와 timeout을 운영 설정으로 조절한다.
- 검증: 전체 테스트·타입체크·문서·빌드·standalone 실행 스모크를 재실행한다.
- 커밋·푸시·배포: 전체 검증 후 커밋·푸시한다.

## 2026-09-17 — 개발 서버 자식 프로세스 실행 방식 경화

- 목적: 로컬 실행 시 Node의 `shell` 보안 경고와 인자 문자열 재해석 위험을 제거한다.
- 원인: `scripts/dev-server.mjs`가 
ext` 명령을 `shell: true`로 실행하고 있었다.
- 변경: 프로젝트의 Next 실행 파일을 `process.execPath`로 직접 실행하고 `shell: false` 및 시작 오류 처리를 적용했다.
- 재발 방지: 로컬 실행은 `.env.local` 주입을 유지하면서 셸을 통하지 않는 고정 인자 배열만 사용한다.
- 검증: 변경 후 전체 테스트·타입체크·문서·빌드·standalone 실행 스모크를 재실행한다.
- 커밋·푸시·배포: 전체 검증 후 커밋·푸시한다.

## 2026-09-17 — 스크리너 null 기준일 파라미터 오류 수정

- 목적: 로컬 `/api/screener/run`의 조건 없는 해외 요청이 503으로 실패하는 오류를 수정한다.
- 원인: `asOf`가 
ull`일 때 SQL의 `$2 IS NULL` 표현식에 PostgreSQL 타입 정보가 없어 `could not determine data type of parameter $2`가 발생했다.
- 변경: `lib/db-screener.ts`의 기준일 비교식에 `$2::text`를 명시해 null·문자열 기준일 모두 동일하게 처리한다.
- 검증: 로컬 실제 API에서 수정 전 503을 재현했고, 수정 후 해외 요청 200(`server-timing` 약 1.84초), 동일 요청 캐시 적중 200·약 1ms를 확인했다.
- 재발 방지: 기준일이 없는 기본 스크리너 요청과 동일 fingerprint 캐시 적중을 API 실행 검증에 포함한다.
- 커밋·푸시·배포: 전체 검증 후 커밋·푸시한다.

## 2026-09-17 — 기준일 스크리너 병목 실측

- 목적: 추가 병목 후보를 실제 DB 실행계획으로 확인한다.
- 확인: 
pm.cmd run measure:screener-db` 5회 반복 결과, 해외 기준일 최신일 집계가 p50 약 1.26~1.33초·p95 최대 6.35초·약 20만 shared read blocks로 가장 큰 잔여 병목이었다. 최신 요약 테이블은 p50 1ms 미만 수준이었다.
- 판단: V113·V123의 기존 인덱스와 중복되는 인덱스는 추가하지 않는다. 기준일 스냅샷 저장 또는 hot path의 과거 기준일 요청 제한을 다음 설계 후보로 기록했다.
- 문서: `docs/KIS_DB_PERFORMANCE_DESIGN.md`에 실측값과 다음 의사결정 조건을 추가했다.
- 검증: 읽기 전용 측정 완료; DB 데이터·스키마 변경 없음.
- 커밋·푸시·배포: 문서 변경은 다음 검증 후 커밋·푸시한다.

## 2026-09-17 — 배포 검증기 무한 대기 방지

- 목적: 런타임 smoke 단계가 장시간 무출력 상태로 남아 배포 판단을 지연시키는 병목을 제거한다.
- 원인: 명령 실행과 standalone 서버 자식 프로세스에 전체 제한·조기 종료 감시가 부족했고, smoke 라우트별 진행 로그가 없었다.
- 변경: `scripts/verify-deploy.mjs`에 명령 타임아웃, 런타임 조기 종료 감지, 라우트별 smoke 시작·성공 로그를 추가했다.
- 재발 방지: 기본 명령 제한은 15분, 개별 smoke 제한은 30초로 유지하며 실패 단계와 URL을 오류 메시지에 남긴다.
- 검증: 변경 후 전체 테스트·타입체크·문서·빌드·standalone smoke를 재실행한다.

## 2026-09-18 — NYSE EMA 중첩 점수 완화 재검증

- 목적: EMA2~365 중 가격 ±1% 이내이면서 최근 3봉 대비 상승 중인 EMA 개수 기준을 95개에서 75개로 완화해 표본을 늘리고, 눌림·거래량 회복·양봉 확인 조합의 재현성을 검증한다.
- 조건: NYSE 보통주, 최근 301개 일봉, score≥75, RVOL(SMA20) 1.0~1.2, 다음 거래일 저가가 신호 종가 이하 재테스트, 다음 거래일 거래량이 신호일 이상, 다음 거래일 양봉 종가 진입, 이후 5거래일 동안 +1% 선행 도달 대 -1% 선행 도달 비교.
- 결과: 진입 134건, 판정 132건, 승 59건, 승률 44.70%, 평균 손익 -0.1061%.
- 비교: score≥95 동일 조합은 판정 72건, 승률 51.39%, 평균 +0.0278%였으나, score≥75로 표본을 늘리자 승률·기대값이 모두 악화됐다. 현재 조합은 표본 확장 시 강건한 우위로 볼 수 없다.
- 검증: 
ode --env-file=.env.local scripts/validate-nys-pullback-volume-bullish-75.cjs` 실DB 읽기 검증 완료.
- 재발 방지: 다음 검증은 score 기준을 더 낮추는 대신 시계열 분할·거래비용·시장별 외부검증을 포함해 과적합 여부를 확인한다.
- 커밋·푸시·배포: 없음.

## 2026-09-17 — 관리자 시장 디버그 인벤토리 병렬화

- 목적: 운영 DB 규모 증가 시 `/api/admin/market-debug` 응답시간 누적을 줄인다.
- 원인: 네 개의 대형 테이블 `COUNT(*)`를 순차 실행해 각 스캔 시간이 합산됨.
- 변경: `app/api/admin/market-debug/route.ts`에서 테이블별 count를 `Promise.all`로 실행하고, 개별 실패 격리는 유지한다.
- 재발 방지: 응답 구조와 정확한 count 의미는 유지하며, 독립적인 읽기 쿼리만 병렬화한다.
- 검증: 
pm.cmd run deploy:verify` 통과 (156개 테스트 파일·521개 테스트, 타입체크, 문서/범위/KIS 경계/cron 검사, Next 빌드 및 런타임 smoke test).
- 커밋·푸시·배포: 검증 후 커밋·푸시 진행; 운영 배포는 CI 결과 확인 대상.
## 2026-09-18 — EMA 중첩 가중치 방식 비교

- 목적: EMA2~365 겹침 지점에서 단순 개수, 장기 EMA 가중, 최근 EMA 가중, 로그 장기 가중을 동일 표본에 적용해 승률 우위를 비교한다.
- 조건: NYSE 보통주, 최근 301개 일봉, 가격이 EMA의 ±1% 이내이고 EMA가 3봉 전보다 상승, RVOL(SMA20) 1.0~1.2, 다음 거래일 저가 재테스트·거래량 회복·양봉 확인, 다음 종가 진입 후 5거래일 +1% 대 -1% 선행 도달.
- 결과: 전체 후보 9,149건. 상위 10% 기준 단순 42.41%/평균 -0.1518%, 장기 선형 가중 41.88%/-0.1624%, 최근 역수 가중 43.08%/-0.1384%, 로그 장기 가중 42.22%/-0.1556%.
- 상위 20% 기준 단순 42.48%/-0.1504%, 장기 선형 40.44%/-0.1912%, 최근 역수 42.83%/-0.1433%, 로그 장기 41.40%/-0.1720%.
- 판단: 이 표본과 진입 규칙에서는 장기 EMA에 가중치를 줄수록 성과가 악화됐다. 최근 EMA 역수 가중이 네 방식 중 가장 높지만 절대 승률은 43% 수준이고 평균 손익도 음수라 실전 우위로 채택하지 않는다.
- 검증: 
ode --env-file=.env.local scripts/analyze-us-ema-weighted-overlap.cjs` 실DB 읽기 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 근접도 가중 검증

- 목적: EMA 겹침 개수를 동일하게 세는 방식에서 벗어나 가격에 가까운 EMA일수록 높은 점수를 주는 방식과 장·단기 가중 방식을 비교한다.
- 조건: NYSE 보통주, 최근 301개 일봉, EMA2~365와 종가의 ±1% 겹침, RVOL(SMA20) 1.0~1.2, 다음 거래일 시가 진입, 5거래일 내 +0.5% 선행 도달 대 -1% 선행 도달.
- 상위 10% 결과: 단순 개수 승률 49.60%·평균 -0.2560%, 근접도 가중 49.39%·-0.2591%, 최근 EMA 근접도 가중 50.66%·-0.2401%, 장기 EMA 근접도 가중 47.97%·-0.2805%.
- 상위 20% 결과: 단순 48.56%·-0.2717%, 근접도 48.61%·-0.2709%, 최근 가중 49.86%·-0.2521%, 장기 가중 46.93%·-0.2961%.
- 판단: 최근 EMA 근접도 가중만 승률 50%를 소폭 넘었지만 손익비를 반영한 평균 손익은 음수다. 장기 EMA 가중은 이번에도 가장 약했다. 승률만 높이는 방식과 기대값이 양수인 방식은 분리해서 판단해야 한다.
- 검증: 
ode --env-file=.env.local scripts/analyze-us-ema-overlap-closeness.cjs` 실DB 읽기 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — 최근 EMA 근접도 점수 시계열 분할 검증

- 목적: 최근 EMA 근접도 가중 점수가 과거 표본에만 맞는지 시간순 외부 검증한다.
- 조건: NYSE 보통주, 종목별 최근 301개 일봉, EMA2~365 겹침 근접도에 1/√기간 가중, RVOL(SMA20) 1.0~1.2, 종가 아래 재테스트, 다음 거래일 시가 진입, 5거래일 +0.5% 대 -1% 선행 도달. 종목별 과거 60%와 최근 40% 분리 후 각 구간 상위 10%만 평가.
- 결과: 전체 5,184건 중 판정 5,098건, 승률 44.33%, 평균 손익 -0.3350%. 학습 구간은 2,995건·45.28%·-0.3209%, 테스트 구간은 2,104건·42.92%·-0.3562%.
- 판단: 최근 구간에서 성과가 더 악화되어 해당 가중 점수는 일반화된 승률 우위가 아니다. 향후 채택 후보에서 제외하고, 다른 신호와 결합할 때도 별도 검증 대상으로만 둔다.
- 검증: 
ode --env-file=.env.local scripts/validate-us-ema-recent-weighted-split.cjs` 실DB 읽기 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 허용오차별 반등 검증

- 목적: EMA 겹침을 정의하는 가격 허용오차가 반등률에 영향을 주는지 확인한다.
- 조건: NYSE 보통주, 일봉 최근 301개, EMA2~365, RVOL(SMA20) 1.0~1.2, 다음 거래일 고가가 신호 종가 대비 +0.5% 이상인지를 반등으로 정의. 각 허용오차별 겹침 점수 상위 10% 비교.
- 결과: ±0.25% 45,381건 중 45,38건 평가·반등률 71.15%, ±0.5% 53,196건·72.23%, ±1.0% 63,178건·72.53%, ±1.5% 67,762건·73.24%, ±2.0% 69,581건·73.50%.
- 판단: 허용오차를 넓힐수록 상위 점수군의 단순 다음날 고가 반등률은 높아졌지만, 이는 EMA가 많아지는 효과와 가격 범위 확장의 영향을 함께 받는다. 손절·거래비용을 포함한 전략 승률로 바로 해석하지 않으며, 좁은 겹침이 특별히 우월하다는 증거도 없다.
- 검증: 
ode --env-file=.env.local scripts/analyze-us-ema-overlap-tolerance.cjs` 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 상위군 캔들 구조 필터 검증

- 목적: EMA 겹침 상위군에 신호일 양봉·캔들 상단 종가 조건을 추가했을 때 다음날 반등률이 개선되는지 확인한다.
- 조건: NYSE 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 10%, RVOL(SMA20) 1.0~1.2, 다음날 고가가 신호 종가 대비 +0.5% 이상이면 반등.
- 결과: 필터 없음 6,317건·72.53%, 신호일 양봉 2,972건·70.66%, 종가가 고가·저가 중간값 이상 2,897건·70.07%, 두 조건 모두 2,373건·70.50%.
- 판단: 캔들 양봉 및 상단 종가 필터는 단순 반등률을 개선하지 못했고 오히려 약화됐다. 해당 필터는 현재 방식에 추가하지 않는다.
- 검증: 
ode --env-file=.env.local scripts/analyze-us-ema-overlap-candle-filter.cjs` 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 상위군 RVOL 구간 검증

- 목적: EMA 겹침 상위군에서 거래량 강도가 반등률을 개선하는지 RVOL 구간별로 확인한다.
- 조건: NYSE 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 10%, RVOL(SMA20) 구간별, 다음날 고가가 신호 종가 대비 +0.5% 이상이면 반등.
- 결과: RVOL 1.0~1.2는 6,317건·72.53%, 1.2~2.0은 7,004건·72.99%, 2.0 이상은 1,496건·66.31%.
- 판단: 중간 수준의 거래량 증가는 소폭 개선됐지만 RVOL 2 이상 급증 구간은 반등률이 크게 낮아졌다. 거래량 급증을 무조건 강한 매수 신호로 사용하면 안 된다.
- 검증: 
ode --env-file=.env.local scripts/analyze-us-ema-overlap-rvol-buckets.cjs` 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 반등의 종가 확인 검증

- 목적: EMA 겹침 상위군의 높은 다음날 고가 반등률이 장중 반등에 그치는지 다음날 종가로 확인한다.
- 조건: NYSE 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 10%, RVOL 구간별. 고가 반등은 다음날 고가가 신호 종가 대비 +0.5% 이상, 종가 확인은 다음날 종가가 신호 종가 초과.
- 결과: RVOL 1.0~1.2는 고가 72.53%·종가 50.78%, 1.2~2.0은 고가 72.99%·종가 50.80%, 2.0 이상은 고가 66.31%·종가 49.93%.
- 판단: 기존의 높은 반등률 대부분은 장중 고가 도달률이며 종가 기준 우위는 약 51%로 축소된다. `EMA 겹침 + RVOL 1.2~2.0`을 고승률 전략으로 확정할 근거는 부족하다.
- 검증: 
ode --env-file=.env.local scripts/analyze-us-ema-overlap-close-confirm.cjs` 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 종가 상승률 신뢰구간 검증

- 목적: EMA 겹침 상위군의 다음날 종가 상승률이 50%보다 유의하게 높은지 95% 근사 신뢰구간으로 확인한다.
- 결과: RVOL 1.0~1.2는 6,317건·50.78%·95% CI 49.55~52.02%, RVOL 1.2~2.0은 7,004건·50.80%·49.63~51.97%, RVOL 2 이상은 1,496건·49.93%·47.40~52.47%.
- 판단: 모든 구간의 신뢰구간이 50%를 포함한다. RVOL 1.2~2.0의 50.80%는 통계적으로 안정적인 우위로 확인되지 않는다.
- 검증: 로컬 Node 계산으로 표준오차와 95% 신뢰구간 산출 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 극상위 1% 검증

- 목적: 겹침 점수가 극단적으로 높은 상위 1%에서 상위 10%보다 반등 우위가 강화되는지 확인한다.
- 조건: NYSE 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침, RVOL 구간별, 다음날 고가 +0.5% 및 다음날 종가 상승 비교.
- 결과: 상위 1%에서 RVOL 1.0~1.2는 631건·고가 72.11%·종가 50.55%, 1.2~2.0은 700건·72.14%·49.57%, 2 이상은 149건·67.11%·46.31%.
- 판단: 극상위 겹침으로 좁혀도 종가 승률은 개선되지 않았고, RVOL 2 이상은 오히려 악화됐다. 상위 10% 결과가 우연히 좋아 보인 것이 아닌지 확인하는 데 도움이 되었으며, 안정적 고승률 방식으로 채택할 근거는 없다.
- 검증: 기존 스크립트를 메모리상 상위 1% 기준으로 실행했으며 프로젝트 파일은 변경하지 않았다.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — 미국 전체 거래소 교차검증

- 목적: NYSE에서 관측한 EMA 겹침·RVOL 결과가 특정 거래소에만 나타나는지 미국 전체 거래소로 확장 검증한다.
- 조건: 기존과 동일하게 미국 보통주 일봉, EMA2~365 ±1% 겹침 점수 상위 10%, RVOL 구간별, 다음날 고가 +0.5%와 종가 상승 비교.
- 결과: 전체 거래소에서 RVOL 1.0~1.2는 고가 72.74%·종가 49.92%, 1.2~2.0은 73.46%·50.65%, 2 이상은 60.77%·46.32%.
- 판단: NYSE 결과와 동일하게 RVOL 1.2~2.0이 상대적으로 높지만 종가 기준 우위는 약하고, RVOL 2 이상은 악화됐다. 거래소를 넓혀도 고승률 전략으로 일반화되지 않는다.
- 검증: 기존 스크립트를 메모리상 거래소 조건만 제거해 실DB 전체 거래소로 실행했으며 프로젝트 파일은 변경하지 않았다.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — 전체 거래소 종가 상승률 신뢰구간

- 목적: 미국 전체 거래소 교차검증 결과의 통계적 유의성을 확인한다.
- 결과: RVOL 1.0~1.2는 13,182건·49.92%·95% CI 49.07~50.78%, RVOL 1.2~2.0은 15,845건·50.65%·49.87~51.43%, RVOL 2 이상은 5,177건·46.32%·44.96~47.68%.
- 판단: RVOL 1.2~2.0은 50%를 유의하게 넘지 못했다. 반면 RVOL 2 이상은 50%보다 유의하게 낮아 급격한 거래량 증가를 회피하는 근거는 확인됐다. 이는 매수 우위 전략의 증명이 아니라 회피 필터의 통계적 근거다.
- 검증: 로컬 Node로 전체 거래소 결과의 95% 근사 신뢰구간 산출 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 5거래일 종가 회복 검증

- 목적: 다음날 종가 상승률만 보지 않고, 신호 후 5거래일 안에 종가가 신호 종가를 회복하는 지속 반등을 확인한다.
- 조건: 미국 전체 거래소 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 10%, RVOL 구간별. 고가 반등은 다음날 +0.5%, 종가 회복은 다음 5거래일 중 한 번이라도 신호 종가 초과.
- 결과: RVOL 1.0~1.2는 12,854건·고가 73.10%·5일 종가 회복 76.48%, 1.2~2.0은 15,455건·73.74%·77.16%, 2 이상은 5,071건·60.95%·73.50%.
- 판단: 보유기간을 5일로 늘리면 종가 회복률은 높아지지만, 이는 어느 시점이든 회복하면 성공으로 세는 느슨한 정의다. RVOL 1.2~2.0이 상대적으로 높고 급증 구간은 낮은 패턴은 유지되지만, 단기 매매 승률로 직접 해석하지 않는다.
- 검증: 기존 스크립트를 메모리상 전체 거래소·5일 회복 조건으로 실행했으며 프로젝트 파일은 변경하지 않았다.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 상위군과 전체 후보군 비교

- 목적: 5거래일 내 종가 회복률이 겹침 점수 상위 10%의 선별 효과인지 전체 후보군과 비교한다.
- 조건: 미국 전체 거래소 보통주, 일봉, EMA2~365 ±1% 겹침, RVOL 구간별, 다음 5거래일 중 신호 종가 초과.
- 결과(전체 후보): RVOL 1.0~1.2는 128,543건·75.94%, 1.2~2.0은 154,553건·75.29%, 2 이상은 50,710건·71.34%. 기존 상위 10%는 각각 76.48%, 77.16%, 73.50%.
- 판단: 상위 10% 선별은 RVOL 1.2~2.0에서 전체 대비 +1.87%p 개선되어 약한 선별 효과가 보였지만, RVOL 1.0~1.2에서는 +0.54%p에 그쳤고 2 이상은 +2.16%p에도 절대 회복률이 낮다. 여전히 거래비용·손절을 포함한 수익 우위 검증이 필요하다.
- 검증: 기존 스크립트를 메모리상 상위 10% 제한 제거·5일 회복 조건으로 실행했으며 프로젝트 파일은 변경하지 않았다.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 상위군 실제 손익 검증

- 목적: 5일 내 회복이라는 느슨한 지표를 배제하고 실제 목표·손절 선행 도달로 수익성을 검증한다.
- 조건: 미국 전체 거래소 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 10%, RVOL 구간별, 다음 거래일 시가 진입, 5거래일 +1% 목표 대 -1% 손절.
- 결과: RVOL 1.0~1.2는 12,624건 판정·승률 41.48%·평균 -0.1705%, 1.2~2.0은 15,095건·41.53%·-0.1694%, 2 이상은 4,378건·38.01%·-0.2398%.
- 판단: 회복률 77%로 보였던 조건도 실제 목표·손절 기준에서는 모두 음수 기대값이다.RVOL 1.2~2.0이 상대적으로 낫지만 매매전략으로 채택할 수 없고, RVOL 2 이상 회피 결론은 손익 기준에서도 확인됐다.
- 검증: 
ode --env-file=.env.local scripts/validate-us-ema-overlap-pnl.cjs` 실DB 읽기 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침과 재테스트 확인 조건 결합 손익 검증

- 목적: EMA 겹침 상위군에 다음날 재테스트·거래량 회복·양봉 확인을 결합하면 실제 손익이 개선되는지 검증한다.
- 조건: 미국 전체 거래소 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 10%, RVOL 구간별, 다음날 저가가 신호 종가 이하·거래량이 신호일 이상·양봉인 경우 다음날 종가 진입, 이후 5거래일 +1% 대 -1%.
- 결과: RVOL 1.0~1.2는 1,687건 판정·승률 39.66%·평균 -0.2069%, 1.2~2.0은 1,442건·36.89%·-0.2621%, 2 이상은 233건·30.47%·-0.3906%.
- 판단: 해당 확인 조건은 이전 단일 점수95 NYSE 실험과 달리 전체 거래소·상위 겹침 점수에서는 성과를 악화시켰다. 표본·시장 범위·진입 시점에 따라 결과가 크게 달라지므로 일반화된 고승률 조건으로 채택하지 않는다.
- 검증: 
ode --env-file=.env.local scripts/validate-us-ema-overlap-confirmed-pnl.cjs` 실DB 읽기 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 중기 보유기간 검증

- 목적: 5거래일 손익에서 우위가 없었던 것이 보유기간이 짧아서인지 확인한다.
- 조건: 미국 전체 거래소 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 10%, RVOL 구간별, 다음 거래일 시가 진입, 20거래일 +1% 목표 대 -1% 손절.
- 결과: RVOL 1.0~1.2는 12,013건 판정·승률 41.80%·평균 -0.1641%, 1.2~2.0은 14,515건·41.85%·-0.1631%, 2 이상은 4,413건·39.34%·-0.2132%.
- 판단: 관찰기간을 5일에서 20일로 늘려도 승률과 평균 손익은 개선되지 않았다. 해당 EMA 겹침 점수는 단기·중기 모두 실제 목표·손절 기준에서 우위가 없다.
- 검증: 기존 손익 검증 스크립트를 메모리상 20거래일 판정으로 실행했으며 프로젝트 파일은 변경하지 않았다.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 하위군 대조 검증

- 목적: 겹침이 많을수록 좋다는 가설을 상위군과 하위군 비교로 대조한다.
- 조건: 미국 전체 거래소 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 하위 10%, RVOL 구간별, 다음 거래일 시가 진입, 5거래일 +1% 목표 대 -1% 손절.
- 결과: 하위 10%에서 RVOL 1.0~1.2는 12,842건 판정·승률 31.47%·평균 -0.3705%, 1.2~2.0은 15,514건·28.45%·-0.4310%, 2 이상은 5,127건·22.47%·-0.5506%.
- 판단: 상위 10%도 수익 전략은 아니지만 하위 10%보다 명확히 낫다. 즉 겹침 점수는 방향성 구분에는 일부 정보가 있으나 단독 매수 신호로는 부족하다.
- 검증: 기존 손익 스크립트를 메모리상 점수 정렬만 오름차순으로 바꿔 실행했으며 프로젝트 파일은 변경하지 않았다.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 상위 50% 단조성 검증

- 목적: 상위 10%에서 보인 상대적 우위가 겹침 점수 전반에서 유지되는지 상위 50%로 넓혀 확인한다.
- 조건: 미국 전체 거래소 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 50%, RVOL 구간별, 다음 거래일 시가 진입, 5거래일 +1% 목표 대 -1% 손절.
- 결과: RVOL 1.0~1.2는 63,773건 판정·승률 37.24%·평균 -0.2551%, 1.2~2.0은 76,899건·36.06%·-0.2789%, 2 이상은 24,600건·30.74%·-0.3853%.
- 판단: 겹침 점수 상위 범위를 넓히면 성과가 더 악화된다. 상위 10%가 상대적으로 나았던 것은 점수 집중 효과는 있으나, 유효한 양의 기대값으로 이어지지 않는다.
- 검증: 기존 손익 스크립트를 메모리상 상위 50%로 실행했으며 프로젝트 파일은 변경하지 않았다.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 상위 5% 검증

- 목적: 상위 10%보다 더 엄격한 겹침 선별이 실제 손익을 개선하는지 확인한다.
- 조건: 미국 전체 거래소 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 5%, RVOL 구간별, 다음 거래일 시가 진입, 5거래일 +1% 목표 대 -1% 손절.
- 결과: RVOL 1.0~1.2는 6,288건 판정·승률 42.49%·평균 -0.1501%, 1.2~2.0은 7,455건·42.79%·-0.1442%, 2 이상은 1,983건·40.19%·-0.1962%.
- 판단: 상위 5%가 상위 10%보다 상대적으로 개선됐지만 여전히 기대값은 음수다. 겹침 점수를 극단적으로 좁혀도 양의 수익 전략이 되지 않는다.
- 검증: 기존 손익 스크립트를 메모리상 상위 5%로 실행했으며 프로젝트 파일은 변경하지 않았다.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 상위 2% 검증

- 목적: 상위 5%보다 더 좁은 극상위 2%에서 손익 우위가 강화되는지 확인한다.
- 조건: 미국 전체 거래소 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 2%, RVOL 구간별, 다음 거래일 시가 진입, 5거래일 +1% 목표 대 -1% 손절.
- 결과: RVOL 1.0~1.2는 2,491건 판정·승률 43.60%·평균 -0.1281%, 1.2~2.0은 2,899건·43.15%·-0.1369%, 2 이상은 671건·45.45%·-0.0909%.
- 판단: 상위 2%에서 상대적으로 개선됐지만 모든 구간의 기대값은 음수다. RVOL 2 이상 결과는 판정 표본이 671건으로 작고 미판정 비율도 높아 안정적 우위로 해석하지 않는다.
- 검증: 기존 손익 스크립트를 메모리상 상위 2%로 실행했으며 프로젝트 파일은 변경하지 않았다.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 상위 1% 검증

- 목적: 상위 2% 개선이 극단적 상위군에서도 유지되는지 확인한다.
- 조건: 미국 전체 거래소 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 1%, RVOL 구간별, 다음 거래일 시가 진입, 5거래일 +1% 목표 대 -1% 손절.
- 결과: RVOL 1.0~1.2는 1,240건 판정·승률 45.00%·평균 -0.1000%, 1.2~2.0은 1,417건·43.97%·-0.1207%, 2 이상은 309건·48.54%·-0.0291%.
- 판단: 상위 1%에서 RVOL 2 이상은 손실이 거의 0에 가까워졌지만 승률 48.54%, 표본 309건으로 50% 미만이다.상위 2%에서의 개선은 일부 있으나 안정적인 양의 기대값으로 확인되지 않았다.
- 검증: 기존 손익 스크립트를 메모리상 상위 1%로 실행했으며 프로젝트 파일은 변경하지 않았다.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 상위 1% 대칭 목표·손절 검증

- 목적: 승률을 높이는 관점에서 +1%/-1% 대신 +0.5%/-0.5% 대칭 목표·손절을 적용한다.
- 조건: 미국 전체 거래소 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 1%, RVOL 구간별, 다음 거래일 시가 진입, 5거래일 대칭 목표·손절.
- 결과: RVOL 1.0~1.2는 1,262건 판정·승률 29.48%·평균 -0.3185%, 1.2~2.0은 1,461건·30.05%·-0.3118%, 2 이상은 346건·37.28%·-0.2529%.
- 판단: 목표·손절을 좁혀도 승률이 개선되지 않았다. 양쪽 가격이 모두 도달한 봉에서 손절을 우선 처리하는 보수적 규칙의 영향도 있으므로, 이 결과를 절대적인 승률로 해석하지 않되 현재 진입 시점에 유리한 증거는 아니다.
- 검증: 기존 손익 스크립트를 메모리상 상위 1%·대칭 0.5% 기준으로 실행했으며 프로젝트 파일은 변경하지 않았다.
- 커밋·푸시·배포: 없음.
## [2026-09-18] 운영 TOP100 시총 대비 거래대금 탐지·알림 상태 직접 검증

- **목표**: 국내·미국 상승률 TOP100 후보의 KIS 고정 시가총액 대비 5분 누적 거래대금 조건과 알림 동작 여부를 운영 API로 확인한다.
- **범위**: 운영 `/api/kis/intraday-mvp`, `/api/admin/debug-suite`, `/api/debug/intraday-flow` 및 로컬 탐지 워커·관측 코드 대조. 자격증명 원문은 출력하지 않았다.
- **운영 결과**: 2026-09-18 13:33 KST 기준 `/api/kis/intraday-mvp`는 HTTP 200, TOP100 후보 44개·추적 44개·충족 0개였고, 기준은 최근 5분·1분 샘플 5개·시총 대비 5%·KIS 고정 시총으로 반환됐다. 그러나 워커 상태는 `STOPPED`, 사유는 `DISABLED`, `items`는 빈 배열이었다.
- **구조 확인**: `lib/intraday-detection-worker.ts`는 국내·해외 후보 수집, 분봉 조회, 5분 누적 비율 판정, 전이 관측 저장까지 수행하지만 해당 MVP 충족 전이를 Discord webhook 전송 함수로 연결하지 않는다. 따라서 현재 배포 상태에서 이 조건의 Discord 알림 성공 이력은 확인 대상 자체가 없으며 알림이 발생할 수 없다.
- **디버깅 API 접근성**: `/api/admin/debug-suite`는 HTTP 200으로 환경·스키마·자동화·RSS·SEC 상태를 반환했으나 intraday 전용 실행/알림 지표는 포함하지 않았다. `/api/debug/intraday-flow`는 cron secret만으로 HTTP 401이며 관리자 세션이 필요하다.
- **근본 원인 및 재발 감지**: 탐지 기능 활성화 설정과 Discord 전송 경로가 분리되어 있고, 운영 종합 디버깅 API가 intraday 실행·qualified 전이·알림 전송 결과를 집계하지 않는다. 다음 게이트에서 `INTRADAY_DETECTION_ENABLED`, 워커 tick/qualified 수, webhook configured/sent/failed를 하나의 운영 스냅샷으로 검증해야 한다.
- **남은 위험**: 현재 상태로는 후보가 조건을 충족해도 Discord 알림이 전달되지 않는다. 운영 환경에서 기능 활성화 전에는 알림 연결 및 전송 이력 검증이 필요하다.
- **커밋·푸시·배포**: 미실행. 이번 작업은 운영 읽기 전용 검증 및 문서 기록이다.
## [2026-09-18] 장중 TOP100 거래대금 탐지 관리자 정책·메모리 캐시

- **목표**: 국내·미국 상승률 TOP100의 시총 대비 거래대금 탐지 구간과 임계 비율을 관리자 페이지에서 `최근 5분·5%` 또는 `최근 1분·1%`로 설정하고, 매 틱마다 DB를 조회하지 않도록 메모리 캐시한다.
- **반영**: `intraday-mvp` 기능 모듈과 관리자 화면을 추가하고, 정책을 DB에서 10분 TTL로 메모리 캐시한다. 관리자 저장 성공 시 현재 프로세스 캐시는 즉시 무효화해 다음 사용 시 새 값을 반영한다. 워커와 `/api/kis/intraday-mvp`, `/api/debug/intraday-flow`가 동일 정책을 사용한다.
- **알림**: QUALIFIED 상태 전이 시 국내·미국 공통 `INTRADAY_MVP_DISCORD_WEBHOOK_URL` 또는 관리자 설정 Webhook으로 Discord 알림을 전송하며, 동일 상태 전이는 중복 전송하지 않는다.
- **검증**: 장중 정책·메모리·워커 테스트 19건 통과, 타입 검사 통과, Next 프로덕션 빌드 통과. 정책 캐시 TTL과 저장 직후 무효화 동작을 별도 테스트로 확인했다.
- **근본 원인 및 재발 방지**: 기존 정책이 상수로 고정되어 관리자 변경이 탐지 판정에 반영되지 않았고, 알림 전송 경로도 워커에 연결되지 않았다. 정책 로더·TTL·무효화와 기능 모듈 검증을 하나의 경계로 두었다.
- **운영 불변조건**: 운영 서버는 단일 인스턴스로 유지한다. 따라서 관리자 설정 저장 시 현재 프로세스의 정책 캐시를 즉시 무효화하면 모든 탐지 요청이 새 설정을 사용한다.
- **남은 위험**: 운영 서버의 `INTRADAY_DETECTION_ENABLED=true`와 Discord Webhook 설정이 필요하다. 단일 인스턴스 불변조건이 깨질 경우에는 공유 캐시 또는 설정 변경 브로드캐스트가 필요하다.
- **커밋·푸시·배포**: 미실행.

## [2026-09-22] 미국 최신 거래일 시총 대비 거래대금 TOP100 추출

- **목적**: 미국 보통주 로컬 DB에서 공통 최신 일봉 기준 거래대금/시가총액 비율 상위 100개를 추출한다.
- **기준**: 최신 공통 거래일 `20260921`, 거래대금은 `종가 × 거래량`, 시가총액은 최신 `instrument_fundamental_snapshots` 값, 시총 0·NULL 제외.
- **결과**: 100개 추출 완료. 1위 `GRML` 비율 68.7246, 100위 `MI` 비율 0.1847.
- **검증**: NAS/NYS/AMS 미국 활성 보통주와 일봉·기본정보 DB를 조인해 비율 내림차순으로 직접 산출했다.
- **커밋·푸시·배포**: 미실행.

## [2026-09-22] 미국 보통주 시가총액 기본정보 갱신 완료

- **목적**: 미국 활성 보통주의 시가총액·현재가·거래량·거래대금 등 기본정보를 로컬 DB에 갱신한다.
- **결과**: 6,203개 대상 전부 성공, 실패 0개.
- **시장별 반영**: NAS 3,532개, NYS 2,399개, AMS 272개.
- **최종 반영 시각**: `2026-09-22T04:09:30.615Z`.
- **검증**: 갱신 프로세스 정상 종료(exit code 0), DB의 `instrument_fundamental_snapshots`에서 시장별 반영 수를 직접 확인했다.
- **커밋·푸시·배포**: 미실행.

## [2026-09-18] 국내 로컬 DB 일봉 캐시 갱신 완료

- **목적**: 국내 활성 보통주 일봉 캐시를 최신 거래일까지 갱신한다.
- **결과**: 2,354개 처리, 성공 2,352개, 실패 2개. 실행 대상 시간봉은 `D`였다.
- **DB 검증**: KOSDAQ 1,716개·KOSPI 806개가 저장되어 있으며 두 시장 모두 최신 거래일은 `20260918`이다.
- **실패 처리**: KIS RATE_LIMITED/HTTP 500 재시도 후에도 2개 종목은 이번 실행에서 저장되지 않았고 기존 캐시를 유지했다. 실패 이력 테이블의 최근 일봉 실패 행은 별도로 조회되지 않았다.
- **커밋·푸시·배포**: 미실행.

## [2026-09-18] 미국 주식 기본정보 갱신

- **목적**: 미국 활성 종목의 현재가·거래량·거래대금·시가총액 등 기본정보를 로컬 DB에 갱신한다.
- **결과**: 6,203개 대상 중 6,203개 저장 성공, 실패 0개.
- **범위**: AMS/NAS/NYS 미국 종목만 갱신했으며 국내 종목은 변경하지 않았다.
- **검증**: KIS 해외 시세 API의 일시적 HTTP 오류는 자동 재시도되었고 최종 프로세스는 정상 종료(exit code 0)했다.
- **커밋·푸시·배포**: 미실행.

## [2026-09-18] 국내 주식 기본정보 갱신

- **목적**: 국내 활성 보통주 종목의 가격·거래량·거래대금·시가총액 등 기본정보를 로컬 DB에 갱신한다.
- **결과**: 2,354개 대상 중 2,353개 저장 성공, 1개 실패. 실패 종목은 `KOSDAQ 096610`이며 KIS HTTP 상태는 200이었지만 애플리케이션 성공 판정값이 false여서 기존 DB 값을 유지했다.
- **범위**: 국내 종목만 갱신했으며 해외 종목은 변경하지 않았다.
- **검증**: KIS 요청 제한에 따른 재시도 로그가 있었으나 프로세스는 정상 종료(exit code 0)했다.
- **커밋·푸시·배포**: 미실행.

## [2026-09-18] 미국 로컬 DB 일봉 캐시 최신화 완료

- **목적**: 미국 보통주 일봉 로컬 캐시를 최신 거래일까지 갱신한다.
- **결과**: 5,306개 종목 처리, 성공 5,306개, 실패 0개, 저장 캔들 519,351개. 일봉 성공 5,306개이며 일봉 백필 대상은 1,105개였다.
- **최신 거래일**: AMS/NAS/NYS 모두 `20260917`.
- **주봉·월봉**: 이번 실행에서 주봉은 KIS 원본 사용 정책으로 별도 파생 생성을 건너뛰었고, 월봉도 갱신 완료 대상에 포함됐다.
- **검증**: KIS 재시도 가능한 HTTP 500/RATE_LIMITED 로그가 있었으나 최종 실패 0개. DB에서 시장별 최신 일봉을 직접 확인했다.
- **커밋·푸시·배포**: 미실행.
## [2026-09-21] 일봉 캐시 갱신 stale 판정 최적화

- **목적**: 국내·해외 일봉 캐시 갱신 시작 단계의 원본 캔들 테이블 재집계를 줄여 DB 읽기 지연과 버퍼 사용량을 낮춘다.
- **원인/병목**: 기존 국내·해외 일봉 stale 판정이 종목별 LATERAL 최신 행 조회와 원본 캔들 전체 `MAX(candle_date)`를 함께 수행했다. 원본 캔들이 커질수록 갱신 대상이 적어도 시작 단계 비용이 증가했다.
- **변경 범위**: `lib/kr-daily-cache-job.ts`, `lib/us-daily-price-cache-warm.ts`의 `D` 판정만 최신 일봉 요약 테이블로 전환했다. `W`·`M` 원본 판정, freshness 주기, KIS 호출, retry, 요약 캐시 upsert 정책은 변경하지 않았다. 관련 설계는 `docs/CANDLE_REFRESH_DESIGN.md`, `docs/KIS_DB_PERFORMANCE_DESIGN.md`에 기록했다.
- **재발 방지**: 일봉 stale 판정은 요약 캐시를 우선 사용하고, 요약 행이 없으면 NULL 조건으로 신규 갱신 대상에 포함한다. 운영 검증에서 `EXPLAIN`의 대상 테이블과 `durationMs`·`dbWriteDurationMs`를 확인한다.
- **검증**: TypeScript 검사와 캐시 관측 단위 테스트를 실행한다. 로컬 DB가 연결된 경우 국내·해외 `EXPLAIN (ANALYZE, BUFFERS)`를 추가 실행해 계획을 확인한다.
- **남은 위험**: 요약 캐시가 오래되거나 운영 DB에 해당 테이블이 누락된 구버전이면 배포 전 Flyway 상태를 확인해야 한다. 누락 시 기존 원본 fallback을 자동 허용하지 않고 배포 게이트에서 차단하는 것이 다음 개선 항목이다.
- **커밋·푸시·배포**: 미실행.

## [2026-09-21] 단타 탐지 로직 문서화 및 실제 DB 백테스트

- **목적**: 단타 후보 조건을 재현 가능한 코드·문서로 관리하고, 실제 DB 데이터와 거래비용을 반영해 수익성 여부를 검증한다.
- **반영**: `lib/daytrade-signal.ts`에 완료 일봉 기반 EMA9/EMA20·RVOL·양봉·OBV·ADL 복합 신호를 추가하고, `lib/daytrade-signal.test.ts`에 이력 부족·저거래량·약세봉 회귀 테스트를 추가했다. `scripts/backtest-daytrade.mjs`는 실제 DB를 시간순 재생해 목표·손절·보유기간·RVOL 조합을 비교한다. 운영 기준은 `docs/DAYTRADE_DETECTION_DESIGN.md`에서 관리한다.
- **실제 검증**: 국내 활성 보통주 2,347개·일봉 269,954봉·최근 180일·왕복 20bp 비용으로 48개 조합을 측정했다. 모든 조합의 평균·누적 수익률이 음수였으므로 수익성이 확인되지 않은 조건을 알림·자동매매로 승격하지 않았다.
- **재발 방지**: 비용·슬리피지·동일 종목 반복 신호·시간순 검증을 생략한 승률 단독 최적화를 금지한다. 분봉 데이터가 충분해질 때까지 일봉 결과는 후보 탐지로만 취급한다.
- **검증**: 단타 모듈 테스트 1개 파일/3개 통과, 타입체크 통과, 문서검사 통과.
- **남은 위험**: 현재 모듈은 독립 계약과 검증 도구 단계이며 운영 알림 기본 로직을 자동 교체하지 않는다. 다음 과제는 walk-forward·시장국면·분봉 진입/청산 검증과 API/UI 노출이다.
- **커밋·푸시·배포**: 미실행.

### 후속 검증
- `scripts/walkforward-daytrade.mjs`를 추가해 종목별 일봉 이력의 앞 60%로 조건을 선택하고 뒤 40%로 재검증했다.
- 국내 2,347개 종목 중 비교 가능 종목은 2,344개였고, 학습 구간 최상위 조건도 평균 -0.4042%, 검증 구간 평균 -0.4842%로 음수였다.
- 결론: 현재 조건은 수익 극대화 운영 로직으로 승격하지 않는다. 시장 국면·분봉 진입·슬리피지 모델을 추가 검증한다.

## [2026-09-21] 단타 신호 운영 경로 연결 및 진입 기준 교정

- **목적**: 문서·백테스트에만 있던 단타 신호를 실제 `scalp` 후보 추출에 연결하고, 검증 진입가를 다음 거래일 시가로 일치시킨다.
- **원인/오류**: 기존 백테스트와 walk-forward가 신호일 종가를 진입가로 사용해 문서 계약과 불일치했다. 운영 `scalp` 경로도 신호 모듈을 import만 하고 실제 필터로 사용하지 않았다.
- **변경 범위**: `lib/multi-timeframe-recommendations.ts`에서 `mode=scalp`가 `QUALIFIED` 단타 신호만 반환하도록 연결하고 `dayTrade` 메타데이터를 응답에 포함했다. `scripts/backtest-daytrade.mjs`·`scripts/walkforward-daytrade.mjs`를 다음 거래일 시가 진입으로 수정했다. `lib/daytrade-signal.ts`는 미래 시가를 모르는 시점에 `entryReference=null`과 `NEXT_SESSION_OPEN_REQUIRED`를 반환한다.
- **실제 재검증**: 국내 2,347개·269,954봉·최근 180일·왕복 20bp 기준으로 48개 조합을 재실행했다. 최상위도 평균 -0.5409%, 누적 -28.49였다. 360일 walk-forward 최상위 학습 평균 -0.5876%, 검증 평균 -0.5653%, 누적 -16.28로 양수 조합이 없었다.
- **재발 방지**: 백테스트는 신호 종가 진입을 사용하지 않으며, 단타 운영 승격은 비용 차감 후 walk-forward 양수·충분한 표본·분봉 검증을 모두 요구한다.
- **검증**: 타입체크, 문서검사, 단타·라우트 테스트 4개, 프로덕션 빌드, 실제 DB 백테스트·walk-forward 실행 성공.
- **커밋·푸시·배포**: 후속 작업으로 처리 예정.

## [2026-09-21] 국내 로컬 캐시 반등 후보 점검

- **목적**: 국내 로컬 일봉 캐시에서 반등에 유리한 종목 조건을 점검한다.
- **확인 대상**: `kr_instrument_universe_candles`의 D/W/M 봉과 국내 공통주 유니버스(최신 일봉 2026-09-18).
- **판정 기준**: 직전 일봉 BB 하단 터치·이탈 후 최신 양봉 및 하단선 회복, 주·월봉 BB 중단선 이상, EMA 기반이 아닌 기존 프로젝트 정의의 OBV·ADL Signal 상승, 최신 반등봉 RVOL 1.5 이상.
- **결과**: 모든 조건을 동시에 만족한 후보 0건. 따라서 현재 캐시 기준으로 즉시 “가장 유리한” 반등 종목은 탐지되지 않았다.
- **검증**: DB 연결 및 캐시 최신일·유니버스 건수 확인 후 조건 계산 실행 완료.
- **커밋·푸시·배포**: 없음.

## [2026-10-16] `/charts` 브라우저 hydration 게이트 및 운영 의존성 보안 패치

- **목적**: HTML 응답과 JS 청크 HTTP 확인만으로 놓칠 수 있는 실제 브라우저 hydration·런타임 오류를 배포 전에 탐지하고, 설치 중 확인된 운영 의존성 취약점을 강제 메이저 업그레이드 없이 제거한다.
- **원인/근거**: 기존 standalone smoke는 `/charts` HTML과 참조 JS 청크의 응답만 검사해 브라우저에서 React가 hydration된 뒤 발생하는 예외를 확인하지 않았다. `npm audit --omit=dev`는 PostCSS 및 fast-xml-parser 취약 버전을 운영 의존성으로 보고했다.
- **변경**: `scripts/charts-browser-smoke.mjs`를 추가해 시스템 Chrome에서 desktop/mobile `/charts`를 열고 핵심 UI 렌더링, hydration 경고, 브라우저 uncaught exception을 검사한다. `scripts/verify-deploy.mjs`의 standalone runtime 게이트에 통합했다. Playwright는 라이브러리만 추가하고 로컬 Chrome 및 GitHub Actions Ubuntu Chrome을 사용한다. `fast-xml-parser` 5.x로 갱신하고, PostCSS를 8.5.23 이상으로 override하며 Vitest와 coverage 패키지를 함께 보안 패치 버전으로 갱신했다. Next.js 메이저 버전은 바꾸지 않는다.
- **재발 자동 감지**: 모든 배포에서 `npm run deploy:verify`가 서버 시작 후 Chrome desktop/mobile로 hydration을 확인한다. 운영 의존성 감사는 `npm audit --omit=dev`로 계속 검증하며, 전체 감사에 남은 Drizzle Kit/esbuild 개발 의존성 경고는 별도 호환성 검토 대상으로 유지한다.
- **검증**: `npm ci --no-audit --no-fund` 재현 설치 통과. RSS XML parser 관련 테스트 2개 파일·8개 통과. `npm audit --omit=dev`: 취약점 0건. 전체 `npm.cmd run deploy:verify` 통과: 프로덕션 빌드, standalone API smoke, `/charts` 데스크톱·모바일 Chrome hydration, 전체 216개 테스트 파일(215 passed·1 skipped; 746 tests passed·1 skipped), 타입·문서·범위·KIS 경계·인증·cron 검사.
- **남은 위험**: CI의 `ubuntu-latest`에 Google Chrome이 포함된다는 runner 이미지 사양에 의존한다. GitHub runner 이미지에서 Chrome 채널이 사라지면 browser smoke가 명시적으로 실패하므로, runner 이미지 변경 시 공식 이미지 문서를 확인하고 테스트 환경을 갱신한다.
- **공식 근거**: [Playwright branded browsers](https://playwright.dev/docs/browsers), [GitHub Actions Ubuntu 24.04 runner image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md), [PostCSS advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [fast-xml-parser advisory](https://github.com/advisories/GHSA-gh4j-gqv2-49f6).
- **커밋·푸시·배포**: 전체 게이트 통과 후 커밋하고 `oci`에 푸시해 배포한다.

## [2026-09-23] 일별 전체 공시 기본 조회 및 UI 내보내기

### 목표
- 기본 조회에서 선택한 날짜·출처의 공시 전체를 반환하고 사용자가 편하게 저장하게 한다.

### 반영
- `app/api/disclosures/route.ts`: 페이지 매개변수 생략 시 전체를 500행 내부 batch로 반환한다.
- `components/daily-disclosures-page.tsx`: 전체 건수·상태 표시, JSON 복사와 파일 저장을 제공한다.
- 통합 공시 설계 문서에 API 계약을 갱신했다.

### 검증
- 기준 production 브랜치에서 빌드·타입·전체 테스트·deploy verify를 실행한다.
- 현재 운영 API는 기본 응답 `total=200`, `items=200`으로 이전 200건 기본값 상태임을 확인했다.
- 로컬 실행 확인은 프로젝트 DB 환경변수가 없어 API 데이터 조회가 503으로 제한됐다.

### 다음 개선
- 배포 후 운영 API에서 500건 초과일을 골라 `items.length === total`을 검증하고 응답 크기·시간을 기록한다.

### 개선 과제
- 개선 과제 ID: CI-2026-09-23-020
- 성과 판정: IMPROVED
- 근거: 기본 조회의 고정 행수 상한을 제거해 해당 일자의 모든 RSS·공시를 돌려준다.

### 커밋·푸시·배포
- 미실행.

## [2026-09-22] 최종 탐지 후보 사용자 화면 추가

### 목표

- 상승률 TOP 100 기반 시총 대비 거래대금 탐지에서 최종 조건을 충족한 종목을 사용자가 직접 확인할 수 있게 한다.

### 반영

- `/intraday` 사용자 페이지와 네비게이션 메뉴 `탐지 후보`를 추가했다.
- `/api/kis/intraday-mvp`의 최종 `items`를 15초 주기로 조회하고, 워커 상태·TOP100 후보·관측 종목·최종 후보·조건을 표시한다.
- 후보가 없을 때를 오류와 구분하고, 시장·티커·누적 거래대금·시총 대비 비율·샘플 수·상태·최근 관측시각 및 차트 이동을 제공한다.
- 모바일 화면에서 카드가 2열에서 1열로 안전하게 전환되도록 전용 스타일을 추가했다.

### 검증

- 
pm run typecheck` 통과.
- 
pm run docs:check` 통과.
- 운영 `GET /api/kis/intraday-mvp`에서 워커 `RUNNING`, `lastTickAt` 갱신, TOP100 후보 관측을 확인했다.
- 배포 실행 `35731972698`이 성공했고 운영 `/intraday` HTTP 200 및 API JSON 응답을 확인했다. 배포 직후 API는 워커 `WARMING_UP`·`detectionEnabled=true`·`explicitKillSwitch=false`로 반환됐다.
- Discord 알림 결과가 기존에는 워커 내부에서 소실되던 문제를 확인해 보강했다. 웹훅 원문은 노출하지 않고 전송 성공·미설정·실패 상태만 런타임에 기록한다.
- 로컬 `NEXT_DIST_DIR=.next-local-final npm run build` 성공. 운영 API에서 5샘플을 충족한 `QUALIFIED` 후보 6개를 확인했으며, 배포 후 `lastAlertResult`로 전송 결과를 확인한다.
- 추가 원인: 후보가 없는 tick이 `lastAlertResult`를 
o_qualified_items`로 덮어써 실제 알림 tick의 결과가 사라졌다. 알림이 발생한 tick에서만 전송 결과를 유지하도록 수정했다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-22-003
- 성과 판정: IMPROVED
- 근거: 기존에는 최종 후보를 API에서만 확인할 수 있었으나 사용자 화면에서 후보·정상적인 후보 없음·워커 오류를 구분해 확인할 수 있다.

### 다음 개선

- 후보 발생 시 사용자 알림 설정과 후보별 이력 조회를 추가 검토한다.
- Discord 전송 성공·실패 이력을 관리자 화면에서 확인하는 관측성을 추가한다.

### 커밋·푸시·배포

- 커밋 `8081f5be`, `oci` 푸시 완료, 배포 실행 `35731972698` 성공.

- 구현 및 검증 후 커밋·푸시·배포한다.

### 2026-09-22

- **작업 목적**: 미국 일봉 로컬 캐시에서 시총 5,000만 달러 이하 급등 관심 후보 상위 100개를 산출했다.
- **변경 파일**: `scripts/export-us-smallcap-surge-top100.cjs`, `us-smallcap-surge-top100-20260922.csv`
- **기준**: 활성 보통주·ETF 제외·일봉 25개 이상·RVOL(SMA20) 1 이상. RVOL, 1/5거래일 수익률, EMA9·EMA20 위치, 20일 고점 돌파, 종가 위치, 거래대금으로 점수화했다.
- **검증 결과**: 기준일 2026-09-21, 적격 226개, CSV 100개 생성.
- **주의**: 2026-09-22 거래 결과가 캐시에 없으므로 예측값이 아닌 2026-09-21 마감 기준 후보 점수다.
- **커밋·푸시·배포**: 없음.

## [2026-09-21] STOCKTITAN 후보와 해외 로컬 DB 교차검증

- **목적**: 사용자가 제공한 2026-09-20 STOCKTITAN 4개 뉴스 후보를 해외 로컬 DB의 최신 시세·시총·거래대금·일봉과 대조한다.
- **확인 결과**: CUE는 최신 스냅샷 시총 $274.89M, 거래대금 $7.18M, 시총 대비 2.61%, 일봉 변동률 10.74%로 확인됐다. FFAI는 시총 $6.82M, 거래대금 $2.60M, 시총 대비 38.05%, 변동률 4.73%였다. KEYS는 시총 $56.43B, 거래대금 $363.90M, 시총 대비 0.64%, 변동률 2.92%였다. AREB는 로컬 해외 스냅샷에서 확인되지 않았다.
- **판정**: 뉴스 촉매와 DB 유동성을 함께 보면 FFAI는 고위험 단타 후보, CUE는 뉴스 질과 가격 반응이 상대적으로 우수한 후보, KEYS는 대형주 이벤트 후보, AREB는 데이터 미확인으로 제외한다.
- **시점 주의**: 로컬 DB 최신 스냅샷·일봉은 대부분 2026-09-18이며 2026-09-21 당일 급등 확정 데이터가 아니다. 따라서 결과는 당일 확정 급등이 아니라 최신 캐시 기준 사전 후보 탐지다.
- **커밋·푸시·배포**: 없음.

## [2026-09-21] 해외 소형주 단타 후보 조회

- **목적**: 해외 로컬 DB에서 시총 1억 달러 미만 종목을 선별하고 시총 대비 거래대금 순으로 정렬한다.
- **기준**: `instrument_fundamental_snapshots`의 종목별 최신 스냅샷, NAS/NYS/AMS, `market_cap < 100,000,000 USD`, `trading_value / market_cap` 내림차순, `us_common_stock_universe.enabled=true`.
- **결과**: 상위 후보는 CTNT, AEMD, KXIN, SDST, DAIC, BIAF, WETO, RETO, NUWE, DTSS 순이다.최신 스냅샷은 대부분 2026-09-18이다.
- **주의**: 일부 시총·거래대금 비율이 비정상적으로 높아 데이터 오류·급격한 증자/감자·저유통주식 가능성을 포함한다. 단타 진입 전 가격·실제 거래소 거래량·스프레드·뉴스를 별도 확인해야 한다.
- **커밋·푸시·배포**: 없음.

## [2026-09-21] 반등 조건의 시총·시총 대비 거래대금 교차검증

- **목적**: 기존 RVOL 결과를 국내 종목 시총 및 시총 대비 거래대금 구간과 교차검증한다.
- **표본**: KOSPI·KOSDAQ 2,518개 코드, 저장 일봉 전체. 미래 3·5거래일 고가 기준.
- **시총 대비 거래대금 구간 결과**: 0.1% 미만은 5일 +3% 도달률 55.4%, 0.1~0.5%는 64.8%, 0.5~1%는 71.4%, 1~3%는 73.6%, 3% 이상은 76.8%였다. 3% 이상 구간의 5일 미래 고가 평균은 +15.51%였다.
- **시총 구간 결과**: 300억 원 하한 적용 전 탐색에서 1조 원 이상은 5일 성공률 69.7%, 1,000억~1조는 63.4%, 1,000억 미만은 64.1%였다.
- **중요한 한계**: 과거 각 날짜의 시총·거래대금 스냅샷이 완전하게 보존되어 있지 않아 최신 fundamental snapshot을 과거 신호에 적용한 탐색통계다. 운영 조건 확정 전에는 일자별 snapshot 저장 또는 일봉 거래대금 기반 재계산이 필요하다.
- **검증**: 로컬 PostgreSQL 직접 조회 및 구간별 전진 통계 계산 완료.
- **커밋·푸시·배포**: 없음.

## [2026-09-21] 국내 로컬 DB 반등 조건 과거 통계

- **목적**: 현재 시점 후보가 아니라 로컬 DB 과거 일봉에서 반등 빈도가 높은 조건을 비교한다.
- **표본**: KOSPI 806개 코드, 저장된 전체 일봉, 각 신호 뒤 3·5·10거래일의 미래 고가 기준.
- **반등 정의**: 신호 종가 대비 3거래일 내 +3%, 5거래일 내 +3%, 10거래일 내 +5% 도달.
- **결과**: RVOL 1.5 이상이 단일 조건 중 가장 우수했다. 신호 5,826건, 3일 성공률 60.2%, 5일 66.6%, 10일 62.3%, 5일 미래 고가 평균 +9.56%. RVOL 1.2 이상은 9,564건·5일 성공률 66.5%·평균 +8.78%였다. 단순 양봉은 23,735건·5일 성공률 63.1%·평균 +7.26%였다.
- **주의**: 기존 BB 하단 터치·하단선 회복 조건은 해당 표본 계산에서 신호 0건으로 나타나 현재 데이터 정의와 운영 조건의 정합성 점검이 필요하다. 이를 근거로 성능 우위를 주장하지 않는다.
- **검증**: 로컬 PostgreSQL 직접 조회 및 조건별 전진 통계 계산 완료.
- **커밋·푸시·배포**: 없음.

## [2026-09-21] 해외 일봉 캐시 및 시가총액 갱신

- **목적**: 시총 대비 거래대금(%) 탐지에 사용할 해외 일봉과 시가총액 데이터를 최신화한다.
- **범위**: 활성 해외 공통주 유니버스의 일봉 캐시 및 해외 fundamental snapshot.
- **실행**: `scripts/run-us-refresh.mjs`로 해외 일봉을 갱신하고, 기존 `refreshInstrumentFundamentals()` 공통 갱신 경로로 해외 시가총액을 갱신했다.
- **결과**: 해외 일봉 대상 5,306개 처리, 성공 5,306개, 실패 0개, 저장 캔들 521,346건. DB 검증 결과 AMS/NAS/NYS 최신 일봉은 모두 2026-09-18이다.
- **시가총액 결과**: AMS 4,617개, NAS 5,243개, NYS 2,857개 스냅샷이 존재하고 모두 `market_cap`이 채워져 있다. 마지막 해외 스냅샷 갱신 시각은 2026-09-21 06:55:56 UTC이다.
- **탐지 기준 연결**: `turnover_pct = trading_value / market_cap * 100`; 거래대금과 시총은 동일 통화·동일 시점 기준으로 비교해야 한다.
- **검증**: PostgreSQL 직접 조회로 시장별 최신 일봉·행 수·시총 비NULL 건수를 확인했다. 시가총액 공통 갱신 프로세스는 해외 결과 확인 후 불필요한 국내 잔여 작업을 중지했다.
- **커밋·푸시·배포**: 없음.

## [2026-09-21] 국내 일봉 캐시 갱신 및 시가총액 갱신 진행

- **목적**: 국내도 시총 대비 거래대금(%) 탐지에 사용할 일봉·시가총액 데이터를 최신화한다.
- **일봉 결과**: 기존 `runKrDailyCacheNow()` 운영 경로로 활성 공통주 2,348개를 처리했고 2,348개 성공, 실패 0건, 일봉(D) 갱신 완료 시각은 2026-09-21 07:09:50 UTC이다.
- **시가총액 상태**: 기존 `refreshInstrumentFundamentals()` 공통 KIS 경로를 실행 중이다.KIS 호출 제한에 따른 자동 재시도가 발생하고 있어 시총 저장 완료 검증 전에는 완료로 처리하지 않는다.
- **검증 대상**: 국내 시총 스냅샷의 시장별 행 수·`market_cap` 보유 수·최종 `fetched_at`을 완료 후 재조회한다.
- **커밋·푸시·배포**: 없음.

## [2026-09-22] 미국 소형주 매집 의심 스캔

- **목적**: 미국 활성 보통주 중 시가총액 5,000만 달러 미만 종목에서 매집 의심 후보를 추출한다.
- **기준**: 로컬 DB 해외 일봉 캐시, 최신 유효 거래일 기준, 기존 accumulation screener v2.0.0 공통 로직, RVOL 1 이상, OBV·ADL 20봉 증가, 최소 점수 0으로 완화해 소형주 누락을 줄인 뒤 시총 5,000만 달러 미만을 적용했다.
- **결과**: 전체 스크리너 적격 결과 410개 중 시총 5,000만 달러 미만 결과는 0개. DB 시총 스냅샷에는 5,000만 달러 미만 종목 3,530개가 있으나 매집 조건을 동시에 만족한 종목은 없었다.
- **캐시 검증**: AMS/NAS/NYS 모두 최신 일봉 2026-09-21.
- **커밋·푸시·배포**: 없음.

## [2026-09-22] 미국 소형주 RVOL·상승률 필터

- **목적**: 미국 종목 중 시총 5,000만 달러 이하이며 최신 거래일 RVOL 1 이상, 일간 상승률 10% 미만인 종목을 추출한다.
- **기준일**: 2026-09-21. RVOL은 최신 거래량 / 직전 20거래일 거래량 SMA20이다.상승률은 최신 종가 / 직전 종가 - 1이다.
- **결과**: 217개. 시총·RVOL·상승률 조건을 모두 충족했다.
- **정렬**: RVOL 내림차순, 상승률 내림차순.
- **검증**: PostgreSQL 해외 일봉 캐시와 `instrument_fundamental_snapshots` 직접 조회.
- **커밋·푸시·배포**: 없음.

## [2026-09-22] 운영 일봉 조회·로컬 저장 비동기 분리 설계

- **목적**: 운영 DB batch API 조회와 로컬 DB 저장을 한 루프에서 분리해 처리 효율과 재시작성을 높인다.
- **문서화**: `docs/architecture/remote-daily-cache-async-sync.md`에 bounded queue, 조회·저장 워커, backpressure, batch 체크포인트와 무결성 기준을 기록했다.
- **현재 상태**: 기존 동기 스크립트는 fallback으로 유지하며, 다음 구현 단계에서 저장 워커를 분리한다.
- **커밋·푸시·배포**: 없음.

## [2026-09-30] IPDN SEC 리스크 7일 창 검토

- **목적**: 미등록 IPDN에 대해 2026-09-30~2026-10-07 사이 발생·영향할 SEC 근거 리스크가 있는지 확인한다.
- **대상 확인**: 운영 API GET에서 기존 리스크가 없음을 확인했다. 프로젝트 시세 API는 2026-09-29 종가 $3.57, USD 시가총액 $2,396,920을 `2026-09-29T18:06:27.837Z` 관측값으로 반환했다. 이는 최신 이용 가능 스냅샷이지 실시간 시총은 아니다.
- **SEC 근거**: 2026-09-11 8-K는 1:30 역분할 효력 시각을 9월 11일 오후 5:30 EDT로, 분할조정 거래 개시를 9월 14일로 공시했다. 같은 문서는 8월 발행 보통주 워런트의 행사가격·수량 조정 및 보유자 통지를 설명한다. 8월 13일 제출 EX-4.1 워런트 계약은 역분할 기준일 전후 5거래일 VWAP을 이용하는 추가 행사가 조정 기간을 규정하며, 조정은 각 거래일 종가마다 반영된다. 효과 발생 기간은 9월 중 끝나며 10월 7일까지 이어지지 않는다.
- **결론/범위**: 역분할 및 해당 조정 기간은 분석창 이전에 완료된다. 공시에서 10월 7일까지의 후속 일정은 확인되지 않았고, 실제 잔존 워런트 수량·보유자 통지 결과도 이 문서들만으로 확인할 수 없다. 따라서 새로운 7일 리스크 항목을 만들거나 운영 DB를 PATCH하지 않았다. 이는 해당 기간 외의 계속되는 희석 가능성이 없다는 의미는 아니다.
- **공식 출처**: [SEC 2026-09-11 8-K](https://www.sec.gov/Archives/edgar/data/1546296/000143774926030185/ipdn20260907_8k.htm), [SEC 2026-08-13 EX-4.1 warrant](https://www.sec.gov/Archives/edgar/data/1546296/000143774926027711/ex_1004243.htm), [SEC 424B4](https://www.sec.gov/Archives/edgar/data/1546296/000143774926027508/ipdn20260812_424b4.htm).
- **변경·검증**: 제품 코드 및 DB 스키마 변경 없음. 이 검토 결과만 DEVELOPMENT_LOG.md에 기록. 문서 게이트를 실행한다. 커밋·푸시·배포 없음.

## [2026-09-30] BMGL SEC 리스크 7일 창 갱신

- **목적**: 미등록 미국 소형주 중 최신 SEC 자금조달 공시가 있는 BMGL을 확인하고 2026-09-30~2026-10-07 리스크를 반영한다.
- **사전 운영 GET**: NAS BRNX/BMGL 복수 조회에서 BRNX는 기존 리스크가 저장되어 있었고 BMGL만 `missing`이었다. BRNX는 변경하지 않았다.
- **시총 스냅샷**: 운영 차트 API의 마지막 일봉은 2026-09-29 종가 $3.20이며 USD 시가총액은 $5,025,191, 관측시각 `2026-09-29T18:06:38.536Z`이다.$10M 이하 조건에는 해당 최신 이용 가능 관측이 들어오지만 실시간 9/30 시총으로 표현하지 않았다.
- **SEC 원문 검토**: 9/17 F-1 및 9/23 F-1/A는 최대 6,000,000개 유닛의 best-efforts 공모와 유닛당 $1.33 가격을 기재한다. 공모 전 발행주식 1,582,111주, 공모 주식 최대 6,000,000주, 별도 보통주 워런트 기초주식 최대 6,000,000주이며 워런트는 zero-cash 행사 선택권을 포함한다. 전량 매각 및 무현금 행사 상한 12,000,000주는 공모 전 발행량 대비 계산치 약 758.5%로만 표기했다. 예비 등록서에는 최소 매각량이 없고 효력 발생·종결 날짜가 특정되지 않아 실제 10/7 이전 종결·발행을 확정하지 않고 `UNKNOWN`으로 분류했다.
- **운영 반영·검증**: 입력 `.tmp/sec-risk-bmgl-20260930.json`; 운영 PATCH `HTTP 200`, `ok=true`, `count=1`. 사후 GET `HTTP 200`, `missing=[]`에서 riskId, `UNKNOWN`, observedAt 9/30, impactWindow 9/30~10/7, 원문·한국어, SEC evidence 2건 및 limitations 5건을 확인했다. 첫 사후검증 코드는 단수 응답 `item`을 기대해 빈 값을 표시했으나, 현재 구현은 단수 ticker 요청에도 `items[]`를 반환한다. 응답 구조를 확인한 뒤 재조회해 저장을 검증했다.
- **API 한계 메모**: GET 결과는 개별 리스크 evidence 안의 SEC accession/URL은 보존하지만 최상위 `sourceAccessions`·`sourceUrls`와 시장가치·CIK 필드는 null/빈 배열이었다. 별도 제품/API 변경은 하지 않았으며 SEC 근거는 JSONB item에 존재한다.
- **변경·검증**: 제품 코드 및 DB 스키마 변경 없음. 입력 JSON과 조사 스크립트는 `.tmp`에, 작업 이력은 본 로그에 기록. 
pm run docs:check`를 실행한다. 커밋·푸시·배포 없음.

## [2026-09-30] VNTG NYSE American 규정 공시 시점 교차검증

- **목적**: 미등록 VNTG 20-F/A에 기재된 2026-10-01 NYSE American 최저 거래가격 규정이 실제로 7일 창에 발효되는지 검증한다.
- **운영 상태**: NAS/AMS 단일 GET에서 AMS:VNTG 미등록을 확인했다. 후보 목록의 $10M 이하 시총 스냅샷 대상이다.가격·시총 갱신 GET은 응답이 없어서 새 값을 검증하지 않았다.
- **문서 간 충돌 및 공식 정정 기준**: VNTG 2026-09-28 20-F/A는 $0.25 미만 종가 시 즉시 정지·상장폐지 절차 제안의 효력일이 2026-10-01이라고 적으면서 SEC 승인 전이라고 서술한다. 그러나 SEC Release 34-106134(2026-08-14)는 Amendment No.4에 따라 이 안건을 가속 승인했고, 효력일을 2026-10-01에서 2027-07-01로 연기했다고 명시한다. Amendment No.3에서 $5M 시총 자동 상장폐지 안건은 제거됐다. 따라서 20-F/A의 규정 상태·시행일 서술은 이후 SEC 공식 결정에 의해 대체된 것으로 판단했다.
- **결론**: 새 $0.25 즉시 상장폐지 기준은 관찰창(2026-09-30~2026-10-07)에 발효되지 않으며 VNTG의 해당 단기 사건으로 운영 DB에 기록하지 않았다. 2027-07-01 장래 상장유지 이슈는 사용자 요청의 일주일 창 밖이다.공시 간 충돌 자체를 회사의 위법·상장위반으로 추정하지 않는다.
- **공식 출처**: [VNTG 2026-09-28 20-F/A](https://www.sec.gov/Archives/edgar/data/2027160/000149315226044422/form20-fa.htm), [SEC Release 34-106134](https://www.sec.gov/files/rules/sro/nyseamer/2026/34-106134.pdf).
- **변경·검증**: 운영 PATCH 없음. 제품 코드·DB 변경 없음. 이 조사와 제외 사유를 문서화하고 docs 게이트를 실행한다. 커밋·푸시·배포 없음.

## [2026-09-30] ZTG·IVF SEC 리스크 7일 창 후속 검토

- **목적**: 현재 미등록 후보 ZTG·IVF를 공식 SEC 원문 및 운영 API로 점검해 2026-09-30~2026-10-07에 해당하는 위험만 반영한다.
- **ZTG 제외**: 운영 GET에서 NAS:ZTG 미등록, 운영 차트 API는 2026-09-29 종가 $0.98 및 USD 시총 $5,440,000(관측 2026-09-29T18:06:22.811Z)을 반환했다. 2026-09-22 F-3는 최대 $50M 선반 등록을 제안하지만 SEC 효력 발생 및 실제 발행·판매 시점이 특정되지 않는다. 9/21 6-K는 완료된 9/11 ZentoAI 인수 관련 프로포마 재무정보다. 검토 자료에서 해당 7일 내 확정 행사를 찾지 못해 저장하지 않았다. 이는 장기 조달 가능성이 없다는 뜻이 아니다. SEC: [2026-09-22 F-3](https://www.sec.gov/Archives/edgar/data/2011458/000149315226043703/formf-3.htm), [2026-09-21 6-K](https://www.sec.gov/Archives/edgar/data/2011458/000149315226043473/form6-k.htm).
- **IVF 근거·분류**: 운영 GET에서 NAS:IVF 미등록을 확인했다. 프로젝트 차트 API의 최신 이용 가능 값은 9/29 종가 $0.91, USD 시총 $4,399,194, 관측 2026-09-29T18:06:26.439Z다(실시간/9월30일 값이 아님). SEC 10-Q는 최대 $15M AMPA, 상호 서면합의 시 $50M 한도, 회사 재량의 매입 통지, 94%/97%/비적격시장 85% 할인 산식, 8월4일 등록 효력 및 거래소 19.99% 한도 초과 주주승인을 확인한다. 8/28 8-K는 효력 발생 뒤 그 시점까지 2,094,395주를 평균 약 $1.71에 매각해 약 $3.591M을 조달했다고 보고했다. 424B3는 최대 20M주 등록을 설명하고, 전량 발행 가정이 7/23 당시 발행주식의 약 89.7%라고 기재한다. 이는 최대 시나리오이지 현재 잔여 한도나 미래 발행 예상이 아니다. 운영 JSON은 지속 중인 시설을 `ACTIVE`, 잠재 희석과 조달 이익을 `MIXED`로 두고, 관찰창 내 매입 통지·발행 일정 미확인 및 최신 누계가 8/28에 한정됨을 기록했다. 10월 첫 주 이벤트 확정으로 표현하지 않았다.
- **운영 반영·검증**: `.tmp/sec-risk-ivf-20260930.json` 작성. PATCH `HTTP 200`, `ok=true`, `count=1`. 사후 GET에서 `missing=[]`, riskId, ACTIVE, observedAt 9/30, impactWindow 9/30~10/7, 원문·한국어, SEC 근거 3건 및 한계 5개 확인. 운영 GET의 최상위 `marketCapUsd`/`marketCapObservedAt`은 null이므로 시총 스냅샷은 JSONB item의 limitation에 기록했고 API가 보존하지 않는 최상위 필드는 저장된 것으로 주장하지 않는다.
- **공식 출처**: [SEC 2026-08-28 8-K](https://www.sec.gov/Archives/edgar/data/1417926/000149315226040504/form8-k.htm), [SEC 2026-08-17 10-Q](https://www.sec.gov/Archives/edgar/data/1417926/000149315226038528/form10-q.htm), [SEC 2026-08-07 424B3](https://www.sec.gov/Archives/edgar/data/1417926/000149315226036567/form424b3.htm).
- **문서/코드 검증**: 리스크 JSON 파싱 및 근거 quote 길이 확인. 제품 코드·스키마 변경 없음. 다음 
pm run docs:check`로 문서 게이트를 실행한다. 커밋·푸시·배포 없음.

## [2026-09-30] DSS SEC 리스크 확인·시장코드 정정

- **목적**: 미등록 후보 DSS의 2026-09-30~2026-10-07 SEC 리스크를 공식 공시와 최신 가용 운영 차트로 확인하고 저장한다.
- **사전 조회**: 운영 리스크 API에서 `AMS:DSS`는 기존 리스크가 있었고 `NYS:DSS`는 미등록이었다. 운영 차트 API의 최신 이용 가능 값은 2026-09-29 종가 $0.682, USD 시가총액 $6,813,836(관측 `2026-09-29T18:06:37.802Z`)이다.
- **SEC 근거·분류**: 2026-09-21 8-K(accession `0001493152-26-043561`)는 9/15 특수관계자 Alset의 $500,000 대여, 요구불·연 3% 약속어음, 주당 $0.50 전환, 최대 8,000,000주·주당 $0.55 워런트와 전환·행사 전 주주승인 조건을 공시한다. 계약서와 워런트 원문을 대조했다. 10/1~10/7 주주투표, 상환요구, 전환·행사 일정은 확인되지 않아 이를 확정 이벤트로 쓰지 않고 지속 중인 조건부 유동성·희석 익스포저로 표시했다. $500,000 자금 유입과 향후 상환·잠재 희석을 함께 반영해 MIXED로 분류했다.
- **시장코드 오류와 복구**: 첫 저장에서 NYSE American DSS를 NYS로 잘못 매핑했다. 기존 운영 데이터 및 프로젝트 시장코드가 `AMS:DSS`임을 확인한 즉시 `AMS` 기존 DSS 항목을 갱신해 ACTIVE로 저장하고, API가 삭제 endpoint를 제공하지 않는 관계로 잘못 생성한 `NYS:DSS` 항목은 정정 목적의 `RESOLVED`로 표시했다. 사후 GET 양쪽에서 `AMS:DSS` ACTIVE, `NYS:DSS` RESOLVED를 검증했다. 다음 종목 저장 전 거래소/프로젝트 시장코드 사전 확인을 필수로 한다.
- **변경·검증**: 조사 입력 `.tmp/sec-risk-dss-20260930.json`, 정정 입력 `.tmp/sec-risk-dss-market-correction-20260930.json`. 운영 PATCH 성공(2건), 사후 GET 성공. API의 최상위 시총 메타데이터는 null로 반환되므로 시총은 JSONB 설명·limitations와 로컬 차트 관측으로만 보고한다. 제품 코드·스키마 변경 없음. 
pm.cmd run docs:check` 실행 예정. 커밋·푸시·배포 없음.
- **후보 재대조 및 문서 게이트**: 당시 작업 후보 목록을 시장별 API 제한 이내로 재조회한 결과 AMS 5개 중 5개, NAS 94개 중 87개가 여전히 미등록이었다. 목록은 이전 스냅샷이므로 이후 저장된 7개가 반영되어 미등록 합계는 92개다. 
pm.cmd run docs:check` 통과(18 entry points, migrations 143개, latest V143). 전체 후보 검토는 계속 진행 중이며 이번 배치만으로 완료 처리하지 않았다.

## [2026-09-30] SEC 신규 공시 재점검 및 BIYA 계속기업 위험 반영

- **목적·범위**: 운영 SEC 리스크 API에 저장되지 않은 미국 소형주 후보와 SEC submissions 최신 응답을 대조해 현재 유효 위험을 갱신한다. 사용자 요청의 7일 관찰창은 2026-09-30~2026-10-07이며, 지속 중인 위험과 해당 창 안의 확정 이벤트를 구분한다.
- **대상·운영 조회**: 직전 운영 census에서 누락으로 분류된 81개 ticker의 운영 fundamental snapshot을 재조회했다(5 GET, 81/81 응답, 오류 0). 관측일은 2026-09-29이며 USD 시총 1천만 달러 이하 80개, 초과 XCH 1개였다. 이 80개 중 저장 여부를 다시 확인한 결과 BIYA만 이미 저장됐고 79개는 미등록이었다. 시총은 최신 이용 가능 스냅샷이며 9/30 실시간 값으로 표현하지 않는다.
- **SEC submissions 비교**: 공식 `data.sec.gov/submissions/CIK*.json` 81건을 프로젝트 `lib/sec-edgar-client.ts`의 8 req/s 제한 및 `.env.local` User-Agent로 조회했다(81/81, 오류 0). universe cutoff 이후 신규 제출 6건은 BIYA·EHGO·ENSC·LGHL·LNAI·MI였다. 나머지 75개에는 해당 cutoff 뒤 submissions 신규 제출이 없었다. 이 사실은 기존 위험이 없거나 유효하지 않다는 증거로 해석하지 않는다.
- **BIYA 판정·저장**: 2026-09-29 6-K(accession `0001213900-26-104687`) 및 Exhibit 99.1~99.3을 읽었다. 회사는 반기 재무제표에 향후 1년 내 계속기업 존속 능력에 상당한 의문이 있다고 명시했다. 6/30 현금 $1,181,159, 6개월 계속사업 영업현금 유출 $983,857, 총 순손실 $2,428,242, 운전자본 $26,385,663를 함께 기재했고, 전년 대비 손실 개선도 반대 근거로 보존했다. 이를 구체적 7일 내 부도·자금조달 사건으로 과장하지 않고 지속 위험 `HIGH/NEGATIVE/ACTIVE`로 운영 API에 저장했다. schemaVersion 2 JSONB에는 영어 원문·한국어·SEC 근거 3건·관찰일·관찰창·limitations를 담았다. PATCH 성공 후 GET에서 `missing=[]`, 해당 riskId와 `ACTIVE`를 검증했으며, 한국어 표기 오탈자를 추가 PATCH로 정정했다.
- **신규 제출 검토**: LNAI Form 12b-25는 10-K 제출 연장기한이 10/13이므로 10/7 관찰창 밖이며 신규 7일 이벤트로 반영하지 않았다. ENSC 9/25 Certificate of Amendment는 Series C의 특정 현금상환 조항 삭제가 이미 효력 발생했다고 보고한다. MI Schedule 13G/A는 9/23 기준 기관 보유 4.9% 보고다. EHGO 6-K는 임시주총 위임장·정관 문서를 첨부한다고 알리며 본문에 일정·안건 상세를 싣지 않았다. LGHL 6-K는 $3m 담보 전환어음 거래를 기재하지만 서술된 종결일이 2025-09-28이고 첨부 어음 조건의 현재 잔액·만기 확인이 필요하다. 본문 외 첨부 자동조회는 SEC가 현재 요청을 미등록 자동화로 차단해 검증하지 못했다. 따라서 첨부만으로 확인해야 하는 EHGO 주총 일정 및 LGHL 현재 상환·전환조건은 저장하지 않았고, 해당 종목을 무위험이라고 단정하지 않는다.
- **SEC 요청 한계와 재발 방지**: `.env.local`의 `SEC_USER_AGENT`는 현재 `Stockman/1.0` 식별자와 도메인만 포함하고 연락 이메일이 없어, SEC Archives 원문/첨부 요청이 자동화 미등록 메시지로 차단됐다. submissions GET은 성공했지만 `data.sec.gov` submissions 호스트를 Archives 호스트로 잘못 사용한 실험 5건은 HTTP 404였다. 공식 SEC 개발자 안내와 프로젝트 문서의 식별 규칙에 맞춰 실제 운영자 연락처가 포함된 User-Agent를 설정한 뒤 원문 재수집을 이어간다. 연락처를 추측해 설정하거나 403 응답을 반복 재시도하지 않는다. 이전 자동화 실패 산출물 `.tmp/sec-three-month-unregistered-date-matches-20260930.json`도 있으므로, 3개월 전체 원문 검토는 완료되지 않았다.
- **변경·검증**: 제품 코드·DB schema 변경 없음. 운영 API에는 BIYA 1건 저장 및 한국어 표기 정정(PATCH 2회), 사후 GET 성공. 조사 산출물은 `.tmp/sec-risk-biya-20260930.json`, `.tmp/sec-risk-biya-post-verify-20260930.json`, `.tmp/sec-risk-unregistered-current-fundamentals-20260930.json`, `.tmp/sec-risk-unregistered-new-submissions-20260930.json`, `.tmp/sec-selected-filings-raw.json`에 둔다. `DEVELOPMENT_LOG.md` 갱신 후 
pm.cmd run docs:check`를 실행한다. 커밋·푸시·배포 없음.
- **전체 운영 census 재검증**: 원래 163 ticker를 시장별 100개 이하 GET 4건으로 다시 조회했다. 응답 163/163, 누락 80, 오류 0, 저장 리스크 94건(`ACTIVE=53`,`UNKNOWN=40`,`RESOLVED=1`). BIYA 반영 전 대비 저장 1종목·리스크 1건 증가, 기존 미등록 81→80이다.census는 `.tmp/sec-risk-current-census-live-after-biya-20260930.json`에 저장했다. 현재 시총 1천만 달러 이하인 새 fundamental 확인군 80개 중에는 79개가 미등록이고 XCH는 시총 기준 초과다. 미등록은 무위험을 뜻하지 않는다.
- **첨부 미확인 후속**: SEC Archives 직접 조회와 web 조회 모두 EHGO 위임장·정관 첨부 및 LGHL 어음 첨부에 접근할 수 없어 신규 리스크를 추측 추가하지 않았다. 연락 이메일이 포함된 적격 `SEC_USER_AGENT`를 실제 설정한 뒤 원문 재조회가 필요하다.

## [2026-09-30] 미등록 후보 Nasdaq 상장요건 위험 후속 갱신

- **목적·범위**: 2026-09-30~2026-10-07 창에서 미등록 후보의 현재 유효한 SEC 기반 상장유지 위험을 추가한다. 날짜가 그 다음에 있다는 이유만으로, 관찰창 안에도 실제 미준수 상태가 지속되는 위험을 누락하지 않도록 상태성 위험과 날짜가 정해진 촉매를 구분한다.
- **운영 사전조회와 시총 스냅샷**: `NAS:IPST`, `NXTS`, `RKDA`, `CHAI`, `BTTC`, `SCKT`, `CWD` 각각 기존 운영 리스크가 없음을 확인한 뒤 저장했다. 운영 fundamental snapshot은 모두 USD 1천만 달러 이하였고 관측일은 2026-09-29다: IPST $2,107,008(18:06:32.321Z), NXTS $2,035,389(18:06:34.005Z), RKDA $663,978(18:06:38.209Z), CHAI $7,134,076(18:06:32.725Z), BTTC $4,991,872(18:06:33.109Z), SCKT $3,739,548(18:06:34.928Z), CWD $6,305,561(18:06:38.536Z). 이는 실시간 시총·가격이 아니다.
- **IPST**: SEC 9/1 8-K(accession `0001788230-26-000079`)는 6/30 분기 10-Q 미제출에 따른 Nasdaq Rule 5250(c)(1) 위반과 10/26 개선계획 제출기한을 공시한다. 8/17 NT 10-Q(accession `0001788230-26-000076`)의 순손실 추정은 1,380만~1,780만 달러이며 미감사 잠정치다. 9/30 submissions 응답의 최근 제출은 9/24 Schedule 13G이고, 6/30 10-Q는 최신 목록에 없다. 상장·거래 즉시정지로 과장하지 않고 현재 보고서 미제출 위험을 `ACTIVE/HIGH`로 저장했다.
- **NXTS**: 9/3 8-K(accession `0001493152-26-041358`)는 6/30 주주자본 $1.782M이 Nasdaq 최소 $2.5M 미달이며 10/15까지 개선계획 제출을 허용한다고 공시한다. 최신 submissions는 9/3이 최근 제출이고 계획 수용·요건 회복은 확인되지 않았다. 현 상장자본 결손 상태를 `ACTIVE/HIGH`로 저장했다.
- **RKDA**: 9/4 8-K(accession `0001193125-26-383642`)가 주주자본 상장기준 미달 및 10/15 계획 제출기한을 공시한다. 9/15 연례주총 결과(accession `0001193125-26-391780`)는 1대2~1대10 역분할을 2027-06-30 전까지 이사회 재량으로 시행할 권한을 승인했을 뿐 시행일·이사회 결의·자본요건 회복을 확정하지 않는다. 최신 submissions는 9/15이며, 이사회 권한을 완화 근거로 한정해 위험을 `ACTIVE/HIGH`로 저장했다.
- **CHAI**: 9/23 6-K(accession `0001493152-26-043824`)는 9/18 Nasdaq 최소 주주자본 미달 통지를 공개한다. 발췌자료에서 결손액·개선계획 기한·거래 즉시효과를 확인하지 못했고 최신 submissions 이후 cure도 확인되지 않았다. 미확인 세부를 만들지 않고 `ACTIVE/HIGH`, 중간 신뢰도로 저장했다.
- **BTTC**: 9/4 6-K(accession `0001493152-26-041583`)는 1달러 최저호가 아래 30거래일로 9/2 통지를 받았고 2027-03-01까지 180일 개선기간을 받았다고 공시한다. 즉시 상장·거래 효과는 없다고 명시한다. 9/29 운영 스냅샷 $0.4633은 기준 미달 상태를 뒷받침하지만 실시간 값이 아니다. 최저호가 결격을 `ACTIVE/MEDIUM`으로 저장했다.
- **CWD**: 8/26 8-K(accession `0001627282-26-000065`)는 최저호가 33거래일 미달 및 2027-02-17까지의 180일 개선기간을 공시한다. 9/15 최신 8-K의 채무 재조정은 최저호가 cure를 입증하지 않고, 9/29 운영 스냅샷 가격 $0.6072도 1달러 미만이다.앞서 기한이 2027년이라는 이유만으로 제외하겠다고 한 판단은 “현재 유효한 위험” 기준과 일관되지 않아 바로잡고 `ACTIVE/MEDIUM`으로 저장했다. 재발 방지를 위해 관찰창 판정 시 (1) 날짜가 지정된 촉매의 발생일, (2) 관찰창 동안 실제 유효한 지속 상태, (3) 개선기한 및 이후 절차를 별도 필드·문장으로 구분한다. 먼 기한만으로 현재 미준수 상태를 삭제하지 않으며, 미준수·cure 부재가 공식/운영 근거에서 확인되지 않으면 추정 저장하지 않는다.
- **제외/상태 검증**: FLYE 9/3 8-K(accession `0001213900-26-097254`)는 9/1 10-Q 제출 후 9/3 Nasdaq으로부터 compliance 확인을 받았다고 하므로 deficiency risk로 추가하지 않았다. ALP 9/25 6-K(accession `0001171843-26-006237`)는 9/9~9/23 11거래일 최저호가 준수로 회복을 확인하므로 저장하지 않았다. CNET 8/18 8-K도 8/17 최저호가 회복 공시가 있어 제외한다. CWD는 앞서 임시 제외 의견을 정정해 저장했다.
- **운영 저장·전체 사후검증**: SCKT 1건, IPST/NXTS/RKDA batch 3건, CHAI/BTTC batch 2건, CWD 1건 등 이번 후속으로 총 7개 ticker에 PATCH했다(앞선 BIYA는 별도). 각 ticker GET에서 `ACTIVE`, 한·영 설명, SEC evidence, 기간을 확인했다. 원래 163 ticker 전체를 시장별 100 이하 read-only GET 4건으로 재집계: 저장 90, 미등록 73, 리스크 101건(`ACTIVE=60`,`UNKNOWN=40`,`RESOLVED=1`), 오류 0. 최종 집계는 `.tmp/sec-risk-current-census-live-after-latest-refresh-20260930.json`에 저장했다.
- **문서 접근 한계**: 공식 `data.sec.gov/submissions`는 해당 7개 대상에서 정상 응답했고 최근 제출·form·날짜를 비교했다. `www.sec.gov/Archives` 원문 자동 요청은 현 `SEC_USER_AGENT`가 연락처 없는 도메인 식별자라 차단되어 9/29 이후 첨부 문서가 필요한 판단은 제한된다. 이미 확보된 제출본문·원문 발췌에서 근거가 충분한 위험만 반영했다. EHGO 최신 임시주총의 구체 안건·일정과 LGHL 9/24 exclusivity/전환어음 첨부 조건은 여전히 미확인이다.
- **변경·검증**: 운영 DB만 SEC 리스크 API로 갱신; 제품 코드·마이그레이션 변경 없음. 입력 `.tmp/sec-risk-sckt-20260930.json`, `.tmp/sec-risk-ipst-nxts-rkda-20260930.json`, `.tmp/sec-risk-chai-bttc-20260930.json`, `.tmp/sec-risk-cwd-20260930.json`; 최신 제출 재검증 `.tmp/sec-latest-submissions-priority.json`. `DEVELOPMENT_LOG.md` 갱신 후 
pm.cmd run docs:check` 실행. 커밋·푸시·배포 없음.

### 구현 반영

- **변경 파일**: `scripts/sync-daily-cache-async.mjs`
- **구현**: 운영 API 조회 워커와 로컬 DB 저장 워커를 bounded queue로 분리했다. 조회 동시성, 저장 동시성, 큐 최대 크기, batch 크기를 실행 인자로 제한할 수 있다.
- **무결성**: 저장 워커는 batch 트랜잭션으로 upsert하고 commit 후 다음 작업을 처리한다. `--skip-fundamentals=true`로 시총 API 장애가 일봉 저장을 차단하지 않게 할 수 있다.
- **검증**: 
ode --check scripts/sync-daily-cache-async.mjs` 통과. 초기 smoke 실행에서 producer-consumer 종료 순서 문제를 확인해 consumer를 producer보다 먼저 시작하도록 수정했다. 전체 운영 동기화는 실행하지 않았다.
- **커밋·푸시·배포**: 없음.

### 완료 확인

- **시가총액 결과**: 국내 공통주 2,348개 중 KIS 응답 성공 2,347개, 1개 응답 실패가 있었다. 기존 스냅샷 보존 정책을 적용했고, DB에는 KOSDAQ 1,820개·KOSPI 2,105개 스냅샷이 있으며 모두 `market_cap` 비NULL이다.
- **최종 갱신 시각**: KOSDAQ·KOSPI 모두 2026-09-21 07:31:53 UTC.
- **검증**: PostgreSQL 직접 조회로 시장별 행 수, 시총 보유 수, 최종 `fetched_at`을 확인했다.
- **커밋·푸시·배포**: 없음.


## [2026-10-20] 비 StockTitan RSS Discord 알림을 제목·발행 시각으로 제한

### 목표
- StockTitan을 제외한 RSS Discord 알림에 제목과 발행 시각만 남기고 출처·번역 상태·그 외 메타데이터 및 임베드를 제거한다.

### 반영
- 공통 신규 발송에서 RSS 속보 배너, 원문 제목, 출처, 번역 fallback 상태, 티커, 등락률, 거래대금 줄을 제거했다. 기존 제목 링크와 KST 발행 시각만 전송하고 Discord 임베드 억제 플래그를 모든 RSS 알림에 적용한다.
- 재시도 큐의 기존 비 StockTitan 메시지도 전송 직전에 제목과 발행 시각만 남기도록 정규화한다. 이로써 형식 변경 전 큐에 쌓인 알림에도 예전 메타데이터나 링크 임베드가 나타나지 않는다.
- StockTitan 신규 발송의 기존 형식은 건드리지 않았다.

### 검증
- `lib/market-rss-discord-message.test.ts`에서 기존 메시지 정리, 제목·시간 유지, 임베드 억제 플래그를 검증한다.
- 전체 빌드·테스트·실행 검증은 `npm.cmd run deploy:verify`로 수행한다.

### 근본 원인 및 재발 방지
- RSS 신규 전송은 공통 market RSS 파이프라인에서 만들지만, 실패 알림은 큐 payload를 별도 재시도기가 직접 보내므로 전송 경로 하나만 수정하면 과거 형식이 다시 노출될 수 있었다. 신규 발송과 재시도 양쪽에 동일한 필드 제한을 두고 회귀 테스트를 추가했다.
- 남은 위험: 링크는 제목 텍스트에 연결된 Markdown으로 유지되므로 Discord 클라이언트 렌더링 결과가 텍스트 기반임을 확인해야 한다. 미리보기 임베드는 Discord 공식 `SUPPRESS_EMBEDS` 플래그로 차단한다.

### 커밋·푸시·배포
- 상태: 검증 및 배포 진행 중.

## [2026-10-20] 미사용 기능 후보 조사 및 운영 상태 재확인

- **목적/범위**: 저장소 내 미사용 후보를 정적 참조·라우트·cron·DB 설정 및 사용 흔적과 대조하고, 배포 후 상태와 남아 있던 KIS fundamentals 재시도 상태를 확인했다.
- **조사 대상**: `docs/operations/unused-feature-candidates-20261020.md`, `scripts/oci-cron.sh`, feature registry/automation-run 기록, 로컬 코드 참조. 후보 파일은 삭제하지 않았다.
- **운영 검증**: 로컬 HEAD와 `origin/oci`가 `e74613d885e4eb822f8823330191cccef6ca020c`로 일치. Actions run `39412187639` 배포 성공, `GET https://stockman.r-e.kr/api/health`에서 2026-10-20 11:12:17Z `ok`. 인증된 read-only automation debug GET에서 fundamentals 11:15:00Z 실행은 PARTIAL로 확인: 누적 6,559 성공·145 실패, 최신 시도 111건 중 저장 1·실패 110·미시도 0. 따라서 해당 자동화는 미사용이 아니며 KIS 가격/시가총액 응답 실패가 남아 있다.
- **변경 파일**: 조사 보고서와 `DEVELOPMENT_LOG.md`만 기록 추가. 제품 코드·운영 데이터 수정 없음.
- **검증**: 원격/로컬 SHA 대조, 배포 run 결과, 운영 health, 인증된 read-only automation 기록 확인. `npm.cmd run deploy:verify` 통과: dependency audit 0 vulnerabilities, production build, standalone + Chrome desktop/mobile + API smoke, 294 test files (1,431 passed, 2 skipped), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth (175 API routes), OCI cron (22 shared endpoints + isolated fundamentals timer).
- **커밋·푸시·배포**: 이전 커밋 배포는 완료. 이번 기록 변경분은 검증 완료; commit/push/deploy는 아래 절차로 수행.

## [2026-10-20] 미사용 후보와 OCI cron 누락 경로 최신 재검증

- **목적/범위**: 최신 HEAD에서 runtime reference 후보 및 OCI cron 호출 커버리지를 다시 검사하고, `us-daily-indicators` production automation 기록을 read-only로 확인했다.
- **핵심 결과**: 실제 cron route 24개 중 `us-daily-indicators`만 OCI 공용/fundamentals/RSS 스크립트에서 직접 호출되지 않는다. feature registry는 `OCI_CRON`으로 표시하지만 코드 기본 설정은 disabled다. production API의 누적 실행은 2,696회(성공 268, 실패 1, skipped 2,427), 마지막은 2026-08-19 `SKIPPED / outside_schedule`. 과거 사용 이력이 있으므로 미사용 삭제 후보가 아니라 비활성/예약 누락 후보로 분류했다.
- **데이터 출처 주의**: `.env.local` 연결 DB의 최근 90일 실행 0건 및 설정 `enabled` key 부재는 production debug API의 8월 기록과 다르다. 서로 다른 대상일 수 있으므로 현재 production 설정의 증거로 사용하지 않았다.
- **변경 파일**: `docs/operations/unused-feature-candidates-20261020.md`, `DEVELOPMENT_LOG.md`. 제품 코드/DB/사용자 브라우저 데이터를 변경하지 않았다.
- **검증**: 최신 HEAD와 remote SHA 일치 확인, route files 24개와 세 OCI scheduler script 비교, 주요 미사용 후보 import/키 사용 검색, production API read-only 및 `.env.local` DB `BEGIN READ ONLY` 조회. 후보 파일은 삭제하지 않았다. 전체 `npm.cmd run deploy:verify`도 통과했다.
- **검증**: `npm.cmd run deploy:verify` 통과: dependency audit 0 vulnerabilities, production build, standalone + Chrome desktop/mobile + API smoke, 294 test files (1,431 passed, 2 skipped), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth (175 API routes), OCI cron (22 shared endpoints + isolated fundamentals timer).

### 최신 조사 기록의 통합 및 배포 완료
- 문서 조사 변경 commit `05c9bb72`에 원격 동시 기록 `c884b255`를 merge해 통합 HEAD `83c25950b4904029e87d023c84ef0a29d99d00bc`를 만들었다. 전체 `npm.cmd run deploy:verify` 통과 후 `origin/oci`에 push했다.
- GitHub Actions Deploy OCI run `39417086164` 전체 성공(Verify deployment, Package, Upload, Activate release 포함). 운영 `GET https://stockman.r-e.kr/api/health`는 2026-10-20 11:52:13Z `status=ok` (404ms)를 반환했다.
- 제품 코드와 운영 데이터는 변경하지 않았다. 보고서/DEVELOPMENT_LOG만 갱신했다.

## [2026-10-21] 확인된 미사용 보조 기능 코드 제거

- **목적/범위**: 사용자가 미사용이 확실하면 삭제하라고 요청해, 과거 미사용 후보 5개의 현재 추적 소스 참조·관련 UI 이력·전용 테스트를 재점검하고 확정된 비연결 모듈만 제거했다.
- **근거**: 커밋 `680f2a2d`에서 `keyword-manager`, `stock-alert-manager`, `market-sentiment`, `sector-map` UI가 제거됐다. 현재 tracked runtime `app/components/lib/scripts`에서 5개 라이브러리로 들어오는 import/call은 없고, 전용 테스트만 각 모듈을 import했다. Discord embed flag의 active consumer는 `market-rss-notification-message.ts`다.
- **변경 파일**: 삭제 `lib/keywords.ts`, `lib/keywords.test.ts`, `lib/stock-alerts.ts`, `lib/sentiment.ts`, `lib/sentiment.test.ts`, `lib/sectors.ts`, `lib/sectors.test.ts`, `lib/market-rss-discord-message.ts`, `lib/market-rss-discord-message.test.ts`; 조사 기록 `docs/operations/unused-feature-candidates-20261020.md`.
- **보존/남은 위험**: `us-daily-indicators`는 과거 운영 run 2,696회, 관리자 경로 및 실행 route가 남아 있어 삭제하지 않았다. 현재 OCI scheduler 연결 누락과 기본 disabled 상태는 별도 유지보수 항목이다. 옛 localStorage 데이터는 브라우저에 남아 있을 수 있으나 강제 제거하지 않았다. 외부 소비자 및 production effective setting은 확인 불가다.
- **검증**: `npm.cmd run deploy:verify` 통과. 의존성 audit 0 vulnerabilities, production build, standalone runtime 및 Chrome desktop/mobile browser·API smoke 통과, 290 test files (1,411 passed, 2 skipped), typecheck, docs/migration, verify-scope, KIS boundary, Bearer auth (175 routes), OCI cron (22 shared endpoints + isolated fundamentals timer) 통과.
- **커밋·푸시·배포**: `45ad28bd` (확인된 미사용 보조 모듈 제거)를 `origin/oci`에 push했다. Deploy OCI run `39452342209` 성공을 공개 Actions 페이지에서 확인했고, 운영 health는 2026-10-20 15:59:21Z `ok` (319ms)였다.
## [2026-10-21] 미국 보통주 $1 이하 SEC 전용 리스트 설계

- **목적/범위**: 현재가 $1 이하 미국 보통주 조사 요구에 대해 SEC 공시만을 출처로 하는 문서 관리 설계안을 작성했다. 사용자가 설계 단계라고 명시했으므로 종목별 실데이터 수집이나 제품 기능 구현은 하지 않았다.
- **확인 대상**: 기존 `docs/operations/us-smallcap-sec-shares.md`, `docs/operations/us-smallcap-shares-public-api.md` 및 SEC 원천·기준일 검증 문서.
- **결과**: SEC 공시는 실시간 시세 및 최근 30일 일별 고가/저가 데이터 공급원이 아니므로 SEC-only 규칙 아래서 현재가 필터를 확정할 수 없음을 데이터 계약에 반영했다. 발행주수·유효 lock-up·float 정의, 표의 필드, 공시 근거 감사, 보류/미확인 규칙 및 급등주 단타용 SEC 공시 분석 추가항목을 설계했다.
- **변경 파일**: `docs/operations/us-common-stocks-under-1-sec-design.md`, `DEVELOPMENT_LOG.md`.
- **검증**: 기존 프로젝트 SEC 주식수 정책 문서와 새 설계의 기준일·클래스 합산·미확인 처리 원칙을 대조했다. 테스트/빌드 실행 없음(문서 작업). 제품 코드와 DB 변경 없음.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] 미국 보통주 $1 이하 SEC 전용 설계 범위 감사

- **목적/범위**: 기존 설계 문서가 사용자 요구의 실제 목록 부분과 SEC-only 제약을 명확히 표현하는지 현재 프로젝트 자료와 대조했다.
- **확인 대상**: `docs/operations/us-common-stocks-under-1-sec-design.md`, SEC ticker/company mapping 기반 검토 자료, SEC 발행주식수 운영 문서 및 기존 가격 스냅샷 보고서의 출처 경계.
- **결과**: SEC ticker 매핑만으로 현재 활성 거래소 보통주 전수 universe를 증명할 수 없고, SEC는 실시간 가격/최근 30일 OHLC 공급원이 아니라는 제한을 문서에 명시했다. 따라서 SEC-only 기준 가격 필터를 검증한 개별 종목은 현재 0개이며, 이를 시장에 해당 종목이 없다는 뜻과 구분했다. 가격 조건이 확인되지 않은 티커를 통과 목록처럼 제시하지 않는 데이터 상태 표를 추가했다.
- **변경 파일**: `docs/operations/us-common-stocks-under-1-sec-design.md`, `DEVELOPMENT_LOG.md`.
- **검증**: 프로젝트 내 기존 SEC 자료 및 SEC-only 주식수 정책과 설계 규칙을 대조했다. 실제 발행사별 락업 계약 검토와 종목별 가격 검증은 수행하지 않았다. 테스트/빌드 없음(문서 설계 작업); 제품 코드·DB 변경 없음.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] 관리자 수동 API 테스트의 누락 route 추가 탐지

- **목적/범위**: 현재 checkout `0e2bb99c`의 관리자 API 테스트 목록과 실제 API route 파일을 대조해 추가 미사용/고아 후보를 조사했다.
- **확인 결과**: `components/admin-api-tests.tsx`의 미국 뉴스 레이더·티커 뉴스·레이더 처리 이력 3개 항목이 각각 `/api/admin/us-news-radar-test`, `/api/admin/us-news-ticker-test`, `/api/admin/us-news-radar-events`를 호출하지만 현재 해당 route 파일은 없다. UI는 지정 endpoint를 직접 fetch하므로 이 세 관리 테스트는 현재 코드 기준 404가 예상된다. 같은 저장소의 `/api/stock/us/news-radar`, `/api/stock/us/news`는 실제 뉴스 기능 route이나 권한/응답 계약이 다르다고 확인되지 않아 자동 대체 대상으로 취급하지 않았다.
- **분류**: 기능 미사용 확정이 아니라 관리자 테스트 목록과 backend route 간 stale reference/연결 결함 후보다. 별도 통합 `/api/admin/daily-ma9-test?market=...`와 과거 경로를 비교해 유사 불일치가 있으나 과거 KR/US 경로 파일이 현재도 존재하므로 이번 미사용 후보에 넣지 않았다.
- **변경 파일**: `docs/operations/unused-feature-candidates-20261020.md`, `DEVELOPMENT_LOG.md`. 코드, DB, 운영 배포 변경 없음.
- **검증**: tracked source에서 API route 목록과 관리자 `TESTS` endpoint를 대조하고 세 경로의 파일 부재 및 fetch 사용을 확인했다. 조사 범위가 정적 read-only 연결 검사이므로 빌드·테스트·실행은 하지 않았다.
- **남은 위험/다음 개선**: UI를 통한 실제 404 호출은 실행하지 않았다. 해당 항목은 관리자 수동 기능이므로 실사용 여부 및 외부 배포 차이는 저장소만으로 검증되지 않았다. route 복구 또는 테스트 항목 비활성/제거는 사용자 요구 범위를 넘으므로 수행하지 않았다.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] 삭제된 미국 뉴스 관리자 API 테스트의 잔존 참조 정리

- **목적/범위**: 추가 미사용 코드 조사에서 확인한 관리자 API 테스트 UI의 제거된 endpoint 참조를 정리했다.
- **근본 원인/증거**: commit `764c7615`에서 `/api/admin/us-news-radar-test`, `/api/admin/us-news-ticker-test`, `/api/admin/us-news-radar-events` route가 삭제됐지만 `components/admin-api-tests.tsx`에 세 테스트 항목과 레이더 결과 렌더 분기가 남았다. 테스트 실행 시 stale endpoint를 직접 호출하는 상태였다.
- **변경 파일**: `components/admin-api-tests.tsx`에서 세 오래된 항목과 전용 렌더 분기를 제거했다. `components/admin-api-tests.test.tsx`에 제거된 기능 항목이 UI에 다시 노출되지 않는 회귀 검사를 추가했다. `docs/operations/unused-feature-candidates-20261020.md` 및 본 로그에 조사·정리 근거를 기록했다.
- **검증**: 관리자 API 테스트 컴포넌트 Vitest 실행, typecheck, production build를 수행한다. 제품 실행 smoke는 빌드 후 확인한다.
- **남은 위험/다음 개선**: `/api/stock/us/news-radar` 및 `/api/stock/us/news`는 별도의 실제 뉴스 기능 route이며 보존했다. 과거 관리자 UI 항목은 해당 사용자 확인 기능이 route 삭제와 함께 의도적으로 종료됐다는 commit 이력에 근거해 제거했다.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] 미사용 테스트 코드 재탐색

- **목적/범위**: Vitest 대상 테스트 중 제품 코드나 검증 대상과의 연결이 끊긴 테스트가 남아 있는지 조사하고, 안전성이 확인되는 항목만 제거한다.
- **확인 대상**: `vitest.config.ts` 기준 테스트 파일 290개, 테스트 파일과 같은 이름의 제품 파일이 없는 항목, 기존 `docs/operations/unused-feature-candidates-20261020.md`의 고아 모듈 조사 결과.
- **조사 결과**: 동일 이름 제품 파일이 없는 테스트 9개를 개별 확인했다. 이들은 경로 테스트(문의 상세/댓글 API), 여러 모듈을 묶는 SEC Company Facts 및 SEC AI pipeline 테스트, 공유 API 오류 경계 감사, 리뷰 fixture 데이터 검증, DB 통합 테스트, health query resilience/concurrency 테스트이며 각각 현재 라우트·모듈·fixture·DB 계약을 검사한다. 이름이 일치하지 않는다는 이유만으로 삭제하지 않았다. `components/admin-api-tests.test.tsx`도 `/admin/api-tests`의 실제 관리자 화면을 검증한다. 기존 조사에서 고아로 확인된 `keywords`, `sentiment`, `sectors`, `market-rss-discord-message` 전용 테스트는 현재 트리에 이미 없고, `stock-alerts`에는 애초 별도 테스트가 없었다.
- **변경 파일**: `DEVELOPMENT_LOG.md` 작업 기록 추가. 이번 재조사에서 테스트 코드 삭제 없음.
- **검증**: Vitest 설정의 현재 테스트 파일 수(290)와 관련 소스·라우트·fixture·호출 경로를 정적 검색했다. 테스트/빌드/실행은 수행하지 않았다. 작업 트리에 이미 존재한 다른 수정은 보존했다.
- **남은 위험/다음 개선**: 정적 저장소 참조로는 외부에서 직접 호출하는 경로를 완전히 배제할 수 없다. 추가 삭제는 구체적인 고아 증거가 확인될 때만 진행한다.
- **커밋·푸시·배포**: 수행하지 않음.

- **실제 검증 결과 보충**: 관리자 API 테스트 컴포넌트 테스트 1파일 5개 통과, `npx.cmd tsc --noEmit --incremental false` 통과, `npm.cmd run build` 통과. 로컬 `next start`에서 `/admin/api-tests` HTTP 200 및 제거된 테스트 라벨 부재, 제거된 `/api/admin/us-news-radar-test` HTTP 404 확인. `/api/health`는 로컬 DB 부재로 `degraded`였으며 기능과 무관한 환경 상태다. Next build가 `tsconfig.json`을 자동 수정했으나 빌드 전 사용자 변경인 `.next-deploy-verify/types` 한 줄만 보존해 자동 변경을 되돌렸다. `git diff --check` 통과. 커밋·푸시·배포는 하지 않았다.



## [2026-10-21] 미국 보통주 시총 $100M 미만·RVOL 2 이상 후보

- **목적/범위**: 최신 완료 미국 거래일(2026-10-20) 기준으로 시총 $100M 미만 미국 보통주 중 20일 평균 대비 RVOL 2 이상을 읽기 전용으로 선별하고 결과 문서화.
- **확인/결과**: 프로젝트 정책·관련 저장 스크립트 확인 후 공개 스크리너 및 종목별 종가 페이지, SEC 원문을 대조했다. HOST(30.71×, $79.8M), WORX(9.36×, $328.6K), SPHL(5.88×, $5.5M)을 문서에 수록했다. HUIZ는 ADS라 제외했고, SAFX/HCAI는 최신 데이터 시점 미충족으로 제외했다.
- **검증 및 한계**: SEC에서 HOST Class A common stock, WORX common stock, SPHL Class A ordinary shares를 확인했다. 공개 unusual-volume 스크리너 기본 기준이 RVOL 3 이상이므로 2.0~2.99 구간을 전수 검색하지 못해 완전한 전체 목록으로 보장할 수 없다. 로컬 `.env.local` PostgreSQL 주소 `localhost:5432` 연결 거부로 프로젝트 DB 대조는 불가했다. 상세 한계/출처는 `docs/operations/us-common-stocks-under-100m-rvol2-20261020.md`에 기록했다.
- **변경 파일**: `docs/operations/us-common-stocks-under-100m-rvol2-20261020.md`, `DEVELOPMENT_LOG.md`.
- **제품 코드/DB**: 변경 없음. 외부 페이지 GET만 수행.
- **빌드·테스트·실행**: 조사/보고서 작업으로 미실행.
- **커밋·푸시·배포**: 수행하지 않음.

## [2026-10-21] 운영 번역 provider 설정 상태 재검증

- **목적/범위**: Azure Translator F0 우선·Google Cloud Translation fallback 구현의 운영 활성화 여부를 확인하기 위해 production 관리자 디버그 API의 `environment` 검사만 인증된 GET으로 조회했다. 자격증명 값은 응답·로그에 출력하지 않았다.
- **결과**: `/api/admin/debug-suite?checks=environment`에서 `googleTranslationApiKeyConfigured=true`, `azureTranslatorF0Configured=false`, `azureTranslatorRegionConfigured=false`를 확인했다. 따라서 현재 운영은 Google provider를 사용하며 Azure 우선 순서는 Azure F0 설정이 등록될 때까지 실제 활성화되지 않는다.
- **근본 원인/필요 조치**: 코드 배포만으로 provider credentials가 생기지 않는다. 운영 secret store에 `AZURE_TRANSLATOR_API_KEY`, `AZURE_TRANSLATOR_ENDPOINT`, `AZURE_TRANSLATOR_FREE_TIER_CONFIRMED=F0`를 설정하고 해당 Azure 리소스가 실제 F0인지 확인해야 한다. 리소스가 region 헤더를 요구하는 경우에만 `AZURE_TRANSLATOR_REGION`도 설정한다. 설정 후 environment debug와 실제 번역 요청으로 Azure primary 및 Google fallback을 검증해야 한다.
- **변경/데이터 영향**: 운영 디버그 API read-only 조회만 수행. 코드, 설정, DB, 번역 데이터 변경 없음.
- **검증**: 운영 디버그 응답 `ok=true`; Google/Azure 구성 여부 세 필드만 확인. Production health는 `status=ok`. Azure 실호출은 설정이 없어 미수행이다.
- **추가 환경 확인**: 로컬 `.env.local`에서도 Azure key, endpoint, region, F0 확인값이 모두 누락되어 있음을 값 비노출 방식으로 확인했다. OCI 운영 설정 위치와 재시작 절차는 `deploy/oci/README.md`의 환경 설정 안내를 기준으로 하며, 이 저장소의 배포 workflow에는 Azure secret 주입 단계가 없다.
- **커밋·푸시·배포**: 이번 점검은 제품 변경이나 새 배포를 만들지 않았다. 번역 provider 구현은 commit `97fefb7f`에 이미 반영·배포되어 있다.
- **2026-10-22 운영 오류 원인 수정**: 신규 단일 항목 진단에서 공급자 요청 전 `quota_reservation` 단계의 PostgreSQL 오류 `inconsistent types deduced for parameter $3`를 확인했다. 월별 원장 upsert에서 positional parameter 타입이 추론 문맥마다 달라지던 구문을 `text`/`bigint` 명시 CTE와 `EXCLUDED.reserved_characters` 기반 upsert로 변경했다. DB 스키마 변경은 없다. `translation-cache.test.ts`에 Azure quota 예약 성공 회귀 테스트를 추가하고, 배포 후 동일한 단일 항목 PREVIEW에서 Azure 호출 및 번역 성공 여부를 검증한다. 재발 감지는 타입 명시 SQL 회귀 테스트와 preview 진단의 `quota_reservation` 오류 단계로 수행한다.
- **2026-10-22 Azure provider 오류 진단 후속**: quota 예약 SQL 수정 후 운영에서 Azure 요청 1회가 실제 발생했으나 Azure 실패가 Google fallback의 월간 상한 응답에 가려졌다. composite client가 Azure 실패 원인을 내부 `TranslationResult` 필드로 전달하고, 관리자 preview 진단 callback에서만 마스킹해 노출하도록 개선했다. 번역 항목 객체·DB에는 이 오류 원인을 추가하지 않는다. `API key` 공백 표기를 포함한 민감값 마스킹과 Azure 실패+Google quota 차단 경로를 회귀 테스트로 고정한다. 배포 뒤 단일 운영 preview로 Azure 응답 코드/원인을 확인하고, 그 결과에 따라 endpoint·region·credential 중 해당 원인만 수정한다.
## [2026-10-24] 국내 보통주 KIS 표준산업분류 코드 운영 DB 적재 API

### 목적·범위
- 운영 DB에 직접 접속하지 않고, 운영 서버 관리자 API가 KIS Open API 주식기본조회(CTPF1002R)로 활성 국내 COMMON_STOCK 종목의 표준산업분류 코드와 명칭을 조회·저장하도록 한다.

### 변경
- `V160__kr_common_stock_standard_industry.sql`에 보통주 및 특수상품 유니버스 표준산업분류 코드/명칭 컬럼을 추가했다.
- `/api/admin/domestic-industry-sync`를 추가했다. 관리자 전용 POST는 페이지별 KIS 응답 검증 후 트랜잭션 저장하고, GET은 관리자 세션 또는 읽기 전용 API 키로 집계 상태만 반환한다.
- 운영 유니버스 관리 화면에 10종목 단위 진행·재시도 가능한 갱신 버튼을 추가했다. 산업분류 확인이 불가능한 종목은 임의 추정하지 않고 중단한다.
- 데이터 사전과 스크립트 안내를 갱신했다.

### 검증
- 삼성전자(005930) KIS 실 API 단건 확인: `std_idst_clsf_cd=032604`, `통신 및 방송 장비 제조업`.
- `npx tsc --noEmit --pretty false`: 통과.
- 대상 Vitest 2개 파일 9건: 통과.
- `npm run docs:check`: 통과 (V160 포함 160개 migration).
- `npm run build`: 통과. 클린 분리 작업 복사본은 Windows junction 추적 단계에서 EPERM 경고가 있었으나 빌드 종료 코드는 0; 본 작업 워크스페이스에서도 빌드 통과.
- `npm run start -- -p 3101`: 로컬 `/health-check` 200, 미인증 산업분류 API는 의도대로 401.
- 운영 DB 직접 접속/조회·쓰기, 운영 배포와 전체 종목 데이터 반영은 아직 수행하지 않았다.

### 커밋·푸시·배포
- 아직 미실행. 운영 DB 작업은 운영 API 배포와 관리자 인증 후 진행한다.

### 2026-10-24 — 국내 유니버스 미적재 상태 대응
- 운영 상태 API로 활성 국내 COMMON_STOCK 건수가 0임을 확인했다. 직접 DB 연결은 하지 않았다. 기존 전역 마스터 업로더는 미국 3개 거래소까지 함께 갱신하므로 이번 국내 전용 목표에서 사용하지 않는다.
- 국내 한정 관리자 API `/api/admin/domestic-universe-import`와 화면을 추가했다. 공식 KIS KOSPI/KOSDAQ 마스터 2개만 검증·적재하고 미국 테이블은 건드리지 않으며, 누락 기존 행의 비활성화도 하지 않는다. 기존 KIS 상품 분류 규칙을 재사용하고 두 시장 각 100행 이상이어야 처리한다.
- KIS 공식 배포 호스트에서 2026-10-23 갱신 마스터 2개를 확보했다. 현재 파서 기준 총 KOSPI 2,583행, KOSDAQ 1,825행이며, 활성 조건 분류 결과는 각각 760, 1,598 보통주다. 이는 파서 산출이며 운영 DB 적재 전 수치다.
- 16개 관련 테스트, TypeScript, 문서/migration 검사, diff 검사 통과. 운영 반영은 국내 한정 API 배포와 관리자 세션 확보 후 진행한다.
## [2026-10-24] 미국 보통주 KIS 업종코드 운영 적재 재검증 및 Flyway 기준 정렬

- **목적/범위**: 앞선 미국 KIS 업종코드 동기화 작업의 Flyway V160 불일치를 해결하고, 최신 KIS 원본으로 운영 DB 저장 후 read-after-write 비교를 재검증한다.
- **원인/대응**: 동기화 코드를 포함한 작업 브랜치가 운영 `oci`에 이미 적용된 `V160__kr_common_stock_standard_industry.sql`보다 앞선 커밋에서 분기되어 배포 활성화 단계에서 migration 160 미해결 오류가 발생했다. DB에 `flyway repair`는 실행하지 않았다. `origin/oci`를 병합해 이력과 스키마 정의를 정렬했다.
- **변경 대상**: `lib/us-industry-code-sync.ts`, `lib/us-industry-code-sync.test.ts`, `docs/architecture/us-industry-classification-data-design.md`, `DEVELOPMENT_LOG.md`. 운영 업로드 시 동기화 코드 및 후검증을 수행했다.
- **인증 확인**: `.env.local`의 KIS `KIS_APPKEY`/`KIS_APPSECRET`로 공식 OAuth 토큰 발급 성공(토큰값 미출력·미저장, 만료시간 24시간). 같은 파일의 `ADMIN_DASHBOARD_PASSWORD`로 운영 로그인 HTTP 200.
- **원본 대조**: KIS 공식 NAS/NYS/AMS 마스터(2026-10-23 데이터, 2026-10-24 19:01 KST 다운로드)를 프로젝트와 동일한 필드/상품 제외 기준으로 전수 파싱. 5,358 KIS 보통주 후보 중 실제 3자리 비영 업종코드 2,634, 공식 `000` 2,724.
- **로컬 DB read-only 비교**: `BEGIN READ ONLY` + `statement_timeout`으로 활성 COMMON_STOCK 5,444행 확인. 유효 `industry_code`는 0행, 미분류 5,444행. KIS와 5,310행 매칭했으며 매칭값 5,310건 모두 DB 공란으로 원본과 불일치(2,634건은 KIS에 비영 코드가 있으나 로컬 DB 공란). KIS 후보 중 DB 활성 universe 누락 48건(AMS12/NAS32/NYS4), 반대로 DB 활성 종목 중 최신 KIS 후보와 불일치 134건(AMS7/NAS46/NYS81). 이번 검증에서는 DB를 변경하지 않았다.
- **운영 route 확인**: 로그인 후 현재 운영 `/api/admin/us-industry-codes`가 404 `text/html`이어서 최신 운영 DB 업종코드 및 저장 후 감사 결과는 확인할 수 없었다. 이전 작업의 운영 적재 수치는 역사적 결과로 구분하며 현 상태의 성공으로 간주하지 않는다.
- **검증**: `origin/oci` 통합 전 `npm.cmd run deploy:verify` 통과: 의존성 취약점 0, build 통과(standalone node_modules junction symlink EPERM 경고만 발생), `/charts` 200 및 desktop/mobile hydration, API smoke 통과; Vitest 296 files passed/1 skipped, 1,435 tests passed/3 skipped; typecheck, docs, verify-scope, KIS boundary, bearer-auth, cron checks 통과. 이후 최신 RSS 기록과 ID가 중복임을 추가 통합 검증에서 발견했고, KIS ID를 `CI-2026-10-24-007`로 변경했다. 앞선 `/charts` 30초 timeout은 재현되지 않았다.
- **남은 위험/후속**: 로컬 DB 업종코드 미적재와 KIS-universe 48/134개 불일치가 남아 있다. 운영 진단 route가 현재 404이므로 운영 최신값도 검증 불가. 다음 실행은 활성 보통주 분모 차이를 종목별로 분류하고, 명시 승인 후 로컬/운영 적재 및 read-after-write 감사가 가능하도록 최신 배포 경로를 먼저 복구해야 한다. `000` 값은 공식 미분류로 유지하고 임의 보정하지 않는다.
- **커밋·푸시·배포**: 통합 검증 및 KIS 원본 대조가 통과해 로컬 merge를 마무리한 뒤 원격 브랜치 push와 OCI 배포 workflow를 진행한다. 운영 진단 route가 현재 404인 원인을 배포 후 다시 확인하고, KIS 원본 재적재 및 DB read-after-write 검증 전까지 목표 완료로 보고하지 않는다.

## [2026-10-24] KIS 미국 업종 운영 반영 확인 및 전수 차이 진단 확장

- **목적/범위**: `.env.local` 인증으로 최신 KIS NAS/NYS/AMS 마스터의 미국 보통주 산업코드를 운영 DB에 반영하고, 모든 후보의 코드 동일성 및 양방향 universe 누락을 확인한다.
- **인증/원본**: `.env.local`의 KIS 앱키/시크릿으로 KIS OAuth 발급 성공(토큰 비노출). 공식 KIS 마스터(데이터 기준 2026-10-23)를 사용했다. `.env.local`의 관리자 비밀번호로 운영 로그인 HTTP 200, 운영 진단 GET HTTP 200을 확인했다.
- **운영 적재**: 최초 PowerShell multipart 요청은 HTTP 500으로 실패했으나 DB 저장 성공으로 오인하지 않았다. 표준 `curl -F` multipart로 재호출하여 2026-10-24T12:11:28.704Z에 API `ok=true`를 확인했다. KIS 보통주 후보 NAS 3,240/NYS 1,864/AMS 254 중 활성 운영 DB에 저장된 행은 NAS 3,176/NYS 1,855/AMS 237이다. 운영 DB read-after-write 검증은 매칭 5,268, 산업코드 불일치 0, 미매칭 90(NAS64/NYS9/AMS17)이다. 원본 `000`은 공식 미분류로 저장되며 코드 추정/보완은 하지 않았다.
- **현재 운영 집계**: 활성 DB COMMON_STOCK는 NAS 3,949, NYS 2,480, AMS 275이다. 이 중 비영 코드로 분류된 수는 NAS 1,354/NYS 1,186/AMS 94이며 공식 `000` 또는 결측은 NAS 2,595/NYS 1,294/AMS 181이다. 동기화된 KIS 후보의 비영 코드 수와 일치한다.
- **발견된 진단 한계와 변경**: 운영 API는 이전에 미매칭 티커 10개만 노출해 전체 차이를 끝까지 설명하기 어려웠다. 동기화 검증 응답을 전체 미매칭 코드 및 KIS 원본에는 없지만 DB에서 활성 보통주인 코드/건수까지 반환하도록 확장하고 단위 테스트를 갱신했다. 이는 진단만 수행하며 미등록 종목을 자동 편입하거나 DB 단독 종목을 삭제·비활성화하지 않는다.
- **검증 및 배포 상태**: 진단 보강 후 최초 전체 게이트에서 테스트 fixture의 query 분기 오류 1건을 발견·수정했고, 해당 테스트 단독 통과 후 `npm.cmd run deploy:verify`가 최종 통과했다(296개 파일 통과/1 skip, 1,435 tests 통과/3 skip, typecheck·docs·감사·빌드·standalone runtime/browser smoke 모두 통과). Windows standalone 빌드의 기존 node_modules junction symlink EPERM 경고는 있었지만 산출물 실행과 모든 smoke가 성공했다. 신규 진단 필드의 OCI 배포 및 최종 차이 원인 확인은 아직 남았다.
- **재발 방지/후속**: 업로드 API는 동기화 성공 응답과 read-after-write 검증을 함께 확인하고, 500·비JSON·연결 오류는 쓰기 성공으로 판단하지 않는다. 진단 응답의 `unmatchedCodes`와 `activeDatabaseOnlyCodes`를 사용해 각 티커가 비활성/타입 불일치/부재 중 무엇인지 분류한다. `000`을 임의 분류하지 않는다.
- **커밋·푸시·배포**: 진단 변경 커밋 `cc0803b7`은 작업 브랜치로 push했다. 첫 workflow run `40093935845`는 새 `oci` 배포 run `40094159820`과 겹쳐 Activate release에서 취소됐다. 최신 `origin/oci`의 RSS cron 변경을 통합 중이며, 통합 트리 검증 후 재배포한다. 아직 신규 진단 필드의 OCI 배포 및 최종 차이 원인 확인은 미완료다.

## [2026-10-24] KIS 진단 변경과 최신 OCI RSS 커밋 통합

- 최신 `origin/oci`의 RSS cron 변경 4개 파일을 보존해 KIS 작업 브랜치에 병합했다. `DEVELOPMENT_LOG.md`의 양쪽 작업 기록을 모두 유지했다.
- 통합 후 전체 테스트는 296 files passed/1 skipped, 1,436 passed/3 skipped였다. `docs:check`에서 KIS/RSS 개선 ID 중복을 두 차례 발견하여 KIS 항목을 현재 `CI-2026-10-24-007`로 고유화했다.
- 수정된 통합 트리에서 `npm.cmd run deploy:verify`를 재실행해 통과했다: 빌드, standalone `/charts`·desktop/mobile Chrome 및 API smoke, 296 test files passed/1 skipped(1,436 passed/3 skipped), typecheck, docs/migration, verify-scope, KIS boundary, bearer-auth(179 routes), cron check.
- 경쟁하던 OCI run #1108 (`6e3e0ac5`)는 success로 완료됐다. 진단 코드의 통합 커밋은 그 뒤 별도로 푸시·배포해야 하며, 이를 통해 동시 실행 취소를 방지한다.

## [2026-10-24] 최신 KIS 미국 업종 전수 적재·운영 재검증 결과

- `.env.local`의 KIS OAuth 자격증명 및 관리자 로그인 비밀번호를 사용해 인증했다. 값과 토큰은 출력하지 않았다.
- KIS 공식 마스터(데이터 기준 2026-10-23) NAS/NYS/AMS 12,891행에서 common-filter 후보 5,358건을 생성했다. 거래소별 후보 NAS 3,240/NYS 1,864/AMS 254, 비영 업종코드 2,634건, 원본 `000` 2,724건이다.
- 최신 운영 동기화 route는 최초 PowerShell multipart 호출 500 이후 표준 `curl -F` 요청에서 정상 처리됐다. 2026-10-24T13:05:17Z 마지막 응답은 `ok=true`이며 5,268건 저장, read-after-write `mismatch=0`, 미매칭 90건(NAS64/NYS9/AMS17)이다.
- 별도 인증 GET에서 활성 DB COMMON_STOCK 총 6,704행(NAS3,949/NYS2,480/AMS275), 유효 분류 코드 2,634행, `000` 또는 결측 4,070행을 확인했다. KIS 후보와 매칭된 5,268행에서는 분류 2,634/공식 `000` 2,634로 원본과 일치한다.
- 반대 방향으로 최신 KIS 후보에 없는 활성 DB COMMON_STOCK가 1,436행(NAS773/NYS625/AMS38)이다. 이 행들은 유형이 확인되기 전까지 KIS 산업코드를 임의로 부여하지 않았다. KIS 후보 90행 역시 현재 활성 COMMON_STOCK에 존재하지 않아 자동 편입하지 않았다.
- 전체 차이 목록을 조회 가능하게 만든 진단 코드/최신 OCI RSS 변경 통합 커밋 `77afbacc`를 push했다. run #1111 (`40096039714`)은 success로 완료됐다. 바로 전 run #1109, #1107은 더 최신 `oci` push가 배포를 시작해 취소됐으며, 최신 `oci`를 통합한 뒤 #1111에서 정상 배포했다.
- **완료 범위**: 운영과 매칭된 5,268개 KIS 공식 보통주의 산업코드 저장·동일성 검증 완료. **미완료**: universe 간 90+1,436건 차이의 종목별 등록/활성/상품 유형 조사. 보통주 전용 원칙상 이 불일치는 별도 종목 universe 정비 승인 없이 자동 변경하지 않는다.
- **재발 방지**: 앞으로 성공은 HTTP 200만으로 판정하지 않고 API `ok`, 거래소별 matched/missing/mismatch, 독립 GET, 공식 `000` 보존을 모두 확인한다. 전체 universe 차이는 전체 코드 목록으로 진단하며, 미등록 편입·비활성화는 별도 작업으로 분리한다.

## [2026-10-24] 국내 KIS 산업분류 동기화 시 영숫자 종목코드 지원

### 목적 및 범위
- 운영 종목 마스터를 KIS 공식 KOSPI·KOSDAQ 종목 마스터 파일로 준비하고, 운영 API를 통해 활성 국내 보통주의 KIS 표준산업분류 코드를 저장한다.
- 운영 DB 직접 접속은 하지 않고 운영 API만 사용한다.

### 확인 및 변경
- 운영 API의 국내 전용 마스터 적재 결과: 원본 4,056건(KOSPI 2,583, KOSDAQ 1,825), 국내 보통주 2,358건, 특별상품 1,698건, 해외 유니버스 변경 없음.
- 업종 동기화 최초 묶음은 `0001A0`에서 중단되어 DB 저장 전 롤백/미실행 상태임을 확인했다. 이 종목은 KIS 공식 마스터의 KOSDAQ 보통주이며, KRX 종목코드가 영숫자 6자리일 수 있다.
- `app/api/admin/domestic-industry-sync/route.ts`의 종목 코드 검증을 영숫자 6자리로 확장하고, 산업분류 코드는 기존처럼 숫자 6자리 검증을 유지한다. `route.test.ts`에 `0001A0` 회귀 사례를 추가했다.
- 영숫자 코드 허용 수정 배포 뒤에도 `0001A0` 요청이 유효성 오류로 반환되어, 실제 거부 조건을 좁히기 위해 코드 형식·KIS 성공·산업코드·분류명·표준코드 존재/일치 여부의 진단 boolean을 오류 응답에 추가한다. 실패 묶음은 저장되지 않았다.
- 운영 진단에서 `tickerFormat=true`, `kisResponse=true`인데 `industryCode`, `industryName`, `standardCode`가 모두 false임을 확인했다. KIS 응답은 성공했으나 공통 응답 파서가 단일 객체 형태의 `output`을 `rows`로 옮기지 않는 경로가 원인으로 판단되어, 단일 `output` 객체를 한 행으로 정규화하고 KIS 기본조회 응답 회귀 테스트를 추가한다.
- 파서 배포 후 첫 20종목은 저장됐지만 `003310`의 공식 KIS 응답은 성공(`rt_cd=0`)하고 표준산업분류 코드 `031009`를 포함한 반면 `std_idst_clsf_cd_name`은 빈 문자열이었다. 코드는 유효하므로 분류명 부재만으로 코드를 버리지 않도록 운영 API 검증을 수정하고, 미입력 명칭 수를 운영 상태 응답에서 별도로 제공해 코드 커버리지와 명칭 커버리지를 구분한다.

### 검증 및 운영 상태
- `be3ffc65`의 파서 수정을 포함한 운영 배포 `#1118` 성공 뒤 `0001A0` 첫 10개와 다음 10개를 운영 API로 저장했다. KIS 응답은 003310에서 코드만 제공하고 이름은 누락해 중단되어, 코드 저장은 계속하되 누락 이름 수를 노출하는 보완을 배포하고 나머지 대상을 이어서 처리한다.

### 2026-10-25 운영 전체 반영 완료
- 관리자 로그인 후 국내 전용 운영 유니버스 API로 KIS 주식기본조회(CTPF1002R)를 호출해 2,358개 활성 `COMMON_STOCK`의 표준산업분류 코드를 저장했다. 운영 DB에는 직접 접속하지 않았다.
- KIS가 성공 응답과 유효한 6자리 표준산업분류 코드를 제공했지만 분류명을 비운 18개는 코드를 저장하고 이름은 빈 값으로 유지했다. 운영 상태 API는 `total=2358`, `completed=2358`, `missing=0`, `missing_name=18`을 반환했다.
- 마지막 API 묶음에서 일시 HTTP 502가 발생했으나 재요청한 offset 2340(10개)과 offset 2350(8개)이 모두 HTTP 200으로 저장됐고, 완료 상태를 재조회해 확인했다.
- 배포 `#1120` 성공 뒤 전체 처리를 완료했다. 로컬 deploy:verify는 빌드, runtime smoke, 1,444개 테스트, typecheck, docs 및 보안/cron 감사 통과. 임시 마스터 파일 및 운영 API 보조 스크립트는 완료 후 삭제했다.
- **남은 데이터 한계**: 18개 종목의 KIS 응답에는 표준산업분류명이 없어 이름을 임의 추정하지 않았다. 코드는 모두 저장됐다.
- 현재 운영 API 업종 현황은 2,358건 중 0건 완료, 2,358건 미완료다. 동기화는 아직 완료되지 않았다.
- 커밋·푸시·배포는 수정 검증 완료 후 수행한다.

### 재발 감지 및 남은 위험
- 운영 API의 `missing` 집계가 0인지 마지막에 확인한다. 처리 중 KIS 오류가 발생하면 해당 묶음에서 멈추며, 부분 커밋 없이 실패 코드를 기록하고 원인을 확인한 뒤 재개한다.
- KIS 공식 마스터에서 신규 영숫자 종목코드가 추가될 수 있으므로 6자리 종목코드 검증은 영문 대문자를 허용하되, 응답의 표준코드와 숫자 6자리 산업분류 코드는 계속 검증한다.
## [2026-10-24] KIS 해외 업종코드 필드 폭 검증 수정

### 목적/범위
- KIS 공식 `mastcode.icod` 4자 필드 정의와 맞지 않던 3자리 고정 검증을 수정해 정상적인 최대 4자리 숫자 분류값을 미분류로 오판하지 않도록 한다. 공식 분류 원천은 KIS만 유지한다.

### 반영
- `lib/us-industry-code-sync.ts`에 `isValidKisUsIndustryCode()`를 추가해 동기화 후보와 coverage 집계를 1~4자리 숫자 및 all-zero sentinel 규칙으로 통일했다.
- 운영 GET coverage SQL도 같은 규칙으로 변경했다. 4자리 값의 SQL payload round-trip과 `0000`·비숫자·초과길이 거부 회귀 테스트를 추가했다.
- KIS 현재 원본 샘플에는 3자리 코드와 `000`만 관측됐다. 4자리 지원은 공식 헤더 폭에 기반한 방어 변경이며, 기존 운영 미매칭 90건/DB 전용 1,436건은 별도 조사 대상이다.

### 검증
- 수정 직후 대상 테스트 12개 통과.
- `origin/oci` 최신 커밋 통합 후 `npm.cmd run deploy:verify` 최종 통과: 프로덕션 빌드, standalone 실행과 `/charts` desktop/mobile hydration/API smoke, 전체 Vitest, typecheck, docs/migrations, verify-scope·KIS 경계·Bearer auth·cron 검사를 완료했다. 병합 중 확인한 중복 개선 ID는 고유화한 뒤 docs 검사를 통과했다.
- Windows 빌드에서 node_modules junction symlink `EPERM` 경고가 있었으나 산출물 실행 smoke는 성공했다.

### 다음 개선
- 운영 DB 활성 보통주와 최신 KIS 공식 보통주 후보의 차이 90건/1,436건을 종목 유형·활성 상태 원천 필드로 대조한다.
- KIS `icod=000` 미분류와 KIS 후보 파일에 없는 DB 행은 추정값으로 덮지 않고 공식 원천 필드로만 판정한다.

### 개선 과제
- 개선 과제 ID: CI-2026-10-24-009
- 성과 판정: PARTIAL
- 근거: KIS `icod` 공식 폭 수정, 배포와 최신 마스터 동기화는 완료했고 매칭 5,268건의 코드 불일치가 0임을 검증했다. 다만 KIS 공식 미분류 2,724건과 KIS/활성 DB universe 양방향 차이 90/1,436건 때문에 전체 활성 보통주 coverage 동일성은 미완료다.

### 커밋·푸시·배포
- 커밋 `bacc578c4577890a9a65352fcc59ee296346592c`를 `oci`에 push했고 Deploy OCI run `40102846417` 성공을 확인했다.
- 운영 관리자 로그인·진단 API 200, KIS 공식 마스터 동기화 POST 200 및 독립 GET coverage 일치를 확인했다. credentials/access token은 저장하지 않았다.
- 운영 결과와 universe 불일치 위험의 자세한 기준은 `docs/architecture/us-industry-classification-data-design.md`의 2026-10-24 최신 배포 후 재검증 절을 따른다.

## [2026-10-24] KIS 미국 보통주 업종 universe 차이 read-only 감사 경로

### 목적/범위
- 운영에서 KIS 후보 90개 미매칭과 활성 DB 보통주 1,436개가 KIS 후보와 일치하지 않는 원인을 종목 단위로 확인한다.
- 원인은 KIS 원본의 보안유형/DR/ETP/파생 필드, 프로젝트 common classifier, common/special DB 파티션 상태 및 저장 업종코드 비교로 좁힌다.
- 감사 요청에서는 운영 DB 값을 변경하지 않는다. KIS 단독 공식 분류 코드 원칙 유지; SEC/외부 분류 원천 미사용.

### 구현
- `lib/us-industry-code-sync.ts`: 전체 KIS 원본 행에 공통 후보 여부와 제외사유를 부여하고, `BEGIN READ ONLY` read-only 감사 함수를 구현했다. KIS source rows를 active common 및 special universe와 조인하여 두 쪽의 discrepancy row를 만든다.
- `app/api/admin/us-industry-codes/route.ts`: 관리자 인증 및 NAS/NYS/AMS 파일 검증을 거친 `?mode=audit` 분기를 추가했다. 일반 POST 동기화 경로와 분리하고 감사 응답에 `databaseWritePerformed:false`를 반환한다.
- 단위/라우트 테스트에서 읽기 전용 트랜잭션, source/data partition 조인, sync 함수 미호출, 인증 필수 동작을 고정한다.
- 전체 배포 게이트에서 기존 chart modal 테스트가 비동기 데이터 도착 전에 EMA 라벨을 동기 조회하는 race를 재현했다. 제품 코드는 변경하지 않고 테스트 assertion을 `findByText`로 바꿔 실제 UI 데이터 완료를 기다리도록 안정화했다.

### 검증 및 남은 상태
- 관련 테스트 3개 파일 19개 통과. 전체 게이트 중 chart modal async assertion race도 재현해 테스트만 대기형 assertion으로 수정했다. 이 수정 후 전체 검증을 처음부터 다시 실행한다.
- `npm.cmd run docs:check`, `git diff --check`를 통과했다. 전체 `deploy:verify`, commit/push, 운영 배포, 새 read-only 운영 감사는 아직 미실행이다.
- 운영 universe 차이의 원인과 KIS 미분류 `000`은 아직 해결되지 않았다. 감사 결과에 따라 유효 COMMON_STOCK 누락 행만 KIS 원본으로 추가/수정하고, 제외 상품은 common universe에서 제거할 별도 결정·변경·검증을 수행해야 한다. 완료 판단은 모든 활성 common rows가 KIS 원본 후보와 대조되거나 공식 부적격 사유로 격리되고, 남은 KIS `000`이 원본상 미분류임을 확인한 뒤에만 가능하다.

### 운영 read-only 감사 결과 (2026-10-24)
- 로컬 `.env.local` 관리자 인증 후 운영 API `POST /api/admin/us-industry-codes?mode=audit`에 KIS 공식 NAS/NYS/AMS 원본을 업로드했다. 최종 요청은 HTTP 200이고 `databaseWritePerformed:false`; 운영 DB 변경 없음.
- 원본 후보/활성 common 매칭/후보 누락/DB 단독 활성 common/코드 불일치는 NAS 3,240/3,176/64/773/0, NYS 1,864/1,855/9/625/0, AMS 254/237/17/38/0이다. 유효 코드 2,634개는 전부 KIS 원본과 저장값이 일치한다.
- DB 단독 1,436행 중 KIS 원본이 SPAC 475, DERIVATIVE 624, DEBT_SECURITY 104, DR 85로 분류한 행이 common partition에 남아 있다. 나머지 148행은 원본 파일 부재라 분류 결론을 내리지 않는다. 추가 집계에서 KIS 후보 90행 모두 원본 업종 `000`(유효 코드 0/90, 미분류 90/90)임을 확인해, DB 편입만으로 섹터 값을 얻을 수 없음을 검증했다.
- 목표는 부분 달성(PARTIAL): KIS가 실제 분류코드를 제공한 행은 정확하지만 전체 DB common universe는 원천과 불일치하며 공식 `000` 2,724행은 미분류다. 본 작업은 유형 추정/DB 정비를 실행하지 않았다. 후속 개선은 공식 common 후보 편입 및 명확한 비보통주 격리 설계를 분리해 검증한 뒤 진행한다.
- 배포: `npm.cmd run deploy:verify` 통과 후 커밋 `2bb1c946`을 `oci`에 푸시. Deploy OCI run `40105287764` 완료 및 운영 `/health-check`에서 해당 SHA 제공을 확인했다.

### 개선 과제 및 배포
- 개선 과제 ID: CI-2026-10-24-012
- 성과 판정: IN_PROGRESS
- 코드 변경은 현재 로컬 작업 트리에만 있으며 아직 커밋·푸시·배포하지 않았다. 전체 검증 후 `oci` 반영 및 운영 read-only 감사로 이어간다.
## [2026-10-25] KIS 미국 보통주 산업코드·유니버스 원자적 동기화 보강

### 목표
- KIS 공식 NAS/NYS/AMS 마스터에서 확인되는 미국 보통주 전체의 `icod`를 운영 DB에 저장하고 원본과 대조한다. 산업분류 출처는 KIS만 사용하며 SEC 데이터는 사용하지 않는다.

### 발견 및 변경
- 운영 read-only 감사에서 KIS common 후보 90개가 활성 common 테이블에 없고, 반대로 활성 common 1,436개가 최신 KIS 후보에 없음을 재확인했다. 단순 `industry_code` UPDATE로는 두 차이가 해소되지 않아 동기화 성공을 전체 종목 저장 성공으로 볼 수 없었다.
- `lib/us-industry-code-sync.ts`: 원본 common 전체 upsert, 원본 특수상품을 special partition에 upsert, KIS 후보 밖의 활성 common 비활성화를 하나의 트랜잭션 및 advisory lock으로 묶었다. 사후 common 누락·산업코드 불일치·DB 단독 활성 common·special 누락이 남으면 전체 rollback하도록 했다.
- `lib/instrument-universe-import.ts`: KIS `stis`/`etyp`을 반영해 지수·ETP·비주식·알 수 없는 security type을 공통주로 오인하지 않도록 fail-closed 분류를 보강했다.
- `lib/instrument-universe-import.test.ts`: common/special 분리 및 인덱스·ETP·미확인 유형에 대한 회귀검사를 추가했다.
- `docs/architecture/us-industry-classification-data-design.md`, `docs/ERROR_HANDLING.md`: 정합성 기준, 000 보존, 비활성 데이터 보존, 트랜잭션 rollback 및 재발검증을 문서화했다.

### 검증
- 대상 테스트: `npm.cmd test -- --run lib/instrument-universe-import.test.ts app/api/admin/us-industry-codes/route.test.ts` 통과(2개 파일, 17개 테스트).
- 사용자 기본 프로젝트 `.env.local`을 우선 로드해 KIS 공식 OAuth를 실제 호출했다(HTTP 200, 86,400초 만료). 토큰과 자격증명은 출력하지 않았다. 공식 KIS 다운로드 호스트에서 NAS/NYS/AMS ZIP을 모두 HTTP 200으로 받아 현재 파서 테스트에 사용했으며, 3개 테스트 파일 20개 테스트가 통과했다.
- 1차 `deploy:verify`는 기존 SQL mock이 새로운 INSERT 트랜잭션 경로를 모사하지 못해 동기화 테스트 1건이 실패했다. mock을 실제 전체 upsert·검증 호출 순서로 수정하고 대상 20개 테스트를 재실행해 통과시켰다. 후속 `deploy:verify`는 build, standalone runtime smoke, Chrome 데스크톱·모바일 hydration, typecheck, docs/migration 및 audit 게이트와 전체 테스트(297개 파일 통과, 1개 skip; 1,451 tests 통과, 3개 skip)를 모두 통과했다.

### 남은 위험 및 다음 단계
- KIS 원본 `icod=000`은 공식적으로 미분류이며 이 코드에서 업종을 추정하지 않는다.
- 운영 KIS 후보 5,358개 중 유효 코드 2,634개(49.15%)가 분류되어 있고 2,724개(50.85%)는 공식 `000`이다. 더 많은 공식 분류값 제공 전까지 이는 해결되지 않는 공급원 커버리지 한계다.
- KIS 마스터에 없는 148개 이전 DB 행은 새 KIS common 후보임을 검증할 수 없어 비활성 상태로 보존했다. 향후 KIS 원본에서 재확인될 경우에만 다시 편입한다.
- 성공 기준: 후속 마스터 동기화 뒤 read-only 감사에서 누락·코드 불일치·KIS 후보 외 활성 common이 모두 0인지 반복 확인하고, 최신 공식 마스터 기준 eligible counts 변화도 문서화한다.

### 개선 과제
개선 과제 ID: CI-2026-10-25-015
성과 판정: COMPLETE_WITH_SOURCE_LIMIT
근거: `deploy:verify` 통과 후 커밋 `f84c842faebfc0314d959cf2460e148309370c8c`을 `oci`로 push했고 Deploy OCI run `40111254986` 성공을 확인했다. `.env.local` 관리자 인증, 공식 KIS NAS/NYS/AMS 원본 사전 read-only audit, 전체 sync, 별도 GET 및 재업로드 read-only audit가 모두 HTTP 200이었다. 저장 후보는 3,240/1,864/254, 활성 common 외부 행·누락·코드 불일치 모두 0, 유효 업종 2,634, KIS 공식 미분류 `000` 2,724다.

### 운영 저장·재검증 (2026-10-25)
- `.env.local`에서 관리자 비밀번호만 메모리로 읽어 운영 관리자 세션을 만들었다. 인증 성공은 HTTP 200이며 비밀번호·쿠키·KIS 토큰은 로그에 노출하지 않았다.
- 저장 전 운영 read-only audit에서 `databaseWritePerformed=false`; 시장별 KIS common 후보 NAS/NYS/AMS 3,240/1,864/254, 기존 활성 common 누락 64/9/17, 후보 밖 활성 common 773/625/38, 코드 mismatch 모두 0이었다.
- 공식 KIS 마스터 full sync는 `reconciled=true`로 성공했다. common upsert 3,240/1,864/254, 특수 instrument upsert 2,032/975/4,526, 기존 후보 외 활성 common 비활성화 773/625/38이다. 모든 변화는 하나의 transaction에서 검증 후 commit됐고, 148개 KIS 미수록 행도 삭제하지 않고 fail-closed 비활성화했다.
- 분리된 관리자 GET은 활성 common 3,240/1,864/254, 분류 1,354/1,186/94, 미분류 1,886/678/160을 반환했다. 새 원본을 올린 read-only audit에서 매칭 3,240/1,864/254, 누락 0, 후보 밖 활성 common 0, 코드 mismatch 0, `databaseWritePerformed=false`를 재확인했다.
- 따라서 “모든 KIS 확인 보통주 행이 DB에 저장됐는가”는 YES다. “모든 종목에 유효 섹터가 있는가”는 NO: 유효 코드는 2,634/5,358이며, 나머지 2,724개는 KIS 공식 원본 자체가 `000`으로 미분류한다. 임의로 값을 보정하지 않았다.
## [2026-10-25] SEC EDGAR SIC 결측 산업코드 보완 경로

### 목표
- KIS US 산업코드가 비었거나 all-zero인 활성 미국 COMMON_STOCK에 한해 SEC 공식 EDGAR SIC를 보조 저장하고 운영 API read-after-write로 확인한다.

### 근본 원인
- KIS 종목 마스터의 `icod=000`은 공식 미분류 값이므로 해당 종목의 산업 분류 정보를 제공하지 않는다. KIS 코드와 SEC SIC는 별개 taxonomy라 원천을 구별하지 않으면 값의 의미를 오인할 수 있다.

### 반영
- `app/api/admin/us-sec-sic-industry/route.ts`: 관리자 전용 진단 GET 및 최대 50개 커서형 SEC SIC 적재 POST를 추가한다. SEC 공식 ticker/exchange CIK 맵 및 Submissions API만 호출하고 활성/엄격한 COMMON_STOCK 조건과 유일 매핑·유효 SIC를 만족하는 결측만 기록한다. UPDATE RETURNING으로 저장 결과를 검증한다.
- `lib/us-industry-code-sync.ts`: 원본 KIS `000` 재동기화가 기존 SEC SIC를 지우지 않게 하고 감사 비교를 보완한다.
- `app/api/admin/us-sec-sic-industry/route.test.ts`, `lib/us-industry-code-sync.test.ts`: 관리자 제한, 배치 크기, SEC 조회·저장 readback, KIS 재동기화 보존을 검사한다.
- `docs/architecture/us-industry-classification-data-design.md`: 출처 우선순위, fail-closed 규칙 및 운영 API를 기록한다.

### 검증
- 구현 검증: 타깃 3개 테스트 파일 13개 통과, 전체 298개 테스트 파일 1,455개 테스트 통과(3 skipped), typecheck/docs check/build 및 로컬 standalone API 인증 smoke 통과.
- SEC 공식 문서와 실시간 API의 ticker-map/Submissions 응답을 확인했다. 운영 적재 및 production GET 대조 결과는 배포 후 추가 기록한다.

### 남은 위험 및 다음 단계
- SEC ticker map에서 유일하게 연결되지 않거나 SIC가 제공되지 않는 회사는 미분류로 남는다. SEC SIC는 KIS ICOD와 taxonomy가 달라 출처를 함께 읽어야 한다.
- fast-forward 배포 후 관리자 운영 API로 전체 cursor 배치를 실행하고, API GET에서 저장 수와 잔여 미분류를 다시 확인한다.

### 커밋·푸시·배포
- 아직 실행하지 않음. 검증 완료 후 상세 한국어 커밋과 `oci` fast-forward 배포 예정.
## [2026-10-25] RSS 번역 검증 실패 후보 운영 진단

### 목표 및 범위
- 운영 `market-rss` 실행에서 Azure 번역은 성공하지만 숫자 검증 단계에서 제목이 전량 fallback되는 현상을 판별하기 위해, 이미 관리자 세션 또는 cron secret 인증을 요구하는 `/api/admin/debug-suite?checks=rss` 응답에 최근 실패 번역 후보를 제한적으로 포함한다.

### 변경
- `app/api/admin/debug-suite/route.ts`: 세 RSS 허용 출처의 `translation_numeric_hallucination`, `translation_output_incomplete`, `target_language_not_detected` 실패 중 번역 후보가 저장된 최신 행 최대 20건을 조회한다. 원문/후보 제목을 각각 500자로 제한하고 제어문자를 정리한다. 공개 번역 상태 API는 수정하지 않는다.
- `app/api/admin/debug-suite/route.test.ts`: 관리자 인증 차단, 범위·limit, 응답 제목 정리 테스트를 추가했다.

### 검증 및 배포 상태
- 대상 테스트 `npm.cmd test -- --run app/api/admin/debug-suite/route.test.ts`: 2개 통과.
- `npm.cmd run deploy:verify`: 통과(의존성 audit, production build, standalone runtime/browser smoke, 테스트 파일 298 통과/1 skip, 테스트 1,453 통과/3 skip, typecheck, docs/migration, auth/KIS/cron 검증). Windows standalone trace에서 node_modules junction symlink `EPERM` 경고가 있었지만 빌드와 standalone 검증은 성공했다.
- 진단 API는 commit `11acb396`로 `oci`에 푸시했고 Deploy OCI run `40164594617` 성공을 확인했다. 운영 인증 GET에서 최근 20건을 읽었으며 SEC `8-K - …` 제목의 보호 숫자 뒤 하이픈이 숫자 오탐의 원인임을 확인했다.

## [2026-10-25] RSS SEC 문서명 대시 번역 오탐 수정

### 원인과 영향
- SEC EDGAR의 `8-K - …` 제목에서 `8`은 금융 숫자 보호 토큰 `ZX…Q`로 바뀐다. 숫자 검증기가 토큰 바로 뒤에 원문에도 존재하는 `-`를 추가 금융 부호로 간주해 정상 번역까지 `translation_numeric_hallucination`으로 fallback했다.
- 운영 후보 제목 20건을 인증 진단 API에서 확인했다. 다수는 `8-K - …`였고 후보 번역은 accession/서식 숫자를 보존한 한국어 제목이었다. 운영 최근 실행은 20건 시도 중 성공 0, fallback 20, 알림 전송 0으로 backlog가 누적되고 있었다.

### 수정 및 재발 방지
- `lib/translate-market-rss-item.ts`: 보호 토큰 주변 부호를 검사할 때 provider 결과와 보호된 원문 제목의 같은 토큰 주변 문자를 대조한다. 원문에 이미 존재하는 하이픈은 허용하고 새로 추가된 +/- 계열 부호는 계속 거부한다.
- `lib/translate-market-rss-item.test.ts`: `8-K - …` 및 `4 - …` 문서명 구분 대시를 통과시키고 기존 가짜 부호 차단 테스트를 유지한다. 숫자 hallucination 자체를 무조건 허용하지 않는다.
- 범위 원칙: provider 입력은 RSS 제목만 사용한다. `summary`와 기사 본문은 계속 원문 그대로 반환하며, Discord 알림 gate는 검증된 한국어 제목이나 이미 한국어인 제목만 통과시킨다.

### 검증 및 배포 상태
- 타깃 번역 테스트 77개 통과. 전체 `deploy:verify`, commit, push, production 배포는 아직이며, 운영 수신 확인 후 결과를 추가 기록한다.
- 과거 대기 큐는 oldest-first로 처리하고 한 cron 실행에서 번역 20건/전송 20건으로 제한되어 있다. 전체 운영 backlog 수량과 정상화 처리량은 수정 배포 후 계속 측정한다.
- 번역 수정은 `1ea0f512`로 `oci`에 푸시했고, 최신 후속 HEAD `33bfcf94`의 Deploy OCI run에서 production 활성화까지 확인했다. 이후 운영 실행에서 번역 성공·Discord HTTP 전송 성공이 함께 발생했다. 이어서 세 출처별 상태와 전체 과거 backlog 추이를 인증 진단 API로 확인할 수 있도록 집계를 추가한다.
- `/api/admin/debug-suite?checks=rss`에 세 출처별 전체 행 수, 번역 상태, 발송 대기·완료·실패·진행 상태 집계를 추가했다. 대상/limit이 고정된 SELECT 집계이며 RSS 진단 API의 기존 관리자/cron 인증을 유지한다. 타깃 테스트 79개와 전체 배포 검증을 통과했다.

## [2026-10-25] SEC SIC 보완 적재 및 거래소 코드 차이 대응

### 목표와 범위
- 운영 활성 미국 COMMON_STOCK 중 KIS 산업코드 결측 2,724개를 SEC EDGAR SIC로 보완하고 운영 API GET으로 DB 저장 상태를 재조회한다.

### 운영 처리 및 관찰
- 2026-10-25 UTC: 배포 run `40163642899` 성공 후 SEC 관리자 GET으로 초기 상태 확인: eligible 5,358개, KIS 유효 코드 2,634개, SEC SIC 0개, 미분류 2,724개(AMS 160, NAS 1,886, NYS 678).
- 첫 운영 적재 API는 환경변수 `SEC_USER_AGENT` 누락으로 503 fail-closed. 프로젝트 공식 SEC 참조문서와 `.env.example`의 서비스 식별자 기본값 적용 후 배포.
- 기본값 배포 API 기준 55개 cursor batch에서 대상 2,724개 중 2,495개 SEC SIC 저장, 229개 미해결(티커 미매핑 196, SEC SIC 미제공 33; 사전 1개 시험 포함). 각 저장은 API 트랜잭션 `UPDATE RETURNING`과 read-after-write 검증을 통과.
- 운영 GET 재조회: SEC SIC 2,495개(AMS 0, NAS 1,853, NYS 642), 잔여 미분류 229개(AMS 160, NAS 33, NYS 36). 표본 코드와 `SEC_EDGAR_SIC:<CIK>` 출처 확인.
- SEC 공식 `company_tickers_exchange.json` 대조 결과 일부 AMS universe ticker(예: ACCS)가 SEC 맵에는 NYSE로 표시되어 시장별 매핑에서 누락되는 거래소 코드 차이를 발견. 이를 개선하기 위해 동일 ticker가 공식 미국 거래소 전체에서 단일 CIK로만 확인되는 경우에 한해 교차거래소 fallback을 추가한다. 다중 CIK는 계속 제외한다. 최종 재적재 및 DB 재조회는 이 변경 배포 후 수행한다.

### 검증과 변경 이력
- 초기 코드: `8257dd98`; SEC 기본 User-Agent 수정: `c89323e7`; 현재 교차거래소 fallback 변경은 전체 `deploy:verify` 통과 후 커밋 예정.
- 전체 299개 테스트 파일 1,459 tests 통과(3 skipped), build, standalone 실행 스모크/desktop·mobile hydration, typecheck, docs, verify-scope, KIS boundary, bearer auth, cron check 통과.
- 운영 DB는 운영 관리자 API만 사용했다. 직접 DB 연결 또는 쿼리는 하지 않았다.

### 남은 위험 및 다음 단계
- 미해결 SEC ticker 또는 SIC가 남을 수 있다. 모든 코드는 SEC 원천의 SIC taxonomy이고 KIS ICOD와 의미 체계가 다르며 source_file로 구분한다.
- 거래소 코드 fallback 변경을 `oci`에 배포한 뒤 잔여 대상에 다시 적용하고, 최종 시장별 API GET read-after-write 통계를 기록한다.

### 최종 적재 결과 (2026-10-25 UTC)
- 교차거래소 fallback 포함 Deploy OCI run `40165825019` 성공. SEC SIC API 배치 재처리 후 관리자 GET에서 활성 COMMON_STOCK 5,358개를 재집계했다: 기존 KIS 유효 ICOD 2,634개, SEC SIC fallback 2,644개, 미분류 80개.
- 시장별 GET 결과: AMS 254개 중 KIS 94 / SEC 149 / 미분류 11; NAS 3,240개 중 KIS 1,354 / SEC 1,853 / 미분류 33; NYS 1,864개 중 KIS 1,186 / SEC 642 / 미분류 36.
- 독립 SEC API GET의 저장 샘플에서 AMS `ACCS` SIC `8742`, 출처 `SEC_EDGAR_SIC:0000843006` 등 실제 저장값을 확인했다. 저장값은 SEC SIC이며 KIS ICOD와 동일한 taxonomy로 해석하지 않는다.
- 잔여 80개를 운영 API로 모두 재조회: SEC ticker/CIK 매핑 부재 47개(AMS 11, NAS 20, NYS 16), SEC Submissions SIC 미제공 33개(NAS 13, NYS 20). 해당 80개는 SEC 공식 소스에 유일한 CIK 또는 SIC가 없어 fail-closed로 그대로 미분류다.
- 운영 DB 직접 조회 없이 관리자 로그인 API와 `/api/admin/us-sec-sic-industry` POST/GET만 사용했다. POST는 배치 트랜잭션의 `UPDATE RETURNING` 검증을 수행했고 최종 GET의 시장별 수치와 SEC 출처 샘플로 read-after-write를 독립 확인했다.

### 완료 판정 및 후속
- SEC 공식 원천에서 ticker/CIK/SIC가 확인되는 활성 보통주 결측은 모두 저장했다. 남은 80개는 SEC ticker 맵/회사 Submissions에서 필요한 식별정보가 제공되지 않아 SEC만으로 채울 수 없다. 종목명 추정이나 다른 분류 taxonomy의 임의 대입은 하지 않는다.
- 재발 방지: SEC ticker map의 시장 코드 차이를 허용하되 ticker가 미국 거래소 전체에서 단일 CIK로 유일할 때만 fallback을 허용하며, 모호한 ticker·무 SIC는 fail-closed로 처리한다.
- 배포 커밋: `33bfcf94`; 해당 코드 전체 `deploy:verify` 및 교차거래소 타깃 테스트 통과. 운영 기록 커밋은 별도 생성 예정.
## [2026-10-25] RSS 알림 제목 전용 한국어 및 전체 출처 backlog 진행

### 목표
- SEC EDGAR, StockTitan, GlobeNewswire의 모든 RSS 기사를 필터링 없이 Discord 알림 대상으로 유지하고, 알림 전 제목만 한국어로 확정한다. 요약·본문 등 나머지 기사 텍스트는 번역하거나 알림에 복제하지 않는다.
- 사용자가 승인한 과거 대기 기사도 같은 규칙으로 발송한다.

### 근본 원인
- SEC의 고정 EDGAR 색인 제목은 번역 provider가 제출자 표기만 어설프게 번역하거나 회사명을 그대로 돌려 completeness 검사에서 반복 보류될 수 있었다.
- 전역 오래된 순 정렬은 SEC의 큰 과거 대기열이 적은 GlobeNewswire 대기 항목을 뒤로 밀었다.
- Discord 메시지는 번역 제목 외에 원문 제목도 함께 출력했다.

### 반영
- `lib/market-rss-sec-filing-title.ts`, `lib/translate-market-rss-item.ts`: SEC의 엄격히 정형화된 `<form> - <issuer> (<10-digit CIK>) (Filer|Issuer)` 제목에 한해서만 `공시`, `제출자`/`발행인`을 한국어화한다. Form·법인명·CIK는 식별 정보로 보존하고 provider 호출을 하지 않는다. summary/content는 원문 값 그대로 유지한다.
- 운영 실패 표본에서 추가 확인된 Form 4 `(Reporting)` 표기도 고정 역할어 `보고자`로 처리한다. 이름과 CIK는 보존한다.
- `lib/market-rss-pipeline.ts`, `lib/market-rss-source-fairness.ts`: 번역·발송 각각 출처별 oldest-first 큐를 읽고 라운드로빈으로 합쳐 세 출처가 backlog를 함께 소진하게 한다.
- `lib/market-rss-notification-message.ts`: 원문 제목 행을 제거해 알림에는 제목 하나만 표시한다. 출처·시각·티커 등 메타데이터는 기존 형식을 유지한다.
- `app/api/admin/debug-suite/route.ts`: source별 번역 및 전송 상태에 기타/보류/불확실 상태 카운트를 추가해 운영 backlog 합계를 점검할 수 있게 한다.
- 대응 테스트를 SEC 전용 현지화, 다른 출처 격리, 원문 제목 미노출, 운영 진단 합계에 추가한다.

### 검증
- 최초 변경 검증: 관련 103개 회귀 테스트, build, 전체 300개 테스트 파일(1,463 pass/3 skip), typecheck, docs/migration, audits, OCI cron, standalone/runtime·Chrome hydration 통과. 운영 로그에서 Form 4의 `Reporting` 역할 표기를 추가 확인해 보완했다.
- Form 4 보완 검증: 번역 테스트 80개 통과, 전체 300개 테스트 파일(1,464 pass/3 skip), build, typecheck, docs/migration, audits, OCI cron, standalone/runtime·Chrome hydration 통과.
- Actions `40168335426`으로 `7b8d7b79` 배포 성공, 이어 Actions `40168933268`로 `84a418fa` 배포 성공.
- 운영 진단(2026-10-25 06:30Z): GlobeNewswire 19/22 발송, 3건 한국어 번역 재시도 대기; SEC 992/9,005 발송 및 8,012 대기; StockTitan 17,108/20,410 발송 및 3,300 대기. 최근 cron에서 세 출처 처리 중이며 배치별 번역·발송이 증가한다. 이 시점에는 과거 대기 전체 소진은 미완료이므로 완료로 간주하지 않는다.

### 남은 위험
- provider가 일반 기사 제목의 한국어 번역을 완성하지 못하면 fail-closed로 보류되므로 번역 장애가 이어지는 동안 전체 backlog 발송은 지연된다. 원문 우회 발송은 허용하지 않는다.

### 개선 과제
- 개선 과제 ID: RSS-2026-10-25-TITLE-ONLY-ALL-SOURCES
- 성과 판정: IN_PROGRESS
- 다음 개선: 세 출처가 번역·발송 모두 진행하는지 운영 계측하고, backlog 전량 완료를 확인한다.

### 커밋·푸시·배포
- 커밋 `7b8d7b79`, `84a418fa`를 순차 푸시했고 두 배포 모두 성공했다. 과거 대기 전량 발송은 계속 진행 중이다.
## [2026-10-25] RSS 번역 오탐과 SEC 표준 제목 backlog 직접 처리

### 목적 및 관찰
- 사용자는 SEC EDGAR·StockTitan·GlobeNewswire의 기사 전체를 Discord로 발송하되 제목만 한국어 번역하기를 요청했다. 2026-10-25 운영 집계에서 pending 기사가 남아 있고, 실패 후보는 `METALS`, `FILES`, `REPORT` 같은 all-caps 일반 영어 단어를 보호 토큰으로 오인해 번역 입력에서 빠지는 점을 확인했다.
- SEC Form 4 `Reporting` 표준 제목도 provider 재시도 대기 횟수·오래된 queue 위치에 따라 수분 이상 untranslated로 남을 수 있었다.

### 변경
- `lib/market-rss-translation-tokens.mjs`: RSS all-caps 제목에서 자주 쓰는 영어 동사·명사·시점 표현을 번역 입력에 남긴다. 단, `| ZIP Stock News` 같이 영어 단어와 같은 철자의 ticker 접미 및 괄호 속 symbol은 계속 보호한다.
- `lib/market-rss-pipeline.ts`, `lib/market-rss-sec-filing-localization.ts`: SEC EDGAR의 엄격한 표준 form/CIK/role 제목을 provider와 독립적으로 선별해 매 실행 최대 1,000건 한국어 제목화한다. `translatedSummary`와 `translatedContent`는 각 행의 원문 summary/content를 그대로 저장하고 알림 전송 게이트를 통과시킨다. 비표준 제목은 자동 추정하지 않는다.
- `app/api/admin/debug-suite/route.ts`: source별 `deterministic_localized` 집계를 추가해 운영에서 직접 현지화 증가 여부를 확인한다.
- `lib/translate-market-rss-item.test.ts`, `lib/market-rss-translation-protection.test.ts`, `lib/market-rss-sec-filing-localization.test.ts`, 관리자 진단 테스트: 운영 실패 표본, ticker 충돌, SEC Form 4 역할, 제목 외 필드 보존을 검증한다.

### 검증
- 관련 회귀 테스트 126개 통과, `npm.cmd run typecheck -- --tsBuildInfoFile .next-deploy-verify/tsconfig.tsbuildinfo` 통과.
- 전체 `npm.cmd run deploy:verify` 통과(302개 파일 중 301개 통과·1개 skip, 테스트 1,476개 통과·3개 skip). 커밋 `3069a4b4`를 `origin/oci`에 push했고 GitHub Actions 배포 run `40170644179` 성공 후 운영 `/health-check`에서 SHA 일치를 확인했다.
- 인증된 read-only `GET /api/admin/debug-suite?checks=rss`에서 06:57Z 대비 06:59Z 사이 SEC `deterministic_localized`가 2,000→3,000, `translation_pending` 5,430→4,420, `notification_pending` 7,744→7,732로 변했고 실제 `notified.sent=20` run이 반복 확인됐다. StockTitan `notification_pending`도 3,206→3,198로 줄었다. 새 SEC direct-localization과 기존 대기 알림 경로가 운영에서 실행 중이다.
- 최신 run은 `attempted=1,020`(직접 현지화 1,000 + provider 20), `translated=1,018`, `fallback=2`였다. 실패 상태는 전송 게이트를 통과하지 않아 무번역 원문 발송은 관찰되지 않았다. 단, GlobeNewswire는 총 22건 중 19건 SENT·3건 translation SKIPPED로 남고, SEC notification pending 7,732건과 StockTitan 3,198건이 남아 전체 과거 대기 발송은 미완료다.
- 운영 실패 표본에서 StockTitan 숫자 검증 오탐(`4분기`/날짜 숫자, SEC form `6-K`)과 보호 토큰 불일치가 계속 나타나 provider 번역 품질은 완벽하다고 볼 수 없다. 후속 수정과 운영 재검증 전에는 완료로 판정하지 않는다.
- **후속 원인 수정**: 실제 실패 제목 `J-Star Holding ... Form 6-K`에서 보호 규칙이 문자로 시작하는 표기만 처리해 숫자로 시작하는 SEC 양식 코드 `6-K`를 독립 숫자처럼 provider에 노출했다. `6-K`/`8-K`/`10-Q`/`20-F` 계열과 S/F form, 424B 표기를 하나의 보호 토큰으로 보존하도록 수정하고, `1-for-4` 역분할 표기와 충돌하지 않는 테스트를 추가했다. 제목 번역 경로 fixture도 `6-K` 복원과 summary 원문 미변경을 검증한다.
- 후속 회귀 128건 통과. 전체 `npm.cmd run deploy:verify` 재실행: 302개 테스트 파일 중 301개 통과·1개 skip, 1,485개 통과·3개 skip; 프로덕션 build, typecheck, standalone runtime/Chrome desktop·mobile hydration, 문서·migration·보안·cron 게이트 통과. Windows standalone 빌드의 기존 node_modules symlink `EPERM` 경고는 있었지만 검증 runner가 fallback 처리 후 성공했다.
- `6595345c` OCI 배포 후 새 RSS cron 실행이 `Form 6-K` 후보를 또 `translation_numeric_hallucination`으로 보류했다. 동일한 입력·표시된 한국어 후보를 현행 번역 검증기로 재생한 회귀 테스트는 통과했지만 운영 DB에는 거부된 숫자·부호 값이 남지 않아 실행 간 판정 차이를 설명할 증거가 부족했다.
- **후속 진단 보강**: 숫자 품질 gate가 거부한 unprotected 숫자 최대 10개, 금융 부호 불일치 여부, 부호 숫자 여부를 `translation_error`에 코드형 진단으로 기록하고 관리자 RSS 실패 표본 응답에만 반환하도록 했다. 원문/요약/본문이나 공급자 응답 원문은 추가 저장하지 않는다. 운영 후속 시 실제 숫자 검출과 표시 후보 간 불일치를 직접 구분한다.
- 진단 변경 `80c4e48e` 배포 및 `/health-check` SHA 확인 후 완전한 신규 cron 실행에서 숫자 검출 원인을 확인했다: `Half a Kilometre`→`0.5`를 `0`,`5`로 분리, 제목 구분 dash 뒤 `July`→`7`을 음수로 오인, 프랑스어 `deuxième`→`2`를 허용하지 못했다. 각각 decimal parsing/`half=0.5`, 공백 dash를 금융부호로 판정하지 않기, 프랑스어 수사·월 이름 허용으로 수정했다.
- 실 운영 `07:29:07Z` 집계는 SEC sent 1,593 / notification pending 7,411, StockTitan sent 17,449 / notification pending 2,959, GlobeNewswire sent 19 / pending 3이었다. 07:28:36Z run은 notification 20건을 보냈지만 번역 20건 중 fallback 16건(보호 토큰 불일치 12 포함)으로 아직 번역 품질은 미완료다.
- 숫자 검증 진단 및 세 실표본 회귀 145건 통과. 첫 전체 빌드는 수사 map의 영어·프랑스어 중복 키(second/six/seven)를 검출해 실패했고, 중복을 제거했다. 재실행한 전체 `npm.cmd run deploy:verify` 통과: 302개 테스트 파일 중 301개 통과·1개 skip, 1,488개 통과·3개 skip; build/typecheck/standalone·Chrome/runtime smoke/docs·migration/security/cron gate 모두 통과.
- `c37cfdea` 배포 후에도 공급자 marker 변형이 주요 폴백 사유로 남아, 다음 변경에서는 expected/returned marker의 누락·중복·예상 외 index만 기록한다. marker 원문 값이나 기사 본문은 저장하지 않아 토큰 변형 양상을 확인한다.
- token-index diagnostics 관련 103개 테스트와 전체 `npm.cmd run deploy:verify` 통과(302개 파일 중 301 pass·1 skip, tests 1,488 pass·3 skip; build, typecheck, standalone·Chrome smoke, docs/migration/security/cron gates 포함).
- `4f3919a0` 배포 후 운영 run에서 translation fallback 19/20, protected-token mismatch 14건을 확인하고, 숫자 진단은 `Aug.`→8월, `Once-Weekly`→1회, 무번호 `Quarter`를 provider가 `4분기`로 확장한 사례를 확인했다. 월 약어 및 once/twice/thrice를 허용하고, 원문에 분기 번호가 없을 때만 번역 후보에서 삽입 숫자 `n분기`를 제거하는 수정과 세 실표본 회귀를 추가했다.
- 위 표본 수정의 관련 회귀 92건 통과. 전체 `npm.cmd run deploy:verify` 통과: 302개 파일 중 301개 통과·1개 skip, 1,491개 테스트 통과·3개 skip; build/typecheck/standalone·Chrome smoke/docs·migration/security/cron gates 통과.
- 사용자가 번역 범위를 제목으로만 제한하라고 재확인했다. `translateMarketRssItem`은 provider에 `prepareMarketRssTranslationInput(item.title)` 결과만 전달하며 summary/content는 원문 그대로 반환하고, Discord 본문은 번역 제목만 사용한다. `buildMarketRssNotificationTranslationGate`는 `TRANSLATED` 또는 원래 한국어(`already_in_target_language`)만 허용한다. 최근 run의 translation fallback 20건과 notification sent 20건을 같은 기사 묶음으로 간주해 무번역 전송으로 단정한 설명은 잘못된 해석이었다. 운영 전송 게이트와 코드 경로상 fallback 행은 전송 후보가 아니다.
- 실패 표본 조회를 실제 `translation_attempted_at` 내림차순으로 정렬하고 token mismatch처럼 번역 후보가 비어 있을 수 있는 오류도 포함하도록 진단을 보완했다. 기존 `updated_at`은 RSS 재수집 upsert에 따라 갱신돼 실제 시도 시각을 나타내지 못했다. 관리자 진단 및 제목 번역·Discord 전송 게이트 테스트 97개 통과. 전체 verify와 이 진단 변경의 배포는 아직 수행 전이다.
- 배포한 번역 시각 진단에서 `protected_token_mismatch`가 지속됨을 확인했다. 상위 실패 기사들은 숫자·티커 토큰 marker가 Azure 응답에서 누락 또는 중복된 상태였고, plain-text marker 표현은 provider가 보존하지 못했다.
- 제목 내 보호 토큰을 provider 입력 HTML의 `<span class="notranslate" translate="no">…</span>`로 감싸고 HTML 번역 형식으로 전송한다. Azure 공식 문서는 `textType=html`일 때 `translate="no"`/`notranslate` 지정 구간은 번역하지 않는다고 명시하며, Google Cloud 공식 문서는 선택적 제외 표기를 Advanced HTML 입력에서 지원하고 Basic v2는 HTML 형식을 지원한다. 현재 Google fallback은 Basic v2이므로 그 API의 selective no-translate 동작은 공식 근거가 확인되지 않았다. 이 경우에도 token/품질 검증에서 빠진 값은 fail-closed되고 무번역 전송 게이트는 통과하지 않는다.
- HTML 본문에서 제목 단락 하나만 파싱할 수 있도록 추출기를 보완하고, 번역 품질·언어 감지는 HTML 마크업이 아닌 보호된 제목 텍스트로 판정한다. provider HTML을 디코딩한 뒤 원래 숫자/티커를 복원해 locale 공백과 currency 값이 엔티티 정규화로 바뀌지 않게 한다. 기존 summary/content 원문 유지 및 제목 외 미전송 규칙은 유지한다.
- 번역기, 보호 토큰, Azure/Google 요청 형식 통합 회귀 159개 통과. 전체 `npm.cmd run deploy:verify` 통과: 302개 파일 중 301개 통과·1개 skip, 테스트 1,493개 통과·3개 skip; build/typecheck, standalone·Chrome desktop/mobile, docs/migration, scope/KIS/auth/OCI cron 검증 통과. 기존 Windows standalone node_modules symlink `EPERM`은 검증 스크립트 fallback으로 처리되어 전체 gate는 통과했다. 배포 후 실제 run에서 토큰 mismatch 감소와 세 출처 backlog 변화를 확인한다.
- `e351cbd7` 배포 뒤 새 코드에서 시작된 완결 RSS cron run은 보호 토큰 오류 0건, 번역 20/20건, Discord 전송 20건으로 성공했다. 다음 run에서 HeartCore·Luvina·Vietnam·Software처럼 장문의 회사/파트너 고유명이 그대로 남은 채 주요 문구가 한국어인 후보가 `target_language_not_detected`로 보류된 것을 확인했다.
- Korean 비율 판정의 하한을 25%에서 18%로 조정해 이 실제 표본처럼 복수의 긴 고유명사로 전체 문자 수가 증가한 제목을 허용하되, 완전한 영어 및 짧은 한국어 한 조각만 포함한 제목을 거부하는 회귀를 유지했다. 관련 품질·제목 번역 테스트 103개 통과. 전체 `npm.cmd run deploy:verify` 통과: 302개 파일 중 301개 통과·1개 skip, 테스트 1,494개 통과·3개 skip; build/typecheck, standalone·Chrome desktop/mobile, docs/migration, scope/KIS/auth/OCI cron 검증 통과. Windows standalone symlink 경고는 verify fallback으로 처리됐다. 새 배포 후 해당 기사 재시도 성공, GlobeNewswire 완전 발송, SEC/StockTitan 과거 backlog 지속 진행 여부를 확인한다.
- 마지막 운영 관찰에서 출처 연도 `2026`과 `Hottest`처럼 의미상 연도를 표시하는 경우가 숫자 오탐으로 막히는 표본을 추가 확인했다. 원문에 있는 19xx/20xx 연도만 후보 내 같은 연도 숫자로 허용하고, 별도 시험 제목을 추가했다. 제목 번역·품질 회귀 106개 통과. 전체 `npm.cmd run deploy:verify` 통과: 302개 파일 중 301개 통과·1개 skip, 테스트 1,497개 통과·3개 skip; build/typecheck, standalone·Chrome desktop/mobile, docs/migration, scope/KIS/auth/OCI cron 검증 통과. standalone node_modules symlink EPERM은 기존 fallback으로 처리됐다. 수정은 커밋·배포 전이며 운영 확인도 미완료다.
- 변경은 `57ae0c35`로 커밋하고 `origin/oci`에 push했다. push 전 전체 필수 검증은 통과했고 worktree는 clean이다. 배포 확인 시점 `/health-check`는 계속 `7ce999eb`를 보고해 새 SHA 배포 및 새 코드 회차는 확인되지 않았다. 구버전 운영 회차에서 20건 중 17~20건 번역 완료, 0~3건 numeric false positive, Discord 20건 발송을 관찰했으나 두 집계는 동일 기사 집합을 뜻하지 않는다. 새 코드 운영 검증은 보류 상태다.
- 후속 Actions 실행 `40179271384`가 성공하고 `/health-check`에서 `fdb0e367`을 확인했다. 새 운영 진단에서 번역 후보 `Top Spot`→`1위`가 source-supported number 검사에서 `unprotected=1`로 보류됨을 확인했다. 원문에 `top spot`이 있을 때에만 후보의 `1위`를 허용하도록 제한하고, `28th Annual`→`28제1회` 후보는 원문 회차 숫자를 `제28회`로 재배치하는 정규화를 추가했다. 두 실표본 회귀를 포함한 제목 번역/품질 테스트 107개 통과. 전체 `npm.cmd run deploy:verify`도 통과: 302개 테스트 파일 중 301개 통과·1개 skip, 테스트 1,498개 통과·3개 skip; build/typecheck, standalone·Chrome desktop/mobile, docs/migration, scope/KIS/auth/OCI cron 검증 통과. 새 보완은 다음 배포와 운영 확인 대기 중이다.
- `ffdef70d` Actions `40180016959`의 원격 deploy verification 및 activation 성공과 `/health-check` SHA를 확인했다. 새 버전이 가동된 뒤 기사 배치 20/20 번역, 20건 알림 회차가 관찰됐다. activation 경계의 실패 표본 `PD-L1-Positive`가 provider 응답에서 `PD-L -1`로 분리되어 금융 부호 오탐이 발생한 것을 확인해 `PD-L<n>` biomarker 코드를 보호 토큰으로 추가했다. mock provider가 해당 토큰을 원형 복원하고 요약은 그대로인 회귀를 추가했으며 제목 번역/품질 회귀 108개 통과. 전체 `npm.cmd run deploy:verify` 통과: 302개 테스트 파일 중 301개 통과·1개 skip, 테스트 1,499개 통과·3개 skip; build/typecheck, standalone·Chrome desktop/mobile, docs/migration, scope/KIS/auth/OCI cron 검증 통과. 다음 OCI 배포와 실제 표본 재검증 대기 중이다.
- `ffdef70d` 실행 중 자동 재시도된 `28th Annual ... on September 15th`가 `28`과 `9월`을 붙이고 `제1회`를 행사명에 덧붙이는 별도 provider 출력 변형을 확인했다. 연례 글로벌 투자 컨퍼런스에 원문 회차를 `제28회`로 옮기고, 출처 월/일을 유지하도록 정규화를 확장했으며 실제 제목형 회귀를 유지했다. 전체 `npm.cmd run deploy:verify` 통과: 302개 테스트 파일 중 301개 통과·1개 skip, 테스트 1,499개 통과·3개 skip; build/typecheck, standalone·Chrome desktop/mobile, docs/migration, scope/KIS/auth/OCI cron 검증 통과. `PD-L1` 보호 토큰 변경의 push 이후 실제 배포 workflow 상태를 확인할 예정이며, 이번 날짜/회차 보완은 추가 배포 대기다.
- OCI runtime은 `6ae771e9`를 반환한다. 그 이후 완료 회차는 번역 20/20, 알림 발송 20건이 관찰됐다. 직전 재시도 실패 상위 표본에서 28th-Annual 및 PD-L1 기사가 더 이상 나타나지 않았지만, 기사별 최종 상태를 직접 조회한 것은 아니므로 개별 해결 증거로 단정하지 않는다. 2026-10-25 09:44Z source별 상태는 GlobeNewswire 25/25 SENT, SEC 번역됨 8,692·번역 skip 238·기타 75·알림 pending 5,940·uncertain 3, StockTitan 번역됨 7,490·pending 2,185·failed 362·skipped 10,135·기타 243·알림 pending 2,297·uncertain 2다. 상태 수가 변하고 있지만 미해결 번역 및 과거 알림 backlog가 남아 `IN_PROGRESS`를 유지한다.

### 남은 위험 및 후속
- 일반 뉴스 제목의 번역 provider가 all-caps가 아닌 문장에서도 의미 번역을 완성하지 못하면 품질 gate가 fail-closed로 보류한다. provider 결과를 검증 없이 통과시키지 않는다.
- `translation_pending`, `notification_pending`, 실패/불확실 상태를 source별로 계속 관찰하고 DB에 저장된 과거 대기량 소진 여부를 확인한다.
- 숫자 교정 후 `unprotected=0,5`, `signedNumeral=true`, `unprotected=2`, `unprotected=8`, source year `2026` 표본이 한국어 SENT 되는지 확인한다. marker-index 진단을 배포한 뒤 누락/중복/예상 외 유형에 맞게 provider 보호 표현을 개선한다.
- `6-K` 행의 진단은 배포 시각과 겹친 이전 실행 결과로 보이고 이후 실표본부터 진단 suffix가 기록됐다. 다음 재시도에서 실제 `6-K` 항목 진단과 상태를 확인한다.
- 개선 과제 ID: RSS-2026-10-25-TRANSLATION-QUALITY
- 성과 판정: IN_PROGRESS

### 커밋·푸시·배포
- 커밋 `3069a4b4`, `6595345c`, `80c4e48e`, `c37cfdea`, `4f3919a0` push 및 OCI 배포 완료. month/once/quarter 교정은 전체 검증 완료, commit/push/deploy 전이다. 번역 품질 오탐 개선과 전체 과거 대기 발송은 진행 중이다.
## [2026-10-25] RSS lifetime backlog 진단 집계 추가

### 목적 및 범위
- RSS 번역·Discord 전체 backlog를 기간 제한 없이 read-only로 집계한다. 공개 `GET /api/debug/market-rss-translations`에 허용 출처별 전체 기사·번역·알림 상태 aggregate를 추가했고 제목, 본문, 링크는 lifetime 응답에 포함하지 않는다.
- 변경 파일: `app/api/debug/market-rss-translations/route.ts`, 대응 route test, `docs/operations/market-rss-translation-debug-api.md`.

### 검증 및 상태
- route 테스트, 전체 deploy verification 및 배포 전.
- 운영 `.env.local`의 cron secret은 현재 작업본에 없어 이전 인증 관리자 endpoint를 조회할 수 없었다. 새 공개 진단 GET은 본인 증명 민감값을 노출하지 않으며 범위 상수로 제한되어 배포 후 전체 backlog 상태를 확인할 예정이다.
- 커밋·푸시·배포 안 함. RSS 목표는 `IN_PROGRESS`.

### 운영 관측 후속
- 새 API `lifetimeBySource`는 운영에서 정상 응답해 총 저장 행·번역·발송 집계를 제공했다. GlobeNewswire는 25/25 발송됐고, SEC는 5,700 notification pending·3 uncertain, StockTitan은 2,185 translation pending·328 failed·9,931 skipped 및 2,297 notification pending·2 uncertain이었다.
- SEC/StockTitan의 오래된 행 세부는 기존 720시간 상세 제한 때문에 확인되지 않는다. 전체 backlog 원인을 파악하도록 기사 내용/오류 메시지 대신 안전 whitelist reason-code count만 반환하는 `lifetimeSkippedReasonsBySource`를 추가한다. 검증·재배포 전.
- `d71e59e2`가 운영 활성화된 뒤 StockTitan의 9,606 skipped 중 8,281은 Google 내부 월 cap, 1,203은 Azure 월 cap, 40은 protected token mismatch, 81은 numeric hallucination, 1은 incomplete output이었다. Google cap 증액은 비용 크레딧의 billing account 공유 여부를 확인할 수 없어 사용자 선택을 기다린다. `SENT`와 translation status 불일치 여부도 전체 저장 행에서 검증할 수 있도록 `sent_without_validated_translation` 및 `sentGateViolationsBySource` aggregate를 추가했다. API 테스트 4건 및 전체 `npm.cmd run deploy:verify` 통과: 302개 테스트 파일 중 301개 통과·1개 skip, 1,499 tests 통과·3개 skip; build, typecheck, docs/migration, scope/KIS/auth/cron, standalone·Chrome desktop/mobile smoke 포함. 이제 커밋·푸시·배포 전.
- 후속 aggregate 결과: GlobeNewswire sent_without_validated_translation=0, SEC=313, StockTitan=9,795. Discord delivery queue schema에는 webhook message id가 없어 기존 message edit는 자동 복구 경로로 쓸 수 없다. 원인별 cross-tab sentGateViolationsBySource를 추가해 violation들의 현재 translation status/skip reason을 구분한다. 중복 재전송은 별도 authorization 없이 수행하지 않는다. 변경 및 전체 검증 완료, 다음 커밋·배포 대기.
- `sentGateViolationsBySource` 운영 분해에서 StockTitan 9,159 SENT 행의 현재 번역 상태는 `SKIPPED/monthly_character_limit_reached`, SEC는 238 동일 상태, 75 fallback/legacy, StockTitan 243 fallback/legacy·194 failed 등이었다. 지표는 전송 당시 상태가 아니라 현재 DB 상태를 비교한다. 코드 원인 검토에서 RSS upsert가 title뿐 아니라 summary 변경에도 번역 상태를 초기화하는 것을 발견했다. provider 입력은 title만이므로 summary 변동은 번역 무효화 사유가 아니다. title 변경 때만 번역 상태를 reset하도록 수정하고 회귀를 추가했다. targeted upsert test 3건 통과. 전체 `npm.cmd run deploy:verify` 통과: 302개 테스트 파일 중 301개 통과·1개 skip, 1,499 tests 통과·3개 skip; build, typecheck, docs/migration, scope/KIS/auth/cron, standalone·Chrome desktop/mobile smoke 포함. 이미 SENT된 행은 중복 재발송하지 않는다. 이제 커밋·푸시·배포 전.
## [2026-10-25] 과거 RSS 기사 번역 대기 조건 제거

### 목표
- 사용자가 승인한 세 출처의 전체 기사 알림과 과거 대기 기사 발송이 번역 선택 단계의 backlog 제외 조건에 막히지 않게 한다.

### 근본 원인 및 수정
- `buildMarketRssTranslationCandidateCondition()`이 재시도 가능 상태 외에 `notify_eligible=true`와 `is_backlog=false`를 요구했다. 이 때문에 과거 backlog 기사나 향후 분류상 알림 제외 상태인 피드 항목은 번역 단계에서 영구적으로 선택되지 않아, 번역 통과를 요구하는 Discord 게이트에도 도달하지 못할 수 있었다.
- `lib/market-rss-translation-retry.ts`에서 후보 조건을 재시도 상태로만 제한했다. provider 번역은 모든 적격 RSS 행에서 수행하고, Discord 발송은 별도 `TRANSLATED` 또는 이미 한국어인 제목 게이트로 계속 보호한다.
- `lib/market-rss-translation-retry.test.ts`가 backlog/notify eligibility 조건을 SQL에서 제외하는지 검사하도록 회귀를 변경했다.
- 운영 aggregate에서 `sent_without_validated_translation`은 SEC 313, StockTitan 9,335였고 이 legacy `SENT` 행도 monthly quota reset 후 번역 재시도 후보로 잡힐 수 있었다. 발송 결과가 이미 끝난 `SENT` 및 재전송을 피해야 하는 `UNCERTAIN` 행은 새 번역 후보에서 제외하고, `PENDING`/`FAILED`/`SKIPPED` 대기 행만 남기도록 후보를 추가 제한했다. `notify_eligible`과 backlog 상태에 따른 기사 필터는 유지하지 않았다.

### 검증
- `npm.cmd exec vitest run -- lib/market-rss-translation-retry.test.ts lib/market-rss-notification-translation-gate.test.ts --reporter=dot`: 2개 파일 15개 테스트 통과.
- 후보 SQL 회귀는 `notify_eligible`/`is_backlog` 필터가 없고 notification status는 `PENDING`, `FAILED`, `SKIPPED`로 제한됨을 확인한다. `SENT`와 `UNCERTAIN`은 quota를 쓰는 번역 대상에서 제외한다.
- 코드상 source queue는 `GLOBENEWSWIRE`, `STOCKTITAN`, `SEC_EDGAR` 각 하나씩 생성하고 공정 교차 선택한다. provider 결과 검증 실패 또는 quota fallback 제목은 Discord SQL gate가 전송하지 않는다.
- 운영 health endpoint는 2026-10-25 13:02Z HTTP 200/status `ok`를 반환했으나 배포 SHA는 노출하지 않는다. 현재 작업 환경에 GitHub CLI 및 운영 RSS 진단 토큰이 없어 이번 코드 버전 배포 완료와 최신 기사 번역 표본은 아직 검증하지 못했다.
- `npm.cmd run deploy:verify` 통과: 302개 test files(301 passed/1 skipped), 1,518 tests passed/3 skipped; dependency audit, build, standalone HTTP/browser smoke, typecheck, docs/migration, scope/KIS/auth/OCI cron gates 성공.
- 수정 push 후 운영 read-only aggregate `2026-10-25T13:12:19Z`: GlobeNewswire translation pending 0 / notification pending 4, SEC notification pending 2,301 / sent 6,701, StockTitan translation pending 23 / notification pending 2,298. 월간 quota skipped는 GlobeNewswire 4, SEC 238, StockTitan의 Google 7,714·Azure 1,203·provider 미상 2,368건이다. queue가 전부 해소됐다는 뜻은 아니다.
- 운영 read-only aggregate `2026-10-25T13:19:57Z`: GlobeNewswire translation pending 0 / notification pending 4, SEC notification pending 2,161 / sent 6,841, StockTitan translation pending 0 / notification pending 2,298. `13:20:20Z` 인증 GET quota snapshot은 Azure 1,899,962/1,900,000 reserved(38 remaining), Google 299,992/300,000(8 remaining)을 보고했다. `13:20:33Z`까지 13:05Z 이후 번역 성공 표본은 세 출처 모두 0건이다.
- 이후 `2026-10-25T13:24Z` 잠시 운영 `/api/health`와 RSS diagnostics가 HTTP 502를 반환했다. Actions run `40197455407`(HEAD `0372ad89`)은 조회 시점까지 Verify deployment에서 실행 중이었다. `/api/health`는 13:27Z와 13:29Z에 다시 `ok`를 반환했다. 13:27:26Z aggregate에서 SEC notification pending 2,021 / sent 6,981, StockTitan notification pending 2,298, GlobeNewswire notification pending 4; quota와 13:05Z 이후 provider 성공 표본은 변하지 않았다.
- 후속 코드 `5fc5a236`는 GitHub Actions run `40198529124`의 Verify, package, upload, activate 전 단계를 success로 완료했고 운영 `/api/health`는 13:44Z `ok`였다. 13:45:38Z read-only aggregate: SEC notification pending 1,739 / sent 7,262, StockTitan notification pending 2,298, GlobeNewswire notification pending 4; historical sent-without-validated-translation count는 SEC 313, StockTitan 9,335로 변하지 않았다. Azure/Google quota는 각각 38/8 characters remaining.
- 배포 후 13:44:54Z RSS cron 완료 요약은 translation attempted 0, notification sent 20, backlogRemaining true였다. 최근 13:05Z 이후 provider-success translation 표본은 여전히 0이므로 quota가 번역 성공을 다시 가능하게 했다는 증거는 없다.

### 재발 감지·남은 위험
- provider quota는 사실상 소진 상태이며 월 한도 증액은 사용자 승인을 기다린다. 월/일 quota가 소진되면 안전한 translation gate가 유지되므로 기사는 계속 대기할 수 있다. legacy SENT 행은 이미 전송되어 번역을 소급 보장할 수 없다.
- `df1056eb` run `40196217179` 및 코드 후속 `5fc5a236` run `40198529124`가 모두 success와 OCI activation을 완료했다. 실제 provider 성공 표본과 quota 대기분 처리는 남아 있다.

### 개선 과제
개선 과제 ID: CI-2026-10-25-019
성과 판정: PARTIAL
근거: 과거 기사 번역 선택에서 backlog/분류 제외를 제거하고 전체 검증을 통과했으나, 운영 배포·provider 결과 확인이 남았다.

### 커밋·푸시·배포
- 전체 검증 통과 후 코드 수정 `df1056eb`, `5fc5a236`와 운영 기록을 `oci`에 푸시했다. code deploy runs `40196217179`, `40198529124` 모두 success; 마지막 SHA는 앱 health endpoint에서 공개하지 않아 서버 실행 SHA 직접 대조는 미확인이다.

## [2026-10-25] RSS 제목 번역/전체 기사 경로 재검증

### 목표와 범위
- SEC EDGAR, StockTitan, GlobeNewswire 모든 기사의 제목만 한국어 번역한 뒤 Discord로 보내며, 카테고리/분류 필터 없이 과거 미발송 backlog도 포함한다.
- provider 월간 상한은 별도 사용자 승인 없이 변경하지 않는다.

### 확인 결과
- 최신 `origin/oci` 기준 `translateMarketRssItem()`이 `prepareMarketRssTranslationInput(item.title)`만 호출하고 결과 텍스트만 `translate(..., "auto", "ko")`에 전달한다. 제목 번역 회귀에는 summary/content를 provider input 및 번역 결과에서 배제하는 assertion이 있다.
- Discord 게이트는 검증된 `TRANSLATED` 또는 이미 한국어인 `SKIPPED/already_in_target_language`만 허용한다. source allowlist는 세 출처만 포함한다. retry/notify query에는 `notify_eligible`/`is_backlog` 필터가 없고 대기 과거 기사도 선택 대상이다.
- `npm.cmd exec vitest run -- lib/translate-market-rss-item.test.ts lib/market-rss-notification-translation-gate.test.ts lib/market-rss-notification-message.test.ts lib/market-rss-discord-policy.test.ts --reporter=dot`: 4개 파일, 101개 테스트 통과.
- retry 테스트를 포함해 실행했을 때 112개 통과, 1개 실패. 로컬 기본 checkout(`998fb369`)의 retry 테스트는 원격 최신 `origin/oci`(`e508541e`)의 `exhaustedFailureRetryBefore` 반환 필드를 기대하지 않으며, 기본 checkout은 원격보다 95커밋 뒤처지고 대규모 미커밋 변경이 있어 수정하거나 혼합 배포하지 않았다.
- isolated 최신 worktree에서 전체 `npm.cmd run deploy:verify`는 취약점 감사(0 vulnerabilities) 뒤 build에서 `next` 실행 파일을 찾지 못해 중단했다. `npm ci`는 Node 24 환경에서 두 번 정지/실패했고 의존성이 부분 설치되었다. 프로젝트 OCI CI는 Node 22를 사용한다.
- 운영 URL, DB 진단 토큰, cron 인증값이 현재 셸에 없어 운영 read-only 집계·실제 신규 provider 번역·Discord 수신을 이번 턴에는 확인하지 못했다. quota는 변경하거나 provider 진단 호출하지 않았다.

### 남은 위험과 다음 조치
- 월 한도 소진에 따라 DB backlog가 남아 있을 가능성이 크다. 새 provider 성공 표본과 backlog 0 확인 전에는 완료로 판정하지 않는다.
- 운영 호스트/진단 경로 및 Node 22 설치 실행 환경을 확보한 뒤 최신 OCI 운영 상태를 read-only 확인하고, 월 quota reset 후 세 출처별 제목 번역 표본과 Discord 수신을 관찰한다.
- 장애/실패 회차와 backlog 변화는 `/api/debug/market-rss-translations` 및 automation run summary로 감지한다.

### 커밋·푸시·배포
- 이 기록은 기본 checkout의 RSS 외 변경을 섞지 않기 위해 isolated 최신 worktree에만 남긴다. 테스트 외 provider API·Discord 전송 없음. 커밋·푸시·배포하지 않음.
### 2026-10-25 — RSS 최신 원격 상태 후속 감사
- **목적·범위**: 이전 턴의 최신 원격 RSS 테스트/운영 상태 미확인을 다시 검증했다. 원격 `origin/oci`는 `e508541e`로 그대로였고, 원격 worktree의 목표 기록 외 코드 변경은 없다.
- **검증**: 제목 전용 번역, 세 출처 allowlist, 번역 게이트 및 notification payload 테스트 4개 파일 101건 통과. retry 테스트 포함 시 112건 통과·1건 실패는 기본 checkout `998fb369`의 낡은 테스트 expectation과 원격 `e508541e` retry result 필드 불일치 때문으로 비교 확인했다. 기본 checkout은 95커밋 뒤처지고 RSS 외 미커밋 변경이 많아 수정/배포하지 않았다.
- **설치 장애**: 최신 원격 worktree에서 기존 npm cache를 사용한 `npm ci`와 `npm ci --ignore-scripts`가 모두 212번째 cache-hit package 처리 후 정지했다. partial install에서 next/vitest 일부는 생겼으나 drizzle-orm 미설치라 전체 검증/해당 3 suite 실행 불가했다. Node 24.14.0, npm 11이며 OCI CI 설정은 Node 22다. 중단 후 npm 로그 마지막 처리 패키지는 `dom-accessibility-api`; 파일 생성 단계 진전 없음.
- **운영 접근**: 호스트·DB read-only 진단 token·cron secret을 셸 환경에서 찾지 못해 운영 backlog/provider 결과/Discord 수신은 미확인이다. 공급자 호출·quota 변경 없이 유지했다.
- **남은 위험/재발 감지**: provider quota 소진 상태와 이전 운영 backlog가 남아 있을 수 있다. 운영 `/api/debug/market-rss-translations`의 lifetime/status 집계, cron run 및 source별 새 validated translation 표본을 확인한다. 독립 CI 배포에서 verify/activation 상태 확인이 필요하다.
- **커밋·푸시·배포**: 최신 isolated worktree의 `DEVELOPMENT_LOG.md`에만 이 메모를 기록했다. 코드 변경, commit, push, deploy는 없다.
### 2026-10-25 — OCI 운영 RSS 실시간 backlog 재확인
- 운영 host는 저장소 운영 이력의 `https://stockman.r-e.kr`로 확인했다. `GET /api/health`는 2026-10-25T13:58:56Z HTTP 200/status `ok`; 공개 RSS diagnostics는 13:59:42Z HTTP 200을 반환했다.
- lifetime: GlobeNewswire 전체 29, translated 25, monthly-cap skipped 4, notification pending 4; SEC 9,005, translated 8,692, monthly-cap skipped 238, notification pending 1,481, sent 7,521, uncertain 3, legacy sent-without-current-translation 313; StockTitan 20,422, translated 8,788, monthly-cap skipped 11,391, notification pending 2,299, sent 18,121, uncertain 2, legacy sent-without-current-translation 9,335.
- 30일 범위 diagnostics: 번역 pending 55,212, monthly-cap skipped 11,605, translated 4,600. Skip reason breakdown은 GNW provider null 4, SEC Azure 56 + Google 182, StockTitan Azure 1,203 + Google 7,714 + provider null 2,474로 전부 `monthly_character_limit_reached`다.
- 24시간 신규 구간에는 25 skipped/5 translated가 있었다. 개별 StockTitan 최신 기사 1건은 `SKIPPED`, fallback 원문 제목 보존, reason `monthly_character_limit_reached`, attempted 1, notification PENDING으로 저장된 것을 직접 확인했다. 따라서 원문으로 Discord 우회 발송되지 않고 기사 대기 상태를 유지한다.
- 인증된 automation-runs/debug-suite는 401이라 실행 상세는 확인 불가. 공개 diagnostics는 aggregate/read-only만 호출했다. provider/Discord 호출 및 quota 변경 없음.
- **남은 위험**: 실제 번역 성공은 월 한도 사용 가능 시점까지 멈춰 있고 총 미발송 기사가 3,784건(3개 source notification pending 합계)이다. 과거 `SENT` 행 중 미번역 현재 상태는 이미 전송된 상태이므로 소급 수정 불가. 한도 증액 승인 없이는 다음 UTC 월 quota reset 이후 재처리 확인이 남는다.- **후속 read-only poll** (`2026-10-25T14:00:23Z`): 번역 상태 및 skip 집계는 앞선 13:59:42Z와 동일했다. SEC notification pending은 1,481→1,461로 감소(+20 SENT), StockTitan 2,299 및 GlobeNewswire 4는 정체했다. 즉 quota reset 전에도 이미 검증 번역된 SEC backlog의 전송은 진행 중이고, 신규 월 한도 skip 행은 번역/전송 대기다.
- **reset 재처리 selector 검토**: monthly skip reason은 UTC 월 시작 전에 시도한 건에 대해 retry condition에 재포함되고, 후보 notification 상태는 `PENDING`/`FAILED`/`SKIPPED`; `SENT`/`UNCERTAIN`은 제외된다. 따라서 월 reset 후 기존 unsent 기사 재번역 대상으로 잡히는 SQL 조건을 확인했다. 운영 cron selector 실제 실행은 provider quota 전부 소진 상태여서 표본으로 관찰할 수 없다.
## [2026-10-25] Discord RSS 한국어 번역 상태 게이트 강화

### 목표 및 근본 원인
- SEC EDGAR, StockTitan, GlobeNewswire RSS 기사에서 검증된 한국어 제목만 Discord로 발송한다.
- 기존 SQL 게이트는 `translation_status=TRANSLATED` 또는 `SKIPPED/already_in_target_language`만 확인했다. 상태값 외 저장 불변식(`translation_fallback=false`, `translation_target_language=ko`, `translated_title` 존재)을 함께 강제하지 않아 데이터 불일치 시 원문/빈 제목이 발송 후보가 될 수 있었다.

### 변경
- `lib/market-rss-notification-translation-gate.ts`: 두 허용 상태 모두 fallback 아님, target language `ko`, translated title 비어 있지 않음(현재 DB guard는 NULL 차단)을 요구하도록 게이트를 강화했다. 이미 한국어로 처리된 제목은 저장 제목이 원문 title과 같은지도 요구한다.
- `lib/market-rss-notification-translation-gate.test.ts`: SQL이 fallback/ko/non-null 및 이미 한국어 제목의 원문 일치 조건을 갖는지 assertion을 추가했다.
- 본 변경은 provider에 원문 summary/content를 전달하지 않으며 RSS 분류/eligibility/backlog 필터를 추가하지 않는다.

### 검증
- 최신 원격 `e508541e` isolated worktree에서 번역 item, retry selector, notification gate/message, source policy 테스트 5개 파일 142/142 통과.
- `node scripts/check-oci-cron.mjs`: 통과(22개 shared endpoint 및 isolated long-running fundamentals timer).
- `node scripts/check-docs.mjs`: 통과(18개 진입점, migration 160개, V160).
- `git diff --check`: 통과.
- `npm.cmd run deploy:verify`: dependency audit 0 vulnerabilities 통과 후 build 시작 시 `next` binary unavailable로 실패. 독립 worktree의 `npm ci`가 중단되어 node_modules가 불완전하며 Node 24/npm11 환경(CI는 Node 22). `node node_modules/typescript/bin/tsc --noEmit`도 Next 모듈 부재 및 이에 따른 프로젝트 전체 타입 오류로 완료하지 못했다.
- 실제 운영 provider 호출, quota 변경, Discord 전송 없음. 운영 진단은 quota 소진과 3,764 notification pending 확인을 유지한다. 사용자 월 한도 선택 답변은 아직 없음.

### 재발 감지 및 남은 위험
- 테스트가 전송 게이트의 저장 상태 불변식을 직접 검사한다. 운영 `/api/debug/market-rss-translations`의 pending/skip aggregate와 cron run을 계속 확인한다.
- 전체 build/typecheck/런타임 검증을 마치기 전에는 이 변경을 commit/push/deploy하지 않는다. 실제 provider 성공 표본 및 backlog 0 확인도 목표 완료 전에 필요하다.

### 커밋·푸시·배포
- 코드 및 이 로그는 최신 remote worktree에서만 수정했으며 커밋·푸시·배포하지 않았다. 기본 checkout의 unrelated dirty changes를 건드리지 않았다.- **후속 검증** (`2026-10-25T14:04:07Z`): 새 142건 테스트 실행 재통과. 코드에서 notifier 후보가 `notificationStatus=PENDING`으로 제한되고 강화 번역 게이트가 적용되는 것을 확인했다. 기존 `SENT`/`SENDING` 건의 rate-window 집계 경로는 게이트와 분리돼 있다. 운영 health HTTP 200/status `ok`; current lifetime pending은 GNW 4, SEC 1,381, StockTitan 2,299 (합 3,684)이고 quota skip 수치는 이전과 동일하다. `git diff --check` 통과.
### 2026-10-25 — 강화 게이트 전체 검증 결과 및 배포 준비
- **검증환경 복구**: 현재 코드와 같은 `e508541e` commit의 다른 clean worktree에서 기존 `node_modules`만 복사해 불완전 설치를 복구했다. 코드, `.env.local`, 자격증명은 복사하지 않았다.
- **전체 검증**: `npm.cmd run deploy:verify` 성공. dependency audit 0 vulnerabilities; Next.js 15.5.28 production build 성공(111 static pages); standalone HTTP smoke 및 Chrome desktop/mobile hydration 성공; 302개 테스트 파일 중 301 passed/1 skipped, 테스트 1,518 passed/3 skipped; typecheck, docs/migration, scope audit, KIS boundary, bearer auth, OCI cron 검사 모두 통과.
- **대상 회귀**: RSS 번역/게이트/retry/message/source policy 5개 파일 142/142 통과.
- **운영 read-only**: health `ok`; 2026-10-25 14:04Z 시점 미발송 pending GNW 4, SEC 1,381, StockTitan 2,299 (총 3,684). quota skip은 GNW 4, SEC 238, StockTitan 11,391이며 전체 reason `monthly_character_limit_reached`. 사용자 월 한도 선택 답변은 아직 확인되지 않았다. quota 증액이나 provider 호출은 하지 않았다.
- **상태**: 강화된 번역 전송 게이트는 DB 상태/target/fallback/제목 정합성을 확인한다. 커밋·푸시 전 전체 필수 검증을 마쳤다. 실제 provider success 및 pending 0은 여전히 운영 quota reset 뒤 확인해야 한다.

## [2026-10-27] 일별공시 미국 RSS 일괄 JSON 복사

### 목표
- 현재 일별공시 조회 조건에서 미국 RSS 출처만 한 번에 JSON으로 복사한다.

### 반영
- 화면의 미국 RSS JSON 복사 기능에서 SEC EDGAR, Nasdaq, Nasdaq Trader, StockTitan, GlobeNewswire 다섯 출처만 포함하고 원본 응답 항목을 보존한다.
- 복사 회귀 테스트와 설계 문서를 갱신했다.

### 검증
- 배포 전 `npm run deploy:verify` 전체 검증을 수행한다.
- 커밋·푸시·배포는 검증 완료 후 진행한다.

### 배포 검증 완료
- `npm.cmd run deploy:verify` 통과: 의존성 취약점 0건, production build 및 타입 검사 성공.
- 전체 Vitest: 287개 파일 통과, 1,500개 테스트 통과, 2개 skip.
- 문서/migration, verify-scope, KIS 경계, bearer 인증, OCI cron 검사 통과.
- standalone smoke: `/charts` HTTP 200, 데스크톱·모바일 Chrome hydration 성공, 주요 API 기대 상태 검증 성공.
- 검증 후 기능 관련 4개 파일만 커밋·push해 OCI 배포 workflow를 실행한다.

## [2026-10-29] 외부 종목·시장 읽기 API 무인증 공개

### 목표 및 원인
- 운영 서버의 종목·시장 데이터 읽기 API를 Web ChatGPT 등 외부 소비자가 인증 없이 조회할 수 있게 한다. 기존 세 캐시 API는 `DAILY_CACHE_READ_API_KEY`가 운영환경에 설정되면 401을 반환했고 OpenAPI도 Bearer를 요구했다.
- KIS 자체 API 인증을 변경하지 않았다. KIS Developers는 앱키·앱시크릿과 OAuth 접근 토큰을 사용한다([공식 API 포털](https://apiportal.koreainvestment.com/)). 이번 변경은 이미 수집된 시장 데이터를 제공하는 StockMan 읽기 전용 API 경계에만 적용했다.

### 반영
- `/api/public/daily-candles`, `/api/public/instrument-fundamentals`, `/api/public/market-intelligence`의 요청자 키 검사를 제거했다. 일반 공개 OpenAPI의 35개 GET은 모두 인증 없이 호출하도록 `security: []`를 명시하고 Bearer security scheme을 제거했다.
- `scripts/api-surface.mjs`에 미래의 공개 GET 인증 회귀 감지를 추가했다. 공개 후보 route에서 요청자 인증 검사가 발견되거나 GET에 service-bearer가 붙으면 생성과 audit이 실패한다. 쓰기·관리자·사용자 데이터·내부 진단·GET 부수효과 경로는 계속 외부 명세에서 제외한다.
- 캔들 API를 소비하는 앱 클라이언트·동기화 스크립트·운영 절차서에서 읽기 키 의존을 제거하고, `AGENTS.md`, `public/api-reference.md`, `public/llms.txt`, API 설계 문서를 갱신했다. 다운로드 전달용 `stockman-readonly-api.env`에는 API 주소만 남겼다.

### 검증 및 한계
- `npm run audit:api-surface`, `npm run docs:check`, JavaScript syntax 검증 통과. OpenAPI 35개 GET 중 security 설정이 없는 항목 35개, security scheme 0개, 401 응답 선언 0개.
- `npm run deploy:verify` 통과: dependency audit 0건, production build, standalone/runtime smoke, 290개 test files 중 289개 통과·1개 skip, 1,511개 테스트 통과·3개 skip, typecheck, docs/migration, KIS 경계, bearer auth, OCI cron 검사 통과.
- 배포 전 운영 서버 무인증 `/api/public/daily-candles`는 HTTP 401 `UNAUTHORIZED`였고 운영 `/openapi.json`에는 기존 Bearer schemes가 있었다. push 후 workflow 완료와 운영 무인증 요청을 다시 확인한다.
- 인증 없는 공개이므로 호출량 증가·남용은 운영 지표로 관찰해야 한다. 공통 IP rate limit은 이번 범위에서 추가하지 않았다.

### Git 및 배포
- 이 기록 시점 기준 커밋·푸시·배포는 아직 수행하지 않았다. 검증된 변경만 `oci` 브랜치에 반영해 OCI workflow로 배포한다.

### 운영 배포 완료 (2026-10-29)
- `fab3c2db`를 `origin/oci`에 push했다. GitHub Actions `Deploy OCI` run `40823443130`이 성공으로 완료되어 운영 릴리스가 활성화됐다.
- 배포 후 운영 API에 Authorization/API-key 헤더 없이 GET 확인: `/api/public/daily-candles`, `/api/public/instrument-fundamentals`, `/api/public/market-intelligence` 모두 HTTP 200.
- 운영 `/openapi.json`은 읽기 GET 35개, 인증이 선언된 operation 0개, security scheme 0개이며 세 캐시 API의 401 응답 선언도 없다.

## [2026-10-31] 미국 보통주 종목 기본정보 공개 API

### 목표
- 운영 서버의 읽기 전용 API 한 번으로 활성 미국 보통주 티커의 식별정보, 최신 저장 시세, SEC 회사 식별정보와 캐시된 기본 재무정보를 확인한다.

### 반영
- `GET /api/public/us-stock-metadata?ticker={ticker}`를 추가한다. 호출자 인증 없이 동작하며, 공식 유니버스에서 활성 `COMMON_STOCK`이고 비보통주 분류가 아님을 확인한 종목만 반환한다. DB 조회만 수행하고 외부 호출이나 쓰기를 하지 않는다.
- 시장 스냅샷 관측 시각 및 24시간 freshness 상태, 누락 데이터 그룹을 응답에 표시한다. SEC Company Facts에서는 표준 us-gaap/ifrs-full 개념의 최신 관측값과 taxonomy·concept·단위·기간·filing 출처를 함께 반환한다.
- SEC 스냅샷 payload 조회를 연결하고, helper 단위 테스트를 추가한다. OpenAPI generator에 입력 규칙·응답 개요·오류 코드·무인증 분류를 추가해 route inventory, `/openapi.json`, `/api-reference.md`, `/api/public/api-manual` 및 문서 카탈로그가 함께 갱신되게 한다.
- 상세 설계는 `docs/design/us-common-stock-metadata.md`에 기록한다.

### 검증
- `npm run deploy:verify`: 통과. npm audit 취약점 0개, production build, TypeScript, 296개 테스트 파일(1,528 passed, 3 skipped), API surface 177 routes/41 public GET, 문서 123개/7개 범주, scope/KIS/auth/cron 감사를 확인했다.
- standalone smoke: OpenAPI에 신규 무인증 GET 및 필수 ticker가 있고 검색형 `/api/public/api-manual` 결과에도 해당 경로가 포함되는지 확인했다. 비정상 ticker는 DB 조회 전에 HTTP 400을 반환했다. `/charts`, 정적 청크 및 Chrome desktop/mobile 검사도 통과했다.
- 전체 테스트의 첫 재실행에서 watchlist 회사명 조회 테스트가 비동기 이름 조회를 기본 짧은 대기 안에 받지 못해 1건 실패했다. 테스트는 두 시장 이름이 모두 표시될 때까지 최대 10초 기다리도록 조정했고, 해당 파일 4개 테스트와 전체 배포 검증을 통과했다.
- 첫 OCI workflow run `41180014242`는 빌드·테스트·패키징 후 activation의 `market-impact-events-import` 단계에서 실패했다. 원인은 workflow가 importer를 복사하면서 정적 중복 검사 모듈 `scripts/market-impact-event-identity.mjs`를 standalone release에 복사하지 않은 것이다. activation은 import를 파일 교체 전에 실행하므로 새 릴리스로 전환되지 않았다.
- 재발 방지로 OCI packaging에 해당 helper 복사를 추가하고 tarball 안에 helper가 있는지 검사하는 필수 게이트를 추가했다. 수정 후 `npm run deploy:verify`는 다시 통과했으며, tarball 포함 검사는 다음 OCI workflow에서 패키징 단계에 실행된다.
- `git diff --check`: 변경 파일 공백 검사 완료.
- 남은 위험: 운영 DB에 해당 티커의 최신 스냅샷 또는 SEC facts가 없으면 API는 `PARTIAL`과 누락 항목을 반환한다. 데이터 수집·갱신은 이 공개 GET에서 실행하지 않는다.

### 커밋·푸시·배포
- API 커밋 `09fea406` 및 OCI 패키징 수정 `053a90eb`을 `origin/oci`에 순차 push했다. 첫 workflow `41180014242`는 importer helper 누락으로 activation 전에 실패했고 이전 release가 유지됐다. 수정 workflow `41181213216`은 성공했다.
- 배포 후 운영 `https://stockman.r-e.kr/api/health` 무인증 GET은 HTTP 200 `ok`, `/api/public/us-stock-metadata?ticker=AAPL` 무인증 GET은 HTTP 200을 반환했다. AAPL 활성 보통주 식별정보와 저장 시세가 포함됐고, SEC 식별정보/facts 미보유는 `PARTIAL`, 시세 24시간 초과는 `STALE`로 표시됐다.
- 운영 `/api/public/api-manual?q=us-stock-metadata&limit=5` 무인증 GET은 HTTP 200이며 신규 GET operation, ticker 필수 입력, 응답 DTO 및 오류 응답 설명을 검색 결과에 포함했다.
- 최종 커밋·푸시·배포는 완료했다. 마지막 기록 변경은 이 문서뿐이며 `docs:check`와 `git diff --check`로 확인한다.

## [2026-10-31] SEC SIC provenance 기반 CIK fallback

### 원인 및 변경
- 실제 운영 `/api/public/us-stock-metadata?ticker=GENK` 응답은 `identity.classification.source`에 `SEC_EDGAR_SIC:0001891856`를 반환하면서 `company.cik`과 `financials`가 null이었다. 라우트가 `sec_companies.tickers` 일치만으로 CIK를 찾고, 이 연결 실패 시 SEC SIC 동기화가 마스터에 기록한 CIK를 무시해 기존 Company Facts snapshot 연결도 놓쳤다.
- SEC 공식 Company Facts API에서 CIK `0001891856`은 `GEN Restaurant Group, Inc.`로 확인됐고 us-gaap 개념 229개를 포함했다. 라우트는 SEC ticker/exchange 매핑을 우선하고, 매핑이 없는 경우 정확한 `SEC_EDGAR_SIC:<10자리 CIK>` 출처 형식에서만 CIK를 보완해 회사 및 저장 facts snapshot을 연결하도록 변경했다. 회사명은 SEC company map을 우선하며 없을 때 저장 Company Facts `entityName`을 사용한다. 공개 GET의 외부 호출·DB 쓰기 동작은 추가하지 않았다.
- 상세 설계 문서에 fallback의 근거와 범위를 기록했다. 방지 체크리스트: CIK fallback은 보통주 적격성 판정에 사용하지 않고, 고정 provenance 형식과 10자리 CIK를 모두 확인하며, Company Facts는 기존 snapshot만 읽는다.

### 검증 및 배포 상태
- 근거 자료: [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), SEC Company Facts `https://data.sec.gov/api/xbrl/companyfacts/CIK0001891856.json` (2026-10-31 직접 확인; entity name과 taxonomy 개수 확인).
- 배포 전 운영 무인증 `GET /api/sec/company-facts?cik=0001891856`로 저장 snapshot이 실제 존재함을 확인했다(마지막 fetch 2026-10-15). snapshot에는 매출, 영업이익, 순이익, 현금, 영업현금흐름 표준 태그가 있어, 결함은 데이터 부재가 아니라 마스터 CIK와 snapshot join 누락임을 확정했다.
- `npm.cmd run deploy:verify` 통과: dependency audit 취약점 0, production build, standalone/OpenAPI/Chrome desktop·mobile smoke, 전체 Vitest 298파일(297 passed·1 skipped; 1,529 passed·3 skipped), TypeScript, docs/migration, API surface 177 routes/41 public GET, verify-scope/KIS/Bearer auth/OCI cron 감사.
- regression test는 SEC SIC provenance CIK를 통한 Company Facts snapshot 연결, 회사 CIK·SEC명·SIC·대표 매출 fact 반환을 확인한다. 로컬 smoke는 잘못된 ticker 400을 확인했다. 운영 GENK 응답 검증과 배포는 커밋·푸시 후 진행한다.
- 수정 커밋 `a6535bbe`의 OCI 배포 workflow `41183801560`은 성공했다. 운영 무인증 `GET /api/public/us-stock-metadata?ticker=GENK`은 HTTP 200으로 CIK `0001891856`, `GEN Restaurant Group, Inc.`, SIC `5812`, SEC Company Facts snapshot 및 재무 5개 지표를 반환했다. revenue `109,626,000 USD`, operating income `-12,360,000 USD`, net income `-1,922,000 USD`, cash `5,930,000 USD`, operating cash flow `-826,000 USD`; 모두 2026-06-30 종료기간·2026-08-10 제출 10-Q 기준이며 fetchedAt은 2026-10-15다. `dataQuality.status=COMPLETE`, `missingGroups=[]`; market quote는 관측시각 기준 90,757초로 `STALE`이며 신규 수집을 실행하지 않는다. 운영 `/api/health`도 HTTP 200 `ok`다.

## [2026-11-03] 보통주 API SEC 회사 식별 매핑 커버리지 개선

### 발견한 문제와 원인
- 운영 무인증 GET 표본에서 GENK는 앞선 CIK fallback 수정으로 식별·facts 5개가 연결됐지만 AAPL, NVDA, TSLA, BABA는 `company`와 `financials`가 비어 있었다. 각각 `/api/sec/company-facts?cik=...`도 HTTP 404여서 저장 snapshot이 없는 상태였다.
- SEC 공식 `company_tickers_exchange.json`은 10,423행이며 네 ticker의 CIK·회사명이 모두 있었다. 기존 일일 Company Facts cron은 설정 CIK 목록만 처리했고, 목록이 비면 전체 job을 건너뛰어 `sec_companies`에 전체 종목 CIK/회사명 매핑을 만들지 않았다.

### 변경
- 일일 SEC cron은 공식 ticker/exchange master를 받아 enabled COMMON_STOCK가 KIS 미국 종목 마스터에서 확인된 issuer의 SEC 회사명, CIK, 전체 ticker/exchange 배열을 `sec_companies`에 갱신한다. 적격성에는 SEC ticker 텍스트 추정을 쓰지 않고 기존 fail-closed KIS 분류 게이트를 사용한다.
- SEC Company Facts 본문 수집은 계속 명시 설정한 CIK만 호출한다. 공개 GET은 계속 DB 읽기만 수행하며 외부 요청이나 쓰기를 하지 않는다. SEC ticker master 프로세스 캐시를 12시간으로 제한해 장기 실행 서버가 갱신을 영구 보류하지 않도록 했고, 10,423 SEC 행을 검사하는 보통주 eligibility grouping을 O(n²)에서 O(n)으로 줄였다.
- 기능 모듈 설명, 설계 문서, 운영 runbook과 이 로그를 갱신했다. 추가 schema/migration은 없다.

### 검증·남은 범위
- 대상 Vitest 3개 파일 9개 테스트 통과: cron은 facts CIK 설정이 비어도 회사 매핑을 갱신하고, facts 요청은 설정 CIK만 사용하며, 회사 매핑은 KIS enabled common stock 적격성으로 제한한다.
- 배포 전 운영 표본: `/api/health` 200; GENK 기본정보는 `COMPLETE`; AAPL/NVDA/TSLA/BABA는 기존 `sec_companies` 및 Company Facts snapshot 부재로 `PARTIAL`. SEC Company Facts 수집은 이 변경에서도 설정 CIK만 대상이므로 네 종목 재무 facts의 자동 backfill은 포함하지 않는다.
- 전체 `npm.cmd run deploy:verify` 통과: npm audit 취약점 0, production build/standalone 및 Chrome desktop/mobile smoke, 전체 Vitest 300파일(299 passed·1 skipped; 1,540 passed·3 skipped), TypeScript, docs/migration(API 178 routes/42 public GET, 123문서, V165), verify-scope/KIS/Bearer auth/OCI cron 감사.
- 커밋·푸시·배포 및 배포 후 다음 일일 cron이 SEC 회사 매핑을 완료했는지, 이어서 무인증 AAPL/NVDA/TSLA/BABA GET에서 CIK·SEC 회사명이 나타나는지 확인이 남았다. Company Facts는 설정 대상이 아닌 한 계속 partial일 수 있다.

## [2026-11-03] 수동 Company Facts 갱신과 종목 회사 매핑 즉시 반영

### 목적 및 변경
- 운영 일일 cron을 기다리지 않고 새 종목의 SEC 회사 CIK·회사명과 Facts를 공개 종목 메타데이터 GET에서 확인할 수 있게 수동 갱신 API를 연결한다.
- 공개 `POST /api/sec/company-facts`는 입력 CIK/ticker를 기존 활성 보통주 게이트로 검증한 뒤, 해당 issuer의 공식 SEC 전체 ticker/exchange 행만 KIS enabled COMMON_STOCK와 다시 대조해 `sec_companies`에 저장하고 Company Facts를 갱신한다. 전체 마스터 bulk 갱신은 하지 않는다. 기존 공개 GET은 DB read-only 유지.
- SEC 수동 API 매뉴얼과 미국 보통주 설계 문서에 갱신 범위와 후속 GET 사용법을 반영한다.

### 검증 및 상태
- 변경 파일: `app/api/sec/company-facts/route.ts`, 해당 route test, `docs/official/sec-edgar/companyfacts.md`, `docs/design/us-common-stock-metadata.md`, 본 로그 및 생성 API 문서/인벤토리.
- route test 4개 통과. `docs:api:generate`가 178 route/42 public GET inventory·OpenAPI를 재생성했고 `audit:api-surface`가 통과했다. 전체 `npm.cmd run deploy:verify` 통과: 의존성 감사 0 취약점, production build, standalone/OpenAPI/Chrome desktop·mobile smoke, 전체 Vitest 300파일(299 passed·1 skipped; 1,540 passed·3 skipped), TypeScript, docs/migration(V165), verify-scope/KIS/Bearer/OCI cron 감사. `git diff --check`도 통과.
- 커밋 `6f16d7ec`를 `oci`에 푸시했고 OCI Actions run [41473847660](https://github.com/pjtss/StockMan/actions/runs/41473847660)이 성공해 운영 배포됐다. 배포 후 운영 health는 HTTP 200, 공개 무인증 API 매뉴얼 조회 및 AAPL 메타데이터 GET은 HTTP 200이었다. AAPL은 이 조회 시점에 CIK/company facts가 아직 비어 `PARTIAL`이었다. 수동 POST는 SEC fetch와 운영 DB 쓰기를 실행하므로 운영에서 호출하지 않았고, 따라서 해당 데이터의 즉시 갱신 동작은 실행 실증 전이다.
- 남은 위험: SEC ticker/exchange 매핑의 정확성·범위는 SEC가 보장하지 않는다. 수동 요청은 검증된 한 issuer만 갱신하며, Company Facts가 SEC에 없거나 대표 표준 태그가 없으면 메타데이터 일부는 계속 PARTIAL일 수 있다.

## [2026-11-04] 미국 소형주 이벤트 원장 100종목 — 운영 검증 및 배포 준비

### 목적과 포함 범위
- 운영 OCI `oci` 브랜치의 최신 배포 기준에 미국 보통주 100종목의 공시·뉴스 이벤트 원장 216건을 추가하고, 종목별 검토표·SEC accession별 검토 원장·검증기를 같은 저장소 변경으로 관리한다.
- 운영 API·종목 metadata는 공개 GET으로 확인했다. GitHub Actions의 최신 OCI 실행은 2026-11-03 01:32 UTC에 commit `efe88b987e0a611d686cc80ed46bdb046119d423`에서 성공했다. 현 운영 이벤트 API는 미국 3건을 반환하고 health는 `ok`다.

### 운영 종목 기준 검증
- `GET /api/public/us-stock-metadata?ticker=...`를 원장 내 100개 ticker 각각 호출했다. 100/100 모두 HTTP 200, 활성 `COMMON_STOCK`, USD market-cap 값 존재, 최신 운영 snapshot 기준 시총 1억 달러 이하로 확인했다.
- 해당 100개 시장 snapshot은 모두 `STALE`이며 가장 최근 관측 시각은 2026-11-02 UTC다. 이를 2026-11-04 실시간 시총으로 표현하지 않고, 검증 기준과 freshness 한계를 보고서에 남긴다.

### 구조화 원장 및 계약 보강
- 이벤트 JSON 216건/100 issuer, SEC accession 이벤트 연결 227개, amendment 연결 2개를 종목 검토 JSON 및 accession 검토 ledger와 함께 반영한다. 보고서는 issuer별 조사 범위·직접 검토 수준을 보여 주고 validator는 event/ticker/accession 관계와 집계 parity를 검사한다.
- URL host를 기준으로 197개 SEC 원문 이벤트를 `SEC_FILING`, 19개 발행사 보도자료를 `ISSUER_PRESS_RELEASE`로 분류해 출처 계열과 `sourceUrl`을 일치시켰다.
- `npm run validate:us-smallcap-event-data`를 추가하고 `docs:check` 자동 게이트에서 실행하도록 연결했다. architecture 문서에 sourceType 분류 기준을, deployment checklist에 운영 DB 식별·사전검증·API 사후대조 절차를 기록한다.

### 검증과 남은 단계
- 로컬 구조 validator 통과: 100 issuers, 5,662 submissions, 216 US events, 227 accession-event relations, 2 amendment relations; FULL_PRIMARY_REVIEW 105 / INVENTORY_ONLY 5,413 / TRIAGE_EXCERPT 84 / TARGETED_SECTION_REVIEW 60.
- 앞서 수동 실행한 importer 오류(`market_impact_events` relation 없음)는 `.env.local`이 가리킨 `localhost/stockman`에서 발생했다. 운영 DB 오류가 아니다. 운영 공개 이벤트 GET 정상 응답으로 운영 relation 조회가 가능함을 확인했다. 기존 미국 이벤트 3건(IAG, ERO, ABOS)은 이번 100 ticker 원장과 ticker/eventId가 겹치지 않는다.
- `npm run deploy:verify` 통과: dependency audit 0 vulnerabilities, production build/standalone smoke, desktop/mobile hydration, API smoke, 300 test files (1,541 passed/3 skipped), typecheck, docs:check, API surface, verify-scope, KIS boundary, bearer-auth, OCI cron 검증 성공. `docs:check`에서 100종목/5,662 filings/216 events 구조 validator도 실행했다.
- 운영 배포 후 API가 216건 전체와 100 ticker를 반환하는지 대조해야 한다. 이번 로그 시점에는 해당 import가 아직 반영되지 않았다.
- `DATABASE_URL` 비밀값은 로그에 남기지 않았다. 사용자 변경분은 검증됐고 commit/push 전이다.

### 커밋·푸시·배포
- `deploy:verify` 완료. 검증된 변경만 최신 `origin/oci` 기반 한국어 커밋으로 묶어 `oci`에 push해 자동 OCI 배포를 시작한다. 운영 workflow와 API 결과 확인이 남아 있다.
## [2026-11-04] 수동 SEC 갱신 화면에서 종목 기본정보 API 연결

### 목적 및 변경
- 수동 Company Facts 갱신 후 해당 종목의 결합 기본정보를 바로 확인할 수 있도록 결과 화면에 SEC 회사 매핑 티커 수와 갱신 시각을 표시하고 canonical ticker 기반 `GET /api/public/us-stock-metadata` 링크를 제공한다.
- 외부 GET/API 계약 및 DB 동작은 변경하지 않는다. SEC 수동 갱신 POST 후속으로 기존 공개 GET을 여는 UI 동선만 추가한다.
- `docs/official/sec-edgar/companyfacts.md` 사용 안내와 본 작업 기록을 반영한다.

### 검증 및 상태
- 변경 대상: `components/sec-company-facts-lookup.tsx`, 대응 CSS 및 component test, `docs/official/sec-edgar/companyfacts.md`, 본 로그.
- component regression test 1개 통과. 최신 원격 변경을 포함한 최종 `npm.cmd run deploy:verify` 통과: 의존성 감사 0 취약점, production build, standalone/OpenAPI/browser desktop·mobile smoke, 전체 Vitest 301파일(300 passed·1 skipped; 1,542 passed·3 skipped), TypeScript, docs/migrations(V165), API surface(178 route/42 public GET), verify-scope/KIS/Bearer/OCI cron 감사. `git diff --check`도 통과했다.
- 커밋 `556c3786`를 `oci`에 푸시했다. OCI Actions run `41667923189` 성공. 운영 `/other`와 해당 JS bundle은 HTTP 200이며, bundle에서 새 기본정보 API 링크와 회사 매핑 표시 문자열을 확인했다. 공개 API 매뉴얼 GET과 health도 HTTP 200이다.
- 남은 위험: 운영 데이터 갱신을 위한 POST는 SEC upstream 요청과 DB 쓰기를 수행한다. 이 변경은 해당 POST를 자동 실행하지 않고 수동 갱신 성공 뒤 사용자가 선택하는 읽기 전용 GET 링크만 제공한다.

\n
## [2026-11-04] 동일 날짜 이벤트 배치의 식별·문서 카탈로그 경로 개선

### 목적 및 범위
- 같은 날 여러 100종목 이벤트 배치가 생성될 때 날짜만으로 파일명이 겹치고, 날짜가 포함된 조사 보고서는 문서 카탈로그의 일반 날짜 파일 필터에 걸려 탐색되지 않는 구조를 개선한다.

### 반영
- `docs/operations/us-smallcap-event-data-contract.md`에 동일 날짜 복수 배치의 `-bNN` 순번 규칙과 데이터 파일 간 명칭 정합성을 기록했다.
- `docs/api/document-catalog.mjs`에서 운영 소형주 이벤트 조사 보고서를 날짜 기반 제외 규칙의 예외로 분류해 카탈로그에서 찾을 수 있도록 했다.

### 검증 및 배포 상태
- `npm run docs:catalog:generate`, `npm run docs:catalog:check`, `npm run docs:check`, `git diff --check`를 실행했다. 문서 카탈로그는 126건/7개 분류로 생성·검증됐고, 기존 1·2차 이벤트 데이터 검증과 문서 링크 검사도 통과했다.
- 문서 구조 변경 커밋 `786dcf8b`를 `oci`에 푸시했다. [Deploy OCI run 41685407401](https://github.com/pjtss/StockMan/actions/runs/41685407401)이 성공했고 운영 `/api/health`는 `ok`, `/health-check`에는 해당 SHA가 표시됐다. 운영 이벤트 공개 GET은 237건을 반환했고 2차 배치 18개 eventId 전부 확인했다. 운영 문서 카탈로그에서 이벤트 보고서 링크도 확인했다.

### 다음 개선
- 자료 계약의 날짜·배치 ID 규칙을 validator CLI 이름과 자동으로 연결해 package script의 수동 중복을 줄이는 방안을 검토한다.

## [2026-11-04] 미국 소형주 이벤트 3차 100종목 배치 수집 및 구조화

### 목적 및 범위
- 운영 서버 공개 GET과 SEC 공식 자료를 기준으로 직전 두 배치와 중복되지 않는 100개 미국 상장 COMMON_STOCK 종목을 추가 조사했다. 2025-11-04~2026-11-04 SEC 제출 inventory와 운영 뉴스에서 직접 확인한 사건을 accession별·issuer별 저장하고 정규 이벤트 원장에 연결한다.
- 운영 공개 `/api/public/us-stock-metadata`, `/api/public/market-intelligence` GET만 사용했다. 운영 API/DB write 없음. 공식 SEC submissions와 `company_tickers_exchange.json`으로 100/100 CIK 교차 확인했다.
- 238개 신규 후보의 운영 마스터 확인 중 225개가 시총·분류 기준을 통과했고 34개 ADR/ADS·depositary 후보를 보류 제외했다. KIS 시총 snapshot은 2026-11-02 관측 STALE이다.

### 반영
- 종목별 snapshot·뉴스·SEC filing inventory·검토 이벤트: `data/us-smallcap-event-review-20261104-b03.json`.
- accession별 SEC 검토 ledger: `data/us-smallcap-filing-review-ledger-20261104-b03.json`.
- 정규 이벤트 13건을 `data/market-impact-events.json`에 추가하고, 조사 범위·근거·임상·역분할·일정 한계를 `docs/operations/us-smallcap-event-review-20261104-b03.md`에 기록했다.
- package validator 명령 `validate:us-smallcap-event-data:20261104b03`를 추가해 기존 1·2차와 독립 검증 및 `docs:check`에 연결했다. validator도 모든 기존/신규 배치의 운영 마스터 active COMMON_STOCK, 제외형 instrument flags, USD 시총 상한·하한을 검사하고 신규 배치의 운영·SEC master CIK 및 ledger를 교차 검증하도록 강화했다. 문서 카탈로그 생성기의 날짜 포함 보고서 예외를 실제 3차 보고서로 확인했다.
- 주요 이벤트: CRE 인수 완료, GLE·SCNX 역분할, VVOS/GWAV/INBS 정기주총, SNES/DOGZ Nasdaq 최저호가 회복기한, MGN 공모 종결, DPU 사모 계약, VNRX 전환사채 일부 상환, LGVN ELPIS II 후속 분석, AMZE 역분할 권한.

### 검증 결과
- 운영 intelligence 조회 100/100 성공, 뉴스/RSS 453건, bullish 분류 93건, SEC 분류 row 31건. SEC 제출 inventory 4,183건, 사건 원문 구간 직접 검토 13건/13개 issuer. 나머지 filing은 INVENTORY_ONLY로 표시했다.
- 배치 validator: issuer 100, filing 4,183, event 13, accession-event link 13, amendment relation 0. 운영 마스터 active COMMON_STOCK/USD cap 조건과 SEC ticker-master CIK는 100/100 일치했다. `docs:check`에서 1·2·3차 validator, API surface, 카탈로그(127건/7개 분류), 문서 링크 검사 통과.
- LGVN은 Phase 2b/N=40/HLHS/laromestrocel/NCT04925024와 primary endpoint 미달 및 secondary MACE 8 vs 1, p=0.043을 함께 기록했다. FDA 미확정 일정·미공개 시장 수치는 생성하지 않았다.
- 커밋·푸시·배포는 3차 데이터 추가 완료 후 전체 `npm run deploy:verify`로 build·test·runtime을 검증한 다음 진행한다.

### 남은 위험 및 다음 개선
- 시총 snapshot이 stale이고 SEC 전문 전수 검토가 아니다. 임상 후속 분석의 독립 재현, issuer 후속공시/회의 결과, reverse split 주식수 및 효력 일정은 추가 공시가 있을 때 갱신한다.
- 다음 배치는 동일 절차로 신규 100종목을 운영 마스터에서 다시 선정하고 이전 batch ticker를 제외한다.
## [2026-11-04] 미국 소형주 이벤트 원장 4차 100종목 배치 작성 및 문서 자동 검증 강화

### 목표
- 운영 서버 read-only 공개 GET 및 SEC 공식 자료로 이전 300개와 중복되지 않는 미국 active COMMON_STOCK 100종목을 조사하고, 종목·공시별 추적 구조에 다음 배치를 추가한다.
- 2025-11-04~2026-11-05 SEC 제출 4,334건을 inventory로 기록하고, 원문에서 근거를 확인한 24개 이벤트만 정규 원장에 반영한다. 시총 snapshot은 2026-11-02 관측 stale임을 유지한다.

### 반영
- 종목 review JSON, 4,334 accession ledger, 24 event record와 보고서를 추가했다. 운영 뉴스 449건, bullish 분류 67건은 원본 출처와 함께 보존했으며 bullish 결과만으로 canonical 이벤트를 만들지 않았다.
- 배치 ID/100 issuer/primary reviewed event를 자동 검사하도록 validator를 강화하고 `docs:check`에 b04 명령을 연결했다. 자료 계약 문서에 batch 검증과 catalog 도달성 절차를 고정했다. 날짜 배치 보고서는 카탈로그 생성기에서 허용되어 public manuals 인덱스에 포함됐다.
- generator는 accession이 같은 종목의 1년 submissions inventory에 있는지 강제하고 canonical eventId 중복을 방지한다. 중복 실행으로 중복 행이 생긴 기존 b03/b02 canonical entries도 eventId 기준 한 건만 유지했다.
- 변경 파일: `data/market-impact-events.json`, b04 review/ledger JSON, b04 report, `scripts/generate-us-smallcap-b04.mjs`, `scripts/validate-us-smallcap-event-data.mjs`, `docs/operations/us-smallcap-event-data-contract.md`, `package.json`, `public/document-catalog.json`, `DEVELOPMENT_LOG.md`.

### 검증
- 운영 metadata/market-intelligence GET 100/100 성공; operating ticker/CIK와 공식 SEC ticker master CIK 100/100 대조. SEC submissions 4,334건 수집; 대상 원문 응답 447/447 성공 후 사건 근거 accession 24건을 선별해 연결했다.
- `npm run validate:us-smallcap-event-data:20261104b04` 통과: issuer 100, batch events 24, accession-event relations 24, filing counts 4,310 INVENTORY_ONLY/24 TARGETED_SECTION_REVIEW.
- `npm run docs:check` 통과: 4개 배치 validator, 178 API route/42 public GET audit, 문서 카탈로그 128개/7개 category, 문서와 migration audit.
- `npm run deploy:verify` 통과: dependency audit 취약점 0, production build 107 pages, full suite 300 files/1,542 passed/3 skipped, typecheck, docs/API/KIS/auth/cron audits, standalone runtime API smoke 및 Chrome desktop/mobile hydration 성공. `git diff --check` 통과.
- commit `a1e471ee1c1e656ead639520f695e4cbdb3ff884`를 `oci`에 push했다. OCI workflow [41693624683](https://github.com/pjtss/StockMan/actions/runs/41693624683) 성공(verify, package, SSH, upload, activation 포함). 운영 `/api/health` status=ok, `/health-check` commit SHA 일치. public US events API는 274건 중 b04 eventId 24/24 반환; `/document-catalog.json`에서 report indexed, `/manuals/operations/us-smallcap-event-review-20261104-b04.md` HTTP 200 확인. 운영 API/DB write 없음.

### 다음 개선
- 남은 위험: 시총 값은 stale; 4,310 filing은 전문 미검토; 회사 exhibit의 모든 세부조건 및 후속 공시는 전수 추적하지 않았다. 일부 event summary는 primary filing의 statement를 압축했으며 보고서에서 확정 실행과 계획·항소를 구분했다.
- 자동 감지: docs:check에 batch ID, ticker/CIK, common-stock flags, cap bounds, event parity, accession ownership, filing counts, relation reciprocity 검사 포함. report 카탈로그 포함은 docs:catalog:check로 검증한다.
- 다음 단계: 배치 5의 후보 100개를 운영 마스터/시총/SEC CIK로 재검증하고 동일한 review·accession ledger·catalog 검증 구조를 적용한다.

### 개선 과제
- 개선 과제 ID: CI-2026-11-04-002
- 성과 판정: IMPROVED
- 근거: 기존 자동화는 b04를 docs:check에서 실행하지 않았고 배치 ID/100종목 제한을 검사하지 않았다. 이제 개별 배치 validator가 docs gate에서 실행되며 문서 카탈로그의 보고서 도달성까지 자동 검증한다.

### 커밋·푸시·배포
- 완료: `a1e471ee` commit, `oci` push, OCI Actions 41693624683 성공, 운영 health/event/catalog/manual 확인. 이 로그 후속 정정은 다음 검증된 기록 커밋에서 반영한다.
# [2026-11-06] SEC RSS Discord 알림을 EDGAR Form Type 기준으로 제한

## 목적 및 범위
- SEC EDGAR RSS 자동화에서 Discord 알림 대상을 정확한 `8-K`, `6-K`로 제한한다. RSS 전체 수집·저장은 유지한다.
- EDGAR Atom의 명시적 `category` 중 `label="form type"`인 `term`만 신규 항목 판정에 사용한다. 해당 category가 없으면 알림 대상에서 제외(fail-closed)한다. amendment(`8-K/A`, `6-K/A`)도 제외한다.
- 과거 DB 행 중 원본 form category가 보존되지 않은 경우에만 SEC title 접두어를 fallback으로 사용한다.

## 반영
- `lib/sec-rss-discord-filter.ts`: 원본 Atom Form Type 파싱과 허용 목록을 독립 모듈로 제공한다.
- `lib/market-rss-pipeline.ts`: 신규 SEC 수집에서 form type 외 항목을 notification-ineligible 처리하고, 이미 대기 중인 과거 비대상 항목도 Discord delivery 전에 건너뛴다.
- `lib/sec-rss-discord-filter.test.ts`: 허용/제외 form, category 누락, category/title 불일치, 복수 category 및 legacy fallback을 검증한다.

## 검증 및 배포
- SEC 실제 `all`, `type=8-K`, `type=6-K` Atom RSS 요청을 각각 HTTP 200으로 확인했다. 각 form 전용 100건 응답의 category term은 모두 요청 유형과 일치했다. all 100건 표본에서 8-K는 4건, 6-K는 0건이었고 제목 표시와 명시 category 간 허용 유형 불일치는 0건이었다.
- 필터 단위 테스트: 10개 통과. 전체 `npm run deploy:verify`: dependency audit 0 vulnerabilities, production build/typecheck, standalone `/charts`·공개 API·API 오류/인증 smoke, Chrome 데스크톱·모바일, 전체 Vitest 301파일 1,552 통과·3 skip, docs/API/catalog, verify-scope, KIS boundary, Bearer auth, OCI cron gates 통과.
- 전체 테스트 1차 실행에서 기존 KIS Retry-After 테스트가 60 대신 59를 받아 실패했으나 단독 재실행 및 전체 deploy verifier 재실행은 통과했다. rate limiter가 실제 남은 초를 반환하는 데 비해 테스트가 60초를 고정 기대하는 시간 경계 민감성으로 확인했으며, 이번 SEC 작업 범위 밖이라 수정하지 않았다.
- production standalone 실행과 브라우저 검증 완료. 커밋·푸시·운영 배포 상태는 후속 기록에 적는다.

## [2026-11-06] SEC Form Type 필터 OCI 운영 배포 확인

- 적용 커밋 `7b08f2d7`를 원격 `oci`에 푸시했고, GitHub Actions `Deploy OCI` run `42078913852`가 성공했다. `Verify deployment`, standalone package, SSH configure, upload, `Activate release`가 모두 성공했다.
- 배포 후 `https://stockman.r-e.kr/api/health`는 HTTP 200, `status=ok`를 반환했다.
- runbook의 인증된 `GET /api/debug/automation-runs?module=market-rss&limit=5`는 `.env.local`에서 CRON_SECRET을 출력 없이 주입해 read-only 호출했으나 15~20초 timeout됐다. 따라서 배포 후 market-rss의 신규 실행 기록은 확인하지 못했다. 재확인은 운영 조회 지연 해소 후 수행한다.
- SEC Form Type은 신규 Atom `<category label="form type" term="...">`만 신뢰하고 category 누락 시 fail-closed하므로 EDGAR Atom에 정확히 표시된 `8-K`/`6-K`만 새 Discord 전송 대상으로 만든다. 운영 알림을 수동 발사하지 않았다.
## [2026-11-06] SEC·RSS 영구 이벤트 원장 및 공개 무인증 API

### 목표
기존 SEC/RSS 수집 저장소를 활용해 이벤트·문서·분석 revision·상태 이력을 영구 저장하고 종목/시간/등급별 공개 조회와 보고서를 제공한다.

### 반영
- 최신 배포 기준 `origin/oci`에 V166 forward-only additive migration, Drizzle schema 및 SEC/RSS materializer를 구현했다. SEC는 CIK+accession, RSS는 provider+external id로 중복 방지한다.
- `/api/events/collect`는 무인증 공개 API이며 기존 원본 식별자만 받아 저장한다. 조회·이력·보고서·수집상태 API, 관리자 분석 revision API 및 SEC/RSS cron 연계를 추가했다.
- 현황·아키텍처·데이터 모델·API·운영 문서를 추가하고 OpenAPI, route inventory, document catalog를 갱신했다.

### 검증
- `npm run typecheck`: 통과.
- `npm run build`: Next.js production build 성공, 신규 API routes 포함.
- `npm run docs:check`, `node scripts/api-surface.mjs check`, `node scripts/operational-schema-migration-audit.mjs`, `git diff --check`: 통과. V166 및 route inventory 일치 확인.
- 로컬 Docker PostgreSQL 격리 DB에 V166 DDL 적용은 통과했다. HTTP smoke는 앱 기본 스키마가 빠져 `/api/health` 503을 반환했으므로 DB 기반 API materialization 검증은 미완료다. 임시 서버/DB 컨테이너는 정리했다.
- 신규 이벤트·timestamp/API/schema 관련 테스트: 6개 파일 42개 통과.
- 배포 후 API 경로 확인에서 `/api/reports/latest`가 별도 URL로 남지 않고 Next.js 정적 segment `/api/reports`로 보이는 점을 확인했다. route inventory generator가 같은 논리 경로에 두 파일을 덮어쓰며 OpenAPI 응답 schema 연결을 누락하던 문서화 문제를 보완하고 `/api/reports?hours=12`를 표준 경로로 명시했다.
- 전체 Vitest: 306개 파일을 10개씩 31개 순차 shard로 실행해 모든 shard 통과(일부 skip 포함). 이전 worker OOM 문제를 shard 방식으로 우회했다.
- 수정 범위 밖 기존 테스트 실패는 없어 별도 기존 테스트 수정은 필요하지 않았다.
- `git diff --check`: 통과.

### 다음 개선
- DB 기반 runtime smoke는 앱 전체 migration schema를 가진 격리 DB에서 재실행한다. 운영 backfill은 표본·중복·종목 eligibility read-only 산정 후 별도 범위를 정한다.

### 개선 과제
개선 과제 ID: EVENT-LEDGER-2026-11-06-001
성과 판정: VERIFIED_FOR_RELEASE
근거: 코드·빌드·타입·문서/API 감사 및 306개 테스트 파일 shard 검증 통과. DB 기반 HTTP smoke는 미완료이며 배포 후 health/Flyway/read-only API 확인이 남았다.

### 커밋·푸시·배포
- 커밋 `ad12a696`을 `oci`에 push했고 OCI workflow `42196880567`이 성공했다. 운영 `/api/health` 및 `/api/events`, 12시간/티커 필터는 HTTP 200. `/api/reports`의 alias 동작은 이후 재확인하며 신규 report/status route 일부 응답이 read-only 확인에서 늦거나 404인 구간이 있어 안정화 점검이 남았다.
## [2026-11-06] 이벤트 보고서 운영 라우트 호환성과 standalone smoke 보강

### 목표
- 운영에서 404로 확인된 보고서 경로의 조회 대안을 제공하고, 배포 전 라우팅 누락을 감지한다.

### 반영
- `GET /api/events?view=report`를 기존 운영 확인된 이벤트 route에 연결했다. `view` 생략 시 기존 이벤트 목록 응답은 유지한다.
- API manual/OpenAPI/route inventory에 report view 파라미터와 응답 schema를 반영한다.
- standalone deploy verification이 `/api/events?view=report&hours=6`의 400 JSON `INVALID_HOURS` 응답을 확인해 handler의 존재를 검증한다.
- Linux Node 22/26 Vitest 환경에서는 Node의 built-in `localStorage`가 jsdom browser storage를 대체할 수 있어 `FeedPage` mount effect가 storage를 읽다 실패했다. `components/feed-page.test.tsx`에서 browser localStorage를 명시적으로 stub하도록 보강했다. 애플리케이션 코드의 브라우저 동작은 변경하지 않는다.
- 원인: 운영 `/api/reports`는 `x-nextjs-prerender: 1`이 포함된 HTML 404로 반환되어 보고서 handler에 도달하지 않았다. 기존 event route는 200으로 확인했다. collection-status API는 일부 확인에서 응답이 20초 이상 지연됐다.

### 검증 및 운영 적용
- 전체 Vitest 통과: 307개 파일 통과, 1개 skip; 1,590개 테스트 통과, 3개 skip. `npm run typecheck`, `docs:check`, `audit:api-surface`, `cron:check`, `git diff --check`, `npm run build` 통과.
- standalone 실행에서 report 분기 검증 오류 400 JSON, 기존 `/api/reports` 검증 오류 400 JSON, DB 미구성 상태의 `/api/events?hours=12` 표준 503 JSON을 확인했다. 운영 DB 접근 또는 쓰기는 실행 smoke에 포함하지 않았다.
- `components/feed-page.test.tsx` 단독 재실행: 1/1 통과. Node 22 Linux 전체 테스트: 307개 파일 통과, 1개 skip; 1,590개 테스트 통과, 3개 skip. HOSTNAME bind와 localStorage test stub을 포함한 Windows `npm run deploy:verify` 최종 재실행도 통과.
- Node 22 Linux에서 build, standalone browser/API runtime smoke, typecheck, docs, API/auth/KIS/cron audits가 통과했다. 컨테이너가 Windows worktree CRLF를 tar 복사한 뒤 `bash -n`에서 실패했으나, `git ls-files --eol`로 OCI 대상 shell 파일은 index LF/worktree CRLF임을 확인했다. 이 오류는 GitHub의 Linux checkout이 아닌 로컬 Linux 재현 wrapper의 줄바꿈 입력 차이다.
- OCI run `42202406076`, `42203831528`, `42206248569`는 각각 22초, 18초, 19초 후 `Verify deployment`에서 실패해 package/SSH/deploy를 건너뛰었다. 익명 Actions 화면은 세부 로그를 제공하지 않는다. 별도로 Linux standalone이 상속된 `HOSTNAME`에 bind해 loopback smoke가 실패하는 것을 재현하여 verifier에 `HOSTNAME=127.0.0.1`을 지정했다. 이후 CI 결과에서 수정 여부를 확인한다.
- `.gitignore`에서 `reports/`를 `/reports/`로 한정해 루트의 로컬 reports 출력 제외는 유지하고 `app/api/reports/route.ts` 및 latest alias를 Git에 포함했다. OCI 원격 빌드 실패 원인이 이 ignore 패턴이었음을 run `42209511456` 로그의 Module not found 메시지로 확인했다.
- 수정 후 `npm run deploy:verify` 통과: production build 107 pages 및 `/api/reports`, `/api/reports/latest` route 생성; standalone/OpenAPI 47 read paths/API/browser desktop·mobile smoke; Vitest 307 files (1 skipped), 1,590 passed/3 skipped; typecheck, docs/migration V166, API surface 185 routes/47 public GET, verify-scope/KIS/Bearer/OCI cron 감사 성공.
- GitHub Actions 로그 확인 결과 앞선 세 실패(run `42202406076`, `42203831528`, `42206248569`)와 `42209511456`은 모두 build의 module resolution failure였다. 이전 HOSTNAME 및 localStorage 가설은 해당 실패 원인이 아니었으며, 현재는 불필요한 코드 변경 없이 경로 누락 원인을 수정했다.
- 수정 커밋 `f9c653df`를 `oci`에 push했다. OCI run `42211364948`은 Verify, standalone package, SSH, upload, Activate release 전 단계 성공으로 완료됐다. 운영 공개 GET에서 `/api/reports?hours=12`, `/api/reports/latest?hours=12`, `/api/events?view=report&hours=12`, `/api/collection-status`, `/api/events?hours=12`가 모두 HTTP 200 JSON을 반환했다. 최근 12시간 item은 0건, collection sources는 2건이다. 운영 직접 DB 접근/쓰기 smoke는 수행하지 않았다.
- 변경 파일: `app/api/events/route.ts`, `app/api/events/route.test.ts`, `components/feed-page.test.tsx`, `scripts/api-surface.mjs`, `scripts/verify-deploy.mjs`, Stockman 이벤트 API/운영/분석 문서, `public/openapi.json`, `docs/api/route-inventory.json`.
- 커밋·푸시: report route fix `1fe5501a`, 검증 이력 `3c467964`, HOSTNAME bind 보정 `e4c7b8f9`, Linux localStorage 테스트 보정 `d9ac7a34` 완료. OCI run `42209511456`도 Verify 단계의 production build에서 실패했다. 로그는 `app/api/events/route.ts`가 import한 `app/api/reports/route.ts`를 찾지 못했다고 명시했다. 원인은 `.gitignore`의 일반 `reports/` 패턴이 중첩 API 디렉터리까지 무시해 해당 route가 원격 Git tree에 누락된 것이다. `/reports/`로 범위를 한정하고 검증 후 별도 수정 커밋·푸시한다.

### 남은 개선
- `/api/reports`와 collection-status의 직접 route 404/지연 원인은 운영 artifact/server routing에서 추가 추적한다. report view smoke와 loopback bind는 release workflow의 구조 게이트로 유지한다.

\r\n
## [2026-11-06] 운영 이벤트 ledger 실패 진단 정보 공개 보강

### 목적 및 범위
- 배포 뒤 운영 `/api/collection-status`에서 market-rss `eventLedgerStatus=FAILED`, source `UNVERIFIED`, 12시간 report/events 0건을 확인했다. 기존 상태 DTO는 `fetched/stored/failed/errorCode`를 숨겨 실제 수집 실패와 정상 0건을 구분하기 어려웠다.
- event materializer의 개별 저장 실패를 PostgreSQL 원문 오류 없이 고정 코드로 집계하고, 공개 status/report에 실행 시각 및 제한된 실패 건수를 제공한다. 실패 메세지·접속정보는 공개하지 않는다.

### 변경
- `lib/stockman-events.ts`: DB error classifier, SEC/RSS row 실패코드 집계, collection status의 안전한 eventLedger summary 조회/검증.
- SEC/RSS cron route: materializer query-level 예외도 동일한 안전 error code로 기록.
- API 문서와 현황/운영 문서: 실제 OCI 배포 성공과 관측한 FAILED 상태를 반영.
- 테스트: DB 코드 분류 및 민감 메시지 비노출 분류 7개 추가.

### 검증 및 배포
- `npm test -- --run lib/stockman-events.test.ts`: 22 tests passed.
- Full `deploy:verify`: production build and standalone/browser smoke, 307 test files (1 skipped), 1,597 tests passed/3 skipped, typecheck, docs/migration V166, API/auth/KIS/cron audits passed.
- 커밋·푸시·배포: 미실행.

### 남은 위험 및 다음 확인
- 다음 배포 뒤 한 번 이상의 자동 cron 실행에서 `eventLedger.fetched/stored/failed/failureCodes`를 읽어 구체 오류를 확인하고, 오류를 수정한 후 `SUCCESS` 또는 정당한 `UNVERIFIED` 상태와 운영 데이터 누적을 확인한다.

## [2026-11-06] 원장 저장 API 운영 1건 재현 결과

- 공개 SEC disclosure GET에서 accession `0001511737-26-000076`이 기존 저장소에 있음을 확인했다. 같은 원본 ID 하나로 무인증 `POST /api/events/collect`를 호출했지만 HTTP 503 `EVENT_STORAGE_UNAVAILABLE`이 반환됐다. API가 원문/분석 입력을 받지 않고 기존 accession만 받는지 확인했고, 성공 저장은 발생하지 않았다.
- 배포된 collection status는 cron run이 실행 중인 시점에는 `UNVERIFIED`를 반환했다. 완료된 이전 run은 `SCHEMA_TABLE_MISSING`이었으나 누락 relation을 공개하지 않아 원인을 특정할 수 없다.
- DB 오류 메시지는 제한된 relation allowlist만 검사해 `SCHEMA_TABLE_MISSING_<KNOWN_TABLE>`로 세분화한다. 공개 collect API도 내부 메시지 대신 같은 안전 분류 코드를 반환한다. API route test가 원문 비밀 문자열을 응답에 노출하지 않는지 검사한다.
- 1건 수집 요청은 실패했으며 direct DB write는 수행되지 않았다. 수동 재시도보다 자동 cron status의 분류 결과를 우선 확인한다.


### 1건 재현 오류 진단 후속
- collect route는 SCHEMA_TABLE_MISSING_<KNOWN_TABLE> 형태의 안전 코드만 반환하도록 수정했고 누락 relation 분류 회귀 테스트를 추가했다. focused tests 29 passed, 전체 deploy:verify는 Vitest 307 files(1 skipped), 1,600 passed/3 skipped, build/runtime/browser/typecheck/docs/API/auth/KIS/cron gate 모두 통과했다.
- 운영 배포 및 자동 cron 재실행 후 /api/collection-status와 동일 accession 1건을 다시 확인해 실제 누락 relation을 확인한다.

## [2026-11-06] 운영 누락 V141/V142 테이블 복구 migration

### 목적 및 근거
- 배포된 안전 진단에서 `SCHEMA_TABLE_MISSING_SEC_CODEX_ANALYSIS_QUEUE`와 `SCHEMA_TABLE_MISSING_MARKET_RSS_LLM_ANALYSES`를 순차 확인했다. 기존 V141/V142 정의의 두 source-analysis relation이 운영에서 누락되어 event materializer의 LEFT JOIN이 실패했다.
- 임의 신규 schema가 아니라 코드가 이미 참조하는 기존 source table contract를 forward-only migration으로 복구한다. 기존 행은 삭제·덮어쓰기 하지 않는다.

### 변경
- `db/migration/V167__restore_missing_source_analysis_tables.sql`: V141 RSS analysis revisions/agent state/index와 V142 SEC Codex queue/index를 원 migration DDL과 같은 column/constraint/index 계약으로 `IF NOT EXISTS` 생성.
- `db/README.md`, Stockman current-analysis/operations 및 `docs/ERROR_HANDLING.md`에 누락 원인, 복구, 운영 검증 기준 기록.

### 검증 / 배포 상태
- 적용 전: migration DDL review와 전체 deploy:verify 실행 예정.
- 운영 write: migration은 OCI release workflow만 적용한다. source POST는 아직 재실행하지 않았다.
- 커밋·푸시·배포: 미실행.

### 다음 확인
- V167 적용 후 다음 RSS/SEC cron 완료 후 `/api/collection-status`에서 sourceStatus/eventLedgerStatus/count/errorCode를 확인한다. 0건이면 `/api/disclosures` 원본과 비교해 source materialization scope/공통주 eligibility를 추적한다.

### 2026-11-06 후속 운영 검증
- 배포 결과: OCI workflow `42219588759` 성공, V167 code/migration release 활성화 완료.
- 운영 확인: `/api/events?hours=12` 및 `/api/reports/latest`는 200 JSON, 각각 0 이벤트/0 검증 호재. `/api/health`는 200. `/api/collection-status`는 반복 GET에서 20초 이상 응답이 없어 수집 결과를 검증할 수 없음.
- 제한된 재현: 기존 SEC 원본에서 활성 common 여부가 확인되지 않은 accession 1건의 멱등 collect 결과 fetched=0/stored=0을 확인. 새 이벤트 저장을 증명하지 않으며 bulk write는 하지 않음.
- 변경: `listStockmanCollectionStatus`의 automation history query를 8초 PostgreSQL `statement_timeout`이 적용되는 read-only transaction에서 실행하게 하고 route 회귀 테스트를 추가했다.
- 검증: route focused test 통과(1/1); `npm run deploy:verify` 통과: production build 107 static pages, standalone/runtime/browser smoke, Vitest 308 files (1 skipped), 1,601 passed/3 skipped, typecheck, docs/API/auth/KIS/cron gates 통과.
- OCI 후속 배포 `42223031296` 활성화 성공. 운영 status GET이 503을 8.4초에 반환해 statement timeout 작동을 확인했다. 이는 성공적인 collection status가 아니라 latest-run query가 timeout됐다는 관측이다.
- 원인 개선: `automation_runs`의 `DISTINCT ON` 최신 실행 조회를 module별 인덱스 lookup (`ORDER BY started_at DESC LIMIT 1`)으로 교체해 불필요한 전체 module history scan을 제거했다.
- 검증: 두 번째 `npm run deploy:verify` 통과 (build, standalone/runtime/browser smoke, Vitest 308 files/1 skipped, 1,601 passed/3 skipped, typecheck, docs/API/auth/KIS/cron gates).
- 커밋/배포: commit `07409bb9`를 `oci`에 push. OCI run `42225415268` 성공.
- 운영 재확인: `GET /api/collection-status` 200/0.55초; 첫 관찰에서는 market-rss RUNNING이었으나 13:35 UTC에는 market-rss event ledger SUCCESS (fetched=500, stored=500, failed=0), `sec-realtime` ledger SUCCESS (fetched=0, stored=0). `GET /api/events?hours=12` 339건, ticker DRK history 3건; 표본은 UNVERIFIED. `GET /api/reports/latest`는 검증 호재 0건으로 원문 검증 전 호재로 잘못 승격하지 않았다.
- 남은 확인: market-rss 실행 완료 후 SUCCESS/PARTIAL_SUCCESS와 stored 수를 다시 확인하고, SEC 원본 materializer의 0건 원인(서명된 filing event/common-stock eligibility)을 운영 상태 요약 및 source 데이터와 대조한다.

### SEC/RSS source coverage 진단 개선 진행
- 운영 status의 `sourceStatus=UNVERIFIED`는 RSS 요약의 배열 압축과 SEC cron 요약에 `submissionCoverage`가 없어서 실제 성공/실패를 판별하지 못하는 상태였다.
- SEC cron 요약에 요청/성공/실패 CIK 및 수집·신규 제출 수 집계를 추가하고, RSS compact source result의 전체 source count/ingest failure/article insert count를 status API에 제한적으로 노출하도록 수정.
- source coverage에 맞춰 `SUCCESS`/`PARTIAL_SUCCESS`/`FAILED`/`UNVERIFIED`를 산출하는 순수 분류기와 회귀 테스트를 추가. 원문 오류 및 CIK 목록은 공개하지 않는다.
- API 사용 문서의 collection-status 응답 설명을 갱신. focused source tests 36 passed, typecheck passed. 전체 deploy:verify 및 운영 배포/실데이터 status 재확인은 진행 중.

### SEC accepted time과 RSS published time 분리 수정 진행
- 운영 coverage API가 `configuredCikCount=0`, `fetchSuccessCikCount=0`, `submissionCount=0`을 확인했다. 따라서 SEC submissions sync가 현재 실행 대상 CIK 없이 성공 no-op을 기록하고 있었다.
- SEC 공시 RSS 기사에는 `published_at`이 있으나 정규 SEC submissions에서 확인된 `acceptance_datetime`은 없을 수 있다. 기존 시간창의 `COALESCE(accepted_at,published_at)`는 서로 다른 의미의 시각을 혼용했다.
- `/api/events` 필터·정렬·`eventOccurredAt` 및 보고서 표시에서 SEC_EDGAR는 accepted_at만, 기업/RSS는 published_at만 쓰도록 변경하고 회귀 테스트/API 문서 추가.
- SEC CIK universe는 운영상 SEC 요청 범위와 호출량을 결정하므로 현재 환경 설정을 임의 변경하지 않는다. 사용 가능한 공개 SEC Atom/RSS의 원문은 기존 market-rss 경로에 계속 저장한다.
- 검증/배포: focused event tests 33 passed, 전체 deploy:verify 통과 (Vitest 308 files/1 skipped, 1,610 passed/3 skipped; build, standalone, browser, typecheck, API/auth/KIS/cron audits). commit `60337eb6`, OCI workflow `42232437604` success.
- 운영 확인: `/api/collection-status` 200; market-rss source 3/3 SUCCESS, failures 0, insertedArticleCount 203, event ledger 500/500. SEC realtime coverage는 requested CIK 0, submissions 0, ledger 0. `/api/events?hours=12` total 217, SEC_EDGAR 0, report positive count 0. Official SEC RSS source is running, but exact accepted time and SEC submissions normalization require a configured CIK universe.
- 남은 승인 범위: 선택된 SEC issuer CIK 목록, existing small-cap universe mode(시총 ≤$100M), 또는 전체 미국 보통주 SEC RSS accession별 acceptance lookup 중 어느 운영 범위를 사용할지 확인이 필요하다. 현재 SEC 수집 대상을 임의로 확대하지 않았다.

## [2026-11-06] 공식 SEC RSS accession의 bounded Submissions 보강

- **목적/근거**: 운영 status에서 SEC RSS source는 정상 수집되지만 SEC Submissions 설정 CIK가 0이고 정규화 SEC 이벤트가 0건인 점을 확인했다. RSS 게시시각을 SEC 접수시각으로 가장하지 않고, 이미 저장된 공식 SEC RSS의 accession을 기존 SEC Submissions 경로에 연결한다.
- **범위/변경 파일**: `lib/sec-edgar-repository.ts`에 미정규화 accession 기반 issuer CIK 검색을 추가했다. enabled 미국 거래소 `COMMON_STOCK` 마스터가 RSS ticker와 일치하는 후보만 뽑고 기본 10, 최대 50 CIK/실행으로 제한한다. `app/api/cron/sec-edgar/route.ts`는 설정 CIK와 RSS 후보를 deduplicate하여 기존 `syncSecCompany`를 재사용한다. `lib/stockman-events.ts`의 공개 coverage에 configured/RSS candidate/requested counts를 포함한다. `lib/sec-rss-issuer-candidates.test.ts`에 필터와 배치 상한 회귀 검사를 추가했다.
- **문서**: current analysis, architecture, API 및 operations에 source 연결, timestamp 구분, batch 범위와 미배포 상태를 기록했다.
- **인증/호환성**: 공개 disclosure GET 및 기존 원본 ID 기반 event collect POST의 무인증 정책을 유지한다. 기존 SEC/RSS source API·테이블을 변경하지 않고 새 migration을 추가하지 않았다.
- **검증**: focused Vitest 2 files / 37 tests passed. `npm run deploy:verify` 통과: production build, standalone runtime/API smoke, desktop/mobile browser hydration, Vitest 309 files(1 skipped) 1,614 passed/3 skipped, typecheck, docs/migration/API/auth/KIS/cron audit 모두 성공. `git diff --check` 통과.
- **운영/커밋 상태**: 운영 DB 직접 변경 및 backfill은 하지 않았다. commit `b11e5439`를 `oci`에 push해 OCI run `42236863405`가 실행됐다. 배포 뒤 새 `/api/collection-status` 응답에서 RSS 후보 coverage 필드가 나타나 새 코드 활성화를 확인했다.
- **운영 관측/추가 안전 조정**: 첫 SEC cron 실행이 아직 종료되지 않아 추가 점검했다. RSS 후보를 기존 full-document collector로 넘기면 범위가 accession metadata lookup을 넘어갈 수 있음을 발견했다. RSS candidate CIK는 Submissions metadata만 동기화하고 XBRL/회사 전체 원문 수집은 명시 설정 CIK에 한정하도록 `app/api/cron/sec-edgar/route.ts`를 보정했다. 관련 분석/architecture/operations 문서도 이에 맞춰 수정했다.
- **남은 위험/다음 단계**: 공식 SEC RSS URL에 issuer CIK/accession이 있는 행만 후보가 된다. RSS ticker가 보통주 마스터와 불일치하면 fail-closed로 제외된다. 최초 운영 cron 실행 완료와 source coverage 확인 후 추가 범위 제한을 전체 검증·배포해야 한다.

### 운영 배포 후속 기록
- `b11e5439`를 `oci`에 배포: workflow `42236863405` success. `/api/collection-status`에서 `rssCandidateCikCount` 등 새 fields가 노출되어 해당 앱 코드가 운영에 활성화된 것을 확인했다.
- 첫 실행을 관찰하며 RSS issuer 후보에 전체 누락 원문 collector까지 연결될 수 있음을 발견해 Submissions-only 제한을 추가했다. 전체 `npm run deploy:verify` 통과(309 test files, 1,614 passed/3 skipped, build/runtime/browser/typecheck/docs/API/auth/cron gates 성공) 후 `ec0cf692`를 `oci`와 작업 branch에 push했다. OCI workflow `42239656706` success; 운영 `/api/health` 200.
- 2026-11-06 15:10 UTC latest `sec-realtime` row는 `UNVERIFIED`, `sourceCoverage=null`, `eventLedger=UNVERIFIED`, finished 15:10:07로 확인되어 SEC candidate fetch 효과는 아직 검증되지 않았다. UTC 15시대는 KST 토요일 00시로 default weekday schedule 밖일 수 있으나 운영 DB schedule은 확인하지 않았다. 직접 DB 쓰기/backfill은 하지 않았다.
- 다음 개선/검증: 첫 schedule-active run에서 new coverage fields의 실제 값, SEC official accepted_at 기반 정규 event, 중복 재실행, 12시간 API 노출을 검증한다. RSS 후보 selection 실패/재시도 횟수의 영구 queue와 backoff는 현재 테이블 없이 구현되지 않았으며, operational attempt diagnostics가 부족하면 보강한다.

### SEC RSS issuer 후보 입력 검증 후속
- 운영 무인증 GET `/api/market-news?source=SEC_EDGAR&hours=24&pageSize=10`의 실제 항목을 확인했다. 최근 SEC feed는 Form 4, 13F, 424B 등 다양한 공식 filings를 포함하고 sample 대부분 `detectedTicker=null`이다. 기존 신규 후보 query의 `a.detected_ticker IS NOT NULL` 조건은 SEC CIK 후보 coverage를 크게 누락할 수 있었다.
- `lib/sec-edgar-repository.ts:loadPendingSecRssIssuerCiks`를 수정해 SEC Archives URL에서 issuer CIK를 추출하고 기존 SEC 공식 ticker master `sec_companies`와 enabled US `COMMON_STOCK` universe의 ticker 교집합으로 확인한다. RSS ticker parser 추정은 후보 판별에 사용하지 않는다. 모르는 CIK와 inactive/special instrument는 계속 fail-closed다.
- current analysis, architecture, operations 문서에 운영 표본 근거와 수정/미배포 상태를 기록했다. focused candidate tests 4/4 pass; full `deploy:verify` 및 배포는 진행 중이다. 다음 배포 이후 SEC schedule-active cron evidence가 확보되기 전까지 실제 SEC event coverage는 검증 미완료 상태다.

#### Official CIK 후보 보완 배포 결과
- Full `npm run deploy:verify` 통과: Vitest 309 files(1 skipped), 1,614 passed/3 skipped; production build, standalone/browser smoke, typecheck, docs/API/auth/KIS/cron audits 성공.
- commit `6d17f4a7`를 `oci` 및 작업 branch에 push. OCI workflow `42244119303` success. 운영 전환 중 health GET이 한 번 timeout됐으나 재시도 HTTP 200; `/api/collection-status`에서 새 SEC coverage DTO가 계속 제공되는 것을 확인했다.
- 2026-11-06 15:35 UTC SEC latest run은 KST 토요일 00:35에 시작/종료한 no-summary row(`UNVERIFIED`, coverage null)다. SEC 실제 fetch/저장 효과는 미검증이며, 다음 평일(active schedule 추정) 실행에서 확인한다. 운영 DB 직접 쓰기/backfill은 수행하지 않았다.
- 후속 read-only API 검증(2026-11-06 15:47 UTC): 무인증 `/api/events?hours=12&page=1&pageSize=1` HTTP 200, total 227; `/api/reports/latest` HTTP 200, 보고서 항목 0(검증 호재 없음); `/api/collection-status` HTTP 200, SEC `UNVERIFIED`/coverage null, latest run 15:45:02 UTC. KST 토요일 00:47이므로 schedule-active SEC candidate fetch를 입증하지 않는다. 공개 API 호환성과 “검증 전 호재로 노출하지 않음”은 재확인했다.
- 후보 식별자 검증(2026-11-06): 소스에서 `parseMarketRss`가 Atom `<id>`를 `item.id`에 저장하고, SEC 후보 query는 `accession-number=0000000000-00-000000` 형식을 읽는 것을 확인했다. 공식 SEC latest filings Atom을 읽기 전용으로 조회해 실제 `urn:tag:sec.gov,2008:accession-number=0001839882-26-055381` ID와 `/Archives/edgar/data/{CIK}/...-index.htm` 링크 형식이 query 가정과 일치함을 확인했다. PowerShell header 검증 오류 후 curl의 User-Agent로 재시도 성공.
- DB 쿼리 검증: 운영 DB를 건드리지 않고 일회성 `postgres:16-alpine` 컨테이너에 임시 fixture를 넣어 후보 SQL을 실행했다. SEC ticker null, 이미 등록된 accession, 잘못된 accession, ETF-only 및 OTC-only 마스터 케이스를 포함했고 적격 CIK `{0000000123}`만 선택됨을 확인한 뒤 컨테이너를 정리했다. 이 결과는 SQL 조건 검증이며 운영 SEC cron의 실제 저장 성공을 대체하지 않는다.
- 검증/운영: 코드 변경은 없고 이 검증 및 근거만 문서화했다. 운영 SEC cron은 여전히 실제 SEC candidate coverage를 제공하지 않아 최종 runtime acceptance가 남아 있다. 운영 데이터 변경/배포는 하지 않았다.
- 최종 로컬 검증: `npm run deploy:verify` 종료코드 0. Production build, standalone runtime/API smoke, Chrome desktop/mobile hydration, 전체 Vitest(309 files passed, 1 skipped; 1,614 passed, 3 skipped), typecheck, docs/migration/API/auth/KIS/OCI cron audits가 통과했다. 이번 변경은 개발 로그 문서만이며 코드/운영 배포는 없다.

## [2026-11-06] SEC 운영 API 재확인 및 운영 문서 최신화

- **목적/범위**: 활성 목표의 completion audit을 위해 공개 운영 API, 최신 repository 및 SEC schedule/source 경로를 다시 확인했다. 운영 endpoint는 read-only GET만 사용했다.
- **현재 운영 증거(16:07 UTC)**: `/api/collection-status` HTTP 200. `market-rss` SUCCESS; SEC_EDGAR 포함 3 sources, ingestion failure 0, event ledger fetched/stored 109/109, failed 0. 같은 응답의 `sec-realtime`은 UNVERIFIED, `sourceCoverage=null`, summary 없는 16:05 UTC run. `/api/events?hours=24` HTTP 200, 전체 667건 페이지를 순회했으나 `sourceType=SEC_EDGAR`는 0건. `/api/market-news?source=SEC_EDGAR&hours=24&pageSize=100`은 100건/16건 ticker-detected였으며 후보 판정은 추정 ticker가 아닌 official CIK/ticker master + active common-stock universe를 이용한다.
- **코드 근거**: OCI timer는 5분마다 `scripts/oci-cron.sh`를 실행하고 sec-edgar POST를 포함한다. route의 실제 활성 schedule은 DB feature settings(`sec-realtime`)에 의해 결정되며 source default는 평일이지만 운영 DB schedule은 공개 GET에서 읽을 수 없다. 상세 automation debug는 관리자/cron 인증이 필요하므로 우회하지 않았다. SEC source feed의 SUCCESS는 Submissions normalizer의 성공으로 간주하지 않는다.
- **문서 변경**: `docs/stockman-events-operations.md`에서 보완 코드 배포 상태 및 V166/V167 적용 사실을 정확히 반영하고 과거 CIK=0 관측에 시각을 명시했다. 현재 운영 요약에 RSS ingest와 SEC Submissions runtime 증거를 분리해 남겼다.
- **검증/운영**: 문서 및 실행 결과만 변경했다. `npm run deploy:verify` 종료코드 0: build, standalone runtime/API smoke, desktop/mobile hydration, Vitest 309 files passed/1 skipped (1,614 passed/3 skipped), typecheck, docs/migration/API/auth/KIS/cron audits 통과. 운영 DB 쓰기, cron 수동 호출, 배포, backfill, 삭제는 수행하지 않았다.
- 무인증 쓰기 경계 확인: 운영 `/api/events/collect`에 인증 헤더 없이 `{"source":"INVALID"}`를 POST해 HTTP 400 `UNSUPPORTED_SOURCE`를 받았다. 입력 검증에서 반환되므로 원장 저장을 수행하지 않았다. 유효 SEC accession 경로의 무인증 materialization은 route unit test에서 source repository 호출까지 검증돼 있다.
- 해당 운영 확인을 포함한 최종 로컬 `npm run deploy:verify`도 종료코드 0으로 재통과했다(309 test files passed, 1 skipped; 1,614 passed, 3 skipped; build, runtime/browser smoke, typecheck, docs/migration/API/auth/KIS/cron gates).

## [2026-11-06] SEC active-schedule run 대기 중 운영 재확인

- **확인 범위**: 배포된 앱의 공개 GET만 호출하고, 현재 branch/log와 운영 문서를 재검토했다. 내부 관리자/cron 진단, DB 쓰기, 수동 cron 실행은 하지 않았다.
- **운영 상태(16:26 UTC)**: `/api/collection-status` HTTP 200. `market-rss` SUCCESS, SEC_EDGAR 포함 source 3개, ingestion failure 0, inserted 204, ledger fetched/stored 114/114/failed 0. `sec-realtime` 최신 16:25 UTC row는 UNVERIFIED이며 coverage/summary null. `/api/events?hours=24` 663개 전수 pagination에서 SEC_EDGAR 0, `/api/events?hours=12` total 229. `/api/reports/latest` HTTP 200, count 0. Unverified 기사는 호재 보고서에 들어가지 않는 것을 확인했다.
- **Schedule 판단**: 런타임 source 기본 `sec-realtime.activeDays`는 월–금이고 `lib/schedule-time.ts`는 KST를 사용한다. 이 관측은 KST 토요일 01:25대다. 운영 DB에서 저장한 setting은 공개 API에 노출되지 않으므로 실제 schedule 상세는 미확인으로 유지한다.
- **문서/다음 단계**: `docs/stockman-events-operations.md`에 최신 공개 status와 정확한 건수를 추가했다. 다음 실제 활성 sec-realtime 실행에서 source coverage, SEC accession accepted time, event ledger 저장/멱등성 및 12시간 조회를 확인한다. 이번 턴에는 운영 변경과 배포를 하지 않았다.
- **검증**: 문서 변경 후 `npm run deploy:verify` 종료코드 0; production build, runtime/API/browser smoke, Vitest 309 files passed/1 skipped (1,614 passed/3 skipped), typecheck, docs/migration/API/auth/KIS/OCI cron gates 모두 통과.
- **SEC cron 회귀 테스트 보강**: route 전용 test가 없던 것을 확인해 `app/api/cron/sec-edgar/route.test.ts`를 추가했다. RSS issuer CIK metadata-only 처리, configured/RSS CIK union과 dedupe, RSS 후보에 XBRL/full-document collector를 적용하지 않는 경계, outside-schedule skip, 후보 query failure의 500 구분을 검증한다. focused Vitest 1 file/4 tests 통과; 전체 `npm run deploy:verify`도 종료코드 0으로 통과(310 files passed/1 skipped; 1,618 passed/3 skipped; build/runtime/browser/typecheck/docs/migration/API/auth/KIS/cron gates). 운영 설정/DB에는 영향 없음.
## [2026-11-07] SEC RSS issuer sync schedule 분리 및 collection-status 신뢰성 보강

### 목적 및 원인
- 2026-11-06 read-only 운영 점검에서 SEC feed/source는 신규 항목을 제공했으나 SEC event ledger는 비어 있었고, 최신 SKIPPED automation run이 앞선 실제 RSS 성공 상태를 가려 collection-status가 UNVERIFIED로 보이는 문제를 확인했다.
- SEC RSS 후보 Submissions 수집은 module registry의 sec-edgar schedule, 설정 CIK의 확장 SEC 작업은 sec-realtime schedule을 각각 적용해 주말에도 candidate coverage를 수행하고 서로 다른 실행 범위를 유지한다.

### 변경
- app/api/cron/sec-edgar/route.ts 및 테스트: RSS issuer 후보 동기화를 sec-edgar automation run으로 분리, configured CIK 중복 동기화 제외, 후보 모듈 조회/동기화 실패를 coverage와 HTTP 503으로 반환. 기존 sec-realtime schedule에서는 설정 CIK/XBRL/문서 분석 흐름 유지.
- lib/stockman-events.ts 및 테스트: collection status에 sec-edgar coverage를 분류하고 최신 non-SKIPPED run을 RSS/SEC 모듈별로 표시. 후보 lookup 성공 후 후보 0건은 SUCCESS로 구분.
- 이벤트 API/운영 문서 갱신. 운영 DB 직접 변경, cron 수동 호출, backfill 없음.

### 검증 및 배포 상태
- SEC cron 및 event collection status focused tests 43/43 통과, npm run typecheck 및 git diff --check 통과.
- 최초 typecheck에서 union 타입의 skipped 속성 narrowing 오류 2건 발견했으며 속성 존재 여부 narrowing으로 수정했다.
- 최종 코드 반영 후 npm run deploy:verify 종료코드 0: production build, local runtime/API/browser smoke, Vitest 310 files passed/1 skipped (1,624 passed/3 skipped), typecheck, docs/migration/API/auth/KIS/OCI cron gates 통과.
- 변경은 feature branch에 커밋 준비 상태이며, 운영 OCI 배포와 실제 운영 schedule/SEC accession 검증은 별도 승인을 기다린다. 운영 DB 직접 변경, cron 수동 호출, backfill은 하지 않았다.
## [2026-11-07] SEC RSS cron 시간 제한 내 accession 전용 저장 경로와 OCI 배포 확인

### 목적 및 원인
- 커밋 7163b07f를 OCI에 배포한 뒤 공개 health API는 정상(200/status=ok)이었으나, collection-status의 sec-edgar run이 장시간 RUNNING으로 남았고 /api/events?hours=24 전체 pagination 663건에서 SEC_EDGAR 이벤트가 0건이었다.
- 코드 확인 결과 기존 syncSecCompany()는 RSS 후보의 단일 accession 처리에도 CIK 전체 SEC filing history JSON 파일을 추가 요청하고 모든 제출을 개별 upsert한다. OCI cron HTTP 제한은 180초라 RSS 보강에 과도한 범위이며 정상 종료/coverage를 검증하기 어려웠다.

### 변경
- lib/sec-edgar-repository.ts: 별도 기존 전체 syncSecCompany() 동작을 보존하면서 공식 recent Submissions 문서에서 RSS가 지정한 accession만 저장하는 syncSecRssCandidateSubmissions()를 추가했다. 원본 Submissions 응답은 기존 content-addressed snapshot에 보관하고, 일치한 accession row 및 분류를 batch upsert한다.
- RSS candidate query는 최근 90일 SEC_EDGAR 원문에서 issuer별 미저장 accession을 그룹핑한다. SEC recent metadata와 일치하지 않은 accession 수는 collection coverage에서 숨기지 않는다.
- app/api/cron/sec-edgar/route.ts와 단위 테스트, collection-status coverage sanitizer, API/운영 문서를 갱신했다. 기존 configured CIK의 전체 SEC 동기화/XBRL/원문 분석 및 기존 API는 변경하지 않았다.

### 검증 및 배포
- focused Vitest 4 files/50 tests 통과, npm run typecheck 통과.
- OCI 최초 schedule 분리 배포: commit 7163b07f, Actions run 42259771792 성공(verify/package/upload/activate 전체 success). 운영 GET은 health OK였으나 SEC event normalization은 미검증이어서 후속 수정으로 이어졌다.
- accession 전용 경로 focused tests 4 files/50 tests 통과 및 전체 npm run deploy:verify 종료코드 0. Production build, local runtime/browser smoke, Vitest 311 files passed/1 skipped (1,627 passed/3 skipped), typecheck, docs/migration/API/auth/KIS/OCI cron gates 통과.
- 새 코드 배포는 별도 commit/OCI workflow로 이어간다. 이번 수정에서 운영 DB 직접 변경, 수동 cron 호출, backfill은 하지 않았다.

### SEC Submissions UTC acceptance timestamp normalization
- **Root cause**: read-only public coverage after commit `8dea51b3` showed 33 SEC submissions stored, but zero normalized SEC events. The official `data.sec.gov/submissions/CIK0000351998.json` response provided DAIO accession `0001654954-26-009591` with ISO UTC `acceptanceDateTime` (observed `2026-11-06T17:58:58.000Z`). After adding parser support, runtime still reported fetched=0: the SQL ISO matcher used a double-escaped dot, so PostgreSQL regex did not match fractional seconds.
- **Change**: accept validated ISO UTC `Z` timestamps unchanged while preserving the legacy ET conversion; let the materializer query both formats with a `[.]` fractional-second matcher that is independent of SQL backslash escaping. Add parser coverage and update operations guidance. Null/malformed timestamps continue to fail closed.
- **Scope and verification**: local code/docs/tests were verified before release. No production DB write, manual cron, backfill, or deletion was performed.
- **Regression detection / remaining risk**: tests pin both the ISO UTC instant and legacy DST conversion and reject malformed values. After deployment, use public read-only status/events GETs to verify materializer fetched/stored counts and SEC event visibility; if those stay zero, inspect candidate row filters and status without treating zero as successful normalization.

- **Post-release diagnosis**: read-only production status after commit `cf5815a2` showed SEC source fetch 10/10 and 24 submissions inserted, but ledger fetched/stored=0. The SQL matcher source used `\\.` inside a PostgreSQL standard string, so the fractional-second ISO timestamp was excluded before parser execution. Replacing it with `[.]` removes that escaping ambiguity. No production write/cron/manual backfill was performed.
- **Regression check**: reran `npm run deploy:verify`; exit 0 (311 files passed/1 skipped, 1,630 passed/3 skipped; build/runtime/browser/typecheck/docs/API/auth/cron checks passed). Focused event+cron tests: 46/46.

### SEC RSS materializer bounded to candidate accessions
- **Purpose/evidence**: after deployment `b6cc312b`, SEC feed sync completed but the SEC event materializer remained RUNNING across cron intervals and had no new events yet. The RSS candidate run already knows the exact accession set, while the materializer's default path scans up to 500 pending SEC rows and persists them serially. This broad scan can consume the cron window and obscures whether RSS candidate rows normalize.
- **Change**: let the materializer accept a bounded accession array while retaining its existing all-pending and single-accession call forms. The RSS-candidate schedule now materializes only the accession values it just synchronized; configured sec-realtime still uses the unchanged broad materializer path. Candidate CIK/accession deduplication is preserved.
- **Tests**: add route assertions that RSS schedule passes only candidate accession IDs, including the configured-CIK exclusion case. Focused tests passed: event/parser + SEC cron + collect routes (51 tests). Full `npm run deploy:verify` passed: Vitest 311 files (1 skipped), 1,630 passed/3 skipped; build/runtime/browser/typecheck/docs/API/auth/cron gates all passed.
- **Operations**: no direct DB writes, manual cron calls, data deletion, or backfill. After release, verify status completion, fetched/stored counts, and SEC events through public GET only. After release, inspect the first completed bounded candidate run and event API. If fetched is positive but stored remains zero, investigate common-stock eligibility and candidate classification; do not claim completion from source-import success alone.

### SEC RSS materializer query plan refinement
- **Evidence**: the ISO timestamp matcher fix produced 15 verified SEC_EDGAR rows in the public 12-hour API, but collection-status runs repeatedly remained RUNNING while the materializer selected the broad pending set. The RSS schedule knows exact candidate accessions; its SQL parameter predicate also needs to remain indexable.
- **Change**: build an explicit `s.accession = ANY($3::text[])` clause only for bounded accession runs. Preserve an unbounded query for configured sec-realtime and a one-element array for the public single-accession materializer. Add query-shape tests to ensure bounded mode carries only accession IDs and leaves the full mode unchanged.
- **Verification**: focused event/materializer/cron/collect tests passed (54 tests). Full `npm run deploy:verify` passed: 312 test files passed/1 skipped, 1,633 tests passed/3 skipped, build/runtime/browser/typecheck/docs/API/auth/cron gates passed. Production remained read-only during this diagnostic; no DB write or manual cron was used.

### SEC RSS cron workload caps
- **Evidence**: public API confirms 18 verified SEC_EDGAR filings in the 12-hour event window and 0 analyzed bullish report entries. However, successive sec-edgar automation rows remain RUNNING and are replaced by the next scheduled invocation before coverage summary is exposed. The current query batches up to 10 issuer CIKs with every pending accession from 90 days, which can make one serverless run too large.
- **Change**: default RSS candidate execution to 5 CIKs and at most 10 latest pending accessions per CIK (`SEC_RSS_SYNC_CIK_LIMIT`, `SEC_RSS_SYNC_ACCESSIONS_PER_CIK` remain configurable, each clamped to 1–50). Successfully persisted accessions naturally leave the pending set; subsequent scheduled executions continue the backlog. Configured sec-realtime full sync and public APIs are unchanged.
- **Tests**: candidate SQL ranking/caps and route defaults are covered. The first full verify exposed one stale assertion in `sec-rss-issuer-candidates.test.ts` that still expected the unbounded accession aggregate; updated it for ranking and per-issuer limit. Focused candidate/cron/materializer tests now pass (15 tests). Full `npm run deploy:verify` passed: 313 test files passed/1 skipped, 1,635 tests passed/3 skipped; typecheck, docs/API/auth/cron gates, build, and runtime smoke passed. Production remains read-only; no manual cron/backfill/data mutation.

### 2026-11-06 — OCI 배포 후 SEC/RSS 상태 확인
- **범위**: 공개 상태·이벤트·보고서 API의 read-only 운영 확인.
- **결과**: OCI workflow `42282886377` 성공, health `ok`; sec-edgar 5 CIK/13 accession/13 events 저장 성공, market-rss 원장 110건 처리 성공, 두 실행 모두 failed=0. 공개 이벤트 목록에서 최근 이벤트와 VERIFIED SEC 이벤트 확인. 최신 호재 보고서는 아직 분석된 A/B/C가 없어 count=0.
- **변경 파일**: `docs/stockman-events-operations.md`, `DEVELOPMENT_LOG.md`.
- **검증/배포**: 공개 GET 확인. 이번 문서 변경은 현재 검증 후 커밋/푸시할 예정이며, 배포 여부는 후속 workflow 결과에 기록한다. 운영 DB 쓰기, 수동 cron/backfill은 수행하지 않음.

### 2026-11-06 — 문서 배포 및 최종 공개 API 재확인
- **배포**: docs-only commit `8957f660` OCI workflow `42286281701`이 GitHub workflow 페이지에서 `completed successfully`로 확인됐다.
- **운영 확인**: health `ok`; `/api/events?hours=12` total 267, 응답 100건 중 VERIFIED SEC 18건; `/api/collection-status`에서 sec-edgar 5/5 CIK fetch, 원장 stored 13/failed 0, market-rss SUCCESS 및 원장 stored 104/failed 0; report API 정상이며 approved A/B/C count=0.
- **무인증 저장 경로 확인**: POST `/api/events/collect`에 허용되지 않은 source를 인증 없이 전송했을 때 401이 아닌 입력 검증 HTTP 400 `UNSUPPORTED_SOURCE`를 반환했다. 유효한 저장 요청이나 운영 데이터 변경은 하지 않았다.
- **검증/범위**: 공개 endpoint 확인만 수행. sec-realtime은 해당 시점 UNVERIFIED로 남아 있었고, 검증된 분석 항목이 없어 보고서는 0건이다. DB 직접 수정·수동 cron/backfill은 하지 않았다.

## [2026-11-10] 비일봉 DB 누적 데이터 보존 및 OCI 배포

- 목적/범위: 일봉 데이터를 보존하면서 비일봉 운영 로그, 임시 큐, 분봉·관측 캐시의 무기한 누적을 제한한다.
- 변경: 보호된 `/api/cron/db-retention`을 공통 OCI cron에 연결하고, V168 concurrent index migration과 Flyway per-script 설정을 추가했다. KIS raw signal snapshot은 365일 보존하며 RSS·SEC snapshot 및 운영 데이터는 route의 retention 기준에 따른다. 기존 `health_probe_history`의 14일 자체 정리는 유지한다.
- 안전성: 테이블별 5,000행 단위 최대 3회 배치 정리, `FOR UPDATE SKIP LOCKED`, 일봉 테이블 제외, 보류 재시도·전송 상태 보존. concurrent index 실패 복구 절차를 `db/README.md`에 기록했다.
- 검증: `cron:check`, typecheck, deploy:verify의 전체 테스트·빌드·실행 smoke를 배포 전에 수행한다. 운영 적용 후 workflow 성공, health의 Flyway 버전, 보호된 cron 응답 및 정리 결과를 확인한다.
- 커밋·푸시·배포: 배포 진행 중이며 완료 시 workflow와 운영 확인 결과를 여기에 추가한다.
- 남은 위험: 운영 DB 연결은 애플리케이션 배포의 Flyway 단계에서만 확인한다. cleanup cron이 일부 테이블에서 실패하면 503으로 기록하며 다음 주기 재시도한다.
## [2026-11-10] OCI V168 retention migration 재배포 복구

### 목적 및 원인
- 비일봉 데이터 보존 배포 #1292에서 GitHub `Activate release` 10분 제한이 Flyway V168 concurrent index 생성 도중 만료됐다. 운영 앱은 이전 릴리스와 Flyway 167을 계속 제공했다.
- `CREATE INDEX CONCURRENTLY`는 중단 시 무효 인덱스를 남길 수 있고 Flyway non-transactional 실패 이력은 별도 복구가 필요하다.

### 범위 및 변경 파일
- `deploy/oci/stockman-activate`: V168 전용 preflight로 migration 대상 무효 인덱스만 concurrent drop하고, 실패 migration이 V168 하나일 때에만 Flyway repair를 호출한다. migration timeout을 40분으로 연장한다.
- `scripts/oci-flyway-v168-preflight.mjs`: 현재 schema의 Flyway 실패 이력 및 V168 SQL의 인덱스 목록만 검사한다. 다른 버전 실패 이력이 있으면 변경 전 중단한다.
- `.github/workflows/deploy-oci.yml`: preflight 스크립트를 standalone artifact에 넣고 archive 포함을 검사하며 activation step을 45분으로 연장한다.
- `scripts/check-oci-cron.mjs`: V168 한정 복구·긴 timeout·artifact 경로를 자동 검사한다.

### 검증 및 배포
- `npm run deploy:verify` 통과: production build, standalone runtime smoke 및 desktop/mobile hydration, 313 test files passed/1 skipped, 1,635 tests passed/3 skipped, typecheck, docs/API checks, KIS/auth/cron gates.
- `npm run cron:check`, `node --check scripts/oci-flyway-v168-preflight.mjs`, `git diff --check` 통과.
- 최초 #1292는 Activate release 10분 제한으로 실패해 앱 commit `06761a33`, Flyway 167을 확인했다. 복구 커밋 `39791459`의 #1293은 Verify/package/upload까지 통과했으나 Activate 도중 SSH가 `Connection reset by peer`로 끊겨 실패했다(2026-11-10 10:49 UTC). 원격 Flyway 완료 여부는 미확인이다.
- 이후 공개 root GET은 200을 반환했지만 `/api/health`는 20~60초 timeout, 보호된 debug health도 timeout되어 운영 DB/Flyway 버전을 읽지 못했다. 원격 상태를 안전하게 확인하기 전 재실행하지 않는다.
- #1293 종료 후에도 root 200, DB health timeout이 이어져 다음 activation 관측성을 보강한다. V168 preflight에 공식 node-postgres 설정 기준 15초 connection timeout, 60초 statement timeout과 단계별 stderr 로그를 추가했고 activation SSH에는 30초 server-alive probe를 설정했다. 변경 후 `deploy:verify`(313 files passed/1 skipped, 1,635 tests passed/3 skipped 포함), `cron:check`, Node 구문검사, `git diff --check` 통과.
- #1294는 preflight DB 연결 및 history/index 조회에 성공했고, invalid `kr_minute_fetch_logs_retention_idx`를 `DROP INDEX CONCURRENTLY`로 처리하려다 60초 `statement_timeout`으로 취소됐다. Flyway migrate에는 도달하지 않았다. PostgreSQL 공식 문서상 concurrent drop은 충돌 트랜잭션 완료를 기다린다. DB health diagnostics는 HTTP 503, pool total=10/idle=0/waiting=10을 반환했다. 반복 점검은 중단하고, 다음 preflight는 30초 넘은 xmin snapshot 보유 세션을 읽기 전용 확인해 있으면 로그에 PID/state/wait/transaction age를 남기고 무효 인덱스 변경 전에 중단하도록 한다.
- #1295 최초 실행과 안전한 failed-job 재실행 모두 SSH 연결은 유지됐지만, V168 preflight가 Flyway 전에 오래된 snapshot holder를 확인해 fail-closed했다. 최초 확인은 17개 holder였고 PID 4178222는 `idle in transaction`, age 5,544초, `ClientRead`; PID 4179132는 relation lock 대기였다. 재실행에서도 같은 PID가 `idle in transaction`, age 6,178초(약 103분)로 유지됐으며 active client/parallel worker snapshot들도 남아 있었다. DB pool 진단은 total=10/idle=0/waiting=10이었다. PID 종료는 미커밋 transaction rollback을 일으키므로 사용자 승인을 요청했으며 Flyway 168은 아직 적용되지 않았다.
- #1295의 추가 안전 재실행도 같은 preflight blocker로 중단됐다(2026-11-10 11:57 UTC). PID 4178222는 `idle in transaction`, age 6,734초(약 112분)로 계속 존재했고 PID 4179132의 relation lock 대기 및 다수 active/parallel worker snapshot도 확인됐다. 추가 재시도만으로 상태가 바뀌지 않아 중단했다. 사용자 승인 또는 운영자가 해당 transaction을 종료/자연 완료해야 Flyway 168을 진행할 수 있다.

### 남은 위험 및 다음 개선
- preflight는 V168이 만드는 인덱스명에 한정해 무효 객체를 제거한다. V168에 포함되지 않은 실패 이력이 있으면 자동 repair 없이 실패하므로 별도 수동 조사 대상이다.
- 재발 감지는 OCI activation의 GitHub timeout, Flyway migration 단계 로그 및 배포 후 schema version 확인으로 수행한다.

## [2026-11-10] 운영 RSS 7일 자동 정리 정책

- **목적/범위**: 운영 공통 DB retention cron에서 7일이 지난 RSS 기사와 호재 projection을 정리한다. RSS raw fetch snapshot의 180일 보존 및 SEC/DART filing은 바꾸지 않는다.
- **근본 원인**: V168 retention 경로가 `market_rss_fetch_snapshots` 180일 만료만 처리하고 기사 행은 보존했다.
- **변경 파일**: `app/api/cron/db-retention/route.ts`, `db/migration/V169__rss_article_retention_indexes.sql` 및 `.conf`, `lib/schema.ts`, `scripts/check-oci-cron.mjs`, OCI artifact workflow, DB/error handling 문서.
- **동작**: 발행시각이 있으면 `published_at < NOW() - INTERVAL '7 days'`, 없으면 `created_at`으로 만료한다. bullish projection은 자체 만료 또는 expired source article 참조로 먼저 지우고, 이후 부모 기사를 지운다. 기존 5,000행 batch/실행당 최대 3회/`SKIP LOCKED` 정책과 5분 cron을 사용한다.
- **검증**: `npm.cmd run cron:check`, `npx.cmd tsc --noEmit --incremental false`, `git diff --check` 통과. 사용자 지시에 따라 로컬 PostgreSQL `localhost:5432`에 직접 연결해 `stockman`/PostgreSQL 16.15/Flyway 161을 확인했다. `market_rss_articles`는 총 552행이며 552행이 7일 초과, null-date fallback은 0행이다. 로컬에 `market_rss_bullish_articles`가 없으므로 전체 retention endpoint는 실행하지 않았고 데이터 삭제도 하지 않았다. 기존 개발 로그의 #1295 기록에 따라 Flyway 168 preflight는 오래된 transaction snapshot과 DB pool exhaustion으로 중단된 상태이며 V168은 미적용으로 기록돼 있다. DB 세션 종료나 migration 실행을 재시도하지 않았다.
- **커밋/푸시/배포**: 보류. 운영 DB blocker 확인 및 사용 가능한 검증 통과 후 진행한다.
- **후속 확인**: 이번 재확인에서도 GitHub CLI는 이 Windows 환경에 없고 연결된 GitHub 도구는 public GET 중심이라 private deployment workflow 실행·OCI 호스트 접속을 할 수 없었다. 비밀이 포함된 secret store나 workflow 권한을 로컬에서 우회하지 않았다. 공개 `/api/health`는 DB 진단을 반환하지 않는다. 운영 V168의 적용 완료 여부도 확인할 수 없어 activation 재시도는 하지 않았다. 로컬 5432의 Flyway 161과 552개 만료 RSS 행은 이전과 같은 별도 로컬 DB 근거다. 로컬 DB 장기 snapshot holder는 0개였으나 운영 blocker 해소 근거가 아니다.
## [2026-11-11] 운영 RSS 보존정책 배포 blocker 재확인

- **목적/범위**: 11월 10일 준비한 RSS 7일 자동 삭제를 운영에 활성화할 수 있는지 재확인한다. 운영 DB write·세션 종료·workflow 재실행은 하지 않는다.
- **현재 근거**: GitHub 공식 Actions REST GET에서 최신 Deploy OCI run #1295 (`42808111103`, SHA `5a4ffbed`)가 2026-11-10 11:57 UTC에 `failure`로 완료된 상태를 확인했다. 공개 운영 `/api/health`는 이번 조회에서 25초 timeout, 보호된 `/api/admin/health-diagnostics`는 인증 없는 GET에 401을 반환했다. 따라서 운영 Flyway version과 현재 snapshot holder 상태를 이 환경에서 판별할 수 없다.
- **코드 상태**: RSS 7일 batch-delete, V169 concurrent index 및 5분 cron 통합은 로컬 작업트리에 준비되어 있으나 아직 oci에 push/배포되지 않았다. 로컬 5432는 운영 DB와 별개다.
- **다음 조치**: 운영 호스트에서 read-only Flyway version 및 `pg_stat_activity` snapshot holder 확인 후 DB pool/장기 transaction blocker를 운영자가 해소한다. 그 뒤에만 V168/V169 activation과 cron 결과 검증을 수행한다. 기존 V168 실패가 반복됐으므로 지금 자동 재시도나 PID 종료는 하지 않는다.
- **검증**: `npm.cmd run cron:check`, `git diff --check` 통과. 커밋·푸시·배포 미실행.
## [2026-11-11] OCI 운영 PostgreSQL 위치 정정 및 RSS 배포 재개

- **목적/범위**: 운영 DB 위치를 명확히 정정하고 RSS 7일 자동 삭제 배포를 계속한다. 노트북 로컬 DB와 OCI 서버 내부 PostgreSQL을 분리한다.
- **DB 위치 정정**: 노트북 `localhost:5432`는 Docker `stockman-postgres-local` 컨테이너이며 운영 DB와 별개다. 운영 DB는 OCI 운영 서버 안의 PostgreSQL이다. 배포 workflow는 OCI SSH 접속 후 `/etc/stockman/stockman.env`의 `DATABASE_URL`로 운영 DB에 연결한다. Supabase 제안은 잘못된 경로였다.
- **운영 실행 로그 확인**: GitHub Actions Deploy OCI #1295 job log를 직접 조회했다. Verify, standalone package, SSH 설정과 release upload는 성공했으며 activation은 운영 서버에서 V168 preflight가 장기 snapshot holder를 발견해 Flyway 전에 fail-closed했다. 기록된 대표 상태는 PID 4178222 `idle in transaction` 6,734초, PID 4179132 relation lock 대기 5,065초 및 다수 active/parallel worker다. 로그는 2026-11-10 시점이며 현재 holder 상태를 대신하지 않는다.
- **현재 한계와 다음 조치**: OCI 접속 자격은 GitHub Actions secrets에만 있고 노트북 SSH 폴더에는 private key가 없다. 현재 OCI DB live 상태는 운영 workflow 실행으로만 확인 가능하다. 변경분 검증 후 안전한 배포 실행은 V168 preflight에서 holder가 남아 있으면 자동 중단하고, 해소됐으면 V168/V169를 순차 적용한다.
- **검증/기록**: `npm.cmd run deploy:verify` 통과: production build, standalone runtime/browser smoke, 313 test files passed/1 skipped, 1,635 tests passed/3 skipped, typecheck, docs/API/KIS/auth/cron gates. `git diff --check` 통과. dependency audit는 fast-xml-parser low advisory 1건을 출력했으나 audit gate는 통과했다. 사용자에게 운영 DB가 Supabase 또는 노트북 DB라는 잘못된 설명을 하지 않는다.
- **커밋·푸시·배포**: 검증 결과 및 workflow 진행 조건 확인 후 기록한다.
### 2026-11-11 OCI 배포 #1296 운영 DB preflight 결과

- commit `16036f8b` push 후 Deploy OCI #1296 (`42973304033`)에서 verify/package/SSH/upload 모두 성공했다. activation은 OCI 서버의 PostgreSQL 연결 후 V168 preflight에서 fail-closed했다.
- 최신 server-side read-only snapshot 목록: PID 4178222 `idle in transaction`, `ClientRead`, transaction age 74,074초(약 20.6시간); PID 4179132 `active`, relation lock wait, age 72,405초(약 20.1시간). 그 외 DataFileRead 및 active client/parallel worker snapshot holder가 남아 있었다.
- Preflight가 Flyway 전에 종료되어 V168/V169 적용과 release activation은 이뤄지지 않았다. 따라서 7일 RSS 삭제는 아직 운영에서 시작되지 않았다.
- PID 강제 종료는 해당 미커밋 transaction을 rollback할 수 있고, 나머지 active snapshot holder가 있어 한 PID 종료만으로 해결될지도 불확실하다. 승인 없이 세션을 종료하거나 같은 activation을 반복하지 않는다. 다음은 운영자가 blocker transaction을 자연 종료하거나 종료를 승인한 뒤 재검사한다.
- 검증/운영: 앞선 `npm.cmd run deploy:verify` 통과(313 test files/1,635 tests, build, runtime smoke). OCI run #1296은 위 DB blocker로 실패. 로컬 노트북 DB 5432는 OCI 운영 DB가 아니다.
### 승인된 OCI DB 세션 종료 및 preflight 재개

- 사용자 승인을 받은 뒤 one-off recovery workflow로 PID `4178222`만 대상으로 실행했다. 첫 attempt는 configured release path에 `/current`를 중복 추가해 `cd`에서 실패했고 DB 작업은 실행되지 않았다. 경로를 수정한 후 workflow run `42992166984`가 성공했다.
- OCI 서버에서 target PID가 `idle in transaction`, `ClientRead`, `backend_xmin` 보유, transaction age 82,778초(약 23시간)임을 즉시 재검증했다. `pg_terminate_backend(4178222)`가 `true`를 반환했다. 다른 PID는 종료하지 않았다.
- **다음 단계**: Deploy OCI를 새로 실행해 V168 preflight를 재검사하고 V168/V169 적용 및 retention cron 결과를 확인한다. 다른 snapshot holder가 남아 있으면 deployment preflight가 계속 fail-closed한다.
## [2026-11-16] RSS 파서 방어 강화 및 OCI 배포 산출물 경로 수정

### 목표와 범위
- DART RSS 입력 검증과 화면 polling의 중복 요청/응답 검증을 보강하고, OCI 배포 아카이브가 실제 Next distDir 경로를 포함하도록 수정한다.

### 반영 및 확인 대상
- `lib/rss.ts`, `lib/rss.test.ts`, `components/use-feed-data.ts`: XML/채널/날짜 검증, receipt 중복 제거, DART URL 정규화, 응답 크기·형식 검사, polling 취소와 payload 검사.
- `.github/workflows/deploy-oci.yml`, `scripts/verify-deploy.mjs`, `deploy/oci/stockman-activate`: `.next-deploy-verify` 기준 static/instrumentation 경로 일치.
- `docs/operations/deployment-checklist.md`, `deploy/oci/README.md`: 아카이브 계약 문서화.
- 커밋·푸시·배포: 미실행. 운영 배포 후 확인 대기.

### 검증
- `npm run deploy:verify` 통과: 빌드, 전체 테스트(1,640 passed/3 skipped), typecheck, 문서/API/인증/cron 게이트, standalone runtime 및 브라우저 smoke.
- `npx vitest run lib/rss.test.ts` 9/9 통과, `npm audit --audit-level=moderate` 취약점 0. standalone 실행에서 `/charts`와 참조 JavaScript 청크 HTTP 200 확인. CI package assertion은 instrumentation/static 경로를 검사하도록 갱신.

### 근본 원인과 재발 감지
- Next standalone의 실제 출력은 설정된 distDir 아래 `server/instrumentation.js`와 `static/`을 두지만 패키지/활성화 경로는 기본 `.next/`를 가정했다. OCI 패키지 smoke 검증에서 두 distDir 경로를 검사한다.

### 남은 위험 및 다음 개선
- 운영 DB에 장기 PostgreSQL snapshot 세션이 남으면 V168 사전 점검이 안전하게 활성화를 거부한다. 세션이 해소된 뒤 배포 workflow가 통과하고 health check가 성공하는지 확인한다.
## [2026-11-16] 운영 API 활성 보통주 일봉 JSON 단축어 배포

### 목표·범위
- `ㄷㅊㅇ5`·`ㄷㅊㅇ6`으로 운영 공식 활성 미국·국내 COMMON_STOCK 유니버스와 종목별 최근 120개 일봉을 조회해 문서 JSON으로 관리한다.
- 운영 API에 공개, 무인증 `universe=true` 페이지 조회 기능을 추가하고 일봉 응답에 종목명과 봉별 갱신시각을 보존한다.

### 구현·재발 방지
- 일봉 API는 기존 공식 마스터의 enabled/common-stock 및 상품 제외 필터를 적용해 최대 100종목의 universe page와 전체 개수를 반환한다. API surface audit/OpenAPI 및 route inventory도 함께 관리한다.
- snapshot 실행기는 거래소별 유니버스 페이지를 모두 읽고, 최대 100종목 단위로 일봉을 요청한다. 종목 식별자, 날짜, OHLCV, fetchedAt, 응답 수를 검증하며 누락은 별도 기록한다. 요청 또는 데이터 검증 실패 시 기존 JSON을 그대로 보존한다.
- 자동 감지: route test의 universe pagination/경계 검사, `audit:api-surface`, 스냅샷의 fail-closed 검증과 기존 파일 원자 교체.

### 검증·운영 결과
- `npm run deploy:verify` 통과: dependency audit 0 vulnerabilities, Next production build, standalone server/API documentation/browser smoke, Vitest 313 files·1 skipped / 1,644 tests·3 skipped, TypeScript, docs/catalog/migration audit, public API surface 186 routes·47 public GETs, bearer-auth, verify-scope, KIS boundary, cron check. 단축어 API route test는 6개 통과했다.
- 운영 배포 전 실제 공개 API는 기존에 `universe=true` 요청에 HTTP 400 `INVALID_QUERY`를 반환했으며 두 JSON snapshot은 아직 없다. 배포 후 `/api/health`, 무인증 universe 조회, US/KR snapshot의 대상·누락·거래일·fetchedAt을 확인하고 결과를 후속 기록한다.
- 배포 방법: 변경 세트의 검증 완료 후 `oci` 브랜치에 fast-forward push하여 `Deploy OCI` workflow를 실행한다. DB migration 없음.
## [2026-11-16] RSS 24시간 보존·시간별 cron 및 조회 입력 방어

### 목표
- RSS 원문 및 bullish projection을 발행 후 24시간이 지나면 정리하고 OCI 공통 자동화를 1시간 간격으로 실행한다. RSS 조회 오류 가능성도 사용자 입력과 DB 오류 경계에서 줄인다.

### 반영
- retention route의 `market_rss_articles`·`market_rss_bullish_articles` 만료 조건을 7일에서 24시간으로 바꾸고, 발행시각이 없으면 저장시각을 사용한다. bullish 행을 먼저 정리하고 기존 bounded batch·deferred 동작을 유지한다.
- OCI 공통 timer를 `OnCalendar=hourly`로 바꾸고 `cron:check`에서 1시간 주기와 24시간 조건을 검사하게 했다. systemd 공식 시간 문서의 `hourly` 표현은 매 정시 반복이다: https://www.freedesktop.org/software/systemd/man/254/systemd.time.html
- RSS 목록 route의 `limit`·`source` 및 market intelligence의 ticker/date/limit를 검증하고, RSS DB 조회 장애는 503과 진단 로그로 구분한다.
- V169 retention 인덱스 및 migration 배포 경로가 원격 최신 `oci`에 이미 있어 재사용한다.

### 검증
- 최신 원격 `oci` HEAD `5c3cb7e0` 기준 `npm.cmd run deploy:verify` 통과: dependency audit 취약점 0건, production build, standalone HTTP/API smoke와 Chrome desktop/mobile hydration, Vitest 313 files·1 skipped / 1,644 passed·3 skipped, typecheck, docs, API-surface, verify-scope, KIS-boundary, bearer-auth, cron gates.
- systemd 공식 시간 명세에서 `hourly`는 `*-*-* *:00:00`으로 정규화되는 정시 반복 표현이다. source timer 파일의 적용은 배포 후 runtime 확인이 필요하다.

### 다음 개선
- 이번 분리 변경만 commit·push해 Deploy OCI workflow를 실행하고 운영 health/Flyway/cron timer 상태를 검증한다.

### 개선 과제
개선 과제 ID: CI-2026-11-16-002
성과 판정: PARTIAL
근거: 24시간 retention과 시간별 timer 변경이 최신 원격 branch에서 전체 배포 검증을 통과했다. 원격 배포와 운영 상태 확인은 미완료다.

### 커밋·푸시·배포
- 미실행: 검증 완료; 분리 commit·push 및 운영 상태 확인 대기.

## [2026-11-17] V168 인덱스 배포 중 장기 snapshot 세션 억제

### 목표와 근본 원인
- ㄷㅊㅇ5·ㄷㅊㅇ6 공개 API 운영 배포를 완료하기 위해 V168 보존 인덱스 migration을 다시 실행한다.
- Deploy OCI run `43829487560`, attempt 9는 V168 preflight를 통과했으나 `CREATE INDEX CONCURRENTLY`가 실행 중인 DB snapshot 세션을 기다리다가 Flyway migration의 2,400초 timeout에 도달했다. 로그는 `Migrating schema "public" to version "168 - bounded non daily data retention"` 및 exit 137을 확인한다.
- 배포 전후에 active client snapshot holder가 반복 생성됐다. 기존 activation은 V168/V169 Flyway 실행 중 앱 서비스와 5분·RSS·fundamentals timer를 계속 실행하므로 동시 DB 트래픽이 old snapshot 대기를 다시 만들 수 있었다.

### 수정 범위와 재발 감지
- `deploy/oci/stockman-activate`: V168/V169 처리 전에 앱과 세 timer, 세 scheduler service를 일시 중지한다. OCI 로컬 PostgreSQL에서 `client backend` + non-null `backend_xmin` + transaction age >30초 조건을 만족하는 세션(active 및 idle-in-transaction 포함)만 재검증 후 종료한다. parallel worker는 별도로 종료하지 않는다.
- migration 실패 시 ERR trap이 이전 release 경로의 app service와 timer를 다시 시작한다. migration 및 새 release 활성화가 정상 완료되면 기존 service restart 경로를 유지한다.
- `.github/workflows/deploy-oci.yml`는 격리된 snapshot holder runner를 release archive에 포함하는지 검증한다. `scripts/check-oci-cron.mjs`는 quiesce, cleanup 및 failure rollback 구조를 자동 검사한다.
- 공식 근거: PostgreSQL `CREATE INDEX CONCURRENTLY`는 이전 snapshot을 가진 트랜잭션이 끝나기를 기다릴 수 있다(https://www.postgresql.org/docs/current/sql-createindex.html). 앱/timer 중지는 migration 구간에만 적용하며 실패 때 복구한다.

### 검증·운영 결과
- `npm run deploy:verify` 통과: npm audit 0 vulnerabilities, production build, standalone runtime/API/browser smoke (Chrome desktop/mobile), 313 test files passed·1 skipped, 1,644 tests passed·3 skipped, typecheck, docs/catalog/migration audit, public API surface/Bearer/KIS/verify-scope/cron checks.
- OCI Deploy run `44001959780`에서 새 quiesce 경로를 실제 실행했다. 앱·timer·scheduler service 정지 후 active snapshot client PID 7개를 종료하고 사라짐을 확인했으나, preflight가 별도 `idle in transaction` PID `241173`(3,848초)을 감지해 중단했다. Error trap이 앱과 timer를 다시 시작한 로그도 확인했다. 이 운영 결과로 종료 조건을 inactive 제외에서 모든 snapshot-holding client backend로 확장했다.
- `c830a083` 배포는 idle 및 active snapshot holder 2개를 정리하고 preflight를 통과했으나, V168 4번째 인덱스에서 운영 DB에 없는 `us_trade_intensity_ticks` relation을 참조해 실패했다. 앱과 스케줄러 복구 trap은 실행됐다. 원인은 V70에서 해당 legacy 테이블을 제거한 뒤 V168 인덱스 목록에 stale 참조가 남은 것이다.
- V168에서 삭제된 relation 인덱스를 제거하고, `cron:check`가 전체 Flyway 순서에서 V168 대상 테이블이 최종적으로 존재하는지 검사하도록 보강한다. 기존 실패 migration은 완료 기록되지 않았고 concurrent index 생성은 일부만 진행됐으므로 `IF NOT EXISTS`로 재시도 가능하다.
- 현재까지 공개 API는 아직 재검증하지 않았다. 다음 배포 검증/배포, 운영 health·universe API 및 ㄷㅊㅇ5·ㄷㅊㅇ6 snapshot JSON 검증이 남아 있다. 기능의 운영 활성 상태를 완료로 간주하지 않는다.
- 운영 health 요청은 직전 점검에서 15초 timeout, NAS/KOSPI universe GET은 HTTP 400이었다. migration 실패 전 운영 release는 활성화되지 않았다.

## [2026-11-17] V169 배포 완료 및 운영 일봉 스냅샷 조회 장애

### 목적·범위
- 목적: ㄷㅊㅇ5·ㄷㅊㅇ6 공개 일봉 API가 포함된 OCI release를 활성화하고 운영 health 및 일봉 수집 경로를 확인한다.
- 배포: OCI workflow run `44024922650` attempt 2와 동일 run의 activation 재실행을 진행했다. 두 번째 실행은 Verify deployment, package/upload, Activate release를 모두 통과했다. 직후 `/health-check`, NAS universe, 1종목 및 20종목 daily-candles GET 모두 HTTP 200이었다.
- 변경 파일: 이번 운영 확인 중 원격 소스 변경 없음. 임시 probe/runner 파일과 로컬 배치 실험은 제거·원복했다.

### 운영 결과·원인·영향
- 전체 US 일봉 스냅샷은 NAS 162배치(3,176종목 수신, 64종목 일봉 미반환) 후 NYS 50/94배치(995종목 수신, 5종목 미반환)에서 HTTP 502를 반복해 중단됐다. 완성된 JSON 파일은 작성되지 않아 불완전 데이터를 결과물로 저장하지 않았다.
- 수집 중 health와 universe endpoint도 nginx HTTP 502가 되어 추가 요청을 중단했다. 배포 activation 재실행 성공 후 health는 HTTP 200으로 복구됐다.
- API upstream 502의 근본 원인은 서버 로그/DB 진단 자료로 확인되지 않았다. 스냅샷의 순차 요청 부하와 시간상 연관은 관측됐으나 이를 확정 원인으로 단정하지 않는다. 운영 데이터의 가용성에 영향을 줄 수 있는 위험이다.

### 검증·자동 감지·다음 개선
- 검증: 성공한 운영 배포 workflow, `/health-check` HTTP 200 확인. 이전에 NAS universe와 daily-candles 소량 GET도 HTTP 200을 확인했다. 스냅샷 전체 검증은 미완료다.
- 재발 감지: 전체 수집 전 health, universe, 1/20 종목 조회를 확인한다. 수집 중 502 또는 health 실패가 보이면 즉시 중단하고 health만 재확인한다. 부분 수집은 최종 파일로 승격하지 않는다.
- 다음 개선: 공개 API 운영 로그와 DB 진단으로 502의 서버측 원인을 확인하고, 체크포인트/재개 및 호출 부하 제한을 갖춘 수집 방식이 검증되기 전에는 전체 운영 universe를 반복 요청하지 않는다.
- 커밋/푸시: 신규 소스 변경은 없으며 이번 운영 작업으로 새 커밋·푸시하지 않았다. 이전 검증된 commit `3d5fcbb4`의 배포는 성공했다.

## [2026-11-17] V170 SEC materializer index 배포 timeout 대응

### 목표·운영 결과
- 최신 원격 HEAD에 포함된 V170 SEC materializer 조회 index를 배포하고 migration 이력을 검증한다.
- OCI Deploy run `44039396985`: verify/package/upload 성공, activation은 schema V169에서 V170 `CREATE INDEX CONCURRENTLY`를 시작했으나 2,400초 timeout 후 exit 137로 실패했다. error trap이 구 release app 및 scheduler services를 복구했고 `/health-check` HTTP 200을 확인했다.
- 초기 preflight에서 client backend PID `260900` (active, snapshot 보유, 929초) 및 parallel worker `260901`, `260902`가 관측됐다. 30초 후 재검사에서는 모두 사라졌으므로 해당 PID는 종료하지 않았다. 이후 index가 40분 동안 지연된 확정 원인은 운영 DB progress 자료 없이 알 수 없다.

### 수정 범위·검증·남은 위험
- `scripts/oci-flyway-v168-preflight.mjs`: V168/V170 두 migration의 정확한 index 목록을 대상으로 failed Flyway history와 invalid concurrent index를 복구하고, `sec_submissions` 테이블 크기·추정 행 수 및 index state를 로그로 남기도록 보강.
- `deploy/oci/stockman-activate`: preflight에 V170 migration을 전달하고, 실패한 V168/V170 history 복구를 허용하도록 반영. exact PID `260900`은 다음 실행 직전에도 client backend/snapshot/30초 초과 조건을 만족하는 경우에만 종료 후보로 지정.
- `scripts/check-oci-cron.mjs`에서 migration 복구 범위와 PID allowlist를 자동 검사한다. 전체 `npm run deploy:verify` 완료 후 commit/push 및 새 OCI deploy를 진행한다.
- 재발 시 `pg_stat_progress_create_index`와 current snapshot holder를 OCI에서 read-only 조회한다. 원인 확인 없이 migration timeout만 늘려 app downtime을 연장하지 않는다.
- 후속 run `44047418291`은 preflight에서 V170 invalid index를 확인하고 `sec_submissions` 규모를 61,549행·38,199,296 bytes로 기록했다. 새 client PID `261867`이 `idle in transaction`/`ClientRead`로 snapshot을 4,112→4,143초 보유해 20회 재시도 후 fail-closed했다. 정확 PID allowlist와 자동 검사를 추가해 다음 배포에서 실행 직전 조건을 재검증하며, 맞을 때만 종료한다.

## [2026-11-17] V170 snapshot blocker 종료 및 공개 API 스냅샷 수집 재개

- Deploy run `44050453172`는 PID `261867`을 실행 직전에 client backend, `idle in transaction`, snapshot 보유, 4,739초 조건으로 재검증해 종료했다. V170 인덱스는 이미 `indisvalid=true`, `indisready=true`였고 failed migration 기록도 없어 invalid index 정리/repair 없이 Flyway가 V170을 즉시 완료했다. 해당 run의 migration 및 activation 성공을 확인했다.
- 새 public health endpoint `/api/health`, NAS universe, 1종목 및 20종목 일봉 조회가 HTTP 200이었다. 20종목 request는 약 9.2초.
- 스냅샷 도구는 전체 수집 안정성을 위해 요청 batch를 20종목으로 제한하고 502/503/504 및 네트워크/timeout 오류에 최대 4회 재시도, 10 batch 단위 진척 로그를 추가한다. 기존 JSON은 전체 응답과 품질 검사가 완료될 때까지 원자적으로 교체하지 않는다.
- 검증·배포: snapshot 도구 변경 포함 `npm run deploy:verify` 통과(274 files/1 skipped, 1,483 passed/3 skipped, build/runtime/API/docs/auth/KIS/cron 검증 통과). commit `d1dba1a6` push 후 OCI Deploy run `44052281379` 성공. US 스냅샷은 NAS/NYS/AMS 활성 5,358종목 중 5,268종목, 627,078 candles, 누락 90종목; KR은 KOSPI/KOSDAQ 2,346종목, 270,629 candles, 누락 0. 양쪽 최신 candle date는 `20261116`이다.
- 산출 검증: `docs/operations/daily-candles-us.json`, `docs/operations/daily-candles-kr.json`에서 summary count, exchange count, 중복 코드, 종목별 candle 수, 날짜/갱신 timestamp를 검증했다. 수집 후 `/api/health` HTTP 200. 실행용 임시 runner 및 URL-only `.env.local`은 제거했다.
- US JSON이 100 MiB 초과이므로 두 스냅샷은 GitHub 공식 파일 제한을 지키기 위해 `.gitattributes`에서 Git LFS로 추적한다. GitHub 공식 문서: [large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github), [Git LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage).
- 최종 결과 커밋 `c0fe3d71`에서 두 스냅샷을 Git LFS로 push했고 OCI Deploy run `44056806652` 성공. 배포 후 `/api/health`와 NAS universe 재확인도 HTTP 200.
- 남은 개선: 앞선 대량 수집 중 관측된 HTTP 502의 서버측 원인은 별도 OCI 로그로 확정되지 않았고, 이번 20종목 단위 수집에서는 재현되지 않았다. 이번 실행 성공으로 snapshot 산출 및 배포 목표를 완료했다.

\r\n
# 2026-11-17 V168 인덱스 대상 오류 수정

- **목적/범위**: 승인된 RSS 24시간 보존 기능의 OCI 배포를 막은 V168 PostgreSQL migration 실패를 조사하고 재발 검사 추가.
- **근본 원인**: Deploy OCI run `44004038768`에서 V168이 `us_trade_intensity_ticks`에 인덱스를 생성하려 했으나 해당 레거시 테이블은 V70에서 이미 삭제됐다.
- **변경 파일**: `db/migration/V168__bounded_non_daily_data_retention.sql`에서 사용되지 않는 인덱스 제거; `scripts/check-oci-cron.mjs`에서 V168 대상 테이블의 과거 CREATE/DROP 순서 검사 및 자동 세션 종료 금지 검사 추가; `.github/workflows/deploy-oci.yml`, `deploy/oci/stockman-activate`에서 자동 세션 종료 제거; `docs/ERROR_HANDLING.md`에 증거·영향·재발 감지·잔여 위험 기록.
- **검증**: `npm run deploy:verify` 통과. dependency audit 0 vulnerabilities, build, standalone runtime/browser/API smoke, 313개 테스트 통과·1개 파일 skip(1,644 pass·3 skip), typecheck, docs/API/auth/KIS/cron gates 통과. 추가 V168 static check는 OCI cron 검사에 포함.
- **커밋/푸시/배포**: 검증 완료; 커밋·푸시 후 OCI 배포 실행 예정.
- **추가 운영 범위 점검**: Deploy OCI run `44004038768` 로그에서 broad predicate로 PID `241173`과 `244461`이 자동 종료된 사실을 확인했다. 다음 배포는 세션을 임의 종료하지 않고 preflight fail-closed로 바꿔, 명시적 승인된 PID 이외의 세션을 건드리지 않는다.
- **추가 정확 범위 복구**: run `44007558527`은 active/idle client transaction 종료 없이 fail-closed했고 PID `246213`이 idle-in-transaction, snapshot 보유, 606초로 확인돼 롤백했다. 사용자의 후속 승인 범위에서 배포는 이 관측 PID 하나만 지정해 실행 직전 상태와 snapshot/age를 재확인하도록 제한한다. PID가 달라졌거나 조건이 다르면 종료하지 않고 preflight가 중단한다.
- **후속 blocker**: run `44009100718`은 PID `246213`을 재검증 후 종료했으나 active snapshot client PID `246722`(681초), `246903`(406초), `247294`(63초) 및 관련 parallel worker가 남아 preflight에서 중단됐다. 재시도 allowlist를 이 세 정확 client PID까지 확장하고 parallel worker는 종료하지 않는다.
- **후속 blocker 2**: run `44010497775`는 세 PID를 실행 직전 재검증 후 종료했으나 PID `247463`(496초, parallel worker 보유)와 `247509`(32초)이 계속 snapshot을 보유해 preflight에서 중단됐다. 재시도 allowlist를 두 정확 client PID까지 확장하고 세션의 application/user/remote-address를 민감 SQL 없이 기록한다.
- **후속 blocker 3**: run `44011991858`은 PID `247463`을 종료했으나 새 active snapshot client PID `248010`(667초, parallel worker 보유)과 `248077`(503초)이 남아 중단됐다. 다음 재시도는 이 두 client PID만 지정하고 parallel worker는 계속 종료하지 않는다.
- **후속 blocker 4**: run `44013496931`은 PID `248010`(1577초)과 `248077`(1413초)을 종료했으나 V168 preflight에서 새 client PID `248691`(671초, parallel worker 보유), `248857`(381초, parallel worker 보유), `249223`(71초)이 확인돼 fail-closed했다. 다음 재시도는 이 정확한 세 client PID만 실행 직전 재검증한다.
- **후속 blocker 5**: run `44015105176`은 PID `248691`(1491초), `248857`(1201초)을 종료했으나 V168 preflight에서 새 client PID `249386`(586초, parallel worker 보유), `249548`(236초, parallel worker 보유), `249564`(164초), `249815`(56초), `249816`(57초)이 확인돼 fail-closed했다. 다음 재시도는 이 다섯 정확 client PID만 실행 직전 재검증한다.
- **후속 blocker 6 및 개선**: run `44016651680`은 PID `249386`(1313초), `249548`(964초), `249564`(892초)을 종료했지만 새 client PID `250094`(423초, parallel worker 보유), `250401`(120초, parallel worker 보유), `250277`(86초), `250475`(80초), `250476`(80초)이 생겨 preflight가 중단됐다. 승인 PID를 계속 추가하는 대신 서비스 중지 후 오래된 snapshot이 끝날 기회를 주도록 V168 preflight를 30초 간격 최대 20회 재시도한다. 허용 시간 내에도 남으면 계속 fail-closed한다.
- **재시도 결과**: run `44018357320`에서 반복 preflight는 이전의 여러 snapshot client가 사라졌음을 확인했으나 PID `250751` client backend 하나(최초 423초)가 30초 간격 20회 동안 계속 active snapshot을 유지해 중단됐다. 승인 범위 내에서 이 정확 PID만 재검증 후 종료한다.
- **OBV timeout 배포 후 blocker**: run `44021996821`은 실행 도중 새 commit에 의해 취소됐으며, V168 preflight 로그에서 PID `253038` 하나가 idle-in-transaction, `ClientRead`, snapshot 보유로 776→928초 유지됐다. 20회 재시도 후 fail-closed했으므로 이 정확 PID만 승인 allowlist에 추가한다.
- **후속 blocker 6 및 개선**: run `44016651680`은 PID `249386`(1313초), `249548`(964초), `249564`(892초)을 종료했지만 새 client PID `250094`(423초, parallel worker 보유), `250401`(120초, parallel worker 보유), `250277`(86초), `250475`(80초), `250476`(80초)이 생겨 preflight가 중단됐다. 승인 PID를 계속 추가하는 대신 서비스 중지 후 오래된 snapshot이 끝날 기회를 주도록 V168 preflight를 30초 간격 최대 20회 재시도한다. 허용 시간 내에도 남으면 계속 fail-closed한다.
- **남은 위험/다음 단계**: 실패한 non-transactional V168은 일부 인덱스와 Flyway 실패 행을 남길 수 있다. 배포 preflight의 V168 한정 복구와 후속 V169/운영 상태 확인 필요.
# 2026-11-17 조회 snapshot 장기 유지 방지

- **목적/범위**: V168 배포 전 반복되는 PostgreSQL snapshot blocker에서 조회 오류와 장기 트랜잭션 가능 경로를 조사하고 OBV 스캔 세션의 수명을 제한한다.
- **근거/원인 후보**: read-only OCI 진단 run `44020043575`에서 `stockman` localhost client backend 하나가 동일 쿼리와 snapshot을 1,235초 유지하고 두 parallel worker를 보유했으나 `application_name`이 비어 있었다. OBV 스캔은 전체 eligible 종목의 최근 최대 160개 봉을 한 조회로 읽고 앱에서 계산하며, DB statement/idle transaction timeout과 식별자가 없었다. 해당 경로가 일치하는 후보이나 PID의 OS process는 진단 당시 확인되지 않아 확정 원인으로 단정하지 않는다.
- **변경 파일**: `lib/us-obv-divergence-scan.ts`, `lib/us-obv-divergence-snapshot.ts`, `app/api/cron/us-obv-divergence-snapshot/route.ts`, snapshot 회귀 테스트. 스캔 트랜잭션은 `application_name`을 설정하고 statement 15분, transaction idle 60초 상한을 적용한다. cron route 상한은 1,200초로 늘려 DB 쿼리 제한 이후 애플리케이션 정리가 끝날 여유를 둔다.
- **검증**: focused test 3/3 통과. `npm run deploy:verify` 통과: audit 0 vulnerabilities, build 108 pages, standalone runtime/browser/API smoke, Vitest 313 files passed/1 skipped (1,645 passed/3 skipped), typecheck, docs/API/catalog/migration, verify-scope/KIS/auth/cron gates.
- **커밋/푸시/배포**: full verification 완료 후 최신 `origin/oci` 기준 커밋 및 push; OCI 배포 workflow와 운영 health/V168 상태 확인 예정.
- **남은 위험/다음 단계**: OS process mapping은 아직 확인되지 않았으므로 OBV 스캔은 근거 있는 원인 후보다. `application_name`은 다음 조회부터 식별성을 높인다. PostgreSQL query cancel 및 timeout 동작을 확인하고 다른 blocker가 지속되면 추가 조회 경로를 조사한다.
# 2026-11-17 SEC materializer 장기 조회 제한

- **목적/범위**: 배포 후 재관측한 장기 snapshot 조회의 원문 비노출 SQL shape를 로컬 코드와 대조해 병목 경로를 수정한다.
- **근본 원인**: 진단 run `44028486909`에서 672초 active인 PID `256094`의 SQL shape가 `materializeStockmanSecEvents` 조회와 일치했다. SEC submissions 정렬/후보 선택은 `acceptance_datetime` B-tree 인덱스가 없고, SEC cron 전체 materializer가 최대 500행을 찾기 위해 병렬 seq scan할 수 있었다. client는 `stockman.service`의 Next.js였다.
- **수정**: V170에 valid acceptance timestamp 부분 인덱스를 `CREATE INDEX CONCURRENTLY`로 추가한다. SEC 후보 조회에 `application_name`, statement 5분, idle transaction 60초 제한을 적용하고 후보 SELECT만 `READ ONLY` transaction으로 분리해 결과 처리/저장 전에 snapshot을 해제한다.
- **재발 자동 감지**: `stockman-events-materializer.test.ts`가 세션 태그·timeout·LIMIT 정렬·accession filter와 client 해제를 검증한다. `check-oci-cron.mjs`와 OCI artifact assertion은 V170 설정/SQL 패키징을 검사한다.
- **검증/배포**: focused tests 3/3 및 `npm run deploy:verify` 통과: audit 0 vulnerabilities, production build 108 pages, standalone runtime/browser/API smoke, Vitest 313 files passed/1 skipped (1,645 passed/3 skipped), typecheck, docs/API/catalog/migration, verify-scope/KIS/auth/cron gates. 기존 배포는 OCI #1313 attempt 2에서 성공했으며 이번 V170은 후속 배포 대상이다.
- **남은 위험**: concurrent index 생성은 기존 오래된 snapshot이 있으면 대기한다. 조회 제한은 새 요청부터 적용하며 이미 열린 세션은 종료하지 않는다.

## 2026-11-17 비활성 기능 및 관리자·DART 화면 제거

- **목적 및 범위**: 참조되지 않고 사용되지 않는 기능을 코드와 테스트/UI에서 제거하고, 관리자 화면/API 및 DART 전용 `/dart` 사용자 화면을 제거한다. `/disclosures`의 DART 공시 기능과 DART API·수집 자동화는 유지한다.
- **변경**: 관리자 페이지·API·전용 컴포넌트/테스트와 디버그 API 및 전용 실행 상세 저장 코드를 제거했다. `/health-check` 화면/테스트, 미사용 문의·공지·메모·투자 일정·상장 일정·국내 급등 기능의 UI/API/라이브러리/테스트를 제거했다. 홈/내비게이션에서 `/dart` 진입 링크를 없애고 PWA 시작 경로를 `/disclosures`로 바꿨다. `/disclosures`, DART API·수집 자동화, 예약 자동화에서 사용하는 공통 설정/실행 추적은 유지한다.
- **문서화**: 운영 런북에서 제거된 관리자·디버그 경로를 지웠다. API route inventory와 문서 catalog는 `docs:check`/빌드에서 재생성한다.
- **확인 대상**: 삭제 경로의 참조 잔존, API inventory/catalog, 빌드·테스트·실행 통합 검증을 확인한다.
- **검증**: `npm run docs:check` 통과(106 route files, 46 public GET inventory, 139 documents). `npm run deploy:verify` 통과: dependency audit 0 vulnerabilities, production build/typecheck, standalone runtime 및 `/charts` desktop/mobile hydration/API smoke, Vitest 274 files passed/1 skipped (1,483 passed/3 skipped), docs/API/catalog/migration 및 KIS/auth/cron gates 통과. `git diff --check` 통과. Windows 공유 `node_modules` junction 때문에 standalone trace copy에 EPERM 경고가 있었으나 빌드 완료 후 standalone 서버 실행·smoke가 통과했다.
- **커밋·푸시·배포**: 검증 완료 후 `oci` 브랜치에 커밋/푸시하여 Deploy OCI를 실행할 예정이다.
# 2026-11-18

## `/market-news` 사용자 화면 및 전용 공개 API 제거

- **목적/범위**: 사용자 요청에 따라 더 이상 제공하지 않는 `/market-news` 화면 및 전용 `/api/market-news` 읽기 API를 제거했다. RSS 수집·알림 파이프라인과 이를 공유하는 라이브러리 테스트는 보존했다.
- **변경 대상**: 페이지·전용 API·전용 UI 컴포넌트 및 페이지 테스트, 상단 네비게이션, 공개 API 문서/route inventory/OpenAPI, 문서 카탈로그, 관련 운영 문서와 `scripts/verify-deploy.mjs` 검사.
- **검증**: 최신 `origin/oci` 기준 `npm audit --omit=dev` 통과(취약점 0), 프로덕션 빌드 통과(라우트 목록에서 `/market-news` 및 `/api/market-news` 제외), standalone 런타임 smoke 통과(`/charts` 200 및 주요 API 검증, 브라우저 데스크톱/모바일 수화 확인), `npm run docs:check` 통과(105 route files, 공개 GET 45개, 문서 카탈로그 138개), `git diff --check` 통과. 실제 복사한 `node_modules` 환경에서 기본 병렬 설정의 `npm run deploy:verify`는 Vitest 워커가 과다 생성되어 9분간 출력 없이 대기해 중단했다. 원인을 분리해 `npx vitest run --maxWorkers=2 --reporter=verbose`로 재실행한 결과 274개 파일 통과, 1,483개 테스트 통과, 3개 skip(총 1,486개)을 확인했다.
- **배포**: 커밋·푸시·배포하지 않음. 최신 원격 변경과 테스트 게이트 상태를 재확인한 뒤 진행해야 한다.
- **남은 위험/다음 단계**: 이 Windows 환경에서 전체 Vitest 재실행 정체의 원인을 확인하고 전체 테스트가 완료되는지 재검증한다. 그 뒤 최신 `origin/oci`를 확인하고 사용자 요청 범위만 커밋·푸시하며, CI 및 운영 `/market-news`·`/api/market-news` 404를 확인한다.

## [2026-11-18] 최신 OCI 기준 미사용 코드 정리 및 배포 검증
- 목적/범위: 사용 승인에 따라 최신 `origin/oci` 기준으로 미사용 후보를 재검토하고 삭제·배포 게이트를 확인한다.
- 검토 방법: 최신 checkout의 tracked TS/JS 소스 872개에서 상대경로·alias 정적 import, 재수출, 동적 import/require를 검사하고 관련 문서·스크립트 문자열 참조도 대조했다.
- 남긴 후보: `lib/daily-candle-summary.mjs`와 테스트는 `scripts/sync-daily-cache-async.mjs`에서 사용되어 삭제하지 않았다. SEC risk API route는 없는 반면 저장소 문서가 구현 상태로 남아 있어, route/repository 비활성 상태와 유지되는 migration·DB 데이터·수동 스크립트를 두 설계 문서에 기록했다.
- 삭제 묶음 한 줄 요약: 운영·진단·캐시(7)는 제품 코드 연결이 없는 테스트/진단 작업이고, RSS·번역(7)은 현행 파이프라인의 import 경로에서 벗어난 개별 helper이며, SEC(3)는 route 없는 구형 API 지원 코드이고, 공통·개인화(5)는 현재 호출자가 없는 helper다.
- 변경: 위 기준으로 runtime 모듈 22개와 직접 전용 테스트 14개 삭제, `sec-ai-pipeline.test.ts`의 payload regression 유지 및 evaluator 전용 테스트 제거, KIS registry의 삭제 모듈 항목 정리, 관심종목 설계 경로를 `lib/user-watchlist.ts`로 정정했다.
- 검증: 최신 `origin/oci`의 tracked TS/JS 872개에서 재현 가능한 정적 참조 검사 완료. `npm ci`는 lockfile 기준 설치 완료(197 packages); 전체 개발 의존성 감사는 high 7건을 보고하며 해당 picomatch 4.0.7 노드는 lockfile상 dev-only다. 프로젝트의 배포 검사인 운영 의존성 감사(`npm audit --omit=dev`)는 0건. 정리 적용 후 `npm.cmd run deploy:verify` 전체 통과: Next production build, standalone HTTP 및 Chrome 데스크톱·모바일 smoke, 260개 테스트 파일 통과/1 skip(1,423 tests pass/3 skip), typecheck, docs/API, verify-scope, KIS boundary, Bearer auth, OCI cron 검사.
- 커밋·푸시·배포: 이번 정리 브랜치에 아직 수행하지 않았다.
- 남은 위험/다음 단계: 정적 스캔은 런타임에서 조립하는 import 경로나 문서화되지 않은 외부 수동 호출을 완전히 증명하지 않는다. 개발 도구 의존성 picomatch는 upstream advisory가 high로 표시하지만 배포 운영 의존성에는 포함되지 않아 production audit 대상에서 제외된다. 커밋·푸시 후 OCI workflow 배포 완료와 운영 health를 확인한다.

# [2026-11-18] 시총 경계 4개 발행사 산식 교차검산

### 목적 및 범위
- 작업 ID: US-TD-2026-11-18-004. 1조 달러 근처로 분류한 WMT, LLY, Berkshire, SpaceX의 포함 근거를 가격·주식수 산식으로 교차 점검하고 cohort README에 재현 가능한 계산을 남긴다.
- 변경 대상: `docs/company-analysis/us/trillion-dollar/README.md`의 경계 교차검산 표 및 한계 설명.

### 근거 및 계산
- 종가 기준은 2026-11-17 U.S. close의 제3자 historical-data pages이며, SEC 최신 확인 filing cover-page shares를 사용했다. 가격과 주식수의 기준일은 다르므로 공식 market capitalization이 아닌 sanity check로 표시했다.
- `WMT`: 127.52 × 7,933,746,241 (SEC 2026-08-26) = $1.0117T.
- `LLY`: 1,415.55 × 940,745,031 (SEC 2026-10-26) = $1.3317T.
- `BRK.B` 환산: 586.76 × (1,403,805,594 B + 480,476 A × 1,500) (SEC 2026-10-28) = $1.2466T. 1,500:1 equivalent convention is the company’s SEC-reported convention.
- `SPCX`: 141.70 × (8,246,541,218 A + 5,334,522,491 B) (SEC 2026-10-15) = $1.9244T. All issued Class A/B common shares are included; unissued authorized Class C is excluded.

### 한계, 검증 및 배포
- WMT estimate is only about 1.2% above cutoff and must remain provisional until same-date official close and updated shares are paired. Across the four names, subsequent issuer actions after SEC share-count date and third-party closing-price methodology can change the result. No official market-cap claim is made.
- The remaining eight companies and full market-wide universe have not been independently recalculated with this same method; the original 12-issuer screen remains third-party provisional discovery data.
- Reviewed arithmetic and citations against the linked SEC cover pages and price-history pages; docs catalog and `npm run docs:check` results follow after synchronization.
- 커밋·푸시·배포하지 않음.

# [2026-11-18] OCI 배포 검증 및 원격 정렬

### 목적 및 범위
- 작업 목적: `oci` 브랜치의 승인된 코드 변경을 최신 원격 기준에 맞춰 검증하고 OCI 배포 가능한 상태로 정리한다.
- 변경·확인 범위: RSS·일봉 동기화/API·문서 계약·OCI workflow 변경과 배포 검증 게이트. 별도 재무 분석 및 scratch 파일은 이번 배포 범위에서 제외한다.

### 원인 및 수정
- 원인: 문서/API 계약, 일봉 캐시 동기화, screener candle validity, workflow 패키징에서 문서 검사와 production build가 요구하는 계약 불일치가 발견됐다.
- 수정: 공개 API 문서·fixture와 검사기를 실제 route 계약에 맞추고, DB URL/연결 오류 처리 및 원격 fundamentals payload 검증을 보강했다. valid OHLC candle CTE를 공용화하고 테스트 mock 판정을 보정했다. 문서 카탈로그 생성은 변경이 있을 때만 파일을 쓰도록 했다.
- 원격 정렬: `origin/oci`의 `6e9b87aa` 문서 정리 커밋을 포함하도록 로컬 배포 커밋을 재배치 중이며, 양쪽 기록을 보존하기 위해 이 로그의 충돌을 해결했다.

### 재발 방지·검증·배포
- 같은 계약을 fixture, API/OpenAPI, docs checker에서 함께 검사하고 `npm run deploy:verify`를 배포 전 통합 게이트로 사용한다.
- 검증 결과: production dependency audit 0 vulnerabilities, docs/API/migration/scope/KIS/auth/cron checks 통과, production build 및 standalone HTTP/Chrome desktop·mobile smoke 통과, typecheck 통과, Vitest 290 files 중 1 skipped 및 1,645 passed·3 skipped. 전체 `npm run deploy:verify` 종료코드 0.
- `git diff --check` 통과. 재무 분석 자료와 대량 untracked scratch 산출물은 분리 보존하며 staging 대상에서 제외한다.
- 커밋·푸시·배포: 아직 수행하지 않음. 최종 변경 범위 재검토 후 동일 상태에서 검증을 다시 실행하고 진행한다.
- 남은 위험/다음 단계: 원격이 재배치 중 다시 갱신될 수 있으므로 push 직전 `origin/oci`를 재확인한다. GitHub Actions OCI workflow와 production health 확인을 완료한 뒤 이 항목을 갱신한다.

## [2026-11-19] ADR/ADS 보통주 snapshot API fail-closed 보완
- **목적/근거**: `ㄷㅊㅇ5` 실행 전 운영 GET에서 AACG/BABA/ABEV가 `COMMON_STOCK`·`is_dr=false`로 반환됐지만 KIS 공식 영문 상품 설명은 `SPON ADS`/`SPON ADR`였다. 현재 repo에는 docs의 예전 설계에 적힌 `POST /api/admin/instrument-universe-import` 경로가 없어 운영 DB 마스터를 바로 재적재할 수 없음을 확인했다.
- **수정 범위**: `lib/us-depositary-receipt-classification.ts`에 공식 상품 설명 문자열 판별 및 public daily-candles용 SQL predicate를 공유한다. `lib/instrument-universe-import.ts`와 `reconcileUsUniversePartitions`는 DR 분류/플래그 보존, `app/api/public/daily-candles/route.ts`는 NAS/NYS/AMS universe·single·bulk 조회에서 설명 기반 예탁증서를 fail-closed 제외, `app/api/public/us-stock-metadata/route.ts`는 같은 descriptor를 활성 보통주로 공개하지 않는다. 관련 importer·API regression tests 및 KIS master/shortcut/error 문서를 갱신했다.
- **재발 감지**: 분류 테스트는 AACG/BABA/ABEV ADS/ADR와 AAPL 일반주를 비교한다. public daily-candles route 테스트는 미국 단일/유니버스 SQL의 descriptor 제외 조건을 확인한다. metadata route 테스트는 `is_dr=false`인 AACG의 `SPON ADS`를 422로 거부한다.
- **격리/검증 상태**: 변경은 clean worktree에서 수행했으며 원래 workspace 파일은 덮어쓰지 않았다. 첫 `npm run deploy:verify` 통과: 운영 의존성 감사 0 취약점, 활성화 preflight, 문서/API surface/catalog 검사, build, standalone 서버 기동/API·Chrome desktop/mobile smoke, Vitest 290 files (1 skipped), 1,649 passed (3 skipped), typecheck 완료. `git diff --check` 통과. 커밋 `0aa444bb`는 OCI 활성화까지 성공했고 health 200 및 NAS universe 3,060개를 확인했다.
- **결과/남은 위험**: 첫 US snapshot(4,976종목/592,419 candle/86 missing, latest `20261117`)에서 영문 설명에는 DR 표기가 없고 현지화 표시명에만 ADR/ADS가 있는 12종목을 발견했다. DR/ADS SQL/API guard를 영문명과 공식 표시명 양쪽에 적용하고 ASCII 기준 단어 경계로 조정했다. KR universe는 정상이나 기존 candle query가 국내 테이블에 없는 `trading_value`를 참조해 503을 반환했고 KR query는 `close * volume` 계산으로 수정했다. 최종 필터 확장 포함 전체 `npm run deploy:verify` 통과: build/standalone HTTP 및 Chrome desktop·mobile, typecheck, docs/API/migration/scope/KIS/auth/cron checks, Vitest 290 files 중 1 skipped 및 1,650 passed·3 skipped. 관련 targeted tests 21/21 통과. 첫 재검증에서 unrelated watchlist test가 한 차례 실패했지만 단독 및 이후 전체 재실행에서는 재현되지 않았다. 첫 US JSON에는 descriptor 12개가 남았으므로 유효한 최종 산출물로 취급하지 않고 재배포 후 다시 생성한다.
- **커밋·푸시·배포**: 영문 설명 1차 수정은 `0aa444bb`로 `oci`에 push했고 Deploy OCI run `44429863700` 성공. 표시명까지 확장한 DR 필터와 KR 스키마 호환은 `1120d3c6`로 push, Deploy OCI run `44438975616`도 성공했다. 후속 artifact snapshot 파일 갱신을 검증·기록했다.

## [2026-11-19] KR public daily-candles 스키마 호환 수정
- **목적/원인**: ㄷㅊㅇ6 실행 중 운영 KOSPI/KOSDAQ universe 조회는 성공했지만 일봉 조회는 503이었다. V67 `kr_instrument_universe_candles` 정의 및 문서에는 `trading_value`가 없는데 API SQL이 직접 참조해 query 오류가 발생했다.
- **수정 범위**: KR public single/bulk daily query의 `trading_value` 반환값을 `close * volume`으로 계산한다. US query는 기존처럼 공식 저장 거래대금을 우선 사용하고 없을 때 `close * volume`으로 fallback한다.
- **재발 감지**: route regression test는 국내 쿼리에 없는 컬럼 참조를 금지하고 계산식/반환값을 확인한다. route test 7개와 전체 deployment verification을 통과했다.
- **검증/반영 상태**: 최종 필터 확장 포함 `npm run deploy:verify` 통과(0 취약점, production build, standalone HTTP/Chrome desktop·mobile, typecheck, docs/API/schema gates, Vitest 1,650 passed·3 skipped). `1120d3c6` push 및 Deploy OCI run `44438975616` 성공. 운영 daily-candles read API와 두 snapshot 생성/검증을 완료했다.
- **최종 snapshot**: US eligible 5,050, instruments 4,964, candles 590,979, missing 86, latest `20261117`; KR eligible/instruments 2,345, candles 275,203, missing 0, latest `20261118`. Snapshot quality check는 중복 코드·형식 오류·미제외 ADR/ADS 0건, retrieved+missing=eligible를 확인했다.
- **artifact 배포 상태**: snapshot/docs commit `77c5cd2c`를 `oci`에 push했고 Deploy OCI run `44443286997` 성공을 확인했다. 배포 후 health 200, NAS universe 3,053, KOSPI 1종목 일봉 GET 200을 재확인했다. 최신 artifact worktree HEAD와 원격 `oci` tip은 `77c5cd2c`다.
- **마지막 검증 재시도**: runbook/log 보강 상태에서 `npm run deploy:verify`가 production build, standalone HTTP/Chrome desktop·mobile smoke, typecheck, docs/API/schema/auth/KIS/cron gates까지 통과했으나 전체 suite에서 기존 `components/watchlist-workbench.test.tsx` 1건이 이름 resolver timing으로 실패했다. 직전 시도의 KIS Retry-After 경계 assertion(기대 60, 실제 59) 실패도 캔들 경로와 무관했다. 이어서 별도 전체 `npm test -- --run`이 290 files (1 skipped), 1,650 passed (3 skipped)로 통과했다. 코드/JSON 변경은 없다.
- **남은 위험/다음 단계**: US에는 캐시 일봉이 없는 86종목이 기록됐다. 다른 미국 종목 소비 API가 동일한 마스터 분류를 따르는지 별도 영향 점검이 남는다. 운영 DB 직접 조회나 쓰기는 수행하지 않았다.

## [2026-11-19] 미사용 코드 정리 배포 후보 격리

- **목적·범위**: 미커밋 미사용 코드 정리 변경을 최신 배포 커밋 위에서 분리해 재검증 가능한 후보로 만든다.
- **변경 파일**: 미사용 helper/component 삭제와 참조 보정, 권리 surface fixture 및 검사 업데이트 등 총 43개 tracked 파일을 정리 후보에 포함했다. 수천 개 미추적 조사 산출물은 후보에서 제외했다. 미사용 코드 정리 자체는 최신 예탁증서 분류 파일을 수정하지 않는다.
- **기준 커밋·배포 상태**: 후보는 `77c5cd2c`에서 시작한다. 해당 원격 커밋의 GitHub Actions OCI 검증·업로드·활성화는 성공했다.
- **검증 결과**: 최신 기준 `77c5cd2c`에 적용한 후보에서 `npm run deploy:verify` 통과. 의존성 감사 0 취약점, build, standalone HTTP 및 Chrome desktop/mobile hydration smoke, typecheck, docs/API/schema/audit/cron 게이트가 모두 성공했다. Vitest는 281개 파일 통과·1개 건너뜀, 1,627개 테스트 통과·3개 건너뜀으로 완료됐다. Vitest 실행 시간은 약 699초였다.
- **커밋·푸시·배포**: 정리 후보는 미커밋·미푸시 상태이며 운영 배포에 포함하지 않았다. 원격 `77c5cd2c` 배포와 별개다.
- **다음 조치·남은 위험**: 후보는 검증 완료된 미커밋·미푸시 상태다. 원본 작업 트리의 미커밋 자료와 분리되어 있으며, 필요 시 이 후보에서 리뷰·배포 절차를 진행한다.
## [2026-11-19] 미사용 코드 정리 및 OCI 배포
- **목적/범위**: 앱 및 운영 경로에서 참조되지 않는 runtime helper·과거 모듈을 정리하고, 테스트·문서 게이트 및 OCI 배포 검증 후 `oci` 브랜치에 반영한다.
- **변경**: orphan 모듈과 전용 테스트를 삭제하고, 호출처가 없는 export helper와 테스트 전용 reset 함수를 제거했다. `/api/dart/contract` route는 유지하고 권리 surface fixture를 갱신했다. 문서 검사 assertion은 삭제된 RSS export helper 대신 현재 `/api/disclosures` route를 검사하도록 조정했다. 테스트 회귀 계약에서 참조가 드러난 RSS translation review CSV export/eligibility 및 KIS US industry sync helper와 전용 테스트는 삭제 대상에서 제외해 보존했다.
- **근본 원인/재발 방지**: 기능 제거 뒤에도 고립 모듈·전용 테스트·오래된 검사 기준이 남아 있었다. 정리 시 실제 앱/운영 import graph, 테스트 참조, route contract 및 문서 검사를 함께 대조한다. 이름 기반 export probe의 raw 결과는 내부 참조 오탐이 있어 개별 확인 없이 삭제 근거로 사용하지 않는다.
- **검증 실패 및 수정**: 첫 build에서 `krMinuteCandles` 미정의 오류가 발생했다. 조회 helper 제거 시 같은 파일의 저장 함수에 필요한 schema import까지 제거한 것이 원인이었으며, `saveKrMinuteCandles` 참조를 재확인해 import를 복구했다. 두 번째 전체 테스트에서 삭제한 모듈을 직접 import하는 3개 suite가 확인돼 관련 helper 및 industry sync 테스트를 복구했다.
- **최종 검증 결과**: 최신 `origin/oci` 기준 `VITEST_MAX_WORKERS=8 npm run deploy:verify` 전체 통과. dependency audit 0 vulnerabilities, OCI activation preflight, docs/API/catalog/scope/KIS/auth/cron audits, production build 및 typecheck, standalone HTTP/API/Chrome desktop·mobile smoke, Vitest 282 files (281 passed, 1 skipped), 1,627 tests passed (3 skipped). UTF-8 strict decode, document catalog check 및 `git diff --check` 통과.
- **재발 방지/남은 위험**: 공유 Windows에서는 worker 시작 timeout이 간헐적으로 발생했으나, 공식 `VITEST_MAX_WORKERS` 환경변수로 8개로 제한한 전체 실행은 성공했다. CI Linux OCI workflow 및 운영 health 확인도 배포 후 확인한다. 외부 저장소에서 직접 import하는 consumer 및 런타임 동적 import는 정적 검색만으로 완전히 배제할 수 없어 관련성이 남은 설정 저장 및 제품 API는 보존했다.
- **커밋·푸시·배포 기록**: 최신 `origin/oci` revision `77c5cd2c` 위에서 cleanup 전용 커밋을 만들고 OCI workflow 및 운영 health 확인 후 결과를 갱신한다.

## [2026-11-19] KIS 국내 캔들 거래대금 구조화 저장

- **목적/근본 원인**: KIS 국내 기간별 시세 `output2`의 `acml_tr_pbmn`(누적 거래 대금)을 파서가 구조화하지 않아 공개 API가 `종가 × 거래량` 계산치만 반환했다. 원본 raw payload는 저장됐으나 캔들 테이블에는 거래대금 열이 없었다.
- **수정 범위**: `lib/kis-kr-daily-price.ts`에서 필드 파싱, `lib/kr-daily-price-cache.ts` 및 `lib/schema.ts`에서 구조화 저장·bulk cache 반환, `V180__kr_daily_candle_trading_value.sql`에서 컬럼 추가 및 과거 raw payload backfill, public `daily-candles` API에서 저장된 공식값 우선 사용. 공식값이 누락된 과거/응답행은 기존과 같이 계산 fallback한다.
- **문서/자동 감지**: parser와 route 회귀 검사를 확장하고 `docs/ERROR_HANDLING.md`에 원인·범위·재발 감지·잔여 위험을 연결했다.
- **검증/반영 상태**: 최신 `origin/oci` (`38e544ac`) 기준 `VITEST_MAX_WORKERS=8 npm run deploy:verify` 전체 통과: 의존성 취약점 0건, Vitest 282 files 중 281 passed·1 skipped 및 1,628 passed·3 skipped, typecheck, docs/API/catalog/migration/scope/KIS/auth/cron 감사, production build, standalone HTTP/API 및 Chrome desktop/mobile smoke 통과. 운영 DB 마이그레이션·실제 운영 health 확인은 아직이다. 이번 변경 커밋 및 `oci` push 후 OCI workflow 완료를 확인한다.
## [2026-11-19] 사용자 행동 이벤트 및 요청 로그 수집 제거
- **목적/범위**: 명시적 사용자 행동 이벤트와 모든 요청별 사용자 진단 수집 기능을 제거했다.
- **변경 파일·자료**: `/api/user-activity`, `/api/internal/request-log`, 관리자 활동 데이터 경로의 잔여 참조, 공시 화면 이벤트 전송, middleware 로그 전송, 요청 신원/IP 위치 모듈 및 테스트를 삭제했다. `request_logs` 보존 작업과 API inventory를 제거했고 `V181__remove_user_action_event_metadata.sql`에서 기존 기록을 포함한 테이블 전체를 삭제한다. 관련 아키텍처·운영 문서를 정리하고 문서 카탈로그/공개 매뉴얼을 재생성했다.
- **근본 원인·영향 범위**: UI 행동 이벤트와 일반 요청 진단이 동일 테이블에 혼합 저장되어 사용자의 API 경로 및 식별 정보를 기록했다. 수집/저장/보존 경로를 제거하고 요청 추적 응답 헤더는 저장 없이 유지한다.
- **재발 자동 감지·남은 위험**: route inventory, cron retention 감사와 전체 배포 검증으로 라우트·보존 참조를 감지한다. V181이 운영 DB에 적용되기 전까지 기존 테이블/데이터가 남는다. 과거 V97/V105/V133 migration은 Flyway checksum 이력을 위해 보존한다.
- **검증 결과·한계**: `npm run deploy:verify` 통과. production build, standalone runtime, Chrome desktop/mobile hydration 및 API smoke, typecheck, route/docs/cron/auth 검사 성공; Vitest 278 files (278 passed, 1 skipped), 1,620 tests passed (3 skipped). 초기 runtime smoke는 상위 체크아웃의 불완전한 Next.js 설치 때문에 시작 실패했으나 격리 worktree에서 lockfile 오프라인 설치 후 재검증해 통과했다. 운영 적용 결과는 workflow 확인 후 기재한다.
- **커밋·푸시·배포**: 진행 예정.


## [2026-11-20] 국내 캔들 거래대금 API 매뉴얼 보강
- 목적/범위: 공개 GET /api/public/daily-candles의 국내 거래대금 출처와 과거 캐시 대체 규칙을 명시하고 OpenAPI 응답 schema를 일치시킨다.
- 변경: public/api-reference.md에서 KIS acml_tr_pbmn 원문(원)과 close × volume fallback, fetchedAt 및 bulk metadata를 설명한다. scripts/api-surface.mjs schema를 갱신해 생성 OpenAPI에도 단일·다중 코드 캔들 필드를 명시한다.
- 검증 결과: docs:api:generate, audit:api-surface 및 전체 VITEST_MAX_WORKERS=8 npm run deploy:verify 통과. 280 test files 중 279 passed·1 skipped, 1,624 passed·3 skipped; typecheck, production build, standalone runtime/API smoke, Chrome desktop/mobile smoke 통과.
- 커밋/배포: PR #3을 OCI에 병합한 commit 11138ba07b11858d8308bd6524877052d751719c로 push. Deploy OCI run 44637756237 성공. 운영 /api/health HTTP 200, /api-reference.md HTTP 200(원문 필드 및 fallback 설명), /openapi.json 단일·다중 candle schema의 tradingValue를 확인했다.
# [2026-11-22] 국내·미국 일봉 캐시 OCI 호출 경로 개선

### 목적·진단
- 국내·미국 일봉 캐시 지연 원인을 확인하고 OCI 자동 호출 경로와 재발 검사를 보강한다.
- 국내 일봉 호출이 OCI cron에 없었고, 미국 일봉은 장시간 선행 작업 뒤에 배치돼 KST schedule window를 놓칠 수 있었다.
- 운영 read-only 점검에서 KR 표본 최신 거래일은 `20261118`, US NAS/NYS는 `20261117`이었다. US run 최근 10건은 모두 `SKIPPED/outside_schedule`이었다. 운영 timer 자체의 미실행 여부는 OCI host journal을 직접 조회하지 못해 미확정이다.

### 변경 및 검증
- `scripts/oci-cron.sh`: 국내·미국 일봉 endpoint를 health probe 직후에 실행하도록 이동/추가.
- `scripts/check-oci-cron.mjs`: 두 endpoint 존재와 장시간 작업 전 순서를 검사.
- `vitest.config.mts`: 전체 배포 검증의 첫 테스트 시도가 15분 제한을 넘겼다. Vitest 기본 worker 수가 머신의 전체 병렬 수를 사용해 로컬에서 과도한 프로세스 경합을 유발했으므로, 공식 `maxWorkers` 옵션을 4로 제한한다.
- `docs/operations/daily-candle-cache-refresh-diagnosis.md`, `docs/operations/kr-daily-cache-refresh-runbook.md`: 근거, 개선, 배포 후 확인 절차와 잔여 위험 기록. 진단 파일은 문서 카탈로그의 날짜 보관 문서 제외 규칙과 충돌하지 않도록 안정적인 이름을 사용한다.
- `npm run cron:check`, `node scripts/test-oci-cron-package.mjs` 통과. 첫 `npm run deploy:verify`는 production dependency audit에서 Next.js 15.5.28 advisory로 실패했다. lockfile만 패치된 15.5.29로 올려 audit 0건을 확인했다. Vitest 기본 worker 병렬성에서 15분 timeout 후 `maxWorkers: 4`로 제한했다.
- 최신 원격 `oci` 기준(`09523322`)으로 재배치 후 최종 `npm run deploy:verify` 통과: production dependency audit 0 vulnerabilities, OCI activation preflight, docs/API/catalog/migration, scope/KIS/auth/cron audits, production build, standalone HTTP/Chrome desktop·mobile smoke, 전체 Vitest 280 files (279 passed/1 skipped, 1,624 passed/3 skipped), TypeScript 검사.
- commit/push/deploy 여부: 검증 완료, 한국어 상세 커밋 후 `oci` push로 배포 workflow를 실행할 예정.

### 2026-11-23 — 무인증 공개 국내·미국 일봉 갱신 API
- **목적**: 운영 자동화 외부에서도 누구나 국내 또는 미국 전체 활성 보통주 일봉 캐시 갱신을 요청할 수 있도록 공개 호출 경로를 제공한다.
- **원인·설계**: 기존 `/api/cron/*-daily-cache`는 cron secret을 요구해 외부 사용자가 호출할 수 없었다. 갱신은 DB write와 공급자 요청을 수행하므로 RFC 9110의 POST semantics에 따라 무인증 POST로 분리하고 기존 읽기 전용 GET OpenAPI에는 섞지 않았다.
- **변경**: `POST /api/public/daily-cache/kr/refresh`, `POST /api/public/daily-cache/us/refresh`와 공통 `lib/public-daily-cache-refresh.ts`를 추가했다. 호출자 인증 없이 작동하며 scheduler 시간창은 건너뛰되, 운영 enabled 설정을 존중하고 시장별 최소 1시간 cooldown(설정 interval이 더 크면 이를 적용), DB 분산 lock, `automation_runs` cooldown 확인을 둔다. 외부 reverse proxy 응답 제한을 넘는 작업은 Next.js `after()`로 넘겨 HTTP 202를 즉시 반환하며, cron 경로와 공개 호출이 동일한 시장 advisory lock을 공유한다. cooldown은 429/Retry-After, 이미 실행 중은 accepted:false인 202, 운영 비활성화는 409로 반환한다.
- **문서·감사**: `public/api-reference.md`, `public/llms.txt`, `docs/api/README.md`, 국내 캐시 런북과 진단 문서를 갱신했다. `scripts/api-surface.mjs`는 지정된 두 경로만 `public-action`으로 분류하고 POST 단독, route 존재, 인증 검사 부재, 최소 cooldown 및 cron/action lock 공유를 감사한다. 읽기 전용 OpenAPI에는 작업 경로를 등록하지 않는다.
- **검증·배포**: 초기 구현에서 `npm run audit:api-surface`, 타입 검사, 문서 검사 및 `npm run deploy:verify`가 통과했다(의존성 취약점 0, OCI activation preflight, API/docs/scope/KIS/auth/cron 감사, production build, standalone HTTP·Chrome desktop/mobile smoke, Vitest 280 files 중 279 passed/1 skipped, 1,624 passed/3 skipped). 커밋 `0412e993` 배포 후 운영 무인증 국내 POST는 앞단 nginx에서 504가 났고, 직후 두 번째 POST가 `already_running` 202를 반환해 작업 중 DB lock 유지가 확인됐다. Next.js 공식 self-hosted 지원 `after()` 방식 및 cron/action 공용 lock으로 보완한 후 최종 `npm run deploy:verify`도 통과했다(같은 전체 1,624 passed/3 skipped 포함). 비동기 보완분은 다음 상세 커밋·푸시로 배포할 예정이다.
- **남은 위험**: 공개 호출은 시장별 최소 1시간 cooldown과 DB lock으로 제한하지만 누구나 갱신을 요청할 수 있다. 202는 작업 접수만 의미하며 완료 성공 여부가 아니다. 완료 여부는 `GET /api/public/daily-candles`, automation_runs, 서버 로그의 최신 거래일·실행 결과·universe coverage로 확인한다.

## [2026-11-23] 미사용 코드 정리 OCI 배포 완료
- **목적·범위**: 미사용 helper/component 정리를 최신 원격 `oci` 이력과 통합해 운영 배포했다.
- **반영**: merge commit `48287620536eb6c30d15373a152a9a7fa143b395`를 `oci`에 fast-forward push했다. 미사용 모듈 정리 커밋과 원격 최신 20개 커밋을 포함한다.
- **검증**: 로컬 `npm run deploy:verify` 통과(의존성 감사 0 취약점, OCI activation preflight, 문서/API/catalog/migration/scope/KIS/auth/cron 감사, production build, standalone HTTP/API 및 Chrome desktop/mobile smoke, Vitest 280 files 중 279 passed·1 skipped, 1,624 passed·3 skipped, typecheck).
- **배포 후 확인**: GitHub Actions Deploy OCI run `45132995688` 성공. 활성화 로그에서 Flyway schema version 182, migration up-to-date, 410개 event upsert 성공을 확인했다. `GET /api/health`는 2026-11-23 07:50:01 UTC에 `status=ok`를 반환했다. 공개 health route는 상세 commit/build/Flyway 정보를 노출하지 않으므로 workflow 로그를 migration 근거로 사용한다.
- **남은 위험·다음 단계**: 없음. 커밋·푸시·배포 완료.
# [2026-11-23] RSS 조회 기본 날짜 안내 정정

### 목적·범위
- RSS 조회 기능의 날짜 선택 오류 가능성을 검토하고, 운영 API 구현과 상충하는 런북 안내를 바로잡는다.

### 확인 및 반영
- `/api/disclosures`는 생략한 `date`를 `getSeoulDateKey(now)`로 계산해 Asia/Seoul 오늘을 사용한다. RSS 런북은 UTC 기반 기본값이라고 잘못 안내해 KST 오전 실행 시 날짜를 잘못 예상하게 만들 수 있었다.
- `docs/operations/llm-rss-bullish-report-runbook.md`의 날짜 설명을 실제 코드 동작에 맞추고, 재현 가능한 조회를 위해 날짜 명시를 유지하도록 정정했다.
- 운영 `GET /api/disclosures?date=2026-11-23&source=all&page=1&pageSize=1`은 HTTP 200, `ok=true`, `total=95`를 반환했다. 응답의 최근 GLOBENEWSWIRE·STOCKTITAN·SEC_EDGAR 작업은 fetch/persist SUCCESS였고, RSS source coverage가 완전성을 뜻하지 않는다는 기존 설계 문서의 한계와 일치했다.

### 검증·잔여 과제
- route의 기본값 구현과 런북 문구를 대조하고 운영 read-only 조회를 수행했다. 이 변경은 문서만 수정하며 API 동작은 바꾸지 않는다.
- 다른 RSS source의 미수집/coverage UNKNOWN 상태는 기존 문서에 기록된 별도 수집 범위 문제이며 이번 조회 기본 날짜 수정 범위에서는 변경하지 않았다.
- `npm ci --no-audit --no-fund`와 `npm run deploy:verify` 통과. 전체 테스트 279개 파일 통과·1개 skipped, 1,624 passed·3 skipped; 타입 검사, 문서/API 감사, production build, standalone runtime/API smoke 및 Chrome 데스크톱·모바일 hydration smoke 통과.
- 커밋 `62c60b9d`를 `oci`에 push했고 GitHub Actions `Deploy OCI` run `45138724333` 성공을 확인했다. 배포 후 `GET /api/health`는 `status=ok`; `GET /api/disclosures?date=2026-11-23&source=STOCKTITAN&page=1&pageSize=1`은 HTTP 200, `ok=true`, `DB_QUERY_COMPLETE`, `total=32`이며 날짜와 출처가 요청과 일치했다.
# [2026-11-24] 미국 거래소 상태 자동 반영 및 상품 재분류

## 목적 및 범위
- 미국 일봉 cache에서 최신 거래일 봉이 빠진 5개 심볼이 거래정지/상장폐지인지와 KIS에서 확인할 수 있는 범위를 공식 자료 기준으로 점검하고, 거래소 상태를 주기적으로 DB에 기록한다.

## 근본 원인 및 변경
- 근본 원인: KIS 해외 상품 마스터는 거래정지/상장폐지 상태를 제공하지 않고, 로컬 마스터 내 상품명 파싱에서 `PRF` 약어와 `TRUST CERTIFICATE`를 놓쳤다. 이로 인해 ADR/우선주/신탁증서가 활성 보통주 partition에 남을 수 있었다.
- `lib/us-exchange-status-sync.ts`, `app/api/cron/us-exchange-status/route.ts`, `db/migration/V183__us_exchange_trading_status.sql`을 추가해 Nasdaq Trader halt RSS 및 상장 디렉터리를 매시간 읽고 원천, 사유코드, source payload, 관측시각을 DB에 저장하도록 한다. 구조가 올바른 빈 halt RSS는 현재 정지 없음으로 처리하고, 잘못된 RSS/HTTP 오류/빈 종목 디렉터리는 기존 상태를 바꾸지 않고 실패 처리한다. Eastern timestamp는 DST를 반영해 UTC로 저장한다.
- `scripts/oci-cron.sh`에 보호된 상태 갱신 endpoint를 등록했다. 신규 기능은 read-only 공개 GET이 아니라 cron 쓰기 작업이며 OpenAPI 공개 대상이 아니다.
- 상품 분류 규칙에서 `PRF`, `TRUST CERTIFICATE`를 인식하고 재분류 transaction을 상태 수집과 연계한다. 기존 캔들/이력은 유지한다.
- 자동 수집 범위의 한계: 현재 모든 거래소를 포괄하는 확정 상장폐지 OpenAPI는 찾지 못했다. Nasdaq 목록 부재만으로 delisted 처리하지 않으며, NYSE의 pending delisting 화면은 아직 자동 동기화하지 않는다.

## 5개 심볼 판정
- `PRFX`: Nasdaq directory financial status `D`는 상장요건 미달 경고다. SEC 제출 회사 공시는 hearing 요청이 suspension/delisting을 유예하고 Nasdaq Capital Market 거래가 계속된다고 명시한다. 거래정지/상장폐지 확정으로 기록하면 안 된다.
- `AKO/B`, `GGB`, `ITUB`: 거래소 목록에서 확인되는 상품이다. 저장된 KIS 영문명은 ADR/예탁증서 및 선호주 기초주식을 가리키므로 보통주 전용 범위에서 제외한다.
- `PYT`: SEC 제출 문서는 NYSE의 PPlus Trust Series GSC-2 trust certificate로 명시한다. 보통주가 아니지만 해당 문서만으로 거래불가/상장폐지를 뜻하지 않는다.

## 재발 자동 감지 및 운영 위험
- 매시간 cron 결과와 `us_exchange_trading_status.observed_at`으로 소스 freshness를 확인한다. stale/실패 상태에서는 거래 가능 여부를 최신으로 단정하지 않는다.
- Nasdaq Trader halt feed는 거래일 중 분당 한 번 갱신되므로 현재 수집 주기는 장중 초단위 대응이 아닌 hourly 점검이다.
- `LISTING_ISSUE`는 D/E/Q/K 금융상태 경고이고 거래정지와 구분한다. halt 미관측/목록 부재만으로 `DELISTED`를 만들지 않는다. 다음 개선은 NYSE Form 25 pending delisting 목록의 정식 구조/API와 effective date 검증 및 알림 소비 경로다.

## 검증
- `lib/us-exchange-status-sync.test.ts` 및 `lib/instrument-universe-import.test.ts`: 2개 파일 16 tests 통과. 최종 `npm run deploy:verify` 통과: 의존성 감사 0 취약점, production build, standalone + Chrome 데스크톱/모바일 smoke, 283개 테스트 파일 중 282개 통과·1개 skip (1,637 passed·3 skipped), typecheck, Flyway/docs/API/security/cron 감사.
- 1차 구현 커밋 `24996459`를 `oci`에 push. GitHub Deploy OCI run `45337340106` 성공; `/api/health`는 2026-11-24T06:09:00Z `status=ok`.
- 배포 후 보호된 `/api/cron/us-exchange-status`를 2026-11-24T06:09:35Z 실행해 DB upsert 및 상품 파티션 재조정을 확인했다. 응답: 활성 HALTED 0, 정상 halt feed row 0, 거래소 directory 8,816, Nasdaq listing issue 357, 재분류 347. 정상 빈 RSS는 현재 활성 halt 없음으로 저장된다.
- 운영 DB 직접 읽기 권한은 없어 다섯 ticker의 SQL row별 저장 결과는 별도 SELECT로 확인하지 못했다. 성공 응답 및 transaction 구현을 통해 쓰기 작업 성공을 확인했으나 ticker별 readback은 미검증이다. 다음 단계는 NYSE pending delisting feed 자동화와 read-only status 조회 경로를 추가하는 것이다.
- 2026-11-24T06:26Z 보호된 US 일봉 상태 GET은 새 보통주 유니버스 4,820개 전부에서 11/23 최신 봉을 확인했다. 이전 5,122개에서 347개 partition 재조정 후 적격 수가 감소한 결과라, 이를 원래 5개 봉이 전부 복구된 것으로 해석하지 않는다.
- 후속 분류 감사에서 `PRFX`의 정상 회사명 `PRF Technologies`가 일반 `\bPRF\b` 조건과 겹쳐 우선주로 오분류되는 오류를 찾았다. `PRF SHS/stock/날짜`처럼 증권 종류 문맥에 한해 우선주로 판단하도록 좁히고 PRFX ordinary-share 회귀 사례를 추가했다.
- 문서 전용 배포 run `45339258847`은 Flyway V183 검증 후, 배포마다 변경이 없는 `market-impact-events.json`까지 다시 import하며 공식 COMMON_STOCK guard에 `QNRX, MRM, TKLF, FENG`가 걸려 실패했다. activation은 release path 교체 전에 실패해 기존 서비스 복구를 완료했고 health는 `ok`였다. 동일한 JSON 소스가 이미 배포된 release와 byte-identical이면 재 import를 생략하고, source가 달라진 경우에는 기존 official-stock gate를 계속 실행하도록 activation을 보강했다.
- 후속 fix의 `npm run deploy:verify` 통과(1,637 tests passed/3 skipped, build, standalone+Chrome desktop/mobile smoke, typecheck, docs/Flyway/API/security/cron audits). Fix 커밋·푸시 및 후속 운영 배포: 대기.
### 2026-11-26 — 일봉 API 변환 비용 추가 제거
- 목적/범위: gzip level3 및 500종목 batch 운영 구현에서 일봉 JSONB 숫자 필드의 중복 `Number()` 변환 비용을 제거하고 로컬 API 응답 계약을 재확인했다.
- 근본 원인/개선: SQL JSONB가 candle open/high/low/close/volume/tradingValue를 JSON 숫자로 반환해 `pg` 파서가 이미 JS number로 제공한다. 이를 다시 `Number()`로 감싸는 변환은 불필요하므로 제거했다. NUMERIC 문자열일 수 있는 marketCap과 count 변환은 유지했다. ISO 변환 캐시 실험은 효과가 분명하지 않아 채택하지 않았다.
- 비교 결과: 로컬 PostgreSQL API 3회 순차 호출 결과 KR 3073/491/424ms, US 1681/1104/1088ms였다. ISO 캐시 적용 실험의 뒤이은 표본은 KR 656/442/467ms, US 1024/1097/1064ms여서 해당 캐시는 제외했다. 앞선 500x5 warmed 표본(KR 약 592ms, US 약 1134ms)과 비교하면 추정 차이는 KR 개선, US 소폭 개선 수준이나 표본·시스템 변동이 있어 운영 개선으로 단정하지 않는다. 250x10 및 400x5 batch 실험도 일관된 이득이 없어 기각했다.
- 계약 검증: 변경 후 로컬 무인증 GET에서 gzip XFL=0, gzip 해제와 JSON 파싱, KR 2,352/US 5,012 ticker, 상위 키 `ticker`/`marketCap`/`daily`, 최대 20개 봉을 확인했다. payload 크기는 KR 1,465,073B, US 3,306,774B로 변경 전과 사실상 동일했다.
- 운영 배포 검증: `npm run deploy:verify` 전체 통과(283개 테스트 파일 통과/1 skip, 1,645 tests passed/3 skipped, build, standalone+Chrome desktop/mobile smoke, typecheck, API/security/docs/cron audits). commit `84668fe1` push 후 Deploy OCI run `45745572340` 성공.
- 운영 실측: 변경 배포 후 무인증 GET을 시장별 2회 순차 호출했다. KR 25.412초/22.144초(중앙값 23.778초), US 78.019초/76.179초(중앙값 77.099초). 이전 level3 구현 측정 중앙값(KR 19.384초, US 84.102초)과 비교하면 KR은 빨라지지 않았고 US는 8.3% 짧았다. 시점별 서버 부하와 표본 수 차이가 있어 이 변환 제거의 운영 속도 효과를 입증하지 못했다. gzip byte는 KR 1,484,790–1,485,050B, US 3,370,774–3,370,784B로 동일 수준이며 모든 호출에서 HTTP 200, XFL=0, gzip 해제·JSON 파싱 성공, ticker 수 2,337/5,011, 키 `ticker`/`marketCap`/`daily`, 최대 20봉을 확인했다.
- 자동 회귀 감지/남은 위험: 기존 gzip API 테스트가 무인증·필드·20봉 계약을 검사한다. 로컬 timing과 2회 운영 표본만으로는 미세 CPU 최적화의 효과나 p95를 주장할 수 없다. 다음 개선은 운영 실측 변동폭보다 큰 재현 가능한 이득을 확인한 뒤 적용한다.
- 변경 파일: `lib/public-daily-export.ts`, `DEVELOPMENT_LOG.md`. 작업 트리: 별도 worktree `codex/daily-export-deploy-20261126`; 커밋·푸시 및 운영 배포 완료.
### 2026-11-26 — gzip 일봉 API의 Node JSON 재파싱·재직렬화 제거
- 목적/범위: API 응답마다 수행하던 PostgreSQL JSONB → `pg` JSON.parse → Node DTO 객체 재구성 → JSON.stringify 경로를 우회해, SQL에서 계약 DTO를 JSON 텍스트로 만들어 gzip 스트림에 직접 전달하는 속도 개선 후보를 검증한다.
- 근본 원인/개선 후보: ticker별 최대 20개 봉을 DB가 JSONB로 aggregate한 뒤 Node에서 다시 파싱하고 날짜·값 객체를 재생성해 문자열화하고 있었다. query가 완성 DTO JSON 텍스트를 반환하면 대량 중간 객체 생성과 Node JSON 왕복을 없앨 수 있다. 시장가치의 NULL/양수/유한 double 조건, UTC millisecond `Z` timestamps, 종목 자격 조건과 기존 필드 순서를 SQL로 보존한다.
- 로컬 기준선/후보 실험: 같은 로컬 PostgreSQL API, 순차 gzip 해제까지 포함. 기존 구현 3회 KR 3967/508/463ms, US 3478/1113/1117ms(첫 호출 제외 warmed median KR 485.5ms, US 1117ms). SQL 직렬화 후보 3회 KR 699/319/390ms, US 1057/899/957ms(median KR 390ms, US 957ms). 대략 KR 20%, US 14% 단축됐지만 작은 표본이며 운영 성능 개선으로 단정하지 않는다. gzip 크기는 KR 1,465,073→1,506,947B(+2.9%), US 3,306,774→3,403,223B(+2.9%)로 증가해 전송 구간에서 얻는 이득을 일부 상쇄할 수 있다.
- 계약 확인: 로컬 전체 payload에서 KR 2,352/US 5,012 ticker, keys `ticker`/`marketCap`/`daily`, daily 0–20개, 유효한 market cap 숫자, 각 candle 수치 필드 유한 number, returnedCount/latestDate 일치, UTC ISO millisecond timestamp, gzip XFL=0을 확인했다. 라우트 테스트 7개 통과.
- 운영 검증: 전체 `npm run deploy:verify` 통과(283개 테스트 파일 통과/1 skip, 1,645 passed/3 skipped, build/typecheck/standalone+Chrome smoke/docs/API/security/cron audits). commit `6ecb6998`, Deploy OCI run `45749848553` 성공 후 공개 무인증 API를 KR 2회, US 3회 순차 호출했다. KR 21.293/10.007초(중앙값 15.650초), US 85.977/76.894/64.489초(중앙값 76.894초). 직전 level3 운영 표본(KR 19.384초, US 84.102초) 대비 각각 약 19.3%/8.6% 단축됐다. 압축 크기 중앙값은 KR 1,524,855B, US 3,464,687B로 각각 약 2.7%/2.8% 증가했다. 모든 호출 HTTP 200, XFL=0, `application/gzip`, Content-Encoding 없음, no-store, gunzip/JSON 성공, KR 2,337/US 5,011 ticker, keys 및 20봉 상한 통과. 최장 chunk 간격은 KR 19.317초, US 43.776초.
- 자동 회귀 감지/남은 위험: route test는 raw JSON streaming, no-auth/no-store, top-level order, max20, batch 제한을 검사하고 전체 운영 payload에서도 값·timestamp·count/date 일관성을 검증했다. 운영 표본 2–3회는 시점 부하가 통제되지 않아 p95나 확정적 인과 효과를 뜻하지 않는다. US 총 시간은 여전히 60초를 넘지만 chunk heartbeat 간격은 이번 표본에서 60초 미만이다. 후속 최적화는 SQL query batch 생산 지연과 JSON/GZIP/전송 시간을 분리한 증거를 모아 검토한다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 본 로그. commit `6ecb6998`을 `oci`에 push했고 운영 배포 및 API 검증을 완료했다.
### 2026-11-26 — 일봉 조회에서 행 전체 JSON 변환 제거
- 목적/범위: DB가 매 ticker 최근 봉의 `trading_value`를 얻으려고 매번 candle 전체 행을 JSON화하는 비용을 제거해 US API 처리 시간을 추가 단축한다.
- 근본 원인: `to_jsonb(c)->>'trading_value'`는 필요한 값 하나를 위해 candle 행 전체를 JSON 변환하며, 숫자 검증과 변환식에서 같은 변환을 반복했다. 마이그레이션 V92(US), V180(KR)는 각 candle 테이블에 해당 컬럼을 추가하지만 개발 DB가 V161이면 KR 컬럼이 없어 직접 참조 쿼리가 실패한다.
- 개선: 첫 universe 조회에 `pg_attribute` 기반 컬럼 존재 확인을 포함하고, 컬럼이 있으면 `c.trading_value::text`를 검증해 직접 사용한다. 컬럼이 없는 구형 로컬 DB는 이전 `to_jsonb` fallback을 유지한다. 유효 숫자 정규식과 `close*volume` fallback 의미는 그대로다. 데이터베이스 스키마나 행은 변경하지 않았다.
- 로컬 실측: 동일 PostgreSQL·직렬 fetch+gunzip 기준 baseline warmed KR 431.5/424.5ms(중앙값 428.0), US 1,185.8/1,176.0ms(중앙값 1,180.9). 변경 후 KR fallback 533.8/370.9/392.7ms(중앙값 392.7), US 직접 컬럼 경로 862.5/856.9/900.6ms(중앙값 862.5), US 약 26.9% 단축. 기존과 gzip byte가 KR 1,506,947B, US 3,403,223B로 같고 ticker/candle 수(KR 2,352/46,996, US 5,012/99,486)도 같았다. KR 직접 컬럼 경로는 local DB가 V161이라 측정 불가하며, V180 운영 스키마에서 배포 실측이 필요하다.
- 회귀 확인: API 테스트 8개 통과. 컬럼 존재/부재 SQL 선택, raw JSON streaming, 필드·무인증·no-store, 500 batch, heartbeat 및 20봉 계약을 확인했다. 전체 `npm run deploy:verify` 통과(283개 파일 통과/1 skip, 1,646 passed/3 skipped, build/typecheck/standalone+Chrome smoke/docs/API/security/cron audits).
- 운영 검증: commit `87059c21`, Deploy OCI run `45754074044` 성공 후 무인증 공개 API를 KR 2회, US 3회 호출했다. KR 10.773/6.343초(중앙값 8.558초), US 46.864/71.051/76.592초(중앙값 71.051초). 직전 SQL 직접 직렬화 구현의 중앙값(KR 15.650초, US 76.894초)보다 KR 약 45%, US 약 7.6% 짧았다. 호출 시점 부하가 통제되지 않아 이 차이를 인과적 개선으로 확정할 수는 없다. gzip 크기 중앙값은 KR 1,524,839.5B, US 3,465,494B로 이전과 비슷했다. 모두 HTTP 200, XFL=0, gzip/no-store 헤더, gunzip/JSON, KR 2,337/US 5,011 ticker, 최대 20봉을 통과했다. 최대 chunk 무응답은 KR 9.600초, US 34.479초.
- 남은 위험/다음 단계: `pg_attribute` 컬럼 검사는 공개 요청의 초기 universe 쿼리에서 매번 수행된다. 로컬 DB는 V161이라 KR fallback만 검증됐고, 운영의 V180 direct column 경로는 위 운영 GET으로 검증했다. 원격 반복 표본이 적고 변동폭이 커서 다음 개선에서도 실제 운영 전체 완료시간을 기준으로 판단한다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 본 로그. commit `87059c21`을 `oci`에 push했고 운영 배포 및 API 검증을 완료했다.
### 2026-11-26 — gzip 압축 수준 4 운영 실측
- 목적/범위: 일봉 공개 gzip API의 압축 단계를 3에서 4로 올린 후보를 배포하고, 운영 API 크기·시간·데이터 계약을 확인한다.
- 변경/원인: JSON payload는 반복적인 구조를 가져 gzip level4에서 전송 크기가 감소하는 로컬 신호가 있었다. 동일 19,399,949B 입력의 gzipSync 비교에서 level3 3,403,217B/98.555ms, level4 3,200,707B/119.695ms였다. 압축 CPU 증가가 포함된 전체 운영 요청 시간에서 이득인지 확인이 필요했다.
- 배포 및 운영 결과: commit `9948d0b4`, OCI run `45779156775`가 CI 및 Activate release 성공. 공개 운영 KR GET은 HTTP200, application/gzip, no-store, XFL0, 23.113초/1,433,407B 및 10.722초/1,433,839B였다. 두 번 모두 gzip 해제/JSON 파싱 후 2,337 ticker, ticker/marketCap/daily, returnedCount 일치, 20봉을 확인했다. raw bytes는 8,925,884였다. US는 첫 응답 스트림이 중간 종료됐고 재시도는 HTTP200, 69.459초, gzip 3,244,621B, raw 19,004,536B였다. 재시도 US gzip 해제/JSON 파싱 및 5,011 ticker, 각 항목 ticker/marketCap/daily, returnedCount 일치, 0–20봉을 검증했다. 운영 level3 기준 KR 1,524,715B 및 US 3,464,301–3,464,986B에서 각각 약 6.0%/6.3% 감소했다.
- 판정/남은 위험: 전송 bytes는 줄었지만 운영 속도는 입증되지 않았다. 표본이 작고 부하 통제도 없으며 US 69.459초는 직전 level3 중앙값 45.042초보다 길다. 시점 부하를 원인으로 단정할 수 없어 level4 압축량 설정은 유지하되 speedup 주장은 보류한다. 공개 GET을 반복해 지연을 추적하고, 향후 개선은 DB query/압축/전송 구간별 시간 계측과 충분한 운영 반복을 기준으로 채택한다. gzip contract와 max20 API 회귀 검증을 유지한다.
- 변경 파일: `lib/public-daily-export.ts`, `docs/operations/public-daily-export-performance-report.md`, 본 로그. `npm run deploy:verify`는 push 전 candidate에서 통과; docs 수정은 추가 예정. 코드 commit/push는 기존 `9948d0b4`에 포함되어 운영 배포됨. 본 문서 후속 커밋/배포는 대기.
### 2026-11-26 — gzip 압축 레벨 운영 재측정 및 속도 우선 복귀
- 목적/범위: gzip level4 배포 후 충분한 운영 반복으로 시간을 확인하고, size/CPU/elapsed tradeoff를 근거로 설정을 선택한다.
- 운영 level4 기준선: 운영 공개 GET KR/US 각 5회, 전체 응답 다운로드 후 gzip/JSON/계약 검증 5/5 성공. KR 28.928/7.705/8.363/10.826/25.656초(중앙값10.826), US 62.285/72.635/68.069/47.494/61.826초(중앙값62.285). KR/US raw bytes 8,925,884/19,004,536, ticker 2,337/5,011, daily bars 20–20/0–20. gzip bytes KR 1,433,407–1,434,290, US 3,243,685–3,245,798, HTTP200, application/gzip, no-store, XFL0.
- 원인 판정: level4 전 US 운영 중앙값 45.042초보다 이번 중앙값이 38.3% 길지만 서버 부하가 통제되지 않아 인과를 확정할 수 없다. 동일 로컬 DB/Next API에서 직전 level4 3회 warmed median KR398ms/US804ms, level3 5회 median KR311ms/US760ms로 level3가 약21.9%/5.5% 짧았다. 압축 크기는 level4가 약 6% 작았고, 같은 payload gzipSync에서도 level4 CPU가 늘었다. 따라서 level4의 크기 이득이 속도 목표보다 우선하지 않으며, 속도 우선으로 level3 복귀를 선택한다.
- 변경/검증: `lib/public-daily-export.ts` gzip `level: 4`를 3으로 복구. 로컬 변경 후 warmed 5회 모두 HTTP200/XFL0; KR 281–410ms/1,506,947B, US 672–766ms/3,403,223B. 배포 후 운영 GET을 각 시장 5회 반복하고 20봉/JSON/gzip 계약과 완료시간을 비교한다.
- 남은 위험/다음 단계: 운영 지연 변동폭이 크므로 5회도 확정 인과 효과/p95가 아니다. 복구 배포 후 속도 회복을 확인하고, query/first byte/last byte/GZIP CPU를 분리 계측할 수 있는 candidate를 별도 설계한다. DB 실행 계획을 확인하지 못한 상태에서 인덱스나 query concurrency를 임의 변경하지 않는다.
- 변경 파일: `lib/public-daily-export.ts`, 성능 보고서, 본 로그. 로컬 검증: `npm run deploy:verify` 및 후속 commit/push/deploy는 대기.
### 2026-11-26 — gzip level3 복귀 배포 운영 실측
- 목적/범위: gzip level4를 속도 우선 원칙에 따라 level3로 되돌려 배포하고, 운영 API를 시장별 5회 측정해 level4 반복 기준과 비교한다.
- 배포: commit `586fb91d`, Deploy OCI run `45787463222` 성공. 변경은 `lib/public-daily-export.ts`의 gzip level 4→3이다.
- 운영 결과: KR 5회 15.748/10.934/12.358/9.994/16.840초(median12.358), gzip 1,524,715–1,525,103B/raw8,925,884B, 2,337 ticker·20봉. US 유효 5회 56.361/62.293/61.286/53.865/50.032초(median56.361), gzip3,464,597–3,465,388B/raw19,004,536B, 5,011 ticker·0–20봉. US 다섯 번째 원 시도는 스트림 종료 오류로 제외하고 재시도했으며 재시도 응답은 HTTP200 및 gzip/JSON/data 계약을 통과했다. 모든 유효 응답은 HTTP200, application/gzip, Content-Encoding 없음, no-store, XFL0, ticker/marketCap/daily 필드, returnedCount 일치, max20을 검증했다.
- 속도 판정: level4 각 5회 중앙값 KR10.826/US62.285초와 비교하면 level3 KR은 14.2% 느리고 US는 9.5% 빠르다. 서버 부하와 네트워크 상태를 제어하지 않아 운영 시간의 차이는 인과적으로 확정할 수 없다. 동일 로컬 DB/Next API 측정에서 level3는 level4보다 KR21.9%/US5.5% 짧았고 압축 CPU도 낮았다. 크기는 level4가 더 작다. 속도 우선으로 level3를 유지하되 KR의 운영 지연 개선은 확인되지 않았다고 보고한다.
- 남은 위험/다음 단계: 운영 총시간에는 DB query 대기·gzip·전송이 함께 포함되고 편차가 크다. 다음 candidate에서 로컬 gzip level1/2/3을 비교했다. warmed 4회 중앙값 기준 level1은 KR323.5ms/US655.5ms, level2는 KR299.5ms/US644ms, level3는 KR303ms/US737.5ms였다. gzip level2는 기존 XFL0/header contract를 유지하면서 US에서 level3보다 약12.7% 빨라 운영 배포 후보로 선택했다. level2의 deploy:verify·커밋·운영 배포 및 시장별 5회 반복은 다음 작업이다. `npm run deploy:verify`는 level3 candidate에서 통과했고, 이 실측 문서 변경의 검증/배포는 대기다.
- 변경 파일: `lib/public-daily-export.ts`, `docs/operations/public-daily-export-performance-report.md`, 본 로그.
### 2026-11-26 — gzip level2 운영 속도 후보 선정
- 목적/범위: level3 복귀 후 더 빠른 gzip level1/2가 기존 단일 gzip contract 안에서 운영시간을 줄일 가능성을 로컬 DB/API로 비교한다.
- 실험: 동일 scripts/dev-server.mjs 및 local DB에서 level3/2/1을 각각 5회 순차 호출했다. 첫 request 제외 warmed 4회 median: level3 KR303ms/US737.5ms, 1 KR323.5ms/US655.5ms, 2 KR299.5ms/US644ms. gzip bytes (KR/US): level3 1,506,947/3,403,223; level1 1,585,372/3,584,665; level2 1,552,305/3,493,095. level2 US는 level3보다 12.7% 빠르고 bytes +2.64%; KR median은 1.2% 빠르다. level1 XFL4이고 level2/3 XFL0이다.
- 결정/변경: `lib/public-daily-export.ts` gzip level을 2로 둔 후보. 기존 API는 단일 gzip 유지, XFL0 및 payload/max20/no-store 무변경. level2 운영 측정 후 US에는 level2, KR에는 level3를 쓰도록 시장별 적용하는 후보를 선택했다.
- 남은 위험/다음 단계: 로컬 표본은 운영부하 및 운영 network와 다르므로 속도 개선은 운영 미확인. 전체 `npm run deploy:verify` 후 배포, 운영 KR/US 각 5회 gzip decompress/JSON contract 검증을 거쳐 채택 또는 복귀 결정한다.
- 변경 파일: `lib/public-daily-export.ts`, `docs/operations/public-daily-export-performance-report.md`, 본 로그. 검증/커밋/푸시/배포 대기.
### 2026-11-26 — gzip level2 운영 실측과 시장별 설정 후보
- 운영 배포/표본: commit `2f83f798`, OCI run `45790675516` 성공. gzip level2 설정으로 KR/US 무인증 GET을 각 5회 실행했다. KR 중앙값13.877초(21.035/21.015/13.877/10.612/9.823), gzip1,562,780–1,563,066B/raw8,925,884B, ticker2,337·20봉. US 유효 5회 중앙값52.211초(42.438/52.211/51.508/67.332/55.848), gzip3,543,075–3,543,643B/raw19,004,536B, ticker5,011·0–20봉. US 중 1회는 63.541초에 전송 중 종료돼 retry 후 유효 응답을 대체 표본에 포함했다. 모두 valid gzip, XFL0, no-store, JSON/ticker/marketCap/daily/returnedCount/max20 계약 통과.
- level3 기준(동일 운영 반복): KR median12.358초, US56.361초. level2는 KR 12.3% 느리고 US7.4% 빠르다. 양 시장 gzip bytes는 약2.5% 커졌다. 시간 표본은 부하 통제가 없어 인과효과를 확정할 수 없고 중간 종료가 있었음을 함께 기록한다.
- 다음 후보: 시장별 `gzipLevel`로 KR3/US2 설정. 로컬 API smoke 5회씩에서 KR median warmed347ms/ gzip1,506,947B/XFL0, US median warmed658ms/3,493,095B/XFL0였다. 운영 속도는 다음 배포 실측으로 판정한다.
- 변경 파일: `lib/public-daily-export.ts`, 성능 보고서, 본 로그. 전체 검증/커밋/푸시는 다음.

### 2026-11-26 — gzip 시장별 설정 배포 및 운영 재검증
- 목적/범위: 공개 일봉 gzip API의 완료시간을 줄이기 위해 로컬 및 앞선 운영 관측에서 각각 빠른 후보였던 KR level3, US level2를 배포하고 API별 5회 검증한다.
- 변경 및 배포: `lib/public-daily-export.ts`에서 시장별 gzip 레벨을 적용했다. 커밋 `4bce6a68`, OCI run `45794000840`의 검증·패키징·업로드·활성화가 모두 성공했다. 헬스체크는 HTTP 200.
- 운영 실측: 전체 gzip 응답을 순차로 각각 5회 다운로드/해제했다. KR 시간 10.807/5.950/8.705/3.760/3.339초(median5.950), gzip1,524,715–1,525,055B/raw8,925,884B, 2,337 ticker·20봉. US 45.406/60.268/63.608/36.412/50.560초(median50.560), gzip3,542,946–3,543,067B/raw19,004,536B, 5,011 ticker·0–20봉. 모두 HTTP200, application/gzip, Content-Encoding 없음, no-store, XFL0, JSON array/티커/시가총액/일봉/returnedCount/max20 계약 통과.
- 판정/남은 위험: 직전 양시장 level2 운영 중앙값 KR13.877초/US52.211초와 단순 비교해 각각 57.1%/3.2% 짧았다. 부하를 통제하지 않아 gzip 레벨 변경의 인과 효과로 단정하지 않는다. gzip 크기와 payload 계약은 유지됐고 현 시장별 조합은 유지한다. 속도 자동 회귀 감지를 위해서는 DB 쿼리·gzip CPU·첫/마지막 byte 시간을 분리한 계측 및 동일 조건 반복이 남아 있다.
- 문서/변경 파일: `lib/public-daily-export.ts`는 기존 코드 커밋에 포함; 운영 성능 보고서와 본 로그에 측정/배포 내용을 추가했다. 문서 커밋 `ae743c20`은 전체 `npm run deploy:verify` 성공 후 push했으며 OCI run `45797119333`이 성공했다. 배포된 운영 보고서 URL은 HTTP 200, `text/markdown; charset=UTF-8`이며 새 시장별 실측 섹션과 한글 UTF-8을 확인했다.

### 2026-11-26 — 공개 gzip export 단계별 지연 계측
- 목적/범위: 운영 API 전체 완료시간만으로는 느린 원인을 판별할 수 없어, 후속 속도 개선이 DB/query 또는 gzip 생성 중 실제 병목을 겨냥하도록 완료 시점 구조화 계측을 추가한다.
- 근본 원인: 기존 운영 GET 검증은 클라이언트의 전체 다운로드 시간과 gzip bytes만 측정했다. 서버의 universe query, 병렬 batch query wave, 스트림 시작/완료 구간은 분리되지 않아 batch 크기·동시성 변경의 근거가 부족했다.
- 변경: `lib/public-daily-export.ts`가 market/ticker/batch 수, universe query 시간, batch query count/waves/wall/누적/max 시간, gzip 첫 byte/stream/total 경과시간, gzip bytes를 스트림 완료 로그에 기록한다. ticker 식별자와 응답 필드는 로그하지 않으며 HTTP header/body 계약은 바꾸지 않는다.
- 자동 회귀 감지: `app/api/public/daily-export/kr/route.test.ts`가 전체 응답 완료 후 단계별 계측의 필수 필드와 값 타입을 확인한다. 전체 배포 검증에도 이 route regression test, HTTP smoke, 전체 build/typecheck 게이트를 유지한다.
- 위험/한계 및 다음 단계: gzip stream wall 시간은 DB wait/backpressure와 겹쳐 순수 CPU 시간이 아니며 네트워크 마지막 byte 도착을 측정하지 않는다. 취소된 요청은 완료 로그가 없을 수 있다. 배포 후 서버 로그의 KR/US 표본을 모아 병목 구간만 다음 후보로 수정하고, 다시 각 시장 5회 운영 GET으로 gzip/API 계약과 완료시간을 검증한다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 운영 성능 보고서, 본 로그. 대상 route 테스트 12개 및 TypeScript typecheck 통과. 전체 `npm run deploy:verify`에서 283개 test files passed/1 skipped, 1,650 tests passed/3 skipped, build/typecheck/docs/API/security/cron/runtime/Chrome desktop-mobile smoke 통과. commit `d74c2a8b`, OCI run `45801396076` 성공.
- 배포 후 API 실측: KR 순차 5회 17.322/6.491/2.882/3.292/3.358초(median3.358), gzip1,524,715B/raw8,925,884B, 2,337 ticker·20봉. US 유효 5회 51.024/57.913/59.936/56.997/53.413초(median56.997), gzip3,543,082–3,543,666B/raw19,004,536B, 5,011 ticker·0–20봉. 모든 유효 응답 HTTP200/application-gzip/Content-Encoding 없음/no-store/XFL0, 전체 gunzip/JSON/필드/returnedCount/max20 검증 성공. US 본문 전송 실패 한 건은 성공 표본에서 제외하고 유효 재시도로 대체했다.
- 운영 계측 한계: 현재 컴퓨터에 OCI SSH 자격증명이나 journald 연결 도구가 없어 계측 로그 필드 숫자를 직접 열람할 수 없었다. 완료 로그를 출력하는 코드와 필드 형식은 테스트에서 검증했고 운영 API 완료시간/데이터 계약은 확인했지만, 단계별 운영 병목의 실측은 미완료이며 다음 실제 속도 변경 전 로그 접근을 확보해야 한다. 배포 표본은 부하 통제가 없어서 직전 API 완료시간과 인과 비교하지 않는다.
- 로컬 계측 확인: `npm run dev`가 `scripts/dev-server.mjs`를 통해 `.env.local`을 주입한 API에서 sequential KR/US GET을 실행했고 로그 필드와 body를 확인한 뒤 서버를 종료했다. KR 2,352 ticker/5 batch/1 wave, universe63ms, batch wall1,075ms, query sum5,108/max1,074ms, first gzip byte70ms, stream1,203ms, total1,268ms, gzip1,506,947B; US 5,012 ticker/11 batches/2 waves, universe149ms, batch wall1,630ms, sum14,692/max1,602ms, first151ms, stream1,876ms, total2,026ms, gzip3,493,095B. 개발 API 클라이언트 완료시간에는 최초 컴파일이 포함되어 운영과 비교하지 않는다. psql/OCI CLI/config/SSH key가 없어 read-only 운영 journald 접근은 불가함을 확인했다.

### 2026-11-26 — US 공개 일봉 export batch 크기 750 후보 기각 및 복구
- 목적/범위: 운영 US export API의 batch wave 지연을 줄일 수 있는지 `lib/public-daily-export.ts`에서 US batch size만 500→750으로 조정해 동일 로컬 DB/Next API로 후보를 비교한다. KR500, DB 동시성 KR5/US10, gzip level 및 API payload/필터/max20은 그대로 둔다.
- 근거: 5,012 ticker 기준 기존 500은 11 query/2 wave(10+1), 750은 7 query/1 wave다. 단일 1,000 batch 후보는 앞선 운영에서 느려져 복구한 이력이 있어, 더 작은 750 후보만 비교한다.
- 로컬 실측: baseline US 500 batch 5회 client 3.354/0.770/0.698/0.734/0.806초, 첫 dev compile 제외 warmed median0.752초. Candidate750 0.945/0.717/0.685/0.646/0.661초, warmed median0.673초(-10.5%). 내부 계측 total median713.5→640ms(-10.3%), batch wall median352→316.5ms(-10.1%); gzip/raw bytes는 3,493,095/19,399,949B 동일, 5,012 ticker와 max20 계약 통과.
- 자동 회귀 감지: route test가 US batch sizes `[750,750,750,251]`, 동시 query 상한10 및 KR batch500/동시성5를 확인하도록 갱신했다. 대상 API test 12개 통과 및 typecheck 통과.
- 운영 반증: 후보 `734eadf4`, OCI run `45809274075` 성공 후 운영 KR5/5는 유효(13.316초 중앙값, gzip1,524,715–1,525,115B/raw8,925,884B, ticker2,337·20봉). US는 9회 중 4회 본문 수신 성공, 5회 전송 중 연결 오류. 유효 US 완료시간 69.692/44.622/67.408/64.490초(median65.949)는 직전 500 기준 US56.997초보다 15.7% 느렸다. 모든 유효 US response는 200, gzip XFL0/no-store, JSON 계약 통과. 운영 편차가 있지만 후보의 운영 이득은 입증되지 않았다.
- 결정/복구: batch750은 기각하고 US도 batch500으로 복구했다. 기존 query concurrency KR5/US10, gzip levels KR3/US2, 응답 계약을 보존한다. rollback commit `09a3cf3a`, OCI run `45813113553` 성공. 복구 후 KR5/5 유효(31.529/7.271/5.366/3.746/3.326초, median5.366; gzip1,524,715–1,525,026B/raw8,925,884B, 2,337 ticker·20봉), US6회 중5/5 유효(58.130/48.690/56.973/65.449/65.308초, median58.130; gzip3,543,018–3,543,592B/raw19,004,536B, 5,011 ticker·0–20봉). 모든 유효 응답은 HTTP200/gzip/no-store/XFL0 및 gunzip/JSON/returnedCount/max20 계약 통과. 복구 후에도 1/6 US 응답이 중단되어 원인은 불명이며, 500이 750보다 빠르다는 인과 주장은 하지 않는다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 운영 성능 보고서, 본 로그. rollback 전체 검증 통과 후 commit/push/deploy했으며, 현재 실측 기록 문서화 검증·배포 대기.
### 2026-11-26 — compact SQL JSON row serialization speed candidate
- Purpose/scope: Evaluate a public daily-export API response-time candidate while keeping gzip-only output, ticker/market-cap/daily schema, eligibility, ordering, and the 20-candle cap unchanged. Replaced top-level `json_build_object(...)::text` with `row_to_json(payload)::text`, where a lateral row aliases the same three fields.
- Measurements/validation: Local API was called six times per market; excluding first cold request, median KR 0.36s (0.32–0.38s), US 0.75s (0.72–0.83s), compared with prior local baseline KR 0.350s/US 0.706s. Thus local timing does not prove CPU speedup. Gzip bytes KR 1,506,865 and US 3,491,027, about 1.18%/1.47% below recent production baseline medians. Gzip decompress/JSON checks found KR 2,352 and US 5,012 tickers, fields valid, candle counts matched metadata, max20; HTTP200, application/gzip, XFL0/no-store. Target route tests 12/12 and `git diff --check` passed.
- Root-cause hypothesis/risk: PostgreSQL `json_build_object` text rendering adds whitespace. Compact row serialization reduces transmitted gzip bytes; this may reduce client completion time on the observed path, but local runtime is essentially unchanged and SQL CPU effects remain unproven. Operating timing includes server/network load. Numeric text format may differ while parsed numeric values remain equal.
- Deployment/regression plan and result: `npm run deploy:verify` passed before commit/push: full build, runtime/Chrome smoke, docs/API/security/cron gates, 283 test files passed / 1 skipped, 1,650 tests passed / 3 skipped, typecheck. Commit `43f000a8` deployed in OCI workflow `45827914492`; verify, packaging, upload, activation all succeeded. Post-deploy health HTTP200; 3 full downloads per market passed gzip/JSON/schema/returnedCount/max20 checks. KR 22.36/12.51/8.10s (median12.51s), US62.37/44.54/75.82s (median62.37s), no failed attempts. Compared with baseline medians KR14.187s/US60.649s, KR is 11.8% faster and US 2.8% slower; this noisy small sample is inconclusive for speed, so report no established performance gain. Candidate retained for smaller serialized gzip output while continuing operating measurements. Detailed results in `docs/operations/public-daily-export-performance-report.md`.
### 2026-11-26 — gzip streaming overlaps completed DB batches
- Purpose/scope: Improve public gzip daily-export response speed by starting serialization/transmission of completed database batches without waiting for every query in the concurrency wave. Query concurrency, batch size, SQL, output order/schema, gzip format, and max20 candles remain unchanged.
- Root cause: wave-level `await Promise.all(...)` held every result until its slowest query finished, even though results are already split into sequential ticker-code batches and the response stream can consume earlier batches while later DB queries run.
- Implementation/regression gate: retain all concurrent promises, await/yield them in batch order to preserve `(market, code)` order, and collect DB wave wall time from the aggregate query promise so streaming duration does not inflate it. Added a delayed second-batch test: first batch reaches gzip output before the later batch resolves; parsed result stays sorted, 501 rows. Target route suite: 13/13 pass; `git diff --check` pass.
- Local measurements: six sequential API calls/market, exclude first cold/compile. KR warmed before `[0.45,0.37,0.33,0.42,0.35]s` median0.37; candidate `[0.36,0.34,0.31,0.34,0.30]s` median0.34 (-8.1%). US before `[0.76,0.77,0.83,0.73,0.71]s` median0.76; candidate `[0.79,0.67,0.71,0.68,0.84]s` median0.71 (-6.6%). Server stream medians KR290→266ms (-8.3%), US577→528ms (-8.5%). gzip size unchanged (KR1,506,865B/US3,491,027B), JSON/decompression contract valid with 2,352/5,012 tickers, max20, and XFL0.
- Risk/deployment result: full `npm run deploy:verify` passed before commit/push (build, standalone/runtime/Chrome smoke, docs/API/security/cron audits, typecheck, 283 test files passed/1 skipped, 1,651 tests passed/3 skipped). Commit `51ba4782` deployed via OCI workflow `45832024763`, all steps succeeded. Post-deploy five valid full downloads per market passed HTTP/gzip/JSON/schema/returnedCount/max20 checks: KR 40.88/14.75/9.73/4.68/8.21s median9.73s vs prior 3-call median12.51s (-22.2%); US 41.38/44.16/55.09/54.83/43.41s median44.16s vs prior 3-call median62.37s (-29.2%). One US request terminated after60.31s and a retry succeeded; failed attempt excluded. Gzip sizes unchanged in practical terms; raw bytes KR8,907,188/US18,964,448; tickers2,337/5,011; max20. Keep candidate deployed: operating results align with local 6.6–8.1% warmed gain and server stream timing improvement, though low baseline sample, uncontrolled load, and failure mean causal benefit is not proven. Continue same-client measurements and track termination separately. Full measurements in `docs/operations/public-daily-export-performance-report.md`.
### 2026-11-26 — sliding daily-export DB batch scheduler rejected
- Purpose/scope: Test whether launching the final US DB batch immediately when any of the 10 query slots freed would overlap its latency with the other batch queries. Candidate used bounded workers and promise slots to preserve output ordering; it did not change concurrency, 500 ticker batch size, SQL, gzip, or response schema.
- Root-cause hypothesis and regression signal: the fixed wave scheduler started the 11th US batch only after all first 10 queries completed. A temporary deterministic test delayed batch 0 by40ms, batches1–9 by250ms, and asserted batch10 started before 180ms; it passed and output order stayed correct (route suite14/14).
- Comparative measurement: same local dev API/DB, sequential full-response requests, six calls per market per block, cold request excluded. Block A baseline→candidate median KR0.37→0.40s, US0.71→0.73s; block B repeated KR0.37→0.41s, US0.71→0.73s. gzip sizes unchanged KR1,506,865B/US3,491,027B. Thus the intended queueing effect occurred but total completion time did not improve in either market.
- Decision/impact: candidate rejected and implementation restored to committed fixed-wave scheduler before deployment. Temporary scheduling test removed; final targeted API suite passed13/13; `git diff --check` clean. No build/full verification, commit, push, or deployment was needed because only the experiment was rolled back and no code change is retained. Previously deployed batch-streaming improvement stays active.
- Remaining risk/next: local timings do not establish OCI behavior, but no deployment evidence justified this extra scheduling complexity. Detailed measures and method in `docs/operations/public-daily-export-performance-report.md`. Continue with candidates that improve full-response time in both repeated local comparison and post-deploy API measurements; keep failed network calls separate.

### 2026-11-26 — daily export covering-index split candidate rejected
- Purpose/scope: Test whether splitting valid candles into `volume > 0` and `volume = 0` top-20 branches allows the positive branch to use existing partial covering indexes without dropping zero-volume rows.
- Evidence: read-only PostgreSQL plans showed the baseline US query used the general lookup index; positive-only used the covering index, while zero-volume fell back to the general index and scanned 1,228 AAPL candle rows in a one-symbol sample. Same local warmed full-API baseline (7 calls/market after initial cold call): KR median0.34s (0.30–0.44), US0.70s (0.68–0.72), gzip1,506,865B/3,491,027B. Initial candidate SQL syntax error caused actual HTTP500; route suite did not detect it because DB is mocked. After SQL syntax fix, missing US `trading_value` source column caused HTTP500; after fixing that, warmed US candidate median was1.26s (1.15–1.48), ~80% slower. Candidate KR warmed times were0.11–0.45s (no reliable decision because US regressed). Gzip bytes unchanged.
- Root cause and regression detection: Full batch workload's per-ticker union and merge ordering outweighed the positive partial-index benefit; single ticker EXPLAIN was not predictive. Require real local/operating PostgreSQL route execution and repeated full-response medians in both markets; mock-only route tests are insufficient for dynamic SQL correctness.
- Decision/impact: rejected and reverted `lib/public-daily-export.ts` before deployment. No build/push/commit/deployment. Existing deployed API code and contract unchanged. Restored dev-generated `next-env.d.ts` and `tsconfig.json` changes.
- Remaining risk/next: local measurements are not OCI production performance. Continue seeking full-endpoint improvements with exact response decompression/schema validation and deploy only if overall speed gain is repeated without a material regression in either market. Detailed evidence: `docs/operations/public-daily-export-performance-report.md`.

### 2026-11-26 — initial gzip flush removal candidate rejected
- Purpose/scope: Measure whether omitting the initial zlib `Z_SYNC_FLUSH` after `[` reduces gzip stream overhead while retaining one gzip stream, current market levels, JSON schema, and data contract.
- Comparison: Same local dev API/DB, six sequential calls per market per version; excluded first cold/compile call. KR warmed median0.33s baseline→0.30s candidate; US0.69s→0.69s. Gzip bytes changed only by -7B each (KR1,506,865→1,506,858; US3,491,027→3,491,020). Internal warmed stream median KR about289→261ms, US546→562ms. Candidate US included 1.10s outlier; no stable both-market improvement.
- Contract/regression evidence: Gunzipped and parsed full candidate files: KR2,352 and US5,012 records; ticker/marketCap/daily fields present; candle arrays <=20; daily.metadata.returnedCount matched candle count. First-byte timing remained about6–7ms KR and96–116ms US on candidate versus7–8ms KR and92–119ms US baseline.
- Decision/impact: Candidate rejected due noise-level KR gain, unchanged US client median and slight US internal stream regression. Restored initial flush; no source change retained, no full deploy verification, commit, push or deployment. Generated dev config changes were restored.
- Root cause/regression signal/risk: A single tiny flush is not a meaningful full-response bottleneck in local warmed API. Timings are local and cannot establish production network effects. Track full response, server stream timing, gzip size and decompressed schema together; initial-prefix streaming behavior is not currently a direct assertion in mocked route tests. Details: `docs/operations/public-daily-export-performance-report.md`.

### 2026-11-26 — refreshed public daily-export operating baseline
- Purpose/scope: Re-measure current production KR/US public gzip GETs and validate full bodies; no application code changed.
- Results: Three full body downloads per market, sequential. KR 11.01/10.43/14.24s median11.01s, gzip1,524,948/1,524,954/1,524,637B. US55.73/48.49/52.94s median52.94s, gzip3,542,658/3,542,680/3,542,756B. All bodies gunzipped and parsed: KR2,337/US5,011 tickers, raw8,907,188/18,964,448B, required ticker/marketCap/daily, returnedCount matched candle count, max20. One explicit `-PassThru` confirmation per market returned HTTP200/application/gzip, no Content-Encoding and no-store cache policy.
- Measurement error/root cause: Initial PowerShell `Invoke-WebRequest -OutFile` calls fully downloaded the body but returned no response object; reading `$response.Headers` threw and the harness labeled these as failed. Independent files and a `-PassThru` repeat proved successful. Reuse `-PassThru` when extracting response metadata from `-OutFile` calls; validate saved file and body separately.
- Comparison/risk: Relative to prior deployed five-call medians KR9.73s/US44.16s, the new medians are +13.2%/+19.9%. Small uncontrolled sample cannot attribute a regression to code, OCI load, or network. No change deployed. OCI config and SSH private keys were absent, so server logs/phase metrics could not be read; local DB timings cannot explain the operating transfer gap.
- Next: Obtain production-side stage timing or repeat under controlled client/network conditions, then optimize only a demonstrated dominant phase. Full details: `docs/operations/public-daily-export-performance-report.md`.

### 2026-11-26 — removed redundant daily candle sort key
- Purpose/scope: Remove `fetched_at DESC` from the per-ticker latest-20 daily candle query. Both tables have `UNIQUE (market, code, timeframe, candle_date)` from V67, so dates cannot tie within a ticker/timeframe; response aggregation already sorts only by candle_date.
- Cause/opportunity: PostgreSQL chose `Incremental Sort` for `(candle_date DESC, fetched_at DESC)` despite a matching descending date lookup index. Actual read-only plan now uses the index without Incremental Sort for date-only ordering; one AAPL plan showed 0.515ms vs0.146ms but cache differed and that single comparison is not causal.
- Validation/evidence: Two local same-DB full API blocks, six sequential calls/market/version, first cold/post-edit response excluded. Block A medians KR0.32→0.34s, US0.74→0.71s; block B KR0.33→0.31s, US0.72→0.69s. Combined warmed medians KR0.325→0.315 (-3.1%), US0.73→0.69 (-5.5%). gzip bytes unchanged KR1,506,865B/US3,491,027B. Gunzip/schema verification passed; candidate raw JSON byte-for-byte matched baseline for KR2,352 and US5,012 tickers, max20 and returnedCount valid. Live unique constraints confirmed. Added route assertion for date-only SQL order; targeted route suite13/13 passed.
- Change/regression detection: Only SQL ordering changed in `lib/public-daily-export.ts`; updated `app/api/public/daily-export/kr/route.test.ts`; full response bytes/JSON remain identical. If production full-response timings regress materially, restore the tie-breaker. Local KR block A was slower but B faster, so local effect is small/noisy; operating check remains required.
- Deployment/operating result: `npm run deploy:verify` passed (build, standalone/runtime, Chrome desktop/mobile smoke, 283 test files passed/1 skipped, 1,651 tests passed/3 skipped, typecheck and documentation/API/security/cron audits). Commit `13ed6f97` pushed to `oci`; OCI workflow `45844724755` completed Verify deployment, standalone packaging, upload and activation successfully. Three full operating downloads/market all returned HTTP200/application-gzip/no-store, no Content-Encoding, and passed gunzip/JSON/returnedCount/max20 validation. KR9.97/7.69/3.20s median7.69, gzip1,524,637B/raw8,907,188B, 2,337 tickers; US41.86/59.97/43.70s median43.70, gzip3,542,614–3,543,019B/raw18,964,448B, 5,011 tickers. Compared with immediately preceding 3-call medians KR11.01/US52.94, observed medians were30.2%/17.4% lower; small uncontrolled samples mean this is a positive signal, not a causal estimate. Detailed evidence: `docs/operations/public-daily-export-performance-report.md`.

### 공개 일봉 numeric 필터 배포 및 운영 확인

커밋 `ccce3836`의 OCI `Deploy OCI` 실행 `45851910904`는 GitHub run 화면에서 `completed successfully`로 확인했다. 로컬 `npm run deploy:verify`는 283개 테스트 파일 통과/1개 skip, 1,651 passed/3 skipped, typecheck, 문서/API/security/cron 감사, production build, standalone HTTP 및 Chrome desktop/mobile smoke를 통과했다. 운영 health GET은 HTTP200이다.

배포 후 동일 공개 host에서 KR 전체 gzip 다운로드를 3회, US를 2회 성공적으로 완료했다. 모두 HTTP200, `application/gzip`, `Content-Encoding` 없음, `no-store`, gunzip/JSON 파싱, ticker/marketCap/daily, `returnedCount` 일치와 최대20봉을 확인했다. KR은 2,337 ticker, raw 8,907,188B, gzip 1,524,873/1,524,637/1,524,956B, 시간 21.57/22.79/6.15초(median21.57초). US는 5,011 ticker, raw 18,964,448B, gzip 3,542,699/3,542,606B, 시간 57.51/59.99초(median58.75초). 연속 US 추가 요청 중 세 건은 HTTP502로 완료되지 않았고, 20초 간격 후 재시도는 성공했다. 오류 호출은 성능 표본에 넣지 않았다.

운영 표본은 작고 API/네트워크 부하가 통제되지 않아 numeric 문자열 변환 제거의 운영 속도 효과는 입증되지 않았다. 502는 성공 측정과 별도 가용성 신호로 남긴다. SQL은 NUMERIC 상한 비교로 유지하고, 후속 운영 반복에서는 간격을 둬 502 발생률과 완료시간을 함께 본다. 테스트는 다섯 숫자 열 각각의 Infinity 상한을 검사하도록 보강했다. 보고서 변경 커밋 전 전체 `deploy:verify`를 다시 수행한다.
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
### 2026-11-27 — 공개 일봉 batch SQL prepared statement 재사용
- 목적/범위: 반복 공개 gzip export의 batch 쿼리에 이름 있는 `node-postgres` query config를 지정해 연결별 prepared statement를 재사용한다. 공식 근거는 https://node-postgres.com/features/queries. 응답 schema, gzip 및 일봉 상한은 변경하지 않는다.
- 측정/검증: 같은 로컬 DB 기준/후보 각 8회 순차 호출에서 첫 cold 제외 median은 KR 331→326ms(-1.5%), US 740→662ms(-10.5%)였다. 후보 gzip 해제 JSON 8회/시장 모두 기준선과 바이트 단위 동일; gzip KR1,506,865B/US3,491,027B, ticker 2,352/5,012, daily 최대20. 관련 테스트 15개 통과.
- 근본 원인/판정/위험: 매 요청의 동일 복합 SQL이 pool 연결에서 반복 parse/plan되는 비용을 줄이는 후보를 채택했다. 연결별 문장 캐시는 서버 프로세스 재시작 후 다시 준비된다. `npm run deploy:verify` 성공(283개 테스트 파일 통과/1 skip, 1,651 passed/3 skipped, typecheck, build, runtime/browser smoke 및 감사); commit `d51023e8`, OCI run `45864690217` 성공.
- 운영 검증: 운영 health HTTP200. 공개 API를 시장별 3회 순차 호출해 모두 HTTP200, `application/gzip`, Content-Encoding 없음, no-store를 확인했다. KR 21.653/11.657/3.154초(median11.657초), 2,337 ticker, raw8,907,188B, gzip1,524,637–1,525,028B. US 40.101/45.557/40.711초(median40.711초), 5,011 ticker, raw18,964,448B, gzip3,542,337–3,542,761B. 전부 gunzip/JSON, ticker/marketCap/daily, returnedCount, 최대20봉과 XFL0 검증 통과. 직전 운영 표본 대비 완료시간이 줄었지만 시간대/부하 통제 및 표본이 부족해 코드 변경의 인과효과로 해석하지 않는다.
- 변경 파일: `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 성능 보고서, 본 로그. 코드 및 보고서 모두 커밋/푸시됨; 운영 배포 run 성공.

### 2026-11-27 — gzip API stream write batch를 DB batch 크기에 맞춤
- 목적/범위: 매 50 ticker마다 기다리던 gzip `write()` callback 수를 줄이기 위해 stream write 묶음을 DB batch 500 ticker와 동일하게 맞췄다. stream backpressure 동작은 Node 공식 문서(https://nodejs.org/api/stream.html#writablewritechunk-encoding-callback)를 참조했다. 티커 순서/JSON/gzip level/DB 동시성과 response headers는 변경하지 않았다.
- 실측: 같은 로컬 DB/API에서 기준50 및 후보500을 교차 반복했다. warmed HTTP median 한 블록 KR343→300ms(-12.5%), US730→719ms(-1.5%); 다른 블록 US696→698ms(동률), KR317→291ms(-8.2%). server stream duration median KR297.5→251.5ms(-15.5%), US545→518.5ms(-4.9%). 별도 블록 US 791→679ms는 재현 반복 편차가 있어 개선률로 일반화하지 않았다. gzip bytes 불변(KR1,506,865/US3,491,027); 각 시장 기준·후보 6개씩 gunzip 원문 동일, KR2352/US5012 ticker 및 max20 계약을 통과했다.
- 대안/위험: gzip level1은 US 688→715ms 및 +90,965B라 기각. write 묶음 1,000은 US median745ms로 500 후보보다 느림. concurrency11, batch SQL `string_agg`, write 묶음200도 500 대비 유의한 이득을 재현하지 못해 채택하지 않았다. 500 write 묶음의 임시 joined string 최대치는 대표 payload 기준 KR1,656,605B, US1,711,333B(요청당 약1.7MB 추가 peak 메모리 추정); 운영 memory/OOM 및 앞선 500 ticker batch stream 시점 점검이 남은 위험이다. 기존 route test의 `streams an earlier completed batch while a later concurrent batch is still pending`가 완료된 batch를 후속 query 대기와 겹쳐 보내는 조건을 자동 검사한다.
- 배포/운영: `npm run deploy:verify` 전체 통과(283 test files pass/1 skip, 1,651 passed/3 skipped, typecheck, build, runtime/browser smoke, 문서/API/security/cron 감사). commit `17f63513`, OCI run `45870683076` 전체 성공. 운영 health HTTP200; KR/US 각 3회 공개 GET 모두 HTTP200, `application/gzip`, Content-Encoding 없음, no-store. KR13.466/16.289/5.487초(median13.466초), ticker2,337/raw8,907,188B/gzip1,524,637–1,524,957B. US52.013/40.076/38.445초(median40.076초), ticker5,011/raw18,964,448B/gzip3,542,655–3,543,009B. 각 응답 XFL0, gunzip/JSON, ticker/marketCap/daily, returnedCount, max20 검증 통과; 502 없음. 직전 코드 배포의 KR median11.657초 및 US40.711초보다 KR은 느리고 US는 약간 짧아졌으나 표본/부하 통제가 없어 운영 속도 개선을 입증하지 않는다.
- 변경 파일: `lib/public-daily-export.ts`, 해당 route tests(기존 streaming 회귀 게이트 재사용), 운영 성능 보고서, 본 로그. 코드 배포·운영 계약 점검 완료.

### 2026-11-27 — gzip 일봉 API compact tuple 후보 및 US batch 가설 실측
- 목적/범위: 운영 US body reader에서 약39초의 chunk 공백을 관측해 DB query batch size/concurrency 가설을 실제 local DB/API로 비교하고, gzip만으로 줄이기 어려운 반복 candle JSON key를 compact tuple-v1로 줄일 수 있는지 확인했다. 기존 GET은 무인증, no-store, gzip level9/windowBits14/Z_FILTERED/chunk64KB, ticker/marketCap/daily 및 max20를 유지한다. 선택 `format=compact`는 `daily.candles` tuple 필드 순서를 자기 설명 metadata로 반환한다. 기본 `full`은 기존 object 계약을 보존한다.
- 운영 관측: Node fetch US GET 1회는 HTTP200, 2,816,058 gzip bytes, first body byte7.319초, total48.912초였다. 730 reader chunks 중 첫4090 bytes와 후속 응답 사이 38.984초 gap이 있었다. 단일 네트워크/서버 표본이라 DB 지연으로 원인을 단정하지 않으며 OCI 로그 권한/연결 부재로 request server metrics와 교차 확인하지 못했다.
- 후보 측정/판정: 5,012개 US universe를 batch1,000 대신 단일6,000 query로 실행한 8회 client median은 0.956→1.406초(+47.1%); warmed batch query wall median은 0.316→0.768초로 늘어 기각. concurrency 10→3 median0.956→1.003초(+5.0%), batch1,000→2,500 median0.956→1.064초(+11.3%)도 기각했다. 코드/테스트를 배포 HEAD의 batch1,000·concurrency10으로 복원했다. gzip bytes 변경은 없었다.
- Compact 실측: 기존 full과 compact를 시장별8회 교차 호출했다. KR 2,352 ticker의 full→compact 완료 median0.450→0.340초(-24.4%), raw JSON8,966,992→5,181,748B(-42.2%), gzip1,171,044→1,023,102B(-12.6%)였다. US 5,012 ticker는 0.831→0.659초(-20.7%), raw19,359,853→11,351,119B(-41.4%), gzip2,807,759→2,429,301B(-13.5%)였다. US gunzip/JSON parse median은133.1→59.9ms. 각 paired 응답의 ticker, marketCap, candle metadata 및 모든 candle tuple을 복원한 object는 깊은 동등성 검사에 통과했고, HTTP200, gzip, max20, returnedCount도 확인했다.
- 오류 및 회귀 감지: 이 프로젝트의 mock DB query는 SQL 결과 포맷을 합성하지 않으므로 compact unit test는 실제 tuple 결과를 mock으로 구성하고 SQL에 `json_build_array`가 있는지 검사한다. 별도 실제 DB API GET으로 SQL 파싱과 출력 데이터의 모든 봉을 full 대조했다. 기본 full prepared statement 이름을 실수로 format별 이름으로 변경하지 않고 기존 `public-daily-export-*-batch-v1`을 보존하며 compact 이름은 별도 사용한다. 초기 probe에서 종목 수를 과거5011로 고정해 현재5012 universe를 false failure로 분류한 harness 오류를 발견했고 실행별 baseline 대조/조건 검증으로 수정했다.
- 검증/배포: target route17/17 및 실제 local KR/US full/compact API 교차8쌍 통과. 전체 `npm run deploy:verify` 통과(283 test files pass/1 skipped, 1,655 tests pass/3 skipped, build/typecheck/docs/API/security/cron/runtime/Chrome smoke). commit `993b96e2`의 OCI run `45911987498`에서 remote verify, standalone packaging, upload 및 activation 전부 성공.
- 운영 검증: 배포 후 각 시장 full/compact 5쌍을 순차 호출, 전체20회 성공. HTTP200/application-gzip/no Content-Encoding/no-store/XFL2, gzip 해제/JSON/schema/returnedCount/max20 및 10쌍의 모든 ticker·marketCap·daily metadata·봉 exact reconstruction 통과. KR download median5.479→4.796초(-12.5%), first byte0.202→0.194초, gzip1,212,533→1,060,716B(-12.5%), raw8,907,188→5,142,281B(-42.3%); US median47.451→47.652초(+0.4%), first byte0.634→0.377초, gzip2,816,112→2,450,128B(-13.0%), raw18,964,448→11,041,367B(-41.8%). US parse median149.4→106.3ms(-28.9%). 따라서 compact는 크기·first byte·parse 이득이 있으나 US full download 개선은 입증되지 않았다. 표본5, 운영 부하/회선 비통제이며 full US 표본에108.9초 outlier가 있다.
- 잔여 위험/다음 개선: 기존 client 호환을 위해 full default 유지, compact는 `?format=compact` opt-in. OCI server timing 로그에는 접근 권한이 없어 US chunk gap과 server DB batch timing 교차 분석은 미해결이다. 운영 성능 보고서 및 본 log의 수치/판정을 업데이트했고, 문서-only 변경의 전체 verify와 후속 OCI 배포를 수행한다.

### 2026-11-27 — US 일봉 export 첫 payload 대기 완화 후보
- 목적/가설: 운영 US API를 반복 호출했을 때 첫 body가 0.3–0.4초 내 도착한 뒤 27.579–43.984초 chunk 공백이 있었고, 상세 측정에서 공백 직전 전송량은 17B뿐이었다. generator는 six concurrent query promises를 입력 순서로 내보내므로 첫 ordered 1,000 ticker query가 유효 payload 대기의 후보라고 판단했다. OCI journald/SSH access가 없어 DB query 원인 확정은 불가능하다.
- 변경/범위: isolated `origin/oci` worktree에서 US 첫 query batch만 500, 이후 US query는 1,000, KR은 기존500으로 설정했다. 응답 스키마, gzip 설정/bytes, 정렬, max20, 인증 없는 GET은 바꾸지 않았다. 실제 5,012 ticker US universe는 query 개수가 6으로 유지되고 테스트 5,501 ticker에서도 최대 동시 query 7개로 제한10 이하임을 확인한다.
- 검증: `app/api/public/daily-export/kr/route.test.ts` 17/17 통과. baseline→candidate→baseline local API/DB를 시장별 6회씩 실행하고 첫 compile/warm 요청을 제외했다. 모든 요청 HTTP200, gunzip/JSON/schema/tuple8/max20 valid. US first-payload medians baseline416/439ms, candidate340ms로 두 구간 개선; total medians baseline718/796ms, candidate722/689ms로 방향 혼재. KR은 변경하지 않았는데도 첫 payload/total 변동이 있어 로컬 DB/cache noise가 확인된다. 압축 bytes는 KR1,023,102B/US2,429,301B로 변화 없다. 이는 배포 전 후보이며 production improvement로 인정하지 않는다.
- 운영 배포/판정: full `npm run deploy:verify` 2회 통과 후 commit `fff8072f`를 `oci`에 push했고 [OCI run 45923977190](https://github.com/pjtss/StockMan/actions/runs/45923977190)에서 Verify, 패키징, 업로드, Activate까지 성공했다. Post-deploy 3회씩 KR/US 전체 gzip 응답을 gunzip·JSON/schema/tuple8/returnedCount/max20으로 검증했다. KR 첫 gzip byte 1.002/0.103/0.422초, 첫 item 14.148/4.924/8.932초, full 18.877/6.665/10.965초. US 후보 첫 gzip byte0.714/0.262/0.271초, 첫 item36.082/18.951/17.949초, full63.953/54.741/41.061초. Baseline 이전 5회 US full 중앙값31.944초 대비 후보 중앙값54.741초(+71.4%)로 전체 완료가 유의하게 느려졌다. 첫 item 개선도 baseline에서 세 표본 반복 비교가 없어 확정하지 않는다.
- 롤백/검증: 속도 우선은 전체 gzip 다운로드 완료시간으로 판정하여 US `firstBatchSize=500` 후보를 기각했다. 격리 worktree의 source/test는 배포 baseline commit `595e8e1c`의 US batch1,000·KR500으로 복구했다. 복구 트리에서 `npm run deploy:verify` 통과(283 test files pass/1 skipped, 1,655 tests pass/3 skipped, typecheck, docs/API/security/cron audits, production build, standalone runtime/Chrome smoke, OCI activation recovery smoke). 자동 변경 `next-env.d.ts`/`tsconfig.json`은 복구했다. rollback commit `28add0cb`를 push하고 OCI run `45925679280`에서 활성화 성공. post-rollback production KR/US 각3회는 모두 HTTP200/gzip 및 gunzip/JSON/schema/tuple8/returnedCount/max20 통과. US full median50.501초, first-item median48.715초; candidate medians54.741/18.951초. 7.8% total 개선 방향이나 baseline-before candidate31.944초보다 58.1% 느려 production load/time variance가 커 인과 효과는 확정하지 않는다. Production DB load/timing 로그에 접근하지 못해 US 지연 원인은 미확정이다.
- 1차 전체 검증 이력: `npm run deploy:verify` 2회 통과 — 각 283 test files passed/1 skipped, 1,655 tests passed/3 skipped, typecheck, docs/API/security/cron audits, production build, standalone runtime/Chrome smoke 및 OCI activation recovery smoke 성공. 자동 변경 `next-env.d.ts`/`tsconfig.json`은 복구했다.
- 1차 전체 검증 결과: `npm run deploy:verify` 통과 — 283 test files passed/1 skipped, 1,655 tests passed/3 skipped, typecheck, docs/API/security/cron audits, production build, standalone runtime/Chrome smoke 및 OCI activation recovery smoke 성공. 자동 변경 `next-env.d.ts`/`tsconfig.json`은 복구했다. remote `oci`는 fetch 시점 기준 `595e8e1c`로 작업 base와 동일. 최종 commit/push/production A/B는 아직 진행 전이다.

### 2026-11-27 — 공개 일봉 API 운영 재측정 및 gzip flush 후보 기각
- 목적/범위: 속도 우선 요청에 따라 rollback 후 운영 KR/US GET을 각5회 반복해 현재 완료시간과 청크 공백을 갱신하고, gzip heartbeat 5초→500ms 조정이 전체 gzip 응답을 개선하는지 실제 local API/DB에서 검사했다. 공개 응답은 gzip 단일 파일, ticker/marketCap/daily, 최대20봉을 유지한다.
- 운영 관측: 모든 10개 GET은 HTTP200/application-gzip/no Content-Encoding/no-store였다. KR 5회 전체완료 중앙값 5.311초(2.092–19.073), first byte 중앙값0.173초, 최대 chunk gap 중앙값4.386초, gzip1,060,716–1,061,170B. US 전체완료 중앙값39.935초(30.993–47.490), first byte 중앙값0.381초, 최대 gap 중앙값37.691초(개별28.774–45.498), gzip2,449,623–2,450,128B. rollback 직전 US 3회 median50.501초보다 짧으나 server/DB/network 조건을 통제하지 않아 원인 귀속 불가. 최신 측정은 body timing만 기록했으며 이 회차에서 decompress/schema 검증을 새로 수행하지 않았다.
- 후보 및 결과: 격리 branch에서 heartbeat만 5,000→500ms로 변경해 localhost PostgreSQL을 사용하는 standard dev server에서 시장별5회 full gzip 응답을 교차에 준하는 순차 block으로 측정했다. 첫 compile/cold 요청 제외. warmed server `totalElapsedMs` median KR301.5→288.5ms(-4.3%), US633.5→621ms(-2.0%); stream median KR295.5→283ms(-4.2%), US512→520ms(+1.6%). gzip 크기 KR1,023,102B 동일, US2,429,301→2,429,814–2,429,842B(+0.02%). client total median KR361→356ms, US739→751ms. HTTP200, gunzip/JSON, ticker/marketCap/daily, KR2,352/US5,012 ticker와 max20 계약 검증은 통과했다. 시장 간 종단간 이득 방향이 일치하지 않고 효과가 노이즈 범위이므로 후보 기각.
- 근본원인/수정 위치: heartbeat flush는 generator가 아직 yield하지 않은 DB row를 만들 수 없다. 따라서 유력한 지연 위치는 ordered first batch 준비 전이나 외부 운영 load/network이며 이 증거만으로 DB 문제로 단정할 수 없다. `lib/public-daily-export.ts` 임시 수정은 5초 원래 값으로 복구해 최종 코드 diff가 없다. 기존 운영 server timing 로그를 요청과 상관시킬 수 있는 SSH 접근이 현재 환경에 없어 긴 공백의 server-side phase 원인은 여전히 미확정이다.
- 검증/문서/반영: local 응답 전부 gzip 해제, JSON parse, ticker/marketCap/daily/max20 통과. 임시 개발 서버 종료, worktree에 임시 복사했던 `.env.local` 삭제, Next가 자동 변경한 `next-env.d.ts`/`tsconfig.json` 복구. 운영 API는 read-only GET만 수행했고 코드 후보는 배포하지 않았다. 결과와 재발 감지 항목을 `docs/operations/public-daily-export-performance-report.md`에 추가했다. `git diff --check`와 `npm run docs:check` 통과. 기능/성능 코드 변경이 없어 새 배포는 하지 않았다.
- 재발 감지/다음 단계: 운영 측정은 first byte와 total만 아니라 max chunk gap 및 압축 bytes를 함께 기록한다. 같은 요청의 server batchQueryWall/max와 stream duration을 확인할 수 있을 때 ordered query 병목 가설을 좁힌다. 작은 첫 batch는 이전 운영 시도에서 전체완료시간을 악화해 롤백됐으므로 같은 변경을 반복 배포하지 않는다. 다음 코드는 local 전체시간 양 시장 개선과 payload 계약을 입증한 후보만 운영 배포한다.
- 추가 후보(출력 JSON 묶음 500→50) 및 판정: local PostgreSQL API에서 기준500→후보50→기준500 교차 순서로 시장별5회씩 실행하고 첫 cold 요청을 제외했다. HTTP200, gunzip/JSON/schema/max20/ticker 수가 전부 통과했고 gzip bytes는 KR1,023,102B/US2,429,301B로 동일했다. 양쪽 기준 블록 warm 총8개 median과 후보 warm4개 median 비교에서 KR 전체370→384ms(+3.8%), 첫 item193→173ms(-10.4%); US 전체720→950ms(+31.9%), 첫 item404.5→473ms(+16.9%). US 첫 item 및 완료가 악화되고 KR 전체도 느려 후보를 기각했다. `lib/public-daily-export.ts`의 pending threshold는 `EXPORT_BATCH_SIZE`(500)로 복구했고 코드 diff 없음. 임시 dev server 종료, `.env.local` 복사본 제거, Next 자동 생성 변경 복구. 코드/배포 변경이 없어 OCI 배포하지 않았다. 성능 보고서에 측정/판정을 추가하고 docs gate를 재실행한다.
- 추가 후보(memLevel8→9, US 전용 검증 준비): Node v22.4 공식 zlib 문서의 메모리 공식/속도 trade-off를 적용해 실측했다(보고서 인용). localhost actual API의 기준8→후보9→기준8, 시장별5회에서 첫 compile 요청 제외. 기준 두 블록 평균 server total median 대비 candidate KR313.5→288.5ms(-8.0%), US682.25→648ms(-5.0%); stream KR304.5→282ms(-7.4%), US575.5→530.5ms(-7.8%). Client total 비교 KR373.25→335ms(-10.2%), US759.5→734.5ms(-3.3%). Gzip bytes KR1,023,102→1,020,880(-0.22%), US2,429,301→2,423,328(-0.25%); raw payload/response 계약 동일.
- 동시성/운영 검증: 시장별 동시 GET 5개에서 mem8 KR wall2.126/2.084초, mem9 2.485초로 KR 회귀; US mem8 4.646/4.998초, mem9 4.308초로 개선. 그래서 US만 memLevel9, KR은8로 설정했다. full `npm run deploy:verify` 통과(285 test files passed/1 skipped, 1,667 tests passed/3 skipped, typecheck/build/runtime Chrome smoke 및 문서/API/security/cron 감사 통과). 후보 commit `d1eebb64`를 OCI에 푸시했고 deploy run `45931578641` 성공.
- 운영 실측/판정: 2026-11-27 운영 gzip API GET 각3회. KR total45.861/5.957/6.790초, gzip1,060,716/1,061,160/1,061,170B, raw5,142,281B, 2,337 tickers 전부20 candles. US total51.692/44.866/55.472초, gzip2,443,448/2,443,448/2,444,040B, raw11,041,367B, 5,011 tickers candles 0–20. 모든 응답 HTTP200 gzip JSON, schema/ticker/marketCap/daily 검사 통과. baseline rollback median 대비 KR 개선/US 소폭 악화로 결과 혼재하며 분산이 큼; memLevel9의 운영 성능 향상은 입증되지 않아 trial 상태로 유지하고 후속 표본을 추가한다.
- 원인/재발 감지/다음 단계: 인증된 read-only diagnostics API의 stockman.service 최근30분 journal 20줄 조회는 HTTP200, redaction true였으나 `JOURNAL_READ_TIMEOUT`(7초)라 내부 batch/stream timing 확보에 실패했다. 무인증 공개 API나 응답 계약은 바뀌지 않았다. 운영 측정은 전체시간 외 first-byte, longest chunk gap, gzip bytes를 계속 기록한다. timeout을 반복 유발하지 않도록 journal 조회를 확대하지 않고, 다음에는 bounded server timing 수집 또는 시간대 일치 운영 baseline 확보 후 양 시장에 개선이 재현되는 후보만 반영한다. memLevel9 운영 후 US 회귀가 지속되거나 메모리 압박 발견 시8로 rollback하고 full verification 후 redeploy한다. 세 파일(`lib/public-daily-export.ts`, report, log)만 변경했으며 commit/push 이후 작업 문서에 운영 결과를 반영했다.
- 진단 가시성 후속: 후속 배포의 journal 조회에서 stockman.service는 최근10분·3줄, timeout10초에도 `JOURNAL_READ_TIMEOUT`; nginx-access는 최근10분·3줄과 최근60분·5줄 모두 available이지만 항목0이었다. `deploy/oci/nginx-stockman.conf`의 syslog tag는 `stockman_nginx_access`인데 `lib/server-journal.ts`가 `stockman-nginx-access` identifier를 사용한 불일치를 근본 원인으로 확인했다. server-journal identifier와 unit test expectation을 underscore로 맞췄다. 공개 gzip API/응답 데이터는 변경하지 않는다. docs/report와 본 log를 갱신하고 단위 테스트 및 전체 `npm run deploy:verify` 후 OCI 배포, 저량 인증 로그 재조회로 검증한다. 재발 자동 감지는 server-journal unit test가 설정 syslog identifier와 동일한 문자열을 요구하게 유지한다.
- 진단 수정 배포 후 결과: commit `26d20ed0` / OCI run `45935527109` 성공. 인증 `nginx-access` 최근60분·5줄 조회는 available이지만0건으로 남았다. upstream `logsOnly=true` 분리 진단 commit `f9964a54` / OCI run `45936209405`도 성공; 해당 경로에서도 nginx-access 60분·5줄은0건, stockman.service 60분·3줄은 `JOURNAL_READ_TIMEOUT`(10초)였다. 따라서 identifier test는 코드 경계를 검증하지만 실제 host가 access syslog를 기록하는지까지 보장하지 못한다. 인증 DB diagnostic 쿼리 간섭은 제거됐어도 server timing 자료는 여전히 unavailable하며, nginx/syslog host delivery와 journald 수집 경로가 잔여 원인이다.
- 성능 후속 실측: US gzip GET 재시도 1회 HTTP200, 39.442초, gzip2,443,448B. 직전 3회는44.866/51.692/55.472초. 앞선 detailed streaming probe는 socket reset으로 끝났고 단순 재시도는 성공했다. 표본 한 건으로 gzip tuning의 운영 효과를 주장하지 않으며 기존 full response/schema/max20 검증 결과를 유지한다. 보고서에 추가 결과/한계/다음 개선 항목을 기록하고 docs-only 변경은 full deployment verify를 거쳐 저장한다.
- 최신 journal reader 결과: upstream `ff44f08f` reverse journal reader의 OCI run `45937811392` 성공 후 logsOnly read-only query를 한 번 실행했다. 최근60분/최대5줄에서 nginx-access available=true/count0, stockman.service `JOURNAL_READ_TIMEOUT`, 전체 진단 요청34.0초, redaction=true. `--reverse`는 호스트 service journal timeout을 해결하지 못했고 access logs도 0건이라 server query/stream latency를 측정할 수 없다. 이후 같은 범위 반복 조회는 하지 않는다. 보고서와 본 로그에 추가한다.
- 후속 timeout 운영 확인: upstream `1067c435`(10초→25초 journal timeout) OCI run `45939504456` 성공 후 nginx-access 단일 logsOnly 조회(60분/5줄)는 HTTP200 JSON으로 끝나는 데43.876초, available=true/count0/redaction=true였다. nginx-access와 stockman.service 동시 query는 HTML 반환으로 JSON parsing 실패해 entries/errorCode를 확보하지 못했다. 이 timeout 증가는 진단 API를 매우 느리게 만들었지만 로그 가시성은 개선되지 않았다. 더 이상의 운영 journal 조회를 중단하고 잔여 원인은 접근 가능한 서버에서 수동 운영 조사 필요로 기록한다.
- US 표본 중앙값 갱신: memLevel9 운영 전체시간 추가 GET39.442초를 포함하면 네 표본 39.442/44.866/51.692/55.472초, median48.279초다. 보고된 memLevel8 rollback baseline median50.501초보다4.4% 낮지만 controlled A/B와 server log가 없어 인과적 개선 판정은 보류한다. 결과는 운영 성능 보고서에 반영한다.
- 문서 commit `4c6700bd93e53c1b38071f713709c33608ce8061` OCI run `45941603704` 성공 후 운영 gzip API를 재검증했다. KR HTTP200/9.411초, gzip1,060,716B, 해제5,142,281B, 2,337 tickers/max20; US HTTP200/60.114초, gzip2,443,942B, 해제11,041,367B, 5,011 tickers/max20. 두 응답 모두 gzip 해제·JSON 및 ticker/marketCap/daily 필드 검사 성공, invalid record0. US 느린 표본은 배포 후 회귀 원인을 단독 특정하지 못하므로 memLevel9 이득은 미확정이며, 다음 개선은 DB batch 대기 계측과 전체 API 응답 재검증에 둔다.
- 스트리밍 원인 축소 조사: 운영 US/KR 응답을 직접 chunk 계측했다. US first body byte1.053s, max chunk gap43.045s, total46.377s; KR0.532s/6.590s/8.527s. gzip/JSON/schema/max20 전부 통과했다. US 본문 공급 구간에 장시간 공백이 있다는 진단 신호이나 server-side query timing과 연결되지 않아 DB를 확정 원인으로 단정하지 않는다. 로컬 `.env.local` DATABASE_URL host는 localhost임을 비밀값 없이 확인하고, 현재 US eligible ticker 첫1000의 daily-candle lateral lookup을 read-only `BEGIN READ ONLY` + `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`로 확인: warm planning1.966ms/execution249.426ms/shared hit73,240/read10; 앞선 cold 유사 query execution1,366.559ms/read27,665. local candle table/index 크기는5,894/422MB이고 기존 screener covering index1,054MB여서 추가 index는 만들지 않았다. 운영 성능으로 일반화하지 않는다. 첫 `check-docs`에서 공개 manual stale가 확인되어 document catalog 155건을 재생성하고 catalog/docs 검증을 통과했다. 작업 범위는 report, DEVELOPMENT_LOG, 생성 catalog 확인이며 코드/schema 변경 없음; commit/push/deploy 없음(운영 측정 기록 보완).
- 후속 full batch 확인에서 현재 US exporter SQL 전체(시가총액 join, candle JSON aggregation/metadata, row JSON 직렬화)의 첫1,000 ticker를 같은 localhost DB read-only `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`로 실행했다. planning11.526ms/execution412.188ms, shared hit97,625/read940 blocks, 사용 index `instrument_fundamental_screener_latest_idx` 및 `us_instrument_universe_candles_lookup_idx`. 운영 chunk 공백 원인을 로컬 SQL 수치로 설명할 수 없어 SQL/index 변경은 적용하지 않았다. 이번 업데이트의 변경 파일은 성능 보고서와 DEVELOPMENT_LOG이며 코드/schema/deployment 변경은 없음; 운영 병목의 다음 기준은 운영 요청과 연결된 batch phase timing이다.
- 성능 진단 후속에서 `readJournalUnit`가 lookback `since` timestamp를 계산하고 반환 데이터만 필터하지만 `buildJournalArgs`가 journalctl에 `--since`를 넘기지 않아 boot 전체에서 최근 N줄을 읽을 수 있음을 확인했다. 시간 필터는 수집 제한으로 작동하지 않았다. systemd 공식 journalctl `--since` 옵션을 명령 인자에 전달하고 unit/access 식별자 regression assertion을 추가했다. focused `lib/server-journal.test.ts`: 1 file/7 tests 통과. 성능 보고서와 이 로그를 갱신한 뒤 전체 deploy verification, OCI 배포, 인증 logsOnly 운영 조회를 실행해 실제 조회시간과 exporter timing 확보 여부를 검증한다. public gzip API/schema/DB에는 변경 없음.
- `npm run deploy:verify` 초기 시도는 `.env.local` 전체를 verify process에 주입해 optional Google translation key 관련 테스트2건이 실패하는 것을 확인하고 중단했다. 작업환경 규칙에 맞게 환경 파일을 worktree에 임시 제공해 standalone runtime에서만 읽도록 변경하고 테스트 프로세스에는 환경을 섞지 않아 재실행했다. 성공 결과: npm audit 취약점0, tests 285 files passed/1 skipped 및 1,668 passed/3 skipped, typecheck·docs/API/auth/KIS/cron audit·production build·standalone API/Chrome runtime smoke 모두 통과. 변경 파일은 `lib/server-journal.ts`, 해당 테스트, 성능 보고서, DEVELOPMENT_LOG이며 code diff check 통과; 임시 `.env.local`과 생성 산출물은 정리했다. OCI 배포 전 상태.
- timing buffer는 route bundle별 module duplication 가능성을 고려해 versioned `globalThis.__stockmanPublicDailyExportTimingsV1` 저장소로 전환했다. 이 코드 변경 뒤 focused route/ring/journal tests 3 files/15 tests 및 전체 `npm run deploy:verify`를 재실행했다. 마지막 코드 state에서 npm audit 취약점0, 286 files passed/1 skipped, 1,670 tests passed/3 skipped, typecheck, docs/API/security/KIS/cron audits, production build, standalone HTTP와 Chrome desktop/390px mobile smoke가 모두 통과했다. 임시 `.env.local`과 generated files를 제거하고 diff-check 후 commit/push/OCI 배포 및 운영 API 실측한다.
- 2026-11-27 운영 US gzip 응답은 HTTP200/46.003초, 첫 body byte0.850초, 최대 chunk 공백43.357초, gzip2,443,448B/raw JSON11,041,367B/5,011 ticker/max20봉/오류0건이었다. 동일 request ID timing은 서버 total45,713ms, universe612ms, batch wall43,277ms, 개별 query duration 합214,470ms, 최대 query43,275ms, 6 queries/1 wave, 첫 gzip byte615ms, stream45,100ms였다. 이 합산은 CPU 시간이 아니므로 PostgreSQL wait cause를 단정하지 않는다.
- 이를 구분하기 위해 인증 debug API에 `exportActivityOnly=true`를 추가했다. 시장 allowlist cache table을 참조하며 active query의 waitEventType/event별 개수, oldest/average 경과초만 집계하고 원문 SQL을 노출하지 않는다. 운영 성능 보고서에 운영 timing, 해석 한계, 재측정 절차를 기록했다. `npm run deploy:verify` 통과: npm audit0, 286 test files/1 skipped, 1,672 tests/3 skipped, typecheck, docs/API/security/KIS/cron, build, standalone 및 Chrome smoke. 변경 파일은 route/test, 성능 보고서, DEVELOPMENT_LOG 및 검증 생성 API docs/route inventory. 임시 `.env.local` 및 생성된 `next-env.tsconfig` build 변경은 제거 예정. 운영 배포 및 PostgreSQL 권한 포함 실제 activity 측정은 아직 미실행이다.

- 배포된 `exportActivityOnly=true`는 HTTP200/빈 배열이었다. exporter source의 candle relation은 `us_instrument_universe_candles`인데 진단 filter가 status 진단 relation명이어서 일치하지 않았다. 실제 KR/US exporter relation 이름으로 수정하고 route test에서 US filter parameter를 확인하도록 추가했다. public gzip 응답은 영향 없음. 최초 commit `bcbb71d2` 및 OCI run `45949437363`은 성공했지만 이 follow-up의 전체 검증·배포·운영 wait snapshot은 진행 중이다.

- table명 보정 및 공식 PostgreSQL 통계 권한 한계 설명을 반영한 후 `npm run deploy:verify` 재실행이 통과했다(286 test files passed/1 skipped, 1,672 tests passed/3 skipped, typecheck/build/docs/security/API/KIS/cron gates 및 standalone/Chrome smoke). OCI 배포 전이다. 직전 운영 시도는 구 버전 filter에서 HTTP200/빈 activity 목록이었고, 동시 시작한 gzip fetch는 서버 socket 종료로 완료 측정값이 없었다. 해당 미완료 요청은 성능 표본으로 세지 않으며, relation filter correction 배포 후 재측정한다.

- relation predicate 보정 commit `eaf5262b`의 OCI run은 후속으로 확인해 기록한다. 보정 배포 뒤 운영 export는 HTTP200/64.816초로 완료됐고 timing은 total64,219ms, universe735ms, batch wall58,285ms, batch duration 합284,902ms, 최대58,282ms, 6 queries/1 wave, gzip2,443,976B/raw11,041,367B/5,011 ticker였다. 요청 시작 후 7초 및 약22초에 activity API를 호출했지만 두 snapshot 모두 빈 목록이었다. 이 결과를 원인 부재로 해석하지 않는다. PostgreSQL 공식 문서는 일반 role에서 다른 session의 query detail을 제한한다고 설명한다. 진단에서 SQL을 출력하지 않고 visible session count, active count, query hidden count만 추가 집계해 권한 visibility를 확인하는 후속 구현을 진행 중이다. 운영 sample 간 시장 부하와 조건이 통제되지 않아 이전 46.003초와 속도 효과를 비교 결론으로 쓰지 않는다.

- `activityVisibility` 응답에 visible session/active/query-hidden 수 집계를 추가해 빈 exporter 목록과 권한 제한을 구분할 수 있게 했다. route test는 aggregate snapshot 및 visibility counts, auth gate와 table parameter를 검증한다. 코드 변경 뒤 `npm run deploy:verify` 통과: npm audit0, 286 test files passed/1 skipped, 1,672 tests passed/3 skipped, typecheck/docs/API/auth/KIS/cron gates, production build, standalone 및 Chrome desktop/mobile smoke. `docs:check`도 통과했다. `.env.local`과 build-generated files를 정리한 후 diff 확인·커밋·OCI 재배포한다.

- visibility aggregate를 포함한 `ea502475` OCI run `45953097616` 성공 후 운영 `exportActivityOnly=true`는 HTTP200, visibleSessionCount10/visibleActiveSessionCount7/queryHiddenSessionCount0을 반환했다. 권한은 query text를 볼 수 있었으나 US export 매칭은 여전히 비어 있었다. PostgreSQL 기본 query text size 1,024 bytes에서 긴 exporter SQL의 뒤쪽 relation명이 잘려 필터되지 않을 수 있어 exporter SQL 앞에 `public-daily-export-market: us|kr` marker comment를 넣고 debug filter 및 route regression assertion을 marker로 변경했다. 이 주석은 query semantics/payload를 바꾸지 않는다. 해당 수정의 전체 verification·배포·동시 production wait snapshot은 미실행이다. 측정은 응답 64.816초/동일 request server batch wall58.285초 및 gzip2,443,976B/raw11,041,367B/5,011 ticker였으나 baseline과 호출 부하가 달라 성능 개선/악화 인과로 단정하지 않는다.

- PostgreSQL activity visibility는 세션10/active7/query-hidden0이었지만 relation filter 결과가 비었다. 공개 export query text 뒤쪽 table 이름이 `track_activity_query_size` 기본 1,024-byte truncation에 잘릴 수 있어 SQL 시작부에 market marker comment를 두고 해당 marker로만 집계하도록 수정했다. market별 comment 및 debug marker bind parameter route tests를 추가했다. 이 코드/문서 state에서 `npm run deploy:verify` 통과: npm audit0, OCI activation preflight, docs/API/security/KIS/cron gates, Next production build, standalone/Chrome smoke, typecheck, 286 test files passed/1 skipped, 1,672 tests passed/3 skipped. `.env.local` 임시 복사본을 제거했다. code diff와 generated file 정리 후 커밋/push/OCI deployment; 운영 marker 매칭 및 wait event는 배포 후 실측한다.

- marker 기반 activity API를 운영 export 중 호출해 최초 유효 wait snapshot을 얻었다. 세션7–9, active4–8, query hidden0; 다수 snapshot에서 4–5개 US exporter query가 `IO/DataFileRead`였고 active age10–38초까지 관측됐다. 같은 API route는 PostgreSQL 문서에 따라 현재 relation data file 읽기 wait를 뜻한다. exporter sequential complete gzip GET: 60.821s (server total60.486s, universe3.848s, batch wall54.519s, query duration 합272.289s), 즉시 후속45.248s (server44.777s, batch wall40.104s), 3번째35.340s (server35.057s, batch wall33.017s), 약1분53초 뒤 4번째43.878s (server43.528s, batch wall40.114s). 네 응답은 HTTP200/gzip decode/JSON parse, 5,011 ticker, raw11,041,367B이며 gzip 2,443,942→2,443,448→2,443,448→2,443,448B. Warming과 DataFileRead 상관이 일치하지만 부하를 통제하지 않아 인과 확정 금지. report에 운영 실측, 공식 wait event definition, 남은 위험/다음 후보를 기록했다. 반복 호출용 gzip TTL cache는 speed 개선 가능성이 크지만 TTL만큼 marketCap/daily가 stale할 수 있어 사용자 freshness 선호 전까지 코드 변경하지 않는다.

- marker diagnostic commit `ae7e36e1`의 OCI run `45954579857`은 Verify deployment/standalone package/upload/Activate release 모두 success였고 운영 health-check HTTP200을 확인했다. 운영 marker snapshot에서 `IO/DataFileRead`가 반복 관측됐다. 연속 US gzip GET 네 건을 완전히 다운로드·gunzip·JSON parse했고 각각 HTTP200, ticker5,011/raw JSON11,041,367B였으며 client 전체시간60.821/45.248/35.340/43.878초, 동일 request server batch wall54.519/40.104/33.017/40.114초였다. 관측과 해석/TTL freshness tradeoff는 `docs/operations/public-daily-export-performance-report.md`에 추가했다. 보고서와 log를 포함한 현 문서 상태에서 전체 `npm run deploy:verify` 통과: npm audit0, 286 test files passed/1 skipped, 1,672 passed/3 skipped, typecheck/docs/API/security/KIS/cron/build/standalone/Chrome smoke 모두 통과. 임시 `.env.local` copy 제거했다. docs-only 기록은 별도 local commit한다; gzip cache는 fresh-data window 선호가 정해지기 전 구현하지 않는다.

- 속도 우선 반복 호출 개선으로 완료된 gzip 응답의 프로세스 메모리 cache를 추가한다. key는 market+format, TTL 60초, 최대4 entries/entry16MiB/총32MiB이며 완전한 gzip stream만 보관하고 cache hit은 DB/gzip을 건너뛴다. 외부 HTTP cache는 계속 `no-store`; 응답 `X-Public-Daily-Export-Cache`는 MISS/HIT을 표시한다. 회귀 감지는 route test가 gzip bytes 동일성, cache hit DB query 생략, no-store 및 header를 확인하며 운영에서는 full gunzip/schema/max20 검증과 miss-hit 지연을 측정한다. 근본 원인 후보는 이전 운영 진단의 US batch SQL `IO/DataFileRead` 대기였다. 남은 위험은 TTL 이내 market-cap/daily 최대60초 stale 및 프로세스별 캐시로 여러 인스턴스에서 hit 비율이 제한되는 점이다. 변경 파일: `lib/public-daily-export-response-cache.ts`, `lib/public-daily-export.ts`, `app/api/public/daily-export/kr/route.test.ts`, 운영 성능 보고서, 본 로그. 검증·배포·운영 측정 결과는 아래에 추가한다.
- gzip response cache의 운영 검증: commit `be6d4090`, OCI run `45958252394`가 verify/package/upload/activation 모두 성공했고 health HTTP200이었다. 운영 gzip API를 MISS→즉시 HIT로 순서대로 완전 다운로드·gunzip·JSON parse했다. US MISS60.997s/HIT0.706s, 동일 gzip2,443,942B/raw11,041,367B, 5,011 ticker; KR MISS6.731s/HIT0.646s, 동일 gzip1,061,170B/raw5,142,281B, 2,337 ticker. 네 응답 모두 application/gzip, 유효 gzip magic, ticker/marketCap/daily 구조, daily max20 통과. 한 쌍의 통제되지 않은 표본이라 HIT 지연 감소는 관측된 값이며 일반화된 평균 개선으로 주장하지 않는다. 측정 상세와 60초 stale/인스턴스별 cache 위험은 `docs/operations/public-daily-export-performance-report.md`에 기록했다. 다음 docs-inclusive commit 전에 전체 `npm run deploy:verify`를 다시 수행한다.
- 운영 cache MISS 병목 재측정(2026-11-27): US compact API GET은 HTTP200/MISS/50.134s, gzip2,443,985B/raw11,041,367B/5,011 ticker/max20. 동일 request ID `3958376b-e33b-4c16-b256-1a0312a820f4`의 authenticated timing: total49,834ms, universe582ms, 6 queries/1 wave, batch wall45,451ms(전체의 약91%), query-duration sum221,715ms, max45,408ms, first gzip585ms. 요청과 함께 관측한 activity samples는 33초에 IO/DataFileRead5개, 39초 5개, 44초1개였고 48초에는 active exporter가 사라졌다. 공식 PostgreSQL 정의는 relation data file read 대기다. 저장장치 근본원인이나 특정 relation/index를 확정하지는 않는다. 기존 적합 lookup index, zero-volume semantics, 대형 covering-index 비용 및 과거 batch/concurrency/union split 회귀 실험을 검토해 이번에는 속도 후보를 추측 변경하지 않았다. 변화 파일: 성능 보고서와 본 로그; 코드/schema/deploy 변경 없음, 운영 read-only GET만 실행. 다음 단계는 인증된 production read-only query plan/table-index I/O 통계 취득이며 그 전까지 새 대형 인덱스나 SQL/concurrency 변경을 보류한다.
- 운영 US cache MISS 병목 후속 진단: 인증 전용 `exportStorageOnly=true` 분기를 기존 daily-cache-status debug API에 추가한다. allowlist 시장의 candle table 크기/estimated rows/all-visible 비율/누적 heap·index I/O/정의·partial predicate를 read-only catalog/statistics SELECT로 반환하고, 권한 및 설치 상태가 허용하면 pg_stat_statements의 candle-table statement calls/execution/shared block 통계를 요약한다. 원문 query/ticker/credential은 반환하지 않는다. regression tests는 auth-before-query, 고정 테이블 parameter, SELECT 전용 SQL, SQL text 미노출, extension unavailable/available 경로를 검사하며 focused route 12/12 통과. 남은 위험은 PG 통계가 누계라 단일 요청 인과값이 아니고 pg_stat_statements 접근 권한/확장 유무가 운영 설정에 달렸다는 점이다. 변경 파일: `app/api/debug/daily-cache-status/route.ts`, 해당 route test, 성능 보고서, 본 로그. 전체 deploy verification/OCI 배포/실제 운영 통계 결과는 후속 추가한다.
- 2026-11-27 운영 저장소 지표 후속: 인증 `exportStorageOnly=true` 결과 US candle table 3,178,405,888B(heap1,088,094,208B/index2,089,975,808B), estimated rows2,099,748, all-visible73.24%; KR total793,067,520B(heap233,021,440B/index559,955,968B), rows378,779, all-visible100%. US 435.5MB partial covering index는 volume>0이고 `trading_value`를 cover하지 않는다. pg_stat_statements는 unavailable. 누적 catalog/statistics라 exporter 단일 호출 원인으로 볼 수 없다.
- 계획 진단 commit `8eb94e2f`의 OCI run `45965561794`가 remote verify/package/upload/activation 성공. 운영 health HTTP200. 인증 운영 plan GET: US 1,000 key 1.801s, `us_instrument_universe_candles_lookup_idx` Index Scan, market/code/timeframe index condition, estimated3 rows, cost219.01; KR 1,000 key0.856s, `kr_daily_weekly_derivation_idx` Index Scan, market/code condition 및 partial daily predicate, estimated3 rows, cost162.22. 둘 다 Function Scan estimated100 rows. `EXPLAIN` without ANALYZE이므로 실행시간·buffer I/O 실측이 아니다. 후보 index 변경은 현재 plan상 근거가 없어 보류하고 실제 MISS timing과 계속 비교한다. 운영 보고서 갱신 후 전체 verification/문서 후속 deploy 진행.
- 다음 속도 개선 조사로 cron-auth 전용 `exportAnalyzeOnly=true` 진단을 추가한다. `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON)`로 실제 SELECT를 수행해 buffer hit/read와 actual row/loop를 취득하되 첫 100 ticker 및 기존 일봉 LIMIT20으로 상한을 둔다. 쿼리 key는 parameterized, SQL/ticker 응답 비노출, 시장별 고정 relation, 인증 우선이다. 운영 DB를 실제 읽으므로 대조 측정 시에만 한 번 호출하고 full MISS와 timing을 함께 보아야 한다. route test 16/16 통과. 변경 files: debug route/test, 운영 성능 보고서, DEVELOPMENT_LOG. 전체 deploy:verify/OCI deployment/운영 analyze 및 actual response timing comparison은 아직 수행 전.
- 2026-11-27 bounded production execution analysis and export follow-up: authenticated `exportAnalyzeOnly=true` ran the first 100 eligible ticker keys read-only. US endpoint 901ms; PostgreSQL planning21.629ms/execution599.386ms, shared hit624/read1,077 blocks, temp0, actual18 rows per ticker via `us_instrument_universe_candles_lookup_idx`. KR endpoint542ms; planning19.199ms/execution292.921ms, hit395/read570, temp0, actual20 rows per ticker via `kr_daily_weekly_derivation_idx`. Buffers combine heap/index and this 100-key sample is not a full-export estimate. Public follow-up GETs both completed and validated: US HTTP200/MISS35.686s, gzip2,443,448B/raw11,041,367B/5,011 tickers; KR HTTP200/MISS8.755s, gzip1,060,716B/raw5,142,281B/2,337 tickers; both gunzip/JSON/schema/ticker/marketCap/daily/max20 checks passed, invalidRows0. Immediate US repeat was still MISS, confirming process-local cache is not shared across serving instances and the earlier MISS→HIT pair is not guaranteed in production. No API/query/index behavior changed from this measurement. Updated `docs/operations/public-daily-export-performance-report.md`; regression detection remains bounded diagnostic route tests and complete API response contract checks. Next: controlled repeated misses and relation-specific I/O evidence before choosing another query or index change. This turn's measured diagnostic and public GET were read-only; no commit/push/deploy was performed for this report-only update.
- 2026-11-27 report follow-up verification: `npm run deploy:verify` passed after the report/log update: audit0; OCI activation recovery smoke; docs/API/catalog/security/KIS/cron gates; Next production build; standalone HTTP and Chrome desktop/mobile smoke; 287 test files passed / 1 skipped, 1,681 tests passed / 3 skipped; typecheck. Build-generated `next-env.d.ts`, `tsconfig.json`, route inventory, and OpenAPI changes were reverted because they were incidental. Runtime code was already deployed as `b94ddc3a` / OCI run `45969298265`; this turn changed documentation only, so no additional runtime deployment or commit/push was made. `git diff --check` passed.
- 2026-11-27 gzip `windowBits` 14→13 속도 후보: 원인/기회는 기존 level9/`windowBits=14` gzip CPU 소요였다. Node.js 공식 zlib 문서는 windowBits를 압축/메모리 옵션으로 설명하고 낮은 window가 일반적으로 압축률을 낮출 수 있음을 명시한다(https://nodejs.org/download/release/v22.18.0/docs/api/zlib.html). Production compact payload를 Node v24.14로 7회 gzip level9 interleaved 비교: US current mem9 window14 median209.41ms/2,443,441B → window13 157.07ms/2,460,506B (-25%, +17,065B/+0.70%); KR mem8 114.21ms/1,060,709B →82.79ms/1,064,614B (-27.6%, +3,905B/+0.37%). gunzip 원본 길이 확인. 이후 `scripts/dev-server.mjs`+localhost DB에서 baseline→candidate→baseline→candidate, 시장별 6회씩 full compact API 요청을 실행했다. temporary local TTL1ms로 모든 요청을 MISS로 확인하고 각 block 첫 cold/compile 요청 제외. 10 warmed observations median: KR window14→13 337.25→293.0ms (-13.1%), US 678.0→605.0ms (-10.8%). gzip KR1,023,102→1,027,623B (+0.44%), US2,423,328→2,432,651B (+0.38%). Candidate/baseline raw JSON hashes identical per market; all responses HTTP200/gunzip/JSON/schema/ticker/marketCap/daily/max20 pass, invalid0 (local 2,352 KR/5,012 US). Changed `lib/public-daily-export.ts`, performance report, this log. Restored TTL to60s, stopped local dev server, deleted worktree `.env.local` copy, restored generated Next config. This remains local evidence; production speed/throughput may differ and must be measured after deployment. Regression detection: existing gzip route decompression/schema/max20 tests plus post-deploy complete miss/hit GET and response duration. If production completion regresses or gzip contract fails, revert windowBits14 and full verify/redeploy. Full verify/deploy/production measurements pending.
- 2026-11-27 windowBits 14→13 pre-deploy gate: `npm run deploy:verify` passed for the source/report state: audit vulnerabilities0, OCI activation recovery smoke, docs/API/catalog/security/KIS/cron checks, Next production build, standalone HTTP + Chrome desktop/mobile smoke, 287 test files passed/1 skipped, 1,681 tests passed/3 skipped, typecheck. Generated API/OpenAPI/Next config diffs were reverted. Candidate commit/OCI activation/production miss measurements remain pending.
- 2026-11-27 windowBits13 operating follow-up after commit `bdae4108` / OCI run `45974392765`: workflow succeeded, health HTTP200. Complete public gzip contracts passed. KR MISS13.417s(server13,212ms, batch wall11,312ms, gzip1,064,620B), MISS7.023s(server6,823ms, wall6,293ms, gzip1,064,995B), then HIT0.411s. US MISS36.092s(server35,836ms, batch wall31,782ms, gzip2,460,996B), HIT0.452/0.284s, later MISS48.817s(server48,593ms, wall44,616ms, gzip2,460,928B). Raw JSON stayed 5,142,281B KR/11,041,367B US, 2,337/5,011 tickers, daily<=20, invalid0. US batch query wall dominated misses; production misses did not establish an end-to-end gain from windowBits alone and sample/load differences preclude causal claims. App process cache HIT is instance-local, not guaranteed across requests.
- 2026-11-27 zlib strategy candidate: retained gzip-only level9/windowBits13 and compared `Z_FILTERED` to `Z_DEFAULT_STRATEGY`, an official Node zlib compression strategy option (https://nodejs.org/download/release/v22.18.0/docs/api/zlib.html). Actual deployed KR/US compact payload gzip benchmark, 7 interleaved rounds, showed KR 81.33ms/1,064,614B→78.42ms/1,050,525B and US163.31ms/2,460,506B→157.81ms/2,442,640B. Additional matrix (level9, 7 rounds) found window13/default fastest and smallest on both production payloads vs 13/filtered and 14/default or filtered. Real local API/DB A/B baseline→candidate→baseline→candidate, 7 full compact MISS requests/block/market, excluding each block's first compile/cold response: pooled 12-warm median KR299.05→275.30ms (-7.9%), US626.70→592.35ms (-5.5%); gzip bytes KR1,027,623→1,018,694 (-0.87%), US2,432,651→2,426,206 (-0.26%). Raw JSON hashes identical per market; all status200/MISS, gunzip/JSON/ticker/marketCap/daily/returnedCount/max20 valid, invalid0. Code changes strategy to `Z_DEFAULT_STRATEGY`; API schema, gzip member count, compression level, bars and 60s cache TTL stay fixed. Changed `lib/public-daily-export.ts`, performance report, DEVELOPMENT_LOG. Temporary local TTL restored to60s, dev server stopped, copied `.env.local` removed, generated Next files restored. Regression detection is route gzip/decode/schema tests plus operating miss timing/size after deployment. Full verification, OCI deployment, post-deployment operating API measures pending.
- Rejected US `NUMERIC` turnover text-regex replacement after a real local PostgreSQL API comparison. Official PostgreSQL 16 numeric docs establish special Infinity/NaN order, making finite bounds semantically plausible, but baseline/candidate local warm client medians635.6/620.95ms and server totals593/591.5ms were effectively tied; batch query duration sum median1345/1393ms regressed3.6%, while output was byte-identical. Restored original US regex and its regression test; no code change retained from this candidate.

- `Z_DEFAULT_STRATEGY` gzip 최적화의 전체 `npm run deploy:verify` 통과(quality gates, Next production build, standalone 및 Chrome desktop/mobile smoke, Vitest, typecheck/docs/API/auth/KIS/cron). 로컬 API MISS 교차 A/B에서 KR median 299.05→275.30ms(-7.9%), US 626.70→592.35ms(-5.5%)였고 gzip bytes는 KR -0.87%, US -0.26%; JSON SHA/schema/max20 동일했다. 변경: `lib/public-daily-export.ts`, 운영 성능 보고서, 본 로그. `git diff --check` 통과. upstream `oci` 기준 `bdae4108` 확인 후 commit `cd5ee744`를 push하고 [OCI run 45978843679](https://github.com/pjtss/StockMan/actions/runs/45978843679)에서 deployment verify/package/upload/Activate release 모두 성공 및 운영 health HTTP200을 확인했다. 운영 MISS: KR18.196초, gzip/raw1,050,532/5,142,281B, 2,337 ticker/46,740 candle; US43.778초, 2,442,647/11,041,367B, 5,011 ticker/98,500 candle. HIT: KR533ms, US373ms. 네 응답 모두 gzip magic/gunzip/JSON/ticker/marketCap/daily/returnedCount/max20 검증 통과, invalid0; HIT/MISS gzip bytes 동일. 남은 위험: 단일 운영 MISS는 DB batch/I/O 영향과 gzip 효과를 분리하지 못하고, process cache는 인스턴스별이다. 다음 개선은 측정 가능한 DB I/O/query wall 병목 후보를 찾아 동일 API 검증 후 배포한다.

- US public daily export의 DB I/O 후보로 covering index를 로컬 `localhost:5432/stockman`에서 조사했다. 임시 `(market,code,candle_date DESC) INCLUDE (open,high,low,close,volume,trading_value,fetched_at) WHERE timeframe='D' AND volume>=0` index는 12.6초/492,797,952B에 생성됐고, 후보 plan은 Index Only Scan이지만 100 ticker/약2,000 candle에서 heap fetch 1,955회, shared read752/hit1,142였다. 실제 full compact API MISS 반복은 baseline 7회 client median714.4ms, candidate4회745.9ms(+4.4%); server total median611.5→652.5ms(+6.7%). query wall만302→284ms(-6%) 줄어 전체 완료시간 이득이 없어 후보를 삭제했다. payload SHA/gzip bytes/5,012 ticker/99,486 candle/max20/invalid0 동일. 운영 DB/migration 변경 없음. 공식 PostgreSQL index-only scan 설명 및 상세 수치는 `docs/operations/public-daily-export-performance-report.md`의 `기각: US daily covering index 후보`에 기록했다. 시험 TTL1ms를60초로 복구, dev server 종료, 임시 `.env.local`, generated tsconfig 파일, 로컬 임시 index 제거. 남은 다음 단계: 더 낮은 비용으로 DB read/visibility burden를 줄이는 query 계획 후보를 평가하고 전체 API 반복 측정에서 이득이 없으면 거절.

- covering index 기각 조사 문서 상태에서 `npm run deploy:verify` 통과: dependency audit 취약점0, OCI activation preflight, docs/API surface/catalog/security/KIS/cron gates, Next production build, standalone/Chrome desktop/mobile runtime smoke, Vitest 287 files passed/1 skipped 및 1,681 tests passed/3 skipped, typecheck. `git diff --check` 통과. build가 갱신한 route inventory/OpenAPI/Next generated 설정 파일은 초기 상태대로 복원했다. 후보는 성능 이득이 없어 commit/push/deploy 하지 않고 로컬 trial index 및 env/server만 사용 후 정리했다.

- public daily gzip cache의 TTL 만료 직후 sync DB MISS를 피하도록 stale-while-revalidate를 추가했다. 60초 fresh + 60초 stale grace, `X-Public-Daily-Export-Cache: STALE`, market/format별 single-flight background DB+gzip refresh; HTTP `no-store`와 기존 gzip/data contract는 유지했다. 배경 갱신 실패 시 이전 snapshot은 grace 종료까지 반환되고 data timestamp metadata는 원본 snapshot 기준이다. `scripts/api-surface.mjs`/OpenAPI에 cache 상태·freshness를 문서화했다. 집중 테스트 21/21 통과. 임시 5초 TTL local Next API integration: MISS1,749.7ms→STALE221.1ms→갱신 후 HIT165.8ms, background refresh597ms; gzip/raw bytes 및 SHA/payload 동일, 5,012 ticker, 99,486 candles, max20, invalid0. 임시 TTL은60초 원복, worktree `.env.local` 삭제, local dev server stop, generated Next config 복원. 보고서: `docs/operations/public-daily-export-performance-report.md` section `stale-while-revalidate`. 전체 deploy verification/OCI deploy/운영 stale-path 검증은 진행 예정. 남은 위험: background 갱신 실패 시 data age 최대120초, process-local cache라 multi-instance refresh가 분리된다.

- stale-while-revalidate 구현의 `npm run deploy:verify` 통과: npm audit 취약점0, OCI activation preflight, docs/API surface/catalog, auth/security/KIS/cron gates, Next production build, standalone/Chrome desktop+mobile smoke, 287 test files passed/1 skipped 및 1,683 tests passed/3 skipped, typecheck. OpenAPI header/status docs를 생성 확인하고 route inventory/generated Next config drift는 복구했다. `git diff --check` 통과. commit/push/OCI 배포와 운영 stale revalidation API 검증은 후속 진행한다.


### 2026-11-27 — stale-while-revalidate OCI 운영 검증
- 목적/범위: `d2a608e6` 배포의 gzip snapshot fresh 60초 + stale grace 60초 및 백그라운드 갱신을 운영 API에서 검증했다. 코드 변경은 없고 운영 요청은 공개 US compact GET과 cron-auth 보호 export timing read-only GET만 수행했다.
- 운영 실측: 배포 workflow `45987582754` Verify/package/upload/activate 모두 성공, health HTTP200. US compact MISS 44,706.5ms, HIT 492.5ms, expired STALE 1,348.6ms. Stale 요청 후 background refresh는 33,132ms; 그 완료 뒤 응답 HIT로 전환했다. 최초 후속 요청은 refresh 중이라 STALE이었고, refresh 완료 ID 확인 후 HIT 확인으로 검증했다.
- 데이터 검증: 각 상태 HTTP200, gzip magic `1f8b`, `Cache-Control: no-store`, 동일 raw SHA-256, gzip 2,442,647B/raw 11,041,367B, 5,011 tickers/98,500 candles, 최대20 candles, 초과 ticker 0. stale 응답은 이전 데이터의 관측시각 metadata를 유지한다.
- 제한/회귀 감지: refresh 실패 시 snapshot은 최대 fresh 60초+stale 60초 동안 제공될 수 있고 cache/refresh lock은 프로세스별이다. 운영 smoke는 cache 상태 header, gzip/schema/hash/max20, refresh timing ID 및 완료 후 HIT를 함께 확인한다. US compact 단일 순차 실측이며 KR/full/부하 테스트는 미실시. 다음 후보는 refresh DB batch wall-time과 운영 동시 부하 분리 계측.
- 검증/배포: 문서 갱신 후 `npm run deploy:verify` 통과(의존성 취약점0, OCI activation preflight, docs/API/security/KIS/cron gates, Next build, standalone 및 Chrome desktop/mobile smoke, 287 test files passed/1 skipped, 1,683 tests passed/3 skipped, typecheck). 자동 생성 `docs/api/route-inventory.json`, `next-env.d.ts`, `tsconfig.json`은 복구했고 `git diff --check` 통과. 운영 코드는 commit `d2a608e6`으로 이미 배포됨. 이번 추가 변경은 운영 보고서/개발 로그만이므로 별도 commit/push/deploy는 수행하지 않았다.

- 2026-11-27 최근20개 일봉 read-cache 후보: production US MISS 44.459초, stale refresh33.132초(그중 DB batch wall31.620초); 인증된 `pg_stat_activity` sampled exporter queries 4–5개가 최대38초 `IO/DataFileRead` 대기. 이에 `us_recent_daily_candles`/`kr_recent_daily_candles`를 만들고 원본 validity predicate의 ticker별 latest20을 backfill하며 export read를 좁은 테이블로 전환한다. V184 migration, `lib/recent-daily-candle-cache.ts`, `lib/schema.ts`, `lib/public-daily-export.ts`, KR/US daily saver transaction integration, route/helper tests, performance report를 변경했다. saver가 source upsert와 같은 transaction에서 recent20 upsert 및 older-row prune를 실행한다.
- local 실측: test cache table US110,430 rows/16,007,168B, KR51,036/7,348,224B. 요청마다 MISS를 낸 warmed median US733.9→624.2ms(-14.9%), KR371.7→321.9ms(-13.4%). Source column type을 보존한 candidate의 raw JSON hash/gzip byte는 두 시장 baseline과 일치. V184 SQL은 temporary local schema backfill 16.688초, 결과 US110,430/KR51,036. Helper는 rollback transaction으로 25 fixture bars→latest20 only를 양 시장 검증했고, Next API MISS payload hash/max20도 일치. 임시 table/source column/env file/dev server 정리 완료.
- 검증/배포: recent-cache/helper+public API focused Vitest 21/21, typecheck 통과. 전체 `npm run deploy:verify` 통과: dependency audit0, OCI activation preflight, docs/API/security/KIS/cron gates, Next build, standalone 및 Chrome desktop/mobile smoke, 288 test files 중 287 passed/1 skipped, 1,685 tests passed/3 skipped, typecheck. generated route inventory/Next config 복구 후 commit/push `f0355bda42d62f0159f7d1a6210a51693d9551a3`, OCI workflow [45994891820](https://github.com/pjtss/StockMan/actions/runs/45994891820) Verify/package/upload/activate 성공, health HTTP200. 운영 API: KR MISS/HIT 3.532/0.181초, US MISS/HIT 8.956/0.808초 및 재현 MISS/HIT 7.466/0.454초. 이전 관측 MISS KR18.196초/US44.707초 대비 각 약80.6%/80.0% 짧았으나 통제되지 않은 표본이라 SLA로 일반화하지 않는다. 응답 gzip magic/schema/hash/max20/invalid0 검증 완료. US STALE 2.381초, background refresh total16.588초/batch wall9.403초, 후속 HIT 전환 확인. 상세 수치와 payload digest는 `docs/operations/public-daily-export-performance-report.md`에 기록. Migration production backfill 및 daily save transaction 추가 비용은 아직 별도 timing되지 않았으며 다음 scheduled daily-cache refresh 완료시간/오류를 관측한다. 운영 latency 개선 재현성과 daily refresh 영향 확인 후 다음 병목 최적화를 이어간다.
- 2026-11-27 최근 일봉 cache read 중복 검사 제거 후보: 현 운영 US full MISS는 server total14,620ms, batch-query wall9,018ms였다. 요청과 겹친 5개 exporter query가 active였지만 wait event는 null로 관측됐으며 이는 CPU 원인 확정 증거는 아니다. V184 migration과 transactional `refreshRecentDailyCandleCache`가 recent20 테이블에 이미 유효한 D봉만 적재하므로 `lib/public-daily-export.ts`의 중복 `timeframe` 및 date/OHLC/volume predicate를 export SELECT에서 제거했다. writer/helper와 migration 검증은 유지하고 route/helper tests에 불변식을 고정했다. Local warmed MISS baseline→candidate 두 block 중앙값 KR292→284ms 및302→281.5ms, US652→589ms 및630→586ms. 두 시장 raw JSON SHA/gzip bytes가 baseline과 candidate에서 동일; schema, ticker count, returnedCount, max20, invalid0 확인. 집중 테스트 21/21 통과.
- 정리/검증/배포: local API 측정 때 response cache TTL/grace 1ms 및 임시 V184 기반 tables만 일시 생성; tables 삭제 검증, TTL/grace60초 복구, dev server 종료, `.env.local` 복사본 제거, generated `next-env.d.ts`/`tsconfig.json` 복원. 변경 두 테스트 files focused21/21. 전체 `npm run deploy:verify` 통과: dependency audit0, OCI activation preflight, docs/API/security/KIS/cron gates, Next build, standalone 및 Chrome desktop/mobile smoke, 288 test files passed/1 skipped, 1,685 tests passed/3 skipped, typecheck. `git diff --check` 통과 후 commit `5eeb5d09184fbbf61f31aa20fc5d48c45f1b2c3e` push. OCI workflow [46000469951](https://github.com/pjtss/StockMan/actions/runs/46000469951) Verify/package/upload/activate 성공, health HTTP200. 운영 compact MISS KR client/server total/batch wall3.371/3.207/2.249초, US8.890/8.786/6.665초; full MISS KR4.981/4.487/2.603초, US13.017/10.122/5.572초. 네 응답 모두 gzip·hash·schema·returnedCount·max20·invalid0 통과. 직전 코드 비교에서 KR compact는 다소 짧아지고, US compact 전체 시간은 거의 동일, US full은 길어져 운영 end-to-end speed gain은 미확정이며 지표가 비통제다. 후속 compact HIT KR586/267/245ms, US463/488/457ms; HIT timing은 MISS 개선으로 계산하지 않는다. 세부 operating raw hashes/phase는 performance report에 기록. DB cache table에 CHECK constraint가 없다는 위험과 daily save transaction 추가비용 미측정은 남아 있어 다음 scheduled refresh 및 추가 MISS 표본을 관측한다. local에서 반복 이득이 확인됐고 data contract는 그대로라 candidate는 유지하며, 운영 개선이 재현되지 않거나 cache validity 문제가 확인되면 predicate를 복구해 재배포한다.

- 2026-11-27 US NUMERIC turnover regex 제거 후보: previous US numeric bounds test was neutral on source table; retested after V184 recent-cache path because the production query now processes its bounded ~98.5k rows there. PostgreSQL local parity probe values -Infinity/Infinity/NaN/0/-0.125/1.25e3 yielded identical finite checks for regex and bounds. Two local MISS blocks, first request excluded: US median 599→579ms (-3.3%) and604→561ms (-7.1%); unchanged KR control 294→286ms then259→267ms. All payload raw SHA/gzip bytes equal between versions, HTTP200, schema, count, max20, invalid0. Local US cache fixture populated numeric trading_value as close*volume because the local source schema predates that column; note as test-data limitation.
- Verification/error handling: focused route/helper first run failed two stale-cache cases because temporary measurement TTL/grace=1ms conflicted with tests requiring normal cache timing; restored both to60s and reran successfully, 21/21. Temporary V184 cache tables were confirmed absent before create and dropped afterward; dev server stopped, worktree .env.local copy removed, Next generated config restored.
- Deployment follow-up supersedes the pending status above: `npm run deploy:verify` passed (1,685 tests passed, 3 skipped, build/typecheck/docs/runtime smoke passed); commit `de0de2c4` pushed and OCI workflow `46004039286` activated successfully. Production health was HTTP200. Sequential gzip MISS: KR3.875s, US14.655s; the authenticated US timing log matched the request and showed max batch query11.590s, batch wall11.591s, first gzip byte1.014s, stream13.601s. Full receive/gunzip/parse contract checks passed, and response HITs were KR490ms/US538ms. One fresh production sample is encouraging against the previous 31.944s US observation but does not prove causation; continue paired MISS measurements and revert/redeploy if repeated regressions or payload/semantic differences appear. Detailed sizes, raw hashes, contract counts, and limitations are in `docs/operations/public-daily-export-performance-report.md`.
- Same-deploy US recheck after response-cache expiration: compact gzip MISS HTTP200, headers1.347s/total7.038s, gzip2,443,087B/raw11,041,367B, 5,011 ticker/98,500 candles/max20/invalid0, raw SHA same as first MISS. Authenticated in-process timing endpoint returned the earlier request only; systemd journal read timed out. Documented these as uncorrelated operating samples, not causal comparison.
- New local API candidate: PostgreSQL now returns one ordered compact JSON string per existing batch via `string_agg` rather than one protocol row per ticker. First `json_agg` attempt was rejected for adding separator whitespace (+1 byte/ticker) and US median regression. Final `string_agg` version preserved raw SHA and gzip bytes. Six sequential local compact MISS requests per market/version, first excluded: US warmed median526→509ms (-3.2%), KR251→247ms (-1.6%); payload contracts passed. Full-format KR/US smoke passed. The initial route test rerun hit 2 stale-cache failures due to the temporary1ms TTL; restored60s and focused route suite passed19/19. Temporary V184 local cache tables/database state, dev server, `.env.local` copy, and generated Next config were cleaned/restored.
- Aggregate candidate deployment supersedes pending status: `npm run deploy:verify` passed, including 288 files passed/1 skipped, 1,685 tests passed/3 skipped, build/typecheck/runtime smoke and docs/API/security/KIS/cron checks. Commit `e6850536` deployed successfully by workflow `46008343557`; health HTTP200. Production compact MISS timings with exact matched authenticated server records: US #1 client13.696s/server13.397s/batch wall4.692s/max4.692s; US #2 client9.249s/server8.893s/batch wall5.500s/max5.494s. KR client MISS5.789s. All contract, returnedCount, tuple, max20 and invalid0 checks passed. Production raw SHA matched prior deployment in both markets; gzip sizes varied with streamed flushes. Compared to the single prior correlated US sample (server14.600s/batch wall11.591s/max11.590s), both candidate samples are faster, consistent with local MISS medians but not a causal controlled A/B. Keep deployed and gather more server-correlated samples; revert if benefit is not sustained, resource pressure rises, or raw payload changes. Detailed observations/limitations are in `docs/operations/public-daily-export-performance-report.md`.
- Gzip-buffer ownership candidate retains zlib buffers, concatenates once at stream end, and transfers the completed byte array to the private response cache while preserving defensive copies on cache reads/default writes. Eight sequential local compact MISSes per market/version, first excluded: US median545→510ms (-6.4%), KR255→256ms (+0.4%). Both payload raw SHA and gzip bytes exactly matched baseline; payload contracts passed. Focused route/cache tests passed22/22; `npm run deploy:verify` passed locally and in Actions (1,686 passed/3 skipped); commit `80d91c0f` deployed successfully via workflow `46011783061`. Production health HTTP200. Production gzip MISS: KR3.320s and US5.728s; authenticated US timing matched (server total5.568s, batch wall3.897s, max query3.897s). Full decompress/parse/schema/max20/invalid0 checks passed; HITs KR460ms/US531ms. Raw SHA and exact gzip bytes matched HIT/MISS and prior deployment. This is a positive initial result, not causal proof (one MISS per market; query/network/instance variability); continue correlated samples and revert on repeat regressions or payload/cache isolation difference. Detailed production measurements and limitations are in `docs/operations/public-daily-export-performance-report.md`.
- Per-ticker candle JSON summary: V185 backfills compact/full JSON and metadata from bounded V184 daily cache rows; transactional candle refreshes update/delete summaries; public gzip MISS joins one row per ticker and removes the universe query's per-request `pg_attribute` check. Local read-only SQL A/B on1,000 US common stocks/19,777 candle rows, eight alternating samples, returned exact matching batch JSON SHA; query median108.5→84ms (-22.6%). Whole-batch grouping was slower and rejected. Local writer microbenchmark12 alternating samples was1ms baseline vs2ms candidate median (+1ms per ticker). V185 executed against rollback-only fixtures (US/KR arrays1–20 and returnedCount matched; no persistent relation remained); actual writer SQL executed against a temp US fixture with20 compact/full entries. Local source fixture uses close*volume because trading_value is absent. Focused tests passed21/21; `npm run deploy:verify` passed: 288 files passed/1 skipped, 1,686 tests passed/3 skipped, build/typecheck/runtime smoke/docs/API/security/KIS/cron gates all passed. Commit `1d75c96c` deployed successfully via workflow `46016784797`; health HTTP200. Production compact MISS: KR2.394s; US correlated server samples total18.491s/3.338s/6.414s with batch wall1.891s/2.118s/3.777s and stream18.226s/3.212s/5.472s; third sample was a background refresh after STALE. Full-format MISS KR2.018s and US17.627s; US server total17.398s, batch wall6.386s. All compact/full responses passed gzip, JSON, schema, metadata, max20, invalid0; raw SHA stable; HITs KR467ms/US534ms. Candidate US query batch wall median3.777s vs prior single3.897s, but total median6.414s vs prior single5.568s and one stream outlier18.226s: operational sample insufficient to establish end-to-end gain. Keep deployed for additional correlated MISS evidence; revert if repeated total latency regressions, summary/cache drift, or material candle-write slowdown. Report: `docs/operations/public-daily-export-performance-report.md`.
- 2026-11-27 cache-expiry recheck on the already active release: health HTTP200; waited >60s after prior response window, then public compact KR/US both returned HTTP200 `MISS` with valid gzip magic. Full-body client times were KR2.401s/1,050,532B and US3.310s/2,442,647B. This quick probe did not gunzip or revalidate schema, so it is timing/header evidence only; prior deployment validation remains the schema evidence. Gzip wire SHA changed and was not treated as payload hash. No code or deployment changed; report updated. Follow-up: repeat with full gunzip/JSON/max20 contract and correlate authenticated server phase timings before drawing latency conclusions.
- Post-activation verification for documentation release `2f6d5af2` / OCI run `46020645902`: remote verify/package/upload/activate all succeeded; production health HTTP200. Fresh-process public compact MISSes fully received, gunzipped and parsed: KR3.309s, gzip1,050,532B/raw5,142,281B, 2,337 tickers/46,740 candles; US3.807s, gzip2,442,647B/raw11,041,367B, 5,011/98,500. Both application/gzip, tuple-v1/eight fields, ticker/marketCap/daily, returnedCount, max20, invalid0/mismatch0 passed. Raw SHA matched prior production payload (KR `1341542869a38a0731a0330e728ae45a337851129c9f3d5e9046b81517c229f4`; US `cec0b31fa79190e38b539a81ba68ab1cdd57d517099fea2157a25ee0a70ee228`). These show release and payload parity, not causal speed improvement; request-correlated server phases remain necessary.
