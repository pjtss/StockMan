# 미국 보통주 산업분류 코드 KIS 전용 수집·저장 설계

상태: 2026-10-25 전체 KIS 후보 동기화 및 운영 read-after-write 전수 검증 완료; KIS 원본 `000`의 공식 미분류 한계는 잔존
기준일: 2026-10-25

## 범위와 원칙

- 우선 분류코드는 한국투자증권(KIS)의 NAS/NYS/AMS 해외주식 마스터 `icod`다.
- 활성 미국 보통주에서 KIS `icod`가 비었거나 all-zero인 경우에만 SEC EDGAR Submissions의 `sic`/`sicDescription`을 보조 원천으로 사용한다. SEC SIC와 KIS ICOD는 서로 다른 분류 체계이므로 숫자 코드만으로 동일하다고 비교하거나 변환하지 않는다.
- SEC 대체 코드는 `industry_code`에 넣고 `source_file`을 `SEC_EDGAR_SIC:<10자리 CIK>`로 기록해 출처를 구별한다. 기존 비영 KIS ICOD를 SEC 값으로 덮어쓰지 않는다. 뒤이은 KIS 재동기화도 원본 `icod=000`일 때 이미 저장된 SEC SIC를 보존하며, 유효한 KIS 코드가 새로 들어오면 KIS 코드로 대체한다.
- SEC ticker/CIK 매핑이 유일하고 EDGAR SIC가 3~4자리 비영 숫자일 때만 저장한다. 운영 시장 기준 ticker 매핑을 우선하며, 해당 시장 매핑이 없으면 SEC 공식 미국 거래소 ticker 전체에서 CIK가 하나로 유일한 경우에만 교차거래소 fallback을 허용한다. 모호한 티커, 누락 SIC, 잘못된 값, SEC 오류는 fail-closed로 미분류 상태를 유지한다.
- KIS 원본의 빈 값·`000`은 SEC SIC 대체값이 성공할 때만 보조 코드로 채운다. 회사명만으로 산업을 추정하지 않는다.
- KIS의 전체 마스터 common 후보를 `us_common_stock_universe`에 upsert한다. KIS 원본 후보 밖의 이전 활성 common 행은 삭제하지 않고 비활성화한다. 분류가 불확실한 행은 fail-closed로 활성 공통주에서 제외하고 이력을 보존한다.

## 조사에서 확인한 결함과 원본 근거

KIS 공식 헤더는 `icod` 필드 길이를 4로 정의한다. 기존 저장 동기화와 진단 집계는 코드 형식을 정확히 3자리로 제한했으므로, 향후/특정 원천에서 정상적인 4자리 숫자 업종코드가 제공되면 미분류로 잘못 집계될 수 있었다. `isValidKisUsIndustryCode()`를 단일 검증기로 두고 1~4자리 숫자를 허용하며 `000`/`0000` 등 전부 0인 값은 미분류로 유지한다. 현재 보관·운영 대조 파일에서 관측된 코드는 3자리와 `000`뿐이며, 4자리 처리는 공식 필드 폭에 맞춘 회귀 방어다.

이 파서 폭 수정은 현재 운영 universe 차이(활성 공통주 1,436건 및 KIS 후보 미매칭 90건)의 원인을 해소했다고 의미하지 않는다. 이름 추정으로 종목을 보통주로 추가하거나 비활성화하지 않는다. 해당 차이는 원천 분류 및 테이블 상태를 별도로 확인해야 한다.

해외 마스터는 24개 탭 구분 필드다. 프로젝트의 KIS 헤더 정의 및 보관 원본에서 확인한 0-base 필드는 `isdr=f[17]`, `icod=f[19]`, `sjong=f[20]`, `etyp=f[22]`, `ttyp_sb=f[23]`다. 기존 `parseOverseas()`는 `industryCode=f[23]`, `isDr=f[20]`, `etpType=f[24]`를 읽어 산업 코드와 상품 필터 데이터까지 잘못 판정할 수 있었다.

