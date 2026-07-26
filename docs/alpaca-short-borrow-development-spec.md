Exit code: 0
Wall time: 3 seconds
Output:
# Next.js 기반 Alpaca 공매도 대차 압박 탐지 시스템 개발 지시서

## 1. 개발 목표

Next.js 최신 안정 버전, TypeScript, App Router 기반으로 미국 급등주 후보의 공매도 대차 상황을 조회하고 저장하는 기능을 개발한다.

이 기능의 목적은 특정 티커에 대해 Alpaca가 현재 제공할 수 있는 다음 정보를 조회하는 것이다.

1. 공매도 가능 여부
2. ETB·HTB 상태
3. 현재 추가로 빌릴 수 있는 주식 수량
4. 주당 Locate 수수료
5. 이전 조회 대비 대차 가능 수량 감소율
6. 이전 조회 대비 Locate 수수료 상승률
7. 공매도 세력에게 불리한 정도를 나타내는 점수

실제 공매도 주문이나 Locate 신청은 구현하지 않는다.

---

## 2. 데이터 범위

Alpaca API의 수량과 가격은 미국 시장 전체 값이 아니다.

반드시 다음 의미로 저장하고 화면에 표시한다.

```text
Alpaca가 현재 해당 계정에 제공할 수 있는
계정별 대차 가능 수량 및 Locate 견적
```

Alpaca는 HTB 종목에 대해 실시간·계정별 `available_qty`, `price`, `quoted_at`을 제공한다. 견적 조회 자체는 주식을 예약하지 않는다.

응답에는 항상 다음 범위 정보를 포함한다.

```json
{
  "source": "ALPACA",
  "scope": "ALPACA_ACCOUNT_SPECIFIC"
}
```

화면에는 다음 문구를 표시한다.

```text
이 값은 미국 시장 전체 대차 물량이 아니라
현재 Alpaca 계정에 제공되는 대차 견적입니다.
```

---

## 3. 기술 스택

```text
Next.js 최신 안정 버전
TypeScript
App Router
Route Handler
PostgreSQL
Prisma ORM
Zod
Vitest
```

UI가 필요하면 다음을 사용한다.

```text
Tailwind CSS
Server Components
필요한 부분만 Client Component
```

Next.js Route Handler는 `app` 디렉터리의 `route.ts`에서 Web Request·Response API 기반으로 구현한다.

---

## 4. 필수 사전 조건

Alpaca HTB Locate 기능은 적격 마진계좌를 대상으로 하며, Alpaca에서 마진·공매도를 사용하려면 계좌 자산이 최소 2,000달러 이상이어야 한다.

Paper 계정은 Borrow Fee를 지원하지 않으므로 실제 수량·수수료 조회 기능은 Live 계정 API 키를 기준으로 개발한다.

환경 변수:

```env
ALPACA_API_BASE_URL=https://api.alpaca.markets
ALPACA_API_KEY=
ALPACA_API_SECRET=
CRON_SECRET=
DATABASE_URL=
```

`ALPACA_API_KEY`, `ALPACA_API_SECRET`에는 절대로 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.

`NEXT_PUBLIC_`이 없는 환경 변수는 서버에서만 접근할 수 있으므로 Alpaca 인증정보는 Route Handler와 서버 전용 모듈에서만 사용한다.

Alpaca Trading API 인증 헤더:

```http
APCA-API-KEY-ID: {ALPACA_API_KEY}
APCA-API-SECRET-KEY: {ALPACA_API_SECRET}
```

Alpaca Live Trading API 기본 주소는 다음과 같다.

```text
https://api.alpaca.markets
```

---

## 5. 폴더 구조

