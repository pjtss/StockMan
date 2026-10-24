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
- `git diff --check` 통과. API·import·navigation·OCI cron 정적 참조를 확인했고, SEC 자동 수집은 `/api/cron/sec-edgar` 및 `/api/cron/market-rss` 경로에 남아 있음을 확인했다.
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
- `git diff --check` 통과.

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
- `git diff --check` 통과. LF→CRLF 안내만 확인했다.

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
- `git diff --check` 통과.
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
- `r`npm run typecheck` 통과.
- `r`npx vitest run lib/market-rss-classifier.test.ts` 통과: 9개 테스트.
- `r`npm run docs:check`는 최신 문서 항목 형식 보강 전 1회 실패했으며, 현재 항목에 필수 문서 계약을 반영했다.
- `r`npm run build`를 2회 실행했으나 `r`next build` 시작 메시지 이후 2분 이상 출력·종료가 없어 중단했다. 배포와 운영 DB 마이그레이션은 실행하지 않았다.

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
- 번역 대상은 `r`notifyEligible=true`이고 `isBacklog=false`인 항목이며, 현재 제목만 번역하고 요약·본문은 원문을 유지한다.
- 번역 성공 시 Discord 제목은 번역문이고 원문 제목을 함께 표시한다.
- API 키 없음, 월간 문자 한도 초과, 번역 API fallback 또는 실패 시 Discord 전송 자체는 계속되며 제목은 원문으로 표시된다. 이 경우 데이터에 `translationFallback`/상태가 남는다.
- `r`notifyEligible=false` 또는 backlog 항목은 번역 단계에서 제외된다.
- 관리자 RSS 미리보기의 `translateMarketRssItems()` 기본 인자는 아직 `LibreTranslateClient`다. LibreTranslate를 사용하지 않는 운영 기준과 불일치하므로 관리자 미리보기 결과는 운영 Discord 결과 검증 근거로 사용할 수 없다.

### 테스트
- `r`npx vitest run lib/translate-market-rss-item.test.ts lib/cloud-translation-client.test.ts lib/libretranslate-client.test.ts` 통과: 3개 파일, 6개 테스트.

