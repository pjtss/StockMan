# 종목 데이터 테이블 필드 사전

> 기준: `lib/schema.ts`의 현재 Drizzle 스키마와 해당 테이블을 읽는 API. 예시값은 형식 설명용 가상값이며 실제 특정 종목의 최신 값이 아니다. nullable 필드는 아직 수집되지 않았거나 해당 공시/응답에 없는 경우 `NULL`일 수 있고, `raw_payload`/JSON payload는 공급자 원문을 보존하므로 종목별 구조가 달라질 수 있다.

## 1. 종목 마스터·분류

### `us_common_stock_universe`, `us_special_instrument_universe`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `id` | 내부 행 식별자 | `127` |
| `market` | 거래소/시장 코드 | `NAS` |
| `code` | 시스템에서 사용하는 티커 | `AAPL` |
| `realtime_symbol` | 실시간 시세 서비스용 심볼 | `AAPL` |
| `name` | 현지/기본 종목명 | `애플` |
| `english_name` | 영어 종목명 | `Apple Inc.` |
| `instrument_type` | 내부 상품 분류; 보통주 여부 판별에 사용 | `COMMON_STOCK` |
| `security_type` | 원천 종목 마스터의 증권 유형 코드 | `CS` |
| `etp_type` | ETF/ETP 등 상품 유형 코드 | 빈 문자열 또는 원천 코드 |
| `currency` | 거래 통화 | `USD` |
| `country_code` | 국가 코드 | `US` |
| `industry_code` | 원천 업종 코드(세부 분류명 아님) | `TECH` 또는 원천 코드 |
| `is_etf` | ETF 여부 | `false` |
| `is_leveraged` | 레버리지 상품 여부 | `false` |
| `is_inverse` | 인버스 상품 여부 | `false` |
| `is_warrant` | 워런트 여부 | `false` |
| `is_derivative` | 파생/권리 등 파생성 상품 여부 | `false` |
| `is_dr` | 예탁증서 여부 | `false` |
| `enabled` | 현재 유니버스에서 활성 상태인지 | `true` |
| `source_file` | 종목 마스터 원본 파일/출처 | `nasdaq_master.csv` |
| `raw_payload` | 해당 행의 공급자 원문/추가 필드 | `{"symbol":"AAPL"}` |
| `first_seen_at` | 시스템이 처음 발견한 시각 | `2026-10-20T02:00:00Z` |
| `last_seen_at` | 마지막으로 원천 마스터에서 확인한 시각 | `2026-10-23T02:00:00Z` |
| `missing_runs` | 연속 원천 갱신에서 누락된 횟수 | `0` |
| `created_at`, `updated_at` | DB 생성·최종 변경 시각 | ISO timestamp |

### `kr_common_stock_universe`, `kr_special_instrument_universe`, `kr_instrument_universe`

세 테이블은 아래 동일 필드를 사용한다. 첫 테이블은 국내 보통주, 두 번째는 특수상품 분리 보관, 세 번째는 호환·전체 유니버스 역할이다.

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `id` | 내부 행 식별자 | `1` |
| `market` | 국내 시장 구분 | `KOSPI` |
| `code` | 종목 코드 | `005930` |
| `standard_code` | 표준 종목 식별코드 | `KR7005930003` |
| `name` | 종목명 | `삼성전자` |
| `instrument_type` | 보통주/상품 분류 | `COMMON_STOCK` |
| `security_group_code` | KRX/KIS 종목 그룹 코드 | 원천 코드 |
| `market_cap_scale` | 원천 시총 규모 구간 코드 | 원천 코드 |
| `industry_large_code`, `industry_medium_code`, `industry_small_code` | KIS 종목 마스터의 지수 업종 분류 코드. 표준산업분류와 별도 원천 필드 | 원천 코드 |
| `standard_industry_code`, `standard_industry_name` | KIS 주식기본조회(`CTPF1002R`)의 표준산업분류코드(`std_idst_clsf_cd`)와 분류명 | `032604`, `통신 및 방송 장비 제조업` |