2026-08-18 원본에서 NAS 기준 AAPL `730`, MSFT `720`, NVDA `710`, TSLA `310`, AAAP `000`을 확인했다. KIS 마스터 전체 12,725행의 `000` 외 코드 수는 NAS 1,405/5,243, NYS 1,309/2,857, AMS 105/4,625였다. 이 수치는 보관 원본 전체 행 기준이며 보통주 분모나 최신 운영 DB 결과로 오인하면 안 된다.

또한 일반 전체 마스터 적재의 미국 `ON CONFLICT DO UPDATE`에서 `industry_code`가 빠져 있어 파서가 올바르더라도 기존 DB 값은 갱신되지 않을 수 있다.

## 저장·동기화 계약

- KIS `icod`는 기존 `us_common_stock_universe.industry_code`에 저장한다. 새 산업코드 컬럼이나 다른 분류 체계는 추가하지 않는다.
- 전체 종목 마스터 재분류를 부수적으로 실행하지 않도록 산업코드 전용 동기화 API가 세 KIS 거래소 원본을 한 요청으로 받는다.
- 세 파일 누락/빈 파일/중복 ticker/시장 행 불일치/보통주 후보 0건이면 전체 요청을 거부하고 DB를 수정하지 않는다.
- 파싱이 완료되면 DB 트랜잭션에서 기존 활성 `COMMON_STOCK` 행과 교집합인 티커의 `industry_code`만 업데이트한다. 공통 종목 테이블의 다른 메타데이터나 특수상품 테이블은 건드리지 않는다.
- `source_file`, `updated_at`을 함께 기록한다. 거래소별 원본 행 수, KIS 보통주 후보 수, 분류/미분류 수, DB 반영 행 수를 결과로 제공한다.
- DB 반영 뒤 KIS 후보 원본과 활성 COMMON_STOCK 테이블을 다시 조인해 `matched`, `missing`, `industry_code mismatch`를 검증한다. mismatch가 하나라도 있으면 트랜잭션을 롤백한다. 진단 응답에는 미매칭 티커 전체와 KIS 후보에서 찾지 못한 활성 DB 보통주 목록/건수를 포함해 거래소별 universe 차이를 완전하게 추적한다.
- `/api/admin/us-industry-codes?mode=audit`는 NAS/NYS/AMS 마스터를 같은 방식으로 검증한 뒤 DB에 `BEGIN READ ONLY`로 접속해 행 단위 KIS 후보/제외 사유와 common/special 파티션 상태·저장 코드 차이를 반환한다. 이 모드는 저장 동기화 함수를 호출하지 않으며 `databaseWritePerformed: false`로 보장한다.
- `/api/admin/us-sec-sic-industry`는 관리자 세션을 요구한다. GET은 시장별 SEC SIC 보조 저장/잔여 미분류 수와 저장 예시를 제공한다. POST는 커서 기반 50종목 이하 배치로 활성 COMMON_STOCK의 결측 행만 처리하고, SEC 공식 `company_tickers_exchange.json`과 CIK별 `data.sec.gov/submissions/CIK##########.json`의 SIC를 조회한다. 각 배치는 `industry_code`와 `SEC_EDGAR_SIC:<CIK>`를 기록하고 같은 트랜잭션의 RETURNING 결과로 read-after-write를 검증한다. 장시간 작업은 `nextCursor`를 따라 호출을 반복한다.
- PostgreSQL `jsonb_to_recordset`에 전달하는 객체 키는 SQL record 정의와 동일한 `industry_code`, `source_file` snake_case를 사용한다. 애플리케이션 내부 파서 모델의 camelCase 필드를 SQL payload로 보낼 때 명시 변환하며, 실제 쿼리 payload 키 계약을 단위 테스트로 검증한다.
- 원본에 있지만 DB에 없는 KIS 보통주 수는 별도 불일치 지표로 검토한다. 산업코드 동기화 요청이 해당 종목을 자동 신규 편입시키지는 않는다.
- KIS 원본에 없는 활성 DB 보통주도 별도 집계한다. 자동 비활성화·삭제하지 않으며, 종목 마스터 동기화 이력과 공식 분류 필드를 조사한 후 별도 절차로 처리한다.

