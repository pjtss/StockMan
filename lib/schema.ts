import { pgTable, bigserial, bigint, text, timestamp, date, boolean, integer, uniqueIndex, index, check, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 1. DART ë° SEC ê³µì ì´ë ¥ ìí°í°
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

// 2. ìë¦¼ ë°ì¡ ìë£ ì´ë²¤í¸ ìí°í° (ì¤ë³µ ë°©ì§ì©)
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


// 3. ë¸ë¼ì°ì  ì¹ í¸ì êµ¬ë ìí°í°
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

// 4. íë ê·¸ë¨ ìë¦¼ êµ¬ëì ìí°í°
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

// 5. KIS OpenAPI ì¡ì¸ì¤ í í° ìºì ìí°í°
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

// 6. ì¤ìê° KIS OpenAPI ë°ì´í° ìºì ìí°í° (Mock Data ë°°ì ì© ì¥ì¸ ìê° ì¤ì¸ì ì¢ê° ê³µì  ìºì)
export const kisCache = pgTable(
  "kis_cache",
  {
    key: text("key").primaryKey(),
    data: jsonb("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 8. ê´ë¦¬ì KIS ìì²­ ì¤ì  ì ì¥ì
export const kisApiConfigs = pgTable(
  "kis_api_configs",
  {
    key: text("key").primaryKey(),
    config: jsonb("config").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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

export const featureModuleSettings = pgTable("feature_module_settings", {
  moduleKey: text("module_key").primaryKey(),
  settings: jsonb("settings").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usInstrumentUniverseCandles = pgTable("us_instrument_universe_candles", {
  id: bigserial("id", { mode: "number" }).primaryKey(), market: text("market").notNull(), code: text("code").notNull(), timeframe: text("timeframe").notNull().default("D"), candleDate: text("candle_date").notNull(), candleTime: timestamp("candle_time", { withTimezone: true }), open: doublePrecision("open"), high: doublePrecision("high"), low: doublePrecision("low"), close: doublePrecision("close"), volume: doublePrecision("volume"), source: text("source").notNull().default("KIS"), fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("us_instrument_universe_candles_unique").on(table.market, table.code, table.timeframe, table.candleDate), index("us_instrument_universe_candles_lookup_idx").on(table.market, table.code, table.timeframe, table.candleDate)]);

export const krInstrumentUniverseCandles = pgTable("kr_instrument_universe_candles", {
  id: bigserial("id", { mode: "number" }).primaryKey(), market: text("market").notNull(), code: text("code").notNull(), timeframe: text("timeframe").notNull().default("D"), candleDate: text("candle_date").notNull(), candleTime: timestamp("candle_time", { withTimezone: true }), open: doublePrecision("open"), high: doublePrecision("high"), low: doublePrecision("low"), close: doublePrecision("close"), volume: doublePrecision("volume"), source: text("source").notNull().default("KIS"), fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("kr_instrument_universe_candles_unique").on(table.market, table.code, table.timeframe, table.candleDate), index("kr_instrument_universe_candles_lookup_idx").on(table.market, table.code, table.timeframe, table.candleDate)]);

export const krInstrumentUniverse = pgTable("kr_instrument_universe", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  market: text("market").notNull(), code: text("code").notNull(), standardCode: text("standard_code").notNull().default(""), name: text("name").notNull().default(""), instrumentType: text("instrument_type").notNull().default("UNKNOWN"), securityGroupCode: text("security_group_code").notNull().default(""), marketCapScale: text("market_cap_scale").notNull().default(""), industryLargeCode: text("industry_large_code").notNull().default(""), industryMediumCode: text("industry_medium_code").notNull().default(""), industrySmallCode: text("industry_small_code").notNull().default(""), etpProductClassCode: text("etp_product_class_code").notNull().default(""), preferredClassCode: text("preferred_class_code").notNull().default(""), tradingHaltCode: text("trading_halt_code").notNull().default(""), liquidationCode: text("liquidation_code").notNull().default(""), managedIssueCode: text("managed_issue_code").notNull().default(""), enabled: boolean("enabled").notNull().default(true), isEtp: boolean("is_etp").notNull().default(false), isWarrant: boolean("is_warrant").notNull().default(false), isPreferred: boolean("is_preferred").notNull().default(false), isSuspended: boolean("is_suspended").notNull().default(false), sourceFile: text("source_file").notNull(), rawPayload: text("raw_payload").notNull().default(""), firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(), lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(), missingRuns: integer("missing_runs").notNull().default(0), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("kr_instrument_universe_market_code_unique").on(table.market, table.code), index("kr_instrument_universe_enabled_idx").on(table.enabled, table.market, table.code)]);

export const usInstrumentUniverse = pgTable("us_instrument_universe", {
  id: bigserial("id", { mode: "number" }).primaryKey(), market: text("market").notNull(), code: text("code").notNull(), realtimeSymbol: text("realtime_symbol").notNull().default(""), name: text("name").notNull().default(""), englishName: text("english_name").notNull().default(""), instrumentType: text("instrument_type").notNull().default("UNKNOWN"), securityType: text("security_type").notNull().default(""), etpType: text("etp_type").notNull().default(""), currency: text("currency").notNull().default(""), countryCode: text("country_code").notNull().default(""), industryCode: text("industry_code").notNull().default(""), isEtf: boolean("is_etf").notNull().default(false), isLeveraged: boolean("is_leveraged").notNull().default(false), isInverse: boolean("is_inverse").notNull().default(false), isWarrant: boolean("is_warrant").notNull().default(false), isDerivative: boolean("is_derivative").notNull().default(false), isDr: boolean("is_dr").notNull().default(false), enabled: boolean("enabled").notNull().default(true), sourceFile: text("source_file").notNull(), rawPayload: text("raw_payload").notNull().default(""), firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(), lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(), missingRuns: integer("missing_runs").notNull().default(0), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("us_instrument_universe_market_code_unique").on(table.market, table.code), index("us_instrument_universe_enabled_idx").on(table.enabled, table.market, table.code)]);

export const instrumentUniverseSyncRuns = pgTable("instrument_universe_sync_runs", { id: bigserial("id", { mode: "number" }).primaryKey(), scope: text("scope").notNull(), sourceDirectory: text("source_directory").notNull(), status: text("status").notNull(), sourceCount: integer("source_count").notNull().default(0), insertedCount: integer("inserted_count").notNull().default(0), updatedCount: integer("updated_count").notNull().default(0), deactivatedCount: integer("deactivated_count").notNull().default(0), excludedCount: integer("excluded_count").notNull().default(0), errorCount: integer("error_count").notNull().default(0), errorSummary: text("error_summary"), startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(), completedAt: timestamp("completed_at", { withTimezone: true }) });
export const instrumentFundamentalSnapshots = pgTable("instrument_fundamental_snapshots", { id: bigserial("id", { mode: "number" }).primaryKey(), market: text("market").notNull(), code: text("code").notNull(), name: text("name").notNull().default(""), price: doublePrecision("price"), changeRate: doublePrecision("change_rate"), open: doublePrecision("open"), high: doublePrecision("high"), low: doublePrecision("low"), volume: doublePrecision("volume"), tradingValue: doublePrecision("trading_value"), marketCap: doublePrecision("market_cap"), sharesOutstanding: doublePrecision("shares_outstanding"), freeFloatShares: doublePrecision("free_float_shares"), freeFloatPercent: doublePrecision("free_float_percent"), currency: text("currency"), source: text("source").notNull(), rawPayload: text("raw_payload").notNull().default(""), observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(), fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow() }, (table) => [uniqueIndex("instrument_fundamental_snapshots_market_code_unique").on(table.market, table.code), index("instrument_fundamental_snapshots_fetched_idx").on(table.fetchedAt)]);

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

export const instrumentCandleCacheFailures = pgTable("instrument_candle_cache_failures", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  market: text("market").notNull(),
  code: text("code").notNull(),
  timeframe: text("timeframe").notNull(),
  error: text("error").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("instrument_candle_cache_failures_lookup_idx").on(table.market, table.code, table.timeframe, table.observedAt), index("instrument_candle_cache_failures_recent_idx").on(table.observedAt)]);

export const secCompanies = pgTable("sec_companies", {
  cik: text("cik").primaryKey(), name: text("name").notNull(), tickers: text("tickers").array().notNull().default(sql`'{}'::text[]`), exchanges: text("exchanges").array().notNull().default(sql`'{}'::text[]`), sic: text("sic"), sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const instrumentCandleCacheRetries = pgTable("instrument_candle_cache_retries", {
  id: bigserial("id", { mode: "number" }).primaryKey(), market: text("market").notNull(), code: text("code").notNull(), timeframe: text("timeframe").notNull(), status: text("status").notNull().default("PENDING"), attempts: integer("attempts").notNull().default(0), nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(), lastError: text("last_error"), lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }), succeededAt: timestamp("succeeded_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("instrument_candle_cache_retries_key").on(table.market, table.code, table.timeframe), index("instrument_candle_cache_retries_due_idx").on(table.status, table.nextAttemptAt)]);

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

export const dailyBollingerCacheRetries = pgTable("daily_bollinger_cache_retries", {
  id: bigserial("id", { mode: "number" }).primaryKey(), scope: text("scope").notNull(), zone: text("zone").notNull(), status: text("status").notNull().default("PENDING"), attempts: integer("attempts").notNull().default(0), nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(), lastError: text("last_error"), lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }), succeededAt: timestamp("succeeded_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("daily_bollinger_cache_retries_key").on(table.scope, table.zone), index("daily_bollinger_cache_retries_due_idx").on(table.status, table.nextAttemptAt)]);

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