운영 국내 보통주 유니버스가 비어 있으면 `/api/admin/domestic-universe-import`에 KIS 공식 `kospi_code.mst`, `kosdaq_code.mst` 두 파일을 관리자 세션으로 올려 국내 시장만 구성한다. 이 경로는 미국 유니버스나 누락된 기존 종목을 갱신/비활성화하지 않는다. 이후 `/api/admin/domestic-industry-sync`가 활성 `COMMON_STOCK`만 대상으로 KIS `CTPF1002R` 응답을 검증하고 산업분류 컬럼을 저장한다.
| `etp_product_class_code` | ETP 상품 분류 코드 | 빈 문자열 또는 코드 |
| `preferred_class_code` | 우선주 분류 코드 | 빈 문자열 또는 코드 |
| `trading_halt_code` | 거래정지 상태 코드 | 정상 상태 코드 |
| `liquidation_code` | 정리매매/청산 관련 상태 코드 | 정상 상태 코드 |
| `managed_issue_code` | 관리종목 등 관리 상태 코드 | 정상 상태 코드 |
| `enabled` | 마스터상 활성 상태 | `true` |
| `is_etp`, `is_warrant`, `is_preferred`, `is_suspended` | 상품·우선주·거래정지 플래그 | `false` |
| `source_file`, `raw_payload` | 원천 파일명과 공급자 원문 행 | 파일명, JSON 문자열 |
| `first_seen_at`, `last_seen_at` | 처음/마지막 확인 시각 | ISO timestamp |
| `missing_runs` | 마스터 갱신 연속 누락 횟수 | `0` |
| `created_at`, `updated_at` | DB 생성·수정 시각 | ISO timestamp |

### `us_instrument_universe`

과거 호환 이름으로 유지되는 뷰/테이블이며 필드는 미국 유니버스와 동일하다. 신규 쓰기는 common/special 분리 테이블을 대상으로 한다.

## 2. 시세·봉 데이터

### `us_instrument_universe_candles`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `id` | 내부 행 ID | `9001` |
| `market`, `code` | 거래소와 티커 | `NAS`, `AAPL` |
| `timeframe` | 봉 주기 | `D`, `W`, `M` |
| `candle_date` | 봉의 기준 날짜(문자열) | `20261023` |
| `period_end_date` | 주/월봉 기간 종료일 | `20261023` |
| `candle_time` | 봉 시각(있는 경우) | ISO timestamp 또는 `NULL` |
| `open`, `high`, `low`, `close` | 시가·고가·저가·종가 | `250.00`, `255.00`, `248.00`, `253.00` |
| `volume` | 해당 봉 거래량 | `32000000` |
| `price_sign`, `price_diff`, `change_rate` | 원천 부호·가격 차이·등락률 | `2`, `3.00`, `1.20` |
| `trading_value` | 거래대금(원천 저장값; 단위/통화는 `market`·원천 기준 확인) | `8096000000` |
| `raw_payload` | KIS/공급자 원시 행 | JSON 문자열 |
| `source` | 데이터 출처 | `KIS` |
| `fetched_at` | DB 적재/조회 시각 | ISO timestamp |

### `kr_instrument_universe_candles`

미국 봉 테이블과 동일하게 `id`, `market`, `code`, `timeframe`, `candle_date`, `candle_time`, `open`, `high`, `low`, `close`, `volume`, `raw_payload`, `source`, `fetched_at`을 가진다. 국내 테이블에는 현재 `period_end_date`, `price_sign`, `price_diff`, `change_rate`, `trading_value` 컬럼이 없다.

### `kr_latest_daily_candles`, `us_latest_daily_candles`

종목별 최신 일봉만 빠르게 제공하는 축약 캐시다.

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `market`, `code` | 거래소와 티커/종목코드 | `NYS`, `MSFT` |
| `candle_date` | 최신 봉 날짜 | `20261023` |
| `open`, `high`, `low`, `close`, `volume` | 최신 일봉 OHLCV | `510`, `518`, `507`, `516`, `18000000` |
| `fetched_at` | 캐시 적재 시각 | ISO timestamp |

## 3. 기본정보·재무 스냅샷

### `instrument_fundamental_snapshots`

