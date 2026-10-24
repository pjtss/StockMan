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
  lastFailure: TranslationProviderFailureDiagnostic | null;
};

export type TranslationProviderFailureDiagnostic = {
  provider: string;
  category: "http" | "timeout" | "network" | "provider_response" | "unknown";
  httpStatus: number | null;
  providerCode: string | null;
  providerMessage: string | null;
  requestId: string | null;
  retryAfter: string | null;
  attempts: number;
};

function safeProviderMessage(error: unknown) {
  const value = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!value) return null;
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, (rawUrl) => {
      try {
        const url = new URL(rawUrl);
        url.username = "";
        url.password = "";
        for (const key of [...url.searchParams.keys()]) if (/key|token|secret|auth|credential|pass|pwd/i.test(key)) url.searchParams.set(key, "[redacted]");
        return url.toString();
      } catch { return "[redacted URL]"; }
    })
    .replace(/(\bauthorization\s*[:=]\s*)(?:bearer\s+)?("[^"]*"|'[^']*'|[^\s,;)}]+)/gi, "$1[redacted]")
    .replace(/(ocp-apim-subscription-key\s*[:=]\s*)[^\s,;)}]+/gi, "$1[redacted]")
    .replace(/((?:api[_-]?key|access[_-]?token|token|secret|password|passwd|pwd)\s*[=:]\s*)\S+/gi, "$1[redacted]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240) || null;
}

function describeProviderFailure(error: unknown, provider: string, attempts: number): TranslationProviderFailureDiagnostic {
  const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const statusValue = Number(details.status);
  const httpStatus = Number.isInteger(statusValue) && statusValue >= 100 && statusValue <= 599 ? statusValue : null;
  const providerCode = typeof details.providerCode === "string" || typeof details.providerCode === "number"
    ? String(details.providerCode).slice(0, 80)
    : null;
  const requestId = typeof details.requestId === "string" && /^[\w.:-]{1,128}$/.test(details.requestId) ? details.requestId : null;
  const retryAfter = typeof details.retryAfter === "string" && /^\d{1,6}$/.test(details.retryAfter) ? details.retryAfter : null;
  const name = error instanceof Error ? error.name : "";
  const code = typeof details.code === "string" ? details.code : "";
  const category: TranslationProviderFailureDiagnostic["category"] = httpStatus !== null
    ? "http"
    : /timeout/i.test(name) || /timeout|timed out|abort/i.test(error instanceof Error ? error.message : "")
      ? "timeout"
      : /fetch|network|connect|dns|socket/i.test(code) || /fetch failed|network|connect|dns|socket/i.test(error instanceof Error ? error.message : "")
        ? "network"
        : providerCode ? "provider_response" : "unknown";
  return { provider, category, httpStatus, providerCode, providerMessage: safeProviderMessage(error), requestId, retryAfter, attempts };
}

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
    lastFailure: null,
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
    const characterCount = countTranslationCharacters(text, provider);
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
      metrics.lastFailure = describeProviderFailure(error, provider, requestCount);
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
