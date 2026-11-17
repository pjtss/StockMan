import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPool, query } = vi.hoisted(() => ({ getPool: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool }));

import { enqueueCandleCacheRetry, listDueCandleCacheRetryTimeframes, loadDueCandleCacheRetries, markCandleCacheRetrySuccess } from "./candle-cache-retry";

describe("loadDueCandleCacheRetries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPool.mockReturnValue({ query });
  });

  it("returns only due retry rows from the persistent queue", async () => {
    const rows = [{ market: "NAS", code: "AAPL", timeframe: "D", attempts: 2 }];
    query.mockResolvedValueOnce({ rows });
    await expect(loadDueCandleCacheRetries([{ market: "nas", code: "aapl" }], 25)).resolves.toEqual(rows);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("status='PENDING' AND r.next_attempt_at<=NOW()");
    expect(sql).toContain("status='PROCESSING' AND (r.last_attempt_at IS NULL OR r.last_attempt_at<NOW()-INTERVAL '30 minutes')");
    expect(sql).toContain("r.last_attempt_at IS NULL OR r.last_attempt_at<NOW()-INTERVAL '30 minutes'");
    expect(sql).toContain("FOR UPDATE OF r SKIP LOCKED");
    expect(sql).toContain("attempts=r.attempts+1");
    expect(parameters).toEqual([25, ["NAS"], ["AAPL"], ["D", "W", "M"]]);
  });

  it("lists due retry timeframes without a row limit or claim", async () => {
    const rows = [{ timeframe: "W" }, { timeframe: "D" }];
    query.mockResolvedValueOnce({ rows });
    await expect(listDueCandleCacheRetryTimeframes([{ market: "kospi", code: "005930" }])).resolves.toEqual(["W", "D"]);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("SELECT DISTINCT r.timeframe");
    expect(sql).toContain("r.timeframe=ANY($3::text[])");
    expect(sql).not.toContain("LIMIT");
    expect(sql).not.toContain("FOR UPDATE");
    expect(sql).not.toContain("UPDATE instrument_candle_cache_retries");
    expect(parameters).toEqual([["KOSPI"], ["005930"], ["D", "W", "M"]]);
  });

  it("claims only the timeframes selected by the worker policy", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await loadDueCandleCacheRetries([{ market: "KOSPI", code: "005930" }], 25, ["D"]);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("FROM unnest($4::text[]) WITH ORDINALITY AS lane(timeframe,ordinality)");
    expect(sql).toContain("WHERE r.timeframe=lane.timeframe");
    expect(sql).toContain("LIMIT lane.quota FOR UPDATE OF r SKIP LOCKED");
    expect(parameters).toEqual([25, ["KOSPI"], ["005930"], ["D"]]);
  });

  it("does not claim rows when the worker selected no timeframe", async () => {
    await expect(loadDueCandleCacheRetries([{ market: "KOSPI", code: "005930" }], 25, [])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("ignores unsupported timeframe values before constructing a claim", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await loadDueCandleCacheRetries([{ market: "KOSPI", code: "005930" }], 25, ["Q", "D", "D"] as any);
    expect(query.mock.calls[0][1]).toEqual([25, ["KOSPI"], ["005930"], ["D"]]);
  });

  it("does not query the queue if no supported timeframe remains", async () => {
    await expect(loadDueCandleCacheRetries([{ market: "KOSPI", code: "005930" }], 25, ["Q"] as any)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("propagates queue read failures instead of treating the queue as empty", async () => {
    query.mockRejectedValueOnce(new Error("retry table unavailable"));
    await expect(loadDueCandleCacheRetries([{ market: "NAS", code: "AAPL" }])).rejects.toThrow("retry table unavailable");
  });

  it("keeps retries claimed by another worker out of duplicate claims", async () => {
    await expect(loadDueCandleCacheRetries([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("preserves retry backoff after a claimed attempt fails", async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });
    await enqueueCandleCacheRetry({ market: "NAS", code: "AAPL", timeframe: "D", error: "temporary failure" });
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("status='PROCESSING' THEN instrument_candle_cache_retries.next_attempt_at");
    expect(sql).toContain("status='SUCCESS' THEN 0 ELSE instrument_candle_cache_retries.attempts");
    expect(values).toEqual(["NAS", "AAPL", "D", 5, "temporary failure", null]);
  });

  it("fences a late failure enqueue to the claimed retry generation", async () => {
    query.mockResolvedValueOnce({ rowCount: 0 });
    await expect(enqueueCandleCacheRetry({ market: "NAS", code: "AAPL", timeframe: "D", error: "late failure", expectedAttempts: 2 })).resolves.toBe(false);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("WHERE ($6::integer IS NULL AND instrument_candle_cache_retries.status <> 'PROCESSING') OR (instrument_candle_cache_retries.status='PROCESSING' AND instrument_candle_cache_retries.attempts=$6)");
    expect(parameters).toEqual(["NAS", "AAPL", "D", 5, "late failure", 2]);
  });

  it("fences success to the exact active retry attempt generation", async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });
    await expect(markCandleCacheRetrySuccess({ market: "NAS", code: "AAPL", timeframe: "D", attempts: 3 })).resolves.toBe(true);
    expect(query.mock.calls[0][0]).toContain("AND status='PROCESSING' AND attempts=$4");
    expect(query.mock.calls[0][1]).toEqual(["NAS", "AAPL", "D", 3]);
  });

  it("reports when the claimed retry generation was not marked successful", async () => {
    query.mockResolvedValueOnce({ rowCount: 0 });
    await expect(markCandleCacheRetrySuccess({ market: "NAS", code: "AAPL", timeframe: "D", attempts: 3 })).resolves.toBe(false);
    query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(markCandleCacheRetrySuccess({ market: "NAS", code: "AAPL", timeframe: "D", attempts: 3 })).resolves.toBe(false);
  });
});
