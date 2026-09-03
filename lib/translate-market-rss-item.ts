import type { MarketRssItem } from "./market-rss";
import type { TranslationClient } from "./translation-types";
import { CloudTranslationClient } from "./cloud-translation-client";
import { LibreTranslateClient } from "./libretranslate-client";

export type TranslatedMarketRssItem = MarketRssItem & { translatedTitle: string; translatedSummary: string; translatedContent?: string; translationFallback: boolean; translationFallbackReason?: string };
export async function translateMarketRssItem(item: MarketRssItem, client?: TranslationClient): Promise<TranslatedMarketRssItem> {
  const selectedClient = client ?? CloudTranslationClient.fromEnvironment();
  if (!selectedClient) return { ...item, translatedTitle: item.title, translatedSummary: item.summary, ...(item.content ? { translatedContent: item.content } : {}), translationFallback: true, translationFallbackReason: "cloud_translation_not_configured" };
  const title = await selectedClient.translate(item.title);
  // Cost policy: only the headline is sent to Google Translation. Keep the
  // original summary/body available to callers without spending translation
  // quota on fields that are not currently displayed as translated.
  return { ...item, translatedTitle: title.translatedText, translatedSummary: item.summary, ...(item.content ? { translatedContent: item.content } : {}), translationFallback: title.fallback, translationFallbackReason: title.fallbackReason };
}

export async function translateMarketRssItems(items: MarketRssItem[], client: TranslationClient = new LibreTranslateClient()) {
  // 여러 RSS 피드를 동시에 번역하지 않고 순차 처리해 번역 서버 과부하를 방지한다.
  const translated: TranslatedMarketRssItem[] = [];
  for (const item of items) translated.push(await translateMarketRssItem(item, client));
  return translated;
}