## 흐름

```text
KIS 공식 공개 마스터 파일 NAS/NYS/AMS
  → 24필드/거래소 코드 검증
  → `icod=f[19]`, `isdr=f[17]`, `etyp=f[22]` 파싱
  → KIS 마스터만으로 보통주 후보 선별
  → DB 활성 COMMON_STOCK와 (시장, 티커) 교집합 구성
  → 단일 DB 트랜잭션으로 industry_code/source_file/updated_at 저장
  → 거래소별 원본·후보·분류·미분류·반영 수 검증
```

KIS Developers는 종목정보 마스터를 주문·시세조회 가능한 전체 종목 목록으로 제공하고 매일 갱신한다고 설명한다. KIS 공식 포털의 마스터 다운로드 링크에서 받아야 하며, 운영 서버의 API에는 관리자 인증을 적용한다. 마스터 파일 자체는 공개 다운로드이며 별도의 KIS bearer token에 의존하지 않는다.

## 회귀·운영 검증

1. 고정 원본 parser 테스트에서 AAPL/MSFT/NVDA/TSLA/AAAP 코드를 검증한다.
2. `isdr`, `sjong`, `etyp`, `ttyp_sb`가 서로 섞이지 않고 ETF/ETN/ETC/워런트/DR이 보통주 후보로 들어오지 않는지 확인한다.
3. DB sync 통합검증은 트랜잭션 전후의 변경 컬럼이 산업코드 및 원천 파일 메타데이터뿐인지 검사한다.
4. 운영 호출 후 각 거래소에 대해 다음을 비교한다: KIS 보통주 원본 수, `icod != 000` 수, 미분류 수, 기존 활성 COMMON_STOCK 분모, 매칭/반영 수, 미매칭 수.
5. 일부 거래소 실패 시 다른 거래소만 반영되는 부분 성공을 허용하지 않는다. 전체 3개 시장을 한 트랜잭션으로 처리한다.
6. 동일 원본 재실행은 값이 변하지 않는 멱등 동작이어야 한다.
7. 동기화 실패 시 관리자 전용 응답은 실패 단계와 안전한 SQLSTATE/schema 식별자만 반환하며 원문 오류·연결 문자열은 반환하지 않는다.

## 2026-10-24 운영 적재 결과

