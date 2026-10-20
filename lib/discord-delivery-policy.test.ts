import { describe, expect, it } from "vitest";
import { buildMarketRssQueueEnqueueFailureState, getMarketRssDiscordPerMinuteLimit, isRetryableDiscordError, marketRssDeliveryExternalId, parseMarketRssDeliveryArticleId, withDiscordWaitParameter } from "./discord-delivery-policy";

describe("discord delivery policy", () => {
  it("retries transient Discord responses and network failures", () => {
    expect(isRetryableDiscordError(new Error("Discord HTTP 503"))).toBe(true);
    expect(isRetryableDiscordError(new Error("Discord HTTP 429"))).toBe(true);
    expect(isRetryableDiscordError(new TypeError("fetch failed"))).toBe(true);
  });

  it("does not retry permanent Discord payload errors", () => {
    expect(isRetryableDiscordError(new Error("Discord HTTP 400"))).toBe(false);
    expect(isRetryableDiscordError(new Error("Discord HTTP 404"))).toBe(false);
    expect(isRetryableDiscordError(new Error("Discord HTTP 401"))).toBe(false);
    expect(isRetryableDiscordError(new Error("Discord HTTP 500"))).toBe(true);
  });

  it("uses a stable article identity for RSS retries", () => {
    const externalId = marketRssDeliveryExternalId(890970, 1);
    expect(externalId).toBe("MARKET_RSS:890970:1");
    expect(parseMarketRssDeliveryArticleId(externalId)).toBe(890970);
    expect(parseMarketRssDeliveryArticleId("MARKET_RSS:bad:1")).toBeNull();
  });

  it("adds wait=true without corrupting existing webhook query parameters", () => {
    expect(withDiscordWaitParameter("https://discord.example/webhook?thread_id=123")).toBe("https://discord.example/webhook?thread_id=123&wait=true");
    expect(withDiscordWaitParameter("https://discord.example/webhook?wait=false&thread_id=a%20b#fragment")).toBe("https://discord.example/webhook?wait=true&thread_id=a+b#fragment");
  });

  it.each([
    [undefined, 5],
    ["", 5],
    ["5", 5],
    ["0", 5],
    ["-1", 5],
    ["1.5", 5],
    ["not-a-number", 5],
    ["9007199254740992", 5],
  ])("uses a safe RSS Discord send limit for configuration %s", (raw, expected) => {
    expect(getMarketRssDiscordPerMinuteLimit(raw)).toBe(expected);
  });

  it("returns retryable PENDING article state when durable retry enqueue fails", () => {
    expect(buildMarketRssQueueEnqueueFailureState(2, new Error("database unavailable"))).toEqual({
      notificationStatus: "PENDING",
      notificationAttempts: 2,
      lastError: "discord_retry_enqueue_failed: database unavailable",
    });
  });
});
