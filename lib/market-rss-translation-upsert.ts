import { sql, type AnyColumn } from "drizzle-orm";
import { marketRssArticles } from "./schema";

/** Prefer the latest parsed URL when repairing a previously persisted XML entity reference. */
export function buildMarketRssLinkUpsertValue() {
  return sql`CASE
    WHEN ${marketRssArticles.link} = ''
      OR ${marketRssArticles.link} LIKE '%&amp;%'
      OR ${marketRssArticles.link} LIKE '%&#%'
    THEN CASE WHEN excluded.link <> '' THEN excluded.link ELSE ${marketRssArticles.link} END
    ELSE ${marketRssArticles.link}
  END`;
}

/** Clear translation state only when the source text/context used for translation changes. */
export function buildMarketRssTranslationUpsertReset() {
  const sourceTextChanged = sql`(
    ${marketRssArticles.title} IS DISTINCT FROM excluded.title
    OR ${marketRssArticles.summary} IS DISTINCT FROM excluded.summary
  )`;
  const resetIfChanged = (column: AnyColumn, emptyValue: string | null) =>
    sql`CASE WHEN ${sourceTextChanged} THEN ${emptyValue} ELSE ${column} END`;

  return {
    translatedTitle: resetIfChanged(marketRssArticles.translatedTitle, null),
    translationCandidateTitle: resetIfChanged(marketRssArticles.translationCandidateTitle, null),
    translatedSummary: resetIfChanged(marketRssArticles.translatedSummary, null),
    translatedContent: resetIfChanged(marketRssArticles.translatedContent, null),
    translationProvider: resetIfChanged(marketRssArticles.translationProvider, null),
    translationCharCount: sql`CASE WHEN ${sourceTextChanged} THEN 0 ELSE ${marketRssArticles.translationCharCount} END`,
    translationSkippedReason: resetIfChanged(marketRssArticles.translationSkippedReason, null),
    translationTranslatedAt: sql`CASE WHEN ${sourceTextChanged} THEN NULL ELSE ${marketRssArticles.translationTranslatedAt} END`,
    translationAttemptedAt: sql`CASE WHEN ${sourceTextChanged} THEN NULL ELSE ${marketRssArticles.translationAttemptedAt} END`,
    translationStatus: sql`CASE WHEN ${sourceTextChanged} THEN 'PENDING' ELSE ${marketRssArticles.translationStatus} END`,
    translationFallback: sql`CASE WHEN ${sourceTextChanged} THEN FALSE ELSE ${marketRssArticles.translationFallback} END`,
    translationAttempts: sql`CASE WHEN ${sourceTextChanged} THEN 0 ELSE ${marketRssArticles.translationAttempts} END`,
    translationError: resetIfChanged(marketRssArticles.translationError, null),
  };
}
