import { fetchMarketRss, type MarketRssFeed } from "./market-rss";
export const OFFICIAL_GLOBENEWSWIRE_RSS_URL = "https://rss.globenewswire.com/RssFeed/orgclass/1/feedTitle/GlobeNewswire%20-%20News%20about%20Public%20Companies";

function isGlobeNewswireHomepage(value: string) {
  try {
    const url = new URL(value);
    return ["globenewswire.com", "www.globenewswire.com", "rss.globenewswire.com"].includes(url.hostname.toLowerCase())
      && (url.pathname === "" || url.pathname === "/");
  } catch {
    return true;
  }
}

const configuredUrl = process.env.GLOBENEWSWIRE_RSS_URL?.trim();
// A legacy production override pointed at an HTML homepage and returned zero
// RSS items. Keep valid feed overrides, but recover to the official RSS host
// when the configured value is that known-invalid homepage.
export const GLOBENEWSWIRE_RSS_URL = configuredUrl && !isGlobeNewswireHomepage(configuredUrl)
  ? configuredUrl
  : OFFICIAL_GLOBENEWSWIRE_RSS_URL;

export function fetchGlobeNewswireRss(): Promise<MarketRssFeed> { return fetchMarketRss("GLOBENEWSWIRE", GLOBENEWSWIRE_RSS_URL); }
