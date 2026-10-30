# `app/` App Router

- `app/api/`: HTTP 진입점. 인증·입력 검증·request trace 후 `lib/` 서비스를 호출합니다.
- 외부 읽기 API discovery는 배포 정적 파일 `/openapi.json`, `/api-reference.md`, `/llms.txt`, `/document-catalog.json`, `/manuals/...`와 검색 API `/api/public/api-manual`, `/api/public/document-catalog`를 사용합니다. 관리자·debug·cron·user-session 경로는 외부 AI 공개 명세에 넣지 않습니다. 전체 route 목록과 drift 감사는 [`../docs/api/README.md`](../docs/api/README.md) 기준입니다.
- `app/admin/`: 관리자 화면. 공통 세션·레이아웃은 `app/admin/layout.tsx`와 `components/admin-*`가 담당합니다.
- `app/page.tsx` 및 기능 화면: 사용자 화면.

API 라우트에 계산 로직이나 DB SQL을 직접 추가하지 말고 `lib/`에 애플리케이션 서비스를 둡니다. 관리자 테스트 API는 원본 응답과 구조화된 진단을 함께 반환해야 합니다.

라우트의 상세 책임·허용 의존성·검증 증거는 [`../docs/architecture/system-module-catalog.md`](../docs/architecture/system-module-catalog.md)의 앱·HTTP 경계를 기준으로 합니다.
