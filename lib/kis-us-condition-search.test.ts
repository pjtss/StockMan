import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  loadConfig: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("@/lib/kis", () => ({ getAccessToken: mocks.getAccessToken, refreshAccessToken: mocks.refreshAccessToken }));
vi.mock("@/lib/kis-api-config", () => ({ loadKisApiConfig: mocks.loadConfig }));
vi.mock("@/lib/kis-request-throttle", () => ({ withKisRequestThrottle: (request: () => Promise<unknown>) => request() }));
vi.mock("@/lib/kis-authorization", () => ({
  buildKisAuthorization: (token: string) => `Bearer ${token}`,
  isKisTokenExpiredResponse: (status: number, body: { msg_cd?: unknown } | null) => status === 401 || String(body?.msg_cd ?? "") === "EGW00123",
}));

import {
  buildKisUsConditionSearchUrl,
  fetchKisUsConditionSearch,
  filterKisUsConditionRows,
  parseKisUsConditionQuery,
  parseKisUsConditionResponse,
} from "./kis-us-condition-search";

const emptyFilters = {
  CO_YN_PRICECUR: "", CO_ST_PRICECUR: "", CO_EN_PRICECUR: "",
  CO_YN_RATE: "", CO_ST_RATE: "", CO_EN_RATE: "",
  CO_YN_VALX: "", CO_ST_VALX: "", CO_EN_VALX: "",
  CO_YN_SHAR: "", CO_ST_SHAR: "", CO_EN_SHAR: "",
  CO_YN_VOLUME: "", CO_ST_VOLUME: "", CO_EN_VOLUME: "",
  CO_YN_AMT: "", CO_ST_AMT: "", CO_EN_AMT: "",
  CO_YN_EPS: "", CO_ST_EPS: "", CO_EN_EPS: "",
  CO_YN_PER: "", CO_ST_PER: "", CO_EN_PER: "",
} as const;

