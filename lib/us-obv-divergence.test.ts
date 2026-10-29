import { describe, expect, it } from "vitest";
import { evaluateUsObvDivergence, type ObvCandle } from "@/lib/us-obv-divergence";

function weekdayBars(count = 120): ObvCandle[] {
  const bars: ObvCandle[] = [];
  let day = new Date("2026-01-05T00:00:00.000Z");
  while (bars.length < count) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const index = bars.length;
      const close = 30 - index * 0.08 + (index % 3 === 1 ? 0.12 : 0);
      bars.push({ date: day.toISOString().slice(0, 10), open: close, high: close * 1.01, low: close * 0.99, close, volume: index % 3 === 1 ? 50_000 : 1_000 });
    }
    day = new Date(day.getTime() + 86_400_000);
  }
  return bars;
}

describe("evaluateUsObvDivergence", () => {
  it("finds a price decline with distributed OBV accumulation and exposes the exact input candles", () => {
    const bars = weekdayBars();
    const result = evaluateUsObvDivergence(bars, { market: "NAS", code: "TEST", name: "Test Common" }, bars.at(-1)!.date);
    expect(result.reason).toBeNull();
    expect(result.candidate).toMatchObject({
      ticker: "TEST",
      signalType: "TREND",
      signalQuality: "STANDARD",
      priceBasis: "UNVERIFIED_CORPORATE_ACTION_ADJUSTMENT",
      algoVersion: "4.0.0",
    });
    expect(result.candidate!.price20dPct).toBeLessThan(0);
    expect(result.candidate!.obv20dAvgVolumeMultiple).toBeGreaterThan(0);
  });

  it("rejects sparse history and invalid OHLCV instead of silently evaluating it", () => {
    const bars = weekdayBars();
    expect(evaluateUsObvDivergence(bars.slice(-40), { market: "NAS", code: "SHORT", name: "Short" }, bars.at(-1)!.date).reason).toBe("INSUFFICIENT_HISTORY");
    const invalid = [...bars];
    invalid[100] = { ...invalid[100], low: invalid[100].close + 1 };
    expect(evaluateUsObvDivergence(invalid, { market: "NAS", code: "BAD", name: "Bad" }, bars.at(-1)!.date).reason).toBe("INVALID_LOW");
  });

  it("excludes future bars from the calculation", () => {
    const bars = weekdayBars();
    const asOf = bars.at(-2)!.date;
    const result = evaluateUsObvDivergence(bars, { market: "NAS", code: "TEST", name: "Test Common" }, asOf);
    expect(result.candidate?.candleDate).toBe(asOf);
  });
});
