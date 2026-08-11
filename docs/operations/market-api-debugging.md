# 국내·해외 시장 API 운영 디버깅

## 통합 관리자 API

관리자 세션으로 로그인한 상태에서 다음 API를 사용한다.

```text
GET /api/admin/market-debug?market=all
GET /api/admin/market-debug?market=kr&run=true
GET /api/admin/market-debug?market=us&run=true
```

`run=true`가 없으면 DB·환경변수·Flyway·테이블 건수만 확인한다. `run=true`이면 선택한 시장의 KIS 동기화와 DB 기반 국내/해외 볼린저밴드 진단을 함께 실행한다. 응답의 `requestId`와 `x-request-id`를 운영 로그 검색 키로 사용한다.

## 응답 해석

- `environment`: KIS·DB·cron 설정 여부만 표시하며 비밀값은 표시하지 않는다.
- `inventory.tables`: 국내·해외 통합 종목, 일봉 캐시, 시세 스냅샷 테이블 존재 여부와 행 수.
- `inventory.flyway`: 마지막 성공 Flyway 버전.
- `kr.sync.details`: 국내 KIS 등락률·체결강도 순위 API별 성공 여부와 원본 오류.
- `kr.scan` / `us.scan`: `instrumentCount`, `successCount`, `failureCount`, `filterExcludedCount`, `qualified`, `results`를 단계별로 확인한다.

## 주요 실패 판정

- `FID_INPUT_CNT_1` 오류: 국내 변동률 순위 요청 파라미터 누락.
- `insufficient valid candles (0/period)`: API 응답이 아니라 DB 일봉 캐시가 없거나 스캔 정책이 잘못 병합된 경우다.
- ETF·채권·지수 상품이 결과에 포함됨: 상품 분류 또는 `product_status=ACTIVE` 필터를 점검한다.
- 거래대금 비율이 비정상적으로 큼: 국내 KIS `hts_avls`는 억 원 단위이므로 원 단위 변환 여부를 확인한다.

## 안전 원칙

운영 디버깅 응답에는 토큰, 앱시크릿, Webhook URL을 포함하지 않는다. 대량 KIS 호출이 필요한 작업은 별도 동기화 API로 실행하고, 이 API는 원인 분석에 필요한 원본 상태와 단계별 결과를 제공하는 용도로 사용한다.
