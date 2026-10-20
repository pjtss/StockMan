import { describe, expect, it } from "vitest";
import { isInstrumentFundamentalRefreshComplete, type InstrumentFundamentalRefreshCounts } from "./instrument-fundamental-refresh-integrity";

const completeCounts: InstrumentFundamentalRefreshCounts = {
  active_instruments: 2,
  refreshed_active_instruments: 2,
  missing_active_instruments: 0,
  history_rows: 2,
  instruments: 2,
  turnover_rows: 2,
  market_cap_rows: 2,
  snapshot_market_cap_mismatch_rows: 0,
  invalid_price_rows: 0,
  invalid_market_cap_rows: 0,
  overseas_turnover_source_mismatch_rows: 0,
  snapshot_sync_mismatch_rows: 0,
};

describe("isInstrumentFundamentalRefreshComplete", () => {
  it("accepts complete coverage with valid prices, positive market caps, source turnover, and synced snapshots", () => {
    expect(isInstrumentFundamentalRefreshComplete(completeCounts)).toBe(true);
  });

  it("rejects an empty active universe instead of treating zero rows as a successful full refresh", () => {
    const emptyCounts = Object.fromEntries(
      Object.keys(completeCounts).map((key) => [key, 0]),
    ) as InstrumentFundamentalRefreshCounts;
    expect(isInstrumentFundamentalRefreshComplete(emptyCounts)).toBe(false);
  });

  it.each([
    ["missing active instrument", { missing_active_instruments: 1 }],
    ["invalid price", { invalid_price_rows: 1 }],
    ["zero or null market cap", { invalid_market_cap_rows: 1 }],
    ["snapshot retains a market cap missing from the latest quote", { snapshot_market_cap_mismatch_rows: 1 }],
    ["wrong KIS turnover source value", { overseas_turnover_source_mismatch_rows: 1 }],
    ["snapshot diverges from latest history", { snapshot_sync_mismatch_rows: 1 }],
    ["history coverage count is incomplete", { instruments: 1 }],
  ])("rejects %s", (_description, override) => {
    expect(isInstrumentFundamentalRefreshComplete({ ...completeCounts, ...override })).toBe(false);
  });
});
