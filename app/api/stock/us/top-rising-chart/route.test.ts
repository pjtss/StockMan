import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCached: vi.fn(), load: vi.fn(), save: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/lib/us-top-rising-universe", () => ({ getCachedUsTopRisingScopes: mocks.getCached, loadUsTopRisingScopes: mocks.load }));
vi.mock("@/lib/us-top-rising-snapshot", () => ({ saveUsTopRisingSnapshot: mocks.save }));
vi.mock("@/lib/intraday-memory-state", () => ({ intradayMemoryState: { snapshot: mocks.snapshot } }));

import { GET } from "./route";

describe("GET /api/stock/us/top-rising-chart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.snapshot.mockReturnValue({ current: [] });
    mocks.getCached.mockReturnValue({
      scopes: [{ market: "NAS", code: "AAA", name: "A Corp", rank: 1, changeRate: 5 }],
      universe: {
        ok: true,
        complete: false,
        collectedAt: new Date(Date.now() - 5_000).toISOString(),
        availableMarketCount: 1,
        completeMarketCount: 0,
      markets: [{ market: "NAS", status: 200, responseOk: true, sourceCount: 4, selectedCount: 2, eligibleCommonStockCount: 1, requestedCount: 100, sourceComplete: false, productExcluded: 1, invalidRows: 0, duplicateExcluded: 1, fallbackUsed: false, collectedAt: new Date(Date.now() - 5_000).toISOString(), error: "PARTIAL_RANKING_PAGE", kis: { rtCd: "0", msgCd: "MCA00000", msg1: "success" }, rawTextPreview: "must not be public" }],
        criteria: { topNPerExchange: 100 },
      },
    });
  });

  it("reports the upstream collection time and partial exchange coverage without exposing raw payloads", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.complete).toBe(false);
    expect(body.availableMarketCount).toBe(1);
    expect(body.completeMarketCount).toBe(0);
    expect(body.ageSeconds).toBeGreaterThanOrEqual(4);
    expect(body.markets[0]).toMatchObject({ market: "NAS", sourceCount: 4, requestedCount: 100, sourceComplete: false, eligibleCommonStockCount: 1, productExcluded: 1, invalidRows: 0, duplicateExcluded: 1, selectedCount: 2 });
    expect(body.markets[0]).not.toHaveProperty("rawTextPreview");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
