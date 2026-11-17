import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock("@/lib/db", () => ({ getPool: () => ({ query: poolQuery }) }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/stock/lookup", () => {
  it("returns exchange-scoped Korean common-stock names and omits a conflicting code-only alias", async () => {
    poolQuery.mockResolvedValue({ rows: [
      { market: "KOSPI", code: "005930", name: "삼성전자" },
      { market: "KOSDAQ", code: "005930", name: "다른 회사" },
    ] });

    const response = await GET(new Request("http://localhost/api/stock/lookup?market=KR&codes=005930"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.names).toEqual({ "KOSPI:005930": "삼성전자", "KOSDAQ:005930": "다른 회사" });
    expect(String(poolQuery.mock.calls[0][0])).toContain("u.instrument_type = 'COMMON_STOCK'");
    expect(String(poolQuery.mock.calls[0][0])).toContain("kr_common_stock_universe");
  });

  it("constrains names to the requested exchange", async () => {
    poolQuery.mockImplementation(async (_query: string, params: unknown[] = []) => ({
      rows: [
        { market: "KOSPI", code: "005930", name: "삼성전자" },
        { market: "KOSDAQ", code: "005930", name: "다른 회사" },
      ].filter((row) => !params[1] || row.market === params[1]),
    }));

    const response = await GET(new Request("http://localhost/api/stock/lookup?market=KR&exchange=KOSPI&codes=005930"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining("u.market = $2"), [["005930"], "KOSPI"]);
    expect(body.names).toEqual({ "KOSPI:005930": "삼성전자", "KR:005930": "삼성전자", "005930": "삼성전자" });
  });

  it("maps US realtime symbols to their exchange and only emits an unscoped alias when unambiguous", async () => {
    poolQuery.mockResolvedValue({ rows: [
      { market: "NAS", code: "ABC", realtime_symbol: "ABC.N", name: "Example Inc." },
      { market: "NYS", code: "ABC", realtime_symbol: "ABC.NY", name: "Example Inc." },
    ] });

    const response = await GET(new Request("http://localhost/api/stock/lookup?market=US&codes=ABC"));
    const body = await response.json();

    expect(body.names).toMatchObject({ "NAS:ABC": "Example Inc.", "NAS:ABC.N": "Example Inc.", "NYS:ABC.NY": "Example Inc.", "US:ABC": "Example Inc.", "US:ABC.N": "Example Inc.", ABC: "Example Inc." });
  });

  it("rejects an exchange that does not belong to the requested market", async () => {
    const response = await GET(new Request("http://localhost/api/stock/lookup?market=KR&exchange=NAS&codes=005930"));

    expect(response.status).toBe(400);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("fails closed when the lookup query is unavailable", async () => {
    poolQuery.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(new Request("http://localhost/api/stock/lookup?market=KR&codes=005930"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "LOOKUP_UNAVAILABLE" });
  });
});
