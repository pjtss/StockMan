import { pgTable, bigserial, bigint, text, timestamp, date, boolean, integer, uniqueIndex, index, check, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 1. DART 및 SEC 공시 이력 엔티티
export const filings = pgTable(
  "filings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    judgment: text("judgment").notNull(),
    formType: text("form_type"),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    summary: text("summary").notNull().default(""),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    publishedDateSeoul: date("published_date_seoul").notNull(),
    link: text("link").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("filings_source_external_id_unique").on(table.source, table.externalId),
    uniqueIndex("filings_source_date_idx").on(table.source, table.publishedDateSeoul, table.publishedAt),
  ]
);

// 2. 알림 발송 완료 이벤트 엔티티 (중복 방지용)
export const alertEvents = pgTable(
  "alert_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("alert_events_source_external_id_unique").on(table.source, table.externalId),
  ]
);

export const usTurnoverRatioSnapshots = pgTable(
  "us_turnover_ratio_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    market: text("market").notNull().default("AMS"),
    code: text("code").notNull(),
    name: text("name").notNull().default(""),
    marketCap: doublePrecision("market_cap").notNull(),
    tradingValue: doublePrecision("trading_value").notNull(),
    turnoverRatio: doublePrecision("turnover_ratio").notNull(),
    price: doublePrecision("price"),
    open: doublePrecision("open"),
    high: doublePrecision("high"),
    low: doublePrecision("low"),
    changeRate: doublePrecision("change_rate"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    instrumentId: bigint("instrument_id", { mode: "number" }),
  },
  (table) => [uniqueIndex("us_turnover_ratio_snapshot_market_code_time").on(table.market, table.code, table.observedAt)]
);