종목별 최신 기본/시세 스냅샷. 차트 봉과 별도이며 일부 필드는 가격/당일 거래정보다.

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `id` | 내부 행 ID | `31` |
| `market`, `code`, `name` | 시장·티커·종목명 | `NAS`, `AAPL`, `Apple Inc.` |
| `price`, `change_rate` | 최신/관측 가격과 등락률 | `253.00`, `1.2`(%) |
| `open`, `high`, `low` | 관측 구간의 시가·고가·저가 | `250`, `255`, `248` |
| `volume`, `trading_value` | 거래량·거래대금 | `32000000`, `8096000000` |
| `market_cap` | 시가총액 | `3800000000000` |
| `listed_shares` | 발행/상장 주식 수 원천값(유통주식수와 동일하다고 단정하지 말 것) | `15000000000` |
| `currency` | 금액 통화 | `USD` |
| `source` | 원천 제공자 | `KIS` |
| `raw_payload` | 전체 원천 응답/확장 데이터 | JSON 문자열 |
| `observed_at` | 값이 시장/공급자에서 관측된 시각 | ISO timestamp |
| `fetched_at` | 애플리케이션이 조회·저장한 시각 | ISO timestamp |

### `instrument_fundamental_history`

위 스냅샷의 동일한 값 필드(시장, 코드, 이름, 가격, 등락률, OHLC, 거래량, 거래대금, 시총, 상장주식수, 통화, 출처, 원문)를 시점별로 보관한다. `observed_at`이 종목·시장별 시계열 키이며 `fetched_at`은 수집 시각이다. 예: `AAPL`, `market_cap=3.8e12`, `observed_at=2026-10-23T20:00Z`.

## 4. SEC 기업·재무·공시 정보

### `sec_companies`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `cik` | SEC 회사 식별번호(10자리 문자열) | `0000320193` |
| `name` | SEC 기준 회사명 | `Apple Inc.` |
| `tickers` | 이 CIK에 매핑된 티커 배열 | `[`AAPL`]` |
| `exchanges` | 매핑 거래소 배열 | `[`NASDAQ`]` |
| `sic` | SEC Standard Industrial Classification 코드 | `가령  smartphones 관련 SIC 코드` |
| `source_updated_at` | SEC 원천 자료 갱신 시각 | ISO timestamp |
| `updated_at` | 로컬 DB 갱신 시각 | ISO timestamp |

### `sec_xbrl_snapshots`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `cik` | 회사별 PK | `0000320193` |
| `payload` | SEC Company Facts 전체 JSON; `entityName`, `facts`, taxonomy/tag별 단위·기간·값·공시 accession 등이 포함될 수 있음 | `{"entityName":"Apple Inc.","facts":{"us-gaap":...}}` |
| `fetched_at` | 원본 JSON 수집 시각 | ISO timestamp |

### `sec_submissions`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `accession` | SEC 제출 고유번호 | `0000320193-26-000001` |
| `cik` | 제출 회사 CIK | `0000320193` |
| `form` | 제출 서식 | `10-Q`, `8-K`, `20-F` |
| `filing_date`, `report_date` | 제출일·보고 대상 기준일 | `2026-10-23`, `2026-09-30` |
| `primary_document`, `primary_doc_description` | 대표 문서 파일명·설명 | `aapl-20260930.htm`, `Quarterly report` |
| `items` | 8-K 등 공시 항목 번호/목록 | `2.02, 9.01` |
| `acceptance_datetime` | SEC 접수 시각 문자열 | `2026-10-23T16:05:00Z` |
| `filing_url` | SEC 제출 상세/원문 링크 | `https://www.sec.gov/Archives/...` |
| `raw_payload` | SEC 제출 이력 원문 JSON | JSON object |
| `classified_category`, `classified_direction`, `classified_score`, `matched_terms` | 프로젝트 분류 결과와 근거 키워드 | `EARNINGS`, `POSITIVE`, `3`, `[...]` |
| `created_at`, `updated_at` | DB 생성·수정 시각 | ISO timestamp |

