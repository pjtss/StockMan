# 코드 구조

## 런타임 경계

```text
app/                 Next.js App Router 화면·HTTP 라우트
  api/                외부 호출 경계. 인증, 입력 검증, request trace 담당
components/           클라이언트 UI. 서버/DB 직접 접근 금지
lib/                  도메인·외부 연동·애플리케이션 서비스
db/migration/         Flyway 순차 SQL 마이그레이션
scripts/              개발·OCI 운영 스크립트
deploy/oci/           systemd·nginx·OCI 배포 자산
docs/                 구조·개발·운영·공식 참고 문서
public/               정적 자산
```

## `lib/` 모듈 분류

| 영역 | 대표 모듈 | 책임 |
|---|---|---|
| 공통 기반 | `db.ts`, `schema.ts`, `request-trace.ts`, `error-diagnostics.ts` | DB 연결, 스키마, 추적 ID, 오류 정규화 |
| 설정·자동화 | `feature-module-settings.ts`, `automation-run.ts`, `schedule-time.ts` | DB 설정, 실행 이력, KST 일정 판정 |
| KIS 인증 | `kis-token.ts`, `kis-authorization.ts`, `kis-request-throttle.ts` | 토큰 수명주기, Authorization, 호출 직렬화·재시도 |
| KIS 시세 | `kis-us*.ts`, `kis-kr*.ts`, `kis-chart.ts` | 해외·국내 원본 API 호출과 파싱 |
| 캐시 | `us-daily-price-cache*.ts`, `kr-daily-price-cache.ts` | 일·주·월봉과 시세 DB 저장·조회 |
| 탐지 | `us-*scan.ts`, `*-bollinger-band.ts`, `us-daily-trend-scan.ts` | DB 캐시 기반 지표 계산과 필터 |
| 알림 | `discord-*.ts`, `discord-text.ts`, `discord-delivery-*` | Discord DTO, 웹훅 전송, 재시도·중복 방지 |
| RSS·공시 | `market-rss*.ts`, `sec-*.ts`, `dart-*.ts` | 수집·정규화·분류·분석·전송 |
| 상품·유니버스 | `us-instruments.ts`, `kr-instruments.ts`, `us-product-classification.ts` | 종목 수집, 상품 분류, 탐지 대상 결정 |

## 의존성 규칙

- `components/` → `app/api` 호출만 사용하고 `lib/db`를 직접 import하지 않습니다.
- `app/api`는 외부 입력을 검증한 뒤 `lib/` 애플리케이션 서비스를 호출합니다.
- KIS 호출은 `kis-token`과 `kis-request-throttle`을 우회하지 않습니다.
- 일봉 탐지는 KIS를 직접 호출하지 않고 캐시 저장소를 사용합니다.
- Discord 전송은 기능 모듈에서 payload를 만들고 공통 delivery 정책을 거칩니다.
- DB 스키마 변경은 기존 migration 수정이 아니라 새 `V번호__설명.sql`로 추가합니다.

## 새 기능 추가 순서

1. `lib/`에 순수 계산·도메인 규칙을 먼저 작성합니다.
2. 외부 API 저장소와 애플리케이션 조율 모듈을 분리합니다.
3. `app/api` 라우트와 관리자 테스트를 연결합니다.
4. 자동화 cron과 Discord 전송을 연결합니다.
5. 단위 테스트, 문서, 운영 확인 절차를 같은 변경에 추가합니다.
