import type { MarketRssItem } from "./market-rss";
import { LibreTranslateClient } from "./libretranslate-client";
import type { TranslationClient } from "./translation-types";

export type TranslatedMarketRssItem = MarketRssItem & { translatedTitle: string; translatedSummary: string; translationFallback: boolean; translationFallbackReason?: string };
export async function translateMarketRssItem(item: MarketRssItem, client: TranslationClient = new LibreTranslateClient()): Promise<TranslatedMarketRssItem> {
  // RSS 번역은 알림에 필요한 제목만 대상으로 한다. 요약은 원문을 보존해
  // LibreTranslate 요청 수와 OCI CPU 사용량을 제한한다.
  const title = await client.translate(item.title);
  return { ...item, translatedTitle: title.translatedText, translatedSummary: "", translationFallback: title.fallback, translationFallbackReason: title.fallbackReason };
}

export async function translateMarketRssItems(items: MarketRssItem[], client: TranslationClient = new LibreTranslateClient()) {
  // 여러 RSS 피드를 동시에 번역하지 않고 순차 처리해 번역 서버 과부하를 방지한다.
  const translated: TranslatedMarketRssItem[] = [];
  for (const item of items) translated.push(await translateMarketRssItem(item, client));
  return translated;
}
