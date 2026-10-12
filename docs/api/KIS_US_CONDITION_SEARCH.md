# KIS 해외주식 조건검색 API

## 목적과 데이터 기준

`GET /api/kis/us-search`는 KIS 해외주식 조건검색(`HHDFS76410000`) 결과 중 로컬 공식 종목 마스터에서 활성 보통주로 확인된 종목만 반환한다. KIS 원본 결과와 조회 스냅샷도 같은 보통주 집합으로 제한한다. 보통주 판정용 DB 조회에 실패하면 결과를 반환하지 않는다. KIS 행의 티커 또는 거래소 코드가 빠졌거나 거래소가 요청과 다르면 보통주로 추정하지 않고 제외한다.

KIS 조건검색은 거래소별 최대 100건이며 다음 페이지 조회를 지원하지 않는다. 조건검색 특성상 해당 거래일에 거래량이나 시세가 형성되지 않은 종목은 결과에 나오지 않을 수 있다. KIS 응답의 `output1`은 조회 건수 요약이고 `output2`만 종목 행이다. `output2`가 객체 배열이 아니거나 객체가 아닌 원소가 섞이면 잘못된 응답 구조로 처리한다.

## 프로젝트 API

### 요청

```http
GET /api/kis/us-search?market=NAS&CO_YN_RATE=1&CO_ST_RATE=-10&CO_EN_RATE=10
```

인증 헤더는 이 라우트에서 요구하지 않는다. KIS 호출은 프로젝트의 공통 요청 제한기(최대 10 TPS 설정)를 거친다. `market`은 생략하면 `NAS`이며, `NAS`, `NYS`, `AMS`만 허용한다.

| 매개변수 | 형식 | 의미와 검증 |
|---|---|---|
| `market` | `NAS\|NYS\|AMS` | 거래소. 기본값 `NAS`. |
| `CO_YN_PRICECUR` | `""\|1` | 현재가 범위 조건 사용 여부. |
| `CO_ST_PRICECUR`, `CO_EN_PRICECUR` | 숫자 문자열, 최대 12자 | 현재가 하한·상한. 거래소 통화 단위. |
| `CO_YN_RATE` | `""\|1` | 등락률 조건 사용 여부. |
| `CO_ST_RATE`, `CO_EN_RATE` | 숫자 문자열, 최대 12자 | 등락률 하한·상한(%). 음수 허용. |
| `CO_YN_VALX` | `""\|1` | 시가총액 조건 사용 여부. |
| `CO_ST_VALX`, `CO_EN_VALX` | 숫자 문자열, 최대 12자 | 시가총액 하한·상한. KIS 단위는 천(거래소 통화). |
| `CO_YN_SHAR` | `""\|1` | 발행주식수 조건 사용 여부. |
| `CO_ST_SHAR`, `CO_EN_SHAR` | 숫자 문자열, 최대 12자 | 발행주식수 하한·상한. KIS 단위는 천 주. |
| `CO_YN_VOLUME` | `""\|1` | 거래량 조건 사용 여부. |
| `CO_ST_VOLUME`, `CO_EN_VOLUME` | 숫자 문자열, 최대 12자 | 거래량 하한·상한(주). |
| `CO_YN_AMT` | `""\|1` | 거래대금 조건 사용 여부. |
| `CO_ST_AMT`, `CO_EN_AMT` | 숫자 문자열, 최대 12자 | 거래대금 하한·상한. KIS 단위는 천(거래소 통화). |
| `CO_YN_EPS` | `""\|1` | EPS 조건 사용 여부. |
| `CO_ST_EPS`, `CO_EN_EPS` | 숫자 문자열, 최대 12자 | EPS 하한·상한. |
| `CO_YN_PER` | `""\|1` | PER 조건 사용 여부. |
| `CO_ST_PER`, `CO_EN_PER` | 숫자 문자열, 최대 12자 | PER 하한·상한. |

