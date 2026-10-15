import { beforeEach, describe, expect, it } from "vitest";
import { consumeKisRealtimeApprovalLimit, resetKisRealtimeApprovalLimitsForTest } from "./kis-realtime-approval-rate-limit";

describe("KIS realtime approval public rate limit", () => {
  beforeEach(() => resetKisRealtimeApprovalLimitsForTest());

  it("limits one client to 120 valid requests per minute and resets after the window", () => {
    for (let index = 0; index < 120; index += 1) {
      expect(consumeKisRealtimeApprovalLimit("192.0.2.1", 10_000).allowed).toBe(true);
    }
    expect(consumeKisRealtimeApprovalLimit("192.0.2.1", 10_000)).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(consumeKisRealtimeApprovalLimit("192.0.2.1", 70_000).allowed).toBe(true);
  });

  it("isolates clients while enforcing a process-wide ceiling", () => {
    for (let index = 0; index < 120; index += 1) consumeKisRealtimeApprovalLimit("192.0.2.2", 20_000);
    expect(consumeKisRealtimeApprovalLimit("192.0.2.3", 20_000).allowed).toBe(true);

    resetKisRealtimeApprovalLimitsForTest();
    for (let index = 0; index < 1_800; index += 1) {
      expect(consumeKisRealtimeApprovalLimit(`198.51.100.${index}`, 30_000).allowed).toBe(true);
    }
    expect(consumeKisRealtimeApprovalLimit("203.0.113.1", 30_000)).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });
});
