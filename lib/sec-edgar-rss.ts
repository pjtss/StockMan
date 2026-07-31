import { fetchMarketRss, type MarketRssFeed } from "./market-rss";
// 전체 제출 피드는 Form 4/13D가 대부분이므로, 호재 탐지 목적의 기본값은 8-K로 제한한다.
// 전체 제출이 필요하면 SEC_EDGAR_RSS_URL 환경변수로 기존 URL을 재정의할 수 있다.
export const SEC_EDGAR_RSS_URL = process.env.SEC_EDGAR_RSS_URL || "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=100&output=atom";
export function fetchSecEdgarRss(): Promise<MarketRssFeed> { return fetchMarketRss("SEC_EDGAR", SEC_EDGAR_RSS_URL, { headers: { "user-agent": process.env.SEC_USER_AGENT || "StockMan research admin@example.com" } }); }
