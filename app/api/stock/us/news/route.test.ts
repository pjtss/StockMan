import { describe, expect, it, vi } from "vitest";

const fetchTickerNews = vi.hoisted(() => vi.fn());
vi.mock("@/lib/kis-news-radar", () => ({ fetchTickerNews }));

import { GET } from "./route";

describe("US stock news API", () => {
  it("normalizes a valid ticker before querying", async () => {
    fetchTickerNews.mockResolvedValueOnce({ date: "2026-09-03", items: [] });
    const response = await GET(new Request("http://localhost/api/stock/us/news?ticker=%20aapl%20"));
    expect(response.status).toBe(200);
    expect(fetchTickerNews).toHaveBeenCalledWith("AAPL", { period: "today", exchange: undefined });
  });

  it("rejects invalid and oversized tickers", async () => {
    expect((await GET(new Request("http://localhost/api/stock/us/news?ticker=bad%20ticker"))).status).toBe(400);
    expect((await GET(new Request(`http://localhost/api/stock/us/news?ticker=${"A".repeat(33)}`))).status).toBe(400);
    expect(fetchTickerNews).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported exchanges before calling the provider", async () => {
    const response = await GET(new Request("http://localhost/api/stock/us/news?ticker=AAPL&exchange=LSE"));
    expect(response.status).toBe(400);
    expect(fetchTickerNews).toHaveBeenCalledTimes(1);
  });
});
