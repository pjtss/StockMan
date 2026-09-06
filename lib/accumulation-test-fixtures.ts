import type { AccumulationCandle } from "./accumulation-screener-core";
import type { AccumulationInstrument } from "./accumulation-scan";

/** Deterministic synthetic data used only by detector tests. */
export function accumulationCandles(count = 65): AccumulationCandle[] {
  const date = new Date("2026-06-01T00:00:00Z"), candles: AccumulationCandle[] = [];
  while (candles.length < count) {
    if (![0, 6].includes(date.getUTCDay())) {
      const i = candles.length, close = 100 + i * 0.2;
      candles.push({ date: date.toISOString().slice(0, 10).replaceAll("-", ""),
        tradingAt: null, updatedAt: "2026-09-05T00:00:00.000Z",
        open: close - 0.1, high: close + 0.4, low: close - 1, close,
        volume: i === count - 1 ? 600 : i >= count - 5 ? 200 : 100 });
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return candles;
}
export function accumulationInstrument(code = "AAA", market = "NAS"): AccumulationInstrument {
  return { market, code, name: "테스트 " + code, marketCap: 40000000000, sharesOutstanding: null,
    fundamentalUpdatedAt: null, candles: accumulationCandles() };
}
export const accumulationAsOf = new Date("2026-09-06T00:00:00Z");
