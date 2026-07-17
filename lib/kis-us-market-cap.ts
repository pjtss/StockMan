/** Calculates the current market capitalization from a KIS price-detail output. */
export function calculateKisUsMarketCap(detail: Record<string, unknown>): number | null {
  const last = parsePositiveNumber(detail.last ?? detail.lastprice);
  const shares = parsePositiveNumber(detail.shar);
  if (last === null || shares === null) return null;
  return last * shares;
}

function parsePositiveNumber(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
