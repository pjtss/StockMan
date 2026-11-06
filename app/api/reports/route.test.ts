import { beforeEach, describe, expect, it, vi } from "vitest";

const { listStockmanCollectionStatus, listStockmanEvents, renderStockmanEventsMarkdown } = vi.hoisted(() => ({
  listStockmanCollectionStatus: vi.fn(),
  listStockmanEvents: vi.fn(),
  renderStockmanEventsMarkdown: vi.fn(() => "# verified report"),
}));
vi.mock("@/lib/stockman-events", () => ({ listStockmanCollectionStatus, listStockmanEvents, renderStockmanEventsMarkdown }));

import { GET } from "./route";

describe("GET /api/reports", () => {
  beforeEach(() => {
    listStockmanEvents.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 500, hasMore: false });
    listStockmanCollectionStatus.mockReset().mockResolvedValue([]);
    renderStockmanEventsMarkdown.mockClear();
  });

  it("defaults to the latest 12-hour window and filters for verified positive grades", async () => {
    const response = await GET(new Request("https://stockman.example/api/reports/latest"));
    expect(response.status).toBe(200);
    expect(listStockmanEvents).toHaveBeenCalledWith(expect.objectContaining({ hours: 12, positiveOnly: true, page: 1, pageSize: 500 }));
    expect(await response.json()).toMatchObject({ ok: true, hours: 12, count: 0, markdown: "# verified report" });
  });

  it("rejects unsupported report windows", async () => {
    const response = await GET(new Request("https://stockman.example/api/reports?hours=6"));
    expect(response.status).toBe(400);
    expect(listStockmanEvents).not.toHaveBeenCalled();
  });

  it("builds a KST calendar-day report window", async () => {
    const response = await GET(new Request("https://stockman.example/api/reports?type=daily&date=2026-11-06"));
    expect(response.status).toBe(200);
    expect(listStockmanEvents).toHaveBeenCalledWith(expect.objectContaining({
      from: new Date("2026-11-05T15:00:00.000Z"), to: new Date("2026-11-06T14:59:59.999Z"), positiveOnly: true,
    }));
    expect(await response.json()).toMatchObject({ reportType: "DAILY", date: "2026-11-06" });
  });

  it("requires a ticker for ticker history reports", async () => {
    const response = await GET(new Request("https://stockman.example/api/reports?type=ticker"));
    expect(response.status).toBe(400);
    expect(listStockmanEvents).not.toHaveBeenCalled();
  });

  it("filters dilution reports to events with a recorded dilution risk", async () => {
    const response = await GET(new Request("https://stockman.example/api/reports?type=dilution&hours=24"));
    expect(response.status).toBe(200);
    expect(listStockmanEvents).toHaveBeenCalledWith(expect.objectContaining({ hours: 24, dilutionOnly: true }));
    expect(await response.json()).toMatchObject({ reportType: "DILUTION", hours: 24 });
  });

  it("returns a database-backed collection status report", async () => {
    listStockmanCollectionStatus.mockResolvedValueOnce([{ moduleKey: "market-rss", status: "SUCCESS", sourceStatus: "SUCCESS", eventLedgerStatus: "SUCCESS" }]);
    const response = await GET(new Request("https://stockman.example/api/reports?type=collection"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reportType: "COLLECTION_STATUS", count: 1 });
    expect(listStockmanCollectionStatus).toHaveBeenCalledOnce();
  });
});
