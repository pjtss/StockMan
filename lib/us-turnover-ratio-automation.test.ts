import { describe, expect, it } from "vitest";
import { meetsTradeIntensityFilter, meetsTradingValueIncreaseAlert } from "./us-turnover-ratio-automation";

describe("US turnover trading-value alert threshold", () => {
  it("uses the configured threshold inclusively", () => {
    expect(meetsTradingValueIncreaseAlert(20_000, 20_000)).toBe(true);
    expect(meetsTradingValueIncreaseAlert(19_999.99, 20_000)).toBe(false);
    expect(meetsTradingValueIncreaseAlert(null, 20_000)).toBe(false);
  });
});

describe("US turnover trade-intensity filter", () => {
  it("requires the configured minimum intensity", () => {
    expect(meetsTradeIntensityFilter(100, 100)).toBe(true);
    expect(meetsTradeIntensityFilter(99.99, 100)).toBe(false);
    expect(meetsTradeIntensityFilter(null, 100)).toBe(false);
  });
});