- Deploy OCI run `40088175657`까지 성공적으로 반영한 수정에서 KIS 최신 NAS/NYS/AMS 마스터(각 5,272/2,839/4,780행)를 운영 관리자 API에 업로드했다.
- 활성 `COMMON_STOCK` 기준 KIS 코드 반영: NAS 3,176행, NYS 1,855행, AMS 237행. 공식 코드가 `000`이 아닌 저장 건수는 NAS 1,354, NYS 1,186, AMS 94이며, 업로드 후 DB GET coverage와 정확히 일치한다.
- KIS 공식 마스터에서 common 후보로 판정된 행 중 현재 활성 DB common 행과 매칭되지 않은 수는 NAS 64, NYS 9, AMS 17이다. 이 항목은 비활성/미수록 상태를 확인하지 않고 새 universe 종목으로 자동 등록하지 않았다. 다음 검증에서 샘플 티커와 DB special/disabled 상태를 확인해야 한다.
- KIS 원본 `000`은 공식 미분류 값이므로 그대로 저장했으며 추정 코드로 채우지 않는다. 전체 활성 DB common rows가 모두 분류된 것은 아니며, KIS가 `000`을 제공하거나 KIS 원본과 현재 활성 common 대상이 일치하지 않는 행은 미분류로 남는다.
- 2026-10-24 후속 운영 검증: V160이 이미 운영에 적용된 상태에서 V160을 포함하지 않은 오래된 배포 기준으로 시도한 첫 workflow는 Flyway `Detected applied migration not resolved locally: 160`으로 활성화 단계에서 중단됐다. 데이터베이스에 `flyway repair`를 실행하지 않았고, 기준 브랜치 `oci`의 V160 이력을 작업 브랜치에 병합해 정합성을 복구했다. 작업 중 `oci`에 추가된 RSS 커밋도 포함해 통합 검증했다. 개선 과제 ID 중복으로 문서 게이트가 한 번 실패해 KIS 항목 ID를 고유하게 수정했고, 최종 `npm.cmd run deploy:verify`가 통과했다(빌드, standalone runtime/browser smoke, 296개 테스트 파일 중 296 통과·1 skip, 1,435 tests passed·3 skipped, typecheck, 문서 및 감사 게이트). 최신 운영 재배포와 KIS 마스터 재적재·read-after-write 집계는 아직 수행 전이다.
- 2026-10-24 `.env.local` 인증 및 전체 로컬 DB 대조: KIS `KIS_APPKEY`/`KIS_APPSECRET`로 공식 OAuth 토큰 발급 성공(토큰값은 출력·저장하지 않음). KIS Developers 종목정보 페이지에 명시된 NAS/NYS/AMS 마스터 파일을 사용했다. 원본은 2026-10-23 파일(2026-10-24 19:01 KST 다운로드본)이며, 공식 안내는 종목정보 마스터가 매일 업데이트된다고 설명한다. KIS 마스터 파서·보통주 필터 결과 후보 5,358건(NAS 3,240, NYS 1,864, AMS 254) 중 유효 비영(非零) `icod`는 2,634건(NAS 1,354, NYS 1,186, AMS 94), 공식 `000` 미분류는 2,724건(NAS 1,886, NYS 678, AMS 160)이었다.
- `.env.local`의 로컬 PostgreSQL을 `BEGIN READ ONLY` 및 statement timeout으로 조회했다. 활성 COMMON_STOCK는 5,444건(AMS 249/NAS 3,254/NYS 1,941)이며, 세 시장 모두 `industry_code` 유효 코드 0건·미분류 5,444건이다. KIS 후보와 티커 조인 시 5,310건 매칭되고, 48건은 KIS 후보이나 활성 DB에 없다(AMS 12/NAS 32/NYS 4). 매칭된 5,310건은 KIS 원본값과 저장값이 전부 불일치(로컬 저장값 공란); 그중 KIS가 비영 코드를 제공한 2,634건도 로컬 DB에 공란으로 남아 있다. KIS의 `000` 2,676 매칭 건도 원본값 대신 공란이다. 반대로 DB 활성 COMMON_STOCK 중 134건(AMS 7/NAS 46/NYS 81)은 최신 KIS 보통주 후보에 포함되지 않았다. 로컬 DB에는 쓰기를 수행하지 않았다.
- 운영 서버에서는 `.env.local`의 `ADMIN_DASHBOARD_PASSWORD`로 관리자 로그인 200을 확인했으나, `/api/admin/us-industry-codes`는 현재 404 `text/html`을 반환했다. 따라서 앞서 저장했던 운영 적재 수치는 과거 관측으로만 남기며, 현 운영 DB의 최신 전체 업종코드 상태는 이번에 확인할 수 없었다. 운영 서버에 진단 route가 배포된 후 재조회해야 한다.
- 최신 `oci` 통합 트리에서 `npm.cmd run deploy:verify` 최종 실행이 통과했다(296개 테스트 파일 통과·1 skip, 1,435 tests 통과·3 skip, 빌드/runtime smoke/typecheck/docs/audit 모두 통과). 그 앞선 검증 중 한 번은 문서 개선 과제 ID 중복으로 실패했고, KIS ID를 `CI-2026-10-24-004`로 고유화한 뒤 문서 게이트 및 전체 통합 검증이 통과했다. 더 이전 실행의 `/charts` 30초 타임아웃은 재현되지 않았고 최종 실행은 `/charts` 200 및 desktop/mobile hydration을 통과했다.

## 2026-10-24 운영 전수 대조 결과

