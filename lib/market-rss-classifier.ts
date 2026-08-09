import type { MarketRssItem } from "./market-rss";

export type MarketRssCategory = "FINANCING" | "ACTIONABLE" | "TRANSCRIPT" | "MARKET" | "GENERAL";
export type MarketRssClassification = { category: MarketRssCategory; priority: number; notifyEligible: boolean; ticker: string | null; direction: "POSITIVE" | "NEGATIVE" | "MIXED" | "NEUTRAL"; matchedTerms: string[]; financingAmountUsd: number | null; dilutionRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" };

const actionable = /\bfda\b|clinical trial|phase [123]|\bapproval\b|\bcontract\b|\bpartnership\b|\bacquir(?:es?|ed)\b|acquisition\s+(?:of|agreement|completed|announced|to)|merger(?:\s+with| agreement)|\bfunding\b|\boffering\b|\bfinancing\b|raises? funds|\blaunch(?:es|ed)?\b|material definitive agreement|business combination|상장|인수|계약|임상|승인|자금 조달/i;
const transcript = /earnings call transcript|conference call transcript|quarterly results transcript/i;
const market = /market update|market commentary|stock market|index|etf|nasdaq composite|s\s*&\s*p 500|dow jones/i;
const ticker = /\(([A-Z]{1,5})\)/;
const stockTitanTicker = /\|\s*([A-Z]{1,5})\s+Stock\s+News\b/i;
const financing = /\batm\b|\boffering\b|registered direct|\bpipe\b|convertible|\bwarrants?\b|\bfinancing\b|public offering/i;
const dilution = /\batm\b|\boffering\b|registered direct|\bpipe\b|convertible|\bwarrants?\b/i;

function extractTicker(title: string, source: string) {
  // StockTitan puts the canonical symbol after the pipe.  Prefer it over
  // parenthesized abbreviations such as "(BLA)" in a clinical headline.
  if (source === "STOCKTITAN") return title.match(stockTitanTicker)?.[1]?.toUpperCase() || title.match(ticker)?.[1]?.toUpperCase() || null;
  return title.match(ticker)?.[1]?.toUpperCase() || null;
}
function amount(title: string) { const values = [...title.matchAll(/\$\s*([\d,.]+)\s*(million|billion|m|bn)?/gi)].map((match) => { const base = Number(match[1].replace(/,/g, "")); const unit = (match[2] || "").toLowerCase(); return base * (unit === "billion" || unit === "bn" ? 1e9 : unit === "million" || unit === "m" ? 1e6 : 1); }); return values.length ? Math.max(...values) : null; }

function stripMarkup(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&(?:lt|gt|amp|quot|#39|#x27|#160);/gi, " ").replace(/\s+/g, " ").trim();
}

type ClassifiableMarketRssItem = Pick<MarketRssItem, "title" | "source"> & { summary?: string | null };

function classificationText(item: ClassifiableMarketRssItem) {
  // SEC Atom titles contain the issuer's legal name (for example,
  // "Kensington Capital Acquisition Corp.").  Legal-name words must not be
  // treated as a market event; SEC item descriptions are the event signal.
  if (item.source === "SEC_EDGAR") {
    const form = item.title.match(/^(?:\s*)(8-K|10-K|10-Q|20-F|6-K|4|5|3|SCHEDULE\s+13[DG](?:\/A)?)\b/i)?.[1] || "";
    return stripMarkup(`${form} ${item.summary || ""}`);
  }
  return stripMarkup(`${item.title} ${item.summary || ""}`);
}

export function classifyMarketRssItem(item: ClassifiableMarketRssItem): MarketRssClassification {
  const title = item.title.trim();
  const text = classificationText(item);
  const symbol = extractTicker(title, item.source);
  const termPatterns: Record<string, RegExp> = {
    FDA: /\bfda\b/i,
    "clinical trial": /clinical trial/i,
    approval: /\bapproval\b/i,
    contract: /\bcontract\b/i,
    partnership: /\bpartnership\b/i,
    acquisition: /acquir(?:es?|ed)|acquisition\s+(?:of|agreement|completed|announced|to)/i,
    merger: /merger(?:\s+with| agreement)/i,
    funding: /\bfunding\b/i,
    offering: /\boffering\b/i,
    financing: /\bfinancing\b/i,
    ATM: /\batm\b/i,
    convertible: /\bconvertible\b/i,
    warrant: /\bwarrants?\b/i,
    launch: /\blaunch(?:es|ed)?\b/i,
    "material definitive agreement": /material definitive agreement/i,
    "business combination": /business combination/i,
  };
  const matchedTerms = Object.keys(termPatterns).filter((term) => {
    if (term === "acquisition") return /acquir(?:es?|ed)|acquisition\s+(?:of|agreement|completed|announced|to)/i.test(text);
    if (term === "merger") return /merger(?:\s+with| agreement)/i.test(text);
    return termPatterns[term].test(text);
  });
  const base = { ticker: symbol, matchedTerms, financingAmountUsd: financing.test(text) ? amount(text) : null, dilutionRisk: dilution.test(text) ? "HIGH" as const : "UNKNOWN" as const };
  if (transcript.test(text)) return { ...base, category: "TRANSCRIPT", priority: 0, notifyEligible: false, direction: "NEUTRAL" };
  if (financing.test(text)) return { ...base, category: "FINANCING", priority: 100, notifyEligible: true, direction: "MIXED" };
  if (actionable.test(text)) return { ...base, category: "ACTIONABLE", priority: 100, notifyEligible: true, direction: "POSITIVE" };
  if (market.test(text) && !symbol) return { ...base, category: "MARKET", priority: 10, notifyEligible: false, direction: "NEUTRAL" };
  // SEC generic filings are handled by the SEC event/body pipeline.  Do not
  // notify merely because a CIK-to-ticker mapping exists.
  return { ...base, category: "GENERAL", priority: 20, notifyEligible: false, direction: "NEUTRAL" };
}
