# 미국 단일 종목 유통주 조회

## 구성

- `fmp-free-float.ts`: FMP Free Float API 호출·응답 정규화
- `free-float-repository.ts`: PostgreSQL 조회·저장
- `us-free-float.ts`: 하루 캐시 우선 조회 후 외부 API 호출하는 유스케이스
- `us-free-float-test/route.ts`: 관리자 수동 테스트 API
- `discord-ticker-overview.ts`: `/ticker` 응답에 유통주 결과 결합

## 운영 정책

- 환경변수 `FMP_API_KEY`가 없으면 `유통주 데이터 없음`을 반환한다.
- 같은 티커는 UTC 기준 하루에 한 번만 FMP를 호출한다.
- 유통 시가총액은 `현재가 × 유통주식수`로 계산한다.
- 전체 시가총액을 유통 시가총액으로 대체하지 않는다.
- 응답에 데이터 기준일과 제공기관(FMP)을 표시한다.

마이그레이션 `V8__us_free_float_snapshots.sql`을 Flyway로 적용해야 DB 캐시가 활성화된다.