describe("KIS overseas condition search contract", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.getAccessToken.mockReset().mockResolvedValue("initial-token");
    mocks.refreshAccessToken.mockReset().mockResolvedValue("renewed-token");
    mocks.loadConfig.mockReset().mockResolvedValue({ content_type: "application/json; charset=utf-8", custtype: "P" });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to NAS and sends the full documented filter set with blank AUTH and KEYB", () => {
    const parsed = parseKisUsConditionQuery(new URLSearchParams());
    expect(parsed).toEqual({ ok: true, value: { market: "NAS", filters: emptyFilters } });
    if (!parsed.ok) throw new Error("unexpected invalid query");
    const url = new URL(buildKisUsConditionSearchUrl(parsed.value));
    expect(url.pathname).toBe("/uapi/overseas-price/v1/quotations/inquire-search");
    expect(url.searchParams.get("AUTH")).toBe("");
    expect(url.searchParams.get("EXCD")).toBe("NAS");
    expect(url.searchParams.get("KEYB")).toBe("");
    expect(url.searchParams.getAll("CO_YN_RATE")).toEqual([""]);
    expect([...url.searchParams.keys()]).toHaveLength(27);
  });

  it("accepts a valid numeric range and normalizes the exchange", () => {
    const parsed = parseKisUsConditionQuery(new URLSearchParams("market=nys&CO_YN_RATE=1&CO_ST_RATE=-10&CO_EN_RATE=10"));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toMatchObject({ market: "NYS", filters: { CO_YN_RATE: "1", CO_ST_RATE: "-10", CO_EN_RATE: "10" } });
  });

  it.each([
    ["unsupported market", "market=OTC", "INVALID_MARKET"],
    ["unknown query key", "foo=bar", "UNKNOWN_PARAMETER"],
    ["unsupported pagination", "KEYB=12345678", "PAGINATION_UNSUPPORTED"],
    ["invalid selector", "CO_YN_RATE=0&CO_ST_RATE=1", "INVALID_FILTER"],
    ["range without enabled selector", "CO_ST_RATE=1", "FILTER_NOT_ENABLED"],
    ["enabled condition without bounds", "CO_YN_RATE=1", "FILTER_RANGE_REQUIRED"],
    ["non-numeric bound", "CO_YN_RATE=1&CO_ST_RATE=1x", "INVALID_FILTER"],
    ["reversed range", "CO_YN_RATE=1&CO_ST_RATE=11&CO_EN_RATE=10", "INVALID_RANGE"],
    ["duplicate parameter", "CO_YN_RATE=1&CO_YN_RATE=1", "DUPLICATE_PARAMETER"],
  ])("rejects %s before making a KIS call", (_label, query, error) => {
    const parsed = parseKisUsConditionQuery(new URLSearchParams(query));
    expect(parsed).toMatchObject({ ok: false, error });
  });

  it("reads only output2 as instrument rows and returns an empty list for a valid empty response", () => {
    const parsed = parseKisUsConditionResponse({
      status: 200,
      contentType: "application/json; charset=utf-8",
      rawText: JSON.stringify({ output1: { crec: "0", trec: "0" }, output2: [], rt_cd: "0", msg_cd: "MCA00000", msg1: "정상처리 되었습니다." }),
      market: "NAS",
    });
    expect(parsed).toMatchObject({ ok: true, rows: [], diagnostics: { rt_cd: "0", msg_cd: "MCA00000" } });
  });

  it("does not treat the output1 summary object as a stock row", () => {
    const parsed = parseKisUsConditionResponse({
      status: 200,
      contentType: "application/json",
      rawText: JSON.stringify({ output1: { name: "summary", crec: "1" }, rt_cd: "0" }),
      market: "NAS",
    });
    expect(parsed.rows).toEqual([]);
  });

  it("rejects a success-shaped payload that omits the documented output2 array", () => {
    expect(parseKisUsConditionResponse({
      status: 200,
      contentType: "application/json",
      rawText: JSON.stringify({ output1: { crec: "0" }, rt_cd: "0", msg_cd: "MCA00000" }),
      market: "NAS",
    })).toMatchObject({ ok: false, error: "KIS_INVALID_RESPONSE_SHAPE", rows: [], raw: null });
  });

  it("rejects output2 entries that do not match the documented row-object shape", () => {
    expect(parseKisUsConditionResponse({
      status: 200,
      contentType: "application/json",
      rawText: JSON.stringify({ output1: { crec: "1" }, output2: [null], rt_cd: "0", msg_cd: "MCA00000" }),
      market: "NAS",
    })).toMatchObject({ ok: false, error: "KIS_INVALID_RESPONSE_SHAPE", rows: [], raw: null });
  });

  it("rejects HTML and malformed JSON without returning provider body content", () => {
    expect(parseKisUsConditionResponse({ status: 504, contentType: "text/html", rawText: "private proxy page", market: "NAS" })).toMatchObject({ ok: false, error: "KIS_NON_JSON_RESPONSE", rows: [], raw: null });
    expect(parseKisUsConditionResponse({ status: 200, contentType: "application/json", rawText: "{broken", market: "NAS" })).toMatchObject({ ok: false, error: "KIS_INVALID_JSON_RESPONSE", rows: [], raw: null });
  });

  it("fails closed against the active official common-stock universe before returning rows", async () => {
    mocks.query.mockResolvedValue({ rows: [{ code: "AAA" }] });
    const providerRows = [
      { symb: "aaa", excd: "NAS", name: "Alpha" },
      { symb: "AAA", excd: "NAS", name: "duplicate row" },
      { symb: "BBB", excd: "NAS", name: "Fund" },
      { symb: "CCC", excd: "NYS", name: "Wrong exchange" },
      { symb: "DDD", name: "Missing exchange" },
      { name: "Unknown code" },
    ];
    const filtered = await filterKisUsConditionRows("NAS", providerRows);
    expect(filtered).toEqual({ rows: [providerRows[0]], requestedCount: 6, eligibleCount: 1, excludedCount: 5 });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0][1]).toEqual(["NAS", ["AAA", "BBB"]]);
  });

  it("does not query the database when no usable ticker can be identified", async () => {
    const filtered = await filterKisUsConditionRows("NAS", [{ name: "missing ticker" }, { symb: "X", excd: "AMS" }]);
    expect(filtered).toEqual({ rows: [], requestedCount: 2, eligibleCount: 0, excludedCount: 2 });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("uses one token lookup and refreshes once after an expired-token response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ rt_cd: "1", msg_cd: "EGW00123", msg1: "expired" }), { status: 401, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output1: { crec: "0" }, output2: [], rt_cd: "0", msg_cd: "MCA00000", msg1: "OK" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }));
    vi.stubGlobal("fetch", fetchMock);
    const parsed = parseKisUsConditionQuery(new URLSearchParams("market=AMS&CO_YN_VOLUME=1&CO_ST_VOLUME=1000"));
    if (!parsed.ok) throw new Error("unexpected invalid query");

    const result = await fetchKisUsConditionSearch(parsed.value);
    expect(result).toMatchObject({ ok: true, market: "AMS", rows: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(new URL(url).searchParams.get("EXCD")).toBe("AMS");
    expect(new URL(url).searchParams.get("KEYB")).toBe("");
    expect(new URL(url).searchParams.get("CO_ST_VOLUME")).toBe("1000");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer renewed-token");
  });
});
