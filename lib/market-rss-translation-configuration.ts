export function getMarketRssTranslationConfiguration(requested: boolean, clientConfigured: boolean) {
  if (!requested) return { requested: false as const, configured: false, status: "NOT_REQUESTED" as const, provider: null };
  if (!clientConfigured) return { requested: true as const, configured: false, status: "API_KEY_MISSING" as const, provider: null };
  return { requested: true as const, configured: true, status: "READY" as const, provider: "Google Cloud Translation Basic v2" };
}
