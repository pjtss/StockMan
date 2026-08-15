import { describe, expect, it } from "vitest";
import { calculateSqueezeScore } from "@/lib/us-short-squeeze-analysis";
describe("calculateSqueezeScore", () => {
  it("does not award points for unavailable metrics", () => expect(calculateSqueezeScore({ siFloat: null, pnl: null, daysToCover: null })).toEqual({ score: 0, maxScore: 0, coveragePercent: 0 }));
  it("tracks score coverage separately from the score", () => expect(calculateSqueezeScore({ siFloat: 30, pnl: null, daysToCover: 5 })).toEqual({ score: 25, maxScore: 25, coveragePercent: 100 }));
});
