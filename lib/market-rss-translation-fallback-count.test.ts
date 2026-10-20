import { describe, expect, it } from "vitest";
import { countMarketRssTranslationFallbackReasons } from "./market-rss-translation-fallback-count";

describe("market RSS translation fallback counts", () => {
  it("preserves each actual reason in a mixed batch and labels missing reasons as unknown", () => {
    expect(countMarketRssTranslationFallbackReasons([
      "cloud_translation_not_configured",
      "translation_input_empty",
      "cloud_translation_not_configured",
      null,
      undefined,
    ])).toEqual({
      cloud_translation_not_configured: 2,
      translation_input_empty: 1,
      unknown: 2,
    });
  });
});
