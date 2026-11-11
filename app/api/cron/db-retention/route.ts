import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const DELETE_BATCH_SIZE = 5_000;
const MAX_BATCHES_PER_TABLE = 3;

type CleanupJob = { table: string; query: string };

/**
 * Use PostgreSQL's documented ctid batch-delete pattern only within each
 * statement. ctid is never retained or treated as a durable row identifier.
 */
function batchedDelete(table: string, predicate: string, orderBy: string): CleanupJob {
  return {
    table,
    query: `WITH expired AS (
      SELECT ctid FROM ${table}
      WHERE ${predicate}
      ORDER BY ${orderBy}
      FOR UPDATE SKIP LOCKED
      LIMIT ${DELETE_BATCH_SIZE}
    )
    DELETE FROM ${table} AS target
    USING expired
    WHERE target.ctid = expired.ctid`,
  };
}

const RETENTION_JOBS: CleanupJob[] = [
  batchedDelete("kr_minute_candles", "candle_date < to_char(NOW() - INTERVAL '30 days', 'YYYY-MM-DD')", "candle_date, candle_time"),
  batchedDelete("us_minute_candles", "candle_date < to_char(NOW() - INTERVAL '30 days', 'YYYY-MM-DD')", "candle_date, candle_time"),
  batchedDelete("request_logs", "created_at < NOW() - INTERVAL '30 days'", "created_at"),
  batchedDelete(
    "market_rss_bullish_articles",
    "published_at < NOW() - INTERVAL '7 days' OR (published_at IS NULL AND created_at < NOW() - INTERVAL '7 days') OR source_article_id IN (SELECT id FROM market_rss_articles WHERE published_at < NOW() - INTERVAL '7 days' OR (published_at IS NULL AND created_at < NOW() - INTERVAL '7 days'))",
    "published_at ASC NULLS FIRST, created_at ASC",
  ),
  batchedDelete(
    "market_rss_articles",
    "published_at < NOW() - INTERVAL '7 days' OR (published_at IS NULL AND created_at < NOW() - INTERVAL '7 days')",
    "published_at ASC NULLS FIRST, created_at ASC",
  ),
  {
    table: "market_rss_fetch_snapshots",
    query: `WITH expired AS (
      SELECT id FROM market_rss_fetch_snapshots
      WHERE fetched_at < NOW() - INTERVAL '180 days'
      ORDER BY fetched_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${DELETE_BATCH_SIZE}
    ), detached_articles AS (
      UPDATE market_rss_articles AS article SET source_snapshot_id = NULL
      FROM expired WHERE article.source_snapshot_id = expired.id
      RETURNING article.id
    ), deleted_snapshots AS (
      DELETE FROM market_rss_fetch_snapshots AS snapshot USING expired
      WHERE snapshot.id = expired.id
      RETURNING snapshot.id
    )
    SELECT (SELECT COUNT(*) FROM deleted_snapshots)::int AS deleted,
      (SELECT COUNT(*) FROM detached_articles)::int AS detached`,
  },
  {
    table: "sec_source_snapshots",
    query: `WITH expired AS (
      SELECT snapshot.id FROM sec_source_snapshots AS snapshot
      WHERE (
        snapshot.source_type = 'SUBMISSIONS'
        AND snapshot.fetched_at < NOW() - INTERVAL '365 days'
        AND EXISTS (
          SELECT 1 FROM sec_source_snapshots AS newer
          WHERE newer.source_type = snapshot.source_type
            AND newer.source_key = snapshot.source_key
            AND (newer.fetched_at, newer.id) > (snapshot.fetched_at, snapshot.id)
        )
      ) OR (
        snapshot.source_type <> 'SUBMISSIONS'
        AND snapshot.fetched_at < NOW() - INTERVAL '180 days'
      )
      ORDER BY snapshot.fetched_at
      FOR UPDATE OF snapshot SKIP LOCKED
      LIMIT ${DELETE_BATCH_SIZE}
    ), deleted_snapshots AS (
      DELETE FROM sec_source_snapshots AS snapshot USING expired
      WHERE snapshot.id = expired.id RETURNING snapshot.id
    )
    SELECT COUNT(*)::int AS deleted FROM deleted_snapshots`,
  },
  batchedDelete("discord_delivery_queue", "status IN ('SENT', 'FAILED', 'SKIPPED') AND updated_at < NOW() - INTERVAL '30 days'", "updated_at"),
  batchedDelete("kr_minute_fetch_logs", "fetched_at < NOW() - INTERVAL '14 days'", "fetched_at"),
  batchedDelete("debug_kis_calls", "observed_at < NOW() - INTERVAL '30 days'", "observed_at"),
  batchedDelete("debug_run_items", "completed_at < NOW() - INTERVAL '30 days'", "completed_at"),
  batchedDelete("automation_runs", "started_at < NOW() - INTERVAL '90 days'", "started_at"),
  batchedDelete("kis_realtime_events", "observed_at < NOW() - INTERVAL '7 days'", "observed_at"),
  batchedDelete("kis_signal_snapshots", "fetched_at < NOW() - INTERVAL '365 days'", "fetched_at"),
  batchedDelete("intraday_detection_transitions", "observed_at < NOW() - INTERVAL '7 days' OR tick_id IN (SELECT tick_id FROM intraday_detection_ticks WHERE observed_at < NOW() - INTERVAL '7 days')", "observed_at"),
  batchedDelete("intraday_detection_ticks", "observed_at < NOW() - INTERVAL '7 days'", "observed_at"),
  batchedDelete("intraday_detection_runs", "finished_at IS NOT NULL AND finished_at < NOW() - INTERVAL '7 days' AND NOT EXISTS (SELECT 1 FROM intraday_detection_ticks AS tick WHERE tick.run_id = intraday_detection_runs.run_id)", "finished_at"),
  batchedDelete("us_trade_intensity_ticks", "fetched_at < NOW() - INTERVAL '7 days'", "fetched_at"),
  batchedDelete("instrument_fundamental_history", "fetched_at < NOW() - INTERVAL '90 days'", "fetched_at"),
  batchedDelete("kis_rate_limit_events", "occurred_at < NOW() - INTERVAL '90 days'", "occurred_at"),
  batchedDelete("kis_token_issuance_history", "issued_at < NOW() - INTERVAL '90 days'", "issued_at"),
  batchedDelete("market_rss_translation_cache", "updated_at < NOW() - INTERVAL '180 days'", "updated_at"),
  batchedDelete("automation_notification_deliveries", "delivery_date < CURRENT_DATE - 365", "delivery_date"),
  batchedDelete("us_top_rising_snapshots", "collected_at < NOW() - INTERVAL '30 days'", "collected_at"),
  batchedDelete("us_intraday_vwap_snapshots", "observed_at < NOW() - INTERVAL '30 days'", "observed_at"),
  batchedDelete("instrument_universe_sync_runs", "started_at < NOW() - INTERVAL '365 days'", "started_at"),
  batchedDelete("instrument_candle_cache_failures", "observed_at < NOW() - INTERVAL '30 days'", "observed_at"),
  batchedDelete("instrument_candle_cache_retries", "status <> 'PENDING' AND updated_at < NOW() - INTERVAL '30 days'", "updated_at"),
  batchedDelete("daily_bollinger_cache_retries", "status <> 'PENDING' AND updated_at < NOW() - INTERVAL '30 days'", "updated_at"),
  batchedDelete("daily_cache_followup_retries", "status <> 'PENDING' AND updated_at < NOW() - INTERVAL '30 days'", "updated_at"),
  batchedDelete("translation_usage_reservations", "reserved_at < NOW() - INTERVAL '2 hours'", "reserved_at"),
];

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const pool = getPool();
    const deleted: Record<string, number> = {};
    const detached: Record<string, number> = {};
    const deferred: Record<string, boolean> = {};
    const failed: Record<string, string> = {};
    for (const job of RETENTION_JOBS) {
      let tableDeleted = 0;
      try {
        for (let batch = 0; batch < MAX_BATCHES_PER_TABLE; batch++) {
          const result = await pool.query(job.query);
          const row = result.rows[0] as { deleted?: number; detached?: number } | undefined;
          const batchDeleted = row?.deleted ?? result.rowCount ?? 0;
          tableDeleted += batchDeleted;
          if (typeof row?.detached === "number") detached[job.table] = (detached[job.table] ?? 0) + row.detached;
          if (batchDeleted < DELETE_BATCH_SIZE) break;
          if (batch === MAX_BATCHES_PER_TABLE - 1) deferred[job.table] = true;
        }
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "RETENTION_QUERY_FAILED";
        failed[job.table] = code;
        console.error("[API /cron/db-retention] Table cleanup failed", job.table, code);
      }
      deleted[job.table] = tableDeleted;
    }
    const ok = Object.keys(failed).length === 0;
    return NextResponse.json({ ok, deleted, detached, deferred, failed, completedAt: new Date().toISOString() }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[API /cron/db-retention] Cleanup failed", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ ok: false, error: "DB_RETENTION_FAILED" }, { status: 503 });
  }
}