### `sec_source_snapshots`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `id` | 원천 snapshot 내부 ID | `42` |
| `source_type`, `source_key` | 자료 유형·대상 식별자 | `COMPANY_FACTS`, `0000320193` |
| `url` | 실제 SEC 원천 요청 주소 | `https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json` |
| `status` | 원천 HTTP 응답 코드 | `200` |
| `response_headers` | 원천 HTTP 헤더 JSON | `{ "content-type": "application/json" }` |
| `raw_payload` | 응답 본문 원문 | SEC JSON 문자열 |
| `content_hash` | 동일 본문 중복 제거용 해시 | SHA-256 문자열 |
| `fetched_at`, `created_at` | 원천 수집 시각·DB 적재 시각 | ISO timestamp |

### `sec_filing_documents`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `accession`, `cik`, `form` | 공시 고유번호·회사 CIK·서식 | accession, `0000320193`, `8-K` |
| `index_url`, `primary_url` | SEC 제출 인덱스와 대표 원문 주소 | SEC Archives URL |
| `index_html`, `primary_html` | 제출 인덱스·대표 문서 HTML 원문 | HTML 문자열 |
| `primary_text` | 대표 문서에서 정규화한 텍스트 | `Item 2.02 ...` |
| `fetched_at`, `created_at`, `updated_at` | 원문 수집·DB 생성·변경 시각 | ISO timestamp |

### `sec_codex_analysis_queue`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `accession` | 분석 대상 SEC 공시 고유번호 | accession |
| `status`, `attempts` | 분석 큐 상태·시도 횟수 | `PENDING`, `1` |
| `claimed_at`, `analyzed_at` | 작업 선점·분석 완료 시각 | ISO timestamp 또는 `NULL` |
| `result` | 분석 결과 JSON(있는 경우) | `{"direction":"POSITIVE",...}` |
| `last_error` | 최근 분석 오류 | `NULL` |
| `created_at`, `updated_at` | 큐 행 생성·수정 시각 | ISO timestamp |

### `sec_filing_events`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `accession`, `cik` | 원천 공시 ID와 회사 ID | SEC accession, `0000320193` |
| `category`, `direction`, `score` | 프로젝트의 공시 유형·방향·점수 | `EARNINGS`, `POSITIVE`, `3` |
| `matched_terms`, `body_excerpt` | 분류에 사용한 항목/본문 발췌 | `[...]`, `실적 발표 요약` |
| `financing_amount_usd` | 공시에서 파싱된 조달 규모(해당 시) | `250000000` |
| `dilution_risk`, `insider_action` | 희석 위험·내부자 행위 요약 | `LOW`, `BUY` |
| `discord_status`, `discord_sent_at`, `last_error` | 알림 전송 상태·시각·오류 | `SENT`, ISO timestamp, `NULL` |
| `created_at`, `updated_at` | DB 생성·수정 시각 | ISO timestamp |

### `sec_stock_risks`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `market`, `ticker`, `company_name` | 시장·티커·회사명 | `US`, `AAPL`, `Apple Inc.` |
| `risk` | 구조화 위험 항목 JSON | `{"schemaVersion":2,"items":[...]}` |
| `market_cap_usd`, `market_cap_observed_at` | 위험 데이터와 함께 보관한 USD 시총 및 기준시각 | `3800000000000`, ISO timestamp |
| `sec_cik` | SEC 회사 식별자 | `0000320193` |
| `source_accessions`, `source_urls` | 위험 판단 근거 공시 ID·URL | `["..."]`, `["https://..."]` |
| `risk_as_of`, `source_updated_at` | 위험 기준일·원천 업데이트 시각 | `2026-10-23`, ISO timestamp |
| `updated_at`, `updated_by` | 로컬 변경 시각·작성 주체 | ISO timestamp, `LOCAL_API` |

