import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  krRows: [] as Array<Record<string, unknown>>,
  usRows: [] as Array<Record<string, unknown>>,
  fetchedUs: [] as Array<{ code: string; market: string }>,
  historyRows: [] as Array<Record<string, unknown>>,
  snapshotRows: [] as Array<Record<string, unknown>>,
  snapshotSet: null as Record<string, unknown> | null,
  transactionCount: 0,
  insertAttemptCount: 0,
  failSnapshotWrites: false,
  fromIndex: 0,
  progressJobId: 1,
  progressItems: [] as Array<{ market: string; code: string; name: string }>,
  progressStatuses: new Map<string, string>(),
  progressResumed: false,
  progressDeferred: 0,
  progressNextRetryAt: null as string | null,
  progressMarks: [] as Array<{ succeeded: Array<{ market: string; code: string }>; failed: Array<{ market: string; code: string; errorCode: string }> }>,
}));

vi.mock("@/lib/db", () => ({
  getDb: () => {
    const tx = {
      insert: (table: unknown) => ({
        values: (rows: Array<Record<string, unknown>>) => ({
          onConflictDoNothing: async () => {
            state.historyRows.push(...rows);
          },
          onConflictDoUpdate: async (config: { set: Record<string, unknown> }) => {
            state.insertAttemptCount++;
            state.snapshotRows.push(...rows);
            state.snapshotSet = config.set;
            if (state.failSnapshotWrites) throw Object.assign(new Error("database unavailable"), { code: "ECONNREFUSED" });
          },
        }),
      }),
      execute: async () => undefined,
    };
    return {
      select: () => ({ from: () => { const index = state.fromIndex++; return { where: async () => index === 0 ? state.krRows : state.usRows }; } }),
      transaction: async (callback: (tx: typeof tx) => Promise<void>) => {
        state.transactionCount++;
        return callback(tx);
      },
    };
  },
}));
vi.mock("@/lib/automation-lock", () => ({ withAutomationLock: async (_key: string, task: () => Promise<unknown>) => task() }));
vi.mock("@/lib/instrument-fundamental-progress", () => ({
  beginFundamentalRefresh: async (items: Array<{ market: string; code: string; name: string }>) => {
    if (!state.progressItems.length) state.progressItems = items;
    for (const item of items) if (!state.progressStatuses.has(`${item.market}:${item.code}`)) state.progressStatuses.set(`${item.market}:${item.code}`, "PENDING");
    const pending = state.progressItems.filter((item) => {
      const status = state.progressStatuses.get(`${item.market}:${item.code}`);
      return status !== "SUCCESS" && !(status === "FAILED" && state.progressDeferred > 0);
    });
    return { jobId: state.progressJobId, resumed: state.progressResumed, instruments: pending, skippedCompletedCount: items.length - pending.length, deferredRetryCount: state.progressDeferred, nextRetryAt: state.progressNextRetryAt };
  },
  markFundamentalBatchInTransaction: async (_tx: unknown, _jobId: number, succeeded: Array<{ market: string; code: string }>, failed: Array<{ market: string; code: string; errorCode: string }>) => {
    state.progressMarks.push({ succeeded, failed });
    for (const item of succeeded) state.progressStatuses.set(`${item.market}:${item.code}`, "SUCCESS");
    for (const item of failed) state.progressStatuses.set(`${item.market}:${item.code}`, "FAILED");
  },
  finishFundamentalRefresh: async () => {
    const values = [...state.progressStatuses.values()];
    const successCount = values.filter((value) => value === "SUCCESS").length;
    const failedCount = values.filter((value) => value === "FAILED").length;
    return { status: successCount === values.length ? "SUCCESS" : successCount === 0 && failedCount === values.length ? "FAILED" : "PARTIAL", totalCount: values.length, successCount, failedCount, pendingCount: values.length - successCount - failedCount };
  },
}));
vi.mock("@/lib/kis-kr-price-detail", () => ({ fetchKrPriceDetail: vi.fn(async () => ({ ok: true, status: 200, price: 100, marketCap: null, raw: {} })) }));
vi.mock("@/lib/kis-us-price-detail", () => ({
  fetchKisUsPriceDetail: vi.fn(async ({ code, market }: { code: string; market: string }) => {
    state.fetchedUs.push({ code, market });
    return { ok: true, status: 200, parsed: { rt_cd: "0", output: { last: "10", tomv: "100", crcy: "USD" } } };
  }),
  getKisUsPriceDetailOutput: (parsed: { output?: unknown }) => parsed.output ?? {},
}));

