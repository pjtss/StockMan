import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  getAccessToken: vi.fn(),
  fetchTimeItemChartPrice: vi.fn(),
  fetchKisUsMinuteChart: vi.fn(),
  writeKisSignalSnapshot: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ getPool: () => ({ query: mocks.poolQuery }) }));
vi.mock("@/lib/kis-token", () => ({ getAccessToken: mocks.getAccessToken }));
vi.mock("@/lib/kis-investor-flow", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/kis-investor-flow")>(),
  fetchTimeItemChartPrice: mocks.fetchTimeItemChartPrice,
}));
vi.mock("@/lib/kis-us-trade-trend", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/kis-us-trade-trend")>(),
  fetchKisUsMinuteChart: mocks.fetchKisUsMinuteChart,
}));
vi.mock("@/lib/kis-signal-snapshot", () => ({ writeKisSignalSnapshot: mocks.writeKisSignalSnapshot }));

import { GET } from "./route";

function minuteRow(time: string, values: Partial<Record<"open" | "high" | "low" | "close" | "volume", number>> = {}) {
  const open = values.open ?? 100;
  const close = values.close ?? 101;
  return {
    stck_bsop_date: "20261112",
    stck_cntg_hour: time,
    stck_oprc: String(open),
    stck_hgpr: String(values.high ?? Math.max(open, close) + 1),
    stck_lwpr: String(values.low ?? Math.min(open, close) - 1),
    stck_prpr: String(close),
    cntg_vol: String(values.volume ?? 10),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.poolQuery.mockResolvedValue({ rows: [{ market: "KOSDAQ" }] });
  mocks.getAccessToken.mockResolvedValue("test-token");
  mocks.fetchTimeItemChartPrice.mockResolvedValue({ ok: true, status: 200, rows: [minuteRow("100000")] });
  mocks.fetchKisUsMinuteChart.mockResolvedValue({ ok: true, status: 200, code: "AAPL", market: "NAS", rows: [], raw: {}, rawText: "{}", diagnostics: { rt_cd: "0", msg_cd: null, msg1: null } });
  mocks.writeKisSignalSnapshot.mockResolvedValue(undefined);
});

