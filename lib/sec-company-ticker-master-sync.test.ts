import { describe, expect, it, vi } from "vitest";
import { buildSecCompanyTickerMasterRecords, syncSecCompanyTickerMaster } from "./sec-company-ticker-master-sync";
import type { EligibleSecCommonStock } from "./sec-company-facts-eligibility";
import type { SecTickerRow } from "./sec-company-ticker";

const secRow = (cik: string, ticker: string, exchange = "Nasdaq"): SecTickerRow => ({ cik, ticker, exchange, name: "Example Holdings, Inc." });
const activeRow = (cik: string, ticker: string): EligibleSecCommonStock => ({
  cik, ticker, exchange: "Nasdaq", name: "Example Holdings, Inc.", market: "NAS", universeCode: ticker, universeName: "Example Holdings",
});

describe("SEC active common-stock ticker master sync", () => {
  it("writes all SEC-listed share classes only for issuers confirmed by the active KIS common-stock universe", () => {
    const records = buildSecCompanyTickerMasterRecords([
      secRow("0000000001", "EXM"),
      secRow("0000000001", "EXM-A"),
      secRow("0000000001", "EXM-WT"),
      secRow("0000000002", "ETF", "NYSE"),
    ], [activeRow("0000000001", "EXM")]);

    expect(records).toEqual([{
      cik: "0000000001",
      name: "Example Holdings, Inc.",
      tickers: ["EXM", "EXM-A", "EXM-WT"],
      exchanges: ["Nasdaq"],
    }]);
  });

  it("does not write when no SEC issuer passed the active common-stock check", async () => {
    const writer = vi.fn(async () => undefined);
    const result = await syncSecCompanyTickerMaster([secRow("0000000001", "EXM")], [], writer);
    expect(result).toMatchObject({ issuerCount: 0, tickerCount: 0 });
    expect(writer).toHaveBeenCalledWith([], expect.any(Date));
  });
});
