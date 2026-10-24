import { describe, expect, it } from "vitest";
import { isMarketRssDiscordSourceAllowed, MARKET_RSS_DISCORD_ALLOWED_SOURCES } from "./market-rss-discord-policy";

describe("market RSS Discord source policy", () => {
  it("allows exactly GlobeNewswire, StockTitan, and SEC", () => {
    expect(MARKET_RSS_DISCORD_ALLOWED_SOURCES).toEqual(["GLOBENEWSWIRE", "STOCKTITAN", "SEC_EDGAR"]);
    expect(isMarketRssDiscordSourceAllowed("GLOBENEWSWIRE")).toBe(true);
    expect(isMarketRssDiscordSourceAllowed("SEC_EDGAR")).toBe(true);
    expect(isMarketRssDiscordSourceAllowed("STOCKTITAN")).toBe(true);
  });

  it.each(["NEWSIS", "NASDAQ", "", undefined, null])("rejects out-of-scope and missing sources %s", (source) => expect(isMarketRssDiscordSourceAllowed(source)).toBe(false));
});