```text
src/
├─ app/
│  ├─ api/
│  │  ├─ short-borrow/
│  │  │  ├─ [symbol]/
│  │  │  │  └─ route.ts
│  │  │  └─ batch/
│  │  │     └─ route.ts
│  │  └─ cron/
│  │     └─ short-borrow/
│  │        └─ route.ts
│  └─ short-borrow/
│     └─ page.tsx
│
├─ lib/
│  ├─ alpaca/
│  │  ├─ client.ts
│  │  ├─ short-borrow-service.ts
│  │  ├─ types.ts
│  │  └─ errors.ts
│  ├─ short-borrow/
│  │  ├─ calculator.ts
│  │  ├─ scorer.ts
│  │  └─ repository.ts
│  ├─ db/
│  │  └─ prisma.ts
│  └─ env.ts
│
├─ components/
│  └─ short-borrow/
│     ├─ short-borrow-table.tsx
│     ├─ short-borrow-badge.tsx
│     └─ short-pressure-score.tsx
│
└─ tests/
   ├─ short-borrow-service.test.ts
   ├─ short-borrow-calculator.test.ts
   └─ short-pressure-scorer.test.ts
```

---

## 6. Alpaca API 호출 순서

### 6.1 티커 검증

티커는 대문자로 변환하고 다음 정규식으로 검증한다.

```ts
const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,15}$/;
```

잘못된 티커는 Alpaca API를 호출하지 않고 HTTP 400을 반환한다.

---

### 6.2 공매도 상태 조회

```http
GET https://api.alpaca.markets/v2/assets/{symbol}
```

예시:

```http
GET /v2/assets/TSLA
```

주요 응답:

```json
{
  "symbol": "TSLA",
  "tradable": true,
  "shortable": true,
  "borrow_status": "hard_to_borrow"
}
```

Alpaca 공식 흐름은 먼저 Assets API로 `shortable` 및 `borrow_status`를 확인하는 방식이다.

처리 규칙:

| 조건                             | 내부 상태           | 후속 처리          |
| ------------------------------ | --------------- | -------------- |
| `shortable=false`              | `NOT_SHORTABLE` | Locate 조회하지 않음 |
| `borrow_status=easy_to_borrow` | `ETB`           | Locate 조회하지 않음 |
| `borrow_status=hard_to_borrow` | `HTB`           | Locate 견적 조회   |
| 알 수 없는 값                       | `UNKNOWN`       | 오류 로그 기록       |

ETB 종목은 Alpaca Trading API 기준 Locate 및 Borrow Fee가 0달러다.

---

### 6.3 HTB Locate 견적 조회

HTB 종목인 경우에만 호출한다.

```http
GET https://api.alpaca.markets/v1/locates/quotes?symbols={symbol}
```

복수 티커:

```http
GET /v1/locates/quotes?symbols=TSLA,ABCD,XYZ
```

예상 응답:

```json
{
  "quotes": [
    {
      "symbol": "TSLA",
      "available_qty": 1000,
      "price": "0.0123",
      "quoted_at": "2026-01-02T15:04:05Z"
    }
  ],
  "errors": []
}
```

필드:

| 필드              | 의미                        |
| --------------- | ------------------------- |
| `available_qty` | 해당 계정에 현재 제시된 추가 대차 가능 수량 |
| `price`         | 주당 Locate 수수료 견적          |
| `quoted_at`     | Alpaca 견적 생성 시각           |

Alpaca 공식 문서상 HTB Locate 견적은 실시간·계정별이며 조회만으로 물량이 예약되지 않는다.

---

## 7. ETB 응답 처리

복수 티커 Locate 조회 시 ETB 종목은 `quotes`가 아니라 `errors`에 다음과 같이 반환될 수 있다.

```json
{
  "symbol": "AAPL",
  "code": "easy_to_borrow",
  "message": "symbol is easy to borrow"
}
```

이것을 시스템 오류로 처리하지 않는다.

다음과 같이 정규화한다.

```json
{
  "symbol": "AAPL",
  "shortable": true,
  "borrowStatus": "ETB",
  "availableQty": null,
  "locatePricePerShare": 0,
  "quoteStatus": "NOT_REQUIRED"
}
```

중요:

```text
availableQty=null
```

은 수량이 0주라는 뜻이 아니다.

ETB라서 Locate 견적이 필요하지 않으므로 수량이 제공되지 않았다는 뜻이다.

---

## 8. 표준 API 응답 모델

