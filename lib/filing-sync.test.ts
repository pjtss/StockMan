import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDartOpen: vi.fn(),
  loadFeatureModuleSettings: vi.fn(),
  runDartAutomation: vi.fn(),
  runSecAutomation: vi.fn(),
}));

vi.mock("./feature-module-settings", () => ({
  loadFeatureModuleSettings: mocks.loadFeatureModuleSettings,
}));
vi.mock("./dart-automation", () => ({ runDartAutomation: mocks.runDartAutomation }));
vi.mock("./scanner-hours", () => ({ isDartOpen: mocks.isDartOpen }));
vi.mock("./sec-automation", () => ({ runSecAutomation: mocks.runSecAutomation }));

import { runFilingSync } from "./filing-sync";

describe("runFilingSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDartOpen.mockResolvedValue(true);
    mocks.loadFeatureModuleSettings.mockImplementation((key: string) => Promise.resolve({
      enabled: key === "dart-realtime",
      startTime: "00:00",
      endTime: "23:59",
      cooldownSeconds: 60,
      activeDays: [0, 1, 2, 3, 4, 5, 6],
    }));
    mocks.runDartAutomation.mockResolvedValue({ source: "DART", results: [] });
    mocks.runSecAutomation.mockResolvedValue({ source: "SEC", items: [], automation: {} });
  });

  it("runs paginated DART automation when the module is enabled", async () => {
    const result = await runFilingSync();

    expect(mocks.runDartAutomation).toHaveBeenCalledTimes(1);
    expect(result.dart).toEqual({ source: "DART", results: [] });
  });

  it("runs SEC synchronization when the module is enabled", async () => {
    mocks.loadFeatureModuleSettings.mockImplementation((key: string) => Promise.resolve({
      enabled: key === "sec-realtime",
      startTime: "00:00",
      endTime: "23:59",
      cooldownSeconds: 60,
      activeDays: [0, 1, 2, 3, 4, 5, 6],
    }));

    const result = await runFilingSync();

    expect(mocks.runSecAutomation).toHaveBeenCalledTimes(1);
    expect(result.sec).toEqual({ source: "SEC", items: [], automation: {} });
  });

  it("skips SEC synchronization when the module is disabled", async () => {
    const result = await runFilingSync();

    expect(mocks.runSecAutomation).not.toHaveBeenCalled();
    expect(result.sec).toEqual({
      skipped: true,
      reason: "SEC disabled by admin",
    });
  });
});
