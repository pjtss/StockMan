import { describe, expect, it } from "vitest";
import { isSecEligibleSmallcapCandidate, SEC_SMALLCAP_MAX_USD, selectLatestSecSharesFact } from "./sec-smallcap-shares";

describe("SEC small-cap common-stock share selection", () => {
  const base = { market: "NAS", ticker: "ABCD", name: "Example Inc.", marketCapUsd: 99_999_999, priceUsd: 2 };
  it("requires a supported US market and a market cap at or below USD 100 million", () => {
    expect(SEC_SMALLCAP_MAX_USD).toBe(100_000_000);
    expect(isSecEligibleSmallcapCandidate(base)).toBe(true);
    expect(isSecEligibleSmallcapCandidate({ ...base, marketCapUsd: SEC_SMALLCAP_MAX_USD })).toBe(true);
    expect(isSecEligibleSmallcapCandidate({ ...base, marketCapUsd: SEC_SMALLCAP_MAX_USD + 1 })).toBe(false);
    expect(isSecEligibleSmallcapCandidate({ ...base, market: "OTC" })).toBe(false);
  });

  it("chooses the most recently filed valid DEI shares fact", () => {
    expect(selectLatestSecSharesFact({ facts: { dei: { EntityCommonStockSharesOutstanding: { units: { shares: [
      { val: 100, end: "2025-12-31", filed: "2026-02-01", accn: "old", form: "10-K" },
      { val: 125, end: "2026-03-31", filed: "2026-05-01", accn: "new", form: "10-Q" },
      { val: -1, end: "2026-06-30", filed: "2026-08-01", accn: "invalid", form: "10-Q" },
    ] } } } } })).toEqual({ shares: 125, end: "2026-03-31", filed: "2026-05-01", accessionNumber: "new", form: "10-Q" });
  });

  it("does not manufacture a shares value when SEC has no usable DEI fact", () => {
    expect(selectLatestSecSharesFact({ facts: {} })).toBeNull();
  });
});
