import type { MarketRssItem } from "./market-rss";
import type { TranslationClient, TranslationResult } from "./translation-types";
import { restoreMarketRssTranslationTokens } from "./market-rss-translation-protection";
import { extractMarketRssTranslatedHeadline, prepareMarketRssTranslationInput } from "./market-rss-translation-input";
import { isMarketRssTranslationHeadlineComplete, isMarketRssTranslationKoreanEnough } from "./market-rss-translation-quality";
import { createMarketRssTranslationClient } from "./market-rss-translation-client";
import { mapWithConcurrency } from "./map-with-concurrency";
import { AZURE_TRANSLATION_PROVIDER } from "./translation-cache";
import { localizeSecFilingTitle } from "./market-rss-sec-filing-title";

export const MARKET_RSS_TRANSLATION_CONCURRENCY = 3;

const ENGLISH_NUMBER_WORD_VALUES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9,
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16,
  seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30, fortieth: 40,
  fiftieth: 50, sixtieth: 60, seventieth: 70, eightieth: 80, ninetieth: 90,
};

function getAllowedSpelledNumberValues(sourceTitle: string) {
  const words = sourceTitle.toLocaleLowerCase("en").match(/[a-z]+/g) || [];
  const allowed = new Set<number>();
  const allowedMonthNumbers = new Set<number>();
  for (let index = 0; index < words.length; index++) {
    const value = ENGLISH_NUMBER_WORD_VALUES[words[index]];
    const month = ENGLISH_MONTH_NUMBER_VALUES[words[index]];
    if (value !== undefined) allowed.add(value);
    if (month !== undefined) allowedMonthNumbers.add(month);
    if (value === undefined) continue;
    const next = ENGLISH_NUMBER_WORD_VALUES[words[index + 1]];
    // Translators commonly render spelled ordinals and compound numbers as
    // Arabic digits (for example, “third quarter” as “3분기”).
    if (value >= 20 && value < 100 && next !== undefined && next > 0 && next < 10) {
      allowed.add(value + next);
    }
  }
  return { numbers: allowed, months: allowedMonthNumbers };
}

const ENGLISH_MONTH_NUMBER_VALUES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function hasUnprotectedFinancialSign(providerHeadline: string, protectedSourceHeadline: string, placeholders: Array<{ marker: string; original: string }>) {
  const isFinancialSign = (value: string | undefined) => Boolean(value && /[+\-−﹣－]/u.test(value));
  return placeholders.some(({ marker }) => {
    const providerIndex = providerHeadline.indexOf(marker);
    const sourceIndex = protectedSourceHeadline.indexOf(marker);
    if (providerIndex < 0 || sourceIndex < 0) return false;

    const providerBefore = providerHeadline[providerIndex - 1];
    const providerAfter = providerHeadline[providerIndex + marker.length];
    const sourceBefore = protectedSourceHeadline[sourceIndex - 1];
    const sourceAfter = protectedSourceHeadline[sourceIndex + marker.length];
    return (isFinancialSign(providerBefore) && providerBefore !== sourceBefore)
      || (isFinancialSign(providerAfter) && providerAfter !== sourceAfter);
  });
}

