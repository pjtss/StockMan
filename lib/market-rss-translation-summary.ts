type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function extractArticleRows(result: unknown): RecordValue[] {
  const root = asRecord(result);
  if (!root) return [];
  const roots = Array.isArray(root.results) ? root.results : [root];
  return roots.flatMap((entry) => {
    const feed = asRecord(asRecord(entry)?.feed);
    return feed && Array.isArray(feed.items) ? feed.items.map(asRecord).filter((item): item is RecordValue => item !== null) : [];
  });
}

export function getMarketRssFallbackArticles(result: unknown, reason?: string) {
  const configuration = asRecord(asRecord(result)?.translationConfiguration);
  if (configuration?.requested !== true) return [];
  return extractArticleRows(result)
    .filter((article) => article.translationFallback === true)
    .filter((article) => !reason || article.translationFallbackReason === reason || (!article.translationFallbackReason && reason === "unknown"))
    .map((article) => ({
      source: typeof article.source === "string" ? article.source : "RSS",
      externalId: typeof article.externalId === "string" ? article.externalId : "",
      title: typeof article.title === "string" ? article.title : "(제목 없음)",
      translatedTitle: typeof article.translatedTitle === "string" ? article.translatedTitle : null,
      link: typeof article.link === "string" ? article.link : "",
      reason: typeof article.translationFallbackReason === "string" && article.translationFallbackReason ? article.translationFallbackReason : "unknown",
    }));
}

export function summarizeMarketRssTranslationResults(result: unknown) {
  const configuration = asRecord(asRecord(result)?.translationConfiguration);
  if (configuration?.requested !== true) return null;

  const articles = extractArticleRows(result);
  let translatedCount = 0;
  let notRequiredCount = 0;
  let fallbackCount = 0;
  let unchangedCount = 0;
  const fallbackReasons: Record<string, number> = {};

  for (const article of articles) {
    if (article.translationFallback === true) {
      fallbackCount++;
      const reason = typeof article.translationFallbackReason === "string" && article.translationFallbackReason
        ? article.translationFallbackReason
        : "unknown";
      fallbackReasons[reason] = (fallbackReasons[reason] || 0) + 1;
      continue;
    }
    if (article.translationNotRequired === true) {
      notRequiredCount++;
      continue;
    }
    if (typeof article.translatedTitle !== "string") continue;
    translatedCount++;
    if (typeof article.title === "string" && article.translatedTitle.trim() === article.title.trim()) unchangedCount++;
  }

  return { articleCount: articles.length, translatedCount, notRequiredCount, fallbackCount, unchangedCount, fallbackReasons };
}
