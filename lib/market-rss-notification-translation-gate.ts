import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { marketRssArticles } from "./schema";

function matchSnapshot<T>(column: Parameters<typeof eq>[0], value: T | null) {
  return value === null ? isNull(column) : eq(column, value as never);
}

/** Send only validated Korean translations (or titles already entirely Korean). */
export function buildMarketRssNotificationTranslationGate() {
  return or(
    eq(marketRssArticles.translationStatus, "TRANSLATED"),
    and(eq(marketRssArticles.translationStatus, "SKIPPED"), eq(marketRssArticles.translationSkippedReason, "already_in_target_language")),
  );
}

/** Claim only the exact source/translation snapshot that produced the notification payload. */
export function buildMarketRssNotificationClaimCondition(row: {
  id: number;
  source: string;
  title: string;
  summary: string;
  translatedTitle: string | null;
  translationStatus: string;
  translationFallback: boolean;
  translationSkippedReason: string | null;
  translationError: string | null;
  detectedTicker: string | null;
  link: string;
  publishedAt: Date | null;
}) {
  return and(
    eq(marketRssArticles.id, row.id),
    eq(marketRssArticles.notificationStatus, "PENDING"),
    eq(marketRssArticles.source, row.source),
    eq(marketRssArticles.title, row.title),
    eq(marketRssArticles.summary, row.summary),
    matchSnapshot(marketRssArticles.translatedTitle, row.translatedTitle),
    eq(marketRssArticles.translationStatus, row.translationStatus),
    eq(marketRssArticles.translationFallback, row.translationFallback),
    matchSnapshot(marketRssArticles.translationSkippedReason, row.translationSkippedReason),
    matchSnapshot(marketRssArticles.translationError, row.translationError),
    matchSnapshot(marketRssArticles.detectedTicker, row.detectedTicker),
    eq(marketRssArticles.link, row.link),
    matchSnapshot(marketRssArticles.publishedAt, row.publishedAt),
  );
}

/** Counts delivered and in-flight sends against the rolling Discord limit. */
export function buildMarketRssNotificationRateWindowCondition(cutoff: Date) {
  return and(
    inArray(marketRssArticles.notificationStatus, ["SENT", "SENDING"]),
    gte(marketRssArticles.notifiedAt, cutoff),
  );
}
