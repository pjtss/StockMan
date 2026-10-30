import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connectMock, clientQueryMock } = vi.hoisted(() => ({ connectMock: vi.fn(), clientQueryMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ connect: connectMock }) }));

import { refreshUsObvDivergenceSnapshot } from "@/lib/us-obv-divergence-snapshot";

describe("refreshUsObvDivergenceSnapshot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T22:10:00.000Z")); // Thursday, 18:10 America/New_York.
    clientQueryMock.mockReset().mockImplementation(async (query: string) => {
      if (query === "BEGIN" || query === "ROLLBACK" || query === "COMMIT") return { rows: [] };
      if (query.includes("pg_try_advisory_xact_lock")) return { rows: [{ locked: true }] };
      if (query.includes("MAX(CASE")) return { rows: [{ latest_date: new Date("2026-10-29T00:00:00.000Z") }] };
      if (query.includes("FOR UPDATE")) return { rows: [] };
      if (query.includes("official_count")) return { rows: [{ official_count: "1500", valid_us_market_cap_count: "1500", eligible_count: "1500" }] };
      if (query.includes("COUNT(*)::text")) return { rows: [{ count: "1500" }] };
      if (query.includes("LEFT JOIN LATERAL")) return { rows: [] };
      throw new Error(`Unexpected query: ${query}`);
    });
    connectMock.mockReset().mockResolvedValue({ query: clientQueryMock, release: vi.fn() });
  });
  afterEach(() => vi.useRealTimers());

  it("skips before the settlement window without opening a database connection", async () => {
    vi.setSystemTime(new Date("2026-10-29T21:00:00.000Z"));
    await expect(refreshUsObvDivergenceSnapshot()).resolves.toMatchObject({ skipped: true, reason: "BEFORE_DAILY_DATA_SETTLEMENT_WINDOW" });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rolls back and preserves the prior snapshot when coverage is below the publication gate", async () => {
    await expect(refreshUsObvDivergenceSnapshot()).rejects.toThrow("LOW_DATA_COVERAGE");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQueryMock.mock.calls.some(([query]) => String(query).includes("INSERT INTO us_obv_divergence_snapshot"))).toBe(false);
  });
});