조건 선택값은 사용할 때 `1`, 미사용 때 공백이어야 한다. 조건을 사용하면 시작값 또는 끝값 중 하나 이상을 제공해야 하며, 양쪽 값이 있으면 시작값이 끝값보다 클 수 없다. 선택하지 않은 조건에 범위만 전달하거나, 알 수 없는·중복된 매개변수를 전달하면 HTTP 400이다. 숫자는 부호와 소수점을 허용하지만 쉼표·지수 표기 등은 허용하지 않는다.

프로젝트 API의 `KEYB`는 호환 목적으로 공백만 허용한다. 값이 있으면 `PAGINATION_UNSUPPORTED`를 반환한다. 요청에 없더라도 KIS에는 `KEYB=""`를 보낸다.

### 성공 응답

HTTP 200이며 `rows`와 `raw.output2`에는 활성 보통주 마스터와 거래소·티커가 일치한 행만 포함한다. `raw.output1`에는 KIS의 집계 필드가 남을 수 있지만 제외된 종목의 식별 정보는 반환하지 않는다.

```json
{
  "ok": true,
  "source": "KIS",
  "market": "NAS",
  "status": 200,
  "signalType": "candidate_us_condition_search",
  "collectedAt": "2026-10-12T01:00:00.000Z",
  "filters": { "CO_YN_RATE": "1", "CO_ST_RATE": "-10", "CO_EN_RATE": "10" },
  "diagnostics": { "rt_cd": "0", "msg_cd": "MCA00000", "msg1": "정상처리 되었습니다.", "contentType": "application/json" },
  "eligibility": {
    "requestedCount": 2,
    "eligibleCount": 1,
    "excludedCount": 1,
    "source": "us_common_stock_universe",
    "failClosed": true
  },
  "pagination": { "supported": false, "maximumRows": 100, "returnedRows": 2 },
  "snapshot": { "stored": true },
  "rows": [
    { "excd": "NAS", "symb": "EXM", "name": "Example Corp", "rank": "1", "market": "NAS", "code": "EXM", "observedAt": "2026-10-12T01:00:00.000Z" }
  ],
  "raw": {
    "rt_cd": "0",
    "msg_cd": "MCA00000",
    "msg1": "정상처리 되었습니다.",
    "output1": { "crec": "2", "trec": "2" },
    "output2": [ { "excd": "NAS", "symb": "EXM", "name": "Example Corp", "rank": "1" } ]
  }
}
```

응답의 `rows` 및 `raw.output2`는 실제 KIS 결과를 기반으로 구성된다. 위 값은 응답 필드 구조를 설명하기 위한 예시다.

### 오류 응답

| HTTP | `error` | 의미 |
|---:|---|---|
| 400 | `INVALID_MARKET`, `INVALID_FILTER`, `INVALID_RANGE`, `FILTER_RANGE_REQUIRED`, `FILTER_NOT_ENABLED`, `UNKNOWN_PARAMETER`, `DUPLICATE_PARAMETER`, `PAGINATION_UNSUPPORTED` 등 | 요청 매개변수가 잘못됐거나 지원 범위를 벗어남. |
| 502 | `KIS_REQUEST_FAILED` | KIS 호출 중 네트워크·설정 예외. 상세 예외와 자격증명은 응답에 노출하지 않는다. |
| 502 | `upstreamError: KIS_NON_JSON_RESPONSE` | KIS 또는 앞단 게이트웨이가 JSON이 아닌 본문을 반환함. 본문은 반환하지 않는다. |
| 502 | `upstreamError: KIS_INVALID_JSON_RESPONSE` | JSON으로 선언됐지만 파싱할 수 없는 응답. |
| 502 | `upstreamError: KIS_INVALID_RESPONSE_SHAPE` | JSON은 유효하지만 공식 종목 배열 `output2`가 없는 응답. |
| 502 | `upstreamError: KIS_UPSTREAM_ERROR` | HTTP 또는 KIS `rt_cd` 기준 실패. `diagnostics`에 KIS 코드가 있으면 제공한다. |
| 503 | `KIS_TOKEN_UNAVAILABLE` | KIS 토큰을 준비할 수 없음. |
| 503 | `COMMON_STOCK_UNIVERSE_UNAVAILABLE` | 공식 활성 보통주 판정 DB를 사용할 수 없음. 안전을 위해 검색 결과를 반환하지 않는다. |