import { instrumentFundamentalHistory, instrumentFundamentalSnapshots } from "@/lib/schema";
import { classifyFundamentalProviderFailure, isEligibleFundamentalInstrument, parseNullableFundamentalNumber, refreshInstrumentFundamentals } from "./instrument-fundamentals";

function usItem(code: string, extra: Record<string, unknown> = {}) {
  return { market: "NAS", code, name: `Company ${code}`, enabled: true, instrumentType: "COMMON_STOCK", isEtp: false, isWarrant: false, isDerivative: false, isDr: false, isLeveraged: false, isInverse: false, ...extra };
}

beforeEach(() => {
  state.krRows = [];
  state.usRows = [usItem("AAPL")];
  state.fetchedUs = [];
  state.historyRows = [];
  state.snapshotRows = [];
  state.snapshotSet = null;
  state.transactionCount = 0;
  state.insertAttemptCount = 0;
  state.failSnapshotWrites = false;
  state.fromIndex = 0;
  state.progressJobId = 1;
  state.progressItems = [];
  state.progressStatuses = new Map();
  state.progressResumed = false;
  state.progressDeferred = 0;
  state.progressNextRetryAt = null;
  state.progressMarks = [];
});

describe("instrument-fundamentals refresh", () => {
  it("treats absent, blank, and malformed provider numerics as unknown rather than zero", () => {
    expect(parseNullableFundamentalNumber(undefined)).toBeNull();
    expect(parseNullableFundamentalNumber(null)).toBeNull();
    expect(parseNullableFundamentalNumber("  ")).toBeNull();
    expect(parseNullableFundamentalNumber("not-a-number")).toBeNull();
    expect(parseNullableFundamentalNumber("1,234.5")).toBe(1234.5);
    expect(parseNullableFundamentalNumber("0")).toBe(0);
  });

  it("classifies provider HTTP, business, stale, price, and market-cap failures without free-form messages", () => {
    const base = { status: 200, responseOk: true, price: 10, marketCap: 100 };
    expect(classifyFundamentalProviderFailure({ ...base, status: 503, responseOk: false })).toBe("KIS_HTTP_STATUS_503");
    expect(classifyFundamentalProviderFailure({ ...base, rtCd: "1", messageCode: "EGW00123" })).toBe("KIS_BUSINESS_ERROR_EGW00123");
    expect(classifyFundamentalProviderFailure({ ...base, rtCd: "1", messageCode: "Authorization error with token" })).toBe("KIS_BUSINESS_ERROR_UNKNOWN");
    expect(classifyFundamentalProviderFailure({ ...base, stale: true })).toBe("KIS_STALE_DATA");
    expect(classifyFundamentalProviderFailure({ ...base, price: null })).toBe("KIS_PRICE_INVALID");
    expect(classifyFundamentalProviderFailure({ ...base, marketCap: null })).toBe("KIS_MARKET_CAP_MISSING_OR_INVALID");
    expect(classifyFundamentalProviderFailure(base)).toBeNull();
  });

  it("accepts only enabled common stocks without excluded product or halt flags", () => {
    const common = usItem("AAPL");
    expect(isEligibleFundamentalInstrument(common)).toBe(true);
    expect(isEligibleFundamentalInstrument({ ...common, enabled: false })).toBe(false);
    expect(isEligibleFundamentalInstrument({ ...common, instrumentType: "UNKNOWN" })).toBe(false);
    expect(isEligibleFundamentalInstrument({ ...common, isWarrant: true })).toBe(false);
    expect(isEligibleFundamentalInstrument({ ...common, market: "OTC" })).toBe(false);
    expect(isEligibleFundamentalInstrument({ market: "KOSPI", enabled: true, instrumentType: "COMMON_STOCK", isSuspended: true })).toBe(false);
  });

  it("revalidates active common-stock eligibility before making provider calls", async () => {
    state.usRows = [usItem("AAPL"), usItem("BAD1", { isWarrant: true }), usItem("BAD2", { instrumentType: "UNKNOWN" }), usItem("BAD3", { enabled: false })];

    const result = await refreshInstrumentFundamentals();

    expect(result.instrumentCount).toBe(1);
    expect(state.fetchedUs).toEqual([{ code: "AAPL", market: "NAS" }]);
  });

  it("does not save successful-but-stale or business-error KIS responses to snapshots/history", async () => {
    const { fetchKisUsPriceDetail } = await import("@/lib/kis-us-price-detail");
    vi.mocked(fetchKisUsPriceDetail).mockImplementationOnce(async () => ({ ok: true, status: 200, code: "AAPL", market: "NAS", stale: true, parsed: { rt_cd: "0", output: { last: "10", tomv: "100" } } }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, code: "MSFT", market: "NAS", parsed: { rt_cd: "1", output: { last: "10", tomv: "100" } } }));
    state.usRows = [usItem("AAPL"), usItem("MSFT")];

    const result = await refreshInstrumentFundamentals();

    expect(result).toMatchObject({ ok: false, instrumentCount: 2, attemptedCount: 2, successCount: 0, failureCount: 2 });
    expect(result.failures.map((failure) => failure.error).sort()).toEqual(["KIS_BUSINESS_ERROR_UNKNOWN", "KIS_STALE_DATA"]);
    expect(state.transactionCount).toBe(1);
    expect(state.historyRows).toHaveLength(0);
    expect(state.snapshotRows).toHaveLength(0);
  });

  it("does not save a snapshot from a response with a missing market cap", async () => {
    const { fetchKisUsPriceDetail } = await import("@/lib/kis-us-price-detail");
    vi.mocked(fetchKisUsPriceDetail).mockResolvedValueOnce({ ok: true, status: 200, code: "AAPL", market: "NAS", parsed: { rt_cd: "0", output: { last: "10", tomv: "" } } });

    const result = await refreshInstrumentFundamentals();

    expect(result).toMatchObject({ ok: false, attemptedCount: 1, successCount: 0, failureCount: 1 });
    expect(result.failures[0]).toMatchObject({ market: "NAS", code: "AAPL", error: "KIS_MARKET_CAP_MISSING_OR_INVALID" });
    expect(state.transactionCount).toBe(1);
    expect(state.historyRows).toHaveLength(0);
    expect(state.snapshotRows).toHaveLength(0);
  });

  it("identifies an unavailable overseas token separately from a quote response error", async () => {
    const { fetchKisUsPriceDetail } = await import("@/lib/kis-us-price-detail");
    vi.mocked(fetchKisUsPriceDetail).mockResolvedValueOnce(null);

    const result = await refreshInstrumentFundamentals();

    expect(result.failures).toEqual([{ market: "NAS", code: "AAPL", error: "KIS_TOKEN_UNAVAILABLE" }]);
    expect(result.failureCodeCounts).toEqual({ KIS_TOKEN_UNAVAILABLE: 1 });
  });

  it("retains the complete failure-code distribution when detailed samples are capped", async () => {
    const { fetchKisUsPriceDetail } = await import("@/lib/kis-us-price-detail");
    state.usRows = Array.from({ length: 120 }, (_, index) => usItem(`T${String(index).padStart(3, "0")}`));
    vi.mocked(fetchKisUsPriceDetail).mockImplementation(async ({ code, market }) => ({
      ok: true, status: 200, code, market: market ?? "AMS",
      parsed: { rt_cd: "1", msg_cd: "EGW00103", output: { last: "10", tomv: "100" } },
    }));

    const result = await refreshInstrumentFundamentals();
    vi.mocked(fetchKisUsPriceDetail).mockImplementation(async ({ code, market }) => {
      state.fetchedUs.push({ code, market: market ?? "AMS" });
      return { ok: true, status: 200, code, market: market ?? "AMS", parsed: { rt_cd: "0", output: { last: "10", tomv: "100", crcy: "USD" } } };
    });

    expect(result).toMatchObject({
      failureCount: 120,
      failureCodeCounts: { KIS_BUSINESS_ERROR_EGW00103: 120 },
      failureCodeCountsByMarket: { NAS: { KIS_BUSINESS_ERROR_EGW00103: 120 } },
    });
    expect(result.failures).toHaveLength(100);
  });

  it("commits successful snapshots in bounded atomic batches", async () => {
    state.usRows = Array.from({ length: 201 }, (_, index) => usItem(`T${String(index).padStart(3, "0")}`));

    const result = await refreshInstrumentFundamentals();

    expect(result).toMatchObject({ ok: true, instrumentCount: 201, attemptedCount: 201, successCount: 201, failureCount: 0 });
    expect(state.transactionCount).toBe(2);
    expect(state.historyRows).toHaveLength(201);
    expect(state.snapshotRows).toHaveLength(201);
    expect(state.snapshotRows[0].marketCap).toBe(100);
    expect(state.snapshotSet?.marketCap).toBeDefined();
    expect(state.progressMarks).toHaveLength(2);
    expect(state.progressMarks[0].succeeded).toHaveLength(200);
    expect(new PgDialect().sqlToQuery(state.snapshotSet?.marketCap as never).sql).toMatch(/COALESCE\(excluded\.market_cap,/i);
  });

  it("retries a failed snapshot batch transaction and reports an incomplete run", async () => {
    state.usRows = Array.from({ length: 3 }, (_, index) => usItem(`T${index}`));
    state.failSnapshotWrites = true;

    const result = await refreshInstrumentFundamentals();

    expect(result.ok).toBe(false);
    expect(result.successCount).toBe(0);
    expect(result.databaseFailure).toMatchObject({ errorCode: "DATABASE_CONNECTION_FAILED" });
    expect(result).toMatchObject({
      failureCount: 3,
      failureCodeCounts: { DATABASE_CONNECTION_FAILED: 3 },
      failureCodeCountsByMarket: { NAS: { DATABASE_CONNECTION_FAILED: 3 } },
    });
    expect(state.insertAttemptCount).toBe(3);
  });

  it("resumes only unfinished instruments and skips already committed snapshots", async () => {
    state.usRows = [usItem("AAPL"), usItem("MSFT")];
    state.progressItems = state.usRows as Array<{ market: string; code: string; name: string }>;
    state.progressStatuses.set("NAS:AAPL", "SUCCESS");
    state.progressResumed = true;

    const result = await refreshInstrumentFundamentals();

    expect(result).toMatchObject({ instrumentCount: 2, attemptedCount: 1, successCount: 1, progress: { resumed: true, skippedCompletedCount: 1, cumulativeSuccessCount: 2 } });
    expect(state.fetchedUs).toEqual([{ code: "MSFT", market: "NAS" }]);
    expect(state.historyRows.map((row) => row.code)).toEqual(["MSFT"]);
  });

  it("skips KIS calls while all failed instruments are in their persisted retry backoff", async () => {
    state.progressItems = [usItem("AAPL")];
    state.progressStatuses.set("NAS:AAPL", "FAILED");
    state.progressDeferred = 1;
    state.progressNextRetryAt = "2026-10-19T00:00:00.000Z";

    const result = await refreshInstrumentFundamentals();

    expect(result).toMatchObject({ ok: true, skipped: true, reason: "instrument_retry_backoff", attemptedCount: 0, nextRetryAt: state.progressNextRetryAt, progress: { deferredRetryCount: 1 } });
    expect(state.fetchedUs).toEqual([]);
    expect(state.transactionCount).toBe(0);
  });

  it("uses transaction insert targets for both snapshot and history in each batch", async () => {
    await refreshInstrumentFundamentals();
    expect(instrumentFundamentalHistory).toBeDefined();
    expect(instrumentFundamentalSnapshots).toBeDefined();
    expect(state.historyRows[0]).toMatchObject({ market: "NAS", code: "AAPL", price: 10, marketCap: 100 });
  });
});
