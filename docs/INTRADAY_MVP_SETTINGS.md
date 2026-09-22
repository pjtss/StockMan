# TOP100 장중 거래대금 탐지 설정

## 정책

관리자 모듈 `intraday-mvp`에서 다음 조합을 선택한다.

- 최근 5분·시가총액 대비 거래대금 5%
- 최근 1분·시가총액 대비 거래대금 1%

거래대금은 국내 원화·해외 달러 기준으로 동일 통화의 시가총액과 비교한다. 매 1분 관측값은 메모리의 분 단위 버킷에 저장하고, 설정된 구간의 합계와 KIS 고정 시가총액을 비교한다.

## 설정 저장과 캐시

설정은 기존 `feature_module_settings`의 `intraday-mvp` 모듈에 저장한다. 워커·사용자 상태 API·관리자 디버깅 API는 `loadIntradayMvpPolicy()`를 공통으로 사용한다.

단일 인스턴스 운영을 전제로 정책은 프로세스 메모리에 10분간 캐시한다. 관리자 저장 성공 시 `invalidateIntradayMvpPolicyCache()`를 호출해 즉시 새 정책을 사용한다. 단일 인스턴스 불변조건이 깨지면 공유 캐시 또는 설정 변경 브로드캐스트가 필요하다.

## 알림

후보가 `QUALIFIED`로 처음 전이될 때만 `INTRADAY_MVP_DISCORD_WEBHOOK_URL` 또는 관리자 입력 Webhook으로 Discord 알림을 보낸다. 상태 전이 dedupe key로 동일 분의 중복 알림을 막는다.

## 검증 기준

- 정책 로더의 10분 캐시와 저장 직후 무효화 테스트
- 1분·5분 정책이 rolling turnover 판정에 반영되는지 테스트
- 타입 검사와 프로덕션 빌드 통과
- 운영에서 기본 활성화되며, 긴급 중지는 `INTRADAY_DETECTION_ENABLED=false`를 명시한다. Webhook 설정도 함께 확인한다.