```ts
export type BorrowStatus =
  | "ETB"
  | "HTB"
  | "NOT_SHORTABLE"
  | "UNKNOWN";

export type QuoteStatus =
  | "AVAILABLE"
  | "NOT_REQUIRED"
  | "UNAVAILABLE"
  | "ERROR";

export interface ShortBorrowResult {
  symbol: string;

  tradable: boolean;
  shortable: boolean;
  borrowStatus: BorrowStatus;
  quoteStatus: QuoteStatus;

  availableQty: number | null;
  locatePricePerShare: number | null;

  currentPrice: number | null;
  locateFeeRatePercent: number | null;

  previousAvailableQty: number | null;
  availableQtyChange: number | null;
  availableQtyChangePercent: number | null;

  previousLocatePricePerShare: number | null;
  locatePriceChangePercent: number | null;

  pressureScore: number;
  pressureLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  reasons: string[];

  quotedAt: string | null;
  fetchedAt: string;

  source: "ALPACA";
  scope: "ALPACA_ACCOUNT_SPECIFIC";
}
```

---

## 9. 조회 API 구현

### 엔드포인트

```http
GET /api/short-borrow/{symbol}
```

선택적으로 현재 주가를 전달할 수 있게 한다.

```http
GET /api/short-borrow/ABCD?currentPrice=0.85
```

`currentPrice`는 기존 KIS 미국 주식 스캐너에서 받은 현재가를 전달하는 용도로 사용한다.

현재가가 없으면 Locate 비용률은 `null`로 반환한다.

예상 응답:

```json
{
  "symbol": "ABCD",
  "tradable": true,
  "shortable": true,
  "borrowStatus": "HTB",
  "quoteStatus": "AVAILABLE",
  "availableQty": 1200,
  "locatePricePerShare": 0.05,
  "currentPrice": 0.85,
  "locateFeeRatePercent": 5.8824,
  "previousAvailableQty": 5000,
  "availableQtyChange": -3800,
  "availableQtyChangePercent": -76,
  "previousLocatePricePerShare": 0.02,
  "locatePriceChangePercent": 150,
  "pressureScore": 85,
  "pressureLevel": "EXTREME",
  "reasons": [
    "HTB 종목",
    "대차 가능 수량 76% 감소",
    "Locate 비용률 5% 이상",
    "Locate 가격 150% 상승"
  ],
  "quotedAt": "2026-07-26T08:20:00Z",
  "fetchedAt": "2026-07-26T08:20:03Z",
  "source": "ALPACA",
  "scope": "ALPACA_ACCOUNT_SPECIFIC"
}
```

---

## 10. Alpaca HTTP 클라이언트

`src/lib/alpaca/client.ts`에 공통 클라이언트를 만든다.

요구사항:

```ts
const ALPACA_TIMEOUT_MS = 8_000;
const ALPACA_MAX_RETRIES = 2;
```

모든 요청에 다음을 적용한다.

```ts
{
  cache: "no-store",
  signal: AbortSignal.timeout(ALPACA_TIMEOUT_MS),
  headers: {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY!,
    "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET!,
    "Accept": "application/json"
  }
}
```

실시간 대차 견적이므로 캐시된 응답을 사용하지 않는다.

처리해야 할 HTTP 상태:

|      상태 | 처리              |
| ------: | --------------- |
|     200 | 정상              |
|     400 | 요청값 오류          |
|     401 | API 키 오류        |
|     403 | 계정 권한 또는 기능 미지원 |
|     404 | 티커 없음           |
|     429 | Rate Limit, 재시도 |
| 500~599 | 지수 백오프 재시도      |

재시도 간격:

```text
1차 재시도: 500ms
2차 재시도: 1,500ms
```

429 응답에서는 가능하면 Alpaca의 Rate Limit 관련 응답 헤더를 기록한다.

API 키와 Secret은 로그에 출력하지 않는다.

---

## 11. 비용 계산

### 11.1 예상 Locate 총비용

```ts
estimatedLocateFee =
  requestedQty * locatePricePerShare;
```

단, 조회 API에서는 실제 Locate 신청을 하지 않으므로 기본 `requestedQty`는 사용자가 입력한 경우에만 계산한다.

```http
GET /api/short-borrow/ABCD?currentPrice=0.85&requestedQty=100
```

응답:

```json
{
  "requestedQty": 100,
  "estimatedLocateFee": 5
}
```

HTB Locate 요청은 100주 단위라는 Alpaca 규칙을 고려해 `requestedQty`가 100의 배수가 아니면 경고를 반환한다.

