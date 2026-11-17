import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb, insert, values, enqueueCandleCacheRetry } = vi.hoisted(() => ({
  getDb: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  enqueueCandleCacheRetry: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getDb }));
vi.mock("@/lib/schema", () => ({ instrumentCandleCacheFailures: {} }));
vi.mock("@/lib/candle-cache-retry", () => ({ enqueueCandleCacheRetry }));

import { recordCandleCacheFailure } from "./candle-cache-failure-history";

describe("recordCandleCacheFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    values.mockResolvedValue(undefined);
    insert.mockReturnValue({ values });
    getDb.mockReturnValue({ insert });
    enqueueCandleCacheRetry.mockResolvedValue(undefined);
  });

  it("reports success only when failure history and retry queue are both persisted", async () => {
    await expect(recordCandleCacheFailure({ market: "NAS", code: "AAPL", timeframe: "D", error: "KIS failed" })).resolves.toBe(true);
    expect(insert).toHaveBeenCalledOnce();
    expect(enqueueCandleCacheRetry).toHaveBeenCalledOnce();
  });

  it("passes the claimed generation to retry persistence and returns its fencing result", async () => {
    enqueueCandleCacheRetry.mockResolvedValueOnce(false);
    await expect(recordCandleCacheFailure({ market: "NAS", code: "AAPL", timeframe: "D", error: "late failure", expectedAttempts: 4 })).resolves.toBe(false);
    expect(enqueueCandleCacheRetry).toHaveBeenCalledWith(expect.objectContaining({ expectedAttempts: 4 }));
  });

  it("reports missing retry persistence instead of claiming a fully recorded failure", async () => {
    enqueueCandleCacheRetry.mockRejectedValueOnce(new Error("retry table unavailable"));
    await expect(recordCandleCacheFailure({ market: "NAS", code: "AAPL", timeframe: "D", error: "KIS failed" })).resolves.toBe(false);
  });

  it("reports failure-history database errors without throwing past the worker boundary", async () => {
    insert.mockImplementationOnce(() => { throw new Error("failure table unavailable"); });
    await expect(recordCandleCacheFailure({ market: "NAS", code: "AAPL", timeframe: "D", error: "KIS failed" })).resolves.toBe(false);
  });
});
