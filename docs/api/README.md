# 외부 API 문서 구조와 유지 기준

## 외부 배포 파일

- 사용자·AI용 상세 한국어 매뉴얼: [`/api-reference.md`](../../public/api-reference.md)
- AI discovery index: [`/llms.txt`](../../public/llms.txt)
- OpenAPI 3.1.1 JSON: [`/openapi.json`](../../public/openapi.json)
- 전체 route method/access/source 인벤토리: [`route-inventory.json`](./route-inventory.json)

Next.js `public/` 파일은 동일 경로에서 정적으로 제공한다. OpenAPI `servers`는 `/` 상대 경로를 쓰므로 로컬·스테이징·운영 도메인에 주소를 하드코딩하지 않는다. 실제 프로젝트 계약은 각 operation의 `x-code-path`와 현재 `app/api/**/route.ts` 구현이다.

API path는 현재 `/api`이며 major version prefix는 없다. OpenAPI `info.version`은 문서 버전이며 API endpoint version으로 해석하지 않는다.

## 공개 범위 결정

외부 AI 공개 범위는 읽기 API로 제한한다. GET method는 무변경을 보증하지 않으므로 라우트 본문에서 확인된 snapshot write 및 KIS realtime ticket 발급 route를 `read-with-side-effect`로 따로 분류한다. URL query에 서명 토큰을 싣는 다운로드 경로는 `signed-link`로 분류해 외부 AI 명세에서 제외한다. 로그인·개인정보, 관리자, debug, cron, internal, webhook, 쓰기/작업 실행 route는 public OpenAPI에 넣지 않는다. 경로/메서드 전체는 운영·개발자가 발견할 수 있게 inventory에 유지한다.

외부 공개 OpenAPI에 포함되는 모든 읽기 전용 GET은 무인증이어야 한다. 사용자·관리자 정보, 내부 진단, 쓰기·작업 실행 및 GET 부수효과가 있는 route는 공개 명세에서 제외한다. API surface 감사는 외부 GET의 Bearer 인증과 공개 후보 route의 요청자 인증 확인을 실패 처리한다.

인벤토리의 `service-bearer`는 내부·운영 전용 분류로만 남길 수 있으며 외부 읽기 전용 GET 명세에 포함할 수 없다.

## 생성·감사

`scripts/api-surface.mjs`는 `app/api/**/route.ts`의 exported HTTP methods, path, 제한적 인증/side-effect 표식을 읽어 inventory와 public GET OpenAPI operation을 만든다.

미국 OBV 다이버전스 공개 `GET /api/scan/us-obv-divergence`는 사전 계산 DB 스냅샷만 읽는다. 계산·쓰기 작업은 `POST /api/cron/us-obv-divergence-snapshot`에서 cron secret으로 보호하고 외부 OpenAPI에는 GET만 노출한다. 응답·query 계약은 [`public/api-reference.md`](../../public/api-reference.md)의 OBV 항목과 API surface generator의 응답 schema를 함께 갱신한다.

    npm run docs:api:generate
    npm run audit:api-surface

생성 전후 다음을 검토한다.

1. 신규 API의 실제 입력 검증, 인증, 사용자별 데이터 여부, DB write와 외부 action을 확인한다.
2. route access 분류가 부정확하면 `accessFor`의 규칙을 보완한다. 자동 분류는 검토를 대신하지 않는다.
3. 공개 GET의 query validation, 응답 예시/schema, 오류 코드와 freshness metadata를 `public/api-reference.md`에 기술한다.
4. 새 API는 필요하면 OpenAPI operation의 manual schema 보강을 반영하고, OpenAPI spec을 OpenAPI 공식 문서 기준으로 확인한다.
5. route 추가·변경·삭제 때 inventory와 OpenAPI를 재생성한 뒤 audit을 실행한다.
6. `npm run deploy:verify`는 실제 standalone package에 discovery 파일을 복사해 HTTP로 읽을 수 있는지 검증한다.

## 현재 한계와 다음 개선

- OpenAPI generator는 query key 이름을 코드에서 추출하지만, 모든 복잡한 타입·조건부 필수성·응답 DTO를 정적으로 알아낼 수는 없다. 현재 문서에 상세 계약이 명시되지 않은 endpoint는 소스 경로를 기준으로 확인해야 하며, 생성된 generic object 응답 schema를 완전 계약으로 해석하면 안 된다.
- 인증 없이 열려 있는 read route에 전역 API quota/key가 적용되지는 않는다. route별 현재 제한은 구현에 따르며, 공통 public API rate limit 및 운영 key 발급·회수 정책은 별도 후속 설계다.
- CI에 `npm run audit:api-surface`를 연결해 route drift를 자동 검출한다.

## 공식 문서

- [OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)
- [Next.js 15 Route Handlers](https://nextjs.org/docs/15/app/getting-started/route-handlers-and-middleware)
