import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ execute: mocks.execute }) }));

import { commonStockEligibilitySql, filterActiveKrCommonStockRows, isEligibleKrCommonStock, isEligibleUsCommonStock } from "./instrument-eligibility";

describe("instrument eligibility", () => {
  beforeEach(() => vi.clearAllMocks());
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
  it("filters provider rows to codes found in the active official KR common-stock query", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ code: "005930" }] });
    const rows = await filterActiveKrCommonStockRows([{ code: "005930" }, { code: "000002" }, { code: "" }]);
    expect(rows).toEqual([{ code: "005930" }]);
    expect(String(mocks.execute.mock.calls[0][0].queryChunks?.map((chunk: any) => chunk.value?.join("") ?? "").join("") ?? mocks.execute.mock.calls[0][0])).toContain("instrument_type = 'COMMON_STOCK'");
  });
  it("fails closed when official master and compatibility lookups are unavailable", async () => {
    mocks.execute.mockRejectedValue(new Error("database unavailable"));
    await expect(filterActiveKrCommonStockRows([{ code: "005930" }])).rejects.toThrow("Universe schema/query unavailable (KR)");
  });
});
