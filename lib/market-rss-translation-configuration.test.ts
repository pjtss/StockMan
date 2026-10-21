import { describe, expect, it } from "vitest";
import { getMarketRssTranslationConfiguration } from "./market-rss-translation-configuration";

describe("market RSS translation configuration summary", () => {
  it("distinguishes an unrequested translation from a configured provider", () => {
    expect(getMarketRssTranslationConfiguration(false, true)).toEqual({ requested: false, configured: false, status: "NOT_REQUESTED", provider: null });
    expect(getMarketRssTranslationConfiguration(true, true)).toMatchObject({ requested: true, configured: true, status: "READY", provider: "Google Cloud Translation Basic v2 (Azure F0 미설정)", primary: "google-cloud-translation", azureF0Configured: false });
    expect(getMarketRssTranslationConfiguration(true, true, { azure: true, google: true, primary: "azure-translator" })).toMatchObject({ provider: "Azure Translator F0 → Google Cloud Translation Basic v2", primary: "azure-translator", fallback: "google-cloud-translation" });
  });

  it("explicitly identifies requested translation when its API key is missing without exposing secrets", () => {
    expect(getMarketRssTranslationConfiguration(true, false)).toMatchObject({ requested: true, configured: false, status: "API_KEY_MISSING", provider: null });
  });
});
