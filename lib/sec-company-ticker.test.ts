import { describe, expect, it } from "vitest";
import { extractSecCik, selectPreferredSecCompanyTicker, type SecTickerRow } from "./sec-company-ticker";

const row = (ticker: string, name = "Example Corp."): SecTickerRow => ({ cik: "0000000001", name, ticker, exchange: "NASDAQ" });

describe("SEC company ticker selection", () => {
  it("extracts the zero-padded CIK from an RSS title", () => {
    expect(extractSecCik("8-K - Example, Inc. (0001506983) (Filer)")).toBe("0001506983");
  });

  it("prefers common shares over units and warrants", () => {
    expect(selectPreferredSecCompanyTicker([row("KCA-UN", "Kensington Capital Acquisition Corp. VI"), row("KCA", "Kensington Capital Acquisition Corp. VI")], "0000000001")?.ticker).toBe("KCA");
  });

  it("does not resolve a CIK to a derivative when no common ticker exists", () => {
    expect(selectPreferredSecCompanyTicker([row("KCA-UN"), row("KCA-WT")], "0000000001")).toBeNull();
  });

  it("does not resolve compact SPAC unit/warrant symbols", () => {
    const name = "Constellation Acquisition Corp I";
    expect(selectPreferredSecCompanyTicker([row("CSTAF", name), row("CSTUF", name), row("CSTWF", name)], "0000000001")).toBeNull();
  });

  it("keeps ordinary class shares such as BH-A", () => {
    expect(selectPreferredSecCompanyTicker([row("BH-A"), row("BH-PA")], "0000000001")?.ticker).toBe("BH-A");
  });
});
