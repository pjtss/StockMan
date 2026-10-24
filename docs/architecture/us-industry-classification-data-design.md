# 미국 보통주 산업분류 코드 KIS 전용 수집·저장 설계

상태: 파서 수정·동기화 API 구현, 로컬/운영 검증 진행 중
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
- 원본에 있지만 DB에 없는 KIS 보통주 수는 별도 불일치 지표로 검토한다. 산업코드 동기화 요청이 해당 종목을 자동 신규 편입시키지는 않는다.

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

## 공식·프로젝트 참고자료

- [KIS Developers 종목정보 마스터 안내 및 다운로드](https://apiportal.koreainvestment.com/apiservice-category)
- [KIS 공식 open-trading-api 샘플 저장소](https://github.com/koreainvestment/open-trading-api)
- 프로젝트 헤더 정의: [`../references/kis-instrument-masters/header-definitions.md`](../references/kis-instrument-masters/header-definitions.md)
- 확인용 보관 원본: [`../references/kis-instrument-masters/2026-08-18/`](../references/kis-instrument-masters/2026-08-18/)
- 구현: [`../../lib/instrument-universe-import.ts`](../../lib/instrument-universe-import.ts), [`../../lib/us-industry-code-sync.ts`](../../lib/us-industry-code-sync.ts), [`../../app/api/admin/us-industry-codes/route.ts`](../../app/api/admin/us-industry-codes/route.ts)
