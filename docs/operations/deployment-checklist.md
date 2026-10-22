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
- [ ] 운영 Flyway 버전보다 낮은 migration에만 있는 필수 테이블/컬럼은 현재 운영 floor 이후의 forward repair migration으로 다시 보장한다. `npm run docs:check`가 운영 floor 기반 컬럼 회귀를 검사한다.
- [ ] 변경 기능에 회귀 테스트가 있는지 확인한다.
- [ ] 번역 quota 예약 SQL은 매개변수 타입을 명시하고 `translation-cache.test.ts`의 예약 성공 회귀 테스트를 통과한다.

## 자동 게이트

- [ ] 전체 테스트 통과
- [ ] 타입검사 통과
- [ ] 필수 문서 및 Flyway 검사 통과
- [ ] OCI cron 구조·셸 문법 검사 통과
- [ ] Bearer 인증 파서 이중 이스케이프 정적 감사 통과 (`npm run audit:bearer-auth`)
- [ ] production build 성공
- [ ] standalone 서버 실행 및 `/charts` HTML과 HTML이 참조한 실제 JavaScript 청크 전체 smoke test 성공 (HTTP 200·JavaScript content-type·본문 존재)
- [ ] Chrome 데스크톱·모바일에서 `/charts` 핵심 UI가 표시되고 국내↔해외 전환 상호작용, hydration 경고, 브라우저 런타임 예외 검증 통과
- [ ] Next.js HTML은 재검증되고, 이전 릴리스의 해시 정적 청크 호환 보존 경로가 포함되어 있는지 확인

## 배포 후

- [ ] GitHub Actions `Deploy OCI` 성공 확인
- [ ] 운영 health endpoint와 핵심 변경 경로 확인
- [ ] `stockman-rss.timer`가 active이며 `stockman-rss.service` 최근 실행과 `market-rss` 자동화 run이 갱신됐는지 확인
- [ ] Flyway 적용 버전 확인
- [ ] `/api/health`가 200/status=ok이며 `missingOperationalTables`와 `missingOperationalColumns`가 비어 있는지 확인
- [ ] 실패 시 원인·영향·수정·검증 결과를 `docs/ERROR_HANDLING.md`에 기록한다.

## 재발 방지 원칙

검증 실패를 경고로 취급하지 않는다. 특히 마이그레이션 충돌, 테스트 실패, 타입 오류, 빌드 실패, runtime smoke test 실패 중 하나라도 있으면 패키징·업로드·활성화로 진행하지 않는다.
