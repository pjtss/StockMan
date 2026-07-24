import { describe, expect, it } from "vitest";
import { filterUsTurnoverRatioItems } from "./us-turnover-ratio";

const settings = { maxPrice: 20, maxRate: 30, maxOpenToHighRate: 30, minMarketCap: 1_000_000, maxMarketCap: 100_000_000, minTurnoverRatio: 1, maxTurnoverRatio: 10, tradingValueIncreaseAlert: 20_000 };
function row(overrides: Record<string, unknown> = {}) { return { symb: "ABC", name: "ABC", last: "5", rate: "25", __priceDetailMarketCap: 10_000_000, __priceDetailTradingValue: 200_000, __openToHighRate: 10, ...overrides }; }

describe("US turnover ratio filters", () => {
  it("accepts a candidate under configured limits", () => { expect(filterUsTurnoverRatioItems({ output: [row()] }, 100, settings)).toHaveLength(1); });
  it("rejects candidates outside the configured detail limits", () => {
    expect(filterUsTurnoverRatioItems({ output: [row({ __openToHighRate: 31 })] }, 100, settings)).toHaveLength(0);
    expect(filterUsTurnoverRatioItems({ output: [row({ __priceDetailMarketCap: 101_000_000 })] }, 100, settings)).toHaveLength(0);
  });
  it("keeps the configured open-to-high boundary inclusive", () => { expect(filterUsTurnoverRatioItems({ output: [row({ __openToHighRate: 30 })] }, 100, settings)).toHaveLength(1); });
});