### 결론 및 남은 위험
- Discord에서 어떤 항목은 번역되고 어떤 항목은 원문인 현상은 현재 코드상 정상적인 fallback·대상 제외 결과일 수 있다. 다만 관리자 미리보기의 LibreTranslate 기본 경로는 별도 정리 대상이다.
- 실제 운영 건별 판정에는 관리자 debug suite 또는 DB의 `translationStatus`, `translationFallback`, `translationError`, `r`notificationStatus` 값을 함께 확인해야 한다.
- 추가 로컬 DB 확인: `.env.local`에는 `DATABASE_URL`만 존재하고 `GOOGLE_TRANSLATION_API_KEY`는 없었다. `market_rss_articles` 전체 집계는 ETODAY 38, HANKYUNG 50, KRX_KIND 100, MK 50, NASDAQ 15, NEWSIS 100, SEC_EDGAR 99, STOCKTITAN 100건이 모두 `translation_status=PENDING`이었다. 최근 7일 행은 없으므로 이 DB 결과만으로 운영 Discord 이력을 확정할 수는 없지만, 현재 로컬 실행 환경에서는 번역이 시작되지 않는 상태다.
- **수정**: LibreTranslate를 사용하지 않는 운영 정책과 관리자 미리보기의 기본 동작을 일치시키기 위해 `lib/translate-market-rss-item.ts`에서 LibreTranslate import 및 기본 클라이언트를 제거했다. 이제 명시적 클라이언트가 없으면 Cloud Translation 환경 키를 사용하고, 키가 없으면 운영 cron과 동일하게 원문 fallback한다.
- **재발 방지**: 번역 미리보기·운영 cron 모두 번역 공급자를 암묵적으로 LibreTranslate로 선택하지 않으며, 공급자 테스트는 명시적 테스트 클라이언트를 주입한다.
- **검증**: 번역 관련 Vitest 2개 파일·5개 테스트 통과, `r`npm run typecheck` 통과.
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
- **근본 원인**: standalone 운영 프로세스의 instrumentation hook이 `r`new Function()`으로 `@/lib/intraday-detection-worker` 별칭을 런타임 import해 `ERR_MODULE_NOT_FOUND`로 실패했고, 워커가 시작되지 않았다.
- `instrumentation.ts`에서 Node 전용 워커 import를 제거하고, `/api/kis/intraday-mvp`의 singleton 지연 기동을 유일한 워커 실행 경로로 사용한다. 이로써 instrumentation 번들에 `pg`/Node core 모듈이 포함되지 않는다.
- `ensureIntradayDetectionWorker()`를 추가하고 상태 API 첫 조회에서 프로세스 singleton 워커를 보장 기동한다.
- 개발 환경과 명시적 `INTRADAY_DETECTION_ENABLED=false` 긴급 중지 조건은 유지한다.
- 운영에서 `mvpQualified=true`인데 `WARMING_UP` 상태 때문에 Discord 알림이 차단되던 상태 불일치를 수정했다. 신선한 관측은 MVP 거래대금 조건을 우선하고 `STALE`·`DEGRADED`만 차단한다.

### 검증
- `r`npm.cmd test -- --run app/api/kis/intraday-mvp/route.test.ts lib/intraday-detection-worker.test.ts lib/intraday-memory-state.test.ts`: 3개 파일, 21개 테스트 통과.
- `r`npm.cmd run typecheck`: 통과.
- `r`npm.cmd run docs:check`: 통과.
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
- `r`npm.cmd run typecheck`: 통과.
- `r`npm.cmd test -- --run`: 163개 테스트 파일, 541개 테스트 통과.
- `r`npm.cmd run verify`: 문서 계약 형식 오류로 중단됨.

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
- `r`npm.cmd test -- --run`: 158개 테스트 파일, 525개 테스트 통과.
- `r`npm.cmd run typecheck`: 통과.
- `r`npm.cmd run build`: 통과.

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
- `r`npm.cmd test -- --run`: 158개 테스트 파일, 525개 테스트 통과.
- `r`npm.cmd run typecheck`: 통과.
- `r`npm.cmd run build`: 통과.
- `r`npm.cmd run deploy:verify`: 문서 게이트에서 기존 최신 로그 형식 오류로 중단됨. 해당 형식 오류를 본 항목으로 보완 후 재실행한다.

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
- `r`npm.cmd run deploy:verify` 통과: 빌드, 테스트 157개 파일/523개, 타입체크, 문서·범위·KIS·cron 감사, runtime smoke 모두 성공.
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
- `r`npm.cmd test -- --run lib/intraday-detection-worker.test.ts` 통과(3 tests).
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
- `r`npm.cmd run typecheck` 통과.
- `r`npx.cmd vitest run lib/schema-health.test.ts app/api/health/route.test.ts` 통과.
- 전체 `r`npm.cmd run deploy:verify`에서 테스트·빌드·실행 스모크를 확인한다.

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
- `r`npm.cmd run deploy:verify`에서 전체 테스트·타입체크·문서·빌드·실행 스모크를 확인한다.
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
- `r`npx.cmd vitest run app/api/kis/intraday-mvp/route.test.ts`에서 기존 결과 계약 2건을 통과했다.
- 전체 `r`npm.cmd run deploy:verify`에서 테스트·타입체크·문서·빌드·실행 스모크를 확인한다.

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
- 전체 `r`npm.cmd run deploy:verify`로 테스트·타입체크·문서·빌드·실행 스모크를 확인한다.

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
- `r`npm.cmd run docs:check`로 문서 계약과 마이그레이션 검사를 수행한다.

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
- 전체 `r`npm.cmd run deploy:verify`를 실행해 빌드와 런타임 스모크 종료까지 확인한다.

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
- 관련 차트 API 테스트와 전체 `r`npm.cmd run deploy:verify`를 실행해 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·런타임을 확인한다.

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
- 단독 `r`npm.cmd run build`는 정상 종료했다.
- 수정 후 전체 `r`npm.cmd run deploy:verify`를 실행해 요청 타임아웃과 런타임 스모크 종료를 확인한다.

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
- 전체 `r`npm.cmd run deploy:verify`를 재실행해 로컬 5xx JSON 오탐 해소와 전체 품질 게이트를 확인한다.

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
- 전체 `r`npm.cmd run deploy:verify`로 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·HTML/JSON 런타임 스모크를 확인한다.

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
- 전체 `r`npm.cmd run deploy:verify`를 실행해 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·런타임 스모크를 확인한다.
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
- 전체 `r`npm.cmd run deploy:verify`를 실행해 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·런타임 스모크를 확인한다.
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
- 관련 KIS 테스트를 실행하고 전체 `r`npm.cmd run deploy:verify`로 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·런타임 스모크를 검증한다.

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
- 전체 `r`npm.cmd run deploy:verify`에서 테스트·타입체크·문서·범위·KIS 경계·cron·빌드·런타임 스모크를 확인한다.

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
- 관련 테스트 및 전체 `r`npm.cmd run deploy:verify`를 실행한다.
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

- `r`npm.cmd run typecheck` 통과.
- 실행 예: `r`node_modules/tsx/dist/cli.mjs scripts/run-us-daily-1200-backfill.mjs`.
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
- `r`npm.cmd run deploy:verify`의 테스트 156개 파일·521개 테스트와 타입검사 통과. 문서 계약은 보완 후 재실행한다.

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
- `r`npm.cmd run verify` 통과.
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
- `r`npx vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts lib/intraday-candidate-priority.test.ts app/api/kis/intraday-mvp/route.test.ts lib/kis-us-minute-turnover.test.ts --run` 통과: 5개 파일·22개 테스트.
- `r`npm.cmd run typecheck` 통과.
- 추가 stale 결과 회귀 검증: `r`npx vitest run app/api/kis/intraday-mvp/route.test.ts lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 3개 파일·17개 테스트.
- Docker Desktop의 `stockman-postgres-local` 컨테이너 기동 후 전체 `r`npm.cmd test -- --run` 통과: 156개 파일·521개 테스트.
- `r`npm.cmd run typecheck` 실행 완료.
- `r`npm.cmd run docs:check` 실행 완료.
- `r`npm.cmd run build` 통과: Next.js 프로덕션 빌드 성공.

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
- `r`npx vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·13개 테스트.
- `r`npm.cmd run typecheck` 통과.
- `r`npm.cmd run docs:check` 통과.

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
- `r`npx vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·12개 테스트.
- `r`npm.cmd run typecheck` 통과.
- `r`npm.cmd run docs:check` 통과.

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
- `r`npx vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·12개 테스트.
- `r`npm.cmd run typecheck` 통과.
- `r`npm.cmd run docs:check` 통과.

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
- `r`npx vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·11개 테스트.
- `r`npm.cmd run typecheck` 통과.
- `r`npm.cmd run docs:check` 통과.

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
- `r`npx vitest run lib/intraday-memory-state.test.ts lib/intraday-detection-worker.test.ts --run` 통과: 2개 파일·8개 테스트.
- `r`npm.cmd run typecheck` 통과.
- `r`node --check scripts/verify-deploy.mjs` 통과.

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
- `r`node --check scripts/verify-deploy.mjs` 통과.
- `r`npm.cmd run deploy:verify`의 테스트 154개 파일·507개 테스트, 타입체크, 문서 검사, 검증 범위 감사, KIS 경계 감사, cron 검사를 통과했다.
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
- `r`node --check scripts/audit-verify-scope-change.mjs` 통과.
- `r`npm.cmd run audit:verify-scope` 통과: 현재 manifest 변경 없음.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`node --check scripts/compare-verify.mjs` 통과.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`node --check scripts/compare-verify.mjs` 통과.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`node --check scripts/compare-verify.mjs` 통과.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `compare:verify`가 `missingStages`와 `r`newStages`를 출력하도록 추가했다.
- 기준 단계 누락은 비교 실패로 처리하고, 신규 단계는 범위 변경으로 표시한다.

### 검증
- `r`node --check scripts/compare-verify.mjs` 통과.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`node --check scripts/compare-verify.mjs` 통과.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`node --check scripts/compare-verify.mjs` 통과.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`node --check scripts/measure-verify.mjs` 통과.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`node --check scripts/compare-verify.mjs` 통과.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`node --check scripts/measure-verify.mjs` 통과.
- 기존 `r`npm.cmd run measure:verify` 전체 실행 통과 및 단계별 JSON 출력 확인.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`npm.cmd run verify` 통과: 테스트 152개 파일·502개 테스트, 타입체크, 문서, KIS 경계, cron, 빌드.
- `r`npm.cmd run measure:verify` 통과: 전체 122,977ms, 테스트 64,508ms, 빌드 51,575ms 등 단계별 JSON 출력 확인.
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
- `r`npm.cmd run verify` 통과: 테스트 152개 파일·502개 테스트, 타입체크, 문서, KIS 경계, cron, Next 빌드.
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
- `r`npm.cmd run audit:kis-boundary` 통과: 모듈·테스트·예외·경로·대표 함수 계약 검사.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`npm.cmd run audit:kis-boundary` 통과: 모듈 registry, 테스트 연결, 예외 범위, 대표 API 경로 검사.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`npm.cmd run audit:kis-boundary` 통과: registry, 예외 경계, 핵심 모듈 테스트 연결 검사.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`npm.cmd run audit:kis-boundary` 통과: 27개 KIS 모듈 registry 일치 및 요청 경계 검사.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`npm.cmd run audit:kis-boundary` 통과: 데이터 모듈 공통 경계 및 예외 엔드포인트 범위 검사.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`npm.cmd run audit:kis-boundary` 통과: 예외 파일 존재·목적 문서화·데이터 모듈 경계 검사.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`npm.cmd run audit:kis-boundary` 통과: 예외 모듈 존재·문서 동기화 및 데이터 모듈 경계 검사.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.
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
- `r`npm run verify`에 `audit:kis-boundary` 단계 연결.
- 토큰 발급·Approval을 제외한 KIS 모듈의 공통 throttle 경계 사용을 검사한다.

### 검증
- `r`npm.cmd run audit:kis-boundary` 통과: 모든 KIS 데이터 모듈이 공통 경계를 사용한다.
- `r`npm.cmd run docs:check` 통과: 필수 문서·Flyway 133개 검사.

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
- `r`npm.cmd run docs:check` 통과: 외부 요청 경계 계약, 최신 기록 계약, ID 중복, 필수 문서·Flyway 133개 검사.

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
- `r`npm.cmd run docs:check` 통과: 배포 상태, 실행성 근거, 다음 개선, ID 중복, 필수 문서·Flyway 133개 검사.

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
- `r`npm.cmd run docs:check` 통과: 다음 개선 내용, 실행성 근거, ID 중복, 필수 문서·Flyway 133개 검사.

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
- `r`npm.cmd run docs:check` 통과: 실행 명령 포함 여부, 최신 기록 계약, ID 중복, 필수 문서·Flyway 133개 검사.

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
- `r`npm run docs:check` 통과: 최신 기록 계약, ID 중복, 성과 근거, 필수 문서·Flyway 133개 검사.

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
- `r`npm run docs:check` 통과: 최신 기록 계약, 전체 ID 중복, 필수 문서·Flyway 133개 검사.

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
- `r`npm run docs:check` 통과: 최신 로그 값, 필수 문서, Flyway 133개 검사.

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
- `r`npm run docs:check`로 최신 기록 계약과 필수 문서·Flyway 검사를 확인한다.

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
- `r`npm run docs:check` 통과: 문서 계약 및 Flyway 133개 검사.
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
- `r`npm run docs:check` 통과: 필수 문서 16개, Flyway 133개 확인.
- 커밋·푸시·배포: 미실행.

## [2026-09-13] 지속 개선 운영 루프 강화

### 목표
- 운영 결과가 개선 과제로 연결되고 반복 오류가 자동 검증으로 승격되는 구조를 만든다.

### 반영
- `docs/operations/continuous-improvement.md`에 개선 루프, 영역별 관찰 지표, 과제 템플릿, 회고 규칙을 추가했다.
- `docs/README.md`와 배포 체크리스트에서 지속 개선 기준으로 연결했다.
- `scripts/check-docs.mjs`가 지속 개선 운영 기준 문서의 존재를 검사하도록 했다.

### 검증
- `r`npm run docs:check` 통과: 필수 문서 15개, Flyway 133개 확인.
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
- `git diff --check` 통과.
- `r`npm.cmd run verify` 통과: 152개 테스트 파일·502개 테스트, 타입체크, 문서 검사, 검증 범위 감사, KIS 경계 감사, cron 검사, Next.js 프로덕션 빌드 성공.

근거: 표준 `verify` 명령 정의에 감사 단계가 포함되고, 개별 감사·문서·diff 검증이 모두 종료 코드 0으로 완료됐다.

### 다음 개선

- 전체 `r`npm.cmd run verify`를 실행해 새 검증 단계가 기존 테스트·빌드 흐름과 함께 통과하는지 재확인한다.

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
- `git diff --check` 통과.

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
- `git diff --check` 통과.

