import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarketRssTranslationClient } from "./market-rss-translation-client";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const deps = () => ({
  loadCache: vi.fn(async () => null), deleteCache: vi.fn(async () => undefined), saveCache: vi.fn(async () => 1),
  reserve: vi.fn(async () => ({ allowed: true, used: 8, limitReached: false })), release: vi.fn(async () => undefined),
  recordTranslated: vi.fn(async () => undefined), getUsageMonth: vi.fn(() => "2026-10"),
}) as any;

describe("market RSS translation provider order", () => {
  it("uses Azure F0 first and records provider-specific monthly/hourly limits", async () => {
    vi.stubEnv("AZURE_TRANSLATOR_API_KEY", "azure-key"); vi.stubEnv("AZURE_TRANSLATOR_ENDPOINT", "https://azure.test"); vi.stubEnv("AZURE_TRANSLATOR_FREE_TIER_CONFIRMED", "F0");
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "google-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ translations: [{ text: "번역" }] }]), { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    const quota = deps(); const result = await createMarketRssTranslationClient({}, undefined, quota).client!.translate("Headline");
    expect(result).toMatchObject({ translatedText: "번역", provider: "azure-translator" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("azure.test");
    expect(quota.reserve).toHaveBeenCalledWith(8, "2026-10", 1_900_000, "azure-translator", 1_800_000);
  });

  it("falls back to Google after Azure F0 free-quota response while preserving each provider ledger", async () => {
    vi.stubEnv("AZURE_TRANSLATOR_API_KEY", "azure-key"); vi.stubEnv("AZURE_TRANSLATOR_ENDPOINT", "https://azure.test"); vi.stubEnv("AZURE_TRANSLATOR_FREE_TIER_CONFIRMED", "F0");
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "google-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "403001", message: "quota exceeded" } }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { translations: [{ translatedText: "Google 번역" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const quota = deps(); const result = await createMarketRssTranslationClient({}, undefined, quota).client!.translate("Headline");
    expect(result).toMatchObject({ translatedText: "Google 번역", provider: "google-cloud-translation" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("azure.test");
    expect(String(fetchMock.mock.calls[1][0])).toContain("translation.googleapis.com");
    expect(quota.reserve.mock.calls.map((call: unknown[]) => call[3])).toEqual(["azure-translator", "google-cloud-translation"]);
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ "x-goog-api-key": "google-key" });
  });

  it("can explicitly retry with Google after an Azure result fails headline validation", async () => {
    vi.stubEnv("AZURE_TRANSLATOR_API_KEY", "azure-key"); vi.stubEnv("AZURE_TRANSLATOR_ENDPOINT", "https://azure.test"); vi.stubEnv("AZURE_TRANSLATOR_FREE_TIER_CONFIRMED", "F0");
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "google-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ translations: [{ text: "Azure text" }] }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { translations: [{ translatedText: "Google 한국어 제목" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const quota = deps();
    const result = createMarketRssTranslationClient({}, undefined, quota);

    const primary = await result.client!.translate("Headline");
    const fallback = await result.client!.translateFallbackProvider!("Headline");

    expect(primary.provider).toBe("azure-translator");
    expect(fallback).toMatchObject({ provider: "google-cloud-translation", translatedText: "Google 한국어 제목", fallback: false });
    expect(quota.reserve.mock.calls.map((call: unknown[]) => call[3])).toEqual(["azure-translator", "google-cloud-translation"]);
    expect(String(fetchMock.mock.calls[1][0])).toContain("translation.googleapis.com");
  });

  it("preserves the Azure failure reason for admin diagnostics when Google quota blocks fallback", async () => {
    vi.stubEnv("AZURE_TRANSLATOR_API_KEY", "azure-key"); vi.stubEnv("AZURE_TRANSLATOR_ENDPOINT", "https://azure.test"); vi.stubEnv("AZURE_TRANSLATOR_FREE_TIER_CONFIRMED", "F0");
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "google-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "401000", message: "Invalid subscription key" } }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const quota = deps();
    quota.reserve.mockImplementation(async (_count: number, _month: string, _limit: number, provider: string) => provider === "google-cloud-translation"
      ? { allowed: false, used: 300_000, limitReached: true, reason: "monthly_character_limit_reached" }
      : { allowed: true, used: 8, limitReached: false });

    const result = await createMarketRssTranslationClient({}, undefined, quota).client!.translate("Headline");

    expect(result).toMatchObject({
      fallback: true,
      fallbackReason: "monthly_character_limit_reached",
      provider: "azure-translator",
      providerFallbackError: "Azure Translator HTTP 401 (401000 Invalid subscription key)",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps Google as fallback-only when Azure F0 confirmation is absent", async () => {
    vi.stubEnv("AZURE_TRANSLATOR_API_KEY", "azure-key"); vi.stubEnv("AZURE_TRANSLATOR_ENDPOINT", "https://azure.test"); vi.stubEnv("AZURE_TRANSLATOR_FREE_TIER_CONFIRMED", "S1");
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "google-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { translations: [{ translatedText: "Google 번역" }] } }), { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    const result = await createMarketRssTranslationClient({}, undefined, deps()).client!.translate("Headline");
    expect(result.provider).toBe("google-cloud-translation");
    expect(String(fetchMock.mock.calls[0][0])).toContain("translation.googleapis.com");
  });
});
