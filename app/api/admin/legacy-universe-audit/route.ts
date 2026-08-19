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
const ACTIVE_TABLES = [
  "kr_instrument_universe", "us_instrument_universe",
  "kr_instrument_universe_candles", "us_instrument_universe_candles",
  "instrument_universe_sync_runs", "instrument_candle_cache_failures",
] as const;

export async function GET() {
  const startedAt = Date.now();
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const db = getDb();
    const tableNames = LEGACY_TABLES as readonly string[];
    // Names come exclusively from the fixed constants above; use a SQL array
    // literal because binding a JS array produces a tuple, not a PostgreSQL array.
    const pgArray = (names: readonly string[]) => sql.raw(`ARRAY[${names.map((name) => `'${name}'`).join(",")}]::text[]`);
    const legacyArray = pgArray(tableNames);
    const tableRows = await db.execute(sql`SELECT t.table_name, EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema = 'public' AND x.table_name = t.table_name) AS exists, CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema = 'public' AND x.table_name = t.table_name) THEN (SELECT c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = t.table_name) ELSE 0 END AS estimated_rows FROM unnest(${legacyArray}) AS t(table_name)`);
    const fkRows = await db.execute(sql`SELECT tc.table_name, kcu.column_name, ccu.table_name AS referenced_table, ccu.column_name AS referenced_column, tc.constraint_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_schema = 'public' AND ccu.table_name = ANY(${legacyArray}) ORDER BY tc.table_name, tc.constraint_name`);
    const references = fkRows.rows;
    const existingTables = tableRows.rows.filter((row) => row.exists === true || row.exists === "t");
    const activeNames = ACTIVE_TABLES as readonly string[];
    const activeArray = pgArray(activeNames);
    const activeRows = await db.execute(sql`SELECT t.table_name, EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema = 'public' AND x.table_name = t.table_name) AS exists, CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema = 'public' AND x.table_name = t.table_name) THEN (SELECT c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = t.table_name) ELSE 0 END AS estimated_rows FROM unnest(${activeArray}) AS t(table_name)`);
    const flywayRows = await db.execute(sql`SELECT version, description, installed_on FROM flyway_schema_history WHERE success = true ORDER BY installed_rank DESC LIMIT 1`);
    const candleCounts = await db.execute(sql`SELECT 'US' AS scope, timeframe, COUNT(*)::bigint AS rows, COUNT(DISTINCT market || ':' || code)::bigint AS instruments FROM us_instrument_universe_candles GROUP BY timeframe UNION ALL SELECT 'KR' AS scope, timeframe, COUNT(*)::bigint AS rows, COUNT(DISTINCT market || ':' || code)::bigint AS instruments FROM kr_instrument_universe_candles GROUP BY timeframe ORDER BY scope, timeframe`);
    const syncRuns = await db.execute(sql`SELECT id, scope, status, source_count, inserted_count, updated_count, deactivated_count, excluded_count, error_count, started_at, completed_at FROM instrument_universe_sync_runs ORDER BY started_at DESC LIMIT 10`);
    const featureSettings = await db.execute(sql`SELECT module_key, settings, updated_at FROM feature_module_settings ORDER BY module_key`);
    const activeExisting = activeRows.rows.filter((row) => row.exists === true || row.exists === "t");
    const checks = {
      legacyTablesRemoved: existingTables.length === 0,
      noLegacyForeignKeys: references.length === 0,
      activeTablesPresent: activeExisting.length === ACTIVE_TABLES.length,
      flywayAvailable: flywayRows.rows.length > 0,
      v70Applied: flywayRows.rows.some((row) => String(row.version) === "70"),
    };
    return NextResponse.json({ ok: Object.values(checks).every(Boolean), oneTime: true, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, checks, flyway: flywayRows.rows[0] ?? null, legacyTables: tableRows.rows, foreignKeys: references, activeTables: activeRows.rows, candleCounts: candleCounts.rows, latestSyncRuns: syncRuns.rows, featureSettings: featureSettings.rows, safeToDrop: checks.legacyTablesRemoved && checks.noLegacyForeignKeys, criteria: { legacyTables: [...LEGACY_TABLES], activeTables: [...ACTIVE_TABLES], requiredTimeframes: ["D", "W", "M"], requiresZeroExistingTables: true, requiresZeroForeignKeys: true, requiredFlywayVersion: "70" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt }, { status: 500 });
  }
}
