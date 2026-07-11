import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDartDiscordWebhookPayload, sendDartAlertToDiscord } from "./discord-dart";
import type { AlertItem } from "./types";

const alert: AlertItem = {
  source: "DART",
  externalId: "20260711000001",
  level: "최강호재",
  company: "테스트 주식회사",
  title: "단일판매ㆍ공급계약체결",
  link: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260711000001",
  publishedAt: "2026-07-11T03:00:00.000Z",
  keywords: ["공급계약"],
};

const originalEnv = process.env;

afterEach(() => {
  process.env = originalEnv;
  vi.unstubAllGlobals();
});

describe("discord-dart", () => {
  it("builds a DART-specific Discord payload", () => {
    const payload = buildDartDiscordWebhookPayload(alert);

    expect(payload.username).toBe("STOCKMAN DART");
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds[0].title).toContain("테스트 주식회사");
    expect(payload.embeds[0].url).toBe(alert.link);
  });

  it("uses only DART_DISCORD_WEBHOOK_URL and requests the response body", async () => {
    process.env = {
      ...originalEnv,
      DART_DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/2/dart-token",
      SEC_DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/sec-token",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendDartAlertToDiscord(alert);
    const url = new URL(fetchMock.mock.calls[0][0]);

    expect(result.ok).toBe(true);
    expect(url.pathname).toContain("/2/dart-token");
    expect(url.pathname).not.toContain("sec-token");
    expect(url.searchParams.get("wait")).toBe("true");
  });
});
