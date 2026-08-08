import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import type { FeatureModuleKey } from "@/lib/feature-modules";

/** DB feature settings are preferred; environment variables remain a safe migration fallback. */
export async function loadFeatureDiscordWebhook(moduleKey: FeatureModuleKey, fallbackEnvKeys: string[]) {
  try {
    const settings = await loadFeatureModuleSettings(moduleKey);
    const configured = settings.featureSettings?.discordFormat?.webhookUrl;
    if (typeof configured === "string" && configured.trim()) return configured.trim();
  } catch {
    // Configuration lookup must never disable an existing automation.
  }
  return fallbackEnvKeys.map((key) => process.env[key]?.trim()).find(Boolean) || "";
}

export async function loadFeatureDiscordDebugWebhook(moduleKey: FeatureModuleKey, fallbackEnvKeys = ["STOCKMAN_DEBUG_DISCORD_WEBHOOK_URL"]) {
  try {
    const settings = await loadFeatureModuleSettings(moduleKey);
    const configured = settings.featureSettings?.discordFormat?.debugWebhookUrl;
    if (typeof configured === "string" && configured.trim()) return configured.trim();
  } catch { /* diagnostics must not break the primary automation */ }
  return fallbackEnvKeys.map((key) => process.env[key]?.trim()).find(Boolean) || "";
}
