import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  fetchAllMarketRss: vi.fn(),
  fetchMarketRssSource: vi.fn(),
  translateMarketRssItems: vi.fn(),
  previewMarketRssResults: vi.fn(),
  translationClient: { translate: vi.fn() },
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: state.requireAdminSession }));
vi.mock("@/lib/market-rss-sources", () => ({
  fetchAllMarketRss: state.fetchAllMarketRss,
  fetchMarketRssSource: state.fetchMarketRssSource,
  MARKET_RSS_SOURCES: ["GLOBENEWSWIRE", "NASDAQ", "NASDAQ_TRADER", "SEC_EDGAR", "STOCKTITAN"],
}));
vi.mock("@/lib/translate-market-rss-item", () => ({ translateMarketRssItems: state.translateMarketRssItems }));
vi.mock("@/lib/market-rss-preview", () => ({ previewMarketRssResults: state.previewMarketRssResults }));
vi.mock("@/lib/error-diagnostics", () => ({ describeError: () => ({ errorCode: "TEST_ERROR", message: "failed" }) }));
vi.mock("@/lib/market-rss-translation-client", () => ({ createMarketRssTranslationClient: () => ({ client: state.translationClient, configured: { azure: true, google: true, primary: "azure-translator" }, getMetrics: () => ({ azure: { apiCalls: 1 }, google: { apiCalls: 0 } }) }) }));

import { GET } from "./route";
import { TranslationClientOperationError } from "@/lib/translation-types";

afterEach(() => vi.unstubAllEnvs());

const feed = {
  source: "STOCKTITAN",
  url: "https://www.stocktitan.net/rss",
  fetchedAt: "2026-10-20T00:00:00.000Z",
  items: [{ id: "1", title: "Original title", summary: "Original summary", link: "https://example.com", publishedAt: null, source: "STOCKTITAN" }],
};

describe("market RSS translation test API scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.requireAdminSession.mockResolvedValue(true);
    state.fetchMarketRssSource.mockResolvedValue(feed);
    state.translateMarketRssItems.mockImplementation(async (items: unknown[]) => items.map((item) => ({ ...item, translatedTitle: "제목 번역" })));
    state.fetchAllMarketRss.mockResolvedValue({ fetchedAt: "2026-10-20T00:00:00.000Z", results: [] });
    state.previewMarketRssResults.mockResolvedValue([]);
  });

  it("defaults an unqualified translation request to StockTitan only", async () => {
    const response = await GET(new Request("http://localhost/api/admin/market-rss-test?translate=true"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe("STOCKTITAN");
    expect(state.fetchMarketRssSource).toHaveBeenCalledWith("STOCKTITAN");
    expect(state.translateMarketRssItems).toHaveBeenCalledWith(feed.items, state.translationClient);
    expect(state.fetchAllMarketRss).not.toHaveBeenCalled();
  });

  it("rejects translation requests for other sources before fetching them", async () => {
    const response = await GET(new Request("http://localhost/api/admin/market-rss-test?source=NASDAQ&translate=true"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ allowedSource: "STOCKTITAN", translatedField: "title" });
    expect(state.fetchMarketRssSource).not.toHaveBeenCalled();
    expect(state.translateMarketRssItems).not.toHaveBeenCalled();
  });

  it("limits translated preview items and enables diagnostics only for a bounded preview", async () => {
    state.previewMarketRssResults.mockImplementation(async (results: Array<{ feed: typeof feed }>, translate: boolean, client: unknown, onItemError?: (item: typeof feed.items[number], error: unknown) => void, onProviderFallback?: (item: typeof feed.items[number], result: { provider: string; providerFallbackError?: string }) => void) => {
      expect(results[0].feed.items).toHaveLength(1);
      expect(translate).toBe(true);
      expect(client).toBe(state.translationClient);
      expect(onItemError).toBeTypeOf("function");
      expect(onProviderFallback).toBeTypeOf("function");
      onItemError?.(feed.items[0], new TranslationClientOperationError("provider_request", new Error("api_key=should-not-leak"), undefined, "azure-translator", 1));
      onProviderFallback?.(feed.items[0], { provider: "azure-translator", providerFallbackError: "Azure API key=should-not-leak was rejected" });
      return [{ source: "STOCKTITAN", ok: true, feed: { ...feed, items: [] } }];
    });
    const response = await GET(new Request("http://localhost/api/admin/market-rss-test?source=STOCKTITAN&translate=true&mode=PREVIEW&limit=1&diagnostics=true"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.translationDiagnostics).toMatchObject([
      { itemId: "1", stage: "provider_request", provider: "azure-translator" },
      { itemId: "1", stage: "provider_fallback", provider: "azure-translator" },
    ]);
    expect(JSON.stringify(body.translationDiagnostics)).not.toContain("should-not-leak");
    expect(state.previewMarketRssResults).toHaveBeenCalledOnce();
  });

  it("reports only the safe Azure Text endpoint shape in authenticated diagnostics", async () => {
    vi.stubEnv("AZURE_TRANSLATOR_ENDPOINT", "https://example.cognitiveservices.azure.com/translator/text/v3.0/translate?subscription-key=must-not-leak");
    const response = await GET(new Request("http://localhost/api/admin/market-rss-test?source=STOCKTITAN&translate=true&mode=PREVIEW&limit=1&diagnostics=true"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.azureEndpoint).toEqual({
      host: "example.cognitiveservices.azure.com",
      path: "/translator/text/v3.0/translate",
      queryPresent: true,
      pathAlreadyContainsTranslate: true,
    });
    expect(JSON.stringify(body.azureEndpoint)).not.toContain("must-not-leak");
  });

  it("rejects invalid preview limits and diagnostic use outside translated preview", async () => {
    const invalidLimit = await GET(new Request("http://localhost/api/admin/market-rss-test?translate=true&limit=101"));
    const wrongMode = await GET(new Request("http://localhost/api/admin/market-rss-test?translate=true&diagnostics=true&mode=FETCH_ONLY"));

    expect(invalidLimit.status).toBe(400);
    expect(wrongMode.status).toBe(400);
    expect(state.fetchMarketRssSource).not.toHaveBeenCalled();
  });
});
