import { describe, expect, it } from "vitest";
import { commonStockEligibilitySql, isEligibleKrCommonStock, isEligibleUsCommonStock } from "./instrument-eligibility";

describe("instrument eligibility", () => {
  it("rejects official domestic suspended and liquidation flags", () => {
    expect(isEligibleKrCommonStock({ instrumentType: "COMMON_STOCK", tradingHaltCode: "Y" })).toBe(false);
    expect(isEligibleKrCommonStock({ instrumentType: "COMMON_STOCK", liquidationCode: "1" })).toBe(false);
    expect(isEligibleKrCommonStock({ instrumentType: "COMMON_STOCK", managedIssueCode: "Y" })).toBe(false);
    expect(isEligibleKrCommonStock({ instrumentType: "COMMON_STOCK" })).toBe(true);
  });
  it("rejects overseas products using persisted official classification flags", () => {
    expect(isEligibleUsCommonStock({ instrumentType: "ETF", isEtf: true })).toBe(false);
    expect(isEligibleUsCommonStock({ instrumentType: "COMMON_STOCK", isWarrant: true })).toBe(false);
    expect(isEligibleUsCommonStock({ instrumentType: "COMMON_STOCK" })).toBe(true);
  });
  it("keeps SQL predicates aligned with the runtime policy", () => {
    expect(commonStockEligibilitySql("KR")).toContain("trading_halt_code");
    expect(commonStockEligibilitySql("US")).toContain("is_etf");
  });
});
