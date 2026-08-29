# 데이터베이스 구조

이 문서는 현재 코드의 [`lib/schema.ts`](../../lib/schema.ts)와 `db/migration/`을 기준으로 관리한다. 실제 DB 변경은 기존 마이그레이션을 수정하지 않고 새 Flyway 마이그레이션으로 추가한다.

## 연결·저장 원칙

```text
KIS / SEC / DART / RSS
        ↓
lib/* client·parser
        ↓
application service / cache job
        ↓
PostgreSQL (DATABASE_URL)
        ↓
scanner·API·알림·관리자 화면
```

- KIS 토큰은 `kis_tokens` 단일 행에 저장한다.
- 일·주·월봉은 시장별 캔들 테이블에 저장하며 `market + code + timeframe + candle_date`가 유일키다.
- 탐지 모듈은 원본 KIS API가 아니라 저장된 캔들 캐시를 우선 사용한다.
- `*_cache`, 스냅샷, 원문 테이블은 원본·갱신 시각을 함께 보존한다.
- 애플리케이션 레벨 논리 관계는 아래 문서에 표시하며, 현재 `schema.ts`에는 외래키 선언이 없다.

## 테이블 카탈로그

### 공시·알림·설정

| 테이블 | 주요 구조 | 용도·키 |
|---|---|---|
| `filings` | `id`, `source`, `external_id`, `company`, `title`, `judgment`, `form_type`, `keywords[]`, `summary`, `published_at`, `published_date_seoul`, `link`, `created_at`, `updated_at` | DART·SEC 공시 통합 이력. `(source, external_id)` 유일 |
| `alert_events` | `id`, `source`, `external_id`, `created_at` | 공시 알림 중복 방지. `(source, external_id)` 유일 |
| `push_subscriptions` | `id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `enabled`, `dart_enabled`, `intensity_enabled`, `rising_enabled`, `created_at`, `updated_at` | Web Push 구독. `endpoint` 유일 |
| `telegram_subscribers` | `id`, `chat_id`, `enabled`, `created_at`, `updated_at` | Telegram 구독. `chat_id` 유일 |
| `feature_module_settings` | `module_key`, `settings`, `updated_at` | 기능 모듈 JSON 설정. `module_key` PK |
| `kis_api_configs` | `key`, `config`, `updated_at` | 관리자 KIS API 설정. `key` PK |
| `automation_notification_deliveries` | `module_key`, `delivery_date`, `status`, `attempts`, `sent_at`, `last_error`, `updated_at` | 자동화 일별 알림 중복 방지. `(module_key, delivery_date)` 유일 |

### KIS 인증·캐시

| 테이블 | 주요 구조 | 용도·키 |
|---|---|---|
| `kis_tokens` | `id`, `access_token`, `issued_at`, `expires_at` | 실전 KIS REST 토큰. `id=1` 단일 행 |
| `kis_cache` | `key`, `data`, `updated_at` | 실시간·장외 복원용 JSON 캐시. `key` PK |
| `kr_instrument_universe_candles` | `id`, `market`, `code`, `timeframe`, `candle_date`, `candle_time`, `open`, `high`, `low`, `close`, `volume`, `source`, `fetched_at` | 국내 일·주·월봉. `(market, code, timeframe, candle_date)` 유일 |
| `us_instrument_universe_candles` | `id`, `market`, `code`, `timeframe`, `candle_date`, `candle_time`, `open`, `high`, `low`, `close`, `volume`, `source`, `fetched_at` | 미국 일·주·월봉. 동일 복합 유일키 |
| `kr_minute_candles` | `market`, `code`, `candle_date`, `candle_time`, `open`, `high`, `low`, `close`, `volume`, `source`, `fetched_at` | 국내 분봉. `(market, code, candle_date, candle_time)` 유일 |
| `us_minute_candles` | `market`, `code`, `candle_date`, `candle_time`, `open`, `high`, `low`, `close`, `volume`, `source`, `fetched_at` | 미국 분봉. 동일 복합 유일키 |
| `us_price_detail_cache` | `id`, `market`, `code`, `status`, `parsed`, `fetched_at` | 미국 현재가 파싱 캐시. `(market, code)` 유일 |
| `instrument_fundamental_snapshots` | `id`, `market`, `code`, `name`, `price`, `change_rate`, `open`, `high`, `low`, `volume`, `trading_value`, `market_cap`, `shares_outstanding`, `free_float_shares`, `free_float_percent`, `currency`, `source`, `raw_payload`, `observed_at`, `fetched_at` | 종목 기본·시세 스냅샷. `(market, code)` 유일 |

### 종목 유니버스·동기화

| 테이블 | 주요 구조 | 용도·키 |
|---|---|---|
| `kr_instrument_universe` | `id`, `market`, `code`, `standard_code`, `name`, 분류 코드들, `enabled`, `is_etp`, `is_warrant`, `is_preferred`, `is_suspended`, `source_file`, `raw_payload`, `first_seen_at`, `last_seen_at`, `missing_runs`, `created_at`, `updated_at` | 국내 공식 종목 유니버스. `(market, code)` 유일 |
| `us_instrument_universe` | `id`, `market`, `code`, `realtime_symbol`, `name`, `english_name`, `instrument_type`, `security_type`, `etp_type`, `currency`, `country_code`, `industry_code`, 상품·파생 플래그, `enabled`, 원본·관측 시각 필드 | 미국 종목 유니버스. `(market, code)` 유일 |
| `instrument_universe_sync_runs` | `id`, `scope`, `source_directory`, `status`, `source_count`, `inserted_count`, `updated_count`, `deactivated_count`, `excluded_count`, `error_count`, `error_summary`, `started_at`, `completed_at` | 유니버스 동기화 실행 이력 |
| `us_turnover_watchlist` | `instrument_id`, `enabled`, `created_at`, `updated_at` | 미국 거래강도 감시 목록. `instrument_id` PK |
| `us_turnover_watchlist_alert_state` | `instrument_id`, `last_sent_at`, `last_fingerprint`, `updated_at` | 감시 알림 상태. `instrument_id` PK |
| `us_news_ticker_exchange_cache` | `ticker`, `market`, `instrument_id`, `validated_at` | 뉴스 티커·거래소 검증 캐시. `ticker` PK |

### 자동화·장애·전송

| 테이블 | 주요 구조 | 용도·키 |
|---|---|---|
| `automation_runs` | `id`, `module_key`, `job_type`, `market`, `timeframe`, `trigger_type`, `retry_count`, `duration_ms`, `status`, `started_at`, `finished_at`, `summary`, `error_message` | cron·수동 자동화 실행 이력 |
| `discord_delivery_queue` | `id`, `external_id`, `channel_key`, `payload`, `status`, `attempts`, `next_attempt_at`, `last_error`, `sent_at`, `created_at`, `updated_at` | Discord 비동기 전송 큐. `external_id` 유일 |
| `us_breaking_news_discord_delivery` | `external_id`, `title`, `source`, `published_at`, `status`, `attempts`, `last_error`, `sent_at`, `updated_at` | 미국 속보 Discord 중복·전송 상태 |
| `instrument_candle_cache_failures` | `id`, `market`, `code`, `timeframe`, `error`, `observed_at` | 캔들 캐시 실패 이력 |
| `instrument_candle_cache_retries` | `id`, `market`, `code`, `timeframe`, `status`, `attempts`, `next_attempt_at`, `last_error`, `last_attempt_at`, `succeeded_at`, `created_at`, `updated_at` | 캔들 재시도 큐. `(market, code, timeframe)` 유일 |
| `daily_bollinger_cache_retries` | `id`, `scope`, `zone`, `status`, `attempts`, `next_attempt_at`, `last_error`, `last_attempt_at`, `succeeded_at`, `created_at`, `updated_at` | BB 후속 캐시 재시도. `(scope, zone)` 유일 |
| `us_news_radar_events` | `external_id`, `ticker`, `market`, `instrument_id`, `title`, `status`, `attempts`, `last_error`, `sent_at`, `updated_at` | 미국 뉴스 레이더 이벤트. `external_id` PK |

### RSS·SEC 원문 및 분석

| 테이블 | 주요 구조 | 용도·키 |
|---|---|---|
| `market_rss_articles` | `id`, `source`, `external_id`, `title`, `summary`, `raw_payload`, `source_snapshot_id`, `detected_ticker`, 분류·번역·알림 상태 필드, `link`, 발행·생성·갱신 시각 | 시장 RSS 기사. `(source, external_id)` 유일 |
| `market_rss_fetch_snapshots` | `id`, `source`, `url`, `status`, `response_headers`, `raw_payload`, `content_hash`, `item_count`, `fetched_at`, `created_at` | RSS 원문 응답 보관. `(source, content_hash)` 유일 |
| `sec_companies` | `cik`, `name`, `tickers[]`, `exchanges[]`, `sic`, `source_updated_at`, `updated_at` | SEC 회사 마스터. `cik` PK |
| `sec_submissions` | `accession`, `cik`, `form`, `filing_date`, `report_date`, `primary_document`, `primary_doc_description`, `items`, `acceptance_datetime`, `filing_url`, `raw_payload`, 분류 결과 필드, `created_at`, `updated_at` | SEC 제출 메타데이터. `accession` PK |
| `sec_source_snapshots` | `id`, `source_type`, `source_key`, `url`, `status`, `response_headers`, `raw_payload`, `content_hash`, `fetched_at`, `created_at` | SEC JSON 원문 스냅샷. `(source_type, source_key, content_hash)` 유일 |
| `sec_filing_documents` | `accession`, `cik`, `form`, `index_url`, `primary_url`, `index_html`, `primary_html`, `primary_text`, `fetched_at`, `created_at`, `updated_at` | SEC 인덱스·주 문서 원문. `accession` PK |
| `sec_filing_events` | `accession`, `cik`, `category`, `direction`, `score`, `matched_terms[]`, `body_excerpt`, 금융·내부자 필드, Discord 상태·오류·시각 | SEC 분석 이벤트. `accession` PK |
| `sec_xbrl_snapshots` | `cik`, `payload`, `fetched_at` | SEC XBRL facts 스냅샷. `cik` PK |

## 국내 일봉 캐시 흐름

```text
kr_instrument_universe
  → lib/kr-daily-cache-job.ts
  → lib/kr-daily-price-cache.ts
  → KIS 실전 REST API (TPS 18 기준)
  → kr_instrument_universe_candles
  → 일봉 탐지·주봉/월봉 판정·API 응답
```

국내 일봉 캐시 갱신 시 `market` 값은 `KR`이 아니라 실제 시장 코드인 `KOSPI` 또는 `KOSDAQ`으로 저장된다. 따라서 현황 조회는 다음처럼 시장별로 확인한다.

```sql
SELECT market, timeframe, COUNT(*) AS candle_count,
       MAX(fetched_at) AS latest_fetched_at,
       MAX(candle_date) AS latest_candle_date
FROM kr_instrument_universe_candles
GROUP BY market, timeframe
ORDER BY market, timeframe;
```

## 문서 갱신 규칙

1. `lib/schema.ts`에 테이블·컬럼·인덱스를 변경하면 이 문서도 같은 변경 세트에서 갱신한다.
2. 실제 DB 변경은 새 `db/migration/V번호__설명.sql`로 기록한다.
3. 컬럼을 삭제하거나 이름을 바꾸기 전에 사용처를 `rg`로 확인한다.
4. 문서에는 토큰·비밀키·실제 연결 문자열을 기록하지 않는다.
