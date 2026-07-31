import { fetchMarketRss, type MarketRssFeed } from "./market-rss";
export const GLOBENEWSWIRE_RSS_URL = process.env.GLOBENEWSWIRE_RSS_URL || "https://rss.globenewswire.com/";
export function fetchGlobeNewswireRss(): Promise<MarketRssFeed> { return fetchMarketRss("GLOBENEWSWIRE", GLOBENEWSWIRE_RSS_URL); }
