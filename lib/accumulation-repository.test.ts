import { beforeEach, describe, expect, it, vi } from "vitest";
import { groupAccumulationRows, loadAccumulationInstruments, type AccumulationDbRow } from "./accumulation-repository";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
const row: AccumulationDbRow = { market: "NAS", code: "A", name: "A", market_cap: null, shares_outstanding: null, fundamental_updated_at: null,
  candle_date: "20260903", candle_time: null, fetched_at: "2026-09-04T00:00:00Z", open: 1, high: 2, low: 1, close: 2, volume: 100 };
beforeEach(() => { query.mockReset().mockResolvedValue({ rows: [] }); });
describe("accumulation repository", () => {
  it("groups by market+code and preserves nulls as invalid, not zero", () => {
    const groups = groupAccumulationRows([row, { ...row, market: "NYS", open: null }, { ...row, code: "EMPTY", candle_date: null }]);
    expect(groups).toHaveLength(3);
    expect(groups[1].candles[0].open).toBeNaN();
    expect(groups[0].marketCap).toBeNull(); expect(groups[2].candles).toEqual([]);
  });
  it.each(["KR", "US"] as const)("uses one bounded read-only snapshot and active common-stock restrictions for %s", async region => {
    await loadAccumulationInstruments(region, new Date("2026-09-06T00:00:00Z"));
    expect(query).toHaveBeenCalledTimes(1);
    const [statement] = query.mock.calls[0];
    const sql = statement.text;
    const params = statement.values;
    expect(sql).toContain("u.daily_active=true"); expect(sql).toContain("u.instrument_type='COMMON_STOCK'");
    expect(sql).toContain("LEFT JOIN LATERAL"); expect(sql).toContain("ROW_NUMBER() OVER (PARTITION BY c.market,c.code"); expect(sql).toContain("c.row_number <= $3");
    expect(sql).not.toContain("c.volume>0"); expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(params[2]).toBe(120);
    if (region === "KR") expect(sql).toContain("f.market_cap > 30000000000");
    else { expect(sql).not.toContain("f.market_cap >"); expect(sql).toContain("NOT u.is_derivative"); }
  });
});
