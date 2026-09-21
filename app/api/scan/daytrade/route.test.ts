import { describe, expect, it, vi } from "vitest";

const { recommend } = vi.hoisted(() => ({
  recommend: vi.fn().mockResolvedValue({ ok: true, market: "KR", mode: "scalp", results: [] }),
}));
vi.mock("@/lib/multi-timeframe-recommendations", () => ({ recommendMultiTimeframe: recommend }));

import { GET } from "./route";

describe("daytrade scan route", () => {
  it("uses the explicit scalp contract and clamps limit", async () => {
    const response = await GET(new Request("http://localhost/api/scan/daytrade?market=kr&limit=999"));
    expect(response.status).toBe(200);
    expect(recommend).toHaveBeenCalledWith("KR", "scalp", 100);
  });
  it("returns a JSON 503 on scan failure", async () => {
    recommend.mockRejectedValueOnce(new Error("db unavailable"));
    const response = await GET(new Request("http://localhost/api/scan/daytrade?market=US"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: "DAYTRADE_SCAN_UNAVAILABLE" });
  });
});
