import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
export async function isDailyCandleAutomationEnabled() {
  const settings = await loadFeatureModuleSettings("us-daily-indicators");
  // Indicator execution and candle-cache refresh are independent controls.
  // Disabling the indicator module must not stop cache/open-price/Bollinger
  // jobs. Only an explicit global opt-out disables the daily automation set.
  return (settings.featureSettings?.evaluation as Record<string, unknown> | undefined)?.dailyAutomationEnabled !== false;
}
