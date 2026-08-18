# 국내·해외 전체 종목 통합 유니버스 동기화 설계

상태: 설계안 · 신규 테이블 분리 운영
최종 검토일: 2026-08-18

## 1. 목적

한국투자증권(KIS)이 제공하는 종목 정보 파일을 기준으로 국내 KOSPI·KOSDAQ과 해외 NAS·NYS·AMS의 전체 지원 종목을 수집하고, 기존 통합 티커 테이블과 분리된 신규 국내·해외 유니버스 테이블을 안정적으로 갱신한다.

기존 `us_instruments`, `kr_instruments` 및 그 테이블을 참조하는 레거시 기능은 변경하지 않는다. 신규 수집·신규 탐지 기능은 아래 신규 테이블만 사용한다.

이 문서는 종목 수집, 정규화, 상품 분류, 비활성화, 검증, 이력 보존의 기준을 정의한다. 일봉·주봉·월봉 캐시와 탐지 모듈은 이 문서에서 확정된 통합 유니버스만 참조한다.

## 2. 범위와 용어

| 구분 | 시장 값 | 대상 |
|---|---|---|
| 국내 | `KOSPI`, `KOSDAQ` | KIS 국내 종목 정보 파일에 존재하는 종목 |
| 해외 | `NAS`, `NYS`, `AMS` | KIS 해외 종목 정보 파일에서 시세·거래가 지원되는 종목 |

`전 종목`은 KIS가 종목 정보 파일로 제공하는 전체 지원 종목을 의미한다. ETF·ETN·레버리지·인버스·워런트·파생상품은 원본 목록에 보존할 수 있지만, 공통 탐지 필터에서 제외한다. KIS가 제공하지 않는 OTC 또는 비지원 거래소 종목은 별도 마스터 출처 없이는 이 범위에 포함하지 않는다.

## 3. 데이터 흐름

```text
KIS 종목 정보 파일
        ↓
instrument_master_staging (원본 보존)
        ↓
형식·중복·건수 검증
        ↓
정규화 및 상품 분류
        ↓
국내 통합 티커 / 해외 통합 티커 upsert
        ↓
미검출 종목 단계적 비활성화
        ↓
일·주·월봉 캐시 및 탐지 대상 생성
```

KIS 공식 포털은 매매·시세조회 가능한 전체 종목 리스트를 종목 정보 파일로 제공한다. 순위 API의 TOP 100 누적값은 전체 유니버스의 원천으로 사용하지 않는다.

## 4. 저장 구조

### 4.1 staging 원본

```text
instrument_master_staging
- sync_id
- market
- code
- name
- raw_payload
- source
- fetched_at
```

staging에는 파싱 전 원본을 저장하여 파일 형식 변경, 필드 누락, 잘못된 상품 분류를 재현할 수 있게 한다.

### 4.2 신규 국내 통합 티커

테이블명: `kr_instrument_universe`

기존 `kr_instruments`와 별도 테이블이며, 기존 테이블과 외래키를 연결하지 않는다.

필수 필드:

```text
market                 KOSPI | KOSDAQ
code                   6자리 종목코드
name
english_name
instrument_type
is_etf
is_etn
is_leverage
is_warrant
is_active
source
source_updated_at
last_seen_at
classification_reason
```

고유 키는 `(market, code)`로 한다. 시장을 키에서 제외하면 동일 코드 충돌을 방지할 수 없다.

### 4.3 신규 해외 통합 티커

테이블명: `us_instrument_universe`

기존 `us_instruments`와 별도 테이블이며, 기존 테이블과 외래키를 연결하지 않는다.

필수 필드:

```text
market                 NAS | NYS | AMS
code                   거래소 기준 티커
name
currency
country
instrument_type
is_etf
is_leverage
is_warrant
is_derivative
is_active
source
source_updated_at
last_seen_at
classification_reason
```

고유 키는 `(market, code)`로 한다. 해외 티커는 거래소별로 동일 문자열이 존재할 수 있으므로 `code` 단독 키를 사용하지 않는다.

## 5. 동기화 절차

1. 시장별 KIS 종목 정보 파일을 다운로드한다.
2. 다운로드 성공 여부와 원본 checksum을 기록한다.
3. staging에 원본 행을 저장한다.
4. 코드 형식, 시장 값, 필수 필드, 중복을 검증한다.
5. 상품 분류 모듈을 실행한다.
6. 검증을 통과한 행만 통합 테이블에 upsert한다.
7. 이번 실행에서 확인된 행의 `last_seen_at`을 갱신한다.
8. 미검출 행은 즉시 삭제하지 않고 단계적으로 `inactive` 처리한다.
9. 동기화 결과와 원본 응답 위치를 이력에 저장한다.

## 6. upsert와 비활성화 정책

upsert 기준:

```text
ON CONFLICT (market, code)
→ 이름·상품분류·출처 시각·last_seen_at 갱신
→ is_active = true
```

미검출 정책:

| 상태 | 조건 | 처리 |
|---|---|---|
| 관찰 | 1회 미검출 | 기존 활성 상태 유지, 경고 기록 |
| 후보 | 2회 연속 미검출 | 비활성화 후보 표시 |
| 비활성 | 3회 연속 미검출 | `is_active = false` |