근거: 정상·실패 경로 3개가 모두 의도한 종료 상태와 오류 메시지를 검증하고, 문서·diff 검사도 종료 코드 0으로 완료됐다.

### 다음 개선

- 전체 `r`npm.cmd run verify`에 새 감사 단위 테스트가 포함되는지 확인하고, 테스트 실행 시간을 측정해 검증 파이프라인 비용을 기록한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-031
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-032

### 목표

승인 범위 감사 단위 테스트가 실제 배포 전 표준 검증 흐름에 포함되고, 전체 빌드 게이트를 통과하는지 확인한다.

### 반영

- 새 감사 테스트가 `r`npm test -- --run`의 전체 Vitest 수집 대상에 포함됨을 확인했다.
- 전체 검증 결과를 개선 로그의 재현 가능한 근거로 기록한다.

### 검증

- `r`npm.cmd run verify` 통과.
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
- `git diff --check` 통과.

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

- `r`npm.cmd run measure:verify -- --out reports/verify-measured-2026-09-13.json`을 실행했다.
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
- `git diff --check` 통과.

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

- `r`npm.cmd run audit:verify-scope` 통과.
- `r`npm.cmd run docs:check` 통과.
- `r`npm.cmd run compare:verify -- reports/verify-baseline-2026-09-13.json reports/verify-measured-2026-09-13.json 0.2` 통과.
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
- `git diff --check` 통과.

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

- `r`npm.cmd run measure:verify -- --out reports/verify-measured-2026-09-13-metadata.json` 통과.
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
- `git diff --check` 통과.

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
- `git diff --check` 통과.

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

