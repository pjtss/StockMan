import {
  loadTranslationCache,
  countTranslationCharacters,
  type CachedTranslation,
  deleteTranslationCache,
  recordTranslatedCharacters,
  releaseTranslationCharacters,
  reserveTranslationCharacters,
  saveTranslationCache,
} from "./translation-cache";
import { TranslationClientOperationError, type TranslationClient, type TranslationFormat, type TranslationLanguage, type TranslationResult, type TranslationSourceLanguage } from "./translation-types";

import { GOOGLE_TRANSLATION_PROVIDER, TRANSLATION_LIMIT } from "./translation-cache";

export type TranslationQuotaDependencies = {
  loadCache: typeof loadTranslationCache;
  deleteCache: typeof deleteTranslationCache;
  saveCache: typeof saveTranslationCache;
  reserve: typeof reserveTranslationCharacters;
  release: typeof releaseTranslationCharacters;
  recordTranslated: typeof recordTranslatedCharacters;
  getUsageMonth: () => string;
};

export type QuotaAwareTranslationMetrics = {
  cacheHits: number;
  apiCalls: number;
  apiFailures: number;
  reservedCharacters: number;
  translatedCharacters: number;
  quotaFallbacks: number;
  cacheWriteFailures: number;
  usageRecordFailures: number;
  cacheInvalidations: number;
  cacheInvalidationFailures: number;
  reservationReleaseFailures: number;
};