export type TranslatedMarketRssItem = MarketRssItem & { translatedTitle: string; translatedSummary: string; translatedContent?: string; translationCandidateTitle?: string; translationFallback: boolean; translationFallbackReason?: string; translationNotRequired?: boolean; requestOrigin?: "PROVIDER" | "CACHE" | "QUOTA_FALLBACK"; translationProvider?: string; translationProviderAttempts?: number };
export type MarketRssTranslationItemErrorHandler = (item: MarketRssItem, error: unknown) => void;
export type MarketRssTranslationFallbackHandler = (item: MarketRssItem, result: TranslationResult) => void;
export async function translateMarketRssItem(item: MarketRssItem, client?: TranslationClient, cacheRecoveryAttempt = false, onProviderFallback?: MarketRssTranslationFallbackHandler, providerFallbackAttempted = false, prefetchedTranslation?: TranslationResult): Promise<TranslatedMarketRssItem> {
  if (item.source === "SEC_EDGAR") {
    const localizedFilingTitle = localizeSecFilingTitle(item.title);
    if (localizedFilingTitle) {
      return {
        ...item,
        translatedTitle: localizedFilingTitle,
        translatedSummary: item.summary,
        ...(item.content ? { translatedContent: item.content } : {}),
        translationFallback: false,
        translationProvider: "sec-filing-title-localization",
        translationProviderAttempts: 0,
      };
    }
  }
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
  let title = prefetchedTranslation ?? await selectedClient.translate(preparedInput.text, "auto", "ko", preparedInput.format);
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
    if (!providerFallbackAttempted && title.provider === AZURE_TRANSLATION_PROVIDER && title.requestOrigin === "PROVIDER" && selectedClient.translateFallbackProvider) {
      try {
        const fallbackTitle = await selectedClient.translateFallbackProvider(preparedInput.text, "auto", "ko", preparedInput.format);
        if (!fallbackTitle.fallback) {
          const fallbackClient: TranslationClient = {
            translate: async () => fallbackTitle,
            ...(selectedClient.commitCache ? { commitCache: (...args) => selectedClient.commitCache!(...args) } : {}),
            ...(selectedClient.invalidateCache ? { invalidateCache: (...args) => selectedClient.invalidateCache!(...args) } : {}),
          };
          return await translateMarketRssItem(item, fallbackClient, false, onProviderFallback, true, fallbackTitle);
        }
      } catch {
        // Preserve the primary validation failure if the alternate provider is unavailable.
      }
    }
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
    if (title.providerFallbackError) onProviderFallback?.(item, title);
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
  // Arabic numerals already present in the source are protected as placeholders.
  // A translator may also render an English number word as a numeral, such as
  // “third quarter” → “3분기”; allow only values found in the source words.
  const unprotectedHeadlineDigits = (providerHeadline || "")
    .replace(/ZX\d+Q/g, "")
    .replace(/&#(?:x[\da-f]+|\d+);/gi, "");
  const allowedSpelledNumbers = getAllowedSpelledNumberValues(item.title);
  const unprotectedNumerals = unprotectedHeadlineDigits.match(/\d+/g) || [];
  const inventedNumeral = unprotectedNumerals.some((value) => {
    const numericValue = Number(value);
    if (allowedSpelledNumbers.numbers.has(numericValue)) return false;
    const monthSuffix = new RegExp(`(?:^|\\D)${value}\\s*월`, "u");
    return !allowedSpelledNumbers.months.has(numericValue) || !monthSuffix.test(unprotectedHeadlineDigits);
  });
  const providerHeadlineWithSigns = (providerHeadline || "")
    .replace(/&#(?:43|x2b);/gi, "+")
    .replace(/&#(?:45|x2d);/gi, "-");
  const unprotectedFinancialSign = hasUnprotectedFinancialSign(providerHeadlineWithSigns, preparedInput.text, preparedInput.placeholders);
  const signedUnprotectedNumeral = /[+\-−﹣－]\s*\d/.test(unprotectedHeadlineDigits);
  if (inventedNumeral || unprotectedFinancialSign || signedUnprotectedNumeral) {
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
  // The provider receives only the prepared title above. Summary and body are
  // carried through unchanged and are never submitted for translation.
  return { ...item, translatedTitle: translatedHeadline, translatedSummary: item.summary, ...(item.content ? { translatedContent: item.content } : {}), translationFallback: title.fallback, translationFallbackReason: title.fallbackReason, requestOrigin: title.requestOrigin, translationProvider: title.provider, translationProviderAttempts: title.requestOrigin === "PROVIDER" ? title.providerAttemptCount ?? 1 : 0 };
}

export async function translateMarketRssItems(items: MarketRssItem[], client?: TranslationClient, onItemError?: MarketRssTranslationItemErrorHandler, onProviderFallback?: MarketRssTranslationFallbackHandler) {
  // 외부 번역 API의 과부하를 막기 위해 동시성을 제한하되, 항목별 네트워크
  // 대기시간이 전체 배치에 직렬로 누적되지 않도록 bounded worker를 사용한다.
  return mapWithConcurrency(items, MARKET_RSS_TRANSLATION_CONCURRENCY, async (item) => {
    try {
      return await translateMarketRssItem(item, client, false, onProviderFallback);
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
