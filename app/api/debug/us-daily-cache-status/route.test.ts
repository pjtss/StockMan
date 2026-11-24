import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorized: true, query: vi.fn() }));

vi.mock("@/lib/db", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("@/lib/cron-auth", () => ({ isCronRequestAuthorized: () => mocks.authorized }));
vi.mock("@/lib/feature-module-settings", () => ({
  loadFeatureModuleSettings: vi.fn(async () => ({ enabled: true, startTime: "00:00", endTime: "23:59", activeDays: [1, 2, 3, 4, 5], intervalSeconds: 3600 })),
}));
vi.mock("@/lib/schedule-time", () => ({ isWithinSchedule: () => true }));
vi.mock("@/lib/us-daily-global-gate", () => ({ isDailyCandleAutomationEnabled: vi.fn(async () => true) }));

import { GET } from "./route";

describe("GET /api/debug/us-daily-cache-status", () => {
  beforeEach(() => {
    mocks.authorized = true;
    mocks.query.mockReset();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("us_common_stock_universe")) return { rows: [{ market: "NAS", eligible_count: 3, cached_count: 3, latest_candle_date: "20261117", at_latest_date_count: 2, missing_codes: ["MSFT"], latest_fetched_at: "2026-11-17T22:20:00.000Z" }] };
      return { rows: [{ id: 1, status: "PARTIAL", started_at: "2026-11-18T22:00:00.000Z", finished_at: "2026-11-18T22:02:00.000Z", duration_ms: 120000, summary: { savedCandleCount: 2, failureCount: 1, diagnostics: { errorCode: "KIS_AUTH_ERROR", message: "do not expose raw error" }, credentials: "secret", webhookUrl: "private" } }] };
    });
  });

  it("requires cron authorization and does not query the database when unauthorized", async () => {
    mocks.authorized = false;
    const response = await GET(new Request("https://example.test/api/debug/us-daily-cache-status"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: "UNAUTHORIZED" });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns market coverage and recent run metrics without raw credentials or messages", async () => {
    const response = await GET(new Request("https://example.test/api/debug/us-daily-cache-status", { headers: { "x-request-id": "diagnostic-1" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("diagnostic-1");
    expect(body).toMatchObject({
      ok: true,
      automation: { module: "us-daily-cache", cronPath: "/api/cron/us-daily-cache", expectedIntervalSeconds: 3600, enabled: true },
      markets: [{ market: "NAS", eligibleCount: 3, cachedCount: 3, latestCandleDate: "20261117", atLatestDateCount: 2, missingAtLatestDateCount: 1, missingAtLatestDateCodes: ["MSFT"] }],
      recentRuns: [{ status: "PARTIAL", summary: { savedCandleCount: 2, failureCount: 1, "diagnostics.errorCode": "KIS_AUTH_ERROR" } }],
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("private");
    expect(JSON.stringify(body)).not.toContain("do not expose raw error");
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("returns a non-sensitive unavailable response when diagnostics cannot be loaded", async () => {
    mocks.query.mockRejectedValue(new Error("sensitive database details"));
    const response = await GET(new Request("https://example.test/api/debug/us-daily-cache-status"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, stage: "load_us_daily_cache_status", errorCode: "US_DAILY_CACHE_STATUS_UNAVAILABLE" });
  });
});