- `.env.local`의 KIS 앱키/시크릿으로 공식 OAuth 인증했고, 관리자 비밀번호로 운영 관리자 로그인을 확인했다. 비밀값과 토큰은 출력·저장하지 않았다.
- 2026-10-23 기준 NAS/NYS/AMS 공식 마스터 총 12,891행을 파싱해 KIS 보통주 후보 5,358건(NAS 3,240/NYS 1,864/AMS 254)을 얻었다. 이 중 `icod` 비영 코드 2,634건, 공식 미분류 `000` 2,724건이다.
- 운영 동기화 응답 `ok=true`, `source=KIS_US_MASTER_ICOD`; 저장 후 원본 재대조에서 5,268건 매칭, 코드 불일치 0건, 미매칭 90건(NAS 64/NYS 9/AMS 17)을 확인했다. 미매칭은 활성 `COMMON_STOCK`에 없으므로 자동 편입하지 않았다.
- 별도 운영 GET에서 활성 DB 보통주 NAS 3,949/NYS 2,480/AMS 275행, 분류 코드 1,354/1,186/94행, 공식 `000` 또는 결측 2,595/1,294/181행을 확인했다. KIS와 매칭된 분류·미분류 수는 각각 일치한다.
- 양방향 대조상 최신 KIS 보통주 후보에 없는 활성 DB 행은 1,436건(NAS 773/NYS 625/AMS 38)이다. 이 중 일부는 KIS 원본상 비보통주 또는 특수상품으로 식별될 수 있어 현 상태만으로 전체 활성 테이블을 “순수 보통주”라고 인증하지 않는다. 해당 행의 이동·비활성화는 별도 운영 작업이며 이번 산업코드 적재에서는 수행하지 않았다.
- 결론: 최신 KIS 마스터와 매칭된 5,268행의 산업코드는 검증 완료. 운영 보통주 universe 전체가 최신 공식 마스터와 같은지, 90개 미매칭의 존재/비활성 상태, 1,436개 DB 단독 활성 행의 유형은 후속 조사 대상이다. 공식 `000`은 추정·보정하지 않는다.

## 2026-10-24 최신 배포 후 재검증

- 배포 workflow `40102846417`이 `bacc578c4577890a9a65352fcc59ee296346592c` 기준 성공 완료했다. 운영 `/api/admin/login`은 HTTP 200, 관리자 보호 `/api/admin/us-industry-codes` 및 `/api/admin/instrument-universe-debug`도 관리자 세션으로 HTTP 200을 반환했다.
- `.env.local`의 KIS 앱키·시크릿으로 KIS 공식 OAuth 토큰 발급 HTTP 200 및 86,400초 만료를 확인했다. 토큰·자격증명은 로그나 파일에 기록하지 않았다. 운영 데이터는 KIS가 제공하는 NAS/NYS/AMS 공식 마스터 파일을 업로드해 갱신했다.
- 원본 마스터 행 수 NAS/NYS/AMS 5,272/2,839/4,780, KIS 마스터 필드 및 상품 필터 후 보통주 후보 3,240/1,864/254(총 5,358)였다. 후보 중 원본 `icod` 미분류 수는 1,886/678/160(총 2,724)이다.
- 운영 DB의 활성 `COMMON_STOCK`는 NAS/NYS/AMS 3,949/2,480/275(총 6,704)였다. 원본 후보와 기존 활성 보통주가 매칭되어 업데이트되고 재검증된 건수는 3,176/1,855/237(총 5,268), 업종코드 불일치는 0건이었다. 독립 GET coverage에서도 유효 코드 1,354/1,186/94(총 2,634), 미분류·결측 2,595/1,294/181(총 4,070)으로 동기화 응답과 일치했다.
- 따라서 “활성 DB 전체가 섹터 코드로 분류됨”은 사실이 아니다. 운영 활성 보통주 중 유효 KIS 코드 보유율은 2,634/6,704 = 39.29%이고, 나머지 4,070건(60.71%)은 공식 `000` 또는 KIS 원본과 매칭되지 않은 결측이다. 공식 마스터 후보 5,358건 기준 미분류는 2,724건(50.84%)이다. `000`은 KIS 원천의 미분류이므로 이름이나 다른 공급자 데이터로 추정 보정하지 않는다.
- 양방향 종목 universe 차이도 해소되지 않았다. KIS 보통주 후보 90건(64/9/17)은 활성 DB `COMMON_STOCK`와 매칭되지 않았고, 활성 DB 보통주 1,436건(773/625/38)은 이번 KIS 보통주 후보 파일에 없다. 자동 편입·비활성화는 수행하지 않았다. 전체 미국 보통주 섹터 coverage를 완전 검증했다고 결론 내릴 수 없으며, 이 1,526건의 종목 유형/상태와 KIS 분류 필드 존재 여부를 종목별로 확인하는 후속 과제가 남는다.
- 운영 `instrument-universe-debug` 요약에는 미국 마스터 전체 12,725행(활성 12,725), `COMMON_STOCK` 6,704 및 `ETF` 6,021이 표시됐다. 이 API는 세부 종목별 security-type 목록을 제공하지 않아 90/1,436의 원인까지 독립 확정하지 못한다.