describe("GET /api/kis/market-flow minute chart eligibility", () => {
  it("does not record an empty US minute business-success response as available", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ code: "AAPL" }] });
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=US:AAPL&market=US&mode=minute&exchange=NAS"));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, error: "KIS_MINUTE_DATA_EMPTY_OR_INVALID", flowStatus: "UNAVAILABLE", rows: [] });
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("instrument_type = 'COMMON_STOCK'"), ["NAS", "AAPL"]);
    expect(mocks.writeKisSignalSnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "UNAVAILABLE", payload: [] }));
  });

  it("returns a successful US chart when only snapshot persistence fails", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ code: "AAPL" }] });
    mocks.fetchKisUsMinuteChart.mockResolvedValue({ ok: true, status: 200, code: "AAPL", market: "NAS", rows: [{ xymd: "20261112", khms: "093000", open: "100", high: "102", low: "99", last: "101", evol: "10" }], raw: {}, rawText: "{}", diagnostics: { rt_cd: "0", msg_cd: null, msg1: null } });
    mocks.writeKisSignalSnapshot.mockRejectedValue(new Error("snapshot database unavailable"));

    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=US:AAPL&market=US&mode=minute&exchange=NAS"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, flowStatus: "AVAILABLE", snapshot: { stored: false }, warning: "SIGNAL_SNAPSHOT_WRITE_FAILED" });
  });

  it("fails closed for a US ticker outside the active common-stock master", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=US:SPY&market=US&mode=minute&exchange=NAS"));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "US_COMMON_STOCK_NOT_FOUND", eligibility: "FAIL_CLOSED" });
    expect(mocks.fetchKisUsMinuteChart).not.toHaveBeenCalled();
    expect(mocks.writeKisSignalSnapshot).not.toHaveBeenCalled();
  });

  it("fails closed when the US common-stock master is unavailable", async () => {
    mocks.poolQuery.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=US:AAPL&market=US&mode=minute&exchange=NAS"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "COMMON_STOCK_UNIVERSE_UNAVAILABLE", eligibility: "FAIL_CLOSED" });
    expect(mocks.fetchKisUsMinuteChart).not.toHaveBeenCalled();
  });

  it("validates the selected domestic exchange against the active common-stock master", async () => {
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=005930&market=KR&mode=minute&exchange=KOSDAQ"));

    expect(response.status).toBe(200);
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("instrument_type = 'COMMON_STOCK'"), ["005930", "KOSDAQ"]);
    expect(mocks.fetchTimeItemChartPrice).toHaveBeenCalledWith("test-token", "005930", "153000", "Y");
  });

  it("rejects an exchange mismatch before requesting KIS", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=005930&market=KR&mode=minute&exchange=KOSPI"));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "KR_COMMON_STOCK_NOT_FOUND", eligibility: "FAIL_CLOSED" });
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
    expect(mocks.fetchTimeItemChartPrice).not.toHaveBeenCalled();
  });

  it("requires an exchange for a code mapped to multiple active domestic markets", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ market: "KOSPI" }, { market: "KOSDAQ" }] });
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=005930&market=KR&mode=minute"));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "AMBIGUOUS_KR_EXCHANGE", eligibility: "FAIL_CLOSED" });
    expect(mocks.fetchTimeItemChartPrice).not.toHaveBeenCalled();
  });

  it("fails closed when the domestic common-stock master is unavailable", async () => {
    mocks.poolQuery.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=005930&market=KR&mode=minute&exchange=KOSDAQ"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "COMMON_STOCK_UNIVERSE_UNAVAILABLE", eligibility: "FAIL_CLOSED" });
    expect(mocks.fetchTimeItemChartPrice).not.toHaveBeenCalled();
  });

  it("rejects an invalid interval before querying the master or requesting a token", async () => {
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=005930&market=KR&mode=minute&minute=4"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_KR_MINUTE" });
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
  });

  it("does not record or return an empty business-success response as available", async () => {
    mocks.fetchTimeItemChartPrice.mockResolvedValue({ ok: true, status: 200, rows: [] });
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=005930&market=KR&mode=minute&exchange=KOSDAQ"));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, error: "KIS_MINUTE_DATA_EMPTY_OR_INVALID", rows: [] });
    expect(mocks.writeKisSignalSnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "UNAVAILABLE", payload: [] }));
  });

  it("drops malformed OHLC rows before snapshotting the chart response", async () => {
    mocks.fetchTimeItemChartPrice.mockResolvedValue({ ok: true, status: 200, rows: [minuteRow("100000", { high: 90 })] });
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=005930&market=KR&mode=minute&exchange=KOSDAQ"));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, error: "KIS_MINUTE_DATA_EMPTY_OR_INVALID", rows: [] });
    expect(mocks.writeKisSignalSnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "UNAVAILABLE", payload: [] }));
  });

  it.each([
    ["empty volume", { ...minuteRow("100000"), cntg_vol: "" }],
    ["invalid calendar date", { ...minuteRow("100000"), stck_bsop_date: "20261131" }],
    ["invalid time", { ...minuteRow("100000"), stck_cntg_hour: "246100" }],
    ["non-numeric volume type", { ...minuteRow("100000"), cntg_vol: true }],
  ])("rejects a minute row with %s", async (_label, row) => {
    mocks.fetchTimeItemChartPrice.mockResolvedValue({ ok: true, status: 200, rows: [row] });
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=005930&market=KR&mode=minute&exchange=KOSDAQ"));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, error: "KIS_MINUTE_DATA_EMPTY_OR_INVALID", rows: [] });
    expect(mocks.writeKisSignalSnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "UNAVAILABLE", payload: [] }));
  });

  it("aggregates only validated rows into correct five-minute OHLCV", async () => {
    mocks.fetchTimeItemChartPrice.mockResolvedValue({ ok: true, status: 200, rows: [
      minuteRow("093400", { open: 102, high: 105, low: 101, close: 104, volume: 20 }),
      minuteRow("093100", { open: 100, high: 103, low: 98, close: 102, volume: 10 }),
      minuteRow("093200", { open: 101, high: 104, low: 99, close: 103, volume: 30 }),
      minuteRow("093300", { high: 90 }),
    ] });
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=005930&market=KR&mode=minute&minute=5&exchange=KOSDAQ"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ stck_cntg_hour: "0930", stck_oprc: 100, stck_hgpr: 105, stck_lwpr: 98, stck_prpr: 104, cntg_vol: 60, interval: 5 });
    expect(mocks.writeKisSignalSnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: "AVAILABLE", payload: body.rows }));
  });

  it("returns a successful KR chart when only snapshot persistence fails", async () => {
    mocks.writeKisSignalSnapshot.mockRejectedValue(new Error("snapshot database unavailable"));
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=005930&market=KR&mode=minute&exchange=KOSDAQ"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, snapshot: { stored: false }, warning: "SIGNAL_SNAPSHOT_WRITE_FAILED" });
  });

  it("keeps identical clock buckets from different trading dates separate", async () => {
    mocks.fetchTimeItemChartPrice.mockResolvedValue({ ok: true, status: 200, rows: [
      { ...minuteRow("093200", { open: 101, high: 104, low: 99, close: 103, volume: 30 }), stck_bsop_date: "20261112" },
      { ...minuteRow("093100", { open: 100, high: 103, low: 98, close: 102, volume: 10 }), stck_bsop_date: "20261111" },
    ] });
    const response = await GET(new Request("http://localhost/api/kis/market-flow?code=005930&market=KR&mode=minute&minute=5&exchange=KOSDAQ"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rows).toHaveLength(2);
    expect(body.rows.map((row: Record<string, unknown>) => row.stck_bsop_date)).toEqual(["20261112", "20261111"]);
    expect(body.rows.map((row: Record<string, unknown>) => row.cntg_vol)).toEqual([30, 10]);
  });
});
