import type { MarketRssItem } from "./market-rss";
import { LibreTranslateClient } from "./libretranslate-client";
import type { TranslationClient } from "./translation-types";

export type TranslatedMarketRssItem = MarketRssItem & { translatedTitle: string; translatedSummary: string; translationFallback: boolean; translationFallbackReason?: string };
export async function translateMarketRssItem(item: MarketRssItem, client: TranslationClient = new LibreTranslateClient()): Promise<TranslatedMarketRssItem> {
  const title = await client.translate(item.title);
  const summary = item.summary.trim() ? await client.translate(item.summary) : { translatedText: "", fallback: false, fallbackReason: undefined };
  const fallbackReason = [title.fallbackReason, summary.fallbackReason].filter(Boolean).join(",") || undefined;
  return { ...item, translatedTitle: title.translatedText, translatedSummary: summary.translatedText, translationFallback: title.fallback || summary.fallback, translationFallbackReason: fallbackReason };
}

export async function translateMarketRssItems(items: MarketRssItem[], client: TranslationClient = new LibreTranslateClient()) {
  // 여러 RSS 피드를 동시에 번역하지 않고 순차 처리해 번역 서버 과부하를 방지한다.
  const translated: TranslatedMarketRssItem[] = [];
  for (const item of items) translated.push(await translateMarketRssItem(item, client));
  return translated;
}
