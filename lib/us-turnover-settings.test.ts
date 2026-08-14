import { describe, expect, it } from "vitest";
import { DEFAULT_US_TURNOVER_FILTER_SETTINGS, isGlobalMarketCapAllowed, isTurnoverRatioAllowed } from "./us-turnover-settings";

describe("US turnover settings shared predicates", () => {
  it("applies the configured turnover-ratio range inclusively", () => {
    const settings = { ...DEFAULT_US_TURNOVER_FILTER_SETTINGS, minTurnoverRatio: 2, maxTurnoverRatio: 5 };
    expect(isTurnoverRatioAllowed(2, settings)).toBe(true);
    expect(isTurnoverRatioAllowed(5, settings)).toBe(true);
    expect(isTurnoverRatioAllowed(1.99, settings)).toBe(false);
    expect(isTurnoverRatioAllowed(5.01, settings)).toBe(false);
    expect(isTurnoverRatioAllowed(null, settings)).toBe(false);
  });

  it("only requires global market-cap bounds when enabled", () => {
    const disabled = { ...DEFAULT_US_TURNOVER_FILTER_SETTINGS, globalMinMarketCap: 0, globalMaxMarketCap: 0 };
    expect(isGlobalMarketCapAllowed(null, disabled)).toBe(true);
    const enabled = { ...disabled, globalMinMarketCap: 1_000_000, globalMaxMarketCap: 10_000_000 };
    expect(isGlobalMarketCapAllowed(1_000_000, enabled)).toBe(true);
    expect(isGlobalMarketCapAllowed(10_000_001, enabled)).toBe(false);
    expect(isGlobalMarketCapAllowed(null, enabled)).toBe(false);
  });
});
