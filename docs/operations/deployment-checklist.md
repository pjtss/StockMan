# 배포 전 체크리스트

배포는 아래 순서를 모두 통과한 경우에만 진행한다. 체크리스트는 사람이 읽는 운영 기준이고, 자동 검증은 `npm run deploy:verify`가 담당한다.

전체 기획·개발·테스트·배포·개선 흐름은 [`delivery-lifecycle.md`](../development/delivery-lifecycle.md)를 기준으로 한다.
운영 지표와 개선 과제 관리는 [`continuous-improvement.md`](./continuous-improvement.md)를 기준으로 한다.
검토 주기와 성과 판정은 [`improvement-review.md`](./improvement-review.md)를 기준으로 한다.

## 배포 전

- [ ] 이번 변경 범위와 포함하지 않을 로컬 변경사항을 확인한다.
- [ ] Flyway 파일명이 `V숫자__설명.sql` 형식이고 버전이 중복되지 않는지 확인한다.
- [ ] 운영 환경변수와 비밀값을 로그에 출력하지 않는다.
- [ ] DB 스키마 변경이 있으면 기존 운영 버전과 충돌하지 않는 새 버전을 사용한다.
- [ ] 변경 기능에 회귀 테스트가 있는지 확인한다.

## 자동 게이트

- [ ] 전체 테스트 통과
- [ ] 타입검사 통과
- [ ] 필수 문서 및 Flyway 검사 통과
- [ ] OCI cron 구조·셸 문법 검사 통과
- [ ] production build 성공
- [ ] standalone 서버 실행 및 `/charts` smoke test 성공
- [ ] Next.js HTML은 재검증되고, 이전 릴리스의 해시 정적 청크 호환 보존 경로가 포함되어 있는지 확인

## 배포 후

- [ ] GitHub Actions `Deploy OCI` 성공 확인
- [ ] 운영 health endpoint와 핵심 변경 경로 확인
- [ ] Flyway 적용 버전 확인
- [ ] 실패 시 원인·영향·수정·검증 결과를 `docs/ERROR_HANDLING.md`에 기록한다.

## 재발 방지 원칙

검증 실패를 경고로 취급하지 않는다. 특히 마이그레이션 충돌, 테스트 실패, 타입 오류, 빌드 실패, runtime smoke test 실패 중 하나라도 있으면 패키징·업로드·활성화로 진행하지 않는다.
