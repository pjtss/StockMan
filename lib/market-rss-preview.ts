import { classifyMarketRssItem } from "@/lib/market-rss-classifier";
import { getMarketRssGrade } from "@/lib/market-rss-grade";
import { translateMarketRssItems } from "@/lib/translate-market-rss-item";
import type { MarketRssFeed } from "@/lib/market-rss";

export type MarketRssFetchResult =
  | { source: string; ok: true; feed: MarketRssFeed }
  | { source: string; ok: false; error: string };

export async function previewMarketRssResults(results: MarketRssFetchResult[], translate = false) {
  const preview = [];
  for (const result of results) {
    if (!result.ok) {
      preview.push(result);
      continue;
    }
    const items = translate ? await translateMarketRssItems(result.feed.items) : result.feed.items;
    const articles = items.map((item) => {
      const classification = classifyMarketRssItem(item);
      return {
        ...item,
        classification,
        grade: getMarketRssGrade(classification),
      };
    });
    preview.push({
      source: result.source,
      ok: true as const,
      feed: { ...result.feed, items: articles },
      summary: {
        itemCount: articles.length,
        notifyEligibleCount: articles.filter((item) => item.classification.notifyEligible).length,
        highGradeCount: articles.filter((item) => item.grade === "high").length,
        mediumGradeCount: articles.filter((item) => item.grade === "medium").length,
        lowGradeCount: articles.filter((item) => item.grade === "low").length,
        excludedCount: articles.filter((item) => item.grade === "excluded").length,
      },
    });
  }
  return preview;
}
