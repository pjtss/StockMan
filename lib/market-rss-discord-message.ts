export const DISCORD_SUPPRESS_EMBEDS_FLAG = 1 << 2;

/** Keep the article headline (including its link) and publication time only. */
export function simplifyMarketRssDiscordMessage(content: string) {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const titleLine = lines.find((line) => /^\[\*\*.+\*\*\]\([^)]+\)$/.test(line) || /^\*\*.+\*\*$/.test(line));
  const publishedLine = lines.find((line) => /^발행:\s*\S/.test(line));
  return [titleLine, publishedLine].filter((line): line is string => Boolean(line)).join("\n");
}
