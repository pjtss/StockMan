# 해외 단일 종목 공매도 조회

`short-interest-types`는 공급자와 무관한 공통 모델, `short-interest-sources`는 FINRA 응답 정규화, `short-interest-service`는 무료 공급자 호출, `short-interest-score`는 순수 점수 계산을 담당한다. 사용자 API는 `/api/short-interest/[ticker]`, 관리자 검증은 `/api/admin/short-interest-test`를 사용한다.

공식 기본 endpoint는 `https://api.finra.org/data/group/otcMarket/name/regShoDaily`이며 POST 필터로 티커를 조회한다. `FINRA_SHORT_VOLUME_URL`은 다른 FINRA 환경을 사용할 때만 선택적으로 덮어쓴다. 상태는 `OK`, `ZERO_SHORT_VOLUME`, `NO_RECORD`, `NULL_FIELD`, `API_ERROR`, `NOT_PUBLISHED` 등으로 구분하며 임의 추정하지 않는다.

FINRA 일별 공매도 거래량은 공매도 잔고가 아니다. 현재 composite 모듈은 일별 Reg SHO 거래량, FINRA Consolidated Short Interest(월 2회 잔고), OTC Threshold List를 각각 조회하고 하나의 수치로 합산하지 않는다. `FINRA_API_TOKEN`은 Query API production 권한이 필요한 환경에서 사용하며, 각 endpoint는 `FINRA_SHORT_VOLUME_URL`, `FINRA_SHORT_INTEREST_URL`, `FINRA_THRESHOLD_URL`로 교체할 수 있다. KIS 시세·체결강도는 `discord-ticker-overview`에서 별도 계층으로 계산한다.

거래대금 증가 알림은 최신 5분 이내 저장된 미국 체결강도가 관리자 설정의 `minIntensity` 이상인 경우에만 전송한다. 기본값은 100이며, 신규 종목 알림에는 적용하지 않고 거래대금 증가 알림에만 적용한다. 체결강도 스냅샷이 없거나 오래된 경우에는 증가 알림을 보내지 않는다.

Discord `/ticker`는 FINRA와 Alpaca 대차를 독립적으로 조회한다. FINRA에는 `당일 공매도 거래량/비율`, `공매도 잔고`, `Days to Cover`, `잔고 기준일`을 표시하고, Alpaca에는 계정 범위의 `대차 가능 여부`, `available_qty`, `Locate 가격`, `quotedAt`을 표시한다. 대차 API가 실패해도 FINRA·KIS 결과는 유지한다. FINRA 일별 거래 기준일(`shortVolumeAsOf`)과 잔고 정산일(`shortInterestAsOf`)은 서로 다른 값이므로 합쳐서 표시하지 않는다. 잔고 기준일이 45일을 초과하면 `STALE`로 표시한다.
