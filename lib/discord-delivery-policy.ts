export function isRetryableDiscordError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\bDiscord HTTP (\d{3})\b/i);
  if (!match) return true;
  const status = Number(match[1]);
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function createDiscordHttpError(response: Response) {
  let retryAfterSeconds: number | undefined;
  const headerValue = response.headers.get("retry-after") || response.headers.get("x-ratelimit-reset-after");
  if (headerValue) {
    const parsed = Number(headerValue);
    if (Number.isFinite(parsed) && parsed >= 0) retryAfterSeconds = parsed;
  }
  if (retryAfterSeconds === undefined && response.status === 429) {
    const body = await response.clone().json().catch(() => null) as { retry_after?: unknown } | null;
    const parsed = Number(body?.retry_after);
    if (Number.isFinite(parsed) && parsed >= 0) retryAfterSeconds = parsed;
  }
  const message = `Discord HTTP ${response.status}${retryAfterSeconds === undefined ? "" : ` retry_after=${retryAfterSeconds}`}`;
  return Object.assign(new Error(message), { status: response.status, retryAfterSeconds });
}

export function getDiscordRetryDelayMs(attempts: number, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\bretry_after=(\d+(?:\.\d+)?)/i);
  const seconds = match ? Number(match[1]) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(24 * 60 * 60_000, Math.ceil(seconds * 1_000));
  return Math.min(3_600_000, 2 ** Math.min(Math.max(1, attempts), 10) * 1_000);
}

export function buildMarketRssQueueEnqueueFailureState(attempts: number, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    notificationStatus: "PENDING" as const,
    notificationAttempts: attempts,
    lastError: `discord_retry_enqueue_failed: ${detail}`,
  };
}

export function withDiscordWaitParameter(webhookUrl: string) {
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");
  return url.toString();
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
