# 외부 요청 경계

## 목적

외부 API 호출이 기능 모듈마다 흩어져 rate limit, timeout, 응답 파싱, 관측 로직이 누락되는 것을 방지한다.

## KIS 경계

- 일반 KIS 데이터 요청은 `lib/kis-request-framework.ts`와 `withKisRequestThrottle`를 통과한다.
- `lib/kis-token.ts`의 토큰 발급(`/oauth2/tokenP`)과 `lib/kis-realtime.ts`의 Approval WebSocket 티켓 발급(`/oauth2/Approval`)은 각각 인증 수명주기 예외이며, 일반 데이터 요청과 섞지 않는다.
- WebSocket Approval 키는 단일 OCI 인스턴스의 메모리에서 실전/모의 및 자격증명 fingerprint별로 캐시하고, 발급 요청은 in-flight Promise로 합친다. KIS 공식 샘플이 86,400초 경과 시 재인증하므로 애플리케이션은 23시간에 갱신해 1시간 안전 여유를 둔다. 자격증명 원문과 Approval 키는 캐시 키·로그에 포함하지 않는다. 근거: [한국투자증권 공식 Open API 인증 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/kis_auth.py).
- 차트 WebSocket Approval 공개 endpoint는 KIS 키를 브라우저에 전달해야 하므로 로그인 인증 대신 단일 인스턴스 메모리 rate limit을 적용한다: IP당 60초 120회, 전체 60초 1,800회. 제한 시 `429 RATE_LIMITED`와 `Retry-After`를 반환하고 KIS Approval 발급 경로에는 진입하지 않는다. OCI nginx 설정은 `X-Real-IP`를 `$remote_addr`로 덮어쓰므로 이를 우선 사용하고, 마지막 `X-Forwarded-For` hop을 fallback으로 쓴다. 정책 변경 때는 차트의 정상 연결 빈도와 사용자 NAT 영향을 검증한다.
- Rate limit은 IP 원문 없이 60분 분별 집계(허용, IP 제한, 전체 제한, Retry-After 구간)를 현재 프로세스 메모리에만 유지한다. 관리자는 `/admin/kis-calls`에서 확인하며 `/api/admin/kis-realtime-approval-metrics`는 관리자 인증을 요구하고 DB와 독립적으로 동작한다. 재시작/배포 시 집계가 초기화되는 운영 한계를 화면에 명시한다.
- 기능 모듈은 URL·헤더·파라미터 조립과 도메인 파싱을 담당하고, 재시도·timeout·rate limit 이벤트 기록은 공통 경계가 담당한다.
- 해외 조건검색은 `lib/kis-us-condition-search.ts`가 전담한다. KIS 결과를 검증한 뒤 공식 활성 보통주 마스터와 대조하며, DB 판정 실패 때는 fail-closed한다. API 필드와 100건 제한은 `docs/api/KIS_US_CONDITION_SEARCH.md`에서 관리한다.
- 새 KIS API를 추가할 때는 모듈 테스트에 성공 응답, 비정상 JSON, HTTP 오류, rate limit 경로를 함께 기록한다.

## 지속 개선 연결

구조 변경은 `DEVELOPMENT_LOG.md`에 개선 과제 ID, 검증 명령, 다음 개선을 남긴다. 운영에서 경계 우회가 발견되면 해당 호출을 공통 프레임워크로 이동하고 회귀 테스트를 추가한다.

`npm run audit:kis-boundary`는 `lib/kis*.ts` 데이터 모듈의 직접 `fetch` 호출을 검사한다. 토큰 발급과 WebSocket Approval만 예외로 허용하며, 새 예외는 코드와 이 문서에 함께 등록해야 한다.

모듈 책임 registry는 `scripts/kis-module-registry.mjs`에서 관리한다. `lib/kis*.ts`에 새 모듈을 추가하면 registry 등록 없이는 감사가 실패한다.

핵심 모듈의 대표 회귀 테스트 연결은 `scripts/audit-kis-boundary.mjs`의 `moduleTests`에서 관리한다. 등록된 테스트 파일이 삭제되거나 모듈과 연결이 끊기면 감사가 실패한다.

핵심 모듈의 대표 API 경로는 `scripts/kis-module-registry.mjs`의 `kisModulePathRegistry`에서 관리한다. 등록한 경로가 실제 모듈 소스에서 사라지면 감사가 실패한다.

핵심 모듈의 대표 함수는 `kisModuleFeatureRegistry`에서 관리한다. 함수가 제거되거나 이름이 바뀌면 경계 감사가 실패해 registry와 구현의 불일치를 조기에 발견한다.
