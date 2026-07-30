import { describe, expect, it } from "vitest";
import { normalizeFinraShortVolume } from "./short-interest-sources";

describe("FINRA short volume normalization", () => {
  it("maps official Reg SHO field names", () => {
    const result = normalizeFinraShortVolume("aapl", { tradeReportDate: "2026-07-30", shortParQuantity: 250, totalParQuantity: 1000 });
    expect(result).toMatchObject({ ticker: "AAPL", shortVolume: 250, totalVolume: 1000, shortVolumeRatio: 25, asOf: "2026-07-30", status: "OK" });
  });
});
