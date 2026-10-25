import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { MARKET_RSS_DISCORD_ALLOWED_SOURCES } from "@/lib/market-rss-discord-policy";

export const dynamic = "force-dynamic";

const SOURCES = ["GLOBENEWSWIRE", "NASDAQ", "NASDAQ_TRADER", "SEC_EDGAR", "STOCKTITAN"] as const;
const TRANSLATION_STATUSES = ["PENDING", "TRANSLATED", "SKIPPED", "FAILED"] as const;

function integerParam(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function redactTranslationError(value: unknown) {
  if (typeof value !== "string") return null;
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, (rawUrl) => {
      try {
        const url = new URL(rawUrl);
        for (const key of [...url.searchParams.keys()]) {
          if (/key|token|secret|auth|credential|pass(?:word|wd)?|pwd/i.test(key)) url.searchParams.set(key, "[redacted]");
        }
        url.username = "";
        url.password = "";
        return url.toString();
      } catch { return "[redacted URL]"; }
    })
    .replace(/(\bauthorization\s*[:=]\s*)(?:bearer\s+)?("[^"]*"|'[^']*'|[^\s,;)}]+)/gi, "$1[redacted]")
    .replace(/((?:api[_-]?key|access[_-]?token|token|secret|password|passwd|pwd)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;)}]+)/gi, "$1[redacted]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const hours = integerParam(params.get("hours"), 24, 1, 720);
  const limit = integerParam(params.get("limit"), 50, 1, 100);
  const offset = integerParam(params.get("offset"), 0, 0, 1_000_000);
  const sourceParam = (params.get("source") || "ALL").toUpperCase();
  const statusParam = (params.get("status") || "ALL").toUpperCase();

  if (hours === null || limit === null || offset === null) {
    return NextResponse.json({ ok: false, error: "INVALID_PAGINATION_OR_HOURS" }, { status: 400 });
  }
  if (sourceParam !== "ALL" && !SOURCES.includes(sourceParam as typeof SOURCES[number])) {
    return NextResponse.json({ ok: false, error: "UNSUPPORTED_SOURCE", sources: ["ALL", ...SOURCES] }, { status: 400 });
  }
  if (statusParam !== "ALL" && !TRANSLATION_STATUSES.includes(statusParam as typeof TRANSLATION_STATUSES[number])) {
    return NextResponse.json({ ok: false, error: "UNSUPPORTED_TRANSLATION_STATUS", statuses: ["ALL", ...TRANSLATION_STATUSES] }, { status: 400 });
  }

  const source = sourceParam === "ALL" ? null : sourceParam;
  const status = statusParam === "ALL" ? null : statusParam;
  try {
    const pool = getPool();
    const [summaryResult, totalResult, rowsResult, lifetimeResult, lifetimeSkipReasonsResult, sentGateViolationsResult] = await Promise.all([
      pool.query<{ status: string; count: number }>(
        `SELECT translation_status AS status, COUNT(*)::int AS count
         FROM market_rss_articles
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')
           AND ($2::text IS NULL OR source = $2)
         GROUP BY translation_status ORDER BY translation_status`,
        [hours, source],
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM market_rss_articles
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')
           AND ($2::text IS NULL OR source = $2)
           AND ($3::text IS NULL OR translation_status = $3)`,
        [hours, source, status],
      ),
      pool.query(
        `SELECT id, source, external_id, title, link, published_at, created_at, updated_at,
                notification_status, notified_at,
                translation_status, translation_fallback, translation_attempts,
                translation_provider, translation_source_language, translation_target_language,
                translation_char_count, translation_skipped_reason, translation_error,
                translation_translated_at, translated_title,
                (translated_title IS NOT NULL AND btrim(translated_title) <> '') AS has_translated_title
         FROM market_rss_articles
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')
           AND ($2::text IS NULL OR source = $2)
           AND ($3::text IS NULL OR translation_status = $3)
         ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`,
        [hours, source, status, limit, offset],
      ),
      pool.query(
        `SELECT source, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE translation_status = 'PENDING')::int AS translation_pending,
                COUNT(*) FILTER (WHERE translation_status = 'TRANSLATED')::int AS translated,
                COUNT(*) FILTER (WHERE translation_status = 'FAILED')::int AS translation_failed,
                COUNT(*) FILTER (WHERE translation_status = 'SKIPPED')::int AS translation_skipped,
                COUNT(*) FILTER (WHERE notification_status = 'PENDING')::int AS notification_pending,
                COUNT(*) FILTER (WHERE notification_status = 'SENT')::int AS sent,
                COUNT(*) FILTER (WHERE notification_status = 'FAILED')::int AS notification_failed,
                COUNT(*) FILTER (WHERE notification_status = 'SKIPPED')::int AS notification_skipped,
                COUNT(*) FILTER (WHERE notification_status = 'UNCERTAIN')::int AS notification_uncertain,
                COUNT(*) FILTER (WHERE notification_status IN ('PROCESSING', 'SENDING'))::int AS in_flight,
                COUNT(*) FILTER (
                  WHERE notification_status = 'SENT'
                    AND NOT (
                      translation_status = 'TRANSLATED'
                      OR (translation_status = 'SKIPPED' AND translation_skipped_reason = 'already_in_target_language')
                    )
                )::int AS sent_without_validated_translation
         FROM market_rss_articles
         WHERE source = ANY($1::text[])
         GROUP BY source ORDER BY source`,
        [source ? [source] : [...MARKET_RSS_DISCORD_ALLOWED_SOURCES]],
      ),
      pool.query(
        `SELECT source, translation_provider AS provider,
                CASE
                  WHEN translation_skipped_reason IN (
                    'already_in_target_language', 'monthly_character_limit_reached',
                    'hourly_character_limit_reached', 'provider_free_quota_exceeded',
                    'provider_daily_quota_exceeded', 'cloud_translation_not_configured',
                    'protected_token_mismatch', 'translation_numeric_hallucination',
                    'target_language_not_detected', 'translation_output_incomplete',
                    'translation_response_unparseable', 'translation_cache_invalidation_failed',
                    'translation_input_empty', 'translation_api_error'
                  ) THEN translation_skipped_reason
                  ELSE 'other'
                END AS reason,
                COUNT(*)::int AS count
         FROM market_rss_articles
         WHERE source = ANY($1::text[]) AND translation_status = 'SKIPPED'
         GROUP BY source, provider, reason ORDER BY source, provider, reason`,
        [source ? [source] : [...MARKET_RSS_DISCORD_ALLOWED_SOURCES]],
      ),
      pool.query(
        `SELECT source, translation_status AS translation_status,
                CASE
                  WHEN translation_skipped_reason IN (
                    'already_in_target_language', 'monthly_character_limit_reached',
                    'hourly_character_limit_reached', 'provider_free_quota_exceeded',
                    'provider_daily_quota_exceeded', 'cloud_translation_not_configured',
                    'protected_token_mismatch', 'translation_numeric_hallucination',
                    'target_language_not_detected', 'translation_output_incomplete',
                    'translation_response_unparseable', 'translation_cache_invalidation_failed',
                    'translation_input_empty', 'translation_api_error'
                  ) THEN translation_skipped_reason
                  WHEN translation_skipped_reason IS NULL THEN 'no_skip_reason'
                  ELSE 'other'
                END AS reason,
                COUNT(*)::int AS count
         FROM market_rss_articles
         WHERE source = ANY($1::text[]) AND notification_status = 'SENT'
           AND NOT (
             translation_status = 'TRANSLATED'
             OR (translation_status = 'SKIPPED' AND translation_skipped_reason = 'already_in_target_language')
           )
         GROUP BY source, translation_status, reason ORDER BY source, translation_status, reason`,
        [source ? [source] : [...MARKET_RSS_DISCORD_ALLOWED_SOURCES]],
      ),
    ]);

    const items = rowsResult.rows.map((row) => ({
      ...row,
      translation_error: redactTranslationError(row.translation_error),
    }));
    const byStatus = Object.fromEntries(summaryResult.rows.map((row) => [row.status, Number(row.count)]));
    const total = Number(totalResult.rows[0]?.count ?? 0);
    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      scope: { table: "market_rss_articles", createdWithinHours: hours, source: source || "ALL", status: status || "ALL" },
      summary: {
        totalInWindow: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
        filteredTotal: total,
        byStatus,
      },
      lifetimeBySource: lifetimeResult.rows,
      lifetimeSkippedReasonsBySource: lifetimeSkipReasonsResult.rows,
      sentGateViolationsBySource: sentGateViolationsResult.rows,
      pagination: { limit, offset, returned: items.length, hasMore: offset + items.length < total },
      items,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "RSS_TRANSLATION_DIAGNOSTICS_UNAVAILABLE" }, { status: 503 });
  }
}
