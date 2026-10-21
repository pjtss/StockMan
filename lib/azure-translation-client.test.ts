import { afterEach, describe, expect, it, vi } from "vitest";
import { AzureTranslationClient } from "./azure-translation-client";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Azure Translator F0 client", () => {
  it("fails closed unless the resource is explicitly confirmed as F0", () => {
    vi.stubEnv("AZURE_TRANSLATOR_API_KEY", "secret-key");
    vi.stubEnv("AZURE_TRANSLATOR_ENDPOINT", "https://example.cognitiveservices.azure.com");
    vi.stubEnv("AZURE_TRANSLATOR_FREE_TIER_CONFIRMED", "");
    expect(AzureTranslationClient.fromEnvironment()).toBeNull();
  });

  it("uses the documented endpoint and auth headers without exposing credentials in URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ translations: [{ text: "주가 상승", to: "ko" }] }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AzureTranslationClient("secret-key", "https://region.cognitiveservices.azure.com", "koreacentral");
    const result = await client.translate("Shares rise", "en", "ko");
    const [url, init] = fetchMock.mock.calls[0];
    expect(result).toMatchObject({ translatedText: "주가 상승", provider: "azure-translator", fallback: false });
    expect(String(url)).toContain("/translate?api-version=3.0&to=ko&from=en");
    expect(String(url)).not.toContain("secret-key");
    expect(init.headers).toMatchObject({ "Ocp-Apim-Subscription-Key": "secret-key", "Ocp-Apim-Subscription-Region": "koreacentral" });
  });

  it("charges each network retry through its pre-request hook", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify([{ translations: [{ text: "재시도 성공" }] }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const beforeRequest = vi.fn(async () => undefined);
    const pending = new AzureTranslationClient("key", "https://example.test").translate("Retry", "en", "ko", "text", { beforeRequest });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ translatedText: "재시도 성공" });
    expect(beforeRequest).toHaveBeenCalledTimes(2);
  });

  it("rejects inputs above Azure's documented request ceiling before calling fetch", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(new AzureTranslationClient("key", "https://example.test").translate("x".repeat(50_001))).rejects.toThrow("50,000-character");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
