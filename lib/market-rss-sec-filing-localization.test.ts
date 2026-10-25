import { describe, expect, it } from "vitest";
import { buildMarketRssSecFilingLocalizationAssignments, MARKET_RSS_SEC_FILING_TITLE_SQL_PATTERN } from "./market-rss-sec-filing-localization";

describe("market RSS deterministic SEC filing title localization", () => {
  it.each([
    ["8-K - Pathfinder Bancorp, Inc. (0001609065) (Filer)", "8-K 공시 - Pathfinder Bancorp, Inc. (0001609065) (제출자)"],
    ["4 - MAIN TIMOTHY L (0001196744) (Reporting)", "4 공시 - MAIN TIMOTHY L (0001196744) (보고자)"],
    ["4 - Firy Inc. (0001801661) (Issuer)", "4 공시 - Firy Inc. (0001801661) (발행인)"],
  ])("maps exact standard title %s while retaining all original non-title fields", (title, translatedTitle) => {
    const rows = [{ id: 7, title, summary: "Original summary", content: "Original body", translationAttempts: 3 }];

    expect(buildMarketRssSecFilingLocalizationAssignments(rows)).toEqual([{ ...rows[0], translatedTitle }]);
  });

  it("rejects nonstandard SEC titles instead of guessing at the layout", () => {
    expect(buildMarketRssSecFilingLocalizationAssignments([
      { id: 1, title: "Company announces quarterly results", summary: "s", content: "c", translationAttempts: 0 },
      { id: 2, title: "4 - MAIN TIMOTHY L (0001196744)", summary: "s", content: "c", translationAttempts: 0 },
    ])).toEqual([]);
  });

  it("uses a bounded SQL prefilter for the same EDGAR title suffixes", () => {
    const pattern = new RegExp(MARKET_RSS_SEC_FILING_TITLE_SQL_PATTERN, "i");
    expect(pattern.test("4 - MAIN TIMOTHY L (0001196744) (Reporting)")).toBe(true);
    expect(pattern.test("4 - Example Holdings (0001234567) (Issuer)")).toBe(true);
    expect(pattern.test("Company announces quarterly results")).toBe(false);
  });
});
