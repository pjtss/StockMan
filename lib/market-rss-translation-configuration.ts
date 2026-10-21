export function getMarketRssTranslationConfiguration(requested: boolean, clientConfigured: boolean, providers?: { azure: boolean; google: boolean; primary: string | null }) {
  if (!requested) return { requested: false as const, configured: false, status: "NOT_REQUESTED" as const, provider: null };
  if (!clientConfigured) return { requested: true as const, configured: false, status: "API_KEY_MISSING" as const, provider: null, primary: null, fallback: null, azureF0Configured: false };
  const primary = providers?.primary ?? "google-cloud-translation";
  return { requested: true as const, configured: true, status: "READY" as const, provider: primary === "azure-translator" ? "Azure Translator F0 → Google Cloud Translation Basic v2" : "Google Cloud Translation Basic v2 (Azure F0 미설정)", primary, fallback: providers?.azure && providers?.google ? "google-cloud-translation" : null, azureF0Configured: providers?.azure ?? false };
}
