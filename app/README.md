# `app/` App Router

- `app/api/`: HTTP 진입점. 인증·입력 검증·request trace 후 `lib/` 서비스를 호출합니다.
- `app/admin/`: 관리자 화면. 공통 세션·레이아웃은 `app/admin/layout.tsx`와 `components/admin-*`가 담당합니다.
- `app/page.tsx` 및 기능 화면: 사용자 화면.

API 라우트에 계산 로직이나 DB SQL을 직접 추가하지 말고 `lib/`에 애플리케이션 서비스를 둡니다. 관리자 테스트 API는 원본 응답과 구조화된 진단을 함께 반환해야 합니다.
