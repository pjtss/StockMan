import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, notInArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { marketRssArticles } from "@/lib/schema";
import { getMarketRssGrade, isMarketRssGrade, MARKET_RSS_GRADE_LABELS, type MarketRssGrade } from "@/lib/market-rss-grade";
import { MARKET_RSS_SOURCES, type MarketRssSource } from "@/lib/market-rss-sources";
import { sanitizeMarketRssTranslationError } from "@/lib/market-rss-translation-retry";
import { kstDayBounds } from "@/lib/kst-day-bounds";
import { MARKET_RSS_TRANSLATION_MAX_ATTEMPTS, MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS } from "@/lib/market-rss-translation-retry-constants";

export async function POST(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 }); }
  const value = body as { id?: unknown; expectedUpdatedAt?: unknown; expectedTitle?: unknown; expectedStatus?: unknown; expectedReason?: unknown; expectedAttempts?: unknown } | null;
  const id = Number(value?.id);
  const expectedUpdatedAt = typeof value?.expectedUpdatedAt === "string" ? new Date(value.expectedUpdatedAt) : null;
  const expectedTitle = typeof value?.expectedTitle === "string" ? value.expectedTitle : "";
  const expectedStatus = value?.expectedStatus;
  const expectedAttempts = Number(value?.expectedAttempts);
  const expectedReason = value?.expectedReason;
  if (!Number.isSafeInteger(id) || id <= 0 || !expectedUpdatedAt || Number.isNaN(expectedUpdatedAt.getTime())
    || !expectedTitle.trim() || (expectedStatus !== "FAILED" && expectedStatus !== "SKIPPED")
    || !Number.isSafeInteger(expectedAttempts) || expectedAttempts < MARKET_RSS_TRANSLATION_MAX_ATTEMPTS
    || (expectedReason !== null && typeof expectedReason !== "string")) {
    return NextResponse.json({ ok: false, error: "INVALID_RETRY_REQUEST" }, { status: 400 });
  }
  const expectedUpdatedAtEnd = new Date(expectedUpdatedAt.getTime() + 1);

  try {
    const updated = await getDb().update(marketRssArticles).set({
      translatedTitle: null,
      translationCandidateTitle: null,
      translatedSummary: null,
      translatedContent: null,
      translationProvider: null,
      translationCharCount: 0,
      translationSkippedReason: null,
      translationTranslatedAt: null,
      translationAttemptedAt: null,
      translationStatus: "PENDING",
      translationFallback: false,
      translationAttempts: 0,
      translationError: null,
      updatedAt: new Date(),
    }).where(and(
      eq(marketRssArticles.id, id),
      gte(marketRssArticles.updatedAt, expectedUpdatedAt),
      lt(marketRssArticles.updatedAt, expectedUpdatedAtEnd),
      eq(marketRssArticles.title, expectedTitle),
      eq(marketRssArticles.translationStatus, expectedStatus),
      eq(marketRssArticles.translationAttempts, expectedAttempts),
      expectedReason === null ? isNull(marketRssArticles.translationSkippedReason) : eq(marketRssArticles.translationSkippedReason, expectedReason),
      eq(marketRssArticles.translationFallback, true),
      ne(marketRssArticles.translationStatus, "PENDING"),
      gte(marketRssArticles.translationAttempts, MARKET_RSS_TRANSLATION_MAX_ATTEMPTS),
      or(
        eq(marketRssArticles.translationStatus, "FAILED"),
        and(
          eq(marketRssArticles.translationStatus, "SKIPPED"),
          inArray(marketRssArticles.translationSkippedReason, ["cloud_translation_not_configured", ...MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS]),
        ),
      ),
      eq(marketRssArticles.notifyEligible, true),
      eq(marketRssArticles.isBacklog, false),
      notInArray(marketRssArticles.notificationStatus, ["PROCESSING", "SENDING"]),
    )).returning({ id: marketRssArticles.id });

    if (updated.length !== 1) {
      return NextResponse.json({ ok: false, error: "ARTICLE_CHANGED_OR_NOT_RETRYABLE" }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      id,
      status: "PENDING",
      message: "번역 재시도 대기열에 등록했습니다. 기존 cron 번역 worker가 처리하며, Discord 알림은 재발송하지 않습니다.",
      notificationStatusUnchanged: true,
    });
  } catch (error) {
    console.error("[API /admin/stocktitan-rss] manual translation retry failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "TRANSLATION_RETRY_FAILED" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const searchParams = new URL(request.url).searchParams;
  const date = searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const afterTime = searchParams.get("afterTime");
  const sourceValue = (searchParams.get("source") || "STOCKTITAN").toUpperCase();
  const gradeValue = (searchParams.get("grade") || "all").toLowerCase();
  if (!MARKET_RSS_SOURCES.includes(sourceValue as MarketRssSource)) return NextResponse.json({ ok: false, error: "지원하지 않는 RSS source", sources: MARKET_RSS_SOURCES }, { status: 400 });
  if (gradeValue !== "all" && !isMarketRssGrade(gradeValue)) return NextResponse.json({ ok: false, error: "지원하지 않는 호재 등급", grades: ["all", ...Object.keys(MARKET_RSS_GRADE_LABELS)] }, { status: 400 });
  try {
    const { start, end } = kstDayBounds(date, afterTime);
    const conditions = [eq(marketRssArticles.source, sourceValue), gte(marketRssArticles.publishedAt, start), lt(marketRssArticles.publishedAt, end)];
    const grade = gradeValue === "all" ? null : gradeValue as MarketRssGrade;
    if (grade === "high" || grade === "medium" || grade === "low") {
      conditions.push(eq(marketRssArticles.notifyEligible, true));
      if (grade === "high") conditions.push(gte(marketRssArticles.priority, 100));
      if (grade === "medium") { conditions.push(gte(marketRssArticles.priority, 50)); conditions.push(lt(marketRssArticles.priority, 100)); }
      if (grade === "low") conditions.push(lt(marketRssArticles.priority, 50));
    }
    if (grade === "excluded") conditions.push(eq(marketRssArticles.notifyEligible, false));
    const rows = await getDb().select().from(marketRssArticles).where(and(...conditions)).orderBy(desc(marketRssArticles.priority), desc(marketRssArticles.publishedAt), asc(marketRssArticles.id));
    const articles = rows.map((row) => ({
      ...row,
      translationError: row.translationError ? sanitizeMarketRssTranslationError(row.translationError) : null,
      grade: getMarketRssGrade(row),
    }));
    return NextResponse.json({ ok: true, source: sourceValue, date, afterTime: afterTime || null, grade: gradeValue, timezone: "Asia/Seoul", count: articles.length, articles });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
