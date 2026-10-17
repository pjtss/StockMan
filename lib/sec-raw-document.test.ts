import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSecRawDocument } from "./sec-raw-document";

describe("fetchSecRawDocument", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.SEC_REQUEST_TIMEOUT_MS;
    delete process.env.SEC_DOCUMENT_MAX_BYTES;
  });

  it("rejects non-SEC URLs before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSecRawDocument("https://example.com/filing.htm"))
      .rejects.toThrow("SEC 원문 URL은 sec.gov의 HTTPS 주소여야 합니다.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the configured timeout and returns SEC filing content", async () => {
    process.env.SEC_REQUEST_TIMEOUT_MS = "7000";
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn().mockResolvedValue(new Response("<html><body>filing</body></html>"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchSecRawDocument("https://www.sec.gov/Archives/edgar/data/1/000000000126000001/a.htm");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(timeoutSpy).toHaveBeenCalledWith(7000);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.signal as AbortSignal).aborted).toBe(false);
    expect(result.html).toContain("filing");
    expect(result.text).toContain("filing");
  });

  it("rejects a declared body larger than the configured maximum", async () => {
    process.env.SEC_DOCUMENT_MAX_BYTES = "1024";
    const fetchMock = vi.fn().mockResolvedValue(new Response("too large", {
      headers: { "content-length": "2048" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSecRawDocument("https://www.sec.gov/Archives/edgar/data/1/000000000126000001/a.htm"))
      .rejects.toThrow("SEC 원문 응답이 허용 크기를 초과했습니다.");
  });

  it("enforces the body limit while streaming when content-length is absent", async () => {
    process.env.SEC_DOCUMENT_MAX_BYTES = "1024";
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSecRawDocument("https://www.sec.gov/Archives/edgar/data/1/000000000126000001/a.htm"))
      .rejects.toThrow("SEC 원문 응답이 허용 크기를 초과했습니다.");
  });
});
