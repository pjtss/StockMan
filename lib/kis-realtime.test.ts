import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildKisRealtimeFrame,
  clearKisRealtimeApprovalKeyCacheForTest,
  getKisRealtimeKey,
  getKisRealtimeTrId,
  getKisRealtimeUrl,
  issueKisRealtimeApprovalKey,
  parseKisRealtimeEnvelope,
} from "./kis-realtime";

afterEach(() => {
  clearKisRealtimeApprovalKeyCacheForTest();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("KIS realtime websocket protocol", () => {
  it("builds domestic trade subscription frames", () => {
    const subscription = { market: "KR" as const, channel: "trade" as const, code: "005930" };
    expect(getKisRealtimeTrId(subscription)).toBe("H0STCNT0");
    expect(getKisRealtimeKey(subscription)).toBe("005930");
    expect(JSON.parse(buildKisRealtimeFrame({ approvalKey: "approval", subscription }))).toEqual({
      header: {
        approval_key: "approval",
        custtype: "P",
        tr_type: "1",
        content_type: "utf-8",
      },
      body: { input: { tr_id: "H0STCNT0", tr_key: "005930" } },
    });
  });

  it("builds overseas asking subscription frames with exchange key", () => {
    const subscription = { market: "US" as const, channel: "asking" as const, code: "AAPL", exchange: "NAS" as const };
    expect(getKisRealtimeTrId(subscription)).toBe("HDFSASP0");
    expect(getKisRealtimeKey(subscription)).toBe("NASAAPL");
    expect(JSON.parse(buildKisRealtimeFrame({ approvalKey: "approval", subscription })).body.input).toEqual({
      tr_id: "HDFSASP0",
      tr_key: "NASAAPL",
    });
  });

  it("parses JSON and pipe-delimited envelopes", () => {
    expect(parseKisRealtimeEnvelope(JSON.stringify({ header: { tr_id: "H0STCNT0" }, body: { output: { stck_prpr: "70000" } } }))).toEqual({
      kind: "json",
      header: { tr_id: "H0STCNT0" },
      body: { output: { stck_prpr: "70000" } },
    });

    expect(parseKisRealtimeEnvelope("0|H0STCNT0|001|70000^100|+1")).toEqual({
      kind: "data",
      trId: "H0STCNT0",
      encrypted: false,
      values: ["70000", "100"],
    });
  });

  it("selects production and paper websocket endpoints", () => {
    expect(getKisRealtimeUrl(false)).toBe("wss://ops.koreainvestment.com:21000");
    expect(getKisRealtimeUrl(true)).toBe("wss://ops.koreainvestment.com:31000");
  });

  it("reuses an approval key instead of calling KIS for every chart connection", async () => {
    const fetchMock = vi.fn(async () => Response.json({ approval_key: "approval-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(issueKisRealtimeApprovalKey({ appKey: "key", appSecret: "secret" })).resolves.toBe("approval-1");
    await expect(issueKisRealtimeApprovalKey({ appKey: "key", appSecret: "secret" })).resolves.toBe("approval-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces simultaneous approval requests into one KIS call", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    const first = issueKisRealtimeApprovalKey({ appKey: "key", appSecret: "secret" });
    const second = issueKisRealtimeApprovalKey({ appKey: "key", appSecret: "secret" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(Response.json({ approval_key: "shared-approval" }));
    await expect(Promise.all([first, second])).resolves.toEqual(["shared-approval", "shared-approval"]);
  });

  it("separates production, paper, and rotated credentials in the cache", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => Response.json({ approval_key: `approval-${++callCount}` }));
    vi.stubGlobal("fetch", fetchMock);

    await issueKisRealtimeApprovalKey({ appKey: "key-1", appSecret: "secret", paper: false });
    await issueKisRealtimeApprovalKey({ appKey: "key-1", appSecret: "secret", paper: true });
    await issueKisRealtimeApprovalKey({ appKey: "key-2", appSecret: "secret", paper: false });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refreshes before the official 24-hour key boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T00:00:00Z"));
    let callCount = 0;
    const fetchMock = vi.fn(async () => Response.json({ approval_key: `approval-${++callCount}` }));
    vi.stubGlobal("fetch", fetchMock);

    await issueKisRealtimeApprovalKey({ appKey: "key", appSecret: "secret" });
    vi.advanceTimersByTime(23 * 60 * 60 * 1000 - 1);
    await issueKisRealtimeApprovalKey({ appKey: "key", appSecret: "secret" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    await issueKisRealtimeApprovalKey({ appKey: "key", appSecret: "secret" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed approval responses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ approval_key: "recovered" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(issueKisRealtimeApprovalKey({ appKey: "key", appSecret: "secret" })).resolves.toBeNull();
    await expect(issueKisRealtimeApprovalKey({ appKey: "key", appSecret: "secret" })).resolves.toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
