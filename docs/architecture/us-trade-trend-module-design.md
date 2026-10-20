# 해외주식 체결추이 모듈화 설계

상태: 로컬 수동 조회 경로 1차 구현 (2026-10-19)

## 목적

KIS 해외주식 체결추이(`inquire-ccnl`, `HHDFS76200300`)를 다른 해외 시세 API와 분리하고, 입력 검증·KIS 통신·응답 해석·조회 조율·저장 책임을 각각 테스트하고 변경할 수 있게 한다. 기존 API 소비자와 응답 계약을 유지하는 점진적 리팩터링을 기준으로 한다.

## 현재 구현과 확인된 경계

```text
GET /api/kis/market-flow?market=US&code=AAPL
  └─ app/api/kis/market-flow/route.ts
       ├─ 티커/시장 입력 검증
       ├─ fetchKisUsTradeTrend({ code })
       │    ├─ KIS 설정 및 토큰 조회/갱신
       │    ├─ 거래소 fallback (NAS → AMS → NYS)
       │    ├─ HTTP 요청 및 throttle
       │    └─ output1/output2 파싱 및 DTO 정규화
       ├─ writeKisSignalSnapshot(...)
       └─ HTTP 응답 조립
```

- `lib/kis-us-trade-trend.ts`는 체결추이 외에 일봉·분봉·호가·상품정보 요청도 함께 보유한다.
- 체결추이의 순수 행 변환, 네트워크 요청, 토큰 만료 재시도, 거래소 선택이 `fetchKisUsTradeTrend`와 파일 내부 `parse`에 함께 있다.
- 함수 입력 형식은 `market`과 `day`를 지원하지만 현재 라우트는 `{ code }`만 전달한다. 따라서 API 입력의 `exchange`는 기본 체결추이 경로에 실제 적용되지 않는다. 이를 모듈화 시 명시적으로 고쳐야 한다.
- 성공 응답은 현재 `rows`, `diagnostics`, `flowStatus`, `collectedAt` 등을 제공한다. 기존 호출자를 깨뜨리지 않도록 이전 필드와 상태코드는 호환 계층에서 유지한다.
- 저장은 일반 `kis_signal_snapshots` 스냅샷 기록 경로다. 이는 틱 원장이나 연속 수집 저장소가 아니다.

## 목표 모듈 구성

| 모듈 | 단일 책임 | 입력/출력 |
|---|---|---|
| `lib/us-trade-trend-contract.ts` | 도메인 타입·검증 가능한 값 객체 | 거래소, 티커, 조회 기준, 체결 행 DTO |
| `lib/kis-us-trade-trend-mapper.ts` | KIS 원시 payload를 안정된 DTO로 변환 | `output1/output2` → `KisUsTrade[]`, 파싱 진단 |
| `lib/kis-us-trade-trend-client.ts` | KIS 요청 생성·전송 및 KIS 인증 수명주기 경계 | 단일 거래소 요청 → 원시 HTTP/KIS 응답 |
| `lib/us-trade-trend-service.ts` | 거래소 fallback, 성공 판정, 호출 결과 조립 | 사용자 조회 입력 → 애플리케이션 결과 |
| `lib/kis-signal-snapshot.ts` (기존) | 관측 스냅샷 저장 | 정규화된 응답·상태 |
| `app/api/kis/market-flow/route.ts` | HTTP 입력 검증 및 응답 호환성 | URL → service 호출 → JSON |

새 모듈은 각자 독립 변경 이유가 확인된 경우에만 추가한다. 첫 추출에서는 분석 지표, DB 원장, cron 수집기를 만들지 않는다. 분석은 기존 `lib/us-trade-intensity-metrics.ts`, 영속적 중복 제거가 필요한 틱 원장은 별도 요구와 스키마 설계가 있을 때 별도 단계로 둔다.

### 호출 계약

```ts
type UsTradeTrendQuery = {
  code: string;
  exchange?: "NAS" | "NYS" | "AMS";
  day?: "0" | "1"; // KIS TDAY: 0=전일, 1=당일
};

type UsTradeTrendResult = {
  ok: boolean;
  code: string;
  exchange: "NAS" | "NYS" | "AMS"; // 실제 응답을 얻은 거래소
  day: "0" | "1";
  trades: UsTrade[];
  diagnostics: { status: number; rt_cd: string | null; msg_cd: string | null; msg1: string | null; outputKey: string | null };
};
```

타입 이름은 기존 소비자 조사 후 확정한다. 현재 응답에서 사용하는 `market` 필드는 기존 호환 응답에 남기되, 새 service 내부에서는 거래소 의미가 드러나는 `exchange`를 권장한다. KIS 원문 `rawText`는 관리자 진단 등 허용된 경로에만 전달하고 일반 공개 응답이나 로그에 무조건 노출하지 않는다.

## 책임과 정책

1. Route는 티커·시장·거래소·조회 기준을 검증하고 service를 한 번 호출한다. 토큰 갱신, API URL 조립, 행 파싱 및 거래소 fallback을 소유하지 않는다.
2. Service는 입력 거래소가 있으면 해당 거래소만 조회한다. 없으면 현재 순서 NAS→AMS→NYS를 유지한다. fallback 시도 기록은 민감정보를 제외해 진단 DTO로 제공할 수 있다.
3. Client는 endpoint, `HHDFS76200300`, query string, 표준 KIS 인증 헤더, 요청 throttle, timeout, 토큰 만료 응답 재시도를 소유한다. 자격증명과 토큰은 절대로 결과/로그에 포함하지 않는다.
4. Mapper는 HTTP와 무관한 순수 함수로 둔다. 성공 여부가 아닌 데이터 shape 판단(`output2` 우선, 대체 `output1`)과 필드 변환을 맡는다. 누락·빈 값은 기존 null 정책을 유지한다.
5. Service 성공은 HTTP 성공, KIS `rt_cd` 성공, 정규화된 행 1개 이상을 모두 만족해야 한다. 빈 응답을 성공으로 바꾸지 않는다.
6. 기존 snapshot 저장은 route/service의 외부 부수효과로 한 번만 실행한다. 실패 payload 저장 여부와 원문 보존은 별도 보존정책 검토 전 기존 동작을 유지한다.
7. 본 모듈은 체결추이 공개시세만 다루며 계좌 주문체결 내역 API나 국내식 투자자별 수급으로 의미를 확대하지 않는다.

