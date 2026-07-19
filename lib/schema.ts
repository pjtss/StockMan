import { pgTable, bigserial, text, timestamp, date, boolean, integer, uniqueIndex, check, jsonb, doublePrecision } from "drizzle-orm/pg-core";
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

export const automationRuns = pgTable("automation_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  key: text("key").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  matchedCount: integer("matched_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  error: text("error"),
});

export const discordDeliveryQueue = pgTable("discord_delivery_queue", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  source: text("source").notNull(),
  webhookUrl: text("webhook_url").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

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
    changeRate: doublePrecision("change_rate").notNull().default(0),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("us_turnover_ratio_snapshot_market_code_time").on(table.market, table.code, table.observedAt)]
);

export const usTurnoverRatioBlacklist = pgTable("us_turnover_ratio_blacklist", {
  ticker: text("ticker").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usTurnoverRatioWatches = pgTable("us_turnover_ratio_watches", {
  ticker: text("ticker").primaryKey(),
  threshold: doublePrecision("threshold").notNull(),
  lastMarket: text("last_market"),
  lastRatio: doublePrecision("last_ratio"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastAlertedAt: timestamp("last_alerted_at", { withTimezone: true }),
  lastError: text("last_error"),
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
