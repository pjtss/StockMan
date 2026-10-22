import type { MarketRssItem } from "./market-rss";
import type { TranslationClient } from "./translation-types";
import { restoreMarketRssTranslationTokens } from "./market-rss-translation-protection";
import { extractMarketRssTranslatedHeadline, prepareMarketRssTranslationInput } from "./market-rss-translation-input";
import { isMarketRssTranslationHeadlineComplete, isMarketRssTranslationKoreanEnough } from "./market-rss-translation-quality";
import { createMarketRssTranslationClient } from "./market-rss-translation-client";
import { mapWithConcurrency } from "./map-with-concurrency";

export const MARKET_RSS_TRANSLATION_CONCURRENCY = 3;

export type TranslatedMarketRssItem = MarketRssItem & { translatedTitle: string; translatedSummary: string; translatedContent?: string; translationCandidateTitle?: string; translationFallback: boolean; translationFallbackReason?: string; translationNotRequired?: boolean; requestOrigin?: "PROVIDER" | "CACHE" | "QUOTA_FALLBACK"; translationProvider?: string; translationProviderAttempts?: number };
export type MarketRssTranslationItemErrorHandler = (item: MarketRssItem, error: unknown) => void;
export async function translateMarketRssItem(item: MarketRssItem, client?: TranslationClient, cacheRecoveryAttempt = false): Promise<TranslatedMarketRssItem> {
  const protectedHeadline = prepareMarketRssTranslationInput(item.title);
  const preparedInput = protectedHeadline;
  const translatableText = protectedHeadline.text.replace(/ZX\d+Q/g, "");
  // Skip only titles whose remaining letters are all Hangul. Checking only
  // Latin letters would incorrectly skip mixed Korean/CJK/Cyrillic headlines.
  const normalizedHeadlineForLanguage = translatableText.normalize("NFC");
  const hasHangul = /[가-힣]/.test(normalizedHeadlineForLanguage);
  const hasNonHangulLetters = /\p{L}/u.test(normalizedHeadlineForLanguage.replace(/[가-힣]/g, ""));
  if (hasHangul && !hasNonHangulLetters) {
    return { ...item, translatedTitle: item.title, translatedSummary: item.summary, ...(item.content ? { translatedContent: item.content } : {}), translationFallback: false, translationNotRequired: true };
  }
  // RSS publishers occasionally emit an empty or markup-only headline. Avoid
  // charging the provider for input that cannot produce a useful title.
  if (!translatableText.replace(/<[^>]*>/g, " ").replace(/[\s\p{P}\p{S}\p{N}]/gu, "").trim()) {
    return { ...item, translatedTitle: item.title, translatedSummary: item.summary, ...(item.content ? { translatedContent: item.content } : {}), translationFallback: true, translationFallbackReason: "translation_input_empty" };
  }
  const selectedClient: TranslationClient | null = client ?? createMarketRssTranslationClient({ deferCacheWriteUntilValidated: true }).client;
  if (!selectedClient) return { ...item, translatedTitle: item.title, translatedSummary: item.summary, ...(item.content ? { translatedContent: item.content } : {}), translationFallback: true, translationFallbackReason: "cloud_translation_not_configured" };
  // RSS feeds can contain mixed-language headlines, so let the selected provider
  // detect the source instead of forcing English for every publisher.
  let title = await selectedClient.translate(preparedInput.text, "auto", "ko", preparedInput.format);
  const invalidateCachedResponse = async () => {
    if (title.requestOrigin === "CACHE") {
      // A cache-origin response is safe to retry only after confirmed removal.
      return await selectedClient.invalidateCache?.(preparedInput.text, "auto", "ko", preparedInput.format) ?? false;
    }
    return true;
  };
  const validationFallback = async (translationFallbackReason: string, translationCandidateTitle?: string) => {
    const cacheInvalidated = await invalidateCachedResponse();
    if (cacheInvalidated && title.requestOrigin === "CACHE" && !cacheRecoveryAttempt) return null;
    return {
      ...item,
      translatedTitle: item.title,
      translatedSummary: item.summary,
      ...(item.content ? { translatedContent: item.content } : {}),
      ...(translationCandidateTitle ? { translationCandidateTitle } : {}),
      translationFallback: true,
      translationFallbackReason: cacheInvalidated ? translationFallbackReason : "translation_cache_invalidation_failed",
      requestOrigin: title.requestOrigin,
      translationProvider: title.provider,
      translationProviderAttempts: title.requestOrigin === "PROVIDER" ? title.providerAttemptCount ?? 1 : 0,
    };
  };
  // Quota-aware clients return the original input with an explicit fallback
  // reason when no provider translation was attempted. Do not reinterpret
  // that intentional fallback as a missing Korean provider response.
  if (title.fallback) {
    return {
      ...item,
      translatedTitle: item.title,
      translatedSummary: item.summary,
      ...(item.content ? { translatedContent: item.content } : {}),
      translationFallback: true,
      ...(title.fallbackReason ? { translationFallbackReason: title.fallbackReason } : {}),
      requestOrigin: title.requestOrigin,
      translationProvider: title.provider,
      translationProviderAttempts: title.requestOrigin === "PROVIDER" ? title.providerAttemptCount ?? 1 : 0,
    };
  }
  const normalizedProviderText = title.translatedText.normalize("NFC");
  const hasProviderMarkup = /<\/?[a-z][^>]*>/i.test(normalizedProviderText);
  const providerHeadline = extractMarketRssTranslatedHeadline(normalizedProviderText) ?? (hasProviderMarkup ? null : normalizedProviderText);
  const restoredText = restoreMarketRssTranslationTokens(normalizedProviderText, preparedInput.placeholders);
  if (!restoredText.ok) {
    const fallback = await validationFallback("protected_token_mismatch");
    return fallback ?? translateMarketRssItem(item, selectedClient, true);
  }
  const translatedHeadline = extractMarketRssTranslatedHeadline(restoredText.text) ?? (hasProviderMarkup ? null : restoredText.text);
  if (!translatedHeadline) {
    const fallback = await validationFallback("translation_response_unparseable");
    return fallback ?? translateMarketRssItem(item, selectedClient, true);
  }
  // Every ASCII numeral in the source headline is protected as a placeholder.
  // Any numeral returned outside those placeholders was not present in the
  // headline and could fabricate a price, percentage, year, or financial value.
  const unprotectedHeadlineDigits = (providerHeadline || "")
    .replace(/ZX\d+Q/g, "")
    .replace(/&#(?:x[\da-f]+|\d+);/gi, "");
  const providerHeadlineWithSigns = (providerHeadline || "")
    .replace(/&#(?:43|x2b);/gi, "+")
    .replace(/&#(?:45|x2d);/gi, "-");
  const unprotectedFinancialSign = /[+\-−﹣－]ZX\d+Q|ZX\d+Q[+\-−﹣－]/i.test(providerHeadlineWithSigns);
  if (/[0-9]/.test(unprotectedHeadlineDigits) || unprotectedFinancialSign) {
    const fallback = await validationFallback("translation_numeric_hallucination", translatedHeadline);
    return fallback ?? translateMarketRssItem(item, selectedClient, true);
  }
  const hasSourceLettersToTranslate = /\p{L}/u.test(protectedHeadline.text.replace(/ZX\d+Q/g, "").replace(/[가-힣]/g, ""));
  if (hasSourceLettersToTranslate && (!providerHeadline || !isMarketRssTranslationKoreanEnough(providerHeadline))) {
    const normalizedCandidate = translatedHeadline.normalize("NFC").replace(/\s+/gu, " ").trim();
    const normalizedSource = item.title.normalize("NFC").replace(/\s+/gu, " ").trim();
    const candidate = normalizedCandidate && normalizedCandidate !== normalizedSource ? translatedHeadline : undefined;
    const fallback = await validationFallback("target_language_not_detected", candidate);
    return fallback ?? translateMarketRssItem(item, selectedClient, true);
  }
  if (hasSourceLettersToTranslate && providerHeadline && !isMarketRssTranslationHeadlineComplete(protectedHeadline.text, providerHeadline)) {
    const fallback = await validationFallback("translation_output_incomplete", translatedHeadline);
    return fallback ?? translateMarketRssItem(item, selectedClient, true);
  }
  try {
    await selectedClient.commitCache?.(preparedInput.text, "auto", "ko", preparedInput.format);
  } catch {
    // Cache writes are optional and must not invalidate a validated translation.
  }
  // The summary is sent only as bounded context to disambiguate the headline;
  // only the translated headline is persisted as translated output. Keep the
  // original summary/body available to callers without translating them.
  return { ...item, translatedTitle: translatedHeadline, translatedSummary: item.summary, ...(item.content ? { translatedContent: item.content } : {}), translationFallback: title.fallback, translationFallbackReason: title.fallbackReason, requestOrigin: title.requestOrigin, translationProvider: title.provider, translationProviderAttempts: title.requestOrigin === "PROVIDER" ? title.providerAttemptCount ?? 1 : 0 };
}

export async function translateMarketRssItems(items: MarketRssItem[], client?: TranslationClient, onItemError?: MarketRssTranslationItemErrorHandler) {
  // 외부 번역 API의 과부하를 막기 위해 동시성을 제한하되, 항목별 네트워크
  // 대기시간이 전체 배치에 직렬로 누적되지 않도록 bounded worker를 사용한다.
  return mapWithConcurrency(items, MARKET_RSS_TRANSLATION_CONCURRENCY, async (item) => {
    try {
      return await translateMarketRssItem(item, client);
    } catch (error) {
      onItemError?.(item, error);
      return {
        ...item,
        translatedTitle: item.title,
        translatedSummary: item.summary,
        ...(item.content ? { translatedContent: item.content } : {}),
        translationFallback: true,
        translationFallbackReason: "translation_api_error",
      };
    }
  });
}
