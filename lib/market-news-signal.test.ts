import { describe, expect, it } from "vitest";
import { analyzeMarketNews } from "./market-news-signal";

describe("market news signal", () => {
  it("detects a strong catalyst", () => {
    const signal = analyzeMarketNews({ source: "SEC_EDGAR", title: "ACME receives FDA approval for Phase 3 treatment", summary: "Positive clinical trial results." });
    expect(signal.direction).toBe("POSITIVE");
    expect(signal.category).toBe("CATALYST");
    expect(signal.score).toBeGreaterThanOrEqual(25);
  });
  it("penalizes dilution risk even when funding is announced", () => {
    const signal = analyzeMarketNews({ source: "SEC_EDGAR", title: "ACME announces registered direct offering", summary: "Company raises $20 million." });
    expect(signal.direction).toBe("NEGATIVE");
    expect(signal.risks).toContain("희석성 자금조달");
  });
  it("extracts 8-K items and tickers", () => {
    const signal = analyzeMarketNews({ source: "SEC_EDGAR", title: "8-K Item 1.01 - ACME (ACM) enters material definitive agreement", summary: "" });
    expect(signal.category).toBe("SEC_8K");
    expect(signal.secItems).toContain("Item 1.01");
    expect(signal.tickers).toContain("ACM");
  });
  it("does not treat a raw insider filing as a confirmed catalyst", () => {
    const signal = analyzeMarketNews({ source: "SEC_EDGAR", title: "4 - Reporting Person (0001234567)", summary: "Filed: 2026-07-30" });
    expect(signal.category).toBe("INSIDER");
    expect(signal.direction).toBe("UNKNOWN");
  });
  it("offsets a material agreement when the filing also contains dilution", () => {
    const signal = analyzeMarketNews({ source: "SEC_EDGAR", title: "8-K - ACME (ACM) filer", summary: "Item 1.01: Entry into a Material Definitive Agreement Item 3.02: Unregistered Sales of Equity Securities" });
    expect(signal.score).toBeLessThan(25);
    expect(signal.risks).toContain("SEC Item 3.02 미등록 주식 발행/희석");
  });
});