### `market_impact_events`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `event_id`, `event_date`, `market`, `ticker`, `company_name` | 안정 이벤트 ID·기준일·KR/US·공식 보통주 티커·회사명 | `DART:...`, `2026-10-29`, `KR`, `034730`, `SK` |
| `event_type`, `status`, `direction`, `impact_horizon`, `confidence` | 사건 유형·사실/일정 상태·잠재 방향·영향 기간·근거 신뢰도 | `STRATEGIC_RESTRUCTURING`, `REPORTED`, `MIXED`, `LONG_TERM`, `HIGH` |
| `title`, `summary`, `rationale` | 사실 요약과 잠재 영향 해석 | 문자열 |
| `source_type`, `source_id`, `source_url`, `published_at` | 공시 출처·접수/accn 식별자·원문 URL·확인된 공시 시각 | `DART`, 접수번호, URL, ISO timestamp |
| `evidence`, `risks`, `limitations`, `raw_event` | 원문 인용/위치·반대 근거·한계·JSON 원본 이벤트 | JSONB |
| `updated_at` | 마지막 upsert 시각 | ISO timestamp |

## 5. 뉴스·공시 기사

### `market_rss_articles`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `id`, `source`, `external_id` | 내부 ID·피드 출처·원천 기사 ID | `1`, `STOCKTITAN`, 원천 GUID |
| `title`, `summary`, `content`, `link`, `published_at` | 원문 제목·요약·본문·링크·게시시각 | 문자열·URL·ISO timestamp |
| `raw_payload`, `source_snapshot_id` | 원천 피드 전체 item JSON과 응답 스냅샷 ID | JSON, `42` |
| `detected_ticker` | 기사에서 식별한 티커(미확인 가능) | `AAPL` |
| `event_direction`, `category`, `priority`, `matched_terms` | 방향·분류·우선순위·감지 키워드 | `POSITIVE`, `EARNINGS`, `80`, `[...]` |
| `financing_amount_usd`, `dilution_risk` | 기사에서 추출한 자금조달액·희석 위험 | `250000000`, `HIGH` |
| `notify_eligible`, `is_backlog` | 알림 대상 여부·백로그 여부 | `true`, `false` |
| `translated_title`, `translation_candidate_title`, `translated_summary`, `translated_content` | 번역 제목 후보 및 번역 요약/본문 | 한국어 문자열 |
| `translation_provider`, `translation_source_language`, `translation_target_language` | 번역 공급자·원/대상 언어 | `GOOGLE`, `en`, `ko` |
| `translation_char_count`, `translation_status`, `translation_fallback`, `translation_attempts` | 번역량·상태·대체 사용·시도 횟수 | `120`, `COMPLETED`, `false`, `1` |
| `translation_skipped_reason`, `translation_error`, `translation_translated_at`, `translation_attempted_at` | 미번역/실패 사유와 번역 시각 | 문자열/`NULL`, timestamp |
| `notification_status`, `notification_attempts`, `notified_at`, `last_error` | 알림 상태·재시도·전송 시각·마지막 오류 | `SENT`, `1`, timestamp, `NULL` |
| `created_at`, `updated_at` | DB 생성·수정 시각 | ISO timestamp |

### `market_rss_bullish_articles`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `id`, `source`, `external_id`, `source_article_id` | 내부 ID·피드·원천 기사 식별자·원문 테이블 ID | `8`, `SEC_EDGAR`, GUID, `123` |
| `title`, `translated_title`, `summary`, `translated_summary`, `content`, `link`, `published_at` | 원문/번역 기사 제목·요약·본문·링크·게시시각 | 문자열·URL·timestamp |
| `ticker` | 연결된 종목 티커(미확인 시 NULL) | `ABCD` |
| `category`, `direction`, `matched_terms`, `priority` | 프로젝트 분류·방향·일치 항목·우선순위 | `CONTRACT`, `POSITIVE`, `[...]`, `80` |
| `financing_amount_usd`, `dilution_risk` | 기사에서 추출한 조달 규모·희석 위험 | `250000000`, `HIGH` |
| `translation_status`, `translation_fallback`, `translation_error` | 번역 상태·fallback 사용·오류 | `COMPLETED`, `false`, `NULL` |
| `analyzed_at`, `created_at`, `updated_at` | 분석·DB 생성·변경 시각 | ISO timestamp |

## 6. 일정·KIS 보조 데이터·분봉

