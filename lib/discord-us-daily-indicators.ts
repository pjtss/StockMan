/** Shared Discord destination for all daily-indicator notifications. */
export function getUsDailyIndicatorsWebhook() {
  return process.env.US_DAILY_INDICATORS_DISCORD_WEBHOOK_URL?.trim() || "";
}
