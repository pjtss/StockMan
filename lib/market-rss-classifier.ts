import type { MarketRssItem } from "./market-rss";

export type MarketRssCategory = "ACTIONABLE" | "TRANSCRIPT" | "MARKET" | "GENERAL";
export type MarketRssClassification = { category: MarketRssCategory; priority: number; notifyEligible: boolean };

const actionable = /fda|clinical trial|phase [123]|approval|contract|partnership|acquisition|merger|funding|offering|financing|raises? funds|launch|上장|인수|계약|임상|승인|자금 조달/i;
const transcript = /earnings call transcript|conference call transcript|quarterly results transcript/i;
const market = /market update|market commentary|stock market|index|etf|nasdaq composite|s\s*&\s*p 500|dow jones/i;
const ticker = /\(([A-Z]{1,5})\)/;

export function classifyMarketRssItem(item: Pick<MarketRssItem, "title" | "source">): MarketRssClassification {
  const title = item.title.trim();
  if (transcript.test(title)) return { category: "TRANSCRIPT", priority: 0, notifyEligible: false };
  if (actionable.test(title)) return { category: "ACTIONABLE", priority: 100, notifyEligible: true };
  if (market.test(title) && !ticker.test(title)) return { category: "MARKET", priority: 10, notifyEligible: false };
  return { category: "GENERAL", priority: ticker.test(title) ? 50 : 20, notifyEligible: ticker.test(title) };
}
