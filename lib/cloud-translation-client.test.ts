import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudTranslationClient } from "./cloud-translation-client";

afterEach(() => vi.unstubAllEnvs());

describe("CloudTranslationClient", () => {
  it("returns no client when the API key is absent", () => {
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "");
    expect(CloudTranslationClient.fromEnvironment()).toBeNull();
  });

  it("translates through the official v2 REST shape", async () => {
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { translations: [{ translatedText: "안녕하세요" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await CloudTranslationClient.fromEnvironment()!.translate("Hello");
    expect(result).toMatchObject({ translatedText: "안녕하세요", source: "en", target: "ko", provider: "google-cloud-translation", fallback: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/language/translate/v2?key=test-key");
    expect(init.body).toContain('"q":"Hello"');
  });
});