- `r`npm.cmd run measure:verify -- --out reports/verify-measured-2026-09-13-shell-fix.json` 통과.
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
- `git diff --check` 통과.

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
- `git diff --check` 통과.
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

- `r`npm.cmd run deploy:verify`를 실행했다.
- 테스트 임시 저장소 경고가 최소화된 상태에서 배포 검증을 확인했다.

### 검증

- `r`npm.cmd run deploy:verify` 통과.
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
- `git diff --check` 통과.

근거: 배포 검증 quality gate에 두 감사 명령이 표준 verify와 동일한 순서로 포함됐다.

### 다음 개선

- `r`npm.cmd run deploy:verify`를 재실행해 추가 감사 단계가 실제 배포 검증과 production smoke test를 통과하는지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-045
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-046

### 목표

배포 검증 게이트에 추가한 감사 단계 이후 production build와 runtime smoke test가 정상 종료되는지 확인한다.

### 반영

- `r`npm.cmd run deploy:verify`를 실행했다.
- 테스트·타입체크·문서·승인 범위 감사·KIS 경계 감사·cron 검사는 모두 통과했다.

### 검증

- `r`npm.cmd run deploy:verify` 실행 중 quality gate 통과 확인.
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
- `git diff --check` 통과.

근거: 배포 검증 실행 경계에 시작·진행·완료 로그와 경과 시간 계산이 구현됐다.

### 다음 개선

- 실제 `r`npm.cmd run deploy:verify`를 실행해 진행 로그가 quality gate·build·runtime 단계에 표시되는지 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-048
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-13 — CI-2026-09-13-049

### 목표

배포 검증의 단계별 진행 로그가 실제 장시간 build를 구분하는 데 유효한지 검증한다.

### 반영

- `r`npm.cmd run deploy:verify`를 실행했다.
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
- `git diff --check` 통과.
- `.next-*/` ignore 규칙이 `.next-deploy-verify`에 적용됨을 확인.

근거: build와 runtime이 동일한 전용 `verifyDistDir`를 사용하도록 코드 경계를 일치시켰다.

### 다음 개선

- `r`npm.cmd run deploy:verify`를 다시 실행해 전용 산출물 경계에서 build 완료와 `/charts` smoke test까지 확인한다.

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
- `git diff --check` 통과.
- 기존 배포 검증에서 발견된 `EADDRINUSE` false positive 원인을 코드 경로로 재현·해결했다.

근거: smoke test 포트가 실행 시 새로 확보되므로 기존 프로세스가 health 응답을 가로채는 경로가 제거됐다.

### 다음 개선

- `r`npm.cmd run deploy:verify`를 다시 실행해 동적 포트에서 production 서버 시작과 `/charts` 응답을 실제로 검증한다.

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

- `r`npm.cmd run deploy:verify`에서 quality gate·build 통과.
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
- `git diff --check` 통과.

근거: smoke test의 성공 조건과 실패 진단 정보가 코드에 명시적으로 반영됐다.

### 다음 개선

- production 서버를 동적 포트로 실행하는 `r`npm.cmd run deploy:verify`를 재실행해 HTML 본문 검증까지 통합 확인한다.

### 개선 과제

- 개선 과제 ID: CI-2026-09-13-053
- 성과 판정: IMPROVED
- 커밋·푸시·배포: 미실행
## 2026-09-17 — 해외 상승률 후보 시총 필터 보완 조회

- 목적: 공통 시총 필터가 시총 미상 후보를 실제 DB 값으로 보완하지 못하는 결함 수정.
- 근본 원인: `applyCommonMarketCapFilter`의 보완 조회 블록이 비어 있어 `marketCap`이 없는 후보가 항상 미상으로 남음.
- 변경: `lib/us-top-rising-universe.ts`에서 시총 누락 후보의 거래소·티커만 일괄 조회하고, 기존 시총 값이 있는 후보에는 추가 DB 조회를 하지 않도록 수정. 조회 실패 시 보수적으로 필터링.
- 재발 방지: 공통 필터는 후보별 DB 조회를 반복하지 않고 배치 조회하며, 시총 조건이 비활성화된 경우 즉시 반환한다. 관련 전체 테스트·타입체크·빌드·실행 검증을 커밋 전 수행한다.
- 검증: `r`npm.cmd run deploy:verify` 통과 (156개 테스트 파일·521개 테스트, 타입체크, 문서/범위/KIS 경계/cron 검사, Next 빌드 및 런타임 smoke test).
- 커밋·푸시·배포: 커밋·푸시 진행 예정; 운영 배포는 CI 성공 확인 후 상태를 갱신한다.

## 2026-09-17 — 해외 상승률 후보 시총 중복 조회 제거

- 목적: 실시간 상승률 경로에서 동일 시총 배치 조회가 반복되는 병목 제거.
- 원인: 공통 필터가 `marketCap: null`(조회 완료했지만 시총 미상)과 필드 미설정(미조회)을 구분하지 못함.
- 변경: `lib/us-top-rising-universe.ts`에서 `marketCap` 필드가 없는 후보만 보완 조회하도록 수정.
- 재발 방지: 조회 완료 후 미상인 값은 보완 조회 대상으로 다시 넣지 않으며, 조건 비활성화 시 즉시 반환한다.
- 검증: `r`npm.cmd run deploy:verify` 통과 (156개 테스트 파일·521개 테스트, 타입체크, 문서/범위/KIS 경계/cron 검사, Next 빌드 및 런타임 smoke test).
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
- 검증: `r`npm.cmd run deploy:verify` 통과 (156개 테스트 파일·521개 테스트, 타입체크, 문서/범위/KIS 경계/cron 검사, Next 빌드 및 런타임 smoke test).
- 커밋·푸시·배포: 검증 후 커밋·푸시 진행; 운영 배포는 CI 결과 확인 대상.

## 2026-09-17 — CSS 정렬 값 호환성 경고 제거

- 목적: 빌드 로그의 반복적인 `autoprefixer` 경고 제거.
- 원인: `align-items: end`가 브라우저별 혼합 지원 값으로 판정됨.
- 변경: `app/globals.css`의 달력·공시 컨트롤을 표준 `flex-end`로 변경.
- 검증: `r`npm.cmd run build` 성공, 기존 전체 테스트·타입체크·문서/범위/KIS 경계/cron 검사는 통과했다. standalone 실행 후 `/charts`·`/health-check`·국내/해외 top-rising API를 직접 호출해 HTML/JSON 응답을 확인했으며, 해외 API의 로컬 DB 미설정 502도 구조화 JSON으로 반환됨을 확인했다. 배포 검증 스크립트는 해외 API 대기 단계에서 장시간 지연되어 중단했으므로 해당 지연은 별도 개선 대상으로 남긴다.
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
- 원인: `scripts/dev-server.mjs`가 `r`next` 명령을 `shell: true`로 실행하고 있었다.
- 변경: 프로젝트의 Next 실행 파일을 `process.execPath`로 직접 실행하고 `shell: false` 및 시작 오류 처리를 적용했다.
- 재발 방지: 로컬 실행은 `.env.local` 주입을 유지하면서 셸을 통하지 않는 고정 인자 배열만 사용한다.
- 검증: 변경 후 전체 테스트·타입체크·문서·빌드·standalone 실행 스모크를 재실행한다.
- 커밋·푸시·배포: 전체 검증 후 커밋·푸시한다.

## 2026-09-17 — 스크리너 null 기준일 파라미터 오류 수정

- 목적: 로컬 `/api/screener/run`의 조건 없는 해외 요청이 503으로 실패하는 오류를 수정한다.
- 원인: `asOf`가 `r`null`일 때 SQL의 `$2 IS NULL` 표현식에 PostgreSQL 타입 정보가 없어 `could not determine data type of parameter $2`가 발생했다.
- 변경: `lib/db-screener.ts`의 기준일 비교식에 `$2::text`를 명시해 null·문자열 기준일 모두 동일하게 처리한다.
- 검증: 로컬 실제 API에서 수정 전 503을 재현했고, 수정 후 해외 요청 200(`server-timing` 약 1.84초), 동일 요청 캐시 적중 200·약 1ms를 확인했다.
- 재발 방지: 기준일이 없는 기본 스크리너 요청과 동일 fingerprint 캐시 적중을 API 실행 검증에 포함한다.
- 커밋·푸시·배포: 전체 검증 후 커밋·푸시한다.

