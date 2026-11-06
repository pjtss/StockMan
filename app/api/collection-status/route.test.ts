import { beforeEach, describe, expect, it, vi } from "vitest";

const { listStockmanCollectionStatus } = vi.hoisted(() => ({ listStockmanCollectionStatus: vi.fn() }));
vi.mock("@/lib/stockman-events", () => ({ listStockmanCollectionStatus }));

import { GET } from "./route";

describe("GET /api/collection-status", () => {
  beforeEach(() => listStockmanCollectionStatus.mockReset());

  it("returns the latest source collection status as no-store JSON", async () => {
    listStockmanCollectionStatus.mockResolvedValue([{ moduleKey: "market-rss", eventLedgerStatus: "SUCCESS" }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ ok: true, sources: [{ moduleKey: "market-rss", eventLedgerStatus: "SUCCESS" }] });
  });

});
