import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdminSession: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: mocks.requireAdminSession }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: mocks.query }) }));

import { GET } from "./route";

describe("GET /api/admin/us-industry-turnover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminSession.mockResolvedValue(true);
    mocks.query.mockResolvedValue({ rows: [{ report: {
      latestDate: "2026-10-23",
      startDate: "2026-09-23",
      eligibleCommonCount: 5000,
      eligibleClassifiedCount: 4900,
      eligibleUnclassifiedCount: 100,
      eligibleWithPeriodCandlesCount: 4800,
      summary: [{ classification_source: "SEC_SIC", industry_code: "2834", period_trading_value_usd: "123456" }],
      daily: [{ date: "2026-10-23", classification_source: "SEC_SIC", industry_code: "2834", trading_value_usd: "123456" }],
    } }] });
  });

  it("requires an administrator session", async () => {
    mocks.requireAdminSession.mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns monthly and daily rows without merging KIS and SEC codes", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.source).toBe("OPERATING_DB_READ_ONLY_AGGREGATION");
    expect(body.summary[0].classification_source).toBe("SEC_SIC");
    expect(body.eligibleWithPeriodCandlesCount).toBe(4800);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("u.instrument_type = 'COMMON_STOCK'");
    expect(sql).toContain("CASE WHEN u.source_file LIKE 'SEC_EDGAR_SIC:%' THEN 'SEC_SIC' ELSE 'KIS_ICOD' END");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
  });

  it("reports unavailable candles instead of returning an empty success", async () => {
    mocks.query.mockResolvedValue({ rows: [{ report: { latestDate: null } }] });
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("US_DAILY_CANDLES_UNAVAILABLE");
  });

  it("does not expose database error details", async () => {
    mocks.query.mockRejectedValue(new Error("postgres://private-user:private-password@host/db"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private-password");
  });
});
