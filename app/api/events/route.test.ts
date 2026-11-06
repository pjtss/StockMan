import { beforeEach, describe, expect, it, vi } from "vitest";

const { listStockmanEvents, listStockmanCollectionStatus, renderStockmanEventsMarkdown } = vi.hoisted(() => ({ listStockmanEvents: vi.fn(), listStockmanCollectionStatus: vi.fn(), renderStockmanEventsMarkdown: vi.fn() }));
vi.mock("@/lib/stockman-events", () => ({ listStockmanEvents, listStockmanCollectionStatus, renderStockmanEventsMarkdown }));

import { GET } from "./route";

describe("GET /api/events", () => {
  beforeEach(() => {
    listStockmanEvents.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, hasMore: false });
    listStockmanCollectionStatus.mockReset().mockResolvedValue([]);
    renderStockmanEventsMarkdown.mockReset().mockReturnValue("# Stockman 최근 호재 보고서");
  });

  it("serves report mode through the live events route", async () => {
    const response = await GET(new Request("https://stockman.example/api/events?view=report&hours=12"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, reportType: "BULLISH", hours: 12, markdown: expect.any(String) });
    expect(listStockmanEvents).toHaveBeenCalledWith(expect.objectContaining({ hours: 12, positiveOnly: true }));
  });

  it("rejects unsupported hour windows", async () => {
    const response = await GET(new Request("https://stockman.example/api/events?hours=6"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_HOURS" });
    expect(listStockmanEvents).not.toHaveBeenCalled();
  });

  it("rejects invalid or mixed time filters", async () => {
    expect((await GET(new Request("https://stockman.example/api/events?from=nope"))).status).toBe(400);
    expect((await GET(new Request("https://stockman.example/api/events?hours=12&from=2026-11-06T00:00:00Z"))).status).toBe(400);
  });

  it("validates grade, ticker, and page size", async () => {
    expect((await GET(new Request("https://stockman.example/api/events?grade=D"))).status).toBe(400);
    expect((await GET(new Request("https://stockman.example/api/events?ticker=bad!"))).status).toBe(400);
    expect((await GET(new Request("https://stockman.example/api/events?pageSize=101"))).status).toBe(400);
  });

  it("passes validated filters and pagination into the repository", async () => {
    listStockmanEvents.mockResolvedValueOnce({ items: [], total: 0, page: 2, pageSize: 25, hasMore: false });
    const response = await GET(new Request("https://stockman.example/api/events?hours=12&ticker=INO&grade=A&verificationStatus=VERIFIED&dilutionRisk=LOW&sort=importance&page=2&pageSize=25"));
    expect(response.status).toBe(200);
    expect(listStockmanEvents).toHaveBeenCalledWith(expect.objectContaining({
      hours: 12, ticker: "INO", grade: "A", verificationStatus: "VERIFIED", dilutionRisk: "LOW",
      sort: "importance", page: 2, pageSize: 25,
    }));
    expect(await response.json()).toMatchObject({ ok: true, query: { ticker: "INO", hours: 12 }, page: 2, pageSize: 25 });
  });
});
