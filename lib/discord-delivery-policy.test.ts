import { describe, expect, it } from "vitest";
import { isRetryableDiscordError, marketRssDeliveryExternalId, parseMarketRssDeliveryArticleId } from "./discord-delivery-policy";

describe("discord delivery policy", () => {
  it("retries transient Discord responses and network failures", () => {
    expect(isRetryableDiscordError(new Error("Discord HTTP 503"))).toBe(true);
    expect(isRetryableDiscordError(new Error("Discord HTTP 429"))).toBe(true);
    expect(isRetryableDiscordError(new TypeError("fetch failed"))).toBe(true);
  });

  it("does not retry permanent Discord payload errors", () => {
    expect(isRetryableDiscordError(new Error("Discord HTTP 400"))).toBe(false);
    expect(isRetryableDiscordError(new Error("Discord HTTP 404"))).toBe(false);
  });

  it("uses a stable article identity for RSS retries", () => {
    const externalId = marketRssDeliveryExternalId(890970, 1);
    expect(externalId).toBe("MARKET_RSS:890970:1");
    expect(parseMarketRssDeliveryArticleId(externalId)).toBe(890970);
    expect(parseMarketRssDeliveryArticleId("MARKET_RSS:bad:1")).toBeNull();
  });
});
