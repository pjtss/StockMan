import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadFeatureModuleSettings: vi.fn(),
  loadFeatureDiscordDebugWebhook: vi.fn(),
}));

vi.mock("./feature-module-settings", () => ({ loadFeatureModuleSettings: mocks.loadFeatureModuleSettings }));
vi.mock("./discord-config", () => ({ loadFeatureDiscordDebugWebhook: mocks.loadFeatureDiscordDebugWebhook }));

import { notifyAutomationCompletion } from "./automation-completion-discord";

describe("automation completion Discord notification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    mocks.loadFeatureModuleSettings.mockResolvedValue({ featureSettings: { automationCompletion: { enabled: true, webhookUrl: "" } } });
    mocks.loadFeatureDiscordDebugWebhook.mockResolvedValue("");
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

  it("suppresses routine RSS success messages to avoid cron notification spam", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(notifyAutomationCompletion("market-rss", "SUCCESS", {})).resolves.toEqual({
      sent: false,
      skipped: true,
      reason: "success_notifications_suppressed",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends RSS partial alerts with localized translation fallback counts", async () => {
    mocks.loadFeatureDiscordDebugWebhook.mockResolvedValue("https://discord.example/rss-debug");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(notifyAutomationCompletion("market-rss", "PARTIAL", {
      partialFailureCount: 2,
      translationFailureCount: 2,
      translated: {
        fallback: 2,
        failed: 0,
        fallbackReasons: { target_language_not_detected: 1, translation_cache_invalidation_failed: 1 },
      },
    })).resolves.toMatchObject({ sent: true });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { content: string };
    expect(body.content).toContain("시장 RSS 통합 자동화 완료");
    expect(body.content).not.toContain("해외 일봉 시가 캐시");
    expect(body.content).toContain("부분 완료(RSS 수집/번역 일부 실패)");
    expect(body.content).toContain("RSS 번역 fallback: 한국어 결과 확인 1건 · 불량 캐시 삭제 실패 1건");
    expect(body.content).not.toContain("target_language_not_detected");
  });

  it("uses the feature registry label for Bollinger automation alerts too", async () => {
    mocks.loadFeatureDiscordDebugWebhook.mockResolvedValue("https://discord.example/bollinger-debug");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(notifyAutomationCompletion("kr-bollinger-band", "PARTIAL", {
      partialFailureCount: 1,
      failureCount: 1,
    })).resolves.toMatchObject({ sent: true });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { content: string };
    expect(body.content).toContain("국내 일봉 볼린저밴드 하단 이탈 자동화 완료");
    expect(body.content).not.toContain("해외 일봉 시가 캐시");
  });

  it("signals when the Discord fallback summary omits additional reason categories", async () => {
    mocks.loadFeatureDiscordDebugWebhook.mockResolvedValue("https://discord.example/rss-debug");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(notifyAutomationCompletion("market-rss", "PARTIAL", {
      partialFailureCount: 5,
      translationFailureCount: 5,
      translated: {
        fallback: 5,
        fallbackReasons: {
          target_language_not_detected: 1,
          translation_cache_invalidation_failed: 1,
          translation_output_incomplete: 1,
          translation_api_error: 1,
          provider_daily_quota_exceeded: 1,
        },
      },
    })).resolves.toMatchObject({ sent: true });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { content: string };
    expect(body.content).toContain("외 1종 생략");
    expect(body.content).not.toContain("provider_daily_quota_exceeded");
  });

  it("explains invalid RSS stage counters in the completion alert", async () => {
    mocks.loadFeatureDiscordDebugWebhook.mockResolvedValue("https://discord.example/rss-debug");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(notifyAutomationCompletion("market-rss", "PARTIAL", {
      counterDataInvalid: true,
      partialFailureCount: 0,
      ingestFailureCount: 0,
      translationFailureCount: 0,
    })).resolves.toMatchObject({ sent: true });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { content: string };
    expect(body.content).toContain("counterDataInvalid");
    expect(body.content).toContain("실제 실패 건수 확인 필요");
  });

});
