import { beforeEach, describe, expect, it } from "vitest";
import { consumeKisRealtimeEventLimit, resetKisRealtimeEventLimitsForTest } from "./kis-realtime-event-rate-limit";

describe("KIS realtime event public write rate limit", () => {
  beforeEach(() => resetKisRealtimeEventLimitsForTest());

  it("limits one client to 120 events per minute and resets after the window", () => {
    for (let index = 0; index < 120; index += 1) expect(consumeKisRealtimeEventLimit("192.0.2.1", 10_000).allowed).toBe(true);
    expect(consumeKisRealtimeEventLimit("192.0.2.1", 10_000)).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(consumeKisRealtimeEventLimit("192.0.2.1", 70_000).allowed).toBe(true);
  });

  it("isolates clients while enforcing a process-wide ceiling", () => {
    for (let index = 0; index < 120; index += 1) consumeKisRealtimeEventLimit("192.0.2.2", 20_000);
    expect(consumeKisRealtimeEventLimit("192.0.2.3", 20_000).allowed).toBe(true);

    resetKisRealtimeEventLimitsForTest();
    for (let index = 0; index < 1_800; index += 1) expect(consumeKisRealtimeEventLimit(`198.51.100.${index}`, 30_000).allowed).toBe(true);
    expect(consumeKisRealtimeEventLimit("203.0.113.1", 30_000)).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });
});
