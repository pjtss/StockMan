import type { MarketRssItem } from "./market-rss";
import { LibreTranslateClient } from "./libretranslate-client";
import type { TranslationClient } from "./translation-types";

export type TranslatedMarketRssItem = MarketRssItem & { translatedTitle: string; translatedSummary: string; translationFallback: boolean };
export async function translateMarketRssItem(item: MarketRssItem, client: TranslationClient = new LibreTranslateClient()): Promise<TranslatedMarketRssItem> {
  const [title, summary] = await Promise.all([client.translate(item.title), item.summary ? client.translate(item.summary) : Promise.resolve({ translatedText: "", fallback: false })]);
  return { ...item, translatedTitle: title.translatedText, translatedSummary: summary.translatedText, translationFallback: title.fallback || summary.fallback };
}
