import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/automation-run", () => ({ withAutomationRun: vi.fn((_key: string, task: () => Promise<unknown>) => task()) }));
vi.mock("@/lib/multi-timeframe-recommendations", () => ({ recommendMultiTimeframe: vi.fn().mockResolvedValue({
  ok: true, market: "KR", mode: "all", instrumentCount: 1, qualifiedCount: 1, tickers: "005930",
  results: [{ code: "005930", name: "테스트전자", score: 72, timeframeMeta: { daily: { date: "20260828", updatedAt: "2026-08-29T00:00:00.000Z" }, weekly: { date: "20260821", updatedAt: "2026-08-29T00:00:00.000Z" }, monthly: { date: "20260731", updatedAt: "2026-08-29T00:00:00.000Z" } } }], policy: {},
}) }));

import { GET } from "./route";

describe("technical entry analysis API", () => {
  it("returns ranked D/W/M results and comma-separated tickers", async () => {
    const response = await GET(new Request("http://localhost/api/scan/technical-entry-analysis?market=KR&mode=all&limit=10"));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.results[0].rank).toBe(1);
    expect(json.tickers).toBe("005930");
    expect(json.responseMeta.timeframes).toEqual(["D", "W", "M"]);
    expect(json.results[0].timeframeMeta.monthly.date).toBe("20260731");
  });
});
