# StockMan

국내·해외 주식 데이터를 수집하고 PostgreSQL 캐시·공통 적격성 필터·기술적/수급/공시 신호를 결합해 관리자 화면과 Discord로 전달하는 Next.js 애플리케이션입니다.

## 현재 범위

- 국내·해외 KIS 데이터 수집 및 일·주·월봉 분석
- OBV·ADL·MACD·DMI·MFI·볼린저밴드·돌파·VWAP·거래대금 탐지
- SEC EDGAR·DART·시장 RSS 수집·분류·전송
- ETF·레버리지·워런트·파생상품 공통 제외
- PostgreSQL 원본/정규화 캐시와 자동화 실행 이력
- 관리자 기능 설정·수동 테스트·원본 JSON·자동화 관측성
- Discord Webhook 및 Slash Command 연동

현재 관리자 인증은 `ADMIN_DASHBOARD_PASSWORD` 기반 세션 인증입니다. 회원가입/JWT 사용자 인증은 현재 제품 범위에 포함되지 않습니다.

## 개발 실행

```bash
npm ci
npm run dev
```

필수 환경변수는 `.env.example`과 `Env.md`를 참고합니다. 운영 비밀값은 `.env.local` 또는 서버 환경변수에만 저장합니다.

## 품질 검증

```bash
npm run verify
```

다음 검사를 순서대로 실행합니다.

1. 전체 Vitest 테스트
2. TypeScript 검사
3. 문서·Flyway 마이그레이션 검사
4. OCI cron endpoint 구조 검사
5. Next.js 프로덕션 빌드

OCI 배포에서는 위 검증 외에 Ubuntu에서 `bash -n scripts/oci-cron.sh`도 실행합니다.

## 운영 구조

- `app/api/cron`: OCI cron이 호출하는 자동화 HTTP 경계
- `lib/*-automation.ts`: 수집·평가·저장·전송 application service
- `lib/feature-module-settings.ts`: 관리자 설정과 DB fallback
- `lib/automation-run.ts`: 실행 이력·소요 시간·완료 알림 상태
- `lib/automation-debug.ts`: 관리자 자동화 진단 조회
- `scripts/oci-cron.sh`: 전체 예약 실행 오케스트레이션
- `db/migration`: Flyway 스키마 변경
- `docs/architecture/project-architecture.md`: 상세 계층·데이터 계약·운영 기준

## 운영 확인

- 서비스 상태: `/api/health`
- 관리자 건강 상태: `/health-check`
- 자동화 관측성: `/admin/observability`
- 기능 설정: `/admin/modules`
- API 수동 테스트: `/admin/api-tests`

## 배포

`oci` 브랜치 push 또는 GitHub Actions 수동 실행으로 `.github/workflows/deploy-oci.yml`을 실행합니다. 검증·standalone 빌드·OCI 활성화가 순서대로 진행되며, 검증 실패 시 서버 활성화는 실행되지 않습니다.

## 문서

- [프로젝트 구조 및 운영 기준](docs/architecture/project-architecture.md)
- [운영 런북](docs/operations/runbook.md)
- [개발 변경 이력](Development.md)
- [환경변수 설명](Env.md)
