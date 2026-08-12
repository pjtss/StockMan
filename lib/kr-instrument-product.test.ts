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

  it("excludes ETF brands and active funds when KIS omits product type", () => {
    for (const name of ["RISE 글로벌수소경제", "WON 반도체밸류체인액티브", "마이티 코스피100", "에셋플러스 코리아대장장이액티브"]) {
      expect(isEligibleKrCommonStock(classifyKrInstrumentProduct({ name }))).toBe(false);
    }
  });

  it("excludes preferred shares and SPACs", () => {
    expect(isEligibleKrCommonStock(classifyKrInstrumentProduct({ name: "하이트진로2우B" }))).toBe(false);
    expect(isEligibleKrCommonStock(classifyKrInstrumentProduct({ name: "대신밸런스제17호스팩" }))).toBe(false);
  });
});
