import { pgTable, bigserial, text, timestamp, date, boolean, integer, uniqueIndex, check } from "drizzle-orm/pg-core";
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
    secEnabled: boolean("sec_enabled").notNull().default(true),
    onlyValidated: boolean("only_validated").notNull().default(false),
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
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("single_row_check", sql`id = 1`),
  ]
);
