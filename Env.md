# Environment Variables

## Required

### `DATABASE_URL`
- Supabase PostgreSQL 연결 문자열
- 푸시 구독, 공시 저장, 알림 기록에 사용

### `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- 브라우저 Push 구독 생성용 공개키

### `VAPID_PRIVATE_KEY`
- 서버 Web Push 발송용 비밀키

### `VAPID_SUBJECT`
- Web Push 발송자 식별값
- 예: `mailto:you@example.com`

## Optional for Open DART Fast Page

### `OPENDART_API_KEY`
- Open DART 공시검색 API 인증키
- 페이지: `/dart/opendart-fast`
- API: `/api/dart/opendart-fast`
- 미설정 시 해당 페이지는 오류 메시지를 보여줌
