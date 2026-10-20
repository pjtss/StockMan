export type TurnoverPoint = { price: number; volume?: number; cumulativeTradingValue?: number | null };
export type MinuteTradingValueSource = "KIS_CUMULATIVE_DELTA" | "PRICE_VOLUME_FALLBACK";

/** Reject missing/invalid provider points before deriving or persisting turnover. */
export function filterValidIntradayPoints<T extends { price?: unknown; volume?: unknown }>(points: T[]) {
  return points.filter((point) => Number(point.price) > 0 && Number(point.volume ?? 0) >= 0);
}

export function isSuccessfulMinuteQuoteResponse(response: { ok?: boolean } | null | undefined) {
  return response?.ok === true;
}

/**
 * Prefer the provider's cumulative traded-value field.  A delta is valid only
 * when both snapshots are from the same session and the cumulative counter did
 * not reset.  The price*volume fallback remains explicit for providers/rows
 * without a usable cumulative value.
 */
export function minuteTradingValue(point: TurnoverPoint, previous?: TurnoverPoint) {
  const current = point.cumulativeTradingValue;
  const prior = previous?.cumulativeTradingValue;
  if (Number.isFinite(current) && Number.isFinite(prior) && Number(current) >= Number(prior)) {
    return { value: Number(current) - Number(prior), source: "KIS_CUMULATIVE_DELTA" as const };
  }
  const value = Number(point.price) * Number(point.volume ?? 0);
  return { value: Number.isFinite(value) && value >= 0 ? value : 0, source: "PRICE_VOLUME_FALLBACK" as const };
}
