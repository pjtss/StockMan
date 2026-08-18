import { describe, expect, it } from "vitest";
import { scoreIntegratedDailyCandidates } from "./us-daily-integrated-score";

describe("integrated daily score", () => {
  it("merges signals by ticker and assigns a grade", () => {
    const result = scoreIntegratedDailyCandidates({
      breakout: [{ code: "abcd", name: "Alpha" }],
      obv: [{ ticker: "ABCD" }],
      adl: [{ symbol: "ABCD" }],
      macd: [{ code: "ABCD" }],
    });
    expect(result[0]).toMatchObject({ ticker: "ABCD", name: "Alpha", score: 80, grade: "A" });
    expect(result[0].signals).toEqual(["breakout", "obv", "adl", "macd"]);
  });

  it("does not invent candidates without a ticker", () => {
    expect(scoreIntegratedDailyCandidates({ obv: [{ value: 1 }] })).toEqual([]);
  });
});
