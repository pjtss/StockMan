export function parseBoundedIntegerSetting(name, value, fallback, min, max) {
  if (value == null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`INVALID_INTEGER_SETTING:${name}`);
  return Math.min(max, Math.max(min, parsed));
}

/** Merge a provider page and return the number of previously unseen candle dates. */
export function mergeBackfillPage(candlesByDate, pageCandles) {
  let addedCount = 0;
  for (const candle of pageCandles) {
    const date = String(candle?.date ?? "");
    if (!candlesByDate.has(date)) addedCount += 1;
    candlesByDate.set(date, candle);
  }
  return addedCount;
}

export function getBackfillRunError(totalCount, failedCount) {
  if (totalCount === 0) return "US_DAILY_BACKFILL_EMPTY_UNIVERSE";
  if (failedCount > 0) return `US_DAILY_BACKFILL_PARTIAL_FAILURES:${failedCount}/${totalCount}`;
  return null;
}