## 2026-10-24 양방향 차이 read-only 감사기능

- 운영 집계만으로 90개 KIS 후보 미매칭과 1,436개 활성 DB 단독 행의 유형을 확인할 수 없던 것이 후속 조사 차단점이었다.
- 관리자 보호 `/api/admin/us-industry-codes?mode=audit`에 세 KIS 마스터 업로드를 받아 원본 전체 행을 현재 KIS 분류 함수로 라벨링하고 공통/특수 instrument table과 read-only 조인하는 경로를 추가했다.
- 결과에는 거래소별 후보·미분류·매칭·누락·코드 불일치와 종목별 KIS security type/DR/ETP/분류 제외 사유, DB common/special 상태, 원본·저장 업종코드가 포함된다. `BEGIN READ ONLY` 트랜잭션이며 저장 경로와 분리한다.
- 대상 Vitest 3개 파일 19개 테스트 통과. 커밋 `2bb1c946f285907036feed9750d21e5fc14e8b6e` 운영 배포 및 `npm.cmd run deploy:verify` 완료 후 `.env.local` 관리자 인증으로 새 read-only 감사 API를 실제 호출했다. 감사 응답 `databaseWritePerformed:false`를 확인했다.
- 운영 감사 결과는 NAS/NYS/AMS 순으로 KIS 후보 3,240/1,864/254(총 5,358), 매칭 활성 보통주 3,176/1,855/237(총 5,268), KIS 후보이나 활성 common에 없는 종목 64/9/17(총 90), KIS 후보가 아닌 활성 DB common 773/625/38(총 1,436), KIS 원본과 저장 코드 불일치 0건이다. 앞선 독립 GET의 유효 코드 2,634건도 원본의 비영 `icod` 수와 일치한다.
- 1,436개 DB 단독 활성 행의 KIS 필드 기반 분류는 NAS: `SPAC` 400, `DERIVATIVE` 216, `DEBT_SECURITY` 43, `DR` 14, `NOT_IN_KIS_MASTER` 100; NYS: 73/387/57/70/38; AMS: 2/21/4/1/10이다. 합계 `SPAC` 475, `DERIVATIVE` 624, `DEBT_SECURITY` 104, `DR` 85, `NOT_IN_KIS_MASTER` 148이다. 이들은 현재 DB에서 `COMMON_STOCK`로 활성화돼 있어 공통주 universe 정합성 위험이 확인됐다.
- KIS 공식 후보 5,358개 중 2,724개의 원본 업종코드가 `000`이므로 KIS 자체 미분류다. 별도 집계로 90개 KIS 후보 미등록 행 전부 원본 코드가 `000`(유효 코드 0, 미분류 90)임을 확인했다. 따라서 이 90개에도 현재 얻을 수 있는 섹터 코드는 없다. 원본 `000`을 다른 데이터나 회사명 추정으로 덮지 않는다.
- **완료 범위**: KIS가 분류한 2,634개 유효 코드의 저장값 동일성 검증 완료(매칭 집합의 mismatch 0). **미완료**: 90개 공식 common 후보의 universe 편입, 1,436개 DB 단독 행의 상태/partition 정비, KIS 원본 `000` 2,724개의 미분류 해소 여부. 이번 감사는 읽기 전용이며 이 항목들을 수정하지 않았다.
- **다음 단계**: KIS 공식 master에서 확인된 common 후보의 안전한 universe upsert와 KIS가 SPAC/파생/채무/DR로 명확히 분류한 현재 common 활성행의 special partition 전환을 별도 설계·검증한다. `NOT_IN_KIS_MASTER` 148건은 부적격으로 단정하지 말고 KIS 공식 상태/필드 추가 확인 전까지 별도 unresolved로 유지한다. `icod=000`은 공식 분류값 추가가 확인되지 않으면 계속 미분류로 둔다.

