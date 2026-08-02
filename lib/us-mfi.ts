export type MfiCandle = { date: string; high: number; low: number; close: number; volume: number };

export type MfiPoint = { date: string; value: number };

/** Calculates Money Flow Index from ascending daily candles. */
export function calculateMfi(candles: MfiCandle[], period = 14): MfiPoint[] {
  if (!Number.isInteger(period) || period <= 0) throw new Error("MFI period must be a positive integer");
  const ordered = [...candles].filter((c) => c.high > 0 && c.low > 0 && c.close > 0 && c.volume >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const typical = ordered.map((c) => (c.high + c.low + c.close) / 3);
  const raw = ordered.map((c, i) => {
    const flow = typical[i] * c.volume;
    if (i === 0) return { positive: 0, negative: 0 };
    return typical[i] >= typical[i - 1] ? { positive: flow, negative: 0 } : { positive: 0, negative: flow };
  });
  return ordered.map((c, i) => {
    if (i < period) return { date: c.date, value: 50 };
    const window = raw.slice(i - period + 1, i + 1);
    const positive = window.reduce((sum, item) => sum + item.positive, 0);
    const negative = window.reduce((sum, item) => sum + item.negative, 0);
    const value = negative === 0 ? 100 : positive === 0 ? 0 : 100 - (100 / (1 + positive / negative));
    return { date: c.date, value: Number(value.toFixed(4)) };
  });
}

export function latestMfi(candles: MfiCandle[], period = 14) {
  const points = calculateMfi(candles, period);
  return points.at(-1) ?? null;
}