### 11.2 Locate 비용률

```ts
locateFeeRatePercent =
  currentPrice > 0
    ? (locatePricePerShare / currentPrice) * 100
    : null;
```

예:

```text
현재가: $0.50
주당 Locate 비용: $0.05
Locate 비용률: 10%
```

이 값은 공매도 포지션 금액 대비 Locate 비용 부담을 비교하기 위한 내부 지표다.

---

## 12. 변화율 계산

### 12.1 대차 가능 수량 변화

```ts
availableQtyChange =
  currentAvailableQty - previousAvailableQty;
```

```ts
availableQtyChangePercent =
  previousAvailableQty > 0
    ? ((currentAvailableQty - previousAvailableQty)
        / previousAvailableQty) * 100
    : null;
```

예:

```text
이전: 10,000주
현재: 2,500주
변화율: -75%
```

### 12.2 Locate 가격 변화

```ts
locatePriceChangePercent =
  previousLocatePrice > 0
    ? ((currentLocatePrice - previousLocatePrice)
        / previousLocatePrice) * 100
    : null;
```

---

## 13. 공매도 압박 점수

이 점수는 Alpaca 공식 지표가 아닌 내부 탐지용 휴리스틱이다.

총점은 0~100점으로 제한한다.

### 기본 점수

| 조건                |  점수 |
| ----------------- | --: |
| `shortable=false` | +35 |
| HTB               | +20 |
| ETB               |  +0 |

### 대차 수량 감소

| 감소율       |  점수 |
| --------- | --: |
| 20% 이상 감소 |  +5 |
| 40% 이상 감소 | +10 |
| 70% 이상 감소 | +20 |
| 90% 이상 감소 | +30 |

### Locate 비용률

| 비용률     |  점수 |
| ------- | --: |
| 0.5% 이상 |  +5 |
| 2% 이상   | +10 |
| 5% 이상   | +20 |
| 10% 이상  | +30 |

### Locate 가격 상승

| 상승률     |  점수 |
| ------- | --: |
| 30% 이상  |  +5 |
| 100% 이상 | +10 |
| 300% 이상 | +15 |

### 등급

|     점수 | 등급        |
| -----: | --------- |
|   0~24 | `LOW`     |
|  25~49 | `MEDIUM`  |
|  50~74 | `HIGH`    |
| 75~100 | `EXTREME` |

점수와 함께 반드시 판단 근거를 배열로 반환한다.

```json
{
  "pressureScore": 85,
  "pressureLevel": "EXTREME",
  "reasons": [
    "HTB 종목",
    "대차 가능 수량 76% 감소",
    "Locate 비용률 5% 이상",
    "Locate 가격 100% 이상 상승"
  ]
}
```

---

## 14. 데이터베이스

Prisma 모델:

```prisma
model ShortBorrowSnapshot {
  id                         BigInt   @id @default(autoincrement())
  symbol                     String
  tradable                   Boolean
  shortable                  Boolean
  borrowStatus               String
  quoteStatus                String

  availableQty               Int?
  locatePricePerShare        Decimal? @db.Decimal(18, 8)

  currentPrice               Decimal? @db.Decimal(18, 8)
  locateFeeRatePercent       Decimal? @db.Decimal(12, 6)

  pressureScore              Int
  pressureLevel              String

  quotedAt                   DateTime?
  fetchedAt                  DateTime @default(now())

  source                     String   @default("ALPACA")
  scope                      String   @default("ALPACA_ACCOUNT_SPECIFIC")

  @@index([symbol, fetchedAt])
  @@index([pressureLevel, fetchedAt])
  @@index([fetchedAt])
}
```

한 티커의 직전 데이터를 조회할 때:

```text
symbol 일치
fetchedAt 내림차순
LIMIT 1
```

장기간 저장 시 30일 또는 90일 보존 정책을 설정할 수 있게 한다.

---

## 15. 배치 조회 API

```http
POST /api/short-borrow/batch
```

요청:

```json
{
  "stocks": [
    {
      "symbol": "ABCD",
      "currentPrice": 0.85
    },
    {
      "symbol": "XYZ",
      "currentPrice": 1.42
    }
  ]
}
```

