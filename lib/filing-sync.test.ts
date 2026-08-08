import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDartOpen: vi.fn(),
  loadFeatureModuleSettings: vi.fn(),
  runDartAutomation: vi.fn(),
}));

vi.mock("./feature-module-settings", () => ({
  loadFeatureModuleSettings: mocks.loadFeatureModuleSettings,
}));
vi.mock("./dart-automation", () => ({ runDartAutomation: mocks.runDartAutomation }));
vi.mock("./scanner-hours", () => ({ isDartOpen: mocks.isDartOpen }));

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
  });

  it("runs paginated DART automation when the module is enabled", async () => {
    const result = await runFilingSync();

    expect(mocks.runDartAutomation).toHaveBeenCalledTimes(1);
    expect(result.dart).toEqual({ source: "DART", results: [] });
  });

  it("does not run the legacy SEC RSS path", async () => {
    const result = await runFilingSync();

    expect(result.sec).toEqual({
      skipped: true,
      reason: "SEC RSS is handled by market-rss; SEC Submissions by sec-edgar",
    });
  });
});
