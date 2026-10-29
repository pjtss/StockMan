import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: queryMock }) }));

import { GET } from "./route";

const candidate = (ticker: string, signalType: string, signalQuality: string, liquidity: number, obv: number, price: number) => ({
  ticker, market: "NAS", name: ticker, exchange: "NAS", marketCapUsd: null, candleDate: "2026-10-28", close: 10,
  signalType, signalQuality, priceBasis: "UNVERIFIED_CORPORATE_ACTION_ADJUSTMENT", price20dPct: price,
  obv20dAvgVolumeMultiple: obv, priceRegressionSlopePerDay: -0.1, obvSlopePerDay: 10,
  obvPositiveDayConcentration: 0.3, obvPositiveDays20d: 7, avgDollarVolume20d: liquidity,
  avgDollarVolume5d: liquidity, recentVolume5dTo20d: 1, obvLast5dAvgVolumeMultiple: 0.2,
  pivot1Date: null, pivot1Low: null, pivot2Date: null, pivot2Low: null, pivotPricePct: null,
  pivotObvNormalized: null, alignedObvTroughGainNormalized: null, pivotConfirmedDate: null,
  pivotAgeSessions: null, dataIssues: [], bars: 100, algoVersion: "4.0.0", candleMetadata: [],
});

const payload = {
  schemaVersion: "us-obv-divergence.v4", algoVersion: "4.0.0", generatedAtUtc: "2026-10-29T18:30:00.000Z",
  asOfEtDate: "2026-10-29", marketCapLimitUsd: null, scanStatus: "COMPLETE",
  universe: { eligibleCommonStockCount: 2, evaluatedCount: 2, evaluatedCoveragePct: 100 },
  parameters: {}, warnings: [], items: [
    candidate("A", "TREND", "STANDARD", 500_000, 2, -2),
    candidate("B", "BOTH", "HIGH", 1_000_000, 4, -5),
  ],
};

describe("GET /api/scan/us-obv-divergence", () => {
  beforeEach(() => queryMock.mockReset().mockResolvedValue({ rows: [{ as_of_date: "2026-10-29", generated_at: new Date().toISOString(), payload }] }));
  afterEach(() => vi.useRealTimers());

  it("filters and paginates the stored snapshot without recalculating it", async () => {
    const response = await GET(new Request("http://localhost/api/scan/us-obv-divergence?signalType=BOTH&pageSize=1"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items.map((item: { ticker: string }) => item.ticker)).toEqual(["B"]);
    expect(body.pagination).toMatchObject({ page: 1, pageSize: 1, totalItems: 1, totalPages: 1 });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported query values", async () => {
    const response = await GET(new Request("http://localhost/api/scan/us-obv-divergence?sort=sql"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_QUERY" });
  });

  it("returns a controlled unavailable response when the snapshot is missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const response = await GET(new Request("http://localhost/api/scan/us-obv-divergence"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "SNAPSHOT_NOT_READY" });
  });
});
