import { bigserial, boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const usIntradayVwapSnapshots = pgTable("us_intraday_vwap_snapshots", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  market: text("market").notNull(), code: text("code").notNull(), sessionDate: text("session_date").notNull(),
  vwap: doublePrecision("vwap"), currentPrice: doublePrecision("current_price"), totalVolume: doublePrecision("total_volume").notNull().default(0),
  totalTradeValue: doublePrecision("total_trade_value").notNull().default(0), pointCount: integer("point_count").notNull().default(0), complete: boolean("complete").notNull().default(false), diagnostics: jsonb("diagnostics").notNull().default({}), observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("us_intraday_vwap_market_code_date_unique").on(table.market, table.code, table.sessionDate), index("us_intraday_vwap_observed_idx").on(table.observedAt)]);