export const usTurnoverRatioBlacklist = pgTable("us_turnover_ratio_blacklist", {
  ticker: text("ticker").primaryKey(),
  instrumentId: bigint("instrument_id", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const secAutomationEvents = pgTable("sec_automation_events", {
  externalId: text("external_id").primaryKey(),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull().default(0),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 3. 브라우저 웹 푸시 구독 엔티티
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    enabled: boolean("enabled").notNull().default(true),
    dartEnabled: boolean("dart_enabled").notNull().default(true),
    intensityEnabled: boolean("intensity_enabled").notNull().default(true),
    risingEnabled: boolean("rising_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 4. 텔레그램 알림 구독자 엔티티
export const telegramSubscribers = pgTable(
  "telegram_subscribers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    chatId: text("chat_id").notNull().unique(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 5. KIS OpenAPI 액세스 토큰 캐시 엔티티
export const kisTokens = pgTable(
  "kis_tokens",
  {
    id: integer("id").primaryKey(),
    accessToken: text("access_token").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("single_row_check", sql`id = 1`),
  ]
);

// 6. 실시간 KIS OpenAPI 데이터 캐시 엔티티 (Mock Data 배제용 장외 시간 실세션 종가 공유 캐시)
export const kisCache = pgTable(
  "kis_cache",
  {
    key: text("key").primaryKey(),
    data: jsonb("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 8. 관리자 KIS 요청 설정 저장소
export const kisApiConfigs = pgTable(
  "kis_api_configs",
  {
    key: text("key").primaryKey(),
    config: jsonb("config").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 9. 미국 상승률 TOP N 설정
export const usTopRisingConfig = pgTable(
  "us_top_rising_config",
  {
    key: text("key").primaryKey(),
    topN: integer("top_n").notNull().default(10),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 13. 상승률 상위 TOP 10 실시간 데이터 엔티티 (비교 및 갱신용)
export const topRisingStocks = pgTable(
  "top_rising_stocks",
  {
    code: text("code").primaryKey(),
    company: text("company").notNull(),
    changeRate: text("change_rate").notNull(),
    price: text("price").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    instrumentId: bigint("instrument_id", { mode: "number" }),
  }
);

// 14. 체결강도 상위 TOP 10 실시간 데이터 엔티티 (비교 및 갱신용)
export const topIntensityStocks = pgTable(
  "top_intensity_stocks",
  {
    code: text("code").primaryKey(),
    company: text("company").notNull(),
    intensity: integer("intensity").notNull(),
    price: text("price").notNull(),
    changeRate: text("change_rate").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    instrumentId: bigint("instrument_id", { mode: "number" }),
  }
);
// 15. 미국 주식 체결강도 상위 TOP 10 실시간 데이터 엔티티 (비교 및 갱신용)
export const usIntensityStocks = pgTable(
  "us_intensity_stocks",
  {
    code: text("code").primaryKey(),
    company: text("company").notNull(),
    intensity: integer("intensity").notNull(),
    price: text("price").notNull(),
    changeRate: text("change_rate").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    instrumentId: bigint("instrument_id", { mode: "number" }),
  }
);

/** Canonical instrument membership for the turnover-trend watchlist. */
export const usTurnoverWatchlist = pgTable("us_turnover_watchlist", {
  instrumentId: bigint("instrument_id", { mode: "number" }).primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usTurnoverWatchlistAlertState = pgTable("us_turnover_watchlist_alert_state", {
  instrumentId: bigint("instrument_id", { mode: "number" }).primaryKey(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  lastFingerprint: text("last_fingerprint"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const marketRssArticles = pgTable(
  "market_rss_articles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    rawPayload: text("raw_payload"),
    sourceSnapshotId: bigint("source_snapshot_id", { mode: "number" }),
    detectedTicker: text("detected_ticker"),
    eventDirection: text("event_direction").notNull().default("NEUTRAL"),
    matchedTerms: text("matched_terms").array().notNull().default(sql`'{}'::text[]`),
    financingAmountUsd: doublePrecision("financing_amount_usd"),
    dilutionRisk: text("dilution_risk"),
    link: text("link").notNull().default(""),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    translatedTitle: text("translated_title"),
    translatedSummary: text("translated_summary"),
    category: text("category").notNull().default("GENERAL"),
    priority: integer("priority").notNull().default(20),
    notifyEligible: boolean("notify_eligible").notNull().default(true),
    isBacklog: boolean("is_backlog").notNull().default(false),
    translationStatus: text("translation_status").notNull().default("PENDING"),
    translationFallback: boolean("translation_fallback").notNull().default(false),
    translationAttempts: integer("translation_attempts").notNull().default(0),
    translationError: text("translation_error"),
    notificationStatus: text("notification_status").notNull().default("PENDING"),
    notificationAttempts: integer("notification_attempts").notNull().default(0),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("market_rss_articles_source_external_unique").on(table.source, table.externalId),
    index("market_rss_articles_notification_idx").on(table.notificationStatus, table.createdAt),
  ],
);

/** Content-addressed archive of the exact RSS response returned by a source. */
export const marketRssFetchSnapshots = pgTable(
  "market_rss_fetch_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    url: text("url").notNull(),
    status: integer("status").notNull(),
    responseHeaders: jsonb("response_headers").notNull().default({}),
    rawPayload: text("raw_payload").notNull(),
    contentHash: text("content_hash").notNull(),
    itemCount: integer("item_count").notNull().default(0),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("market_rss_fetch_source_hash_unique").on(table.source, table.contentHash), index("market_rss_fetch_fetched_idx").on(table.source, table.fetchedAt)],
);

export const usTradeIntensityTicks = pgTable(
  "us_trade_intensity_ticks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    market: text("market").notNull(),
    code: text("code").notNull(),
    tradeTime: text("trade_time").notNull(),
    price: doublePrecision("price"),
    changeRate: doublePrecision("change_rate"),
    volume: doublePrecision("volume"),
    totalVolume: doublePrecision("total_volume"),
    instrumentId: bigint("instrument_id", { mode: "number" }),
    marketType: text("market_type"),
    bid: doublePrecision("bid"),
    ask: doublePrecision("ask"),
    intensity: doublePrecision("intensity"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("us_trade_intensity_ticks_identity_unique").on(table.market, table.code, table.tradeTime, table.price, table.volume, table.totalVolume),
    index("us_trade_intensity_ticks_code_time_idx").on(table.market, table.code, table.fetchedAt),
  ],
);

export const usFreeFloatSnapshots = pgTable("us_free_float_snapshots", {
  ticker: text("ticker").primaryKey(),
  floatShares: doublePrecision("float_shares"),
  outstandingShares: doublePrecision("outstanding_shares"),
  freeFloatPercent: doublePrecision("free_float_percent"),
  asOf: text("as_of"),
  source: text("source").notNull().default("FMP"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  instrumentId: bigint("instrument_id", { mode: "number" }),
});

export const usFreeFloatDiagnostics = pgTable("us_free_float_diagnostics", {
  ticker: text("ticker").primaryKey(),
  market: text("market"),
  failureReason: text("failure_reason"),
  fmpStatus: integer("fmp_status"),
  fmpError: text("fmp_error"),
  fmpResponse: jsonb("fmp_response"),
  secStatus: integer("sec_status"),
  secError: text("sec_error"),
  secResponse: jsonb("sec_response"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usFreeFloatRefreshHistory = pgTable("us_free_float_refresh_history", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ticker: text("ticker").notNull(),
  market: text("market"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  source: text("source"),
  failureReason: text("failure_reason"),
  fmpStatus: integer("fmp_status"),
  secStatus: integer("sec_status"),
  saved: boolean("saved").notNull().default(false),
});

export const usInstruments = pgTable("us_instruments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  market: text("market").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull().default(""),
  instrumentType: text("instrument_type").notNull().default("COMMON_STOCK"),
  isEtf: boolean("is_etf").notNull().default(false),
  isLeveraged: boolean("is_leveraged").notNull().default(false),
  isInverse: boolean("is_inverse").notNull().default(false),
  isDerivativeProduct: boolean("is_derivative_product").notNull().default(false),
  classificationSource: text("classification_source").notNull().default("UNCLASSIFIED"),
  classificationConfidence: doublePrecision("classification_confidence"),
  manualProductAction: text("manual_product_action"),
  productStatus: text("product_status").notNull().default("ACTIVE"),
  classificationCheckedAt: timestamp("classification_checked_at", { withTimezone: true }),
  classificationReason: text("classification_reason"),
  exchange: text("exchange").notNull().default(""),
  currency: text("currency").notNull().default("USD"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("us_instruments_market_code_unique").on(table.market, table.code)]);

export const usDailyPriceCandles = pgTable("us_daily_price_candles", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  market: text("market").notNull(),
  code: text("code").notNull(),
  timeframe: text("timeframe").notNull().default("D"),
  candleDate: text("candle_date").notNull(),
  open: doublePrecision("open").notNull(),
  high: doublePrecision("high").notNull(),
  low: doublePrecision("low").notNull(),
  close: doublePrecision("close").notNull(),
  volume: doublePrecision("volume").notNull().default(0),
  source: text("source").notNull().default("KIS"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("us_daily_price_candles_market_code_date_unique").on(table.market, table.code, table.timeframe, table.candleDate), index("us_daily_price_candles_lookup_idx").on(table.market, table.code, table.timeframe, table.candleDate)]);

export const krInstruments = pgTable("kr_instruments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  market: text("market").notNull().default("KRX"),
  code: text("code").notNull(),
  name: text("name").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  source: text("source").notNull().default("KIS"),
  productStatus: text("product_status").notNull().default("ACTIVE"),
  classificationReason: text("classification_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("kr_instruments_market_code_unique").on(table.market, table.code), index("kr_instruments_enabled_code_idx").on(table.enabled, table.code)]);

export const krDailyPriceCandles = pgTable("kr_daily_price_candles", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  market: text("market").notNull().default("KRX"),
  code: text("code").notNull(),
  timeframe: text("timeframe").notNull().default("D"),
  candleDate: text("candle_date").notNull(),
  open: doublePrecision("open").notNull(),
  high: doublePrecision("high").notNull(),
  low: doublePrecision("low").notNull(),
  close: doublePrecision("close").notNull(),
  volume: doublePrecision("volume").notNull(),
  source: text("source").notNull().default("KIS"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("kr_daily_price_candles_market_code_date_unique").on(table.market, table.code, table.timeframe, table.candleDate), index("kr_daily_price_candles_lookup_idx").on(table.market, table.code, table.timeframe, table.candleDate)]);

export const krMarketSnapshots = pgTable("kr_market_snapshots", {
  id: bigserial("id", { mode: "number" }).primaryKey(), market: text("market").notNull().default("KRX"), code: text("code").notNull(), price: doublePrecision("price"), volume: doublePrecision("volume"), tradingValue: doublePrecision("trading_value"), marketCap: doublePrecision("market_cap"), turnoverRatio: doublePrecision("turnover_ratio"), changeRate: doublePrecision("change_rate"), rawPayload: text("raw_payload"), observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("kr_market_snapshots_market_code_unique").on(table.market, table.code), index("kr_market_snapshots_observed_idx").on(table.observedAt)]);

export const usShortInterestSnapshots = pgTable("us_short_interest_snapshots", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ticker: text("ticker").notNull(),
  instrumentId: bigint("instrument_id", { mode: "number" }),
  shortVolume: doublePrecision("short_volume"),
  totalVolume: doublePrecision("total_volume"),
  shortVolumeRatio: doublePrecision("short_volume_ratio"),
  shortInterest: doublePrecision("short_interest"),
  daysToCover: doublePrecision("days_to_cover"),
  previousShortInterest: doublePrecision("previous_short_interest"),
  shortInterestChange: doublePrecision("short_interest_change"),
  shortInterestChangePercent: doublePrecision("short_interest_change_percent"),
  averageDailyVolume: doublePrecision("average_daily_volume"),
  thresholdListed: boolean("threshold_listed"),
  thresholdAsOf: text("threshold_as_of"),
  asOf: text("as_of"),
  shortVolumeAsOf: text("short_volume_as_of"),
  shortInterestAsOf: text("short_interest_as_of"),
  source: text("source").notNull(),
  status: text("status").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("us_short_interest_ticker_source_asof_unique").on(table.ticker, table.source, table.asOf), index("us_short_interest_ticker_fetched_idx").on(table.ticker, table.fetchedAt)]);

export const usTurnoverRatioSnapshotAttempts = pgTable(
  "us_turnover_ratio_snapshot_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    market: text("market").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull().default(""),
    instrumentType: text("instrument_type").notNull().default("COMMON_STOCK"),
    rawPrice: text("raw_price"),
    rawRate: text("raw_rate"),
    snapshotStatus: text("snapshot_status").notNull(),
    marketCap: doublePrecision("market_cap"),
    tradingValue: doublePrecision("trading_value"),
    turnoverRatio: doublePrecision("turnover_ratio"),
    errorMessage: text("error_message"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    instrumentId: bigint("instrument_id", { mode: "number" }),
  },
  (table) => [index("us_turnover_ratio_attempt_market_code_time").on(table.market, table.code, table.observedAt)],
);

export const shortBorrowSnapshots = pgTable(
  "short_borrow_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    symbol: text("symbol").notNull(),
    instrumentId: bigint("instrument_id", { mode: "number" }),
    tradable: boolean("tradable").notNull(),
    shortable: boolean("shortable").notNull(),
    borrowStatus: text("borrow_status").notNull(),
    quoteStatus: text("quote_status").notNull(),
    availableQty: integer("available_qty"),
    locatePricePerShare: doublePrecision("locate_price_per_share"),
    currentPrice: doublePrecision("current_price"),
    locateFeeRatePercent: doublePrecision("locate_fee_rate_percent"),
    pressureScore: integer("pressure_score").notNull(),
    pressureLevel: text("pressure_level").notNull(),
    quotedAt: timestamp("quoted_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull().default("ALPACA"),
    scope: text("scope").notNull().default("ALPACA_ACCOUNT_SPECIFIC"),
  },
  (table) => [
    uniqueIndex("short_borrow_snapshots_symbol_fetched_idx").on(table.symbol, table.fetchedAt),
    index("short_borrow_snapshots_pressure_idx").on(table.pressureLevel, table.fetchedAt),
  ],
);

/** 공매도·대차 원천을 공통 조회할 수 있는 정규화 스냅샷. */
export const usShortMetrics = pgTable(
  "us_short_metrics",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    instrumentId: bigint("instrument_id", { mode: "number" }),
    ticker: text("ticker").notNull(),
    metricType: text("metric_type").notNull(),
    source: text("source").notNull(),
    accountScope: text("account_scope").notNull().default("MARKET"),
    status: text("status").notNull(),
    asOf: text("as_of"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    shortVolume: doublePrecision("short_volume"),
    totalVolume: doublePrecision("total_volume"),
    shortVolumeRatio: doublePrecision("short_volume_ratio"),
    shortInterest: doublePrecision("short_interest"),
    daysToCover: doublePrecision("days_to_cover"),
    availableQty: integer("available_qty"),
    locateFeeRatePercent: doublePrecision("locate_fee_rate_percent"),
    pressureScore: integer("pressure_score"),
    pressureLevel: text("pressure_level"),
    rawPayload: jsonb("raw_payload").notNull().default({}),
  },
  (table) => [
    index("us_short_metrics_instrument_observed_idx").on(table.instrumentId, table.observedAt),
    index("us_short_metrics_type_observed_idx").on(table.metricType, table.observedAt),
  ],
);

export const featureModuleSettings = pgTable("feature_module_settings", {
  moduleKey: text("module_key").primaryKey(),
  settings: jsonb("settings").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const krInstrumentUniverse = pgTable("kr_instrument_universe", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  market: text("market").notNull(), code: text("code").notNull(), standardCode: text("standard_code").notNull().default(""), name: text("name").notNull().default(""), instrumentType: text("instrument_type").notNull().default("UNKNOWN"), securityGroupCode: text("security_group_code").notNull().default(""), marketCapScale: text("market_cap_scale").notNull().default(""), industryLargeCode: text("industry_large_code").notNull().default(""), industryMediumCode: text("industry_medium_code").notNull().default(""), industrySmallCode: text("industry_small_code").notNull().default(""), enabled: boolean("enabled").notNull().default(true), isEtp: boolean("is_etp").notNull().default(false), isWarrant: boolean("is_warrant").notNull().default(false), isPreferred: boolean("is_preferred").notNull().default(false), isSuspended: boolean("is_suspended").notNull().default(false), sourceFile: text("source_file").notNull(), rawPayload: text("raw_payload").notNull().default(""), firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(), lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(), missingRuns: integer("missing_runs").notNull().default(0), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("kr_instrument_universe_market_code_unique").on(table.market, table.code), index("kr_instrument_universe_enabled_idx").on(table.enabled, table.market, table.code)]);

export const usInstrumentUniverse = pgTable("us_instrument_universe", {
  id: bigserial("id", { mode: "number" }).primaryKey(), market: text("market").notNull(), code: text("code").notNull(), realtimeSymbol: text("realtime_symbol").notNull().default(""), name: text("name").notNull().default(""), englishName: text("english_name").notNull().default(""), instrumentType: text("instrument_type").notNull().default("UNKNOWN"), securityType: text("security_type").notNull().default(""), etpType: text("etp_type").notNull().default(""), currency: text("currency").notNull().default(""), countryCode: text("country_code").notNull().default(""), industryCode: text("industry_code").notNull().default(""), isEtf: boolean("is_etf").notNull().default(false), isLeveraged: boolean("is_leveraged").notNull().default(false), isInverse: boolean("is_inverse").notNull().default(false), isWarrant: boolean("is_warrant").notNull().default(false), isDerivative: boolean("is_derivative").notNull().default(false), isDr: boolean("is_dr").notNull().default(false), enabled: boolean("enabled").notNull().default(true), sourceFile: text("source_file").notNull(), rawPayload: text("raw_payload").notNull().default(""), firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(), lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(), missingRuns: integer("missing_runs").notNull().default(0), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("us_instrument_universe_market_code_unique").on(table.market, table.code), index("us_instrument_universe_enabled_idx").on(table.enabled, table.market, table.code)]);

export const instrumentUniverseSyncRuns = pgTable("instrument_universe_sync_runs", { id: bigserial("id", { mode: "number" }).primaryKey(), scope: text("scope").notNull(), sourceDirectory: text("source_directory").notNull(), status: text("status").notNull(), sourceCount: integer("source_count").notNull().default(0), insertedCount: integer("inserted_count").notNull().default(0), updatedCount: integer("updated_count").notNull().default(0), deactivatedCount: integer("deactivated_count").notNull().default(0), excludedCount: integer("excluded_count").notNull().default(0), errorCount: integer("error_count").notNull().default(0), errorSummary: text("error_summary"), startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(), completedAt: timestamp("completed_at", { withTimezone: true }) });

export const usPriceDetailCache = pgTable("us_price_detail_cache", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  market: text("market").notNull(),
  code: text("code").notNull(),
  status: integer("status").notNull(),
  parsed: jsonb("parsed").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("us_price_detail_cache_market_code_unique").on(table.market, table.code), index("us_price_detail_cache_fetched_idx").on(table.fetchedAt)]);

export const usNewsTickerExchangeCache = pgTable("us_news_ticker_exchange_cache", {
  ticker: text("ticker").primaryKey(),
  market: text("market").notNull(),
  instrumentId: bigint("instrument_id", { mode: "number" }),
  validatedAt: timestamp("validated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usNewsRadarEvents = pgTable("us_news_radar_events", {
  externalId: text("external_id").primaryKey(),
  ticker: text("ticker").notNull(),
  market: text("market"),
  instrumentId: bigint("instrument_id", { mode: "number" }),
  title: text("title").notNull(),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usBreakingNewsDiscordDeliveries = pgTable("us_breaking_news_discord_delivery", {
  externalId: text("external_id").primaryKey(),
  title: text("title").notNull(),
  source: text("source"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRuns = pgTable("automation_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  moduleKey: text("module_key").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  summary: jsonb("summary").notNull().default({}),
  errorMessage: text("error_message"),
});

export const automationNotificationDeliveries = pgTable("automation_notification_deliveries", {
  moduleKey: text("module_key").notNull(), deliveryDate: text("delivery_date").notNull(), status: text("status").notNull().default("PENDING"), attempts: integer("attempts").notNull().default(0), sentAt: timestamp("sent_at", { withTimezone: true }), lastError: text("last_error"), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("automation_notification_deliveries_pk").on(table.moduleKey, table.deliveryDate)]);

export const discordDeliveryQueue = pgTable("discord_delivery_queue", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  externalId: text("external_id").notNull().unique(),
  channelKey: text("channel_key").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const secCompanies = pgTable("sec_companies", {
  cik: text("cik").primaryKey(), name: text("name").notNull(), tickers: text("tickers").array().notNull().default(sql`'{}'::text[]`), exchanges: text("exchanges").array().notNull().default(sql`'{}'::text[]`), sic: text("sic"), sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const secSubmissions = pgTable("sec_submissions", {
  accession: text("accession").primaryKey(), cik: text("cik").notNull(), form: text("form").notNull(), filingDate: date("filing_date").notNull(), reportDate: date("report_date"), primaryDocument: text("primary_document").notNull().default(""), primaryDocDescription: text("primary_doc_description"), items: text("items"), acceptanceDateTime: text("acceptance_datetime"), filingUrl: text("filing_url").notNull(), rawPayload: jsonb("raw_payload").notNull().default({}), classifiedCategory: text("classified_category"), classifiedDirection: text("classified_direction"), classifiedScore: integer("classified_score"), matchedTerms: text("matched_terms").array().notNull().default(sql`'{}'::text[]`), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sec_submissions_cik_filing_idx").on(table.cik, table.filingDate), index("sec_submissions_form_date_idx").on(table.form, table.filingDate)]);

/** Content-addressed archive for full SEC JSON responses (submissions/facts). */
export const secSourceSnapshots = pgTable("sec_source_snapshots", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceKey: text("source_key").notNull(),
  url: text("url").notNull(),
  status: integer("status").notNull(),
  responseHeaders: jsonb("response_headers").notNull().default({}),
  rawPayload: text("raw_payload").notNull(),
  contentHash: text("content_hash").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("sec_source_snapshot_key_hash_unique").on(table.sourceType, table.sourceKey, table.contentHash), index("sec_source_snapshot_fetched_idx").on(table.sourceType, table.fetchedAt)]);

export const secFilingEvents = pgTable("sec_filing_events", {
  accession: text("accession").primaryKey(), cik: text("cik").notNull(), category: text("category").notNull(), direction: text("direction").notNull(), score: integer("score").notNull(), matchedTerms: text("matched_terms").array().notNull().default(sql`'{}'::text[]`), bodyExcerpt: text("body_excerpt").notNull().default(""), financingAmountUsd: doublePrecision("financing_amount_usd"), dilutionRisk: text("dilution_risk"), insiderAction: text("insider_action"), discordStatus: text("discord_status").notNull().default("PENDING"), discordSentAt: timestamp("discord_sent_at", { withTimezone: true }), lastError: text("last_error"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Full SEC index/primary document captured for later AI analysis. */
export const secFilingDocuments = pgTable("sec_filing_documents", {
  accession: text("accession").primaryKey(),
  cik: text("cik").notNull(),
  form: text("form").notNull(),
  indexUrl: text("index_url").notNull(),
  primaryUrl: text("primary_url").notNull(),
  indexHtml: text("index_html").notNull().default(""),
  primaryHtml: text("primary_html").notNull().default(""),
  primaryText: text("primary_text").notNull().default(""),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const secXbrlSnapshots = pgTable("sec_xbrl_snapshots", {
  cik: text("cik").primaryKey(), payload: jsonb("payload").notNull(), fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});
