import { createUsDailyScanContext, type UsDailyScanContext } from "@/lib/us-daily-scan-context";
import { latestMacd } from "@/lib/us-macd";
import { summarizeUsDailyScanFailures } from "@/lib/us-daily-scan-failure-reasons";

export async function scanStoredUsMacd(options: { fast?: number; slow?: number; signal?: number; concurrency?: number; context?: UsDailyScanContext } = {}) {
  const fast = options.fast ?? 12, slow = options.slow ?? 26, signal = options.signal ?? 9;
  const context = options.context ?? await createUsDailyScanContext({ candleLimit: slow + signal });
  const universe = context.universe;
  const instruments = universe.scopes, results: any[] = [];
  const requiredCandles = slow + signal;
  const cachedCandles = context.candles;
  const getDaily = (item: (typeof instruments)[number]) => {
    const cached = cachedCandles.get(`${item.market}:${item.code}`) ?? [];
    return cached && cached.length >= requiredCandles
      ? Promise.resolve({ ok: true, status: 200, candles: cached, diagnostics: { source: "DB_CACHE_BULK", parsedCandleCount: cached.length } })
      : Promise.resolve({ ok: false, status: 200, candles: cached ?? [], response: { rawText: "", parsed: null }, diagnostics: { source: "DB_CACHE_ONLY", cacheLookup: "AVAILABLE", parsedCandleCount: cached?.length ?? 0 } });
  };
  let cursor = 0;
  async function worker() { while (cursor < instruments.length) {
    const item = instruments[cursor++];
    try {
      const daily = await getDaily(item);
      const macd = daily?.ok ? latestMacd(daily.candles, fast, slow, signal) : null;
      const macdIsFinite = Boolean(macd && [macd.macd, macd.signal, macd.histogram].every(Number.isFinite));
      const qualifies = Boolean(macdIsFinite && macd && macd.macd > macd.signal && macd.histogram > 0 && (macd.goldenCross || macd.histogramIncreasing));
      const candleCount = daily?.candles.length ?? 0;
      results.push({ market: item.market, code: item.code, name: item.name, macd: macdIsFinite ? macd?.macd ?? null : null, signal: macdIsFinite ? macd?.signal ?? null : null, histogram: macdIsFinite ? macd?.histogram ?? null : null, goldenCross: macd?.goldenCross ?? false, deathCross: macd?.deathCross ?? false, histogramIncreasing: macd?.histogramIncreasing ?? false, bullish: qualifies, qualifies, qualificationRule: "MACD > Signal, histogram > 0, and golden cross or histogram increasing", candleCount, dailyDiagnostics: daily?.diagnostics ?? null, rawText: (daily as any)?.response?.rawText || undefined, error: macdIsFinite ? undefined : macd ? "MACD calculation returned non-finite value" : candleCount === 0 ? "no cached daily candles" : !daily?.ok ? `insufficient daily candles (${candleCount}/${requiredCandles})` : "insufficient parsed candles for MACD" });
    } catch (error) { results.push({ market: item.market, code: item.code, name: item.name, macd: null, signal: null, histogram: null, goldenCross: false, deathCross: false, bullish: false, candleCount: 0, error: error instanceof Error ? error.message : String(error) }); }
  } }
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, Math.max(1, instruments.length)) }, worker));
  results.sort((a, b) => (b.histogram ?? -Infinity) - (a.histogram ?? -Infinity));
  const succeeded = (item: (typeof results)[number]) => typeof item.macd === "number" && Number.isFinite(item.macd) && typeof item.signal === "number" && Number.isFinite(item.signal) && typeof item.histogram === "number" && Number.isFinite(item.histogram);
  const failureReasons = summarizeUsDailyScanFailures(results.filter((item) => !succeeded(item)));
  return { universeAvailable: Boolean((universe.universe as any).ok), universe: universe.universe, fast, slow, signal, instrumentCount: instruments.length, successCount: results.filter(succeeded).length, failureCount: results.filter((item) => !succeeded(item)).length, failureReasons, qualified: results.filter((item) => item.bullish), results };
}
