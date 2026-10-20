# 종목 상장주수 출처 정책

## 단일 기준

앱에서 종목의 발행주수·상장주수 값이 필요하면 KIS 상세시세만 사용한다. 여러 출처의 값은 합산·대체·fallback하지 않는다.

| 시장 | KIS API | 응답 필드 | 공통 필드 |
|---|---|---|---|
| 국내 | `/uapi/domestic-stock/v1/quotations/inquire-price` | `output.lstn_stcn` | `listedShares` / DB `listed_shares` |
| 해외 | `/uapi/overseas-price/v1/quotations/price-detail` | `output.shar` | `listedShares` / DB `listed_shares` |

`listedShares`는 KIS 응답에서 관측한 상장주수다. free-float(유통가능주식수)는 별도 개념이므로 이 필드로 섞지 않는다.

## 저장·노출

- `instrument_fundamental_snapshots.listed_shares`에는 최신값, `instrument_fundamental_history.listed_shares`에는 갱신 이력을 저장한다.
- 수집은 `instrument-fundamentals` 자동화가 담당하고 최소 갱신 간격은 하루다. 해외주식 갱신은 KIS 최신 응답을 강제 조회한다.
- 공개 기본정보 API, 스크리너, 국내 재무 export 및 내부 scan DTO는 `listedShares`라는 이름으로 값을 전달한다.
- 값이 없거나 KIS 요청이 실패한 경우 과거 SEC 수량이나 free-float를 가져오지 않는다. KIS 값이 없으면 `null`로 취급한다.
- SEC 소형주 주식수 cron·전용 테이블·공개 API·보고서는 비활성화하고 V149에서 전용 테이블을 삭제한다. SEC 공시 및 Company Facts의 다른 기능은 유지한다.

## 마이그레이션과 점검

V149는 기존 fundamental `shares_outstanding` 컬럼을 `listed_shares`로 이름만 변경해 저장된 값을 보존한다. `free_float_shares`와 `free_float_percent` 컬럼 및 SEC 전용 share tables는 제거한다. 과거 V8, V72, V134, V144–V148 마이그레이션 파일은 적용 이력으로 수정하지 않는다.

새 사용처를 추가할 때는 `rg "sharesOutstanding|shares_outstanding|freeFloatShares|free_float_shares" app lib scripts`로 구 명칭과 대체 출처 의존을 찾아 KIS 상세 응답 파서까지 연결되어 있는지 확인한다. SEC의 기존 마이그레이션과 `DEVELOPMENT_LOG.md`의 과거 작업 이력에는 레거시 문자열이 남을 수 있다.
