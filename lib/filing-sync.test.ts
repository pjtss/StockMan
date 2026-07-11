import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDartOpen: vi.fn(),
  loadAdminFeatureFlags: vi.fn(),
  runSecAutomation: vi.fn(),
  syncDartAlerts: vi.fn(),
}));

vi.mock("./admin-flags", () => ({
  loadAdminFeatureFlags: mocks.loadAdminFeatureFlags,
}));
vi.mock("./alerts", () => ({ syncDartAlerts: mocks.syncDartAlerts }));
vi.mock("./scanner-hours", () => ({ isDartOpen: mocks.isDartOpen }));
vi.mock("./sec-automation", () => ({ runSecAutomation: mocks.runSecAutomation }));

import { runFilingSync } from "./filing-sync";

describe("runFilingSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDartOpen.mockResolvedValue(true);
    mocks.syncDartAlerts.mockResolvedValue({ source: "DART", items: [] });
    mocks.runSecAutomation.mockResolvedValue({ source: "SEC", items: [], automation: {} });
  });

  it("runs SEC synchronization when the admin flag is enabled", async () => {
    mocks.loadAdminFeatureFlags.mockResolvedValue({
      dart_realtime: false,
      sec_realtime: true,
      us_scanners: true,
      us_turnover_trend: true,
    });

    const result = await runFilingSync();

    expect(mocks.runSecAutomation).toHaveBeenCalledTimes(1);
    expect(result.sec).toEqual({ source: "SEC", items: [], automation: {} });
  });

  it("skips SEC synchronization when the admin flag is disabled", async () => {
    mocks.loadAdminFeatureFlags.mockResolvedValue({
      dart_realtime: false,
      sec_realtime: false,
      us_scanners: true,
      us_turnover_trend: true,
    });

    const result = await runFilingSync();

    expect(mocks.runSecAutomation).not.toHaveBeenCalled();
    expect(result.sec).toEqual({
      skipped: true,
      reason: "SEC disabled by admin",
    });
  });
});
