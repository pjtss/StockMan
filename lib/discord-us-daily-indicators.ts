/** Shared Discord destination for all daily-indicator notifications. */
export function getUsDailyIndicatorsWebhook() {
  return process.env.US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL?.trim() || "";
}

export function requireUsDailyIndicatorsWebhook() {
  const webhook = getUsDailyIndicatorsWebhook();
  if (!webhook) throw new Error("US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL is not configured");
  return webhook;
}
