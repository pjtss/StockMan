import { fetchGlobeNewswireRss } from "./globenewswire-rss";
import { fetchNasdaqRss } from "./nasdaq-rss";
import { fetchNasdaqTraderRss } from "./nasdaq-trader-rss";
import { fetchSecEdgarRss } from "./sec-edgar-rss";
import { fetchStockTitanRss } from "./stocktitan-rss";
import type { MarketRssFeed } from "./market-rss";

export const MARKET_RSS_SOURCES = ["GLOBENEWSWIRE", "NASDAQ", "NASDAQ_TRADER", "SEC_EDGAR", "STOCKTITAN"] as const;
export type MarketRssSource = typeof MARKET_RSS_SOURCES[number];

export function normalizeMarketRssSources(values?: unknown): MarketRssSource[] {
  if (!Array.isArray(values)) return [...MARKET_RSS_SOURCES];
  const sources = values
    .map((value) => String(value).trim().toUpperCase())
    .filter((value, index, list): value is MarketRssSource => MARKET_RSS_SOURCES.includes(value as MarketRssSource) && list.indexOf(value) === index);
  return sources.length ? sources : [...MARKET_RSS_SOURCES];
}

const fetchers: Record<MarketRssSource, () => Promise<MarketRssFeed>> = {
  GLOBENEWSWIRE: fetchGlobeNewswireRss,
  NASDAQ: fetchNasdaqRss,
  NASDAQ_TRADER: fetchNasdaqTraderRss,
  SEC_EDGAR: fetchSecEdgarRss,
  STOCKTITAN: fetchStockTitanRss,
};

export async function fetchMarketRssSource(source: MarketRssSource) {
  return fetchers[source]();
}

export async function fetchAllMarketRss(enabledSources?: unknown) {
  const sources = normalizeMarketRssSources(enabledSources);
  const results = await Promise.all(sources.map(async (source) => {
    try { return { source, ok: true as const, feed: await fetchers[source]() }; }
    catch (error) { return { source, ok: false as const, error: error instanceof Error ? error.message : String(error) }; }
  }));
  return { fetchedAt: new Date().toISOString(), results };
}
