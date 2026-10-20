import { describe, expect, it } from "vitest";
import { getMarketRssTranslationConfiguration } from "./market-rss-translation-configuration";

describe("market RSS translation configuration summary", () => {
  it("distinguishes an unrequested translation from a configured provider", () => {
    expect(getMarketRssTranslationConfiguration(false, true)).toEqual({ requested: false, configured: false, status: "NOT_REQUESTED", provider: null });
    expect(getMarketRssTranslationConfiguration(true, true)).toEqual({ requested: true, configured: true, status: "READY", provider: "Google Cloud Translation Basic v2" });
  });

  it("explicitly identifies requested translation when its API key is missing without exposing secrets", () => {
    expect(getMarketRssTranslationConfiguration(true, false)).toEqual({ requested: true, configured: false, status: "API_KEY_MISSING", provider: null });
  });
});
