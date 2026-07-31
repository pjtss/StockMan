export type CandidateScoreInput = {
  changeRate?: number | null;
  turnoverRatio?: number | null;
  tradingValueRvol?: number | null;
  tradeIntensity?: number | null;
  obvRising?: boolean;
  shortInterestPercent?: number | null;
  daysToCover?: number | null;
  newsCatalyst?: boolean;
};

/** Explainable 0-100 score; missing metrics contribute zero rather than being fabricated. */
export function scoreCandidate(input: CandidateScoreInput) {
  let score = 0;
  const reasons: string[] = [];
  if ((input.changeRate ?? 0) > 0) { score += 15; reasons.push("positive_price_change"); }
  if ((input.turnoverRatio ?? 0) >= 1) { score += 20; reasons.push("turnover_ratio"); }
  if ((input.tradingValueRvol ?? 0) >= 2) { score += 20; reasons.push("rvol"); }
  if ((input.tradeIntensity ?? 0) >= 100) { score += 15; reasons.push("trade_intensity"); }
  if (input.obvRising) { score += 10; reasons.push("obv_rising"); }
  if ((input.shortInterestPercent ?? 0) >= 10) { score += 10; reasons.push("short_interest"); }
  if ((input.daysToCover ?? 0) >= 3) { score += 5; reasons.push("days_to_cover"); }
  if (input.newsCatalyst) { score += 5; reasons.push("news_catalyst"); }
  return { score: Math.min(100, score), reasons };
}
