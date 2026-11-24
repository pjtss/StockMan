import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorized: true,
  enabled: true,
  withinSchedule: false,
  postClose: true,
  settings: { enabled: true, startTime: "06:00", endTime: "08:00", activeDays: [1, 2, 3, 4, 5, 6], intervalSeconds: 3_600 },
  latest: null as null | { status: string; started_at: string },
  freshness: [
    { market: "NAS", sourceLatestCandleDate: "20261123", cacheLatestCandleDate: "20261120", stale: true },
    { market: "NYS", sourceLatestCandleDate: "20261123", cacheLatestCandleDate: "20261120", stale: true },
    { market: "AMS", sourceLatestCandleDate: "20261123", cacheLatestCandleDate: "20261120", stale: true },
  ],
  afterCallback: null as null | (() => Promise<void>),
  release: vi.fn(async () => undefined),
  recordSkipped: vi.fn(async () => undefined),
  detectLag: vi.fn(),
  automationRun: vi.fn(),
  warm: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (callback: () => Promise<void>) => { mocks.afterCallback = callback; } };
});
vi.mock("@/lib/cron-auth", () => ({ isCronRequestAuthorized: () => mocks.authorized }));
vi.mock("@/lib/automation-lock", () => ({ acquireAutomationLock: async () => ({ release: mocks.release }) }));
vi.mock("@/lib/us-daily-price-cache-warm", () => ({ warmUsDailyPriceCache: mocks.warm }));
vi.mock("@/lib/automation-run", () => ({ withAutomationRun: mocks.automationRun }));
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings: async () => mocks.settings }));
vi.mock("@/lib/us-daily-global-gate", () => ({ isDailyCandleAutomationEnabled: async () => mocks.enabled }));
vi.mock("@/lib/schedule-time", () => ({ isWithinSchedule: () => mocks.withinSchedule }));
vi.mock("@/lib/automation-run-repository", () => ({
  loadLatestExecutedAutomationRun: async () => mocks.latest,
  recordSkippedAutomationRun: mocks.recordSkipped,
}));
vi.mock("@/lib/us-daily-cache-freshness", () => ({
  detectUsDailyCacheLag: mocks.detectLag,
  isUsPostCloseWeekday: () => mocks.postClose,
}));

import { POST } from "./route";

const request = () => new Request("https://example.test/api/cron/us-daily-cache", { method: "POST" });

describe("POST /api/cron/us-daily-cache", () => {
  beforeEach(() => {
    mocks.authorized = true;
    mocks.enabled = true;
    mocks.withinSchedule = false;
    mocks.postClose = true;
    mocks.settings = { enabled: true, startTime: "06:00", endTime: "08:00", activeDays: [1, 2, 3, 4, 5, 6], intervalSeconds: 3_600 };
    mocks.latest = null;
    mocks.freshness = [
      { market: "NAS", sourceLatestCandleDate: "20261123", cacheLatestCandleDate: "20261120", stale: true },
      { market: "NYS", sourceLatestCandleDate: "20261123", cacheLatestCandleDate: "20261120", stale: true },
      { market: "AMS", sourceLatestCandleDate: "20261123", cacheLatestCandleDate: "20261120", stale: true },
    ];
    mocks.afterCallback = null;
    mocks.release.mockClear();
    mocks.recordSkipped.mockClear();
    mocks.detectLag.mockReset().mockResolvedValue(mocks.freshness);
    mocks.automationRun.mockReset().mockResolvedValue({ ok: true, successCount: 3, failureCount: 0, instrumentCount: 3, savedCandleCount: 3 });
    mocks.warm.mockReset().mockResolvedValue({ ok: true, successCount: 1, failureCount: 0, instrumentCount: 1, savedCandleCount: 1 });
  });

  it("returns 202 and transfers the lock for a post-close stale-cache catch-up", async () => {
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(202);
    expect(body).toMatchObject({ ok: true, accepted: true, status: "RUNNING", trigger: "post_close_stale_cache_catchup", deferred: { accepted: true } });
    expect(body.freshnessCheck).toEqual(mocks.freshness);
    expect(mocks.detectLag).toHaveBeenCalledOnce();
    expect(mocks.afterCallback).toBeTypeOf("function");
    expect(mocks.release).not.toHaveBeenCalled();
    await mocks.afterCallback?.();
    expect(mocks.automationRun).toHaveBeenCalledOnce();
    const task = mocks.automationRun.mock.calls[0][1] as () => Promise<unknown>;
    await task();
    expect(mocks.warm).toHaveBeenCalledWith({ timeframes: ["D"] });
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("keeps the full timeframe warm for the configured schedule", async () => {
    mocks.withinSchedule = true;
    const response = await POST(request());
    expect(response.status).toBe(202);
    await mocks.afterCallback?.();
    const task = mocks.automationRun.mock.calls[0][1] as () => Promise<unknown>;
    await task();
    expect(mocks.warm).toHaveBeenCalledWith(undefined);
  });

  it("reports a clear outside-schedule skip when source dates match the cache", async () => {
    mocks.freshness = mocks.freshness.map((market) => ({ ...market, cacheLatestCandleDate: market.sourceLatestCandleDate, stale: false }));
    mocks.detectLag.mockResolvedValue(mocks.freshness);
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ skipped: true, reason: "outside_schedule_cache_current", scheduleTimezone: "Asia/Seoul", freshnessCheck: mocks.freshness });
    expect(mocks.recordSkipped).toHaveBeenCalledWith("us-daily-cache", "outside_schedule", { freshnessCheck: mocks.freshness });
    expect(mocks.afterCallback).toBeNull();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("does not let an orphaned RUNNING row block a lock-acquired recovery run", async () => {
    mocks.latest = { status: "RUNNING", started_at: new Date().toISOString() };
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(mocks.detectLag).toHaveBeenCalledOnce();
    expect(mocks.afterCallback).toBeTypeOf("function");
  });

  it("keeps disabled modules disabled and releases the request lock", async () => {
    mocks.settings = { ...mocks.settings, enabled: false };
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ skipped: true, reason: "disabled" });
    expect(mocks.recordSkipped).toHaveBeenCalledWith("us-daily-cache", "disabled");
    expect(mocks.detectLag).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
