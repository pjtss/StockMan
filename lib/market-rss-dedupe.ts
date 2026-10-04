import type { MarketRssItem } from "./market-rss";

/** Keep the first occurrence: RSS feeds conventionally list newest entries first. */
export function dedupeMarketRssItems(items: MarketRssItem[]) {
  const seen = new Set<string>();
  const unique: MarketRssItem[] = [];
  for (const item of items) {
    // Match the database TEXT conflict-key representation.
    const key = JSON.stringify([String(item.source), String(item.id)]);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return { items: unique, duplicateCount: items.length - unique.length };
}
