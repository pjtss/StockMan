import type { MarketRssItem } from "./market-rss";

export type NewsSignalDirection = "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "UNKNOWN";
export type MarketNewsSignal = {
  direction: NewsSignalDirection;
  score: number;
  confidence: number;
  category: "CATALYST" | "RISK" | "SEC_8K" | "INSIDER" | "OWNERSHIP" | "FILING" | "EARNINGS" | "MARKET" | "GENERAL";
  tickers: string[];
  secItems: string[];
  evidence: string[];
  risks: string[];
};

type Rule = { pattern: RegExp; weight: number; evidence: string };

const positiveRules: Rule[] = [
  { pattern: /fda (approval|clears?|authori[sz]es?)/i, weight: 35, evidence: "FDA 승인/허가" },
  { pattern: /(phase [123].{0,30}(success|met|positive)|positive (clinical|trial) results)/i, weight: 35, evidence: "임상 긍정 결과" },
  { pattern: /(material definitive agreement|major contract|strategic partnership|definitive agreement)/i, weight: 30, evidence: "중요 계약/파트너십" },
  { pattern: /(acquire|acquisition|merger|takeover).{0,40}(company|agreement|approved)?/i, weight: 25, evidence: "인수·합병" },
  { pattern: /(raises?|raised|secures?)\s+\$?[\d,.]+\s*(million|billion|m|b)/i, weight: 18, evidence: "자금 유치" },
  { pattern: /(launches?| receives? approval|grants? approval|wins? contract|record revenue|raises? guidance)/i, weight: 22, evidence: "사업 호재 표현" },
];
const negativeRules: Rule[] = [
  { pattern: /(fda (rejects?|denies?|refuses?)|clinical trial (fails?|halted)|negative (clinical|trial) results)/i, weight: 40, evidence: "FDA/임상 부정 결과" },
  { pattern: /(public offering|registered direct offering|at[- ]the[- ]market offering|convertible notes?)/i, weight: 30, evidence: "희석성 자금조달" },
  { pattern: /(bankrupt|bankruptcy|going concern|delist|delisting|default|restructur)/i, weight: 35, evidence: "재무·상장 위험" },
  { pattern: /(lawsuit|litigation|recall|investigation|subpoena|resigns? as ceo)/i, weight: 25, evidence: "법적·경영 위험" },
  { pattern: /(debt|loan|financial obligation|loss widens?)/i, weight: 16, evidence: "부채·실적 위험" },
];
const tickerPattern = /(?:\$([A-Z]{1,5})|\(([A-Z]{1,5})\))/g;
const secItemPattern = /\bItem\s+(\d+\.\d{2})\b/gi;

function matches(text: string, rules: Rule[]) { return rules.flatMap((rule) => rule.pattern.test(text) ? [rule] : []); }
function unique(values: string[]) { return [...new Set(values)]; }

export function analyzeMarketNews(item: Pick<MarketRssItem, "title" | "summary" | "source">): MarketNewsSignal {
  const text = `${item.title}\n${item.summary}`.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const positive = matches(text, positiveRules);
  const negative = matches(text, negativeRules);
  const secItems = unique([...text.matchAll(secItemPattern)].map((match) => `Item ${match[1]}`));
  const secPositive = secItems.includes("Item 1.01") ? 25 : 0;
  const secNegative = (secItems.includes("Item 1.02") ? 30 : 0) + (secItems.includes("Item 2.03") ? 15 : 0) + (secItems.includes("Item 3.02") ? 35 : 0);
  const positiveScore = positive.reduce((sum, rule) => sum + rule.weight, 0) + secPositive;
  const negativeScore = negative.reduce((sum, rule) => sum + rule.weight, 0) + secNegative;
  const score = Math.max(-100, Math.min(100, positiveScore - negativeScore));
  const is8K = /\b8-K\b|FORM 8-K/i.test(text);
  const isInsider = /^(?:4|FORM 4)\s[-–—]/i.test(item.title.trim()) || /\bFORM 4\b/i.test(text);
  const isOwnership = /(?:SCHEDULE 13D|SCHEDULE 13G|\b13D\/A?\b|\b13G\/A?\b)/i.test(text);
  const tickers = unique([...text.matchAll(tickerPattern)].map((match) => match[1] || match[2]));
  const evidence = unique(positive.map((rule) => rule.evidence));
  const risks = unique(negative.map((rule) => rule.evidence));
  if (secItems.includes("Item 1.01")) evidence.push("SEC Item 1.01 중요 계약");
  if (secItems.includes("Item 8.01")) evidence.push("SEC Item 8.01 기타 중요 사건");
  if (secItems.includes("Item 1.02")) risks.push("SEC Item 1.02 중요 계약 종료");
  if (secItems.includes("Item 2.03")) risks.push("SEC Item 2.03 신규 채무");
  if (secItems.includes("Item 3.02")) risks.push("SEC Item 3.02 미등록 주식 발행/희석");
  const isTranscript = /earnings call transcript|conference call transcript/i.test(text);
  const isMarket = /market update|market commentary|index|etf|s&p 500|dow jones/i.test(text) && tickers.length === 0;
  const direction: NewsSignalDirection = score >= 25 ? "POSITIVE" : score <= -25 || (negativeScore >= 30 && negativeScore > positiveScore) ? "NEGATIVE" : positive.length || negative.length ? "NEUTRAL" : "UNKNOWN";
  const category = is8K || secItems.length ? "SEC_8K" : isInsider ? "INSIDER" : isOwnership ? "OWNERSHIP" : isTranscript ? "EARNINGS" : isMarket ? "MARKET" : direction === "POSITIVE" ? "CATALYST" : direction === "NEGATIVE" ? "RISK" : item.source === "SEC_EDGAR" ? "FILING" : "GENERAL";
  const confidence = Math.min(0.99, Math.max(0.2, 0.25 + (positive.length + negative.length) * 0.15 + (secItems.length ? 0.15 : 0) + (tickers.length ? 0.1 : 0)));
  return { direction, score, confidence: Number(confidence.toFixed(2)), category, tickers, secItems, evidence, risks };
}

export function analyzeMarketNewsItems(items: MarketRssItem[]) {
  return items.map((item) => ({ item, signal: analyzeMarketNews(item) }));
}
