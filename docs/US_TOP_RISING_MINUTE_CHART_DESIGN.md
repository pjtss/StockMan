# 미국 상승률 TOP 100 분봉 차트 설계안

## 1. 목표

미국 상승률 TOP 100 원본 결과에서 보통주만 선별해 목록으로 제공하고, 목록의 각 종목을 기존 `ChartModal`에서 1분봉 또는 5분봉으로 조회한다.

- 대상 거래소: NAS, AMS, NYS
- 거래소별 KIS 상승률 순위 TOP 100
- ETF, ETN, ADR, DR, 우선주, 리츠, 펀드, 워런트, 채권, 노트, 유닛, 레버리지·인버스 상품 제외
- 상품 분류가 불완전한 경우에도 KIS 마스터의 공식 상품 분류와 명칭 제외 규칙을 함께 적용
- 결과는 실제 KIS 응답과 DB의 보통주 마스터를 기준으로 하며 Mock 데이터는 사용하지 않음
- 종목 선택 시 기존 차트 모달의 회사명, 이전·다음 이동, ESC/키보드, 관심종목, 기본정보·뉴스·지표 기능을 그대로 사용

## 2. 현재 코드 재사용 범위

| 영역 | 기존 모듈 | 활용 방식 |
| --- | --- | --- |
| 상승률 순위 | `lib/kis-us-api.ts`, `app/api/stock/us/top-rising/route.ts` | 거래소별 원본 TOP 100 수집 |
| 보통주 분류 | `lib/us-top-rising-universe.ts`, `lib/us-instrument-product.ts` | 공통 필터와 명칭 기반 제외 |
| 분봉 조회 | `lib/kis-us-minute-turnover.ts` | KIS 1분/5분봉 원천 조회 |
| 차트 모달 | `components/chart-modal.tsx` | 화면과 상세 기능의 단일 구현 |
| 모달 연결 패턴 | `components/ticker-chart-workbench.tsx`, `components/watchlist-workbench.tsx` | `position`, `prefetchCodes`, 이전·다음 전달 |

## 3. 백엔드 설계

### 3.1 전용 조회 서비스

`lib/us-top-rising-chart-universe.ts`를 추가한다.

1. `NAS`, `AMS`, `NYS`를 순회해 KIS 상승률 순위를 요청한다.
2. 거래소별 응답에서 최대 100개만 취한다.
3. ticker를 정규화하고 중복을 제거한다.
4. `classifyUsInstrumentProduct`와 공식 마스터의 `instrumentType`, `isEtf`, `isDr`, `isWarrant`, `isDerivative`를 사용해 보통주만 남긴다.
5. 원본 순위, 상승률, 회사명, 거래소를 결과에 보존한다.
6. 거래소별 응답이 실패하면 전체를 성공으로 가장하지 않고 해당 거래소의 상태를 `unavailable`로 반환한다.

반환 계약:

```ts
type UsTopRisingChartItem = {
  market: "NAS" | "AMS" | "NYS";
  code: string;
  name: string;
  rank: number;
  changeRate: number | null;
  source: "KIS_UPDOWN_RATE_TOP100";
};

type UsTopRisingChartResponse = {
  ok: boolean;
  items: UsTopRisingChartItem[];
  requestedTopN: 100;
  commonStockCount: number;
  markets: Array<{ market: string; status: "ok" | "unavailable"; sourceCount: number; excludedCount: number; error?: string }>;
  collectedAt: string;
};
```

### 3.2 API

`GET /api/stock/us/top-rising-chart?limit=100`

- `limit`은 1~100으로 제한한다.
- 응답은 항상 JSON으로 반환한다.
- KIS 장애·HTML·빈 응답은 `ok: false`와 원인 메타데이터를 반환하며, 서버가 504 HTML을 그대로 전달하지 않는다.
- 기본 정렬은 원본 상승률 순위 오름차순(rank 1 우선)이다.
- 회사명은 KIS 응답을 우선하고 DB 마스터를 보조값으로 사용한다.
- 목록 API는 차트 봉을 조회하지 않는다. 목록 로딩과 종목별 분봉 조회를 분리해 초기 응답을 가볍게 한다.

### 3.3 분봉 차트 데이터

기존 `/api/kis/market-flow?mode=minute` 계약을 확장하거나, 차트 모달 전용으로 다음 API를 추가한다.

`GET /api/stock/us/minute-chart?code=AAPL&market=NAS&interval=1m|5m&count=120`

- `interval=1m`은 KIS 1분봉, `interval=5m`은 KIS 5분봉으로 매핑한다.
- `count`는 1~240으로 제한한다.
- 응답에는 `code`, `name`, `market`, `interval`, `points`, `collectedAt`, `source`, `status`를 포함한다.
- KIS가 지원하지 않는 시장·간격·장외 응답은 JSON 오류로 정규화한다.
- 분봉은 화면 조회용이며, 기존 정책에 따라 모달 진입만으로 DB 영구 캐시를 만들지 않는다. 필요하면 운영 관측을 위한 호출 로그만 남긴다.

