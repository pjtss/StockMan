import { describe, expect, it } from "vitest";
import { scoreCandidate } from "./candidate-score";

describe("scoreCandidate", () => {
  it("returns explainable score without inventing missing metrics", () => {
    expect(scoreCandidate({ tradingValueRvol: 2, tradeIntensity: 100 })).toEqual({ score: 35, reasons: ["rvol", "trade_intensity"] });
  });
});