### `investment_calendar_events`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `id`, `market`, `code`, `company_name` | ID·시장·nullable 종목코드·회사명 | `1`, `US`, `ABCD`, `Example Inc.` |
| `event_type`, `event_date`, `event_end_date` | 일정 종류·시작일·종료일(선택) | `EARNINGS`, `2026-11-05`, `NULL` |
| `title`, `description` | 일정 제목·설명 | `Quarterly results`, `Q3 earnings` |
| `source`, `source_url`, `external_id` | 출처·원문 URL·출처별 ID | `SEC`, URL, accession |
| `raw_payload` | 일정 원천 JSON | JSON object |
| `fetched_at`, `updated_at` | 수집·최종 수정 시각 | ISO timestamp |

### `kis_signal_snapshots`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `id`, `market`, `code` | 행 ID·시장·종목 코드 | `12`, `NAS`, `ABCD` |
| `signal_type`, `status`, `source` | 신호 종류·수집 상태·출처 | `candidate_us_top_rising`, `AVAILABLE`, `KIS` |
| `observed_at`, `fetched_at` | 시장 데이터 관측·DB 수집 시각 | ISO timestamp |
| `payload` | signal_type별 정규화 JSON 결과 | `{ "rvol": 2.1, "rank": 4 }` |
| `raw_payload` | 원천 응답 원문 문자열 | JSON 문자열 |

종목별 조회/스캐너 결과를 신호 종류별로 저장한다. `payload` 구조는 `signal_type`에 따라 다르며 모든 신호가 모든 종목에 존재하지 않는다.

### `kis_realtime_events`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `id`, `market`, `code` | 이벤트 ID·시장·종목 코드 | `19`, `NAS`, `ABCD` |
| `channel`, `tr_id` | 실시간 채널·KIS 거래 ID | `H0STCNT0`, KIS TR ID |
| `observed_at` | 이벤트 수신/관측 시각 | ISO timestamp |
| `payload`, `raw_payload` | 파싱 JSON과 원천 응답 문자열 | JSON object/문자열 |

### `kr_minute_candles`, `us_minute_candles`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `market`, `code` | 시장·종목 코드 | `NAS`, `ABCD` |
| `candle_date`, `candle_time` | 거래일·분봉 시각 | `20261023`, `09:31:00` |
| `open`, `high`, `low`, `close`, `volume` | 분봉 OHLC 및 거래량 | `10.1`, `10.3`, `10.0`, `10.2`, `12500` |
| `source`, `fetched_at` | 시세 출처·수집 시각 | `KIS`, ISO timestamp |

국내/미국 분봉 테이블의 컬럼 구조는 동일하다. 실제 보존 주기는 운영 설정에 따를 수 있다.

### `kr_minute_fetch_logs`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `id`, `market`, `code` | 요청 로그 ID·시장·종목 | `1`, `KOSDAQ`, `005930` |
| `request_date`, `request_time` | 요청 기준 날짜·시각 | `20261023`, `09:31:00` |
| `http_status`, `response_code`, `response_message`, `response_count` | HTTP 및 원천 응답 코드·문구·행 수 | `200`, `0`, `정상`, `30` |
| `request_url` | 요청 주소(민감 자격증명 제외 필요) | KIS API path/query |
| `raw_payload`, `parsed_payload` | 원문 응답·파싱 결과 | JSON 문자열 |
| `ok`, `error` | 성공 여부·오류 요약 | `true`, `NULL` |
| `fetched_at` | 로그 저장/수집 시각 | ISO timestamp |

인증 토큰 등 비밀 정보는 URL/원문에 포함되지 않아야 한다.

### `us_price_detail_cache`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `id`, `market`, `code` | 캐시 ID·거래소·티커 | `1`, `NAS`, `AAPL` |
| `status` | 공급자 HTTP 상태 | `200` |
| `parsed` | KIS 상세 시세 파싱 응답 JSON | `{ "last":"253.00", "name":"Apple Inc." }` |
| `fetched_at` | 캐시 조회/갱신 시각 | ISO timestamp |

`parsed`는 원천 응답 구조이므로 가격·변동률·시총 등 실제 제공 필드는 응답별로 다르다.

## 7. 보조 종목 추적·알림 상태

