import { describe, expect, it } from "vitest";
import { calculateTradeIntensityMetrics, scoreTradeIntensity } from "./us-trade-intensity-metrics";
import type { KisUsTrade } from "./kis-us-trade-trend";

const trade = (time: string, intensity: number, price: number, volume: number, bid = 100, ask = 101): KisUsTrade => ({ time, intensity, price, volume, totalVolume: volume, changeRate: 0, marketType: "0", bid, ask });

describe("US trade intensity metrics", () => {
  it("compares newest and previous execution samples", () => {
    const metrics = calculateTradeIntensityMetrics([
      trade("100003", 130, 110, 300), trade("100002", 125, 109, 200),
      trade("100001", 90, 105, 100), trade("100000", 80, 104, 100),
    ]);
    expect(metrics.recentAverageIntensity).toBe(127.5);
    expect(metrics.previousAverageIntensity).toBe(85);
    expect(metrics.intensityChange).toBe(42.5);
    expect(metrics.priceChange).toBeCloseTo(5.7692, 3);
    expect(metrics.volumeChangeRate).toBe(150);
  });

  it("scores sustained buying pressure separately from one tick", () => {
    const metrics = calculateTradeIntensityMetrics([
      trade("100003", 130, 110, 300), trade("100002", 125, 109, 200),
      trade("100001", 90, 105, 100), trade("100000", 80, 104, 100),
    ]);
    const score = scoreTradeIntensity(metrics);
    expect(score.level).toBe("STRONG");
    expect(score.score).toBeGreaterThanOrEqual(80);
  });

  it("rejects an undersampled response even when one tick is strong", () => {
    const metrics = calculateTradeIntensityMetrics([trade("100003", 180, 110, 300)]);
    const score = scoreTradeIntensity(metrics);
    expect(metrics.dataQuality).toBe("INSUFFICIENT");
    expect(score.level).toBe("REJECT");
    expect(score.failedConditions.some((reason) => reason.includes("표본 부족"))).toBe(true);
  });
});
