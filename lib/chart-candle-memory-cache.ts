import type { OHLCVCandle } from "@/lib/kis-chart";

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 128;

type CandleSnapshot = { candles: OHLCVCandle[]; updatedAt: string | null; expiresAt: number };
const snapshots = new Map<string, CandleSnapshot>();

export function chartCandleMemoryKey(input: { market: string; code: string; exchange?: string | null; timeframe: string }) {
  return [input.market.trim().toUpperCase(), input.exchange?.trim().toUpperCase() || "*", input.code.replace(/^US:/i, "").trim().toUpperCase(), input.timeframe.trim().toUpperCase()].join(":");
}

/** Caches raw OHLCV candles only. Indicators are rebuilt for every response. */
export function getChartCandleMemory(key: string, now = Date.now()): { candles: OHLCVCandle[]; updatedAt: string | null } | null {
  const value = snapshots.get(key);
  if (!value) return null;
  if (value.expiresAt <= now) {
    snapshots.delete(key);
    return null;
  }
  snapshots.delete(key);
  snapshots.set(key, value);
  return { candles: value.candles.map((candle) => ({ ...candle })), updatedAt: value.updatedAt };
}

export function setChartCandleMemory(key: string, candles: OHLCVCandle[], updatedAt: string | null, now = Date.now(), ttlMs = DEFAULT_TTL_MS) {
  const normalized = candles
    .filter((candle) => /^\d{8}$/.test(candle.date) && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite))
    .map((candle) => ({
      date: candle.date,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      ...(candle.tradingValue == null ? {} : { tradingValue: candle.tradingValue }),
    }));
  if (!normalized.length || ttlMs <= 0) return;
  snapshots.delete(key);
  snapshots.set(key, { candles: normalized, updatedAt, expiresAt: now + ttlMs });
  while (snapshots.size > MAX_ENTRIES) snapshots.delete(snapshots.keys().next().value!);
}

export function clearChartCandleMemory() {
  snapshots.clear();
}