## 2026-10-25 전체 KIS 마스터 동기화 보강

### 확인된 문제

운영 read-only audit에서 KIS 공식 마스터 기준 보통주 후보 5,358건 중 90건이 활성 common partition에 없었고, 반대로 활성 common 1,436건은 KIS 보통주 후보 집합에 없었다. 이 상태에서 기존 산업코드 UPDATE만 수행하면 90건은 업종코드 저장 대상에서 계속 빠지고, 보통주 전용 원칙도 운영 테이블 전체에 대해 입증할 수 없다.

### 변경 계약

- KIS NAS/NYS/AMS 세 파일의 형식·시장·중복·후보 수 검증이 모두 끝난 후에만 DB 변경을 시작한다.
- 하나의 PostgreSQL 트랜잭션 및 advisory lock 안에서 KIS 공식 common 후보 전체를 `us_common_stock_universe`에 upsert하고, 해당 원본의 `icod`를 그대로 저장한다. `000`은 공식 미분류값으로 저장하며 다른 출처나 종목명으로 채우지 않는다.
- 같은 KIS 원본의 비보통주·ETF/ETP·DR·워런트 등은 `us_special_instrument_universe`에 upsert한다. common 후보가 아닌 기존 활성 common 행은 삭제하지 않고 비활성화한다. KIS 마스터에서 찾을 수 없는 148개 행 역시 미확인으로 남기되 fail-closed 원칙에 따라 활성 common에서만 제외하고 이력을 보존한다.
- DB 사후검증은 common 후보 누락 0, 업종코드 불일치 0, KIS 원본 밖 활성 common 0, KIS 특수행 special 미수록 0을 모두 요구한다. 하나라도 어긋나면 NAS/NYS/AMS 전체 변경을 rollback한다.
- KIS 동기화 경로는 SEC API를 호출하지 않는다. 별도 SEC 보완 API는 KIS 코드가 비었거나 `000`인 활성 common 행만 처리하며, KIS 원본 `000`을 가진 후속 마스터 동기화에서는 기존 SEC fallback을 보존한다.

### 분류코드 커버리지 해석

“저장 완료”는 KIS가 분류코드를 제공한 모든 현재 common 후보의 값을 원본과 일치시켜 DB에 저장하고, KIS의 미분류 `000`도 그대로 보존했다는 뜻이다. `000`을 가진 종목에 유효한 sector code가 제공된 것처럼 보고하지 않는다. 2026-10-24 원본 기준 유효 코드 2,634건과 미분류 2,724건이라는 공급자 커버리지 한계는 별도 지표로 유지한다.

## 2026-10-25 운영 저장 및 전수 재검증 결과

