import { AzureTranslationClient } from "./azure-translation-client";
import { CloudTranslationClient } from "./cloud-translation-client";
import { AZURE_TRANSLATION_HOURLY_LIMIT, AZURE_TRANSLATION_MONTHLY_LIMIT, AZURE_TRANSLATION_PROVIDER, GOOGLE_TRANSLATION_HOURLY_LIMIT, GOOGLE_TRANSLATION_PROVIDER, TRANSLATION_LIMIT } from "./translation-cache";
import { createQuotaAwareTranslationClient, type TranslationQuotaDependencies } from "./quota-aware-translation-client";
import type { TranslationClient, TranslationFormat, TranslationLanguage, TranslationResult, TranslationSourceLanguage } from "./translation-types";
import { TranslationClientOperationError } from "./translation-types";

function requestKey(text: string, source: TranslationSourceLanguage, target: TranslationLanguage, format: TranslationFormat) { return `${source}\u0000${target}\u0000${format}\u0000${text}`; }

export function getMarketRssTranslationProviders() {
  const azure = AzureTranslationClient.fromEnvironment();
  const google = CloudTranslationClient.fromEnvironment();
  return { azure, google };
}

export function createMarketRssTranslationClient(options: { deferCacheWriteUntilValidated?: boolean } = {}, onUsage?: (used: number, month: string, quotaExceeded: boolean, provider: string, reason?: string) => Promise<void>, dependencies?: TranslationQuotaDependencies) {
  const configured = getMarketRssTranslationProviders();
  const azure = configured.azure ? createQuotaAwareTranslationClient(configured.azure, onUsage, dependencies, options, { provider: AZURE_TRANSLATION_PROVIDER, monthlyLimit: AZURE_TRANSLATION_MONTHLY_LIMIT, hourlyLimit: AZURE_TRANSLATION_HOURLY_LIMIT }) : null;
  const google = configured.google ? createQuotaAwareTranslationClient(configured.google, onUsage, dependencies, options, { provider: GOOGLE_TRANSLATION_PROVIDER, monthlyLimit: TRANSLATION_LIMIT, hourlyLimit: GOOGLE_TRANSLATION_HOURLY_LIMIT }) : null;
  const routes = new Map<string, TranslationClient>();
  const client: TranslationClient | null = azure || google ? {
    translate: async (text, source = "en", target = "ko", format = "text") => {
      const key = requestKey(text, source, target, format);
      let azureFailure: unknown;
      let azureAttempts = 0;
      if (azure) {
        try {
          const result = await azure.client.translate(text, source, target, format);
          azureAttempts = result.providerAttemptCount ?? (result.requestOrigin === "PROVIDER" ? 1 : 0);
          if (!result.fallback) { routes.set(key, azure.client); return { ...result, providerAttemptCount: azureAttempts }; }
          azureFailure = new Error(result.fallbackReason ?? "Azure translation quota fallback");
        } catch (error) {
          azureFailure = error;
          azureAttempts = error instanceof TranslationClientOperationError ? error.providerAttempts : 0;
        }
      }
      if (google) {
        const result = await google.client.translate(text, source, target, format);
        if (!result.fallback) { routes.set(key, google.client); return { ...result, providerAttemptCount: (result.providerAttemptCount ?? (result.requestOrigin === "PROVIDER" ? 1 : 0)) + azureAttempts }; }
        if (azureFailure) return {
          ...result,
          ...(azureAttempts ? { provider: AZURE_TRANSLATION_PROVIDER, providerAttemptCount: azureAttempts, requestOrigin: "PROVIDER" as const } : {}),
          fallbackReason: result.fallbackReason ?? "all_translation_provider_quotas_reached",
        };
        return result;
      }
      return { translatedText: text, source, target, provider: AZURE_TRANSLATION_PROVIDER, fallback: true, fallbackReason: azureFailure ? "translation_api_error" : "translation_provider_unavailable", ...(azureAttempts ? { providerAttemptCount: azureAttempts, requestOrigin: "PROVIDER" as const } : { requestOrigin: "QUOTA_FALLBACK" as const }) } satisfies TranslationResult;
    },
    ...(options.deferCacheWriteUntilValidated ? {
      commitCache: async (text: string, source: TranslationSourceLanguage = "en", target: TranslationLanguage = "ko", format: TranslationFormat = "text") => {
        const key = requestKey(text, source, target, format); const route = routes.get(key); routes.delete(key); await route?.commitCache?.(text, source, target, format);
      },
      invalidateCache: async (text: string, source: TranslationSourceLanguage = "en", target: TranslationLanguage = "ko", format: TranslationFormat = "text") => {
        const key = requestKey(text, source, target, format); const route = routes.get(key); routes.delete(key); return route?.invalidateCache?.(text, source, target, format) ?? false;
      },
    } : {}),
  } : null;
  return { client, configured: { azure: Boolean(configured.azure), google: Boolean(configured.google), primary: configured.azure ? AZURE_TRANSLATION_PROVIDER : configured.google ? GOOGLE_TRANSLATION_PROVIDER : null }, getMetrics: () => ({ azure: azure?.getMetrics() ?? null, google: google?.getMetrics() ?? null }) };
}
