import type { MarketRssItem } from "./market-rss";

export type MarketRssCategory = "FINANCING" | "ACTIONABLE" | "TRANSCRIPT" | "MARKET" | "GENERAL";
export type MarketRssClassification = { category: MarketRssCategory; priority: number; notifyEligible: boolean; ticker: string | null; direction: "POSITIVE" | "NEGATIVE" | "MIXED" | "NEUTRAL"; matchedTerms: string[]; financingAmountUsd: number | null; dilutionRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" };

const actionable = /fda|clinical trial|phase [123]|approval|contract|partnership|acquisition|merger|funding|offering|financing|raises? funds|launch|上장|인수|계약|임상|승인|자금 조달/i;
const transcript = /earnings call transcript|conference call transcript|quarterly results transcript/i;
const market = /market update|market commentary|stock market|index|etf|nasdaq composite|s\s*&\s*p 500|dow jones/i;
const ticker = /\(([A-Z]{1,5})\)/;
const stockTitanTicker = /\|\s*([A-Z]{1,5})\s+Stock\s+News\b/i;
const financing = /ATM|offering|registered direct|PIPE|convertible|warrant|financing|public offering/i;
const dilution = /ATM|offering|registered direct|PIPE|convertible|warrant/i;

function extractTicker(title: string, source: string) { return title.match(ticker)?.[1]?.toUpperCase() || (source === "STOCKTITAN" ? title.match(stockTitanTicker)?.[1]?.toUpperCase() || null : null); }
function amount(title: string) { const values = [...title.matchAll(/\$\s*([\d,.]+)\s*(million|billion|m|bn)?/gi)].map((match) => { const base = Number(match[1].replace(/,/g, "")); const unit = (match[2] || "").toLowerCase(); return base * (unit === "billion" || unit === "bn" ? 1e9 : unit === "million" || unit === "m" ? 1e6 : 1); }); return values.length ? Math.max(...values) : null; }

export function classifyMarketRssItem(item: Pick<MarketRssItem, "title" | "source">): MarketRssClassification {
  const title = item.title.trim();
  const symbol = extractTicker(title, item.source);
  const matchedTerms = ["FDA", "clinical trial", "approval", "contract", "partnership", "acquisition", "merger", "funding", "offering", "financing", "ATM", "convertible", "warrant", "launch"].filter((term) => new RegExp(term, "i").test(title));
  const base = { ticker: symbol, matchedTerms, financingAmountUsd: financing.test(title) ? amount(title) : null, dilutionRisk: dilution.test(title) ? "HIGH" as const : "UNKNOWN" as const };
  if (transcript.test(title)) return { ...base, category: "TRANSCRIPT", priority: 0, notifyEligible: false, direction: "NEUTRAL" };
  if (financing.test(title)) return { ...base, category: "FINANCING", priority: 100, notifyEligible: true, direction: "MIXED" };
  if (actionable.test(title)) return { ...base, category: "ACTIONABLE", priority: 100, notifyEligible: true, direction: "POSITIVE" };
  if (market.test(title) && !symbol) return { ...base, category: "MARKET", priority: 10, notifyEligible: false, direction: "NEUTRAL" };
  return { ...base, category: "GENERAL", priority: symbol ? 50 : 20, notifyEligible: Boolean(symbol), direction: "NEUTRAL" };
}
