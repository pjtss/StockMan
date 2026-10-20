import { describe, expect, it } from "vitest";
import { classifyKisFailure, createKisRequestThrottle } from "@/lib/kis-request-throttle";

describe("KIS failure classification", () => {
  it("classifies rate limit and transient HTTP responses as retryable", () => {
    expect(classifyKisFailure({ response: { status: 429 } })).toBe("RATE_LIMITED");
    expect(classifyKisFailure({ response: { status: 503 } })).toBe("TRANSIENT_HTTP");
  });

  it("distinguishes authentication and permanent errors", () => {
    expect(classifyKisFailure({ response: { status: 401 } })).toBe("AUTH_EXPIRED");
    expect(classifyKisFailure({ response: { status: 400 } })).toBe("PERMANENT");
  });

  it("classifies HTTP 200 business errors from rt_cd", () => {
    expect(classifyKisFailure({ response: { status: 200 }, parsed: { rt_cd: "1", msg_cd: "EGW99999", msg1: "business error" } })).toBe("PERMANENT");
  });

  it("classifies a non-JSON response as a permanent protocol error", () => {
    expect(classifyKisFailure({ response: { status: 200 }, rawText: "<!doctype html>", parsed: null })).toBe("PERMANENT");
  });
});

describe("KIS request scheduling", () => {
  it("reports every actual HTTP attempt so persisted call counts include retries", async () => {
    let now = 1_000;
    const observedAttempts: number[] = [];
    let requests = 0;
    const throttle = createKisRequestThrottle({
      baseIntervalMs: 100,
      retryDelaysMs: [500],
      now: () => now,
      sleep: async (ms) => { now += ms; },
      logRetry: () => undefined,
    });

    await throttle(async () => {
      requests += 1;
      return { response: { status: requests === 1 ? 503 : 200 }, parsed: { rt_cd: "0" } };
    }, undefined, undefined, (attempt) => observedAttempts.push(attempt));

    expect(requests).toBe(2);
    expect(observedAttempts).toEqual([1, 2]);
  });

  it("reports thrown network attempts and applies shared cooldown before retrying", async () => {
    let now = 1_000;
    const observedAttempts: number[] = [];
    const starts: number[] = [];
    let requestCount = 0;
    const throttle = createKisRequestThrottle({
      baseIntervalMs: 100,
      retryDelaysMs: [500],
      now: () => now,
      sleep: async (ms) => { now += ms; },
      onStartReservation: (startedAt) => starts.push(startedAt),
      logRetry: () => undefined,
    });

    await throttle(async () => {
      requestCount += 1;
      if (requestCount === 1) throw new Error("ECONNRESET");
      return { response: { status: 200 }, parsed: { rt_cd: "0" } };
    }, undefined, undefined, (attempt) => observedAttempts.push(attempt));

    expect(requestCount).toBe(2);
    expect(observedAttempts).toEqual([1, 2]);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(500);
  });

  it("paces request starts while allowing bounded in-flight overlap", async () => {
    let now = 1_000;
    let active = 0;
    let maxActive = 0;
    const starts: number[] = [];
    let releaseRequests!: () => void;
    const responseGate = new Promise<void>((resolve) => { releaseRequests = resolve; });
    const throttle = createKisRequestThrottle({
      baseIntervalMs: 25,
      maxInFlight: 3,
      now: () => now,
      sleep: async (ms) => { now += ms; },
      onStartReservation: (startedAt) => starts.push(startedAt),
      logRetry: () => undefined,
    });
    const request = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await responseGate;
      active -= 1;
      return { response: { status: 200 }, parsed: { rt_cd: "0" } };
    };

    const calls = [throttle(request), throttle(request), throttle(request)];
    for (let turn = 0; turn < 100 && (starts.length < 3 || active < 3); turn += 1) await Promise.resolve();

    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(100);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(100);
    expect(maxActive).toBe(3);
    releaseRequests();
    await Promise.all(calls);
  });

  it("does not admit more than the configured in-flight cap", async () => {
    let now = 2_000;
    const starts: number[] = [];
    let releaseRequests!: () => void;
    const responseGate = new Promise<void>((resolve) => { releaseRequests = resolve; });
    const throttle = createKisRequestThrottle({
      baseIntervalMs: 100,
      maxInFlight: 2,
      now: () => now,
      sleep: async (ms) => { now += ms; },
      onStartReservation: (startedAt) => starts.push(startedAt),
      logRetry: () => undefined,
    });
    const request = async () => {
      await responseGate;
      return { response: { status: 200 }, parsed: { rt_cd: "0" } };
    };

    const calls = [throttle(request), throttle(request), throttle(request)];
    for (let turn = 0; turn < 20 && starts.length < 2; turn += 1) await Promise.resolve();
    expect(starts).toHaveLength(2);
    releaseRequests();
    await Promise.all(calls);
    expect(starts).toHaveLength(3);
  });

  it.each([429, 503])("applies a shared cooldown to queued callers after HTTP %i", async (failureStatus) => {
    let now = 1_000;
    const starts: number[] = [];
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const secondGate = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const throttle = createKisRequestThrottle({
      baseIntervalMs: 100,
      maxInFlight: 2,
      maxQueuedRequests: 2,
      retryDelaysMs: [500],
      now: () => now,
      sleep: async (ms) => { now += ms; },
      onStartReservation: (startedAt) => starts.push(startedAt),
      logRetry: () => undefined,
    });
    let firstCalls = 0;
    const first = throttle(async () => {
      firstCalls += 1;
      if (firstCalls === 1) {
        await firstGate;
        return { response: { status: failureStatus } };
      }
      return { response: { status: 200 }, parsed: { rt_cd: "0" } };
    });
    const second = throttle(async () => {
      await secondGate;
      return { response: { status: 200 }, parsed: { rt_cd: "0" } };
    });
    const queued = throttle(async () => ({ response: { status: 200 }, parsed: { rt_cd: "0" } }));

    for (let turn = 0; turn < 100 && starts.length < 2; turn += 1) await Promise.resolve();
    expect(starts).toHaveLength(2);
    const upstreamFailureAt = now;
    releaseFirst();
    for (let turn = 0; turn < 100 && firstCalls < 2; turn += 1) await Promise.resolve();
    releaseSecond();
    await Promise.all([first, second, queued]);

    expect(starts.length).toBeGreaterThanOrEqual(4);
    expect(starts.slice(2).every((startedAt) => startedAt - upstreamFailureAt >= 500)).toBe(true);
  });

  it("applies a shared cooldown to queued callers after a network exception", async () => {
    let now = 1_000;
    const starts: number[] = [];
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    let markRetryLogged!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const secondGate = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const retryLogged = new Promise<void>((resolve) => { markRetryLogged = resolve; });
    const throttle = createKisRequestThrottle({
      baseIntervalMs: 100,
      maxInFlight: 2,
      maxQueuedRequests: 2,
      retryDelaysMs: [500],
      now: () => now,
      sleep: async (ms) => { now += ms; },
      onStartReservation: (startedAt) => starts.push(startedAt),
      logRetry: () => markRetryLogged(),
    });
    let firstCalls = 0;
    const first = throttle(async () => {
      firstCalls += 1;
      if (firstCalls === 1) {
        await firstGate;
        throw new Error("ECONNRESET");
      }
      return { response: { status: 200 }, parsed: { rt_cd: "0" } };
    });
    const second = throttle(async () => {
      await secondGate;
      return { response: { status: 200 }, parsed: { rt_cd: "0" } };
    });
    const queued = throttle(async () => ({ response: { status: 200 }, parsed: { rt_cd: "0" } }));

    for (let turn = 0; turn < 100 && starts.length < 2; turn += 1) await Promise.resolve();
    expect(starts).toHaveLength(2);
    const upstreamFailureAt = now;
    releaseFirst();
    await retryLogged;
    releaseSecond();
    await Promise.all([first, second, queued]);

    expect(starts.length).toBeGreaterThanOrEqual(4);
    expect(starts.slice(2).every((startedAt) => startedAt - upstreamFailureAt >= 500)).toBe(true);
  });

  it("never decreases the configured base interval when adaptive backoff applies", async () => {
    let now = 1_000;
    const starts: number[] = [];
    let requestCount = 0;
    const throttle = createKisRequestThrottle({
      baseIntervalMs: 400,
      maxInFlight: 2,
      retryDelaysMs: [500],
      now: () => now,
      sleep: async (ms) => { now += ms; },
      onStartReservation: (startedAt) => starts.push(startedAt),
      logRetry: () => undefined,
    });

    await throttle(async () => {
      requestCount += 1;
      return { response: { status: requestCount === 1 ? 429 : 200 }, parsed: { rt_cd: "0" } };
    });
    await throttle(async () => ({ response: { status: 200 }, parsed: { rt_cd: "0" } }));

    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(500);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(400);
  });

  it("never schedules an eleventh start inside any rolling second", async () => {
    let now = 5_000;
    const starts: number[] = [];
    let releaseRequests!: () => void;
    const responseGate = new Promise<void>((resolve) => { releaseRequests = resolve; });
    const throttle = createKisRequestThrottle({
      baseIntervalMs: 100,
      maxInFlight: 12,
      now: () => now,
      sleep: async (ms) => { now += ms; },
      onStartReservation: (startedAt) => starts.push(startedAt),
      logRetry: () => undefined,
    });
    const request = async () => {
      await responseGate;
      return { response: { status: 200 }, parsed: { rt_cd: "0" } };
    };
    const calls = Array.from({ length: 12 }, () => throttle(request));
    for (let turn = 0; turn < 200 && starts.length < 12; turn += 1) await Promise.resolve();

    expect(starts).toHaveLength(12);
    for (let index = 0; index + 10 < starts.length; index += 1) {
      expect(starts[index + 10] - starts[index]).toBeGreaterThan(1000);
    }
    releaseRequests();
    await Promise.all(calls);
  });

  it("rejects excess waiters instead of growing the request queue without a bound", async () => {
    let now = 10_000;
    let releaseRequests!: () => void;
    const responseGate = new Promise<void>((resolve) => { releaseRequests = resolve; });
    const throttle = createKisRequestThrottle({
      baseIntervalMs: 100,
      maxInFlight: 1,
      maxQueuedRequests: 2,
      now: () => now,
      sleep: async (ms) => { now += ms; },
      logRetry: () => undefined,
    });
    const request = async () => {
      await responseGate;
      return { response: { status: 200 }, parsed: { rt_cd: "0" } };
    };

    const active = throttle(request);
    const waiters = [throttle(request), throttle(request)];
    await expect(throttle(request)).rejects.toThrow("KIS_REQUEST_QUEUE_FULL");
    releaseRequests();
    await Promise.all([active, ...waiters]);
  });
});
