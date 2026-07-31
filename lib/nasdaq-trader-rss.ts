import { fetchMarketRss, type MarketRssFeed } from "./market-rss";
export const NASDAQ_TRADER_RSS_URL = process.env.NASDAQ_TRADER_RSS_URL || "https://www.nasdaqtrader.com/rss.aspx?feed=news";
export function fetchNasdaqTraderRss(): Promise<MarketRssFeed> { return fetchMarketRss("NASDAQ_TRADER", NASDAQ_TRADER_RSS_URL); }
