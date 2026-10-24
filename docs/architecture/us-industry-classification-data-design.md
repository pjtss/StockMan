# 미국 보통주 산업분류 코드 KIS 전용 수집·저장 설계

상태: KIS 공식 마스터 전수 파싱 및 운영 DB 반영 완료; 저장 후 코드 불일치 0건. 운영 universe 양방향 전체 차이 응답 보강은 구현·검증 완료, OCI 재배포 및 최종 차이 확인 대기
기준일: 2026-10-24

## 범위와 원칙

- 공식 분류코드 원천은 한국투자증권(KIS)의 NAS/NYS/AMS 해외주식 마스터 `icod`만 사용한다.
- SEC 등 다른 공급자 분류는 수집, 저장, 결측 보완에 사용하지 않는다.
- KIS 원본의 빈 값·`000`은 미분류로 보존한다. 종목명으로 산업을 추정하지 않는다.
- DB 업데이트 대상은 KIS 마스터의 보통주 판정과 DB의 활성 `COMMON_STOCK` 판정이 모두 맞는 `(market, ticker)`로 한정한다.

## 조사에서 확인한 결함과 원본 근거

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

## 공식·프로젝트 참고자료

- [KIS Developers 종목정보 마스터 안내 및 다운로드](https://apiportal.koreainvestment.com/apiservice-category)
- [KIS 공식 open-trading-api 샘플 저장소](https://github.com/koreainvestment/open-trading-api)
- 프로젝트 헤더 정의: [`../references/kis-instrument-masters/header-definitions.md`](../references/kis-instrument-masters/header-definitions.md)
- 확인용 보관 원본: [`../references/kis-instrument-masters/2026-08-18/`](../references/kis-instrument-masters/2026-08-18/)
- 구현: [`../../lib/instrument-universe-import.ts`](../../lib/instrument-universe-import.ts), [`../../lib/us-industry-code-sync.ts`](../../lib/us-industry-code-sync.ts), [`../../app/api/admin/us-industry-codes/route.ts`](../../app/api/admin/us-industry-codes/route.ts)
