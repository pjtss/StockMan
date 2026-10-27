export function getMarketNewsKoreanTitle(article: {
  translatedTitle: string | null;
  translationStatus: string | null;
  translationSkippedReason: string | null;
  translationFallback: boolean | null;
}) {
  if (article.translationFallback) return null;

  const title = article.translatedTitle?.trim();
  if (!title) return null;

  const translated = article.translationStatus === "TRANSLATED";
  const alreadyKorean = article.translationStatus === "SKIPPED"
    && article.translationSkippedReason === "already_in_target_language";
  return translated || alreadyKorean ? title : null;
}
