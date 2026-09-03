import { describe, expect, it, vi } from "vitest";

const getAutomationIntervalSeconds = vi.hoisted(() => vi.fn());
vi.mock("@/lib/automation-settings", () => ({ getAutomationIntervalSeconds }));

import { GET } from "./route";

describe("automation settings API", () => {
  it("returns the configured interval", async () => {
    getAutomationIntervalSeconds.mockResolvedValueOnce(30);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ intervalSeconds: 30 });
  });

  it("returns a safe service-unavailable response on storage failure", async () => {
    getAutomationIntervalSeconds.mockRejectedValueOnce(new Error("DB unavailable"));
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "AUTOMATION_SETTINGS_UNAVAILABLE" });
  });
});
