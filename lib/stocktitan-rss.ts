import { fetchMarketRss, type MarketRssFeed } from "./market-rss";

export const STOCKTITAN_RSS_URL = "https://www.stocktitan.net/rss";

function configuredUrl() {
  return process.env.STOCKTITAN_RSS_URL?.trim() || STOCKTITAN_RSS_URL;
}

/** Fetches StockTitan's publisher-provided RSS feed; no page scraping is performed. */
export async function fetchStockTitanRss(): Promise<MarketRssFeed> {
  return fetchMarketRss("STOCKTITAN", configuredUrl());
}

export function stockTitanRssConfig() {
  return { source: "STOCKTITAN", url: configuredUrl(), configuredUrl: Boolean(process.env.STOCKTITAN_RSS_URL?.trim()) };
}
