import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchCondition: vi.fn(),
  filterRows: vi.fn(),
  writeSnapshot: vi.fn(),
}));

vi.mock("@/lib/kis-us-condition-search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kis-us-condition-search")>();
  return {
    ...actual,
    fetchKisUsConditionSearch: mocks.fetchCondition,
    filterKisUsConditionRows: mocks.filterRows,
  };
});
vi.mock("@/lib/kis-signal-snapshot", () => ({ writeKisSignalSnapshot: mocks.writeSnapshot }));

import { GET } from "./route";

const providerRows = [
  { symb: "AAA", excd: "NAS", name: "Alpha Corp", rank: "1" },
  { symb: "ETF1", excd: "NAS", name: "Example ETF", rank: "2" },
];
const commonRow = providerRows[0];

describe("GET /api/kis/us-search", () => {
  beforeEach(() => {
    mocks.fetchCondition.mockReset();
    mocks.filterRows.mockReset();
    mocks.writeSnapshot.mockReset().mockResolvedValue(undefined);
  });

  it("validates query parameters before calling KIS", async () => {
    const response = await GET(new Request("http://localhost/api/kis/us-search?market=OTC"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "INVALID_MARKET", markets: ["NAS", "NYS", "AMS"] });
    expect(mocks.fetchCondition).not.toHaveBeenCalled();
  });

  it("returns and persists only rows confirmed as active common stocks", async () => {
    mocks.fetchCondition.mockResolvedValue({
      ok: true,
      status: 200,
      market: "NAS",
      rows: providerRows,
      raw: { output1: { crec: "2", trec: "2" }, output2: providerRows, rt_cd: "0", msg_cd: "MCA00000", msg1: "OK" },
      diagnostics: { rt_cd: "0", msg_cd: "MCA00000", msg1: "OK", contentType: "application/json" },
    });
    mocks.filterRows.mockResolvedValue({ rows: [commonRow], requestedCount: 2, eligibleCount: 1, excludedCount: 1 });

    const response = await GET(new Request("http://localhost/api/kis/us-search?market=NAS&CO_YN_RATE=1&CO_ST_RATE=-5&CO_EN_RATE=10"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ code: "AAA", name: "Alpha Corp", market: "NAS", rank: "1" });
    expect(body.eligibility).toMatchObject({ source: "us_common_stock_universe", failClosed: true, requestedCount: 2, eligibleCount: 1, excludedCount: 1 });
    expect(body.pagination).toEqual({ supported: false, maximumRows: 100, returnedRows: 2 });
    expect(JSON.stringify(body)).not.toContain("ETF1");
    expect(mocks.filterRows).toHaveBeenCalledWith("NAS", providerRows);
    expect(mocks.writeSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ rows: [expect.objectContaining({ code: "AAA" })] }),
      rawPayload: expect.not.stringContaining("ETF1"),
    }));
  });

  it("fails closed when the official common-stock universe cannot be queried", async () => {
    mocks.fetchCondition.mockResolvedValue({ ok: true, status: 200, market: "NAS", rows: providerRows, raw: null, diagnostics: {} });
    mocks.filterRows.mockRejectedValue(new Error("database offline"));
    const response = await GET(new Request("http://localhost/api/kis/us-search"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: "COMMON_STOCK_UNIVERSE_UNAVAILABLE", eligibility: { failClosed: true } });
    expect(mocks.writeSnapshot).not.toHaveBeenCalled();
  });

  it("returns structured JSON for KIS HTML/JSON transport failures without echoing body text", async () => {
    mocks.fetchCondition.mockResolvedValue({
      ok: false,
      status: 504,
      market: "NAS",
      rows: [],
      raw: null,
      error: "KIS_NON_JSON_RESPONSE",
      diagnostics: { rt_cd: null, msg_cd: null, msg1: null, contentType: "text/html" },
    });
    const response = await GET(new Request("http://localhost/api/kis/us-search"));
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toMatchObject({ ok: false, upstreamError: "KIS_NON_JSON_RESPONSE", diagnostics: { contentType: "text/html" }, rows: [] });
  });

  it("does not fail a valid search when optional snapshot persistence fails", async () => {
    mocks.fetchCondition.mockResolvedValue({ ok: true, status: 200, market: "NAS", rows: providerRows, raw: null, diagnostics: {} });
    mocks.filterRows.mockResolvedValue({ rows: [commonRow], requestedCount: 2, eligibleCount: 1, excludedCount: 1 });
    mocks.writeSnapshot.mockRejectedValue(new Error("database write failed"));
    const response = await GET(new Request("http://localhost/api/kis/us-search"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, snapshot: { stored: false }, warning: "SIGNAL_SNAPSHOT_WRITE_FAILED" });
  });
});
