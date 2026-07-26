export type BorrowStatus = "ETB" | "HTB" | "NOT_SHORTABLE" | "UNKNOWN";
export type QuoteStatus = "AVAILABLE" | "NOT_REQUIRED" | "UNAVAILABLE" | "ERROR";
export type PressureLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
import { DEFAULT_SHORT_BORROW_POLICY, type ShortBorrowScorePolicy } from "./short-borrow-policy";

export type ShortBorrowResult = {
  symbol: string;
  tradable: boolean;
  shortable: boolean;
  borrowStatus: BorrowStatus;
  quoteStatus: QuoteStatus;
  availableQty: number | null;
  locatePricePerShare: number | null;
  currentPrice: number | null;
  locateFeeRatePercent: number | null;
  previousAvailableQty: number | null;
  availableQtyChange: number | null;
  availableQtyChangePercent: number | null;
  previousLocatePricePerShare: number | null;
  locatePriceChangePercent: number | null;
  pressureScore: number;
  pressureLevel: PressureLevel;
  reasons: string[];
  quotedAt: string | null;
  fetchedAt: string;
  source: "ALPACA";
  scope: "ALPACA_ACCOUNT_SPECIFIC";
  requestedQty?: number;
  estimatedLocateFee?: number | null;
};

export const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,15}$/;

export function normalizeAlpacaSymbol(value: string) {
  const symbol = value.trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) throw new Error("SYMBOL_INVALID");
  return symbol;
}

export function calculatePercent(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function scoreShortPressure(input: {
  shortable: boolean;
  borrowStatus: BorrowStatus;
  availableQtyChangePercent: number | null;
  locateFeeRatePercent: number | null;
  locatePriceChangePercent: number | null;
}, policy: ShortBorrowScorePolicy = DEFAULT_SHORT_BORROW_POLICY) {
  let score = 0;
  const reasons: string[] = [];
  if (!input.shortable) { score += policy.notShortablePoints; reasons.push("공매도 불가"); }
  if (input.borrowStatus === "HTB") { score += policy.htbPoints; reasons.push("HTB 종목"); }
  const qty = input.availableQtyChangePercent;
  const qtyTier = policy.quantityDropTiers.find((tier) => qty !== null && qty <= tier.threshold);
  if (qtyTier) { score += qtyTier.points; reasons.push(`대차 가능 수량 ${Math.abs(qtyTier.threshold)}% 이상 감소`); }
  const fee = input.locateFeeRatePercent;
  const feeTier = policy.feeTiers.find((tier) => fee !== null && fee >= tier.threshold);
  if (feeTier) { score += feeTier.points; reasons.push(`Locate 비용률 ${feeTier.threshold}% 이상`); }
  const priceChange = input.locatePriceChangePercent;
  const priceTier = policy.locatePriceTiers.find((tier) => priceChange !== null && priceChange >= tier.threshold);
  if (priceTier) { score += priceTier.points; reasons.push(`Locate 가격 ${priceTier.threshold}% 이상 상승`); }
  const bounded = Math.min(100, Math.max(0, score));
  return { pressureScore: bounded, pressureLevel: bounded >= policy.extremeLevelScore ? "EXTREME" : bounded >= policy.highLevelScore ? "HIGH" : bounded >= 25 ? "MEDIUM" : "LOW", reasons } as const;
}
