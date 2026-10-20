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

const PROVIDER = "google-cloud-translation";

type Dependencies = {
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
  onUsage?: (usedCharacters: number, usageMonth: string, quotaExceeded: boolean) => Promise<void>,
  dependencies: Dependencies = {
    loadCache: loadTranslationCache,
    deleteCache: deleteTranslationCache,
    saveCache: saveTranslationCache,
    reserve: reserveTranslationCharacters,
    release: releaseTranslationCharacters,
    recordTranslated: recordTranslatedCharacters,
    getUsageMonth: () => new Date().toISOString().slice(0, 7),
  },
  options: { deferCacheWriteUntilValidated?: boolean } = {},
) {
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
  const cacheProvider = (format: TranslationFormat) => format === "html" ? `${PROVIDER}:html` : PROVIDER;
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
      return { translatedText: cached.translatedText, source: resultSource, target, provider: PROVIDER, fallback: false, requestOrigin: "CACHE" };
    }

    // Pin the reservation month once. Translation can cross UTC midnight and
    // must still be recorded/released against the row originally reserved.
    let usageMonth: string;
    let reservation: Awaited<ReturnType<Dependencies["reserve"]>>;
    try {
      usageMonth = dependencies.getUsageMonth();
      reservation = await dependencies.reserve(characterCount, usageMonth);
    } catch (error) {
      throw new TranslationClientOperationError("quota_reservation", error);
    } finally {
      reservationTurn.release();
    }
    if (!reservation.allowed) {
      metrics.quotaFallbacks++;
      await onUsage?.(reservation.used, usageMonth, true);
      return { translatedText: text, source: resultSource, target, provider: PROVIDER, fallback: true, fallbackReason: "monthly_character_limit_reached", requestOrigin: "QUOTA_FALLBACK" };
    }

    metrics.apiCalls++;
    metrics.reservedCharacters += characterCount;
    let result: TranslationResult;
    try {
      result = await providerClient.translate(text, source, target, format);
    } catch (error) {
      metrics.apiFailures++;
      let cleanupError: unknown;
      try {
        await dependencies.release(characterCount, usageMonth);
        metrics.reservedCharacters -= characterCount;
      } catch (releaseError) {
        cleanupError = releaseError;
        metrics.reservationReleaseFailures++;
      }
      throw new TranslationClientOperationError("provider_request", error, cleanupError);
    }

    if (!result.fallback) {
      try {
        await dependencies.recordTranslated(characterCount, usageMonth);
        metrics.translatedCharacters += characterCount;
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
      await onUsage?.(reservation.used, usageMonth, false);
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
