import { fetchMarketRss, type MarketRssFeed } from "./market-rss";
export const SEC_EDGAR_RSS_URL = process.env.SEC_EDGAR_RSS_URL || "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&count=100&output=atom";
export function fetchSecEdgarRss(): Promise<MarketRssFeed> { return fetchMarketRss("SEC_EDGAR", SEC_EDGAR_RSS_URL, { headers: { "user-agent": process.env.SEC_USER_AGENT || "StockMan research admin@example.com" } }); }
