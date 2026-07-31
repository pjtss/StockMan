import { fetchGlobeNewswireRss } from "./globenewswire-rss";
import { fetchNasdaqRss } from "./nasdaq-rss";
import { fetchNasdaqTraderRss } from "./nasdaq-trader-rss";
import { fetchSecEdgarRss } from "./sec-edgar-rss";
import type { MarketRssFeed } from "./market-rss";

export const MARKET_RSS_SOURCES = ["GLOBENEWSWIRE", "NASDAQ", "NASDAQ_TRADER", "SEC_EDGAR"] as const;
export type MarketRssSource = typeof MARKET_RSS_SOURCES[number];

const fetchers: Record<MarketRssSource, () => Promise<MarketRssFeed>> = {
  GLOBENEWSWIRE: fetchGlobeNewswireRss,
  NASDAQ: fetchNasdaqRss,
  NASDAQ_TRADER: fetchNasdaqTraderRss,
  SEC_EDGAR: fetchSecEdgarRss,
};

export async function fetchMarketRssSource(source: MarketRssSource) {
  return fetchers[source]();
}

export async function fetchAllMarketRss() {
  const results = await Promise.all(MARKET_RSS_SOURCES.map(async (source) => {
    try { return { source, ok: true as const, feed: await fetchers[source]() }; }
    catch (error) { return { source, ok: false as const, error: error instanceof Error ? error.message : String(error) }; }
  }));
  return { fetchedAt: new Date().toISOString(), results };
}
