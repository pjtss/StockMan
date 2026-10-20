import { describe, expect, it } from "vitest";
import { isMarketRssDiscordSourceAllowed, MARKET_RSS_DISCORD_ALLOWED_SOURCES } from "./market-rss-discord-policy";

describe("market RSS Discord source allowlist", () => {
  it("allows SEC and StockTitan only", () => {
    expect(MARKET_RSS_DISCORD_ALLOWED_SOURCES).toEqual(["SEC_EDGAR", "STOCKTITAN"]);
    expect(isMarketRssDiscordSourceAllowed("SEC_EDGAR")).toBe(true);
    expect(isMarketRssDiscordSourceAllowed("STOCKTITAN")).toBe(true);
  });

  it.each(["NEWSIS", "KRX_KIND", "MK", "HANKYUNG", "ETODAY", "NASDAQ", "NASDAQ_TRADER", "GLOBENEWSWIRE", "", undefined, null])(
    "blocks non-allowed RSS source %s",
    (source) => expect(isMarketRssDiscordSourceAllowed(source)).toBe(false),
  );
});
