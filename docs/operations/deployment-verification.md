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
8. 핵심 API smoke를 통과한 뒤 서버 종료

검증 중 하나라도 실패하면 패키징·업로드·활성화 단계로 진행하지 않는다. 실행 검증은 `scripts/verify-deploy.mjs`가 담당하며, OCI GitHub Actions도 이 모듈을 호출한다. 패키징과 서버 활성화는 배포 환경에 종속된 별도 단계로 유지한다.

## 운영 원칙

- 검증 로직은 명령 실행, health polling, 프로세스 정리를 각각 독립 책임으로 유지한다.
- 각 HTTP smoke 요청의 기본 timeout은 30초이며 `DEPLOY_VERIFY_SMOKE_REQUEST_TIMEOUT_MS`로 조정할 수 있다. 전체 poll deadline은 최소한 한 차례 재시도할 수 있도록 `max(configured deadline, request timeout × 2 + 1초)`를 적용한다. 로컬 부하에서 `/charts`가 기본 15초에 중단되는 재현을 반영해 요청 제한과 재시도 창을 모두 확보한다.
- 배포 워크플로에 개별 검증 명령을 다시 복제하지 않는다.
- 실행 포트는 `DEPLOY_VERIFY_PORT`로 덮어쓸 수 있으며 기본값은 `3100`이다.
