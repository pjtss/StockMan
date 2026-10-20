import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ getPool: () => ({ query }) }));

import { loadInstrumentFundamentalRefreshDebug } from "@/lib/instrument-fundamental-debug";

describe("instrument fundamentals refresh diagnostics", () => {
  beforeEach(() => query.mockReset());

  it("returns an empty snapshot when no durable refresh job exists", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(loadInstrumentFundamentalRefreshDebug()).resolves.toEqual({
      job: null,
      totals: null,
      failuresByMarketAndCode: [],
      responseDiagnostics: { inspectedFailureCount: 0, totalFailureCount: 0, truncated: false, byMarketAndCode: [] },
      retrySamples: [],
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("aggregates the newest job and returns bounded safe retry samples", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: "7", status: "PARTIAL", instrument_count: "6704", started_at: "2026-10-19T10:00:00Z", finished_at: null, created_at: "2026-10-19T10:00:00Z" }] })
      .mockResolvedValueOnce({ rows: [{ total_count: 6704, success_count: 6558, failed_count: 146, pending_count: 0, retry_due_count: 0, retry_time_missing_count: 0, retry_deferred_count: 146, next_retry_at: "2026-10-20T10:00:00Z", latest_item_updated_at: "2026-10-19T10:00:00Z" }] })
      .mockResolvedValueOnce({ rows: [{ market: "NAS", error_code: "KIS_MARKET_CAP_MISSING_OR_INVALID", count: 146, retry_due_count: 0, retry_deferred_count: 146, max_attempt_count: 4, next_retry_at: "2026-10-20T10:00:00Z", latest_updated_at: "2026-10-19T10:00:00Z" }] })
      .mockResolvedValueOnce({ rows: [{ market: "NAS", code: "ABCD", error_code: "KIS_PRICE_INVALID", attempt_count: 4, next_attempt_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-19T10:00:00Z", total_failed_count: 146, cached_status: 200, cached_fetched_at: "2026-10-19T09:59:58Z", cached_parsed: { rt_cd: "0", msg_cd: "MCA00000", output: { last: "", t_prpr: "12.34", tomv: "5000000" } } }] });

    const result = await loadInstrumentFundamentalRefreshDebug();

    expect(result).toMatchObject({
      job: { id: 7, status: "PARTIAL", instrumentCount: 6704 },
      totals: { total: 6704, success: 6558, failed: 146, retryDeferred: 146, retryDue: 0 },
      failuresByMarketAndCode: [{ market: "NAS", errorCode: "KIS_MARKET_CAP_MISSING_OR_INVALID", count: 146 }],
      responseDiagnostics: {
        inspectedFailureCount: 1,
        totalFailureCount: 146,
        truncated: true,
        byMarketAndCode: [{ market: "NAS", errorCode: "KIS_PRICE_INVALID", failureCount: 1, cacheFoundCount: 1, cacheNearFailureCount: 1, alternativePositivePriceCount: 1, selectedPriceStateCounts: { EMPTY: 1 }, firstUsablePriceStateCounts: { POSITIVE: 1 } }],
      },
      retrySamples: [{ market: "NAS", code: "ABCD", attemptCount: 4, providerResponse: { cacheFound: true, cacheNearFailure: true, rtCd: "0", messageCode: "MCA00000", selectedPriceField: "last", selectedPriceState: "EMPTY", firstUsablePriceField: "t_prpr", firstUsablePriceState: "POSITIVE", alternativePositivePrice: true } }],
    });
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls.slice(1).every(([sql, params]) => String(sql).includes("job_id = $1") && params[0] === "7")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("rawPayload");
  });

  it("does not silently report missing retry timestamps as safely deferred", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 8, status: "PARTIAL", instrument_count: 1, started_at: null, finished_at: null, created_at: "2026-10-19T10:00:00Z" }] })
      .mockResolvedValueOnce({ rows: [{ total_count: 1, success_count: 0, failed_count: 1, pending_count: 0, retry_due_count: 1, retry_time_missing_count: 1, retry_deferred_count: 0, next_retry_at: null, latest_item_updated_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await loadInstrumentFundamentalRefreshDebug();

    expect(result.totals).toMatchObject({ failed: 1, retryDue: 1, retryTimeMissing: 1, retryDeferred: 0 });
  });
});
