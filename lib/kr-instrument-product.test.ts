import { describe, expect, it } from "vitest";
import { classifyKrInstrumentProduct, isEligibleKrCommonStock } from "@/lib/kr-instrument-product";

describe("classifyKrInstrumentProduct", () => {
  it("excludes Korean ETFs", () => {
    const product = classifyKrInstrumentProduct({ name: "KODEX 200 ETF" });
    expect(product.isEtf).toBe(true);
    expect(isEligibleKrCommonStock(product)).toBe(false);
  });

  it("excludes leveraged and inverse products", () => {
    expect(isEligibleKrCommonStock(classifyKrInstrumentProduct({ name: "KODEX 레버리지" }))).toBe(false);
    expect(isEligibleKrCommonStock(classifyKrInstrumentProduct({ name: "TIGER 인버스" }))).toBe(false);
  });

  it("keeps ordinary shares eligible", () => {
    expect(isEligibleKrCommonStock(classifyKrInstrumentProduct({ name: "삼성전자" }))).toBe(true);
  });
});
