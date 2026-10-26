# 사용자 기능 제거 배포 기록 (2026-10-26)

## 범위

- 국내 상승률 TOP 100 전용 페이지, 컴포넌트, 네비게이션 링크 및 화면 전용 테스트를 제거했다.
- 탐지 후보, 메모장, 문의, 공지사항, 투자 일정의 사용자 UI와 요청한 전용 API·테스트·수집 실행 경로를 제거했다.
- 제거된 페이지를 가리키던 네비게이션, 공유 뉴스 CSS 이름, 사용자 활동 분류와 cron 호출을 정리했다.
- 장중 탐지 worker/API, 국내 상승률 차트 API, DART 공시, 미국 TOP 100 기능은 별도 사용 경로가 있어 유지했다.
- 이미 적용된 DB migration 이력과 일정 테이블 데이터는 보존했다. DROP migration은 추가하지 않았다.

## 검증

- `npm.cmd run deploy:verify`: 통과. 의존성 감사, 프로덕션 빌드, standalone `/charts` 실행·정적 자산·데스크톱/모바일 hydration, API smoke, 전체 테스트(277 files; 1,377 passed, 2 skipped), 타입 검사, 문서·권한·KIS 경계·cron 검사를 확인했다.
- 로컬 개발 서버 HTTP smoke: `/charts`, `/market-news`, 보존 API는 200; 제거된 사용자 페이지와 전용 API는 404.
- 개발 PC의 미추적 분석 스크립트가 전체 TypeScript 빌드에 섞이지 않도록 검증 중 임시 디렉터리로 이동했다가 종료 후 원래 경로로 복구했다. 해당 스크립트와 조사 파일은 배포에 포함하지 않는다.
- `git diff --check`: 통과.

## 배포

- 배포 대상은 `origin/oci`다. `.github/workflows/deploy-oci.yml`은 해당 브랜치 push에서 `deploy:verify`를 다시 수행하고, 검증 및 OCI 활성화가 성공한 경우에만 운영 릴리스를 완료한다.
- 이력은 본 문서와 해당 배포 commit으로 추적한다. 로컬 검증 통과만으로 운영 배포 완료를 간주하지 않는다.
