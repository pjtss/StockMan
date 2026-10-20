export const MARKET_RSS_DISCORD_ALLOWED_SOURCES = ["SEC_EDGAR", "STOCKTITAN"] as const;

export function isMarketRssDiscordSourceAllowed(source: string | null | undefined): boolean {
  return source != null && MARKET_RSS_DISCORD_ALLOWED_SOURCES.includes(source as typeof MARKET_RSS_DISCORD_ALLOWED_SOURCES[number]);
}