제약:

```text
한 번에 최대 100개 티커
중복 티커 제거
모두 대문자로 정규화
```

처리 순서:

1. 모든 티커의 Assets 정보 조회
2. HTB 티커만 추출
3. HTB 티커를 Locate Quotes API에 묶어서 전달
4. ETB·HTB·공매도 불가 결과 정규화
5. 직전 스냅샷과 비교
6. 압박 점수 계산
7. 데이터베이스 저장
8. 점수 내림차순으로 반환

---

## 16. 수집 작업

```http
POST /api/cron/short-borrow
Authorization: Bearer {CRON_SECRET}
```

또는:

```http
GET /api/cron/short-borrow
Authorization: Bearer {CRON_SECRET}
```

인증 실패 시 HTTP 401을 반환한다.

수집 대상은 미국 전체 종목이 아니라 기존 급등주 탐지 로직에서 선별된 후보만 사용한다.

권장 흐름:

```text
KIS 미국 상승률 TOP 종목 조회
→ 기존 시총 대비 거래대금 필터
→ 최대 100개 후보 추출
→ Alpaca 대차 상태 조회
→ 스냅샷 저장
→ 공매도 압박 점수 계산
→ HIGH·EXTREME 종목 알림
```

수집 주기는 환경 변수로 조절한다.

```env
SHORT_BORROW_POLL_SECONDS=60
```

API 제한이 발생하면 전체 호출 빈도를 낮추고 429 응답을 기록한다.

---

## 17. 대시보드

경로:

```text
/short-borrow
```

테이블 컬럼:

| 컬럼           | 설명             |
| ------------ | -------------- |
| 티커           | 종목 코드          |
| 공매도 가능       | `shortable`    |
| 상태           | ETB·HTB·불가     |
| 추가 대차 가능 수량  | `availableQty` |
| 수량 변화율       | 직전 조회 대비       |
| 주당 Locate 비용 | `price`        |
| Locate 비용률   | 현재가 대비         |
| 비용 변화율       | 직전 조회 대비       |
| 압박 점수        | 0~100          |
| 등급           | LOW~EXTREME    |
| 견적 시각        | `quotedAt`     |
| 조회 시각        | `fetchedAt`    |

정렬 기본값:

```text
1. pressureScore 내림차순
2. availableQtyChangePercent 오름차순
3. locateFeeRatePercent 내림차순
```

필터:

```text
HTB만 보기
공매도 불가만 보기
HIGH 이상
EXTREME만
대차 수량 10,000주 이하
Locate 비용률 2% 이상
```

색상:

```text
LOW: 회색
MEDIUM: 노란색
HIGH: 주황색
EXTREME: 빨간색
```

---

## 18. 알림 조건

다음 중 하나를 만족하면 알림 후보로 분류한다.

```text
pressureLevel = EXTREME
```

또는:

```text
HTB
AND availableQtyChangePercent <= -70
```

또는:

```text
HTB
AND locateFeeRatePercent >= 5
```

또는:

```text
shortable = false
AND 직전 상태는 shortable = true
```

Discord 알림 예시:

```text
[공매도 압박 감지]

티커: ABCD
상태: HTB
현재 대차 가능 수량: 1,200주
직전 수량: 5,000주
수량 변화: -76%

주당 Locate 비용: $0.05
현재 주가: $0.85
Locate 비용률: 5.88%

압박 점수: 85 / EXTREME

※ Alpaca 계정 기준 대차 견적
```

---

## 19. 오류 처리

### 종목 없음

```json
{
  "code": "SYMBOL_NOT_FOUND",
  "message": "Alpaca에서 티커를 찾을 수 없습니다."
}
```

### API 키 오류

```json
{
  "code": "ALPACA_AUTHENTICATION_FAILED",
  "message": "Alpaca API 인증에 실패했습니다."
}
```

### 권한 부족

```json
{
  "code": "ALPACA_LOCATE_NOT_ELIGIBLE",
  "message": "현재 Alpaca 계정에서 Locate 견적 기능을 사용할 수 없습니다."
}
```

### 대차 재고 없음

