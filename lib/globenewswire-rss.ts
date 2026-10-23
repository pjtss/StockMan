import { fetchMarketRss, type MarketRssFeed } from "./market-rss";
export const GLOBENEWSWIRE_RSS_URL = process.env.GLOBENEWSWIRE_RSS_URL || "https://www.globenewswire.com/RssFeed/orgclass/1/feedTitle/GlobeNewswire%20-%20News%20about%20Public%20Companies";
export function fetchGlobeNewswireRss(): Promise<MarketRssFeed> { return fetchMarketRss("GLOBENEWSWIRE", GLOBENEWSWIRE_RSS_URL); }
