import { describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query }) }));
import { filterKrRowsByStoredMarketCap, KR_MARKET_CAP_MAX_AGE_HOURS, loadKrMarketCapSnapshots, meetsKrMarketCapFloor, meetsKrMarketCapFloorKrw, parseKrMarketCapInBillionWon } from "./kr-market-cap";

describe("KR KIS market-cap floor", () => {
  it("reads ranking cap fields in 억원 and excludes the boundary", () => {
    expect(parseKrMarketCapInBillionWon({ hts_avls: "301" })).toBe(301);
    expect(meetsKrMarketCapFloor({ stck_avls: "500000" })).toBe(true);
    expect(meetsKrMarketCapFloor({ stck_avls: "300" })).toBe(false);
  });
  it("fails closed for missing or invalid caps", () => {
    for (const row of [{}, { hts_avls: "unknown" }, { market_cap: "0" }, { marketCap: "-1" }]) expect(meetsKrMarketCapFloor(row)).toBe(false);
  });
  it("applies the same strict floor to normalized KRW snapshots", () => {
    expect(meetsKrMarketCapFloorKrw(30_000_000_001)).toBe(true);
    expect(meetsKrMarketCapFloorKrw(30_000_000_000)).toBe(false);
    expect(meetsKrMarketCapFloorKrw(null)).toBe(false);
  });
  it("filters stored candidate rows against positive KRW snapshots and rejects missing values", async () => {
    query.mockResolvedValueOnce({ rows: [
      { market: "KOSPI", code: "A", market_cap: "40000000000", currency: "KRW", fetched_at: new Date().toISOString() },
      { market: "KOSPI", code: "B", market_cap: "20000000000", currency: "KRW", fetched_at: new Date().toISOString() },
      { market: "KOSPI", code: "C", market_cap: "90000000000", currency: "USD", fetched_at: new Date().toISOString() },
      { market: "KOSPI", code: "E", market_cap: "90000000000", currency: "KRW", fetched_at: new Date(Date.now() - (KR_MARKET_CAP_MAX_AGE_HOURS + 1) * 60 * 60 * 1000).toISOString() },
      { market: "KOSPI", code: "F", market_cap: "90000000000", currency: "KRW", fetched_at: new Date(Date.now() + 60_000).toISOString() },
    ] });
    const rows = await filterKrRowsByStoredMarketCap([{ code: "A" }, { code: "B" }, { code: "C" }, { code: "D" }, { code: "E" }, { code: "F" }]);
    expect(rows).toEqual([{ code: "A" }]);
    const [statement, values] = query.mock.calls[0];
    expect(statement).toContain("FROM kr_common_stock_universe u");
    expect(statement).toContain("f.market = requested.market AND f.code = requested.code");
    expect(values[2]).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("keys scoped snapshots by exchange and keeps duplicate codes ambiguous without an exchange", async () => {
    query.mockResolvedValueOnce({ rows: [
      { market: "KOSPI", code: "123456", market_cap: "40000000000", currency: "KRW", fetched_at: new Date().toISOString() },
      { market: "KOSDAQ", code: "123456", market_cap: "50000000000", currency: "KRW", fetched_at: new Date().toISOString() },
    ] });
    const caps = await loadKrMarketCapSnapshots(["123456"]);
    expect(caps.get("123456")).toBeNull();
    expect(caps.get("KOSPI:123456")).toBe(40_000_000_000);
    expect(caps.get("KOSDAQ:123456")).toBe(50_000_000_000);
  });

  it("requests explicit exchange and code pairs without broad cross-market joins", async () => {
    query.mockResolvedValueOnce({ rows: [
      { market: "KOSDAQ", code: "123456", market_cap: "50000000000", currency: "KRW", fetched_at: new Date().toISOString() },
    ] });
    const caps = await loadKrMarketCapSnapshots([{ market: "KOSDAQ", code: "123456" }]);
    expect(caps.get("KOSDAQ:123456")).toBe(50_000_000_000);
    const [statement, values] = query.mock.calls.at(-1);
    expect(statement).toContain("unnest($1::text[], $2::text[])");
    expect(values).toEqual([["KOSDAQ"], ["123456"], []]);
  });
});
