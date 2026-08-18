import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadFeatureModuleSettings: vi.fn(),
}));

vi.mock("./feature-module-settings", () => ({ loadFeatureModuleSettings: mocks.loadFeatureModuleSettings }));

import { notifyAutomationCompletion } from "./automation-completion-discord";

describe("automation completion Discord notification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    mocks.loadFeatureModuleSettings.mockResolvedValue({ featureSettings: { automationCompletion: { enabled: true, webhookUrl: "" } } });
  });

  it("skips modules outside the completion notification contract", async () => {
    await expect(notifyAutomationCompletion("us-daily-indicators", "SUCCESS", {})).resolves.toEqual({ sent: false, skipped: true, reason: "module_not_supported" });
  });

  it("sends a compact completion summary using the module webhook", async () => {
    mocks.loadFeatureModuleSettings.mockResolvedValue({ featureSettings: { automationCompletion: { enabled: true, webhookUrl: "https://discord.example/webhook" } } });
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(notifyAutomationCompletion("kr-daily-cache", "SUCCESS", {
      instrumentCount: 12,
      successCount: 11,
      failureCount: 1,
      observability: { durationMs: 1500 },
    })).resolves.toMatchObject({ sent: true, skipped: false });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://discord.example/webhook?wait=true");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ username: "STOCKMAN 자동화", allowed_mentions: { parse: [] } });
    expect(String(init.body)).toContain("소요 시간: 1.50초");
  });

  it("retries transient Discord failures and reports the attempt count", async () => {
    mocks.loadFeatureModuleSettings.mockResolvedValue({ featureSettings: { automationCompletion: { enabled: true, webhookUrl: "https://discord.example/webhook" } } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(notifyAutomationCompletion("us-daily-cache", "SUCCESS", {})).resolves.toMatchObject({ sent: true, attempts: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the environment fallback when the module webhook is empty", async () => {
    vi.stubEnv("AUTOMATION_COMPLETION_DISCORD_WEBHOOK_URL", "https://discord.example/fallback");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await notifyAutomationCompletion("us-free-float", "FAILED", { diagnostics: { message: "source unavailable" } }, "source unavailable");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://discord.example/fallback?wait=true");
    expect(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)).toContain("source unavailable");
  });
});
