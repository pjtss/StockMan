import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorized: true,
  query: vi.fn(),
  readServerJournal: vi.fn(),
  getRecentPublicDailyExportTimings: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("@/lib/cron-auth", () => ({ isCronRequestAuthorized: () => mocks.authorized }));
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings: vi.fn(async () => ({ enabled: true, startTime: "00:00", endTime: "23:59", activeDays: [1, 2, 3, 4, 5], intervalSeconds: 3600 })) }));
vi.mock("@/lib/us-daily-global-gate", () => ({ isDailyCandleAutomationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/schedule-time", () => ({ isWithinSchedule: () => true }));
vi.mock("@/lib/discord-config", () => ({ loadFeatureDiscordDebugWebhook: vi.fn(async () => null) }));
vi.mock("@/lib/kis-kr-daily-price", () => ({ fetchKrDailyPrice: vi.fn() }));
vi.mock("@/lib/kis-us-daily-price", () => ({ fetchUsDailyPrice: vi.fn() }));
vi.mock("@/lib/server-journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server-journal")>();
  return { ...actual, readServerJournal: mocks.readServerJournal };
});
vi.mock("@/lib/public-daily-export-timing", () => ({ getRecentPublicDailyExportTimings: mocks.getRecentPublicDailyExportTimings }));

import { GET } from "./route";

describe("GET /api/debug/daily-cache-status server journal option", () => {
  beforeEach(() => {
    mocks.authorized = true;
    mocks.query.mockReset();
    mocks.readServerJournal.mockReset();
    mocks.getRecentPublicDailyExportTimings.mockReset();
    mocks.readServerJournal.mockResolvedValue({ source: "systemd-journal", units: [] });
    mocks.getRecentPublicDailyExportTimings.mockReturnValue([]);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("WITH eligible AS")) return { rows: [{ market: "KOSPI", eligible_count: 2, cached_count: 2, latest_date_count: 2, behind_latest_count: 0, latest_market_date: "20261126", latest_fetched_at: "2026-11-26T06:00:00Z", oldest_current_latest_fetched_at: "2026-11-26T05:00:00Z" }] };
      if (sql.includes("instrument_candle_cache_retries")) return { rows: [] };
      if (sql.includes("instrument_candle_cache_failures")) return { rows: [] };
      if (sql.includes("FROM automation_runs")) return { rows: [] };
      if (sql.includes("FROM pg_locks")) return { rows: [] };
      if (sql.includes("GROUP BY market, candle_date")) return { rows: [] };
      return { rows: [] };
    });
  });

  it("requires cron authorization before any journal or database read", async () => {
    mocks.authorized = false;
    const response = await GET(new Request("https://example.test/api/debug/daily-cache-status?market=KR&includeServerLogs=true"));
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.readServerJournal).not.toHaveBeenCalled();
    expect(mocks.getRecentPublicDailyExportTimings).not.toHaveBeenCalled();
  });

  it("returns bounded exporter timings through an authenticated database-free path", async () => {
    const samples = [{ requestId: "request-1", market: "US", totalElapsedMs: 45_000 }];
    mocks.getRecentPublicDailyExportTimings.mockReturnValue(samples);
    const response = await GET(new Request("https://example.test/api/debug/daily-cache-status?market=US&exportTimingsOnly=true"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: true, market: "US", exportTimings: samples });
    expect(mocks.getRecentPublicDailyExportTimings).toHaveBeenCalledWith("US");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.readServerJournal).not.toHaveBeenCalled();
  });

  it("returns aggregated active exporter waits without exposing SQL", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ visible_session_count: 8, visible_active_session_count: 6, query_hidden_session_count: 2, active_exporter_queries: [{ wait_event_type: "IO", wait_event: "DataFileRead", active_count: 6, oldest_active_seconds: 42, average_active_seconds: 35 }] }] });
    const response = await GET(new Request("https://example.test/api/debug/daily-cache-status?market=US&exportActivityOnly=true"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      activityVisibility: { visibleSessionCount: 8, visibleActiveSessionCount: 6, queryHiddenSessionCount: 2 },
      activeExporterQueries: [{ waitEventType: "IO", waitEvent: "DataFileRead", activeCount: 6, oldestActiveSeconds: 42, averageActiveSeconds: 35 }],
    });
    expect(mocks.query.mock.calls[0]?.[0]).toContain("pg_stat_activity");
    expect(mocks.query.mock.calls[0]?.[0]).not.toMatch(/SELECT\s+query/i);
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(["%public-daily-export-market: us%"]);
    expect(mocks.readServerJournal).not.toHaveBeenCalled();
  });

  it("requires authorization before exporter activity queries", async () => {
    mocks.authorized = false;
    const response = await GET(new Request("https://example.test/api/debug/daily-cache-status?market=US&exportActivityOnly=true"));
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("reads only explicitly requested, validated server journal logs", async () => {
    const response = await GET(new Request("https://example.test/api/debug/daily-cache-status?market=KR&includeServerLogs=true&logUnit=stockman.service&logMinutes=15&logLimit=10"));
    expect(response.status).toBe(200);
    expect(mocks.readServerJournal).toHaveBeenCalledWith({ units: ["stockman.service"], minutes: 15, limit: 10 });
    expect(await response.json()).toMatchObject({ serverLogs: { source: "systemd-journal", units: [] } });
  });

  it("supports a logs-only diagnostic without waiting for database queries", async () => {
    const response = await GET(new Request("https://example.test/api/debug/daily-cache-status?market=KR&includeServerLogs=true&logsOnly=true&logUnit=stockman.service"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, market: "KR", serverLogs: { source: "systemd-journal" } });
    expect(mocks.readServerJournal).toHaveBeenCalledWith({ units: ["stockman.service"], minutes: 60, limit: 50 });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns available server logs when database diagnostics fail", async () => {
    mocks.query.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(new Request("https://example.test/api/debug/daily-cache-status?market=KR&includeServerLogs=true&logUnit=stockman.service"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: "DAILY_CACHE_DIAGNOSTICS_UNAVAILABLE", serverLogs: { source: "systemd-journal" } });
    expect(mocks.readServerJournal).toHaveBeenCalledWith({ units: ["stockman.service"], minutes: 60, limit: 50 });
  });

  it("does not spawn journal readers on the normal diagnostics request", async () => {
    const response = await GET(new Request("https://example.test/api/debug/daily-cache-status?market=KR"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("serverLogs");
    expect(mocks.readServerJournal).not.toHaveBeenCalled();
  });

  it("rejects arbitrary units and out-of-range log windows", async () => {
    const badUnit = await GET(new Request("https://example.test/api/debug/daily-cache-status?market=KR&includeServerLogs=true&logUnit=../etc/passwd"));
    expect(badUnit.status).toBe(400);
    expect(await badUnit.json()).toMatchObject({ error: "INVALID_SERVER_LOG_QUERY" });
    const badWindow = await GET(new Request("https://example.test/api/debug/daily-cache-status?market=KR&includeServerLogs=true&logMinutes=1441"));
    expect(badWindow.status).toBe(400);
    expect(mocks.readServerJournal).not.toHaveBeenCalled();
  });
});
