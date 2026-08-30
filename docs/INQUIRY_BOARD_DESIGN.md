# 문의 게시판 및 요청 식별 설계

## 범위

누구나 문의글을 작성·조회하고 댓글과 좋아요를 남길 수 있는 최소 게시판이다. 제목과 내용만 작성 입력으로 받는다.

## 기능

- 문의글 목록·상세·작성
- 댓글 작성
- 조회수 증가
- 좋아요 토글 및 중복 방지
- 페이지·API 요청의 원본 IP와 User-Agent 저장

## 식별 및 노출

IP와 User-Agent 조합으로 짧은 해시 식별자를 생성한다. 원본은 DB에 저장하지만 일반 사용자 화면과 API에는 마스킹 IP 및 브라우저/OS 요약만 전달한다.

## 요청 로그

미들웨어가 정적 리소스를 제외한 페이지·API 요청을 내부 비동기 수집 엔드포인트로 전달한다. 요청 본문·쿠키·Authorization은 저장하지 않는다. `REQUEST_LOG_SECRET` 환경변수가 없는 환경에서는 내부 저장을 거부한다.

## 데이터

`inquiries`, `inquiry_comments`, `inquiry_likes`, `request_logs` 테이블을 사용한다. 문의글과 댓글 삭제 시 종속 좋아요·댓글은 cascade로 정리한다.

## 경로

- `/inquiries`
- `/inquiries/new`
- `/inquiries/[id]`
- `/api/inquiries/*`
- `/api/internal/request-log` (내부 미들웨어 전용)