스냅샷 저장은 표시 가능한 검색 결과의 보조 기록이다. 저장 실패 시 유효한 검색 응답은 HTTP 200으로 반환하고 `snapshot.stored=false`, `warning=SIGNAL_SNAPSHOT_WRITE_FAILED`로 알린다. 이 경우에도 스냅샷에는 비보통주 결과를 기록하지 않는다.

## KIS 공식 API 호출 계약

근거 문서: 프로젝트 보관본 `docs/references/한국투자증권_오픈API_전체문서_20260727_030000.xlsx`, 시트 `해외주식조건검색`.

| 항목 | 공식 명세 |
|---|---|
| API ID / TR ID | `v1_해외주식-015` / 실전·모의 `HHDFS76410000` |
| HTTP / URL | `GET /uapi/overseas-price/v1/quotations/inquire-search` |
| 실전 도메인 | `https://openapi.koreainvestment.com:9443` |
| 모의 도메인 | `https://openapivts.koreainvestment.com:29443` |
| 필수 query | `AUTH`(공백), `EXCD` |
| 필터 | 현재가, 등락률, 시가총액, 발행주식수, 거래량, 거래대금, EPS, PER의 선택값과 시작·끝 범위 |
| `KEYB` / 연속 조회 | 공식 입력 설명은 공백을 지정하며, 명세의 개요는 최대 100건 및 다음 조회 미지원으로 안내한다. |
| 결과 행 | `output2` 배열. 거래소 `excd`, 티커 `symb`, 종목명 `name`, 현재가 `last`, 발행주식수 `shar`, 시가총액 `valx`, 고가·저가·시가, 거래량 `tvol`, 등락률 `rate`, 거래대금 `avol`, EPS `eps`, PER `per`, 순위 `rank`, 영문명 `ename`, 매매가능 `e_ordyn` 등. |
| 정렬 | 공식 설명상 `output2.rank`는 거래량 내림차순 기준이다. |
| 데이터 한계 | 미국 무료 시세는 0분 지연으로 안내되지만 유료 시세와 체결·호가·현재가가 일부 다를 수 있다. 당일 시가는 장중·익일 정정될 수 있다. 해당 거래일에 거래량·시세가 없는 종목은 조건검색에 나오지 않을 수 있다. |

공식 명세상 해외 시장 코드에는 NAS/NYS/AMS 외 시장도 있으나 이 프로젝트 API는 미국 거래소 세 곳만 공개한다. 다른 거래소를 추가하려면 데이터 원천·통화·공식 종목 마스터 범위를 별도로 검증하고 API 문서를 함께 갱신해야 한다.

## 운영 및 재발 방지

- KIS 응답의 `output1`을 종목 행으로 처리하지 않고 `output2`만 파싱한다.
- 마스터 확인 전 원본 응답을 API·DB 스냅샷에 노출하지 않는다. 공식 마스터 조회 실패는 fail-closed다.
- 토큰은 수집 모듈에서 한 번 확인한다. 토큰 만료 응답이면 한 번 재발급 후 재요청한다.
- JSON이 아닌 오류 본문, 앱 시크릿, Authorization 값은 사용자 응답에 포함하지 않는다.
- `lib/kis-us-condition-search.test.ts`와 `app/api/kis/us-search/route.test.ts`가 입력 검증, 응답 파싱, 보통주 필터, 실패 계약을 회귀 검사한다.

## 공식 출처

- 한국투자증권 보관 명세서: `docs/references/한국투자증권_오픈API_전체문서_20260727_030000.xlsx`의 `해외주식조건검색` 시트.
- 한국투자증권 KIS Developers: <https://apiportal.koreainvestment.com/apiservice>
