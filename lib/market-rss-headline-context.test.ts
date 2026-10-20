import { describe, expect, it } from "vitest";
import { normalizeMarketRssHeadlineContext } from "./market-rss-headline-context";

describe("market RSS headline context normalization", () => {
  it("clarifies that holding a public company means holding its stock", () => {
    expect(normalizeMarketRssHeadlineContext("I've Held Nvidia for Nearly 3 Years. Here's Whether I'd Still Buy Today."))
      .toBe("I've Held Nvidia stock for Nearly 3 Years. Here's Whether I'd Still Buy Today.");
  });

  it("does not inject stock ownership context into unrelated literal product-holding phrases", () => {
    expect(normalizeMarketRssHeadlineContext("I've held Nvidia hardware in my hand for years."))
      .toBe("I've held Nvidia hardware in my hand for years.");
    expect(normalizeMarketRssHeadlineContext("I've held Nvidia Shield for Nearly 3 Years."))
      .toBe("I've held Nvidia Shield for Nearly 3 Years.");
    expect(normalizeMarketRssHeadlineContext("I've held Nvidia GPUs for 3 years."))
      .toBe("I've held Nvidia GPUs for 3 years.");
  });

  it("clarifies commodity-price pullbacks without changing unrelated headlines", () => {
    expect(normalizeMarketRssHeadlineContext("Corn Pulling Back on Wednesday"))
      .toBe("Corn prices pulling back on Wednesday");
    expect(normalizeMarketRssHeadlineContext("Nvidia Pulling Back on Wednesday"))
      .toBe("Nvidia Pulling Back on Wednesday");
  });

  it("makes a known risk-off commodity headline grammatical and market-specific", () => {
    expect(normalizeMarketRssHeadlineContext("Corn Face Risk Off Pressure on Wednesday's Correction"))
      .toBe("Corn prices face selling pressure from risk-off sentiment on Wednesday's Correction");
  });
});