단, 전체 건수가 평소보다 급감하거나 원본 파일이 비어 있으면 파일 장애로 간주한다. 이 경우 기존 통합 테이블을 유지하고 자동 비활성화를 수행하지 않는다.

## 7. 상품 분류와 탐지 필터

분류 값은 다음과 같이 표준화한다.

```text
COMMON_STOCK
ETF
ETN
LEVERAGED_ETF
INVERSE_ETF
WARRANT
PREFERRED
SPAC
ADR
REIT
DERIVATIVE
UNKNOWN
```

일봉·주봉·월봉 및 실시간 탐지의 공통 대상 조건:

```text
is_active = true
AND instrument_type IN (COMMON_STOCK, ADR, REIT)
AND is_etf = false
AND is_leverage = false
AND is_warrant = false
AND is_derivative = false
```

분류가 `UNKNOWN`이면 자동 탐지에서는 제외하고 관리자 검토 대상으로 남긴다.

## 8. 동기화 이력

```text
instrument_sync_runs
- id
- scope
- started_at
- completed_at
- status
- source_count
- inserted_count
- updated_count
- deactivated_count
- excluded_count
- error_count
- error_summary
- raw_response_location
```

관리자 화면에는 시장별 건수, 신규·변경·비활성화 건수, 상품 분류 건수, 마지막 성공 시각, 실패 원인, 원본 응답 모달을 제공한다.

## 9. 검증 기준

- 국내 코드는 6자리인지 확인한다.
- 해외 티커와 시장 값이 비어 있지 않은지 확인한다.
- `(market, code)` 중복이 없는지 확인한다.
- 이전 실행 대비 건수가 비정상적으로 급감하지 않는지 확인한다.
- 필수 필드 누락률이 임계치를 넘지 않는지 확인한다.
- 검증 실패 시 통합 테이블을 갱신하지 않고 staging과 실패 이력만 저장한다.

## 10. 자동화와 수동 실행

- 전체 종목 마스터: 하루 1회
- 국내 장 시작 전 보조 동기화: 필요 시 관리자 설정
- 해외 장 시작 전 보조 동기화: 필요 시 관리자 설정
- 상품 분류 재검증: 하루 1회
- 비활성 종목 정리: 주 1회
- 관리자 수동 동기화 및 Discord Slash Command: 동일 application service 호출

자동화와 수동 테스트는 같은 서비스 모듈을 사용하고, HTTP 라우트는 실행 요청과 결과 조회만 담당한다.

## 11. 구현 전 결정 사항

1. KIS 종목 정보 파일의 실제 다운로드 경로와 파일 형식을 환경별로 확정한다.
2. 국내·해외 통합 테이블의 현재 스키마와 새 분류 필드의 마이그레이션 버전을 확정한다.
3. KIS 지원 목록 밖의 해외 종목을 추가할 별도 출처가 필요한지 결정한다.
4. ETF·파생상품을 통합 테이블에 보존할지, 별도 상품 테이블로 분리할지 결정한다.

## 12. 기존 테이블과의 분리 및 단계적 전환

```text
기존 기능       → 기존 us_instruments / kr_instruments 유지
신규 동기화     → us_instrument_universe / kr_instrument_universe
신규 일·주·월봉 → 신규 유니버스만 참조
검증 완료 후    → 기능별로 선택적 전환
```

신규 테이블은 기존 테이블의 행을 복사하거나 기존 `id`를 재사용하지 않는다. 신규 테이블 자체의 primary key와 `(market, code)` unique key를 갖고, 신규 캐시·탐지 테이블은 `instrument_universe_id`를 외래키로 사용한다.

전환 완료 전에는 기존 테이블을 삭제·이름 변경·대량 갱신하지 않는다. 신규 테이블의 시장별 건수, 상품분류 정확도, 캐시 성공률, 탐지 결과를 검증한 뒤 기능 단위로 소비자를 전환한다.

## 13. 현재 구현 범위

현재 단계에서는 신규 테이블 생성과 마스터 파일 적재만 제공한다.

```text
POST /api/admin/instrument-universe-import
Content-Type: multipart/form-data

fields:
  kospi_code.mst
  kosdaq_code.mst
  NASMST.COD
  NYSMST.COD
  AMSMST.COD
```

운영 관리자에서는 5개 파일을 직접 업로드한다. 서버는 임시 디렉터리에 저장한 뒤 파싱·검증·bulk upsert를 실행한다. 서버 디렉터리를 지정하는 JSON 방식은 내부 자동화와 로컬 테스트용 fallback으로만 유지한다.

`sourceDirectory`에는 다음 5개 파일이 있어야 한다.

```text
kospi_code.mst
kosdaq_code.mst
NASMST.COD
NYSMST.COD
AMSMST.COD
```

이 단계에서는 기존 일봉·주봉·월봉·탐지 API와 신규 유니버스를 연결하지 않는다. 적재 결과는 `instrument_universe_sync_runs`에 기록하고, 신규 테이블의 원본·분류·건수 검증에만 사용한다.

## 12. 공식 참고

- [KIS Developers](https://apiportal.koreainvestment.com/)
- 프로젝트 내 KIS 공식 문서: [`docs/references/README.md`](../references/README.md)