export function createQuotaAwareTranslationClient(
  providerClient: TranslationClient,
  onUsage?: (usedCharacters: number, usageMonth: string, quotaExceeded: boolean, provider: string, reason?: string) => Promise<void>,
  dependencies: TranslationQuotaDependencies = {
    loadCache: loadTranslationCache,
    deleteCache: deleteTranslationCache,
    saveCache: saveTranslationCache,
    reserve: reserveTranslationCharacters,
    release: releaseTranslationCharacters,
    recordTranslated: recordTranslatedCharacters,
    getUsageMonth: () => new Date().toISOString().slice(0, 7),
  },
  options: { deferCacheWriteUntilValidated?: boolean } = {},
  quota: { provider?: string; monthlyLimit?: number; hourlyLimit?: number } = {},
) {
  const provider = quota.provider ?? GOOGLE_TRANSLATION_PROVIDER;
  const monthlyLimit = quota.monthlyLimit ?? TRANSLATION_LIMIT;
  const hourlyLimit = quota.hourlyLimit ?? Number.MAX_SAFE_INTEGER;
  const metrics: QuotaAwareTranslationMetrics = {
    cacheHits: 0,
    apiCalls: 0,
    apiFailures: 0,
    reservedCharacters: 0,
    translatedCharacters: 0,
    quotaFallbacks: 0,
    cacheWriteFailures: 0,
    usageRecordFailures: 0,
    cacheInvalidations: 0,
    cacheInvalidationFailures: 0,
    reservationReleaseFailures: 0,
  };

  const inFlight = new Map<string, Promise<TranslationResult>>();
  const pendingCacheWrites = new Map<string, { text: string; translatedText: string; source: TranslationSourceLanguage; target: TranslationLanguage; format: TranslationFormat }>();
  let reservationTail: Promise<void> = Promise.resolve();
  const enqueueReservationTurn = () => {
    const previous = reservationTail;
    let release!: () => void;
    reservationTail = new Promise<void>((resolve) => { release = resolve; });
    return { previous, release };
  };
  const requestKey = (text: string, source: TranslationSourceLanguage, target: TranslationLanguage, format: TranslationFormat) => `${source}\u0000${target}\u0000${format}\u0000${text}`;
  const cacheProvider = (format: TranslationFormat) => format === "html" ? `${provider}:html` : provider;
  const translateOnce = async (text: string, source: TranslationSourceLanguage, target: TranslationLanguage, format: TranslationFormat, reservationTurn: ReturnType<typeof enqueueReservationTurn>): Promise<TranslationResult> => {
    const resultSource: TranslationLanguage = source === "auto" ? "en" : source;
    const characterCount = countTranslationCharacters(text);
    let cached: CachedTranslation | null;
    try {
      cached = await dependencies.loadCache(text, cacheProvider(format), target);
    } catch (error) {
      await reservationTurn.previous;
      reservationTurn.release();
      throw new TranslationClientOperationError("cache_read", error);
    }
    // Cache reads may complete out of order. Serialize the cache-hit/miss
    // decision and quota reservation in invocation order so a lower-priority
    // RSS row cannot consume the remaining monthly quota first.
    await reservationTurn.previous;
    if (cached) {
      metrics.cacheHits++;
      reservationTurn.release();
      return { translatedText: cached.translatedText, source: resultSource, target, provider, fallback: false, requestOrigin: "CACHE" };
    }

    // Pin the reservation month once. Translation can cross UTC midnight and
    // must still be recorded/released against the row originally reserved.
    let usageMonth: string;
    let reservation: Awaited<ReturnType<TranslationQuotaDependencies["reserve"]>>;
    try {
      usageMonth = dependencies.getUsageMonth();
      reservation = await dependencies.reserve(characterCount, usageMonth, monthlyLimit, provider, hourlyLimit);
    } catch (error) {
      throw new TranslationClientOperationError("quota_reservation", error);
    } finally {
      reservationTurn.release();
    }
    if (!reservation.allowed) {
      metrics.quotaFallbacks++;
      await onUsage?.(reservation.used, usageMonth, true, provider, reservation.reason);
      return { translatedText: text, source: resultSource, target, provider, fallback: true, fallbackReason: reservation.reason ?? "monthly_character_limit_reached", requestOrigin: "QUOTA_FALLBACK" };
    }

    metrics.apiCalls++;
    metrics.reservedCharacters += characterCount;
    let result: TranslationResult;
    let requestCount = 1;
    try {
      let firstRequest = true;
      result = await providerClient.translate(text, source, target, format, { beforeRequest: async () => {
        if (firstRequest) { firstRequest = false; return; }
        const nextMonth = dependencies.getUsageMonth();
        const next = await dependencies.reserve(characterCount, nextMonth, monthlyLimit, provider, hourlyLimit);
        if (!next.allowed) {
          await onUsage?.(next.used, nextMonth, true, provider, next.reason);
          throw Object.assign(new Error(next.reason ?? "monthly_character_limit_reached"), { code: "TRANSLATION_QUOTA_EXCEEDED" });
        }
        requestCount++;
        metrics.apiCalls++;
        metrics.reservedCharacters += characterCount;
        await onUsage?.(next.used, nextMonth, false, provider);
      } });
      (result as TranslationResult & { providerAttemptCount?: number }).providerAttemptCount = requestCount;
    } catch (error) {
      metrics.apiFailures++;
      if ((error as { code?: string })?.code === "TRANSLATION_QUOTA_EXCEEDED") {
        metrics.quotaFallbacks++;
        return { translatedText: text, source: resultSource, target, provider, fallback: true, fallbackReason: (error as Error).message, requestOrigin: "QUOTA_FALLBACK" };
      }
      // A timeout or HTTP error can occur after the provider has consumed input.
      // Keep reservations conservatively; releasing here risks crossing the free cap on retry.
      throw new TranslationClientOperationError("provider_request", error, undefined, provider, requestCount);
    }

    if (!result.fallback) {
      try {
        const translatedCount = characterCount * ((result as TranslationResult & { providerAttemptCount?: number }).providerAttemptCount ?? 1);
        await dependencies.recordTranslated(translatedCount, usageMonth, provider);
        metrics.translatedCharacters += translatedCount;
      } catch {
        // The reservation remains charged against the quota boundary even
        // when the secondary translated-character counter is unavailable.
        metrics.usageRecordFailures++;
      }
      if (options.deferCacheWriteUntilValidated) {
        pendingCacheWrites.set(requestKey(text, source, target, format), { text, translatedText: result.translatedText, source, target, format });
      } else {
        try {
          await dependencies.saveCache(text, result.translatedText, cacheProvider(format), source, target);
        } catch {
          // Cache persistence is an optimization. Do not discard a valid
          // provider translation or make the caller pay for a retry just
          // because this secondary write failed.
          metrics.cacheWriteFailures++;
        }
      }
      await onUsage?.(reservation.used, usageMonth, false, provider);
    }
    return { ...result, requestOrigin: "PROVIDER" };
  };

  const client: TranslationClient = {
      translate: async (
        text: string,
        source: TranslationSourceLanguage = "en",
      target: TranslationLanguage = "ko",
      format: TranslationFormat = "text",
    ): Promise<TranslationResult> => {
      const key = requestKey(text, source, target, format);
      const existing = inFlight.get(key);
      if (existing) return existing;
      const pending = translateOnce(text, source, target, format, enqueueReservationTurn());
      inFlight.set(key, pending);
      try {
        return await pending;
      } finally {
        if (inFlight.get(key) === pending) inFlight.delete(key);
      }
      },
      ...(options.deferCacheWriteUntilValidated ? {
        commitCache: async (text: string, source: TranslationSourceLanguage = "en", target: TranslationLanguage = "ko", format: TranslationFormat = "text") => {
          const key = requestKey(text, source, target, format);
          const pending = pendingCacheWrites.get(key);
          if (!pending) return;
          pendingCacheWrites.delete(key);
          try {
            await dependencies.saveCache(pending.text, pending.translatedText, cacheProvider(format), source, target);
          } catch {
            metrics.cacheWriteFailures++;
          }
        },
        invalidateCache: async (text: string, source: TranslationSourceLanguage = "en", target: TranslationLanguage = "ko", format: TranslationFormat = "text") => {
          pendingCacheWrites.delete(requestKey(text, source, target, format));
          try {
            await dependencies.deleteCache(text, cacheProvider(format), target);
            metrics.cacheInvalidations++;
            return true;
          } catch {
            metrics.cacheInvalidationFailures++;
            return false;
          }
        },
      } : {}),
  };

  return {
    client,
    getMetrics: () => ({ ...metrics }),
  };
}
