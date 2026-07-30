import { describe, expect, it } from "vitest";
import { DEFAULT_US_TURNOVER_FILTER_SETTINGS } from "./us-turnover-settings";
import { explainUsTurnoverFilters } from "./us-turnover-filter-explanation";

const item = { market: "NAS", rank: 1, code: "TEST", name: "Test", price: "2", changeRate: "12", marketCap: 50_000_000, tradingValue: 2_000_000, turnoverRatio: 4, openToHighRate: 8 };

describe("turnover filter explanation", () => {
  it("returns passed filters for a valid item", () => {
    const result = explainUsTurnoverFilters(item, DEFAULT_US_TURNOVER_FILTER_SETTINGS);
    expect(result.passed).toBe(true);
    expect(result.failedFilters).toHaveLength(0);
  });
  it("reports concrete reasons for rejection", () => {
    const result = explainUsTurnoverFilters({ ...item, changeRate: "-3", turnoverRatio: 0.4, openToHighRate: 35 }, DEFAULT_US_TURNOVER_FILTER_SETTINGS);
    expect(result.passed).toBe(false);
    expect(result.failedFilters.join(" ")).toMatch(/등락률|고점|시총 대비 거래대금/);
  });
});