### `us_news_ticker_exchange_cache`

`ticker`(PK), `market`, nullable `instrument_id`, `validated_at`. 뉴스 ticker를 거래소/내부 종목 ID와 연결한 검증 캐시다. 예: `ABCD`, `NAS`, `123`, timestamp.

### `us_news_radar_events`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `external_id`, `ticker` | 뉴스 ID·연결 티커 | GUID, `ABCD` |
| `market`, `instrument_id` | nullable 시장·내부 종목 ID | `NAS`, `123` |
| `title` | 감지된 뉴스 제목 | `Example announces contract` |
| `status`, `attempts`, `last_error` | 알림 처리상태·횟수·마지막 오류 | `SENT`, `1`, `NULL` |
| `sent_at`, `observed_at`, `updated_at` | 발송·감지·수정 시각 | ISO timestamp |

미국 뉴스 감지·알림 상태를 저장하며 기사 전체 내용은 이 테이블에 저장하지 않는다.

### `us_breaking_news_discord_delivery`

| 필드명 | 정보와 의미 | 예시값 |
|---|---|---|
| `external_id`, `title` | 속보 원천 ID·제목 | GUID, `Example headline` |
| `source`, `published_at` | nullable 출처·게시시각 | `NASDAQ`, ISO timestamp |
| `status`, `attempts`, `last_error` | Discord 전송 상태·시도·오류 | `SENT`, `1`, `NULL` |
| `sent_at`, `updated_at` | 발송·수정 시각 | ISO timestamp |

속보 Discord 전송 중복 방지/결과 기록이며 기업 프로필 데이터는 아니다.

### `us_turnover_watchlist`, `us_turnover_watchlist_alert_state`

| 테이블 | 필드명 | 정보와 의미 | 예시값 |
|---|---|---|---|
| `us_turnover_watchlist` | `instrument_id` | 감시 대상 내부 종목 ID | `123` |
| `us_turnover_watchlist` | `enabled` | 감시 활성 여부 | `true` |
| `us_turnover_watchlist` | `created_at`, `updated_at` | 행 생성·수정 시각 | ISO timestamp |
| `us_turnover_watchlist_alert_state` | `instrument_id` | 감시 종목 ID | `123` |
| `us_turnover_watchlist_alert_state` | `last_sent_at` | 마지막 알림 발송 시각 | ISO timestamp 또는 `NULL` |
| `us_turnover_watchlist_alert_state` | `last_fingerprint` | 동일 알림 억제용 지문 | 해시 문자열 |
| `us_turnover_watchlist_alert_state` | `updated_at` | 상태 수정 시각 | ISO timestamp |

종목 값/재무정보가 아니라 감시 대상과 알림 중복 방지 상태다.

## 8. 해석 시 주의할 점

- 이 카탈로그는 종목과 직접 연결되는 저장 테이블 기준이다. 자동화 실행 로그·전체 API 사용 로그·계정별 관심종목 등 운영/사용자 상태 테이블은 종목의 사실 데이터가 아니어서 제외했다.
- 모든 테이블이 모든 종목에 채워져 있지는 않다. 유니버스 등재, 기능 실행 여부, 시장·거래소, 공급자 응답과 공시 범위에 따라 행이 없거나 값이 `NULL`일 수 있다.
- `raw_payload`/`payload`는 원본 또는 기능별 가변 JSON이며, 정규화된 동일 스키마로 모든 공급자 값을 보장하지 않는다.
- 프로젝트는 별도 지표 캐시를 사용하지 않는 원칙이다. RSI/EMA/볼린저밴드 등 일부 지표는 조회 시 계산되거나 API 응답에 포함되며, 위 테이블 목록에 지속 저장된다고 보면 안 된다.
- 현재 테이블에는 일관된 일반 기업 프로필(사업 설명, 웹사이트, 본사 주소, 임직원 수, 세부 섹터명 등)을 제공하는 단일 정규화 테이블이 없다. 미국 마스터의 `industry_code`, 국내 마스터의 업종 코드들은 원천 코드이며 코드명 매핑/설명이 별도 제공되는지 확인해야 한다.

