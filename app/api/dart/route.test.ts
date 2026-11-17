import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  getTodayDartBullishFeed: vi.fn(),
  isFeatureModuleEnabled: vi.fn(),
  isDartOpen: vi.fn(),
}));

vi.mock("@/lib/alerts", () => ({ getTodayDartBullishFeed: mocks.getTodayDartBullishFeed }));
vi.mock("@/lib/feature-module-gates", () => ({ isFeatureModuleEnabled: mocks.isFeatureModuleEnabled }));
vi.mock("@/lib/scanner-hours", () => ({ isDartOpen: mocks.isDartOpen }));

describe("GET /api/dart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFeatureModuleEnabled.mockResolvedValue(true);
    mocks.isDartOpen.mockResolvedValue(true);
    mocks.getTodayDartBullishFeed.mockResolvedValue({ source: "DART", fetchedAt: "2026-11-04T00:00:00.000Z", items: [] });
  });

  it("fetches the feed once after checking feature and schedule gates", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.isFeatureModuleEnabled).toHaveBeenCalledWith("dart-realtime");
    expect(mocks.isDartOpen).toHaveBeenCalledTimes(1);
    expect(mocks.getTodayDartBullishFeed).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({ source: "DART", items: [] });
  });
});