## 2026-09-17 — 기준일 스크리너 병목 실측

- 목적: 추가 병목 후보를 실제 DB 실행계획으로 확인한다.
- 확인: `r`npm.cmd run measure:screener-db` 5회 반복 결과, 해외 기준일 최신일 집계가 p50 약 1.26~1.33초·p95 최대 6.35초·약 20만 shared read blocks로 가장 큰 잔여 병목이었다. 최신 요약 테이블은 p50 1ms 미만 수준이었다.
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
- 검증: `r`node --env-file=.env.local scripts/validate-nys-pullback-volume-bullish-75.cjs` 실DB 읽기 검증 완료.
- 재발 방지: 다음 검증은 score 기준을 더 낮추는 대신 시계열 분할·거래비용·시장별 외부검증을 포함해 과적합 여부를 확인한다.
- 커밋·푸시·배포: 없음.

## 2026-09-17 — 관리자 시장 디버그 인벤토리 병렬화

- 목적: 운영 DB 규모 증가 시 `/api/admin/market-debug` 응답시간 누적을 줄인다.
- 원인: 네 개의 대형 테이블 `COUNT(*)`를 순차 실행해 각 스캔 시간이 합산됨.
- 변경: `app/api/admin/market-debug/route.ts`에서 테이블별 count를 `Promise.all`로 실행하고, 개별 실패 격리는 유지한다.
- 재발 방지: 응답 구조와 정확한 count 의미는 유지하며, 독립적인 읽기 쿼리만 병렬화한다.
- 검증: `r`npm.cmd run deploy:verify` 통과 (156개 테스트 파일·521개 테스트, 타입체크, 문서/범위/KIS 경계/cron 검사, Next 빌드 및 런타임 smoke test).
- 커밋·푸시·배포: 검증 후 커밋·푸시 진행; 운영 배포는 CI 결과 확인 대상.
## 2026-09-18 — EMA 중첩 가중치 방식 비교

- 목적: EMA2~365 겹침 지점에서 단순 개수, 장기 EMA 가중, 최근 EMA 가중, 로그 장기 가중을 동일 표본에 적용해 승률 우위를 비교한다.
- 조건: NYSE 보통주, 최근 301개 일봉, 가격이 EMA의 ±1% 이내이고 EMA가 3봉 전보다 상승, RVOL(SMA20) 1.0~1.2, 다음 거래일 저가 재테스트·거래량 회복·양봉 확인, 다음 종가 진입 후 5거래일 +1% 대 -1% 선행 도달.
- 결과: 전체 후보 9,149건. 상위 10% 기준 단순 42.41%/평균 -0.1518%, 장기 선형 가중 41.88%/-0.1624%, 최근 역수 가중 43.08%/-0.1384%, 로그 장기 가중 42.22%/-0.1556%.
- 상위 20% 기준 단순 42.48%/-0.1504%, 장기 선형 40.44%/-0.1912%, 최근 역수 42.83%/-0.1433%, 로그 장기 41.40%/-0.1720%.
- 판단: 이 표본과 진입 규칙에서는 장기 EMA에 가중치를 줄수록 성과가 악화됐다. 최근 EMA 역수 가중이 네 방식 중 가장 높지만 절대 승률은 43% 수준이고 평균 손익도 음수라 실전 우위로 채택하지 않는다.
- 검증: `r`node --env-file=.env.local scripts/analyze-us-ema-weighted-overlap.cjs` 실DB 읽기 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 근접도 가중 검증

