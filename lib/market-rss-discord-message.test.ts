import { describe, expect, it } from "vitest";
import { DISCORD_SUPPRESS_EMBEDS_FLAG, simplifyMarketRssDiscordMessage } from "./market-rss-discord-message";

describe("market RSS Discord messages", () => {
  it("keeps only the linked title and published time from legacy messages", () => {
    const message = [
      "🚨 **해외시장 RSS 속보**",
      "[**Company announces a new product**](https://example.com/article)",
      "원문 제목: Company announces a new product",
      "발행: 2026. 10. 20. 오전 9:30:00",
      "출처: NASDAQ · 번역 fallback",
      "티커: ABC · NASDAQ",
      "등락률: 2.5% · 거래대금: 100달러",
    ].join("\n");

    expect(simplifyMarketRssDiscordMessage(message)).toBe([
      "[**Company announces a new product**](https://example.com/article)",
      "발행: 2026. 10. 20. 오전 9:30:00",
    ].join("\n"));
  });

  it("keeps title-only content when a publication time is missing", () => {
    expect(simplifyMarketRssDiscordMessage("**Headline**\n출처: SEC_EDGAR")).toBe("**Headline**");
  });

  it("uses Discord's suppress-embeds message flag", () => {
    expect(DISCORD_SUPPRESS_EMBEDS_FLAG).toBe(1 << 2);
  });
});
