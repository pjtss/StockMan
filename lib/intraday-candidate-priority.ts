import type { CandidateState } from "./intraday-memory-state";

export type IntradayMarket = "KRW" | "USD";
export type CandidateInput = {
  market: string;
  code: string;
  currency: IntradayMarket;
  marketCap: number | null;
  tradingValue: number | null;
  isTopRising: boolean;
  isNewEntry: boolean;
  rankChange: number;
  rateChange: number;
  volumeChange: number;
  aboveVwap: boolean;
  now?: number;
};

/** Calculates a same-currency turnover ratio. No FX conversion is allowed. */
export function calculateTurnoverToMarketCap(input: Pick<CandidateInput, "currency" | "marketCap" | "tradingValue">) {
  if ((input.currency !== "KRW" && input.currency !== "USD") || input.marketCap == null || input.tradingValue == null || input.marketCap <= 0 || input.tradingValue < 0) return null;
  return input.tradingValue / input.marketCap;
}

/** Scores and schedules only candidates with a valid same-currency ratio. */
export function scoreIntradayCandidate(input: CandidateInput): CandidateState & { currency: IntradayMarket; marketCap: number; tradingValue: number; turnoverToMarketCap: number; reasons: string[] } | null {
  const ratio = calculateTurnoverToMarketCap(input);
  if (ratio == null) return null;
  const marketCap = input.marketCap as number;
  const tradingValue = input.tradingValue as number;
  const reasons: string[] = [];
  let priority = 0;
  if (input.isTopRising) priority += 10;
  if (input.isNewEntry) { priority += 25; reasons.push("NEW_TOP_RISING_ENTRY"); }
  if (input.rankChange >= 20) { priority += 20; reasons.push("RANK_SURGE"); }
  if (input.rateChange > 0) { priority += 10; reasons.push("RATE_ACCELERATION"); }
  if (input.volumeChange > 0) { priority += 10; reasons.push("VOLUME_ACCELERATION"); }
  if (input.aboveVwap) { priority += 15; reasons.push("ABOVE_VWAP"); }
  if (ratio >= 0.05) { priority += 40; reasons.push("TURNOVER_TO_MARKET_CAP_5PCT"); }
  else if (ratio >= 0.01) { priority += 20; reasons.push("TURNOVER_TO_MARKET_CAP_1PCT"); }
  const now = input.now ?? Date.now();
  return { market: input.market, code: input.code, priority, lastSeenAt: now, lastCheckedAt: 0, nextCheckAt: now, consecutiveFailures: 0, currency: input.currency, marketCap, tradingValue, turnoverToMarketCap: ratio, reasons };
}
