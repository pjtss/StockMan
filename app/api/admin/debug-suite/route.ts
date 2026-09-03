import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-auth";
import { inspectDatabaseSchema } from "@/lib/schema-health";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";

export const dynamic = "force-dynamic";

const ALL_CHECKS = ["environment", "schema", "token", "automation", "rss", "sec"] as const;
type CheckName = (typeof ALL_CHECKS)[number];

function secretMatches(candidate: string | null, expected: string | undefined) {
  if (!candidate || !expected) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function authorized(request: Request) {
  if (await requireAdminSession()) return true;
  const header = request.headers.get("authorization");
  const candidate = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : request.headers.get("x-cron-secret");
  return secretMatches(candidate, process.env.CRON_SECRET);
}

async function safeCount(pool: ReturnType<typeof getPool>, table: string) {
  try {
    const result = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
    return { ok: true, count: Number(result.rows[0]?.count || 0) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runSuite(checks: CheckName[]) {
  const startedAt = Date.now();
  const result: Record<string, unknown> = {};
  if (checks.includes("environment")) {
    result.environment = {
      ok: Boolean(process.env.DATABASE_URL && process.env.CRON_SECRET),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      kisConfigured: Boolean(process.env.KIS_APPKEY && process.env.KIS_APPSECRET),
      discordConfigured: Boolean(process.env.DISCORD_WEBHOOK_URL || process.env.MARKET_RSS_DISCORD_WEBHOOK_URL || process.env.SEC_DISCORD_WEBHOOK_URL),
      cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    };
  }
  if (checks.includes("schema")) result.schema = await inspectDatabaseSchema();

  const pool = getPool();
  if (checks.includes("token")) {
    try {
      const current = await pool.query<{ issued_at: Date; expires_at: Date }>({ text: "SELECT issued_at, expires_at FROM kis_tokens WHERE id = 1 LIMIT 1" });
      const history = await pool.query<{ issued_at: Date; expires_at: Date; reason: string }>({ text: "SELECT issued_at, expires_at, reason FROM kis_token_issuance_history ORDER BY issued_at DESC LIMIT 20" });
      const rows = history.rows.map((entry, index, all) => ({
        issuedAt: new Date(entry.issued_at).toISOString(),
        expiresAt: new Date(entry.expires_at).toISOString(),
        reason: entry.reason,
        intervalSeconds: all[index + 1] ? Math.floor((new Date(entry.issued_at).getTime() - new Date(all[index + 1].issued_at).getTime()) / 1000) : null,
      }));
      const intervals = rows.map((row) => row.intervalSeconds).filter((value): value is number => value !== null);
      result.token = { ok: true, tokenPresent: current.rows.length > 0, averageIntervalSeconds: intervals.length ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length) : null, recent: rows };
    } catch (error) {
      result.token = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  if (checks.includes("automation")) {
    result.automation = { ok: true, featureModuleSettings: await safeCount(pool, "feature_module_settings"), automationRuns: await safeCount(pool, "automation_runs") };
  }
  if (checks.includes("rss")) {
    try {
      const rssSettings = await loadFeatureModuleSettings("market-rss");
      const [articles, snapshots, runs] = await Promise.all([
        pool.query(`SELECT source, COUNT(*)::int AS count, MAX(published_at) AS latest_published_at, MAX(created_at) AS latest_created_at FROM market_rss_articles GROUP BY source ORDER BY source`),
        pool.query(`SELECT DISTINCT ON (source) source, status, item_count, fetched_at, url FROM market_rss_fetch_snapshots ORDER BY source, fetched_at DESC`),
        pool.query(`SELECT status, started_at, finished_at, duration_ms, summary, error_message FROM automation_runs WHERE module_key='market-rss' ORDER BY started_at DESC LIMIT 5`),
      ]);
      const now = new Date();
      result.rss = {
        ok: true,
        marketRssArticles: await safeCount(pool, "market_rss_articles"),
        fetchSnapshots: await safeCount(pool, "market_rss_fetch_snapshots"),
        bySource: articles.rows,
        latestFetchBySource: snapshots.rows,
        recentRuns: runs.rows,
        schedule: {
          enabled: rssSettings.enabled,
          startTime: rssSettings.startTime,
          endTime: rssSettings.endTime,
          activeDays: rssSettings.activeDays,
          scheduleMode: rssSettings.scheduleMode,
          startDay: rssSettings.startDay,
          endDay: rssSettings.endDay,
          checkedAt: now.toISOString(),
          withinSchedule: isWithinSchedule(rssSettings, now),
        },
      };
    } catch (error) {
      result.rss = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  if (checks.includes("sec")) result.sec = { ok: true, filingEvents: await safeCount(pool, "sec_filing_events"), sourceSnapshots: await safeCount(pool, "sec_source_snapshots") };
  return { ok: true, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, checks, result };
}

async function handle(request: Request) {
  const requestId = crypto.randomUUID();
  if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "Unauthorized", requestId }, { status: 401, headers: { "x-request-id": requestId } });
  const url = new URL(request.url);
  const target = url.searchParams.get("target")?.trim();
  const rawChecks = url.searchParams.get("checks") || (target && target !== "all" ? target : "");
  const requestedValues = rawChecks.split(",").map((value) => value.trim()).filter(Boolean);
  const invalid = requestedValues.filter((value) => !(ALL_CHECKS as readonly string[]).includes(value as CheckName));
  if (invalid.length) {
    return NextResponse.json({
      requestId,
      mode: "ADMIN_DEBUG_SUITE",
      ok: false,
      error: "INVALID_DEBUG_TARGET",
      invalidTargets: invalid,
      allowedTargets: ["all", ...ALL_CHECKS],
    }, { status: 400, headers: { "x-request-id": requestId } });
  }
  const requested = requestedValues.filter((value): value is CheckName => (ALL_CHECKS as readonly string[]).includes(value as CheckName));
  const checks = requested.length ? requested : [...ALL_CHECKS];
  try {
    return NextResponse.json({ requestId, mode: "ADMIN_DEBUG_SUITE", ...(await runSuite(checks)) }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    return NextResponse.json({ ok: false, requestId, error: error instanceof Error ? error.message : String(error) }, { status: 503, headers: { "x-request-id": requestId } });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
