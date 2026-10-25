import { describe, expect, it } from "vitest";
import type { TranslatedMarketRssItem } from "./translate-market-rss-item";
import { buildMarketRssTranslationPersistence } from "./market-rss-translation-persistence";
import { prepareMarketRssTranslationInput } from "./market-rss-translation-input";
import { countTranslationCharacters } from "./translation-cache";

const row = { title: "삼성전자 3분기 실적", translationAttempts: 2 };
const item = (overrides: Partial<TranslatedMarketRssItem>): TranslatedMarketRssItem => ({
  id: "persist-test",
  title: row.title,
  summary: "원문 요약",
  translatedTitle: row.title,
  translatedSummary: "원문 요약",
  link: "https://example.com",
  publishedAt: null,
  source: "TEST",
  translationFallback: false,
  ...overrides,
});

describe("market RSS translation persistence mapping", () => {
  it("persists already-Korean as non-fallback skipped without provider usage or an attempt", () => {
    const processedAt = new Date("2026-09-25T01:00:00.000Z");
    const update = buildMarketRssTranslationPersistence(row, item({ translationNotRequired: true }), processedAt);

    expect(update).toMatchObject({
      translationProvider: null,
      translationCharCount: 0,
      translationSkippedReason: "already_in_target_language",
      translationTranslatedAt: null,
      translationFallback: false,
      translationAttempts: 2,
      translationStatus: "SKIPPED",
    });
    expect(update.translationAttemptedAt).toBe(processedAt);
    expect(update.updatedAt).toBe(processedAt);
  });

  it("persists successful translations with provider, counted input, and completion time", () => {
    const processedAt = new Date("2026-09-25T01:00:00.000Z");
    const translated = item({ translatedTitle: "Samsung Electronics 실적" });
    const update = buildMarketRssTranslationPersistence(row, translated, processedAt);

    expect(update.translationProvider).toBe("google-cloud-translation");
    expect(update.translationCharCount).toBe(countTranslationCharacters(prepareMarketRssTranslationInput(row.title).text));
    expect(update.translationSkippedReason).toBeNull();
    expect(update.translationTranslatedAt).toBe(processedAt);
    expect(update.translationAttempts).toBe(3);
    expect(update.translationStatus).toBe("TRANSLATED");
  });

  it("persists provider fallbacks without marking them translated", () => {
    const update = buildMarketRssTranslationPersistence(row, item({
      translationFallback: true,
      translationFallbackReason: "protected_token_mismatch",
    }));

    expect(update).toMatchObject({
      translationSkippedReason: "protected_token_mismatch",
      translationTranslatedAt: null,
      translationFallback: true,
      translationError: "protected_token_mismatch",
      translationAttempts: 3,
      translationStatus: "SKIPPED",
    });
  });

  it("stores only an explicitly retained incomplete-output candidate for human review", () => {
    const update = buildMarketRssTranslationPersistence(row, item({
      translationFallback: true,
      translationFallbackReason: "translation_output_incomplete",
      translationCandidateTitle: "매출 증가",
    }));

    expect(update).toMatchObject({
      translatedTitle: row.title,
      translationCandidateTitle: "매출 증가",
      translationSkippedReason: "translation_output_incomplete",
      translationStatus: "SKIPPED",
    });
  });

  it("persists numeric-hallucination candidates with their reason and provider usage", () => {
    const update = buildMarketRssTranslationPersistence(row, item({
      translationFallback: true,
      translationFallbackReason: "translation_numeric_hallucination",
      translationFallbackDetails: "unprotected=25;financialSign=false;signedNumeral=false",
      translationCandidateTitle: "삼성전자 매출 25% 증가",
      requestOrigin: "PROVIDER",
      translationProviderAttempts: 1,
    }));

    expect(update).toMatchObject({
      translatedTitle: row.title,
      translationCandidateTitle: "삼성전자 매출 25% 증가",
      translationSkippedReason: "translation_numeric_hallucination",
      translationError: "translation_numeric_hallucination:unprotected=25;financialSign=false;signedNumeral=false",
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationProvider: "google-cloud-translation",
    });
    expect(update.translationCharCount).toBeGreaterThan(0);
  });

  it("clears candidate output for ordinary successes and fallbacks", () => {
    expect(buildMarketRssTranslationPersistence(row, item({})).translationCandidateTitle).toBeNull();
    expect(buildMarketRssTranslationPersistence(row, item({ translationFallback: true, translationFallbackReason: "target_language_not_detected" })).translationCandidateTitle).toBeNull();
  });

  it("persists unusable source headlines as retryable, unbilled fallbacks", () => {
    const update = buildMarketRssTranslationPersistence(row, item({
      translatedTitle: "",
      translationFallback: true,
      translationFallbackReason: "translation_input_empty",
    }));

    expect(update).toMatchObject({
      translationSkippedReason: "translation_input_empty",
      translationTranslatedAt: null,
      translationFallback: true,
      translationError: "translation_input_empty",
      translationProvider: null,
      translationCharCount: 0,
      translationStatus: "SKIPPED",
      translationAttempts: 3,
    });
  });

  it("preserves the monthly-quota reason so alerting and next-month retry rules remain effective", () => {
    const update = buildMarketRssTranslationPersistence(row, item({
      translationFallback: true,
      translationFallbackReason: "monthly_character_limit_reached",
    }));

    expect(update).toMatchObject({
      translationSkippedReason: "monthly_character_limit_reached",
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationProvider: null,
      translationCharCount: 0,
    });
  });

  it("does not record a provider or billed characters when translation is not configured", () => {
    const update = buildMarketRssTranslationPersistence(row, item({
      translationFallback: true,
      translationFallbackReason: "cloud_translation_not_configured",
    }));

    expect(update).toMatchObject({
      translationProvider: null,
      translationCharCount: 0,
      translationSkippedReason: "cloud_translation_not_configured",
      translationStatus: "SKIPPED",
    });
  });

  it("still records provider usage when an actual provider response fails validation", () => {
    const update = buildMarketRssTranslationPersistence(row, item({
      translationFallback: true,
      translationFallbackReason: "target_language_not_detected",
    }));

    expect(update.translationProvider).toBe("google-cloud-translation");
    expect(update.translationCharCount).toBeGreaterThan(0);
  });

  it("multiplies persisted character usage by the provider recovery attempts", () => {
    const inputCharacters = countTranslationCharacters(prepareMarketRssTranslationInput(row.title).text);
    const update = buildMarketRssTranslationPersistence(row, item({
      translatedTitle: "삼성전자 실적",
      requestOrigin: "PROVIDER",
      translationProviderAttempts: 2,
    }));

    expect(update).toMatchObject({
      translationProvider: "google-cloud-translation",
      translationCharCount: inputCharacters * 2,
      translationAttempts: 3,
      translationStatus: "TRANSLATED",
    });
  });

  it("does not count a cached translation as a new provider request", () => {
    const update = buildMarketRssTranslationPersistence(row, item({
      translatedTitle: "캐시 번역",
      requestOrigin: "CACHE",
      translationProviderAttempts: 0,
    }));

    expect(update).toMatchObject({ translationProvider: null, translationCharCount: 0, translationStatus: "TRANSLATED" });
  });
});
