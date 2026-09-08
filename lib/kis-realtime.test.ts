import { describe, expect, it } from "vitest";
import {
  buildKisRealtimeFrame,
  getKisRealtimeKey,
  getKisRealtimeTrId,
  getKisRealtimeUrl,
  parseKisRealtimeEnvelope,
} from "./kis-realtime";

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
});
