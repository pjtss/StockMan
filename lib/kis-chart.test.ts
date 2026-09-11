/**
 * lib/kis-chart.test.ts — 기술적 지표 연산 단위 테스트
 */
import { describe, it, expect } from "vitest";
import { normalizeOHLCVCandles } from "./chart-candles";

// 내부 함수들을 테스트하기 위해 직접 재구현 (private helper들)
function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

function calcEMA(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const emas: number[] = [];
  const seed = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  emas.push(seed);
  for (let i = period; i < data.length; i++) {
    emas.push(data[i] * k + emas[emas.length - 1] * (1 - k));
  }
  return emas;
}

function calcBollingerBands(closes: number[], period = 20) {
  if (closes.length < period) return { upper: null, middle: null, lower: null };
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  return {
    upper: parseFloat((mean + 2 * std).toFixed(0)),
    middle: parseFloat(mean.toFixed(0)),
    lower: parseFloat((mean - 2 * std).toFixed(0)),
  };
}

describe("Technical Indicators", () => {
  const closes60 = Array.from({ length: 60 }, (_, i) => 50000 + i * 100);

  it("RSI: returns null when insufficient data", () => {
    expect(calcRSI([100, 200, 300], 14)).toBeNull();
  });

  it("RSI: returns 100 when all moves are up (no losses)", () => {
    const allUp = Array.from({ length: 20 }, (_, i) => 100 + i * 10);
    const result = calcRSI(allUp, 14);
    expect(result).toBe(100);
  });

  it("RSI: returns a value between 0 and 100 for normal data", () => {
    const result = calcRSI(closes60, 14);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(0);
    expect(result!).toBeLessThanOrEqual(100);
  });

  it("EMA: returns empty array when data < period", () => {
    expect(calcEMA([100, 200], 5)).toHaveLength(0);
  });

  it("EMA: returns correct length", () => {
    const data = Array.from({ length: 30 }, (_, i) => 1000 + i * 10);
    const ema = calcEMA(data, 12);
    expect(ema.length).toBe(30 - 12 + 1);
  });

  it("Bollinger Bands: returns null when insufficient data", () => {
    const result = calcBollingerBands([100, 200, 300], 20);
    expect(result.upper).toBeNull();
  });

  it("Bollinger Bands: upper > middle > lower for normal data", () => {
    const result = calcBollingerBands(closes60, 20);
    expect(result.upper).not.toBeNull();
    expect(result.upper!).toBeGreaterThan(result.middle!);
    expect(result.middle!).toBeGreaterThan(result.lower!);
  });
});

describe("Chart candle normalization", () => {
  const candle = (date: string, close: number, overrides: Partial<{ open: number; high: number; low: number; volume: number }> = {}) => ({
    date, open: overrides.open ?? close, high: overrides.high ?? close, low: overrides.low ?? close, close, volume: overrides.volume ?? 100,
  });

  it("sorts candles ascending and removes duplicate dates", () => {
    const result = normalizeOHLCVCandles([candle("20260903", 3), candle("20260901", 1), candle("20260902", 2), candle("20260902", 99)]);
    expect(result.map((item) => item.date)).toEqual(["20260901", "20260902", "20260903"]);
    expect(result[1].close).toBe(99);
  });

  it("drops malformed OHLCV candles so chart series stay aligned", () => {
    const result = normalizeOHLCVCandles([candle("20260901", 1), candle("20260902", Number.NaN), candle("20260903", 3, { high: 1 }), candle("bad", 4)]);
    expect(result.map((item) => item.date)).toEqual(["20260901"]);
  });
});
