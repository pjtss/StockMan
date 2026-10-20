# 배포 검증 표준

모든 배포 경로는 실제 배포 전에 동일한 `npm run deploy:verify` 게이트를 통과해야 한다.

사람이 확인할 운영 항목은 [`deployment-checklist.md`](deployment-checklist.md)에 관리한다. 체크리스트와 자동 게이트가 불일치하지 않도록 검증 명령을 추가하거나 변경할 때 문서도 함께 갱신한다.

## 검증 순서

1. `npm test -- --run`
2. `npm run typecheck`
3. `npm run docs:check`
4. `npm run cron:check` 및 OCI cron 스크립트 문법 검사
5. `npm run build`
6. 생성된 standalone production build를 임시 포트에서 실행
7. `/charts` HTML에서 참조된 모든 `/_next/static/*.js` 청크가 HTTP 200, JavaScript content-type, 비어 있지 않은 본문으로 응답하는지 확인
8. 설치된 Chrome으로 `/charts`를 데스크톱·모바일 viewport에서 열어 핵심 UI를 확인하고, 국내↔해외 전환 상호작용으로 클라이언트 hydration을 검증
9. React hydration 경고와 처리되지 않은 브라우저 런타임 예외가 없음을 확인
10. 핵심 API smoke를 통과한 뒤 서버 종료

브라우저 검증은 `scripts/charts-browser-smoke.mjs`가 담당한다. Playwright 라이브러리는 프로젝트 개발 의존성이며 브라우저 바이너리는 별도 다운로드하지 않고 설치된 Google Chrome 채널을 사용한다. 따라서 로컬 및 CI runner는 Chrome을 설치해야 하고, runner 이미지가 바뀌면 공식 이미지 사양을 재검증한다.

빠른 게이트 실패 시 빌드·전체 테스트 전에 중단한다. 빌드는 전체 테스트 전에 수행해 테스트 worker의 자원 점유와 Next.js 빌드 간 간섭을 피한다. Runtime smoke는 배포 artifact의 응답 가능성과 HTML/JSON content delivery를 검사하되 KIS·DB 의존 business API를 호출하지 않아 검증 도중 운영 외부 요청이나 장시간 대기를 유발하지 않는다. 도메인별 동작은 단위·통합 테스트에서 검증한다. 어느 단계든 실패하면 패키징·업로드·활성화 단계로 진행하지 않는다. 실행 검증은 `scripts/verify-deploy.mjs`가 담당하며, OCI GitHub Actions도 이 모듈을 호출한다. 패키징과 서버 활성화는 배포 환경에 종속된 별도 단계로 유지한다.

## 운영 원칙

- 검증 로직은 명령 실행, health polling, 프로세스 정리를 각각 독립 책임으로 유지한다.
- 각 HTTP smoke 요청의 기본 timeout은 30초이며 `DEPLOY_VERIFY_SMOKE_REQUEST_TIMEOUT_MS`로 조정할 수 있다. 전체 poll deadline은 최소한 한 차례 재시도할 수 있도록 `max(configured deadline, request timeout × 2 + 1초)`를 적용한다. 로컬 부하에서 `/charts`가 기본 15초에 중단되는 재현을 반영해 요청 제한과 재시도 창을 모두 확보한다.
- 배포 워크플로에 개별 검증 명령을 다시 복제하지 않는다.
- 실행 포트는 `DEPLOY_VERIFY_PORT`로 덮어쓸 수 있으며 기본값은 `3100`이다.
