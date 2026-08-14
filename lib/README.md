# `lib/` 도메인 모듈

`lib/`는 HTTP 라우트와 UI에서 공통으로 사용하는 서버·도메인 모듈입니다.

- `kis-*`: KIS 인증·원본 API·파싱
- `*-daily-*`, `*-bollinger-*`, `us-*scan*`: 캐시 기반 일봉 탐지
- `market-rss*`, `sec-*`, `dart-*`: RSS·공시 수집 파이프라인
- `discord-*`, `discord-delivery-*`: 알림 payload·전달
- `feature-*`, `automation-*`, `schedule-*`: 기능 설정·예약 실행
- `*-repository.ts`: DB 읽기·쓰기 경계
- `*.test.ts`: 해당 모듈의 단위 테스트

새 모듈은 위 책임 중 하나에 속해야 하며, 서로 다른 책임을 하나의 파일에 합치지 않습니다. 상세 경계는 [`../docs/architecture/code-structure.md`](../docs/architecture/code-structure.md)를 따릅니다.
