import { describe, expect, it } from "vitest";
import { getMarketRssGrade } from "./market-rss-grade";

describe("market RSS grade", () => {
  it("classifies eligible priority 100 articles as high", () => {
    expect(getMarketRssGrade({ priority: 100, notifyEligible: true })).toBe("high");
  });

  it("classifies eligible priority 50 articles as medium", () => {
    expect(getMarketRssGrade({ priority: 50, notifyEligible: true })).toBe("medium");
  });

  it("classifies lower eligible priority articles as low", () => {
    expect(getMarketRssGrade({ priority: 20, notifyEligible: true })).toBe("low");
  });

  it("keeps non-eligible articles in the excluded grade", () => {
    expect(getMarketRssGrade({ priority: 100, notifyEligible: false })).toBe("excluded");
  });
});
