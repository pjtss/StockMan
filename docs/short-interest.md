# 해외 단일 종목 공매도 조회

`short-interest-types`는 공급자와 무관한 공통 모델, `short-interest-sources`는 FINRA 응답 정규화, `short-interest-service`는 무료 공급자 호출, `short-interest-score`는 순수 점수 계산을 담당한다. 사용자 API는 `/api/short-interest/[ticker]`, 관리자 검증은 `/api/admin/short-interest-test`를 사용한다.

공식 기본 endpoint는 `https://api.finra.org/data/group/otcMarket/name/regShoDaily`이며 POST 필터로 티커를 조회한다. `FINRA_SHORT_VOLUME_URL`은 다른 FINRA 환경을 사용할 때만 선택적으로 덮어쓴다. 상태는 `OK`, `ZERO_SHORT_VOLUME`, `NO_RECORD`, `NULL_FIELD`, `API_ERROR`, `NOT_PUBLISHED` 등으로 구분하며 임의 추정하지 않는다.

FINRA 일별 공매도 거래량은 공매도 잔고가 아니다. 현재 composite 모듈은 일별 Reg SHO 거래량, FINRA Consolidated Short Interest(월 2회 잔고), OTC Threshold List를 각각 조회하고 하나의 수치로 합산하지 않는다. `FINRA_API_TOKEN`은 Query API production 권한이 필요한 환경에서 사용하며, 각 endpoint는 `FINRA_SHORT_VOLUME_URL`, `FINRA_SHORT_INTEREST_URL`, `FINRA_THRESHOLD_URL`로 교체할 수 있다. KIS 시세·체결강도는 `discord-ticker-overview`에서 별도 계층으로 계산한다.
