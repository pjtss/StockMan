import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ingest: vi.fn(),
  translate: vi.fn(),
  bullish: vi.fn(),
  notify: vi.fn(),
  withAutomationRun: vi.fn(),
  loadSettings: vi.fn(),
  isWithinSchedule: vi.fn(),
  normalizeSources: vi.fn(),
  describeError: vi.fn(),
  isSchemaError: vi.fn(),
  recordSkipped: vi.fn(),
  withAutomationLock: vi.fn(),
  getCronStatus: vi.fn(),
  order: [] as string[],
}));

vi.mock("@/lib/market-rss-pipeline", () => ({
  ingestMarketRssArticles: mocks.ingest,
  translatePendingMarketRssArticles: mocks.translate,
  syncMarketRssBullishArticles: mocks.bullish,
  notifyPendingMarketRssArticles: mocks.notify,
}));
vi.mock("@/lib/automation-run", () => ({ withAutomationRun: mocks.withAutomationRun }));
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings: mocks.loadSettings }));
vi.mock("@/lib/schedule-time", () => ({ isWithinSchedule: mocks.isWithinSchedule }));
vi.mock("@/lib/market-rss-sources", () => ({ normalizeMarketRssSources: mocks.normalizeSources }));
vi.mock("@/lib/error-diagnostics", () => ({ describeError: mocks.describeError, isSchemaError: mocks.isSchemaError }));
vi.mock("@/lib/automation-run-repository", () => ({ recordSkippedAutomationRun: mocks.recordSkipped }));
vi.mock("@/lib/market-rss-bullish-repository", () => ({ syncMarketRssBullishArticles: mocks.bullish }));
vi.mock("@/lib/automation-lock", () => ({ withAutomationLock: mocks.withAutomationLock }));
vi.mock("@/lib/market-rss-cron-status", () => ({ getMarketRssCronStatus: mocks.getCronStatus }));

import { POST } from "./route";

describe("market-rss cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.length = 0;
    process.env.CRON_SECRET = "test-secret";
    process.env.RSS_TRANSLATION_BATCH_SIZE = "3";
    process.env.RSS_NOTIFICATION_BATCH_SIZE = "3";
    mocks.loadSettings.mockResolvedValue({ enabled: true, featureSettings: { marketRss: { enabledSources: ["STOCKTITAN"] } } });
    mocks.isWithinSchedule.mockReturnValue(true);
    mocks.withAutomationLock.mockImplementation(async (_key: string, run: () => Promise<unknown>) => run());
    mocks.withAutomationRun.mockImplementation(async (_key: string, run: () => Promise<unknown>) => run());
    mocks.ingest.mockImplementation(async () => { mocks.order.push("ingest"); return { ingestFailureCount: 0 }; });
    mocks.translate.mockImplementation(async () => { mocks.order.push("translate"); return { attempted: 3, translated: 2, notRequired: 0, fallback: 1, failed: 0, fallbackReasons: { test: 1 }, translationUsage: null, limitReached: false, limitAlertSent: false, thresholdAlerts: [], thresholdAlertSent: 0 }; });
    mocks.bullish.mockImplementation(async () => { mocks.order.push("bullish"); return { processed: 3 }; });
    mocks.notify.mockImplementation(async () => { mocks.order.push("notify"); return { attempted: 3, sent: 3, queueEnqueueFailed: 0, skipped: false, batchLimit: 1_000, webhookConfigured: true }; });
    mocks.getCronStatus.mockReturnValue({ degraded: true, partialFailureCount: 1, ingestFailureCount: 0, translationFailureCount: 1 });
  });

  it("runs ingest, bounded translation, and notification without blocking on the separate bullish mirror", async () => {
    const response = await POST(new Request("http://localhost/api/cron/market-rss", {
      method: "POST",
      headers: { "x-cron-secret": "test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      degraded: true,
      partialFailureCount: 1,
      ingested: { ingestFailureCount: 0 },
      translated: { fallback: 1 },
      notified: { sent: 3 },
      bullish: { skipped: true, reason: "deferred_from_notification_cron" },
    });
    expect(mocks.order).toEqual(["ingest", "translate", "notify"]);
    expect(mocks.bullish).not.toHaveBeenCalled();
    expect(mocks.ingest).toHaveBeenCalledWith({ sources: ["GLOBENEWSWIRE", "STOCKTITAN", "SEC_EDGAR"] });
    expect(mocks.translate).toHaveBeenCalledWith(20);
    expect(mocks.notify).toHaveBeenCalledWith(20);
    expect(mocks.getCronStatus).toHaveBeenCalledWith(0, expect.objectContaining({ attempted: 3, translated: 2, fallback: 1, failed: 0 }));
  });

  it("ends after one bounded batch and reports that the next timer tick must continue the backlog", async () => {
    mocks.translate.mockResolvedValueOnce({ attempted: 20, translated: 20, notRequired: 0, fallback: 0, failed: 0, fallbackReasons: {}, translationUsage: null, limitReached: false, limitAlertSent: false, thresholdAlerts: [], thresholdAlertSent: 0 });
    mocks.notify.mockResolvedValueOnce({ attempted: 20, sent: 20, queueEnqueueFailed: 0, skipped: false, batchLimit: 20, webhookConfigured: true });

    const response = await POST(new Request("http://localhost/api/cron/market-rss", {
      method: "POST",
      headers: { "x-cron-secret": "test-secret", "x-rss-scheduler": "1" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ backlogRemaining: true, degraded: true, notified: { sent: 20 } });
    expect(mocks.translate).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthorized requests before reading settings or starting work", async () => {
    const response = await POST(new Request("http://localhost/api/cron/market-rss", {
      method: "POST",
      headers: { "x-cron-secret": "wrong-secret" },
    }));

    expect(response.status).toBe(401);
    expect(mocks.loadSettings).not.toHaveBeenCalled();
    expect(mocks.order).toEqual([]);
  });

  it("records and returns disabled state without running RSS stages", async () => {
    mocks.loadSettings.mockResolvedValueOnce({ enabled: false, featureSettings: {} });

    const response = await POST(new Request("http://localhost/api/cron/market-rss", {
      method: "POST",
      headers: { "x-cron-secret": "test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ skipped: true, reason: "disabled" });
    expect(mocks.recordSkipped).toHaveBeenCalledWith("market-rss", "disabled");
    expect(mocks.order).toEqual([]);
  });
});
