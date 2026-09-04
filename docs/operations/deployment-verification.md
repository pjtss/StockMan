# 배포 검증 표준

모든 배포 경로는 실제 배포 전에 동일한 `npm run deploy:verify` 게이트를 통과해야 한다.

## 검증 순서

1. `npm test -- --run`
2. `npm run typecheck`
3. `npm run docs:check`
4. `npm run cron:check` 및 OCI cron 스크립트 문법 검사
5. `npm run build`
6. 생성된 standalone production build를 임시 포트에서 실행
7. `/charts` 응답이 성공한 뒤 서버 종료

검증 중 하나라도 실패하면 패키징·업로드·활성화 단계로 진행하지 않는다. 실행 검증은 `scripts/verify-deploy.mjs`가 담당하며, OCI GitHub Actions도 이 모듈을 호출한다. 패키징과 서버 활성화는 배포 환경에 종속된 별도 단계로 유지한다.

## 운영 원칙

- 검증 로직은 명령 실행, health polling, 프로세스 정리를 각각 독립 책임으로 유지한다.
- 배포 워크플로에 개별 검증 명령을 다시 복제하지 않는다.
- 실행 포트는 `DEPLOY_VERIFY_PORT`로 덮어쓸 수 있으며 기본값은 `3100`이다.
