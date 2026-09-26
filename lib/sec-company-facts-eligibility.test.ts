import { beforeEach, describe, expect, it, vi } from "vitest";
import { filterActiveSecCommonStocks } from "./sec-company-facts-eligibility";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ getPool: () => ({ query }) }));

describe("SEC Company Facts active common-stock gate", () => {
  beforeEach(() => query.mockReset());
  it("sends only symbols classified as active common shares by the KIS universe to the facts stage", async () => {
    query.mockResolvedValueOnce({ rows: [{ market: "NAS", code: "AAPL", name: "Apple Inc." }] });
    const eligible = await filterActiveSecCommonStocks([
      { cik: "0000320193", ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
      { cik: "0000320193", ticker: "AAPL-WT", name: "Apple Inc. Warrants", exchange: "NASDAQ" },
      { cik: "0000320193", ticker: "FUND", name: "Apple Index ETF", exchange: "NASDAQ" },
    ]);
    expect(eligible.map((row) => row.ticker)).toEqual(["AAPL"]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("daily_active = TRUE"), [ ["AAPL"] ]);
  });

  it("fails closed when the KIS master has no active common-stock match", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(filterActiveSecCommonStocks([{ cik: "0000000001", ticker: "ETF", name: "Example ETF Trust", exchange: "NASDAQ" }])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
