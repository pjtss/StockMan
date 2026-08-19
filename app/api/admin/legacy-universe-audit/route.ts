import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-auth";

const LEGACY_TABLES = [
  "kr_instruments", "us_instruments", "kr_daily_price_candles", "us_daily_price_candles",
  "kr_market_snapshots", "us_turnover_symbols", "top_rising_stocks", "top_intensity_stocks",
  "us_daily_breakout_watchlist", "us_turnover_watchlist", "us_turnover_watchlist_alert_state",
  "us_turnover_ratio_snapshots", "us_turnover_ratio_snapshot_attempts", "us_turnover_ratio_blacklist",
  "us_trade_intensity_ticks", "us_intraday_vwap_snapshots", "us_intraday_vwap_alerts",
  "us_free_float_snapshots", "us_free_float_diagnostics", "us_free_float_refresh_history",
  "us_news_ticker_exchange_cache", "us_news_radar_events", "us_short_metrics",
  "us_short_interest_snapshots", "short_borrow_snapshots",
] as const;

export async function GET() {
  const startedAt = Date.now();
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const db = getDb();
    const tableNames = LEGACY_TABLES as readonly string[];
    const tableRows = await db.execute(sql`SELECT t.table_name, EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema = 'public' AND x.table_name = t.table_name) AS exists, CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema = 'public' AND x.table_name = t.table_name) THEN (SELECT c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = t.table_name) ELSE 0 END AS estimated_rows FROM unnest(${tableNames}::text[]) AS t(table_name)`);
    const fkRows = await db.execute(sql`SELECT tc.table_name, kcu.column_name, ccu.table_name AS referenced_table, ccu.column_name AS referenced_column, tc.constraint_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_schema = 'public' AND ccu.table_name = ANY(${tableNames}) ORDER BY tc.table_name, tc.constraint_name`);
    const references = fkRows.rows;
    const existingTables = tableRows.rows.filter((row) => row.exists === true || row.exists === "t");
    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, legacyTables: tableRows.rows, foreignKeys: references, safeToDrop: existingTables.length === 0 && references.length === 0, criteria: { legacyTables: [...LEGACY_TABLES], requiresZeroExistingTables: true, requiresZeroForeignKeys: true, note: "V70 DROP CASCADE 적용 후 레거시 테이블과 외래키가 모두 0인지 확인합니다." } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt }, { status: 500 });
  }
}
