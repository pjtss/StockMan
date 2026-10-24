import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const state = vi.hoisted(() => ({ admin: true, query: vi.fn(), clientQuery: vi.fn(), fetchInfo: vi.fn(), getToken: vi.fn() }));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: () => state.admin }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: state.query, connect: async () => ({ query: state.clientQuery, release: vi.fn() }) }) }));
vi.mock("@/lib/kis-investor-flow", () => ({ fetchDomesticStockInfo: state.fetchInfo }));
vi.mock("@/lib/kis-token", () => ({ getAccessToken: state.getToken }));

describe("domestic standard industry sync API", () => {
  beforeEach(() => {
    state.admin = true;
    state.query.mockReset();
    state.clientQuery.mockReset();
    state.fetchInfo.mockReset();
    state.getToken.mockReset();
    state.getToken.mockResolvedValue("test-token");
  });

  it("returns aggregate coverage from the operating universe status query", async () => {
    state.query.mockResolvedValue({ rows: [{ total: 4123, completed: 1, missing: 4122 }] });
    const response = await GET(new Request("https://example.test/api/admin/domestic-industry-sync"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 4123, completed: 1, missing: 4122 });
    expect(state.query.mock.calls[0][0]).toContain("instrument_type = 'COMMON_STOCK'");
  });

  it("fetches KIS standard industry data and commits a verified batch", async () => {
    state.query.mockResolvedValue({ rowCount: 1, rows: [{ market: "KOSPI", code: "005930", standard_code: "KR7005930003" }] });
    state.fetchInfo.mockResolvedValue({ ok: true, msgCd: "KIOK0530", rows: [{ std_pdno: "KR7005930003", std_idst_clsf_cd: "032604", std_idst_clsf_cd_name: "통신 및 방송 장비 제조업" }] });
    state.clientQuery.mockResolvedValue({ rowCount: 1 });

    const response = await POST(new Request("https://example.test/api/admin/domestic-industry-sync", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offset: 0, expectedTotal: 1, batchSize: 10 }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, processed: 1, nextOffset: 1, total: 1 });
    expect(state.fetchInfo).toHaveBeenCalledWith("test-token", "005930");
    expect(state.clientQuery.mock.calls.some(([sql]) => String(sql).includes("standard_industry_code"))).toBe(true);
  });

  it("accepts official six-character alphanumeric KRX issue codes", async () => {
    state.query.mockResolvedValue({ rowCount: 1, rows: [{ market: "KOSDAQ", code: "0001A0", standard_code: "KR70001A0001" }] });
    state.fetchInfo.mockResolvedValue({ ok: true, msgCd: "KIOK0530", rows: [{ std_pdno: "KR70001A0001", std_idst_clsf_cd: "032604", std_idst_clsf_cd_name: "산업용 가스 제조업" }] });
    state.clientQuery.mockResolvedValue({ rowCount: 1 });

    const response = await POST(new Request("https://example.test/api/admin/domestic-industry-sync", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offset: 0, expectedTotal: 1, batchSize: 1 }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, processed: 1, nextOffset: 1, total: 1 });
    expect(state.fetchInfo).toHaveBeenCalledWith("test-token", "0001A0");
  });

  it("does not write a batch when KIS returns an invalid industry code", async () => {
    state.query.mockResolvedValue({ rowCount: 1, rows: [{ market: "KOSPI", code: "005930", standard_code: "KR7005930003" }] });
    state.fetchInfo.mockResolvedValue({ ok: true, msgCd: "KIOK0530", rows: [{ std_pdno: "KR7005930003", std_idst_clsf_cd: "", std_idst_clsf_cd_name: "" }] });

    const response = await POST(new Request("https://example.test/api/admin/domestic-industry-sync", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offset: 0, expectedTotal: 1, batchSize: 1 }),
    }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, error: "KIS_STOCK_INFO_INVALID", failedCode: "005930", checks: { industryCode: false } });
    expect(state.clientQuery).not.toHaveBeenCalled();
  });

  it("requires an admin session before a write batch", async () => {
    state.admin = false;
    const response = await POST(new Request("https://example.test/api/admin/domestic-industry-sync", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(state.query).not.toHaveBeenCalled();
  });
});
