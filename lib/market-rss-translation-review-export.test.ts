import { describe, expect, it } from "vitest";
import { buildMarketRssTranslationReviewCsv, getMarketRssTranslationReviewArticles } from "./market-rss-translation-review-export";

const article = (overrides: Record<string, unknown> = {}) => ({
  externalId: "nasdaq-story-123",
  title: "Revenue rises 20%",
  summary: "The company reported quarterly revenue growth after raising its annual outlook.",
  translatedTitle: "매출 20% 증가",
  translationCandidateTitle: null,
  translationStatus: "TRANSLATED",
  translationFallback: false,
  translationSkippedReason: null,
  detectedTicker: "NVDA",
  source: "NASDAQ",
  publishedAt: "2026-09-25T01:00:00.000Z",
  link: "https://example.com/article",
  ...overrides,
});

describe("market RSS translation review export", () => {
  it("includes only successful provider translations and leaves human review fields blank", () => {
    const result = buildMarketRssTranslationReviewCsv([
      article(),
      article({ translationFallback: true }),
      article({ translationStatus: "SKIPPED", translationSkippedReason: "already_in_target_language" }),
      article({ translatedTitle: null }),
    ]);

    expect(result.count).toBe(1);
    expect(result.content.charCodeAt(0)).toBe(0xfeff);
    expect(result.content).toContain('"","Revenue rises 20%","The company reported quarterly revenue growth after raising its annual outlook.","매출 20% 증가","RSS-TICKER:NVDA","NASDAQ","RSS-ID:nasdaq-story-123"');
    expect(result.content).toContain("RSS-TIME:2026-09-25T01:00:00.000Z");
    expect(result.content).toContain("수정 번역");
    expect(result.content).toContain("검수 메모");
    expect(result.content).not.toContain("already_in_target_language");
  });

  it("escapes quotes, multiline values, and spreadsheet formula prefixes", () => {
    const result = buildMarketRssTranslationReviewCsv([article({
      title: '=HYPERLINK("https://bad.example")',
      translatedTitle: "첫 줄\n두 번째 줄",
      source: "@NASDAQ",
    })]);

    expect(result.content).toContain("'=HYPERLINK(\"\"https://bad.example\"\")");
    expect(result.content).toContain('"첫 줄\n두 번째 줄"');
    expect(result.content).toContain("'@NASDAQ");
  });

  it("prompts the reviewer to verify missing context instead of silently implying a complete review", () => {
    const result = buildMarketRssTranslationReviewCsv([
      article({ summary: "", link: "https://example.com/article" }),
      article({ externalId: "no-context", summary: null, link: "" }),
      article({ externalId: "no-link", link: "" }),
    ]);

    expect(result.content).toContain('"","원문 요약 없음 · 원문 링크에서 맥락 확인"');
    expect(result.content).toContain('"","원문 요약·링크 없음 · 맥락 확인 후 판정"');
    expect(result.content).toContain('"","원문 링크 없음 · 제공된 문맥만으로 검수"');
  });

  it("returns an empty review set when no provider translation is eligible", () => {
    expect(getMarketRssTranslationReviewArticles([
      article({ translationStatus: "PENDING" }),
      article({ translationFallback: true }),
    ])).toEqual([]);
  });

  it("keeps technical provider failures and quota fallbacks out of semantic review candidates", () => {
    const result = buildMarketRssTranslationReviewCsv([
      article({
        translatedTitle: "Revenue rises 20%",
        translationStatus: "FAILED",
        translationFallback: true,
        translationSkippedReason: "translation_api_error",
      }),
      article({
        translatedTitle: "Revenue rises 20%",
        translationStatus: "SKIPPED",
        translationFallback: true,
        translationSkippedReason: "provider_daily_quota_exceeded",
      }),
      article({ translationStatus: "PENDING", translatedTitle: null }),
    ]);

    expect(result.count).toBe(0);
    expect(result.content).not.toContain("Revenue rises 20%");
  });

  it("exports a retained incomplete candidate for human review, not the original-title fallback", () => {
    const result = buildMarketRssTranslationReviewCsv([article({
      translatedTitle: "Revenue rises 20%",
      translationStatus: "SKIPPED",
      translationFallback: true,
      translationSkippedReason: "translation_output_incomplete",
      translationCandidateTitle: "매출 증가",
    })]);

    expect(result.count).toBe(1);
    expect(result.content).toContain('"","Revenue rises 20%","The company reported quarterly revenue growth after raising its annual outlook.","매출 증가"');
    expect(result.content).toContain("RSS-REVIEW-CANDIDATE:incomplete · 자동 검사에서 부분 번역 의심으로 fallback · 후보 번역 검수");
  });

  it("exports a distinct provider candidate rejected by the target-language ratio check", () => {
    const candidate = article({
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "target_language_not_detected",
      translationCandidateTitle: "Nvidia revenue rises",
    });
    const result = buildMarketRssTranslationReviewCsv([candidate]);

    expect(getMarketRssTranslationReviewArticles([candidate])).toHaveLength(1);
    expect(result.count).toBe(1);
    expect(result.content).toContain('"","Revenue rises 20%","The company reported quarterly revenue growth after raising its annual outlook.","Nvidia revenue rises"');
    expect(result.content).toContain("RSS-REVIEW-CANDIDATE:target-language · 한국어 비율 검사 실패로 fallback · provider 후보 번역 검수");
  });

  it("exports a provider candidate rejected for adding a numeric claim", () => {
    const candidate = article({
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "translation_numeric_hallucination",
      translatedTitle: "Revenue rises",
      translationCandidateTitle: "매출 25% 증가",
    });
    const result = buildMarketRssTranslationReviewCsv([candidate]);

    expect(result.count).toBe(1);
    expect(result.content).toContain("매출 25% 증가");
    expect(result.content).toContain("RSS-REVIEW-CANDIDATE:numeric-hallucination");
    expect(result.content).toContain("원문에 없는 숫자/부호가 번역 제목에서 감지됨");
  });

  it("exports an untrusted candidate when failed-cache invalidation prevents recovery", () => {
    const candidate = article({
      translatedTitle: "Revenue rises 20%",
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "translation_cache_invalidation_failed",
      translationCandidateTitle: "매출 증가",
    });
    const result = buildMarketRssTranslationReviewCsv([candidate]);

    expect(result.count).toBe(1);
    expect(result.content).toContain("매출 증가");
    expect(result.content).toContain("RSS-REVIEW-CANDIDATE:cache-invalidation");
    expect(result.content).toContain("후보를 신뢰하지 말고 원문과 대조");
  });

  it("keeps target-language failures without a distinct candidate and unrelated fallback candidates out", () => {
    const result = getMarketRssTranslationReviewArticles([
      article({
        translationFallback: true,
        translationStatus: "SKIPPED",
        translationSkippedReason: "target_language_not_detected",
        translationCandidateTitle: null,
      }),
      article({
        translationFallback: true,
        translationStatus: "SKIPPED",
        translationSkippedReason: "translation_api_error",
        translationCandidateTitle: "Provider output",
      }),
    ]);

    expect(result).toEqual([]);
  });
});
