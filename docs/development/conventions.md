# 개발·문서화 규칙

## 파일과 모듈

- 파일명은 기존 영역 접두사를 유지합니다. 예: `us-`, `kr-`, `sec-`, `dart-`, `discord-`.
- 계산 함수는 가능한 한 입력과 출력을 명시하고 외부 호출을 포함하지 않습니다.
- 원본 응답이 필요한 관리자 진단은 `rawText`와 구조화된 `diagnostics`를 함께 반환합니다.
- 민감한 헤더는 `Authorization: Bearer <masked>`, `appkey: <masked>` 형태로만 노출합니다.

## 테스트

```powershell
npx tsc --noEmit
npm test
npm run docs:check
npm run build
```

외부 API가 필요한 테스트는 실제 자격증명을 테스트 파일에 넣지 말고 응답 fixture 또는 mock을 사용합니다.

## DB 마이그레이션

- 마이그레이션 파일은 `db/migration/V<번호>__<snake_case_description>.sql` 형식을 사용합니다.
- 이미 운영에 적용된 파일은 수정하지 않습니다. 수정이 필요하면 새 버전을 만듭니다.
- SQL은 재실행 안전성을 고려하고, 테이블 존재 여부가 선택적인 경우 `IF EXISTS`를 사용합니다.
- 적용 전 `flyway validate`, 적용 후 `/api/health`의 `flywayVersion`과 `missingTables`를 확인합니다.

## 문서 갱신

기능 변경 시 다음을 확인합니다.

- 현재 동작 문서 또는 기능 설계 문서
- `Development.md` 변경 기록
- 환경변수 변경 시 `.env.example` 및 `Env.md`
- 관리자 API 변경 시 운영 런북과 테스트 목록

문서 검증은 `npm run docs:check`로 수행합니다.
