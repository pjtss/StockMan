import { beforeEach, describe, expect, it } from "vitest";
import { consumeKisRealtimeApprovalLimit, getKisRealtimeApprovalRateLimitMetrics, resetKisRealtimeApprovalLimitsForTest } from "./kis-realtime-approval-rate-limit";

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

  it("records only aggregate per-minute outcomes and retry-after buckets without client identifiers", () => {
    for (let index = 0; index < 120; index += 1) consumeKisRealtimeApprovalLimit("192.0.2.private", 60_000);
    consumeKisRealtimeApprovalLimit("192.0.2.private", 60_000);
    const metrics = getKisRealtimeApprovalRateLimitMetrics(60_000);
    expect(metrics.totals).toMatchObject({ accepted: 120, rejectedClient: 1, rejectedGlobal: 0, retryAfter31To60: 1 });
    expect(metrics.minutes).toHaveLength(60);
    expect(JSON.stringify(metrics)).not.toContain("192.0.2.private");
    expect(metrics.policy).toEqual({ windowSeconds: 60, perClientLimit: 120, globalLimit: 1_800 });
  });

  it("retains only the latest 60 minutes of aggregate metrics", () => {
    consumeKisRealtimeApprovalLimit("192.0.2.10", 0);
    consumeKisRealtimeApprovalLimit("192.0.2.11", 3_600_000);
    const metrics = getKisRealtimeApprovalRateLimitMetrics(3_600_000);
    expect(metrics.totals.accepted).toBe(1);
    expect(metrics.minutes[0].minute).toBe(new Date(60_000).toISOString());
    expect(metrics.minutes.at(-1)?.minute).toBe(new Date(3_600_000).toISOString());
  });
});
