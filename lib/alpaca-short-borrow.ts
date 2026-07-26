export type BorrowStatus = "ETB" | "HTB" | "NOT_SHORTABLE" | "UNKNOWN";
export type QuoteStatus = "AVAILABLE" | "NOT_REQUIRED" | "UNAVAILABLE" | "ERROR";
export type PressureLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

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
}) {
  let score = 0;
  const reasons: string[] = [];
  if (!input.shortable) { score += 35; reasons.push("공매도 불가"); }
  if (input.borrowStatus === "HTB") { score += 20; reasons.push("HTB 종목"); }
  const qty = input.availableQtyChangePercent;
  if (qty !== null && qty <= -90) { score += 30; reasons.push("대차 가능 수량 90% 이상 감소"); }
  else if (qty !== null && qty <= -70) { score += 20; reasons.push("대차 가능 수량 70% 이상 감소"); }
  else if (qty !== null && qty <= -40) { score += 10; reasons.push("대차 가능 수량 40% 이상 감소"); }
  else if (qty !== null && qty <= -20) { score += 5; reasons.push("대차 가능 수량 20% 이상 감소"); }
  const fee = input.locateFeeRatePercent;
  if (fee !== null && fee >= 10) { score += 30; reasons.push("Locate 비용률 10% 이상"); }
  else if (fee !== null && fee >= 5) { score += 20; reasons.push("Locate 비용률 5% 이상"); }
  else if (fee !== null && fee >= 2) { score += 10; reasons.push("Locate 비용률 2% 이상"); }
  else if (fee !== null && fee >= 0.5) { score += 5; reasons.push("Locate 비용률 0.5% 이상"); }
  const priceChange = input.locatePriceChangePercent;
  if (priceChange !== null && priceChange >= 300) { score += 15; reasons.push("Locate 가격 300% 이상 상승"); }
  else if (priceChange !== null && priceChange >= 100) { score += 10; reasons.push("Locate 가격 100% 이상 상승"); }
  else if (priceChange !== null && priceChange >= 30) { score += 5; reasons.push("Locate 가격 30% 이상 상승"); }
  const bounded = Math.min(100, Math.max(0, score));
  return { pressureScore: bounded, pressureLevel: bounded >= 75 ? "EXTREME" : bounded >= 50 ? "HIGH" : bounded >= 25 ? "MEDIUM" : "LOW", reasons } as const;
}
