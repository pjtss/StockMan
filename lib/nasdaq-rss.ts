import { fetchMarketRss, type MarketRssFeed } from "./market-rss";
export const NASDAQ_RSS_URL = process.env.NASDAQ_RSS_URL || "https://www.nasdaq.com/feed/rssoutbound";
export function fetchNasdaqRss(): Promise<MarketRssFeed> { return fetchMarketRss("NASDAQ", NASDAQ_RSS_URL); }
