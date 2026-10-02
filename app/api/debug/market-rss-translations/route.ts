import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

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
    const [summaryResult, totalResult, rowsResult] = await Promise.all([
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
      pagination: { limit, offset, returned: items.length, hasMore: offset + items.length < total },
      items,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "RSS_TRANSLATION_DIAGNOSTICS_UNAVAILABLE" }, { status: 503 });
  }
}
