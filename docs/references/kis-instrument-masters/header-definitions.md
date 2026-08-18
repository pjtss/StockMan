# KIS 종목 마스터 헤더 정의

상태: 원본 헤더 기준 정리
검토일: 2026-08-18

이 문서는 첨부된 KIS 마스터 파일 헤더 구조체를 프로젝트 파서의 기준으로 정리한 문서다. 파일의 필드 위치와 코드값은 임의로 추정하지 않고 KIS가 제공한 헤더정보와 함께 검증한다.

## 1. 해외 `NASMST.COD`·`NYSMST.COD`·`AMSMST.COD`

해외 파일은 `mastcode` 구조체를 기반으로 하며, 파일별 시장 코드는 다음과 같이 매핑한다.

| 파일 | `excd` | 프로젝트 시장 |
|---|---|---|
| `NASMST.COD` | `NAS` | `NAS` |
| `NYSMST.COD` | `NYS` | `NYS` |
| `AMSMST.COD` | `AMS` | `AMS` |

### 필드 정의

| 필드 | 길이 | 의미 | 코드·주의 |
|---|---:|---|---|
| `ncod` | 2 | 국가 코드 | 미국 등 |
| `exid` | 3 | 거래소 ID | 거래소 식별자 |
| `excd` | 3 | 거래소 코드 | `NAS`, `NYS`, `AMS` |
| `exnm` | 16 | 거래소명 | 원문 보존 |
| `symb` | 16 | 종목 심볼 | 통합 테이블의 `code` 후보 |
| `rsym` | 16 | 실시간 심볼 | KIS 실시간 요청용, `symb`와 다를 수 있음 |
| `knam` | 64 | 한글명 | CP949 계열 인코딩 확인 |
| `enam` | 64 | 영문명 | 표시명·검색용 |
| `stis` | 1 | 증권 유형 | `1` 지수, `2` 주식, `3` ETP, `4` 워런트 |
| `curr` | 4 | 통화 | USD 등 |
| `zdiv` | 1 | 소수점 위치 | 표시 정밀도용 |
| `ztyp` | 1 | 데이터 유형 | KIS 정의 참조 |
| `base` | 12 | 기준가 | 원문 문자열 보존 후 숫자 변환 |
| `bnit` | 8 | 매수 주문 단위 |  |
| `anit` | 8 | 매도 주문 단위 |  |
| `mstm` | 4 | 시장 시작 시각 | `HHMM` |
| `metm` | 4 | 시장 종료 시각 | `HHMM` |
| `isdr` | 1 | DR 여부 | `Y`/`N` |
| `drcd` | 2 | DR 국가 코드 |  |
| `icod` | 4 | 업종 분류 코드 |  |
| `sjong` | 1 | 지수 구성종목 존재 여부 | `0` 없음, `1` 있음 |
| `ttyp` | 1 | Tick size 유형 |  |
| `etyp` | 3 | ETP 상세 유형 | `001` ETF, `002` ETN, `003` ETC, `004` Others, `005` VIX Underlying ETF, `006` VIX Underlying ETN |
| `ttyp_sb` | 3 | Tick size 상세 유형 | 런던·제트라·유로넥스트 등 특수시장 |

### 해외 상품 분류 규칙

```text
stis = 2                     → 주식 후보
stis = 3                     → ETP 제외 후보
stis = 4                     → 워런트·파생상품 제외 후보
etyp in 001,002,003,005,006  → ETF/ETN/ETC/레버리지 계열 분류 재검증
isdr = Y                     → ADR/DR 보조 분류
```

`stis`만으로 레버리지 여부를 확정하지 않고 `etyp`, 영문명, 원본 분류 필드를 함께 사용한다.

## 2. 국내 `kospi_code.mst`·`kosdaq_code.mst`

국내 파일은 고정폭 구조체다. KOSPI와 KOSDAQ은 공통 필드가 많지만 시장별 추가 필드가 다르므로 하나의 파서에 시장별 스키마를 주입한다.

### 공통 핵심 필드

