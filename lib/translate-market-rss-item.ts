import type { MarketRssItem } from "./market-rss";
import type { TranslationClient } from "./translation-types";

const TRANSLATION_CONCURRENCY = 3;
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
  // 외부 번역 API의 과부하를 막기 위해 동시성을 제한하되, 항목별 네트워크
  // 대기시간이 전체 배치에 직렬로 누적되지 않도록 bounded worker를 사용한다.
  const translated = new Array<TranslatedMarketRssItem>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      translated[index] = await translateMarketRssItem(items[index], client);
    }
  };
  await Promise.all(Array.from({ length: Math.min(TRANSLATION_CONCURRENCY, items.length) }, worker));
  return translated;
}
