/** Fills every empty/missing or target-date-stale bulk result from the single-code chart endpoint. */
export async function fillMissingDailyCandleItems(options) {
  const byCode = new Map();
  const hasTargetDate = (item) => !options.targetDate || item.candles?.some((candle) =>
    String(candle.date).replaceAll("-", "") === String(options.targetDate).replaceAll("-", ""));
  for (const item of options.items) {
    if (Array.isArray(item.candles) && item.candles.length > 0) {
      byCode.set(item.code, {
        code: item.code,
        candles: item.candles.map((candle) => ({ ...candle, source: item.source ?? "OPERATING_DB_CACHE" })),
        source: item.source,
      });
    }
  }

  const missing = options.codes.filter((code) => !byCode.has(code) || !hasTargetDate(byCode.get(code)));
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, Math.floor(options.concurrency) || 1), missing.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const code = missing[cursor++];
      if (code === undefined) return;
      try {
        const result = await options.fetchChart(code);
        if (!Array.isArray(result?.candles) || result.candles.length === 0) throw new Error("empty chart candles");
        const previous = byCode.get(code);
        byCode.set(code, {
          code,
          candles: [
            ...(previous?.candles ?? []),
            ...result.candles.map((candle) => ({ ...candle, source: "OPERATING_CHART_API" })),
          ],
          source: "OPERATING_CHART_API",
        });
      } catch (error) {
        options.onFailure?.(code, error);
      }
    }
  });
  await Promise.all(workers);

  const failedCodes = options.codes.filter((code) => !byCode.has(code) || !hasTargetDate(byCode.get(code)));
  for (const code of failedCodes) {
    if (byCode.has(code)) options.onFailure?.(code, new Error(`chart and bulk data have no candle for ${options.targetDate}`));
  }
  return {
    items: options.codes.flatMap((code) => {
      const item = byCode.get(code);
      return item ? [item] : [];
    }),
    requestedFallbackCount: missing.length,
    failedCodes,
  };
}
