# 문서 관리·SRP 검증 기준

## 목적

이 문서는 프로젝트 문서가 어디에 있어야 하는지와 코드의 단일 책임 경계가 실제로 지켜지는지 검증하는 기준이다. 설계 문서만 존재하는 상태를 구현 완료로 간주하지 않으며, 코드·테스트·운영 절차가 함께 확인되어야 한다.

## 문서 구조

| 영역 | 위치 | 담당 내용 |
|---|---|---|
| 아키텍처 | `docs/architecture/` | 모듈 경계, 데이터 흐름, DB 구조 |
| 개발 | `docs/development/` | 코딩·테스트·마이그레이션 규칙 |
| 운영 | `docs/operations/` | 배포·스케줄·장애 대응 |
| 공식 참고 | `docs/official/`, `docs/references/` | KIS·DART·SEC 공식 문서와 원본 보관 기준 |
| 기능 설계 | `docs/*.md` | 기능별 계약과 사용자 동작 |
| 변경 이력 | `Development.md`, `DEVELOPMENT_LOG.md` | 구현·검증·운영 변경 기록 |

새 문서는 이 분류 중 하나에만 속하게 하고, `docs/README.md`의 인덱스에 연결한다. 현재 동작 문서와 제안 문서는 제목과 상태를 구분한다. 비밀값과 실제 API 키·웹훅은 문서에 저장하지 않는다.

## SRP 경계

| 책임 | 허용 위치 | 금지되는 혼합 |
|---|---|---|
| HTTP 입력·인증·응답 | `app/api/**/route.ts` | 지표 계산, 장시간 수집, 직접적인 복합 SQL |
| 화면 상태·렌더링 | `components/` | DB 연결, 서버 비밀값, 외부 API 직접 호출 |
| 도메인 계산·판정 | `lib/*screener*`, `lib/*indicator*` | HTTP 요청/응답 형식 |
| 외부 API 수집·파싱 | `lib/*client*`, `lib/kis*`, `lib/sec*`, `lib/dart*` | 화면 전용 상태와 알림 전송 |
| 저장소 | `lib/*repository*`, DB 경계 모듈 | 도메인 판정과 사용자 화면 렌더링 |
| 전송 | `lib/discord*`, `lib/push*` | 원본 수집과 지표 계산 |
| 오케스트레이션 | `lib/*pipeline*`, `lib/*job*`, cron | 세부 파서·전송 구현의 중복 |

라우트는 입력 검증과 애플리케이션 서비스 호출까지만 담당한다. 컴포넌트는 API를 통해서만 서버 기능을 사용한다. KIS 인증·throttle, 캐시 저장, 지표 계산, 알림 전달은 각각의 공통 모듈 경계를 우회하지 않는다.

## 변경 시 필수 산출물

1. 책임이 바뀐 코드와 대응 문서를 같은 변경 세트에서 수정한다.
2. 외부 API·DB·오케스트레이션 변경에는 관련 단위 테스트를 추가하거나 갱신한다.
3. 오류 수정은 `docs/ERROR_HANDLING.md`에 원인·영향·수정 위치·검증 결과를 기록한다.
4. DB 변경은 새 Flyway migration으로만 추가하고 `docs/architecture/database-schema.md`를 갱신한다.
5. 검증은 `npm run typecheck`, `npm run docs:check`, 관련 테스트, 필요 시 `npm run build` 순서로 수행한다.

## 현재 점검 결과

- 최신 현재 상태 기준서는 [`current-system-reference.md`](./current-system-reference.md)다. 구조·정책·SRP 판단의 출발점으로 사용한다.
- 상세 책임·의존성·검증 증거는 [`system-module-catalog.md`](./system-module-catalog.md)에서 책임별로 나누어 관리한다. 이 문서가 전체 원칙을, 카탈로그가 파일군과 변경 촉발 조건을 담당한다.

- 문서 진입점: 충족 (`docs/README.md`, 영역별 README 존재).
- 공식 문서 보관 경계: 충족 (`docs/official/`, `docs/references/`).
- 코드 책임 분류: 충족하는 구조가 있으나, 대형 UI·통합 모듈은 기능 추가 시 분리 후보로 계속 점검한다.
- 자동 검증: 문서 진입점과 migration 파일명은 `scripts/check-docs.mjs`가 검사한다. 본 문서가 추가되면서 문서 인덱스와 필수 진입점 검사에도 포함한다.

이 문서는 특정 파일의 크기만으로 SRP 위반을 판정하지 않는다. 책임이 둘 이상으로 분리되어야 하는 근거가 있고, 테스트 가능한 경계가 필요한 경우에만 분리한다.

## 문서 자체의 SRP

문서도 하나의 변경 이유만 가져야 한다.

- `current-system-reference.md`: 전체 실행 경계·데이터 흐름·불변식
- `system-module-catalog.md`: 책임별 모듈·의존성·분리 백로그
- `code-structure.md`: 디렉터리와 파일 배치 규칙
- `external-request-boundaries.md`: 외부 요청 공통 계약
- 기능별 설계서: 특정 기능의 정책과 사용자 계약
- 운영 문서: 배포·장애·지속 개선 절차

새 문서가 기존 문서의 책임을 복제하면 인덱스에 추가하기 전에 어느 문서를 권위로 삼을지 결정한다. 동일 내용을 여러 문서에 복사하지 않고 링크로 연결한다.