| 필드 | 길이 | 의미 |
|---|---:|---|
| `mksc_shrn_iscd` | 매크로 | 단축코드 |
| `stnd_iscd` | 매크로 | 표준코드 |
| `hts_kor_isnm` | 매크로 | 한글 종목명 |
| `scrt_grp_cls_code` | 2 | 증권그룹 구분 |
| `avls_scal_cls_code` | 1 | 시가총액 규모 |
| `bstp_larg_div_code` | 4 | 업종 대분류 |
| `bstp_medm_div_code` | 4 | 업종 중분류 |
| `bstp_smal_div_code` | 4 | 업종 소분류 |
| `low_current_yn` | 1 | 저유동성 여부 |
| `krx_issu_yn` | 1 | KRX 종목 여부 |
| `etp_prod_cls_code` | 1 | ETP 상품 구분 |
| `stck_sdpr` | 9 | 주식 기준가 |
| `frml_mrkt_deal_qty_unit` | 5 | 정규장 매매수량 단위 |
| `ovtm_mrkt_deal_qty_unit` | 5 | 시간외 매매수량 단위 |
| `trht_yn` | 1 | 거래정지 여부 |
| `sltr_yn` | 1 | 정리매매 여부 |
| `mang_issu_yn` | 1 | 관리종목 여부 |
| `mrkt_alrm_cls_code` | 2 | 시장경고 구분 |
| `flng_cls_code` | 2 | 권리락·배당락 구분 |
| `fcam_mod_cls_code` | 2 | 액면가 변경 구분 |
| `icic_cls_code` | 2 | 증자 구분 |
| `marg_rate` | 3 | 증거금 비율 |
| `crdt_able` | 1 | 신용주문 가능 여부 |
| `crdt_days` | 3 | 신용기간 |
| `prdy_vol` | 12 | 전일 거래량 |
| `stck_fcam` | 12 | 액면가 |
| `stck_lstn_date` | 8 | 상장일 |
| `lstn_stcn` | 15 | 상장주수(천) |
| `cpfn` | 21 | 자본금 |
| `stac_month` | 2 | 결산월 |
| `po_prc` | 7 | 공모가격 |
| `prst_cls_code` | 1 | 우선주 구분 |
| `ssts_hot_yn` | 1 | 공매도과열 여부 |
| `stange_runup_yn` | 1 | 이상급등 여부 |
| `sale_account` | 9 | 매출액 |
| `bsop_prfi` | 9 | 영업이익 |
| `op_prfi` | 9 | 경상이익 |
| `thtr_ntin` | 5 | 당기순이익 |
| `roe` | 9 | ROE |
| `base_date` | 8 | 재무 기준년월 |
| `prdy_avls_scal` | 9 | 전일 기준 시가총액(억) |
| `grp_code` | 3 | 그룹사 코드 |
| `co_crdt_limt_over_yn` | 1 | 회사 신용한도 초과 여부 |
| `secu_lend_able_yn` | 1 | 담보대출 가능 여부 |
| `stln_able_yn` | 1 | 대주 가능 여부 |

### 국내 증권그룹 코드

```text
ST  주권
MF  증권투자회사
RT  부동산투자회사
SC  선박투자회사
IF  사회간접자본투융자회사
DR  주식예탁증서
EW  ELW
EF  ETF
SW  신주인수권증권
SR  신주인수권증서
BC  수익증권
FE  해외ETF
FS  외국주권
```

### 국내 ETP 코드

```text
0  해당없음
1  투자회사형
2  수익증권형
3  ETN
4  손실제한 ETN
5  상장형 수익증권
```

### 국내 시장별 차이

| 시장 | 파일 | 추가·특화 필드 |
|---|---|---|
| KOSPI | `kospi_code.mst` | KOSPI200·KOSPI100·KOSPI50, 제조업, 업종 섹터, KRX 지수 플래그 |
| KOSDAQ | `kosdaq_code.mst` | 벤처기업 여부, 투자주의 환기종목, KOSDAQ150 |

KOSPI의 `kospi_issu_yn`, KOSDAQ의 `ksq150_nmix_yn`처럼 시장에만 의미가 있는 필드는 공통 테이블의 원본 메타데이터 JSON에도 보존한다.

## 3. 파서 저장 원칙

1. 원본 고정폭·탭 구조를 먼저 staging에 저장한다.
2. CP949 계열 한글을 UTF-8 내부 문자열로 변환한다.
3. 숫자 필드는 공백을 null로 바꾸되, 원본 문자열은 `raw_payload`에 보존한다.
4. `(market, code)`를 통합 티커의 고유키로 사용한다.
5. 상품 분류는 `scrt_grp_cls_code`, `etp_prod_cls_code`, 해외 `stis`·`etyp`을 함께 평가한다.
6. 헤더에 정의된 삭제 필드는 새 계산에 사용하지 않고 원본 호환 필드로만 보존한다.

## 4. 연결 문서

- [KIS 종목 마스터 원본 보관소](./README.md)
- [전체 유니버스 동기화 설계](../../architecture/instrument-universe-sync.md)
