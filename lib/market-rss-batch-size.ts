const MAX_MARKET_RSS_BATCH_SIZE = 1_000;

export function getMarketRssBatchSize(value: string | undefined, fallback: number, maximum = MAX_MARKET_RSS_BATCH_SIZE) {
  const configured = value?.trim();
  if (!configured || !/^\d+$/.test(configured)) return fallback;
  const parsed = Number(configured);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum, MAX_MARKET_RSS_BATCH_SIZE);
}