- 배포 커밋 `f84c842faebfc0314d959cf2460e148309370c8c`; Deploy OCI run `40111254986` 성공.
- `.env.local`의 관리자 인증을 통해 최신 KIS NAS/NYS/AMS 원본을 운영 API에 전달했다. 저장 전 `mode=audit`는 `databaseWritePerformed=false`였고, 원본 보통주 후보 5,358건에 대해 DB 누락 90건과 후보 외 활성 common 1,436건, 코드 불일치 0건을 확인했다.
- 저장 API의 `reconciled=true`. common 저장 NAS/NYS/AMS 3,240/1,864/254; special 저장 2,032/975/4,526; 후보 밖 활성 common 비활성화 773/625/38. 활성 common 1,436행은 삭제하지 않고 disabled 처리해 이력을 보존했다.
- 독립 GET 이후 원본 파일을 다시 올린 read-only 감사에서 `databaseWritePerformed=false`, 후보 매칭 3,240/1,864/254, 후보 누락 0, 후보 밖 활성 common 0, industry mismatch 0을 재확인했다. 활성 common 총 5,358개 중 유효 KIS 업종코드는 2,634개, KIS 원본 `000` 미분류는 2,724개다.
- 당시 KIS-only 완료 범위: 현재 KIS 공식 마스터로 확인되는 전체 common 후보와 저장 universe는 완전히 일치했으나, KIS `000` 종목은 미분류였다. 이후 SEC SIC 보완 작업이 별도 fallback으로 추가되었다. KIS와 SEC 코드는 각기 다른 taxonomy이며, source_file로 원천을 구별한다. KIS 마스터 밖 148개 과거 행은 확인 전까지 비활성 상태로 유지한다.

## 공식·프로젝트 참고자료

- [KIS Developers 종목정보 마스터 안내 및 다운로드](https://apiportal.koreainvestment.com/apiservice-category)
- [KIS 공식 open-trading-api 샘플 저장소](https://github.com/koreainvestment/open-trading-api)
- [SEC EDGAR Submissions API 안내](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) — CIK별 JSON submissions metadata 제공
- [SEC 공식 SIC 목록](https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list)
- [SEC 공식 ticker/CIK/exchange JSON](https://www.sec.gov/files/company_tickers_exchange.json)
- 프로젝트 헤더 정의: [`../references/kis-instrument-masters/header-definitions.md`](../references/kis-instrument-masters/header-definitions.md)
- 확인용 보관 원본: [`../references/kis-instrument-masters/2026-08-18/`](../references/kis-instrument-masters/2026-08-18/)
- 구현: [`../../lib/instrument-universe-import.ts`](../../lib/instrument-universe-import.ts), [`../../lib/us-industry-code-sync.ts`](../../lib/us-industry-code-sync.ts), [`../../app/api/admin/us-industry-codes/route.ts`](../../app/api/admin/us-industry-codes/route.ts), [`../../app/api/admin/us-sec-sic-industry/route.ts`](../../app/api/admin/us-sec-sic-industry/route.ts)

## 2026-10-25 SEC SIC 보완 적재 및 재조회

- SEC 공식 ticker/CIK 및 Submissions SIC를 기준으로 활성 미국 보통주 결측에 보조 코드를 저장했다. KIS 유효 ICOD 2,634개는 보존하고, SEC SIC 2,644개는 `source_file=SEC_EDGAR_SIC:<CIK>`로 원천을 구별한다.
- 독립 운영 API GET 기준 시장별 universe/classification: AMS 254 = KIS 94 + SEC 149 + 미분류 11; NAS 3,240 = KIS 1,354 + SEC 1,853 + 미분류 33; NYS 1,864 = KIS 1,186 + SEC 642 + 미분류 36.
- 나머지 80개는 공식 SEC 매핑에서 CIK ticker가 유일하지 않거나 찾을 수 없음 47개, Submissions에 SIC가 없음 33개로 확인했다. 이름 기반 추정값을 넣지 않고 미분류를 유지한다.
- 거래소 exact match가 실패해도 SEC 공식 미국 거래소 전체에서 같은 ticker에 유일 CIK가 있으면 fallback을 허용한다. 이는 운영 universe와 SEC map의 거래소 표기 차이를 보완하며, 여러 CIK로 연결되는 티커는 제외한다.
- DB 직접 조회 없이 관리자 SEC API로 배치 적재와 별도 GET read-after-write를 완료했다. 전체 실행 및 잔여 사유는 [`../../DEVELOPMENT_LOG.md`](../../DEVELOPMENT_LOG.md)의 2026-10-25 SEC SIC 항목을 참조한다.
