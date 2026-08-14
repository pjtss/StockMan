import type { UsDailyCandle } from "@/lib/kis-us-daily-price";
import { loadCachedUsDailyCandlesBulk } from "@/lib/us-daily-price-cache";
import { loadStoredUsInstrumentScopes, type StoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";

export type UsDailyScanContext = {
  universe: StoredUsInstrumentScopes;
  candles: Map<string, UsDailyCandle[]>;
  candleLimit: number;
  timeframe: "D" | "W" | "M";
  timings: {
    universeMs: number;
    candlesMs: number;
    totalMs: number;
  };
};

/**
 * Loads the shared DB-backed universe and daily candle series once for a
 * multi-indicator run. Individual scanners can still be called without a
 * context; they create their own context-compatible cache path in that case.
 */
export async function createUsDailyScanContext(options: { candleLimit?: number; timeframe?: "D" | "W" | "M" } = {}): Promise<UsDailyScanContext> {
  const startedAt = performance.now();
  const universeStartedAt = performance.now();
  const universe = await loadStoredUsInstrumentScopes();
  const universeMs = Math.round(performance.now() - universeStartedAt);
  const candleLimit = Math.max(35, Math.floor(options.candleLimit ?? 100));
  const timeframe = options.timeframe ?? "D";
  const candlesStartedAt = performance.now();
  const candles = await loadCachedUsDailyCandlesBulk(universe.scopes, candleLimit, timeframe).catch(() => new Map<string, UsDailyCandle[]>());
  const candlesMs = Math.round(performance.now() - candlesStartedAt);
  return {
    universe,
    candles,
    candleLimit,
    timeframe,
    timings: { universeMs, candlesMs, totalMs: Math.round(performance.now() - startedAt) },
  };
}
