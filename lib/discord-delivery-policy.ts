export function isRetryableDiscordError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\bDiscord HTTP (\d{3})\b/i);
  if (!match) return true;
  const status = Number(match[1]);
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function marketRssDeliveryExternalId(articleId: number, attempt: number) {
  return `MARKET_RSS:${articleId}:${attempt}`;
}

export function parseMarketRssDeliveryArticleId(externalId: string) {
  const match = externalId.match(/^MARKET_RSS:(\d+):\d+$/);
  if (!match) return null;
  const articleId = Number(match[1]);
  return Number.isSafeInteger(articleId) && articleId > 0 ? articleId : null;
}
