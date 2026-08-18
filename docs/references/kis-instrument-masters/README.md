# KIS 종목 마스터 원본 보관소

이 디렉터리는 KIS Developers에서 내려받은 종목 마스터 파일의 원본 추출본을 날짜별로 보관한다. 파일은 바이너리/고정폭 원본이므로 내용을 임의로 정규화하지 않는다.

## 보관 규칙

```text
YYYY-MM-DD/
  kospi_code.mst
  kosdaq_code.mst
  NASMST.COD
  NYSMST.COD
  AMSMST.COD
```

압축파일은 다운로드 원본이고, 날짜 디렉터리는 압축을 해제한 원본이다. 파서 구현 시 원본 파일을 직접 변경하지 않고 staging 테이블로 적재한다.

## 2026-08-18 추출본

| 파일 | 시장 | 파일 계열 | 관찰 형식 |
|---|---|---|---|
| `kospi_code.mst` | KOSPI | 국내 | 고정폭 레코드, CP949 계열 한글, 줄바꿈 레코드 |
| `kosdaq_code.mst` | KOSDAQ | 국내 | 고정폭 레코드, CP949 계열 한글, 줄바꿈 레코드 |
| `NASMST.COD` | NAS | 해외 | 탭 구분 레코드, CP949 계열 한글, 줄바꿈 레코드 |
| `NYSMST.COD` | NYS | 해외 | 탭 구분 레코드, CP949 계열 한글, 줄바꿈 레코드 |
| `AMSMST.COD` | AMS | 해외 | 탭 구분 레코드, CP949 계열 한글, 줄바꿈 레코드 |

국내 `.mst` 파일은 헤더정보에서 정의한 고정폭 위치를 사용해야 하며, 해외 `.COD` 파일은 탭 필드를 기준으로 파싱한다. 한글 필드는 UTF-8로 가정하지 말고 원본 인코딩을 확인한 뒤 UTF-8 내부 저장으로 변환한다.

## 레코드 해석 기준

### 해외 `.COD`

샘플 레코드에서 확인되는 주요 필드 순서는 다음과 같다.

```text
국가코드, 시장번호, 거래소코드, 현지명, 티커, KIS심볼,
현지명/영문명, 영문명, 상품구분, 통화, 가격단위, 현재가,
거래가능여부 및 거래시간 관련 필드, 상태·분류 필드
```

정확한 필드 위치와 코드값은 해당 파일의 KIS `헤더정보`를 기준으로 확정한다. 샘플의 숫자 위치를 추정해 파서 계약으로 고정하지 않는다.

### 국내 `.mst`

국내 파일은 종목코드, 표준명, 상품구분, 시장·상장·거래상태, 가격·수량 관련 필드가 고정폭으로 이어진다. `kospi_code.mst`와 `kosdaq_code.mst`는 동일 파서에 시장값만 주입하고, 헤더정보의 위치 정의를 별도 상수로 관리한다.

## 프로젝트 매핑

```text
kospi_code.mst  → market = KOSPI
kosdaq_code.mst → market = KOSDAQ
NASMST.COD      → market = NAS
NYSMST.COD      → market = NYS
AMSMST.COD      → market = AMS
```

원본 행은 `instrument_master_staging`에 저장하고, 정규화 후 `(market, code)` 기준으로 국내·해외 통합 티커 테이블에 upsert한다. 상품구분은 `instrument_type`, `is_etf`, `is_leverage`, `is_warrant`, `is_derivative`로 표준화한다.

## 검증 시 주의사항

- 파일이 비어 있거나 이전 수집 대비 건수가 급감하면 통합 테이블을 갱신하지 않는다.
- 국내 고정폭 필드를 탭 구분으로 처리하지 않는다.
- 해외 파일의 한글 현지명은 CP949 계열 인코딩을 점검한다.
- 동일 티커라도 시장이 다를 수 있으므로 `code` 단독 키를 사용하지 않는다.
- 파싱 결과와 원본 파일 checksum을 동기화 이력에 함께 보관한다.

## 공식 출처

- [KIS Developers](https://apiportal.koreainvestment.com/) → 종목 정보 파일 → 헤더정보/종목 다운로드
- 전체 유니버스 동기화 설계: [`../../../architecture/instrument-universe-sync.md`](../../../architecture/instrument-universe-sync.md)
