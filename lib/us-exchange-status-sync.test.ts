import { describe, expect, it } from "vitest";
import { parseEasternTimestamp, parseNasdaqSymbolDirectories, parseNasdaqTradeHalts } from "@/lib/us-exchange-status-sync";

describe("official US exchange status source parsers", () => {
  it("keeps a non-resumed halt and its official reason code", () => {
    const xml = `<rss><channel><item><IssueSymbol>PRFX</IssueSymbol><Market>NASDAQ</Market><HaltDate>11/24/2026</HaltDate><HaltTime>09:30</HaltTime><ReasonCode>H10</ReasonCode><ResumptionDate></ResumptionDate><ResumptionTradeTime></ResumptionTradeTime></item><item><IssueSymbol>ABCD</IssueSymbol><Market>NASDAQ</Market><HaltDate>11/24/2026</HaltDate><HaltTime>09:30</HaltTime><ReasonCode>D</ReasonCode></item></channel></rss>`;
    expect(parseNasdaqTradeHalts(xml)).toMatchObject([
      { market: "NAS", symbol: "PRFX", status: "HALTED", reasonCode: "H10" },
      { market: "NAS", symbol: "ABCD", status: "DELISTING_ACTION", statusType: "LISTING_REMOVAL", reasonCode: "D" },
    ]);
  });

  it("parses Eastern dates with daylight-saving offsets and allows valid empty halt snapshots", () => {
    expect(parseEasternTimestamp("11/24/2026", "09:30:00")).toBe("2026-11-24T14:30:00.000Z");
    expect(parseEasternTimestamp("07/24/2026", "09:30:00")).toBe("2026-07-24T13:30:00.000Z");
    expect(parseNasdaqTradeHalts("<rss><channel><title>Current Halts</title></channel></rss>")).toEqual([]);
  });

  it("maps only official deficient, delinquent, and bankruptcy codes to listing issues", () => {
    const nasdaq = [
      "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares|",
      "PRFX|PRF Technologies Ltd. - Ordinary Shares|S|N|D|100|N|N|",
      "ABCD|Example Corp - Ordinary Shares|Q|N|N|100|N|N|",
      "<EOF>",
    ].join("\n");
    const other = [
      "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol|",
      "ITUB|Itau Unibanco Banco Holding SA American Depositary Shares|N|ITUB|N|100|N|ITUB|",
      "PYT|PPlus Tr GSC-2 Tr Ctf Fltg Rate|N|PYT|N|100|N|PYT|",
      "<EOF>",
    ].join("\n");
    expect(parseNasdaqSymbolDirectories(nasdaq, other)).toMatchObject([
      { market: "NAS", symbol: "PRFX", status: "LISTING_ISSUE", reasonCode: "D" },
      { market: "NAS", symbol: "ABCD", status: "LISTED", reasonCode: "N" },
      { market: "NYS", symbol: "ITUB", status: "LISTED", statusType: "LISTING_PRESENCE" },
      { market: "NYS", symbol: "PYT", status: "LISTED", statusType: "LISTING_PRESENCE" },
    ]);
  });

  it("fails closed on malformed source responses instead of clearing saved halt states", () => {
    expect(() => parseNasdaqTradeHalts("<html>error</html>")).toThrow("NASDAQ_HALT_FEED_INVALID");
    expect(() => parseNasdaqSymbolDirectories("", "")).toThrow("NASDAQ_LISTED_DIRECTORY_INVALID_OR_EMPTY");
  });
});