- 목적: EMA 겹침 개수를 동일하게 세는 방식에서 벗어나 가격에 가까운 EMA일수록 높은 점수를 주는 방식과 장·단기 가중 방식을 비교한다.
- 조건: NYSE 보통주, 최근 301개 일봉, EMA2~365와 종가의 ±1% 겹침, RVOL(SMA20) 1.0~1.2, 다음 거래일 시가 진입, 5거래일 내 +0.5% 선행 도달 대 -1% 선행 도달.
- 상위 10% 결과: 단순 개수 승률 49.60%·평균 -0.2560%, 근접도 가중 49.39%·-0.2591%, 최근 EMA 근접도 가중 50.66%·-0.2401%, 장기 EMA 근접도 가중 47.97%·-0.2805%.
- 상위 20% 결과: 단순 48.56%·-0.2717%, 근접도 48.61%·-0.2709%, 최근 가중 49.86%·-0.2521%, 장기 가중 46.93%·-0.2961%.
- 판단: 최근 EMA 근접도 가중만 승률 50%를 소폭 넘었지만 손익비를 반영한 평균 손익은 음수다. 장기 EMA 가중은 이번에도 가장 약했다. 승률만 높이는 방식과 기대값이 양수인 방식은 분리해서 판단해야 한다.
- 검증: `r`node --env-file=.env.local scripts/analyze-us-ema-overlap-closeness.cjs` 실DB 읽기 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — 최근 EMA 근접도 점수 시계열 분할 검증

- 목적: 최근 EMA 근접도 가중 점수가 과거 표본에만 맞는지 시간순 외부 검증한다.
- 조건: NYSE 보통주, 종목별 최근 301개 일봉, EMA2~365 겹침 근접도에 1/√기간 가중, RVOL(SMA20) 1.0~1.2, 종가 아래 재테스트, 다음 거래일 시가 진입, 5거래일 +0.5% 대 -1% 선행 도달. 종목별 과거 60%와 최근 40% 분리 후 각 구간 상위 10%만 평가.
- 결과: 전체 5,184건 중 판정 5,098건, 승률 44.33%, 평균 손익 -0.3350%. 학습 구간은 2,995건·45.28%·-0.3209%, 테스트 구간은 2,104건·42.92%·-0.3562%.
- 판단: 최근 구간에서 성과가 더 악화되어 해당 가중 점수는 일반화된 승률 우위가 아니다. 향후 채택 후보에서 제외하고, 다른 신호와 결합할 때도 별도 검증 대상으로만 둔다.
- 검증: `r`node --env-file=.env.local scripts/validate-us-ema-recent-weighted-split.cjs` 실DB 읽기 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 허용오차별 반등 검증

- 목적: EMA 겹침을 정의하는 가격 허용오차가 반등률에 영향을 주는지 확인한다.
- 조건: NYSE 보통주, 일봉 최근 301개, EMA2~365, RVOL(SMA20) 1.0~1.2, 다음 거래일 고가가 신호 종가 대비 +0.5% 이상인지를 반등으로 정의. 각 허용오차별 겹침 점수 상위 10% 비교.
- 결과: ±0.25% 45,381건 중 45,38건 평가·반등률 71.15%, ±0.5% 53,196건·72.23%, ±1.0% 63,178건·72.53%, ±1.5% 67,762건·73.24%, ±2.0% 69,581건·73.50%.
- 판단: 허용오차를 넓힐수록 상위 점수군의 단순 다음날 고가 반등률은 높아졌지만, 이는 EMA가 많아지는 효과와 가격 범위 확장의 영향을 함께 받는다. 손절·거래비용을 포함한 전략 승률로 바로 해석하지 않으며, 좁은 겹침이 특별히 우월하다는 증거도 없다.
- 검증: `r`node --env-file=.env.local scripts/analyze-us-ema-overlap-tolerance.cjs` 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 상위군 캔들 구조 필터 검증

- 목적: EMA 겹침 상위군에 신호일 양봉·캔들 상단 종가 조건을 추가했을 때 다음날 반등률이 개선되는지 확인한다.
- 조건: NYSE 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 10%, RVOL(SMA20) 1.0~1.2, 다음날 고가가 신호 종가 대비 +0.5% 이상이면 반등.
- 결과: 필터 없음 6,317건·72.53%, 신호일 양봉 2,972건·70.66%, 종가가 고가·저가 중간값 이상 2,897건·70.07%, 두 조건 모두 2,373건·70.50%.
- 판단: 캔들 양봉 및 상단 종가 필터는 단순 반등률을 개선하지 못했고 오히려 약화됐다. 해당 필터는 현재 방식에 추가하지 않는다.
- 검증: `r`node --env-file=.env.local scripts/analyze-us-ema-overlap-candle-filter.cjs` 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 상위군 RVOL 구간 검증

- 목적: EMA 겹침 상위군에서 거래량 강도가 반등률을 개선하는지 RVOL 구간별로 확인한다.
- 조건: NYSE 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 10%, RVOL(SMA20) 구간별, 다음날 고가가 신호 종가 대비 +0.5% 이상이면 반등.
- 결과: RVOL 1.0~1.2는 6,317건·72.53%, 1.2~2.0은 7,004건·72.99%, 2.0 이상은 1,496건·66.31%.
- 판단: 중간 수준의 거래량 증가는 소폭 개선됐지만 RVOL 2 이상 급증 구간은 반등률이 크게 낮아졌다. 거래량 급증을 무조건 강한 매수 신호로 사용하면 안 된다.
- 검증: `r`node --env-file=.env.local scripts/analyze-us-ema-overlap-rvol-buckets.cjs` 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침 반등의 종가 확인 검증

- 목적: EMA 겹침 상위군의 높은 다음날 고가 반등률이 장중 반등에 그치는지 다음날 종가로 확인한다.
- 조건: NYSE 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 10%, RVOL 구간별. 고가 반등은 다음날 고가가 신호 종가 대비 +0.5% 이상, 종가 확인은 다음날 종가가 신호 종가 초과.
- 결과: RVOL 1.0~1.2는 고가 72.53%·종가 50.78%, 1.2~2.0은 고가 72.99%·종가 50.80%, 2.0 이상은 고가 66.31%·종가 49.93%.
- 판단: 기존의 높은 반등률 대부분은 장중 고가 도달률이며 종가 기준 우위는 약 51%로 축소된다. `EMA 겹침 + RVOL 1.2~2.0`을 고승률 전략으로 확정할 근거는 부족하다.
- 검증: `r`node --env-file=.env.local scripts/analyze-us-ema-overlap-close-confirm.cjs` 실행 완료.
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
- 검증: `r`node --env-file=.env.local scripts/validate-us-ema-overlap-pnl.cjs` 실DB 읽기 실행 완료.
- 커밋·푸시·배포: 없음.
## 2026-09-18 — EMA 겹침과 재테스트 확인 조건 결합 손익 검증

- 목적: EMA 겹침 상위군에 다음날 재테스트·거래량 회복·양봉 확인을 결합하면 실제 손익이 개선되는지 검증한다.
- 조건: 미국 전체 거래소 보통주, 일봉 최근 301개, EMA2~365 ±1% 겹침 점수 상위 10%, RVOL 구간별, 다음날 저가가 신호 종가 이하·거래량이 신호일 이상·양봉인 경우 다음날 종가 진입, 이후 5거래일 +1% 대 -1%.
- 결과: RVOL 1.0~1.2는 1,687건 판정·승률 39.66%·평균 -0.2069%, 1.2~2.0은 1,442건·36.89%·-0.2621%, 2 이상은 233건·30.47%·-0.3906%.
- 판단: 해당 확인 조건은 이전 단일 점수95 NYSE 실험과 달리 전체 거래소·상위 겹침 점수에서는 성과를 악화시켰다. 표본·시장 범위·진입 시점에 따라 결과가 크게 달라지므로 일반화된 고승률 조건으로 채택하지 않는다.
- 검증: `r`node --env-file=.env.local scripts/validate-us-ema-overlap-confirmed-pnl.cjs` 실DB 읽기 실행 완료.
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

