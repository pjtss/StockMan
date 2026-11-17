import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPool } = vi.hoisted(() => ({ getPool: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool }));

import { syncDailyActivityStatus } from "./daily-activity-status";

describe("syncDailyActivityStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies candle quality filters before updating a requested market", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 2 });
    const result = await syncDailyActivityStatus("KR", { query });

    expect(result).toEqual({ kr_common_stock_universe: 2 });
    expect(query).toHaveBeenCalledOnce();
    const [text, values] = query.mock.calls[0];
    expect(values).toEqual([["KOSPI", "KOSDAQ"]]);
    expect(text).toContain("JOIN eligible_universe e ON e.market=c.market AND e.code=c.code");
    expect(text).toContain("u.enabled=true AND u.instrument_type='COMMON_STOCK'");
    expect(text).toContain("COALESCE(u.trading_halt_code,'') NOT IN ('Y','1')");
    expect(text).toContain("c.high >= GREATEST(c.open, c.low, c.close)");
    expect(text).toContain("UPDATE kr_common_stock_universe");
  });

  it("restricts US market freshness to active common stocks", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    await expect(syncDailyActivityStatus("US", { query })).resolves.toEqual({ us_common_stock_universe: 0 });
    const text = query.mock.calls[0][0] as string;
    expect(text).toContain("COALESCE(u.is_etf,false)=false");
    expect(text).toContain("COALESCE(u.is_warrant,false)=false");
    expect(text).toContain("COALESCE(u.is_leveraged,false)=false");
  });

  it("propagates database failures without caching a false success", async () => {
    const query = vi.fn().mockRejectedValueOnce(new Error("db unavailable")).mockResolvedValue({ rowCount: 0 });
    await expect(syncDailyActivityStatus(undefined, { query })).rejects.toThrow("db unavailable");

    const healthyQuery = vi.fn().mockResolvedValue({ rowCount: 0 });
    await expect(syncDailyActivityStatus(undefined, { query: healthyQuery })).resolves.toEqual({ kr_common_stock_universe: 0, us_common_stock_universe: 0 });
    expect(healthyQuery).toHaveBeenCalledTimes(2);
  });
});