```json
{
  "code": "BORROW_INVENTORY_UNAVAILABLE",
  "message": "현재 Alpaca 계정에 제공 가능한 대차 재고가 없습니다."
}
```

`availableQty=0`과 API 오류를 반드시 구분한다.

### ETB

ETB는 오류가 아니다.

```json
{
  "borrowStatus": "ETB",
  "quoteStatus": "NOT_REQUIRED",
  "availableQty": null,
  "locatePricePerShare": 0
}
```

---

## 20. 보안 요구사항

1. Alpaca API 키를 Client Component로 전달하지 않는다.
2. 브라우저에서 Alpaca API를 직접 호출하지 않는다.
3. 모든 Alpaca 호출은 서버 Route Handler를 통한다.
4. API 키와 Secret을 로그에 남기지 않는다.
5. Cron API는 `CRON_SECRET`으로 보호한다.
6. 공개 API에는 IP 또는 사용자 단위 Rate Limit을 적용한다.
7. 사용자 입력 티커는 정규식으로 검증한다.
8. 오류 응답에 Alpaca 원본 인증정보를 포함하지 않는다.
9. 실제 Locate 신청 API인 `POST /v1/locates`는 구현하지 않는다.
10. 실제 공매도 주문 API도 구현하지 않는다.

---

## 21. 테스트 케이스

### ETB 종목

기대 결과:

```text
borrowStatus = ETB
availableQty = null
locatePricePerShare = 0
quoteStatus = NOT_REQUIRED
```

### HTB 종목

기대 결과:

```text
borrowStatus = HTB
availableQty 존재
locatePricePerShare 존재
quoteStatus = AVAILABLE
```

### 공매도 불가

기대 결과:

```text
shortable = false
borrowStatus = NOT_SHORTABLE
Locate API 호출 안 함
```

### 수량 급감

```text
이전 10,000주
현재 2,000주
변화율 -80%
```

HIGH 또는 EXTREME 등급이 나와야 한다.

### Locate 가격 급등

```text
이전 $0.01
현재 $0.05
상승률 400%
```

압박 점수가 상승해야 한다.

### Alpaca 오류

다음을 각각 Mock 테스트한다.

```text
401
403
404
429
500
Timeout
잘못된 JSON
quotes와 errors 혼합 응답
```

---

## 22. 완료 기준

다음 조건을 모두 만족해야 한다.

* 티커 하나로 공매도 가능 여부를 조회할 수 있다.
* ETB·HTB를 구분할 수 있다.
* HTB의 현재 추가 대차 가능 수량을 조회할 수 있다.
* HTB의 주당 Locate 비용을 조회할 수 있다.
* 현재가가 주어지면 Locate 비용률을 계산할 수 있다.
* 직전 조회 대비 수량 감소율을 계산할 수 있다.
* 직전 조회 대비 Locate 가격 상승률을 계산할 수 있다.
* 모든 결과를 PostgreSQL에 저장할 수 있다.
* 최대 100개 티커를 배치 조회할 수 있다.
* 공매도 압박 점수를 계산할 수 있다.
* HIGH·EXTREME 종목을 정렬해서 보여줄 수 있다.
* Alpaca API 키가 브라우저에 노출되지 않는다.
* 실제 Locate 신청이나 공매도 주문은 수행하지 않는다.
* 모든 화면에 `Alpaca 계정 기준 표본 데이터`임을 명시한다.

---

## 23. 핵심 개발 원칙

```text
availableQty 감소
+ locatePricePerShare 상승
+ ETB에서 HTB 전환
+ shortable=false 전환
```

위 변화가 발생하는 종목을 공매도 세력에게 불리한 후보로 판단한다.

그러나 해당 값은 Alpaca 단일 플랫폼의 대차 공급 상황이므로 단독으로 매수 신호로 사용하지 않는다.

기존 급등주 탐지 데이터와 함께 사용한다.

```text
거래량 증가
+ 거래대금 증가 속도
+ 주가 상승
+ 낮은 Float
+ 호재
+ Alpaca 대차 수량 감소
+ Locate 비용 상승
```

최종 목표는 공매도 주문을 실행하는 것이 아니라, **공매도 진입 환경이 빠르게 악화되는 급등 후보를 조기에 선별하는 것**이다.


