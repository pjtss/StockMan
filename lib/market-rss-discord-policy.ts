// These three sources are the complete market RSS Discord alert scope.
export const MARKET_RSS_DISCORD_ALLOWED_SOURCES = ["GLOBENEWSWIRE", "STOCKTITAN", "SEC_EDGAR"] as const;

export function isMarketRssDiscordSourceAllowed(source: string | null | undefined): boolean {
  return source != null && MARKET_RSS_DISCORD_ALLOWED_SOURCES.includes(source as typeof MARKET_RSS_DISCORD_ALLOWED_SOURCES[number]);
}
