import { type UsDailyCandle } from "@/lib/kis-us-daily-price";
import { createUsDailyScanContext, type UsDailyScanContext } from "@/lib/us-daily-scan-context";
import { getUsDailyObvSignalPolicy } from "@/lib/automation-settings";
import { analyzeUsObvSignal, calculateUsObvSeries } from "@/lib/us-obv-signal";
import { excludeCurrentUsMarketCandle } from "@/lib/us-market-date";

export async function scanStoredUsDailyObv(options: { lookback?: number; signalPeriod?: number; signalAboveDays?: number; signalCrossLookback?: number; concurrency?: number; context?: UsDailyScanContext } = {}) {
  const lookback = Math.max(3, Math.floor(options.lookback ?? 5));
  const configuredPolicy = await getUsDailyObvSignalPolicy();
  const signalPeriod = Math.max(2, Math.floor(options.signalPeriod ?? configuredPolicy.signalPeriod));
  const signalAboveDays = Math.max(1, Math.floor(options.signalAboveDays ?? configuredPolicy.aboveDays));
  const signalCrossLookback = Math.max(1, Math.floor(options.signalCrossLookback ?? configuredPolicy.crossLookback));
  const context = options.context ?? await createUsDailyScanContext({ candleLimit: lookback * 2 + 1 });
  const universe = context.universe;
  const instruments = universe.scopes;
  const cachedCandles = context.candles;
  const results: any[] = [];
  let cursor = 0;
  const worker = async () => { while (cursor < instruments.length) {
    const item = instruments[cursor++];
    try {
      const prefetched = excludeCurrentUsMarketCandle(cachedCandles.get(`${item.market}:${item.code}`) ?? []);
      const daily = prefetched && prefetched.length >= lookback * 2 + 1 ? { ok: true, status: 200, candles: prefetched, response: { rawText: "", parsed: null }, diagnostics: { source: "DB_CACHE_BULK", parsedCandleCount: prefetched.length } } : { ok: false, status: 0, candles: prefetched ?? [], response: { rawText: "", parsed: null }, diagnostics: { source: "DB_CACHE_ONLY", parsedCandleCount: prefetched?.length ?? 0 } };
      const candles = daily?.candles ?? [];
      if (!daily?.ok || candles.length < lookback * 2 + 1) { results.push({ market: item.market, code: item.code, name: item.name, candleCount: candles.length, obv: null, recentObv: null, priorObv: null, change: null, obvSignal: null, signalGap: null, aboveSignalDays: 0, signalAbove: false, signalCrossedRecently: false, rising: false, error: !daily ? "KIS access token unavailable" : !daily.ok ? `KIS daily API failed (${daily.status})` : `insufficient parsed candles (${candles.length}/${lookback * 2 + 1})`, dailyDiagnostics: daily?.diagnostics ?? null }); continue; }
      const ordered = [...candles].sort((a, b) => a.date.localeCompare(b.date));
      const recent = ordered.slice(-lookback);
      const obvSeries = calculateUsObvSeries(ordered);
      const signal = analyzeUsObvSignal(ordered, { signalPeriod, consecutiveDays: signalAboveDays, crossoverLookback: signalCrossLookback });
      const recentStartIndex = Math.max(0, obvSeries.length - lookback);
      const recentObv = obvSeries.at(-1)?.obv ?? null;
      const priorObv = obvSeries[recentStartIndex - 1]?.obv ?? null;
      const change = recentObv !== null && priorObv !== null ? recentObv - priorObv : null;
      const risingBars = recent.slice(1).filter((candle, i) => candle.close > recent[i].close).length;
      const risingBarRate = risingBars / Math.max(1, recent.length - 1);
      const rising = change !== null && change > 0 && signal.aboveSignal && signal.crossedRecently;
      results.push({
        market: item.market,
        code: item.code,
        name: item.name,
        candleCount: ordered.length,
        obv: signal.latestObv,
        recentObv,
        priorObv,
        change,
        risingBars,
        risingBarRate,
        obvSignal: signal.latestSignal,
        signalPeriod,
        signalAboveDays,
        signalCrossLookback,
        aboveSignalDays: signal.aboveSignalDays,
        signalAbove: signal.aboveSignal,
        signalCrossedRecently: signal.crossedRecently,
        signalCrossoverDate: signal.crossoverDate,
        signalGap: signal.signalGap,
        signalGapIncreasing: signal.signalGapIncreasing,
        lastClose: ordered.at(-1)?.close ?? null,
        date: ordered.at(-1)?.date ?? null,
        rising,
        dailyDiagnostics: daily.diagnostics,
        rawText: daily.response.rawText || undefined,
      });
    } catch (error) { results.push({ market: item.market, code: item.code, name: item.name, candleCount: 0, rising: false, error: error instanceof Error ? error.message : String(error) }); }
  } };
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 1, Math.max(1, instruments.length)) }, worker));
  results.sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
  return { universeAvailable: Boolean((universe.universe as any).ok), universe: universe.universe, lookback, signalPeriod, signalAboveDays, signalCrossLookback, qualification: "recent OBV > previous OBV AND OBV is above EMA signal for the configured consecutive days AND a recent golden cross occurred", instrumentCount: instruments.length, successCount: results.filter((x) => x.change !== undefined && x.change !== null).length, failureCount: results.filter((x) => x.change === undefined || x.change === null).length, qualified: results.filter((x) => x.rising), results };
}
