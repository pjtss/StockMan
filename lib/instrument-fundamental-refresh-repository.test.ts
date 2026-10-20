import { describe, expect, it, vi } from "vitest";
import {
  loadInstrumentFundamentalUniverse,
  loadInvalidInstrumentFundamentals,
  loadMissingInstrumentFundamentals,
  verifyInstrumentFundamentalRefresh,
} from "./instrument-fundamental-refresh-repository";

function mockDb(rowsByCall: unknown[][]) {
  const query = vi.fn(async () => ({ rows: rowsByCall.shift() ?? [] }));
  return { query };
}

describe("instrument fundamental refresh repository", () => {
  it("loads the complete active universe with source attribution", async () => {
    const rows = [{ market: "NAS", code: "ABC", name: "Example", source: "us_common_stock_universe" }];
    const db = mockDb([rows]);
    await expect(loadInstrumentFundamentalUniverse(db)).resolves.toEqual(rows);
    expect(db.query).toHaveBeenCalledOnce();
    expect(db.query.mock.calls[0][0]).toContain("FROM kr_common_stock_universe WHERE enabled=true");
    expect(db.query.mock.calls[0][0]).toContain("FROM us_common_stock_universe WHERE enabled=true");
  });

  it("parameterizes missing-scope cutoff", async () => {
    const since = new Date("2026-09-25T00:00:00.000Z");
    const rows = [{ market: "NAS", code: "ABC" }];
    const db = mockDb([rows]);
    await expect(loadMissingInstrumentFundamentals(db, since)).resolves.toEqual(rows);
    expect(db.query.mock.calls[0][0]).toContain("fetched_at >= $1::timestamptz");
    expect(db.query.mock.calls[0][1]).toEqual([since.toISOString()]);
  });

  it("identifies invalid rows and binds the cutoff", async () => {
    const since = new Date("2026-09-25T00:00:00.000Z");
    const rows = [{ market: "NAS", code: "ABC", reason: "invalid_price" }];
    const db = mockDb([rows]);
    await expect(loadInvalidInstrumentFundamentals(db, since)).resolves.toEqual(rows);
    expect(db.query.mock.calls[0][0]).toContain("'overseas_turnover_source_mismatch'");
    expect(db.query.mock.calls[0][1]).toEqual([since.toISOString()]);
  });

  it("returns incomplete counts and diagnostic samples from the same cutoff", async () => {
    const since = new Date("2026-09-25T00:00:00.000Z");
    const counts = {
      active_instruments: 2,
      refreshed_active_instruments: 1,
      missing_active_instruments: 1,
      history_rows: 1,
      instruments: 1,
      turnover_rows: 1,
      turnover_positive_rows: 1,
      turnover_zero_rows: 0,
      snapshot_market_cap_mismatch_rows: 0,
      invalid_price_rows: 0,
      invalid_market_cap_rows: 0,
      overseas_turnover_source_mismatch_rows: 0,
      market_cap_rows: 1,
      snapshot_sync_mismatch_rows: 0,
    };
    const emptySample = [{ market: "NAS", code: "MISS" }];
    const successSample = [{ market: "NAS", code: "GOOD" }];
    const capSample = [{ market: "NAS", code: "BAD" }];
    const db = mockDb([[counts], emptySample, successSample, capSample]);
    await expect(verifyInstrumentFundamentalRefresh(db, since)).resolves.toMatchObject({
      ok: false,
      since: since.toISOString(),
      ...counts,
      emptyQuoteShapeSamples: emptySample,
      successfulQuoteShapeSamples: successSample,
      invalidMarketCapSamples: capSample,
    });
    expect(db.query).toHaveBeenCalledTimes(4);
    for (const [, values] of db.query.mock.calls) expect(values).toEqual([since.toISOString()]);
  });
});
