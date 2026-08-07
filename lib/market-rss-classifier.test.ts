import { describe, expect, it } from "vitest";
import { classifyMarketRssItem } from "./market-rss-classifier";

describe("market RSS classifier", () => {
  it("suppresses earnings transcript noise", () => {
    expect(classifyMarketRssItem({ source: "NASDAQ", title: "ACME (ACM) Q2 2026 Earnings Call Transcript" })).toMatchObject({ category: "TRANSCRIPT", notifyEligible: false, priority: 0 });
  });
  it("prioritizes actionable headlines", () => {
    expect(classifyMarketRssItem({ source: "NASDAQ", title: "ACME receives FDA approval for Phase 3 trial" })).toMatchObject({ category: "ACTIONABLE", notifyEligible: true, priority: 100 });
  });
  it("allows ticker-specific general articles", () => {
    expect(classifyMarketRssItem({ source: "NASDAQ", title: "ACME (ACM) outlook improves" })).toMatchObject({ category: "GENERAL", notifyEligible: true });
  });
  it("extracts StockTitan suffix ticker and models financing dilution", () => {
    expect(classifyMarketRssItem({ source: "STOCKTITAN", title: "red violet Announces Closing of $115 Million Underwritten Public Offering | RDVT Stock News" })).toMatchObject({ category: "FINANCING", ticker: "RDVT", direction: "MIXED", financingAmountUsd: 115000000, dilutionRisk: "HIGH", notifyEligible: true });
  });
});
