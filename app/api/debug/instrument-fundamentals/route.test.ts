import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ cronAuthorized: false, adminAuthorized: false, query: vi.fn() }));

vi.mock("@/lib/cron-auth", () => ({ isCronRequestAuthorized: () => state.cronAuthorized }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: async () => state.adminAuthorized }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: state.query }) }));

import { GET } from "./route";

const request = (headers?: HeadersInit) => new Request("http://localhost/api/debug/instrument-fundamentals", { headers });

describe("instrument fundamentals refresh debug API", () => {
  beforeEach(() => {
    state.cronAuthorized = false;
    state.adminAuthorized = false;
    state.query.mockReset();
  });

  it("requires admin or cron authorization before querying the ledger", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(state.query).not.toHaveBeenCalled();
  });

  it("returns retry state and failure-code grouping without provider payloads", async () => {
    state.cronAuthorized = true;
    state.query
      .mockResolvedValueOnce({ rows: [{ id: "7", status: "PARTIAL", instrument_count: "6704", started_at: "2026-10-19T10:00:00Z", finished_at: null, created_at: "2026-10-19T10:00:00Z" }] })
      .mockResolvedValueOnce({ rows: [{ total_count: 6704, success_count: 6558, failed_count: 146, pending_count: 0, retry_due_count: 0, retry_time_missing_count: 0, retry_deferred_count: 146, next_retry_at: "2026-10-20T10:00:00Z", latest_item_updated_at: "2026-10-19T10:00:00Z" }] })
      .mockResolvedValueOnce({ rows: [{ market: "NAS", error_code: "KIS_MARKET_CAP_MISSING_OR_INVALID", count: 100, retry_due_count: 0, retry_deferred_count: 100, max_attempt_count: 4, next_retry_at: "2026-10-20T10:00:00Z", latest_updated_at: "2026-10-19T10:00:00Z" }] })
      .mockResolvedValueOnce({ rows: [{ market: "NAS", code: "ABCD", error_code: "KIS_MARKET_CAP_MISSING_OR_INVALID", attempt_count: 4, next_attempt_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-19T10:00:00Z" }] });

    const response = await GET(request({ "x-cron-secret": "provided-out-of-band" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      mode: "INSTRUMENT_FUNDAMENTALS_REFRESH_DEBUG",
      job: { id: 7, status: "PARTIAL", instrumentCount: 6704 },
      totals: { success: 6558, failed: 146, retryDeferred: 146, retryDue: 0 },
      failuresByMarketAndCode: [{ market: "NAS", errorCode: "KIS_MARKET_CAP_MISSING_OR_INVALID", count: 100, retryDeferredCount: 100 }],
      retrySamples: [{ market: "NAS", code: "ABCD", attemptCount: 4 }],
    });
    expect(JSON.stringify(body)).not.toContain("rawPayload");
    expect(state.query).toHaveBeenCalledTimes(4);
  });

  it("supports an empty ledger without issuing item queries", async () => {
    state.adminAuthorized = true;
    state.query.mockResolvedValueOnce({ rows: [] });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, job: null, totals: null, failuresByMarketAndCode: [], retrySamples: [] });
    expect(state.query).toHaveBeenCalledTimes(1);
  });

  it("returns a sanitized unavailable response when the database ledger cannot be read", async () => {
    state.adminAuthorized = true;
    state.query.mockRejectedValueOnce(new Error("connection string contains credentials"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("FUNDAMENTALS_REFRESH_LEDGER_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("credentials");
  });
});
