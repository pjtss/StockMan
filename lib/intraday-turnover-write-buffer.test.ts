import { describe, expect, it } from "vitest";
import { INTRADAY_TURNOVER_BUFFER_POLICY, IntradayTurnoverWriteBuffer } from "./intraday-turnover-write-buffer";
import type { IntradayTurnoverObservation } from "./intraday-turnover-repository";

function observation(code: string, bucketMinute = 0): IntradayTurnoverObservation {
  return {
    market: "NAS", code, sessionDate: "2026-09-25",
    bucketAt: new Date(Date.UTC(2026, 8, 25, 5, bucketMinute)),
    observedAt: new Date("2026-09-25T05:01:10.000Z"), currency: "USD",
    price: 10, volume: 5, sourceTradingValue: 50, minuteTradingValue: 50,
    minuteTradingValueSource: "PRICE_VOLUME_FALLBACK",
    marketCap: 1000, rollingTradingValue: 50, turnoverRatio: 0.05, sourcePayload: {},
  };
}

describe("intraday turnover write buffer", () => {
  it("deduplicates a minute bucket and preserves only its latest observation", () => {
    const buffer = new IntradayTurnoverWriteBuffer();
    const first = observation("ABC");
    const updated = { ...first, minuteTradingValue: 75 };

    buffer.enqueue([first], 1000);
    buffer.enqueue([updated], 2000);

    expect(buffer.batch(2000)).toEqual([updated]);
    expect(buffer.snapshot().pendingCount).toBe(1);
  });

  it("keeps a failed write pending with bounded exponential retry delay", () => {
    const buffer = new IntradayTurnoverWriteBuffer();
    buffer.enqueue([observation("ABC")], 5000);

    expect(buffer.shouldRetry(5000)).toBe(true);
    expect(buffer.markFailure(5000)).toBe(1000);
    expect(buffer.shouldRetry(5999)).toBe(false);
    expect(buffer.shouldRetry(6000)).toBe(true);
    expect(buffer.markFailure(6000)).toBe(2000);
    expect(buffer.markFailure(8000)).toBe(4000);
    expect(buffer.snapshot().pendingCount).toBe(1);
  });

  it("acknowledges persisted rows and resets backoff once the queue drains", () => {
    const buffer = new IntradayTurnoverWriteBuffer();
    const row = observation("ABC");
    buffer.enqueue([row], 100);
    buffer.markFailure(100);

    expect(buffer.acknowledge([row])).toBe(0);
    expect(buffer.snapshot()).toMatchObject({ pendingCount: 0, retryAt: 0, consecutiveFailures: 0 });
  });

  it("expires stale entries and caps memory with oldest-first eviction", () => {
    const buffer = new IntradayTurnoverWriteBuffer();
    const rows = Array.from({ length: INTRADAY_TURNOVER_BUFFER_POLICY.maxEntries + 1 }, (_, index) => observation(`T${index}`));
    buffer.enqueue(rows, 10_000);
    expect(buffer.snapshot()).toMatchObject({ pendingCount: INTRADAY_TURNOVER_BUFFER_POLICY.maxEntries, evictedCount: 1 });
    expect(buffer.batch(10_000 + INTRADAY_TURNOVER_BUFFER_POLICY.ttlMs + 1)).toHaveLength(0);
    expect(buffer.snapshot().evictedCount).toBe(INTRADAY_TURNOVER_BUFFER_POLICY.maxEntries + 1);
  });

  it("does not acknowledge an old value after a newer value replaced the same key", () => {
    const buffer = new IntradayTurnoverWriteBuffer();
    const old = observation("ABC");
    const newer = { ...old, minuteTradingValue: 99 };
    buffer.enqueue([old], 100);
    buffer.enqueue([newer], 200);

    expect(buffer.acknowledge([old])).toBe(1);
    expect(buffer.batch(200)).toEqual([newer]);
  });
});
