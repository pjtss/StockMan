/**
 * KIS overseas price-detail schema: `tomv` is market cap; `mcap` is paid-in
 * capital. Do not borrow `mcap` semantics from a different ranking endpoint.
 */
export function calculateKisUsMarketCap(detail: Record<string, unknown>): number | null {
  return parsePositiveNumber(detail.tomv);
}

function parsePositiveNumber(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
