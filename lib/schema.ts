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
  },
  (table) => [uniqueIndex("us_turnover_ratio_snapshot_market_code_time").on(table.market, table.code, table.observedAt)]
);

export const usTurnoverRatioBlacklist = pgTable("us_turnover_ratio_blacklist", {
  ticker: text("ticker").primaryKey(),
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

// 7. 관리자 기능 플래그 저장소
export const featureFlags = pgTable(
  "feature_flags",
  {
    key: text("key").primaryKey(),
    enabled: boolean("enabled").notNull().default(true),
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

// 10. 스캐너 시간대 설정 저장소
export const scannerSchedules = pgTable(
  "scanner_schedules",
  {
    key: text("key").primaryKey(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 11. 스캐너 시간 변경 이력
export const scannerScheduleHistory = pgTable(
  "scanner_schedule_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    key: text("key").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 12. 해외주식 거래대금 추이 종목 목록
export const usTurnoverSymbols = pgTable(
  "us_turnover_symbols",
  {
    key: text("key").primaryKey(),
    symbols: jsonb("symbols").notNull(),
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
  }
);

export const marketRssArticles = pgTable(
  "market_rss_articles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
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
  floatShares: doublePrecision("float_shares").notNull(),
  outstandingShares: doublePrecision("outstanding_shares"),
  freeFloatPercent: doublePrecision("free_float_percent"),
  asOf: text("as_of"),
  source: text("source").notNull().default("FMP"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  instrumentId: bigint("instrument_id", { mode: "number" }),
});

export const usDailyBreakoutWatchlist = pgTable(
  "us_daily_breakout_watchlist",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    market: text("market").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull().default(""),
    source: text("source").notNull().default("MANUAL"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    instrumentId: bigint("instrument_id", { mode: "number" }),
  },
  (table) => [uniqueIndex("us_daily_breakout_watchlist_market_code_unique").on(table.market, table.code)]
);

export const usInstruments = pgTable("us_instruments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  market: text("market").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull().default(""),
  exchange: text("exchange").notNull().default(""),
  currency: text("currency").notNull().default("USD"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("us_instruments_market_code_unique").on(table.market, table.code)]);

export const usShortInterestSnapshots = pgTable("us_short_interest_snapshots", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ticker: text("ticker").notNull(),
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

export const featureModuleSettings = pgTable("feature_module_settings", {
  moduleKey: text("module_key").primaryKey(),
  settings: jsonb("settings").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usNewsTickerExchangeCache = pgTable("us_news_ticker_exchange_cache", {
  ticker: text("ticker").primaryKey(),
  market: text("market").notNull(),
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
