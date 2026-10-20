/** Fills every empty/missing bulk result from the single-code chart endpoint. */
export async function fillMissingDailyCandleItems(options) {
  const byCode = new Map();
  for (const item of options.items) {
    if (Array.isArray(item.candles) && item.candles.length > 0) {
      byCode.set(item.code, { code: item.code, candles: item.candles });
    }
  }

  const missing = options.codes.filter((code) => !byCode.has(code));
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, Math.floor(options.concurrency) || 1), missing.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const code = missing[cursor++];
      if (code === undefined) return;
      try {
        const result = await options.fetchChart(code);
        if (!Array.isArray(result?.candles) || result.candles.length === 0) {
          throw new Error("empty chart candles");
        }
        byCode.set(code, { code, candles: result.candles });
      } catch (error) {
        options.onFailure?.(code, error);
      }
    }
  });
  await Promise.all(workers);

  return {
    items: options.codes.flatMap((code) => {
      const item = byCode.get(code);
      return item ? [item] : [];
    }),
    requestedFallbackCount: missing.length,
    failedCodes: options.codes.filter((code) => !byCode.has(code)),
  };
}