- `r`npm run typecheck` 통과.
- `r`npm run docs:check` 통과.
- 운영 `GET /api/kis/intraday-mvp`에서 워커 `RUNNING`, `lastTickAt` 갱신, TOP100 후보 관측을 확인했다.
- 배포 실행 `35731972698`이 성공했고 운영 `/intraday` HTTP 200 및 API JSON 응답을 확인했다. 배포 직후 API는 워커 `WARMING_UP`·`detectionEnabled=true`·`explicitKillSwitch=false`로 반환됐다.
- Discord 알림 결과가 기존에는 워커 내부에서 소실되던 문제를 확인해 보강했다. 웹훅 원문은 노출하지 않고 전송 성공·미설정·실패 상태만 런타임에 기록한다.
- 로컬 `NEXT_DIST_DIR=.next-local-final npm run build` 성공. 운영 API에서 5샘플을 충족한 `QUALIFIED` 후보 6개를 확인했으며, 배포 후 `lastAlertResult`로 전송 결과를 확인한다.
- 추가 원인: 후보가 없는 tick이 `lastAlertResult`를 `r`no_qualified_items`로 덮어써 실제 알림 tick의 결과가 사라졌다. 알림이 발생한 tick에서만 전송 결과를 유지하도록 수정했다.

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
- **변경·검증**: 제품 코드 및 DB 스키마 변경 없음. 입력 JSON과 조사 스크립트는 `.tmp`에, 작업 이력은 본 로그에 기록. `r`npm run docs:check`를 실행한다. 커밋·푸시·배포 없음.

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
- **문서/코드 검증**: 리스크 JSON 파싱 및 근거 quote 길이 확인. 제품 코드·스키마 변경 없음. 다음 `r`npm run docs:check`로 문서 게이트를 실행한다. 커밋·푸시·배포 없음.

## [2026-09-30] DSS SEC 리스크 확인·시장코드 정정

- **목적**: 미등록 후보 DSS의 2026-09-30~2026-10-07 SEC 리스크를 공식 공시와 최신 가용 운영 차트로 확인하고 저장한다.
- **사전 조회**: 운영 리스크 API에서 `AMS:DSS`는 기존 리스크가 있었고 `NYS:DSS`는 미등록이었다. 운영 차트 API의 최신 이용 가능 값은 2026-09-29 종가 $0.682, USD 시가총액 $6,813,836(관측 `2026-09-29T18:06:37.802Z`)이다.
- **SEC 근거·분류**: 2026-09-21 8-K(accession `0001493152-26-043561`)는 9/15 특수관계자 Alset의 $500,000 대여, 요구불·연 3% 약속어음, 주당 $0.50 전환, 최대 8,000,000주·주당 $0.55 워런트와 전환·행사 전 주주승인 조건을 공시한다. 계약서와 워런트 원문을 대조했다. 10/1~10/7 주주투표, 상환요구, 전환·행사 일정은 확인되지 않아 이를 확정 이벤트로 쓰지 않고 지속 중인 조건부 유동성·희석 익스포저로 표시했다. $500,000 자금 유입과 향후 상환·잠재 희석을 함께 반영해 MIXED로 분류했다.
- **시장코드 오류와 복구**: 첫 저장에서 NYSE American DSS를 NYS로 잘못 매핑했다. 기존 운영 데이터 및 프로젝트 시장코드가 `AMS:DSS`임을 확인한 즉시 `AMS` 기존 DSS 항목을 갱신해 ACTIVE로 저장하고, API가 삭제 endpoint를 제공하지 않는 관계로 잘못 생성한 `NYS:DSS` 항목은 정정 목적의 `RESOLVED`로 표시했다. 사후 GET 양쪽에서 `AMS:DSS` ACTIVE, `NYS:DSS` RESOLVED를 검증했다. 다음 종목 저장 전 거래소/프로젝트 시장코드 사전 확인을 필수로 한다.
- **변경·검증**: 조사 입력 `.tmp/sec-risk-dss-20260930.json`, 정정 입력 `.tmp/sec-risk-dss-market-correction-20260930.json`. 운영 PATCH 성공(2건), 사후 GET 성공. API의 최상위 시총 메타데이터는 null로 반환되므로 시총은 JSONB 설명·limitations와 로컬 차트 관측으로만 보고한다. 제품 코드·스키마 변경 없음. `r`npm.cmd run docs:check` 실행 예정. 커밋·푸시·배포 없음.
- **후보 재대조 및 문서 게이트**: 당시 작업 후보 목록을 시장별 API 제한 이내로 재조회한 결과 AMS 5개 중 5개, NAS 94개 중 87개가 여전히 미등록이었다. 목록은 이전 스냅샷이므로 이후 저장된 7개가 반영되어 미등록 합계는 92개다. `r`npm.cmd run docs:check` 통과(18 entry points, migrations 143개, latest V143). 전체 후보 검토는 계속 진행 중이며 이번 배치만으로 완료 처리하지 않았다.

## [2026-09-30] SEC 신규 공시 재점검 및 BIYA 계속기업 위험 반영

- **목적·범위**: 운영 SEC 리스크 API에 저장되지 않은 미국 소형주 후보와 SEC submissions 최신 응답을 대조해 현재 유효 위험을 갱신한다. 사용자 요청의 7일 관찰창은 2026-09-30~2026-10-07이며, 지속 중인 위험과 해당 창 안의 확정 이벤트를 구분한다.
- **대상·운영 조회**: 직전 운영 census에서 누락으로 분류된 81개 ticker의 운영 fundamental snapshot을 재조회했다(5 GET, 81/81 응답, 오류 0). 관측일은 2026-09-29이며 USD 시총 1천만 달러 이하 80개, 초과 XCH 1개였다. 이 80개 중 저장 여부를 다시 확인한 결과 BIYA만 이미 저장됐고 79개는 미등록이었다. 시총은 최신 이용 가능 스냅샷이며 9/30 실시간 값으로 표현하지 않는다.
- **SEC submissions 비교**: 공식 `data.sec.gov/submissions/CIK*.json` 81건을 프로젝트 `lib/sec-edgar-client.ts`의 8 req/s 제한 및 `.env.local` User-Agent로 조회했다(81/81, 오류 0). universe cutoff 이후 신규 제출 6건은 BIYA·EHGO·ENSC·LGHL·LNAI·MI였다. 나머지 75개에는 해당 cutoff 뒤 submissions 신규 제출이 없었다. 이 사실은 기존 위험이 없거나 유효하지 않다는 증거로 해석하지 않는다.
- **BIYA 판정·저장**: 2026-09-29 6-K(accession `0001213900-26-104687`) 및 Exhibit 99.1~99.3을 읽었다. 회사는 반기 재무제표에 향후 1년 내 계속기업 존속 능력에 상당한 의문이 있다고 명시했다. 6/30 현금 $1,181,159, 6개월 계속사업 영업현금 유출 $983,857, 총 순손실 $2,428,242, 운전자본 $26,385,663를 함께 기재했고, 전년 대비 손실 개선도 반대 근거로 보존했다. 이를 구체적 7일 내 부도·자금조달 사건으로 과장하지 않고 지속 위험 `HIGH/NEGATIVE/ACTIVE`로 운영 API에 저장했다. schemaVersion 2 JSONB에는 영어 원문·한국어·SEC 근거 3건·관찰일·관찰창·limitations를 담았다. PATCH 성공 후 GET에서 `missing=[]`, 해당 riskId와 `ACTIVE`를 검증했으며, 한국어 표기 오탈자를 추가 PATCH로 정정했다.
- **신규 제출 검토**: LNAI Form 12b-25는 10-K 제출 연장기한이 10/13이므로 10/7 관찰창 밖이며 신규 7일 이벤트로 반영하지 않았다. ENSC 9/25 Certificate of Amendment는 Series C의 특정 현금상환 조항 삭제가 이미 효력 발생했다고 보고한다. MI Schedule 13G/A는 9/23 기준 기관 보유 4.9% 보고다. EHGO 6-K는 임시주총 위임장·정관 문서를 첨부한다고 알리며 본문에 일정·안건 상세를 싣지 않았다. LGHL 6-K는 $3m 담보 전환어음 거래를 기재하지만 서술된 종결일이 2025-09-28이고 첨부 어음 조건의 현재 잔액·만기 확인이 필요하다. 본문 외 첨부 자동조회는 SEC가 현재 요청을 미등록 자동화로 차단해 검증하지 못했다. 따라서 첨부만으로 확인해야 하는 EHGO 주총 일정 및 LGHL 현재 상환·전환조건은 저장하지 않았고, 해당 종목을 무위험이라고 단정하지 않는다.
- **SEC 요청 한계와 재발 방지**: `.env.local`의 `SEC_USER_AGENT`는 현재 `Stockman/1.0` 식별자와 도메인만 포함하고 연락 이메일이 없어, SEC Archives 원문/첨부 요청이 자동화 미등록 메시지로 차단됐다. submissions GET은 성공했지만 `data.sec.gov` submissions 호스트를 Archives 호스트로 잘못 사용한 실험 5건은 HTTP 404였다. 공식 SEC 개발자 안내와 프로젝트 문서의 식별 규칙에 맞춰 실제 운영자 연락처가 포함된 User-Agent를 설정한 뒤 원문 재수집을 이어간다. 연락처를 추측해 설정하거나 403 응답을 반복 재시도하지 않는다. 이전 자동화 실패 산출물 `.tmp/sec-three-month-unregistered-date-matches-20260930.json`도 있으므로, 3개월 전체 원문 검토는 완료되지 않았다.
- **변경·검증**: 제품 코드·DB schema 변경 없음. 운영 API에는 BIYA 1건 저장 및 한국어 표기 정정(PATCH 2회), 사후 GET 성공. 조사 산출물은 `.tmp/sec-risk-biya-20260930.json`, `.tmp/sec-risk-biya-post-verify-20260930.json`, `.tmp/sec-risk-unregistered-current-fundamentals-20260930.json`, `.tmp/sec-risk-unregistered-new-submissions-20260930.json`, `.tmp/sec-selected-filings-raw.json`에 둔다. `DEVELOPMENT_LOG.md` 갱신 후 `r`npm.cmd run docs:check`를 실행한다. 커밋·푸시·배포 없음.
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
- **변경·검증**: 운영 DB만 SEC 리스크 API로 갱신; 제품 코드·마이그레이션 변경 없음. 입력 `.tmp/sec-risk-sckt-20260930.json`, `.tmp/sec-risk-ipst-nxts-rkda-20260930.json`, `.tmp/sec-risk-chai-bttc-20260930.json`, `.tmp/sec-risk-cwd-20260930.json`; 최신 제출 재검증 `.tmp/sec-latest-submissions-priority.json`. `DEVELOPMENT_LOG.md` 갱신 후 `r`npm.cmd run docs:check` 실행. 커밋·푸시·배포 없음.

### 구현 반영

- **변경 파일**: `scripts/sync-daily-cache-async.mjs`
- **구현**: 운영 API 조회 워커와 로컬 DB 저장 워커를 bounded queue로 분리했다. 조회 동시성, 저장 동시성, 큐 최대 크기, batch 크기를 실행 인자로 제한할 수 있다.
- **무결성**: 저장 워커는 batch 트랜잭션으로 upsert하고 commit 후 다음 작업을 처리한다. `--skip-fundamentals=true`로 시총 API 장애가 일봉 저장을 차단하지 않게 할 수 있다.
- **검증**: `r`node --check scripts/sync-daily-cache-async.mjs` 통과. 초기 smoke 실행에서 producer-consumer 종료 순서 문제를 확인해 consumer를 producer보다 먼저 시작하도록 수정했다. 전체 운영 동기화는 실행하지 않았다.
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
