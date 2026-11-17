import { beforeEach, describe, expect, it, vi } from "vitest";
import { CasingCache } from "drizzle-orm/casing";
import { PgDialect } from "drizzle-orm/pg-core";
import { calculateDayTradeFlowState, latestCompletedDailyDate, recommendMultiTimeframe } from "./multi-timeframe-recommendations";
import { validDailyCandleSql } from "./candle-sql-quality";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), queryEligibleUniverse: vi.fn(), loadKrMarketCapSnapshots: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ execute: mocks.execute }) }));
vi.mock("@/lib/instrument-eligibility", () => ({ queryEligibleUniverse: mocks.queryEligibleUniverse }));
vi.mock("@/lib/kis-cache", () => ({ writeKisCache: vi.fn() }));
vi.mock("@/lib/technical-entry-analysis", () => ({ analyzeTechnicalEntry: vi.fn() }));
vi.mock("@/lib/daytrade-signal", () => ({ evaluateDayTradeSignal: vi.fn() }));
vi.mock("@/lib/kr-market-cap", () => ({
  KR_MARKET_CAP_MAX_AGE_HOURS: 24,
  loadKrMarketCapSnapshots: mocks.loadKrMarketCapSnapshots,
  meetsKrMarketCapFloorKrw: (value: number | null | undefined) => value != null && Number.isFinite(value) && value > 30_000_000_000,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryEligibleUniverse.mockResolvedValue({ rows: [{ market: "KOSPI", code: "005930", name: "Samsung" }], compatibilityFallback: false });
  mocks.loadKrMarketCapSnapshots.mockResolvedValue(new Map([["KOSPI:005930", 50_000_000_000_000]]));
  mocks.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ market: "KOSPI", code: "005930", marketCap: "50000000000000", currency: "KRW", fetchedAt: new Date().toISOString() }] });
});

describe("multi-timeframe day-trade flow", () => {
  it("uses OHLC money-flow multiplier for ADL", () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      date: `202609${String(index + 1).padStart(2, "0")}`,
      open: 99 + index,
      high: 100.5 + index,
      low: 99 + index,
      close: 100 + index,
      volume: 100,
      updatedAt: null,
    }));
    const flow = calculateDayTradeFlowState(rows);
    expect(flow.adl).toBeGreaterThan(0);
    expect(flow.adlAboveSignal).toBe(true);
  });
  it("uses the latest completed daily date as the scan basis", () => {
    expect(latestCompletedDailyDate([{ D: [{ date: "20260917" } as any] }, { D: [{ date: "20260918" } as any] }])).toBe("20260918");
  });
  it("shares a SQL quality guard that scanners apply before row ranking", () => {
    expect(validDailyCandleSql("candles")).toContain("candles.high >= GREATEST(candles.open, candles.low, candles.close)");
  });
  it("loads KR fundamentals under exchange keys and requires a fresh KRW snapshot", async () => {
    const result = await recommendMultiTimeframe("KR");

    expect(mocks.loadKrMarketCapSnapshots).toHaveBeenCalledWith([{ market: "KOSPI", code: "005930", name: "Samsung" }]);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    const fundamentalSql = mocks.execute.mock.calls[1][0].toQuery({ dialect: new PgDialect(), casing: new CasingCache() }).sql;
    expect(fundamentalSql).toContain("market IN ('KOSPI','KOSDAQ')");
    expect(fundamentalSql).toContain("currency = 'KRW'");
    expect(fundamentalSql).toContain("fetched_at >= NOW() - INTERVAL '24 hours'");
    expect(result.policy.marketCapFloorKrw).toEqual({ minimumExclusive: 30_000_000_000, unknownOrStale: "excluded", maxSnapshotAgeHours: 24 });
  });
});