## API 호환성 및 입력 수정

기존 경로를 유지한다.

```text
GET /api/kis/market-flow?market=US&code=AAPL[&exchange=NAS][&day=0|1]
```

- `exchange`가 있으면 허용값 NAS/NYS/AMS 검증 후 service 입력으로 전달한다. 현재 route에 관련 검증이 이미 있으므로 기본 체결추이에서도 재사용한다.
- `day`는 값이 제공될 때 `0|1`로 검증한다. KIS 공식 카탈로그 기준 `0=전일`, `1=당일`이며 기본값은 현재 service의 `1` 동작을 유지한다.
- 응답의 `market`, `rows`, `flowStatus`, `source`, `instrument`, `collectedAt`, `diagnostics`, `note` 필드는 소비자 검색 후 하위호환한다. 새 `exchange`나 `day` 필드는 추가 가능하다.
- 이번 모듈화만으로 별도 공개 URL이나 자동 폴링을 추가하지 않는다.

## 로컬 수동 조회

별도 사용자 UI 없이 로컬 개발 서버에서 필요할 때 직접 호출한다.

```text
GET http://localhost:3000/api/local/kis/us-trade-trend?ticker=AAPL
GET http://localhost:3000/api/local/kis/us-trade-trend?ticker=AAPL&day=0
```

- `ticker`는 필수이며 `code`도 호환 입력으로 받는다. 기본 조회는 `day=1`(당일)이고 `day=0`은 전일이다.
- 이 경로는 NAS → NYS → AMS 순서로 시도하고, 반환된 `exchange`는 실제 체결 행을 얻은 거래소다.
- `NODE_ENV=development`에서만 동작하며 운영 환경에서는 404를 반환한다. 프로젝트의 `npm run dev`는 `scripts/dev-server.mjs`가 `.env.local` 값을 실행 환경에 주입한다.
- 수동 요청 한 번당 KIS 조회만 수행한다. 스냅샷/틱 저장, 반복 수집, 예약 실행, UI를 추가하지 않는다.
- 빠른 빈 응답 또는 거래소별 상품 미지원은 다음 거래소 시도를 유발할 수 있다. 진단 응답에는 최종 KIS 상태가 들어간다.

## 추출 및 검증 순서

1. 현재 호출자·테스트·응답 계약을 조사하고 golden fixture를 확보한다.
2. 타입과 mapper를 먼저 분리한다. 기존 `output1/output2`, 숫자 파싱, null 규칙을 fixture로 고정한다.
3. 단일 거래소 KIS client를 추출하고 기존 토큰 만료 재시도·throttle·timeout 헤더 동작을 유지한다.
4. service에 거래소 순회와 성공 판정을 둔다. 요청된 `exchange` 전달 누락을 수정하고 fallback 순서를 검증한다.
5. route를 얇게 만들고 기존 market-flow 응답을 유지한다. snapshot 저장 횟수와 상태도 확인한다.
6. 전체 빌드·관련 테스트·개발 실행으로 검증한다. 저장소의 Git 규칙에 따라 커밋/푸시가 필요하면 그 전에 빌드·테스트·실행을 모두 통과시킨다.

## 필수 자동 검증 범위

- mapper: `output2` 우선, `output1` 대체, 빈 배열, malformed payload, 문자열 숫자·콤마·빈 값 처리.
- client: query/header/tr_id, throttle 및 timeout 경계, 토큰 만료 재시도 한 번, 비인증 오류에서 무관한 토큰 삭제 금지.
- service: 지정 거래소 단일 호출, fallback 순서, 첫 유효 데이터 반환, 전 거래소 실패, 성공 상태/빈 행 구분.
- route: `exchange`와 `day` 전달, 유효하지 않은 입력 400, 토큰 부재 503, KIS 실패 502, snapshot 1회, 성공 JSON 하위호환.
- 재발 감지: `route.ts`가 KIS URL 또는 `fetchKisUsTradeTrend` 저수준 구현에 직접 의존하지 않는지 코드리뷰/정적 검색으로 확인한다.

## 남은 확인 및 위험

- KIS 공식 카탈로그에서 `TDAY=0`은 전일, `TDAY=1`은 당일임을 확인했다. 구체적인 조회 범위, 응답 정렬·최대 행 수는 공식 상세 명세 및 실제 응답 fixture로 확인해야 한다.
- API 카탈로그 샘플의 `output` 구조와 현재 코드의 `output1/output2` 지원은 실제 최신 응답 fixture로 교차 검증해야 한다.
- generic snapshot의 `observed_at`이 실제 체결 시각인지 수집시각인지 혼동하지 않도록 두 시각의 의미를 분리한다.
- 거래소 fallback은 잘못된 거래소에서 받은 유효한 응답을 감추거나 KIS 오류를 다른 거래소 데이터로 오인할 수 있어, 결과에 실제 거래소와 진단을 항상 남긴다.
- 현재 단계는 설계이며 구현·성능 주장은 하지 않는다.
