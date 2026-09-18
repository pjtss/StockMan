import { beforeEach, describe, expect, it, vi } from "vitest";

const loadFeatureModuleSettings = vi.fn();
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings }));

describe("intraday MVP policy cache", () => {
  beforeEach(() => { loadFeatureModuleSettings.mockReset(); vi.resetModules(); });

  it("loads once within the ten-minute memory TTL and returns the configured policy", async () => {
    loadFeatureModuleSettings.mockResolvedValue({ featureSettings: { intradayMvpPolicy: { windowMinutes: 1, thresholdPercent: 1 } } });
    const { loadIntradayMvpPolicy } = await import("./intraday-mvp-policy");
    await expect(loadIntradayMvpPolicy()).resolves.toMatchObject({ windowMinutes: 1, thresholdPercent: 1, threshold: 0.01, requiredSamples: 1 });
    await expect(loadIntradayMvpPolicy()).resolves.toMatchObject({ windowMinutes: 1, thresholdPercent: 1 });
    expect(loadFeatureModuleSettings).toHaveBeenCalledTimes(1);
  });

  it("reloads immediately after explicit invalidation", async () => {
    loadFeatureModuleSettings.mockResolvedValueOnce({ featureSettings: { intradayMvpPolicy: { windowMinutes: 5, thresholdPercent: 5 } } }).mockResolvedValueOnce({ featureSettings: { intradayMvpPolicy: { windowMinutes: 1, thresholdPercent: 1 } } });
    const { loadIntradayMvpPolicy, invalidateIntradayMvpPolicyCache } = await import("./intraday-mvp-policy");
    await expect(loadIntradayMvpPolicy()).resolves.toMatchObject({ windowMinutes: 5 });
    invalidateIntradayMvpPolicyCache();
    await expect(loadIntradayMvpPolicy()).resolves.toMatchObject({ windowMinutes: 1 });
    expect(loadFeatureModuleSettings).toHaveBeenCalledTimes(2);
  });
});