## 4. 프론트엔드 설계

### 4.1 전용 화면

`/scanners/us/top-rising` 또는 `/us-top-rising` 중 하나를 정식 경로로 선택한다. 기존 `/scanners/us`가 비활성 안내 화면이므로, 기존 경로를 무단으로 재활성화하지 않고 별도 경로를 우선한다.

화면 구성:

- 제목: 미국 상승률 TOP 100
- 기준시각과 거래소별 응답 상태
- 전체 TOP 100 원본 수와 보통주 선별 수
- 거래소 필터: 전체/NAS/AMS/NYS
- 카드 또는 테이블: 순위, 회사명, 티커, 거래소, 상승률
- `차트 보기` 버튼
- 로딩·빈 결과·부분 거래소 실패 상태를 각각 표시

### 4.2 기존 `ChartModal` 재사용

선택된 항목은 다음처럼 기존 모달에 전달한다.

```tsx
<ChartModal
  code={`US:${item.code}`}
  company={item.name}
  position={{ current: index + 1, total: items.length }}
  prefetchCodes={adjacentItems}
  onPrevious={...}
  onNext={...}
  onClose={...}
/>
```

모달 내부에는 해외 차트 탭에서 `1분봉`, `5분봉` 선택 컨트롤을 제공한다. 선택 간격은 모달 종목이 바뀌어도 기본값 `1분봉`을 유지하고, 동일 종목의 이미 조회된 간격은 클라이언트 메모리 캐시에서 재사용한다.

- 분봉 차트는 기존 캔들 차트와 동일한 가격축·거래량 영역을 사용한다.
- 기본정보·뉴스·관심종목·이전/다음·키보드 동작은 기존 모달 기능을 변경하지 않는다.
- 분봉 데이터 오류는 모달 전체를 닫거나 깨뜨리지 않고 차트 영역에만 오류 상태를 표시한다.

## 5. 성능·장애 대응

- 순위 API는 거래소 요청을 병렬화하되 KIS 제한을 넘지 않도록 공통 throttle을 사용한다.
- 목록 API에서 종목별 분봉을 일괄 조회하지 않는다.
- 모달은 현재 종목과 이전·다음 종목만 지연 프리패치한다.
- 동일 `market:code:interval` 요청은 AbortController와 메모리 캐시로 중복을 제거한다.
- 응답 본문 Content-Type을 확인해 HTML·프록시 오류를 JSON 오류로 변환한다.
- 운영 오류에는 request id, 거래소, ticker, interval, HTTP 상태, KIS 응답 코드만 남기고 자격증명은 기록하지 않는다.
- 목록이 일부 거래소만 성공해도 성공한 거래소 결과를 보여주되, 상단에 부분 실패를 명시한다.

## 6. 테스트 계획

### 단위 테스트

- 거래소별 TOP 100 제한
- 티커 중복 제거
- ETF·ADR·우선주·펀드·워런트·레버리지 상품 제외
- 상품 메타데이터 누락 시 명칭 제외 규칙 적용
- 회사명·거래소·순위·상승률 정규화
- HTML/비JSON/HTTP 5xx KIS 응답의 JSON 오류 변환
- 1분봉·5분봉 파라미터 매핑 및 잘못된 interval 거부

### 컴포넌트 테스트

- 실제 목록에서 회사명과 티커 표시
- `ChartModal`에 `US:` 코드와 회사명 전달
- 이전·다음 이동 및 position 전달
- 1분봉/5분봉 선택 시 올바른 API 요청
- 분봉 오류가 모달 전체 오류로 전파되지 않음
- ESC와 닫기 버튼 동작

### 실행 검증

```text
npm test -- --run
npm run typecheck
npm run build
scripts/dev-server.mjs로 로컬 실행 후 /scanners/us/top-rising 확인
운영 API에 관리자/운영 인증 정책에 맞는 방식으로 JSON·Content-Type·응답시간 확인
```

## 7. 단계별 개발 순서

1. 전용 순위 조회 서비스와 JSON 정규화 API
2. 보통주 전용 필터 테스트
3. TOP 100 화면과 회사명·거래소·상승률 표시
4. 기존 `ChartModal`의 1분/5분 분봉 선택 및 데이터 어댑터
5. 모달 연결·이전/다음·프리패치 테스트
6. 로컬 실행, 전체 테스트, 타입체크, 빌드
7. 운영 API 직접 검증 후 배포

## 8. 완료 기준

- KIS 거래소별 원본 TOP 100에서 보통주만 화면에 표시된다.
- 보통주가 30개뿐이면 30개만 표시하며 임의 데이터로 100개를 채우지 않는다.
- 각 항목에서 기존 차트 모달이 열리고 1분봉·5분봉을 선택할 수 있다.
- 회사명·티커·거래소가 모달과 목록 모두 일치한다.
- KIS 장애가 HTML/504로 노출되지 않고 사용자에게 JSON 기반 상태가 표시된다.
- 전체 테스트·타입체크·빌드·로컬 실행 검증이 통과한다.
