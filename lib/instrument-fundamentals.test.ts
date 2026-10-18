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
vi.mock("@/lib/kis-kr-price-detail", () => ({ fetchKrPriceDetail: vi.fn(async () => ({ ok: true, status: 200, price: 100, marketCap: null, raw: {} })) }));
vi.mock("@/lib/kis-us-price-detail", () => ({
  fetchKisUsPriceDetail: vi.fn(async ({ code, market }: { code: string; market: string }) => {
    state.fetchedUs.push({ code, market });
    return { ok: true, status: 200, parsed: { rt_cd: "0", output: { last: "10", tomv: "100", crcy: "USD" } } };
  }),
  getKisUsPriceDetailOutput: (parsed: { output?: unknown }) => parsed.output ?? {},
}));

import { instrumentFundamentalHistory, instrumentFundamentalSnapshots } from "@/lib/schema";
import { isEligibleFundamentalInstrument, parseNullableFundamentalNumber, refreshInstrumentFundamentals } from "./instrument-fundamentals";

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

  it("does not send successful-but-stale or business-error KIS responses to the database", async () => {
    const { fetchKisUsPriceDetail } = await import("@/lib/kis-us-price-detail");
    vi.mocked(fetchKisUsPriceDetail).mockImplementationOnce(async () => ({ ok: true, status: 200, code: "AAPL", market: "NAS", stale: true, parsed: { rt_cd: "0", output: { last: "10", tomv: "100" } } }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, code: "MSFT", market: "NAS", parsed: { rt_cd: "1", output: { last: "10", tomv: "100" } } }));
    state.usRows = [usItem("AAPL"), usItem("MSFT")];

    const result = await refreshInstrumentFundamentals();

    expect(result).toMatchObject({ ok: false, instrumentCount: 2, attemptedCount: 2, successCount: 0, failureCount: 2 });
    expect(state.transactionCount).toBe(0);
  });

  it("does not refresh a snapshot from a response with a missing market cap", async () => {
    const { fetchKisUsPriceDetail } = await import("@/lib/kis-us-price-detail");
    vi.mocked(fetchKisUsPriceDetail).mockResolvedValueOnce({ ok: true, status: 200, code: "AAPL", market: "NAS", parsed: { rt_cd: "0", output: { last: "10", tomv: "" } } });

    const result = await refreshInstrumentFundamentals();

    expect(result).toMatchObject({ ok: false, attemptedCount: 1, successCount: 0, failureCount: 1 });
    expect(result.failures[0]).toMatchObject({ market: "NAS", code: "AAPL", error: "KIS_MARKET_CAP_MISSING_OR_INVALID" });
    expect(state.transactionCount).toBe(0);
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
    expect(new PgDialect().sqlToQuery(state.snapshotSet?.marketCap as never).sql).toMatch(/COALESCE\(excluded\.market_cap,/i);
  });

  it("retries a failed snapshot batch transaction and reports an incomplete run", async () => {
    state.usRows = Array.from({ length: 3 }, (_, index) => usItem(`T${index}`));
    state.failSnapshotWrites = true;

    const result = await refreshInstrumentFundamentals();

    expect(result.ok).toBe(false);
    expect(result.successCount).toBe(0);
    expect(result.databaseFailure).toMatchObject({ errorCode: "DATABASE_CONNECTION_FAILED" });
    expect(state.insertAttemptCount).toBe(3);
  });

  it("uses transaction insert targets for both snapshot and history in each batch", async () => {
    await refreshInstrumentFundamentals();
    expect(instrumentFundamentalHistory).toBeDefined();
    expect(instrumentFundamentalSnapshots).toBeDefined();
    expect(state.historyRows[0]).toMatchObject({ market: "NAS", code: "AAPL", price: 10, marketCap: 100 });
  });
});
