# 외부 요청 경계

## 목적

외부 API 호출이 기능 모듈마다 흩어져 rate limit, timeout, 응답 파싱, 관측 로직이 누락되는 것을 방지한다.

## KIS 경계

- 일반 KIS 데이터 요청은 `lib/kis-request-framework.ts`와 `withKisRequestThrottle`를 통과한다.
- `lib/kis-token.ts`의 토큰 발급(`/oauth2/tokenP`)과 `lib/kis-realtime.ts`의 Approval WebSocket 티켓 발급(`/oauth2/Approval`)은 각각 인증 수명주기 예외이며, 일반 데이터 요청과 섞지 않는다.
- 기능 모듈은 URL·헤더·파라미터 조립과 도메인 파싱을 담당하고, 재시도·timeout·rate limit 이벤트 기록은 공통 경계가 담당한다.
- 새 KIS API를 추가할 때는 모듈 테스트에 성공 응답, 비정상 JSON, HTTP 오류, rate limit 경로를 함께 기록한다.

## 지속 개선 연결

구조 변경은 `DEVELOPMENT_LOG.md`에 개선 과제 ID, 검증 명령, 다음 개선을 남긴다. 운영에서 경계 우회가 발견되면 해당 호출을 공통 프레임워크로 이동하고 회귀 테스트를 추가한다.

`npm run audit:kis-boundary`는 `lib/kis*.ts` 데이터 모듈의 직접 `fetch` 호출을 검사한다. 토큰 발급과 WebSocket Approval만 예외로 허용하며, 새 예외는 코드와 이 문서에 함께 등록해야 한다.

모듈 책임 registry는 `scripts/kis-module-registry.mjs`에서 관리한다. `lib/kis*.ts`에 새 모듈을 추가하면 registry 등록 없이는 감사가 실패한다.

핵심 모듈의 대표 회귀 테스트 연결은 `scripts/audit-kis-boundary.mjs`의 `moduleTests`에서 관리한다. 등록된 테스트 파일이 삭제되거나 모듈과 연결이 끊기면 감사가 실패한다.

핵심 모듈의 대표 API 경로는 `scripts/kis-module-registry.mjs`의 `kisModulePathRegistry`에서 관리한다. 등록한 경로가 실제 모듈 소스에서 사라지면 감사가 실패한다.

핵심 모듈의 대표 함수는 `kisModuleFeatureRegistry`에서 관리한다. 함수가 제거되거나 이름이 바뀌면 경계 감사가 실패해 registry와 구현의 불일치를 조기에 발견한다.
