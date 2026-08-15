import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
export async function isDailyCandleAutomationEnabled() {
  const settings = await loadFeatureModuleSettings("us-daily-indicators");
  return settings.enabled && (settings.featureSettings?.evaluation as Record<string, unknown> | undefined)?.dailyAutomationEnabled !== false;
}
