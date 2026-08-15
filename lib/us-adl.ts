import { createUsDailyScanContext, type UsDailyScanContext } from "@/lib/us-daily-scan-context";

export type AdlPoint = {
  date: string;
  close: number;
  high: number;
  low: number;
  volume: number;
  moneyFlowMultiplier: number;
  moneyFlowVolume: number;
  adl: number;
};

/** Accumulation/Distribution Line (Chaikin ADL) from OHLCV candles. */
export function calculateAdlSeries(candles: Array<{ date: string; high: number; low: number; close: number; volume: number }>): AdlPoint[] {
  let adl = 0;
  return [...candles].sort((a, b) => a.date.localeCompare(b.date)).flatMap((candle) => {
    const high = Number(candle.high), low = Number(candle.low), close = Number(candle.close), volume = Number(candle.volume);
    if (![high, low, close, volume].every(Number.isFinite) || high < low || volume < 0) return [];
    const multiplier = high === low ? 0 : ((close - low) - (high - close)) / (high - low);
    const moneyFlowVolume = multiplier * volume;
    adl += moneyFlowVolume;
    return [{ date: candle.date, high, low, close, volume, moneyFlowMultiplier: multiplier, moneyFlowVolume, adl }];
  });
}

export async function scanStoredUsDailyAdl(options: { lookback?: number; minDelta?: number; requireRising?: boolean; context?: UsDailyScanContext } = {}) {
  const lookback = Math.max(1, Math.floor(options.lookback ?? 1));
  const minDelta = Number.isFinite(options.minDelta) ? Number(options.minDelta) : 0;
  const requireRising = options.requireRising ?? true;
  const context = options.context ?? await createUsDailyScanContext({ candleLimit: 100 });
  const results: any[] = [];
  for (const item of context.universe.scopes) {
    const candles = context.candles.get(`${item.market}:${item.code}`) ?? [];
    const series = calculateAdlSeries(candles);
    const latest = series.at(-1), previous = series.at(-(lookback + 1));
    const delta = latest && previous ? latest.adl - previous.adl : null;
    const qualifies = delta !== null && delta >= minDelta && (!requireRising || delta > 0);
    results.push({ market: item.market, code: item.code, name: item.name, candleCount: series.length, latestCandleDate: latest?.date ?? null, adl: latest?.adl ?? null, previousAdl: previous?.adl ?? null, delta, moneyFlowMultiplier: latest?.moneyFlowMultiplier ?? null, moneyFlowVolume: latest?.moneyFlowVolume ?? null, lookback, minDelta, requireRising, qualifies, status: series.length < lookback + 1 ? "INSUFFICIENT_HISTORY" : qualifies ? "QUALIFIED" : "NOT_RISING", error: series.length < lookback + 1 ? `insufficient valid candles (${series.length}/${lookback + 1})` : undefined, dailyDiagnostics: { source: "DB_CACHE_ONLY", parsedCandleCount: series.length } });
  }
  results.sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity));
  return { universeAvailable: Boolean((context.universe.universe as any).ok), universe: context.universe.universe, policy: { lookback, minDelta, requireRising }, dataPolicy: "DB 저장 일봉 OHLCV만 사용; Accumulation/Distribution Line", instrumentCount: results.length, successCount: results.filter((x) => x.delta !== null).length, failureCount: results.filter((x) => x.delta === null).length, qualified: results.filter((x) => x.qualifies), qualifiedCount: results.filter((x) => x.qualifies).length, results };
}
