import { describe, expect, it, vi } from "vitest";
import { refreshDailyCandleSummaries } from "./daily-candle-summary-sync.mjs";

describe("refreshDailyCandleSummaries", () => {
  it("rebuilds the latest valid source summary and verifies stored values", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [{ code: "DGICB", date: "20261026", open: 10, high: 12, low: 9, close: 11, volume: 100 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] }),
    };

    await expect(refreshDailyCandleSummaries(client, "US", "NAS", [" dgicb ", "DGICB"])).resolves.toBe(1);
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls[0][0]).toContain("DELETE FROM us_latest_daily_candles");
    expect(client.query.mock.calls[1][0]).toContain("FROM us_instrument_universe_candles c");
    expect(client.query.mock.calls[1][0]).toContain("DISTINCT ON (c.code)");
    expect(client.query.mock.calls[2][0]).toContain("ON CONFLICT (market,code) DO UPDATE");
    expect(client.query.mock.calls[3][0]).toContain("stored.candle_date=expected.candle_date");
    expect(client.query.mock.calls[0][1]).toEqual(["NAS", ["DGICB"]]);
  });

  it("keeps the newest valid zero-volume candle as the summary date", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ code: "AAPL", date: "20261027", open: 10, high: 12, low: 9, close: 11, volume: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] }),
    };

    await expect(refreshDailyCandleSummaries(client, "US", "NAS", ["AAPL"])).resolves.toBe(1);
    expect(client.query.mock.calls[1][0]).not.toMatch(/c\.volume\s*>\s*0/);
    expect(client.query.mock.calls[2][1][2]).toEqual(["20261027"]);
    expect(client.query.mock.calls[2][1][7]).toEqual([0]);
  });

  it("removes invalid summaries without creating an empty replacement", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }),
    };

    await expect(refreshDailyCandleSummaries(client, "KR", "KOSPI", ["005930"])).resolves.toBe(0);
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls[0][0]).toContain("DELETE FROM kr_latest_daily_candles");
  });

  it("fails closed for unsupported market table selection", async () => {
    const client = { query: vi.fn() };
    await expect(refreshDailyCandleSummaries(client, "ALL", "NAS", ["AAPL"])).rejects.toThrow("INVALID_DAILY_SUMMARY_MARKET_KIND");
    expect(client.query).not.toHaveBeenCalled();
  });
});
