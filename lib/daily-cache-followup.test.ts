import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadFeatureModuleSettings: vi.fn(),
  isWithinSchedule: vi.fn(),
  loadStoredKrInstrumentScopes: vi.fn(),
  loadKrMarketCapSnapshots: vi.fn(),
  loadCachedKrDailyCandlesBulk: vi.fn(),
  persistGoldenCrossResults: vi.fn(),
  markDailyFollowupRetrySuccess: vi.fn(),
  enqueueDailyFollowupRetry: vi.fn(),
}));

vi.mock("@/lib/daily-bollinger-cache", () => ({ persistDailyBollingerResults: vi.fn() }));
vi.mock("@/lib/kr-bollinger-band", () => ({ scanStoredKrBollingerBands: vi.fn() }));
vi.mock("@/lib/us-bollinger-band", () => ({ scanStoredUsBollingerBands: vi.fn() }));
vi.mock("@/lib/daily-golden-cross", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/daily-golden-cross")>()),
  persistGoldenCrossResults: mocks.persistGoldenCrossResults,
}));
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings: mocks.loadFeatureModuleSettings }));
vi.mock("@/lib/kr-instruments", () => ({ loadStoredKrInstrumentScopes: mocks.loadStoredKrInstrumentScopes }));
vi.mock("@/lib/kr-daily-price-cache", () => ({ loadCachedKrDailyCandlesBulk: mocks.loadCachedKrDailyCandlesBulk }));
vi.mock("@/lib/us-daily-scan-context", () => ({ createUsDailyScanContext: vi.fn() }));
vi.mock("@/lib/daily-followup-retry", () => ({ enqueueDailyFollowupRetry: mocks.enqueueDailyFollowupRetry, markDailyFollowupRetrySuccess: mocks.markDailyFollowupRetrySuccess }));
vi.mock("@/lib/schedule-time", () => ({ isWithinSchedule: mocks.isWithinSchedule }));
vi.mock("@/lib/kr-market-cap", () => ({
  KR_MARKET_CAP_MAX_AGE_HOURS: 24,
  loadKrMarketCapSnapshots: mocks.loadKrMarketCapSnapshots,
  meetsKrMarketCapFloorKrw: (value: number | null | undefined) => value != null && Number.isFinite(value) && value > 30_000_000_000,
}));

import { refreshDailyGoldenCrossCache } from "./daily-cache-followup";

describe("refreshDailyGoldenCrossCache KR eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadFeatureModuleSettings.mockResolvedValue({ enabled: true, featureSettings: {} });
    mocks.isWithinSchedule.mockReturnValue(true);
    mocks.loadStoredKrInstrumentScopes.mockResolvedValue({ scopes: [
      { market: "KOSPI", code: "000001", name: "Eligible" },
      { market: "KOSDAQ", code: "000002", name: "Below floor" },
    ] });
    mocks.loadKrMarketCapSnapshots.mockResolvedValue(new Map([["KOSPI:000001", 40_000_000_000], ["KOSDAQ:000002", 30_000_000_000]]));
    mocks.loadCachedKrDailyCandlesBulk.mockResolvedValue(new Map([["KOSPI:000001", []]]));
    mocks.persistGoldenCrossResults.mockResolvedValue({ cached: true, qualifiedCount: 0 });
    mocks.markDailyFollowupRetrySuccess.mockResolvedValue(true);
  });

  it("loads candles and persists results only for fresh-cap eligible instruments", async () => {
    const result = await refreshDailyGoldenCrossCache("KR");

    expect(mocks.loadCachedKrDailyCandlesBulk).toHaveBeenCalledWith([{ market: "KOSPI", code: "000001", name: "Eligible" }], 30, "D");
    expect(mocks.persistGoldenCrossResults).toHaveBeenCalledWith("KR", [expect.objectContaining({ code: "000001" })], { allowEmpty: true });
    expect(result).toMatchObject({ ok: true, instrumentCount: 1, marketCapExcludedCount: 1, marketCapFilter: { minimumKrwExclusive: 30_000_000_000, maxSnapshotAgeHours: 24, unknownOrStale: "excluded" } });
  });

  it("writes an empty cache when the universe is valid but no cap snapshots qualify", async () => {
    mocks.loadKrMarketCapSnapshots.mockResolvedValue(new Map());
    mocks.loadCachedKrDailyCandlesBulk.mockResolvedValue(new Map());

    const result = await refreshDailyGoldenCrossCache("KR");

    expect(mocks.loadCachedKrDailyCandlesBulk).toHaveBeenCalledWith([], 30, "D");
    expect(mocks.persistGoldenCrossResults).toHaveBeenCalledWith("KR", [], { allowEmpty: true });
    expect(result).toMatchObject({ ok: true, instrumentCount: 0, marketCapExcludedCount: 2 });
  });
});
