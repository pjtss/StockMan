# StockMan 문서 인덱스

이 프로젝트의 운영 기준 문서는 기능 코드와 분리해 `docs/` 아래에서 관리합니다.
문서를 새로 추가할 때는 아래 분류 중 하나를 선택하고, 이 인덱스에 링크를 추가합니다.

## 문서 분류

| 분류 | 목적 | 위치 |
|---|---|---|
| 아키텍처 | 모듈 경계, 데이터 흐름, 저장 구조 | [`architecture/`](./architecture/) |
| 개발 | 코딩·테스트·마이그레이션 규칙 | [`development/`](./development/) |
| 운영 | 배포, 스케줄, 장애 대응, 디버깅 | [`operations/`](./operations/) |
| 외부 문서 | KIS·SEC·DART 등 공식 문서 요약 | [`references/`](./references/) |
| 기능 설계 | 특정 기능의 동작·필터·알림 계약 | 루트 `docs/*.md` |
| 변경 기록 | 날짜별 구현·운영 변경 내역 | [`../Development.md`](../Development.md), [`../DEVELOPMENT_LOG.md`](../DEVELOPMENT_LOG.md) |

## 시작점

- 코드 구조: [`architecture/code-structure.md`](./architecture/code-structure.md)
- 데이터베이스·전체 테이블 구조: [`architecture/database-schema.md`](./architecture/database-schema.md)
- 전체 제품·데이터·자동화 구조: [`architecture/project-architecture.md`](./architecture/project-architecture.md)
- 국내·해외 전체 종목 통합 유니버스 동기화 설계: [`architecture/instrument-universe-sync.md`](./architecture/instrument-universe-sync.md)
- 개발 규칙: [`development/conventions.md`](./development/conventions.md)
- 운영 런북: [`operations/runbook.md`](./operations/runbook.md)
- 프로젝트 전체 디버깅 구조: [`DEBUGGING_ARCHITECTURE.md`](./DEBUGGING_ARCHITECTURE.md)
- 일·주·월봉 캐시 갱신: [`CANDLE_REFRESH_DESIGN.md`](./CANDLE_REFRESH_DESIGN.md)
- 볼린저밴드 탐지 계약: [`bollinger-band-operations.md`](./bollinger-band-operations.md)
- 관리자 모듈 그룹: [`admin-module-groups.md`](./admin-module-groups.md)
- 외부 공식 문서 인덱스: [`references/README.md`](./references/README.md)
- KIS 종목 마스터 원본 보관소: [`references/kis-instrument-masters/README.md`](./references/kis-instrument-masters/README.md)

## 문서 원칙

1. 현재 동작을 설명하는 문서와 미래 제안 문서를 제목에서 구분합니다.
2. API 경로, 환경변수, DB 테이블명은 코드와 동일한 이름으로 작성합니다.
3. 운영 결과에는 확인 시각과 검증 방법을 함께 기록합니다.
4. 비밀값·토큰·실제 웹훅 URL은 문서에 저장하지 않습니다.
5. 기능 변경 시 관련 문서와 `Development.md`를 같은 변경 세트에서 갱신합니다.
