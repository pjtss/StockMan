# 해외 단일 종목 공매도 조회

`short-interest-types`는 공급자와 무관한 공통 모델, `short-interest-sources`는 FINRA 응답 정규화, `short-interest-service`는 무료 공급자 호출, `short-interest-score`는 순수 점수 계산을 담당한다. 사용자 API는 `/api/short-interest/[ticker]`, 관리자 검증은 `/api/admin/short-interest-test`를 사용한다.

공식 기본 endpoint는 `https://api.finra.org/data/group/otcMarket/name/regShoDaily`이며 POST 필터로 티커를 조회한다. `FINRA_SHORT_VOLUME_URL`은 다른 FINRA 환경을 사용할 때만 선택적으로 덮어쓴다. 설정이 없거나 응답에 데이터가 없으면 임의 추정 없이 `UNAVAILABLE`과 `UNKNOWN`을 반환한다.

FINRA 일별 공매도 거래량은 공매도 잔고가 아니다. Nasdaq의 월 2회 잔고·Days to Cover 어댑터는 별도 모듈로 추가해야 하며 두 지표를 합산하지 않는다.
