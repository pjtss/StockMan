export type MarketRssGrade = "high" | "medium" | "low" | "excluded";

export function getMarketRssGrade(article: { priority: number; notifyEligible: boolean }): MarketRssGrade {
  if (!article.notifyEligible) return "excluded";
  if (article.priority >= 100) return "high";
  if (article.priority >= 50) return "medium";
  return "low";
}

export const MARKET_RSS_GRADE_LABELS: Record<MarketRssGrade, string> = {
  high: "고등급 호재",
  medium: "중등급 호재",
  low: "저등급 호재",
  excluded: "알림 제외",
};

export function isMarketRssGrade(value: string | null | undefined): value is MarketRssGrade {
  return value === "high" || value === "medium" || value === "low" || value === "excluded";
}
