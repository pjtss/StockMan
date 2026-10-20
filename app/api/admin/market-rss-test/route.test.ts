import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  fetchAllMarketRss: vi.fn(),
  fetchMarketRssSource: vi.fn(),
  translateMarketRssItems: vi.fn(),
  previewMarketRssResults: vi.fn(),
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

import { GET } from "./route";

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
    expect(state.translateMarketRssItems).toHaveBeenCalledWith(feed.items);
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
});
