import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { isDailyCandleAutomationEnabled } from "@/lib/us-daily-global-gate";
import { resolveRequestId, responseTimeMs, withRequestTrace } from "@/lib/request-trace";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function safeRunSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string | number | boolean | null> = {};
  const allowed = /(?:count|saved|success|failed|failure|instrument|market|retry|reason|errorcode|stage|coverage|target|updated|inserted|skipped|duration)/i;
  const visit = (source: Record<string, unknown>, prefix = "") => {
    for (const [key, child] of Object.entries(source)) {
      if (/secret|token|password|authorization|webhook|payload|message|url/i.test(key)) continue;
      const name = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === "object" && !Array.isArray(child)) {
        visit(child as Record<string, unknown>, name);
      } else if (allowed.test(key) && (child === null || ["string", "number", "boolean"].includes(typeof child))) {
        result[name] = typeof child === "string" ? child.slice(0, 160) : child as string | number | boolean | null;
      }
      if (Object.keys(result).length >= 40) return;
    }
  };
  visit(value as Record<string, unknown>);
  return result;
}

function timestamp(value: unknown) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request);
  const respond = (body: Record<string, unknown>, status = 200) => {
    const response = NextResponse.json({ requestId, responseTimeMs: responseTimeMs(startedAt), ...body }, { status, headers: { "cache-control": "no-store" } });
    response.headers.set("content-type", "application/json; charset=utf-8");
    return withRequestTrace(response, requestId, startedAt);
  };

  if (!isCronRequestAuthorized(request)) return respond({ ok: false, error: "UNAUTHORIZED" }, 401);

  try {
    const [settings, globalGateEnabled, marketResult, runResult] = await Promise.all([
      loadFeatureModuleSettings("us-daily-cache"),
      isDailyCandleAutomationEnabled(),
      getPool().query<Row>(
        `WITH eligible AS (
           SELECT market, code FROM us_common_stock_universe
            WHERE enabled = TRUE AND instrument_type = 'COMMON_STOCK' AND market IN ('NAS', 'NYS', 'AMS')
         ), market_dates AS (
           SELECT market, MAX(candle_date) AS latest_candle_date
             FROM us_latest_daily_candles
            WHERE market IN ('NAS', 'NYS', 'AMS')
            GROUP BY market
         )
         SELECT e.market,
                COUNT(*)::int AS eligible_count,
                COUNT(l.code)::int AS cached_count,
                MAX(md.latest_candle_date) AS latest_candle_date,
                COUNT(*) FILTER (WHERE l.candle_date = md.latest_candle_date)::int AS at_latest_date_count,
                MAX(l.fetched_at) AS latest_fetched_at
           FROM eligible e
           LEFT JOIN us_latest_daily_candles l ON l.market = e.market AND l.code = e.code
           LEFT JOIN market_dates md ON md.market = e.market
          GROUP BY e.market
          ORDER BY e.market`,
      ),
      getPool().query<Row>(
        `SELECT id, status, started_at, finished_at, duration_ms, summary
           FROM automation_runs
          WHERE module_key = 'us-daily-cache'
          ORDER BY started_at DESC
          LIMIT 10`,
      ),
    ]);

    const now = new Date();
    return respond({
      ok: true,
      checkedAt: now.toISOString(),
      automation: {
        module: "us-daily-cache",
        cronPath: "/api/cron/us-daily-cache",
        expectedIntervalSeconds: Math.max(60, settings.intervalSeconds ?? 3_600),
        globalGateEnabled,
        enabled: settings.enabled,
        withinConfiguredSchedule: isWithinSchedule(settings, now),
        schedule: {
          startTime: settings.startTime,
          endTime: settings.endTime,
          activeDays: settings.activeDays,
          intervalSeconds: settings.intervalSeconds ?? 3_600,
        },
      },
      markets: marketResult.rows.map((row) => ({
        market: String(row.market),
        eligibleCount: Number(row.eligible_count ?? 0),
        cachedCount: Number(row.cached_count ?? 0),
        latestCandleDate: row.latest_candle_date == null ? null : String(row.latest_candle_date),
        atLatestDateCount: Number(row.at_latest_date_count ?? 0),
        missingAtLatestDateCount: Math.max(0, Number(row.eligible_count ?? 0) - Number(row.at_latest_date_count ?? 0)),
        latestFetchedAt: timestamp(row.latest_fetched_at),
      })),
      recentRuns: runResult.rows.map((row) => ({
        id: Number(row.id),
        status: String(row.status),
        startedAt: timestamp(row.started_at),
        finishedAt: timestamp(row.finished_at),
        durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
        summary: safeRunSummary(row.summary),
      })),
    });
  } catch {
    return respond({ ok: false, stage: "load_us_daily_cache_status", errorCode: "US_DAILY_CACHE_STATUS_UNAVAILABLE" }, 503);
  }
}
