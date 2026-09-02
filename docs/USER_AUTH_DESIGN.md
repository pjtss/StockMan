# 일반 사용자 인증 설계

## 정책

- `username`과 비밀번호 기반 회원가입·로그인
- username과 password에는 형식·길이 제한을 두지 않는다.
- 서버 세션 방식이며 쿠키에는 추측 불가능한 opaque token만 저장
- 세션은 username당 하나만 활성화
- 발급 시점부터 24시간 고정 만료
- API 요청으로 세션을 연장하지 않음; 만료 후 재로그인
- 쿠키는 `HttpOnly`, `SameSite=Lax`, 운영 HTTPS에서 `Secure`

## 저장

`users`에는 비밀번호 원문이 아닌 Node.js `scrypt` 해시와 salt를 저장한다.
`user_sessions`에는 세션 원문이 아닌 SHA-256 해시, 만료시각, 폐기시각, 접속 메타데이터를 저장한다.

## API

- `POST /api/auth/register`: username·password 검증 후 계정 생성
- `POST /api/auth/login`: 기존 세션 폐기 후 새 세션 발급
- `POST /api/auth/logout`: 현재 세션 폐기 및 쿠키 삭제
- 보호 API는 `requireUserSession()`을 통해서만 인증한다.

관리자 인증 쿠키와 사용자 인증 쿠키는 별도이며, 일반 사용자에게 관리자 권한을 부여하지 않는다.

## 보안·검증

로그인 실패 응답은 계정 존재 여부를 노출하지 않는다. 세션 토큰·비밀번호는 로그에 남기지 않는다.
