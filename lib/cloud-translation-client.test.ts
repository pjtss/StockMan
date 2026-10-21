import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudTranslationClient } from "./cloud-translation-client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

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
    expect(String(url)).toContain("/language/translate/v2");
    expect(String(url)).not.toContain("key=");
    expect(init.headers).toMatchObject({ "x-goog-api-key": "test-key" });
    expect(init.body).toContain('"q":"Hello"');
  });

  it("omits source for automatic detection and returns Google's detected language", async () => {
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { translations: [{ translatedText: "삼성전자 주가 상승", detectedSourceLanguage: "en" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await CloudTranslationClient.fromEnvironment()!.translate("삼성전자 shares rise", "auto", "ko");

    expect(result).toMatchObject({ translatedText: "삼성전자 주가 상승", source: "en", target: "ko" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ q: "삼성전자 shares rise", target: "ko", format: "text" });
  });

  it.each(["ja", "zh-CN", undefined])("does not mislabel an unsupported or absent auto-detected language as English (%s)", async (detectedSourceLanguage) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { translations: [{ translatedText: "매출이 증가했습니다", ...(detectedSourceLanguage ? { detectedSourceLanguage } : {}) }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new CloudTranslationClient("test-key").translate("Revenue increased", "auto", "ko");

    expect(result).toMatchObject({ translatedText: "매출이 증가했습니다", source: "auto", target: "ko" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ q: "Revenue increased", target: "ko", format: "text" });
  });

  it("sends structured RSS context using the documented HTML format", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { translations: [{ translatedText: "<div><p>주가 상승</p><p>실적 전망 개선</p></div>" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new CloudTranslationClient("test-key").translate("<div><p>Stock rises</p><p>Outlook improves</p></div>", "auto", "ko", "html");

    expect(result.translatedText).toContain("<p>주가 상승</p>");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ q: "<div><p>Stock rises</p><p>Outlook improves</p></div>", target: "ko", format: "html" });
  });

  it("retries a transient provider failure", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("temporary", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ data: { translations: [{ translatedText: "재시도 성공" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new CloudTranslationClient("test-key").translate("Retry");
    expect(result.translatedText).toBe("재시도 성공");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a transient HTTP status even when the provider message contains HTTP text", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Upstream proxy returned HTTP 500 while translating" } }), { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { translations: [{ translatedText: "재시도 성공" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new CloudTranslationClient("test-key").translate("Retry status"))
      .resolves.toMatchObject({ translatedText: "재시도 성공" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not infer an HTTP status from a malformed successful provider response", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "HTTP 503 is mentioned in the payload" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { translations: [{ translatedText: "재시도 성공" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const translation = new CloudTranslationClient("test-key").translate("Retry malformed success");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(translation).resolves.toMatchObject({ translatedText: "재시도 성공" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a successful HTTP response whose translatedText is empty", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { translations: [{ translatedText: "   " }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { translations: [{ translatedText: "유효한 번역" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const translation = new CloudTranslationClient("test-key").translate("Retry empty result");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(translation).resolves.toMatchObject({ translatedText: "유효한 번역" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry when all successful HTTP responses contain empty translatedText", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: { translations: [{ translatedText: "  " }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const translation = new CloudTranslationClient("test-key").translate("Always empty");
    const rejection = expect(translation).rejects.toThrow("missing usable translatedText");
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back to safe defaults for invalid retry and timeout configuration", async () => {
    vi.stubEnv("CLOUD_TRANSLATION_RETRIES", "not-a-number");
    vi.stubEnv("CLOUD_TRANSLATION_TIMEOUT_MS", "0");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { translations: [{ translatedText: "기본 설정으로 성공" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new CloudTranslationClient("test-key").translate("Defaults"))
      .resolves.toMatchObject({ translatedText: "기본 설정으로 성공" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal).toBeDefined();
  });

  it("rejects timeout values above the Node timer maximum instead of creating an immediate timeout", async () => {
    vi.stubEnv("CLOUD_TRANSLATION_TIMEOUT_MS", "2147483648");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { translations: [{ translatedText: "기본 timeout으로 성공" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new CloudTranslationClient("test-key").translate("Timeout maximum"))
      .resolves.toMatchObject({ translatedText: "기본 timeout으로 성공" });
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
  });

  it("keeps Retry-After when an error response body is not JSON", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("upstream busy", { status: 429, headers: { "retry-after": "3" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { translations: [{ translatedText: "완료" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const translation = new CloudTranslationClient("test-key").translate("Retry malformed response");
    await vi.advanceTimersByTimeAsync(2_999);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await expect(translation).resolves.toMatchObject({ translatedText: "완료" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries 403 user rate limits but not daily quota exhaustion", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "User Rate Limit Exceeded", errors: [{ reason: "userRateLimitExceeded" }] } }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { translations: [{ translatedText: "성공" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const translation = new CloudTranslationClient("test-key").translate("Retry");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(translation).resolves.toMatchObject({ translatedText: "성공" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const dailyLimitFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Daily Limit Exceeded" } }), { status: 403 }));
    vi.stubGlobal("fetch", dailyLimitFetch);
    await expect(new CloudTranslationClient("test-key").translate("No retry")).rejects.toThrow("dailyLimitExceeded");
    expect(dailyLimitFetch).toHaveBeenCalledOnce();
  });

  it("honors Retry-After for HTTP 429 within the bounded backoff", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "3" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { translations: [{ translatedText: "완료" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const translation = new CloudTranslationClient("test-key").translate("Retry after");
    await vi.advanceTimersByTimeAsync(2_999);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await expect(translation).resolves.toMatchObject({ translatedText: "완료" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
