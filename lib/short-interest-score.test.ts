import { describe, expect, it } from "vitest";
import { scoreShortInterest } from "./short-interest-score";

describe("short interest score", () => {
  it("does not score missing data", () => expect(scoreShortInterest({ ticker: "AAPL", shortVolume: null, totalVolume: null, shortVolumeRatio: null, shortInterest: null, daysToCover: null, asOf: null, source: "FINRA", status: "UNAVAILABLE" }).level).toBe("UNKNOWN"));
  it("scores supplied pressure metrics using fractional ratios", () => expect(scoreShortInterest({ ticker: "AAPL", shortVolume: 60, totalVolume: 100, shortVolumeRatio: 0.6, shortInterest: null, daysToCover: 6, asOf: "2026-07-30", source: "FINRA", status: "OK" }).level).toBe("HIGH"));
});
