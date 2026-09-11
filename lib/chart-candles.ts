import type { OHLCVCandle } from "./kis-chart";

/** 차트 라이브러리에 전달하기 전 봉의 유효성·순서를 정규화한다. */
export function normalizeOHLCVCandles(candles: OHLCVCandle[]): OHLCVCandle[] {
  return Array.from(
    new Map(
      candles
        .filter((candle) =>
          /^\d{8}$/.test(candle.date) &&
          [candle.open, candle.high, candle.low, candle.close, candle.volume].every((value) => Number.isFinite(Number(value))) &&
          Number(candle.open) >= 0 && Number(candle.high) >= 0 && Number(candle.low) >= 0 && Number(candle.close) >= 0 && Number(candle.volume) >= 0 &&
          Number(candle.high) >= Math.max(Number(candle.open), Number(candle.close), Number(candle.low)) &&
          Number(candle.low) <= Math.min(Number(candle.open), Number(candle.close), Number(candle.high)),
        )
        .map((candle) => [candle.date, { ...candle, open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close), volume: Number(candle.volume) }] as const),
    ).values(),
  ).sort((a, b) => a.date.localeCompare(b.date));
}
