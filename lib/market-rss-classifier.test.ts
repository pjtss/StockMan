import { describe, expect, it } from "vitest";
import { classifyMarketRssItem } from "./market-rss-classifier";

describe("market RSS classifier", () => {
  it("suppresses earnings transcript noise", () => {
    expect(classifyMarketRssItem({ source: "NASDAQ", title: "ACME (ACM) Q2 2026 Earnings Call Transcript" })).toMatchObject({ category: "TRANSCRIPT", notifyEligible: false, priority: 0 });
  });
  it("prioritizes actionable headlines", () => {
    expect(classifyMarketRssItem({ source: "NASDAQ", title: "ACME receives FDA approval for Phase 3 trial" })).toMatchObject({ category: "ACTIONABLE", notifyEligible: true, priority: 100 });
  });
  it("stores ticker-specific general articles without sending an alert", () => {
    expect(classifyMarketRssItem({ source: "NASDAQ", title: "ACME (ACM) outlook improves" })).toMatchObject({ category: "GENERAL", notifyEligible: false, priority: 20 });
  });
  it("extracts StockTitan suffix ticker and models financing dilution", () => {
    expect(classifyMarketRssItem({ source: "STOCKTITAN", title: "red violet Announces Closing of $115 Million Underwritten Public Offering | RDVT Stock News" })).toMatchObject({ category: "FINANCING", ticker: "RDVT", direction: "MIXED", financingAmountUsd: 115000000, dilutionRisk: "HIGH", notifyEligible: true });
  });
  it("prefers the StockTitan symbol over parenthesized clinical abbreviations", () => {
    expect(classifyMarketRssItem({ source: "STOCKTITAN", title: "Scholar Rock Announces FDA Review of Apitegromab Biologics License Application (BLA) | SRRK Stock News" })).toMatchObject({ ticker: "SRRK", category: "ACTIONABLE", notifyEligible: true });
  });
  it("does not treat treatment text as an ATM financing signal", () => {
    expect(classifyMarketRssItem({ source: "STOCKTITAN", title: "AbCellera Announces Phase 2 Clinical Trial Results for the Treatment of Moderate-to-Severe Disease | ABCL Stock News" })).toMatchObject({ category: "ACTIONABLE", ticker: "ABCL", notifyEligible: true, matchedTerms: ["clinical trial"] });
    expect(classifyMarketRssItem({ source: "STOCKTITAN", title: "AbCellera Announces Phase 2 Clinical Trial Results for the Treatment of Moderate-to-Severe Disease | ABCL Stock News" }).dilutionRisk).toBe("UNKNOWN");
  });
  it("does not treat an SEC issuer legal name as an actionable event", () => {
    expect(classifyMarketRssItem({
      source: "SEC_EDGAR",
      title: "8-K - Kensington Capital Acquisition Corp. VI (0002102713) (Filer)",
      summary: "Filed: 2026-08-07 Item 8.01: Other Events Item 9.01: Financial Statements and Exhibits",
    })).toMatchObject({ category: "GENERAL", direction: "NEUTRAL", notifyEligible: false, matchedTerms: [] });
  });
  it("uses SEC item descriptions for a real contract signal", () => {
    expect(classifyMarketRssItem({
      source: "SEC_EDGAR",
      title: "8-K - Example Acquisition Corp. (0000000001) (Filer)",
      summary: "Filed: 2026-08-07 Item 1.01: Entry into a Material Definitive Agreement",
    })).toMatchObject({ category: "ACTIONABLE", direction: "POSITIVE", notifyEligible: true, matchedTerms: ["material definitive agreement"] });
  });
  it("does not treat Acquisition Corp. in a non-SEC issuer name as an event", () => {
    expect(classifyMarketRssItem({ source: "NASDAQ", title: "Kensington Capital Acquisition Corp. VI (KCA) outlook" })).toMatchObject({ category: "GENERAL", notifyEligible: false, matchedTerms: [] });
  });
});
